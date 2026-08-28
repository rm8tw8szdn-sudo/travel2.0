import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  BASELINE_SCHEMA_VERSION,
  IMAGE_SIZE_AUDIT_THRESHOLD_BYTES,
  INVENTORY_PATH,
  NORMAL_GIT_DEFAULT_FAIL_THRESHOLD_BYTES,
  NORMAL_GIT_HARD_LIMIT_BYTES,
  NORMAL_GIT_SIZE_EXCEPTIONS,
  REPORT_PATH,
  buildImageAssetBaseline, compareImageAssetBaselineInventories,
  evaluateNormalGitImageSizePolicy,
  renderImageAssetBaselineReport,
  stableBaselineJson,
} from "./lib/image-asset-baseline.mjs";
import { normalizeKnowledgeBaselineText } from "./lib/knowledge-baseline-text.mjs";
const FIXTURE_HASH = "1".repeat(64);
const OTHER_FIXTURE_HASH = "2".repeat(64);

function changedImage({ path: assetPath, bytes, sha256 = FIXTURE_HASH, category = "country-cover" }) {
  return { path: assetPath, bytes, sha256, category, isGitLfs: false, changeStatus: "added" };
}

function verifyNormalGitSizePolicyMutations() {
  const exactException = Object.freeze({
    id: "fixture-reviewed-600kb",
    path: "assets/fixtures/reviewed-600kb.png",
    expectedSha256: FIXTURE_HASH,
    expectedBytes: 600_000,
    maximumApprovedBytes: 600_000,
    reason: "Controlled verifier fixture for one exact reviewed image.",
    assetCategory: "country-cover",
    approvalStatus: "baseline-approved",
    baselineStatus: "reviewed-exception",
  });
  const exceptions = [exactException];
  const audit400 = evaluateNormalGitImageSizePolicy(changedImage({ path: "assets/fixtures/audit-400kb.png", bytes: 400_000 }), { exceptions });
  const rejected600 = evaluateNormalGitImageSizePolicy(changedImage({ path: "assets/fixtures/reject-600kb.png", bytes: 600_000 }), { exceptions });
  const rejected900 = evaluateNormalGitImageSizePolicy(changedImage({ path: "assets/fixtures/reject-900kb.png", bytes: 900_000 }), { exceptions });
  const approved600 = evaluateNormalGitImageSizePolicy(changedImage({ path: exactException.path, bytes: exactException.expectedBytes }), { exceptions });
  const wrongHash = evaluateNormalGitImageSizePolicy(changedImage({ path: exactException.path, bytes: exactException.expectedBytes, sha256: OTHER_FIXTURE_HASH }), { exceptions });
  const copiedBaseline = evaluateNormalGitImageSizePolicy(changedImage({
    path: "assets/copied-home-map-p2.png",
    bytes: 2_052_937,
    sha256: "b63667f43faf98619407229dc14e1a384eb114a02ca8aaa8363272ad4a8e474e",
    category: "ui-decorative",
  }), { exceptions: NORMAL_GIT_SIZE_EXCEPTIONS });
  const hardRejected = evaluateNormalGitImageSizePolicy(changedImage({ path: "assets/fixtures/reject-over-5mb.png", bytes: 5_000_001 }), { exceptions });

  assert.equal(audit400.allowed, true);
  assert.equal(audit400.auditRequired, true);
  assert.equal(audit400.decision, "audit-pass");
  assert.equal(rejected600.allowed, false);
  assert.equal(rejected600.decision, "reject-unapproved-over-500kb");
  assert.equal(rejected900.allowed, false);
  assert.equal(rejected900.decision, "reject-unapproved-over-500kb");
  assert.equal(approved600.allowed, true);
  assert.equal(approved600.decision, "exact-size-exception");
  assert.equal(wrongHash.allowed, false);
  assert.equal(wrongHash.exceptionMatch, false);
  assert.equal(copiedBaseline.allowed, false);
  assert.equal(copiedBaseline.exceptionMatch, false);
  assert.equal(hardRejected.allowed, false);
  assert.equal(hardRejected.decision, "hard-reject-over-5mb");
  return {
    audit400Kb: audit400.decision,
    reject600Kb: rejected600.decision,
    reject900Kb: rejected900.decision,
    exactException600Kb: approved600.decision,
    wrongHashKilled: !wrongHash.allowed,
    copiedBaselineKilled: !copiedBaseline.allowed,
    over5MbKilled: !hardRejected.allowed,
  };
}

