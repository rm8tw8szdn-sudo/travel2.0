import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";

export function sha256IfExists(filePath) {
  if (!fs.existsSync(filePath)) return null;
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

export function fileState(filePath) {
  if (!fs.existsSync(filePath)) return { exists: false };
  const stat = fs.statSync(filePath);
  return {
    exists: true,
    size: stat.size,
    mtimeMs: stat.mtimeMs,
    sha256: sha256IfExists(filePath),
  };
}

export function statesFor(files) {
  return Object.fromEntries(files.map((file) => [file, fileState(file)]));
}

export function assertStatesUnchanged(before, after, message = "protected files changed") {
  assert.deepEqual(after, before, message);
}
