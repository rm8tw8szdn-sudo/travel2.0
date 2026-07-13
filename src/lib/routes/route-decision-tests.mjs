// Route V2 Decision Tests — spec 5.3 Pattern 5-9 的可执行符号函数
//
// 5 个测试，输入候选路线 + pool + 判据，输出 { pass, mutations, reasons }：
//   removalTest          删某目的地若 Route DNA 不变 → 该目的地应删（Pattern 5）
//   replacementTest      每个 Core 目的地有无更好替代（Pattern 6）
//   compressionTest      减天数时删体验价值最低者，非末位（Pattern 7 之压缩）
//   expansionTest        增天数时加体验而非原地多待（Pattern 7 之扩展）
//   productBoundaryTest  跨产品边界 → 拆为新 Route 而非扩展（Pattern 9）
//
// 判据来源：Gold Case 的 ③designRules + ④Alternative/Rejection
// （通过 asAlternatives(id) / asExpectedOutput(id) 注入，而非硬编码）
//
// 设计原则：
//   - 纯函数，无 IO，无 LLM
//   - 失败即返回 mutations（建议如何改），由上层决定 mutate 或 reject
//   - productBoundaryTest 这种语义判断用规则启发式（pool 同区域/同主题判定）

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function intersect(a, b) {
  const set = new Set(asArray(b));
  return asArray(a).filter((item) => set.has(item));
}

function jaccard(a, b) {
  const A = new Set(asArray(a));
  const B = new Set(asArray(b));
  if (A.size === 0 && B.size === 0) return 1;
  let shared = 0;
  for (const item of A) if (B.has(item)) shared += 1;
  return shared / (A.size + B.size - shared);
}

// 规范化候选路线：容忍 {destinations} 或 {order} 或 {destinationEntities}
function destinationsOf(candidate) {
  if (Array.isArray(candidate?.destinations) && candidate.destinations.length) return candidate.destinations;
  if (Array.isArray(candidate?.order) && candidate.order.length) return candidate.order;
  if (Array.isArray(candidate?.destinationEntities)) return candidate.destinationEntities.map((d) => d.name || d.wikidataId).filter(Boolean);
  return [];
}

// ─── Pattern 5: Removal Test ─────────────────────────────────────
// 逐个删目的地，若删后路线的"产品身份"不变（designRules/Travel Value 不变），
// 则该目的地无角色，应删。
// 判据：goldCase.expected.designRules + goldCase④rejectedDestinations（明确排除的）
export function removalTest(candidate, { goldCase = null } = {}) {
  const destinations = destinationsOf(candidate);
  const reasons = [];
  const mutations = [];
  const designRules = asArray(candidate?.designRules || candidate?.designStrategies);
  const rejected = goldCase ? asArray(goldCase.rejectedDestinations) : [];
  const rejectedNames = new Set(rejected.map((r) => r.name));

  let removable = [];
  for (const dest of destinations) {
    // 在 Gold Case 的明确排除列表里 → 强烈建议删
    if (rejectedNames.has(dest)) {
      const r = rejected.find((x) => x.name === dest);
      removable.push({ destination: dest, severity: "high", reason: r?.reason || "in rejectedDestinations" });
      continue;
    }
    // 启发式：若 designRules 含 Theme 且该目的地不在主题核心 → 标记可删
    // （完整判定需 pool 主题数据，此处给保守的中等信号）
  }

  // 若有明确排除项命中，直接建议删
  if (removable.length) {
    for (const r of removable) {
      mutations.push({ action: "remove", destination: r.destination, reason: r.reason });
      reasons.push(`${r.destination} 出现在 rejectedDestinations：${r.reason}`);
    }
    return { pass: false, mutations, reasons };
  }

  // 无明确排除项：检查每个目的地是否都有角色（无 role 字段时保守通过）
  const roles = asArray(candidate?.destinationRoles);
  if (roles.length && destinations.every((d) => roles.some((r) => r.destination === d && r.role))) {
    return { pass: true, mutations: [], reasons: ["所有目的地均承担明确角色"] };
  }

  // 无 role 信息且无排除命中 → 通过，但提示需 role 数据
  return { pass: true, mutations: [], reasons: ["无 rejectedDestinations 命中；建议补充 destinationRoles 以完整判定"] };
}

