# Route V2 Performance Baseline, Cold-Search Attribution, and Cache Forensics

Date: 2026-07-28
Branch: `codex/route-v2-knowledge-entity-layer-p1b-batch02`
Baseline HEAD: `739a2a8537c8ea63adb693653483d81217ed28dc`

## 1. Executive conclusion

- The current worktree does not show a stable same-host performance regression greater than 10% against HEAD.
- The absolute `parse SearchIntent p95 < 1ms` assertion was introduced in `739a2a8` from one local run. It was not backed by cross-machine results, and it is not a reliable absolute contract.
- A ten-round, batch-based harness shows the parser itself is stable. The permanent verifier now uses a 2ms absolute safety ceiling, requires round-p95 CV at or below 10%, and supports a separately supplied same-host baseline with a maximum 10% regression.
- The approximately 2.0–2.6 second server-side Search time is dominated by reading, validating, and ranking the 851 accepted routes. Candidate build, Candidate persistence, validation, DecisionTrace, EvidenceBundle, and cache writes together are only about 12ms in the current worktree.
- The previously observed 3.0–3.8 second browser result is not explained by the current Search/intent fixes. The API accounts for approximately 2.1–2.6 seconds. The page then awaits the six-cover image batch, with a 2,000ms maximum image preparation deadline, before inserting Search cards. Cold images can therefore add the observed remaining delay.
- The historical Cache claim `056d3af...` cannot be reproduced. The report persisted the value and said it compared per-file snapshots, but it did not persist the aggregate algorithm or the 331-entry input snapshot.
- Five Cache files were changed after the historical baseline commit and are mutable runtime state. Their earlier bytes are not recoverable from Git. Current contents must not be declared a new golden baseline without an explicit manual trust/recovery decision.

Authorized final status: **PERFORMANCE UNBLOCKED — CACHE REQUIRES MANUAL DECISION**.

## 2. Experiment states

| State | Construction | Formal data |
| --- | --- | --- |
| A — HEAD | `git archive 739a2a8` extracted under the OS temporary directory | Read-only copies of the same accepted routes, route evidence, and knowledge graph pool |
| B — worktree | Copy of the complete current worktree, excluding `.git`, formal Cache, and runtime outputs | Same read-only data copies as A |
| C — minimal fix | State A plus only the six source-file hunks required for Japan country search, Candidate physical identity, fixed-order parsing, and literary summaries | Same read-only data copies as A |

State C changed only:

- `src/lib/routes/content-quality.mjs`
- `src/lib/routes/route-candidate-builder.mjs`
- `src/lib/routes/route-composition-planner.mjs`
- `src/lib/routes/route-destination-suggestion.mjs`
- `src/lib/routes/route-search-service.mjs`
- `src/lib/routes/search-intent-parser.mjs`

All stores used by live and stage benchmarks were redirected to unique OS temporary directories. External Evidence and image providers were disabled. The real worktree was not switched, reset, stashed, or cleaned.

## 3. Host and run conditions

| Item | Value |
| --- | --- |
| Node | v24.18.0 |
| Git | 2.54.0.windows.1 |
| OS | Windows 11 Pro 10.0.26200 |
| CPU | Intel Core i7-13700, 24 logical processors |
| RAM | 33,997,180,928 bytes total; 3.6–6.8GB free during captures |
| Battery | None; desktop |
| Power mode | Balanced |
| Background programs left running | Unity, Weixin, Androws/ABoxHeadless, WPS, ChatGPT, Edge |
| External requests | 0 |

User programs and power settings were deliberately not changed. This is important: it preserves a realistic local environment but also explains why an absolute sub-millisecond result cannot be treated as a machine-independent contract.

## 4. Benchmark method

Pure operations:

- 20,000-operation initial warm-up.
- 10 recorded rounds.
- 20 batches per round.
- Parser batch size 100; normalization 200; fingerprint and invariant gate 100.
- Each round records p50, p95, p99, max, mean, standard deviation, CPU and memory.
- A first diagnostic run exposed JIT tiering after rounds 1–2. The final harness therefore performs the large warm-up before all recorded rounds.

Live operations:

- 10 fresh Node/server processes for cold start plus first Search.
- One additional persistent process for 10 distinct cold queries, 10 exact-cache replays, 10 equivalent-text queries, 10 Feed requests, and 10 Detail requests.
- Same server flags, seed conventions, data copies, temporary paths, and disabled network providers for A/B/C.

