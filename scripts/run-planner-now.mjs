// 管理员主动触发 planner（非 user-facing）。
// 授权边界：Planner 只能由 Scheduled Warmup 或管理员主动触发；Feed/Search/Detail 不得启动 Planner。
// 用法：
//   DEEPSEEK_API_KEY=... ROUTE_WEB_SEARCH_API_KEY=... node scripts/run-planner-now.mjs [countries] [--strategy=seed|priority|coverage-matrix|search-miss|operator|seasonal|popular|newest]
// 未识别 strategy 会由 resolvePlannerStrategy 友好降级回 seed。
import { runRouteRepositoryWarmup } from "../src/lib/routes/index.mjs";

const args = process.argv.slice(2);
const stratArg = args.find((a) => a.startsWith("--strategy="));
const countriesArg = args.find((a) => !a.startsWith("-"));
const countries = (countriesArg || process.env.ROUTE_PLANNER_COUNTRIES || "JP,US,IT,TH,AU")
  .split(",").map((c) => c.trim()).filter(Boolean);

const report = await runRouteRepositoryWarmup({
  env: process.env,
  batchSize: 0, // 跳过 Wikivoyage 批，只跑 planner phase 补 coverage gap
  plannerEnabled: true,
  plannerBatchSize: Number(process.env.ROUTE_PLANNER_BATCH_SIZE || 3),
  plannerDeadlineMs: Number(process.env.ROUTE_PLANNER_DEADLINE_MS || 120_000),
  plannerCountries: countries,
  plannerStrategy: stratArg ? stratArg.split("=")[1] : (process.env.ROUTE_PLANNER_STRATEGY || "seed"),
});

const planner = report.plannerPhase || {};
console.log(JSON.stringify({
  ok: report.ok,
  strategy: planner.strategyId || "(not-run)",
  accepted: planner.accepted || 0,
  rejected: planner.rejected || 0,
  llmEnabled: planner.llmEnabled,
  evidenceEnabled: planner.evidenceEnabled,
  contexts: planner.contexts,
  cacheSource: planner.cacheSource,
  cacheMissingCountries: planner.cacheMissingCountries,
  cacheCountries: planner.cacheCountries,
  reasonCounts: planner.reasonCounts,
  timedOut: planner.timedOut || false,
  error: planner.error || undefined,
  after: report.after,
}, null, 2));
