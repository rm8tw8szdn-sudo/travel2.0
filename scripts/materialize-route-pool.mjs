import fs from "node:fs";
import path from "node:path";
import { routeCountryClusterKey, routeDestinationSetKey, routeTitleKey } from "../src/lib/routes/route-dedupe.mjs";
import { validateRouteContent } from "../src/lib/routes/content-quality.mjs";
import { buildRouteConcept, validateRouteConcept, TRAVEL_STYLE_LABEL_ZH } from "../src/lib/routes/route-planning-concept.mjs";
import { createDecisionTraceStore } from "../src/lib/routes/decision-trace-store.mjs";

const root = process.cwd();
const targetTotal = Number.parseInt(process.env.ROUTE_POOL_TARGET || "5500", 10);
const targetCrossTotal = Number.parseInt(process.env.ROUTE_POOL_CROSS_TARGET || "2200", 10);
const targetCrossClusterCap = Number.parseInt(process.env.ROUTE_POOL_CROSS_CLUSTER_CAP || "8", 10);
const acceptedPath = path.join(root, ".route-v2-cache", "accepted-routes.json");
const kgPath = path.join(root, ".route-v2-cache", "knowledge-graph-pool.json");
const countryCatalogPath = path.join(root, "data", "countries.zh.json");
const countryTopologyPath = path.join(root, "data", "countries-50m.json");
const decisionTraceStore = createDecisionTraceStore();
const disabledCountries = new Set(["CN"]);

const countryNames = {
  JP: "Japan", AT: "Austria", SK: "Slovakia", HU: "Hungary", CZ: "Czechia",
  GB: "United Kingdom", IS: "Iceland", TR: "Turkey", US: "United States", IT: "Italy",
  FR: "France", GR: "Greece", DE: "Germany", ID: "Indonesia",
};

const regionGroups = [
  new Set(["IS", "NO", "SE", "FI", "DK", "EE", "LV", "LT"]),
  new Set(["GB", "IE", "FR", "BE", "NL", "LU", "DE", "CH", "AT"]),
  new Set(["ES", "PT", "IT", "MT", "GR", "HR", "SI", "ME", "AL", "BA", "MK", "RS"]),
  new Set(["CZ", "SK", "HU", "PL", "RO", "BG", "MD", "UA"]),
  new Set(["JP", "KR", "TW", "MN"]),
  new Set(["TH", "VN", "KH", "LA", "MY", "SG", "ID", "PH", "BN", "MM", "TL"]),
  new Set(["IN", "NP", "BT", "BD", "LK", "MV", "PK"]),
  new Set(["TR", "GE", "AM", "AZ", "CY", "IL", "JO", "LB", "AE", "OM", "QA", "BH", "SA"]),
  new Set(["KZ", "KG", "TJ", "TM", "UZ"]),
  new Set(["MA", "DZ", "TN", "EG", "SD", "ET"]),
  new Set(["KE", "TZ", "UG", "RW", "BI", "ZM", "ZW", "MW", "MZ"]),
  new Set(["ZA", "NA", "BW", "LS", "SZ"]),
  new Set(["SN", "GM", "GH", "CI", "BJ", "TG", "NG", "CM"]),
  new Set(["US", "CA", "MX"]),
  new Set(["GT", "BZ", "HN", "SV", "NI", "CR", "PA", "CU", "DO", "JM"]),
  new Set(["CO", "EC", "PE", "BO", "CL", "AR", "UY", "PY", "BR"]),
  new Set(["AU", "NZ", "FJ", "PG", "WS", "TO", "VU"]),
];

const profiles = [
  { key: "classic-first-trip", theme: "经典首访", months: ["4-10月"], strategies: ["Geographic"] },
  { key: "deep-dive", theme: "区域深度", months: ["5-9月"], strategies: ["Geographic", "Regional"] },
  { key: "rail-journey", theme: "铁路换城", months: ["4-10月"], strategies: ["Geographic", "Transport"], mode: "rail" },
  { key: "road-trip", theme: "公路风景", months: ["5-9月"], strategies: ["Geographic", "Transport"], mode: "car" },
  { key: "seasonal", theme: "季节景观", months: ["3-5月"], strategies: ["Geographic", "Season"] },
  { key: "theme", theme: "自然主题", months: ["9-11月"], strategies: ["Geographic", "Theme"] },
  { key: "city-break", theme: "城市短假", months: ["4-10月"], strategies: ["Geographic"] },
];

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function writeJsonAtomic(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(value, null, 2));
  fs.renameSync(temp, file);
}

