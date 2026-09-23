import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { buildBatch02EvidenceModel } from "./prepare-plannable-expansion-batch02-evidence.mjs";
import { reviewedTransportClaimHash, validateReviewedTransportClaim } from "../src/lib/routes/reviewed-transport-evidence-authority.mjs";
import { reviewedSeasonClaimHash, validateReviewedSeasonClaim } from "../src/lib/routes/reviewed-season-evidence-authority.mjs";
import { createPublishedKnowledgeEntityLayerRepository } from "../src/lib/routes/index.mjs";
import { getAuthoritativeKnowledgeReadiness } from "../src/lib/routes/knowledge-readiness-authority.mjs";
import { assertReviewedClaimCatalogSet, reviewedClaimCatalogSummary } from "../src/lib/routes/reviewed-claim-catalog.mjs";
import { validateReviewedSearchAttempt } from "./lib/plannable-expansion-batch02-research-attempt.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");
const json = (relative) => JSON.parse(fs.readFileSync(path.join(ROOT, relative), "utf8"));
const clone = (value) => structuredClone(value);
const catalog = json("data/knowledge/reviewed-claims/plannable-expansion-batch01-reviewed-claims.json");
const batch02Catalog = json("data/knowledge/reviewed-claims/plannable-expansion-batch02-reviewed-claims.json");
const research = json("data/knowledge/research/plannable-expansion-batch02-evidence-research.json");
const searchAttemptAudit = json("data/knowledge/research/plannable-expansion-batch02-search-attempts.json");
const writtenAudit = json("data/knowledge/batches/plannable-expansion-batch02-evidence-audit.json");
const writtenReport = json("data/knowledge/reports/plannable-expansion-batch02-evidence.json");
const rebuilt = buildBatch02EvidenceModel();

export function assertBatch02EvidenceContract({ audit, report }) {
  const rebuiltAtSeal = structuredClone(rebuilt.audit);
  rebuiltAtSeal.authority.entityCounts = audit.authority.entityCounts;
  assert.deepEqual(audit, rebuiltAtSeal, "sealed Batch02 evidence content must remain deterministic apart from additive current entity membership");
  const rebuiltReportAtSeal = structuredClone(rebuilt.report);
  rebuiltReportAtSeal.authority.entityCounts = report.authority.entityCounts;
  assert.deepEqual(report, rebuiltReportAtSeal, "sealed Batch02 report must match live Evidence coverage apart from additive current entity membership");
  assert.equal(audit.transportUnits.length, 54);
  assert.equal(audit.seasonUnits.length, 41);
  assert.equal(audit.summary.transport.required, audit.summary.transport.totalAdmitted + audit.summary.transport.blocked);
  assert.equal(audit.summary.season.required, audit.summary.season.totalAdmitted + audit.summary.season.blocked);
  assert.equal(audit.summary.transport.unaccounted, 0);
  assert.equal(audit.summary.season.unaccounted, 0);
  assert.equal(audit.summary.transport.duplicates, 0);
  assert.equal(audit.summary.transport.selfLoops, 0);
  assert.deepEqual(audit.summary.evidenceReadyCountryCodes, []);
  assert.deepEqual(audit.summary.evidenceBlockedCountryCodes, ["AO", "BJ", "BY", "BZ", "CI", "CM", "CV", "DM", "MN", "MZ", "SZ", "TL", "TT", "UG"]);
  assert.equal(audit.coverageMatrix.every((entry) => entry.evidenceReady === false && (entry.blockedTransport > 0 || entry.blockedSeason > 0)), true);
  assert.deepEqual(audit.authority.entityCounts, { countries: 195, cities: 890, pois: 4159, total: 5244 });
  assert.deepEqual(rebuilt.audit.authority.entityCounts, { countries: 195, cities: 911, pois: 4275, total: 5381 });
  assert.deepEqual(audit.authority.readinessCounts, { plannable: 122, evidenceBacked: 119, catalogOnly: 73 });
  assert.equal(audit.authority.accidentalPromotions, 0);
  assert.equal(audit.authority.candidateLeakage, "NONE");
  assert.equal(audit.authority.themeEvidenceAdded, 0);
  assert.equal(audit.authority.reportsGrantAuthority, false);
  assert.equal(audit.authority.callerControlledEvidenceAuthority, false);
}

assertBatch02EvidenceContract({ audit: writtenAudit, report: writtenReport });

