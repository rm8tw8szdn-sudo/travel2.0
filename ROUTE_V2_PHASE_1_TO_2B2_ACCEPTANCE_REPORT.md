# Route Generation V2 Phase 1 to Phase 2B-2 Acceptance Report

## 1. 当前已经具备的能力

目前 Route Generation V2 已完成并验收以下能力：

- Phase 1：DecisionTrace trace-only 基础设施。
- Phase 2A：RouteCandidate schema 与独立 Candidate Pool store。
- Phase 2B-1：RouteCandidate Builder 纯函数，可从 KG destination pool 生成稳定候选。
- Phase 2B-2：Planner sidecar 接入，在 `selectDestinationPool()` 之后、`buildRouteSkeleton()` 之前旁路生成并写入候选。

这些能力当前只用于记录和验证，不改变旧系统最终 `RouteRecord`。

## 2. 用户现在能否看到变化

不能。默认配置仍为：

- `ROUTE_V2_TRACE_ENABLED=false`
- `ROUTE_V2_CANDIDATE_POOL_ENABLED=false`

因此用户在 Feed、Search、Detail、图片系统和路线页不会看到任何变化。

## 3. 10 组场景验收结果

所有场景均使用临时目录和受控 mock KG，不调用外部服务，不写真实 `.route-v2-cache`。

| 场景 | 覆盖点 | 旧系统最终结果 | 候选数 | 结果 |
| --- | --- | --- | ---: | --- |
| S01 | 单国家短行程，日本 6 天 | 生成旧 RouteRecord | 7 | PASS |
| S02 | 单国家长行程，日本 14 天 Deep Dive | 生成旧 RouteRecord | 8 | PASS |
| S03 | 跨国家路线，AT/SK/HU/CZ | 生成旧 RouteRecord | 8 | PASS |
| S04 | 瑞士 Rail Journey | 生成旧 RouteRecord | 8 | PASS |
| S05 | 英国 Road Trip | 生成旧 RouteRecord | 8 | PASS |
| S06 | 法国 Theme | 生成旧 RouteRecord | 8 | PASS |
| S07 | 希腊 Island Hopping | 生成旧 RouteRecord | 7 | PASS |
| S08 | KG pool 较少，3 个目的地 | 生成旧 RouteRecord | 7 | PASS |
| S09 | 只有 2 个有效目的地 | 旧 Planner 拒绝 `missing-destinations`，候选生成 1 条 | 1 | PASS |
| S10 | 空或非法 pool | 旧 Planner 拒绝 `missing-destinations`，不生成候选 | 0 | PASS |

验收统计：

- 通过场景：10 / 10
- flag off：Candidate Builder 不运行，不写候选。
- flag on：候选在旧 RouteRecord 生成前写入临时 Candidate Pool。
- flag on/off：旧 RouteRecord 深度相等。
- 写入失败：旧路线仍正常生成或保持原拒绝结果。
- 同一输入重复运行：候选内容与顺序稳定。

## 4. 候选样例

以下只展示代表性场景。候选差异来自国家组合、目的地组合、顺序或路线长度，不是只改 ID、标题或说明文字。

### S02 日本 14 天 Deep Dive

旧系统最终路线：日本 14 天区域深度，旧 RouteRecord 不变。

| # | 国家 | proposedOrder | 目的地数 | generation method | 主要差异 |
| ---: | --- | --- | ---: | --- | --- |
| 1 | JP | Q242666 > Q1490 > Q35765 > Q19869 > Q169134 | 5 | stable-pool-order | 基准顺序 |
| 2 | JP | Q19869 > Q169134 > Q121879 > Q39231 > Q200516 | 5 | seed-rotated-order-a | 目的地集合和起点不同 |
| 3 | JP | Q121879 > Q39231 > Q200516 > Q34600 > Q181386 | 5 | seed-rotated-order-b | 目的地集合不同 |
| 4 | JP | Q242666 > Q1490 > Q35765 > Q169134 > Q121879 | 5 | entity-type-mix | 类型混合顺序不同 |
| 5 | JP | Q242666 > Q1490 > Q35765 > Q19869 | 4 | short-structure | 路线长度更短 |
| 6 | JP | Q242666 > Q1490 > Q35765 > Q19869 > Q169134 > Q121879 | 6 | extended-structure | 路线长度更长 |
| 7 | JP | Q169134 > Q19869 > Q35765 > Q1490 > Q242666 | 5 | reverse-structure | 顺序反向，首尾不同 |
| 8 | JP | Q19869 > Q169134 > Q121879 > Q39231 | 4 | rotated-short-structure | 旋转后短结构 |