Stage attribution:

- 10 fresh in-process Search services per state.
- Each run receives the same 851-route accepted repository.
- Timed boundaries include accepted repository reads, Candidate build/persistence, Candidate Validation, DecisionTrace, EvidenceBundle, cache lookup/write, total Planner, and total Search.
- Internal selection, route composition, route copy, legacy validation, and dedupe are reported as a measured residual. Ranking and final response assembly are a separate measured residual.

## 5. Pure operation raw results

Each raw list contains the ten round-p95 values in milliseconds. Aggregate columns are calculated from all recorded batch samples.

### SearchIntent parse

| State | Ten raw round p95 values | p50 | p95 | p99 | max | mean | stddev | round-p95 CV |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| A | 1.223618, 1.343198, 1.208177, 1.161722, 1.190433, 1.300047, 1.137441, 1.163703, 1.109389, 1.153104 | 1.069872 | 1.256006 | 1.343198 | 1.389061 | 1.073787 | 0.102990 | 6.11% |
| B | 1.097141, 1.094130, 1.017807, 0.990479, 1.003279, 0.970090, 1.025912, 0.982553, 0.992793, 0.978729 | 0.947947 | 1.064837 | 1.128424 | 1.150457 | 0.961946 | 0.047930 | 4.50% |
| C | 1.134356, 1.073117, 1.147234, 1.099636, 1.179680, 1.188581, 1.150301, 1.142955, 1.149602, 1.219472 | 1.031759 | 1.179680 | 1.219472 | 1.243608 | 1.030328 | 0.086559 | 3.66% |

B is 15.22% faster than A by aggregate p95. C is 6.08% faster than A. There is no parser regression.

### RouteIntent normalization

| State | Ten raw round p95 values | p50 | p95 | p99 | max | mean | stddev |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| A | 0.029941, 0.024597, 0.030091, 0.031517, 0.032024, 0.029090, 0.030072, 0.029476, 0.027222, 0.030356 | 0.020262 | 0.030513 | 0.033567 | 0.034159 | 0.020867 | 0.005431 |
| B | 0.036628, 0.028723, 0.025970, 0.020080, 0.022162, 0.016137, 0.017245, 0.019100, 0.020283, 0.020203 | 0.015943 | 0.028907 | 0.036078 | 0.036728 | 0.017655 | 0.004552 |
| C | 0.023318, 0.030716, 0.030517, 0.030442, 0.030746, 0.027451, 0.029233, 0.027436, 0.033521, 0.024796 | 0.020125 | 0.030657 | 0.033521 | 0.033999 | 0.021012 | 0.005147 |

### Fingerprint

| State | Ten raw round p95 values | p50 | p95 | p99 | max | mean | stddev |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| A | 0.048168, 0.049964, 0.053998, 0.048661, 0.046389, 0.051991, 0.044559, 0.049731, 0.049521, 0.047748 | 0.034765 | 0.050531 | 0.053998 | 0.059665 | 0.036405 | 0.008874 |
| B | 0.033979, 0.043309, 0.035540, 0.036495, 0.032821, 0.051261, 0.045664, 0.035541, 0.046214, 0.038769 | 0.030347 | 0.045523 | 0.050864 | 0.054263 | 0.031981 | 0.005455 |
| C | 0.051192, 0.051530, 0.050540, 0.052221, 0.053545, 0.051546, 0.054560, 0.049172, 0.049275, 0.047841 | 0.039154 | 0.052551 | 0.055363 | 0.058783 | 0.039009 | 0.008462 |

### Final invariant gate

| State | Ten raw round p95 values | p50 | p95 | p99 | max | mean | stddev |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| A | 0.199118, 0.200250, 0.188494, 0.195124, 0.182628, 0.179735, 0.188063, 0.199023, 0.163106, 0.197991 | 0.156238 | 0.197381 | 0.200250 | 0.227770 | 0.155930 | 0.026161 |
| B | 0.128073, 0.131549, 0.132724, 0.136789, 0.124741, 0.130435, 0.135366, 0.133340, 0.132182, 0.129269 | 0.116766 | 0.133618 | 0.144018 | 0.151068 | 0.117587 | 0.008934 |
| C | 0.164188, 0.175572, 0.192291, 0.180666, 0.192884, 0.213109, 0.199491, 0.170432, 0.170216, 0.206765 | 0.152277 | 0.197384 | 0.222046 | 0.243901 | 0.153327 | 0.026437 |

