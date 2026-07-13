# Project Environment

Generated: 2026-07-13
Last verified: 2026-07-13

This document is the permanent environment contract for this project. Future development sessions should read this file first and should not dynamically locate or depend on Codex bundled runtimes.

## Current Status

Formal Node.js, npm, corepack, pnpm, and Git are installed from formal system locations. Windows PowerShell 5.1 blocks direct `npm --version` and `pnpm --version` because it selects the `.ps1` wrappers under the current execution policy; the `.cmd` wrappers work and are from the formal Node.js directory.

| Tool | Current status | Current source | Accepted for permanent development |
| --- | --- | --- | --- |
| Node.js | `v24.18.0` | `C:\Program Files\nodejs\node.exe` | YES |
| npm | `11.16.0` via `npm.cmd`; direct `npm --version` is blocked by PowerShell execution policy selecting `npm.ps1` | `C:\Program Files\nodejs\npm.cmd` | YES with PowerShell wrapper caveat |
| corepack | `0.35.0` | `C:\Program Files\nodejs\corepack.cmd` | YES |
| pnpm | `11.12.0` via `pnpm.CMD`; direct `pnpm --version` is blocked by PowerShell execution policy selecting `pnpm.ps1` | `C:\Program Files\nodejs\pnpm.CMD` | YES with PowerShell wrapper caveat |
| Git | Found | `C:\Program Files\Git\cmd\git.exe` | YES |
| PowerShell | Found | `C:\WINDOWS\System32\WindowsPowerShell\v1.0\powershell.exe` | YES |
| PowerShell 7 `pwsh` | Missing | Not found | Optional |

Conclusion: formal Node.js, pnpm, and Git are ready from permanent paths. In Windows PowerShell 5.1, use `npm.cmd` and `pnpm.CMD`, or adjust execution policy / command precedence before relying on bare `npm` and `pnpm`.

## Standard Runtime

Use the official Windows x64 Node.js LTS installer, not a temporary bundled runtime.

| Runtime | Standard |
| --- | --- |
| Node.js | Node.js 24 LTS |
| npm | The npm version bundled with Node.js 24 LTS |
| pnpm | pnpm 11.x, activated through Corepack after Node is installed |
| Git | Git for Windows from `C:\Program Files\Git\cmd\git.exe` |
| Shell | Windows PowerShell 5.1 is acceptable; PowerShell 7 is optional |

As of this environment pass, Node.js 24 is the active LTS line and Node.js 26 is current but not yet LTS. Use Node.js 24 LTS for project stability.

## Required PATH

The permanent PATH must include formal system/user installs:

```powershell
C:\Program Files\nodejs\
C:\Program Files\Git\cmd
C:\WINDOWS\System32\WindowsPowerShell\v1.0\
```

If pnpm is installed or activated through Corepack, `pnpm --version` must work in a new PowerShell session without resolving to:

```text
<TEMPORARY_RUNTIME_PATH>
```

Temporary runtime paths may exist in an agent session PATH, but project scripts and documentation must not require them.

## Required Verification

Run these commands in a new PowerShell window after installation:

```powershell
node --version
npm --version
corepack --version
corepack enable
corepack prepare pnpm@11.12.0 --activate
pnpm --version
git --version
where.exe node
where.exe npm
where.exe pnpm
where.exe git
```

Expected:

- `node --version` starts with `v24.`
- `pnpm --version` starts with `11.`
- `where.exe node` points to `C:\Program Files\nodejs\node.exe`
- `where.exe pnpm` does not point to a temporary bundled runtime
- `git --version` works from `C:\Program Files\Git\cmd\git.exe`

## Project Shape

Current project state:

- No `package.json`
- No `package-lock.json`
- No `pnpm-lock.yaml`
- Static frontend pages plus `server.js`
- Local preview server is `server.js`
- Existing README mentions `npm run preview:travel`, but no package manifest currently defines that script

Because there is no package manifest, the current canonical startup command is the direct Node command:

```powershell
$env:PORT = "4173"
node server.js
```

Open:

```text
http://127.0.0.1:4173/travel-collection/
http://127.0.0.1:4173/travel-collection/routes.html
```

## Standard Startup

Until a package manifest is created, use:

```powershell
$env:PORT = "4173"
node server.js
```

Do not use:

```powershell
<TEMPORARY_RUNTIME_PATH>\node.exe server.js
```

## Standard Test Commands

Because there is no package manifest, tests are currently script-level commands, not `npm test` or `pnpm test`.

Examples after formal Node is installed:

```powershell
node scripts/verify-route-feed.mjs
node scripts/verify-search-v1.mjs
node scripts/phase-regression-test.js
```

Only run scripts that are read-only for the current task. Do not run route generation, cache cleanup, or materialization scripts unless the user explicitly asks.

## Standard Git Workflow

The project was not a Git repository during this environment pass. When the user confirms initialization:

```powershell
git init
git status --ignored
git check-ignore -v -- 2026-06-30-113219-this-session-is-being-continued-from-a-previous-c.txt
git add .gitignore
git status
```

Before the first real commit:

- Confirm secrets are ignored.
- Confirm `.route-v2-cache/` is ignored.
- Decide whether large `.mov` files belong in Git, Git LFS, or external storage.
- Do not commit generated route cache unless the user explicitly changes the repository policy.

## Prohibited For Future Sessions

Future development tasks must not:

- Dynamically search for a temporary bundled runtime to run Node.
- Use temporary fallback `pnpm` as the project package manager.
- Add documentation that instructs developers to use `<TEMPORARY_RUNTIME_PATH>`.
- Treat a successful temporary runtime command as proof that the permanent environment is ready.

## If Node Is Still Missing

Stop before development and install Node.js first. Use `DEV_SETUP.md` for the installation steps.

## Current Verification Summary

Latest formal environment verification:

| Check | Result |
| --- | --- |
| `node --version` | PASS, `v24.18.0` |
| `where.exe node` | PASS, `C:\Program Files\nodejs\node.exe` |
| `npm.cmd --version` | PASS, `11.16.0` |
| `npm --version` | WRAPPER CAVEAT, blocked by PowerShell execution policy for `npm.ps1` |
| `corepack --version` | PASS, `0.35.0` |
| `pnpm.CMD --version` | PASS, `11.12.0` |
| `pnpm --version` | WRAPPER CAVEAT, blocked by PowerShell execution policy for `pnpm.ps1` |
| `git --version` | PASS, `git version 2.54.0.windows.1` |

See `FORMAL_NODE_ENVIRONMENT_VERIFICATION.md` for the full record.
