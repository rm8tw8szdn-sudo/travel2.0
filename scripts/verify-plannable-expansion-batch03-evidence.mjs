import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { validateBatch03ResearchAttempt } from "./lib/plannable-expansion-batch03-research-attempt.mjs";
import {
  validateExactReviewedDirectionScope,
  validateReviewedTransportClaim,
} from "../src/lib/routes/reviewed-transport-evidence-authority.mjs";
import { validateReviewedSeasonClaim } from "../src/lib/routes/reviewed-season-evidence-authority.mjs";
import { resolveReviewedTransportClaim, resolveReviewedSeasonClaim } from "../src/lib/routes/reviewed-claim-catalog.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");
const json = (relativePath) => JSON.parse(fs.readFileSync(path.join(ROOT, relativePath), "utf8"));
const jsonl = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), "utf8").split(/\r?\n/u).filter(Boolean).map(JSON.parse);
const clone = structuredClone;
const research = json("data/knowledge/research/plannable-expansion-batch03-evidence-research.json");
const audit = json("data/knowledge/batches/plannable-expansion-batch03-evidence-audit.json");
const report = json("data/knowledge/reports/plannable-expansion-batch03-evidence.json");
const catalog = json("data/knowledge/reviewed-claims/plannable-expansion-batch03-reviewed-claims.json");
const seed = json("data/knowledge/seeds/plannable-expansion-batch03-evidence.json");
const routes = jsonl("data/route-v2/evidence-seed/route-leg-evidence.jsonl").filter((entry) => entry.diagnostics?.some((item) => item.reason === "plannable-expansion-batch03-evidence"));
const seasons = jsonl("data/route-v2/evidence-seed/season-evidence.jsonl").filter((entry) => entry.diagnostics?.some((item) => item.reason === "plannable-expansion-batch03-evidence"));

assert.equal(research.records.length, 35);
assert.equal(new Set(research.records.map((entry) => entry.unitIdentity)).size, 35);
assert.deepEqual(audit.research, { required: 35, researched: 35, unresearched: 0, generatedQueryOnly: 0, unclassified: 0 });
assert.deepEqual(audit.counts, { transport: { required: 14, admitted: 2, blocked: 12, unaccounted: 0 }, season: { required: 21, admitted: 1, blocked: 20, unaccounted: 0 } });
assert.equal(audit.outcomes.ELIGIBLE, 3);
assert.equal(audit.outcomes.FACT_INSUFFICIENT, 32);
assert.equal(audit.outcomes.NOT_RESEARCHED, 0);
assert.deepEqual(report.evidenceReadyCountryCodes, ["LC"]);
assert.equal(report.authority.researchAuthority, "NONE");
assert.equal(report.authority.reportAuthority, "NONE");
assert.equal(report.authority.callerAuthority, "NONE");
assert.equal(report.authority.accidentalPromotions, 0);
for (const entry of research.records) assert.equal(validateBatch03ResearchAttempt(entry, entry.unitIdentity).accepted, true);

const base = research.records[0];
const kills = [];
const rejectResearch = (name, mutate) => {
  const value = clone(base);
  mutate(value);
  assert.equal(validateBatch03ResearchAttempt(value, base.unitIdentity).accepted, false, name);
  kills.push(name);
};
rejectResearch("missing-attempt", (value) => { value.searchAttempt = null; });
rejectResearch("missing-reference", (value) => { value.searchAttempt.checkedResultReferences = []; });
rejectResearch("generated-query-only", (value) => { value.searchAttempt.searchMethod = "generated query only"; });
rejectResearch("not-researched", (value) => { value.searchAttempt.finalResearchOutcome = "NOT_RESEARCHED"; value.researchOutcome = "NOT_RESEARCHED"; });
rejectResearch("missing-adjudication", (value) => { value.searchAttempt.unitSpecificAdjudication = ""; });
rejectResearch("wrong-unit", (value) => { value.searchAttempt.unitIdentity = "transport:wrong"; });
rejectResearch("invalid-time", (value) => { value.searchAttempt.reviewedAt = "fake"; });
rejectResearch("outcome-mismatch", (value) => { value.researchOutcome = "ELIGIBLE"; });

assert.equal(catalog.transportClaims.length, 1, "unsupported KN claim must be revoked");
assert.deepEqual(seed.approvedTransportClaimIds, ["batch03-cg-brazzaville-pointe-noire-1"]);
const transportClaim = resolveReviewedTransportClaim(catalog.transportClaims[0].claimId);
const seasonClaim = resolveReviewedSeasonClaim(catalog.seasonClaims[0].claimId);
assert.equal(validateReviewedTransportClaim(transportClaim).accepted, true);
assert.equal(validateExactReviewedDirectionScope(transportClaim).accepted, true);
assert.equal(validateReviewedSeasonClaim(seasonClaim).accepted, true);

