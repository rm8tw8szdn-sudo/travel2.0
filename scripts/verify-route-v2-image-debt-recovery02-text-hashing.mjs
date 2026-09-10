import assert from "node:assert/strict";
import crypto from "node:crypto";

import { normalizeKnowledgeBaselineText } from "./lib/knowledge-baseline-text.mjs";
import { recovery02TextHashMatches, sha256Recovery02Text } from "./lib/image-debt-recovery02-audit.mjs";

const lf = "alpha\nbeta\ngamma\n";
const variants = {
  lf,
  crlf: lf.replaceAll("\n", "\r\n"),
  cr: lf.replaceAll("\n", "\r"),
};
const sealedHash = sha256Recovery02Text(variants.lf);

assert.equal(sha256Recovery02Text(variants.lf), sealedHash, "LF source must match LF sealed text");
assert.equal(sha256Recovery02Text(variants.crlf), sealedHash, "CRLF source must match LF sealed text");
assert.equal(sha256Recovery02Text(variants.cr), sealedHash, "CR source must match LF sealed text");
assert.equal(recovery02TextHashMatches(variants.lf, sealedHash), true, "LF source must match LF sealed hash");
assert.equal(recovery02TextHashMatches(variants.crlf, sealedHash), true, "CRLF source must match LF sealed hash");
assert.equal(recovery02TextHashMatches(variants.cr, sealedHash), true, "CR source must match LF sealed hash");
const legacyCrLfSealedHash = crypto.createHash("sha256").update(variants.crlf).digest("hex");
assert.equal(recovery02TextHashMatches(variants.lf, legacyCrLfSealedHash), true, "canonical LF text must match a legacy CRLF sealed hash");

for (const [name, changed] of [
  ["real character change", "alpha\nbetX\ngamma\n"],
  ["deleted line", "alpha\ngamma\n"],
  ["added line", "alpha\nbeta\ngamma\ndelta\n"],
  ["ordinary space change", "alpha\nbeta \ngamma\n"],
  ["line order change", "beta\nalpha\ngamma\n"],
  ["stale source snapshot", "alpha\nbeta\nold\n"],
]) {
  assert.notEqual(sha256Recovery02Text(changed), sealedHash, `${name} must fail the sealed text hash`);
  assert.equal(recovery02TextHashMatches(changed, sealedHash), false, `${name} must fail the sealed text comparison`);
}

const binary = Buffer.from([0x00, 0x0d, 0x0a, 0xff]);
const rawBinaryHash = crypto.createHash("sha256").update(binary).digest("hex");
const normalizedBinaryHash = crypto.createHash("sha256").update(normalizeKnowledgeBaselineText(binary)).digest("hex");
assert.notEqual(rawBinaryHash, normalizedBinaryHash, "binary bytes must never use the text normalizer");

process.stdout.write(`${JSON.stringify({
  verifier: "route-v2-image-debt-recovery02-text-hashing",
  status: "PASS",
  newlineVariantsAccepted: 3,
  realTextMutationsRejected: 6,
  binaryNormalizationRejected: true,
}, null, 2)}\n`);
