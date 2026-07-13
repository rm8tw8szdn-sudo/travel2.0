# Developer Setup

Generated: 2026-07-13
Last verified: 2026-07-13

This setup guide establishes the permanent development environment for Travel Collection. It intentionally avoids temporary bundled runtimes.

## Stop Condition

Do not start normal development until formal Node.js and pnpm are both accepted.

Current check result:

- `node`: installed, `v24.18.0`, formal path
- `npm`: installed, `11.16.0` via `npm.cmd`; direct `npm --version` is blocked by PowerShell execution policy selecting `npm.ps1`
- `corepack`: installed, `0.35.0`
- `pnpm`: installed, `11.12.0` via `pnpm.CMD`; direct `pnpm --version` is blocked by PowerShell execution policy selecting `pnpm.ps1`
- `git`: available from formal Git for Windows
- `powershell`: available

## Recommended Installation

1. Install Node.js 24 LTS for Windows x64 from the official Node.js website.
2. In the installer, keep "Add to PATH" enabled.
3. Open a new PowerShell window.
4. Verify:

```powershell
node --version
npm --version
where.exe node
where.exe npm
```

Expected:

```text
v24.x.x
<npm version bundled with Node 24>
C:\Program Files\nodejs\node.exe
C:\Program Files\nodejs\npm.cmd
```

## pnpm Setup

After Node.js 24 LTS is installed, pnpm must be activated before the environment is fully accepted:

```powershell
corepack --version
corepack enable
corepack prepare pnpm@11.12.0 --activate
pnpm --version
where.exe pnpm
```

Expected:

```text
11.x.x
```

`where.exe pnpm` must not resolve to:

```text
<TEMPORARY_RUNTIME_PATH>
```

If it still resolves to a temporary fallback path, fix PATH before development.

Current verification result: `pnpm.CMD --version` returns `11.12.0` from the formal Node.js directory. Bare `pnpm --version` is blocked by Windows PowerShell execution policy because PowerShell chooses `pnpm.ps1`; use `pnpm.CMD` in PowerShell 5.1 or adjust execution policy / command precedence.

## Git Setup

Git is already available:

```powershell
git --version
where.exe git
```

Expected source:

```text
C:\Program Files\Git\cmd\git.exe
```

Before initializing this project as a Git repository, follow:

```text
GIT_INITIAL_COMMIT_PLAN.md
```

## Standard PATH

Required permanent PATH entries:

```text
C:\Program Files\nodejs\
C:\Program Files\Git\cmd
C:\WINDOWS\System32\WindowsPowerShell\v1.0\
```

Optional:

```text
C:\Program Files\PowerShell\7\
```

Temporary bundled runtime paths are not part of the project standard.

## Standard Project Startup

This project currently has no `package.json`, so use the direct Node command:

```powershell
cd "<PROJECT_ROOT>"
$env:PORT = "4173"
node server.js
```

Open:

```text
http://127.0.0.1:4173/travel-collection/
http://127.0.0.1:4173/travel-collection/routes.html
```

Expected server log:

```text
Travel Collection preview: http://127.0.0.1:4173/travel-collection/
Routes/Search page: http://127.0.0.1:4173/travel-collection/routes.html
```

## Standard Test Commands

There is no package-level `test` script yet. After formal Node is installed, run targeted scripts directly:

```powershell
node scripts/verify-route-feed.mjs
node scripts/verify-search-v1.mjs
node scripts/phase-regression-test.js
```

Before running a script, classify it:

| Script type | Allowed by default |
| --- | --- |
| Read-only verification | YES |
| Browser/UI verification | YES, if dev server is running |
| Route generation | NO, unless user explicitly requests |
| Materialization | NO, unless user explicitly requests |
| Cache cleanup | NO, unless user explicitly requests |
| Data mutation | NO, unless user explicitly requests |

## Standard Git Workflow

After user confirms Git initialization:

```powershell
git init
git status --ignored
git check-ignore -v -- 2026-06-30-113219-this-session-is-being-continued-from-a-previous-c.txt
git check-ignore -v -- .route-v2-cache/accepted-routes.json
```

For normal work after initialization:

```powershell
git status
git checkout -b codex/<short-task-name>
git status
```

Before committing:

```powershell
git diff --stat
git diff --check
git status --ignored
```

Commit only intentional source/docs changes. Do not commit secrets, local runtime cache, generated route cache, or large video assets until the user decides the asset policy.

## Environment Checklist For Future Sessions

At the start of a future development session, read:

```text
PROJECT_ENVIRONMENT.md
```

Then verify:

```powershell
node --version
npm.cmd --version
pnpm.CMD --version
git --version
where.exe node
where.exe npm
where.exe pnpm
where.exe git
```

Proceed only when:

- Node is formal Node.js 24 LTS.
- pnpm is pnpm 11.x and not a temporary fallback.
- Git is formal Git for Windows.
- The task allows the scripts being run.

Current status: Node, npm.cmd, pnpm.CMD, and Git pass from formal install paths. Bare `npm` and `pnpm` in Windows PowerShell 5.1 still have an execution-policy wrapper caveat.

## Do Not Use

Do not use these as project setup instructions:

```text
<TEMPORARY_RUNTIME_PATH>
```

Temporary runtime paths may appear inside agent sessions, but they are not the permanent project development environment.
