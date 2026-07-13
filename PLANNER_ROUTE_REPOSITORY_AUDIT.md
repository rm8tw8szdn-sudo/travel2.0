# Planner Route Repository Audit

生成时间：2026-07-13T02:46:15.945Z
审计模式：只读统计；未修改业务代码、未修改路线数据、未重新生成路线。

## 非技术语言执行摘要

当前真正被 API 使用的主路线库是 `.route-v2-cache/accepted-routes.json`，文件内保存 5500 条路线；通过 Repository 加载、校验、去重后仍可列出的有效路线为 4577 条。前端首屏还会优先读 `route-feed-bootstrap.js`，其中 cross/single 首屏快照数量为 {"cross":6,"single":6}，后续无限流再走 `/api/routes/discovery` 读取 accepted repository。

审计结论：Planner 的“地缘/邻近”“AI 灵感”“假期长度”“主题”“交通”在当前数据中有痕迹，并且有路线进入 Feed eligible 池；但大量 Planner 字段表现为模板化、同质化和存储型字段。预算/低成本策略没有形成有效数据规模；季节策略主要表现为 bestMonths 或少量关键词，不能证明它真实驱动路线生成。评分字段存在并参与部分排序，但分数高度集中，解释力有限。

## 路线库真实来源

### accepted 路线文件

| 文件 | 大小 | 用途判断 |
|---|---:|---|
| .route-v2-cache/accepted-routes.20260630-163906.before-coverage-matrix.json | 354049 | 备份/旧快照，当前默认不读 |
| .route-v2-cache/accepted-routes.20260630-171501.before-prune-superseded-planner.json | 451890 | 备份/旧快照，当前默认不读 |
| .route-v2-cache/accepted-routes.json | 45562416 | 当前 API 默认主库 |
| .route-v2-cache/accepted-routes.json.2026-07-07T041629287Z.before-materialize-5000 | 818426 | 备份/旧快照，当前默认不读 |
| .route-v2-cache/accepted-routes.json.2026-07-07T041920159Z.before-materialize-5000 | 15798559 | 备份/旧快照，当前默认不读 |
| .route-v2-cache/accepted-routes.json.2026-07-07T041941652Z.before-materialize-5000 | 26929786 | 备份/旧快照，当前默认不读 |
| .route-v2-cache/accepted-routes.json.2026-07-07T042245886Z.before-materialize-5000 | 15798559 | 备份/旧快照，当前默认不读 |
| .route-v2-cache/accepted-routes.json.2026-07-07T042826998Z.before-planner-rule-materialize | 29332746 | 备份/旧快照，当前默认不读 |
| .route-v2-cache/accepted-routes.json.2026-07-07T042931672Z.before-planner-rule-materialize | 42896017 | 备份/旧快照，当前默认不读 |
| .route-v2-cache/accepted-routes.json.2026-07-07T091830606Z.before-planner-rule-materialize | 42855068 | 备份/旧快照，当前默认不读 |
| .route-v2-cache/accepted-routes.json.2026-07-07T092349511Z.before-planner-rule-materialize | 42847686 | 备份/旧快照，当前默认不读 |
| .route-v2-cache/accepted-routes.json.2026-07-07T092839054Z.before-planner-rule-materialize | 40574940 | 备份/旧快照，当前默认不读 |
| .route-v2-cache/accepted-routes.json.2026-07-08T023321726Z.before-planner-rule-materialize | 44328047 | 备份/旧快照，当前默认不读 |
| .route-v2-cache/accepted-routes.json.2026-07-08T031551676Z.before-planner-rule-materialize | 44708288 | 备份/旧快照，当前默认不读 |
| .route-v2-cache/accepted-routes.json.2026-07-08T031715338Z.before-planner-rule-materialize | 44740393 | 备份/旧快照，当前默认不读 |
| .route-v2-cache/accepted-routes.json.2026-07-08T032746221Z.before-planner-rule-materialize | 44960193 | 备份/旧快照，当前默认不读 |
| .route-v2-cache/accepted-routes.json.20260630134432.before-gold-case-seed.json | 422125 | 备份/旧快照，当前默认不读 |
| .route-v2-cache/accepted-routes.json.20260630134504.before-gold-case-seed.json | 485396 | 备份/旧快照，当前默认不读 |
| .route-v2-cache/accepted-routes.json.20260706102204.before-dedupe-cleanup | 941624 | 备份/旧快照，当前默认不读 |
| .route-v2-cache/accepted-routes.json.20260706102305.before-cross-dedupe-cleanup | 941624 | 备份/旧快照，当前默认不读 |
| .route-v2-cache/accepted-routes.json.20260709-111842.before-feed-image-prewarm | 44616445 | 备份/旧快照，当前默认不读 |
| .route-v2-cache/accepted-routes.json.20260709-112422.before-feed-image-prewarm | 45597049 | 备份/旧快照，当前默认不读 |
| .route-v2-cache/accepted-routes.json.20260709-113027.before-feed-image-prewarm | 44705289 | 备份/旧快照，当前默认不读 |
| .route-v2-cache/accepted-routes.json.20260709-114807.before-feed-image-prewarm | 44746217 | 备份/旧快照，当前默认不读 |
| .route-v2-cache/accepted-routes.json.20260709-121143.before-feed-image-prewarm | 44799910 | 备份/旧快照，当前默认不读 |
| .route-v2-cache/accepted-routes.json.20260709-121212.before-feed-image-prewarm | 46299442 | 备份/旧快照，当前默认不读 |
| .route-v2-cache/accepted-routes.json.20260709-121402.before-feed-image-prewarm | 44792376 | 备份/旧快照，当前默认不读 |
| .route-v2-cache/accepted-routes.json.20260709-121802.before-feed-image-prewarm | 46297008 | 备份/旧快照，当前默认不读 |
| .route-v2-cache/accepted-routes.json.20260709-122514.before-feed-image-prewarm | 45207120 | 备份/旧快照，当前默认不读 |
| .route-v2-cache/accepted-routes.json.20260709-122935.before-feed-image-prewarm | 44804425 | 备份/旧快照，当前默认不读 |
| .route-v2-cache/accepted-routes.json.20260709-125042.before-feed-image-prewarm | 44871014 | 备份/旧快照，当前默认不读 |
| .route-v2-cache/accepted-routes.json.20260709-125325.before-feed-image-prewarm | 44861806 | 备份/旧快照，当前默认不读 |
| .route-v2-cache/accepted-routes.json.20260710-021602.before-feed-image-prewarm | 44860348 | 备份/旧快照，当前默认不读 |
| .route-v2-cache/accepted-routes.json.20260710-021727.before-feed-image-prewarm | 45664439 | 备份/旧快照，当前默认不读 |
| .route-v2-cache/accepted-routes.json.20260710-021937.before-feed-image-prewarm | 45690594 | 备份/旧快照，当前默认不读 |
| .route-v2-cache/accepted-routes.json.20260710-022029.before-feed-image-prewarm | 45545482 | 备份/旧快照，当前默认不读 |

