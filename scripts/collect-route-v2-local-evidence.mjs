import { pathToFileURL } from "node:url";

import {
  SEARCH_KNOWLEDGE_GRAPH_FALLBACKS,
  collectOfflineEvidenceBatch,
  createLocalEvidenceRepository,
  createOfflineEvidenceEntityResolver,
  createPublishedKnowledgeEntityLayerRepository,
  createRouteV2TavilyEvidenceProvider,
  parseOfflineEvidenceCollectorArgs,
} from "../src/lib/routes/index.mjs";

export const ROUTE_V2_EVIDENCE_3B_JAPAN_PILOT_ENTITIES = Object.freeze([
  Object.freeze({ wikidataId: "Q1490", countryCode: "JP", name: "东京", sourceTitle: "Tokyo" }),
  Object.freeze({ wikidataId: "Q35765", countryCode: "JP", name: "大阪", sourceTitle: "Osaka" }),
  Object.freeze({ wikidataId: "Q34600", countryCode: "JP", name: "京都", sourceTitle: "Kyoto" }),
  Object.freeze({ wikidataId: "Q169134", countryCode: "JP", name: "奈良", sourceTitle: "Nara" }),
  Object.freeze({ wikidataId: "Q19869", countryCode: "JP", name: "金泽", sourceTitle: "Kanazawa" }),
  Object.freeze({ wikidataId: "Q200516", countryCode: "JP", name: "高山", sourceTitle: "Takayama" }),
  Object.freeze({ wikidataId: "Q242666", countryCode: "JP", name: "松本", sourceTitle: "Matsumoto" }),
]);

export async function runRouteV2LocalEvidenceCollector({
  args = process.argv.slice(2),
  env = process.env,
  fetchImpl = globalThis.fetch,
  storageRoot = null,
  now = () => new Date().toISOString(),
  clock = () => Date.now(),
} = {}) {
  const options = parseOfflineEvidenceCollectorArgs(args);
  const entityRepository = createPublishedKnowledgeEntityLayerRepository();
  const entityResolver = createOfflineEvidenceEntityResolver({
    repository: entityRepository,
    fallbacks: {
      ...SEARCH_KNOWLEDGE_GRAPH_FALLBACKS,
      JP: ROUTE_V2_EVIDENCE_3B_JAPAN_PILOT_ENTITIES,
    },
  });
  const repository = createLocalEvidenceRepository({ env, storageRoot, now });
  const provider = createRouteV2TavilyEvidenceProvider({ env, fetchImpl, now });
  return collectOfflineEvidenceBatch({
    repository,
    provider,
    entityResolver,
    env,
    ...options,
    timeoutMs: env.ROUTE_V2_EVIDENCE_ONLINE_TIMEOUT_MS,
    maxRetries: env.ROUTE_V2_EVIDENCE_ONLINE_MAX_RETRIES,
    now,
    clock,
  });
}

async function main() {
  try {
    const result = await runRouteV2LocalEvidenceCollector();
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (!result.ok) process.exitCode = 2;
  } catch (error) {
    process.stderr.write(`${JSON.stringify({
      ok: false,
      stopped: true,
      reason: "offline-evidence-cli-failed",
      error: String(error?.message || error).replace(/(api[_-]?key|bearer)\s*[:=]?\s*\S+/giu, "$1=[REDACTED]"),
    }, null, 2)}\n`);
    process.exitCode = 1;
  }
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";
if (invokedPath === import.meta.url) await main();
