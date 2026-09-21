import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { getPublishedKnowledgeCountryCodes } from "./knowledge-entity-layer-published-assets.mjs";

const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
const POLICY_PATH = path.resolve(moduleDirectory, "../../../data/knowledge/semantic/country-route-readiness-policy.json");
const PROMOTION_AUTHORITY_PATH = path.resolve(moduleDirectory, "../../../data/knowledge/semantic/plannable-expansion-batch01-promotion-authority.json");
const PROMOTION_REPORT_PATH = path.resolve(moduleDirectory, "../../../data/knowledge/reports/plannable-expansion-batch01-promotion.json");
const PROMOTION_COORDINATOR_PATH = path.resolve(moduleDirectory, "../../../scripts/promote-plannable-expansion-batch01.mjs");
const PROMOTION_SEALED_COMMIT = "eddf46512863c115b7f39e29d5f6c448d1ce6251";
const PROMOTION_AUTHORITY_RELATIVE_PATH = "data/knowledge/semantic/plannable-expansion-batch01-promotion-authority.json";
const PROMOTION_REPORT_RELATIVE_PATH = "data/knowledge/reports/plannable-expansion-batch01-promotion.json";
const SEALED_PRE_PROMOTION_COUNTS = Object.freeze({ plannable: 118, evidenceBacked: 115, catalogOnly: 77 });
let cachedAuthority = null;
let cachedLivePromotionDecision = null;

function normalizedUniqueCodes(value, field) {
  if (!Array.isArray(value)) throw new Error(`READINESS_AUTHORITY_${field.toUpperCase()}_INVALID`);
  const codes = value.map((code) => String(code || "").trim().toUpperCase());
  if (codes.some((code) => !/^[A-Z]{2}$/u.test(code)) || new Set(codes).size !== codes.length) {
    throw new Error(`READINESS_AUTHORITY_${field.toUpperCase()}_INVALID`);
  }
  return codes.sort();
}

