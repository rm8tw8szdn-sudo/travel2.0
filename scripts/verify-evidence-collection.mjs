// Phase 4 回归：Tavily Evidence 采集（英文标准化 query 优先 + 提取修复 + 缺段回填）
// 运行：node scripts/verify-evidence-collection.mjs
// 验证：planner needsEvidence → collectMissingSegmentEvidence 用英文 query 采集 →
//       evidenceCheck 按 skeletonSegment 标注回配 → enrichmentStatus 升级为 enriched
//   不耗 Tavily key：用注入的 mock webEvidencePipeline（返回可被拉丁正则解析的英文 snippet）
import assert from "node:assert/strict";
import os from "node:os";
import fs from "node:fs";
import path from "node:path";
import {
  createAcceptedRouteRepository,
  createEvidenceRepository,
  createRouteCompositionPlanner,
  createWebEvidenceExtractor,
  createWebEvidenceCorroborator,
} from "../src/lib/routes/index.mjs";

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "route-evidence-"));
const acceptedRepository = createAcceptedRouteRepository({ storagePath: path.join(tempDir, "accepted.json") });
const evidenceRepository = createEvidenceRepository({ storagePath: path.join(tempDir, "evidence.json") });

// ─── mock 知识图：日本 5 目的地，带英文 label（sourceTitle = Wikidata en label）────
// 真实生产：online-standardizer.mjs:149 已对每个实体产出 sourceTitle = entity.labels.en.value
// 这里模拟该字段，让采集器能取到英文 label 构造 query
const JP_POOL = [
  { wikidataId: "Q1490", countryCode: "JP", name: "东京", sourceTitle: "Tokyo", entityTypeName: "city", latitude: 35.6762, longitude: 139.6503, countryName: "日本" },
  { wikidataId: "Q39231", countryCode: "JP", name: "富士山", sourceTitle: "Mount Fuji", entityTypeName: "mountain", latitude: 35.3606, longitude: 138.7274, countryName: "日本" },
  { wikidataId: "Q34600", countryCode: "JP", name: "京都", sourceTitle: "Kyoto", entityTypeName: "city", latitude: 35.0116, longitude: 135.7681, countryName: "日本" },
  { wikidataId: "Q169134", countryCode: "JP", name: "奈良", sourceTitle: "Nara", entityTypeName: "city", latitude: 34.6851, longitude: 135.8048, countryName: "日本" },
  { wikidataId: "Q35765", countryCode: "JP", name: "大阪", sourceTitle: "Osaka", entityTypeName: "city", latitude: 34.6937, longitude: 135.5023, countryName: "日本" },
];
const knowledgeGraph = {
  queryDestinations(query) {
    if (query.country === "JP" || query.country === "日本") return JP_POOL.slice();
    return [];
  },
};

