import crypto from "node:crypto";
import { buildRouteConcept, validateRouteConcept } from "./route-planning-concept.mjs";

const STRATEGY_BY_EVIDENCE = {
  "region-cluster": "Regional",
  "transport-connection": "Transport",
  "segment-metric": "Efficiency",
  "destination-season": "Season",
  "theme-fit": "Theme",
  "route-network": "Transport",
  "climate-window": "Season",
};

const ROUTE_NAME_PATTERN = /之旅|路线|公路|铁路|徒步|穿越|之路|探索者|建造者号|星光号|E\d+/u;
const TRANSPORT_NAMES = new Set(["铁路", "公路", "徒步", "骑行", "轮渡", "rail", "road", "walking", "cycling", "ferry"]);
const MAX_SEGMENT_DISTANCE_KM = 900;
const MAX_TOTAL_SPAN_KM = 2500;
const MIN_REVIEW_DESTINATIONS = 2;
const MIN_PRODUCT_DESTINATIONS = 3;

function clean(value) {
  return String(value || "").trim();
}

function clone(value) {
  return structuredClone(value);
}

function hash(value) {
  return crypto.createHash("sha256").update(value).digest("hex").slice(0, 16);
}

function unique(values) {
  return [...new Set(values.map(clean).filter(Boolean))];
}

function nameOf(place) {
  if (place && typeof place === "object") return clean(place.name || place.entityId || place.countryCode);
  return clean(place?.name || place?.entityId || place);
}

function isDestinationName(value) {
  if (!value || /^[A-Z]{2}$/u.test(value)) return false;
  if (TRANSPORT_NAMES.has(value)) return false;
  return !ROUTE_NAME_PATTERN.test(value);
}

function sourceFamilyId(item) {
  const provenance = item.provenance || {};
  return clean(item.sourceRouteId || provenance.sourceRouteId || provenance.sourceUrl || provenance.searchQuery || item.sourceUrl);
}

function sourceRouteId(item) {
  return clean(item.sourceRouteId || item.provenance?.sourceRouteId);
}

function sourceTitle(items) {
  return clean(items.find((item) => item.provenance?.sourceTitle)?.provenance?.sourceTitle || items.find((item) => item.sourceTitle)?.sourceTitle);
}

function sourceUrl(items) {
  return clean(items.find((item) => item.provenance?.sourceUrl)?.provenance?.sourceUrl || items.find((item) => item.sourceUrl)?.sourceUrl);
}

function groupedBySourceFamily(evidence) {
  const groups = new Map();
  for (const item of evidence) {
    const key = sourceFamilyId(item);
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }
  return groups;
}

function strategiesFor(items) {
  return unique(items.map((item) => STRATEGY_BY_EVIDENCE[item.evidenceType]));
}

function destinationLevelMap(items) {
  const levels = new Map();
  for (const item of items.filter((entry) => entry.evidenceType === "destination-level")) {
    const name = nameOf(item.subject);
    const level = clean(item.value);
    if (name && level) levels.set(name, level);
  }
  return levels;
}

function countryNames(items) {
  const names = [];
  for (const item of items) {
    if (item.evidenceType === "place-entity" && item.value === "country") names.push(nameOf(item.subject));
    if (item.evidenceType === "containment") names.push(nameOf(item.object) || clean(item.value));
  }
  return unique(names).filter((name) => !/^[A-Z]{2}$/u.test(name));
}

function regionCluster(items) {
  const cluster = items.find((item) => item.evidenceType === "region-cluster");
  if (!cluster) return null;
  return {
    name: nameOf(cluster.subject) || sourceTitle(items),
    members: unique([
      ...(Array.isArray(cluster.value) ? cluster.value.map(nameOf) : []),
      ...(cluster.qualifiers?.memberNames || []).map(nameOf),
    ]).filter(isDestinationName),
    evidenceId: cluster.evidenceId,
  };
}

function destinationsFrom(items) {
  const levels = destinationLevelMap(items);
  const cluster = regionCluster(items);
  const segmentNames = items
    .filter((item) => item.evidenceType === "transport-connection" || item.evidenceType === "segment-metric")
    .flatMap((item) => [nameOf(item.subject), nameOf(item.object)]);
  const levelNames = [...levels.keys()];
  const clusterNames = cluster?.members || [];
  return unique([...clusterNames, ...segmentNames, ...levelNames]).filter(isDestinationName).slice(0, 8);
}

