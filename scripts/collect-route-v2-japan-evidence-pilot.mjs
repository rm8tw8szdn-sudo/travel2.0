import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  ROUTE_V2_JAPAN_EVIDENCE_PILOT_STORAGE_ROOT,
  ROUTE_V2_JAPAN_EVIDENCE_PILOT_ENTITIES,
  SEARCH_KNOWLEDGE_GRAPH_FALLBACKS,
  collectOfflineEvidenceBatch,
  createJapanEvidencePilotProvider,
  createLocalEvidenceRepository,
  createOfflineEvidenceEntityResolver,
  createPublishedKnowledgeEntityLayerRepository,
  parseOfflineEvidenceCollectorArgs,
  planJapanEvidencePilot,
  seedJapanEvidencePilot,
  summarizeJapanEvidencePilot,
} from "../src/lib/routes/index.mjs";

export async function runRouteV2JapanEvidencePilot({
  args = process.argv.slice(2),
  env = process.env,
  fetchImpl = globalThis.fetch,
  storageRoot = path.resolve(ROUTE_V2_JAPAN_EVIDENCE_PILOT_STORAGE_ROOT),
  now = () => new Date().toISOString(),
  clock = () => Date.now(),
} = {}) {
  const options = parseOfflineEvidenceCollectorArgs(args);
  if (options.canary) throw new Error("--canary is not supported by the Japan pilot command");
  if (options.country && options.country.toLocaleUpperCase("en-US") !== "JP") {
    throw new Error("Japan pilot only supports --country JP");
  }
  if (options.dryRun) {
    return {
      ok: true,
      stopped: false,
      reason: "dry-run",
      dryRun: true,
      storageRoot,
      stats: {
        claimed: 0,
        networkRequests: 0,
        writes: 0,
      },
      tasks: planJapanEvidencePilot({ limit: options.limit, type: options.type }),
    };
  }

  const repository = createLocalEvidenceRepository({ env, storageRoot, now });
  const seeded = seedJapanEvidencePilot(repository, { now });
  if (!seeded.persisted) {
    return { ok: false, stopped: true, reason: seeded.reason || "japan-pilot-seed-failed", dryRun: false, seeded, storageRoot };
  }
  const entityRepository = createPublishedKnowledgeEntityLayerRepository();
  const baseEntityResolver = createOfflineEvidenceEntityResolver({
    repository: entityRepository,
    fallbacks: {
      ...SEARCH_KNOWLEDGE_GRAPH_FALLBACKS,
      JP: ROUTE_V2_JAPAN_EVIDENCE_PILOT_ENTITIES,
    },
  });
  const pilotEntitiesById = new Map(ROUTE_V2_JAPAN_EVIDENCE_PILOT_ENTITIES.map((entity) => [entity.wikidataId, {
    entityId: entity.entityId || "",
    wikidataId: entity.wikidataId,
    countryEntityId: "",
    countryCode: "JP",
    countryName: "Japan",
    name: entity.sourceTitle || entity.name,
    canonicalNameEn: entity.sourceTitle || "",
    canonicalNameZh: entity.name || "",
    aliases: entity.aliases || [],
  }]));
  const entityResolver = {
    resolveEntity(value) {
      const pilot = pilotEntitiesById.get(String(value || ""));
      return pilot ? structuredClone(pilot) : baseEntityResolver.resolveEntity(value);
    },
    matchesCountry(context, filter) {
      if (String(filter || "").toLocaleUpperCase("en-US") === "JP"
        && (context.entityIds || []).some((entityId) => pilotEntitiesById.has(entityId))) return true;
      return baseEntityResolver.matchesCountry(context, filter);
    },
  };
  const provider = createJapanEvidencePilotProvider({
    fetchImpl,
    now,
    timeoutMs: env.ROUTE_V2_EVIDENCE_ONLINE_TIMEOUT_MS,
  });
  const result = await collectOfflineEvidenceBatch({
    repository,
    provider,
    entityResolver,
    env,
    ...options,
    country: "JP",
    timeoutMs: env.ROUTE_V2_EVIDENCE_ONLINE_TIMEOUT_MS,
    maxRetries: env.ROUTE_V2_EVIDENCE_ONLINE_MAX_RETRIES,
    now,
    clock,
  });
  return {
    ...result,
    storageRoot,
    seeded,
    repository: summarizeJapanEvidencePilot(repository, { storageRoot }),
  };
}

async function main() {
  try {
    const result = await runRouteV2JapanEvidencePilot();
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (!result.ok) process.exitCode = 2;
  } catch (error) {
    process.stderr.write(`${JSON.stringify({
      ok: false,
      stopped: true,
      reason: "japan-evidence-pilot-cli-failed",
      error: String(error?.message || error).replace(/(api[_-]?key|bearer)\s*[:=]?\s*\S+/giu, "$1=[REDACTED]"),
    }, null, 2)}\n`);
    process.exitCode = 1;
  }
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";
if (invokedPath === import.meta.url) await main();