// ─── 记录采集器发出的 query，断言用的是英文 label 而非中文 ────────────────
// mock 对每段相邻 pair 返回可解析英文 snippet（Wikipedia 风格，拉丁正则可命中）
//   覆盖骨架全部相邻段 → 回填后 missing=0 → enrichmentStatus=enriched
const issuedQueries = [];
const seenQueryTexts = new Set();
const SEGMENT_ANSWERS = [
  { match: /Tokyo\b.*Mount Fuji\b|Mount Fuji\b.*Tokyo\b/, title: "Tokyo to Mount Fuji travel", snippet: "The Limited Express train connects Tokyo and Mount Fuji. Distance 100 km, about 1.5 hours by rail. JR East operates frequent services.", url: "https://en.wikipedia.org/wiki/Tokyo_Station" },
  { match: /Mount Fuji\b.*Kyoto\b|Kyoto\b.*Mount Fuji\b/, title: "Mount Fuji to Kyoto train", snippet: "The shinkansen connects Mount Fuji area and Kyoto. Distance 300 km, about 2 hours by rail.", url: "https://en.wikipedia.org/wiki/Tokaido_Shinkansen" },
  { match: /Kyoto\b.*Nara\b|Nara\b.*Kyoto\b/, title: "Kyoto to Nara train", snippet: "The JR Nara Line connects Kyoto and Nara. Distance 40 km, about 45 minutes by rail.", url: "https://en.wikipedia.org/wiki/JR_Nara_Line" },
  { match: /Nara\b.*Osaka\b|Osaka\b.*Nara\b/, title: "Nara to Osaka train", snippet: "The JR Yamatoji Line connects Nara and Osaka. Distance 30 km, about 40 minutes by rail.", url: "https://en.wikipedia.org/wiki/Yamatoji_Line" },
];
const mockProvider = {
  providerId: "web-search",
  capabilities: { evidenceSource: true, configured: true },
  async searchEvidence({ query, limit = 5 } = {}) {
    issuedQueries.push(query);
    seenQueryTexts.add(query);
    const answer = SEGMENT_ANSWERS.find((a) => a.match.test(query));
    const results = answer ? [{ sourceUrl: answer.url, sourceTitle: answer.title, sourceSnippet: answer.snippet, rank: 1 }] : [];
    return { mode: "injected", isRealSearch: false, query, retrievedAt: new Date().toISOString(), results, diagnostics: [] };
  },
};
const extractor = createWebEvidenceExtractor();
const corroborator = createWebEvidenceCorroborator();
const webEvidencePipeline = { provider: mockProvider, extractor, corroborator };

// ─── 1. 无 webEvidencePipeline：空 evidence repo → needsEvidence（不采集）────
const plannerNoPipe = createRouteCompositionPlanner({ evidenceRepository, acceptedRepository, knowledgeGraph });
const r1 = await plannerNoPipe.buildCandidates({
  limit: 1, context: { durationDays: 8, country: "JP", countryName: "日本", travelStyle: "classic-first-trip" },
});
assert.ok(r1.accepted.length >= 1, `pipeline should accept without webPipeline, rejected: ${JSON.stringify(r1.rejected)}`);
assert.equal(r1.accepted[0].record.enrichmentStatus, "needsEvidence", "empty repo + no collector → needsEvidence");
assert.equal(r1.accepted[0].evidenceCollect, null, "no webPipeline → evidenceCollect is null");

// ─── 2. 注入 webEvidencePipeline：缺段 → 采集器用英文 query 采集 → 回配 → enriched ─
// 用新的 accepted repo 避免与 #1 的候选 dedupe 冲突
const acceptedRepository2 = createAcceptedRouteRepository({ storagePath: path.join(tempDir, "accepted2.json") });
const evidenceRepository2 = createEvidenceRepository({ storagePath: path.join(tempDir, "evidence2.json") });
const planner = createRouteCompositionPlanner({
  evidenceRepository: evidenceRepository2, acceptedRepository: acceptedRepository2,
  knowledgeGraph, webEvidencePipeline,
});

issuedQueries.length = 0;
const r2 = await planner.buildCandidates({
  limit: 1, context: { durationDays: 8, country: "JP", countryName: "日本", travelStyle: "classic-first-trip" },
});
assert.ok(r2.accepted.length >= 1, `pipeline with collector should accept, rejected: ${JSON.stringify(r2.rejected)}`);
const cand = r2.accepted[0];

// 2a. 采集器被调用且发了 query
assert.ok(issuedQueries.length > 0, "collector must issue queries when segments missing");
// 2b. query 用英文 label（"Tokyo Mount Fuji train travel"），不含中文
const hasChinese = (s) => /[㐀-鿿]/u.test(s);
assert.ok(issuedQueries.every((q) => !hasChinese(q)), `queries must be English-standardized (no CJK): ${JSON.stringify(issuedQueries)}`);
assert.ok(issuedQueries.some((q) => /Tokyo/.test(q) && /Mount Fuji/.test(q)), `must include Tokyo↔Mount Fuji english query: ${JSON.stringify(issuedQueries)}`);