function artifactTextMatches(generated, checkedIn) {
  return normalizeKnowledgeBaselineText(generated) === normalizeKnowledgeBaselineText(checkedIn);
}

function verifyCanonicalTextComparisonFixtures() {
  const lf = "artifact=value\nstatus=current\n";
  const crlf = "artifact=value\r\nstatus=current\r\n";
  const changedText = "artifact=changed\nstatus=current\n";
  const addedLine = "artifact=value\nstatus=current\nextra=true\n";
  const changedValue = "artifact=value\nstatus=stale\n";

  assert.equal(artifactTextMatches(lf, lf), true, "LF generated text must match LF checked-in text");
  assert.equal(artifactTextMatches(lf, crlf), true, "LF generated text must match CRLF checked-in text");
  assert.equal(artifactTextMatches(crlf, lf), true, "CRLF generated text must match LF checked-in text");
  assert.equal(artifactTextMatches(lf, changedText), false, "real text changes must remain stale");
  assert.equal(artifactTextMatches(lf, addedLine), false, "added or removed content lines must remain stale");
  assert.equal(artifactTextMatches(lf, changedValue), false, "value changes must remain stale");

  return {
    lfToLf: "PASS",
    lfToCrlf: "PASS",
    crlfToLf: "PASS",
    changedTextKilled: true,
    addedLineKilled: true,
    changedValueKilled: true,
  };
}

function hasInventoryMismatch(result) {
  return result.trackedStateMismatches.length > 0
    || result.hashMismatches.length > 0
    || result.byteMismatches.length > 0
    || result.missingAssets.length > 0
    || result.unexpectedAssets.length > 0;
}

function verifyTrackedStateSealingMutations() {
  const tracked = Object.freeze({
    path: "fixture/tracked.webp",
    isTracked: true,
    sha256: FIXTURE_HASH,
    bytes: 123_456,
  });
  const compare = (current, sealed) => compareImageAssetBaselineInventories(current, sealed);
  const trackedMatch = compare([tracked], [{ ...tracked }]);
  const staleTrackedState = compare([tracked], [{ ...tracked, isTracked: false }]);
  const currentUntracked = compare([{ ...tracked, isTracked: false }], [tracked]);
  const missingFormalAsset = compare([], [tracked]);
  const changedHash = compare([{ ...tracked, sha256: OTHER_FIXTURE_HASH }], [tracked]);
  const changedBytes = compare([{ ...tracked, bytes: tracked.bytes + 1 }], [tracked]);
  const changedPath = compare([{ ...tracked, path: "fixture/moved.webp" }], [tracked]);

  assert.equal(hasInventoryMismatch(trackedMatch), false, "tracked live asset and tracked sealed asset must match");
  assert.equal(staleTrackedState.trackedStateMismatches.length, 1, "tracked live asset must reject a stale untracked baseline state");
  assert.equal(currentUntracked.trackedStateMismatches.length, 1, "untracked live asset must reject a tracked baseline state");
  assert.deepEqual(missingFormalAsset.missingAssets, [tracked.path], "missing formal asset must be rejected");
  assert.equal(changedHash.hashMismatches.length, 1, "image hash changes must be rejected");
  assert.equal(changedBytes.byteMismatches.length, 1, "image byte-size changes must be rejected");
  assert.deepEqual(changedPath.missingAssets, [tracked.path], "path changes must report the sealed asset missing");
  assert.deepEqual(changedPath.unexpectedAssets, ["fixture/moved.webp"], "path changes must report the moved asset unexpected");

  return {
    trackedLiveAndSealed: "PASS",
    staleUntrackedBaselineKilled: true,
    untrackedLiveAssetKilled: true,
    missingFormalAssetKilled: true,
    changedHashKilled: true,
    changedBytesKilled: true,
    changedPathKilled: true,
  };
}

const ROOT = path.resolve(import.meta.dirname, "..");
const inventoryPath = path.join(ROOT, INVENTORY_PATH);
const reportPath = path.join(ROOT, REPORT_PATH);
assert.equal(fs.existsSync(inventoryPath), true, `${INVENTORY_PATH}:missing; run the baseline builder`);
assert.equal(fs.existsSync(reportPath), true, `${REPORT_PATH}:missing; run the baseline builder`);

