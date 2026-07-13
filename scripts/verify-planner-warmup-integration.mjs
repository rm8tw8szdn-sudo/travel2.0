// Phase 5 回归：planner 接入 warmup（scheduled + admin CLI）+ 前台产品约束 AC
// 运行：node scripts/verify-planner-warmup-integration.mjs （cwd=travel-collection/）
// 验证：
//   1. happy path：runPlannerPhase 跑通、记录进 acceptedRepository、coverAsset 非空、feed 可见
//   2. 策略 seam：注入 spy strategy → runPlannerPhase 真用其返回值（seed 不是写死的）
//   3. 降级：env 全缺 → llm/evidence 关闭、仍产确定性骨架
//   4. 前台约束 AC（6 条 + 授权边界）：
//      Feed/Search/Detail 只读 repo、search miss 只 enqueue 不现场生成、cursor 稳定、排序稳定、前台不调 Planner
import assert from "node:assert/strict";
import os from "node:os";
import fs from "node:fs";
import path from "node:path";
import {
  createAcceptedRouteRepository,
  createEvidenceRepository,
  createRouteDiscovery,
  createRouteJobStore,
  createConfiguredLlmRefineProvider,
  runRouteRepositoryWarmup,
} from "../src/lib/routes/index.mjs";

const NODE = process.argv[1] || "";

// stub text enrichment provider：warmup 的 Wikivoyage 富化用（batchSize:0 时其实不调，但需绕过 provider-required gate）
const stubTextEnrichmentProvider = {
  providerId: "stub-text",
  capabilities: { textEnrichment: true, configured: true },
  async enrich(record) { return record; },
};

// ─── mock fetchImpl：SPARQL 返 JP 5 目的地（含 sourceTitle 英文 label）；Wikimedia 返合规封面 ─
// JP_POOL 形状对齐 verify-planner-pipeline.mjs + 补 sourceTitle（= Wikidata en label）
const JP_POOL_SPARQL = {
  results: {
    bindings: [
      { place: { value: "http://www.wikidata.org/entity/Q1490" }, zh: { value: "东京都" }, en: { value: "Tokyo" }, type: { value: "http://www.wikidata.org/entity/Q515" }, typeLabel: { value: "city" }, coord: { value: "Point(139.6503 35.6762)" } },
      { place: { value: "http://www.wikidata.org/entity/Q39231" }, zh: { value: "富士山" }, en: { value: "Mount Fuji" }, type: { value: "http://www.wikidata.org/entity/Q8502" }, typeLabel: { value: "mountain" }, coord: { value: "Point(138.7274 35.3606)" } },
      { place: { value: "http://www.wikidata.org/entity/Q34600" }, zh: { value: "京都市" }, en: { value: "Kyoto" }, type: { value: "http://www.wikidata.org/entity/Q515" }, typeLabel: { value: "city" }, coord: { value: "Point(135.7681 35.0116)" } },
      { place: { value: "http://www.wikidata.org/entity/Q169134" }, zh: { value: "奈良市" }, en: { value: "Nara" }, type: { value: "http://www.wikidata.org/entity/Q515" }, typeLabel: { value: "city" }, coord: { value: "Point(135.8048 34.6851)" } },
      { place: { value: "http://www.wikidata.org/entity/Q35765" }, zh: { value: "大阪市" }, en: { value: "Osaka" }, type: { value: "http://www.wikidata.org/entity/Q515" }, typeLabel: { value: "city" }, coord: { value: "Point(135.5023 34.6937)" } },
    ],
  },
};

// 合规封面页：author+license 非空 + 尺寸 providerUsable（宽≥800 高≥450 比例 1.2-2.2）
function commonsCoverPage(title) {
  return {
    title: `File:${title}`,
    imageinfo: [{
      url: "https://upload.wikimedia.org/wikipedia/commons/a/aa/Tokyo_Skyline.jpg",
      descriptionurl: "https://commons.wikimedia.org/wiki/File:Tokyo_Skyline.jpg",
      thumburl: "https://upload.wikimedia.org/wikipedia/commons/thumb/a/aa/Tokyo_Skyline.jpg/1400px-Tokyo_Skyline.jpg",
      thumbwidth: 1400, thumbheight: 788, width: 4000, height: 2250,
      extmetadata: {
        Artist: { value: "TestAuthor" },
        LicenseShortName: { value: "CC BY-SA 4.0" },
        DateTimeOriginal: { value: "2024-01-01" },
      },
    }],
  };
}

