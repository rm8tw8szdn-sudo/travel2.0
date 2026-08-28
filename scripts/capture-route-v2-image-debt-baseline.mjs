import { spawnSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const INVENTORY_PATH = "data/route-v2/images/image-debt-inventory.json";
const OUTPUT_PATH = "data/route-v2/images/image-debt-phase-baseline.json";
const inventory = JSON.parse(await readFile(path.join(ROOT, INVENTORY_PATH), "utf8"));

function gitJson(relativePath) {
  const result = spawnSync("git", ["show", `${inventory.sourceMainHead}:${relativePath}`], {
    cwd: ROOT,
    encoding: "utf8",
    windowsHide: true,
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.status !== 0) throw new Error(`baseline-git-read-failed:${relativePath}:${result.stderr}`);
  return JSON.parse(result.stdout);
}

const imageBaseline = gitJson("data/route-v2/images/image-asset-baseline.json");
const manifest = gitJson("data/route-v2/images/image-coverage-manifest.json");
const batchBaseline = gitJson("data/knowledge/reports/knowledge-expansion-batch07-baseline.json");
const output = {
  schemaVersion: "route-v2-image-debt-phase-baseline-v1",
  capturedFromHead: inventory.sourceMainHead,
  capturedAt: inventory.frozenAt,
  images: {
    assets: imageBaseline.summary.totalImages,
    totalBytes: imageBaseline.summary.totalBytes,
    countryCovers: manifest.coverage.overall.countryCoverCoverage.ready,
    dedicatedCities: manifest.coverage.overall.cityDedicatedImageCoverage.ready,
    cityTotal: manifest.coverage.overall.cityDedicatedImageCoverage.total,
    dedicatedCorePois: manifest.coverage.overall.corePoiImageCoverage.ready,
    corePoiTotal: manifest.coverage.overall.corePoiImageCoverage.total,
    needsBackfill: manifest.coverage.overall.needsBackfillCount,
    invalidMappings: manifest.invalidMappings.length,
  },
  protectedAssets: batchBaseline.protectedAssets,
};
await writeFile(path.join(ROOT, OUTPUT_PATH), `${JSON.stringify(output, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ status: "PASS", output: OUTPUT_PATH, images: output.images }, null, 2));
