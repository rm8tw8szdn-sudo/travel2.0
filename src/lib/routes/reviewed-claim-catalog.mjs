import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const CATALOG_PATH = path.join(ROOT, "data/knowledge/reviewed-claims/plannable-expansion-batch01-reviewed-claims.json");
const catalog = JSON.parse(fs.readFileSync(CATALOG_PATH, "utf8"));

if (catalog.schemaVersion !== "route-v2-reviewed-claim-catalog-v1" || catalog.catalogId !== "plannable-expansion-batch01") {
  throw new Error("reviewed-claim-catalog-identity-invalid");
}

function buildIndex(values, kind) {
  if (!Array.isArray(values)) throw new Error(`reviewed-${kind}-catalog-array-required`);
  const index = new Map();
  for (const claim of values) {
    const claimId = String(claim?.claimId || "");
    if (!claimId || index.has(claimId)) throw new Error(`reviewed-${kind}-claim-id-invalid:${claimId}`);
    index.set(claimId, Object.freeze(structuredClone(claim)));
  }
  return index;
}

const transportClaims = buildIndex(catalog.transportClaims, "transport");
const seasonClaims = buildIndex(catalog.seasonClaims, "season");

export function resolveReviewedTransportClaim(claimId) {
  const claim = transportClaims.get(String(claimId || ""));
  return claim ? structuredClone(claim) : null;
}

export function resolveReviewedSeasonClaim(claimId) {
  const claim = seasonClaims.get(String(claimId || ""));
  return claim ? structuredClone(claim) : null;
}

export function reviewedClaimCatalogSummary() {
  return Object.freeze({
    schemaVersion: catalog.schemaVersion,
    catalogId: catalog.catalogId,
    transportClaims: transportClaims.size,
    seasonClaims: seasonClaims.size,
  });
}
