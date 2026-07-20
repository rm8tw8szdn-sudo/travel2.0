import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  dedupeKnowledgeCityEntities,
  normalizeKnowledgeCityBaseline,
  validateKnowledgeCityEntitySet,
} from "../src/lib/routes/index.mjs";

const SCRIPT_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = path.resolve(SCRIPT_DIRECTORY, "..");
const RAW_RELATIVE_PATH = "data/knowledge/raw/cities-p1b-pilot.wikidata.json";
const RAW_PATH = path.join(REPOSITORY_ROOT, RAW_RELATIVE_PATH);

export const CITY_BASELINE_P1B_PILOT_SEEDS = Object.freeze([
  Object.freeze({
    wikidataId: "Q1490",
    expectedNameEn: "Tokyo",
    parentCountryEntityId: "country-a0509b9eab0ea9ce",
  }),
  Object.freeze({
    wikidataId: "Q34600",
    expectedNameEn: "Kyoto",
    parentCountryEntityId: "country-a0509b9eab0ea9ce",
  }),
  Object.freeze({
    wikidataId: "Q406",
    expectedNameEn: "Istanbul",
    parentCountryEntityId: "country-03919f1fd24fd3dc",
    crossContinentReview: true,
  }),
  Object.freeze({
    wikidataId: "Q3640",
    expectedNameEn: "Ankara",
    parentCountryEntityId: "country-03919f1fd24fd3dc",
  }),
  Object.freeze({
    wikidataId: "Q334",
    expectedNameEn: "Singapore",
    parentCountryEntityId: "country-e0a550ef5a59c6f9",
  }),
]);

export const CITY_BASELINE_P1B_COUNTRY_ASSET_RELATIVE_PATHS = Object.freeze([
  "data/knowledge/countries.p1a-pilot.json",
  "data/knowledge/batches/countries.p1a-batch01.json",
  "data/knowledge/batches/countries.p1a-batch02.json",
]);

export const CITY_BASELINE_P1B_PUBLISH_RELATIVE_PATHS = Object.freeze({
  cities: "data/knowledge/cities.p1b-pilot.json",
  provenance: "data/knowledge/provenance.cities.p1b-pilot.json",
  conflicts: "data/knowledge/conflicts.p1b-pilot.json",
  reviewQueue: "data/knowledge/review-queue.p1b-pilot.json",
});

function serializeJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function combineUniqueIssues(issues, idField) {
  const byId = new Map(issues.map((issue) => [issue[idField], issue]));
  return [...byId.values()].sort((left, right) => left[idField].localeCompare(right[idField], "en"));
}

function pruneWikidataEntity(entity) {
  if (!entity || entity.missing !== undefined) {
    return entity ? { id: entity.id, missing: entity.missing } : undefined;
  }

  return {
    pageid: entity.pageid,
    ns: entity.ns,
    title: entity.title,
    lastrevid: entity.lastrevid,
    modified: entity.modified,
    type: entity.type,
    id: entity.id,
    labels: entity.labels || {},
    aliases: entity.aliases || {},
    claims: {
      P17: entity.claims?.P17 || [],
      P625: entity.claims?.P625 || [],
    },
  };
}

export async function loadKnowledgeCityBaselineP1bCountries(repositoryRoot = REPOSITORY_ROOT) {
  const assets = await Promise.all(CITY_BASELINE_P1B_COUNTRY_ASSET_RELATIVE_PATHS.map(async (relativePath) => {
    const contents = await readFile(path.join(repositoryRoot, relativePath), "utf8");
    return JSON.parse(contents);
  }));
  return assets.flatMap((asset) => asset.countries || []);
}

export async function refreshKnowledgeCityBaselineP1bRawSnapshot({ fetchImplementation = globalThis.fetch } = {}) {
  if (typeof fetchImplementation !== "function") throw new Error("wikidata-fetch-unavailable");
  const qids = CITY_BASELINE_P1B_PILOT_SEEDS.map((seed) => seed.wikidataId);
  const endpoint = new URL("https://www.wikidata.org/w/api.php");
  endpoint.search = new URLSearchParams({
    action: "wbgetentities",
    format: "json",
    props: "labels|aliases|claims",
    languages: "en|zh-hans|zh|ja|tr|ms|ta",
    ids: qids.join("|"),
    origin: "*",
  }).toString();

  const response = await fetchImplementation(endpoint, {
    headers: {
      accept: "application/json",
      "user-agent": "travel-collection-route-v2-city-baseline-p1b/1.0",
    },
  });
  if (!response.ok) throw new Error(`wikidata-fetch-failed:${response.status}`);
  const wikidataResponse = await response.json();
  const entities = {};
  for (const qid of qids) entities[qid] = pruneWikidataEntity(wikidataResponse?.entities?.[qid]);

  return {
    schemaVersion: "route-v2-city-baseline-p1b-raw",
    retrievedAt: new Date().toISOString(),
    source: {
      provider: "wikidata-api",
      endpoint: endpoint.toString(),
      cityCount: qids.length,
      wikidataIds: qids,
    },
    wikidata: {
      success: wikidataResponse?.success,
      entities,
    },
  };
}

