import path from "node:path";
import { runRouteRepositoryWarmup } from "./repository-warmup-runner.mjs";

const DEFAULT_UNIQUE_TARGET = 2000;
const DEFAULT_PLANNER_BATCH_SIZE = 8;
const DEFAULT_DEADLINE_MS = 90_000;

const CROSS_COUNTRIES = [
  "AT", "SK", "HU", "CZ",
  "NL", "BE", "LU",
  "TH", "KH", "VN",
  "LT", "LV", "EE", "FI",
  "SI", "HR", "BA", "ME",
  "GB", "FR", "CH", "IT",
  "AR", "CL",
];

const SINGLE_COUNTRIES = [
  "JP", "US", "IT", "TH", "AU", "FR", "KR", "ES", "GR", "TR", "VN", "ID",
  "DE", "GB", "MX", "EG", "MA", "PE", "NZ", "NO", "CA", "ZA", "NL", "HR",
  "PH", "PT",
];

function numberFromEnv(env, key, fallback) {
  const value = Number(env?.[key]);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

function parseCountries(value, fallback) {
  const items = String(value || "")
    .split(/[,\s]+/u)
    .map((code) => code.trim().toUpperCase())
    .filter(Boolean);
  return [...new Set((items.length ? items : fallback).filter((code) => code && code !== "CN"))];
}

function withTimeout(promise, timeoutMs) {
  let timeout = null;
  const timer = new Promise((_, reject) => {
    timeout = setTimeout(() => reject(new Error(`feed-refill-timeout:${timeoutMs}`)), timeoutMs);
  });
  return Promise.race([promise, timer]).finally(() => clearTimeout(timeout));
}

function refillKey(routeType) {
  return routeType === "single" || routeType === "cross" ? routeType : "all";
}

function defaultStrategy(routeType, env) {
  if (routeType === "cross") return env.ROUTE_FEED_CROSS_PLANNER_STRATEGY || "feed-refill";
  if (routeType === "single") return env.ROUTE_FEED_SINGLE_PLANNER_STRATEGY || "feed-refill";
  return env.ROUTE_FEED_PLANNER_STRATEGY || "feed-refill";
}

function targetConfig(repository, routeType, env) {
  const status = repository?.status?.() || {};
  const uniqueTarget = numberFromEnv(env, "ROUTE_FEED_UNIQUE_TARGET", DEFAULT_UNIQUE_TARGET);
  const targetSingle = routeType === "single"
    ? numberFromEnv(env, "ROUTE_FEED_SINGLE_TARGET", uniqueTarget)
    : Math.max(Number(status.single || 0), numberFromEnv(env, "ROUTE_WARMUP_SINGLE_TARGET", 200));
  const targetCross = routeType === "cross"
    ? numberFromEnv(env, "ROUTE_FEED_CROSS_TARGET", uniqueTarget)
    : Math.max(Number(status.cross || 0), numberFromEnv(env, "ROUTE_WARMUP_CROSS_TARGET", 200));
  return {
    status,
    targetSingle,
    targetCross,
    targetSize: Math.max(targetSingle + targetCross, numberFromEnv(env, "ROUTE_WARMUP_TARGET", targetSingle + targetCross)),
  };
}

export function createRouteFeedRefillWorker({
  repository,
  jobStore,
  root = process.cwd(),
  env = process.env,
  runWarmup = runRouteRepositoryWarmup,
  fetchImpl = globalThis.fetch,
  log = () => {},
} = {}) {
  if (!repository?.status) throw new Error("ACCEPTED_REPOSITORY_REQUIRED");
  const running = new Map();

  function schedule({ request = {}, job = null, reason = "accepted-pool-below-watermark" } = {}) {
    if (env.ROUTE_FEED_REFILL_ENABLED === "false") {
      return { started: false, reused: false, disabled: true, promise: Promise.resolve(null) };
    }
    const routeType = request.routeType === "single" || request.routeType === "cross" ? request.routeType : "";
    const key = refillKey(routeType);
    const active = running.get(key);
    if (active) return { started: false, reused: true, promise: active };

    const storagePath = env.ROUTE_ACCEPTED_REPOSITORY_PATH || path.join(root, ".route-v2-cache", "accepted-routes.json");
    const evidenceStoragePath = env.ROUTE_EVIDENCE_REPOSITORY_PATH || path.join(root, ".route-v2-cache", "route-evidence.json");
    const syncStatePath = env.ROUTE_PROVIDER_SYNC_STATE_PATH || path.join(root, ".route-v2-cache", "provider-sync-state.json");
    const knowledgeGraphPoolPath = env.ROUTE_KNOWLEDGE_GRAPH_POOL_PATH || path.join(root, ".route-v2-cache", "knowledge-graph-pool.json");
    const targets = targetConfig(repository, routeType, env);
    const deadlineMs = numberFromEnv(env, "ROUTE_FEED_REFILL_DEADLINE_MS", DEFAULT_DEADLINE_MS);
    const plannerCountries = parseCountries(
      routeType === "cross" ? env.ROUTE_FEED_CROSS_PLANNER_COUNTRIES : env.ROUTE_FEED_SINGLE_PLANNER_COUNTRIES,
      routeType === "cross" ? CROSS_COUNTRIES : SINGLE_COUNTRIES,
    ).slice(0, numberFromEnv(env, "ROUTE_FEED_REFILL_COUNTRY_LIMIT", routeType === "cross" ? 4 : 6));

    jobStore?.transition?.(job?.id, "fetchingEvidence", { reason, routeType: routeType || "all" });

    const task = Promise.resolve().then(async () => {
      const report = await withTimeout(runWarmup({
        env,
        storagePath,
        evidenceStoragePath,
        syncStatePath,
        knowledgeGraphPoolPath,
        acceptedRepository: repository,
        batchSize: numberFromEnv(env, "ROUTE_FEED_REFILL_WIKIVOYAGE_BATCH_SIZE", 0),
        delayMs: numberFromEnv(env, "ROUTE_WARMUP_DELAY_MS", 0),
        plannerEnabled: env.ROUTE_FEED_REFILL_PLANNER_ENABLED !== "false",
        plannerBatchSize: numberFromEnv(env, "ROUTE_FEED_REFILL_PLANNER_BATCH_SIZE", DEFAULT_PLANNER_BATCH_SIZE),
        plannerDeadlineMs: deadlineMs,
        plannerCountries,
        plannerStrategy: defaultStrategy(routeType, env),
        plannerJobStore: jobStore || null,
        plannerSignals: { routeType: routeType || "all", refillReason: reason },
        targetSingle: targets.targetSingle,
        targetCross: targets.targetCross,
        targetSize: targets.targetSize,
        minimumSingle: Math.min(targets.targetSingle, Number(targets.status.single || 0) + 1),
        minimumCross: Math.min(targets.targetCross, Number(targets.status.cross || 0) + 1),
        minimumTotal: Math.min(targets.targetSize, Number(targets.status.total || 0) + 1),
        fetchImpl,
        log,
      }), deadlineMs + 2_000);
      const accepted = Number(report?.plannerPhase?.accepted || 0) + Number((report?.results || []).filter((item) => item.status === "accepted").length);
      jobStore?.transition?.(job?.id, accepted > 0 ? "accepted" : "rejected", {
        routeType: routeType || "all",
        accepted,
        rejected: Number(report?.plannerPhase?.rejected || 0),
        timedOut: Boolean(report?.plannerPhase?.timedOut),
        strategy: report?.plannerPhase?.strategyId || "",
      });
      return report;
    }).catch((error) => {
      jobStore?.transition?.(job?.id, "failed", { reason: error.message, routeType: routeType || "all" });
      throw error;
    }).finally(() => {
      running.delete(key);
    });

    running.set(key, task);
    return { started: true, reused: false, promise: task };
  }

  return {
    schedule,
    activeKeys() {
      return [...running.keys()];
    },
  };
}
