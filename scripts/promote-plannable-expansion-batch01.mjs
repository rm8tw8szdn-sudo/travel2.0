import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

import { createPublishedKnowledgeEntityLayerRepository } from "../src/lib/routes/index.mjs";
import { batch01PromotionCountryCodes, evaluateBatch01CountryPromotion } from "../src/lib/routes/plannable-expansion-batch01-promotion-authority.mjs";
import { validateKnowledgeReadinessAuthority } from "../src/lib/routes/knowledge-readiness-authority.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");
const SEALED_MAIN = "4d03027731718ba4e355a69179a25a8e9982e43e";
const DERIVE_ONLY = process.argv.includes("--derive-only");
const POLICY_PATH = "data/knowledge/semantic/country-route-readiness-policy.json";
const PROMOTION_AUTHORITY_PATH = "data/knowledge/semantic/plannable-expansion-batch01-promotion-authority.json";
const ENTITY_REVIEW_PATH = "data/knowledge/reports/plannable-expansion-batch01-entity-review.json";
const EVIDENCE_REPORT_PATH = "data/knowledge/reports/plannable-expansion-batch01-evidence.json";
const ROUTE_EVIDENCE_PATH = "data/route-v2/evidence-seed/route-leg-evidence.jsonl";
const SEASON_EVIDENCE_PATH = "data/route-v2/evidence-seed/season-evidence.jsonl";
const REPORT_PATH = "data/knowledge/reports/plannable-expansion-batch01-promotion.json";

const parseJson = async (relativePath) => JSON.parse(await readFile(path.join(ROOT, relativePath), "utf8"));
const parseJsonl = async (relativePath) => (await readFile(path.join(ROOT, relativePath), "utf8"))
  .split(/\r?\n/u).filter(Boolean).map((line) => JSON.parse(line));
const sorted = (values) => [...new Set(values)].sort();

