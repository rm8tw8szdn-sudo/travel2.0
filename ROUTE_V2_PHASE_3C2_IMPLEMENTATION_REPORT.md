# Route Generation V2 Phase 3C-2 Implementation Report

## Summary

Phase 3C-2 adds the Real Online Evidence Provider Foundation for Route Generation V2.

This stage creates a provider foundation that can be injected into the Phase 3C-1 pure online evidence adapter. It handles provider configuration, strict feature flags, abortable timeout, bounded retry / rate-limit behavior, normalized provider output, and consistent diagnostics.

This phase does not connect to Planner, does not write EvidenceBundle Store JSONL, does not call real network services in tests, and does not change RouteRecord, Feed, Search, Detail, image systems, accepted repository, or bootstrap.

## Modified Files

- Added `src/lib/routes/route-v2-online-evidence-provider.mjs`
- Added `scripts/verify-route-v2-phase3c2-online-provider-foundation.mjs`
- Added `ROUTE_V2_PHASE_3C2_IMPLEMENTATION_REPORT.md`
- Modified `src/lib/routes/index.mjs` with minimal exports only

No Planner, EvidenceBundle schema/store, extractor, corroborator, source scorer, Feed, Search, Detail, image, accepted repository, bootstrap, or real cache file was modified.

## Provider Contract

The foundation exports:

- `searchRouteV2OnlineEvidence()`
- `createRouteV2TavilyEvidenceProvider()`
- `createRouteV2WikivoyageEvidenceProvider()`
- `routeV2OnlineEvidenceConfig()`

The normalized result includes:

- `ok`
- `configured`
- `attempted`
- `provider`
- `query`
- `results`
- `failure`
- `diagnostics`
- `attempts`
- `retrievedAt` when available
- `attempts` and `retrievedAt` are now present on every return path, including disabled, unconfigured, timeout, abort, no-result, parse-failed, provider-error, rate-limited, and success paths.

The provider returns web search results only. It does not generate RouteRecord, EvidenceBundle verification status, selected candidates, rejected candidates, scores, or final route decisions.

## Final Read-Only Acceptance Fixes

The first final read-only acceptance did not fully pass. It found two issues:

1. Some failure paths returned an incomplete provider contract and missed `attempts` / `retrievedAt`.
2. Malformed Tavily results such as `results: [{}]` were normalized into empty result objects but still counted as a successful non-empty result set.

The provider now uses a shared result builder so all return paths contain the same contract:

- `ok`
- `configured`
- `attempted`
- `provider`
- `query`
- `results`
- `failure`
- `diagnostics`
- `attempts`
- `retrievedAt`

Attempt semantics are fixed as:

- unconfigured / disabled: `attempted=false`, `attempts=0`
- pre-aborted: `attempted=true`, `attempts=0`
- first-attempt success or failure: `attempts=1`
- `maxRetries=1`: at most `attempts=2`
- `maxRetries=3`: at most `attempts=4`

`retrievedAt` uses the injected `now()` source in tests and is present for both success and failure results.

Valid Tavily result criteria are intentionally conservative:

- `sourceUrl` must be a non-empty parseable HTTP or HTTPS URL.
- At least one meaningful text field must remain after normalization: `sourceTitle` or `sourceSnippet`.
- Completely empty records, blank fields, invalid URLs, and null-only records are filtered out.
- If HTTP and JSON parsing succeed but all records are filtered out, the failure is `no-result`.
- If JSON cannot be parsed or the top-level payload is not an expected result container, the failure is `parse-failed`.

The raw Tavily object is not passed through.

## Feature Flags And Configuration

The foundation keeps all online evidence behavior disabled by default.

Required flags for Tavily provider configuration:

- `ROUTE_V2_EVIDENCE_BUNDLE_ENABLED=true`
- `ROUTE_V2_EVIDENCE_ONLINE_ENABLED=true`
- `ROUTE_V2_TAVILY_EVIDENCE_ENABLED=true`
- `ROUTE_WEB_SEARCH_API_KEY` must be present
- `ROUTE_WEB_SEARCH_API_URL` may be provided; otherwise the Tavily endpoint default is used

Important Phase 3C-2 rule:

- Only the exact string `"true"` enables these provider-foundation flags.
- `"false"`, empty string, missing value, `"0"`, and `"yes"` do not enable provider execution.

Additional configuration:

- `ROUTE_V2_EVIDENCE_ONLINE_TIMEOUT_MS`
- `ROUTE_V2_EVIDENCE_ONLINE_MAX_QUERIES`
- `ROUTE_V2_EVIDENCE_ONLINE_MAX_RETRIES`

`ROUTE_V2_WIKIVOYAGE_EVIDENCE_ENABLED` is reserved. Phase 3C-2 adds a Wikivoyage placeholder provider that reports unavailable / not configured diagnostics and does not reuse `live-provider.mjs`, because `live-provider.mjs` is a RouteRecord discovery provider rather than an EvidenceBundle provider.

## AbortSignal Timeout Behavior

The provider foundation does not rely on `Promise.race` alone.

For real provider calls:

- A local `AbortController` is created.
- Any external `AbortSignal` is bridged into the local controller.
- The local signal is passed into `fetchImpl`.
- Timeout calls `abort()`.
- Timers are cleared in `finally`.
- A pre-aborted external signal returns `failure: "aborted"` without calling `fetchImpl`.

