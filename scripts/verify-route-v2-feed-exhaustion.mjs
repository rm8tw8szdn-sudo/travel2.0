import assert from "node:assert/strict";
import { createAcceptedRouteRepository } from "../src/lib/routes/accepted-repository.mjs";
import { createRouteDiscovery } from "../src/lib/routes/discovery.mjs";
import { decodeDiscoveryCursor, encodeDiscoveryCursor } from "../src/lib/routes/cursor.mjs";

const ROUTE_COUNT = 357;
const PAGE_SIZE = 6;

function chineseSuffix(index) {
  return `${String.fromCodePoint(0x4e00 + Math.floor(index / 300))}${String.fromCodePoint(0x5200 + (index % 300))}`;
}

function createStrictFeedRecord(index) {
  const id = `strict-cross-${String(index).padStart(3, "0")}`;
  const suffix = chineseSuffix(index);
  const countryCodes = index % 3 === 0 ? ["NL", "BE"] : ["CZ", "PL"];
  const countryNames = countryCodes[0] === "NL" ? ["荷兰", "比利时"] : ["捷克", "波兰"];
  const destinations = [
    { wikidataId: `Q${100_000 + index * 3}`, name: `${suffix}古城`, countryCode: countryCodes[0] },
    { wikidataId: `Q${100_001 + index * 3}`, name: `${suffix}河畔`, countryCode: countryCodes[1] },
    { wikidataId: `Q${100_002 + index * 3}`, name: `${suffix}广场`, countryCode: countryCodes[0] },
  ];
  return {
    id,
    name: `${suffix}跨国文化行程`,
    canonicalTitle: `${suffix}跨国文化行程`,
    sourceTitle: `Strict cross route ${index}`,
    summary: "串联历史古城、河畔街区与地方文化体验，形成节奏清晰且适合深度游览的跨国路线。",
    recommendationText: "这条路线兼顾建筑、美食与日常生活，各站停留充足并为旅行者保留灵活调整空间。",
    countryEntities: countryCodes.map((countryCode, countryIndex) => ({
      wikidataId: `country-${countryCode}`,
      countryCode,
      name: countryNames[countryIndex],
    })),
    destinationEntities: destinations,
    countries: countryNames,
    destinations: destinations.map((destination) => destination.name),
    recommendedDays: "8天",
    durationDays: 8,
    bestMonths: ["4月", "10月"],
    themes: ["文化旅行"],
    tags: ["跨国路线"],
    highlights: ["历史街区", "河畔漫步", "地方文化"],
    coverAsset: {
      provider: "wikimedia-commons",
      assetId: `${id}-cover.jpg`,
      sourceUrl: `https://commons.wikimedia.org/wiki/File:${id}-cover.jpg`,
      imageUrl: `https://upload.wikimedia.org/${id}-cover.jpg`,
      author: "Verifier",
      license: "CC BY-SA 4.0",
    },
    feedReady: true,
    onlineCoverAsset: {
      provider: "wikimedia-commons",
      assetId: `${id}-verified.jpg`,
      sourceUrl: `https://commons.wikimedia.org/wiki/File:${id}-verified.jpg`,
      imageUrl: `https://upload.wikimedia.org/${id}-verified.jpg`,
      author: "Verifier",
      license: "CC BY-SA 4.0",
      imageCountryCodes: countryCodes,
      status: "verified",
      semanticStatus: "verified",
      coverStatus: "verified",
      imageDedupeKey: `${id}-verified`,
    },
    source: { name: "Verifier", url: `https://example.com/routes/${id}` },
    enrichmentStatus: "mediaReady",
    contentQualityStatus: "accepted",
    classification: "cross",
    sourceType: "planner-designed",
    acceptedAt: new Date(Date.UTC(2026, 0, 1 + (index % 28))).toISOString(),
  };
}

