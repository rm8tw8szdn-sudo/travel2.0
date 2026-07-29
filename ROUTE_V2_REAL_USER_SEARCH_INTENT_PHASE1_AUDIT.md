# Route Generation V2 real-user search intent audit — Phase 1

## Scope

This audit treats the public search box as the only input surface and follows each request through:

`SearchIntent → normalized RouteIntent → Planner / accepted fallback → Candidate / invariant gate → result`

The corpus contains 37 fixed tourist-style inputs:

- 8 macro-region requests;
- 10 duration expressions;
- 3 mixed-language expressions;
- 4 destination spelling errors;
- 8 travel-theme requests;
- 4 vague recommendation requests.

No external provider, Accepted asset, Cache asset, or Knowledge asset is changed by the verifier.

## Before the fixes

The first black-box parser run failed 30 of 36 cases.

| Severity | Failure | Root cause | Layer |
| --- | --- | --- | --- |
| P0 | `夏天去欧洲10天` did not carry a bounded European country set | The parser only knew country-specific subregions; continent-level metadata was discarded by the planner catalog adapter | Entity alias/catalog + parser + RouteIntent |
| P0 | `Japan seven days`, `one week`, `a week`, `日本一周`, and `日本十来天` lost the requested duration | Duration parsing supported numeric day tokens but not common textual forms | Parser |
| P0 | `Jappan 7 days` could become an unrelated destination suggestion, while `Italyy` could be silently accepted as Italy by substring matching | Latin aliases were matched as substrings and unresolved destination confidence was not represented | Parser + safe fallback |
| P1 | `环岛`, `海岛`, `周末短途`, `蜜月`, `亲子`, `徒步`, and `城市漫游` were absent from normalized RouteIntent | The theme catalog was incomplete and trip-intent inference was not consistently connected to themes | Parser + intent model |
| P1 | A valid planner response taking slightly more than 3.2 seconds was aborted by the browser | The UI request deadline was shorter than a legitimate cold planner request | Search UI |
| P2 | Macro-region coverage is limited to countries already present in the 50-country Entity Layer | This phase intentionally does not expand Knowledge data | Entity Layer |

## General fixes

1. Macro regions are generated from existing country continent/region/subregion metadata. A region request carries a stable allowed-country set into the RouteIntent fingerprint.
2. The invariant gate treats a macro-region country set as an allow-list, so a result cannot pass merely by copying a region label.
3. Region destination suggestions are filtered before Planner execution.
4. Common Chinese and English duration forms normalize to an exact day count. Recognizable but unsupported duration wording fails closed.
5. Latin country aliases use word boundaries. A unique one-edit correction becomes `destination-confirmation-required`; it never silently selects a country.
6. Common travel themes and styles are preserved in normalized RouteIntent and therefore in Candidate/Result intent envelopes.
7. Browser search now has a bounded seven-second request deadline and a longer watchdog, preventing a valid cold Planner result from being discarded.

No country-specific search branch or test-case-specific Planner rule was added.

## After the fixes

- Parser matrix: 37 / 37 PASS.
- Production-path samples: 4 / 4 protected.
  - Europe + summer + 10 days: only countries inside the metadata-derived Europe allow-list; season remains evidence-pending.
  - Japan + `seven days`: the final result remains exactly seven days and Japan-only.
  - `Jappan 7 days`: zero routes; confirmation is requested and Japan is shown as a suggestion.
  - Iceland ring road: theme/style/duration/country survive the whole request; the system either returns a matching route or fails safely if the isolated local pool cannot construct one.
- External evidence/image requests in the permanent verifier: 0.
- Accepted repository writes in the permanent verifier: 0.

## Browser and release-gate verification

- `夏天去欧洲10天`: returned only countries in the metadata-derived Europe allow-list, retained 10 days, and kept the seasonal claim evidence-pending.
- `Japan seven days`: returned a Japan-only seven-day route; the browser no longer discards the valid cold Planner response at the former 3.2-second deadline.
- `Jappan 7 days`: returned no route, displayed a destination-confirmation state, and suggested only `日本`.
- `冰岛环岛7天`: retained Iceland, seven days, and the ring-road theme through the production search path.
- `海岛度假`: entered destination-suggestion mode and displayed island-oriented routes without inventing a requested country.
- Browser console errors and warnings: 0.
- Comprehensive prelaunch: PASS, including 23 mandatory verifier stages, browser probe, performance gate, and Cache Baseline V2.
- Formal assets remained unchanged:
  - Accepted SHA-256: `aea28bcc03eaf6ccce5fd7453f88ece4f0060789f135eaf837b568d9c43e7e3f`
  - Immutable Cache SHA-256: `61e243e0c0756d53513ab7205281f8c796eeb074317f484d08784cbc5fe9505c`
  - Knowledge files: 51, unchanged

## Remaining non-blocking limitations

1. Region breadth is intentionally bounded by the current Entity Layer. Missing countries should be added through a separate Knowledge/Entity batch, not parser rules.
2. Typo correction is deliberately conservative: only a unique one-edit country match is suggested. Broader fuzzy city correction should be a separate alias-quality phase.
3. Theme quality ultimately depends on route and evidence coverage. The intent is now preserved, but thin local coverage may correctly return no valid route rather than invent a match.
4. The older standalone Phase 3C-1 provider verifier still assumes the pre-master-switch flag setup and fails when run by itself. This is a verifier-environment maintenance item; the mandatory comprehensive prelaunch path passes.

## Phase 1 conclusion

The search understanding layer is ready for the next, separately scoped Knowledge/Entity alias expansion. That expansion should prioritize missing high-frequency country/city aliases and theme-grounded route coverage while keeping this regression corpus mandatory in comprehensive prelaunch.
