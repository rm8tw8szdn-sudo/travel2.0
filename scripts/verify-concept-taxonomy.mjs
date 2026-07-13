// Phase 2a 回归：route-planning-concept.mjs 支持全部 10 个 Travel Style
// 运行：node scripts/verify-concept-taxonomy.mjs
import assert from "node:assert/strict";
import {
  buildRouteConcept, validateRouteConcept,
  TRAVEL_STYLE_KEYS, TRAVEL_STYLE_LABEL,
} from "../src/lib/routes/route-planning-concept.mjs";

// ─── 1. 枚举完整：10 个 spec style + transport-journey 兜底 ─────────
const SPEC_KEYS = [
  "classic-first-trip", "deep-dive", "country-hopper",
  "rail-journey", "road-trip", "seasonal", "theme",
  "island-hopping", "pilgrimage", "city-break",
];
for (const k of SPEC_KEYS) assert.ok(TRAVEL_STYLE_KEYS.includes(k), `concept enum missing ${k}`);
for (const k of SPEC_KEYS) assert.ok(TRAVEL_STYLE_LABEL[k], `missing label for ${k}`);

// ─── 2. 每个 style 都能被某个 context 检出 ─────────────────────────
const CASES = [
  {
    style: "city-break",
    ctx: { countries: ["英国"], destinations: ["伦敦"], designStrategies: [] },
  },
  {
    style: "pilgrimage",
    ctx: { countries: ["日本"], destinations: ["德岛","高松","松山","高知"], themes: ["四国遍路朝圣"], designStrategies: ["Theme"] },
  },
  {
    style: "theme",
    ctx: { countries: ["法国"], destinations: ["波尔多","圣埃美隆","阿卡雄","玛歌"], themes: ["葡萄酒酒庄游"], designStrategies: ["Theme"] },
  },
  {
    style: "seasonal",
    ctx: { countries: ["日本"], destinations: ["京都","岚山","高野山"], themes: ["红叶"], bestMonths: ["11月红叶"], designStrategies: ["Season"] },
  },
  {
    style: "island-hopping",
    ctx: {
      countries: ["希腊"], destinations: ["雅典","米科诺斯","圣托里尼","纳克索斯"],
      transportConnections: [{ from: "雅典", to: "米科诺斯", modes: ["ferry"] }],
      themes: ["海岛跳岛"], designStrategies: [],
    },
  },
  {
    style: "rail-journey",
    ctx: {
      countries: ["瑞士"], destinations: ["苏黎世","卢塞恩","因特拉肯","采尔马特"],
      transportConnections: [{ from: "苏黎世", to: "卢塞恩", modes: ["rail"] }],
      designStrategies: ["Transport"],
    },
  },
  {
    style: "road-trip",
    ctx: {
      countries: ["英国"], destinations: ["爱丁堡","因弗内斯","威廉堡","天空岛"],
      transportConnections: [{ from: "爱丁堡", to: "因弗内斯", modes: ["self-drive"] }],
      designStrategies: ["Transport"],
    },
  },
  {
    style: "country-hopper",
    ctx: {
      countries: ["捷克","奥地利","匈牙利"], destinations: ["布拉格","维也纳","布达佩斯"],
      segmentMetrics: [
        { from: "布拉格", to: "维也纳", distanceKm: 250 },
        { from: "维也纳", to: "布达佩斯", distanceKm: 240 },
      ],
      transportConnections: [
        { from: "布拉格", to: "维也纳", modes: ["rail"] },
        { from: "维也纳", to: "布达佩斯", modes: ["rail"] },
      ],
      designStrategies: ["Geographic","Transport"],
    },
  },
  {
    style: "deep-dive",
    ctx: {
      countries: ["日本"], destinations: ["松本","上高地","高山","金泽","白川乡","富山","长野"],
      designStrategies: ["Regional","Depth"],
    },
  },
  {
    style: "classic-first-trip",
    ctx: { countries: ["日本"], destinations: ["东京","富士山","京都","奈良","大阪"], designStrategies: [] },
  },
];

