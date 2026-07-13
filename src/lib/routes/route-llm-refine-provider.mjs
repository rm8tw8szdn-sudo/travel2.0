// Route V2 LLM Refine Provider — Phase 3
//
// DeepSeek（OpenAI 兼容 chat completions）调用，原生 fetch，零 SDK 依赖。
// 与 codex deepseek-text-enrichment-provider 同构（/chat/completions + json_object + repair loop）。
// 在确定性骨架上做选点取舍+排序优化+plannerReason 叙事。
// key 缺失 → 抛 LLM_REFINE_NOT_CONFIGURED（planner 降级到 Phase 2b 确定性骨架）。
//
// 返回 { selectedDestinations, orderedDestinations, plannerReason, confidence, refined: true }

import {
  buildLlmRefineMessages, parseLlmRefineSuggestion, skeletonFromSuggestion,
} from "./route-llm-refine-shared.mjs";

export function createDeepSeekLlmRefineProvider({
  apiKey,
  model = "deepseek-chat",
  fetchImpl = globalThis.fetch,
  baseUrl = "https://api.deepseek.com",
  timeoutMs = 30_000,
  temperature = 0.3,
  // 重试硬上限：用户约束「llm 不 retry 三次以上」= 最多 3 次重试，含首次共 4 次尝试。
  // maxRetries = 尝试次数上限（attempt < maxRetries），故 4 = 1 首次 + 3 重试。
  maxRetries = 4,
} = {}) {
  return {
    name: "deepseek-llm-refine",
    maxRetries,
    async refine({ skeleton, concept, context = {}, fewShot = null, deadlineAt = 0 } = {}) {
      if (!apiKey) throw new Error("LLM_REFINE_NOT_CONFIGURED");
      if (!Array.isArray(skeleton) || skeleton.length < 2) throw new Error("LLM_REFINE_SKELETON_TOO_SHORT");
      // 配额与 retry 双重保护：每次尝试都计入 LLM 配额；配额耗尽即停。
      const quota = context.quota;
      let messages = buildLlmRefineMessages({ skeleton, concept, context, fewShot });
      for (let attempt = 0; attempt < maxRetries; attempt += 1) {
        if (quota && quota.limits.llm > 0 && quota.usage.llm >= quota.limits.llm) {
          throw new Error("LLM_QUOTA_EXHAUSTED");
        }
        if (quota) quota.usage.llm += 1;
        const remaining = deadlineAt ? Math.max(1, deadlineAt - Date.now()) : timeoutMs;
        let response;
        try {
          response = await fetchImpl(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
            method: "POST",
            headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
            signal: AbortSignal.timeout(Math.min(timeoutMs, remaining)),
            body: JSON.stringify({
              model,
              temperature,
              response_format: { type: "json_object" },
              messages,
            }),
          });
        } catch (error) {
          if (attempt < maxRetries - 1 && /abort|timeout|network/i.test(error?.name || error?.message || "")) continue;
          throw error;
        }
        const bodyText = await response.text();
        if (!response.ok) {
          let providerCode = "";
          try { providerCode = JSON.parse(bodyText)?.error?.code || ""; } catch {}
          throw new Error(`LLM_REFINE_HTTP_${response.status}${providerCode ? `:${providerCode}` : ""}`);
        }
        // OpenAI 兼容格式：choices[0].message.content
        const content = JSON.parse(bodyText).choices?.[0]?.message?.content;
        const result = parseLlmRefineSuggestion(content, { skeleton });
        if (!result.issues.length) {
          const orderedDestinations = skeletonFromSuggestion(result.suggestion, skeleton);
          return {
            selectedDestinations: orderedDestinations,
            orderedDestinations,
            plannerReason: result.suggestion.plannerReason,
            confidence: Number(result.suggestion.confidence),
            refined: true,
          };
        }
        // repair loop
        messages = [
          ...messages,
          { role: "assistant", content },
          { role: "user", content: result.repairPrompt },
        ];
      }
      throw new Error("LLM_REFINE_CONSTRAINTS");
    },
  };
}

// factory：从 env 读 key（与 codex createConfiguredTextEnrichmentProvider 同构）
export function createConfiguredLlmRefineProvider(env = process.env) {
  if (String(env.ROUTE_LLM_REFINE_ENABLED || "true").toLocaleLowerCase("en-US") === "false") return null;
  if (env.DEEPSEEK_API_KEY) {
    return createDeepSeekLlmRefineProvider({
      apiKey: env.DEEPSEEK_API_KEY,
      baseUrl: env.DEEPSEEK_BASE_URL || "https://api.deepseek.com",
      model: env.DEEPSEEK_LLM_MODEL || "deepseek-chat",
    });
  }
  return null;
}