for (const [name, mutate] of [
  ["altered-fingerprint", (value) => { value.reviewedPayloadHash = "0".repeat(64); }],
  ["wrong-country", (value) => { value.countryCode = "ZZ"; }],
  ["wrong-destination", (value) => { value.destination.entityId = "city-wrong"; }],
  ["wrong-category", (value) => { value.supports = [value.supports[0].replace("route-leg:", "season:")]; }],
  ["reverse-direction", (value) => { value.supports = value.supports.slice().reverse(); }],
  ["same-count-substitution", (value) => { value.origin.entityId = "city-substitute"; }],
]) {
  const value = clone(transportClaim);
  mutate(value);
  assert.equal(validateReviewedTransportClaim(value).accepted, false, name);
  kills.push(name);
}

const forwardOnly = clone(transportClaim);
forwardOnly.directionality = "directional";
forwardOnly.supports = [transportClaim.supports[0]];
forwardOnly.reviewedDirections = [transportClaim.reviewedDirections[0]];
assert.equal(validateExactReviewedDirectionScope(forwardOnly).accepted, true, "exact authorized forward direction");
const reverseSubstitution = clone(forwardOnly);
reverseSubstitution.reviewedDirections = [transportClaim.reviewedDirections[1]];
assert.equal(validateExactReviewedDirectionScope(reverseSubstitution).accepted, false, "forward-only authority rejects reverse");
const reverseOnly = clone(transportClaim);
reverseOnly.origin = transportClaim.destination;
reverseOnly.destination = transportClaim.origin;
reverseOnly.directionality = "directional";
reverseOnly.supports = [transportClaim.supports[1]];
reverseOnly.reviewedDirections = [transportClaim.reviewedDirections[1]];
assert.equal(validateExactReviewedDirectionScope(reverseOnly).accepted, true, "exact authorized reverse direction");
const forwardSubstitution = clone(reverseOnly);
forwardSubstitution.reviewedDirections = [transportClaim.reviewedDirections[0]];
assert.equal(validateExactReviewedDirectionScope(forwardSubstitution).accepted, false, "reverse-only authority rejects forward");
const connectionOnly = clone(transportClaim);
connectionOnly.claimId = "fixture-connection-only";
connectionOnly.reviewedFact = "The source says only that A and B are connected.";
delete connectionOnly.reviewedDirections;
assert.equal(validateExactReviewedDirectionScope(connectionOnly).accepted, false, "connection wording cannot authorize bidirectional legs");
assert.equal(validateReviewedTransportClaim(connectionOnly).accepted, false, "unsupported bidirectional claim is outside reviewed authority");

const actualDirections = routes.map((entry) => `${entry.fromEntityId}>${entry.toEntityId}`).sort();
assert.deepEqual(actualDirections, transportClaim.reviewedDirections.map((entry) => `${entry.from.entityId}>${entry.to.entityId}`).sort(), "production directions equal exact reviewed direction scope");
assert.equal(routes.some((entry) => ["city-c2ab81fa714c618e", "city-79ceb5a70825c90f"].includes(entry.fromEntityId)), false, "KN directions are not admitted");
for (const record of research.records.filter((entry) => entry.countryCode === "KN" && entry.unitType === "transport")) {
  assert.equal(record.researchOutcome, "FACT_INSUFFICIENT");
  assert.equal(record.reviewedClaimStatus, "NOT_APPROVED");
}

for (const [name, mutate] of [
  ["season-wrong-country", (value) => { value.countryCode = "ZZ"; }],
  ["season-wrong-destination", (value) => { value.destination.entityId = "city-wrong"; }],
  ["season-profile-substitution", (value) => { value.admittedMonth = 9; }],
]) {
  const value = clone(seasonClaim);
  mutate(value);
  assert.equal(validateReviewedSeasonClaim(value).accepted, false, name);
  kills.push(name);
}
assert.equal(seasons.length, 1);
assert.equal(seasons[0].entityId, seasonClaim.destination.entityId);
assert.equal(seasons[0].month, 10);
const lcSeasonComplete = (entries) => entries.length === 1
  && entries[0].entityId === seasonClaim.destination.entityId
  && entries[0].month === seasonClaim.admittedMonth
  && validateReviewedSeasonClaim(seasonClaim).accepted;
assert.equal(lcSeasonComplete(seasons), true, "LC existing formal destination profile is complete from admitted production evidence");
assert.equal(lcSeasonComplete([]), false, "removing October evidence makes LC incomplete");
assert.equal(lcSeasonComplete([{ ...seasons[0], month: 9 }]), false, "arbitrary single-month substitution cannot make LC complete");
assert.deepEqual(report.evidenceReadyCountryCodes, ["LC"]);

assert.equal(resolveReviewedTransportClaim("unknown"), null);
assert.equal(resolveReviewedSeasonClaim("unknown"), null);
const duplicateMembership = clone(audit.exactMembership);
duplicateMembership[34] = duplicateMembership[0];
assert.equal(new Set(duplicateMembership).size, 34);
assert.equal(new Set(audit.exactMembership).size, 35);

console.log(JSON.stringify({
  verifier: "plannable-expansion-batch03-evidence",
  status: "PASS",
  exactResearchMembership: "35/35",
  authorityMutationCases: kills.length,
  researchCompletenessMutationCases: 8,
  exactDirectionControls: 7,
  lcSeasonCompletenessControls: 3,
  counts: audit.counts,
  outcomes: audit.outcomes,
  evidenceReadyCountryCodes: report.evidenceReadyCountryCodes,
  candidateLeakage: "NONE",
}, null, 2));
