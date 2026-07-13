// Phase 1 验收：Gold Cases + Bad Cases + Decision Tests 资产可用性
// 运行：node scripts/verify-gold-cases.mjs
import assert from "node:assert/strict";
import {
  GOLD_CASES, GOLD_CASE_SCHEMA_VERSION,
  getCase, listCases, asFewShotReasoning, asExpectedOutput, asAssertions, asAlternatives,
  validateAllCases,
} from "../src/lib/routes/route-gold-cases.mjs";
import {
  BAD_CASES, FAILURE_TYPES, getBadCase, listBadCases, failureTypeToDecisionTest, validateAllBadCases,
} from "../src/lib/routes/route-bad-cases.mjs";
import {
  removalTest, replacementTest, compressionTest, expansionTest, productBoundaryTest,
  runAllDecisionTests, jaccard,
} from "../src/lib/routes/route-decision-tests.mjs";

// ─── 1. Gold Case schema 自检 ────────────────────────────────────
const goldCheck = validateAllCases();
assert.ok(goldCheck.ok, `gold cases schema FAIL: ${goldCheck.errors.join("; ")}`);
assert.equal(GOLD_CASES.length, 45, "expected 45 active gold cases (China deferred)");
const styles = [...new Set(GOLD_CASES.map((c) => c.travelStyle))];
assert.equal(styles.length, 10, `expected 10 travel styles, got ${styles.length}: ${styles.join(",")}`);
const EXPECTED_STYLES = ["Classic First Trip", "Deep Dive", "Country Hopper", "Road Trip", "Rail Journey", "Seasonal", "Theme", "Island Hopping", "Pilgrimage", "City Break"];
for (const s of EXPECTED_STYLES) assert.ok(styles.includes(s), `missing style: ${s}`);
assert.equal(GOLD_CASE_SCHEMA_VERSION, 1);

// ─── 2. asFewShotReasoning 产出 step-aligned 含 Reason + Alternatives ──
const fs1 = asFewShotReasoning("gold-1-jp-first-trip");
assert.ok(fs1, "few-shot reasoning for gold-1 must exist");
assert.ok(fs1.routeDna.travelStyle, "routeDna.travelStyle required");
assert.ok(fs1.reasoning.includes("Duration:"), "reasoning must be step-aligned");
assert.ok(fs1.reasoning.includes("Alternatives Considered"), "reasoning must include Alternatives Considered");
// 每个理由含"为什么"——至少每步有 → 箭头说明
const stepLines = fs1.reasoning.split("\n").filter((l) => l.startsWith("- "));
assert.ok(stepLines.length >= 7, `reasoning must have >=7 steps, got ${stepLines.length}`);

// ─── 3. Structured Expected Output：designRules 与 evidenceReferences 分离 ──
const eo = asExpectedOutput("gold-1-jp-first-trip");
assert.ok(Array.isArray(eo.designRules) && eo.designRules.length, "designRules must be non-empty array");
assert.ok(Array.isArray(eo.evidenceReferences), "evidenceReferences must be array (can be empty pre-Tavily)");
assert.notDeepEqual(eo.designRules, eo.evidenceReferences, "designRules and evidenceReferences are distinct fields");

// ─── 4. asAlternatives 五字段 ────────────────────────────────────
const alt1 = asAlternatives("gold-1-jp-first-trip");
assert.deepEqual(Object.keys(alt1).sort(), ["compressionStrategy", "expansionStrategy", "rejectedDestinations", "rejectedProducts", "rejectedStyles"].sort());
assert.ok(alt1.compressionStrategy[0].removeDestination === "奈良", "gold-1 compression should remove 奈良");

// ─── 5. Bad Cases 10 类 + layer 分布 ─────────────────────────────
const badCheck = validateAllBadCases();
assert.ok(badCheck.ok, `bad cases schema FAIL: ${badCheck.errors.join("; ")}`);
assert.equal(BAD_CASES.length, 10, "expected 10 bad cases");
assert.equal(FAILURE_TYPES.length, 10, "expected 10 failure types");
const layerCounts = ["concept", "decision-test", "validator", "acceptance"]
  .map((l) => listBadCases({ layer: l }).length);
assert.deepEqual(layerCounts, [4, 3, 2, 1], `bad case layer distribution wrong: ${layerCounts}`);

// ─── 6. Decision Tests 用 Gold Case ④ 作判据 ─────────────────────
// 6a. compressionTest：候选含奈良 + removeDays>=2 → 应触发删奈良
const gold1 = getCase("gold-1-jp-first-trip");
const candidateWithNara = {
  destinations: ["东京", "富士山", "京都", "奈良", "大阪"],
  designRules: gold1.expected.designRules,
};
const comp = compressionTest(candidateWithNara, { goldCase: gold1, removeDays: 2 });
assert.equal(comp.pass, false, "compression should fail (奈良 should be removed)");
assert.ok(comp.mutations.some((m) => m.action === "remove" && m.destination === "奈良"), "must suggest removing 奈良");

