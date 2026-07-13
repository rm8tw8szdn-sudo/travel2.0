import path from "node:path";
import { createAcceptedRouteRepository } from "./accepted-repository.mjs";
import { createContentEnricher } from "./content-enricher.mjs";
import { validateRouteContent } from "./content-quality.mjs";
import { createConfiguredTextEnrichmentProvider } from "./text-enrichment-provider-factory.mjs";
import { createLiveDiscoveryProvider } from "./live-provider.mjs";
import { acceptedPoolWatermarks } from "./route-pool-watermarks.mjs";
import { createProviderSyncStateStore } from "./provider-sync-state-store.mjs";
import { createEvidenceRepository } from "./evidence-repository.mjs";
import { createRouteCompositionPlanner } from "./route-composition-planner.mjs";
import { createConfiguredLlmRefineProvider } from "./route-llm-refine-provider.mjs";
import { createWebSearchEvidenceProvider } from "./web-search-evidence-provider.mjs";
import { createWebEvidenceExtractor } from "./web-evidence-extractor.mjs";
import { createWebEvidenceCorroborator } from "./web-evidence-corroborator.mjs";
import { createWikimediaImageProvider } from "./wikimedia-image-provider.mjs";
import {
  buildKnowledgeGraphPool,
  createCacheBackedKnowledgeGraph,
  readKnowledgeGraphCache,
  writeKnowledgeGraphCache,
} from "./wikidata-sparql-knowledge-graph.mjs";
import { GOLD_CASES } from "./route-gold-cases.mjs";

// 供 Phase 6 coverage-matrix 等策略消费的 cell 来源（每 Case = 一个 country×travelStyle×durationBand cell）
const GOLD_CASES_EXPORT = GOLD_CASES;

const WIKIVOYAGE_API = "https://en.wikivoyage.org/w/api.php";
const PROVIDER_ID = "wikivoyage";

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function countByReason(bucket, result) {
  if (!["rejected", "skipped", "failed", "deferred"].includes(result.status)) return;
  const key = `${result.status}:${result.reason || "unknown"}`;
  bucket[key] = (bucket[key] || 0) + 1;
}

function repositoryRecords(repository) {
  return repository.list({ limit: 100_000 }).records;
}

function poolStats(repository, watermarks) {
  const records = repositoryRecords(repository);
  const single = records.filter((record) => record.classification === "single").length;
  const cross = records.filter((record) => record.classification === "cross").length;
  return {
    total: records.length,
    single,
    cross,
    mediaReady: records.filter((record) => record.repositoryStatus === "mediaReady" || record.enrichmentStatus === "mediaReady").length,
    target: { total: watermarks.totalTarget, single: watermarks.targets.single, cross: watermarks.targets.cross },
    minimum: { total: watermarks.totalMinimum, single: watermarks.minimums.single, cross: watermarks.minimums.cross },
    meetsMinimum: single >= watermarks.minimums.single && cross >= watermarks.minimums.cross && records.length >= watermarks.totalMinimum,
    meetsTarget: single >= watermarks.targets.single && cross >= watermarks.targets.cross && records.length >= watermarks.totalTarget,
  };
}

function poolShortages(stats) {
  return [
    stats.single < stats.target.single ? { pool: "single", count: stats.single, target: stats.target.single, shortage: stats.target.single - stats.single } : null,
    stats.cross < stats.target.cross ? { pool: "cross", count: stats.cross, target: stats.target.cross, shortage: stats.target.cross - stats.cross } : null,
    stats.total < stats.target.total ? { pool: "total", count: stats.total, target: stats.target.total, shortage: stats.target.total - stats.total } : null,
  ].filter(Boolean);
}

function minimumShortages(stats) {
  return [
    stats.single < stats.minimum.single ? { pool: "single", count: stats.single, minimum: stats.minimum.single, shortage: stats.minimum.single - stats.single } : null,
    stats.cross < stats.minimum.cross ? { pool: "cross", count: stats.cross, minimum: stats.minimum.cross, shortage: stats.minimum.cross - stats.cross } : null,
    stats.total < stats.minimum.total ? { pool: "total", count: stats.total, minimum: stats.minimum.total, shortage: stats.minimum.total - stats.total } : null,
  ].filter(Boolean);
}

function shouldContinueWarmup(repository, watermarks) {
  const stats = poolStats(repository, watermarks);
  return stats.total < watermarks.totalTarget || stats.single < watermarks.targets.single || stats.cross < watermarks.targets.cross;
}

function seedCoverAsset(page) {
  if (!page?.thumbnail?.source || !page?.title) return null;
  const width = Number(page.thumbnail.width) || 0;
  const height = Number(page.thumbnail.height) || 0;
  const ratio = width / height;
  if (width < 360 || height < 200 || ratio < 0.8 || ratio > 3.2) return null;
  return {
    provider: "wikivoyage-pageimage",
    assetId: String(page.pageimage || page.title).toLocaleLowerCase("en-US"),
    sourceUrl: page.pageimage
      ? `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(String(page.pageimage).replace(/ /g, "_"))}`
      : `https://en.wikivoyage.org/wiki/${encodeURIComponent(page.title.replace(/ /g, "_"))}`,
    imageUrl: page.thumbnail.source,
    width,
    height,
    discoveredVia: "route-pageimage",
    sourcePageUrl: `https://en.wikivoyage.org/wiki/${encodeURIComponent(page.title.replace(/ /g, "_"))}`,
  };
}

async function resolveWarmupCover(member, imageProvider, deadlineAt = Date.now() + 12_000) {
  const seeded = seedCoverAsset(member);
  if (seeded) return seeded;
  if (!imageProvider?.search) return null;
  const result = await imageProvider.search({
    scope: "route",
    name: member.title,
    sourceTitle: member.title,
    routeImageTitle: member.pageimage || "",
    routeSearchTerms: [member.title, String(member.title || "").replace(/\s+/g, " travel route")],
    destinations: [],
    deadlineAt,
  }).catch(() => null);
  return result?.candidates?.[0] || null;
}

function isEnabledRoute(record) {
  return !(record.countryEntities || []).some((item) => item.countryCode === "CN")
    && !(record.destinationEntities || []).some((item) => item.countryCode === "CN");
}