function makeMockFetchImpl() {
  return async function mockFetch(url, opts = {}) {
    const u = String(url);
    // SPARQL 端点
    if (u.startsWith("https://query.wikidata.org/sparql")) {
      return { ok: true, status: 200, json: async () => JP_POOL_SPARQL, headers: new Map() };
    }
    // Wikipedia / Wikivoyage pageimages prop（destinationPageImage 取 pages[0].pageimage）
    if (u.includes("action=query") && u.includes("prop=pageimages")) {
      return { ok: true, status: 200, json: async () => ({ query: { pages: [{ pageimage: "Tokyo_Skyline.jpg" }] } }), headers: new Map() };
    }
    // Commons imageinfo prop（queryPages 取 pages）
    if (u.includes("action=query") && u.includes("prop=imageinfo")) {
      return { ok: true, status: 200, json: async () => ({ query: { pages: [commonsCoverPage("Tokyo_Skyline.jpg")] } }), headers: new Map() };
    }
    return { ok: false, status: 404, json: async () => ({}), headers: new Map() };
  };
}

// ─── 1. happy path：planner phase 跑通、记录进库、feed 可见 ────────────────
{
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "route-warmup-happy-"));
  const storagePath = path.join(tempDir, "accepted.json");
  const report = await runRouteRepositoryWarmup({
    env: { ...process.env, ROUTE_WARMUP_DELAY_MS: "0" },
    textEnrichmentProvider: stubTextEnrichmentProvider,
    storagePath,
    evidenceStoragePath: path.join(tempDir, "evidence.json"),
    syncStatePath: path.join(tempDir, "sync.json"),
    knowledgeGraphPoolPath: path.join(tempDir, "kg.json"),
    batchSize: 0, // 跳过 Wikivoyage 批
    plannerEnabled: true,
    plannerBatchSize: 1,
    plannerDeadlineMs: 60_000,
    plannerCountries: ["JP"],
    fetchImpl: makeMockFetchImpl(),
    now: () => new Date("2026-06-30T00:00:00Z"),
  });

  assert.ok(report.ok, `warmup report should be ok: ${JSON.stringify(report)}`);
  const phase = report.plannerPhase;
  assert.ok(phase, "report must carry plannerPhase");
  assert.equal(phase.ran, true, `plannerPhase.ran must be true, got ${JSON.stringify(phase)}`);
  assert.ok(phase.cacheCountries.includes("JP"), `SPARQL cache must include JP: ${JSON.stringify(phase.cacheCountries)}`);

  // happy path 必须至少接受 1 条（确定性骨架在 mock KG 下必产出）
  assert.ok(phase.accepted >= 1, `plannerPhase.accepted >= 1, got ${phase.accepted}. rejected=${phase.rejected} reasons=${JSON.stringify(phase.reasonCounts)} error=${phase.error || ""}`);

  // 取 accepted 记录验证字段
  const repo = createAcceptedRouteRepository({ storagePath });
  const all = repo.list({ limit: 100 });
  const allRecords = all.records || all;
  const plannerRecord = allRecords.find((r) => r.sourceType === "planner-designed");
  assert.ok(plannerRecord, `repository must contain a planner-designed record, got types: ${JSON.stringify(allRecords.map((r) => r.sourceType))}`);
  assert.equal(plannerRecord.destinationSource, "knowledge-graph", "hard invariant: destinations from knowledge-graph");
  assert.ok(plannerRecord.coverAsset?.imageUrl, `coverAsset.imageUrl must be non-null (upsert gate), got ${JSON.stringify(plannerRecord.coverAsset)}`);
  assert.equal(plannerRecord.contentQualityStatus, "accepted", `contentQualityStatus must be accepted, got ${plannerRecord.contentQualityStatus}`);
  assert.ok(["enriched", "needsEvidence"].includes(plannerRecord.enrichmentStatus), `enrichmentStatus set, got ${plannerRecord.enrichmentStatus}`);

  console.log(`[1/6] happy: accepted=${phase.accepted} rejected=${phase.rejected} contexts=${JSON.stringify(phase.contexts)} record.id=${plannerRecord.id} cover=${Boolean(plannerRecord.coverAsset?.imageUrl)}`);
}

