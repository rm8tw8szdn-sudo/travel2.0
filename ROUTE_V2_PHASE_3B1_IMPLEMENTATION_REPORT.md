# Route Generation V2 Phase 3B-1 Implementation Report

## Summary

Phase 3B-1 已完成 Local Evidence Collector 纯函数。

本阶段只新增本地证据收集能力：

- 输入 `RouteCandidate`
- 输入 Candidate Builder 使用过的 KG destination pool snapshot
- 输出合法 `EvidenceBundle`

本阶段没有接入 Planner，没有写 EvidenceBundle Store，没有写 JSONL，没有调用 Tavily / Wikivoyage / 网络服务，也没有修改 Candidate Pool、DecisionTrace、RouteRecord、Feed、Search、Detail、图片系统、accepted repository、bootstrap 或路线数据。

## 新增内容

### `src/lib/routes/local-evidence-collector.mjs`

新增：

- `LOCAL_EVIDENCE_COLLECTOR_SOURCE`
- `LOCAL_EVIDENCE_COLLECTOR_CREATED_AT`
- `collectLocalEvidenceBundle()`

`collectLocalEvidenceBundle()` 是纯函数：

- 不读取文件
- 不读取环境变量
- 不读取缓存
- 不调用网络
- 不使用 `Math.random()`
- 不读取当前时间，除非调用方通过 `now` 参数传入
- 不修改 candidate 或 KG pool 输入对象

### `scripts/verify-route-v2-phase3b1-local-evidence-collector.mjs`

新增 Phase 3B-1 独立验证脚本，覆盖单国、跨国、KG 缺失、KG 矛盾、国家矛盾、顺序错误、坐标缺失、坐标非法、距离计算、时长弱信号、稳定性、输入不变和真实缓存不变。

### `src/lib/routes/index.mjs`

只新增最小导出。

## 收集的本地证据

### 1. 目的地身份

对每个 candidate destination：

- 使用 `id` / `wikidataId` / `qid` / `name` 在 KG pool snapshot 中匹配。
- 匹配且关键字段一致时，生成 `verified` item。
- 找不到时，写入 `unknowns[]`。
- 字段矛盾时，写入 `failures[]`。

证据项：

- `evidenceCategory: "destination-identity"`
- `sourceType: "knowledge-graph"`
- `supportsWhichDecision: ["destination-inclusion"]`

### 2. 国家匹配

检查 destination.countryCode 是否属于 candidate.countries：

- 匹配时生成 `verified` item。
- 不匹配时写入 `failures[]`。
- 不自动修正 candidate。

证据项：

- `evidenceCategory: "country-match"`
- `sourceType: "local-computation"`
- `supportsWhichDecision: ["country-composition"]`

### 3. proposedOrder 完整性

检查：

- proposedOrder 中每个 ID 是否存在于 candidate.destinations。
- candidate.destinations 是否都出现在 proposedOrder。
- proposedOrder 是否有重复 ID。

完整时生成 `verified` item；缺失、重复或额外 ID 时写入 `failures[]`。

### 4. 坐标可用性

对每个 destination：

- latitude / longitude 是有限数字且在合法范围内时，生成 `verified` item。
- 坐标缺失时，写入 `unknowns[]`。
- 坐标非法或越界时，写入 `failures[]`。

### 5. 相邻目的地距离

仅当相邻两个目的地坐标都合法时：

- 使用本地 haversine 计算距离。
- 生成 `verified` item。
- 记录 `from`、`to`、`distanceKm`。

坐标不足时写入 `unknowns[]`，不伪造距离，也不判断交通方式。

### 6. 时长适配

只生成 `weak_signal`：

- durationDays
- destinationCount
- daysPerDestination
- travelStyle
- pace

本地启发式不会被标记为 `verified`，也不会用于淘汰、评分或选择候选。

### 7. 默认 Unknown

明确记录本阶段无法验证：

- `transportFeasibility`
- `seasonalFit`
- `budgetFit`

## EvidenceBundle 行为