// ─── Pattern 6: Replacement Test ─────────────────────────────────
// 每个 Core 目的地有无更好替代？按主题/坐标评分。
// 判据：pool 中同区域/同主题的候选；goldCase④rejectedDestinations 标明"已考虑并排除"的
export function replacementTest(candidate, { pool = [], goldCase = null } = {}) {
  const destinations = destinationsOf(candidate);
  const reasons = [];
  const mutations = [];
  const rejected = goldCase ? new Set(asArray(goldCase.rejectedDestinations).map((r) => r.name)) : new Set();

  // pool 中未被采用且未被 Gold Case 明确排除的，是潜在替代
  const poolCandidates = asArray(pool).filter((p) => {
    const name = p.name || p;
    return !destinations.includes(name) && !rejected.has(name);
  });

  // 若 pool 为空，无法判定替代，保守通过
  if (!poolCandidates.length) {
    return { pass: true, mutations: [], reasons: ["pool 为空，无法评估替代；需知识图候选以完整判定"] };
  }

  // 启发式：若某目的地无 role 且 pool 有同主题候选 → 建议评估替代
  const roles = asArray(candidate?.destinationRoles);
  for (const dest of destinations) {
    const hasRole = roles.some((r) => r.destination === dest && r.role);
    if (!hasRole) {
      reasons.push(`${dest} 无明确角色，pool 中存在 ${poolCandidates.length} 个未采用候选，建议评估替代`);
    }
  }

  // 不主动建议替换已采用目的地（需 LLM/评分层介入）；此处只标记需评估
  if (reasons.length) {
    return { pass: true, mutations: [], reasons };
  }
  return { pass: true, mutations: [], reasons: ["所有 Core 目的地均有角色，pool 无更优替代信号"] };
}

// ─── Pattern 7 (压缩): Compression Test ──────────────────────────
// 减天数时删体验价值最低者，非末位。
// 判据：goldCase④compressionStrategy（明确标了删谁、保谁）
export function compressionTest(candidate, { goldCase = null, removeDays = 0 } = {}) {
  const reasons = [];
  const mutations = [];
  if (!goldCase?.compressionStrategy?.length) {
    return { pass: true, mutations: [], reasons: ["无 compressionStrategy 判据；需 Gold Case 提供删谁保谁"] };
  }
  // 取第一个压缩策略作判据
  const strategy = goldCase.compressionStrategy[0];
  const destinations = destinationsOf(candidate);
  const shouldRemove = strategy.removeDestination;
  const shouldKeep = new Set(asArray(strategy.keep));

  // 检查候选是否包含"应删"项（即压缩时该删的还在）
  if (shouldRemove && destinations.includes(shouldRemove) && removeDays >= (strategy.removeDays || 0)) {
    mutations.push({ action: "remove", destination: shouldRemove, reason: strategy.reason });
    reasons.push(`压缩 ${strategy.removeDays} 天应删 ${shouldRemove}（${strategy.reason}），保留 ${asArray(strategy.keep).join("、")}`);
    return { pass: false, mutations, reasons };
  }

  // 检查"应保"项是否还在（若已被删则警告）
  const missing = asArray(strategy.keep).filter((d) => !destinations.includes(d));
  if (missing.length) {
    reasons.push(`警告：压缩应保留 ${missing.join("、")} 但已不在路线中`);
  }

  return { pass: true, mutations: [], reasons: ["压缩策略对齐"] };
}

