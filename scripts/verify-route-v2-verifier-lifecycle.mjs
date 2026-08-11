import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { MANDATORY_PRELAUNCH_VERIFIERS } from "../src/lib/routes/prelaunch-verifier-gate.mjs";
import { normalizeKnowledgeBaselineText, sha256KnowledgeBaselineText } from "./lib/knowledge-baseline-text.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const lifecycle = JSON.parse(fs.readFileSync(path.join(projectRoot, "scripts/verifier-lifecycle.json"), "utf8"));
const activePaths = new Set(MANDATORY_PRELAUNCH_VERIFIERS.map((stage) => stage.relativePath));
const retiredPaths = new Set(lifecycle.retired.map((entry) => entry.path));

assert.equal(activePaths.size, MANDATORY_PRELAUNCH_VERIFIERS.length, "mandatory verifier paths must be unique");
for (const stage of MANDATORY_PRELAUNCH_VERIFIERS) {
  const absolutePath = path.join(projectRoot, stage.relativePath);
  assert(fs.existsSync(absolutePath), `${stage.name} must point to an existing verifier`);
  assert.equal(retiredPaths.has(stage.relativePath), false, `${stage.name} must not use a retired verifier`);
  const source = fs.readFileSync(absolutePath, "utf8");
  assert.doesNotMatch(source, /\/Applications\/Google Chrome\.app/u, `${stage.name} must not hardcode a macOS Chrome path`);
}

for (const entry of lifecycle.retired) {
  assert(fs.existsSync(path.join(projectRoot, entry.path)), `retired verifier must remain traceable: ${entry.path}`);
  assert(entry.reason && entry.replacement, `retired verifier needs a reason and replacement: ${entry.path}`);
}

const lf = "alpha\nbeta\n";
const crlf = "alpha\r\nbeta\r\n";
const cr = "alpha\rbeta\r";
assert.equal(normalizeKnowledgeBaselineText(crlf), lf);
assert.equal(normalizeKnowledgeBaselineText(cr), lf);
assert.equal(sha256KnowledgeBaselineText(lf), sha256KnowledgeBaselineText(crlf));
assert.equal(sha256KnowledgeBaselineText(lf), sha256KnowledgeBaselineText(cr));

process.stdout.write(`${JSON.stringify({
  verifier: "route-v2-verifier-lifecycle",
  status: "PASS",
  activeReleaseVerifiers: activePaths.size,
  retiredVerifiers: retiredPaths.size,
  activeMacOnlyPaths: 0,
  canonicalTextHashing: "LF",
}, null, 2)}\n`);
