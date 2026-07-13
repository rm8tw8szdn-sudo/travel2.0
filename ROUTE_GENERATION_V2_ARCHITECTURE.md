# Route Generation V2 Architecture

## 1. 当前系统真实状态

本设计基于当前项目代码和三份只读审计报告：

- `PLANNER_ROUTE_REPOSITORY_AUDIT.md`
- `PLANNER_STRATEGY_CAUSALITY_AUDIT.md`
- `DECISION_TRACE_AUDIT.md`

审计确认的真实状态：

- 当前主路线库是 `.route-v2-cache/accepted-routes.json`，保存 5500 条 raw accepted records；Repository 加载、校验、去重后约 4577 条有效路线。
- Feed API 通过 `server.js` 初始化 `createAcceptedRouteRepository`，默认读取 `.route-v2-cache/accepted-routes.json`；前端首屏还会读取 `route-feed-bootstrap.js` 的 cross/single 快照。
- 当前 Feed 最终可见主要取决于 accepted repository、`feedReady`、`onlineCoverAsset`、图片国家匹配、cursor/random、qualityScore，而不是大多数 Planner strategy 字段。
- 当前大量路线由 `Knowledge Graph Pool -> profile -> template -> RouteRecord` 生成，主要入口是 `scripts/materialize-route-pool.mjs`。
- 当前少量 Planner pipeline 逻辑在 `src/lib/routes/route-composition-planner.mjs` 中，链路为 context -> KG query -> destination pool -> skeleton -> optional LLM refine -> evidence check -> validation -> dedupe -> accepted.
- `plannerReason`、`coverageContribution`、`contentEvidence` 多数是解释或溯源字段，不能证明它们是生成前决策输入。
- `travelStyle`、`durationBand`、国家/目的地、Knowledge Graph、距离/segment rules 是当前能证明真实影响路线结果的输入。
- Budget 当前没有真实实现；Contrast / Non-neighbor 没有可验证的独立策略链路。
- Tavily/Web evidence 当前更像 evidence 补全器；不能证明其普遍决定单条路线生成。
- Wikivoyage 当前主要作为在线路线来源和 facts provider，不能证明其参与大多数 Planner materialized 路线的决策。
- 当前 accepted route 没有保存完整候选池、被淘汰候选、拒绝原因、当次 Tavily/Wikivoyage query，因此系统无法可靠回答“为什么生成这条路线，而不是另一条路线”。

对应代码位置：

- Planner pipeline: `src/lib/routes/route-composition-planner.mjs`
- Strategy registry: `src/lib/routes/route-design-strategy.mjs`
- Concept layer: `src/lib/routes/route-planning-concept.mjs`
- Composition validation: `src/lib/routes/composition-validator.mjs`
- Evidence repository: `src/lib/routes/evidence-repository.mjs`
- Web evidence: `src/lib/routes/web-search-evidence-provider.mjs`, `src/lib/routes/web-search-evidence-runner.mjs`, `src/lib/routes/web-evidence-extractor.mjs`
- Wikivoyage live provider: `src/lib/routes/live-provider.mjs`, `src/lib/routes/online-standardizer.mjs`
- Materialized generation: `scripts/materialize-route-pool.mjs`
- Accepted repository and Feed: `src/lib/routes/accepted-repository.mjs`, `src/lib/routes/discovery.mjs`, `routes.js`, `route-feed-bootstrap.js`, `server.js`

## 2. 为什么需要 V2

V2 的目标不是重写现有系统，而是补上当前系统缺失的“决策证据层”。当前问题不是没有路线，而是无法证明路线为什么成立、为什么击败其它候选、哪些策略真实影响结果。

V2 必须解决：

1. 大量路线主要通过 `Knowledge Graph -> Profile -> Template -> Route` 生成。
2. 策略标签、解释字段和真实决策输入混在 `RouteRecord` 里。
3. Budget、Contrast 等策略没有真实实现。
4. Tavily、Wikivoyage、LLM 对单条路线的真实贡献无法追踪。
5. 当前没有保存完整候选池、淘汰候选和拒绝原因。
6. 标题、简介和 Planner Reason 高度模板化。
7. Planner 策略分布和用户最终在 Feed 中看到的内容脱节。
8. 当前系统无法可靠回答“为什么生成这条路线，而不是另一条路线”。

## 3. V2 目标

- 保留现有 Knowledge Graph、Accepted Repository、Ready Pool、Feed、图片链路。
- 采用渐进迁移，新旧路线并行存在。
- 先记录决策，再改变生成。
- 将 `DecisionTrace` 从 `RouteRecord` 中分离。
- 将策略从“标签”升级为“可验证的决策函数”。
- 将 Tavily/Wikivoyage/LLM 的贡献转化为结构化 `EvidenceBundle`，而不是让它们直接决定路线成立。
- Feed 继续只读取审核通过的 Ready Pool，不直接读实时 Planner 候选。
- 所有新能力必须可验证、可追踪、可回滚。

## 4. 非目标

