# Browser Acceptance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Run current six-card route behavior in real Chromium and provide reproducible browser reports.

**Architecture:** Use Playwright Test with the production server in an isolated temporary runtime directory. Browser UI tests replace discovery responses with deterministic records while serving actual HTML, JS, CSS and local images. A separate smoke test exercises the actual server's default discovery and knowledge APIs; neither category is described as online route-generation acceptance.

**Tech Stack:** Node.js 24, Playwright Test, Chromium, npm lockfile.

---

### Task 1: Runtime preparation

- [x] Restore tracked `assets/`, `data/`, and `vendor/` files from the reviewed Git commit and verify Git blob hashes.
- [x] Install pinned `@playwright/test` as a dev dependency and run `npx playwright install chromium`; use project-local browser cache for this checkout.

### Task 2: Reusable test setup

Files: create `scripts/browser-test.cjs`, `tests/browser/global-setup.cjs`, `playwright.config.cjs`, `tests/browser/server.cjs`, `tests/browser/fixtures.cjs`, `tests/browser/routes.spec.cjs`; update `package.json`.

- [x] Configure Chromium at mobile 360px/390px and desktop 1280px, one worker, fresh browser contexts, HTML reports, failure screenshots and retained failure traces.
- [x] Start production `server.js` on a dedicated localhost port with accepted/search/image/analytics storage under a temporary directory and online providers disabled. Close the process and remove only the owned temporary directory after tests.
- [x] Intercept bootstrap and discovery in UI cases; leave all page code and image resolution unchanged. Return six-card records, stable cursors and final partial batches.

### Task 3: Browser acceptance

- [x] Assert initial six cards, five scroll batches, unique IDs, preserved first DOM card, terminal pagination and no horizontal overflow.
- [x] Assert search submission, detail navigation and reload, favorite persistence, error retry, empty results and missing-image fallback.
- [x] Collect page errors, console errors and unexpected failed local requests; permit only explicitly injected failures.
- [x] Add unmocked default-server smoke checks with real knowledge data and no online generation.
- [x] Run `npm.cmd run test:browser`; inspect screenshots and fix observed problems. Run relevant unit/smoke checks after any production edit.

### Task 4: Handoff

Files: update `README.md`, `DEV_SETUP.md`, `docs/code-review-2026-09-07.md`; create browser acceptance report.

- [x] Document installation, commands, exact tested scope, reports, and remaining online/visual limitations.
- [x] Review diff, verify no generated data is staged, commit and update the existing draft PR if still open.
