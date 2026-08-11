import {
  ROUTE_CANDIDATE_SCHEMA_VERSION,
  normalizeRouteCandidate,
  validateRouteCandidate,
} from "./route-candidate-pool.mjs";
import { annotateKnowledgeEntity } from "./knowledge-entity-normalizer.mjs";
import { cleanString, stableHash, uniqueStrings as unique } from "./route-v2-utils.mjs";
import {
  ROUTE_INTENT_FINGERPRINT_VERSION,
  createRouteIntentFingerprint,
  maxDestinationsForRouteIntentDays,
} from "./route-intent-model.mjs";
import { minimumRouteDestinationCount } from "./route-cardinality-policy.mjs";

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
      countries: unique([
        context.country,
        context.countryCode,
        ...(Array.isArray(context.countries) ? context.countries : []),
        ...(Array.isArray(context.countryCodes) ? context.countryCodes : []),
      ]).map(normalizeCode).sort(),
      cities: unique([
        ...(Array.isArray(context.cities) ? context.cities : []),
        ...(Array.isArray(context.normalizedCities) ? context.normalizedCities : []),
        ...(Array.isArray(context.targetCities) ? context.targetCities : []),
        ...(Array.isArray(context.destinations) ? context.destinations : []),
      ]).map(cleanString),
      requiredDestinationIds: unique(context.requiredDestinationIds || []).map(cleanString),
      destinationOrderMode: cleanString(context.destinationOrderMode),
      durationDays: context.durationDays,
      durationBand: context.durationBand,
      travelStyle: context.travelStyle,
      theme: context.theme,
      season: context.season,
      seasonHardConstraint: Boolean(context.seasonHardConstraint),
      transport: cleanString(context.transport),
      transportPreference: unique(Array.isArray(context.transportPreference) ? context.transportPreference : []).map(cleanString),
      budgetConstraint: context.budgetConstraint ?? context.budget ?? null,
      noveltyTarget: context.noveltyTarget ?? null,
      coverageGoal: context.coverageGoal ?? null,
      exclusions: context.exclusions ?? null,
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
    ...(cleanString(candidate.candidateVariant) ? { candidateVariant: cleanString(candidate.candidateVariant) } : {}),
  });
}