- 不推倒重写 `accepted-repository`、Feed、图片链路。
- 不把 LLM 变成事实来源。
- 不让 Tavily 直接生成最终路线。
- 不让模板承担路线是否成立的判断。
- 不把旧 `plannerReason` 当作决策证据。
- 不要求一次性迁移 5500 条旧路线。
- 不在 V2 初期改变用户可见 Feed 行为。

## 5. 系统分层

### 5.1 Route Intent / 探索目标层

输入：

- Search intent、coverage matrix、运营补洞目标、Warmup 任务、用户输入、缺口统计。

职责：

- 把“想补什么路线”转成 `RouteIntent`。
- 明确 strategyType、国家/地区、时长、季节、预算、主题、novelty、coverage goal、exclusions。
- 给每次生成分配 intentId。

输出：

- `RouteIntent`

读取数据源：

- Search analytics
- Coverage matrix
- Accepted repository status
- Gold cases
- Manual operator input

禁止承担：

- 不选择最终路线。
- 不生成标题和简介。
- 不调用 Tavily 补事实。
- 不写 Accepted Repository。

现有对应：

- `src/lib/routes/repository-warmup-runner.mjs` 中的 context selection
- Search V1 intent parser
- coverage matrix scripts

V2 变化：

- 将当前 loose context 明确固化为 `RouteIntent`，并保存 intentId。

### 5.2 Candidate Generation / 候选生成层

输入：

- `RouteIntent`
- Knowledge Graph candidates
- Existing accepted route fingerprints

职责：

- 为同一 intent 生成多个 `RouteCandidate`，而不是直接生成一条 RouteRecord。
- 记录完整 candidate pool。
- 记录候选产生原因和初始排序。
- 记录被排除候选的明确原因。

输出：

- `RouteCandidate[]`
- candidate pool snapshot

读取数据源：

- `.route-v2-cache/knowledge-graph-pool.json`
- country catalog
- country topology
- existing repository fingerprints

禁止承担：

- 不写最终标题。
- 不写最终简介。
- 不把策略标签当证据。
- 不调用 LLM 凭空补事实。
- 不直接进入 Feed。

现有对应：

- `route-composition-planner.mjs` 的 `selectDestinationPool`、`buildRouteSkeleton`
- `materialize-route-pool.mjs` 的 `coverageFallbackPlaces`、`contextFor`、`pickCrossDestinations`

V2 变化：

- 不再只保留 winner；必须保存 candidates 和 rejectedCandidates。

### 5.3 Evidence Enrichment / 事实补全层

输入：

- `RouteCandidate`
- missing evidence requests
- evidence requirements by strategy

职责：

- 为候选补事实，不直接决定最终路线。
- Tavily/Web search 只输出结构化 facts。
- Wikivoyage 只输出来源路线、目的地、摘要、季节、主题等 facts。
- Evidence 必须标注 source、confidence、freshness、supportsWhichDecision。

输出：

- `EvidenceBundle[]`

读取数据源：

- Existing `route-evidence.json`
- Tavily through `web-search-evidence-provider`
- Wikivoyage through `live-provider`
- Wikidata through existing resolver

禁止承担：

- 不直接生成 RouteRecord。
- 不把联网成功视为路线成立。
- 不用单一 snippet 证明高风险事实。
- 不覆盖 Candidate Generation 的国家/目的地选择，除非返回给 Reasoning 层重新评估。

现有对应：

- `web-search-evidence-provider.mjs`
- `web-search-evidence-runner.mjs`
- `web-evidence-extractor.mjs`
- `evidence-repository.mjs`
- `live-provider.mjs`

V2 变化：

- 每条 evidence 绑定 candidateId 和 supportsWhichDecision。

### 5.4 Route Reasoning / 路线推理层

输入：

- `RouteIntent`
- `RouteCandidate[]`
- `EvidenceBundle[]`
- existing route diversity state

职责：

- 比较候选。
- 解释为什么选择 winner。
- 解释为什么 reject 其它候选。
- 输出 strategyEffects。
- 允许 LLM 参与比较、组合、解释和结构化，但 LLM 不得凭空补事实。

输出：

- selected candidate
- rejectedCandidates
- `DecisionTrace`

读取数据源：

- Candidate pool
- EvidenceBundle
- accepted repository fingerprints
- quality/diversity state

禁止承担：

- 不调用 Tavily 生成路线。
- 不写最终展示文本。
- 不写 Feed。
- 不把 `plannerReason` 当输入。

现有对应：

- `route-composition-planner.mjs` 的 optional LLM refine、decisionTests、dedupeDistance
- `route-llm-refine-shared.mjs`

V2 变化：

- LLM 输出必须引用 candidateId 和 evidenceId。
- 如果无法证明，必须写 Unknown。

### 5.5 Candidate Pool / 候选路线池

输入：

- Candidate Generation output
- Reasoning output
- validation status

职责：

- 保存候选、selected、rejected、pending evidence、expired。
- 支持同 intent 多候选对照。
- 支持回放和审计。

输出：

- candidate pool state
- review candidates

读取数据源：

