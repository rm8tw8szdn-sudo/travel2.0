import fs from "node:fs";
import path from "node:path";
import { envFlag } from "./route-v2-env.mjs";
import { cleanString, stableHash, uniqueStrings as unique } from "./route-v2-utils.mjs";

export const ROUTE_CANDIDATE_SCHEMA_VERSION = "route-generation-v2-phase2a-candidate-v1";
export const ROUTE_CANDIDATE_STATUSES = new Set(["pending", "selected", "rejected", "needs-evidence", "failed"]);
export const ROUTE_CANDIDATE_NEUTRAL_STATUSES = new Set(["pending", "needs-evidence"]);

function clone(value) {
  return structuredClone(value);
}

function normalizedStatus(value) {
  const status = cleanString(value || "pending");
  if (status === "generated") return "pending";
  if (status === "pending-evidence") return "needs-evidence";
  return status;
}

function numericOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizeDestination(destination = {}) {
  const id = cleanString(destination.id || destination.wikidataId || destination.name);
  const name = cleanString(destination.name);
  const countryCode = cleanString(destination.countryCode).toUpperCase();
  const normalized = {
    id,
    wikidataId: cleanString(destination.wikidataId || id),
    name,
    countryCode,
    latitude: numericOrNull(destination.latitude),
    longitude: numericOrNull(destination.longitude),
    entityTypeName: cleanString(destination.entityTypeName || "destination"),
  };
  if (cleanString(destination.entitySourceType)) normalized.entitySourceType = cleanString(destination.entitySourceType);
  if (destination.provenance && typeof destination.provenance === "object") normalized.provenance = { ...destination.provenance };
  if (Number.isFinite(Number(destination.confidence))) normalized.confidence = Number(destination.confidence);
  if (typeof destination.trustedForFact === "boolean") normalized.trustedForFact = destination.trustedForFact;
  return normalized;
}

export function createRouteCandidateId({
  intentId = "",
  countries = [],
  destinations = [],
  proposedOrder = [],
  durationDays = null,
  travelStyle = "",
  generationSource = "",
  version = ROUTE_CANDIDATE_SCHEMA_VERSION,
} = {}) {
  const destinationIds = destinations.map((item) => cleanString(item?.id || item?.wikidataId || item?.name)).filter(Boolean);
  const hash = stableHash({
    intentId: cleanString(intentId),
    countries: unique(countries).map((code) => code.toUpperCase()).sort(),
    destinationIds,
    proposedOrder: proposedOrder.map(cleanString).filter(Boolean),
    durationDays: Number(durationDays) || null,
    travelStyle: cleanString(travelStyle),
    generationSource: cleanString(generationSource),
    version,
  }).slice(0, 20);
  return `rc-${hash}`;
}

export function normalizeRouteCandidate(input = {}, { now = () => new Date().toISOString() } = {}) {
  const destinations = Array.isArray(input.destinations)
    ? input.destinations.map(normalizeDestination)
    : [];
  const countries = unique([
    ...(Array.isArray(input.countries) ? input.countries : []),
    ...destinations.map((item) => item.countryCode),
  ]).map((code) => code.toUpperCase());
  const proposedOrder = Array.isArray(input.proposedOrder) && input.proposedOrder.length
    ? input.proposedOrder.map(cleanString).filter(Boolean)
    : destinations.map((item) => item.id).filter(Boolean);
  const durationDays = Number(input.durationDays);
  const candidateSeed = {
    intentId: input.intentId,
    countries,
    destinations,
    proposedOrder,
    durationDays: Number.isFinite(durationDays) ? durationDays : null,
    travelStyle: input.travelStyle,
    generationSource: input.generationSource,
    version: input.version || ROUTE_CANDIDATE_SCHEMA_VERSION,
  };
  const normalized = {
    candidateId: cleanString(input.candidateId) || createRouteCandidateId(candidateSeed),
    intentId: cleanString(input.intentId),
    countries,
    destinations,
    proposedOrder,
    durationDays: Number.isFinite(durationDays) ? durationDays : null,
    travelStyle: cleanString(input.travelStyle),
    generationSource: cleanString(input.generationSource),
    ...(cleanString(input.initialReason) ? { initialReason: cleanString(input.initialReason) } : {}),
    supportingSignals: Array.isArray(input.supportingSignals) ? input.supportingSignals.map((item) => ({ ...item })) : [],
    status: normalizedStatus(input.status),
    rejectionReasons: Array.isArray(input.rejectionReasons) ? clone(input.rejectionReasons) : [],
    unknowns: Array.isArray(input.unknowns) ? clone(input.unknowns) : [],
    createdAt: cleanString(input.createdAt) || now(),
    version: cleanString(input.version || ROUTE_CANDIDATE_SCHEMA_VERSION),
  };
  if (input.inputIntentSnapshot && typeof input.inputIntentSnapshot === "object") {
    normalized.inputIntentSnapshot = clone(input.inputIntentSnapshot);
  }
  return normalized;
}

