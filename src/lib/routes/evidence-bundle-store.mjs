import fs from "node:fs";
import path from "node:path";
import { envFlag } from "./route-v2-env.mjs";
import { normalizeEvidenceBundle, validateEvidenceBundle } from "./evidence-bundle.mjs";
import {
  normalizeEvidenceBundleLifecycle,
  validateEvidenceBundleLifecycle,
} from "./evidence-bundle-schema.mjs";

function clone(value) {
  return structuredClone(value);
}

export function isRouteV2EvidenceBundleEnabled(env = process.env) {
  return envFlag(env, "ROUTE_V2_EVIDENCE_BUNDLE_ENABLED", false);
}

export function defaultRouteEvidenceBundlePath(env = process.env) {
  return env.ROUTE_V2_EVIDENCE_BUNDLE_PATH || path.resolve(".route-v2-cache", "route-evidence-bundles.jsonl");
}

export function createEvidenceBundleStore({
  storagePath = defaultRouteEvidenceBundlePath(),
  env = process.env,
  now = () => new Date().toISOString(),
} = {}) {
  function enabled() {
    return isRouteV2EvidenceBundleEnabled(env);
  }

  function append(input) {
    if (!enabled()) return { written: false, skipped: true, reason: "evidence-bundle-disabled" };
    const validation = validateEvidenceBundle(input);
    if (!validation.accepted) {
      return {
        written: false,
        skipped: false,
        reason: "evidence-bundle-invalid",
        reasons: validation.reasons,
      };
    }
    const bundle = normalizeEvidenceBundle(input, { now });
    try {
      fs.mkdirSync(path.dirname(storagePath), { recursive: true });
      fs.appendFileSync(storagePath, `${JSON.stringify(bundle)}\n`, "utf8");
      return {
        written: true,
        evidenceBundleId: bundle.evidenceBundleId,
        candidateId: bundle.candidateId,
        intentId: bundle.intentId,
        storagePath,
      };
    } catch (error) {
      return {
        written: false,
        skipped: false,
        reason: "evidence-bundle-write-failed",
        error: error?.message || String(error),
      };
    }
  }

  function readAll() {
    if (!fs.existsSync(storagePath)) return [];
    return fs.readFileSync(storagePath, "utf8")
      .split(/\r?\n/u)
      .filter((line) => line.trim())
      .map((line, index) => {
        try {
          const bundle = JSON.parse(line);
          return { ok: true, index, bundle, validation: validateEvidenceBundle(bundle) };
        } catch (error) {
          return { ok: false, index, error: error?.message || String(error), line };
        }
      });
  }

  function listByCandidate(candidateId) {
    return readAll()
      .filter((record) => record.ok && record.validation?.accepted && record.bundle.candidateId === candidateId)
      .map((record) => clone(record.bundle));
  }

  function readLifecycleSnapshot() {
    if (!enabled()) return { bundles: [], legacyBundles: [], entries: [], diagnostics: [] };
    if (!fs.existsSync(storagePath)) return { bundles: [], legacyBundles: [], entries: [], diagnostics: [] };
    let payload;
    try {
      payload = fs.readFileSync(storagePath, "utf8");
    } catch (error) {
      const diagnostic = { type: "evidence-lifecycle-read-failed", error: error?.message || String(error) };
      return { bundles: [], legacyBundles: [], entries: [{ ok: false, index: -1, ...diagnostic }], diagnostics: [diagnostic], readFailed: true };
    }
    const bundles = [];
    const legacyBundles = [];
    const entries = [];
    const diagnostics = [];
    const seenIds = new Set();
    payload.split(/\r?\n/u).forEach((line, index) => {
      if (!line.trim()) return;
      let parsed;
      try {
        parsed = JSON.parse(line);
      } catch (error) {
        const diagnostic = { type: "evidence-lifecycle-corrupt-json", index, error: error?.message || String(error) };
        diagnostics.push(diagnostic);
        entries.push({ ok: false, index, ...diagnostic });
        return;
      }
      const lifecycleValidation = validateEvidenceBundleLifecycle(parsed);
      if (lifecycleValidation.accepted) {
        const bundle = lifecycleValidation.bundle;
        if (seenIds.has(bundle.evidenceBundleId)) {
          const diagnostic = { type: "evidence-lifecycle-duplicate", index, evidenceBundleId: bundle.evidenceBundleId };
          diagnostics.push(diagnostic);
          entries.push({ ok: false, index, bundle: clone(bundle), validation: lifecycleValidation, ...diagnostic });
          return;
        }
        seenIds.add(bundle.evidenceBundleId);
        bundles.push(bundle);
        entries.push({ ok: true, index, bundle: clone(bundle), validation: lifecycleValidation });
        return;
      }
      const legacyValidation = validateEvidenceBundle(parsed);
      if (legacyValidation.accepted) {
        legacyBundles.push(normalizeEvidenceBundle(parsed, { now }));
        entries.push({ ok: true, ignored: true, recordType: "legacy-evidence-bundle", index, bundle: clone(parsed), validation: legacyValidation });
        return;
      }
      const diagnostic = {
        type: "evidence-lifecycle-schema-invalid",
        index,
        evidenceBundleId: String(parsed?.evidenceBundleId || ""),
        reasons: clone(lifecycleValidation.reasons),
      };
      diagnostics.push(diagnostic);
      entries.push({ ok: false, index, bundle: clone(parsed), validation: lifecycleValidation, ...diagnostic });
    });
    return { bundles, legacyBundles, entries, diagnostics };
  }

  function writeLifecycleSnapshot(legacyBundles, lifecycleBundles) {
    fs.mkdirSync(path.dirname(storagePath), { recursive: true });
    const tempPath = `${storagePath}.${process.pid}.tmp`;
    const records = [...legacyBundles, ...lifecycleBundles];
    const payload = records.length ? `${records.map((record) => JSON.stringify(record)).join("\n")}\n` : "";
    try {
      fs.writeFileSync(tempPath, payload, "utf8");
      fs.renameSync(tempPath, storagePath);
    } finally {
      if (fs.existsSync(tempPath)) fs.rmSync(tempPath, { force: true });
    }
  }

  function upsertLifecycle(input) {
    if (!enabled()) return { written: false, persisted: false, skipped: true, reason: "evidence-bundle-disabled" };
    const validation = validateEvidenceBundleLifecycle(input);
    if (!validation.accepted) {
      return { written: false, persisted: false, skipped: false, reason: "evidence-bundle-lifecycle-invalid", reasons: clone(validation.reasons) };
    }
    try {
      const snapshot = readLifecycleSnapshot();
      if (snapshot.readFailed) {
        return { written: false, persisted: false, skipped: false, reason: "evidence-bundle-read-failed", diagnostics: clone(snapshot.diagnostics) };
      }
      const bundles = snapshot.bundles.map((bundle) => clone(bundle));
      const index = bundles.findIndex((bundle) => bundle.candidateId === validation.bundle.candidateId);
      const existing = index >= 0 ? bundles[index] : null;
      let bundle = normalizeEvidenceBundleLifecycle(validation.bundle, { now });
      if (existing) {
        bundle.createdAt = existing.createdAt;
        bundle.updatedAt = existing.updatedAt;
      }
      const unchanged = existing && JSON.stringify(existing) === JSON.stringify(bundle);
      if (unchanged) {
        return {
          written: false,
          persisted: true,
          skipped: true,
          reason: "evidence-bundle-unchanged",
          evidenceBundleId: existing.evidenceBundleId,
          candidateId: existing.candidateId,
          storagePath,
          diagnostics: clone(snapshot.diagnostics),
        };
      }
      if (existing) bundle.updatedAt = now();
      const nextValidation = validateEvidenceBundleLifecycle(bundle);
      if (!nextValidation.accepted) {
        return { written: false, persisted: false, skipped: false, reason: "evidence-bundle-lifecycle-invalid", reasons: clone(nextValidation.reasons) };
      }
      bundle = nextValidation.bundle;
      if (index >= 0) bundles[index] = bundle;
      else bundles.push(bundle);
      writeLifecycleSnapshot(snapshot.legacyBundles, bundles);
      return {
        written: true,
        persisted: true,
        updated: index >= 0,
        evidenceBundleId: bundle.evidenceBundleId,
        candidateId: bundle.candidateId,
        intentId: bundle.intentId,
        status: bundle.status,
        storagePath,
        diagnostics: clone(snapshot.diagnostics),
      };
    } catch (error) {
      return { written: false, persisted: false, skipped: false, reason: "evidence-bundle-write-failed", error: error?.message || String(error) };
    }
  }

  function listLifecycle() {
    if (!enabled()) return [];
    return readLifecycleSnapshot().bundles.map((bundle) => clone(bundle));
  }

  function getLifecycle(evidenceBundleId) {
    if (!enabled()) return null;
    const bundle = readLifecycleSnapshot().bundles.find((item) => item.evidenceBundleId === String(evidenceBundleId || ""));
    return bundle ? clone(bundle) : null;
  }

  function getLifecycleByCandidate(candidateId) {
    if (!enabled()) return null;
    const bundle = readLifecycleSnapshot().bundles.find((item) => item.candidateId === String(candidateId || ""));
    return bundle ? clone(bundle) : null;
  }

  return {
    storagePath,
    enabled,
    append,
    readAll,
    listByCandidate,
    upsertLifecycle,
    listLifecycle,
    getLifecycle,
    getLifecycleByCandidate,
    lifecycleDiagnostics: () => enabled() ? clone(readLifecycleSnapshot().diagnostics) : [],
  };
}
