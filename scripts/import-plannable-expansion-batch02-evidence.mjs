import fs from "node:fs";
import path from "node:path";

import { normalizeLocalEvidenceSource } from "../src/lib/routes/local-evidence-source-schema.mjs";
import { normalizeRouteLegEvidence, validateRouteLegEvidence } from "../src/lib/routes/route-leg-evidence-schema.mjs";
import { directedClaimsFromReviewedClaim, validateReviewedTransportClaim } from "../src/lib/routes/reviewed-transport-evidence-authority.mjs";
import { resolveReviewedTransportClaim } from "../src/lib/routes/reviewed-claim-catalog.mjs";
import { stableHash } from "../src/lib/routes/route-v2-utils.mjs";
import { createPublishedKnowledgeEntityLayerRepository } from "../src/lib/routes/index.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");
const SEED = JSON.parse(fs.readFileSync(path.join(ROOT, "data/knowledge/seeds/plannable-expansion-batch02-evidence.json"), "utf8"));
const ROUTES = path.join(ROOT, "data/route-v2/evidence-seed/route-leg-evidence.jsonl");
const SEASONS = path.join(ROOT, "data/route-v2/evidence-seed/season-evidence.jsonl");
const MANIFEST = path.join(ROOT, "data/route-v2/evidence-seed/evidence-seed-manifest.json");
const parseJsonl = (text) => text.split(/\r?\n/u).filter(Boolean).map(JSON.parse);
const repository = createPublishedKnowledgeEntityLayerRepository({ projectRoot: ROOT });
const countries = new Map(repository.listCountries().map((entry) => [entry.entityId, entry]));
const cities = new Map(repository.listCities().map((entry) => [entry.entityId, entry]));

function createRoute(from, to, claim) {
  const support = `route-leg:${from.entityId}>${to.entityId}:feasibility`;
  if (!claim.supports.includes(support)) throw new Error(`batch02-support-missing:${support}`);
  const source = normalizeLocalEvidenceSource({
    url: claim.source.url, supports: [support], retrievedAt: claim.retrievedAt, confidence: 0.9,
    factLocator: claim.source.locator, factExcerpt: claim.reviewedFact, contentHash: claim.reviewedPayloadHash,
  });
  if (source.publisher !== claim.source.authority) throw new Error(`batch02-source-authority-mismatch:${claim.claimId}`);
  const record = normalizeRouteLegEvidence({
    fromEntityId: from.entityId, toEntityId: to.entityId, transportMode: claim.transportMode,
    directed: true, feasibilityStatus: "feasible", durationMinMinutes: null, durationMaxMinutes: null,
    transferCount: null, frequencyLevel: "unknown", sourceRefs: [source.sourceId], sources: [source],
    confidence: 0.9, freshnessStatus: "fresh", retrievedAt: claim.retrievedAt, expiresAt: null,
    unknowns: [
      { field: "duration", reason: "The official source establishes service; stable duration is not asserted." },
      { field: "transferCount", reason: "A stable transfer count is not asserted." },
      { field: "frequencyLevel", reason: "Frequency is timetable-dependent and is not generalized." },
    ], conflicts: [], diagnostics: [{ field: "batch", reason: "plannable-expansion-batch02-evidence" }],
    createdAt: claim.retrievedAt, updatedAt: claim.retrievedAt,
  }, { now: () => claim.retrievedAt });
  const validation = validateRouteLegEvidence(record);
  if (!validation.accepted) throw new Error(`batch02-route-invalid:${validation.reasons.join("|")}`);
  return validation.record;
}

const additions = [];
for (const claimId of SEED.approvedTransportClaimIds) {
  const claim = resolveReviewedTransportClaim(claimId);
  if (!claim || !validateReviewedTransportClaim(claim).accepted || !claimId.startsWith("batch02-")) throw new Error(`batch02-claim-unapproved:${claimId}`);
  for (const endpoint of [claim.origin, claim.destination]) {
    const city = cities.get(endpoint.entityId);
    const country = city ? countries.get(city.parentCountryEntityId) : null;
    if (!city || city.canonicalNameEn !== endpoint.canonicalNameEn || country?.isoAlpha2 !== claim.countryCode) throw new Error(`batch02-claim-production-entity-mismatch:${claimId}:${endpoint.entityId}`);
  }
  for (const direction of directedClaimsFromReviewedClaim(claim)) additions.push(createRoute(direction.from, direction.to, claim));
}
if (SEED.approvedSeasonClaimIds.length) throw new Error("batch02-season-import-not-implemented-without-approved-claims");
const priorRoutes = parseJsonl(fs.readFileSync(ROUTES, "utf8")).filter((entry) => !entry.diagnostics?.some((item) => item.reason === "plannable-expansion-batch02-evidence"));
const routes = [...new Map([...priorRoutes, ...additions].map((entry) => [entry.legEvidenceId, entry])).values()].sort((a, b) => a.legEvidenceId.localeCompare(b.legEvidenceId));
const seasons = parseJsonl(fs.readFileSync(SEASONS, "utf8"));
const manifest = JSON.parse(fs.readFileSync(MANIFEST, "utf8"));
manifest.routeLegEvidenceIds = routes.map((entry) => entry.legEvidenceId);
manifest.seasonEvidenceIds = seasons.map((entry) => entry.seasonEvidenceId);
manifest.counts = { routeLeg: routes.length, season: seasons.length, total: routes.length + seasons.length };
manifest.promotedEvidenceHash = stableHash({ routeLegs: routes, seasons });
fs.writeFileSync(ROUTES, `${routes.map(JSON.stringify).join("\n")}\n`);
fs.writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(JSON.stringify({ status: "IMPORTED", reviewedClaims: SEED.approvedTransportClaimIds.length, routeLegs: additions.length, seasonProfiles: 0 }, null, 2));
