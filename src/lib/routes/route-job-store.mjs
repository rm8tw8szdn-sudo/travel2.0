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

function normalizeIdentity(input) {
  return {
    type: input.type || "repository-build",
    providerId: input.providerId || "",
    evidenceHash: input.evidenceHash || "",
    sourceIdentity: input.sourceIdentity || "",
    query: input.query || "",
  };
}

export function createRouteJobStore({ now = () => Date.now() } = {}) {
  const jobs = new Map();
  const identities = new Map();
  let sequence = 0;

  function enqueue(input = {}) {
    const fields = normalizeIdentity(input);
    // Preserve empty field positions and escape delimiters in user queries.
    const key = JSON.stringify(Object.values(fields));
    const existingId = identities.get(key);
    if (existingId) {
      const existing = jobs.get(existingId);
      if (existing && RUNNING_STATUSES.has(existing.status)) return { job: clone(existing), reused: true };
      identities.delete(key);
    }
    const timestamp = now();
    let id = input.id;
    if (id && jobs.has(id)) throw new Error("job_id_already_exists");
    if (!id) {
      do {
        id = `job:${timestamp}:${++sequence}`;
      } while (jobs.has(id));
    }
    const job = {
      id,
      ...fields,
      status: "queued",
      createdAt: timestamp,
      updatedAt: timestamp,
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
    if (diagnostic) job.diagnostics.push(clone(diagnostic));
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
