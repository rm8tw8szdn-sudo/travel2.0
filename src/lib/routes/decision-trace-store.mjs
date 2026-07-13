import fs from "node:fs";
import path from "node:path";
import { buildLegacyDecisionTrace, validateDecisionTrace } from "./decision-trace-schema.mjs";

export function envFlag(env = process.env, name, defaultValue = false) {
  const raw = env?.[name];
  if (raw == null || raw === "") return defaultValue;
  return ["1", "true", "yes", "on"].includes(String(raw).trim().toLocaleLowerCase("en-US"));
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

  function append(trace) {
    if (!enabled()) return { written: false, skipped: true, reason: "trace-disabled" };
    const validation = validateDecisionTrace(trace);
    if (!validation.accepted) {
      return { written: false, skipped: false, reason: "trace-invalid", missing: validation.missing };
    }
    try {
      fs.mkdirSync(path.dirname(storagePath), { recursive: true });
      fs.appendFileSync(storagePath, `${JSON.stringify(trace)}\n`, "utf8");
      return { written: true, traceId: trace.traceId, storagePath };
    } catch (error) {
      return { written: false, skipped: false, reason: "trace-write-failed", error: error?.message || String(error) };
    }
  }

  function appendLegacyRouteTrace({ route, context = {}, source = "legacy", concept = null, decisionFactors = [], strategyEffects = [], dataSourcesUsed = [], unknowns = [] } = {}) {
    if (!enabled()) return { written: false, skipped: true, reason: "trace-disabled" };
    try {
      const trace = buildLegacyDecisionTrace({
        route,
        context,
        source,
        concept,
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

  function readAll() {
    if (!fs.existsSync(storagePath)) return [];
    return fs.readFileSync(storagePath, "utf8")
      .split(/\r?\n/u)
      .filter((line) => line.trim())
      .map((line, index) => {
        try {
          return { ok: true, index, trace: JSON.parse(line) };
        } catch (error) {
          return { ok: false, index, error: error?.message || String(error), line };
        }
      });
  }

  return {
    storagePath,
    enabled,
    append,
    appendLegacyRouteTrace,
    readAll,
    isRequiredForAccept: () => isRouteV2TraceRequiredForAccept(env),
  };
}

export async function writeLegacyDecisionTraceSafe(store, input = {}) {
  if (!store?.appendLegacyRouteTrace) return { written: false, skipped: true, reason: "trace-store-missing" };
  return store.appendLegacyRouteTrace(input);
}
