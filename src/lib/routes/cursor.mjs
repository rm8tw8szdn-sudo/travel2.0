import { RouteDiscoveryError } from "./errors.mjs";

export function encodeDiscoveryCursor(value) {
  return Buffer.from(JSON.stringify({ version: 1, ...value }), "utf8").toString("base64url");
}

export function decodeDiscoveryCursor(cursor) {
  if (!cursor) return null;
  try {
    const value = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
    if (!value || value.version !== 1 || typeof value.provider !== "string") throw new Error("invalid cursor payload");
    return value;
  } catch {
    throw new RouteDiscoveryError("INVALID_CURSOR", "Discovery cursor is invalid or expired.", { status: 400 });
  }
}
