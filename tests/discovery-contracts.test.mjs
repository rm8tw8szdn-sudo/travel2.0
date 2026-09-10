import test from "node:test";
import assert from "node:assert/strict";
import { normalizeDiscoveryRequest } from "../src/lib/routes/contracts.mjs";
import { asRouteDiscoveryError } from "../src/lib/routes/errors.mjs";

function invalid(input, code = "INVALID_INPUT") {
  assert.throws(() => normalizeDiscoveryRequest(input), (error) => error.code === code && error.status === 400);
}

test("discovery requires a plain object with typed scalar fields", () => {
  for (const input of [null, [], "feed", 1, true]) invalid(input);
  invalid({ mode: {} });
  invalid({ mode: "feed", query: { text: "东京" } });
  invalid({ mode: "detail", routeId: ["route"] });
  invalid({ mode: "feed", limit: {} });
  invalid({ mode: "feed", excludeIds: "route" });
  invalid({ mode: "feed", excludeClusters: ["ok", {}] });
});

test("discovery rejects oversized exclusion lists instead of silently truncating", () => {
  invalid({ mode: "feed", excludeIds: Array.from({ length: 6001 }, (_, index) => `route-${index}`) });
  invalid({ mode: "feed", excludeClusters: Array.from({ length: 201 }, (_, index) => `cluster-${index}`) });
});

test("unexpected modes and malformed cursors retain stable client errors", () => {
  invalid({ mode: "unknown" }, "INVALID_MODE");
  invalid({ mode: "feed", cursor: "x".repeat(8193) }, "INVALID_CURSOR");
});

test("unexpected exceptions do not expose internal messages", () => {
  const error = asRouteDiscoveryError(new Error("database password appeared here"));
  assert.equal(error.code, "DISCOVERY_FAILED");
  assert.equal(error.status, 502);
  assert.equal(error.details, undefined);
});
