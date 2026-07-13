import crypto from "node:crypto";

export function cleanString(value) {
  return String(value || "").trim();
}

export function uniqueStrings(values = []) {
  return [...new Set(values.map(cleanString).filter(Boolean))];
}

export function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function stableHash(value) {
  return crypto.createHash("sha256").update(stableJson(value)).digest("hex");
}
