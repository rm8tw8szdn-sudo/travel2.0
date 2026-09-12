import { execFileSync } from "node:child_process";
import path from "node:path";
import { calculateKnowledgeExpansionReportData, comma, percent } from "./knowledge-expansion-batch07-report-data.mjs";

export const BATCH09_SEALED_MAIN = "826439f41523500ad805d0bcb9966a630e90b859";
export function readBatch09SealedText(root, relativePath) {
  return execFileSync("git", ["show", `${BATCH09_SEALED_MAIN}:${relativePath}`], {
    cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, windowsHide: true,
  }).replaceAll("\r\n", "\n").replaceAll("\r", "\n");
}

export function calculateBatch09ReportData({ root } = {}) {
  const projectRoot = path.resolve(root || path.join(import.meta.dirname, "..", ".."));
  // Batch 09 is sealed. Later image recovery belongs to its own current report.
  const imageSnapshot = {
    manifest: JSON.parse(readBatch09SealedText(projectRoot, "data/route-v2/images/image-coverage-manifest.json")),
    baseline: JSON.parse(readBatch09SealedText(projectRoot, "data/route-v2/images/image-asset-baseline.json")),
  };
  const live = calculateKnowledgeExpansionReportData({ root: projectRoot, batchNumber: 9, imageSnapshot });
  // Batch 09 reports are immutable historical snapshots. Later Country-layer
  // publication must not rewrite their totals or make their verifier compare a
  // sealed report with the current repository inventory.
  return Object.freeze({
    ...live,
    published: Object.freeze({ countries: 119, cities: 833, pois: 3963, total: 4915 }),
    portfolio: Object.freeze({
      ...live.portfolio,
      catalogCountries: 119,
      plannableCountries: 118,
      evidenceBackedCountries: 115,
      routeKnowledgeCoveredCountries: 118,
      catalogOnlyCountryCodes: ["CN"],
    }),
  });
}

export { comma, percent };