- local JSON storage in V1 migration stage
- future DB table

禁止承担：

- 不做最终展示。
- 不做 Feed 排序。
- 不做策略判断。

现有对应：

- `.route-v2-cache/search-review-candidates.json`
- phase2c review candidates

V2 变化：

- 建立独立 `route-candidate-pool` 存储，不混入 `accepted-routes.json`。

### 5.6 Feasibility Validation / 可行性验证层

输入：

- selected `RouteCandidate`
- `EvidenceBundle[]`
- strategy requirements

职责：

- 校验 geography、transport、season、budget、content quality。
- 给出 structured `ValidationResult`。
- 把失败原因写清楚。

输出：

- `ValidationResult`

读取数据源：

- EvidenceBundle
- distance/segment metrics
- existing composition/content validators

禁止承担：

- 不生成候选。
- 不写标题/简介。
- 不用模板文本补证据。

现有对应：

- `composition-validator.mjs`
- `content-quality.mjs`
- `route-design-strategy.mjs`
- `route-composition-planner.mjs` 的 `validatePlannerCandidate`

V2 变化：

- Validator 必须读取 `EvidenceBundle` 和 `DecisionTrace`，而不是只看 RouteRecord 字段。

### 5.7 Quality & Diversity Scoring / 质量与多样性评分层

输入：

- selected candidate
- EvidenceBundle
- ValidationResult
- existing repository distribution
- Feed diversity constraints

职责：

- 计算 qualityScore、noveltyScore、diversityScore、coverageScore。
- 明确每个分数来自哪些证据。
- 防止同国家、同大洲、同天数、同 style、同图片重复。

输出：

- scoring report
- review recommendation

读取数据源：

- accepted repository
- Feed ready state
- image dedupe state
- coverage matrix

禁止承担：

- 不改变事实。
- 不补标题/简介。
- 不把高分当 accepted。

现有对应：

- `accepted-repository.mjs` 的 feedQualityScore / sort key
- existing qualityScore / compositionScore
- feed image dedupe logic

V2 变化：

- 分数不再只是 RouteRecord 上的固定数值；必须能追溯到 scoring factors。

### 5.8 Content Rendering / 内容表达层

输入：

- selected candidate
- DecisionTrace
- EvidenceBundle
- ValidationResult

职责：

- 生成标题、简介、highlights、planner explanation。
- 文案只表达已验证决策，不替代证据。
- 减少模板相似度。

输出：

- final display fields for `RouteRecord`

读取数据源：

- selected route facts
- evidence snippets
- route style rules

禁止承担：

- 不决定路线是否成立。
- 不新增事实。
- 不把 summary 写成证据。

现有对应：

- `buildPlannerRecord`
- `materialize-route-pool.mjs` 的 `makeRoute`
- Search-generated route builder

V2 变化：

- 模板只负责最终表达，不负责决策。

### 5.9 Review / Ready Pool / Feed

输入：

- RouteRecord
- DecisionTrace
- ValidationResult
- media/cover verification

职责：

- Review 只接受证据完整的候选。
- Ready Pool 只接收 review accepted + media ready 的路线。
- Feed 继续只读取 Ready Pool / Accepted Repository。
- Feed 可追踪到 routeId -> decisionTraceId。

输出：

- accepted route
- ready route
- feed card

读取数据源：

- accepted repository
- ready pool
- image verification cache
- decision trace storage

禁止承担：

- 不实时调用 Planner。
- 不用 Feed 表现倒推策略生效。

现有对应：

- `accepted-repository.mjs`
- `discovery.mjs`
- `routes.js`
- `route-feed-bootstrap.js`

V2 变化：

- Feed 兼容旧 RouteRecord，但 V2 路线必须能追踪 DecisionTrace。

## 6. 核心数据对象

### 6.1 RouteIntent

字段设计：

| 字段 | 类型 | 说明 |
|---|---|---|
| intentId | string | 稳定 ID，来自 normalized context hash |
| strategyType | string | Geographic / Duration / Theme / Seasonal / Transport / Budget / Niche / Contrast / AI Inspiration |
| targetRegions | string[] | 目标区域 |
| targetCountries | string[] | 目标国家代码 |
| targetCities | string[] | 可选目标城市 |
| duration | object | days、durationBand、flexibility |
| season | object | monthRange、seasonLabel、hardConstraint |
| theme | object | themeKey、themeLabel、requiredSignals |
| travelStyle | string | concept style |
| transportPreference | string[] | rail / road / ferry / flight / walk |
| budgetConstraint | object | maxCost、currency、costLevel、budgetType |
| noveltyTarget | object | newCountry、undercoveredRegion、avoidPopular |
| coverageGoal | object | countryCoverage、strategyCoverage、feedDiversity |
| exclusions | object | country blacklist、CN block、avoidDuplicateClusters |
| source | string | search / warmup / operator / coverage / review |
| createdAt | string | ISO timestamp |

RouteIntent 是生成前输入，不是展示字段。

### 6.2 RouteCandidate

字段设计：