export function buildKnowledgeCityBaselineP1bAssets({ rawSnapshot, countries }) {
  const normalized = normalizeKnowledgeCityBaseline({
    rawSnapshot,
    citySeeds: CITY_BASELINE_P1B_PILOT_SEEDS,
    countries,
  });
  const deduped = dedupeKnowledgeCityEntities(normalized.cities, { countries });
  const conflicts = combineUniqueIssues([...normalized.conflicts, ...deduped.conflicts], "conflictId");
  const reviewQueue = combineUniqueIssues([...normalized.reviewQueue, ...deduped.reviewQueue], "reviewId");
  const provenance = Object.fromEntries(normalized.cities.map((city) => [city.entityId, city.provenance]));

  return {
    citiesAsset: {
      schemaVersion: "route-v2-city-baseline-p1b-pilot",
      generatedFrom: RAW_RELATIVE_PATH,
      cityCount: normalized.cities.length,
      cities: normalized.cities,
    },
    provenanceAsset: {
      schemaVersion: "route-v2-city-baseline-provenance-p1b-pilot",
      generatedFrom: RAW_RELATIVE_PATH,
      cityCount: normalized.cities.length,
      provenance,
    },
    conflictsAsset: {
      schemaVersion: "route-v2-city-baseline-conflicts-p1b-pilot",
      blockingCount: conflicts.filter((conflict) => conflict.severity === "blocking").length,
      conflictCount: conflicts.length,
      conflicts,
    },
    reviewQueueAsset: {
      schemaVersion: "route-v2-city-baseline-review-p1b-pilot",
      reviewCount: reviewQueue.length,
      reviewQueue,
    },
  };
}

export function serializeKnowledgeCityBaselineP1bAssets(assets) {
  return {
    cities: serializeJson(assets.citiesAsset),
    provenance: serializeJson(assets.provenanceAsset),
    conflicts: serializeJson(assets.conflictsAsset),
    reviewQueue: serializeJson(assets.reviewQueueAsset),
  };
}

async function writePublishedAssets(assets) {
  const serialized = serializeKnowledgeCityBaselineP1bAssets(assets);
  await Promise.all(Object.entries(CITY_BASELINE_P1B_PUBLISH_RELATIVE_PATHS).map(async ([key, relativePath]) => {
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
    const refreshed = await refreshKnowledgeCityBaselineP1bRawSnapshot();
    await mkdir(path.dirname(RAW_PATH), { recursive: true });
    await writeFile(RAW_PATH, serializeJson(refreshed), "utf8");
  }

  const rawSnapshot = JSON.parse(await readFile(RAW_PATH, "utf8"));
  const countries = await loadKnowledgeCityBaselineP1bCountries();
  const assets = buildKnowledgeCityBaselineP1bAssets({ rawSnapshot, countries });
  const validation = validateKnowledgeCityEntitySet(assets.citiesAsset.cities);
  if (!validation.accepted) throw new Error(`city-schema-validation-failed:${validation.reasons.join("|")}`);
  if (assets.citiesAsset.cityCount !== CITY_BASELINE_P1B_PILOT_SEEDS.length) {
    throw new Error(`city-count-invalid:${assets.citiesAsset.cityCount}`);
  }
  if (assets.conflictsAsset.blockingCount !== 0 || assets.conflictsAsset.conflictCount !== 0) {
    throw new Error(`city-conflicts-present:${JSON.stringify(assets.conflictsAsset.conflicts)}`);
  }

  await writePublishedAssets(assets);
  process.stdout.write(`${JSON.stringify({
    status: "PASS",
    mode: args.includes("--refresh") ? "network-refresh-then-publish" : "offline-publish",
    cityCount: assets.citiesAsset.cityCount,
    conflictCount: assets.conflictsAsset.conflictCount,
    reviewCount: assets.reviewQueueAsset.reviewCount,
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