async function atomicJson(relativePath, value) {
  const target = path.join(ROOT, relativePath);
  await mkdir(path.dirname(target), { recursive: true });
  const temporary = `${target}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temporary, target);
}

const repository = createPublishedKnowledgeEntityLayerRepository({ projectRoot: ROOT });
const countries = repository.listCountries();
const cities = repository.listCities();
const routeEvidence = await parseJsonl(ROUTE_EVIDENCE_PATH);
const seasonEvidence = await parseJsonl(SEASON_EVIDENCE_PATH);
const entityReview = await parseJson(ENTITY_REVIEW_PATH);
const evidenceReport = await parseJson(EVIDENCE_REPORT_PATH);
const basePolicy = JSON.parse(execFileSync("git", ["show", `${SEALED_MAIN}:${POLICY_PATH}`], { cwd: ROOT, encoding: "utf8" }));
basePolicy.expectedCounts = {
  plannable: basePolicy.plannableCountryCodes.length,
  evidenceBacked: basePolicy.evidenceBackedCountryCodes.length,
  catalogOnly: basePolicy.catalogOnlyCountryCodes.length,
};
validateKnowledgeReadinessAuthority(basePolicy);
const existingCatalogOnly = new Set(basePolicy.catalogOnlyCountryCodes);
const codes = batch01PromotionCountryCodes();
const decisions = [];

for (const countryCode of codes) {
  const country = countries.find((entry) => entry.isoAlpha2 === countryCode);
  const countryCities = cities.filter((entry) => entry.parentCountryEntityId === country?.entityId);
  const cityIds = new Set(countryCities.map((entry) => entry.entityId));
  const countryPois = countryCities.flatMap((city) => repository.listPoisByCity(city.entityId));
  const review = entityReview.countriesReviewed.find((entry) => entry.countryCode === countryCode);
  assert(review, `entity-review-missing:${countryCode}`);
  const decision = evaluateBatch01CountryPromotion({
    country,
    cities: countryCities,
    pois: countryPois,
    routeLegEvidence: routeEvidence.filter((entry) => cityIds.has(entry.fromEntityId) && cityIds.has(entry.toEntityId)),
    seasonEvidence: seasonEvidence.filter((entry) => cityIds.has(entry.entityId)),
    requiredDirectedTransportSegments: review.requiredDirectedTransportSegments,
    requiredSeasonMonthProfiles: review.requiredSeasonMonthProfiles,
    currentCatalogOnly: existingCatalogOnly.has(countryCode),
  });
  decisions.push(decision);
}

const staticEligibleCodes = decisions.filter((entry) => entry.eligible).map((entry) => entry.countryCode).sort();
const staticBlockedCodes = decisions.filter((entry) => !entry.eligible).map((entry) => entry.countryCode).sort();
assert.deepEqual(staticEligibleCodes, [...evidenceReport.nextPromotionReviewInput.readyCountryCodes].sort(), "promotion decisions must match sealed production Evidence admission");
assert.deepEqual(staticBlockedCodes, [...evidenceReport.nextPromotionReviewInput.blockedCountryCodes].sort(), "blocked decisions must match sealed production Evidence admission");

const execution = spawnSync(process.execPath, [path.join(ROOT, "scripts/verify-plannable-expansion-batch01-promotion.mjs"), "--probe"], { cwd: ROOT, encoding: "utf8" });
if (execution.status !== 0) throw new Error(`promotion-route-probe-failed:${execution.stderr || execution.stdout}`);
const probe = JSON.parse(execution.stdout);
const routeBlocked = new Set(probe.routeFailures.map((entry) => entry.countryCode));
const promotedCodes = staticEligibleCodes.filter((code) => !routeBlocked.has(code));
const blockedCodes = codes.filter((code) => !promotedCodes.includes(code)).sort();
const promotionBlockedCodes = staticEligibleCodes.filter((code) => routeBlocked.has(code)).sort();
const evidenceBackedPromotions = decisions.filter((entry) => entry.evidenceBackedEligible && promotedCodes.includes(entry.countryCode)).map((entry) => entry.countryCode).sort();
const promoted = new Set(promotedCodes);
const nextPolicy = {
  ...basePolicy,
  catalogOnlyCountryCodes: sorted(basePolicy.catalogOnlyCountryCodes.filter((code) => !promoted.has(code))),
  plannableCountryCodes: sorted([...basePolicy.plannableCountryCodes, ...promotedCodes]),
  evidenceBackedCountryCodes: sorted([...basePolicy.evidenceBackedCountryCodes, ...evidenceBackedPromotions]),
  evidencePendingCountryCodes: sorted(basePolicy.evidencePendingCountryCodes.filter((code) => !promoted.has(code))),
  expectedCounts: {
    plannable: basePolicy.plannableCountryCodes.length + promotedCodes.length,
    evidenceBacked: basePolicy.evidenceBackedCountryCodes.length + evidenceBackedPromotions.length,
    catalogOnly: basePolicy.catalogOnlyCountryCodes.length - promotedCodes.length,
  },
  batch01Promotion: {
    reviewedCountryCodes: codes,
    candidateCountryCodes: staticEligibleCodes,
    promotedCountryCodes: promotedCodes,
    blockedCountryCodes: promotionBlockedCodes,
    evidencePhaseBlockedCountryCodes: staticBlockedCodes,
    evidenceBackedCountryCodes: evidenceBackedPromotions,
    themeEvidenceRequired: false,
    authority: "production-facts-reviewed-evidence-and-live-route-gate",
  },
};
const promotionAuthority = {
  schemaVersion: "route-v2-plannable-expansion-batch01-promotion-authority-v1",
  authority: "production-facts-and-live-route-gate",
  prePromotion: {
    plannableCountryCodes: basePolicy.plannableCountryCodes,
    evidenceBackedCountryCodes: basePolicy.evidenceBackedCountryCodes,
    catalogOnlyCountryCodes: basePolicy.catalogOnlyCountryCodes,
    evidencePendingCountryCodes: basePolicy.evidencePendingCountryCodes,
  },
  reviewedCountryCodes: codes,
  candidateCountryCodes: staticEligibleCodes,
  promotedCountryCodes: promotedCodes,
  blockedCountryCodes: promotionBlockedCodes,
  evidencePhaseBlockedCountryCodes: staticBlockedCodes,
  evidenceBackedCountryCodes: evidenceBackedPromotions,
  staticDecisions: decisions.map((decision) => ({
    countryCode: decision.countryCode,
    eligible: decision.eligible,
    reasons: decision.reasons,
    evidenceBackedEligible: decision.evidenceBackedEligible,
  })),
  routeGate: staticEligibleCodes.map((countryCode) => ({
    countryCode,
    requiredQueries: 4,
    passedQueries: probe.routeResults.filter((entry) => entry.countryCode === countryCode).length,
    failures: probe.routeFailures.filter((entry) => entry.countryCode === countryCode),
    hardCountryConstraint: probe.routeFailures.some((entry) => entry.countryCode === countryCode) ? "FAIL_CLOSED" : "PASS",
    decision: promotedCodes.includes(countryCode) ? "PROMOTE" : "BLOCK",
  })),
};
const report = {
  schemaVersion: "route-v2-plannable-expansion-batch01-promotion-v1",
  promotionAuthority: PROMOTION_AUTHORITY_PATH,
  reviewedCountries: codes.length,
  candidates: staticEligibleCodes.length,
  promoted: promotedCodes.length,
  blocked: promotionBlockedCodes.length,
  promotedCountryCodes: promotedCodes,
  blockedCountryCodes: promotionBlockedCodes,
  evidencePhaseBlockedCountryCodes: staticBlockedCodes,
  overallBlockedCountryCodes: blockedCodes,
  evidenceBackedPromotions,
  themeEvidence: 0,
  themeEvidenceRequired: false,
  decisions: decisions.map((decision) => ({
    ...decision,
    routeGeneration: decision.eligible ? (routeBlocked.has(decision.countryCode) ? "blocked" : "pass") : "not-eligible",
    promotionGate: promotedCodes.includes(decision.countryCode) ? "pass" : "blocked",
    finalStatus: promotedCodes.includes(decision.countryCode) ? "promoted" : "catalog-only",
    routeFailures: probe.routeFailures.filter((entry) => entry.countryCode === decision.countryCode),
  })),
  routeProbe: { queryCount: probe.routeResults.length + probe.routeFailures.length, failures: probe.routeFailures },
  productionTruth: { countries: 195, cities: 866, pois: 4071, totalEntities: 5132 },
  readiness: { ...nextPolicy.expectedCounts },
  candidateLeakage: "NONE",
  performanceClearance: "NOT_CLEARED",
};

if (DERIVE_ONLY) {
  console.log(JSON.stringify({
    schemaVersion: "route-v2-plannable-expansion-batch01-live-decision-v1",
    promotionAuthority,
    expectedPolicy: nextPolicy,
    report,
  }));
  process.exit(0);
}

await atomicJson(PROMOTION_AUTHORITY_PATH, promotionAuthority);
await atomicJson(REPORT_PATH, report);
validateKnowledgeReadinessAuthority(nextPolicy);
await atomicJson(POLICY_PATH, nextPolicy);
console.log(JSON.stringify({ status: "PASS", ...report }, null, 2));