### File cache replay

| State | Ten raw round p95 values | p50 | p95 | p99 | max | mean | stddev |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| A | 2.5697, 2.4360, 2.6202, 2.8834, 2.8041, 2.7684, 2.6065, 2.5987, 2.5682, 2.5508 | 2.2444 | 2.7684 | 3.0303 | 3.5580 | 2.184147 | 0.372000 |
| B | 1.6252, 1.9911, 1.9516, 1.9333, 2.0336, 1.7087, 1.8202, 2.1120, 2.0436, 2.2291 | 1.5478 | 2.0436 | 2.3260 | 2.5835 | 1.607320 | 0.229468 |
| C | 2.6868, 2.7650, 2.6260, 2.6958, 2.5817, 2.6965, 2.4756, 2.6151, 2.4792, 3.0177 | 2.1879 | 2.6868 | 3.0177 | 3.1490 | 2.149720 | 0.383991 |

### Ready Pool read

| State | Ten raw round p95 values | p50 | p95 | p99 | max | mean | stddev |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| A | 0.9665, 1.0112, 1.0298, 0.9927, 0.9686, 1.0245, 1.0325, 1.1019, 1.0486, 1.0115 | 0.8364 | 1.0486 | 1.1389 | 1.2087 | 0.842060 | 0.122663 |
| B | 0.7960, 0.7948, 0.7818, 0.9127, 0.7770, 0.8990, 0.8697, 0.8162, 0.8113, 0.9911 | 0.6730 | 0.8756 | 1.0595 | 1.1294 | 0.691754 | 0.105021 |
| C | 1.0329, 1.1102, 1.0754, 1.1332, 1.1770, 1.1701, 1.0685, 1.0943, 0.9495, 0.9397 | 0.8937 | 1.1204 | 1.2015 | 1.3166 | 0.900995 | 0.122444 |

## 6. Live raw results

All values are client-observed localhost milliseconds. Server-reported Search duration differs by only approximately 4–25ms, so the HTTP layer is not the bottleneck.

### A — HEAD

| Scenario | Ten raw values | p50 | p95/p99/max | mean | stddev |
| --- | --- | ---: | ---: | ---: | ---: |
| Server readiness | 1462.428, 1404.245, 1354.671, 1289.605, 1237.843, 1295.673, 1294.824, 1295.456, 1290.335, 1291.868 | 1294.824 | 1462.428 | 1321.695 | 66.441 |
| Fresh-process first Search | 2221.456, 2098.828, 1960.239, 1899.049, 1875.304, 1901.661, 1953.921, 1954.665, 1971.872, 2102.652 | 1954.665 | 2221.456 | 1993.965 | 111.028 |
| Persistent distinct cold Search | 2194.823, 2413.989, 2275.831, 2197.052, 2286.802, 2227.403, 2271.593, 2279.115, 2233.139, 2204.025 | 2233.139 | 2413.989 | 2258.377 | 65.220 |
| Exact-query cache replay | 1877.971, 1863.975, 1929.479, 1974.526, 1850.283, 1913.608, 1914.428, 1846.318, 1931.848, 1897.849 | 1897.849 | 1974.526 | 1900.029 | 40.787 |
| Equivalent text | 2166.868, 1803.316, 2000.250, 1825.465, 1405.834, 1851.666, 1731.372, 1743.793, 1611.934, 1597.720 | 1743.794 | 2166.868 | 1773.822 | 213.617 |
| Feed first page | 37.111, 13.009, 13.040, 12.776, 13.992, 10.606, 13.916, 15.809, 13.730, 13.465 | 13.465 | 37.111 | 15.745 | 7.617 |
| Detail | 6.161, 3.600, 3.983, 4.735, 6.346, 3.637, 6.046, 6.928, 5.563, 3.942 | 4.735 | 6.928 | 5.094 | 1.258 |

### B — complete worktree

