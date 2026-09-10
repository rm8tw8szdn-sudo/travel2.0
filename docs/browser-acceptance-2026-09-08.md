# 真实浏览器验收报告

日期：2026-09-08。审查分支：`codex/review-runtime-reliability`。

## 结果

Playwright Test 1.63.0 + Chromium 153.0.8010.12，在正式 Node.js 24.18.0 / Windows 环境执行。2026-09-09 对抗修复后的完整运行共 **33 项通过、0 失败、0 跳过、0 重试**。成功截图已人工复查窄屏详情、桌面搜索结果和图片故障回退。

| 验收场景 | 360×800 | 390×844 | 1280×900 |
| --- | --- | --- | --- |
| 六卡首屏、连续五次分页、末批三卡、无重复、原卡 DOM 保留、到底停止请求 | PASS | PASS | PASS |
| 搜索东京、打开详情、刷新详情、收藏持久化、返回保留查询 | PASS | PASS | PASS |
| 首屏接口失败、重试恢复、空搜索结果提示 | PASS | PASS | PASS |
| 详情接口失败、重试成功 | PASS | PASS | PASS |
| 分页中途失败保留已有卡片、重试复用游标、无重复 | PASS | PASS | PASS |
| 本地图片失败后保留全部卡片、路线/城市使用真实占位 SVG | PASS | PASS | PASS |
| 实际本地服务返回完整知识统计，隔离空路线库显示正常空状态 | PASS | PASS | PASS |
| 行程名称注入载荷仅按文字显示，不执行 HTML | PASS | PASS | PASS |
| `reset=empty` 查询参数不清空已有旅行状态 | PASS | PASS | PASS |
| 畸形城市 hash 安全回退且无页面错误 | PASS | PASS | PASS |
| 内部文件及 data/raw/reports/audit/LFS、编码路径和混合分隔符绕过返回 404；正常公开资源返回 200；畸形发现请求返回稳定 400 | PASS | PASS | PASS |

正常场景无未捕获页面错误、未预期控制台错误或失败资源请求。故障场景只允许显式注入的 503/404 及对应错误日志，仍严格检查其他错误。浏览器发起的外域网络请求会被阻断并使测试失败；最终均无此类请求。

## 发现并修复的页面问题

详情页 `.route-detail-summary` 使用未限制最小宽度的 Grid 轨道，来源名称为较长文本时挤出所在信息栏。用真实页面加载合法的长来源名称，360/390px 场景可复现；新加的边界断言在修复前失败。

修复把外层三列和内层文字列改为 `minmax(0, 1fr)`，对值文本增加宽度收缩和省略显示，保留完整链接文字的 DOM/可访问名称。相同断言在修复后通过，截图确认来源文本留在原栏内。

## 验证方式和隔离

- 恢复了原 Git 提交 `826439f41523500ad805d0bcb9966a630e90b859` 下 assets/data/vendor 的 1,347 个文件，并逐个核对 blob SHA。资源未被修改或重新生成。
- 测试使用实际 `server.js` 服务 HTML、JS、CSS 和本地图片；每个场景建立独立 Chromium context。
- 六个交互场景替换 `/api/routes/discovery` 为明确标记的固定测试数据，并禁用旧 bootstrap 快照。该部分证明前端交互和资源回退行为，不证明真实规划器会生成对应路线。
- 第七个场景让发现接口和知识接口到达真实服务：返回 119 国家、833 城市、3,963 POI，共 4,915 条发布知识；Accepted 路线库特意隔离为空，验证成功空状态。只禁用了 bundled bootstrap 快照。
- 服务在本轮临时目录中运行，存储路径显式隔离，在线证据、LLM、refill 和路线生成关闭。通过 IPC 停止真实服务，等待退出后校验所有权并删除临时目录；最终运行的临时目录已确认不存在。
- 静态边界通过真实 HTTP 请求验证。知识原始数据、内部报告、图片审计与 LFS 路径在文件读取前被公开清单拒绝；`data/countries-50m.json`、`data/countries.zh.json` 及页面所需 HTML、JS、CSS、assets、vendor 保持可用。
- 采用三个实际 viewport 宽度；没有宣称验证 Safari、Firefox、触屏设备或所有页面。

## 启动代码精简复验

测试子进程直接调用生产服务 `main()`，等待监听完成后发送就绪消息；移除额外服务进程、日志解析和进程树终止分支。启动与关闭共用超时处理，删除重复默认配置，保留临时目录隔离、所有权检查和连接关闭。

两个浏览器启动文件共减少 130 行；加上生产入口调整，三个源文件净减少 124 行。测试场景和断言未减少。该阶段重新运行 21 项浏览器测试通过（25.4 秒）、22 项单元测试通过、4 项 smoke 检查通过。2026-09-09 加入四类对抗场景后，最终为 33 项浏览器测试及 30 项单元测试通过。另行占用启动端口，确认启动失败能被报告且不会留下本轮临时目录；正常运行的临时目录也已确认删除。

## 复现命令

在完整检出中使用 Node.js 24：

```powershell
npm.cmd ci
npm.cmd run browser:install
npm.cmd run test:browser
npm.cmd run test:browser:report
```

只跑某个宽度：`npm.cmd run test:browser -- --project=mobile-360`。默认端口 4287；如被占用，先设置 `$env:PW_PORT = "4288"`。安装和测试共用 `.cache/ms-playwright/`，无需自行填写本机浏览器路径。macOS/Linux 去掉 `.cmd`；Linux 缺浏览器系统库时可运行 `npm run browser:install -- --with-deps`。

HTML 报告：`playwright-report/index.html`。机器结果：`test-results/browser-results.json`。每项测试附浏览器审计日志及成功截图；失败时额外保留截图与 trace。运行产物均被 `.gitignore` 排除。

## 其他回归和限制

- `npm.cmd test`：22/22 通过。
- `npm.cmd run test:smoke`：安全边界、图片代理缓存、详情加载及仓库架构 4 项通过。
- 当前六卡逻辑检查及 prelaunch 源码检查通过；后者 `liveProbe: null`，不计入真实浏览器数量。
- 旧 `verify-route-feed.mjs` 在生命周期清单中已退役，硬编码旧八卡行为和 macOS Chrome 路径；本次没有恢复或弱化旧脚本。
- 未进行线上流量、线上生成、非空真实 Accepted 路线库全流程或跨浏览器发布验收。本报告解决此前缺少真实浏览器验证的问题，但不是整个产品发布批准。
