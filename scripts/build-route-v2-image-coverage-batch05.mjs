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
const RETRIEVED_AT = "2026-08-11T05:00:00.000Z";
const BATCH05_CODES = new Set(["GB","IE","CZ","HU","HR","NO","SE","FI","DK","BE","PL","SI","VN","MY","ID","PH","CA","US","MX","PE"]);
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

const repository = createPublishedKnowledgeEntityLayerRepository({ projectRoot: ROOT });
const countries = repository.listCountries();
const cities = repository.listCities();
const pois = repository.listPois();
const poisByCity = new Map(cities.map((city) => [city.entityId, pois.filter((poi) => poi.parentCityEntityId === city.entityId)]));
const plannableCountries = countries.filter((country) => {
  const countryCities = cities.filter((city) => city.parentCountryEntityId === country.entityId);
  return countryCities.length > 0 && countryCities.some((city) => (poisByCity.get(city.entityId) || []).length > 0);
}).sort((a, b) => a.isoAlpha2.localeCompare(b.isoAlpha2, "en"));

const countryRecords = [];
const cityRecords = [];
const poiRecords = [];
for (const country of plannableCountries) {
  const countryPath = assetPath("countries", country.isoAlpha2.toLocaleLowerCase("en-US"));
  await write(countryPath, svgCard({ label: country.canonicalNameEn, eyebrow: `${country.isoAlpha2} country`, key: country.wikidataId }));
  countryRecords.push({
    entityId: country.entityId, wikidataId: country.wikidataId, countryCode: country.isoAlpha2,
    canonicalNameEn: country.canonicalNameEn, assetPath: countryPath, status: "imageReady", semanticScope: "exact-country",
    assetKind: "entity-label-card", visualTruthStatus: "non-photographic-graphic", rights: GENERATED_VECTOR_RIGHTS,
  });
  const countryCities = cities.filter((city) => city.parentCountryEntityId === country.entityId)
    .sort((left, right) => (poisByCity.get(right.entityId)?.length || 0) - (poisByCity.get(left.entityId)?.length || 0)
      || left.canonicalNameEn.localeCompare(right.canonicalNameEn, "en"));
  const coreIds = new Set(countryCities.slice(0, Math.min(3, countryCities.length)).map((city) => city.entityId));
  for (const city of countryCities) {
    const isCore = coreIds.has(city.entityId);
    const publishedPoiCount = (poisByCity.get(city.entityId) || []).length;
    cityRecords.push({
      entityId: city.entityId, wikidataId: city.wikidataId, countryCode: country.isoAlpha2,
      canonicalNameEn: city.canonicalNameEn, assetPath: PLACEHOLDER, core: isCore,
      publishedPoiCount, backfillPriority: isCore ? "high" : publishedPoiCount >= 5 ? "normal" : "low",
      status: "placeholder", needsBackfill: true, assetKind: "neutral-placeholder",
      semanticScope: "neutral-placeholder",
    });
    if (!isCore) continue;
    const corePoi = [...(poisByCity.get(city.entityId) || [])].sort((a, b) => a.canonicalNameEn.localeCompare(b.canonicalNameEn, "en"))[0];
    if (!corePoi) continue;
    poiRecords.push({
      entityId: corePoi.entityId, wikidataId: corePoi.wikidataId, parentCityEntityId: city.entityId,
      countryCode: country.isoAlpha2, canonicalNameEn: corePoi.canonicalNameEn,
      assetPath: PLACEHOLDER, status: "placeholder", needsBackfill: true,
      backfillPriority: "high",
      assetKind: "neutral-placeholder", semanticScope: "neutral-placeholder",
    });
  }
}

const batch05Country = countryRecords.filter((record) => BATCH05_CODES.has(record.countryCode));
const batch05City = cityRecords.filter((record) => BATCH05_CODES.has(record.countryCode));
const batch05Poi = poiRecords.filter((record) => BATCH05_CODES.has(record.countryCode));
const historicalCountry = countryRecords.filter((record) => !BATCH05_CODES.has(record.countryCode));
const historicalCity = cityRecords.filter((record) => !BATCH05_CODES.has(record.countryCode));
const historicalPoi = poiRecords.filter((record) => !BATCH05_CODES.has(record.countryCode));
const invalidMappings = [...countryRecords, ...cityRecords, ...poiRecords].filter((record) => (
  (record.status === "imageReady" && (!record.assetPath || record.assetKind !== "entity-label-card"))
  || (record.status === "placeholder" && (record.assetPath !== PLACEHOLDER || record.semanticScope !== "neutral-placeholder"))
)).map((record) => ({ entityId: record.entityId, assetPath: record.assetPath, reason: "status-asset-policy-mismatch" }));
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
const manifest = {
  schemaVersion: "route-v2-image-coverage-v1", retrievedAt: RETRIEVED_AT,
  fallbackPolicy: { city: PLACEHOLDER, poi: PLACEHOLDER, route: "assets/trip-cover-placeholder.svg", runtimeExternalRequestsAllowed: false },
  countries: countryRecords, cities: cityRecords, pois: poiRecords, invalidMappings,
  coverage: {
    historicalPlannableCountries: summarize(historicalCountry, historicalCity, historicalPoi),
    batch05Countries: summarize(batch05Country, batch05City, batch05Poi),
    overall: summarize(countryRecords, cityRecords, poiRecords),
  },
};
await write(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);

