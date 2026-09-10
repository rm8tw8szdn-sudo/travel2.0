import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRouteSearchAnalytics } from "../src/lib/routes/route-search-analytics.mjs";

test("analytics failures are reported without throwing", () => {
  const temporaryRoot = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), "route-analytics-"));
  try {
    const directoryTarget = path.join(temporaryRoot, "not-a-file");
    fs.mkdirSync(directoryTarget);
    const analytics = createRouteSearchAnalytics({ storagePath: directoryTarget, now: () => 0 });
    assert.doesNotThrow(() => analytics.logSearch({ query: "东京" }));
    assert.deepEqual(analytics.diagnostics(), [{
      type: "analytics-write-failed", code: "EISDIR", timestamp: "1970-01-01T00:00:00.000Z",
    }]);
  } finally {
    const target = fs.realpathSync(temporaryRoot);
    assert.equal(path.dirname(target), fs.realpathSync(os.tmpdir()));
    fs.rmSync(target, { recursive: true, force: true });
  }
});

test("analytics writes valid JSONL when storage is available", () => {
  const temporaryRoot = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), "route-analytics-"));
  try {
    const storagePath = path.join(temporaryRoot, "analytics.jsonl");
    const analytics = createRouteSearchAnalytics({ storagePath, now: () => 0 });
    assert.deepEqual(analytics.logSearch({ query: "东京" }), undefined);
    assert.deepEqual(JSON.parse(fs.readFileSync(storagePath, "utf8")), {
      schemaVersion: 1, timestamp: "1970-01-01T00:00:00.000Z", type: "search", query: "东京",
    });
    assert.deepEqual(analytics.diagnostics(), []);
  } finally {
    const target = fs.realpathSync(temporaryRoot);
    assert.equal(path.dirname(target), fs.realpathSync(os.tmpdir()));
    fs.rmSync(target, { recursive: true, force: true });
  }
});
