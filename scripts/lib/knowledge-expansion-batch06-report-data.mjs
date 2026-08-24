import fs from "node:fs";
import path from "node:path";

import { createPublishedKnowledgeEntityLayerRepository } from "../../src/lib/routes/index.mjs";

const json = (root, relativePath) => JSON.parse(fs.readFileSync(path.join(root, relativePath), "utf8"));
const jsonl = (root, relativePath) => {
  const source = fs.readFileSync(path.join(root, relativePath), "utf8").trim();
  return source ? source.split(/\r?\n/u).map((line) => JSON.parse(line)) : [];
};
const duplicateCount = (values) => values.length - new Set(values).size;
const imageReady = (record, scope, kind) => record?.status === "imageReady" && record.semanticScope === scope && record.assetKind === kind;

export function calculateBatch06ReportData({ root } = {}) {
  const projectRoot = path.resolve(root || path.join(import.meta.dirname, "..", ".."));
  const repository = createPublishedKnowledgeEntityLayerRepository({ projectRoot });
  const countries = repository.listCountries();
  const cities = repository.listCities();
  const pois = repository.listPois();
  const seed = json(projectRoot, "data/knowledge/seeds/knowledge-expansion-batch06-20-country.json");
  const baseline = json(projectRoot, "data/knowledge/reports/knowledge-expansion-batch06-baseline.json");
  const targetCodes = Object.keys(seed.countries);
  const targetCodeSet = new Set(targetCodes);
  const waveBatches = Object.values(seed.waves).map((wave) => String(wave.batchNumber));
  const countryById = new Map(countries.map((country) => [country.entityId, country]));
  const cityById = new Map(cities.map((city) => [city.entityId, city]));
  const targetCityIds = new Set(cities.filter((city) => targetCodeSet.has(countryById.get(city.parentCountryEntityId)?.isoAlpha2)).map((city) => city.entityId));
  const targetPois = pois.filter((poi) => targetCityIds.has(poi.parentCityEntityId));
  const addedCountries = json(projectRoot, "data/knowledge/batches/countries.p1a-batch06.json").countries;
  const addedCities = waveBatches.flatMap((batch) => json(projectRoot, `data/knowledge/batches/cities.p1b-batch${batch}.json`).cities);
  const addedPois = waveBatches.flatMap((batch) => json(projectRoot, `data/knowledge/batches/pois.p1b-batch${batch}.json`).pois);
  const conflicts = [1, 2, 3, 4].flatMap((wave) => json(projectRoot, `data/knowledge/batches/conflicts.knowledge-expansion-batch06-wave${wave}.json`).conflicts);
  const reviews = [1, 2, 3, 4].flatMap((wave) => json(projectRoot, `data/knowledge/batches/review-queue.knowledge-expansion-batch06-wave${wave}.json`).entries);
  const selections = waveBatches.flatMap((batch) => json(projectRoot, `data/knowledge/batches/selection.p1b-batch${batch}.json`).cities);
  const evidenceAudit = json(projectRoot, "data/knowledge/batches/knowledge-expansion-batch06-evidence-audit.json");
  const allRouteLegs = jsonl(projectRoot, "data/route-v2/evidence-seed/route-leg-evidence.jsonl");
  const allSeasons = jsonl(projectRoot, "data/route-v2/evidence-seed/season-evidence.jsonl");
  const batchRouteLegs = allRouteLegs.filter((record) => record.retrievedAt === evidenceAudit.retrievedAt);
  const batchSeasons = allSeasons.filter((record) => record.retrievedAt === evidenceAudit.retrievedAt);
  const imageManifest = json(projectRoot, "data/route-v2/images/image-coverage-manifest.json");
  const imageProvenance = json(projectRoot, "data/route-v2/images/batch06-dedicated-image-provenance.json");
  const imageBaseline = json(projectRoot, "data/route-v2/images/image-asset-baseline.json");
  const routeConsumption = json(projectRoot, "data/knowledge/reports/knowledge-expansion-batch06-route-consumption.json");
  const browserAcceptance = json(projectRoot, "data/knowledge/reports/knowledge-expansion-batch06-browser-acceptance.json");
  const targetImages = imageProvenance.assets.filter((record) => targetCodeSet.has(record.countryCode));
  const historicalImages = imageProvenance.assets.filter((record) => !targetCodeSet.has(record.countryCode));
  const evidenceCountryCodes = new Set();
  for (const record of allRouteLegs) {
    for (const entityId of [record.fromEntityId, record.toEntityId]) {
      const city = cityById.get(entityId);
      const code = countryById.get(city?.parentCountryEntityId)?.isoAlpha2;
      if (code) evidenceCountryCodes.add(code);
    }
  }
  for (const record of allSeasons) {
    const city = cityById.get(record.entityId);
    const code = countryById.get(city?.parentCountryEntityId)?.isoAlpha2;
    if (code) evidenceCountryCodes.add(code);
  }
  const targetCountryCoverage = targetCodes.map((countryCode) => {
    const country = countries.find((record) => record.isoAlpha2 === countryCode);
    const countryCities = cities.filter((city) => city.parentCountryEntityId === country?.entityId);
    const cityIds = new Set(countryCities.map((city) => city.entityId));
    const route = routeConsumption.countries[countryCode];
    return {
      countryCode,
      label: country?.canonicalNameEn || seed.countries[countryCode].label,
      tier: seed.countries[countryCode].tier,
      cities: countryCities.length,
      pois: pois.filter((poi) => cityIds.has(poi.parentCityEntityId)).length,
      transport: batchRouteLegs.filter((record) => cityIds.has(record.fromEntityId) || cityIds.has(record.toEntityId)).length,
      monthRisk: batchSeasons.filter((record) => cityIds.has(record.entityId)).length,
      testedDurations: route?.testedDurations || [],
      dedicatedCities: imageManifest.cities.filter((record) => record.countryCode === countryCode && imageReady(record, "exact-city", "verified-destination-image")).length,
      dedicatedPois: imageManifest.pois.filter((record) => record.countryCode === countryCode && imageReady(record, "exact-poi", "verified-destination-image")).length,
      needsBackfill: [...imageManifest.cities, ...imageManifest.pois].filter((record) => record.countryCode === countryCode && record.needsBackfill).length,
    };
  });
  const parentValidation = repository.validateParentReferences();
  return Object.freeze({
    projectRoot,
    seed,
    baseline,
    targets: Object.freeze({ count: targetCodes.length, codes: targetCodes, waves: waveBatches.length, tier1: targetCodes.filter((code) => seed.countries[code].tier === 1).length, tier2: targetCodes.filter((code) => seed.countries[code].tier === 2).length, tier3: targetCodes.filter((code) => seed.countries[code].tier === 3).length }),
    portfolio: Object.freeze({ catalogCountries: countries.length, plannableCountries: imageManifest.countries.length, evidenceBackedCountries: evidenceCountryCodes.size, routeKnowledgeCoveredCountries: imageManifest.countries.length, catalogOnlyCountryCodes: countries.map((country) => country.isoAlpha2).filter((code) => !imageManifest.countries.some((record) => record.countryCode === code)).sort() }),
    published: Object.freeze({ countries: countries.length, cities: cities.length, pois: pois.length, total: countries.length + cities.length + pois.length }),
    additions: Object.freeze({ countries: addedCountries.length, cities: addedCities.length, pois: addedPois.length }),
    quality: Object.freeze({ duplicateEntityIds: duplicateCount([...countries, ...cities, ...pois].map((entity) => entity.entityId)), duplicateCityQids: duplicateCount(cities.map((entity) => entity.wikidataId)), duplicatePoiQids: duplicateCount(pois.map((entity) => entity.wikidataId)), orphans: parentValidation.accepted ? 0 : parentValidation.reasons.length, conflicts: conflicts.length, quarantined: reviews.length, quarantinedCities: reviews.filter((entry) => entry.disposition === "quarantined-city-not-published").length, acceptedBelowTarget: reviews.filter((entry) => entry.disposition === "accepted-below-target-without-padding").length, selectionCities: selections.length }),
    evidence: Object.freeze({ transport: batchRouteLegs.length, monthRisk: batchSeasons.length, totalTransport: allRouteLegs.length, totalMonthRisk: allSeasons.length, auditCountries: Object.keys(evidenceAudit.countries).length, retrievedAt: evidenceAudit.retrievedAt }),
    images: Object.freeze({ countryCovers: imageManifest.coverage.overall.countryCoverCoverage.ready, countryTotal: imageManifest.coverage.overall.countryCoverCoverage.total, dedicatedCities: imageManifest.coverage.overall.cityDedicatedImageCoverage.ready, cityTotal: imageManifest.coverage.overall.cityDedicatedImageCoverage.total, dedicatedPois: imageManifest.coverage.overall.corePoiImageCoverage.ready, poiTotal: imageManifest.coverage.overall.corePoiImageCoverage.total, cityPlaceholders: imageManifest.coverage.overall.cityPlaceholderCount, poiPlaceholders: imageManifest.coverage.overall.poiPlaceholderCount, needsBackfill: imageManifest.coverage.overall.needsBackfillCount, invalidMappings: imageManifest.invalidMappings.length, batch06VerifiedImages: targetImages.length, historicalBackfillImages: historicalImages.length, batch06CountryCovers: imageManifest.countries.filter((record) => targetCodeSet.has(record.countryCode)).length, historicalDebtBefore: baseline.images.needsBackfill, historicalDebtAfter: imageManifest.coverage.historicalPlannableCountries.needsBackfillCount, assetCount: imageBaseline.summary.totalImages, totalBytes: imageBaseline.summary.totalBytes, largerThan300Kb: imageBaseline.summary.largerThan300Kb, largerThan500Kb: imageBaseline.summary.largerThan500Kb, largerThan1Mb: imageBaseline.summary.largerThan1Mb, largerThan5Mb: imageBaseline.summary.largerThan5Mb, exactDuplicates: imageBaseline.duplicates.exactGroups.length, perceptualDuplicates: imageBaseline.duplicates.perceptualGroups.length }),
    routeConsumption,
    browserAcceptance,
    targetCountryCoverage,
    imageManifest,
    imageBaseline,
  });
}

export const comma = (value) => Number(value).toLocaleString("en-US");
export const percent = (ready, total) => total ? Number((ready / total * 100).toFixed(1)) : 100;