const repository = createAcceptedRouteRepository();
const sourceRecords = Array.from({ length: ROUTE_COUNT }, (_, index) => createStrictFeedRecord(index));
for (const record of sourceRecords) {
  const result = repository.upsert(record);
  assert.equal(result.accepted, true, `${record.id} should enter the in-memory accepted repository: ${result.reasons?.join(", ") || ""}`);
}
const expectedIds = new Set(sourceRecords.map((record) => record.id));

function consumeSession(sessionId) {
  const pages = [];
  const ids = [];
  let cursor = null;
  let emptyPages = 0;
  for (let guard = 0; guard < ROUTE_COUNT + 10; guard += 1) {
    const page = repository.list({
      limit: PAGE_SIZE,
      cursor,
      routeType: "cross",
      sessionId,
    });
    pages.push(page);
    ids.push(...page.records.map((record) => record.id));
    if (!page.records.length) emptyPages += 1;
    assert.equal(page.returnedCount, page.records.length, "returnedCount must equal records.length");
    assert.equal(page.remainingCount, ROUTE_COUNT - ids.length, "remainingCount must match the unconsumed strict pool");
    if (!page.hasMore) {
      assert.equal(page.nextCursor, null, "terminal page must clear nextCursor");
      return { ids, pages, emptyPages };
    }
    assert.ok(page.nextCursor, "a non-terminal page must provide nextCursor");
    cursor = page.nextCursor;
  }
  assert.fail(`session ${sessionId} did not terminate`);
}

function continueSession({ repository: targetRepository, sessionId, cursor, firstIds = [] }) {
  const ids = [...firstIds];
  const pages = [];
  let nextCursor = cursor;
  for (let guard = 0; guard < ROUTE_COUNT + 10; guard += 1) {
    const page = targetRepository.list({
      limit: PAGE_SIZE,
      cursor: nextCursor,
      routeType: "cross",
      sessionId,
    });
    pages.push(page);
    ids.push(...page.records.map((record) => record.id));
    assert.equal(page.returnedCount, page.records.length);
    if (!page.hasMore) {
      assert.equal(page.nextCursor, null);
      return { ids, pages };
    }
    assert.ok(page.nextCursor);
    nextCursor = page.nextCursor;
  }
  assert.fail(`session ${sessionId} did not terminate after continuation`);
}

const sessionAFirst = consumeSession("exhaustion-session-a");
const sessionAReplay = consumeSession("exhaustion-session-a");
const sessionB = consumeSession("exhaustion-session-b");

for (const result of [sessionAFirst, sessionAReplay, sessionB]) {
  assert.equal(result.ids.length, ROUTE_COUNT);
  assert.equal(new Set(result.ids).size, ROUTE_COUNT);
  assert.deepEqual(new Set(result.ids), expectedIds);
  assert.equal(result.pages.length, 60);
  assert.ok(result.pages.slice(0, -1).every((page) => page.records.length === PAGE_SIZE));
  const terminal = result.pages.at(-1);
  assert.equal(terminal.records.length, 3);
  assert.equal(terminal.returnedCount, 3);
  assert.equal(terminal.remainingCount, 0);
  assert.equal(terminal.hasMore, false);
  assert.equal(terminal.nextCursor, null);
  assert.equal(result.emptyPages, 0);
}

assert.deepEqual(sessionAFirst.ids, sessionAReplay.ids, "the same session must replay the exact order");
assert.notDeepEqual(sessionAFirst.ids, sessionB.ids, "different sessions should normally use different stable orders");