| Scenario | Ten raw values | p50 | p95/p99/max | mean | stddev |
| --- | --- | ---: | ---: | ---: | ---: |
| Server readiness | 1376.905, 1401.085, 1398.818, 1349.418, 1293.595, 1296.202, 1294.020, 1303.245, 1348.296, 1299.850 | 1303.245 | 1401.085 | 1336.143 | 44.360 |
| Fresh-process first Search | 2247.666, 2233.133, 2210.833, 2119.788, 2050.473, 2104.799, 2124.449, 2036.931, 2199.045, 2050.546 | 2119.788 | 2247.666 | 2137.766 | 79.756 |
| Persistent distinct cold Search | 2164.977, 2580.633, 2470.634, 2331.849, 2387.354, 2300.528, 2422.993, 2265.410, 2330.151, 2325.297 | 2330.152 | 2580.633 | 2357.983 | 114.988 |
| Exact-query cache replay | 2017.204, 1942.912, 1960.863, 1961.957, 1981.520, 2017.279, 2025.132, 1879.751, 2352.361, 2123.166 | 1981.521 | 2352.362 | 2026.215 | 131.116 |
| Equivalent text | 2668.520, 2034.157, 1842.729, 1845.809, 1538.800, 1919.453, 1941.570, 1875.846, 1819.544, 1939.216 | 1875.846 | 2668.520 | 1942.565 | 286.335 |
| Feed first page | 39.269, 13.507, 13.075, 12.380, 12.108, 12.214, 14.429, 11.411, 13.458, 10.597 | 12.380 | 39.270 | 15.245 | 8.513 |
| Detail | 5.939, 3.254, 4.487, 5.323, 2.620, 3.450, 7.242, 4.914, 7.071, 4.998 | 4.914 | 7.242 | 4.930 | 1.551 |

### C — minimal fix

| Scenario | Ten raw values | p50 | p95/p99/max | mean | stddev |
| --- | --- | ---: | ---: | ---: | ---: |
| Server readiness | 1430.241, 1402.395, 1403.860, 1298.481, 1294.672, 1292.826, 1290.633, 1345.142, 1290.370, 1295.757 | 1295.757 | 1430.241 | 1334.438 | 56.464 |
| Fresh-process first Search | 2222.693, 2147.626, 2069.759, 2011.018, 1938.209, 1959.485, 2040.922, 2022.740, 2009.750, 2103.095 | 2022.740 | 2222.693 | 2052.530 | 86.381 |
| Persistent distinct cold Search | 1947.276, 2053.684, 2116.900, 2258.453, 2184.370, 2209.725, 2224.680, 2357.134, 2239.726, 2312.116 | 2209.725 | 2357.134 | 2190.406 | 122.232 |
| Exact-query cache replay | 1966.831, 1806.046, 1843.787, 1916.162, 2129.812, 1921.011, 1921.118, 1915.604, 1928.063, 1879.825 | 1916.162 | 2129.812 | 1922.826 | 86.051 |
| Equivalent text | 2316.974, 1836.548, 1952.980, 2216.888, 1515.686, 1894.382, 1863.765, 1767.467, 1843.127, 1919.578 | 1863.765 | 2316.974 | 1912.739 | 223.537 |
| Feed first page | 39.142, 10.888, 11.461, 13.588, 9.564, 11.035, 13.459, 12.716, 10.577, 12.736 | 11.461 | 39.142 | 14.517 | 8.753 |
| Detail | 3.964, 5.304, 6.294, 5.172, 3.245, 4.160, 6.462, 6.498, 4.675, 3.352 | 4.675 | 6.498 | 4.913 | 1.237 |

### Stable comparisons

| Comparison | Fresh Search p95 | Fresh mean | Persistent cold p95 | Persistent cold mean |
| --- | ---: | ---: | ---: | ---: |
| B vs A | +1.18% | +7.21% | +6.90% | +4.41% |
| C vs A | +0.06% | +2.94% | -2.35% | -3.01% |
| B vs C | +1.12% | +4.15% | +9.48% | +7.65% |

The B exact-cache p95 delta is inflated by one 2352ms outlier; mean delta is 6.64%. Equivalent-text rounds deliberately contain different languages and parse paths and have CV above 10% in all states, so their p95 must not be treated as a stable regression. Their B/A mean delta is 9.51%.

## 7. Cold Search stage attribution

