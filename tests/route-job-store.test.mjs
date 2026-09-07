import test from "node:test";
import assert from "node:assert/strict";
import { createRouteJobStore } from "../src/lib/routes/route-job-store.mjs";

test("identity preserves field positions and delimiter-containing values", () => {
  for (const [a, b] of [
    [{ providerId: "same" }, { query: "same" }],
    [{ providerId: "a::b", query: "c" }, { providerId: "a", query: "b::c" }],
  ]) {
    const store = createRouteJobStore({ now: () => 100 });
    const first = store.enqueue(a);
    const second = store.enqueue(b);
    assert.equal(second.reused, false);
    assert.notEqual(second.job.id, first.job.id);
    assert.equal(store.list().length, 2);
  }
});

test("default and explicit job types share the same active identity", () => {
  const store = createRouteJobStore();
  const first = store.enqueue({ query: "Kyoto" });
  const second = store.enqueue({ type: "repository-build", query: "Kyoto" });
  assert.equal(second.reused, true);
  assert.equal(second.job.id, first.job.id);
});

test("completed jobs are retained when re-enqueued in the same millisecond", () => {
  const store = createRouteJobStore({ now: () => 100 });
  const first = store.enqueue({ query: "Kyoto" }).job;
  store.transition(first.id, "accepted");
  const second = store.enqueue({ query: "Kyoto" }).job;
  assert.notEqual(second.id, first.id);
  assert.equal(store.get(first.id).status, "accepted");
  assert.equal(store.list().length, 2);
});

test("explicit IDs cannot overwrite unrelated jobs", () => {
  const store = createRouteJobStore();
  store.enqueue({ id: "fixed", query: "Kyoto" });
  assert.throws(() => store.enqueue({ id: "fixed", query: "Oslo" }), /job_id_already_exists/);
  assert.equal(store.get("fixed").query, "Kyoto");
});

test("input diagnostics and returned snapshots cannot mutate stored jobs", () => {
  const store = createRouteJobStore();
  const job = store.enqueue({ query: "Kyoto" }).job;
  const diagnostic = { detail: { reason: "original" } };
  const result = store.transition(job.id, "failed", diagnostic);
  diagnostic.detail.reason = "changed input";
  result.diagnostics[0].detail.reason = "changed output";
  assert.equal(store.get(job.id).diagnostics[0].detail.reason, "original");
});

test("expiration releases active deduplication while preserving history", () => {
  let timestamp = 100;
  const store = createRouteJobStore({ now: () => timestamp });
  const first = store.enqueue({ query: "Kyoto" }).job;
  assert.equal(store.enqueue({ query: "Kyoto" }).reused, true);
  timestamp = 200;
  store.expireOlderThan(50);
  assert.equal(store.get(first.id).status, "expired");
  assert.equal(store.enqueue({ query: "Kyoto" }).reused, false);
  assert.equal(store.list({ status: "expired" }).length, 1);
});