async function fetchCategoryBatch({ continuation = null, batchSize = 30, cooldownMs = 60_000 } = {}) {
  const url = new URL(WIKIVOYAGE_API);
  Object.entries({
    origin: "*",
    format: "json",
    formatversion: "2",
    action: "query",
    generator: "categorymembers",
    gcmtitle: "Category:Itineraries",
    gcmnamespace: "0",
    gcmlimit: String(Math.max(1, Math.min(50, batchSize))),
    prop: "pageimages",
    pithumbsize: "1400",
  }).forEach(([key, value]) => url.searchParams.set(key, value));
  if (continuation) {
    Object.entries(continuation).forEach(([key, value]) => url.searchParams.set(key, String(value)));
  }
  let response = null;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    response = await fetch(url, {
      headers: { "Api-User-Agent": "TravelCollectionRouteV2/2.0 (https://github.com/rm8tw8szdn-sudo/travel-collection)" },
      signal: AbortSignal.timeout(15_000),
    });
    if (response.ok) break;
    if (response.status !== 429 && response.status < 500) break;
    const retryAfter = Number(response.headers.get("retry-after")) || 0;
    await wait(Math.max(retryAfter * 1000, Math.min(cooldownMs, 2_000 * (attempt + 1))));
  }
  if (!response?.ok) {
    const error = new Error(`Wikivoyage category request failed (${response?.status || "network"})`);
    error.status = response?.status || 0;
    error.retryAfter = Number(response?.headers?.get?.("retry-after")) || 0;
    throw error;
  }
  const payload = await response.json();
  return {
    members: Object.values(payload.query?.pages || {})
      .filter((page) => page.pageid && (page.thumbnail?.source || page.pageimage)),
    continuation: payload.continue || null,
  };
}

async function buildCandidate({ member, repository, evidenceRepository, liveProvider, enricher, imageProvider }) {
  const routeId = `wikivoyage-${member.pageid}`;
  if (repository.get(routeId)) return { status: "existing", routeId, title: member.title };
  const coverAsset = await resolveWarmupCover(member, imageProvider);
  if (!coverAsset) return { status: "skipped", routeId, title: member.title, reason: "no-qualified-cover" };
  const record = await liveProvider.getById(routeId);
  if (!record) return { status: "skipped", routeId, title: member.title, reason: "wikivoyage-record-incomplete" };
  if (!isEnabledRoute(record)) return { status: "skipped", routeId, title: member.title, reason: "disabled-country" };
  const facts = await liveProvider.getFactsById(routeId, { deadlineAt: Date.now() + 30_000 });
  evidenceRepository?.ingestProviderFacts?.(facts);
  const enriched = await enricher.enrich({ ...facts, coverAsset }, { deadlineAt: Date.now() + 60_000 });
  if (!enriched.accepted || !isEnabledRoute(enriched.record)) {
    return {
      status: "rejected",
      routeId,
      title: member.title,
      reason: enriched.diagnostics?.reasons?.join(",") || "content-quality-failed",
    };
  }
  const quality = validateRouteContent(enriched.record);
  const write = repository.upsert({
    ...enriched.record,
    contentQualityStatus: "accepted",
    classification: quality.classification,
  });
  return write.accepted
    ? { status: "accepted", routeId, title: member.title, name: write.record.name, classification: write.record.classification }
    : { status: "rejected", routeId, title: member.title, reason: write.reasons?.join(",") || "repository-rejected" };
}

// ─── Phase 5: planner-driven coverage gap 填补 ────────────────────────────
// 产品边界（用户硬约束）：planner 仅在后台 warmup 生产；前台 Feed/Search/Detail 永不调 planner。
// 降级开关：DEEPSEEK_API_KEY 缺→确定性骨架（llmRefine.refined=false）；ROUTE_WEB_SEARCH_API_KEY 缺→
//   不采 evidence（enrichmentStatus 停 needsEvidence）。两者皆缺仍产出路线，质量略低。
// 超时：plannerDeadlineMs + 逐候选 deadlineAt break；upsert 逐条即时持久化，超时前写入的不丢。

const PLANNER_SEED_CONTEXTS = [
  { country: "JP", countryName: "日本", countryCode: "JP", countryWikidataId: "Q17", travelStyle: "classic-first-trip", durationDays: 8 },
  { country: "JP", countryName: "日本", countryCode: "JP", countryWikidataId: "Q17", travelStyle: "deep-dive", durationDays: 10 },
  { country: "IT", countryName: "意大利", countryCode: "IT", countryWikidataId: "Q38", travelStyle: "classic-first-trip", durationDays: 8 },
  { country: "TH", countryName: "泰国", countryCode: "TH", countryWikidataId: "Q869", travelStyle: "island-hopping", durationDays: 7 },
  { country: "US", countryName: "美国", countryCode: "US", countryWikidataId: "Q30", travelStyle: "road-trip", durationDays: 12 },
  { country: "AU", countryName: "澳大利亚", countryCode: "AU", countryWikidataId: "Q408", travelStyle: "road-trip", durationDays: 10 },
];

// ─── 策略接口 seam ───────────────────────────────────────────────
// 用户约束：Planner 不随机补，支持多策略（coverage 最低/最新国家/热门/节日/运营指定/搜索缺失）。
// Phase 6 已注册 seed/priority/coverage-matrix/search-miss/operator/seasonal/popular/newest；
// 新增策略仍只需实现 createXxxStrategy() 并接入 resolvePlannerStrategy，runPlannerPhase 不改。
// 契约：strategy = { id, select({ stats, pool, limit, repository, jobStore, goldCases, signals }) → context[] }
// context shape：{ country, countryName, countryCode, countryWikidataId, travelStyle, durationDays, deadlineAt? }

