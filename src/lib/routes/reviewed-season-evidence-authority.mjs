import crypto from "node:crypto";

import { classifyLocalEvidenceSource } from "./local-evidence-source-schema.mjs";
import { resolveReviewedSeasonClaim } from "./reviewed-claim-catalog.mjs";

const SCOPE_KINDS = new Set(["country", "destination"]);

export function reviewedSeasonClaimPayload(claim = {}) {
  return {
    claimId: String(claim.claimId || ""),
    countryCode: String(claim.countryCode || ""),
    source: {
      url: String(claim.source?.url || ""),
      authority: String(claim.source?.authority || ""),
      pageIdentity: String(claim.source?.pageIdentity || ""),
      locator: String(claim.source?.locator || ""),
    },
    reviewedFact: String(claim.reviewedFact || ""),
    destination: {
      canonicalNameEn: String(claim.destination?.canonicalNameEn || ""),
      entityId: String(claim.destination?.entityId || ""),
    },
    geographicScope: {
      kind: String(claim.geographicScope?.kind || ""),
      identity: String(claim.geographicScope?.identity || ""),
      reviewedApplicability: String(claim.geographicScope?.reviewedApplicability || ""),
    },
    supportedMonths: Array.isArray(claim.supportedMonths) ? claim.supportedMonths.map(Number) : [],
    admittedMonth: Number(claim.admittedMonth),
    factType: String(claim.factType || ""),
    factualPayload: {
      risks: Array.isArray(claim.factualPayload?.risks) ? claim.factualPayload.risks.map(String) : [],
      conditions: String(claim.factualPayload?.conditions || ""),
    },
    supports: Array.isArray(claim.supports) ? claim.supports.map(String) : [],
    retrievedAt: String(claim.retrievedAt || ""),
  };
}

export function reviewedSeasonClaimHash(claim) {
  return crypto.createHash("sha256").update(JSON.stringify(reviewedSeasonClaimPayload(claim))).digest("hex");
}

export function validateReviewedSeasonClaim(claim) {
  const reasons = [];
  const payload = reviewedSeasonClaimPayload(claim);
  const authoritativeClaim = resolveReviewedSeasonClaim(payload.claimId);
  if (!authoritativeClaim) reasons.push("season-claim-id-unknown");
  const authoritativePayload = authoritativeClaim ? reviewedSeasonClaimPayload(authoritativeClaim) : null;
  const classification = classifyLocalEvidenceSource(payload.source.url);
  if (!classification) reasons.push("season-claim-source-untrusted");
  if (!payload.source.authority || payload.source.authority !== classification?.publisher) reasons.push("season-claim-source-authority-mismatch");
  if (!payload.source.pageIdentity || !payload.source.locator || !payload.reviewedFact) reasons.push("season-claim-source-fact-incomplete");
  if (!payload.claimId || (authoritativePayload && payload.countryCode !== authoritativePayload.countryCode)) reasons.push("season-claim-country-mismatch");
  if (authoritativePayload && JSON.stringify(payload.destination) !== JSON.stringify(authoritativePayload.destination)) reasons.push("season-claim-destination-mismatch");
  if (!SCOPE_KINDS.has(payload.geographicScope.kind) || !payload.geographicScope.identity || !payload.geographicScope.reviewedApplicability) reasons.push("season-claim-geographic-scope-invalid");
  if (payload.geographicScope.kind === "destination" && payload.geographicScope.identity !== payload.destination.entityId) reasons.push("season-claim-destination-scope-mismatch");
  if (payload.geographicScope.kind === "country" && payload.geographicScope.identity !== payload.countryCode) reasons.push("season-claim-country-scope-mismatch");
  if (!Number.isInteger(payload.admittedMonth) || payload.admittedMonth < 1 || payload.admittedMonth > 12 || !payload.supportedMonths.includes(payload.admittedMonth)) reasons.push("season-claim-month-not-supported");
  if (!payload.factType || !payload.factualPayload.risks.length || !payload.factualPayload.conditions) reasons.push("season-claim-factual-payload-incomplete");
  const expectedSupports = [`season:${payload.destination.entityId}:${payload.admittedMonth}:risk`];
  if (JSON.stringify(payload.supports) !== JSON.stringify(expectedSupports)) reasons.push("season-claim-supports-mismatch");
  if (!Number.isFinite(Date.parse(payload.retrievedAt))) reasons.push("season-claim-retrievedAt-invalid");
  if (!/^[a-f0-9]{64}$/u.test(String(claim.reviewedPayloadHash || "")) || claim.reviewedPayloadHash !== reviewedSeasonClaimHash(claim)) reasons.push("season-claim-payload-hash-mismatch");
  if (authoritativePayload && JSON.stringify(payload) !== JSON.stringify(authoritativePayload)) reasons.push("season-claim-not-reviewed");
  if (authoritativeClaim && claim.reviewedPayloadHash !== authoritativeClaim.reviewedPayloadHash) reasons.push("season-claim-catalog-hash-mismatch");
  return { accepted: reasons.length === 0, reasons, payload };
}