The following table uses ten fresh Search instances per state. Raw values are the ten elapsed milliseconds for the named stage.

| State/stage | Ten raw values | mean | p95 |
| --- | --- | ---: | ---: |
| A total Search | 1924.971, 2148.401, 2351.687, 2507.322, 2266.212, 2317.658, 2272.694, 2113.675, 1977.726, 2014.008 | 2189.435 | 2507.322 |
| B total Search | 2080.136, 2541.492, 2365.130, 2304.620, 2197.381, 2374.295, 2215.922, 2011.304, 1992.325, 2154.828 | 2223.743 | 2541.492 |
| C total Search | 2063.763, 2525.101, 2415.097, 2294.496, 2180.305, 2106.206, 2002.607, 2121.694, 2414.463, 2684.773 | 2280.851 | 2684.773 |
| A accepted-repository reads | 597.373, 580.350, 642.470, 733.152, 608.817, 621.111, 637.043, 608.124, 548.092, 593.755 | 617.029 | 733.152 |
| B accepted-repository reads | 642.248, 754.993, 661.148, 695.372, 631.917, 689.030, 672.130, 555.722, 597.824, 629.959 | 653.034 | 754.993 |
| C accepted-repository reads | 675.513, 726.128, 707.408, 711.606, 638.022, 665.034, 595.287, 625.359, 711.064, 783.025 | 683.845 | 783.025 |
| A Planner total | 390.230, 275.093, 338.339, 340.667, 294.236, 301.430, 373.424, 274.431, 289.853, 271.028 | 314.873 | 390.230 |
| B Planner total | 384.550, 349.717, 348.130, 322.782, 309.785, 303.127, 299.954, 254.904, 280.467, 300.862 | 315.428 | 384.550 |
| C Planner total | 395.416, 351.544, 332.161, 321.898, 297.148, 281.255, 314.199, 318.399, 349.754, 379.188 | 334.096 | 395.416 |
| B Candidate build | 3.370, 0.971, 0.740, 0.505, 0.458, 0.537, 0.617, 0.325, 0.520, 0.865 | 0.891 | 3.370 |
| B Candidate persistence | 10.617, 6.256, 7.022, 5.928, 5.643, 6.739, 6.750, 4.586, 6.482, 5.932 | 6.595 | 10.617 |
| B Candidate Validation | 2.897, 0.581, 0.260, 0.525, 0.218, 0.489, 0.361, 0.208, 0.251, 0.335 | 0.613 | 2.897 |
| B DecisionTrace persistence | 6.043, 3.389, 3.728, 2.687, 3.053, 2.588, 2.814, 3.421, 2.434, 2.487 | 3.264 | 6.043 |
| B EvidenceBundle persistence | 2.327, 1.399, 0.796, 1.368, 0.676, 1.096, 0.730, 0.777, 0.707, 0.871 | 1.075 | 2.327 |
| B cache lookup | 0.041, 0.025, 0.013, 0.015, 0.015, 0.017, 0.019, 0.013, 0.017, 0.014 | 0.019 | 0.041 |
| B cache write | 0.613, 0.404, 0.211, 0.235, 0.182, 0.240, 0.187, 0.181, 0.264, 0.182 | 0.270 | 0.613 |
| B selection/composition/validation residual | 358.913, 337.074, 335.531, 311.679, 299.702, 291.630, 288.655, 245.558, 270.038, 290.335 | 302.912 | 358.913 |
| B ranking/final-response residual | 1052.684, 1436.352, 1355.629, 1286.216, 1255.481, 1381.881, 1243.633, 1200.484, 1113.752, 1223.811 | 1254.992 | 1436.352 |

Additional reference timings:

- A SearchIntent parse mean 6.909ms; B 9.782ms; C 6.205ms for one unbatched cold call. The batched parser benchmark above is the reliable parser gate.
- Country-scoped destination suggestion does not exist in A for this input. B mean is 28.465ms and C mean is 28.455ms.
- B Candidate/Trace/Evidence writes add about 10.9ms mean relative to in-memory route operations. They are not the 1–2 second bottleneck.

Code-path finding:

