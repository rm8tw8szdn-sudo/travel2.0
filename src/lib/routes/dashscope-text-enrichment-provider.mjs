import { createTextEnrichmentProvider } from "./text-enrichment-provider.mjs";
import {
  buildTextEnrichmentMessages,
  parseTextEnrichmentSuggestion,
  promptForFacts,
  textEnrichmentRequestBody,
} from "./text-enrichment-shared.mjs";

export function createDashScopeTextEnrichmentProvider({
  apiKey,
  fetchImpl = globalThis.fetch,
  baseUrl = "https://dashscope.aliyuncs.com/compatible-mode/v1",
  model = "qwen-plus",
  timeoutMs = 25_000,
} = {}) {
  return createTextEnrichmentProvider({
    name: "dashscope",
    async enrich(facts, { deadlineAt = 0 } = {}) {
      if (!apiKey) throw new Error("TEXT_ENRICHMENT_NOT_CONFIGURED");
      let safeEvidenceLevel = 0;
      let messages = buildTextEnrichmentMessages(facts);
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const remaining = deadlineAt ? Math.max(1, deadlineAt - Date.now()) : timeoutMs;
        let response;
        try {
          response = await fetchImpl(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
            method: "POST",
            headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
            signal: AbortSignal.timeout(Math.min(timeoutMs, remaining)),
            body: JSON.stringify(textEnrichmentRequestBody({ model, messages })),
          });
        } catch (error) {
          if (attempt < 2 && /abort|timeout|network/i.test(error?.name || error?.message || "")) continue;
          throw error;
        }
        const errorText = response.ok ? "" : await response.text().catch(() => "");
        if (!response.ok) {
          let providerCode = "";
          try { providerCode = JSON.parse(errorText)?.error?.code || ""; } catch {}
          if (response.status === 400 && /data_inspection|inappropriate/i.test(errorText) && safeEvidenceLevel < 2) {
            safeEvidenceLevel += 1;
            messages = buildTextEnrichmentMessages(facts, { includeExtract: false, includeSourceText: safeEvidenceLevel < 2 });
            continue;
          }
          throw new Error(`TEXT_ENRICHMENT_HTTP_${response.status}${providerCode ? `:${providerCode}` : ""}`);
        }
        const content = (await response.json()).choices?.[0]?.message?.content;
        if (!content) throw new Error("TEXT_ENRICHMENT_EMPTY");
        const parsed = parseTextEnrichmentSuggestion(content, facts);
        if (!parsed.issues.length) return parsed.suggestion;
        messages.push({ role: "assistant", content }, { role: "user", content: parsed.repairPrompt });
      }
      throw new Error("TEXT_ENRICHMENT_CONSTRAINTS");
    },
  });
}

export { promptForFacts };
