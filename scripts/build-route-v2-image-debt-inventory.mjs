import assert from "node:assert/strict";
import fs from "node:fs";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { createPublishedKnowledgeEntityLayerRepository } from "../src/lib/routes/index.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");
const MANIFEST_PATH = "data/route-v2/images/image-coverage-manifest.json";
const OUTPUT_PATH = "data/route-v2/images/image-debt-inventory.json";
const PRIOR_PROVENANCE_PATHS = [
  "data/route-v2/images/batch06-dedicated-image-provenance.json",
  "data/route-v2/images/batch07-dedicated-image-provenance.json",
];
const FROZEN_AT = "2026-08-24T08:00:00.000Z";
const SOURCE_MAIN_HEAD = "c2e7fb1e0f371ddf3291d4480617057f43fee52c";
const PRIORITY_ORDER = Object.freeze({ high: 0, normal: 1, low: 2 });

function stableCompare(left, right) {
  return (PRIORITY_ORDER[left.priority] ?? 9) - (PRIORITY_ORDER[right.priority] ?? 9)
    || left.countryCode.localeCompare(right.countryCode, "en")
    || left.entityType.localeCompare(right.entityType, "en")
    || left.canonicalNameEn.localeCompare(right.canonicalNameEn, "en")
    || left.entityId.localeCompare(right.entityId, "en");
}

async function atomicWrite(relativePath, value) {
  const target = path.join(ROOT, relativePath);
  await mkdir(path.dirname(target), { recursive: true });
  const temporary = `${target}.${process.pid}.tmp`;
  try {
    await writeFile(temporary, value);
    await rename(temporary, target);
  } finally {
    await rm(temporary, { force: true });
  }
}

function findExactLocalCandidates(record) {
  const directory = path.join(ROOT, "assets/route-v2-images", record.entityType === "City" ? "cities" : "pois");
  const prefix = `${record.entityType === "City" ? "city" : "poi"}-${record.wikidataId.toLocaleLowerCase("en-US")}.`;
  return fs.existsSync(directory)
    ? fs.readdirSync(directory).filter((name) => name.toLocaleLowerCase("en-US").startsWith(prefix)).map((name) => path.relative(ROOT, path.join(directory, name)).replaceAll("\\", "/"))
    : [];
}