1. `route-search-service.mjs` loads the full accepted snapshot.
2. `rankAcceptedRoutes()` invokes the hard-constraint finalizer for every route before scoring.
3. The current accepted repository has 851 routes, so accepted reads plus per-record constraint validation/ranking account for approximately 1.9 seconds.
4. Planner composition is approximately 0.3 seconds.
5. `summaryFor()` and the new literary summary logic operate only on the selected destinations/themes. They do not scan all 851 routes.
6. Exact cache replay is still about 1.9–2.0 seconds because accepted-route ranking occurs before the Search cache lookup. The Search cache is not the main CPU or I/O cost.

This is an existing architectural cost in A as well as B/C. Optimizing accepted-route indexing or moving the exact cache lookup ahead of full ranking would be a separate performance task and is outside this calibration-only scope.

## 8. The 1ms threshold

Git pickaxe shows the assertion was first introduced by:

`739a2a8 fix(route-v2): enforce permanent route intent invariants`

The same commit added the only historical report. It recorded:

- Starting-HEAD parser p95: 0.601ms.
- Final parser p95: 0.637ms.
- 40 batches of 1,000 calls.
- Only 200 individual warm-up calls.
- One local verifier execution on this Windows/Node host.

There is no prior commit, CI record, cross-machine report, or product SLO that defines 1ms as an absolute cross-environment requirement.

The original harness was vulnerable to JIT tiering. A preliminary ten-round run shifted from approximately 1.0ms to 1.4ms after the first two rounds. After a 20,000-operation warm-up, parser round-p95 CV fell to 3.66–6.11%.

The revised gate is not a simple threshold widening:

- Local safety gate: aggregate p95 below 2ms.
- Stability gate: round-p95 CV at or below 10%.
- Controlled CI/same-host gate: when `ROUTE_V2_PARSE_BASELINE_P95_MS` is supplied, p95 may not regress more than 10%.
- Fixed work: ten rounds, 20 batches × 100 calls per round after warm-up.

The 2ms safety ceiling is based on the observed worst A/B/C p99 of 1.343198ms, leaving approximately 49% headroom for host noise while still detecting a material parser failure. A subsequent real verifier run passed with p50 0.856220ms, p95 0.906358ms, p99 0.940461ms, max 1.260025ms, round-p95 CV 2.09%.

## 9. Historical Cache manifest forensics

The claimed hash first appears in `739a2a8` in:

- `ROUTE_V2_PERMANENT_INTENT_INVARIANTS_VALIDATION.md`
- `docs/superpowers/plans/2026-07-27-route-v2-permanent-intent-invariants.md`

The comprehensive verifier at that commit:

- recursively enumerates every file,
- sorts absolute paths with `localeCompare(..., "en")`,
- stores root-relative forward-slash paths,
- stores exact byte length,
- stores SHA-256 of exact file bytes,
- includes JSONL and all other files,
- excludes nothing,
- ignores mtime,
- does not normalize JSON,
- compares the before and after arrays with deep equality.

It does **not** calculate the displayed aggregate `056d3af...`. The report does not document that aggregate algorithm, and neither the 331-entry snapshot nor its hash-input list was committed.

Candidate algorithms tried against the current 331 files:

| Candidate aggregate | Current result |
| --- | --- |
| `SHA256(JSON.stringify(snapshot))` | `ca336a00e7e3c598947ee333932b447158f93dd3c0c4737290e5360f0b6d71c0` |
| Pretty JSON | `4b09...` |
| Pretty JSON plus newline | `1b5c...` |
| Newline-delimited path/bytes/hash | `7c3e...` |
| Tab-delimited | `105e...` |
| NUL-delimited | `91e...` |
| Concatenated per-file hashes | `51b0...` |
| `path:hash` lines | `5bfc...` |

None reproduce `056d3af...`. More importantly, five file contents changed after the baseline commit, so trying additional aggregate encodings cannot reconstruct the historical input.

## 10. Five post-baseline runtime files

Commit `739a2a8` was created at `2026-07-27T04:02:32Z`. These five files were written later:

