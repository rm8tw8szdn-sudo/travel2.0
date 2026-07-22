function clone(value) {
  return value == null ? value : structuredClone(value);
}

function timestamp(value) {
  const parsed = Date.parse(String(value || ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function confidence(value) {
  return Number.isFinite(Number(value)) ? Number(value) : -1;
}

function freshnessRank(value) {
  return ({ fresh: 3, unknown: 2, stale: 1, expired: 0 })[String(value || "")] ?? -1;
}

function runtimeCanOverride(seedRecord, runtimeRecord) {
  return timestamp(runtimeRecord.retrievedAt || runtimeRecord.updatedAt) >= timestamp(seedRecord.retrievedAt || seedRecord.updatedAt)
    && confidence(runtimeRecord.confidence) >= confidence(seedRecord.confidence)
    && freshnessRank(runtimeRecord.freshnessStatus) >= freshnessRank(seedRecord.freshnessStatus);
}

export function createLocalEvidenceSeedOverlay({ seedStore, runtimeStore, idField, recordType } = {}) {
  if (!seedStore || !runtimeStore || !idField) throw new Error("LOCAL_EVIDENCE_SEED_OVERLAY_STORES_REQUIRED");

  function snapshot() {
    const seed = seedStore.snapshot();
    const runtime = runtimeStore.snapshot();
    const byId = new Map((seed.records || []).map((record) => [record[idField], clone(record)]));
    const entries = [...(seed.entries || []).map((entry) => ({ ...clone(entry), origin: "seed" }))];
    const diagnostics = [...(seed.diagnostics || []).map((entry) => ({ ...clone(entry), origin: "seed" }))];

    for (const entry of runtime.entries || []) entries.push({ ...clone(entry), origin: "runtime" });
    for (const entry of runtime.diagnostics || []) diagnostics.push({ ...clone(entry), origin: "runtime" });
    for (const record of runtime.records || []) {
      const recordId = record[idField];
      const seeded = byId.get(recordId);
      if (!seeded || runtimeCanOverride(seeded, record)) {
        byId.set(recordId, clone(record));
        continue;
      }
      const diagnostic = {
        type: `${recordType}-runtime-override-rejected`,
        recordId,
        origin: "overlay",
        reasons: ["runtime-evidence-older-or-lower-quality-than-seed"],
      };
      diagnostics.push(diagnostic);
    }
    return {
      records: [...byId.values()].sort((left, right) => String(left[idField]).localeCompare(String(right[idField]), "en")),
      entries,
      diagnostics,
    };
  }

  return {
    enabled: () => seedStore.enabled() || runtimeStore.enabled(),
    list: () => snapshot().records,
    get(recordId) {
      return clone(snapshot().records.find((record) => record[idField] === String(recordId || "")) || null);
    },
    diagnostics: () => clone(snapshot().diagnostics),
    snapshot,
    revision: () => `${seedStore.revision()}:${runtimeStore.revision()}`,
    parseCount: () => seedStore.parseCount() + runtimeStore.parseCount(),
  };
}

export function compareLocalEvidenceQuality(seedRecord, runtimeRecord) {
  return runtimeCanOverride(seedRecord, runtimeRecord);
}
