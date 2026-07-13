// Phase 3 回归：LLM Refine 节点
// 运行：node scripts/verify-llm-node.mjs
//   不带 env → 用 mock fetch 验证 prompt/schema/repair/降级（不耗 key）
//   DEEPSEEK_API_KEY=sk-... → 追加一次真 DeepSeek 调用（验证 key 可用）
import assert from "node:assert/strict";
import os from "node:os";
import fs from "node:fs";
import path from "node:path";
import {
  createAcceptedRouteRepository,
  createEvidenceRepository,
  createRouteCompositionPlanner,
  createDeepSeekLlmRefineProvider,
  buildLlmRefineMessages,
  parseLlmRefineSuggestion,
  refineSuggestionIssues,
} from "../src/lib/routes/index.mjs";
import { getCase, asFewShotReasoning } from "../src/lib/routes/route-gold-cases.mjs";
import { buildRouteConcept } from "../src/lib/routes/route-planning-concept.mjs";

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "route-llm-"));
const acceptedRepository = createAcceptedRouteRepository({ storagePath: path.join(tempDir, "accepted.json") });
const evidenceRepository = createEvidenceRepository({ storagePath: path.join(tempDir, "evidence.json") });

// 知识图 mock（Gold Case 1 的日本目的地池）
const JP_POOL = [
  { wikidataId: "Q1490", countryCode: "JP", name: "东京", entityTypeName: "city", latitude: 35.6762, longitude: 139.6503, countryName: "日本" },
  { wikidataId: "Q39231", countryCode: "JP", name: "富士山", entityTypeName: "mountain", latitude: 35.3606, longitude: 138.7274, countryName: "日本" },
  { wikidataId: "Q34600", countryCode: "JP", name: "京都", entityTypeName: "city", latitude: 35.0116, longitude: 135.7681, countryName: "日本" },
  { wikidataId: "Q169134", countryCode: "JP", name: "奈良", entityTypeName: "city", latitude: 34.6851, longitude: 135.8048, countryName: "日本" },
  { wikidataId: "Q35765", countryCode: "JP", name: "大阪", entityTypeName: "city", latitude: 34.6937, longitude: 135.5023, countryName: "日本" },
];
const knowledgeGraph = {
  queryDestinations(q) { return q.country === "JP" || q.country === "日本" ? JP_POOL.slice() : []; },
};

// ─── 1. buildLlmRefineMessages 产出含 few-shot 推理 + 白名单 ─────────
const gold1 = getCase("gold-1-jp-first-trip");
const fewShot = asFewShotReasoning("gold-1-jp-first-trip");
const concept = buildRouteConcept({ countries: ["日本"], destinations: JP_POOL.map((d) => d.name), designStrategies: ["Geographic", "Theme", "Efficiency"] });
const messages = buildLlmRefineMessages({ skeleton: JP_POOL, concept, context: { country: "JP" }, fewShot });
assert.ok(messages[0].role === "system", "system message required");
assert.ok(messages[1].content.includes("参考案例"), "few-shot reasoning must be injected (学推理过程)");
assert.ok(messages[1].content.includes("Q1490:东京"), "pool whitelist must be injected");
assert.ok(messages[1].content.includes("禁止新增"), "must forbid adding evidence facts");
assert.ok(fewShot.reasoning.includes("Duration:"), "few-shot must be step-aligned reasoning");

// ─── 2. parseLlmRefineSuggestion：合格输出 ────────────────────────
const goodSuggestion = JSON.stringify({
  destinationIds: ["Q1490", "Q39231", "Q34600", "Q169134", "Q35765"],
  orderedIds: ["Q1490", "Q39231", "Q34600", "Q169134", "Q35765"],
  plannerReason: [
    { text: "东京作为国际门户起点的地理优势。", strategy: "Geographic" },
    { text: "富士山作为都市与古都间的自然缓冲。", strategy: "Efficiency" },
    { text: "京都古都文化不可替代的核心地位。", strategy: "Theme" },
  ],
  confidence: 0.85,
});
const goodParsed = parseLlmRefineSuggestion(goodSuggestion, { skeleton: JP_POOL });
assert.deepEqual(goodParsed.issues, [], `good suggestion should pass: ${goodParsed.issues.join(",")}`);