export function validateKnowledgeReadinessAuthority(policy) {
  if (!policy || typeof policy !== "object" || Array.isArray(policy)) throw new Error("READINESS_AUTHORITY_INVALID");
  if (policy.schemaVersion !== "route-v2-country-route-readiness-policy-v1") throw new Error("READINESS_AUTHORITY_SCHEMA_INVALID");
  const plannableCountryCodes = normalizedUniqueCodes(policy.plannableCountryCodes, "plannable");
  const evidenceBackedCountryCodes = normalizedUniqueCodes(policy.evidenceBackedCountryCodes, "evidence_backed");
  const catalogOnlyCountryCodes = normalizedUniqueCodes(policy.catalogOnlyCountryCodes, "catalog_only");
  const evidencePendingCountryCodes = normalizedUniqueCodes(policy.evidencePendingCountryCodes, "evidence_pending");
  const plannable = new Set(plannableCountryCodes);
  const catalogOnly = new Set(catalogOnlyCountryCodes);
  const publishedCountryCodes = getPublishedKnowledgeCountryCodes();
  const published = new Set(publishedCountryCodes);
  const readinessCodes = new Set([...plannableCountryCodes, ...catalogOnlyCountryCodes]);
  const unknownReadinessCodes = [...readinessCodes].filter((code) => !published.has(code));
  const missingPublishedCodes = publishedCountryCodes.filter((code) => !readinessCodes.has(code));
  if (unknownReadinessCodes.length) throw new Error(`READINESS_AUTHORITY_UNKNOWN_COUNTRY_CODE:${unknownReadinessCodes.join(",")}`);
  if (missingPublishedCodes.length) throw new Error(`READINESS_AUTHORITY_MISSING_PUBLISHED_COUNTRY:${missingPublishedCodes.join(",")}`);
  if (plannableCountryCodes.some((code) => catalogOnly.has(code))) throw new Error("READINESS_AUTHORITY_OVERLAPPING_READINESS_STATE");
  if (readinessCodes.size !== published.size) throw new Error("READINESS_AUTHORITY_PARTITION_MISMATCH");
  if (evidenceBackedCountryCodes.some((code) => !published.has(code) || !plannable.has(code))) throw new Error("READINESS_AUTHORITY_INVALID_EVIDENCE_BACKED_MEMBERSHIP");
  if (evidencePendingCountryCodes.some((code) => !published.has(code) || !catalogOnly.has(code))) throw new Error("READINESS_AUTHORITY_INVALID_EVIDENCE_PENDING_MEMBERSHIP");
  const promotion = policy.batch01Promotion;
  let derivedCounts = { ...SEALED_PRE_PROMOTION_COUNTS };
  if (promotion !== undefined) {
    if (!promotion || typeof promotion !== "object" || Array.isArray(promotion)) throw new Error("READINESS_AUTHORITY_PROMOTION_INVALID");
    const reviewedCountryCodes = normalizedUniqueCodes(promotion.reviewedCountryCodes, "promotion_reviewed");
    const candidateCountryCodes = normalizedUniqueCodes(promotion.candidateCountryCodes, "promotion_candidate");
    const promotedCountryCodes = normalizedUniqueCodes(promotion.promotedCountryCodes, "promotion_promoted");
    const blockedCountryCodes = normalizedUniqueCodes(promotion.blockedCountryCodes, "promotion_blocked");
    const evidencePhaseBlockedCountryCodes = normalizedUniqueCodes(promotion.evidencePhaseBlockedCountryCodes, "promotion_evidence_phase_blocked");
    const evidenceBackedPromotionCodes = normalizedUniqueCodes(promotion.evidenceBackedCountryCodes, "promotion_evidence_backed");
    const foundationCountryCodes = normalizedUniqueCodes(policy.batch01EntityFoundationCountryCodes, "batch01_entity_foundation");
    const { decision: derived, payload: derivedPayload } = deriveBatch01PromotionDecision();
    if (!sameCodes(reviewedCountryCodes, derived.reviewedCountryCodes)
      || !sameCodes(candidateCountryCodes, derived.candidateCountryCodes)
      || !sameCodes(promotedCountryCodes, derived.promotedCountryCodes)
      || !sameCodes(blockedCountryCodes, derived.blockedCountryCodes)
      || !sameCodes(evidencePhaseBlockedCountryCodes, derived.evidencePhaseBlockedCountryCodes)
      || !sameCodes(evidenceBackedPromotionCodes, derived.evidenceBackedCountryCodes)) {
      throw new Error("READINESS_AUTHORITY_DERIVED_PROMOTION_MEMBERSHIP_MISMATCH");
    }
    if (JSON.stringify(reviewedCountryCodes) !== JSON.stringify(foundationCountryCodes)) throw new Error("READINESS_AUTHORITY_PROMOTION_REVIEWED_MISMATCH");
    if (JSON.stringify([...candidateCountryCodes, ...evidencePhaseBlockedCountryCodes].sort()) !== JSON.stringify(reviewedCountryCodes)) throw new Error("READINESS_AUTHORITY_PROMOTION_EVIDENCE_PARTITION_INVALID");
    if (JSON.stringify([...promotedCountryCodes, ...blockedCountryCodes].sort()) !== JSON.stringify(candidateCountryCodes)) throw new Error("READINESS_AUTHORITY_PROMOTION_RESULT_PARTITION_INVALID");
    if (evidenceBackedPromotionCodes.some((code) => !promotedCountryCodes.includes(code))) throw new Error("READINESS_AUTHORITY_PROMOTION_EVIDENCE_BACKED_INVALID");
    if (promotedCountryCodes.some((code) => !plannable.has(code) || catalogOnly.has(code) || evidencePendingCountryCodes.includes(code))) throw new Error("READINESS_AUTHORITY_PROMOTION_STATE_INVALID");
    if (blockedCountryCodes.some((code) => !catalogOnly.has(code) || !evidencePendingCountryCodes.includes(code) || plannable.has(code))) throw new Error("READINESS_AUTHORITY_PROMOTION_BLOCKED_STATE_INVALID");
    const expectedPlannable = [...new Set([...derived.prePromotion.plannableCountryCodes, ...derived.promotedCountryCodes])].sort();
    const expectedEvidenceBacked = [...new Set([...derived.prePromotion.evidenceBackedCountryCodes, ...derived.evidenceBackedCountryCodes])].sort();
    const expectedCatalogOnly = derived.prePromotion.catalogOnlyCountryCodes.filter((code) => !derived.promotedCountryCodes.includes(code)).sort();
    const expectedEvidencePending = derived.prePromotion.evidencePendingCountryCodes.filter((code) => !derived.promotedCountryCodes.includes(code)).sort();
    if (!sameCodes(plannableCountryCodes, expectedPlannable)
      || !sameCodes(evidenceBackedCountryCodes, expectedEvidenceBacked)
      || !sameCodes(catalogOnlyCountryCodes, expectedCatalogOnly)
      || !sameCodes(evidencePendingCountryCodes, expectedEvidencePending)) {
      throw new Error("READINESS_AUTHORITY_DERIVED_PARTITION_MISMATCH");
    }
    const auditArtifact = loadSealedAuditJson(PROMOTION_AUTHORITY_PATH, PROMOTION_AUTHORITY_RELATIVE_PATH, "PROMOTION_AUDIT");
    const sealedDecision = normalizeBatch01PromotionDecision(auditArtifact);
    if (JSON.stringify(sealedDecision) !== JSON.stringify(derived)) throw new Error("READINESS_AUTHORITY_PROMOTION_AUDIT_MISMATCH");
    loadSealedAuditJson(PROMOTION_REPORT_PATH, PROMOTION_REPORT_RELATIVE_PATH, "PROMOTION_REPORT");
    derivedCounts = {
      plannable: SEALED_PRE_PROMOTION_COUNTS.plannable + promotedCountryCodes.length,
      evidenceBacked: SEALED_PRE_PROMOTION_COUNTS.evidenceBacked + evidenceBackedPromotionCodes.length,
      catalogOnly: SEALED_PRE_PROMOTION_COUNTS.catalogOnly - promotedCountryCodes.length,
    };
  }
  const expectedCounts = policy.expectedCounts ?? (promotion === undefined ? derivedCounts : null);
  if (!expectedCounts
    || !Number.isInteger(expectedCounts.plannable)
    || !Number.isInteger(expectedCounts.evidenceBacked)
    || !Number.isInteger(expectedCounts.catalogOnly)
    || plannableCountryCodes.length !== expectedCounts.plannable
    || evidenceBackedCountryCodes.length !== expectedCounts.evidenceBacked
    || catalogOnlyCountryCodes.length !== expectedCounts.catalogOnly
    || expectedCounts.plannable !== derivedCounts.plannable
    || expectedCounts.evidenceBacked !== derivedCounts.evidenceBacked
    || expectedCounts.catalogOnly !== derivedCounts.catalogOnly) {
    throw new Error("READINESS_AUTHORITY_COUNT_INVALID");
  }
  return Object.freeze({
    schemaVersion: policy.schemaVersion,
    plannableCountryCodes: Object.freeze(plannableCountryCodes),
    evidenceBackedCountryCodes: Object.freeze(evidenceBackedCountryCodes),
    catalogOnlyCountryCodes: Object.freeze(catalogOnlyCountryCodes),
    evidencePendingCountryCodes: Object.freeze(evidencePendingCountryCodes),
    expectedCounts: Object.freeze({ ...expectedCounts }),
  });
}

