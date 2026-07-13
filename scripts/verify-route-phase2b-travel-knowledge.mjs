import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  createAcceptedRouteKnowledgeExtractor,
  createAcceptedRouteRepository,
  createEvidenceRepository,
  createRouteCompositionPlanner,
  createRouteDesignStrategyRegistry,
} from "../src/lib/routes/index.mjs";

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "route-phase2b-"));
const acceptedRepository = createAcceptedRouteRepository({ storagePath: path.join(tempDir, "accepted.json") });
const knowledgeRepository = createEvidenceRepository({ storagePath: path.join(tempDir, "knowledge.json") });

const coverAsset = {
  provider: "wikivoyage-pageimage",
  assetId: "kansai-cover.jpg",
  sourceUrl: "https://commons.wikimedia.org/wiki/File:Kansai-cover.jpg",
  imageUrl: "https://upload.wikimedia.org/kansai-cover.jpg",
  author: "Wikimedia",
  license: "CC BY-SA",
  width: 1200,
  height: 720,
  discoveredVia: "route-pageimage",
};

function destinationAsset(entityId, name) {
  return {
    provider: "wikimedia-commons",
    assetId: `${entityId}.jpg`,
    sourceUrl: `https://commons.wikimedia.org/wiki/File:${entityId}.jpg`,
    imageUrl: `https://upload.wikimedia.org/${entityId}.jpg`,
    author: "Wikimedia",
    license: "CC BY-SA",
    width: 1200,
    height: 800,
    discoveredVia: "destination-wikipedia-pageimage",
    destinationId: entityId,
    destinationName: name,
  };
}

const kansaiRoute = {
  id: "wikivoyage-kansai-source",
  name: "日本关西古都之旅",
  canonicalTitle: "日本关西古都之旅",
  sourceTitle: "Kansai classic route",
  summary: "串联京都、大阪、奈良与姬路，围绕古都、城堡、铁路交通与春秋季旅行设计。",
  recommendationText: "这条路线用铁路连接关西核心城市，兼顾古都文化、城堡与城市体验。",
  countries: ["日本"],
  countryEntities: [{ wikidataId: "Q17", countryCode: "JP", name: "日本" }],
  destinations: ["京都", "大阪", "奈良", "姬路"],
  destinationEntities: [
    { wikidataId: "Q34600", countryCode: "JP", name: "京都", entityTypeName: "city", latitude: 35.0116, longitude: 135.7681 },
    { wikidataId: "Q35765", countryCode: "JP", name: "大阪", entityTypeName: "city", latitude: 34.6937, longitude: 135.5023 },
    { wikidataId: "Q169134", countryCode: "JP", name: "奈良", entityTypeName: "city", latitude: 34.6851, longitude: 135.8048 },
    { wikidataId: "Q130212", countryCode: "JP", name: "姬路", entityTypeName: "city", latitude: 34.8151, longitude: 134.6853 },
  ],
  recommendedDays: "5-7天",
  durationDays: 6,
  bestMonths: ["3-5月", "10-11月"],
  themes: ["文化旅行", "铁路旅行", "古都"],
  tags: ["文化旅行", "铁路旅行", "古都"],
  highlights: ["京都古都文化", "大阪城市体验", "奈良寺社", "姬路城"],
  coverAsset,
  destinationAssets: [
    destinationAsset("Q34600", "京都"),
    destinationAsset("Q35765", "大阪"),
    destinationAsset("Q169134", "奈良"),
    destinationAsset("Q130212", "姬路"),
  ],
  source: { name: "Wikivoyage", url: "https://en.wikivoyage.org/wiki/Kansai" },
  enrichmentStatus: "mediaReady",
  contentQualityStatus: "accepted",
  classification: "single",
};

assert.equal(acceptedRepository.upsert(kansaiRoute).accepted, true);

assert.equal(knowledgeRepository.upsert({
  evidenceId: "ai:invented",
  evidenceType: "theme-fit",
  subject: { entityId: "Q34600", name: "京都" },
  relation: "has-theme",
  value: "虚构主题",
  provenance: { providerId: "ai-planner", sourceUrl: "https://example.com/ai", extractionMethod: "ai-generated" },
  confidence: 0.9,
  verifiedAt: "2026-06-28T00:00:00.000Z",
  status: "verified",
}).accepted, false, "AI output must not become Travel Knowledge evidence");

const extractor = createAcceptedRouteKnowledgeExtractor();
const extracted = extractor.extract(kansaiRoute);
assert(extracted.every((item) => item.evidenceType), "extractor must output EvidenceRecord v2 candidates");
assert(extracted.every((item) => !item.canonicalTitle && !item.recommendationText && !item.destinationEntities), "extractor must not output RouteRecord-shaped objects");
assert(extracted.some((item) => item.evidenceType === "place-entity"));
assert(extracted.some((item) => item.evidenceType === "destination-level"));
assert(extracted.some((item) => item.evidenceType === "region-cluster"));
assert(extracted.some((item) => item.evidenceType === "transport-connection"));
assert(extracted.some((item) => item.evidenceType === "segment-metric"));
assert(extracted.some((item) => item.evidenceType === "destination-season"));
assert(extracted.some((item) => item.evidenceType === "theme-fit"));
assert(extracted.some((item) => item.evidenceType === "destination-image"));

for (const item of extracted) {
  const write = knowledgeRepository.upsert(item);
  assert.equal(write.accepted, true, JSON.stringify(write));
  assert(write.evidence.verifiedAt);
  assert(write.evidence.provenance?.sourceUrl);
  assert(Number(write.evidence.confidence) > 0);
}

assert.equal(knowledgeRepository.list({ evidenceType: "destination-level" }).length, 4);
assert(knowledgeRepository.list({ subjectId: "Q34600" }).some((item) => item.evidenceType === "theme-fit"));
assert(knowledgeRepository.status().byEvidenceType["transport-connection"] >= 3);
assert(knowledgeRepository.status().byEvidenceType["segment-metric"] >= 3);

const registry = createRouteDesignStrategyRegistry();
assert.equal(typeof registry.get("Regional")?.evaluate, "function");
assert.equal(registry.get("Hub & Stopover").enabled, false);

const context = {
  destinations: kansaiRoute.destinationEntities,
  evidence: knowledgeRepository.list(),
};
assert.equal(registry.evaluate("Transport", context).accepted, true);
assert.equal(registry.evaluate("Regional", context).accepted, true);
assert.equal(registry.evaluate("Hub & Stopover", context).accepted, false);

const planner = createRouteCompositionPlanner({
  evidenceRepository: knowledgeRepository,
  acceptedRepository,
  strategyRegistry: registry,
});
const planned = await planner.buildCandidates({ limit: 1 });
assert.equal(Array.isArray(planned.accepted), true);
assert.equal(Array.isArray(planned.rejected), true);

const discoverySource = fs.readFileSync(path.join(process.cwd(), "travel-collection", "src", "lib", "routes", "discovery.mjs"), "utf8");
const detailSource = fs.readFileSync(path.join(process.cwd(), "travel-collection", "route-detail.js"), "utf8");
const feedSource = fs.readFileSync(path.join(process.cwd(), "travel-collection", "routes.js"), "utf8");
assert.doesNotMatch(discoverySource, /route-design-strategy|knowledge-extractor|route-composition-planner/u);
assert.doesNotMatch(detailSource, /route-design-strategy|knowledge-extractor|route-composition-planner/u);
assert.doesNotMatch(feedSource, /route-design-strategy|knowledge-extractor|route-composition-planner/u);

console.log("Route Phase 2B Travel Knowledge Repository and Strategy Layer verified.");
