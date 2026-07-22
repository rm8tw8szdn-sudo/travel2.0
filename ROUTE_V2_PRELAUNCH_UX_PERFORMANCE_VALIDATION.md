# Route Generation V2 上线前本地体验与性能验收

日期：2026-07-22
基线分支：`codex/route-v2-knowledge-entity-layer-p1b-batch02`
基线提交：`288c136f39258b199401387c11e21227053184e8`

## 1. 最终结论

结论：**PASS WITH FOLLOW-UPS**。

真实页面、13 组搜索、Route V2 完整链路、357 条严格 Feed 全量耗尽、六张无限流、图片降级、桌面与移动端展示、服务重启和功能开关关闭回归均通过。上线前发现的搜索性能、结构化约束兼容、Ready 状态保持、证据支持的桥接城市选择和路线介绍质量问题已经做最小修复。

未给出纯 PASS 的原因不是功能失败，而是最早一轮浏览器验收没有隔离默认运行时缓存，图片代理和搜索缓存使 `.route-v2-cache` 增加了 4 个文件。accepted routes 与 knowledge 资产没有变化；后续所有服务进程均改用 `%TEMP%` 隔离目录。该问题作为验收流程保护项保留，不能宣称 cache 指纹不变。

## 2. 验收环境

- Windows / PowerShell，本地 Node.js `v24.18.0`。
- 启动命令：`$env:PORT=4174; node server.js`。
- 页面：`http://127.0.0.1:4174/travel-collection/routes.html`。
- API：`http://127.0.0.1:4174/api/routes/discovery`。
- 真实页面验收使用 Codex 内置 Chromium 浏览器；不是仅运行 verifier。
- 桌面视口：`1280 × 800`；移动视口：`390 × 844`。
- 验收完成后服务已停止，端口 4174 已释放。
- 截图保存在系统临时目录，未加入 Git。

## 3. Feature Flags 与隔离

完整 V2 链路验收显式开启：

- `ROUTE_V2_INTENT_ENABLED=true`
- `ROUTE_V2_TIME_INTENT_ENABLED=true`
- `ROUTE_V2_CANDIDATE_POOL_ENABLED=true`
- `ROUTE_V2_DECISION_TRACE_ENABLED=true`
- `ROUTE_V2_EVIDENCE_BUNDLE_ENABLED=true`
- `ROUTE_V2_LOCAL_EVIDENCE_INDEX_ENABLED=true`
- `ROUTE_V2_EVIDENCE_VALIDATION_ENABLED=true`
- `ROUTE_V2_PUBLICATION_GATE_ENABLED=true`
- `ROUTE_V2_READY_POOL_ENABLED=true`

在线 Evidence、Tavily、Wikivoyage 和 `SEARCH_AUTO_ACCEPT_GENERATED` 保持关闭。Candidate、Trace、EvidenceBundle、Ready Pool、Search Cache、Review 和 Analytics 都写入 `%TEMP%` 隔离目录。代码中的所有新功能开关默认值仍为 `false`。

## 4. 真实页面搜索结果

| 输入 | 实际结果摘要 | 结论 |
| --- | --- | --- |
| `东京京都大阪7天` | 返回 V2 7 天路线及兼容成熟路线，三个指定城市均保留 | PASS |
| `东京→京都→大阪7天` | 固定顺序保持为东京、京都、大阪 | PASS |
| `东京→京都→奈良→大阪7天` | 只展示完整包含四城且顺序一致的 7 天路线 | PASS |
| `日本7天` | 6 条结果，时长均落在明确 7 天意图的兼容范围内 | PASS |
| `2月去日本7天` | 返回结果但明确季节证据待确认，没有声称“2 月已验证适合” | PASS |
| `日本2天` | 返回 2 天短行程，不再用长行程填充 | PASS |
| `2月` | 进入目的地推荐，返回成熟或 `needs-review` 结果，不伪造月份适宜性 | PASS |
| `2` | 按产品规则解析为 2 天，不解析为 2 月 | PASS |
| `冬天` | 保留模糊季节，结果继续要求季节证据 | PASS |
| `7天` | 返回 6 条 7 天结果 | PASS |
| `13月` | 0 条结果，非法月份安全结束 | PASS |
| 空输入 | 恢复默认 Feed 首屏 6 张 | PASS |
| 无法识别文本 | 0 条结果，页面无崩溃或 loading 遗留 | PASS |

搜索过程中没有 JR、JNTO、搜索 Provider、DeepSeek 或其他 Evidence 网络调用。搜索 loading 均正常结束，无白屏、死循环或 rejected 路线冒充正式结果。

## 5. Ready 路线与重启

完整 V2 环境中，`东京京都大阪7天` 选中的路线为：

