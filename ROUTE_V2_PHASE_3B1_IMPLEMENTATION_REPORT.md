# Route Generation V2 Phase 3B-1 Implementation Report

## Summary

Phase 3B-1 has implemented the Local Evidence Collector as a pure function.

This phase only adds local evidence collection:

- Input: `RouteCandidate`
- Input: KG destination pool snapshot used by Candidate Builder
- Optional input: fixed `now`
- Output: valid `EvidenceBundle`

This phase does not connect to Planner, does not write EvidenceBundle Store, does not write JSONL, does not call Tavily / Wikivoyage / network services, and does not modify Candidate Pool, DecisionTrace, RouteRecord, Feed, Search, Detail, image system, accepted repository, bootstrap, or route data.

## Added Files

### `src/lib/routes/local-evidence-collector.mjs`

Adds:

- `LOCAL_EVIDENCE_COLLECTOR_SOURCE`
- `LOCAL_EVIDENCE_COLLECTOR_CREATED_AT`
- `collectLocalEvidenceBundle()`

`collectLocalEvidenceBundle()` is a pure function:

- Does not read files
- Does not read environment variables
- Does not read caches
- Does not call network services
- Does not use `Math.random()`
- Does not read implicit current time unless the caller passes `now`
- Does not mutate `candidate` or KG pool input objects

### `scripts/verify-route-v2-phase3b1-local-evidence-collector.mjs`

Adds isolated Phase 3B-1 verification for single-country, cross-country, missing KG identity, same-name identity ambiguity, KG contradiction, country mismatch, proposedOrder errors, missing coordinates, blank coordinates, non-numeric coordinates, valid zero coordinates, distance calculation, duration weak signal, stability, input immutability, forbidden fields, and real cache protection.

### `src/lib/routes/index.mjs`

Only adds the minimal export for the local evidence collector.

## Evidence Collected

### 1. Destination Identity

Each candidate destination is checked against the KG pool snapshot.

Verified identity now requires a stable ID match:

- `wikidataId`
- `qid`
- explicit KG `id`

Name-only matching is not allowed to prove identity.

If a candidate destination lacks a stable ID, the collector writes an `unknowns[]` entry with:

- `reason: "stable-destination-id-missing"`

If a candidate has a stable ID but it is not found in the KG pool, the collector writes an `unknowns[]` entry with:

- `reason: "stable-destination-id-not-found-in-kg-pool"`

The destination name may still be used after a stable ID match for consistency checks and diagnostics. A name mismatch after stable ID match becomes a failure. The collector never chooses the first KG record only because the name matches.

Evidence item:

- `evidenceCategory: "destination-identity"`
- `sourceType: "knowledge-graph"`
- `supportsWhichDecision: ["destination-inclusion"]`

### 2. Country Match

Checks whether `destination.countryCode` belongs to `candidate.countries`.

- Match: `verified` item
- Mismatch: `failures[]`
- Candidate is never auto-corrected

### 3. proposedOrder Integrity

Checks:

- Every ID in `proposedOrder` exists in `candidate.destinations`
- Every `candidate.destinations` entry appears in `proposedOrder`
- `proposedOrder` has no duplicate IDs

Complete order creates a `verified` item. Missing, duplicate, or extra IDs create failures.

### 4. Coordinate Availability

Each destination coordinate is checked as follows:

- `null`, `undefined`, empty string, or whitespace-only string: `unknowns[]`
- Numeric strings: converted and checked normally
- Non-numeric strings: `failures[]`
- Out-of-range numbers: `failures[]`
- Valid finite numbers: `verified` item
- Real `0` latitude or longitude remains valid

Blank strings are never converted to `0`.

### 5. Adjacent Segment Distance

Only when both adjacent destinations have valid coordinates:

- Uses local haversine calculation
- Creates a `verified` item
- Records `from`, `to`, and `distanceKm`

If either coordinate is missing or invalid:

- Writes `unknowns[]`
- Does not fabricate distance
- Does not judge transport mode

### 6. Duration Fit

Only creates `weak_signal`:

- `durationDays`
- `destinationCount`
- `daysPerDestination`
- `travelStyle`
- `pace`

This local heuristic is never marked `verified` and is not used for scoring, ranking, rejection, or candidate selection.

### 7. Default Unknowns

Phase 3B-1 explicitly records these as unknown:

- `transportFeasibility`
- `seasonalFit`
- `budgetFit`

## EvidenceBundle Behavior

Output must pass `validateEvidenceBundle()`.

`items[]` only contains:

- `verified`
- `weak_signal`

`unknown` only appears in `unknowns[]`.

`failed` only appears in `failures[]`.

The Phase 3B-1 all-matched fixture EvidenceBundle ID is:

`eb-c1d89ba2875b67289c97`