const mutationSessionId = "exhaustion-session-mutation";
const mutationBaseline = consumeSession(mutationSessionId);
const mutationFirstPage = repository.list({
  limit: PAGE_SIZE,
  routeType: "cross",
  sessionId: mutationSessionId,
});
const mutationTargetId = mutationBaseline.ids.at(-1);
const mutationTarget = repository.get(mutationTargetId);
repository.mark(mutationTargetId, {
  acceptedAt: "2035-01-01T00:00:00.000Z",
  onlineCoverAsset: {
    ...mutationTarget.onlineCoverAsset,
    matchEvidence: ["updated-after-first-page"],
  },
});
const mutationContinuation = continueSession({
  repository,
  sessionId: mutationSessionId,
  cursor: mutationFirstPage.nextCursor,
  firstIds: mutationFirstPage.records.map((record) => record.id),
});
assert.equal(mutationContinuation.ids.length, ROUTE_COUNT, "field updates must not change the session route count");
assert.equal(new Set(mutationContinuation.ids).size, ROUTE_COUNT, "field updates must not replay or skip route IDs");
assert.deepEqual(new Set(mutationContinuation.ids), expectedIds, "all initially eligible IDs must survive a field update");
repository.mark(mutationTargetId, {
  acceptedAt: mutationTarget.acceptedAt,
  onlineCoverAsset: mutationTarget.onlineCoverAsset,
});

const insertionSessionId = "exhaustion-session-insertion";
const insertionFirstPage = repository.list({
  limit: PAGE_SIZE,
  routeType: "cross",
  sessionId: insertionSessionId,
});
const insertedRecord = createStrictFeedRecord(ROUTE_COUNT);
assert.equal(repository.upsert(insertedRecord).accepted, true);
const insertionContinuation = continueSession({
  repository,
  sessionId: insertionSessionId,
  cursor: insertionFirstPage.nextCursor,
  firstIds: insertionFirstPage.records.map((record) => record.id),
});
const oldIdCounts = new Map([...expectedIds].map((id) => [id, insertionContinuation.ids.filter((item) => item === id).length]));
assert.ok([...oldIdCounts.values()].every((count) => count === 1), "adding a route must not replay or lose any original route ID");
assert.equal(new Set(insertionContinuation.ids).size, insertionContinuation.ids.length, "insertion continuation must remain duplicate-free");

const replayFirstPage = repository.list({
  limit: PAGE_SIZE,
  routeType: "cross",
  sessionId: "cursor-replay-session",
});
const replayPageA = repository.list({
  limit: PAGE_SIZE,
  cursor: replayFirstPage.nextCursor,
  routeType: "cross",
  sessionId: "cursor-replay-session",
});
const replayPageB = repository.list({
  limit: PAGE_SIZE,
  cursor: replayFirstPage.nextCursor,
  routeType: "cross",
  sessionId: "cursor-replay-session",
});
assert.deepEqual(replayPageA, replayPageB, "replaying the same cursor must return the same page and metadata");

for (const mismatchRequest of [
  { sessionId: "cursor-replay-other-session", routeType: "cross" },
  { sessionId: "cursor-replay-session", routeType: "" },
]) {
  const mismatch = repository.list({
    limit: PAGE_SIZE,
    cursor: replayFirstPage.nextCursor,
    ...mismatchRequest,
  });
  assert.deepEqual(mismatch.records, [], "a cursor identity mismatch must fail closed instead of replaying from page one");
  assert.equal(mismatch.returnedCount, 0);
  assert.equal(mismatch.remainingCount, 0);
  assert.equal(mismatch.hasMore, false);
  assert.equal(mismatch.nextCursor, null);
  assert.equal(mismatch.paginationStatus, "cursor-mismatch");
}

const validCursorPayload = decodeDiscoveryCursor(replayFirstPage.nextCursor);
for (const malformedAnchor of [
  { randomRank: String(validCursorPayload.randomRank), id: validCursorPayload.id },
  { randomRank: 1.5, id: validCursorPayload.id },
  { randomRank: -1, id: validCursorPayload.id },
  { randomRank: 0x1_0000_0000, id: validCursorPayload.id },
  { randomRank: validCursorPayload.randomRank, id: "   " },
]) {
  const malformedCursor = encodeDiscoveryCursor({
    ...validCursorPayload,
    ...malformedAnchor,
  });
  const malformedResult = repository.list({
    limit: PAGE_SIZE,
    cursor: malformedCursor,
    routeType: "cross",
    sessionId: "cursor-replay-session",
  });
  assert.deepEqual(malformedResult.records, [], "a malformed v3 anchor must fail closed");
  assert.equal(malformedResult.returnedCount, 0);
  assert.equal(malformedResult.remainingCount, 0);
  assert.equal(malformedResult.hasMore, false);
  assert.equal(malformedResult.nextCursor, null);
  assert.equal(malformedResult.paginationStatus, "cursor-mismatch");
}

