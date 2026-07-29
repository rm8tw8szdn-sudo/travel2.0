import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { auditRouteV2Cache } from "../src/lib/routes/cache-baseline-v2.mjs";
import {
  buildLegacyDecisionTrace,
  routeIntentSnapshot,
} from "../src/lib/routes/decision-trace-schema.mjs";
import {
  buildEvidenceBundleLifecycle,
  createEvidenceBundleLifecycleId,
} from "../src/lib/routes/evidence-bundle-schema.mjs";
import {
  normalizeRouteCandidate,
  validateRouteCandidate,
} from "../src/lib/routes/route-candidate-pool.mjs";
import {
  normalizeRouteIntent,
  validateNormalizedRouteIntent,
} from "../src/lib/routes/route-intent-model.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cacheRoot = path.join(projectRoot, ".route-v2-cache");
const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "route-v2-cache-semantic-integrity-"));
const isolatedCache = path.join(temporaryRoot, "cache");
const fixedNow = "2026-07-28T00:00:00.000Z";

function writeJson(relativePath, value) {
  fs.writeFileSync(path.join(isolatedCache, relativePath), `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function writeJsonl(relativePath, records) {
  fs.writeFileSync(
    path.join(isolatedCache, relativePath),
    records.map((record) => JSON.stringify(record)).join("\n") + (records.length ? "\n" : ""),
    "utf8",
  );
}

function auditMustFail(label, predicate) {
  const audit = auditRouteV2Cache(isolatedCache);
  assert.equal(audit.status, "FAIL", `${label}: audit must fail`);
  assert(
    audit.errors.some(predicate),
    `${label}: expected structured error, got ${JSON.stringify(audit.errors, null, 2)}`,
  );
  return audit.errors.filter(predicate);
}

const requiredFiles = [
  "accepted-routes.json",
  "route-evidence.json",
  "provider-sync-state.json",
  "knowledge-graph-pool.json",
  "search-analytics.jsonl",
  "search-cache.json",
  "search-review-candidates.json",
];

try {
  fs.mkdirSync(isolatedCache, { recursive: true });
  for (const relativePath of requiredFiles) {
    fs.copyFileSync(path.join(cacheRoot, relativePath), path.join(isolatedCache, relativePath));
  }

  const cleanSearchCache = JSON.parse(fs.readFileSync(path.join(isolatedCache, "search-cache.json"), "utf8"));
  cleanSearchCache.items = Object.fromEntries(Object.entries(cleanSearchCache.items).filter(([, item]) => (
    validateNormalizedRouteIntent(item?.normalizedIntent).valid
  )));
  writeJson("search-cache.json", cleanSearchCache);

  const canonicalIntent = normalizeRouteIntent({
    intentId: "cache-semantic-intent",
    intentMode: "specified-destination",
    country: "JP",
    countryCode: "JP",
    durationDays: 7,
    requiredDestinationIds: ["Q1490", "Q34600"],
    requiredDestinationNames: ["Tokyo", "Kyoto"],
    destinationOrderMode: "fixed",
    timeIntent: {
      type: "single-month",
      months: [2],
      season: null,
      rawText: "2月",
      diagnostics: [],
    },
  });
  const snapshot = routeIntentSnapshot({
    context: {
      intentId: "cache-semantic-intent",
      intentMode: "specified-destination",
      country: "JP",
      countryCode: "JP",
      durationDays: 7,
      requiredDestinationIds: ["Q1490", "Q34600"],
      requiredDestinationNames: ["Tokyo", "Kyoto"],
      destinationOrderMode: "fixed",
      timeIntent: { type: "single-month", months: [2], season: null },
      normalizedRouteIntent: canonicalIntent,
    },
    intentId: "cache-semantic-intent",
    source: "cache-semantic-integrity-verifier",
    createdAt: fixedNow,
  });
  const destinations = [
    { id: "Q1490", wikidataId: "Q1490", name: "Tokyo", countryCode: "JP" },
    { id: "Q34600", wikidataId: "Q34600", name: "Kyoto", countryCode: "JP" },
  ];
  const candidate = normalizeRouteCandidate({
    intentId: "cache-semantic-intent",
    countries: ["JP"],
    destinations,
    proposedOrder: destinations.map((entry) => entry.id),
    durationDays: 7,
    travelStyle: "classic",
    generationSource: "cache-semantic-integrity-verifier",
    status: "selected",
    routeIntentFingerprintVersion: snapshot.routeIntentFingerprintVersion,
    routeIntentFingerprint: snapshot.routeIntentFingerprint,
    normalizedRouteIntent: snapshot.normalizedRouteIntent,
    inputIntentSnapshot: snapshot,
    createdAt: fixedNow,
  });
  assert.equal(validateRouteCandidate(candidate).accepted, true);
  const routeRecord = {
    id: "cache-semantic-route",
    intentId: candidate.intentId,
    selectedCandidateId: candidate.candidateId,
    routeIntentSchemaVersion: snapshot.routeIntentSchemaVersion,
    generationVersion: "route-generation-v2-phase1",
    routeIntentFingerprintVersion: candidate.routeIntentFingerprintVersion,
    routeIntentFingerprint: candidate.routeIntentFingerprint,
    normalizedRouteIntent: structuredClone(candidate.normalizedRouteIntent),
    destinationEntities: destinations.map((entry) => structuredClone(entry)),
    destinations: destinations.map((entry) => entry.name),
    countries: ["JP"],
    durationDays: 7,
    travelStyle: "classic",
  };
  const rejectedCandidates = ["alternative-a", "alternative-b"].map((candidateVariant, index) => normalizeRouteCandidate({
    intentId: candidate.intentId,
    countries: ["JP"],
    destinations,
    proposedOrder: index === 0
      ? [...candidate.proposedOrder].reverse()
      : [candidate.proposedOrder[1], candidate.proposedOrder[0]],
    durationDays: 7,
    travelStyle: index === 0 ? "rail" : "culture",
    candidateVariant,
    generationSource: "cache-semantic-integrity-verifier",
    status: "rejected",
    rejectionReasons: [{
      code: `not-selected-${index + 1}`,
      reason: `not-selected-${index + 1}`,
    }],
    routeIntentFingerprintVersion: snapshot.routeIntentFingerprintVersion,
    routeIntentFingerprint: snapshot.routeIntentFingerprint,
    normalizedRouteIntent: snapshot.normalizedRouteIntent,
    inputIntentSnapshot: snapshot,
    createdAt: fixedNow,
  }));
  for (const rejected of rejectedCandidates) assert.equal(validateRouteCandidate(rejected).accepted, true);
  const candidateSelection = {
    ready: true,
    selectedCandidate: structuredClone(candidate),
    inputIntentSnapshot: structuredClone(snapshot),
    candidatePool: [candidate, ...rejectedCandidates].map((entry) => structuredClone(entry)),
    rejectedCandidates: rejectedCandidates.map((entry) => structuredClone(entry)),
    rejectionReasons: rejectedCandidates.map((entry) => ({
      candidateId: entry.candidateId,
      ...structuredClone(entry.rejectionReasons[0]),
    })),
    decisionFactors: [],
    unknowns: [],
  };
  const decisionTrace = buildLegacyDecisionTrace({
    route: routeRecord,
    context: {
      intentId: candidate.intentId,
      normalizedRouteIntent: canonicalIntent,
    },
    source: "cache-semantic-integrity-verifier",
    candidateSelection,
    timestamp: fixedNow,
  });
  routeRecord.decisionTraceId = decisionTrace.traceId;
  const evidenceBuild = buildEvidenceBundleLifecycle({
    selectedCandidate: candidate,
    routeRecord,
    decisionTrace,
    context: {
      intentId: candidate.intentId,
      country: "JP",
      countryCode: "JP",
      durationDays: 7,
      timeIntent: { type: "single-month", months: [2], season: null },
      normalizedRouteIntent: canonicalIntent,
    },
    now: () => fixedNow,
  });
  assert.equal(evidenceBuild.created, true, JSON.stringify(evidenceBuild.reasons || []));

  writeJsonl("route-candidate-pool.jsonl", [candidate]);
  writeJsonl("decision-traces.jsonl", [decisionTrace]);
  writeJsonl("route-evidence-bundles.jsonl", [evidenceBuild.bundle]);
  writeJson("route-feed-bootstrap-payload.json", {
    ok: true,
    records: [routeRecord],
    hasMore: false,
  });
  const cleanAudit = auditRouteV2Cache(isolatedCache);
  assert.equal(cleanAudit.status, "PASS", cleanAudit.errors.join("\n"));

  const originalSearchCache = structuredClone(cleanSearchCache);
  const [searchFingerprint, searchItem] = Object.entries(originalSearchCache.items)
    .find(([, item]) => validateNormalizedRouteIntent(item.normalizedIntent).valid);
  assert(searchFingerprint && searchItem, "isolated Search Cache needs one canonical record");

  const timeContradiction = structuredClone(originalSearchCache);
  timeContradiction.items[searchFingerprint].normalizedIntent.hardConstraints.timeType = "unspecified";
  timeContradiction.items[searchFingerprint].normalizedIntent.hardConstraints.months = {
    state: "provided",
    values: [2],
  };
  writeJson("search-cache.json", timeContradiction);
  const timeErrors = auditMustFail("time contradiction", (error) => (
    error.includes("search-cache.json:item-")
      && error.includes("route-intent-semantic-invalid")
      && error.includes("hardConstraints.months")
  ));

  const modeContradiction = structuredClone(originalSearchCache);
  modeContradiction.items[searchFingerprint].normalizedIntent.intentMode = "insufficient-intent";
  writeJson("search-cache.json", modeContradiction);
  const modeErrors = auditMustFail("intent mode contradiction", (error) => (
    error.includes("search-cache.json:item-")
      && error.includes("route-intent-semantic-invalid")
      && error.includes("intentMode")
  ));
  writeJson("search-cache.json", originalSearchCache);

  const snapshotMismatch = structuredClone(candidate);
  snapshotMismatch.inputIntentSnapshot.timeIntent = {
    type: "unspecified",
    months: [],
    season: null,
    rawText: "",
    diagnostics: [],
  };
  writeJsonl("route-candidate-pool.jsonl", [snapshotMismatch]);
  writeJsonl("route-evidence-bundles.jsonl", []);
  const snapshotErrors = auditMustFail("Candidate snapshot mismatch", (error) => (
    error.includes("route-candidate-pool.jsonl:record-0:candidate-invalid")
      && error.includes("inputIntentSnapshot")
  ));

  writeJsonl("route-candidate-pool.jsonl", [candidate]);
  const malformedEvidenceCases = [
    ["empty fingerprint", { routeIntentFingerprint: "" }, "routeIntentFingerprint"],
    ["empty fingerprint version", { routeIntentFingerprintVersion: "" }, "routeIntentFingerprintVersion"],
    ["unknown fingerprint version", { routeIntentFingerprintVersion: "route-intent-fingerprint-v999" }, "routeIntentFingerprintVersion"],
  ];
  const evidenceErrors = [];
  for (const [label, patch, expectedPath] of malformedEvidenceCases) {
    const bundle = { ...evidenceBuild.bundle, ...patch };
    bundle.evidenceBundleId = createEvidenceBundleLifecycleId(bundle);
    writeJsonl("route-evidence-bundles.jsonl", [bundle]);
    evidenceErrors.push(...auditMustFail(label, (error) => (
      error.includes("route-evidence-bundles.jsonl:record-0:sidecar-invalid")
        && error.includes(expectedPath)
    )));
  }

  const mismatchedEvidence = {
    ...evidenceBuild.bundle,
    routeIntentFingerprint: `rif-v1-${"0".repeat(64)}`,
  };
  mismatchedEvidence.evidenceBundleId = createEvidenceBundleLifecycleId(mismatchedEvidence);
  writeJsonl("route-evidence-bundles.jsonl", [mismatchedEvidence]);
  const associationErrors = auditMustFail("Evidence Candidate mismatch", (error) => (
    error.includes("route-evidence-bundles.jsonl:record-0")
      && error.includes("evidence-candidate-fingerprint-mismatch")
      && error.endsWith("routeIntentFingerprint")
  ));

  const associationDetections = {};
  const bundleWith = (patch) => {
    const bundle = { ...structuredClone(evidenceBuild.bundle), ...patch };
    bundle.evidenceBundleId = createEvidenceBundleLifecycleId(bundle);
    return bundle;
  };
  const resetValidChain = () => {
    writeJsonl("route-candidate-pool.jsonl", [candidate]);
    writeJsonl("decision-traces.jsonl", [decisionTrace]);
    writeJsonl("route-evidence-bundles.jsonl", [evidenceBuild.bundle]);
    writeJson("route-feed-bootstrap-payload.json", {
      ok: true,
      records: [routeRecord],
      hasMore: false,
    });
  };

  resetValidChain();
  writeJsonl("route-evidence-bundles.jsonl", [bundleWith({ decisionTraceId: "dt-nonexistent" })]);
  associationDetections.missingDecisionTrace = auditMustFail("missing DecisionTrace", (error) => (
    error.includes("evidence-decision-trace-reference-missing:decisionTraceId")
  ));

  resetValidChain();
  writeJsonl("route-candidate-pool.jsonl", [candidate, ...rejectedCandidates]);
  writeJsonl("route-evidence-bundles.jsonl", [bundleWith({
    candidateId: rejectedCandidates[0].candidateId,
  })]);
  associationDetections.traceCandidateMismatch = auditMustFail("Trace Candidate mismatch", (error) => (
    error.includes("evidence-decision-trace-candidate-mismatch:candidateId")
  ));

  resetValidChain();
  writeJsonl("route-evidence-bundles.jsonl", [bundleWith({ intentId: "intent-cross-linked" })]);
  associationDetections.intentMismatch = auditMustFail("intent mismatch", (error) => (
    error.includes("evidence-candidate-intent-mismatch:intentId")
      || error.includes("evidence-decision-trace-intent-mismatch:intentId")
  ));

  resetValidChain();
  writeJsonl("route-evidence-bundles.jsonl", [bundleWith({
    routeIntentFingerprint: `rif-v1-${"1".repeat(64)}`,
  })]);
  associationDetections.fingerprintMismatch = auditMustFail("fingerprint mismatch", (error) => (
    error.includes("evidence-candidate-fingerprint-mismatch:routeIntentFingerprint")
  ));

  resetValidChain();
  writeJsonl("route-evidence-bundles.jsonl", [bundleWith({
    routeIntentFingerprintVersion: "route-intent-fingerprint-v999",
  })]);
  associationDetections.versionMismatch = auditMustFail("fingerprint version mismatch", (error) => (
    error.includes("evidence-candidate-fingerprint-version-mismatch:routeIntentFingerprintVersion")
  ));

  resetValidChain();
  writeJsonl("route-evidence-bundles.jsonl", [bundleWith({ routeRecordId: "route-nonexistent" })]);
  associationDetections.missingRouteRecord = auditMustFail("missing RouteRecord", (error) => (
    error.includes("association-unverifiable:routeRecordId")
  ));

  resetValidChain();
  writeJson("route-feed-bootstrap-payload.json", {
    ok: true,
    records: [{
      ...routeRecord,
      selectedCandidateId: rejectedCandidates[0].candidateId,
    }],
    hasMore: false,
  });
  associationDetections.routeCandidateMismatch = auditMustFail("RouteRecord Candidate mismatch", (error) => (
    error.includes("evidence-route-record-candidate-mismatch:selectedCandidateId")
  ));

  resetValidChain();
  writeJson("route-feed-bootstrap-payload.json", {
    ok: true,
    records: [{
      ...routeRecord,
      routeIntentFingerprint: `rif-v1-${"2".repeat(64)}`,
    }],
    hasMore: false,
  });
  associationDetections.routeFingerprintMismatch = auditMustFail("RouteRecord fingerprint mismatch", (error) => (
    error.includes("evidence-route-record-fingerprint-mismatch:routeIntentFingerprint")
  ));

  resetValidChain();
  const restoredAudit = auditRouteV2Cache(isolatedCache);
  assert.equal(restoredAudit.status, "PASS", restoredAudit.errors.join("\n"));
  assert.equal(restoredAudit.runtimeState.associationAudit.candidateCount, 1);
  assert.equal(restoredAudit.runtimeState.associationAudit.decisionTraceCount, 1);
  assert.equal(restoredAudit.runtimeState.associationAudit.evidenceBundleCount, 1);
  assert(restoredAudit.runtimeState.associationAudit.routeRecordCount >= 1);
  assert.equal(restoredAudit.runtimeState.associationAudit.associationsChecked, 2);

  console.log(JSON.stringify({
    verifier: "route-v2-cache-semantic-integrity",
    status: "PASS",
    isolatedBaseline: {
      files: cleanAudit.fullCache.fileCount,
      acceptedSha256: cleanAudit.externalFormal.files[0]?.sha256 || "",
      formalCacheModified: false,
    },
    detections: {
      timeContradiction: timeErrors,
      intentModeContradiction: modeErrors,
      candidateSnapshotMismatch: snapshotErrors,
      evidenceStandalone: evidenceErrors,
      evidenceCandidateAssociation: associationErrors,
      completeAssociationGraph: associationDetections,
    },
    completeValidAssociationGraph: restoredAudit.runtimeState.associationAudit,
  }, null, 2));
} finally {
  fs.rmSync(temporaryRoot, { recursive: true, force: true });
}
