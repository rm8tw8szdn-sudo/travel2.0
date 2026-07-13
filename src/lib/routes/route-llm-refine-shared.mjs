// Route V2 LLM Refine 节点 — Phase 3
//
// 在 planner 确定性骨架上做：选点取舍 + 排序优化 + 生成 plannerReason 叙事。
// few-shot 喂 Gold Case 的 ②Planner Reasoning（LLM 学"为什么"，不是学答案）。
//
// 硬约束（suggestion 校验）：
//   - destinationIds 只能从 skeleton 池的白名单中选，不得新增（禁止补造 evidence 事实）
//   - orderedIds 必须是 destinationIds 的排列
//   - plannerReason 每条 text 必须含中文，strategy 必须在白名单
//   - 输出 JSON schema 严格
//
// 设计与 codex text-enrichment-shared 一致：prompt 构造 + suggestion 校验 + repair prompt。

const ALLOWED_STRATEGIES = ["Geographic", "Theme", "Season", "Transport", "Depth", "Efficiency"];

function cleanText(value) {
  return String(value || "").trim();
}

// 构造 few-shot 上下文：喂 Gold Case ②Reasoning（推理过程），不喂 ③expected output（答案）
function fewShotBlock(fewShot) {
  if (!fewShot) return "（无同风格 Gold Case 可作 few-shot；按设计规则推理即可）";
  return [
    `【参考案例 DNA】${fewShot.routeDna.travelStyle} / ${fewShot.routeDna.durationBand} / ${fewShot.routeDna.country}`,
    "【参考案例的 Planner 推理过程（学习其推理方式，不是照抄目的地）】",
    fewShot.reasoning,
  ].join("\n");
}

// 白名单：skeleton 池中所有目的地的 {id, name}
function poolWhitelist(skeleton) {
  return skeleton.map((d) => ({
    id: cleanText(d.wikidataId) || cleanText(d.name),
    name: cleanText(d.name),
  })).filter((d) => d.id && d.name);
}

export function buildLlmRefineMessages({ skeleton, concept, context, fewShot, poolWhitelistIds }) {
  const poolList = poolWhitelist(skeleton).map((d) => `${d.id}:${d.name}`).join("、");
  const skeletonOrder = skeleton.map((d) => cleanText(d.name)).join(" → ");
  const styleZh = concept.travelStyleLabel || concept.travelStyle;
  const maxDestinationCount = Math.min(8, Math.max(3, skeleton.length));
  const userContent = [
    `你是旅行路线 Planner 的选点/叙事节点。确定性管线已产出骨架，你在骨架上做选点取舍+排序优化+生成 plannerReason 叙事。`,
    ``,
    `【当前 concept】`,
    `旅行风格: ${styleZh}（${concept.travelStyle}）`,
    `时长: ${concept.durationBand}（${concept.recommendedDays}）`,
    `路线结构: ${concept.routeStructure?.type || "未定"}`,
    `旅行价值: ${concept.travelValue}`,
    `目标旅行者: ${concept.targetTraveler}`,
    ``,
    `【确定性骨架（最近邻排序产出）】`,
    skeletonOrder,
    ``,
    `【候选目的地池白名单（你只能从这里选点，禁止新增池外目的地）】`,
    poolList,
    ``,
    fewShotBlock(fewShot),
    ``,
    `【任务】`,
    `1. 从白名单中选 3-${maxDestinationCount} 个目的地（destinationIds），可删可留但不得新增池外点`,
    `2. 给出 orderedIds（destinationIds 的排列），使路线顺路、少折返、跨度适合当前时长，并符合 ${styleZh} 的结构`,
    `3. 生成 3-6 条 plannerReason，每条 {text, strategy}：text 是简体中文一句话说明为何这样选/排（解释"为什么"），strategy 从 [${ALLOWED_STRATEGIES.join(", ")}] 选`,
    `4. 禁止补造 evidence 事实（交通段距离、季节数据等），只做选点与叙事`,
    ``,
    `返回严格 JSON：{"destinationIds":["id1",...], "orderedIds":["id1",...], "plannerReason":[{"text":"...","strategy":"Geographic"},...], "confidence":0.0-1.0}`,
  ].join("\n");

  return [
    {
      role: "system",
      content: `你是旅行路线 Planner 的 LLM 选点/叙事节点。只在确定性骨架上做取舍与排序，不得新增目的地池外的事实。所有展示文字必须为简体中文，不得夹杂英文单词或日文假名。返回严格 JSON。`,
    },
    { role: "user", content: userContent },
  ];
}

