import assert from "node:assert/strict";

import {
  ROUTE_V2_CONTROLLED_RUNTIME_FLAGS,
  ROUTE_V2_RUNTIME_DECISION_SCHEMA_VERSION,
  createRouteSearchService,
  createRouteV2RuntimeEnvironment,
  resolveRouteV2RuntimeDecision,
} from "../src/lib/routes/index.mjs";
import { envFlag } from "../src/lib/routes/route-v2-env.mjs";

const CHILD_OVERRIDE_FIXTURE = Object.freeze({
  ROUTE_V2_INTENT_ENABLED: "true",
  ROUTE_V2_TIME_INTENT_ENABLED: "true",
  ROUTE_V2_CANDIDATE_POOL_ENABLED: "true",
  ROUTE_V2_TRACE_ENABLED: "true",
  ROUTE_V2_EVIDENCE_BUNDLE_ENABLED: "true",
  ROUTE_V2_EVIDENCE_LOCAL_ENABLED: "true",
  ROUTE_V2_EVIDENCE_ONLINE_ENABLED: "true",
  ROUTE_V2_TAVILY_EVIDENCE_ENABLED: "true",
  ROUTE_V2_WIKIVOYAGE_EVIDENCE_ENABLED: "true",
  ROUTE_V2_EVIDENCE_VALIDATION_ENABLED: "true",
  ROUTE_V2_LOCAL_EVIDENCE_INDEX_ENABLED: "true",
  ROUTE_V2_PUBLICATION_GATE_ENABLED: "true",
  ROUTE_V2_READY_POOL_ENABLED: "true",
  ROUTE_V2_ROUTE_INTENT_SHADOW_VALIDATION: "true",
});

const DEFAULT_ENABLED_RUNTIME_FLAGS = Object.freeze([
  "ROUTE_V2_INTENT_ENABLED",
  "ROUTE_V2_TIME_INTENT_ENABLED",
  "ROUTE_V2_CANDIDATE_POOL_ENABLED",
  "ROUTE_V2_TRACE_ENABLED",
  "ROUTE_V2_EVIDENCE_BUNDLE_ENABLED",
]);

function assertAllControlledFlags(environment, expected, message) {
  for (const flag of ROUTE_V2_CONTROLLED_RUNTIME_FLAGS) {
    assert.equal(
      environment[flag],
      expected,
      `${message}: ${flag} must resolve to ${expected}`,
    );
  }
}

const safeDefault = createRouteV2RuntimeEnvironment({});
assert.equal(safeDefault.ROUTE_V2_RUNTIME_ENABLED, "false");
assert.equal(safeDefault.ROUTE_V2_CANARY_PERCENTAGE, "0");
assertAllControlledFlags(safeDefault, "false", "safe default");

const masterOff = createRouteV2RuntimeEnvironment({
  ROUTE_V2_RUNTIME_ENABLED: "false",
  ROUTE_V2_CANARY_PERCENTAGE: "100",
  ...CHILD_OVERRIDE_FIXTURE,
});
assertAllControlledFlags(masterOff, "false", "hard master off");
assert.equal(envFlag(masterOff, "ROUTE_V2_INTENT_ENABLED", true), false);
assert.equal(
  envFlag({ ROUTE_V2_INTENT_ENABLED: "true" }, "ROUTE_V2_INTENT_ENABLED", true),
  false,
  "a missing master switch must fail closed",
);
assert.equal(envFlag({
  ROUTE_V2_RUNTIME_ENABLED: "false",
  ROUTE_V2_INTENT_ENABLED: "true",
}, "ROUTE_V2_INTENT_ENABLED", true), false, "the shared flag reader must fail closed");

const disabledDecision = resolveRouteV2RuntimeDecision({
  env: masterOff,
  sessionId: "phase1-master-disabled",
});
assert.equal(disabledDecision.decision.schemaVersion, ROUTE_V2_RUNTIME_DECISION_SCHEMA_VERSION);
assert.equal(disabledDecision.decision.enabled, false);
assert.equal(disabledDecision.decision.reason, "master-disabled");
assert.equal(disabledDecision.decision.masterEnabled, false);
assert.equal(disabledDecision.decision.rolloutPercentage, 100);
assertAllControlledFlags(disabledDecision.environment, "false", "disabled decision");