// ─── 2. 策略 seam：注入 spy strategy → runPlannerPhase 真用其返回值 ──────────
// 证明 seed 不是写死的：spy 返回 deep-dive（非默认 classic-first-trip），plannerPhase.contexts 应等于 spy 返回
{
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "route-warmup-strat-"));
  const storagePath = path.join(tempDir, "accepted.json");
  const spyContexts = [{ country: "JP", countryName: "日本", countryCode: "JP", countryWikidataId: "Q17", travelStyle: "deep-dive", durationDays: 10 }];
  let selectCalled = 0;
  const spyStrategy = {
    id: "spy",
    select({ stats, pool, limit }) {
      selectCalled += 1;
      assert.ok(pool && pool.JP && pool.JP.length >= 4, "strategy.select must receive pool with JP");
      assert.ok(stats, "strategy.select must receive stats");
      return spyContexts.slice(0, limit);
    },
  };

  const report = await runRouteRepositoryWarmup({
    env: { ...process.env, ROUTE_WARMUP_DELAY_MS: "0" },
    textEnrichmentProvider: stubTextEnrichmentProvider,
    storagePath,
    evidenceStoragePath: path.join(tempDir, "evidence.json"),
    syncStatePath: path.join(tempDir, "sync.json"),
    knowledgeGraphPoolPath: path.join(tempDir, "kg.json"),
    batchSize: 0,
    plannerEnabled: true,
    plannerBatchSize: 1,
    plannerDeadlineMs: 60_000,
    plannerCountries: ["JP"],
    plannerStrategy: spyStrategy,
    fetchImpl: makeMockFetchImpl(),
    now: () => new Date("2026-06-30T00:00:00Z"),
  });

  const phase = report.plannerPhase;
  assert.ok(selectCalled >= 1, `spy strategy.select must be called, got ${selectCalled}`);
  assert.equal(phase.strategyId, "spy", `plannerPhase.strategyId must be spy, got ${phase.strategyId}`);
  assert.equal(phase.contexts.length, 1, `contexts must equal spy return length, got ${JSON.stringify(phase.contexts)}`);
  assert.equal(phase.contexts[0].travelStyle, "deep-dive", `contexts[0].travelStyle must be deep-dive (spy override), got ${phase.contexts[0].travelStyle}`);
  // 关键：非默认 seed 的 classic-first-trip → 证明 seed 没写死
  assert.notEqual(phase.contexts[0].travelStyle, "classic-first-trip", "spy override must differ from default seed classic-first-trip");

  console.log(`[2/6] strategy seam: selectCalled=${selectCalled} strategyId=${phase.strategyId} contexts=${JSON.stringify(phase.contexts)} (deep-dive ≠ seed classic-first-trip → seed not hardcoded)`);
}

