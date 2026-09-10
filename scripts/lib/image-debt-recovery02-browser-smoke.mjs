import assert from "node:assert/strict";

// Runs in the existing isolated real-browser fixture, not against user storage.
export async function verifyRecovery02ProductImages({ client, sessionId, baseUrl }) {
  const evaluate = async (expression) => {
    const response = await client.send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true }, sessionId);
    assert(!response.exceptionDetails, JSON.stringify(response.exceptionDetails));
    return response.result?.value;
  };
  const waitFor = async (expression, label, timeout = 60000) => {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      const value = await evaluate(expression);
      if (value) return value;
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
    const diagnostic = await evaluate("({ url: location.href, summary: document.querySelector('[data-route-search-summary]')?.textContent, cards: document.querySelectorAll('[data-route-open]').length })");
    throw new Error(`recovery02-browser-timeout:${label}:${JSON.stringify(diagnostic)}`);
  };
  const navigate = async (page) => {
    await client.send("Page.navigate", { url: `${baseUrl}/travel-collection/${page}` }, sessionId);
    await waitFor("document.readyState === 'complete'", page);
  };
  const checkImages = async (label) => {
    await evaluate(`Promise.all([...document.images].map(async (image) => {
      image.loading = 'eager';
      await image.decode().catch(() => {});
    }))`);
    const images = await evaluate(`([...document.images].filter(image => image.getAttribute('src')).map(image => ({
      src: image.currentSrc || image.src, width: image.naturalWidth, height: image.naturalHeight,
    })))`);
    assert(images.length > 0, `${label}:images-not-rendered`);
    for (const image of images) {
      assert(image.width > 0 && image.height > 0, `${label}:broken:${image.src}`);
      assert(image.src.startsWith(baseUrl) || image.src.startsWith("data:"), `${label}:external:${image.src}`);
    }
    return images.length;
  };
  const queries = ["Oman Qatar 14 days", "Bishkek 7 days", "Pécs 7 days", "Punta Arenas 7 days", "Karlovy Vary 7 days"];
  const results = [];
  let newPoiImages = 0;
  let newCityImages = 0;
  for (const [index, query] of queries.entries()) {
    await navigate(`routes.html${index === 0 ? "?reset=empty" : ""}`);
    await waitFor("!!document.querySelector('[data-route-search]') && !!window.TravelState", "search-ready");
    await evaluate(`(() => {
      const input = document.querySelector('[data-route-search]');
      input.value = ${JSON.stringify(query)};
      input.dispatchEvent(new Event('input', { bubbles: true }));
    })()`);
    await waitFor(`typeof feedState !== 'undefined' && feedState.query === ${JSON.stringify(query)} && feedState.searchResolved
      && document.querySelector('[data-route-open]')
      && document.querySelector('[data-route-search-summary]')?.textContent?.includes('找到')`, "search-result");
    const searchImages = await checkImages("search-cards");
    await evaluate("document.querySelector('[data-route-open]').click()");
    await waitFor("location.pathname.endsWith('/route-detail.html') && typeof activeRouteRecord !== 'undefined' && !!activeRouteRecord", "route-detail");
    await new Promise((resolve) => setTimeout(resolve, 1000));
    await checkImages("route-detail");
    const detail = await evaluate(`(() => {
      const coverage = window.RouteV2ImageCoverage;
      const destinations = uniqueDestinations(activeRouteRecord);
      return {
        id: activeRouteRecord.id,
        cities: (activeRouteRecord.destinationEntities || []).filter(d => d.entityTypeName !== 'poi'),
        countries: activeRouteRecord.countryEntities,
        cards: [...document.querySelectorAll('[data-route-destination]')].map(card => {
          const destination = destinations.find(d => (d.wikidataId || d.name) === card.dataset.routeDestination);
          const entityId = destination?.entityId || destination?.knowledgeEntityId;
          const entry = coverage.poiByEntityId[entityId] || coverage.cityByEntityId[entityId];
          return { entityId, qid: destination?.wikidataId, type: entry?.semanticScope,
            src: new URL(card.querySelector('img').currentSrc, location.href).pathname,
            expected: new URL(entry?.status === 'imageReady' ? entry.assetPath : coverage.fallbackPolicy.city, location.href).pathname };
        }),
      };
    })()`);
    assert(detail.cities.length > 0);
    for (const card of detail.cards) {
      assert.equal(card.src, card.expected, `exact-destination-image:${card.qid}`);
      if (card.src.includes("/recovery02/")) {
        if (card.type === "exact-poi") newPoiImages += 1;
        if (card.type === "exact-city") newCityImages += 1;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 5000));
    assert.equal(await evaluate("activeRouteRecord?.id"), detail.id, "detail-stability");
    let tripFootprint = null;
    if (index === 0) {
      await evaluate("document.querySelector('[data-route-add-trip]').click()");
      await waitFor("location.pathname.endsWith('/trips.html') && !!document.querySelector('[data-trip-open]')", "add-trip");
      const tripImages = await checkImages("trip-list");
      const tripState = await evaluate(`(() => {
        const state = window.TravelState.readTravelState();
        const trip = state.trips.find(t => t.routeSnapshot?.id === ${JSON.stringify(detail.id)});
        return { trip, cities: trip.cityIds.map(id => state.citiesById[id]) };
      })()`);
      assert.equal(tripState.trip.cityIds.length, detail.cities.length, "route-trip-city-count");
      assert.equal(new Set(tripState.trip.cityIds).size, detail.cities.length, "duplicate-city");
      assert.deepEqual(tripState.trip.countryIds.slice().sort(), ["OM", "QA"]);
      for (const city of tripState.cities) {
        assert(city.entityId && city.wikidataId, "knowledge-city-identity");
        assert(detail.cities.some(d => d.wikidataId === city.wikidataId), "route-trip-QID");
      }
      const tripId = JSON.stringify(tripState.trip.id);
      await evaluate(`document.querySelector('[data-trip-open="' + ${tripId} + '"]').click()`);
      await waitFor("!!document.querySelector('[data-complete-trip]')", "complete-button");
      await evaluate("document.querySelector('[data-complete-trip]').click()");
      assert.equal(await evaluate(`window.TravelState.readTravelState().trips.find(t => t.id === ${tripId}).status`), "completed");
      await navigate("footprint.html");
      const footprint = await waitFor(`(() => {
        const country = document.querySelector('[data-footprint-country-count]')?.textContent;
        const city = document.querySelector('[data-footprint-city-count]')?.textContent;
        return country && city ? { country: Number(country), city: Number(city) } : null;
      })()`, "footprint");
      assert.equal(footprint.country, 2);
      assert.equal(footprint.city, detail.cities.length);
      const footprintImages = await checkImages("footprint");
      tripFootprint = { ...footprint, duplicateCity: 0, knowledgeIdentity: true, tripImages, footprintImages };
    }
    results.push({ query, searchImages, detailImages: detail.cards.length, cards: detail.cards, tripFootprint });
  }
  for (const qid of ["Q515919", "Q6115326", "Q1266609"]) {
    assert(results.some(r => r.cards.some(c => c.qid === qid && c.type === "exact-poi" && c.src === c.expected && c.src.includes("/recovery02/pois/"))), "resumed-poi-must-render:" + qid);
  }
  assert(newCityImages > 0, "browser-must-consume-recovered-city");
  assert(newPoiImages > 0, "browser-must-consume-recovered-poi");
  return { status: "PASS", results, newCityImages, newPoiImages, brokenImages: 0, wrongSemanticImages: 0 };
}