const model = buildImageAssetBaseline({ root: ROOT });
const sealedModel = JSON.parse(fs.readFileSync(inventoryPath, "utf8"));
const inventoryComparison = compareImageAssetBaselineInventories(model.inventory, sealedModel.inventory || []);
const sizePolicyMutations = verifyNormalGitSizePolicyMutations();
const canonicalTextComparisonFixtures = verifyCanonicalTextComparisonFixtures();
const trackedStateMutationCases = verifyTrackedStateSealingMutations();
assert.equal(model.schemaVersion, BASELINE_SCHEMA_VERSION);
assert.equal(model.inventory.filter((asset) => !asset.isTracked).length, 0, `untracked image assets cannot be sealed:${JSON.stringify(model.inventory.filter((asset) => !asset.isTracked).map((asset) => asset.path))}`);
assert.equal(inventoryComparison.trackedStateMismatches.length, 0, `tracked-state baseline mismatches:${JSON.stringify(inventoryComparison.trackedStateMismatches)}`);
assert.equal(inventoryComparison.hashMismatches.length, 0, `image hash baseline mismatches:${JSON.stringify(inventoryComparison.hashMismatches)}`);
assert.equal(inventoryComparison.byteMismatches.length, 0, `image byte-size baseline mismatches:${JSON.stringify(inventoryComparison.byteMismatches)}`);
assert.equal(inventoryComparison.missingAssets.length, 0, `missing baseline image assets:${JSON.stringify(inventoryComparison.missingAssets)}`);
assert.equal(inventoryComparison.unexpectedAssets.length, 0, `unexpected baseline image assets:${JSON.stringify(inventoryComparison.unexpectedAssets)}`);
assert.equal(
  artifactTextMatches(stableBaselineJson(model), fs.readFileSync(inventoryPath, "utf8")),
  true,
  `${INVENTORY_PATH}:stale or manually edited`,
);
assert.equal(
  artifactTextMatches(renderImageAssetBaselineReport(model), fs.readFileSync(reportPath, "utf8")),
  true,
  `${REPORT_PATH}:stale or manually edited`,
);

assert.equal(model.orphanAssets.unknown.length, 0, `unknown image assets:${JSON.stringify(model.orphanAssets.unknown)}`);
assert.equal(model.references.blockingMissingLocalAssets.length, 0, `missing production local image assets:${JSON.stringify(model.references.blockingMissingLocalAssets)}`);
assert.equal(model.references.externalImageReferences.filter((entry) => entry.kind === "production").length, 0, `production external image references:${JSON.stringify(model.references.externalImageReferences.filter((entry) => entry.kind === "production"))}`);
assert.equal(model.references.unsafeProductionImages.length, 0, `unverified legacy destination images in production:${JSON.stringify(model.references.unsafeProductionImages)}`);
assert.equal(model.coverage.invalidMappings, 0);
assert.equal(model.backfill.problems.length, 0, `needsBackfill mismatches:${JSON.stringify(model.backfill.problems)}`);
assert.equal(model.backfill.total, model.coverage.cities.total - model.coverage.cities.dedicated + model.coverage.corePois.total - model.coverage.corePois.dedicated);
assert(model.coverage.cities.dedicated >= 0 && model.coverage.cities.dedicated <= model.coverage.cities.total);
assert(model.coverage.corePois.dedicated >= 0 && model.coverage.corePois.dedicated <= model.coverage.corePois.total);
assert.equal(model.coverage.neutralPlaceholderAssignments, model.backfill.total);
assert.equal(model.git.invalidLfsPointers.length, 0, `invalid LFS pointers:${JSON.stringify(model.git.invalidLfsPointers)}`);
assert.equal(IMAGE_SIZE_AUDIT_THRESHOLD_BYTES, 300_000);
assert.equal(NORMAL_GIT_DEFAULT_FAIL_THRESHOLD_BYTES, 500_000);
assert.equal(NORMAL_GIT_HARD_LIMIT_BYTES, 5_000_000);
assert.equal(model.git.invalidSizeExceptions.length, 0, `invalid normal Git size exceptions:${JSON.stringify(model.git.invalidSizeExceptions)}`);
assert.equal(model.git.unusedSizeExceptions.length, 0, `unused normal Git size exceptions:${JSON.stringify(model.git.unusedSizeExceptions)}`);
assert.equal(model.git.sizePolicyViolations.length, 0, `normal Git image size policy violations:${JSON.stringify(model.git.sizePolicyViolations)}`);
assert.equal(model.git.hardLimitViolations.length, 0, `normal Git image hard-limit violations:${JSON.stringify(model.git.hardLimitViolations)}`);
assert.equal(model.git.normalGitLargeAssets.every((entry) => entry.allowed), true, `unapproved normal Git large binary:${JSON.stringify(model.git.normalGitLargeAssets)}`);
assert.equal(model.inventory.filter((asset) => asset.rasterInspectionError).length, 0, `raster decode failures:${JSON.stringify(model.inventory.filter((asset) => asset.rasterInspectionError).map((asset) => ({ path: asset.path, error: asset.rasterInspectionError })))}`);

