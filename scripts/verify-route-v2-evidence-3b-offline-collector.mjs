import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildMissingRouteLegEvidence,
  buildMissingSeasonEvidence,
  collectOfflineEvidenceBatch,
  createLocalEvidenceRepository,
  createOfflineEvidenceEntityResolver,
  createPublishedKnowledgeEntityLayerRepository,
  isRouteV2OfflineEvidenceCollectionEnabled,
  parseOfflineEvidenceCollectorArgs,
  routeLegEvidenceKey,
  seasonEvidenceKey,
  validateLocalEvidenceSource,
} from "../src/lib/routes/index.mjs";
import {
  ROUTE_V2_EVIDENCE_3B_JAPAN_PILOT_ENTITIES,
  runRouteV2LocalEvidenceCollector,
} from "./collect-route-v2-local-evidence.mjs";

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FIXED_NOW = "2026-07-21T12:00:00.000Z";
const TEST_API_KEY = crypto.randomBytes(16).toString("hex");
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "route-v2-evidence-3b-offline-collector-"));

function filesUnder(root) {
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root, { withFileTypes: true })
    .flatMap((entry) => {
      const absolutePath = path.join(root, entry.name);
      return entry.isDirectory() ? filesUnder(absolutePath) : [absolutePath];
    })
    .sort((left, right) => left.localeCompare(right, "en"));
}