export function candidateHasMeaningfulDifference(left = {}, right = {}) {
  if (cleanString(left.candidateVariant) && cleanString(left.candidateVariant) !== cleanString(right.candidateVariant)) return true;
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

function candidateDraft({
  destinations,
  intentId,
  durationDays,
  travelStyle,
  method,
  seed,
  poolSize,
  requiredConstraint = null,
  routeIntentFingerprint,
  normalizedRouteIntent,
  candidateVariant = "",
  requiredCountryConstraint = null,
}) {
  const normalizedDestinations = dedupeDestinations(destinations);
  if (normalizedDestinations.length < minimumRouteDestinationCount({ normalizedRouteIntent })) return null;
  const countries = unique(normalizedDestinations.map((item) => item.countryCode)).map(normalizeCode);
  const order = buildOrder(normalizedDestinations);
  return {
    intentId,
    countries,
    destinations: normalizedDestinations,
    proposedOrder: order,
    durationDays,
    travelStyle,
    ...(cleanString(candidateVariant) ? { candidateVariant: cleanString(candidateVariant) } : {}),
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
      ...(requiredConstraint?.ids?.length ? [
        supportingSignal("required-destination-constraint", {
          ids: [...requiredConstraint.ids],
          names: [...(requiredConstraint.names || [])],
          orderMode: requiredConstraint.orderMode,
        }),
      ] : []),
      ...(requiredCountryConstraint?.codes?.length ? [
        supportingSignal("required-country-constraint", {
          codes: [...requiredCountryConstraint.codes],
          orderMode: requiredCountryConstraint.orderMode,
        }),
      ] : []),
    ],
    status: "pending",
    rejectionReasons: [],
    unknowns: [
      unknown("candidateComparison", "Candidate is pending deterministic selection; no evidence-backed score is available in Phase 1."),
      unknown("externalEvidence", "Phase 2B-1 does not call Tavily, Wikivoyage, LLM, or other external evidence providers."),
    ],
    routeIntentFingerprint,
    routeIntentFingerprintVersion: ROUTE_INTENT_FINGERPRINT_VERSION,
    normalizedRouteIntent,
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

function destinationKeys(destination = {}) {
  return unique([
    destination.id,
    destination.wikidataId,
    destination.qid,
    destination.name,
  ]).map(cleanString);
}

function resolveRequiredDestinations(context = {}, pool = []) {
  const ids = unique(context.requiredDestinationIds || []).map(cleanString);
  if (!ids.length) return { ids: [], names: [], destinations: [], missingIds: [], orderMode: "unspecified", preferredBridgeInsertions: [] };
  const poolByKey = new Map();
  for (const destination of pool) {
    for (const key of destinationKeys(destination)) if (!poolByKey.has(key)) poolByKey.set(key, destination);
  }
  const destinations = [];
  const missingIds = [];
  for (const id of ids) {
    const destination = poolByKey.get(id);
    if (destination) destinations.push(destination);
    else missingIds.push(id);
  }
  return {
    ids,
    names: unique(context.requiredDestinationNames || []).map(cleanString),
    destinations,
    missingIds,
    orderMode: cleanString(context.destinationOrderMode) === "fixed" ? "fixed" : "flexible",
    preferredBridgeInsertions: (Array.isArray(context.preferredEvidenceBridgeInsertions) ? context.preferredEvidenceBridgeInsertions : [])
      .map((entry) => ({
        destinationId: cleanString(entry?.destinationId),
        insertionIndex: Number(entry?.insertionIndex),
      }))
      .filter((entry) => entry.destinationId && Number.isInteger(entry.insertionIndex)),
  };
}

function requiredCandidateSequences(pool, maxDestinations, seed, requiredConstraint) {
  const required = dedupeDestinations(requiredConstraint.destinations);
  void pool;
  void maxDestinations;
  if (requiredConstraint.orderMode === "fixed") {
    return [
      { method: "required-fixed-order-balanced", candidateVariant: "balanced", destinations: required },
      { method: "required-fixed-order-low-transfer", candidateVariant: "low-transfer", destinations: required },
      { method: "required-fixed-order-depth", candidateVariant: "depth", destinations: required },
    ];
  }
  const stableRequired = stableSortDestinations(required, `${seed}:required`);
  if (required.length === 2) {
    return [
      { method: "required-flexible-balanced", candidateVariant: "balanced", destinations: required },
      { method: "required-flexible-low-transfer", candidateVariant: "low-transfer", destinations: stableRequired },
      { method: "required-flexible-depth", candidateVariant: "depth", destinations: [...required].reverse() },
    ];
  }
  const orders = [
    required,
    stableRequired,
    deterministicRotate(required, 1),
    deterministicRotate(required, 2),
    [...required].reverse(),
  ];
  return [
    { method: "required-flexible-input-order", destinations: required },
    ...orders.map((order, index) => ({
      method: `required-flexible-order-${index + 1}`,
      destinations: order,
    })),
  ];
}

function resolveRequiredCountries(context = {}, pool = []) {
  const codes = unique(context.requiredCountryCodes || []).map(normalizeCode).filter(Boolean);
  const available = new Set(pool.map((destination) => normalizeCode(destination.countryCode)).filter(Boolean));
  return {
    codes,
    missingCodes: codes.filter((code) => !available.has(code)),
    orderMode: cleanString(context.countryOrderMode || context.destinationOrderMode) === "fixed" ? "fixed" : "flexible",
  };
}

function requiredCountryCandidateSequences(pool, maxDestinations, seed, constraint) {
  const grouped = new Map(constraint.codes.map((code) => [
    code,
    stableSortDestinations(
      pool.filter((destination) => normalizeCode(destination.countryCode) === code),
      `${seed}:required-country:${code}`,
    ),
  ]));
  if ([...grouped.values()].some((destinations) => destinations.length === 0)) return [];

  function groupedSequence(countryOrder, variantIndex) {
    const rotatedGroups = new Map(countryOrder.map((code) => [
      code,
      deterministicRotate(grouped.get(code), variantIndex),
    ]));
    const counts = new Map(countryOrder.map((code) => [code, 1]));
    let remaining = Math.max(0, maxDestinations - countryOrder.length);
    while (remaining > 0) {
      let added = false;
      for (const code of countryOrder) {
        const nextCount = Number(counts.get(code) || 0) + 1;
        if (nextCount > rotatedGroups.get(code).length) continue;
        counts.set(code, nextCount);
        remaining -= 1;
        added = true;
        if (remaining === 0) break;
      }
      if (!added) break;
    }
    return countryOrder.flatMap((code) => rotatedGroups.get(code).slice(0, counts.get(code)));
  }

  const inputOrder = [...constraint.codes];
  const reverseOrder = [...constraint.codes].reverse();
  return [
    { method: "required-country-balanced", candidateVariant: "balanced", destinations: groupedSequence(inputOrder, 0) },
    {
      method: "required-country-low-transfer",
      candidateVariant: "low-transfer",
      destinations: groupedSequence(constraint.orderMode === "fixed" ? inputOrder : reverseOrder, 1),
    },
    { method: "required-country-depth", candidateVariant: "depth", destinations: groupedSequence(inputOrder, 2) },
  ];
}

function citywalkCandidateSequences(pool, seed, requiredConstraint) {
  const city = dedupeDestinations(requiredConstraint.destinations)[0];
  if (!city) return [];
  void pool;
  void seed;
  return [
    { method: "single-city-balanced", candidateVariant: "balanced", destinations: [city] },
    { method: "single-city-low-transfer", candidateVariant: "low-transfer", destinations: [city] },
    { method: "single-city-depth", candidateVariant: "depth", destinations: [city] },
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
  if (normalizedPool.length < minimumRouteDestinationCount(context)) return [];

  const durationDays = deriveDurationDays(context, concept);
  const travelStyle = deriveTravelStyle(context, concept);
  const intentId = deriveIntentId(context, concept, normalizedPool);
  const requestedTarget = clampCandidateTarget(targetCount);
  const citywalkReference = cleanString(context.routeReferenceMode) === "citywalk";
  const requestedMaxDestinations = Number(context.candidateMaxDestinationCount);
  const plannerDestinationCap = Number.isInteger(requestedMaxDestinations) && requestedMaxDestinations >= minimumRouteDestinationCount(context)
    ? requestedMaxDestinations
    : normalizedPool.length;
  const maxDestinations = citywalkReference
    ? normalizedPool.length
    : Math.min(
        maxDestinationsForRouteIntentDays(durationDays) || 4,
        plannerDestinationCap,
        normalizedPool.length,
      );
  const candidateSeed = cleanString(seed || context.seed || concept.seed);
  const requiredConstraint = resolveRequiredDestinations(context, normalizedPool);
  if (requiredConstraint.missingIds.length) return [];
  const requiredCountryConstraint = resolveRequiredCountries(context, normalizedPool);
  if (requiredCountryConstraint.missingCodes.length) return [];
  const sequences = citywalkReference
    ? citywalkCandidateSequences(normalizedPool, candidateSeed, requiredConstraint)
    : requiredConstraint.ids.length
    ? requiredCandidateSequences(normalizedPool, maxDestinations, candidateSeed, requiredConstraint)
    : requiredCountryConstraint.codes.length > 1
      ? requiredCountryCandidateSequences(normalizedPool, maxDestinations, candidateSeed, requiredCountryConstraint)
    : normalizedPool.length === 2
      ? [
          { method: "two-destination-balanced", candidateVariant: "balanced", destinations: normalizedPool },
          { method: "two-destination-low-transfer", candidateVariant: "low-transfer", destinations: stableSortDestinations(normalizedPool, `${candidateSeed}:two-destination`) },
          { method: "two-destination-depth", candidateVariant: "depth", destinations: [...normalizedPool].reverse() },
        ]
    : candidateSequences(normalizedPool, maxDestinations, candidateSeed);
  const candidates = [];
  const seenShapes = new Set();
  const routeIntentFingerprint = createRouteIntentFingerprint(context.normalizedRouteIntent || context);

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
      requiredConstraint,
      routeIntentFingerprint: routeIntentFingerprint.value,
      normalizedRouteIntent: routeIntentFingerprint.normalizedIntent,
      candidateVariant: sequence.candidateVariant,
      requiredCountryConstraint,
    });
    if (!draft) continue;
    const candidate = normalizeRouteCandidate({ ...draft, createdAt }, { now: () => createdAt });
    const validation = validateRouteCandidate(candidate, { requireIntentSnapshot: false });
    if (!validation.accepted) continue;
    const shapeKey = candidateShapeKey(candidate);
    if (seenShapes.has(shapeKey)) continue;
    if (candidates.some((existing) => !candidateHasMeaningfulDifference(existing, candidate))) continue;
    seenShapes.add(shapeKey);
    candidates.push(candidate);
  }

  return candidates;
}
