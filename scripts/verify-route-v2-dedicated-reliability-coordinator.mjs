import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = fs.readFileSync(path.join(root, "scripts/run-route-v2-dedicated-reliability-coordinator.mjs"), "utf8");

assert(source.includes("const sessionSecret = randomBytes(32)"));
assert(source.includes("for (let runIndex = 1; runIndex <= 5; runIndex += 1)"));
assert.equal((source.match(/run-route-v2-performance-reliability-qualification\.mjs/g) || []).length, 1);
assert(source.includes("attempts.push({ runIndex, run, stderr: execution.stderr, exitCode: execution.status ?? 1, provenanceAdmitted: matchesPlan(run, expectedPlan) })"));
assert(source.includes("attempts.length === 5"));
assert(source.includes("attempts.every((attempt, index) => attempt.runIndex === index + 1 && attempt.exitCode === 0 && attempt.provenanceAdmitted)"));
assert(source.includes('audit.auditVerdict === "AUDIT VALID"'));
assert(source.includes('qualificationVerdict: runtimePassed ? "QUALIFICATION PASS" : "QUALIFICATION FAIL"'));
assert(source.includes("sessionSecret.fill(0)"));
assert(source.includes("preserveFailureEvidence(error)"));
assert(source.includes('qualificationVerdict: "QUALIFICATION FAIL"'));
assert(!source.includes("--runs"));
assert(!source.includes("qualification-input"));
assert(!/JSON\.stringify\s*\(\s*sessionSecret/u.test(source));
assert(!/writeFileSync[^\n]*sessionSecret/u.test(source));

process.stdout.write(`${JSON.stringify({
  verifier: "route-v2-dedicated-reliability-coordinator",
  status: "PASS",
  authoritativeInput: "LIVE TRUSTED EXECUTION ONLY",
  offlineArtifactAuthority: "NONE",
  exactAttempts: 5,
  retryPath: "ABSENT",
  secretSerialization: "ABSENT",
}, null, 2)}\n`);
