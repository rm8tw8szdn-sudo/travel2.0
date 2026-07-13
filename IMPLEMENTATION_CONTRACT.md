# Route Generation V2 Implementation Contract

本文件用于冻结 `ROUTE_GENERATION_V2_ARCHITECTURE.md` 与 `ROUTE_GENERATION_V2_MIGRATION_MATRIX.md` 的实现边界。

本文件不是开发任务，不创建模块，不修改 Planner、Feed、Repository、缓存或路线数据。它只说明：如果按照当前 Architecture 实施，各对象应放在哪里、依赖什么、谁能读取、谁不能读取、失败后如何降级、是否需要 Feature Flag、如何回滚，以及是否影响现有系统。

## 0. 全局约束

- 不推倒重写。
- 不改变当前 Feed 默认行为。
- 不让 Candidate Pool / Search-generated / realtime Planner 直接进入 Feed。
- 新存储与 `.route-v2-cache/accepted-routes.json` 分离。
- `RouteRecord` 与 `DecisionTrace` 分离。
- 模板只负责表达，不负责判断路线成立。
- Tavily / Wikivoyage 只进入 EvidenceBundle，不直接决定最终路线。
- LLM 只做比较、组合、解释、结构化，不凭空补事实。
- 所有 V2 功能默认关闭，通过 Feature Flag 渐进打开。

## 1. RouteIntent

### 1.1 准备放在哪些文件

不创建独立 RouteIntent 模块。按照当前 Architecture，RouteIntent 是生成前输入对象，应放在：

- `src/lib/routes/decision-trace-schema.mjs`：定义 RouteIntent snapshot schema，供 DecisionTrace.inputContext 使用。
- `src/lib/routes/route-candidate-pool.mjs`：保存 candidate pool 时嵌入 intentId 和 input intent snapshot。
- 现有入口只在未来 Phase 中读取/构造，不在本次创建：
  - `src/lib/routes/repository-warmup-runner.mjs`
  - `src/lib/routes/route-search-service.mjs`
  - `src/lib/routes/route-composition-planner.mjs`

### 1.2 依赖哪些现有模块

- Search intent parser / Search V1 normalized intent。
- `src/lib/routes/repository-warmup-runner.mjs` 的 context selection。
- Coverage matrix / Gold Case scripts。
- `src/lib/routes/accepted-repository.mjs` 的 repository status。

### 1.3 哪些现有模块需要读取它

- `route-composition-planner.mjs`：未来 V2 path 从 RouteIntent 构建 candidate generation input。
- `route-candidate-pool.mjs`：保存 intentId 和 input snapshot。
- `decision-trace-store.mjs`：写入 DecisionTrace.inputContext。
- Review/reporting scripts：统计 intent -> route 的覆盖和失败。

### 1.4 哪些现有模块不能读取它

- `routes.js`：前端 Feed 不读取 RouteIntent。
- `route-feed-bootstrap.js`：bootstrap 不读取 RouteIntent。
- 图片系统：不读取 RouteIntent，只读取最终 RouteRecord / cover input。
- `accepted-repository.mjs` 的 Feed list path：不直接读取 RouteIntent 来排序或筛选。

### 1.5 需要修改 / 禁止修改

需要修改：

- Phase 1/2 后，`route-composition-planner.mjs` 旁路接收 RouteIntent snapshot。
- Phase 2 后，`route-candidate-pool.mjs` 保存 intent snapshot。
- Phase 6 后，RouteRecord 可保存 intentId 引用。

禁止修改：

- 不修改 `.route-v2-cache/accepted-routes.json` 历史数据。
- 不修改 `routes.js` Feed 渲染逻辑来读取 RouteIntent。
- 不修改图片系统用 intent 选图。

### 1.6 数据流

输入：

Search / Warmup / Coverage / Operator intent

↓

输出：

RouteIntent `{ intentId, strategyType, targetCountries, duration, season, theme, budgetConstraint, noveltyTarget, coverageGoal, exclusions }`

↓

下一层读取：

Candidate Generation 读取 RouteIntent，生成多个 RouteCandidate。

↓

DecisionTrace 记录 inputContext。

↓

RouteRecord 只保存 intentId，不保存完整决策上下文。

### 1.7 失败策略

