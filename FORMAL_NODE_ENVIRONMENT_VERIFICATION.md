# Formal Node Environment Verification

Generated: 2026-07-13

This report verifies the permanent local development environment. It does not modify business code, Planner, Feed, Search, Detail, route data, image logic, or real cache files. The local service smoke test isolated Search writes to a temporary directory.

## Documents Read First

- `PROJECT_ENVIRONMENT.md`
- `DEV_SETUP.md`

## Verification Method

The command environment was rebuilt from Windows Machine and User PATH values to approximate a fresh PowerShell session and avoid inherited temporary agent runtime paths.

No temporary bundled Node runtime was used for tests or server startup. Node commands used:

`C:\Program Files\nodejs\node.exe`

## Tool Verification

| Command | Result | Path / Notes | Status |
| --- | --- | --- | --- |
| `node --version` | `v24.18.0` | `C:\Program Files\nodejs\node.exe` | PASS |
| `npm --version` | Blocked by Windows PowerShell execution policy because PowerShell selects `npm.ps1` | `where.exe npm` resolves to formal Node install | WRAPPER CAVEAT |
| `npm.cmd --version` | `11.16.0` | `C:\Program Files\nodejs\npm.cmd` | PASS |
| `corepack --version` | `0.35.0` | `C:\Program Files\nodejs\corepack.cmd` | PASS |
| `pnpm --version` | Blocked by Windows PowerShell execution policy because PowerShell selects `pnpm.ps1` | `where.exe pnpm` resolves to formal Node install | WRAPPER CAVEAT |
| `pnpm.CMD --version` | `11.12.0` | `C:\Program Files\nodejs\pnpm.CMD` | PASS |
| `git --version` | `git version 2.54.0.windows.1` | `C:\Program Files\Git\cmd\git.exe` | PASS |

## Executable Paths

| Tool | Path |
| --- | --- |
| node | `C:\Program Files\nodejs\node.exe` |
| npm | `C:\Program Files\nodejs\npm`, `C:\Program Files\nodejs\npm.cmd` |
| corepack | `C:\Program Files\nodejs\corepack.cmd` |
| pnpm | `C:\Program Files\nodejs\pnpm`, `C:\Program Files\nodejs\pnpm.CMD` |
| git | `C:\Program Files\Git\cmd\git.exe` |

## Acceptance Checklist

| Requirement | Result | Status |
| --- | --- | --- |
| Node must be `v24.x` LTS | `v24.18.0` | PASS |
| Node must come from `C:\Program Files\nodejs\node.exe` | Confirmed | PASS |
| npm must come from formal Node install | `npm.cmd` confirmed from formal Node directory | PASS with PowerShell wrapper caveat |
| pnpm must be `11.x` | `pnpm.CMD` returns `11.12.0` | PASS with PowerShell wrapper caveat |
| pnpm must not come from temporary runtime/cache | `where.exe pnpm` points to `C:\Program Files\nodejs` | PASS |
| Git must come from formal Git for Windows | `C:\Program Files\Git\cmd\git.exe` | PASS |

## PowerShell Wrapper Caveat

In Windows PowerShell 5.1, bare `npm --version` and `pnpm --version` currently select the `.ps1` wrapper files first. The current execution policy blocks those scripts. The formal `.cmd` wrappers work:

```powershell
npm.cmd --version
pnpm.CMD --version
```

This is not temporary runtime pollution. It is PowerShell command resolution plus execution policy.

## Read-Only Script Tests

All requested scripts were run with formal Node:

`C:\Program Files\nodejs\node.exe`

| Command | Result | Status |
| --- | --- | --- |
| `node scripts/verify-concept-taxonomy.mjs` | `Phase 2a concept taxonomy verified: 10 styles all detectable, style-specific constraints enforced, transport-journey kept as fallback (total 11 keys). Gold Cases conceptKey aligned.` | PASS |
| `node scripts/verify-gold-cases.mjs` | `Phase 1 assets verified: 45 gold cases across 10 styles, 10 bad cases, 5 decision tests; Gold Case 3/4 criteria computable.` | PASS |
| `node scripts/verify-route-content-quality.mjs` | `Route content quality verified: content gates, CN hard block, enrichment whitelist, and classifier.` | PASS |

## Local Service Smoke Test

Service startup used formal Node:

```powershell
$env:PORT = "4188"
$env:HOST = "127.0.0.1"
node server.js
```

Search writable paths were redirected to a temporary verification directory:

```text
%TEMP%\travel-env-verify-<id>\
```

This avoided writes to the real Search analytics/cache/review files.

| Check | Result | Status |
| --- | --- | --- |
| Server started | Ready log observed | PASS |
| `GET /travel-collection/` | HTTP 200 | PASS |
| `GET /travel-collection/routes.html` | HTTP 200 | PASS |
| Feed API smoke | `mode=feed`, `limit=6`, returned 6 records, `cacheStatus=REPOSITORY` | PASS |
| Detail API smoke | `mode=detail`, first Feed route ID, `ok=true`, `cacheStatus=REPOSITORY` | PASS |
| Search API smoke | `mode=search`, Japan 8-day intent query, `ok=true`, returned 8 suggestions, no real cache write | PASS |
| Server stopped | Process stopped after test | PASS |

## Real Cache/Data Integrity

Hashes checked before/after service smoke:

| File | SHA-256 after verification | Changed during smoke |
| --- | --- | --- |
| `.route-v2-cache/accepted-routes.json` | `AEA28BCC03EAF6CCCE5FD7453F88ECE4F0060789F135EAF837B568D9C43E7E3F` | NO |
| `.route-v2-cache/search-analytics.jsonl` | `5084C6E196E5EB70381FE307F609D9A945B6112BD401EB748BABAF389A18A11E` | NO |
| `.route-v2-cache/search-cache.json` | `FC3A5CE1253EB9C61780B35E54F8FB9149A3E2B99D281816E02E2903C4C86CA5` | NO |
| `.route-v2-cache/search-review-candidates.json` | `A695C783799DA666B08E9466AA20A770EC983354475CAE97FF59CCBF6907C5B4` | NO |

No route regeneration, cache cleanup, materialization, or data mutation was performed.

## Temporary Runtime Pollution

No temporary runtime pollution was detected for accepted tools.

| Tool | Temporary runtime/cache path detected |
| --- | --- |
| node | NO |
| npm | NO |
| pnpm | NO |
| git | NO |

## Git Initialization Readiness

Git itself is ready:

- Git for Windows found.
- `git version 2.54.0.windows.1`.
- Prior Git safety docs and ignore plan exist.

Git initialization is environmentally possible, but should still follow:

- `GIT_INITIAL_COMMIT_PLAN.md`
- Sensitive file ignore verification after `git init`
- Large video asset decision before first commit

## Phase 1 Environment Readiness

Phase 1 environment prerequisites are met for formal Node, formal pnpm, and formal Git, with one operational caveat:

- In Windows PowerShell 5.1, use `npm.cmd` and `pnpm.CMD`, or fix execution policy / command precedence before relying on bare `npm` and `pnpm`.

This report does not start Phase 1.

## Verdict

Environment status: ACCEPTED WITH POWERSHELL WRAPPER CAVEAT.

Formal Node.js 24 LTS, npm, pnpm 11.x, and Git for Windows are installed from permanent paths. Read-only tests and service smoke checks pass using formal Node. No temporary runtime pollution was detected.
