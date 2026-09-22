import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const TRUSTED_CATALOGS = Object.freeze([
  ["plannable-expansion-batch01", "data/knowledge/reviewed-claims/plannable-expansion-batch01-reviewed-claims.json"],
  ["plannable-expansion-batch02", "data/knowledge/reviewed-claims/plannable-expansion-batch02-reviewed-claims.json"],
]);

export function assertReviewedClaimCatalogSet(catalogEntries) {
  const seenCatalogIds = new Set();
  const seenClaimIds = new Set();
  for (const [expectedCatalogId, catalog] of catalogEntries) {
    if (catalog.schemaVersion !== "route-v2-reviewed-claim-catalog-v1" || catalog.catalogId !== expectedCatalogId || seenCatalogIds.has(catalog.catalogId)) {
      throw new Error(`reviewed-claim-catalog-identity-invalid:${expectedCatalogId}`);
    }
    seenCatalogIds.add(catalog.catalogId);
    for (const claim of [...(catalog.transportClaims || []), ...(catalog.seasonClaims || [])]) {
      if (!claim?.claimId || seenClaimIds.has(claim.claimId)) throw new Error(`reviewed-claim-global-id-invalid:${claim?.claimId || ""}`);
      seenClaimIds.add(claim.claimId);
    }
  }
  return true;
}

const catalogEntries = TRUSTED_CATALOGS.map(([catalogId, relativePath]) => {
  const catalog = JSON.parse(fs.readFileSync(path.join(ROOT, relativePath), "utf8"));
  return [catalogId, catalog];
});
assertReviewedClaimCatalogSet(catalogEntries);
const catalogs = catalogEntries.map(([, catalog]) => catalog);

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

const transportClaims = buildIndex(catalogs.flatMap((catalog) => catalog.transportClaims), "transport");
const seasonClaims = buildIndex(catalogs.flatMap((catalog) => catalog.seasonClaims), "season");

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
    schemaVersion: "route-v2-reviewed-claim-catalog-registry-v1",
    catalogIds: TRUSTED_CATALOGS.map(([catalogId]) => catalogId),
    transportClaims: transportClaims.size,
    seasonClaims: seasonClaims.size,
  });
}
