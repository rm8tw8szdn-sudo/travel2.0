# Planner Strategy Causality Audit

生成时间：2026-07-13T03:28:47.958Z

## 1. 非技术语言总结

这次审计只读取现有代码、现有生成日志和当前 accepted route 数据，没有修改业务代码、没有重写路线、没有修复图片或前端。

结论很明确：当前路线库里有一部分 Planner 输入是真正会影响路线结果的，例如 `travelStyle`、`durationBand` 和地理距离/候选池逻辑；但很多字段只是“生成后写进路线的说明或标签”，不能证明它们改变了国家组合、城市选择、排序或 Feed 可见性。尤其是 `plannerReason`、`coverageContribution`、`AI Inspiration` 这类字段，更接近解释/来源信息。Theme、Transport、Seasonal、Niche、Contrast 等策略存在不同程度的“标签化”：数据里能看到名称，但统计差异和代码链路不足以证明它们都是独立生成策略。

本次分析的路线库为 `<PROJECT_ROOT>\.route-v2-cache\accepted-routes.json`，共 5500 条 raw accepted records。当前 Feed 读取入口仍指向 `.route-v2-cache/accepted-routes.json`（server.js:12 定义基础路径，server.js:1338 初始化 repository storagePath），Feed 可见性主要受 accepted 状态、verified cover、qualityScore/random key 等影响，而不是直接受多数 Planner 策略字段影响。

## 2. 每个字段的真实作用

| 字段 | 存在率 | 唯一形态数 | 是否影响生成 | 是否影响 Review | 是否影响 Feed | 结论 |
|---|---:|---:|---|---|---|---|
| plannerReason | 5433/5500 (98.78%) | 1897 | 否 | 仅 evidence-composed 旧链路校验；planner-designed validator 不把文本作为生成输入 | 否；Feed 排序/可见性不读 plannerReason | 仅解释或展示字段 |
| designStrategies | 5395/5500 (98.09%) | 11 | 仅部分；buildRouteConcept 读取 context.designStrategies，但保存字段本身是结果字段 | 部分；composition-validator 只对 evidence-composed 校验策略合法性/证据 | 否 | 疑似后补标签 |
| travelStyle | 5500/5500 (100.00%) | 12 | 是；影响 concept、routeStructure、recommendedDays、destination query 参数 | 部分；content-quality 对 city-break 等最小目的地数不同 | 不直接排序；前端/图片策略会读取 | 决策逻辑真实生效 |
| durationBand | 5500/5500 (100.00%) | 5 | 是；影响 recommendedDays/durationDays 和 concept duration reason | 部分；concept validation 使用 duration concept | 否 | 决策逻辑真实生效 |
| themes | 5500/5500 (100.00%) | 38 | 仅部分；context.theme 会进入 KG query，但大量记录 themes 是 styleLabel 后写 | 部分；evidence-composed 检查 theme-fit | 否 | 仅部分影响结果 |
| qualityScore | 5500/5500 (100.00%) | 3 | 否 | 无法证明；accepted repository 不用 qualityScore 判断 accepted | 是；参与 Feed sort 和 Search ranking | 仅部分影响结果 |
| compositionScore | 5433/5500 (98.78%) | 4 | 否 | 部分；evidence-composed validator 校验分数阈值，planner-designed 走新 validator | 仅 qualityScore 缺失时作 fallback | 仅部分影响结果 |
| coverageContribution | 5433/5500 (98.78%) | 39 | 否 | 极弱；旧链路缺失检查 | 否 | 仅解释或展示字段 |
| contentEvidence | 5462/5500 (99.31%) | 84 | 否 | 部分；content-quality fallback 读取 travelStyle | 部分；materialized/plannerRuleVersion 影响前端占位识别和 repository variety key | 仅部分影响结果 |

### 字段逐项判断