// ─── 3. 降级：env 全缺 → llm/evidence 关闭、仍产确定性骨架 ─────────────────
{
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "route-warmup-degrade-"));
  const storagePath = path.join(tempDir, "accepted.json");
  // 全空 env（不设 DEEPSEEK_API_KEY / ROUTE_WEB_SEARCH_API_KEY）
  const cleanEnv = { ROUTE_TEXT_ENRICHMENT_PROVIDER: "stub", ROUTE_WARMUP_DELAY_MS: "0" };
  const report = await runRouteRepositoryWarmup({
    env: cleanEnv,
    textEnrichmentProvider: stubTextEnrichmentProvider,
    storagePath,
    evidenceStoragePath: path.join(tempDir, "evidence.json"),
    syncStatePath: path.join(tempDir, "sync.json"),
    knowledgeGraphPoolPath: path.join(tempDir, "kg.json"),
    batchSize: 0,
    plannerEnabled: true,
    plannerBatchSize: 1,
    plannerDeadlineMs: 60_000,
    plannerCountries: ["JP"],
    fetchImpl: makeMockFetchImpl(),
    now: () => new Date("2026-06-30T00:00:00Z"),
  });

  const phase = report.plannerPhase;
  assert.equal(phase.llmEnabled, false, `llmEnabled must be false without DEEPSEEK_API_KEY, got ${phase.llmEnabled}`);
  assert.equal(phase.evidenceEnabled, false, `evidenceEnabled must be false without ROUTE_WEB_SEARCH_API_KEY, got ${phase.evidenceEnabled}`);
  assert.ok(phase.accepted >= 1, `degrade must still produce deterministic skeleton (accepted>=1), got ${phase.accepted}`);
  // 配额：report 必须回传 quotaUsage + quotaLimits（用户约束：每日配额计数，env 可调）
  assert.ok(phase.quotaLimits && typeof phase.quotaLimits === "object", "plannerPhase must expose quotaLimits");
  assert.equal(phase.quotaLimits.planner, 100, "default planner daily limit = 100");
  assert.equal(phase.quotaLimits.llm, 300, "default llm daily limit = 300");
  assert.equal(phase.quotaLimits.evidence, 300, "default evidence daily limit = 300");
  assert.equal(phase.quotaLimits.image, 100, "default image daily limit = 100");
  assert.ok(phase.quotaUsage && typeof phase.quotaUsage === "object", "plannerPhase must expose quotaUsage");
  assert.equal(phase.quotaUsage.llm, 0, "degrade (no LLM key) → llm usage must be 0");
  assert.equal(phase.quotaUsage.evidence, 0, "degrade (no web key) → evidence usage must be 0");
  assert.ok(phase.quotaUsage.planner >= 1, `degrade consumed at least 1 planner slot, got ${phase.quotaUsage.planner}`);
  // 降级无 evidence 采集 → 停 needsEvidence
  const repo = createAcceptedRouteRepository({ storagePath });
  const rec = (repo.list({ limit: 100 }).records || []).find((r) => r.sourceType === "planner-designed");
  assert.ok(rec, "degrade path must still upsert a planner-designed record");
  assert.equal(rec.enrichmentStatus, "needsEvidence", `degrade → needsEvidence, got ${rec.enrichmentStatus}`);

  console.log(`[3/6] degrade: llmEnabled=${phase.llmEnabled} evidenceEnabled=${phase.evidenceEnabled} accepted=${phase.accepted} enrichmentStatus=${rec.enrichmentStatus} quotaUsage=${JSON.stringify(phase.quotaUsage)} (AC4: degrade non-blocking)`);
}