- RouteIntent 构造失败：不启动 V2 candidate generation。
- Search path：返回已有 accepted/cache 结果或 suggestion，不生成 V2 route。
- Warmup path：记录 skipped intent，不写 Candidate Pool。
- Planner 是否继续：legacy Planner 可继续；V2 path 停止。

### 1.8 Feature Flag

- Flag: `ROUTE_V2_INTENT_ENABLED`
- 默认值：`false`

### 1.9 回滚

- 关闭 `ROUTE_V2_INTENT_ENABLED`。
- Candidate Generation 回到 legacy context。
- 已保存 intent snapshot 可保留供审计，不参与生成。

### 1.10 影响面

| 系统 | 是否影响 |
|---|---|
| Feed | NO |
| Search | YES |
| Accepted Repository | NO |
| 图片系统 | NO |

## 2. RouteCandidate

### 2.1 准备放在哪些文件

- `src/lib/routes/route-candidate-pool.mjs`：RouteCandidate schema、candidate state、selected/rejected/pending 状态。
- `src/lib/routes/decision-trace-schema.mjs`：DecisionTrace.candidatePool summary 的 schema。
- 未来可能被现有 Planner 写入，但不在本次创建：
  - `src/lib/routes/route-composition-planner.mjs`
  - `scripts/materialize-route-pool.mjs` 只作为 legacy seed，不改变职责。

### 2.2 依赖哪些现有模块

- `knowledge-graph-pool.json`
- `route-composition-planner.mjs` 的 `selectDestinationPool` / `buildRouteSkeleton`
- `materialize-route-pool.mjs` 的 profile / distance / plausibleCountries 逻辑作为 legacy candidate seed 参考
- `route-dedupe.mjs`
- `accepted-repository.mjs` 用于 existing fingerprints

### 2.3 哪些现有模块需要读取它

- Route Reasoning：比较候选。
- Evidence Enrichment：为 candidateId 绑定证据。
- Validation：验证 selected candidate。
- DecisionTrace：记录 candidatePool、selectedCandidate、rejectedCandidates。
- Review：读取 selected candidate 和 validation result。

### 2.4 哪些现有模块不能读取它

- Feed API 不能直接读取 Candidate Pool。
- `routes.js` 不能渲染 RouteCandidate。
- `accepted-repository.mjs` 的 public feed path 不能从 Candidate Pool 补数据。
- 图片预热不能对 pending candidate 做用户可见图片承诺。

### 2.5 需要修改 / 禁止修改

需要修改：

- Phase 2：`route-composition-planner.mjs` 增加 V2 candidate path behind flag。
- Phase 2：新增/使用 `route-candidate-pool.mjs`。
- Phase 3：EvidenceBundle 写入 candidateId。

禁止修改：

- 不批量重写 accepted routes。
- 不改变 legacy single winner path。
- 不让 Candidate Pool 写入 Feed。

### 2.6 数据流

输入：

RouteIntent

↓

Candidate Generation 读取 Knowledge Graph、existing fingerprints、exclusions

↓

输出：

RouteCandidate[]，每条含 candidateId、countries、destinations、proposedOrder、generationSource、initialReason、supportingSignals、noveltyScore、status

↓

下一层读取：

Evidence Enrichment 按 candidateId 补证据

↓

Route Reasoning 比较候选

↓

DecisionTrace 保存 candidatePool 和 rejectedCandidates

### 2.7 失败策略

- Candidate pool 为空：写 DecisionTrace.unknowns 或 pool diagnostics，intent 状态为 no-candidate。
- 单个 candidate 生成失败：保存 rejectionReasons，不影响其它 candidates。
- Candidate Pool 写失败：V2 path 停止；legacy Planner 可继续。
- Planner 是否继续：legacy path 继续；V2 route 不进入 accepted。

### 2.8 Feature Flag

- Flag: `ROUTE_V2_CANDIDATE_POOL_ENABLED`
- 默认值：`false`

### 2.9 回滚

- 关闭 `ROUTE_V2_CANDIDATE_POOL_ENABLED`。
- Planner 回到 legacy single-route path。
- Candidate pool storage 保留但不读取。

### 2.10 影响面

| 系统 | 是否影响 |
|---|---|
| Feed | NO |
| Search | YES |
| Accepted Repository | NO |
| 图片系统 | NO |

## 3. EvidenceBundle