| 字段 | 类型 | 说明 |
|---|---|---|
| candidateId | string | intentId + candidate hash |
| intentId | string | RouteIntent id |
| countries | string[] | 候选国家 |
| destinations | object[] | 候选目的地，含 wikidataId、name、countryCode、coordinates |
| proposedOrder | string[] | destination ids in order |
| generationSource | string | knowledge-graph / wikivoyage-source / operator-seed / mixed |
| initialReason | string | 生成候选的初始原因 |
| supportingSignals | object[] | 生成前 signals，不是 evidence bundle |
| noveltyScore | number | 相对 repository 的新颖度 |
| distanceSummary | object | span、maxSegment、missingCoordinates |
| strategyHypothesis | string[] | 假设策略，未验证前不得写入 RouteRecord |
| status | string | generated / pending-evidence / rejected / selected / expired |

### 6.3 EvidenceBundle

字段设计：

| 字段 | 类型 | 说明 |
|---|---|---|
| evidenceId | string | stable evidence id |
| candidateId | string | candidate binding |
| sourceType | string | knowledge-graph / tavily / wikivoyage / wikidata / repository |
| sourceUrl | string | web source url |
| sourceId | string | non-url source id |
| extractedFacts | object | structured facts only |
| evidenceCategory | string | transport / season / budget / geography / theme / duration / destination |
| freshness | object | retrievedAt、expiresAt、staleness |
| confidence | number | 0 to 1 |
| supportsWhichDecision | string[] | candidate inclusion、order、season、budget、transport、theme |
| contradicts | string[] | optional conflicting decisions |
| extractionMethod | string | kg-field / web-snippet / page-extract / manual |

### 6.4 DecisionTrace

字段设计：

| 字段 | 类型 | 说明 |
|---|---|---|
| traceId | string | stable trace id |
| routeId | string | present after accepted |
| candidateId | string | selected candidate id |
| intentId | string | RouteIntent id |
| inputContext | object | full RouteIntent snapshot |
| candidatePool | object[] | generated candidates summary |
| selectedCandidate | object | selected candidate and reason |
| rejectedCandidates | object[] | rejected candidate snapshots |
| rejectionReasons | object[] | candidateId, rule, evidenceId, reason |
| decisionFactors | object[] | factor, weight, input, effect |
| strategyEffects | object[] | strategy, changedFields, evidenceIds |
| dataSourcesUsed | object[] | sourceType, ids, usedFor |
| unknowns | object[] | unknown step and why unknown |
| timestamp | string | ISO timestamp |
| version | string | trace schema version |

DecisionTrace 是 V2 的核心审计对象。它不得混在 RouteRecord 展示字段里。

### 6.5 ValidationResult

字段设计：

| 字段 | 类型 | 说明 |
|---|---|---|
| validationId | string | stable id |
| routeId | string | route id after render |
| candidateId | string | candidate id |
| feasibility | object | pass/fail and summary |
| transportEvidence | object | required segments, verified segments, missing |
| seasonalEvidence | object | month fit, source evidence |
| budgetEvidence | object | cost facts, currency, confidence |
| geographicChecks | object | span, segment, region plausibility, exclusions |
| contentChecks | object | title/summary facts, template similarity |
| imageChecks | object | optional link to image verification, not route decision |
| failureReasons | string[] | structured reasons |
| reviewStatus | string | accepted / needs-review / rejected / pending-evidence |

### 6.6 RouteRecord

RouteRecord 是最终展示和 Feed 兼容对象。它继续保留现有字段：

- id
- name / canonicalTitle / sourceTitle
- summary / recommendationText
- countryEntities
- destinationEntities
- countries
- destinations
- durationDays / recommendedDays / bestMonths
- themes / tags / highlights
- coverAsset / onlineCoverAsset / feedReady
- contentQualityStatus / repositoryStatus
- sourceType / destinationSource
- qualityScore

V2 必须新增或保留轻量引用：

- generationVersion: `route-generation-v2`
- intentId
- candidateId
- decisionTraceId
- validationId
- evidenceBundleIds

必须明确：

`RouteRecord` 与 `DecisionTrace` 分离。

RouteRecord 中以下字段不得再承担决策证据职责：

- plannerReason
- designStrategies
- coverageContribution
- contentEvidence.provider
- sourceType
- summary
- recommendationText

这些字段可以用于展示、搜索、兼容旧代码，但不能作为“策略已生效”的证据。

## 7. 数据源职责边界