// ─── 3b. 配额 + LLM retry≤3：env 调整限额、配额耗尽即停、retry 上限 ─────────
{
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "route-warmup-quota-"));
  const storagePath = path.join(tempDir, "accepted.json");
  // env 把 planner 限额压到 2 → 跑 3 个 seed context（JP classic / JP deep / IT classic 均 pool≥4）
  // 但 batch size=3，故会选 3 个 context；planner 配额=2 → 第 3 个被 quotaExhausted 跳过，accepted≤2
  const quotaEnv = {
    ROUTE_TEXT_ENRICHMENT_PROVIDER: "stub",
    ROUTE_WARMUP_DELAY_MS: "0",
    ROUTE_PLANNER_DAILY_LIMIT: "2",
    ROUTE_LLM_DAILY_LIMIT: "5",
    ROUTE_EVIDENCE_DAILY_LIMIT: "5",
    ROUTE_IMAGE_DAILY_LIMIT: "5",
  };
  const report = await runRouteRepositoryWarmup({
    env: quotaEnv,
    textEnrichmentProvider: stubTextEnrichmentProvider,
    storagePath,
    evidenceStoragePath: path.join(tempDir, "evidence.json"),
    syncStatePath: path.join(tempDir, "sync.json"),
    knowledgeGraphPoolPath: path.join(tempDir, "kg.json"),
    batchSize: 0,
    plannerEnabled: true,
    plannerBatchSize: 3,
    plannerDeadlineMs: 60_000,
    plannerCountries: ["JP", "IT"],
    fetchImpl: makeMockFetchImpl(),
    now: () => new Date("2026-06-30T00:00:00Z"),
  });
  const phase = report.plannerPhase;
  assert.equal(phase.quotaLimits.planner, 2, `env override planner limit → 2, got ${phase.quotaLimits.planner}`);
  assert.ok(phase.quotaUsage.planner === 2, `planner usage capped at limit 2, got ${phase.quotaUsage.planner}`);
  assert.equal(phase.quotaExhausted, "planner", `planner quota exhausted flag set, got ${phase.quotaExhausted}`);
  assert.ok(phase.accepted <= 2, `accepted must not exceed planner limit, got ${phase.accepted}`);

  // LLM retry 上限：provider.maxRetries === 4（= 1 首次 + 3 重试，满足「不 retry 三次以上」）
  const llmProvider = createConfiguredLlmRefineProvider({ DEEPSEEK_API_KEY: "stub-key" });
  assert.equal(llmProvider.maxRetries, 4, `LLM maxRetries must be 4 (1 initial + 3 retries), got ${llmProvider.maxRetries}`);

  console.log(`[4/6] quota: env ROUTE_PLANNER_DAILY_LIMIT=2 → usage=${phase.quotaUsage.planner} quotaExhausted=${phase.quotaExhausted} accepted=${phase.accepted}; LLM maxRetries=${llmProvider.maxRetries} (1+3 retries). retry also counted toward llm quota (provider increments context.quota.usage.llm per attempt).`);
}

