import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  createPlannerCoverageMatrixReport,
  goldCaseCells,
} from "./report-planner-coverage-matrix.mjs";

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "route-coverage-matrix-"));
const storagePath = path.join(tempDir, "accepted-routes.json");

fs.writeFileSync(storagePath, JSON.stringify({
  schemaVersion: 2,
  records: [
    {
      id: "accepted-jp-classic",
      countryEntities: [{ countryCode: "JP", name: "日本" }],
      destinationEntities: [
        { wikidataId: "Q1490", countryCode: "JP", name: "东京" },
        { wikidataId: "Q34600", countryCode: "JP", name: "京都" },
        { wikidataId: "Q35765", countryCode: "JP", name: "大阪" },
      ],
      concept: { travelStyle: "classic-first-trip", durationBand: "7-10d" },
      durationDays: 8,
      recommendedDays: "8天",
    },
  ],
}, null, 2));

const cells = goldCaseCells();
assert.equal(cells.length, 45, "gold-case coverage should track one cell per active product case");
assert(cells.some((cell) => cell.country === "AT/SK/HU/CZ" && cell.travelStyle === "country-hopper"));
assert(cells.some((cell) => cell.country === "JP" && cell.travelStyle === "deep-dive"));

const report = createPlannerCoverageMatrixReport({ storagePath });
assert.equal(report.totalRecords, 1);
assert.equal(report.totals.cells, 45);
assert.equal(report.totals.strictCovered, 1);
assert.equal(report.totals.strictMissing, 44);

const jpClassic = report.cells.find((cell) => cell.id === "gold-1-jp-first-trip");
assert.equal(jpClassic.strictCount, 1);
assert.equal(jpClassic.sampleIds[0], "accepted-jp-classic");

const jpDeepDive = report.cells.find((cell) => cell.id === "gold-3-jp-alps-deep-dive");
assert.equal(jpDeepDive.strictCount, 0);
assert(report.suggestedPlannerContexts.some((context) =>
  context.country === "JP" && context.travelStyle === "deep-dive" && context.durationDays === 10
));

console.log("Planner coverage matrix report verified.");