const zeroRuntime = createRouteV2RuntimeEnvironment({
  ROUTE_V2_RUNTIME_ENABLED: "true",
  ROUTE_V2_CANARY_PERCENTAGE: "0",
});
const zeroDecision = resolveRouteV2RuntimeDecision({
  env: zeroRuntime,
  sessionId: "phase1-rollout-zero",
});
assert.equal(zeroDecision.decision.enabled, false);
assert.equal(zeroDecision.decision.reason, "rollout-disabled");
assertAllControlledFlags(zeroDecision.environment, "false", "zero-percent decision");

const fullRuntime = createRouteV2RuntimeEnvironment({
  ROUTE_V2_RUNTIME_ENABLED: "true",
  ROUTE_V2_CANARY_PERCENTAGE: "100",
});
for (let index = 0; index < 50; index += 1) {
  const resolved = resolveRouteV2RuntimeDecision({
    env: fullRuntime,
    sessionId: `phase1-full-${index}`,
  });
  assert.equal(resolved.decision.enabled, true);
  assert.equal(resolved.decision.reason, "canary-included");
  for (const flag of DEFAULT_ENABLED_RUNTIME_FLAGS) {
    assert.equal(resolved.environment[flag], "true", `${flag} must remain enabled inside the canary`);
  }
}

const missingSubject = resolveRouteV2RuntimeDecision({ env: fullRuntime });
assert.equal(missingSubject.decision.enabled, true);
assert.equal(missingSubject.decision.reason, "canary-included");
assert.equal(missingSubject.decision.subjectType, "anonymous");
assert.equal(missingSubject.decision.bucket, null);
for (const flag of DEFAULT_ENABLED_RUNTIME_FLAGS) {
  assert.equal(missingSubject.environment[flag], "true", `anonymous full rollout: ${flag}`);
}

const halfRuntime = createRouteV2RuntimeEnvironment({
  ROUTE_V2_RUNTIME_ENABLED: "true",
  ROUTE_V2_CANARY_PERCENTAGE: "50",
  ROUTE_V2_CANARY_SALT: "phase1-test-salt",
});
const halfDecisions = Array.from({ length: 200 }, (_, index) => {
  const sessionId = `phase1-half-${index}`;
  return [
    resolveRouteV2RuntimeDecision({ env: halfRuntime, sessionId }),
    resolveRouteV2RuntimeDecision({ env: halfRuntime, sessionId }),
  ];
});
const partialMissingSubject = resolveRouteV2RuntimeDecision({ env: halfRuntime });
assert.equal(partialMissingSubject.decision.enabled, false);
assert.equal(partialMissingSubject.decision.reason, "missing-subject");
assert.equal(partialMissingSubject.decision.bucket, null);
assertAllControlledFlags(partialMissingSubject.environment, "false", "partial rollout missing-subject decision");
assert(halfDecisions.some(([item]) => item.decision.enabled), "50% rollout must include stable buckets");
assert(halfDecisions.some(([item]) => !item.decision.enabled), "50% rollout must exclude stable buckets");
for (const [left, right] of halfDecisions) {
  assert.deepEqual(left.decision, right.decision, "the same session must receive the same decision");
  assert.equal(left.decision.subjectType, "session");
  assert.equal(Number.isInteger(left.decision.bucket), true);
  assert(left.decision.bucket >= 0 && left.decision.bucket <= 9_999);
}

const stableUserA = resolveRouteV2RuntimeDecision({
  env: halfRuntime,
  userId: "phase1-user-a",
  sessionId: "phase1-session-a",
});
const stableUserB = resolveRouteV2RuntimeDecision({
  env: halfRuntime,
  userId: "phase1-user-a",
  sessionId: "phase1-session-b",
});
assert.equal(stableUserA.decision.subjectType, "user");
assert.equal(stableUserA.decision.subjectHash, stableUserB.decision.subjectHash);
assert.equal(stableUserA.decision.bucket, stableUserB.decision.bucket);
assert.equal(stableUserA.decision.enabled, stableUserB.decision.enabled);

const serializedDecision = JSON.stringify(stableUserA.decision);
for (const secret of ["phase1-user-a", "phase1-session-a", "phase1-test-salt"]) {
  assert.equal(serializedDecision.includes(secret), false, "runtime diagnostics must not expose rollout inputs");
}
assert.equal(serializedDecision.includes(process.cwd()), false);

