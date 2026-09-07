# 代码审查与重构报告

审查基线：`826439f41523500ad805d0bcb9966a630e90b859`（main）。
范围：仓库结构及运行说明、服务端图片代理、内存缓存、任务队列和相关验证脚本。检查了调用链与专项验证；本报告不是整个路线规划系统已完成形式验证的声明。

## 已修复的问题

| 级别 | 位置 | 原行为与影响 | 改动 |
| --- | --- | --- | --- |
| P1 | `src/lib/routes/route-job-store.mjs` | `filter(Boolean).join('::')` 丢失字段位置；providerId 与 query 的相同值、包含分隔符的不同输入可复用错误任务。默认 type 与显式默认 type 又无法复用。 | 一次归一化字段，通过 JSON 元组保留字段位置和转义；队列记录复用相同归一化结果。 |
| P1 | `src/lib/routes/route-job-store.mjs` | 同一毫秒结束并重新入队时 ID 重复，旧任务被 Map 覆盖；显式重复 ID 也覆盖其他任务。 | 时间戳加本地序号，检查显式 ID 冲突；保留旧任务历史。 |
| P2 | `src/lib/routes/route-job-store.mjs` | transition 直接保留调用方 diagnostic 引用，外部修改可污染历史。 | 保存前 structuredClone，与返回快照的隔离语义一致。 |
| P1 | `server-security.js` | 非成功状态、错误 MIME、声明超限等分支拒绝响应时未释放未消费的流；重定向原先直接 resume，没有统一释放边界。 | 每跳 try/finally 销毁响应流；重定向响应交回同一生命周期处理。 |
| P2 | `src/lib/routes/cache.mjs` | 写入无容量上限，过期清理依赖 get/size，持续写入不同键会保留越来越多记录。 | 默认 1,000 项、可配置容量；写入时按最早插入顺序淘汰，替换刷新顺序；不引入每次写入的全表扫描。 |
| P1 | `server.js` | 仅下载路径执行 200 项淘汰，磁盘命中直接写入内存会绕过限制；按项数也无法限制大图片的总字节数。 | 提取 `image-response-cache.js`，两条写入路径统一限制 200 项与 64 MiB 图片内容。 |
| P2 | `server-security.js` | 请求体和图片流维护两套重复的字节累计、超限和 Buffer 拼接逻辑。 | 共享 collectBoundedBody，保留各自错误码、HTTP 状态、空内容政策及 UTF-8 字节计算。 |
| P2 | `README.md` / 测试入口 | README 指向不存在的 npm 脚本；无统一离线回归命令。 | 添加无依赖 package.json、22 项单元测试、4 项 smoke 验证及运行说明。 |

## 验证证据

- 原实现运行首批 18 项测试：3 通过、15 失败，复现任务身份/历史/引用、缓存容量及响应流释放问题。
- 修复后 `npm.cmd test`：22/22 通过。
- `npm.cmd run test:smoke` 覆盖已有安全边界、图片代理网络边界、详情加载稳定性及仓库架构验证。全部通过；图片上游使用 mock，真实外网请求为零。
- 修改后的生产 JS/MJS 语法检查通过；`git diff --check` 通过。
- 另行尝试 `node scripts/verify-route-feed.mjs`：因缺少 `playwright` 无法启动。未将其计入通过结果，也未运行完整浏览器/线上路线生成验收。

性能结论限定为资源上限与算法行为：TTL 写入淘汰 O(1)，图片缓存淘汰按被移除项数计费，图片内容保留量最多 64 MiB。没有实际线上流量基准，因此不宣称延迟或吞吐提升百分比。总进程 RSS、并发下载中的缓冲和磁盘缓存不包含在此内存缓存上限内。

## 兼容性与后续关注

- 任务 ID 作为不透明标识使用；本次检查的调用方不解析其格式。显式重复 ID 现在抛出 `job_id_already_exists`；同一活跃身份仍复用原任务。
- TTL 容量达到上限时可淘汰尚未过期的最早插入项，这是有意的容量政策；get 不改变淘汰顺序。图片超出总预算时可直接返回给请求方但不保留在内存，磁盘缓存行为继续保留。
- `server.js` 仍混合 HTTP 路由、图片选取与磁盘持久化，并在请求路径使用同步文件读写。建议下一轮以请求负载测量为依据，逐步拆分图片服务与异步存储；本次仅提取可独立验证的图片缓存职责。
- `route-composition-planner.mjs`、`search-intent-parser.mjs` 和 `routes.js` 仍是大型模块。后续应先补跨模块行为测试，再按策略选择、意图解析和页面状态拆分，避免一次迁移全部历史规则。
- 任务历史仍没有保留期限，图片磁盘缓存也没有整体字节预算。这些需要独立的保留/失效策略；本次未删除已有数据。
- 获取源码时 Git 大资源下载过慢，使用 GitHub API 获取并逐个核对 blob SHA。当前本地检出省略 assets/vendor/legacy/data 等资源，Git 用 skip-worktree 标记，不构成提交删除。完整页面验收需完整资源及浏览器依赖。
- 没有修改已接受路线、生成缓存、知识库数据或发布开关。

## 执行

正式 Node.js 24 环境下：

```powershell
npm.cmd test
npm.cmd run test:smoke
npm.cmd run preview:travel
```

前两条不需要安装第三方依赖；预览完整内容仍需完整仓库资源。
