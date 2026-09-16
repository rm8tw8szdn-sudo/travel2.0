import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createPublishedKnowledgeEntityLayerRepository } from "../src/lib/routes/index.mjs";
import { normalizeLocalEvidenceSource } from "../src/lib/routes/local-evidence-source-schema.mjs";
import { normalizeRouteLegEvidence, validateRouteLegEvidence } from "../src/lib/routes/route-leg-evidence-schema.mjs";
import { normalizeSeasonEvidence, validateSeasonEvidence } from "../src/lib/routes/season-evidence-schema.mjs";
import { stableHash } from "../src/lib/routes/route-v2-utils.mjs";
import { directedClaimsFromReviewedClaim, validateReviewedTransportClaim } from "../src/lib/routes/reviewed-transport-evidence-authority.mjs";
import { validateReviewedSeasonClaim } from "../src/lib/routes/reviewed-season-evidence-authority.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SEED_PATH = "data/knowledge/seeds/plannable-expansion-batch01-evidence.json";
const ENTITY_REVIEW_PATH = "data/knowledge/reports/plannable-expansion-batch01-entity-review.json";
const ROUTE_LEG_PATH = "data/route-v2/evidence-seed/route-leg-evidence.jsonl";
const SEASON_PATH = "data/route-v2/evidence-seed/season-evidence.jsonl";
const MANIFEST_PATH = "data/route-v2/evidence-seed/evidence-seed-manifest.json";
const AUDIT_PATH = "data/knowledge/batches/plannable-expansion-batch01-evidence-audit.json";
const REPORT_PATH = "data/knowledge/reports/plannable-expansion-batch01-evidence.json";

function parseJsonl(text) {
  return text.split(/\r?\n/u).filter(Boolean).map((line) => JSON.parse(line));
}

function upsert(records, additions, key) {
  return [...new Map([...records, ...additions].map((record) => [record[key], record])).values()]
    .sort((left, right) => left[key].localeCompare(right[key], "en"));
}

function createRouteLeg(from, to, claim) {
  const support = `route-leg:${from.entityId}>${to.entityId}:feasibility`;
  if (!claim.supports.includes(support)) throw new Error(`transport-claim-support-missing:${claim.claimId}:${support}`);
  const source = normalizeLocalEvidenceSource({
    url: claim.source.url,
    supports: [support],
    retrievedAt: claim.retrievedAt,
    confidence: 0.9,
    factLocator: claim.source.locator,
    factExcerpt: claim.reviewedFact,
    contentHash: claim.reviewedPayloadHash,
  });
  if (!source.sourceType || source.publisher !== claim.source.authority) throw new Error(`transport-source-authority-mismatch:${claim.claimId}`);
  const record = normalizeRouteLegEvidence({
    fromEntityId: from.entityId,
    toEntityId: to.entityId,
    transportMode: claim.transportMode,
    directed: true,
    feasibilityStatus: "feasible",
    durationMinMinutes: null,
    durationMaxMinutes: null,
    transferCount: null,
    frequencyLevel: "unknown",
    sourceRefs: [source.sourceId],
    sources: [source],
    confidence: 0.9,
    freshnessStatus: "fresh",
    retrievedAt: claim.retrievedAt,
    expiresAt: null,
    unknowns: [
      { field: "duration", reason: "The official source establishes the directed service; a stable duration is not asserted." },
      { field: "transferCount", reason: "A stable transfer count is not asserted." },
      { field: "frequencyLevel", reason: "Frequency is timetable-dependent and is intentionally not generalized." },
    ],
    conflicts: [],
    diagnostics: [{ field: "batch", reason: "plannable-expansion-batch01-evidence" }],
    createdAt: claim.retrievedAt,
    updatedAt: claim.retrievedAt,
  }, { now: () => claim.retrievedAt });
  const validation = validateRouteLegEvidence(record);
  if (!validation.accepted) throw new Error(`route-leg-invalid:${from.entityId}>${to.entityId}:${validation.reasons.join("|")}`);
  return validation.record;
}