- `plannerReason`：在路线骨架和 concept 形成之后生成，Search 会把文本放进 searchable text，旧 `evidence-composed` validator 会检查 reason 是否存在和 strategy 是否一致；但它不改变国家组合、城市、天数、交通、预算，也不参与 Feed 排序/可见性。结论：仅解释或展示字段。
- `designStrategies`：部分场景会作为 `buildRouteConcept` 输入，但当前保存字段大量来自 context/profile/materialize 后写。旧 review 会检查 evidence-composed 的策略合法性，Feed 不用。结论：疑似后补标签。
- `travelStyle`：是真实输入，warmup/search/context 会传入，KG query 和 concept 会读取，content-quality 也会读取。它能改变 concept、路线结构和部分候选逻辑。结论：决策逻辑真实生效。
- `durationBand`：由 durationDays/context 推导并参与 concept，实际影响 recommendedDays/durationDays。Feed 不读取。结论：决策逻辑真实生效。
- `themes`：有时来自 context.theme/evidence，有时只是 styleLabel 中文化。Search/media/display 会读取，但大量记录中更像标签。结论：仅部分影响结果。
- `qualityScore`：不影响生成，但 accepted repository 和 Search ranking 读取它排序。结论：仅部分影响结果。
- `compositionScore`：对旧 evidence-composed review 有阈值意义，qualityScore 缺失时 Feed 作为 fallback；对当前大批 planner/materialized 数据多为存储评分。结论：仅部分影响结果。
- `coverageContribution`：主要是 countries/destinations/themes/strategies 数量快照，未发现补洞、Feed 排序或 Search 排序读取。结论：仅解释或展示字段。
- `contentEvidence`：来源/证据 metadata，少量用于 travelStyle fallback、前端/materialized 判断和 repository variety key；不是生成决策本身。结论：仅部分影响结果。

## 3. 每个策略的真实调用链

| 策略 | 策略配置/生成位置 | Planner/Generator 输入 | 具体改变了什么 | Review 是否使用 | Feed 是否使用 | 结论 |
|---|---|---|---|---|---|---|
| Geographic | src/lib/routes/route-design-strategy.mjs:64; src/lib/routes/route-composition-planner.mjs:897; materialize profiles | destination coordinates/segment metrics/countries | 是；候选池、排序、距离/邻近约束会改变目的地组合 | 部分；策略证据和距离阈值可拒绝 evidence-composed | 否 | 决策逻辑真实生效 |
| Transport | route-design-strategy registry；materialize STYLE_PROFILES rail/road；plannerReason 第三条 | transport-connection、segment-metric、travelStyle rail/road | 仅部分；rail/road style 改变文案/主题，但未证明所有 Transport 标签改变交通实体选择 | 部分；证据链缺失可拒绝旧链路 | 否 | 仅部分影响结果 |
| Theme | context.theme、travelStyle/styleLabel、theme-fit evidence、materialize profile.theme | themes/styleLabel/evidence theme | 仅部分；context.theme 会进 KG query，但大量 themes 是后写标签 | 部分；theme-fit 证据可被旧链路检查 | 否 | 仅部分影响结果 |
| Duration | warmup/search context.durationDays → buildRouteConcept/durationBandForDays | durationDays/durationBand | 是；改变 recommendedDays/durationDays | 部分 | 否 | 决策逻辑真实生效 |
| Seasonal | Season strategy registry、seasonal warmup strategy、bestMonths/style seasonal | bestMonths、season context、destination-season evidence | 无法证明全链路；部分 seasonal context 会改变 bestMonths/query 参数 | 部分；旧链路 Season evidence | 否 | 无法验证 |
| Budget | route-design-strategy 中 Budget Opportunity disabled；composition-validator DISABLED_STRATEGIES 含 Budget | 无有效预算输入 | 否 | 是，若旧链路出现 Budget 会被拒绝 | 否 | 未实现 |
| Niche | 可能由 pilgrimage/island/style 或标题词推断；未见独立 Niche strategy | travelStyle/主题词 | 无法证明 | 否 | 否 | 疑似后补标签 |
| AI Inspiration | sourceType=planner-designed / materialized planner-rule | Planner path/sourceType | 仅表示生成来源；不是独立策略 | 否 | 部分；sourceRank 在非随机 sort key 中有影响，当前严格 Feed 更主要靠 verified cover/random | 仅解释或展示字段 |
| Contrast / Non-neighbor | 未发现独立 strategy；由多国/距离启发式可推断 | 国家组合/距离结果 | 无法证明 | 否；相反过大距离可能被 composition-validator 拒绝 | 否 | 无法验证 |

