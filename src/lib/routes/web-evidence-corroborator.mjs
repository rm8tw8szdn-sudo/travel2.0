function clean(value) {
  return String(value || "").trim().toLowerCase();
}

function keyOf(item) {
  return [
    item.evidenceType,
    clean(item.subject?.name || item.subject?.entityId),
    clean(item.relation),
    clean(item.object?.name || item.object?.entityId),
    JSON.stringify(item.value || "").toLowerCase(),
  ].join("|");
}

function uniqueSources(items) {
  return [...new Set(items.map((item) => item.provenance?.sourceUrl).filter(Boolean))];
}

export function createWebEvidenceCorroborator() {
  return {
    corroborate(evidence = []) {
      const groups = new Map();
      for (const item of evidence) {
        const key = keyOf(item);
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(item);
      }
      const output = [];
      const diagnostics = [];
      for (const items of groups.values()) {
        const sources = uniqueSources(items);
        const strongest = [...items].sort((left, right) => Number(right.confidence) - Number(left.confidence))[0];
        const corroborated = sources.length > 1;
        const confidence = Math.min(0.95, Number(strongest.confidence) + (corroborated ? 0.08 : 0));
        output.push({
          ...strongest,
          confidence,
          qualifiers: {
            ...(strongest.qualifiers || {}),
            corroborated,
            corroboratingSources: sources,
          },
        });
        diagnostics.push({
          evidenceType: strongest.evidenceType,
          subject: strongest.subject?.name || "",
          relation: strongest.relation,
          sources: sources.length,
          corroborated,
        });
      }
      return { evidence: output, diagnostics };
    },
  };
}