const routesSource = fs.readFileSync(path.join(ROOT, "routes.js"), "utf8");
const preloadSource = fs.readFileSync(path.join(ROOT, "route-feed-preload.js"), "utf8");
const sharedSource = fs.readFileSync(path.join(ROOT, "app-shared.js"), "utf8");
const countryDetailHtml = fs.readFileSync(path.join(ROOT, "country-japan.html"), "utf8");
assert.match(routesSource, /const runtimeImageSearchEnabled = false;/u, "route feed runtime image search must stay disabled");
assert.match(routesSource, /return \/\^\(\?:https\?:\)\?\\\/\\\/\/i\.test\(text\) \? FALLBACK_ROUTE_COVER : text;/u, "route feed must map remote image URLs to the local placeholder before display");
assert.equal(/https?:\/\//u.test(preloadSource), false, "route preload must not contain external image fallbacks");
assert.equal(/https?:\/\/[^'"`\s]+\.(?:png|jpe?g|webp|gif|svg)/iu.test(sharedSource), false, "shared client must not contain external image fallbacks");
assert(
  countryDetailHtml.indexOf("route-v2-image-coverage.js") >= 0
    && countryDetailHtml.indexOf("route-v2-image-coverage.js") < countryDetailHtml.indexOf("travel-data.js")
    && countryDetailHtml.indexOf("route-v2-image-coverage.js") < countryDetailHtml.indexOf("country-detail.js"),
  "Country Detail must load the verified image manifest before its data and renderer consumers",
);

const formalDedicatedPaths = new Set(model.inventory.filter((asset) => ["dedicated-city", "dedicated-poi"].includes(asset.category)).map((asset) => asset.path));
const unexpectedExactDuplicates = model.duplicates.exactGroups.filter((group) => group.paths.filter((assetPath) => formalDedicatedPaths.has(assetPath)).length > 1);
const unexpectedPerceptualDuplicates = model.duplicates.perceptualGroups.filter((group) => group.paths.filter((assetPath) => formalDedicatedPaths.has(assetPath)).length > 1);
assert.equal(unexpectedExactDuplicates.length, 0, `dedicated exact duplicate assets:${JSON.stringify(unexpectedExactDuplicates)}`);
assert.equal(unexpectedPerceptualDuplicates.length, 0, `dedicated perceptual duplicate assets:${JSON.stringify(unexpectedPerceptualDuplicates)}`);

process.stdout.write(`${JSON.stringify({
  verifier: "route-v2-image-asset-baseline",
  status: "PASS",
  images: model.summary.totalImages,
  categories: model.summary.categoryCounts,
  coverage: model.coverage,
  needsBackfill: model.backfill.total,
  safeToDelete: model.orphanAssets.safeToDelete.length,
  exactDuplicateGroups: model.duplicates.exactGroups.length,
  perceptualDuplicateGroups: model.duplicates.perceptualGroups.length,
  totalBytes: model.summary.totalBytes,
  normalGitImageBytes: model.summary.normalGitImageBytes,
  lfsTrackedBytes: model.summary.lfsTrackedBytes,
  normalGitLargeAssets: model.git.normalGitLargeAssets.length,
  totalCheckedAssets: inventoryComparison.totalCheckedAssets,
  trackedStateMismatches: inventoryComparison.trackedStateMismatches.length,
  hashMismatches: inventoryComparison.hashMismatches.length,
  byteMismatches: inventoryComparison.byteMismatches.length,
  missingAssets: inventoryComparison.missingAssets.length,
  unexpectedAssets: inventoryComparison.unexpectedAssets.length,
  trackedStateMutationCases,
  sizePolicyMutations,
  canonicalTextComparisonFixtures,
  unknownAssets: 0,
  invalidMappings: 0,
}, null, 2)}\n`);
