export function createProviderSync({ providerRegistry, jobStore } = {}) {
  if (!providerRegistry?.list) throw new Error("PROVIDER_REGISTRY_REQUIRED");
  if (!jobStore?.enqueue) throw new Error("ROUTE_JOB_STORE_REQUIRED");
  return {
    async syncProvider(providerId) {
      const provider = providerRegistry.get(providerId);
      if (!provider) throw new Error("ROUTE_PROVIDER_NOT_FOUND");
      if (typeof provider.sync !== "function") return { providerId, changes: [], jobs: [] };
      const result = await provider.sync();
      const jobs = (result.changes || []).map((change) => jobStore.enqueue({
        type: "provider-sync-placeholder",
        providerId,
        evidenceHash: change.evidenceHash || "",
        sourceIdentity: change.sourceIdentity || change.sourceUrl || "",
      }).job);
      return { providerId, changes: result.changes || [], jobs };
    },
  };
}
