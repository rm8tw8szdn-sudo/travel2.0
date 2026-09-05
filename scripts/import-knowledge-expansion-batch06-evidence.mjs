import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createPublishedKnowledgeEntityLayerRepository } from "../src/lib/routes/index.mjs";
import { normalizeLocalEvidenceSource, sha256EvidenceContent } from "../src/lib/routes/local-evidence-source-schema.mjs";
import { normalizeRouteLegEvidence, validateRouteLegEvidence } from "../src/lib/routes/route-leg-evidence-schema.mjs";
import { normalizeSeasonEvidence, validateSeasonEvidence } from "../src/lib/routes/season-evidence-schema.mjs";
import { stableHash } from "../src/lib/routes/route-v2-utils.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BATCH = String(process.argv.find((value) => value.startsWith("--batch="))?.split("=")[1] || "06").padStart(2, "0");
if (!["06", "07", "08", "09"].includes(BATCH)) throw new Error("batch-argument-invalid:--batch=06|07|08|09");
const CONFIG_PATH = `data/knowledge/seeds/knowledge-expansion-batch${BATCH}-evidence.json`;
const ROUTE_LEG_PATH = "data/route-v2/evidence-seed/route-leg-evidence.jsonl";
const SEASON_PATH = "data/route-v2/evidence-seed/season-evidence.jsonl";
const MANIFEST_PATH = "data/route-v2/evidence-seed/evidence-seed-manifest.json";
const AUDIT_PATH = `data/knowledge/batches/knowledge-expansion-batch${BATCH}-evidence-audit.json`;
const ISO = String(process.argv.find((value) => value.startsWith("--country="))?.split("=")[1] || "").toUpperCase();

function parseJsonl(text) {
  return text.split(/\r?\n/u).filter(Boolean).map((line) => JSON.parse(line));
}

function upsert(records, additions, key) {
  return [...new Map([...records, ...additions].map((record) => [record[key], record])).values()]
    .sort((left, right) => left[key].localeCompare(right[key], "en"));
}

function evidenceSource(definition, supports, retrievedAt, confidence = 0.88) {
  const url = new URL(definition.url);
  if (url.protocol !== "https:") throw new Error(`evidence-source-not-https:${definition.url}`);
  if (!definition.locator || !definition.excerpt) throw new Error(`evidence-source-incomplete:${definition.url}`);
  return normalizeLocalEvidenceSource({
    url: url.href,
    supports,
    retrievedAt,
    confidence,
    factLocator: definition.locator,
    factExcerpt: definition.excerpt,
    contentHash: sha256EvidenceContent(definition.excerpt),
  });
}

function routeLeg(fromEntityId, toEntityId, mode, definition, retrievedAt) {
  const supports = [`route-leg:${fromEntityId}>${toEntityId}:feasibility`];
  const source = evidenceSource(definition, supports, retrievedAt);
  const record = normalizeRouteLegEvidence({
    fromEntityId,
    toEntityId,
    transportMode: mode,
    directed: true,
    feasibilityStatus: "feasible",
    durationMinMinutes: null,
    durationMaxMinutes: null,
    transferCount: null,
    frequencyLevel: "unknown",
    sourceRefs: [source.sourceId],
    sources: [source],
    confidence: 0.88,
    freshnessStatus: "fresh",
    retrievedAt,
    expiresAt: null,
    unknowns: [
      { field: "duration", reason: "The official source confirms the route family; timetable-dependent duration is intentionally unknown." },
      { field: "transferCount", reason: "A stable reusable transfer count is not asserted." },
      { field: "frequencyLevel", reason: "A stable reusable frequency is not asserted." }
    ],
    conflicts: [],
    diagnostics: [],
    createdAt: retrievedAt,
    updatedAt: retrievedAt
  }, { now: () => retrievedAt });
  const validation = validateRouteLegEvidence(record);
  if (!validation.accepted) throw new Error(`invalid-leg:${validation.reasons.join("|")}`);
  return validation.record;
}

