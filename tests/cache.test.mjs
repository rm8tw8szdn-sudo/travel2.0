import test from "node:test";
import assert from "node:assert/strict";
import { createInMemoryTtlCache, createInMemoryCacheProvider } from "../src/lib/routes/cache.mjs";

test("capacity bounds a write-only workload", () => {
  const cache = createInMemoryTtlCache({ maxEntries: 2, now: () => 0 });
  cache.set("a", 1);
  cache.set("b", 2);
  assert.equal(cache.set("c", 3), 3);
  assert.equal(cache.get("a"), undefined);
  assert.equal(cache.get("b"), 2);
  assert.equal(cache.size, 2);
});

test("default capacity remains bounded without reading size during writes", () => {
  const cache = createInMemoryTtlCache({ now: () => 0 });
  for (let i = 0; i < 2000; i++) cache.set(i, i);
  assert.equal(cache.get(0), undefined);
  assert.equal(cache.size, 1000);
});

test("replacement refreshes insertion order and expiry", () => {
  let timestamp = 0;
  const cache = createInMemoryTtlCache({ maxEntries: 2, ttlMs: 10, now: () => timestamp });
  cache.set("a", 1);
  cache.set("b", 2);
  timestamp = 5;
  cache.set("a", 3);
  cache.set("c", 4);
  assert.equal(cache.get("b"), undefined);
  timestamp = 10;
  assert.equal(cache.get("a"), 3);
  timestamp = 15;
  assert.equal(cache.get("a"), undefined);
  assert.equal(cache.size, 0);
});

test("capacity validation and existing clear/delete contract", () => {
  for (const maxEntries of [0, -1, 1.5, Infinity, NaN, "2"]) {
    assert.throws(() => createInMemoryTtlCache({ maxEntries }), { code: "INVALID_CACHE_CAPACITY" });
  }
  assert.equal(createInMemoryCacheProvider, createInMemoryTtlCache);
  const cache = createInMemoryTtlCache();
  cache.set("a", false);
  assert.equal(cache.get("a"), false);
  assert.equal(cache.delete("a"), true);
  assert.equal(cache.delete("a"), false);
  cache.set("b", null);
  cache.clear();
  assert.equal(cache.size, 0);
});
