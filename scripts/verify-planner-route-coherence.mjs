import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  createAcceptedRouteRepository,
  createEvidenceRepository,
  createRouteCompositionPlanner,
} from "../src/lib/routes/index.mjs";

const JP_MIXED_POOL = [
  { wikidataId: "Q1490", countryCode: "JP", name: "东京", sourceTitle: "Tokyo", entityTypeName: "city", latitude: 35.6762, longitude: 139.6503, countryName: "日本" },
  { wikidataId: "Q174691", countryCode: "JP", name: "静冈", sourceTitle: "Shizuoka", entityTypeName: "city", latitude: 34.9756, longitude: 138.3828, countryName: "日本" },
  { wikidataId: "Q169134", countryCode: "JP", name: "奈良", sourceTitle: "Nara", entityTypeName: "city", latitude: 34.6851, longitude: 135.8048, countryName: "日本" },
  { wikidataId: "Q35765", countryCode: "JP", name: "大阪", sourceTitle: "Osaka", entityTypeName: "city", latitude: 34.6937, longitude: 135.5023, countryName: "日本" },
  { wikidataId: "Q200022", countryCode: "JP", name: "松山", sourceTitle: "Matsuyama", entityTypeName: "city", latitude: 33.8392, longitude: 132.7657, countryName: "日本" },
  { wikidataId: "Q199609", countryCode: "JP", name: "大分", sourceTitle: "Oita", entityTypeName: "city", latitude: 33.2396, longitude: 131.6093, countryName: "日本" },
  { wikidataId: "Q146790", countryCode: "JP", name: "青森", sourceTitle: "Aomori", entityTypeName: "city", latitude: 40.8222, longitude: 140.7474, countryName: "日本" },
  { wikidataId: "Q26418", countryCode: "JP", name: "函馆", sourceTitle: "Hakodate", entityTypeName: "city", latitude: 41.7687, longitude: 140.7288, countryName: "日本" },
  { wikidataId: "Q39231", countryCode: "JP", name: "富士山", sourceTitle: "Mount Fuji", entityTypeName: "mountain", latitude: 35.3606, longitude: 138.7274, countryName: "日本" },
  { wikidataId: "anchor:JP:uji", countryCode: "JP", name: "宇治", sourceTitle: "Uji", entityTypeName: "gold-case-anchor", latitude: 34.8845, longitude: 135.7998, countryName: "日本" },
  { wikidataId: "Q34600", countryCode: "JP", name: "京都", sourceTitle: "Kyoto", entityTypeName: "city", latitude: 35.0116, longitude: 135.7681, countryName: "日本" },
];

function makePlanner(llmRefineProvider = null) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "route-coherence-"));
  const acceptedRepository = createAcceptedRouteRepository({ storagePath: path.join(tempDir, "accepted.json") });
  const evidenceRepository = createEvidenceRepository({ storagePath: path.join(tempDir, "evidence.json") });
  const knowledgeGraph = {
    queryDestinations(query) {
      return query.country === "JP" ? JP_MIXED_POOL.slice() : [];
    },
  };
  return createRouteCompositionPlanner({ evidenceRepository, acceptedRepository, knowledgeGraph, llmRefineProvider });
}

const planner = makePlanner();
const result = await planner.buildCandidates({
  limit: 1,
  context: { durationDays: 8, country: "JP", countryName: "日本", travelStyle: "classic-first-trip" },
});
assert.ok(result.accepted.length >= 1, `coherent planner should accept, rejected=${JSON.stringify(result.rejected)}`);
const record = result.accepted[0].record;
const destNames = record.destinationEntities.map((d) => d.name);
const forbidden = ["青森", "函馆", "大分", "松山", "宇治"];
assert.ok(!destNames.some((name) => forbidden.includes(name)), `8-day JP first-trip should not include far-flung cities: ${JSON.stringify(destNames)}`);
assert.deepEqual(destNames, ["东京", "富士山", "京都", "奈良", "大阪"], `JP first-trip anchors should be stable, got ${JSON.stringify(destNames)}`);