function monthRisk(entityId, month, weatherRisks, definition, retrievedAt) {
  const supports = [`season:${entityId}:${month}:risk`];
  const source = evidenceSource(definition, supports, retrievedAt, 0.82);
  const record = normalizeSeasonEvidence({
    entityId,
    month,
    season: null,
    suitabilityStatus: "unknown",
    weatherRisks,
    transportRisks: [],
    closureRisks: [],
    recommendedBufferMinutes: null,
    sourceRefs: [source.sourceId],
    sources: [source],
    confidence: 0.82,
    freshnessStatus: "fresh",
    retrievedAt,
    expiresAt: null,
    unknowns: [{ field: "seasonSuitability", reason: "Objective hazard only; no best-month or subjective suitability claim is inferred." }],
    conflicts: [],
    diagnostics: [],
    createdAt: retrievedAt,
    updatedAt: retrievedAt
  }, { now: () => retrievedAt });
  const validation = validateSeasonEvidence(record);
  if (!validation.accepted) throw new Error(`invalid-season:${validation.reasons.join("|")}`);
  return validation.record;
}

async function atomicText(relativePath, contents) {
  const filePath = path.join(ROOT, relativePath);
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.${process.pid}.tmp`;
  try {
    await writeFile(temporary, contents, "utf8");
    await rename(temporary, filePath);
  } finally {
    await rm(temporary, { force: true });
  }
}

async function main() {
  const configDocument = JSON.parse(await readFile(path.join(ROOT, CONFIG_PATH), "utf8"));
  const resetBatch = process.argv.includes(`--reset-batch${BATCH}`);
  const config = configDocument.countries[ISO];
  if (!config) throw new Error(`country-argument-required:${Object.keys(configDocument.countries).join("|")}`);
  const retrievedAt = configDocument.retrievedAt;
  const repository = createPublishedKnowledgeEntityLayerRepository({ projectRoot: ROOT });
  const country = repository.listCountries().find((entry) => entry.isoAlpha2 === ISO);
  if (!country) throw new Error(`country-not-published:${ISO}`);
  const cities = repository.listCities().filter((entry) => entry.parentCountryEntityId === country.entityId);
  if (!cities.length) throw new Error(`country-has-no-published-cities:${ISO}`);
  const countryByCode = new Map(repository.listCountries().map((entry) => [entry.isoAlpha2, entry]));
  const citiesByCountryCode = new Map([...countryByCode.entries()].map(([code, entry]) => [
    code,
    repository.listCities().filter((city) => city.parentCountryEntityId === entry.entityId),
  ]));
  const cityByCountryAndName = new Map([...citiesByCountryCode.entries()].flatMap(([code, entries]) => entries.flatMap((entry) => [
    [`${code}:${entry.canonicalNameEn}`, entry],
    ...(entry.aliases || []).map((alias) => [`${code}:${alias}`, entry]),
  ])));
  const pairDefinitions = config.pairs.map((pair) => pair.length === 3
    ? { fromCode: ISO, from: pair[0], toCode: ISO, to: pair[1], mode: pair[2] }
    : { fromCode: pair[0], from: pair[1], toCode: pair[2], to: pair[3], mode: pair[4] });
  const missing = pairDefinitions.flatMap(({ fromCode, from, toCode, to }) => [
    cityByCountryAndName.has(`${fromCode}:${from}`) ? null : `${fromCode}:${from}`,
    cityByCountryAndName.has(`${toCode}:${to}`) ? null : `${toCode}:${to}`,
  ]).filter(Boolean);
  if (missing.length) throw new Error(`evidence-city-missing:${ISO}:${[...new Set(missing)].join("|")}`);

  const routeAdditions = pairDefinitions.flatMap(({ fromCode, from, toCode, to, mode }) => {
    const left = cityByCountryAndName.get(`${fromCode}:${from}`).entityId;
    const right = cityByCountryAndName.get(`${toCode}:${to}`).entityId;
    return [
      routeLeg(left, right, mode, config.transportSource, retrievedAt),
      routeLeg(right, left, mode, config.transportSource, retrievedAt)
    ];
  });
  if (new Set(routeAdditions.map((entry) => entry.legEvidenceId)).size !== routeAdditions.length) {
    throw new Error(`duplicate-batch${BATCH}-route-leg:${ISO}`);
  }

  const weather = config.weatherSource;
  const weatherDefinition = {
    url: weather.url,
    locator: weather.locator,
    excerpt: `${weather.locator} publishes official alerts for ${[...new Set([...weather.first[1], ...weather.second[1]])].join(", ")} without asserting a preferred travel month.`
  };
  const seasonAdditions = BATCH !== "06"
    ? cities.flatMap((city) => [weather.first, weather.second].map(([month, risks]) => (
        monthRisk(city.entityId, month, risks, weatherDefinition, retrievedAt)
      ))).slice(0, 4)
    : Array.from({ length: 4 }, (_, index) => {
        const city = cities[index % cities.length];
        const [month, risks] = index % 2 === 0 ? weather.first : weather.second;
        return monthRisk(city.entityId, month, risks, weatherDefinition, retrievedAt);
      });
  if (new Set(seasonAdditions.map((entry) => entry.seasonEvidenceId)).size !== seasonAdditions.length) {
    throw new Error(`duplicate-batch${BATCH}-season:${ISO}`);
  }

  const existingLegs = parseJsonl(await readFile(path.join(ROOT, ROUTE_LEG_PATH), "utf8"))
    .filter((record) => !resetBatch || record.retrievedAt !== retrievedAt);
  const existingSeasons = parseJsonl(await readFile(path.join(ROOT, SEASON_PATH), "utf8"))
    .filter((record) => !resetBatch || record.retrievedAt !== retrievedAt);
  const routeLegs = upsert(existingLegs, routeAdditions, "legEvidenceId");
  const seasons = upsert(existingSeasons, seasonAdditions, "seasonEvidenceId");
  for (const record of routeLegs) if (!validateRouteLegEvidence(record).accepted) throw new Error(`route-leg-invalid:${record.legEvidenceId}`);
  for (const record of seasons) if (!validateSeasonEvidence(record).accepted) throw new Error(`season-invalid:${record.seasonEvidenceId}`);

  const currentManifest = JSON.parse(await readFile(path.join(ROOT, MANIFEST_PATH), "utf8"));
  const priorBatchCodes = new Set([...Object.keys(configDocument.countries), "CN"]);
  const manifest = {
    schemaVersion: "route-v2-evidence-seed-v1",
    country: "MULTI",
    countries: [...new Set([...(currentManifest.countries || []).filter((code) => !resetBatch || !priorBatchCodes.has(code)), ISO])].sort(),
    routeLegEvidenceIds: routeLegs.map((record) => record.legEvidenceId),
    seasonEvidenceIds: seasons.map((record) => record.seasonEvidenceId),
    counts: { routeLeg: routeLegs.length, season: seasons.length, total: routeLegs.length + seasons.length },
    promotedEvidenceHash: stableHash({ routeLegs, seasons })
  };
  const priorAudit = resetBatch
    ? { countries: {} }
    : await readFile(path.join(ROOT, AUDIT_PATH), "utf8").then(JSON.parse).catch(() => ({ countries: {} }));
  const audit = {
    schemaVersion: `route-v2-knowledge-expansion-batch${BATCH}-evidence-audit-v1`,
    retrievedAt,
    countries: {
      ...(priorAudit.countries || {}),
      [ISO]: {
        countryEntityId: country.entityId,
        cityCount: cities.length,
        directedRouteLegs: routeAdditions.length,
        monthRisk: seasonAdditions.length,
        transportSource: config.transportSource,
        weatherSource: { url: weather.url, locator: weather.locator }
      }
    }
  };
  await atomicText(ROUTE_LEG_PATH, `${routeLegs.map((record) => JSON.stringify(record)).join("\n")}\n`);
  await atomicText(SEASON_PATH, `${seasons.map((record) => JSON.stringify(record)).join("\n")}\n`);
  await atomicText(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);
  await atomicText(AUDIT_PATH, `${JSON.stringify(audit, null, 2)}\n`);
  console.log(JSON.stringify({ status: "PASS", country: ISO, addedDirectedRouteLegs: routeAdditions.length, addedMonthRisk: seasonAdditions.length, counts: manifest.counts }, null, 2));
}

await main();
