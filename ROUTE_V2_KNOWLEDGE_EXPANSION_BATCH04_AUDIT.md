# Route V2 Knowledge Expansion Multi-Country Batch 04 Audit

## Boundary

Batch 04 remains additive Knowledge Layer work. A subsequent, tightly scoped Route Engine blocker closure repairs only explicit multi-city and multi-country hard-constraint preservation. Accepted routes, formal Cache and Runtime State remain read-only, and no Batch 04 data asset is changed by the blocker closure.

Batch 04 owns only:

- the Batch 04 seed, raw Wikidata snapshots and batch09–13 City/POI/selection/provenance/conflict/review assets;
- the Batch 04 country and Evidence importers and verifier;
- additive published-asset registry entries;
- official-source allowlist additions required by the new Evidence;
- cumulative verifier expectations required by the expanded registry;
- Batch 04 Evidence records and manifest counts;
- the Batch 04 plan, coverage dashboard and this audit.

The blocker closure owns only SearchIntent country recognition, RouteIntent normalization/fingerprinting, explicit-country Candidate construction, Planner minimum-destination validation, production/Oracle/fallback invariant enforcement, and focused permanent verifiers. It does not expand Knowledge, alter Batch 04 data, or change UI/P2 behavior.

No file is staged, committed or pushed. The retained pre-PR #19 stash is not applied, popped or dropped.

## Entity model boundary

The published schema supports Country, City and POI. It has no region/island destination type. These candidates are isolated rather than misrepresented as Cities:

- Portugal: Algarve.
- Greece: Meteora, Crete, Rhodes island and Corfu island.

Kalabaka, Heraklion, Chania, Rhodes Town and Corfu Town are published as their real City entities; they do not replace or retype the isolated regional/island concepts.

## Per-country outcome

| Sub-batch | Published Cities | Published POIs | New Cities | New POIs | New directed transport | New risk months | Conflicts | Orphans | Isolated candidates |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 04A Germany | 12 | 91 | 10 | 85 | 16 | 4 | 0 | 0 | 0 |
| 04B Austria | 8 | 55 | 8 | 55 | 10 | 4 | 0 | 0 | 0 |
| 04C Portugal | 10 | 69 | 10 | 69 | 14 | 4 | 0 | 0 | 1 |
| 04D Greece | 9 | 66 | 9 | 66 | 12 | 4 | 0 | 0 | 4 |
| 04E Netherlands | 10 | 67 | 8 | 61 | 14 | 4 | 0 | 0 | 0 |

Batch 04 adds 45 City entities, 336 POIs, 66 directed RouteLegEvidence records and 20 risk-only SeasonEvidence records. The cumulative published repository contains 51 Countries, 144 Cities and 904 POIs.

## Data integrity and source policy

- Every published City and POI has a stable Wikidata QID and coordinates.
- Published duplicate entity IDs, duplicate City QIDs, duplicate POI QIDs, orphans and conflicting parents are zero.
- Failed or ambiguous title resolution is not replaced with guessed QIDs or filler POIs.
- Transport records are directed; reverse directions use separate stable IDs.
- Evidence sources are official transport operators or national meteorological authorities.
- Duration, transfer and frequency fields remain unknown when the official source does not explicitly support a stable reusable value.
- Month records contain objective weather/transport risks only and keep `suitabilityStatus=unknown`.

## Validation status

The following pass:

- Batch 01 and Batch 02 preservation verifiers;
- Batch 03 Italy, France, Spain and South Korea preservation verifiers;
- Batch 04A Germany, 04B Austria, 04C Portugal, 04D Greece and 04E Netherlands country verifiers;
- cumulative Entity Layer, Runtime API and Planner Entity Layer integration;
- Evidence promotion and Candidate Evidence Validation;
- Planner pipeline, Search V1 and Region/Island constraints;
- City Detail UI, six-card infinite feed and image fallback;
- Cache Baseline V2, including three identical runs and destructive tests on a temporary copy;
- comprehensive prelaunch and its 29 isolated stages.

All changed or untracked JavaScript modules pass `node --check`. Whitespace and staged-diff checks are recorded in the final Git audit.

## Isolated browser acceptance

The visible in-app browser ran against a local server whose Accepted copy, Search Cache, analytics, Candidate, Trace, EvidenceBundle, local Evidence, Ready Pool, metrics and image cache paths were all under a unique `%TEMP%` root. Online Evidence providers, runtime image search and auto-accept remained disabled. The server was stopped and its port released after testing.

All 20 requested searches reached a final UI state without timing out:

- Germany 7/14/21 days expanded the generated route from 4 to 6 to 8 visible City entities.
- Austria 7/14 days expanded from 4 to 6 Cities.
- Portugal 7/14 days expanded the generated result from 4 to 6 Cities.
- Greece 7/14 days expanded from 4 to 6 Cities.
- Netherlands 7/14 days expanded the generated result from 4 to 6 Cities.
- `Vienna Salzburg Innsbruck 10 days` and `Amsterdam Rotterdam The Hague 7 days` preserved the requested City set and order.
- Every successful single-country result stayed inside its displayed country. No duplicate City label appeared within a visible route scope.
- One generated detail from each Batch 04 country remained byte-for-byte stable in visible main content for at least 5.2 seconds. Back restored the query/result state and Forward restored the same detail.
- Every observed result/detail image used a local `assets/` URL. Country-specific images were used where available and the unified placeholders were used elsewhere; alt text remained route/destination-specific.
- Browser Console errors: 0. Browser Console warnings: 0. Observed external page assets: 0.