// ─── 4b. 优先级策略 + 封面 fallback 链（Phase 5f）─────────────────────
{
  // 优先级策略：plannerStrategy="priority" → strategyId==="priority"，contexts 按 country 热门权重排序（JP>IT）
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "route-warmup-priority-"));
  const storagePath = path.join(tempDir, "accepted.json");
  const report = await runRouteRepositoryWarmup({
    env: { ROUTE_TEXT_ENRICHMENT_PROVIDER: "stub", ROUTE_WARMUP_DELAY_MS: "0" },
    textEnrichmentProvider: stubTextEnrichmentProvider,
    storagePath,
    evidenceStoragePath: path.join(tempDir, "evidence.json"),
    syncStatePath: path.join(tempDir, "sync.json"),
    knowledgeGraphPoolPath: path.join(tempDir, "kg.json"),
    batchSize: 0,
    plannerEnabled: true,
    plannerBatchSize: 6,
    plannerDeadlineMs: 60_000,
    plannerCountries: ["JP", "IT"],
    plannerStrategy: "priority",
    fetchImpl: makeMockFetchImpl(),
    now: () => new Date("2026-06-30T00:00:00Z"),
  });
  const phase = report.plannerPhase;
  assert.equal(phase.strategyId, "priority", `priority strategy registered, got ${phase.strategyId}`);
  assert.ok(phase.contexts.length >= 1, `priority produced contexts, got ${phase.contexts.length}`);
  // JP 权重 100 > IT 75 → 所有 JP context 必须排在 IT 之前
  const firstItIdx = phase.contexts.findIndex((c) => c.country === "IT");
  const lastJpIdx = phase.contexts.map((c) => c.country === "JP").lastIndexOf(true);
  if (firstItIdx >= 0) {
    assert.ok(lastJpIdx < firstItIdx, `priority sort: JP(weight 100) before IT(weight 75), contexts=${JSON.stringify(phase.contexts)}`);
  }
  // 同一 country+style 应出现不同 durationDays 变体（产出不同路线）
  const jpCtx = phase.contexts.filter((c) => c.country === "JP");
  if (jpCtx.length >= 2) {
    const durations = new Set(jpCtx.map((c) => c.durationDays));
    assert.ok(durations.size >= 2, `priority produces different-duration variants for same country+style, got ${JSON.stringify([...durations])}`);
  }

  // 封面 fallback 链：构造一个 fetchImpl，对第一个目的地 anchor 返回空、对第 2 个目的地返回合规封面
  // → 验证 resolvePlannerCover 走到 fallback 第 2 步仍能拿到 cover（accepted≥1）
  const fallbackFetch = (() => {
    const emptyCover = { query: { pages: [{ title: "File:NoCover", imageinfo: [] }] } };
    return async function (url, opts = {}) {
      const u = String(url);
      if (u.startsWith("https://query.wikidata.org/sparql")) {
        return { ok: true, status: 200, json: async () => JP_POOL_SPARQL, headers: new Map() };
      }
      // destination scope 的 pageimages/imageinfo：anchor(东京/Tokyo) 返回空（模拟 miss）
      if (u.includes("action=query")) {
        // 用 page titles 判断是哪个目的地；anchor=Tokyo(东京都) 返空，其余返合规封面
        const isAnchor = /Tokyo|%E4%B8%9C%E4%BA%AC/i.test(u) && !/Kyoto|Nara|Osaka|Fuji/i.test(u);
        if (isAnchor) return { ok: true, status: 200, json: async () => emptyCover, headers: new Map() };
        return { ok: true, status: 200, json: async () => ({ query: { pages: [commonsCoverPage("Kyoto_Cover.jpg")] } }), headers: new Map() };
      }
      return { ok: false, status: 404, json: async () => ({}), headers: new Map() };
    };
  })();
  const fbTempDir = fs.mkdtempSync(path.join(os.tmpdir(), "route-warmup-cover-fb-"));
  const fbReport = await runRouteRepositoryWarmup({
    env: { ROUTE_TEXT_ENRICHMENT_PROVIDER: "stub", ROUTE_WARMUP_DELAY_MS: "0" },
    textEnrichmentProvider: stubTextEnrichmentProvider,
    storagePath: path.join(fbTempDir, "accepted.json"),
    evidenceStoragePath: path.join(fbTempDir, "evidence.json"),
    syncStatePath: path.join(fbTempDir, "sync.json"),
    knowledgeGraphPoolPath: path.join(fbTempDir, "kg.json"),
    batchSize: 0,
    plannerEnabled: true,
    plannerBatchSize: 1,
    plannerDeadlineMs: 60_000,
    plannerCountries: ["JP"],
    fetchImpl: fallbackFetch,
    now: () => new Date("2026-06-30T00:00:00Z"),
  });
  const fbPhase = fbReport.plannerPhase;
  assert.ok(fbPhase.accepted >= 1, `cover fallback: anchor miss → 2nd destination cover → accepted, got accepted=${fbPhase.accepted}`);
  assert.ok(fbPhase.quotaUsage.image >= 2, `cover fallback consumed ≥2 image searches (anchor miss then fallback), got ${fbPhase.quotaUsage.image}`);

  console.log(`[5/6] priority+cover: strategyId=${phase.strategyId} contexts=${phase.contexts.length} (JP before IT by weight); cover-fallback accepted=${fbPhase.accepted} imageUsage=${fbPhase.quotaUsage.image} (anchor miss → 2nd dest fallback chain works)`);
}

