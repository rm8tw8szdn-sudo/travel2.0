export function createTextEnrichmentProvider(adapter) {
  if (typeof adapter?.enrich !== "function") throw new TypeError("TextEnrichmentProvider requires enrich().");
  return { name: String(adapter.name || "text-enrichment"), enrich: adapter.enrich.bind(adapter) };
}
