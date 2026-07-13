import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  createEvidenceRepository,
  createWebEvidenceExtractor,
  createWebEvidenceCorroborator,
  createWebSearchEvidenceProvider,
  createWebSearchEvidenceRunner,
  expandWebEvidenceQueries,
  generateRoutePhase2cReviewCandidates,
  scoreWebSearchSource,
} from "../src/lib/routes/index.mjs";

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "route-phase2c-"));
const evidenceRepository = createEvidenceRepository({ storagePath: path.join(tempDir, "evidence.json") });
const retrievedAt = "2026-06-29T00:00:00.000Z";

const searchResults = [
  {
    url: "https://www.japan.travel/en/destinations/kansai/",
    title: "Kansai Travel Guide | Japan National Tourism Organization",
    snippet: "Kansai links Kyoto, Osaka and Nara with frequent rail connections and is known for temples, food and historic cities.",
  },
  {
    url: "https://en.wikivoyage.org/wiki/Kansai",
    title: "Kansai - Wikivoyage",
    snippet: "Kansai includes Kyoto, Osaka, Nara and nearby cities; rail travel is the usual way to move between them.",
  },
  {
    url: "https://www.myswissalps.com/travel/train/scenictrains/",
    title: "Swiss scenic trains",
    snippet: "Swiss scenic trains such as the Glacier Express and Bernina Express connect Alpine regions by rail and are popular in summer.",
  },
  {
    url: "https://www.hotel-example.invalid/kansai-discount",
    title: "Cheap hotel deals for Kansai",
    snippet: "Book hotels and airport transfers with limited time discounts.",
  },
  {
    url: "",
    title: "Anonymous travel tips",
    snippet: "Kyoto Osaka Nara itinerary copied from forums.",
  },
];

const provider = createWebSearchEvidenceProvider({
  mode: "injected",
  injectedResults: { "Kansai rail travel Kyoto Osaka Nara": searchResults },
  now: () => retrievedAt,
});

assert.equal(provider.capabilities.evidenceSource, true);
assert.equal(provider.capabilities.producesRouteRecord, false);
assert.equal(provider.capabilities.realtimeUserRequest, false);

const injected = await provider.searchEvidence({ query: "Kansai rail travel Kyoto Osaka Nara", limit: 10 });
assert.equal(injected.mode, "injected");
assert.equal(injected.isRealSearch, false);
assert.equal(injected.results.length, searchResults.length);
assert(!injected.results.some((item) => item.routeId || item.destinations), "Web search provider must not return RouteRecord-shaped results");

const realSearchCalls = [];
const realProvider = createWebSearchEvidenceProvider({
  mode: "real-search",
  apiKey: "test-key",
  now: () => retrievedAt,
  fetchImpl: async (url, options) => {
    realSearchCalls.push({ url: String(url), options });
    return {
      ok: true,
      async json() {
        return {
          results: [
            {
              url: "https://www.japan.travel/en/destinations/kansai/",
              title: "Kansai Travel Guide",
              content: `Kansai links Kyoto, Osaka and Nara by frequent rail connections. ${"Long source text. ".repeat(80)}`,
            },
          ],
        };
      },
    };
  },
});
const realSearch = await realProvider.searchEvidence({ query: "Kansai rail travel Kyoto Osaka Nara", limit: 3 });
assert.equal(realSearch.mode, "real-search");
assert.equal(realSearch.isRealSearch, true);
assert.equal(realSearch.results.length, 1);
assert.equal(realSearch.results[0].sourceSnippet.includes("frequent rail"), true);
assert(realSearch.results[0].sourceSnippet.length <= 600);
assert.equal(realSearchCalls.length, 1);
assert.equal(realSearchCalls[0].url, "https://api.tavily.com/search");
assert.equal(realSearchCalls[0].options.method, "POST");
assert.equal(realSearchCalls[0].options.headers.Authorization, "Bearer test-key");
assert.equal(JSON.parse(realSearchCalls[0].options.body).query, "Kansai rail travel Kyoto Osaka Nara");
assert.equal(JSON.parse(realSearchCalls[0].options.body).max_results, 3);

const officialScore = scoreWebSearchSource(searchResults[0]);
const hotelScore = scoreWebSearchSource(searchResults[3]);
assert.equal(officialScore.acceptedForExtraction, true);
assert.equal(hotelScore.acceptedForExtraction, false);
assert.equal(hotelScore.filterReason, "commercial-or-booking-source");

const extractor = createWebEvidenceExtractor({ now: () => retrievedAt });
const extracted = extractor.extract({
  query: "Kansai rail travel Kyoto Osaka Nara",
  results: injected.results,
});
assert(extracted.evidence.length >= 3, "Injected sample should extract at least three evidence records");
assert(extracted.filteredSources.some((item) => item.filterReason === "commercial-or-booking-source"));
assert(extracted.evidence.every((item) => item.provenance?.sourceUrl));
assert(extracted.evidence.every((item) => item.provenance?.sourceTitle));
assert(extracted.evidence.every((item) => item.provenance?.sourceSnippet));
assert(extracted.evidence.every((item) => item.provenance.sourceSnippet.length <= 600));
assert(extracted.evidence.every((item) => item.retrievedAt));
assert(extracted.evidence.every((item) => item.evidenceHash));
assert(extracted.evidence.every((item) => Number(item.confidence) > 0));
assert(extracted.evidence.every((item) => Number(item.provenance.sourceScore) > 0));

