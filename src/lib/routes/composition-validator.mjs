const ENABLED_STRATEGIES = new Set(["Geographic", "Theme", "Season", "Transport", "Depth", "Efficiency"]);
const DISABLED_STRATEGIES = new Set(["Flight Opportunity", "Budget", "Hub & Stopover"]);
const SCORE_KEYS = ["geographicFit", "transportFeasibility", "seasonalFit", "themeCoherence", "travelEfficiency", "evidenceCompleteness"];
const MIN_TOTAL_SCORE = 0.72;
const MIN_EVIDENCE_SCORE = 0.75;
const MIN_EFFICIENCY_SCORE = 0.6;
const MAX_SEGMENT_KM = 650;
const MAX_TOTAL_ROUTE_KM = 2200;
const MAX_ROUTE_SPAN_KM = 1200;

function list(value) {
  return Array.isArray(value) ? value : [];
}

function text(value) {
  return String(value || "").trim();
}

function average(values) {
  const numbers = values.map(Number).filter((value) => Number.isFinite(value));
  return numbers.length ? numbers.reduce((sum, value) => sum + value, 0) / numbers.length : 0;
}

function evidenceIds(record) {
  return new Set(list(record?.provenance?.evidence).map((item) => text(item.evidenceId || item.id)).filter(Boolean));
}

function strategyEvidenceIds(record) {
  return new Set(list(record?.provenance?.strategyEvidence)
    .flatMap((item) => list(item.evidenceIds).map(text))
    .filter(Boolean));
}

function hasEntityEvidence(record, entityId, kind) {
  const evidence = list(record?.provenance?.evidence);
  return evidence.some((item) => (
    item.kind === kind
    && [item.entityId, item.wikidataId, item.destinationId, item.countryCode].map(text).includes(text(entityId))
  ));
}

function entityId(entity) {
  return text(entity?.wikidataId || entity?.entityId || entity?.name);
}

function segmentKey(left, right) {
  return `${entityId(left)}>${entityId(right)}`;
}

function routeSegments(record) {
  return list(record?.provenance?.evidence).filter((item) => item.kind === "route-segment");
}

function segmentMatches(segment, left, right) {
  const from = text(segment.fromEntityId || segment.fromName);
  const to = text(segment.toEntityId || segment.toName);
  const leftId = entityId(left);
  const rightId = entityId(right);
  return (from === leftId && to === rightId) || (from === rightId && to === leftId);
}

function adjacentSegments(record) {
  const destinations = list(record?.destinationEntities);
  const segments = routeSegments(record);
  return destinations.slice(0, -1).map((destination, index) => {
    const next = destinations[index + 1];
    return {
      key: segmentKey(destination, next),
      segment: segments.find((item) => segmentMatches(item, destination, next)) || null,
    };
  });
}

function coordinate(entity) {
  const latitude = Number(entity?.latitude ?? entity?.lat);
  const longitude = Number(entity?.longitude ?? entity?.lon);
  return Number.isFinite(latitude) && Number.isFinite(longitude) ? { latitude, longitude } : null;
}

function radians(value) {
  return (value * Math.PI) / 180;
}

