# Route V2 Long-trip Capacity and UI Safety Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve the existing single-city open-ended Citywalk design while adding bounded country/region expansion routes, safe query-length handling, semantically correct image fallback, browser navigation restoration, and a usable constraint-safe legacy fallback.

**Architecture:** Add one shared trip-capacity policy consumed by RouteIntent normalization, destination suggestion, Planner candidate sizing, final route decoration, and fallback validation. Country/region long trips use curated, extended, or deep-exploration modes within explicit day/city/POI limits; explicit one-city long stays continue to use the existing open-ended Citywalk reference. Frontend protections remain local to the Route UI: validate before fetch, only accept exact local image mappings, and persist a bounded navigation snapshot in `history.state`/`sessionStorage`.

**Tech Stack:** Node.js ESM, existing Route V2 repositories and Planner, browser JavaScript, deterministic verifier scripts.

---

## Task 1: Lock the product boundaries with failing regression tests

- [ ] Add a production-path verifier covering Japan 7/14/30/100 days and Europe 100 days.
- [ ] Assert 14 days enters expansion mode and 30 days enters deep exploration mode.
- [ ] Assert unsupported durations return a structured capacity conflict rather than a misleading short route.
- [ ] Add UI regressions for the 160-character guard, semantically safe image resolution, and state restoration.
- [ ] Add a V2-off production-path regression proving Japan 7 days still returns a constraint-safe legacy result and leaves V2 sidecars unchanged.

## Task 2: Add a shared bounded long-trip capacity policy

- [ ] Create a shared capacity helper with curated, extended, deep-exploration, and unsupported outcomes.
- [ ] Define maximum supported days, cities, POIs, and countries for single-country, region/multi-country, and unconstrained suggestion modes.
- [ ] Keep explicit single-city long stays on the existing open-ended Citywalk path.
- [ ] Feed the shared city capacity into RouteIntent and Planner candidate sizing.
- [ ] Reject only requests beyond the actual declared capacity.

## Task 3: Make expansion visible and grounded

- [ ] Decorate generated records with expansion mode, requested/available coverage, and bounded POI coverage drawn only from existing city entities.
- [ ] Use more city/POI coverage as duration increases, without inventing destinations or modifying Knowledge assets.
- [ ] Mark coverage shortages explicitly when the current repository cannot fill the target.
- [ ] Keep all generated V2 records behind the existing review/publication gate.

## Task 4: Harden frontend input, images, and navigation state

- [ ] Reject over-160-character input before a Discovery request and show a friendly inline message without console errors.
- [ ] Remove cross-country and continent-level image substitutions; use exact route/city/country mappings or the unified travel placeholder.
- [ ] Persist query, route classification, rendered count, cursor/session context, and scroll position before detail navigation/page hide.
- [ ] Restore the bounded snapshot on Back/Forward or the detail-page return link without duplicating requests/cards.
- [ ] Clear stale search summaries when the query is cleared.

## Task 5: Preserve a safe legacy emergency path

- [ ] Ensure a V2-disabled request can still use the existing generated legacy route builder.
- [ ] Run the same RouteIntent invariant/fallback checks on legacy results.
- [ ] Confirm no Candidate, Trace, Evidence, Publication, or Ready Pool writes occur when V2 is excluded.

## Task 6: Validate and hand off without committing

- [ ] Run all new targeted verifiers plus Search Intent, Planner, fallback, PR #19 closures, Cache Baseline V2, performance, and comprehensive prelaunch.
- [ ] Run `node --check` on every changed JS/MJS file and `git diff --check`.
- [ ] Compare tracked Knowledge/Evidence seed fingerprints and confirm no formal Runtime State/metrics files were created.
- [ ] Start the local server with isolated runtime paths and exercise desktop plus 360×800 and 390×844 browser flows.
- [ ] Report exact modified/untracked files and leave staged=0 with no commit or push.
