import { createDashScopeTextEnrichmentProvider } from "./dashscope-text-enrichment-provider.mjs";
import { createDeepSeekTextEnrichmentProvider } from "./deepseek-text-enrichment-provider.mjs";

export function createConfiguredTextEnrichmentProvider(env = process.env) {
  if (env.DEEPSEEK_API_KEY) {
    return createDeepSeekTextEnrichmentProvider({
      apiKey: env.DEEPSEEK_API_KEY,
      baseUrl: env.DEEPSEEK_BASE_URL || "https://api.deepseek.com",
      model: env.DEEPSEEK_TEXT_MODEL || "deepseek-chat",
    });
  }
  if (env.DASHSCOPE_API_KEY) {
    return createDashScopeTextEnrichmentProvider({
      apiKey: env.DASHSCOPE_API_KEY,
      baseUrl: env.DASHSCOPE_BASE_URL,
      model: env.DASHSCOPE_TEXT_MODEL || "qwen-plus",
    });
  }
  return null;
}
