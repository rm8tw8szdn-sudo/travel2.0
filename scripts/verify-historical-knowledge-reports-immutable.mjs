import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  normalizeSealedReportText,
  SEALED_SNAPSHOT_PATH,
  sealedReportHash,
  verifyHistoricalKnowledgeReportSnapshots,
} from "./lib/historical-knowledge-report-snapshots.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");
const read = (relativePath) => normalizeSealedReportText(fs.readFileSync(path.join(ROOT, relativePath), "utf8"));
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, SEALED_SNAPSHOT_PATH), "utf8"));
const baseline = verifyHistoricalKnowledgeReportSnapshots({ root: ROOT });

const mutations = [
  {
    label: "Batch05 sealed POI total changed",
    path: "ROUTE_V2_KNOWLEDGE_EXPANSION_BATCH05_REPORT.md",
    mutate: (text) => text.replace("2,101 POIs", "2,102 POIs"),
  },
  {
    label: "Batch08 Knowledge rewritten to Batch09 totals",
    path: "ROUTE_V2_KNOWLEDGE_EXPANSION_BATCH08_REPORT.md",
    mutate: (text) => text.replace("99 Countries / 718 Cities / 4,766 POIs / 5,583 entities", "119 Countries / 833 Cities / 5,379 POIs / 6,331 entities"),
  },
  {
    label: "Batch08 sealed image debt rewritten from 13 to 188",
    path: "ROUTE_V2_KNOWLEDGE_EXPANSION_BATCH08_REPORT.md",
    mutate: (text) => text.replace("13/13", "188/188"),
  },
  {
    label: "Batch07 sealed POI total changed",
    path: "ROUTE_V2_KNOWLEDGE_EXPANSION_BATCH07_REPORT.md",
    mutate: (text) => text.replace("4,038 POIs", "4,039 POIs"),
  },
  {
    label: "Batch06 sealed Evidence addition changed",
    path: "ROUTE_V2_KNOWLEDGE_EXPANSION_BATCH06_REPORT.md",
    mutate: (text) => text.replace("Evidence added: 172", "Evidence added: 173"),
  },
];

for (const mutation of mutations) {
  const original = read(mutation.path);
  const mutated = mutation.mutate(original);
  assert.notEqual(mutated, original, `${mutation.label}: fixture must change the sealed artifact`);
  assert.throws(
    () => verifyHistoricalKnowledgeReportSnapshots({ root: ROOT, overrides: new Map([[mutation.path, mutated]]) }),
    /sealed-.+(?:git-blob|report|mismatch)/u,
    `${mutation.label}: mutation must fail closed`,
  );
}

const reportAndManifestMutations = [
  {
    label: "Batch05 report and mutable manifest changed together",
    batch: "05",
    path: "ROUTE_V2_KNOWLEDGE_EXPANSION_BATCH05_REPORT.md",
    mutate: (text) => text.replace("2,101 POIs", "2,102 POIs"),
  },
  {
    label: "Batch07 report and mutable manifest changed together",
    batch: "07",
    path: "ROUTE_V2_KNOWLEDGE_EXPANSION_BATCH07_REPORT.md",
    mutate: (text) => text.replace("4,038 POIs", "4,039 POIs"),
  },
  {
    label: "Batch08 report and mutable manifest changed together",
    batch: "08",
    path: "ROUTE_V2_KNOWLEDGE_EXPANSION_BATCH08_REPORT.md",
    mutate: (text) => text.replace("4,766 POIs", "4,767 POIs"),
  },
];
for (const mutation of reportAndManifestMutations) {
  const mutatedText = mutation.mutate(read(mutation.path));
  assert.notEqual(mutatedText, read(mutation.path), `${mutation.label}: fixture must change the sealed artifact`);
  const mutatedManifest = structuredClone(manifest);
  mutatedManifest.batches[mutation.batch].files[mutation.path] = sealedReportHash(mutatedText);
  assert.throws(
    () => verifyHistoricalKnowledgeReportSnapshots({
      root: ROOT,
      batches: [mutation.batch],
      overrides: new Map([[mutation.path, mutatedText]]),
      manifestOverride: mutatedManifest,
    }),
    /sealed-.+(?:manifest-git-hash|git-blob)-mismatch/u,
    `${mutation.label}: changing the current report and manifest together must not move the Git trust root`,
  );
}

const unrelatedCommitManifest = structuredClone(manifest);
unrelatedCommitManifest.batches["08"].sourceMergeCommit = manifest.batches["07"].sourceMergeCommit;
assert.throws(
  () => verifyHistoricalKnowledgeReportSnapshots({ root: ROOT, batches: ["08"], manifestOverride: unrelatedCommitManifest }),
  /sealed-batch08-source-pr-mismatch/u,
  "an unrelated merge commit must not become the Batch08 sealing anchor",
);

const missingPathManifest = structuredClone(manifest);
missingPathManifest.batches["08"].files["data/knowledge/reports/does-not-exist.json"] = "0".repeat(64);
assert.throws(
  () => verifyHistoricalKnowledgeReportSnapshots({ root: ROOT, batches: ["08"], manifestOverride: missingPathManifest }),
  /sealed-batch08-source-path-missing/u,
  "a path missing from the sealing commit must fail closed",
);

const currentBatchChange = verifyHistoricalKnowledgeReportSnapshots({
  root: ROOT,
  currentRuntimeState: { batch: "09", publishedPois: 5267, publishedEntities: 6219 },
});
assert.equal(currentBatchChange.status, "PASS");
assert.equal(currentBatchChange.currentRuntimeStateIgnoredByHistoricalSnapshot, true);

console.log(JSON.stringify({
  verifier: "historical-knowledge-reports-git-anchored",
  status: "PASS",
  sealedBatches: baseline.batches.map((entry) => entry.batch),
  checkedFiles: baseline.checkedFiles,
  mutationsKilled: mutations.length + reportAndManifestMutations.length + 2,
  trustRoot: "git-show-source-merge-commit-blobs",
  currentBatchChangeWithoutHistoricalRewrite: "PASS",
}, null, 2));
