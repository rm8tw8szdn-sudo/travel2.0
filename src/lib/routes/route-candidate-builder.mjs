import {
  ROUTE_CANDIDATE_SCHEMA_VERSION,
  normalizeRouteCandidate,
  validateRouteCandidate,
} from "./route-candidate-pool.mjs";
import { annotateKnowledgeEntity } from "./knowledge-entity-normalizer.mjs";
import { cleanString, stableHash, uniqueStrings as unique } from "./route-v2-utils.mjs";

export const ROUTE_CANDIDATE_BUILDER_DEFAULT_TARGET = 8;
export const ROUTE_CANDIDATE_BUILDER_MIN_TARGET = 3;
export const ROUTE_CANDIDATE_BUILDER_MAX_TARGET = 12;
export const ROUTE_CANDIDATE_BUILDER_SOURCE = "route-v2-phase2b1-kg-pool-builder";
export const ROUTE_CANDIDATE_BUILDER_CREATED_AT = "1970-01-01T00:00:00.000Z";

function numericOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizeCode(value) {
  return cleanString(value).toUpperCase();
}

function normalizeDestination(destination = {}) {
  const annotated = annotateKnowledgeEntity(destination);
  const id = cleanString(destination.id || destination.wikidataId || destination.qid || destination.name);
  const name = cleanString(destination.name || destination.label || destination.title);
  const countryCode = normalizeCode(destination.countryCode || destination.country || destination.iso2);
  if (!id || !name || !countryCode) return null;
  return {
    id,
    wikidataId: cleanString(destination.wikidataId || destination.qid || id),
    name,
    countryCode,
    latitude: numericOrNull(destination.latitude ?? destination.lat),
    longitude: numericOrNull(destination.longitude ?? destination.lon ?? destination.lng),
    entityTypeName: cleanString(destination.entityTypeName || destination.type || "destination"),
    entitySourceType: annotated.entitySourceType,
    provenance: annotated.provenance,
    confidence: annotated.confidence,
    trustedForFact: annotated.trustedForFact,
  };
}

function destinationIdentity(destination = {}) {
  return cleanString(destination.id || destination.wikidataId || destination.name);
}