### 3.1 准备放在哪些文件

- `src/lib/routes/evidence-bundle-schema.mjs`：EvidenceBundle schema。
- `src/lib/routes/evidence-bundle-store.mjs`：EvidenceBundle storage。
- 可兼容读取/写入现有：
  - `src/lib/routes/evidence-repository.mjs`
  - `src/lib/routes/web-search-evidence-provider.mjs`
  - `src/lib/routes/web-search-evidence-runner.mjs`
  - `src/lib/routes/web-evidence-extractor.mjs`
  - `src/lib/routes/live-provider.mjs`
  - `src/lib/routes/online-standardizer.mjs`

### 3.2 依赖哪些现有模块

- `evidence-repository.mjs`
- Tavily/Web search provider
- Web evidence extractor/corroborator
- Wikivoyage live provider
- Wikidata resolver
- RouteCandidate.candidateId

### 3.3 哪些现有模块需要读取它

- Route Reasoning：只引用 facts，不让 LLM 编造事实。
- Validation：按 strategy requirements 验证 transport/season/budget/theme/geography。
- DecisionTrace：记录 dataSourcesUsed 和 supportsWhichDecision。
- Review：判断是否 accepted / pending-evidence / needs-review。

### 3.4 哪些现有模块不能读取它

- Feed 不能直接读取 EvidenceBundle。
- `routes.js` 不能展示 raw EvidenceBundle。
- 图片系统不能把 EvidenceBundle 当图片验证。
- Search realtime 不能因为 EvidenceBundle 存在直接写 accepted。

### 3.5 需要修改 / 禁止修改

需要修改：

- Phase 3：Web evidence runner 写 EvidenceBundle，而不是只写 route-evidence。
- Phase 3：Validation 从 EvidenceBundle 读取 supportsWhichDecision。
- Phase 3：DecisionTrace 记录 evidence ids。

禁止修改：

- Feed 不得调用 Tavily。
- Tavily 不得直接生成 RouteRecord。
- Summary / plannerReason 不得作为 evidence。

### 3.6 数据流

输入：

RouteCandidate + missing evidence request

↓

Evidence Enrichment 判断是否已有 route-evidence 可用

↓

必要时调用 Tavily / Wikivoyage / Wikidata

↓

输出：

EvidenceBundle `{ candidateId, sourceType, sourceUrl/sourceId, extractedFacts, evidenceCategory, freshness, confidence, supportsWhichDecision }`

↓

下一层读取：

Route Reasoning 和 Validation 读取 EvidenceBundle

↓

DecisionTrace 记录 dataSourcesUsed

### 3.7 失败策略

- Tavily 超时：EvidenceBundle request 标记 provider_timeout；candidate -> pending-evidence。
- Tavily 未配置：标记 provider_not_configured；不伪造事实。
- Wikivoyage 标准化失败：记录 rejected/deferred；candidate 可继续 KG-only，但 required evidence 缺失则不能 accepted。
- EvidenceBundle 写失败：V2 candidate 不进入 Review；legacy path 不受影响。

### 3.8 Feature Flag

- Flag: `ROUTE_V2_EVIDENCE_BUNDLE_ENABLED`
- 默认值：`false`

### 3.9 回滚

- 关闭 `ROUTE_V2_EVIDENCE_BUNDLE_ENABLED`。
- Validation 回到 KG/legacy evidence only。
- Candidate 缺证据时 pending，不进入 accepted。

### 3.10 影响面

| 系统 | 是否影响 |
|---|---|
| Feed | NO |
| Search | YES |
| Accepted Repository | NO |
| 图片系统 | NO |

## 4. DecisionTrace

### 4.1 准备放在哪些文件

- `src/lib/routes/decision-trace-schema.mjs`：DecisionTrace schema，包含 RouteIntent snapshot、candidatePool summary、ValidationResult reference。
- `src/lib/routes/decision-trace-store.mjs`：DecisionTrace storage。
- V2 RouteRecord 只保存 `decisionTraceId`。

### 4.2 依赖哪些现有模块

- RouteIntent
- Candidate Pool
- EvidenceBundle
- ValidationResult
- existing route id / candidate id / intent id
- Planner pipeline diagnostics

### 4.3 哪些现有模块需要读取它

