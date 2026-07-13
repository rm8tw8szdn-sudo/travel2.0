import { createEvidenceRepository } from "./evidence-repository.mjs";
import { createEvidenceCoverageReport } from "./evidence-coverage-report.mjs";
import { createWebEvidenceCorroborator } from "./web-evidence-corroborator.mjs";
import { createWebEvidenceExtractor } from "./web-evidence-extractor.mjs";
import { createWebSearchEvidenceProvider } from "./web-search-evidence-provider.mjs";

const DEFAULT_QUERIES = [
  "Kansai rail travel Kyoto Osaka Nara",
  "Shikoku pilgrimage best season",
  "Swiss scenic train route",
  "Norway northern lights season",
  "Croatia island ferry route",
];

function clone(value) {
  return structuredClone(value);
}

function sampleOf(item) {
  return {
    evidenceType: item.evidenceType,
    subject: item.subject?.name || item.subject?.entityId || "",
    relation: item.relation,
    object: item.object?.name || item.object?.entityId || "",
    value: item.value,
    sourceUrl: item.provenance?.sourceUrl || "",
    sourceTitle: item.provenance?.sourceTitle || "",
    snippet: item.provenance?.sourceSnippet || "",
    confidence: item.confidence,
    sourceScore: item.provenance?.sourceScore,
    evidenceHash: item.evidenceHash,
    corroborated: Boolean(item.qualifiers?.corroborated),
  };
}

function countBy(items, key) {
  return items.reduce((bucket, item) => {
    const value = item[key] || "unknown";
    bucket[value] = (bucket[value] || 0) + 1;
    return bucket;
  }, {});
}

function clean(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function unique(values) {
  return [...new Set(values.map(clean).filter(Boolean))];
}

export function expandWebEvidenceQueries(query, { enabled = false, maxVariants = 3 } = {}) {
  const base = clean(query);
  if (!base) return [];
  if (!enabled) return [base];
  return unique([
    base,
    `${base} official tourism`,
    `${base} Wikivoyage`,
  ]).slice(0, Math.max(1, Number(maxVariants) || 1));
}

export function createWebSearchEvidenceRunner({
  evidenceRepository = createEvidenceRepository(),
  provider = createWebSearchEvidenceProvider(),
  extractor = createWebEvidenceExtractor(),
  corroborator = createWebEvidenceCorroborator(),
} = {}) {
  return {
    async run({ mode = "injected", queries = DEFAULT_QUERIES, limit = 10, dryRun = false, queryVariants = false, maxQueryVariants = 3 } = {}) {
      const diagnostics = [];
      const filteredSources = [];
      const extractedEvidence = [];
      const writtenEvidence = [];
      let realSearchVerified = false;
      let fixtureVerified = false;
      const expandedQueries = unique(queries.flatMap((query) => expandWebEvidenceQueries(query, {
        enabled: queryVariants,
        maxVariants: maxQueryVariants,
      })));

      for (const query of expandedQueries) {
        const search = await provider.searchEvidence({ query, limit });
        realSearchVerified = realSearchVerified || Boolean(search.isRealSearch && search.results.length);
        fixtureVerified = fixtureVerified || Boolean(!search.isRealSearch && search.results.length);
        diagnostics.push(...(search.diagnostics || []).map((item) => ({ query, ...item })));
        const extracted = extractor.extract({
          query,
          results: search.results,
          retrievedAt: search.retrievedAt,
        });
        filteredSources.push(...extracted.filteredSources.map((item) => ({ query, ...item })));
        extractedEvidence.push(...extracted.evidence);
      }

      const corroborated = corroborator.corroborate(extractedEvidence);
      for (const item of corroborated.evidence) {
        if (dryRun) {
          writtenEvidence.push(clone(item));
          continue;
        }
        const write = evidenceRepository.upsert(item);
        if (write.accepted) writtenEvidence.push(write.evidence);
        else diagnostics.push({ reason: write.reason, evidenceId: item.evidenceId });
      }

      const sourceMode = realSearchVerified
        ? "real-search"
        : fixtureVerified ? "injected-results" : mode;

      return {
        ok: writtenEvidence.length >= 3,
        dryRun,
        sourceMode,
        realSearchVerified,
        fixtureVerified,
        requiresRealSearchReverification: !realSearchVerified,
        queries: expandedQueries,
        queryStats: {
          base: queries.length,
          executed: expandedQueries.length,
          variantsEnabled: Boolean(queryVariants),
        },
        sourceStats: {
          acceptedForExtraction: extractedEvidence.length,
          filtered: filteredSources.length,
          filteredReasons: countBy(filteredSources, "filterReason"),
        },
        evidenceStats: {
          extracted: extractedEvidence.length,
          written: dryRun ? 0 : writtenEvidence.length,
          wouldWrite: dryRun ? writtenEvidence.length : 0,
          byEvidenceType: countBy(writtenEvidence, "evidenceType"),
          corroborated: writtenEvidence.filter((item) => item.qualifiers?.corroborated).length,
        },
        filteredSources,
        corroborationDiagnostics: corroborated.diagnostics,
        coverageReport: createEvidenceCoverageReport({ evidenceRepository }),
        diagnostics,
        samples: writtenEvidence.slice(0, 3).map(sampleOf),
      };
    },
  };
}

export { DEFAULT_QUERIES as WEB_SEARCH_PHASE2C_QUERIES };