const outcomes = new Set(["SOURCE_NOT_FOUND", "SOURCE_FOUND_BUT_FACT_INSUFFICIENT", "SOURCE_FOUND_BUT_WRONG_DIRECTION_OR_GEOGRAPHY", "SOURCE_FOUND_AND_FACT_SUFFICIENT_BUT_NO_REVIEWED_CLAIM_PATH", "SOURCE_FOUND_AND_ELIGIBLE_FOR_REVIEWED_CLAIM", "OTHER_EXPLICIT_BLOCKER"]);
assert.equal(research.records.length, 78);
assert.equal(research.records.filter((entry) => entry.unitType === "transport").length, 49);
assert.equal(research.records.filter((entry) => entry.unitType === "season").length, 29);
for (const entry of research.records) {
  assert(entry.unitIdentity && entry.countryCode && entry.searchQueries?.length && entry.claimAttempted && entry.bindingReview && entry.adjudicationReason && entry.reviewedAt);
  assert(outcomes.has(entry.researchOutcome));
  if (entry.researchOutcome === "SOURCE_FOUND_AND_ELIGIBLE_FOR_REVIEWED_CLAIM") assert(entry.source?.url && entry.sourceFact && entry.reviewedClaimStatus === "APPROVED_IN_BATCH02_CATALOG");
}
assert.equal(research.records.filter((entry) => entry.researchOutcome === "SOURCE_FOUND_AND_FACT_SUFFICIENT_BUT_NO_REVIEWED_CLAIM_PATH").length, 0);
assert.equal(research.records.filter((entry) => entry.researchOutcome === "SOURCE_FOUND_AND_ELIGIBLE_FOR_REVIEWED_CLAIM").length, 6);
assert.equal(research.records.filter((entry) => entry.researchOutcome === "OTHER_EXPLICIT_BLOCKER").length, 2);
assert.equal(searchAttemptAudit.attempts.length, 40);
const researchByUnit = new Map(research.records.map((entry) => [entry.unitIdentity, entry]));
for (const attempt of searchAttemptAudit.attempts) {
  const entry = researchByUnit.get(attempt.unitIdentity);
  assert(entry, `missing-research-record:${attempt.unitIdentity}`);
  assert.equal(validateReviewedSearchAttempt(attempt, entry).accepted, true, `invalid-search-attempt:${attempt.unitIdentity}`);
  assert.deepEqual(entry.searchAttempt, attempt, `search-attempt-not-preserved:${attempt.unitIdentity}`);
  assert.equal(entry.researchOutcome, attempt.finalResearchOutcome, `search-outcome-mismatch:${attempt.unitIdentity}`);
}
assert.equal(research.records.filter((entry) => entry.researchOutcome === "SOURCE_NOT_FOUND").length, 0);

const validAttempt = clone(searchAttemptAudit.attempts[0]);
const attemptMutations = [
  ["generated-query-only", (value) => { delete value.executionStatus; delete value.checkedResultReferences; }],
  ["source-map-miss-only", (value) => { value.executionStatus = "NOT_EXECUTED"; }],
  ["null-source-no-attempt", (value) => { value.executedQueries = []; value.finalResearchOutcome = "SOURCE_NOT_FOUND"; }],
  ["unknown-outcome", (value) => { value.finalResearchOutcome = "MADE_UP"; }],
  ["source-found-no-reference", (value) => { value.checkedResultReferences = []; }],
  ["eligible-no-source-fact", (value) => { value.finalResearchOutcome = "SOURCE_FOUND_AND_ELIGIBLE_FOR_REVIEWED_CLAIM"; delete value.reviewedSourceFact; }],
  ["generic-no-adjudication", (value) => { value.unitSpecificAdjudication = ""; }],
];
for (const [label, mutate] of attemptMutations) {
  const value = clone(validAttempt);
  mutate(value);
  assert.equal(validateReviewedSearchAttempt(value, researchByUnit.get(value.unitIdentity)).accepted, false, label);
}
const validNoResult = clone(validAttempt);
validNoResult.finalResearchOutcome = "SOURCE_NOT_FOUND";
validNoResult.reviewedResultOutcome = "NO_CREDIBLE_RESULT_FOUND";
validNoResult.checkedResultReferences = [];
assert.equal(validateReviewedSearchAttempt(validNoResult, researchByUnit.get(validNoResult.unitIdentity)).accepted, true, "valid-executed-no-result");
assert.equal(validateReviewedSearchAttempt(validAttempt, researchByUnit.get(validAttempt.unitIdentity)).accepted, true, "valid-source-found-attempt");
assert.deepEqual(reviewedClaimCatalogSummary().catalogIds, ["plannable-expansion-batch01", "plannable-expansion-batch02"]);
assert.equal(batch02Catalog.transportClaims.length, 3);
for (const claim of batch02Catalog.transportClaims) assert.equal(validateReviewedTransportClaim(claim).accepted, true, `invalid-batch02-claim:${claim.claimId}`);
const duplicateCatalog = clone(batch02Catalog);
duplicateCatalog.transportClaims[0] = clone(catalog.transportClaims[0]);
assert.throws(() => assertReviewedClaimCatalogSet([["plannable-expansion-batch01", catalog], ["plannable-expansion-batch02", duplicateCatalog]]));
const wrongCatalog = clone(batch02Catalog); wrongCatalog.catalogId = "caller-catalog";
assert.throws(() => assertReviewedClaimCatalogSet([["plannable-expansion-batch02", wrongCatalog]]));

