# Route V2 Knowledge Expansion Batch 07 Implementation Plan

**Goal:** Add 20 evidence-backed Plannable countries without changing Route Engine behavior, while extending truthful local image coverage and preserving all sealed production baselines.

**Scope:** Albania, Bulgaria, Cyprus, Estonia, Latvia, Lithuania, Malta, Montenegro, Serbia, Slovakia, Georgia, Jordan, Sri Lanka, Nepal, Maldives, Tunisia, Tanzania, Ecuador, Panama, and Guatemala. China remains Catalog-only under the existing Search policy.

**Baseline:** 59 Country / 462 City / 3,130 POI / 3,651 entities; 58 Plannable; 55 Evidence-backed; 221 image assets; 66 dedicated City; 30 dedicated POI; 531 needsBackfill; invalidMapping 0.

## Tasks

- [ ] Freeze a dynamic Catalog/Plannable/Evidence/image-debt inventory and the protected asset hashes.
- [ ] Import four fail-closed Knowledge waves (batches 22–25) from exact Wikidata/Wikipedia identities.
- [ ] Quarantine every unresolved, wrong-country, wrong-type, duplicate, remote, or operational candidate.
- [ ] Rebuild and verify the positive City/POI semantic type policy.
- [ ] Publish independent directed transport Evidence and objective Month Risk with unknown schedule fields left unknown.
- [ ] Add deterministic Country covers; acquire only exact-entity, licensed, local City/POI images within the sealed byte budget.
- [ ] Verify all 20 countries through production Search, 7/14-day, month/season, and representative compound constraints.
- [ ] Verify one Batch 07 single-country and one cross-country Route → Detail → Trip → Complete → Footprint chain.
- [ ] Generate the Batch 07 report, dashboard, image backfill audit, and image size audit from live manifests.
- [ ] Wire Batch 07 integrity, consumption, report-consistency, and alias/homonym checks into mandatory prelaunch.
- [ ] Run focused regression, comprehensive, browser, failure propagation, syntax, whitespace, asset-hash, and same-host main-vs-Batch07 performance A/B checks.
- [ ] Leave all changes unstaged; do not commit, push, open a PR, merge, deploy, tag, release, start Batch 08, or operate on the stash.

## Publication invariants

- A seed is only a candidate. Publication requires exact Country QID/P17, positive City/settlement or POI type ancestry (maximum depth 8), coordinates, valid parent, and distance checks.
- Country covers are Country-only graphics. Placeholder assets are neutral and never count as dedicated City/POI images.
- Runtime external Evidence/image requests remain disabled.
- Accepted, Formal Evidence, Immutable Cache, Runtime State, Metrics, and stash are protected from test writes.
- The RouteIntent performance contract remains aggregate p95 < 0.25 ms; host jitter is handled by same-host A/B attribution, never by changing the contract.