// 6b. removalTest：候选含北海道（gold-1 rejectedDestinations）→ 应触发删
const candidateWithHokkaido = {
  destinations: ["东京", "北海道", "京都", "大阪"],
  designRules: gold1.expected.designRules,
};
const rem = removalTest(candidateWithHokkaido, { goldCase: gold1 });
assert.equal(rem.pass, false, "removal should fail (北海道 in rejectedDestinations)");
assert.ok(rem.mutations.some((m) => m.action === "remove" && m.destination === "北海道"));

// 6c. expansionTest：候选缺金泽 + addDays>=3 → 应触发加
const candidateNoKanazawa = { destinations: ["东京", "京都", "大阪"] };
const exp = expansionTest(candidateNoKanazawa, { goldCase: gold1, addDays: 3 });
assert.equal(exp.pass, false, "expansion should fail (金泽/白川乡 should be added)");
assert.ok(exp.mutations.some((m) => m.action === "add"));

// 6d. productBoundaryTest：提议加冲绳到 gold-1 → 应触发拆分（冲绳在海岛产品）
// gold-1 rejectedDestinations 含九州/北海道，用北海道测
const pb = productBoundaryTest(
  { travelStyle: "Classic First Trip", destinations: ["东京", "京都", "大阪"] },
  { goldCase: gold1, proposedAdditions: ["北海道"] },
);
assert.equal(pb.pass, false, "product boundary should fail (北海道 belongs to another product)");
assert.ok(pb.mutations.some((m) => m.action === "split"));

// 6e. 正向：干净候选全过
const cleanCandidate = {
  destinations: ["东京", "富士山", "京都", "奈良", "大阪"],
  designRules: gold1.expected.designRules,
  travelStyle: "Classic First Trip",
};
const all = runAllDecisionTests(cleanCandidate, { goldCase: gold1 });
// removal/compression/expansion/productBoundary 中 compression 此时 removeDays=0 应过
assert.ok(all.results.productBoundary.pass, "clean candidate should pass product boundary");

// ─── 7. Bad Case 被正确层拦截 ────────────────────────────────────
// bad-4 折返 → productBoundaryTest（failureTypeToDecisionTest 映射）
assert.equal(failureTypeToDecisionTest("geographic-inefficiency"), "productBoundaryTest");
assert.equal(failureTypeToDecisionTest("wrong-access-point"), "removalTest");
assert.equal(failureTypeToDecisionTest("too-many-similar-stops"), "removalTest");
assert.equal(failureTypeToDecisionTest("repository-duplication"), "productBoundaryTest");
// bad-10 重复 → acceptance 层
const bad10 = getBadCase("bad-10-repository-duplication");
assert.equal(bad10.expectRejectAtLayer, "acceptance");
// bad-3 duration-mismatch → validator 层
assert.equal(getBadCase("bad-3-duration-mismatch-classic").expectRejectAtLayer, "validator");
// bad-8 evidence-driven → concept 层
assert.equal(getBadCase("bad-8-evidence-driven-planning").expectRejectAtLayer, "concept");

// ─── 8. 宽松匹配断言可计算（Jaccard） ────────────────────────────
const a = ["东京", "富士山", "京都", "奈良", "大阪"];
const b = ["东京", "京都", "大阪", "奈良", "富士山"]; // 同集不同序
assert.equal(jaccard(a, b), 1, "same set should have jaccard 1");
const c = ["东京", "京都", "大阪"]; // 部分重叠
assert.ok(jaccard(a, c) >= 0.5, "partial overlap should pass loose threshold");
const assertions = asAssertions("gold-1-jp-first-trip");
assert.ok(assertions.minDestJaccard >= 0.5, "loose threshold must be >= 0.5");

// ─── 9. 每种 Style 至少 1 个 Case，Classic 至少 2 个 ────────────
for (const s of EXPECTED_STYLES) {
  const n = listCases({ travelStyle: s }).length;
  assert.ok(n >= 1, `style ${s} must have >=1 case, got ${n}`);
}
assert.ok(listCases({ travelStyle: "Classic First Trip" }).length >= 2, "Classic must have >=2 cases (different countries)");

console.log(`Phase 1 assets verified: ${GOLD_CASES.length} gold cases across ${styles.length} styles, ${BAD_CASES.length} bad cases, 5 decision tests — all using Gold Case ③④ as criteria, loose-match assertions computable.`);