## 4. 决策字段清单

- `travelStyle`：真实影响 concept、routeStructure、destination query 参数和部分内容质量规则。
- `durationBand` / `durationDays`：真实影响推荐天数和时长相关 concept。
- Geographic 底层逻辑：通过国家/目的地候选、距离、segment metric 和 validator 影响目的地组合。
- `qualityScore`：不是生成决策，但是真实影响 Feed/Search 排序。
- `compositionScore`：对旧 `evidence-composed` Review 有真实阈值作用，qualityScore 缺失时影响 Feed fallback。

## 5. 非决策字段清单

- `plannerReason`：说明/解释/搜索文本字段。
- `coverageContribution`：覆盖统计快照。
- `AI Inspiration`：来源/路径标签，不是独立策略。
- `contentEvidence.provider/evidenceHash`：主要是来源和缓存/溯源字段；仅少量特判读取。

## 6. 无法证明生效的字段和策略

- Seasonal：存在 Season registry 和 seasonal warmup，但数据中大量 Seasonal 是从 bestMonths 或标题推断，不能证明每条 seasonal 结果都由季节策略驱动。
- Niche：未发现独立 Niche strategy，更多从 pilgrimage/island/theme 词推断。
- Contrast / Non-neighbor：数据中存在非邻近/长距离路线，但没有独立策略调用链证明它主动制造反差组合。
- Transport：部分真实读取 transport evidence，但数据中的 Transport 大量来自 rail/road title/style/reason 标签，无法证明全部独立生效。
- Theme：有 theme query/evidence，但当前 Theme 接近全量，差异不够强，存在标签化风险。

## 7. 疑似后补标签或模板标签

- designStrategies 组合 Top：Geographic+Transport=1523；Geographic=1297；Geographic+Season=1088；Geographic+Regional=740；Geographic+Theme=736；Geographic+Efficiency=5；Geographic+Efficiency+Transport=2；Geographic+Efficiency+Depth=1；Geographic+Efficiency+Season=1；Geographic+Efficiency+Theme=1；Geographic+Efficiency+Theme+Transport=1
- plannerReason.strategy 组合 Top：Geographic+Theme+Transport=5384；Theme+Theme+Theme=38；Geographic+Theme+Efficiency=8；Geographic+Efficiency+Theme+Efficiency+Transport=1；Geographic+Season+Transport+Efficiency=1；Geographic+Theme+Efficiency+Depth+Geographic=1
- contentEvidence provider Top：phase2b-planner=5395；deepseek=67；missing=38
- sourceType Top：planner-designed=5433；source-original=67

这些分布说明：不少策略字段是批量生成或批量 materialize 时按 profile/context 写入。它们可以作为解释和后续审计线索，但不能单独证明策略已经因果生效。

## 8. 不同策略的结果差异统计

说明：Geographic/Transport/Theme/Duration/Seasonal/Niche 每类取前 20 条对照；Budget 和 Contrast/Non-neighbor 按要求取全部。由于策略高度重叠，很多样本会同时落入多个组。