const cacheWrites = [];
const reviewWrites = [];
const analyticsEvents = [];
let plannerInput = null;
const searchService = createRouteSearchService({
  acceptedRepository: {
    list: () => ({ records: [] }),
    upsert: () => {
      throw new Error("legacy fallback verification must not write Accepted Repository");
    },
  },
  searchCache: {
    get: () => null,
    put: (value) => cacheWrites.push(structuredClone(value)),
    appendReviewCandidates: (value) => reviewWrites.push(structuredClone(value)),
    findRoute: () => null,
  },
  analytics: {
    logSearch: (value) => analyticsEvents.push(structuredClone(value)),
  },
  planner: {
    async buildCandidates(input) {
      plannerInput = structuredClone(input);
      return {
        accepted: [],
        rejected: [{ reason: "legacy-test-planner-empty" }],
      };
    },
  },
  env: zeroRuntime,
});

const legacyResult = await searchService.search({
  mode: "search",
  query: "Iceland winter trip",
  sessionId: "phase1-legacy-fallback-session",
  limit: 6,
}, {
  requestId: "phase1-legacy-request",
});

assert(plannerInput, "the legacy Planner path must still be invoked outside the canary");
assert.equal(plannerInput.context.routeV2RuntimeDecision.enabled, false);
assert.equal(plannerInput.context.routeV2RuntimeDecision.reason, "rollout-disabled");
assertAllControlledFlags(
  plannerInput.context.routeV2RuntimeEnvironment,
  "false",
  "legacy Planner request environment",
);
assert.equal(legacyResult.records.length, 1, "legacy fallback must still return a text route");
assert.equal(
  String(legacyResult.records[0].generationVersion || "").startsWith("route-generation-v2-"),
  false,
  "non-canary fallback must not claim V2 generation",
);
assert.equal(legacyResult.diagnostics.routeV2Runtime.enabled, false);
assert.equal(legacyResult.diagnostics.routeV2Runtime.reason, "rollout-disabled");
assert.equal(cacheWrites.length, 1);
assert.equal(reviewWrites.length, 1);
assert.equal(analyticsEvents.at(-1)?.routeV2Runtime?.enabled, false);

let canaryPlannerInput = null;
const canarySearchService = createRouteSearchService({
  acceptedRepository: {
    list: () => ({ records: [] }),
    upsert: () => {
      throw new Error("canary routing verification must not write Accepted Repository");
    },
  },
  searchCache: {
    get: () => null,
    put: () => {},
    appendReviewCandidates: () => {},
    findRoute: () => null,
  },
  analytics: {
    logSearch: () => {},
  },
  planner: {
    async buildCandidates(input) {
      canaryPlannerInput = structuredClone(input);
      return {
        accepted: [],
        rejected: [{ reason: "canary-routing-test-planner-empty" }],
      };
    },
  },
  env: fullRuntime,
});

const canaryResult = await canarySearchService.search({
  mode: "search",
  query: "Iceland winter road trip",
  sessionId: "phase1-full-search-session",
  limit: 6,
}, {
  requestId: "phase1-full-search-request",
});

assert(canaryPlannerInput, "the 100% canary request must reach the Planner");
assert.equal(canaryPlannerInput.context.routeV2RuntimeDecision.enabled, true);
assert.equal(canaryPlannerInput.context.routeV2RuntimeDecision.reason, "canary-included");
for (const flag of DEFAULT_ENABLED_RUNTIME_FLAGS) {
  assert.equal(
    canaryPlannerInput.context.routeV2RuntimeEnvironment[flag],
    "true",
    `${flag} must be enabled in the 100% Search-to-Planner path`,
  );
}
assert.equal(canaryResult.diagnostics.routeV2Runtime.enabled, true);
assert.equal(canaryResult.diagnostics.routeV2Runtime.reason, "canary-included");

console.log(JSON.stringify({
  ok: true,
  schemaVersion: ROUTE_V2_RUNTIME_DECISION_SCHEMA_VERSION,
  safeDefault: {
    master: safeDefault.ROUTE_V2_RUNTIME_ENABLED,
    percentage: safeDefault.ROUTE_V2_CANARY_PERCENTAGE,
  },
  fullRolloutSubjects: 50,
  halfRollout: {
    total: halfDecisions.length,
    included: halfDecisions.filter(([item]) => item.decision.enabled).length,
    excluded: halfDecisions.filter(([item]) => !item.decision.enabled).length,
    stable: true,
  },
  legacyFallback: {
    plannerCalled: Boolean(plannerInput),
    records: legacyResult.records.length,
    decision: legacyResult.diagnostics.routeV2Runtime.reason,
  },
  fullRolloutSearchPath: {
    plannerCalled: Boolean(canaryPlannerInput),
    decision: canaryResult.diagnostics.routeV2Runtime.reason,
  },
  childOverrideBlocked: true,
  diagnosticsRedacted: true,
}, null, 2));