const divergentLlm = {
  name: "test-divergent-llm",
  async refine() {
    return {
      orderedDestinations: [
        JP_MIXED_POOL[0],
        JP_MIXED_POOL[6],
        JP_MIXED_POOL[7],
        JP_MIXED_POOL[3],
      ],
      plannerReason: [{ text: "测试用发散路线。", strategy: "Geographic" }],
      confidence: 0.9,
    };
  },
};
const guardedPlanner = makePlanner(divergentLlm);
const guarded = await guardedPlanner.buildCandidates({
  limit: 1,
  context: { durationDays: 8, country: "JP", countryName: "日本", travelStyle: "classic-first-trip" },
});
assert.ok(guarded.accepted.length >= 1, `guarded planner should accept fallback skeleton, rejected=${JSON.stringify(guarded.rejected)}`);
const guardedRecord = guarded.accepted[0].record;
assert.equal(guardedRecord.llmRefine.refined, false, "distance-violating LLM route should be rejected and fallback to deterministic skeleton");
assert.equal(guardedRecord.llmRefine.error, "llm-route-distance-out-of-bounds");
assert.deepEqual(guardedRecord.destinationEntities.map((d) => d.name), ["东京", "富士山", "京都", "奈良", "大阪"]);

const CENTRAL_EUROPE_POOL = {
  AT: [{ wikidataId: "Q1741", countryCode: "AT", name: "维也纳", sourceTitle: "Vienna", entityTypeName: "gold-case-anchor", latitude: 48.2082, longitude: 16.3738 }],
  SK: [{ wikidataId: "anchor:SK:bratislava", countryCode: "SK", name: "布拉迪斯拉发", sourceTitle: "Bratislava", entityTypeName: "gold-case-anchor", latitude: 48.1486, longitude: 17.1077 }],
  HU: [{ wikidataId: "anchor:HU:budapest", countryCode: "HU", name: "布达佩斯", sourceTitle: "Budapest", entityTypeName: "gold-case-anchor", latitude: 47.4979, longitude: 19.0402 }],
  CZ: [{ wikidataId: "anchor:CZ:prague", countryCode: "CZ", name: "布拉格", sourceTitle: "Prague", entityTypeName: "gold-case-anchor", latitude: 50.0755, longitude: 14.4378 }],
};
const multiCountryPlanner = createRouteCompositionPlanner({
  evidenceRepository: createEvidenceRepository({ storagePath: path.join(fs.mkdtempSync(path.join(os.tmpdir(), "route-hopper-")), "evidence.json") }),
  acceptedRepository: createAcceptedRouteRepository({ storagePath: path.join(fs.mkdtempSync(path.join(os.tmpdir(), "route-hopper-")), "accepted.json") }),
  knowledgeGraph: {
    queryDestinations(query) {
      return CENTRAL_EUROPE_POOL[query.country] || [];
    },
  },
});
const hopper = await multiCountryPlanner.buildCandidates({
  limit: 1,
  context: { countries: ["AT", "SK", "HU", "CZ"], country: "AT/SK/HU/CZ", durationDays: 7, travelStyle: "country-hopper" },
});
assert.ok(hopper.accepted.length >= 1, `multi-country hopper should accept, rejected=${JSON.stringify(hopper.rejected)}`);
const hopperRecord = hopper.accepted[0].record;
assert.deepEqual(hopperRecord.countryEntities.map((country) => country.countryCode), ["AT", "SK", "HU", "CZ"]);
assert.equal(hopperRecord.classification, "cross");
assert.equal(hopperRecord.concept.travelStyle, "country-hopper");

console.log("Planner route coherence verified: JP 8-day first-trip stays on core anchors and distance-violating LLM output falls back.");
