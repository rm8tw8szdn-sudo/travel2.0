import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createAcceptedRouteRepository } from "../src/lib/routes/accepted-repository.mjs";

function route() {
  return {
    id: "concurrent-japan", name: "日本城市文化漫游",
    summary: "东京京都大阪串联城市文化与街区风景。",
    recommendationText: "沿铁路探索不同城市的历史建筑和当地生活。",
    countryEntities: [{ name: "日本", countryCode: "JP" }],
    destinationEntities: [
      { name: "东京", wikidataId: "Q1490", countryCode: "JP" },
      { name: "京都", wikidataId: "Q34600", countryCode: "JP" },
      { name: "大阪", wikidataId: "Q35765", countryCode: "JP" },
    ],
    countries: ["日本"], destinations: ["东京", "京都", "大阪"],
    recommendedDays: "7天", bestMonths: ["5月"], highlights: ["建筑", "文化", "美食"],
    coverAsset: {
      provider: "test", assetId: "concurrent-cover",
      sourceUrl: "https://example.test/source", imageUrl: "https://upload.wikimedia.org/concurrent.jpg",
    },
    contentQualityStatus: "accepted", sourceType: "source-original",
  };
}

test("file-backed repository instances preserve each other's mutations", () => {
  const temporaryRoot = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), "accepted-concurrency-"));
  try {
    const storagePath = path.join(temporaryRoot, "accepted.json");
    const first = createAcceptedRouteRepository({ storagePath });
    assert.equal(first.upsert(route()).accepted, true);
    const second = createAcceptedRouteRepository({ storagePath });

    first.mark("concurrent-japan", { summary: "第一位写入者保存的新摘要。" });
    second.mark("concurrent-japan", { recommendationText: "第二位写入者保存的新说明。" });

    const reloaded = createAcceptedRouteRepository({ storagePath }).get("concurrent-japan");
    assert.equal(reloaded.summary, "第一位写入者保存的新摘要。");
    assert.equal(reloaded.recommendationText, "第二位写入者保存的新说明。");
    assert.equal(fs.existsSync(`${storagePath}.lock`), false);
  } finally {
    const target = fs.realpathSync(temporaryRoot);
    assert.equal(path.dirname(target), fs.realpathSync(os.tmpdir()));
    fs.rmSync(target, { recursive: true, force: true });
  }
});
