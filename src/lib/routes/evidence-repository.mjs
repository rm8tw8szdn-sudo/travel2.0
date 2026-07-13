import fs from "node:fs";
import path from "node:path";
import { assetIdentity } from "./media-service.mjs";

function clean(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function clone(value) {
  return structuredClone(value);
}

function readStore(storagePath) {
  if (!storagePath || !fs.existsSync(storagePath)) return [];
  const payload = JSON.parse(fs.readFileSync(storagePath, "utf8"));
  return Array.isArray(payload?.evidence) ? payload.evidence : [];
}

function writeStore(storagePath, evidence) {
  if (!storagePath) return;
  fs.mkdirSync(path.dirname(storagePath), { recursive: true });
  const tempPath = `${storagePath}.${process.pid}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify({ schemaVersion: 2, evidence }, null, 2));
  fs.renameSync(tempPath, storagePath);
}

function sourceRef(record) {
  return {
    provider: clean(record?.source?.name || "Accepted Repository"),
    sourceUrl: clean(record?.source?.url),
    sourceRouteId: clean(record?.id),
    sourceTitle: clean(record?.sourceTitle || record?.name),
  };
}

function evidenceId(parts) {
  return parts.map(clean).filter(Boolean).join(":").toLocaleLowerCase("en-US");
}

function subjectId(value) {
  if (!value || typeof value !== "object") return "";
  return clean(value.entityId || value.wikidataId || value.id || value.name);
}

function sourceUrl(value) {
  return clean(value?.sourceUrl || value?.url);
}

function normalizedProvenance(input) {
  const provenance = input?.provenance && typeof input.provenance === "object" ? input.provenance : {};
  return {
    providerId: clean(provenance.providerId || input.provider),
    sourceUrl: sourceUrl(provenance) || sourceUrl(input),
    sourceTitle: clean(provenance.sourceTitle || input.sourceTitle),
    sourceSnippet: clean(provenance.sourceSnippet || input.sourceSnippet),
    sourceLicense: clean(provenance.sourceLicense || input.sourceLicense),
    extractionMethod: clean(provenance.extractionMethod || input.extractionMethod || "source-derived"),
    searchQuery: clean(provenance.searchQuery || input.searchQuery),
    searchResultRank: provenance.searchResultRank ?? input.searchResultRank ?? null,
    sourceScore: provenance.sourceScore ?? input.sourceScore ?? null,
    retrievedAt: clean(provenance.retrievedAt || input.retrievedAt),
  };
}

function legacyType(kind) {
  return ({
    country: "place-entity",
    destination: "place-entity",
    theme: "theme-fit",
    season: "destination-season",
    duration: "duration",
    transport: "transport-mode",
    image: "destination-image",
    "route-segment": "transport-connection",
  })[kind] || kind;
}

function verifiedEvidence(input) {
  const kind = clean(input.kind || input.evidenceType);
  const evidenceType = clean(input.evidenceType || legacyType(kind));
  const id = clean(input.evidenceId || input.id);
  const provenance = normalizedProvenance(input);
  const verifiedAt = clean(input.verifiedAt) || new Date().toISOString();
  const confidence = Number(input.confidence ?? (input.verified === true ? 0.8 : 0));
  const status = clean(input.status || (input.verified === true ? "verified" : ""));
  if (!id || !kind || !evidenceType || status !== "verified" || !Number.isFinite(confidence) || confidence <= 0) return null;
  if (!provenance.sourceUrl || provenance.extractionMethod === "ai-generated") return null;
  if (provenance.providerId === "web-search" && (!input.evidenceHash || !provenance.sourceTitle || !provenance.sourceSnippet || !provenance.retrievedAt)) return null;
  const subject = input.subject && typeof input.subject === "object"
    ? clone(input.subject)
    : {
      entityId: input.entityId || input.countryCode || input.assetId || input.fromEntityId || "",
      name: input.name || input.fromName || "",
    };
  const object = input.object && typeof input.object === "object"
    ? clone(input.object)
    : {
      entityId: input.toEntityId || "",
      name: input.toName || "",
    };
  return {
    ...input,
    id,
    evidenceId: id,
    kind,
    evidenceType,
    subject,
    object,
    relation: clean(input.relation),
    value: input.value ?? input.name ?? "",
    qualifiers: input.qualifiers && typeof input.qualifiers === "object" ? clone(input.qualifiers) : {},
    provenance,
    confidence,
    verifiedAt,
    retrievedAt: clean(input.retrievedAt || provenance.retrievedAt),
    evidenceHash: clean(input.evidenceHash),
    status,
    provider: clean(input.provider || provenance.providerId),
    sourceUrl: provenance.sourceUrl,
    sourceRouteId: clean(input.sourceRouteId),
    verified: true,
  };
}

function routeTransportModes(record) {
  const text = [record?.name, record?.summary, ...(record?.themes || [])].join(" ");
  return [
    /铁路|火车|rail|train/i.test(text) ? "铁路" : "",
    /公路|自驾|road|highway|drive/i.test(text) ? "公路" : "",
    /徒步|trek|walk|hiking/i.test(text) ? "徒步" : "",
    /骑行|cycle|bike/i.test(text) ? "骑行" : "",
    /邮轮|轮渡|渡轮|ferry|cruise/i.test(text) ? "轮渡" : "",
  ].filter(Boolean);
}

function numberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function coordinates(entity) {
  const latitude = numberOrNull(entity?.latitude ?? entity?.lat);
  const longitude = numberOrNull(entity?.longitude ?? entity?.lon);
  return latitude == null || longitude == null ? null : { latitude, longitude };
}

function radians(value) {
  return (value * Math.PI) / 180;
}

function distanceKm(left, right) {
  const from = coordinates(left);
  const to = coordinates(right);
  if (!from || !to) return null;
  const deltaLatitude = radians(to.latitude - from.latitude);
  const deltaLongitude = radians(to.longitude - from.longitude);
  const a = Math.sin(deltaLatitude / 2) ** 2
    + Math.cos(radians(from.latitude)) * Math.cos(radians(to.latitude)) * Math.sin(deltaLongitude / 2) ** 2;
  return Math.round(6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

function entityIdentity(entity) {
  return clean(entity?.wikidataId || entity?.entityId || entity?.name);
}

export function evidenceFromRouteRecord(record) {
  if (!record?.id) return [];
  if (record.sourceType === "evidence-composed") return [];
  const ref = sourceRef(record);
  const evidence = [];
  for (const country of record.countryEntities || []) {
    evidence.push({
      id: evidenceId(["country", country.countryCode || country.wikidataId, record.id]),
      kind: "country",
      entityId: country.wikidataId || "",
      countryCode: country.countryCode || "",
      name: country.name || "",
      evidenceType: "place-entity",
      subject: { entityId: country.wikidataId || country.countryCode || "", name: country.name || "", countryCode: country.countryCode || "" },
      relation: "is-place",
      value: "country",
      confidence: 0.9,
      verifiedAt: new Date().toISOString(),
      status: "verified",
      ...ref,
      verified: true,
    });
  }
  for (const destination of record.destinationEntities || []) {
    evidence.push({
      id: evidenceId(["destination", destination.wikidataId || destination.name, record.id]),
      kind: "destination",
      entityId: destination.wikidataId || "",
      countryCode: destination.countryCode || "",
      name: destination.name || "",
      sourceTitle: destination.sourceTitle || "",
      entityTypeName: destination.entityTypeName || "",
      latitude: coordinates(destination)?.latitude ?? null,
      longitude: coordinates(destination)?.longitude ?? null,
      evidenceType: "place-entity",
      subject: { entityId: destination.wikidataId || destination.name || "", name: destination.name || "", countryCode: destination.countryCode || "" },
      relation: "is-place",
      value: "destination",
      confidence: 0.9,
      verifiedAt: new Date().toISOString(),
      status: "verified",
      ...ref,
      verified: true,
    });
    if (destination.entityTypeName) {
      evidence.push({
        id: evidenceId(["destination-level", destination.wikidataId || destination.name, record.id]),
        kind: "destination-level",
        evidenceType: "destination-level",
        entityId: destination.wikidataId || "",
        countryCode: destination.countryCode || "",
        name: destination.name || "",
        subject: { entityId: destination.wikidataId || destination.name || "", name: destination.name || "" },
        relation: "has-destination-level",
        value: destination.entityTypeName,
        confidence: 0.85,
        verifiedAt: new Date().toISOString(),
        status: "verified",
        ...ref,
        verified: true,
      });
    }
    if (destination.countryCode) {
      evidence.push({
        id: evidenceId(["containment", destination.wikidataId || destination.name, destination.countryCode, record.id]),
        kind: "containment",
        evidenceType: "containment",
        entityId: destination.wikidataId || "",
        countryCode: destination.countryCode,
        name: destination.name || "",
        subject: { entityId: destination.wikidataId || destination.name || "", name: destination.name || "" },
        object: { entityId: destination.countryCode, name: destination.countryCode },
        relation: "contained-by",
        value: destination.countryCode,
        confidence: 0.85,
        verifiedAt: new Date().toISOString(),
        status: "verified",
        ...ref,
        verified: true,
      });
    }
  }
  if ((record.destinationEntities || []).length >= 2) {
    evidence.push({
      id: evidenceId(["region-cluster", record.id]),
      kind: "region-cluster",
      evidenceType: "region-cluster",
      name: record.name || record.sourceTitle || record.id,
      subject: { entityId: clean(record.id), name: record.name || record.sourceTitle || "" },
      relation: "groups-destinations",
      value: (record.destinationEntities || []).map((item) => item.name).filter(Boolean),
      qualifiers: {
        memberEntityIds: (record.destinationEntities || []).map((item) => item.wikidataId || item.name).filter(Boolean),
        clusterType: "source-route-region",
      },
      confidence: 0.72,
      verifiedAt: new Date().toISOString(),
      status: "verified",
      ...ref,
      verified: true,
    });
  }
  const transportModes = routeTransportModes(record);
  for (let index = 0; index < (record.destinationEntities || []).length - 1; index += 1) {
    const from = record.destinationEntities[index];
    const to = record.destinationEntities[index + 1];
    const fromIdentity = entityIdentity(from);
    const toIdentity = entityIdentity(to);
    if (!fromIdentity || !toIdentity || fromIdentity === toIdentity) continue;
    evidence.push({
      id: evidenceId(["route-segment", fromIdentity, toIdentity, record.id]),
      kind: "route-segment",
      name: `${from.name || fromIdentity} → ${to.name || toIdentity}`,
      fromEntityId: from.wikidataId || "",
      fromName: from.name || "",
      fromCountryCode: from.countryCode || "",
      toEntityId: to.wikidataId || "",
      toName: to.name || "",
      toCountryCode: to.countryCode || "",
      transportModes,
      distanceKm: distanceKm(from, to),
      durationHours: null,
      evidenceType: "transport-connection",
      subject: { entityId: from.wikidataId || from.name || "", name: from.name || "" },
      object: { entityId: to.wikidataId || to.name || "", name: to.name || "" },
      relation: "connected-to",
      value: transportModes,
      confidence: transportModes.length ? 0.75 : 0.55,
      verifiedAt: new Date().toISOString(),
      status: "verified",
      ...ref,
      verified: true,
    });
    const segmentDistance = distanceKm(from, to);
    if (segmentDistance != null) {
      evidence.push({
        id: evidenceId(["segment-metric", fromIdentity, toIdentity, record.id]),
        kind: "segment-metric",
        evidenceType: "segment-metric",
        name: `${from.name || fromIdentity} → ${to.name || toIdentity}`,
        fromEntityId: from.wikidataId || "",
        fromName: from.name || "",
        toEntityId: to.wikidataId || "",
        toName: to.name || "",
        distanceKm: segmentDistance,
        durationHours: null,
        metricType: "straight-line",
        subject: { entityId: from.wikidataId || from.name || "", name: from.name || "" },
        object: { entityId: to.wikidataId || to.name || "", name: to.name || "" },
        relation: "has-segment-metric",
        value: { distanceKm: segmentDistance, metricType: "straight-line" },
        confidence: 0.65,
        verifiedAt: new Date().toISOString(),
        status: "verified",
        ...ref,
        verified: true,
      });
    }
  }
  for (const theme of record.themes || []) {
    evidence.push({
      id: evidenceId(["theme", theme, record.id]),
      kind: "theme",
      evidenceType: "theme-fit",
      name: theme,
      subject: { entityId: clean(record.id), name: record.name || "" },
      relation: "has-theme",
      value: theme,
      confidence: 0.75,
      verifiedAt: new Date().toISOString(),
      status: "verified",
      ...ref,
      verified: true,
    });
    for (const destination of record.destinationEntities || []) {
      evidence.push({
        id: evidenceId(["theme-fit", theme, destination.wikidataId || destination.name, record.id]),
        kind: "theme",
        evidenceType: "theme-fit",
        name: theme,
        entityId: destination.wikidataId || "",
        countryCode: destination.countryCode || "",
        subject: { entityId: destination.wikidataId || destination.name || "", name: destination.name || "" },
        relation: "has-theme",
        value: theme,
        confidence: 0.68,
        verifiedAt: new Date().toISOString(),
        status: "verified",
        ...ref,
        verified: true,
      });
    }
  }
  for (const season of record.bestMonths || []) {
    evidence.push({
      id: evidenceId(["season", season, record.id]),
      kind: "season",
      evidenceType: "destination-season",
      name: season,
      subject: { entityId: clean(record.id), name: record.name || "" },
      relation: "has-season",
      value: season,
      confidence: 0.72,
      verifiedAt: new Date().toISOString(),
      status: "verified",
      ...ref,
      verified: true,
    });
    for (const destination of record.destinationEntities || []) {
      evidence.push({
        id: evidenceId(["destination-season", season, destination.wikidataId || destination.name, record.id]),
        kind: "season",
        evidenceType: "destination-season",
        name: season,
        entityId: destination.wikidataId || "",
        countryCode: destination.countryCode || "",
        subject: { entityId: destination.wikidataId || destination.name || "", name: destination.name || "" },
        relation: "has-season",
        value: season,
        confidence: 0.66,
        verifiedAt: new Date().toISOString(),
        status: "verified",
        ...ref,
        verified: true,
      });
    }
  }
  if (record.recommendedDays) {
    evidence.push({
      id: evidenceId(["duration", record.recommendedDays, record.id]),
      kind: "duration",
      evidenceType: "duration",
      name: record.recommendedDays,
      durationDays: record.durationDays || null,
      subject: { entityId: clean(record.id), name: record.name || "" },
      relation: "has-duration",
      value: record.recommendedDays,
      confidence: 0.72,
      verifiedAt: new Date().toISOString(),
      status: "verified",
      ...ref,
      verified: true,
    });
  }
  for (const mode of routeTransportModes(record)) {
    evidence.push({
      id: evidenceId(["transport", mode, record.id]),
      kind: "transport",
      evidenceType: "transport-mode",
      name: mode,
      subject: { entityId: clean(record.id), name: record.name || "" },
      relation: "uses-transport-mode",
      value: mode,
      confidence: 0.72,
      verifiedAt: new Date().toISOString(),
      status: "verified",
      ...ref,
      verified: true,
    });
  }
  if (record.coverAsset?.imageUrl) {
    evidence.push({
      id: evidenceId(["image", record.coverAsset.assetId, record.id]),
      kind: "image",
      name: record.coverAsset.assetId,
      assetId: record.coverAsset.assetId,
      assetIdentity: assetIdentity(record.coverAsset),
      asset: clone(record.coverAsset),
      imageScope: "route-cover",
      evidenceType: "route-cover-candidate",
      subject: { entityId: clean(record.id), name: record.name || "" },
      relation: "has-route-cover",
      value: record.coverAsset.assetId,
      confidence: 0.8,
      verifiedAt: new Date().toISOString(),
      status: "verified",
      ...ref,
      verified: true,
    });
  }
  for (const asset of record.destinationAssets || []) {
    evidence.push({
      id: evidenceId(["image", asset.assetId, asset.destinationId || asset.destinationName, record.id]),
      kind: "image",
      name: asset.destinationName || asset.assetId,
      entityId: asset.destinationId || "",
      assetId: asset.assetId,
      assetIdentity: assetIdentity(asset),
      asset: clone(asset),
      imageScope: "destination",
      evidenceType: "destination-image",
      subject: { entityId: asset.destinationId || asset.destinationName || "", name: asset.destinationName || "" },
      relation: "has-destination-image",
      value: asset.assetId,
      confidence: 0.85,
      verifiedAt: new Date().toISOString(),
      status: "verified",
      ...ref,
      verified: true,
    });
  }
  return evidence.map(verifiedEvidence).filter(Boolean);
}

export function evidenceFromProviderFacts(facts) {
  if (!facts?.routeId) return [];
  return evidenceFromRouteRecord({
    id: facts.routeId,
    source: facts.source,
    sourceTitle: facts.sourceTitle,
    name: facts.sourceTitle,
    summary: facts.extract || "",
    countryEntities: facts.countryEntities || [],
    destinationEntities: facts.destinationEntities || [],
    recommendedDays: facts.durationEvidence?.recommendedDays || "",
    durationDays: facts.durationEvidence?.durationDays || null,
    bestMonths: facts.seasonEvidence?.bestMonths || [],
    themes: facts.themesEvidence || [],
    coverAsset: facts.coverAsset || null,
  });
}

export function createEvidenceRepository({ storagePath = "" } = {}) {
  const evidence = new Map();
  for (const item of readStore(storagePath)) {
    const verified = verifiedEvidence(item);
    if (verified) evidence.set(verified.id, verified);
  }

  function persist() {
    writeStore(storagePath, [...evidence.values()]);
  }

  function upsert(item) {
    const verified = verifiedEvidence(item);
    if (!verified) return { accepted: false, reason: "unverified-evidence" };
    evidence.set(verified.id, clone(verified));
    persist();
    return { accepted: true, evidence: clone(verified) };
  }

  function ingestRouteRecord(record) {
    const items = evidenceFromRouteRecord(record);
    items.forEach((item) => evidence.set(item.id, clone(item)));
    persist();
    return items.map(clone);
  }

  function ingestProviderFacts(facts) {
    const items = evidenceFromProviderFacts(facts);
    items.forEach((item) => evidence.set(item.id, clone(item)));
    persist();
    return items.map(clone);
  }

  function list({ kind = "", evidenceType = "", sourceRouteId = "", subjectId: requestedSubjectId = "", status = "" } = {}) {
    return [...evidence.values()]
      .filter((item) => !kind || item.kind === kind)
      .filter((item) => !evidenceType || item.evidenceType === evidenceType)
      .filter((item) => !sourceRouteId || item.sourceRouteId === sourceRouteId)
      .filter((item) => !requestedSubjectId || subjectId(item.subject) === requestedSubjectId || item.entityId === requestedSubjectId)
      .filter((item) => !status || item.status === status)
      .map(clone);
  }

  function bySourceRoute() {
    const groups = new Map();
    for (const item of evidence.values()) {
      if (!item.sourceRouteId) continue;
      if (!groups.has(item.sourceRouteId)) groups.set(item.sourceRouteId, []);
      groups.get(item.sourceRouteId).push(clone(item));
    }
    return groups;
  }

  function status() {
    const items = [...evidence.values()];
    const byEvidenceType = items.reduce((bucket, item) => {
      bucket[item.evidenceType] = (bucket[item.evidenceType] || 0) + 1;
      return bucket;
    }, {});
    return {
      total: items.length,
      countries: new Set(items.filter((item) => item.kind === "country").map((item) => item.countryCode || item.entityId)).size,
      destinations: new Set(items.filter((item) => item.kind === "destination").map((item) => item.entityId || item.name)).size,
      themes: new Set(items.filter((item) => item.kind === "theme").map((item) => item.name)).size,
      images: items.filter((item) => item.kind === "image").length,
      byEvidenceType,
    };
  }

  return { upsert, ingestRouteRecord, ingestProviderFacts, list, bySourceRoute, status };
}