// ─── 3. 不合格：池外目的地 → repair ───────────────────────────────
const badSuggestion = JSON.stringify({
  destinationIds: ["Q1490", "Q9999", "Q34600"], // Q9999 不在白名单
  orderedIds: ["Q1490", "Q9999", "Q34600"],
  plannerReason: [{ text: "测试", strategy: "Geographic" }],
  confidence: 0.5,
});
const badParsed = parseLlmRefineSuggestion(badSuggestion, { skeleton: JP_POOL });
assert.ok(badParsed.issues.includes("unsupported-destinationIds"), `pool-foreign dest must fail: ${badParsed.issues.join(",")}`);
assert.ok(badParsed.repairPrompt.includes("白名单"), "repair prompt must cite whitelist");

// ─── 4. 不合格：orderedIds 非排列 ──────────────────────────────────
const badPerm = JSON.stringify({
  destinationIds: ["Q1490", "Q39231", "Q34600"],
  orderedIds: ["Q1490", "Q39231"], // 少一个
  plannerReason: [{ text: "测试", strategy: "Geographic" }],
  confidence: 0.5,
});
assert.ok(parseLlmRefineSuggestion(badPerm, { skeleton: JP_POOL }).issues.includes("orderedIds-count-mismatch"));

// ─── 5. 不合格：plannerReason 含英文 ───────────────────────────────
const badEnglish = JSON.stringify({
  destinationIds: ["Q1490", "Q39231", "Q34600"],
  orderedIds: ["Q1490", "Q39231", "Q34600"],
  plannerReason: [{ text: "Tokyo is the start point.", strategy: "Geographic" }],
  confidence: 0.5,
});
assert.ok(parseLlmRefineSuggestion(badEnglish, { skeleton: JP_POOL }).issues.some((i) => i.startsWith("planner-reason")), "english copy must fail");

// ─── 6. provider：无 key → NOT_CONFIGURED ──────────────────────────
const noKeyProvider = createDeepSeekLlmRefineProvider({ apiKey: "" });
await assert.rejects(() => noKeyProvider.refine({ skeleton: JP_POOL, concept, context: {}, fewShot }), /LLM_REFINE_NOT_CONFIGURED/);

// ─── 7. provider：mock fetch + repair loop（不耗 key） ──────────────
let callCount = 0;
const fetchCalls = [];
const mockFetch = async (url, opts) => {
  callCount += 1;
  fetchCalls.push({ url, body: JSON.parse(opts.body) });
  // 第一次返回不合格（池外点），第二次返回合格 → 触发 repair loop
  const content = callCount === 1
    ? JSON.stringify({ destinationIds: ["Q1490", "Q9999", "Q34600"], orderedIds: ["Q1490", "Q9999", "Q34600"], plannerReason: [{ text: "测试起点。", strategy: "Geographic" }], confidence: 0.4 })
    : goodSuggestion;
  return {
    ok: true,
    status: 200,
    text: async () => JSON.stringify({ choices: [{ message: { content } }] }),
  };
};
const mockProvider = createDeepSeekLlmRefineProvider({ apiKey: "mock-key", fetchImpl: mockFetch, baseUrl: "https://mock.test" });
const refined = await mockProvider.refine({ skeleton: JP_POOL, concept, context: { country: "JP" }, fewShot });
assert.equal(callCount, 2, "repair loop must call twice (bad→good)");
assert.equal(refined.refined, true);
assert.equal(refined.orderedDestinations.length, 5);
assert.ok(refined.plannerReason.length >= 3);
assert.equal(refined.confidence, 0.85);
assert.ok(fetchCalls[1].body.messages.length > fetchCalls[0].body.messages.length, "repair must append messages");
assert.equal(fetchCalls[0].body.response_format.type, "json_object", "must request json_object");