function sameCodes(left, right) {
  return JSON.stringify([...left].sort()) === JSON.stringify([...right].sort());
}

function normalizeBatch01PromotionDecision(authority) {
  if (authority?.schemaVersion !== "route-v2-plannable-expansion-batch01-promotion-authority-v1"
    || authority.authority !== "production-facts-and-live-route-gate") throw new Error("READINESS_AUTHORITY_PROMOTION_DECISION_INVALID");
  const result = {
    reviewedCountryCodes: normalizedUniqueCodes(authority.reviewedCountryCodes, "derived_reviewed"),
    candidateCountryCodes: normalizedUniqueCodes(authority.candidateCountryCodes, "derived_candidate"),
    promotedCountryCodes: normalizedUniqueCodes(authority.promotedCountryCodes, "derived_promoted"),
    blockedCountryCodes: normalizedUniqueCodes(authority.blockedCountryCodes, "derived_blocked"),
    evidencePhaseBlockedCountryCodes: normalizedUniqueCodes(authority.evidencePhaseBlockedCountryCodes, "derived_evidence_phase_blocked"),
    evidenceBackedCountryCodes: normalizedUniqueCodes(authority.evidenceBackedCountryCodes, "derived_evidence_backed"),
    prePromotion: {
      plannableCountryCodes: normalizedUniqueCodes(authority.prePromotion?.plannableCountryCodes, "derived_pre_plannable"),
      evidenceBackedCountryCodes: normalizedUniqueCodes(authority.prePromotion?.evidenceBackedCountryCodes, "derived_pre_evidence_backed"),
      catalogOnlyCountryCodes: normalizedUniqueCodes(authority.prePromotion?.catalogOnlyCountryCodes, "derived_pre_catalog_only"),
      evidencePendingCountryCodes: normalizedUniqueCodes(authority.prePromotion?.evidencePendingCountryCodes, "derived_pre_evidence_pending"),
    },
  };
  if (!sameCodes([...result.candidateCountryCodes, ...result.evidencePhaseBlockedCountryCodes], result.reviewedCountryCodes)
    || !sameCodes([...result.promotedCountryCodes, ...result.blockedCountryCodes], result.candidateCountryCodes)
    || result.evidenceBackedCountryCodes.some((code) => !result.promotedCountryCodes.includes(code))) {
    throw new Error("READINESS_AUTHORITY_PROMOTION_DECISION_PARTITION_INVALID");
  }
  if (!Array.isArray(authority.routeGate) || authority.routeGate.length !== result.candidateCountryCodes.length) throw new Error("READINESS_AUTHORITY_PROMOTION_ROUTE_GATE_INVALID");
  for (const code of result.candidateCountryCodes) {
    const gate = authority.routeGate.find((entry) => entry?.countryCode === code);
    const shouldPromote = result.promotedCountryCodes.includes(code);
    if (!gate || gate.requiredQueries !== 4 || !Number.isInteger(gate.passedQueries)
      || (shouldPromote && (gate.passedQueries !== 4 || gate.decision !== "PROMOTE" || gate.hardCountryConstraint !== "PASS"))
      || (!shouldPromote && (gate.passedQueries >= 4 || gate.decision !== "BLOCK"))) {
      throw new Error("READINESS_AUTHORITY_PROMOTION_ROUTE_GATE_INVALID");
    }
  }
  return result;
}