### 前端首屏/Feed 缓存

| 文件 | 数量 | 用途判断 |
|---|---:|---|
| route-feed-bootstrap.js | {"cross":6,"single":6} | 前端首屏可直接读取 |
| .route-v2-cache/route-feed-bootstrap-payload.json | 6 | bootstrap 生成物/缓存 |
| .route-v2-cache/route-feed-bootstrap-cross-payload.json | 6 | cross bootstrap payload |
| .route-v2-cache/route-feed-bootstrap-single-payload.json | 6 | single bootstrap payload |

### 其他相关数据

- `.route-v2-cache/route-evidence.json`：evidence 数量 2865，供 Planner/evidence check 使用；不是 Feed 直接路线库。
- `.route-v2-cache/knowledge-graph-pool.json`：国家池 14 个，目的地实体约 348 个；供 Planner 选点。
- `.route-v2-cache/search-cache.json`：intent cache 3 个；Search 可读，Feed 不直接读。
- `.route-v2-cache/search-review-candidates.json`：review candidate 组 3；默认不进入 Feed。
- bulk generation logs：bulk-route-generation-2026-07-07T03-52-36-108Z.jsonl 4 行；bulk-route-generation-2026-07-07T03-59-42-976Z.jsonl 4 行；bulk-route-generation-2026-07-07T04-07-23-332Z.jsonl 1 行。
- image audit/prewarm：image-country-audit keys=4；feed-image-prewarm-report keys=19。

## 真实调用链

`Planner -> Generator -> Evidence/Tavily/Wikimedia/Knowledge Graph -> Accepted Repository -> Feed API -> routes.js 前端`

