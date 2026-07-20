import crypto from "node:crypto";

export function normalizeKnowledgeBaselineText(value) {
  return String(value ?? "").replace(/\r\n?/gu, "\n");
}

export function sha256KnowledgeBaselineText(value) {
  return crypto.createHash("sha256").update(normalizeKnowledgeBaselineText(value)).digest("hex");
}
