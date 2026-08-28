import fs from "node:fs";
import path from "node:path";

import {
  INVENTORY_PATH,
  REPORT_PATH,
  buildImageAssetBaseline,
  renderImageAssetBaselineReport,
  stableBaselineJson,
} from "./lib/image-asset-baseline.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");
const strict = process.argv.includes("--strict");
const model = buildImageAssetBaseline({ root: ROOT });
const untrackedImageAssets = model.inventory.filter((asset) => !asset.isTracked).map((asset) => asset.path);

const blockers = {
  untrackedImageAssets: untrackedImageAssets.length,
  unknownAssets: model.orphanAssets.unknown.length,
  missingLocalAssets: model.references.blockingMissingLocalAssets.length,
  activeExternalImageReferences: model.references.externalImageReferences.filter((entry) => entry.kind === "production").length,
  unsafeProductionImages: model.references.unsafeProductionImages.length,
  invalidMappings: model.coverage.invalidMappings,
  backfillProblems: model.backfill.problems.length,
  invalidLfsPointers: model.git.invalidLfsPointers.length,
  invalidSizeExceptions: model.git.invalidSizeExceptions.length,
  unusedSizeExceptions: model.git.unusedSizeExceptions.length,
  hardLimitViolations: model.git.hardLimitViolations.length,
  unapprovedNormalGitLargeAssets: model.git.sizePolicyViolations.length,
};
const blocked = Object.values(blockers).some((value) => value !== 0);
const sealBlocked = untrackedImageAssets.length > 0;

if (!sealBlocked) {
  fs.mkdirSync(path.dirname(path.join(ROOT, INVENTORY_PATH)), { recursive: true });
  fs.writeFileSync(path.join(ROOT, INVENTORY_PATH), stableBaselineJson(model), "utf8");
  fs.writeFileSync(path.join(ROOT, REPORT_PATH), renderImageAssetBaselineReport(model), "utf8");
}

process.stdout.write(`${JSON.stringify({
  verifier: "build-route-v2-image-asset-baseline",
  status: blocked ? "BLOCKED" : "PASS",
  strict,
  images: model.summary.totalImages,
  categories: model.summary.categoryCounts,
  needsBackfill: model.backfill.total,
  exactDuplicateGroups: model.duplicates.exactGroups.length,
  perceptualDuplicateGroups: model.duplicates.perceptualGroups.length,
  sealBlocked,
  untrackedImageAssets,
  blockers,
  outputs: sealBlocked ? [] : [INVENTORY_PATH, REPORT_PATH],
}, null, 2)}\n`);

if (sealBlocked || (strict && blocked)) process.exitCode = 1;
