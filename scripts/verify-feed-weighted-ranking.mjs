import assert from "node:assert/strict";
import { createAcceptedRouteRepository } from "../src/lib/routes/index.mjs";

const coverAsset = {
  provider: "wikimedia-commons",
  assetId: "cover.jpg",
  sourceUrl: "https://commons.wikimedia.org/wiki/File:cover.jpg",
  imageUrl: "https://upload.wikimedia.org/cover.jpg",
  author: "Author",
  license: "CC BY-SA 4.0",
  width: 1200,
  height: 720,
  discoveredVia: "route-pageimage",
};

function route({
  id,
  name,
  countryCode = "JP",
  sourceType = "source-original",
  qualityScore = 0,
  acceptedAt = "2026-06-30T00:00:00.000Z",
  enrichmentStatus = "mediaReady",
} = {}) {
  const destinations = [
    { wikidataId: `${id}-1`, name: `${name}一`, countryCode },
    { wikidataId: `${id}-2`, name: `${name}二`, countryCode },
    { wikidataId: `${id}-3`, name: `${name}三`, countryCode },
  ];
  return {
    id,
    name,
    canonicalTitle: name,
    sourceTitle: `${id} source`,
    summary: `${name}串联城市文化、自然景观和地方体验，形成节奏清晰的成熟旅行路线。`,
    recommendationText: `${name}适合希望一次完成核心体验的旅行者，移动顺序稳定且停留节奏均衡。`,
    countryEntities: [{ wikidataId: `country-${countryCode}`, countryCode, name: `${name}国` }],
    destinationEntities: destinations,
    countries: [`${name}国`],
    destinations: destinations.map((item) => item.name),
    recommendedDays: "8天",
    durationDays: 8,
    bestMonths: ["4月", "10月"],
    themes: ["文化旅行"],
    tags: ["路线产品"],
    highlights: [`${name}城市漫游`, `${name}自然景观`, `${name}地方文化`],
    coverAsset,
    source: { name: "Planner", url: `https://example.com/route/${id}` },
    enrichmentStatus,
    contentQualityStatus: "accepted",
    classification: "single",
    sourceType,
    qualityScore,
    acceptedAt,
  };
}

{
  const repo = createAcceptedRouteRepository();
  assert.equal(repo.upsert(route({
    id: "older-high-quality",
    name: "高分经典路线",
    sourceType: "source-original",
    qualityScore: 0.92,
    acceptedAt: "2026-01-01T00:00:00.000Z",
  })).accepted, true);
  assert.equal(repo.upsert(route({
    id: "newer-low-quality",
    name: "低分新鲜路线",
    countryCode: "IT",
    sourceType: "planner-designed",
    qualityScore: 0.2,
    acceptedAt: "2026-02-01T00:00:00.000Z",
  })).accepted, true);
  assert.deepEqual(
    repo.list({ limit: 2 }).records.map((record) => record.id),
    ["older-high-quality", "newer-low-quality"],
    "qualityScore desc should outrank recency and source type",
  );
}

{
  const repo = createAcceptedRouteRepository();
  assert.equal(repo.upsert(route({
    id: "source-tie",
    name: "同分来源路线",
    countryCode: "FR",
    sourceType: "source-original",
    qualityScore: 0.7,
    acceptedAt: "2026-03-01T00:00:00.000Z",
  })).accepted, true);
  assert.equal(repo.upsert(route({
    id: "planner-tie",
    name: "同分规划路线",
    countryCode: "CH",
    sourceType: "planner-designed",
    qualityScore: 0.7,
    acceptedAt: "2026-02-01T00:00:00.000Z",
  })).accepted, true);
  assert.deepEqual(
    repo.list({ limit: 2 }).records.map((record) => record.id),
    ["planner-tie", "source-tie"],
    "planner-designed should outrank source-original when quality and media rank tie",
  );
}

{
  const repo = createAcceptedRouteRepository();
  for (const item of [
    ["anchor", "分页锚点路线", "JP", 1.0],
    ["second", "分页第二路线", "IT", 0.8],
    ["third", "分页第三路线", "FR", 0.7],
  ]) {
    assert.equal(repo.upsert(route({
      id: item[0],
      name: item[1],
      countryCode: item[2],
      qualityScore: item[3],
      acceptedAt: "2026-01-01T00:00:00.000Z",
    })).accepted, true);
  }
  const page1 = repo.list({ limit: 1 });
  assert.equal(page1.records[0].id, "anchor");
  assert.ok(page1.nextCursor, "page 1 should return a cursor");
  assert.equal(repo.upsert(route({
    id: "inserted-top",
    name: "插入顶部路线",
    countryCode: "GB",
    qualityScore: 1.1,
    acceptedAt: "2026-04-01T00:00:00.000Z",
  })).accepted, true);
  assert.equal(
    repo.list({ limit: 1, cursor: page1.nextCursor }).records[0].id,
    "second",
    "cursor should continue after the original anchor even when a better route is inserted",
  );
  assert.equal(repo.list({ limit: 1 }).records[0].id, "inserted-top", "refresh should show the inserted better route");
}

console.log("Feed weighted ranking verified.");