| File | Current bytes / SHA-256 | Last write UTC | Producer / consumer | Classification |
| --- | --- | --- | --- | --- |
| `provider-sync-state.json` | 1,029 / `8f01b8cd...` | 07:16:27 | warmup, bulk generation, refill worker | Mutable provider checkpoint; should be runtime state |
| `knowledge-graph-pool.json` | 92,911 / `e85ff803...` | 07:16:06 | materialize/seed/warmup writes; Discovery/Planner reads | Mutable derived knowledge; version separately from canonical Knowledge |
| `search-analytics.jsonl` | 517,797 / `e69cde45...` | 06:03:25 | Search analytics appends; reporting reads | Append-only user/runtime analytics; exclude from immutable assets |
| `search-cache.json` | 448,550 / `b7aa2667...` | 06:03:17 | Search cache read/write/cleanup | Mutable derived cache; runtime state |
| `search-review-candidates.json` | 510,329 / `591ad871...` | 06:03:17 | Search cache appends review candidates | Mutable review queue; runtime state |

No historical version of these five files is tracked by Git. Nearby workspaces contain no byte-for-byte backup. An older environment report contains hashes for three files but not their bytes. The historical 331-file aggregate therefore cannot be reconstructed.

## 11. Reproducible future asset scheme

The new audit script uses:

- ordinal root-relative path ordering,
- exact bytes and per-file SHA-256,
- aggregate SHA-256 over compact UTF-8 JSON `{schemaVersion, category, files:[{path,bytes,sha256}]}`,
- no mtime,
- no JSON normalization,
- explicit inclusion of JSONL,
- explicit, versioned classification rules.

Current audit output is evidence only and is **not** a new golden baseline:

| Category | Files | Bytes | Current audit hash |
| --- | ---: | ---: | --- |
| accepted-current | 1 | 45,562,416 | `25489f09...` |
| derived Feed bootstrap | 3 | 375,668 | `3aa68ddb...` |
| derived route evidence | 1 | 4,348,028 | `1622fd6b...` |
| historical backups | 36 | 1,166,679,866 | `ca741870...` |
| media cache | 275 | 56,229,260 | `d37c6b3c...` |
| mutable derived knowledge | 1 | 92,911 | `4d17d476...` |
| mutable runtime state | 5 | 1,581,248 | `46e39c38...` |
| runtime logs | 9 | 4,666 | `bddce623...` |

Recommended baseline split:

1. Accepted: direct file SHA-256, tracked separately.
2. Canonical Knowledge: deterministic manifest over `data/knowledge`.
3. Immutable/derived route artifacts: separately regenerated and approved.
4. Mutable runtime state: monitored for schema/health, never compared to an immutable golden hash.
5. Media cache: disposable cache inventory, not a release asset.
6. Backups and logs: retention policy, not an application integrity manifest.

A human must decide whether the current five runtime files are trusted operational state or should be recovered from an external backup. Until then, no current Cache hash should be promoted to gold.

## 12. Formal asset isolation

Before and after this investigation:

| Asset | Files | Bytes | Deterministic current fingerprint | Result |
| --- | ---: | ---: | --- | --- |
| Accepted current file | 1 | 45,562,416 | `aea28bcc03eaf6ccce5fd7453f88ece4f0060789f135eaf837b568d9c43e7e3f` | unchanged |
| `.route-v2-cache` | 331 | 1,274,874,063 | `ca336a00e7e3c598947ee333932b447158f93dd3c0c4737290e5360f0b6d71c0` | unchanged |
| `data/knowledge` | 51 | 41,412,835 | `ebd7fefb13f4d48b932e76b56083b3ddd37ef4a26438400d19258dd20ecac5dc` | unchanged |

All benchmark writes used:

`%LOCALAPPDATA%\Temp\route-v2-perf-cache-forensics-20260728-1445`

No Accepted, Cache, Knowledge, Candidate, Trace, Evidence, image, or user data was written in the formal project directories.

## 13. Files changed by this investigation

- `scripts/verify-route-v2-intent-performance.mjs`
- `scripts/benchmark-route-v2-performance-forensics.mjs`
- `scripts/benchmark-route-v2-live-state.mjs`
- `scripts/build-route-v2-performance-minimal-state.mjs`
- `scripts/benchmark-route-v2-search-stage-attribution.mjs`
- `scripts/audit-route-v2-asset-manifest-forensics.mjs`
- `docs/superpowers/plans/2026-07-28-route-v2-performance-cache-forensics.md`
- `ROUTE_V2_PERFORMANCE_CACHE_FORENSICS_2026-07-28.md`

No files were staged or committed. No push, PR, tag, deployment, branch switch, reset, restore, checkout, clean, stash, amend, rebase, or squash was performed.