| 策略 | 全量命中 | 占全部 | 对照样本数 | 平均国家数 | 跨国比例 | 平均路线跨度 km | 平均相邻段最大 km | 平均天数 | Top travelStyle | Top themes | Top bestMonths | 平均 qualityScore | Feed eligible 比例 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---|---|---|---:|---:|
| Geographic | 5500 | 100.00% | 20 | 1.25 | 20.00% | n/a | n/a | 14.00 |  | 经典旅行:11<br>铁路旅行:4<br>公路自驾:2 | 3-5月:7<br>9-11月:5<br>5-9月:4 | 0.000 | 30.00% |
| Transport | 5426 | 98.65% | 20 | 1.10 | 10.00% | n/a | n/a | 10.60 |  | 铁路旅行:8<br>公路自驾:5<br>经典旅行:4 | 5-9月:5<br>3-5月:4<br>6-8月:4 | 0.000 | 20.00% |
| Theme | 5448 | 99.05% | 20 | 1.25 | 15.00% | 283 | 187 | 10.20 | classic-first-trip:2<br>island-hopping:1<br>rail-journey:1 | 经典旅行:8<br>公路自驾:2<br>经典首访:2 | 3-5月:12<br>10-11月:7<br>9-11月:5 | 0.000 | 55.00% |
| Duration | 5500 | 100.00% | 20 | 1.25 | 20.00% | n/a | n/a | 14.00 |  | 经典旅行:11<br>铁路旅行:4<br>公路自驾:2 | 3-5月:7<br>9-11月:5<br>5-9月:4 | 0.000 | 30.00% |
| Seasonal | 5500 | 100.00% | 20 | 1.25 | 20.00% | n/a | n/a | 14.00 |  | 经典旅行:11<br>铁路旅行:4<br>公路自驾:2 | 3-5月:7<br>9-11月:5<br>5-9月:4 | 0.000 | 30.00% |
| Niche | 12 | 0.22% | 12 | 1.42 | 16.67% | 201 | 183 | 9.25 | island-hopping:6<br>pilgrimage:4 | 跳岛旅行:5<br>朝圣巡礼:4<br>朝圣:1 | 5-9月:5<br>3-5月:3<br>10-11月:2 | 0.640 | 66.67% |
| Budget | 0 | 0.00% | 0 | 0.00 | 0.00% | n/a | n/a | n/a |  |  |  | 0.000 | 0.00% |
| Contrast / Non-neighbor | 0 | 0.00% | 0 | 0.00 | 0.00% | n/a | n/a | n/a |  |  |  | 0.000 | 0.00% |
| AI Inspiration | 5433 | 98.78% | 20 | 1.20 | 10.00% | 203 | 133 | 8.25 | classic-first-trip:6<br>deep-dive:3<br>island-hopping:2 | 经典初访:4<br>区域深度:3<br>经典首访:2 | 3-5月:10<br>10-11月:7<br>4-10月:3 | 0.480 | 55.00% |

### 对照分析结论

- Geographic、Theme、Duration 命中面过宽，接近或覆盖绝大多数路线，导致它们之间的统计差异很弱。
- Transport 组在标题/style 上能看到 rail/road/交通差异，但并不能证明每条路线有独立交通实体或交通证据驱动。
- Budget 组命中为 0，并且代码中 Budget/Budget Opportunity 处于禁用/拒绝状态，因此标记为未实现。
- Contrast/Non-neighbor 组来自距离/多国启发式，不是 strategy 字段直接给出；它反映结果特征，不证明策略因果。
- Feed eligible 比例主要受图片 verified cover 和 Feed readiness 影响，和策略标签没有直接对应关系。

### Geographic 样本证据
样本/全部：20/5500。
- wikivoyage-157419｜乌拉圭海岸之旅
- wikivoyage-195882｜横跨美国东西海岸的火车之旅
- wikivoyage-2339｜贝阿铁路之旅：穿越西伯利亚的壮丽铁路
- wikivoyage-26753｜沿巴拉圭河之旅
- wikivoyage-143082｜美国工业遗产之旅：从波士顿到芝加哥

### Transport 样本证据
样本/全部：20/5426。
- wikivoyage-195882｜横跨美国东西海岸的火车之旅
- wikivoyage-2339｜贝阿铁路之旅：穿越西伯利亚的壮丽铁路
- wikivoyage-150874｜芬兰群岛环线自驾之旅
- wikivoyage-164542｜阿罗约德尔瓦莱小径徒步路线
- wikivoyage-170098｜菲律宾亚洲公路26号线：从拉瓦格到三宝颜的壮丽之旅