const transportClaim = catalog.transportClaims[0];
const seasonClaim = catalog.seasonClaims[0];
const transportMutations = [
  ["reverse-direction", (value) => { [value.origin, value.destination] = [value.destination, value.origin]; }],
  ["unknown-reviewed-claim", (value) => { value.claimId = "unknown-claim"; }],
  ["caller-created-claim", (value) => { value.claimId = "caller-created"; value.reviewedFact = "Caller assertion"; }],
  ["wrong-origin", (value) => { value.origin.entityId = "city-0000000000000000"; }],
  ["wrong-destination", (value) => { value.destination.entityId = "city-0000000000000000"; }],
  ["wrong-country", (value) => { value.countryCode = "ZZ"; }],
  ["source-claim-mismatch", (value) => { value.source.url = "https://example.com/forged"; }],
  ["report-only-evidence", (value) => { value.claimId = "report-created"; }],
  ["candidate-only-destination", (value) => { value.destination.entityId = "city-candidate-only"; }],
];
for (const [label, mutate] of transportMutations) {
  const value = clone(transportClaim);
  mutate(value);
  value.reviewedPayloadHash = reviewedTransportClaimHash(value);
  assert.equal(validateReviewedTransportClaim(value).accepted, false, label);
}
assert.equal(validateReviewedTransportClaim(clone(transportClaim)).accepted, true, "valid exact-direction claim");

const seasonMutations = [
  ["wrong-destination", (value) => { value.destination.entityId = "city-0000000000000000"; }],
  ["wrong-country", (value) => { value.countryCode = "ZZ"; }],
  ["wrong-month", (value) => { value.admittedMonth = value.admittedMonth === 1 ? 2 : 1; }],
  ["nearby-city-substitution", (value) => { value.destination.entityId = "city-nearby-substitution"; }],
  ["country-source-city-binding", (value) => { value.geographicScope = { kind: "country", identity: value.countryCode, reviewedApplicability: "caller assertion" }; }],
  ["caller-created-reviewed-claim", (value) => { value.claimId = "caller-created-season"; }],
  ["report-only-season", (value) => { value.claimId = "report-season"; }],
  ["planner-derived-season", (value) => { value.reviewedFact = "planner-derived"; }],
];
for (const [label, mutate] of seasonMutations) {
  const value = clone(seasonClaim);
  mutate(value);
  value.reviewedPayloadHash = reviewedSeasonClaimHash(value);
  assert.equal(validateReviewedSeasonClaim(value).accepted, false, label);
}
assert.equal(validateReviewedSeasonClaim(clone(seasonClaim)).accepted, true, "valid exact reviewed seasonal claim");

const contractMutations = [
  ["remove-required-transport", (value) => { value.audit.transportUnits.pop(); }],
  ["remove-required-season", (value) => { value.audit.seasonUnits.pop(); }],
  ["same-count-country-substitution", (value) => { value.audit.coverageMatrix[0].countryCode = "ZZ"; }],
  ["report-says-ready", (value) => { value.report.coverageMatrix[0].evidenceReady = true; }],
  ["report-says-blocked-live-complete", (value) => { value.report.summary.evidenceReadyCountryCodes = ["AO"]; }],
  ["caller-says-ready", (value) => { value.audit.callerReadyCountryCodes = ["AO"]; }],
  ["candidate-only-entity", (value) => { value.audit.transportUnits[0].origin.entityId = "city-candidate-only"; }],
  ["quarantine-injection", (value) => { value.audit.seasonUnits[0].destination.entityId = "poi-quarantined"; }],
];
for (const [label, mutate] of contractMutations) {
  const value = { audit: clone(writtenAudit), report: clone(writtenReport) };
  mutate(value);
  assert.throws(() => assertBatch02EvidenceContract(value), undefined, label);
}

const repository = createPublishedKnowledgeEntityLayerRepository({ projectRoot: ROOT });
assert.deepEqual({ countries: repository.listCountries().length, cities: repository.listCities().length, pois: repository.listPois().length }, { countries: 195, cities: 911, pois: 4275 });
assert.deepEqual(getAuthoritativeKnowledgeReadiness().expectedCounts, { plannable: 122, evidenceBacked: 119, catalogOnly: 73 });

console.log(JSON.stringify({
  verifier: "plannable-expansion-batch02-evidence",
  status: "PASS",
  transport: writtenAudit.summary.transport,
  season: writtenAudit.summary.season,
  evidenceReadyCountryCodes: writtenAudit.summary.evidenceReadyCountryCodes,
  evidenceBlockedCountryCodes: writtenAudit.summary.evidenceBlockedCountryCodes,
  transportMutationCases: 10,
  seasonMutationCases: 9,
  evidenceReadyAndBoundaryMutationCases: contractMutations.length,
  researchRecords: research.records.length,
  researchAttemptRecords: searchAttemptAudit.attempts.length,
  researchAttemptMutationCases: attemptMutations.length + 2,
  multiCatalogAuthority: "PASS",
  entityCounts: writtenAudit.authority.entityCounts,
  readinessCounts: writtenAudit.authority.readinessCounts,
  candidateLeakage: "NONE",
}, null, 2));