- Review：确认 route 是否可审计。
- Debug/audit scripts：解释为什么生成路线。
- Future detail/admin view：按 routeId 查看 trace。
- Accepted repository adapter：只读 decisionTraceId 是否存在，不读取完整 trace 做 Feed 排序。

### 4.4 哪些现有模块不能读取它

- Feed 排序不能读取完整 DecisionTrace。
- `routes.js` 卡片渲染不能依赖完整 DecisionTrace。
- 图片系统不能读取 DecisionTrace。
- LLM 不能把旧 DecisionTrace 当事实来源生成新 facts。

### 4.5 需要修改 / 禁止修改

需要修改：

- Phase 1：Planner/materialize 旁路写 DecisionTrace。
- Phase 6：RouteRecord 增加 decisionTraceId reference。
- Review 读取 trace completeness。

禁止修改：

- 不改变 legacy RouteRecord 输出。
- 不要求旧路线 retroactive trace。
- 不让 trace 写失败阻断 legacy generation。

### 4.6 数据流

输入：

RouteIntent + RouteCandidate[] + EvidenceBundle[] + selected/rejected decisions + ValidationResult

↓

输出：

DecisionTrace `{ inputContext, candidatePool, selectedCandidate, rejectedCandidates, rejectionReasons, decisionFactors, strategyEffects, dataSourcesUsed, unknowns }`

↓

下一层读取：

Review 读取 trace completeness

↓

Accepted RouteRecord 保存 decisionTraceId

↓

Feed 可追踪 routeId -> decisionTraceId，但不读取完整 trace

### 4.7 失败策略

- DecisionTrace 写失败：legacy Planner 继续；V2 route 不能进入 V2 Review。
- 如果 Feature Flag 要求 strict trace，selected candidate -> needs-review / blocked。
- Search path 不等待 trace retry；返回 accepted/cache 结果。

### 4.8 Feature Flag

- Flag: `ROUTE_V2_TRACE_ENABLED`
- 默认值：`false`
- Strict flag: `ROUTE_V2_TRACE_REQUIRED_FOR_ACCEPT=false`

### 4.9 回滚

- 关闭 `ROUTE_V2_TRACE_ENABLED`。
- V2 Review 停止接收新 route。
- Existing trace storage 保留不读取。
- Feed 切回 legacy only。

### 4.10 影响面

| 系统 | 是否影响 |
|---|---|
| Feed | NO |
| Search | YES |
| Accepted Repository | YES |
| 图片系统 | NO |

## 5. ValidationResult

### 5.1 准备放在哪些文件

当前 Architecture 未给 ValidationResult 单独文件。按冻结设计，不新增独立模块名；ValidationResult schema 放在：

- `src/lib/routes/decision-trace-schema.mjs`：schema / snapshot。
- `src/lib/routes/route-candidate-pool.mjs`：candidate status 引用 validationId / validation snapshot。

现有 validator 未来读取 EvidenceBundle：

- `src/lib/routes/composition-validator.mjs`
- `src/lib/routes/content-quality.mjs`
- `src/lib/routes/route-design-strategy.mjs`
- `src/lib/routes/route-composition-planner.mjs`

### 5.2 依赖哪些现有模块

- EvidenceBundle
- Candidate Pool selected candidate
- `composition-validator.mjs`
- `content-quality.mjs`
- `route-design-strategy.mjs`
- route distance / segment metrics

### 5.3 哪些现有模块需要读取它

- Review：决定 accepted / needs-review / rejected。
- Ready Pool：只接收 review accepted + media ready。
- DecisionTrace：记录 validation summary。
- Accepted Repository：Phase 6 后可保存 validationId reference。

### 5.4 哪些现有模块不能读取它

- Feed 不能直接用 ValidationResult 排序。
- Search 不能把 ValidationResult pending 的路线当 accepted。
- 图片系统不能用 ValidationResult 替代 cover verification。

### 5.5 需要修改 / 禁止修改

需要修改：

- Phase 4/5：Validator 读取 EvidenceBundle 做 strategy-specific validation。
- Phase 6：RouteRecord 保存 validationId reference。

禁止修改：

- 不让 `contentQualityStatus === accepted` 单独代表 V2 accepted。
- 不把 template summary 当 content evidence。
- 不绕过 media ready。

### 5.6 数据流

输入：