function segmentMetrics(items) {
  return items
    .filter((item) => item.evidenceType === "segment-metric")
    .map((item) => ({
      from: nameOf(item.subject),
      to: nameOf(item.object),
      distanceKm: Number(item.distanceKm ?? item.value?.distanceKm ?? item.qualifiers?.distanceKm ?? 0) || null,
      durationHours: Number(item.durationHours ?? item.value?.durationHours ?? item.qualifiers?.durationHours ?? 0) || null,
      metricType: clean(item.metricType || item.value?.metricType || item.qualifiers?.metricType),
      evidenceId: item.evidenceId,
    }))
    .filter((item) => item.from && item.to);
}

function transportConnections(items) {
  return items
    .filter((item) => item.evidenceType === "transport-connection" || item.evidenceType === "route-network")
    .map((item) => ({
      from: nameOf(item.subject),
      to: nameOf(item.object),
      modes: Array.isArray(item.value) ? item.value.map(clean).filter(Boolean) : [clean(item.value)].filter(Boolean),
      evidenceId: item.evidenceId,
    }))
    .filter((item) => item.from || item.to || item.modes.length);
}

function imageReadiness(items, destinations) {
  const imageSubjects = new Set(items
    .filter((item) => item.evidenceType === "destination-image")
    .map((item) => nameOf(item.subject))
    .filter(Boolean));
  const missingDestinations = destinations.filter((destination) => !imageSubjects.has(destination));
  return {
    status: destinations.length && missingDestinations.length === 0 ? "ready" : imageSubjects.size ? "partial" : "missing",
    readyCount: imageSubjects.size,
    missingDestinations,
  };
}

function mixedDestinationLevels(destinationLevels) {
  const levels = unique(destinationLevels.map((item) => item.level));
  const regionLevels = levels.filter((level) => /region|state|province|prefecture|island|county|district/i.test(level));
  const cityLevels = levels.filter((level) => /city|town|village/i.test(level));
  return regionLevels.length > 0 && cityLevels.length > 0;
}

function totalSpan(metrics) {
  return metrics.reduce((sum, item) => sum + (Number(item.distanceKm) || 0), 0);
}

function maxSegment(metrics) {
  return Math.max(0, ...metrics.map((item) => Number(item.distanceKm) || 0));
}

function fingerprint(values) {
  return hash(unique(values).sort().join("|").toLowerCase());
}

function duplicateRisk(items, destinations, sourceFamily) {
  const routeLevel = items.some((item) => item.evidenceType === "region-cluster" && (Array.isArray(item.value) ? item.value : []).some((value) => ROUTE_NAME_PATTERN.test(clean(value))));
  return {
    status: routeLevel ? "source-family-route-overlap" : "low",
    reasons: routeLevel ? ["same-source-family-route-candidate"] : [],
    sourceFamilyId: sourceFamily,
    destinationSetFingerprint: fingerprint(destinations),
  };
}

