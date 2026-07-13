# Route Generation V2 Phase 0 Baseline Report

Generated at: 2026-07-13T04:40:00Z

Scope: Phase 0 only. No Git init, no commit, no push, no route regeneration, no cache cleanup, no Planner/Feed/Search/Detail/image business changes. The only non-report file changed was `.gitignore`, per Phase 0 Git safety requirements, to prevent accidental secret/cache commits before any future Git initialization.

## 1. Git 当前状态

| Item | Value |
|---|---|
| Is Git repository | NO |
| Current branch | null |
| Current HEAD | null |
| Remote | null |
| Uncommitted changes | Not applicable: repository is not initialized |
| Action taken | Did not run `git init`; did not commit; did not push |

Current `.gitignore` was expanded before any Git initialization. It now excludes environment files, key/token/cookie/session files, dependency folders, build outputs, logs, temporary files, OS files, `.route-v2-cache/`, `.cache/`, and session-continuation TXT logs.

## 2. 敏感文件检查结果

Scanned 376 non-cache files, excluding `.route-v2-cache`, `node_modules`, `.git`, `output`, `dist`, `build`, `.cache`.

High-risk / requires user confirmation before Git initialization:

| File | Risk | Notes |
|---|---|---|
| `2026-06-30-113219-this-session-is-being-continued-from-a-previous-c.txt` | Possible API key assignments; private Windows paths | Now ignored by `.gitignore`, but should not be committed unless manually sanitized. |
| `assets/footprint-globe.mov` | Large file not scanned | Confirm whether this binary asset belongs in Git or should be handled separately. |
| `assets/home-globe.mov` | Large file not scanned | Confirm whether this binary asset belongs in Git or should be handled separately. |

Lower-risk / likely false positives:

| File group | Risk | Notes |
|---|---|---|
| `src/lib/routes/*provider*.mjs`, `web-search-evidence-provider.mjs`, `repository-warmup-runner.mjs`, `scripts/verify-llm-node.mjs` | `apiKey` variable names | Detected as assignments/variables, not confirmed hardcoded secrets. Review before first commit. |
| `favorites.js`, `route-detail.js`, `routes.js` | `token` text | Likely application/local state token variables, not confirmed credentials. Review before first commit. |
| `vendor/three.min.js` | cookie/session text | Likely minified library text, not confirmed credentials. |
| Audit/docs files | private Windows paths | Paths such as `C:\Users\admin\...` are present in audit reports; not credentials but may be privacy-sensitive. |

No raw secret values are reproduced in this report.

## 3. 建议的 `.gitignore` 范围

Already covered by current `.gitignore`:

- `.env`, `.env.*`, except `.env.example`
- `*.key`, `*.pem`, `*.p12`, `*.pfx`
- `*secret*`, `*token*`, `*cookie*`, `*session*`
- `2026-*-this-session-is-being-continued-*.txt`
- `node_modules/`
- `build/`, `dist/`, `output/`
- `coverage/`, `playwright-report/`, `test-results/`
- `logs/`, `*.log`, `*.tmp`, `*.temp`, `*.bak`, `tmp/`, `temp/`
- `.DS_Store`, `Thumbs.db`, `desktop.ini`
- `.route-v2-cache/`, `.cache/`

Suggested files to consider for first commit after user approval:

- Source files under `src/`
- UI files such as `routes.js`, `route-detail.js`, `profile.js`, HTML/CSS assets
- `server.js`
- `scripts/` verification utilities, after secret review
- Architecture and audit documents, if privacy-sensitive absolute paths are acceptable
- `README.md`
- `data/` if size and license are acceptable

Suggested ignored / not committed:

- `.route-v2-cache/`
- `.env*` and key/token/session/cookie files
- session continuation logs
- generated outputs and logs
- large binary assets unless explicitly approved

## 4. 当前 repository 和 bootstrap hash

| Item | Value |
|---|---|
| Accepted repository file | `.route-v2-cache/accepted-routes.json` |
| Accepted repository size | 45,562,416 bytes |
| Accepted repository SHA-256 | `aea28bcc03eaf6ccce5fd7453f88ece4f0060789f135eaf837b568d9c43e7e3f` |
| Bootstrap file | `route-feed-bootstrap.js` |
| Bootstrap size | 87,795 bytes |
| Bootstrap SHA-256 | `9f5e2b2557a9e547073da4d299f08b5b18b6eba38b3bd55fc995a16adf1cd9ef` |

## 5. 路线数量基线

| Metric | Value |
|---|---:|
| Raw accepted route count | 5,500 |
| Repository effective route count | 4,577 |
| Strict Feed eligible count | 198 |
| Strict Feed eligible cross | 91 |
| Strict Feed eligible single | 107 |
| Bootstrap cross records | 6 |
| Bootstrap single records | 6 |

