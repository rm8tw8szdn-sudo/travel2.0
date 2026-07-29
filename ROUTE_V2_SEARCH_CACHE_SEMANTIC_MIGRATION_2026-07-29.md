# Route V2 Search Cache Semantic Migration — 2026-07-29

## Scope

This migration removed exactly two previously confirmed invalid runtime Search Cache items. It did not reinterpret or repair their user intent, and it did not modify Accepted routes, Knowledge assets, `route-evidence.json`, or the Immutable Cache manifest.

The formal Search Cache is ignored by Git and remains runtime state. Its post-migration content hash is informational, not an immutable release baseline.

## Stable identities and diagnostics

| Stable item key | Intent hash | Original item SHA-256 | Diagnostic |
| --- | --- | --- | --- |
| `rif-v1-4c9d9d9e924247460776563f966f40d75d9356b45bf1e64a564bf3a11b38a207` | `b2fc20b07fe7aee60479d294` | `e61b2ad7697da1cae8d5f80b342bc176d490bc9fc6b3707c91c4dc176927efff` | `route-intent-semantic-invalid` at `hardConstraints.season` |
| `rif-v1-4a112c70660af13de649f33fbfba67a0dc7ef29fe427375c2f2f448d9a4f1a3e` | `35810b5c6e7e1d9fa6d85ae9` | `4c965018978b117fa46758520283524389b63e503c3fa90bf73070f9aa0d8906` | `route-intent-semantic-invalid` at `hardConstraints.season` |

Both items declared `timeType=unspecified` while also providing a winter season. The top-level normalized intent and the embedded route record independently failed the canonical RouteIntent semantic validator.

## Migration method

1. Parsed the complete Search Cache with the production RouteIntent validator.
2. Located the two items by their stable object keys, intent hashes, content hashes, reason code, field path, RouteIntent fingerprint, and fingerprint version. Array positions were recorded for audit only and were not used as deletion identities.
3. Created a timestamped, repository-external, read-only backup containing the original Search Cache and a sanitized migration manifest.
4. Removed only the two stable keys.
5. Compared every retained item in original order using exact JSON value serialization.
6. Wrote a sibling temporary file, flushed it, parsed and hashed it, then atomically replaced the runtime Search Cache.
7. Confirmed no temporary migration file remained.

## Versioned authorization lock

The executable migration now uses authorization schema
`route-v2-search-cache-semantic-migration-authorization-v2`. Before either a
backup or a temporary output file is created, the complete set of invalid
records must exactly match the two historical signatures above, including:

- stable item key;
- intent hash;
- SHA-256 of the complete item value;
- `route-intent-semantic-invalid` reason code;
- `hardConstraints.season` field path;
- RouteIntent fingerprint and `route-intent-fingerprint-v1`;
- both expected violation scopes (`normalizedIntent` and its embedded route).

Count-only matching is not authorization. A missing target, changed hash,
changed field path, arbitrary same-type record, or additional decoy record
causes a fail-closed refusal with no backup and no write. Running `--apply`
against the already-migrated 22-record Search Cache also fails closed with
`migration-already-applied-or-no-authorized-records`; it never searches for a
new pair to delete. `--verify-clean` remains a generic read-only semantic audit.

The original source remains in the timestamped, repository-external
`~/route-v2-cache-backups/` hierarchy. No absolute workstation path is part of
the repository.

## Before and after

| Metric | Before | After |
| --- | ---: | ---: |
| Search Cache item count | 24 | 22 |
| Search Cache bytes | 448,550 | 408,033 |
| Search Cache SHA-256 | `b7aa2667d763832baf44cf867f7340cbd52662da2a59dd550be19ed87706464c` | `941ddcbe9c252a9b826772a6c75fa68e93748254e2aee1a2b85d4703e94b2838` |
| Complete Cache file count | 331 | 331 |
| Complete Cache bytes | 1,274,874,063 | 1,274,833,546 |
| Runtime State file count | 329 | 329 |
| Runtime State bytes | 1,224,963,619 | 1,224,923,102 |

The 40,517-byte reduction is exactly the Search Cache migration delta.

## Unchanged formal baselines

- Accepted repository SHA-256: `aea28bcc03eaf6ccce5fd7453f88ece4f0060789f135eaf837b568d9c43e7e3f`
- Immutable Cache aggregate SHA-256: `61e243e0c0756d53513ab7205281f8c796eeb074317f484d08784cbc5fe9505c`
- Immutable Cache file count: 1
- Immutable Cache bytes: 4,348,028
- Knowledge file count: 51
- Knowledge bytes: 41,412,835

## Version-control boundary

`.route-v2-cache/search-cache.json` is excluded by `.gitignore` and is not tracked. The runtime file is therefore not part of the migration commit. The deterministic migration command, implementation plan, and this audit report are versioned so that the authorized operation remains reproducible and reviewable without promoting mutable runtime content into an immutable asset.