// 2c. evidenceCollect 结构完整（至少为 Tokyo→Mount Fuji 段采到 1 条）
assert.ok(cand.evidenceCollect, "candidate must carry evidenceCollect result");
assert.ok(cand.evidenceCollect.collected > 0, `should collect >=1 evidence, got ${cand.evidenceCollect.collected}`);
assert.ok(cand.evidenceCollect.written > 0, `should write >=1 evidence to repo, got ${cand.evidenceCollect.written}`);

// 2d. 回配成功：evidenceCheck 重跑后 evidenceRefs 包含 Tokyo↔Mount Fuji 段
const refs = cand.evidenceResult.evidenceRefs;
assert.ok(refs.length > 0, "after backfill, evidenceRefs must be non-empty");
const segRef = refs.find((r) => (r.fromEntityId === "Q1490" && r.toEntityId === "Q39231") || (r.fromEntityId === "Q39231" && r.toEntityId === "Q1490"));
assert.ok(segRef, `must have Tokyo↔Mount Fuji segment ref after backfill, refs=${JSON.stringify(refs)}`);

// 2e. enrichmentStatus 升级为 enriched（全段回填后 missingSegments=0）
//   buildPlannerRecord 语义：所有相邻段都有 evidence 才 enriched；回填前 missing=4, 回填后 missing=0
assert.equal(cand.evidenceResult.missingSegments.length, 0, `after full backfill, no segments missing, got ${cand.evidenceResult.missingSegments.length}`);
assert.equal(cand.record.enrichmentStatus, "enriched", `after full backfill → enriched, got ${cand.record.enrichmentStatus}`);

// ─── 3. evidence 真的进了仓库（可被独立 list 复查） ────────────────────
const stored = evidenceRepository2.list();
const transportEv = stored.filter((e) => e.kind === "transport-connection" || e.kind === "segment-metric");
assert.ok(transportEv.length > 0, "transport evidence must be persisted in evidence repo");
const annotated = transportEv.filter((e) => e.qualifiers?.skeletonSegment);
assert.ok(annotated.length > 0, "collected evidence must carry skeletonSegment annotation");
const annotation = annotated[0].qualifiers.skeletonSegment;
assert.ok(annotation.fromEntityId && annotation.toEntityId, "annotation must carry wikidataIds for matching");
assert.ok((annotation.fromEnglish || annotation.toEnglish), "annotation must carry english label");

// ─── 4. 提取器只从 title/snippet/sourceUrl 取证据，不读 Tavily answer ──────
// mockProvider 没返回 answer 字段；若提取器依赖 answer，transportEv 会为空（已在 #3 证明非空）
// 再显式验证：给一条带 answer 的结果，确认 answer 不变成 evidence
const seenAnswer = { hit: false };
const providerWithAnswer = {
  providerId: "web-search",
  capabilities: { evidenceSource: true, configured: true },
  async searchEvidence({ query } = {}) {
    return {
      mode: "injected", isRealSearch: false, query, retrievedAt: new Date().toISOString(),
      results: [{
        sourceUrl: "https://en.wikivoyage.org/wiki/Kyoto",
        sourceTitle: "Kyoto to Nara train",
        sourceSnippet: "The JR Nara Line connects Kyoto and Nara in about 45 minutes by rail.",
        rank: 1,
      }],
      answer: "Kyoto and Nara are connected by JR Nara Line.", // Tavily answer —— 不得作为 evidence
      diagnostics: [],
    };
  },
};
const evidenceRepository3 = createEvidenceRepository({ storagePath: path.join(tempDir, "evidence3.json") });
const acceptedRepository3 = createAcceptedRouteRepository({ storagePath: path.join(tempDir, "accepted3.json") });
const planner3 = createRouteCompositionPlanner({
  evidenceRepository: evidenceRepository3, acceptedRepository: acceptedRepository3,
  knowledgeGraph, webEvidencePipeline: { provider: providerWithAnswer, extractor, corroborator },
});
const r3 = await planner3.buildCandidates({
  limit: 1, context: { durationDays: 8, country: "JP", countryName: "日本", travelStyle: "classic-first-trip" },
});
if (r3.accepted.length) {
  const stored3 = evidenceRepository3.list();
  // 确认没有任何 evidence 的 value/sourceUrl 来自 answer 字段
  const fromAnswer = stored3.filter((e) => /Tavily answer|are connected by JR Nara Line\./.test(JSON.stringify(e.value || "")));
  assert.equal(fromAnswer.length, 0, "Tavily answer must NOT become evidence (only title/snippet/sourceUrl)");
}