### Theme 样本证据
样本/全部：20/5448。
- wikivoyage-27｜四国八十八所巡礼
- wikivoyage-134082｜阿德之路徒步：比利时乡村雕塑之旅
- wikivoyage-820｜阿尔萨斯葡萄酒之路
- wikivoyage-141916｜绝命毒师拍摄地巡礼
- wikivoyage-165980｜锈带与阿巴拉契亚：布法罗至匹兹堡公路之旅

### Duration 样本证据
样本/全部：20/5500。
- wikivoyage-157419｜乌拉圭海岸之旅
- wikivoyage-195882｜横跨美国东西海岸的火车之旅
- wikivoyage-2339｜贝阿铁路之旅：穿越西伯利亚的壮丽铁路
- wikivoyage-26753｜沿巴拉圭河之旅
- wikivoyage-143082｜美国工业遗产之旅：从波士顿到芝加哥

### Seasonal 样本证据
样本/全部：20/5500。
- wikivoyage-157419｜乌拉圭海岸之旅
- wikivoyage-195882｜横跨美国东西海岸的火车之旅
- wikivoyage-2339｜贝阿铁路之旅：穿越西伯利亚的壮丽铁路
- wikivoyage-26753｜沿巴拉圭河之旅
- wikivoyage-143082｜美国工业遗产之旅：从波士顿到芝加哥

### Niche 样本证据
样本/全部：12/12。
- planner-designed-::::::Q1524|Q203715|anchor:GR:naxos|anchor:GR:paros::8天::Island Hopping::::Q1524>Q203715>anchor:GR:naxos>anchor:GR:paros｜希腊8天经典跳岛：雅典
- planner-designed-::::::anchor:JP:kochi|anchor:JP:matsuyama|anchor:JP:takamatsu|anchor:JP:tokushima::12天::Pilgrimage::::anchor:JP:tokushima>anchor:JP:kochi>anchor:JP:matsuyama>anchor:JP:takamatsu｜日本12天延展朝圣：德岛
- gold-case-accepted-gold-9-greece-island-hopping｜希腊跳岛
- gold-case-accepted-gold-c45-32-croatian-islands｜克罗地亚跳岛
- gold-case-accepted-gold-c45-33-philippines-palawan｜菲律宾巴拉望跳岛

### Budget 样本证据
样本/全部：0/0。

### Contrast / Non-neighbor 样本证据
样本/全部：0/0。

### AI Inspiration 样本证据
样本/全部：20/5433。
- planner-designed-::::::Q2044|Q220|Q2634|Q490::9天::Classic First Trip::::Q490>Q2044>Q220>Q2634｜意大利9天延展经典初访：米兰
- planner-designed-::::::Q1524|Q203715|anchor:GR:naxos|anchor:GR:paros::8天::Island Hopping::::Q1524>Q203715>anchor:GR:naxos>anchor:GR:paros｜希腊8天经典跳岛：雅典
- planner-designed-::::::Q1479|anchor:FR:medoc|anchor:FR:saint-emilion::6天::Theme::::Q1479>anchor:FR:saint-emilion>anchor:FR:medoc｜法国6天精简主题游：波尔多
- planner-designed-::::::anchor:CH:interlaken|anchor:CH:lucerne|anchor:CH:lugano|anchor:CH:st-moritz|anchor:CH:zermatt::8天::Rail Journey::::anchor:CH:lucerne>anchor:CH:interlaken>anchor:CH:zermatt>anchor:CH:st-moritz>anchor:CH:lugano｜瑞士8天经典铁路旅程：卢塞恩
- planner-designed-::::::Q1490|Q169134|Q34600|Q35765|Q39231::8天::Classic First Trip::::Q1490>Q39231>Q34600>Q169134>Q35765｜日本8天经典经典初访：东京

