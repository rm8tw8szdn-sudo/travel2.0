function normalizeProvider(provider) {
  if (!provider?.id) throw new Error("ROUTE_PROVIDER_ID_REQUIRED");
  return {
    ...provider,
    capabilities: {
      discovery: Boolean(provider.capabilities?.discovery ?? provider.supportsDiscovery),
      search: Boolean(provider.capabilities?.search ?? provider.supportsSearch),
      detail: Boolean(provider.capabilities?.detail ?? provider.supportsDetail),
      imageHints: Boolean(provider.capabilities?.imageHints ?? provider.supportsImageHints),
      pagination: Boolean(provider.capabilities?.pagination ?? provider.supportsPagination),
      requiresApiKey: Boolean(provider.capabilities?.requiresApiKey ?? provider.requiresApiKey),
      rateLimit: provider.capabilities?.rateLimit || provider.rateLimit || "",
      license: provider.capabilities?.license || provider.license || "",
      usageConstraints: provider.capabilities?.usageConstraints || provider.usageConstraints || "",
    },
  };
}

export function createProviderRegistry(providers = []) {
  const registry = new Map();
  providers.forEach((provider) => {
    const normalized = normalizeProvider(provider);
    registry.set(normalized.id, normalized);
  });
  return {
    register(provider) {
      const normalized = normalizeProvider(provider);
      registry.set(normalized.id, normalized);
      return normalized;
    },
    get(id) {
      return registry.get(id) || null;
    },
    list() {
      return [...registry.values()];
    },
  };
}