function dedupeDestinations(destinations = []) {
  const seen = new Set();
  const deduped = [];
  for (const destination of destinations.map(normalizeDestination).filter(Boolean)) {
    const key = `${destination.countryCode}:${destinationIdentity(destination)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(destination);
  }
  return deduped;
}

function deterministicRotate(items = [], offset = 0) {
  if (!items.length) return [];
  const normalizedOffset = ((offset % items.length) + items.length) % items.length;
  return [...items.slice(normalizedOffset), ...items.slice(0, normalizedOffset)];
}

function stableSortDestinations(destinations = [], seed = "") {
  return [...destinations].sort((left, right) => {
    const leftScore = stableHash([seed, left.countryCode, left.id, left.name]).slice(0, 16);
    const rightScore = stableHash([seed, right.countryCode, right.id, right.name]).slice(0, 16);
    return leftScore.localeCompare(rightScore) || left.name.localeCompare(right.name);
  });
}

function interleaveByCountry(destinations = []) {
  const groups = new Map();
  for (const destination of destinations) {
    const group = groups.get(destination.countryCode) || [];
    group.push(destination);
    groups.set(destination.countryCode, group);
  }
  const codes = [...groups.keys()].sort();
  const result = [];
  let index = 0;
  while (result.length < destinations.length) {
    let added = false;
    for (const code of codes) {
      const destination = groups.get(code)?.[index];
      if (destination) {
        result.push(destination);
        added = true;
      }
    }
    if (!added) break;
    index += 1;
  }
  return result;
}

function maxDestinationsForDuration(durationDays) {
  const days = Number(durationDays);
  if (!Number.isFinite(days) || days <= 0) return 4;
  if (days <= 3) return 2;
  if (days <= 6) return 3;
  if (days <= 10) return 4;
  if (days <= 14) return 5;
  return 6;
}

function deriveDurationDays(context = {}, concept = {}) {
  const direct = Number(context.durationDays ?? concept.durationDays ?? context.days ?? concept.days);
  if (Number.isFinite(direct) && direct > 0) return direct;
  const band = cleanString(context.durationBand || concept.durationBand);
  const bandMatch = band.match(/(\d+)\s*[-~]\s*(\d+)/u);
  if (bandMatch) return Math.round((Number(bandMatch[1]) + Number(bandMatch[2])) / 2);
  const firstNumber = band.match(/\d+/u);
  return firstNumber ? Number(firstNumber[0]) : 7;
}

function deriveTravelStyle(context = {}, concept = {}) {
  return cleanString(context.travelStyle || concept.travelStyle || context.style || concept.style || "classic-first-trip");
}

function deriveIntentId(context = {}, concept = {}, pool = []) {
  return cleanString(context.intentId || concept.intentId) || `intent-${stableHash({
    context: {
      countries: context.countries,
      countryCodes: context.countryCodes,
      durationDays: context.durationDays,
      durationBand: context.durationBand,
      travelStyle: context.travelStyle,
      theme: context.theme,
      season: context.season,
    },
    concept: {
      key: concept.key,
      id: concept.id,
      durationDays: concept.durationDays,
      durationBand: concept.durationBand,
      travelStyle: concept.travelStyle,
    },
    pool: pool.map((item) => [item.countryCode, item.id]),
  }).slice(0, 20)}`;
}

function pairwiseDistanceKm(left = {}, right = {}) {
  if (!Number.isFinite(left.latitude) || !Number.isFinite(left.longitude)) return null;
  if (!Number.isFinite(right.latitude) || !Number.isFinite(right.longitude)) return null;
  const radians = (degrees) => degrees * Math.PI / 180;
  const earthRadiusKm = 6371;
  const dLat = radians(right.latitude - left.latitude);
  const dLon = radians(right.longitude - left.longitude);
  const lat1 = radians(left.latitude);
  const lat2 = radians(right.latitude);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return Math.round(earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

function routeDistanceSummary(destinations = []) {
  const segments = [];
  for (let index = 1; index < destinations.length; index += 1) {
    const distance = pairwiseDistanceKm(destinations[index - 1], destinations[index]);
    if (distance != null) segments.push(distance);
  }
  return {
    segmentCount: segments.length,
    totalKm: segments.reduce((sum, distance) => sum + distance, 0),
    maxSegmentKm: segments.length ? Math.max(...segments) : null,
  };
}

function buildOrder(destinations = []) {
  return destinations.map((destination) => destination.id).filter(Boolean);
}

export function clampCandidateTarget(value = ROUTE_CANDIDATE_BUILDER_DEFAULT_TARGET) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return ROUTE_CANDIDATE_BUILDER_DEFAULT_TARGET;
  return Math.max(ROUTE_CANDIDATE_BUILDER_MIN_TARGET, Math.min(ROUTE_CANDIDATE_BUILDER_MAX_TARGET, Math.floor(parsed)));
}

export function candidateShapeKey(candidate = {}) {
  const destinations = Array.isArray(candidate.destinations) ? candidate.destinations : [];
  const destinationIds = destinations.map(destinationIdentity).filter(Boolean);
  const order = Array.isArray(candidate.proposedOrder) ? candidate.proposedOrder.map(cleanString).filter(Boolean) : [];
  return stableHash({
    countries: unique(candidate.countries || destinations.map((item) => item.countryCode)).map(normalizeCode).sort(),
    destinationIds,
    proposedOrder: order,
  });
}

export function candidateHasMeaningfulDifference(left = {}, right = {}) {
  if (candidateShapeKey(left) === candidateShapeKey(right)) return false;
  const leftDestinations = Array.isArray(left.destinations) ? left.destinations : [];
  const rightDestinations = Array.isArray(right.destinations) ? right.destinations : [];
  const leftSet = new Set(leftDestinations.map(destinationIdentity).filter(Boolean));
  const rightSet = new Set(rightDestinations.map(destinationIdentity).filter(Boolean));
  if (leftSet.size !== rightSet.size) return true;
  for (const id of leftSet) {
    if (!rightSet.has(id)) return true;
  }
  const leftOrder = (left.proposedOrder || []).map(cleanString).filter(Boolean);
  const rightOrder = (right.proposedOrder || []).map(cleanString).filter(Boolean);
  if (leftSet.size <= 2 && rightSet.size <= 2) return false;
  if (leftOrder[0] !== rightOrder[0] || leftOrder.at(-1) !== rightOrder.at(-1)) return true;
  const leftDistance = routeDistanceSummary(leftDestinations);
  const rightDistance = routeDistanceSummary(rightDestinations);
  return Math.abs((leftDistance.totalKm || 0) - (rightDistance.totalKm || 0)) > 1
    || Math.abs((leftDistance.maxSegmentKm || 0) - (rightDistance.maxSegmentKm || 0)) > 1;
}

function supportingSignal(type, value) {
  return { type, value };
}

function unknown(field, reason) {
  return { field, reason };
}

function candidateDraft({ destinations, intentId, durationDays, travelStyle, method, seed, poolSize }) {
  const normalizedDestinations = dedupeDestinations(destinations);
  if (normalizedDestinations.length < 2) return null;
  const countries = unique(normalizedDestinations.map((item) => item.countryCode)).map(normalizeCode);
  const order = buildOrder(normalizedDestinations);
  return {
    intentId,
    countries,
    destinations: normalizedDestinations,
    proposedOrder: order,
    durationDays,
    travelStyle,
    generationSource: ROUTE_CANDIDATE_BUILDER_SOURCE,
    supportingSignals: [
      supportingSignal("kg-destination-pool", { poolSize }),
      supportingSignal("candidate-builder-method", method),
      supportingSignal("candidate-builder-seed", cleanString(seed)),
      supportingSignal("destination-count", normalizedDestinations.length),
      supportingSignal("country-count", countries.length),
      supportingSignal("entity-source-types", unique(normalizedDestinations.map((item) => item.entitySourceType)).filter(Boolean).sort()),
      supportingSignal("durationDays", durationDays),
      supportingSignal("travelStyle", travelStyle),
    ],
    status: "generated",
    rejectionReasons: [],
    unknowns: [
      unknown("candidateComparison", "Phase 2B-1 builds independent candidates only; it does not select, reject, score, or rank candidates."),
      unknown("externalEvidence", "Phase 2B-1 does not call Tavily, Wikivoyage, LLM, or other external evidence providers."),
    ],
    createdAt: ROUTE_CANDIDATE_BUILDER_CREATED_AT,
    version: ROUTE_CANDIDATE_SCHEMA_VERSION,
  };
}

function candidateSequences(pool = [], maxDestinations = 4, seed = "") {
  const stablePool = stableSortDestinations(pool, seed);
  const offsetSeed = parseInt(stableHash(["offset", seed, stablePool.map((item) => item.id)]).slice(0, 8), 16);
  const rotatedOne = deterministicRotate(stablePool, offsetSeed || 1);
  const rotatedTwo = deterministicRotate(stablePool, (offsetSeed % Math.max(stablePool.length, 1)) + 2);
  const countryBalanced = interleaveByCountry(stablePool);
  const typeSorted = [...stablePool].sort((left, right) => (
    left.entityTypeName.localeCompare(right.entityTypeName)
      || left.countryCode.localeCompare(right.countryCode)
      || left.name.localeCompare(right.name)
  ));
  const nameSorted = [...stablePool].sort((left, right) => left.name.localeCompare(right.name));
  const longCount = Math.min(maxDestinations + 1, stablePool.length);
  const shortCount = Math.max(2, Math.min(maxDestinations - 1, stablePool.length));

  return [
    { method: "stable-pool-order", destinations: stablePool.slice(0, maxDestinations) },
    { method: "country-balanced-order", destinations: countryBalanced.slice(0, maxDestinations) },
    { method: "seed-rotated-order-a", destinations: rotatedOne.slice(0, maxDestinations) },
    { method: "seed-rotated-order-b", destinations: rotatedTwo.slice(0, maxDestinations) },
    { method: "entity-type-mix", destinations: typeSorted.slice(0, maxDestinations) },
    { method: "name-order", destinations: nameSorted.slice(0, maxDestinations) },
    { method: "short-structure", destinations: stablePool.slice(0, shortCount) },
    { method: "extended-structure", destinations: stablePool.slice(0, longCount) },
    { method: "reverse-structure", destinations: stablePool.slice(0, maxDestinations).reverse() },
    { method: "country-balanced-reverse", destinations: countryBalanced.slice(0, maxDestinations).reverse() },
    { method: "rotated-short-structure", destinations: rotatedOne.slice(0, shortCount) },
    { method: "rotated-extended-structure", destinations: rotatedTwo.slice(0, longCount) },
  ];
}

export function buildRouteCandidatesFromPool({
  context = {},
  concept = {},
  pool = [],
  targetCount = ROUTE_CANDIDATE_BUILDER_DEFAULT_TARGET,
  seed = "",
  createdAt = ROUTE_CANDIDATE_BUILDER_CREATED_AT,
} = {}) {
  const normalizedPool = dedupeDestinations(Array.isArray(pool) ? pool : []);
  if (normalizedPool.length < 2) return [];

  const durationDays = deriveDurationDays(context, concept);
  const travelStyle = deriveTravelStyle(context, concept);
  const intentId = deriveIntentId(context, concept, normalizedPool);
  const requestedTarget = clampCandidateTarget(targetCount);
  const maxDestinations = Math.min(maxDestinationsForDuration(durationDays), normalizedPool.length);
  const sequences = candidateSequences(normalizedPool, maxDestinations, cleanString(seed || context.seed || concept.seed));
  const candidates = [];
  const seenShapes = new Set();

  for (const sequence of sequences) {
    if (candidates.length >= requestedTarget) break;
    const draft = candidateDraft({
      destinations: sequence.destinations,
      intentId,
      durationDays,
      travelStyle,
      method: sequence.method,
      seed,
      poolSize: normalizedPool.length,
    });
    if (!draft) continue;
    const candidate = normalizeRouteCandidate({ ...draft, createdAt }, { now: () => createdAt });
    const validation = validateRouteCandidate(candidate);
    if (!validation.accepted) continue;
    const shapeKey = candidateShapeKey(candidate);
    if (seenShapes.has(shapeKey)) continue;
    if (candidates.some((existing) => !candidateHasMeaningfulDifference(existing, candidate))) continue;
    seenShapes.add(shapeKey);
    candidates.push(candidate);
  }

  return candidates;
}
