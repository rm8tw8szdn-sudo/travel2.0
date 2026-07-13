# Route Generation V2 Migration Matrix

本矩阵只描述迁移方案，不代表已经实施。现阶段不得修改业务代码、Planner、Feed、数据库、缓存或路线数据。

| Phase | 目标 | 新增内容 | 修改文件 | 禁止修改 | 风险 | 验收方式 | 回滚方式 | 是否影响现有用户 |
|---|---|---|---|---|---|---|---|---|
| Phase 0 | 保持现状并冻结旧链路 | 当前 accepted repository hash、bootstrap hash、legacy status report | 仅文档或审计记录 | `accepted-routes.json`, `accepted-repository.mjs`, `route-composition-planner.mjs`, `materialize-route-pool.mjs`, `routes.js`, `route-feed-bootstrap.js` | 低 | Feed/Search/Detail 行为完全不变；能记录当前 repositoryVersion | 无业务回滚；删除审计记录即可 | 否 |
| Phase 1 | 只增加 DecisionTrace | `DecisionTrace` schema、trace writer、trace storage、Unknown 标记 | 未来可新增 `decision-trace-store.mjs`, `decision-trace-schema.mjs`; 对 Planner 只加旁路 writer | 不改变 RouteRecord 输出；不改 Feed；不改 accepted route schema required by old UI | 中 | 同一输入下 RouteRecord 不变；每条新路线有 trace；写 trace 失败不阻断生成 | 关闭 trace writer flag；忽略 trace storage | 否 |
| Phase 2 | 新增 Candidate Pool | `RouteCandidate` schema、candidate pool storage、selected/rejected 状态、rejectionReasons | 未来可新增 `route-candidate-pool.mjs`; Planner 增加 V2 candidate path behind flag | 不批量重写 accepted routes；不改变 legacy single winner path | 中 | 同 intent 有多个候选；每个 rejected candidate 有原因；没有候选直接写 Unknown/needsEvidence | 关闭 V2 candidate flag，回 legacy generator | 否 |
| Phase 3 | 接入 EvidenceBundle | `EvidenceBundle` schema、evidence bundle store、Tavily/Wikivoyage facts adapter、supportsWhichDecision | 未来新增 `evidence-bundle-schema.mjs`, `evidence-bundle-store.mjs`; Web evidence adapter 只写 evidence | Feed 不得调用 Tavily；Tavily 不得直接生成 RouteRecord；summary 不得作为 evidence | 中到高 | Tavily 失败不会生成 accepted route；EvidenceBundle 有 source/confidence/freshness/supportsWhichDecision | 关闭 web evidence enrichment；候选转 pending-evidence | 否 |
| Phase 4 | 实现一个独立策略，建议 Transport | Transport V2 requirement、segment evidence validation、A/B fixture | 未来新增 strategy V2 module/tests；Validator 读取 EvidenceBundle | 不同时实现多个策略；不改 legacy materialized Transport 批量逻辑 | 中 | Transport route 至少一段 verified transport-connection 或 segment-metric；rail/road A/B 能改变 order 或 reject | 关闭 Transport V2 flag，继续 legacy label | 默认否，除非允许 V2 route 入 Ready Pool |
| Phase 5 | 实现 Budget 或 Contrast | Budget cost evidence 或 Contrast mobility/value evidence；strategy-specific validation | 未来新增 Budget/Contrast evidence fixtures 和 validator rules | 不启用旧 `Budget` disabled strategy 为 accepted；不让 Contrast 无证据拼接 | 高 | Budget 有 currency/source/freshness/confidence；Contrast 有移动可行性和非邻近组合价值证据 | 关闭 Budget/Contrast V2 flag；保留 candidate pool 审计 | 默认否 |
| Phase 6 | 新旧路线并行 | generationVersion、intentId、candidateId、decisionTraceId、validationId；legacy/V2 review stats；Feed V2 gating | 未来可轻量改 accepted public record adapter 和 review stats | 不破坏 legacy route read path；不删除旧路线；不让 Search realtime 直接进 Feed | 中 | V2 route 可 accepted 但可被 Feed flag 排除；legacy/V2 可分开统计 | Feed flag 切回 legacy only；Repository 继续保留 V2 但隐藏 | 可配置，默认否 |
| Phase 7 | 逐步淘汰旧 materialized 路线 | legacy retirement audit、batch replacement report、Ready Pool gating | 未来改 Ready Pool policy，而不是直接删 accepted data | 不直接删除原始 accepted routes；不一次性替换 5500 条 | 高 | 每批替换后 Feed 可用数不下降；覆盖不下降；模板相似率下降；V2 trace 完整 | 恢复 legacy ready flag；使用 accepted backup/repositoryVersion 回退 | 是，必须灰度 |

## Phase 优先级建议

推荐第一步实施 Phase 1，而不是直接改生成。

原因：

- 当前最大的不可解释性来自缺少 DecisionTrace。
- Phase 1 不改变用户体验，风险最低。
- 后续 Candidate Pool、EvidenceBundle、策略验证都依赖 traceId / intentId / candidateId。

## 迁移守则

- 新存储与 `.route-v2-cache/accepted-routes.json` 分离。
- Feed 默认 legacy-first。
- V2 任何外部数据失败都只能导致 pending/needs-review，不得伪造 accepted。
- 所有 V2 route 进入 Feed 前必须可追踪到 DecisionTrace 和 ValidationResult。
- 所有 Phase 必须支持 feature flag 回滚。