1. Planner/Generator：`src/lib/routes/route-composition-planner.mjs` 生成 `sourceType: planner-designed`、`designStrategies`、`plannerReason`、`qualityScore` 等字段。
2. Evidence/Knowledge：`.route-v2-cache/route-evidence.json` 和 `.route-v2-cache/knowledge-graph-pool.json` 被 planner/search planner 读取。
3. Accepted Repository：`src/lib/routes/accepted-repository.mjs` 默认读取 `.route-v2-cache/accepted-routes.json`；加载时要求 `contentQualityStatus === "accepted"`、content/composition 校验通过、且有 cover。
4. Feed API：`server.js` 创建 discovery handler 时传入 `ROUTE_ACCEPTED_REPOSITORY_PATH || .route-v2-cache/accepted-routes.json`。
5. Feed 返回：Repository `list()` 在 limit < 100000 且非搜索时只取 verified cover 池，并按 session 随机、洲别轮换、国家/图片去重分页。
6. 前端展示：`routes.js` 先读 `route-feed-bootstrap.js` 快照；后续请求 `/api/routes/discovery`，`mode: "feed"` 读取 accepted repository。Search 的 `mode:"search"` 可读 accepted/cache/planner，但实时生成默认不进 Feed。

重点回答：Planner 生成的路线并非全部可证明进入 Review；当前保留的 rejected 历史不足。进入 `accepted-routes.json` 的 Planner/materialized 路线多数已 accepted，但最终进 Feed 还取决于 verified cover、图片国家匹配和 Feed 去重。存在 bootstrap 首屏旧快照与 API 主库并存，可能造成首屏分布与主库总体分布不同。

## 路线总量和数据质量

| 指标 | 数值 |
|---|---:|
| accepted-routes.json 保存路线总数 | 5500 |
| Repository 加载后有效路线数 | 4577 |
| Repository status total | 5500 |
| Feed eligible 路线数（近似 hasVerifiedFeedCover） | 109 |
| Planner/materialized 路线数 | 5433 |
| Source-original/Wikivoyage 等非 Planner 路线数 | 67 |
| 单国路线数 | 4659 |
| 跨国路线数 | 841 |
| 缺失关键字段路线数 | 0 |
| 重复 Route ID 额外条数 | 0 |
| 标题完全重复额外条数 | 0 |
| 国家组合重复涉及路线数 | 5480 |
| 标题模板高度相似涉及路线数 | 5384 |
| 简介模板高度相似涉及路线数 | 5405 |

### 数据来源分布

| 来源 | 数量 | 占比 |
|---|---:|---:|
| planner-designed | 5433 | 98.78% |
| source-original | 67 | 1.22% |

## Planner 策略分布

| 策略 | 路线数量 | 占全部路线比例 | 通过审核数量 | 最终进入 Feed 数量 | 判断依据 | 实现状态 |
|---|---:|---:|---:|---:|---|---|
| 主题路线 | 5500 | 100.00% | 5500 | 109 | 字段+内容+Feed资格；国家组合325，时长24，主题47；时长高度集中；主题高度集中 | 部分生效 |
| 假期长度路线 | 5435 | 98.82% | 5435 | 109 | 字段+内容+Feed资格；国家组合311，时长8，主题19；时长高度集中；主题高度集中 | 部分生效 |
| 航班/交通组合路线 | 5434 | 98.80% | 5434 | 96 | 字段+内容+Feed资格；国家组合311，时长14，主题23；时长高度集中；主题高度集中 | 部分生效 |
| 地缘/邻近国家路线 | 5433 | 98.78% | 5433 | 94 | 字段+内容+Feed资格；国家组合314，时长16，主题34；时长高度集中；主题高度集中 | 真实生效 |
| AI 灵感路线 | 5433 | 98.78% | 5433 | 109 | 字段+内容+Feed资格；国家组合311，时长6，主题18；时长高度集中；主题高度集中 | 部分生效 |
| 小众目的地路线 | 2780 | 50.55% | 2780 | 34 | 字段+内容+Feed资格；国家组合283，时长8，主题10；时长高度集中；主题高度集中 | 部分生效 |
| 季节路线 | 1096 | 19.93% | 1096 | 27 | 字段+内容+Feed资格；国家组合264，时长4，主题5；时长高度集中；主题高度集中 | 部分生效 |
| 其他策略 | 37 | 0.67% | 37 | 0 | 字段+内容+Feed资格；国家组合17，时长14，主题18；主题高度集中 | 疑似假实现 |
| 预算/低成本路线 | 2 | 0.04% | 2 | 0 | 字段+内容+Feed资格；国家组合2，时长2，主题2；全库几乎无预算/低成本记录；时长高度集中；主题高度集中 | 未实现 |
| 反差或非相邻国家组合 | 1 | 0.02% | 1 | 0 | 字段+内容+Feed资格；国家组合1，时长1，主题3；时长高度集中；主题高度集中 | 疑似假实现 |

