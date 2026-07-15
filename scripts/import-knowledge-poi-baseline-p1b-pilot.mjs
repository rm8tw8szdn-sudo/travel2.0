import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  dedupeKnowledgePoiEntities,
  normalizeKnowledgePoiBaseline,
  validateKnowledgePoiEntitySet,
} from "../src/lib/routes/index.mjs";
import { buildKnowledgeCityBaselineP1bAssets } from "./import-knowledge-city-baseline-p1b-pilot.mjs";

const SCRIPT_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = path.resolve(SCRIPT_DIRECTORY, "..");
const RAW_RELATIVE_PATH = "data/knowledge/raw/pois-p1b-pilot.wikidata.json";
const RAW_PATH = path.join(REPOSITORY_ROOT, RAW_RELATIVE_PATH);
const CITY_RAW_RELATIVE_PATH = "data/knowledge/raw/cities-p1b-pilot.wikidata.json";

export const POI_BASELINE_P1B_PILOT_SEEDS = Object.freeze([
  Object.freeze({ wikidataId: "Q615183", expectedNameEn: "Sensō-ji Temple", parentCityEntityId: "city-5a21732f861ff7f1", expectedCityWikidataId: "Q1490", expectedCountryWikidataId: "Q17" }),
  Object.freeze({ wikidataId: "Q183536", expectedNameEn: "Tokyo Tower", parentCityEntityId: "city-5a21732f861ff7f1", expectedCityWikidataId: "Q1490", expectedCountryWikidataId: "Q17" }),
  Object.freeze({ wikidataId: "Q287165", expectedNameEn: "Meiji Jingū", parentCityEntityId: "city-5a21732f861ff7f1", expectedCityWikidataId: "Q1490", expectedCountryWikidataId: "Q17" }),
  Object.freeze({ wikidataId: "Q221716", expectedNameEn: "Kiyomizu-dera Temple", parentCityEntityId: "city-8acaf08893e5abf1", expectedCityWikidataId: "Q34600", expectedCountryWikidataId: "Q17" }),
  Object.freeze({ wikidataId: "Q714828", expectedNameEn: "Fushimi Inari-taisha", parentCityEntityId: "city-8acaf08893e5abf1", expectedCityWikidataId: "Q34600", expectedCountryWikidataId: "Q17" }),
  Object.freeze({ wikidataId: "Q270983", expectedNameEn: "Kinkaku-ji Temple", parentCityEntityId: "city-8acaf08893e5abf1", expectedCityWikidataId: "Q34600", expectedCountryWikidataId: "Q17" }),
  Object.freeze({ wikidataId: "Q12506", expectedNameEn: "Hagia Sophia", parentCityEntityId: "city-fc91a9c6c7b389cf", expectedCityWikidataId: "Q406", expectedCountryWikidataId: "Q43" }),
  Object.freeze({ wikidataId: "Q170495", expectedNameEn: "Topkapı Palace", parentCityEntityId: "city-fc91a9c6c7b389cf", expectedCityWikidataId: "Q406", expectedCountryWikidataId: "Q43" }),
  Object.freeze({ wikidataId: "Q80541", expectedNameEn: "Sultan Ahmed Mosque", parentCityEntityId: "city-fc91a9c6c7b389cf", expectedCityWikidataId: "Q406", expectedCountryWikidataId: "Q43", expectedDescriptionCityNameEn: "Istanbul", canonicalNameZhFromAlias: "苏丹艾哈迈德清真寺" }),
  Object.freeze({ wikidataId: "Q615404", expectedNameEn: "Anıtkabir", parentCityEntityId: "city-d6f6bf7d2fca5cb4", expectedCityWikidataId: "Q3640", expectedCountryWikidataId: "Q43" }),
  Object.freeze({ wikidataId: "Q754322", expectedNameEn: "Museum of Anatolian Civilizations", parentCityEntityId: "city-d6f6bf7d2fca5cb4", expectedCityWikidataId: "Q3640", expectedCountryWikidataId: "Q43" }),
  Object.freeze({ wikidataId: "Q206225", expectedNameEn: "Ankara Castle", parentCityEntityId: "city-d6f6bf7d2fca5cb4", expectedCityWikidataId: "Q3640", expectedCountryWikidataId: "Q43" }),
  Object.freeze({ wikidataId: "Q6819812", expectedNameEn: "Merlion Park", parentCityEntityId: "city-dde074f983b42cfd", expectedCityWikidataId: "Q334", expectedCountryWikidataId: "Q334", cityStateParent: true }),
  Object.freeze({ wikidataId: "Q630135", expectedNameEn: "Gardens by the Bay", parentCityEntityId: "city-dde074f983b42cfd", expectedCityWikidataId: "Q334", expectedCountryWikidataId: "Q334", cityStateParent: true }),
  Object.freeze({ wikidataId: "Q632689", expectedNameEn: "National Museum of Singapore", parentCityEntityId: "city-dde074f983b42cfd", expectedCityWikidataId: "Q334", expectedCountryWikidataId: "Q334", cityStateParent: true }),
]);