// ─── 5. 可信源过滤：commercial 源被 scorer 拒，不产 evidence ─────────────
// web-source-scorer 对 booking/hotel 类 host 给 low-source-score；提取器应跳过
const providerCommercial = {
  providerId: "web-search",
  capabilities: { evidenceSource: true, configured: true },
  async searchEvidence({ query } = {}) {
    return {
      mode: "injected", isRealSearch: false, query, retrievedAt: new Date().toISOString(),
      results: [
        { sourceUrl: "https://www.booking.com/hotel/tokyo-fuji", sourceTitle: "Tokyo Fuji Hotel Booking Deal", sourceSnippet: "Book Tokyo to Fuji hotel discount transfer coupon", rank: 1 },
        { sourceUrl: "https://en.wikipedia.org/wiki/Tokyo", sourceTitle: "Tokyo travel", sourceSnippet: "Tokyo rail connects to Mount Fuji. Distance 100 km by train.", rank: 2 },
      ],
      diagnostics: [],
    };
  },
};
const evidenceRepository4 = createEvidenceRepository({ storagePath: path.join(tempDir, "evidence4.json") });
const acceptedRepository4 = createAcceptedRouteRepository({ storagePath: path.join(tempDir, "accepted4.json") });
const planner4 = createRouteCompositionPlanner({
  evidenceRepository: evidenceRepository4, acceptedRepository: acceptedRepository4,
  knowledgeGraph, webEvidencePipeline: { provider: providerCommercial, extractor, corroborator },
});
const r4 = await planner4.buildCandidates({
  limit: 1, context: { durationDays: 8, country: "JP", countryName: "日本", travelStyle: "classic-first-trip" },
});
if (r4.accepted.length) {
  const stored4 = evidenceRepository4.list();
  const fromBooking = stored4.filter((e) => /booking\.com/.test(e.provenance?.sourceUrl || ""));
  assert.equal(fromBooking.length, 0, "commercial/booking source must be filtered out by scorer");
}

// ─── 6. 采集失败不阻断管线（provider 抛错 → 管线仍产出，evidenceCollect 空写） ─
const providerBroken = {
  providerId: "web-search",
  capabilities: { evidenceSource: true, configured: true },
  async searchEvidence() { throw new Error("network-down"); },
};
const evidenceRepository5 = createEvidenceRepository({ storagePath: path.join(tempDir, "evidence5.json") });
const acceptedRepository5 = createAcceptedRouteRepository({ storagePath: path.join(tempDir, "accepted5.json") });
const planner5 = createRouteCompositionPlanner({
  evidenceRepository: evidenceRepository5, acceptedRepository: acceptedRepository5,
  knowledgeGraph, webEvidencePipeline: { provider: providerBroken, extractor, corroborator },
});
const r5 = await planner5.buildCandidates({
  limit: 1, context: { durationDays: 8, country: "JP", countryName: "日本", travelStyle: "classic-first-trip" },
});
assert.ok(r5.accepted.length >= 1, "pipeline must not block when collector throws");
assert.equal(r5.accepted[0].record.enrichmentStatus, "needsEvidence", "failed collection → stays needsEvidence");

console.log(`Phase 4 evidence collection verified: english-standardized query (no CJK) → latin-regex extraction → skeletonSegment annotation backfill → evidenceCheck re-pass → enrichmentStatus upgraded to enriched. Tavily answer NOT used as evidence. Commercial sources filtered. Collector failure non-blocking. Queries issued: ${JSON.stringify([...seenQueryTexts])}`);
