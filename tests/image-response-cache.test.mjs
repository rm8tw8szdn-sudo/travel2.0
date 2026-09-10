import test from "node:test";
import assert from "node:assert/strict";
import { createImageResponseCache } from "../image-response-cache.js";
const image = (bytes) => ({ body: Buffer.alloc(bytes), contentType: "image/jpeg" });

test("image cache enforces byte and entry limits on every insertion", () => {
  const cache = createImageResponseCache({ maxBytes: 10, maxEntries: 2 });
  cache.set("a", image(4));
  cache.set("b", image(4));
  cache.set("c", image(4));
  assert.equal(cache.get("a"), undefined);
  assert.equal(cache.size, 2);
  assert.equal(cache.totalBytes, 8);
  cache.set("d", image(9));
  assert.equal(cache.size, 1);
  assert.equal(cache.totalBytes, 9);
});

test("replacement accounting, delete, and clear release byte capacity", () => {
  const cache = createImageResponseCache({ maxBytes: 10 });
  cache.set("a", image(6));
  cache.set("a", image(2));
  cache.set("b", image(8));
  assert.equal(cache.totalBytes, 10);
  assert.equal(cache.delete("a"), true);
  assert.equal(cache.delete("a"), false);
  assert.equal(cache.totalBytes, 8);
  cache.clear();
  assert.equal(cache.size, 0);
  assert.equal(cache.totalBytes, 0);
});

test("oversized images bypass caching without evicting unrelated images", () => {
  const cache = createImageResponseCache({ maxBytes: 10 });
  cache.set("a", image(2));
  assert.equal(cache.set("large", image(11)), false);
  assert.equal(cache.get("large"), undefined);
  assert.equal(cache.get("a").body.length, 2);
  assert.equal(cache.totalBytes, 2);
});

test("invalid memory limits are rejected", () => {
  for (const value of [0, -1, 0.5, Infinity, NaN]) {
    assert.throws(() => createImageResponseCache({ maxBytes: value }), /image_cache_limit_invalid/);
    assert.throws(() => createImageResponseCache({ maxEntries: value }), /image_cache_limit_invalid/);
  }
});
