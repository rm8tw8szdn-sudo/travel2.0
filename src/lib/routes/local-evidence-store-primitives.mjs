import fs from "node:fs";
import path from "node:path";

function clone(value) {
  return structuredClone(value);
}

export function createAtomicJsonlEvidenceStore({
  storagePath,
  enabled = () => false,
  recordType = "local-evidence",
  idField,
  normalize,
  validate,
  now = () => new Date().toISOString(),
} = {}) {
  if (!storagePath) throw new Error("LOCAL_EVIDENCE_STORAGE_PATH_REQUIRED");
  if (!idField) throw new Error("LOCAL_EVIDENCE_ID_FIELD_REQUIRED");
  if (typeof normalize !== "function" || typeof validate !== "function") throw new Error("LOCAL_EVIDENCE_SCHEMA_REQUIRED");
  let revision = 0;
  let parseCount = 0;

  function isEnabled() {
    return Boolean(enabled());
  }

  function readSnapshot() {
    parseCount += 1;
    if (!fs.existsSync(storagePath)) return { records: [], entries: [], diagnostics: [] };
    let payload;
    try {
      payload = fs.readFileSync(storagePath, "utf8");
    } catch (error) {
      const diagnostic = { type: `${recordType}-read-failed`, error: error?.message || String(error) };
      return { records: [], entries: [{ ok: false, index: -1, ...diagnostic }], diagnostics: [diagnostic], readFailed: true };
    }
    const records = [];
    const entries = [];
    const diagnostics = [];
    const seenIds = new Set();
    payload.split(/\r?\n/u).forEach((line, index) => {
      if (!line.trim()) return;
      let parsed;
      try {
        parsed = JSON.parse(line);
      } catch (error) {
        const diagnostic = { type: `${recordType}-corrupt-json`, index, error: error?.message || String(error) };
        diagnostics.push(diagnostic);
        entries.push({ ok: false, index, ...diagnostic });
        return;
      }
      const validation = validate(parsed);
      if (!validation.accepted) {
        const diagnostic = {
          type: `${recordType}-schema-invalid`,
          index,
          recordId: String(parsed?.[idField] || ""),
          reasons: clone(validation.reasons || []),
        };
        diagnostics.push(diagnostic);
        entries.push({ ok: false, index, record: clone(parsed), validation, ...diagnostic });
        return;
      }
      const record = validation.record || normalize(parsed, { now });
      const recordId = String(record[idField] || "");
      if (seenIds.has(recordId)) {
        const diagnostic = { type: `${recordType}-duplicate`, index, recordId };
        diagnostics.push(diagnostic);
        entries.push({ ok: false, index, record: clone(record), validation, ...diagnostic });
        return;
      }
      seenIds.add(recordId);
      records.push(record);
      entries.push({ ok: true, index, record: clone(record), validation });
    });
    records.sort((left, right) => String(left[idField]).localeCompare(String(right[idField]), "en"));
    return { records, entries, diagnostics };
  }

  function writeSnapshot(records) {
    fs.mkdirSync(path.dirname(storagePath), { recursive: true });
    const tempPath = `${storagePath}.${process.pid}.tmp`;
    const payload = records.length ? `${records.map((record) => JSON.stringify(record)).join("\n")}\n` : "";
    try {
      fs.writeFileSync(tempPath, payload, "utf8");
      fs.renameSync(tempPath, storagePath);
    } finally {
      if (fs.existsSync(tempPath)) fs.rmSync(tempPath, { force: true });
    }
  }

  function upsertMany(inputs = []) {
    if (!isEnabled()) return { written: false, persisted: false, skipped: true, reason: `${recordType}-disabled`, count: 0 };
    const timestamp = now();
    const normalizedById = new Map();
    for (const input of Array.isArray(inputs) ? inputs : []) {
      const record = normalize(input, { now: () => timestamp });
      const validation = validate(record);
      if (!validation.accepted) {
        return { written: false, persisted: false, skipped: false, reason: `${recordType}-invalid`, reasons: clone(validation.reasons || []) };
      }
      normalizedById.set(record[idField], validation.record || record);
    }
    if (!normalizedById.size) return { written: false, persisted: true, skipped: true, reason: `${recordType}-empty-batch`, count: 0 };
    try {
      const snapshot = readSnapshot();
      if (snapshot.readFailed) {
        return { written: false, persisted: false, skipped: false, reason: `${recordType}-read-failed`, diagnostics: clone(snapshot.diagnostics) };
      }
      const byId = new Map(snapshot.records.map((record) => [record[idField], clone(record)]));
      let changed = false;
      for (const [recordId, incomingRecord] of normalizedById) {
        const existing = byId.get(recordId);
        let next = clone(incomingRecord);
        if (existing) {
          next.createdAt = existing.createdAt;
          next.updatedAt = existing.updatedAt;
          if (JSON.stringify(existing) === JSON.stringify(next)) continue;
          next.updatedAt = timestamp;
          const updateValidation = validate(next);
          if (!updateValidation.accepted) {
            return { written: false, persisted: false, skipped: false, reason: `${recordType}-invalid`, reasons: clone(updateValidation.reasons || []) };
          }
          next = updateValidation.record || next;
        }
        byId.set(recordId, next);
        changed = true;
      }
      if (!changed) {
        return {
          written: false,
          persisted: true,
          skipped: true,
          reason: `${recordType}-unchanged`,
          count: normalizedById.size,
          recordIds: [...normalizedById.keys()],
          diagnostics: clone(snapshot.diagnostics),
        };
      }
      const records = [...byId.values()].sort((left, right) => String(left[idField]).localeCompare(String(right[idField]), "en"));
      writeSnapshot(records);
      revision += 1;
      return {
        written: true,
        persisted: true,
        count: normalizedById.size,
        total: records.length,
        recordIds: [...normalizedById.keys()],
        storagePath,
        diagnostics: clone(snapshot.diagnostics),
      };
    } catch (error) {
      return { written: false, persisted: false, skipped: false, reason: `${recordType}-write-failed`, error: error?.message || String(error) };
    }
  }

  function upsert(input) {
    const result = upsertMany([input]);
    return {
      ...result,
      recordId: result.recordIds?.[0] || null,
    };
  }

  function list() {
    if (!isEnabled()) return [];
    return readSnapshot().records.map((record) => clone(record));
  }

  function get(recordId) {
    if (!isEnabled()) return null;
    const record = readSnapshot().records.find((item) => item[idField] === String(recordId || ""));
    return record ? clone(record) : null;
  }

  function diagnostics() {
    if (!isEnabled()) return [];
    return clone(readSnapshot().diagnostics);
  }

  function snapshot() {
    if (!isEnabled()) return { records: [], entries: [], diagnostics: [] };
    return clone(readSnapshot());
  }

  return {
    storagePath,
    enabled: isEnabled,
    upsert,
    upsertMany,
    list,
    get,
    diagnostics,
    snapshot,
    revision: () => revision,
    parseCount: () => parseCount,
  };
}
