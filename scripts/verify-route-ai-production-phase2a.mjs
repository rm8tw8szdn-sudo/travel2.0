import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  createAcceptedRouteRepository,
  createEvidenceRepository,
  createRouteCompositionPlanner,
  validateCompositionRecord,
} from "../src/lib/routes/index.mjs";

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "route-phase2a-"));
const acceptedRepository = createAcceptedRouteRepository({ storagePath: path.join(tempDir, "accepted.json") });
const evidenceRepository = createEvidenceRepository({ storagePath: path.join(tempDir, "evidence.json") });

const coverAsset = {
  provider: "wikivoyage-pageimage",
  assetId: "shikoku-cover.jpg",
  sourceUrl: "https://commons.wikimedia.org/wiki/File:Shikoku-cover.jpg",
  imageUrl: "https://upload.wikimedia.org/shikoku-cover.jpg",
  author: "Wikimedia",
  license: "CC BY-SA",
  width: 1200,
  height: 720,
  discoveredVia: "route-pageimage",
};
const destinationAssets = ["德岛", "高知", "爱媛", "香川"].map((name, index) => ({
  provider: "wikimedia-commons",
  assetId: `shikoku-${index}.jpg`,
  sourceUrl: `https://commons.wikimedia.org/wiki/File:shikoku-${index}.jpg`,
  imageUrl: `https://upload.wikimedia.org/shikoku-${index}.jpg`,
  author: "Wikimedia",
  license: "CC BY-SA",
  width: 1200,
  height: 800,
  discoveredVia: "destination-wikipedia-pageimage",
  destinationId: `Q${index + 10}`,
  destinationName: name,
}));
const sourceRoute = {
  id: "wikivoyage-shikoku-source",
  name: "四国八十八寺遍路",
  canonicalTitle: "四国八十八寺遍路",
  sourceTitle: "88 Temple Pilgrimage",
  summary: "沿日本四国岛巡访88座寺院，串联德岛、高知、爱媛与香川，结合朝圣文化、徒步与乡村风景。",
  recommendationText: "日本最具代表性的巡礼路线之一，可完整体验四国寺院文化与沿途聚落。",
  countries: ["日本"],
  countryEntities: [{ wikidataId: "Q17", countryCode: "JP", name: "日本" }],
  destinations: ["德岛", "高知", "爱媛", "香川"],
  destinationEntities: [
    { wikidataId: "Q10", countryCode: "JP", name: "德岛", latitude: 34.0658, longitude: 134.5594 },
    { wikidataId: "Q11", countryCode: "JP", name: "高知", latitude: 33.5597, longitude: 133.5311 },
    { wikidataId: "Q12", countryCode: "JP", name: "爱媛", latitude: 33.8416, longitude: 132.7661 },
    { wikidataId: "Q13", countryCode: "JP", name: "香川", latitude: 34.3401, longitude: 134.0434 },
  ],
  recommendedDays: "40-60天",
  durationDays: 50,
  bestMonths: ["3-5月", "10-11月"],
  themes: ["寺庙巡礼", "文化旅行", "徒步"],
  tags: ["寺庙巡礼", "文化旅行", "徒步"],
  highlights: ["巡访四国88座寺院", "串联四国四县", "体验遍路文化与乡村风景"],
  coverAsset,
  destinationAssets,
  source: { name: "Wikivoyage", url: "https://en.wikivoyage.org/wiki/88_Temple_Pilgrimage" },
  enrichmentStatus: "mediaReady",
  contentQualityStatus: "accepted",
  classification: "single",
};