export function validateRouteCandidate(candidate = {}) {
  const reasons = [];
  if (!candidate || typeof candidate !== "object") return { accepted: false, reasons: ["candidate-not-object"] };
  if (!cleanString(candidate.candidateId)) reasons.push("candidateId-required");
  if (!cleanString(candidate.intentId)) reasons.push("intentId-required");
  if (!Array.isArray(candidate.countries) || candidate.countries.length === 0) reasons.push("countries-required");
  if (!Array.isArray(candidate.destinations) || candidate.destinations.length < 2) reasons.push("destinations-minimum-two");
  if (!Array.isArray(candidate.proposedOrder) || candidate.proposedOrder.length < 2) reasons.push("proposedOrder-minimum-two");
  if (!Number.isFinite(Number(candidate.durationDays)) || Number(candidate.durationDays) <= 0) reasons.push("durationDays-positive-number-required");
  if (!cleanString(candidate.travelStyle)) reasons.push("travelStyle-required");
  if (!cleanString(candidate.generationSource)) reasons.push("generationSource-required");
  if (!Array.isArray(candidate.supportingSignals)) reasons.push("supportingSignals-array-required");
  if (!Array.isArray(candidate.rejectionReasons)) reasons.push("rejectionReasons-array-required");
  if (!Array.isArray(candidate.unknowns)) reasons.push("unknowns-array-required");
  if (!cleanString(candidate.createdAt)) reasons.push("createdAt-required");
  if (candidate.version !== ROUTE_CANDIDATE_SCHEMA_VERSION) reasons.push("version-unsupported");
  const status = cleanString(candidate.status);
  if (!ROUTE_CANDIDATE_STATUSES.has(status)) reasons.push("status-invalid");
  if (status === "rejected" && (!Array.isArray(candidate.rejectionReasons) || candidate.rejectionReasons.length === 0)) {
    reasons.push("rejected-candidate-reason-required");
  }
  if (status === "failed" && (!Array.isArray(candidate.rejectionReasons) || candidate.rejectionReasons.length === 0)) {
    reasons.push("failed-candidate-reason-required");
  }
  if (candidate.inputIntentSnapshot != null) {
    if (!candidate.inputIntentSnapshot || typeof candidate.inputIntentSnapshot !== "object") {
      reasons.push("inputIntentSnapshot-object-required");
    } else {
      const snapshotIntentId = cleanString(candidate.inputIntentSnapshot.intentId);
      if (!snapshotIntentId) reasons.push("inputIntentSnapshot-intentId-required");
      if (snapshotIntentId && snapshotIntentId !== cleanString(candidate.intentId)) reasons.push("inputIntentSnapshot-intentId-mismatch");
    }
  }

  const forbiddenFinalFields = [
    "name",
    "canonicalTitle",
    "summary",
    "recommendationText",
    "plannerReason",
    "coverAsset",
    "coverUrl",
    "contentQualityStatus",
    "repositoryStatus",
    "acceptedAt",
    "mediaReadyAt",
  ];
  for (const field of forbiddenFinalFields) {
    if (candidate[field] != null) reasons.push(`forbidden-final-field:${field}`);
  }

  const destinationIds = new Set((candidate.destinations || []).flatMap((item) => [
    cleanString(item?.id),
    cleanString(item?.wikidataId),
    cleanString(item?.name),
  ]).filter(Boolean));
  for (const id of candidate.proposedOrder || []) {
    if (!destinationIds.has(cleanString(id))) reasons.push(`proposedOrder-missing-destination:${id}`);
  }
  for (const destination of candidate.destinations || []) {
    if (!cleanString(destination?.id)) reasons.push("destination-id-required");
    if (!cleanString(destination?.name)) reasons.push("destination-name-required");
    if (!cleanString(destination?.countryCode)) reasons.push("destination-countryCode-required");
  }
  const expectedCandidateId = createRouteCandidateId(candidate);
  if (cleanString(candidate.candidateId) && cleanString(candidate.candidateId) !== expectedCandidateId) {
    reasons.push("candidateId-content-mismatch");
  }
  return { accepted: reasons.length === 0, reasons };
}

export function isRouteV2CandidatePoolEnabled(env = process.env) {
  return envFlag(env, "ROUTE_V2_CANDIDATE_POOL_ENABLED", false);
}