This ID remained unchanged after the PR #9 review fixes. The fixes only tightened identity and coordinate validation and did not change the normal all-matched fixture business evidence.

Older V2 golden IDs also remain unchanged:

- `traceId`
- `candidateId`
- `intentId`
- `candidateShapeKey`

## PR #9 Review Fixes

### Destination Identity Tightening

Fixed issue:

- The previous implementation allowed `name` to participate in KG identity lookup.

Current behavior:

- Verified identity requires stable ID.
- Name-only candidate destinations become unknown.
- Duplicate same-name KG records are not auto-selected.
- Stable ID matching continues to verify identity when the KG record exists.

Added tests:

1. Candidate has only `name`, no stable ID, and KG contains the same name. Result: identity unknown, not verified.
2. KG contains two same-name records. Result: no first-record selection by name.
3. Stable ID match still verifies identity.

### Coordinate Blank String Tightening

Fixed issue:

- Blank coordinate strings could be normalized too early and become indistinguishable from missing or invalid values.

Current behavior:

- `latitude=""` becomes coordinate unknown.
- `longitude="   "` becomes coordinate unknown.
- `latitude="not-a-number"` becomes coordinate failure.
- `latitude=0` and `longitude=0` remain verified.
- Segment distance stays unknown when coordinates are missing.

## Strict Boundary Confirmation

This phase did not modify:

- `route-composition-planner.mjs`
- `materialize-route-pool.mjs`
- Candidate Pool
- DecisionTrace
- EvidenceBundle Store
- RouteRecord
- Feed
- Search
- Detail
- Image system
- accepted repository
- `route-feed-bootstrap.js`

This phase did not:

- Write any JSONL
- Auto-collect real Planner candidate evidence
- Call Tavily / Wikivoyage / network services
- Score, sort, reject, or select candidates
- Start Phase 3B-2 or Phase 3C

## Verification Coverage

The Phase 3B-1 script covers:

1. Single-country three-city candidate, all evidence matched.
2. Cross-country candidate.
3. KG missing one destination.
4. Candidate has only name and no stable ID.
5. KG contains duplicate same-name destinations.
6. Stable ID matched with KG field contradiction.
7. Country code mismatch.
8. proposedOrder missing destination.
9. proposedOrder duplicate ID.
10. Missing coordinates.
11. Blank latitude string.
12. Blank longitude whitespace string.
13. Non-numeric coordinate string.
14. Valid zero latitude and longitude.
15. Valid adjacent distance calculation.
16. Short trip with many destinations, duration remains weak signal.
17. Input objects are not mutated.
18. Same input output is stable.
19. No forbidden RouteRecord or display fields are produced.
20. Output passes EvidenceBundle schema validation.
21. Real Candidate Pool, DecisionTrace, and EvidenceBundle caches are not created or modified.

## Test Results

Ran:

```text
node scripts/verify-route-v2-phase3b1-local-evidence-collector.mjs
node scripts/verify-route-v2-phase3a-evidence-bundle.mjs
node scripts/verify-route-v2-tooling-cleanup.mjs
node scripts/verify-route-v2-phase2b2-planner-sidecar.mjs
node scripts/verify-route-v2-phase2b1-candidate-builder.mjs
node scripts/verify-route-v2-phase2a-candidate-pool.mjs
node scripts/verify-route-v2-phase1-trace.mjs
node scripts/verify-concept-taxonomy.mjs
node scripts/verify-gold-cases.mjs
node scripts/verify-route-content-quality.mjs
git diff --check
```

Result: all PASS.

## Baseline Integrity

| Item | Result |
| --- | --- |
| accepted-routes hash | `AEA28BCC03EAF6CCCE5FD7453F88ECE4F0060789F135EAF837B568D9C43E7E3F` |
| route-feed-bootstrap hash | `9F5E2B2557A9E547073DA4D299F08B5B18B6EBA38B3BD55FC995A16ADF1CD9EF` |
| FeedReadyPoolCount all | 851 |
| FeedReadyPoolCount cross | 357 |
| FeedReadyPoolCount single | 494 |
| real Candidate Pool cache | Not created or modified |
| real DecisionTrace cache | Not created or modified |
| real EvidenceBundle cache | Not created or modified |

## User Impact

No user-visible impact.

Reasons:

- This phase is a pure function only.
- It is not connected to Planner.
- It does not write store files.
- It does not modify any user-visible read path.
- RouteRecord, Feed, Search, Detail, and image system do not read Local Evidence Collector.

## Recommendation

Recommend commit review.

Reasons:

- Scope matches Phase 3B-1.
- PR #9 review issues are fixed.
- Output remains a valid EvidenceBundle.
- Golden EvidenceBundle ID remains unchanged.
- Existing V2 golden IDs remain unchanged.
- Legacy system and user routes remain unchanged.