Repository status from current code:

| Status field | Value |
|---|---|
| total | 5,500 |
| single | 4,659 |
| cross | 841 |
| mediaReady | 5,425 |
| repositoryVersion | `accepted-v2:5500:0:2026-07-08T03:27:46.221Z` |
| meetsMinimum | true |
| meetsTarget | true |

## 6. 当前运行环境

| Item | Value |
|---|---|
| Node | `v24.14.0` via bundled Codex runtime |
| npm | Not available in PATH |
| pnpm | fallback command found at `C:\Users\admin\.cache\codex-runtimes\codex-primary-runtime\dependencies\bin\fallback\pnpm.cmd` |
| yarn | Not available in PATH |
| package.json | Not present |
| lock file | Not present (`package-lock.json`, `pnpm-lock.yaml`, `yarn.lock`, `bun.lockb` absent) |
| Start command from README | `PORT=4173 node server.js` |
| Current local service | `http://127.0.0.1:4173/travel-collection/` reachable during smoke test |

Current key Route Generation V2 flags:

| Flag | Value |
|---|---|
| `ROUTE_V2_INTENT_ENABLED` | null |
| `ROUTE_V2_CANDIDATE_POOL_ENABLED` | null |
| `ROUTE_V2_EVIDENCE_BUNDLE_ENABLED` | null |
| `ROUTE_V2_TRACE_ENABLED` | null |
| `ROUTE_V2_TRACE_REQUIRED_FOR_ACCEPT` | null |
| `ROUTE_V2_VALIDATION_ENABLED` | null |
| `ROUTE_V2_REVIEW_ENABLED` | null |
| `ROUTE_V2_READY_POOL_GATING_ENABLED` | null |
| `ROUTE_V2_FEED_ENABLED` | null |

Search V1 env flags:

| Flag | Value |
|---|---|
| `SEARCH_PLANNER_TIMEOUT_MS` | null |
| `SEARCH_MAX_PLANNER_CALLS_PER_REQUEST` | null |
| `SEARCH_CACHE_TTL_DAYS` | null |
| `SEARCH_AUTO_ACCEPT_GENERATED` | null |

## 7. 已运行的只读测试

Existing script checks:

| Command | Result |
|---|---|
| `node scripts/verify-concept-taxonomy.mjs` | PASS |
| `node scripts/verify-gold-cases.mjs` | PASS |
| `node scripts/verify-route-content-quality.mjs` | PASS |

Smoke checks against current local service:

| Check | Result |
|---|---|
| `GET /travel-collection/routes.html` | 200, page reachable |
| `GET /travel-collection/mobile.html` | 200, page reachable |
| `POST /api/routes/discovery` with `mode:"feed"` | 200, returned feed records from accepted repository |
| `POST /api/routes/discovery` with UTF-8 `mode:"search", query:"撒哈拉"` | 200, returned Sahara/Morocco route records |
| `POST /api/routes/discovery` with `mode:"detail", routeId:"materialized-rrhzxu-43168"` | 200, returned route detail record |
| `GET /api/routes/discovery?mode=detail...` | 405, expected method mismatch for current API usage |

Skipped:

- Playwright-heavy route feed browser script: existing script references a macOS Chrome path and is not reliable in this Windows workspace.
- Tests requiring external API keys or likely writing data/cache.
- Any route regeneration or cache cleanup.

## 8. 当前已知失败

- Project is not a Git repository.
- `.gitignore` had been too small before this Phase 0 pass; it has now been expanded.
- A session-continuation TXT file contains possible API key assignments and must remain ignored or be sanitized before Git initialization.
- Some audit documents include local private Windows paths.
- No `package.json` or dependency lock file exists, so package manager commands cannot be used as a baseline.
- Search request without explicit UTF-8 body encoding can produce garbled query text from PowerShell; UTF-8 request works.
- `GET` detail API path returns 405; current behavior uses `POST /api/routes/discovery` for detail.

## 9. Phase 1 开始前的必要条件

- User confirms whether to initialize Git.
- User confirms whether to keep, sanitize, or exclude the session-continuation TXT file with possible API keys.
- User confirms whether large `.mov` assets should be committed or externally managed.
- User confirms that absolute local paths in audit documents are acceptable in version control, or asks to redact them.
- Keep Route Generation V2 feature flags default false.
- Do not start Phase 1 until this baseline report and manifest are accepted.

## 10. 无法验证的内容

- Full browser visual behavior was not re-audited; this Phase 0 only performed lightweight HTTP/API smoke checks.
- No external Tavily/OpenAI/DeepSeek/DashScope calls were made.
- No Playwright long-scroll tests were run.
- No remote Git configuration exists because the project is not initialized as Git.
- Sensitive scan is regex-based and may include false positives or miss obfuscated secrets.