- Route ID：`planner-designed-::::::Q1490|Q169134|Q34600|Q35765::7天::Classic First Trip::::Q1490>Q34600>Q169134>Q35765`
- selected Candidate：`rc-e2a5116761ccfee22d3d`
- 顺序：东京 → 京都 → 奈良 → 大阪
- Publication Gate：`ready-for-display`

停止服务后用同一隔离目录重启，再次查询得到相同 Route ID、candidateId、目的地顺序和 `ready-for-display` 状态。Ready Pool 中只有 1 条对应记录，正式 accepted repository 没有写入。

## 6. 六张无限流与完整耗尽

- 首屏：6 张卡片。
- 后续加载：59 批；总批次数（含首屏）为 60。
- 最终显示：357 条。
- 唯一 Route ID：357。
- 重复：0。
- 遗漏：0。
- 空白卡片：0。
- 持续空批：0。
- 最后一批：3 条。
- 最终状态：`hasMore=false`、`remainingCount=0`、`nextCursor=null`。
- 页面提示：`已经到底了`。
- 到底后继续滚动 3 次：新增 Discovery 请求 0，卡片数量和最后加载标记不变。
- 同一 session 的顺序稳定；不同 session 稳定洗牌的自动 verifier 通过。

在 126、246、357 张卡片三个观察点，唯一数始终等于卡片数；已加载卡片没有被后续批次替换或删除。

## 7. 长列表体验

| 卡片数 | 唯一数 | 图片完成 | DOM 节点约数 | 人工观察 |
| ---: | ---: | ---: | ---: | --- |
| 126 | 126 | 126 / 126 | 1,701 | 滚动与点击正常，无明显跳动 |
| 246 | 246 | 246 / 246 | 3,261 | 已加载内容保留，无重复插入 |
| 357 | 357 | 357 / 357 | 4,706 | 到底状态稳定，无继续请求 |

浏览器没有暴露可用的 `performance.memory`，因此本轮不能伪造堆内存数字。DOM 数量随卡片数近似线性增长，人工滚动没有发现明显卡顿或异常爆炸。本轮没有证据要求立即引入 DOM virtualization。

点击路线详情再返回时，页面会回到首屏和顶部，而不是保留已加载批次与滚动位置。这是非阻塞体验改进项，不影响数据正确性或上线安全。

## 8. 性能结果

### 冷启动与热运行

三次冷启动到页面可访问：

- 1,783.070 ms
- 1,730.408 ms
- 1,743.341 ms

最小值 1,730.408 ms，中位数 1,743.341 ms，p95 / 最慢值 1,783.070 ms。

五次热运行到首屏 6 张完整卡片：

- 705 ms
- 706 ms
- 704 ms
- 700 ms
- 710 ms

最小值 700 ms，中位数 705 ms，p95 / 最慢值 710 ms。五次首屏图片均为 6 / 6 ready。

### 搜索

真实页面 13 组搜索都在约 2.8 秒内结束。当前代码 live verifier 的代表样本为：

- `7天`：1,376.664 ms，6 条结果。
- `日本2天`：1,143.333 ms，1 条结果。
- 固定四城：1,112.043 ms，1 条结果。

所有普通搜索都低于 5 秒目标。完整 Candidate → 本地 Evidence → Publication Gate 首次运行约 912.8 ms；同一隔离目录重启后的缓存查询约 526 ms。

### 下一批 Feed

59 个后续批次：

- 最小值：313 ms。
- 中位数：395 ms。
- p95：469 ms。
- 最慢批次：1,110 ms。

常规批次低于 2 秒目标。最后一批插入时 1 张图片 ready、2 张使用占位状态，晚到图片随后替换封面；3 张卡片本身没有被阻塞或重新插入。

## 9. 一句话介绍质量

自动检查实际 accepted repository 中两类严格可展示路线：

- 跨国路线：357 条。
- 单国路线：494 条。
- 总计：851 条。
- 长度：最短 28 字，中位数 38 字，最长 51 字。
- 不完整、占位符、泛化口号、标点不闭合、提及不存在目的地或无证据夸张：0。
- 完全重复组：0。
- 高相似对（3-gram Jaccard ≥ 0.84）：1 对。

唯一高相似样本：

- `materialized-1c5pa11-16020`
- `materialized-slgfu-42824`
- 相似度：0.854

该对仍包含不同的实际目的地与节奏信息，不构成错误或阻塞项。真实页面人工检查覆盖首屏、连续 5 批、日本、土耳其、冰岛、摩洛哥、2 / 7 / 12 天、固定多城市、月份条件、Ready / needs-review / 成熟回退状态。

## 10. 桌面端与移动端

桌面端 `1280 × 800`：卡片约 `400 × 153`，封面 `104 × 86`，无横向溢出；首屏 6 条介绍均在可见区域完整显示。

