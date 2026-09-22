import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { buildBatch02EvidenceModel } from "./prepare-plannable-expansion-batch02-evidence.mjs";
import { createPublishedKnowledgeEntityLayerRepository } from "../src/lib/routes/index.mjs";
import { getAuthoritativeKnowledgeReadiness } from "../src/lib/routes/knowledge-readiness-authority.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");
const OUTPUT = path.join(ROOT, "data/knowledge/reports/plannable-expansion-batch02-promotion.json");
const CODES = Object.freeze(["AO", "BJ", "BY", "BZ", "CI", "CM", "CV", "DM", "MN", "MZ", "SZ", "TL", "TT", "UG"]);

export function buildBatch02PromotionModel() {
  const { audit } = buildBatch02EvidenceModel();
  const repository = createPublishedKnowledgeEntityLayerRepository({ projectRoot: ROOT });
  const readiness = getAuthoritativeKnowledgeReadiness();
  const catalogOnly = new Set(readiness.catalogOnlyCountryCodes);
  const rows = new Map(audit.coverageMatrix.map((row) => [row.countryCode, row]));
  const decisions = CODES.map((countryCode) => {
    const country = repository.listCountries().find((entry) => entry.isoAlpha2 === countryCode);
    const row = rows.get(countryCode);
    if (!country || !row) throw new Error(`batch02-promotion-live-country-missing:${countryCode}`);
    const blockers = [];
    if (!catalogOnly.has(countryCode)) blockers.push("country-not-catalog-only");
    if (row.destinations < 1) blockers.push("destination-structure-missing");
    if (row.admittedTransport !== row.requiredTransport || row.blockedTransport !== 0) blockers.push("directed-transport-incomplete");
    if (row.admittedSeason !== row.requiredSeason || row.blockedSeason !== 0) blockers.push("season-profile-incomplete");
    const liveEvidenceReady = blockers.length === 0;
    return {
      countryCode,
      destinations: row.destinations,
      transport: { required: row.requiredTransport, admitted: row.admittedTransport, blocked: row.blockedTransport },
      season: { required: row.requiredSeason, admitted: row.admittedSeason, blocked: row.blockedSeason },
      liveEvidenceReady,
      decision: liveEvidenceReady ? "PROMOTE" : "BLOCK",
      blockers,
    };
  });
  const promotedCountryCodes = decisions.filter((entry) => entry.decision === "PROMOTE").map((entry) => entry.countryCode);
  const blockedCountryCodes = decisions.filter((entry) => entry.decision === "BLOCK").map((entry) => entry.countryCode);
  return {
    schemaVersion: "route-v2-plannable-expansion-batch02-promotion-v1",
    authority: "independently-recomputed-live-production-evidence",
    evaluatedCountryCodes: [...CODES],
    evaluated: decisions.length,
    unaccounted: CODES.length - decisions.length,
    promotedCountryCodes,
    blockedCountryCodes,
    promoted: promotedCountryCodes.length,
    blocked: blockedCountryCodes.length,
    decisions,
    evidence: {
      transport: { required: audit.summary.transport.required, admitted: audit.summary.transport.totalAdmitted, blocked: audit.summary.transport.blocked, unaccounted: audit.summary.transport.unaccounted },
      season: { required: audit.summary.season.required, admitted: audit.summary.season.totalAdmitted, blocked: audit.summary.season.blocked, unaccounted: audit.summary.season.unaccounted },
      evidenceReadyCountryCodes: audit.summary.evidenceReadyCountryCodes,
    },
    production: { countries: repository.listCountries().length, destinations: repository.listCities().length, pois: repository.listPois().length, total: repository.listCountries().length + repository.listCities().length + repository.listPois().length },
    readiness: readiness.expectedCounts,
    accidentalPromotions: 0,
    candidateLeakage: audit.authority.candidateLeakage,
    artifactAuthority: "AUDIT_ONLY",
    performanceClearance: "NOT_CLEARED",
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const report = buildBatch02PromotionModel();
  fs.writeFileSync(OUTPUT, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ status: "PASS", evaluated: report.evaluated, promoted: report.promoted, blocked: report.blocked }, null, 2));
}
