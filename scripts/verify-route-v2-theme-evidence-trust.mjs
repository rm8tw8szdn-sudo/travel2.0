import assert from "node:assert/strict";

import {
  finalizeRouteResult,
  parseSearchIntent,
  validateFallbackRouteAgainstIntent,
} from "../src/lib/routes/index.mjs";

function acceptedRoute(overrides = {}) {
  return {
    id: "accepted-turkey-classic",
    name: "Turkey classic first trip",
    canonicalTitle: "Turkey classic first trip",
    countries: ["TR"],
    countryCodes: ["TR"],
    countryEntities: [{ countryCode: "TR", name: "Turkey" }],
    destinations: ["Istanbul", "Ankara"],
    destinationEntities: [
      { entityId: "Q406", name: "Istanbul", countryCode: "TR" },
      { entityId: "Q3640", name: "Ankara", countryCode: "TR" },
    ],
    durationDays: 7,
    recommendedDays: "7 days",
    repositoryStatus: "accepted",
    enrichmentStatus: "mediaReady",
    themes: ["classic-first-trip"],
    tags: ["classic"],
    travelStyle: "classic-first-trip",
    ...overrides,
  };
}

function acceptedResolver(records) {
  const byId = new Map(records.map((record) => [record.id, structuredClone(record)]));
  return (routeId) => {
    const record = byId.get(String(routeId || ""));
    return record ? structuredClone(record) : null;
  };
}

function assertThemeRejected({ route, query, resolver, label }) {
  const intent = parseSearchIntent(query, { acceptedRoutes: [route] });
  assert.equal(intent.parseSuccess, true, `${label}: intent must parse`);
  const result = finalizeRouteResult(route, intent, {
    source: "theme-evidence-trust-verifier",
    claimedSuccess: true,
    acceptedRouteResolver: resolver,
  });
  assert.equal(result.matched, false, `${label}: mutable result metadata must not certify a theme`);
  assert(
    result.validation.reasonCodes.includes("explicit-theme-mismatch"),
    `${label}: explicit theme mismatch must be reported`,
  );
  assert.deepEqual(
    result.validation.themeCompatibility?.trustedEvidenceSources || [],
    ["acceptedasset"],
    `${label}: only the immutable original may be reported as trusted evidence`,
  );
  assert.equal(result.validation.themeCompatibility?.evidenceMatch, false);
  return result.validation.reasonCodes;
}

const originalClassic = acceptedRoute();
const resolveClassic = acceptedResolver([originalClassic]);
const injectedThemes = [
  ["Turkey island vacation 7 days", "island vacation"],
  ["Turkey hiking 7 days", "hiking"],
  ["Turkey honeymoon 7 days", "honeymoon"],
];

const rejected = injectedThemes.map(([query, injectedTheme]) => {
  const mutableCopy = acceptedRoute({
    themes: ["classic-first-trip", injectedTheme],
    tags: ["classic", injectedTheme],
    travelStyle: injectedTheme,
    themeMetadataProvenance: { sourceType: "request-derived" },
    themeEvidence: [{
      sourceType: "accepted-asset",
      sourceRef: originalClassic.id,
      theme: injectedTheme,
    }],
  });
  const reasonCodes = assertThemeRejected({
    route: mutableCopy,
    query,
    resolver: resolveClassic,
    label: injectedTheme,
  });
  const fallback = validateFallbackRouteAgainstIntent(mutableCopy, parseSearchIntent(query, {
    acceptedRoutes: [originalClassic],
  }), {
    acceptedRouteResolver: resolveClassic,
  });
  assert.equal(fallback.matched, false, `${injectedTheme}: fallback must use the same trusted evidence rule`);
  assert(fallback.reasonCodes.includes("explicit-theme-mismatch"));
  return {
    query,
    reasonCodes,
    fallbackRejected: true,
  };
});

const originalRoadTrip = acceptedRoute({
  id: "accepted-turkey-road-trip",
  name: "Turkey independent road trip",
  canonicalTitle: "Turkey independent road trip",
  themes: ["road-trip"],
  tags: ["self-drive"],
  travelStyle: "road-trip",
  routeTopology: { type: "road-trip" },
});
const roadTripIntent = parseSearchIntent("Turkey road trip 7 days", {
  acceptedRoutes: [originalRoadTrip],
});
const roadTrip = finalizeRouteResult(structuredClone(originalRoadTrip), roadTripIntent, {
  source: "theme-evidence-trust-verifier",
  claimedSuccess: true,
  acceptedRouteResolver: acceptedResolver([originalRoadTrip]),
});
assert.equal(roadTrip.matched, true, "an independently themed Accepted route must still pass");
assert.deepEqual(roadTrip.validation.themeCompatibility?.trustedEvidenceSources, ["acceptedasset"]);
assert.deepEqual(roadTrip.validation.themeCompatibility?.trustedEvidenceRefs, [originalRoadTrip.id]);

const missingOriginal = finalizeRouteResult(structuredClone(originalRoadTrip), roadTripIntent, {
  source: "theme-evidence-trust-verifier",
  claimedSuccess: true,
  acceptedRouteResolver: () => null,
});
assert.equal(missingOriginal.matched, false, "missing immutable Accepted evidence must fail closed");
assert(missingOriginal.validation.reasonCodes.includes("explicit-theme-mismatch"));

console.log(JSON.stringify({
  verifier: "route-v2-theme-evidence-trust",
  status: "PASS",
  rejected,
  accepted: {
    routeId: originalRoadTrip.id,
    trustedEvidenceSources: roadTrip.validation.themeCompatibility?.trustedEvidenceSources,
  },
  missingOriginalFailClosed: true,
}, null, 2));