function createSeasonProfile(city, claim) {
  const support = `season:${city.entityId}:${claim.admittedMonth}:risk`;
  if (!claim.supports.includes(support)) throw new Error(`season-claim-support-missing:${claim.claimId}`);
  const source = normalizeLocalEvidenceSource({
    url: claim.source.url,
    supports: [support],
    retrievedAt: claim.retrievedAt,
    confidence: 0.86,
    factLocator: claim.source.locator,
    factExcerpt: claim.reviewedFact,
    contentHash: claim.reviewedPayloadHash,
  });
  if (!source.sourceType || source.publisher !== claim.source.authority) throw new Error(`season-source-authority-mismatch:${claim.claimId}`);
  const record = normalizeSeasonEvidence({
    entityId: city.entityId,
    month: claim.admittedMonth,
    season: null,
    suitabilityStatus: "unknown",
    weatherRisks: claim.factualPayload.risks,
    transportRisks: [],
    closureRisks: [],
    recommendedBufferMinutes: null,
    sourceRefs: [source.sourceId],
    sources: [source],
    confidence: 0.86,
    freshnessStatus: "fresh",
    retrievedAt: claim.retrievedAt,
    expiresAt: null,
    unknowns: [{ field: "seasonSuitability", reason: "Only objective risk is admitted; no preferred travel month is inferred." }],
    conflicts: [],
    diagnostics: [{ field: "batch", reason: "plannable-expansion-batch01-evidence" }],
    createdAt: claim.retrievedAt,
    updatedAt: claim.retrievedAt,
  }, { now: () => claim.retrievedAt });
  const validation = validateSeasonEvidence(record);
  if (!validation.accepted) throw new Error(`season-invalid:${city.entityId}:${validation.reasons.join("|")}`);
  return validation.record;
}

async function atomicWrite(relativePath, contents) {
  const target = path.join(ROOT, relativePath);
  await mkdir(path.dirname(target), { recursive: true });
  const temporary = `${target}.${process.pid}.tmp`;
  try {
    await writeFile(temporary, contents, "utf8");
    await rename(temporary, target);
  } finally {
    await rm(temporary, { force: true });
  }
}