assert.equal(acceptedRepository.upsert(sourceRoute).accepted, true);
const secondSourceRoute = {
  ...sourceRoute,
  id: "wikivoyage-shikoku-rail-source",
  name: "四国铁路文化慢旅行",
  canonicalTitle: "四国铁路文化慢旅行",
  sourceTitle: "Shikoku rail travel",
  summary: "沿四国铁路与地方交通串联松山、高松、宇和岛和德岛，结合城市街区、温泉和海岸风景。",
  recommendationText: "这条路线用铁路和地方交通连接四国主要城市，减少折返并保留慢旅行节奏。",
  destinationEntities: [
    { wikidataId: "Q20", countryCode: "JP", name: "松山", latitude: 33.8392, longitude: 132.7657 },
    { wikidataId: "Q21", countryCode: "JP", name: "高松", latitude: 34.3428, longitude: 134.0466 },
    { wikidataId: "Q22", countryCode: "JP", name: "宇和岛", latitude: 33.2232, longitude: 132.5606 },
    { wikidataId: "Q10", countryCode: "JP", name: "德岛", latitude: 34.0658, longitude: 134.5594 },
  ],
  destinations: ["松山", "高松", "宇和岛", "德岛"],
  recommendedDays: "7-10天",
  durationDays: 8,
  themes: ["铁路旅行", "文化旅行", "温泉"],
  tags: ["铁路旅行", "文化旅行", "温泉"],
  highlights: ["铁路连接四国城市", "体验松山温泉", "串联高松与德岛"],
  coverAsset: { ...coverAsset, assetId: "shikoku-rail-cover.jpg", sourceUrl: "https://commons.wikimedia.org/wiki/File:Shikoku-rail-cover.jpg", imageUrl: "https://upload.wikimedia.org/shikoku-rail-cover.jpg" },
  destinationAssets: ["松山", "高松", "宇和岛", "德岛"].map((name, index) => ({
    ...destinationAssets[index % destinationAssets.length],
    assetId: `shikoku-rail-${index}.jpg`,
    sourceUrl: `https://commons.wikimedia.org/wiki/File:shikoku-rail-${index}.jpg`,
    imageUrl: `https://upload.wikimedia.org/shikoku-rail-${index}.jpg`,
    destinationId: ["Q20", "Q21", "Q22", "Q10"][index],
    destinationName: name,
  })),
  source: { name: "Wikivoyage", url: "https://en.wikivoyage.org/wiki/Shikoku" },
};
assert.equal(acceptedRepository.upsert(secondSourceRoute).accepted, true);
assert.equal(acceptedRepository.get(sourceRoute.id).sourceType, "source-original", "legacy records default to source-original");
assert.equal(evidenceRepository.upsert({ id: "bad", kind: "theme", name: "未验证", verified: false }).accepted, false);
const evidence = evidenceRepository.ingestRouteRecord(acceptedRepository.get(sourceRoute.id));
evidenceRepository.ingestRouteRecord(acceptedRepository.get(secondSourceRoute.id));
assert.equal(evidenceRepository.upsert({
  id: "route-segment:q13:q20:verified-shikoku-link",
  kind: "route-segment",
  name: "香川 → 松山",
  fromEntityId: "Q13",
  fromName: "香川",
  toEntityId: "Q20",
  toName: "松山",
  transportModes: ["铁路"],
  distanceKm: 144,
  durationHours: 2.5,
  provider: "Wikivoyage",
  sourceUrl: "https://en.wikivoyage.org/wiki/Shikoku",
  sourceRouteId: "wikivoyage-shikoku-source",
  verified: true,
}).accepted, true);
assert(evidence.some((item) => item.kind === "country" && item.countryCode === "JP"));
assert(evidence.some((item) => item.kind === "destination" && item.entityId === "Q10"));
assert(evidence.some((item) => item.kind === "transport" && item.name === "徒步"));
assert(evidenceRepository.status().images >= 5);

const planner = createRouteCompositionPlanner({ evidenceRepository, acceptedRepository });
const planned = await planner.buildCandidates({ limit: 2 });
assert.equal(planned.accepted.length, 1, JSON.stringify(planned.rejected, null, 2));
const candidate = planned.accepted[0].record;
assert.equal(candidate.sourceType, "evidence-composed");
assert(candidate.designStrategies.includes("Geographic"));
assert(candidate.designStrategies.includes("Theme"));
assert(candidate.designStrategies.includes("Season"));
assert(candidate.designStrategies.includes("Transport"));
assert(candidate.designStrategies.includes("Depth"));
assert(candidate.designStrategies.includes("Efficiency"));
assert(candidate.provenance.evidence.some((item) => item.kind === "route-segment"), "composed route must carry adjacent route-segment evidence");
assert.equal(validateCompositionRecord(candidate).accepted, true);
assert.equal(validateCompositionRecord({
  ...candidate,
  provenance: {
    ...candidate.provenance,
    evidence: candidate.provenance.evidence.filter((item) => item.kind !== "route-segment"),
  },
}).reasons.includes("transport-segment-unverified"), true);
assert.equal(validateCompositionRecord({ ...candidate, plannerReason: [] }).reasons.includes("missing-planner-reason"), true);
assert.equal(validateCompositionRecord({
  ...candidate,
  designStrategies: ["Budget"],
  provenance: { ...candidate.provenance, strategyEvidence: [{ strategy: "Budget", evidenceIds: [candidate.provenance.evidence[0].evidenceId] }] },
}).reasons.includes("unsupported-phase2a-strategy"), true);
assert.equal(validateCompositionRecord({
  ...candidate,
  plannerReason: [{ text: "没有证据的原因", strategy: "Theme", evidenceIds: ["missing"] }],
}).reasons.includes("planner-reason-unknown-evidence"), true);

const write = acceptedRepository.upsert(candidate);
assert.equal(write.accepted, true);
assert.equal(write.record.sourceType, "evidence-composed");
assert(write.record.compositionScore.evidenceCompleteness >= 0.75);

const discoverySource = fs.readFileSync(path.join(process.cwd(), "travel-collection", "src", "lib", "routes", "discovery.mjs"), "utf8");
assert.doesNotMatch(discoverySource, /composition-planner|RouteCompositionPlanner|ai-composition/u, "User request discovery must not import Planner");

console.log("Route Phase 2A Evidence Repository and Verified AI Planner verified.");
