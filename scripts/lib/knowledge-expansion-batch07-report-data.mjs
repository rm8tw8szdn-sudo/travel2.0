import fs from "node:fs";
import path from "node:path";

import { createPublishedKnowledgeEntityLayerRepository } from "../../src/lib/routes/index.mjs";

const json = (root, relativePath) => JSON.parse(fs.readFileSync(path.join(root, relativePath), "utf8"));
const jsonl = (root, relativePath) => {
  const source = fs.readFileSync(path.join(root, relativePath), "utf8").trim();
  return source ? source.split(/\r?\n/u).map((line) => JSON.parse(line)) : [];
};
const duplicateCount = (values) => values.length - new Set(values).size;
const imageReady = (record, scope) => record?.status === "imageReady" && record.semanticScope === scope && record.assetKind === "verified-destination-image";

export function calculateKnowledgeExpansionReportData({ root, batchNumber = 7 } = {}) {
  const projectRoot = path.resolve(root || path.join(import.meta.dirname, "..", ".."));
  const batchTag = String(batchNumber).padStart(2, "0");
  const previousBatchTag = String(batchNumber - 1).padStart(2, "0");
  const repository = createPublishedKnowledgeEntityLayerRepository({ projectRoot });
  const countries = repository.listCountries();
  const cities = repository.listCities();
  const pois = repository.listPois();
  const seed = json(projectRoot, `data/knowledge/seeds/knowledge-expansion-batch${batchTag}-20-country.json`);
  const baseline = json(projectRoot, `data/knowledge/reports/knowledge-expansion-batch${batchTag}-baseline.json`);
  const targetCodes = Object.keys(seed.countries);
  const targetCodeSet = new Set(targetCodes);
  const waveBatches = Object.values(seed.waves).map((wave) => String(wave.batchNumber));
  const countryById = new Map(countries.map((country) => [country.entityId, country]));
  const cityById = new Map(cities.map((city) => [city.entityId, city]));
  const addedCountries = json(projectRoot, `data/knowledge/batches/countries.p1a-batch${batchTag}.json`).countries;
  const addedCities = waveBatches.flatMap((batch) => json(projectRoot, `data/knowledge/batches/cities.p1b-batch${batch}.json`).cities);
  const addedPois = waveBatches.flatMap((batch) => json(projectRoot, `data/knowledge/batches/pois.p1b-batch${batch}.json`).pois);
  const conflicts = [1, 2, 3, 4].flatMap((wave) => json(projectRoot, `data/knowledge/batches/conflicts.knowledge-expansion-batch${batchTag}-wave${wave}.json`).conflicts);
  const reviews = [1, 2, 3, 4].flatMap((wave) => json(projectRoot, `data/knowledge/batches/review-queue.knowledge-expansion-batch${batchTag}-wave${wave}.json`).entries);
  const selections = waveBatches.flatMap((batch) => json(projectRoot, `data/knowledge/batches/selection.p1b-batch${batch}.json`).cities);
  const evidenceAudit = json(projectRoot, `data/knowledge/batches/knowledge-expansion-batch${batchTag}-evidence-audit.json`);
  const allRouteLegs = jsonl(projectRoot, "data/route-v2/evidence-seed/route-leg-evidence.jsonl");
  const allSeasons = jsonl(projectRoot, "data/route-v2/evidence-seed/season-evidence.jsonl");
  const batchRouteLegs = allRouteLegs.filter((record) => record.retrievedAt === evidenceAudit.retrievedAt);
  const batchSeasons = allSeasons.filter((record) => record.retrievedAt === evidenceAudit.retrievedAt);
  const imageManifest = json(projectRoot, "data/route-v2/images/image-coverage-manifest.json");
  const imageProvenance = json(projectRoot, `data/route-v2/images/batch${batchTag}-dedicated-image-provenance.json`);
  const priorImageProvenance = json(projectRoot, `data/route-v2/images/batch${previousBatchTag}-dedicated-image-provenance.json`);
  const imageBaseline = json(projectRoot, "data/route-v2/images/image-asset-baseline.json");
  const routeConsumption = json(projectRoot, `data/knowledge/reports/knowledge-expansion-batch${batchTag}-route-consumption.json`);
  const browserRelativePath = `data/knowledge/reports/knowledge-expansion-batch${batchTag}-browser-acceptance.json`;
  const browserPath = path.join(projectRoot, browserRelativePath);
  const browserAcceptance = fs.existsSync(browserPath) ? json(projectRoot, browserRelativePath) : null;
  const positiveAdmissionAuditPath = "data/knowledge/reports/knowledge-poi-positive-admission-audit.json";
  const positiveAdmissionAudit = batchNumber === 9 && fs.existsSync(path.join(projectRoot, positiveAdmissionAuditPath))
    ? json(projectRoot, positiveAdmissionAuditPath)
    : null;
  const priorAssetIds = new Set(priorImageProvenance.assets.map((record) => record.entityId));
  const targetImages = imageProvenance.assets.filter((record) => targetCodeSet.has(record.countryCode));
  const historicalBackfills = imageProvenance.assets.filter((record) => !targetCodeSet.has(record.countryCode) && !priorAssetIds.has(record.entityId));
  const evidenceCountryCodes = new Set();
  for (const record of allRouteLegs) for (const entityId of [record.fromEntityId, record.toEntityId]) {
    const code = countryById.get(cityById.get(entityId)?.parentCountryEntityId)?.isoAlpha2;
    if (code) evidenceCountryCodes.add(code);
  }
  for (const record of allSeasons) {
    const code = countryById.get(cityById.get(record.entityId)?.parentCountryEntityId)?.isoAlpha2;
    if (code) evidenceCountryCodes.add(code);
  }
  const targetCountryCoverage = targetCodes.map((countryCode) => {
    const country = countries.find((record) => record.isoAlpha2 === countryCode);
    const countryCities = cities.filter((city) => city.parentCountryEntityId === country?.entityId);
    const cityIds = new Set(countryCities.map((city) => city.entityId));
    return {
      countryCode,
      label: country?.canonicalNameEn || seed.countries[countryCode].label,
      tier: seed.countries[countryCode].tier,
      cities: countryCities.length,
      pois: pois.filter((poi) => cityIds.has(poi.parentCityEntityId)).length,
      transport: batchRouteLegs.filter((record) => cityIds.has(record.fromEntityId) || cityIds.has(record.toEntityId)).length,
      monthRisk: batchSeasons.filter((record) => cityIds.has(record.entityId)).length,
      testedDurations: routeConsumption.countries[countryCode]?.testedDurations || [],
      dedicatedCities: imageManifest.cities.filter((record) => record.countryCode === countryCode && imageReady(record, "exact-city")).length,
      dedicatedPois: imageManifest.pois.filter((record) => record.countryCode === countryCode && imageReady(record, "exact-poi")).length,
      needsBackfill: [...imageManifest.cities, ...imageManifest.pois].filter((record) => record.countryCode === countryCode && record.needsBackfill).length,
    };
  });
  const parentValidation = repository.validateParentReferences();
  return Object.freeze({
    projectRoot, seed, baseline, browserAcceptance, imageManifest, imageBaseline, routeConsumption, targetCountryCoverage, positiveAdmissionAudit,
    targets: Object.freeze({ count: targetCodes.length, codes: targetCodes, waves: waveBatches.length, tier1: targetCodes.filter((code) => seed.countries[code].tier === 1).length, tier2: targetCodes.filter((code) => seed.countries[code].tier === 2).length, tier3: targetCodes.filter((code) => seed.countries[code].tier === 3).length }),
    portfolio: Object.freeze({ catalogCountries: countries.length, plannableCountries: imageManifest.countries.length, evidenceBackedCountries: evidenceCountryCodes.size, routeKnowledgeCoveredCountries: imageManifest.countries.length, catalogOnlyCountryCodes: countries.map((country) => country.isoAlpha2).filter((code) => !imageManifest.countries.some((record) => record.countryCode === code)).sort() }),
    published: Object.freeze({ countries: countries.length, cities: cities.length, pois: pois.length, total: countries.length + cities.length + pois.length }),
    additions: Object.freeze({ countries: addedCountries.length, cities: addedCities.length, pois: addedPois.length }),
    quality: Object.freeze({ duplicateEntityIds: duplicateCount([...countries, ...cities, ...pois].map((entity) => entity.entityId)), duplicateCityQids: duplicateCount(cities.map((entity) => entity.wikidataId)), duplicatePoiQids: duplicateCount(pois.map((entity) => entity.wikidataId)), orphans: parentValidation.accepted ? 0 : parentValidation.reasons.length, conflicts: conflicts.length, quarantined: reviews.length, quarantinedCities: reviews.filter((entry) => entry.disposition === "quarantined-city-not-published").length, acceptedBelowTarget: reviews.filter((entry) => entry.disposition === "accepted-below-target-without-padding").length, selectionCities: selections.length }),
    semanticRepair: positiveAdmissionAudit ? Object.freeze({
      originalPublishedPois: positiveAdmissionAudit.before.publishedPois,
      publishedPois: positiveAdmissionAudit.after.publishedPois,
      totalQuarantined: positiveAdmissionAudit.after.quarantinedPois,
      classifications: positiveAdmissionAudit.before.classifications,
      originalBatchPoiAdditions: positiveAdmissionAudit.before.publishedPois - baseline.knowledge.pois,
      finalBatchPoiAdditions: addedPois.length,
      batchQuarantined: positiveAdmissionAudit.quarantined.filter((entry) => /pois\.p1b-batch(?:30|31|32|33)\.json$/u.test(entry.sourceAssetPath || "")).length,
      historicalQuarantined: positiveAdmissionAudit.after.quarantinedPois
        - positiveAdmissionAudit.quarantined.filter((entry) => /pois\.p1b-batch(?:30|31|32|33)\.json$/u.test(entry.sourceAssetPath || "")).length,
    }) : null,
    evidence: Object.freeze({ transport: batchRouteLegs.length, monthRisk: batchSeasons.length, totalTransport: allRouteLegs.length, totalMonthRisk: allSeasons.length, auditCountries: Object.keys(evidenceAudit.countries).length, retrievedAt: evidenceAudit.retrievedAt }),
    images: Object.freeze({ countryCovers: imageManifest.coverage.overall.countryCoverCoverage.ready, countryTotal: imageManifest.coverage.overall.countryCoverCoverage.total, dedicatedCities: imageManifest.coverage.overall.cityDedicatedImageCoverage.ready, cityTotal: imageManifest.coverage.overall.cityDedicatedImageCoverage.total, dedicatedPois: imageManifest.coverage.overall.corePoiImageCoverage.ready, poiTotal: imageManifest.coverage.overall.corePoiImageCoverage.total, cityPlaceholders: imageManifest.coverage.overall.cityPlaceholderCount, poiPlaceholders: imageManifest.coverage.overall.poiPlaceholderCount, needsBackfill: imageManifest.coverage.overall.needsBackfillCount, invalidMappings: imageManifest.invalidMappings.length, batchVerifiedImages: targetImages.length, historicalBackfillImages: historicalBackfills.length, batchCountryCovers: imageManifest.countries.filter((record) => targetCodeSet.has(record.countryCode)).length, sealedHistoricalDebt: baseline.images.historicalFrozenDebt ?? null, totalNeedsBackfillBefore: baseline.images.needsBackfill, totalNeedsBackfillAfter: imageManifest.coverage.overall.needsBackfillCount, preBatchScopeNeedsBackfillAfter: imageManifest.coverage.historicalPlannableCountries.needsBackfillCount, historicalDebtBefore: baseline.images.needsBackfill, historicalDebtAfter: imageManifest.coverage.historicalPlannableCountries.needsBackfillCount, assetCount: imageBaseline.summary.totalImages, totalBytes: imageBaseline.summary.totalBytes, largerThan300Kb: imageBaseline.summary.largerThan300Kb, largerThan500Kb: imageBaseline.summary.largerThan500Kb, largerThan1Mb: imageBaseline.summary.largerThan1Mb, largerThan5Mb: imageBaseline.summary.largerThan5Mb, exactDuplicates: imageBaseline.duplicates.exactGroups.length, perceptualDuplicates: imageBaseline.duplicates.perceptualGroups.length }),
  });
}

export function calculateBatch07ReportData({ root } = {}) {
  return calculateKnowledgeExpansionReportData({ root, batchNumber: 7 });
}

export const comma = (value) => Number(value).toLocaleString("en-US");
export const percent = (ready, total) => total ? Number((ready / total * 100).toFixed(1)) : 100;