移动端 `390 × 844`：卡片约 `335 × 153`，无横向溢出；移动端介绍使用 3 行上限，首屏 6 条均未截断。卡片高度没有全局扩大，Feed 批次和图片尺寸保持原设计。

首次及主要浏览器观察中 Console error = 0、warning = 0；后续连续耗尽没有出现可见未处理错误或 loading 卡死。

## 11. 开关关闭回归

关闭所有 Route V2 新开关后重新启动：

- legacy Search 正常；
- Planner 正常；
- Feed 首屏 6 张及无限流结构正常；
- `日本7天` 返回 6 条兼容结果；
- 没有创建 Candidate、DecisionTrace、EvidenceBundle 或 Ready Pool 文件；
- 工作区没有创建 `.route-v2-local-evidence`；
- 页面结构与现有调用方兼容。

## 12. 本轮修复

1. 将 Search 去重从重复计算 fingerprint 与 `findIndex` 的二次扫描改为索引 Map；宽泛搜索从约 15–20 秒降至约 1.1–1.4 秒。
2. 已收录路线必须满足明确时长范围和用户要求的城市 / 固定顺序，避免长路线填充 2 天请求或固定城市丢失。
3. 对灵活的多城市请求，Candidate Builder 可优先插入本地正式 Evidence 已覆盖的桥接城市；东京、京都、大阪 7 天现在选择东京、京都、奈良、大阪并通过 Gate。
4. Search 首次响应和缓存重放都保留 V2 `ready-for-display`，不再降级成 `search-generated` / `needs-review`。
5. 路线介绍改为基于真实目的地、路线结构和节奏的保守完整句，移除无证据季节结论与泛化营销模板。
6. 移动端介绍由 2 行调整为 3 行，只作用于窄屏，不扩大桌面卡片。
7. 增加全量介绍质量 verifier、上线前页面 / API verifier，并更新直接相关的 Ready 与 Publication Gate 回归断言。

## 13. 定向回归

以下 verifier 全部 exit code 0：

- Multi-city Intent
- Japan Multi-city Ready Route
- Evidence Promotion
- Publication Gate
- Candidate Evidence Validation
- Time Intent boundaries
- Candidate / DecisionTrace stabilization
- Search acceptance gate
- Planner pipeline
- Feed exhaustion
- six-card infinite scroll
- image assets / fallback pilot
- City detail UI
- Runtime API
- Entity Layer Batch02
- Planner Search UI visibility
- Evidence Phase 3C-1 / 3C-2
- route summary quality
- prelaunch browser / live API
- `git diff --check`
- `git diff --cached --check`

## 14. 资产指纹

### Accepted routes

- 验收前：`aea28bcc03eaf6ccce5fd7453f88ece4f0060789f135eaf837b568d9c43e7e3f`
- 验收后：`aea28bcc03eaf6ccce5fd7453f88ece4f0060789f135eaf837b568d9c43e7e3f`
- 结果：不变。

### Knowledge

- 文件数：51 → 51。
- 总大小：41,412,835 bytes → 41,412,835 bytes。
- 指纹：`a6e1232be1397a43a7992bfd4ba73b6e34ceba91fffb34932b4226f3a607bf6e` → 同值。
- 结果：不变。

### `.route-v2-cache`

- 文件数：326 → 330。
- 总大小：1,273,062,079 → 1,273,924,299 bytes。
- 指纹：`50c03a40267ce3f7d6df3252aaeecd1d97527d2db92d9cdb86c38892e439b487` → `27c283807647636cbbb163aaa50a1240d2aacf1de8e2a0c8119e260b3adcde8e`。
- 结果：变化。原因是最早浏览器验收未隔离 Search / image proxy cache，新增 4 个运行时文件并更新搜索缓存；未删除、覆盖或伪装恢复。后续验收均使用临时隔离目录。

## 15. 非阻塞后续项

1. 将浏览器验收启动器默认强制指向隔离 Search、Analytics、Review、Ready 和图片缓存，避免重复污染真实 cache。
2. 如产品要求返回列表和滚动位置，可单独设计详情页返回状态恢复；本轮不扩展前端状态架构。
3. 在支持 `performance.measureUserAgentSpecificMemory()` 的环境补充长列表堆内存曲线；本轮只保留真实 DOM 与人工流畅度证据。
4. 后续可继续降低那 1 对高相似介绍，但当前内容真实、完整且可区分，不阻塞上线。

## 16. 范围与安全确认

- 没有修改 accepted route 数据、Country / City / POI 知识资产或正式 Evidence seed。
- 没有打开任何生产默认 Feature Flag。
- 没有把 Ready Pool、Candidate、Trace、EvidenceBundle、截图或性能原始日志加入 Git。
- 没有调用实时 Evidence provider、DeepSeek、JR 或 JNTO。
- 没有 push、PR、部署、tag、amend、rebase、squash 或切换分支。
