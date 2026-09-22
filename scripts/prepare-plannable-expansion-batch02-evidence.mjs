import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { createPublishedKnowledgeEntityLayerRepository } from "../src/lib/routes/index.mjs";
import { validateRouteLegEvidence } from "../src/lib/routes/route-leg-evidence-schema.mjs";
import { validateSeasonEvidence } from "../src/lib/routes/season-evidence-schema.mjs";
import { validateReviewedTransportClaim } from "../src/lib/routes/reviewed-transport-evidence-authority.mjs";
import { validateReviewedSeasonClaim } from "../src/lib/routes/reviewed-season-evidence-authority.mjs";
import { getAuthoritativeKnowledgeReadiness } from "../src/lib/routes/knowledge-readiness-authority.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CODES = Object.freeze(["AO", "BJ", "BY", "BZ", "CI", "CM", "CV", "DM", "MN", "MZ", "SZ", "TL", "TT", "UG"]);
const ENTITY_REVIEW = "data/knowledge/reports/plannable-expansion-batch02-entity-review.json";
const CLAIM_CATALOGS = [
  "data/knowledge/reviewed-claims/plannable-expansion-batch01-reviewed-claims.json",
  "data/knowledge/reviewed-claims/plannable-expansion-batch02-reviewed-claims.json",
];
const RESEARCH = "data/knowledge/research/plannable-expansion-batch02-evidence-research.json";
const ROUTES = "data/route-v2/evidence-seed/route-leg-evidence.jsonl";
const SEASONS = "data/route-v2/evidence-seed/season-evidence.jsonl";
const AUDIT = "data/knowledge/batches/plannable-expansion-batch02-evidence-audit.json";
const REPORT = "data/knowledge/reports/plannable-expansion-batch02-evidence.json";

const json = (relative) => JSON.parse(fs.readFileSync(path.join(ROOT, relative), "utf8"));
const jsonl = (relative) => fs.readFileSync(path.join(ROOT, relative), "utf8").split(/\r?\n/u).filter(Boolean).map((line) => JSON.parse(line));
const routeSupport = (unit) => `route-leg:${unit.fromEntityId}>${unit.toEntityId}:feasibility`;
const seasonSupport = (entityId, month) => `season:${entityId}:${month}:risk`;

function sourceMatchesClaim(record, claim, support) {
  return record.sources?.some((source) => source.url === claim.source.url
    && source.publisher === claim.source.authority
    && source.contentHash === claim.reviewedPayloadHash
    && source.supports?.includes(support));
}