| 数据源 | 负责什么 | 不负责什么 | 当前代码位置 | V2 中的位置 |
|---|---|---|---|---|
| Knowledge Graph | 提供国家、城市、目的地、坐标、实体关系、候选池基础 | 不负责最终选择，不写标题简介，不证明预算/季节/交通 | `.route-v2-cache/knowledge-graph-pool.json`, `route-composition-planner.mjs`, `materialize-route-pool.mjs` | Candidate Generation, EvidenceBundle sourceType=knowledge-graph |
| Tavily | 按缺失证据查询事实，返回结构化 snippets/facts | 不直接生成路线，不决定 winner，不替代 validation | `web-search-evidence-provider.mjs`, `web-search-evidence-runner.mjs`, `web-evidence-extractor.mjs` | Evidence Enrichment |
| Wikivoyage | 提供 itinerary source、page extract、route facts、目的地线索 | 不为所有 KG 路线背书，不直接进入 Feed，不能替代候选比较 | `live-provider.mjs`, `online-standardizer.mjs` | Evidence Enrichment 或 Candidate source |
| LLM | 比较候选、结构化 reasoning、生成可读解释、辅助改写 | 不凭空补事实，不创建未证实目的地，不绕过 validator | `route-llm-refine-shared.mjs`, `route-composition-planner.mjs` | Route Reasoning, Content Rendering |
| Materialized Profiles | 提供旧链路兼容、seed、coverage bootstrap | 不再负责判断路线成立，不再直接批量写 accepted | `scripts/materialize-route-pool.mjs` | Legacy generator, Candidate seed source |
| Repository / Cache | 保存 accepted、ready、search cache、candidate pool、trace | 不负责生成策略，不负责事实判断 | `accepted-repository.mjs`, `.route-v2-cache/*` | Review / Ready Pool / Trace Storage |

### Tavily 调用条件

允许调用 Tavily：

- Candidate 已生成，但缺少 required evidence。
- Transport strategy 缺少至少一段连接证据。
- Seasonal strategy 缺少月份窗口证据。
- Budget strategy 缺少价格、交通成本、住宿成本或低成本依据。
- Contrast strategy 缺少非邻近组合价值或移动可行性证据。
- Existing evidenceRepository 没有足够 confidence 或 freshness 过期。

不得调用 Tavily：

- 空 query 或没有 candidateId。
- 只为了写更漂亮的简介。
- 已有足够 evidence 且未过期。
- Feed 请求路径中。
- 单次 Search/Planner budget 已耗尽。
- 目标是中国路线，继续遵守 CN block。
- 试图让 Tavily 直接返回最终路线。

Tavily 返回结构化数据：

- sourceUrl
- sourceTitle
- sourceSnippet
- retrievedAt
- extractedFacts
- evidenceCategory
- confidence
- supportsWhichDecision
- diagnostics

进入 EvidenceBundle 的方式：

1. `web-search-evidence-provider` 返回 results。
2. `web-evidence-extractor` 抽取 allowed evidence types。
3. `web-evidence-corroborator` 做交叉验证。
4. 写入 `EvidenceBundle`，并可同步到现有 `evidence-repository` 兼容存储。

Tavily 失败降级：

- 标记 EvidenceBundle request 为 `not_found` 或 `provider_failed`。
- Candidate 状态变成 `pending-evidence` 或 `needs-review`。
- 不得因为 Tavily 失败而伪造事实。
- 如果候选的 required evidence 缺失，不得进入 Ready Pool。

不能再把“联网成功”等同于“路线推理成功”。联网只证明有来源，不证明路线组合成立。

## 8. 各策略真实生效方式

### Geographic

真实输入：

- targetCountries
- targetRegions
- destination coordinates
- segment distances
- region plausibility
- exclusions

参与步骤：

- Candidate Generation
- Feasibility Validation

具体改变：

- 国家组合
- 目的地候选
- proposedOrder
- reject long span or impossible region

需要证据：

- coordinates
- country membership
- segment metrics
- region cluster

验证不是后补标签：

- DecisionTrace 必须记录 Geographic 在候选池生成或过滤中改变了哪些 candidate。

A/B 测试：

- 同一 intent 下开启/关闭 geographic distance limit，比较 rejectedCandidates 和 selectedCandidate。

未生效条件：

- 只是 RouteRecord.designStrategies 写了 Geographic，但候选池/过滤没有任何 geographic factor。

### Duration

真实输入：

- duration.days
- durationBand
- destination count
- travelStyle
- pace

参与步骤：

- Route Intent
- Candidate Generation
- Validation

具体改变：

- 目的地数量
- 国家数量上限
- 推荐天数
- route title days

需要证据：

- duration constraint
- destination count fit
- travel pace reason

验证不是后补标签：

- DecisionTrace 必须说明因 duration 删除了哪些候选。

A/B 测试：

- 同一国家/theme 下 5 天、8 天、12 天分别生成，检查 destination count 和 style 是否变化。

未生效条件：

- 仅标题写了几天，但候选池数量和验证规则没有读取 duration。

### Theme

真实输入：

- theme key
- theme evidence
- destination theme fit
- user intent theme

参与步骤：

- Candidate Generation
- Evidence Enrichment
- Reasoning

具体改变：

- 目的地选择
- 目的地排序
- route value
- content rendering

需要证据：

- theme-fit evidence
- destination level theme match
- source snippets or KG tags

验证不是后补标签：

- Candidate 必须有 theme requirement，EvidenceBundle 必须支持每个核心目的地或至少核心节点。

A/B 测试：

- 同一国家同天数，theme=wine 与 theme=nature 生成候选池应明显不同。

未生效条件：

- themes 只是 `styleLabelZh`，目的地和证据没有变化。