// ─── 6. 前台约束 AC：Feed/Search/Detail 只读 repo、search miss 只 enqueue、cursor 稳定 ─
{
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "route-warmup-ac-"));
  const storagePath = path.join(tempDir, "accepted.json");
  // 预置一条 accepted 记录进 repo（让 feed 非空、detail 命中）
  const repo = createAcceptedRouteRepository({ storagePath });
  const jobStore = createRouteJobStore();
  const discovery = createRouteDiscovery({ acceptedRepository: repo, jobStore });

  // AC1/6：discoverFeed 只读 repo（空 repo → 空记录，不报错、不跑 planner）
  const feedEmpty = await discovery.discover({ mode: "feed", limit: 8 });
  assert.equal(feedEmpty.records.length, 0, "empty repo → feed returns 0 records (reads repo only)");
  assert.ok(["EMPTY", "REPOSITORY"].includes(feedEmpty.cacheStatus), `feed cacheStatus from repo, got ${feedEmpty.cacheStatus}`);

  // AC3/7：search miss → pending:true + enqueue job，且不现场生成路线（records 仍空）
  const beforeJobs = jobStore.list().length;
  const searchMiss = await discovery.discover({ mode: "feed", query: " nonexistent-country-xyz ", limit: 8 });
  assert.equal(searchMiss.records.length, 0, "search miss must NOT generate routes on-site (returns empty)");
  assert.ok(searchMiss.pending, "search miss must return pending:true");
  assert.ok(searchMiss.pendingJobIds.length >= 1, "search miss must enqueue a job");
  assert.ok(jobStore.list().length > beforeJobs, "jobStore must have grown (enqueue happened)");
  // 授权边界：search-miss 请求没有调 planner。discovery 内部不持有 planner，故无法直接 spy；
  // Search V1 可以拥有 search planner；这里锁住的是 Feed 边界：Feed 不同步 buildCandidates。
  const discoverySrc = fs.readFileSync(new URL("../src/lib/routes/discovery.mjs", import.meta.url), "utf8");
  const feedBody = discoverySrc.slice(discoverySrc.indexOf("async function discoverFeed"), discoverySrc.indexOf("async function discoverSearch"));
  assert.ok(!/createRouteCompositionPlanner|buildCandidates|createDefaultSearchPlanner/.test(feedBody), "discoverFeed must not synchronously start Planner; it may only enqueue/schedule background refill");

  // AC5：cursor 稳定 + 排序稳定。预置 2 条记录，同 cursor 两次返回同 ids 同序
  const baseTime = new Date("2026-06-30T00:00:00Z").getTime();
  const r1 = makePlannerAcceptedRecord("route-ac-r1", "东京", baseTime + 1000);
  const r2 = makePlannerAcceptedRecord("route-ac-r2", "大阪", baseTime + 2000);
  repo.upsert(r1);
  repo.upsert(r2);
  const feed1 = await discovery.discover({ mode: "feed", limit: 10 });
  const feed2 = await discovery.discover({ mode: "feed", limit: 10 });
  assert.deepEqual(feed1.records.map((r) => r.id), feed2.records.map((r) => r.id), "same repo state → same cursor order (AC2/5 cursor stable, no jitter)");
  // acceptedAt desc 排序：r2(较晚) 应在 r1(较早) 之前
  const ids = feed1.records.map((r) => r.id);
  assert.ok(ids.indexOf("route-ac-r2") < ids.indexOf("route-ac-r1"), `stable sort by acceptedAt desc: r2 before r1, got ${JSON.stringify(ids)}`);

  // AC2 snapshot cursor：分页中插入 newer 记录 → 旧 cursor 继续翻页不漂移、不重复
  const r3 = makePlannerAcceptedRecord("route-ac-r3", "京都", baseTime + 3000); // 较晚 acceptedAt
  // 先取 page1（limit:1，拿到 r2 的 cursor）
  const snap1 = await discovery.discover({ mode: "feed", limit: 1 });
  assert.equal(snap1.records[0].id, "route-ac-r2", "page1 = newest (r2)");
  assert.ok(snap1.nextCursor, "page1 must have nextCursor for pagination");
  // 插入 r3（比 r2 更晚 → 排到 r2 前面）
  repo.upsert(r3);
  // 用旧 cursor 翻第 2 页：必须仍是 r1（snapshot 锁住，r3 不漂入、不跳过 r1）
  const snap2 = await discovery.discover({ mode: "feed", limit: 1, cursor: snap1.nextCursor });
  assert.equal(snap2.records[0].id, "route-ac-r1", `snapshot cursor: page2 must be r1 (no drift after r3 insert), got ${snap2.records[0]?.id}`);
  // 刷新（cursor:null）→ r3 才出现在顶部
  const refreshed = await discovery.discover({ mode: "feed", limit: 1 });
  assert.equal(refreshed.records[0].id, "route-ac-r3", "refresh (cursor:null) → r3 visible at top");

  // AC1/6：discoverDetail 只读 repo（命中预置记录）
  const detail = await discovery.discover({ mode: "detail", routeId: "route-ac-r1" });
  assert.equal(detail.record.id, "route-ac-r1", "discoverDetail reads repo by id");
  // detail 命中不存在 id → 404（不现场生成）。RouteDiscoveryError 把 code 放 .code 不放 message，
  // 故用函数匹配器断 .code + .status，而非正则匹配 message。
  await assert.rejects(
    () => discovery.discover({ mode: "detail", routeId: "does-not-exist" }),
    (err) => err.code === "ROUTE_NOT_FOUND" && err.status === 404,
    "detail miss → 404 (ROUTE_NOT_FOUND), no on-site generation",
  );

  console.log(`[6/6] frontend AC: feed reads repo only; search miss→pending+enqueue (no on-site gen); cursor stable (${JSON.stringify(ids)}); detail reads repo; 404 on miss. discoverFeed has no synchronous planner path.`);
}

