import { normalizeEvidenceBundle } from "./evidence-bundle.mjs";
import { cleanString, uniqueStrings } from "./route-v2-utils.mjs";

export const LOCAL_EVIDENCE_COLLECTOR_SOURCE = "route-v2-phase3b1-local-evidence-collector";
export const LOCAL_EVIDENCE_COLLECTOR_CREATED_AT = "1970-01-01T00:00:00.000Z";

function numericOrNull(value) {
  if (value == null) return null;
  if (typeof value === "string" && value.trim() === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizeCode(value) {
  return cleanString(value).toUpperCase();
}

function destinationId(destination = {}) {
  return cleanString(destination.id || destination.wikidataId || destination.qid || destination.name);
}

function stableDestinationId(destination = {}) {
  return cleanString(destination.stableId || destination.wikidataId || destination.qid);
}

function normalizeDestination(destination = {}) {
  const stableId = cleanString(destination.wikidataId || destination.qid || destination.id);
  return {
    stableId,
    id: destinationId(destination),
    wikidataId: stableId,
    name: cleanString(destination.name || destination.label),
    countryCode: normalizeCode(destination.countryCode || destination.country || destination.iso2),
    latitude: destination.latitude ?? destination.lat,
    longitude: destination.longitude ?? destination.lon ?? destination.lng,
    entityTypeName: cleanString(destination.entityTypeName || destination.type || "destination"),
  };
}

function destinationAliases(destination = {}) {
  return uniqueStrings([
    destination.id,
    destination.wikidataId,
    destination.qid,
  ]);
}

function buildKgIndex(pool = []) {
  const index = new Map();
  for (const raw of Array.isArray(pool) ? pool : []) {
    const destination = normalizeDestination(raw);
    for (const alias of destinationAliases(destination)) {
      if (!index.has(alias)) index.set(alias, destination);
    }
  }
  return index;
}

function coordinateStatus(destination = {}) {
  const latitude = numericOrNull(destination.latitude);
  const longitude = numericOrNull(destination.longitude);
  const missingLatitude = destination.latitude == null || (typeof destination.latitude === "string" && destination.latitude.trim() === "");
  const missingLongitude = destination.longitude == null || (typeof destination.longitude === "string" && destination.longitude.trim() === "");
  if (missingLatitude || missingLongitude) return { status: "missing", latitude, longitude };
  if (latitude == null || longitude == null || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    return { status: "invalid", latitude, longitude };
  }
  return { status: "valid", latitude, longitude };
}

function distanceKm(left = {}, right = {}) {
  const leftCoordinate = coordinateStatus(left);
  const rightCoordinate = coordinateStatus(right);
  if (leftCoordinate.status !== "valid" || rightCoordinate.status !== "valid") return null;
  const radians = (degrees) => degrees * Math.PI / 180;
  const earthRadiusKm = 6371;
  const dLat = radians(rightCoordinate.latitude - leftCoordinate.latitude);
  const dLon = radians(rightCoordinate.longitude - leftCoordinate.longitude);
  const lat1 = radians(leftCoordinate.latitude);
  const lat2 = radians(rightCoordinate.latitude);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return Math.round(earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

function item({
  status = "verified",
  sourceType = "local-computation",
  sourceId = null,
  evidenceCategory = "",
  extractedFacts = {},
  supportsWhichDecision = [],
  confidence = 1,
  matchMethod = null,
} = {}) {
  return {
    status,
    sourceType,
    sourceId,
    evidenceCategory,
    extractedFacts,
    supportsWhichDecision,
    confidence,
    matchMethod,
  };
}

function unknown({ field = "", reason = "", sourceType = null, evidenceCategory = null, supportsWhichDecision = null } = {}) {
  return {
    field,
    reason,
    sourceType,
    evidenceCategory,
    supportsWhichDecision,
  };
}

function failure({ field = "", reason = "", sourceType = null, evidenceCategory = null, supportsWhichDecision = null } = {}) {
  return {
    field,
    reason,
    sourceType,
    evidenceCategory,
    supportsWhichDecision,
  };
}

function destinationContradictions(candidateDestination = {}, kgDestination = {}) {
  const reasons = [];
  if (candidateDestination.wikidataId && kgDestination.wikidataId && candidateDestination.wikidataId !== kgDestination.wikidataId) {
    reasons.push("wikidataId-mismatch");
  }
  if (candidateDestination.name && kgDestination.name && candidateDestination.name !== kgDestination.name) {
    reasons.push("name-mismatch");
  }
  if (candidateDestination.countryCode && kgDestination.countryCode && candidateDestination.countryCode !== kgDestination.countryCode) {
    reasons.push("countryCode-mismatch");
  }
  return reasons;
}

function findKgDestinationByStableId(destination = {}, kgIndex) {
  const stableId = stableDestinationId(destination);
  return stableId ? kgIndex.get(stableId) : null;
}

function orderIntegrity(candidateDestinations = [], proposedOrder = []) {
  const canonicalByAlias = new Map();
  for (const destination of candidateDestinations) {
    for (const alias of destinationAliases(destination)) {
      canonicalByAlias.set(alias, destination.id);
    }
  }
  const resolvedOrder = proposedOrder.map((id) => canonicalByAlias.get(cleanString(id)) || cleanString(id)).filter(Boolean);
  const destinationIds = candidateDestinations.map((destination) => destination.id).filter(Boolean);
  const destinationSet = new Set(destinationIds);
  const orderSet = new Set(resolvedOrder);
  const duplicateIds = resolvedOrder.filter((id, index) => resolvedOrder.indexOf(id) !== index);
  const missingDestinations = destinationIds.filter((id) => !orderSet.has(id));
  const extraOrderIds = resolvedOrder.filter((id) => !destinationSet.has(id));
  return {
    resolvedOrder,
    destinationIds,
    duplicateIds: uniqueStrings(duplicateIds),
    missingDestinations,
    extraOrderIds,
    complete: duplicateIds.length === 0 && missingDestinations.length === 0 && extraOrderIds.length === 0,
  };
}

function paceFor(daysPerDestination) {
  if (!Number.isFinite(daysPerDestination)) return "unknown";
  if (daysPerDestination < 1) return "compressed";
  if (daysPerDestination < 1.5) return "fast";
  if (daysPerDestination < 2.5) return "balanced";
  return "slow";
}

export function collectLocalEvidenceBundle({
  candidate = {},
  kgPool = [],
  now = () => LOCAL_EVIDENCE_COLLECTOR_CREATED_AT,
} = {}) {
  const candidateDestinations = Array.isArray(candidate.destinations)
    ? candidate.destinations.map(normalizeDestination)
    : [];
  const candidateCountries = uniqueStrings(candidate.countries || candidateDestinations.map((destination) => destination.countryCode))
    .map(normalizeCode);
  const proposedOrder = Array.isArray(candidate.proposedOrder)
    ? candidate.proposedOrder.map(cleanString).filter(Boolean)
    : [];
  const kgIndex = buildKgIndex(kgPool);
  const items = [];
  const unknowns = [];
  const failures = [];

  for (const destination of candidateDestinations) {
    const stableId = stableDestinationId(destination);
    const kgDestination = findKgDestinationByStableId(destination, kgIndex);
    if (!kgDestination) {
      unknowns.push(unknown({
        field: `destinationIdentity:${destination.id || destination.name}`,
        reason: stableId ? "stable-destination-id-not-found-in-kg-pool" : "stable-destination-id-missing",
        sourceType: "knowledge-graph",
        evidenceCategory: "destination-identity",
        supportsWhichDecision: "destination-inclusion",
      }));
    } else {
      const contradictions = destinationContradictions(destination, kgDestination);
      if (contradictions.length) {
        failures.push(failure({
          field: `destinationIdentity:${destination.id || destination.name}`,
          reason: contradictions.join(","),
          sourceType: "knowledge-graph",
          evidenceCategory: "destination-identity",
          supportsWhichDecision: "destination-inclusion",
        }));
      } else {
        items.push(item({
          status: "verified",
          sourceType: "knowledge-graph",
          sourceId: kgDestination.wikidataId || kgDestination.id,
          evidenceCategory: "destination-identity",
          extractedFacts: {
            candidateDestinationId: destination.id,
            kgDestinationId: kgDestination.id,
            wikidataId: kgDestination.wikidataId,
            name: kgDestination.name,
            countryCode: kgDestination.countryCode,
          },
          supportsWhichDecision: ["destination-inclusion"],
          confidence: 1,
          matchMethod: "candidate-id-to-kg-pool",
        }));
      }
    }

    if (candidateCountries.includes(destination.countryCode)) {
      items.push(item({
        status: "verified",
        sourceType: "local-computation",
        sourceId: destination.id,
        evidenceCategory: "country-match",
        extractedFacts: {
          destinationId: destination.id,
          destinationCountryCode: destination.countryCode,
          candidateCountries,
          matched: true,
        },
        supportsWhichDecision: ["country-composition"],
        confidence: 1,
        matchMethod: "country-code-intersection",
      }));
    } else {
      failures.push(failure({
        field: `countryMatch:${destination.id || destination.name}`,
        reason: "destination-country-not-in-candidate-countries",
        sourceType: "local-computation",
        evidenceCategory: "country-match",
        supportsWhichDecision: "country-composition",
      }));
    }

    const coordinate = coordinateStatus(destination);
    if (coordinate.status === "valid") {
      items.push(item({
        status: "verified",
        sourceType: "local-computation",
        sourceId: destination.id,
        evidenceCategory: "coordinate",
        extractedFacts: {
          destinationId: destination.id,
          latitude: coordinate.latitude,
          longitude: coordinate.longitude,
        },
        supportsWhichDecision: ["distance-calculation", "route-order-feasibility"],
        confidence: 1,
        matchMethod: "finite-coordinate-range-check",
      }));
    } else if (coordinate.status === "missing") {
      unknowns.push(unknown({
        field: `coordinate:${destination.id || destination.name}`,
        reason: "coordinate-missing",
        sourceType: "local-computation",
        evidenceCategory: "coordinate",
        supportsWhichDecision: "distance-calculation",
      }));
    } else {
      failures.push(failure({
        field: `coordinate:${destination.id || destination.name}`,
        reason: "coordinate-invalid-or-out-of-range",
        sourceType: "local-computation",
        evidenceCategory: "coordinate",
        supportsWhichDecision: "distance-calculation",
      }));
    }
  }

  const integrity = orderIntegrity(candidateDestinations, proposedOrder);
  if (integrity.complete) {
    items.push(item({
      status: "verified",
      sourceType: "local-computation",
      evidenceCategory: "proposed-order-integrity",
      extractedFacts: {
        proposedOrder: integrity.resolvedOrder,
        destinationIds: integrity.destinationIds,
        destinationCount: integrity.destinationIds.length,
      },
      supportsWhichDecision: ["route-order-integrity"],
      confidence: 1,
      matchMethod: "candidate-destination-id-set",
    }));
  } else {
    for (const id of integrity.missingDestinations) {
      failures.push(failure({
        field: "proposedOrder",
        reason: `destination-missing-from-proposedOrder:${id}`,
        sourceType: "local-computation",
        evidenceCategory: "proposed-order-integrity",
        supportsWhichDecision: "route-order-integrity",
      }));
    }
    for (const id of integrity.extraOrderIds) {
      failures.push(failure({
        field: "proposedOrder",
        reason: `proposedOrder-id-not-in-destinations:${id}`,
        sourceType: "local-computation",
        evidenceCategory: "proposed-order-integrity",
        supportsWhichDecision: "route-order-integrity",
      }));
    }
    for (const id of integrity.duplicateIds) {
      failures.push(failure({
        field: "proposedOrder",
        reason: `proposedOrder-duplicate-id:${id}`,
        sourceType: "local-computation",
        evidenceCategory: "proposed-order-integrity",
        supportsWhichDecision: "route-order-integrity",
      }));
    }
  }

  const byId = new Map(candidateDestinations.map((destination) => [destination.id, destination]));
  for (let index = 1; index < integrity.resolvedOrder.length; index += 1) {
    const fromId = integrity.resolvedOrder[index - 1];
    const toId = integrity.resolvedOrder[index];
    const from = byId.get(fromId);
    const to = byId.get(toId);
    if (!from || !to) continue;
    const distance = distanceKm(from, to);
    if (distance == null) {
      unknowns.push(unknown({
        field: `segmentDistance:${fromId}:${toId}`,
        reason: "segment-distance-requires-valid-coordinates",
        sourceType: "local-computation",
        evidenceCategory: "segment-distance",
        supportsWhichDecision: "route-order-feasibility",
      }));
    } else {
      items.push(item({
        status: "verified",
        sourceType: "local-computation",
        evidenceCategory: "segment-distance",
        extractedFacts: {
          from: fromId,
          to: toId,
          distanceKm: distance,
        },
        supportsWhichDecision: ["route-order-feasibility"],
        confidence: 1,
        matchMethod: "haversine-local",
      }));
    }
  }

  const durationDays = Number(candidate.durationDays);
  const destinationCount = candidateDestinations.length;
  const daysPerDestination = Number.isFinite(durationDays) && destinationCount > 0
    ? Number((durationDays / destinationCount).toFixed(2))
    : null;
  items.push(item({
    status: "weak_signal",
    sourceType: "local-heuristic",
    evidenceCategory: "duration-fit",
    extractedFacts: {
      durationDays: Number.isFinite(durationDays) ? durationDays : null,
      destinationCount,
      daysPerDestination,
      travelStyle: cleanString(candidate.travelStyle),
      pace: paceFor(daysPerDestination),
    },
    supportsWhichDecision: ["duration-feasibility"],
    confidence: 0.55,
    matchMethod: "days-per-destination-heuristic",
  }));

  for (const field of ["transportFeasibility", "seasonalFit", "budgetFit"]) {
    unknowns.push(unknown({
      field,
      reason: "Phase 3B-1 local collector does not verify this evidence category.",
      sourceType: "local-evidence-collector",
      evidenceCategory: field,
      supportsWhichDecision: field,
    }));
  }

  return normalizeEvidenceBundle({
    candidateId: cleanString(candidate.candidateId),
    intentId: cleanString(candidate.intentId),
    generationSource: cleanString(candidate.generationSource || LOCAL_EVIDENCE_COLLECTOR_SOURCE),
    createdAt: now(),
    items,
    unknowns,
    failures,
    summary: {},
  }, { now });
}