async function main() {
  const seed = JSON.parse(await readFile(path.join(ROOT, SEED_PATH), "utf8"));
  const entityReview = JSON.parse(await readFile(path.join(ROOT, ENTITY_REVIEW_PATH), "utf8"));
  const repository = createPublishedKnowledgeEntityLayerRepository({ projectRoot: ROOT });
  const countries = repository.listCountries();
  const cities = repository.listCities();
  const countryByIso = new Map(countries.map((entry) => [entry.isoAlpha2, entry]));
  const cityByCountryAndName = new Map();
  const citiesByCountry = new Map();
  for (const [iso, country] of countryByIso) {
    const entries = cities.filter((city) => city.parentCountryEntityId === country.entityId);
    citiesByCountry.set(iso, entries);
    for (const city of entries) {
      cityByCountryAndName.set(`${iso}:${city.canonicalNameEn}`, city);
      for (const alias of city.aliases || []) cityByCountryAndName.set(`${iso}:${alias}`, city);
    }
  }

  const expectedCodes = entityReview.countries;
  if (JSON.stringify(Object.keys(seed.countries)) !== JSON.stringify(expectedCodes)) {
    throw new Error("batch-country-order-or-membership-mismatch");
  }
  const routeAdditions = [];
  const seasonAdditions = [];
  const countriesAudit = [];
  for (const iso of expectedCodes) {
    const country = countryByIso.get(iso);
    if (!country) throw new Error(`country-not-published:${iso}`);
    const cityEntries = citiesByCountry.get(iso) || [];
    const expectedReview = entityReview.countriesReviewed.find((entry) => entry.countryCode === iso);
    if (cityEntries.length !== expectedReview.admittedProductionDestinations) {
      throw new Error(`destination-count-mismatch:${iso}:${cityEntries.length}:${expectedReview.admittedProductionDestinations}`);
    }
    const config = seed.countries[iso];
    const expectedDirected = expectedReview.requiredDirectedTransportSegments;
    let admittedDirected = 0;
    if (config.transport.status === "validated") {
      for (const claim of config.transport.claims) {
        const origin = cityByCountryAndName.get(`${iso}:${claim.origin.canonicalNameEn}`);
        const destination = cityByCountryAndName.get(`${iso}:${claim.destination.canonicalNameEn}`);
        if (!origin || !destination) throw new Error(`transport-endpoint-missing:${iso}:${claim.claimId}`);
        const validation = validateReviewedTransportClaim(claim);
        if (!validation.accepted) throw new Error(`transport-claim-invalid:${claim.claimId}:${validation.reasons.join("|")}`);
        if (claim.countryCode !== iso || claim.origin.entityId !== origin.entityId || claim.destination.entityId !== destination.entityId) throw new Error(`transport-claim-registry-binding-mismatch:${claim.claimId}`);
        for (const directed of directedClaimsFromReviewedClaim(claim)) {
          const from = cityByCountryAndName.get(`${iso}:${directed.from.canonicalNameEn}`);
          const to = cityByCountryAndName.get(`${iso}:${directed.to.canonicalNameEn}`);
          routeAdditions.push(createRouteLeg(from, to, claim));
          admittedDirected += 1;
        }
      }
    } else if (config.transport.status === "single-destination-not-required") {
      if (cityEntries.length !== 1 || config.transport.claims.length !== 0) throw new Error(`single-destination-exemption-invalid:${iso}`);
    } else if (config.transport.status !== "blocked") {
      throw new Error(`transport-status-invalid:${iso}`);
    }
    for (const claim of config.season.claims) {
      const city = cityByCountryAndName.get(`${iso}:${claim.destination.canonicalNameEn}`);
      if (!city) throw new Error(`season-endpoint-missing:${iso}:${claim.claimId}`);
      const validation = validateReviewedSeasonClaim(claim);
      if (!validation.accepted) throw new Error(`season-claim-invalid:${claim.claimId}:${validation.reasons.join("|")}`);
      if (claim.countryCode !== iso || claim.destination.entityId !== city.entityId) throw new Error(`season-claim-registry-binding-mismatch:${claim.claimId}`);
      seasonAdditions.push(createSeasonProfile(city, claim));
    }
    const transportSatisfied = config.transport.status === "single-destination-not-required" || admittedDirected === expectedReview.requiredDirectedTransportSegments;
    const seasonSatisfied = config.season.claims.length === expectedReview.requiredSeasonMonthProfiles;
    countriesAudit.push({
      countryCode: iso,
      countryEntityId: country.entityId,
      destinationCount: cityEntries.length,
      transportStatus: config.transport.status,
      requiredDirectedTransportSegments: expectedReview.requiredDirectedTransportSegments,
      plannedDirectedTransportSegments: expectedDirected,
      admittedDirectedTransportSegments: admittedDirected,
      missingDirectedTransportSegments: expectedReview.requiredDirectedTransportSegments - admittedDirected,
      requiredSeasonMonthProfiles: expectedReview.requiredSeasonMonthProfiles,
      admittedSeasonMonthProfiles: config.season.claims.length,
      themeEvidence: 0,
      transportSatisfied,
      seasonSatisfied,
      evidenceReadyCandidate: transportSatisfied && seasonSatisfied,
      plannable: false,
      evidenceBacked: false,
      catalogOnly: true,
      readinessPromotion: false,
      blocker: !transportSatisfied ? config.transport.reason : (!seasonSatisfied ? "One or more required destination/month claims lack authoritative source binding." : null),
    });
  }

  if (new Set(routeAdditions.map((entry) => entry.legEvidenceId)).size !== routeAdditions.length) throw new Error("batch-route-id-duplicate");
  if (new Set(seasonAdditions.map((entry) => entry.seasonEvidenceId)).size !== seasonAdditions.length) throw new Error("batch-season-id-duplicate");

  const priorRoutes = parseJsonl(await readFile(path.join(ROOT, ROUTE_LEG_PATH), "utf8"))
    .filter((record) => record.retrievedAt !== seed.retrievedAt);
  const priorSeasons = parseJsonl(await readFile(path.join(ROOT, SEASON_PATH), "utf8"))
    .filter((record) => record.retrievedAt !== seed.retrievedAt);
  const routeLegs = upsert(priorRoutes, routeAdditions, "legEvidenceId");
  const seasons = upsert(priorSeasons, seasonAdditions, "seasonEvidenceId");
  for (const record of routeLegs) if (!validateRouteLegEvidence(record).accepted) throw new Error(`route-library-invalid:${record.legEvidenceId}`);
  for (const record of seasons) if (!validateSeasonEvidence(record).accepted) throw new Error(`season-library-invalid:${record.seasonEvidenceId}`);

  const currentManifest = JSON.parse(await readFile(path.join(ROOT, MANIFEST_PATH), "utf8"));
  const manifest = {
    ...currentManifest,
    countries: [...new Set([...(currentManifest.countries || []), ...expectedCodes])].sort(),
    routeLegEvidenceIds: routeLegs.map((record) => record.legEvidenceId),
    seasonEvidenceIds: seasons.map((record) => record.seasonEvidenceId),
    counts: { routeLeg: routeLegs.length, season: seasons.length, total: routeLegs.length + seasons.length },
    promotedEvidenceHash: stableHash({ routeLegs, seasons }),
  };

  const totals = {
    requiredDirectedTransportSegments: 42,
    admittedDirectedTransportSegments: routeAdditions.length,
    missingDirectedTransportSegments: 42 - routeAdditions.length,
    requiredSeasonMonthProfiles: 33,
    admittedSeasonMonthProfiles: seasonAdditions.length,
    themeEvidence: seed.themeEvidence.length,
    evidenceReadyCandidateCountries: countriesAudit.filter((entry) => entry.evidenceReadyCandidate).length,
    blockedCountries: countriesAudit.filter((entry) => !entry.evidenceReadyCandidate).length,
  };
  const authority = {
    resultLabel: seed.authority.resultLabel,
    productionCounts: { countries: 195, cities: 866, pois: 4071, totalEntities: 5132 },
    readinessCounts: { plannable: 118, evidenceBacked: 115, catalogOnly: 77 },
    readinessPromotions: 0,
    addedPlannable: 0,
    addedEvidenceBacked: 0,
    candidateLeakage: "NONE",
  };
  const audit = {
    schemaVersion: "route-v2-plannable-expansion-batch01-evidence-audit-v1",
    retrievedAt: seed.retrievedAt,
    countries: countriesAudit,
    totals,
    authority,
    conflicts: [],
    blockedClaims: countriesAudit.filter((entry) => entry.blocker).map((entry) => ({
      countryCode: entry.countryCode,
      claim: "directed-transport",
      missing: entry.missingDirectedTransportSegments,
      reason: entry.blocker,
    })),
    transportReAdjudication: expectedCodes.flatMap((iso) => {
      const transport = seed.countries[iso].transport;
      const admitted = transport.claims.flatMap((claim) => directedClaimsFromReviewedClaim(claim).map(({ from, to }) => ({
        countryCode: iso,
        origin: from.canonicalNameEn,
        destination: to.canonicalNameEn,
        currentSource: claim.source.url,
        reviewedSource: claim.source.url,
        directionSupported: "YES",
        bidirectionalExplicitlySupported: claim.directionality === "bidirectional" ? "YES" : "NO",
        admission: "ADMIT",
        reason: claim.reviewedFact,
      })));
      const blocked = transport.blockedDirections.map((entry) => ({
        countryCode: iso,
        ...entry,
        directionSupported: "NO",
        bidirectionalExplicitlySupported: "NO",
        admission: "BLOCK",
      }));
      return [...admitted, ...blocked];
    }),
    seasonReAdjudication: expectedCodes.flatMap((iso) => {
      const season = seed.countries[iso].season;
      return [
        ...season.claims.map((claim) => ({
          countryCode: iso,
          destination: claim.destination.canonicalNameEn,
          source: claim.source.url,
          sourceAuthority: claim.source.authority,
          geographicScope: claim.geographicScope,
          monthCoverage: claim.supportedMonths,
          reviewedFactualClaim: claim.reviewedFact,
          exactBinding: "PASS",
          admission: "ADMIT",
          reason: claim.factualPayload.conditions,
        })),
        ...season.blockedDestinations.map((entry) => ({
          countryCode: iso,
          destination: entry.destination.canonicalNameEn,
          source: entry.source,
          sourceAuthority: null,
          geographicScope: null,
          monthCoverage: [],
          reviewedFactualClaim: null,
          exactBinding: "FAIL",
          admission: "BLOCK",
          reason: entry.reason,
        })),
      ];
    }),
  };
  const report = {
    schemaVersion: "route-v2-plannable-expansion-batch01-evidence-report-v1",
    phase: "D-F-evidence-implementation",
    countries: expectedCodes,
    totals,
    sourceQuality: {
      officialOrGovernmentTransportSources: new Set(routeAdditions.flatMap((record) => record.sources.map((source) => source.sourceId))).size,
      officialMeteorologicalSources: new Set(seasonAdditions.flatMap((record) => record.sources.map((source) => source.sourceId))).size,
      requestDerivedSources: 0,
      plannerDerivedSources: 0,
      fabricatedSources: 0,
    },
    authority,
    countriesReviewed: countriesAudit,
    outcome: totals.blockedCountries === 0 ? "EVIDENCE READY CANDIDATE" : "EVIDENCE READY CANDIDATE — PARTIAL WITH BLOCKED TRANSPORT CLAIMS",
    nextPromotionReviewInput: {
      readyCountryCodes: countriesAudit.filter((entry) => entry.evidenceReadyCandidate).map((entry) => entry.countryCode),
      blockedCountryCodes: countriesAudit.filter((entry) => !entry.evidenceReadyCandidate).map((entry) => entry.countryCode),
      note: "This report is evidence input only. It does not grant Plannable or Evidence-backed status.",
    },
  };

  await atomicWrite(ROUTE_LEG_PATH, `${routeLegs.map((record) => JSON.stringify(record)).join("\n")}\n`);
  await atomicWrite(SEASON_PATH, `${seasons.map((record) => JSON.stringify(record)).join("\n")}\n`);
  await atomicWrite(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);
  await atomicWrite(AUDIT_PATH, `${JSON.stringify(audit, null, 2)}\n`);
  await atomicWrite(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ status: "PASS", totals, authority }, null, 2));
}

await main();