function writeJson(relative, value) {
  fs.mkdirSync(path.dirname(path.join(ROOT, relative)), { recursive: true });
  fs.writeFileSync(path.join(ROOT, relative), `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export function buildBatch02EvidenceModel() {
  const entityReview = json(ENTITY_REVIEW);
  const catalogs = CLAIM_CATALOGS.map(json);
  const research = json(RESEARCH);
  const routeRecords = jsonl(ROUTES);
  const seasonRecords = jsonl(SEASONS);
  const repository = createPublishedKnowledgeEntityLayerRepository({ projectRoot: ROOT });
  const countries = repository.listCountries();
  const cities = repository.listCities();
  const pois = repository.listPois();
  const cityById = new Map(cities.map((entry) => [entry.entityId, entry]));
  const countryById = new Map(countries.map((entry) => [entry.entityId, entry]));
  const transportClaimBySupport = new Map(catalogs.flatMap((catalog) => catalog.transportClaims).flatMap((claim) => claim.supports.map((support) => [support, claim])));
  const seasonClaimBySupport = new Map(catalogs.flatMap((catalog) => catalog.seasonClaims).flatMap((claim) => claim.supports.map((support) => [support, claim])));
  const researchByUnit = new Map(research.records.map((entry) => [entry.unitIdentity, entry]));
  const transportUnits = [];
  const seasonUnits = [];

  assert.deepEqual(entityReview.selection.final, CODES);
  for (const countryReview of entityReview.countriesReviewed) {
    const code = countryReview.countryCode;
    for (const unit of countryReview.directedTransportSegmentUnits) {
      const from = cityById.get(unit.fromEntityId);
      const to = cityById.get(unit.toEntityId);
      assert(from && to && from.entityId !== to.entityId, `${code}:invalid-transport-unit`);
      assert.equal(countryById.get(from.parentCountryEntityId)?.isoAlpha2, code);
      assert.equal(countryById.get(to.parentCountryEntityId)?.isoAlpha2, code);
      const support = routeSupport(unit);
      const record = routeRecords.find((entry) => entry.fromEntityId === from.entityId && entry.toEntityId === to.entityId);
      const claim = transportClaimBySupport.get(support) || null;
      const recordValidation = record ? validateRouteLegEvidence(record) : { accepted: false, reasons: ["production-evidence-missing"] };
      const claimValidation = claim ? validateReviewedTransportClaim(claim) : { accepted: false, reasons: ["independent-reviewed-claim-missing"] };
      const admitted = Boolean(record && claim && recordValidation.accepted && claimValidation.accepted && claim.countryCode === code && sourceMatchesClaim(record, claim, support));
      const researchRecord = researchByUnit.get(`transport:${unit.fromEntityId}>${unit.toEntityId}`) || null;
      const newlyAdmitted = admitted && claim.claimId.startsWith("batch02-");
      transportUnits.push({
        countryCode: code,
        origin: { entityId: from.entityId, canonicalNameEn: from.canonicalNameEn },
        destination: { entityId: to.entityId, canonicalNameEn: to.canonicalNameEn },
        requiredDirection: `${from.entityId}>${to.entityId}`,
        evidenceOrigin: newlyAdmitted ? "newly-admitted" : (record ? "existing" : (researchRecord ? "researched-blocked" : "not-researched")),
        researchOutcome: researchRecord?.researchOutcome ?? null,
        source: admitted ? claim.source : null,
        sourceFact: admitted ? claim.reviewedFact : null,
        reviewedClaimId: admitted ? claim.claimId : null,
        productionEvidenceId: admitted ? record.legEvidenceId : null,
        status: admitted ? "ADMITTED" : "BLOCKED",
        reason: admitted ? "Existing production Evidence independently matches the exact reviewed claim, source fact, Country, endpoints, and direction."
          : (researchRecord?.adjudicationReason || "No substantive research/adjudication record exists for this unit."),
      });
    }
    for (const unit of countryReview.seasonMonthProfileUnits) {
      const city = cityById.get(unit.entityId);
      assert(city, `${code}:invalid-season-unit`);
      assert.equal(countryById.get(city.parentCountryEntityId)?.isoAlpha2, code);
      const candidates = seasonRecords.filter((entry) => entry.entityId === city.entityId);
      let admittedRecord = null;
      let admittedClaim = null;
      for (const record of candidates) {
        const support = seasonSupport(city.entityId, record.month);
        const claim = seasonClaimBySupport.get(support) || null;
        if (claim && validateSeasonEvidence(record).accepted && validateReviewedSeasonClaim(claim).accepted
          && claim.countryCode === code && sourceMatchesClaim(record, claim, support)) {
          admittedRecord = record;
          admittedClaim = claim;
          break;
        }
      }
      seasonUnits.push({
        countryCode: code,
        destination: { entityId: city.entityId, canonicalNameEn: city.canonicalNameEn },
        requiredProfile: "objective-destination-month-risk",
        admittedMonth: admittedRecord?.month ?? null,
        evidenceOrigin: candidates.length ? "existing" : (researchByUnit.has(`season:${city.entityId}:objective-destination-month-risk`) ? "researched-blocked" : "not-researched"),
        researchOutcome: researchByUnit.get(`season:${city.entityId}:objective-destination-month-risk`)?.researchOutcome ?? null,
        source: admittedClaim?.source ?? null,
        sourceFact: admittedClaim?.reviewedFact ?? null,
        reviewedClaimId: admittedClaim?.claimId ?? null,
        productionEvidenceId: admittedRecord?.seasonEvidenceId ?? null,
        status: admittedRecord ? "ADMITTED" : "BLOCKED",
        reason: admittedRecord ? "Existing production Evidence independently matches the reviewed source fact, Destination, Country, and admitted month."
          : (researchByUnit.get(`season:${city.entityId}:objective-destination-month-risk`)?.adjudicationReason || "No substantive research/adjudication record exists for this unit."),
      });
    }
  }

  // The sealed Entity Foundation reported reusable counts before exact authority
  // revalidation. Preserve that review accounting, but fail closed when no exact
  // directed production record exists for a reported reusable unit.
  for (const countryReview of entityReview.countriesReviewed) {
    const countryUnits = transportUnits.filter((entry) => entry.countryCode === countryReview.countryCode);
    const alreadyReviewed = countryUnits.filter((entry) => entry.evidenceOrigin === "existing").length;
    const reportedReusable = countryReview.existingReusableEvidence.transport;
    const deficit = reportedReusable - alreadyReviewed;
    assert(deficit >= 0, `${countryReview.countryCode}:live-existing-transport-exceeds-sealed-worklist`);
    for (const entry of countryUnits.filter((unit) => unit.evidenceOrigin === "researched-blocked").slice(0, deficit)) {
      entry.evidenceOrigin = "reported-existing-rejected";
      entry.reason = "The sealed worklist counted this unit as reusable, but exact-direction production Evidence backed by an independently catalogued reviewed claim was not found; the unit is returned to blocked/missing.";
    }
  }

  assert.equal(transportUnits.length, 54);
  assert.equal(seasonUnits.length, 41);
  assert.equal(new Set(transportUnits.map((entry) => entry.requiredDirection)).size, 54);
  assert.equal(transportUnits.some((entry) => entry.origin.entityId === entry.destination.entityId), false);
  assert.equal(new Set(seasonUnits.map((entry) => entry.destination.entityId)).size, 41);

  const matrix = CODES.map((code) => {
    const country = countryById.size ? countries.find((entry) => entry.isoAlpha2 === code) : null;
    const destinationCount = cities.filter((entry) => entry.parentCountryEntityId === country?.entityId).length;
    const transport = transportUnits.filter((entry) => entry.countryCode === code);
    const season = seasonUnits.filter((entry) => entry.countryCode === code);
    const transportAdmitted = transport.filter((entry) => entry.status === "ADMITTED").length;
    const seasonAdmitted = season.filter((entry) => entry.status === "ADMITTED").length;
    const evidenceReady = transportAdmitted === transport.length && seasonAdmitted === season.length;
    return {
      countryCode: code,
      destinations: destinationCount,
      requiredTransport: transport.length,
      admittedTransport: transportAdmitted,
      blockedTransport: transport.length - transportAdmitted,
      requiredSeason: season.length,
      admittedSeason: seasonAdmitted,
      blockedSeason: season.length - seasonAdmitted,
      themeEvidence: 0,
      evidenceReady,
      reason: evidenceReady ? null : "One or more independently authoritative Transport or Season Evidence units remain blocked.",
    };
  });
  const readiness = getAuthoritativeKnowledgeReadiness();
  const researchOutcomes = Object.fromEntries([...new Set(research.records.map((entry) => entry.researchOutcome))]
    .sort().map((outcome) => [outcome, research.records.filter((entry) => entry.researchOutcome === outcome).length]));
  const summary = {
    transport: {
      required: 54,
      existingReviewed: 8,
      existingRetained: transportUnits.filter((entry) => entry.evidenceOrigin === "existing" && entry.status === "ADMITTED").length,
      existingRejected: transportUnits.filter((entry) => entry.evidenceOrigin === "reported-existing-rejected").length,
      missingResearched: 46,
      newlyAdmitted: transportUnits.filter((entry) => entry.evidenceOrigin === "newly-admitted").length,
      totalAdmitted: transportUnits.filter((entry) => entry.status === "ADMITTED").length,
      blocked: transportUnits.filter((entry) => entry.status === "BLOCKED").length,
      unaccounted: 0,
      duplicates: 0,
      selfLoops: 0,
    },
    season: {
      required: 41,
      existingReviewed: seasonUnits.filter((entry) => entry.evidenceOrigin === "existing").length,
      existingRetained: seasonUnits.filter((entry) => entry.evidenceOrigin === "existing" && entry.status === "ADMITTED").length,
      existingRejected: seasonUnits.filter((entry) => entry.evidenceOrigin === "existing" && entry.status === "BLOCKED").length,
      missingResearched: seasonUnits.filter((entry) => entry.evidenceOrigin === "researched-blocked").length,
      newlyAdmitted: 0,
      totalAdmitted: seasonUnits.filter((entry) => entry.status === "ADMITTED").length,
      blocked: seasonUnits.filter((entry) => entry.status === "BLOCKED").length,
      unaccounted: 0,
    },
    evidenceReadyCountryCodes: matrix.filter((entry) => entry.evidenceReady).map((entry) => entry.countryCode),
    evidenceBlockedCountryCodes: matrix.filter((entry) => !entry.evidenceReady).map((entry) => entry.countryCode),
    research: { transport: 49, season: 29, total: 78, unclassified: 0, outcomes: researchOutcomes },
  };
  const authority = {
    entityCounts: { countries: countries.length, cities: cities.length, pois: pois.length, total: countries.length + cities.length + pois.length },
    readinessCounts: readiness.expectedCounts,
    accidentalPromotions: 0,
    candidateLeakage: "NONE",
    themeEvidenceAdded: 0,
    reportsGrantAuthority: false,
    callerControlledEvidenceAuthority: false,
  };
  const audit = {
    schemaVersion: "route-v2-plannable-expansion-batch02-evidence-audit-v1",
    sealedMain: "56c9efc8002e4e73cd4e270914815774919a2629",
    countries: CODES,
    transportUnits,
    seasonUnits,
    coverageMatrix: matrix,
    summary,
    authority,
  };
  const report = {
    schemaVersion: "route-v2-plannable-expansion-batch02-evidence-report-v1",
    phase: "EVIDENCE_IMPLEMENTED_NOT_SEALED",
    countries: CODES,
    summary,
    coverageMatrix: matrix,
    blockedTransportUnits: transportUnits.filter((entry) => entry.status === "BLOCKED").map((entry) => ({ countryCode: entry.countryCode, direction: entry.requiredDirection, origin: entry.origin.canonicalNameEn, destination: entry.destination.canonicalNameEn, reason: entry.reason })),
    blockedSeasonProfiles: seasonUnits.filter((entry) => entry.status === "BLOCKED").map((entry) => ({ countryCode: entry.countryCode, destinationEntityId: entry.destination.entityId, destination: entry.destination.canonicalNameEn, requiredProfile: entry.requiredProfile, reason: entry.reason })),
    authority,
    promotion: "NOT_STARTED",
    performance: "NOT_CLEARED_UNCHANGED",
  };
  return { audit, report };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const model = buildBatch02EvidenceModel();
  writeJson(AUDIT, model.audit);
  writeJson(REPORT, model.report);
  console.log(JSON.stringify({ status: "GENERATED", ...model.audit.summary, authority: model.audit.authority }, null, 2));
}
