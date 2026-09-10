# Route V2 Image Debt Recovery 02 CRLF Hotfix Validation

Date: 2026-09-10  
Base: `main` at `912831c809fe5754f7ddedc32e1a21b209068481`  
Branch: `codex/route-v2-recovery02-crlf-hotfix`

## Root cause and fix

The Recovery02 audit read historical round, previous-audit, and current provenance snapshot files from the Windows working tree and hashed their raw bytes. Git's Windows checkout converted the sealed LF files to CRLF, so six historical comparisons and one source-snapshot comparison failed even though canonical LF content exactly matched every sealed hash.

Recovery02 text comparisons now reuse `normalizeKnowledgeBaselineText()` through one text hash matcher. It converts only CRLF and CR to LF. The matcher also recognizes the existing legacy CRLF manifest seal without changing that sealed hash. Raw SHA-256 remains in place for WebP and other binary asset verification.

## Focused regression

- LF source versus LF seal: PASS.
- CRLF source versus LF seal: PASS.
- CR source versus LF seal: PASS.
- Legacy CRLF sealed hash compatibility: PASS.
- Character change, deleted line, added line, ordinary-space change, line-order change, and stale source snapshot: all rejected.
- Binary fixture: text-normalized hash differs from raw binary SHA-256; binary normalization is rejected.
- Existing Recovery02 entity/source binding mutations: 10/10 rejected.
- Historical hash mismatches: 0/6 after the fix.
- Current source snapshot mismatch: 0/1 after the fix.

## Sealed truth and smoke

- Recovery02 verifier: PASS; 404/443 recovered (223 City / 181 Core POI).
- Assets: 1401; Country Cover 118/118; Dedicated City 823/833; Dedicated Core POI 313/342.
- Remaining: 39 (10 City / 29 Core POI), all exhausted and assigned the neutral placeholder; invalidMapping 0.
- Provenance: 404/404; attribution-required creator/attribution: 357/357.
- Baseline: tracked/hash/bytes/missing/unexpected mismatches all 0.
- Knowledge: 119 Country / 833 City / 3963 POI / 4915 entities; Semantic Gate 4915/4915 PASS; quarantined 1416.
- Route Consumption: 106/106 PASS; hard stress: 331/331 PASS; Trip/Footprint PASS; duplicate City 0.
- Real Edge browser smoke: PASS; wrong entity 0, broken image 0, external runtime image requests 0, console errors/warnings 0.
- Git LFS fsck: PASS.

## Protected state

- Accepted: `aea28bcc03eaf6ccce5fd7453f88ece4f0060789f135eaf837b568d9c43e7e3f`.
- Formal Evidence: `4bb9e7b702de1c9b981f0ed53a649632e2a7149bd7f2dabedfa120dcde13c376`.
- Immutable aggregate: `61e243e0c0756d53513ab7205281f8c796eeb074317f484d08784cbc5fe9505c`.
- Cache 331 / Runtime State 329 / Metrics 0.

Performance was not rerun for this hotfix. The single main measurement remains **0.340223 ms > 0.25 ms — ABSOLUTE PERFORMANCE CONTRACT FAIL**. The Recovery02 historical measurement remains **0.266090 ms > 0.25 ms — ABSOLUTE FAIL, environment-sensitive/inconclusive, with no Recovery02-specific stable regression detected**.

No Recovery02 data, sealed hashes, images, provenance, Knowledge, route semantics, performance contract, percentile/statistics, or stash content changed.
