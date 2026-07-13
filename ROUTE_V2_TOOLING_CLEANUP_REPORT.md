# Route Generation V2 Tooling Cleanup Report

## Summary

本次只做 Route Generation V2 小型工具层清理，没有修改 Planner 主链路、RouteRecord、Feed、Search、Detail、图片系统、accepted repository、bootstrap 或真实缓存。

当前分支：`codex/route-v2-tooling-cleanup`

## 合并的重复工具

| 重复项 | 新位置 | 使用方 | 说明 |
| --- | --- | --- | --- |
| `envFlag` | `src/lib/routes/route-v2-env.mjs` | `decision-trace-store.mjs`, `route-candidate-pool.mjs` | 保留原有 true 值集合和默认值行为；`decision-trace-store.mjs` 继续 re-export `envFlag`，避免破坏既有导出。 |
| `stableJson` / `stableHash` | `src/lib/routes/route-v2-utils.mjs` | `decision-trace-schema.mjs`, `route-candidate-pool.mjs`, `route-candidate-builder.mjs` | 保持原有稳定序列化、对象 key 排序、数组顺序和 SHA-256 输出。 |
| `cleanString` / `unique` | `src/lib/routes/route-v2-utils.mjs` | `decision-trace-schema.mjs`, `route-candidate-pool.mjs`, `route-candidate-builder.mjs` | 共享 `cleanString` 和 `uniqueStrings`；调用处继续以本地别名 `unique` 使用，避免改变逻辑语义。 |
| `fileState` / `sha256IfExists` | `scripts/lib/route-v2-test-file-state.mjs` | Phase 2A / 2B-1 / 2B-2 验证脚本 | 只抽取测试文件状态和 hash helper，核心断言仍保留在各阶段脚本内。 |

## 新增验证

新增 `scripts/verify-route-v2-tooling-cleanup.mjs`，用固定输入锁定：

- `traceId`
- `candidateId`
- 派生 `intentId`
- `candidateShapeKey`
- 8 条候选的顺序、method 和 proposedOrder

该脚本也确认运行时不修改 accepted repository 和 `route-feed-bootstrap.js`。

## 仍然保留的重复

| 项目 | 原因 | 后续建议 |
| --- | --- | --- |
| legacy `materialize-route-pool.mjs` 内的 hash / unique | 用户明确禁止触碰 legacy materialize hash；该路径关系到旧 materialized ID。 | 等 V2 接管最终 RouteRecord 后再评估。 |
| `accepted-repository.mjs` 的 feed 排序 hash | 这是 Feed 既有排序和随机化行为的一部分，不能在本轮改变。 | 不建议在 Phase 3 前处理。 |
| 图片预热和 feed 验证脚本中的 hash | 属于图片/Feed 审计链路，本轮禁止修改图片系统和 Feed。 | 单独图片工具整理时再看。 |
| 各阶段验证脚本的核心场景断言 | 这些重复是独立回归保护，不能为了减少代码削弱测试隔离。 | 只抽取纯文件状态 helper，保留阶段断言。 |

## ID 保持不变

`node scripts/verify-route-v2-tooling-cleanup.mjs` 已通过：

- `traceIdStable: true`
- `candidateIdStable: true`
- `intentIdStable: true`
- `candidateShapeKeyStable: true`
- `candidateCount: 8`

固定 golden 值未因工具抽取而变化。

## Planner 和用户结果影响

- 未修改 `route-composition-planner.mjs`。
- 未修改 `buildRouteSkeleton()`。
- 未修改 `buildPlannerRecord()`。
- 未修改 Candidate Sidecar 接入位置。
- 未修改 Feature Flag 默认值。
- 未修改 RouteRecord、Feed、Search、Detail、图片系统。
- `ROUTE_V2_CANDIDATE_POOL_ENABLED=false` 默认仍保持关闭。

Phase 2B-2 验证显示 Feature Flag 开关前后 RouteRecord 深度一致，Candidate Pool 写入失败仍安全降级。

## 数据完整性

| 检查项 | 结果 |
| --- | --- |
| accepted-routes.json SHA-256 | `aea28bcc03eaf6ccce5fd7453f88ece4f0060789f135eaf837b568d9c43e7e3f` |
| route-feed-bootstrap.js SHA-256 | `9f5e2b2557a9e547073da4d299f08b5b18b6eba38b3bd55fc995a16adf1cd9ef` |
| FeedReadyPoolCount all | 851 |
| FeedReadyPoolCount cross | 357 |
| FeedReadyPoolCount single | 494 |
| 真实 Candidate Pool cache | 未创建 |
| 真实 DecisionTrace cache | 未创建 |

## 测试结果

已通过：

- `node scripts/verify-route-v2-tooling-cleanup.mjs`
- `node scripts/verify-route-v2-phase2b2-planner-sidecar.mjs`
- `node scripts/verify-route-v2-phase2b1-candidate-builder.mjs`
- `node scripts/verify-route-v2-phase2a-candidate-pool.mjs`
- `node scripts/verify-route-v2-phase1-trace.mjs`
- `node scripts/verify-concept-taxonomy.mjs`
- `node scripts/verify-gold-cases.mjs`
- `node scripts/verify-route-content-quality.mjs`
- `git diff --check`

## 是否建议进入 Commit 审查

建议进入 commit 审查。本轮改动范围符合小型工具层清理边界，ID golden、V2 阶段测试、基础回归、repository/bootstrap hash 和 FeedReadyPoolCount 均通过。
