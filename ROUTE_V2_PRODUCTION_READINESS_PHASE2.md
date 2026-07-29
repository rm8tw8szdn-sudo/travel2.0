# Route Generation V2 Production Readiness Phase 2

## Anonymous full rollout

The current product has no account system. Production can run V2 for every
anonymous visitor with:

```text
ROUTE_V2_RUNTIME_ENABLED=true
ROUTE_V2_CANARY_PERCENTAGE=100
ROUTE_V2_RUNTIME_METRICS_PATH=<writable runtime path>/route-v2-runtime-metrics.json
```

At 100%, no user or session identifier is required. A partial rollout still
requires a stable session or user subject and fails closed when neither exists.

## Emergency rollback

Set:

```text
ROUTE_V2_RUNTIME_ENABLED=false
```

and restart the Node process. The master switch forces every controlled V2
child flag off, regardless of its individual environment value. Search then
uses the legacy Planner and does not modify Accepted, Knowledge, or Immutable
Cache assets.

Rollback does not require a code change, commit, data migration, or cache
rewrite.

## Anonymous runtime metrics

The runtime metrics file contains only:

- aggregate request, V2 attempt, display, fallback, reject, and empty-result
  counters;
- bounded Candidate, Evidence, Publication, and fallback reason-code counts;
- bounded Search, Planner, and Cache latency histograms;
- derived p50, p95, and p99 summaries returned in memory.

It never stores full search text, user IDs, session IDs, route payloads,
absolute paths, or per-request latency samples.

The default operational bounds are:

- 100,000 requests per metrics window;
- 256 KiB per active metrics file;
- three numbered archives;
- atomic same-directory replacement using a temporary file and `fsync`.

The bounds can be adjusted with:

```text
ROUTE_V2_RUNTIME_METRICS_WINDOW_REQUESTS
ROUTE_V2_RUNTIME_METRICS_MAX_BYTES
ROUTE_V2_RUNTIME_METRICS_MAX_ARCHIVES
```

The file and its numbered archives are optional Runtime State in Cache
Baseline V2. They never participate in the Immutable Cache aggregate.

## Current writer constraint

The JSON metrics writer is intentionally single-instance. Exactly one Node
process may write a given metrics path. Multiple application instances must
use separate paths until a database or external metrics backend is introduced.
This phase does not implement distributed locking or cross-instance
aggregation.