const tamperedRankCursor = encodeDiscoveryCursor({
  ...validCursorPayload,
  randomRank: (validCursorPayload.randomRank + 1) >>> 0,
});
const tamperedRankResult = repository.list({
  limit: PAGE_SIZE,
  cursor: tamperedRankCursor,
  routeType: "cross",
  sessionId: "cursor-replay-session",
});
assert.deepEqual(tamperedRankResult.records, [], "a cursor rank that does not match its session and route ID must fail closed");
assert.equal(tamperedRankResult.returnedCount, 0);
assert.equal(tamperedRankResult.remainingCount, 0);
assert.equal(tamperedRankResult.hasMore, false);
assert.equal(tamperedRankResult.nextCursor, null);
assert.equal(tamperedRankResult.paginationStatus, "cursor-mismatch");

const terminalPage = {
  records: [{ id: "last-route", name: "最后路线" }],
  nextCursor: null,
  hasMore: false,
  returnedCount: 1,
  remainingCount: 0,
};
let discoveryPage = terminalPage;
const discovery = createRouteDiscovery({
  acceptedRepository: {
    status: () => ({ meetsTarget: false, shortages: [], repositoryVersion: "test" }),
    version: () => "test",
    list: () => terminalPage,
  },
  feedBuffer: {
    page: () => discoveryPage,
    needsRefill: () => true,
    status: () => ({ meetsTarget: false, shortages: [], repositoryVersion: "test" }),
  },
  searchService: { search: async () => ({ records: [], nextCursor: null, hasMore: false }) },
  requestId: () => "feed-exhaustion-test",
});
const discoveryTerminal = await discovery.discover({
  mode: "feed",
  limit: PAGE_SIZE,
  sessionId: "discovery-terminal",
  routeType: "cross",
});
assert.equal(discoveryTerminal.hasMore, false, "refill demand must not override repository exhaustion");
assert.equal(discoveryTerminal.nextCursor, null);
assert.equal(discoveryTerminal.returnedCount, 1);
assert.equal(discoveryTerminal.remainingCount, 0);
assert.equal(discoveryTerminal.pending, true, "refill work may remain independently pending");

discoveryPage = {
  records: [],
  nextCursor: null,
  hasMore: true,
  returnedCount: 0,
  remainingCount: 0,
  paginationStatus: "inconsistent-test-page",
};
const normalizedInconsistentPage = await discovery.discover({
  mode: "feed",
  limit: PAGE_SIZE,
  sessionId: "discovery-inconsistent",
  routeType: "cross",
});
assert.equal(normalizedInconsistentPage.hasMore, false, "Discovery must not expose hasMore=true without a cursor");
assert.equal(normalizedInconsistentPage.nextCursor, null);

console.log(JSON.stringify({
  verifier: "route-v2-feed-exhaustion",
  strictRoutes: ROUTE_COUNT,
  pages: sessionAFirst.pages.length,
  terminalBatch: sessionAFirst.pages.at(-1).returnedCount,
  sameSessionStable: true,
  differentSessionOrder: true,
  fieldMutationStable: true,
  insertionSafe: true,
  cursorReplayStable: true,
  cursorMismatchFailsClosed: true,
  malformedCursorFailsClosed: true,
  tamperedRankFailsClosed: true,
  discoveryTerminal: {
    returnedCount: discoveryTerminal.returnedCount,
    remainingCount: discoveryTerminal.remainingCount,
    hasMore: discoveryTerminal.hasMore,
    nextCursor: discoveryTerminal.nextCursor,
    pending: discoveryTerminal.pending,
  },
}, null, 2));
