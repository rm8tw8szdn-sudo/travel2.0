import assert from "node:assert/strict";
import { createRouteDiscovery, createRouteFeedRefillWorker, createRouteJobStore } from "../src/lib/routes/index.mjs";

{
  let now = 1;
  const jobStore = createRouteJobStore({ now: () => now++ });
  const first = jobStore.enqueue({ type: "feed-refill", providerId: "wikivoyage", sourceIdentity: "cross" });
  assert.equal(first.reused, false, "first feed-refill job should be new");
  const second = jobStore.enqueue({ type: "feed-refill", providerId: "wikivoyage", sourceIdentity: "cross" });
  assert.equal(second.reused, true, "queued feed-refill job should dedupe while running");
  jobStore.transition(first.job.id, "accepted");
  const third = jobStore.enqueue({ type: "feed-refill", providerId: "wikivoyage", sourceIdentity: "cross" });
  assert.equal(third.reused, false, "terminal feed-refill job should not block a later refill");
}

{
  const calls = [];
  const jobStore = createRouteJobStore({ now: () => 1000 + calls.length });
  const repository = {
    status() {
      return {
        total: 26,
        single: 25,
        cross: 1,
        targets: { single: 200, cross: 200, total: 400 },
        minimums: { single: 100, cross: 100, total: 200 },
      };
    },
  };
  const worker = createRouteFeedRefillWorker({
    repository,
    jobStore,
    root: "/tmp/travel-collection",
    env: {
      ROUTE_FEED_UNIQUE_TARGET: "2000",
      ROUTE_FEED_REFILL_PLANNER_BATCH_SIZE: "5",
      ROUTE_FEED_REFILL_DEADLINE_MS: "90000",
      ROUTE_FEED_REFILL_WIKIVOYAGE_BATCH_SIZE: "0",
    },
    runWarmup: async (options) => {
      calls.push(options);
      await new Promise((resolve) => setTimeout(resolve, 20));
      return { ok: true, results: [], plannerPhase: { accepted: 2, rejected: 1, strategyId: options.plannerStrategy } };
    },
    fetchImpl: async () => {
      throw new Error("fetch should not be reached in this unit test");
    },
  });
  const job = jobStore.enqueue({ type: "feed-refill", providerId: "wikivoyage", sourceIdentity: "cross" }).job;
  const first = worker.schedule({ request: { mode: "feed", routeType: "cross" }, job });
  const second = worker.schedule({ request: { mode: "feed", routeType: "cross" }, job });
  assert.equal(first.started, true, "first cross refill should start");
  assert.equal(second.reused, true, "second concurrent cross refill should reuse the active worker");
  await first.promise;
  assert.equal(calls.length, 1, "concurrent cross refill calls should run warmup only once");
  assert.equal(calls[0].acceptedRepository, repository, "worker must pass the live repository instance into warmup");
  assert.equal(calls[0].batchSize, 0, "feed refill should default to planner-only warmup");
  assert.equal(calls[0].plannerStrategy, "feed-refill", "cross refill should use feed-refill by default");
  assert.equal(calls[0].plannerSignals.routeType, "cross", "cross refill should tag planner signals with routeType");
  assert.equal(calls[0].targetCross, 2000, "cross refill should raise the cross target to the unique-feed target");
  assert.ok(calls[0].targetSingle >= 25, "cross refill should not reduce the single pool target below current count");
  assert.equal(calls[0].plannerBatchSize, 5, "worker should pass the configured refill planner batch size");
  assert.equal(calls[0].plannerDeadlineMs, 90000, "worker should pass the configured refill deadline");
  assert.ok(calls[0].plannerCountries.includes("AT"), "cross refill countries should include multi-country gold case countries");
  assert.ok(calls[0].plannerCountries.includes("CZ"), "cross refill should default to one complete cross-country cluster");
  assert.ok(calls[0].plannerCountries.length <= 4, "cross refill should keep the first background batch small enough to finish");
  assert.equal(calls[0].plannerCountries.includes("CN"), false, "China must remain blocked from feed refill planner countries");
  assert.equal(jobStore.get(job.id).status, "accepted", "successful refill should close the job as accepted");
}

{
  const scheduled = [];
  const acceptedRepository = {
    list() {
      return { records: [], nextCursor: null, hasMore: false };
    },
    status() {
      return {
        total: 1,
        single: 1,
        cross: 0,
        targets: { single: 200, cross: 200, total: 400 },
        minimums: { single: 100, cross: 100, total: 200 },
        repositoryVersion: "test-repo",
      };
    },
    version() {
      return "test-repo";
    },
  };
  const feedBuffer = {
    page() {
      return { records: [], nextCursor: null, hasMore: false };
    },
    needsRefill({ routeType }) {
      return routeType === "cross";
    },
  };
  const discovery = createRouteDiscovery({
    acceptedRepository,
    feedBuffer,
    searchService: { search: async () => ({ records: [], suggestions: [], diagnostics: {} }) },
    feedRefillWorker: {
      schedule(input) {
        scheduled.push(input);
        return { started: true, reused: false, promise: Promise.resolve({ ok: true }) };
      },
    },
  });
  const waited = [];
  const response = await discovery.discover(
    { mode: "feed", routeType: "cross", limit: 8, sessionId: "test-session" },
    { requestId: "verify-refill", waitUntil: (task) => waited.push(task) },
  );
  assert.equal(response.ok, true, "feed response should still succeed while refill runs in the background");
  assert.equal(response.pending, true, "low-water feed should report pending refill");
  assert.equal(scheduled.length, 1, "discovery should schedule a feed refill when cross pool is low");
  assert.equal(scheduled[0].request.routeType, "cross", "discovery should pass the current routeType to the refill worker");
  assert.equal(response.diagnostics.deferred[0].refillStarted, true, "diagnostics should expose that refill was started");
  assert.equal(waited.length, 1, "discovery should register the background refill with waitUntil when available");
  await waited[0];
}

console.log("Route feed refill worker verified: terminal jobs requeue, cross refill dedupes, and discovery schedules background production.");
