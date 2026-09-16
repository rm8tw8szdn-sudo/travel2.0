import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createPublishedKnowledgeEntityLayerRepository } from "../src/lib/routes/index.mjs";
import { validateRouteLegEvidence } from "../src/lib/routes/route-leg-evidence-schema.mjs";
import { validateSeasonEvidence } from "../src/lib/routes/season-evidence-schema.mjs";
import { directedClaimsFromReviewedClaim, reviewedTransportClaimHash, validateReviewedTransportClaim } from "../src/lib/routes/reviewed-transport-evidence-authority.mjs";
import { reviewedSeasonClaimHash, validateReviewedSeasonClaim } from "../src/lib/routes/reviewed-season-evidence-authority.mjs";
import { reviewedClaimCatalogSummary } from "../src/lib/routes/reviewed-claim-catalog.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const paths = {
  seed: "data/knowledge/seeds/plannable-expansion-batch01-evidence.json",
  entityReview: "data/knowledge/reports/plannable-expansion-batch01-entity-review.json",
  audit: "data/knowledge/batches/plannable-expansion-batch01-evidence-audit.json",
  report: "data/knowledge/reports/plannable-expansion-batch01-evidence.json",
  routes: "data/route-v2/evidence-seed/route-leg-evidence.jsonl",
  seasons: "data/route-v2/evidence-seed/season-evidence.jsonl",
};

const parseJsonl = (text) => text.split(/\r?\n/u).filter(Boolean).map((line) => JSON.parse(line));
const clone = (value) => structuredClone(value);

function assertThrowsContract(mutator, documents, label) {
  const { repository: _repository, ...serializable } = documents;
  const mutated = { ...clone(serializable), repository: createPublishedKnowledgeEntityLayerRepository({ projectRoot: ROOT }) };
  mutator(mutated);
  assert.throws(() => assertBatchEvidenceContract(mutated), undefined, label);
}

