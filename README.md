# 旅行收集册

当前目录的新版入口是一个独立静态网站原型，用于展示：

- 首页、图鉴、路线、行程、我的 5 个底部 Tab
- 国家 / 城市 / 路线收藏与搜索
- 国家、城市、路线详情页
- 轻量行程记录、预算入口和足迹统计
- 完成行程后同步国家 / 城市探索状态

## 本地预览

从仓库根目录启动固定端口的本地预览服务：

```bash
PORT=4173 node server.js
```

如果当前环境有 `npm`，也可以运行等价快捷命令：

```bash
npm run preview:travel
```

然后打开：

- 首页入口：`http://localhost:4173/travel-collection/`
- 手机首页：`http://localhost:4173/travel-collection/mobile.html`

也可以部署为普通静态网站，入口文件是 `index.html`。

## 自动化验证

使用正式安装的 Node.js 24，无需安装依赖即可运行本轮新增的离线测试：

```bash
npm test
npm run test:smoke
```

PowerShell 中如遇脚本执行策略限制，使用 `npm.cmd`；也可使用 `pnpm.CMD test`。
单元测试覆盖任务去重、任务历史、缓存容量、图片响应流释放和字节限制。
Smoke 检查覆盖安全边界、图片代理缓存、详情加载及仓库架构。
`scripts/` 下其他专项验证可能依赖 Playwright、完整数据或外部服务，不属于此离线测试入口。
完整审查结果和验证范围见 [代码审查报告](docs/code-review-2026-09-07.md)。

## 数据与旧原型说明

- 新版数据源是 `travel-data.js`，搜索入口是 `travel-search.js`，用户状态与同步规则在 `travel-state.js`。
- `legacy/mobile-app.js`、`legacy/app.js`、`legacy/mobile-dark.html` 是旧原型 / 废弃作品归档文件，不作为当前新版验收入口。
- 新版入口页面不加载 `legacy/` 下的旧逻辑；旧验证脚本如需读取旧原型内容，也统一从 `legacy/mobile-app.js` 读取。
- 当前版本只从旧原型迁移国家介绍、城市景点、路线和搜索同义词，不接入旧 UI、旧地图编辑器、省市系统或复杂攻略功能。
- 路线封面选图优先使用整条路线中最有代表性的热门景点或自然场景，避免出现人物、身体部位或难以识别的小图拼贴。
