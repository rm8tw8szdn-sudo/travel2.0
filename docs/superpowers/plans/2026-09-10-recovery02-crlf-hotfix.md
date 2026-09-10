# Recovery02 CRLF Hotfix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Recovery02 text snapshot hashes stable across LF, CRLF, and CR checkouts without weakening stale-content detection or changing binary hashing.

**Architecture:** Reuse `normalizeKnowledgeBaselineText()` and `sha256KnowledgeBaselineText()` for every Recovery02 comparison whose sealed input is text. Keep the existing raw byte SHA-256 helper for WebP and other binary assets. Add focused fixtures that prove newline-only equivalence and reject content, line, space, order, stale snapshot, and binary mutations.

**Tech Stack:** Node.js ESM, `node:assert/strict`, existing Route V2 verifier helpers.

---

### Task 1: Lock the canonical text hash contract

**Files:**
- Create: `scripts/verify-route-v2-image-debt-recovery02-text-hashing.mjs`

- [ ] Add LF, CRLF, and CR equivalence assertions using `sha256KnowledgeBaselineText()`.
- [ ] Add assertions rejecting character, line, ordinary-space, line-order, and stale-snapshot changes.
- [ ] Add a binary fixture proving binary SHA-256 remains byte-sensitive and is not passed through the text normalizer.
- [ ] Run the new verifier and confirm it fails until Recovery02 exposes and uses the canonical text hash path.

### Task 2: Canonicalize Recovery02 text snapshot comparisons

**Files:**
- Modify: `scripts/lib/image-debt-recovery02-audit.mjs`

- [ ] Import the existing canonical text helper.
- [ ] Add a narrowly named Recovery02 text hash wrapper using canonical LF normalization.
- [ ] Route source manifest, round history, previous audit, and current source snapshot text hashes through the wrapper.
- [ ] Leave WebP, processed asset, perceptual, and other binary hashes on raw SHA-256.

### Task 3: Verify main-compatible behavior and protected truth

**Files:**
- Modify: `ROUTE_V2_IMAGE_DEBT_RECOVERY_02_CRLF_HOTFIX_VALIDATION.md`

- [ ] Run the focused text-hashing verifier and Recovery02 verifier on the Windows checkout.
- [ ] Confirm all seven newline-only mismatches are gone and real-content mutations still fail.
- [ ] Run baseline, semantic, route, stress, trip/browser, LFS, and formal protection checks without rerunning performance.
- [ ] Record the existing main and historical performance failures accurately.
- [ ] Confirm only hotfix files are modified, staged is empty, and stash is unchanged.