Selected RouteCandidate + EvidenceBundle[] + strategy requirements

↓

输出：

ValidationResult `{ feasibility, transportEvidence, seasonalEvidence, budgetEvidence, geographicChecks, contentChecks, failureReasons, reviewStatus }`

↓

下一层读取：

Review 读取 ValidationResult.reviewStatus

↓

Ready Pool 读取 Review accepted + media ready

↓

RouteRecord 只保存 validationId

### 5.7 失败策略

- Validation fail：candidate -> rejected 或 needs-review，不能进入 Ready Pool。
- Evidence missing：candidate -> pending-evidence。
- Validator error：candidate -> needs-review；legacy flow 不受影响。

### 5.8 Feature Flag

- Flag: `ROUTE_V2_VALIDATION_ENABLED`
- 默认值：`false`

### 5.9 回滚

- 关闭 `ROUTE_V2_VALIDATION_ENABLED`。
- V2 route 不再进入 V2 Review。
- Legacy validator 继续服务旧路线。

### 5.10 影响面

| 系统 | 是否影响 |
|---|---|
| Feed | NO |
| Search | YES |
| Accepted Repository | YES |
| 图片系统 | NO |

## 6. Candidate Pool

### 6.1 准备放在哪些文件

- `src/lib/routes/route-candidate-pool.mjs`
- `.route-v2-cache/route-candidate-pool.jsonl` 或等价本地存储，具体存储名沿 Migration Matrix。

### 6.2 依赖哪些现有模块

- RouteIntent
- RouteCandidate
- EvidenceBundle ids
- DecisionTrace ids
- existing repository fingerprints

### 6.3 哪些现有模块需要读取它

- Evidence Enrichment：读取 pending evidence candidates。
- Route Reasoning：读取 candidate set。
- Review：读取 selected candidate and status。
- Audit/report scripts：读取 candidate/rejection stats。

### 6.4 哪些现有模块不能读取它

- Feed API 不能读 Candidate Pool。
- `routes.js` 不能读 Candidate Pool。
- Accepted Repository 不能从 Candidate Pool 自动 upsert。
- 图片系统不能为 pending candidate 生成用户可见承诺。

### 6.5 需要修改 / 禁止修改

需要修改：

- Phase 2：Planner V2 path 写 Candidate Pool。
- Phase 3：EvidenceBundle 更新 candidate evidence status。
- Phase 4/5：Validation 更新 selected/rejected status。

禁止修改：

- 不修改 legacy accepted route read path。
- 不批量迁移 accepted routes 到 Candidate Pool。

### 6.6 数据流

输入：

RouteIntent + generated RouteCandidate[]

↓

输出：

Candidate Pool records `{ intentId, candidates, selected, rejected, pendingEvidence, status }`

↓

下一层读取：

EvidenceBundle enrichment reads pending candidates

↓

Reasoning selects candidate

↓

Validation updates status

↓

Review reads selected accepted candidate

### 6.7 失败策略

- Candidate Pool write fail：V2 path stops; legacy path can continue.
- Candidate Pool read fail：Review cannot accept V2 route; route remains pending.
- Corrupt candidate record：skip record and log audit error; no Feed impact.

### 6.8 Feature Flag

- Flag: `ROUTE_V2_CANDIDATE_POOL_ENABLED`
- 默认值：`false`

### 6.9 回滚

- 关闭 flag。
- Ignore pool storage。
- Existing legacy accepted repository remains source of truth for Feed。

### 6.10 影响面

| 系统 | 是否影响 |
|---|---|
| Feed | NO |
| Search | YES |
| Accepted Repository | NO |
| 图片系统 | NO |

## 7. Review

### 7.1 准备放在哪些文件

Architecture 没有要求新增 Review 模块。按当前设计，Review 继续映射到现有/未来 review flow：

- `src/lib/routes/phase2c-review-candidates.mjs`
- `src/lib/routes/composition-validator.mjs`
- `src/lib/routes/content-quality.mjs`
- `src/lib/routes/route-candidate-pool.mjs`
- `src/lib/routes/decision-trace-store.mjs`

### 7.2 依赖哪些现有模块

- Candidate Pool
- DecisionTrace
- ValidationResult
- EvidenceBundle
- content quality validator
- composition validator

### 7.3 哪些现有模块需要读取它

