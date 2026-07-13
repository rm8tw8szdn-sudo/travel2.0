import fs from "node:fs";
import path from "node:path";
import { envFlag } from "./route-v2-env.mjs";
import { cleanString, stableHash, uniqueStrings as unique } from "./route-v2-utils.mjs";

export const ROUTE_CANDIDATE_SCHEMA_VERSION = "route-generation-v2-phase2a-candidate-v1";
export const ROUTE_CANDIDATE_NEUTRAL_STATUSES = new Set(["generated", "pending", "pending-evidence"]);

function numericOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizeDestination(destination = {}) {
  const id = cleanString(destination.id || destination.wikidataId || destination.name);
  const name = cleanString(destination.name);
  const countryCode = cleanString(destination.countryCode).toUpperCase();
  return {
    id,
    wikidataId: cleanString(destination.wikidataId || id),
    name,
    countryCode,
    latitude: numericOrNull(destination.latitude),
    longitude: numericOrNull(destination.longitude),
    entityTypeName: cleanString(destination.entityTypeName || "destination"),
  };
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
  return {
    candidateId: cleanString(input.candidateId) || createRouteCandidateId(candidateSeed),
    intentId: cleanString(input.intentId),
    countries,
    destinations,
    proposedOrder,
    durationDays: Number.isFinite(durationDays) ? durationDays : null,
    travelStyle: cleanString(input.travelStyle),
    generationSource: cleanString(input.generationSource),
    supportingSignals: Array.isArray(input.supportingSignals) ? input.supportingSignals.map((item) => ({ ...item })) : [],
    status: cleanString(input.status || "generated"),
    rejectionReasons: Array.isArray(input.rejectionReasons) ? input.rejectionReasons.map((item) => ({ ...item })) : [],
    unknowns: Array.isArray(input.unknowns) ? input.unknowns.map((item) => ({ ...item })) : [],
    createdAt: cleanString(input.createdAt) || now(),
    version: cleanString(input.version || ROUTE_CANDIDATE_SCHEMA_VERSION),
  };
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
  if (!ROUTE_CANDIDATE_NEUTRAL_STATUSES.has(cleanString(candidate.status))) reasons.push("status-must-be-neutral");

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

  function append(input) {
    if (!enabled()) return { written: false, skipped: true, reason: "candidate-pool-disabled" };
    const candidate = normalizeRouteCandidate(input, { now });
    const validation = validateRouteCandidate(candidate);
    if (!validation.accepted) {
      return { written: false, skipped: false, reason: "candidate-invalid", reasons: validation.reasons };
    }
    try {
      fs.mkdirSync(path.dirname(storagePath), { recursive: true });
      fs.appendFileSync(storagePath, `${JSON.stringify(candidate)}\n`, "utf8");
      return { written: true, candidateId: candidate.candidateId, intentId: candidate.intentId, storagePath };
    } catch (error) {
      return { written: false, skipped: false, reason: "candidate-write-failed", error: error?.message || String(error) };
    }
  }

  function readAll() {
    if (!fs.existsSync(storagePath)) return [];
    return fs.readFileSync(storagePath, "utf8")
      .split(/\r?\n/u)
      .filter((line) => line.trim())
      .map((line, index) => {
        try {
          const candidate = JSON.parse(line);
          return { ok: true, index, candidate, validation: validateRouteCandidate(candidate) };
        } catch (error) {
          return { ok: false, index, error: error?.message || String(error), line };
        }
      });
  }

  function listByIntent(intentId) {
    return readAll()
      .filter((item) => item.ok && item.candidate.intentId === intentId)
      .map((item) => item.candidate);
  }

  return {
    storagePath,
    enabled,
    append,
    readAll,
    listByIntent,
  };
}
