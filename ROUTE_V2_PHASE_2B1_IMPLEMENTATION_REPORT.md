# Route Generation V2 Phase 2B-1 Implementation Report

## Summary

本阶段只实现 `RouteCandidate Builder` 纯函数和隔离验证脚本。它根据 `context`、`concept`、`selectDestinationPool()` 已产生的 KG destination pool，以及目标候选数量，生成多条 Phase 2A schema 可接受的 `RouteCandidate`。

本阶段没有接入 Planner，没有接入 materialize，没有写入 Candidate Pool store，也没有改变现有 RouteRecord、Feed、Search、Detail、图片系统、accepted repository 或 bootstrap。

## 候选如何从 KG Pool 产生

新增模块：

- `src/lib/routes/route-candidate-builder.mjs`

Builder 读取的真实输入只有：

- `context`
- `concept`
- KG destination pool
- `targetCount`
- 显式传入的 `seed`

候选构造方式包括：

- 稳定 KG pool 顺序
- 按国家交错的顺序
- seed 控制的稳定旋转顺序
- 按目的地类型混合
- 按名称排序
- 短结构候选
- 延展结构候选
- 反向结构候选

这些候选都来自输入 KG pool，不读取最终 RouteRecord、route skeleton 或 planner record。

## 如何保证候选不同

Builder 使用 `candidateShapeKey()` 对候选去重，shape 包括：

- 国家组合
- 目的地集合
- `proposedOrder`

同时使用 `candidateHasMeaningfulDifference()` 拒绝无意义差异。只有标题不同不算不同候选；完全相同 destinations + proposedOrder 会被去重；如果只是不能改变首尾、目的地集合或距离结构的轻微顺序变化，也不会被当成有效差异。

## 如何保证结果稳定

Builder 不使用 `Math.random()`、当前时间或外部服务。所有排序和旋转都来自稳定 hash 和显式 `seed`。

默认 `createdAt` 固定为 `1970-01-01T00:00:00.000Z`，避免纯函数输出随运行时间变化。

## 数据不足时如何处理

目标数量默认最多 8 条，可配置到 3-12 条。数据不足时返回实际能产生的候选数量，不复制候选、不微调标题、不硬凑数量。

验证脚本中，2 个有效目的地的 KG pool 只产生 1 条候选。

## 修改文件

- 新增 `src/lib/routes/route-candidate-builder.mjs`
- 修改 `src/lib/routes/index.mjs`
- 新增 `scripts/verify-route-v2-phase2b1-candidate-builder.mjs`
- 新增 `ROUTE_V2_PHASE_2B1_IMPLEMENTATION_REPORT.md`

本分支还保留了此前未提交的：

- `ROUTE_V2_PHASE_2B_PROPOSAL.md`

## 测试结果

执行结果：

- `node scripts/verify-route-v2-phase2b1-candidate-builder.mjs`：PASS，受控 KG pool 生成 8 条候选，2 个目的地时只生成 1 条候选，真实 candidate cache 未变化。
- `node scripts/verify-route-v2-phase2a-candidate-pool.mjs`：PASS。
- `node scripts/verify-route-v2-phase1-trace.mjs`：PASS。
- `node scripts/verify-concept-taxonomy.mjs`：PASS。
- `node scripts/verify-gold-cases.mjs`：PASS。
- `node scripts/verify-route-content-quality.mjs`：PASS。
- `git diff --check`：PASS。

## Planner 是否保持未修改

是。Phase 2B-1 没有修改：

- `src/lib/routes/route-composition-planner.mjs`
- `scripts/materialize-route-pool.mjs`

专项验证脚本会检查这两个文件没有 diff。

## 是否影响现有路线和页面

不影响。Builder 没有被 Planner、Feed、Search、Detail 或图片系统读取，也不写真实 `.route-v2-cache`。

## Phase 2B-2 前仍需解决

- 在 `runPipeline()` 中找到 `selectDestinationPool()` 之后、`buildRouteSkeleton()` 之前的最小旁路接入点。
- 使用 `ROUTE_V2_CANDIDATE_POOL_ENABLED=false` 默认关闭真实写入。
- 开启 flag 时只写候选池，不改变 legacy RouteRecord。
- 继续证明 accepted repository、bootstrap、FeedReadyPoolCount、Feed/Search/Detail 结构不变。