// 默认 strategy：固定 Gold-Case seeded context，按 pool 有该 country 且 ≥4 候选过滤，单国池不足时优先单国
function createSeedContextStrategy() {
  return {
    id: "seed",
    select({ stats, pool, limit } = {}) {
      const singleShort = stats.single < (stats.target?.single || 0);
      const contexts = PLANNER_SEED_CONTEXTS.filter((ctx) => {
        const poolForCountry = pool[ctx.country] || [];
        return poolForCountry.length >= 4;
      });
      // 单国不足 → 单国 context 优先（planner 默认产单国记录，classification=single）
      const ordered = singleShort
        ? [...contexts.filter((c) => !c.country || true), ...contexts]
        : contexts;
      const seen = new Set();
      const unique = ordered.filter((c) => {
        const key = `${c.country}:${c.travelStyle}:${c.durationDays}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      return unique.slice(0, limit);
    },
  };
}

function asCountryCodes(country) {
  return String(country || "")
    .split(/[\/,|]/u)
    .map((code) => code.trim().toUpperCase())
    .filter(Boolean);
}

function poolHasCountry(pool, country) {
  const countries = asCountryCodes(country);
  if (countries.length > 1) return countries.every((code) => (pool?.[code] || []).length >= 1);
  return (pool?.[country] || []).length >= 4;
}

function countryMeta(country) {
  const countries = asCountryCodes(country);
  if (countries.length > 1) {
    return {
      country: countries.join("/"),
      countries,
      countryName: countries.map((code) => COUNTRY_META[code]?.countryName || code).join("、"),
      countryCode: countries[0],
      countryWikidataId: "",
    };
  }
  return {
    country,
    countryName: COUNTRY_META[country]?.countryName || country,
    countryCode: country,
    countryWikidataId: COUNTRY_META[country]?.countryWikidataId || "",
  };
}

function makePlannerContext(input = {}) {
  const country = String(input.country || input.countryCode || "").trim().toUpperCase();
  return {
    ...countryMeta(country),
    travelStyle: input.travelStyle || input.travelStyleConceptKey || "classic-first-trip",
    durationDays: Number(input.durationDays) || 8,
    durationBand: input.durationBand || "",
    bestMonths: input.bestMonths || [],
    maxAcceptedPerCountryCluster: Number(input.maxAcceptedPerCountryCluster) || undefined,
  };
}

function durationBandForContextDays(days) {
  if (days <= 3) return "1-3d";
  if (days <= 6) return "4-6d";
  if (days <= 10) return "7-10d";
  if (days <= 14) return "10-14d";
  return "15d+";
}

function uniqueContexts(contexts = [], limit = 20) {
  const seen = new Set();
  const out = [];
  for (const context of contexts) {
    const key = `${context.country}:${(context.countries || []).join("/")}:${context.travelStyle}:${context.durationDays}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(context);
    if (out.length >= limit) break;
  }
  return out;
}

function goldCaseCells(goldCases = []) {
  const cells = [];
  for (const gc of goldCases) {
    const countries = asCountryCodes(gc?.country);
    if (!countries.length) continue;
    cells.push({
      country: countries.join("/"),
      countries,
      travelStyle: gc.travelStyleConceptKey || "classic-first-trip",
      durationDays: Number(gc.durationDays) || 8,
      durationBand: gc.durationBand || "",
      bestMonths: gc.expected?.bestMonths || [],
      expectedDestinations: gc.expected?.destinations || [],
    });
  }
  return cells;
}

function recordCountryCodes(record = {}) {
  const codes = [
    ...(record.countries || []),
    ...(record.countryEntities || []).map((item) => item.countryCode),
    ...(record.destinationEntities || []).map((item) => item.countryCode),
  ];
  return [...new Set(codes.map((code) => String(code || "").trim().toUpperCase()).filter(Boolean))];
}

function recordTravelStyles(record = {}) {
  return [
    record.travelStyle,
    record.travelStyleConceptKey,
    record.concept?.travelStyle,
    record.concept?.travelStyleLabel,
    ...(record.designStrategies || []),
    ...(record.tags || []),
    ...(record.themes || []),
  ].map((value) => String(value || "").trim()).filter(Boolean);
}

function recordDestinationNames(record = {}) {
  return [
    ...(record.destinations || []),
    ...(record.destinationEntities || []).map((item) => item.name),
  ].map((value) => String(value || "").trim()).filter(Boolean);
}

function destinationOverlapPass(record, cell) {
  const expected = (cell.expectedDestinations || []).map((value) => String(value || "").trim()).filter(Boolean);
  if (!expected.length) return true;
  const actual = new Set(recordDestinationNames(record));
  const hits = expected.filter((name) => actual.has(name)).length;
  return hits / expected.length >= 0.6;
}

function recordMatchesCell(record, cell) {
  const countries = recordCountryCodes(record);
  const expectedCountries = cell.countries || asCountryCodes(cell.country);
  if (!expectedCountries.every((country) => countries.includes(country))) return false;
  const styles = recordTravelStyles(record);
  if (!styles.includes(cell.travelStyle)) return false;
  if (!cell.durationBand) return destinationOverlapPass(record, cell);
  const recordBand = record.durationBand || record.concept?.durationBand || "";
  if (recordBand) return recordBand === cell.durationBand && destinationOverlapPass(record, cell);
  const days = Number(record.durationDays) || Number.parseInt(record.recommendedDays, 10) || 0;
  return Boolean(days && Math.abs(days - cell.durationDays) <= 1 && destinationOverlapPass(record, cell));
}

function recordMatchesContextVariant(record, cell) {
  const countries = recordCountryCodes(record);
  const expectedCountries = cell.countries || asCountryCodes(cell.country);
  if (!expectedCountries.every((country) => countries.includes(country))) return false;
  const styles = recordTravelStyles(record);
  if (!styles.includes(cell.travelStyle)) return false;
  const days = Number(record.durationDays) || Number.parseInt(record.recommendedDays, 10) || 0;
  return Boolean(days && Math.abs(days - cell.durationDays) <= 1);
}

function countryClusterKeyForCodes(countries = []) {
  return [...new Set((countries || []).map((country) => String(country || "").trim().toUpperCase()).filter(Boolean))].sort().join("|");
}

function recordCountryClusterKey(record = {}) {
  return countryClusterKeyForCodes(recordCountryCodes(record));
}

function routeTypeForCell(cell = {}) {
  return asCountryCodes(cell.country).length > 1 ? "cross" : "single";
}

function cellMatchesRouteType(cell, routeType) {
  if (routeType !== "single" && routeType !== "cross") return true;
  return routeTypeForCell(cell) === routeType;
}

function contextFromCell(cell) {
  return makePlannerContext({
    country: cell.country,
    countries: cell.countries,
    travelStyle: cell.travelStyle,
    durationDays: cell.durationDays,
    durationBand: cell.durationBand,
    bestMonths: cell.bestMonths || [],
  });
}

// 按 id 解析 strategy；未实现的策略名友好降级回 seed（不阻断 warmup）
function resolvePlannerStrategy(strategyOrId) {
  if (!strategyOrId) return createSeedContextStrategy();
  if (typeof strategyOrId === "string") {
    if (strategyOrId === "seed") return createSeedContextStrategy();
    if (strategyOrId === "priority") return createPriorityContextStrategy();
    if (strategyOrId === "coverage-matrix") return createCoverageMatrixStrategy();
    if (strategyOrId === "feed-refill") return createFeedRefillStrategy();
    if (strategyOrId === "search-miss") return createSearchMissStrategy();
    if (strategyOrId === "operator") return createOperatorStrategy();
    if (strategyOrId === "seasonal") return createSeasonalStrategy();
    if (strategyOrId === "popular") return createPopularCountriesStrategy();
    if (strategyOrId === "newest") return createNewestCountryStrategy();
    return createSeedContextStrategy(); // 未识别 → 降级 seed
  }
  if (typeof strategyOrId === "object" && strategyOrId && strategyOrId.select) return strategyOrId;
  return createSeedContextStrategy();
}

// ─── 优先级 strategy（Phase 5f）───────────────────────────────────
// 用户约束的优先级顺序：country（热门国家优先）→ 同 country 内 style →
//   同 country+style 内 theme → 同 country+style+theme 产出不同路线 → 热门国家优先。
// 热门国家权重表（覆盖 Gold Case 国家；权重越大越优先补）。
const POPULAR_COUNTRY_WEIGHTS = { JP: 100, TH: 80, IT: 75, US: 70, AU: 60, FR: 55, KR: 50, ES: 45, GR: 40, TR: 35, VN: 30, ID: 25, DE: 20, GB: 20, MX: 15, EG: 15, MA: 15 };
const COUNTRY_META = {
  JP: { countryName: "日本", countryWikidataId: "Q17" }, US: { countryName: "美国", countryWikidataId: "Q30" },
  IT: { countryName: "意大利", countryWikidataId: "Q38" }, TH: { countryName: "泰国", countryWikidataId: "Q869" },
  AU: { countryName: "澳大利亚", countryWikidataId: "Q408" }, FR: { countryName: "法国", countryWikidataId: "Q142" },
  KR: { countryName: "韩国", countryWikidataId: "Q884" }, ES: { countryName: "西班牙", countryWikidataId: "Q29" },
  GR: { countryName: "希腊", countryWikidataId: "Q41" }, TR: { countryName: "土耳其", countryWikidataId: "Q43" },
  VN: { countryName: "越南", countryWikidataId: "Q881" }, ID: { countryName: "印度尼西亚", countryWikidataId: "Q252" },
  DE: { countryName: "德国", countryWikidataId: "Q183" }, GB: { countryName: "英国", countryWikidataId: "Q145" },
  CH: { countryName: "瑞士", countryWikidataId: "Q39" }, AT: { countryName: "奥地利", countryWikidataId: "Q40" },
  SK: { countryName: "斯洛伐克", countryWikidataId: "Q214" }, HU: { countryName: "匈牙利", countryWikidataId: "Q28" },
  CZ: { countryName: "捷克", countryWikidataId: "Q213" },
  MX: { countryName: "墨西哥", countryWikidataId: "Q96" }, EG: { countryName: "埃及", countryWikidataId: "Q79" },
  MA: { countryName: "摩洛哥", countryWikidataId: "Q97" },
};

function createPriorityContextStrategy() {
  return {
    id: "priority",
    select({ stats, pool, limit, goldCases = [] } = {}) {
      // 1. 从 Gold Case 枚举 country × travelStyle × durationBand cell（每个 cell = 一种待补路线）
      //    travelStyleConceptKey 是 concept 模块的 key（classic-first-trip / deep-dive / ...）
      const cells = [];
      for (const gc of goldCases) {
        if (!gc?.country || !gc?.travelStyleConceptKey) continue;
        cells.push({
          country: gc.country,
          travelStyle: gc.travelStyleConceptKey,
          durationDays: gc.durationDays || 8,
          theme: gc.region || gc.expected?.travelValue || "",
          durationBand: gc.durationBand || "",
        });
      }
      // 2. 补充同 country+style 的不同 durationDays 变体（产出不同路线，避免重复）
      //    对每个 cell 额外生成 +2/-2 天变体（在合理区间内）
      const variants = [];
      for (const cell of cells) {
        variants.push(cell);
        const d = Number(cell.durationDays) || 8;
        for (const delta of [-2, 2]) {
          const nd = d + delta;
          if (nd >= 4 && nd <= 16) {
            variants.push({ ...cell, durationDays: nd, theme: `${cell.theme}·${delta > 0 ? "延长" : "精简"}变体` });
          }
        }
      }
      // 3. 过滤：pool 内有该 country 且 ≥4 候选（骨架需≥2 坐标）
      const viable = variants.filter((ctx) => (pool[ctx.country] || []).length >= 4);
      // 4. 排序：country 热门权重 desc → travelStyle → theme → durationDays
      //    （country→style→theme→同三者不同路线 的优先级用稳定排序逐层体现）
      const byCountry = (c) => POPULAR_COUNTRY_WEIGHTS[c.country] ?? 0;
      const sorted = viable.sort((a, b) =>
        byCountry(b) - byCountry(a)
        || String(a.travelStyle).localeCompare(String(b.travelStyle))
        || String(a.theme).localeCompare(String(b.theme))
        || Number(a.durationDays) - Number(b.durationDays),
      );
      // 5. 去重：fingerprint 同 country:style:theme:durationBand 视为重复（产出同一路线）
      const seen = new Set();
      const unique = sorted.filter((c) => {
        const key = `${c.country}:${c.travelStyle}:${c.theme}:${c.durationDays}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      // 6. 组装完整 context（补 countryName/countryCode/countryWikidataId）
      const contexts = unique.map((c) => ({
        country: c.country,
        countryName: COUNTRY_META[c.country]?.countryName || c.country,
        countryCode: c.country,
        countryWikidataId: COUNTRY_META[c.country]?.countryWikidataId || "",
        travelStyle: c.travelStyle,
        durationDays: c.durationDays,
        durationBand: c.durationBand || "",
      }));
      return contexts.slice(0, limit);
    },
  };
}

function createCoverageMatrixStrategy() {
  return {
    id: "coverage-matrix",
    select({ pool = {}, limit = 20, repository, goldCases = [], signals = {} } = {}) {
      const records = repositoryRecords(repository);
      const routeType = signals.routeType || "";
      const cells = goldCaseCells(goldCases)
        .filter((cell) => cellMatchesRouteType(cell, routeType))
        .filter((cell) => !asCountryCodes(cell.country).includes("CN"))
        .filter((cell) => poolHasCountry(pool, cell.country));
      const ranked = cells.map((cell) => ({
        cell,
        covered: records.filter((record) => recordMatchesCell(record, cell)).length,
        countryCount: records.filter((record) => {
          const countries = recordCountryCodes(record);
          return (cell.countries || asCountryCodes(cell.country)).some((country) => countries.includes(country));
        }).length,
      })).sort((a, b) =>
        a.covered - b.covered
        || a.countryCount - b.countryCount
        || (POPULAR_COUNTRY_WEIGHTS[b.cell.country] || 0) - (POPULAR_COUNTRY_WEIGHTS[a.cell.country] || 0)
        || a.cell.travelStyle.localeCompare(b.cell.travelStyle),
      );
      return uniqueContexts(ranked.map(({ cell }) => contextFromCell(cell)), limit);
    },
  };
}

function createFeedRefillStrategy() {
  function styleVariantsFor(cell) {
    const countries = asCountryCodes(cell.country);
    const variants = [cell.travelStyle];
    if (countries.length > 1) {
      variants.push("country-hopper", "theme");
      if (countries.length <= 4) variants.push("rail-journey");
    } else {
      variants.push("classic-first-trip", "deep-dive", "seasonal", "theme", "road-trip", "rail-journey");
    }
    return [...new Set(variants.filter(Boolean))];
  }

  function durationVariantsFor(cell) {
    const base = Number(cell.durationDays) || 8;
    return [...new Set([base, base - 2, base + 2, base - 1, base + 1].filter((days) => days >= 4 && days <= 16))];
  }

  return {
    id: "feed-refill",
    select({ pool = {}, limit = 20, repository, goldCases = [], signals = {} } = {}) {
      const routeType = signals.routeType || "";
      const records = repositoryRecords(repository);
      const cells = goldCaseCells(goldCases)
        .filter((cell) => cellMatchesRouteType(cell, routeType))
        .filter((cell) => !asCountryCodes(cell.country).includes("CN"))
        .filter((cell) => poolHasCountry(pool, cell.country));
      const candidates = [];
      for (const cell of cells) {
        for (const travelStyle of styleVariantsFor(cell)) {
          for (const durationDays of durationVariantsFor(cell)) {
            const variant = {
              ...cell,
              travelStyle,
              durationDays,
              durationBand: durationBandForContextDays(durationDays),
              maxAcceptedPerCountryCluster: 0,
            };
            const expectedCountries = variant.countries || asCountryCodes(variant.country);
            const clusterKey = countryClusterKeyForCodes(expectedCountries);
            const clusterCount = records.filter((record) => recordCountryClusterKey(record) === clusterKey).length;
            const covered = records.filter((record) => recordMatchesContextVariant(record, variant)).length;
            const countryCount = records.filter((record) => {
              const countries = recordCountryCodes(record);
              return expectedCountries.some((country) => countries.includes(country));
            }).length;
            candidates.push({ cell: variant, covered, countryCount, clusterCount });
          }
        }
      }
      candidates.sort((a, b) =>
        a.covered - b.covered
        || a.clusterCount - b.clusterCount
        || a.countryCount - b.countryCount
        || (POPULAR_COUNTRY_WEIGHTS[b.cell.country] || 0) - (POPULAR_COUNTRY_WEIGHTS[a.cell.country] || 0)
        || a.cell.travelStyle.localeCompare(b.cell.travelStyle)
        || Number(a.cell.durationDays) - Number(b.cell.durationDays),
      );
      return uniqueContexts(candidates.map(({ cell }) => contextFromCell(cell)), limit);
    },
  };
}

function createSearchMissStrategy() {
  return {
    id: "search-miss",
    select({ pool = {}, limit = 20, jobStore, goldCases = [] } = {}) {
      const jobs = jobStore?.list?.({ status: "queued" }) || [];
      const cells = goldCaseCells(goldCases);
      const scored = [];
      for (const cell of cells) {
        if (!poolHasCountry(pool, cell.country)) continue;
        const meta = COUNTRY_META[cell.country] || {};
        const needles = [cell.country, meta.countryName, cell.travelStyle].map((s) => String(s || "").toLowerCase()).filter(Boolean);
        const hits = jobs.filter((job) => {
          const query = String(job.query || "").toLowerCase();
          return needles.some((needle) => query.includes(needle));
        }).length;
        if (hits > 0) scored.push({ cell, hits });
      }
      scored.sort((a, b) =>
        b.hits - a.hits
        || (POPULAR_COUNTRY_WEIGHTS[b.cell.country] || 0) - (POPULAR_COUNTRY_WEIGHTS[a.cell.country] || 0),
      );
      return uniqueContexts(scored.map(({ cell }) => contextFromCell(cell)), limit);
    },
  };
}

function createOperatorStrategy() {
  return {
    id: "operator",
    select({ pool = {}, limit = 20, signals = {}, goldCases = [] } = {}) {
      const requested = Array.isArray(signals.operatorCountries)
        ? signals.operatorCountries
        : String(signals.operatorCountries || "").split(",");
      const cells = goldCaseCells(goldCases);
      const contexts = [];
      for (const country of requested.map((c) => String(c || "").trim().toUpperCase()).filter(Boolean)) {
        if (!poolHasCountry(pool, country)) continue;
        const cell = cells.find((item) => item.country === country) || { country, travelStyle: "classic-first-trip", durationDays: 8 };
        contexts.push(contextFromCell(cell));
      }
      return uniqueContexts(contexts, limit);
    },
  };
}

function monthMatchesBestMonths(bestMonths = [], month) {
  if (!month) return false;
  for (const value of bestMonths) {
    const text = String(value || "");
    if (text.includes("全年")) return true;
    const range = text.match(/(\d{1,2})\s*-\s*(\d{1,2})\s*月/u);
    if (range) {
      const start = Number(range[1]);
      const end = Number(range[2]);
      if (start <= end && month >= start && month <= end) return true;
      if (start > end && (month >= start || month <= end)) return true;
      continue;
    }
    const single = text.match(/(\d{1,2})\s*月/u);
    if (single && Number(single[1]) === month) return true;
  }
  return false;
}

function createSeasonalStrategy() {
  return {
    id: "seasonal",
    select({ pool = {}, limit = 20, signals = {}, goldCases = [] } = {}) {
      const now = signals.now ? new Date(signals.now) : new Date();
      const month = Number.isFinite(now.getTime()) ? now.getUTCMonth() + 1 : new Date().getUTCMonth() + 1;
      const cells = goldCaseCells(goldCases)
        .filter((cell) => poolHasCountry(pool, cell.country))
        .filter((cell) => monthMatchesBestMonths(cell.bestMonths, month));
      cells.sort((a, b) =>
        (a.travelStyle === "seasonal" ? -1 : 0) - (b.travelStyle === "seasonal" ? -1 : 0)
        || (POPULAR_COUNTRY_WEIGHTS[b.country] || 0) - (POPULAR_COUNTRY_WEIGHTS[a.country] || 0),
      );
      return uniqueContexts(cells.map(contextFromCell), limit);
    },
  };
}

function createPopularCountriesStrategy() {
  return {
    id: "popular",
    select({ pool = {}, limit = 20, signals = {}, goldCases = [] } = {}) {
      const weights = signals.popularWeights || POPULAR_COUNTRY_WEIGHTS;
      const byCountryCell = new Map();
      for (const cell of goldCaseCells(goldCases)) {
        if (!byCountryCell.has(cell.country)) byCountryCell.set(cell.country, cell);
      }
      const countries = Object.keys(pool)
        .filter((country) => poolHasCountry(pool, country))
        .sort((a, b) => (weights[b] || 0) - (weights[a] || 0) || a.localeCompare(b));
      return uniqueContexts(countries.map((country) => contextFromCell(byCountryCell.get(country) || { country, travelStyle: "classic-first-trip", durationDays: 8 })), limit);
    },
  };
}

function createNewestCountryStrategy() {
  return {
    id: "newest",
    select({ pool = {}, limit = 20, repository, goldCases = [] } = {}) {
      const records = repositoryRecords(repository);
      const latestByCountry = new Map();
      for (const record of records) {
        const acceptedAt = String(record.acceptedAt || "");
        for (const country of recordCountryCodes(record)) {
          const current = latestByCountry.get(country) || "";
          if (!current || acceptedAt > current) latestByCountry.set(country, acceptedAt);
        }
      }
      const byCountryCell = new Map();
      for (const cell of goldCaseCells(goldCases)) {
        if (!byCountryCell.has(cell.country)) byCountryCell.set(cell.country, cell);
      }
      const countries = Object.keys(pool)
        .filter((country) => poolHasCountry(pool, country))
        .sort((a, b) => {
          const atA = latestByCountry.get(a) || "";
          const atB = latestByCountry.get(b) || "";
          if (!atA && atB) return -1;
          if (atA && !atB) return 1;
          return atA.localeCompare(atB) || (POPULAR_COUNTRY_WEIGHTS[b] || 0) - (POPULAR_COUNTRY_WEIGHTS[a] || 0);
        });
      return uniqueContexts(countries.map((country) => contextFromCell(byCountryCell.get(country) || { country, travelStyle: "classic-first-trip", durationDays: 8 })), limit);
    },
  };
}

// planner 记录无 Wikivoyage 页 → 封面 fallback 链（Phase 5f）：
//   1) anchor 城市（destination scope：Wikipedia pageimage → Wikivoyage pageimage → Commons search）
//   2) miss → 第 2 个 destinationEntity（换城市查，覆盖 anchor 无合规图的情况）
//   3) miss → 第 3 个 destinationEntity（再换，给骨架次核心城市一次机会）
//   4) miss → route scope banner（用 route sourceTitle / searchTerms 做路线级宽搜索，panorama 尺寸）
// 任一命中即用；全 miss → null（记录跳过 upsert，不崩）。
// 配额：每次 image search 计入 image 配额；耗尽则停止后续 fallback。
async function resolvePlannerCover(record, imageProvider, deadlineAt, quota = null) {
  const dests = (record.destinationEntities || []).filter((d) => d && (d.name || d.sourceTitle));
  const countryName = (record.countryEntities || [])[0]?.name || "";
  const canSearch = () => !quota || quota.limits.image <= 0 || quota.usage.image < quota.limits.image;
  const doSearch = async (input) => {
    if (!canSearch()) return null;
    if (quota) quota.usage.image += 1;
    try {
      const result = await imageProvider.search({ ...input, deadlineAt });
      return result?.candidates?.[0] || null;
    } catch {
      return null;
    }
  };
  // 1-3) destination scope：遍历前 3 个目的地实体
  for (const dest of dests.slice(0, 3)) {
    const cover = await doSearch({
      scope: "destination",
      name: dest.name || "",
      sourceTitle: dest.sourceTitle || "",
      countryName,
    });
    if (cover) return cover;
  }
  // 4) route scope banner：用路线级标题/搜索词做宽搜索（panorama 尺寸，providerUsable 对 route-banner 放宽比例）
  const routeCover = await doSearch({
    scope: "route",
    name: record.name || "",
    sourceTitle: record.routeImageTitle || record.canonicalTitle || "",
    routeBannerTitle: record.routeBannerTitle || "",
    routeSearchTerms: record.routeSearchTerms || [],
    destinations: (record.destinationEntities || []).map((d) => ({ name: d.name || "", sourceTitle: d.sourceTitle || "" })),
    countryName,
  });
  return routeCover;
}

async function runPlannerPhase({
  repository, evidenceRepository, env, stats,
  knowledgeGraphPoolPath, plannerBatchSize, plannerDeadlineMs,
  plannerCountries, fetchImpl, now, log,
  plannerStrategy, jobStore = null, signals = {},
}) {
  const startedAt = now().toISOString();
  const deadlineAt = Date.now() + plannerDeadlineMs;
  // 每日配额（env 可调，默认值即用户指定 Planner 100/LLM 300/Evidence 300/Image 100）。
  // serverless 每次冷启即重置，scheduled 一日一次 → 等价「每日」。
  // 每类超限即停该类后续调用：planner 超 → break loop；llm 超 → 降级确定性；
  // evidence 超 → 跳过采集；image 超 → 跳过封面（记录跳过）。
  const quotaLimits = {
    planner: Number(env.ROUTE_PLANNER_DAILY_LIMIT || 100),
    llm: Number(env.ROUTE_LLM_DAILY_LIMIT || 300),
    evidence: Number(env.ROUTE_EVIDENCE_DAILY_LIMIT || 300),
    image: Number(env.ROUTE_IMAGE_DAILY_LIMIT || 100),
  };
  const quotaUsage = { planner: 0, llm: 0, evidence: 0, image: 0 };
  const quota = { limits: quotaLimits, usage: quotaUsage };
  const phase = {
    ran: true, startedAt, accepted: 0, rejected: 0, contexts: [],
    llmEnabled: false, evidenceEnabled: false, cacheCountries: [], reasonCounts: {},
    quotaUsage, quotaLimits,
  };

  // [1] 预解析 SPARQL 知识图缓存（同步契约适配器读它）
  let pool = {};
  try {
    const refreshKgCache = env.ROUTE_PLANNER_REFRESH_KG_CACHE === "true";
    const cachedPool = refreshKgCache ? {} : readKnowledgeGraphCache(knowledgeGraphPoolPath);
    const normalizedCountries = plannerCountries.map((country) => String(country || "").trim().toUpperCase()).filter(Boolean);
    const missingCountries = normalizedCountries.filter((country) => (cachedPool[country] || []).length < 4);
    const fetchedPool = missingCountries.length
      ? await buildKnowledgeGraphPool({ countryCodes: missingCountries, fetchImpl, deadlineAt })
      : {};
    pool = { ...cachedPool, ...fetchedPool };
    writeKnowledgeGraphCache(knowledgeGraphPoolPath, pool);
    phase.cacheSource = refreshKgCache ? "refresh+sparql" : (missingCountries.length ? "disk+sparql" : "disk");
    phase.cacheMissingCountries = missingCountries;
    phase.cacheCountries = Object.keys(pool).filter((c) => (pool[c] || []).length > 0);
  } catch (error) {
    phase.error = `knowledge-graph-build-failed: ${error.message}`;
    phase.finishedAt = now().toISOString();
    return phase; // KG 失败→planner 无目的地池，跳过（不阻断 warmup 已有 Wikivoyage 成果）
  }
  const knowledgeGraph = createCacheBackedKnowledgeGraph({ pool });

  // [2] 降级开关：LLM provider（无 key→null→planner 走确定性骨架）
  const llmRefineProvider = createConfiguredLlmRefineProvider(env);
  phase.llmEnabled = Boolean(llmRefineProvider);

  // [3] 降级开关：web evidence pipeline（无 ROUTE_WEB_SEARCH_API_KEY→null→不采 evidence）
  let webEvidencePipeline = null;
  if (env.ROUTE_WEB_SEARCH_API_KEY) {
    webEvidencePipeline = {
      provider: createWebSearchEvidenceProvider({
        mode: "real-search",
        apiUrl: env.ROUTE_WEB_SEARCH_API_URL || "",
        apiKey: env.ROUTE_WEB_SEARCH_API_KEY,
        fetchImpl,
      }),
      extractor: createWebEvidenceExtractor(),
      corroborator: createWebEvidenceCorroborator(),
    };
    phase.evidenceEnabled = true;
  }

  const imageProvider = createWikimediaImageProvider({ fetchImpl });
  const planner = createRouteCompositionPlanner({
    evidenceRepository, acceptedRepository: repository,
    knowledgeGraph, llmRefineProvider, webEvidencePipeline,
  });

  // [4] 选 context 并逐个跑（逐候选 deadlineAt break，超时保 progress 不丢已写入）
  // 策略 seam：plannerStrategy.select() 决定补哪些路线。Phase 5 默认 seed；Phase 6 可注入 coverage-matrix 等
  const strategy = resolvePlannerStrategy(plannerStrategy);
  phase.strategyId = strategy.id;
  const contexts = strategy.select({
    stats, pool, limit: plannerBatchSize,
    repository, jobStore, goldCases: GOLD_CASES_EXPORT, signals,
  });
  phase.contexts = contexts.map((c) => ({
    country: c.country,
    countries: c.countries,
    travelStyle: c.travelStyle,
    durationDays: c.durationDays,
    durationBand: c.durationBand,
    bestMonths: c.bestMonths,
  }));

  for (const context of contexts) {
    // planner 配额耗尽 → 停止补路线
    if (quotaUsage.planner >= quotaLimits.planner) { phase.quotaExhausted = "planner"; break; }
    if (Date.now() >= deadlineAt) { phase.timedOut = true; break; }
    quotaUsage.planner += 1;
    const candidateDeadline = Math.min(deadlineAt, Date.now() + 45_000); // 单候选 LLM+Tavily 上限
    try {
      const result = await planner.buildCandidates({
        limit: 1, context: { ...context, deadlineAt: candidateDeadline, quota },
      });
      for (const accepted of (result.accepted || [])) {
        const record = accepted.record;
        const cover = await resolvePlannerCover(record, imageProvider, candidateDeadline, quota);
        if (!cover) { phase.rejected += 1; continue; } // 无封面→跳过（acceptedRepository.upsert 需 coverAsset.imageUrl）
        record.coverAsset = cover;
        const write = repository.upsert(record);
        if (write.accepted) {
          phase.accepted += 1;
          if (evidenceRepository?.ingestRouteRecord) evidenceRepository.ingestRouteRecord(write.record);
          log({ stage: "planner-accepted", routeId: write.record.id, country: context.country, travelStyle: context.travelStyle });
        } else {
          phase.rejected += 1;
          const reason = (write.reasons || []).join(",");
          phase.reasonCounts[reason] = (phase.reasonCounts[reason] || 0) + 1;
        }
      }
      // rejected 候选（dedupe/validation/concept 拒）计数
      for (const rejected of (result.rejected || [])) {
        phase.rejected += 1;
        const reason = String(rejected.reason || "unknown").split(",")[0];
        phase.reasonCounts[reason] = (phase.reasonCounts[reason] || 0) + 1;
      }
    } catch (error) {
      phase.rejected += 1;
      const reason = `planner-error:${error.message}`.slice(0, 80);
      phase.reasonCounts[reason] = (phase.reasonCounts[reason] || 0) + 1;
    }
  }

  phase.finishedAt = now().toISOString();
  return phase;
}

export async function runRouteRepositoryWarmup({
  env = process.env,
  storagePath = path.resolve(".route-v2-cache", "accepted-routes.json"),
  evidenceStoragePath = path.resolve(".route-v2-cache", "route-evidence.json"),
  syncStatePath = path.resolve(".route-v2-cache", "provider-sync-state.json"),
  batchSize = Number(env.ROUTE_SCHEDULED_WARMUP_BATCH_SIZE || env.ROUTE_WARMUP_BATCH_SIZE || 30),
  targetSize = Number(env.ROUTE_WARMUP_TARGET || 400),
  targetSingle = Number(env.ROUTE_WARMUP_SINGLE_TARGET || 200),
  targetCross = Number(env.ROUTE_WARMUP_CROSS_TARGET || 200),
  minimumSingle = Number(env.ROUTE_WARMUP_SINGLE_MINIMUM || 100),
  minimumCross = Number(env.ROUTE_WARMUP_CROSS_MINIMUM || 100),
  minimumTotal = Number(env.ROUTE_WARMUP_TOTAL_MINIMUM || 200),
  delayMs = Number(env.ROUTE_WARMUP_DELAY_MS || 8_000),
  cooldownMs = Number(env.ROUTE_WARMUP_COOLDOWN_MS || 60_000),
  now = () => new Date(),
  log = () => {},
  // Phase 5 planner-driven coverage gap 填补（产品边界：仅后台 warmup 调，前台永不调 planner）
  knowledgeGraphPoolPath = path.resolve(".route-v2-cache", "knowledge-graph-pool.json"),
  acceptedRepository = null,
  plannerEnabled = env.ROUTE_PLANNER_ENABLED !== "false",
  plannerBatchSize = Number(env.ROUTE_PLANNER_BATCH_SIZE || 3),
  plannerDeadlineMs = Number(env.ROUTE_PLANNER_DEADLINE_MS || 90_000),
  plannerCountries = (env.ROUTE_PLANNER_COUNTRIES || "JP,US,IT,TH,AU").split(",").map((c) => c.trim()).filter(Boolean),
  // 策略 seam：可传 strategy 对象、或 id 字符串、或 env ROUTE_PLANNER_STRATEGY（seed|coverage-matrix|search-miss|...）。未识别降级 seed
  plannerStrategy = env.ROUTE_PLANNER_STRATEGY || "seed",
  plannerJobStore = null,
  plannerSignals = {},
  fetchImpl = globalThis.fetch,
  // 可选注入：不传则从 env 构建（生产默认）。测试 / admin CLI 可注入 stub provider 跳过真实 LLM 富化
  textEnrichmentProvider = null,
} = {}) {
  const textProvider = textEnrichmentProvider || createConfiguredTextEnrichmentProvider(env);
  if (!textProvider && batchSize > 0) {
    return {
      ok: false,
      error: "TEXT_ENRICHMENT_PROVIDER_REQUIRED",
      message: "Route Repository warmup requires a configured text enrichment provider.",
    };
  }
  const effectiveTextProvider = textProvider || {
    providerId: "planner-only-noop-text",
    capabilities: { textEnrichment: false, configured: true },
    async enrich(record) { return record; },
  };

  const watermarks = acceptedPoolWatermarks({
    targets: { single: targetSingle, cross: targetCross },
    minimums: { single: minimumSingle, cross: minimumCross },
    totalTarget: targetSize,
    totalMinimum: minimumTotal,
  });
  const repository = acceptedRepository || createAcceptedRouteRepository({
    storagePath,
    poolTargets: watermarks.targets,
    poolMinimums: watermarks.minimums,
    totalTarget: watermarks.totalTarget,
    totalMinimum: watermarks.totalMinimum,
  });
  const evidenceRepository = createEvidenceRepository({ storagePath: evidenceStoragePath });
  const syncStateStore = createProviderSyncStateStore({ storagePath: syncStatePath });
  const previousSync = syncStateStore.get(PROVIDER_ID);
  const liveProvider = createLiveDiscoveryProvider();
  const enricher = createContentEnricher({ provider: effectiveTextProvider });
  const warmupImageProvider = createWikimediaImageProvider({ fetchImpl });
  const before = poolStats(repository, watermarks);
  const startedAt = now().toISOString();
  const reasonCounts = {};
  const results = [];
  let nextContinuation = previousSync.continuation || null;
  let rateLimit = null;
  let retryAfter = 0;
  let scannedCount = 0;
  let candidateCount = 0;

  try {
    const batch = batchSize <= 0
      ? { members: [], continuation: previousSync.continuation || null }
      : await fetchCategoryBatch({ continuation: previousSync.continuation || null, batchSize, cooldownMs });
    nextContinuation = batch.continuation;
    scannedCount = batch.members.length;
    const seenIds = new Set(repositoryRecords(repository).map((record) => record.id));
    const candidates = batch.members.filter((member) => !seenIds.has(`wikivoyage-${member.pageid}`));
    candidateCount = candidates.length;
    log({ stage: "provider-batch", scannedCount, candidateCount, continuation: nextContinuation });

    for (const member of candidates) {
      if (!shouldContinueWarmup(repository, watermarks)) break;
      try {
        const result = await buildCandidate({ member, repository, evidenceRepository, liveProvider, enricher, imageProvider: warmupImageProvider });
        if (result.status === "accepted") {
          const record = repository.get(result.routeId);
          if (record) evidenceRepository.ingestRouteRecord(record);
        }
        results.push(result);
        countByReason(reasonCounts, result);
        log(result);
      } catch (error) {
        const result = {
          status: "failed",
          routeId: `wikivoyage-${member.pageid}`,
          title: member.title,
          reason: error.message,
        };
        results.push(result);
        countByReason(reasonCounts, result);
        log(result);
        if (/429|Too Many Requests|rate/i.test(error.message)) await wait(cooldownMs);
      }
      await wait(delayMs);
    }
  } catch (error) {
    rateLimit = error.status === 429 ? "wikivoyage-category" : null;
    retryAfter = error.retryAfter || 0;
    const result = { status: "failed", title: "Category:Itineraries", routeId: "", reason: error.message };
    results.push(result);
    countByReason(reasonCounts, result);
  }

  const acceptedCount = results.filter((result) => result.status === "accepted").length;
  const rejectedCount = results.filter((result) => result.status === "rejected" || result.status === "skipped").length;
  const deferredCount = results.filter((result) => result.status === "deferred").length;
  const failedCount = results.filter((result) => result.status === "failed").length;
  const finishedAt = now().toISOString();
  const after = poolStats(repository, watermarks);

  // Phase 5 planner phase：planner 补 Wikivoyage 之外的 coverage gap。仅 warmup/admin CLI 调，前台永不调（产品边界）
  let plannerPhase = { ran: false, accepted: 0, rejected: 0, llmEnabled: false, evidenceEnabled: false };
  if (plannerEnabled && shouldContinueWarmup(repository, watermarks)) {
    try {
      plannerPhase = await runPlannerPhase({
        repository, evidenceRepository, env, stats: after,
        knowledgeGraphPoolPath, plannerBatchSize, plannerDeadlineMs,
        plannerCountries, fetchImpl, now, log,
        plannerStrategy,
        jobStore: plannerJobStore,
        signals: {
          now: now().toISOString(),
          operatorCountries: env.ROUTE_PLANNER_OPERATOR_COUNTRIES || "",
          ...plannerSignals,
        },
      });
    } catch (error) {
      plannerPhase = { ran: true, error: `planner-phase-crashed: ${error.message}`, accepted: 0, rejected: 0 };
    }
  }
  const finalAfter = poolStats(repository, watermarks);

  const nextRunAt = new Date(Date.now() + (retryAfter ? retryAfter * 1000 : 24 * 60 * 60 * 1000)).toISOString();
  const providerSync = syncStateStore.update(PROVIDER_ID, {
    lastSyncAt: finishedAt,
    cursor: nextContinuation ? JSON.stringify(nextContinuation) : "",
    continuation: nextContinuation,
    scannedCount: (previousSync.scannedCount || 0) + scannedCount,
    candidateCount: (previousSync.candidateCount || 0) + candidateCount,
    acceptedCount: (previousSync.acceptedCount || 0) + acceptedCount,
    rejectedCount: (previousSync.rejectedCount || 0) + rejectedCount,
    deferredCount: (previousSync.deferredCount || 0) + deferredCount,
    failedCount: (previousSync.failedCount || 0) + failedCount,
    nextRunAt,
    rateLimit,
    retryAfter,
    lastRun: {
      startedAt,
      finishedAt,
      scannedCount,
      candidateCount,
      acceptedCount,
      rejectedCount,
      deferredCount,
      failedCount,
      reasonCounts,
    },
  });

  return {
    ok: true,
    providerId: PROVIDER_ID,
    startedAt,
    finishedAt,
    storagePath,
    syncStatePath,
    batchSize,
    before,
    after: finalAfter,
    plannerPhase,
    providerSync,
    results,
    rejectedDeferredReasonCounts: reasonCounts,
    poolShortageDiagnostics: poolShortages(finalAfter),
    minimumShortageDiagnostics: minimumShortages(finalAfter),
    completionStatus: finalAfter.meetsMinimum ? "minimum-met" : "below-minimum",
  };
}
