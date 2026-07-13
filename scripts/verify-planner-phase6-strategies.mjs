import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  createRouteJobStore,
  runRouteRepositoryWarmup,
} from "../src/lib/routes/index.mjs";

const stubTextEnrichmentProvider = {
  providerId: "stub-text",
  capabilities: { textEnrichment: true, configured: true },
  async enrich(record) { return record; },
};

const SPARQL_POOL = {
  results: {
    bindings: [
      { place: { value: "http://www.wikidata.org/entity/Q1490" }, zh: { value: "东京" }, en: { value: "Tokyo" }, typeLabel: { value: "city" }, coord: { value: "Point(139.6503 35.6762)" } },
      { place: { value: "http://www.wikidata.org/entity/Q39231" }, zh: { value: "富士山" }, en: { value: "Mount Fuji" }, typeLabel: { value: "mountain" }, coord: { value: "Point(138.7274 35.3606)" } },
      { place: { value: "http://www.wikidata.org/entity/Q34600" }, zh: { value: "京都" }, en: { value: "Kyoto" }, typeLabel: { value: "city" }, coord: { value: "Point(135.7681 35.0116)" } },
      { place: { value: "http://www.wikidata.org/entity/Q169134" }, zh: { value: "奈良" }, en: { value: "Nara" }, typeLabel: { value: "city" }, coord: { value: "Point(135.8048 34.6851)" } },
      { place: { value: "http://www.wikidata.org/entity/Q35765" }, zh: { value: "大阪" }, en: { value: "Osaka" }, typeLabel: { value: "city" }, coord: { value: "Point(135.5023 34.6937)" } },
    ],
  },
};

function commonsCoverPage(title) {
  return {
    title: `File:${title}`,
    imageinfo: [{
      url: "https://upload.wikimedia.org/wikipedia/commons/a/aa/Tokyo_Skyline.jpg",
      descriptionurl: "https://commons.wikimedia.org/wiki/File:Tokyo_Skyline.jpg",
      thumburl: "https://upload.wikimedia.org/wikipedia/commons/thumb/a/aa/Tokyo_Skyline.jpg/1400px-Tokyo_Skyline.jpg",
      thumbwidth: 1400,
      thumbheight: 788,
      width: 4000,
      height: 2250,
      extmetadata: {
        Artist: { value: "TestAuthor" },
        LicenseShortName: { value: "CC BY-SA 4.0" },
        DateTimeOriginal: { value: "2024-01-01" },
      },
    }],
  };
}

async function mockFetch(url) {
  const u = String(url);
  if (u.startsWith("https://query.wikidata.org/sparql")) {
    return { ok: true, status: 200, json: async () => SPARQL_POOL, headers: new Map() };
  }
  if (u.includes("action=query") && u.includes("prop=pageimages")) {
    return { ok: true, status: 200, json: async () => ({ query: { pages: [{ pageimage: "Tokyo_Skyline.jpg" }] } }), headers: new Map() };
  }
  if (u.includes("action=query") && u.includes("prop=imageinfo")) {
    return { ok: true, status: 200, json: async () => ({ query: { pages: [commonsCoverPage("Tokyo_Skyline.jpg")] } }), headers: new Map() };
  }
  return { ok: true, status: 200, json: async () => ({ query: { pages: [] } }), headers: new Map() };
}

async function runStrategy(strategyId, options = {}) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), `route-phase6-${strategyId}-`));
  const report = await runRouteRepositoryWarmup({
    env: { ROUTE_TEXT_ENRICHMENT_PROVIDER: "stub", ROUTE_WARMUP_DELAY_MS: "0", ...(options.env || {}) },
    textEnrichmentProvider: stubTextEnrichmentProvider,
    storagePath: path.join(tempDir, "accepted.json"),
    evidenceStoragePath: path.join(tempDir, "evidence.json"),
    syncStatePath: path.join(tempDir, "sync.json"),
    knowledgeGraphPoolPath: path.join(tempDir, "kg.json"),
    batchSize: 0,
    plannerEnabled: true,
    plannerBatchSize: options.plannerBatchSize || 3,
    plannerDeadlineMs: 60_000,
    plannerCountries: options.plannerCountries || ["JP", "IT", "GB", "FR", "GR"],
    plannerStrategy: strategyId,
    plannerJobStore: options.plannerJobStore || null,
    plannerSignals: options.plannerSignals || {},
    fetchImpl: mockFetch,
    now: () => new Date(options.now || "2026-06-30T00:00:00Z"),
  });
  assert.ok(report.ok, `${strategyId} warmup should be ok`);
  assert.equal(report.plannerPhase.strategyId, strategyId, `${strategyId} should be registered`);
  assert.ok(report.plannerPhase.contexts.length >= 1, `${strategyId} should produce contexts`);
  return report.plannerPhase;
}

const coverage = await runStrategy("coverage-matrix", { plannerCountries: ["JP", "IT"] });
assert.equal(coverage.contexts[0].country, "JP", "coverage-matrix should pick an uncovered viable gold-case country");

const jobStore = createRouteJobStore();
jobStore.enqueue({ query: "日本 deep-dive route missing" });
const searchMiss = await runStrategy("search-miss", { plannerCountries: ["JP", "IT"], plannerJobStore: jobStore });
assert.equal(searchMiss.contexts[0].country, "JP", "search-miss should use queued query country signal");

const operator = await runStrategy("operator", {
  plannerCountries: ["JP", "IT"],
  plannerSignals: { operatorCountries: ["IT", "JP"] },
});
assert.equal(operator.contexts[0].country, "IT", "operator should preserve operator country priority");

const seasonal = await runStrategy("seasonal", { plannerCountries: ["JP", "GB"], now: "2026-11-15T00:00:00Z" });
assert.equal(seasonal.contexts[0].travelStyle, "seasonal", "seasonal should prioritize matching seasonal gold cases");

const popular = await runStrategy("popular", { plannerCountries: ["JP", "IT", "GB"] });
assert.equal(popular.contexts[0].country, "JP", "popular should order by built-in popular country weights");

const newest = await runStrategy("newest", { plannerCountries: ["JP", "IT"] });
assert.ok(["JP", "IT"].includes(newest.contexts[0].country), "newest should select a viable country context");

console.log(`Phase 6 strategies verified: ${["coverage-matrix", "search-miss", "operator", "seasonal", "popular", "newest"].join(", ")}.`);