async function main() {
  const manifest = JSON.parse(await readFile(path.join(ROOT, MANIFEST_PATH), "utf8"));
  assert.equal(manifest.schemaVersion, "route-v2-image-coverage-v2", "Image Manifest v2 schema must remain unchanged");
  const repository = createPublishedKnowledgeEntityLayerRepository({ projectRoot: ROOT });
  const countries = repository.listCountries();
  const cities = repository.listCities();
  const pois = repository.listPois();
  const countryById = new Map(countries.map((country) => [country.entityId, country]));
  const cityById = new Map(cities.map((city) => [city.entityId, city]));
  const poiById = new Map(pois.map((poi) => [poi.entityId, poi]));
  const attempts = new Map();
  for (const relativePath of PRIOR_PROVENANCE_PATHS) {
    if (!fs.existsSync(path.join(ROOT, relativePath))) continue;
    const provenance = JSON.parse(await readFile(path.join(ROOT, relativePath), "utf8"));
    for (const record of provenance.attempts || []) attempts.set(record.entityId, { sourcePath: relativePath, ...record });
  }

  const manifestRecords = [...manifest.cities, ...manifest.pois];
  const debts = manifestRecords.filter((record) => record.needsBackfill === true);
  const problems = [];
  const records = debts.map((record) => {
    const entity = record.entityType === "City" ? cityById.get(record.entityId) : poiById.get(record.entityId);
    const parentCity = record.entityType === "POI" ? cityById.get(record.parentCityEntityId) : null;
    const country = record.entityType === "City"
      ? countryById.get(entity?.parentCountryEntityId)
      : countryById.get(parentCity?.parentCountryEntityId);
    const exactLocalCandidates = findExactLocalCandidates(record);
    const expectedProblems = [];
    if (!entity) expectedProblems.push("published-entity-missing");
    if (entity?.wikidataId !== record.wikidataId) expectedProblems.push("qid-mismatch");
    if (country?.isoAlpha2 !== record.countryCode) expectedProblems.push("country-mismatch");
    if (record.entityType === "POI" && entity?.parentCityEntityId !== record.parentCityEntityId) expectedProblems.push("parent-city-mismatch");
    if (record.status !== "placeholder" || record.isDedicated !== false || record.isPlaceholder !== true) expectedProblems.push("placeholder-status-mismatch");
    const expectedPlaceholder = record.entityType === "City" ? manifest.fallbackPolicy.city : manifest.fallbackPolicy.poi;
    if (record.assetPath !== expectedPlaceholder) expectedProblems.push("non-neutral-placeholder");
    if (exactLocalCandidates.length) expectedProblems.push("unmanifested-exact-local-asset");
    if (expectedProblems.length) problems.push({ entityId: record.entityId, problems: expectedProblems, exactLocalCandidates });
    const historicalAttempt = attempts.get(record.entityId) || null;
    return {
      entityId: record.entityId,
      qid: record.wikidataId,
      entityType: record.entityType,
      canonicalNameEn: record.canonicalNameEn,
      countryCode: record.countryCode,
      countryNameEn: country?.canonicalNameEn || null,
      parentCityEntityId: record.parentCityEntityId || null,
      parentCityQid: parentCity?.wikidataId || null,
      parentCityNameEn: parentCity?.canonicalNameEn || null,
      currentPlaceholder: record.assetPath,
      priority: record.backfillPriority,
      routeExposure: record.backfillPriority === "high" ? "high" : record.backfillPriority === "normal" ? "standard" : "long-tail",
      isCorePoi: record.entityType === "POI" ? Boolean(record.core) : false,
      publishedPoiCount: record.entityType === "City" ? Number(record.publishedPoiCount || 0) : 0,
      historicalFailedImage: historicalAttempt ? {
        sourcePath: historicalAttempt.sourcePath,
        status: historicalAttempt.status,
        reason: historicalAttempt.reason,
        commonsFileTitle: historicalAttempt.commonsFileTitle || null,
      } : null,
    };
  }).sort(stableCompare);

  const duplicateEntityIds = records.filter((record, index) => records.findIndex((candidate) => candidate.entityId === record.entityId) !== index).map((record) => record.entityId);
  assert.equal(problems.length, 0, `Image debt inventory validation failed: ${JSON.stringify(problems.slice(0, 10))}`);
  assert.equal(duplicateEntityIds.length, 0, `Duplicate debt entities: ${duplicateEntityIds.join(", ")}`);
  assert.equal(manifest.invalidMappings.length, 0, "Active invalid mappings must remain zero before backfill");
  const document = {
    schemaVersion: "route-v2-image-debt-inventory-v1",
    frozenAt: FROZEN_AT,
    sourceMainHead: SOURCE_MAIN_HEAD,
    sourceManifestSchemaVersion: manifest.schemaVersion,
    startingNeedsBackfill: records.length,
    cityCount: records.filter((record) => record.entityType === "City").length,
    corePoiCount: records.filter((record) => record.entityType === "POI").length,
    validation: {
      entityMissing: 0,
      qidMismatch: 0,
      countryMismatch: 0,
      parentMismatch: 0,
      nonNeutralPlaceholder: 0,
      manifestOmission: 0,
      duplicateEntityIds: 0,
    },
    records,
  };
  await atomicWrite(OUTPUT_PATH, `${JSON.stringify(document, null, 2)}\n`);
  console.log(JSON.stringify({
    status: "PASS",
    output: OUTPUT_PATH,
    startingNeedsBackfill: document.startingNeedsBackfill,
    cities: document.cityCount,
    corePois: document.corePoiCount,
    validation: document.validation,
  }, null, 2));
}

await main();
