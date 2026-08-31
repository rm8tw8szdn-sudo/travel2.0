import crypto from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import fs from "node:fs";
import path from "node:path";

import { createPublishedKnowledgeEntityLayerRepository } from "../src/lib/routes/index.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");
const ASSET_ROOT = "assets/route-v2-images";
const MANIFEST_PATH = "data/route-v2/images/image-coverage-manifest.json";
const RUNTIME_PATH = "route-v2-image-coverage.js";
const AUDIT_PATH = "ROUTE_V2_IMAGE_COVERAGE_BACKFILL_AUDIT.md";
const BATCH = String(process.argv.find((value) => value.startsWith("--batch="))?.split("=")[1] || "06").padStart(2, "0");
if (!["06", "07", "08"].includes(BATCH)) throw new Error("batch-argument-invalid:--batch=06|07|08");
const BATCH_AUDIT_PATH = `ROUTE_V2_IMAGE_COVERAGE_BACKFILL_BATCH${BATCH}_AUDIT.md`;
const PROVENANCE_PATH = `data/route-v2/images/batch${BATCH}-dedicated-image-provenance.json`;
const DEBT_PROVENANCE_PATH = "data/route-v2/images/image-debt-elimination-provenance.json";
const BATCH_BASELINE_PATH = `data/knowledge/reports/knowledge-expansion-batch${BATCH}-baseline.json`;
const RETRIEVED_AT = BATCH === "08" ? "2026-08-28T09:00:00.000Z" : BATCH === "07" ? "2026-08-24T05:00:00.000Z" : "2026-08-17T09:00:00.000Z";
const BATCH05_CODES = new Set(["GB", "IE", "CZ", "HU", "HR", "NO", "SE", "FI", "DK", "BE", "PL", "SI", "VN", "MY", "ID", "PH", "CA", "US", "MX", "PE"]);
const BATCH06_CODES = new Set(["AD", "AE", "AR", "BR", "CD", "CL", "UY", "EG", "FJ", "IL", "IN", "KE", "MA", "NG", "RU", "SA", "ZA", "KH", "RO", "CR"]);
const BATCH07_CODES = new Set(["AL", "BG", "CY", "EE", "LV", "LT", "MT", "ME", "RS", "SK", "GE", "JO", "LK", "NP", "MV", "TN", "TZ", "EC", "PA", "GT"]);
const BATCH08_CODES = new Set(["AM", "AZ", "BA", "MK", "MD", "LU", "MC", "LI", "OM", "QA", "BH", "KW", "LB", "DO", "JM", "CU", "BS", "BO", "PY", "NI"]);
const CURRENT_BATCH_CODES = BATCH === "08" ? BATCH08_CODES : BATCH === "07" ? BATCH07_CODES : BATCH06_CODES;
const PLACEHOLDER = "assets/route-city-placeholder.svg";
const GENERATED_VECTOR_RIGHTS = Object.freeze({
  sourceType: "project-generated-vector",
  sourcePath: "scripts/build-route-v2-image-coverage-batch05.mjs",
  externalCopyrightMaterial: false,
});

function xml(value) {
  return String(value || "").replace(/[&<>"']/gu, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&apos;" }[character]));
}

function palette(key) {
  const digest = crypto.createHash("sha256").update(key).digest();
  const hue = digest[0] / 255 * 320;
  return [`hsl(${hue.toFixed(0)} 48% 26%)`, `hsl(${((hue + 52) % 360).toFixed(0)} 58% 45%)`, `hsl(${((hue + 126) % 360).toFixed(0)} 62% 72%)`];
}