- Ready Pool：只读取 Review accepted。
- Accepted Repository：Phase 6 后 upsert V2 accepted RouteRecord。
- Audit/report scripts：统计 accepted/rejected/needs-review。

### 7.4 哪些现有模块不能读取它

- Feed 不能读 Review pending candidates。
- Search 不能把 needs-review 当 accepted。
- 图片系统不能把 review pending 当 feed-ready。

### 7.5 需要修改 / 禁止修改

需要修改：

- Phase 6：Review 分开统计 legacy 和 V2。
- Phase 4/5：Review 判断 strategy-specific required evidence。

禁止修改：

- 不破坏 existing `contentQualityStatus` legacy behavior。
- 不让 Search-generated route 默认进入 Feed。
- 不让 Review 自动接受无 DecisionTrace 的 V2 route。

### 7.6 数据流

输入：

Selected candidate + DecisionTrace + ValidationResult + rendered RouteRecord draft

↓

输出：

Review status accepted / needs-review / rejected / pending-evidence

↓

下一层读取：

Accepted Repository receives accepted V2 RouteRecord only after Review accepted

↓

Ready Pool waits for media ready

↓

Feed reads Ready Pool / accepted repository

### 7.7 失败策略

- Review unavailable：V2 routes remain needs-review; no Feed impact。
- Missing DecisionTrace：reject or needs-review。
- Missing ValidationResult：pending-evidence or needs-review。
- Legacy route flow continues。

### 7.8 Feature Flag

- Flag: `ROUTE_V2_REVIEW_ENABLED`
- 默认值：`false`

### 7.9 回滚

- 关闭 V2 Review flag。
- Do not upsert V2 accepted routes。
- Feed remains legacy-only。

### 7.10 影响面

| 系统 | 是否影响 |
|---|---|
| Feed | NO |
| Search | YES |
| Accepted Repository | YES |
| 图片系统 | NO |

## 8. Ready Pool

### 8.1 准备放在哪些文件

Architecture 明确 Ready Pool 可先继续由 accepted repository + media flags 推导，是否独立存储仍是风险项。因此 Phase 0-6 不创建独立 Ready Pool 模块。

承载位置：

- `src/lib/routes/accepted-repository.mjs`：现有 `hasVerifiedFeedCover` / feed ready filtering。
- `.route-v2-cache/accepted-routes.json`：继续保存 accepted + media flags。
- Future optional gating config：只作为 config，不改变职责。

### 8.2 依赖哪些现有模块

- Accepted Repository
- Review accepted status
- ValidationResult reference
- media/image verification
- `onlineCoverAsset`
- `feedReady`

### 8.3 哪些现有模块需要读取它

- Feed API / discovery mode feed。
- `routes.js` infinite feed。
- bootstrap generation process。
- audit scripts。

### 8.4 哪些现有模块不能读取它

- Planner 不能根据 Ready Pool 直接生成事实。
- Candidate Generation 可以读取 distribution stats，但不能把 Ready Pool 状态当 route evidence。
- EvidenceBundle 不读取 Ready Pool。

### 8.5 需要修改 / 禁止修改

需要修改：

- Phase 6：Ready Pool gating 支持 legacy/V2 分开统计。
- Phase 7：通过 gating 降权/隐藏低质量 legacy，不直接删除。

禁止修改：

- 不直接删除 accepted routes。
- 不让 pending V2 route 进入 Ready Pool。
- 不跳过 image verification。

### 8.6 数据流

输入：

Review accepted RouteRecord + media verified cover

↓

输出：

Ready route candidate `{ accepted, validationId, decisionTraceId, feedReady, verified cover }`

↓

下一层读取：

Accepted Repository list filters ready routes

↓

Feed API returns publicFeedRecord

↓

routes.js renders cards

### 8.7 失败策略

- Media not ready：route stays accepted but not Ready Pool。
- V2 validation missing：not Ready Pool。
- Ready gating error：fallback to legacy hasVerifiedFeedCover behavior。

### 8.8 Feature Flag

- Flag: `ROUTE_V2_READY_POOL_GATING_ENABLED`
- 默认值：`false`

### 8.9 回滚

- 关闭 V2 gating。
- Revert to current accepted repository `hasVerifiedFeedCover` behavior。
- V2 routes can be hidden by generationVersion flag。

