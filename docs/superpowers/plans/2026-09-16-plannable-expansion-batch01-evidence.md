# Plannable Expansion Batch 01 Evidence Implementation Plan

**Goal:** Build independently sourced, deterministic transport and seasonal-risk evidence candidates for BB, BZ, CV, DM, MN, RW, SC, SM, TT, UG, ZM, and ZW without granting plannable or evidence-backed authority.

**Architecture:** A reviewed seed records the required directed route graph, one objective seasonal-risk profile per published destination, sources, and explicit unknowns. A batch-specific importer validates source trust, entity identity, directionality, and schemas before writing admitted records into the existing evidence seed library. A separate audit/report records admitted, blocked, conflicted, and missing claims. The verifier reconstructs expected coverage from the published entity registry, proves single-destination transport exemption by structure, checks production/candidate boundaries, and locks readiness promotion to zero.

**Tech Stack:** Node.js 24 ESM scripts, existing Route V2 evidence schemas, JSON/JSONL data, built-in `node:assert`, repository verification scripts.

---

## Task 1: Establish the reviewed evidence source of truth

**Files:**
- Create: `data/knowledge/seeds/plannable-expansion-batch01-evidence.json`
- Read: `data/knowledge/reports/plannable-expansion-batch01-entity-foundation.json`
- Read: `data/knowledge/batches/plannable-expansion-batch01-readiness-authority.json`

1. Bind the 12 approved ISO codes to their published country and destination identities.
2. Encode the required directed route graph: 42 directed claims across ten multi-destination countries.
3. Encode one objective month/season risk profile for each of the 33 published destinations.
4. Record SC and SM as structurally exempt from transport evidence because each has exactly one destination.
5. Store only independently reviewed sources with URL, authority, locator, retrieval date, excerpt, and supported claim.
6. Leave unsupported claims explicitly blocked or missing; do not infer them.

## Task 2: Implement deterministic evidence admission

**Files:**
- Create: `scripts/import-plannable-expansion-batch01-evidence.mjs`
- Modify: `src/lib/routes/local-evidence-source-schema.mjs`
- Modify: `data/route-v2/evidence-seed/route-leg-evidence.jsonl`
- Modify: `data/route-v2/evidence-seed/season-evidence.jsonl`
- Modify: `data/route-v2/evidence-seed/evidence-seed-manifest.json`

1. Resolve every seed identity against the published entity repository.
2. Admit only HTTPS sources from explicitly reviewed official or high-trust domains.
3. Validate every route record as directed and bind its claim to exact endpoint identities.
4. Validate every seasonal record against the existing schema and preserve objective-risk-only semantics.
5. Reject duplicate stable IDs, unsupported reverse-direction inference, invalid identities, and schema failures.
6. Update the shared evidence manifest atomically and deterministically.

## Task 3: Preserve evidence authority and conflicts

**Files:**
- Create: `data/knowledge/batches/plannable-expansion-batch01-evidence-audit.json`
- Create: `data/knowledge/reports/plannable-expansion-batch01-evidence.json`
- Create: `scripts/report-plannable-expansion-batch01-evidence.mjs`

1. Record candidate, validated, production-admitted, blocked, missing, and conflict counts separately.
2. Report source authority quality and per-country coverage.
3. Prove `readinessPromotions = 0`, `addedPlannable = 0`, and `addedEvidenceBacked = 0`.
4. Preserve 195/866/4071/5132 entity counts and 118/115/77 readiness counts.
5. Label the result `EVIDENCE READY CANDIDATE`, never Plannable or performance-cleared.

## Task 4: Add fail-closed verification

**Files:**
- Create: `scripts/verify-plannable-expansion-batch01-evidence.mjs`
- Modify: `package.json` only if a repository-standard named command is necessary

1. Reconstruct expected destination and route coverage from the production registry and reviewed seed.
2. Require 33 unique destination risk profiles and validate each source/identity binding.
3. Require every admitted route claim to match an explicit directed seed claim.
4. Verify SC/SM exemption through the general single-destination rule.
5. Reject candidate leakage, duplicate identities, weak provenance, fabricated reverse legs, and readiness promotion.
6. Add mutation fixtures for direction, endpoint identity, source binding, seasonal identity, single-destination exemption, and readiness semantics.

## Task 5: Validate the implementation

**Files:**
- Create: `PLANNABLE_EXPANSION_BATCH01_EVIDENCE_VALIDATION.md`

1. Run the Batch 01 evidence verifier and report generator consistency checks.
2. Run existing evidence schema, source provenance, identity binding, directed transport, season, theme trust, conflict, and candidate-leakage verifiers.
3. Run coverage semantics and the 5,132-entity semantic gate.
4. Run Route regression, Batch 01 route checks, hard-constraint stress, browser/runtime assertions, repository smoke, and relevant Node tests.
5. Run historical snapshot, image integrity, syntax, and whitespace checks.
6. Confirm the protected stash hash and four existing browser artifacts are unchanged.
7. Record the unresolved performance state without running qualification or a formal performance experiment.


## Transport authority correction

- [x] Replace undirected pair expansion with reviewed directional/bidirectional source claims.
- [x] Bind the reviewed payload hash to URL, publisher, page identity, fact, endpoint identities, directionality, mode, retrieval time, and supports.
- [x] Route importer and mutation fixtures through the shared production authority validator.
- [x] Re-adjudicate the 32 prior directions and block unsupported CV and TT directions.
- [x] Record the separate season authority P1 without expanding this transport-only correction.
- [x] Replace generated season supports with source-bound reviewed Destination/month claims.
- [x] Re-adjudicate 33 season profiles: 28 admitted, 5 blocked.
- [x] Exclude Evidence source URLs from the image seal by semantic reference kind while retaining production image protection.
- [x] Split caller candidate claims from a module-owned reviewed claim catalog.
- [x] Remove caller-supplied `expected.reviewedClaim` from production validation.
- [x] Reject unknown IDs and caller-sealed claims through the exact production path.