## 9. 最大的三个根因

1. 策略标签、解释文本和真实决策输入混在同一条 route record 里；字段存在后很容易被误认为“策略生效”。
2. materialize/bulk 生产把大量路线按 profile 模板写入相同字段，造成策略分布高重叠、标题/简介模板化，难以看出独立策略差异。
3. Feed 链路主要读取 accepted repository、verified cover、qualityScore/random key，不读取大多数策略字段；所以“Planner 策略分布”和“用户实际看到的分布”天然可能脱节。

## 10. 下一步建议，但不执行修复

1. 为 Planner 生成阶段增加不可变的 `decisionTrace`：记录每个策略在生成前读取的输入、对候选池/排序/过滤造成的具体变化，以及生成后保存字段的对应关系。
2. 把“生成决策字段”和“展示解释字段”拆开，避免 `plannerReason`、`designStrategies` 被当成真实决策证据。
3. 建立策略 A/B 或对照生成审计：同一 country/duration 下只切换一个策略，比较国家、城市、天数、交通、主题和 Feed 进入率是否真实变化。

## 审计使用的代码位置

- Planner record 生成：src/lib/routes/route-composition-planner.mjs:793
- Concept 构建：src/lib/routes/route-composition-planner.mjs:897
- Strategy registry：src/lib/routes/route-design-strategy.mjs:64
- Warmup strategy resolve：src/lib/routes/repository-warmup-runner.mjs:413
- Accepted repository / Feed quality：src/lib/routes/accepted-repository.mjs:125
- Feed sort：src/lib/routes/accepted-repository.mjs:273
- Feed visibility cover gate：src/lib/routes/accepted-repository.mjs:170
- Composition validator：src/lib/routes/composition-validator.mjs:111
- Budget disabled evidence：src/lib/routes/composition-validator.mjs:2
- Materialize profiles：scripts/materialize-route-pool.mjs:未找到
- Server repository path：server.js:12 / server.js:1338

## 生成日志和上下文

- accepted-routes.json.2026-07-08T032746221Z.before-planner-rule-materialize: 1 条/对象，44960193 bytes
- accepted-routes.json.2026-07-08T031715338Z.before-planner-rule-materialize: 1 条/对象，44740393 bytes
- accepted-routes.json.2026-07-08T031551676Z.before-planner-rule-materialize: 1 条/对象，44708288 bytes
- accepted-routes.json.2026-07-08T023321726Z.before-planner-rule-materialize: 1 条/对象，44328047 bytes
- accepted-routes.json.2026-07-07T042931672Z.before-planner-rule-materialize: 1 条/对象，42896017 bytes
- accepted-routes.json.2026-07-07T091830606Z.before-planner-rule-materialize: 1 条/对象，42855068 bytes
- accepted-routes.json.2026-07-07T092349511Z.before-planner-rule-materialize: 1 条/对象，42847686 bytes
- accepted-routes.json.2026-07-07T092839054Z.before-planner-rule-materialize: 1 条/对象，40574940 bytes
- accepted-routes.json.2026-07-07T042826998Z.before-planner-rule-materialize: 1 条/对象，29332746 bytes
- accepted-routes.20260630-171501.before-prune-superseded-planner.json: 1 条/对象，451890 bytes
- search-review-candidates.json: 1 条/对象，25369 bytes
- bulk-route-generation-2026-07-07T03-59-42-976Z.jsonl: 4 条/对象，1602 bytes

## 审计限制

- 本报告没有重放 Planner，也没有调用外部 API；只能证明“当前代码和当前保存数据能证明什么”，不能证明历史某次运行时所有参数。
- 对 Contrast/Non-neighbor 的识别使用路线坐标距离启发式，因为当前数据没有统一的 non-neighbor strategy 字段。
- 对 Niche/Budget 等未统一结构化的策略，只能结合字段、标题、style 和代码读取点判断。
- PowerShell 控制台可能显示中文乱码，但报告文件按 UTF-8 写入。