// ─── 8. planner 降级：无 LLM provider → 确定性骨架（llmRefine.refined=false） ─
const plannerNoLlm = createRouteCompositionPlanner({ evidenceRepository, acceptedRepository, knowledgeGraph });
const noLlmResult = await plannerNoLlm.buildCandidates({
  limit: 1, context: { durationDays: 8, country: "JP", countryName: "日本", travelStyle: "classic-first-trip" },
});
assert.ok(noLlmResult.accepted.length >= 1, "pipeline must produce via deterministic fallback when no LLM");
assert.equal(noLlmResult.accepted[0].record.llmRefine.refined, false, "must mark deterministic-fallback");
assert.equal(noLlmResult.accepted[0].record.llmRefine.provider, "deterministic-fallback");

// ─── 9. planner 接入 LLM provider（mock fetch）→ refined=true ──────
const plannerWithLlm = createRouteCompositionPlanner({
  evidenceRepository, acceptedRepository, knowledgeGraph,
  llmRefineProvider: mockProvider,
});
// acceptedRepository 已有第一条（来自 #8），duplicateDistance 可能拒；用新 repo
const acceptedRepository2 = createAcceptedRouteRepository({ storagePath: path.join(tempDir, "accepted2.json") });
const plannerWithLlm2 = createRouteCompositionPlanner({
  evidenceRepository, acceptedRepository: acceptedRepository2, knowledgeGraph,
  llmRefineProvider: mockProvider,
});
callCount = 0; // 重置 mock
const llmResult = await plannerWithLlm2.buildCandidates({
  limit: 1, context: { durationDays: 8, country: "JP", countryName: "日本", travelStyle: "classic-first-trip" },
});
if (llmResult.accepted.length) {
  assert.equal(llmResult.accepted[0].record.llmRefine.refined, true, "LLM node must mark refined=true");
  assert.ok(llmResult.accepted[0].record.plannerReason.length >= 3, "LLM plannerReason must have >=3 entries");
  assert.equal(llmResult.accepted[0].record.llmRefine.confidence, 0.85);
} else {
  // 若被 dedupe 拒，仍验证 LLM 节点被调用过（mock callCount>0）
  assert.ok(callCount > 0, "LLM node must be invoked even if later deduped");
}

// ─── 10. 真 DeepSeek 调用（仅当 DEEPSEEK_API_KEY 存在） ────────────
if (process.env.DEEPSEEK_API_KEY) {
  console.log("  [真调用] DEEPSEEK_API_KEY 检测到，发起一次真实 DeepSeek 调用...");
  const realProvider = createDeepSeekLlmRefineProvider({ apiKey: process.env.DEEPSEEK_API_KEY });
  try {
    const realRefined = await realProvider.refine({
      skeleton: JP_POOL, concept, context: { country: "JP", countryName: "日本" }, fewShot,
    });
    assert.equal(realRefined.refined, true, "real DeepSeek call must return refined=true");
    assert.ok(realRefined.orderedDestinations.length >= 3, `real call orderedDestinations too short: ${realRefined.orderedDestinations.length}`);
    assert.ok(realRefined.plannerReason.length >= 3, "real call must produce >=3 plannerReason");
    assert.ok(realRefined.confidence > 0, "real call confidence must be positive");
    const names = realRefined.orderedDestinations.map((d) => d.name);
    console.log(`  [真调用] 成功：${names.join(" → ")}，confidence=${realRefined.confidence}，${realRefined.plannerReason.length} 条 plannerReason`);
    // 真 LLM 不得引入池外目的地
    assert.ok(realRefined.orderedDestinations.every((d) => JP_POOL.some((p) => p.wikidataId === d.wikidataId)), "real LLM must not add pool-foreign destinations");
    console.log("  [真调用] 白名单约束通过：无池外目的地");
  } catch (error) {
    console.error(`  [真调用] 失败：${error.message}`);
    throw error;
  }
} else {
  console.log("  [真调用] 跳过（未设 DEEPSEEK_API_KEY）");
}

console.log(`Phase 3 LLM node verified: prompt injects few-shot reasoning + pool whitelist; schema rejects pool-foreign/perm-violation/english-copy; repair loop (bad→good) works; planner degrades to deterministic fallback when no key; provider uses DeepSeek OpenAI-compatible format. ${process.env.DEEPSEEK_API_KEY ? "Real DeepSeek call succeeded." : "(real call skipped — no key)"}`);