const runtime = {
  schemaVersion: manifest.schemaVersion,
  countryByCode: Object.fromEntries(countryRecords.map((record) => [record.countryCode, record])),
  cityByEntityId: Object.fromEntries(cityRecords.map((record) => [record.entityId, record])),
  poiByEntityId: Object.fromEntries(poiRecords.map((record) => [record.entityId, record])),
  fallbackPolicy: manifest.fallbackPolicy,
};
await write(RUNTIME_PATH, `(function (global) { "use strict"; global.RouteV2ImageCoverage = Object.freeze(${JSON.stringify(runtime)}); }(typeof globalThis !== "undefined" ? globalThis : window));\n`);

const historicalDebtBefore = historicalCity.length + historicalPoi.length;
const batch05ImageCount = batch05Country.length;
const backfill = cityRecords.filter((record) => record.needsBackfill).map((record) => `- ${record.countryCode} · ${record.backfillPriority} · ${record.canonicalNameEn} · ${record.entityId}`).join("\n");
const poiBackfill = poiRecords.filter((record) => record.needsBackfill).map((record) => `- ${record.countryCode} · ${record.backfillPriority} · ${record.canonicalNameEn} · ${record.entityId}`).join("\n");
const debtByCountry = countryRecords.map((country) => {
  const countryCities = cityRecords.filter((record) => record.countryCode === country.countryCode && record.needsBackfill);
  const countryPois = poiRecords.filter((record) => record.countryCode === country.countryCode && record.needsBackfill);
  return {
    countryCode: country.countryCode,
    countryName: country.canonicalNameEn,
    scope: BATCH05_CODES.has(country.countryCode) ? "Batch 05" : "Historical",
    high: countryCities.filter((record) => record.backfillPriority === "high").length,
    normal: countryCities.filter((record) => record.backfillPriority === "normal").length,
    low: countryCities.filter((record) => record.backfillPriority === "low").length,
    corePois: countryPois.length,
    total: countryCities.length + countryPois.length,
  };
});
const debtTable = debtByCountry.map((entry) => `| ${entry.countryCode} | ${entry.countryName} | ${entry.scope} | ${entry.high} | ${entry.normal} | ${entry.low} | ${entry.corePois} | ${entry.total} |`).join("\n");
await write(AUDIT_PATH, `# Route V2 Image Coverage Backfill Audit\n\nGenerated: ${RETRIEVED_AT}\n\n## Outcome\n\n- Historical image debt discovered: ${historicalDebtBefore}\n- Country graphic covers added: ${countryRecords.length}\n- Verified destination City images: ${cityRecords.filter((record) => record.status === "imageReady").length}\n- Batch 05 local Country graphic covers added: ${batch05ImageCount}\n- Dedicated City image coverage: ${manifest.coverage.overall.cityDedicatedImageCoverage.ready}/${manifest.coverage.overall.cityDedicatedImageCoverage.total} (${manifest.coverage.overall.cityDedicatedImageCoverage.percent}%)\n- City neutral placeholders: ${manifest.coverage.overall.cityPlaceholderCount}\n- Verified Core POI image coverage: ${manifest.coverage.overall.corePoiImageCoverage.ready}/${manifest.coverage.overall.corePoiImageCoverage.total} (${manifest.coverage.overall.corePoiImageCoverage.percent}%)\n- POI neutral placeholders: ${manifest.coverage.overall.poiPlaceholderCount}\n- Active invalid mappings: ${invalidMappings.length}\n- Needs backfill: ${manifest.coverage.overall.needsBackfillCount}\n- Runtime external image requests: disabled\n\nCountry resources are explicitly classified as non-photographic entity label cards. They make no landmark or destination-photo claim. Generated City/POI label cards are not counted as dedicated imagery; until a source and rights-verified destination image exists, every City/POI uses the shared neutral placeholder.\n\n## Debt by country and priority\n\nPriority is deterministic: each country's three highest-depth published Cities are high, other Cities with at least five published POIs are normal, and lower-depth Cities are low. Core POI debt inherits high priority.\n\n| Code | Country | Scope | High City | Normal City | Low City | Core POI | Total |\n| --- | --- | --- | ---: | ---: | ---: | ---: | ---: |\n${debtTable}\n\n## Remaining City backfill\n\n${backfill || "None"}\n\n## Remaining Core POI backfill\n\n${poiBackfill || "None"}\n`);
console.log(JSON.stringify({ status: "PASS", plannableCountries: countryRecords.length, dedicatedCities: cityRecords.filter((record) => record.status === "imageReady").length, placeholders: manifest.coverage.overall.cityPlaceholderCount, corePois: poiRecords.length, batch05ImageCount, outputs: [MANIFEST_PATH, RUNTIME_PATH, AUDIT_PATH] }, null, 2));
