# Plannable Expansion Batch 01 Promotion Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Promote only Batch01 countries whose published entity depth, independently reviewed transport/season evidence, and real Route V2 execution satisfy the existing production readiness contract.

**Architecture:** A promotion authority module derives static decisions from published production facts. A trusted derive-only coordinator loads the exact policy from sealed main and invokes an internal fixed-scope production search evaluator for all six candidates without first granting readiness. The readiness validator reruns that coordinator to derive expected membership in memory, then verifies the policy, audit artifact, and report against it. Serialized files are descriptive only, and no promotion evaluator is exported from the public route index.

**Tech Stack:** Node.js 24 ESM, JSON policy artifacts, existing Route V2 repositories/planner/search service, `node:assert` deterministic verifiers.

---

### Task 1: Promotion authority

**Files:**
- Create: `src/lib/routes/plannable-expansion-batch01-promotion-authority.mjs`
- Test: `scripts/verify-plannable-expansion-batch01-promotion.mjs`

- [x] Define the fixed Batch01 candidate universe and evaluate identity, destination/POI ownership, reviewed transport completeness, reviewed season completeness, and the general single-destination exemption from supplied production facts.
- [x] Reject missing, duplicated, mismatched, or caller-asserted readiness facts; return one immutable decision per candidate with explicit blockers.
- [x] Add negative fixtures for incomplete transport, incomplete season, fake single-destination exemption, missing POI depth, and direct caller promotion.

### Task 2: Atomic readiness-policy promotion

**Files:**
- Create: `scripts/promote-plannable-expansion-batch01.mjs`
- Modify: `data/knowledge/semantic/country-route-readiness-policy.json`
- Modify: `src/lib/routes/knowledge-readiness-authority.mjs`

- [x] Load the sealed entity/evidence reports and published registries, evaluate all twelve Batch01 countries, and select only passing candidates.
- [x] Move passing codes from catalog-only/evidence-pending into plannable; add only multi-destination countries with admitted transport and season evidence to evidence-backed.
- [x] Derive readiness counts from the sealed pre-promotion baseline and validated promotion metadata, then reconcile them with the normalized partitions.
- [x] Write the policy atomically and refuse partial, duplicate, unknown, or manually asserted promotion input.
- [x] Reject same-count BB-to-SC/SM substitutions by comparing policy membership with the independently derived production authority.
- [x] Make the serialized authority artifact audit-only by recomputing live decisions before validating policy, artifact, or report.
- [x] Remove the public arbitrary-candidate readiness bypass and retain only a fixed-scope internal evaluator outside the public index.

### Task 3: Real Route V2 promotion verification

**Files:**
- Create: `scripts/verify-plannable-expansion-batch01-promotion.mjs`
- Create: `data/knowledge/reports/plannable-expansion-batch01-promotion.json`
- Create: `PLANNABLE_EXPANSION_BATCH01_PROMOTION_VALIDATION.md`

- [x] Exercise country-only, country-plus-days, country-plus-month, and country-plus-days-plus-month queries through `createRouteSearchService` for every promotion candidate with all online evidence sources disabled.
- [x] Assert the requested country remains the exact hard country set, destinations and POIs are unique, entity identities are published, and long trips fail closed or deepen without fabricated duplication.
- [x] Verify SC and SM receive only the general single-destination transport exemption and remain blocked when their production route queries fail.
- [x] Verify BZ, CV, DM, MN, TT, and UG remain catalog-only and cannot acquire plannable authority.
- [x] Generate the promotion report from evaluated decisions and actual runtime results.

### Task 4: Repository regressions

**Files:**
- Modify: `scripts/verify-knowledge-coverage-semantics.mjs`
- Modify: `scripts/verify-plannable-expansion-batch01-entity-foundation.mjs`

- [x] Update current-state assertions to the new authoritative partition while preserving sealed historical reports.
- [x] Run promotion authority, coverage semantics, semantic gate, route, stress, browser, Node, historical, image, syntax, and whitespace checks.
- [x] Confirm production entities remain 195/866/4071/5132, candidate leakage remains none, images remain unchanged, and protected local state is untouched.
