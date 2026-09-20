import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  createAcceptedRouteRepository,
  createDecisionTraceStore,
  createEvidenceBundleStore,
  createEvidenceRepository,
  createKnowledgeEntityLayerPlannerAdapter,
  createKnowledgeEntityLayerSearchIntentCatalog,
  createPublishedKnowledgeEntityLayerRepository,
  createRouteCandidatePoolStore,
  createRouteCompositionPlanner,
  createRouteSearchService,
} from "../src/lib/routes/index.mjs";
import * as publicRouteApi from "../src/lib/routes/index.mjs";
import { createBatch01PromotionEvaluationSearchService } from "../src/lib/routes/route-search-service.mjs";
import { evaluateBatch01CountryPromotion } from "../src/lib/routes/plannable-expansion-batch01-promotion-authority.mjs";
import { getAuthoritativeKnowledgeReadiness, validateKnowledgeReadinessAuthority } from "../src/lib/routes/knowledge-readiness-authority.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");
const PROBE = process.argv.includes("--probe");
const STATIC_CANDIDATES = Object.freeze(["BB", "RW", "SC", "SM", "ZM", "ZW"]);
const PROMOTED = Object.freeze(["BB", "RW", "ZM", "ZW"]);
const PROMOTION_BLOCKED = Object.freeze(["SC", "SM"]);
const EVIDENCE_PHASE_BLOCKED = Object.freeze(["BZ", "CV", "DM", "MN", "TT", "UG"]);
const OVERALL_BLOCKED = Object.freeze([...EVIDENCE_PHASE_BLOCKED, ...PROMOTION_BLOCKED].sort());
const LABELS = Object.freeze({ BB: "Barbados", RW: "Rwanda", SC: "Seychelles", SM: "San Marino", ZM: "Zambia", ZW: "Zimbabwe" });
const TEMPORARY_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "route-v2-batch01-promotion-"));
const readinessPolicy = JSON.parse(fs.readFileSync(path.join(ROOT, "data/knowledge/semantic/country-route-readiness-policy.json"), "utf8"));
const promotionAuthority = JSON.parse(fs.readFileSync(path.join(ROOT, "data/knowledge/semantic/plannable-expansion-batch01-promotion-authority.json"), "utf8"));
const clone = (value) => structuredClone(value);
const replace = (values, from, to) => values.map((value) => value === from ? to : value);
const substitutePromotion = (from, to) => {
  const mutated = clone(readinessPolicy);
  mutated.plannableCountryCodes = replace(mutated.plannableCountryCodes, from, to);
  mutated.catalogOnlyCountryCodes = replace(mutated.catalogOnlyCountryCodes, to, from);
  mutated.evidenceBackedCountryCodes = replace(mutated.evidenceBackedCountryCodes, from, to);
  mutated.evidencePendingCountryCodes = replace(mutated.evidencePendingCountryCodes, to, from);
  mutated.batch01Promotion.promotedCountryCodes = replace(mutated.batch01Promotion.promotedCountryCodes, from, to);
  mutated.batch01Promotion.blockedCountryCodes = replace(mutated.batch01Promotion.blockedCountryCodes, to, from);
  mutated.batch01Promotion.evidenceBackedCountryCodes = replace(mutated.batch01Promotion.evidenceBackedCountryCodes, from, to);
  return mutated;
};

function memorySearchCache() {
  const entries = new Map();
  return {
    get(intent) { return structuredClone(entries.get(intent.intentHash) || null); },
    put(item) { entries.set(item.intent.intentHash, structuredClone(item)); },
    appendReviewCandidates() {},
    findRoute() { return null; },
  };
}

