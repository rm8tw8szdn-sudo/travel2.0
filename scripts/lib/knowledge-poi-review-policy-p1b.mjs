export const KNOWLEDGE_POI_REVIEW_POLICY_P1B_VERSION = "p1b-batch01-poi-review-v1";

function stableQids(values = []) {
  return [...new Set(values.filter((value) => /^Q\d+$/u.test(String(value))))]
    .sort((left, right) => left.localeCompare(right, "en"));
}

function qidsFromPolicyEntries(values = []) {
  return stableQids(values.map((value) => (typeof value === "string" ? value : value?.qid)));
}

function result({
  wikidataId,
  parentCityEntityId,
  sourceP31Qids,
  disposition,
  matchedRuleId,
  rationale,
  unknownP31Qids,
}) {
  return {
    classification: disposition === "blocking"
      ? "rejected"
      : (disposition === "manual-review" ? "accepted-with-review" : "accepted"),
    disposition,
    policyVersion: KNOWLEDGE_POI_REVIEW_POLICY_P1B_VERSION,
    matchedRuleId,
    rationale,
    wikidataId: String(wikidataId || ""),
    parentCityEntityId: String(parentCityEntityId || ""),
    sourceP31Qids: [...sourceP31Qids],
    unknownP31Qids: [...unknownP31Qids],
  };
}

export function classifyKnowledgePoiReviewEvidence({
  wikidataId,
  parentCityEntityId,
  sourceP31Qids = [],
  p31ProjectionDifference = false,
  identityRisk = "",
  parentEvidenceLevel = "",
  policyEvidence = {},
  identityValidationReasons = [],
  parentValidationReasons = [],
  overlapKinds = [],
  isBackup = false,
} = {}) {
  const normalizedP31Qids = stableQids(sourceP31Qids);
  const p31Key = normalizedP31Qids.join("|");
  const knownTypeQids = new Set([
    ...qidsFromPolicyEntries(policyEvidence.knownPoiTypeQids),
    ...qidsFromPolicyEntries(policyEvidence.blockingTypeQids),
  ]);
  const blockingTypeQids = new Set(qidsFromPolicyEntries(policyEvidence.blockingTypeQids));
  const informationalExactKeys = new Set(policyEvidence.informationalExactKeys || []);
  const manualExactKeys = new Set(policyEvidence.manualExactKeys || []);
  const matchedBlockingTypeQids = normalizedP31Qids.filter((qid) => blockingTypeQids.has(qid));
  const unknownP31Qids = normalizedP31Qids.filter((qid) => !knownTypeQids.has(qid));

  if (matchedBlockingTypeQids.length > 0) {
    return result({
      wikidataId,
      parentCityEntityId,
      sourceP31Qids: normalizedP31Qids,
      disposition: "blocking",
      matchedRuleId: "blocking-type-qid",
      rationale: `Exact blocking P31 QID present: ${matchedBlockingTypeQids.join("|")}.`,
      unknownP31Qids,
    });
  }

  const structuralReasons = [...new Set([
    ...identityValidationReasons,
    ...parentValidationReasons,
    ...overlapKinds,
    ...(isBackup ? ["backup-candidate-not-publishable"] : []),
  ].map((value) => String(value || "").trim()).filter(Boolean))].sort((left, right) => left.localeCompare(right, "en"));
  if (structuralReasons.length > 0) {
    return result({
      wikidataId,
      parentCityEntityId,
      sourceP31Qids: normalizedP31Qids,
      disposition: "blocking",
      matchedRuleId: "illegal-identity-parent-or-overlap",
      rationale: `Illegal publication evidence: ${structuralReasons.join("|")}.`,
      unknownP31Qids,
    });
  }

  if (p31ProjectionDifference) {
    return result({
      wikidataId,
      parentCityEntityId,
      sourceP31Qids: normalizedP31Qids,
      disposition: "manual-review",
      matchedRuleId: "p31-projection-difference",
      rationale: `API/SPARQL P31 projections differ for complete key ${p31Key || "(empty)"}.`,
      unknownP31Qids,
    });
  }

  if (informationalExactKeys.has(p31Key)) {
    return result({
      wikidataId,
      parentCityEntityId,
      sourceP31Qids: normalizedP31Qids,
      disposition: "informational",
      matchedRuleId: "exact-informational-key",
      rationale: `Complete numeric P31 key exactly matches informational allowlist: ${p31Key}.`,
      unknownP31Qids,
    });
  }

  if (manualExactKeys.has(p31Key)) {
    return result({
      wikidataId,
      parentCityEntityId,
      sourceP31Qids: normalizedP31Qids,
      disposition: "manual-review",
      matchedRuleId: "exact-manual-key",
      rationale: `Complete numeric P31 key exactly matches manual-review list: ${p31Key}.`,
      unknownP31Qids,
    });
  }

  return result({
    wikidataId,
    parentCityEntityId,
    sourceP31Qids: normalizedP31Qids,
    disposition: "manual-review",
    matchedRuleId: unknownP31Qids.length > 0 ? "unknown-p31-qid" : "default-manual-key",
    rationale: unknownP31Qids.length > 0
      ? `Unknown numeric P31 QID defaults to manual review: ${unknownP31Qids.join("|")}.`
      : `Complete numeric P31 key is not frozen as informational or manual: ${p31Key || "(empty)"}.`,
    unknownP31Qids,
  });
}
