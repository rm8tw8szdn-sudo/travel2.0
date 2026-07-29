# Route V2 Cache Baseline V2

Status: active release gate
Schema: `cache-manifest-v2`
Generator: `audit-route-v2-cache-baseline-v2@1`

## 1. Why the historical hash is not the current gate

The historical whole-Cache hash
`056d3af349b05cc7ae59620c23be26e11e91dd1d0c37a8bf2b153362834568cb`
is retained in earlier reports without alteration. It is not reproducible because
those reports did not persist the aggregate algorithm, the complete ordered input
manifest, or the historical bytes of five files that are intentionally changed by
normal runtime activity.

The value remains useful as historical evidence. It is not allowed to decide
PASS or FAIL after this baseline version.

## 2. Boundary

The Cache now has three explicit treatment classes:

1. **Immutable Cache** is release-fixed and must match the versioned file manifest
   byte for byte.
2. **Runtime State** is allowed to evolve between real runs. Every current file
   must match a known lifecycle class and pass structural and safety validation.
   A verifier must also prove that tests do not change it.
3. **External formal assets** live under the Cache directory for compatibility
   but retain an independent release baseline. Currently this is
   `accepted-routes.json`.

### Immutable Cache

| File | Why it is immutable at release time |
| --- | --- |
| `route-evidence.json` | It is the fixed evidence repository read by `discovery.mjs`. Background or offline evidence jobs may intentionally regenerate it, but any such change requires a new reviewed Cache Baseline V2 manifest before release. |

Current immutable snapshot:

- files: **1**
- bytes: **4,348,028**
- file SHA-256:
  `4bb9e7b702de1c9b981f0ed53a649632e2a7149bd7f2dabedfa120dcde13c376`
- aggregate SHA-256:
  `61e243e0c0756d53513ab7205281f8c796eeb074317f484d08784cbc5fe9505c`
- evidence records: **2,865**
- duplicate evidence IDs: **0**

Four evidence records refer to Wikivoyage source-route IDs that are no longer
members of the current Accepted repository. They remain valid external provenance
references, not dependencies on an Accepted record:

- `wikivoyage-6392`
- `wikivoyage-150395`
- `wikivoyage-153501`
- `wikivoyage-206089`

### External formal asset

`accepted-routes.json` is not counted twice. It remains guarded by the independent
Accepted SHA-256:

`aea28bcc03eaf6ccce5fd7453f88ece4f0060789f135eaf837b568d9c43e7e3f`

### Required Runtime State

The following five files are always Runtime State:

| File | Bytes at baseline creation | Structure | Code lifecycle evidence |
| --- | ---: | --- | --- |
| `provider-sync-state.json` | 1,029 | provider cursor/counters JSON | `provider-sync-state-store.mjs` reads and atomically rewrites provider progress |
| `knowledge-graph-pool.json` | 92,911 | ISO country → entity list JSON | `wikidata-sparql-knowledge-graph.mjs` reads and rewrites the cached query pool |
| `search-analytics.jsonl` | 517,797 | append-only event JSONL | `route-search-analytics.mjs` appends search and detail-click events |
| `search-cache.json` | 448,550 | intent-fingerprint cache JSON | `route-search-cache.mjs` reads and atomically rewrites TTL entries |
| `search-review-candidates.json` | 510,329 | review-candidate JSON | `route-search-cache.mjs` reads and atomically rewrites review candidates |

Required Runtime State subtotal:

- files: **5**
- bytes: **1,570,616**

Other current Runtime State was classified from actual producers and consumers,
not from names alone:

| Structure class | Files | Bytes | Lifecycle |
| --- | ---: | ---: | --- |
| Accepted historical backups | 35 | 1,163,544,380 | offline materialization/prewarm rollback snapshots |
| proxied image bodies | 134 | 55,311,834 | written by the server image proxy disk cache |
| proxied image metadata | 134 | 33,879 | written with proxied image bodies |
| generated media reports | 5 | 539,024 | image-pool, prewarm, proxy-warm and audit command outputs |
| route image cache | 1 | 326,072 | read and written by `server.js` |
| route evidence historical backup | 1 | 3,135,486 | offline rollback snapshot |
| route Candidate Pool | 1 | 103,543 | V2 sidecar runtime JSONL |
| generated Feed response snapshots | 3 | 375,668 | request/run-dependent bootstrap captures, not runtime inputs |
| destination image snapshot | 1 | 18,451 | generated image lookup output, not a release-fixed source |
| bulk generation reports | 3 | 3,388 | offline run reports |
| runtime logs | 6 | 1,278 | server and command output |
| required Runtime State above | 5 | 1,570,616 | live state |

Complete Runtime State snapshot:

- files: **329**
- bytes: **1,224,963,619**

The complete path-by-path list and structure type are stored in
`route-v2-cache-manifest-v2.json`.

## 3. Aggregate algorithm

Files are enumerated recursively and converted to root-relative paths with `/`
separators. Entries are sorted by path. Each immutable entry contributes exactly:

```text
relativePath + NUL + byteLength(base10) + NUL + fileSha256(lowercase hex) + LF
```

The UTF-8 bytes of all entries are streamed into SHA-256. File SHA-256 values use
the original bytes. JSON and JSONL are not reformatted. Absolute paths, file
timestamps, directory traversal order, OS path separators, machine identity and
process identity are excluded.

This makes the aggregate reproducible on Windows and other operating systems.

## 4. Runtime State audit

Runtime State does not have a fixed release content hash. Its current audit hash
is emitted only to compare the state before and after a test run.

The audit enforces:

- all five required files exist;
- every file belongs to an explicit lifecycle rule;
- JSON roots and required fields match their file-specific minimum schemas;
- every non-empty JSONL line parses to an object;
- accepted backups contain a repository object and route records;
- Candidate records have stable identities and no duplicates;
- image proxy bodies are non-empty and paired with metadata;
- image proxy metadata is valid JSON and paired with a body;
- file-specific safety limits are enforced;
- text state contains no absolute user/temp paths, browser profile paths, or
  obvious populated secret fields;
- corrupted Search Cache and knowledge graph files degrade to an empty result in
  their existing readers;
- tests compare the complete Runtime State snapshot before and after execution.

A UTF-8 BOM on the three historical Feed response snapshots is tolerated by the
structure parser. Their unmodified original bytes are still used for audit hashes.

## 5. Current content integrity

The baseline audit confirms:

- total Cache files: **331**
- total Cache bytes: **1,274,874,063**
- unclassified files: **0**
- unreadable files: **0**
- zero-byte immutable files: **0**
- invalid JSON/JSONL: **0**
- duplicate Accepted route IDs: **0** across 5,500 records
- duplicate immutable evidence IDs: **0** across 2,865 records
- proxied image body/metadata pairs are complete
- no absolute local path, temp directory path, browser profile path, or populated
  secret field was found in Immutable Cache
- formal Cache was unchanged by all destructive-copy tests

## 6. Commands

Verify the current repository:

```text
node scripts/audit-route-v2-cache-baseline-v2.mjs
```

Run deterministic and destructive-copy verification:

```text
node scripts/verify-route-v2-cache-baseline-v2.mjs
```

Regenerate the versioned baseline only after an intentional, reviewed immutable
asset change:

```text
node scripts/audit-route-v2-cache-baseline-v2.mjs --write-baseline
```

The last command must not be used to make an unexplained mismatch pass.

## 7. Adding a new Runtime State file

1. Identify its concrete reader and writer.
2. Add one narrow path/family rule and a file-specific structure validator.
3. Set a justified size ceiling and safe-corruption behavior.
4. Add a destructive-copy test for missing, truncated and malformed content.
5. Regenerate the informational Runtime State path list.
6. Review that Immutable Cache and Accepted hashes did not change.

Unknown files fail closed; they are never silently placed in Runtime State.
