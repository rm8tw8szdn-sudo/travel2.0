import { createTextEnrichmentProvider } from "./text-enrichment-provider.mjs";
import { buildTextEnrichmentMessages, parseTextEnrichmentSuggestion, textEnrichmentRequestBody } from "./text-enrichment-shared.mjs";

export function createDeepSeekTextEnrichmentProvider({
  apiKey,
  fetchImpl = globalThis.fetch,
  baseUrl = "https://api.deepseek.com",
  model = "deepseek-chat",
  timeoutMs = 25_000,
} = {}) {
  return createTextEnrichmentProvider({
    name: "deepseek",
    async enrich(facts, { deadlineAt = 0 } = {}) {
      if (!apiKey) throw new Error("TEXT_ENRICHMENT_NOT_CONFIGURED");
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
        const bodyText = await response.text();
        if (!response.ok) {
          let providerCode = "";
          try { providerCode = JSON.parse(bodyText)?.error?.code || ""; } catch {}
          throw new Error(`TEXT_ENRICHMENT_HTTP_${response.status}${providerCode ? `:${providerCode}` : ""}`);
        }
        const content = JSON.parse(bodyText).choices?.[0]?.message?.content;
        const parsed = parseTextEnrichmentSuggestion(content, facts);
        if (!parsed.issues.length) return parsed.suggestion;
        messages = [
          ...messages,
          { role: "assistant", content },
          { role: "user", content: parsed.repairPrompt },
        ];
      }
      throw new Error("TEXT_ENRICHMENT_CONSTRAINTS");
    },
  });
}