The dedicated verification script confirms that timeout aborts the mock fetch signal, and that a successful fetch does not receive a late abort after the timer should have been cleared.

## Retry And Rate-Limit Rules

Retry behavior is bounded and testable.

- Default max retries: `0`
- Hard cap: `3`
- `429` maps to `rate-limited` and can retry within `maxRetries`
- `5xx` maps to `provider-error` and can retry within `maxRetries`
- timeout can retry within `maxRetries`
- `400`, `401`, and `403` do not retry
- `provider-not-configured` does not retry
- `no-result` does not retry
- `parse-failed` does not retry
- external `aborted` does not retry

Retry wait is injectable. The verification script uses injected wait functions, so tests do not sleep for real backoff periods.

Diagnostics include:

- attempt count
- retry flag
- retry wait
- final failure
- HTTP status where available
- error message where available

## Failure Classification

Phase 3C-2 covers:

- `provider-not-configured`
- `timeout`
- `no-result`
- `parse-failed`
- `provider-error`
- `rate-limited`
- `aborted`

The provider foundation may keep this richer failure classification internally. Phase 3C-1 adapter compatibility remains intact; the adapter still owns EvidenceBundle enrichment semantics, weak / verified upgrade rules, field aggregation, and schema validation.

## Phase 3C-1 Adapter Compatibility

The provider foundation is compatible with:

- `enrichEvidenceBundleWithOnlineEvidence()`
- `createWebEvidenceExtractor()`
- `createWebEvidenceCorroborator()`

The verification script proves that:

- injected provider output and mocked real provider output produce equivalent enriched EvidenceBundle content;
- the enriched EvidenceBundle validates;
- multi-source transport evidence can become verified only through the Phase 3C-1 adapter and corroboration rules;
- `budgetFit` remains unknown;
- provider success is not treated as verified by itself.

## Network And Storage Boundaries

No real network call is made by tests.

All provider tests use mocked `fetchImpl` or injected provider objects.

This phase does not:

- connect to Planner
- write EvidenceBundle Store
- write Candidate Pool
- write DecisionTrace
- write old Evidence Repository
- modify RouteRecord
- modify Feed, Search, Detail, or image systems
- modify accepted repository or bootstrap
- start Phase 3C-3

## Verification Results

Focused Phase 3C-2 verification:

- `node scripts/verify-route-v2-phase3c2-online-provider-foundation.mjs` PASS

Focused output:

- provider contract includes `attempts` and `retrievedAt` on every tested path
- malformed Tavily records are filtered before success is decided
- empty-after-filtering payloads return `no-result`
- unexpected top-level payloads return `parse-failed`
- disabled scenarios fetch calls: `0`
- mocked real provider calls: `1`
- adapter compatibility: PASS
- failure reasons covered: `provider-not-configured`, `timeout`, `no-result`, `parse-failed`, `provider-error`, `rate-limited`, `aborted`
- FeedReadyPoolCount: all `851` / cross `357` / single `494`

Full regression results:

- `node scripts/verify-route-v2-phase3c2-online-provider-foundation.mjs` PASS
- `node scripts/verify-route-v2-phase3c1-online-evidence-adapter.mjs` PASS
- `node scripts/verify-route-v2-phase3b2-planner-evidence-sidecar.mjs` PASS
- `node scripts/verify-route-v2-phase3b1-local-evidence-collector.mjs` PASS
- `node scripts/verify-route-v2-phase3a-evidence-bundle.mjs` PASS
- `node scripts/verify-route-v2-tooling-cleanup.mjs` PASS
- `node scripts/verify-route-v2-phase2b2-planner-sidecar.mjs` PASS
- `node scripts/verify-route-v2-phase2b1-candidate-builder.mjs` PASS
- `node scripts/verify-route-v2-phase2a-candidate-pool.mjs` PASS
- `node scripts/verify-route-v2-phase1-trace.mjs` PASS
- `node scripts/verify-concept-taxonomy.mjs` PASS
- `node scripts/verify-gold-cases.mjs` PASS
- `node scripts/verify-route-content-quality.mjs` PASS
- `git diff --check` PASS

`git diff --check` emitted only the existing Windows line-ending warning for `src/lib/routes/index.mjs`; it reported no whitespace errors.

## Baseline Integrity

Focused verification confirmed:

- accepted repository unchanged
- bootstrap unchanged
- real Candidate Pool cache unchanged
- real DecisionTrace cache unchanged
- real EvidenceBundle cache unchanged
- old Evidence Repository default path unchanged
- user-facing route files unchanged
- FeedReadyPoolCount unchanged: all `851` / cross `357` / single `494`

Full regression confirms:

- Phase 3B-1 golden remains `eb-c1d89ba2875b67289c97`
- accepted-routes hash remains `aea28bcc03eaf6ccce5fd7453f88ece4f0060789f135eaf837b568d9c43e7e3f`
- bootstrap hash remains `9f5e2b2557a9e547073da4d299f08b5b18b6eba38b3bd55fc995a16adf1cd9ef`

## Next Stage

The next stage should be:

Route Generation V2 Phase 3C-3: Planner Online Evidence Sidecar Integration.

That future phase should decide when and how Planner sidecar calls the online adapter and writes enriched EvidenceBundles. It must remain sidecar-only and must not score, sort, reject, select candidates, or change RouteRecord.