### 8.10 影响面

| 系统 | 是否影响 |
|---|---|
| Feed | YES |
| Search | NO |
| Accepted Repository | YES |
| 图片系统 | YES |

## 9. Feed

### 9.1 准备放在哪些文件

Feed 继续使用现有文件：

- `src/lib/routes/accepted-repository.mjs`
- `src/lib/routes/discovery.mjs`
- `routes.js`
- `route-feed-bootstrap.js`
- `server.js`

V2 不新增 Feed 模块。

### 9.2 依赖哪些现有模块

- Accepted Repository
- Ready Pool gating
- image verification
- route-feed-bootstrap payload
- discovery handler

### 9.3 哪些现有模块需要读取它

- Frontend `routes.js`
- Browser/UI
- Search does not read Feed directly; Search reads accepted repository/search service separately。

### 9.4 哪些现有模块不能读取它

- Planner 不能从 Feed 表现倒推 route validity。
- EvidenceBundle 不能使用 Feed visibility 当 evidence。
- DecisionTrace 不能把 Feed ranking 当生成理由。

### 9.5 需要修改 / 禁止修改

需要修改：

- Phase 6：Feed gating 可以按 feature flag 混入 V2 route。
- Phase 7：legacy retirement 只通过 Ready Pool/Feed gating。

禁止修改：

- Phase 1-5 不改 Feed。
- 不让 Feed 调 Tavily/Planner。
- 不让 Candidate Pool 直接出现在 Feed。

### 9.6 数据流

输入：

Accepted Repository list request `{ mode: feed, routeType, cursor, sessionId }`

↓

Accepted Repository filters Ready Pool / verified cover

↓

输出：

publicFeedRecord[]

↓

下一层读取：

`routes.js` 渲染卡片

↓

用户点击 detail / favorite / trip

### 9.7 失败策略

- V2 Feed gating fail：fallback legacy-only。
- No V2 ready routes：Feed still returns legacy ready routes。
- Bootstrap stale：API feed remains source after first load。
- Feed must not call Planner to backfill in real time。

### 9.8 Feature Flag

- Flag: `ROUTE_V2_FEED_ENABLED`
- 默认值：`false`

### 9.9 回滚

- 关闭 `ROUTE_V2_FEED_ENABLED`。
- Feed only reads legacy-ready routes。
- V2 accepted routes remain stored but hidden。

### 9.10 影响面

| 系统 | 是否影响 |
|---|---|
| Feed | YES |
| Search | NO |
| Accepted Repository | YES |
| 图片系统 | YES |

## 10. End-to-End Data Flow

### 10.1 Phase 1 Trace-only Flow

输入：

Legacy Planner / materialize input

↓

输出：

Legacy RouteRecord unchanged

↓

旁路输出：

DecisionTrace with Unknown allowed

↓

下一层读取：

Audit / Review only; Feed does not read it

失败：

DecisionTrace 写失败时，legacy Planner 继续；V2 Review 不接受该 route。

### 10.2 Phase 2 Candidate Flow

输入：

RouteIntent

↓

输出：

RouteCandidate[]

↓

下一层读取：

Candidate Pool stores candidates

↓

EvidenceBundle enriches selected/pending candidates

失败：

No candidate -> no accepted route, trace records no-candidate.

### 10.3 Phase 3 Evidence Flow

输入：

RouteCandidate + missing evidence requirements

↓

输出：

EvidenceBundle[]

↓

下一层读取：

Reasoning and Validation

失败：

Provider timeout -> pending-evidence; no Feed impact.

### 10.4 Phase 4/5 Strategy Validation Flow

输入：

Selected RouteCandidate + EvidenceBundle[]

↓

输出：

ValidationResult

↓

下一层读取：

Review

失败：

Validation fail -> rejected/needs-review; not accepted.

### 10.5 Phase 6 Feed-Compatible Flow

输入：

Review accepted V2 RouteRecord + decisionTraceId + validationId + media ready

↓

输出：

Accepted Repository V2 record

↓

下一层读取：

Ready Pool gating

↓

Feed returns V2 only when `ROUTE_V2_FEED_ENABLED=true`

失败：

Flag off or gating fail -> legacy-only Feed.

## 11. Feature Flag Summary

