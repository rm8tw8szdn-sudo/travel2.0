import crypto from "node:crypto";

import { classifyLocalEvidenceSource } from "./local-evidence-source-schema.mjs";
import { resolveReviewedTransportClaim } from "./reviewed-claim-catalog.mjs";

const DIRECTIONS = new Set(["directional", "bidirectional"]);

export function reviewedTransportClaimPayload(claim = {}) {
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
    origin: {
      canonicalNameEn: String(claim.origin?.canonicalNameEn || ""),
      entityId: String(claim.origin?.entityId || ""),
    },
    destination: {
      canonicalNameEn: String(claim.destination?.canonicalNameEn || ""),
      entityId: String(claim.destination?.entityId || ""),
    },
    directionality: String(claim.directionality || ""),
    transportMode: String(claim.transportMode || ""),
    supports: Array.isArray(claim.supports) ? claim.supports.map(String) : [],
    retrievedAt: String(claim.retrievedAt || ""),
  };
}

export function reviewedTransportClaimHash(claim) {
  return crypto.createHash("sha256").update(JSON.stringify(reviewedTransportClaimPayload(claim))).digest("hex");
}

export function validateReviewedTransportClaim(claim) {
  const reasons = [];
  const payload = reviewedTransportClaimPayload(claim);
  const authoritativeClaim = resolveReviewedTransportClaim(payload.claimId);
  if (!authoritativeClaim) reasons.push("transport-claim-id-unknown");
  const authoritativePayload = authoritativeClaim ? reviewedTransportClaimPayload(authoritativeClaim) : null;
  const classification = classifyLocalEvidenceSource(payload.source.url);
  if (!classification) reasons.push("transport-claim-source-untrusted");
  if (!payload.source.authority || payload.source.authority !== classification?.publisher) reasons.push("transport-claim-source-authority-mismatch");
  if (!payload.source.pageIdentity || !payload.source.locator || !payload.reviewedFact) reasons.push("transport-claim-source-fact-incomplete");
  if (!payload.claimId || (authoritativePayload && payload.countryCode !== authoritativePayload.countryCode)) reasons.push("transport-claim-country-mismatch");
  if (!DIRECTIONS.has(payload.directionality)) reasons.push("transport-claim-directionality-invalid");
  if (!payload.transportMode || (authoritativePayload && payload.transportMode !== authoritativePayload.transportMode)) reasons.push("transport-claim-mode-mismatch");
  if (authoritativePayload && JSON.stringify(payload.origin) !== JSON.stringify(authoritativePayload.origin)) reasons.push("transport-claim-origin-mismatch");
  if (authoritativePayload && JSON.stringify(payload.destination) !== JSON.stringify(authoritativePayload.destination)) reasons.push("transport-claim-destination-mismatch");
  if (!Number.isFinite(Date.parse(payload.retrievedAt))) reasons.push("transport-claim-retrievedAt-invalid");
  const expectedSupports = directedClaimsFromReviewedClaim(payload).map(({ from, to }) => `route-leg:${from.entityId}>${to.entityId}:feasibility`);
  if (JSON.stringify(payload.supports) !== JSON.stringify(expectedSupports)) reasons.push("transport-claim-supports-mismatch");
  if (!/^[a-f0-9]{64}$/u.test(String(claim.reviewedPayloadHash || "")) || claim.reviewedPayloadHash !== reviewedTransportClaimHash(claim)) reasons.push("transport-claim-payload-hash-mismatch");
  if (authoritativePayload && JSON.stringify(payload) !== JSON.stringify(authoritativePayload)) reasons.push("transport-claim-not-reviewed");
  if (authoritativeClaim && claim.reviewedPayloadHash !== authoritativeClaim.reviewedPayloadHash) reasons.push("transport-claim-catalog-hash-mismatch");
  return { accepted: reasons.length === 0, reasons, payload };
}

export function directedClaimsFromReviewedClaim(claim) {
  const payload = reviewedTransportClaimPayload(claim);
  const claims = [{ from: payload.origin, to: payload.destination }];
  if (payload.directionality === "bidirectional") claims.push({ from: payload.destination, to: payload.origin });
  return claims;
}