export function assertBatchEvidenceContract({ seed, entityReview, audit, report, routes, seasons, repository }) {
  const expectedCodes = ["BB", "BZ", "CV", "DM", "MN", "RW", "SC", "SM", "TT", "UG", "ZM", "ZW"];
  assert.deepEqual(Object.keys(seed.countries), expectedCodes, "seed country scope");
  assert.deepEqual(entityReview.countries, expectedCodes, "entity review country scope");
  assert.deepEqual(report.countries, expectedCodes, "report country scope");
  assert.equal(seed.authority.resultLabel, "EVIDENCE READY CANDIDATE");
  assert.equal(seed.authority.readinessPromotions, 0);
  assert.equal(seed.authority.addedPlannable, 0);
  assert.equal(seed.authority.addedEvidenceBacked, 0);

  const countries = repository.listCountries();
  const cities = repository.listCities();
  const pois = repository.listPois();
  assert.deepEqual({ countries: countries.length, cities: cities.length, pois: pois.length, total: countries.length + cities.length + pois.length }, {
    countries: 195, cities: 866, pois: 4071, total: 5132,
  });
  const countryByIso = new Map(countries.map((entry) => [entry.isoAlpha2, entry]));
  const cityByCountryAndName = new Map();
  const citiesByIso = new Map();
  for (const iso of expectedCodes) {
    const country = countryByIso.get(iso);
    assert.ok(country, `published country ${iso}`);
    const entries = cities.filter((city) => city.parentCountryEntityId === country.entityId);
    citiesByIso.set(iso, entries);
    for (const city of entries) {
      cityByCountryAndName.set(`${iso}:${city.canonicalNameEn}`, city);
      for (const alias of city.aliases || []) cityByCountryAndName.set(`${iso}:${alias}`, city);
    }
  }

  const batchRoutes = routes.filter((record) => record.retrievedAt === seed.retrievedAt);
  const batchSeasons = seasons.filter((record) => record.retrievedAt === seed.retrievedAt);
  const expectedRouteClaims = new Set();
  const reviewedClaimByDirection = new Map();
  const expectedSeasonClaims = new Set();
  const reviewedSeasonByKey = new Map();
  for (const iso of expectedCodes) {
    const config = seed.countries[iso];
    const cityEntries = citiesByIso.get(iso);
    const review = entityReview.countriesReviewed.find((entry) => entry.countryCode === iso);
    assert.equal(cityEntries.length, review.admittedProductionDestinations, `${iso} destination count`);
    if (cityEntries.length === 1) assert.equal(config.transport.status, "single-destination-not-required", `${iso} single-destination status`);
    if (cityEntries.length > 1) assert.notEqual(config.transport.status, "single-destination-not-required", `${iso} multi-destination cannot use exemption`);
    if (config.transport.status === "single-destination-not-required") {
      assert.equal(cityEntries.length, 1, `${iso} structural single-destination rule`);
      assert.deepEqual(config.transport.claims, [], `${iso} no fabricated transport claim`);
      assert.equal(review.requiredDirectedTransportSegments, 0, `${iso} zero transport requirement`);
    } else if (config.transport.status === "validated") {
      for (const claim of config.transport.claims) {
        const left = cityByCountryAndName.get(`${iso}:${claim.origin.canonicalNameEn}`);
        const right = cityByCountryAndName.get(`${iso}:${claim.destination.canonicalNameEn}`);
        assert.ok(left && right, `${iso} exact route endpoint binding`);
        const authority = validateReviewedTransportClaim(claim);
        assert.equal(authority.accepted, true, `${claim.claimId}:${authority.reasons.join("|")}`);
        for (const directed of directedClaimsFromReviewedClaim(claim)) {
          const key = `${directed.from.entityId}>${directed.to.entityId}`;
          expectedRouteClaims.add(key);
          reviewedClaimByDirection.set(key, claim);
        }
      }
    } else {
      assert.equal(config.transport.status, "blocked", `${iso} fail-closed transport state`);
      assert.ok(config.transport.reason, `${iso} blocked transport reason`);
    }
    for (const claim of config.season.claims) {
      const city = cityByCountryAndName.get(`${iso}:${claim.destination.canonicalNameEn}`);
      assert.ok(city, `${iso} season destination binding`);
      const authority = validateReviewedSeasonClaim(claim);
      assert.equal(authority.accepted, true, `${claim.claimId}:${authority.reasons.join("|")}`);
      const key = `${city.entityId}:${claim.admittedMonth}`;
      expectedSeasonClaims.add(key);
      reviewedSeasonByKey.set(key, claim);
    }
  }
  assert.equal(expectedRouteClaims.size, 28, "28 independently supported directed segments");
  assert.equal(batchRoutes.length, 28, "batch directed segment count");
  assert.equal(batchSeasons.length, 28, "batch authoritative season profile count");
  assert.deepEqual(new Set(batchRoutes.map((record) => `${record.fromEntityId}>${record.toEntityId}`)), expectedRouteClaims, "directed route claim set");
  assert.deepEqual(new Set(batchSeasons.map((record) => `${record.entityId}:${record.month}`)), expectedSeasonClaims, "season claim set");

  for (const record of batchRoutes) {
    const validation = validateRouteLegEvidence(record);
    assert.equal(validation.accepted, true, validation.reasons.join("|"));
    assert.equal(record.directed, true);
    assert.equal(record.sources.length, 1);
    assert.deepEqual(record.sources[0].supports, [`route-leg:${record.fromEntityId}>${record.toEntityId}:feasibility`]);
    assert.equal(record.sourceRefs[0], record.sources[0].sourceId);
    const claim = reviewedClaimByDirection.get(`${record.fromEntityId}>${record.toEntityId}`);
    assert.ok(claim, "production route must have reviewed directional authority");
    assert.equal(record.sources[0].url, claim.source.url, "production route exact reviewed page binding");
    assert.equal(record.sources[0].publisher, claim.source.authority, "production route source authority binding");
    assert.equal(record.sources[0].contentHash, claim.reviewedPayloadHash, "production route reviewed payload hash binding");
    assert.equal(record.sources[0].factExcerpt, claim.reviewedFact, "production route reviewed factual claim binding");
  }
  for (const record of batchSeasons) {
    const validation = validateSeasonEvidence(record);
    assert.equal(validation.accepted, true, validation.reasons.join("|"));
    assert.equal(record.sources.length, 1);
    assert.deepEqual(record.sources[0].supports, [`season:${record.entityId}:${record.month}:risk`]);
    assert.equal(record.suitabilityStatus, "unknown", "objective risk must not self-certify suitability");
    const claim = reviewedSeasonByKey.get(`${record.entityId}:${record.month}`);
    assert.ok(claim, "production season record must have reviewed authority");
    assert.equal(record.sources[0].url, claim.source.url);
    assert.equal(record.sources[0].publisher, claim.source.authority);
    assert.equal(record.sources[0].contentHash, claim.reviewedPayloadHash);
    assert.equal(record.sources[0].factExcerpt, claim.reviewedFact);
  }

  assert.deepEqual(report.totals, audit.totals, "report/audit totals");
  assert.deepEqual(report.authority, audit.authority, "report/audit authority");
  assert.deepEqual(report.countriesReviewed, audit.countries, "report/audit country rows");
  assert.deepEqual(report.totals, {
    requiredDirectedTransportSegments: 42,
    admittedDirectedTransportSegments: 28,
    missingDirectedTransportSegments: 14,
    requiredSeasonMonthProfiles: 33,
    admittedSeasonMonthProfiles: 28,
    themeEvidence: 0,
    evidenceReadyCandidateCountries: 6,
    blockedCountries: 6,
  });
  assert.deepEqual(report.nextPromotionReviewInput.blockedCountryCodes, ["BZ", "CV", "DM", "MN", "TT", "UG"]);
  assert.equal(audit.transportReAdjudication.length, 32, "all previously admitted directions re-adjudicated");
  assert.equal(audit.transportReAdjudication.filter((entry) => entry.admission === "ADMIT").length, 28);
  assert.equal(audit.transportReAdjudication.filter((entry) => entry.admission === "BLOCK").length, 4);
  assert.equal(audit.seasonReAdjudication.length, 33, "all season profiles re-adjudicated");
  assert.equal(audit.seasonReAdjudication.filter((entry) => entry.admission === "ADMIT").length, 28);
  assert.equal(audit.seasonReAdjudication.filter((entry) => entry.admission === "BLOCK").length, 5);
  assert.equal(report.authority.readinessPromotions, 0);
  assert.equal(report.authority.addedPlannable, 0);
  assert.equal(report.authority.addedEvidenceBacked, 0);
  assert.equal(report.authority.candidateLeakage, "NONE");
  assert.deepEqual(report.authority.productionCounts, { countries: 195, cities: 866, pois: 4071, totalEntities: 5132 });
  assert.deepEqual(report.authority.readinessCounts, { plannable: 118, evidenceBacked: 115, catalogOnly: 77 });
  for (const row of report.countriesReviewed) {
    assert.equal(row.plannable, false);
    assert.equal(row.evidenceBacked, false);
    assert.equal(row.catalogOnly, true);
    assert.equal(row.readinessPromotion, false);
  }
}