for (const { style, ctx } of CASES) {
  const concept = buildRouteConcept(ctx);
  assert.equal(concept.travelStyle, style, `expected ${style}, got ${concept.travelStyle} for ctx destinations=${JSON.stringify(ctx.destinations)}`);
  assert.equal(concept.travelStyleLabel, TRAVEL_STYLE_LABEL[style]);
  assert.ok(concept.routeStructure?.type, `${style}: routeStructure.type missing`);
  assert.ok(concept.tripIntent?.intentType, `${style}: tripIntent missing`);
  assert.ok(concept.targetTraveler, `${style}: targetTraveler missing`);
  assert.ok(concept.whoShouldAvoid, `${style}: whoShouldAvoid missing`);
  assert.ok(concept.travelValue, `${style}: travelValue missing`);
  assert.ok(concept.whyThisDurationFits, `${style}: whyThisDurationFits missing`);
  const v = validateRouteConcept(concept, ctx);
  assert.ok(v.accepted, `${style} should validate, got reasons: ${v.reasons.join(",")}`);
}

// ─── 3. Style-specific 约束：city-break 多目的地 (>2) 不再落入 city-break
//      （1-3d 只覆盖 ≤2 目的地；超出即演化为 classic）。validate 的
//      city-break-too-many-destinations 作为防御性 guard，对人工注入的 concept 仍生效：
const cbManual = { travelStyle: "city-break", durationBand: "1-3d", recommendedDays: "3天", tripIntent: { intentType: "first-trip" }, paceLevel: "relaxed", whyThisDurationFits: "x", whyNotShorter: "y", whyNotLonger: "z", targetTraveler: "t", whoShouldAvoid: "a" };
const cbGuard = validateRouteConcept(cbManual, { countries: ["英国"], destinations: ["伦敦","剑桥","牛津"] });
assert.ok(!cbGuard.accepted && cbGuard.reasons.includes("city-break-too-many-destinations"), `city-break guard must reject >2 destinations: ${cbGuard.reasons.join(",")}`);

// ─── 4. 验证 unknown style 被拒 ───────────────────────────────────
const unknownV = validateRouteConcept({ travelStyle: "bogus", durationBand: "7-10d", recommendedDays: "8天", tripIntent: { intentType: "first-trip" }, paceLevel: "moderate", whyThisDurationFits: "x", whyNotShorter: "y", whyNotLonger: "z", targetTraveler: "t", whoShouldAvoid: "a" }, {});
assert.ok(!unknownV.accepted && unknownV.reasons.includes("unknown-travel-style"));

// ─── 5. 城市短假检测优先级：1-3d + 单目的地 → city-break ─────────
const cbShort = buildRouteConcept({ countries: ["英国"], destinations: ["伦敦"] });
assert.equal(cbShort.travelStyle, "city-break");

// ─── 6. 朝圣优先级高于主题：含朝圣词 + Theme 策略 → pilgrimage 而非 theme ─
const pilMix = buildRouteConcept({
  countries: ["日本"], destinations: ["德岛","高松","松山","高知"],
  themes: ["四国遍路朝圣"], designStrategies: ["Theme"],
});
assert.equal(pilMix.travelStyle, "pilgrimage", "pilgrimage must beat theme when both signals present");

// ─── 7. 季节矛盾 → 不会落到 seasonal ──────────────────────────────
const seasonConflict = buildRouteConcept({
  countries: ["日本"], destinations: ["东京","京都"],
  themes: ["樱花"], bestMonths: ["4月樱花", "12月雪"],
  designStrategies: ["Season"],
});
assert.notEqual(seasonConflict.travelStyle, "seasonal", "conflicting seasons must not be seasonal");

// ─── 8. Gold Cases 的 travelStyleConceptKey 与 concept 模块对齐 ────
import { GOLD_CASES } from "../src/lib/routes/route-gold-cases.mjs";
const SPEC_NAME_BY_KEY = Object.fromEntries(Object.entries(TRAVEL_STYLE_LABEL));
for (const c of GOLD_CASES) {
  assert.ok(TRAVEL_STYLE_KEYS.includes(c.travelStyleConceptKey), `gold case ${c.id}: conceptKey ${c.travelStyleConceptKey} not in concept enum`);
  assert.equal(SPEC_NAME_BY_KEY[c.travelStyleConceptKey], c.travelStyle, `gold case ${c.id}: conceptKey ${c.travelStyleConceptKey} → ${SPEC_NAME_BY_KEY[c.travelStyleConceptKey]} != travelStyle ${c.travelStyle}`);
}

console.log(`Phase 2a concept taxonomy verified: ${SPEC_KEYS.length} styles all detectable, style-specific constraints enforced, transport-journey kept as fallback (total ${TRAVEL_STYLE_KEYS.length} keys). Gold Cases conceptKey aligned.`);
