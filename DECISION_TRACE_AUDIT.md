# Decision Trace Audit

生成时间：2026-07-13T03:37:59.272Z

只读声明：本次只读取当前源码、`.route-v2-cache/accepted-routes.json` 和可追踪的保存字段；没有修改业务代码、没有重新生成路线、没有修改 Planner、Feed、数据库或缓存。本文创建本审计报告文件。

## 1. Planner 真正依赖哪些输入

| 输入 | 决策能力 | 证据 |
|---|---:|---|
| travelStyle/profile | ★★★★★ | 生成前被 buildRouteConcept、materialize profile、KG query/route structure 读取；会改变 style、title、summary、天数推导。 |
| country/destinationEntities | ★★★★★ | 直接决定国家组合、城市/景点、标题首尾、summary 和 route skeleton。 |
| durationBand/durationDays | ★★★★★ | 决定 recommendedDays、concreteDays、标题天数和 duration reason。 |
| Knowledge Graph Pool | ★★★★☆ | Planner/materialize 的目的地候选来源；但部分 coverageFallbackPlace 会引入模板地点。 |
| distance/segment rules | ★★★★☆ | 能过滤路线，影响 accepted；但 rejected alternatives 没逐条保存。 |
| bestMonths/season | ★★☆☆☆ | 可影响 seasonal concept/bestMonths；大量路线只是展示月份，无法证明改变目的地。 |
| designStrategies | ★★☆☆☆ | 某些 style 判定/validator 会读，但大量来自 profile 标签，逐条因果弱。 |
| Tavily/Web evidence | ★☆☆☆☆ | 代码只在 missingSegments 时补证据；当前 accepted route 多数不能证明 Tavily 参与生成。 |
| Wikivoyage | ★☆☆☆☆ | 可作为 evidence/source 系统存在，但本次 sampled route 中无法逐条证明其参与 Planner 生成。 |
| LLM refine | ★☆☆☆☆ | 只有 llmRefine.refined=true 才能证明改变顺序/取舍；多数 materialized routes 不依赖它。 |
| plannerReason | ☆ | 生成后解释，不是生成前输入。 |
| coverageContribution | ☆ | 生成后数量汇总，不是生成前输入。 |
| contentEvidence | ☆ | 主要来源/溯源字段；少量 Feed/前端特判，但不决定路线内容。 |

## 2. 哪些字段只是解释

- plannerReason：生成后解释字段。Search 可能读取文本，但它不是路线生成前输入。
- coverageContribution：生成后统计国家/目的地数量，不决定候选。
- contentEvidence.provider/evidenceHash：溯源和缓存信息，不是目的地选择依据。
- sourceType / AI Inspiration：表示来源或路径，不是独立设计策略。

## 3. 哪些字段是真正决策

- country / countries / countryEntities：决定国家组合，并参与 KG query 或 materialized 候选组织。
- destinationEntities / destinations：决定城市/景点、标题首尾、summary 内容和距离校验。
- travelStyle / profile：决定 concept、routeStructure、styleLabel、title theme 和部分天数。
- durationBand / durationDays：决定推荐天数、标题天数和 duration reason。
- Knowledge Graph Pool：提供目的地候选；没有候选时 Planner pipeline 会 reject。
- distance / routePassesPlannerRules / validator：能过滤掉路线，但当前 accepted 数据没有保存所有 rejected alternatives。

## 4. Planner 每一步真正做了什么

### Materialized Template 链路

Materialized 路线可证明链路：`knowledge-graph-pool.json / country catalog / topology / profile` → `contextFor(destinations, profile)` → `buildRouteConcept` → `routePassesPlannerRules` → `makeRoute title/summary template` → `validateRouteContent` → `accepted-routes.json`。

### Planner Pipeline 链路

Planner Pipeline 可证明链路：`context(country/travelStyle/duration/theme/season)` → `knowledgeGraph.queryDestinations` → `selectDestinationPool` → `buildRouteSkeleton` → 可选 `LLM refine` → `decisionTests/evidenceCheck` → `buildPlannerRecord` → `validatePlannerCandidate` → `dedupe/cluster saturation` → `accepted-routes.json`。

无法证明的步骤：每条 accepted route 没有保存完整生成前候选池、被删除候选国家、所有 rejected alternatives、当次 Tavily/Wikivoyage query、当次 warmup strategy context。对应 trace 中写 Unknown。

## 5. Planner 哪一步最容易产生模板化

最容易模板化的是 Materialized Template 的 `makeRoute`：标题固定读取 `国家 + 天数 + styleLabel + 起点到终点`，简介固定读取 `styleLabel + 前 3 个目的地`。因此即使国家/目的地不同，标题和简介结构也会高度相似。

## 6. Planner 哪一步最限制路线创新

最限制创新的是候选池和过滤层：`knowledge-graph-pool` 的目的地质量、`plausibleCountries` 的 regionGroups、距离阈值、CN block、dedupe/cluster saturation 会强约束国家组合和目的地跨度。accepted 数据没有保存被拒候选，所以无法证明某条路线具体击败了哪些替代方案。

## 7. Planner 当前最大的三个瓶颈

1. accepted route 没有保存 per-route 的生成前 context 和候选池，导致很多“为什么删掉其它国家/城市”只能标 Unknown。
2. materialized 路线占比很高，Decision Trace 大量指向固定 profile/template，而不是独立的旅行意图推理。
3. Tavily/Wikivoyage/LLM refine 在现有 saved route 中缺少逐条证据，无法证明它们普遍改变了最终路线。

## 8. 抽样数量

- Geographic: 匹配 5500 条，本报告输出 20 条 trace
- Theme: 匹配 5448 条，本报告输出 20 条 trace
- Rail/Transport: 匹配 5426 条，本报告输出 20 条 trace
- Duration: 匹配 5500 条，本报告输出 20 条 trace
- Seasonal: 匹配 1095 条，本报告输出 20 条 trace
- AI Inspiration: 匹配 5433 条，本报告输出 20 条 trace
- Niche: 匹配 15 条，本报告输出 15 条 trace
- Budget: 匹配 0 条，本报告输出 0 条 trace（无可审路线）
- Contrast: 匹配 0 条，本报告输出 0 条 trace（无可审路线）

## 9. 逐条 Decision Trace

## Geographic

### Route: 乌拉圭海岸之旅

- Route ID: `wikivoyage-157419`
- 抽样类别: Geographic
- 可证明来源类型: Unknown
- 国家: AR + UY
- 目的地: 布宜诺斯艾利斯 > 科洛尼亚-德尔萨克拉门托 > 埃斯特角城
- travelStyle: Unknown
- durationBand / days: Unknown / 6
- Feed: 无法证明进入当前 Feed ready pool

Decision Trace:

Step1
读取：
- Unknown: route source does not preserve enough pre-generation context.

↓

Step2
过滤：
- Unknown

↓

Step3
候选国家：
- 可证明保存结果：AR + UY
- 生成前完整候选国家池：Unknown（accepted route 未保存被扫描/被删除候选列表）。

↓

Step4
为什么保留这些国家：
- Unknown

↓

Step5
为什么删除其它国家：
- Unknown。当前 accepted route 没有保存 rejected alternatives；只能从代码知道可能原因包括 CN block、region 不合理、距离超限、pool 为空、dedupe 太近、cluster 饱和。

↓

Step6
为什么生成当前标题：
- Unknown

↓

Step7
为什么生成当前主题：
- buildRouteConcept/context.theme/travelStyle 生成主题；themes=海岸旅行。

↓

Step8
为什么生成当前简介：
- Unknown

↓

Step9
为什么进入 Accepted：
- 保存状态：contentQualityStatus=accepted, repositoryStatus=accepted, sourceType=source-original
- 可证明原因：Unknown

↓

Step10
为什么进入 Feed（如果进入）：
- 未进入或无法证明进入 Feed：没有通过当前报告可验证的 feedReady + onlineCoverAsset 国家匹配。

真正改变路线结果的输入：
- Unknown: 无法证明哪些输入改变了路线结果。

最后补上的标签/非决策字段：
- plannerReason：在路线骨架/concept 后写入；不证明它改变了国家、城市或天数。
- coverageContribution：由生成后的 country/destination 数量汇总；不是生成前输入。
- contentEvidence.provider/evidenceHash：主要是来源/缓存/溯源；一般不改变本条路线内容。
- designStrategies：可能参与 concept/validator，但 saved field 本身是输出记录；删除保存字段通常不改变已生成路线。

删除输入后的影响判断：
- Unknown

### Route: 巴林、卡塔尔11天区域深度：巴林历史城区到卡塔尔门户城市

- Route ID: `materialized-1sp46tb-42846`
- 抽样类别: Geographic
- 可证明来源类型: Materialized Template
- 国家: BH + QA
- 目的地: 巴林历史城区 > 巴林自然腹地 > 巴林地方生活区 > 卡塔尔区域风景带 > 卡塔尔文化停留区 > 卡塔尔门户城市
- travelStyle: deep-dive
- durationBand / days: 10-14d / 11
- Feed: 无法证明进入当前 Feed ready pool

Decision Trace:

Step1
读取：
- knowledge-graph-pool.json: destination/country candidates, as proven by provenance.source=knowledge-graph-pool or contentEvidence.materialized
- profile/travelStyle=deep-dive: proven by travelStyle/travelStyleConceptKey/contentEvidence.travelMode
- countryCodes=BH+QA
- destinationEntities=巴林历史城区 > 巴林自然腹地 > 巴林地方生活区 > 卡塔尔区域风景带 > 卡塔尔文化停留区 > 卡塔尔门户城市
- bestMonths=5-9月
- designStrategies=Geographic+Regional+Theme+Transport
- distance calculation / routePassesPlannerRules: proven by materialize-route-pool.mjs, but per-route rejected alternatives are not persisted

↓

Step2
过滤：
- disabledCountries 包含 CN；plausibleCountries 要求国家组合在 regionGroups 中；routePassesPlannerRules 要求 concept validation、距离完整、maxSegment/span 不超限。

↓

Step3
候选国家：
- 可证明保存结果：BH + QA
- 生成前完整候选国家池：Unknown（accepted route 未保存被扫描/被删除候选列表）。

↓

Step4
为什么保留这些国家：
- 因为这些 destinationEntities 的 countryCode 通过 disabledCountries、plausibleCountries、距离与 concept rules；具体竞争候选 Unknown。

↓

Step5
为什么删除其它国家：
- Unknown。当前 accepted route 没有保存 rejected alternatives；只能从代码知道可能原因包括 CN block、region 不合理、距离超限、pool 为空、dedupe 太近、cluster 饱和。

↓

Step6
为什么生成当前标题：
- route title：makeRoute 模板读取 titleCountry + days + styleLabelZh + first/last destination，生成当前标题。

↓

Step7
为什么生成当前主题：
- profile/theme + buildRouteConcept 生成 travelStyle=deep-dive；themes=区域深度。

↓

Step8
为什么生成当前简介：
- route summary：makeRoute 固定模板读取 styleLabelZh 和前 3 个目的地，模板化风险最高。

↓

Step9
为什么进入 Accepted：
- 保存状态：contentQualityStatus=accepted, repositoryStatus=mediaReady, sourceType=planner-designed
- 可证明原因：materialize-route-pool 在 makeRoute 后调用 validateRouteContent(record).accepted 才 addCandidate；accepted repository 已保存本条。

↓

Step10
为什么进入 Feed（如果进入）：
- 未进入或无法证明进入 Feed：没有通过当前报告可验证的 feedReady + onlineCoverAsset 国家匹配。

真正改变路线结果的输入：
- 国家组合：由 destinations 的 countryCode 集合直接决定为 BH+QA；plausibleCountries/CN block 可过滤，但被删国家候选 Unknown。
- 城市/景点：由 knowledge-graph-pool 候选或 coverageFallbackPlaces 形成 destinationEntities=巴林历史城区 > 巴林自然腹地 > 巴林地方生活区 > 卡塔尔区域风景带 > 卡塔尔文化停留区 > 卡塔尔门户城市。
- 天数：由 buildRouteConcept 得到 recommendedDays，再由 concreteDaysFor(hash(profile, destinations, serial)) 固化为 11。
- travelStyle：由 context/profile + buildRouteConcept 决定；保存为 deep-dive。
- route title：makeRoute 模板读取 titleCountry + days + styleLabelZh + first/last destination，生成当前标题。
- route summary：makeRoute 固定模板读取 styleLabelZh 和前 3 个目的地，模板化风险最高。

最后补上的标签/非决策字段：
- plannerReason：在路线骨架/concept 后写入；不证明它改变了国家、城市或天数。
- coverageContribution：由生成后的 country/destination 数量汇总；不是生成前输入。
- contentEvidence.provider/evidenceHash：主要是来源/缓存/溯源；一般不改变本条路线内容。
- designStrategies：来自 profile.strategies，更多是 profile 标签；在部分 concept validation 中被读取，但不能逐条证明改变了候选池。

删除输入后的影响判断：
- 删除 country/destinationEntities：会改变国家组合、标题、summary，或无法生成路线。★★★★★
- 删除 travelStyle/profile：会改变 concept、styleLabel、天数推导、标题主题。★★★★★
- 删除 bestMonths：会改变 bestMonths 展示；是否改变路线主体仅 seasonal/profile 可证明，普通路线无法证明。★★☆☆☆
- 删除 designStrategies：可能影响 buildRouteConcept 对 theme/season/transport 的 style 判定；但大量 profile 中是标签，逐条影响无法完全证明。★★☆☆☆
- 删除 plannerReason/coverageContribution：不会改变已生成路线内容。☆

### Route: 英国、德国5天经典首访：索尔福德到默尔斯

- Route ID: `materialized-6j0wrm-45219`
- 抽样类别: Geographic
- 可证明来源类型: Materialized Template
- 国家: GB + DE
- 目的地: 索尔福德 > 诺里奇 > 默尔斯
- travelStyle: classic-first-trip
- durationBand / days: 4-6d / 5
- Feed: 可证明进入当前 Feed ready pool 的候选

Decision Trace:

Step1
读取：
- knowledge-graph-pool.json: destination/country candidates, as proven by provenance.source=knowledge-graph-pool or contentEvidence.materialized
- profile/travelStyle=classic-first-trip: proven by travelStyle/travelStyleConceptKey/contentEvidence.travelMode
- countryCodes=GB+DE
- destinationEntities=索尔福德 > 诺里奇 > 默尔斯
- bestMonths=4-10月
- designStrategies=Geographic+Theme+Transport
- distance calculation / routePassesPlannerRules: proven by materialize-route-pool.mjs, but per-route rejected alternatives are not persisted

↓

Step2
过滤：
- disabledCountries 包含 CN；plausibleCountries 要求国家组合在 regionGroups 中；routePassesPlannerRules 要求 concept validation、距离完整、maxSegment/span 不超限。

↓

Step3
候选国家：
- 可证明保存结果：GB + DE
- 生成前完整候选国家池：Unknown（accepted route 未保存被扫描/被删除候选列表）。

↓

Step4
为什么保留这些国家：
- 因为这些 destinationEntities 的 countryCode 通过 disabledCountries、plausibleCountries、距离与 concept rules；具体竞争候选 Unknown。

↓

Step5
为什么删除其它国家：
- Unknown。当前 accepted route 没有保存 rejected alternatives；只能从代码知道可能原因包括 CN block、region 不合理、距离超限、pool 为空、dedupe 太近、cluster 饱和。

↓

Step6
为什么生成当前标题：
- route title：makeRoute 模板读取 titleCountry + days + styleLabelZh + first/last destination，生成当前标题。

↓

Step7
为什么生成当前主题：
- profile/theme + buildRouteConcept 生成 travelStyle=classic-first-trip；themes=经典首访。

↓

Step8
为什么生成当前简介：
- route summary：makeRoute 固定模板读取 styleLabelZh 和前 3 个目的地，模板化风险最高。

↓

Step9
为什么进入 Accepted：
- 保存状态：contentQualityStatus=accepted, repositoryStatus=mediaReady, sourceType=planner-designed
- 可证明原因：materialize-route-pool 在 makeRoute 后调用 validateRouteContent(record).accepted 才 addCandidate；accepted repository 已保存本条。

↓

Step10
为什么进入 Feed（如果进入）：
- 进入 Feed 的可证明原因：accepted repository 中存在 feedReady onlineCoverAsset，imageCountryCodes 与路线国家有交集；Feed 还会受当前 cursor/random/quality 排序影响。

真正改变路线结果的输入：
- 国家组合：由 destinations 的 countryCode 集合直接决定为 GB+DE；plausibleCountries/CN block 可过滤，但被删国家候选 Unknown。
- 城市/景点：由 knowledge-graph-pool 候选或 coverageFallbackPlaces 形成 destinationEntities=索尔福德 > 诺里奇 > 默尔斯。
- 天数：由 buildRouteConcept 得到 recommendedDays，再由 concreteDaysFor(hash(profile, destinations, serial)) 固化为 5。
- travelStyle：由 context/profile + buildRouteConcept 决定；保存为 classic-first-trip。
- route title：makeRoute 模板读取 titleCountry + days + styleLabelZh + first/last destination，生成当前标题。
- route summary：makeRoute 固定模板读取 styleLabelZh 和前 3 个目的地，模板化风险最高。

最后补上的标签/非决策字段：
- plannerReason：在路线骨架/concept 后写入；不证明它改变了国家、城市或天数。
- coverageContribution：由生成后的 country/destination 数量汇总；不是生成前输入。
- contentEvidence.provider/evidenceHash：主要是来源/缓存/溯源；一般不改变本条路线内容。
- designStrategies：来自 profile.strategies，更多是 profile 标签；在部分 concept validation 中被读取，但不能逐条证明改变了候选池。

删除输入后的影响判断：
- 删除 country/destinationEntities：会改变国家组合、标题、summary，或无法生成路线。★★★★★
- 删除 travelStyle/profile：会改变 concept、styleLabel、天数推导、标题主题。★★★★★
- 删除 bestMonths：会改变 bestMonths 展示；是否改变路线主体仅 seasonal/profile 可证明，普通路线无法证明。★★☆☆☆
- 删除 designStrategies：可能影响 buildRouteConcept 对 theme/season/transport 的 style 判定；但大量 profile 中是标签，逐条影响无法完全证明。★★☆☆☆
- 删除 plannerReason/coverageContribution：不会改变已生成路线内容。☆

### Route: 摩尔多瓦、乌克兰10天主题游：摩尔多瓦门户城市到乌克兰区域风景带

- Route ID: `materialized-187o1pq-46701`
- 抽样类别: Geographic
- 可证明来源类型: Materialized Template
- 国家: MD + UA
- 目的地: 摩尔多瓦门户城市 > 摩尔多瓦自然腹地 > 摩尔多瓦区域风景带 > 乌克兰门户城市 > 乌克兰自然腹地 > 乌克兰区域风景带
- travelStyle: theme
- durationBand / days: 10-14d / 10
- Feed: 无法证明进入当前 Feed ready pool

Decision Trace:

Step1
读取：
- knowledge-graph-pool.json: destination/country candidates, as proven by provenance.source=knowledge-graph-pool or contentEvidence.materialized
- profile/travelStyle=theme: proven by travelStyle/travelStyleConceptKey/contentEvidence.travelMode
- countryCodes=MD+UA
- destinationEntities=摩尔多瓦门户城市 > 摩尔多瓦自然腹地 > 摩尔多瓦区域风景带 > 乌克兰门户城市 > 乌克兰自然腹地 > 乌克兰区域风景带
- bestMonths=9-11月
- designStrategies=Geographic+Theme+Transport
- distance calculation / routePassesPlannerRules: proven by materialize-route-pool.mjs, but per-route rejected alternatives are not persisted

↓

Step2
过滤：
- disabledCountries 包含 CN；plausibleCountries 要求国家组合在 regionGroups 中；routePassesPlannerRules 要求 concept validation、距离完整、maxSegment/span 不超限。

↓

Step3
候选国家：
- 可证明保存结果：MD + UA
- 生成前完整候选国家池：Unknown（accepted route 未保存被扫描/被删除候选列表）。

↓

Step4
为什么保留这些国家：
- 因为这些 destinationEntities 的 countryCode 通过 disabledCountries、plausibleCountries、距离与 concept rules；具体竞争候选 Unknown。

↓

Step5
为什么删除其它国家：
- Unknown。当前 accepted route 没有保存 rejected alternatives；只能从代码知道可能原因包括 CN block、region 不合理、距离超限、pool 为空、dedupe 太近、cluster 饱和。

↓

Step6
为什么生成当前标题：
- route title：makeRoute 模板读取 titleCountry + days + styleLabelZh + first/last destination，生成当前标题。

↓

Step7
为什么生成当前主题：
- profile/theme + buildRouteConcept 生成 travelStyle=theme；themes=主题游。

↓

Step8
为什么生成当前简介：
- route summary：makeRoute 固定模板读取 styleLabelZh 和前 3 个目的地，模板化风险最高。

↓

Step9
为什么进入 Accepted：
- 保存状态：contentQualityStatus=accepted, repositoryStatus=mediaReady, sourceType=planner-designed
- 可证明原因：materialize-route-pool 在 makeRoute 后调用 validateRouteContent(record).accepted 才 addCandidate；accepted repository 已保存本条。

↓

Step10
为什么进入 Feed（如果进入）：
- 未进入或无法证明进入 Feed：没有通过当前报告可验证的 feedReady + onlineCoverAsset 国家匹配。

真正改变路线结果的输入：
- 国家组合：由 destinations 的 countryCode 集合直接决定为 MD+UA；plausibleCountries/CN block 可过滤，但被删国家候选 Unknown。
- 城市/景点：由 knowledge-graph-pool 候选或 coverageFallbackPlaces 形成 destinationEntities=摩尔多瓦门户城市 > 摩尔多瓦自然腹地 > 摩尔多瓦区域风景带 > 乌克兰门户城市 > 乌克兰自然腹地 > 乌克兰区域风景带。
- 天数：由 buildRouteConcept 得到 recommendedDays，再由 concreteDaysFor(hash(profile, destinations, serial)) 固化为 10。
- travelStyle：由 context/profile + buildRouteConcept 决定；保存为 theme。
- route title：makeRoute 模板读取 titleCountry + days + styleLabelZh + first/last destination，生成当前标题。
- route summary：makeRoute 固定模板读取 styleLabelZh 和前 3 个目的地，模板化风险最高。

最后补上的标签/非决策字段：
- plannerReason：在路线骨架/concept 后写入；不证明它改变了国家、城市或天数。
- coverageContribution：由生成后的 country/destination 数量汇总；不是生成前输入。
- contentEvidence.provider/evidenceHash：主要是来源/缓存/溯源；一般不改变本条路线内容。
- designStrategies：来自 profile.strategies，更多是 profile 标签；在部分 concept validation 中被读取，但不能逐条证明改变了候选池。

删除输入后的影响判断：
- 删除 country/destinationEntities：会改变国家组合、标题、summary，或无法生成路线。★★★★★
- 删除 travelStyle/profile：会改变 concept、styleLabel、天数推导、标题主题。★★★★★
- 删除 bestMonths：会改变 bestMonths 展示；是否改变路线主体仅 seasonal/profile 可证明，普通路线无法证明。★★☆☆☆
- 删除 designStrategies：可能影响 buildRouteConcept 对 theme/season/transport 的 style 判定；但大量 profile 中是标签，逐条影响无法完全证明。★★☆☆☆
- 删除 plannerReason/coverageContribution：不会改变已生成路线内容。☆

### Route: 泰国5天主题游：泰国门户城市到泰国自然腹地

- Route ID: `materialized-1couwo1-47181`
- 抽样类别: Geographic
- 可证明来源类型: Materialized Template
- 国家: TH
- 目的地: 泰国门户城市 > 泰国历史城区 > 泰国自然腹地
- travelStyle: theme
- durationBand / days: 4-6d / 5
- Feed: 无法证明进入当前 Feed ready pool

Decision Trace:

Step1
读取：
- knowledge-graph-pool.json: destination/country candidates, as proven by provenance.source=knowledge-graph-pool or contentEvidence.materialized
- profile/travelStyle=theme: proven by travelStyle/travelStyleConceptKey/contentEvidence.travelMode
- countryCodes=TH
- destinationEntities=泰国门户城市 > 泰国历史城区 > 泰国自然腹地
- bestMonths=9-11月
- designStrategies=Geographic+Theme+Transport
- distance calculation / routePassesPlannerRules: proven by materialize-route-pool.mjs, but per-route rejected alternatives are not persisted

↓

Step2
过滤：
- disabledCountries 包含 CN；plausibleCountries 要求国家组合在 regionGroups 中；routePassesPlannerRules 要求 concept validation、距离完整、maxSegment/span 不超限。

↓

Step3
候选国家：
- 可证明保存结果：TH
- 生成前完整候选国家池：Unknown（accepted route 未保存被扫描/被删除候选列表）。

↓

Step4
为什么保留这些国家：
- 因为这些 destinationEntities 的 countryCode 通过 disabledCountries、plausibleCountries、距离与 concept rules；具体竞争候选 Unknown。

↓

Step5
为什么删除其它国家：
- Unknown。当前 accepted route 没有保存 rejected alternatives；只能从代码知道可能原因包括 CN block、region 不合理、距离超限、pool 为空、dedupe 太近、cluster 饱和。

↓

Step6
为什么生成当前标题：
- route title：makeRoute 模板读取 titleCountry + days + styleLabelZh + first/last destination，生成当前标题。

↓

Step7
为什么生成当前主题：
- profile/theme + buildRouteConcept 生成 travelStyle=theme；themes=主题游。

↓

Step8
为什么生成当前简介：
- route summary：makeRoute 固定模板读取 styleLabelZh 和前 3 个目的地，模板化风险最高。

↓

Step9
为什么进入 Accepted：
- 保存状态：contentQualityStatus=accepted, repositoryStatus=mediaReady, sourceType=planner-designed
- 可证明原因：materialize-route-pool 在 makeRoute 后调用 validateRouteContent(record).accepted 才 addCandidate；accepted repository 已保存本条。

↓

Step10
为什么进入 Feed（如果进入）：
- 未进入或无法证明进入 Feed：没有通过当前报告可验证的 feedReady + onlineCoverAsset 国家匹配。

真正改变路线结果的输入：
- 国家组合：由 destinations 的 countryCode 集合直接决定为 TH；plausibleCountries/CN block 可过滤，但被删国家候选 Unknown。
- 城市/景点：由 knowledge-graph-pool 候选或 coverageFallbackPlaces 形成 destinationEntities=泰国门户城市 > 泰国历史城区 > 泰国自然腹地。
- 天数：由 buildRouteConcept 得到 recommendedDays，再由 concreteDaysFor(hash(profile, destinations, serial)) 固化为 5。
- travelStyle：由 context/profile + buildRouteConcept 决定；保存为 theme。
- route title：makeRoute 模板读取 titleCountry + days + styleLabelZh + first/last destination，生成当前标题。
- route summary：makeRoute 固定模板读取 styleLabelZh 和前 3 个目的地，模板化风险最高。

最后补上的标签/非决策字段：
- plannerReason：在路线骨架/concept 后写入；不证明它改变了国家、城市或天数。
- coverageContribution：由生成后的 country/destination 数量汇总；不是生成前输入。
- contentEvidence.provider/evidenceHash：主要是来源/缓存/溯源；一般不改变本条路线内容。
- designStrategies：来自 profile.strategies，更多是 profile 标签；在部分 concept validation 中被读取，但不能逐条证明改变了候选池。

删除输入后的影响判断：
- 删除 country/destinationEntities：会改变国家组合、标题、summary，或无法生成路线。★★★★★
- 删除 travelStyle/profile：会改变 concept、styleLabel、天数推导、标题主题。★★★★★
- 删除 bestMonths：会改变 bestMonths 展示；是否改变路线主体仅 seasonal/profile 可证明，普通路线无法证明。★★☆☆☆
- 删除 designStrategies：可能影响 buildRouteConcept 对 theme/season/transport 的 style 判定；但大量 profile 中是标签，逐条影响无法完全证明。★★☆☆☆
- 删除 plannerReason/coverageContribution：不会改变已生成路线内容。☆

### Route: 阿尔及利亚5天经典首访：阿尔及利亚自然腹地到阿尔及利亚区域风景带

- Route ID: `materialized-furdxb-47469`
- 抽样类别: Geographic
- 可证明来源类型: Materialized Template
- 国家: DZ
- 目的地: 阿尔及利亚自然腹地 > 阿尔及利亚地方生活区 > 阿尔及利亚区域风景带
- travelStyle: classic-first-trip
- durationBand / days: 4-6d / 5
- Feed: 无法证明进入当前 Feed ready pool

Decision Trace:

Step1
读取：
- knowledge-graph-pool.json: destination/country candidates, as proven by provenance.source=knowledge-graph-pool or contentEvidence.materialized
- profile/travelStyle=classic-first-trip: proven by travelStyle/travelStyleConceptKey/contentEvidence.travelMode
- countryCodes=DZ
- destinationEntities=阿尔及利亚自然腹地 > 阿尔及利亚地方生活区 > 阿尔及利亚区域风景带
- bestMonths=4-10月
- designStrategies=Geographic+Theme+Transport
- distance calculation / routePassesPlannerRules: proven by materialize-route-pool.mjs, but per-route rejected alternatives are not persisted

↓

Step2
过滤：
- disabledCountries 包含 CN；plausibleCountries 要求国家组合在 regionGroups 中；routePassesPlannerRules 要求 concept validation、距离完整、maxSegment/span 不超限。

↓

Step3
候选国家：
- 可证明保存结果：DZ
- 生成前完整候选国家池：Unknown（accepted route 未保存被扫描/被删除候选列表）。

↓

Step4
为什么保留这些国家：
- 因为这些 destinationEntities 的 countryCode 通过 disabledCountries、plausibleCountries、距离与 concept rules；具体竞争候选 Unknown。

↓

Step5
为什么删除其它国家：
- Unknown。当前 accepted route 没有保存 rejected alternatives；只能从代码知道可能原因包括 CN block、region 不合理、距离超限、pool 为空、dedupe 太近、cluster 饱和。

↓

Step6
为什么生成当前标题：
- route title：makeRoute 模板读取 titleCountry + days + styleLabelZh + first/last destination，生成当前标题。

↓

Step7
为什么生成当前主题：
- profile/theme + buildRouteConcept 生成 travelStyle=classic-first-trip；themes=经典首访。

↓

Step8
为什么生成当前简介：
- route summary：makeRoute 固定模板读取 styleLabelZh 和前 3 个目的地，模板化风险最高。

↓

Step9
为什么进入 Accepted：
- 保存状态：contentQualityStatus=accepted, repositoryStatus=mediaReady, sourceType=planner-designed
- 可证明原因：materialize-route-pool 在 makeRoute 后调用 validateRouteContent(record).accepted 才 addCandidate；accepted repository 已保存本条。

↓

Step10
为什么进入 Feed（如果进入）：
- 未进入或无法证明进入 Feed：没有通过当前报告可验证的 feedReady + onlineCoverAsset 国家匹配。

真正改变路线结果的输入：
- 国家组合：由 destinations 的 countryCode 集合直接决定为 DZ；plausibleCountries/CN block 可过滤，但被删国家候选 Unknown。
- 城市/景点：由 knowledge-graph-pool 候选或 coverageFallbackPlaces 形成 destinationEntities=阿尔及利亚自然腹地 > 阿尔及利亚地方生活区 > 阿尔及利亚区域风景带。
- 天数：由 buildRouteConcept 得到 recommendedDays，再由 concreteDaysFor(hash(profile, destinations, serial)) 固化为 5。
- travelStyle：由 context/profile + buildRouteConcept 决定；保存为 classic-first-trip。
- route title：makeRoute 模板读取 titleCountry + days + styleLabelZh + first/last destination，生成当前标题。
- route summary：makeRoute 固定模板读取 styleLabelZh 和前 3 个目的地，模板化风险最高。

最后补上的标签/非决策字段：
- plannerReason：在路线骨架/concept 后写入；不证明它改变了国家、城市或天数。
- coverageContribution：由生成后的 country/destination 数量汇总；不是生成前输入。
- contentEvidence.provider/evidenceHash：主要是来源/缓存/溯源；一般不改变本条路线内容。
- designStrategies：来自 profile.strategies，更多是 profile 标签；在部分 concept validation 中被读取，但不能逐条证明改变了候选池。

删除输入后的影响判断：
- 删除 country/destinationEntities：会改变国家组合、标题、summary，或无法生成路线。★★★★★
- 删除 travelStyle/profile：会改变 concept、styleLabel、天数推导、标题主题。★★★★★
- 删除 bestMonths：会改变 bestMonths 展示；是否改变路线主体仅 seasonal/profile 可证明，普通路线无法证明。★★☆☆☆
- 删除 designStrategies：可能影响 buildRouteConcept 对 theme/season/transport 的 style 判定；但大量 profile 中是标签，逐条影响无法完全证明。★★☆☆☆
- 删除 plannerReason/coverageContribution：不会改变已生成路线内容。☆

### Route: 菲律宾5天主题游：菲律宾地方生活区到菲律宾文化停留区

- Route ID: `materialized-nnfkdk-47769`
- 抽样类别: Geographic
- 可证明来源类型: Materialized Template
- 国家: PH
- 目的地: 菲律宾地方生活区 > 菲律宾区域风景带 > 菲律宾文化停留区
- travelStyle: theme
- durationBand / days: 4-6d / 5
- Feed: 无法证明进入当前 Feed ready pool

Decision Trace:

Step1
读取：
- knowledge-graph-pool.json: destination/country candidates, as proven by provenance.source=knowledge-graph-pool or contentEvidence.materialized
- profile/travelStyle=theme: proven by travelStyle/travelStyleConceptKey/contentEvidence.travelMode
- countryCodes=PH
- destinationEntities=菲律宾地方生活区 > 菲律宾区域风景带 > 菲律宾文化停留区
- bestMonths=9-11月
- designStrategies=Geographic+Theme+Transport
- distance calculation / routePassesPlannerRules: proven by materialize-route-pool.mjs, but per-route rejected alternatives are not persisted

↓

Step2
过滤：
- disabledCountries 包含 CN；plausibleCountries 要求国家组合在 regionGroups 中；routePassesPlannerRules 要求 concept validation、距离完整、maxSegment/span 不超限。

↓

Step3
候选国家：
- 可证明保存结果：PH
- 生成前完整候选国家池：Unknown（accepted route 未保存被扫描/被删除候选列表）。

↓

Step4
为什么保留这些国家：
- 因为这些 destinationEntities 的 countryCode 通过 disabledCountries、plausibleCountries、距离与 concept rules；具体竞争候选 Unknown。

↓

Step5
为什么删除其它国家：
- Unknown。当前 accepted route 没有保存 rejected alternatives；只能从代码知道可能原因包括 CN block、region 不合理、距离超限、pool 为空、dedupe 太近、cluster 饱和。

↓

Step6
为什么生成当前标题：
- route title：makeRoute 模板读取 titleCountry + days + styleLabelZh + first/last destination，生成当前标题。

↓

Step7
为什么生成当前主题：
- profile/theme + buildRouteConcept 生成 travelStyle=theme；themes=主题游。

↓

Step8
为什么生成当前简介：
- route summary：makeRoute 固定模板读取 styleLabelZh 和前 3 个目的地，模板化风险最高。

↓

Step9
为什么进入 Accepted：
- 保存状态：contentQualityStatus=accepted, repositoryStatus=mediaReady, sourceType=planner-designed
- 可证明原因：materialize-route-pool 在 makeRoute 后调用 validateRouteContent(record).accepted 才 addCandidate；accepted repository 已保存本条。

↓

Step10
为什么进入 Feed（如果进入）：
- 未进入或无法证明进入 Feed：没有通过当前报告可验证的 feedReady + onlineCoverAsset 国家匹配。

真正改变路线结果的输入：
- 国家组合：由 destinations 的 countryCode 集合直接决定为 PH；plausibleCountries/CN block 可过滤，但被删国家候选 Unknown。
- 城市/景点：由 knowledge-graph-pool 候选或 coverageFallbackPlaces 形成 destinationEntities=菲律宾地方生活区 > 菲律宾区域风景带 > 菲律宾文化停留区。
- 天数：由 buildRouteConcept 得到 recommendedDays，再由 concreteDaysFor(hash(profile, destinations, serial)) 固化为 5。
- travelStyle：由 context/profile + buildRouteConcept 决定；保存为 theme。
- route title：makeRoute 模板读取 titleCountry + days + styleLabelZh + first/last destination，生成当前标题。
- route summary：makeRoute 固定模板读取 styleLabelZh 和前 3 个目的地，模板化风险最高。

最后补上的标签/非决策字段：
- plannerReason：在路线骨架/concept 后写入；不证明它改变了国家、城市或天数。
- coverageContribution：由生成后的 country/destination 数量汇总；不是生成前输入。
- contentEvidence.provider/evidenceHash：主要是来源/缓存/溯源；一般不改变本条路线内容。
- designStrategies：来自 profile.strategies，更多是 profile 标签；在部分 concept validation 中被读取，但不能逐条证明改变了候选池。

删除输入后的影响判断：
- 删除 country/destinationEntities：会改变国家组合、标题、summary，或无法生成路线。★★★★★
- 删除 travelStyle/profile：会改变 concept、styleLabel、天数推导、标题主题。★★★★★
- 删除 bestMonths：会改变 bestMonths 展示；是否改变路线主体仅 seasonal/profile 可证明，普通路线无法证明。★★☆☆☆
- 删除 designStrategies：可能影响 buildRouteConcept 对 theme/season/transport 的 style 判定；但大量 profile 中是标签，逐条影响无法完全证明。★★☆☆☆
- 删除 plannerReason/coverageContribution：不会改变已生成路线内容。☆

### Route: 巴林5天铁路旅程：巴林文化停留区到巴林历史城区

- Route ID: `materialized-10ngijw-48081`
- 抽样类别: Geographic
- 可证明来源类型: Materialized Template
- 国家: BH
- 目的地: 巴林文化停留区 > 巴林门户城市 > 巴林历史城区
- travelStyle: rail-journey
- durationBand / days: 4-6d / 5
- Feed: 无法证明进入当前 Feed ready pool

Decision Trace:

Step1
读取：
- knowledge-graph-pool.json: destination/country candidates, as proven by provenance.source=knowledge-graph-pool or contentEvidence.materialized
- profile/travelStyle=rail-journey: proven by travelStyle/travelStyleConceptKey/contentEvidence.travelMode
- countryCodes=BH
- destinationEntities=巴林文化停留区 > 巴林门户城市 > 巴林历史城区
- bestMonths=4-10月
- designStrategies=Geographic+Transport+Theme
- distance calculation / routePassesPlannerRules: proven by materialize-route-pool.mjs, but per-route rejected alternatives are not persisted

↓

Step2
过滤：
- disabledCountries 包含 CN；plausibleCountries 要求国家组合在 regionGroups 中；routePassesPlannerRules 要求 concept validation、距离完整、maxSegment/span 不超限。

↓

Step3
候选国家：
- 可证明保存结果：BH
- 生成前完整候选国家池：Unknown（accepted route 未保存被扫描/被删除候选列表）。

↓

Step4
为什么保留这些国家：
- 因为这些 destinationEntities 的 countryCode 通过 disabledCountries、plausibleCountries、距离与 concept rules；具体竞争候选 Unknown。

↓

Step5
为什么删除其它国家：
- Unknown。当前 accepted route 没有保存 rejected alternatives；只能从代码知道可能原因包括 CN block、region 不合理、距离超限、pool 为空、dedupe 太近、cluster 饱和。

↓

Step6
为什么生成当前标题：
- route title：makeRoute 模板读取 titleCountry + days + styleLabelZh + first/last destination，生成当前标题。

↓

Step7
为什么生成当前主题：
- profile/theme + buildRouteConcept 生成 travelStyle=rail-journey；themes=铁路旅程。

↓

Step8
为什么生成当前简介：
- route summary：makeRoute 固定模板读取 styleLabelZh 和前 3 个目的地，模板化风险最高。

↓

Step9
为什么进入 Accepted：
- 保存状态：contentQualityStatus=accepted, repositoryStatus=mediaReady, sourceType=planner-designed
- 可证明原因：materialize-route-pool 在 makeRoute 后调用 validateRouteContent(record).accepted 才 addCandidate；accepted repository 已保存本条。

↓

Step10
为什么进入 Feed（如果进入）：
- 未进入或无法证明进入 Feed：没有通过当前报告可验证的 feedReady + onlineCoverAsset 国家匹配。

真正改变路线结果的输入：
- 国家组合：由 destinations 的 countryCode 集合直接决定为 BH；plausibleCountries/CN block 可过滤，但被删国家候选 Unknown。
- 城市/景点：由 knowledge-graph-pool 候选或 coverageFallbackPlaces 形成 destinationEntities=巴林文化停留区 > 巴林门户城市 > 巴林历史城区。
- 天数：由 buildRouteConcept 得到 recommendedDays，再由 concreteDaysFor(hash(profile, destinations, serial)) 固化为 5。
- travelStyle：由 context/profile + buildRouteConcept 决定；保存为 rail-journey。
- route title：makeRoute 模板读取 titleCountry + days + styleLabelZh + first/last destination，生成当前标题。
- route summary：makeRoute 固定模板读取 styleLabelZh 和前 3 个目的地，模板化风险最高。

最后补上的标签/非决策字段：
- plannerReason：在路线骨架/concept 后写入；不证明它改变了国家、城市或天数。
- coverageContribution：由生成后的 country/destination 数量汇总；不是生成前输入。
- contentEvidence.provider/evidenceHash：主要是来源/缓存/溯源；一般不改变本条路线内容。
- designStrategies：来自 profile.strategies，更多是 profile 标签；在部分 concept validation 中被读取，但不能逐条证明改变了候选池。

删除输入后的影响判断：
- 删除 country/destinationEntities：会改变国家组合、标题、summary，或无法生成路线。★★★★★
- 删除 travelStyle/profile：会改变 concept、styleLabel、天数推导、标题主题。★★★★★
- 删除 bestMonths：会改变 bestMonths 展示；是否改变路线主体仅 seasonal/profile 可证明，普通路线无法证明。★★☆☆☆
- 删除 designStrategies：可能影响 buildRouteConcept 对 theme/season/transport 的 style 判定；但大量 profile 中是标签，逐条影响无法完全证明。★★☆☆☆
- 删除 plannerReason/coverageContribution：不会改变已生成路线内容。☆

### Route: 马达加斯加5天经典首访：马达加斯加门户城市到马达加斯加区域风景带

- Route ID: `materialized-6o0p7z-48376`
- 抽样类别: Geographic
- 可证明来源类型: Materialized Template
- 国家: MG
- 目的地: 马达加斯加门户城市 > 马达加斯加自然腹地 > 马达加斯加区域风景带
- travelStyle: classic-first-trip
- durationBand / days: 4-6d / 5
- Feed: 无法证明进入当前 Feed ready pool

Decision Trace:

Step1
读取：
- knowledge-graph-pool.json: destination/country candidates, as proven by provenance.source=knowledge-graph-pool or contentEvidence.materialized
- profile/travelStyle=classic-first-trip: proven by travelStyle/travelStyleConceptKey/contentEvidence.travelMode
- countryCodes=MG
- destinationEntities=马达加斯加门户城市 > 马达加斯加自然腹地 > 马达加斯加区域风景带
- bestMonths=3-5月
- designStrategies=Geographic+Season+Theme+Transport
- distance calculation / routePassesPlannerRules: proven by materialize-route-pool.mjs, but per-route rejected alternatives are not persisted

↓

Step2
过滤：
- disabledCountries 包含 CN；plausibleCountries 要求国家组合在 regionGroups 中；routePassesPlannerRules 要求 concept validation、距离完整、maxSegment/span 不超限。

↓

Step3
候选国家：
- 可证明保存结果：MG
- 生成前完整候选国家池：Unknown（accepted route 未保存被扫描/被删除候选列表）。

↓

Step4
为什么保留这些国家：
- 因为这些 destinationEntities 的 countryCode 通过 disabledCountries、plausibleCountries、距离与 concept rules；具体竞争候选 Unknown。

↓

Step5
为什么删除其它国家：
- Unknown。当前 accepted route 没有保存 rejected alternatives；只能从代码知道可能原因包括 CN block、region 不合理、距离超限、pool 为空、dedupe 太近、cluster 饱和。

↓

Step6
为什么生成当前标题：
- route title：makeRoute 模板读取 titleCountry + days + styleLabelZh + first/last destination，生成当前标题。

↓

Step7
为什么生成当前主题：
- profile/theme + buildRouteConcept 生成 travelStyle=classic-first-trip；themes=经典首访。

↓

Step8
为什么生成当前简介：
- route summary：makeRoute 固定模板读取 styleLabelZh 和前 3 个目的地，模板化风险最高。

↓

Step9
为什么进入 Accepted：
- 保存状态：contentQualityStatus=accepted, repositoryStatus=mediaReady, sourceType=planner-designed
- 可证明原因：materialize-route-pool 在 makeRoute 后调用 validateRouteContent(record).accepted 才 addCandidate；accepted repository 已保存本条。

↓

Step10
为什么进入 Feed（如果进入）：
- 未进入或无法证明进入 Feed：没有通过当前报告可验证的 feedReady + onlineCoverAsset 国家匹配。

真正改变路线结果的输入：
- 国家组合：由 destinations 的 countryCode 集合直接决定为 MG；plausibleCountries/CN block 可过滤，但被删国家候选 Unknown。
- 城市/景点：由 knowledge-graph-pool 候选或 coverageFallbackPlaces 形成 destinationEntities=马达加斯加门户城市 > 马达加斯加自然腹地 > 马达加斯加区域风景带。
- 天数：由 buildRouteConcept 得到 recommendedDays，再由 concreteDaysFor(hash(profile, destinations, serial)) 固化为 5。
- travelStyle：由 context/profile + buildRouteConcept 决定；保存为 classic-first-trip。
- route title：makeRoute 模板读取 titleCountry + days + styleLabelZh + first/last destination，生成当前标题。
- route summary：makeRoute 固定模板读取 styleLabelZh 和前 3 个目的地，模板化风险最高。

最后补上的标签/非决策字段：
- plannerReason：在路线骨架/concept 后写入；不证明它改变了国家、城市或天数。
- coverageContribution：由生成后的 country/destination 数量汇总；不是生成前输入。
- contentEvidence.provider/evidenceHash：主要是来源/缓存/溯源；一般不改变本条路线内容。
- designStrategies：来自 profile.strategies，更多是 profile 标签；在部分 concept validation 中被读取，但不能逐条证明改变了候选池。

删除输入后的影响判断：
- 删除 country/destinationEntities：会改变国家组合、标题、summary，或无法生成路线。★★★★★
- 删除 travelStyle/profile：会改变 concept、styleLabel、天数推导、标题主题。★★★★★
- 删除 bestMonths：会改变 bestMonths 展示；是否改变路线主体仅 seasonal/profile 可证明，普通路线无法证明。★★☆☆☆
- 删除 designStrategies：可能影响 buildRouteConcept 对 theme/season/transport 的 style 判定；但大量 profile 中是标签，逐条影响无法完全证明。★★☆☆☆
- 删除 plannerReason/coverageContribution：不会改变已生成路线内容。☆

### Route: 捷克5天公路自驾：伊赫拉瓦到拉贝河畔乌斯季

- Route ID: `materialized-16mrpap-48656`
- 抽样类别: Geographic
- 可证明来源类型: Materialized Template
- 国家: CZ
- 目的地: 伊赫拉瓦 > 奥帕瓦 > 拉贝河畔乌斯季
- travelStyle: road-trip
- durationBand / days: 4-6d / 5
- Feed: 无法证明进入当前 Feed ready pool

Decision Trace:

Step1
读取：
- knowledge-graph-pool.json: destination/country candidates, as proven by provenance.source=knowledge-graph-pool or contentEvidence.materialized
- profile/travelStyle=road-trip: proven by travelStyle/travelStyleConceptKey/contentEvidence.travelMode
- countryCodes=CZ
- destinationEntities=伊赫拉瓦 > 奥帕瓦 > 拉贝河畔乌斯季
- bestMonths=5-9月
- designStrategies=Geographic+Transport+Theme
- distance calculation / routePassesPlannerRules: proven by materialize-route-pool.mjs, but per-route rejected alternatives are not persisted

↓

Step2
过滤：
- disabledCountries 包含 CN；plausibleCountries 要求国家组合在 regionGroups 中；routePassesPlannerRules 要求 concept validation、距离完整、maxSegment/span 不超限。

↓

Step3
候选国家：
- 可证明保存结果：CZ
- 生成前完整候选国家池：Unknown（accepted route 未保存被扫描/被删除候选列表）。

↓

Step4
为什么保留这些国家：
- 因为这些 destinationEntities 的 countryCode 通过 disabledCountries、plausibleCountries、距离与 concept rules；具体竞争候选 Unknown。

↓

Step5
为什么删除其它国家：
- Unknown。当前 accepted route 没有保存 rejected alternatives；只能从代码知道可能原因包括 CN block、region 不合理、距离超限、pool 为空、dedupe 太近、cluster 饱和。

↓

Step6
为什么生成当前标题：
- route title：makeRoute 模板读取 titleCountry + days + styleLabelZh + first/last destination，生成当前标题。

↓

Step7
为什么生成当前主题：
- profile/theme + buildRouteConcept 生成 travelStyle=road-trip；themes=公路自驾。

↓

Step8
为什么生成当前简介：
- route summary：makeRoute 固定模板读取 styleLabelZh 和前 3 个目的地，模板化风险最高。

↓

Step9
为什么进入 Accepted：
- 保存状态：contentQualityStatus=accepted, repositoryStatus=mediaReady, sourceType=planner-designed
- 可证明原因：materialize-route-pool 在 makeRoute 后调用 validateRouteContent(record).accepted 才 addCandidate；accepted repository 已保存本条。

↓

Step10
为什么进入 Feed（如果进入）：
- 未进入或无法证明进入 Feed：没有通过当前报告可验证的 feedReady + onlineCoverAsset 国家匹配。

真正改变路线结果的输入：
- 国家组合：由 destinations 的 countryCode 集合直接决定为 CZ；plausibleCountries/CN block 可过滤，但被删国家候选 Unknown。
- 城市/景点：由 knowledge-graph-pool 候选或 coverageFallbackPlaces 形成 destinationEntities=伊赫拉瓦 > 奥帕瓦 > 拉贝河畔乌斯季。
- 天数：由 buildRouteConcept 得到 recommendedDays，再由 concreteDaysFor(hash(profile, destinations, serial)) 固化为 5。
- travelStyle：由 context/profile + buildRouteConcept 决定；保存为 road-trip。
- route title：makeRoute 模板读取 titleCountry + days + styleLabelZh + first/last destination，生成当前标题。
- route summary：makeRoute 固定模板读取 styleLabelZh 和前 3 个目的地，模板化风险最高。

最后补上的标签/非决策字段：
- plannerReason：在路线骨架/concept 后写入；不证明它改变了国家、城市或天数。
- coverageContribution：由生成后的 country/destination 数量汇总；不是生成前输入。
- contentEvidence.provider/evidenceHash：主要是来源/缓存/溯源；一般不改变本条路线内容。
- designStrategies：来自 profile.strategies，更多是 profile 标签；在部分 concept validation 中被读取，但不能逐条证明改变了候选池。

删除输入后的影响判断：
- 删除 country/destinationEntities：会改变国家组合、标题、summary，或无法生成路线。★★★★★
- 删除 travelStyle/profile：会改变 concept、styleLabel、天数推导、标题主题。★★★★★
- 删除 bestMonths：会改变 bestMonths 展示；是否改变路线主体仅 seasonal/profile 可证明，普通路线无法证明。★★☆☆☆
- 删除 designStrategies：可能影响 buildRouteConcept 对 theme/season/transport 的 style 判定；但大量 profile 中是标签，逐条影响无法完全证明。★★☆☆☆
- 删除 plannerReason/coverageContribution：不会改变已生成路线内容。☆

### Route: 约旦7天主题游：约旦历史城区到约旦区域风景带

- Route ID: `materialized-tfz49s-51856`
- 抽样类别: Geographic
- 可证明来源类型: Materialized Template
- 国家: JO
- 目的地: 约旦历史城区 > 约旦自然腹地 > 约旦地方生活区 > 约旦区域风景带
- travelStyle: theme
- durationBand / days: 7-10d / 7
- Feed: 无法证明进入当前 Feed ready pool

Decision Trace:

Step1
读取：
- knowledge-graph-pool.json: destination/country candidates, as proven by provenance.source=knowledge-graph-pool or contentEvidence.materialized
- profile/travelStyle=theme: proven by travelStyle/travelStyleConceptKey/contentEvidence.travelMode
- countryCodes=JO
- destinationEntities=约旦历史城区 > 约旦自然腹地 > 约旦地方生活区 > 约旦区域风景带
- bestMonths=9-11月
- designStrategies=Geographic+Theme+Transport
- distance calculation / routePassesPlannerRules: proven by materialize-route-pool.mjs, but per-route rejected alternatives are not persisted

↓

Step2
过滤：
- disabledCountries 包含 CN；plausibleCountries 要求国家组合在 regionGroups 中；routePassesPlannerRules 要求 concept validation、距离完整、maxSegment/span 不超限。

↓

Step3
候选国家：
- 可证明保存结果：JO
- 生成前完整候选国家池：Unknown（accepted route 未保存被扫描/被删除候选列表）。

↓

Step4
为什么保留这些国家：
- 因为这些 destinationEntities 的 countryCode 通过 disabledCountries、plausibleCountries、距离与 concept rules；具体竞争候选 Unknown。

↓

Step5
为什么删除其它国家：
- Unknown。当前 accepted route 没有保存 rejected alternatives；只能从代码知道可能原因包括 CN block、region 不合理、距离超限、pool 为空、dedupe 太近、cluster 饱和。

↓

Step6
为什么生成当前标题：
- route title：makeRoute 模板读取 titleCountry + days + styleLabelZh + first/last destination，生成当前标题。

↓

Step7
为什么生成当前主题：
- profile/theme + buildRouteConcept 生成 travelStyle=theme；themes=主题游。

↓

Step8
为什么生成当前简介：
- route summary：makeRoute 固定模板读取 styleLabelZh 和前 3 个目的地，模板化风险最高。

↓

Step9
为什么进入 Accepted：
- 保存状态：contentQualityStatus=accepted, repositoryStatus=mediaReady, sourceType=planner-designed
- 可证明原因：materialize-route-pool 在 makeRoute 后调用 validateRouteContent(record).accepted 才 addCandidate；accepted repository 已保存本条。

↓

Step10
为什么进入 Feed（如果进入）：
- 未进入或无法证明进入 Feed：没有通过当前报告可验证的 feedReady + onlineCoverAsset 国家匹配。

真正改变路线结果的输入：
- 国家组合：由 destinations 的 countryCode 集合直接决定为 JO；plausibleCountries/CN block 可过滤，但被删国家候选 Unknown。
- 城市/景点：由 knowledge-graph-pool 候选或 coverageFallbackPlaces 形成 destinationEntities=约旦历史城区 > 约旦自然腹地 > 约旦地方生活区 > 约旦区域风景带。
- 天数：由 buildRouteConcept 得到 recommendedDays，再由 concreteDaysFor(hash(profile, destinations, serial)) 固化为 7。
- travelStyle：由 context/profile + buildRouteConcept 决定；保存为 theme。
- route title：makeRoute 模板读取 titleCountry + days + styleLabelZh + first/last destination，生成当前标题。
- route summary：makeRoute 固定模板读取 styleLabelZh 和前 3 个目的地，模板化风险最高。

最后补上的标签/非决策字段：
- plannerReason：在路线骨架/concept 后写入；不证明它改变了国家、城市或天数。
- coverageContribution：由生成后的 country/destination 数量汇总；不是生成前输入。
- contentEvidence.provider/evidenceHash：主要是来源/缓存/溯源；一般不改变本条路线内容。
- designStrategies：来自 profile.strategies，更多是 profile 标签；在部分 concept validation 中被读取，但不能逐条证明改变了候选池。

删除输入后的影响判断：
- 删除 country/destinationEntities：会改变国家组合、标题、summary，或无法生成路线。★★★★★
- 删除 travelStyle/profile：会改变 concept、styleLabel、天数推导、标题主题。★★★★★
- 删除 bestMonths：会改变 bestMonths 展示；是否改变路线主体仅 seasonal/profile 可证明，普通路线无法证明。★★☆☆☆
- 删除 designStrategies：可能影响 buildRouteConcept 对 theme/season/transport 的 style 判定；但大量 profile 中是标签，逐条影响无法完全证明。★★☆☆☆
- 删除 plannerReason/coverageContribution：不会改变已生成路线内容。☆

### Route: 多哥7天铁路旅程：多哥自然腹地到多哥文化停留区

- Route ID: `materialized-mi859q-52147`
- 抽样类别: Geographic
- 可证明来源类型: Materialized Template
- 国家: TG
- 目的地: 多哥自然腹地 > 多哥地方生活区 > 多哥区域风景带 > 多哥文化停留区
- travelStyle: rail-journey
- durationBand / days: 7-10d / 7
- Feed: 无法证明进入当前 Feed ready pool

Decision Trace:

Step1
读取：
- knowledge-graph-pool.json: destination/country candidates, as proven by provenance.source=knowledge-graph-pool or contentEvidence.materialized
- profile/travelStyle=rail-journey: proven by travelStyle/travelStyleConceptKey/contentEvidence.travelMode
- countryCodes=TG
- destinationEntities=多哥自然腹地 > 多哥地方生活区 > 多哥区域风景带 > 多哥文化停留区
- bestMonths=4-10月
- designStrategies=Geographic+Transport+Theme
- distance calculation / routePassesPlannerRules: proven by materialize-route-pool.mjs, but per-route rejected alternatives are not persisted

↓

Step2
过滤：
- disabledCountries 包含 CN；plausibleCountries 要求国家组合在 regionGroups 中；routePassesPlannerRules 要求 concept validation、距离完整、maxSegment/span 不超限。

↓

Step3
候选国家：
- 可证明保存结果：TG
- 生成前完整候选国家池：Unknown（accepted route 未保存被扫描/被删除候选列表）。

↓

Step4
为什么保留这些国家：
- 因为这些 destinationEntities 的 countryCode 通过 disabledCountries、plausibleCountries、距离与 concept rules；具体竞争候选 Unknown。

↓

Step5
为什么删除其它国家：
- Unknown。当前 accepted route 没有保存 rejected alternatives；只能从代码知道可能原因包括 CN block、region 不合理、距离超限、pool 为空、dedupe 太近、cluster 饱和。

↓

Step6
为什么生成当前标题：
- route title：makeRoute 模板读取 titleCountry + days + styleLabelZh + first/last destination，生成当前标题。

↓

Step7
为什么生成当前主题：
- profile/theme + buildRouteConcept 生成 travelStyle=rail-journey；themes=铁路旅程。

↓

Step8
为什么生成当前简介：
- route summary：makeRoute 固定模板读取 styleLabelZh 和前 3 个目的地，模板化风险最高。

↓

Step9
为什么进入 Accepted：
- 保存状态：contentQualityStatus=accepted, repositoryStatus=mediaReady, sourceType=planner-designed
- 可证明原因：materialize-route-pool 在 makeRoute 后调用 validateRouteContent(record).accepted 才 addCandidate；accepted repository 已保存本条。

↓

Step10
为什么进入 Feed（如果进入）：
- 未进入或无法证明进入 Feed：没有通过当前报告可验证的 feedReady + onlineCoverAsset 国家匹配。

真正改变路线结果的输入：
- 国家组合：由 destinations 的 countryCode 集合直接决定为 TG；plausibleCountries/CN block 可过滤，但被删国家候选 Unknown。
- 城市/景点：由 knowledge-graph-pool 候选或 coverageFallbackPlaces 形成 destinationEntities=多哥自然腹地 > 多哥地方生活区 > 多哥区域风景带 > 多哥文化停留区。
- 天数：由 buildRouteConcept 得到 recommendedDays，再由 concreteDaysFor(hash(profile, destinations, serial)) 固化为 7。
- travelStyle：由 context/profile + buildRouteConcept 决定；保存为 rail-journey。
- route title：makeRoute 模板读取 titleCountry + days + styleLabelZh + first/last destination，生成当前标题。
- route summary：makeRoute 固定模板读取 styleLabelZh 和前 3 个目的地，模板化风险最高。

最后补上的标签/非决策字段：
- plannerReason：在路线骨架/concept 后写入；不证明它改变了国家、城市或天数。
- coverageContribution：由生成后的 country/destination 数量汇总；不是生成前输入。
- contentEvidence.provider/evidenceHash：主要是来源/缓存/溯源；一般不改变本条路线内容。
- designStrategies：来自 profile.strategies，更多是 profile 标签；在部分 concept validation 中被读取，但不能逐条证明改变了候选池。

删除输入后的影响判断：
- 删除 country/destinationEntities：会改变国家组合、标题、summary，或无法生成路线。★★★★★
- 删除 travelStyle/profile：会改变 concept、styleLabel、天数推导、标题主题。★★★★★
- 删除 bestMonths：会改变 bestMonths 展示；是否改变路线主体仅 seasonal/profile 可证明，普通路线无法证明。★★☆☆☆
- 删除 designStrategies：可能影响 buildRouteConcept 对 theme/season/transport 的 style 判定；但大量 profile 中是标签，逐条影响无法完全证明。★★☆☆☆
- 删除 plannerReason/coverageContribution：不会改变已生成路线内容。☆

### Route: 厄立特里亚7天铁路旅程：厄立特里亚区域风景带到厄立特里亚历史城区

- Route ID: `materialized-1kbxipv-52504`
- 抽样类别: Geographic
- 可证明来源类型: Materialized Template
- 国家: ER
- 目的地: 厄立特里亚区域风景带 > 厄立特里亚文化停留区 > 厄立特里亚门户城市 > 厄立特里亚历史城区
- travelStyle: rail-journey
- durationBand / days: 7-10d / 7
- Feed: 无法证明进入当前 Feed ready pool

Decision Trace:

Step1
读取：
- knowledge-graph-pool.json: destination/country candidates, as proven by provenance.source=knowledge-graph-pool or contentEvidence.materialized
- profile/travelStyle=rail-journey: proven by travelStyle/travelStyleConceptKey/contentEvidence.travelMode
- countryCodes=ER
- destinationEntities=厄立特里亚区域风景带 > 厄立特里亚文化停留区 > 厄立特里亚门户城市 > 厄立特里亚历史城区
- bestMonths=4-10月
- designStrategies=Geographic+Transport+Theme
- distance calculation / routePassesPlannerRules: proven by materialize-route-pool.mjs, but per-route rejected alternatives are not persisted

↓

Step2
过滤：
- disabledCountries 包含 CN；plausibleCountries 要求国家组合在 regionGroups 中；routePassesPlannerRules 要求 concept validation、距离完整、maxSegment/span 不超限。

↓

Step3
候选国家：
- 可证明保存结果：ER
- 生成前完整候选国家池：Unknown（accepted route 未保存被扫描/被删除候选列表）。

↓

Step4
为什么保留这些国家：
- 因为这些 destinationEntities 的 countryCode 通过 disabledCountries、plausibleCountries、距离与 concept rules；具体竞争候选 Unknown。

↓

Step5
为什么删除其它国家：
- Unknown。当前 accepted route 没有保存 rejected alternatives；只能从代码知道可能原因包括 CN block、region 不合理、距离超限、pool 为空、dedupe 太近、cluster 饱和。

↓

Step6
为什么生成当前标题：
- route title：makeRoute 模板读取 titleCountry + days + styleLabelZh + first/last destination，生成当前标题。

↓

Step7
为什么生成当前主题：
- profile/theme + buildRouteConcept 生成 travelStyle=rail-journey；themes=铁路旅程。

↓

Step8
为什么生成当前简介：
- route summary：makeRoute 固定模板读取 styleLabelZh 和前 3 个目的地，模板化风险最高。

↓

Step9
为什么进入 Accepted：
- 保存状态：contentQualityStatus=accepted, repositoryStatus=mediaReady, sourceType=planner-designed
- 可证明原因：materialize-route-pool 在 makeRoute 后调用 validateRouteContent(record).accepted 才 addCandidate；accepted repository 已保存本条。

↓

Step10
为什么进入 Feed（如果进入）：
- 未进入或无法证明进入 Feed：没有通过当前报告可验证的 feedReady + onlineCoverAsset 国家匹配。

真正改变路线结果的输入：
- 国家组合：由 destinations 的 countryCode 集合直接决定为 ER；plausibleCountries/CN block 可过滤，但被删国家候选 Unknown。
- 城市/景点：由 knowledge-graph-pool 候选或 coverageFallbackPlaces 形成 destinationEntities=厄立特里亚区域风景带 > 厄立特里亚文化停留区 > 厄立特里亚门户城市 > 厄立特里亚历史城区。
- 天数：由 buildRouteConcept 得到 recommendedDays，再由 concreteDaysFor(hash(profile, destinations, serial)) 固化为 7。
- travelStyle：由 context/profile + buildRouteConcept 决定；保存为 rail-journey。
- route title：makeRoute 模板读取 titleCountry + days + styleLabelZh + first/last destination，生成当前标题。
- route summary：makeRoute 固定模板读取 styleLabelZh 和前 3 个目的地，模板化风险最高。

最后补上的标签/非决策字段：
- plannerReason：在路线骨架/concept 后写入；不证明它改变了国家、城市或天数。
- coverageContribution：由生成后的 country/destination 数量汇总；不是生成前输入。
- contentEvidence.provider/evidenceHash：主要是来源/缓存/溯源；一般不改变本条路线内容。
- designStrategies：来自 profile.strategies，更多是 profile 标签；在部分 concept validation 中被读取，但不能逐条证明改变了候选池。

删除输入后的影响判断：
- 删除 country/destinationEntities：会改变国家组合、标题、summary，或无法生成路线。★★★★★
- 删除 travelStyle/profile：会改变 concept、styleLabel、天数推导、标题主题。★★★★★
- 删除 bestMonths：会改变 bestMonths 展示；是否改变路线主体仅 seasonal/profile 可证明，普通路线无法证明。★★☆☆☆
- 删除 designStrategies：可能影响 buildRouteConcept 对 theme/season/transport 的 style 判定；但大量 profile 中是标签，逐条影响无法完全证明。★★☆☆☆
- 删除 plannerReason/coverageContribution：不会改变已生成路线内容。☆

### Route: 巴拉圭7天经典首访：巴拉圭文化停留区到巴拉圭自然腹地

- Route ID: `materialized-z4utjy-52786`
- 抽样类别: Geographic
- 可证明来源类型: Materialized Template
- 国家: PY
- 目的地: 巴拉圭文化停留区 > 巴拉圭门户城市 > 巴拉圭历史城区 > 巴拉圭自然腹地
- travelStyle: classic-first-trip
- durationBand / days: 7-10d / 7
- Feed: 无法证明进入当前 Feed ready pool

Decision Trace:

Step1
读取：
- knowledge-graph-pool.json: destination/country candidates, as proven by provenance.source=knowledge-graph-pool or contentEvidence.materialized
- profile/travelStyle=classic-first-trip: proven by travelStyle/travelStyleConceptKey/contentEvidence.travelMode
- countryCodes=PY
- destinationEntities=巴拉圭文化停留区 > 巴拉圭门户城市 > 巴拉圭历史城区 > 巴拉圭自然腹地
- bestMonths=3-5月
- designStrategies=Geographic+Season+Theme+Transport
- distance calculation / routePassesPlannerRules: proven by materialize-route-pool.mjs, but per-route rejected alternatives are not persisted

↓

Step2
过滤：
- disabledCountries 包含 CN；plausibleCountries 要求国家组合在 regionGroups 中；routePassesPlannerRules 要求 concept validation、距离完整、maxSegment/span 不超限。

↓

Step3
候选国家：
- 可证明保存结果：PY
- 生成前完整候选国家池：Unknown（accepted route 未保存被扫描/被删除候选列表）。

↓

Step4
为什么保留这些国家：
- 因为这些 destinationEntities 的 countryCode 通过 disabledCountries、plausibleCountries、距离与 concept rules；具体竞争候选 Unknown。

↓

Step5
为什么删除其它国家：
- Unknown。当前 accepted route 没有保存 rejected alternatives；只能从代码知道可能原因包括 CN block、region 不合理、距离超限、pool 为空、dedupe 太近、cluster 饱和。

↓

Step6
为什么生成当前标题：
- route title：makeRoute 模板读取 titleCountry + days + styleLabelZh + first/last destination，生成当前标题。

↓

Step7
为什么生成当前主题：
- profile/theme + buildRouteConcept 生成 travelStyle=classic-first-trip；themes=经典首访。

↓

Step8
为什么生成当前简介：
- route summary：makeRoute 固定模板读取 styleLabelZh 和前 3 个目的地，模板化风险最高。

↓

Step9
为什么进入 Accepted：
- 保存状态：contentQualityStatus=accepted, repositoryStatus=mediaReady, sourceType=planner-designed
- 可证明原因：materialize-route-pool 在 makeRoute 后调用 validateRouteContent(record).accepted 才 addCandidate；accepted repository 已保存本条。

↓

Step10
为什么进入 Feed（如果进入）：
- 未进入或无法证明进入 Feed：没有通过当前报告可验证的 feedReady + onlineCoverAsset 国家匹配。

真正改变路线结果的输入：
- 国家组合：由 destinations 的 countryCode 集合直接决定为 PY；plausibleCountries/CN block 可过滤，但被删国家候选 Unknown。
- 城市/景点：由 knowledge-graph-pool 候选或 coverageFallbackPlaces 形成 destinationEntities=巴拉圭文化停留区 > 巴拉圭门户城市 > 巴拉圭历史城区 > 巴拉圭自然腹地。
- 天数：由 buildRouteConcept 得到 recommendedDays，再由 concreteDaysFor(hash(profile, destinations, serial)) 固化为 7。
- travelStyle：由 context/profile + buildRouteConcept 决定；保存为 classic-first-trip。
- route title：makeRoute 模板读取 titleCountry + days + styleLabelZh + first/last destination，生成当前标题。
- route summary：makeRoute 固定模板读取 styleLabelZh 和前 3 个目的地，模板化风险最高。

最后补上的标签/非决策字段：
- plannerReason：在路线骨架/concept 后写入；不证明它改变了国家、城市或天数。
- coverageContribution：由生成后的 country/destination 数量汇总；不是生成前输入。
- contentEvidence.provider/evidenceHash：主要是来源/缓存/溯源；一般不改变本条路线内容。
- designStrategies：来自 profile.strategies，更多是 profile 标签；在部分 concept validation 中被读取，但不能逐条证明改变了候选池。

删除输入后的影响判断：
- 删除 country/destinationEntities：会改变国家组合、标题、summary，或无法生成路线。★★★★★
- 删除 travelStyle/profile：会改变 concept、styleLabel、天数推导、标题主题。★★★★★
- 删除 bestMonths：会改变 bestMonths 展示；是否改变路线主体仅 seasonal/profile 可证明，普通路线无法证明。★★☆☆☆
- 删除 designStrategies：可能影响 buildRouteConcept 对 theme/season/transport 的 style 判定；但大量 profile 中是标签，逐条影响无法完全证明。★★☆☆☆
- 删除 plannerReason/coverageContribution：不会改变已生成路线内容。☆

### Route: 白俄罗斯8天经典首访：白俄罗斯历史城区到白俄罗斯文化停留区

- Route ID: `materialized-fwpoqr-54194`
- 抽样类别: Geographic
- 可证明来源类型: Materialized Template
- 国家: BY
- 目的地: 白俄罗斯历史城区 > 白俄罗斯自然腹地 > 白俄罗斯地方生活区 > 白俄罗斯区域风景带 > 白俄罗斯文化停留区
- travelStyle: classic-first-trip
- durationBand / days: 7-10d / 8
- Feed: 无法证明进入当前 Feed ready pool

Decision Trace:

Step1
读取：
- knowledge-graph-pool.json: destination/country candidates, as proven by provenance.source=knowledge-graph-pool or contentEvidence.materialized
- profile/travelStyle=classic-first-trip: proven by travelStyle/travelStyleConceptKey/contentEvidence.travelMode
- countryCodes=BY
- destinationEntities=白俄罗斯历史城区 > 白俄罗斯自然腹地 > 白俄罗斯地方生活区 > 白俄罗斯区域风景带 > 白俄罗斯文化停留区
- bestMonths=4-10月
- designStrategies=Geographic+Theme+Transport
- distance calculation / routePassesPlannerRules: proven by materialize-route-pool.mjs, but per-route rejected alternatives are not persisted

↓

Step2
过滤：
- disabledCountries 包含 CN；plausibleCountries 要求国家组合在 regionGroups 中；routePassesPlannerRules 要求 concept validation、距离完整、maxSegment/span 不超限。

↓

Step3
候选国家：
- 可证明保存结果：BY
- 生成前完整候选国家池：Unknown（accepted route 未保存被扫描/被删除候选列表）。

↓

Step4
为什么保留这些国家：
- 因为这些 destinationEntities 的 countryCode 通过 disabledCountries、plausibleCountries、距离与 concept rules；具体竞争候选 Unknown。

↓

Step5
为什么删除其它国家：
- Unknown。当前 accepted route 没有保存 rejected alternatives；只能从代码知道可能原因包括 CN block、region 不合理、距离超限、pool 为空、dedupe 太近、cluster 饱和。

↓

Step6
为什么生成当前标题：
- route title：makeRoute 模板读取 titleCountry + days + styleLabelZh + first/last destination，生成当前标题。

↓

Step7
为什么生成当前主题：
- profile/theme + buildRouteConcept 生成 travelStyle=classic-first-trip；themes=经典首访。

↓

Step8
为什么生成当前简介：
- route summary：makeRoute 固定模板读取 styleLabelZh 和前 3 个目的地，模板化风险最高。

↓

Step9
为什么进入 Accepted：
- 保存状态：contentQualityStatus=accepted, repositoryStatus=mediaReady, sourceType=planner-designed
- 可证明原因：materialize-route-pool 在 makeRoute 后调用 validateRouteContent(record).accepted 才 addCandidate；accepted repository 已保存本条。

↓

Step10
为什么进入 Feed（如果进入）：
- 未进入或无法证明进入 Feed：没有通过当前报告可验证的 feedReady + onlineCoverAsset 国家匹配。

真正改变路线结果的输入：
- 国家组合：由 destinations 的 countryCode 集合直接决定为 BY；plausibleCountries/CN block 可过滤，但被删国家候选 Unknown。
- 城市/景点：由 knowledge-graph-pool 候选或 coverageFallbackPlaces 形成 destinationEntities=白俄罗斯历史城区 > 白俄罗斯自然腹地 > 白俄罗斯地方生活区 > 白俄罗斯区域风景带 > 白俄罗斯文化停留区。
- 天数：由 buildRouteConcept 得到 recommendedDays，再由 concreteDaysFor(hash(profile, destinations, serial)) 固化为 8。
- travelStyle：由 context/profile + buildRouteConcept 决定；保存为 classic-first-trip。
- route title：makeRoute 模板读取 titleCountry + days + styleLabelZh + first/last destination，生成当前标题。
- route summary：makeRoute 固定模板读取 styleLabelZh 和前 3 个目的地，模板化风险最高。

最后补上的标签/非决策字段：
- plannerReason：在路线骨架/concept 后写入；不证明它改变了国家、城市或天数。
- coverageContribution：由生成后的 country/destination 数量汇总；不是生成前输入。
- contentEvidence.provider/evidenceHash：主要是来源/缓存/溯源；一般不改变本条路线内容。
- designStrategies：来自 profile.strategies，更多是 profile 标签；在部分 concept validation 中被读取，但不能逐条证明改变了候选池。

删除输入后的影响判断：
- 删除 country/destinationEntities：会改变国家组合、标题、summary，或无法生成路线。★★★★★
- 删除 travelStyle/profile：会改变 concept、styleLabel、天数推导、标题主题。★★★★★
- 删除 bestMonths：会改变 bestMonths 展示；是否改变路线主体仅 seasonal/profile 可证明，普通路线无法证明。★★☆☆☆
- 删除 designStrategies：可能影响 buildRouteConcept 对 theme/season/transport 的 style 判定；但大量 profile 中是标签，逐条影响无法完全证明。★★☆☆☆
- 删除 plannerReason/coverageContribution：不会改变已生成路线内容。☆

### Route: 马拉维9天经典首访：马拉维自然腹地到马拉维门户城市

- Route ID: `materialized-1xbt3uc-54474`
- 抽样类别: Geographic
- 可证明来源类型: Materialized Template
- 国家: MW
- 目的地: 马拉维自然腹地 > 马拉维地方生活区 > 马拉维区域风景带 > 马拉维文化停留区 > 马拉维门户城市
- travelStyle: classic-first-trip
- durationBand / days: 7-10d / 9
- Feed: 无法证明进入当前 Feed ready pool

Decision Trace:

Step1
读取：
- knowledge-graph-pool.json: destination/country candidates, as proven by provenance.source=knowledge-graph-pool or contentEvidence.materialized
- profile/travelStyle=classic-first-trip: proven by travelStyle/travelStyleConceptKey/contentEvidence.travelMode
- countryCodes=MW
- destinationEntities=马拉维自然腹地 > 马拉维地方生活区 > 马拉维区域风景带 > 马拉维文化停留区 > 马拉维门户城市
- bestMonths=4-10月
- designStrategies=Geographic+Theme+Transport
- distance calculation / routePassesPlannerRules: proven by materialize-route-pool.mjs, but per-route rejected alternatives are not persisted

↓

Step2
过滤：
- disabledCountries 包含 CN；plausibleCountries 要求国家组合在 regionGroups 中；routePassesPlannerRules 要求 concept validation、距离完整、maxSegment/span 不超限。

↓

Step3
候选国家：
- 可证明保存结果：MW
- 生成前完整候选国家池：Unknown（accepted route 未保存被扫描/被删除候选列表）。

↓

Step4
为什么保留这些国家：
- 因为这些 destinationEntities 的 countryCode 通过 disabledCountries、plausibleCountries、距离与 concept rules；具体竞争候选 Unknown。

↓

Step5
为什么删除其它国家：
- Unknown。当前 accepted route 没有保存 rejected alternatives；只能从代码知道可能原因包括 CN block、region 不合理、距离超限、pool 为空、dedupe 太近、cluster 饱和。

↓

Step6
为什么生成当前标题：
- route title：makeRoute 模板读取 titleCountry + days + styleLabelZh + first/last destination，生成当前标题。

↓

Step7
为什么生成当前主题：
- profile/theme + buildRouteConcept 生成 travelStyle=classic-first-trip；themes=经典首访。

↓

Step8
为什么生成当前简介：
- route summary：makeRoute 固定模板读取 styleLabelZh 和前 3 个目的地，模板化风险最高。

↓

Step9
为什么进入 Accepted：
- 保存状态：contentQualityStatus=accepted, repositoryStatus=mediaReady, sourceType=planner-designed
- 可证明原因：materialize-route-pool 在 makeRoute 后调用 validateRouteContent(record).accepted 才 addCandidate；accepted repository 已保存本条。

↓

Step10
为什么进入 Feed（如果进入）：
- 未进入或无法证明进入 Feed：没有通过当前报告可验证的 feedReady + onlineCoverAsset 国家匹配。

真正改变路线结果的输入：
- 国家组合：由 destinations 的 countryCode 集合直接决定为 MW；plausibleCountries/CN block 可过滤，但被删国家候选 Unknown。
- 城市/景点：由 knowledge-graph-pool 候选或 coverageFallbackPlaces 形成 destinationEntities=马拉维自然腹地 > 马拉维地方生活区 > 马拉维区域风景带 > 马拉维文化停留区 > 马拉维门户城市。
- 天数：由 buildRouteConcept 得到 recommendedDays，再由 concreteDaysFor(hash(profile, destinations, serial)) 固化为 9。
- travelStyle：由 context/profile + buildRouteConcept 决定；保存为 classic-first-trip。
- route title：makeRoute 模板读取 titleCountry + days + styleLabelZh + first/last destination，生成当前标题。
- route summary：makeRoute 固定模板读取 styleLabelZh 和前 3 个目的地，模板化风险最高。

最后补上的标签/非决策字段：
- plannerReason：在路线骨架/concept 后写入；不证明它改变了国家、城市或天数。
- coverageContribution：由生成后的 country/destination 数量汇总；不是生成前输入。
- contentEvidence.provider/evidenceHash：主要是来源/缓存/溯源；一般不改变本条路线内容。
- designStrategies：来自 profile.strategies，更多是 profile 标签；在部分 concept validation 中被读取，但不能逐条证明改变了候选池。

删除输入后的影响判断：
- 删除 country/destinationEntities：会改变国家组合、标题、summary，或无法生成路线。★★★★★
- 删除 travelStyle/profile：会改变 concept、styleLabel、天数推导、标题主题。★★★★★
- 删除 bestMonths：会改变 bestMonths 展示；是否改变路线主体仅 seasonal/profile 可证明，普通路线无法证明。★★☆☆☆
- 删除 designStrategies：可能影响 buildRouteConcept 对 theme/season/transport 的 style 判定；但大量 profile 中是标签，逐条影响无法完全证明。★★☆☆☆
- 删除 plannerReason/coverageContribution：不会改变已生成路线内容。☆

### Route: 阿富汗8天铁路旅程：阿富汗区域风景带到阿富汗自然腹地

- Route ID: `materialized-15zx7eh-54764`
- 抽样类别: Geographic
- 可证明来源类型: Materialized Template
- 国家: AF
- 目的地: 阿富汗区域风景带 > 阿富汗文化停留区 > 阿富汗门户城市 > 阿富汗历史城区 > 阿富汗自然腹地
- travelStyle: rail-journey
- durationBand / days: 7-10d / 8
- Feed: 无法证明进入当前 Feed ready pool

Decision Trace:

Step1
读取：
- knowledge-graph-pool.json: destination/country candidates, as proven by provenance.source=knowledge-graph-pool or contentEvidence.materialized
- profile/travelStyle=rail-journey: proven by travelStyle/travelStyleConceptKey/contentEvidence.travelMode
- countryCodes=AF
- destinationEntities=阿富汗区域风景带 > 阿富汗文化停留区 > 阿富汗门户城市 > 阿富汗历史城区 > 阿富汗自然腹地
- bestMonths=4-10月
- designStrategies=Geographic+Transport+Theme
- distance calculation / routePassesPlannerRules: proven by materialize-route-pool.mjs, but per-route rejected alternatives are not persisted

↓

Step2
过滤：
- disabledCountries 包含 CN；plausibleCountries 要求国家组合在 regionGroups 中；routePassesPlannerRules 要求 concept validation、距离完整、maxSegment/span 不超限。

↓

Step3
候选国家：
- 可证明保存结果：AF
- 生成前完整候选国家池：Unknown（accepted route 未保存被扫描/被删除候选列表）。

↓

Step4
为什么保留这些国家：
- 因为这些 destinationEntities 的 countryCode 通过 disabledCountries、plausibleCountries、距离与 concept rules；具体竞争候选 Unknown。

↓

Step5
为什么删除其它国家：
- Unknown。当前 accepted route 没有保存 rejected alternatives；只能从代码知道可能原因包括 CN block、region 不合理、距离超限、pool 为空、dedupe 太近、cluster 饱和。

↓

Step6
为什么生成当前标题：
- route title：makeRoute 模板读取 titleCountry + days + styleLabelZh + first/last destination，生成当前标题。

↓

Step7
为什么生成当前主题：
- profile/theme + buildRouteConcept 生成 travelStyle=rail-journey；themes=铁路旅程。

↓

Step8
为什么生成当前简介：
- route summary：makeRoute 固定模板读取 styleLabelZh 和前 3 个目的地，模板化风险最高。

↓

Step9
为什么进入 Accepted：
- 保存状态：contentQualityStatus=accepted, repositoryStatus=mediaReady, sourceType=planner-designed
- 可证明原因：materialize-route-pool 在 makeRoute 后调用 validateRouteContent(record).accepted 才 addCandidate；accepted repository 已保存本条。

↓

Step10
为什么进入 Feed（如果进入）：
- 未进入或无法证明进入 Feed：没有通过当前报告可验证的 feedReady + onlineCoverAsset 国家匹配。

真正改变路线结果的输入：
- 国家组合：由 destinations 的 countryCode 集合直接决定为 AF；plausibleCountries/CN block 可过滤，但被删国家候选 Unknown。
- 城市/景点：由 knowledge-graph-pool 候选或 coverageFallbackPlaces 形成 destinationEntities=阿富汗区域风景带 > 阿富汗文化停留区 > 阿富汗门户城市 > 阿富汗历史城区 > 阿富汗自然腹地。
- 天数：由 buildRouteConcept 得到 recommendedDays，再由 concreteDaysFor(hash(profile, destinations, serial)) 固化为 8。
- travelStyle：由 context/profile + buildRouteConcept 决定；保存为 rail-journey。
- route title：makeRoute 模板读取 titleCountry + days + styleLabelZh + first/last destination，生成当前标题。
- route summary：makeRoute 固定模板读取 styleLabelZh 和前 3 个目的地，模板化风险最高。

最后补上的标签/非决策字段：
- plannerReason：在路线骨架/concept 后写入；不证明它改变了国家、城市或天数。
- coverageContribution：由生成后的 country/destination 数量汇总；不是生成前输入。
- contentEvidence.provider/evidenceHash：主要是来源/缓存/溯源；一般不改变本条路线内容。
- designStrategies：来自 profile.strategies，更多是 profile 标签；在部分 concept validation 中被读取，但不能逐条证明改变了候选池。

删除输入后的影响判断：
- 删除 country/destinationEntities：会改变国家组合、标题、summary，或无法生成路线。★★★★★
- 删除 travelStyle/profile：会改变 concept、styleLabel、天数推导、标题主题。★★★★★
- 删除 bestMonths：会改变 bestMonths 展示；是否改变路线主体仅 seasonal/profile 可证明，普通路线无法证明。★★☆☆☆
- 删除 designStrategies：可能影响 buildRouteConcept 对 theme/season/transport 的 style 判定；但大量 profile 中是标签，逐条影响无法完全证明。★★☆☆☆
- 删除 plannerReason/coverageContribution：不会改变已生成路线内容。☆

### Route: 圣卢西亚8天公路自驾：圣卢西亚文化停留区到圣卢西亚地方生活区

- Route ID: `materialized-1vmohcv-55045`
- 抽样类别: Geographic
- 可证明来源类型: Materialized Template
- 国家: LC
- 目的地: 圣卢西亚文化停留区 > 圣卢西亚门户城市 > 圣卢西亚历史城区 > 圣卢西亚自然腹地 > 圣卢西亚地方生活区
- travelStyle: road-trip
- durationBand / days: 7-10d / 8
- Feed: 无法证明进入当前 Feed ready pool

Decision Trace:

Step1
读取：
- knowledge-graph-pool.json: destination/country candidates, as proven by provenance.source=knowledge-graph-pool or contentEvidence.materialized
- profile/travelStyle=road-trip: proven by travelStyle/travelStyleConceptKey/contentEvidence.travelMode
- countryCodes=LC
- destinationEntities=圣卢西亚文化停留区 > 圣卢西亚门户城市 > 圣卢西亚历史城区 > 圣卢西亚自然腹地 > 圣卢西亚地方生活区
- bestMonths=5-9月
- designStrategies=Geographic+Transport+Theme
- distance calculation / routePassesPlannerRules: proven by materialize-route-pool.mjs, but per-route rejected alternatives are not persisted

↓

Step2
过滤：
- disabledCountries 包含 CN；plausibleCountries 要求国家组合在 regionGroups 中；routePassesPlannerRules 要求 concept validation、距离完整、maxSegment/span 不超限。

↓

Step3
候选国家：
- 可证明保存结果：LC
- 生成前完整候选国家池：Unknown（accepted route 未保存被扫描/被删除候选列表）。

↓

Step4
为什么保留这些国家：
- 因为这些 destinationEntities 的 countryCode 通过 disabledCountries、plausibleCountries、距离与 concept rules；具体竞争候选 Unknown。

↓

Step5
为什么删除其它国家：
- Unknown。当前 accepted route 没有保存 rejected alternatives；只能从代码知道可能原因包括 CN block、region 不合理、距离超限、pool 为空、dedupe 太近、cluster 饱和。

↓

Step6
为什么生成当前标题：
- route title：makeRoute 模板读取 titleCountry + days + styleLabelZh + first/last destination，生成当前标题。

↓

Step7
为什么生成当前主题：
- profile/theme + buildRouteConcept 生成 travelStyle=road-trip；themes=公路自驾。

↓

Step8
为什么生成当前简介：
- route summary：makeRoute 固定模板读取 styleLabelZh 和前 3 个目的地，模板化风险最高。

↓

Step9
为什么进入 Accepted：
- 保存状态：contentQualityStatus=accepted, repositoryStatus=mediaReady, sourceType=planner-designed
- 可证明原因：materialize-route-pool 在 makeRoute 后调用 validateRouteContent(record).accepted 才 addCandidate；accepted repository 已保存本条。

↓

Step10
为什么进入 Feed（如果进入）：
- 未进入或无法证明进入 Feed：没有通过当前报告可验证的 feedReady + onlineCoverAsset 国家匹配。

真正改变路线结果的输入：
- 国家组合：由 destinations 的 countryCode 集合直接决定为 LC；plausibleCountries/CN block 可过滤，但被删国家候选 Unknown。
- 城市/景点：由 knowledge-graph-pool 候选或 coverageFallbackPlaces 形成 destinationEntities=圣卢西亚文化停留区 > 圣卢西亚门户城市 > 圣卢西亚历史城区 > 圣卢西亚自然腹地 > 圣卢西亚地方生活区。
- 天数：由 buildRouteConcept 得到 recommendedDays，再由 concreteDaysFor(hash(profile, destinations, serial)) 固化为 8。
- travelStyle：由 context/profile + buildRouteConcept 决定；保存为 road-trip。
- route title：makeRoute 模板读取 titleCountry + days + styleLabelZh + first/last destination，生成当前标题。
- route summary：makeRoute 固定模板读取 styleLabelZh 和前 3 个目的地，模板化风险最高。

最后补上的标签/非决策字段：
- plannerReason：在路线骨架/concept 后写入；不证明它改变了国家、城市或天数。
- coverageContribution：由生成后的 country/destination 数量汇总；不是生成前输入。
- contentEvidence.provider/evidenceHash：主要是来源/缓存/溯源；一般不改变本条路线内容。
- designStrategies：来自 profile.strategies，更多是 profile 标签；在部分 concept validation 中被读取，但不能逐条证明改变了候选池。

删除输入后的影响判断：
- 删除 country/destinationEntities：会改变国家组合、标题、summary，或无法生成路线。★★★★★
- 删除 travelStyle/profile：会改变 concept、styleLabel、天数推导、标题主题。★★★★★
- 删除 bestMonths：会改变 bestMonths 展示；是否改变路线主体仅 seasonal/profile 可证明，普通路线无法证明。★★☆☆☆
- 删除 designStrategies：可能影响 buildRouteConcept 对 theme/season/transport 的 style 判定；但大量 profile 中是标签，逐条影响无法完全证明。★★☆☆☆
- 删除 plannerReason/coverageContribution：不会改变已生成路线内容。☆

### Route: 梵蒂冈14天经典首访：梵蒂冈门户城市到梵蒂冈文化停留区

- Route ID: `materialized-1jrvncx-56368`
- 抽样类别: Geographic
- 可证明来源类型: Materialized Template
- 国家: VA
- 目的地: 梵蒂冈门户城市 > 梵蒂冈历史城区 > 梵蒂冈自然腹地 > 梵蒂冈地方生活区 > 梵蒂冈区域风景带 > 梵蒂冈文化停留区
- travelStyle: classic-first-trip
- durationBand / days: 10-14d / 14
- Feed: 无法证明进入当前 Feed ready pool

Decision Trace:

Step1
读取：
- knowledge-graph-pool.json: destination/country candidates, as proven by provenance.source=knowledge-graph-pool or contentEvidence.materialized
- profile/travelStyle=classic-first-trip: proven by travelStyle/travelStyleConceptKey/contentEvidence.travelMode
- countryCodes=VA
- destinationEntities=梵蒂冈门户城市 > 梵蒂冈历史城区 > 梵蒂冈自然腹地 > 梵蒂冈地方生活区 > 梵蒂冈区域风景带 > 梵蒂冈文化停留区
- bestMonths=3-5月
- designStrategies=Geographic+Season+Theme+Transport
- distance calculation / routePassesPlannerRules: proven by materialize-route-pool.mjs, but per-route rejected alternatives are not persisted

↓

Step2
过滤：
- disabledCountries 包含 CN；plausibleCountries 要求国家组合在 regionGroups 中；routePassesPlannerRules 要求 concept validation、距离完整、maxSegment/span 不超限。

↓

Step3
候选国家：
- 可证明保存结果：VA
- 生成前完整候选国家池：Unknown（accepted route 未保存被扫描/被删除候选列表）。

↓

Step4
为什么保留这些国家：
- 因为这些 destinationEntities 的 countryCode 通过 disabledCountries、plausibleCountries、距离与 concept rules；具体竞争候选 Unknown。

↓

Step5
为什么删除其它国家：
- Unknown。当前 accepted route 没有保存 rejected alternatives；只能从代码知道可能原因包括 CN block、region 不合理、距离超限、pool 为空、dedupe 太近、cluster 饱和。

↓

Step6
为什么生成当前标题：
- route title：makeRoute 模板读取 titleCountry + days + styleLabelZh + first/last destination，生成当前标题。

↓

Step7
为什么生成当前主题：
- profile/theme + buildRouteConcept 生成 travelStyle=classic-first-trip；themes=经典首访。

↓

Step8
为什么生成当前简介：
- route summary：makeRoute 固定模板读取 styleLabelZh 和前 3 个目的地，模板化风险最高。

↓

Step9
为什么进入 Accepted：
- 保存状态：contentQualityStatus=accepted, repositoryStatus=mediaReady, sourceType=planner-designed
- 可证明原因：materialize-route-pool 在 makeRoute 后调用 validateRouteContent(record).accepted 才 addCandidate；accepted repository 已保存本条。

↓

Step10
为什么进入 Feed（如果进入）：
- 未进入或无法证明进入 Feed：没有通过当前报告可验证的 feedReady + onlineCoverAsset 国家匹配。

真正改变路线结果的输入：
- 国家组合：由 destinations 的 countryCode 集合直接决定为 VA；plausibleCountries/CN block 可过滤，但被删国家候选 Unknown。
- 城市/景点：由 knowledge-graph-pool 候选或 coverageFallbackPlaces 形成 destinationEntities=梵蒂冈门户城市 > 梵蒂冈历史城区 > 梵蒂冈自然腹地 > 梵蒂冈地方生活区 > 梵蒂冈区域风景带 > 梵蒂冈文化停留区。
- 天数：由 buildRouteConcept 得到 recommendedDays，再由 concreteDaysFor(hash(profile, destinations, serial)) 固化为 14。
- travelStyle：由 context/profile + buildRouteConcept 决定；保存为 classic-first-trip。
- route title：makeRoute 模板读取 titleCountry + days + styleLabelZh + first/last destination，生成当前标题。
- route summary：makeRoute 固定模板读取 styleLabelZh 和前 3 个目的地，模板化风险最高。

最后补上的标签/非决策字段：
- plannerReason：在路线骨架/concept 后写入；不证明它改变了国家、城市或天数。
- coverageContribution：由生成后的 country/destination 数量汇总；不是生成前输入。
- contentEvidence.provider/evidenceHash：主要是来源/缓存/溯源；一般不改变本条路线内容。
- designStrategies：来自 profile.strategies，更多是 profile 标签；在部分 concept validation 中被读取，但不能逐条证明改变了候选池。

删除输入后的影响判断：
- 删除 country/destinationEntities：会改变国家组合、标题、summary，或无法生成路线。★★★★★
- 删除 travelStyle/profile：会改变 concept、styleLabel、天数推导、标题主题。★★★★★
- 删除 bestMonths：会改变 bestMonths 展示；是否改变路线主体仅 seasonal/profile 可证明，普通路线无法证明。★★☆☆☆
- 删除 designStrategies：可能影响 buildRouteConcept 对 theme/season/transport 的 style 判定；但大量 profile 中是标签，逐条影响无法完全证明。★★☆☆☆
- 删除 plannerReason/coverageContribution：不会改变已生成路线内容。☆

### Route: 冰岛9天铁路旅程：雷克雅未克到黄金瀑布

- Route ID: `materialized-xnn4s2-59200`
- 抽样类别: Geographic
- 可证明来源类型: Materialized Template
- 国家: IS
- 目的地: 雷克雅未克 > 盖锡尔 > 瓦特纳冰川 > 黄金圈 > 黄金瀑布
- travelStyle: rail-journey
- durationBand / days: 7-10d / 9
- Feed: 无法证明进入当前 Feed ready pool

Decision Trace:

Step1
读取：
- knowledge-graph-pool.json: destination/country candidates, as proven by provenance.source=knowledge-graph-pool or contentEvidence.materialized
- profile/travelStyle=rail-journey: proven by travelStyle/travelStyleConceptKey/contentEvidence.travelMode
- countryCodes=IS
- destinationEntities=雷克雅未克 > 盖锡尔 > 瓦特纳冰川 > 黄金圈 > 黄金瀑布
- bestMonths=4-10月
- designStrategies=Geographic+Transport+Theme
- distance calculation / routePassesPlannerRules: proven by materialize-route-pool.mjs, but per-route rejected alternatives are not persisted

↓

Step2
过滤：
- disabledCountries 包含 CN；plausibleCountries 要求国家组合在 regionGroups 中；routePassesPlannerRules 要求 concept validation、距离完整、maxSegment/span 不超限。

↓

Step3
候选国家：
- 可证明保存结果：IS
- 生成前完整候选国家池：Unknown（accepted route 未保存被扫描/被删除候选列表）。

↓

Step4
为什么保留这些国家：
- 因为这些 destinationEntities 的 countryCode 通过 disabledCountries、plausibleCountries、距离与 concept rules；具体竞争候选 Unknown。

↓

Step5
为什么删除其它国家：
- Unknown。当前 accepted route 没有保存 rejected alternatives；只能从代码知道可能原因包括 CN block、region 不合理、距离超限、pool 为空、dedupe 太近、cluster 饱和。

↓

Step6
为什么生成当前标题：
- route title：makeRoute 模板读取 titleCountry + days + styleLabelZh + first/last destination，生成当前标题。

↓

Step7
为什么生成当前主题：
- profile/theme + buildRouteConcept 生成 travelStyle=rail-journey；themes=铁路旅程。

↓

Step8
为什么生成当前简介：
- route summary：makeRoute 固定模板读取 styleLabelZh 和前 3 个目的地，模板化风险最高。

↓

Step9
为什么进入 Accepted：
- 保存状态：contentQualityStatus=accepted, repositoryStatus=mediaReady, sourceType=planner-designed
- 可证明原因：materialize-route-pool 在 makeRoute 后调用 validateRouteContent(record).accepted 才 addCandidate；accepted repository 已保存本条。

↓

Step10
为什么进入 Feed（如果进入）：
- 未进入或无法证明进入 Feed：没有通过当前报告可验证的 feedReady + onlineCoverAsset 国家匹配。

真正改变路线结果的输入：
- 国家组合：由 destinations 的 countryCode 集合直接决定为 IS；plausibleCountries/CN block 可过滤，但被删国家候选 Unknown。
- 城市/景点：由 knowledge-graph-pool 候选或 coverageFallbackPlaces 形成 destinationEntities=雷克雅未克 > 盖锡尔 > 瓦特纳冰川 > 黄金圈 > 黄金瀑布。
- 天数：由 buildRouteConcept 得到 recommendedDays，再由 concreteDaysFor(hash(profile, destinations, serial)) 固化为 9。
- travelStyle：由 context/profile + buildRouteConcept 决定；保存为 rail-journey。
- route title：makeRoute 模板读取 titleCountry + days + styleLabelZh + first/last destination，生成当前标题。
- route summary：makeRoute 固定模板读取 styleLabelZh 和前 3 个目的地，模板化风险最高。

最后补上的标签/非决策字段：
- plannerReason：在路线骨架/concept 后写入；不证明它改变了国家、城市或天数。
- coverageContribution：由生成后的 country/destination 数量汇总；不是生成前输入。
- contentEvidence.provider/evidenceHash：主要是来源/缓存/溯源；一般不改变本条路线内容。
- designStrategies：来自 profile.strategies，更多是 profile 标签；在部分 concept validation 中被读取，但不能逐条证明改变了候选池。

删除输入后的影响判断：
- 删除 country/destinationEntities：会改变国家组合、标题、summary，或无法生成路线。★★★★★
- 删除 travelStyle/profile：会改变 concept、styleLabel、天数推导、标题主题。★★★★★
- 删除 bestMonths：会改变 bestMonths 展示；是否改变路线主体仅 seasonal/profile 可证明，普通路线无法证明。★★☆☆☆
- 删除 designStrategies：可能影响 buildRouteConcept 对 theme/season/transport 的 style 判定；但大量 profile 中是标签，逐条影响无法完全证明。★★☆☆☆
- 删除 plannerReason/coverageContribution：不会改变已生成路线内容。☆


## Theme

### Route: 四国八十八所巡礼

- Route ID: `wikivoyage-27`
- 抽样类别: Theme
- 可证明来源类型: Unknown
- 国家: JP
- 目的地: 阿波市 > 高知市 > 松山市 > 鸣门市 > 大阪市
- travelStyle: Unknown
- durationBand / days: Unknown / 50
- Feed: 可证明进入当前 Feed ready pool 的候选

Decision Trace:

Step1
读取：
- Unknown: route source does not preserve enough pre-generation context.

↓

Step2
过滤：
- Unknown

↓

Step3
候选国家：
- 可证明保存结果：JP
- 生成前完整候选国家池：Unknown（accepted route 未保存被扫描/被删除候选列表）。

↓

Step4
为什么保留这些国家：
- Unknown

↓

Step5
为什么删除其它国家：
- Unknown。当前 accepted route 没有保存 rejected alternatives；只能从代码知道可能原因包括 CN block、region 不合理、距离超限、pool 为空、dedupe 太近、cluster 饱和。

↓

Step6
为什么生成当前标题：
- Unknown

↓

Step7
为什么生成当前主题：
- buildRouteConcept/context.theme/travelStyle 生成主题；themes=寺庙巡礼。

↓

Step8
为什么生成当前简介：
- Unknown

↓

Step9
为什么进入 Accepted：
- 保存状态：contentQualityStatus=accepted, repositoryStatus=accepted, sourceType=source-original
- 可证明原因：Unknown

↓

Step10
为什么进入 Feed（如果进入）：
- 进入 Feed 的可证明原因：accepted repository 中存在 feedReady onlineCoverAsset，imageCountryCodes 与路线国家有交集；Feed 还会受当前 cursor/random/quality 排序影响。

真正改变路线结果的输入：
- Unknown: 无法证明哪些输入改变了路线结果。

最后补上的标签/非决策字段：
- plannerReason：在路线骨架/concept 后写入；不证明它改变了国家、城市或天数。
- coverageContribution：由生成后的 country/destination 数量汇总；不是生成前输入。
- contentEvidence.provider/evidenceHash：主要是来源/缓存/溯源；一般不改变本条路线内容。
- designStrategies：可能参与 concept/validator，但 saved field 本身是输出记录；删除保存字段通常不改变已生成路线。

删除输入后的影响判断：
- Unknown

### Route: 黑山、意大利8天经典首访：黑山地方生活区到佛罗伦萨

- Route ID: `materialized-rf6zj9-42983`
- 抽样类别: Theme
- 可证明来源类型: Materialized Template
- 国家: ME + IT
- 目的地: 黑山地方生活区 > 黑山文化停留区 > 那不勒斯 > 佛罗伦萨
- travelStyle: classic-first-trip
- durationBand / days: 7-10d / 8
- Feed: 可证明进入当前 Feed ready pool 的候选

Decision Trace:

Step1
读取：
- knowledge-graph-pool.json: destination/country candidates, as proven by provenance.source=knowledge-graph-pool or contentEvidence.materialized
- profile/travelStyle=classic-first-trip: proven by travelStyle/travelStyleConceptKey/contentEvidence.travelMode
- countryCodes=ME+IT
- destinationEntities=黑山地方生活区 > 黑山文化停留区 > 那不勒斯 > 佛罗伦萨
- bestMonths=5-9月
- designStrategies=Geographic+Regional+Theme+Transport
- distance calculation / routePassesPlannerRules: proven by materialize-route-pool.mjs, but per-route rejected alternatives are not persisted

↓

Step2
过滤：
- disabledCountries 包含 CN；plausibleCountries 要求国家组合在 regionGroups 中；routePassesPlannerRules 要求 concept validation、距离完整、maxSegment/span 不超限。

↓

Step3
候选国家：
- 可证明保存结果：ME + IT
- 生成前完整候选国家池：Unknown（accepted route 未保存被扫描/被删除候选列表）。

↓

Step4
为什么保留这些国家：
- 因为这些 destinationEntities 的 countryCode 通过 disabledCountries、plausibleCountries、距离与 concept rules；具体竞争候选 Unknown。

↓

Step5
为什么删除其它国家：
- Unknown。当前 accepted route 没有保存 rejected alternatives；只能从代码知道可能原因包括 CN block、region 不合理、距离超限、pool 为空、dedupe 太近、cluster 饱和。

↓

Step6
为什么生成当前标题：
- route title：makeRoute 模板读取 titleCountry + days + styleLabelZh + first/last destination，生成当前标题。

↓

Step7
为什么生成当前主题：
- profile/theme + buildRouteConcept 生成 travelStyle=classic-first-trip；themes=经典首访。

↓

Step8
为什么生成当前简介：
- route summary：makeRoute 固定模板读取 styleLabelZh 和前 3 个目的地，模板化风险最高。

↓

Step9
为什么进入 Accepted：
- 保存状态：contentQualityStatus=accepted, repositoryStatus=mediaReady, sourceType=planner-designed
- 可证明原因：materialize-route-pool 在 makeRoute 后调用 validateRouteContent(record).accepted 才 addCandidate；accepted repository 已保存本条。

↓

Step10
为什么进入 Feed（如果进入）：
- 进入 Feed 的可证明原因：accepted repository 中存在 feedReady onlineCoverAsset，imageCountryCodes 与路线国家有交集；Feed 还会受当前 cursor/random/quality 排序影响。

真正改变路线结果的输入：
- 国家组合：由 destinations 的 countryCode 集合直接决定为 ME+IT；plausibleCountries/CN block 可过滤，但被删国家候选 Unknown。
- 城市/景点：由 knowledge-graph-pool 候选或 coverageFallbackPlaces 形成 destinationEntities=黑山地方生活区 > 黑山文化停留区 > 那不勒斯 > 佛罗伦萨。
- 天数：由 buildRouteConcept 得到 recommendedDays，再由 concreteDaysFor(hash(profile, destinations, serial)) 固化为 8。
- travelStyle：由 context/profile + buildRouteConcept 决定；保存为 classic-first-trip。
- route title：makeRoute 模板读取 titleCountry + days + styleLabelZh + first/last destination，生成当前标题。
- route summary：makeRoute 固定模板读取 styleLabelZh 和前 3 个目的地，模板化风险最高。

最后补上的标签/非决策字段：
- plannerReason：在路线骨架/concept 后写入；不证明它改变了国家、城市或天数。
- coverageContribution：由生成后的 country/destination 数量汇总；不是生成前输入。
- contentEvidence.provider/evidenceHash：主要是来源/缓存/溯源；一般不改变本条路线内容。
- designStrategies：来自 profile.strategies，更多是 profile 标签；在部分 concept validation 中被读取，但不能逐条证明改变了候选池。

删除输入后的影响判断：
- 删除 country/destinationEntities：会改变国家组合、标题、summary，或无法生成路线。★★★★★
- 删除 travelStyle/profile：会改变 concept、styleLabel、天数推导、标题主题。★★★★★
- 删除 bestMonths：会改变 bestMonths 展示；是否改变路线主体仅 seasonal/profile 可证明，普通路线无法证明。★★☆☆☆
- 删除 designStrategies：可能影响 buildRouteConcept 对 theme/season/transport 的 style 判定；但大量 profile 中是标签，逐条影响无法完全证明。★★☆☆☆
- 删除 plannerReason/coverageContribution：不会改变已生成路线内容。☆

### Route: 科特迪瓦、加纳7天经典首访：科特迪瓦文化停留区到加纳文化停留区

- Route ID: `materialized-1tmgsni-45407`
- 抽样类别: Theme
- 可证明来源类型: Materialized Template
- 国家: CI + GH
- 目的地: 科特迪瓦文化停留区 > 科特迪瓦历史城区 > 加纳地方生活区 > 加纳文化停留区
- travelStyle: classic-first-trip
- durationBand / days: 7-10d / 7
- Feed: 无法证明进入当前 Feed ready pool

Decision Trace:

Step1
读取：
- knowledge-graph-pool.json: destination/country candidates, as proven by provenance.source=knowledge-graph-pool or contentEvidence.materialized
- profile/travelStyle=classic-first-trip: proven by travelStyle/travelStyleConceptKey/contentEvidence.travelMode
- countryCodes=CI+GH
- destinationEntities=科特迪瓦文化停留区 > 科特迪瓦历史城区 > 加纳地方生活区 > 加纳文化停留区
- bestMonths=5-9月
- designStrategies=Geographic+Regional+Theme+Transport
- distance calculation / routePassesPlannerRules: proven by materialize-route-pool.mjs, but per-route rejected alternatives are not persisted

↓

Step2
过滤：
- disabledCountries 包含 CN；plausibleCountries 要求国家组合在 regionGroups 中；routePassesPlannerRules 要求 concept validation、距离完整、maxSegment/span 不超限。

↓

Step3
候选国家：
- 可证明保存结果：CI + GH
- 生成前完整候选国家池：Unknown（accepted route 未保存被扫描/被删除候选列表）。

↓

Step4
为什么保留这些国家：
- 因为这些 destinationEntities 的 countryCode 通过 disabledCountries、plausibleCountries、距离与 concept rules；具体竞争候选 Unknown。

↓

Step5
为什么删除其它国家：
- Unknown。当前 accepted route 没有保存 rejected alternatives；只能从代码知道可能原因包括 CN block、region 不合理、距离超限、pool 为空、dedupe 太近、cluster 饱和。

↓

Step6
为什么生成当前标题：
- route title：makeRoute 模板读取 titleCountry + days + styleLabelZh + first/last destination，生成当前标题。

↓

Step7
为什么生成当前主题：
- profile/theme + buildRouteConcept 生成 travelStyle=classic-first-trip；themes=经典首访。

↓

Step8
为什么生成当前简介：
- route summary：makeRoute 固定模板读取 styleLabelZh 和前 3 个目的地，模板化风险最高。

↓

Step9
为什么进入 Accepted：
- 保存状态：contentQualityStatus=accepted, repositoryStatus=mediaReady, sourceType=planner-designed
- 可证明原因：materialize-route-pool 在 makeRoute 后调用 validateRouteContent(record).accepted 才 addCandidate；accepted repository 已保存本条。

↓

Step10
为什么进入 Feed（如果进入）：
- 未进入或无法证明进入 Feed：没有通过当前报告可验证的 feedReady + onlineCoverAsset 国家匹配。

真正改变路线结果的输入：
- 国家组合：由 destinations 的 countryCode 集合直接决定为 CI+GH；plausibleCountries/CN block 可过滤，但被删国家候选 Unknown。
- 城市/景点：由 knowledge-graph-pool 候选或 coverageFallbackPlaces 形成 destinationEntities=科特迪瓦文化停留区 > 科特迪瓦历史城区 > 加纳地方生活区 > 加纳文化停留区。
- 天数：由 buildRouteConcept 得到 recommendedDays，再由 concreteDaysFor(hash(profile, destinations, serial)) 固化为 7。
- travelStyle：由 context/profile + buildRouteConcept 决定；保存为 classic-first-trip。
- route title：makeRoute 模板读取 titleCountry + days + styleLabelZh + first/last destination，生成当前标题。
- route summary：makeRoute 固定模板读取 styleLabelZh 和前 3 个目的地，模板化风险最高。

最后补上的标签/非决策字段：
- plannerReason：在路线骨架/concept 后写入；不证明它改变了国家、城市或天数。
- coverageContribution：由生成后的 country/destination 数量汇总；不是生成前输入。
- contentEvidence.provider/evidenceHash：主要是来源/缓存/溯源；一般不改变本条路线内容。
- designStrategies：来自 profile.strategies，更多是 profile 标签；在部分 concept validation 中被读取，但不能逐条证明改变了候选池。

删除输入后的影响判断：
- 删除 country/destinationEntities：会改变国家组合、标题、summary，或无法生成路线。★★★★★
- 删除 travelStyle/profile：会改变 concept、styleLabel、天数推导、标题主题。★★★★★
- 删除 bestMonths：会改变 bestMonths 展示；是否改变路线主体仅 seasonal/profile 可证明，普通路线无法证明。★★☆☆☆
- 删除 designStrategies：可能影响 buildRouteConcept 对 theme/season/transport 的 style 判定；但大量 profile 中是标签，逐条影响无法完全证明。★★☆☆☆
- 删除 plannerReason/coverageContribution：不会改变已生成路线内容。☆

### Route: 波黑、黑山5天交通线旅程：波黑历史城区到黑山文化停留区

- Route ID: `materialized-zjcktv-46854`
- 抽样类别: Theme
- 可证明来源类型: Materialized Template
- 国家: BA + ME
- 目的地: 波黑历史城区 > 波黑地方生活区 > 黑山文化停留区
- travelStyle: transport-journey
- durationBand / days: 4-6d / 5
- Feed: 无法证明进入当前 Feed ready pool

Decision Trace:

Step1
读取：
- knowledge-graph-pool.json: destination/country candidates, as proven by provenance.source=knowledge-graph-pool or contentEvidence.materialized
- profile/travelStyle=transport-journey: proven by travelStyle/travelStyleConceptKey/contentEvidence.travelMode
- countryCodes=BA+ME
- destinationEntities=波黑历史城区 > 波黑地方生活区 > 黑山文化停留区
- bestMonths=4-10月
- designStrategies=Geographic+Transport+Theme
- distance calculation / routePassesPlannerRules: proven by materialize-route-pool.mjs, but per-route rejected alternatives are not persisted

↓

Step2
过滤：
- disabledCountries 包含 CN；plausibleCountries 要求国家组合在 regionGroups 中；routePassesPlannerRules 要求 concept validation、距离完整、maxSegment/span 不超限。

↓

Step3
候选国家：
- 可证明保存结果：BA + ME
- 生成前完整候选国家池：Unknown（accepted route 未保存被扫描/被删除候选列表）。

↓

Step4
为什么保留这些国家：
- 因为这些 destinationEntities 的 countryCode 通过 disabledCountries、plausibleCountries、距离与 concept rules；具体竞争候选 Unknown。

↓

Step5
为什么删除其它国家：
- Unknown。当前 accepted route 没有保存 rejected alternatives；只能从代码知道可能原因包括 CN block、region 不合理、距离超限、pool 为空、dedupe 太近、cluster 饱和。

↓

Step6
为什么生成当前标题：
- route title：makeRoute 模板读取 titleCountry + days + styleLabelZh + first/last destination，生成当前标题。

↓

Step7
为什么生成当前主题：
- profile/theme + buildRouteConcept 生成 travelStyle=transport-journey；themes=交通线旅程。

↓

Step8
为什么生成当前简介：
- route summary：makeRoute 固定模板读取 styleLabelZh 和前 3 个目的地，模板化风险最高。

↓

Step9
为什么进入 Accepted：
- 保存状态：contentQualityStatus=accepted, repositoryStatus=mediaReady, sourceType=planner-designed
- 可证明原因：materialize-route-pool 在 makeRoute 后调用 validateRouteContent(record).accepted 才 addCandidate；accepted repository 已保存本条。

↓

Step10
为什么进入 Feed（如果进入）：
- 未进入或无法证明进入 Feed：没有通过当前报告可验证的 feedReady + onlineCoverAsset 国家匹配。

真正改变路线结果的输入：
- 国家组合：由 destinations 的 countryCode 集合直接决定为 BA+ME；plausibleCountries/CN block 可过滤，但被删国家候选 Unknown。
- 城市/景点：由 knowledge-graph-pool 候选或 coverageFallbackPlaces 形成 destinationEntities=波黑历史城区 > 波黑地方生活区 > 黑山文化停留区。
- 天数：由 buildRouteConcept 得到 recommendedDays，再由 concreteDaysFor(hash(profile, destinations, serial)) 固化为 5。
- travelStyle：由 context/profile + buildRouteConcept 决定；保存为 transport-journey。
- route title：makeRoute 模板读取 titleCountry + days + styleLabelZh + first/last destination，生成当前标题。
- route summary：makeRoute 固定模板读取 styleLabelZh 和前 3 个目的地，模板化风险最高。

最后补上的标签/非决策字段：
- plannerReason：在路线骨架/concept 后写入；不证明它改变了国家、城市或天数。
- coverageContribution：由生成后的 country/destination 数量汇总；不是生成前输入。
- contentEvidence.provider/evidenceHash：主要是来源/缓存/溯源；一般不改变本条路线内容。
- designStrategies：来自 profile.strategies，更多是 profile 标签；在部分 concept validation 中被读取，但不能逐条证明改变了候选池。

删除输入后的影响判断：
- 删除 country/destinationEntities：会改变国家组合、标题、summary，或无法生成路线。★★★★★
- 删除 travelStyle/profile：会改变 concept、styleLabel、天数推导、标题主题。★★★★★
- 删除 bestMonths：会改变 bestMonths 展示；是否改变路线主体仅 seasonal/profile 可证明，普通路线无法证明。★★☆☆☆
- 删除 designStrategies：可能影响 buildRouteConcept 对 theme/season/transport 的 style 判定；但大量 profile 中是标签，逐条影响无法完全证明。★★☆☆☆
- 删除 plannerReason/coverageContribution：不会改变已生成路线内容。☆

### Route: 阿尔巴尼亚5天公路自驾：阿尔巴尼亚历史城区到阿尔巴尼亚地方生活区

- Route ID: `materialized-94xxeg-47228`
- 抽样类别: Theme
- 可证明来源类型: Materialized Template
- 国家: AL
- 目的地: 阿尔巴尼亚历史城区 > 阿尔巴尼亚自然腹地 > 阿尔巴尼亚地方生活区
- travelStyle: road-trip
- durationBand / days: 4-6d / 5
- Feed: 无法证明进入当前 Feed ready pool

Decision Trace:

Step1
读取：
- knowledge-graph-pool.json: destination/country candidates, as proven by provenance.source=knowledge-graph-pool or contentEvidence.materialized
- profile/travelStyle=road-trip: proven by travelStyle/travelStyleConceptKey/contentEvidence.travelMode
- countryCodes=AL
- destinationEntities=阿尔巴尼亚历史城区 > 阿尔巴尼亚自然腹地 > 阿尔巴尼亚地方生活区
- bestMonths=5-9月
- designStrategies=Geographic+Transport+Theme
- distance calculation / routePassesPlannerRules: proven by materialize-route-pool.mjs, but per-route rejected alternatives are not persisted

↓

Step2
过滤：
- disabledCountries 包含 CN；plausibleCountries 要求国家组合在 regionGroups 中；routePassesPlannerRules 要求 concept validation、距离完整、maxSegment/span 不超限。

↓

Step3
候选国家：
- 可证明保存结果：AL
- 生成前完整候选国家池：Unknown（accepted route 未保存被扫描/被删除候选列表）。

↓

Step4
为什么保留这些国家：
- 因为这些 destinationEntities 的 countryCode 通过 disabledCountries、plausibleCountries、距离与 concept rules；具体竞争候选 Unknown。

↓

Step5
为什么删除其它国家：
- Unknown。当前 accepted route 没有保存 rejected alternatives；只能从代码知道可能原因包括 CN block、region 不合理、距离超限、pool 为空、dedupe 太近、cluster 饱和。

↓

Step6
为什么生成当前标题：
- route title：makeRoute 模板读取 titleCountry + days + styleLabelZh + first/last destination，生成当前标题。

↓

Step7
为什么生成当前主题：
- profile/theme + buildRouteConcept 生成 travelStyle=road-trip；themes=公路自驾。

↓

Step8
为什么生成当前简介：
- route summary：makeRoute 固定模板读取 styleLabelZh 和前 3 个目的地，模板化风险最高。

↓

Step9
为什么进入 Accepted：
- 保存状态：contentQualityStatus=accepted, repositoryStatus=mediaReady, sourceType=planner-designed
- 可证明原因：materialize-route-pool 在 makeRoute 后调用 validateRouteContent(record).accepted 才 addCandidate；accepted repository 已保存本条。

↓

Step10
为什么进入 Feed（如果进入）：
- 未进入或无法证明进入 Feed：没有通过当前报告可验证的 feedReady + onlineCoverAsset 国家匹配。

真正改变路线结果的输入：
- 国家组合：由 destinations 的 countryCode 集合直接决定为 AL；plausibleCountries/CN block 可过滤，但被删国家候选 Unknown。
- 城市/景点：由 knowledge-graph-pool 候选或 coverageFallbackPlaces 形成 destinationEntities=阿尔巴尼亚历史城区 > 阿尔巴尼亚自然腹地 > 阿尔巴尼亚地方生活区。
- 天数：由 buildRouteConcept 得到 recommendedDays，再由 concreteDaysFor(hash(profile, destinations, serial)) 固化为 5。
- travelStyle：由 context/profile + buildRouteConcept 决定；保存为 road-trip。
- route title：makeRoute 模板读取 titleCountry + days + styleLabelZh + first/last destination，生成当前标题。
- route summary：makeRoute 固定模板读取 styleLabelZh 和前 3 个目的地，模板化风险最高。

最后补上的标签/非决策字段：
- plannerReason：在路线骨架/concept 后写入；不证明它改变了国家、城市或天数。
- coverageContribution：由生成后的 country/destination 数量汇总；不是生成前输入。
- contentEvidence.provider/evidenceHash：主要是来源/缓存/溯源；一般不改变本条路线内容。
- designStrategies：来自 profile.strategies，更多是 profile 标签；在部分 concept validation 中被读取，但不能逐条证明改变了候选池。

删除输入后的影响判断：
- 删除 country/destinationEntities：会改变国家组合、标题、summary，或无法生成路线。★★★★★
- 删除 travelStyle/profile：会改变 concept、styleLabel、天数推导、标题主题。★★★★★
- 删除 bestMonths：会改变 bestMonths 展示；是否改变路线主体仅 seasonal/profile 可证明，普通路线无法证明。★★☆☆☆
- 删除 designStrategies：可能影响 buildRouteConcept 对 theme/season/transport 的 style 判定；但大量 profile 中是标签，逐条影响无法完全证明。★★☆☆☆
- 删除 plannerReason/coverageContribution：不会改变已生成路线内容。☆

### Route: 哈萨克斯坦5天公路自驾：哈萨克斯坦自然腹地到哈萨克斯坦区域风景带

- Route ID: `materialized-1c99l5s-47508`
- 抽样类别: Theme
- 可证明来源类型: Materialized Template
- 国家: KZ
- 目的地: 哈萨克斯坦自然腹地 > 哈萨克斯坦地方生活区 > 哈萨克斯坦区域风景带
- travelStyle: road-trip
- durationBand / days: 4-6d / 5
- Feed: 无法证明进入当前 Feed ready pool

Decision Trace:

Step1
读取：
- knowledge-graph-pool.json: destination/country candidates, as proven by provenance.source=knowledge-graph-pool or contentEvidence.materialized
- profile/travelStyle=road-trip: proven by travelStyle/travelStyleConceptKey/contentEvidence.travelMode
- countryCodes=KZ
- destinationEntities=哈萨克斯坦自然腹地 > 哈萨克斯坦地方生活区 > 哈萨克斯坦区域风景带
- bestMonths=5-9月
- designStrategies=Geographic+Transport+Theme
- distance calculation / routePassesPlannerRules: proven by materialize-route-pool.mjs, but per-route rejected alternatives are not persisted

↓

Step2
过滤：
- disabledCountries 包含 CN；plausibleCountries 要求国家组合在 regionGroups 中；routePassesPlannerRules 要求 concept validation、距离完整、maxSegment/span 不超限。

↓

Step3
候选国家：
- 可证明保存结果：KZ
- 生成前完整候选国家池：Unknown（accepted route 未保存被扫描/被删除候选列表）。

↓

Step4
为什么保留这些国家：
- 因为这些 destinationEntities 的 countryCode 通过 disabledCountries、plausibleCountries、距离与 concept rules；具体竞争候选 Unknown。

↓

Step5
为什么删除其它国家：
- Unknown。当前 accepted route 没有保存 rejected alternatives；只能从代码知道可能原因包括 CN block、region 不合理、距离超限、pool 为空、dedupe 太近、cluster 饱和。

↓

Step6
为什么生成当前标题：
- route title：makeRoute 模板读取 titleCountry + days + styleLabelZh + first/last destination，生成当前标题。

↓

Step7
为什么生成当前主题：
- profile/theme + buildRouteConcept 生成 travelStyle=road-trip；themes=公路自驾。

↓

Step8
为什么生成当前简介：
- route summary：makeRoute 固定模板读取 styleLabelZh 和前 3 个目的地，模板化风险最高。

↓

Step9
为什么进入 Accepted：
- 保存状态：contentQualityStatus=accepted, repositoryStatus=mediaReady, sourceType=planner-designed
- 可证明原因：materialize-route-pool 在 makeRoute 后调用 validateRouteContent(record).accepted 才 addCandidate；accepted repository 已保存本条。

↓

Step10
为什么进入 Feed（如果进入）：
- 未进入或无法证明进入 Feed：没有通过当前报告可验证的 feedReady + onlineCoverAsset 国家匹配。

真正改变路线结果的输入：
- 国家组合：由 destinations 的 countryCode 集合直接决定为 KZ；plausibleCountries/CN block 可过滤，但被删国家候选 Unknown。
- 城市/景点：由 knowledge-graph-pool 候选或 coverageFallbackPlaces 形成 destinationEntities=哈萨克斯坦自然腹地 > 哈萨克斯坦地方生活区 > 哈萨克斯坦区域风景带。
- 天数：由 buildRouteConcept 得到 recommendedDays，再由 concreteDaysFor(hash(profile, destinations, serial)) 固化为 5。
- travelStyle：由 context/profile + buildRouteConcept 决定；保存为 road-trip。
- route title：makeRoute 模板读取 titleCountry + days + styleLabelZh + first/last destination，生成当前标题。
- route summary：makeRoute 固定模板读取 styleLabelZh 和前 3 个目的地，模板化风险最高。

最后补上的标签/非决策字段：
- plannerReason：在路线骨架/concept 后写入；不证明它改变了国家、城市或天数。
- coverageContribution：由生成后的 country/destination 数量汇总；不是生成前输入。
- contentEvidence.provider/evidenceHash：主要是来源/缓存/溯源；一般不改变本条路线内容。
- designStrategies：来自 profile.strategies，更多是 profile 标签；在部分 concept validation 中被读取，但不能逐条证明改变了候选池。

删除输入后的影响判断：
- 删除 country/destinationEntities：会改变国家组合、标题、summary，或无法生成路线。★★★★★
- 删除 travelStyle/profile：会改变 concept、styleLabel、天数推导、标题主题。★★★★★
- 删除 bestMonths：会改变 bestMonths 展示；是否改变路线主体仅 seasonal/profile 可证明，普通路线无法证明。★★☆☆☆
- 删除 designStrategies：可能影响 buildRouteConcept 对 theme/season/transport 的 style 判定；但大量 profile 中是标签，逐条影响无法完全证明。★★☆☆☆
- 删除 plannerReason/coverageContribution：不会改变已生成路线内容。☆

### Route: 汤加5天经典首访：汤加地方生活区到汤加文化停留区

- Route ID: `materialized-ex4yn0-47805`
- 抽样类别: Theme
- 可证明来源类型: Materialized Template
- 国家: TO
- 目的地: 汤加地方生活区 > 汤加区域风景带 > 汤加文化停留区
- travelStyle: classic-first-trip
- durationBand / days: 4-6d / 5
- Feed: 无法证明进入当前 Feed ready pool

Decision Trace:

Step1
读取：
- knowledge-graph-pool.json: destination/country candidates, as proven by provenance.source=knowledge-graph-pool or contentEvidence.materialized
- profile/travelStyle=classic-first-trip: proven by travelStyle/travelStyleConceptKey/contentEvidence.travelMode
- countryCodes=TO
- destinationEntities=汤加地方生活区 > 汤加区域风景带 > 汤加文化停留区
- bestMonths=4-10月
- designStrategies=Geographic+Theme+Transport
- distance calculation / routePassesPlannerRules: proven by materialize-route-pool.mjs, but per-route rejected alternatives are not persisted

↓

Step2
过滤：
- disabledCountries 包含 CN；plausibleCountries 要求国家组合在 regionGroups 中；routePassesPlannerRules 要求 concept validation、距离完整、maxSegment/span 不超限。

↓

Step3
候选国家：
- 可证明保存结果：TO
- 生成前完整候选国家池：Unknown（accepted route 未保存被扫描/被删除候选列表）。

↓

Step4
为什么保留这些国家：
- 因为这些 destinationEntities 的 countryCode 通过 disabledCountries、plausibleCountries、距离与 concept rules；具体竞争候选 Unknown。

↓

Step5
为什么删除其它国家：
- Unknown。当前 accepted route 没有保存 rejected alternatives；只能从代码知道可能原因包括 CN block、region 不合理、距离超限、pool 为空、dedupe 太近、cluster 饱和。

↓

Step6
为什么生成当前标题：
- route title：makeRoute 模板读取 titleCountry + days + styleLabelZh + first/last destination，生成当前标题。

↓

Step7
为什么生成当前主题：
- profile/theme + buildRouteConcept 生成 travelStyle=classic-first-trip；themes=经典首访。

↓

Step8
为什么生成当前简介：
- route summary：makeRoute 固定模板读取 styleLabelZh 和前 3 个目的地，模板化风险最高。

↓

Step9
为什么进入 Accepted：
- 保存状态：contentQualityStatus=accepted, repositoryStatus=mediaReady, sourceType=planner-designed
- 可证明原因：materialize-route-pool 在 makeRoute 后调用 validateRouteContent(record).accepted 才 addCandidate；accepted repository 已保存本条。

↓

Step10
为什么进入 Feed（如果进入）：
- 未进入或无法证明进入 Feed：没有通过当前报告可验证的 feedReady + onlineCoverAsset 国家匹配。

真正改变路线结果的输入：
- 国家组合：由 destinations 的 countryCode 集合直接决定为 TO；plausibleCountries/CN block 可过滤，但被删国家候选 Unknown。
- 城市/景点：由 knowledge-graph-pool 候选或 coverageFallbackPlaces 形成 destinationEntities=汤加地方生活区 > 汤加区域风景带 > 汤加文化停留区。
- 天数：由 buildRouteConcept 得到 recommendedDays，再由 concreteDaysFor(hash(profile, destinations, serial)) 固化为 5。
- travelStyle：由 context/profile + buildRouteConcept 决定；保存为 classic-first-trip。
- route title：makeRoute 模板读取 titleCountry + days + styleLabelZh + first/last destination，生成当前标题。
- route summary：makeRoute 固定模板读取 styleLabelZh 和前 3 个目的地，模板化风险最高。

最后补上的标签/非决策字段：
- plannerReason：在路线骨架/concept 后写入；不证明它改变了国家、城市或天数。
- coverageContribution：由生成后的 country/destination 数量汇总；不是生成前输入。
- contentEvidence.provider/evidenceHash：主要是来源/缓存/溯源；一般不改变本条路线内容。
- designStrategies：来自 profile.strategies，更多是 profile 标签；在部分 concept validation 中被读取，但不能逐条证明改变了候选池。

删除输入后的影响判断：
- 删除 country/destinationEntities：会改变国家组合、标题、summary，或无法生成路线。★★★★★
- 删除 travelStyle/profile：会改变 concept、styleLabel、天数推导、标题主题。★★★★★
- 删除 bestMonths：会改变 bestMonths 展示；是否改变路线主体仅 seasonal/profile 可证明，普通路线无法证明。★★☆☆☆
- 删除 designStrategies：可能影响 buildRouteConcept 对 theme/season/transport 的 style 判定；但大量 profile 中是标签，逐条影响无法完全证明。★★☆☆☆
- 删除 plannerReason/coverageContribution：不会改变已生成路线内容。☆

### Route: 西班牙5天经典首访：西班牙文化停留区到西班牙历史城区

- Route ID: `materialized-1k3oyf8-48114`
- 抽样类别: Theme
- 可证明来源类型: Materialized Template
- 国家: ES
- 目的地: 西班牙文化停留区 > 西班牙门户城市 > 西班牙历史城区
- travelStyle: classic-first-trip
- durationBand / days: 4-6d / 5
- Feed: 无法证明进入当前 Feed ready pool

Decision Trace:

Step1
读取：
- knowledge-graph-pool.json: destination/country candidates, as proven by provenance.source=knowledge-graph-pool or contentEvidence.materialized
- profile/travelStyle=classic-first-trip: proven by travelStyle/travelStyleConceptKey/contentEvidence.travelMode
- countryCodes=ES
- destinationEntities=西班牙文化停留区 > 西班牙门户城市 > 西班牙历史城区
- bestMonths=4-10月
- designStrategies=Geographic+Theme+Transport
- distance calculation / routePassesPlannerRules: proven by materialize-route-pool.mjs, but per-route rejected alternatives are not persisted

↓

Step2
过滤：
- disabledCountries 包含 CN；plausibleCountries 要求国家组合在 regionGroups 中；routePassesPlannerRules 要求 concept validation、距离完整、maxSegment/span 不超限。

↓

Step3
候选国家：
- 可证明保存结果：ES
- 生成前完整候选国家池：Unknown（accepted route 未保存被扫描/被删除候选列表）。

↓

Step4
为什么保留这些国家：
- 因为这些 destinationEntities 的 countryCode 通过 disabledCountries、plausibleCountries、距离与 concept rules；具体竞争候选 Unknown。

↓

Step5
为什么删除其它国家：
- Unknown。当前 accepted route 没有保存 rejected alternatives；只能从代码知道可能原因包括 CN block、region 不合理、距离超限、pool 为空、dedupe 太近、cluster 饱和。

↓

Step6
为什么生成当前标题：
- route title：makeRoute 模板读取 titleCountry + days + styleLabelZh + first/last destination，生成当前标题。

↓

Step7
为什么生成当前主题：
- profile/theme + buildRouteConcept 生成 travelStyle=classic-first-trip；themes=经典首访。

↓

Step8
为什么生成当前简介：
- route summary：makeRoute 固定模板读取 styleLabelZh 和前 3 个目的地，模板化风险最高。

↓

Step9
为什么进入 Accepted：
- 保存状态：contentQualityStatus=accepted, repositoryStatus=mediaReady, sourceType=planner-designed
- 可证明原因：materialize-route-pool 在 makeRoute 后调用 validateRouteContent(record).accepted 才 addCandidate；accepted repository 已保存本条。

↓

Step10
为什么进入 Feed（如果进入）：
- 未进入或无法证明进入 Feed：没有通过当前报告可验证的 feedReady + onlineCoverAsset 国家匹配。

真正改变路线结果的输入：
- 国家组合：由 destinations 的 countryCode 集合直接决定为 ES；plausibleCountries/CN block 可过滤，但被删国家候选 Unknown。
- 城市/景点：由 knowledge-graph-pool 候选或 coverageFallbackPlaces 形成 destinationEntities=西班牙文化停留区 > 西班牙门户城市 > 西班牙历史城区。
- 天数：由 buildRouteConcept 得到 recommendedDays，再由 concreteDaysFor(hash(profile, destinations, serial)) 固化为 5。
- travelStyle：由 context/profile + buildRouteConcept 决定；保存为 classic-first-trip。
- route title：makeRoute 模板读取 titleCountry + days + styleLabelZh + first/last destination，生成当前标题。
- route summary：makeRoute 固定模板读取 styleLabelZh 和前 3 个目的地，模板化风险最高。

最后补上的标签/非决策字段：
- plannerReason：在路线骨架/concept 后写入；不证明它改变了国家、城市或天数。
- coverageContribution：由生成后的 country/destination 数量汇总；不是生成前输入。
- contentEvidence.provider/evidenceHash：主要是来源/缓存/溯源；一般不改变本条路线内容。
- designStrategies：来自 profile.strategies，更多是 profile 标签；在部分 concept validation 中被读取，但不能逐条证明改变了候选池。

删除输入后的影响判断：
- 删除 country/destinationEntities：会改变国家组合、标题、summary，或无法生成路线。★★★★★
- 删除 travelStyle/profile：会改变 concept、styleLabel、天数推导、标题主题。★★★★★
- 删除 bestMonths：会改变 bestMonths 展示；是否改变路线主体仅 seasonal/profile 可证明，普通路线无法证明。★★☆☆☆
- 删除 designStrategies：可能影响 buildRouteConcept 对 theme/season/transport 的 style 判定；但大量 profile 中是标签，逐条影响无法完全证明。★★☆☆☆
- 删除 plannerReason/coverageContribution：不会改变已生成路线内容。☆

### Route: 葡萄牙5天经典首访：葡萄牙门户城市到葡萄牙区域风景带

- Route ID: `materialized-2tpdib-48407`
- 抽样类别: Theme
- 可证明来源类型: Materialized Template
- 国家: PT
- 目的地: 葡萄牙门户城市 > 葡萄牙自然腹地 > 葡萄牙区域风景带
- travelStyle: classic-first-trip
- durationBand / days: 4-6d / 5
- Feed: 无法证明进入当前 Feed ready pool

Decision Trace:

Step1
读取：
- knowledge-graph-pool.json: destination/country candidates, as proven by provenance.source=knowledge-graph-pool or contentEvidence.materialized
- profile/travelStyle=classic-first-trip: proven by travelStyle/travelStyleConceptKey/contentEvidence.travelMode
- countryCodes=PT
- destinationEntities=葡萄牙门户城市 > 葡萄牙自然腹地 > 葡萄牙区域风景带
- bestMonths=4-10月
- designStrategies=Geographic+Theme+Transport
- distance calculation / routePassesPlannerRules: proven by materialize-route-pool.mjs, but per-route rejected alternatives are not persisted

↓

Step2
过滤：
- disabledCountries 包含 CN；plausibleCountries 要求国家组合在 regionGroups 中；routePassesPlannerRules 要求 concept validation、距离完整、maxSegment/span 不超限。

↓

Step3
候选国家：
- 可证明保存结果：PT
- 生成前完整候选国家池：Unknown（accepted route 未保存被扫描/被删除候选列表）。

↓

Step4
为什么保留这些国家：
- 因为这些 destinationEntities 的 countryCode 通过 disabledCountries、plausibleCountries、距离与 concept rules；具体竞争候选 Unknown。

↓

Step5
为什么删除其它国家：
- Unknown。当前 accepted route 没有保存 rejected alternatives；只能从代码知道可能原因包括 CN block、region 不合理、距离超限、pool 为空、dedupe 太近、cluster 饱和。

↓

Step6
为什么生成当前标题：
- route title：makeRoute 模板读取 titleCountry + days + styleLabelZh + first/last destination，生成当前标题。

↓

Step7
为什么生成当前主题：
- profile/theme + buildRouteConcept 生成 travelStyle=classic-first-trip；themes=经典首访。

↓

Step8
为什么生成当前简介：
- route summary：makeRoute 固定模板读取 styleLabelZh 和前 3 个目的地，模板化风险最高。

↓

Step9
为什么进入 Accepted：
- 保存状态：contentQualityStatus=accepted, repositoryStatus=mediaReady, sourceType=planner-designed
- 可证明原因：materialize-route-pool 在 makeRoute 后调用 validateRouteContent(record).accepted 才 addCandidate；accepted repository 已保存本条。

↓

Step10
为什么进入 Feed（如果进入）：
- 未进入或无法证明进入 Feed：没有通过当前报告可验证的 feedReady + onlineCoverAsset 国家匹配。

真正改变路线结果的输入：
- 国家组合：由 destinations 的 countryCode 集合直接决定为 PT；plausibleCountries/CN block 可过滤，但被删国家候选 Unknown。
- 城市/景点：由 knowledge-graph-pool 候选或 coverageFallbackPlaces 形成 destinationEntities=葡萄牙门户城市 > 葡萄牙自然腹地 > 葡萄牙区域风景带。
- 天数：由 buildRouteConcept 得到 recommendedDays，再由 concreteDaysFor(hash(profile, destinations, serial)) 固化为 5。
- travelStyle：由 context/profile + buildRouteConcept 决定；保存为 classic-first-trip。
- route title：makeRoute 模板读取 titleCountry + days + styleLabelZh + first/last destination，生成当前标题。
- route summary：makeRoute 固定模板读取 styleLabelZh 和前 3 个目的地，模板化风险最高。

最后补上的标签/非决策字段：
- plannerReason：在路线骨架/concept 后写入；不证明它改变了国家、城市或天数。
- coverageContribution：由生成后的 country/destination 数量汇总；不是生成前输入。
- contentEvidence.provider/evidenceHash：主要是来源/缓存/溯源；一般不改变本条路线内容。
- designStrategies：来自 profile.strategies，更多是 profile 标签；在部分 concept validation 中被读取，但不能逐条证明改变了候选池。

删除输入后的影响判断：
- 删除 country/destinationEntities：会改变国家组合、标题、summary，或无法生成路线。★★★★★
- 删除 travelStyle/profile：会改变 concept、styleLabel、天数推导、标题主题。★★★★★
- 删除 bestMonths：会改变 bestMonths 展示；是否改变路线主体仅 seasonal/profile 可证明，普通路线无法证明。★★☆☆☆
- 删除 designStrategies：可能影响 buildRouteConcept 对 theme/season/transport 的 style 判定；但大量 profile 中是标签，逐条影响无法完全证明。★★☆☆☆
- 删除 plannerReason/coverageContribution：不会改变已生成路线内容。☆

### Route: 贝宁7天经典首访：贝宁门户城市到贝宁地方生活区

- Route ID: `materialized-897ckw-49023`
- 抽样类别: Theme
- 可证明来源类型: Materialized Template
- 国家: BJ
- 目的地: 贝宁门户城市 > 贝宁历史城区 > 贝宁自然腹地 > 贝宁地方生活区
- travelStyle: classic-first-trip
- durationBand / days: 7-10d / 7
- Feed: 无法证明进入当前 Feed ready pool

Decision Trace:

Step1
读取：
- knowledge-graph-pool.json: destination/country candidates, as proven by provenance.source=knowledge-graph-pool or contentEvidence.materialized
- profile/travelStyle=classic-first-trip: proven by travelStyle/travelStyleConceptKey/contentEvidence.travelMode
- countryCodes=BJ
- destinationEntities=贝宁门户城市 > 贝宁历史城区 > 贝宁自然腹地 > 贝宁地方生活区
- bestMonths=4-10月
- designStrategies=Geographic+Theme+Transport
- distance calculation / routePassesPlannerRules: proven by materialize-route-pool.mjs, but per-route rejected alternatives are not persisted

↓

Step2
过滤：
- disabledCountries 包含 CN；plausibleCountries 要求国家组合在 regionGroups 中；routePassesPlannerRules 要求 concept validation、距离完整、maxSegment/span 不超限。

↓

Step3
候选国家：
- 可证明保存结果：BJ
- 生成前完整候选国家池：Unknown（accepted route 未保存被扫描/被删除候选列表）。

↓

Step4
为什么保留这些国家：
- 因为这些 destinationEntities 的 countryCode 通过 disabledCountries、plausibleCountries、距离与 concept rules；具体竞争候选 Unknown。

↓

Step5
为什么删除其它国家：
- Unknown。当前 accepted route 没有保存 rejected alternatives；只能从代码知道可能原因包括 CN block、region 不合理、距离超限、pool 为空、dedupe 太近、cluster 饱和。

↓

Step6
为什么生成当前标题：
- route title：makeRoute 模板读取 titleCountry + days + styleLabelZh + first/last destination，生成当前标题。

↓

Step7
为什么生成当前主题：
- profile/theme + buildRouteConcept 生成 travelStyle=classic-first-trip；themes=经典首访。

↓

Step8
为什么生成当前简介：
- route summary：makeRoute 固定模板读取 styleLabelZh 和前 3 个目的地，模板化风险最高。

↓

Step9
为什么进入 Accepted：
- 保存状态：contentQualityStatus=accepted, repositoryStatus=mediaReady, sourceType=planner-designed
- 可证明原因：materialize-route-pool 在 makeRoute 后调用 validateRouteContent(record).accepted 才 addCandidate；accepted repository 已保存本条。

↓

Step10
为什么进入 Feed（如果进入）：
- 未进入或无法证明进入 Feed：没有通过当前报告可验证的 feedReady + onlineCoverAsset 国家匹配。

真正改变路线结果的输入：
- 国家组合：由 destinations 的 countryCode 集合直接决定为 BJ；plausibleCountries/CN block 可过滤，但被删国家候选 Unknown。
- 城市/景点：由 knowledge-graph-pool 候选或 coverageFallbackPlaces 形成 destinationEntities=贝宁门户城市 > 贝宁历史城区 > 贝宁自然腹地 > 贝宁地方生活区。
- 天数：由 buildRouteConcept 得到 recommendedDays，再由 concreteDaysFor(hash(profile, destinations, serial)) 固化为 7。
- travelStyle：由 context/profile + buildRouteConcept 决定；保存为 classic-first-trip。
- route title：makeRoute 模板读取 titleCountry + days + styleLabelZh + first/last destination，生成当前标题。
- route summary：makeRoute 固定模板读取 styleLabelZh 和前 3 个目的地，模板化风险最高。

最后补上的标签/非决策字段：
- plannerReason：在路线骨架/concept 后写入；不证明它改变了国家、城市或天数。
- coverageContribution：由生成后的 country/destination 数量汇总；不是生成前输入。
- contentEvidence.provider/evidenceHash：主要是来源/缓存/溯源；一般不改变本条路线内容。
- designStrategies：来自 profile.strategies，更多是 profile 标签；在部分 concept validation 中被读取，但不能逐条证明改变了候选池。

删除输入后的影响判断：
- 删除 country/destinationEntities：会改变国家组合、标题、summary，或无法生成路线。★★★★★
- 删除 travelStyle/profile：会改变 concept、styleLabel、天数推导、标题主题。★★★★★
- 删除 bestMonths：会改变 bestMonths 展示；是否改变路线主体仅 seasonal/profile 可证明，普通路线无法证明。★★☆☆☆
- 删除 designStrategies：可能影响 buildRouteConcept 对 theme/season/transport 的 style 判定；但大量 profile 中是标签，逐条影响无法完全证明。★★☆☆☆
- 删除 plannerReason/coverageContribution：不会改变已生成路线内容。☆

### Route: 马达加斯加8天公路自驾：马达加斯加历史城区到马达加斯加区域风景带

- Route ID: `materialized-1kvc2yc-51882`
- 抽样类别: Theme
- 可证明来源类型: Materialized Template
- 国家: MG
- 目的地: 马达加斯加历史城区 > 马达加斯加自然腹地 > 马达加斯加地方生活区 > 马达加斯加区域风景带
- travelStyle: road-trip
- durationBand / days: 7-10d / 8
- Feed: 无法证明进入当前 Feed ready pool

Decision Trace:

Step1
读取：
- knowledge-graph-pool.json: destination/country candidates, as proven by provenance.source=knowledge-graph-pool or contentEvidence.materialized
- profile/travelStyle=road-trip: proven by travelStyle/travelStyleConceptKey/contentEvidence.travelMode
- countryCodes=MG
- destinationEntities=马达加斯加历史城区 > 马达加斯加自然腹地 > 马达加斯加地方生活区 > 马达加斯加区域风景带
- bestMonths=5-9月
- designStrategies=Geographic+Transport+Theme
- distance calculation / routePassesPlannerRules: proven by materialize-route-pool.mjs, but per-route rejected alternatives are not persisted

↓

Step2
过滤：
- disabledCountries 包含 CN；plausibleCountries 要求国家组合在 regionGroups 中；routePassesPlannerRules 要求 concept validation、距离完整、maxSegment/span 不超限。

↓

Step3
候选国家：
- 可证明保存结果：MG
- 生成前完整候选国家池：Unknown（accepted route 未保存被扫描/被删除候选列表）。

↓

Step4
为什么保留这些国家：
- 因为这些 destinationEntities 的 countryCode 通过 disabledCountries、plausibleCountries、距离与 concept rules；具体竞争候选 Unknown。

↓

Step5
为什么删除其它国家：
- Unknown。当前 accepted route 没有保存 rejected alternatives；只能从代码知道可能原因包括 CN block、region 不合理、距离超限、pool 为空、dedupe 太近、cluster 饱和。

↓

Step6
为什么生成当前标题：
- route title：makeRoute 模板读取 titleCountry + days + styleLabelZh + first/last destination，生成当前标题。

↓

Step7
为什么生成当前主题：
- profile/theme + buildRouteConcept 生成 travelStyle=road-trip；themes=公路自驾。

↓

Step8
为什么生成当前简介：
- route summary：makeRoute 固定模板读取 styleLabelZh 和前 3 个目的地，模板化风险最高。

↓

Step9
为什么进入 Accepted：
- 保存状态：contentQualityStatus=accepted, repositoryStatus=mediaReady, sourceType=planner-designed
- 可证明原因：materialize-route-pool 在 makeRoute 后调用 validateRouteContent(record).accepted 才 addCandidate；accepted repository 已保存本条。

↓

Step10
为什么进入 Feed（如果进入）：
- 未进入或无法证明进入 Feed：没有通过当前报告可验证的 feedReady + onlineCoverAsset 国家匹配。

真正改变路线结果的输入：
- 国家组合：由 destinations 的 countryCode 集合直接决定为 MG；plausibleCountries/CN block 可过滤，但被删国家候选 Unknown。
- 城市/景点：由 knowledge-graph-pool 候选或 coverageFallbackPlaces 形成 destinationEntities=马达加斯加历史城区 > 马达加斯加自然腹地 > 马达加斯加地方生活区 > 马达加斯加区域风景带。
- 天数：由 buildRouteConcept 得到 recommendedDays，再由 concreteDaysFor(hash(profile, destinations, serial)) 固化为 8。
- travelStyle：由 context/profile + buildRouteConcept 决定；保存为 road-trip。
- route title：makeRoute 模板读取 titleCountry + days + styleLabelZh + first/last destination，生成当前标题。
- route summary：makeRoute 固定模板读取 styleLabelZh 和前 3 个目的地，模板化风险最高。

最后补上的标签/非决策字段：
- plannerReason：在路线骨架/concept 后写入；不证明它改变了国家、城市或天数。
- coverageContribution：由生成后的 country/destination 数量汇总；不是生成前输入。
- contentEvidence.provider/evidenceHash：主要是来源/缓存/溯源；一般不改变本条路线内容。
- designStrategies：来自 profile.strategies，更多是 profile 标签；在部分 concept validation 中被读取，但不能逐条证明改变了候选池。

删除输入后的影响判断：
- 删除 country/destinationEntities：会改变国家组合、标题、summary，或无法生成路线。★★★★★
- 删除 travelStyle/profile：会改变 concept、styleLabel、天数推导、标题主题。★★★★★
- 删除 bestMonths：会改变 bestMonths 展示；是否改变路线主体仅 seasonal/profile 可证明，普通路线无法证明。★★☆☆☆
- 删除 designStrategies：可能影响 buildRouteConcept 对 theme/season/transport 的 style 判定；但大量 profile 中是标签，逐条影响无法完全证明。★★☆☆☆
- 删除 plannerReason/coverageContribution：不会改变已生成路线内容。☆

### Route: 津巴布韦8天经典首访：津巴布韦自然腹地到津巴布韦文化停留区

- Route ID: `materialized-kniztk-52170`
- 抽样类别: Theme
- 可证明来源类型: Materialized Template
- 国家: ZW
- 目的地: 津巴布韦自然腹地 > 津巴布韦地方生活区 > 津巴布韦区域风景带 > 津巴布韦文化停留区
- travelStyle: classic-first-trip
- durationBand / days: 7-10d / 8
- Feed: 无法证明进入当前 Feed ready pool

Decision Trace:

Step1
读取：
- knowledge-graph-pool.json: destination/country candidates, as proven by provenance.source=knowledge-graph-pool or contentEvidence.materialized
- profile/travelStyle=classic-first-trip: proven by travelStyle/travelStyleConceptKey/contentEvidence.travelMode
- countryCodes=ZW
- destinationEntities=津巴布韦自然腹地 > 津巴布韦地方生活区 > 津巴布韦区域风景带 > 津巴布韦文化停留区
- bestMonths=3-5月
- designStrategies=Geographic+Season+Theme+Transport
- distance calculation / routePassesPlannerRules: proven by materialize-route-pool.mjs, but per-route rejected alternatives are not persisted

↓

Step2
过滤：
- disabledCountries 包含 CN；plausibleCountries 要求国家组合在 regionGroups 中；routePassesPlannerRules 要求 concept validation、距离完整、maxSegment/span 不超限。

↓

Step3
候选国家：
- 可证明保存结果：ZW
- 生成前完整候选国家池：Unknown（accepted route 未保存被扫描/被删除候选列表）。

↓

Step4
为什么保留这些国家：
- 因为这些 destinationEntities 的 countryCode 通过 disabledCountries、plausibleCountries、距离与 concept rules；具体竞争候选 Unknown。

↓

Step5
为什么删除其它国家：
- Unknown。当前 accepted route 没有保存 rejected alternatives；只能从代码知道可能原因包括 CN block、region 不合理、距离超限、pool 为空、dedupe 太近、cluster 饱和。

↓

Step6
为什么生成当前标题：
- route title：makeRoute 模板读取 titleCountry + days + styleLabelZh + first/last destination，生成当前标题。

↓

Step7
为什么生成当前主题：
- profile/theme + buildRouteConcept 生成 travelStyle=classic-first-trip；themes=经典首访。

↓

Step8
为什么生成当前简介：
- route summary：makeRoute 固定模板读取 styleLabelZh 和前 3 个目的地，模板化风险最高。

↓

Step9
为什么进入 Accepted：
- 保存状态：contentQualityStatus=accepted, repositoryStatus=mediaReady, sourceType=planner-designed
- 可证明原因：materialize-route-pool 在 makeRoute 后调用 validateRouteContent(record).accepted 才 addCandidate；accepted repository 已保存本条。

↓

Step10
为什么进入 Feed（如果进入）：
- 未进入或无法证明进入 Feed：没有通过当前报告可验证的 feedReady + onlineCoverAsset 国家匹配。

真正改变路线结果的输入：
- 国家组合：由 destinations 的 countryCode 集合直接决定为 ZW；plausibleCountries/CN block 可过滤，但被删国家候选 Unknown。
- 城市/景点：由 knowledge-graph-pool 候选或 coverageFallbackPlaces 形成 destinationEntities=津巴布韦自然腹地 > 津巴布韦地方生活区 > 津巴布韦区域风景带 > 津巴布韦文化停留区。
- 天数：由 buildRouteConcept 得到 recommendedDays，再由 concreteDaysFor(hash(profile, destinations, serial)) 固化为 8。
- travelStyle：由 context/profile + buildRouteConcept 决定；保存为 classic-first-trip。
- route title：makeRoute 模板读取 titleCountry + days + styleLabelZh + first/last destination，生成当前标题。
- route summary：makeRoute 固定模板读取 styleLabelZh 和前 3 个目的地，模板化风险最高。

最后补上的标签/非决策字段：
- plannerReason：在路线骨架/concept 后写入；不证明它改变了国家、城市或天数。
- coverageContribution：由生成后的 country/destination 数量汇总；不是生成前输入。
- contentEvidence.provider/evidenceHash：主要是来源/缓存/溯源；一般不改变本条路线内容。
- designStrategies：来自 profile.strategies，更多是 profile 标签；在部分 concept validation 中被读取，但不能逐条证明改变了候选池。

删除输入后的影响判断：
- 删除 country/destinationEntities：会改变国家组合、标题、summary，或无法生成路线。★★★★★
- 删除 travelStyle/profile：会改变 concept、styleLabel、天数推导、标题主题。★★★★★
- 删除 bestMonths：会改变 bestMonths 展示；是否改变路线主体仅 seasonal/profile 可证明，普通路线无法证明。★★☆☆☆
- 删除 designStrategies：可能影响 buildRouteConcept 对 theme/season/transport 的 style 判定；但大量 profile 中是标签，逐条影响无法完全证明。★★☆☆☆
- 删除 plannerReason/coverageContribution：不会改变已生成路线内容。☆

### Route: 以色列7天经典首访：以色列区域风景带到以色列历史城区

- Route ID: `materialized-1wyq2p-52524`
- 抽样类别: Theme
- 可证明来源类型: Materialized Template
- 国家: IL
- 目的地: 以色列区域风景带 > 以色列文化停留区 > 以色列门户城市 > 以色列历史城区
- travelStyle: classic-first-trip
- durationBand / days: 7-10d / 7
- Feed: 无法证明进入当前 Feed ready pool

Decision Trace:

Step1
读取：
- knowledge-graph-pool.json: destination/country candidates, as proven by provenance.source=knowledge-graph-pool or contentEvidence.materialized
- profile/travelStyle=classic-first-trip: proven by travelStyle/travelStyleConceptKey/contentEvidence.travelMode
- countryCodes=IL
- destinationEntities=以色列区域风景带 > 以色列文化停留区 > 以色列门户城市 > 以色列历史城区
- bestMonths=5-9月
- designStrategies=Geographic+Regional+Theme+Transport
- distance calculation / routePassesPlannerRules: proven by materialize-route-pool.mjs, but per-route rejected alternatives are not persisted

↓

Step2
过滤：
- disabledCountries 包含 CN；plausibleCountries 要求国家组合在 regionGroups 中；routePassesPlannerRules 要求 concept validation、距离完整、maxSegment/span 不超限。

↓

Step3
候选国家：
- 可证明保存结果：IL
- 生成前完整候选国家池：Unknown（accepted route 未保存被扫描/被删除候选列表）。

↓

Step4
为什么保留这些国家：
- 因为这些 destinationEntities 的 countryCode 通过 disabledCountries、plausibleCountries、距离与 concept rules；具体竞争候选 Unknown。

↓

Step5
为什么删除其它国家：
- Unknown。当前 accepted route 没有保存 rejected alternatives；只能从代码知道可能原因包括 CN block、region 不合理、距离超限、pool 为空、dedupe 太近、cluster 饱和。

↓

Step6
为什么生成当前标题：
- route title：makeRoute 模板读取 titleCountry + days + styleLabelZh + first/last destination，生成当前标题。

↓

Step7
为什么生成当前主题：
- profile/theme + buildRouteConcept 生成 travelStyle=classic-first-trip；themes=经典首访。

↓

Step8
为什么生成当前简介：
- route summary：makeRoute 固定模板读取 styleLabelZh 和前 3 个目的地，模板化风险最高。

↓

Step9
为什么进入 Accepted：
- 保存状态：contentQualityStatus=accepted, repositoryStatus=mediaReady, sourceType=planner-designed
- 可证明原因：materialize-route-pool 在 makeRoute 后调用 validateRouteContent(record).accepted 才 addCandidate；accepted repository 已保存本条。

↓

Step10
为什么进入 Feed（如果进入）：
- 未进入或无法证明进入 Feed：没有通过当前报告可验证的 feedReady + onlineCoverAsset 国家匹配。

真正改变路线结果的输入：
- 国家组合：由 destinations 的 countryCode 集合直接决定为 IL；plausibleCountries/CN block 可过滤，但被删国家候选 Unknown。
- 城市/景点：由 knowledge-graph-pool 候选或 coverageFallbackPlaces 形成 destinationEntities=以色列区域风景带 > 以色列文化停留区 > 以色列门户城市 > 以色列历史城区。
- 天数：由 buildRouteConcept 得到 recommendedDays，再由 concreteDaysFor(hash(profile, destinations, serial)) 固化为 7。
- travelStyle：由 context/profile + buildRouteConcept 决定；保存为 classic-first-trip。
- route title：makeRoute 模板读取 titleCountry + days + styleLabelZh + first/last destination，生成当前标题。
- route summary：makeRoute 固定模板读取 styleLabelZh 和前 3 个目的地，模板化风险最高。

最后补上的标签/非决策字段：
- plannerReason：在路线骨架/concept 后写入；不证明它改变了国家、城市或天数。
- coverageContribution：由生成后的 country/destination 数量汇总；不是生成前输入。
- contentEvidence.provider/evidenceHash：主要是来源/缓存/溯源；一般不改变本条路线内容。
- designStrategies：来自 profile.strategies，更多是 profile 标签；在部分 concept validation 中被读取，但不能逐条证明改变了候选池。

删除输入后的影响判断：
- 删除 country/destinationEntities：会改变国家组合、标题、summary，或无法生成路线。★★★★★
- 删除 travelStyle/profile：会改变 concept、styleLabel、天数推导、标题主题。★★★★★
- 删除 bestMonths：会改变 bestMonths 展示；是否改变路线主体仅 seasonal/profile 可证明，普通路线无法证明。★★☆☆☆
- 删除 designStrategies：可能影响 buildRouteConcept 对 theme/season/transport 的 style 判定；但大量 profile 中是标签，逐条影响无法完全证明。★★☆☆☆
- 删除 plannerReason/coverageContribution：不会改变已生成路线内容。☆

### Route: 南苏丹7天经典首访：南苏丹文化停留区到南苏丹自然腹地

- Route ID: `materialized-4ll63-52804`
- 抽样类别: Theme
- 可证明来源类型: Materialized Template
- 国家: SS
- 目的地: 南苏丹文化停留区 > 南苏丹门户城市 > 南苏丹历史城区 > 南苏丹自然腹地
- travelStyle: classic-first-trip
- durationBand / days: 7-10d / 7
- Feed: 无法证明进入当前 Feed ready pool

Decision Trace:

Step1
读取：
- knowledge-graph-pool.json: destination/country candidates, as proven by provenance.source=knowledge-graph-pool or contentEvidence.materialized
- profile/travelStyle=classic-first-trip: proven by travelStyle/travelStyleConceptKey/contentEvidence.travelMode
- countryCodes=SS
- destinationEntities=南苏丹文化停留区 > 南苏丹门户城市 > 南苏丹历史城区 > 南苏丹自然腹地
- bestMonths=5-9月
- designStrategies=Geographic+Regional+Theme+Transport
- distance calculation / routePassesPlannerRules: proven by materialize-route-pool.mjs, but per-route rejected alternatives are not persisted

↓

Step2
过滤：
- disabledCountries 包含 CN；plausibleCountries 要求国家组合在 regionGroups 中；routePassesPlannerRules 要求 concept validation、距离完整、maxSegment/span 不超限。

↓

Step3
候选国家：
- 可证明保存结果：SS
- 生成前完整候选国家池：Unknown（accepted route 未保存被扫描/被删除候选列表）。

↓

Step4
为什么保留这些国家：
- 因为这些 destinationEntities 的 countryCode 通过 disabledCountries、plausibleCountries、距离与 concept rules；具体竞争候选 Unknown。

↓

Step5
为什么删除其它国家：
- Unknown。当前 accepted route 没有保存 rejected alternatives；只能从代码知道可能原因包括 CN block、region 不合理、距离超限、pool 为空、dedupe 太近、cluster 饱和。

↓

Step6
为什么生成当前标题：
- route title：makeRoute 模板读取 titleCountry + days + styleLabelZh + first/last destination，生成当前标题。

↓

Step7
为什么生成当前主题：
- profile/theme + buildRouteConcept 生成 travelStyle=classic-first-trip；themes=经典首访。

↓

Step8
为什么生成当前简介：
- route summary：makeRoute 固定模板读取 styleLabelZh 和前 3 个目的地，模板化风险最高。

↓

Step9
为什么进入 Accepted：
- 保存状态：contentQualityStatus=accepted, repositoryStatus=mediaReady, sourceType=planner-designed
- 可证明原因：materialize-route-pool 在 makeRoute 后调用 validateRouteContent(record).accepted 才 addCandidate；accepted repository 已保存本条。

↓

Step10
为什么进入 Feed（如果进入）：
- 未进入或无法证明进入 Feed：没有通过当前报告可验证的 feedReady + onlineCoverAsset 国家匹配。

真正改变路线结果的输入：
- 国家组合：由 destinations 的 countryCode 集合直接决定为 SS；plausibleCountries/CN block 可过滤，但被删国家候选 Unknown。
- 城市/景点：由 knowledge-graph-pool 候选或 coverageFallbackPlaces 形成 destinationEntities=南苏丹文化停留区 > 南苏丹门户城市 > 南苏丹历史城区 > 南苏丹自然腹地。
- 天数：由 buildRouteConcept 得到 recommendedDays，再由 concreteDaysFor(hash(profile, destinations, serial)) 固化为 7。
- travelStyle：由 context/profile + buildRouteConcept 决定；保存为 classic-first-trip。
- route title：makeRoute 模板读取 titleCountry + days + styleLabelZh + first/last destination，生成当前标题。
- route summary：makeRoute 固定模板读取 styleLabelZh 和前 3 个目的地，模板化风险最高。

最后补上的标签/非决策字段：
- plannerReason：在路线骨架/concept 后写入；不证明它改变了国家、城市或天数。
- coverageContribution：由生成后的 country/destination 数量汇总；不是生成前输入。
- contentEvidence.provider/evidenceHash：主要是来源/缓存/溯源；一般不改变本条路线内容。
- designStrategies：来自 profile.strategies，更多是 profile 标签；在部分 concept validation 中被读取，但不能逐条证明改变了候选池。

删除输入后的影响判断：
- 删除 country/destinationEntities：会改变国家组合、标题、summary，或无法生成路线。★★★★★
- 删除 travelStyle/profile：会改变 concept、styleLabel、天数推导、标题主题。★★★★★
- 删除 bestMonths：会改变 bestMonths 展示；是否改变路线主体仅 seasonal/profile 可证明，普通路线无法证明。★★☆☆☆
- 删除 designStrategies：可能影响 buildRouteConcept 对 theme/season/transport 的 style 判定；但大量 profile 中是标签，逐条影响无法完全证明。★★☆☆☆
- 删除 plannerReason/coverageContribution：不会改变已生成路线内容。☆

### Route: 吉布提10天经典首访：吉布提历史城区到吉布提文化停留区

- Route ID: `materialized-inpi4p-54209`
- 抽样类别: Theme
- 可证明来源类型: Materialized Template
- 国家: DJ
- 目的地: 吉布提历史城区 > 吉布提自然腹地 > 吉布提地方生活区 > 吉布提区域风景带 > 吉布提文化停留区
- travelStyle: classic-first-trip
- durationBand / days: 7-10d / 10
- Feed: 无法证明进入当前 Feed ready pool

Decision Trace:

Step1
读取：
- knowledge-graph-pool.json: destination/country candidates, as proven by provenance.source=knowledge-graph-pool or contentEvidence.materialized
- profile/travelStyle=classic-first-trip: proven by travelStyle/travelStyleConceptKey/contentEvidence.travelMode
- countryCodes=DJ
- destinationEntities=吉布提历史城区 > 吉布提自然腹地 > 吉布提地方生活区 > 吉布提区域风景带 > 吉布提文化停留区
- bestMonths=4-10月
- designStrategies=Geographic+Theme+Transport
- distance calculation / routePassesPlannerRules: proven by materialize-route-pool.mjs, but per-route rejected alternatives are not persisted

↓

Step2
过滤：
- disabledCountries 包含 CN；plausibleCountries 要求国家组合在 regionGroups 中；routePassesPlannerRules 要求 concept validation、距离完整、maxSegment/span 不超限。

↓

Step3
候选国家：
- 可证明保存结果：DJ
- 生成前完整候选国家池：Unknown（accepted route 未保存被扫描/被删除候选列表）。

↓

Step4
为什么保留这些国家：
- 因为这些 destinationEntities 的 countryCode 通过 disabledCountries、plausibleCountries、距离与 concept rules；具体竞争候选 Unknown。

↓

Step5
为什么删除其它国家：
- Unknown。当前 accepted route 没有保存 rejected alternatives；只能从代码知道可能原因包括 CN block、region 不合理、距离超限、pool 为空、dedupe 太近、cluster 饱和。

↓

Step6
为什么生成当前标题：
- route title：makeRoute 模板读取 titleCountry + days + styleLabelZh + first/last destination，生成当前标题。

↓

Step7
为什么生成当前主题：
- profile/theme + buildRouteConcept 生成 travelStyle=classic-first-trip；themes=经典首访。

↓

Step8
为什么生成当前简介：
- route summary：makeRoute 固定模板读取 styleLabelZh 和前 3 个目的地，模板化风险最高。

↓

Step9
为什么进入 Accepted：
- 保存状态：contentQualityStatus=accepted, repositoryStatus=mediaReady, sourceType=planner-designed
- 可证明原因：materialize-route-pool 在 makeRoute 后调用 validateRouteContent(record).accepted 才 addCandidate；accepted repository 已保存本条。

↓

Step10
为什么进入 Feed（如果进入）：
- 未进入或无法证明进入 Feed：没有通过当前报告可验证的 feedReady + onlineCoverAsset 国家匹配。

真正改变路线结果的输入：
- 国家组合：由 destinations 的 countryCode 集合直接决定为 DJ；plausibleCountries/CN block 可过滤，但被删国家候选 Unknown。
- 城市/景点：由 knowledge-graph-pool 候选或 coverageFallbackPlaces 形成 destinationEntities=吉布提历史城区 > 吉布提自然腹地 > 吉布提地方生活区 > 吉布提区域风景带 > 吉布提文化停留区。
- 天数：由 buildRouteConcept 得到 recommendedDays，再由 concreteDaysFor(hash(profile, destinations, serial)) 固化为 10。
- travelStyle：由 context/profile + buildRouteConcept 决定；保存为 classic-first-trip。
- route title：makeRoute 模板读取 titleCountry + days + styleLabelZh + first/last destination，生成当前标题。
- route summary：makeRoute 固定模板读取 styleLabelZh 和前 3 个目的地，模板化风险最高。

最后补上的标签/非决策字段：
- plannerReason：在路线骨架/concept 后写入；不证明它改变了国家、城市或天数。
- coverageContribution：由生成后的 country/destination 数量汇总；不是生成前输入。
- contentEvidence.provider/evidenceHash：主要是来源/缓存/溯源；一般不改变本条路线内容。
- designStrategies：来自 profile.strategies，更多是 profile 标签；在部分 concept validation 中被读取，但不能逐条证明改变了候选池。

删除输入后的影响判断：
- 删除 country/destinationEntities：会改变国家组合、标题、summary，或无法生成路线。★★★★★
- 删除 travelStyle/profile：会改变 concept、styleLabel、天数推导、标题主题。★★★★★
- 删除 bestMonths：会改变 bestMonths 展示；是否改变路线主体仅 seasonal/profile 可证明，普通路线无法证明。★★☆☆☆
- 删除 designStrategies：可能影响 buildRouteConcept 对 theme/season/transport 的 style 判定；但大量 profile 中是标签，逐条影响无法完全证明。★★☆☆☆
- 删除 plannerReason/coverageContribution：不会改变已生成路线内容。☆

### Route: 阿曼8天主题游：阿曼自然腹地到阿曼门户城市

- Route ID: `materialized-1ikdmdc-54487`
- 抽样类别: Theme
- 可证明来源类型: Materialized Template
- 国家: OM
- 目的地: 阿曼自然腹地 > 阿曼地方生活区 > 阿曼区域风景带 > 阿曼文化停留区 > 阿曼门户城市
- travelStyle: theme
- durationBand / days: 7-10d / 8
- Feed: 无法证明进入当前 Feed ready pool

Decision Trace:

Step1
读取：
- knowledge-graph-pool.json: destination/country candidates, as proven by provenance.source=knowledge-graph-pool or contentEvidence.materialized
- profile/travelStyle=theme: proven by travelStyle/travelStyleConceptKey/contentEvidence.travelMode
- countryCodes=OM
- destinationEntities=阿曼自然腹地 > 阿曼地方生活区 > 阿曼区域风景带 > 阿曼文化停留区 > 阿曼门户城市
- bestMonths=9-11月
- designStrategies=Geographic+Theme+Transport
- distance calculation / routePassesPlannerRules: proven by materialize-route-pool.mjs, but per-route rejected alternatives are not persisted

↓

Step2
过滤：
- disabledCountries 包含 CN；plausibleCountries 要求国家组合在 regionGroups 中；routePassesPlannerRules 要求 concept validation、距离完整、maxSegment/span 不超限。

↓

Step3
候选国家：
- 可证明保存结果：OM
- 生成前完整候选国家池：Unknown（accepted route 未保存被扫描/被删除候选列表）。

↓

Step4
为什么保留这些国家：
- 因为这些 destinationEntities 的 countryCode 通过 disabledCountries、plausibleCountries、距离与 concept rules；具体竞争候选 Unknown。

↓

Step5
为什么删除其它国家：
- Unknown。当前 accepted route 没有保存 rejected alternatives；只能从代码知道可能原因包括 CN block、region 不合理、距离超限、pool 为空、dedupe 太近、cluster 饱和。

↓

Step6
为什么生成当前标题：
- route title：makeRoute 模板读取 titleCountry + days + styleLabelZh + first/last destination，生成当前标题。

↓

Step7
为什么生成当前主题：
- profile/theme + buildRouteConcept 生成 travelStyle=theme；themes=主题游。

↓

Step8
为什么生成当前简介：
- route summary：makeRoute 固定模板读取 styleLabelZh 和前 3 个目的地，模板化风险最高。

↓

Step9
为什么进入 Accepted：
- 保存状态：contentQualityStatus=accepted, repositoryStatus=mediaReady, sourceType=planner-designed
- 可证明原因：materialize-route-pool 在 makeRoute 后调用 validateRouteContent(record).accepted 才 addCandidate；accepted repository 已保存本条。

↓

Step10
为什么进入 Feed（如果进入）：
- 未进入或无法证明进入 Feed：没有通过当前报告可验证的 feedReady + onlineCoverAsset 国家匹配。

真正改变路线结果的输入：
- 国家组合：由 destinations 的 countryCode 集合直接决定为 OM；plausibleCountries/CN block 可过滤，但被删国家候选 Unknown。
- 城市/景点：由 knowledge-graph-pool 候选或 coverageFallbackPlaces 形成 destinationEntities=阿曼自然腹地 > 阿曼地方生活区 > 阿曼区域风景带 > 阿曼文化停留区 > 阿曼门户城市。
- 天数：由 buildRouteConcept 得到 recommendedDays，再由 concreteDaysFor(hash(profile, destinations, serial)) 固化为 8。
- travelStyle：由 context/profile + buildRouteConcept 决定；保存为 theme。
- route title：makeRoute 模板读取 titleCountry + days + styleLabelZh + first/last destination，生成当前标题。
- route summary：makeRoute 固定模板读取 styleLabelZh 和前 3 个目的地，模板化风险最高。

最后补上的标签/非决策字段：
- plannerReason：在路线骨架/concept 后写入；不证明它改变了国家、城市或天数。
- coverageContribution：由生成后的 country/destination 数量汇总；不是生成前输入。
- contentEvidence.provider/evidenceHash：主要是来源/缓存/溯源；一般不改变本条路线内容。
- designStrategies：来自 profile.strategies，更多是 profile 标签；在部分 concept validation 中被读取，但不能逐条证明改变了候选池。

删除输入后的影响判断：
- 删除 country/destinationEntities：会改变国家组合、标题、summary，或无法生成路线。★★★★★
- 删除 travelStyle/profile：会改变 concept、styleLabel、天数推导、标题主题。★★★★★
- 删除 bestMonths：会改变 bestMonths 展示；是否改变路线主体仅 seasonal/profile 可证明，普通路线无法证明。★★☆☆☆
- 删除 designStrategies：可能影响 buildRouteConcept 对 theme/season/transport 的 style 判定；但大量 profile 中是标签，逐条影响无法完全证明。★★☆☆☆
- 删除 plannerReason/coverageContribution：不会改变已生成路线内容。☆

### Route: 孟加拉国10天主题游：孟加拉国区域风景带到孟加拉国自然腹地

- Route ID: `materialized-15hs613-54774`
- 抽样类别: Theme
- 可证明来源类型: Materialized Template
- 国家: BD
- 目的地: 孟加拉国区域风景带 > 孟加拉国文化停留区 > 孟加拉国门户城市 > 孟加拉国历史城区 > 孟加拉国自然腹地
- travelStyle: theme
- durationBand / days: 7-10d / 10
- Feed: 无法证明进入当前 Feed ready pool

Decision Trace:

Step1
读取：
- knowledge-graph-pool.json: destination/country candidates, as proven by provenance.source=knowledge-graph-pool or contentEvidence.materialized
- profile/travelStyle=theme: proven by travelStyle/travelStyleConceptKey/contentEvidence.travelMode
- countryCodes=BD
- destinationEntities=孟加拉国区域风景带 > 孟加拉国文化停留区 > 孟加拉国门户城市 > 孟加拉国历史城区 > 孟加拉国自然腹地
- bestMonths=9-11月
- designStrategies=Geographic+Theme+Transport
- distance calculation / routePassesPlannerRules: proven by materialize-route-pool.mjs, but per-route rejected alternatives are not persisted

↓

Step2
过滤：
- disabledCountries 包含 CN；plausibleCountries 要求国家组合在 regionGroups 中；routePassesPlannerRules 要求 concept validation、距离完整、maxSegment/span 不超限。

↓

Step3
候选国家：
- 可证明保存结果：BD
- 生成前完整候选国家池：Unknown（accepted route 未保存被扫描/被删除候选列表）。

↓

Step4
为什么保留这些国家：
- 因为这些 destinationEntities 的 countryCode 通过 disabledCountries、plausibleCountries、距离与 concept rules；具体竞争候选 Unknown。

↓

Step5
为什么删除其它国家：
- Unknown。当前 accepted route 没有保存 rejected alternatives；只能从代码知道可能原因包括 CN block、region 不合理、距离超限、pool 为空、dedupe 太近、cluster 饱和。

↓

Step6
为什么生成当前标题：
- route title：makeRoute 模板读取 titleCountry + days + styleLabelZh + first/last destination，生成当前标题。

↓

Step7
为什么生成当前主题：
- profile/theme + buildRouteConcept 生成 travelStyle=theme；themes=主题游。

↓

Step8
为什么生成当前简介：
- route summary：makeRoute 固定模板读取 styleLabelZh 和前 3 个目的地，模板化风险最高。

↓

Step9
为什么进入 Accepted：
- 保存状态：contentQualityStatus=accepted, repositoryStatus=mediaReady, sourceType=planner-designed
- 可证明原因：materialize-route-pool 在 makeRoute 后调用 validateRouteContent(record).accepted 才 addCandidate；accepted repository 已保存本条。

↓

Step10
为什么进入 Feed（如果进入）：
- 未进入或无法证明进入 Feed：没有通过当前报告可验证的 feedReady + onlineCoverAsset 国家匹配。

真正改变路线结果的输入：
- 国家组合：由 destinations 的 countryCode 集合直接决定为 BD；plausibleCountries/CN block 可过滤，但被删国家候选 Unknown。
- 城市/景点：由 knowledge-graph-pool 候选或 coverageFallbackPlaces 形成 destinationEntities=孟加拉国区域风景带 > 孟加拉国文化停留区 > 孟加拉国门户城市 > 孟加拉国历史城区 > 孟加拉国自然腹地。
- 天数：由 buildRouteConcept 得到 recommendedDays，再由 concreteDaysFor(hash(profile, destinations, serial)) 固化为 10。
- travelStyle：由 context/profile + buildRouteConcept 决定；保存为 theme。
- route title：makeRoute 模板读取 titleCountry + days + styleLabelZh + first/last destination，生成当前标题。
- route summary：makeRoute 固定模板读取 styleLabelZh 和前 3 个目的地，模板化风险最高。

最后补上的标签/非决策字段：
- plannerReason：在路线骨架/concept 后写入；不证明它改变了国家、城市或天数。
- coverageContribution：由生成后的 country/destination 数量汇总；不是生成前输入。
- contentEvidence.provider/evidenceHash：主要是来源/缓存/溯源；一般不改变本条路线内容。
- designStrategies：来自 profile.strategies，更多是 profile 标签；在部分 concept validation 中被读取，但不能逐条证明改变了候选池。

删除输入后的影响判断：
- 删除 country/destinationEntities：会改变国家组合、标题、summary，或无法生成路线。★★★★★
- 删除 travelStyle/profile：会改变 concept、styleLabel、天数推导、标题主题。★★★★★
- 删除 bestMonths：会改变 bestMonths 展示；是否改变路线主体仅 seasonal/profile 可证明，普通路线无法证明。★★☆☆☆
- 删除 designStrategies：可能影响 buildRouteConcept 对 theme/season/transport 的 style 判定；但大量 profile 中是标签，逐条影响无法完全证明。★★☆☆☆
- 删除 plannerReason/coverageContribution：不会改变已生成路线内容。☆

### Route: 拉脱维亚10天公路自驾：拉脱维亚文化停留区到拉脱维亚地方生活区

- Route ID: `materialized-17hzki7-55052`
- 抽样类别: Theme
- 可证明来源类型: Materialized Template
- 国家: LV
- 目的地: 拉脱维亚文化停留区 > 拉脱维亚门户城市 > 拉脱维亚历史城区 > 拉脱维亚自然腹地 > 拉脱维亚地方生活区
- travelStyle: road-trip
- durationBand / days: 7-10d / 10
- Feed: 无法证明进入当前 Feed ready pool

Decision Trace:

Step1
读取：
- knowledge-graph-pool.json: destination/country candidates, as proven by provenance.source=knowledge-graph-pool or contentEvidence.materialized
- profile/travelStyle=road-trip: proven by travelStyle/travelStyleConceptKey/contentEvidence.travelMode
- countryCodes=LV
- destinationEntities=拉脱维亚文化停留区 > 拉脱维亚门户城市 > 拉脱维亚历史城区 > 拉脱维亚自然腹地 > 拉脱维亚地方生活区
- bestMonths=5-9月
- designStrategies=Geographic+Transport+Theme
- distance calculation / routePassesPlannerRules: proven by materialize-route-pool.mjs, but per-route rejected alternatives are not persisted

↓

Step2
过滤：
- disabledCountries 包含 CN；plausibleCountries 要求国家组合在 regionGroups 中；routePassesPlannerRules 要求 concept validation、距离完整、maxSegment/span 不超限。

↓

Step3
候选国家：
- 可证明保存结果：LV
- 生成前完整候选国家池：Unknown（accepted route 未保存被扫描/被删除候选列表）。

↓

Step4
为什么保留这些国家：
- 因为这些 destinationEntities 的 countryCode 通过 disabledCountries、plausibleCountries、距离与 concept rules；具体竞争候选 Unknown。

↓

Step5
为什么删除其它国家：
- Unknown。当前 accepted route 没有保存 rejected alternatives；只能从代码知道可能原因包括 CN block、region 不合理、距离超限、pool 为空、dedupe 太近、cluster 饱和。

↓

Step6
为什么生成当前标题：
- route title：makeRoute 模板读取 titleCountry + days + styleLabelZh + first/last destination，生成当前标题。

↓

Step7
为什么生成当前主题：
- profile/theme + buildRouteConcept 生成 travelStyle=road-trip；themes=公路自驾。

↓

Step8
为什么生成当前简介：
- route summary：makeRoute 固定模板读取 styleLabelZh 和前 3 个目的地，模板化风险最高。

↓

Step9
为什么进入 Accepted：
- 保存状态：contentQualityStatus=accepted, repositoryStatus=mediaReady, sourceType=planner-designed
- 可证明原因：materialize-route-pool 在 makeRoute 后调用 validateRouteContent(record).accepted 才 addCandidate；accepted repository 已保存本条。

↓

Step10
为什么进入 Feed（如果进入）：
- 未进入或无法证明进入 Feed：没有通过当前报告可验证的 feedReady + onlineCoverAsset 国家匹配。

真正改变路线结果的输入：
- 国家组合：由 destinations 的 countryCode 集合直接决定为 LV；plausibleCountries/CN block 可过滤，但被删国家候选 Unknown。
- 城市/景点：由 knowledge-graph-pool 候选或 coverageFallbackPlaces 形成 destinationEntities=拉脱维亚文化停留区 > 拉脱维亚门户城市 > 拉脱维亚历史城区 > 拉脱维亚自然腹地 > 拉脱维亚地方生活区。
- 天数：由 buildRouteConcept 得到 recommendedDays，再由 concreteDaysFor(hash(profile, destinations, serial)) 固化为 10。
- travelStyle：由 context/profile + buildRouteConcept 决定；保存为 road-trip。
- route title：makeRoute 模板读取 titleCountry + days + styleLabelZh + first/last destination，生成当前标题。
- route summary：makeRoute 固定模板读取 styleLabelZh 和前 3 个目的地，模板化风险最高。

最后补上的标签/非决策字段：
- plannerReason：在路线骨架/concept 后写入；不证明它改变了国家、城市或天数。
- coverageContribution：由生成后的 country/destination 数量汇总；不是生成前输入。
- contentEvidence.provider/evidenceHash：主要是来源/缓存/溯源；一般不改变本条路线内容。
- designStrategies：来自 profile.strategies，更多是 profile 标签；在部分 concept validation 中被读取，但不能逐条证明改变了候选池。

删除输入后的影响判断：
- 删除 country/destinationEntities：会改变国家组合、标题、summary，或无法生成路线。★★★★★
- 删除 travelStyle/profile：会改变 concept、styleLabel、天数推导、标题主题。★★★★★
- 删除 bestMonths：会改变 bestMonths 展示；是否改变路线主体仅 seasonal/profile 可证明，普通路线无法证明。★★☆☆☆
- 删除 designStrategies：可能影响 buildRouteConcept 对 theme/season/transport 的 style 判定；但大量 profile 中是标签，逐条影响无法完全证明。★★☆☆☆
- 删除 plannerReason/coverageContribution：不会改变已生成路线内容。☆

### Route: 萨摩亚11天经典首访：萨摩亚门户城市到萨摩亚文化停留区

- Route ID: `materialized-1o10l8w-56403`
- 抽样类别: Theme
- 可证明来源类型: Materialized Template
- 国家: WS
- 目的地: 萨摩亚门户城市 > 萨摩亚历史城区 > 萨摩亚自然腹地 > 萨摩亚地方生活区 > 萨摩亚区域风景带 > 萨摩亚文化停留区
- travelStyle: classic-first-trip
- durationBand / days: 10-14d / 11
- Feed: 无法证明进入当前 Feed ready pool

Decision Trace:

Step1
读取：
- knowledge-graph-pool.json: destination/country candidates, as proven by provenance.source=knowledge-graph-pool or contentEvidence.materialized
- profile/travelStyle=classic-first-trip: proven by travelStyle/travelStyleConceptKey/contentEvidence.travelMode
- countryCodes=WS
- destinationEntities=萨摩亚门户城市 > 萨摩亚历史城区 > 萨摩亚自然腹地 > 萨摩亚地方生活区 > 萨摩亚区域风景带 > 萨摩亚文化停留区
- bestMonths=3-5月
- designStrategies=Geographic+Season+Theme+Transport
- distance calculation / routePassesPlannerRules: proven by materialize-route-pool.mjs, but per-route rejected alternatives are not persisted

↓

Step2
过滤：
- disabledCountries 包含 CN；plausibleCountries 要求国家组合在 regionGroups 中；routePassesPlannerRules 要求 concept validation、距离完整、maxSegment/span 不超限。

↓

Step3
候选国家：
- 可证明保存结果：WS
- 生成前完整候选国家池：Unknown（accepted route 未保存被扫描/被删除候选列表）。

↓

Step4
为什么保留这些国家：
- 因为这些 destinationEntities 的 countryCode 通过 disabledCountries、plausibleCountries、距离与 concept rules；具体竞争候选 Unknown。

↓

Step5
为什么删除其它国家：
- Unknown。当前 accepted route 没有保存 rejected alternatives；只能从代码知道可能原因包括 CN block、region 不合理、距离超限、pool 为空、dedupe 太近、cluster 饱和。

↓

Step6
为什么生成当前标题：
- route title：makeRoute 模板读取 titleCountry + days + styleLabelZh + first/last destination，生成当前标题。

↓

Step7
为什么生成当前主题：
- profile/theme + buildRouteConcept 生成 travelStyle=classic-first-trip；themes=经典首访。

↓

Step8
为什么生成当前简介：
- route summary：makeRoute 固定模板读取 styleLabelZh 和前 3 个目的地，模板化风险最高。

↓

Step9
为什么进入 Accepted：
- 保存状态：contentQualityStatus=accepted, repositoryStatus=mediaReady, sourceType=planner-designed
- 可证明原因：materialize-route-pool 在 makeRoute 后调用 validateRouteContent(record).accepted 才 addCandidate；accepted repository 已保存本条。

↓

Step10
为什么进入 Feed（如果进入）：
- 未进入或无法证明进入 Feed：没有通过当前报告可验证的 feedReady + onlineCoverAsset 国家匹配。

真正改变路线结果的输入：
- 国家组合：由 destinations 的 countryCode 集合直接决定为 WS；plausibleCountries/CN block 可过滤，但被删国家候选 Unknown。
- 城市/景点：由 knowledge-graph-pool 候选或 coverageFallbackPlaces 形成 destinationEntities=萨摩亚门户城市 > 萨摩亚历史城区 > 萨摩亚自然腹地 > 萨摩亚地方生活区 > 萨摩亚区域风景带 > 萨摩亚文化停留区。
- 天数：由 buildRouteConcept 得到 recommendedDays，再由 concreteDaysFor(hash(profile, destinations, serial)) 固化为 11。
- travelStyle：由 context/profile + buildRouteConcept 决定；保存为 classic-first-trip。
- route title：makeRoute 模板读取 titleCountry + days + styleLabelZh + first/last destination，生成当前标题。
- route summary：makeRoute 固定模板读取 styleLabelZh 和前 3 个目的地，模板化风险最高。

最后补上的标签/非决策字段：
- plannerReason：在路线骨架/concept 后写入；不证明它改变了国家、城市或天数。
- coverageContribution：由生成后的 country/destination 数量汇总；不是生成前输入。
- contentEvidence.provider/evidenceHash：主要是来源/缓存/溯源；一般不改变本条路线内容。
- designStrategies：来自 profile.strategies，更多是 profile 标签；在部分 concept validation 中被读取，但不能逐条证明改变了候选池。

删除输入后的影响判断：
- 删除 country/destinationEntities：会改变国家组合、标题、summary，或无法生成路线。★★★★★
- 删除 travelStyle/profile：会改变 concept、styleLabel、天数推导、标题主题。★★★★★
- 删除 bestMonths：会改变 bestMonths 展示；是否改变路线主体仅 seasonal/profile 可证明，普通路线无法证明。★★☆☆☆
- 删除 designStrategies：可能影响 buildRouteConcept 对 theme/season/transport 的 style 判定；但大量 profile 中是标签，逐条影响无法完全证明。★★☆☆☆
- 删除 plannerReason/coverageContribution：不会改变已生成路线内容。☆

### Route: 捷克5天经典首访：布尔诺到尼斯河畔亚布洛内茨

- Route ID: `materialized-1jer8dx-59202`
- 抽样类别: Theme
- 可证明来源类型: Materialized Template
- 国家: CZ
- 目的地: 布尔诺 > 比尔森 > 尼斯河畔亚布洛内茨
- travelStyle: classic-first-trip
- durationBand / days: 4-6d / 5
- Feed: 可证明进入当前 Feed ready pool 的候选

Decision Trace:

Step1
读取：
- knowledge-graph-pool.json: destination/country candidates, as proven by provenance.source=knowledge-graph-pool or contentEvidence.materialized
- profile/travelStyle=classic-first-trip: proven by travelStyle/travelStyleConceptKey/contentEvidence.travelMode
- countryCodes=CZ
- destinationEntities=布尔诺 > 比尔森 > 尼斯河畔亚布洛内茨
- bestMonths=5-9月
- designStrategies=Geographic+Regional+Theme+Transport
- distance calculation / routePassesPlannerRules: proven by materialize-route-pool.mjs, but per-route rejected alternatives are not persisted

↓

Step2
过滤：
- disabledCountries 包含 CN；plausibleCountries 要求国家组合在 regionGroups 中；routePassesPlannerRules 要求 concept validation、距离完整、maxSegment/span 不超限。

↓

Step3
候选国家：
- 可证明保存结果：CZ
- 生成前完整候选国家池：Unknown（accepted route 未保存被扫描/被删除候选列表）。

↓

Step4
为什么保留这些国家：
- 因为这些 destinationEntities 的 countryCode 通过 disabledCountries、plausibleCountries、距离与 concept rules；具体竞争候选 Unknown。

↓

Step5
为什么删除其它国家：
- Unknown。当前 accepted route 没有保存 rejected alternatives；只能从代码知道可能原因包括 CN block、region 不合理、距离超限、pool 为空、dedupe 太近、cluster 饱和。

↓

Step6
为什么生成当前标题：
- route title：makeRoute 模板读取 titleCountry + days + styleLabelZh + first/last destination，生成当前标题。

↓

Step7
为什么生成当前主题：
- profile/theme + buildRouteConcept 生成 travelStyle=classic-first-trip；themes=经典首访。

↓

Step8
为什么生成当前简介：
- route summary：makeRoute 固定模板读取 styleLabelZh 和前 3 个目的地，模板化风险最高。

↓

Step9
为什么进入 Accepted：
- 保存状态：contentQualityStatus=accepted, repositoryStatus=mediaReady, sourceType=planner-designed
- 可证明原因：materialize-route-pool 在 makeRoute 后调用 validateRouteContent(record).accepted 才 addCandidate；accepted repository 已保存本条。

↓

Step10
为什么进入 Feed（如果进入）：
- 进入 Feed 的可证明原因：accepted repository 中存在 feedReady onlineCoverAsset，imageCountryCodes 与路线国家有交集；Feed 还会受当前 cursor/random/quality 排序影响。

真正改变路线结果的输入：
- 国家组合：由 destinations 的 countryCode 集合直接决定为 CZ；plausibleCountries/CN block 可过滤，但被删国家候选 Unknown。
- 城市/景点：由 knowledge-graph-pool 候选或 coverageFallbackPlaces 形成 destinationEntities=布尔诺 > 比尔森 > 尼斯河畔亚布洛内茨。
- 天数：由 buildRouteConcept 得到 recommendedDays，再由 concreteDaysFor(hash(profile, destinations, serial)) 固化为 5。
- travelStyle：由 context/profile + buildRouteConcept 决定；保存为 classic-first-trip。
- route title：makeRoute 模板读取 titleCountry + days + styleLabelZh + first/last destination，生成当前标题。
- route summary：makeRoute 固定模板读取 styleLabelZh 和前 3 个目的地，模板化风险最高。

最后补上的标签/非决策字段：
- plannerReason：在路线骨架/concept 后写入；不证明它改变了国家、城市或天数。
- coverageContribution：由生成后的 country/destination 数量汇总；不是生成前输入。
- contentEvidence.provider/evidenceHash：主要是来源/缓存/溯源；一般不改变本条路线内容。
- designStrategies：来自 profile.strategies，更多是 profile 标签；在部分 concept validation 中被读取，但不能逐条证明改变了候选池。

删除输入后的影响判断：
- 删除 country/destinationEntities：会改变国家组合、标题、summary，或无法生成路线。★★★★★
- 删除 travelStyle/profile：会改变 concept、styleLabel、天数推导、标题主题。★★★★★
- 删除 bestMonths：会改变 bestMonths 展示；是否改变路线主体仅 seasonal/profile 可证明，普通路线无法证明。★★☆☆☆
- 删除 designStrategies：可能影响 buildRouteConcept 对 theme/season/transport 的 style 判定；但大量 profile 中是标签，逐条影响无法完全证明。★★☆☆☆
- 删除 plannerReason/coverageContribution：不会改变已生成路线内容。☆


## Rail/Transport

### Route: 横跨美国东西海岸的火车之旅

- Route ID: `wikivoyage-195882`
- 抽样类别: Rail/Transport
- 可证明来源类型: Unknown
- 国家: US
- 目的地: 布里格姆城 > 纽约 > 犹他州
- travelStyle: Unknown
- durationBand / days: Unknown / 4
- Feed: 无法证明进入当前 Feed ready pool

Decision Trace:

Step1
读取：
- Unknown: route source does not preserve enough pre-generation context.

↓

Step2
过滤：
- Unknown

↓

Step3
候选国家：
- 可证明保存结果：US
- 生成前完整候选国家池：Unknown（accepted route 未保存被扫描/被删除候选列表）。

↓

Step4
为什么保留这些国家：
- Unknown

↓

Step5
为什么删除其它国家：
- Unknown。当前 accepted route 没有保存 rejected alternatives；只能从代码知道可能原因包括 CN block、region 不合理、距离超限、pool 为空、dedupe 太近、cluster 饱和。

↓

Step6
为什么生成当前标题：
- Unknown

↓

Step7
为什么生成当前主题：
- buildRouteConcept/context.theme/travelStyle 生成主题；themes=铁路旅行。

↓

Step8
为什么生成当前简介：
- Unknown

↓

Step9
为什么进入 Accepted：
- 保存状态：contentQualityStatus=accepted, repositoryStatus=accepted, sourceType=source-original
- 可证明原因：Unknown

↓

Step10
为什么进入 Feed（如果进入）：
- 未进入或无法证明进入 Feed：没有通过当前报告可验证的 feedReady + onlineCoverAsset 国家匹配。

真正改变路线结果的输入：
- Unknown: 无法证明哪些输入改变了路线结果。

最后补上的标签/非决策字段：
- plannerReason：在路线骨架/concept 后写入；不证明它改变了国家、城市或天数。
- coverageContribution：由生成后的 country/destination 数量汇总；不是生成前输入。
- contentEvidence.provider/evidenceHash：主要是来源/缓存/溯源；一般不改变本条路线内容。
- designStrategies：可能参与 concept/validator，但 saved field 本身是输出记录；删除保存字段通常不改变已生成路线。

删除输入后的影响判断：
- Unknown

### Route: 英国、卢森堡10天交通线旅程：科尔切斯特到卢森堡区域风景带

- Route ID: `materialized-1ldhiz3-43153`
- 抽样类别: Rail/Transport
- 可证明来源类型: Materialized Template
- 国家: GB + LU
- 目的地: 科尔切斯特 > 卡莱尔 > 伦敦 > 卢森堡地方生活区 > 卢森堡区域风景带
- travelStyle: transport-journey
- durationBand / days: 7-10d / 10
- Feed: 可证明进入当前 Feed ready pool 的候选

Decision Trace:

Step1
读取：
- knowledge-graph-pool.json: destination/country candidates, as proven by provenance.source=knowledge-graph-pool or contentEvidence.materialized
- profile/travelStyle=transport-journey: proven by travelStyle/travelStyleConceptKey/contentEvidence.travelMode
- countryCodes=GB+LU
- destinationEntities=科尔切斯特 > 卡莱尔 > 伦敦 > 卢森堡地方生活区 > 卢森堡区域风景带
- bestMonths=4-10月
- designStrategies=Geographic+Transport+Theme
- distance calculation / routePassesPlannerRules: proven by materialize-route-pool.mjs, but per-route rejected alternatives are not persisted

↓

Step2
过滤：
- disabledCountries 包含 CN；plausibleCountries 要求国家组合在 regionGroups 中；routePassesPlannerRules 要求 concept validation、距离完整、maxSegment/span 不超限。

↓

Step3
候选国家：
- 可证明保存结果：GB + LU
- 生成前完整候选国家池：Unknown（accepted route 未保存被扫描/被删除候选列表）。

↓

Step4
为什么保留这些国家：
- 因为这些 destinationEntities 的 countryCode 通过 disabledCountries、plausibleCountries、距离与 concept rules；具体竞争候选 Unknown。

↓

Step5
为什么删除其它国家：
- Unknown。当前 accepted route 没有保存 rejected alternatives；只能从代码知道可能原因包括 CN block、region 不合理、距离超限、pool 为空、dedupe 太近、cluster 饱和。

↓

Step6
为什么生成当前标题：
- route title：makeRoute 模板读取 titleCountry + days + styleLabelZh + first/last destination，生成当前标题。

↓

Step7
为什么生成当前主题：
- profile/theme + buildRouteConcept 生成 travelStyle=transport-journey；themes=交通线旅程。

↓

Step8
为什么生成当前简介：
- route summary：makeRoute 固定模板读取 styleLabelZh 和前 3 个目的地，模板化风险最高。

↓

Step9
为什么进入 Accepted：
- 保存状态：contentQualityStatus=accepted, repositoryStatus=mediaReady, sourceType=planner-designed
- 可证明原因：materialize-route-pool 在 makeRoute 后调用 validateRouteContent(record).accepted 才 addCandidate；accepted repository 已保存本条。

↓

Step10
为什么进入 Feed（如果进入）：
- 进入 Feed 的可证明原因：accepted repository 中存在 feedReady onlineCoverAsset，imageCountryCodes 与路线国家有交集；Feed 还会受当前 cursor/random/quality 排序影响。

真正改变路线结果的输入：
- 国家组合：由 destinations 的 countryCode 集合直接决定为 GB+LU；plausibleCountries/CN block 可过滤，但被删国家候选 Unknown。
- 城市/景点：由 knowledge-graph-pool 候选或 coverageFallbackPlaces 形成 destinationEntities=科尔切斯特 > 卡莱尔 > 伦敦 > 卢森堡地方生活区 > 卢森堡区域风景带。
- 天数：由 buildRouteConcept 得到 recommendedDays，再由 concreteDaysFor(hash(profile, destinations, serial)) 固化为 10。
- travelStyle：由 context/profile + buildRouteConcept 决定；保存为 transport-journey。
- route title：makeRoute 模板读取 titleCountry + days + styleLabelZh + first/last destination，生成当前标题。
- route summary：makeRoute 固定模板读取 styleLabelZh 和前 3 个目的地，模板化风险最高。

最后补上的标签/非决策字段：
- plannerReason：在路线骨架/concept 后写入；不证明它改变了国家、城市或天数。
- coverageContribution：由生成后的 country/destination 数量汇总；不是生成前输入。
- contentEvidence.provider/evidenceHash：主要是来源/缓存/溯源；一般不改变本条路线内容。
- designStrategies：来自 profile.strategies，更多是 profile 标签；在部分 concept validation 中被读取，但不能逐条证明改变了候选池。

删除输入后的影响判断：
- 删除 country/destinationEntities：会改变国家组合、标题、summary，或无法生成路线。★★★★★
- 删除 travelStyle/profile：会改变 concept、styleLabel、天数推导、标题主题。★★★★★
- 删除 bestMonths：会改变 bestMonths 展示；是否改变路线主体仅 seasonal/profile 可证明，普通路线无法证明。★★☆☆☆
- 删除 designStrategies：可能影响 buildRouteConcept 对 theme/season/transport 的 style 判定；但大量 profile 中是标签，逐条影响无法完全证明。★★☆☆☆
- 删除 plannerReason/coverageContribution：不会改变已生成路线内容。☆

### Route: 克罗地亚、意大利8天经典首访：克罗地亚历史城区到罗马

- Route ID: `materialized-lnssf9-45438`
- 抽样类别: Rail/Transport
- 可证明来源类型: Materialized Template
- 国家: HR + IT
- 目的地: 克罗地亚历史城区 > 克罗地亚自然腹地 > 那不勒斯 > 罗马
- travelStyle: classic-first-trip
- durationBand / days: 7-10d / 8
- Feed: 可证明进入当前 Feed ready pool 的候选

Decision Trace:

Step1
读取：
- knowledge-graph-pool.json: destination/country candidates, as proven by provenance.source=knowledge-graph-pool or contentEvidence.materialized
- profile/travelStyle=classic-first-trip: proven by travelStyle/travelStyleConceptKey/contentEvidence.travelMode
- countryCodes=HR+IT
- destinationEntities=克罗地亚历史城区 > 克罗地亚自然腹地 > 那不勒斯 > 罗马
- bestMonths=5-9月
- designStrategies=Geographic+Regional+Theme+Transport
- distance calculation / routePassesPlannerRules: proven by materialize-route-pool.mjs, but per-route rejected alternatives are not persisted

↓

Step2
过滤：
- disabledCountries 包含 CN；plausibleCountries 要求国家组合在 regionGroups 中；routePassesPlannerRules 要求 concept validation、距离完整、maxSegment/span 不超限。

↓

Step3
候选国家：
- 可证明保存结果：HR + IT
- 生成前完整候选国家池：Unknown（accepted route 未保存被扫描/被删除候选列表）。

↓

Step4
为什么保留这些国家：
- 因为这些 destinationEntities 的 countryCode 通过 disabledCountries、plausibleCountries、距离与 concept rules；具体竞争候选 Unknown。

↓

Step5
为什么删除其它国家：
- Unknown。当前 accepted route 没有保存 rejected alternatives；只能从代码知道可能原因包括 CN block、region 不合理、距离超限、pool 为空、dedupe 太近、cluster 饱和。

↓

Step6
为什么生成当前标题：
- route title：makeRoute 模板读取 titleCountry + days + styleLabelZh + first/last destination，生成当前标题。

↓

Step7
为什么生成当前主题：
- profile/theme + buildRouteConcept 生成 travelStyle=classic-first-trip；themes=经典首访。

↓

Step8
为什么生成当前简介：
- route summary：makeRoute 固定模板读取 styleLabelZh 和前 3 个目的地，模板化风险最高。

↓

Step9
为什么进入 Accepted：
- 保存状态：contentQualityStatus=accepted, repositoryStatus=mediaReady, sourceType=planner-designed
- 可证明原因：materialize-route-pool 在 makeRoute 后调用 validateRouteContent(record).accepted 才 addCandidate；accepted repository 已保存本条。

↓

Step10
为什么进入 Feed（如果进入）：
- 进入 Feed 的可证明原因：accepted repository 中存在 feedReady onlineCoverAsset，imageCountryCodes 与路线国家有交集；Feed 还会受当前 cursor/random/quality 排序影响。

真正改变路线结果的输入：
- 国家组合：由 destinations 的 countryCode 集合直接决定为 HR+IT；plausibleCountries/CN block 可过滤，但被删国家候选 Unknown。
- 城市/景点：由 knowledge-graph-pool 候选或 coverageFallbackPlaces 形成 destinationEntities=克罗地亚历史城区 > 克罗地亚自然腹地 > 那不勒斯 > 罗马。
- 天数：由 buildRouteConcept 得到 recommendedDays，再由 concreteDaysFor(hash(profile, destinations, serial)) 固化为 8。
- travelStyle：由 context/profile + buildRouteConcept 决定；保存为 classic-first-trip。
- route title：makeRoute 模板读取 titleCountry + days + styleLabelZh + first/last destination，生成当前标题。
- route summary：makeRoute 固定模板读取 styleLabelZh 和前 3 个目的地，模板化风险最高。

最后补上的标签/非决策字段：
- plannerReason：在路线骨架/concept 后写入；不证明它改变了国家、城市或天数。
- coverageContribution：由生成后的 country/destination 数量汇总；不是生成前输入。
- contentEvidence.provider/evidenceHash：主要是来源/缓存/溯源；一般不改变本条路线内容。
- designStrategies：来自 profile.strategies，更多是 profile 标签；在部分 concept validation 中被读取，但不能逐条证明改变了候选池。

删除输入后的影响判断：
- 删除 country/destinationEntities：会改变国家组合、标题、summary，或无法生成路线。★★★★★
- 删除 travelStyle/profile：会改变 concept、styleLabel、天数推导、标题主题。★★★★★
- 删除 bestMonths：会改变 bestMonths 展示；是否改变路线主体仅 seasonal/profile 可证明，普通路线无法证明。★★☆☆☆
- 删除 designStrategies：可能影响 buildRouteConcept 对 theme/season/transport 的 style 判定；但大量 profile 中是标签，逐条影响无法完全证明。★★☆☆☆
- 删除 plannerReason/coverageContribution：不会改变已生成路线内容。☆

### Route: 科特迪瓦、加纳8天经典首访：科特迪瓦区域风景带到加纳区域风景带

- Route ID: `materialized-7a8m5-46905`
- 抽样类别: Rail/Transport
- 可证明来源类型: Materialized Template
- 国家: CI + GH
- 目的地: 科特迪瓦区域风景带 > 科特迪瓦自然腹地 > 加纳门户城市 > 加纳区域风景带
- travelStyle: classic-first-trip
- durationBand / days: 7-10d / 8
- Feed: 无法证明进入当前 Feed ready pool

Decision Trace:

Step1
读取：
- knowledge-graph-pool.json: destination/country candidates, as proven by provenance.source=knowledge-graph-pool or contentEvidence.materialized
- profile/travelStyle=classic-first-trip: proven by travelStyle/travelStyleConceptKey/contentEvidence.travelMode
- countryCodes=CI+GH
- destinationEntities=科特迪瓦区域风景带 > 科特迪瓦自然腹地 > 加纳门户城市 > 加纳区域风景带
- bestMonths=5-9月
- designStrategies=Geographic+Regional+Theme+Transport
- distance calculation / routePassesPlannerRules: proven by materialize-route-pool.mjs, but per-route rejected alternatives are not persisted

↓

Step2
过滤：
- disabledCountries 包含 CN；plausibleCountries 要求国家组合在 regionGroups 中；routePassesPlannerRules 要求 concept validation、距离完整、maxSegment/span 不超限。

↓

Step3
候选国家：
- 可证明保存结果：CI + GH
- 生成前完整候选国家池：Unknown（accepted route 未保存被扫描/被删除候选列表）。

↓

Step4
为什么保留这些国家：
- 因为这些 destinationEntities 的 countryCode 通过 disabledCountries、plausibleCountries、距离与 concept rules；具体竞争候选 Unknown。

↓

Step5
为什么删除其它国家：
- Unknown。当前 accepted route 没有保存 rejected alternatives；只能从代码知道可能原因包括 CN block、region 不合理、距离超限、pool 为空、dedupe 太近、cluster 饱和。

↓

Step6
为什么生成当前标题：
- route title：makeRoute 模板读取 titleCountry + days + styleLabelZh + first/last destination，生成当前标题。

↓

Step7
为什么生成当前主题：
- profile/theme + buildRouteConcept 生成 travelStyle=classic-first-trip；themes=经典首访。

↓

Step8
为什么生成当前简介：
- route summary：makeRoute 固定模板读取 styleLabelZh 和前 3 个目的地，模板化风险最高。

↓

Step9
为什么进入 Accepted：
- 保存状态：contentQualityStatus=accepted, repositoryStatus=mediaReady, sourceType=planner-designed
- 可证明原因：materialize-route-pool 在 makeRoute 后调用 validateRouteContent(record).accepted 才 addCandidate；accepted repository 已保存本条。

↓

Step10
为什么进入 Feed（如果进入）：
- 未进入或无法证明进入 Feed：没有通过当前报告可验证的 feedReady + onlineCoverAsset 国家匹配。

真正改变路线结果的输入：
- 国家组合：由 destinations 的 countryCode 集合直接决定为 CI+GH；plausibleCountries/CN block 可过滤，但被删国家候选 Unknown。
- 城市/景点：由 knowledge-graph-pool 候选或 coverageFallbackPlaces 形成 destinationEntities=科特迪瓦区域风景带 > 科特迪瓦自然腹地 > 加纳门户城市 > 加纳区域风景带。
- 天数：由 buildRouteConcept 得到 recommendedDays，再由 concreteDaysFor(hash(profile, destinations, serial)) 固化为 8。
- travelStyle：由 context/profile + buildRouteConcept 决定；保存为 classic-first-trip。
- route title：makeRoute 模板读取 titleCountry + days + styleLabelZh + first/last destination，生成当前标题。
- route summary：makeRoute 固定模板读取 styleLabelZh 和前 3 个目的地，模板化风险最高。

最后补上的标签/非决策字段：
- plannerReason：在路线骨架/concept 后写入；不证明它改变了国家、城市或天数。
- coverageContribution：由生成后的 country/destination 数量汇总；不是生成前输入。
- contentEvidence.provider/evidenceHash：主要是来源/缓存/溯源；一般不改变本条路线内容。
- designStrategies：来自 profile.strategies，更多是 profile 标签；在部分 concept validation 中被读取，但不能逐条证明改变了候选池。

删除输入后的影响判断：
- 删除 country/destinationEntities：会改变国家组合、标题、summary，或无法生成路线。★★★★★
- 删除 travelStyle/profile：会改变 concept、styleLabel、天数推导、标题主题。★★★★★
- 删除 bestMonths：会改变 bestMonths 展示；是否改变路线主体仅 seasonal/profile 可证明，普通路线无法证明。★★☆☆☆
- 删除 designStrategies：可能影响 buildRouteConcept 对 theme/season/transport 的 style 判定；但大量 profile 中是标签，逐条影响无法完全证明。★★☆☆☆
- 删除 plannerReason/coverageContribution：不会改变已生成路线内容。☆

### Route: 巴哈马5天经典首访：巴哈马历史城区到巴哈马地方生活区

- Route ID: `materialized-y8zz1-47246`
- 抽样类别: Rail/Transport
- 可证明来源类型: Materialized Template
- 国家: BS
- 目的地: 巴哈马历史城区 > 巴哈马自然腹地 > 巴哈马地方生活区
- travelStyle: classic-first-trip
- durationBand / days: 4-6d / 5
- Feed: 无法证明进入当前 Feed ready pool

Decision Trace:

Step1
读取：
- knowledge-graph-pool.json: destination/country candidates, as proven by provenance.source=knowledge-graph-pool or contentEvidence.materialized
- profile/travelStyle=classic-first-trip: proven by travelStyle/travelStyleConceptKey/contentEvidence.travelMode
- countryCodes=BS
- destinationEntities=巴哈马历史城区 > 巴哈马自然腹地 > 巴哈马地方生活区
- bestMonths=4-10月
- designStrategies=Geographic+Theme+Transport
- distance calculation / routePassesPlannerRules: proven by materialize-route-pool.mjs, but per-route rejected alternatives are not persisted

↓

Step2
过滤：
- disabledCountries 包含 CN；plausibleCountries 要求国家组合在 regionGroups 中；routePassesPlannerRules 要求 concept validation、距离完整、maxSegment/span 不超限。

↓

Step3
候选国家：
- 可证明保存结果：BS
- 生成前完整候选国家池：Unknown（accepted route 未保存被扫描/被删除候选列表）。

↓

Step4
为什么保留这些国家：
- 因为这些 destinationEntities 的 countryCode 通过 disabledCountries、plausibleCountries、距离与 concept rules；具体竞争候选 Unknown。

↓

Step5
为什么删除其它国家：
- Unknown。当前 accepted route 没有保存 rejected alternatives；只能从代码知道可能原因包括 CN block、region 不合理、距离超限、pool 为空、dedupe 太近、cluster 饱和。

↓

Step6
为什么生成当前标题：
- route title：makeRoute 模板读取 titleCountry + days + styleLabelZh + first/last destination，生成当前标题。

↓

Step7
为什么生成当前主题：
- profile/theme + buildRouteConcept 生成 travelStyle=classic-first-trip；themes=经典首访。

↓

Step8
为什么生成当前简介：
- route summary：makeRoute 固定模板读取 styleLabelZh 和前 3 个目的地，模板化风险最高。

↓

Step9
为什么进入 Accepted：
- 保存状态：contentQualityStatus=accepted, repositoryStatus=mediaReady, sourceType=planner-designed
- 可证明原因：materialize-route-pool 在 makeRoute 后调用 validateRouteContent(record).accepted 才 addCandidate；accepted repository 已保存本条。

↓

Step10
为什么进入 Feed（如果进入）：
- 未进入或无法证明进入 Feed：没有通过当前报告可验证的 feedReady + onlineCoverAsset 国家匹配。

真正改变路线结果的输入：
- 国家组合：由 destinations 的 countryCode 集合直接决定为 BS；plausibleCountries/CN block 可过滤，但被删国家候选 Unknown。
- 城市/景点：由 knowledge-graph-pool 候选或 coverageFallbackPlaces 形成 destinationEntities=巴哈马历史城区 > 巴哈马自然腹地 > 巴哈马地方生活区。
- 天数：由 buildRouteConcept 得到 recommendedDays，再由 concreteDaysFor(hash(profile, destinations, serial)) 固化为 5。
- travelStyle：由 context/profile + buildRouteConcept 决定；保存为 classic-first-trip。
- route title：makeRoute 模板读取 titleCountry + days + styleLabelZh + first/last destination，生成当前标题。
- route summary：makeRoute 固定模板读取 styleLabelZh 和前 3 个目的地，模板化风险最高。

最后补上的标签/非决策字段：
- plannerReason：在路线骨架/concept 后写入；不证明它改变了国家、城市或天数。
- coverageContribution：由生成后的 country/destination 数量汇总；不是生成前输入。
- contentEvidence.provider/evidenceHash：主要是来源/缓存/溯源；一般不改变本条路线内容。
- designStrategies：来自 profile.strategies，更多是 profile 标签；在部分 concept validation 中被读取，但不能逐条证明改变了候选池。

删除输入后的影响判断：
- 删除 country/destinationEntities：会改变国家组合、标题、summary，或无法生成路线。★★★★★
- 删除 travelStyle/profile：会改变 concept、styleLabel、天数推导、标题主题。★★★★★
- 删除 bestMonths：会改变 bestMonths 展示；是否改变路线主体仅 seasonal/profile 可证明，普通路线无法证明。★★☆☆☆
- 删除 designStrategies：可能影响 buildRouteConcept 对 theme/season/transport 的 style 判定；但大量 profile 中是标签，逐条影响无法完全证明。★★☆☆☆
- 删除 plannerReason/coverageContribution：不会改变已生成路线内容。☆

### Route: 马达加斯加5天主题游：马达加斯加自然腹地到马达加斯加区域风景带

- Route ID: `materialized-1qqvzfn-47524`
- 抽样类别: Rail/Transport
- 可证明来源类型: Materialized Template
- 国家: MG
- 目的地: 马达加斯加自然腹地 > 马达加斯加地方生活区 > 马达加斯加区域风景带
- travelStyle: theme
- durationBand / days: 4-6d / 5
- Feed: 无法证明进入当前 Feed ready pool

Decision Trace:

Step1
读取：
- knowledge-graph-pool.json: destination/country candidates, as proven by provenance.source=knowledge-graph-pool or contentEvidence.materialized
- profile/travelStyle=theme: proven by travelStyle/travelStyleConceptKey/contentEvidence.travelMode
- countryCodes=MG
- destinationEntities=马达加斯加自然腹地 > 马达加斯加地方生活区 > 马达加斯加区域风景带
- bestMonths=9-11月
- designStrategies=Geographic+Theme+Transport
- distance calculation / routePassesPlannerRules: proven by materialize-route-pool.mjs, but per-route rejected alternatives are not persisted

↓

Step2
过滤：
- disabledCountries 包含 CN；plausibleCountries 要求国家组合在 regionGroups 中；routePassesPlannerRules 要求 concept validation、距离完整、maxSegment/span 不超限。

↓

Step3
候选国家：
- 可证明保存结果：MG
- 生成前完整候选国家池：Unknown（accepted route 未保存被扫描/被删除候选列表）。

↓

Step4
为什么保留这些国家：
- 因为这些 destinationEntities 的 countryCode 通过 disabledCountries、plausibleCountries、距离与 concept rules；具体竞争候选 Unknown。

↓

Step5
为什么删除其它国家：
- Unknown。当前 accepted route 没有保存 rejected alternatives；只能从代码知道可能原因包括 CN block、region 不合理、距离超限、pool 为空、dedupe 太近、cluster 饱和。

↓

Step6
为什么生成当前标题：
- route title：makeRoute 模板读取 titleCountry + days + styleLabelZh + first/last destination，生成当前标题。

↓

Step7
为什么生成当前主题：
- profile/theme + buildRouteConcept 生成 travelStyle=theme；themes=主题游。

↓

Step8
为什么生成当前简介：
- route summary：makeRoute 固定模板读取 styleLabelZh 和前 3 个目的地，模板化风险最高。

↓

Step9
为什么进入 Accepted：
- 保存状态：contentQualityStatus=accepted, repositoryStatus=mediaReady, sourceType=planner-designed
- 可证明原因：materialize-route-pool 在 makeRoute 后调用 validateRouteContent(record).accepted 才 addCandidate；accepted repository 已保存本条。

↓

Step10
为什么进入 Feed（如果进入）：
- 未进入或无法证明进入 Feed：没有通过当前报告可验证的 feedReady + onlineCoverAsset 国家匹配。

真正改变路线结果的输入：
- 国家组合：由 destinations 的 countryCode 集合直接决定为 MG；plausibleCountries/CN block 可过滤，但被删国家候选 Unknown。
- 城市/景点：由 knowledge-graph-pool 候选或 coverageFallbackPlaces 形成 destinationEntities=马达加斯加自然腹地 > 马达加斯加地方生活区 > 马达加斯加区域风景带。
- 天数：由 buildRouteConcept 得到 recommendedDays，再由 concreteDaysFor(hash(profile, destinations, serial)) 固化为 5。
- travelStyle：由 context/profile + buildRouteConcept 决定；保存为 theme。
- route title：makeRoute 模板读取 titleCountry + days + styleLabelZh + first/last destination，生成当前标题。
- route summary：makeRoute 固定模板读取 styleLabelZh 和前 3 个目的地，模板化风险最高。

最后补上的标签/非决策字段：
- plannerReason：在路线骨架/concept 后写入；不证明它改变了国家、城市或天数。
- coverageContribution：由生成后的 country/destination 数量汇总；不是生成前输入。
- contentEvidence.provider/evidenceHash：主要是来源/缓存/溯源；一般不改变本条路线内容。
- designStrategies：来自 profile.strategies，更多是 profile 标签；在部分 concept validation 中被读取，但不能逐条证明改变了候选池。

删除输入后的影响判断：
- 删除 country/destinationEntities：会改变国家组合、标题、summary，或无法生成路线。★★★★★
- 删除 travelStyle/profile：会改变 concept、styleLabel、天数推导、标题主题。★★★★★
- 删除 bestMonths：会改变 bestMonths 展示；是否改变路线主体仅 seasonal/profile 可证明，普通路线无法证明。★★☆☆☆
- 删除 designStrategies：可能影响 buildRouteConcept 对 theme/season/transport 的 style 判定；但大量 profile 中是标签，逐条影响无法完全证明。★★☆☆☆
- 删除 plannerReason/coverageContribution：不会改变已生成路线内容。☆

### Route: 南非5天经典首访：南非地方生活区到南非文化停留区

- Route ID: `materialized-hty7fg-47820`
- 抽样类别: Rail/Transport
- 可证明来源类型: Materialized Template
- 国家: ZA
- 目的地: 南非地方生活区 > 南非区域风景带 > 南非文化停留区
- travelStyle: classic-first-trip
- durationBand / days: 4-6d / 5
- Feed: 无法证明进入当前 Feed ready pool

Decision Trace:

Step1
读取：
- knowledge-graph-pool.json: destination/country candidates, as proven by provenance.source=knowledge-graph-pool or contentEvidence.materialized
- profile/travelStyle=classic-first-trip: proven by travelStyle/travelStyleConceptKey/contentEvidence.travelMode
- countryCodes=ZA
- destinationEntities=南非地方生活区 > 南非区域风景带 > 南非文化停留区
- bestMonths=4-10月
- designStrategies=Geographic+Theme+Transport
- distance calculation / routePassesPlannerRules: proven by materialize-route-pool.mjs, but per-route rejected alternatives are not persisted

↓

Step2
过滤：
- disabledCountries 包含 CN；plausibleCountries 要求国家组合在 regionGroups 中；routePassesPlannerRules 要求 concept validation、距离完整、maxSegment/span 不超限。

↓

Step3
候选国家：
- 可证明保存结果：ZA
- 生成前完整候选国家池：Unknown（accepted route 未保存被扫描/被删除候选列表）。

↓

Step4
为什么保留这些国家：
- 因为这些 destinationEntities 的 countryCode 通过 disabledCountries、plausibleCountries、距离与 concept rules；具体竞争候选 Unknown。

↓

Step5
为什么删除其它国家：
- Unknown。当前 accepted route 没有保存 rejected alternatives；只能从代码知道可能原因包括 CN block、region 不合理、距离超限、pool 为空、dedupe 太近、cluster 饱和。

↓

Step6
为什么生成当前标题：
- route title：makeRoute 模板读取 titleCountry + days + styleLabelZh + first/last destination，生成当前标题。

↓

Step7
为什么生成当前主题：
- profile/theme + buildRouteConcept 生成 travelStyle=classic-first-trip；themes=经典首访。

↓

Step8
为什么生成当前简介：
- route summary：makeRoute 固定模板读取 styleLabelZh 和前 3 个目的地，模板化风险最高。

↓

Step9
为什么进入 Accepted：
- 保存状态：contentQualityStatus=accepted, repositoryStatus=mediaReady, sourceType=planner-designed
- 可证明原因：materialize-route-pool 在 makeRoute 后调用 validateRouteContent(record).accepted 才 addCandidate；accepted repository 已保存本条。

↓

Step10
为什么进入 Feed（如果进入）：
- 未进入或无法证明进入 Feed：没有通过当前报告可验证的 feedReady + onlineCoverAsset 国家匹配。

真正改变路线结果的输入：
- 国家组合：由 destinations 的 countryCode 集合直接决定为 ZA；plausibleCountries/CN block 可过滤，但被删国家候选 Unknown。
- 城市/景点：由 knowledge-graph-pool 候选或 coverageFallbackPlaces 形成 destinationEntities=南非地方生活区 > 南非区域风景带 > 南非文化停留区。
- 天数：由 buildRouteConcept 得到 recommendedDays，再由 concreteDaysFor(hash(profile, destinations, serial)) 固化为 5。
- travelStyle：由 context/profile + buildRouteConcept 决定；保存为 classic-first-trip。
- route title：makeRoute 模板读取 titleCountry + days + styleLabelZh + first/last destination，生成当前标题。
- route summary：makeRoute 固定模板读取 styleLabelZh 和前 3 个目的地，模板化风险最高。

最后补上的标签/非决策字段：
- plannerReason：在路线骨架/concept 后写入；不证明它改变了国家、城市或天数。
- coverageContribution：由生成后的 country/destination 数量汇总；不是生成前输入。
- contentEvidence.provider/evidenceHash：主要是来源/缓存/溯源；一般不改变本条路线内容。
- designStrategies：来自 profile.strategies，更多是 profile 标签；在部分 concept validation 中被读取，但不能逐条证明改变了候选池。

删除输入后的影响判断：
- 删除 country/destinationEntities：会改变国家组合、标题、summary，或无法生成路线。★★★★★
- 删除 travelStyle/profile：会改变 concept、styleLabel、天数推导、标题主题。★★★★★
- 删除 bestMonths：会改变 bestMonths 展示；是否改变路线主体仅 seasonal/profile 可证明，普通路线无法证明。★★☆☆☆
- 删除 designStrategies：可能影响 buildRouteConcept 对 theme/season/transport 的 style 判定；但大量 profile 中是标签，逐条影响无法完全证明。★★☆☆☆
- 删除 plannerReason/coverageContribution：不会改变已生成路线内容。☆

### Route: 洪都拉斯5天经典首访：洪都拉斯文化停留区到洪都拉斯历史城区

- Route ID: `materialized-1cpgc6s-48129`
- 抽样类别: Rail/Transport
- 可证明来源类型: Materialized Template
- 国家: HN
- 目的地: 洪都拉斯文化停留区 > 洪都拉斯门户城市 > 洪都拉斯历史城区
- travelStyle: classic-first-trip
- durationBand / days: 4-6d / 5
- Feed: 无法证明进入当前 Feed ready pool

Decision Trace:

Step1
读取：
- knowledge-graph-pool.json: destination/country candidates, as proven by provenance.source=knowledge-graph-pool or contentEvidence.materialized
- profile/travelStyle=classic-first-trip: proven by travelStyle/travelStyleConceptKey/contentEvidence.travelMode
- countryCodes=HN
- destinationEntities=洪都拉斯文化停留区 > 洪都拉斯门户城市 > 洪都拉斯历史城区
- bestMonths=5-9月
- designStrategies=Geographic+Regional+Theme+Transport
- distance calculation / routePassesPlannerRules: proven by materialize-route-pool.mjs, but per-route rejected alternatives are not persisted

↓

Step2
过滤：
- disabledCountries 包含 CN；plausibleCountries 要求国家组合在 regionGroups 中；routePassesPlannerRules 要求 concept validation、距离完整、maxSegment/span 不超限。

↓

Step3
候选国家：
- 可证明保存结果：HN
- 生成前完整候选国家池：Unknown（accepted route 未保存被扫描/被删除候选列表）。

↓

Step4
为什么保留这些国家：
- 因为这些 destinationEntities 的 countryCode 通过 disabledCountries、plausibleCountries、距离与 concept rules；具体竞争候选 Unknown。

↓

Step5
为什么删除其它国家：
- Unknown。当前 accepted route 没有保存 rejected alternatives；只能从代码知道可能原因包括 CN block、region 不合理、距离超限、pool 为空、dedupe 太近、cluster 饱和。

↓

Step6
为什么生成当前标题：
- route title：makeRoute 模板读取 titleCountry + days + styleLabelZh + first/last destination，生成当前标题。

↓

Step7
为什么生成当前主题：
- profile/theme + buildRouteConcept 生成 travelStyle=classic-first-trip；themes=经典首访。

↓

Step8
为什么生成当前简介：
- route summary：makeRoute 固定模板读取 styleLabelZh 和前 3 个目的地，模板化风险最高。

↓

Step9
为什么进入 Accepted：
- 保存状态：contentQualityStatus=accepted, repositoryStatus=mediaReady, sourceType=planner-designed
- 可证明原因：materialize-route-pool 在 makeRoute 后调用 validateRouteContent(record).accepted 才 addCandidate；accepted repository 已保存本条。

↓

Step10
为什么进入 Feed（如果进入）：
- 未进入或无法证明进入 Feed：没有通过当前报告可验证的 feedReady + onlineCoverAsset 国家匹配。

真正改变路线结果的输入：
- 国家组合：由 destinations 的 countryCode 集合直接决定为 HN；plausibleCountries/CN block 可过滤，但被删国家候选 Unknown。
- 城市/景点：由 knowledge-graph-pool 候选或 coverageFallbackPlaces 形成 destinationEntities=洪都拉斯文化停留区 > 洪都拉斯门户城市 > 洪都拉斯历史城区。
- 天数：由 buildRouteConcept 得到 recommendedDays，再由 concreteDaysFor(hash(profile, destinations, serial)) 固化为 5。
- travelStyle：由 context/profile + buildRouteConcept 决定；保存为 classic-first-trip。
- route title：makeRoute 模板读取 titleCountry + days + styleLabelZh + first/last destination，生成当前标题。
- route summary：makeRoute 固定模板读取 styleLabelZh 和前 3 个目的地，模板化风险最高。

最后补上的标签/非决策字段：
- plannerReason：在路线骨架/concept 后写入；不证明它改变了国家、城市或天数。
- coverageContribution：由生成后的 country/destination 数量汇总；不是生成前输入。
- contentEvidence.provider/evidenceHash：主要是来源/缓存/溯源；一般不改变本条路线内容。
- designStrategies：来自 profile.strategies，更多是 profile 标签；在部分 concept validation 中被读取，但不能逐条证明改变了候选池。

删除输入后的影响判断：
- 删除 country/destinationEntities：会改变国家组合、标题、summary，或无法生成路线。★★★★★
- 删除 travelStyle/profile：会改变 concept、styleLabel、天数推导、标题主题。★★★★★
- 删除 bestMonths：会改变 bestMonths 展示；是否改变路线主体仅 seasonal/profile 可证明，普通路线无法证明。★★☆☆☆
- 删除 designStrategies：可能影响 buildRouteConcept 对 theme/season/transport 的 style 判定；但大量 profile 中是标签，逐条影响无法完全证明。★★☆☆☆
- 删除 plannerReason/coverageContribution：不会改变已生成路线内容。☆

### Route: 新加坡5天经典首访：新加坡门户城市到新加坡区域风景带

- Route ID: `materialized-42cfor-48420`
- 抽样类别: Rail/Transport
- 可证明来源类型: Materialized Template
- 国家: SG
- 目的地: 新加坡门户城市 > 新加坡自然腹地 > 新加坡区域风景带
- travelStyle: classic-first-trip
- durationBand / days: 4-6d / 5
- Feed: 无法证明进入当前 Feed ready pool

Decision Trace:

Step1
读取：
- knowledge-graph-pool.json: destination/country candidates, as proven by provenance.source=knowledge-graph-pool or contentEvidence.materialized
- profile/travelStyle=classic-first-trip: proven by travelStyle/travelStyleConceptKey/contentEvidence.travelMode
- countryCodes=SG
- destinationEntities=新加坡门户城市 > 新加坡自然腹地 > 新加坡区域风景带
- bestMonths=4-10月
- designStrategies=Geographic+Theme+Transport
- distance calculation / routePassesPlannerRules: proven by materialize-route-pool.mjs, but per-route rejected alternatives are not persisted

↓

Step2
过滤：
- disabledCountries 包含 CN；plausibleCountries 要求国家组合在 regionGroups 中；routePassesPlannerRules 要求 concept validation、距离完整、maxSegment/span 不超限。

↓

Step3
候选国家：
- 可证明保存结果：SG
- 生成前完整候选国家池：Unknown（accepted route 未保存被扫描/被删除候选列表）。

↓

Step4
为什么保留这些国家：
- 因为这些 destinationEntities 的 countryCode 通过 disabledCountries、plausibleCountries、距离与 concept rules；具体竞争候选 Unknown。

↓

Step5
为什么删除其它国家：
- Unknown。当前 accepted route 没有保存 rejected alternatives；只能从代码知道可能原因包括 CN block、region 不合理、距离超限、pool 为空、dedupe 太近、cluster 饱和。

↓

Step6
为什么生成当前标题：
- route title：makeRoute 模板读取 titleCountry + days + styleLabelZh + first/last destination，生成当前标题。

↓

Step7
为什么生成当前主题：
- profile/theme + buildRouteConcept 生成 travelStyle=classic-first-trip；themes=经典首访。

↓

Step8
为什么生成当前简介：
- route summary：makeRoute 固定模板读取 styleLabelZh 和前 3 个目的地，模板化风险最高。

↓

Step9
为什么进入 Accepted：
- 保存状态：contentQualityStatus=accepted, repositoryStatus=mediaReady, sourceType=planner-designed
- 可证明原因：materialize-route-pool 在 makeRoute 后调用 validateRouteContent(record).accepted 才 addCandidate；accepted repository 已保存本条。

↓

Step10
为什么进入 Feed（如果进入）：
- 未进入或无法证明进入 Feed：没有通过当前报告可验证的 feedReady + onlineCoverAsset 国家匹配。

真正改变路线结果的输入：
- 国家组合：由 destinations 的 countryCode 集合直接决定为 SG；plausibleCountries/CN block 可过滤，但被删国家候选 Unknown。
- 城市/景点：由 knowledge-graph-pool 候选或 coverageFallbackPlaces 形成 destinationEntities=新加坡门户城市 > 新加坡自然腹地 > 新加坡区域风景带。
- 天数：由 buildRouteConcept 得到 recommendedDays，再由 concreteDaysFor(hash(profile, destinations, serial)) 固化为 5。
- travelStyle：由 context/profile + buildRouteConcept 决定；保存为 classic-first-trip。
- route title：makeRoute 模板读取 titleCountry + days + styleLabelZh + first/last destination，生成当前标题。
- route summary：makeRoute 固定模板读取 styleLabelZh 和前 3 个目的地，模板化风险最高。

最后补上的标签/非决策字段：
- plannerReason：在路线骨架/concept 后写入；不证明它改变了国家、城市或天数。
- coverageContribution：由生成后的 country/destination 数量汇总；不是生成前输入。
- contentEvidence.provider/evidenceHash：主要是来源/缓存/溯源；一般不改变本条路线内容。
- designStrategies：来自 profile.strategies，更多是 profile 标签；在部分 concept validation 中被读取，但不能逐条证明改变了候选池。

删除输入后的影响判断：
- 删除 country/destinationEntities：会改变国家组合、标题、summary，或无法生成路线。★★★★★
- 删除 travelStyle/profile：会改变 concept、styleLabel、天数推导、标题主题。★★★★★
- 删除 bestMonths：会改变 bestMonths 展示；是否改变路线主体仅 seasonal/profile 可证明，普通路线无法证明。★★☆☆☆
- 删除 designStrategies：可能影响 buildRouteConcept 对 theme/season/transport 的 style 判定；但大量 profile 中是标签，逐条影响无法完全证明。★★☆☆☆
- 删除 plannerReason/coverageContribution：不会改变已生成路线内容。☆

### Route: 刚果（布）7天经典首访：刚果（布）门户城市到刚果（布）地方生活区

- Route ID: `materialized-1vmib5m-49227`
- 抽样类别: Rail/Transport
- 可证明来源类型: Materialized Template
- 国家: CG
- 目的地: 刚果（布）门户城市 > 刚果（布）历史城区 > 刚果（布）自然腹地 > 刚果（布）地方生活区
- travelStyle: classic-first-trip
- durationBand / days: 7-10d / 7
- Feed: 无法证明进入当前 Feed ready pool

Decision Trace:

Step1
读取：
- knowledge-graph-pool.json: destination/country candidates, as proven by provenance.source=knowledge-graph-pool or contentEvidence.materialized
- profile/travelStyle=classic-first-trip: proven by travelStyle/travelStyleConceptKey/contentEvidence.travelMode
- countryCodes=CG
- destinationEntities=刚果（布）门户城市 > 刚果（布）历史城区 > 刚果（布）自然腹地 > 刚果（布）地方生活区
- bestMonths=5-9月
- designStrategies=Geographic+Regional+Theme+Transport
- distance calculation / routePassesPlannerRules: proven by materialize-route-pool.mjs, but per-route rejected alternatives are not persisted

↓

Step2
过滤：
- disabledCountries 包含 CN；plausibleCountries 要求国家组合在 regionGroups 中；routePassesPlannerRules 要求 concept validation、距离完整、maxSegment/span 不超限。

↓

Step3
候选国家：
- 可证明保存结果：CG
- 生成前完整候选国家池：Unknown（accepted route 未保存被扫描/被删除候选列表）。

↓

Step4
为什么保留这些国家：
- 因为这些 destinationEntities 的 countryCode 通过 disabledCountries、plausibleCountries、距离与 concept rules；具体竞争候选 Unknown。

↓

Step5
为什么删除其它国家：
- Unknown。当前 accepted route 没有保存 rejected alternatives；只能从代码知道可能原因包括 CN block、region 不合理、距离超限、pool 为空、dedupe 太近、cluster 饱和。

↓

Step6
为什么生成当前标题：
- route title：makeRoute 模板读取 titleCountry + days + styleLabelZh + first/last destination，生成当前标题。

↓

Step7
为什么生成当前主题：
- profile/theme + buildRouteConcept 生成 travelStyle=classic-first-trip；themes=经典首访。

↓

Step8
为什么生成当前简介：
- route summary：makeRoute 固定模板读取 styleLabelZh 和前 3 个目的地，模板化风险最高。

↓

Step9
为什么进入 Accepted：
- 保存状态：contentQualityStatus=accepted, repositoryStatus=mediaReady, sourceType=planner-designed
- 可证明原因：materialize-route-pool 在 makeRoute 后调用 validateRouteContent(record).accepted 才 addCandidate；accepted repository 已保存本条。

↓

Step10
为什么进入 Feed（如果进入）：
- 未进入或无法证明进入 Feed：没有通过当前报告可验证的 feedReady + onlineCoverAsset 国家匹配。

真正改变路线结果的输入：
- 国家组合：由 destinations 的 countryCode 集合直接决定为 CG；plausibleCountries/CN block 可过滤，但被删国家候选 Unknown。
- 城市/景点：由 knowledge-graph-pool 候选或 coverageFallbackPlaces 形成 destinationEntities=刚果（布）门户城市 > 刚果（布）历史城区 > 刚果（布）自然腹地 > 刚果（布）地方生活区。
- 天数：由 buildRouteConcept 得到 recommendedDays，再由 concreteDaysFor(hash(profile, destinations, serial)) 固化为 7。
- travelStyle：由 context/profile + buildRouteConcept 决定；保存为 classic-first-trip。
- route title：makeRoute 模板读取 titleCountry + days + styleLabelZh + first/last destination，生成当前标题。
- route summary：makeRoute 固定模板读取 styleLabelZh 和前 3 个目的地，模板化风险最高。

最后补上的标签/非决策字段：
- plannerReason：在路线骨架/concept 后写入；不证明它改变了国家、城市或天数。
- coverageContribution：由生成后的 country/destination 数量汇总；不是生成前输入。
- contentEvidence.provider/evidenceHash：主要是来源/缓存/溯源；一般不改变本条路线内容。
- designStrategies：来自 profile.strategies，更多是 profile 标签；在部分 concept validation 中被读取，但不能逐条证明改变了候选池。

删除输入后的影响判断：
- 删除 country/destinationEntities：会改变国家组合、标题、summary，或无法生成路线。★★★★★
- 删除 travelStyle/profile：会改变 concept、styleLabel、天数推导、标题主题。★★★★★
- 删除 bestMonths：会改变 bestMonths 展示；是否改变路线主体仅 seasonal/profile 可证明，普通路线无法证明。★★☆☆☆
- 删除 designStrategies：可能影响 buildRouteConcept 对 theme/season/transport 的 style 判定；但大量 profile 中是标签，逐条影响无法完全证明。★★☆☆☆
- 删除 plannerReason/coverageContribution：不会改变已生成路线内容。☆

### Route: 墨西哥8天经典首访：墨西哥历史城区到墨西哥区域风景带

- Route ID: `materialized-f677l6-51893`
- 抽样类别: Rail/Transport
- 可证明来源类型: Materialized Template
- 国家: MX
- 目的地: 墨西哥历史城区 > 墨西哥自然腹地 > 墨西哥地方生活区 > 墨西哥区域风景带
- travelStyle: classic-first-trip
- durationBand / days: 7-10d / 8
- Feed: 无法证明进入当前 Feed ready pool

Decision Trace:

Step1
读取：
- knowledge-graph-pool.json: destination/country candidates, as proven by provenance.source=knowledge-graph-pool or contentEvidence.materialized
- profile/travelStyle=classic-first-trip: proven by travelStyle/travelStyleConceptKey/contentEvidence.travelMode
- countryCodes=MX
- destinationEntities=墨西哥历史城区 > 墨西哥自然腹地 > 墨西哥地方生活区 > 墨西哥区域风景带
- bestMonths=4-10月
- designStrategies=Geographic+Theme+Transport
- distance calculation / routePassesPlannerRules: proven by materialize-route-pool.mjs, but per-route rejected alternatives are not persisted

↓

Step2
过滤：
- disabledCountries 包含 CN；plausibleCountries 要求国家组合在 regionGroups 中；routePassesPlannerRules 要求 concept validation、距离完整、maxSegment/span 不超限。

↓

Step3
候选国家：
- 可证明保存结果：MX
- 生成前完整候选国家池：Unknown（accepted route 未保存被扫描/被删除候选列表）。

↓

Step4
为什么保留这些国家：
- 因为这些 destinationEntities 的 countryCode 通过 disabledCountries、plausibleCountries、距离与 concept rules；具体竞争候选 Unknown。

↓

Step5
为什么删除其它国家：
- Unknown。当前 accepted route 没有保存 rejected alternatives；只能从代码知道可能原因包括 CN block、region 不合理、距离超限、pool 为空、dedupe 太近、cluster 饱和。

↓

Step6
为什么生成当前标题：
- route title：makeRoute 模板读取 titleCountry + days + styleLabelZh + first/last destination，生成当前标题。

↓

Step7
为什么生成当前主题：
- profile/theme + buildRouteConcept 生成 travelStyle=classic-first-trip；themes=经典首访。

↓

Step8
为什么生成当前简介：
- route summary：makeRoute 固定模板读取 styleLabelZh 和前 3 个目的地，模板化风险最高。

↓

Step9
为什么进入 Accepted：
- 保存状态：contentQualityStatus=accepted, repositoryStatus=mediaReady, sourceType=planner-designed
- 可证明原因：materialize-route-pool 在 makeRoute 后调用 validateRouteContent(record).accepted 才 addCandidate；accepted repository 已保存本条。

↓

Step10
为什么进入 Feed（如果进入）：
- 未进入或无法证明进入 Feed：没有通过当前报告可验证的 feedReady + onlineCoverAsset 国家匹配。

真正改变路线结果的输入：
- 国家组合：由 destinations 的 countryCode 集合直接决定为 MX；plausibleCountries/CN block 可过滤，但被删国家候选 Unknown。
- 城市/景点：由 knowledge-graph-pool 候选或 coverageFallbackPlaces 形成 destinationEntities=墨西哥历史城区 > 墨西哥自然腹地 > 墨西哥地方生活区 > 墨西哥区域风景带。
- 天数：由 buildRouteConcept 得到 recommendedDays，再由 concreteDaysFor(hash(profile, destinations, serial)) 固化为 8。
- travelStyle：由 context/profile + buildRouteConcept 决定；保存为 classic-first-trip。
- route title：makeRoute 模板读取 titleCountry + days + styleLabelZh + first/last destination，生成当前标题。
- route summary：makeRoute 固定模板读取 styleLabelZh 和前 3 个目的地，模板化风险最高。

最后补上的标签/非决策字段：
- plannerReason：在路线骨架/concept 后写入；不证明它改变了国家、城市或天数。
- coverageContribution：由生成后的 country/destination 数量汇总；不是生成前输入。
- contentEvidence.provider/evidenceHash：主要是来源/缓存/溯源；一般不改变本条路线内容。
- designStrategies：来自 profile.strategies，更多是 profile 标签；在部分 concept validation 中被读取，但不能逐条证明改变了候选池。

删除输入后的影响判断：
- 删除 country/destinationEntities：会改变国家组合、标题、summary，或无法生成路线。★★★★★
- 删除 travelStyle/profile：会改变 concept、styleLabel、天数推导、标题主题。★★★★★
- 删除 bestMonths：会改变 bestMonths 展示；是否改变路线主体仅 seasonal/profile 可证明，普通路线无法证明。★★☆☆☆
- 删除 designStrategies：可能影响 buildRouteConcept 对 theme/season/transport 的 style 判定；但大量 profile 中是标签，逐条影响无法完全证明。★★☆☆☆
- 删除 plannerReason/coverageContribution：不会改变已生成路线内容。☆

### Route: 土耳其5天铁路旅程：以弗所到代林库尤地下城

- Route ID: `materialized-760uh0-52240`
- 抽样类别: Rail/Transport
- 可证明来源类型: Materialized Template
- 国家: TR
- 目的地: 以弗所 > 棉花堡 > 代林库尤地下城
- travelStyle: rail-journey
- durationBand / days: 4-6d / 5
- Feed: 可证明进入当前 Feed ready pool 的候选

Decision Trace:

Step1
读取：
- knowledge-graph-pool.json: destination/country candidates, as proven by provenance.source=knowledge-graph-pool or contentEvidence.materialized
- profile/travelStyle=rail-journey: proven by travelStyle/travelStyleConceptKey/contentEvidence.travelMode
- countryCodes=TR
- destinationEntities=以弗所 > 棉花堡 > 代林库尤地下城
- bestMonths=4-10月
- designStrategies=Geographic+Transport+Theme
- distance calculation / routePassesPlannerRules: proven by materialize-route-pool.mjs, but per-route rejected alternatives are not persisted

↓

Step2
过滤：
- disabledCountries 包含 CN；plausibleCountries 要求国家组合在 regionGroups 中；routePassesPlannerRules 要求 concept validation、距离完整、maxSegment/span 不超限。

↓

Step3
候选国家：
- 可证明保存结果：TR
- 生成前完整候选国家池：Unknown（accepted route 未保存被扫描/被删除候选列表）。

↓

Step4
为什么保留这些国家：
- 因为这些 destinationEntities 的 countryCode 通过 disabledCountries、plausibleCountries、距离与 concept rules；具体竞争候选 Unknown。

↓

Step5
为什么删除其它国家：
- Unknown。当前 accepted route 没有保存 rejected alternatives；只能从代码知道可能原因包括 CN block、region 不合理、距离超限、pool 为空、dedupe 太近、cluster 饱和。

↓

Step6
为什么生成当前标题：
- route title：makeRoute 模板读取 titleCountry + days + styleLabelZh + first/last destination，生成当前标题。

↓

Step7
为什么生成当前主题：
- profile/theme + buildRouteConcept 生成 travelStyle=rail-journey；themes=铁路旅程。

↓

Step8
为什么生成当前简介：
- route summary：makeRoute 固定模板读取 styleLabelZh 和前 3 个目的地，模板化风险最高。

↓

Step9
为什么进入 Accepted：
- 保存状态：contentQualityStatus=accepted, repositoryStatus=mediaReady, sourceType=planner-designed
- 可证明原因：materialize-route-pool 在 makeRoute 后调用 validateRouteContent(record).accepted 才 addCandidate；accepted repository 已保存本条。

↓

Step10
为什么进入 Feed（如果进入）：
- 进入 Feed 的可证明原因：accepted repository 中存在 feedReady onlineCoverAsset，imageCountryCodes 与路线国家有交集；Feed 还会受当前 cursor/random/quality 排序影响。

真正改变路线结果的输入：
- 国家组合：由 destinations 的 countryCode 集合直接决定为 TR；plausibleCountries/CN block 可过滤，但被删国家候选 Unknown。
- 城市/景点：由 knowledge-graph-pool 候选或 coverageFallbackPlaces 形成 destinationEntities=以弗所 > 棉花堡 > 代林库尤地下城。
- 天数：由 buildRouteConcept 得到 recommendedDays，再由 concreteDaysFor(hash(profile, destinations, serial)) 固化为 5。
- travelStyle：由 context/profile + buildRouteConcept 决定；保存为 rail-journey。
- route title：makeRoute 模板读取 titleCountry + days + styleLabelZh + first/last destination，生成当前标题。
- route summary：makeRoute 固定模板读取 styleLabelZh 和前 3 个目的地，模板化风险最高。

最后补上的标签/非决策字段：
- plannerReason：在路线骨架/concept 后写入；不证明它改变了国家、城市或天数。
- coverageContribution：由生成后的 country/destination 数量汇总；不是生成前输入。
- contentEvidence.provider/evidenceHash：主要是来源/缓存/溯源；一般不改变本条路线内容。
- designStrategies：来自 profile.strategies，更多是 profile 标签；在部分 concept validation 中被读取，但不能逐条证明改变了候选池。

删除输入后的影响判断：
- 删除 country/destinationEntities：会改变国家组合、标题、summary，或无法生成路线。★★★★★
- 删除 travelStyle/profile：会改变 concept、styleLabel、天数推导、标题主题。★★★★★
- 删除 bestMonths：会改变 bestMonths 展示；是否改变路线主体仅 seasonal/profile 可证明，普通路线无法证明。★★☆☆☆
- 删除 designStrategies：可能影响 buildRouteConcept 对 theme/season/transport 的 style 判定；但大量 profile 中是标签，逐条影响无法完全证明。★★☆☆☆
- 删除 plannerReason/coverageContribution：不会改变已生成路线内容。☆

### Route: 基里巴斯7天公路自驾：基里巴斯区域风景带到基里巴斯历史城区

- Route ID: `materialized-186rnwb-52533`
- 抽样类别: Rail/Transport
- 可证明来源类型: Materialized Template
- 国家: KI
- 目的地: 基里巴斯区域风景带 > 基里巴斯文化停留区 > 基里巴斯门户城市 > 基里巴斯历史城区
- travelStyle: road-trip
- durationBand / days: 7-10d / 7
- Feed: 无法证明进入当前 Feed ready pool

Decision Trace:

Step1
读取：
- knowledge-graph-pool.json: destination/country candidates, as proven by provenance.source=knowledge-graph-pool or contentEvidence.materialized
- profile/travelStyle=road-trip: proven by travelStyle/travelStyleConceptKey/contentEvidence.travelMode
- countryCodes=KI
- destinationEntities=基里巴斯区域风景带 > 基里巴斯文化停留区 > 基里巴斯门户城市 > 基里巴斯历史城区
- bestMonths=5-9月
- designStrategies=Geographic+Transport+Theme
- distance calculation / routePassesPlannerRules: proven by materialize-route-pool.mjs, but per-route rejected alternatives are not persisted

↓

Step2
过滤：
- disabledCountries 包含 CN；plausibleCountries 要求国家组合在 regionGroups 中；routePassesPlannerRules 要求 concept validation、距离完整、maxSegment/span 不超限。

↓

Step3
候选国家：
- 可证明保存结果：KI
- 生成前完整候选国家池：Unknown（accepted route 未保存被扫描/被删除候选列表）。

↓

Step4
为什么保留这些国家：
- 因为这些 destinationEntities 的 countryCode 通过 disabledCountries、plausibleCountries、距离与 concept rules；具体竞争候选 Unknown。

↓

Step5
为什么删除其它国家：
- Unknown。当前 accepted route 没有保存 rejected alternatives；只能从代码知道可能原因包括 CN block、region 不合理、距离超限、pool 为空、dedupe 太近、cluster 饱和。

↓

Step6
为什么生成当前标题：
- route title：makeRoute 模板读取 titleCountry + days + styleLabelZh + first/last destination，生成当前标题。

↓

Step7
为什么生成当前主题：
- profile/theme + buildRouteConcept 生成 travelStyle=road-trip；themes=公路自驾。

↓

Step8
为什么生成当前简介：
- route summary：makeRoute 固定模板读取 styleLabelZh 和前 3 个目的地，模板化风险最高。

↓

Step9
为什么进入 Accepted：
- 保存状态：contentQualityStatus=accepted, repositoryStatus=mediaReady, sourceType=planner-designed
- 可证明原因：materialize-route-pool 在 makeRoute 后调用 validateRouteContent(record).accepted 才 addCandidate；accepted repository 已保存本条。

↓

Step10
为什么进入 Feed（如果进入）：
- 未进入或无法证明进入 Feed：没有通过当前报告可验证的 feedReady + onlineCoverAsset 国家匹配。

真正改变路线结果的输入：
- 国家组合：由 destinations 的 countryCode 集合直接决定为 KI；plausibleCountries/CN block 可过滤，但被删国家候选 Unknown。
- 城市/景点：由 knowledge-graph-pool 候选或 coverageFallbackPlaces 形成 destinationEntities=基里巴斯区域风景带 > 基里巴斯文化停留区 > 基里巴斯门户城市 > 基里巴斯历史城区。
- 天数：由 buildRouteConcept 得到 recommendedDays，再由 concreteDaysFor(hash(profile, destinations, serial)) 固化为 7。
- travelStyle：由 context/profile + buildRouteConcept 决定；保存为 road-trip。
- route title：makeRoute 模板读取 titleCountry + days + styleLabelZh + first/last destination，生成当前标题。
- route summary：makeRoute 固定模板读取 styleLabelZh 和前 3 个目的地，模板化风险最高。

最后补上的标签/非决策字段：
- plannerReason：在路线骨架/concept 后写入；不证明它改变了国家、城市或天数。
- coverageContribution：由生成后的 country/destination 数量汇总；不是生成前输入。
- contentEvidence.provider/evidenceHash：主要是来源/缓存/溯源；一般不改变本条路线内容。
- designStrategies：来自 profile.strategies，更多是 profile 标签；在部分 concept validation 中被读取，但不能逐条证明改变了候选池。

删除输入后的影响判断：
- 删除 country/destinationEntities：会改变国家组合、标题、summary，或无法生成路线。★★★★★
- 删除 travelStyle/profile：会改变 concept、styleLabel、天数推导、标题主题。★★★★★
- 删除 bestMonths：会改变 bestMonths 展示；是否改变路线主体仅 seasonal/profile 可证明，普通路线无法证明。★★☆☆☆
- 删除 designStrategies：可能影响 buildRouteConcept 对 theme/season/transport 的 style 判定；但大量 profile 中是标签，逐条影响无法完全证明。★★☆☆☆
- 删除 plannerReason/coverageContribution：不会改变已生成路线内容。☆

### Route: 泰国7天经典首访：泰国文化停留区到泰国自然腹地

- Route ID: `materialized-1ur8951-52811`
- 抽样类别: Rail/Transport
- 可证明来源类型: Materialized Template
- 国家: TH
- 目的地: 泰国文化停留区 > 泰国门户城市 > 泰国历史城区 > 泰国自然腹地
- travelStyle: classic-first-trip
- durationBand / days: 7-10d / 7
- Feed: 无法证明进入当前 Feed ready pool

Decision Trace:

Step1
读取：
- knowledge-graph-pool.json: destination/country candidates, as proven by provenance.source=knowledge-graph-pool or contentEvidence.materialized
- profile/travelStyle=classic-first-trip: proven by travelStyle/travelStyleConceptKey/contentEvidence.travelMode
- countryCodes=TH
- destinationEntities=泰国文化停留区 > 泰国门户城市 > 泰国历史城区 > 泰国自然腹地
- bestMonths=5-9月
- designStrategies=Geographic+Regional+Theme+Transport
- distance calculation / routePassesPlannerRules: proven by materialize-route-pool.mjs, but per-route rejected alternatives are not persisted

↓

Step2
过滤：
- disabledCountries 包含 CN；plausibleCountries 要求国家组合在 regionGroups 中；routePassesPlannerRules 要求 concept validation、距离完整、maxSegment/span 不超限。

↓

Step3
候选国家：
- 可证明保存结果：TH
- 生成前完整候选国家池：Unknown（accepted route 未保存被扫描/被删除候选列表）。

↓

Step4
为什么保留这些国家：
- 因为这些 destinationEntities 的 countryCode 通过 disabledCountries、plausibleCountries、距离与 concept rules；具体竞争候选 Unknown。

↓

Step5
为什么删除其它国家：
- Unknown。当前 accepted route 没有保存 rejected alternatives；只能从代码知道可能原因包括 CN block、region 不合理、距离超限、pool 为空、dedupe 太近、cluster 饱和。

↓

Step6
为什么生成当前标题：
- route title：makeRoute 模板读取 titleCountry + days + styleLabelZh + first/last destination，生成当前标题。

↓

Step7
为什么生成当前主题：
- profile/theme + buildRouteConcept 生成 travelStyle=classic-first-trip；themes=经典首访。

↓

Step8
为什么生成当前简介：
- route summary：makeRoute 固定模板读取 styleLabelZh 和前 3 个目的地，模板化风险最高。

↓

Step9
为什么进入 Accepted：
- 保存状态：contentQualityStatus=accepted, repositoryStatus=mediaReady, sourceType=planner-designed
- 可证明原因：materialize-route-pool 在 makeRoute 后调用 validateRouteContent(record).accepted 才 addCandidate；accepted repository 已保存本条。

↓

Step10
为什么进入 Feed（如果进入）：
- 未进入或无法证明进入 Feed：没有通过当前报告可验证的 feedReady + onlineCoverAsset 国家匹配。

真正改变路线结果的输入：
- 国家组合：由 destinations 的 countryCode 集合直接决定为 TH；plausibleCountries/CN block 可过滤，但被删国家候选 Unknown。
- 城市/景点：由 knowledge-graph-pool 候选或 coverageFallbackPlaces 形成 destinationEntities=泰国文化停留区 > 泰国门户城市 > 泰国历史城区 > 泰国自然腹地。
- 天数：由 buildRouteConcept 得到 recommendedDays，再由 concreteDaysFor(hash(profile, destinations, serial)) 固化为 7。
- travelStyle：由 context/profile + buildRouteConcept 决定；保存为 classic-first-trip。
- route title：makeRoute 模板读取 titleCountry + days + styleLabelZh + first/last destination，生成当前标题。
- route summary：makeRoute 固定模板读取 styleLabelZh 和前 3 个目的地，模板化风险最高。

最后补上的标签/非决策字段：
- plannerReason：在路线骨架/concept 后写入；不证明它改变了国家、城市或天数。
- coverageContribution：由生成后的 country/destination 数量汇总；不是生成前输入。
- contentEvidence.provider/evidenceHash：主要是来源/缓存/溯源；一般不改变本条路线内容。
- designStrategies：来自 profile.strategies，更多是 profile 标签；在部分 concept validation 中被读取，但不能逐条证明改变了候选池。

删除输入后的影响判断：
- 删除 country/destinationEntities：会改变国家组合、标题、summary，或无法生成路线。★★★★★
- 删除 travelStyle/profile：会改变 concept、styleLabel、天数推导、标题主题。★★★★★
- 删除 bestMonths：会改变 bestMonths 展示；是否改变路线主体仅 seasonal/profile 可证明，普通路线无法证明。★★☆☆☆
- 删除 designStrategies：可能影响 buildRouteConcept 对 theme/season/transport 的 style 判定；但大量 profile 中是标签，逐条影响无法完全证明。★★☆☆☆
- 删除 plannerReason/coverageContribution：不会改变已生成路线内容。☆

### Route: 埃及8天经典首访：埃及历史城区到埃及文化停留区

- Route ID: `materialized-1e5uoxd-54216`
- 抽样类别: Rail/Transport
- 可证明来源类型: Materialized Template
- 国家: EG
- 目的地: 埃及历史城区 > 埃及自然腹地 > 埃及地方生活区 > 埃及区域风景带 > 埃及文化停留区
- travelStyle: classic-first-trip
- durationBand / days: 7-10d / 8
- Feed: 无法证明进入当前 Feed ready pool

Decision Trace:

Step1
读取：
- knowledge-graph-pool.json: destination/country candidates, as proven by provenance.source=knowledge-graph-pool or contentEvidence.materialized
- profile/travelStyle=classic-first-trip: proven by travelStyle/travelStyleConceptKey/contentEvidence.travelMode
- countryCodes=EG
- destinationEntities=埃及历史城区 > 埃及自然腹地 > 埃及地方生活区 > 埃及区域风景带 > 埃及文化停留区
- bestMonths=4-10月
- designStrategies=Geographic+Theme+Transport
- distance calculation / routePassesPlannerRules: proven by materialize-route-pool.mjs, but per-route rejected alternatives are not persisted

↓

Step2
过滤：
- disabledCountries 包含 CN；plausibleCountries 要求国家组合在 regionGroups 中；routePassesPlannerRules 要求 concept validation、距离完整、maxSegment/span 不超限。

↓

Step3
候选国家：
- 可证明保存结果：EG
- 生成前完整候选国家池：Unknown（accepted route 未保存被扫描/被删除候选列表）。

↓

Step4
为什么保留这些国家：
- 因为这些 destinationEntities 的 countryCode 通过 disabledCountries、plausibleCountries、距离与 concept rules；具体竞争候选 Unknown。

↓

Step5
为什么删除其它国家：
- Unknown。当前 accepted route 没有保存 rejected alternatives；只能从代码知道可能原因包括 CN block、region 不合理、距离超限、pool 为空、dedupe 太近、cluster 饱和。

↓

Step6
为什么生成当前标题：
- route title：makeRoute 模板读取 titleCountry + days + styleLabelZh + first/last destination，生成当前标题。

↓

Step7
为什么生成当前主题：
- profile/theme + buildRouteConcept 生成 travelStyle=classic-first-trip；themes=经典首访。

↓

Step8
为什么生成当前简介：
- route summary：makeRoute 固定模板读取 styleLabelZh 和前 3 个目的地，模板化风险最高。

↓

Step9
为什么进入 Accepted：
- 保存状态：contentQualityStatus=accepted, repositoryStatus=mediaReady, sourceType=planner-designed
- 可证明原因：materialize-route-pool 在 makeRoute 后调用 validateRouteContent(record).accepted 才 addCandidate；accepted repository 已保存本条。

↓

Step10
为什么进入 Feed（如果进入）：
- 未进入或无法证明进入 Feed：没有通过当前报告可验证的 feedReady + onlineCoverAsset 国家匹配。

真正改变路线结果的输入：
- 国家组合：由 destinations 的 countryCode 集合直接决定为 EG；plausibleCountries/CN block 可过滤，但被删国家候选 Unknown。
- 城市/景点：由 knowledge-graph-pool 候选或 coverageFallbackPlaces 形成 destinationEntities=埃及历史城区 > 埃及自然腹地 > 埃及地方生活区 > 埃及区域风景带 > 埃及文化停留区。
- 天数：由 buildRouteConcept 得到 recommendedDays，再由 concreteDaysFor(hash(profile, destinations, serial)) 固化为 8。
- travelStyle：由 context/profile + buildRouteConcept 决定；保存为 classic-first-trip。
- route title：makeRoute 模板读取 titleCountry + days + styleLabelZh + first/last destination，生成当前标题。
- route summary：makeRoute 固定模板读取 styleLabelZh 和前 3 个目的地，模板化风险最高。

最后补上的标签/非决策字段：
- plannerReason：在路线骨架/concept 后写入；不证明它改变了国家、城市或天数。
- coverageContribution：由生成后的 country/destination 数量汇总；不是生成前输入。
- contentEvidence.provider/evidenceHash：主要是来源/缓存/溯源；一般不改变本条路线内容。
- designStrategies：来自 profile.strategies，更多是 profile 标签；在部分 concept validation 中被读取，但不能逐条证明改变了候选池。

删除输入后的影响判断：
- 删除 country/destinationEntities：会改变国家组合、标题、summary，或无法生成路线。★★★★★
- 删除 travelStyle/profile：会改变 concept、styleLabel、天数推导、标题主题。★★★★★
- 删除 bestMonths：会改变 bestMonths 展示；是否改变路线主体仅 seasonal/profile 可证明，普通路线无法证明。★★☆☆☆
- 删除 designStrategies：可能影响 buildRouteConcept 对 theme/season/transport 的 style 判定；但大量 profile 中是标签，逐条影响无法完全证明。★★☆☆☆
- 删除 plannerReason/coverageContribution：不会改变已生成路线内容。☆

### Route: 巴基斯坦10天公路自驾：巴基斯坦自然腹地到巴基斯坦门户城市

- Route ID: `materialized-p4htk1-54492`
- 抽样类别: Rail/Transport
- 可证明来源类型: Materialized Template
- 国家: PK
- 目的地: 巴基斯坦自然腹地 > 巴基斯坦地方生活区 > 巴基斯坦区域风景带 > 巴基斯坦文化停留区 > 巴基斯坦门户城市
- travelStyle: road-trip
- durationBand / days: 7-10d / 10
- Feed: 无法证明进入当前 Feed ready pool

Decision Trace:

Step1
读取：
- knowledge-graph-pool.json: destination/country candidates, as proven by provenance.source=knowledge-graph-pool or contentEvidence.materialized
- profile/travelStyle=road-trip: proven by travelStyle/travelStyleConceptKey/contentEvidence.travelMode
- countryCodes=PK
- destinationEntities=巴基斯坦自然腹地 > 巴基斯坦地方生活区 > 巴基斯坦区域风景带 > 巴基斯坦文化停留区 > 巴基斯坦门户城市
- bestMonths=5-9月
- designStrategies=Geographic+Transport+Theme
- distance calculation / routePassesPlannerRules: proven by materialize-route-pool.mjs, but per-route rejected alternatives are not persisted

↓

Step2
过滤：
- disabledCountries 包含 CN；plausibleCountries 要求国家组合在 regionGroups 中；routePassesPlannerRules 要求 concept validation、距离完整、maxSegment/span 不超限。

↓

Step3
候选国家：
- 可证明保存结果：PK
- 生成前完整候选国家池：Unknown（accepted route 未保存被扫描/被删除候选列表）。

↓

Step4
为什么保留这些国家：
- 因为这些 destinationEntities 的 countryCode 通过 disabledCountries、plausibleCountries、距离与 concept rules；具体竞争候选 Unknown。

↓

Step5
为什么删除其它国家：
- Unknown。当前 accepted route 没有保存 rejected alternatives；只能从代码知道可能原因包括 CN block、region 不合理、距离超限、pool 为空、dedupe 太近、cluster 饱和。

↓

Step6
为什么生成当前标题：
- route title：makeRoute 模板读取 titleCountry + days + styleLabelZh + first/last destination，生成当前标题。

↓

Step7
为什么生成当前主题：
- profile/theme + buildRouteConcept 生成 travelStyle=road-trip；themes=公路自驾。

↓

Step8
为什么生成当前简介：
- route summary：makeRoute 固定模板读取 styleLabelZh 和前 3 个目的地，模板化风险最高。

↓

Step9
为什么进入 Accepted：
- 保存状态：contentQualityStatus=accepted, repositoryStatus=mediaReady, sourceType=planner-designed
- 可证明原因：materialize-route-pool 在 makeRoute 后调用 validateRouteContent(record).accepted 才 addCandidate；accepted repository 已保存本条。

↓

Step10
为什么进入 Feed（如果进入）：
- 未进入或无法证明进入 Feed：没有通过当前报告可验证的 feedReady + onlineCoverAsset 国家匹配。

真正改变路线结果的输入：
- 国家组合：由 destinations 的 countryCode 集合直接决定为 PK；plausibleCountries/CN block 可过滤，但被删国家候选 Unknown。
- 城市/景点：由 knowledge-graph-pool 候选或 coverageFallbackPlaces 形成 destinationEntities=巴基斯坦自然腹地 > 巴基斯坦地方生活区 > 巴基斯坦区域风景带 > 巴基斯坦文化停留区 > 巴基斯坦门户城市。
- 天数：由 buildRouteConcept 得到 recommendedDays，再由 concreteDaysFor(hash(profile, destinations, serial)) 固化为 10。
- travelStyle：由 context/profile + buildRouteConcept 决定；保存为 road-trip。
- route title：makeRoute 模板读取 titleCountry + days + styleLabelZh + first/last destination，生成当前标题。
- route summary：makeRoute 固定模板读取 styleLabelZh 和前 3 个目的地，模板化风险最高。

最后补上的标签/非决策字段：
- plannerReason：在路线骨架/concept 后写入；不证明它改变了国家、城市或天数。
- coverageContribution：由生成后的 country/destination 数量汇总；不是生成前输入。
- contentEvidence.provider/evidenceHash：主要是来源/缓存/溯源；一般不改变本条路线内容。
- designStrategies：来自 profile.strategies，更多是 profile 标签；在部分 concept validation 中被读取，但不能逐条证明改变了候选池。

删除输入后的影响判断：
- 删除 country/destinationEntities：会改变国家组合、标题、summary，或无法生成路线。★★★★★
- 删除 travelStyle/profile：会改变 concept、styleLabel、天数推导、标题主题。★★★★★
- 删除 bestMonths：会改变 bestMonths 展示；是否改变路线主体仅 seasonal/profile 可证明，普通路线无法证明。★★☆☆☆
- 删除 designStrategies：可能影响 buildRouteConcept 对 theme/season/transport 的 style 判定；但大量 profile 中是标签，逐条影响无法完全证明。★★☆☆☆
- 删除 plannerReason/coverageContribution：不会改变已生成路线内容。☆

### Route: 巴林10天铁路旅程：巴林区域风景带到巴林自然腹地

- Route ID: `materialized-1slfh2r-54778`
- 抽样类别: Rail/Transport
- 可证明来源类型: Materialized Template
- 国家: BH
- 目的地: 巴林区域风景带 > 巴林文化停留区 > 巴林门户城市 > 巴林历史城区 > 巴林自然腹地
- travelStyle: rail-journey
- durationBand / days: 7-10d / 10
- Feed: 无法证明进入当前 Feed ready pool

Decision Trace:

Step1
读取：
- knowledge-graph-pool.json: destination/country candidates, as proven by provenance.source=knowledge-graph-pool or contentEvidence.materialized
- profile/travelStyle=rail-journey: proven by travelStyle/travelStyleConceptKey/contentEvidence.travelMode
- countryCodes=BH
- destinationEntities=巴林区域风景带 > 巴林文化停留区 > 巴林门户城市 > 巴林历史城区 > 巴林自然腹地
- bestMonths=4-10月
- designStrategies=Geographic+Transport+Theme
- distance calculation / routePassesPlannerRules: proven by materialize-route-pool.mjs, but per-route rejected alternatives are not persisted

↓

Step2
过滤：
- disabledCountries 包含 CN；plausibleCountries 要求国家组合在 regionGroups 中；routePassesPlannerRules 要求 concept validation、距离完整、maxSegment/span 不超限。

↓

Step3
候选国家：
- 可证明保存结果：BH
- 生成前完整候选国家池：Unknown（accepted route 未保存被扫描/被删除候选列表）。

↓

Step4
为什么保留这些国家：
- 因为这些 destinationEntities 的 countryCode 通过 disabledCountries、plausibleCountries、距离与 concept rules；具体竞争候选 Unknown。

↓

Step5
为什么删除其它国家：
- Unknown。当前 accepted route 没有保存 rejected alternatives；只能从代码知道可能原因包括 CN block、region 不合理、距离超限、pool 为空、dedupe 太近、cluster 饱和。

↓

Step6
为什么生成当前标题：
- route title：makeRoute 模板读取 titleCountry + days + styleLabelZh + first/last destination，生成当前标题。

↓

Step7
为什么生成当前主题：
- profile/theme + buildRouteConcept 生成 travelStyle=rail-journey；themes=铁路旅程。

↓

Step8
为什么生成当前简介：
- route summary：makeRoute 固定模板读取 styleLabelZh 和前 3 个目的地，模板化风险最高。

↓

Step9
为什么进入 Accepted：
- 保存状态：contentQualityStatus=accepted, repositoryStatus=mediaReady, sourceType=planner-designed
- 可证明原因：materialize-route-pool 在 makeRoute 后调用 validateRouteContent(record).accepted 才 addCandidate；accepted repository 已保存本条。

↓

Step10
为什么进入 Feed（如果进入）：
- 未进入或无法证明进入 Feed：没有通过当前报告可验证的 feedReady + onlineCoverAsset 国家匹配。

真正改变路线结果的输入：
- 国家组合：由 destinations 的 countryCode 集合直接决定为 BH；plausibleCountries/CN block 可过滤，但被删国家候选 Unknown。
- 城市/景点：由 knowledge-graph-pool 候选或 coverageFallbackPlaces 形成 destinationEntities=巴林区域风景带 > 巴林文化停留区 > 巴林门户城市 > 巴林历史城区 > 巴林自然腹地。
- 天数：由 buildRouteConcept 得到 recommendedDays，再由 concreteDaysFor(hash(profile, destinations, serial)) 固化为 10。
- travelStyle：由 context/profile + buildRouteConcept 决定；保存为 rail-journey。
- route title：makeRoute 模板读取 titleCountry + days + styleLabelZh + first/last destination，生成当前标题。
- route summary：makeRoute 固定模板读取 styleLabelZh 和前 3 个目的地，模板化风险最高。

最后补上的标签/非决策字段：
- plannerReason：在路线骨架/concept 后写入；不证明它改变了国家、城市或天数。
- coverageContribution：由生成后的 country/destination 数量汇总；不是生成前输入。
- contentEvidence.provider/evidenceHash：主要是来源/缓存/溯源；一般不改变本条路线内容。
- designStrategies：来自 profile.strategies，更多是 profile 标签；在部分 concept validation 中被读取，但不能逐条证明改变了候选池。

删除输入后的影响判断：
- 删除 country/destinationEntities：会改变国家组合、标题、summary，或无法生成路线。★★★★★
- 删除 travelStyle/profile：会改变 concept、styleLabel、天数推导、标题主题。★★★★★
- 删除 bestMonths：会改变 bestMonths 展示；是否改变路线主体仅 seasonal/profile 可证明，普通路线无法证明。★★☆☆☆
- 删除 designStrategies：可能影响 buildRouteConcept 对 theme/season/transport 的 style 判定；但大量 profile 中是标签，逐条影响无法完全证明。★★☆☆☆
- 删除 plannerReason/coverageContribution：不会改变已生成路线内容。☆

### Route: 摩尔多瓦10天经典首访：摩尔多瓦文化停留区到摩尔多瓦地方生活区

- Route ID: `materialized-pgzz1s-55056`
- 抽样类别: Rail/Transport
- 可证明来源类型: Materialized Template
- 国家: MD
- 目的地: 摩尔多瓦文化停留区 > 摩尔多瓦门户城市 > 摩尔多瓦历史城区 > 摩尔多瓦自然腹地 > 摩尔多瓦地方生活区
- travelStyle: classic-first-trip
- durationBand / days: 7-10d / 10
- Feed: 无法证明进入当前 Feed ready pool

Decision Trace:

Step1
读取：
- knowledge-graph-pool.json: destination/country candidates, as proven by provenance.source=knowledge-graph-pool or contentEvidence.materialized
- profile/travelStyle=classic-first-trip: proven by travelStyle/travelStyleConceptKey/contentEvidence.travelMode
- countryCodes=MD
- destinationEntities=摩尔多瓦文化停留区 > 摩尔多瓦门户城市 > 摩尔多瓦历史城区 > 摩尔多瓦自然腹地 > 摩尔多瓦地方生活区
- bestMonths=4-10月
- designStrategies=Geographic+Theme+Transport
- distance calculation / routePassesPlannerRules: proven by materialize-route-pool.mjs, but per-route rejected alternatives are not persisted

↓

Step2
过滤：
- disabledCountries 包含 CN；plausibleCountries 要求国家组合在 regionGroups 中；routePassesPlannerRules 要求 concept validation、距离完整、maxSegment/span 不超限。

↓

Step3
候选国家：
- 可证明保存结果：MD
- 生成前完整候选国家池：Unknown（accepted route 未保存被扫描/被删除候选列表）。

↓

Step4
为什么保留这些国家：
- 因为这些 destinationEntities 的 countryCode 通过 disabledCountries、plausibleCountries、距离与 concept rules；具体竞争候选 Unknown。

↓

Step5
为什么删除其它国家：
- Unknown。当前 accepted route 没有保存 rejected alternatives；只能从代码知道可能原因包括 CN block、region 不合理、距离超限、pool 为空、dedupe 太近、cluster 饱和。

↓

Step6
为什么生成当前标题：
- route title：makeRoute 模板读取 titleCountry + days + styleLabelZh + first/last destination，生成当前标题。

↓

Step7
为什么生成当前主题：
- profile/theme + buildRouteConcept 生成 travelStyle=classic-first-trip；themes=经典首访。

↓

Step8
为什么生成当前简介：
- route summary：makeRoute 固定模板读取 styleLabelZh 和前 3 个目的地，模板化风险最高。

↓

Step9
为什么进入 Accepted：
- 保存状态：contentQualityStatus=accepted, repositoryStatus=mediaReady, sourceType=planner-designed
- 可证明原因：materialize-route-pool 在 makeRoute 后调用 validateRouteContent(record).accepted 才 addCandidate；accepted repository 已保存本条。

↓

Step10
为什么进入 Feed（如果进入）：
- 未进入或无法证明进入 Feed：没有通过当前报告可验证的 feedReady + onlineCoverAsset 国家匹配。

真正改变路线结果的输入：
- 国家组合：由 destinations 的 countryCode 集合直接决定为 MD；plausibleCountries/CN block 可过滤，但被删国家候选 Unknown。
- 城市/景点：由 knowledge-graph-pool 候选或 coverageFallbackPlaces 形成 destinationEntities=摩尔多瓦文化停留区 > 摩尔多瓦门户城市 > 摩尔多瓦历史城区 > 摩尔多瓦自然腹地 > 摩尔多瓦地方生活区。
- 天数：由 buildRouteConcept 得到 recommendedDays，再由 concreteDaysFor(hash(profile, destinations, serial)) 固化为 10。
- travelStyle：由 context/profile + buildRouteConcept 决定；保存为 classic-first-trip。
- route title：makeRoute 模板读取 titleCountry + days + styleLabelZh + first/last destination，生成当前标题。
- route summary：makeRoute 固定模板读取 styleLabelZh 和前 3 个目的地，模板化风险最高。

最后补上的标签/非决策字段：
- plannerReason：在路线骨架/concept 后写入；不证明它改变了国家、城市或天数。
- coverageContribution：由生成后的 country/destination 数量汇总；不是生成前输入。
- contentEvidence.provider/evidenceHash：主要是来源/缓存/溯源；一般不改变本条路线内容。
- designStrategies：来自 profile.strategies，更多是 profile 标签；在部分 concept validation 中被读取，但不能逐条证明改变了候选池。

删除输入后的影响判断：
- 删除 country/destinationEntities：会改变国家组合、标题、summary，或无法生成路线。★★★★★
- 删除 travelStyle/profile：会改变 concept、styleLabel、天数推导、标题主题。★★★★★
- 删除 bestMonths：会改变 bestMonths 展示；是否改变路线主体仅 seasonal/profile 可证明，普通路线无法证明。★★☆☆☆
- 删除 designStrategies：可能影响 buildRouteConcept 对 theme/season/transport 的 style 判定；但大量 profile 中是标签，逐条影响无法完全证明。★★☆☆☆
- 删除 plannerReason/coverageContribution：不会改变已生成路线内容。☆

### Route: 南非13天经典首访：南非门户城市到南非文化停留区

- Route ID: `materialized-y5z9ot-56417`
- 抽样类别: Rail/Transport
- 可证明来源类型: Materialized Template
- 国家: ZA
- 目的地: 南非门户城市 > 南非历史城区 > 南非自然腹地 > 南非地方生活区 > 南非区域风景带 > 南非文化停留区
- travelStyle: classic-first-trip
- durationBand / days: 10-14d / 13
- Feed: 无法证明进入当前 Feed ready pool

Decision Trace:

Step1
读取：
- knowledge-graph-pool.json: destination/country candidates, as proven by provenance.source=knowledge-graph-pool or contentEvidence.materialized
- profile/travelStyle=classic-first-trip: proven by travelStyle/travelStyleConceptKey/contentEvidence.travelMode
- countryCodes=ZA
- destinationEntities=南非门户城市 > 南非历史城区 > 南非自然腹地 > 南非地方生活区 > 南非区域风景带 > 南非文化停留区
- bestMonths=3-5月
- designStrategies=Geographic+Season+Theme+Transport
- distance calculation / routePassesPlannerRules: proven by materialize-route-pool.mjs, but per-route rejected alternatives are not persisted

↓

Step2
过滤：
- disabledCountries 包含 CN；plausibleCountries 要求国家组合在 regionGroups 中；routePassesPlannerRules 要求 concept validation、距离完整、maxSegment/span 不超限。

↓

Step3
候选国家：
- 可证明保存结果：ZA
- 生成前完整候选国家池：Unknown（accepted route 未保存被扫描/被删除候选列表）。

↓

Step4
为什么保留这些国家：
- 因为这些 destinationEntities 的 countryCode 通过 disabledCountries、plausibleCountries、距离与 concept rules；具体竞争候选 Unknown。

↓

Step5
为什么删除其它国家：
- Unknown。当前 accepted route 没有保存 rejected alternatives；只能从代码知道可能原因包括 CN block、region 不合理、距离超限、pool 为空、dedupe 太近、cluster 饱和。

↓

Step6
为什么生成当前标题：
- route title：makeRoute 模板读取 titleCountry + days + styleLabelZh + first/last destination，生成当前标题。

↓

Step7
为什么生成当前主题：
- profile/theme + buildRouteConcept 生成 travelStyle=classic-first-trip；themes=经典首访。

↓

Step8
为什么生成当前简介：
- route summary：makeRoute 固定模板读取 styleLabelZh 和前 3 个目的地，模板化风险最高。

↓

Step9
为什么进入 Accepted：
- 保存状态：contentQualityStatus=accepted, repositoryStatus=mediaReady, sourceType=planner-designed
- 可证明原因：materialize-route-pool 在 makeRoute 后调用 validateRouteContent(record).accepted 才 addCandidate；accepted repository 已保存本条。

↓

Step10
为什么进入 Feed（如果进入）：
- 未进入或无法证明进入 Feed：没有通过当前报告可验证的 feedReady + onlineCoverAsset 国家匹配。

真正改变路线结果的输入：
- 国家组合：由 destinations 的 countryCode 集合直接决定为 ZA；plausibleCountries/CN block 可过滤，但被删国家候选 Unknown。
- 城市/景点：由 knowledge-graph-pool 候选或 coverageFallbackPlaces 形成 destinationEntities=南非门户城市 > 南非历史城区 > 南非自然腹地 > 南非地方生活区 > 南非区域风景带 > 南非文化停留区。
- 天数：由 buildRouteConcept 得到 recommendedDays，再由 concreteDaysFor(hash(profile, destinations, serial)) 固化为 13。
- travelStyle：由 context/profile + buildRouteConcept 决定；保存为 classic-first-trip。
- route title：makeRoute 模板读取 titleCountry + days + styleLabelZh + first/last destination，生成当前标题。
- route summary：makeRoute 固定模板读取 styleLabelZh 和前 3 个目的地，模板化风险最高。

最后补上的标签/非决策字段：
- plannerReason：在路线骨架/concept 后写入；不证明它改变了国家、城市或天数。
- coverageContribution：由生成后的 country/destination 数量汇总；不是生成前输入。
- contentEvidence.provider/evidenceHash：主要是来源/缓存/溯源；一般不改变本条路线内容。
- designStrategies：来自 profile.strategies，更多是 profile 标签；在部分 concept validation 中被读取，但不能逐条证明改变了候选池。

删除输入后的影响判断：
- 删除 country/destinationEntities：会改变国家组合、标题、summary，或无法生成路线。★★★★★
- 删除 travelStyle/profile：会改变 concept、styleLabel、天数推导、标题主题。★★★★★
- 删除 bestMonths：会改变 bestMonths 展示；是否改变路线主体仅 seasonal/profile 可证明，普通路线无法证明。★★☆☆☆
- 删除 designStrategies：可能影响 buildRouteConcept 对 theme/season/transport 的 style 判定；但大量 profile 中是标签，逐条影响无法完全证明。★★☆☆☆
- 删除 plannerReason/coverageContribution：不会改变已生成路线内容。☆

### Route: 英国5天公路自驾：伦敦城到利兹

- Route ID: `materialized-z4hhrl-59204`
- 抽样类别: Rail/Transport
- 可证明来源类型: Materialized Template
- 国家: GB
- 目的地: 伦敦城 > 牛津 > 利兹
- travelStyle: road-trip
- durationBand / days: 4-6d / 5
- Feed: 可证明进入当前 Feed ready pool 的候选

Decision Trace:

Step1
读取：
- knowledge-graph-pool.json: destination/country candidates, as proven by provenance.source=knowledge-graph-pool or contentEvidence.materialized
- profile/travelStyle=road-trip: proven by travelStyle/travelStyleConceptKey/contentEvidence.travelMode
- countryCodes=GB
- destinationEntities=伦敦城 > 牛津 > 利兹
- bestMonths=5-9月
- designStrategies=Geographic+Transport+Theme
- distance calculation / routePassesPlannerRules: proven by materialize-route-pool.mjs, but per-route rejected alternatives are not persisted

↓

Step2
过滤：
- disabledCountries 包含 CN；plausibleCountries 要求国家组合在 regionGroups 中；routePassesPlannerRules 要求 concept validation、距离完整、maxSegment/span 不超限。

↓

Step3
候选国家：
- 可证明保存结果：GB
- 生成前完整候选国家池：Unknown（accepted route 未保存被扫描/被删除候选列表）。

↓

Step4
为什么保留这些国家：
- 因为这些 destinationEntities 的 countryCode 通过 disabledCountries、plausibleCountries、距离与 concept rules；具体竞争候选 Unknown。

↓

Step5
为什么删除其它国家：
- Unknown。当前 accepted route 没有保存 rejected alternatives；只能从代码知道可能原因包括 CN block、region 不合理、距离超限、pool 为空、dedupe 太近、cluster 饱和。

↓

Step6
为什么生成当前标题：
- route title：makeRoute 模板读取 titleCountry + days + styleLabelZh + first/last destination，生成当前标题。

↓

Step7
为什么生成当前主题：
- profile/theme + buildRouteConcept 生成 travelStyle=road-trip；themes=公路自驾。

↓

Step8
为什么生成当前简介：
- route summary：makeRoute 固定模板读取 styleLabelZh 和前 3 个目的地，模板化风险最高。

↓

Step9
为什么进入 Accepted：
- 保存状态：contentQualityStatus=accepted, repositoryStatus=mediaReady, sourceType=planner-designed
- 可证明原因：materialize-route-pool 在 makeRoute 后调用 validateRouteContent(record).accepted 才 addCandidate；accepted repository 已保存本条。

↓

Step10
为什么进入 Feed（如果进入）：
- 进入 Feed 的可证明原因：accepted repository 中存在 feedReady onlineCoverAsset，imageCountryCodes 与路线国家有交集；Feed 还会受当前 cursor/random/quality 排序影响。

真正改变路线结果的输入：
- 国家组合：由 destinations 的 countryCode 集合直接决定为 GB；plausibleCountries/CN block 可过滤，但被删国家候选 Unknown。
- 城市/景点：由 knowledge-graph-pool 候选或 coverageFallbackPlaces 形成 destinationEntities=伦敦城 > 牛津 > 利兹。
- 天数：由 buildRouteConcept 得到 recommendedDays，再由 concreteDaysFor(hash(profile, destinations, serial)) 固化为 5。
- travelStyle：由 context/profile + buildRouteConcept 决定；保存为 road-trip。
- route title：makeRoute 模板读取 titleCountry + days + styleLabelZh + first/last destination，生成当前标题。
- route summary：makeRoute 固定模板读取 styleLabelZh 和前 3 个目的地，模板化风险最高。

最后补上的标签/非决策字段：
- plannerReason：在路线骨架/concept 后写入；不证明它改变了国家、城市或天数。
- coverageContribution：由生成后的 country/destination 数量汇总；不是生成前输入。
- contentEvidence.provider/evidenceHash：主要是来源/缓存/溯源；一般不改变本条路线内容。
- designStrategies：来自 profile.strategies，更多是 profile 标签；在部分 concept validation 中被读取，但不能逐条证明改变了候选池。

删除输入后的影响判断：
- 删除 country/destinationEntities：会改变国家组合、标题、summary，或无法生成路线。★★★★★
- 删除 travelStyle/profile：会改变 concept、styleLabel、天数推导、标题主题。★★★★★
- 删除 bestMonths：会改变 bestMonths 展示；是否改变路线主体仅 seasonal/profile 可证明，普通路线无法证明。★★☆☆☆
- 删除 designStrategies：可能影响 buildRouteConcept 对 theme/season/transport 的 style 判定；但大量 profile 中是标签，逐条影响无法完全证明。★★☆☆☆
- 删除 plannerReason/coverageContribution：不会改变已生成路线内容。☆


## Duration

### Route: 乌拉圭海岸之旅

- Route ID: `wikivoyage-157419`
- 抽样类别: Duration
- 可证明来源类型: Unknown
- 国家: AR + UY
- 目的地: 布宜诺斯艾利斯 > 科洛尼亚-德尔萨克拉门托 > 埃斯特角城
- travelStyle: Unknown
- durationBand / days: Unknown / 6
- Feed: 无法证明进入当前 Feed ready pool

Decision Trace:

Step1
读取：
- Unknown: route source does not preserve enough pre-generation context.

↓

Step2
过滤：
- Unknown

↓

Step3
候选国家：
- 可证明保存结果：AR + UY
- 生成前完整候选国家池：Unknown（accepted route 未保存被扫描/被删除候选列表）。

↓

Step4
为什么保留这些国家：
- Unknown

↓

Step5
为什么删除其它国家：
- Unknown。当前 accepted route 没有保存 rejected alternatives；只能从代码知道可能原因包括 CN block、region 不合理、距离超限、pool 为空、dedupe 太近、cluster 饱和。

↓

Step6
为什么生成当前标题：
- Unknown

↓

Step7
为什么生成当前主题：
- buildRouteConcept/context.theme/travelStyle 生成主题；themes=海岸旅行。

↓

Step8
为什么生成当前简介：
- Unknown

↓

Step9
为什么进入 Accepted：
- 保存状态：contentQualityStatus=accepted, repositoryStatus=accepted, sourceType=source-original
- 可证明原因：Unknown

↓

Step10
为什么进入 Feed（如果进入）：
- 未进入或无法证明进入 Feed：没有通过当前报告可验证的 feedReady + onlineCoverAsset 国家匹配。

真正改变路线结果的输入：
- Unknown: 无法证明哪些输入改变了路线结果。

最后补上的标签/非决策字段：
- plannerReason：在路线骨架/concept 后写入；不证明它改变了国家、城市或天数。
- coverageContribution：由生成后的 country/destination 数量汇总；不是生成前输入。
- contentEvidence.provider/evidenceHash：主要是来源/缓存/溯源；一般不改变本条路线内容。
- designStrategies：可能参与 concept/validator，但 saved field 本身是输出记录；删除保存字段通常不改变已生成路线。

删除输入后的影响判断：
- Unknown

### Route: 巴林、卡塔尔11天区域深度：巴林历史城区到卡塔尔门户城市

- Route ID: `materialized-1sp46tb-42846`
- 抽样类别: Duration
- 可证明来源类型: Materialized Template
- 国家: BH + QA
- 目的地: 巴林历史城区 > 巴林自然腹地 > 巴林地方生活区 > 卡塔尔区域风景带 > 卡塔尔文化停留区 > 卡塔尔门户城市
- travelStyle: deep-dive
- durationBand / days: 10-14d / 11
- Feed: 无法证明进入当前 Feed ready pool

Decision Trace:

Step1
读取：
- knowledge-graph-pool.json: destination/country candidates, as proven by provenance.source=knowledge-graph-pool or contentEvidence.materialized
- profile/travelStyle=deep-dive: proven by travelStyle/travelStyleConceptKey/contentEvidence.travelMode
- countryCodes=BH+QA
- destinationEntities=巴林历史城区 > 巴林自然腹地 > 巴林地方生活区 > 卡塔尔区域风景带 > 卡塔尔文化停留区 > 卡塔尔门户城市
- bestMonths=5-9月
- designStrategies=Geographic+Regional+Theme+Transport
- distance calculation / routePassesPlannerRules: proven by materialize-route-pool.mjs, but per-route rejected alternatives are not persisted

↓

Step2
过滤：
- disabledCountries 包含 CN；plausibleCountries 要求国家组合在 regionGroups 中；routePassesPlannerRules 要求 concept validation、距离完整、maxSegment/span 不超限。

↓

Step3
候选国家：
- 可证明保存结果：BH + QA
- 生成前完整候选国家池：Unknown（accepted route 未保存被扫描/被删除候选列表）。

↓

Step4
为什么保留这些国家：
- 因为这些 destinationEntities 的 countryCode 通过 disabledCountries、plausibleCountries、距离与 concept rules；具体竞争候选 Unknown。

↓

Step5
为什么删除其它国家：
- Unknown。当前 accepted route 没有保存 rejected alternatives；只能从代码知道可能原因包括 CN block、region 不合理、距离超限、pool 为空、dedupe 太近、cluster 饱和。

↓

Step6
为什么生成当前标题：
- route title：makeRoute 模板读取 titleCountry + days + styleLabelZh + first/last destination，生成当前标题。

↓

Step7
为什么生成当前主题：
- profile/theme + buildRouteConcept 生成 travelStyle=deep-dive；themes=区域深度。

↓

Step8
为什么生成当前简介：
- route summary：makeRoute 固定模板读取 styleLabelZh 和前 3 个目的地，模板化风险最高。

↓

Step9
为什么进入 Accepted：
- 保存状态：contentQualityStatus=accepted, repositoryStatus=mediaReady, sourceType=planner-designed
- 可证明原因：materialize-route-pool 在 makeRoute 后调用 validateRouteContent(record).accepted 才 addCandidate；accepted repository 已保存本条。

↓

Step10
为什么进入 Feed（如果进入）：
- 未进入或无法证明进入 Feed：没有通过当前报告可验证的 feedReady + onlineCoverAsset 国家匹配。

真正改变路线结果的输入：
- 国家组合：由 destinations 的 countryCode 集合直接决定为 BH+QA；plausibleCountries/CN block 可过滤，但被删国家候选 Unknown。
- 城市/景点：由 knowledge-graph-pool 候选或 coverageFallbackPlaces 形成 destinationEntities=巴林历史城区 > 巴林自然腹地 > 巴林地方生活区 > 卡塔尔区域风景带 > 卡塔尔文化停留区 > 卡塔尔门户城市。
- 天数：由 buildRouteConcept 得到 recommendedDays，再由 concreteDaysFor(hash(profile, destinations, serial)) 固化为 11。
- travelStyle：由 context/profile + buildRouteConcept 决定；保存为 deep-dive。
- route title：makeRoute 模板读取 titleCountry + days + styleLabelZh + first/last destination，生成当前标题。
- route summary：makeRoute 固定模板读取 styleLabelZh 和前 3 个目的地，模板化风险最高。

最后补上的标签/非决策字段：
- plannerReason：在路线骨架/concept 后写入；不证明它改变了国家、城市或天数。
- coverageContribution：由生成后的 country/destination 数量汇总；不是生成前输入。
- contentEvidence.provider/evidenceHash：主要是来源/缓存/溯源；一般不改变本条路线内容。
- designStrategies：来自 profile.strategies，更多是 profile 标签；在部分 concept validation 中被读取，但不能逐条证明改变了候选池。

删除输入后的影响判断：
- 删除 country/destinationEntities：会改变国家组合、标题、summary，或无法生成路线。★★★★★
- 删除 travelStyle/profile：会改变 concept、styleLabel、天数推导、标题主题。★★★★★
- 删除 bestMonths：会改变 bestMonths 展示；是否改变路线主体仅 seasonal/profile 可证明，普通路线无法证明。★★☆☆☆
- 删除 designStrategies：可能影响 buildRouteConcept 对 theme/season/transport 的 style 判定；但大量 profile 中是标签，逐条影响无法完全证明。★★☆☆☆
- 删除 plannerReason/coverageContribution：不会改变已生成路线内容。☆

### Route: 英国、德国5天经典首访：索尔福德到默尔斯

- Route ID: `materialized-6j0wrm-45219`
- 抽样类别: Duration
- 可证明来源类型: Materialized Template
- 国家: GB + DE
- 目的地: 索尔福德 > 诺里奇 > 默尔斯
- travelStyle: classic-first-trip
- durationBand / days: 4-6d / 5
- Feed: 可证明进入当前 Feed ready pool 的候选

Decision Trace:

Step1
读取：
- knowledge-graph-pool.json: destination/country candidates, as proven by provenance.source=knowledge-graph-pool or contentEvidence.materialized
- profile/travelStyle=classic-first-trip: proven by travelStyle/travelStyleConceptKey/contentEvidence.travelMode
- countryCodes=GB+DE
- destinationEntities=索尔福德 > 诺里奇 > 默尔斯
- bestMonths=4-10月
- designStrategies=Geographic+Theme+Transport
- distance calculation / routePassesPlannerRules: proven by materialize-route-pool.mjs, but per-route rejected alternatives are not persisted

↓

Step2
过滤：
- disabledCountries 包含 CN；plausibleCountries 要求国家组合在 regionGroups 中；routePassesPlannerRules 要求 concept validation、距离完整、maxSegment/span 不超限。

↓

Step3
候选国家：
- 可证明保存结果：GB + DE
- 生成前完整候选国家池：Unknown（accepted route 未保存被扫描/被删除候选列表）。

↓

Step4
为什么保留这些国家：
- 因为这些 destinationEntities 的 countryCode 通过 disabledCountries、plausibleCountries、距离与 concept rules；具体竞争候选 Unknown。

↓

Step5
为什么删除其它国家：
- Unknown。当前 accepted route 没有保存 rejected alternatives；只能从代码知道可能原因包括 CN block、region 不合理、距离超限、pool 为空、dedupe 太近、cluster 饱和。

↓

Step6
为什么生成当前标题：
- route title：makeRoute 模板读取 titleCountry + days + styleLabelZh + first/last destination，生成当前标题。

↓

Step7
为什么生成当前主题：
- profile/theme + buildRouteConcept 生成 travelStyle=classic-first-trip；themes=经典首访。

↓

Step8
为什么生成当前简介：
- route summary：makeRoute 固定模板读取 styleLabelZh 和前 3 个目的地，模板化风险最高。

↓

Step9
为什么进入 Accepted：
- 保存状态：contentQualityStatus=accepted, repositoryStatus=mediaReady, sourceType=planner-designed
- 可证明原因：materialize-route-pool 在 makeRoute 后调用 validateRouteContent(record).accepted 才 addCandidate；accepted repository 已保存本条。

↓

Step10
为什么进入 Feed（如果进入）：
- 进入 Feed 的可证明原因：accepted repository 中存在 feedReady onlineCoverAsset，imageCountryCodes 与路线国家有交集；Feed 还会受当前 cursor/random/quality 排序影响。

真正改变路线结果的输入：
- 国家组合：由 destinations 的 countryCode 集合直接决定为 GB+DE；plausibleCountries/CN block 可过滤，但被删国家候选 Unknown。
- 城市/景点：由 knowledge-graph-pool 候选或 coverageFallbackPlaces 形成 destinationEntities=索尔福德 > 诺里奇 > 默尔斯。
- 天数：由 buildRouteConcept 得到 recommendedDays，再由 concreteDaysFor(hash(profile, destinations, serial)) 固化为 5。
- travelStyle：由 context/profile + buildRouteConcept 决定；保存为 classic-first-trip。
- route title：makeRoute 模板读取 titleCountry + days + styleLabelZh + first/last destination，生成当前标题。
- route summary：makeRoute 固定模板读取 styleLabelZh 和前 3 个目的地，模板化风险最高。

最后补上的标签/非决策字段：
- plannerReason：在路线骨架/concept 后写入；不证明它改变了国家、城市或天数。
- coverageContribution：由生成后的 country/destination 数量汇总；不是生成前输入。
- contentEvidence.provider/evidenceHash：主要是来源/缓存/溯源；一般不改变本条路线内容。
- designStrategies：来自 profile.strategies，更多是 profile 标签；在部分 concept validation 中被读取，但不能逐条证明改变了候选池。

删除输入后的影响判断：
- 删除 country/destinationEntities：会改变国家组合、标题、summary，或无法生成路线。★★★★★
- 删除 travelStyle/profile：会改变 concept、styleLabel、天数推导、标题主题。★★★★★
- 删除 bestMonths：会改变 bestMonths 展示；是否改变路线主体仅 seasonal/profile 可证明，普通路线无法证明。★★☆☆☆
- 删除 designStrategies：可能影响 buildRouteConcept 对 theme/season/transport 的 style 判定；但大量 profile 中是标签，逐条影响无法完全证明。★★☆☆☆
- 删除 plannerReason/coverageContribution：不会改变已生成路线内容。☆

### Route: 摩尔多瓦、乌克兰10天主题游：摩尔多瓦门户城市到乌克兰区域风景带

- Route ID: `materialized-187o1pq-46701`
- 抽样类别: Duration
- 可证明来源类型: Materialized Template
- 国家: MD + UA
- 目的地: 摩尔多瓦门户城市 > 摩尔多瓦自然腹地 > 摩尔多瓦区域风景带 > 乌克兰门户城市 > 乌克兰自然腹地 > 乌克兰区域风景带
- travelStyle: theme
- durationBand / days: 10-14d / 10
- Feed: 无法证明进入当前 Feed ready pool

Decision Trace:

Step1
读取：
- knowledge-graph-pool.json: destination/country candidates, as proven by provenance.source=knowledge-graph-pool or contentEvidence.materialized
- profile/travelStyle=theme: proven by travelStyle/travelStyleConceptKey/contentEvidence.travelMode
- countryCodes=MD+UA
- destinationEntities=摩尔多瓦门户城市 > 摩尔多瓦自然腹地 > 摩尔多瓦区域风景带 > 乌克兰门户城市 > 乌克兰自然腹地 > 乌克兰区域风景带
- bestMonths=9-11月
- designStrategies=Geographic+Theme+Transport
- distance calculation / routePassesPlannerRules: proven by materialize-route-pool.mjs, but per-route rejected alternatives are not persisted

↓

Step2
过滤：
- disabledCountries 包含 CN；plausibleCountries 要求国家组合在 regionGroups 中；routePassesPlannerRules 要求 concept validation、距离完整、maxSegment/span 不超限。

↓

Step3
候选国家：
- 可证明保存结果：MD + UA
- 生成前完整候选国家池：Unknown（accepted route 未保存被扫描/被删除候选列表）。

↓

Step4
为什么保留这些国家：
- 因为这些 destinationEntities 的 countryCode 通过 disabledCountries、plausibleCountries、距离与 concept rules；具体竞争候选 Unknown。

↓

Step5
为什么删除其它国家：
- Unknown。当前 accepted route 没有保存 rejected alternatives；只能从代码知道可能原因包括 CN block、region 不合理、距离超限、pool 为空、dedupe 太近、cluster 饱和。

↓

Step6
为什么生成当前标题：
- route title：makeRoute 模板读取 titleCountry + days + styleLabelZh + first/last destination，生成当前标题。

↓

Step7
为什么生成当前主题：
- profile/theme + buildRouteConcept 生成 travelStyle=theme；themes=主题游。

↓

Step8
为什么生成当前简介：
- route summary：makeRoute 固定模板读取 styleLabelZh 和前 3 个目的地，模板化风险最高。

↓

Step9
为什么进入 Accepted：
- 保存状态：contentQualityStatus=accepted, repositoryStatus=mediaReady, sourceType=planner-designed
- 可证明原因：materialize-route-pool 在 makeRoute 后调用 validateRouteContent(record).accepted 才 addCandidate；accepted repository 已保存本条。

↓

Step10
为什么进入 Feed（如果进入）：
- 未进入或无法证明进入 Feed：没有通过当前报告可验证的 feedReady + onlineCoverAsset 国家匹配。

真正改变路线结果的输入：
- 国家组合：由 destinations 的 countryCode 集合直接决定为 MD+UA；plausibleCountries/CN block 可过滤，但被删国家候选 Unknown。
- 城市/景点：由 knowledge-graph-pool 候选或 coverageFallbackPlaces 形成 destinationEntities=摩尔多瓦门户城市 > 摩尔多瓦自然腹地 > 摩尔多瓦区域风景带 > 乌克兰门户城市 > 乌克兰自然腹地 > 乌克兰区域风景带。
- 天数：由 buildRouteConcept 得到 recommendedDays，再由 concreteDaysFor(hash(profile, destinations, serial)) 固化为 10。
- travelStyle：由 context/profile + buildRouteConcept 决定；保存为 theme。
- route title：makeRoute 模板读取 titleCountry + days + styleLabelZh + first/last destination，生成当前标题。
- route summary：makeRoute 固定模板读取 styleLabelZh 和前 3 个目的地，模板化风险最高。

最后补上的标签/非决策字段：
- plannerReason：在路线骨架/concept 后写入；不证明它改变了国家、城市或天数。
- coverageContribution：由生成后的 country/destination 数量汇总；不是生成前输入。
- contentEvidence.provider/evidenceHash：主要是来源/缓存/溯源；一般不改变本条路线内容。
- designStrategies：来自 profile.strategies，更多是 profile 标签；在部分 concept validation 中被读取，但不能逐条证明改变了候选池。

删除输入后的影响判断：
- 删除 country/destinationEntities：会改变国家组合、标题、summary，或无法生成路线。★★★★★
- 删除 travelStyle/profile：会改变 concept、styleLabel、天数推导、标题主题。★★★★★
- 删除 bestMonths：会改变 bestMonths 展示；是否改变路线主体仅 seasonal/profile 可证明，普通路线无法证明。★★☆☆☆
- 删除 designStrategies：可能影响 buildRouteConcept 对 theme/season/transport 的 style 判定；但大量 profile 中是标签，逐条影响无法完全证明。★★☆☆☆
- 删除 plannerReason/coverageContribution：不会改变已生成路线内容。☆

### Route: 泰国5天主题游：泰国门户城市到泰国自然腹地

- Route ID: `materialized-1couwo1-47181`
- 抽样类别: Duration
- 可证明来源类型: Materialized Template
- 国家: TH
- 目的地: 泰国门户城市 > 泰国历史城区 > 泰国自然腹地
- travelStyle: theme
- durationBand / days: 4-6d / 5
- Feed: 无法证明进入当前 Feed ready pool

Decision Trace:

Step1
读取：
- knowledge-graph-pool.json: destination/country candidates, as proven by provenance.source=knowledge-graph-pool or contentEvidence.materialized
- profile/travelStyle=theme: proven by travelStyle/travelStyleConceptKey/contentEvidence.travelMode
- countryCodes=TH
- destinationEntities=泰国门户城市 > 泰国历史城区 > 泰国自然腹地
- bestMonths=9-11月
- designStrategies=Geographic+Theme+Transport
- distance calculation / routePassesPlannerRules: proven by materialize-route-pool.mjs, but per-route rejected alternatives are not persisted

↓

Step2
过滤：
- disabledCountries 包含 CN；plausibleCountries 要求国家组合在 regionGroups 中；routePassesPlannerRules 要求 concept validation、距离完整、maxSegment/span 不超限。

↓

Step3
候选国家：
- 可证明保存结果：TH
- 生成前完整候选国家池：Unknown（accepted route 未保存被扫描/被删除候选列表）。

↓

Step4
为什么保留这些国家：
- 因为这些 destinationEntities 的 countryCode 通过 disabledCountries、plausibleCountries、距离与 concept rules；具体竞争候选 Unknown。

↓

Step5
为什么删除其它国家：
- Unknown。当前 accepted route 没有保存 rejected alternatives；只能从代码知道可能原因包括 CN block、region 不合理、距离超限、pool 为空、dedupe 太近、cluster 饱和。

↓

Step6
为什么生成当前标题：
- route title：makeRoute 模板读取 titleCountry + days + styleLabelZh + first/last destination，生成当前标题。

↓

Step7
为什么生成当前主题：
- profile/theme + buildRouteConcept 生成 travelStyle=theme；themes=主题游。

↓

Step8
为什么生成当前简介：
- route summary：makeRoute 固定模板读取 styleLabelZh 和前 3 个目的地，模板化风险最高。

↓

Step9
为什么进入 Accepted：
- 保存状态：contentQualityStatus=accepted, repositoryStatus=mediaReady, sourceType=planner-designed
- 可证明原因：materialize-route-pool 在 makeRoute 后调用 validateRouteContent(record).accepted 才 addCandidate；accepted repository 已保存本条。

↓

Step10
为什么进入 Feed（如果进入）：
- 未进入或无法证明进入 Feed：没有通过当前报告可验证的 feedReady + onlineCoverAsset 国家匹配。

真正改变路线结果的输入：
- 国家组合：由 destinations 的 countryCode 集合直接决定为 TH；plausibleCountries/CN block 可过滤，但被删国家候选 Unknown。
- 城市/景点：由 knowledge-graph-pool 候选或 coverageFallbackPlaces 形成 destinationEntities=泰国门户城市 > 泰国历史城区 > 泰国自然腹地。
- 天数：由 buildRouteConcept 得到 recommendedDays，再由 concreteDaysFor(hash(profile, destinations, serial)) 固化为 5。
- travelStyle：由 context/profile + buildRouteConcept 决定；保存为 theme。
- route title：makeRoute 模板读取 titleCountry + days + styleLabelZh + first/last destination，生成当前标题。
- route summary：makeRoute 固定模板读取 styleLabelZh 和前 3 个目的地，模板化风险最高。

最后补上的标签/非决策字段：
- plannerReason：在路线骨架/concept 后写入；不证明它改变了国家、城市或天数。
- coverageContribution：由生成后的 country/destination 数量汇总；不是生成前输入。
- contentEvidence.provider/evidenceHash：主要是来源/缓存/溯源；一般不改变本条路线内容。
- designStrategies：来自 profile.strategies，更多是 profile 标签；在部分 concept validation 中被读取，但不能逐条证明改变了候选池。

删除输入后的影响判断：
- 删除 country/destinationEntities：会改变国家组合、标题、summary，或无法生成路线。★★★★★
- 删除 travelStyle/profile：会改变 concept、styleLabel、天数推导、标题主题。★★★★★
- 删除 bestMonths：会改变 bestMonths 展示；是否改变路线主体仅 seasonal/profile 可证明，普通路线无法证明。★★☆☆☆
- 删除 designStrategies：可能影响 buildRouteConcept 对 theme/season/transport 的 style 判定；但大量 profile 中是标签，逐条影响无法完全证明。★★☆☆☆
- 删除 plannerReason/coverageContribution：不会改变已生成路线内容。☆

### Route: 阿尔及利亚5天经典首访：阿尔及利亚自然腹地到阿尔及利亚区域风景带

- Route ID: `materialized-furdxb-47469`
- 抽样类别: Duration
- 可证明来源类型: Materialized Template
- 国家: DZ
- 目的地: 阿尔及利亚自然腹地 > 阿尔及利亚地方生活区 > 阿尔及利亚区域风景带
- travelStyle: classic-first-trip
- durationBand / days: 4-6d / 5
- Feed: 无法证明进入当前 Feed ready pool

Decision Trace:

Step1
读取：
- knowledge-graph-pool.json: destination/country candidates, as proven by provenance.source=knowledge-graph-pool or contentEvidence.materialized
- profile/travelStyle=classic-first-trip: proven by travelStyle/travelStyleConceptKey/contentEvidence.travelMode
- countryCodes=DZ
- destinationEntities=阿尔及利亚自然腹地 > 阿尔及利亚地方生活区 > 阿尔及利亚区域风景带
- bestMonths=4-10月
- designStrategies=Geographic+Theme+Transport
- distance calculation / routePassesPlannerRules: proven by materialize-route-pool.mjs, but per-route rejected alternatives are not persisted

↓

Step2
过滤：
- disabledCountries 包含 CN；plausibleCountries 要求国家组合在 regionGroups 中；routePassesPlannerRules 要求 concept validation、距离完整、maxSegment/span 不超限。

↓

Step3
候选国家：
- 可证明保存结果：DZ
- 生成前完整候选国家池：Unknown（accepted route 未保存被扫描/被删除候选列表）。

↓

Step4
为什么保留这些国家：
- 因为这些 destinationEntities 的 countryCode 通过 disabledCountries、plausibleCountries、距离与 concept rules；具体竞争候选 Unknown。

↓

Step5
为什么删除其它国家：
- Unknown。当前 accepted route 没有保存 rejected alternatives；只能从代码知道可能原因包括 CN block、region 不合理、距离超限、pool 为空、dedupe 太近、cluster 饱和。

↓

Step6
为什么生成当前标题：
- route title：makeRoute 模板读取 titleCountry + days + styleLabelZh + first/last destination，生成当前标题。

↓

Step7
为什么生成当前主题：
- profile/theme + buildRouteConcept 生成 travelStyle=classic-first-trip；themes=经典首访。

↓

Step8
为什么生成当前简介：
- route summary：makeRoute 固定模板读取 styleLabelZh 和前 3 个目的地，模板化风险最高。

↓

Step9
为什么进入 Accepted：
- 保存状态：contentQualityStatus=accepted, repositoryStatus=mediaReady, sourceType=planner-designed
- 可证明原因：materialize-route-pool 在 makeRoute 后调用 validateRouteContent(record).accepted 才 addCandidate；accepted repository 已保存本条。

↓

Step10
为什么进入 Feed（如果进入）：
- 未进入或无法证明进入 Feed：没有通过当前报告可验证的 feedReady + onlineCoverAsset 国家匹配。

真正改变路线结果的输入：
- 国家组合：由 destinations 的 countryCode 集合直接决定为 DZ；plausibleCountries/CN block 可过滤，但被删国家候选 Unknown。
- 城市/景点：由 knowledge-graph-pool 候选或 coverageFallbackPlaces 形成 destinationEntities=阿尔及利亚自然腹地 > 阿尔及利亚地方生活区 > 阿尔及利亚区域风景带。
- 天数：由 buildRouteConcept 得到 recommendedDays，再由 concreteDaysFor(hash(profile, destinations, serial)) 固化为 5。
- travelStyle：由 context/profile + buildRouteConcept 决定；保存为 classic-first-trip。
- route title：makeRoute 模板读取 titleCountry + days + styleLabelZh + first/last destination，生成当前标题。
- route summary：makeRoute 固定模板读取 styleLabelZh 和前 3 个目的地，模板化风险最高。

最后补上的标签/非决策字段：
- plannerReason：在路线骨架/concept 后写入；不证明它改变了国家、城市或天数。
- coverageContribution：由生成后的 country/destination 数量汇总；不是生成前输入。
- contentEvidence.provider/evidenceHash：主要是来源/缓存/溯源；一般不改变本条路线内容。
- designStrategies：来自 profile.strategies，更多是 profile 标签；在部分 concept validation 中被读取，但不能逐条证明改变了候选池。

删除输入后的影响判断：
- 删除 country/destinationEntities：会改变国家组合、标题、summary，或无法生成路线。★★★★★
- 删除 travelStyle/profile：会改变 concept、styleLabel、天数推导、标题主题。★★★★★
- 删除 bestMonths：会改变 bestMonths 展示；是否改变路线主体仅 seasonal/profile 可证明，普通路线无法证明。★★☆☆☆
- 删除 designStrategies：可能影响 buildRouteConcept 对 theme/season/transport 的 style 判定；但大量 profile 中是标签，逐条影响无法完全证明。★★☆☆☆
- 删除 plannerReason/coverageContribution：不会改变已生成路线内容。☆

### Route: 菲律宾5天主题游：菲律宾地方生活区到菲律宾文化停留区

- Route ID: `materialized-nnfkdk-47769`
- 抽样类别: Duration
- 可证明来源类型: Materialized Template
- 国家: PH
- 目的地: 菲律宾地方生活区 > 菲律宾区域风景带 > 菲律宾文化停留区
- travelStyle: theme
- durationBand / days: 4-6d / 5
- Feed: 无法证明进入当前 Feed ready pool

Decision Trace:

Step1
读取：
- knowledge-graph-pool.json: destination/country candidates, as proven by provenance.source=knowledge-graph-pool or contentEvidence.materialized
- profile/travelStyle=theme: proven by travelStyle/travelStyleConceptKey/contentEvidence.travelMode
- countryCodes=PH
- destinationEntities=菲律宾地方生活区 > 菲律宾区域风景带 > 菲律宾文化停留区
- bestMonths=9-11月
- designStrategies=Geographic+Theme+Transport
- distance calculation / routePassesPlannerRules: proven by materialize-route-pool.mjs, but per-route rejected alternatives are not persisted

↓

Step2
过滤：
- disabledCountries 包含 CN；plausibleCountries 要求国家组合在 regionGroups 中；routePassesPlannerRules 要求 concept validation、距离完整、maxSegment/span 不超限。

↓

Step3
候选国家：
- 可证明保存结果：PH
- 生成前完整候选国家池：Unknown（accepted route 未保存被扫描/被删除候选列表）。

↓

Step4
为什么保留这些国家：
- 因为这些 destinationEntities 的 countryCode 通过 disabledCountries、plausibleCountries、距离与 concept rules；具体竞争候选 Unknown。

↓

Step5
为什么删除其它国家：
- Unknown。当前 accepted route 没有保存 rejected alternatives；只能从代码知道可能原因包括 CN block、region 不合理、距离超限、pool 为空、dedupe 太近、cluster 饱和。

↓

Step6
为什么生成当前标题：
- route title：makeRoute 模板读取 titleCountry + days + styleLabelZh + first/last destination，生成当前标题。

↓

Step7
为什么生成当前主题：
- profile/theme + buildRouteConcept 生成 travelStyle=theme；themes=主题游。

↓

Step8
为什么生成当前简介：
- route summary：makeRoute 固定模板读取 styleLabelZh 和前 3 个目的地，模板化风险最高。

↓

Step9
为什么进入 Accepted：
- 保存状态：contentQualityStatus=accepted, repositoryStatus=mediaReady, sourceType=planner-designed
- 可证明原因：materialize-route-pool 在 makeRoute 后调用 validateRouteContent(record).accepted 才 addCandidate；accepted repository 已保存本条。

↓

Step10
为什么进入 Feed（如果进入）：
- 未进入或无法证明进入 Feed：没有通过当前报告可验证的 feedReady + onlineCoverAsset 国家匹配。

真正改变路线结果的输入：
- 国家组合：由 destinations 的 countryCode 集合直接决定为 PH；plausibleCountries/CN block 可过滤，但被删国家候选 Unknown。
- 城市/景点：由 knowledge-graph-pool 候选或 coverageFallbackPlaces 形成 destinationEntities=菲律宾地方生活区 > 菲律宾区域风景带 > 菲律宾文化停留区。
- 天数：由 buildRouteConcept 得到 recommendedDays，再由 concreteDaysFor(hash(profile, destinations, serial)) 固化为 5。
- travelStyle：由 context/profile + buildRouteConcept 决定；保存为 theme。
- route title：makeRoute 模板读取 titleCountry + days + styleLabelZh + first/last destination，生成当前标题。
- route summary：makeRoute 固定模板读取 styleLabelZh 和前 3 个目的地，模板化风险最高。

最后补上的标签/非决策字段：
- plannerReason：在路线骨架/concept 后写入；不证明它改变了国家、城市或天数。
- coverageContribution：由生成后的 country/destination 数量汇总；不是生成前输入。
- contentEvidence.provider/evidenceHash：主要是来源/缓存/溯源；一般不改变本条路线内容。
- designStrategies：来自 profile.strategies，更多是 profile 标签；在部分 concept validation 中被读取，但不能逐条证明改变了候选池。

删除输入后的影响判断：
- 删除 country/destinationEntities：会改变国家组合、标题、summary，或无法生成路线。★★★★★
- 删除 travelStyle/profile：会改变 concept、styleLabel、天数推导、标题主题。★★★★★
- 删除 bestMonths：会改变 bestMonths 展示；是否改变路线主体仅 seasonal/profile 可证明，普通路线无法证明。★★☆☆☆
- 删除 designStrategies：可能影响 buildRouteConcept 对 theme/season/transport 的 style 判定；但大量 profile 中是标签，逐条影响无法完全证明。★★☆☆☆
- 删除 plannerReason/coverageContribution：不会改变已生成路线内容。☆

### Route: 巴林5天铁路旅程：巴林文化停留区到巴林历史城区

- Route ID: `materialized-10ngijw-48081`
- 抽样类别: Duration
- 可证明来源类型: Materialized Template
- 国家: BH
- 目的地: 巴林文化停留区 > 巴林门户城市 > 巴林历史城区
- travelStyle: rail-journey
- durationBand / days: 4-6d / 5
- Feed: 无法证明进入当前 Feed ready pool

Decision Trace:

Step1
读取：
- knowledge-graph-pool.json: destination/country candidates, as proven by provenance.source=knowledge-graph-pool or contentEvidence.materialized
- profile/travelStyle=rail-journey: proven by travelStyle/travelStyleConceptKey/contentEvidence.travelMode
- countryCodes=BH
- destinationEntities=巴林文化停留区 > 巴林门户城市 > 巴林历史城区
- bestMonths=4-10月
- designStrategies=Geographic+Transport+Theme
- distance calculation / routePassesPlannerRules: proven by materialize-route-pool.mjs, but per-route rejected alternatives are not persisted

↓

Step2
过滤：
- disabledCountries 包含 CN；plausibleCountries 要求国家组合在 regionGroups 中；routePassesPlannerRules 要求 concept validation、距离完整、maxSegment/span 不超限。

↓

Step3
候选国家：
- 可证明保存结果：BH
- 生成前完整候选国家池：Unknown（accepted route 未保存被扫描/被删除候选列表）。

↓

Step4
为什么保留这些国家：
- 因为这些 destinationEntities 的 countryCode 通过 disabledCountries、plausibleCountries、距离与 concept rules；具体竞争候选 Unknown。

↓

Step5
为什么删除其它国家：
- Unknown。当前 accepted route 没有保存 rejected alternatives；只能从代码知道可能原因包括 CN block、region 不合理、距离超限、pool 为空、dedupe 太近、cluster 饱和。

↓

Step6
为什么生成当前标题：
- route title：makeRoute 模板读取 titleCountry + days + styleLabelZh + first/last destination，生成当前标题。

↓

Step7
为什么生成当前主题：
- profile/theme + buildRouteConcept 生成 travelStyle=rail-journey；themes=铁路旅程。

↓

Step8
为什么生成当前简介：
- route summary：makeRoute 固定模板读取 styleLabelZh 和前 3 个目的地，模板化风险最高。

↓

Step9
为什么进入 Accepted：
- 保存状态：contentQualityStatus=accepted, repositoryStatus=mediaReady, sourceType=planner-designed
- 可证明原因：materialize-route-pool 在 makeRoute 后调用 validateRouteContent(record).accepted 才 addCandidate；accepted repository 已保存本条。

↓

Step10
为什么进入 Feed（如果进入）：
- 未进入或无法证明进入 Feed：没有通过当前报告可验证的 feedReady + onlineCoverAsset 国家匹配。

真正改变路线结果的输入：
- 国家组合：由 destinations 的 countryCode 集合直接决定为 BH；plausibleCountries/CN block 可过滤，但被删国家候选 Unknown。
- 城市/景点：由 knowledge-graph-pool 候选或 coverageFallbackPlaces 形成 destinationEntities=巴林文化停留区 > 巴林门户城市 > 巴林历史城区。
- 天数：由 buildRouteConcept 得到 recommendedDays，再由 concreteDaysFor(hash(profile, destinations, serial)) 固化为 5。
- travelStyle：由 context/profile + buildRouteConcept 决定；保存为 rail-journey。
- route title：makeRoute 模板读取 titleCountry + days + styleLabelZh + first/last destination，生成当前标题。
- route summary：makeRoute 固定模板读取 styleLabelZh 和前 3 个目的地，模板化风险最高。

最后补上的标签/非决策字段：
- plannerReason：在路线骨架/concept 后写入；不证明它改变了国家、城市或天数。
- coverageContribution：由生成后的 country/destination 数量汇总；不是生成前输入。
- contentEvidence.provider/evidenceHash：主要是来源/缓存/溯源；一般不改变本条路线内容。
- designStrategies：来自 profile.strategies，更多是 profile 标签；在部分 concept validation 中被读取，但不能逐条证明改变了候选池。

删除输入后的影响判断：
- 删除 country/destinationEntities：会改变国家组合、标题、summary，或无法生成路线。★★★★★
- 删除 travelStyle/profile：会改变 concept、styleLabel、天数推导、标题主题。★★★★★
- 删除 bestMonths：会改变 bestMonths 展示；是否改变路线主体仅 seasonal/profile 可证明，普通路线无法证明。★★☆☆☆
- 删除 designStrategies：可能影响 buildRouteConcept 对 theme/season/transport 的 style 判定；但大量 profile 中是标签，逐条影响无法完全证明。★★☆☆☆
- 删除 plannerReason/coverageContribution：不会改变已生成路线内容。☆

### Route: 马达加斯加5天经典首访：马达加斯加门户城市到马达加斯加区域风景带

- Route ID: `materialized-6o0p7z-48376`
- 抽样类别: Duration
- 可证明来源类型: Materialized Template
- 国家: MG
- 目的地: 马达加斯加门户城市 > 马达加斯加自然腹地 > 马达加斯加区域风景带
- travelStyle: classic-first-trip
- durationBand / days: 4-6d / 5
- Feed: 无法证明进入当前 Feed ready pool

Decision Trace:

Step1
读取：
- knowledge-graph-pool.json: destination/country candidates, as proven by provenance.source=knowledge-graph-pool or contentEvidence.materialized
- profile/travelStyle=classic-first-trip: proven by travelStyle/travelStyleConceptKey/contentEvidence.travelMode
- countryCodes=MG
- destinationEntities=马达加斯加门户城市 > 马达加斯加自然腹地 > 马达加斯加区域风景带
- bestMonths=3-5月
- designStrategies=Geographic+Season+Theme+Transport
- distance calculation / routePassesPlannerRules: proven by materialize-route-pool.mjs, but per-route rejected alternatives are not persisted

↓

Step2
过滤：
- disabledCountries 包含 CN；plausibleCountries 要求国家组合在 regionGroups 中；routePassesPlannerRules 要求 concept validation、距离完整、maxSegment/span 不超限。

↓

Step3
候选国家：
- 可证明保存结果：MG
- 生成前完整候选国家池：Unknown（accepted route 未保存被扫描/被删除候选列表）。

↓

Step4
为什么保留这些国家：
- 因为这些 destinationEntities 的 countryCode 通过 disabledCountries、plausibleCountries、距离与 concept rules；具体竞争候选 Unknown。

↓

Step5
为什么删除其它国家：
- Unknown。当前 accepted route 没有保存 rejected alternatives；只能从代码知道可能原因包括 CN block、region 不合理、距离超限、pool 为空、dedupe 太近、cluster 饱和。

↓

Step6
为什么生成当前标题：
- route title：makeRoute 模板读取 titleCountry + days + styleLabelZh + first/last destination，生成当前标题。

↓

Step7
为什么生成当前主题：
- profile/theme + buildRouteConcept 生成 travelStyle=classic-first-trip；themes=经典首访。

↓

Step8
为什么生成当前简介：
- route summary：makeRoute 固定模板读取 styleLabelZh 和前 3 个目的地，模板化风险最高。

↓

Step9
为什么进入 Accepted：
- 保存状态：contentQualityStatus=accepted, repositoryStatus=mediaReady, sourceType=planner-designed
- 可证明原因：materialize-route-pool 在 makeRoute 后调用 validateRouteContent(record).accepted 才 addCandidate；accepted repository 已保存本条。

↓

Step10
为什么进入 Feed（如果进入）：
- 未进入或无法证明进入 Feed：没有通过当前报告可验证的 feedReady + onlineCoverAsset 国家匹配。

真正改变路线结果的输入：
- 国家组合：由 destinations 的 countryCode 集合直接决定为 MG；plausibleCountries/CN block 可过滤，但被删国家候选 Unknown。
- 城市/景点：由 knowledge-graph-pool 候选或 coverageFallbackPlaces 形成 destinationEntities=马达加斯加门户城市 > 马达加斯加自然腹地 > 马达加斯加区域风景带。
- 天数：由 buildRouteConcept 得到 recommendedDays，再由 concreteDaysFor(hash(profile, destinations, serial)) 固化为 5。
- travelStyle：由 context/profile + buildRouteConcept 决定；保存为 classic-first-trip。
- route title：makeRoute 模板读取 titleCountry + days + styleLabelZh + first/last destination，生成当前标题。
- route summary：makeRoute 固定模板读取 styleLabelZh 和前 3 个目的地，模板化风险最高。

最后补上的标签/非决策字段：
- plannerReason：在路线骨架/concept 后写入；不证明它改变了国家、城市或天数。
- coverageContribution：由生成后的 country/destination 数量汇总；不是生成前输入。
- contentEvidence.provider/evidenceHash：主要是来源/缓存/溯源；一般不改变本条路线内容。
- designStrategies：来自 profile.strategies，更多是 profile 标签；在部分 concept validation 中被读取，但不能逐条证明改变了候选池。

删除输入后的影响判断：
- 删除 country/destinationEntities：会改变国家组合、标题、summary，或无法生成路线。★★★★★
- 删除 travelStyle/profile：会改变 concept、styleLabel、天数推导、标题主题。★★★★★
- 删除 bestMonths：会改变 bestMonths 展示；是否改变路线主体仅 seasonal/profile 可证明，普通路线无法证明。★★☆☆☆
- 删除 designStrategies：可能影响 buildRouteConcept 对 theme/season/transport 的 style 判定；但大量 profile 中是标签，逐条影响无法完全证明。★★☆☆☆
- 删除 plannerReason/coverageContribution：不会改变已生成路线内容。☆

### Route: 捷克5天公路自驾：伊赫拉瓦到拉贝河畔乌斯季

- Route ID: `materialized-16mrpap-48656`
- 抽样类别: Duration
- 可证明来源类型: Materialized Template
- 国家: CZ
- 目的地: 伊赫拉瓦 > 奥帕瓦 > 拉贝河畔乌斯季
- travelStyle: road-trip
- durationBand / days: 4-6d / 5
- Feed: 无法证明进入当前 Feed ready pool

Decision Trace:

Step1
读取：
- knowledge-graph-pool.json: destination/country candidates, as proven by provenance.source=knowledge-graph-pool or contentEvidence.materialized
- profile/travelStyle=road-trip: proven by travelStyle/travelStyleConceptKey/contentEvidence.travelMode
- countryCodes=CZ
- destinationEntities=伊赫拉瓦 > 奥帕瓦 > 拉贝河畔乌斯季
- bestMonths=5-9月
- designStrategies=Geographic+Transport+Theme
- distance calculation / routePassesPlannerRules: proven by materialize-route-pool.mjs, but per-route rejected alternatives are not persisted

↓

Step2
过滤：
- disabledCountries 包含 CN；plausibleCountries 要求国家组合在 regionGroups 中；routePassesPlannerRules 要求 concept validation、距离完整、maxSegment/span 不超限。

↓

Step3
候选国家：
- 可证明保存结果：CZ
- 生成前完整候选国家池：Unknown（accepted route 未保存被扫描/被删除候选列表）。

↓

Step4
为什么保留这些国家：
- 因为这些 destinationEntities 的 countryCode 通过 disabledCountries、plausibleCountries、距离与 concept rules；具体竞争候选 Unknown。

↓

Step5
为什么删除其它国家：
- Unknown。当前 accepted route 没有保存 rejected alternatives；只能从代码知道可能原因包括 CN block、region 不合理、距离超限、pool 为空、dedupe 太近、cluster 饱和。

↓

Step6
为什么生成当前标题：
- route title：makeRoute 模板读取 titleCountry + days + styleLabelZh + first/last destination，生成当前标题。

↓

Step7
为什么生成当前主题：
- profile/theme + buildRouteConcept 生成 travelStyle=road-trip；themes=公路自驾。

↓

Step8
为什么生成当前简介：
- route summary：makeRoute 固定模板读取 styleLabelZh 和前 3 个目的地，模板化风险最高。

↓

Step9
为什么进入 Accepted：
- 保存状态：contentQualityStatus=accepted, repositoryStatus=mediaReady, sourceType=planner-designed
- 可证明原因：materialize-route-pool 在 makeRoute 后调用 validateRouteContent(record).accepted 才 addCandidate；accepted repository 已保存本条。

↓

Step10
为什么进入 Feed（如果进入）：
- 未进入或无法证明进入 Feed：没有通过当前报告可验证的 feedReady + onlineCoverAsset 国家匹配。

真正改变路线结果的输入：
- 国家组合：由 destinations 的 countryCode 集合直接决定为 CZ；plausibleCountries/CN block 可过滤，但被删国家候选 Unknown。
- 城市/景点：由 knowledge-graph-pool 候选或 coverageFallbackPlaces 形成 destinationEntities=伊赫拉瓦 > 奥帕瓦 > 拉贝河畔乌斯季。
- 天数：由 buildRouteConcept 得到 recommendedDays，再由 concreteDaysFor(hash(profile, destinations, serial)) 固化为 5。
- travelStyle：由 context/profile + buildRouteConcept 决定；保存为 road-trip。
- route title：makeRoute 模板读取 titleCountry + days + styleLabelZh + first/last destination，生成当前标题。
- route summary：makeRoute 固定模板读取 styleLabelZh 和前 3 个目的地，模板化风险最高。

最后补上的标签/非决策字段：
- plannerReason：在路线骨架/concept 后写入；不证明它改变了国家、城市或天数。
- coverageContribution：由生成后的 country/destination 数量汇总；不是生成前输入。
- contentEvidence.provider/evidenceHash：主要是来源/缓存/溯源；一般不改变本条路线内容。
- designStrategies：来自 profile.strategies，更多是 profile 标签；在部分 concept validation 中被读取，但不能逐条证明改变了候选池。

删除输入后的影响判断：
- 删除 country/destinationEntities：会改变国家组合、标题、summary，或无法生成路线。★★★★★
- 删除 travelStyle/profile：会改变 concept、styleLabel、天数推导、标题主题。★★★★★
- 删除 bestMonths：会改变 bestMonths 展示；是否改变路线主体仅 seasonal/profile 可证明，普通路线无法证明。★★☆☆☆
- 删除 designStrategies：可能影响 buildRouteConcept 对 theme/season/transport 的 style 判定；但大量 profile 中是标签，逐条影响无法完全证明。★★☆☆☆
- 删除 plannerReason/coverageContribution：不会改变已生成路线内容。☆

### Route: 约旦7天主题游：约旦历史城区到约旦区域风景带

- Route ID: `materialized-tfz49s-51856`
- 抽样类别: Duration
- 可证明来源类型: Materialized Template
- 国家: JO
- 目的地: 约旦历史城区 > 约旦自然腹地 > 约旦地方生活区 > 约旦区域风景带
- travelStyle: theme
- durationBand / days: 7-10d / 7
- Feed: 无法证明进入当前 Feed ready pool

Decision Trace:

Step1
读取：
- knowledge-graph-pool.json: destination/country candidates, as proven by provenance.source=knowledge-graph-pool or contentEvidence.materialized
- profile/travelStyle=theme: proven by travelStyle/travelStyleConceptKey/contentEvidence.travelMode
- countryCodes=JO
- destinationEntities=约旦历史城区 > 约旦自然腹地 > 约旦地方生活区 > 约旦区域风景带
- bestMonths=9-11月
- designStrategies=Geographic+Theme+Transport
- distance calculation / routePassesPlannerRules: proven by materialize-route-pool.mjs, but per-route rejected alternatives are not persisted

↓

Step2
过滤：
- disabledCountries 包含 CN；plausibleCountries 要求国家组合在 regionGroups 中；routePassesPlannerRules 要求 concept validation、距离完整、maxSegment/span 不超限。

↓

Step3
候选国家：
- 可证明保存结果：JO
- 生成前完整候选国家池：Unknown（accepted route 未保存被扫描/被删除候选列表）。

↓

Step4
为什么保留这些国家：
- 因为这些 destinationEntities 的 countryCode 通过 disabledCountries、plausibleCountries、距离与 concept rules；具体竞争候选 Unknown。

↓

Step5
为什么删除其它国家：
- Unknown。当前 accepted route 没有保存 rejected alternatives；只能从代码知道可能原因包括 CN block、region 不合理、距离超限、pool 为空、dedupe 太近、cluster 饱和。

↓

Step6
为什么生成当前标题：
- route title：makeRoute 模板读取 titleCountry + days + styleLabelZh + first/last destination，生成当前标题。

↓

Step7
为什么生成当前主题：
- profile/theme + buildRouteConcept 生成 travelStyle=theme；themes=主题游。

↓

Step8
为什么生成当前简介：
- route summary：makeRoute 固定模板读取 styleLabelZh 和前 3 个目的地，模板化风险最高。

↓

Step9
为什么进入 Accepted：
- 保存状态：contentQualityStatus=accepted, repositoryStatus=mediaReady, sourceType=planner-designed
- 可证明原因：materialize-route-pool 在 makeRoute 后调用 validateRouteContent(record).accepted 才 addCandidate；accepted repository 已保存本条。

↓

Step10
为什么进入 Feed（如果进入）：
- 未进入或无法证明进入 Feed：没有通过当前报告可验证的 feedReady + onlineCoverAsset 国家匹配。

真正改变路线结果的输入：
- 国家组合：由 destinations 的 countryCode 集合直接决定为 JO；plausibleCountries/CN block 可过滤，但被删国家候选 Unknown。
- 城市/景点：由 knowledge-graph-pool 候选或 coverageFallbackPlaces 形成 destinationEntities=约旦历史城区 > 约旦自然腹地 > 约旦地方生活区 > 约旦区域风景带。
- 天数：由 buildRouteConcept 得到 recommendedDays，再由 concreteDaysFor(hash(profile, destinations, serial)) 固化为 7。
- travelStyle：由 context/profile + buildRouteConcept 决定；保存为 theme。
- route title：makeRoute 模板读取 titleCountry + days + styleLabelZh + first/last destination，生成当前标题。
- route summary：makeRoute 固定模板读取 styleLabelZh 和前 3 个目的地，模板化风险最高。

最后补上的标签/非决策字段：
- plannerReason：在路线骨架/concept 后写入；不证明它改变了国家、城市或天数。
- coverageContribution：由生成后的 country/destination 数量汇总；不是生成前输入。
- contentEvidence.provider/evidenceHash：主要是来源/缓存/溯源；一般不改变本条路线内容。
- designStrategies：来自 profile.strategies，更多是 profile 标签；在部分 concept validation 中被读取，但不能逐条证明改变了候选池。

删除输入后的影响判断：
- 删除 country/destinationEntities：会改变国家组合、标题、summary，或无法生成路线。★★★★★
- 删除 travelStyle/profile：会改变 concept、styleLabel、天数推导、标题主题。★★★★★
- 删除 bestMonths：会改变 bestMonths 展示；是否改变路线主体仅 seasonal/profile 可证明，普通路线无法证明。★★☆☆☆
- 删除 designStrategies：可能影响 buildRouteConcept 对 theme/season/transport 的 style 判定；但大量 profile 中是标签，逐条影响无法完全证明。★★☆☆☆
- 删除 plannerReason/coverageContribution：不会改变已生成路线内容。☆

### Route: 多哥7天铁路旅程：多哥自然腹地到多哥文化停留区

- Route ID: `materialized-mi859q-52147`
- 抽样类别: Duration
- 可证明来源类型: Materialized Template
- 国家: TG
- 目的地: 多哥自然腹地 > 多哥地方生活区 > 多哥区域风景带 > 多哥文化停留区
- travelStyle: rail-journey
- durationBand / days: 7-10d / 7
- Feed: 无法证明进入当前 Feed ready pool

Decision Trace:

Step1
读取：
- knowledge-graph-pool.json: destination/country candidates, as proven by provenance.source=knowledge-graph-pool or contentEvidence.materialized
- profile/travelStyle=rail-journey: proven by travelStyle/travelStyleConceptKey/contentEvidence.travelMode
- countryCodes=TG
- destinationEntities=多哥自然腹地 > 多哥地方生活区 > 多哥区域风景带 > 多哥文化停留区
- bestMonths=4-10月
- designStrategies=Geographic+Transport+Theme
- distance calculation / routePassesPlannerRules: proven by materialize-route-pool.mjs, but per-route rejected alternatives are not persisted

↓

Step2
过滤：
- disabledCountries 包含 CN；plausibleCountries 要求国家组合在 regionGroups 中；routePassesPlannerRules 要求 concept validation、距离完整、maxSegment/span 不超限。

↓

Step3
候选国家：
- 可证明保存结果：TG
- 生成前完整候选国家池：Unknown（accepted route 未保存被扫描/被删除候选列表）。

↓

Step4
为什么保留这些国家：
- 因为这些 destinationEntities 的 countryCode 通过 disabledCountries、plausibleCountries、距离与 concept rules；具体竞争候选 Unknown。

↓

Step5
为什么删除其它国家：
- Unknown。当前 accepted route 没有保存 rejected alternatives；只能从代码知道可能原因包括 CN block、region 不合理、距离超限、pool 为空、dedupe 太近、cluster 饱和。

↓

Step6
为什么生成当前标题：
- route title：makeRoute 模板读取 titleCountry + days + styleLabelZh + first/last destination，生成当前标题。

↓

Step7
为什么生成当前主题：
- profile/theme + buildRouteConcept 生成 travelStyle=rail-journey；themes=铁路旅程。

↓

Step8
为什么生成当前简介：
- route summary：makeRoute 固定模板读取 styleLabelZh 和前 3 个目的地，模板化风险最高。

↓

Step9
为什么进入 Accepted：
- 保存状态：contentQualityStatus=accepted, repositoryStatus=mediaReady, sourceType=planner-designed
- 可证明原因：materialize-route-pool 在 makeRoute 后调用 validateRouteContent(record).accepted 才 addCandidate；accepted repository 已保存本条。

↓

Step10
为什么进入 Feed（如果进入）：
- 未进入或无法证明进入 Feed：没有通过当前报告可验证的 feedReady + onlineCoverAsset 国家匹配。

真正改变路线结果的输入：
- 国家组合：由 destinations 的 countryCode 集合直接决定为 TG；plausibleCountries/CN block 可过滤，但被删国家候选 Unknown。
- 城市/景点：由 knowledge-graph-pool 候选或 coverageFallbackPlaces 形成 destinationEntities=多哥自然腹地 > 多哥地方生活区 > 多哥区域风景带 > 多哥文化停留区。
- 天数：由 buildRouteConcept 得到 recommendedDays，再由 concreteDaysFor(hash(profile, destinations, serial)) 固化为 7。
- travelStyle：由 context/profile + buildRouteConcept 决定；保存为 rail-journey。
- route title：makeRoute 模板读取 titleCountry + days + styleLabelZh + first/last destination，生成当前标题。
- route summary：makeRoute 固定模板读取 styleLabelZh 和前 3 个目的地，模板化风险最高。

最后补上的标签/非决策字段：
- plannerReason：在路线骨架/concept 后写入；不证明它改变了国家、城市或天数。
- coverageContribution：由生成后的 country/destination 数量汇总；不是生成前输入。
- contentEvidence.provider/evidenceHash：主要是来源/缓存/溯源；一般不改变本条路线内容。
- designStrategies：来自 profile.strategies，更多是 profile 标签；在部分 concept validation 中被读取，但不能逐条证明改变了候选池。

删除输入后的影响判断：
- 删除 country/destinationEntities：会改变国家组合、标题、summary，或无法生成路线。★★★★★
- 删除 travelStyle/profile：会改变 concept、styleLabel、天数推导、标题主题。★★★★★
- 删除 bestMonths：会改变 bestMonths 展示；是否改变路线主体仅 seasonal/profile 可证明，普通路线无法证明。★★☆☆☆
- 删除 designStrategies：可能影响 buildRouteConcept 对 theme/season/transport 的 style 判定；但大量 profile 中是标签，逐条影响无法完全证明。★★☆☆☆
- 删除 plannerReason/coverageContribution：不会改变已生成路线内容。☆

### Route: 厄立特里亚7天铁路旅程：厄立特里亚区域风景带到厄立特里亚历史城区

- Route ID: `materialized-1kbxipv-52504`
- 抽样类别: Duration
- 可证明来源类型: Materialized Template
- 国家: ER
- 目的地: 厄立特里亚区域风景带 > 厄立特里亚文化停留区 > 厄立特里亚门户城市 > 厄立特里亚历史城区
- travelStyle: rail-journey
- durationBand / days: 7-10d / 7
- Feed: 无法证明进入当前 Feed ready pool

Decision Trace:

Step1
读取：
- knowledge-graph-pool.json: destination/country candidates, as proven by provenance.source=knowledge-graph-pool or contentEvidence.materialized
- profile/travelStyle=rail-journey: proven by travelStyle/travelStyleConceptKey/contentEvidence.travelMode
- countryCodes=ER
- destinationEntities=厄立特里亚区域风景带 > 厄立特里亚文化停留区 > 厄立特里亚门户城市 > 厄立特里亚历史城区
- bestMonths=4-10月
- designStrategies=Geographic+Transport+Theme
- distance calculation / routePassesPlannerRules: proven by materialize-route-pool.mjs, but per-route rejected alternatives are not persisted

↓

Step2
过滤：
- disabledCountries 包含 CN；plausibleCountries 要求国家组合在 regionGroups 中；routePassesPlannerRules 要求 concept validation、距离完整、maxSegment/span 不超限。

↓

Step3
候选国家：
- 可证明保存结果：ER
- 生成前完整候选国家池：Unknown（accepted route 未保存被扫描/被删除候选列表）。

↓

Step4
为什么保留这些国家：
- 因为这些 destinationEntities 的 countryCode 通过 disabledCountries、plausibleCountries、距离与 concept rules；具体竞争候选 Unknown。

↓

Step5
为什么删除其它国家：
- Unknown。当前 accepted route 没有保存 rejected alternatives；只能从代码知道可能原因包括 CN block、region 不合理、距离超限、pool 为空、dedupe 太近、cluster 饱和。

↓

Step6
为什么生成当前标题：
- route title：makeRoute 模板读取 titleCountry + days + styleLabelZh + first/last destination，生成当前标题。

↓

Step7
为什么生成当前主题：
- profile/theme + buildRouteConcept 生成 travelStyle=rail-journey；themes=铁路旅程。

↓

Step8
为什么生成当前简介：
- route summary：makeRoute 固定模板读取 styleLabelZh 和前 3 个目的地，模板化风险最高。

↓

Step9
为什么进入 Accepted：
- 保存状态：contentQualityStatus=accepted, repositoryStatus=mediaReady, sourceType=planner-designed
- 可证明原因：materialize-route-pool 在 makeRoute 后调用 validateRouteContent(record).accepted 才 addCandidate；accepted repository 已保存本条。

↓

Step10
为什么进入 Feed（如果进入）：
- 未进入或无法证明进入 Feed：没有通过当前报告可验证的 feedReady + onlineCoverAsset 国家匹配。

真正改变路线结果的输入：
- 国家组合：由 destinations 的 countryCode 集合直接决定为 ER；plausibleCountries/CN block 可过滤，但被删国家候选 Unknown。
- 城市/景点：由 knowledge-graph-pool 候选或 coverageFallbackPlaces 形成 destinationEntities=厄立特里亚区域风景带 > 厄立特里亚文化停留区 > 厄立特里亚门户城市 > 厄立特里亚历史城区。
- 天数：由 buildRouteConcept 得到 recommendedDays，再由 concreteDaysFor(hash(profile, destinations, serial)) 固化为 7。
- travelStyle：由 context/profile + buildRouteConcept 决定；保存为 rail-journey。
- route title：makeRoute 模板读取 titleCountry + days + styleLabelZh + first/last destination，生成当前标题。
- route summary：makeRoute 固定模板读取 styleLabelZh 和前 3 个目的地，模板化风险最高。

最后补上的标签/非决策字段：
- plannerReason：在路线骨架/concept 后写入；不证明它改变了国家、城市或天数。
- coverageContribution：由生成后的 country/destination 数量汇总；不是生成前输入。
- contentEvidence.provider/evidenceHash：主要是来源/缓存/溯源；一般不改变本条路线内容。
- designStrategies：来自 profile.strategies，更多是 profile 标签；在部分 concept validation 中被读取，但不能逐条证明改变了候选池。

删除输入后的影响判断：
- 删除 country/destinationEntities：会改变国家组合、标题、summary，或无法生成路线。★★★★★
- 删除 travelStyle/profile：会改变 concept、styleLabel、天数推导、标题主题。★★★★★
- 删除 bestMonths：会改变 bestMonths 展示；是否改变路线主体仅 seasonal/profile 可证明，普通路线无法证明。★★☆☆☆
- 删除 designStrategies：可能影响 buildRouteConcept 对 theme/season/transport 的 style 判定；但大量 profile 中是标签，逐条影响无法完全证明。★★☆☆☆
- 删除 plannerReason/coverageContribution：不会改变已生成路线内容。☆

### Route: 巴拉圭7天经典首访：巴拉圭文化停留区到巴拉圭自然腹地

- Route ID: `materialized-z4utjy-52786`
- 抽样类别: Duration
- 可证明来源类型: Materialized Template
- 国家: PY
- 目的地: 巴拉圭文化停留区 > 巴拉圭门户城市 > 巴拉圭历史城区 > 巴拉圭自然腹地
- travelStyle: classic-first-trip
- durationBand / days: 7-10d / 7
- Feed: 无法证明进入当前 Feed ready pool

Decision Trace:

Step1
读取：
- knowledge-graph-pool.json: destination/country candidates, as proven by provenance.source=knowledge-graph-pool or contentEvidence.materialized
- profile/travelStyle=classic-first-trip: proven by travelStyle/travelStyleConceptKey/contentEvidence.travelMode
- countryCodes=PY
- destinationEntities=巴拉圭文化停留区 > 巴拉圭门户城市 > 巴拉圭历史城区 > 巴拉圭自然腹地
- bestMonths=3-5月
- designStrategies=Geographic+Season+Theme+Transport
- distance calculation / routePassesPlannerRules: proven by materialize-route-pool.mjs, but per-route rejected alternatives are not persisted

↓

Step2
过滤：
- disabledCountries 包含 CN；plausibleCountries 要求国家组合在 regionGroups 中；routePassesPlannerRules 要求 concept validation、距离完整、maxSegment/span 不超限。

↓

Step3
候选国家：
- 可证明保存结果：PY
- 生成前完整候选国家池：Unknown（accepted route 未保存被扫描/被删除候选列表）。

↓

Step4
为什么保留这些国家：
- 因为这些 destinationEntities 的 countryCode 通过 disabledCountries、plausibleCountries、距离与 concept rules；具体竞争候选 Unknown。

↓

Step5
为什么删除其它国家：
- Unknown。当前 accepted route 没有保存 rejected alternatives；只能从代码知道可能原因包括 CN block、region 不合理、距离超限、pool 为空、dedupe 太近、cluster 饱和。

↓

Step6
为什么生成当前标题：
- route title：makeRoute 模板读取 titleCountry + days + styleLabelZh + first/last destination，生成当前标题。

↓

Step7
为什么生成当前主题：
- profile/theme + buildRouteConcept 生成 travelStyle=classic-first-trip；themes=经典首访。

↓

Step8
为什么生成当前简介：
- route summary：makeRoute 固定模板读取 styleLabelZh 和前 3 个目的地，模板化风险最高。

↓

Step9
为什么进入 Accepted：
- 保存状态：contentQualityStatus=accepted, repositoryStatus=mediaReady, sourceType=planner-designed
- 可证明原因：materialize-route-pool 在 makeRoute 后调用 validateRouteContent(record).accepted 才 addCandidate；accepted repository 已保存本条。

↓

Step10
为什么进入 Feed（如果进入）：
- 未进入或无法证明进入 Feed：没有通过当前报告可验证的 feedReady + onlineCoverAsset 国家匹配。

真正改变路线结果的输入：
- 国家组合：由 destinations 的 countryCode 集合直接决定为 PY；plausibleCountries/CN block 可过滤，但被删国家候选 Unknown。
- 城市/景点：由 knowledge-graph-pool 候选或 coverageFallbackPlaces 形成 destinationEntities=巴拉圭文化停留区 > 巴拉圭门户城市 > 巴拉圭历史城区 > 巴拉圭自然腹地。
- 天数：由 buildRouteConcept 得到 recommendedDays，再由 concreteDaysFor(hash(profile, destinations, serial)) 固化为 7。
- travelStyle：由 context/profile + buildRouteConcept 决定；保存为 classic-first-trip。
- route title：makeRoute 模板读取 titleCountry + days + styleLabelZh + first/last destination，生成当前标题。
- route summary：makeRoute 固定模板读取 styleLabelZh 和前 3 个目的地，模板化风险最高。

最后补上的标签/非决策字段：
- plannerReason：在路线骨架/concept 后写入；不证明它改变了国家、城市或天数。
- coverageContribution：由生成后的 country/destination 数量汇总；不是生成前输入。
- contentEvidence.provider/evidenceHash：主要是来源/缓存/溯源；一般不改变本条路线内容。
- designStrategies：来自 profile.strategies，更多是 profile 标签；在部分 concept validation 中被读取，但不能逐条证明改变了候选池。

删除输入后的影响判断：
- 删除 country/destinationEntities：会改变国家组合、标题、summary，或无法生成路线。★★★★★
- 删除 travelStyle/profile：会改变 concept、styleLabel、天数推导、标题主题。★★★★★
- 删除 bestMonths：会改变 bestMonths 展示；是否改变路线主体仅 seasonal/profile 可证明，普通路线无法证明。★★☆☆☆
- 删除 designStrategies：可能影响 buildRouteConcept 对 theme/season/transport 的 style 判定；但大量 profile 中是标签，逐条影响无法完全证明。★★☆☆☆
- 删除 plannerReason/coverageContribution：不会改变已生成路线内容。☆

### Route: 白俄罗斯8天经典首访：白俄罗斯历史城区到白俄罗斯文化停留区

- Route ID: `materialized-fwpoqr-54194`
- 抽样类别: Duration
- 可证明来源类型: Materialized Template
- 国家: BY
- 目的地: 白俄罗斯历史城区 > 白俄罗斯自然腹地 > 白俄罗斯地方生活区 > 白俄罗斯区域风景带 > 白俄罗斯文化停留区
- travelStyle: classic-first-trip
- durationBand / days: 7-10d / 8
- Feed: 无法证明进入当前 Feed ready pool

Decision Trace:

Step1
读取：
- knowledge-graph-pool.json: destination/country candidates, as proven by provenance.source=knowledge-graph-pool or contentEvidence.materialized
- profile/travelStyle=classic-first-trip: proven by travelStyle/travelStyleConceptKey/contentEvidence.travelMode
- countryCodes=BY
- destinationEntities=白俄罗斯历史城区 > 白俄罗斯自然腹地 > 白俄罗斯地方生活区 > 白俄罗斯区域风景带 > 白俄罗斯文化停留区
- bestMonths=4-10月
- designStrategies=Geographic+Theme+Transport
- distance calculation / routePassesPlannerRules: proven by materialize-route-pool.mjs, but per-route rejected alternatives are not persisted

↓

Step2
过滤：
- disabledCountries 包含 CN；plausibleCountries 要求国家组合在 regionGroups 中；routePassesPlannerRules 要求 concept validation、距离完整、maxSegment/span 不超限。

↓

Step3
候选国家：
- 可证明保存结果：BY
- 生成前完整候选国家池：Unknown（accepted route 未保存被扫描/被删除候选列表）。

↓

Step4
为什么保留这些国家：
- 因为这些 destinationEntities 的 countryCode 通过 disabledCountries、plausibleCountries、距离与 concept rules；具体竞争候选 Unknown。

↓

Step5
为什么删除其它国家：
- Unknown。当前 accepted route 没有保存 rejected alternatives；只能从代码知道可能原因包括 CN block、region 不合理、距离超限、pool 为空、dedupe 太近、cluster 饱和。

↓

Step6
为什么生成当前标题：
- route title：makeRoute 模板读取 titleCountry + days + styleLabelZh + first/last destination，生成当前标题。

↓

Step7
为什么生成当前主题：
- profile/theme + buildRouteConcept 生成 travelStyle=classic-first-trip；themes=经典首访。

↓

Step8
为什么生成当前简介：
- route summary：makeRoute 固定模板读取 styleLabelZh 和前 3 个目的地，模板化风险最高。

↓

Step9
为什么进入 Accepted：
- 保存状态：contentQualityStatus=accepted, repositoryStatus=mediaReady, sourceType=planner-designed
- 可证明原因：materialize-route-pool 在 makeRoute 后调用 validateRouteContent(record).accepted 才 addCandidate；accepted repository 已保存本条。

↓

Step10
为什么进入 Feed（如果进入）：
- 未进入或无法证明进入 Feed：没有通过当前报告可验证的 feedReady + onlineCoverAsset 国家匹配。

真正改变路线结果的输入：
- 国家组合：由 destinations 的 countryCode 集合直接决定为 BY；plausibleCountries/CN block 可过滤，但被删国家候选 Unknown。
- 城市/景点：由 knowledge-graph-pool 候选或 coverageFallbackPlaces 形成 destinationEntities=白俄罗斯历史城区 > 白俄罗斯自然腹地 > 白俄罗斯地方生活区 > 白俄罗斯区域风景带 > 白俄罗斯文化停留区。
- 天数：由 buildRouteConcept 得到 recommendedDays，再由 concreteDaysFor(hash(profile, destinations, serial)) 固化为 8。
- travelStyle：由 context/profile + buildRouteConcept 决定；保存为 classic-first-trip。
- route title：makeRoute 模板读取 titleCountry + days + styleLabelZh + first/last destination，生成当前标题。
- route summary：makeRoute 固定模板读取 styleLabelZh 和前 3 个目的地，模板化风险最高。

最后补上的标签/非决策字段：
- plannerReason：在路线骨架/concept 后写入；不证明它改变了国家、城市或天数。
- coverageContribution：由生成后的 country/destination 数量汇总；不是生成前输入。
- contentEvidence.provider/evidenceHash：主要是来源/缓存/溯源；一般不改变本条路线内容。
- designStrategies：来自 profile.strategies，更多是 profile 标签；在部分 concept validation 中被读取，但不能逐条证明改变了候选池。

删除输入后的影响判断：
- 删除 country/destinationEntities：会改变国家组合、标题、summary，或无法生成路线。★★★★★
- 删除 travelStyle/profile：会改变 concept、styleLabel、天数推导、标题主题。★★★★★
- 删除 bestMonths：会改变 bestMonths 展示；是否改变路线主体仅 seasonal/profile 可证明，普通路线无法证明。★★☆☆☆
- 删除 designStrategies：可能影响 buildRouteConcept 对 theme/season/transport 的 style 判定；但大量 profile 中是标签，逐条影响无法完全证明。★★☆☆☆
- 删除 plannerReason/coverageContribution：不会改变已生成路线内容。☆

### Route: 马拉维9天经典首访：马拉维自然腹地到马拉维门户城市

- Route ID: `materialized-1xbt3uc-54474`
- 抽样类别: Duration
- 可证明来源类型: Materialized Template
- 国家: MW
- 目的地: 马拉维自然腹地 > 马拉维地方生活区 > 马拉维区域风景带 > 马拉维文化停留区 > 马拉维门户城市
- travelStyle: classic-first-trip
- durationBand / days: 7-10d / 9
- Feed: 无法证明进入当前 Feed ready pool

Decision Trace:

Step1
读取：
- knowledge-graph-pool.json: destination/country candidates, as proven by provenance.source=knowledge-graph-pool or contentEvidence.materialized
- profile/travelStyle=classic-first-trip: proven by travelStyle/travelStyleConceptKey/contentEvidence.travelMode
- countryCodes=MW
- destinationEntities=马拉维自然腹地 > 马拉维地方生活区 > 马拉维区域风景带 > 马拉维文化停留区 > 马拉维门户城市
- bestMonths=4-10月
- designStrategies=Geographic+Theme+Transport
- distance calculation / routePassesPlannerRules: proven by materialize-route-pool.mjs, but per-route rejected alternatives are not persisted

↓

Step2
过滤：
- disabledCountries 包含 CN；plausibleCountries 要求国家组合在 regionGroups 中；routePassesPlannerRules 要求 concept validation、距离完整、maxSegment/span 不超限。

↓

Step3
候选国家：
- 可证明保存结果：MW
- 生成前完整候选国家池：Unknown（accepted route 未保存被扫描/被删除候选列表）。

↓

Step4
为什么保留这些国家：
- 因为这些 destinationEntities 的 countryCode 通过 disabledCountries、plausibleCountries、距离与 concept rules；具体竞争候选 Unknown。

↓

Step5
为什么删除其它国家：
- Unknown。当前 accepted route 没有保存 rejected alternatives；只能从代码知道可能原因包括 CN block、region 不合理、距离超限、pool 为空、dedupe 太近、cluster 饱和。

↓

Step6
为什么生成当前标题：
- route title：makeRoute 模板读取 titleCountry + days + styleLabelZh + first/last destination，生成当前标题。

↓

Step7
为什么生成当前主题：
- profile/theme + buildRouteConcept 生成 travelStyle=classic-first-trip；themes=经典首访。

↓

Step8
为什么生成当前简介：
- route summary：makeRoute 固定模板读取 styleLabelZh 和前 3 个目的地，模板化风险最高。

↓

Step9
为什么进入 Accepted：
- 保存状态：contentQualityStatus=accepted, repositoryStatus=mediaReady, sourceType=planner-designed
- 可证明原因：materialize-route-pool 在 makeRoute 后调用 validateRouteContent(record).accepted 才 addCandidate；accepted repository 已保存本条。

↓

Step10
为什么进入 Feed（如果进入）：
- 未进入或无法证明进入 Feed：没有通过当前报告可验证的 feedReady + onlineCoverAsset 国家匹配。

真正改变路线结果的输入：
- 国家组合：由 destinations 的 countryCode 集合直接决定为 MW；plausibleCountries/CN block 可过滤，但被删国家候选 Unknown。
- 城市/景点：由 knowledge-graph-pool 候选或 coverageFallbackPlaces 形成 destinationEntities=马拉维自然腹地 > 马拉维地方生活区 > 马拉维区域风景带 > 马拉维文化停留区 > 马拉维门户城市。
- 天数：由 buildRouteConcept 得到 recommendedDays，再由 concreteDaysFor(hash(profile, destinations, serial)) 固化为 9。
- travelStyle：由 context/profile + buildRouteConcept 决定；保存为 classic-first-trip。
- route title：makeRoute 模板读取 titleCountry + days + styleLabelZh + first/last destination，生成当前标题。
- route summary：makeRoute 固定模板读取 styleLabelZh 和前 3 个目的地，模板化风险最高。

最后补上的标签/非决策字段：
- plannerReason：在路线骨架/concept 后写入；不证明它改变了国家、城市或天数。
- coverageContribution：由生成后的 country/destination 数量汇总；不是生成前输入。
- contentEvidence.provider/evidenceHash：主要是来源/缓存/溯源；一般不改变本条路线内容。
- designStrategies：来自 profile.strategies，更多是 profile 标签；在部分 concept validation 中被读取，但不能逐条证明改变了候选池。

删除输入后的影响判断：
- 删除 country/destinationEntities：会改变国家组合、标题、summary，或无法生成路线。★★★★★
- 删除 travelStyle/profile：会改变 concept、styleLabel、天数推导、标题主题。★★★★★
- 删除 bestMonths：会改变 bestMonths 展示；是否改变路线主体仅 seasonal/profile 可证明，普通路线无法证明。★★☆☆☆
- 删除 designStrategies：可能影响 buildRouteConcept 对 theme/season/transport 的 style 判定；但大量 profile 中是标签，逐条影响无法完全证明。★★☆☆☆
- 删除 plannerReason/coverageContribution：不会改变已生成路线内容。☆

### Route: 阿富汗8天铁路旅程：阿富汗区域风景带到阿富汗自然腹地

- Route ID: `materialized-15zx7eh-54764`
- 抽样类别: Duration
- 可证明来源类型: Materialized Template
- 国家: AF
- 目的地: 阿富汗区域风景带 > 阿富汗文化停留区 > 阿富汗门户城市 > 阿富汗历史城区 > 阿富汗自然腹地
- travelStyle: rail-journey
- durationBand / days: 7-10d / 8
- Feed: 无法证明进入当前 Feed ready pool

Decision Trace:

Step1
读取：
- knowledge-graph-pool.json: destination/country candidates, as proven by provenance.source=knowledge-graph-pool or contentEvidence.materialized
- profile/travelStyle=rail-journey: proven by travelStyle/travelStyleConceptKey/contentEvidence.travelMode
- countryCodes=AF
- destinationEntities=阿富汗区域风景带 > 阿富汗文化停留区 > 阿富汗门户城市 > 阿富汗历史城区 > 阿富汗自然腹地
- bestMonths=4-10月
- designStrategies=Geographic+Transport+Theme
- distance calculation / routePassesPlannerRules: proven by materialize-route-pool.mjs, but per-route rejected alternatives are not persisted

↓

Step2
过滤：
- disabledCountries 包含 CN；plausibleCountries 要求国家组合在 regionGroups 中；routePassesPlannerRules 要求 concept validation、距离完整、maxSegment/span 不超限。

↓

Step3
候选国家：
- 可证明保存结果：AF
- 生成前完整候选国家池：Unknown（accepted route 未保存被扫描/被删除候选列表）。

↓

Step4
为什么保留这些国家：
- 因为这些 destinationEntities 的 countryCode 通过 disabledCountries、plausibleCountries、距离与 concept rules；具体竞争候选 Unknown。

↓

Step5
为什么删除其它国家：
- Unknown。当前 accepted route 没有保存 rejected alternatives；只能从代码知道可能原因包括 CN block、region 不合理、距离超限、pool 为空、dedupe 太近、cluster 饱和。

↓

Step6
为什么生成当前标题：
- route title：makeRoute 模板读取 titleCountry + days + styleLabelZh + first/last destination，生成当前标题。

↓

Step7
为什么生成当前主题：
- profile/theme + buildRouteConcept 生成 travelStyle=rail-journey；themes=铁路旅程。

↓

Step8
为什么生成当前简介：
- route summary：makeRoute 固定模板读取 styleLabelZh 和前 3 个目的地，模板化风险最高。

↓

Step9
为什么进入 Accepted：
- 保存状态：contentQualityStatus=accepted, repositoryStatus=mediaReady, sourceType=planner-designed
- 可证明原因：materialize-route-pool 在 makeRoute 后调用 validateRouteContent(record).accepted 才 addCandidate；accepted repository 已保存本条。

↓

Step10
为什么进入 Feed（如果进入）：
- 未进入或无法证明进入 Feed：没有通过当前报告可验证的 feedReady + onlineCoverAsset 国家匹配。

真正改变路线结果的输入：
- 国家组合：由 destinations 的 countryCode 集合直接决定为 AF；plausibleCountries/CN block 可过滤，但被删国家候选 Unknown。
- 城市/景点：由 knowledge-graph-pool 候选或 coverageFallbackPlaces 形成 destinationEntities=阿富汗区域风景带 > 阿富汗文化停留区 > 阿富汗门户城市 > 阿富汗历史城区 > 阿富汗自然腹地。
- 天数：由 buildRouteConcept 得到 recommendedDays，再由 concreteDaysFor(hash(profile, destinations, serial)) 固化为 8。
- travelStyle：由 context/profile + buildRouteConcept 决定；保存为 rail-journey。
- route title：makeRoute 模板读取 titleCountry + days + styleLabelZh + first/last destination，生成当前标题。
- route summary：makeRoute 固定模板读取 styleLabelZh 和前 3 个目的地，模板化风险最高。

最后补上的标签/非决策字段：
- plannerReason：在路线骨架/concept 后写入；不证明它改变了国家、城市或天数。
- coverageContribution：由生成后的 country/destination 数量汇总；不是生成前输入。
- contentEvidence.provider/evidenceHash：主要是来源/缓存/溯源；一般不改变本条路线内容。
- designStrategies：来自 profile.strategies，更多是 profile 标签；在部分 concept validation 中被读取，但不能逐条证明改变了候选池。

删除输入后的影响判断：
- 删除 country/destinationEntities：会改变国家组合、标题、summary，或无法生成路线。★★★★★
- 删除 travelStyle/profile：会改变 concept、styleLabel、天数推导、标题主题。★★★★★
- 删除 bestMonths：会改变 bestMonths 展示；是否改变路线主体仅 seasonal/profile 可证明，普通路线无法证明。★★☆☆☆
- 删除 designStrategies：可能影响 buildRouteConcept 对 theme/season/transport 的 style 判定；但大量 profile 中是标签，逐条影响无法完全证明。★★☆☆☆
- 删除 plannerReason/coverageContribution：不会改变已生成路线内容。☆

### Route: 圣卢西亚8天公路自驾：圣卢西亚文化停留区到圣卢西亚地方生活区

- Route ID: `materialized-1vmohcv-55045`
- 抽样类别: Duration
- 可证明来源类型: Materialized Template
- 国家: LC
- 目的地: 圣卢西亚文化停留区 > 圣卢西亚门户城市 > 圣卢西亚历史城区 > 圣卢西亚自然腹地 > 圣卢西亚地方生活区
- travelStyle: road-trip
- durationBand / days: 7-10d / 8
- Feed: 无法证明进入当前 Feed ready pool

Decision Trace:

Step1
读取：
- knowledge-graph-pool.json: destination/country candidates, as proven by provenance.source=knowledge-graph-pool or contentEvidence.materialized
- profile/travelStyle=road-trip: proven by travelStyle/travelStyleConceptKey/contentEvidence.travelMode
- countryCodes=LC
- destinationEntities=圣卢西亚文化停留区 > 圣卢西亚门户城市 > 圣卢西亚历史城区 > 圣卢西亚自然腹地 > 圣卢西亚地方生活区
- bestMonths=5-9月
- designStrategies=Geographic+Transport+Theme
- distance calculation / routePassesPlannerRules: proven by materialize-route-pool.mjs, but per-route rejected alternatives are not persisted

↓

Step2
过滤：
- disabledCountries 包含 CN；plausibleCountries 要求国家组合在 regionGroups 中；routePassesPlannerRules 要求 concept validation、距离完整、maxSegment/span 不超限。

↓

Step3
候选国家：
- 可证明保存结果：LC
- 生成前完整候选国家池：Unknown（accepted route 未保存被扫描/被删除候选列表）。

↓

Step4
为什么保留这些国家：
- 因为这些 destinationEntities 的 countryCode 通过 disabledCountries、plausibleCountries、距离与 concept rules；具体竞争候选 Unknown。

↓

Step5
为什么删除其它国家：
- Unknown。当前 accepted route 没有保存 rejected alternatives；只能从代码知道可能原因包括 CN block、region 不合理、距离超限、pool 为空、dedupe 太近、cluster 饱和。

↓

Step6
为什么生成当前标题：
- route title：makeRoute 模板读取 titleCountry + days + styleLabelZh + first/last destination，生成当前标题。

↓

Step7
为什么生成当前主题：
- profile/theme + buildRouteConcept 生成 travelStyle=road-trip；themes=公路自驾。

↓

Step8
为什么生成当前简介：
- route summary：makeRoute 固定模板读取 styleLabelZh 和前 3 个目的地，模板化风险最高。

↓

Step9
为什么进入 Accepted：
- 保存状态：contentQualityStatus=accepted, repositoryStatus=mediaReady, sourceType=planner-designed
- 可证明原因：materialize-route-pool 在 makeRoute 后调用 validateRouteContent(record).accepted 才 addCandidate；accepted repository 已保存本条。

↓

Step10
为什么进入 Feed（如果进入）：
- 未进入或无法证明进入 Feed：没有通过当前报告可验证的 feedReady + onlineCoverAsset 国家匹配。

真正改变路线结果的输入：
- 国家组合：由 destinations 的 countryCode 集合直接决定为 LC；plausibleCountries/CN block 可过滤，但被删国家候选 Unknown。
- 城市/景点：由 knowledge-graph-pool 候选或 coverageFallbackPlaces 形成 destinationEntities=圣卢西亚文化停留区 > 圣卢西亚门户城市 > 圣卢西亚历史城区 > 圣卢西亚自然腹地 > 圣卢西亚地方生活区。
- 天数：由 buildRouteConcept 得到 recommendedDays，再由 concreteDaysFor(hash(profile, destinations, serial)) 固化为 8。
- travelStyle：由 context/profile + buildRouteConcept 决定；保存为 road-trip。
- route title：makeRoute 模板读取 titleCountry + days + styleLabelZh + first/last destination，生成当前标题。
- route summary：makeRoute 固定模板读取 styleLabelZh 和前 3 个目的地，模板化风险最高。

最后补上的标签/非决策字段：
- plannerReason：在路线骨架/concept 后写入；不证明它改变了国家、城市或天数。
- coverageContribution：由生成后的 country/destination 数量汇总；不是生成前输入。
- contentEvidence.provider/evidenceHash：主要是来源/缓存/溯源；一般不改变本条路线内容。
- designStrategies：来自 profile.strategies，更多是 profile 标签；在部分 concept validation 中被读取，但不能逐条证明改变了候选池。

删除输入后的影响判断：
- 删除 country/destinationEntities：会改变国家组合、标题、summary，或无法生成路线。★★★★★
- 删除 travelStyle/profile：会改变 concept、styleLabel、天数推导、标题主题。★★★★★
- 删除 bestMonths：会改变 bestMonths 展示；是否改变路线主体仅 seasonal/profile 可证明，普通路线无法证明。★★☆☆☆
- 删除 designStrategies：可能影响 buildRouteConcept 对 theme/season/transport 的 style 判定；但大量 profile 中是标签，逐条影响无法完全证明。★★☆☆☆
- 删除 plannerReason/coverageContribution：不会改变已生成路线内容。☆

### Route: 梵蒂冈14天经典首访：梵蒂冈门户城市到梵蒂冈文化停留区

- Route ID: `materialized-1jrvncx-56368`
- 抽样类别: Duration
- 可证明来源类型: Materialized Template
- 国家: VA
- 目的地: 梵蒂冈门户城市 > 梵蒂冈历史城区 > 梵蒂冈自然腹地 > 梵蒂冈地方生活区 > 梵蒂冈区域风景带 > 梵蒂冈文化停留区
- travelStyle: classic-first-trip
- durationBand / days: 10-14d / 14
- Feed: 无法证明进入当前 Feed ready pool

Decision Trace:

Step1
读取：
- knowledge-graph-pool.json: destination/country candidates, as proven by provenance.source=knowledge-graph-pool or contentEvidence.materialized
- profile/travelStyle=classic-first-trip: proven by travelStyle/travelStyleConceptKey/contentEvidence.travelMode
- countryCodes=VA
- destinationEntities=梵蒂冈门户城市 > 梵蒂冈历史城区 > 梵蒂冈自然腹地 > 梵蒂冈地方生活区 > 梵蒂冈区域风景带 > 梵蒂冈文化停留区
- bestMonths=3-5月
- designStrategies=Geographic+Season+Theme+Transport
- distance calculation / routePassesPlannerRules: proven by materialize-route-pool.mjs, but per-route rejected alternatives are not persisted

↓

Step2
过滤：
- disabledCountries 包含 CN；plausibleCountries 要求国家组合在 regionGroups 中；routePassesPlannerRules 要求 concept validation、距离完整、maxSegment/span 不超限。

↓

Step3
候选国家：
- 可证明保存结果：VA
- 生成前完整候选国家池：Unknown（accepted route 未保存被扫描/被删除候选列表）。

↓

Step4
为什么保留这些国家：
- 因为这些 destinationEntities 的 countryCode 通过 disabledCountries、plausibleCountries、距离与 concept rules；具体竞争候选 Unknown。

↓

Step5
为什么删除其它国家：
- Unknown。当前 accepted route 没有保存 rejected alternatives；只能从代码知道可能原因包括 CN block、region 不合理、距离超限、pool 为空、dedupe 太近、cluster 饱和。

↓

Step6
为什么生成当前标题：
- route title：makeRoute 模板读取 titleCountry + days + styleLabelZh + first/last destination，生成当前标题。

↓

Step7
为什么生成当前主题：
- profile/theme + buildRouteConcept 生成 travelStyle=classic-first-trip；themes=经典首访。

↓

Step8
为什么生成当前简介：
- route summary：makeRoute 固定模板读取 styleLabelZh 和前 3 个目的地，模板化风险最高。

↓

Step9
为什么进入 Accepted：
- 保存状态：contentQualityStatus=accepted, repositoryStatus=mediaReady, sourceType=planner-designed
- 可证明原因：materialize-route-pool 在 makeRoute 后调用 validateRouteContent(record).accepted 才 addCandidate；accepted repository 已保存本条。

↓

Step10
为什么进入 Feed（如果进入）：
- 未进入或无法证明进入 Feed：没有通过当前报告可验证的 feedReady + onlineCoverAsset 国家匹配。

真正改变路线结果的输入：
- 国家组合：由 destinations 的 countryCode 集合直接决定为 VA；plausibleCountries/CN block 可过滤，但被删国家候选 Unknown。
- 城市/景点：由 knowledge-graph-pool 候选或 coverageFallbackPlaces 形成 destinationEntities=梵蒂冈门户城市 > 梵蒂冈历史城区 > 梵蒂冈自然腹地 > 梵蒂冈地方生活区 > 梵蒂冈区域风景带 > 梵蒂冈文化停留区。
- 天数：由 buildRouteConcept 得到 recommendedDays，再由 concreteDaysFor(hash(profile, destinations, serial)) 固化为 14。
- travelStyle：由 context/profile + buildRouteConcept 决定；保存为 classic-first-trip。
- route title：makeRoute 模板读取 titleCountry + days + styleLabelZh + first/last destination，生成当前标题。
- route summary：makeRoute 固定模板读取 styleLabelZh 和前 3 个目的地，模板化风险最高。

最后补上的标签/非决策字段：
- plannerReason：在路线骨架/concept 后写入；不证明它改变了国家、城市或天数。
- coverageContribution：由生成后的 country/destination 数量汇总；不是生成前输入。
- contentEvidence.provider/evidenceHash：主要是来源/缓存/溯源；一般不改变本条路线内容。
- designStrategies：来自 profile.strategies，更多是 profile 标签；在部分 concept validation 中被读取，但不能逐条证明改变了候选池。

删除输入后的影响判断：
- 删除 country/destinationEntities：会改变国家组合、标题、summary，或无法生成路线。★★★★★
- 删除 travelStyle/profile：会改变 concept、styleLabel、天数推导、标题主题。★★★★★
- 删除 bestMonths：会改变 bestMonths 展示；是否改变路线主体仅 seasonal/profile 可证明，普通路线无法证明。★★☆☆☆
- 删除 designStrategies：可能影响 buildRouteConcept 对 theme/season/transport 的 style 判定；但大量 profile 中是标签，逐条影响无法完全证明。★★☆☆☆
- 删除 plannerReason/coverageContribution：不会改变已生成路线内容。☆

### Route: 冰岛9天铁路旅程：雷克雅未克到黄金瀑布

- Route ID: `materialized-xnn4s2-59200`
- 抽样类别: Duration
- 可证明来源类型: Materialized Template
- 国家: IS
- 目的地: 雷克雅未克 > 盖锡尔 > 瓦特纳冰川 > 黄金圈 > 黄金瀑布
- travelStyle: rail-journey
- durationBand / days: 7-10d / 9
- Feed: 无法证明进入当前 Feed ready pool

Decision Trace:

Step1
读取：
- knowledge-graph-pool.json: destination/country candidates, as proven by provenance.source=knowledge-graph-pool or contentEvidence.materialized
- profile/travelStyle=rail-journey: proven by travelStyle/travelStyleConceptKey/contentEvidence.travelMode
- countryCodes=IS
- destinationEntities=雷克雅未克 > 盖锡尔 > 瓦特纳冰川 > 黄金圈 > 黄金瀑布
- bestMonths=4-10月
- designStrategies=Geographic+Transport+Theme
- distance calculation / routePassesPlannerRules: proven by materialize-route-pool.mjs, but per-route rejected alternatives are not persisted

↓

Step2
过滤：
- disabledCountries 包含 CN；plausibleCountries 要求国家组合在 regionGroups 中；routePassesPlannerRules 要求 concept validation、距离完整、maxSegment/span 不超限。

↓

Step3
候选国家：
- 可证明保存结果：IS
- 生成前完整候选国家池：Unknown（accepted route 未保存被扫描/被删除候选列表）。

↓

Step4
为什么保留这些国家：
- 因为这些 destinationEntities 的 countryCode 通过 disabledCountries、plausibleCountries、距离与 concept rules；具体竞争候选 Unknown。

↓

Step5
为什么删除其它国家：
- Unknown。当前 accepted route 没有保存 rejected alternatives；只能从代码知道可能原因包括 CN block、region 不合理、距离超限、pool 为空、dedupe 太近、cluster 饱和。

↓

Step6
为什么生成当前标题：
- route title：makeRoute 模板读取 titleCountry + days + styleLabelZh + first/last destination，生成当前标题。

↓

Step7
为什么生成当前主题：
- profile/theme + buildRouteConcept 生成 travelStyle=rail-journey；themes=铁路旅程。

↓

Step8
为什么生成当前简介：
- route summary：makeRoute 固定模板读取 styleLabelZh 和前 3 个目的地，模板化风险最高。

↓

Step9
为什么进入 Accepted：
- 保存状态：contentQualityStatus=accepted, repositoryStatus=mediaReady, sourceType=planner-designed
- 可证明原因：materialize-route-pool 在 makeRoute 后调用 validateRouteContent(record).accepted 才 addCandidate；accepted repository 已保存本条。

↓

Step10
为什么进入 Feed（如果进入）：
- 未进入或无法证明进入 Feed：没有通过当前报告可验证的 feedReady + onlineCoverAsset 国家匹配。

真正改变路线结果的输入：
- 国家组合：由 destinations 的 countryCode 集合直接决定为 IS；plausibleCountries/CN block 可过滤，但被删国家候选 Unknown。
- 城市/景点：由 knowledge-graph-pool 候选或 coverageFallbackPlaces 形成 destinationEntities=雷克雅未克 > 盖锡尔 > 瓦特纳冰川 > 黄金圈 > 黄金瀑布。
- 天数：由 buildRouteConcept 得到 recommendedDays，再由 concreteDaysFor(hash(profile, destinations, serial)) 固化为 9。
- travelStyle：由 context/profile + buildRouteConcept 决定；保存为 rail-journey。
- route title：makeRoute 模板读取 titleCountry + days + styleLabelZh + first/last destination，生成当前标题。
- route summary：makeRoute 固定模板读取 styleLabelZh 和前 3 个目的地，模板化风险最高。

最后补上的标签/非决策字段：
- plannerReason：在路线骨架/concept 后写入；不证明它改变了国家、城市或天数。
- coverageContribution：由生成后的 country/destination 数量汇总；不是生成前输入。
- contentEvidence.provider/evidenceHash：主要是来源/缓存/溯源；一般不改变本条路线内容。
- designStrategies：来自 profile.strategies，更多是 profile 标签；在部分 concept validation 中被读取，但不能逐条证明改变了候选池。

删除输入后的影响判断：
- 删除 country/destinationEntities：会改变国家组合、标题、summary，或无法生成路线。★★★★★
- 删除 travelStyle/profile：会改变 concept、styleLabel、天数推导、标题主题。★★★★★
- 删除 bestMonths：会改变 bestMonths 展示；是否改变路线主体仅 seasonal/profile 可证明，普通路线无法证明。★★☆☆☆
- 删除 designStrategies：可能影响 buildRouteConcept 对 theme/season/transport 的 style 判定；但大量 profile 中是标签，逐条影响无法完全证明。★★☆☆☆
- 删除 plannerReason/coverageContribution：不会改变已生成路线内容。☆


## Seasonal

### Route: 奥桑加特环线徒步：直面安第斯雪峰

- Route ID: `wikivoyage-174719`
- 抽样类别: Seasonal
- 可证明来源类型: Unknown
- 国家: PE
- 目的地: 库斯科 > 馬爾多納多港 > 马丘比丘小径
- travelStyle: Unknown
- durationBand / days: Unknown / 5
- Feed: 无法证明进入当前 Feed ready pool

Decision Trace:

Step1
读取：
- Unknown: route source does not preserve enough pre-generation context.

↓

Step2
过滤：
- Unknown

↓

Step3
候选国家：
- 可证明保存结果：PE
- 生成前完整候选国家池：Unknown（accepted route 未保存被扫描/被删除候选列表）。

↓

Step4
为什么保留这些国家：
- Unknown

↓

Step5
为什么删除其它国家：
- Unknown。当前 accepted route 没有保存 rejected alternatives；只能从代码知道可能原因包括 CN block、region 不合理、距离超限、pool 为空、dedupe 太近、cluster 饱和。

↓

Step6
为什么生成当前标题：
- Unknown

↓

Step7
为什么生成当前主题：
- buildRouteConcept/context.theme/travelStyle 生成主题；themes=经典旅行。

↓

Step8
为什么生成当前简介：
- Unknown

↓

Step9
为什么进入 Accepted：
- 保存状态：contentQualityStatus=accepted, repositoryStatus=accepted, sourceType=source-original
- 可证明原因：Unknown

↓

Step10
为什么进入 Feed（如果进入）：
- 未进入或无法证明进入 Feed：没有通过当前报告可验证的 feedReady + onlineCoverAsset 国家匹配。

真正改变路线结果的输入：
- Unknown: 无法证明哪些输入改变了路线结果。

最后补上的标签/非决策字段：
- plannerReason：在路线骨架/concept 后写入；不证明它改变了国家、城市或天数。
- coverageContribution：由生成后的 country/destination 数量汇总；不是生成前输入。
- contentEvidence.provider/evidenceHash：主要是来源/缓存/溯源；一般不改变本条路线内容。
- designStrategies：可能参与 concept/validator，但 saved field 本身是输出记录；删除保存字段通常不改变已生成路线。

删除输入后的影响判断：
- Unknown

### Route: 克罗地亚、斯洛文尼亚5天经典首访：克罗地亚自然腹地到斯洛文尼亚区域风景带

- Route ID: `materialized-1ap2g92-43899`
- 抽样类别: Seasonal
- 可证明来源类型: Materialized Template
- 国家: HR + SI
- 目的地: 克罗地亚自然腹地 > 克罗地亚地方生活区 > 斯洛文尼亚区域风景带
- travelStyle: classic-first-trip
- durationBand / days: 4-6d / 5
- Feed: 无法证明进入当前 Feed ready pool

Decision Trace:

Step1
读取：
- knowledge-graph-pool.json: destination/country candidates, as proven by provenance.source=knowledge-graph-pool or contentEvidence.materialized
- profile/travelStyle=classic-first-trip: proven by travelStyle/travelStyleConceptKey/contentEvidence.travelMode
- countryCodes=HR+SI
- destinationEntities=克罗地亚自然腹地 > 克罗地亚地方生活区 > 斯洛文尼亚区域风景带
- bestMonths=3-5月
- designStrategies=Geographic+Season+Theme+Transport
- distance calculation / routePassesPlannerRules: proven by materialize-route-pool.mjs, but per-route rejected alternatives are not persisted

↓

Step2
过滤：
- disabledCountries 包含 CN；plausibleCountries 要求国家组合在 regionGroups 中；routePassesPlannerRules 要求 concept validation、距离完整、maxSegment/span 不超限。

↓

Step3
候选国家：
- 可证明保存结果：HR + SI
- 生成前完整候选国家池：Unknown（accepted route 未保存被扫描/被删除候选列表）。

↓

Step4
为什么保留这些国家：
- 因为这些 destinationEntities 的 countryCode 通过 disabledCountries、plausibleCountries、距离与 concept rules；具体竞争候选 Unknown。

↓

Step5
为什么删除其它国家：
- Unknown。当前 accepted route 没有保存 rejected alternatives；只能从代码知道可能原因包括 CN block、region 不合理、距离超限、pool 为空、dedupe 太近、cluster 饱和。

↓

Step6
为什么生成当前标题：
- route title：makeRoute 模板读取 titleCountry + days + styleLabelZh + first/last destination，生成当前标题。

↓

Step7
为什么生成当前主题：
- profile/theme + buildRouteConcept 生成 travelStyle=classic-first-trip；themes=经典首访。

↓

Step8
为什么生成当前简介：
- route summary：makeRoute 固定模板读取 styleLabelZh 和前 3 个目的地，模板化风险最高。

↓

Step9
为什么进入 Accepted：
- 保存状态：contentQualityStatus=accepted, repositoryStatus=mediaReady, sourceType=planner-designed
- 可证明原因：materialize-route-pool 在 makeRoute 后调用 validateRouteContent(record).accepted 才 addCandidate；accepted repository 已保存本条。

↓

Step10
为什么进入 Feed（如果进入）：
- 未进入或无法证明进入 Feed：没有通过当前报告可验证的 feedReady + onlineCoverAsset 国家匹配。

真正改变路线结果的输入：
- 国家组合：由 destinations 的 countryCode 集合直接决定为 HR+SI；plausibleCountries/CN block 可过滤，但被删国家候选 Unknown。
- 城市/景点：由 knowledge-graph-pool 候选或 coverageFallbackPlaces 形成 destinationEntities=克罗地亚自然腹地 > 克罗地亚地方生活区 > 斯洛文尼亚区域风景带。
- 天数：由 buildRouteConcept 得到 recommendedDays，再由 concreteDaysFor(hash(profile, destinations, serial)) 固化为 5。
- travelStyle：由 context/profile + buildRouteConcept 决定；保存为 classic-first-trip。
- route title：makeRoute 模板读取 titleCountry + days + styleLabelZh + first/last destination，生成当前标题。
- route summary：makeRoute 固定模板读取 styleLabelZh 和前 3 个目的地，模板化风险最高。

最后补上的标签/非决策字段：
- plannerReason：在路线骨架/concept 后写入；不证明它改变了国家、城市或天数。
- coverageContribution：由生成后的 country/destination 数量汇总；不是生成前输入。
- contentEvidence.provider/evidenceHash：主要是来源/缓存/溯源；一般不改变本条路线内容。
- designStrategies：来自 profile.strategies，更多是 profile 标签；在部分 concept validation 中被读取，但不能逐条证明改变了候选池。

删除输入后的影响判断：
- 删除 country/destinationEntities：会改变国家组合、标题、summary，或无法生成路线。★★★★★
- 删除 travelStyle/profile：会改变 concept、styleLabel、天数推导、标题主题。★★★★★
- 删除 bestMonths：会改变 bestMonths 展示；是否改变路线主体仅 seasonal/profile 可证明，普通路线无法证明。★★☆☆☆
- 删除 designStrategies：可能影响 buildRouteConcept 对 theme/season/transport 的 style 判定；但大量 profile 中是标签，逐条影响无法完全证明。★★☆☆☆
- 删除 plannerReason/coverageContribution：不会改变已生成路线内容。☆

### Route: 英国、卢森堡9天经典首访：普利茅斯到卢森堡区域风景带

- Route ID: `materialized-4hvc8r-46554`
- 抽样类别: Seasonal
- 可证明来源类型: Materialized Template
- 国家: GB + LU
- 目的地: 普利茅斯 > 伍尔弗汉普顿 > 诺里奇 > 卢森堡门户城市 > 卢森堡区域风景带
- travelStyle: classic-first-trip
- durationBand / days: 7-10d / 9
- Feed: 可证明进入当前 Feed ready pool 的候选

Decision Trace:

Step1
读取：
- knowledge-graph-pool.json: destination/country candidates, as proven by provenance.source=knowledge-graph-pool or contentEvidence.materialized
- profile/travelStyle=classic-first-trip: proven by travelStyle/travelStyleConceptKey/contentEvidence.travelMode
- countryCodes=GB+LU
- destinationEntities=普利茅斯 > 伍尔弗汉普顿 > 诺里奇 > 卢森堡门户城市 > 卢森堡区域风景带
- bestMonths=3-5月
- designStrategies=Geographic+Season+Theme+Transport
- distance calculation / routePassesPlannerRules: proven by materialize-route-pool.mjs, but per-route rejected alternatives are not persisted

↓

Step2
过滤：
- disabledCountries 包含 CN；plausibleCountries 要求国家组合在 regionGroups 中；routePassesPlannerRules 要求 concept validation、距离完整、maxSegment/span 不超限。

↓

Step3
候选国家：
- 可证明保存结果：GB + LU
- 生成前完整候选国家池：Unknown（accepted route 未保存被扫描/被删除候选列表）。

↓

Step4
为什么保留这些国家：
- 因为这些 destinationEntities 的 countryCode 通过 disabledCountries、plausibleCountries、距离与 concept rules；具体竞争候选 Unknown。

↓

Step5
为什么删除其它国家：
- Unknown。当前 accepted route 没有保存 rejected alternatives；只能从代码知道可能原因包括 CN block、region 不合理、距离超限、pool 为空、dedupe 太近、cluster 饱和。

↓

Step6
为什么生成当前标题：
- route title：makeRoute 模板读取 titleCountry + days + styleLabelZh + first/last destination，生成当前标题。

↓

Step7
为什么生成当前主题：
- profile/theme + buildRouteConcept 生成 travelStyle=classic-first-trip；themes=经典首访。

↓

Step8
为什么生成当前简介：
- route summary：makeRoute 固定模板读取 styleLabelZh 和前 3 个目的地，模板化风险最高。

↓

Step9
为什么进入 Accepted：
- 保存状态：contentQualityStatus=accepted, repositoryStatus=mediaReady, sourceType=planner-designed
- 可证明原因：materialize-route-pool 在 makeRoute 后调用 validateRouteContent(record).accepted 才 addCandidate；accepted repository 已保存本条。

↓

Step10
为什么进入 Feed（如果进入）：
- 进入 Feed 的可证明原因：accepted repository 中存在 feedReady onlineCoverAsset，imageCountryCodes 与路线国家有交集；Feed 还会受当前 cursor/random/quality 排序影响。

真正改变路线结果的输入：
- 国家组合：由 destinations 的 countryCode 集合直接决定为 GB+LU；plausibleCountries/CN block 可过滤，但被删国家候选 Unknown。
- 城市/景点：由 knowledge-graph-pool 候选或 coverageFallbackPlaces 形成 destinationEntities=普利茅斯 > 伍尔弗汉普顿 > 诺里奇 > 卢森堡门户城市 > 卢森堡区域风景带。
- 天数：由 buildRouteConcept 得到 recommendedDays，再由 concreteDaysFor(hash(profile, destinations, serial)) 固化为 9。
- travelStyle：由 context/profile + buildRouteConcept 决定；保存为 classic-first-trip。
- route title：makeRoute 模板读取 titleCountry + days + styleLabelZh + first/last destination，生成当前标题。
- route summary：makeRoute 固定模板读取 styleLabelZh 和前 3 个目的地，模板化风险最高。

最后补上的标签/非决策字段：
- plannerReason：在路线骨架/concept 后写入；不证明它改变了国家、城市或天数。
- coverageContribution：由生成后的 country/destination 数量汇总；不是生成前输入。
- contentEvidence.provider/evidenceHash：主要是来源/缓存/溯源；一般不改变本条路线内容。
- designStrategies：来自 profile.strategies，更多是 profile 标签；在部分 concept validation 中被读取，但不能逐条证明改变了候选池。

删除输入后的影响判断：
- 删除 country/destinationEntities：会改变国家组合、标题、summary，或无法生成路线。★★★★★
- 删除 travelStyle/profile：会改变 concept、styleLabel、天数推导、标题主题。★★★★★
- 删除 bestMonths：会改变 bestMonths 展示；是否改变路线主体仅 seasonal/profile 可证明，普通路线无法证明。★★☆☆☆
- 删除 designStrategies：可能影响 buildRouteConcept 对 theme/season/transport 的 style 判定；但大量 profile 中是标签，逐条影响无法完全证明。★★☆☆☆
- 删除 plannerReason/coverageContribution：不会改变已生成路线内容。☆

### Route: 特立尼达和多巴哥5天经典首访：特立尼达和多巴哥门户城市到特立尼达和多巴哥自然腹地

- Route ID: `materialized-12euldd-47187`
- 抽样类别: Seasonal
- 可证明来源类型: Materialized Template
- 国家: TT
- 目的地: 特立尼达和多巴哥门户城市 > 特立尼达和多巴哥历史城区 > 特立尼达和多巴哥自然腹地
- travelStyle: classic-first-trip
- durationBand / days: 4-6d / 5
- Feed: 无法证明进入当前 Feed ready pool

Decision Trace:

Step1
读取：
- knowledge-graph-pool.json: destination/country candidates, as proven by provenance.source=knowledge-graph-pool or contentEvidence.materialized
- profile/travelStyle=classic-first-trip: proven by travelStyle/travelStyleConceptKey/contentEvidence.travelMode
- countryCodes=TT
- destinationEntities=特立尼达和多巴哥门户城市 > 特立尼达和多巴哥历史城区 > 特立尼达和多巴哥自然腹地
- bestMonths=3-5月
- designStrategies=Geographic+Season+Theme+Transport
- distance calculation / routePassesPlannerRules: proven by materialize-route-pool.mjs, but per-route rejected alternatives are not persisted

↓

Step2
过滤：
- disabledCountries 包含 CN；plausibleCountries 要求国家组合在 regionGroups 中；routePassesPlannerRules 要求 concept validation、距离完整、maxSegment/span 不超限。

↓

Step3
候选国家：
- 可证明保存结果：TT
- 生成前完整候选国家池：Unknown（accepted route 未保存被扫描/被删除候选列表）。

↓

Step4
为什么保留这些国家：
- 因为这些 destinationEntities 的 countryCode 通过 disabledCountries、plausibleCountries、距离与 concept rules；具体竞争候选 Unknown。

↓

Step5
为什么删除其它国家：
- Unknown。当前 accepted route 没有保存 rejected alternatives；只能从代码知道可能原因包括 CN block、region 不合理、距离超限、pool 为空、dedupe 太近、cluster 饱和。

↓

Step6
为什么生成当前标题：
- route title：makeRoute 模板读取 titleCountry + days + styleLabelZh + first/last destination，生成当前标题。

↓

Step7
为什么生成当前主题：
- profile/theme + buildRouteConcept 生成 travelStyle=classic-first-trip；themes=经典首访。

↓

Step8
为什么生成当前简介：
- route summary：makeRoute 固定模板读取 styleLabelZh 和前 3 个目的地，模板化风险最高。

↓

Step9
为什么进入 Accepted：
- 保存状态：contentQualityStatus=accepted, repositoryStatus=mediaReady, sourceType=planner-designed
- 可证明原因：materialize-route-pool 在 makeRoute 后调用 validateRouteContent(record).accepted 才 addCandidate；accepted repository 已保存本条。

↓

Step10
为什么进入 Feed（如果进入）：
- 未进入或无法证明进入 Feed：没有通过当前报告可验证的 feedReady + onlineCoverAsset 国家匹配。

真正改变路线结果的输入：
- 国家组合：由 destinations 的 countryCode 集合直接决定为 TT；plausibleCountries/CN block 可过滤，但被删国家候选 Unknown。
- 城市/景点：由 knowledge-graph-pool 候选或 coverageFallbackPlaces 形成 destinationEntities=特立尼达和多巴哥门户城市 > 特立尼达和多巴哥历史城区 > 特立尼达和多巴哥自然腹地。
- 天数：由 buildRouteConcept 得到 recommendedDays，再由 concreteDaysFor(hash(profile, destinations, serial)) 固化为 5。
- travelStyle：由 context/profile + buildRouteConcept 决定；保存为 classic-first-trip。
- route title：makeRoute 模板读取 titleCountry + days + styleLabelZh + first/last destination，生成当前标题。
- route summary：makeRoute 固定模板读取 styleLabelZh 和前 3 个目的地，模板化风险最高。

最后补上的标签/非决策字段：
- plannerReason：在路线骨架/concept 后写入；不证明它改变了国家、城市或天数。
- coverageContribution：由生成后的 country/destination 数量汇总；不是生成前输入。
- contentEvidence.provider/evidenceHash：主要是来源/缓存/溯源；一般不改变本条路线内容。
- designStrategies：来自 profile.strategies，更多是 profile 标签；在部分 concept validation 中被读取，但不能逐条证明改变了候选池。

删除输入后的影响判断：
- 删除 country/destinationEntities：会改变国家组合、标题、summary，或无法生成路线。★★★★★
- 删除 travelStyle/profile：会改变 concept、styleLabel、天数推导、标题主题。★★★★★
- 删除 bestMonths：会改变 bestMonths 展示；是否改变路线主体仅 seasonal/profile 可证明，普通路线无法证明。★★☆☆☆
- 删除 designStrategies：可能影响 buildRouteConcept 对 theme/season/transport 的 style 判定；但大量 profile 中是标签，逐条影响无法完全证明。★★☆☆☆
- 删除 plannerReason/coverageContribution：不会改变已生成路线内容。☆

### Route: 斯威士兰5天经典首访：斯威士兰自然腹地到斯威士兰区域风景带

- Route ID: `materialized-dib9c7-47579`
- 抽样类别: Seasonal
- 可证明来源类型: Materialized Template
- 国家: SZ
- 目的地: 斯威士兰自然腹地 > 斯威士兰地方生活区 > 斯威士兰区域风景带
- travelStyle: classic-first-trip
- durationBand / days: 4-6d / 5
- Feed: 无法证明进入当前 Feed ready pool

Decision Trace:

Step1
读取：
- knowledge-graph-pool.json: destination/country candidates, as proven by provenance.source=knowledge-graph-pool or contentEvidence.materialized
- profile/travelStyle=classic-first-trip: proven by travelStyle/travelStyleConceptKey/contentEvidence.travelMode
- countryCodes=SZ
- destinationEntities=斯威士兰自然腹地 > 斯威士兰地方生活区 > 斯威士兰区域风景带
- bestMonths=3-5月
- designStrategies=Geographic+Season+Theme+Transport
- distance calculation / routePassesPlannerRules: proven by materialize-route-pool.mjs, but per-route rejected alternatives are not persisted

↓

Step2
过滤：
- disabledCountries 包含 CN；plausibleCountries 要求国家组合在 regionGroups 中；routePassesPlannerRules 要求 concept validation、距离完整、maxSegment/span 不超限。

↓

Step3
候选国家：
- 可证明保存结果：SZ
- 生成前完整候选国家池：Unknown（accepted route 未保存被扫描/被删除候选列表）。

↓

Step4
为什么保留这些国家：
- 因为这些 destinationEntities 的 countryCode 通过 disabledCountries、plausibleCountries、距离与 concept rules；具体竞争候选 Unknown。

↓

Step5
为什么删除其它国家：
- Unknown。当前 accepted route 没有保存 rejected alternatives；只能从代码知道可能原因包括 CN block、region 不合理、距离超限、pool 为空、dedupe 太近、cluster 饱和。

↓

Step6
为什么生成当前标题：
- route title：makeRoute 模板读取 titleCountry + days + styleLabelZh + first/last destination，生成当前标题。

↓

Step7
为什么生成当前主题：
- profile/theme + buildRouteConcept 生成 travelStyle=classic-first-trip；themes=经典首访。

↓

Step8
为什么生成当前简介：
- route summary：makeRoute 固定模板读取 styleLabelZh 和前 3 个目的地，模板化风险最高。

↓

Step9
为什么进入 Accepted：
- 保存状态：contentQualityStatus=accepted, repositoryStatus=mediaReady, sourceType=planner-designed
- 可证明原因：materialize-route-pool 在 makeRoute 后调用 validateRouteContent(record).accepted 才 addCandidate；accepted repository 已保存本条。

↓

Step10
为什么进入 Feed（如果进入）：
- 未进入或无法证明进入 Feed：没有通过当前报告可验证的 feedReady + onlineCoverAsset 国家匹配。

真正改变路线结果的输入：
- 国家组合：由 destinations 的 countryCode 集合直接决定为 SZ；plausibleCountries/CN block 可过滤，但被删国家候选 Unknown。
- 城市/景点：由 knowledge-graph-pool 候选或 coverageFallbackPlaces 形成 destinationEntities=斯威士兰自然腹地 > 斯威士兰地方生活区 > 斯威士兰区域风景带。
- 天数：由 buildRouteConcept 得到 recommendedDays，再由 concreteDaysFor(hash(profile, destinations, serial)) 固化为 5。
- travelStyle：由 context/profile + buildRouteConcept 决定；保存为 classic-first-trip。
- route title：makeRoute 模板读取 titleCountry + days + styleLabelZh + first/last destination，生成当前标题。
- route summary：makeRoute 固定模板读取 styleLabelZh 和前 3 个目的地，模板化风险最高。

最后补上的标签/非决策字段：
- plannerReason：在路线骨架/concept 后写入；不证明它改变了国家、城市或天数。
- coverageContribution：由生成后的 country/destination 数量汇总；不是生成前输入。
- contentEvidence.provider/evidenceHash：主要是来源/缓存/溯源；一般不改变本条路线内容。
- designStrategies：来自 profile.strategies，更多是 profile 标签；在部分 concept validation 中被读取，但不能逐条证明改变了候选池。

删除输入后的影响判断：
- 删除 country/destinationEntities：会改变国家组合、标题、summary，或无法生成路线。★★★★★
- 删除 travelStyle/profile：会改变 concept、styleLabel、天数推导、标题主题。★★★★★
- 删除 bestMonths：会改变 bestMonths 展示；是否改变路线主体仅 seasonal/profile 可证明，普通路线无法证明。★★☆☆☆
- 删除 designStrategies：可能影响 buildRouteConcept 对 theme/season/transport 的 style 判定；但大量 profile 中是标签，逐条影响无法完全证明。★★☆☆☆
- 删除 plannerReason/coverageContribution：不会改变已生成路线内容。☆

### Route: 卡塔尔5天经典首访：卡塔尔区域风景带到卡塔尔门户城市

- Route ID: `materialized-8eu9vq-47985`
- 抽样类别: Seasonal
- 可证明来源类型: Materialized Template
- 国家: QA
- 目的地: 卡塔尔区域风景带 > 卡塔尔文化停留区 > 卡塔尔门户城市
- travelStyle: classic-first-trip
- durationBand / days: 4-6d / 5
- Feed: 无法证明进入当前 Feed ready pool

Decision Trace:

Step1
读取：
- knowledge-graph-pool.json: destination/country candidates, as proven by provenance.source=knowledge-graph-pool or contentEvidence.materialized
- profile/travelStyle=classic-first-trip: proven by travelStyle/travelStyleConceptKey/contentEvidence.travelMode
- countryCodes=QA
- destinationEntities=卡塔尔区域风景带 > 卡塔尔文化停留区 > 卡塔尔门户城市
- bestMonths=3-5月
- designStrategies=Geographic+Season+Theme+Transport
- distance calculation / routePassesPlannerRules: proven by materialize-route-pool.mjs, but per-route rejected alternatives are not persisted

↓

Step2
过滤：
- disabledCountries 包含 CN；plausibleCountries 要求国家组合在 regionGroups 中；routePassesPlannerRules 要求 concept validation、距离完整、maxSegment/span 不超限。

↓

Step3
候选国家：
- 可证明保存结果：QA
- 生成前完整候选国家池：Unknown（accepted route 未保存被扫描/被删除候选列表）。

↓

Step4
为什么保留这些国家：
- 因为这些 destinationEntities 的 countryCode 通过 disabledCountries、plausibleCountries、距离与 concept rules；具体竞争候选 Unknown。

↓

Step5
为什么删除其它国家：
- Unknown。当前 accepted route 没有保存 rejected alternatives；只能从代码知道可能原因包括 CN block、region 不合理、距离超限、pool 为空、dedupe 太近、cluster 饱和。

↓

Step6
为什么生成当前标题：
- route title：makeRoute 模板读取 titleCountry + days + styleLabelZh + first/last destination，生成当前标题。

↓

Step7
为什么生成当前主题：
- profile/theme + buildRouteConcept 生成 travelStyle=classic-first-trip；themes=经典首访。

↓

Step8
为什么生成当前简介：
- route summary：makeRoute 固定模板读取 styleLabelZh 和前 3 个目的地，模板化风险最高。

↓

Step9
为什么进入 Accepted：
- 保存状态：contentQualityStatus=accepted, repositoryStatus=mediaReady, sourceType=planner-designed
- 可证明原因：materialize-route-pool 在 makeRoute 后调用 validateRouteContent(record).accepted 才 addCandidate；accepted repository 已保存本条。

↓

Step10
为什么进入 Feed（如果进入）：
- 未进入或无法证明进入 Feed：没有通过当前报告可验证的 feedReady + onlineCoverAsset 国家匹配。

真正改变路线结果的输入：
- 国家组合：由 destinations 的 countryCode 集合直接决定为 QA；plausibleCountries/CN block 可过滤，但被删国家候选 Unknown。
- 城市/景点：由 knowledge-graph-pool 候选或 coverageFallbackPlaces 形成 destinationEntities=卡塔尔区域风景带 > 卡塔尔文化停留区 > 卡塔尔门户城市。
- 天数：由 buildRouteConcept 得到 recommendedDays，再由 concreteDaysFor(hash(profile, destinations, serial)) 固化为 5。
- travelStyle：由 context/profile + buildRouteConcept 决定；保存为 classic-first-trip。
- route title：makeRoute 模板读取 titleCountry + days + styleLabelZh + first/last destination，生成当前标题。
- route summary：makeRoute 固定模板读取 styleLabelZh 和前 3 个目的地，模板化风险最高。

最后补上的标签/非决策字段：
- plannerReason：在路线骨架/concept 后写入；不证明它改变了国家、城市或天数。
- coverageContribution：由生成后的 country/destination 数量汇总；不是生成前输入。
- contentEvidence.provider/evidenceHash：主要是来源/缓存/溯源；一般不改变本条路线内容。
- designStrategies：来自 profile.strategies，更多是 profile 标签；在部分 concept validation 中被读取，但不能逐条证明改变了候选池。

删除输入后的影响判断：
- 删除 country/destinationEntities：会改变国家组合、标题、summary，或无法生成路线。★★★★★
- 删除 travelStyle/profile：会改变 concept、styleLabel、天数推导、标题主题。★★★★★
- 删除 bestMonths：会改变 bestMonths 展示；是否改变路线主体仅 seasonal/profile 可证明，普通路线无法证明。★★☆☆☆
- 删除 designStrategies：可能影响 buildRouteConcept 对 theme/season/transport 的 style 判定；但大量 profile 中是标签，逐条影响无法完全证明。★★☆☆☆
- 删除 plannerReason/coverageContribution：不会改变已生成路线内容。☆

### Route: 罗马尼亚5天经典首访：罗马尼亚门户城市到罗马尼亚区域风景带

- Route ID: `materialized-1hf5xr9-48411`
- 抽样类别: Seasonal
- 可证明来源类型: Materialized Template
- 国家: RO
- 目的地: 罗马尼亚门户城市 > 罗马尼亚自然腹地 > 罗马尼亚区域风景带
- travelStyle: classic-first-trip
- durationBand / days: 4-6d / 5
- Feed: 无法证明进入当前 Feed ready pool

Decision Trace:

Step1
读取：
- knowledge-graph-pool.json: destination/country candidates, as proven by provenance.source=knowledge-graph-pool or contentEvidence.materialized
- profile/travelStyle=classic-first-trip: proven by travelStyle/travelStyleConceptKey/contentEvidence.travelMode
- countryCodes=RO
- destinationEntities=罗马尼亚门户城市 > 罗马尼亚自然腹地 > 罗马尼亚区域风景带
- bestMonths=3-5月
- designStrategies=Geographic+Season+Theme+Transport
- distance calculation / routePassesPlannerRules: proven by materialize-route-pool.mjs, but per-route rejected alternatives are not persisted

↓

Step2
过滤：
- disabledCountries 包含 CN；plausibleCountries 要求国家组合在 regionGroups 中；routePassesPlannerRules 要求 concept validation、距离完整、maxSegment/span 不超限。

↓

Step3
候选国家：
- 可证明保存结果：RO
- 生成前完整候选国家池：Unknown（accepted route 未保存被扫描/被删除候选列表）。

↓

Step4
为什么保留这些国家：
- 因为这些 destinationEntities 的 countryCode 通过 disabledCountries、plausibleCountries、距离与 concept rules；具体竞争候选 Unknown。

↓

Step5
为什么删除其它国家：
- Unknown。当前 accepted route 没有保存 rejected alternatives；只能从代码知道可能原因包括 CN block、region 不合理、距离超限、pool 为空、dedupe 太近、cluster 饱和。

↓

Step6
为什么生成当前标题：
- route title：makeRoute 模板读取 titleCountry + days + styleLabelZh + first/last destination，生成当前标题。

↓

Step7
为什么生成当前主题：
- profile/theme + buildRouteConcept 生成 travelStyle=classic-first-trip；themes=经典首访。

↓

Step8
为什么生成当前简介：
- route summary：makeRoute 固定模板读取 styleLabelZh 和前 3 个目的地，模板化风险最高。

↓

Step9
为什么进入 Accepted：
- 保存状态：contentQualityStatus=accepted, repositoryStatus=mediaReady, sourceType=planner-designed
- 可证明原因：materialize-route-pool 在 makeRoute 后调用 validateRouteContent(record).accepted 才 addCandidate；accepted repository 已保存本条。

↓

Step10
为什么进入 Feed（如果进入）：
- 未进入或无法证明进入 Feed：没有通过当前报告可验证的 feedReady + onlineCoverAsset 国家匹配。

真正改变路线结果的输入：
- 国家组合：由 destinations 的 countryCode 集合直接决定为 RO；plausibleCountries/CN block 可过滤，但被删国家候选 Unknown。
- 城市/景点：由 knowledge-graph-pool 候选或 coverageFallbackPlaces 形成 destinationEntities=罗马尼亚门户城市 > 罗马尼亚自然腹地 > 罗马尼亚区域风景带。
- 天数：由 buildRouteConcept 得到 recommendedDays，再由 concreteDaysFor(hash(profile, destinations, serial)) 固化为 5。
- travelStyle：由 context/profile + buildRouteConcept 决定；保存为 classic-first-trip。
- route title：makeRoute 模板读取 titleCountry + days + styleLabelZh + first/last destination，生成当前标题。
- route summary：makeRoute 固定模板读取 styleLabelZh 和前 3 个目的地，模板化风险最高。

最后补上的标签/非决策字段：
- plannerReason：在路线骨架/concept 后写入；不证明它改变了国家、城市或天数。
- coverageContribution：由生成后的 country/destination 数量汇总；不是生成前输入。
- contentEvidence.provider/evidenceHash：主要是来源/缓存/溯源；一般不改变本条路线内容。
- designStrategies：来自 profile.strategies，更多是 profile 标签；在部分 concept validation 中被读取，但不能逐条证明改变了候选池。

删除输入后的影响判断：
- 删除 country/destinationEntities：会改变国家组合、标题、summary，或无法生成路线。★★★★★
- 删除 travelStyle/profile：会改变 concept、styleLabel、天数推导、标题主题。★★★★★
- 删除 bestMonths：会改变 bestMonths 展示；是否改变路线主体仅 seasonal/profile 可证明，普通路线无法证明。★★☆☆☆
- 删除 designStrategies：可能影响 buildRouteConcept 对 theme/season/transport 的 style 判定；但大量 profile 中是标签，逐条影响无法完全证明。★★☆☆☆
- 删除 plannerReason/coverageContribution：不会改变已生成路线内容。☆

### Route: 巴勒斯坦7天经典首访：巴勒斯坦门户城市到巴勒斯坦地方生活区

- Route ID: `materialized-7f130n-50910`
- 抽样类别: Seasonal
- 可证明来源类型: Materialized Template
- 国家: PS
- 目的地: 巴勒斯坦门户城市 > 巴勒斯坦历史城区 > 巴勒斯坦自然腹地 > 巴勒斯坦地方生活区
- travelStyle: classic-first-trip
- durationBand / days: 7-10d / 7
- Feed: 无法证明进入当前 Feed ready pool

Decision Trace:

Step1
读取：
- knowledge-graph-pool.json: destination/country candidates, as proven by provenance.source=knowledge-graph-pool or contentEvidence.materialized
- profile/travelStyle=classic-first-trip: proven by travelStyle/travelStyleConceptKey/contentEvidence.travelMode
- countryCodes=PS
- destinationEntities=巴勒斯坦门户城市 > 巴勒斯坦历史城区 > 巴勒斯坦自然腹地 > 巴勒斯坦地方生活区
- bestMonths=3-5月
- designStrategies=Geographic+Season+Theme+Transport
- distance calculation / routePassesPlannerRules: proven by materialize-route-pool.mjs, but per-route rejected alternatives are not persisted

↓

Step2
过滤：
- disabledCountries 包含 CN；plausibleCountries 要求国家组合在 regionGroups 中；routePassesPlannerRules 要求 concept validation、距离完整、maxSegment/span 不超限。

↓

Step3
候选国家：
- 可证明保存结果：PS
- 生成前完整候选国家池：Unknown（accepted route 未保存被扫描/被删除候选列表）。

↓

Step4
为什么保留这些国家：
- 因为这些 destinationEntities 的 countryCode 通过 disabledCountries、plausibleCountries、距离与 concept rules；具体竞争候选 Unknown。

↓

Step5
为什么删除其它国家：
- Unknown。当前 accepted route 没有保存 rejected alternatives；只能从代码知道可能原因包括 CN block、region 不合理、距离超限、pool 为空、dedupe 太近、cluster 饱和。

↓

Step6
为什么生成当前标题：
- route title：makeRoute 模板读取 titleCountry + days + styleLabelZh + first/last destination，生成当前标题。

↓

Step7
为什么生成当前主题：
- profile/theme + buildRouteConcept 生成 travelStyle=classic-first-trip；themes=经典首访。

↓

Step8
为什么生成当前简介：
- route summary：makeRoute 固定模板读取 styleLabelZh 和前 3 个目的地，模板化风险最高。

↓

Step9
为什么进入 Accepted：
- 保存状态：contentQualityStatus=accepted, repositoryStatus=mediaReady, sourceType=planner-designed
- 可证明原因：materialize-route-pool 在 makeRoute 后调用 validateRouteContent(record).accepted 才 addCandidate；accepted repository 已保存本条。

↓

Step10
为什么进入 Feed（如果进入）：
- 未进入或无法证明进入 Feed：没有通过当前报告可验证的 feedReady + onlineCoverAsset 国家匹配。

真正改变路线结果的输入：
- 国家组合：由 destinations 的 countryCode 集合直接决定为 PS；plausibleCountries/CN block 可过滤，但被删国家候选 Unknown。
- 城市/景点：由 knowledge-graph-pool 候选或 coverageFallbackPlaces 形成 destinationEntities=巴勒斯坦门户城市 > 巴勒斯坦历史城区 > 巴勒斯坦自然腹地 > 巴勒斯坦地方生活区。
- 天数：由 buildRouteConcept 得到 recommendedDays，再由 concreteDaysFor(hash(profile, destinations, serial)) 固化为 7。
- travelStyle：由 context/profile + buildRouteConcept 决定；保存为 classic-first-trip。
- route title：makeRoute 模板读取 titleCountry + days + styleLabelZh + first/last destination，生成当前标题。
- route summary：makeRoute 固定模板读取 styleLabelZh 和前 3 个目的地，模板化风险最高。

最后补上的标签/非决策字段：
- plannerReason：在路线骨架/concept 后写入；不证明它改变了国家、城市或天数。
- coverageContribution：由生成后的 country/destination 数量汇总；不是生成前输入。
- contentEvidence.provider/evidenceHash：主要是来源/缓存/溯源；一般不改变本条路线内容。
- designStrategies：来自 profile.strategies，更多是 profile 标签；在部分 concept validation 中被读取，但不能逐条证明改变了候选池。

删除输入后的影响判断：
- 删除 country/destinationEntities：会改变国家组合、标题、summary，或无法生成路线。★★★★★
- 删除 travelStyle/profile：会改变 concept、styleLabel、天数推导、标题主题。★★★★★
- 删除 bestMonths：会改变 bestMonths 展示；是否改变路线主体仅 seasonal/profile 可证明，普通路线无法证明。★★☆☆☆
- 删除 designStrategies：可能影响 buildRouteConcept 对 theme/season/transport 的 style 判定；但大量 profile 中是标签，逐条影响无法完全证明。★★☆☆☆
- 删除 plannerReason/coverageContribution：不会改变已生成路线内容。☆

### Route: 尼加拉瓜8天经典首访：尼加拉瓜自然腹地到尼加拉瓜文化停留区

- Route ID: `materialized-olm2nu-52107`
- 抽样类别: Seasonal
- 可证明来源类型: Materialized Template
- 国家: NI
- 目的地: 尼加拉瓜自然腹地 > 尼加拉瓜地方生活区 > 尼加拉瓜区域风景带 > 尼加拉瓜文化停留区
- travelStyle: classic-first-trip
- durationBand / days: 7-10d / 8
- Feed: 无法证明进入当前 Feed ready pool

Decision Trace:

Step1
读取：
- knowledge-graph-pool.json: destination/country candidates, as proven by provenance.source=knowledge-graph-pool or contentEvidence.materialized
- profile/travelStyle=classic-first-trip: proven by travelStyle/travelStyleConceptKey/contentEvidence.travelMode
- countryCodes=NI
- destinationEntities=尼加拉瓜自然腹地 > 尼加拉瓜地方生活区 > 尼加拉瓜区域风景带 > 尼加拉瓜文化停留区
- bestMonths=3-5月
- designStrategies=Geographic+Season+Theme+Transport
- distance calculation / routePassesPlannerRules: proven by materialize-route-pool.mjs, but per-route rejected alternatives are not persisted

↓

Step2
过滤：
- disabledCountries 包含 CN；plausibleCountries 要求国家组合在 regionGroups 中；routePassesPlannerRules 要求 concept validation、距离完整、maxSegment/span 不超限。

↓

Step3
候选国家：
- 可证明保存结果：NI
- 生成前完整候选国家池：Unknown（accepted route 未保存被扫描/被删除候选列表）。

↓

Step4
为什么保留这些国家：
- 因为这些 destinationEntities 的 countryCode 通过 disabledCountries、plausibleCountries、距离与 concept rules；具体竞争候选 Unknown。

↓

Step5
为什么删除其它国家：
- Unknown。当前 accepted route 没有保存 rejected alternatives；只能从代码知道可能原因包括 CN block、region 不合理、距离超限、pool 为空、dedupe 太近、cluster 饱和。

↓

Step6
为什么生成当前标题：
- route title：makeRoute 模板读取 titleCountry + days + styleLabelZh + first/last destination，生成当前标题。

↓

Step7
为什么生成当前主题：
- profile/theme + buildRouteConcept 生成 travelStyle=classic-first-trip；themes=经典首访。

↓

Step8
为什么生成当前简介：
- route summary：makeRoute 固定模板读取 styleLabelZh 和前 3 个目的地，模板化风险最高。

↓

Step9
为什么进入 Accepted：
- 保存状态：contentQualityStatus=accepted, repositoryStatus=mediaReady, sourceType=planner-designed
- 可证明原因：materialize-route-pool 在 makeRoute 后调用 validateRouteContent(record).accepted 才 addCandidate；accepted repository 已保存本条。

↓

Step10
为什么进入 Feed（如果进入）：
- 未进入或无法证明进入 Feed：没有通过当前报告可验证的 feedReady + onlineCoverAsset 国家匹配。

真正改变路线结果的输入：
- 国家组合：由 destinations 的 countryCode 集合直接决定为 NI；plausibleCountries/CN block 可过滤，但被删国家候选 Unknown。
- 城市/景点：由 knowledge-graph-pool 候选或 coverageFallbackPlaces 形成 destinationEntities=尼加拉瓜自然腹地 > 尼加拉瓜地方生活区 > 尼加拉瓜区域风景带 > 尼加拉瓜文化停留区。
- 天数：由 buildRouteConcept 得到 recommendedDays，再由 concreteDaysFor(hash(profile, destinations, serial)) 固化为 8。
- travelStyle：由 context/profile + buildRouteConcept 决定；保存为 classic-first-trip。
- route title：makeRoute 模板读取 titleCountry + days + styleLabelZh + first/last destination，生成当前标题。
- route summary：makeRoute 固定模板读取 styleLabelZh 和前 3 个目的地，模板化风险最高。

最后补上的标签/非决策字段：
- plannerReason：在路线骨架/concept 后写入；不证明它改变了国家、城市或天数。
- coverageContribution：由生成后的 country/destination 数量汇总；不是生成前输入。
- contentEvidence.provider/evidenceHash：主要是来源/缓存/溯源；一般不改变本条路线内容。
- designStrategies：来自 profile.strategies，更多是 profile 标签；在部分 concept validation 中被读取，但不能逐条证明改变了候选池。

删除输入后的影响判断：
- 删除 country/destinationEntities：会改变国家组合、标题、summary，或无法生成路线。★★★★★
- 删除 travelStyle/profile：会改变 concept、styleLabel、天数推导、标题主题。★★★★★
- 删除 bestMonths：会改变 bestMonths 展示；是否改变路线主体仅 seasonal/profile 可证明，普通路线无法证明。★★☆☆☆
- 删除 designStrategies：可能影响 buildRouteConcept 对 theme/season/transport 的 style 判定；但大量 profile 中是标签，逐条影响无法完全证明。★★☆☆☆
- 删除 plannerReason/coverageContribution：不会改变已生成路线内容。☆

### Route: 马达加斯加8天经典首访：马达加斯加区域风景带到马达加斯加历史城区

- Route ID: `materialized-1iy2qq-52555`
- 抽样类别: Seasonal
- 可证明来源类型: Materialized Template
- 国家: MG
- 目的地: 马达加斯加区域风景带 > 马达加斯加文化停留区 > 马达加斯加门户城市 > 马达加斯加历史城区
- travelStyle: classic-first-trip
- durationBand / days: 7-10d / 8
- Feed: 无法证明进入当前 Feed ready pool

Decision Trace:

Step1
读取：
- knowledge-graph-pool.json: destination/country candidates, as proven by provenance.source=knowledge-graph-pool or contentEvidence.materialized
- profile/travelStyle=classic-first-trip: proven by travelStyle/travelStyleConceptKey/contentEvidence.travelMode
- countryCodes=MG
- destinationEntities=马达加斯加区域风景带 > 马达加斯加文化停留区 > 马达加斯加门户城市 > 马达加斯加历史城区
- bestMonths=3-5月
- designStrategies=Geographic+Season+Theme+Transport
- distance calculation / routePassesPlannerRules: proven by materialize-route-pool.mjs, but per-route rejected alternatives are not persisted

↓

Step2
过滤：
- disabledCountries 包含 CN；plausibleCountries 要求国家组合在 regionGroups 中；routePassesPlannerRules 要求 concept validation、距离完整、maxSegment/span 不超限。

↓

Step3
候选国家：
- 可证明保存结果：MG
- 生成前完整候选国家池：Unknown（accepted route 未保存被扫描/被删除候选列表）。

↓

Step4
为什么保留这些国家：
- 因为这些 destinationEntities 的 countryCode 通过 disabledCountries、plausibleCountries、距离与 concept rules；具体竞争候选 Unknown。

↓

Step5
为什么删除其它国家：
- Unknown。当前 accepted route 没有保存 rejected alternatives；只能从代码知道可能原因包括 CN block、region 不合理、距离超限、pool 为空、dedupe 太近、cluster 饱和。

↓

Step6
为什么生成当前标题：
- route title：makeRoute 模板读取 titleCountry + days + styleLabelZh + first/last destination，生成当前标题。

↓

Step7
为什么生成当前主题：
- profile/theme + buildRouteConcept 生成 travelStyle=classic-first-trip；themes=经典首访。

↓

Step8
为什么生成当前简介：
- route summary：makeRoute 固定模板读取 styleLabelZh 和前 3 个目的地，模板化风险最高。

↓

Step9
为什么进入 Accepted：
- 保存状态：contentQualityStatus=accepted, repositoryStatus=mediaReady, sourceType=planner-designed
- 可证明原因：materialize-route-pool 在 makeRoute 后调用 validateRouteContent(record).accepted 才 addCandidate；accepted repository 已保存本条。

↓

Step10
为什么进入 Feed（如果进入）：
- 未进入或无法证明进入 Feed：没有通过当前报告可验证的 feedReady + onlineCoverAsset 国家匹配。

真正改变路线结果的输入：
- 国家组合：由 destinations 的 countryCode 集合直接决定为 MG；plausibleCountries/CN block 可过滤，但被删国家候选 Unknown。
- 城市/景点：由 knowledge-graph-pool 候选或 coverageFallbackPlaces 形成 destinationEntities=马达加斯加区域风景带 > 马达加斯加文化停留区 > 马达加斯加门户城市 > 马达加斯加历史城区。
- 天数：由 buildRouteConcept 得到 recommendedDays，再由 concreteDaysFor(hash(profile, destinations, serial)) 固化为 8。
- travelStyle：由 context/profile + buildRouteConcept 决定；保存为 classic-first-trip。
- route title：makeRoute 模板读取 titleCountry + days + styleLabelZh + first/last destination，生成当前标题。
- route summary：makeRoute 固定模板读取 styleLabelZh 和前 3 个目的地，模板化风险最高。

最后补上的标签/非决策字段：
- plannerReason：在路线骨架/concept 后写入；不证明它改变了国家、城市或天数。
- coverageContribution：由生成后的 country/destination 数量汇总；不是生成前输入。
- contentEvidence.provider/evidenceHash：主要是来源/缓存/溯源；一般不改变本条路线内容。
- designStrategies：来自 profile.strategies，更多是 profile 标签；在部分 concept validation 中被读取，但不能逐条证明改变了候选池。

删除输入后的影响判断：
- 删除 country/destinationEntities：会改变国家组合、标题、summary，或无法生成路线。★★★★★
- 删除 travelStyle/profile：会改变 concept、styleLabel、天数推导、标题主题。★★★★★
- 删除 bestMonths：会改变 bestMonths 展示；是否改变路线主体仅 seasonal/profile 可证明，普通路线无法证明。★★☆☆☆
- 删除 designStrategies：可能影响 buildRouteConcept 对 theme/season/transport 的 style 判定；但大量 profile 中是标签，逐条影响无法完全证明。★★☆☆☆
- 删除 plannerReason/coverageContribution：不会改变已生成路线内容。☆

### Route: 布基纳法索8天经典首访：布基纳法索门户城市到布基纳法索区域风景带

- Route ID: `materialized-wm3dp6-52988`
- 抽样类别: Seasonal
- 可证明来源类型: Materialized Template
- 国家: BF
- 目的地: 布基纳法索门户城市 > 布基纳法索历史城区 > 布基纳法索自然腹地 > 布基纳法索地方生活区 > 布基纳法索区域风景带
- travelStyle: classic-first-trip
- durationBand / days: 7-10d / 8
- Feed: 无法证明进入当前 Feed ready pool

Decision Trace:

Step1
读取：
- knowledge-graph-pool.json: destination/country candidates, as proven by provenance.source=knowledge-graph-pool or contentEvidence.materialized
- profile/travelStyle=classic-first-trip: proven by travelStyle/travelStyleConceptKey/contentEvidence.travelMode
- countryCodes=BF
- destinationEntities=布基纳法索门户城市 > 布基纳法索历史城区 > 布基纳法索自然腹地 > 布基纳法索地方生活区 > 布基纳法索区域风景带
- bestMonths=3-5月
- designStrategies=Geographic+Season+Theme+Transport
- distance calculation / routePassesPlannerRules: proven by materialize-route-pool.mjs, but per-route rejected alternatives are not persisted

↓

Step2
过滤：
- disabledCountries 包含 CN；plausibleCountries 要求国家组合在 regionGroups 中；routePassesPlannerRules 要求 concept validation、距离完整、maxSegment/span 不超限。

↓

Step3
候选国家：
- 可证明保存结果：BF
- 生成前完整候选国家池：Unknown（accepted route 未保存被扫描/被删除候选列表）。

↓

Step4
为什么保留这些国家：
- 因为这些 destinationEntities 的 countryCode 通过 disabledCountries、plausibleCountries、距离与 concept rules；具体竞争候选 Unknown。

↓

Step5
为什么删除其它国家：
- Unknown。当前 accepted route 没有保存 rejected alternatives；只能从代码知道可能原因包括 CN block、region 不合理、距离超限、pool 为空、dedupe 太近、cluster 饱和。

↓

Step6
为什么生成当前标题：
- route title：makeRoute 模板读取 titleCountry + days + styleLabelZh + first/last destination，生成当前标题。

↓

Step7
为什么生成当前主题：
- profile/theme + buildRouteConcept 生成 travelStyle=classic-first-trip；themes=经典首访。

↓

Step8
为什么生成当前简介：
- route summary：makeRoute 固定模板读取 styleLabelZh 和前 3 个目的地，模板化风险最高。

↓

Step9
为什么进入 Accepted：
- 保存状态：contentQualityStatus=accepted, repositoryStatus=mediaReady, sourceType=planner-designed
- 可证明原因：materialize-route-pool 在 makeRoute 后调用 validateRouteContent(record).accepted 才 addCandidate；accepted repository 已保存本条。

↓

Step10
为什么进入 Feed（如果进入）：
- 未进入或无法证明进入 Feed：没有通过当前报告可验证的 feedReady + onlineCoverAsset 国家匹配。

真正改变路线结果的输入：
- 国家组合：由 destinations 的 countryCode 集合直接决定为 BF；plausibleCountries/CN block 可过滤，但被删国家候选 Unknown。
- 城市/景点：由 knowledge-graph-pool 候选或 coverageFallbackPlaces 形成 destinationEntities=布基纳法索门户城市 > 布基纳法索历史城区 > 布基纳法索自然腹地 > 布基纳法索地方生活区 > 布基纳法索区域风景带。
- 天数：由 buildRouteConcept 得到 recommendedDays，再由 concreteDaysFor(hash(profile, destinations, serial)) 固化为 8。
- travelStyle：由 context/profile + buildRouteConcept 决定；保存为 classic-first-trip。
- route title：makeRoute 模板读取 titleCountry + days + styleLabelZh + first/last destination，生成当前标题。
- route summary：makeRoute 固定模板读取 styleLabelZh 和前 3 个目的地，模板化风险最高。

最后补上的标签/非决策字段：
- plannerReason：在路线骨架/concept 后写入；不证明它改变了国家、城市或天数。
- coverageContribution：由生成后的 country/destination 数量汇总；不是生成前输入。
- contentEvidence.provider/evidenceHash：主要是来源/缓存/溯源；一般不改变本条路线内容。
- designStrategies：来自 profile.strategies，更多是 profile 标签；在部分 concept validation 中被读取，但不能逐条证明改变了候选池。

删除输入后的影响判断：
- 删除 country/destinationEntities：会改变国家组合、标题、summary，或无法生成路线。★★★★★
- 删除 travelStyle/profile：会改变 concept、styleLabel、天数推导、标题主题。★★★★★
- 删除 bestMonths：会改变 bestMonths 展示；是否改变路线主体仅 seasonal/profile 可证明，普通路线无法证明。★★☆☆☆
- 删除 designStrategies：可能影响 buildRouteConcept 对 theme/season/transport 的 style 判定；但大量 profile 中是标签，逐条影响无法完全证明。★★☆☆☆
- 删除 plannerReason/coverageContribution：不会改变已生成路线内容。☆

### Route: 印度9天经典首访：印度门户城市到印度区域风景带

- Route ID: `materialized-h2shh4-53373`
- 抽样类别: Seasonal
- 可证明来源类型: Materialized Template
- 国家: IN
- 目的地: 印度门户城市 > 印度历史城区 > 印度自然腹地 > 印度地方生活区 > 印度区域风景带
- travelStyle: classic-first-trip
- durationBand / days: 7-10d / 9
- Feed: 无法证明进入当前 Feed ready pool

Decision Trace:

Step1
读取：
- knowledge-graph-pool.json: destination/country candidates, as proven by provenance.source=knowledge-graph-pool or contentEvidence.materialized
- profile/travelStyle=classic-first-trip: proven by travelStyle/travelStyleConceptKey/contentEvidence.travelMode
- countryCodes=IN
- destinationEntities=印度门户城市 > 印度历史城区 > 印度自然腹地 > 印度地方生活区 > 印度区域风景带
- bestMonths=3-5月
- designStrategies=Geographic+Season+Theme+Transport
- distance calculation / routePassesPlannerRules: proven by materialize-route-pool.mjs, but per-route rejected alternatives are not persisted

↓

Step2
过滤：
- disabledCountries 包含 CN；plausibleCountries 要求国家组合在 regionGroups 中；routePassesPlannerRules 要求 concept validation、距离完整、maxSegment/span 不超限。

↓

Step3
候选国家：
- 可证明保存结果：IN
- 生成前完整候选国家池：Unknown（accepted route 未保存被扫描/被删除候选列表）。

↓

Step4
为什么保留这些国家：
- 因为这些 destinationEntities 的 countryCode 通过 disabledCountries、plausibleCountries、距离与 concept rules；具体竞争候选 Unknown。

↓

Step5
为什么删除其它国家：
- Unknown。当前 accepted route 没有保存 rejected alternatives；只能从代码知道可能原因包括 CN block、region 不合理、距离超限、pool 为空、dedupe 太近、cluster 饱和。

↓

Step6
为什么生成当前标题：
- route title：makeRoute 模板读取 titleCountry + days + styleLabelZh + first/last destination，生成当前标题。

↓

Step7
为什么生成当前主题：
- profile/theme + buildRouteConcept 生成 travelStyle=classic-first-trip；themes=经典首访。

↓

Step8
为什么生成当前简介：
- route summary：makeRoute 固定模板读取 styleLabelZh 和前 3 个目的地，模板化风险最高。

↓

Step9
为什么进入 Accepted：
- 保存状态：contentQualityStatus=accepted, repositoryStatus=mediaReady, sourceType=planner-designed
- 可证明原因：materialize-route-pool 在 makeRoute 后调用 validateRouteContent(record).accepted 才 addCandidate；accepted repository 已保存本条。

↓

Step10
为什么进入 Feed（如果进入）：
- 未进入或无法证明进入 Feed：没有通过当前报告可验证的 feedReady + onlineCoverAsset 国家匹配。

真正改变路线结果的输入：
- 国家组合：由 destinations 的 countryCode 集合直接决定为 IN；plausibleCountries/CN block 可过滤，但被删国家候选 Unknown。
- 城市/景点：由 knowledge-graph-pool 候选或 coverageFallbackPlaces 形成 destinationEntities=印度门户城市 > 印度历史城区 > 印度自然腹地 > 印度地方生活区 > 印度区域风景带。
- 天数：由 buildRouteConcept 得到 recommendedDays，再由 concreteDaysFor(hash(profile, destinations, serial)) 固化为 9。
- travelStyle：由 context/profile + buildRouteConcept 决定；保存为 classic-first-trip。
- route title：makeRoute 模板读取 titleCountry + days + styleLabelZh + first/last destination，生成当前标题。
- route summary：makeRoute 固定模板读取 styleLabelZh 和前 3 个目的地，模板化风险最高。

最后补上的标签/非决策字段：
- plannerReason：在路线骨架/concept 后写入；不证明它改变了国家、城市或天数。
- coverageContribution：由生成后的 country/destination 数量汇总；不是生成前输入。
- contentEvidence.provider/evidenceHash：主要是来源/缓存/溯源；一般不改变本条路线内容。
- designStrategies：来自 profile.strategies，更多是 profile 标签；在部分 concept validation 中被读取，但不能逐条证明改变了候选池。

删除输入后的影响判断：
- 删除 country/destinationEntities：会改变国家组合、标题、summary，或无法生成路线。★★★★★
- 删除 travelStyle/profile：会改变 concept、styleLabel、天数推导、标题主题。★★★★★
- 删除 bestMonths：会改变 bestMonths 展示；是否改变路线主体仅 seasonal/profile 可证明，普通路线无法证明。★★☆☆☆
- 删除 designStrategies：可能影响 buildRouteConcept 对 theme/season/transport 的 style 判定；但大量 profile 中是标签，逐条影响无法完全证明。★★☆☆☆
- 删除 plannerReason/coverageContribution：不会改变已生成路线内容。☆

### Route: 秘鲁10天经典首访：秘鲁门户城市到秘鲁区域风景带

- Route ID: `materialized-o17d18-53758`
- 抽样类别: Seasonal
- 可证明来源类型: Materialized Template
- 国家: PE
- 目的地: 秘鲁门户城市 > 秘鲁历史城区 > 秘鲁自然腹地 > 秘鲁地方生活区 > 秘鲁区域风景带
- travelStyle: classic-first-trip
- durationBand / days: 7-10d / 10
- Feed: 无法证明进入当前 Feed ready pool

Decision Trace:

Step1
读取：
- knowledge-graph-pool.json: destination/country candidates, as proven by provenance.source=knowledge-graph-pool or contentEvidence.materialized
- profile/travelStyle=classic-first-trip: proven by travelStyle/travelStyleConceptKey/contentEvidence.travelMode
- countryCodes=PE
- destinationEntities=秘鲁门户城市 > 秘鲁历史城区 > 秘鲁自然腹地 > 秘鲁地方生活区 > 秘鲁区域风景带
- bestMonths=3-5月
- designStrategies=Geographic+Season+Theme+Transport
- distance calculation / routePassesPlannerRules: proven by materialize-route-pool.mjs, but per-route rejected alternatives are not persisted

↓

Step2
过滤：
- disabledCountries 包含 CN；plausibleCountries 要求国家组合在 regionGroups 中；routePassesPlannerRules 要求 concept validation、距离完整、maxSegment/span 不超限。

↓

Step3
候选国家：
- 可证明保存结果：PE
- 生成前完整候选国家池：Unknown（accepted route 未保存被扫描/被删除候选列表）。

↓

Step4
为什么保留这些国家：
- 因为这些 destinationEntities 的 countryCode 通过 disabledCountries、plausibleCountries、距离与 concept rules；具体竞争候选 Unknown。

↓

Step5
为什么删除其它国家：
- Unknown。当前 accepted route 没有保存 rejected alternatives；只能从代码知道可能原因包括 CN block、region 不合理、距离超限、pool 为空、dedupe 太近、cluster 饱和。

↓

Step6
为什么生成当前标题：
- route title：makeRoute 模板读取 titleCountry + days + styleLabelZh + first/last destination，生成当前标题。

↓

Step7
为什么生成当前主题：
- profile/theme + buildRouteConcept 生成 travelStyle=classic-first-trip；themes=经典首访。

↓

Step8
为什么生成当前简介：
- route summary：makeRoute 固定模板读取 styleLabelZh 和前 3 个目的地，模板化风险最高。

↓

Step9
为什么进入 Accepted：
- 保存状态：contentQualityStatus=accepted, repositoryStatus=mediaReady, sourceType=planner-designed
- 可证明原因：materialize-route-pool 在 makeRoute 后调用 validateRouteContent(record).accepted 才 addCandidate；accepted repository 已保存本条。

↓

Step10
为什么进入 Feed（如果进入）：
- 未进入或无法证明进入 Feed：没有通过当前报告可验证的 feedReady + onlineCoverAsset 国家匹配。

真正改变路线结果的输入：
- 国家组合：由 destinations 的 countryCode 集合直接决定为 PE；plausibleCountries/CN block 可过滤，但被删国家候选 Unknown。
- 城市/景点：由 knowledge-graph-pool 候选或 coverageFallbackPlaces 形成 destinationEntities=秘鲁门户城市 > 秘鲁历史城区 > 秘鲁自然腹地 > 秘鲁地方生活区 > 秘鲁区域风景带。
- 天数：由 buildRouteConcept 得到 recommendedDays，再由 concreteDaysFor(hash(profile, destinations, serial)) 固化为 10。
- travelStyle：由 context/profile + buildRouteConcept 决定；保存为 classic-first-trip。
- route title：makeRoute 模板读取 titleCountry + days + styleLabelZh + first/last destination，生成当前标题。
- route summary：makeRoute 固定模板读取 styleLabelZh 和前 3 个目的地，模板化风险最高。

最后补上的标签/非决策字段：
- plannerReason：在路线骨架/concept 后写入；不证明它改变了国家、城市或天数。
- coverageContribution：由生成后的 country/destination 数量汇总；不是生成前输入。
- contentEvidence.provider/evidenceHash：主要是来源/缓存/溯源；一般不改变本条路线内容。
- designStrategies：来自 profile.strategies，更多是 profile 标签；在部分 concept validation 中被读取，但不能逐条证明改变了候选池。

删除输入后的影响判断：
- 删除 country/destinationEntities：会改变国家组合、标题、summary，或无法生成路线。★★★★★
- 删除 travelStyle/profile：会改变 concept、styleLabel、天数推导、标题主题。★★★★★
- 删除 bestMonths：会改变 bestMonths 展示；是否改变路线主体仅 seasonal/profile 可证明，普通路线无法证明。★★☆☆☆
- 删除 designStrategies：可能影响 buildRouteConcept 对 theme/season/transport 的 style 判定；但大量 profile 中是标签，逐条影响无法完全证明。★★☆☆☆
- 删除 plannerReason/coverageContribution：不会改变已生成路线内容。☆

### Route: 赞比亚8天经典首访：赞比亚门户城市到赞比亚区域风景带

- Route ID: `materialized-6jvfos-54136`
- 抽样类别: Seasonal
- 可证明来源类型: Materialized Template
- 国家: ZM
- 目的地: 赞比亚门户城市 > 赞比亚历史城区 > 赞比亚自然腹地 > 赞比亚地方生活区 > 赞比亚区域风景带
- travelStyle: classic-first-trip
- durationBand / days: 7-10d / 8
- Feed: 无法证明进入当前 Feed ready pool

Decision Trace:

Step1
读取：
- knowledge-graph-pool.json: destination/country candidates, as proven by provenance.source=knowledge-graph-pool or contentEvidence.materialized
- profile/travelStyle=classic-first-trip: proven by travelStyle/travelStyleConceptKey/contentEvidence.travelMode
- countryCodes=ZM
- destinationEntities=赞比亚门户城市 > 赞比亚历史城区 > 赞比亚自然腹地 > 赞比亚地方生活区 > 赞比亚区域风景带
- bestMonths=3-5月
- designStrategies=Geographic+Season+Theme+Transport
- distance calculation / routePassesPlannerRules: proven by materialize-route-pool.mjs, but per-route rejected alternatives are not persisted

↓

Step2
过滤：
- disabledCountries 包含 CN；plausibleCountries 要求国家组合在 regionGroups 中；routePassesPlannerRules 要求 concept validation、距离完整、maxSegment/span 不超限。

↓

Step3
候选国家：
- 可证明保存结果：ZM
- 生成前完整候选国家池：Unknown（accepted route 未保存被扫描/被删除候选列表）。

↓

Step4
为什么保留这些国家：
- 因为这些 destinationEntities 的 countryCode 通过 disabledCountries、plausibleCountries、距离与 concept rules；具体竞争候选 Unknown。

↓

Step5
为什么删除其它国家：
- Unknown。当前 accepted route 没有保存 rejected alternatives；只能从代码知道可能原因包括 CN block、region 不合理、距离超限、pool 为空、dedupe 太近、cluster 饱和。

↓

Step6
为什么生成当前标题：
- route title：makeRoute 模板读取 titleCountry + days + styleLabelZh + first/last destination，生成当前标题。

↓

Step7
为什么生成当前主题：
- profile/theme + buildRouteConcept 生成 travelStyle=classic-first-trip；themes=经典首访。

↓

Step8
为什么生成当前简介：
- route summary：makeRoute 固定模板读取 styleLabelZh 和前 3 个目的地，模板化风险最高。

↓

Step9
为什么进入 Accepted：
- 保存状态：contentQualityStatus=accepted, repositoryStatus=mediaReady, sourceType=planner-designed
- 可证明原因：materialize-route-pool 在 makeRoute 后调用 validateRouteContent(record).accepted 才 addCandidate；accepted repository 已保存本条。

↓

Step10
为什么进入 Feed（如果进入）：
- 未进入或无法证明进入 Feed：没有通过当前报告可验证的 feedReady + onlineCoverAsset 国家匹配。

真正改变路线结果的输入：
- 国家组合：由 destinations 的 countryCode 集合直接决定为 ZM；plausibleCountries/CN block 可过滤，但被删国家候选 Unknown。
- 城市/景点：由 knowledge-graph-pool 候选或 coverageFallbackPlaces 形成 destinationEntities=赞比亚门户城市 > 赞比亚历史城区 > 赞比亚自然腹地 > 赞比亚地方生活区 > 赞比亚区域风景带。
- 天数：由 buildRouteConcept 得到 recommendedDays，再由 concreteDaysFor(hash(profile, destinations, serial)) 固化为 8。
- travelStyle：由 context/profile + buildRouteConcept 决定；保存为 classic-first-trip。
- route title：makeRoute 模板读取 titleCountry + days + styleLabelZh + first/last destination，生成当前标题。
- route summary：makeRoute 固定模板读取 styleLabelZh 和前 3 个目的地，模板化风险最高。

最后补上的标签/非决策字段：
- plannerReason：在路线骨架/concept 后写入；不证明它改变了国家、城市或天数。
- coverageContribution：由生成后的 country/destination 数量汇总；不是生成前输入。
- contentEvidence.provider/evidenceHash：主要是来源/缓存/溯源；一般不改变本条路线内容。
- designStrategies：来自 profile.strategies，更多是 profile 标签；在部分 concept validation 中被读取，但不能逐条证明改变了候选池。

删除输入后的影响判断：
- 删除 country/destinationEntities：会改变国家组合、标题、summary，或无法生成路线。★★★★★
- 删除 travelStyle/profile：会改变 concept、styleLabel、天数推导、标题主题。★★★★★
- 删除 bestMonths：会改变 bestMonths 展示；是否改变路线主体仅 seasonal/profile 可证明，普通路线无法证明。★★☆☆☆
- 删除 designStrategies：可能影响 buildRouteConcept 对 theme/season/transport 的 style 判定；但大量 profile 中是标签，逐条影响无法完全证明。★★☆☆☆
- 删除 plannerReason/coverageContribution：不会改变已生成路线内容。☆

### Route: 梵蒂冈10天经典首访：梵蒂冈自然腹地到梵蒂冈门户城市

- Route ID: `materialized-jrffh4-54535`
- 抽样类别: Seasonal
- 可证明来源类型: Materialized Template
- 国家: VA
- 目的地: 梵蒂冈自然腹地 > 梵蒂冈地方生活区 > 梵蒂冈区域风景带 > 梵蒂冈文化停留区 > 梵蒂冈门户城市
- travelStyle: classic-first-trip
- durationBand / days: 7-10d / 10
- Feed: 无法证明进入当前 Feed ready pool

Decision Trace:

Step1
读取：
- knowledge-graph-pool.json: destination/country candidates, as proven by provenance.source=knowledge-graph-pool or contentEvidence.materialized
- profile/travelStyle=classic-first-trip: proven by travelStyle/travelStyleConceptKey/contentEvidence.travelMode
- countryCodes=VA
- destinationEntities=梵蒂冈自然腹地 > 梵蒂冈地方生活区 > 梵蒂冈区域风景带 > 梵蒂冈文化停留区 > 梵蒂冈门户城市
- bestMonths=3-5月
- designStrategies=Geographic+Season+Theme+Transport
- distance calculation / routePassesPlannerRules: proven by materialize-route-pool.mjs, but per-route rejected alternatives are not persisted

↓

Step2
过滤：
- disabledCountries 包含 CN；plausibleCountries 要求国家组合在 regionGroups 中；routePassesPlannerRules 要求 concept validation、距离完整、maxSegment/span 不超限。

↓

Step3
候选国家：
- 可证明保存结果：VA
- 生成前完整候选国家池：Unknown（accepted route 未保存被扫描/被删除候选列表）。

↓

Step4
为什么保留这些国家：
- 因为这些 destinationEntities 的 countryCode 通过 disabledCountries、plausibleCountries、距离与 concept rules；具体竞争候选 Unknown。

↓

Step5
为什么删除其它国家：
- Unknown。当前 accepted route 没有保存 rejected alternatives；只能从代码知道可能原因包括 CN block、region 不合理、距离超限、pool 为空、dedupe 太近、cluster 饱和。

↓

Step6
为什么生成当前标题：
- route title：makeRoute 模板读取 titleCountry + days + styleLabelZh + first/last destination，生成当前标题。

↓

Step7
为什么生成当前主题：
- profile/theme + buildRouteConcept 生成 travelStyle=classic-first-trip；themes=经典首访。

↓

Step8
为什么生成当前简介：
- route summary：makeRoute 固定模板读取 styleLabelZh 和前 3 个目的地，模板化风险最高。

↓

Step9
为什么进入 Accepted：
- 保存状态：contentQualityStatus=accepted, repositoryStatus=mediaReady, sourceType=planner-designed
- 可证明原因：materialize-route-pool 在 makeRoute 后调用 validateRouteContent(record).accepted 才 addCandidate；accepted repository 已保存本条。

↓

Step10
为什么进入 Feed（如果进入）：
- 未进入或无法证明进入 Feed：没有通过当前报告可验证的 feedReady + onlineCoverAsset 国家匹配。

真正改变路线结果的输入：
- 国家组合：由 destinations 的 countryCode 集合直接决定为 VA；plausibleCountries/CN block 可过滤，但被删国家候选 Unknown。
- 城市/景点：由 knowledge-graph-pool 候选或 coverageFallbackPlaces 形成 destinationEntities=梵蒂冈自然腹地 > 梵蒂冈地方生活区 > 梵蒂冈区域风景带 > 梵蒂冈文化停留区 > 梵蒂冈门户城市。
- 天数：由 buildRouteConcept 得到 recommendedDays，再由 concreteDaysFor(hash(profile, destinations, serial)) 固化为 10。
- travelStyle：由 context/profile + buildRouteConcept 决定；保存为 classic-first-trip。
- route title：makeRoute 模板读取 titleCountry + days + styleLabelZh + first/last destination，生成当前标题。
- route summary：makeRoute 固定模板读取 styleLabelZh 和前 3 个目的地，模板化风险最高。

最后补上的标签/非决策字段：
- plannerReason：在路线骨架/concept 后写入；不证明它改变了国家、城市或天数。
- coverageContribution：由生成后的 country/destination 数量汇总；不是生成前输入。
- contentEvidence.provider/evidenceHash：主要是来源/缓存/溯源；一般不改变本条路线内容。
- designStrategies：来自 profile.strategies，更多是 profile 标签；在部分 concept validation 中被读取，但不能逐条证明改变了候选池。

删除输入后的影响判断：
- 删除 country/destinationEntities：会改变国家组合、标题、summary，或无法生成路线。★★★★★
- 删除 travelStyle/profile：会改变 concept、styleLabel、天数推导、标题主题。★★★★★
- 删除 bestMonths：会改变 bestMonths 展示；是否改变路线主体仅 seasonal/profile 可证明，普通路线无法证明。★★☆☆☆
- 删除 designStrategies：可能影响 buildRouteConcept 对 theme/season/transport 的 style 判定；但大量 profile 中是标签，逐条影响无法完全证明。★★☆☆☆
- 删除 plannerReason/coverageContribution：不会改变已生成路线内容。☆

### Route: 捷克5天经典首访：奥洛穆茨到哈维若夫

- Route ID: `materialized-qz740u-54943`
- 抽样类别: Seasonal
- 可证明来源类型: Materialized Template
- 国家: CZ
- 目的地: 奥洛穆茨 > 普热罗夫 > 哈维若夫
- travelStyle: classic-first-trip
- durationBand / days: 4-6d / 5
- Feed: 无法证明进入当前 Feed ready pool

Decision Trace:

Step1
读取：
- knowledge-graph-pool.json: destination/country candidates, as proven by provenance.source=knowledge-graph-pool or contentEvidence.materialized
- profile/travelStyle=classic-first-trip: proven by travelStyle/travelStyleConceptKey/contentEvidence.travelMode
- countryCodes=CZ
- destinationEntities=奥洛穆茨 > 普热罗夫 > 哈维若夫
- bestMonths=3-5月
- designStrategies=Geographic+Season+Theme+Transport
- distance calculation / routePassesPlannerRules: proven by materialize-route-pool.mjs, but per-route rejected alternatives are not persisted

↓

Step2
过滤：
- disabledCountries 包含 CN；plausibleCountries 要求国家组合在 regionGroups 中；routePassesPlannerRules 要求 concept validation、距离完整、maxSegment/span 不超限。

↓

Step3
候选国家：
- 可证明保存结果：CZ
- 生成前完整候选国家池：Unknown（accepted route 未保存被扫描/被删除候选列表）。

↓

Step4
为什么保留这些国家：
- 因为这些 destinationEntities 的 countryCode 通过 disabledCountries、plausibleCountries、距离与 concept rules；具体竞争候选 Unknown。

↓

Step5
为什么删除其它国家：
- Unknown。当前 accepted route 没有保存 rejected alternatives；只能从代码知道可能原因包括 CN block、region 不合理、距离超限、pool 为空、dedupe 太近、cluster 饱和。

↓

Step6
为什么生成当前标题：
- route title：makeRoute 模板读取 titleCountry + days + styleLabelZh + first/last destination，生成当前标题。

↓

Step7
为什么生成当前主题：
- profile/theme + buildRouteConcept 生成 travelStyle=classic-first-trip；themes=经典首访。

↓

Step8
为什么生成当前简介：
- route summary：makeRoute 固定模板读取 styleLabelZh 和前 3 个目的地，模板化风险最高。

↓

Step9
为什么进入 Accepted：
- 保存状态：contentQualityStatus=accepted, repositoryStatus=mediaReady, sourceType=planner-designed
- 可证明原因：materialize-route-pool 在 makeRoute 后调用 validateRouteContent(record).accepted 才 addCandidate；accepted repository 已保存本条。

↓

Step10
为什么进入 Feed（如果进入）：
- 未进入或无法证明进入 Feed：没有通过当前报告可验证的 feedReady + onlineCoverAsset 国家匹配。

真正改变路线结果的输入：
- 国家组合：由 destinations 的 countryCode 集合直接决定为 CZ；plausibleCountries/CN block 可过滤，但被删国家候选 Unknown。
- 城市/景点：由 knowledge-graph-pool 候选或 coverageFallbackPlaces 形成 destinationEntities=奥洛穆茨 > 普热罗夫 > 哈维若夫。
- 天数：由 buildRouteConcept 得到 recommendedDays，再由 concreteDaysFor(hash(profile, destinations, serial)) 固化为 5。
- travelStyle：由 context/profile + buildRouteConcept 决定；保存为 classic-first-trip。
- route title：makeRoute 模板读取 titleCountry + days + styleLabelZh + first/last destination，生成当前标题。
- route summary：makeRoute 固定模板读取 styleLabelZh 和前 3 个目的地，模板化风险最高。

最后补上的标签/非决策字段：
- plannerReason：在路线骨架/concept 后写入；不证明它改变了国家、城市或天数。
- coverageContribution：由生成后的 country/destination 数量汇总；不是生成前输入。
- contentEvidence.provider/evidenceHash：主要是来源/缓存/溯源；一般不改变本条路线内容。
- designStrategies：来自 profile.strategies，更多是 profile 标签；在部分 concept validation 中被读取，但不能逐条证明改变了候选池。

删除输入后的影响判断：
- 删除 country/destinationEntities：会改变国家组合、标题、summary，或无法生成路线。★★★★★
- 删除 travelStyle/profile：会改变 concept、styleLabel、天数推导、标题主题。★★★★★
- 删除 bestMonths：会改变 bestMonths 展示；是否改变路线主体仅 seasonal/profile 可证明，普通路线无法证明。★★☆☆☆
- 删除 designStrategies：可能影响 buildRouteConcept 对 theme/season/transport 的 style 判定；但大量 profile 中是标签，逐条影响无法完全证明。★★☆☆☆
- 删除 plannerReason/coverageContribution：不会改变已生成路线内容。☆

### Route: 白俄罗斯13天经典首访：白俄罗斯门户城市到白俄罗斯文化停留区

- Route ID: `materialized-1jgaaz1-55353`
- 抽样类别: Seasonal
- 可证明来源类型: Materialized Template
- 国家: BY
- 目的地: 白俄罗斯门户城市 > 白俄罗斯历史城区 > 白俄罗斯自然腹地 > 白俄罗斯地方生活区 > 白俄罗斯区域风景带 > 白俄罗斯文化停留区
- travelStyle: classic-first-trip
- durationBand / days: 10-14d / 13
- Feed: 无法证明进入当前 Feed ready pool

Decision Trace:

Step1
读取：
- knowledge-graph-pool.json: destination/country candidates, as proven by provenance.source=knowledge-graph-pool or contentEvidence.materialized
- profile/travelStyle=classic-first-trip: proven by travelStyle/travelStyleConceptKey/contentEvidence.travelMode
- countryCodes=BY
- destinationEntities=白俄罗斯门户城市 > 白俄罗斯历史城区 > 白俄罗斯自然腹地 > 白俄罗斯地方生活区 > 白俄罗斯区域风景带 > 白俄罗斯文化停留区
- bestMonths=3-5月
- designStrategies=Geographic+Season+Theme+Transport
- distance calculation / routePassesPlannerRules: proven by materialize-route-pool.mjs, but per-route rejected alternatives are not persisted

↓

Step2
过滤：
- disabledCountries 包含 CN；plausibleCountries 要求国家组合在 regionGroups 中；routePassesPlannerRules 要求 concept validation、距离完整、maxSegment/span 不超限。

↓

Step3
候选国家：
- 可证明保存结果：BY
- 生成前完整候选国家池：Unknown（accepted route 未保存被扫描/被删除候选列表）。

↓

Step4
为什么保留这些国家：
- 因为这些 destinationEntities 的 countryCode 通过 disabledCountries、plausibleCountries、距离与 concept rules；具体竞争候选 Unknown。

↓

Step5
为什么删除其它国家：
- Unknown。当前 accepted route 没有保存 rejected alternatives；只能从代码知道可能原因包括 CN block、region 不合理、距离超限、pool 为空、dedupe 太近、cluster 饱和。

↓

Step6
为什么生成当前标题：
- route title：makeRoute 模板读取 titleCountry + days + styleLabelZh + first/last destination，生成当前标题。

↓

Step7
为什么生成当前主题：
- profile/theme + buildRouteConcept 生成 travelStyle=classic-first-trip；themes=经典首访。

↓

Step8
为什么生成当前简介：
- route summary：makeRoute 固定模板读取 styleLabelZh 和前 3 个目的地，模板化风险最高。

↓

Step9
为什么进入 Accepted：
- 保存状态：contentQualityStatus=accepted, repositoryStatus=mediaReady, sourceType=planner-designed
- 可证明原因：materialize-route-pool 在 makeRoute 后调用 validateRouteContent(record).accepted 才 addCandidate；accepted repository 已保存本条。

↓

Step10
为什么进入 Feed（如果进入）：
- 未进入或无法证明进入 Feed：没有通过当前报告可验证的 feedReady + onlineCoverAsset 国家匹配。

真正改变路线结果的输入：
- 国家组合：由 destinations 的 countryCode 集合直接决定为 BY；plausibleCountries/CN block 可过滤，但被删国家候选 Unknown。
- 城市/景点：由 knowledge-graph-pool 候选或 coverageFallbackPlaces 形成 destinationEntities=白俄罗斯门户城市 > 白俄罗斯历史城区 > 白俄罗斯自然腹地 > 白俄罗斯地方生活区 > 白俄罗斯区域风景带 > 白俄罗斯文化停留区。
- 天数：由 buildRouteConcept 得到 recommendedDays，再由 concreteDaysFor(hash(profile, destinations, serial)) 固化为 13。
- travelStyle：由 context/profile + buildRouteConcept 决定；保存为 classic-first-trip。
- route title：makeRoute 模板读取 titleCountry + days + styleLabelZh + first/last destination，生成当前标题。
- route summary：makeRoute 固定模板读取 styleLabelZh 和前 3 个目的地，模板化风险最高。

最后补上的标签/非决策字段：
- plannerReason：在路线骨架/concept 后写入；不证明它改变了国家、城市或天数。
- coverageContribution：由生成后的 country/destination 数量汇总；不是生成前输入。
- contentEvidence.provider/evidenceHash：主要是来源/缓存/溯源；一般不改变本条路线内容。
- designStrategies：来自 profile.strategies，更多是 profile 标签；在部分 concept validation 中被读取，但不能逐条证明改变了候选池。

删除输入后的影响判断：
- 删除 country/destinationEntities：会改变国家组合、标题、summary，或无法生成路线。★★★★★
- 删除 travelStyle/profile：会改变 concept、styleLabel、天数推导、标题主题。★★★★★
- 删除 bestMonths：会改变 bestMonths 展示；是否改变路线主体仅 seasonal/profile 可证明，普通路线无法证明。★★☆☆☆
- 删除 designStrategies：可能影响 buildRouteConcept 对 theme/season/transport 的 style 判定；但大量 profile 中是标签，逐条影响无法完全证明。★★☆☆☆
- 删除 plannerReason/coverageContribution：不会改变已生成路线内容。☆

### Route: 圣基茨和尼维斯13天经典首访：圣基茨和尼维斯门户城市到圣基茨和尼维斯文化停留区

- Route ID: `materialized-o7o49l-55731`
- 抽样类别: Seasonal
- 可证明来源类型: Materialized Template
- 国家: KN
- 目的地: 圣基茨和尼维斯门户城市 > 圣基茨和尼维斯历史城区 > 圣基茨和尼维斯自然腹地 > 圣基茨和尼维斯地方生活区 > 圣基茨和尼维斯区域风景带 > 圣基茨和尼维斯文化停留区
- travelStyle: classic-first-trip
- durationBand / days: 10-14d / 13
- Feed: 无法证明进入当前 Feed ready pool

Decision Trace:

Step1
读取：
- knowledge-graph-pool.json: destination/country candidates, as proven by provenance.source=knowledge-graph-pool or contentEvidence.materialized
- profile/travelStyle=classic-first-trip: proven by travelStyle/travelStyleConceptKey/contentEvidence.travelMode
- countryCodes=KN
- destinationEntities=圣基茨和尼维斯门户城市 > 圣基茨和尼维斯历史城区 > 圣基茨和尼维斯自然腹地 > 圣基茨和尼维斯地方生活区 > 圣基茨和尼维斯区域风景带 > 圣基茨和尼维斯文化停留区
- bestMonths=3-5月
- designStrategies=Geographic+Season+Theme+Transport
- distance calculation / routePassesPlannerRules: proven by materialize-route-pool.mjs, but per-route rejected alternatives are not persisted

↓

Step2
过滤：
- disabledCountries 包含 CN；plausibleCountries 要求国家组合在 regionGroups 中；routePassesPlannerRules 要求 concept validation、距离完整、maxSegment/span 不超限。

↓

Step3
候选国家：
- 可证明保存结果：KN
- 生成前完整候选国家池：Unknown（accepted route 未保存被扫描/被删除候选列表）。

↓

Step4
为什么保留这些国家：
- 因为这些 destinationEntities 的 countryCode 通过 disabledCountries、plausibleCountries、距离与 concept rules；具体竞争候选 Unknown。

↓

Step5
为什么删除其它国家：
- Unknown。当前 accepted route 没有保存 rejected alternatives；只能从代码知道可能原因包括 CN block、region 不合理、距离超限、pool 为空、dedupe 太近、cluster 饱和。

↓

Step6
为什么生成当前标题：
- route title：makeRoute 模板读取 titleCountry + days + styleLabelZh + first/last destination，生成当前标题。

↓

Step7
为什么生成当前主题：
- profile/theme + buildRouteConcept 生成 travelStyle=classic-first-trip；themes=经典首访。

↓

Step8
为什么生成当前简介：
- route summary：makeRoute 固定模板读取 styleLabelZh 和前 3 个目的地，模板化风险最高。

↓

Step9
为什么进入 Accepted：
- 保存状态：contentQualityStatus=accepted, repositoryStatus=mediaReady, sourceType=planner-designed
- 可证明原因：materialize-route-pool 在 makeRoute 后调用 validateRouteContent(record).accepted 才 addCandidate；accepted repository 已保存本条。

↓

Step10
为什么进入 Feed（如果进入）：
- 未进入或无法证明进入 Feed：没有通过当前报告可验证的 feedReady + onlineCoverAsset 国家匹配。

真正改变路线结果的输入：
- 国家组合：由 destinations 的 countryCode 集合直接决定为 KN；plausibleCountries/CN block 可过滤，但被删国家候选 Unknown。
- 城市/景点：由 knowledge-graph-pool 候选或 coverageFallbackPlaces 形成 destinationEntities=圣基茨和尼维斯门户城市 > 圣基茨和尼维斯历史城区 > 圣基茨和尼维斯自然腹地 > 圣基茨和尼维斯地方生活区 > 圣基茨和尼维斯区域风景带 > 圣基茨和尼维斯文化停留区。
- 天数：由 buildRouteConcept 得到 recommendedDays，再由 concreteDaysFor(hash(profile, destinations, serial)) 固化为 13。
- travelStyle：由 context/profile + buildRouteConcept 决定；保存为 classic-first-trip。
- route title：makeRoute 模板读取 titleCountry + days + styleLabelZh + first/last destination，生成当前标题。
- route summary：makeRoute 固定模板读取 styleLabelZh 和前 3 个目的地，模板化风险最高。

最后补上的标签/非决策字段：
- plannerReason：在路线骨架/concept 后写入；不证明它改变了国家、城市或天数。
- coverageContribution：由生成后的 country/destination 数量汇总；不是生成前输入。
- contentEvidence.provider/evidenceHash：主要是来源/缓存/溯源；一般不改变本条路线内容。
- designStrategies：来自 profile.strategies，更多是 profile 标签；在部分 concept validation 中被读取，但不能逐条证明改变了候选池。

删除输入后的影响判断：
- 删除 country/destinationEntities：会改变国家组合、标题、summary，或无法生成路线。★★★★★
- 删除 travelStyle/profile：会改变 concept、styleLabel、天数推导、标题主题。★★★★★
- 删除 bestMonths：会改变 bestMonths 展示；是否改变路线主体仅 seasonal/profile 可证明，普通路线无法证明。★★☆☆☆
- 删除 designStrategies：可能影响 buildRouteConcept 对 theme/season/transport 的 style 判定；但大量 profile 中是标签，逐条影响无法完全证明。★★☆☆☆
- 删除 plannerReason/coverageContribution：不会改变已生成路线内容。☆

### Route: 罗马尼亚14天经典首访：罗马尼亚门户城市到罗马尼亚文化停留区

- Route ID: `materialized-rnmsjz-56116`
- 抽样类别: Seasonal
- 可证明来源类型: Materialized Template
- 国家: RO
- 目的地: 罗马尼亚门户城市 > 罗马尼亚历史城区 > 罗马尼亚自然腹地 > 罗马尼亚地方生活区 > 罗马尼亚区域风景带 > 罗马尼亚文化停留区
- travelStyle: classic-first-trip
- durationBand / days: 10-14d / 14
- Feed: 无法证明进入当前 Feed ready pool

Decision Trace:

Step1
读取：
- knowledge-graph-pool.json: destination/country candidates, as proven by provenance.source=knowledge-graph-pool or contentEvidence.materialized
- profile/travelStyle=classic-first-trip: proven by travelStyle/travelStyleConceptKey/contentEvidence.travelMode
- countryCodes=RO
- destinationEntities=罗马尼亚门户城市 > 罗马尼亚历史城区 > 罗马尼亚自然腹地 > 罗马尼亚地方生活区 > 罗马尼亚区域风景带 > 罗马尼亚文化停留区
- bestMonths=3-5月
- designStrategies=Geographic+Season+Theme+Transport
- distance calculation / routePassesPlannerRules: proven by materialize-route-pool.mjs, but per-route rejected alternatives are not persisted

↓

Step2
过滤：
- disabledCountries 包含 CN；plausibleCountries 要求国家组合在 regionGroups 中；routePassesPlannerRules 要求 concept validation、距离完整、maxSegment/span 不超限。

↓

Step3
候选国家：
- 可证明保存结果：RO
- 生成前完整候选国家池：Unknown（accepted route 未保存被扫描/被删除候选列表）。

↓

Step4
为什么保留这些国家：
- 因为这些 destinationEntities 的 countryCode 通过 disabledCountries、plausibleCountries、距离与 concept rules；具体竞争候选 Unknown。

↓

Step5
为什么删除其它国家：
- Unknown。当前 accepted route 没有保存 rejected alternatives；只能从代码知道可能原因包括 CN block、region 不合理、距离超限、pool 为空、dedupe 太近、cluster 饱和。

↓

Step6
为什么生成当前标题：
- route title：makeRoute 模板读取 titleCountry + days + styleLabelZh + first/last destination，生成当前标题。

↓

Step7
为什么生成当前主题：
- profile/theme + buildRouteConcept 生成 travelStyle=classic-first-trip；themes=经典首访。

↓

Step8
为什么生成当前简介：
- route summary：makeRoute 固定模板读取 styleLabelZh 和前 3 个目的地，模板化风险最高。

↓

Step9
为什么进入 Accepted：
- 保存状态：contentQualityStatus=accepted, repositoryStatus=mediaReady, sourceType=planner-designed
- 可证明原因：materialize-route-pool 在 makeRoute 后调用 validateRouteContent(record).accepted 才 addCandidate；accepted repository 已保存本条。

↓

Step10
为什么进入 Feed（如果进入）：
- 未进入或无法证明进入 Feed：没有通过当前报告可验证的 feedReady + onlineCoverAsset 国家匹配。

真正改变路线结果的输入：
- 国家组合：由 destinations 的 countryCode 集合直接决定为 RO；plausibleCountries/CN block 可过滤，但被删国家候选 Unknown。
- 城市/景点：由 knowledge-graph-pool 候选或 coverageFallbackPlaces 形成 destinationEntities=罗马尼亚门户城市 > 罗马尼亚历史城区 > 罗马尼亚自然腹地 > 罗马尼亚地方生活区 > 罗马尼亚区域风景带 > 罗马尼亚文化停留区。
- 天数：由 buildRouteConcept 得到 recommendedDays，再由 concreteDaysFor(hash(profile, destinations, serial)) 固化为 14。
- travelStyle：由 context/profile + buildRouteConcept 决定；保存为 classic-first-trip。
- route title：makeRoute 模板读取 titleCountry + days + styleLabelZh + first/last destination，生成当前标题。
- route summary：makeRoute 固定模板读取 styleLabelZh 和前 3 个目的地，模板化风险最高。

最后补上的标签/非决策字段：
- plannerReason：在路线骨架/concept 后写入；不证明它改变了国家、城市或天数。
- coverageContribution：由生成后的 country/destination 数量汇总；不是生成前输入。
- contentEvidence.provider/evidenceHash：主要是来源/缓存/溯源；一般不改变本条路线内容。
- designStrategies：来自 profile.strategies，更多是 profile 标签；在部分 concept validation 中被读取，但不能逐条证明改变了候选池。

删除输入后的影响判断：
- 删除 country/destinationEntities：会改变国家组合、标题、summary，或无法生成路线。★★★★★
- 删除 travelStyle/profile：会改变 concept、styleLabel、天数推导、标题主题。★★★★★
- 删除 bestMonths：会改变 bestMonths 展示；是否改变路线主体仅 seasonal/profile 可证明，普通路线无法证明。★★☆☆☆
- 删除 designStrategies：可能影响 buildRouteConcept 对 theme/season/transport 的 style 判定；但大量 profile 中是标签，逐条影响无法完全证明。★★☆☆☆
- 删除 plannerReason/coverageContribution：不会改变已生成路线内容。☆

### Route: 英国5天经典首访：唐克斯特到卡尔纳冯

- Route ID: `materialized-1ghhad-58730`
- 抽样类别: Seasonal
- 可证明来源类型: Materialized Template
- 国家: GB
- 目的地: 唐克斯特 > 朴次茅斯 > 卡尔纳冯
- travelStyle: classic-first-trip
- durationBand / days: 4-6d / 5
- Feed: 可证明进入当前 Feed ready pool 的候选

Decision Trace:

Step1
读取：
- knowledge-graph-pool.json: destination/country candidates, as proven by provenance.source=knowledge-graph-pool or contentEvidence.materialized
- profile/travelStyle=classic-first-trip: proven by travelStyle/travelStyleConceptKey/contentEvidence.travelMode
- countryCodes=GB
- destinationEntities=唐克斯特 > 朴次茅斯 > 卡尔纳冯
- bestMonths=3-5月
- designStrategies=Geographic+Season+Theme+Transport
- distance calculation / routePassesPlannerRules: proven by materialize-route-pool.mjs, but per-route rejected alternatives are not persisted

↓

Step2
过滤：
- disabledCountries 包含 CN；plausibleCountries 要求国家组合在 regionGroups 中；routePassesPlannerRules 要求 concept validation、距离完整、maxSegment/span 不超限。

↓

Step3
候选国家：
- 可证明保存结果：GB
- 生成前完整候选国家池：Unknown（accepted route 未保存被扫描/被删除候选列表）。

↓

Step4
为什么保留这些国家：
- 因为这些 destinationEntities 的 countryCode 通过 disabledCountries、plausibleCountries、距离与 concept rules；具体竞争候选 Unknown。

↓

Step5
为什么删除其它国家：
- Unknown。当前 accepted route 没有保存 rejected alternatives；只能从代码知道可能原因包括 CN block、region 不合理、距离超限、pool 为空、dedupe 太近、cluster 饱和。

↓

Step6
为什么生成当前标题：
- route title：makeRoute 模板读取 titleCountry + days + styleLabelZh + first/last destination，生成当前标题。

↓

Step7
为什么生成当前主题：
- profile/theme + buildRouteConcept 生成 travelStyle=classic-first-trip；themes=经典首访。

↓

Step8
为什么生成当前简介：
- route summary：makeRoute 固定模板读取 styleLabelZh 和前 3 个目的地，模板化风险最高。

↓

Step9
为什么进入 Accepted：
- 保存状态：contentQualityStatus=accepted, repositoryStatus=mediaReady, sourceType=planner-designed
- 可证明原因：materialize-route-pool 在 makeRoute 后调用 validateRouteContent(record).accepted 才 addCandidate；accepted repository 已保存本条。

↓

Step10
为什么进入 Feed（如果进入）：
- 进入 Feed 的可证明原因：accepted repository 中存在 feedReady onlineCoverAsset，imageCountryCodes 与路线国家有交集；Feed 还会受当前 cursor/random/quality 排序影响。

真正改变路线结果的输入：
- 国家组合：由 destinations 的 countryCode 集合直接决定为 GB；plausibleCountries/CN block 可过滤，但被删国家候选 Unknown。
- 城市/景点：由 knowledge-graph-pool 候选或 coverageFallbackPlaces 形成 destinationEntities=唐克斯特 > 朴次茅斯 > 卡尔纳冯。
- 天数：由 buildRouteConcept 得到 recommendedDays，再由 concreteDaysFor(hash(profile, destinations, serial)) 固化为 5。
- travelStyle：由 context/profile + buildRouteConcept 决定；保存为 classic-first-trip。
- route title：makeRoute 模板读取 titleCountry + days + styleLabelZh + first/last destination，生成当前标题。
- route summary：makeRoute 固定模板读取 styleLabelZh 和前 3 个目的地，模板化风险最高。

最后补上的标签/非决策字段：
- plannerReason：在路线骨架/concept 后写入；不证明它改变了国家、城市或天数。
- coverageContribution：由生成后的 country/destination 数量汇总；不是生成前输入。
- contentEvidence.provider/evidenceHash：主要是来源/缓存/溯源；一般不改变本条路线内容。
- designStrategies：来自 profile.strategies，更多是 profile 标签；在部分 concept validation 中被读取，但不能逐条证明改变了候选池。

删除输入后的影响判断：
- 删除 country/destinationEntities：会改变国家组合、标题、summary，或无法生成路线。★★★★★
- 删除 travelStyle/profile：会改变 concept、styleLabel、天数推导、标题主题。★★★★★
- 删除 bestMonths：会改变 bestMonths 展示；是否改变路线主体仅 seasonal/profile 可证明，普通路线无法证明。★★☆☆☆
- 删除 designStrategies：可能影响 buildRouteConcept 对 theme/season/transport 的 style 判定；但大量 profile 中是标签，逐条影响无法完全证明。★★☆☆☆
- 删除 plannerReason/coverageContribution：不会改变已生成路线内容。☆


## AI Inspiration

### Route: 意大利9天延展经典初访：米兰

- Route ID: `planner-designed-::::::Q2044|Q220|Q2634|Q490::9天::Classic First Trip::::Q490>Q2044>Q220>Q2634`
- 抽样类别: AI Inspiration
- 可证明来源类型: Planner Pipeline
- 国家: IT
- 目的地: 米兰 > 佛罗伦萨 > 罗马 > 那不勒斯
- travelStyle: classic-first-trip
- durationBand / days: Unknown / 9
- Feed: 可证明进入当前 Feed ready pool 的候选

Decision Trace:

Step1
读取：
- Knowledge Graph: selectDestinationPool/buildRouteSkeleton reads KG pool; proven by destinationSource/sourceType/contentEvidence provider when present
- context country/travelStyle/duration: partially recoverable from saved route only: countries=IT, travelStyle=classic-first-trip, durationBand=Unknown
- destinationEntities=米兰 > 佛罗伦萨 > 罗马 > 那不勒斯
- bestMonths/season=3-5月+10-11月
- designStrategies saved=Geographic+Efficiency+Theme+Depth
- LLM refine: only if llmRefine.refined=true; otherwise deterministic fallback. Saved value=null
- Tavily/Web evidence: only if evidenceCollect or provenance evidence proves it; current saved route usually does not preserve per-route Tavily input.

↓

Step2
过滤：
- pool 为空会 rejected；skeleton 少于 2 会 rejected；decisionTests 高严重边界会 rejected；validatePlannerCandidate 会 rejected；dedupeDistance 和 countryClusterSaturated 会 rejected。

↓

Step3
候选国家：
- 可证明保存结果：IT
- 生成前完整候选国家池：Unknown（accepted route 未保存被扫描/被删除候选列表）。

↓

Step4
为什么保留这些国家：
- 因为 KG pool + skeleton/refine/validator/dedupe 后留下这些国家；具体竞争候选 Unknown。

↓

Step5
为什么删除其它国家：
- Unknown。当前 accepted route 没有保存 rejected alternatives；只能从代码知道可能原因包括 CN block、region 不合理、距离超限、pool 为空、dedupe 太近、cluster 饱和。

↓

Step6
为什么生成当前标题：
- route title：buildPlannerRecord 读取国家、destination places、styleLabel、days 拼接；当前标题=意大利9天延展经典初访：米兰。

↓

Step7
为什么生成当前主题：
- buildRouteConcept/context.theme/travelStyle 生成主题；themes=经典首访。

↓

Step8
为什么生成当前简介：
- route summary：buildPlannerRecord 读取 styleLabelZh 和 places 模板生成；是否 LLM 改写 Unknown，除非 llmRefine 字段证明。

↓

Step9
为什么进入 Accepted：
- 保存状态：contentQualityStatus=accepted, repositoryStatus=accepted, sourceType=planner-designed
- 可证明原因：route-composition-planner validatePlannerCandidate 通过后 accepted.push；后续 repository 写入。具体当次 validation log 未逐条保留。

↓

Step10
为什么进入 Feed（如果进入）：
- 进入 Feed 的可证明原因：accepted repository 中存在 feedReady onlineCoverAsset，imageCountryCodes 与路线国家有交集；Feed 还会受当前 cursor/random/quality 排序影响。

真正改变路线结果的输入：
- 国家组合：runPipeline context.country/context.countries + KG query 决定候选池；当前保存结果为 IT，原始候选国家 Unknown。
- 城市/景点：selectDestinationPool/buildRouteSkeleton/可选 LLM refine 共同决定；保存目的地为 米兰 > 佛罗伦萨 > 罗马 > 那不勒斯。
- 天数：buildRouteConcept + context.durationDays/destinationCount 决定；保存为 9。
- travelStyle：context.travelStyle 可覆盖 concept.travelStyle；保存为 classic-first-trip。
- route title：buildPlannerRecord 读取国家、destination places、styleLabel、days 拼接；当前标题=意大利9天延展经典初访：米兰。
- route summary：buildPlannerRecord 读取 styleLabelZh 和 places 模板生成；是否 LLM 改写 Unknown，除非 llmRefine 字段证明。

最后补上的标签/非决策字段：
- plannerReason：在路线骨架/concept 后写入；不证明它改变了国家、城市或天数。
- coverageContribution：由生成后的 country/destination 数量汇总；不是生成前输入。
- contentEvidence.provider/evidenceHash：主要是来源/缓存/溯源；一般不改变本条路线内容。
- designStrategies：可能参与 concept/validator，但 saved field 本身是输出记录；删除保存字段通常不改变已生成路线。

删除输入后的影响判断：
- 删除 context country/travelStyle/duration：会改变 KG query、concept 或生成失败。★★★★★
- 删除 Knowledge Graph：selectDestinationPool 为空时会 reject。★★★★★
- 删除 LLM refine：若 llmRefine.refined=true，可能改变顺序/取舍；否则不会。当前本条证据见 llmRefine 字段。
- 删除 Tavily/Web evidence：只在 missingSegments 且 webEvidencePipeline 存在时影响 evidence refs；是否改变骨架通常不会。当前本条多为 Unknown。
- 删除 plannerReason/coverageContribution：不会改变已生成路线内容。☆

### Route: 匈牙利、波兰10天区域深度：德布勒森到波兰地方生活区

- Route ID: `materialized-1e7i6o2-43134`
- 抽样类别: AI Inspiration
- 可证明来源类型: Materialized Template
- 国家: HU + PL
- 目的地: 德布勒森 > 尼赖吉哈佐 > 布达 > 波兰历史城区 > 波兰自然腹地 > 波兰地方生活区
- travelStyle: deep-dive
- durationBand / days: 10-14d / 10
- Feed: 可证明进入当前 Feed ready pool 的候选

Decision Trace:

Step1
读取：
- knowledge-graph-pool.json: destination/country candidates, as proven by provenance.source=knowledge-graph-pool or contentEvidence.materialized
- profile/travelStyle=deep-dive: proven by travelStyle/travelStyleConceptKey/contentEvidence.travelMode
- countryCodes=HU+PL
- destinationEntities=德布勒森 > 尼赖吉哈佐 > 布达 > 波兰历史城区 > 波兰自然腹地 > 波兰地方生活区
- bestMonths=5-9月
- designStrategies=Geographic+Regional+Theme+Transport
- distance calculation / routePassesPlannerRules: proven by materialize-route-pool.mjs, but per-route rejected alternatives are not persisted

↓

Step2
过滤：
- disabledCountries 包含 CN；plausibleCountries 要求国家组合在 regionGroups 中；routePassesPlannerRules 要求 concept validation、距离完整、maxSegment/span 不超限。

↓

Step3
候选国家：
- 可证明保存结果：HU + PL
- 生成前完整候选国家池：Unknown（accepted route 未保存被扫描/被删除候选列表）。

↓

Step4
为什么保留这些国家：
- 因为这些 destinationEntities 的 countryCode 通过 disabledCountries、plausibleCountries、距离与 concept rules；具体竞争候选 Unknown。

↓

Step5
为什么删除其它国家：
- Unknown。当前 accepted route 没有保存 rejected alternatives；只能从代码知道可能原因包括 CN block、region 不合理、距离超限、pool 为空、dedupe 太近、cluster 饱和。

↓

Step6
为什么生成当前标题：
- route title：makeRoute 模板读取 titleCountry + days + styleLabelZh + first/last destination，生成当前标题。

↓

Step7
为什么生成当前主题：
- profile/theme + buildRouteConcept 生成 travelStyle=deep-dive；themes=区域深度。

↓

Step8
为什么生成当前简介：
- route summary：makeRoute 固定模板读取 styleLabelZh 和前 3 个目的地，模板化风险最高。

↓

Step9
为什么进入 Accepted：
- 保存状态：contentQualityStatus=accepted, repositoryStatus=mediaReady, sourceType=planner-designed
- 可证明原因：materialize-route-pool 在 makeRoute 后调用 validateRouteContent(record).accepted 才 addCandidate；accepted repository 已保存本条。

↓

Step10
为什么进入 Feed（如果进入）：
- 进入 Feed 的可证明原因：accepted repository 中存在 feedReady onlineCoverAsset，imageCountryCodes 与路线国家有交集；Feed 还会受当前 cursor/random/quality 排序影响。

真正改变路线结果的输入：
- 国家组合：由 destinations 的 countryCode 集合直接决定为 HU+PL；plausibleCountries/CN block 可过滤，但被删国家候选 Unknown。
- 城市/景点：由 knowledge-graph-pool 候选或 coverageFallbackPlaces 形成 destinationEntities=德布勒森 > 尼赖吉哈佐 > 布达 > 波兰历史城区 > 波兰自然腹地 > 波兰地方生活区。
- 天数：由 buildRouteConcept 得到 recommendedDays，再由 concreteDaysFor(hash(profile, destinations, serial)) 固化为 10。
- travelStyle：由 context/profile + buildRouteConcept 决定；保存为 deep-dive。
- route title：makeRoute 模板读取 titleCountry + days + styleLabelZh + first/last destination，生成当前标题。
- route summary：makeRoute 固定模板读取 styleLabelZh 和前 3 个目的地，模板化风险最高。

最后补上的标签/非决策字段：
- plannerReason：在路线骨架/concept 后写入；不证明它改变了国家、城市或天数。
- coverageContribution：由生成后的 country/destination 数量汇总；不是生成前输入。
- contentEvidence.provider/evidenceHash：主要是来源/缓存/溯源；一般不改变本条路线内容。
- designStrategies：来自 profile.strategies，更多是 profile 标签；在部分 concept validation 中被读取，但不能逐条证明改变了候选池。

删除输入后的影响判断：
- 删除 country/destinationEntities：会改变国家组合、标题、summary，或无法生成路线。★★★★★
- 删除 travelStyle/profile：会改变 concept、styleLabel、天数推导、标题主题。★★★★★
- 删除 bestMonths：会改变 bestMonths 展示；是否改变路线主体仅 seasonal/profile 可证明，普通路线无法证明。★★☆☆☆
- 删除 designStrategies：可能影响 buildRouteConcept 对 theme/season/transport 的 style 判定；但大量 profile 中是标签，逐条影响无法完全证明。★★☆☆☆
- 删除 plannerReason/coverageContribution：不会改变已生成路线内容。☆

### Route: 洪都拉斯、尼加拉瓜9天经典首访：洪都拉斯区域风景带到尼加拉瓜自然腹地

- Route ID: `materialized-ffflsh-45425`
- 抽样类别: AI Inspiration
- 可证明来源类型: Materialized Template
- 国家: HN + NI
- 目的地: 洪都拉斯区域风景带 > 洪都拉斯文化停留区 > 洪都拉斯门户城市 > 尼加拉瓜历史城区 > 尼加拉瓜自然腹地
- travelStyle: classic-first-trip
- durationBand / days: 7-10d / 9
- Feed: 无法证明进入当前 Feed ready pool

Decision Trace:

Step1
读取：
- knowledge-graph-pool.json: destination/country candidates, as proven by provenance.source=knowledge-graph-pool or contentEvidence.materialized
- profile/travelStyle=classic-first-trip: proven by travelStyle/travelStyleConceptKey/contentEvidence.travelMode
- countryCodes=HN+NI
- destinationEntities=洪都拉斯区域风景带 > 洪都拉斯文化停留区 > 洪都拉斯门户城市 > 尼加拉瓜历史城区 > 尼加拉瓜自然腹地
- bestMonths=4-10月
- designStrategies=Geographic+Theme+Transport
- distance calculation / routePassesPlannerRules: proven by materialize-route-pool.mjs, but per-route rejected alternatives are not persisted

↓

Step2
过滤：
- disabledCountries 包含 CN；plausibleCountries 要求国家组合在 regionGroups 中；routePassesPlannerRules 要求 concept validation、距离完整、maxSegment/span 不超限。

↓

Step3
候选国家：
- 可证明保存结果：HN + NI
- 生成前完整候选国家池：Unknown（accepted route 未保存被扫描/被删除候选列表）。

↓

Step4
为什么保留这些国家：
- 因为这些 destinationEntities 的 countryCode 通过 disabledCountries、plausibleCountries、距离与 concept rules；具体竞争候选 Unknown。

↓

Step5
为什么删除其它国家：
- Unknown。当前 accepted route 没有保存 rejected alternatives；只能从代码知道可能原因包括 CN block、region 不合理、距离超限、pool 为空、dedupe 太近、cluster 饱和。

↓

Step6
为什么生成当前标题：
- route title：makeRoute 模板读取 titleCountry + days + styleLabelZh + first/last destination，生成当前标题。

↓

Step7
为什么生成当前主题：
- profile/theme + buildRouteConcept 生成 travelStyle=classic-first-trip；themes=经典首访。

↓

Step8
为什么生成当前简介：
- route summary：makeRoute 固定模板读取 styleLabelZh 和前 3 个目的地，模板化风险最高。

↓

Step9
为什么进入 Accepted：
- 保存状态：contentQualityStatus=accepted, repositoryStatus=mediaReady, sourceType=planner-designed
- 可证明原因：materialize-route-pool 在 makeRoute 后调用 validateRouteContent(record).accepted 才 addCandidate；accepted repository 已保存本条。

↓

Step10
为什么进入 Feed（如果进入）：
- 未进入或无法证明进入 Feed：没有通过当前报告可验证的 feedReady + onlineCoverAsset 国家匹配。

真正改变路线结果的输入：
- 国家组合：由 destinations 的 countryCode 集合直接决定为 HN+NI；plausibleCountries/CN block 可过滤，但被删国家候选 Unknown。
- 城市/景点：由 knowledge-graph-pool 候选或 coverageFallbackPlaces 形成 destinationEntities=洪都拉斯区域风景带 > 洪都拉斯文化停留区 > 洪都拉斯门户城市 > 尼加拉瓜历史城区 > 尼加拉瓜自然腹地。
- 天数：由 buildRouteConcept 得到 recommendedDays，再由 concreteDaysFor(hash(profile, destinations, serial)) 固化为 9。
- travelStyle：由 context/profile + buildRouteConcept 决定；保存为 classic-first-trip。
- route title：makeRoute 模板读取 titleCountry + days + styleLabelZh + first/last destination，生成当前标题。
- route summary：makeRoute 固定模板读取 styleLabelZh 和前 3 个目的地，模板化风险最高。

最后补上的标签/非决策字段：
- plannerReason：在路线骨架/concept 后写入；不证明它改变了国家、城市或天数。
- coverageContribution：由生成后的 country/destination 数量汇总；不是生成前输入。
- contentEvidence.provider/evidenceHash：主要是来源/缓存/溯源；一般不改变本条路线内容。
- designStrategies：来自 profile.strategies，更多是 profile 标签；在部分 concept validation 中被读取，但不能逐条证明改变了候选池。

删除输入后的影响判断：
- 删除 country/destinationEntities：会改变国家组合、标题、summary，或无法生成路线。★★★★★
- 删除 travelStyle/profile：会改变 concept、styleLabel、天数推导、标题主题。★★★★★
- 删除 bestMonths：会改变 bestMonths 展示；是否改变路线主体仅 seasonal/profile 可证明，普通路线无法证明。★★☆☆☆
- 删除 designStrategies：可能影响 buildRouteConcept 对 theme/season/transport 的 style 判定；但大量 profile 中是标签，逐条影响无法完全证明。★★☆☆☆
- 删除 plannerReason/coverageContribution：不会改变已生成路线内容。☆

### Route: 贝宁、多哥5天经典首访：贝宁历史城区到多哥文化停留区

- Route ID: `materialized-l8dkf9-46898`
- 抽样类别: AI Inspiration
- 可证明来源类型: Materialized Template
- 国家: BJ + TG
- 目的地: 贝宁历史城区 > 贝宁地方生活区 > 多哥文化停留区
- travelStyle: classic-first-trip
- durationBand / days: 4-6d / 5
- Feed: 无法证明进入当前 Feed ready pool

Decision Trace:

Step1
读取：
- knowledge-graph-pool.json: destination/country candidates, as proven by provenance.source=knowledge-graph-pool or contentEvidence.materialized
- profile/travelStyle=classic-first-trip: proven by travelStyle/travelStyleConceptKey/contentEvidence.travelMode
- countryCodes=BJ+TG
- destinationEntities=贝宁历史城区 > 贝宁地方生活区 > 多哥文化停留区
- bestMonths=3-5月
- designStrategies=Geographic+Season+Theme+Transport
- distance calculation / routePassesPlannerRules: proven by materialize-route-pool.mjs, but per-route rejected alternatives are not persisted

↓

Step2
过滤：
- disabledCountries 包含 CN；plausibleCountries 要求国家组合在 regionGroups 中；routePassesPlannerRules 要求 concept validation、距离完整、maxSegment/span 不超限。

↓

Step3
候选国家：
- 可证明保存结果：BJ + TG
- 生成前完整候选国家池：Unknown（accepted route 未保存被扫描/被删除候选列表）。

↓

Step4
为什么保留这些国家：
- 因为这些 destinationEntities 的 countryCode 通过 disabledCountries、plausibleCountries、距离与 concept rules；具体竞争候选 Unknown。

↓

Step5
为什么删除其它国家：
- Unknown。当前 accepted route 没有保存 rejected alternatives；只能从代码知道可能原因包括 CN block、region 不合理、距离超限、pool 为空、dedupe 太近、cluster 饱和。

↓

Step6
为什么生成当前标题：
- route title：makeRoute 模板读取 titleCountry + days + styleLabelZh + first/last destination，生成当前标题。

↓

Step7
为什么生成当前主题：
- profile/theme + buildRouteConcept 生成 travelStyle=classic-first-trip；themes=经典首访。

↓

Step8
为什么生成当前简介：
- route summary：makeRoute 固定模板读取 styleLabelZh 和前 3 个目的地，模板化风险最高。

↓

Step9
为什么进入 Accepted：
- 保存状态：contentQualityStatus=accepted, repositoryStatus=mediaReady, sourceType=planner-designed
- 可证明原因：materialize-route-pool 在 makeRoute 后调用 validateRouteContent(record).accepted 才 addCandidate；accepted repository 已保存本条。

↓

Step10
为什么进入 Feed（如果进入）：
- 未进入或无法证明进入 Feed：没有通过当前报告可验证的 feedReady + onlineCoverAsset 国家匹配。

真正改变路线结果的输入：
- 国家组合：由 destinations 的 countryCode 集合直接决定为 BJ+TG；plausibleCountries/CN block 可过滤，但被删国家候选 Unknown。
- 城市/景点：由 knowledge-graph-pool 候选或 coverageFallbackPlaces 形成 destinationEntities=贝宁历史城区 > 贝宁地方生活区 > 多哥文化停留区。
- 天数：由 buildRouteConcept 得到 recommendedDays，再由 concreteDaysFor(hash(profile, destinations, serial)) 固化为 5。
- travelStyle：由 context/profile + buildRouteConcept 决定；保存为 classic-first-trip。
- route title：makeRoute 模板读取 titleCountry + days + styleLabelZh + first/last destination，生成当前标题。
- route summary：makeRoute 固定模板读取 styleLabelZh 和前 3 个目的地，模板化风险最高。

最后补上的标签/非决策字段：
- plannerReason：在路线骨架/concept 后写入；不证明它改变了国家、城市或天数。
- coverageContribution：由生成后的 country/destination 数量汇总；不是生成前输入。
- contentEvidence.provider/evidenceHash：主要是来源/缓存/溯源；一般不改变本条路线内容。
- designStrategies：来自 profile.strategies，更多是 profile 标签；在部分 concept validation 中被读取，但不能逐条证明改变了候选池。

删除输入后的影响判断：
- 删除 country/destinationEntities：会改变国家组合、标题、summary，或无法生成路线。★★★★★
- 删除 travelStyle/profile：会改变 concept、styleLabel、天数推导、标题主题。★★★★★
- 删除 bestMonths：会改变 bestMonths 展示；是否改变路线主体仅 seasonal/profile 可证明，普通路线无法证明。★★☆☆☆
- 删除 designStrategies：可能影响 buildRouteConcept 对 theme/season/transport 的 style 判定；但大量 profile 中是标签，逐条影响无法完全证明。★★☆☆☆
- 删除 plannerReason/coverageContribution：不会改变已生成路线内容。☆

### Route: 巴林5天经典首访：巴林历史城区到巴林地方生活区

- Route ID: `materialized-eaut7b-47240`
- 抽样类别: AI Inspiration
- 可证明来源类型: Materialized Template
- 国家: BH
- 目的地: 巴林历史城区 > 巴林自然腹地 > 巴林地方生活区
- travelStyle: classic-first-trip
- durationBand / days: 4-6d / 5
- Feed: 无法证明进入当前 Feed ready pool

Decision Trace:

Step1
读取：
- knowledge-graph-pool.json: destination/country candidates, as proven by provenance.source=knowledge-graph-pool or contentEvidence.materialized
- profile/travelStyle=classic-first-trip: proven by travelStyle/travelStyleConceptKey/contentEvidence.travelMode
- countryCodes=BH
- destinationEntities=巴林历史城区 > 巴林自然腹地 > 巴林地方生活区
- bestMonths=5-9月
- designStrategies=Geographic+Regional+Theme+Transport
- distance calculation / routePassesPlannerRules: proven by materialize-route-pool.mjs, but per-route rejected alternatives are not persisted

↓

Step2
过滤：
- disabledCountries 包含 CN；plausibleCountries 要求国家组合在 regionGroups 中；routePassesPlannerRules 要求 concept validation、距离完整、maxSegment/span 不超限。

↓

Step3
候选国家：
- 可证明保存结果：BH
- 生成前完整候选国家池：Unknown（accepted route 未保存被扫描/被删除候选列表）。

↓

Step4
为什么保留这些国家：
- 因为这些 destinationEntities 的 countryCode 通过 disabledCountries、plausibleCountries、距离与 concept rules；具体竞争候选 Unknown。

↓

Step5
为什么删除其它国家：
- Unknown。当前 accepted route 没有保存 rejected alternatives；只能从代码知道可能原因包括 CN block、region 不合理、距离超限、pool 为空、dedupe 太近、cluster 饱和。

↓

Step6
为什么生成当前标题：
- route title：makeRoute 模板读取 titleCountry + days + styleLabelZh + first/last destination，生成当前标题。

↓

Step7
为什么生成当前主题：
- profile/theme + buildRouteConcept 生成 travelStyle=classic-first-trip；themes=经典首访。

↓

Step8
为什么生成当前简介：
- route summary：makeRoute 固定模板读取 styleLabelZh 和前 3 个目的地，模板化风险最高。

↓

Step9
为什么进入 Accepted：
- 保存状态：contentQualityStatus=accepted, repositoryStatus=mediaReady, sourceType=planner-designed
- 可证明原因：materialize-route-pool 在 makeRoute 后调用 validateRouteContent(record).accepted 才 addCandidate；accepted repository 已保存本条。

↓

Step10
为什么进入 Feed（如果进入）：
- 未进入或无法证明进入 Feed：没有通过当前报告可验证的 feedReady + onlineCoverAsset 国家匹配。

真正改变路线结果的输入：
- 国家组合：由 destinations 的 countryCode 集合直接决定为 BH；plausibleCountries/CN block 可过滤，但被删国家候选 Unknown。
- 城市/景点：由 knowledge-graph-pool 候选或 coverageFallbackPlaces 形成 destinationEntities=巴林历史城区 > 巴林自然腹地 > 巴林地方生活区。
- 天数：由 buildRouteConcept 得到 recommendedDays，再由 concreteDaysFor(hash(profile, destinations, serial)) 固化为 5。
- travelStyle：由 context/profile + buildRouteConcept 决定；保存为 classic-first-trip。
- route title：makeRoute 模板读取 titleCountry + days + styleLabelZh + first/last destination，生成当前标题。
- route summary：makeRoute 固定模板读取 styleLabelZh 和前 3 个目的地，模板化风险最高。

最后补上的标签/非决策字段：
- plannerReason：在路线骨架/concept 后写入；不证明它改变了国家、城市或天数。
- coverageContribution：由生成后的 country/destination 数量汇总；不是生成前输入。
- contentEvidence.provider/evidenceHash：主要是来源/缓存/溯源；一般不改变本条路线内容。
- designStrategies：来自 profile.strategies，更多是 profile 标签；在部分 concept validation 中被读取，但不能逐条证明改变了候选池。

删除输入后的影响判断：
- 删除 country/destinationEntities：会改变国家组合、标题、summary，或无法生成路线。★★★★★
- 删除 travelStyle/profile：会改变 concept、styleLabel、天数推导、标题主题。★★★★★
- 删除 bestMonths：会改变 bestMonths 展示；是否改变路线主体仅 seasonal/profile 可证明，普通路线无法证明。★★☆☆☆
- 删除 designStrategies：可能影响 buildRouteConcept 对 theme/season/transport 的 style 判定；但大量 profile 中是标签，逐条影响无法完全证明。★★☆☆☆
- 删除 plannerReason/coverageContribution：不会改变已生成路线内容。☆

### Route: 利比亚5天经典首访：利比亚自然腹地到利比亚区域风景带

- Route ID: `materialized-10n47jz-47519`
- 抽样类别: AI Inspiration
- 可证明来源类型: Materialized Template
- 国家: LY
- 目的地: 利比亚自然腹地 > 利比亚地方生活区 > 利比亚区域风景带
- travelStyle: classic-first-trip
- durationBand / days: 4-6d / 5
- Feed: 无法证明进入当前 Feed ready pool

Decision Trace:

Step1
读取：
- knowledge-graph-pool.json: destination/country candidates, as proven by provenance.source=knowledge-graph-pool or contentEvidence.materialized
- profile/travelStyle=classic-first-trip: proven by travelStyle/travelStyleConceptKey/contentEvidence.travelMode
- countryCodes=LY
- destinationEntities=利比亚自然腹地 > 利比亚地方生活区 > 利比亚区域风景带
- bestMonths=4-10月
- designStrategies=Geographic+Theme+Transport
- distance calculation / routePassesPlannerRules: proven by materialize-route-pool.mjs, but per-route rejected alternatives are not persisted

↓

Step2
过滤：
- disabledCountries 包含 CN；plausibleCountries 要求国家组合在 regionGroups 中；routePassesPlannerRules 要求 concept validation、距离完整、maxSegment/span 不超限。

↓

Step3
候选国家：
- 可证明保存结果：LY
- 生成前完整候选国家池：Unknown（accepted route 未保存被扫描/被删除候选列表）。

↓

Step4
为什么保留这些国家：
- 因为这些 destinationEntities 的 countryCode 通过 disabledCountries、plausibleCountries、距离与 concept rules；具体竞争候选 Unknown。

↓

Step5
为什么删除其它国家：
- Unknown。当前 accepted route 没有保存 rejected alternatives；只能从代码知道可能原因包括 CN block、region 不合理、距离超限、pool 为空、dedupe 太近、cluster 饱和。

↓

Step6
为什么生成当前标题：
- route title：makeRoute 模板读取 titleCountry + days + styleLabelZh + first/last destination，生成当前标题。

↓

Step7
为什么生成当前主题：
- profile/theme + buildRouteConcept 生成 travelStyle=classic-first-trip；themes=经典首访。

↓

Step8
为什么生成当前简介：
- route summary：makeRoute 固定模板读取 styleLabelZh 和前 3 个目的地，模板化风险最高。

↓

Step9
为什么进入 Accepted：
- 保存状态：contentQualityStatus=accepted, repositoryStatus=mediaReady, sourceType=planner-designed
- 可证明原因：materialize-route-pool 在 makeRoute 后调用 validateRouteContent(record).accepted 才 addCandidate；accepted repository 已保存本条。

↓

Step10
为什么进入 Feed（如果进入）：
- 未进入或无法证明进入 Feed：没有通过当前报告可验证的 feedReady + onlineCoverAsset 国家匹配。

真正改变路线结果的输入：
- 国家组合：由 destinations 的 countryCode 集合直接决定为 LY；plausibleCountries/CN block 可过滤，但被删国家候选 Unknown。
- 城市/景点：由 knowledge-graph-pool 候选或 coverageFallbackPlaces 形成 destinationEntities=利比亚自然腹地 > 利比亚地方生活区 > 利比亚区域风景带。
- 天数：由 buildRouteConcept 得到 recommendedDays，再由 concreteDaysFor(hash(profile, destinations, serial)) 固化为 5。
- travelStyle：由 context/profile + buildRouteConcept 决定；保存为 classic-first-trip。
- route title：makeRoute 模板读取 titleCountry + days + styleLabelZh + first/last destination，生成当前标题。
- route summary：makeRoute 固定模板读取 styleLabelZh 和前 3 个目的地，模板化风险最高。

最后补上的标签/非决策字段：
- plannerReason：在路线骨架/concept 后写入；不证明它改变了国家、城市或天数。
- coverageContribution：由生成后的 country/destination 数量汇总；不是生成前输入。
- contentEvidence.provider/evidenceHash：主要是来源/缓存/溯源；一般不改变本条路线内容。
- designStrategies：来自 profile.strategies，更多是 profile 标签；在部分 concept validation 中被读取，但不能逐条证明改变了候选池。

删除输入后的影响判断：
- 删除 country/destinationEntities：会改变国家组合、标题、summary，或无法生成路线。★★★★★
- 删除 travelStyle/profile：会改变 concept、styleLabel、天数推导、标题主题。★★★★★
- 删除 bestMonths：会改变 bestMonths 展示；是否改变路线主体仅 seasonal/profile 可证明，普通路线无法证明。★★☆☆☆
- 删除 designStrategies：可能影响 buildRouteConcept 对 theme/season/transport 的 style 判定；但大量 profile 中是标签，逐条影响无法完全证明。★★☆☆☆
- 删除 plannerReason/coverageContribution：不会改变已生成路线内容。☆

### Route: 委内瑞拉5天铁路旅程：委内瑞拉地方生活区到委内瑞拉文化停留区

- Route ID: `materialized-1lnz55c-47815`
- 抽样类别: AI Inspiration
- 可证明来源类型: Materialized Template
- 国家: VE
- 目的地: 委内瑞拉地方生活区 > 委内瑞拉区域风景带 > 委内瑞拉文化停留区
- travelStyle: rail-journey
- durationBand / days: 4-6d / 5
- Feed: 无法证明进入当前 Feed ready pool

Decision Trace:

Step1
读取：
- knowledge-graph-pool.json: destination/country candidates, as proven by provenance.source=knowledge-graph-pool or contentEvidence.materialized
- profile/travelStyle=rail-journey: proven by travelStyle/travelStyleConceptKey/contentEvidence.travelMode
- countryCodes=VE
- destinationEntities=委内瑞拉地方生活区 > 委内瑞拉区域风景带 > 委内瑞拉文化停留区
- bestMonths=4-10月
- designStrategies=Geographic+Transport+Theme
- distance calculation / routePassesPlannerRules: proven by materialize-route-pool.mjs, but per-route rejected alternatives are not persisted

↓

Step2
过滤：
- disabledCountries 包含 CN；plausibleCountries 要求国家组合在 regionGroups 中；routePassesPlannerRules 要求 concept validation、距离完整、maxSegment/span 不超限。

↓

Step3
候选国家：
- 可证明保存结果：VE
- 生成前完整候选国家池：Unknown（accepted route 未保存被扫描/被删除候选列表）。

↓

Step4
为什么保留这些国家：
- 因为这些 destinationEntities 的 countryCode 通过 disabledCountries、plausibleCountries、距离与 concept rules；具体竞争候选 Unknown。

↓

Step5
为什么删除其它国家：
- Unknown。当前 accepted route 没有保存 rejected alternatives；只能从代码知道可能原因包括 CN block、region 不合理、距离超限、pool 为空、dedupe 太近、cluster 饱和。

↓

Step6
为什么生成当前标题：
- route title：makeRoute 模板读取 titleCountry + days + styleLabelZh + first/last destination，生成当前标题。

↓

Step7
为什么生成当前主题：
- profile/theme + buildRouteConcept 生成 travelStyle=rail-journey；themes=铁路旅程。

↓

Step8
为什么生成当前简介：
- route summary：makeRoute 固定模板读取 styleLabelZh 和前 3 个目的地，模板化风险最高。

↓

Step9
为什么进入 Accepted：
- 保存状态：contentQualityStatus=accepted, repositoryStatus=mediaReady, sourceType=planner-designed
- 可证明原因：materialize-route-pool 在 makeRoute 后调用 validateRouteContent(record).accepted 才 addCandidate；accepted repository 已保存本条。

↓

Step10
为什么进入 Feed（如果进入）：
- 未进入或无法证明进入 Feed：没有通过当前报告可验证的 feedReady + onlineCoverAsset 国家匹配。

真正改变路线结果的输入：
- 国家组合：由 destinations 的 countryCode 集合直接决定为 VE；plausibleCountries/CN block 可过滤，但被删国家候选 Unknown。
- 城市/景点：由 knowledge-graph-pool 候选或 coverageFallbackPlaces 形成 destinationEntities=委内瑞拉地方生活区 > 委内瑞拉区域风景带 > 委内瑞拉文化停留区。
- 天数：由 buildRouteConcept 得到 recommendedDays，再由 concreteDaysFor(hash(profile, destinations, serial)) 固化为 5。
- travelStyle：由 context/profile + buildRouteConcept 决定；保存为 rail-journey。
- route title：makeRoute 模板读取 titleCountry + days + styleLabelZh + first/last destination，生成当前标题。
- route summary：makeRoute 固定模板读取 styleLabelZh 和前 3 个目的地，模板化风险最高。

最后补上的标签/非决策字段：
- plannerReason：在路线骨架/concept 后写入；不证明它改变了国家、城市或天数。
- coverageContribution：由生成后的 country/destination 数量汇总；不是生成前输入。
- contentEvidence.provider/evidenceHash：主要是来源/缓存/溯源；一般不改变本条路线内容。
- designStrategies：来自 profile.strategies，更多是 profile 标签；在部分 concept validation 中被读取，但不能逐条证明改变了候选池。

删除输入后的影响判断：
- 删除 country/destinationEntities：会改变国家组合、标题、summary，或无法生成路线。★★★★★
- 删除 travelStyle/profile：会改变 concept、styleLabel、天数推导、标题主题。★★★★★
- 删除 bestMonths：会改变 bestMonths 展示；是否改变路线主体仅 seasonal/profile 可证明，普通路线无法证明。★★☆☆☆
- 删除 designStrategies：可能影响 buildRouteConcept 对 theme/season/transport 的 style 判定；但大量 profile 中是标签，逐条影响无法完全证明。★★☆☆☆
- 删除 plannerReason/coverageContribution：不会改变已生成路线内容。☆

### Route: 几内亚5天公路自驾：几内亚文化停留区到几内亚历史城区

- Route ID: `materialized-4uc8hj-48124`
- 抽样类别: AI Inspiration
- 可证明来源类型: Materialized Template
- 国家: GN
- 目的地: 几内亚文化停留区 > 几内亚门户城市 > 几内亚历史城区
- travelStyle: road-trip
- durationBand / days: 4-6d / 5
- Feed: 无法证明进入当前 Feed ready pool

Decision Trace:

Step1
读取：
- knowledge-graph-pool.json: destination/country candidates, as proven by provenance.source=knowledge-graph-pool or contentEvidence.materialized
- profile/travelStyle=road-trip: proven by travelStyle/travelStyleConceptKey/contentEvidence.travelMode
- countryCodes=GN
- destinationEntities=几内亚文化停留区 > 几内亚门户城市 > 几内亚历史城区
- bestMonths=5-9月
- designStrategies=Geographic+Transport+Theme
- distance calculation / routePassesPlannerRules: proven by materialize-route-pool.mjs, but per-route rejected alternatives are not persisted

↓

Step2
过滤：
- disabledCountries 包含 CN；plausibleCountries 要求国家组合在 regionGroups 中；routePassesPlannerRules 要求 concept validation、距离完整、maxSegment/span 不超限。

↓

Step3
候选国家：
- 可证明保存结果：GN
- 生成前完整候选国家池：Unknown（accepted route 未保存被扫描/被删除候选列表）。

↓

Step4
为什么保留这些国家：
- 因为这些 destinationEntities 的 countryCode 通过 disabledCountries、plausibleCountries、距离与 concept rules；具体竞争候选 Unknown。

↓

Step5
为什么删除其它国家：
- Unknown。当前 accepted route 没有保存 rejected alternatives；只能从代码知道可能原因包括 CN block、region 不合理、距离超限、pool 为空、dedupe 太近、cluster 饱和。

↓

Step6
为什么生成当前标题：
- route title：makeRoute 模板读取 titleCountry + days + styleLabelZh + first/last destination，生成当前标题。

↓

Step7
为什么生成当前主题：
- profile/theme + buildRouteConcept 生成 travelStyle=road-trip；themes=公路自驾。

↓

Step8
为什么生成当前简介：
- route summary：makeRoute 固定模板读取 styleLabelZh 和前 3 个目的地，模板化风险最高。

↓

Step9
为什么进入 Accepted：
- 保存状态：contentQualityStatus=accepted, repositoryStatus=mediaReady, sourceType=planner-designed
- 可证明原因：materialize-route-pool 在 makeRoute 后调用 validateRouteContent(record).accepted 才 addCandidate；accepted repository 已保存本条。

↓

Step10
为什么进入 Feed（如果进入）：
- 未进入或无法证明进入 Feed：没有通过当前报告可验证的 feedReady + onlineCoverAsset 国家匹配。

真正改变路线结果的输入：
- 国家组合：由 destinations 的 countryCode 集合直接决定为 GN；plausibleCountries/CN block 可过滤，但被删国家候选 Unknown。
- 城市/景点：由 knowledge-graph-pool 候选或 coverageFallbackPlaces 形成 destinationEntities=几内亚文化停留区 > 几内亚门户城市 > 几内亚历史城区。
- 天数：由 buildRouteConcept 得到 recommendedDays，再由 concreteDaysFor(hash(profile, destinations, serial)) 固化为 5。
- travelStyle：由 context/profile + buildRouteConcept 决定；保存为 road-trip。
- route title：makeRoute 模板读取 titleCountry + days + styleLabelZh + first/last destination，生成当前标题。
- route summary：makeRoute 固定模板读取 styleLabelZh 和前 3 个目的地，模板化风险最高。

最后补上的标签/非决策字段：
- plannerReason：在路线骨架/concept 后写入；不证明它改变了国家、城市或天数。
- coverageContribution：由生成后的 country/destination 数量汇总；不是生成前输入。
- contentEvidence.provider/evidenceHash：主要是来源/缓存/溯源；一般不改变本条路线内容。
- designStrategies：来自 profile.strategies，更多是 profile 标签；在部分 concept validation 中被读取，但不能逐条证明改变了候选池。

删除输入后的影响判断：
- 删除 country/destinationEntities：会改变国家组合、标题、summary，或无法生成路线。★★★★★
- 删除 travelStyle/profile：会改变 concept、styleLabel、天数推导、标题主题。★★★★★
- 删除 bestMonths：会改变 bestMonths 展示；是否改变路线主体仅 seasonal/profile 可证明，普通路线无法证明。★★☆☆☆
- 删除 designStrategies：可能影响 buildRouteConcept 对 theme/season/transport 的 style 判定；但大量 profile 中是标签，逐条影响无法完全证明。★★☆☆☆
- 删除 plannerReason/coverageContribution：不会改变已生成路线内容。☆

### Route: 所罗门群岛5天铁路旅程：所罗门群岛门户城市到所罗门群岛区域风景带

- Route ID: `materialized-ukxo1p-48416`
- 抽样类别: AI Inspiration
- 可证明来源类型: Materialized Template
- 国家: SB
- 目的地: 所罗门群岛门户城市 > 所罗门群岛自然腹地 > 所罗门群岛区域风景带
- travelStyle: rail-journey
- durationBand / days: 4-6d / 5
- Feed: 无法证明进入当前 Feed ready pool

Decision Trace:

Step1
读取：
- knowledge-graph-pool.json: destination/country candidates, as proven by provenance.source=knowledge-graph-pool or contentEvidence.materialized
- profile/travelStyle=rail-journey: proven by travelStyle/travelStyleConceptKey/contentEvidence.travelMode
- countryCodes=SB
- destinationEntities=所罗门群岛门户城市 > 所罗门群岛自然腹地 > 所罗门群岛区域风景带
- bestMonths=4-10月
- designStrategies=Geographic+Transport+Theme
- distance calculation / routePassesPlannerRules: proven by materialize-route-pool.mjs, but per-route rejected alternatives are not persisted

↓

Step2
过滤：
- disabledCountries 包含 CN；plausibleCountries 要求国家组合在 regionGroups 中；routePassesPlannerRules 要求 concept validation、距离完整、maxSegment/span 不超限。

↓

Step3
候选国家：
- 可证明保存结果：SB
- 生成前完整候选国家池：Unknown（accepted route 未保存被扫描/被删除候选列表）。

↓

Step4
为什么保留这些国家：
- 因为这些 destinationEntities 的 countryCode 通过 disabledCountries、plausibleCountries、距离与 concept rules；具体竞争候选 Unknown。

↓

Step5
为什么删除其它国家：
- Unknown。当前 accepted route 没有保存 rejected alternatives；只能从代码知道可能原因包括 CN block、region 不合理、距离超限、pool 为空、dedupe 太近、cluster 饱和。

↓

Step6
为什么生成当前标题：
- route title：makeRoute 模板读取 titleCountry + days + styleLabelZh + first/last destination，生成当前标题。

↓

Step7
为什么生成当前主题：
- profile/theme + buildRouteConcept 生成 travelStyle=rail-journey；themes=铁路旅程。

↓

Step8
为什么生成当前简介：
- route summary：makeRoute 固定模板读取 styleLabelZh 和前 3 个目的地，模板化风险最高。

↓

Step9
为什么进入 Accepted：
- 保存状态：contentQualityStatus=accepted, repositoryStatus=mediaReady, sourceType=planner-designed
- 可证明原因：materialize-route-pool 在 makeRoute 后调用 validateRouteContent(record).accepted 才 addCandidate；accepted repository 已保存本条。

↓

Step10
为什么进入 Feed（如果进入）：
- 未进入或无法证明进入 Feed：没有通过当前报告可验证的 feedReady + onlineCoverAsset 国家匹配。

真正改变路线结果的输入：
- 国家组合：由 destinations 的 countryCode 集合直接决定为 SB；plausibleCountries/CN block 可过滤，但被删国家候选 Unknown。
- 城市/景点：由 knowledge-graph-pool 候选或 coverageFallbackPlaces 形成 destinationEntities=所罗门群岛门户城市 > 所罗门群岛自然腹地 > 所罗门群岛区域风景带。
- 天数：由 buildRouteConcept 得到 recommendedDays，再由 concreteDaysFor(hash(profile, destinations, serial)) 固化为 5。
- travelStyle：由 context/profile + buildRouteConcept 决定；保存为 rail-journey。
- route title：makeRoute 模板读取 titleCountry + days + styleLabelZh + first/last destination，生成当前标题。
- route summary：makeRoute 固定模板读取 styleLabelZh 和前 3 个目的地，模板化风险最高。

最后补上的标签/非决策字段：
- plannerReason：在路线骨架/concept 后写入；不证明它改变了国家、城市或天数。
- coverageContribution：由生成后的 country/destination 数量汇总；不是生成前输入。
- contentEvidence.provider/evidenceHash：主要是来源/缓存/溯源；一般不改变本条路线内容。
- designStrategies：来自 profile.strategies，更多是 profile 标签；在部分 concept validation 中被读取，但不能逐条证明改变了候选池。

删除输入后的影响判断：
- 删除 country/destinationEntities：会改变国家组合、标题、summary，或无法生成路线。★★★★★
- 删除 travelStyle/profile：会改变 concept、styleLabel、天数推导、标题主题。★★★★★
- 删除 bestMonths：会改变 bestMonths 展示；是否改变路线主体仅 seasonal/profile 可证明，普通路线无法证明。★★☆☆☆
- 删除 designStrategies：可能影响 buildRouteConcept 对 theme/season/transport 的 style 判定；但大量 profile 中是标签，逐条影响无法完全证明。★★☆☆☆
- 删除 plannerReason/coverageContribution：不会改变已生成路线内容。☆

### Route: 伯利兹7天公路自驾：伯利兹门户城市到伯利兹地方生活区

- Route ID: `materialized-1akaneb-49159`
- 抽样类别: AI Inspiration
- 可证明来源类型: Materialized Template
- 国家: BZ
- 目的地: 伯利兹门户城市 > 伯利兹历史城区 > 伯利兹自然腹地 > 伯利兹地方生活区
- travelStyle: road-trip
- durationBand / days: 7-10d / 7
- Feed: 无法证明进入当前 Feed ready pool

Decision Trace:

Step1
读取：
- knowledge-graph-pool.json: destination/country candidates, as proven by provenance.source=knowledge-graph-pool or contentEvidence.materialized
- profile/travelStyle=road-trip: proven by travelStyle/travelStyleConceptKey/contentEvidence.travelMode
- countryCodes=BZ
- destinationEntities=伯利兹门户城市 > 伯利兹历史城区 > 伯利兹自然腹地 > 伯利兹地方生活区
- bestMonths=5-9月
- designStrategies=Geographic+Transport+Theme
- distance calculation / routePassesPlannerRules: proven by materialize-route-pool.mjs, but per-route rejected alternatives are not persisted

↓

Step2
过滤：
- disabledCountries 包含 CN；plausibleCountries 要求国家组合在 regionGroups 中；routePassesPlannerRules 要求 concept validation、距离完整、maxSegment/span 不超限。

↓

Step3
候选国家：
- 可证明保存结果：BZ
- 生成前完整候选国家池：Unknown（accepted route 未保存被扫描/被删除候选列表）。

↓

Step4
为什么保留这些国家：
- 因为这些 destinationEntities 的 countryCode 通过 disabledCountries、plausibleCountries、距离与 concept rules；具体竞争候选 Unknown。

↓

Step5
为什么删除其它国家：
- Unknown。当前 accepted route 没有保存 rejected alternatives；只能从代码知道可能原因包括 CN block、region 不合理、距离超限、pool 为空、dedupe 太近、cluster 饱和。

↓

Step6
为什么生成当前标题：
- route title：makeRoute 模板读取 titleCountry + days + styleLabelZh + first/last destination，生成当前标题。

↓

Step7
为什么生成当前主题：
- profile/theme + buildRouteConcept 生成 travelStyle=road-trip；themes=公路自驾。

↓

Step8
为什么生成当前简介：
- route summary：makeRoute 固定模板读取 styleLabelZh 和前 3 个目的地，模板化风险最高。

↓

Step9
为什么进入 Accepted：
- 保存状态：contentQualityStatus=accepted, repositoryStatus=mediaReady, sourceType=planner-designed
- 可证明原因：materialize-route-pool 在 makeRoute 后调用 validateRouteContent(record).accepted 才 addCandidate；accepted repository 已保存本条。

↓

Step10
为什么进入 Feed（如果进入）：
- 未进入或无法证明进入 Feed：没有通过当前报告可验证的 feedReady + onlineCoverAsset 国家匹配。

真正改变路线结果的输入：
- 国家组合：由 destinations 的 countryCode 集合直接决定为 BZ；plausibleCountries/CN block 可过滤，但被删国家候选 Unknown。
- 城市/景点：由 knowledge-graph-pool 候选或 coverageFallbackPlaces 形成 destinationEntities=伯利兹门户城市 > 伯利兹历史城区 > 伯利兹自然腹地 > 伯利兹地方生活区。
- 天数：由 buildRouteConcept 得到 recommendedDays，再由 concreteDaysFor(hash(profile, destinations, serial)) 固化为 7。
- travelStyle：由 context/profile + buildRouteConcept 决定；保存为 road-trip。
- route title：makeRoute 模板读取 titleCountry + days + styleLabelZh + first/last destination，生成当前标题。
- route summary：makeRoute 固定模板读取 styleLabelZh 和前 3 个目的地，模板化风险最高。

最后补上的标签/非决策字段：
- plannerReason：在路线骨架/concept 后写入；不证明它改变了国家、城市或天数。
- coverageContribution：由生成后的 country/destination 数量汇总；不是生成前输入。
- contentEvidence.provider/evidenceHash：主要是来源/缓存/溯源；一般不改变本条路线内容。
- designStrategies：来自 profile.strategies，更多是 profile 标签；在部分 concept validation 中被读取，但不能逐条证明改变了候选池。

删除输入后的影响判断：
- 删除 country/destinationEntities：会改变国家组合、标题、summary，或无法生成路线。★★★★★
- 删除 travelStyle/profile：会改变 concept、styleLabel、天数推导、标题主题。★★★★★
- 删除 bestMonths：会改变 bestMonths 展示；是否改变路线主体仅 seasonal/profile 可证明，普通路线无法证明。★★☆☆☆
- 删除 designStrategies：可能影响 buildRouteConcept 对 theme/season/transport 的 style 判定；但大量 profile 中是标签，逐条影响无法完全证明。★★☆☆☆
- 删除 plannerReason/coverageContribution：不会改变已生成路线内容。☆

### Route: 马耳他7天公路自驾：马耳他历史城区到马耳他区域风景带

- Route ID: `materialized-1lpodgz-51889`
- 抽样类别: AI Inspiration
- 可证明来源类型: Materialized Template
- 国家: MT
- 目的地: 马耳他历史城区 > 马耳他自然腹地 > 马耳他地方生活区 > 马耳他区域风景带
- travelStyle: road-trip
- durationBand / days: 7-10d / 7
- Feed: 无法证明进入当前 Feed ready pool

Decision Trace:

Step1
读取：
- knowledge-graph-pool.json: destination/country candidates, as proven by provenance.source=knowledge-graph-pool or contentEvidence.materialized
- profile/travelStyle=road-trip: proven by travelStyle/travelStyleConceptKey/contentEvidence.travelMode
- countryCodes=MT
- destinationEntities=马耳他历史城区 > 马耳他自然腹地 > 马耳他地方生活区 > 马耳他区域风景带
- bestMonths=5-9月
- designStrategies=Geographic+Transport+Theme
- distance calculation / routePassesPlannerRules: proven by materialize-route-pool.mjs, but per-route rejected alternatives are not persisted

↓

Step2
过滤：
- disabledCountries 包含 CN；plausibleCountries 要求国家组合在 regionGroups 中；routePassesPlannerRules 要求 concept validation、距离完整、maxSegment/span 不超限。

↓

Step3
候选国家：
- 可证明保存结果：MT
- 生成前完整候选国家池：Unknown（accepted route 未保存被扫描/被删除候选列表）。

↓

Step4
为什么保留这些国家：
- 因为这些 destinationEntities 的 countryCode 通过 disabledCountries、plausibleCountries、距离与 concept rules；具体竞争候选 Unknown。

↓

Step5
为什么删除其它国家：
- Unknown。当前 accepted route 没有保存 rejected alternatives；只能从代码知道可能原因包括 CN block、region 不合理、距离超限、pool 为空、dedupe 太近、cluster 饱和。

↓

Step6
为什么生成当前标题：
- route title：makeRoute 模板读取 titleCountry + days + styleLabelZh + first/last destination，生成当前标题。

↓

Step7
为什么生成当前主题：
- profile/theme + buildRouteConcept 生成 travelStyle=road-trip；themes=公路自驾。

↓

Step8
为什么生成当前简介：
- route summary：makeRoute 固定模板读取 styleLabelZh 和前 3 个目的地，模板化风险最高。

↓

Step9
为什么进入 Accepted：
- 保存状态：contentQualityStatus=accepted, repositoryStatus=mediaReady, sourceType=planner-designed
- 可证明原因：materialize-route-pool 在 makeRoute 后调用 validateRouteContent(record).accepted 才 addCandidate；accepted repository 已保存本条。

↓

Step10
为什么进入 Feed（如果进入）：
- 未进入或无法证明进入 Feed：没有通过当前报告可验证的 feedReady + onlineCoverAsset 国家匹配。

真正改变路线结果的输入：
- 国家组合：由 destinations 的 countryCode 集合直接决定为 MT；plausibleCountries/CN block 可过滤，但被删国家候选 Unknown。
- 城市/景点：由 knowledge-graph-pool 候选或 coverageFallbackPlaces 形成 destinationEntities=马耳他历史城区 > 马耳他自然腹地 > 马耳他地方生活区 > 马耳他区域风景带。
- 天数：由 buildRouteConcept 得到 recommendedDays，再由 concreteDaysFor(hash(profile, destinations, serial)) 固化为 7。
- travelStyle：由 context/profile + buildRouteConcept 决定；保存为 road-trip。
- route title：makeRoute 模板读取 titleCountry + days + styleLabelZh + first/last destination，生成当前标题。
- route summary：makeRoute 固定模板读取 styleLabelZh 和前 3 个目的地，模板化风险最高。

最后补上的标签/非决策字段：
- plannerReason：在路线骨架/concept 后写入；不证明它改变了国家、城市或天数。
- coverageContribution：由生成后的 country/destination 数量汇总；不是生成前输入。
- contentEvidence.provider/evidenceHash：主要是来源/缓存/溯源；一般不改变本条路线内容。
- designStrategies：来自 profile.strategies，更多是 profile 标签；在部分 concept validation 中被读取，但不能逐条证明改变了候选池。

删除输入后的影响判断：
- 删除 country/destinationEntities：会改变国家组合、标题、summary，或无法生成路线。★★★★★
- 删除 travelStyle/profile：会改变 concept、styleLabel、天数推导、标题主题。★★★★★
- 删除 bestMonths：会改变 bestMonths 展示；是否改变路线主体仅 seasonal/profile 可证明，普通路线无法证明。★★☆☆☆
- 删除 designStrategies：可能影响 buildRouteConcept 对 theme/season/transport 的 style 判定；但大量 profile 中是标签，逐条影响无法完全证明。★★☆☆☆
- 删除 plannerReason/coverageContribution：不会改变已生成路线内容。☆

### Route: 印度尼西亚5天主题游：杰柏拉到加布棉

- Route ID: `materialized-13vndyt-52233`
- 抽样类别: AI Inspiration
- 可证明来源类型: Materialized Template
- 国家: ID
- 目的地: 杰柏拉 > 普沃勒佐 > 加布棉
- travelStyle: theme
- durationBand / days: 4-6d / 5
- Feed: 无法证明进入当前 Feed ready pool

Decision Trace:

Step1
读取：
- knowledge-graph-pool.json: destination/country candidates, as proven by provenance.source=knowledge-graph-pool or contentEvidence.materialized
- profile/travelStyle=theme: proven by travelStyle/travelStyleConceptKey/contentEvidence.travelMode
- countryCodes=ID
- destinationEntities=杰柏拉 > 普沃勒佐 > 加布棉
- bestMonths=9-11月
- designStrategies=Geographic+Theme+Transport
- distance calculation / routePassesPlannerRules: proven by materialize-route-pool.mjs, but per-route rejected alternatives are not persisted

↓

Step2
过滤：
- disabledCountries 包含 CN；plausibleCountries 要求国家组合在 regionGroups 中；routePassesPlannerRules 要求 concept validation、距离完整、maxSegment/span 不超限。

↓

Step3
候选国家：
- 可证明保存结果：ID
- 生成前完整候选国家池：Unknown（accepted route 未保存被扫描/被删除候选列表）。

↓

Step4
为什么保留这些国家：
- 因为这些 destinationEntities 的 countryCode 通过 disabledCountries、plausibleCountries、距离与 concept rules；具体竞争候选 Unknown。

↓

Step5
为什么删除其它国家：
- Unknown。当前 accepted route 没有保存 rejected alternatives；只能从代码知道可能原因包括 CN block、region 不合理、距离超限、pool 为空、dedupe 太近、cluster 饱和。

↓

Step6
为什么生成当前标题：
- route title：makeRoute 模板读取 titleCountry + days + styleLabelZh + first/last destination，生成当前标题。

↓

Step7
为什么生成当前主题：
- profile/theme + buildRouteConcept 生成 travelStyle=theme；themes=主题游。

↓

Step8
为什么生成当前简介：
- route summary：makeRoute 固定模板读取 styleLabelZh 和前 3 个目的地，模板化风险最高。

↓

Step9
为什么进入 Accepted：
- 保存状态：contentQualityStatus=accepted, repositoryStatus=mediaReady, sourceType=planner-designed
- 可证明原因：materialize-route-pool 在 makeRoute 后调用 validateRouteContent(record).accepted 才 addCandidate；accepted repository 已保存本条。

↓

Step10
为什么进入 Feed（如果进入）：
- 未进入或无法证明进入 Feed：没有通过当前报告可验证的 feedReady + onlineCoverAsset 国家匹配。

真正改变路线结果的输入：
- 国家组合：由 destinations 的 countryCode 集合直接决定为 ID；plausibleCountries/CN block 可过滤，但被删国家候选 Unknown。
- 城市/景点：由 knowledge-graph-pool 候选或 coverageFallbackPlaces 形成 destinationEntities=杰柏拉 > 普沃勒佐 > 加布棉。
- 天数：由 buildRouteConcept 得到 recommendedDays，再由 concreteDaysFor(hash(profile, destinations, serial)) 固化为 5。
- travelStyle：由 context/profile + buildRouteConcept 决定；保存为 theme。
- route title：makeRoute 模板读取 titleCountry + days + styleLabelZh + first/last destination，生成当前标题。
- route summary：makeRoute 固定模板读取 styleLabelZh 和前 3 个目的地，模板化风险最高。

最后补上的标签/非决策字段：
- plannerReason：在路线骨架/concept 后写入；不证明它改变了国家、城市或天数。
- coverageContribution：由生成后的 country/destination 数量汇总；不是生成前输入。
- contentEvidence.provider/evidenceHash：主要是来源/缓存/溯源；一般不改变本条路线内容。
- designStrategies：来自 profile.strategies，更多是 profile 标签；在部分 concept validation 中被读取，但不能逐条证明改变了候选池。

删除输入后的影响判断：
- 删除 country/destinationEntities：会改变国家组合、标题、summary，或无法生成路线。★★★★★
- 删除 travelStyle/profile：会改变 concept、styleLabel、天数推导、标题主题。★★★★★
- 删除 bestMonths：会改变 bestMonths 展示；是否改变路线主体仅 seasonal/profile 可证明，普通路线无法证明。★★☆☆☆
- 删除 designStrategies：可能影响 buildRouteConcept 对 theme/season/transport 的 style 判定；但大量 profile 中是标签，逐条影响无法完全证明。★★☆☆☆
- 删除 plannerReason/coverageContribution：不会改变已生成路线内容。☆

### Route: 肯尼亚8天经典首访：肯尼亚区域风景带到肯尼亚历史城区

- Route ID: `materialized-183uhli-52530`
- 抽样类别: AI Inspiration
- 可证明来源类型: Materialized Template
- 国家: KE
- 目的地: 肯尼亚区域风景带 > 肯尼亚文化停留区 > 肯尼亚门户城市 > 肯尼亚历史城区
- travelStyle: classic-first-trip
- durationBand / days: 7-10d / 8
- Feed: 无法证明进入当前 Feed ready pool

Decision Trace:

Step1
读取：
- knowledge-graph-pool.json: destination/country candidates, as proven by provenance.source=knowledge-graph-pool or contentEvidence.materialized
- profile/travelStyle=classic-first-trip: proven by travelStyle/travelStyleConceptKey/contentEvidence.travelMode
- countryCodes=KE
- destinationEntities=肯尼亚区域风景带 > 肯尼亚文化停留区 > 肯尼亚门户城市 > 肯尼亚历史城区
- bestMonths=4-10月
- designStrategies=Geographic+Theme+Transport
- distance calculation / routePassesPlannerRules: proven by materialize-route-pool.mjs, but per-route rejected alternatives are not persisted

↓

Step2
过滤：
- disabledCountries 包含 CN；plausibleCountries 要求国家组合在 regionGroups 中；routePassesPlannerRules 要求 concept validation、距离完整、maxSegment/span 不超限。

↓

Step3
候选国家：
- 可证明保存结果：KE
- 生成前完整候选国家池：Unknown（accepted route 未保存被扫描/被删除候选列表）。

↓

Step4
为什么保留这些国家：
- 因为这些 destinationEntities 的 countryCode 通过 disabledCountries、plausibleCountries、距离与 concept rules；具体竞争候选 Unknown。

↓

Step5
为什么删除其它国家：
- Unknown。当前 accepted route 没有保存 rejected alternatives；只能从代码知道可能原因包括 CN block、region 不合理、距离超限、pool 为空、dedupe 太近、cluster 饱和。

↓

Step6
为什么生成当前标题：
- route title：makeRoute 模板读取 titleCountry + days + styleLabelZh + first/last destination，生成当前标题。

↓

Step7
为什么生成当前主题：
- profile/theme + buildRouteConcept 生成 travelStyle=classic-first-trip；themes=经典首访。

↓

Step8
为什么生成当前简介：
- route summary：makeRoute 固定模板读取 styleLabelZh 和前 3 个目的地，模板化风险最高。

↓

Step9
为什么进入 Accepted：
- 保存状态：contentQualityStatus=accepted, repositoryStatus=mediaReady, sourceType=planner-designed
- 可证明原因：materialize-route-pool 在 makeRoute 后调用 validateRouteContent(record).accepted 才 addCandidate；accepted repository 已保存本条。

↓

Step10
为什么进入 Feed（如果进入）：
- 未进入或无法证明进入 Feed：没有通过当前报告可验证的 feedReady + onlineCoverAsset 国家匹配。

真正改变路线结果的输入：
- 国家组合：由 destinations 的 countryCode 集合直接决定为 KE；plausibleCountries/CN block 可过滤，但被删国家候选 Unknown。
- 城市/景点：由 knowledge-graph-pool 候选或 coverageFallbackPlaces 形成 destinationEntities=肯尼亚区域风景带 > 肯尼亚文化停留区 > 肯尼亚门户城市 > 肯尼亚历史城区。
- 天数：由 buildRouteConcept 得到 recommendedDays，再由 concreteDaysFor(hash(profile, destinations, serial)) 固化为 8。
- travelStyle：由 context/profile + buildRouteConcept 决定；保存为 classic-first-trip。
- route title：makeRoute 模板读取 titleCountry + days + styleLabelZh + first/last destination，生成当前标题。
- route summary：makeRoute 固定模板读取 styleLabelZh 和前 3 个目的地，模板化风险最高。

最后补上的标签/非决策字段：
- plannerReason：在路线骨架/concept 后写入；不证明它改变了国家、城市或天数。
- coverageContribution：由生成后的 country/destination 数量汇总；不是生成前输入。
- contentEvidence.provider/evidenceHash：主要是来源/缓存/溯源；一般不改变本条路线内容。
- designStrategies：来自 profile.strategies，更多是 profile 标签；在部分 concept validation 中被读取，但不能逐条证明改变了候选池。

删除输入后的影响判断：
- 删除 country/destinationEntities：会改变国家组合、标题、summary，或无法生成路线。★★★★★
- 删除 travelStyle/profile：会改变 concept、styleLabel、天数推导、标题主题。★★★★★
- 删除 bestMonths：会改变 bestMonths 展示；是否改变路线主体仅 seasonal/profile 可证明，普通路线无法证明。★★☆☆☆
- 删除 designStrategies：可能影响 buildRouteConcept 对 theme/season/transport 的 style 判定；但大量 profile 中是标签，逐条影响无法完全证明。★★☆☆☆
- 删除 plannerReason/coverageContribution：不会改变已生成路线内容。☆

### Route: 乍得8天经典首访：乍得文化停留区到乍得自然腹地

- Route ID: `materialized-dlv9u1-52809`
- 抽样类别: AI Inspiration
- 可证明来源类型: Materialized Template
- 国家: TD
- 目的地: 乍得文化停留区 > 乍得门户城市 > 乍得历史城区 > 乍得自然腹地
- travelStyle: classic-first-trip
- durationBand / days: 7-10d / 8
- Feed: 无法证明进入当前 Feed ready pool

Decision Trace:

Step1
读取：
- knowledge-graph-pool.json: destination/country candidates, as proven by provenance.source=knowledge-graph-pool or contentEvidence.materialized
- profile/travelStyle=classic-first-trip: proven by travelStyle/travelStyleConceptKey/contentEvidence.travelMode
- countryCodes=TD
- destinationEntities=乍得文化停留区 > 乍得门户城市 > 乍得历史城区 > 乍得自然腹地
- bestMonths=4-10月
- designStrategies=Geographic+Theme+Transport
- distance calculation / routePassesPlannerRules: proven by materialize-route-pool.mjs, but per-route rejected alternatives are not persisted

↓

Step2
过滤：
- disabledCountries 包含 CN；plausibleCountries 要求国家组合在 regionGroups 中；routePassesPlannerRules 要求 concept validation、距离完整、maxSegment/span 不超限。

↓

Step3
候选国家：
- 可证明保存结果：TD
- 生成前完整候选国家池：Unknown（accepted route 未保存被扫描/被删除候选列表）。

↓

Step4
为什么保留这些国家：
- 因为这些 destinationEntities 的 countryCode 通过 disabledCountries、plausibleCountries、距离与 concept rules；具体竞争候选 Unknown。

↓

Step5
为什么删除其它国家：
- Unknown。当前 accepted route 没有保存 rejected alternatives；只能从代码知道可能原因包括 CN block、region 不合理、距离超限、pool 为空、dedupe 太近、cluster 饱和。

↓

Step6
为什么生成当前标题：
- route title：makeRoute 模板读取 titleCountry + days + styleLabelZh + first/last destination，生成当前标题。

↓

Step7
为什么生成当前主题：
- profile/theme + buildRouteConcept 生成 travelStyle=classic-first-trip；themes=经典首访。

↓

Step8
为什么生成当前简介：
- route summary：makeRoute 固定模板读取 styleLabelZh 和前 3 个目的地，模板化风险最高。

↓

Step9
为什么进入 Accepted：
- 保存状态：contentQualityStatus=accepted, repositoryStatus=mediaReady, sourceType=planner-designed
- 可证明原因：materialize-route-pool 在 makeRoute 后调用 validateRouteContent(record).accepted 才 addCandidate；accepted repository 已保存本条。

↓

Step10
为什么进入 Feed（如果进入）：
- 未进入或无法证明进入 Feed：没有通过当前报告可验证的 feedReady + onlineCoverAsset 国家匹配。

真正改变路线结果的输入：
- 国家组合：由 destinations 的 countryCode 集合直接决定为 TD；plausibleCountries/CN block 可过滤，但被删国家候选 Unknown。
- 城市/景点：由 knowledge-graph-pool 候选或 coverageFallbackPlaces 形成 destinationEntities=乍得文化停留区 > 乍得门户城市 > 乍得历史城区 > 乍得自然腹地。
- 天数：由 buildRouteConcept 得到 recommendedDays，再由 concreteDaysFor(hash(profile, destinations, serial)) 固化为 8。
- travelStyle：由 context/profile + buildRouteConcept 决定；保存为 classic-first-trip。
- route title：makeRoute 模板读取 titleCountry + days + styleLabelZh + first/last destination，生成当前标题。
- route summary：makeRoute 固定模板读取 styleLabelZh 和前 3 个目的地，模板化风险最高。

最后补上的标签/非决策字段：
- plannerReason：在路线骨架/concept 后写入；不证明它改变了国家、城市或天数。
- coverageContribution：由生成后的 country/destination 数量汇总；不是生成前输入。
- contentEvidence.provider/evidenceHash：主要是来源/缓存/溯源；一般不改变本条路线内容。
- designStrategies：来自 profile.strategies，更多是 profile 标签；在部分 concept validation 中被读取，但不能逐条证明改变了候选池。

删除输入后的影响判断：
- 删除 country/destinationEntities：会改变国家组合、标题、summary，或无法生成路线。★★★★★
- 删除 travelStyle/profile：会改变 concept、styleLabel、天数推导、标题主题。★★★★★
- 删除 bestMonths：会改变 bestMonths 展示；是否改变路线主体仅 seasonal/profile 可证明，普通路线无法证明。★★☆☆☆
- 删除 designStrategies：可能影响 buildRouteConcept 对 theme/season/transport 的 style 判定；但大量 profile 中是标签，逐条影响无法完全证明。★★☆☆☆
- 删除 plannerReason/coverageContribution：不会改变已生成路线内容。☆

### Route: 厄瓜多尔8天主题游：厄瓜多尔历史城区到厄瓜多尔文化停留区

- Route ID: `materialized-zoclzl-54214`
- 抽样类别: AI Inspiration
- 可证明来源类型: Materialized Template
- 国家: EC
- 目的地: 厄瓜多尔历史城区 > 厄瓜多尔自然腹地 > 厄瓜多尔地方生活区 > 厄瓜多尔区域风景带 > 厄瓜多尔文化停留区
- travelStyle: theme
- durationBand / days: 7-10d / 8
- Feed: 无法证明进入当前 Feed ready pool

Decision Trace:

Step1
读取：
- knowledge-graph-pool.json: destination/country candidates, as proven by provenance.source=knowledge-graph-pool or contentEvidence.materialized
- profile/travelStyle=theme: proven by travelStyle/travelStyleConceptKey/contentEvidence.travelMode
- countryCodes=EC
- destinationEntities=厄瓜多尔历史城区 > 厄瓜多尔自然腹地 > 厄瓜多尔地方生活区 > 厄瓜多尔区域风景带 > 厄瓜多尔文化停留区
- bestMonths=9-11月
- designStrategies=Geographic+Theme+Transport
- distance calculation / routePassesPlannerRules: proven by materialize-route-pool.mjs, but per-route rejected alternatives are not persisted

↓

Step2
过滤：
- disabledCountries 包含 CN；plausibleCountries 要求国家组合在 regionGroups 中；routePassesPlannerRules 要求 concept validation、距离完整、maxSegment/span 不超限。

↓

Step3
候选国家：
- 可证明保存结果：EC
- 生成前完整候选国家池：Unknown（accepted route 未保存被扫描/被删除候选列表）。

↓

Step4
为什么保留这些国家：
- 因为这些 destinationEntities 的 countryCode 通过 disabledCountries、plausibleCountries、距离与 concept rules；具体竞争候选 Unknown。

↓

Step5
为什么删除其它国家：
- Unknown。当前 accepted route 没有保存 rejected alternatives；只能从代码知道可能原因包括 CN block、region 不合理、距离超限、pool 为空、dedupe 太近、cluster 饱和。

↓

Step6
为什么生成当前标题：
- route title：makeRoute 模板读取 titleCountry + days + styleLabelZh + first/last destination，生成当前标题。

↓

Step7
为什么生成当前主题：
- profile/theme + buildRouteConcept 生成 travelStyle=theme；themes=主题游。

↓

Step8
为什么生成当前简介：
- route summary：makeRoute 固定模板读取 styleLabelZh 和前 3 个目的地，模板化风险最高。

↓

Step9
为什么进入 Accepted：
- 保存状态：contentQualityStatus=accepted, repositoryStatus=mediaReady, sourceType=planner-designed
- 可证明原因：materialize-route-pool 在 makeRoute 后调用 validateRouteContent(record).accepted 才 addCandidate；accepted repository 已保存本条。

↓

Step10
为什么进入 Feed（如果进入）：
- 未进入或无法证明进入 Feed：没有通过当前报告可验证的 feedReady + onlineCoverAsset 国家匹配。

真正改变路线结果的输入：
- 国家组合：由 destinations 的 countryCode 集合直接决定为 EC；plausibleCountries/CN block 可过滤，但被删国家候选 Unknown。
- 城市/景点：由 knowledge-graph-pool 候选或 coverageFallbackPlaces 形成 destinationEntities=厄瓜多尔历史城区 > 厄瓜多尔自然腹地 > 厄瓜多尔地方生活区 > 厄瓜多尔区域风景带 > 厄瓜多尔文化停留区。
- 天数：由 buildRouteConcept 得到 recommendedDays，再由 concreteDaysFor(hash(profile, destinations, serial)) 固化为 8。
- travelStyle：由 context/profile + buildRouteConcept 决定；保存为 theme。
- route title：makeRoute 模板读取 titleCountry + days + styleLabelZh + first/last destination，生成当前标题。
- route summary：makeRoute 固定模板读取 styleLabelZh 和前 3 个目的地，模板化风险最高。

最后补上的标签/非决策字段：
- plannerReason：在路线骨架/concept 后写入；不证明它改变了国家、城市或天数。
- coverageContribution：由生成后的 country/destination 数量汇总；不是生成前输入。
- contentEvidence.provider/evidenceHash：主要是来源/缓存/溯源；一般不改变本条路线内容。
- designStrategies：来自 profile.strategies，更多是 profile 标签；在部分 concept validation 中被读取，但不能逐条证明改变了候选池。

删除输入后的影响判断：
- 删除 country/destinationEntities：会改变国家组合、标题、summary，或无法生成路线。★★★★★
- 删除 travelStyle/profile：会改变 concept、styleLabel、天数推导、标题主题。★★★★★
- 删除 bestMonths：会改变 bestMonths 展示；是否改变路线主体仅 seasonal/profile 可证明，普通路线无法证明。★★☆☆☆
- 删除 designStrategies：可能影响 buildRouteConcept 对 theme/season/transport 的 style 判定；但大量 profile 中是标签，逐条影响无法完全证明。★★☆☆☆
- 删除 plannerReason/coverageContribution：不会改变已生成路线内容。☆

### Route: 巴布亚新几内亚8天经典首访：巴布亚新几内亚自然腹地到巴布亚新几内亚门户城市

- Route ID: `materialized-gbekug-54490`
- 抽样类别: AI Inspiration
- 可证明来源类型: Materialized Template
- 国家: PG
- 目的地: 巴布亚新几内亚自然腹地 > 巴布亚新几内亚地方生活区 > 巴布亚新几内亚区域风景带 > 巴布亚新几内亚文化停留区 > 巴布亚新几内亚门户城市
- travelStyle: classic-first-trip
- durationBand / days: 7-10d / 8
- Feed: 无法证明进入当前 Feed ready pool

Decision Trace:

Step1
读取：
- knowledge-graph-pool.json: destination/country candidates, as proven by provenance.source=knowledge-graph-pool or contentEvidence.materialized
- profile/travelStyle=classic-first-trip: proven by travelStyle/travelStyleConceptKey/contentEvidence.travelMode
- countryCodes=PG
- destinationEntities=巴布亚新几内亚自然腹地 > 巴布亚新几内亚地方生活区 > 巴布亚新几内亚区域风景带 > 巴布亚新几内亚文化停留区 > 巴布亚新几内亚门户城市
- bestMonths=5-9月
- designStrategies=Geographic+Regional+Theme+Transport
- distance calculation / routePassesPlannerRules: proven by materialize-route-pool.mjs, but per-route rejected alternatives are not persisted

↓

Step2
过滤：
- disabledCountries 包含 CN；plausibleCountries 要求国家组合在 regionGroups 中；routePassesPlannerRules 要求 concept validation、距离完整、maxSegment/span 不超限。

↓

Step3
候选国家：
- 可证明保存结果：PG
- 生成前完整候选国家池：Unknown（accepted route 未保存被扫描/被删除候选列表）。

↓

Step4
为什么保留这些国家：
- 因为这些 destinationEntities 的 countryCode 通过 disabledCountries、plausibleCountries、距离与 concept rules；具体竞争候选 Unknown。

↓

Step5
为什么删除其它国家：
- Unknown。当前 accepted route 没有保存 rejected alternatives；只能从代码知道可能原因包括 CN block、region 不合理、距离超限、pool 为空、dedupe 太近、cluster 饱和。

↓

Step6
为什么生成当前标题：
- route title：makeRoute 模板读取 titleCountry + days + styleLabelZh + first/last destination，生成当前标题。

↓

Step7
为什么生成当前主题：
- profile/theme + buildRouteConcept 生成 travelStyle=classic-first-trip；themes=经典首访。

↓

Step8
为什么生成当前简介：
- route summary：makeRoute 固定模板读取 styleLabelZh 和前 3 个目的地，模板化风险最高。

↓

Step9
为什么进入 Accepted：
- 保存状态：contentQualityStatus=accepted, repositoryStatus=mediaReady, sourceType=planner-designed
- 可证明原因：materialize-route-pool 在 makeRoute 后调用 validateRouteContent(record).accepted 才 addCandidate；accepted repository 已保存本条。

↓

Step10
为什么进入 Feed（如果进入）：
- 未进入或无法证明进入 Feed：没有通过当前报告可验证的 feedReady + onlineCoverAsset 国家匹配。

真正改变路线结果的输入：
- 国家组合：由 destinations 的 countryCode 集合直接决定为 PG；plausibleCountries/CN block 可过滤，但被删国家候选 Unknown。
- 城市/景点：由 knowledge-graph-pool 候选或 coverageFallbackPlaces 形成 destinationEntities=巴布亚新几内亚自然腹地 > 巴布亚新几内亚地方生活区 > 巴布亚新几内亚区域风景带 > 巴布亚新几内亚文化停留区 > 巴布亚新几内亚门户城市。
- 天数：由 buildRouteConcept 得到 recommendedDays，再由 concreteDaysFor(hash(profile, destinations, serial)) 固化为 8。
- travelStyle：由 context/profile + buildRouteConcept 决定；保存为 classic-first-trip。
- route title：makeRoute 模板读取 titleCountry + days + styleLabelZh + first/last destination，生成当前标题。
- route summary：makeRoute 固定模板读取 styleLabelZh 和前 3 个目的地，模板化风险最高。

最后补上的标签/非决策字段：
- plannerReason：在路线骨架/concept 后写入；不证明它改变了国家、城市或天数。
- coverageContribution：由生成后的 country/destination 数量汇总；不是生成前输入。
- contentEvidence.provider/evidenceHash：主要是来源/缓存/溯源；一般不改变本条路线内容。
- designStrategies：来自 profile.strategies，更多是 profile 标签；在部分 concept validation 中被读取，但不能逐条证明改变了候选池。

删除输入后的影响判断：
- 删除 country/destinationEntities：会改变国家组合、标题、summary，或无法生成路线。★★★★★
- 删除 travelStyle/profile：会改变 concept、styleLabel、天数推导、标题主题。★★★★★
- 删除 bestMonths：会改变 bestMonths 展示；是否改变路线主体仅 seasonal/profile 可证明，普通路线无法证明。★★☆☆☆
- 删除 designStrategies：可能影响 buildRouteConcept 对 theme/season/transport 的 style 判定；但大量 profile 中是标签，逐条影响无法完全证明。★★☆☆☆
- 删除 plannerReason/coverageContribution：不会改变已生成路线内容。☆

### Route: 保加利亚9天经典首访：保加利亚区域风景带到保加利亚自然腹地

- Route ID: `materialized-qfg0ol-54777`
- 抽样类别: AI Inspiration
- 可证明来源类型: Materialized Template
- 国家: BG
- 目的地: 保加利亚区域风景带 > 保加利亚文化停留区 > 保加利亚门户城市 > 保加利亚历史城区 > 保加利亚自然腹地
- travelStyle: classic-first-trip
- durationBand / days: 7-10d / 9
- Feed: 无法证明进入当前 Feed ready pool

Decision Trace:

Step1
读取：
- knowledge-graph-pool.json: destination/country candidates, as proven by provenance.source=knowledge-graph-pool or contentEvidence.materialized
- profile/travelStyle=classic-first-trip: proven by travelStyle/travelStyleConceptKey/contentEvidence.travelMode
- countryCodes=BG
- destinationEntities=保加利亚区域风景带 > 保加利亚文化停留区 > 保加利亚门户城市 > 保加利亚历史城区 > 保加利亚自然腹地
- bestMonths=5-9月
- designStrategies=Geographic+Regional+Theme+Transport
- distance calculation / routePassesPlannerRules: proven by materialize-route-pool.mjs, but per-route rejected alternatives are not persisted

↓

Step2
过滤：
- disabledCountries 包含 CN；plausibleCountries 要求国家组合在 regionGroups 中；routePassesPlannerRules 要求 concept validation、距离完整、maxSegment/span 不超限。

↓

Step3
候选国家：
- 可证明保存结果：BG
- 生成前完整候选国家池：Unknown（accepted route 未保存被扫描/被删除候选列表）。

↓

Step4
为什么保留这些国家：
- 因为这些 destinationEntities 的 countryCode 通过 disabledCountries、plausibleCountries、距离与 concept rules；具体竞争候选 Unknown。

↓

Step5
为什么删除其它国家：
- Unknown。当前 accepted route 没有保存 rejected alternatives；只能从代码知道可能原因包括 CN block、region 不合理、距离超限、pool 为空、dedupe 太近、cluster 饱和。

↓

Step6
为什么生成当前标题：
- route title：makeRoute 模板读取 titleCountry + days + styleLabelZh + first/last destination，生成当前标题。

↓

Step7
为什么生成当前主题：
- profile/theme + buildRouteConcept 生成 travelStyle=classic-first-trip；themes=经典首访。

↓

Step8
为什么生成当前简介：
- route summary：makeRoute 固定模板读取 styleLabelZh 和前 3 个目的地，模板化风险最高。

↓

Step9
为什么进入 Accepted：
- 保存状态：contentQualityStatus=accepted, repositoryStatus=mediaReady, sourceType=planner-designed
- 可证明原因：materialize-route-pool 在 makeRoute 后调用 validateRouteContent(record).accepted 才 addCandidate；accepted repository 已保存本条。

↓

Step10
为什么进入 Feed（如果进入）：
- 未进入或无法证明进入 Feed：没有通过当前报告可验证的 feedReady + onlineCoverAsset 国家匹配。

真正改变路线结果的输入：
- 国家组合：由 destinations 的 countryCode 集合直接决定为 BG；plausibleCountries/CN block 可过滤，但被删国家候选 Unknown。
- 城市/景点：由 knowledge-graph-pool 候选或 coverageFallbackPlaces 形成 destinationEntities=保加利亚区域风景带 > 保加利亚文化停留区 > 保加利亚门户城市 > 保加利亚历史城区 > 保加利亚自然腹地。
- 天数：由 buildRouteConcept 得到 recommendedDays，再由 concreteDaysFor(hash(profile, destinations, serial)) 固化为 9。
- travelStyle：由 context/profile + buildRouteConcept 决定；保存为 classic-first-trip。
- route title：makeRoute 模板读取 titleCountry + days + styleLabelZh + first/last destination，生成当前标题。
- route summary：makeRoute 固定模板读取 styleLabelZh 和前 3 个目的地，模板化风险最高。

最后补上的标签/非决策字段：
- plannerReason：在路线骨架/concept 后写入；不证明它改变了国家、城市或天数。
- coverageContribution：由生成后的 country/destination 数量汇总；不是生成前输入。
- contentEvidence.provider/evidenceHash：主要是来源/缓存/溯源；一般不改变本条路线内容。
- designStrategies：来自 profile.strategies，更多是 profile 标签；在部分 concept validation 中被读取，但不能逐条证明改变了候选池。

删除输入后的影响判断：
- 删除 country/destinationEntities：会改变国家组合、标题、summary，或无法生成路线。★★★★★
- 删除 travelStyle/profile：会改变 concept、styleLabel、天数推导、标题主题。★★★★★
- 删除 bestMonths：会改变 bestMonths 展示；是否改变路线主体仅 seasonal/profile 可证明，普通路线无法证明。★★☆☆☆
- 删除 designStrategies：可能影响 buildRouteConcept 对 theme/season/transport 的 style 判定；但大量 profile 中是标签，逐条影响无法完全证明。★★☆☆☆
- 删除 plannerReason/coverageContribution：不会改变已生成路线内容。☆

### Route: 摩纳哥9天经典首访：摩纳哥文化停留区到摩纳哥地方生活区

- Route ID: `materialized-o6xba8-55055`
- 抽样类别: AI Inspiration
- 可证明来源类型: Materialized Template
- 国家: MC
- 目的地: 摩纳哥文化停留区 > 摩纳哥门户城市 > 摩纳哥历史城区 > 摩纳哥自然腹地 > 摩纳哥地方生活区
- travelStyle: classic-first-trip
- durationBand / days: 7-10d / 9
- Feed: 无法证明进入当前 Feed ready pool

Decision Trace:

Step1
读取：
- knowledge-graph-pool.json: destination/country candidates, as proven by provenance.source=knowledge-graph-pool or contentEvidence.materialized
- profile/travelStyle=classic-first-trip: proven by travelStyle/travelStyleConceptKey/contentEvidence.travelMode
- countryCodes=MC
- destinationEntities=摩纳哥文化停留区 > 摩纳哥门户城市 > 摩纳哥历史城区 > 摩纳哥自然腹地 > 摩纳哥地方生活区
- bestMonths=4-10月
- designStrategies=Geographic+Theme+Transport
- distance calculation / routePassesPlannerRules: proven by materialize-route-pool.mjs, but per-route rejected alternatives are not persisted

↓

Step2
过滤：
- disabledCountries 包含 CN；plausibleCountries 要求国家组合在 regionGroups 中；routePassesPlannerRules 要求 concept validation、距离完整、maxSegment/span 不超限。

↓

Step3
候选国家：
- 可证明保存结果：MC
- 生成前完整候选国家池：Unknown（accepted route 未保存被扫描/被删除候选列表）。

↓

Step4
为什么保留这些国家：
- 因为这些 destinationEntities 的 countryCode 通过 disabledCountries、plausibleCountries、距离与 concept rules；具体竞争候选 Unknown。

↓

Step5
为什么删除其它国家：
- Unknown。当前 accepted route 没有保存 rejected alternatives；只能从代码知道可能原因包括 CN block、region 不合理、距离超限、pool 为空、dedupe 太近、cluster 饱和。

↓

Step6
为什么生成当前标题：
- route title：makeRoute 模板读取 titleCountry + days + styleLabelZh + first/last destination，生成当前标题。

↓

Step7
为什么生成当前主题：
- profile/theme + buildRouteConcept 生成 travelStyle=classic-first-trip；themes=经典首访。

↓

Step8
为什么生成当前简介：
- route summary：makeRoute 固定模板读取 styleLabelZh 和前 3 个目的地，模板化风险最高。

↓

Step9
为什么进入 Accepted：
- 保存状态：contentQualityStatus=accepted, repositoryStatus=mediaReady, sourceType=planner-designed
- 可证明原因：materialize-route-pool 在 makeRoute 后调用 validateRouteContent(record).accepted 才 addCandidate；accepted repository 已保存本条。

↓

Step10
为什么进入 Feed（如果进入）：
- 未进入或无法证明进入 Feed：没有通过当前报告可验证的 feedReady + onlineCoverAsset 国家匹配。

真正改变路线结果的输入：
- 国家组合：由 destinations 的 countryCode 集合直接决定为 MC；plausibleCountries/CN block 可过滤，但被删国家候选 Unknown。
- 城市/景点：由 knowledge-graph-pool 候选或 coverageFallbackPlaces 形成 destinationEntities=摩纳哥文化停留区 > 摩纳哥门户城市 > 摩纳哥历史城区 > 摩纳哥自然腹地 > 摩纳哥地方生活区。
- 天数：由 buildRouteConcept 得到 recommendedDays，再由 concreteDaysFor(hash(profile, destinations, serial)) 固化为 9。
- travelStyle：由 context/profile + buildRouteConcept 决定；保存为 classic-first-trip。
- route title：makeRoute 模板读取 titleCountry + days + styleLabelZh + first/last destination，生成当前标题。
- route summary：makeRoute 固定模板读取 styleLabelZh 和前 3 个目的地，模板化风险最高。

最后补上的标签/非决策字段：
- plannerReason：在路线骨架/concept 后写入；不证明它改变了国家、城市或天数。
- coverageContribution：由生成后的 country/destination 数量汇总；不是生成前输入。
- contentEvidence.provider/evidenceHash：主要是来源/缓存/溯源；一般不改变本条路线内容。
- designStrategies：来自 profile.strategies，更多是 profile 标签；在部分 concept validation 中被读取，但不能逐条证明改变了候选池。

删除输入后的影响判断：
- 删除 country/destinationEntities：会改变国家组合、标题、summary，或无法生成路线。★★★★★
- 删除 travelStyle/profile：会改变 concept、styleLabel、天数推导、标题主题。★★★★★
- 删除 bestMonths：会改变 bestMonths 展示；是否改变路线主体仅 seasonal/profile 可证明，普通路线无法证明。★★☆☆☆
- 删除 designStrategies：可能影响 buildRouteConcept 对 theme/season/transport 的 style 判定；但大量 profile 中是标签，逐条影响无法完全证明。★★☆☆☆
- 删除 plannerReason/coverageContribution：不会改变已生成路线内容。☆

### Route: 也门10天经典首访：也门门户城市到也门文化停留区

- Route ID: `materialized-h23u9o-56410`
- 抽样类别: AI Inspiration
- 可证明来源类型: Materialized Template
- 国家: YE
- 目的地: 也门门户城市 > 也门历史城区 > 也门自然腹地 > 也门地方生活区 > 也门区域风景带 > 也门文化停留区
- travelStyle: classic-first-trip
- durationBand / days: 10-14d / 10
- Feed: 无法证明进入当前 Feed ready pool

Decision Trace:

Step1
读取：
- knowledge-graph-pool.json: destination/country candidates, as proven by provenance.source=knowledge-graph-pool or contentEvidence.materialized
- profile/travelStyle=classic-first-trip: proven by travelStyle/travelStyleConceptKey/contentEvidence.travelMode
- countryCodes=YE
- destinationEntities=也门门户城市 > 也门历史城区 > 也门自然腹地 > 也门地方生活区 > 也门区域风景带 > 也门文化停留区
- bestMonths=3-5月
- designStrategies=Geographic+Season+Theme+Transport
- distance calculation / routePassesPlannerRules: proven by materialize-route-pool.mjs, but per-route rejected alternatives are not persisted

↓

Step2
过滤：
- disabledCountries 包含 CN；plausibleCountries 要求国家组合在 regionGroups 中；routePassesPlannerRules 要求 concept validation、距离完整、maxSegment/span 不超限。

↓

Step3
候选国家：
- 可证明保存结果：YE
- 生成前完整候选国家池：Unknown（accepted route 未保存被扫描/被删除候选列表）。

↓

Step4
为什么保留这些国家：
- 因为这些 destinationEntities 的 countryCode 通过 disabledCountries、plausibleCountries、距离与 concept rules；具体竞争候选 Unknown。

↓

Step5
为什么删除其它国家：
- Unknown。当前 accepted route 没有保存 rejected alternatives；只能从代码知道可能原因包括 CN block、region 不合理、距离超限、pool 为空、dedupe 太近、cluster 饱和。

↓

Step6
为什么生成当前标题：
- route title：makeRoute 模板读取 titleCountry + days + styleLabelZh + first/last destination，生成当前标题。

↓

Step7
为什么生成当前主题：
- profile/theme + buildRouteConcept 生成 travelStyle=classic-first-trip；themes=经典首访。

↓

Step8
为什么生成当前简介：
- route summary：makeRoute 固定模板读取 styleLabelZh 和前 3 个目的地，模板化风险最高。

↓

Step9
为什么进入 Accepted：
- 保存状态：contentQualityStatus=accepted, repositoryStatus=mediaReady, sourceType=planner-designed
- 可证明原因：materialize-route-pool 在 makeRoute 后调用 validateRouteContent(record).accepted 才 addCandidate；accepted repository 已保存本条。

↓

Step10
为什么进入 Feed（如果进入）：
- 未进入或无法证明进入 Feed：没有通过当前报告可验证的 feedReady + onlineCoverAsset 国家匹配。

真正改变路线结果的输入：
- 国家组合：由 destinations 的 countryCode 集合直接决定为 YE；plausibleCountries/CN block 可过滤，但被删国家候选 Unknown。
- 城市/景点：由 knowledge-graph-pool 候选或 coverageFallbackPlaces 形成 destinationEntities=也门门户城市 > 也门历史城区 > 也门自然腹地 > 也门地方生活区 > 也门区域风景带 > 也门文化停留区。
- 天数：由 buildRouteConcept 得到 recommendedDays，再由 concreteDaysFor(hash(profile, destinations, serial)) 固化为 10。
- travelStyle：由 context/profile + buildRouteConcept 决定；保存为 classic-first-trip。
- route title：makeRoute 模板读取 titleCountry + days + styleLabelZh + first/last destination，生成当前标题。
- route summary：makeRoute 固定模板读取 styleLabelZh 和前 3 个目的地，模板化风险最高。

最后补上的标签/非决策字段：
- plannerReason：在路线骨架/concept 后写入；不证明它改变了国家、城市或天数。
- coverageContribution：由生成后的 country/destination 数量汇总；不是生成前输入。
- contentEvidence.provider/evidenceHash：主要是来源/缓存/溯源；一般不改变本条路线内容。
- designStrategies：来自 profile.strategies，更多是 profile 标签；在部分 concept validation 中被读取，但不能逐条证明改变了候选池。

删除输入后的影响判断：
- 删除 country/destinationEntities：会改变国家组合、标题、summary，或无法生成路线。★★★★★
- 删除 travelStyle/profile：会改变 concept、styleLabel、天数推导、标题主题。★★★★★
- 删除 bestMonths：会改变 bestMonths 展示；是否改变路线主体仅 seasonal/profile 可证明，普通路线无法证明。★★☆☆☆
- 删除 designStrategies：可能影响 buildRouteConcept 对 theme/season/transport 的 style 判定；但大量 profile 中是标签，逐条影响无法完全证明。★★☆☆☆
- 删除 plannerReason/coverageContribution：不会改变已生成路线内容。☆

### Route: 英国5天公路自驾：伦敦城到利兹

- Route ID: `materialized-z4hhrl-59204`
- 抽样类别: AI Inspiration
- 可证明来源类型: Materialized Template
- 国家: GB
- 目的地: 伦敦城 > 牛津 > 利兹
- travelStyle: road-trip
- durationBand / days: 4-6d / 5
- Feed: 可证明进入当前 Feed ready pool 的候选

Decision Trace:

Step1
读取：
- knowledge-graph-pool.json: destination/country candidates, as proven by provenance.source=knowledge-graph-pool or contentEvidence.materialized
- profile/travelStyle=road-trip: proven by travelStyle/travelStyleConceptKey/contentEvidence.travelMode
- countryCodes=GB
- destinationEntities=伦敦城 > 牛津 > 利兹
- bestMonths=5-9月
- designStrategies=Geographic+Transport+Theme
- distance calculation / routePassesPlannerRules: proven by materialize-route-pool.mjs, but per-route rejected alternatives are not persisted

↓

Step2
过滤：
- disabledCountries 包含 CN；plausibleCountries 要求国家组合在 regionGroups 中；routePassesPlannerRules 要求 concept validation、距离完整、maxSegment/span 不超限。

↓

Step3
候选国家：
- 可证明保存结果：GB
- 生成前完整候选国家池：Unknown（accepted route 未保存被扫描/被删除候选列表）。

↓

Step4
为什么保留这些国家：
- 因为这些 destinationEntities 的 countryCode 通过 disabledCountries、plausibleCountries、距离与 concept rules；具体竞争候选 Unknown。

↓

Step5
为什么删除其它国家：
- Unknown。当前 accepted route 没有保存 rejected alternatives；只能从代码知道可能原因包括 CN block、region 不合理、距离超限、pool 为空、dedupe 太近、cluster 饱和。

↓

Step6
为什么生成当前标题：
- route title：makeRoute 模板读取 titleCountry + days + styleLabelZh + first/last destination，生成当前标题。

↓

Step7
为什么生成当前主题：
- profile/theme + buildRouteConcept 生成 travelStyle=road-trip；themes=公路自驾。

↓

Step8
为什么生成当前简介：
- route summary：makeRoute 固定模板读取 styleLabelZh 和前 3 个目的地，模板化风险最高。

↓

Step9
为什么进入 Accepted：
- 保存状态：contentQualityStatus=accepted, repositoryStatus=mediaReady, sourceType=planner-designed
- 可证明原因：materialize-route-pool 在 makeRoute 后调用 validateRouteContent(record).accepted 才 addCandidate；accepted repository 已保存本条。

↓

Step10
为什么进入 Feed（如果进入）：
- 进入 Feed 的可证明原因：accepted repository 中存在 feedReady onlineCoverAsset，imageCountryCodes 与路线国家有交集；Feed 还会受当前 cursor/random/quality 排序影响。

真正改变路线结果的输入：
- 国家组合：由 destinations 的 countryCode 集合直接决定为 GB；plausibleCountries/CN block 可过滤，但被删国家候选 Unknown。
- 城市/景点：由 knowledge-graph-pool 候选或 coverageFallbackPlaces 形成 destinationEntities=伦敦城 > 牛津 > 利兹。
- 天数：由 buildRouteConcept 得到 recommendedDays，再由 concreteDaysFor(hash(profile, destinations, serial)) 固化为 5。
- travelStyle：由 context/profile + buildRouteConcept 决定；保存为 road-trip。
- route title：makeRoute 模板读取 titleCountry + days + styleLabelZh + first/last destination，生成当前标题。
- route summary：makeRoute 固定模板读取 styleLabelZh 和前 3 个目的地，模板化风险最高。

最后补上的标签/非决策字段：
- plannerReason：在路线骨架/concept 后写入；不证明它改变了国家、城市或天数。
- coverageContribution：由生成后的 country/destination 数量汇总；不是生成前输入。
- contentEvidence.provider/evidenceHash：主要是来源/缓存/溯源；一般不改变本条路线内容。
- designStrategies：来自 profile.strategies，更多是 profile 标签；在部分 concept validation 中被读取，但不能逐条证明改变了候选池。

删除输入后的影响判断：
- 删除 country/destinationEntities：会改变国家组合、标题、summary，或无法生成路线。★★★★★
- 删除 travelStyle/profile：会改变 concept、styleLabel、天数推导、标题主题。★★★★★
- 删除 bestMonths：会改变 bestMonths 展示；是否改变路线主体仅 seasonal/profile 可证明，普通路线无法证明。★★☆☆☆
- 删除 designStrategies：可能影响 buildRouteConcept 对 theme/season/transport 的 style 判定；但大量 profile 中是标签，逐条影响无法完全证明。★★☆☆☆
- 删除 plannerReason/coverageContribution：不会改变已生成路线内容。☆


## Niche

### Route: 四国八十八所巡礼

- Route ID: `wikivoyage-27`
- 抽样类别: Niche
- 可证明来源类型: Unknown
- 国家: JP
- 目的地: 阿波市 > 高知市 > 松山市 > 鸣门市 > 大阪市
- travelStyle: Unknown
- durationBand / days: Unknown / 50
- Feed: 可证明进入当前 Feed ready pool 的候选

Decision Trace:

Step1
读取：
- Unknown: route source does not preserve enough pre-generation context.

↓

Step2
过滤：
- Unknown

↓

Step3
候选国家：
- 可证明保存结果：JP
- 生成前完整候选国家池：Unknown（accepted route 未保存被扫描/被删除候选列表）。

↓

Step4
为什么保留这些国家：
- Unknown

↓

Step5
为什么删除其它国家：
- Unknown。当前 accepted route 没有保存 rejected alternatives；只能从代码知道可能原因包括 CN block、region 不合理、距离超限、pool 为空、dedupe 太近、cluster 饱和。

↓

Step6
为什么生成当前标题：
- Unknown

↓

Step7
为什么生成当前主题：
- buildRouteConcept/context.theme/travelStyle 生成主题；themes=寺庙巡礼。

↓

Step8
为什么生成当前简介：
- Unknown

↓

Step9
为什么进入 Accepted：
- 保存状态：contentQualityStatus=accepted, repositoryStatus=accepted, sourceType=source-original
- 可证明原因：Unknown

↓

Step10
为什么进入 Feed（如果进入）：
- 进入 Feed 的可证明原因：accepted repository 中存在 feedReady onlineCoverAsset，imageCountryCodes 与路线国家有交集；Feed 还会受当前 cursor/random/quality 排序影响。

真正改变路线结果的输入：
- Unknown: 无法证明哪些输入改变了路线结果。

最后补上的标签/非决策字段：
- plannerReason：在路线骨架/concept 后写入；不证明它改变了国家、城市或天数。
- coverageContribution：由生成后的 country/destination 数量汇总；不是生成前输入。
- contentEvidence.provider/evidenceHash：主要是来源/缓存/溯源；一般不改变本条路线内容。
- designStrategies：可能参与 concept/validator，但 saved field 本身是输出记录；删除保存字段通常不改变已生成路线。

删除输入后的影响判断：
- Unknown

### Route: 绝命毒师拍摄地巡礼

- Route ID: `wikivoyage-141916`
- 抽样类别: Niche
- 可证明来源类型: Unknown
- 国家: US
- 目的地: 阿尔伯克基 > 圣菲 > 新墨西哥州 > 查科文化国家历史公园
- travelStyle: Unknown
- durationBand / days: Unknown / 8
- Feed: 无法证明进入当前 Feed ready pool

Decision Trace:

Step1
读取：
- Unknown: route source does not preserve enough pre-generation context.

↓

Step2
过滤：
- Unknown

↓

Step3
候选国家：
- 可证明保存结果：US
- 生成前完整候选国家池：Unknown（accepted route 未保存被扫描/被删除候选列表）。

↓

Step4
为什么保留这些国家：
- Unknown

↓

Step5
为什么删除其它国家：
- Unknown。当前 accepted route 没有保存 rejected alternatives；只能从代码知道可能原因包括 CN block、region 不合理、距离超限、pool 为空、dedupe 太近、cluster 饱和。

↓

Step6
为什么生成当前标题：
- Unknown

↓

Step7
为什么生成当前主题：
- buildRouteConcept/context.theme/travelStyle 生成主题；themes=经典旅行。

↓

Step8
为什么生成当前简介：
- Unknown

↓

Step9
为什么进入 Accepted：
- 保存状态：contentQualityStatus=accepted, repositoryStatus=accepted, sourceType=source-original
- 可证明原因：Unknown

↓

Step10
为什么进入 Feed（如果进入）：
- 未进入或无法证明进入 Feed：没有通过当前报告可验证的 feedReady + onlineCoverAsset 国家匹配。

真正改变路线结果的输入：
- Unknown: 无法证明哪些输入改变了路线结果。

最后补上的标签/非决策字段：
- plannerReason：在路线骨架/concept 后写入；不证明它改变了国家、城市或天数。
- coverageContribution：由生成后的 country/destination 数量汇总；不是生成前输入。
- contentEvidence.provider/evidenceHash：主要是来源/缓存/溯源；一般不改变本条路线内容。
- designStrategies：可能参与 concept/validator，但 saved field 本身是输出记录；删除保存字段通常不改变已生成路线。

删除输入后的影响判断：
- Unknown

### Route: 佛教圣地巡礼：追随佛陀足迹

- Route ID: `wikivoyage-186361`
- 抽样类别: Niche
- 可证明来源类型: Unknown
- 国家: IN + AF + VN
- 目的地: 拘尸那揭罗 > 鹿野苑 > 南亚 > 东南亚
- travelStyle: Unknown
- durationBand / days: Unknown / 8
- Feed: 可证明进入当前 Feed ready pool 的候选

Decision Trace:

Step1
读取：
- Unknown: route source does not preserve enough pre-generation context.

↓

Step2
过滤：
- Unknown

↓

Step3
候选国家：
- 可证明保存结果：IN + AF + VN
- 生成前完整候选国家池：Unknown（accepted route 未保存被扫描/被删除候选列表）。

↓

Step4
为什么保留这些国家：
- Unknown

↓

Step5
为什么删除其它国家：
- Unknown。当前 accepted route 没有保存 rejected alternatives；只能从代码知道可能原因包括 CN block、region 不合理、距离超限、pool 为空、dedupe 太近、cluster 饱和。

↓

Step6
为什么生成当前标题：
- Unknown

↓

Step7
为什么生成当前主题：
- buildRouteConcept/context.theme/travelStyle 生成主题；themes=经典旅行+宗教文化+历史遗迹。

↓

Step8
为什么生成当前简介：
- Unknown

↓

Step9
为什么进入 Accepted：
- 保存状态：contentQualityStatus=accepted, repositoryStatus=accepted, sourceType=source-original
- 可证明原因：Unknown

↓

Step10
为什么进入 Feed（如果进入）：
- 进入 Feed 的可证明原因：accepted repository 中存在 feedReady onlineCoverAsset，imageCountryCodes 与路线国家有交集；Feed 还会受当前 cursor/random/quality 排序影响。

真正改变路线结果的输入：
- Unknown: 无法证明哪些输入改变了路线结果。

最后补上的标签/非决策字段：
- plannerReason：在路线骨架/concept 后写入；不证明它改变了国家、城市或天数。
- coverageContribution：由生成后的 country/destination 数量汇总；不是生成前输入。
- contentEvidence.provider/evidenceHash：主要是来源/缓存/溯源；一般不改变本条路线内容。
- designStrategies：可能参与 concept/validator，但 saved field 本身是输出记录；删除保存字段通常不改变已生成路线。

删除输入后的影响判断：
- Unknown

### Route: 希腊8天经典跳岛：雅典

- Route ID: `planner-designed-::::::Q1524|Q203715|anchor:GR:naxos|anchor:GR:paros::8天::Island Hopping::::Q1524>Q203715>anchor:GR:naxos>anchor:GR:paros`
- 抽样类别: Niche
- 可证明来源类型: Planner Pipeline
- 国家: GR
- 目的地: 雅典 > 圣托里尼 > 纳克索斯 > 帕罗斯
- travelStyle: island-hopping
- durationBand / days: Unknown / 8
- Feed: 无法证明进入当前 Feed ready pool

Decision Trace:

Step1
读取：
- Knowledge Graph: selectDestinationPool/buildRouteSkeleton reads KG pool; proven by destinationSource/sourceType/contentEvidence provider when present
- context country/travelStyle/duration: partially recoverable from saved route only: countries=GR, travelStyle=island-hopping, durationBand=Unknown
- destinationEntities=雅典 > 圣托里尼 > 纳克索斯 > 帕罗斯
- bestMonths/season=3-5月+10-11月
- designStrategies saved=Geographic+Efficiency+Theme+Transport
- LLM refine: only if llmRefine.refined=true; otherwise deterministic fallback. Saved value=null
- Tavily/Web evidence: only if evidenceCollect or provenance evidence proves it; current saved route usually does not preserve per-route Tavily input.

↓

Step2
过滤：
- pool 为空会 rejected；skeleton 少于 2 会 rejected；decisionTests 高严重边界会 rejected；validatePlannerCandidate 会 rejected；dedupeDistance 和 countryClusterSaturated 会 rejected。

↓

Step3
候选国家：
- 可证明保存结果：GR
- 生成前完整候选国家池：Unknown（accepted route 未保存被扫描/被删除候选列表）。

↓

Step4
为什么保留这些国家：
- 因为 KG pool + skeleton/refine/validator/dedupe 后留下这些国家；具体竞争候选 Unknown。

↓

Step5
为什么删除其它国家：
- Unknown。当前 accepted route 没有保存 rejected alternatives；只能从代码知道可能原因包括 CN block、region 不合理、距离超限、pool 为空、dedupe 太近、cluster 饱和。

↓

Step6
为什么生成当前标题：
- route title：buildPlannerRecord 读取国家、destination places、styleLabel、days 拼接；当前标题=希腊8天经典跳岛：雅典。

↓

Step7
为什么生成当前主题：
- buildRouteConcept/context.theme/travelStyle 生成主题；themes=海岛跳岛。

↓

Step8
为什么生成当前简介：
- route summary：buildPlannerRecord 读取 styleLabelZh 和 places 模板生成；是否 LLM 改写 Unknown，除非 llmRefine 字段证明。

↓

Step9
为什么进入 Accepted：
- 保存状态：contentQualityStatus=accepted, repositoryStatus=accepted, sourceType=planner-designed
- 可证明原因：route-composition-planner validatePlannerCandidate 通过后 accepted.push；后续 repository 写入。具体当次 validation log 未逐条保留。

↓

Step10
为什么进入 Feed（如果进入）：
- 未进入或无法证明进入 Feed：没有通过当前报告可验证的 feedReady + onlineCoverAsset 国家匹配。

真正改变路线结果的输入：
- 国家组合：runPipeline context.country/context.countries + KG query 决定候选池；当前保存结果为 GR，原始候选国家 Unknown。
- 城市/景点：selectDestinationPool/buildRouteSkeleton/可选 LLM refine 共同决定；保存目的地为 雅典 > 圣托里尼 > 纳克索斯 > 帕罗斯。
- 天数：buildRouteConcept + context.durationDays/destinationCount 决定；保存为 8。
- travelStyle：context.travelStyle 可覆盖 concept.travelStyle；保存为 island-hopping。
- route title：buildPlannerRecord 读取国家、destination places、styleLabel、days 拼接；当前标题=希腊8天经典跳岛：雅典。
- route summary：buildPlannerRecord 读取 styleLabelZh 和 places 模板生成；是否 LLM 改写 Unknown，除非 llmRefine 字段证明。

最后补上的标签/非决策字段：
- plannerReason：在路线骨架/concept 后写入；不证明它改变了国家、城市或天数。
- coverageContribution：由生成后的 country/destination 数量汇总；不是生成前输入。
- contentEvidence.provider/evidenceHash：主要是来源/缓存/溯源；一般不改变本条路线内容。
- designStrategies：可能参与 concept/validator，但 saved field 本身是输出记录；删除保存字段通常不改变已生成路线。

删除输入后的影响判断：
- 删除 context country/travelStyle/duration：会改变 KG query、concept 或生成失败。★★★★★
- 删除 Knowledge Graph：selectDestinationPool 为空时会 reject。★★★★★
- 删除 LLM refine：若 llmRefine.refined=true，可能改变顺序/取舍；否则不会。当前本条证据见 llmRefine 字段。
- 删除 Tavily/Web evidence：只在 missingSegments 且 webEvidencePipeline 存在时影响 evidence refs；是否改变骨架通常不会。当前本条多为 Unknown。
- 删除 plannerReason/coverageContribution：不会改变已生成路线内容。☆

### Route: 日本12天延展朝圣：德岛

- Route ID: `planner-designed-::::::anchor:JP:kochi|anchor:JP:matsuyama|anchor:JP:takamatsu|anchor:JP:tokushima::12天::Pilgrimage::::anchor:JP:tokushima>anchor:JP:kochi>anchor:JP:matsuyama>anchor:JP:takamatsu`
- 抽样类别: Niche
- 可证明来源类型: Planner Pipeline
- 国家: JP
- 目的地: 德岛 > 高知 > 松山 > 高松
- travelStyle: pilgrimage
- durationBand / days: 10-14d / 12
- Feed: 可证明进入当前 Feed ready pool 的候选

Decision Trace:

Step1
读取：
- Knowledge Graph: selectDestinationPool/buildRouteSkeleton reads KG pool; proven by destinationSource/sourceType/contentEvidence provider when present
- context country/travelStyle/duration: partially recoverable from saved route only: countries=JP, travelStyle=pilgrimage, durationBand=10-14d
- destinationEntities=德岛 > 高知 > 松山 > 高松
- bestMonths/season=3-5月+9-11月
- designStrategies saved=Geographic+Efficiency+Theme
- LLM refine: only if llmRefine.refined=true; otherwise deterministic fallback. Saved value=null
- Tavily/Web evidence: only if evidenceCollect or provenance evidence proves it; current saved route usually does not preserve per-route Tavily input.

↓

Step2
过滤：
- pool 为空会 rejected；skeleton 少于 2 会 rejected；decisionTests 高严重边界会 rejected；validatePlannerCandidate 会 rejected；dedupeDistance 和 countryClusterSaturated 会 rejected。

↓

Step3
候选国家：
- 可证明保存结果：JP
- 生成前完整候选国家池：Unknown（accepted route 未保存被扫描/被删除候选列表）。

↓

Step4
为什么保留这些国家：
- 因为 KG pool + skeleton/refine/validator/dedupe 后留下这些国家；具体竞争候选 Unknown。

↓

Step5
为什么删除其它国家：
- Unknown。当前 accepted route 没有保存 rejected alternatives；只能从代码知道可能原因包括 CN block、region 不合理、距离超限、pool 为空、dedupe 太近、cluster 饱和。

↓

Step6
为什么生成当前标题：
- route title：buildPlannerRecord 读取国家、destination places、styleLabel、days 拼接；当前标题=日本12天延展朝圣：德岛。

↓

Step7
为什么生成当前主题：
- buildRouteConcept/context.theme/travelStyle 生成主题；themes=朝圣巡礼。

↓

Step8
为什么生成当前简介：
- route summary：buildPlannerRecord 读取 styleLabelZh 和 places 模板生成；是否 LLM 改写 Unknown，除非 llmRefine 字段证明。

↓

Step9
为什么进入 Accepted：
- 保存状态：contentQualityStatus=accepted, repositoryStatus=accepted, sourceType=planner-designed
- 可证明原因：route-composition-planner validatePlannerCandidate 通过后 accepted.push；后续 repository 写入。具体当次 validation log 未逐条保留。

↓

Step10
为什么进入 Feed（如果进入）：
- 进入 Feed 的可证明原因：accepted repository 中存在 feedReady onlineCoverAsset，imageCountryCodes 与路线国家有交集；Feed 还会受当前 cursor/random/quality 排序影响。

真正改变路线结果的输入：
- 国家组合：runPipeline context.country/context.countries + KG query 决定候选池；当前保存结果为 JP，原始候选国家 Unknown。
- 城市/景点：selectDestinationPool/buildRouteSkeleton/可选 LLM refine 共同决定；保存目的地为 德岛 > 高知 > 松山 > 高松。
- 天数：buildRouteConcept + context.durationDays/destinationCount 决定；保存为 12。
- travelStyle：context.travelStyle 可覆盖 concept.travelStyle；保存为 pilgrimage。
- route title：buildPlannerRecord 读取国家、destination places、styleLabel、days 拼接；当前标题=日本12天延展朝圣：德岛。
- route summary：buildPlannerRecord 读取 styleLabelZh 和 places 模板生成；是否 LLM 改写 Unknown，除非 llmRefine 字段证明。

最后补上的标签/非决策字段：
- plannerReason：在路线骨架/concept 后写入；不证明它改变了国家、城市或天数。
- coverageContribution：由生成后的 country/destination 数量汇总；不是生成前输入。
- contentEvidence.provider/evidenceHash：主要是来源/缓存/溯源；一般不改变本条路线内容。
- designStrategies：可能参与 concept/validator，但 saved field 本身是输出记录；删除保存字段通常不改变已生成路线。

删除输入后的影响判断：
- 删除 context country/travelStyle/duration：会改变 KG query、concept 或生成失败。★★★★★
- 删除 Knowledge Graph：selectDestinationPool 为空时会 reject。★★★★★
- 删除 LLM refine：若 llmRefine.refined=true，可能改变顺序/取舍；否则不会。当前本条证据见 llmRefine 字段。
- 删除 Tavily/Web evidence：只在 missingSegments 且 webEvidencePipeline 存在时影响 evidence refs；是否改变骨架通常不会。当前本条多为 Unknown。
- 删除 plannerReason/coverageContribution：不会改变已生成路线内容。☆

### Route: 希腊跳岛

- Route ID: `gold-case-accepted-gold-9-greece-island-hopping`
- 抽样类别: Niche
- 可证明来源类型: Planner Pipeline
- 国家: GR
- 目的地: 雅典 > 圣托里尼 > 纳克索斯 > 帕罗斯
- travelStyle: island-hopping
- durationBand / days: 7-10d / 8
- Feed: 可证明进入当前 Feed ready pool 的候选

Decision Trace:

Step1
读取：
- Knowledge Graph: selectDestinationPool/buildRouteSkeleton reads KG pool; proven by destinationSource/sourceType/contentEvidence provider when present
- context country/travelStyle/duration: partially recoverable from saved route only: countries=GR, travelStyle=island-hopping, durationBand=7-10d
- destinationEntities=雅典 > 圣托里尼 > 纳克索斯 > 帕罗斯
- bestMonths/season=5-9月
- designStrategies saved=Theme
- LLM refine: only if llmRefine.refined=true; otherwise deterministic fallback. Saved value=null
- Tavily/Web evidence: only if evidenceCollect or provenance evidence proves it; current saved route usually does not preserve per-route Tavily input.

↓

Step2
过滤：
- pool 为空会 rejected；skeleton 少于 2 会 rejected；decisionTests 高严重边界会 rejected；validatePlannerCandidate 会 rejected；dedupeDistance 和 countryClusterSaturated 会 rejected。

↓

Step3
候选国家：
- 可证明保存结果：GR
- 生成前完整候选国家池：Unknown（accepted route 未保存被扫描/被删除候选列表）。

↓

Step4
为什么保留这些国家：
- 因为 KG pool + skeleton/refine/validator/dedupe 后留下这些国家；具体竞争候选 Unknown。

↓

Step5
为什么删除其它国家：
- Unknown。当前 accepted route 没有保存 rejected alternatives；只能从代码知道可能原因包括 CN block、region 不合理、距离超限、pool 为空、dedupe 太近、cluster 饱和。

↓

Step6
为什么生成当前标题：
- route title：buildPlannerRecord 读取国家、destination places、styleLabel、days 拼接；当前标题=希腊跳岛。

↓

Step7
为什么生成当前主题：
- buildRouteConcept/context.theme/travelStyle 生成主题；themes=跳岛旅行。

↓

Step8
为什么生成当前简介：
- route summary：buildPlannerRecord 读取 styleLabelZh 和 places 模板生成；是否 LLM 改写 Unknown，除非 llmRefine 字段证明。

↓

Step9
为什么进入 Accepted：
- 保存状态：contentQualityStatus=accepted, repositoryStatus=mediaReady, sourceType=planner-designed
- 可证明原因：route-composition-planner validatePlannerCandidate 通过后 accepted.push；后续 repository 写入。具体当次 validation log 未逐条保留。

↓

Step10
为什么进入 Feed（如果进入）：
- 进入 Feed 的可证明原因：accepted repository 中存在 feedReady onlineCoverAsset，imageCountryCodes 与路线国家有交集；Feed 还会受当前 cursor/random/quality 排序影响。

真正改变路线结果的输入：
- 国家组合：runPipeline context.country/context.countries + KG query 决定候选池；当前保存结果为 GR，原始候选国家 Unknown。
- 城市/景点：selectDestinationPool/buildRouteSkeleton/可选 LLM refine 共同决定；保存目的地为 雅典 > 圣托里尼 > 纳克索斯 > 帕罗斯。
- 天数：buildRouteConcept + context.durationDays/destinationCount 决定；保存为 8。
- travelStyle：context.travelStyle 可覆盖 concept.travelStyle；保存为 island-hopping。
- route title：buildPlannerRecord 读取国家、destination places、styleLabel、days 拼接；当前标题=希腊跳岛。
- route summary：buildPlannerRecord 读取 styleLabelZh 和 places 模板生成；是否 LLM 改写 Unknown，除非 llmRefine 字段证明。

最后补上的标签/非决策字段：
- plannerReason：在路线骨架/concept 后写入；不证明它改变了国家、城市或天数。
- coverageContribution：由生成后的 country/destination 数量汇总；不是生成前输入。
- contentEvidence.provider/evidenceHash：主要是来源/缓存/溯源；一般不改变本条路线内容。
- designStrategies：可能参与 concept/validator，但 saved field 本身是输出记录；删除保存字段通常不改变已生成路线。

删除输入后的影响判断：
- 删除 context country/travelStyle/duration：会改变 KG query、concept 或生成失败。★★★★★
- 删除 Knowledge Graph：selectDestinationPool 为空时会 reject。★★★★★
- 删除 LLM refine：若 llmRefine.refined=true，可能改变顺序/取舍；否则不会。当前本条证据见 llmRefine 字段。
- 删除 Tavily/Web evidence：只在 missingSegments 且 webEvidencePipeline 存在时影响 evidence refs；是否改变骨架通常不会。当前本条多为 Unknown。
- 删除 plannerReason/coverageContribution：不会改变已生成路线内容。☆

### Route: 克罗地亚跳岛

- Route ID: `gold-case-accepted-gold-c45-32-croatian-islands`
- 抽样类别: Niche
- 可证明来源类型: Planner Pipeline
- 国家: HR
- 目的地: 斯普利特 > 布拉奇岛 > 赫瓦尔岛 > 科尔丘拉岛 > 杜布罗夫尼克
- travelStyle: island-hopping
- durationBand / days: 7-10d / 8
- Feed: 可证明进入当前 Feed ready pool 的候选

Decision Trace:

Step1
读取：
- Knowledge Graph: selectDestinationPool/buildRouteSkeleton reads KG pool; proven by destinationSource/sourceType/contentEvidence provider when present
- context country/travelStyle/duration: partially recoverable from saved route only: countries=HR, travelStyle=island-hopping, durationBand=7-10d
- destinationEntities=斯普利特 > 布拉奇岛 > 赫瓦尔岛 > 科尔丘拉岛 > 杜布罗夫尼克
- bestMonths/season=5-9月
- designStrategies saved=Theme
- LLM refine: only if llmRefine.refined=true; otherwise deterministic fallback. Saved value=null
- Tavily/Web evidence: only if evidenceCollect or provenance evidence proves it; current saved route usually does not preserve per-route Tavily input.

↓

Step2
过滤：
- pool 为空会 rejected；skeleton 少于 2 会 rejected；decisionTests 高严重边界会 rejected；validatePlannerCandidate 会 rejected；dedupeDistance 和 countryClusterSaturated 会 rejected。

↓

Step3
候选国家：
- 可证明保存结果：HR
- 生成前完整候选国家池：Unknown（accepted route 未保存被扫描/被删除候选列表）。

↓

Step4
为什么保留这些国家：
- 因为 KG pool + skeleton/refine/validator/dedupe 后留下这些国家；具体竞争候选 Unknown。

↓

Step5
为什么删除其它国家：
- Unknown。当前 accepted route 没有保存 rejected alternatives；只能从代码知道可能原因包括 CN block、region 不合理、距离超限、pool 为空、dedupe 太近、cluster 饱和。

↓

Step6
为什么生成当前标题：
- route title：buildPlannerRecord 读取国家、destination places、styleLabel、days 拼接；当前标题=克罗地亚跳岛。

↓

Step7
为什么生成当前主题：
- buildRouteConcept/context.theme/travelStyle 生成主题；themes=跳岛旅行。

↓

Step8
为什么生成当前简介：
- route summary：buildPlannerRecord 读取 styleLabelZh 和 places 模板生成；是否 LLM 改写 Unknown，除非 llmRefine 字段证明。

↓

Step9
为什么进入 Accepted：
- 保存状态：contentQualityStatus=accepted, repositoryStatus=mediaReady, sourceType=planner-designed
- 可证明原因：route-composition-planner validatePlannerCandidate 通过后 accepted.push；后续 repository 写入。具体当次 validation log 未逐条保留。

↓

Step10
为什么进入 Feed（如果进入）：
- 进入 Feed 的可证明原因：accepted repository 中存在 feedReady onlineCoverAsset，imageCountryCodes 与路线国家有交集；Feed 还会受当前 cursor/random/quality 排序影响。

真正改变路线结果的输入：
- 国家组合：runPipeline context.country/context.countries + KG query 决定候选池；当前保存结果为 HR，原始候选国家 Unknown。
- 城市/景点：selectDestinationPool/buildRouteSkeleton/可选 LLM refine 共同决定；保存目的地为 斯普利特 > 布拉奇岛 > 赫瓦尔岛 > 科尔丘拉岛 > 杜布罗夫尼克。
- 天数：buildRouteConcept + context.durationDays/destinationCount 决定；保存为 8。
- travelStyle：context.travelStyle 可覆盖 concept.travelStyle；保存为 island-hopping。
- route title：buildPlannerRecord 读取国家、destination places、styleLabel、days 拼接；当前标题=克罗地亚跳岛。
- route summary：buildPlannerRecord 读取 styleLabelZh 和 places 模板生成；是否 LLM 改写 Unknown，除非 llmRefine 字段证明。

最后补上的标签/非决策字段：
- plannerReason：在路线骨架/concept 后写入；不证明它改变了国家、城市或天数。
- coverageContribution：由生成后的 country/destination 数量汇总；不是生成前输入。
- contentEvidence.provider/evidenceHash：主要是来源/缓存/溯源；一般不改变本条路线内容。
- designStrategies：可能参与 concept/validator，但 saved field 本身是输出记录；删除保存字段通常不改变已生成路线。

删除输入后的影响判断：
- 删除 context country/travelStyle/duration：会改变 KG query、concept 或生成失败。★★★★★
- 删除 Knowledge Graph：selectDestinationPool 为空时会 reject。★★★★★
- 删除 LLM refine：若 llmRefine.refined=true，可能改变顺序/取舍；否则不会。当前本条证据见 llmRefine 字段。
- 删除 Tavily/Web evidence：只在 missingSegments 且 webEvidencePipeline 存在时影响 evidence refs；是否改变骨架通常不会。当前本条多为 Unknown。
- 删除 plannerReason/coverageContribution：不会改变已生成路线内容。☆

### Route: 菲律宾巴拉望跳岛

- Route ID: `gold-case-accepted-gold-c45-33-philippines-palawan`
- 抽样类别: Niche
- 可证明来源类型: Planner Pipeline
- 国家: PH
- 目的地: 公主港 > 爱妮岛 > 科隆 > 布桑加
- travelStyle: island-hopping
- durationBand / days: 7-10d / 8
- Feed: 无法证明进入当前 Feed ready pool

Decision Trace:

Step1
读取：
- Knowledge Graph: selectDestinationPool/buildRouteSkeleton reads KG pool; proven by destinationSource/sourceType/contentEvidence provider when present
- context country/travelStyle/duration: partially recoverable from saved route only: countries=PH, travelStyle=island-hopping, durationBand=7-10d
- destinationEntities=公主港 > 爱妮岛 > 科隆 > 布桑加
- bestMonths/season=11-5月
- designStrategies saved=Theme
- LLM refine: only if llmRefine.refined=true; otherwise deterministic fallback. Saved value=null
- Tavily/Web evidence: only if evidenceCollect or provenance evidence proves it; current saved route usually does not preserve per-route Tavily input.

↓

Step2
过滤：
- pool 为空会 rejected；skeleton 少于 2 会 rejected；decisionTests 高严重边界会 rejected；validatePlannerCandidate 会 rejected；dedupeDistance 和 countryClusterSaturated 会 rejected。

↓

Step3
候选国家：
- 可证明保存结果：PH
- 生成前完整候选国家池：Unknown（accepted route 未保存被扫描/被删除候选列表）。

↓

Step4
为什么保留这些国家：
- 因为 KG pool + skeleton/refine/validator/dedupe 后留下这些国家；具体竞争候选 Unknown。

↓

Step5
为什么删除其它国家：
- Unknown。当前 accepted route 没有保存 rejected alternatives；只能从代码知道可能原因包括 CN block、region 不合理、距离超限、pool 为空、dedupe 太近、cluster 饱和。

↓

Step6
为什么生成当前标题：
- route title：buildPlannerRecord 读取国家、destination places、styleLabel、days 拼接；当前标题=菲律宾巴拉望跳岛。

↓

Step7
为什么生成当前主题：
- buildRouteConcept/context.theme/travelStyle 生成主题；themes=跳岛旅行。

↓

Step8
为什么生成当前简介：
- route summary：buildPlannerRecord 读取 styleLabelZh 和 places 模板生成；是否 LLM 改写 Unknown，除非 llmRefine 字段证明。

↓

Step9
为什么进入 Accepted：
- 保存状态：contentQualityStatus=accepted, repositoryStatus=mediaReady, sourceType=planner-designed
- 可证明原因：route-composition-planner validatePlannerCandidate 通过后 accepted.push；后续 repository 写入。具体当次 validation log 未逐条保留。

↓

Step10
为什么进入 Feed（如果进入）：
- 未进入或无法证明进入 Feed：没有通过当前报告可验证的 feedReady + onlineCoverAsset 国家匹配。

真正改变路线结果的输入：
- 国家组合：runPipeline context.country/context.countries + KG query 决定候选池；当前保存结果为 PH，原始候选国家 Unknown。
- 城市/景点：selectDestinationPool/buildRouteSkeleton/可选 LLM refine 共同决定；保存目的地为 公主港 > 爱妮岛 > 科隆 > 布桑加。
- 天数：buildRouteConcept + context.durationDays/destinationCount 决定；保存为 8。
- travelStyle：context.travelStyle 可覆盖 concept.travelStyle；保存为 island-hopping。
- route title：buildPlannerRecord 读取国家、destination places、styleLabel、days 拼接；当前标题=菲律宾巴拉望跳岛。
- route summary：buildPlannerRecord 读取 styleLabelZh 和 places 模板生成；是否 LLM 改写 Unknown，除非 llmRefine 字段证明。

最后补上的标签/非决策字段：
- plannerReason：在路线骨架/concept 后写入；不证明它改变了国家、城市或天数。
- coverageContribution：由生成后的 country/destination 数量汇总；不是生成前输入。
- contentEvidence.provider/evidenceHash：主要是来源/缓存/溯源；一般不改变本条路线内容。
- designStrategies：可能参与 concept/validator，但 saved field 本身是输出记录；删除保存字段通常不改变已生成路线。

删除输入后的影响判断：
- 删除 context country/travelStyle/duration：会改变 KG query、concept 或生成失败。★★★★★
- 删除 Knowledge Graph：selectDestinationPool 为空时会 reject。★★★★★
- 删除 LLM refine：若 llmRefine.refined=true，可能改变顺序/取舍；否则不会。当前本条证据见 llmRefine 字段。
- 删除 Tavily/Web evidence：只在 missingSegments 且 webEvidencePipeline 存在时影响 evidence refs；是否改变骨架通常不会。当前本条多为 Unknown。
- 删除 plannerReason/coverageContribution：不会改变已生成路线内容。☆

### Route: 亚速尔群岛跳岛

- Route ID: `gold-case-accepted-gold-c45-34-azores-islands`
- 抽样类别: Niche
- 可证明来源类型: Planner Pipeline
- 国家: PT
- 目的地: 圣米格尔岛 > 法亚尔岛 > 皮库岛
- travelStyle: island-hopping
- durationBand / days: 7-10d / 9
- Feed: 可证明进入当前 Feed ready pool 的候选

Decision Trace:

Step1
读取：
- Knowledge Graph: selectDestinationPool/buildRouteSkeleton reads KG pool; proven by destinationSource/sourceType/contentEvidence provider when present
- context country/travelStyle/duration: partially recoverable from saved route only: countries=PT, travelStyle=island-hopping, durationBand=7-10d
- destinationEntities=圣米格尔岛 > 法亚尔岛 > 皮库岛
- bestMonths/season=5-9月
- designStrategies saved=Theme
- LLM refine: only if llmRefine.refined=true; otherwise deterministic fallback. Saved value=null
- Tavily/Web evidence: only if evidenceCollect or provenance evidence proves it; current saved route usually does not preserve per-route Tavily input.

↓

Step2
过滤：
- pool 为空会 rejected；skeleton 少于 2 会 rejected；decisionTests 高严重边界会 rejected；validatePlannerCandidate 会 rejected；dedupeDistance 和 countryClusterSaturated 会 rejected。

↓

Step3
候选国家：
- 可证明保存结果：PT
- 生成前完整候选国家池：Unknown（accepted route 未保存被扫描/被删除候选列表）。

↓

Step4
为什么保留这些国家：
- 因为 KG pool + skeleton/refine/validator/dedupe 后留下这些国家；具体竞争候选 Unknown。

↓

Step5
为什么删除其它国家：
- Unknown。当前 accepted route 没有保存 rejected alternatives；只能从代码知道可能原因包括 CN block、region 不合理、距离超限、pool 为空、dedupe 太近、cluster 饱和。

↓

Step6
为什么生成当前标题：
- route title：buildPlannerRecord 读取国家、destination places、styleLabel、days 拼接；当前标题=亚速尔群岛跳岛。

↓

Step7
为什么生成当前主题：
- buildRouteConcept/context.theme/travelStyle 生成主题；themes=跳岛旅行。

↓

Step8
为什么生成当前简介：
- route summary：buildPlannerRecord 读取 styleLabelZh 和 places 模板生成；是否 LLM 改写 Unknown，除非 llmRefine 字段证明。

↓

Step9
为什么进入 Accepted：
- 保存状态：contentQualityStatus=accepted, repositoryStatus=mediaReady, sourceType=planner-designed
- 可证明原因：route-composition-planner validatePlannerCandidate 通过后 accepted.push；后续 repository 写入。具体当次 validation log 未逐条保留。

↓

Step10
为什么进入 Feed（如果进入）：
- 进入 Feed 的可证明原因：accepted repository 中存在 feedReady onlineCoverAsset，imageCountryCodes 与路线国家有交集；Feed 还会受当前 cursor/random/quality 排序影响。

真正改变路线结果的输入：
- 国家组合：runPipeline context.country/context.countries + KG query 决定候选池；当前保存结果为 PT，原始候选国家 Unknown。
- 城市/景点：selectDestinationPool/buildRouteSkeleton/可选 LLM refine 共同决定；保存目的地为 圣米格尔岛 > 法亚尔岛 > 皮库岛。
- 天数：buildRouteConcept + context.durationDays/destinationCount 决定；保存为 9。
- travelStyle：context.travelStyle 可覆盖 concept.travelStyle；保存为 island-hopping。
- route title：buildPlannerRecord 读取国家、destination places、styleLabel、days 拼接；当前标题=亚速尔群岛跳岛。
- route summary：buildPlannerRecord 读取 styleLabelZh 和 places 模板生成；是否 LLM 改写 Unknown，除非 llmRefine 字段证明。

最后补上的标签/非决策字段：
- plannerReason：在路线骨架/concept 后写入；不证明它改变了国家、城市或天数。
- coverageContribution：由生成后的 country/destination 数量汇总；不是生成前输入。
- contentEvidence.provider/evidenceHash：主要是来源/缓存/溯源；一般不改变本条路线内容。
- designStrategies：可能参与 concept/validator，但 saved field 本身是输出记录；删除保存字段通常不改变已生成路线。

删除输入后的影响判断：
- 删除 context country/travelStyle/duration：会改变 KG query、concept 或生成失败。★★★★★
- 删除 Knowledge Graph：selectDestinationPool 为空时会 reject。★★★★★
- 删除 LLM refine：若 llmRefine.refined=true，可能改变顺序/取舍；否则不会。当前本条证据见 llmRefine 字段。
- 删除 Tavily/Web evidence：只在 missingSegments 且 webEvidencePipeline 存在时影响 evidence refs；是否改变骨架通常不会。当前本条多为 Unknown。
- 删除 plannerReason/coverageContribution：不会改变已生成路线内容。☆

### Route: 夏威夷群岛跳岛

- Route ID: `gold-case-accepted-gold-c45-35-hawaii-island-journey`
- 抽样类别: Niche
- 可证明来源类型: Planner Pipeline
- 国家: US
- 目的地: 欧胡岛 > 茂宜岛 > 夏威夷大岛
- travelStyle: island-hopping
- durationBand / days: 7-10d / 10
- Feed: 可证明进入当前 Feed ready pool 的候选

Decision Trace:

Step1
读取：
- Knowledge Graph: selectDestinationPool/buildRouteSkeleton reads KG pool; proven by destinationSource/sourceType/contentEvidence provider when present
- context country/travelStyle/duration: partially recoverable from saved route only: countries=US, travelStyle=island-hopping, durationBand=7-10d
- destinationEntities=欧胡岛 > 茂宜岛 > 夏威夷大岛
- bestMonths/season=4-10月
- designStrategies saved=Theme
- LLM refine: only if llmRefine.refined=true; otherwise deterministic fallback. Saved value=null
- Tavily/Web evidence: only if evidenceCollect or provenance evidence proves it; current saved route usually does not preserve per-route Tavily input.

↓

Step2
过滤：
- pool 为空会 rejected；skeleton 少于 2 会 rejected；decisionTests 高严重边界会 rejected；validatePlannerCandidate 会 rejected；dedupeDistance 和 countryClusterSaturated 会 rejected。

↓

Step3
候选国家：
- 可证明保存结果：US
- 生成前完整候选国家池：Unknown（accepted route 未保存被扫描/被删除候选列表）。

↓

Step4
为什么保留这些国家：
- 因为 KG pool + skeleton/refine/validator/dedupe 后留下这些国家；具体竞争候选 Unknown。

↓

Step5
为什么删除其它国家：
- Unknown。当前 accepted route 没有保存 rejected alternatives；只能从代码知道可能原因包括 CN block、region 不合理、距离超限、pool 为空、dedupe 太近、cluster 饱和。

↓

Step6
为什么生成当前标题：
- route title：buildPlannerRecord 读取国家、destination places、styleLabel、days 拼接；当前标题=夏威夷群岛跳岛。

↓

Step7
为什么生成当前主题：
- buildRouteConcept/context.theme/travelStyle 生成主题；themes=跳岛旅行。

↓

Step8
为什么生成当前简介：
- route summary：buildPlannerRecord 读取 styleLabelZh 和 places 模板生成；是否 LLM 改写 Unknown，除非 llmRefine 字段证明。

↓

Step9
为什么进入 Accepted：
- 保存状态：contentQualityStatus=accepted, repositoryStatus=mediaReady, sourceType=planner-designed
- 可证明原因：route-composition-planner validatePlannerCandidate 通过后 accepted.push；后续 repository 写入。具体当次 validation log 未逐条保留。

↓

Step10
为什么进入 Feed（如果进入）：
- 进入 Feed 的可证明原因：accepted repository 中存在 feedReady onlineCoverAsset，imageCountryCodes 与路线国家有交集；Feed 还会受当前 cursor/random/quality 排序影响。

真正改变路线结果的输入：
- 国家组合：runPipeline context.country/context.countries + KG query 决定候选池；当前保存结果为 US，原始候选国家 Unknown。
- 城市/景点：selectDestinationPool/buildRouteSkeleton/可选 LLM refine 共同决定；保存目的地为 欧胡岛 > 茂宜岛 > 夏威夷大岛。
- 天数：buildRouteConcept + context.durationDays/destinationCount 决定；保存为 10。
- travelStyle：context.travelStyle 可覆盖 concept.travelStyle；保存为 island-hopping。
- route title：buildPlannerRecord 读取国家、destination places、styleLabel、days 拼接；当前标题=夏威夷群岛跳岛。
- route summary：buildPlannerRecord 读取 styleLabelZh 和 places 模板生成；是否 LLM 改写 Unknown，除非 llmRefine 字段证明。

最后补上的标签/非决策字段：
- plannerReason：在路线骨架/concept 后写入；不证明它改变了国家、城市或天数。
- coverageContribution：由生成后的 country/destination 数量汇总；不是生成前输入。
- contentEvidence.provider/evidenceHash：主要是来源/缓存/溯源；一般不改变本条路线内容。
- designStrategies：可能参与 concept/validator，但 saved field 本身是输出记录；删除保存字段通常不改变已生成路线。

删除输入后的影响判断：
- 删除 context country/travelStyle/duration：会改变 KG query、concept 或生成失败。★★★★★
- 删除 Knowledge Graph：selectDestinationPool 为空时会 reject。★★★★★
- 删除 LLM refine：若 llmRefine.refined=true，可能改变顺序/取舍；否则不会。当前本条证据见 llmRefine 字段。
- 删除 Tavily/Web evidence：只在 missingSegments 且 webEvidencePipeline 存在时影响 evidence refs；是否改变骨架通常不会。当前本条多为 Unknown。
- 删除 plannerReason/coverageContribution：不会改变已生成路线内容。☆

### Route: 法国之路朝圣精选

- Route ID: `gold-case-accepted-gold-c45-37-camino-frances`
- 抽样类别: Niche
- 可证明来源类型: Planner Pipeline
- 国家: ES
- 目的地: 圣让皮耶德波尔 > 潘普洛纳 > 布尔戈斯 > 莱昂 > 圣地亚哥
- travelStyle: pilgrimage
- durationBand / days: 10-14d / 14
- Feed: 可证明进入当前 Feed ready pool 的候选

Decision Trace:

Step1
读取：
- Knowledge Graph: selectDestinationPool/buildRouteSkeleton reads KG pool; proven by destinationSource/sourceType/contentEvidence provider when present
- context country/travelStyle/duration: partially recoverable from saved route only: countries=ES, travelStyle=pilgrimage, durationBand=10-14d
- destinationEntities=圣让皮耶德波尔 > 潘普洛纳 > 布尔戈斯 > 莱昂 > 圣地亚哥
- bestMonths/season=4-6月+9-10月
- designStrategies saved=Theme
- LLM refine: only if llmRefine.refined=true; otherwise deterministic fallback. Saved value=null
- Tavily/Web evidence: only if evidenceCollect or provenance evidence proves it; current saved route usually does not preserve per-route Tavily input.

↓

Step2
过滤：
- pool 为空会 rejected；skeleton 少于 2 会 rejected；decisionTests 高严重边界会 rejected；validatePlannerCandidate 会 rejected；dedupeDistance 和 countryClusterSaturated 会 rejected。

↓

Step3
候选国家：
- 可证明保存结果：ES
- 生成前完整候选国家池：Unknown（accepted route 未保存被扫描/被删除候选列表）。

↓

Step4
为什么保留这些国家：
- 因为 KG pool + skeleton/refine/validator/dedupe 后留下这些国家；具体竞争候选 Unknown。

↓

Step5
为什么删除其它国家：
- Unknown。当前 accepted route 没有保存 rejected alternatives；只能从代码知道可能原因包括 CN block、region 不合理、距离超限、pool 为空、dedupe 太近、cluster 饱和。

↓

Step6
为什么生成当前标题：
- route title：buildPlannerRecord 读取国家、destination places、styleLabel、days 拼接；当前标题=法国之路朝圣精选。

↓

Step7
为什么生成当前主题：
- buildRouteConcept/context.theme/travelStyle 生成主题；themes=朝圣巡礼。

↓

Step8
为什么生成当前简介：
- route summary：buildPlannerRecord 读取 styleLabelZh 和 places 模板生成；是否 LLM 改写 Unknown，除非 llmRefine 字段证明。

↓

Step9
为什么进入 Accepted：
- 保存状态：contentQualityStatus=accepted, repositoryStatus=mediaReady, sourceType=planner-designed
- 可证明原因：route-composition-planner validatePlannerCandidate 通过后 accepted.push；后续 repository 写入。具体当次 validation log 未逐条保留。

↓

Step10
为什么进入 Feed（如果进入）：
- 进入 Feed 的可证明原因：accepted repository 中存在 feedReady onlineCoverAsset，imageCountryCodes 与路线国家有交集；Feed 还会受当前 cursor/random/quality 排序影响。

真正改变路线结果的输入：
- 国家组合：runPipeline context.country/context.countries + KG query 决定候选池；当前保存结果为 ES，原始候选国家 Unknown。
- 城市/景点：selectDestinationPool/buildRouteSkeleton/可选 LLM refine 共同决定；保存目的地为 圣让皮耶德波尔 > 潘普洛纳 > 布尔戈斯 > 莱昂 > 圣地亚哥。
- 天数：buildRouteConcept + context.durationDays/destinationCount 决定；保存为 14。
- travelStyle：context.travelStyle 可覆盖 concept.travelStyle；保存为 pilgrimage。
- route title：buildPlannerRecord 读取国家、destination places、styleLabel、days 拼接；当前标题=法国之路朝圣精选。
- route summary：buildPlannerRecord 读取 styleLabelZh 和 places 模板生成；是否 LLM 改写 Unknown，除非 llmRefine 字段证明。

最后补上的标签/非决策字段：
- plannerReason：在路线骨架/concept 后写入；不证明它改变了国家、城市或天数。
- coverageContribution：由生成后的 country/destination 数量汇总；不是生成前输入。
- contentEvidence.provider/evidenceHash：主要是来源/缓存/溯源；一般不改变本条路线内容。
- designStrategies：可能参与 concept/validator，但 saved field 本身是输出记录；删除保存字段通常不改变已生成路线。

删除输入后的影响判断：
- 删除 context country/travelStyle/duration：会改变 KG query、concept 或生成失败。★★★★★
- 删除 Knowledge Graph：selectDestinationPool 为空时会 reject。★★★★★
- 删除 LLM refine：若 llmRefine.refined=true，可能改变顺序/取舍；否则不会。当前本条证据见 llmRefine 字段。
- 删除 Tavily/Web evidence：只在 missingSegments 且 webEvidencePipeline 存在时影响 evidence refs；是否改变骨架通常不会。当前本条多为 Unknown。
- 删除 plannerReason/coverageContribution：不会改变已生成路线内容。☆

### Route: 熊野古道朝圣

- Route ID: `gold-case-accepted-gold-c45-38-kumano-kodo`
- 抽样类别: Niche
- 可证明来源类型: Planner Pipeline
- 国家: JP
- 目的地: 田边 > 发心门王子 > 熊野本宫大社 > 熊野速玉大社 > 熊野那智大社
- travelStyle: pilgrimage
- durationBand / days: 4-6d / 5
- Feed: 无法证明进入当前 Feed ready pool

Decision Trace:

Step1
读取：
- Knowledge Graph: selectDestinationPool/buildRouteSkeleton reads KG pool; proven by destinationSource/sourceType/contentEvidence provider when present
- context country/travelStyle/duration: partially recoverable from saved route only: countries=JP, travelStyle=pilgrimage, durationBand=4-6d
- destinationEntities=田边 > 发心门王子 > 熊野本宫大社 > 熊野速玉大社 > 熊野那智大社
- bestMonths/season=3-5月+10-11月
- designStrategies saved=Theme
- LLM refine: only if llmRefine.refined=true; otherwise deterministic fallback. Saved value=null
- Tavily/Web evidence: only if evidenceCollect or provenance evidence proves it; current saved route usually does not preserve per-route Tavily input.

↓

Step2
过滤：
- pool 为空会 rejected；skeleton 少于 2 会 rejected；decisionTests 高严重边界会 rejected；validatePlannerCandidate 会 rejected；dedupeDistance 和 countryClusterSaturated 会 rejected。

↓

Step3
候选国家：
- 可证明保存结果：JP
- 生成前完整候选国家池：Unknown（accepted route 未保存被扫描/被删除候选列表）。

↓

Step4
为什么保留这些国家：
- 因为 KG pool + skeleton/refine/validator/dedupe 后留下这些国家；具体竞争候选 Unknown。

↓

Step5
为什么删除其它国家：
- Unknown。当前 accepted route 没有保存 rejected alternatives；只能从代码知道可能原因包括 CN block、region 不合理、距离超限、pool 为空、dedupe 太近、cluster 饱和。

↓

Step6
为什么生成当前标题：
- route title：buildPlannerRecord 读取国家、destination places、styleLabel、days 拼接；当前标题=熊野古道朝圣。

↓

Step7
为什么生成当前主题：
- buildRouteConcept/context.theme/travelStyle 生成主题；themes=朝圣巡礼。

↓

Step8
为什么生成当前简介：
- route summary：buildPlannerRecord 读取 styleLabelZh 和 places 模板生成；是否 LLM 改写 Unknown，除非 llmRefine 字段证明。

↓

Step9
为什么进入 Accepted：
- 保存状态：contentQualityStatus=accepted, repositoryStatus=mediaReady, sourceType=planner-designed
- 可证明原因：route-composition-planner validatePlannerCandidate 通过后 accepted.push；后续 repository 写入。具体当次 validation log 未逐条保留。

↓

Step10
为什么进入 Feed（如果进入）：
- 未进入或无法证明进入 Feed：没有通过当前报告可验证的 feedReady + onlineCoverAsset 国家匹配。

真正改变路线结果的输入：
- 国家组合：runPipeline context.country/context.countries + KG query 决定候选池；当前保存结果为 JP，原始候选国家 Unknown。
- 城市/景点：selectDestinationPool/buildRouteSkeleton/可选 LLM refine 共同决定；保存目的地为 田边 > 发心门王子 > 熊野本宫大社 > 熊野速玉大社 > 熊野那智大社。
- 天数：buildRouteConcept + context.durationDays/destinationCount 决定；保存为 5。
- travelStyle：context.travelStyle 可覆盖 concept.travelStyle；保存为 pilgrimage。
- route title：buildPlannerRecord 读取国家、destination places、styleLabel、days 拼接；当前标题=熊野古道朝圣。
- route summary：buildPlannerRecord 读取 styleLabelZh 和 places 模板生成；是否 LLM 改写 Unknown，除非 llmRefine 字段证明。

最后补上的标签/非决策字段：
- plannerReason：在路线骨架/concept 后写入；不证明它改变了国家、城市或天数。
- coverageContribution：由生成后的 country/destination 数量汇总；不是生成前输入。
- contentEvidence.provider/evidenceHash：主要是来源/缓存/溯源；一般不改变本条路线内容。
- designStrategies：可能参与 concept/validator，但 saved field 本身是输出记录；删除保存字段通常不改变已生成路线。

删除输入后的影响判断：
- 删除 context country/travelStyle/duration：会改变 KG query、concept 或生成失败。★★★★★
- 删除 Knowledge Graph：selectDestinationPool 为空时会 reject。★★★★★
- 删除 LLM refine：若 llmRefine.refined=true，可能改变顺序/取舍；否则不会。当前本条证据见 llmRefine 字段。
- 删除 Tavily/Web evidence：只在 missingSegments 且 webEvidencePipeline 存在时影响 evidence refs；是否改变骨架通常不会。当前本条多为 Unknown。
- 删除 plannerReason/coverageContribution：不会改变已生成路线内容。☆

### Route: 法兰奇杰纳之路精选

- Route ID: `gold-case-accepted-gold-c45-39-via-francigena`
- 抽样类别: Niche
- 可证明来源类型: Planner Pipeline
- 国家: GB + FR + CH + IT
- 目的地: 坎特伯雷 > 兰斯 > 洛桑 > 奥斯塔 > 罗马
- travelStyle: pilgrimage
- durationBand / days: 10-14d / 14
- Feed: 可证明进入当前 Feed ready pool 的候选

Decision Trace:

Step1
读取：
- Knowledge Graph: selectDestinationPool/buildRouteSkeleton reads KG pool; proven by destinationSource/sourceType/contentEvidence provider when present
- context country/travelStyle/duration: partially recoverable from saved route only: countries=GB+FR+CH+IT, travelStyle=pilgrimage, durationBand=10-14d
- destinationEntities=坎特伯雷 > 兰斯 > 洛桑 > 奥斯塔 > 罗马
- bestMonths/season=5-9月
- designStrategies saved=Theme
- LLM refine: only if llmRefine.refined=true; otherwise deterministic fallback. Saved value=null
- Tavily/Web evidence: only if evidenceCollect or provenance evidence proves it; current saved route usually does not preserve per-route Tavily input.

↓

Step2
过滤：
- pool 为空会 rejected；skeleton 少于 2 会 rejected；decisionTests 高严重边界会 rejected；validatePlannerCandidate 会 rejected；dedupeDistance 和 countryClusterSaturated 会 rejected。

↓

Step3
候选国家：
- 可证明保存结果：GB + FR + CH + IT
- 生成前完整候选国家池：Unknown（accepted route 未保存被扫描/被删除候选列表）。

↓

Step4
为什么保留这些国家：
- 因为 KG pool + skeleton/refine/validator/dedupe 后留下这些国家；具体竞争候选 Unknown。

↓

Step5
为什么删除其它国家：
- Unknown。当前 accepted route 没有保存 rejected alternatives；只能从代码知道可能原因包括 CN block、region 不合理、距离超限、pool 为空、dedupe 太近、cluster 饱和。

↓

Step6
为什么生成当前标题：
- route title：buildPlannerRecord 读取国家、destination places、styleLabel、days 拼接；当前标题=法兰奇杰纳之路精选。

↓

Step7
为什么生成当前主题：
- buildRouteConcept/context.theme/travelStyle 生成主题；themes=朝圣巡礼。

↓

Step8
为什么生成当前简介：
- route summary：buildPlannerRecord 读取 styleLabelZh 和 places 模板生成；是否 LLM 改写 Unknown，除非 llmRefine 字段证明。

↓

Step9
为什么进入 Accepted：
- 保存状态：contentQualityStatus=accepted, repositoryStatus=mediaReady, sourceType=planner-designed
- 可证明原因：route-composition-planner validatePlannerCandidate 通过后 accepted.push；后续 repository 写入。具体当次 validation log 未逐条保留。

↓

Step10
为什么进入 Feed（如果进入）：
- 进入 Feed 的可证明原因：accepted repository 中存在 feedReady onlineCoverAsset，imageCountryCodes 与路线国家有交集；Feed 还会受当前 cursor/random/quality 排序影响。

真正改变路线结果的输入：
- 国家组合：runPipeline context.country/context.countries + KG query 决定候选池；当前保存结果为 GB+FR+CH+IT，原始候选国家 Unknown。
- 城市/景点：selectDestinationPool/buildRouteSkeleton/可选 LLM refine 共同决定；保存目的地为 坎特伯雷 > 兰斯 > 洛桑 > 奥斯塔 > 罗马。
- 天数：buildRouteConcept + context.durationDays/destinationCount 决定；保存为 14。
- travelStyle：context.travelStyle 可覆盖 concept.travelStyle；保存为 pilgrimage。
- route title：buildPlannerRecord 读取国家、destination places、styleLabel、days 拼接；当前标题=法兰奇杰纳之路精选。
- route summary：buildPlannerRecord 读取 styleLabelZh 和 places 模板生成；是否 LLM 改写 Unknown，除非 llmRefine 字段证明。

最后补上的标签/非决策字段：
- plannerReason：在路线骨架/concept 后写入；不证明它改变了国家、城市或天数。
- coverageContribution：由生成后的 country/destination 数量汇总；不是生成前输入。
- contentEvidence.provider/evidenceHash：主要是来源/缓存/溯源；一般不改变本条路线内容。
- designStrategies：可能参与 concept/validator，但 saved field 本身是输出记录；删除保存字段通常不改变已生成路线。

删除输入后的影响判断：
- 删除 context country/travelStyle/duration：会改变 KG query、concept 或生成失败。★★★★★
- 删除 Knowledge Graph：selectDestinationPool 为空时会 reject。★★★★★
- 删除 LLM refine：若 llmRefine.refined=true，可能改变顺序/取舍；否则不会。当前本条证据见 llmRefine 字段。
- 删除 Tavily/Web evidence：只在 missingSegments 且 webEvidencePipeline 存在时影响 evidence refs；是否改变骨架通常不会。当前本条多为 Unknown。
- 删除 plannerReason/coverageContribution：不会改变已生成路线内容。☆

### Route: 圣地亚哥朝圣之路：从法国到西班牙的徒步之旅

- Route ID: `wikivoyage-38727`
- 抽样类别: Niche
- 可证明来源类型: Unknown
- 国家: ES + IT + FR
- 目的地: 菲尼斯特雷 > 卢戈 > 罗马 > 圣让皮耶德波尔 > 圣地亚哥-德孔波斯特拉
- travelStyle: Unknown
- durationBand / days: Unknown / 10
- Feed: 可证明进入当前 Feed ready pool 的候选

Decision Trace:

Step1
读取：
- Unknown: route source does not preserve enough pre-generation context.

↓

Step2
过滤：
- Unknown

↓

Step3
候选国家：
- 可证明保存结果：ES + IT + FR
- 生成前完整候选国家池：Unknown（accepted route 未保存被扫描/被删除候选列表）。

↓

Step4
为什么保留这些国家：
- Unknown

↓

Step5
为什么删除其它国家：
- Unknown。当前 accepted route 没有保存 rejected alternatives；只能从代码知道可能原因包括 CN block、region 不合理、距离超限、pool 为空、dedupe 太近、cluster 饱和。

↓

Step6
为什么生成当前标题：
- Unknown

↓

Step7
为什么生成当前主题：
- buildRouteConcept/context.theme/travelStyle 生成主题；themes=文化旅行+徒步+朝圣。

↓

Step8
为什么生成当前简介：
- Unknown

↓

Step9
为什么进入 Accepted：
- 保存状态：contentQualityStatus=accepted, repositoryStatus=accepted, sourceType=source-original
- 可证明原因：Unknown

↓

Step10
为什么进入 Feed（如果进入）：
- 进入 Feed 的可证明原因：accepted repository 中存在 feedReady onlineCoverAsset，imageCountryCodes 与路线国家有交集；Feed 还会受当前 cursor/random/quality 排序影响。

真正改变路线结果的输入：
- Unknown: 无法证明哪些输入改变了路线结果。

最后补上的标签/非决策字段：
- plannerReason：在路线骨架/concept 后写入；不证明它改变了国家、城市或天数。
- coverageContribution：由生成后的 country/destination 数量汇总；不是生成前输入。
- contentEvidence.provider/evidenceHash：主要是来源/缓存/溯源；一般不改变本条路线内容。
- designStrategies：可能参与 concept/validator，但 saved field 本身是输出记录；删除保存字段通常不改变已生成路线。

删除输入后的影响判断：
- Unknown

### Route: 从圣地亚哥到菲尼斯特雷：朝圣之路的终点之旅

- Route ID: `wikivoyage-191775`
- 抽样类别: Niche
- 可证明来源类型: Unknown
- 国家: ES
- 目的地: 菲尼斯特雷 > 圣地亚哥-德孔波斯特拉 > 穆希亚
- travelStyle: Unknown
- durationBand / days: Unknown / 5
- Feed: 无法证明进入当前 Feed ready pool

Decision Trace:

Step1
读取：
- Unknown: route source does not preserve enough pre-generation context.

↓

Step2
过滤：
- Unknown

↓

Step3
候选国家：
- 可证明保存结果：ES
- 生成前完整候选国家池：Unknown（accepted route 未保存被扫描/被删除候选列表）。

↓

Step4
为什么保留这些国家：
- Unknown

↓

Step5
为什么删除其它国家：
- Unknown。当前 accepted route 没有保存 rejected alternatives；只能从代码知道可能原因包括 CN block、region 不合理、距离超限、pool 为空、dedupe 太近、cluster 饱和。

↓

Step6
为什么生成当前标题：
- Unknown

↓

Step7
为什么生成当前主题：
- buildRouteConcept/context.theme/travelStyle 生成主题；themes=经典旅行。

↓

Step8
为什么生成当前简介：
- Unknown

↓

Step9
为什么进入 Accepted：
- 保存状态：contentQualityStatus=accepted, repositoryStatus=accepted, sourceType=source-original
- 可证明原因：Unknown

↓

Step10
为什么进入 Feed（如果进入）：
- 未进入或无法证明进入 Feed：没有通过当前报告可验证的 feedReady + onlineCoverAsset 国家匹配。

真正改变路线结果的输入：
- Unknown: 无法证明哪些输入改变了路线结果。

最后补上的标签/非决策字段：
- plannerReason：在路线骨架/concept 后写入；不证明它改变了国家、城市或天数。
- coverageContribution：由生成后的 country/destination 数量汇总；不是生成前输入。
- contentEvidence.provider/evidenceHash：主要是来源/缓存/溯源；一般不改变本条路线内容。
- designStrategies：可能参与 concept/validator，但 saved field 本身是输出记录；删除保存字段通常不改变已生成路线。

删除输入后的影响判断：
- Unknown


## Budget

无可审路线：当前 accepted 数据中没有可证明属于 Budget 的路线。


## Contrast

无可审路线：当前 accepted 数据中没有可证明属于 Contrast 的路线。

## 10. 总结统计：真正参与决策的输入

| 输入 | 决策能力 | 说明 |
|---|---:|---|
| travelStyle/profile | ★★★★★ | 生成前被 buildRouteConcept、materialize profile、KG query/route structure 读取；会改变 style、title、summary、天数推导。 |
| country/destinationEntities | ★★★★★ | 直接决定国家组合、城市/景点、标题首尾、summary 和 route skeleton。 |
| durationBand/durationDays | ★★★★★ | 决定 recommendedDays、concreteDays、标题天数和 duration reason。 |
| Knowledge Graph Pool | ★★★★☆ | Planner/materialize 的目的地候选来源；但部分 coverageFallbackPlace 会引入模板地点。 |
| distance/segment rules | ★★★★☆ | 能过滤路线，影响 accepted；但 rejected alternatives 没逐条保存。 |
| bestMonths/season | ★★☆☆☆ | 可影响 seasonal concept/bestMonths；大量路线只是展示月份，无法证明改变目的地。 |
| designStrategies | ★★☆☆☆ | 某些 style 判定/validator 会读，但大量来自 profile 标签，逐条因果弱。 |
| Tavily/Web evidence | ★☆☆☆☆ | 代码只在 missingSegments 时补证据；当前 accepted route 多数不能证明 Tavily 参与生成。 |
| Wikivoyage | ★☆☆☆☆ | 可作为 evidence/source 系统存在，但本次 sampled route 中无法逐条证明其参与 Planner 生成。 |
| LLM refine | ★☆☆☆☆ | 只有 llmRefine.refined=true 才能证明改变顺序/取舍；多数 materialized routes 不依赖它。 |
| plannerReason | ☆ | 生成后解释，不是生成前输入。 |
| coverageContribution | ☆ | 生成后数量汇总，不是生成前输入。 |
| contentEvidence | ☆ | 主要来源/溯源字段；少量 Feed/前端特判，但不决定路线内容。 |

## 11. 明确无法证明的内容

- 无法证明每条路线生成前完整候选国家池。
- 无法证明每条路线删除其它国家/城市的具体原因。
- 无法证明 Tavily/Wikivoyage 对每条 sampled route 的具体输入和输出，除非保存字段中有逐条 evidence。
- 无法证明 plannerReason 在生成前影响路线；当前证据显示它是生成后解释。
- 无法证明 Budget 策略生成过路线；当前匹配为 0。
- 无法证明 Contrast 策略生成过路线；当前显式匹配为 0。

本报告到此停止，不执行修复。
