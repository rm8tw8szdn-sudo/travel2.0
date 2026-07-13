import fs from "node:fs";
import path from "node:path";

function readState(storagePath) {
  if (!storagePath || !fs.existsSync(storagePath)) {
    return { schemaVersion: 1, providers: {} };
  }
  const state = JSON.parse(fs.readFileSync(storagePath, "utf8"));
  return {
    schemaVersion: 1,
    providers: state?.providers && typeof state.providers === "object" ? state.providers : {},
  };
}

function writeState(storagePath, state) {
  if (!storagePath) return;
  fs.mkdirSync(path.dirname(storagePath), { recursive: true });
  const tempPath = `${storagePath}.${process.pid}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(state, null, 2));
  fs.renameSync(tempPath, storagePath);
}

export function createProviderSyncStateStore({ storagePath = "" } = {}) {
  let state = readState(storagePath);

  function get(providerId) {
    return structuredClone(state.providers[providerId] || {
      providerId,
      cursor: null,
      continuation: null,
      scannedCount: 0,
      candidateCount: 0,
      acceptedCount: 0,
      rejectedCount: 0,
      deferredCount: 0,
      failedCount: 0,
      nextRunAt: "",
      rateLimit: null,
      retryAfter: 0,
    });
  }

  function update(providerId, patch) {
    const current = get(providerId);
    const next = {
      ...current,
      ...patch,
      providerId,
      updatedAt: new Date().toISOString(),
    };
    state = {
      schemaVersion: 1,
      providers: {
        ...state.providers,
        [providerId]: next,
      },
    };
    writeState(storagePath, state);
    return structuredClone(next);
  }

  function list() {
    return Object.values(state.providers).map((item) => structuredClone(item));
  }

  return { get, update, list };
}
