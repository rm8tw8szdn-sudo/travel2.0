# Route V2 City Detail Static Failsafe Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the shared City Detail shell neutral before JavaScript runs and permanently verify its static markup, complete image request chain, and script-failure behavior.

**Architecture:** `city-oslo.html` remains the compatibility entry point but becomes a generic City Detail shell whose hero image and initial text contain no Oslo-specific semantics. The existing Chromium verifier gains source-level assertions, per-navigation image request recording, and a blocked-`city-detail.js` scenario so the release gate tests both the final hydrated page and the fail-safe HTML.

**Tech Stack:** Static HTML, Node.js ESM, Chrome DevTools Protocol, existing Route V2 isolated preview server and prelaunch gate.

---

### Task 1: Make the compatibility page a neutral City Detail shell

**Files:**
- Modify: `city-oslo.html:6-36`

- [x] **Step 1: Add a failing static-shell assertion to the existing verifier**

Read `city-oslo.html`, extract the element marked `data-city-cover`, and require this exact default:

```html
<img src="assets/route-city-placeholder.svg" alt="城市占位图" data-city-cover data-cover-source="neutral-placeholder" />
```

Also reject `city-oslo-cover.svg`, `/countries/`, and the initial strings `奥斯陆`, `挪威`, `Oslo`, and `Norway`.

- [x] **Step 2: Run the verifier and confirm the current page fails**

Run: `node scripts/verify-route-v2-city-detail-image-fallback.mjs`

Expected: non-zero exit because the initial hero source is `assets/city-oslo-cover.svg` and Oslo-specific initial text remains.

- [x] **Step 3: Replace only the unsafe initial defaults**

Use the shared placeholder and generic text:

```html
<title>城市详情</title>
<img src="assets/route-city-placeholder.svg" alt="城市占位图" data-city-cover data-cover-source="neutral-placeholder" />
<h1 data-city-name>城市详情</h1>
<p data-city-country>目的地信息加载中</p>
<p class="country-intro" data-city-intro>正在加载城市信息。</p>
```

Do not rename the compatibility page or change its route behavior.

### Task 2: Verify every City image request and the JavaScript failure path

**Files:**
- Modify: `scripts/verify-route-v2-city-detail-image-fallback.mjs`

- [x] **Step 1: Record per-navigation image requests from the first request onward**

Use CDP `Network.requestWillBeSent`, filter `resourceType === "Image"`, and associate requests with each navigation. For London, Nara, Berlin, and Oslo, require the first City hero request to be `/travel-collection/assets/route-city-placeholder.svg`; reject `/countries/`, `city-oslo-cover.svg`, and any other City-specific local image while no verified dedicated image exists.

- [x] **Step 2: Add a `city-detail.js` load-failure simulation**

Use CDP request interception to fail only `/travel-collection/city-detail.js`. Navigate to London and assert that the static image is complete, non-broken, and the neutral placeholder; require zero Oslo and Country cover requests. Console errors caused solely by the deliberately blocked script are reported separately from the normal-page zero-error requirement.

- [x] **Step 3: Run the focused verifier**

Run: `node scripts/verify-route-v2-city-detail-image-fallback.mjs`

Expected: PASS with static HTML, four hydrated browser cases, a script-failure case, zero external requests, and zero Oslo/Country fallback image requests.

### Task 3: Run the existing Batch 05 release boundary

**Files:**
- Verify only; no additional production files.

- [x] **Step 1: Run targeted image and report checks**

Run the City Detail image, image quality, image manifest, report consistency, Batch 05, route consumption, Trip/Footprint, Semantic Gate, Cache Baseline V2, and failure-propagation verifiers. Expected: all PASS and image coverage remains 38 Country covers, 0/306 dedicated Cities, 0/105 dedicated Core POIs, 411 placeholders/backfill records, and 0 invalid mappings.

- [x] **Step 2: Run the comprehensive gate**

Run the repository comprehensive prelaunch verifier. Expected: all mandatory stages execute and PASS; the mandatory count remains the count declared by `MANDATORY_PRELAUNCH_VERIFIERS` because this strengthens an existing stage rather than adding a stage.

- [x] **Step 3: Run syntax and whitespace checks**

Run `node --check` for all modified/new JavaScript modules and `git diff --check`. Expected: PASS.

- [x] **Step 4: Confirm protected assets and Git boundaries**

Recompute Accepted, Formal Evidence, Immutable Cache, Cache and Runtime State counts; confirm Metrics remains absent and `stash@{0}` is unchanged. Leave all changes unstaged and do not commit, push, merge, deploy, tag, release, or manipulate the stash.
