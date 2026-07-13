import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runRouteRepositoryWarmup } from "../src/lib/routes/repository-warmup-runner.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const storagePath = process.env.ROUTE_ACCEPTED_REPOSITORY_PATH || path.join(root, ".route-v2-cache", "accepted-routes.json");
const evidenceStoragePath = process.env.ROUTE_EVIDENCE_REPOSITORY_PATH || path.join(root, ".route-v2-cache", "route-evidence.json");
const syncStatePath = process.env.ROUTE_PROVIDER_SYNC_STATE_PATH || path.join(root, ".route-v2-cache", "provider-sync-state.json");
const targetTotal = Number(process.env.ROUTE_BULK_TARGET || 5000);
const maxRounds = Number(process.env.ROUTE_BULK_MAX_ROUNDS || 200);
const stopAfterNoGrowthRounds = Number(process.env.ROUTE_BULK_STOP_NO_GROWTH_ROUNDS || 8);
const batchSize = Number(process.env.ROUTE_BULK_WIKIVOYAGE_BATCH_SIZE || 50);
const plannerBatchSize = Number(process.env.ROUTE_BULK_PLANNER_BATCH_SIZE || 40);
const plannerDeadlineMs = Number(process.env.ROUTE_BULK_PLANNER_DEADLINE_MS || 120000);
const startedStamp = new Date().toISOString().replace(/[:.]/g, "-");
const reportPath = path.join(root, ".route-v2-cache", `bulk-route-generation-${startedStamp}.jsonl`);

function readRecords() {
  if (!fs.existsSync(storagePath)) return [];
  const payload = JSON.parse(fs.readFileSync(storagePath, "utf8"));
  return Array.isArray(payload.records) ? payload.records : [];
}

function text(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function destinationKey(record = {}) {
  return (record.destinationEntities || record.destinations || [])
    .map((item) => text(item.wikidataId || item.cityCode || item.name || item))
    .filter(Boolean)
    .sort()
    .join("|");
}

function countryKey(record = {}) {
  const entityCountries = (record.countryEntities || [])
    .map((item) => item.countryCode || item.name)
    .map((item) => text(item).toUpperCase())
    .filter(Boolean);
  const fallbackCountries = (record.countries || [])
    .map((item) => text(item).toUpperCase())
    .filter(Boolean);
  return [...new Set((entityCountries.length ? entityCountries : fallbackCountries).sort())].join("|");
}

function audit(records) {
  const ids = new Map();
  const titles = new Map();
  const skeletons = new Map();
  for (const record of records) {
    ids.set(record.id, (ids.get(record.id) || 0) + 1);
    titles.set(record.name, (titles.get(record.name) || 0) + 1);
    const skeleton = `${countryKey(record)}::${destinationKey(record)}`;
    if (skeleton !== "::") skeletons.set(skeleton, (skeletons.get(skeleton) || 0) + 1);
  }
  return {
    total: records.length,
    single: records.filter((record) => record.classification === "single").length,
    cross: records.filter((record) => record.classification === "cross").length,
    duplicateIds: [...ids].filter(([, count]) => count > 1).length,
    duplicateTitles: [...titles].filter(([, count]) => count > 1).length,
    duplicateSkeletons: [...skeletons].filter(([, count]) => count > 1).length,
  };
}

function appendReport(entry) {
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.appendFileSync(reportPath, `${JSON.stringify(entry)}\n`);
}

let noGrowthRounds = 0;
let previousTotal = audit(readRecords()).total;
appendReport({ event: "start", targetTotal, maxRounds, batchSize, plannerBatchSize, previous: audit(readRecords()) });

for (let round = 1; round <= maxRounds; round += 1) {
  const before = audit(readRecords());
  if (before.total >= targetTotal) break;
  const report = await runRouteRepositoryWarmup({
    env: process.env,
    storagePath,
    evidenceStoragePath,
    syncStatePath,
    batchSize,
    targetSize: targetTotal,
    targetSingle: Math.ceil(targetTotal * 0.65),
    targetCross: Math.floor(targetTotal * 0.35),
    minimumSingle: Math.min(before.single, Math.ceil(targetTotal * 0.65)),
    minimumCross: Math.min(before.cross, Math.floor(targetTotal * 0.35)),
    minimumTotal: Math.min(before.total, targetTotal),
    delayMs: Number(process.env.ROUTE_BULK_DELAY_MS || 0),
    cooldownMs: Number(process.env.ROUTE_BULK_COOLDOWN_MS || 10000),
    plannerEnabled: process.env.ROUTE_BULK_PLANNER_ENABLED !== "false",
    plannerBatchSize,
    plannerDeadlineMs,
    plannerStrategy: process.env.ROUTE_BULK_PLANNER_STRATEGY || "feed-refill",
    plannerCountries: (process.env.ROUTE_BULK_PLANNER_COUNTRIES || process.env.ROUTE_PLANNER_COUNTRIES || "JP,US,IT,TH,AU,FR,ES,GR,TR,VN,ID,DE,GB,MX,EG,MA,PE,NZ,NO,CA,ZA,NL,HR,PH,PT,AT,SK,HU,CZ,BE,LU,KH,LT,LV,EE,FI,SI,BA,ME,AR,CL")
      .split(",")
      .map((country) => country.trim())
      .filter(Boolean),
  });
  const after = audit(readRecords());
  const growth = after.total - before.total;
  noGrowthRounds = growth > 0 ? 0 : noGrowthRounds + 1;
  previousTotal = after.total;
  appendReport({
    event: "round",
    round,
    growth,
    before,
    after,
    warmup: {
      ok: report.ok,
      error: report.error,
      results: report.results?.length || 0,
      accepted: report.results?.filter((item) => item.status === "accepted").length || 0,
      plannerAccepted: report.plannerPhase?.accepted || 0,
      plannerRejected: report.plannerPhase?.rejected || 0,
      reasonCounts: report.rejectedDeferredReasonCounts || {},
      plannerReasonCounts: report.plannerPhase?.reasonCounts || {},
      continuation: report.providerSync?.continuation || null,
    },
  });
  console.log(JSON.stringify({ round, growth, total: after.total, single: after.single, cross: after.cross, duplicateIds: after.duplicateIds, duplicateTitles: after.duplicateTitles, duplicateSkeletons: after.duplicateSkeletons }));
  if (!report.ok) break;
  if (after.duplicateIds || after.duplicateTitles || after.duplicateSkeletons) break;
  if (noGrowthRounds >= stopAfterNoGrowthRounds) break;
  if (previousTotal >= targetTotal) break;
}

const final = audit(readRecords());
appendReport({ event: "finish", final, reportPath });
console.log(JSON.stringify({ final, reportPath }, null, 2));
