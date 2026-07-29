# Route V2 Real User Search Stress Audit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 审计并可靠拆分真实用户压力检查产生的修复，完成永久回归、隔离浏览器验收和一个不混入历史累积改动的独立提交。

**Architecture:** 先依据逐文件 diff、内容和 Git 历史将工作区分为 A–F 六类，再仅对本轮 SearchIntent、Candidate 隔离和路线概括修复补充永久验证。所有运行时写入进入临时目录，正式 Accepted、Cache、Knowledge 保持只读；只有 A、B、C 类文件能够进入 staged diff。

**Tech Stack:** Node.js 本地服务、Route V2 前端页面、应用内浏览器、现有只读 verifier、Git 状态与资产指纹检查。

---

### Task 1: 固定仓库与运行环境基线

**Files:**
- Inspect: `server.js`
- Inspect: `.route-v2-cache/`
- Inspect: current Git worktree

- [ ] 确认当前分支、HEAD、未提交范围和暂存状态。
- [ ] 确认本地服务端口与启动目录；必要时使用隔离临时目录重启服务。
- [ ] 记录正式 cache 文件数量、总大小和 manifest 指纹。
- [ ] 确认本轮浏览器操作不会写入正式 accepted、cache 或 knowledge 资产。

### Task 2: 验收首屏、图片和六张无限流

**Files:**
- Inspect: `routes.html`
- Inspect: `routes.js`
- Inspect: `route-v2-image-assets.js`

- [ ] 从无搜索参数的路线页开始，记录首批 6 张卡片出现时间。
- [ ] 检查每张卡片的标题、国家/城市、图片地址、占位降级和空白状态。
- [ ] 连续触发至少 3 批下滑，确认每批最多 6 张、顺序稳定、无重复、无丢卡。
- [ ] 记录下一批触发到插入耗时、图片成功数和占位图数。

### Task 3: 执行常规搜索矩阵

**Files:**
- Inspect: `routes.js`
- Inspect: `src/lib/routes/route-search-service.mjs`
- Inspect: `src/lib/routes/route-intent-invariant-gate.mjs`

- [ ] 测试单城市、单国多城市和跨国多城市搜索。
- [ ] 测试月份、季节、天数和无目的地推荐。
- [ ] 核对城市是否完整、顺序是否保留、天数是否一致、路线分类是否自动正确。
- [ ] 记录冷搜索和相同查询热搜索耗时。

### Task 4: 执行异常、重复和竞态搜索矩阵

**Files:**
- Inspect: `routes.js`
- Inspect: `src/lib/routes/search-intent-parser.mjs`

- [ ] 测试非法天数、非法月份、乱码、空白、重复城市、混合语言和超长输入。
- [ ] 反复输入、删除、清空、重新搜索，确认不会保留旧结果或 loading。
- [ ] 快速连续提交不同查询，确认最终页面只显示最后一次查询。
- [ ] 重复同一查询至少 3 次，确认无重复卡片、无状态累积和无结果漂移。

### Task 5: 验收路线分类与详情往返

**Files:**
- Inspect: `route-detail.html`
- Inspect: `route-detail.js`
- Inspect: `routes.html`
- Inspect: `routes.js`

- [ ] 确认搜索完成后页面自动切换到正确的“跨国/单国”分类。
- [ ] 手动切换分类，确认列表与空状态准确。
- [ ] 对多个结果反复进入详情、返回列表，确认搜索词、分类和结果保持。
- [ ] 检查详情页标题、城市、天数、状态、季节提示和一句话介绍。

### Task 6: 检查网络、图片、控制台和信息质量

**Files:**
- Inspect: browser resource timing and console logs
- Inspect: local server responses

- [ ] 汇总 localhost 与外部域名请求，确认无意外外部调用。
- [ ] 检查图片资源完成度、失败率、占位率和是否阻塞文字卡片。
- [ ] 检查 console error / warning、未结束 loading、空白卡和重复卡。
- [ ] 抽查路线合理性、硬约束完整性、跨国/单国准确性和模板化内容。

### Task 7: 回收现场并输出进度报告

**Files:**
- Inspect: current Git worktree
- Inspect: `.route-v2-cache/`

- [ ] 再次比较 cache 与受保护资产指纹。
- [ ] 确认 Git 暂存状态和本轮产生的正式变更范围。
- [ ] 按通过项、阻塞问题、一般问题、数据质量问题和下一步建议汇总。
- [ ] 保留一个代表性页面供用户直接查看。

### Task 8: 审计和拆分工作区

**Files:**
- Inspect: all 23 modified files
- Inspect: all 8 untracked files
- Inspect: Git history from `739a2a8537c8ea63adb693653483d81217ed28dc`

- [ ] 为每个文件记录 diff 摘要、最早可判断的任务归属、资产影响和 A–F 分类。
- [ ] 检查同一文件是否混有本轮与历史累积 hunks；不能可靠拆分时停止提交。
- [ ] 检查 untracked 文件是否包含临时路径、运行数据、缓存或浏览器产物。
- [ ] 确认英文 Vienna / Budapest 缺口位于 Entity Alias 层；仅在现有别名资产可安全小改时纳入。

### Task 9: 固化永久回归并执行完整验证

**Files:**
- Modify: `scripts/verify-route-v2-real-user-adversarial-hardening.mjs`
- Modify: `scripts/verify-route-v2-time-intent-boundaries.mjs`
- Modify: `scripts/verify-route-v2-route-summary-quality.mjs`

- [ ] 覆盖日本中文/英文查询、连续等价表达、不同硬约束和 Candidate 存储隔离。
- [ ] 覆盖单国/跨国分类、普通分隔符、固定顺序语法和路线概括质量。
- [ ] 运行 SearchIntent、Time Intent、RouteIntent、Planner、fallback、Feed、图片、prelaunch 和不变量验证。
- [ ] 通过隔离服务复验桌面端、360px、390px、详情往返、清空搜索和 6→12→18→24。

### Task 10: 选择性暂存并创建独立提交

**Files:**
- Stage: only A, B, C files or individually reviewed hunks
- Leave unstaged: all D, E, F files

- [ ] 逐文件或逐 hunk 暂存，禁止使用 `git add .`。
- [ ] 检查 staged name-status、stat、完整 diff 和 whitespace。
- [ ] 创建唯一提交 `fix(route-v2): harden real-world search intent handling`。
- [ ] 确认 parent、最终 staged 状态和未提交文件，不执行任何远程操作。
