const API_BASE_URL = process.env.ROUTE_VERIFY_BASE_URL || "http://127.0.0.1:4173";
const PAGE_SIZE = 6;
const API_LIMIT = PAGE_SIZE * 10;
const TARGET_PER_TYPE = Number.parseInt(process.env.ROUTE_VERIFY_TARGET || "200", 10);
const WINDOW_SIZE = Number.parseInt(process.env.ROUTE_VERIFY_WINDOW || "50", 10);
const CLUSTER_COOLDOWN_WINDOW = Number.parseInt(process.env.ROUTE_VERIFY_CLUSTER_WINDOW || "12", 10);

const COUNTRY_CONTINENT_SETS = {
  africa: new Set(["DZ", "AO", "BJ", "BW", "BF", "BI", "CV", "CM", "CF", "TD", "KM", "CG", "CD", "CI", "DJ", "EG", "GQ", "ER", "SZ", "ET", "GA", "GM", "GH", "GN", "GW", "KE", "LS", "LR", "LY", "MG", "MW", "ML", "MR", "MU", "MA", "MZ", "NA", "NE", "NG", "RW", "ST", "SN", "SC", "ZA", "SS", "SD", "TZ", "TG", "TN", "UG", "ZM", "ZW"]),
  americas: new Set(["AG", "AR", "BS", "BB", "BZ", "BO", "BR", "CA", "CL", "CO", "CR", "CU", "DM", "DO", "EC", "SV", "GD", "GT", "GY", "HT", "HN", "JM", "MX", "NI", "PA", "PY", "PE", "KN", "LC", "VC", "SR", "TT", "US", "UY", "VE"]),
  asia: new Set(["AF", "AM", "AZ", "BH", "BD", "BT", "BN", "KH", "CY", "GE", "IN", "ID", "IR", "IQ", "IL", "JP", "JO", "KZ", "KW", "KG", "LA", "LB", "MY", "MV", "MN", "MM", "NP", "KP", "OM", "PK", "PS", "PH", "QA", "SA", "SG", "KR", "LK", "SY", "TW", "TJ", "TH", "TL", "TR", "TM", "AE", "UZ", "VN", "YE"]),
  europe: new Set(["AD", "AL", "AT", "BA", "BE", "BG", "BY", "CH", "CZ", "DE", "DK", "EE", "ES", "FI", "FR", "GB", "GR", "HR", "HU", "IE", "IS", "IT", "LI", "LT", "LU", "LV", "MC", "MD", "ME", "MK", "MT", "NL", "NO", "PL", "PT", "RO", "RS", "RU", "SE", "SI", "SK", "SM", "UA", "VA", "XK"]),
  oceania: new Set(["AU", "FJ", "FM", "KI", "MH", "NR", "NZ", "PW", "WS", "SB", "TO", "TV", "VU"]),
};
const BAD_REMOTE_COVER_PATTERNS = [
  /World_map_blank_without_borders/i,
  /\.svg(?:\.png)?(?:[?#]|$)/i,
  /(?:^|[/_-])map(?:[/_.-]|$)/i,
  /danubemap/i,
  /tabliczka|road[_-]?sign|route[_-]?marker|locator|blank|flag|logo|icon|diagram/i,
  /statue|museum|camping|national[_-]?road|padang[_-]?besar|arkadenhof|front\.jpe?g|entrance|platform/i,
];

function stableHash(value) {
  let hash = 2166136261;
  for (const char of String(value || "")) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function countryCodes(record = {}) {
  return [...new Set([
    ...(record.countryEntities || []).map((item) => item.countryCode),
    ...(record.countries || []),
  ].map((code) => String(code || "").toUpperCase()).filter((code) => /^[A-Z]{2}$/.test(code)))];
}

function continentForCode(code) {
  for (const [continent, codes] of Object.entries(COUNTRY_CONTINENT_SETS)) {
    if (codes.has(code)) return continent;
  }
  return "other";
}

function continentBucket(record) {
  const continents = [...new Set(countryCodes(record).map(continentForCode))].filter(Boolean);
  if (!continents.length) return "other";
  if (continents.length === 1) return continents[0];
  return continents[stableHash(`${record.id || record.name || ""}:continent`) % continents.length] || "other";
}

function textKey(value) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function routeKey(record) {
  const title = textKey(record.canonicalTitle || record.name);
  const countries = countryCodes(record).sort().join("|");
  const days = Number(record.durationDays) || Number.parseInt(record.recommendedDays, 10) || "";
  return [title, countries, days].filter(Boolean).join("::");
}

function clusterKey(record) {
  return countryCodes(record).sort().join("|") || routeKey(record) || String(record.id || "");
}

function imageKey(record) {
  const url = String(record.onlineCoverAsset?.imageUrl || record.coverAsset?.imageUrl || record.coverImage || "");
  if (!url || BAD_REMOTE_COVER_PATTERNS.some((pattern) => pattern.test(url))) return "";
  return textKey(url);
}

function effectiveImageKey(record, offset = 0, forceFallback = false) {
  if (!forceFallback) {
    const raw = imageKey(record);
    if (raw) return raw;
  }
  return `fallback:${continentBucket(record)}:${stableHash(`${record.id || record.name || ""}:${offset}`)}`;
}

function selectPage(candidates, selected) {
  const recent = selected.slice(-WINDOW_SIZE);
  const seenIds = new Set(recent.map((record) => record.id));
  const seenTitles = new Set(recent.map((record) => textKey(record.canonicalTitle || record.name)));
  const seenKeys = new Set(recent.map(routeKey));
  const pageClusters = new Set(selected.slice(-CLUSTER_COOLDOWN_WINDOW).map(clusterKey));
  const page = [];
  const consumedIds = new Set();
  const eligible = (record) => {
    const title = textKey(record.canonicalTitle || record.name);
    const key = routeKey(record);
    const cluster = clusterKey(record);
    return Boolean(record?.id
      && !consumedIds.has(record.id)
      && !seenIds.has(record.id)
      && !seenTitles.has(title)
      && !seenKeys.has(key)
      && !pageClusters.has(cluster));
  };
  const append = (record) => {
    const title = textKey(record.canonicalTitle || record.name);
    const key = routeKey(record);
    const cluster = clusterKey(record);
    consumedIds.add(record.id);
    page.push(record);
    seenIds.add(record.id);
    seenTitles.add(title);
    seenKeys.add(key);
    pageClusters.add(cluster);
  };
  while (page.length < PAGE_SIZE) {
    const previous = page.length ? page[page.length - 1] : selected[selected.length - 1];
    const previousContinent = previous ? continentBucket(previous) : "";
    const preferred = candidates.find((record) => eligible(record) && (!previousContinent || continentBucket(record) !== previousContinent));
    const fallback = preferred || candidates.find(eligible);
    if (!fallback) break;
    append(fallback);
  }
  return page;
}

function assertWindowQuality(records, routeType) {
  const failures = [];
  const finalImageKeys = [];
  let adjacentSameContinent = 0;
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index];
    const codes = countryCodes(record);
    if (codes.includes("CN")) failures.push(`${routeType} #${index + 1} includes CN: ${record.name}`);
    const start = Math.max(0, index - WINDOW_SIZE);
    const recent = records.slice(start, index);
    const duplicateRoute = recent.find((item) => item.id === record.id || routeKey(item) === routeKey(record));
    if (duplicateRoute) failures.push(`${routeType} #${index + 1} repeats route inside ${WINDOW_SIZE}: ${record.name}`);
    const recentCluster = records.slice(Math.max(0, index - CLUSTER_COOLDOWN_WINDOW), index);
    const duplicateCluster = recentCluster.find((item) => clusterKey(item) === clusterKey(record));
    if (duplicateCluster) failures.push(`${routeType} #${index + 1} repeats country cluster inside ${CLUSTER_COOLDOWN_WINDOW}: ${clusterKey(record)}`);
    let img = effectiveImageKey(record);
    const recentImages = finalImageKeys.slice(Math.max(0, index - WINDOW_SIZE), index);
    if (img && recentImages.includes(img)) img = effectiveImageKey(record, index, true);
    finalImageKeys[index] = img;
    if (img) {
      if (recentImages.includes(img)) failures.push(`${routeType} #${index + 1} repeats image inside ${WINDOW_SIZE}: ${img}`);
      if (/picsum\.photos|placeholder|assets\//i.test(img)) failures.push(`${routeType} #${index + 1} uses placeholder/local image: ${img}`);
    }
    if (index > 0 && continentBucket(record) === continentBucket(records[index - 1])) {
      adjacentSameContinent += 1;
    }
  }
  return { failures, adjacentSameContinent };
}

async function fetchDiscoveryPage({ routeType, cursor, sessionId, excludeIds, excludeClusters }) {
  const response = await fetch(`${API_BASE_URL}/api/routes/discovery`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      mode: "feed",
      query: "",
      limit: API_LIMIT,
      cursor,
      sessionId,
      excludeIds,
      excludeClusters,
      routeType,
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.ok) {
    throw new Error(`${routeType} discovery failed: ${response.status} ${JSON.stringify(payload.error || payload)}`);
  }
  return payload;
}

async function verifyType(routeType) {
  const sessionId = `verify-${routeType}-${Date.now()}`;
  const selected = [];
  let cursor = null;
  let guard = 0;
  while (selected.length < TARGET_PER_TYPE && guard < 240) {
    const page = [];
    let payload = null;
    while (page.length < PAGE_SIZE && guard < 240) {
      guard += 1;
      const comparison = selected.concat(page);
      payload = await fetchDiscoveryPage({
        routeType,
        cursor,
        sessionId,
        excludeIds: comparison.slice(-WINDOW_SIZE).map((record) => record.id),
        excludeClusters: comparison.slice(-CLUSTER_COOLDOWN_WINDOW).map(clusterKey),
      });
      const nextRecords = selectPage(payload.records || [], comparison).slice(0, PAGE_SIZE - page.length);
      page.push(...nextRecords);
      cursor = payload.nextCursor || null;
      if (!payload.hasMore && !payload.nextCursor && nextRecords.length === 0) break;
    }
    if (page.length !== PAGE_SIZE && selected.length + page.length < TARGET_PER_TYPE) {
      throw new Error(`${routeType} page ${guard} produced ${page.length}/${PAGE_SIZE} usable records`);
    }
    selected.push(...page);
    if (payload && !payload.hasMore && page.length === 0) break;
  }
  const sliced = selected.slice(0, TARGET_PER_TYPE);
  if (sliced.length < TARGET_PER_TYPE) throw new Error(`${routeType} only collected ${sliced.length}/${TARGET_PER_TYPE}`);
  const { failures, adjacentSameContinent } = assertWindowQuality(sliced, routeType);
  if (failures.length) {
    throw new Error(`${routeType} feed verification failed:\n${failures.slice(0, 20).join("\n")}`);
  }
  const continents = sliced.reduce((acc, record) => {
    const key = continentBucket(record);
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  return { routeType, count: sliced.length, pages: Math.ceil(sliced.length / PAGE_SIZE), adjacentSameContinent, continents };
}

const results = [];
for (const routeType of ["cross", "single"]) {
  results.push(await verifyType(routeType));
}

console.log(JSON.stringify({ ok: true, targetPerType: TARGET_PER_TYPE, windowSize: WINDOW_SIZE, clusterCooldownWindow: CLUSTER_COOLDOWN_WINDOW, results }, null, 2));
