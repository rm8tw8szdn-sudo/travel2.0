import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { createAcceptedRouteRepository } from "../src/lib/routes/accepted-repository.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const routesSource = fs.readFileSync(path.join(projectRoot, "routes.js"), "utf8");
const acceptedPath = path.join(projectRoot, ".route-v2-cache", "accepted-routes.json");
const pageSize = 6;

function extractFunction(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert(start >= 0, `${name} must exist in routes.js`);
  const bodyOpen = source.indexOf(") {", start) + 2;
  assert(bodyOpen > start, `${name} must use a normal function declaration`);
  let depth = 0;
  for (let index = bodyOpen; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    else if (source[index] === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  assert.fail(`${name} must have a complete function body`);
}

function loadSummaryRuntime() {
  const functionNames = ["routeSearchText", "uniqueList", "compactPlaceList", "routeDestinations", "routeFeatureIntroV2"];
  const context = {};
  vm.createContext(context);
  vm.runInContext(`${functionNames.map((name) => extractFunction(routesSource, name)).join("\n")}; this.routeFeatureIntroV2 = routeFeatureIntroV2;`, context);
  return context.routeFeatureIntroV2;
}

function consumeStrictFeed(repository, routeType, sessionId) {
  const records = [];
  const pages = [];
  let cursor = null;
  for (let guard = 0; guard < 200; guard += 1) {
    const page = repository.list({ limit: pageSize, cursor, routeType, sessionId });
    pages.push(page);
    records.push(...page.records);
    assert.equal(page.returnedCount, page.records.length);
    assert.equal(page.records.length > 0, true, `${routeType} must not return an empty non-terminal page`);
    if (!page.hasMore) {
      assert.equal(page.nextCursor, null);
      break;
    }
    assert(page.nextCursor, `${routeType} must provide a continuation cursor`);
    cursor = page.nextCursor;
  }
  assert.equal(pages.at(-1)?.hasMore, false, `${routeType} must terminate`);
  assert.equal(new Set(records.map((record) => record.id)).size, records.length, `${routeType} IDs must be unique`);
  return { records, pages };
}

function routeDestinations(record = {}) {
  return [...new Set([
    ...(record.destinations || []),
    ...(record.cities || []),
    ...(record.destinationEntities || []).map((item) => item.name),
  ].map((value) => String(value || "").trim()).filter(Boolean))];
}

function normalizedText(value) {
  return String(value || "")
    .toLocaleLowerCase("zh-CN")
    .replace(/[\s，。；、：:,.!?！？“”"'‘’（）()《》【】\[\]-]+/gu, "");
}

function ngrams(value, size = 3) {
  const text = normalizedText(value);
  if (text.length <= size) return new Set([text]);
  return new Set(Array.from({ length: text.length - size + 1 }, (_, index) => text.slice(index, index + size)));
}

function jaccard(left, right) {
  const a = ngrams(left);
  const b = ngrams(right);
  const intersection = [...a].filter((item) => b.has(item)).length;
  return intersection / new Set([...a, ...b]).size;
}

function balanced(value, open, close) {
  return [...value].filter((character) => character === open).length === [...value].filter((character) => character === close).length;
}

const repository = createAcceptedRouteRepository({ storagePath: acceptedPath });
const cross = consumeStrictFeed(repository, "cross", "route-summary-quality-cross");
const single = consumeStrictFeed(repository, "single", "route-summary-quality-single");
assert.equal(cross.records.length, 357, "the current strict cross feed baseline must remain 357 routes");
assert.equal(single.records.length, 494, "the current strict single-country feed baseline must remain 494 routes");

const routeFeatureIntroV2 = loadSummaryRuntime();
const records = [...cross.records, ...single.records];
const summaries = records.map((record) => ({ record, text: String(routeFeatureIntroV2(record) || "").trim() }));
const invalid = [];
const bannedGeneric = /^(?:探索当地文化与自然风光|感受独特的人文魅力|开启一段难忘旅程|体验经典景点和当地生活)[。！!]?$/u;
const unsupportedClaim = /(?:最佳(?:季节|月份|时间)|绝对可靠|已经?验证|保证直达|百分之百|必去第一)/u;

for (const { record, text } of summaries) {
  const destinations = routeDestinations(record);
  const reasons = [];
  if (!text) reasons.push("empty");
  if (!/[。！？!?]$/u.test(text)) reasons.push("incomplete-sentence");
  if (/(?:undefined|null|\{\{|\}\}|\$\{|TODO|TBD|placeholder)/iu.test(text)) reasons.push("placeholder-token");
  if (bannedGeneric.test(text)) reasons.push("generic-slogan");
  if (unsupportedClaim.test(text)) reasons.push("unsupported-claim");
  if (!balanced(text, "（", "）") || !balanced(text, "(", ")") || !balanced(text, "《", "》")) reasons.push("unbalanced-punctuation");
  if (text.length < 25 || text.length > 80) reasons.push(`length-${text.length}`);
  if (destinations.length && !destinations.some((destination) => text.includes(destination))) reasons.push("route-destination-not-mentioned");
  if (reasons.length) invalid.push({ routeId: record.id, name: record.name, text, reasons });
}

const exactGroups = new Map();
for (const { record, text } of summaries) {
  const key = normalizedText(text);
  if (!exactGroups.has(key)) exactGroups.set(key, { text, routeIds: [] });
  exactGroups.get(key).routeIds.push(record.id);
}
const exactDuplicates = [...exactGroups.values()]
  .filter((group) => group.routeIds.length > 1)
  .sort((left, right) => right.routeIds.length - left.routeIds.length);

const highSimilarityPairs = [];
for (let left = 0; left < summaries.length; left += 1) {
  for (let right = left + 1; right < summaries.length; right += 1) {
    const score = jaccard(summaries[left].text, summaries[right].text);
    if (score >= 0.84) {
      highSimilarityPairs.push({
        leftRouteId: summaries[left].record.id,
        rightRouteId: summaries[right].record.id,
        score: Number(score.toFixed(3)),
      });
    }
  }
}
highSimilarityPairs.sort((left, right) => right.score - left.score
  || left.leftRouteId.localeCompare(right.leftRouteId, "en")
  || left.rightRouteId.localeCompare(right.rightRouteId, "en"));

assert.deepEqual(invalid, [], `route introductions must be complete and grounded:\n${JSON.stringify(invalid.slice(0, 20), null, 2)}`);
assert.deepEqual(exactDuplicates, [], `route introductions must not repeat exactly:\n${JSON.stringify(exactDuplicates.slice(0, 20), null, 2)}`);

console.log(JSON.stringify({
  verifier: "route-v2-route-summary-quality",
  passed: true,
  checkedRoutes: records.length,
  strictCrossRoutes: cross.records.length,
  strictSingleRoutes: single.records.length,
  exactDuplicateGroups: exactDuplicates.length,
  invalidIntroductions: invalid.length,
  highSimilarityPairs: highSimilarityPairs.length,
  highSimilaritySample: highSimilarityPairs.slice(0, 20),
  length: {
    min: Math.min(...summaries.map((item) => item.text.length)),
    median: summaries.map((item) => item.text.length).sort((a, b) => a - b)[Math.floor(summaries.length / 2)],
    max: Math.max(...summaries.map((item) => item.text.length)),
  },
}, null, 2));
