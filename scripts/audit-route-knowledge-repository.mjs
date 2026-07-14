import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { classifyKnowledgeEntitySource } from "../src/lib/routes/knowledge-entity-normalizer.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function readJson(relativePath, fallback = null) {
  const fullPath = path.resolve(projectRoot, relativePath);
  if (!fs.existsSync(fullPath)) return fallback;
  return JSON.parse(fs.readFileSync(fullPath, "utf8"));
}

function clean(value) {
  return String(value || "").trim();
}

function countryCode(value) {
  return clean(value).toUpperCase();
}

function stableId(entity = {}) {
  return clean(entity.entityId || entity.wikidataId || entity.qid || entity.id || entity.destinationId || entity.name);
}

function canonicalName(entity = {}) {
  return clean(entity.canonicalName || entity.name || entity.label || entity.title || entity.sourceTitle);
}

function hasCoordinate(entity = {}) {
  const latitude = Number(entity.latitude ?? entity.lat ?? entity.coordinates?.latitude);
  const longitude = Number(entity.longitude ?? entity.lon ?? entity.lng ?? entity.coordinates?.longitude);
  return Number.isFinite(latitude)
    && Number.isFinite(longitude)
    && latitude >= -90
    && latitude <= 90
    && longitude >= -180
    && longitude <= 180;
}

function flattenKnowledgeGraph(pool = {}) {
  return Object.entries(pool || {}).flatMap(([code, items]) => (
    Array.isArray(items) ? items.map((item) => ({ ...item, poolCountryCode: code })) : []
  ));
}