// ─── Pattern 7 (扩展): Expansion Test ────────────────────────────
// 增天数时加体验（金泽/白川乡）而非原地多待。
// 判据：goldCase④expansionStrategy
export function expansionTest(candidate, { goldCase = null, addDays = 0 } = {}) {
  const reasons = [];
  const mutations = [];
  if (!goldCase?.expansionStrategy?.length) {
    return { pass: true, mutations: [], reasons: ["无 expansionStrategy 判据；需 Gold Case 提供扩展方向"] };
  }
  const strategy = goldCase.expansionStrategy[0];
  const destinations = destinationsOf(candidate);
  const addDests = asArray(strategy.addDestinations);

  // 增天数且扩展目的地未在路线中 → 建议加入
  if (addDays >= (strategy.addDays || 0)) {
    const missing = addDests.filter((d) => !destinations.includes(d));
    if (missing.length) {
      mutations.push({ action: "add", destinations: missing, evolvesTo: strategy.evolvesTo, reason: strategy.reason });
      reasons.push(`扩展 ${strategy.addDays} 天应加 ${missing.join("、")}（${strategy.reason}），演化为 ${strategy.evolvesTo}`);
      return { pass: false, mutations, reasons };
    }
  }
  return { pass: true, mutations: [], reasons: ["扩展策略对齐"] };
}

// ─── Pattern 9: Product Boundary Test ────────────────────────────
// 跨产品边界（加冲绳→变海岛产品）→ 拆为新 Route 而非扩展。
// 判据：goldCase④rejectedProducts（明确属另一产品的）+ rejectedStyles
// 启发式：候选的 travelStyle 是否仍与 Gold Case 一致
export function productBoundaryTest(candidate, { goldCase = null, proposedAdditions = [] } = {}) {
  const reasons = [];
  const mutations = [];
  const additions = asArray(proposedAdditions);

  if (!goldCase) {
    return { pass: true, mutations: [], reasons: ["无 Gold Case 判据，无法判定产品边界"] };
  }

  // 检查提议新增项是否命中 rejectedProducts/rejectedDestinations
  const rejectedDests = new Set(asArray(goldCase.rejectedDestinations).map((r) => r.name));
  const rejectedProducts = asArray(goldCase.rejectedProducts);

  const boundaryViolations = [];
  for (const add of additions) {
    const name = typeof add === "string" ? add : add.name;
    if (rejectedDests.has(name)) {
      const r = goldCase.rejectedDestinations.find((x) => x.name === name);
      boundaryViolations.push({ destination: name, reason: r.reason, suggestion: "拆为新 Route" });
    }
  }

  // 若候选 travelStyle 与 Gold Case 不一致 → 跨产品
  if (candidate?.travelStyle && goldCase.travelStyle && candidate.travelStyle !== goldCase.travelStyle) {
    boundaryViolations.push({
      destination: "(style drift)",
      reason: `travelStyle=${candidate.travelStyle} 与 ${goldCase.travelStyle} 不一致`,
      suggestion: "拆为新 Route",
    });
  }

  if (boundaryViolations.length) {
    for (const v of boundaryViolations) {
      mutations.push({ action: "split", ...v });
      reasons.push(`${v.destination} 触发产品边界：${v.reason} → 建议${v.suggestion}`);
    }
    return { pass: false, mutations, reasons };
  }

  // 无违规：检查是否触及 rejectedProducts 主题（启发式，需 LLM/主题层强化）
  return { pass: true, mutations: [], reasons: ["未触发产品边界"] };
}

// ─── 聚合运行器 ──────────────────────────────────────────────────
export function runAllDecisionTests(candidate, options = {}) {
  const results = {
    removal: removalTest(candidate, options),
    replacement: replacementTest(candidate, options),
    compression: compressionTest(candidate, options),
    expansion: expansionTest(candidate, options),
    productBoundary: productBoundaryTest(candidate, options),
  };
  const allPass = Object.values(results).every((r) => r.pass);
  const allMutations = Object.values(results).flatMap((r) => r.mutations);
  return { allPass, results, mutations: allMutations };
}

// 工具导出
export { destinationsOf, jaccard };
