import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { createPublishedKnowledgeEntityLayerRepository } from "../src/lib/routes/index.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");
const MANIFEST_PATH = "data/route-v2/images/image-coverage-manifest.json";
const ADMISSION_AUDIT_PATH = "data/knowledge/reports/knowledge-poi-positive-admission-audit.json";
const HISTORICAL_PROVENANCE_PATH = "data/route-v2/images/image-debt-elimination-provenance.json";
const HISTORICAL_RECOVERY_PATH = "data/route-v2/images/image-debt-recovery-results.json";
const OUTPUT_PATH = "data/route-v2/images/image-debt-recovery02-inventory.json";
const FROZEN_AT = "2026-09-06T00:00:00.000Z";

const readJson = (relativePath) => JSON.parse(fs.readFileSync(path.join(ROOT, relativePath), "utf8"));
const sha256 = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
const normalize = (value) => String(value || "").normalize("NFKC").replace(/\s+/gu, " ").trim();
const unaccent = (value) => normalize(value).normalize("NFKD").replace(/\p{M}+/gu, "");
const unique = (values) => [...new Set(values.map(normalize).filter(Boolean))];

const manifest = readJson(MANIFEST_PATH);
const admissionAudit = readJson(ADMISSION_AUDIT_PATH);
const historicalProvenance = readJson(HISTORICAL_PROVENANCE_PATH);
const historicalRecovery = readJson(HISTORICAL_RECOVERY_PATH);
const repository = createPublishedKnowledgeEntityLayerRepository({ projectRoot: ROOT });
const countries = repository.listCountries();
const cities = repository.listCities();
const pois = repository.listPois();
const countryById = new Map(countries.map((entity) => [entity.entityId, entity]));
const cityById = new Map(cities.map((entity) => [entity.entityId, entity]));
const poiById = new Map(pois.map((entity) => [entity.entityId, entity]));
const admittedById = new Map((admissionAudit.publishedAdmissions || []).map((entry) => [entry.entityId, entry]));
const quarantinedIds = new Set((admissionAudit.quarantined || []).map((entry) => entry.entityId));
const historicalAttemptById = new Map((historicalProvenance.attempts || []).map((entry) => [entry.entityId, entry]));
const historicalRecoveryById = new Map((historicalRecovery.records || []).map((entry) => [entry.entityId, entry]));

const debt = [...manifest.cities, ...manifest.pois].filter((entry) => entry.needsBackfill === true);
const cityDebt = debt.filter((entry) => entry.entityType === "City");
const poiDebt = debt.filter((entry) => entry.entityType === "POI");
const derivedDebt = (manifest.cities.length - manifest.cities.filter((entry) => entry.status === "imageReady").length)
  + (manifest.pois.length - manifest.pois.filter((entry) => entry.status === "imageReady").length);

if (debt.length !== derivedDebt || debt.length !== manifest.coverage.overall.needsBackfillCount) {
  throw new Error(`recovery02-debt-count-mismatch:${debt.length}:${derivedDebt}:${manifest.coverage.overall.needsBackfillCount}`);
}
if (new Set(debt.map((entry) => entry.entityId)).size !== debt.length) throw new Error("recovery02-duplicate-debt-entity");