### Seasonal

真实输入：

- season/month range
- destination-season evidence
- climate-window evidence
- hard/soft season flag

参与步骤：

- Route Intent
- Evidence Enrichment
- Validation

具体改变：

- bestMonths
- destination inclusion
- route timing
- rejection for wrong season

需要证据：

- destination-season
- climate-window
- event/phenology evidence if applicable

验证不是后补标签：

- DecisionTrace 必须记录 season filter 对候选的影响。

A/B 测试：

- 同一国家 theme，winter 与 spring 生成候选应不同，且 evidenceBundle 支持月份。

未生效条件：

- 只有 bestMonths 展示，没有影响候选或 validation。

### Transport

真实输入：

- transportPreference
- segment connectivity
- mode-specific evidence
- duration and transfer tolerance

参与步骤：

- Candidate Generation
- Evidence Enrichment
- Validation

具体改变：

- proposedOrder
- segment acceptance
- route type rail/road/ferry
- reject disconnected routes

需要证据：

- transport-connection
- segment-metric
- mode
- durationMinutes or distanceKm

验证不是后补标签：

- 每条 Transport 路线至少保存一段可验证连接 evidenceId。

A/B 测试：

- 同一国家同目的地，rail preference 与 road preference 的 order/segments 应不同。

未生效条件：

- 标题写铁路/公路，但没有 segment evidence。

### Budget

真实输入：

- budgetConstraint
- expected transport cost
- accommodation or daily cost proxy
- season price risk
- low-cost route objective

参与步骤：

- Route Intent
- Evidence Enrichment
- Reasoning
- Validation

具体改变：

- 国家选择
- 目的地选择
- 交通方式
- travel season
- candidate rejection

需要证据：

- cost estimate
- source URL
- currency
- confidence
- freshness

验证不是后补标签：

- Budget route 必须有 budgetEvidence，且至少一个 candidate 因成本被 reject 或降级。

A/B 测试：

- 同一 region 下 budget vs non-budget，检查国家/交通/season 是否变化。

未生效条件：

- 没有 cost evidence 或 Budget 只出现在 title/theme。

### Niche

真实输入：

- noveltyTarget
- undercovered countries
- low Feed frequency
- specific niche theme
- avoid popular clusters

参与步骤：

- Route Intent
- Candidate Generation
- Quality & Diversity Scoring

具体改变：

- 选低覆盖国家/城市
- 降低热门重复组合
- 增加冷门目的地权重

需要证据：

- repository coverage stats
- destination existence
- theme or route value evidence

验证不是后补标签：

- DecisionTrace 必须记录 noveltyTarget 使哪个热门候选被淘汰，哪个冷门候选被保留。

A/B 测试：

- noveltyTarget on/off 比较 country distribution。

未生效条件：

- 只是标题写“小众”，但候选来源和评分未读取 coverage stats。

### Contrast / Non-neighbor

真实输入：

- non-neighbor country pair
- contrast theme
- mobility feasibility
- route value of contrast
- duration enough for jump

参与步骤：

- Route Intent
- Reasoning
- Evidence Enrichment
- Validation

具体改变：

- 允许非邻近国家组合
- 要求解释组合价值
- 要求移动可行性 evidence
- 可能提高 duration requirement

需要证据：

- transport feasibility between regions
- flight or rail/ferry connection
- cultural/nature contrast evidence
- user value reason

验证不是后补标签：

- DecisionTrace 必须说明为什么非邻近组合比邻近组合更优。

A/B 测试：

- 同 intent 下 neighbor-only 与 contrast-enabled 的 selectedCandidate 不同，且 reject/accept reason 可追踪。

未生效条件：

- 多国距离远但没有 contrast value 和 mobility evidence。

### AI Inspiration

真实输入：

- route gaps
- user intent
- candidate pool
- evidence bundles
- gold cases as style examples only

参与步骤：

- Route Reasoning
- Content Rendering

具体改变：

- 候选比较说明
- 结构化 DecisionTrace
- 文案表达

需要证据：

- LLM output references candidateId and evidenceId
- no unsupported facts

验证不是后补标签：

- LLM contribution must be saved as comparison/selection/change set, not merely `sourceType=planner-designed`。

A/B 测试：

- LLM off uses deterministic winner；LLM on can only reorder within evidence-supported candidates. Differences must be logged.

未生效条件：

- 只是 sourceType 写 planner-designed 或 AI Inspiration。

## 9. Review 与 Feed 关系

V2 规则：

- Feed 继续只读取审核通过的 Ready Pool。
- Search-generated 和 candidate pool 不直接进入 Feed。
- `RouteRecord.contentQualityStatus === accepted` 仍不够，必须有 ValidationResult accepted 和 media ready。
- V2 route 进入 Ready Pool 前必须有:
  - decisionTraceId
  - validationId
  - at least one real decision factor
  - required evidence for its strategy
  - media/image verification if user-visible
- 旧路线继续可读，但标记 generationVersion=legacy 或无 generationVersion。
- Feed 可以在后台统计 V2 vs legacy 分布，但不参与实时生成。