function runtimeEnv() {
  return {
    ROUTE_V2_RUNTIME_ENABLED: "true",
    ROUTE_V2_CANARY_PERCENTAGE: "100",
    ROUTE_V2_INTENT_ENABLED: "true",
    ROUTE_V2_TIME_INTENT_ENABLED: "true",
    ROUTE_V2_CANDIDATE_POOL_ENABLED: "true",
    ROUTE_V2_TRACE_ENABLED: "true",
    ROUTE_V2_EVIDENCE_BUNDLE_ENABLED: "true",
    ROUTE_V2_EVIDENCE_LOCAL_ENABLED: "false",
    ROUTE_V2_EVIDENCE_VALIDATION_ENABLED: "false",
    ROUTE_V2_PUBLICATION_GATE_ENABLED: "false",
    ROUTE_V2_READY_POOL_ENABLED: "false",
    ROUTE_V2_EVIDENCE_ONLINE_ENABLED: "false",
    ROUTE_V2_TAVILY_EVIDENCE_ENABLED: "false",
    ROUTE_V2_WIKIVOYAGE_EVIDENCE_ENABLED: "false",
    SEARCH_MAX_PLANNER_CALLS_PER_REQUEST: "1",
    SEARCH_PLANNER_TIMEOUT_MS: "30000",
    SEARCH_AUTO_ACCEPT_GENERATED: "false",
  };
}

const unique = (values) => [...new Set(values.filter(Boolean))];
const recordCountries = (record) => unique((record.countryEntities || []).map((entry) => entry.countryCode)).sort();
const recordCities = (record) => Array.isArray(record.destinationEntities) ? record.destinationEntities : [];
const recordPois = (record) => unique([
  ...(record.routeExpansion?.poiEntityIds || []),
  ...recordCities(record).flatMap((city) => [
    ...(city.poiEntityIds || []),
    ...(city.poiEntities || []).map((poi) => poi.entityId),
  ]),
]);