export const POI_BASELINE_P1B_COUNTRY_ASSET_RELATIVE_PATHS = Object.freeze([
  "data/knowledge/countries.p1a-pilot.json",
  "data/knowledge/batches/countries.p1a-batch01.json",
  "data/knowledge/batches/countries.p1a-batch02.json",
]);
export const POI_BASELINE_P1B_CITY_ASSET_RELATIVE_PATH = "data/knowledge/cities.p1b-pilot.json";
export const POI_BASELINE_P1B_CUMULATIVE_CONFLICTS_RELATIVE_PATH = "data/knowledge/conflicts.p1b-pilot.json";
export const POI_BASELINE_P1B_CUMULATIVE_REVIEW_RELATIVE_PATH = "data/knowledge/review-queue.p1b-pilot.json";
export const POI_BASELINE_P1B_PUBLISH_RELATIVE_PATHS = Object.freeze({
  pois: "data/knowledge/pois.p1b-pilot.json",
  provenance: "data/knowledge/provenance.pois.p1b-pilot.json",
  conflicts: POI_BASELINE_P1B_CUMULATIVE_CONFLICTS_RELATIVE_PATH,
  reviewQueue: POI_BASELINE_P1B_CUMULATIVE_REVIEW_RELATIVE_PATH,
});

function serializeJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function combineUniqueIssues(issues, idField) {
  const byId = new Map(issues.filter((issue) => issue?.[idField]).map((issue) => [issue[idField], issue]));
  return [...byId.values()].sort((left, right) => left[idField].localeCompare(right[idField], "en"));
}

function pruneWikidataEntity(entity) {
  if (!entity || entity.missing !== undefined) return entity ? { id: entity.id, missing: entity.missing } : undefined;
  return {
    pageid: entity.pageid,
    ns: entity.ns,
    title: entity.title,
    lastrevid: entity.lastrevid,
    modified: entity.modified,
    type: entity.type,
    id: entity.id,
    labels: entity.labels || {},
    descriptions: entity.descriptions || {},
    aliases: entity.aliases || {},
    claims: Object.fromEntries(["P17", "P31", "P131", "P276", "P625"].map((property) => [
      property,
      entity.claims?.[property] || [],
    ])),
  };
}

function qidFromEntityUri(value) {
  return String(value || "").match(/Q\d+$/u)?.[0] || "";
}

function buildParentVerificationQuery() {
  const values = POI_BASELINE_P1B_PILOT_SEEDS
    .map((seed) => `(wd:${seed.wikidataId} wd:${seed.expectedCityWikidataId} wd:${seed.expectedCountryWikidataId})`)
    .join(" ");
  return `SELECT DISTINCT ?item ?city ?country ?evidenceType WHERE {
    VALUES (?item ?city ?country) { ${values} }
    { ?item wdt:P131* ?city . BIND("administrative-path" AS ?evidenceType) }
    UNION { ?item wdt:P276 ?city . BIND("direct-location" AS ?evidenceType) }
    UNION { ?item wdt:P17 ?country . BIND("country-match" AS ?evidenceType) }
  }`;
}

export async function loadKnowledgePoiBaselineP1bContext(repositoryRoot = REPOSITORY_ROOT) {
  const countryAssets = await Promise.all(POI_BASELINE_P1B_COUNTRY_ASSET_RELATIVE_PATHS.map(async (relativePath) => {
    return JSON.parse(await readFile(path.join(repositoryRoot, relativePath), "utf8"));
  }));
  const countries = countryAssets.flatMap((asset) => asset.countries || []);
  const cityRawSnapshot = JSON.parse(await readFile(path.join(repositoryRoot, CITY_RAW_RELATIVE_PATH), "utf8"));
  const cityLayerAssets = buildKnowledgeCityBaselineP1bAssets({ rawSnapshot: cityRawSnapshot, countries });
  return {
    countries,
    cities: JSON.parse(await readFile(path.join(repositoryRoot, POI_BASELINE_P1B_CITY_ASSET_RELATIVE_PATH), "utf8")).cities || [],
    cityConflictsAsset: cityLayerAssets.conflictsAsset,
    cityReviewQueueAsset: cityLayerAssets.reviewQueueAsset,
  };
}