console.log("\nPhase 5 planner-warmup integration verified: planner phase wired into runRouteRepositoryWarmup (scheduled + admin CLI), records enter acceptedRepository with cover, feed-visible. Strategy seam swappable (spy override ≠ seed). Degrade switch works (no keys → deterministic skeleton + needsEvidence). Frontend AC: Feed/Detail read repo, legacy feed search miss enqueues not generates, cursor/sort stable, discoverFeed has no synchronous planner path.");

// helper：构造一条能通过 upsert 门槛（coverAsset.imageUrl 非空）的 planner-designed 记录
function makePlannerAcceptedRecord(id, anchorName, acceptedAtMs) {
  // name/canonicalTitle 纯中文：content-quality 的 UNTRANSLATED 正则会拒 3+ 连续拉丁字母，故 id 不进 name
  const nameByAnchor = { "东京": "东京京都大阪初访经典行程", "大阪": "关西都市美食文化环线", "京都": "古都奈良京都深度漫游" }[anchorName] || "日本经典初访行程";
  return {
    id,
    name: nameByAnchor,
    canonicalTitle: nameByAnchor,
    sourceTitle: `Japan Classic ${id}`,
    summary: "串联东京、富士山、京都、奈良、大阪的均衡第一印象路线，覆盖都市自然古都美食。",
    recommendationText: "首次访日旅客推荐此路线，节奏均衡不折腾。",
    countryEntities: [{ name: "日本", countryCode: "JP" }],
    destinationEntities: [
      { wikidataId: "Q1490", name: "东京", countryCode: "JP" },
      { wikidataId: "Q34600", name: "京都", countryCode: "JP" },
      { wikidataId: "Q35765", name: "大阪", countryCode: "JP" },
    ],
    countries: ["JP"],
    destinations: ["东京", "京都", "大阪"],
    recommendedDays: "8天",
    durationDays: 8,
    bestMonths: ["4月", "5月", "10月", "11月"],
    themes: ["culture", "city"],
    tags: ["first-trip", "classic"],
    highlights: ["东京都市夜景", "京都古寺", "大阪美食"],
    coverAsset: { provider: "wikimedia-commons", assetId: `${id}-cover.jpg`, sourceUrl: "https://commons.wikimedia.org/x", imageUrl: `https://example.com/${id}-cover.jpg` },
    source: { name: "planner", url: "" },
    enrichmentStatus: "needsEvidence",
    contentQualityStatus: "accepted",
    classification: "single",
    sourceType: "planner-designed",
    destinationSource: "knowledge-graph",
    acceptedAt: new Date(acceptedAtMs).toISOString(),
  };
}
