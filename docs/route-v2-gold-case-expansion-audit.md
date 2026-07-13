# Route V2 Gold Case Expansion Audit

Source document: `C:/Users/admin/Desktop/1.docx`

Current code registry: `src/lib/routes/route-gold-cases.mjs`

## Current State

- Active Gold Case registry now contains 45 cases.
- China routes are intentionally hard-blocked for now, so canonical Gold Case 40, Mount Kailash Pilgrimage, is deferred and not registered as an active coverage cell.
- The active registry is therefore: original 11 cells, including London City Break, plus 34 non-China canonical additions from the Word document.
- Accepted Repository has seeded `planner-designed` records for all 45 active cells.
- Coverage matrix currently reports `45/45 strict cells covered`.

## Deferred

- Gold Case 40: Mount Kailash Pilgrimage

Reason: user requested a temporary hard condition that China routes must not be added.

When this condition changes, remove the CN hard block from content quality, text enrichment validation, warmup filtering, and include case 40 in `createCanonicalGoldCaseAdditions`.

## Production Fill

Seed script:

```powershell
& 'C:\Users\admin\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' scripts/seed-gold-case-accepted-routes.mjs
```

Latest seed result:

- total active Gold Cases: 45
- accepted: 45
- rejected: 0
- CN records in Accepted Repository: 0
