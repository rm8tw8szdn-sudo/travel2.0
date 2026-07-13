# Route Generation V2 Phase 2B-2 Implementation Report

## Summary

本阶段把 Phase 2B-1 的 `RouteCandidate Builder` 作为 Planner sidecar 接入 `route-composition-planner.mjs`。

接入点位于 `runPipeline()` 中：

1. `selectDestinationPool()`
2. `writeCandidatePoolSidecarSafe()`
3. `buildRouteSkeleton()`

因此候选在旧系统最终 `RouteRecord` 生成之前产生，但旧系统仍继续使用原来的 `buildRouteSkeleton()` 输出，不读取候选结果。

## 修改文件

- `src/lib/routes/route-composition-planner.mjs`
- `scripts/verify-route-v2-phase2b2-planner-sidecar.mjs`
- `ROUTE_V2_PHASE_2B2_IMPLEMENTATION_REPORT.md`

## Feature Flag

- `ROUTE_V2_CANDIDATE_POOL_ENABLED=false`

默认关闭。关闭时：

- 不调用 Candidate Builder。
- 不写 Candidate Pool。
- 不创建真实 `.route-v2-cache/route-candidate-pool.jsonl`。
- 现有 Planner 行为保持不变。

开启时：

- 在 `selectDestinationPool()` 后旁路生成候选。
- 通过 Candidate Pool store 追加写入候选。
- 不改变 `RouteRecord`。
- 不影响 accepted repository、Feed、Search、Detail 或图片系统。

## Sidecar 行为

新增 `writeCandidatePoolSidecarSafe()`：

- 先检查 `candidatePoolStore.enabled()`。
- flag 关闭时立即返回，不调用 builder。
- flag 开启时调用 `buildRouteCandidatesFromPool()`。
- 写入候选时追加 `planner-sidecar-stage=after-selectDestinationPool-before-buildRouteSkeleton` 信号，供验证和后续追踪使用。
- 写入失败时捕获错误并返回诊断，不抛出，不阻断旧 Planner。

## RouteRecord 不变

专项脚本对比了同一输入在 flag 关闭和开启时的 `accepted[0].record`，结果深度相等。

候选只写入 Candidate Pool，不参与：

- `buildRouteSkeleton()`
- LLM refine
- decision tests
- evidence check
- `buildPlannerRecord()`
- validation
- dedupe

## 写入失败降级

专项脚本把 Candidate Pool path 指向目录，触发写入失败。结果：

- legacy route 仍正常生成。
- `RouteRecord` 与 flag off 结果深度相等。
- 写入失败不影响 accepted/rejected 结果。

## 测试结果

已通过：

- `node scripts/verify-route-v2-phase2b2-planner-sidecar.mjs`

专项结果：

- flag off 不调用 builder、不写候选。
- flag on 写入 8 条候选。
- 候选写入发生在 `buildRouteSkeleton()` 之前。
- RouteRecord 开关前后完全一致。
- 写入失败安全降级。
- accepted repository、bootstrap、Feed/Search/Detail 相关文件 hash 不变。
- 真实 `.route-v2-cache/route-candidate-pool.jsonl` 未创建或未变化。

最终执行结果：

- `node scripts/verify-route-v2-phase2b1-candidate-builder.mjs`：PASS。
- `node scripts/verify-route-v2-phase2a-candidate-pool.mjs`：PASS。
- `node scripts/verify-route-v2-phase1-trace.mjs`：PASS。
- `node scripts/verify-concept-taxonomy.mjs`：PASS。
- `node scripts/verify-gold-cases.mjs`：PASS。
- `node scripts/verify-route-content-quality.mjs`：PASS。
- `git diff --check`：PASS。

为适配 Phase 2B-2，两个历史验证脚本的阶段边界断言已更新：

- Phase 2A 验证继续确认 Candidate Pool 与 accepted repository 分离，并确认 Feed/Search/Detail/materialize 不读取 Candidate Pool；Planner 在 Phase 2B-2 允许读取 sidecar。
- Phase 2B-1 验证继续确认 builder 纯函数不写文件，并确认 materialize 未被修改；Planner 在 Phase 2B-2 允许接入 sidecar。

## 未开始内容

本阶段没有实现：

- Candidate 选择
- 评分
- selected / rejected
- EvidenceBundle
- ValidationResult
- Feed/Search/Detail 接入
- 图片接入
- Phase 3

## 回滚方式

回滚本阶段只需要移除：

- `route-composition-planner.mjs` 中的 Candidate Builder / Candidate Pool import、store 初始化和 sidecar 调用。
- `scripts/verify-route-v2-phase2b2-planner-sidecar.mjs`
- 本报告。

由于 flag 默认关闭，生产行为在未开启时不受影响。
