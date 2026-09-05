# Route V2 Batch 09 Four P1 Fixes Plan

> **Scope:** Close only the four reproducible Batch 09 P1 findings. Keep all work uncommitted and preserve the existing stash.

## Goals

1. Make POI semantic admission evaluate every declared P31 signal and fail closed on unknown or incompatible mixed types.
2. Reject financial exchanges and financial-market entities unless an independent, valid travel semantic is present; remove affected published entities from all consumers.
3. Resolve overlapping country and city phrases by longest valid span before identity deduplication.
4. Anchor sealed historical reports to immutable Git blobs instead of a mutable current-worktree manifest.

## Implementation sequence

### 1. Mixed-type POI admission

- Add failing cross-consumer fixtures for positive + unknown, positive + country, positive + hospital, positive + harmless building/monument, unknown-only, and positive + incompatible combinations.
- Refactor the canonical evaluator so raw P31 signals are classified as positive, broad structural, restricted/incompatible, or unresolved before aggregate admission.
- Require at least one positive travel semantic and reject unresolved or incompatible signals; broad structural signals may supplement but never grant admission.
- Keep importer, semantic gate, publication audit, core-POI image classification, and all verifier consumers on the same canonical evaluator.

### 2. Financial-market semantics and reconciliation

- Add policy-level financial-market ancestry classification and negative fixtures for stock/securities exchanges versus physical visitor markets.
- Require any financial entity to have an independent non-market travel semantic before admission.
- Re-run the positive-admission reconciliation so rejected exchanges are removed from published POI files, selections, provenance, image bindings, and route consumers, while remaining traceable in quarantine/audit outputs.
- Recompute dynamic entity and coverage totals.

### 3. Overlapping search entities

- Add parser and production-chain fixtures for San Salvador / El Salvador, Salvador / Brazil, mixed-country routes, short preposition aliases, and existing ambiguous Santiago/Lagos/Cordoba fail-closed behavior.
- Select longest valid entity spans before country identity deduplication; suppress weak/short aliases inside an accepted longer entity span.
- Preserve explicit hard constraints and verify planner output contains only the intended country/city identities.

### 4. Git-anchored sealed history

- Add mutations for report-only, report+manifest, unrelated commit, missing path, Batch 08 report+manifest, and untouched snapshots.
- Resolve each sealed snapshot from `git show <sourceMergeCommit>:<path>`, verify commit/path existence, and compare current files with canonical line-ending normalization only.
- Treat the manifest as an index and audit record, never as the trust root.

### 5. Release wiring and validation

- Register mixed-type, financial-market, overlapping-parser, and Git-anchored immutable verifiers as mandatory stages.
- Extend failure propagation so any non-zero exit or signal blocks the comprehensive gate.
- Run the scoped semantic, route, report, image, Trip/Footprint, browser, cache, syntax, and comprehensive checks exactly once; record an environment-sensitive performance result without changing its contract.
- Confirm formal hashes, cache/runtime counts, metrics absence, staged count, branch status, and stash message.

## Non-goals

- No Batch 10 expansion, UI work, deployment, threshold change, commit, push, PR, merge, tag, release, or stash operation.

## Verification checkpoints

- [x] Mixed-type admission: 9 cases across all six consumers, including reproduced positive-plus-cycle and positive-plus-overdepth failures. Invalid paths now survive aggregate admission.
- [x] Financial-market admission: 7 cases; eight exchanges quarantined with zero downstream references.
- [x] Overlapping parser: San Salvador / El Salvador production route has only SV and Q3110; existing homonyms remain fail-closed.
- [x] Historical snapshots: 26 files anchored to four source merge commits; ten mutations rejected, including explicit Batch05 report-only and report-plus-manifest changes.
- [x] POI rescan: 5,379 candidates, 3,963 published, 1,416 quarantined. Published total: 119 Countries / 833 Cities / 3,963 POIs / 4,915 entities.
- [x] Route Consumption 106/106, hard-constraint stress 331/331, Trip/Footprint and targeted browser cases passed.
- [x] Image baseline regenerated with an isolated temporary Git index; real staged count remains zero. Assets 997 / City dedicated 600 / POI dedicated 132 / debt 443 / invalid mappings 0.
- [x] Node syntax checked for 54 changed/new JS/MJS files; diff checks and mandatory failure propagation passed.
- [x] Final comprehensive: 73/73 mandatory stages plus the live browser stage passed; exit 0. Final invariant aggregate p95: 0.190459 ms under the unchanged 0.25 ms contract. The earlier tool session lost its final output; a recovery attempt was stopped before performance to close the reproduced mixed invalid-path omission. The final result is retained at `C:/Users/admin/AppData/Local/Temp/route-v2-batch09-comprehensive-final-20260904.log`.
- [x] Post-run protected assets: all 331 Cache files match the temporary before/after SHA-256 snapshot; Runtime State 329, Metrics 0. Accepted, Formal Evidence and Immutable hashes match the requested baselines. Comprehensive also confirms all 315 Knowledge files remained unchanged during tests.
- [x] Git protection: branch and HEAD unchanged, real staged count 0, stash object `2a874aa32df41285a150e79d6a8981cee2f032db` and message unchanged; Git LFS fsck passed. No commit/push/PR/merge or stash mutation.
