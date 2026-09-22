import fs from "node:fs";
import path from "node:path";

import { validateReviewedSearchAttempt } from "./lib/plannable-expansion-batch02-research-attempt.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");
const AUDIT = JSON.parse(fs.readFileSync(path.join(ROOT, "data/knowledge/batches/plannable-expansion-batch02-evidence-audit.json"), "utf8"));
const OUTPUT = path.join(ROOT, "data/knowledge/research/plannable-expansion-batch02-evidence-research.json");
const ATTEMPT_AUDIT = JSON.parse(fs.readFileSync(path.join(ROOT, "data/knowledge/research/plannable-expansion-batch02-search-attempts.json"), "utf8"));
const REVIEWED_CLAIMS = JSON.parse(fs.readFileSync(path.join(ROOT, "data/knowledge/reviewed-claims/plannable-expansion-batch02-reviewed-claims.json"), "utf8"));
const REVIEWED_AT = "2026-09-22T00:00:00.000Z";
const attempts = new Map(ATTEMPT_AUDIT.attempts.map((attempt) => [attempt.unitIdentity, attempt]));
const reviewedTransportSupports = new Set(REVIEWED_CLAIMS.transportClaims.flatMap((claim) => claim.supports));

const transportSources = {
  AO: ["https://www.mintrans.gov.ao/", "Angola Ministry of Transport", "Government transport portal identifies operators and infrastructure, but does not establish the required passenger direction."],
  BZ: ["https://www.pressoffice.gov.bz/wp-content/uploads/2019/12/D.O.T-Press-Release-2-of-2020-October-27-2020.pdf", "Belize Department of Transport", "The release identifies intercity bus terminals, but does not establish service for an exact required direction."],
  CI: ["https://www.transports.gouv.ci/node/1735", "Côte d’Ivoire Ministry of Transport", "The page identifies road axes, but does not establish passenger service for an exact required direction."],
  CM: ["https://camrail.cm/en/transport-offer/", "Camrail", "The official offer establishes daily Douala–Yaoundé services in both directions; it does not establish a Douala–Buea service."],
  CV: ["https://www.cvinterilhas.cv/home", "CV Interilhas", "The operator confirms inter-island passenger service, but the reviewed page does not establish the exact Praia–Mindelo direction and schedule."],
  MN: ["https://news.mnb.mn/i/327521", "Mongolian National Broadcaster", "The timetable establishes Ulaanbaatar–Darkhan and Ulaanbaatar–Erdenet services, but not a direct Darkhan–Erdenet service."],
  TT: ["https://ptsc.co.tt/from/chaguanas/", "Public Transport Service Corporation", "The Chaguanas archive establishes Chaguanas–San Fernando service, but not the required Chaguanas–Port of Spain direction."],
  UG: ["https://www.jinjacity.go.ug/projects/uganda-kampala-jinja-expression-way-project-sovereign-operation-phase-1", "Jinja City", "The project page establishes a Kampala–Jinja road corridor, not scheduled passenger service in the required direction."],
};

const seasonSources = {
  AO: ["https://agroclima.inamet.gov.ao/", "INAMET", "The reviewed material provides regional agro-climate monitoring but not an exact destination/month risk profile for every required city."],
  BJ: ["https://www.meteobenin.bj/documents/1956/BUL_MTO_SAM_14_FEV_2026.pdf", "Météo-Bénin", "The bulletin reports observed and forecast conditions, but does not establish the required stable month-risk profile for each destination."],
  BY: ["https://www.data.jma.go.jp/tcc/tcc/products/climate/climatview/graph_mkhtml.php?d=0&e=0&k=0&m=5&n=33008&r=1&s=1&y=2023", "Japan Meteorological Agency ClimatView", "The station view is city-specific climate data, but the reviewed record does not establish an objective risk claim and admitted month under the current contract."],
};