function deriveBatch01PromotionDecision() {
  if (cachedLivePromotionDecision) return cachedLivePromotionDecision;
  let payload;
  try {
    payload = JSON.parse(execFileSync(process.execPath, [PROMOTION_COORDINATOR_PATH, "--derive-only"], {
      cwd: path.resolve(moduleDirectory, "../../.."),
      encoding: "utf8",
      maxBuffer: 16 * 1024 * 1024,
    }));
  } catch (error) {
    throw new Error(`READINESS_AUTHORITY_LIVE_PROMOTION_DECISION_FAILED:${error.stderr || error.stdout || error.message}`);
  }
  if (payload?.schemaVersion !== "route-v2-plannable-expansion-batch01-live-decision-v1") throw new Error("READINESS_AUTHORITY_LIVE_PROMOTION_DECISION_INVALID");
  cachedLivePromotionDecision = { decision: normalizeBatch01PromotionDecision(payload.promotionAuthority), payload };
  return cachedLivePromotionDecision;
}

function loadAuditJson(filePath, label) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    throw new Error(`READINESS_AUTHORITY_${label}_UNAVAILABLE:${error.message}`);
  }
}

function loadSealedAuditJson(filePath, relativePath, label) {
  let currentText;
  let sealedText;
  try {
    currentText = fs.readFileSync(filePath, "utf8");
    sealedText = execFileSync("git", ["show", `${PROMOTION_SEALED_COMMIT}:${relativePath}`], {
      cwd: path.resolve(moduleDirectory, "../../.."),
      encoding: "utf8",
      maxBuffer: 16 * 1024 * 1024,
    });
  } catch (error) {
    throw new Error(`READINESS_AUTHORITY_${label}_SEALED_SOURCE_UNAVAILABLE:${error.stderr || error.stdout || error.message}`);
  }
  const canonicalText = (value) => value.replace(/\r\n/gu, "\n");
  if (canonicalText(currentText) !== canonicalText(sealedText)) throw new Error(`READINESS_AUTHORITY_${label}_MISMATCH`);
  try {
    return JSON.parse(currentText);
  } catch (error) {
    throw new Error(`READINESS_AUTHORITY_${label}_UNAVAILABLE:${error.message}`);
  }
}

export function getAuthoritativeKnowledgeReadiness() {
  if (cachedAuthority) return cachedAuthority;
  let policy;
  try {
    policy = JSON.parse(fs.readFileSync(POLICY_PATH, "utf8"));
  } catch (error) {
    throw new Error(`READINESS_AUTHORITY_UNAVAILABLE:${error.message}`);
  }
  cachedAuthority = validateKnowledgeReadinessAuthority(policy);
  return cachedAuthority;
}