function statusFor({ countries, destinations, destinationLevels, transports, metrics, cluster, images, corroborationCount, duplicate, conceptValidation }) {
  const rejectReasons = [];
  const downgradeReasons = [];
  if (!countries.length) rejectReasons.push("missing-country");
  if (destinations.length < MIN_REVIEW_DESTINATIONS) rejectReasons.push("too-few-destinations");
  if (!destinationLevels.length) rejectReasons.push("missing-destination-level");
  if (!transports.length && !cluster) rejectReasons.push("missing-route-structure");
  if (mixedDestinationLevels(destinationLevels)) rejectReasons.push("mixed-destination-levels");
  if (metrics.length && maxSegment(metrics) > MAX_SEGMENT_DISTANCE_KM) rejectReasons.push("max-segment-distance-exceeded");
  if (metrics.length && totalSpan(metrics) > MAX_TOTAL_SPAN_KM) rejectReasons.push("max-total-span-exceeded");
  if (!metrics.length) downgradeReasons.push("missing-segment-metric");
  if (destinations.length < MIN_PRODUCT_DESTINATIONS) downgradeReasons.push("below-product-destination-count");
  if (images.status !== "ready") downgradeReasons.push(`image-${images.status}`);
  if (!corroborationCount) downgradeReasons.push("no-corroboration");
  if (duplicate.status !== "low") downgradeReasons.push("duplicate-risk");
  for (const reason of conceptValidation?.reasons || []) {
    if (reason.includes("missing") || reason.includes("too-many") || reason.includes("too-few") || reason.includes("short-duration")) {
      rejectReasons.push(reason);
    } else {
      downgradeReasons.push(reason);
    }
  }

  if (rejectReasons.length) return { candidateStatus: "rejectedBeforeReview", rejectReasons, downgradeReasons };
  if (downgradeReasons.includes("missing-segment-metric") || downgradeReasons.includes("duplicate-risk")) {
    return { candidateStatus: "needsEvidence", rejectReasons, downgradeReasons };
  }
  if (downgradeReasons.length) return { candidateStatus: "weakCandidate", rejectReasons, downgradeReasons };
  return { candidateStatus: "highQualityReviewable", rejectReasons, downgradeReasons };
}

function candidateFor(sourceFamily, items) {
  const destinations = destinationsFrom(items);
  const countries = countryNames(items);
  const levelMap = destinationLevelMap(items);
  const destinationLevels = destinations
    .map((destination) => ({ destination, level: levelMap.get(destination) || "" }))
    .filter((item) => item.level);
  const metrics = segmentMetrics(items);
  const transports = transportConnections(items);
  const cluster = regionCluster(items);
  const strategies = strategiesFor(items);
  const images = imageReadiness(items, destinations);
  const corroborationCount = items.filter((item) => item.qualifiers?.corroborated).length;
  const duplicate = duplicateRisk(items, destinations, sourceFamily);
  const conceptContext = {
    countries,
    destinations,
    destinationLevels,
    segmentMetrics: metrics,
    transportConnections: transports,
    regionCluster: cluster,
    designStrategies: strategies,
    bestMonths: unique(items
      .filter((item) => item.evidenceType === "destination-season" || item.evidenceType === "climate-window")
      .flatMap((item) => Array.isArray(item.value) ? item.value : [item.value]))
      .slice(0, 4),
    themes: unique(items.filter((item) => item.evidenceType === "theme-fit").map((item) => item.value)).slice(0, 4),
  };
  const routeConcept = buildRouteConcept(conceptContext);
  const conceptValidation = validateRouteConcept(routeConcept, conceptContext);
  const status = statusFor({
    countries,
    destinations,
    destinationLevels,
    transports,
    metrics,
    cluster,
    images,
    corroborationCount,
    duplicate,
    conceptValidation,
  });
  const titleBase = clean(sourceTitle(items).replace(/[_-]/g, " ")) || destinations.slice(0, 3).join(" · ") || sourceFamily;
  const destinationSetFingerprint = fingerprint(destinations);
  const strategyFingerprint = fingerprint(strategies);
  const candidateFingerprint = hash([sourceFamily, destinationSetFingerprint, strategyFingerprint].join("|"));
  return {
    id: `phase2c-review:${candidateFingerprint}`,
    sourceType: "evidence-composed-candidate",
    candidateStatus: status.candidateStatus,
    title: `${titleBase} 候选`,
    countries,
    country: countries[0] || "",
    destinations,
    sourceFamilyId: sourceFamily,
    sourceRouteId: unique(items.map(sourceRouteId))[0] || "",
    sourceUrl: sourceUrl(items),
    sourceTitle: sourceTitle(items),
    durationBand: routeConcept.durationBand,
    recommendedDays: routeConcept.recommendedDays,
    tripIntent: routeConcept.tripIntent,
    travelStyle: routeConcept.travelStyle,
    paceLevel: routeConcept.paceLevel,
    whyThisDurationFits: routeConcept.whyThisDurationFits,
    whyNotShorter: routeConcept.whyNotShorter,
    whyNotLonger: routeConcept.whyNotLonger,
    targetTraveler: routeConcept.targetTraveler,
    whoShouldAvoid: routeConcept.whoShouldAvoid,
    travelValue: routeConcept.travelValue,
    routeConcept,
    routeScope: {
      type: sourceRouteId(items[0]) ? "route-source" : cluster ? "region-cluster" : "evidence-cluster",
      label: cluster?.name || sourceTitle(items) || sourceFamily,
    },
    destinationLevels,
    segmentMetrics: metrics,
    transportConnections: transports,
    regionCluster: cluster,
    imageReadiness: images,
    corroborationCount,
    duplicateRisk: duplicate,
    candidateFingerprint,
    destinationSetFingerprint,
    strategyFingerprint,
    bestMonths: unique(items
      .filter((item) => item.evidenceType === "destination-season" || item.evidenceType === "climate-window")
      .flatMap((item) => Array.isArray(item.value) ? item.value : [item.value]))
      .slice(0, 4),
    themes: unique(items.filter((item) => item.evidenceType === "theme-fit").map((item) => item.value)).slice(0, 4),
    designStrategies: strategies,
    plannerReason: [
      transports[0] ? {
        strategy: "Transport",
        text: `${titleBase} 有来源证据支持的交通或路线网络线索。`,
        evidenceIds: transports.map((item) => item.evidenceId).slice(0, 3),
      } : null,
      cluster ? {
        strategy: "Regional",
        text: `${titleBase} 有区域或来源路线聚合证据。`,
        evidenceIds: [cluster.evidenceId],
      } : null,
    ].filter(Boolean),
    compositionScore: {
      evidenceCompleteness: Number((1 - status.rejectReasons.length * 0.18 - status.downgradeReasons.length * 0.08).toFixed(2)),
      averageConfidence: Number((items.reduce((sum, item) => sum + Number(item.confidence || 0), 0) / Math.max(1, items.length)).toFixed(2)),
      corroboration: Number((corroborationCount / Math.max(1, items.length)).toFixed(2)),
      maxSegmentDistanceKm: maxSegment(metrics),
      totalSpanKm: totalSpan(metrics),
    },
    coverageContribution: {
      evidenceCount: items.length,
      strategies,
      destinations,
    },
    evidenceCoverageSummary: {
      evidenceCount: items.length,
      evidenceTypes: unique(items.map((item) => item.evidenceType)),
      corroboratedCount: corroborationCount,
    },
    rejectReasons: status.rejectReasons,
    downgradeReasons: status.downgradeReasons,
    missingEvidence: status.rejectReasons.concat(status.downgradeReasons),
    validatorStatus: status.candidateStatus,
  };
}