多策略组合：5500 条路线包含辅助策略。占比最高的三类是 主题路线 5500、假期长度路线 5435、航班/交通组合路线 5434。

## 策略是否真正影响结果

- 地缘/邻近：真实影响国家组合和 Feed，组合数 314，但大量标题/简介仍是固定模板。
- AI 灵感：真实写入 accepted 并有 Feed eligible，但很多是 materialized 规则批量扩充，差异主要来自国家/目的地替换，不一定代表 LLM 创意。
- 假期长度：字段普遍存在，但常与模板化标题绑定；只能算部分生效。
- 主题：主题字段很多，但 Top 主题高度集中，且描述常是模板句；只能算部分生效。
- 预算/低成本：当前几乎没有可统计规模，标记未实现或无法证明生效。
- 季节：bestMonths 普遍存在，但这不是策略生效证据；只有少量关键词型季节路线可算部分生效。

典型反例：字段写着 `designStrategies: [Geographic, Regional]` 的 materialized 路线，`summary/recommendationText` 经常只替换国家、城市和天数；`plannerReason` 中“时长=...”“旅行风格=...”等句式重复出现，不能单独证明策略真实驱动。

## Planner 字段有效性

| 字段 | 存在数 | 缺失率 | 唯一值数 | 最常见值 | 最常见次数 | 是否参与后续逻辑/判断 |
|---|---:|---:|---:|---|---:|---|
| plannerReason | 5433 | 1.22% | 74 | [{"text":"时长=4-6d，5天适合串联3个主要目的地，保持经典旅行的基本节奏。","strategy":"Geographic", | 1149 (20.89%) | 疑似假实现/存储为主，未见Feed筛选 |
| designStrategies | 5395 | 1.91% | 12 | ["Geographic","Transport"] | 1523 (27.69%) | 疑似假实现/存储为主，未见Feed筛选 |
| qualityScore | 5500 | 0.00% | 3 | 0.78 | 5384 (97.89%) | Feed排序使用 |
| compositionScore | 5433 | 1.22% | 5 | {"geographicFit":0.82,"transportFeasibility":0.8,"seasonalFit":0.78,"t | 5384 (97.89%) | 校验/quality fallback；不是主要Feed筛选 |
| coverageContribution | 5433 | 1.22% | 40 | {"country":1,"destinations":3} | 2095 (38.09%) | 疑似假实现/存储为主，未见Feed筛选 |
| contentEvidence | 5462 | 0.69% | 85 | {"provider":"phase2b-planner","travelMode":"classic-first-trip","mater | 3050 (55.45%) | 展示/溯源或未见直接筛选 |
| source | 105 | 98.09% | 106 | (missing) | 5395 (98.09%) | 展示/溯源或未见直接筛选 |
| generator | 0 | 100.00% | 1 | (missing) | 5500 (100.00%) | 疑似假实现/存储为主，未见Feed筛选 |
| reviewStatus | 0 | 100.00% | 1 | (missing) | 5500 (100.00%) | 疑似假实现/存储为主，未见Feed筛选 |
| createdAt | 0 | 100.00% | 1 | (missing) | 5500 (100.00%) | 疑似假实现/存储为主，未见Feed筛选 |
| acceptedAt | 5500 | 0.00% | 1007 | 2026-07-08T03:27:45.370Z | 22 (0.40%) | 展示/溯源或未见直接筛选 |
| repositoryStatus | 5500 | 0.00% | 2 | mediaReady | 5425 (98.64%) | Repository加载/状态使用 |
| contentQualityStatus | 5500 | 0.00% | 1 | accepted | 5500 (100.00%) | Repository加载/状态使用 |
| sourceType | 5500 | 0.00% | 2 | planner-designed | 5433 (98.78%) | 展示/溯源或未见直接筛选 |
| travelStyle | 5500 | 0.00% | 12 | classic-first-trip | 3056 (55.56%) | 展示/溯源或未见直接筛选 |
| durationBand | 5500 | 0.00% | 5 | 7-10d | 2785 (50.64%) | 展示/溯源或未见直接筛选 |

字段级疑似假实现：`plannerReason`、`designStrategies`、`coverageContribution`、`generator`、`createdAt`、`reviewStatus` 在当前 Feed 链路中未见直接筛选/排序作用；它们更多是存储、解释或审计字段。`qualityScore` 会进入 Feed 排序，但由于分数集中，区分度有限。

## 路线覆盖情况

| 指标 | 数值 |
|---|---:|
| 覆盖国家数量 | 195 / 195 |
| 覆盖城市/目的地名称数量 | 1780 |
| 覆盖地区数量 | 21 |
| 相邻/近邻跨国路线数量（启发式） | 840 |
| 非相邻/反差跨国路线数量（启发式） | 1 |
| 热门国家数量（出现 >=100） | 5 |
| 中等热度国家数量（20-99） | 188 |
| 冷门国家数量（1-19） | 2 |
| 完全未覆盖国家/地区代码数量 | 1 |

### 出现次数最多的 30 个国家

| 国家代码 | 名称 | 次数 |
|---|---|---:|
| GB | 英国 | 138 |
| HU | 匈牙利 | 138 |
| DE | 德国 | 135 |
| CZ | 捷克 | 113 |
| US | 美国 | 106 |
| JP | 日本 | 97 |
| ID | 印度尼西亚 | 92 |
| HR | 克罗地亚 | 79 |
| BA | 波黑 | 75 |
| IS | 冰岛 | 74 |
| ME | 黑山 | 74 |
| BE | 比利时 | 71 |
| AL | 阿尔巴尼亚 | 69 |
| RS | 塞尔维亚 | 69 |
| MK | 北马其顿 | 68 |
| TR | 土耳其 | 64 |
| LU | 卢森堡 | 62 |
| SI | 斯洛文尼亚 | 56 |
| FR | 法国 | 55 |
| CY | 塞浦路斯 | 53 |
| HN | 洪都拉斯 | 53 |
| LB | 黎巴嫩 | 53 |
| SV | 萨尔瓦多 | 53 |
| CH | 瑞士 | 52 |
| SK | 斯洛伐克 | 48 |
| NL | 荷兰 | 46 |
| RO | 罗马尼亚 | 46 |
| AE | 阿联酋 | 45 |
| BZ | 伯利兹 | 45 |
| GH | 加纳 | 45 |

### 出现次数最少的国家

| 国家代码 | 名称 | 次数 |
|---|---|---:|
| EH |  | 1 |
| GR | 希腊 | 16 |
| AD | 安道尔 | 21 |
| AG | 安提瓜和巴布达 | 21 |
| AO | 安哥拉 | 21 |
| BB | 巴巴多斯 | 21 |
| BF | 布基纳法索 | 21 |
| BR | 巴西 | 21 |
| BS | 巴哈马 | 21 |
| BW | 博茨瓦纳 | 21 |
| BY | 白俄罗斯 | 21 |
| CD | 刚果（金） | 21 |
| CF | 中非共和国 | 21 |
| CG | 刚果（布） | 21 |
| CM | 喀麦隆 | 21 |
| CO | 哥伦比亚 | 21 |
| CV | 佛得角 | 21 |
| DJ | 吉布提 | 21 |
| DM | 多米尼加 | 21 |
| DO | 多明尼加 | 21 |
| DZ | 阿尔及利亚 | 21 |
| EC | 厄瓜多尔 | 21 |
| ER | 厄立特里亚 | 21 |
| FJ | 斐济 | 21 |
| FM | 密克罗尼西亚 | 21 |
| GA | 加蓬 | 21 |
| GD | 格林纳达 | 21 |
| GN | 几内亚 | 21 |
| GQ | 赤道几内亚 | 21 |
| GW | 几内亚比绍 | 21 |

### 完全没有覆盖的国家代码

CN(中国)

### 重复最多的国家组合

| 国家组合 | 次数 |
|---|---:|
| US | 105 |
| JP | 95 |
| GB | 91 |
| DE | 90 |
| ID | 88 |
| CZ | 87 |
| HU | 87 |
| IS | 74 |
| TR | 48 |
| ES | 30 |
| AU | 27 |
| CA | 26 |
| MX | 25 |
| BE | 23 |
| IN | 23 |
| NO | 23 |
| NZ | 23 |
| PE | 23 |
| PH | 23 |
| RU | 23 |
| BO | 22 |
| CH | 22 |
| CR | 22 |
| FI | 22 |
| HR | 22 |
| MA | 22 |
| NA | 22 |
| NL | 22 |
| PT | 22 |
| ZA | 22 |

### 重复最多的路线主题

| 主题 | 次数 |
|---|---:|
| 经典首访 | 6104 |
| 单国路线 | 4578 |
| 主题游 | 1474 |
| 铁路旅程 | 1294 |
| 公路自驾 | 1276 |
| 跨国路线 | 817 |
| 交通线旅程 | 492 |
| 区域深度 | 160 |
| 经典旅行 | 70 |
| 路线产品 | 38 |
| 铁路旅行 | 30 |
| 徒步 | 12 |
| 多国跳转 | 10 |
| 海岸旅行 | 10 |
| 季节主题 | 10 |
| 跳岛旅行 | 10 |
| 主题旅行 | 10 |
| 朝圣巡礼 | 8 |
| 经典初访 | 8 |
| 自驾旅行 | 8 |
| 骑行 | 6 |
| 工业遗产 | 4 |
| 徒步旅行 | 4 |
| 文化旅行 | 4 |
| 自然 | 4 |
| 自然风光 | 4 |
| 朝圣 | 2 |
| 城市短假 | 2 |
| 电车之旅 | 2 |
| 多国串联 | 2 |

## 路线质量和评分分布

Quality Score：平均 0.770，中位数 0.780，最小 0.000，最大 0.960。
Composition Score 平均：0.800，中位数 0.800。

### Quality Score 分布

| 分数区间 | 数量 | 占比 |
|---|---:|---:|
| 0 | 78 | 1.42% |
| 0.90-0.99 | 38 | 0.69% |
| 0.70-0.79 | 5384 | 97.89% |

### Composition Score 平均分布

| 分数区间 | 数量 | 占比 |
|---|---:|---:|
| missing | 67 | 1.22% |
| 0.70-0.79 | 5395 | 98.09% |
| 0.80-0.89 | 38 | 0.69% |

评分是否参与逻辑：`qualityScore` 在 accepted repository 的 Feed 排序中使用；`compositionScore` 主要作为 qualityScore 缺失时的 fallback 或校验输入。没有证据表明 `coverageContribution` 直接影响当前 Feed 排序。高分是否更高质无法仅凭字段证明；当前分数大量集中，且 source-original 很多为 0，分数区分度不足。

## 描述重复和模板化

| 指标 | 数量 |
|---|---:|
| 标题完全重复额外条数 | 0 |
| 简介完全重复涉及路线数 | 1687 |
| 推荐语完全重复涉及路线数 | 5428 |
| 标题模板高度相似涉及路线数 | 5384 |
| 简介模板高度相似涉及路线数 | 5405 |
| Planner Reason 重复涉及条目数 | 15208 |

### 典型重复/模板样本

1. 标题模板，重复 2672 条，模板/文本：`[place][days]经典首访：[place]到[place]`
   样本：materialized-5zuyuk-46986｜捷克5天经典首访：布拉格到俄斯特拉发；materialized-32xcin-46991｜德国5天经典首访：汉堡到哈瑙；materialized-15ftq6g-47019｜冰岛5天经典首访：雷克雅未克到辛格维利尔国家公园
2. 标题模板，重复 636 条，模板/文本：`[place][days]铁路旅程：[place]到[place]`
   样本：materialized-o0wr19-46989｜英国5天铁路旅程：爱丁堡到尼斯湖；materialized-qfsrtp-47017｜印度尼西亚5天铁路旅程：普沃勒佐到古突士；materialized-7mxdpn-47024｜安道尔5天铁路旅程：安道尔门户城市到安道尔自然腹地
3. 标题模板，重复 627 条，模板/文本：`[place][days]公路自驾：[place]到[place]`
   样本：materialized-1wetg87-46990｜美国5天公路自驾：纽约都会到华盛顿哥伦比亚特；materialized-1sb6e2-47018｜日本5天公路自驾：东京到京都；materialized-al11e-47025｜阿联酋5天公路自驾：阿联酋门户城市到阿联酋自然腹地
4. 标题模板，重复 588 条，模板/文本：`[place][days]主题游：[place]到[place]`
   样本：materialized-1xpzytr-46985｜匈牙利5天主题游：布达佩斯到塞克什白堡；materialized-1eya039-47027｜安提瓜和巴布达5天主题游：安提瓜和巴布达门户城市到安提瓜和巴布达自然腹地；materialized-151nbjb-47034｜波黑5天主题游：波黑门户城市到波黑自然腹地
5. 简介模板，重复 1778 条，模板/文本：`围绕经典首访组织停留，串联[place]、[place]、[place]等地点，重点是形成可执行的旅行节奏。`
   样本：materialized-3alfy2-0｜匈牙利、捷克8天经典首访：布达佩斯到比尔森；materialized-18pb0m3-160｜匈牙利、摩尔多瓦8天经典首访：沙托劳尔尧乌伊海伊到摩尔多瓦自然腹地；materialized-1quw6uv-768｜捷克、斯洛伐克7天经典首访：布拉格到斯洛伐克自然腹地
6. 简介模板，重复 1235 条，模板/文本：`围绕经典首访组织停留，串联[place]、[place]、[place]，重点是形成可执行的旅行节奏。`
   样本：materialized-e5h5cd-4451｜英国、荷兰5天经典首访：伦敦到荷兰自然腹地；materialized-1dy4ilo-15603｜阿联酋、阿曼5天经典首访：阿联酋门户城市到阿曼自然腹地；materialized-eatddt-15683｜阿尔巴尼亚、波黑5天经典首访：阿尔巴尼亚门户城市到波黑自然腹地
7. 简介模板，重复 437 条，模板/文本：`围绕主题游组织停留，串联[place]、[place]、[place]等地点，重点是形成可执行的旅行节奏。`
   样本：materialized-riyxwp-3820｜英国、比利时8天主题游：伦敦到比利时地方生活区；materialized-qoyqjl-4450｜英国、卢森堡14天主题游：布里斯托尔到卢森堡门户城市；materialized-z5miae-4568｜英国、法国13天主题游：斯旺西到波尔多
8. 简介模板，重复 333 条，模板/文本：`围绕铁路旅程组织停留，串联[place]、[place]、[place]，重点是形成可执行的旅行节奏。`
   样本：materialized-o0wr19-46989｜英国5天铁路旅程：爱丁堡到尼斯湖；materialized-qfsrtp-47017｜印度尼西亚5天铁路旅程：普沃勒佐到古突士；materialized-7mxdpn-47024｜安道尔5天铁路旅程：安道尔门户城市到安道尔自然腹地
9. Planner Reason，重复 1249 条，模板/文本：`旅行风格=经典首访，在给定天数内保留3个目的地之间的顺路关系和清晰主题。`
   样本：materialized-e5h5cd-4451｜英国、荷兰5天经典首访：伦敦到荷兰自然腹地；materialized-16uu96m-14919｜斯洛伐克、波兰5天经典首访：布拉迪斯拉发到波兰自然腹地；materialized-1dy4ilo-15603｜阿联酋、阿曼5天经典首访：阿联酋门户城市到阿曼自然腹地
10. Planner Reason，重复 1149 条，模板/文本：`时长=4-6d，5天适合串联3个主要目的地，保持经典旅行的基本节奏。`
   样本：materialized-5zuyuk-46986｜捷克5天经典首访：布拉格到俄斯特拉发；materialized-32xcin-46991｜德国5天经典首访：汉堡到哈瑙；materialized-15ftq6g-47019｜冰岛5天经典首访：雷克雅未克到辛格维利尔国家公园
11. Planner Reason，重复 874 条，模板/文本：`旅行风格=经典首访，在给定天数内保留5个目的地之间的顺路关系和清晰主题。`
   样本：materialized-18pb0m3-160｜匈牙利、摩尔多瓦8天经典首访：沙托劳尔尧乌伊海伊到摩尔多瓦自然腹地；materialized-86172p-161｜匈牙利、波兰9天经典首访：布达佩斯到波兰区域风景带；materialized-sq9c53-5781｜德国、奥地利10天经典首访：奥尔登堡到奥地利区域风景带
12. Planner Reason，重复 737 条，模板/文本：`旅行风格=经典首访，在给定天数内保留4个目的地之间的顺路关系和清晰主题。`
   样本：materialized-3alfy2-0｜匈牙利、捷克8天经典首访：布达佩斯到比尔森；materialized-1quw6uv-768｜捷克、斯洛伐克7天经典首访：布拉格到斯洛伐克自然腹地；materialized-1fh8xg4-1980｜捷克、波兰7天经典首访：布拉格到波兰地方生活区

## 各策略真实生效情况分类

- 主题路线：部分生效。数量 5500，Feed eligible 109，依据：字段+内容+Feed资格；国家组合325，时长24，主题47；时长高度集中；主题高度集中
- 假期长度路线：部分生效。数量 5435，Feed eligible 109，依据：字段+内容+Feed资格；国家组合311，时长8，主题19；时长高度集中；主题高度集中
- 航班/交通组合路线：部分生效。数量 5434，Feed eligible 96，依据：字段+内容+Feed资格；国家组合311，时长14，主题23；时长高度集中；主题高度集中
- 地缘/邻近国家路线：真实生效。数量 5433，Feed eligible 94，依据：字段+内容+Feed资格；国家组合314，时长16，主题34；时长高度集中；主题高度集中
- AI 灵感路线：部分生效。数量 5433，Feed eligible 109，依据：字段+内容+Feed资格；国家组合311，时长6，主题18；时长高度集中；主题高度集中
- 小众目的地路线：部分生效。数量 2780，Feed eligible 34，依据：字段+内容+Feed资格；国家组合283，时长8，主题10；时长高度集中；主题高度集中
- 季节路线：部分生效。数量 1096，Feed eligible 27，依据：字段+内容+Feed资格；国家组合264，时长4，主题5；时长高度集中；主题高度集中
- 其他策略：疑似假实现。数量 37，Feed eligible 0，依据：字段+内容+Feed资格；国家组合17，时长14，主题18；主题高度集中
- 预算/低成本路线：未实现。数量 2，Feed eligible 0，依据：字段+内容+Feed资格；国家组合2，时长2，主题2；全库几乎无预算/低成本记录；时长高度集中；主题高度集中
- 反差或非相邻国家组合：疑似假实现。数量 1，Feed eligible 0，依据：字段+内容+Feed资格；国家组合1，时长1，主题3；时长高度集中；主题高度集中

## 疑似假实现清单

- 其他策略：疑似假实现。字段+内容+Feed资格；国家组合17，时长14，主题18；主题高度集中
- 预算/低成本路线：未实现。字段+内容+Feed资格；国家组合2，时长2，主题2；全库几乎无预算/低成本记录；时长高度集中；主题高度集中
- 反差或非相邻国家组合：疑似假实现。字段+内容+Feed资格；国家组合1，时长1，主题3；时长高度集中；主题高度集中

字段级补充：`coverageContribution`、`plannerReason`、`designStrategies` 在当前展示/Feed 链路中没有直接决定是否进入 Feed；存在“字段存在但不影响真实结果”的风险。

## 最大的五个系统性问题

1. Planner 路线大量 materialized/template 化，国家和地点变化明显，但说明文字、reason 和策略结构重复。
2. 策略字段与真实差异脱节：很多路线都有策略字段，但难以证明它改变了国家组合、天数、预算或主题，而不是同一生成模板。
3. Feed 进入条件被图片验证和 bootstrap 快照强影响，Planner 策略分布不等于用户实际看到的分布。
4. 评分字段分布集中且部分 source-original 为 0；评分参与排序但质量解释力不足。
5. 多份 accepted-routes 备份、bootstrap payload、search cache/review candidates 并存，容易产生旧数据/快照混用误判。

## 审计限制

- 没有运行 Planner，也没有重新生成路线；结论只基于当前保存数据和代码读取链路。
- “高度相似”使用模板归一化和字段分布启发式，不等同人工语义判定。
- 相邻/非相邻国家使用目的地经纬度、洲别和距离启发式；缺经纬度时可能低估。
- Review 历史只保留当前 accepted 主库、search-review-candidates 与少量 generation jsonl，无法完整复原每条被拒绝路线。

## 建议下一步优先调查的三个问题

1. 抽取每个策略的生成前 context 与生成后 record，对比策略是否真实改变国家组合、天数、主题和交通结构。
2. 建立 Review reject log 持久化表，否则无法回答“哪些策略生成很多但被 Review 过滤”。
3. 将 Feed eligible、bootstrap 首屏、accepted 主库分开监控，避免把主库覆盖率误认为用户实际看到的覆盖率。