function distanceKm(left, right) {
  const from = coordinate(left);
  const to = coordinate(right);
  if (!from || !to) return null;
  const deltaLatitude = radians(to.latitude - from.latitude);
  const deltaLongitude = radians(to.longitude - from.longitude);
  const a = Math.sin(deltaLatitude / 2) ** 2
    + Math.cos(radians(from.latitude)) * Math.cos(radians(to.latitude)) * Math.sin(deltaLongitude / 2) ** 2;
  return Math.round(6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

function routeSpanKm(record) {
  const coordinates = list(record?.destinationEntities).map(coordinate).filter(Boolean);
  let span = 0;
  for (let left = 0; left < coordinates.length; left += 1) {
    for (let right = left + 1; right < coordinates.length; right += 1) {
      span = Math.max(span, distanceKm(coordinates[left], coordinates[right]) || 0);
    }
  }
  return span || null;
}

function broadDestination(value) {
  const label = `${text(value?.name)} ${text(value?.entityTypeName)}`.toLocaleLowerCase("zh-CN");
  return /州|省|大区|自治区|region|province|state|territory|oblast|krai/u.test(label);
}

export function validateCompositionRecord(record) {
  if (record?.sourceType !== "evidence-composed") return { accepted: true, reasons: [] };

  const reasons = [];
  const evidence = list(record?.provenance?.evidence);
  const strategyEvidence = list(record?.provenance?.strategyEvidence);
  const strategies = list(record?.designStrategies).map(text).filter(Boolean);
  const plannerReasons = list(record?.plannerReason);
  const score = record?.compositionScore || {};
  const scoreValues = SCORE_KEYS.map((key) => Number(score[key]));
  const knownEvidenceIds = evidenceIds(record);
  const knownStrategyEvidenceIds = strategyEvidenceIds(record);

  if (!evidence.length) reasons.push("missing-composition-evidence");
  if (!strategyEvidence.length) reasons.push("missing-strategy-evidence");
  if (!strategies.length) reasons.push("missing-design-strategies");
  if (!plannerReasons.length) reasons.push("missing-planner-reason");
  if (!record?.coverageContribution || !Object.keys(record.coverageContribution).length) reasons.push("missing-coverage-contribution");
  if (strategies.some((strategy) => !ENABLED_STRATEGIES.has(strategy))) reasons.push("unsupported-phase2a-strategy");
  if (strategies.some((strategy) => DISABLED_STRATEGIES.has(strategy))) reasons.push("disabled-strategy-without-evidence");
  if (scoreValues.some((value) => !Number.isFinite(value))) reasons.push("missing-composition-score");
  if (average(scoreValues) < MIN_TOTAL_SCORE) reasons.push("composition-score-too-low");
  if (Number(score.evidenceCompleteness) < MIN_EVIDENCE_SCORE) reasons.push("evidence-completeness-too-low");
  if (Number(score.travelEfficiency) < MIN_EFFICIENCY_SCORE) reasons.push("travel-efficiency-too-low");

  const segments = adjacentSegments(record);
  const missingSegments = segments.filter((item) => !item.segment);
  const segmentDistances = segments.map((item) => Number(item.segment?.distanceKm)).filter((value) => Number.isFinite(value));
  const missingSegmentDistance = segments.some((item) => item.segment && !Number.isFinite(Number(item.segment.distanceKm)));
  const totalDistance = segmentDistances.reduce((sum, value) => sum + value, 0);
  const span = routeSpanKm(record);
  const destinations = list(record?.destinationEntities);
  const hasBroadDestinations = destinations.some(broadDestination);
  const hasSpecificDestinations = destinations.some((item) => !broadDestination(item));

  if (destinations.length >= 2 && missingSegments.length) reasons.push("transport-segment-unverified");
  if (missingSegmentDistance) reasons.push("route-segment-distance-unverified");
  if (segmentDistances.some((distance) => distance > MAX_SEGMENT_KM)) reasons.push("route-segment-too-long");
  if (totalDistance > MAX_TOTAL_ROUTE_KM) reasons.push("route-distance-too-long");
  if (span != null && span > MAX_ROUTE_SPAN_KM) reasons.push("region-span-too-wide");
  if (hasBroadDestinations && hasSpecificDestinations) reasons.push("mixed-destination-levels");
  if (Number(score.transportFeasibility) > 0.7 && (missingSegments.length || missingSegmentDistance)) reasons.push("transport-score-without-evidence");
  if (Number(score.travelEfficiency) > 0.7 && (missingSegments.length || totalDistance > MAX_TOTAL_ROUTE_KM)) reasons.push("efficiency-score-without-route-sanity");
  if (Number(score.geographicFit) > 0.7 && (span == null || span > MAX_ROUTE_SPAN_KM)) reasons.push("geographic-score-without-span-sanity");

  for (const item of strategyEvidence) {
    if (!strategies.includes(text(item.strategy))) reasons.push("strategy-evidence-without-strategy");
    if (!list(item.evidenceIds).length) reasons.push("strategy-evidence-missing-ids");
    if (list(item.evidenceIds).some((id) => !knownEvidenceIds.has(text(id)))) reasons.push("strategy-evidence-unknown-id");
  }

  for (const reason of plannerReasons) {
    if (!text(reason.text)) reasons.push("planner-reason-missing-text");
    if (!strategies.includes(text(reason.strategy))) reasons.push("planner-reason-unknown-strategy");
    if (!list(reason.evidenceIds).length) reasons.push("planner-reason-missing-evidence");
    if (list(reason.evidenceIds).some((id) => !knownStrategyEvidenceIds.has(text(id)))) reasons.push("planner-reason-unknown-evidence");
  }

  for (const country of list(record?.countryEntities)) {
    if (!hasEntityEvidence(record, country.countryCode || country.wikidataId, "country")) reasons.push("country-without-evidence");
  }
  for (const destination of list(record?.destinationEntities)) {
    if (!hasEntityEvidence(record, destination.wikidataId || destination.name, "destination")) reasons.push("destination-without-evidence");
  }
  if (record?.coverAsset?.assetId && !evidence.some((item) => item.kind === "image" && text(item.assetId) === text(record.coverAsset.assetId))) {
    reasons.push("cover-without-evidence");
  }

  return { accepted: reasons.length === 0, reasons: [...new Set(reasons)] };
}