function sha256File(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function treeSnapshot(root, { content = false } = {}) {
  const entries = filesUnder(root).map((absolutePath) => {
    const stat = fs.statSync(absolutePath);
    return {
      path: path.relative(root, absolutePath).replaceAll("\\", "/"),
      size: stat.size,
      mtimeMs: stat.mtimeMs,
      ...(content ? { sha256: sha256File(absolutePath) } : {}),
    };
  });
  return {
    files: entries.length,
    bytes: entries.reduce((sum, entry) => sum + entry.size, 0),
    hash: crypto.createHash("sha256").update(JSON.stringify(entries)).digest("hex"),
  };
}

function productionSnapshot() {
  return {
    accepted: sha256File(path.join(PROJECT_ROOT, ".route-v2-cache", "accepted-routes.json")),
    cache: treeSnapshot(path.join(PROJECT_ROOT, ".route-v2-cache")),
    knowledge: treeSnapshot(path.join(PROJECT_ROOT, "data", "knowledge"), { content: true }),
    localEvidenceExists: fs.existsSync(path.join(PROJECT_ROOT, ".route-v2-local-evidence")),
  };
}

const productionBefore = productionSnapshot();

assert.deepEqual(parseOfflineEvidenceCollectorArgs([]), {
  limit: 20,
  type: "all",
  country: "",
  dryRun: false,
  resume: false,
  canary: false,
});
assert.deepEqual(parseOfflineEvidenceCollectorArgs(["--limit", "7", "--type", "season", "--country", "JP", "--dry-run", "--resume"]), {
  limit: 7,
  type: "season",
  country: "JP",
  dryRun: true,
  resume: true,
  canary: false,
});
assert.throws(() => parseOfflineEvidenceCollectorArgs(["--limit", "31"]), /between 1 and 30/u);
assert.throws(() => parseOfflineEvidenceCollectorArgs(["--type", "invalid"]), /route-leg, season, or all/u);
assert.throws(() => parseOfflineEvidenceCollectorArgs(["--unknown"]), /Unknown option/u);
assert.equal(isRouteV2OfflineEvidenceCollectionEnabled({}), false);
assert.equal(isRouteV2OfflineEvidenceCollectionEnabled({ ROUTE_V2_OFFLINE_EVIDENCE_COLLECTION_ENABLED: "true" }), true);

const entityRepository = createPublishedKnowledgeEntityLayerRepository({ projectRoot: PROJECT_ROOT });
const entityResolver = createOfflineEvidenceEntityResolver({
  repository: entityRepository,
  fallbacks: { JP: ROUTE_V2_EVIDENCE_3B_JAPAN_PILOT_ENTITIES },
});
const japanCountry = entityRepository.listCountries().find((country) => country.isoAlpha2 === "JP");
assert(japanCountry);

function harness(name) {
  const root = path.join(tempRoot, name);
  const env = {
    ROUTE_V2_OFFLINE_EVIDENCE_COLLECTION_ENABLED: "true",
    ROUTE_V2_LOCAL_EVIDENCE_INDEX_ENABLED: "true",
    ROUTE_V2_EVIDENCE_BUNDLE_ENABLED: "false",
    ROUTE_V2_EVIDENCE_ONLINE_ENABLED: "false",
    ROUTE_V2_TAVILY_EVIDENCE_ENABLED: "false",
    ROUTE_V2_WIKIVOYAGE_EVIDENCE_ENABLED: "false",
    ROUTE_WEB_SEARCH_API_KEY: TEST_API_KEY,
    ROUTE_V2_ROUTE_LEG_EVIDENCE_PATH: path.join(root, "route-leg-evidence.jsonl"),
    ROUTE_V2_SEASON_EVIDENCE_PATH: path.join(root, "season-evidence.jsonl"),
    ROUTE_V2_MISSING_EVIDENCE_MANIFEST_PATH: path.join(root, "missing-evidence-manifest.jsonl"),
  };
  const now = () => FIXED_NOW;
  return {
    root,
    env,
    now,
    repository: createLocalEvidenceRepository({ env, storageRoot: root, now }),
  };
}

const pilot = harness("japan-pilot");
const byName = new Map(ROUTE_V2_EVIDENCE_3B_JAPAN_PILOT_ENTITIES.map((entity) => [entity.sourceTitle, entity]));
function qid(name) {
  const entity = byName.get(name);
  assert(entity, `Missing Japan pilot entity: ${name}`);
  return entity.wikidataId;
}

const routeSpecs = [
  ["Tokyo", "Kyoto", "shinkansen"],
  ["Tokyo", "Kyoto", "rail"],
  ["Kyoto", "Tokyo", "shinkansen"],
  ["Osaka", "Kyoto", "rail"],
  ["Kyoto", "Osaka", "rail"],
  ["Osaka", "Nara", "rail"],
  ["Nara", "Osaka", "rail"],
  ["Kanazawa", "Takayama", "road"],
  ["Takayama", "Kanazawa", "road"],
  ["Takayama", "Matsumoto", "rail"],
  ["Matsumoto", "Takayama", "rail"],
  ["Tokyo", "Matsumoto", "rail"],
  ["Kyoto", "Nara", "rail"],
];

const routeRecords = [];
for (const [fromName, toName, transportMode] of routeSpecs) {
  const built = buildMissingRouteLegEvidence({ fromEntityId: qid(fromName), toEntityId: qid(toName), transportMode }, { now: pilot.now });
  assert.equal(built.created, true);
  assert.equal(pilot.repository.routeLegStore.upsert(built.record).persisted, true);
  routeRecords.push({ fromName, toName, transportMode, record: built.record });
  const missing = pilot.repository.missingEvidenceStore.aggregate({
    evidenceType: "route-leg",
    targetKey: routeLegEvidenceKey(built.record),
    legEvidenceId: built.record.legEvidenceId,
    requestedByBundleIds: [`bundle-route-${routeRecords.length}`],
    selectedCandidate: true,
    critical: true,
  });
  assert.equal(missing.persisted, true);
}

const seasonRecords = [];
for (const city of ["Tokyo", "Osaka", "Kyoto", "Nara", "Kanazawa", "Takayama", "Matsumoto"]) {
  const built = buildMissingSeasonEvidence({ entityId: qid(city), month: 2 }, { now: pilot.now });
  assert.equal(built.created, true);
  assert.equal(pilot.repository.seasonStore.upsert(built.record).persisted, true);
  seasonRecords.push({ city, record: built.record });
  const missing = pilot.repository.missingEvidenceStore.aggregate({
    evidenceType: "season",
    targetKey: seasonEvidenceKey(built.record),
    seasonEvidenceId: built.record.seasonEvidenceId,
    requestedByBundleIds: [`bundle-season-${city}`],
    selectedCandidate: true,
    critical: true,
  });
  assert.equal(missing.persisted, true);
}

const duplicateRoute = routeRecords[0].record;
assert.equal(pilot.repository.missingEvidenceStore.aggregate({
  evidenceType: "route-leg",
  targetKey: routeLegEvidenceKey(duplicateRoute),
  legEvidenceId: duplicateRoute.legEvidenceId,
  requestedByBundleIds: ["bundle-route-duplicate"],
  selectedCandidate: true,
  critical: true,
}).persisted, true);
assert.equal(pilot.repository.missingEvidenceStore.list().length, 20, "duplicate request must merge into one physical task");
const duplicateManifest = pilot.repository.missingEvidenceStore.list().find((item) => item.legEvidenceId === duplicateRoute.legEvidenceId);
assert.equal(duplicateManifest.requestedByBundleIds.length, 2);

const providerCalls = [];
function ok(results) {
  return { ok: true, configured: true, attempted: true, attempts: 1, failure: "", results, retrievedAt: FIXED_NOW };
}
function failure(reason) {
  return { ok: false, configured: true, attempted: true, attempts: 1, failure: reason, results: [], retrievedAt: FIXED_NOW };
}
const tokyoKyoto130 = {
  sourceUrl: "https://global.jr-central.co.jp/en/onlinebooking/contents/kyoto/",
  sourceTitle: "Kyoto by Shinkansen",
  sourceSnippet: "Tokyo to Kyoto by Tokaido Shinkansen takes about 130 minutes.",
};
const tokyoKyotoServices = {
  sourceUrl: "https://travel.jr-central.co.jp/plan/tokushu/shinkansen/tokyo-kyoto/",
  sourceTitle: "Tokyo to Kyoto Shinkansen services",
  sourceSnippet: "Tokyo to Kyoto takes 135 minutes by Nozomi, 160 minutes by Hikari, or 220 minutes by Kodama.",
};
const untrustedTokyoKyotoClaim = {
  sourceUrl: "https://example.com/unverified-tokyo-kyoto",
  sourceTitle: "Unverified Tokyo to Kyoto claim",
  sourceSnippet: "Tokyo to Kyoto by train takes 5 minutes according to an unattributed aggregator.",
};
const provider = {
  providerId: "injected-official-source-pilot",
  capabilities: { configured: true, evidenceSource: true, realtimeUserRequest: false, producesRouteRecord: false },
  async searchEvidence({ query }) {
    providerCalls.push(query);
    if (/^Tokyo to Kyoto official shinkansen/iu.test(query)) return ok([tokyoKyoto130, untrustedTokyoKyotoClaim]);
    if (/^Tokyo to Kyoto official rail/iu.test(query)) return ok([tokyoKyoto130, tokyoKyotoServices]);
    if (/^Kyoto to Tokyo official shinkansen/iu.test(query)) return ok([tokyoKyoto130]);
    if (/^Osaka to Kyoto official rail/iu.test(query)) {
      return ok([{
        sourceUrl: "https://www.westjr.co.jp/travel-information/en/plan-your-trip/routes-schedule/",
        sourceTitle: "JR West route maps and timetables",
        sourceSnippet: "Rail routes connect Osaka and Kyoto through JR West services.",
      }]);
    }
    if (/^Kyoto to Osaka official rail/iu.test(query)) return failure("timeout");
    if (/^Osaka to Nara official rail/iu.test(query)) return ok([{
      sourceUrl: "https://example.com/unverified-osaka-nara",
      sourceTitle: "Unverified Osaka to Nara claim",
      sourceSnippet: "Osaka to Nara by train takes 30 minutes according to an unattributed aggregator.",
    }]);
    if (/^Tokyo February/iu.test(query) || /^Osaka February/iu.test(query)) {
      return ok([{
        sourceUrl: "https://www.japan.travel/en/guide/february/",
        sourceTitle: "Japan in February",
        sourceSnippet: "In February, snow can fall in Tokyo and Osaka.",
      }]);
    }
    if (/^Kyoto February/iu.test(query)) {
      return ok([{
        sourceUrl: "https://www.kkr.mlit.go.jp/news/top/press/20260209-3tuukoudomezixtusizyoukyou.html",
        sourceTitle: "February heavy snow closures in Kyoto",
        sourceSnippet: "In February 2026, heavy snow caused preventive road closures affecting Kyoto.",
      }]);
    }
    if (/^Matsumoto February/iu.test(query)) {
      return ok([{
        sourceUrl: "https://www.japan.travel/en/guide/february/",
        sourceTitle: "Japan in February",
        sourceSnippet: "February is among the coldest months in Japan.",
      }]);
    }
    return failure("no-result");
  },
};

const beforeDryRun = {
  legs: fs.readFileSync(pilot.env.ROUTE_V2_ROUTE_LEG_EVIDENCE_PATH, "utf8"),
  seasons: fs.readFileSync(pilot.env.ROUTE_V2_SEASON_EVIDENCE_PATH, "utf8"),
  missing: fs.readFileSync(pilot.env.ROUTE_V2_MISSING_EVIDENCE_MANIFEST_PATH, "utf8"),
};
const dryRun = await collectOfflineEvidenceBatch({
  repository: pilot.repository,
  provider,
  entityResolver,
  env: pilot.env,
  limit: 3,
  type: "route-leg",
  country: "JP",
  dryRun: true,
  maxAttempts: 1,
  now: pilot.now,
});
assert.equal(dryRun.ok, true);
assert.equal(dryRun.tasks.length, 3, "dry-run must honor limit");
assert(dryRun.tasks.every((task) => task.evidenceType === "route-leg"), "dry-run must honor type filter");
assert.equal(dryRun.stats.networkRequests, 0);
assert.equal(dryRun.stats.claimed, 0);
assert.equal(providerCalls.length, 0, "dry-run must not call provider");
assert.deepEqual(beforeDryRun, {
  legs: fs.readFileSync(pilot.env.ROUTE_V2_ROUTE_LEG_EVIDENCE_PATH, "utf8"),
  seasons: fs.readFileSync(pilot.env.ROUTE_V2_SEASON_EVIDENCE_PATH, "utf8"),
  missing: fs.readFileSync(pilot.env.ROUTE_V2_MISSING_EVIDENCE_MANIFEST_PATH, "utf8"),
}, "dry-run must not write evidence or manifest files");

const countryEntityDryRun = await collectOfflineEvidenceBatch({
  repository: pilot.repository,
  provider,
  entityResolver,
  env: pilot.env,
  limit: 2,
  type: "season",
  country: japanCountry.entityId,
  dryRun: true,
  maxAttempts: 1,
  now: pilot.now,
});
assert.equal(countryEntityDryRun.tasks.length, 2, "country entity ID filter must work");
const wrongCountryDryRun = await collectOfflineEvidenceBatch({
  repository: pilot.repository,
  provider,
  entityResolver,
  env: pilot.env,
  limit: 20,
  type: "all",
  country: "NL",
  dryRun: true,
  maxAttempts: 1,
  now: pilot.now,
});
assert.equal(wrongCountryDryRun.tasks.length, 0, "country filter must exclude unrelated tasks");

let cliFetchCalls = 0;
const cliDryRun = await runRouteV2LocalEvidenceCollector({
  args: ["--limit", "2", "--type", "season", "--country", "JP", "--dry-run"],
  env: pilot.env,
  storageRoot: pilot.root,
  fetchImpl: async () => {
    cliFetchCalls += 1;
    throw new Error("dry-run must not fetch");
  },
  now: pilot.now,
});
assert.equal(cliDryRun.ok, true);
assert.equal(cliDryRun.tasks.length, 2);
assert.equal(cliFetchCalls, 0);

const pilotStartedAt = performance.now();
const pilotRun = await collectOfflineEvidenceBatch({
  repository: pilot.repository,
  provider,
  entityResolver,
  env: pilot.env,
  limit: 20,
  type: "all",
  country: "JP",
  maxAttempts: 1,
  concurrency: 2,
  now: pilot.now,
});
const pilotElapsedMs = Number((performance.now() - pilotStartedAt).toFixed(3));
assert.equal(pilotRun.ok, true);
assert.equal(pilotRun.stats.claimed, 20);
assert.equal(pilotRun.stats.networkRequests, 20);
assert.equal(providerCalls.length, 20);
assert.equal(pilotRun.stats.resolved, 4);
assert.equal(pilotRun.stats.needsReview, 4);
assert.equal(pilotRun.stats.retryableFailures, 12);
assert.equal(pilotRun.stats.permanentFailures, 0);
assert.equal(pilotRun.stats.routeLegEvidenceWritten, 3);
assert.equal(pilotRun.stats.seasonEvidenceWritten, 3);

const tokyoKyotoShinkansen = routeRecords.find((item) => item.fromName === "Tokyo" && item.toName === "Kyoto" && item.transportMode === "shinkansen").record;
const resolvedLeg = pilot.repository.index.getRouteLegById(tokyoKyotoShinkansen.legEvidenceId);
assert.equal(resolvedLeg.feasibilityStatus, "feasible");
assert.equal(resolvedLeg.durationMinMinutes, 130);
assert.equal(resolvedLeg.durationMaxMinutes, 130);
assert.equal(resolvedLeg.transferCount, null);
assert.equal(resolvedLeg.frequencyLevel, "unknown");
assert.equal(resolvedLeg.sources.length, 1);
assert.equal(resolvedLeg.sourceRefs.length, 1);
assert.equal(resolvedLeg.sources[0].url, tokyoKyoto130.sourceUrl, "untrusted search results must not affect stored facts");
assert.equal(validateLocalEvidenceSource(resolvedLeg.sources[0]).accepted, true);
assert.equal(resolvedLeg.sources[0].sourceType, "official-transport-operator");
assert.match(resolvedLeg.sources[0].contentHash, /^[a-f0-9]{64}$/u);

const tokyoKyotoRail = routeRecords.find((item) => item.fromName === "Tokyo" && item.toName === "Kyoto" && item.transportMode === "rail").record;
const conflictingLeg = pilot.repository.index.getRouteLegById(tokyoKyotoRail.legEvidenceId);
assert.equal(conflictingLeg.feasibilityStatus, "needs-evidence");
assert.equal(conflictingLeg.durationMinMinutes, null);
assert(conflictingLeg.conflicts.some((entry) => entry.reason === "qualified-sources-have-materially-different-duration-ranges"));
assert.equal(conflictingLeg.sources.length, 2, "conflicting sources must both remain traceable");
const conflictTask = pilot.repository.missingEvidenceStore.list().find((item) => item.legEvidenceId === tokyoKyotoRail.legEvidenceId);
assert.equal(conflictTask.status, "needs-review");

const reverseLeg = routeRecords.find((item) => item.fromName === "Kyoto" && item.toName === "Tokyo" && item.transportMode === "shinkansen").record;
const reverseStored = pilot.repository.index.getRouteLegById(reverseLeg.legEvidenceId);
assert.equal(reverseStored.sourceRefs.length, 0, "forward evidence must not be reused for the reverse direction");
assert.equal(reverseStored.durationMinMinutes, null);
const reverseTask = pilot.repository.missingEvidenceStore.list().find((item) => item.legEvidenceId === reverseLeg.legEvidenceId);
assert.equal(reverseTask.status, "needs-review");

const timeoutLeg = routeRecords.find((item) => item.fromName === "Kyoto" && item.toName === "Osaka").record;
const timeoutTask = pilot.repository.missingEvidenceStore.list().find((item) => item.legEvidenceId === timeoutLeg.legEvidenceId);
assert.equal(timeoutTask.status, "pending");
assert.equal(timeoutTask.attemptCount, 1);
assert(timeoutTask.diagnostics.some((entry) => entry.code === "timeout"));

const untrustedOnlyLeg = routeRecords.find((item) => item.fromName === "Osaka" && item.toName === "Nara").record;
const untrustedOnlyStored = pilot.repository.index.getRouteLegById(untrustedOnlyLeg.legEvidenceId);
const untrustedOnlyTask = pilot.repository.missingEvidenceStore.list().find((item) => item.legEvidenceId === untrustedOnlyLeg.legEvidenceId);
assert.equal(untrustedOnlyStored.sourceRefs.length, 0);
assert.equal(untrustedOnlyStored.durationMinMinutes, null, "untrusted-only search results must not create facts");
assert.equal(untrustedOnlyTask.status, "pending");
assert(untrustedOnlyTask.diagnostics.some((entry) => entry.code === "no-qualified-official-source"));

const partialLeg = routeRecords.find((item) => item.fromName === "Osaka" && item.toName === "Kyoto").record;
const partialTask = pilot.repository.missingEvidenceStore.list().find((item) => item.legEvidenceId === partialLeg.legEvidenceId);
assert.equal(partialTask.status, "needs-review", "a qualified reachability source without duration must not resolve the task");

for (const city of ["Tokyo", "Osaka", "Kyoto"]) {
  const placeholder = seasonRecords.find((item) => item.city === city).record;
  const stored = pilot.repository.index.getSeasonById(placeholder.seasonEvidenceId);
  assert.equal(stored.suitabilityStatus, "unknown", `${city}: hard-risk evidence must not claim suitability`);
  assert(stored.sourceRefs.length > 0, `${city}: qualified season source expected`);
  assert(stored.weatherRisks.length + stored.transportRisks.length + stored.closureRisks.length > 0, `${city}: hard risk expected`);
}
const matsumotoSeason = seasonRecords.find((item) => item.city === "Matsumoto").record;
const matsumotoStored = pilot.repository.index.getSeasonById(matsumotoSeason.seasonEvidenceId);
assert.equal(matsumotoStored.sourceRefs.length, 0, "marketing or non-targeted text must not become season evidence");
const matsumotoTask = pilot.repository.missingEvidenceStore.list().find((item) => item.seasonEvidenceId === matsumotoSeason.seasonEvidenceId);
assert.equal(matsumotoTask.status, "needs-review");

const evidenceCountsAfterFirstRun = {
  legs: pilot.repository.routeLegStore.list().length,
  seasons: pilot.repository.seasonStore.list().length,
  sources: [
    ...pilot.repository.routeLegStore.list().flatMap((record) => record.sources || []),
    ...pilot.repository.seasonStore.list().flatMap((record) => record.sources || []),
  ].length,
};
providerCalls.length = 0;
const exactRerun = await collectOfflineEvidenceBatch({
  repository: pilot.repository,
  provider,
  entityResolver,
  env: pilot.env,
  limit: 20,
  type: "all",
  country: "JP",
  maxAttempts: 1,
  now: pilot.now,
});
assert.equal(exactRerun.stats.claimed, 0);
assert.equal(exactRerun.stats.networkRequests, 0);
assert.equal(providerCalls.length, 0);
assert.deepEqual(evidenceCountsAfterFirstRun, {
  legs: pilot.repository.routeLegStore.list().length,
  seasons: pilot.repository.seasonStore.list().length,
  sources: [
    ...pilot.repository.routeLegStore.list().flatMap((record) => record.sources || []),
    ...pilot.repository.seasonStore.list().flatMap((record) => record.sources || []),
  ].length,
}, "identical rerun must not create duplicate evidence or sources");

providerCalls.length = 0;
const resumeRun = await collectOfflineEvidenceBatch({
  repository: pilot.repository,
  provider,
  entityResolver,
  env: pilot.env,
  limit: 20,
  type: "all",
  country: "JP",
  resume: true,
  maxAttempts: 2,
  now: pilot.now,
});
assert.equal(resumeRun.stats.claimed, 16, "resume must skip the four resolved tasks");
assert.equal(resumeRun.stats.networkRequests, 16);
assert.equal(resumeRun.stats.duplicateSkipped, 2, "conflict and partial evidence upserts should be idempotent");
assert.equal(providerCalls.some((query) => /^Tokyo to Kyoto official shinkansen/iu.test(query)), false, "resolved route task must not be reclaimed");
assert.equal(providerCalls.some((query) => /^Tokyo February/iu.test(query)), false, "resolved season task must not be reclaimed");
assert.deepEqual(evidenceCountsAfterFirstRun, {
  legs: pilot.repository.routeLegStore.list().length,
  seasons: pilot.repository.seasonStore.list().length,
  sources: [
    ...pilot.repository.routeLegStore.list().flatMap((record) => record.sources || []),
    ...pilot.repository.seasonStore.list().flatMap((record) => record.sources || []),
  ].length,
}, "resume must not duplicate physical evidence or sources");

const unconfigured = harness("provider-unconfigured");
const unconfiguredBuilt = buildMissingRouteLegEvidence({ fromEntityId: qid("Tokyo"), toEntityId: qid("Kyoto"), transportMode: "shinkansen" }, { now: unconfigured.now });
unconfigured.repository.routeLegStore.upsert(unconfiguredBuilt.record);
unconfigured.repository.missingEvidenceStore.aggregate({
  evidenceType: "route-leg",
  targetKey: routeLegEvidenceKey(unconfiguredBuilt.record),
  legEvidenceId: unconfiguredBuilt.record.legEvidenceId,
  requestedByBundleIds: ["bundle-unconfigured"],
});
const unconfiguredBefore = unconfigured.repository.missingEvidenceStore.list()[0];
const unconfiguredRun = await collectOfflineEvidenceBatch({
  repository: unconfigured.repository,
  provider: { capabilities: { configured: false }, searchEvidence: async () => { throw new Error("must not call"); } },
  entityResolver,
  env: unconfigured.env,
  limit: 1,
  now: unconfigured.now,
});
assert.equal(unconfiguredRun.ok, false);
assert.equal(unconfiguredRun.reason, "provider-not-configured");
assert.deepEqual(unconfigured.repository.missingEvidenceStore.list()[0], unconfiguredBefore, "unconfigured provider must not mutate task state");

const writeFailure = harness("atomic-write-failure");
const writeFailureBuilt = buildMissingRouteLegEvidence({ fromEntityId: qid("Tokyo"), toEntityId: qid("Kyoto"), transportMode: "shinkansen" }, { now: writeFailure.now });
writeFailure.repository.routeLegStore.upsert(writeFailureBuilt.record);
writeFailure.repository.missingEvidenceStore.aggregate({
  evidenceType: "route-leg",
  targetKey: routeLegEvidenceKey(writeFailureBuilt.record),
  legEvidenceId: writeFailureBuilt.record.legEvidenceId,
  requestedByBundleIds: ["bundle-write-failure"],
});
const evidenceFileBeforeFailure = fs.readFileSync(writeFailure.env.ROUTE_V2_ROUTE_LEG_EVIDENCE_PATH, "utf8");
const failingRepository = {
  ...writeFailure.repository,
  routeLegStore: {
    ...writeFailure.repository.routeLegStore,
    upsert() { return { written: false, persisted: false, reason: "injected-atomic-write-failed" }; },
  },
};
const writeFailureRun = await collectOfflineEvidenceBatch({
  repository: failingRepository,
  provider,
  entityResolver,
  env: writeFailure.env,
  limit: 1,
  maxAttempts: 1,
  now: writeFailure.now,
});
assert.equal(writeFailureRun.stats.permanentFailures, 1);
assert.equal(fs.readFileSync(writeFailure.env.ROUTE_V2_ROUTE_LEG_EVIDENCE_PATH, "utf8"), evidenceFileBeforeFailure, "failed atomic write must preserve existing evidence file");
assert.equal(writeFailure.repository.missingEvidenceStore.list()[0].status, "failed");

const searchSource = fs.readFileSync(path.join(PROJECT_ROOT, "src/lib/routes/route-search-service.mjs"), "utf8");
const plannerSource = fs.readFileSync(path.join(PROJECT_ROOT, "src/lib/routes/route-composition-planner.mjs"), "utf8");
assert.equal(searchSource.includes("offline-evidence-collector"), false, "Search must not import the offline collector");
assert.equal(plannerSource.includes("offline-evidence-collector"), false, "Planner must not import the offline collector");
const sourceFiles = [
  "scripts/collect-route-v2-local-evidence.mjs",
  "src/lib/routes/offline-evidence-collector.mjs",
  "src/lib/routes/offline-evidence-fact-adapter.mjs",
].map((relativePath) => fs.readFileSync(path.join(PROJECT_ROOT, relativePath), "utf8")).join("\n");
assert.equal(sourceFiles.includes(TEST_API_KEY), false, "API keys must not be present in source files");
assert.equal(JSON.stringify({ pilotRun, exactRerun, resumeRun, unconfiguredRun, writeFailureRun }).includes(TEST_API_KEY), false, "API keys must not appear in diagnostics or results");

const productionAfter = productionSnapshot();
assert.deepEqual(productionAfter, productionBefore, "Accepted, Cache, Knowledge, and real local-evidence state must remain unchanged");

console.log(JSON.stringify({
  status: "PASS",
  featureFlagDefault: isRouteV2OfflineEvidenceCollectionEnabled({}),
  cli: {
    command: "node scripts/collect-route-v2-local-evidence.mjs --limit 20 --type all --country JP --dry-run --resume",
    defaultLimit: 20,
    hardLimit: 30,
    dryRunProviderCalls: cliFetchCalls,
  },
  pilot: {
    manifestTasks: 20,
    duplicateRequestersMerged: duplicateManifest.requestedByBundleIds.length,
    ...pilotRun.stats,
    measuredElapsedMs: pilotElapsedMs,
  },
  rerun: exactRerun.stats,
  resume: resumeRun.stats,
  sourceTypes: [...new Set([
    ...pilot.repository.routeLegStore.list().flatMap((record) => (record.sources || []).map((source) => source.sourceType)),
    ...pilot.repository.seasonStore.list().flatMap((record) => (record.sources || []).map((source) => source.sourceType)),
  ])].sort(),
  publishers: [...new Set([
    ...pilot.repository.routeLegStore.list().flatMap((record) => (record.sources || []).map((source) => source.publisher)),
    ...pilot.repository.seasonStore.list().flatMap((record) => (record.sources || []).map((source) => source.publisher)),
  ])].sort(),
  faultIsolation: {
    providerNotConfigured: unconfiguredRun.reason,
    writeFailurePreservedEvidence: true,
    timeoutRemainedPending: timeoutTask.status === "pending",
    reverseDirectionIsolated: reverseStored.sourceRefs.length === 0,
    conflictNeedsReview: conflictTask.status === "needs-review",
  },
  productionAssets: productionAfter,
  tempRoot,
}, null, 2));
