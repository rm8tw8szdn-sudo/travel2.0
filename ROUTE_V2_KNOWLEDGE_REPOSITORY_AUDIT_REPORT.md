# Route Generation V2 Knowledge Repository Audit

Generated: 2026-07-14

## Summary

This audit confirms that travel2.0 currently has several knowledge-like data sources, but only a small subset is suitable as a direct factual source for V2 candidate and evidence decisions.

The trusted Knowledge Graph pool is compact: 348 entities across 14 countries. The accepted route repository contains far broader country coverage, but those entities are derived from final RouteRecord output and must not be promoted into factual Knowledge Graph data without a separate cleanup and provenance process.

## Sources Reviewed

| Source | Path | Role | Current Trust Level |
| --- | --- | --- | --- |
| Knowledge Graph Pool | `.route-v2-cache/knowledge-graph-pool.json` | Current KG destination pool used by candidate generation | Mixed, but mostly stable ID based |
| Accepted Routes | `.route-v2-cache/accepted-routes.json` | Final RouteRecord repository and Feed source | Display/output source only |
| Legacy Evidence Repository | `.route-v2-cache/route-evidence.json` | Old evidence-like route data | Not V2 decision evidence |
| Country Catalog | `data/countries.zh.json` | Country list and grouping | Useful catalog, missing QID/provenance |
| Search Fallbacks | `src/lib/routes/search-knowledge-graph-fallbacks.mjs` | Search fallback anchors | Fallback only, not fact-verified |

## Key Statistics

| Metric | Value |
| --- | ---: |
| Accepted routes | 5500 |
| FeedReadyPoolCount all / cross / single | 851 / 357 / 494 |
| Accepted route countries | 195 |
| KG entities | 348 |
| KG countries | 14 |
| KG QID identifiers | 320 |
| KG manual-anchor source classification | 32 |
| KG wikidata source classification | 315 |
| KG duplicate stable IDs | 0 |
| KG duplicate name/country pairs | 4 |
| Accepted-derived destination entities | 21913 |
| Accepted-derived coverage placeholders | 18356 |
| Accepted-derived duplicate stable IDs | 1443 |
| Accepted-derived missing coordinates | 460 |
| Accepted-derived missing provenance | 21636 |
| Legacy evidence records | 2865 |
| Legacy route-record-derived evidence records | 2550 |
| Legacy evidence missing candidateId | 2865 |
| Legacy evidence missing supportsWhichDecision | 2865 |

## Source Classification

P0 introduces an explicit source classification layer:

| Classification | Meaning | May fact-verify? |
| --- | --- | --- |
| `wikidata` | Stable QID-backed entity | Yes, if schema-valid |
| `manual-anchor` | Manually curated anchor | No by default |
| `coverage-placeholder` | Coverage scaffold or placeholder | No |
| `search-fallback` | Search fallback anchor | No |
| `route-record-derived` | Extracted from final route output | No |
| `unknown` | No reliable provenance | No |

The accepted route repository is intentionally classified as `route-record-derived`, even when individual IDs contain coverage/search/QID patterns. This prevents final display output from becoming an accidental fact source.

## Coverage Findings

The KG pool covers only these 14 country codes:

`AT`, `CZ`, `DE`, `FR`, `GB`, `GR`, `HU`, `ID`, `IS`, `IT`, `JP`, `SK`, `TR`, `US`.

Accepted routes cover 195 countries, which means most current route coverage is not supported by a proper KG entity layer. The accepted routes include many generated coverage placeholders, but these are output artifacts and cannot safely drive factual decisions.

## Data Quality Findings

P0 findings:

- The KG pool has stable IDs and coordinates for all 348 records, which makes it useful for candidate structure.
- The KG pool lacks explicit provenance fields on all 348 records, so source confidence is inferred from stable ID patterns.
- Accepted routes contain broad coverage but are not a clean entity source.
- Legacy evidence has useful categories, but all records lack V2 `candidateId` and `supportsWhichDecision`.
- Search fallbacks are isolated as fallback anchors and should not be treated as verified destination identity.
- Country catalog has 195 countries but no QID/provenance field.

## Candidate And Evidence Impact

Candidate Builder can continue using the KG destination pool, but now preserves entity source classification on candidate destinations. This makes downstream evidence rules explicit:

- QID-backed KG destinations can continue supporting fact-verified local identity checks.
- Coverage placeholders and search fallbacks can support structure only.
- RouteRecord-derived data is isolated and cannot become verified evidence.

Local Evidence Collector now distinguishes:

- `destination-identity`: fact-verified identity.
- `destination-identity-structure`: structure-only identity signal.

## Main Risks

1. Accepted routes can appear more complete than the KG because they include generated placeholders.
2. Legacy evidence has no V2 candidate linkage, so it cannot explain why a candidate exists.
3. Search fallback anchors can look like destinations but lack enough provenance for verified identity.
4. Most country coverage exists only in final route output, not in the KG entity layer.

## Conclusion

Phase 3C-3 should remain paused until this P0 isolation layer is in place and reviewed. The next cleanup should focus on promoting only verified, provenance-backed entities into a clean Knowledge Repository layer.