const readiness = PROBE ? null : getAuthoritativeKnowledgeReadiness();
if (!PROBE) {
  assert.deepEqual(readiness.expectedCounts, { plannable: 122, evidenceBacked: 119, catalogOnly: 73 });
  assert.equal(PROMOTED.every((code) => readiness.plannableCountryCodes.includes(code) && !readiness.catalogOnlyCountryCodes.includes(code) && !readiness.evidencePendingCountryCodes.includes(code)), true);
  assert.equal(OVERALL_BLOCKED.every((code) => readiness.catalogOnlyCountryCodes.includes(code) && readiness.evidencePendingCountryCodes.includes(code) && !readiness.plannableCountryCodes.includes(code)), true);
  assert.equal(PROMOTED.every((code) => readiness.evidenceBackedCountryCodes.includes(code)), true);
  assert.equal(["SC", "SM"].every((code) => !readiness.evidenceBackedCountryCodes.includes(code)), true, "single-destination exemptions do not fabricate directed transport Evidence");
  assert.deepEqual(readinessPolicy.batch01Promotion.candidateCountryCodes, STATIC_CANDIDATES);
  assert.deepEqual(readinessPolicy.batch01Promotion.promotedCountryCodes, PROMOTED);
  assert.deepEqual(readinessPolicy.batch01Promotion.blockedCountryCodes, PROMOTION_BLOCKED);
  assert.deepEqual(readinessPolicy.batch01Promotion.evidencePhaseBlockedCountryCodes, EVIDENCE_PHASE_BLOCKED);
  const missingPromotion = (code) => {
    const mutated = clone(readinessPolicy);
    mutated.plannableCountryCodes = mutated.plannableCountryCodes.filter((entry) => entry !== code);
    mutated.evidenceBackedCountryCodes = mutated.evidenceBackedCountryCodes.filter((entry) => entry !== code);
    mutated.catalogOnlyCountryCodes.push(code);
    mutated.evidencePendingCountryCodes.push(code);
    mutated.batch01Promotion.promotedCountryCodes = mutated.batch01Promotion.promotedCountryCodes.filter((entry) => entry !== code);
    mutated.batch01Promotion.evidenceBackedCountryCodes = mutated.batch01Promotion.evidenceBackedCountryCodes.filter((entry) => entry !== code);
    mutated.batch01Promotion.blockedCountryCodes.push(code);
    return mutated;
  };
  const metadataOnly = clone(readinessPolicy);
  metadataOnly.batch01Promotion.promotedCountryCodes = replace(metadataOnly.batch01Promotion.promotedCountryCodes, "BB", "SC");
  metadataOnly.batch01Promotion.blockedCountryCodes = replace(metadataOnly.batch01Promotion.blockedCountryCodes, "SC", "BB");
  metadataOnly.batch01Promotion.evidenceBackedCountryCodes = replace(metadataOnly.batch01Promotion.evidenceBackedCountryCodes, "BB", "SC");
  const productionAuthorityMutations = [
    ["bb-to-sc-same-count", substitutePromotion("BB", "SC")],
    ["bb-to-sm-same-count", substitutePromotion("BB", "SM")],
    ["rw-to-sc-same-count", substitutePromotion("RW", "SC")],
    ["zm-to-sm-same-count", substitutePromotion("ZM", "SM")],
    ["remove-required-bb", missingPromotion("BB")],
    ["remove-required-rw", missingPromotion("RW")],
    ["arbitrary-iso-substitution", substitutePromotion("BB", "ZZ")],
    ["metadata-only-substitution", metadataOnly],
    ["correct-count-wrong-member", substitutePromotion("ZW", "SC")],
  ];
  for (const [label, mutation] of productionAuthorityMutations) {
    assert.throws(() => validateKnowledgeReadinessAuthority(mutation), /READINESS_AUTHORITY_/u, label);
  }
  assert.doesNotThrow(() => validateKnowledgeReadinessAuthority(clone(readinessPolicy)), "valid independently derived membership");
  assert.equal("createRoutePromotionEvaluationSearchService" in publicRouteApi, false, "generic promotion bypass must not be public");
  assert.equal("createBatch01PromotionEvaluationSearchService" in publicRouteApi, false, "fixed internal evaluator must not be public");

  const authorityPath = path.join(ROOT, "data/knowledge/semantic/plannable-expansion-batch01-promotion-authority.json");
  const originalAuthorityText = fs.readFileSync(authorityPath, "utf8");
  const writeAuthorityMutation = (mutate) => {
    const value = JSON.parse(originalAuthorityText);
    mutate(value);
    fs.writeFileSync(authorityPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  };
  const swapArtifactPromotion = (value, from, to) => {
    value.promotedCountryCodes = replace(value.promotedCountryCodes, from, to);
    value.blockedCountryCodes = replace(value.blockedCountryCodes, to, from);
    value.evidenceBackedCountryCodes = replace(value.evidenceBackedCountryCodes, from, to);
    for (const gate of value.routeGate) {
      if (gate.countryCode === from) Object.assign(gate, { passedQueries: 0, failures: [{ reason: "tampered" }], hardCountryConstraint: "FAIL_CLOSED", decision: "BLOCK" });
      if (gate.countryCode === to) Object.assign(gate, { passedQueries: 4, failures: [], hardCountryConstraint: "PASS", decision: "PROMOTE" });
    }
  };
  try {
    writeAuthorityMutation((value) => swapArtifactPromotion(value, "BB", "SC"));
    assert.throws(() => validateKnowledgeReadinessAuthority(substitutePromotion("BB", "SC")), /READINESS_AUTHORITY_/u, "artifact+policy BB-to-SC");
    writeAuthorityMutation((value) => swapArtifactPromotion(value, "BB", "SM"));
    assert.throws(() => validateKnowledgeReadinessAuthority(substitutePromotion("BB", "SM")), /READINESS_AUTHORITY_/u, "artifact+policy BB-to-SM");
    writeAuthorityMutation((value) => { const gate = value.routeGate.find((entry) => entry.countryCode === "SC"); Object.assign(gate, { passedQueries: 4, failures: [], hardCountryConstraint: "PASS", decision: "PROMOTE" }); });
    assert.throws(() => validateKnowledgeReadinessAuthority(clone(readinessPolicy)), /READINESS_AUTHORITY_PROMOTION_AUDIT_MISMATCH/u, "forged SC route gate");
    writeAuthorityMutation((value) => { const gate = value.routeGate.find((entry) => entry.countryCode === "SM"); Object.assign(gate, { passedQueries: 4, failures: [], hardCountryConstraint: "PASS", decision: "PROMOTE" }); });
    assert.throws(() => validateKnowledgeReadinessAuthority(clone(readinessPolicy)), /READINESS_AUTHORITY_PROMOTION_AUDIT_MISMATCH/u, "forged SM route gate");
    writeAuthorityMutation((value) => { value.promotedCountryCodes = value.promotedCountryCodes.filter((code) => code !== "BB"); });
    assert.throws(() => validateKnowledgeReadinessAuthority(clone(readinessPolicy)), /READINESS_AUTHORITY_/u, "removed BB audit result");
    writeAuthorityMutation((value) => { value.routeGate.find((entry) => entry.countryCode === "BB").hardCountryConstraint = "FAIL_CLOSED"; });
    assert.throws(() => validateKnowledgeReadinessAuthority(clone(readinessPolicy)), /READINESS_AUTHORITY_/u, "route metadata tamper");
  } finally {
    fs.writeFileSync(authorityPath, originalAuthorityText, "utf8");
  }
  assert.doesNotThrow(() => validateKnowledgeReadinessAuthority(clone(readinessPolicy)), "correct audit artifact");
}

const validFixture = {
  country: { entityType: "country", entityId: "country-0000000000000001", wikidataId: "Q1", canonicalNameEn: "Fixture", isoAlpha2: "BB" },
  cities: [{ entityType: "city", entityId: "city-0000000000000001", wikidataId: "Q2", canonicalNameEn: "Fixture City", parentCountryEntityId: "country-0000000000000001" }],
  pois: [{ entityType: "poi", entityId: "poi-0000000000000001", wikidataId: "Q3", canonicalNameEn: "Fixture POI", parentCityEntityId: "city-0000000000000001" }],
  routeLegEvidence: [],
  seasonEvidence: [{ entityId: "city-0000000000000001", month: 2, weatherRisks: ["rain-risk"] }],
  requiredDirectedTransportSegments: 0,
  requiredSeasonMonthProfiles: 1,
  currentCatalogOnly: true,
};
assert.equal(evaluateBatch01CountryPromotion(validFixture).eligible, true, "general single-destination exemption control");
assert.equal(evaluateBatch01CountryPromotion({ ...validFixture, cities: [...validFixture.cities, { ...validFixture.cities[0], entityId: "city-0000000000000002", wikidataId: "Q4", canonicalNameEn: "Second City" }] }).eligible, false, "multi-destination cannot inherit exemption");
assert.equal(evaluateBatch01CountryPromotion({ ...validFixture, seasonEvidence: [] }).eligible, false, "missing season must fail closed");
assert.equal(evaluateBatch01CountryPromotion({ ...validFixture, pois: [] }).eligible, false, "missing POI depth must fail closed");
assert.equal(evaluateBatch01CountryPromotion({ ...validFixture, currentCatalogOnly: false, promote: true }).eligible, false, "caller promotion assertion grants no authority");

const repository = createPublishedKnowledgeEntityLayerRepository({ projectRoot: ROOT });
const env = runtimeEnv();
const acceptedRepository = createAcceptedRouteRepository({ storagePath: path.join(TEMPORARY_ROOT, "accepted.json") });
const planner = createRouteCompositionPlanner({
  acceptedRepository,
  evidenceRepository: createEvidenceRepository({ storagePath: path.join(TEMPORARY_ROOT, "legacy-evidence.json") }),
  candidatePoolStore: createRouteCandidatePoolStore({ storagePath: path.join(TEMPORARY_ROOT, "candidate-pool.jsonl"), env }),
  decisionTraceStore: createDecisionTraceStore({ storagePath: path.join(TEMPORARY_ROOT, "decision-traces.jsonl"), env }),
  evidenceBundleStore: createEvidenceBundleStore({ storagePath: path.join(TEMPORARY_ROOT, "evidence-bundles.jsonl"), env }),
  knowledgeGraph: createKnowledgeEntityLayerPlannerAdapter({ repository }),
  env,
});
const service = createBatch01PromotionEvaluationSearchService({
  acceptedRepository,
  searchCache: memorySearchCache(),
  planner,
  intentCatalog: createKnowledgeEntityLayerSearchIntentCatalog({ repository }),
  env,
});

const originalFetch = globalThis.fetch;
let externalFetchCalls = 0;
globalThis.fetch = async () => { externalFetchCalls += 1; throw new Error("NETWORK_DISABLED_FOR_BATCH01_PROMOTION"); };
const routeResults = [];
const routeFailures = [];
try {
  for (const code of STATIC_CANDIDATES) {
    const label = LABELS[code];
    const queries = [label, `${label} 7 days`, `${label} February`, `${label} 7 days in February`];
    for (const [index, query] of queries.entries()) {
      const response = await service.search({ query, limit: 3, sessionId: `batch01-promotion-${code.toLowerCase()}-${index + 1}` });
      if (!response.records.length) {
        routeFailures.push({ countryCode: code, query, reason: response.diagnostics?.reason || "no-route", plannerRejected: response.diagnostics?.plannerRejected || [] });
        continue;
      }
      const record = response.records[0];
      const cities = recordCities(record);
      const pois = recordPois(record);
      assert.deepEqual(recordCountries(record), [code], `${query}:hard-country-constraint`);
      assert(cities.length > 0, `${query}:destination-required`);
      assert.equal(unique(cities.map((city) => city.entityId)).length, cities.length, `${query}:duplicate-city`);
      assert.equal(unique(pois).length, pois.length, `${query}:duplicate-poi`);
      if (query.includes("7 days")) {
        assert(pois.length > 0, `${query}:poi-depth-required`);
        assert.equal(Number(record.durationDays), 7, `${query}:duration`);
      }
      routeResults.push({ countryCode: code, query, routeId: record.id, durationDays: Number(record.durationDays), destinationCount: cities.length, poiCount: pois.length });
    }
  }
} finally {
  globalThis.fetch = originalFetch;
}
assert.equal(externalFetchCalls, 0, "promotion runtime must not perform external Evidence lookup");

let publicBypassCases = 0;
if (!PROBE) {
  const normalService = createRouteSearchService({
    candidateCountryCodes: ["SC", "SM", "BZ", "ZZ"],
    acceptedRepository,
    searchCache: memorySearchCache(),
    planner,
    intentCatalog: createKnowledgeEntityLayerSearchIntentCatalog({ repository }),
    env,
  });
  for (const query of ["Seychelles 7 days", "San Marino 7 days", "Belize 7 days"]) {
    const response = await normalService.search({ query, limit: 3, sessionId: `batch01-public-boundary-${publicBypassCases + 1}` });
    assert.equal(response.diagnostics?.plannerCalled, false, `${query}: public search must not bypass readiness`);
    assert.equal(response.records.length, 0, `${query}: public search must remain fail-closed`);
    publicBypassCases += 1;
  }
}

const result = {
  verifier: "plannable-expansion-batch01-promotion",
  status: PROBE ? "PROBE" : "PASS",
  candidates: 6,
  promoted: PROMOTED,
  blocked: PROMOTION_BLOCKED,
  evidencePhaseBlocked: EVIDENCE_PHASE_BLOCKED,
  overallBlocked: OVERALL_BLOCKED,
  readiness: readiness?.expectedCounts || null,
  routeQueries: routeResults.length,
  routeResults,
  staticAuthorityMutationCases: 5,
  productionAuthorityMutationCases: 10,
  artifactTamperMutationCases: 7,
  publicBypassCases,
  externalFetchCalls,
  routeFailures,
};
console.log(JSON.stringify(result, null, 2));
if (!PROBE) {
  assert.deepEqual([...new Set(routeFailures.map((entry) => entry.countryCode))].sort(), PROMOTION_BLOCKED);
  assert.deepEqual(STATIC_CANDIDATES.filter((code) => !routeFailures.some((entry) => entry.countryCode === code)).sort(), PROMOTED);
  assert.deepEqual(promotionAuthority.promotedCountryCodes, PROMOTED);
  assert.deepEqual(promotionAuthority.blockedCountryCodes, PROMOTION_BLOCKED);
  for (const gate of promotionAuthority.routeGate) {
    assert.equal(gate.passedQueries, routeResults.filter((entry) => entry.countryCode === gate.countryCode).length, `${gate.countryCode}: live route result must match independent authority`);
    assert.deepEqual(gate.failures, routeFailures.filter((entry) => entry.countryCode === gate.countryCode), `${gate.countryCode}: live route failures must match independent authority`);
  }
}
