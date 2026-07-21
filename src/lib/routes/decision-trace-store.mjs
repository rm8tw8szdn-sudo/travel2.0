import fs from "node:fs";
import path from "node:path";
import { buildFailureDecisionTrace, buildLegacyDecisionTrace, validateDecisionTrace } from "./decision-trace-schema.mjs";
import { envFlag } from "./route-v2-env.mjs";

export { envFlag } from "./route-v2-env.mjs";

function clone(value) {
  return structuredClone(value);
}

export function isRouteV2TraceEnabled(env = process.env) {
  return envFlag(env, "ROUTE_V2_TRACE_ENABLED", false);
}

export function isRouteV2TraceRequiredForAccept(env = process.env) {
  return envFlag(env, "ROUTE_V2_TRACE_REQUIRED_FOR_ACCEPT", false);
}

export function defaultDecisionTracePath(env = process.env) {
  return env.ROUTE_V2_TRACE_PATH || path.resolve(".route-v2-cache", "decision-traces.jsonl");
}

export function createDecisionTraceStore({
  storagePath = defaultDecisionTracePath(),
  env = process.env,
  now = () => new Date().toISOString(),
} = {}) {
  function enabled() {
    return isRouteV2TraceEnabled(env);
  }

  function readSnapshot() {
    if (!fs.existsSync(storagePath)) return { traces: [], entries: [], diagnostics: [] };
    let payload;
    try {
      payload = fs.readFileSync(storagePath, "utf8");
    } catch (error) {
      const diagnostic = { type: "trace-read-failed", error: error?.message || String(error) };
      return { traces: [], entries: [{ ok: false, index: -1, ...diagnostic }], diagnostics: [diagnostic], readFailed: true };
    }
    const traces = [];
    const entries = [];
    const diagnostics = [];
    const seenIds = new Set();
    payload.split(/\r?\n/u).forEach((line, index) => {
      if (!line.trim()) return;
      let trace;
      try {
        trace = JSON.parse(line);
      } catch (error) {
        const diagnostic = { type: "trace-corrupt-json", index, error: error?.message || String(error) };
        diagnostics.push(diagnostic);
        entries.push({ ok: false, index, ...diagnostic });
        return;
      }
      const validation = validateDecisionTrace(trace);
      if (!validation.accepted) {
        const diagnostic = { type: "trace-schema-invalid", index, traceId: String(trace?.traceId || ""), missing: [...validation.missing] };
        diagnostics.push(diagnostic);
        entries.push({ ok: false, index, trace: clone(trace), validation, ...diagnostic });
        return;
      }
      if (seenIds.has(trace.traceId)) {
        const diagnostic = { type: "trace-duplicate", index, traceId: trace.traceId };
        diagnostics.push(diagnostic);
        entries.push({ ok: false, index, trace: clone(trace), validation, ...diagnostic });
        return;
      }
      seenIds.add(trace.traceId);
      traces.push(trace);
      entries.push({ ok: true, index, trace: clone(trace), validation });
    });
    return { traces, entries, diagnostics };
  }

  function writeTraces(traces) {
    fs.mkdirSync(path.dirname(storagePath), { recursive: true });
    const tempPath = `${storagePath}.${process.pid}.tmp`;
    const payload = traces.length ? `${traces.map((trace) => JSON.stringify(trace)).join("\n")}\n` : "";
    try {
      fs.writeFileSync(tempPath, payload, "utf8");
      fs.renameSync(tempPath, storagePath);
    } finally {
      if (fs.existsSync(tempPath)) fs.rmSync(tempPath, { force: true });
    }
  }

  function append(trace) {
    if (!enabled()) return { written: false, skipped: true, reason: "trace-disabled" };
    const validation = validateDecisionTrace(trace);
    if (!validation.accepted) {
      return { written: false, skipped: false, reason: "trace-invalid", missing: validation.missing };
    }
    try {
      const snapshot = readSnapshot();
      if (snapshot.readFailed) return { written: false, persisted: false, skipped: false, reason: "trace-read-failed", diagnostics: clone(snapshot.diagnostics) };
      const traces = snapshot.traces.map((item) => clone(item));
      const index = traces.findIndex((item) => item.traceId === trace.traceId);
      if (index >= 0) traces[index] = clone(trace);
      else traces.push(clone(trace));
      if (JSON.stringify(traces) === JSON.stringify(snapshot.traces)) {
        return { written: false, persisted: true, skipped: true, reason: "trace-unchanged", traceId: trace.traceId, storagePath };
      }
      writeTraces(traces);
      return { written: true, persisted: true, updated: index >= 0, traceId: trace.traceId, storagePath };
    } catch (error) {
      return { written: false, persisted: false, skipped: false, reason: "trace-write-failed", error: error?.message || String(error) };
    }
  }

  function appendLegacyRouteTrace({ route, context = {}, source = "legacy", concept = null, candidateSelection = null, decisionFactors = [], strategyEffects = [], dataSourcesUsed = [], unknowns = [] } = {}) {
    if (!enabled()) return { written: false, skipped: true, reason: "trace-disabled" };
    try {
      const trace = buildLegacyDecisionTrace({
        route,
        context,
        source,
        concept,
        candidateSelection,
        decisionFactors,
        strategyEffects,
        dataSourcesUsed,
        unknowns,
        timestamp: now(),
      });
      return append(trace);
    } catch (error) {
      return { written: false, skipped: false, reason: "trace-build-failed", error: error?.message || String(error) };
    }
  }

  function appendFailureTrace({ context = {}, intentId = context.intentId || "", candidatePool = [], candidateValidations = [], candidateSelectionMode = "", failureStage = "planner", failureReason = "v2-planner-failed", source = "planner-pipeline", decisionFactors = [], unknowns = [], legacyFallback = true } = {}) {
    if (!enabled()) return { written: false, skipped: true, reason: "trace-disabled" };
    try {
      const trace = buildFailureDecisionTrace({
        context,
        intentId,
        candidatePool,
        candidateValidations,
        candidateSelectionMode,
        failureStage,
        failureReason,
        source,
        decisionFactors,
        unknowns,
        legacyFallback,
        timestamp: now(),
      });
      return append(trace);
    } catch (error) {
      return { written: false, persisted: false, skipped: false, reason: "trace-build-failed", error: error?.message || String(error) };
    }
  }

  function readAll() {
    return clone(readSnapshot().entries);
  }

  return {
    storagePath,
    enabled,
    append,
    appendLegacyRouteTrace,
    appendFailureTrace,
    readAll,
    list: () => readSnapshot().traces.map((trace) => clone(trace)),
    diagnostics: () => clone(readSnapshot().diagnostics),
    isRequiredForAccept: () => isRouteV2TraceRequiredForAccept(env),
  };
}

export async function writeLegacyDecisionTraceSafe(store, input = {}) {
  if (!store?.appendLegacyRouteTrace) return { written: false, skipped: true, reason: "trace-store-missing" };
  try {
    return await store.appendLegacyRouteTrace(input);
  } catch (error) {
    return { written: false, persisted: false, skipped: false, reason: "trace-write-failed", error: error?.message || String(error) };
  }
}

export async function writeFailureDecisionTraceSafe(store, input = {}) {
  if (!store?.appendFailureTrace) return { written: false, skipped: true, reason: "trace-store-missing" };
  try {
    return await store.appendFailureTrace(input);
  } catch (error) {
    return { written: false, persisted: false, skipped: false, reason: "trace-write-failed", error: error?.message || String(error) };
  }
}
