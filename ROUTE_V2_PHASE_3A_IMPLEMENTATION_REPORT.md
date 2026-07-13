# Route Generation V2 Phase 3A Implementation Report

## Summary

Phase 3A 已完成 EvidenceBundle 基础设施：

- 新增 EvidenceBundle schema。
- 新增独立 JSONL store。
- 新增稳定 EvidenceBundle ID。
- 新增 `ROUTE_V2_EVIDENCE_BUNDLE_ENABLED=false` feature flag。
- 新增独立验证脚本。

本阶段没有接入 Planner，没有收集真实证据，没有调用 Tavily / Wikivoyage / 网络服务，没有修改 RouteRecord、Feed、Search、Detail、图片系统、accepted repository、bootstrap 或路线数据。

## 新增内容

### `src/lib/routes/evidence-bundle.mjs`

负责 EvidenceBundle 的纯数据逻辑：

- `EVIDENCE_BUNDLE_SCHEMA_VERSION`
- `EVIDENCE_BUNDLE_STATUSES`
- `createEvidenceBundleId()`
- `createEvidenceItemId()`
- `normalizeEvidenceBundle()`
- `summarizeEvidenceBundle()`
- `validateEvidenceBundle()`

### `src/lib/routes/evidence-bundle-store.mjs`

负责独立 JSONL 存储：

- 默认路径：`.route-v2-cache/route-evidence-bundles.jsonl`
- 默认关闭：`ROUTE_V2_EVIDENCE_BUNDLE_ENABLED=false`
- flag 关闭时不创建文件、不写入
- flag 开启时先校验，再 append JSONL
- 支持 `readAll()` 和 `listByCandidate()`
- 写入失败返回 `evidence-bundle-write-failed`，不抛出到旧系统

### `src/lib/routes/index.mjs`

只新增 Phase 3A 必要导出。

### `scripts/verify-route-v2-phase3a-evidence-bundle.mjs`

独立验证脚本，所有写入都使用临时目录，不污染真实 `.route-v2-cache`。

## EvidenceBundle 字段结构

EvidenceBundle 至少包含：

| 字段 | 说明 |
| --- | --- |
| `schemaVersion` | 当前 schema 版本 |
| `evidenceBundleId` | 稳定 ID |
| `candidateId` | 关联 RouteCandidate |
| `intentId` | 关联 intent |
| `generationSource` | 候选来源 |
| `createdAt` | 记录创建时间，不参与稳定 ID |
| `items[]` | verified / weak_signal / unknown / failed 证据项 |
| `unknowns[]` | 独立 Unknown 记录 |
| `failures[]` | 独立 failed 记录 |
| `summary` | 系统重新计算的结构化统计 |

证据状态仅允许：

- `verified`
- `weak_signal`
- `unknown`
- `failed`

`summary` 不信任调用方输入，始终根据 `items[]`、`unknowns[]`、`failures[]` 重新计算。

## ID 稳定性

EvidenceBundle ID 使用现有共享工具：

- `stableHash`
- `stableJson`
- `cleanString`
- `uniqueStrings`

ID seed 包含：

- `candidateId`
- `intentId`
- `generationSource`
- normalized `items`
- normalized `unknowns`
- normalized `failures`
- `schemaVersion`

ID 不包含：

- `createdAt`
- 调用方传入的 `summary`
- 对象 key 顺序
- `Math.random()`
- 当前时间

专项验证中固定 EvidenceBundle ID 为：

`eb-4634ccdd3416c89341b9`

现有 golden ID 仍保持不变：

- `traceId`
- `candidateId`
- `intentId`
- `candidateShapeKey`

## 拒绝字段

schema 会拒绝明显来自最终 RouteRecord / 展示层的字段，包括：

- `title`
- `canonicalTitle`
- `summary` 文案字段
- `plannerReason`
- `recommendationText`
- `coverUrl`
- `routeId`
- `acceptedAt`
- `contentQualityStatus`

顶层 `summary` 只允许结构化统计字段：

- `verified`
- `weak_signal`
- `unknown`
- `failed`
- `totalItems`
- `totalUnknowns`
- `totalFailures`
- `total`

如果把路线简介或其它文案塞进顶层 `summary`，会被拒绝。

## Store 行为

| 场景 | 结果 |
| --- | --- |
| flag 默认关闭 | 不写入、不创建文件 |
| flag 显式 false | 不写入、不创建文件 |
| flag true + 合法 bundle | append JSONL |
| flag true + 非法 bundle | 不写入，返回 `evidence-bundle-invalid` |
| 写入目标不可写 | 返回 `evidence-bundle-write-failed` |
| 读取空文件 | 返回空数组 |
| 读取 JSONL | 每行独立解析并验证 |

本阶段没有抽象通用 JSONL store。

## 是否接入 Planner

没有接入。

本阶段没有修改：

- `route-composition-planner.mjs`
- `materialize-route-pool.mjs`
- `buildRouteSkeleton()`
- `buildPlannerRecord()`
- Candidate Pool
- DecisionTrace

## 是否影响用户路线

不影响。

原因：

- EvidenceBundle feature flag 默认关闭。
- 没有 Planner sidecar 接入。
- 不读取、不修改 RouteRecord。
- Feed / Search / Detail / 图片系统没有读取 EvidenceBundle。
- accepted repository 和 bootstrap hash 均保持不变。

## 验证结果

已运行：

```text
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

`git diff --check` 没有空白错误；PowerShell 输出了 Windows 工作区常见的 LF/CRLF 提示，但没有整文件换行改写。

专项验证确认：

- Feature Flag 默认关闭。
- 关闭时不创建输出文件。
- 开启时可写入和读取合法 bundle。
- 同一输入生成相同 `evidenceBundleId`。
- 对象 key 顺序变化不影响 ID。
- 时间变化不影响 ID。
- 非法状态被拒绝。
- 非法 evidence item 被拒绝。
- 最终 RouteRecord 字段被拒绝。
- `summary` 数量由系统重新计算。
- `unknown` 与 `failed` 明确分开。
- 真实 Candidate Pool、DecisionTrace、EvidenceBundle cache 未创建或修改。
- 现有 golden ID 保持不变。

## 基线完整性

| 项目 | 结果 |
| --- | --- |
| accepted-routes hash | `AEA28BCC03EAF6CCCE5FD7453F88ECE4F0060789F135EAF837B568D9C43E7E3F` |
| route-feed-bootstrap hash | `9F5E2B2557A9E547073DA4D299F08B5B18B6EBA38B3BD55FC995A16ADF1CD9EF` |
| FeedReadyPoolCount all | 851 |
| FeedReadyPoolCount cross | 357 |
| FeedReadyPoolCount single | 494 |

## 尚未实现

Phase 3A 未实现以下内容：

- 不从 RouteCandidate 自动收集证据。
- 不读取 KG、坐标或距离。
- 不调用 Tavily、Wikivoyage 或网络服务。
- 不接入 Planner。
- 不做候选评分、排序、淘汰或最佳路线选择。
- 不让 EvidenceBundle 影响 Review、Ready Pool 或 Feed。

这些内容应分别留到 Phase 3B / 3C 或后续阶段。

## 是否建议进入 commit 审查

建议进入 commit 审查。

理由：

- 改动范围符合 Phase 3A。
- Feature Flag 默认关闭。
- 用户可见路线和旧系统行为不变。
- 所有专项和回归验证通过。