## 10. 可观测性和 Decision Trace

必须记录：

- inputContext
- candidatePool
- selectedCandidate
- rejectedCandidates
- rejectionReasons
- decisionFactors
- strategyEffects
- dataSourcesUsed
- unknowns
- timestamp

每条 V2 路线必须能回答：

- 为什么生成这条路线。
- 为什么不是其它候选。
- 哪些输入改变了国家/城市/天数/style/title/summary。
- 哪些字段只是展示。
- 哪些事实来自 KG、Tavily、Wikivoyage、LLM。
- 哪些步骤仍然 Unknown。

Unknown 是合法状态，但必须显式保存。

## 11. 验收标准

通用：

- 每条 V2 route 必须保存至少一个真实决策因素。
- 每个被拒绝候选必须保存拒绝原因。
- 每条 V2 route 必须能从 RouteRecord 追踪到 DecisionTrace。
- 模板文本不能替代决策证据。
- 无法验证的数据必须明确标记 Unknown。
- 同批次路线描述相似率必须低于设定阈值，例如 title template similarity < 60%，summary template similarity < 70%。
- 每个策略必须有独立对照测试。
- Feed 中可追踪到路线来源和决策链。

策略：

- Budget 路线必须保存预算或交通成本依据。
- Seasonal 路线必须有月份适配证据。
- Transport 路线必须至少保存一段可验证交通连接。
- Contrast 路线必须解释非邻近组合价值和移动可行性。
- Theme 路线必须有 theme-fit evidence。
- Niche 路线必须证明 coverage/novelty 影响了候选选择。
- AI Inspiration 必须保存 LLM 对候选比较的结构化输出，且不得包含 unsupported facts。

Feed：

- V2 route 进入 Feed 不得绕过 accepted repository。
- Feed 不实时调用 Planner。
- Ready Pool 能分开统计 legacy 与 V2。
- 回滚后 Feed 能只读 legacy。

## 12. 分阶段迁移计划

### Phase 0：保持现状并冻结旧链路

修改范围：

- 只增加文档和审计标记。
- 建立当前 accepted repository 和 bootstrap 快照备份。

风险：

- 低。用户体验不变。

验收标准：

- 当前 Feed、Search、Detail 不变。
- 记录当前 repositoryVersion、accepted file hash、bootstrap hash。

回滚方式：

- 无需回滚业务逻辑。

是否影响现有 Feed：

- 否。

预计新增文件：

- docs or audit notes only.

禁止修改：

- `accepted-repository.mjs`
- `route-composition-planner.mjs`
- `scripts/materialize-route-pool.mjs`
- `.route-v2-cache/accepted-routes.json`
- `routes.js`

### Phase 1：只增加 DecisionTrace

修改范围：

- 新增 DecisionTrace schema 和 storage。
- Planner/materialize 不改变输出，只额外记录 trace。

风险：

- 中。需要保证 trace 写失败不影响现有生成。

验收标准：

- 同一输入生成的 RouteRecord 不变。
- 每条新生成路线多一条 DecisionTrace。
- Trace 允许 Unknown。

回滚方式：

- 关闭 trace writer feature flag。
- 删除或忽略 trace storage。

是否影响现有 Feed：

- 否。

预计新增文件：

- `src/lib/routes/decision-trace-store.mjs`
- `src/lib/routes/decision-trace-schema.mjs`
- `.route-v2-cache/decision-traces.jsonl`

禁止修改：

- Feed rendering behavior.
- Accepted route data shape required by old UI.

### Phase 2：新增 Candidate Pool

修改范围：

- 新增 candidate pool storage。
- 同 intent 生成多个 candidates。
- 保存 selected/rejected 状态。

风险：

- 中。候选数量可能增加生成时间和存储。

验收标准：

- 每个 V2 intent 至少保存 candidatePool。
- 每个 rejected candidate 有 reason。
- 仍不改变 Feed。

回滚方式：

- 关闭 V2 candidate generation，回到 legacy single-route generation。

是否影响现有 Feed：

- 否。

预计新增文件：

- `src/lib/routes/route-candidate-pool.mjs`
- `.route-v2-cache/route-candidate-pool.jsonl`

禁止修改：

- `.route-v2-cache/accepted-routes.json` bulk rewrite.
- `accepted-repository.mjs` behavior.

### Phase 3：接入 EvidenceBundle

修改范围：

- 新增 EvidenceBundle schema。
- Tavily/Wikivoyage 只写 evidence，不直接生成 route。
- Existing evidenceRepository 可作为兼容后端。

风险：

- 中到高。外部 API 不稳定，证据质量需要严格筛选。

验收标准：

- Tavily failure 不会生成 unsupported route。
- 每个 EvidenceBundle 有 supportsWhichDecision。
- Web evidence diagnostics 可审计。

回滚方式：

- 关闭 web evidence enrichment。
- 使用 KG-only evidence 或 pending-evidence。

是否影响现有 Feed：

- 否。

预计新增文件：

