function list(value) {
  return Array.isArray(value) ? value : [];
}

function text(value) {
  return String(value || "").trim();
}

function subjectId(value) {
  return text(value?.entityId || value?.id || value?.name);
}

function hasEvidence(evidence, evidenceType) {
  return evidence.some((item) => item.evidenceType === evidenceType || item.kind === evidenceType);
}

function destinationIds(destinations) {
  return destinations.map((item) => text(item.wikidataId || item.entityId || item.name)).filter(Boolean);
}

function hasConnection(evidence, fromId, toId) {
  return evidence.some((item) => {
    if (!["transport-connection", "route-segment"].includes(item.evidenceType || item.kind)) return false;
    const from = text(item.subject?.entityId || item.fromEntityId || item.fromName);
    const to = text(item.object?.entityId || item.toEntityId || item.toName);
    return (from === fromId && to === toId) || (from === toId && to === fromId);
  });
}

function completeAdjacentConnections(context) {
  const ids = destinationIds(list(context.destinations));
  if (ids.length < 2) return false;
  return ids.slice(0, -1).every((id, index) => hasConnection(list(context.evidence), id, ids[index + 1]));
}

function sameRegionCluster(context) {
  const ids = new Set(destinationIds(list(context.destinations)));
  const clusters = list(context.evidence).filter((item) => item.evidenceType === "region-cluster");
  return clusters.some((item) => {
    const members = new Set(list(item.qualifiers?.memberEntityIds).map(text));
    return [...ids].every((id) => members.has(id));
  });
}

function strategy(strategyId, options) {
  return {
    strategyId,
    name: strategyId,
    enabled: options.enabled !== false,
    requiredEvidenceTypes: options.requiredEvidenceTypes || [],
    optionalEvidenceTypes: options.optionalEvidenceTypes || [],
    evaluate(context = {}) {
      if (options.enabled === false) {
        return { accepted: false, reasons: ["strategy-disabled"], score: 0 };
      }
      return options.evaluate(context);
    },
    explain(context = {}) {
      return options.explain ? options.explain(context) : [];
    },
  };
}

const STRATEGIES = [
  strategy("Geographic", {
    requiredEvidenceTypes: ["segment-metric"],
    evaluate(context) {
      return hasEvidence(list(context.evidence), "segment-metric")
        ? { accepted: true, reasons: [], score: 0.75 }
        : { accepted: false, reasons: ["missing-segment-metric"], score: 0.35 };
    },
  }),
  strategy("Regional", {
    requiredEvidenceTypes: ["region-cluster"],
    evaluate(context) {
      return sameRegionCluster(context)
        ? { accepted: true, reasons: [], score: 0.82 }
        : { accepted: false, reasons: ["missing-region-cluster"], score: 0.35 };
    },
  }),
  strategy("Theme", {
    requiredEvidenceTypes: ["theme-fit"],
    evaluate(context) {
      return hasEvidence(list(context.evidence), "theme-fit")
        ? { accepted: true, reasons: [], score: 0.8 }
        : { accepted: false, reasons: ["missing-theme-fit"], score: 0.35 };
    },
  }),
  strategy("Season", {
    requiredEvidenceTypes: ["destination-season"],
    evaluate(context) {
      return hasEvidence(list(context.evidence), "destination-season")
        ? { accepted: true, reasons: [], score: 0.78 }
        : { accepted: false, reasons: ["missing-destination-season"], score: 0.35 };
    },
  }),
  strategy("Transport", {
    requiredEvidenceTypes: ["transport-connection", "segment-metric"],
    evaluate(context) {
      return completeAdjacentConnections(context) && hasEvidence(list(context.evidence), "segment-metric")
        ? { accepted: true, reasons: [], score: 0.84 }
        : { accepted: false, reasons: ["missing-adjacent-transport-connection"], score: 0.35 };
    },
  }),
  strategy("Travel Efficiency", {
    requiredEvidenceTypes: ["segment-metric"],
    evaluate(context) {
      return completeAdjacentConnections(context)
        ? { accepted: true, reasons: [], score: 0.8 }
        : { accepted: false, reasons: ["missing-efficiency-segment-evidence"], score: 0.35 };
    },
  }),
  strategy("Depth", {
    requiredEvidenceTypes: ["region-cluster", "destination-level"],
    evaluate(context) {
      return sameRegionCluster(context) && hasEvidence(list(context.evidence), "destination-level")
        ? { accepted: true, reasons: [], score: 0.76 }
        : { accepted: false, reasons: ["missing-depth-region-or-level"], score: 0.35 };
    },
  }),
  strategy("Anchor + Satellite", { enabled: false, evaluate: () => ({ accepted: false, reasons: ["strategy-disabled"], score: 0 }) }),
  strategy("Hub & Stopover", { enabled: false, evaluate: () => ({ accepted: false, reasons: ["strategy-disabled"], score: 0 }) }),
  strategy("Flight Opportunity", { enabled: false, evaluate: () => ({ accepted: false, reasons: ["strategy-disabled"], score: 0 }) }),
  strategy("Budget Opportunity", { enabled: false, evaluate: () => ({ accepted: false, reasons: ["strategy-disabled"], score: 0 }) }),
];

export function createRouteDesignStrategyRegistry({ strategies = STRATEGIES } = {}) {
  const registry = new Map(strategies.map((item) => [item.strategyId, item]));
  return {
    get(strategyId) {
      return registry.get(strategyId) || null;
    },
    list({ enabled = null } = {}) {
      return [...registry.values()].filter((item) => enabled == null || item.enabled === enabled);
    },
    evaluate(strategyId, context = {}) {
      const item = registry.get(strategyId);
      if (!item) return { accepted: false, reasons: ["unknown-strategy"], score: 0 };
      return item.evaluate(context);
    },
  };
}