async function loadDocuments() {
  const [seed, entityReview, audit, report, routeText, seasonText] = await Promise.all([
    readFile(path.join(ROOT, paths.seed), "utf8").then(JSON.parse),
    readFile(path.join(ROOT, paths.entityReview), "utf8").then(JSON.parse),
    readFile(path.join(ROOT, paths.audit), "utf8").then(JSON.parse),
    readFile(path.join(ROOT, paths.report), "utf8").then(JSON.parse),
    readFile(path.join(ROOT, paths.routes), "utf8"),
    readFile(path.join(ROOT, paths.seasons), "utf8"),
  ]);
  return { seed, entityReview, audit, report, routes: parseJsonl(routeText), seasons: parseJsonl(seasonText), repository: createPublishedKnowledgeEntityLayerRepository({ projectRoot: ROOT }) };
}

async function main() {
  const documents = await loadDocuments();
  assertBatchEvidenceContract(documents);
  const batchRouteIndex = documents.routes.findIndex((record) => record.retrievedAt === documents.seed.retrievedAt);
  const batchSeasonIndex = documents.seasons.findIndex((record) => record.retrievedAt === documents.seed.retrievedAt);
  assert.ok(batchRouteIndex >= 0 && batchSeasonIndex >= 0);
  assertThrowsContract((value) => { value.routes.splice(batchRouteIndex, 1); }, documents, "missing direction rejected");
  assertThrowsContract((value) => { value.routes[batchRouteIndex].toEntityId = "city-forged-endpoint"; }, documents, "endpoint substitution rejected");
  assertThrowsContract((value) => { value.routes[batchRouteIndex].sources[0].supports = ["route-leg:forged>claim:feasibility"]; }, documents, "route source binding rejected");
  assertThrowsContract((value) => { value.seasons[batchSeasonIndex].entityId = "city-forged-season"; }, documents, "season identity substitution rejected");
  assertThrowsContract((value) => { value.seasons[batchSeasonIndex].sources[0].supports = ["season:forged:1:risk"]; }, documents, "season source binding rejected");
  assertThrowsContract((value) => { value.seed.countries.SC.transport.status = "validated"; }, documents, "single-destination exemption mutation rejected");
  assertThrowsContract((value) => { value.report.authority.readinessPromotions = 1; }, documents, "readiness promotion rejected");
  assertThrowsContract((value) => { value.report.countriesReviewed[0].plannable = true; }, documents, "plannable self-certification rejected");
  const bb = documents.seed.countries.BB.transport.claims[0];
  const tt = documents.seed.countries.TT.transport.claims[0];
  const rejectClaimMutation = (claim, mutate, label) => {
    const candidate = clone(claim);
    mutate(candidate);
    candidate.reviewedPayloadHash = reviewedTransportClaimHash(candidate);
    assert.equal(validateReviewedTransportClaim(candidate).accepted, false, label);
  };
  rejectClaimMutation(tt, (claim) => {
    [claim.origin, claim.destination] = [claim.destination, claim.origin];
    claim.supports = [`route-leg:${claim.origin.entityId}>${claim.destination.entityId}:feasibility`];
  }, "unsupported reverse rejected");
  rejectClaimMutation(tt, (claim) => { claim.source.url = "https://example.invalid/route"; }, "untrusted URL rejected");
  rejectClaimMutation(tt, (claim) => { claim.source.url = "https://ptsc.co.tt/tours/"; claim.source.pageIdentity = "PTSC tours"; }, "trusted-domain wrong page rejected");
  rejectClaimMutation(tt, (claim) => { claim.reviewedFact = "Caller asserts an unrelated route."; }, "caller-forged claim rejected");
  rejectClaimMutation(tt, (claim) => {
    claim.destination = clone(documents.seed.countries.TT.transport.claims[1].destination);
    claim.supports = [`route-leg:${claim.origin.entityId}>${claim.destination.entityId}:feasibility`];
  }, "endpoint mutation rejected");
  rejectClaimMutation(tt, (claim) => { claim.directionality = "bidirectional"; claim.supports.push(`route-leg:${claim.destination.entityId}>${claim.origin.entityId}:feasibility`); }, "direction mutation rejected");
  rejectClaimMutation(tt, (claim) => { claim.source.url = "https://ptsc.co.tt/routes-and-schedules/"; claim.source.pageIdentity = "Generic schedules"; }, "source-page mutation rejected");
  rejectClaimMutation(tt, (claim) => { claim.claimId = "caller-created-transport-claim"; }, "unknown transport claimId rejected");
  const callerSealedTransport = clone(tt);
  callerSealedTransport.claimId = "caller-created-sealed-transport";
  callerSealedTransport.reviewedPayloadHash = reviewedTransportClaimHash(callerSealedTransport);
  assert.equal(validateReviewedTransportClaim(callerSealedTransport).accepted, false, "caller-created sealed transport claim rejected");
  const validBidirectional = validateReviewedTransportClaim(bb);
  assert.equal(validBidirectional.accepted, true, validBidirectional.reasons.join("|"));
  assert.equal(directedClaimsFromReviewedClaim(bb).length, 2, "valid explicit bidirectional claim admits two directions");
  const bbSeason = documents.seed.countries.BB.season.claims[0];
  const rejectSeasonMutation = (claim, mutate, label) => {
    const candidate = clone(claim);
    mutate(candidate);
    candidate.reviewedPayloadHash = reviewedSeasonClaimHash(candidate);
    assert.equal(validateReviewedSeasonClaim(candidate).accepted, false, label);
  };
  rejectSeasonMutation(bbSeason, (claim) => { claim.source.url = "https://www.barbadosweather.org/"; claim.source.pageIdentity = "Homepage"; }, "season trusted-domain wrong page rejected");
  rejectSeasonMutation(bbSeason, (claim) => { claim.reviewedFact = "Caller asserts July is ideal."; }, "forged seasonal claim rejected");
  rejectSeasonMutation(bbSeason, (claim) => { claim.destination = clone(documents.seed.countries.BB.season.claims[1].destination); claim.supports = [`season:${claim.destination.entityId}:${claim.admittedMonth}:risk`]; }, "season destination mutation rejected");
  rejectSeasonMutation(bbSeason, (claim) => { claim.admittedMonth = 7; claim.supports = [`season:${claim.destination.entityId}:7:risk`]; }, "season month mutation rejected");
  rejectSeasonMutation(bbSeason, (claim) => { claim.geographicScope = { kind: "destination", identity: claim.destination.entityId, reviewedApplicability: "Caller-promoted city scope" }; }, "season geographic scope mutation rejected");
  rejectSeasonMutation(bbSeason, (claim) => { claim.source.url = "https://www.barbadosweather.org/"; claim.source.pageIdentity = "Unrelated page"; }, "season source-page mutation rejected");
  rejectSeasonMutation(bbSeason, (claim) => { claim.source.url = "https://example.invalid/weather"; }, "season untrusted source rejected");
  rejectSeasonMutation(bbSeason, (claim) => { claim.claimId = "caller-created-season-claim"; }, "unknown season claimId rejected");
  const callerSealedSeason = clone(bbSeason);
  callerSealedSeason.claimId = "caller-created-sealed-season";
  callerSealedSeason.reviewedPayloadHash = reviewedSeasonClaimHash(callerSealedSeason);
  assert.equal(validateReviewedSeasonClaim(callerSealedSeason).accepted, false, "caller-created sealed season claim rejected");
  const validSeason = validateReviewedSeasonClaim(bbSeason);
  assert.equal(validSeason.accepted, true, validSeason.reasons.join("|"));
  assert.deepEqual(reviewedClaimCatalogSummary(), { schemaVersion: "route-v2-reviewed-claim-catalog-v1", catalogId: "plannable-expansion-batch01", transportClaims: 15, seasonClaims: 28 });
  console.log(JSON.stringify({
    status: "PASS",
    directedTransport: { required: 42, admitted: 28, blocked: 14 },
    seasonMonthProfiles: { required: 33, admitted: 28, blocked: 5 },
    themeEvidence: 0,
    evidenceReadyCandidateCountries: 6,
    blockedCountries: ["BZ", "CV", "DM", "MN", "TT", "UG"],
    mutationRegressions: 28,
    readinessPromotions: 0,
    candidateLeakage: "NONE",
  }, null, 2));
}

await main();