const records = debt.map((entry) => {
  if (entry.status !== "placeholder" || entry.assetPath !== manifest.fallbackPolicy.city || entry.semanticScope !== "neutral-placeholder") {
    throw new Error(`recovery02-non-neutral-debt:${entry.entityId}:${entry.assetPath}`);
  }
  if (quarantinedIds.has(entry.entityId)) throw new Error(`recovery02-quarantined-target:${entry.entityId}`);

  const entity = entry.entityType === "City" ? cityById.get(entry.entityId) : poiById.get(entry.entityId);
  if (!entity || entity.wikidataId !== entry.wikidataId || entity.canonicalNameEn !== entry.canonicalNameEn) {
    throw new Error(`recovery02-published-identity-mismatch:${entry.entityId}`);
  }

  const parentCity = entry.entityType === "POI" ? cityById.get(entity.parentCityEntityId) : null;
  const country = entry.entityType === "City"
    ? countryById.get(entity.parentCountryEntityId)
    : countryById.get(parentCity?.parentCountryEntityId);
  if (!country || country.isoAlpha2 !== entry.countryCode) throw new Error(`recovery02-country-mismatch:${entry.entityId}`);

  if (entry.entityType === "POI") {
    const admission = admittedById.get(entry.entityId);
    if (!entry.core || !admission || admission.wikidataId !== entry.wikidataId || admission.parentCityEntityId !== entry.parentCityEntityId) {
      throw new Error(`recovery02-poi-not-canonical-core:${entry.entityId}`);
    }
  }

  const historicalAttempt = historicalAttemptById.get(entry.entityId) || null;
  const previousRecovery = historicalRecoveryById.get(entry.entityId) || null;
  const previousAttempts = [
    ...(historicalAttempt ? [{
      phase: "image-debt-elimination",
      status: historicalAttempt.status,
      reasonCode: historicalAttempt.reasonCode || null,
      reasonDetail: historicalAttempt.reasonDetail || null,
      candidateFile: historicalAttempt.commonsFileTitle || null,
    }] : []),
    ...((previousRecovery?.sourceAttempts || []).map((attempt) => ({
      phase: "image-debt-multi-source-recovery",
      source: attempt.sourcePath,
      status: attempt.status,
      reasonCode: attempt.reasonCode || null,
      reasonDetail: attempt.reasonDetail || null,
      candidateFile: attempt.candidateFile || null,
      candidateUrl: attempt.candidateUrl || null,
    }))),
  ];
  const priorFailure = previousRecovery?.finalFailureReason || (historicalAttempt ? {
    reasonCode: historicalAttempt.reasonCode || null,
    reasonDetail: historicalAttempt.reasonDetail || null,
  } : null);
  const identityParts = entry.entityType === "City"
    ? [entry.canonicalNameEn, country.canonicalNameEn]
    : [entry.canonicalNameEn, parentCity?.canonicalNameEn, country.canonicalNameEn];
  const query = normalize(identityParts.join(" "));

  return {
    entityId: entry.entityId,
    qid: entry.wikidataId,
    entityType: entry.entityType,
    canonicalNameEn: entry.canonicalNameEn,
    countryCode: entry.countryCode,
    countryNameEn: country.canonicalNameEn,
    parentCityEntityId: parentCity?.entityId || null,
    parentCityQid: parentCity?.wikidataId || null,
    parentCityNameEn: parentCity?.canonicalNameEn || null,
    priority: entry.backfillPriority,
    routeExposure: entry.backfillPriority === "high" ? "high" : "standard",
    isCorePoi: entry.entityType === "POI" ? entry.core === true : false,
    currentFallback: entry.assetPath,
    needsBackfill: true,
    previousAttempts,
    previousAttemptCount: previousAttempts.length,
    failureReason: priorFailure,
    exhausted: false,
    firstPass: {
      reasonCode: priorFailure?.reasonCode || "NOT_ATTEMPTED_IN_CURRENT_SCOPE",
      reasonDetail: priorFailure?.reasonDetail || "No prior exact-image recovery attempt is recorded for this current debt entity.",
      candidateTitles: unique(previousAttempts.map((attempt) => attempt.candidateFile)),
      visualAuditId: historicalAttempt?.visualAuditId || null,
    },
    searchKeys: unique([
      entry.wikidataId,
      entry.canonicalNameEn,
      unaccent(entry.canonicalNameEn),
      query,
      unaccent(query),
    ]),
  };
}).sort((left, right) => ({ high: 0, normal: 1, low: 2 }[left.priority] - ({ high: 0, normal: 1, low: 2 }[right.priority]))
  || left.entityType.localeCompare(right.entityType, "en")
  || left.countryCode.localeCompare(right.countryCode, "en")
  || left.canonicalNameEn.localeCompare(right.canonicalNameEn, "en")
  || left.entityId.localeCompare(right.entityId, "en"));

const sourceHashes = Object.fromEntries([
  MANIFEST_PATH,
  ADMISSION_AUDIT_PATH,
  HISTORICAL_PROVENANCE_PATH,
  HISTORICAL_RECOVERY_PATH,
].map((relativePath) => [relativePath, sha256(fs.readFileSync(path.join(ROOT, relativePath)))]));

const output = {
  schemaVersion: "route-v2-image-debt-recovery02-inventory-v1",
  frozenAt: FROZEN_AT,
  sourceHashes,
  publishedTruth: {
    countries: countries.length,
    cities: cities.length,
    pois: pois.length,
    entities: countries.length + cities.length + pois.length,
    quarantinedPois: quarantinedIds.size,
  },
  startingNeedsBackfill: records.length,
  cityCount: cityDebt.length,
  corePoiCount: poiDebt.length,
  quarantinedTargets: records.filter((record) => quarantinedIds.has(record.entityId)).length,
  records,
};

fs.writeFileSync(path.join(ROOT, OUTPUT_PATH), `${JSON.stringify(output, null, 2)}\n`, "utf8");
console.log(JSON.stringify({
  status: "PASS",
  output: OUTPUT_PATH,
  startingNeedsBackfill: output.startingNeedsBackfill,
  cityCount: output.cityCount,
  corePoiCount: output.corePoiCount,
  quarantinedTargets: output.quarantinedTargets,
  publishedTruth: output.publishedTruth,
}, null, 2));