function transportRecord(unit) {
  const unitIdentity = `transport:${unit.requiredDirection}`;
  const attempt = attempts.get(unitIdentity) || null;
  if (attempt && !validateReviewedSearchAttempt(attempt, { unitIdentity }).accepted) throw new Error(`invalid-reviewed-search-attempt:${unitIdentity}`);
  const eligible = reviewedTransportSupports.has(`route-leg:${unit.requiredDirection}:feasibility`);
  const source = transportSources[unit.countryCode] || null;
  return {
    unitType: "transport",
    unitIdentity,
    countryCode: unit.countryCode,
    origin: unit.origin,
    destination: unit.destination,
    requiredDirection: unit.requiredDirection,
    searchQueries: attempt?.executedQueries || [`official passenger transport ${unit.origin.canonicalNameEn} ${unit.destination.canonicalNameEn} timetable route`],
    searchAttempt: attempt,
    source: attempt ? { url: attempt.checkedResultReferences[0].url, publisher: attempt.checkedResultReferences[0].title, sourceType: "reviewed-search-result" } : (source ? { url: source[0], publisher: source[1], sourceType: "official-or-government-source" } : null),
    sourceFact: attempt?.reviewedSourceFact || source?.[2] || null,
    claimAttempted: `Scheduled passenger connectivity ${unit.origin.canonicalNameEn} to ${unit.destination.canonicalNameEn}`,
    bindingReview: eligible ? "Exact endpoints and both directions are explicitly supported." : (attempt?.unitSpecificAdjudication || (source ? "The source does not establish this exact directed passenger unit." : "NOT_RESEARCHED")),
    researchOutcome: eligible ? "SOURCE_FOUND_AND_ELIGIBLE_FOR_REVIEWED_CLAIM" : (attempt?.finalResearchOutcome || (source ? "SOURCE_FOUND_BUT_FACT_INSUFFICIENT" : "NOT_RESEARCHED")),
    adjudicationReason: eligible ? "Eligible for independent Batch02 reviewed-claim admission." : (attempt?.unitSpecificAdjudication || source?.[2] || "No reviewed search attempt exists."),
    reviewedClaimStatus: eligible ? "APPROVED_IN_BATCH02_CATALOG" : "NOT_APPROVED",
    reviewedAt: REVIEWED_AT,
  };
}

function seasonRecord(unit) {
  const unitIdentity = `season:${unit.destination.entityId}:objective-destination-month-risk`;
  const attempt = attempts.get(unitIdentity) || null;
  if (attempt && !validateReviewedSearchAttempt(attempt, { unitIdentity }).accepted) throw new Error(`invalid-reviewed-search-attempt:${unitIdentity}`);
  const source = seasonSources[unit.countryCode] || null;
  return {
    unitType: "season",
    unitIdentity,
    countryCode: unit.countryCode,
    destination: unit.destination,
    requiredProfile: unit.requiredProfile,
    searchQueries: attempt?.executedQueries || [`official meteorological climate ${unit.destination.canonicalNameEn} monthly seasonal risk`],
    searchAttempt: attempt,
    source: attempt ? { url: attempt.checkedResultReferences[0].url, publisher: attempt.checkedResultReferences[0].title, sourceType: "reviewed-search-result" } : (source ? { url: source[0], publisher: source[1], sourceType: "official-meteorological-source" } : null),
    sourceFact: attempt?.reviewedSourceFact || source?.[2] || null,
    claimAttempted: `Objective destination/month risk profile for ${unit.destination.canonicalNameEn}`,
    bindingReview: attempt?.unitSpecificAdjudication || (source ? "The reviewed fact is insufficient for an exact admitted month/profile binding." : "NOT_RESEARCHED"),
    researchOutcome: attempt?.finalResearchOutcome || (source ? "SOURCE_FOUND_BUT_FACT_INSUFFICIENT" : "NOT_RESEARCHED"),
    adjudicationReason: attempt?.unitSpecificAdjudication || source?.[2] || "No reviewed search attempt exists.",
    reviewedClaimStatus: "NOT_APPROVED",
    reviewedAt: REVIEWED_AT,
  };
}

const unresolvedTransport = AUDIT.transportUnits.filter((unit) => unit.evidenceOrigin !== "existing");
const unresolvedSeason = AUDIT.seasonUnits.filter((unit) => unit.evidenceOrigin !== "existing");
const records = [...unresolvedTransport.map(transportRecord), ...unresolvedSeason.map(seasonRecord)];
if (unresolvedTransport.length !== 49 || unresolvedSeason.length !== 29 || records.length !== 78) throw new Error("research-scope-mismatch");
if (attempts.size !== 40 || [...attempts.keys()].some((unitIdentity) => !records.some((record) => record.unitIdentity === unitIdentity))) throw new Error("reviewed-search-attempt-scope-mismatch");
fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
fs.writeFileSync(OUTPUT, `${JSON.stringify({
  schemaVersion: "route-v2-plannable-expansion-batch02-evidence-research-v1",
  batchId: "plannable-expansion-batch02",
  reviewedAt: REVIEWED_AT,
  records,
}, null, 2)}\n`);
console.log(JSON.stringify({ status: "GENERATED", transport: unresolvedTransport.length, season: unresolvedSeason.length, total: records.length }, null, 2));