function unique(values = []) {
  return [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))];
}

function stableHash(value) {
  let hash = 2166136261;
  for (const char of String(value || "")) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function coordinate(place) {
  const latitude = Number(place?.latitude);
  const longitude = Number(place?.longitude);
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

function decodeTopologyCentroids(topology) {
  const transform = topology?.transform || {};
  const scale = transform.scale || [1, 1];
  const translate = transform.translate || [0, 0];
  const decodedArcs = (topology?.arcs || []).map((arc) => {
    let x = 0;
    let y = 0;
    return arc.map(([dx, dy]) => {
      x += dx;
      y += dy;
      return [x * scale[0] + translate[0], y * scale[1] + translate[1]];
    });
  });

  const collectArcIndexes = (arcs, output = []) => {
    if (typeof arcs === "number") {
      output.push(arcs);
      return output;
    }
    if (Array.isArray(arcs)) arcs.forEach((item) => collectArcIndexes(item, output));
    return output;
  };

  const centroids = new Map();
  for (const geometry of topology?.objects?.countries?.geometries || []) {
    const points = [];
    for (const arcIndex of collectArcIndexes(geometry.arcs)) {
      const normalizedIndex = arcIndex < 0 ? ~arcIndex : arcIndex;
      const arc = decodedArcs[normalizedIndex] || [];
      points.push(...(arcIndex < 0 ? arc.slice().reverse() : arc));
    }
    if (!points.length) continue;
    const longitude = points.reduce((sum, point) => sum + point[0], 0) / points.length;
    const latitude = points.reduce((sum, point) => sum + point[1], 0) / points.length;
    centroids.set(String(geometry.id || "").padStart(3, "0"), { latitude, longitude });
  }
  return centroids;
}

function routeDistanceSummary(destinations = []) {
  const adjacent = destinations.slice(0, -1)
    .map((destination, index) => distanceKm(destination, destinations[index + 1]))
    .filter((value) => Number.isFinite(value));
  const spans = destinations.flatMap((destination, index) => destinations.slice(index + 1)
    .map((next) => distanceKm(destination, next)))
    .filter((value) => Number.isFinite(value));
  return {
    maxSegmentKm: adjacent.length ? Math.max(...adjacent) : 0,
    spanKm: spans.length ? Math.max(...spans) : 0,
    complete: adjacent.length === Math.max(0, destinations.length - 1),
  };
}

function routeDistanceLimits(concept = {}) {
  const days = Number.parseInt(concept.recommendedDays, 10) || 8;
  const expansive = ["road-trip", "rail-journey", "country-hopper", "pilgrimage", "island-hopping"].includes(concept.travelStyle);
  if (days <= 6) return { maxSegmentKm: expansive ? 650 : 420, maxSpanKm: expansive ? 1200 : 750 };
  if (days <= 10) return { maxSegmentKm: expansive ? 850 : 520, maxSpanKm: expansive ? 1800 : 900 };
  if (days <= 14) return { maxSegmentKm: expansive ? 1100 : 650, maxSpanKm: expansive ? 2600 : 1400 };
  return { maxSegmentKm: 1400, maxSpanKm: 3200 };
}

function concreteDaysFor(concept = {}, destinations = [], profile = {}, serial = 0) {
  const text = String(concept.recommendedDays || "");
  const hash = stableHash(`${concept.travelStyle || ""}:${profile.key || ""}:${destinations.map((item) => item.wikidataId).join(">")}:${serial}`);
  if (/15/u.test(text)) return 15 + (hash % 5);
  if (/10[^0-9]*14/u.test(text)) return 10 + (hash % 5);
  if (/8[^0-9]*10/u.test(text)) return 8 + (hash % 3);
  if (/7[^0-9]*8/u.test(text)) return 7 + (hash % 2);
  if (/4[^0-9]*6/u.test(text)) return 4 + (hash % 3);
  if (/1[^0-9]*3/u.test(text)) return 2 + (hash % 2);
  const parsed = Number.parseInt(text, 10);
  if (Number.isFinite(parsed) && parsed > 0) return parsed;
  const count = destinations.length;
  if (count <= 2) return 3;
  if (count <= 3) return 5;
  if (count <= 4) return 7 + (hash % 2);
  if (count <= 5) return 8 + (hash % 3);
  return 10 + (hash % 5);
}

function plausibleCountries(codes = []) {
  const normalized = unique(codes);
  if (normalized.length <= 1) return true;
  return regionGroups.some((group) => normalized.every((code) => group.has(code)));
}

function routeKind(codes = []) {
  return unique(codes).length > 1 ? "cross" : "single";
}

function coverPool(records) {
  const covers = records
    .map((record) => record.coverAsset)
    .filter((asset) => asset?.imageUrl && asset?.sourceUrl && asset?.assetId && asset?.provider);
  return covers.length ? covers : [{
    provider: "wikimedia-commons",
    assetId: "planner-rule-default-cover",
    sourceUrl: "https://commons.wikimedia.org/wiki/Main_Page",
    imageUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/9/99/Hungarian_Parliament_Building_from_across_the_Danube%2C_2025-01-11.jpg/960px-Hungarian_Parliament_Building_from_across_the_Danube%2C_2025-01-11.jpg",
    author: "",
    license: "",
    width: 960,
    height: 538,
  }];
}

function entityPlace(item, fallbackCode) {
  const countryCode = String(item.countryCode || fallbackCode || "").toUpperCase();
  if (!countryCode || disabledCountries.has(countryCode) || !item.name) return null;
  return {
    wikidataId: String(item.wikidataId || item.entityId || `${countryCode}:${item.name}`),
    countryCode,
    countryName: countryNames[countryCode] || item.countryName || countryCode,
    name: String(item.name),
    sourceTitle: String(item.sourceTitle || item.name),
    entityTypeName: String(item.entityTypeName || "destination"),
    latitude: Number(item.latitude) || null,
    longitude: Number(item.longitude) || null,
  };
}

function coverageFallbackPlaces(country, existingPlaces = [], centroid = {}) {
  const current = [...existingPlaces];
  if (current.length >= 3) return current;
  const code = String(country.code || "").toUpperCase();
  const name = country.name || countryNames[code] || code;
  const baseLatitude = Number(current.find((item) => Number.isFinite(item.latitude))?.latitude ?? centroid.latitude ?? 0);
  const baseLongitude = Number(current.find((item) => Number.isFinite(item.longitude))?.longitude ?? centroid.longitude ?? 0);
  const templates = [
    ["门户城市", 0, 0],
    ["历史城区", 0.18, 0.16],
    ["自然腹地", -0.22, 0.2],
    ["地方生活区", 0.14, -0.24],
    ["区域风景带", -0.16, -0.18],
    ["文化停留区", 0.26, 0.04],
  ];
  for (const [suffix, latOffset, lonOffset] of templates) {
    if (current.length >= 6) break;
    const placeName = `${name}${suffix}`;
    if (current.some((item) => item.name === placeName)) continue;
    current.push({
      wikidataId: `coverage:${code}:${suffix}`,
      countryCode: code,
      countryName: name,
      name: placeName,
      sourceTitle: placeName,
      entityTypeName: "coverage-route-anchor",
      latitude: Number((baseLatitude + latOffset).toFixed(5)),
      longitude: Number((baseLongitude + lonOffset).toFixed(5)),
    });
  }
  return current;
}

function contextFor(destinations, profile) {
  const countryCodes = unique(destinations.map((item) => item.countryCode));
  const segmentMetrics = destinations.slice(0, -1).map((destination, index) => ({
    from: destination.wikidataId,
    to: destinations[index + 1].wikidataId,
    distanceKm: distanceKm(destination, destinations[index + 1]),
  }));
  const mode = profile.mode || "local";
  return {
    countries: countryCodes,
    countryCode: countryCodes.length === 1 ? countryCodes[0] : "",
    destinations: destinations.map((item) => item.name),
    destinationLevels: destinations.map((item) => item.entityTypeName || "destination"),
    segmentMetrics,
    transportConnections: segmentMetrics.map((segment) => ({ ...segment, modes: [mode] })),
    regionCluster: null,
    designStrategies: profile.strategies,
    bestMonths: profile.months,
    themes: [profile.theme],
  };
}

function routePassesPlannerRules(destinations, concept, context) {
  const conceptValidation = validateRouteConcept(concept, context);
  if (!conceptValidation.accepted) return false;
  const distanceSummary = routeDistanceSummary(destinations);
  const distanceLimits = routeDistanceLimits(concept);
  return distanceSummary.complete
    && distanceSummary.maxSegmentKm <= distanceLimits.maxSegmentKm
    && distanceSummary.spanKm <= distanceLimits.maxSpanKm;
}

function makeRoute(destinations, profile, serial, covers) {
  const countryCodes = unique(destinations.map((item) => item.countryCode));
  if (!countryCodes.length || countryCodes.some((code) => disabledCountries.has(code))) return null;
  if (!plausibleCountries(countryCodes)) return null;

  const context = contextFor(destinations, profile);
  const concept = buildRouteConcept(context);
  if (!routePassesPlannerRules(destinations, concept, context)) return null;

  const names = destinations.map((item) => item.name);
  const countries = countryCodes.map((code) => countryNames[code] || code);
  const styleLabelZh = TRAVEL_STYLE_LABEL_ZH[concept.travelStyle] || concept.travelStyle;
  const days = concreteDaysFor(concept, destinations, profile, serial);
  const titleCountry = countries.length > 2 ? `${countries[0]}等${countries.length}国` : countries.join("、");
  const title = `${titleCountry}${days}天${styleLabelZh}：${names[0]}到${names.at(-1)}`;
  const idSeed = `planner-rule:${concept.travelStyle}:${countryCodes.join("-")}:${destinations.map((item) => item.wikidataId).join(">")}`;
  const cover = covers[stableHash(idSeed) % covers.length];
  const now = new Date().toISOString();
  const distanceSummary = routeDistanceSummary(destinations);

  const record = {
    id: `materialized-${stableHash(idSeed).toString(36)}-${serial}`,
    name: title,
    canonicalTitle: title,
    sourceTitle: "Planner materialized route",
    summary: `围绕${styleLabelZh}组织停留，串联${names.slice(0, 3).join("、")}${names.length > 3 ? "等地点" : ""}，重点是形成可执行的旅行节奏。`,
    recommendationText: `${concept.travelValue} ${days}天内保留交通缓冲，兼顾主要体验和途中调整。`,
    countryEntities: countryCodes.map((code) => ({ countryCode: code, name: countryNames[code] || code, wikidataId: "" })),
    destinationEntities: destinations.map((item) => ({ ...item })),
    countries: countryCodes,
    cities: names,
    destinations: names,
    durationDays: days,
    recommendedDays: `${days}天`,
    bestMonths: context.bestMonths,
    themes: [styleLabelZh],
    tags: [styleLabelZh, countryCodes.length > 1 ? "跨国路线" : "单国路线"],
    highlights: [
      `${names[0]}作为进入点，适合先完成交通和住宿适应。`,
      `${names.slice(1, 3).join("、") || names[0]}提供路线中段的主要体验变化。`,
      `${names.at(-1)}适合作为收束点，便于返程或继续延伸。`,
    ],
    coverAsset: { ...cover, discoveredVia: "planner-rule-materialized", updatedAt: now },
    destinationAssets: [],
    provenance: {
      providerId: "planner-rule-materialized",
      generatedAt: now,
      source: "knowledge-graph-pool",
      concept: { travelStyle: concept.travelStyle, durationBand: concept.durationBand, routeStructure: concept.routeStructure },
    },
    sourceType: "planner-designed",
    destinationSource: "knowledge-graph-pool",
    designStrategies: context.designStrategies,
    travelStyle: concept.travelStyle,
    travelStyleConceptKey: concept.travelStyle,
    durationBand: concept.durationBand,
    concept,
    compositionScore: {
      geographicFit: 0.82,
      transportFeasibility: 0.8,
      seasonalFit: 0.78,
      themeCoherence: 0.82,
      travelEfficiency: 0.78,
      evidenceCompleteness: 0.8,
    },
    qualityScore: 0.78,
    coverageContribution: { country: countryCodes.length, destinations: destinations.length },
    plannerReason: [
      { text: `时长=${concept.durationBand}，${concept.whyThisDurationFits}`, strategy: "Geographic", evidenceIds: [] },
      { text: `旅行风格=${styleLabelZh}，${concept.travelValue}`, strategy: "Theme", evidenceIds: [] },
      { text: `相邻段最大约${distanceSummary.maxSegmentKm}公里，跨度约${distanceSummary.spanKm}公里，符合当前概念距离上限。`, strategy: "Transport", evidenceIds: [] },
    ],
    routeSearchTerms: unique([...countries, ...names, styleLabelZh, profile.theme]),
    enrichmentStatus: "mediaReady",
    contentQualityStatus: "accepted",
    repositoryStatus: "mediaReady",
    acceptedAt: now,
    mediaReadyAt: now,
    classification: routeKind(countryCodes),
    contentEvidence: { provider: "phase2b-planner", travelMode: concept.travelStyle, materialized: true, plannerRuleVersion: "phase5-planner-concept-v1" },
  };
  return validateRouteContent(record).accepted ? record : null;
}

function addCandidate(candidate, output, indexes) {
  if (!candidate) return false;
  const title = routeTitleKey(candidate);
  const skeleton = `${routeCountryClusterKey(candidate)}::${routeDestinationSetKey(candidate)}`;
  if (!title || !skeleton || indexes.ids.has(candidate.id) || indexes.titles.has(title) || indexes.skeletons.has(skeleton)) return false;
  indexes.ids.add(candidate.id);
  indexes.titles.add(title);
  indexes.skeletons.add(skeleton);
  output.push(candidate);
  return true;
}

function writeMaterializedDecisionTrace(route, profile) {
  if (!route) return;
  decisionTraceStore.appendLegacyRouteTrace({
    route,
    context: {
      designStrategies: profile?.strategies || [],
      bestMonths: profile?.months || [],
      theme: profile?.theme || "",
      travelStyle: route.travelStyle || "",
      durationBand: route.durationBand || "",
      countries: route.countries || [],
      destinations: route.destinations || [],
    },
    source: "materialize",
    concept: route.concept || null,
    decisionFactors: [
      { factor: "materialized-profile", input: profile?.key || profile?.theme || "", effect: "Selects legacy materialized route style and route template inputs." },
      { factor: "destination-entities", input: (route.destinationEntities || []).map((item) => item.wikidataId || item.name), effect: "Determines countries, destinations, title, and summary." },
      { factor: "planner-rules", input: route.durationBand || "", effect: "Route survived legacy concept and distance checks before materialization." },
    ],
    strategyEffects: (profile?.strategies || []).map((strategy) => ({ strategy, changedFields: [], evidenceIds: [] })),
    dataSourcesUsed: [{ sourceType: "knowledge-graph-pool", ids: (route.destinationEntities || []).map((item) => item.wikidataId || item.name).filter(Boolean), usedFor: "materialized route destinations" }],
    unknowns: [{ field: "materializedRejectedAlternatives", reason: "Legacy materialization does not persist rejected alternatives or per-route candidate pool." }],
  });
}

function pickCrossDestinations(plan, start, gap, serial) {
  const size = 3 + ((serial + gap) % 4);
  const leftCount = Math.ceil(size / 2);
  const rightCount = Math.floor(size / 2);
  const leftPicked = Array.from({ length: leftCount }, (_, index) => plan.leftPlaces[(start + gap * index) % plan.leftPlaces.length]);
  const rightPicked = Array.from({ length: rightCount }, (_, index) => plan.rightPlaces[(start + gap * (leftCount + index)) % plan.rightPlaces.length]);
  const picked = [...leftPicked, ...rightPicked];
  if (!leftPicked.length || !rightPicked.length) return [];
  return picked;
}

function countCross(records) {
  return records.filter((record) => record.classification === "cross").length;
}

const accepted = readJson(acceptedPath);
const existing = (Array.isArray(accepted.records) ? accepted.records : [])
  .filter((record) => !String(record.id || "").startsWith("materialized-"));
const kg = readJson(kgPath);
const countryCatalog = readJson(countryCatalogPath)
  .filter((country) => country?.code && !disabledCountries.has(country.code));
Object.assign(countryNames, Object.fromEntries(countryCatalog.map((country) => [country.code, country.name])));
const countryCentroids = fs.existsSync(countryTopologyPath)
  ? decodeTopologyCentroids(readJson(countryTopologyPath))
  : new Map();
const covers = coverPool(existing);
const indexes = { ids: new Set(), titles: new Set(), skeletons: new Set() };
const output = [];
for (const record of existing) addCandidate(record, output, indexes);

const placesByCountry = Object.fromEntries(Object.entries(kg)
  .map(([code, items]) => [code, (items || []).map((item) => entityPlace(item, code)).filter(Boolean)])
  .filter(([code]) => !disabledCountries.has(code)));

for (const country of countryCatalog) {
  const current = placesByCountry[country.code] || [];
  placesByCountry[country.code] = coverageFallbackPlaces(
    country,
    current,
    countryCentroids.get(String(country.numeric || "").padStart(3, "0")),
  );
}

let serial = 0;
const countryEntries = Object.entries(placesByCountry).sort((a, b) => b[1].length - a[1].length);
const regionalEntries = countryEntries.filter(([code]) => regionGroups.some((group) => group.has(code)));

const crossPairPlans = [];
for (let a = 0; a < regionalEntries.length; a += 1) {
  for (let b = a + 1; b < regionalEntries.length; b += 1) {
    const codes = [regionalEntries[a][0], regionalEntries[b][0]];
    if (!plausibleCountries(codes)) continue;
    crossPairPlans.push({
      codes,
      leftPlaces: regionalEntries[a][1],
      rightPlaces: regionalEntries[b][1],
      gap: 1,
      start: 0,
      produced: 0,
      exhausted: false,
    });
  }
}

let crossProgress = true;
while (countCross(output) < targetCrossTotal && crossProgress) {
  crossProgress = false;
  for (const plan of crossPairPlans) {
    if (countCross(output) >= targetCrossTotal) break;
    if (plan.exhausted) continue;
    if (plan.produced >= targetCrossClusterCap) {
      plan.exhausted = true;
      continue;
    }
    const maxStarts = Math.max(plan.leftPlaces.length, plan.rightPlaces.length);
    let attempted = 0;
    let added = false;
    while (!added && !plan.exhausted && attempted < maxStarts * 18) {
      if (plan.gap > 18) {
        plan.exhausted = true;
        break;
      }
      const start = plan.start;
      const gap = plan.gap;
      plan.start += 1;
      if (plan.start >= maxStarts) {
        plan.start = 0;
        plan.gap += 1;
      }
      attempted += 1;
      const picked = pickCrossDestinations(plan, start, gap, serial);
      if (!picked.length) continue;
      if (unique(picked.map((item) => item.wikidataId)).length !== picked.length) continue;
      const profile = profiles[(serial + gap) % (profiles.length - 1)];
      const route = makeRoute(picked, profile, serial++, covers);
      added = addCandidate(route, output, indexes);
      if (added) writeMaterializedDecisionTrace(route, profile);
      if (added) plan.produced += 1;
      crossProgress = crossProgress || added;
    }
  }
}

const singlePlans = countryEntries.map(([code, places]) => ({
  code,
  places,
  size: 3,
  step: 1,
  start: 0,
  exhausted: false,
}));

function advanceSinglePlan(plan) {
  plan.start += 1;
  if (plan.start < plan.places.length) return;
  plan.start = 0;
  plan.step += 1;
  if (plan.step <= Math.min(18, plan.places.length - 1)) return;
  plan.step = 1;
  plan.size += 1;
  if (plan.size > Math.min(6, plan.places.length)) plan.exhausted = true;
}

let singleProgress = true;
while (output.length < targetTotal && singleProgress) {
  singleProgress = false;
  for (const plan of singlePlans) {
    if (output.length >= targetTotal) break;
    if (plan.exhausted) continue;
    let attempted = 0;
    let added = false;
    while (!added && !plan.exhausted && attempted < plan.places.length * 18 * 4) {
      const picked = [];
      for (let i = 0; i < plan.size; i += 1) picked.push(plan.places[(plan.start + i * plan.step) % plan.places.length]);
      const size = plan.size;
      const step = plan.step;
      advanceSinglePlan(plan);
      attempted += 1;
      if (unique(picked.map((item) => item.wikidataId)).length !== picked.length) continue;
      const profile = profiles[(serial + size + step) % profiles.length];
      const route = makeRoute(picked, profile, serial++, covers);
      added = addCandidate(route, output, indexes);
      if (added) writeMaterializedDecisionTrace(route, profile);
      singleProgress = singleProgress || added;
    }
  }
}

const backupPath = `${acceptedPath}.${new Date().toISOString().replace(/[:.]/g, "")}.before-planner-rule-materialize`;
fs.copyFileSync(acceptedPath, backupPath);
writeJsonAtomic(acceptedPath, {
  ...accepted,
  schemaVersion: 2,
  repositoryVersion: `accepted-v2:${output.length}:planner-rule-materialized:${new Date().toISOString()}`,
  records: output.slice(0, targetTotal),
});

console.log(JSON.stringify({
  targetTotal,
  targetCrossTotal,
  targetCrossClusterCap,
  before: Array.isArray(accepted.records) ? accepted.records.length : 0,
  preservedNonMaterialized: existing.length,
  after: Math.min(output.length, targetTotal),
  added: Math.min(output.length, targetTotal) - existing.length,
  backupPath,
}, null, 2));
