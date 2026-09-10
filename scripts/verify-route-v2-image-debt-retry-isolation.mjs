import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = path.resolve(import.meta.dirname, "..");
const stateFiles = ["results", "provenance", "inventory"].map(name => `data/route-v2/images/image-debt-recovery02-${name}.json`);
const hashes = () => stateFiles.map(file => crypto.createHash("sha256").update(fs.readFileSync(path.join(root, file))).digest("hex"));
const before = hashes();
const results = JSON.parse(fs.readFileSync(path.join(root, stateFiles[0]), "utf8"));
const provenance = JSON.parse(fs.readFileSync(path.join(root, stateFiles[1]), "utf8"));
const outputRoot = path.join(os.tmpdir(), `recovery02-dry-run-${crypto.randomUUID()}`);
const dryRun = (qids, output = outputRoot) => spawnSync(process.execPath, [
  "scripts/recover-route-v2-image-debt.mjs", "--profile=recovery02", `--retry=${qids.join(",")}`,
  `--output-root=${output}`, "--dry-run",
], { cwd: root, encoding: "utf8", windowsHide: true, timeout: 30_000 });
const debt = results.records.filter(record => record.finalStatus === "needsBackfill");
const selected = dryRun(debt.map(record => record.qid));
assert.equal(selected.status, 0, selected.stderr);
const selection = JSON.parse(selected.stdout);
assert.deepEqual(selection.pending.map(record => record.qid).sort(), debt.map(record => record.qid).sort());
for (const record of debt.filter(record => record.visualRejections?.length && record.chosenCandidate?.candidateFile)) {
  const title = record.chosenCandidate.candidateFile.normalize("NFKC").replaceAll("_", " ").toLowerCase();
  assert(selection.pending.find(entry => entry.qid === record.qid).rejectedTitles.includes(title), `must-skip-prior-visual-rejection:${record.qid}`);
}
assert.notEqual(dryRun([provenance.assets[0].wikidataId]).status, 0, "approved image must not be retried in isolation");
assert.notEqual(dryRun([], root).status, 0, "project root must not be used as isolated output");
assert.notEqual(dryRun([], path.join(root, "assets")).status, 0, "project descendant must not be used as isolated output");
assert.notEqual(dryRun([], "relative-output").status, 0, "relative isolated output must be rejected");
assert.equal(fs.existsSync(outputRoot), false, "dry-run must not create output state");
assert.deepEqual(hashes(), before, "dry-run must not mutate formal recovery state");
console.log(JSON.stringify({ verifier: "image-debt-retry-isolation", status: "PASS", debtSelected: debt.length,
  priorRejectionsSkipped: debt.filter(record => record.visualRejections?.length && record.chosenCandidate?.candidateFile).length,
  approvedReplacementRejected: true, unsafeOutputRejected: true, dryRunWrites: 0 }, null, 2));