### S03 AT/SK/HU/CZ 跨国家路线

旧系统最终路线：中欧多国串联，旧 RouteRecord 不变。

| # | 国家 | proposedOrder | 目的地数 | generation method | 主要差异 |
| ---: | --- | --- | ---: | --- | --- |
| 1 | CZ, AT | Q1085 > Q1670 > Q1741 > Q1799 | 4 | stable-pool-order | 基准组合 |
| 2 | AT, CZ, HU, SK | Q1741 > Q1085 > Q1781 > Q1780 | 4 | country-balanced-order | 国家组合扩展到 4 国 |
| 3 | AT, SK, HU, CZ | Q1799 > Q1780 > Q1781 > Q1085 | 4 | seed-rotated-order-a | 4 国顺序不同 |
| 4 | HU, CZ, AT | Q1781 > Q1085 > Q1670 > Q1741 | 4 | seed-rotated-order-b | 起点和国家组合不同 |
| 5 | AT, CZ | Q1741 > Q1799 > Q1085 > Q1670 | 4 | entity-type-mix | 类型顺序不同 |
| 6 | CZ, AT | Q1085 > Q1670 > Q1741 | 3 | short-structure | 路线更短 |
| 7 | CZ, AT, SK | Q1085 > Q1670 > Q1741 > Q1799 > Q1780 | 5 | extended-structure | 路线更长并加入 SK |
| 8 | AT, CZ | Q1799 > Q1741 > Q1670 > Q1085 | 4 | reverse-structure | 顺序和首尾不同 |

### S04 瑞士 Rail Journey

旧系统最终路线：瑞士 8 天铁路旅程，旧 RouteRecord 不变。

| # | 国家 | proposedOrder | 目的地数 | generation method | 主要差异 |
| ---: | --- | --- | ---: | --- | --- |
| 1 | CH | Q68965 > Q7024 > Q68986 > Q68144 | 4 | stable-pool-order | 基准顺序 |
| 2 | CH | Q7024 > Q68986 > Q68144 > Q18721 | 4 | seed-rotated-order-a | 起点和目的地集合不同 |
| 3 | CH | Q68144 > Q18721 > Q72 > Q68965 | 4 | seed-rotated-order-b | 起点和终点不同 |
| 4 | CH | Q68965 > Q7024 > Q72 > Q68986 | 4 | entity-type-mix | 类型混合加入 Q72 |
| 5 | CH | Q68965 > Q7024 > Q68986 | 3 | short-structure | 路线更短 |
| 6 | CH | Q68965 > Q7024 > Q68986 > Q68144 > Q18721 | 5 | extended-structure | 路线更长 |
| 7 | CH | Q68144 > Q68986 > Q7024 > Q68965 | 4 | reverse-structure | 顺序反向 |
| 8 | CH | Q7024 > Q68986 > Q68144 | 3 | rotated-short-structure | 旋转后短结构 |

### S08 KG Pool 较少

旧系统最终路线：日本 5 天经典首访，旧 RouteRecord 不变。

| # | 国家 | proposedOrder | 目的地数 | generation method | 主要差异 |
| ---: | --- | --- | ---: | --- | --- |
| 1 | JP | Q34600 > Q39231 > Q1490 | 3 | stable-pool-order | 基准顺序 |
| 2 | JP | Q1490 > Q34600 > Q39231 | 3 | seed-rotated-order-a | 起点不同 |
| 3 | JP | Q39231 > Q1490 > Q34600 | 3 | seed-rotated-order-b | 起点不同 |
| 4 | JP | Q34600 > Q1490 > Q39231 | 3 | entity-type-mix | 中间点不同 |
| 5 | JP | Q34600 > Q39231 | 2 | short-structure | 路线更短 |
| 6 | JP | Q1490 > Q39231 > Q34600 | 3 | reverse-structure | 首尾不同 |
| 7 | JP | Q1490 > Q34600 | 2 | rotated-short-structure | 旋转后短结构 |

### S09 只有 2 个有效目的地

