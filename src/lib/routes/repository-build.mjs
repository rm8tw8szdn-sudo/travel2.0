import { validateRouteContent } from "./content-quality.mjs";

function clone(value) {
  return structuredClone(value);
}

export function createRepositoryBuild({ providerRegistry, repository, jobStore, contentEnricher } = {}) {
  if (!providerRegistry?.get) throw new Error("PROVIDER_REGISTRY_REQUIRED");
  if (!repository?.upsert) throw new Error("ACCEPTED_REPOSITORY_REQUIRED");
  if (!jobStore?.enqueue) throw new Error("ROUTE_JOB_STORE_REQUIRED");

  async function runProviderDiscovery({ providerId, query = "", limit = 20 } = {}) {
    const provider = providerRegistry.get(providerId);
    if (!provider?.discover) throw new Error("ROUTE_PROVIDER_DISCOVERY_REQUIRED");
    const job = jobStore.enqueue({ type: "repository-build", providerId, query });
    jobStore.transition(job.job.id, "fetchingEvidence");
    const discovered = await provider.discover({ query, limit });
    const accepted = [];
    const rejected = [];
    for (const evidence of discovered.records || []) {
      jobStore.transition(job.job.id, "enrichingText");
      const enriched = contentEnricher?.enrich ? await contentEnricher.enrich(evidence) : { accepted: true, record: evidence };
      if (!enriched?.accepted) {
        rejected.push({ record: evidence, reason: enriched?.diagnostics?.reasons || ["content-enrichment-failed"] });
        continue;
      }
      jobStore.transition(job.job.id, "qualityChecking");
      const quality = validateRouteContent(enriched.record);
      const write = repository.upsert({ ...enriched.record, contentQualityStatus: "accepted", classification: quality.classification });
      if (write.accepted) accepted.push(write.record);
      else rejected.push({ record: enriched.record, reason: write.reasons });
    }
    jobStore.transition(job.job.id, accepted.length ? "accepted" : "deferred");
    return { accepted: clone(accepted), rejected, job: jobStore.get(job.job.id) };
  }

  return { runProviderDiscovery };
}
