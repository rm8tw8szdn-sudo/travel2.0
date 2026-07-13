# Search V1 Product Design

## 1. Product Positioning

Search V1 is Travel Intent Search, not keyword search over route titles.

Users type travel needs, not database identifiers. Queries such as `日本8天`, `东京大阪`, `日本第一次`, `冰岛冬季自驾`, and `土耳其热气球摄影` may all map to structured travel intent before any route is returned.

Search must therefore parse the query into a Planner Context first, then decide whether to return existing routes, use Search Cache, or call Realtime Planner.

Feed and Search are separate products:

- Feed is a repository-only browsing surface.
- Search is an intent-resolution surface.
- Feed must never call Planner in real time.
- Search may call Realtime Planner when repository/cache results are insufficient.

## 2. Search Pipeline

Search V1 pipeline:

```text
Search Query
↓
Intent Parser
↓
Accepted Repository / Search Index
↓
Enough high-quality results?
├─ yes → return ranked existing results
└─ no
   ↓
   Search Cache lookup by normalized Planner Context
   ↓
   Cache hit?
   ├─ yes → merge cache results with existing results
   └─ no
      ↓
      Realtime Planner
      ↓
      LLM Refinement
      ↓
      Evidence Check
      ↓
      return current user results
      ↓
      async write to Search Cache / Review Candidate
```

Realtime Planner output must not directly enter Feed. A generated route can become visible in Feed only after full validation and Accepted Repository write.

V1 latency target:

- Search should return the first useful response within 2 seconds.
- If Realtime Planner cannot finish within the latency budget, Search should return repository/cache results plus suggestions instead of blocking indefinitely.
- Planner, LLM refinement, and evidence checks should each accept a deadline so Search can degrade gracefully.

## 3. Intent Parser

Intent Parser converts raw text into a normalized Search Intent.

Fields:

- `country`
- `region`
- `city`
- `duration`
- `tripIntent`
- `travelStyle`
- `season`
- `theme`
- `transport`
- `pace`
- `difficulty`
- `budget` (reserved)

Examples:

| Query | Parsed Intent |
| --- | --- |
| `日本8天` | country=`JP`, duration=`8天`, style inferred from first-trip/default |
| `东京大阪` | country=`JP`, cities=`东京/大阪`, likely classic-first-trip |
| `日本第一次` | country=`JP`, tripIntent=`First Trip`, style=`classic-first-trip` |
| `冰岛冬季自驾` | country=`IS`, season=`winter`, style=`road-trip`, theme=`aurora/winter` |
| `土耳其热气球摄影` | country=`TR`, theme=`hot-air-balloon/photography`, likely region=`Cappadocia` |

Intent parsing failure must not trigger hard generation. If the parser cannot extract enough valid constraints, Search returns suggestions and recommended query refinements.

V1 parser strategy:

- Default parser is rule-first: dictionaries, aliases, normalized labels, and lightweight regex.
- Parser implementation must be swappable through an interface such as `intentParser.parse(query, options)`.
- LLM parsing is reserved as a fallback plugin, but V1 should not block the 2-second response target waiting for it.
- The parser should return confidence and extracted constraints, not only a plain context object.

## 4. Search Index

Search Index must support normalized labels and aliases, not only route titles.

Index sources:

- Country names and aliases: `日本`, `Japan`, `JP`
- City names and aliases: `东京`, `Tokyo`
- Region names: `关西`, `Kansai`
- Theme labels: `红叶`, `樱花`, `极光`, `葡萄酒`, `热气球`, `摄影`
- Travel Style labels: `第一次`, `经典`, `铁路`, `自驾`, `跳岛`, `朝圣`
- Season labels: `冬季`, `夏季`, `红叶季`, `圣诞`
- Accepted Route metadata
- Gold Case destinations and product concepts

Search Index must normalize:

- simplified/traditional variants where possible
- Chinese and English labels
- country codes
- common city aliases
- route style synonyms

## 5. Search Result Sources

Search can read from:

1. Accepted Repository
2. Search Cache
3. Realtime Planner

Search result statuses:

- `accepted`: route already exists in Accepted Repository.
- `search-generated`: route generated for this search and returned to the current user.
- `needs-review`: generated route has useful intent match but lacks enough evidence, media, or validation confidence for Accepted Repository.

Only `accepted` routes are eligible for Feed, Detail, Favorite, and Trip.

Search-generated results must have a detail view. In V1, detail can resolve from Search Cache by `searchResultId` or generated route id. This detail view is part of Search, not Accepted Repository Detail, until the route is accepted.

## 6. Ranking

Search must not rank by title.

Ranking dimensions, in priority order:

1. Intent Match
2. Quality Score
3. Travel Value
4. Gold Case Similarity
5. Freshness
6. Popularity (reserved)

Same-intent routes should be grouped together. For example, `日本8天` should not interleave unrelated Japan routes between strong `classic-first-trip` candidates unless the user intent is broad enough to justify variety.

Each result must include `matchReason`, for example:

- `匹配国家=日本，时长=8天，风格=经典初访`
- `匹配城市=东京/大阪，覆盖首次日本路线核心城市`
- `匹配季节=冬季，匹配主题=极光，匹配交通方式=自驾`
- `由相同 Planner Context 的缓存结果返回`

## 7. Query Constraint Level

Search should not return a fixed count just because the page size is 20.

Target result count should decrease as the query becomes more constrained.

Effective constraints include:

- Country
- Region
- City
- Duration
- Season
- Theme
- Travel Style
- Transport
- Budget
- Pace
- Difficulty