旧 Planner 拒绝：`missing-destinations`。这是旧系统质量门结果，不是 Candidate Builder 失败。

| # | 国家 | proposedOrder | 目的地数 | generation method | 主要差异 |
| ---: | --- | --- | ---: | --- | --- |
| 1 | JP | Q39231 > Q1490 | 2 | stable-pool-order | 数据不足，只生成 1 条，不硬凑到 8 条 |

## 5. 候选是否真实且有差异

是。10 组验收均确认：

- 候选全部通过 Phase 2A schema。
- 候选 shape 不重复。
- 差异来自国家、目的地集合、`proposedOrder` 或目的地数量。
- 数据不足时不会复制候选硬凑。
- S09 只有 2 个有效目的地时只生成 1 条候选。
- S10 空或非法 pool 时生成 0 条候选。

## 6. 输出是否稳定

稳定。每组同一输入重复运行，候选 JSONL 内容和顺序完全一致。

Builder 不依赖：

- `Math.random()`
- 当前时间
- 外部服务

## 7. 失败降级是否有效

有效。每组都验证了 Candidate Pool 写入失败时：

- 旧 Planner 仍继续运行。
- 对于可生成路线的场景，旧 RouteRecord 与 flag off 完全一致。
- 对于旧 Planner 本身拒绝的场景，拒绝结果与 flag off 一致。

## 8. 旧系统是否保持不变

保持不变。

| 项目 | 结果 |
| --- | --- |
| accepted-routes.json SHA-256 | `aea28bcc03eaf6ccce5fd7453f88ece4f0060789f135eaf837b568d9c43e7e3f` |
| route-feed-bootstrap.js SHA-256 | `9f5e2b2557a9e547073da4d299f08b5b18b6eba38b3bd55fc995a16adf1cd9ef` |
| FeedReadyPoolCount all | 851 |
| FeedReadyPoolCount cross | 357 |
| FeedReadyPoolCount single | 494 |
| 真实 Candidate Pool cache | 未创建 |
| 真实 DecisionTrace cache | 未创建 |

HTTP/API 冒烟：

| 项目 | 结果 |
| --- | --- |
| 首页 `/travel-collection/` | HTTP 200 |
| 路线页 `/travel-collection/routes.html` | HTTP 200 |
| Feed API | HTTP 200，`ok=true`，返回 6 条 |
| Detail API | HTTP 200，`ok=true` |
| Search API | 隔离 cache/analytics 下 HTTP 200，`ok=true`，返回 suggestions |

Feed、Search、Detail 不读取 Candidate Pool：

- `verify-route-v2-phase2a-candidate-pool.mjs` 已更新为允许 Planner sidecar，但继续确认 Feed/Search/Detail/materialize 不读取 Candidate Pool。
- `verify-route-v2-phase2b2-planner-sidecar.mjs` 也确认 Feed/Search/Detail 相关文件 hash 不变。

## 9. 测试结果

全部通过：

- `node scripts/verify-route-v2-phase2b2-planner-sidecar.mjs`
- `node scripts/verify-route-v2-phase2b1-candidate-builder.mjs`
- `node scripts/verify-route-v2-phase2a-candidate-pool.mjs`
- `node scripts/verify-route-v2-phase1-trace.mjs`
- `node scripts/verify-concept-taxonomy.mjs`
- `node scripts/verify-gold-cases.mjs`
- `node scripts/verify-route-content-quality.mjs`
- `git diff --check`

## 10. 当前局限

本阶段只验证候选生成和旁路记录能力。

当前还没有：

- 候选选择。
- 候选评分。
- `selected` / `rejected`。
- EvidenceBundle。
- ValidationResult。
- 用候选改变最终 RouteRecord。
- Feed/Search/Detail 使用候选。
- 路线质量提升。

S09 和 S10 也说明：Candidate Builder 可以在旧 Planner 拒绝前生成候选或安全返回空，但它不会改变旧系统最终是否接受路线。

## 11. 是否建议提交 Phase 2B-2

建议提交。阶段目标已达成，且旧系统保持不变。

## 12. 是否适合开始 Phase 3

技术上 Phase 1 到 Phase 2B-2 已具备进入 Phase 3 的基础：候选可以在旧 RouteRecord 前生成并旁路记录。

但建议先完成 Phase 2B-2 的 commit 审查、提交、PR、合并和打标签，再开始 Phase 3。
