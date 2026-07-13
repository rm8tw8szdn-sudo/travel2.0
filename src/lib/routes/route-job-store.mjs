const RUNNING_STATUSES = new Set([
  "queued",
  "fetchingEvidence",
  "normalizingEvidence",
  "enrichingText",
  "resolvingRouteCover",
  "resolvingDestinationImages",
  "qualityChecking",
]);

function clone(value) {
  return structuredClone(value);
}

function identity(input) {
  return [input.type, input.providerId, input.evidenceHash, input.sourceIdentity, input.query].filter(Boolean).join("::");
}

export function createRouteJobStore({ now = () => Date.now() } = {}) {
  const jobs = new Map();
  const identities = new Map();

  function enqueue(input = {}) {
    const key = identity(input);
    const existingId = identities.get(key);
    if (existingId) {
      const existing = jobs.get(existingId);
      if (existing && RUNNING_STATUSES.has(existing.status)) return { job: clone(existing), reused: true };
      identities.delete(key);
    }
    const id = input.id || `job:${key || "route"}:${now()}`;
    const job = {
      id,
      type: input.type || "repository-build",
      providerId: input.providerId || "",
      evidenceHash: input.evidenceHash || "",
      sourceIdentity: input.sourceIdentity || "",
      query: input.query || "",
      status: "queued",
      createdAt: now(),
      updatedAt: now(),
      diagnostics: [],
    };
    jobs.set(id, job);
    if (key) identities.set(key, id);
    return { job: clone(job), reused: false };
  }

  function transition(id, status, diagnostic = null) {
    const job = jobs.get(id);
    if (!job) return null;
    job.status = status;
    job.updatedAt = now();
    if (diagnostic) job.diagnostics.push(diagnostic);
    return clone(job);
  }

  function get(id) {
    const job = jobs.get(id);
    return job ? clone(job) : null;
  }

  function list({ status = "" } = {}) {
    return [...jobs.values()]
      .filter((job) => !status || job.status === status)
      .map(clone);
  }

  function expireOlderThan(maxAgeMs) {
    const cutoff = now() - maxAgeMs;
    for (const job of jobs.values()) {
      if (RUNNING_STATUSES.has(job.status) && job.updatedAt < cutoff) {
        job.status = "expired";
        job.updatedAt = now();
      }
    }
  }

  return { enqueue, transition, get, list, expireOlderThan };
}