V1 target count:

| Constraint Level | Example | Target |
| --- | --- | --- |
| 0-1 broad constraints | `日本` | 10 diverse routes |
| 2 constraints | `日本8天` | 6 routes |
| 3 constraints | `日本8天第一次` | 4 routes |
| 4+ constraints | `冰岛冬季自驾极光` | 1-2 high-fit routes |

Search should return fewer, more differentiated, higher-quality routes as intent becomes clearer.

Near-duplicates must be merged before pagination. Search should avoid returning the same travel product under multiple titles.

## 8. Near-Duplicate Merge

Near-duplicate detection should compare:

- normalized Planner Context
- country set
- destination overlap
- duration band
- travel style
- theme
- route structure
- Gold Case similarity

When duplicates are found:

- prefer `accepted` over `search-generated`
- prefer higher quality score
- prefer licensed media-ready routes
- merge match reasons where helpful
- keep one visible result for the same travel product

## 9. Search Suggestions

Suggestions are generated during input and must not come only from route titles.

Suggestion sources:

- Country
- City
- Region
- Theme
- Travel Style
- Season
- Accepted Routes
- Gold Case concepts
- Popular/trending query terms (reserved)

Examples:

Input `日`:

- 日本
- 日本第一次
- 日本经典
- 日本铁路
- 日本自驾
- 日本樱花

Input `冰`:

- 冰岛
- 冰岛自驾
- 冰岛极光
- 冰岛黄金圈

Suggestion payload should include:

- `label`
- `type`
- `intentPatch`
- `score`
- `reason`

## 10. Filters

Search filters:

- Country
- Region
- Duration
- Travel Style
- Trip Intent
- Season
- Theme
- Transport
- Pace
- Difficulty (reserved)

Filters should modify the normalized Search Intent, not perform only post-filtering on visible titles.

## 11. Cursor Pagination

Search and Feed both use cursor pagination. Offset pagination is not allowed.

Search V1 page size:

- default page size: 20
- page size is a transport limit, not a product target
- actual returned count can be lower based on Query Constraint Level

Cursor must encode the stable ranking anchor:

- normalized intent hash
- result source status
- intent match score
- quality score
- travel value score
- gold case similarity score
- freshness
- route id

During a pagination session, newly generated or newly accepted routes must not cause:

- duplicate results
- skipped results
- changed order

New routes appear only on the next search or refresh.

## 12. Search Cache

Search Cache key:

```text
hash(normalized Planner Context + filters + locale)
```

Cache value:

- normalized intent
- generated results
- planner context
- evidence status
- createdAt
- expiresAt
- source query

V1 cache behavior:

- storage: `.route-v2-cache/search-cache.json`
- review candidates: `.route-v2-cache/search-review-candidates.json`
- same Planner Context should not repeatedly call Planner
- TTL can be simple and adjustable
- cache can store `search-generated` and `needs-review` results
- cache write can be asynchronous after the current user receives results

## 13. Search Miss Behavior

If Accepted Repository and Search Cache do not provide enough results, Search may call Realtime Planner synchronously.

V1 assumptions:

- user scale is fewer than 10 people
- no complex queue, shared task, or high-concurrency optimization is required yet
- correctness of travel intent and usefulness of returned routes matter more than infrastructure sophistication

Realtime generation should stop when:

- Intent Parser fails
- query constraints are contradictory
- country/region is disabled
- evidence is too weak to produce a useful route
- generated route is near-duplicate of an existing accepted route
- country/region is temporarily disabled. China is currently disabled; Search should simply return no generated route or suggestions rather than exposing a hard error.

## 14. Repository Boundary

Feed, Detail, Favorite, and Trip always read Accepted Repository.

Search can read:

- Accepted Repository
- Search Cache
- Realtime Planner

Realtime Planner generated results:

- can be returned to current Search user
- can be written to Search Cache
- can be written to Review Candidate
- cannot directly enter Feed
- can enter Accepted Repository only after full validation

V1 acceptance policy:

- Default: generated results write to Search Cache and Review Candidate.
- After manual quality validation, the product can enable a policy switch to automatically write high-confidence generated routes to Accepted Repository.
- Suggested switch: `SEARCH_AUTO_ACCEPT_GENERATED=false` by default.
- Auto-accept, if enabled later, must still require full validation, licensed cover media, near-duplicate merge, and quality score threshold.

## 15. Extensibility

Search V1 should reserve interfaces for:

- Coverage Matrix
- popular search completion
- operator recommendations
- user behavior learning
- trending query
- personalization
- budget and difficulty modeling

V1 does not need to implement these systems, but the pipeline should leave explicit extension points:

- `intentParser.plugins`
- `rankingSignals`
- `suggestionSources`
- `cachePolicy`
- `reviewCandidateWriter`
- `plannerContextResolver`
- `generatedRouteAcceptancePolicy`

## 16. V1 Acceptance Criteria

Search V1 is acceptable when:

1. Search result statuses distinguish `accepted`, `search-generated`, and `needs-review`.
2. Intent parser failure returns suggestions instead of forced generation.
3. Search Index supports Chinese and English aliases plus normalized labels.
4. Every search result includes `matchReason`.
5. Near-duplicate travel products are merged before ranking and pagination.
6. Query Constraint Level controls target result count.
7. Cursor pagination is stable and does not use offset.
8. Feed remains repository-only and never calls Planner in real time.
9. Search-generated routes never enter Feed unless accepted through validation.
10. Same normalized Planner Context can use Search Cache instead of repeated Planner calls.