- `src/lib/routes/evidence-bundle-schema.mjs`
- `src/lib/routes/evidence-bundle-store.mjs`

禁止修改：

- Feed API 直接调用 Tavily。
- RouteRecord summary 作为 evidence。

### Phase 4：实现一个独立策略

建议优先选择 Transport，而不是同时实现多个。

原因：

- 当前用户反复关注铁路/公路和图片/路线匹配。
- Transport 可以用 segment evidence 自动验证。
- 比 Seasonal 更容易形成硬性验收：至少一段可验证交通连接。

修改范围：

- Transport strategy reads RouteIntent.transportPreference and EvidenceBundle transport facts。
- DecisionTrace 记录 transport 如何改变 order/reject。

风险：

- 中。交通 evidence 缺口可能导致路线大量 pending。

验收标准：

- 每条 V2 Transport route 至少有一段 transport-connection 或 segment-metric evidence。
- A/B 测试证明 rail/road preference 改变候选或排序。

回滚方式：

- 关闭 V2 Transport feature flag，继续 legacy Transport labels。

是否影响现有 Feed：

- 否，除非手动允许 V2 accepted 进入 Ready Pool。

预计新增文件：

- `src/lib/routes/strategies/transport-v2.md` or future implementation module
- strategy test fixtures

禁止修改：

- Legacy materialized Transport generation in bulk.

### Phase 5：实现 Budget 或 Contrast

建议先做 Budget 的 evidence schema，再做 Contrast。

修改范围：

- Budget: cost evidence requirement, budget validation。
- Contrast: non-neighbor value and mobility feasibility evidence。

风险：

- 高。Budget 数据源和可比口径复杂；Contrast 容易变成无证据拼接。

验收标准：

- Budget route 有 currency/source/freshness/confidence。
- Contrast route 有 mobility evidence 和 contrast value evidence。
- 没有证据不得 accepted。

回滚方式：

- 禁用 Budget/Contrast V2 strategy。
- 保留 candidate pool for audit。

是否影响现有 Feed：

- 否，直到 Review accepted。

预计新增文件：

- budget/contrast evidence fixtures
- validation reports

禁止修改：

- `composition-validator.mjs` 中旧 Budget disabled 行为，除非 V2 validator 已独立上线。

### Phase 6：新旧路线并行

修改范围：

- Accepted repository 支持 legacy/V2 标记。
- Review 分开统计 legacy 和 V2。
- Ready Pool 分开统计 legacy 和 V2。
- Feed 可按 feature flag 混入 V2。

风险：

- 中。Feed 分布可能变化，回滚必须简单。

验收标准：

- V2 route 可进入 accepted，但可通过 flag 从 Feed 排除。
- V2/legacy 分布、点击、图片、质量单独统计。

回滚方式：

- Feed flag 切回 legacy only。
- Repository 不删除 V2，只隐藏。

是否影响现有 Feed：

- 可配置。默认不影响。

预计新增文件：

- feed V2 gating config
- review reports

禁止修改：

- 不得破坏 legacy route read path。

### Phase 7：逐步淘汰旧 materialized 路线

修改范围：

- 按国家/策略/质量逐步替换 materialized routes。
- 低质量模板路线降权或移出 Ready Pool。

风险：

- 高。数量、覆盖、图片、Feed 流畅度都可能受影响。

验收标准：

- 每批替换前后 Feed 可用数量不下降。
- 相同国家覆盖不下降。
- 模板相似度下降。
- V2 route trace 完整。

回滚方式：

- 恢复 legacy ready flag。
- 使用 accepted backup 或 repositoryVersion 回退。

是否影响现有 Feed：

- 是，必须分批灰度。

预计新增文件：

- legacy retirement audit
- batch migration reports

禁止修改：

- 不得直接删除原始 accepted routes；先通过 Ready Pool gating。

## 13. 风险与回滚

最大风险：

1. Trace 存储增长和写入失败影响生成链路。
2. EvidenceBundle 引入外部 API 不稳定，导致生成延迟或 pending 增多。
3. 新旧路线并行时 Feed 分布和图片 ready pool 可能变少。

回滚原则：

- 所有 V2 功能必须 feature flag 化。
- V2 storage 与 `accepted-routes.json` 分离。
- Feed 默认 legacy-first。
- V2 route 进入 Feed 前必须可通过 flag 排除。
- 不直接删除 legacy materialized routes。

## 14. 仍无法确认的问题

- 现有历史运行中每条 materialized route 的完整原始 candidate pool 不存在，无法回填。
- Tavily/Wikivoyage 在历史路线中逐条贡献无法证明，只能从未来 V2 开始记录。
- Budget 的可靠数据源和成本口径还需要产品定义。
- Contrast 的价值判断需要明确产品准则，否则容易退化为“远距离拼接”。
- Ready Pool 是否应该成为独立存储，还是继续从 accepted repository + media flags 推导，需要后续实现前定型。
- 旧 `route-feed-bootstrap.js` 是否应在 V2 并行阶段继续手动生成，还是改为 repository 派生，需要单独评估。