| Layer | Flag | Default |
|---|---|---|
| RouteIntent | `ROUTE_V2_INTENT_ENABLED` | `false` |
| RouteCandidate / Candidate Pool | `ROUTE_V2_CANDIDATE_POOL_ENABLED` | `false` |
| EvidenceBundle | `ROUTE_V2_EVIDENCE_BUNDLE_ENABLED` | `false` |
| DecisionTrace | `ROUTE_V2_TRACE_ENABLED` | `false` |
| Strict Trace Acceptance | `ROUTE_V2_TRACE_REQUIRED_FOR_ACCEPT` | `false` |
| ValidationResult | `ROUTE_V2_VALIDATION_ENABLED` | `false` |
| Review | `ROUTE_V2_REVIEW_ENABLED` | `false` |
| Ready Pool | `ROUTE_V2_READY_POOL_GATING_ENABLED` | `false` |
| Feed | `ROUTE_V2_FEED_ENABLED` | `false` |

## 12. Files Summary

### 12.1 Files expected by frozen Architecture

Prepared future files, not created by this contract:

- `src/lib/routes/decision-trace-schema.mjs`
- `src/lib/routes/decision-trace-store.mjs`
- `src/lib/routes/route-candidate-pool.mjs`
- `src/lib/routes/evidence-bundle-schema.mjs`
- `src/lib/routes/evidence-bundle-store.mjs`

### 12.2 Existing files expected to be modified in future phases

- `src/lib/routes/route-composition-planner.mjs`
- `src/lib/routes/repository-warmup-runner.mjs`
- `src/lib/routes/route-search-service.mjs`
- `src/lib/routes/composition-validator.mjs`
- `src/lib/routes/content-quality.mjs`
- `src/lib/routes/route-design-strategy.mjs`
- `src/lib/routes/evidence-repository.mjs`
- `src/lib/routes/web-search-evidence-provider.mjs`
- `src/lib/routes/web-search-evidence-runner.mjs`
- `src/lib/routes/web-evidence-extractor.mjs`
- `src/lib/routes/live-provider.mjs`
- `src/lib/routes/accepted-repository.mjs`
- `src/lib/routes/discovery.mjs`
- `server.js`
- `routes.js`

### 12.3 Files forbidden in early phases

Phase 1-5 must not modify:

- `.route-v2-cache/accepted-routes.json`
- `route-feed-bootstrap.js`
- Feed rendering behavior in `routes.js`
- Bulk legacy materialized output in `scripts/materialize-route-pool.mjs`

Phase 6/7 may touch Feed/Repository only behind flags and with rollback.

## 13. Implementation Risks

1. Architecture does not define a standalone RouteIntent file. This contract places RouteIntent schema inside `decision-trace-schema.mjs` and Candidate Pool snapshots. If RouteIntent grows, this may become too broad.

2. Architecture does not define a standalone ValidationResult store. This contract stores schema/snapshot through DecisionTrace and Candidate Pool. If Review needs independent querying by validationId, a future design decision is required.

3. Ready Pool is not an explicit storage layer today. Current system infers readiness from accepted repository + media flags. V2 gating can be implemented there, but a separate Ready Pool store remains unresolved.

4. Phase 1 says trace write failure should not block legacy generation, while V2 acceptance later requires trace. Implementation must distinguish legacy continuation from V2 Review eligibility.

5. Search can create intents, but Architecture does not fully define Search V2 -> RouteIntent lifecycle. Contract marks Search impact as YES for intent/candidate/evidence layers, but Feed remains isolated.

6. Tavily/Wikivoyage evidence can be slow or unavailable. If EvidenceBundle is required too early, many candidates may remain pending and no V2 routes will reach Review.

7. Existing `composition-validator.mjs` returns accepted for non-`evidence-composed` records. V2 validation must not accidentally rely on that legacy bypass.

8. Existing `RouteRecord.contentQualityStatus === accepted` is insufficient for V2. Any implementation that treats it as V2 Review accepted would violate the architecture.

9. Feature flag names are defined in this contract for implementation consistency. They were not present in the architecture document; changing them later must update this contract before coding.

10. The project directory is not currently a Git repository in this workspace, so rollback must rely on file backups/feature flags unless implementation happens in a proper repository context.

## 14. Stop Condition

This contract freezes implementation boundaries only. Do not start Phase 1 from this document without explicit user confirmation.