// Anthropic Messages API 请求体（与 codex 的 OpenAI-兼容格式不同）
export function anthropicRequestBody({ model, messages, maxTokens = 1024, temperature = 0.3 }) {
  // Anthropic 不支持 role:system 在 messages 数组里，需拆为顶层 system
  const systemMsg = messages.find((m) => m.role === "system")?.content || "";
  const userMsgs = messages.filter((m) => m.role !== "system").map((m) => ({ role: m.role, content: m.content }));
  return {
    model,
    max_tokens: maxTokens,
    temperature,
    system: systemMsg,
    messages: userMsgs,
  };
}

// suggestion 校验：白名单 + 排列 + 文案约束
export function refineSuggestionIssues(suggestion, { skeleton }) {
  const issues = [];
  const whitelist = new Map(poolWhitelist(skeleton).map((d) => [d.id, d.name]));
  const whitelistIds = [...whitelist.keys()];

  const destIds = Array.isArray(suggestion?.destinationIds) ? suggestion.destinationIds.map(cleanText).filter(Boolean) : [];
  const orderedIds = Array.isArray(suggestion?.orderedIds) ? suggestion.orderedIds.map(cleanText).filter(Boolean) : [];
  const reasons = Array.isArray(suggestion?.plannerReason) ? suggestion.plannerReason : [];

  if (destIds.length < 3 || destIds.length > 8) issues.push("destinationIds-count");
  if (!destIds.every((id) => whitelistIds.includes(id))) issues.push("unsupported-destinationIds");
  const uniqueDest = [...new Set(destIds)];
  if (uniqueDest.length !== destIds.length) issues.push("duplicate-destinationIds");
  // orderedIds 必须是 destinationIds 的排列
  if (orderedIds.length !== destIds.length) issues.push("orderedIds-count-mismatch");
  else {
    const destSet = [...destIds].sort().join(",");
    const orderedSet = [...orderedIds].sort().join(",");
    if (destSet !== orderedSet) issues.push("orderedIds-not-permutation");
  }
  if (!orderedIds.every((id) => whitelistIds.includes(id))) issues.push("unsupported-orderedIds");

  if (reasons.length < 3 || reasons.length > 6) issues.push("plannerReason-count");
  for (const r of reasons) {
    const text = cleanText(r?.text);
    const strat = cleanText(r?.strategy);
    if (!text) issues.push("planner-reason-missing-text");
    if (!ALLOWED_STRATEGIES.includes(strat)) issues.push(`planner-reason-unknown-strategy:${strat || "(empty)"}`);
    if (text && !/[㐀-鿿]/u.test(text)) issues.push("planner-reason-not-chinese");
    if (text && /[A-Za-z]{3,}/u.test(text)) issues.push("planner-reason-english-copy");
    if (text && /[぀-ヿ]/u.test(text)) issues.push("planner-reason-kana-copy");
  }

  const confidence = Number(suggestion?.confidence);
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) issues.push("invalid-confidence");

  return [...new Set(issues)];
}

// 解析 + 校验 + repair prompt（与 codex parseTextEnrichmentSuggestion 同构）
export function parseLlmRefineSuggestion(content, options) {
  let suggestion;
  try {
    suggestion = JSON.parse(content);
  } catch {
    throw new Error("LLM_REFINE_INVALID_JSON");
  }
  const issues = refineSuggestionIssues(suggestion, options);
  const whitelist = poolWhitelist(options.skeleton).map((d) => `${d.id}:${d.name}`).join("、");
  return {
    suggestion,
    issues,
    repairPrompt: `上次输出不合格：${issues.join("、")}。destinationIds/orderedIds 只能从白名单 [${whitelist}] 中选 3-8 个；orderedIds 必须是 destinationIds 的排列；plannerReason 每条 text 必须为简体中文（不得含英文词或假名），strategy 只能从 [${ALLOWED_STRATEGIES.join(", ")}] 选；confidence 为 0-1 数值。请仅返回修正后的 JSON。`,
  };
}

// 把 LLM suggestion 映射回 destination 实体（按 orderedIds 排序）
export function skeletonFromSuggestion(suggestion, skeleton) {
  const byId = new Map(skeleton.map((d) => [cleanText(d.wikidataId) || cleanText(d.name), d]));
  return (suggestion.orderedIds || [])
    .map((id) => byId.get(id))
    .filter(Boolean);
}

export { cleanText, poolWhitelist, ALLOWED_STRATEGIES };