### Route Engine blocker closure

The explicit multi-city failure was not an Entity Layer recognition failure: both requested Cities reached `requiredCities`, every Candidate retained them, and Planner produced a legal two-City route. The final Planner content validator nevertheless applied the historical non-city-break minimum of three destinations to 7/10-day requests and rejected the valid result. Validation now derives its minimum from the explicit required-City count, so a user-requested two-City route remains exactly two Cities and extra days increase depth rather than destination count.

The explicit multi-country failure had three reinforcing causes: country recognition selected one catalog-order match, destination suggestion then rewrote the request to that one country, and the final gate could trust claimed country metadata instead of the route's actual destination countries. SearchIntent now records all explicit countries in query order; RouteIntent hard constraints and fingerprints retain the complete set; multi-country requests bypass single-country suggestion; every Candidate covers every required country; production, independent Oracle and fallback gates require exact actual coverage and enforce fixed country order.

Focused permanent verifiers pass for all requested ordinary and fixed-order multi-city and multi-country cases. RouteIntent model, invariant/Oracle, Candidate selection, fallback preservation, Search acceptance, Planner, Search V1, Region/Island, long-trip capacity, Batch 04 country, cumulative Entity Layer, Runtime API, Cache Baseline V2, performance and comprehensive prelaunch regressions pass. Mutation testing kills all 42 mutants, including deletion of one required City, deletion of one required country, two Cities becoming one, and multiple countries becoming one.

Two independent visible in-app browser runs confirm the closure. The latest real-user rerun produced:

- `Berlin Munich 7 days`: `DE｜柏林 · 慕尼黑`.
- `Lisbon Porto 7 days`: `PT｜里斯本 · 波尔图`.
- `Athens Thessaloniki 10 days`: `GR｜雅典 · 塞萨洛尼基`.
- `Rome Florence 7 days`: `IT｜罗马 · 佛罗伦萨`.
- `Seoul Busan 7 days`: `KR｜首尔 · 釜山`.
- `Germany Austria 14 days`, `France Germany 14 days`, `Spain Portugal 14 days` and `Italy Austria 14 days`: every displayed route covers both requested countries.
- `Germany → Austria 14 days`: `DE · AT`; `先法国再德国14天`: `FR · DE`.
- `Germany Austria 1 day`: explicit unsatisfied-constraint state, with no single-country downgrade.

The latest rerun again recorded Console errors `0`, Console warnings `0`, online Evidence providers disabled, runtime image search disabled, local result image paths only, image cache files `0`, and image-proxy cache files `0`. Its server was stopped and the port was released.

## Formal asset baseline

- Accepted SHA-256: `aea28bcc03eaf6ccce5fd7453f88ece4f0060789f135eaf837b568d9c43e7e3f`
- Immutable Cache aggregate: `61e243e0c0756d53513ab7205281f8c796eeb074317f484d08784cbc5fe9505c`
- Immutable `route-evidence.json` SHA-256: `4bb9e7b702de1c9b981f0ed53a649632e2a7149bd7f2dabedfa120dcde13c376`
- Formal Cache: 331 files, 1,274,833,546 bytes
- Runtime State: 329 files, 1,224,923,102 bytes

The formal assets and retained stash remained unchanged through final validation.

## Final conclusion

### Final read-only review closure

The final review added the required month/season/theme composition samples instead of relying on the previously passing pure-constraint suites. `Germany Austria 14 days in summer`, fixed-order multi-country cases, explicit-theme fail-closed behavior and the one-day capacity conflict behave correctly.

`Berlin Munich 7 days in December` exposed a P1 in SearchIntent unknown-City diagnostics. The parser identified Berlin (`Q64`), Munich (`Q1726`), seven exact days and December (`months=[12]`), but substring-based alias removal also removed aliases embedded inside `December`. Unknown-City validation now examines the destination prefix before the duration token, removes only aliases for recognized Cities, and applies Latin token boundaries. The permanent regression now returns the exact two-City route while `Berlin Atlantis Munich 7 days` still fails closed.

Candidate generation was also simplified: destination-suggestion planning now passes its destination cap directly to the builder and performs one three-Candidate build. The previous 12-Candidate build and six retry seeds were removed. The existing three-Candidate selection and audit contract remains unchanged.

All requested automatic suites, Cache Baseline V2, performance, comprehensive prelaunch and the Knowledge browser matrix pass. Parser p95 is `0.587263 ms`, final invariant gate p95 is `0.205482 ms`, and cold planner-backed search p95 is `2855.753 ms`. Five-country generated details consume published City/POI entities and remain stable for more than five seconds; Console errors/warnings and external image writes remain zero. Protected assets and all 14 Batch 04 data files remain byte-for-byte unchanged.

No P0 or P1 remains. The Batch 04 submission gate is open.

`APPROVE`