输出必须通过 `validateEvidenceBundle()`。

`items[]` 中只包含：

- `verified`
- `weak_signal`

`unknown` 只进入 `unknowns[]`。

`failed` 只进入 `failures[]`。

Phase 3B-1 all-matched fixture 的 EvidenceBundle ID：

`eb-c1d89ba2875b67289c97`

该 ID 是 Phase 3B-1 local evidence collector 输出的 golden，不改变 Phase 3A golden，也不改变旧 V2 golden ID。

## 严格边界确认

本阶段没有修改：

- `route-composition-planner.mjs`
- `materialize-route-pool.mjs`
- Candidate Pool
- DecisionTrace
- EvidenceBundle Store
- RouteRecord
- Feed
- Search
- Detail
- 图片系统
- accepted repository
- route-feed-bootstrap.js

本阶段没有：

- 写入任何 JSONL
- 自动收集真实 Planner 候选证据
- 调用 Tavily / Wikivoyage / 网络服务
- 候选评分、排序、淘汰或最佳路线选择
- 开始 Phase 3B-2 或 Phase 3C

## 验证场景

专项脚本覆盖：

1. 单国家三城市，全部匹配。
2. 跨国家候选。
3. KG 缺少一个目的地。
4. KG 字段矛盾。
5. 国家代码矛盾。
6. proposedOrder 缺失目的地。
7. proposedOrder 有重复 ID。
8. 坐标缺失。
9. 坐标非法。
10. 正常计算多个相邻距离。
11. 短行程多目的地，只产生 weak_signal。
12. 输入对象未被修改。
13. 相同输入输出稳定。
14. 不产生 title、summary 文案、plannerReason、routeId 等禁止字段。
15. 输出全部通过 EvidenceBundle schema 校验。
16. 真实 Candidate Pool、DecisionTrace、EvidenceBundle cache 未创建或修改。

## 测试结果

已运行：

```text
node scripts/verify-route-v2-phase3b1-local-evidence-collector.mjs
node scripts/verify-route-v2-phase3a-evidence-bundle.mjs
node scripts/verify-route-v2-tooling-cleanup.mjs
node scripts/verify-route-v2-phase2b2-planner-sidecar.mjs
node scripts/verify-route-v2-phase2b1-candidate-builder.mjs
node scripts/verify-route-v2-phase2a-candidate-pool.mjs
node scripts/verify-route-v2-phase1-trace.mjs
node scripts/verify-concept-taxonomy.mjs
node scripts/verify-gold-cases.mjs
node scripts/verify-route-content-quality.mjs
git diff --check
```

结果：全部 PASS。

## 基线完整性

| 项目 | 结果 |
| --- | --- |
| accepted-routes hash | `AEA28BCC03EAF6CCCE5FD7453F88ECE4F0060789F135EAF837B568D9C43E7E3F` |
| route-feed-bootstrap hash | `9F5E2B2557A9E547073DA4D299F08B5B18B6EBA38B3BD55FC995A16ADF1CD9EF` |
| FeedReadyPoolCount all | 851 |
| FeedReadyPoolCount cross | 357 |
| FeedReadyPoolCount single | 494 |
| real Candidate Pool cache | 未创建或修改 |
| real DecisionTrace cache | 未创建或修改 |
| real EvidenceBundle cache | 未创建或修改 |

旧 golden ID 保持不变：

- `traceId`
- `candidateId`
- `intentId`
- `candidateShapeKey`

## 是否影响用户路线

不影响。

原因：

- 本阶段只是纯函数。
- 没有接入 Planner。
- 没有写入 store。
- 没有修改任何用户可见读取链路。
- RouteRecord、Feed、Search、Detail、图片系统完全不读取 Local Evidence Collector。

## 是否建议进入 commit 审查

建议进入 commit 审查。

理由：

- 改动范围符合 Phase 3B-1。
- 所有输出均为合法 EvidenceBundle。
- 所有测试通过。
- 旧系统和用户路线完全不变。