const corroborator = createWebEvidenceCorroborator();
const corroborated = corroborator.corroborate(extracted.evidence);
assert(corroborated.evidence.some((item) => item.qualifiers?.corroborated === true), "Repeated source facts should be corroborated");
assert(extracted.evidence
  .filter((item) => item.evidenceType === "transport-connection" && item.subject?.name === "Kyoto" && item.object?.name === "Osaka")
  .some((item) => item.value.includes("rail")), "Rail evidence must not be downgraded to road just because a rail page mentions bus routes");

const metricExtracted = extractor.extract({
  query: "Kyoto Osaka train distance time",
  results: [{
    sourceUrl: "https://example.test/kyoto-osaka-train",
    sourceTitle: "Kyoto to Osaka Trains | Distance, Timetable & Tickets",
    sourceSnippet: "This route connects Kyoto and Osaka by train; the distance is about 43 km and the fastest trains take around 15 minutes.",
    rank: 1,
  }],
  retrievedAt,
});
const metric = metricExtracted.evidence.find((item) => item.evidenceType === "segment-metric");
const metricCluster = metricExtracted.evidence.find((item) => item.evidenceType === "region-cluster");
assert(metric, "Distance/time snippets should produce segment-metric evidence");
assert.equal(metric.subject.name, "Kyoto");
assert.equal(metric.object.name, "Osaka");
assert.equal(metric.value.distanceKm, 43);
assert.equal(metric.value.durationMinutes, 15);
assert.deepEqual(metricCluster.value, ["Kyoto", "Osaka"]);

const runner = createWebSearchEvidenceRunner({
  evidenceRepository,
  provider,
  extractor,
  corroborator,
});
const report = await runner.run({
  mode: "injected",
  queries: ["Kansai rail travel Kyoto Osaka Nara"],
  limit: 10,
});
assert.equal(report.realSearchVerified, false);
assert.equal(report.fixtureVerified, true);
assert(report.samples.length >= 3, "Phase 2C report must include at least three evidence samples");
assert(report.coverageReport.totalEvidence >= 3);
assert(report.coverageReport.topMissingEvidence.some((item) => item.evidence === "segment-metric"));
assert(report.coverageReport.sourceDistribution["web-search"] >= 3);
for (const sample of report.samples.slice(0, 3)) {
  assert(sample.evidenceType);
  assert(sample.subject);
  assert(sample.relation);
  assert(sample.sourceUrl);
  assert(sample.sourceTitle);
  assert(sample.snippet);
  assert(Number(sample.confidence) > 0);
  assert(Number(sample.sourceScore) > 0);
  assert(sample.evidenceHash);
  assert.equal(typeof sample.corroborated, "boolean");
}

assert.deepEqual(
  expandWebEvidenceQueries("Kansai rail travel Kyoto Osaka Nara", { enabled: true, maxVariants: 3 }),
  [
    "Kansai rail travel Kyoto Osaka Nara",
    "Kansai rail travel Kyoto Osaka Nara official tourism",
    "Kansai rail travel Kyoto Osaka Nara Wikivoyage",
  ],
);

const variantProvider = createWebSearchEvidenceProvider({
  mode: "injected",
  injectedResults: {
    "Kansai rail travel Kyoto Osaka Nara": [searchResults[0]],
    "Kansai rail travel Kyoto Osaka Nara official tourism": [searchResults[0]],
    "Kansai rail travel Kyoto Osaka Nara Wikivoyage": [searchResults[1]],
  },
  now: () => retrievedAt,
});
const variantReport = await createWebSearchEvidenceRunner({
  evidenceRepository,
  provider: variantProvider,
  extractor,
  corroborator,
}).run({
  mode: "injected",
  queries: ["Kansai rail travel Kyoto Osaka Nara"],
  limit: 10,
  dryRun: true,
  queryVariants: true,
});
assert.equal(variantReport.queryStats.executed, 3);
assert.equal(variantReport.evidenceStats.written, 0);
assert(variantReport.evidenceStats.wouldWrite >= 3);
assert(variantReport.evidenceStats.corroborated >= 1);

assert(evidenceRepository.status().total >= 3);
assert.equal(evidenceRepository.upsert({
  evidenceId: "web:missing-hash",
  evidenceType: "theme-fit",
  subject: { name: "Kyoto" },
  relation: "has-theme",
  value: "temples",
  provenance: {
    providerId: "web-search",
    sourceUrl: "https://www.japan.travel/en/destinations/kansai/",
    sourceTitle: "Kansai",
    sourceSnippet: "Kyoto temples",
    extractionMethod: "web-search-snippet",
  },
  confidence: 0.8,
  verifiedAt: retrievedAt,
  status: "verified",
}).accepted, false, "Web evidence without evidenceHash must be rejected");

const candidates = generateRoutePhase2cReviewCandidates({
  evidenceRepository,
  limit: 100,
});
assert(candidates.generatedCount <= 100);
assert.equal(candidates.writesAcceptedRepository, false);
assert(candidates.records.every((item) => item.reviewStatus !== "accepted"));
assert(candidates.records.every((item) => item.sourceType === "evidence-composed-candidate"));

const discoverySource = fs.readFileSync(path.join(process.cwd(), "travel-collection", "src", "lib", "routes", "discovery.mjs"), "utf8");
const detailSource = fs.readFileSync(path.join(process.cwd(), "travel-collection", "route-detail.js"), "utf8");
const feedSource = fs.readFileSync(path.join(process.cwd(), "travel-collection", "routes.js"), "utf8");
assert.doesNotMatch(discoverySource, /web-search-evidence|web-evidence|phase2c-review/u);
assert.doesNotMatch(detailSource, /web-search-evidence|web-evidence|phase2c-review/u);
assert.doesNotMatch(feedSource, /web-search-evidence|web-evidence|phase2c-review/u);

console.log("Route Phase 2C Web Search Evidence Provider verified.");
