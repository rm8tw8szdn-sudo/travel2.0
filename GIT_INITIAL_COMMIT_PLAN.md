# Git Initial Commit Plan

Generated: 2026-07-13

This plan is for Git initialization preparation only. It does not initialize Git, create commits, push code, modify business logic, regenerate routes, clean cache, or start Route Generation V2 Phase 1.

## Current Git Status

The project is not currently a Git repository. Because there is no `.git` directory yet, `git check-ignore` cannot produce a valid match result in this folder and exits with:

`fatal: not a git repository (or any of the parent directories): .git`

After the user confirms `git init`, the first required safety check should be:

`git check-ignore -v -- 2026-06-30-113219-this-session-is-being-continued-from-a-previous-c.txt`

## Sensitive File Check

Sensitive transcript file:

`2026-06-30-113219-this-session-is-being-continued-from-a-previous-c.txt`

Current `.gitignore` contains this matching pattern:

`2026-*-this-session-is-being-continued-*.txt`

Status:

| Check | Result |
| --- | --- |
| Covered by `.gitignore` pattern | YES |
| `git check-ignore` can currently confirm | NO, because Git is not initialized |
| Should be deleted automatically | NO |
| Should be included in first commit | NO |
| User should consider rotating related API keys | YES |

Recommendation: rotate any API keys, model keys, Tavily keys, tokens, cookies, or session values that may have appeared in the transcript or this conversation, even though the file is planned to stay ignored locally.

No suspected secret value was copied into this document.

## Suggested `.gitignore` Scope

Keep these categories ignored:

- `.env`, `.env.*`, and local secret/key files
- `node_modules`
- build outputs: `build`, `dist`, `output`
- test outputs: `coverage`, `playwright-report`, `test-results`
- logs and temporary files
- operating system/editor files
- `.route-v2-cache` runtime route data and generated cache files
- `.cache`
- continued-session transcript TXT files

## Suggested Files And Directories For First Commit

Recommended to include:

- Application entry files: `*.html`, `*.js`, `*.css` in the project root where they are source files
- `src/`
- `scripts/`
- `data/` source/reference files
- `vendor/` checked-in frontend vendor files already used by the app
- `assets/` image/SVG/PNG assets, excluding undecided large video assets unless the user explicitly accepts them
- `legacy/` only if the user wants to preserve the old prototype pages in version control
- Project documentation and audit documents:
  - `PLANNER_ROUTE_REPOSITORY_AUDIT.md`
  - `PLANNER_STRATEGY_CAUSALITY_AUDIT.md`
  - `DECISION_TRACE_AUDIT.md`
  - `ROUTE_GENERATION_V2_ARCHITECTURE.md`
  - `ROUTE_GENERATION_V2_MIGRATION_MATRIX.md`
  - `IMPLEMENTATION_CONTRACT.md`
  - `PHASE_0_BASELINE_REPORT.md`
  - `PHASE_0_BASELINE_MANIFEST.json`
  - `FEED_ELIGIBLE_METRIC_DEFINITION.md`
  - `GIT_INITIAL_COMMIT_PLAN.md`
- `package.json`, lock files, and project config files, if present
- `.gitignore`

## Explicitly Excluded Files And Directories

Do not include:

- `.route-v2-cache/`
- `.env`, `.env.*`
- `node_modules/`
- `build/`, `dist/`, `output/`
- `coverage/`, `playwright-report/`, `test-results/`
- `logs/`, `*.log`
- `tmp/`, `temp/`, `*.tmp`, `*.temp`, `*.bak`
- `.cache/`
- operating system files such as `.DS_Store`, `Thumbs.db`, `desktop.ini`
- files matching `*secret*`, `*token*`, `*cookie*`, `*session*`
- `2026-06-30-113219-this-session-is-being-continued-from-a-previous-c.txt`

## Files Requiring User Decision

| File | Size | Recommendation |
| --- | ---: | --- |
| `assets/footprint-globe.mov` | 18.02 MiB | Can be committed if legacy prototype pages must work from Git. Otherwise exclude or move to external asset storage later. |
| `assets/home-globe.mov` | 66.33 MiB | Avoid regular Git if possible. Prefer Git LFS or external asset storage if the legacy prototype must keep this video. |
| `legacy/` | Not independently sized in this pass | Include only if historical prototype pages are still valuable. The two `.mov` files are referenced only from `legacy`. |

## Large Video Asset Check

| File | Size | Above GitHub regular Git recommendation | Needs Git LFS | Ignored now | Runtime required for current active frontend |
| --- | ---: | --- | --- | --- | --- |
| `assets/footprint-globe.mov` | 18.02 MiB | NO for the common 50 MiB warning threshold | Optional | NO | NO; referenced by `legacy/mobile-dark.html` |
| `assets/home-globe.mov` | 66.33 MiB | YES, above 50 MiB warning threshold; below 100 MiB hard limit | Recommended if kept | NO | NO; referenced by `legacy/mobile-app.js` |

No video file was deleted, compressed, moved, or converted to Git LFS.

## Documentation Path Redaction Result

The exact local project path was redacted from prepared Markdown/JSON/CSV documentation:

`<PROJECT_ROOT>`

Modified document:

- `PLANNER_STRATEGY_CAUSALITY_AUDIT.md`

Final search for the exact local project root path in prepared Markdown/JSON/CSV docs returned no matches.

## Feed Eligible Metric Result

The 109 vs 198 difference is explained in:

`FEED_ELIGIBLE_METRIC_DEFINITION.md`

Formal Phase 1-7 metric:

`FeedReadyPoolCount = repository.list({ limit: 99999, routeType? }).total`

Current formal baseline:

| Metric | Value |
| --- | ---: |
| FeedReadyPoolCount all | 851 |
| FeedReadyPoolCount cross | 357 |
| FeedReadyPoolCount single | 494 |

## Estimated First Commit Size

Estimated with the current ignore plan and excluding undecided video assets:

| Scope | File count | Size |
| --- | ---: | ---: |
| Recommended files excluding undecided videos | 375 | 41.49 MiB |
| Undecided video assets | 2 | 84.35 MiB |
| Recommended files plus undecided videos | 377 | 125.85 MiB |

Largest files currently in the candidate set:

| File | Size |
| --- | ---: |
| `assets/home-globe.mov` | 66.33 MiB |
| `assets/footprint-globe.mov` | 18.02 MiB |
| `PLANNER_STRATEGY_STATISTICS.csv` | 3.62 MiB |
| `assets/home-map-p2.png` | 1.96 MiB |
| `data/countries-50m.json` | 0.72 MiB |
| `vendor/three.min.js` | 0.64 MiB |
| `DECISION_TRACE_AUDIT.md` | 0.62 MiB |
| `assets/country-uzbekistan-cover.svg` | 0.61 MiB |

## Blocking Items Before Git Init

No hard blocker remains for `git init`, provided the user accepts these conditions:

1. The sensitive transcript TXT remains ignored and is not staged.
2. API keys that may have appeared in transcripts or chat are rotated by the user.
3. The user decides whether the two `.mov` files should be committed, ignored, moved to Git LFS, or kept outside Git.
4. Immediately after `git init`, run `git check-ignore -v` for the sensitive transcript and other secret patterns before staging.
5. Review `git status --ignored` before the first `git add`.