function svgCard({ label, eyebrow, key }) {
  const [dark, mid, light] = palette(key);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="500" viewBox="0 0 800 500" role="img" aria-label="${xml(label)} local travel cover">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${dark}"/><stop offset="1" stop-color="${mid}"/></linearGradient></defs>
  <rect width="800" height="500" rx="32" fill="url(#g)"/>
  <circle cx="680" cy="80" r="150" fill="${light}" opacity=".18"/><circle cx="90" cy="500" r="210" fill="#fff" opacity=".08"/>
  <path d="M70 338c95-92 178-58 259-19 92 44 174 74 395-41v142H70z" fill="#fff" opacity=".12"/>
  <text x="70" y="105" fill="#fff" opacity=".78" font-family="system-ui,sans-serif" font-size="24" font-weight="650" letter-spacing="3">${xml(eyebrow.toUpperCase())}</text>
  <text x="70" y="285" fill="#fff" font-family="system-ui,sans-serif" font-size="58" font-weight="760">${xml(label)}</text>
  <text x="70" y="380" fill="#fff" opacity=".72" font-family="system-ui,sans-serif" font-size="21">LOCAL GRAPHIC COVER</text>
</svg>\n`;
}

async function write(relativePath, contents) {
  const filePath = path.join(ROOT, relativePath);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, contents, "utf8");
}

function assetPath(kind, key) { return `${ASSET_ROOT}/${kind}/${key}.svg`; }
function percent(numerator, denominator) { return denominator ? Number((numerator / denominator * 100).toFixed(1)) : 100; }
function sha256(bytes) { return crypto.createHash("sha256").update(bytes).digest("hex"); }

function localAssetMetadata(relativePath, options) {
  const bytes = fs.readFileSync(path.join(ROOT, relativePath));
  const source = path.extname(relativePath).toLocaleLowerCase("en-US") === ".svg" ? bytes.toString("utf8") : "";
  const viewBox = source.match(/viewBox=["']\s*[\d.-]+\s+[\d.-]+\s+([\d.]+)\s+([\d.]+)["']/u);
  const width = Number(source.match(/\bwidth=["']([\d.]+)["']/u)?.[1] || viewBox?.[1] || options.dimensions?.width || 0);
  const height = Number(source.match(/\bheight=["']([\d.]+)["']/u)?.[1] || viewBox?.[2] || options.dimensions?.height || 0);
  const hash = sha256(bytes);
  return {
    entityType: options.entityType,
    assetType: options.assetType,
    isDedicated: options.isDedicated,
    isPlaceholder: options.isPlaceholder,
    localPath: relativePath,
    sourceUrl: options.sourceUrl || null,
    sourcePath: options.sourcePath,
    license: options.license,
    dimensions: { width, height },
    sourceHash: options.sourceHash || hash,
    processedHash: hash,
    bytes: bytes.length,
    format: path.extname(relativePath).slice(1).toLocaleLowerCase("en-US"),
    verificationStatus: options.verificationStatus,
    acquiredAt: options.acquiredAt || RETRIEVED_AT,
  };
}

const repository = createPublishedKnowledgeEntityLayerRepository({ projectRoot: ROOT });
const countries = repository.listCountries();
const cities = repository.listCities();
const pois = repository.listPois();
const poisByCity = new Map(cities.map((city) => [city.entityId, pois.filter((poi) => poi.parentCityEntityId === city.entityId)]));
const plannableCountries = countries.filter((country) => {
  const countryCities = cities.filter((city) => city.parentCountryEntityId === country.entityId);
  return countryCities.length > 0 && countryCities.some((city) => (poisByCity.get(city.entityId) || []).length > 0);
}).sort((left, right) => left.isoAlpha2.localeCompare(right.isoAlpha2, "en"));

const provenance = JSON.parse(await readFile(path.join(ROOT, PROVENANCE_PATH), "utf8"));
const cumulativeProvenance = ["06", "07", "08"]
  .filter((batch) => Number(batch) <= Number(BATCH))
  .map((batch) => `data/route-v2/images/batch${batch}-dedicated-image-provenance.json`)
  .filter((relativePath) => fs.existsSync(path.join(ROOT, relativePath)))
  .flatMap((relativePath) => {
    const document = JSON.parse(fs.readFileSync(path.join(ROOT, relativePath), "utf8"));
    return (document.assets || []).map((record) => ({ ...record, provenancePath: relativePath }));
  });
const debtProvenance = fs.existsSync(path.join(ROOT, DEBT_PROVENANCE_PATH))
  ? JSON.parse(await readFile(path.join(ROOT, DEBT_PROVENANCE_PATH), "utf8"))
  : { assets: [] };
const batchBaseline = JSON.parse(await readFile(path.join(ROOT, BATCH_BASELINE_PATH), "utf8"));
const dedicatedRecords = [
  ...cumulativeProvenance,
  ...(debtProvenance.assets || [])
    .filter((record) => record.status === "imageReady" && record.visualAuditStatus === "passed")
    .map((record) => ({ ...record, provenancePath: DEBT_PROVENANCE_PATH })),
];
const dedicatedByEntityId = new Map(dedicatedRecords.map((record) => [record.entityId, record]));
const countryRecords = [];
const cityRecords = [];
const poiRecords = [];
const neutralPlaceholderMetadata = localAssetMetadata(PLACEHOLDER, {
  entityType: "shared-placeholder",
  assetType: "neutral-placeholder",
  isDedicated: false,
  isPlaceholder: true,
  sourcePath: PLACEHOLDER,
  license: "project-generated",
  verificationStatus: "verified-neutral-placeholder",
});

function destinationRecord(entity, { entityType, countryCode, parentCityEntityId = null, core = false, publishedPoiCount = 0, backfillPriority = "high" } = {}) {
  const dedicated = dedicatedByEntityId.get(entity.entityId);
  if (!dedicated) {
    return {
      entityId: entity.entityId,
      wikidataId: entity.wikidataId,
      countryCode,
      ...(parentCityEntityId ? { parentCityEntityId } : {}),
      canonicalNameEn: entity.canonicalNameEn,
      assetPath: PLACEHOLDER,
      core,
      publishedPoiCount,
      backfillPriority,
      status: "placeholder",
      needsBackfill: true,
      assetKind: "neutral-placeholder",
      semanticScope: "neutral-placeholder",
      visualTruthStatus: "neutral-non-geographic-placeholder",
      ...neutralPlaceholderMetadata,
      entityType,
    };
  }
  const metadata = localAssetMetadata(dedicated.assetPath, {
    entityType,
    assetType: "dedicated-destination-image",
    isDedicated: true,
    isPlaceholder: false,
    sourcePath: dedicated.provenancePath,
    sourceUrl: dedicated.sourceUrl,
    license: dedicated.license,
    sourceHash: dedicated.sourceHash,
    dimensions: dedicated.dimensions,
    acquiredAt: dedicated.acquiredAt,
    verificationStatus: dedicated.verificationStatus,
  });
  return {
    entityId: entity.entityId,
    wikidataId: entity.wikidataId,
    countryCode,
    ...(parentCityEntityId ? { parentCityEntityId } : {}),
    canonicalNameEn: entity.canonicalNameEn,
    assetPath: dedicated.assetPath,
    core,
    publishedPoiCount,
    backfillPriority,
    status: "imageReady",
    needsBackfill: false,
    assetKind: "verified-destination-image",
    semanticScope: entityType === "City" ? "exact-city" : "exact-poi",
    visualTruthStatus: dedicated.visualTruthStatus || "verified-entity-p18-photograph",
    rights: dedicated.rights,
    ...metadata,
  };
}

for (const country of plannableCountries) {
  const countryPath = assetPath("countries", country.isoAlpha2.toLocaleLowerCase("en-US"));
  await write(countryPath, svgCard({ label: country.canonicalNameEn, eyebrow: `${country.isoAlpha2} country`, key: country.wikidataId }));
  countryRecords.push({
    entityId: country.entityId,
    wikidataId: country.wikidataId,
    countryCode: country.isoAlpha2,
    canonicalNameEn: country.canonicalNameEn,
    assetPath: countryPath,
    status: "imageReady",
    needsBackfill: false,
    semanticScope: "exact-country",
    assetKind: "entity-label-card",
    visualTruthStatus: "non-photographic-graphic",
    rights: GENERATED_VECTOR_RIGHTS,
    ...localAssetMetadata(countryPath, {
      entityType: "Country",
      assetType: "country-graphic-cover",
      isDedicated: true,
      isPlaceholder: false,
      sourcePath: GENERATED_VECTOR_RIGHTS.sourcePath,
      license: "project-generated",
      verificationStatus: "verified-non-photographic-graphic",
    }),
  });
  const countryCities = cities.filter((city) => city.parentCountryEntityId === country.entityId)
    .sort((left, right) => (poisByCity.get(right.entityId)?.length || 0) - (poisByCity.get(left.entityId)?.length || 0)
      || left.canonicalNameEn.localeCompare(right.canonicalNameEn, "en"));
  const coreIds = new Set(countryCities.slice(0, Math.min(3, countryCities.length)).map((city) => city.entityId));
  for (const city of countryCities) {
    const isCore = coreIds.has(city.entityId);
    const publishedPoiCount = (poisByCity.get(city.entityId) || []).length;
    cityRecords.push(destinationRecord(city, {
      entityType: "City",
      countryCode: country.isoAlpha2,
      core: isCore,
      publishedPoiCount,
      backfillPriority: isCore ? "high" : publishedPoiCount >= 5 ? "normal" : "low",
    }));
    if (!isCore) continue;
    const corePoi = [...(poisByCity.get(city.entityId) || [])].sort((left, right) => left.canonicalNameEn.localeCompare(right.canonicalNameEn, "en"))[0];
    if (corePoi) poiRecords.push(destinationRecord(corePoi, { entityType: "POI", countryCode: country.isoAlpha2, parentCityEntityId: city.entityId, core: true }));
  }
}

const invalidMappings = [...countryRecords, ...cityRecords, ...poiRecords].flatMap((record) => {
  if (!record.assetPath || !fs.existsSync(path.join(ROOT, record.assetPath))) return [{ entityId: record.entityId, assetPath: record.assetPath, reason: "missing-asset" }];
  if (record.status === "placeholder" && (record.assetPath !== PLACEHOLDER || record.semanticScope !== "neutral-placeholder" || !record.needsBackfill)) return [{ entityId: record.entityId, assetPath: record.assetPath, reason: "placeholder-policy-mismatch" }];
  if (record.entityType === "Country" && (record.assetKind !== "entity-label-card" || record.semanticScope !== "exact-country")) return [{ entityId: record.entityId, assetPath: record.assetPath, reason: "country-policy-mismatch" }];
  if (record.status === "imageReady" && record.entityType !== "Country" && (record.assetKind !== "verified-destination-image" || !["exact-city", "exact-poi"].includes(record.semanticScope) || record.needsBackfill)) return [{ entityId: record.entityId, assetPath: record.assetPath, reason: "dedicated-policy-mismatch" }];
  return [];
});

const summarize = (countrySet, citySet, poiSet) => ({
  plannableCountries: countrySet.length,
  countryCoverCoverage: { ready: countrySet.filter((record) => record.status === "imageReady").length, total: countrySet.length, percent: percent(countrySet.filter((record) => record.status === "imageReady").length, countrySet.length) },
  cityDedicatedImageCoverage: { ready: citySet.filter((record) => record.status === "imageReady").length, total: citySet.length, percent: percent(citySet.filter((record) => record.status === "imageReady").length, citySet.length) },
  cityPlaceholderCount: citySet.filter((record) => record.status === "placeholder").length,
  corePoiImageCoverage: { ready: poiSet.filter((record) => record.status === "imageReady").length, total: poiSet.length, percent: percent(poiSet.filter((record) => record.status === "imageReady").length, poiSet.length) },
  poiPlaceholderCount: poiSet.filter((record) => record.status === "placeholder").length,
  invalidMappingCount: invalidMappings.filter((entry) => [...countrySet, ...citySet, ...poiSet].some((record) => record.entityId === entry.entityId)).length,
  needsBackfillCount: [...citySet, ...poiSet].filter((record) => record.needsBackfill).length,
});

const scope = (codes, records) => records.filter((record) => codes.has(record.countryCode));
const historicalCodes = new Set(countryRecords.map((record) => record.countryCode).filter((code) => !CURRENT_BATCH_CODES.has(code)));
const manifest = {
  schemaVersion: "route-v2-image-coverage-v2",
  retrievedAt: RETRIEVED_AT,
  fallbackPolicy: { city: PLACEHOLDER, poi: PLACEHOLDER, route: "assets/trip-cover-placeholder.svg", runtimeExternalRequestsAllowed: false },
  countries: countryRecords,
  cities: cityRecords,
  pois: poiRecords,
  invalidMappings,
  coverage: {
    historicalPlannableCountries: summarize(scope(historicalCodes, countryRecords), scope(historicalCodes, cityRecords), scope(historicalCodes, poiRecords)),
    batch05Countries: summarize(scope(BATCH05_CODES, countryRecords), scope(BATCH05_CODES, cityRecords), scope(BATCH05_CODES, poiRecords)),
    batch06Countries: summarize(scope(BATCH06_CODES, countryRecords), scope(BATCH06_CODES, cityRecords), scope(BATCH06_CODES, poiRecords)),
    batch07Countries: summarize(scope(BATCH07_CODES, countryRecords), scope(BATCH07_CODES, cityRecords), scope(BATCH07_CODES, poiRecords)),
    batch08Countries: summarize(scope(BATCH08_CODES, countryRecords), scope(BATCH08_CODES, cityRecords), scope(BATCH08_CODES, poiRecords)),
    overall: summarize(countryRecords, cityRecords, poiRecords),
  },
};
await write(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);

function runtimeRecord(record) {
  return {
    entityId: record.entityId,
    wikidataId: record.wikidataId,
    countryCode: record.countryCode,
    ...(record.parentCityEntityId ? { parentCityEntityId: record.parentCityEntityId } : {}),
    canonicalNameEn: record.canonicalNameEn,
    assetPath: record.assetPath,
    status: record.status,
    needsBackfill: record.needsBackfill,
    assetKind: record.assetKind,
    semanticScope: record.semanticScope,
    verificationStatus: record.verificationStatus,
  };
}
const runtime = {
  schemaVersion: manifest.schemaVersion,
  countryByCode: Object.fromEntries(countryRecords.map((record) => [record.countryCode, runtimeRecord(record)])),
  cityByEntityId: Object.fromEntries(cityRecords.map((record) => [record.entityId, runtimeRecord(record)])),
  poiByEntityId: Object.fromEntries(poiRecords.map((record) => [record.entityId, runtimeRecord(record)])),
  fallbackPolicy: manifest.fallbackPolicy,
};
await write(RUNTIME_PATH, `(function (global) { "use strict"; global.RouteV2ImageCoverage = Object.freeze(${JSON.stringify(runtime)}); }(typeof globalThis !== "undefined" ? globalThis : window));\n`);

const debtByCountry = countryRecords.map((country) => {
  const countryCities = cityRecords.filter((record) => record.countryCode === country.countryCode && record.needsBackfill);
  const countryPois = poiRecords.filter((record) => record.countryCode === country.countryCode && record.needsBackfill);
  return {
    countryCode: country.countryCode,
    countryName: country.canonicalNameEn,
    scope: BATCH08_CODES.has(country.countryCode) ? "Batch 08" : BATCH07_CODES.has(country.countryCode) ? "Batch 07" : BATCH06_CODES.has(country.countryCode) ? "Batch 06" : BATCH05_CODES.has(country.countryCode) ? "Batch 05" : "Historical",
    high: countryCities.filter((record) => record.backfillPriority === "high").length,
    normal: countryCities.filter((record) => record.backfillPriority === "normal").length,
    low: countryCities.filter((record) => record.backfillPriority === "low").length,
    corePois: countryPois.length,
    total: countryCities.length + countryPois.length,
  };
});
const debtTable = debtByCountry.map((entry) => `| ${entry.countryCode} | ${entry.countryName} | ${entry.scope} | ${entry.high} | ${entry.normal} | ${entry.low} | ${entry.corePois} | ${entry.total} |`).join("\n");
const cityBackfill = cityRecords.filter((record) => record.needsBackfill).map((record) => `- ${record.countryCode} | ${record.backfillPriority} | ${record.canonicalNameEn} | ${record.entityId}`).join("\n");
const poiBackfill = poiRecords.filter((record) => record.needsBackfill).map((record) => `- ${record.countryCode} | ${record.backfillPriority} | ${record.canonicalNameEn} | ${record.entityId}`).join("\n");
const batchAdded = provenance.assets.filter((record) => CURRENT_BATCH_CODES.has(record.countryCode)).length;
const audit = `# Route V2 Image Coverage Backfill Audit\n\nGenerated: ${RETRIEVED_AT}\n\n## Outcome\n\n- Historical image debt before Batch ${BATCH}: ${batchBaseline.images.needsBackfill}\n- Historical image debt after Batch ${BATCH}: ${manifest.coverage.historicalPlannableCountries.needsBackfillCount}\n- Plannable Country graphic covers: ${manifest.coverage.overall.countryCoverCoverage.ready}/${manifest.coverage.overall.countryCoverCoverage.total}\n- Batch ${BATCH} Country graphic covers added: ${scope(CURRENT_BATCH_CODES, countryRecords).length}\n- Verified destination City images: ${manifest.coverage.overall.cityDedicatedImageCoverage.ready}\n- Dedicated City image coverage: ${manifest.coverage.overall.cityDedicatedImageCoverage.ready}/${manifest.coverage.overall.cityDedicatedImageCoverage.total} (${manifest.coverage.overall.cityDedicatedImageCoverage.percent}%)\n- City neutral placeholders: ${manifest.coverage.overall.cityPlaceholderCount}\n- Verified Core POI image coverage: ${manifest.coverage.overall.corePoiImageCoverage.ready}/${manifest.coverage.overall.corePoiImageCoverage.total} (${manifest.coverage.overall.corePoiImageCoverage.percent}%)\n- POI neutral placeholders: ${manifest.coverage.overall.poiPlaceholderCount}\n- Batch ${BATCH} verified destination images: ${batchAdded}\n- Active invalid mappings: ${invalidMappings.length}\n- Needs backfill: ${manifest.coverage.overall.needsBackfillCount}\n- Runtime external image requests: disabled\n\nCountry covers are non-photographic entity label graphics and are not counted as City or POI imagery. Dedicated destination assets require an exact Wikidata entity P18, a fixed local Commons file, and auditable free-license metadata. All other destinations retain the shared neutral placeholder and needsBackfill.\n\n## Debt by country and priority\n\n| Code | Country | Scope | High City | Normal City | Low City | Core POI | Total |\n| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |\n${debtTable}\n\n## Remaining City backfill\n\n${cityBackfill || "None"}\n\n## Remaining Core POI backfill\n\n${poiBackfill || "None"}\n`;
await write(AUDIT_PATH, audit);
await write(BATCH_AUDIT_PATH, audit.replace("# Route V2 Image Coverage Backfill Audit", `# Route V2 Image Coverage Backfill Batch ${BATCH} Audit`));

console.log(JSON.stringify({
  status: invalidMappings.length === 0 ? "PASS" : "FAIL",
  plannableCountries: countryRecords.length,
  dedicatedCities: manifest.coverage.overall.cityDedicatedImageCoverage.ready,
  dedicatedPois: manifest.coverage.overall.corePoiImageCoverage.ready,
  needsBackfill: manifest.coverage.overall.needsBackfillCount,
  invalidMappings: invalidMappings.length,
  batchAdded,
  outputs: [MANIFEST_PATH, RUNTIME_PATH, AUDIT_PATH, BATCH_AUDIT_PATH],
}, null, 2));
if (invalidMappings.length) process.exitCode = 1;