export function defaultRouteCandidatePoolPath(env = process.env) {
  return env.ROUTE_V2_CANDIDATE_POOL_PATH || path.resolve(".route-v2-cache", "route-candidate-pool.jsonl");
}

export function createRouteCandidatePoolStore({
  storagePath = defaultRouteCandidatePoolPath(),
  env = process.env,
  now = () => new Date().toISOString(),
} = {}) {
  function enabled() {
    return isRouteV2CandidatePoolEnabled(env);
  }

  function readSnapshot() {
    if (!fs.existsSync(storagePath)) return { records: [], entries: [], diagnostics: [] };
    let payload;
    try {
      payload = fs.readFileSync(storagePath, "utf8");
    } catch (error) {
      const diagnostic = { type: "candidate-read-failed", error: error?.message || String(error) };
      return { records: [], entries: [{ ok: false, index: -1, ...diagnostic }], diagnostics: [diagnostic], readFailed: true };
    }
    const records = [];
    const entries = [];
    const diagnostics = [];
    const seenIds = new Set();
    payload.split(/\r?\n/u).forEach((line, index) => {
      if (!line.trim()) return;
      let candidate;
      try {
        candidate = JSON.parse(line);
      } catch (error) {
        const diagnostic = { type: "candidate-corrupt-json", index, error: error?.message || String(error) };
        diagnostics.push(diagnostic);
        entries.push({ ok: false, index, ...diagnostic });
        return;
      }
      const validation = validateRouteCandidate(candidate);
      if (!validation.accepted) {
        const diagnostic = { type: "candidate-schema-invalid", index, candidateId: cleanString(candidate?.candidateId), reasons: [...validation.reasons] };
        diagnostics.push(diagnostic);
        entries.push({ ok: false, index, candidate: clone(candidate), validation, ...diagnostic });
        return;
      }
      if (seenIds.has(candidate.candidateId)) {
        const diagnostic = { type: "candidate-duplicate", index, candidateId: candidate.candidateId };
        diagnostics.push(diagnostic);
        entries.push({ ok: false, index, candidate: clone(candidate), validation, ...diagnostic });
        return;
      }
      seenIds.add(candidate.candidateId);
      records.push(candidate);
      entries.push({ ok: true, index, candidate: clone(candidate), validation });
    });
    return { records, entries, diagnostics };
  }

  function writeRecords(records) {
    fs.mkdirSync(path.dirname(storagePath), { recursive: true });
    const tempPath = `${storagePath}.${process.pid}.tmp`;
    const payload = records.length ? `${records.map((candidate) => JSON.stringify(candidate)).join("\n")}\n` : "";
    try {
      fs.writeFileSync(tempPath, payload, "utf8");
      fs.renameSync(tempPath, storagePath);
    } finally {
      if (fs.existsSync(tempPath)) fs.rmSync(tempPath, { force: true });
    }
  }

  function validateCandidateSet(candidates) {
    const reasons = [];
    const ids = new Set();
    const selectedByIntent = new Map();
    const snapshotHashesByIntent = new Map();
    for (const candidate of candidates) {
      const validation = validateRouteCandidate(candidate);
      if (!validation.accepted) reasons.push(...validation.reasons.map((reason) => `${candidate.candidateId || "unknown"}:${reason}`));
      if (ids.has(candidate.candidateId)) reasons.push(`duplicate-candidateId:${candidate.candidateId}`);
      ids.add(candidate.candidateId);
      if (candidate.status === "selected") {
        selectedByIntent.set(candidate.intentId, Number(selectedByIntent.get(candidate.intentId) || 0) + 1);
      }
      if (candidate.inputIntentSnapshot) {
        const hashes = snapshotHashesByIntent.get(candidate.intentId) || new Set();
        hashes.add(stableHash(candidate.inputIntentSnapshot));
        snapshotHashesByIntent.set(candidate.intentId, hashes);
      }
    }
    for (const [intentId, count] of selectedByIntent) {
      if (count > 1) reasons.push(`multiple-selected:${intentId}`);
    }
    for (const [intentId, hashes] of snapshotHashesByIntent) {
      if (hashes.size > 1) reasons.push(`intent-snapshot-mismatch:${intentId}`);
    }
    return { accepted: reasons.length === 0, reasons };
  }

  function append(input) {
    if (!enabled()) return { written: false, skipped: true, reason: "candidate-pool-disabled" };
    const candidate = normalizeRouteCandidate(input, { now });
    const validation = validateRouteCandidate(candidate);
    if (!validation.accepted) {
      return { written: false, skipped: false, reason: "candidate-invalid", reasons: validation.reasons };
    }
    try {
      const snapshot = readSnapshot();
      if (snapshot.readFailed) return { written: false, persisted: false, skipped: false, reason: "candidate-read-failed", diagnostics: clone(snapshot.diagnostics) };
      const index = snapshot.records.findIndex((item) => item.candidateId === candidate.candidateId);
      if (index >= 0 && snapshot.records[index].inputIntentSnapshot && candidate.inputIntentSnapshot
        && stableHash(snapshot.records[index].inputIntentSnapshot) !== stableHash(candidate.inputIntentSnapshot)) {
        return { written: false, persisted: false, skipped: false, reason: "candidate-intent-snapshot-conflict" };
      }
      const records = snapshot.records.map((item) => clone(item));
      if (index >= 0) records[index] = candidate;
      else records.push(candidate);
      const setValidation = validateCandidateSet(records);
      if (!setValidation.accepted) {
        return { written: false, persisted: false, skipped: false, reason: "candidate-set-invalid", reasons: setValidation.reasons };
      }
      if (JSON.stringify(records) === JSON.stringify(snapshot.records)) {
        return { written: false, persisted: true, skipped: true, reason: "candidate-unchanged", candidateId: candidate.candidateId, intentId: candidate.intentId, storagePath };
      }
      writeRecords(records);
      return { written: true, persisted: true, updated: index >= 0, candidateId: candidate.candidateId, intentId: candidate.intentId, storagePath };
    } catch (error) {
      return { written: false, persisted: false, skipped: false, reason: "candidate-write-failed", error: error?.message || String(error) };
    }
  }

  function replaceForIntent(intentId, inputs = []) {
    if (!enabled()) return { written: false, persisted: false, skipped: true, reason: "candidate-pool-disabled" };
    const normalizedIntentId = cleanString(intentId);
    const candidates = (Array.isArray(inputs) ? inputs : []).map((input) => normalizeRouteCandidate(input, { now }));
    if (!normalizedIntentId || candidates.some((candidate) => candidate.intentId !== normalizedIntentId)) {
      return { written: false, persisted: false, skipped: false, reason: "candidate-intent-mismatch" };
    }
    const validation = validateCandidateSet(candidates);
    if (!validation.accepted) {
      return { written: false, persisted: false, skipped: false, reason: "candidate-batch-invalid", reasons: validation.reasons };
    }
    try {
      const snapshot = readSnapshot();
      if (snapshot.readFailed) return { written: false, persisted: false, skipped: false, reason: "candidate-read-failed", diagnostics: clone(snapshot.diagnostics) };
      const existingForIntent = snapshot.records.find((candidate) => candidate.intentId === normalizedIntentId && candidate.inputIntentSnapshot);
      const nextWithSnapshot = candidates.find((candidate) => candidate.inputIntentSnapshot);
      if (existingForIntent && nextWithSnapshot
        && stableHash(existingForIntent.inputIntentSnapshot) !== stableHash(nextWithSnapshot.inputIntentSnapshot)) {
        return { written: false, persisted: false, skipped: false, reason: "candidate-intent-snapshot-conflict" };
      }
      const records = [];
      let inserted = false;
      for (const existing of snapshot.records) {
        if (existing.intentId === normalizedIntentId) {
          if (!inserted) {
            records.push(...candidates.map((candidate) => clone(candidate)));
            inserted = true;
          }
          continue;
        }
        records.push(clone(existing));
      }
      if (!inserted) records.push(...candidates.map((candidate) => clone(candidate)));
      if (JSON.stringify(records) === JSON.stringify(snapshot.records)) {
        return {
          written: false,
          persisted: true,
          skipped: true,
          reason: "candidate-batch-unchanged",
          count: candidates.length,
          candidateIds: candidates.map((candidate) => candidate.candidateId),
          diagnostics: clone(snapshot.diagnostics),
        };
      }
      writeRecords(records);
      return {
        written: true,
        persisted: true,
        count: candidates.length,
        candidateIds: candidates.map((candidate) => candidate.candidateId),
        diagnostics: clone(snapshot.diagnostics),
      };
    } catch (error) {
      return { written: false, persisted: false, skipped: false, reason: "candidate-write-failed", error: error?.message || String(error) };
    }
  }

  function readAll() {
    return clone(readSnapshot().entries);
  }

  function listByIntent(intentId) {
    const normalizedIntentId = cleanString(intentId);
    return readSnapshot().records
      .filter((candidate) => candidate.intentId === normalizedIntentId)
      .map((candidate) => clone(candidate));
  }

  return {
    storagePath,
    enabled,
    append,
    replaceForIntent,
    readAll,
    listByIntent,
    diagnostics: () => clone(readSnapshot().diagnostics),
  };
}