export async function refreshKnowledgePoiBaselineP1bRawSnapshot({ fetchImplementation = globalThis.fetch } = {}) {
  if (typeof fetchImplementation !== "function") throw new Error("wikidata-fetch-unavailable");
  const wikidataIds = POI_BASELINE_P1B_PILOT_SEEDS.map((seed) => seed.wikidataId);
  const entityEndpoint = new URL("https://www.wikidata.org/w/api.php");
  entityEndpoint.search = new URLSearchParams({
    action: "wbgetentities",
    format: "json",
    props: "labels|descriptions|aliases|claims",
    languages: "en|zh-hans|zh|ja|tr|ms|ta",
    ids: wikidataIds.join("|"),
    origin: "*",
  }).toString();
  const parentQuery = buildParentVerificationQuery();
  const parentEndpoint = new URL("https://query.wikidata.org/sparql");
  parentEndpoint.search = new URLSearchParams({ format: "json", query: parentQuery }).toString();
  const headers = {
    accept: "application/json",
    "user-agent": "travel-collection-route-v2-poi-baseline-p1b/1.0",
  };

  const entityResponse = await fetchImplementation(entityEndpoint, { headers });
  if (!entityResponse.ok) throw new Error(`wikidata-entity-fetch-failed:${entityResponse.status}`);
  const entityPayload = await entityResponse.json();
  const parentResponse = await fetchImplementation(parentEndpoint, { headers });
  if (!parentResponse.ok) throw new Error(`wikidata-parent-fetch-failed:${parentResponse.status}`);
  const parentPayload = await parentResponse.json();

  const entities = {};
  for (const qid of wikidataIds) entities[qid] = pruneWikidataEntity(entityPayload?.entities?.[qid]);
  const evidenceByQid = Object.fromEntries(POI_BASELINE_P1B_PILOT_SEEDS.map((seed) => {
    const descriptionEn = entities[seed.wikidataId]?.descriptions?.en?.value || "";
    return [seed.wikidataId, {
      wikidataId: seed.wikidataId,
      expectedCityWikidataId: seed.expectedCityWikidataId,
      expectedCountryWikidataId: seed.expectedCountryWikidataId,
      administrativePath: false,
      directLocation: false,
      descriptionCityMatch: Boolean(seed.expectedDescriptionCityNameEn
        && descriptionEn.toLocaleLowerCase("en").includes(seed.expectedDescriptionCityNameEn.toLocaleLowerCase("en"))),
      countryMatch: false,
    }];
  }));
  for (const binding of parentPayload?.results?.bindings || []) {
    const qid = qidFromEntityUri(binding.item?.value);
    if (!evidenceByQid[qid]) continue;
    if (binding.evidenceType?.value === "administrative-path") evidenceByQid[qid].administrativePath = true;
    if (binding.evidenceType?.value === "direct-location") evidenceByQid[qid].directLocation = true;
    if (binding.evidenceType?.value === "country-match") evidenceByQid[qid].countryMatch = true;
  }

  return {
    schemaVersion: "route-v2-poi-baseline-p1b-raw",
    retrievedAt: new Date().toISOString(),
    source: {
      provider: "wikidata-api-and-query-service",
      entityEndpoint: entityEndpoint.toString(),
      parentVerificationEndpoint: "https://query.wikidata.org/sparql",
      parentVerificationQuery: parentQuery,
      poiCount: wikidataIds.length,
      wikidataIds,
    },
    parentEvidence: evidenceByQid,
    wikidata: {
      success: entityPayload?.success,
      entities,
    },
  };
}