function statusCounts(records) {
  return records.reduce((bucket, item) => {
    bucket[item.candidateStatus] = (bucket[item.candidateStatus] || 0) + 1;
    return bucket;
  }, {});
}

function reportExamples(records) {
  return {
    goodExamples: records.filter((item) => item.candidateStatus === "highQualityReviewable").slice(0, 10).map(clone),
    weakExamples: records.filter((item) => item.candidateStatus === "weakCandidate").slice(0, 10).map(clone),
    weirdBadExamples: records.filter((item) => item.candidateStatus === "rejectedBeforeReview").slice(0, 10).map(clone),
    duplicateRiskExamples: records.filter((item) => item.duplicateRisk?.status !== "low").slice(0, 10).map(clone),
  };
}

export function generateRoutePhase2cReviewCandidates({ evidenceRepository, limit = 100 } = {}) {
  const evidence = evidenceRepository?.list?.({ status: "verified" }) || [];
  const groups = groupedBySourceFamily(evidence);
  const records = [...groups.entries()]
    .map(([sourceFamily, items]) => candidateFor(sourceFamily, items))
    .filter((item) => item.destinations.length >= MIN_REVIEW_DESTINATIONS || item.candidateStatus === "rejectedBeforeReview")
    .slice(0, limit);
  return {
    generatedCount: records.length,
    requestedLimit: limit,
    writesAcceptedRepository: false,
    records,
    statusCounts: statusCounts(records),
    reviewSummary: reportExamples(records),
    shortageDiagnostics: records.length < limit ? [{ requested: limit, generated: records.length, reason: "insufficient-route-level-evidence" }] : [],
  };
}
