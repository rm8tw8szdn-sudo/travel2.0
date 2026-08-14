import fs from "node:fs";
import path from "node:path";

import { createPublishedKnowledgeEntityLayerRepository } from "../../src/lib/routes/index.mjs";

function readJson(root, relativePath) {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), "utf8"));
}

function readJsonl(root, relativePath) {
  const text = fs.readFileSync(path.join(root, relativePath), "utf8").trim();
  return text ? text.split(/\r?\n/u).map((line) => JSON.parse(line)) : [];
}

function duplicateCount(values) {
  return values.length - new Set(values).size;
}

function imageReady(record, scope, kind) {
  return record?.status === "imageReady"
    && record.semanticScope === scope
    && record.assetKind === kind;
}

export function calculateBatch05ReportData({ root } = {}) {
  const projectRoot = path.resolve(root || path.join(import.meta.dirname, "..", ".."));
  const repository = createPublishedKnowledgeEntityLayerRepository({ projectRoot });
  const countries = repository.listCountries();
  const cities = repository.listCities();
  const pois = repository.listPois();
  const batchSeed = readJson(projectRoot, "data/knowledge/seeds/knowledge-expansion-batch05-20-country.json");
  const targetCountryCodes = Object.keys(batchSeed.countries);
  const waveBatches = Object.values(batchSeed.waves).map((wave) => String(wave.batchNumber));
  const countryByEntityId = new Map(countries.map((country) => [country.entityId, country]));
  const cityByEntityId = new Map(cities.map((city) => [city.entityId, city]));
  const targetCodes = new Set(targetCountryCodes);
  const targetCityIds = new Set(cities
    .filter((city) => targetCodes.has(countryByEntityId.get(city.parentCountryEntityId)?.isoAlpha2))
    .map((city) => city.entityId));
  const targetPois = pois.filter((poi) => targetCityIds.has(poi.parentCityEntityId));

  const addedCountries = readJson(projectRoot, "data/knowledge/batches/countries.p1a-batch05.json").countries;
  const addedCities = waveBatches.flatMap((batch) => (
    readJson(projectRoot, `data/knowledge/batches/cities.p1b-batch${batch}.json`).cities
  ));
  const addedPois = waveBatches.flatMap((batch) => (
    readJson(projectRoot, `data/knowledge/batches/pois.p1b-batch${batch}.json`).pois
  ));
  const conflicts = waveBatches.flatMap((batch, index) => (
    readJson(projectRoot, `data/knowledge/batches/conflicts.knowledge-expansion-batch05-wave${index + 1}.json`).conflicts
  ));

  const crossBorderAudit = readJson(projectRoot, "data/knowledge/batches/knowledge-expansion-batch05-cross-border-evidence-audit.json");
  const evidenceBoundary = crossBorderAudit.retrievedAt;
  const routeLegs = readJsonl(projectRoot, "data/route-v2/evidence-seed/route-leg-evidence.jsonl");
  const seasons = readJsonl(projectRoot, "data/route-v2/evidence-seed/season-evidence.jsonl");
  const batchRouteLegs = routeLegs.filter((record) => (
    record.retrievedAt === evidenceBoundary
    && (targetCityIds.has(record.fromEntityId) || targetCityIds.has(record.toEntityId))
  ));
  const batchSeasons = seasons.filter((record) => (
    record.retrievedAt === evidenceBoundary && targetCityIds.has(record.entityId)
  ));
  const domesticRouteLegs = batchRouteLegs.filter((record) => {
    const from = cityByEntityId.get(record.fromEntityId);
    const to = cityByEntityId.get(record.toEntityId);
    return from && to && from.parentCountryEntityId === to.parentCountryEntityId;
  });
  const targetCountryCoverage = targetCountryCodes.map((countryCode) => {
    const country = countries.find((record) => record.isoAlpha2 === countryCode);
    const countryCityIds = new Set(cities
      .filter((city) => city.parentCountryEntityId === country?.entityId)
      .map((city) => city.entityId));
    return Object.freeze({
      countryCode,
      cities: countryCityIds.size,
      pois: pois.filter((poi) => countryCityIds.has(poi.parentCityEntityId)).length,
      domesticRouteLegs: batchRouteLegs.filter((record) => (
        countryCityIds.has(record.fromEntityId) && countryCityIds.has(record.toEntityId)
      )).length,
      crossBorderRouteLegs: batchRouteLegs.filter((record) => {
        const from = cityByEntityId.get(record.fromEntityId);
        const to = cityByEntityId.get(record.toEntityId);
        if (!from || !to || from.parentCountryEntityId === to.parentCountryEntityId) return false;
        return countryCityIds.has(record.fromEntityId) || countryCityIds.has(record.toEntityId);
      }).length,
      monthRisk: batchSeasons.filter((record) => countryCityIds.has(record.entityId)).length,
    });
  });

  const imageManifest = readJson(projectRoot, "data/route-v2/images/image-coverage-manifest.json");
  const batchCountries = imageManifest.countries.filter((record) => targetCodes.has(record.countryCode));
  const batchCities = imageManifest.cities.filter((record) => targetCodes.has(record.countryCode));
  const batchPois = imageManifest.pois.filter((record) => targetCodes.has(record.countryCode));
  const countryCovers = imageManifest.countries.filter((record) => imageReady(record, "exact-country", "entity-label-card"));
  const dedicatedCities = imageManifest.cities.filter((record) => imageReady(record, "exact-city", "verified-destination-image"));
  const dedicatedPois = imageManifest.pois.filter((record) => imageReady(record, "exact-poi", "verified-destination-image"));
  const cityPlaceholders = imageManifest.cities.filter((record) => record.status === "placeholder" && record.semanticScope === "neutral-placeholder");
  const poiPlaceholders = imageManifest.pois.filter((record) => record.status === "placeholder" && record.semanticScope === "neutral-placeholder");
  const needsBackfill = [...imageManifest.cities, ...imageManifest.pois].filter((record) => record.needsBackfill === true);
  const batchTrustedImages = [
    ...batchCountries.filter((record) => imageReady(record, "exact-country", "entity-label-card")),
    ...batchCities.filter((record) => imageReady(record, "exact-city", "verified-destination-image")),
    ...batchPois.filter((record) => imageReady(record, "exact-poi", "verified-destination-image")),
  ];

  const routeConsumption = readJson(projectRoot, "data/knowledge/reports/knowledge-expansion-batch05-route-consumption.json");
  const browserAcceptance = readJson(projectRoot, "data/knowledge/reports/knowledge-expansion-batch05-browser-acceptance.json");
  const parentValidation = repository.validateParentReferences();

  return Object.freeze({
    projectRoot,
    waveCount: waveBatches.length,
    targetCountryCount: targetCountryCodes.length,
    targetCountryCodes,
    published: Object.freeze({
      countries: countries.length,
      cities: cities.length,
      pois: pois.length,
      total: countries.length + cities.length + pois.length,
    }),
    additions: Object.freeze({
      countries: addedCountries.length,
      cities: addedCities.length,
      pois: addedPois.length,
    }),
    targetPublished: Object.freeze({
      countries: targetCountryCodes.length,
      cities: targetCityIds.size,
      pois: targetPois.length,
    }),
    targetCountryCoverage: Object.freeze(targetCountryCoverage),
    evidence: Object.freeze({
      routeLegs: batchRouteLegs.length,
      domesticRouteLegs: domesticRouteLegs.length,
      crossBorderRouteLegs: batchRouteLegs.length - domesticRouteLegs.length,
      monthRisk: batchSeasons.length,
      boundaryRetrievedAt: evidenceBoundary,
    }),
    quality: Object.freeze({
      duplicateEntityIds: duplicateCount([...countries, ...cities, ...pois].map((record) => record.entityId)),
      duplicateCityQids: duplicateCount(cities.map((record) => record.wikidataId)),
      duplicatePoiQids: duplicateCount(pois.map((record) => record.wikidataId)),
      orphans: parentValidation.accepted ? 0 : parentValidation.reasons.length,
      conflicts: conflicts.length,
    }),
    images: Object.freeze({
      countryCovers: countryCovers.length,
      countryCoverTotal: imageManifest.countries.length,
      dedicatedCities: dedicatedCities.length,
      cityTotal: imageManifest.cities.length,
      dedicatedCorePois: dedicatedPois.length,
      corePoiTotal: imageManifest.pois.length,
      cityPlaceholders: cityPlaceholders.length,
      poiPlaceholders: poiPlaceholders.length,
      neutralPlaceholders: cityPlaceholders.length + poiPlaceholders.length,
      needsBackfill: needsBackfill.length,
      invalidMappings: imageManifest.invalidMappings.length,
      historicalNeedsBackfill: imageManifest.coverage.historicalPlannableCountries.needsBackfillCount,
      batch05NeedsBackfill: imageManifest.coverage.batch05Countries.needsBackfillCount,
      batch05CountryCovers: batchCountries.filter((record) => imageReady(record, "exact-country", "entity-label-card")).length,
      batch05DedicatedCities: batchCities.filter((record) => imageReady(record, "exact-city", "verified-destination-image")).length,
      batch05DedicatedPois: batchPois.filter((record) => imageReady(record, "exact-poi", "verified-destination-image")).length,
      batch05TrustedLocalImages: batchTrustedImages.length,
      runtimeExternalRequestsAllowed: imageManifest.fallbackPolicy.runtimeExternalRequestsAllowed,
    }),
    imageManifest,
    routeConsumption,
    browserAcceptance,
    crossBorderAudit,
  });
}

export function comma(value) {
  return Number(value).toLocaleString("en-US");
}

export function imageCoverageNarrative(stats) {
  if (stats.images.dedicatedCities === 0 && stats.images.dedicatedCorePois === 0) {
    return `Country resources are explicitly classified as non-photographic Country graphic covers. No City or POI currently has a verified dedicated destination image; all ${comma(stats.images.neutralPlaceholders)} missing City/Core POI images use the shared neutral placeholder and remain in needsBackfill.`;
  }
  return `Country resources are explicitly classified as non-photographic Country graphic covers. Verified dedicated destination images cover ${comma(stats.images.dedicatedCities)}/${comma(stats.images.cityTotal)} Cities and ${comma(stats.images.dedicatedCorePois)}/${comma(stats.images.corePoiTotal)} Core POIs; the remaining ${comma(stats.images.neutralPlaceholders)} images use neutral placeholders and remain in needsBackfill.`;
}

export function imageSemanticSampleNarrative(stats) {
  return stats.images.dedicatedCities === 0
    ? "Image semantic samples: correct local GB Country Cover, neutral London City placeholder, and neutral multi-country placeholder."
    : "Image semantic samples: correct local GB Country Cover, manifest-verified City imagery, and neutral multi-country placeholder.";
}