export function buildKnowledgePoiBaselineP1bAssets({
  rawSnapshot,
  countries,
  cities,
  cityConflictsAsset,
  cityReviewQueueAsset,
}) {
  const normalized = normalizeKnowledgePoiBaseline({
    rawSnapshot,
    poiSeeds: POI_BASELINE_P1B_PILOT_SEEDS,
    cities,
  });
  const deduped = dedupeKnowledgePoiEntities(normalized.pois, { countries, cities });
  const conflicts = combineUniqueIssues([
    ...(cityConflictsAsset?.conflicts || []),
    ...normalized.conflicts,
    ...deduped.conflicts,
  ], "conflictId");
  const reviewQueue = combineUniqueIssues([
    ...(cityReviewQueueAsset?.reviewQueue || []),
    ...normalized.reviewQueue,
    ...deduped.reviewQueue,
  ], "reviewId");
  const provenance = Object.fromEntries(normalized.pois.map((poi) => [poi.entityId, poi.provenance]));

  return {
    poisAsset: {
      schemaVersion: "route-v2-poi-baseline-p1b-pilot",
      generatedFrom: RAW_RELATIVE_PATH,
      poiCount: normalized.pois.length,
      pois: normalized.pois,
    },
    provenanceAsset: {
      schemaVersion: "route-v2-poi-baseline-provenance-p1b-pilot",
      generatedFrom: RAW_RELATIVE_PATH,
      poiCount: normalized.pois.length,
      provenance,
    },
    conflictsAsset: {
      schemaVersion: cityConflictsAsset?.schemaVersion || "route-v2-city-baseline-conflicts-p1b-pilot",
      blockingCount: conflicts.filter((conflict) => conflict.severity === "blocking").length,
      conflictCount: conflicts.length,
      conflicts,
    },
    reviewQueueAsset: {
      schemaVersion: cityReviewQueueAsset?.schemaVersion || "route-v2-city-baseline-review-p1b-pilot",
      reviewCount: reviewQueue.length,
      reviewQueue,
    },
  };
}

export function serializeKnowledgePoiBaselineP1bAssets(assets) {
  return {
    pois: serializeJson(assets.poisAsset),
    provenance: serializeJson(assets.provenanceAsset),
    conflicts: serializeJson(assets.conflictsAsset),
    reviewQueue: serializeJson(assets.reviewQueueAsset),
  };
}

async function writePublishedAssets(assets) {
  const serialized = serializeKnowledgePoiBaselineP1bAssets(assets);
  await Promise.all(Object.entries(POI_BASELINE_P1B_PUBLISH_RELATIVE_PATHS).map(async ([key, relativePath]) => {
    const targetPath = path.join(REPOSITORY_ROOT, relativePath);
    await mkdir(path.dirname(targetPath), { recursive: true });
    await writeFile(targetPath, serialized[key], "utf8");
  }));
}

async function main() {
  const args = process.argv.slice(2);
  const unknownArgs = args.filter((argument) => argument !== "--refresh");
  if (unknownArgs.length > 0) throw new Error(`unsupported-arguments:${unknownArgs.join(",")}`);
  if (args.includes("--refresh")) {
    const refreshed = await refreshKnowledgePoiBaselineP1bRawSnapshot();
    await mkdir(path.dirname(RAW_PATH), { recursive: true });
    await writeFile(RAW_PATH, serializeJson(refreshed), "utf8");
  }

  const rawSnapshot = JSON.parse(await readFile(RAW_PATH, "utf8"));
  const context = await loadKnowledgePoiBaselineP1bContext();
  const assets = buildKnowledgePoiBaselineP1bAssets({ rawSnapshot, ...context });
  const validation = validateKnowledgePoiEntitySet(assets.poisAsset.pois);
  if (!validation.accepted) throw new Error(`poi-schema-validation-failed:${validation.reasons.join("|")}`);
  if (assets.poisAsset.poiCount !== POI_BASELINE_P1B_PILOT_SEEDS.length) {
    throw new Error(`poi-count-invalid:${assets.poisAsset.poiCount}`);
  }
  if (assets.conflictsAsset.blockingCount !== 0 || assets.conflictsAsset.conflictCount !== 0) {
    throw new Error(`poi-conflicts-present:${JSON.stringify(assets.conflictsAsset.conflicts)}`);
  }

  await writePublishedAssets(assets);
  const poiEntityIds = new Set(assets.poisAsset.pois.map((poi) => poi.entityId));
  const poiReviewCount = assets.reviewQueueAsset.reviewQueue
    .filter((review) => review.relatedEntityIds?.some((entityId) => poiEntityIds.has(entityId))).length;
  process.stdout.write(`${JSON.stringify({
    status: "PASS",
    mode: args.includes("--refresh") ? "network-refresh-then-publish" : "offline-publish",
    poiCount: assets.poisAsset.poiCount,
    conflictCount: assets.conflictsAsset.conflictCount,
    cumulativeReviewCount: assets.reviewQueueAsset.reviewCount,
    poiReviewCount,
  }, null, 2)}\n`);
}

const invokedAsScript = process.argv[1]
  && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (invokedAsScript) {
  main().catch((error) => {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exitCode = 1;
  });
}