function parseSearchFallbacks() {
  const fullPath = path.resolve(projectRoot, "src/lib/routes/search-knowledge-graph-fallbacks.mjs");
  if (!fs.existsSync(fullPath)) return [];
  const text = fs.readFileSync(fullPath, "utf8");
  return [...text.matchAll(/destination\(\{\s*wikidataId:\s*"([^"]+)"[\s\S]*?countryCode:\s*"([^"]+)"[\s\S]*?name:\s*"([^"]+)"/gu)]
    .map((match) => ({
      wikidataId: match[1],
      countryCode: match[2],
      name: match[3],
      entitySourceType: "search-fallback",
      provenance: { providerId: "local-search-fallback" },
    }));
}

function entityStats(entities = []) {
  const sourceTypes = new Map();
  const countries = new Map();
  const ids = new Map();
  const names = new Map();
  let qid = 0;
  let anchor = 0;
  let coverage = 0;
  let search = 0;
  let missingCountryCode = 0;
  let missingCoordinates = 0;
  let missingStableId = 0;
  let missingProvenance = 0;
  for (const entity of entities) {
    const entitySourceType = classifyKnowledgeEntitySource(entity);
    sourceTypes.set(entitySourceType, (sourceTypes.get(entitySourceType) || 0) + 1);
    const id = stableId(entity);
    if (/^Q\d+$/u.test(id)) qid += 1;
    if (/^anchor:/iu.test(id)) anchor += 1;
    if (/^coverage:/iu.test(id)) coverage += 1;
    if (/^search-/iu.test(id)) search += 1;
    if (!id) missingStableId += 1;
    if (!hasCoordinate(entity)) missingCoordinates += 1;
    if (!entity.provenance?.providerId && !entity.sourceUrl && !entity.provider) missingProvenance += 1;
    const code = countryCode(entity.countryCode || entity.country || entity.poolCountryCode);
    if (!code) missingCountryCode += 1;
    else countries.set(code, (countries.get(code) || 0) + 1);
    if (id) ids.set(id, (ids.get(id) || 0) + 1);
    const nameKey = `${canonicalName(entity).toLowerCase()}|${code}`;
    if (canonicalName(entity) && code) names.set(nameKey, (names.get(nameKey) || 0) + 1);
  }
  return {
    total: entities.length,
    byEntitySourceType: Object.fromEntries([...sourceTypes.entries()].sort()),
    qid,
    anchor,
    coverage,
    search,
    missingCountryCode,
    missingCoordinates,
    missingStableId,
    missingProvenance,
    duplicateStableIdCount: [...ids.values()].filter((count) => count > 1).length,
    duplicateNameCountryCount: [...names.values()].filter((count) => count > 1).length,
    countryCoverage: Object.fromEntries([...countries.entries()].sort((a, b) => a[0].localeCompare(b[0]))),
  };
}

function evidenceStats(evidence = []) {
  const byType = new Map();
  const byProvider = new Map();
  let routeRecordDerived = 0;
  let missingCandidateId = 0;
  let missingSupportsWhichDecision = 0;
  for (const item of evidence) {
    byType.set(clean(item.evidenceType || item.type || "unknown"), (byType.get(clean(item.evidenceType || item.type || "unknown")) || 0) + 1);
    byProvider.set(clean(item.provider || item.provenance?.providerId || "unknown"), (byProvider.get(clean(item.provider || item.provenance?.providerId || "unknown")) || 0) + 1);
    if (item.routeId || item.sourceRouteId || item.provenance?.sourceRouteId) routeRecordDerived += 1;
    if (!item.candidateId) missingCandidateId += 1;
    if (!item.supportsWhichDecision) missingSupportsWhichDecision += 1;
  }
  return {
    total: evidence.length,
    routeRecordDerived,
    missingCandidateId,
    missingSupportsWhichDecision,
    byType: Object.fromEntries([...byType.entries()].sort((a, b) => b[1] - a[1])),
    byProvider: Object.fromEntries([...byProvider.entries()].sort((a, b) => b[1] - a[1])),
  };
}

export function auditRouteKnowledgeRepository() {
  const knowledgeGraph = readJson(".route-v2-cache/knowledge-graph-pool.json", {});
  const accepted = readJson(".route-v2-cache/accepted-routes.json", { records: [] });
  const legacyEvidence = readJson(".route-v2-cache/route-evidence.json", { evidence: [] });
  const countries = readJson("data/countries.zh.json", []);
  const kgEntities = flattenKnowledgeGraph(knowledgeGraph);
  const acceptedDestinationEntities = (accepted.records || []).flatMap((record) => (
    record.destinationEntities || []
  ).map((entity) => ({ ...entity, sourceRouteId: record.id })));
  const acceptedCountryEntities = (accepted.records || []).flatMap((record) => (
    record.countryEntities || []
  ).map((entity) => ({ ...entity, sourceRouteId: record.id })));
  const acceptedCountries = new Set(acceptedDestinationEntities.map((item) => countryCode(item.countryCode)).filter(Boolean));
  const kgCountries = new Set(kgEntities.map((item) => countryCode(item.countryCode || item.poolCountryCode)).filter(Boolean));
  return {
    generatedAt: new Date().toISOString(),
    files: {
      knowledgeGraphPool: ".route-v2-cache/knowledge-graph-pool.json",
      acceptedRoutes: ".route-v2-cache/accepted-routes.json",
      legacyEvidence: ".route-v2-cache/route-evidence.json",
      countryCatalog: "data/countries.zh.json",
      searchFallbacks: "src/lib/routes/search-knowledge-graph-fallbacks.mjs",
    },
    acceptedRoutes: {
      total: (accepted.records || []).length,
      countries: acceptedCountries.size,
      kgMissingCountries: [...acceptedCountries].filter((code) => !kgCountries.has(code)).sort(),
    },
    knowledgeGraph: entityStats(kgEntities),
    acceptedDestinationEntities: entityStats(acceptedDestinationEntities),
    acceptedCountryEntities: entityStats(acceptedCountryEntities),
    searchFallbackEntities: entityStats(parseSearchFallbacks()),
    countryCatalog: {
      total: Array.isArray(countries) ? countries.length : 0,
      fields: Array.isArray(countries) ? [...new Set(countries.flatMap((item) => Object.keys(item)))] : [],
      missingQid: Array.isArray(countries) ? countries.filter((item) => !item.wikidataId && !item.qid).length : 0,
    },
    legacyEvidence: evidenceStats(legacyEvidence.evidence || []),
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify(auditRouteKnowledgeRepository(), null, 2));
}
