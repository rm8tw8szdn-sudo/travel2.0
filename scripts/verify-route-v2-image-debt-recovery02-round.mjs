import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { assertRoundBinding } from "./promote-route-v2-image-debt-recovery02-round.mjs";

const root = path.resolve(import.meta.dirname, "..");
const load = file => JSON.parse(fs.readFileSync(path.join(root, file), "utf8"));
const audit = load("data/route-v2/images/image-debt-recovery02-visual-audit.json");
const round = load(audit.sourceSnapshotPath);
const index = round.decisions.findIndex(d => d.status === "passed");
const candidate = round.candidates[index], decision = round.decisions[index];
assertRoundBinding(candidate, decision);
let killed = 0;
for (const field of ["entityId", "qid", "entityType", "assetPath", "processedHash", "sourceHash", "sourceUrl", "originalFilename", "reviewedFilePath", "status"]) {
  assert.throws(() => assertRoundBinding(candidate, { ...decision, [field]: "wrong" }));
  killed++;
}
const previous = load(audit.rounds.at(-1).previousAuditPath);
const formerlyRejected = new Set(previous.decisions.filter(d => d.status === "rejected").map(d => d.qid));
const recovered = round.decisions.filter(d => d.status === "passed" && formerlyRejected.has(d.qid));
assert(recovered.length > 0, "old QID rejection must not reject a new file");
for (const d of recovered) {
  const old = previous.decisions.find(old => old.qid === d.qid);
  assert.notEqual(old.processedHash, d.processedHash);
  assert.equal(audit.decisions.find(current => current.qid === d.qid).auditId, d.auditId);
}
const oldPassed = previous.decisions.filter(d => d.status === "passed");
for (const d of oldPassed) assert.deepEqual(audit.decisions.find(current => current.entityId === d.entityId), d);
const results = load("data/route-v2/images/image-debt-recovery02-results.json");
for (const r of round.records) {
  const current = results.records.find(c => c.entityId === r.entityId);
  assert.deepEqual(current.sourceAttempts.slice(0, r.sourceAttempts.length), r.sourceAttempts);
  assert.deepEqual(current.retryHistory, r.retryHistory);
  for (const d of round.decisions.filter(d => d.entityId === r.entityId && d.status === "rejected"))
    assert(current.visualRejections.some(v => v.auditId === d.auditId), "rejected history lost");
}
console.log(JSON.stringify({ verifier: "recovery02-round", status: "PASS", bindingMutationsKilled: killed,
  priorPassedDecisionsUnchanged: oldPassed.length, formerlyRejectedQidsRecovered: recovered.length,
  reviewEventsPreserved: load(audit.rounds[0].previousAuditPath).totalReviewed + audit.rounds.reduce((sum, r) => sum + r.reviewed, 0), currentDecisions: audit.totalReviewed }));
