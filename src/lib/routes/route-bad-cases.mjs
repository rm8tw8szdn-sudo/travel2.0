// Route V2 Bad Cases — failure-mode assets (spec 5.2)
//
// 这些不是"无法旅行"的路线，而是设计/定位/价值存在明显问题、
// 因此不应进入 Accepted Repository 的案例。
//
// 每个 Bad Case = { id, failureType, input, expectRejectAtLayer, reason, notes }
//   - failureType:        spec 5.2 的 10 类失败模式之一
//   - input:              触发该失败的输入（context 或候选路线）
//   - expectRejectAtLayer: 应在哪一层被拦截（concept / decision-test / validator / acceptance）
//   - reason:             为什么失败（供 Planner 学习"为什么不好"）
//
// 用途：
//   1. 回归测试：断言 Planner 管线在对应层 reject 该输入
//   2. LLM 反例语料：配合 Gold Case 的 ②Reasoning，教 Planner 识别低质量
//   3. Decision Tests 判据来源（如 failureType=duration-mismatch 喂 compression/productBoundary）

export const BAD_CASE_SCHEMA_VERSION = 1;

export const FAILURE_TYPES = [
  "random-destination-combination",
  "theme-conflict",
  "duration-mismatch",
  "geographic-inefficiency",
  "wrong-access-point",
  "mixed-destination-levels",
  "too-many-similar-stops",
  "evidence-driven-planning",
  "source-driven-planning",
  "repository-duplication",
];

export const BAD_CASES = [
  {
    id: "bad-1-random-combination",
    failureType: "random-destination-combination",
    input: {
      destinations: ["曼谷", "奠边府", "胡志明市"],
      note: "仅因出现在同一篇 Wikivoyage 而被组合",
    },
    expectRejectAtLayer: "concept",
    reason: "路线结构不成立，无明确旅行逻辑；目的地之间缺乏地理/主题/交通的内在联系。",
    notes: "Gold Case 4 的湄公河线（曼谷→暹粒→金边→胡志明）之所以成立，是因为有连续文化与交通逻辑，而非同源文章。",
  },
  {
    id: "bad-2-theme-conflict",
    failureType: "theme-conflict",
    input: {
      destinations: ["东京", "富士山", "北海道", "冲绳"],
      conflictingThemes: ["樱花", "滑雪", "海岛"],
    },
    expectRejectAtLayer: "concept",
    reason: "同一路线包含多个互不相关主题，没有任何单一主题成立；违背 Theme 的'主题唯一'规则。",
    notes: "对比 Gold Case 8（法国葡萄酒）——主题唯一，不加巴黎/尼斯。",
  },
  {
    id: "bad-3-duration-mismatch-classic",
    failureType: "duration-mismatch",
    input: {
      durationDays: 4,
      travelStyle: "Classic First Trip",
      destinations: ["巴黎", "阿姆斯特丹", "柏林", "布拉格"],
    },
    expectRejectAtLayer: "validator",
    reason: "4 天 4 城若 Travel Style=Classic 直接 Reject——Classic 不允许如此高密度；若改 Country Hopper 则可成立（见 Gold Case 4）。",
    notes: "同一目的地集，Style 不同则结论不同。这是 Style-aware Validation 的核心。",
  },
  {
    id: "bad-4-geographic-inefficiency",
    failureType: "geographic-inefficiency",
    input: {
      order: ["罗马", "佛罗伦萨", "威尼斯", "罗马"],
    },
    expectRejectAtLayer: "decision-test",
    reason: "存在明显折返（罗马→…→罗马），无产品价值；Travel Efficiency 规则失败。",
    notes: "对比 Gold Case 2（米兰→佛罗伦萨→罗马→那不勒斯）单向无折返。",
    relatedDecisionTest: "productBoundaryTest",
  },
  {
    id: "bad-5-wrong-access-point",
    failureType: "wrong-access-point",
    input: {
      travelStyle: "Pilgrimage",
      coreDestinations: ["大阪", "德岛", "高知", "松山", "高松"],
      note: "大阪被当作 Core Destination",
    },
    expectRejectAtLayer: "decision-test",
    reason: "把交通入口（大阪）当作核心景点；大阪应是 Access Point 而非 Core Destination。",
    notes: "对比 Gold Case 10——大阪仅交通入口，非巡礼线路组成。",
    relatedDecisionTest: "removalTest",
  },
  {
    id: "bad-6-mixed-destination-levels",
    failureType: "mixed-destination-levels",
    input: {
      destinations: ["北海道", "札幌", "日本", "富良野", "大雪山"],
      note: "行政区/国家/城市/景区混为同一级",
    },
    expectRejectAtLayer: "validator",
    reason: "目的地层级混乱——国家、行政区、城市、景区不能作为同一级目的地；Planner 必须 Reject。",
    notes: "目的地必须有明确的 Destination Level（country/region/city/attraction）。",
  },
  {
    id: "bad-7-too-many-similar-stops",
    failureType: "too-many-similar-stops",
    input: {
      travelStyle: "Theme",
      theme: "Wine",
      destinations: ["波尔多", "圣埃美隆", "梅多克", "波亚克", "玛歌", "波美侯", "圣于连"],
      note: "连续七个葡萄酒小镇",
    },
    expectRejectAtLayer: "decision-test",
    reason: "所有城市体验高度重复，无节奏变化，Travel Value 很低；违背 Theme 的'体验应有递进而非重复'。",
    notes: "对比 Gold Case 8——4 城且有阿卡雄作层次过渡，非连续酒庄。",
    relatedDecisionTest: "removalTest",
  },
  {
    id: "bad-8-evidence-driven-planning",
    failureType: "evidence-driven-planning",
    input: {
      note: "因 Evidence 足够所以生成路线，而非 Travel Value 足够",
      symptoms: "目的地来自 evidenceRepository.list() 的桶，而非知识图设计",
    },
    expectRejectAtLayer: "concept",
    reason: "Planner 最大的问题：因为 Evidence 够所以生成，而非 Travel Value 够才设计。Evidence 是必要条件非充分条件。",
    notes: "这正是 codex 旧 planner 的根因——coverageGroups(evidenceRepository.list()) 分桶。Phase 2 入口断言须拦截。",
  },
  {
    id: "bad-9-source-driven-planning",
    failureType: "source-driven-planning",
    input: {
      note: "因一篇 Wikivoyage 出现八个城市，于是全部生成 Candidate",
    },
    expectRejectAtLayer: "concept",
    reason: "应先形成 Route Concept 再判断哪些城市真正属于产品，而非源有什么就生成什么。",
    notes: "与 bad-8 同源——来源驱动而非设计驱动。",
  },
  {
    id: "bad-10-repository-duplication",
    failureType: "repository-duplication",
    input: {
      existingRoutes: [
        { id: "jp-classic-8d", destinations: ["东京", "京都", "大阪"], durationDays: 8 },
        { id: "jp-classic-9d", destinations: ["东京", "京都", "大阪"], durationDays: 9 },
        { id: "jp-classic-10d", destinations: ["东京", "京都", "大阪"], durationDays: 10 },
      ],
      newCandidate: { destinations: ["东京", "京都", "大阪"], durationDays: 9 },
    },
    expectRejectAtLayer: "acceptance",
    reason: "三条几乎完全一样只是多一天，不是三个产品；应只保留一个 Accepted。",
    notes: "Duplicate Is Not Similar 的反面——这里是真重复（同用户/同天数/同玩法），应拒绝。",
    relatedDecisionTest: "productBoundaryTest",
  },
];

const BAD_BY_ID = new Map(BAD_CASES.map((item) => [item.id, item]));

export function getBadCase(id) {
  return BAD_BY_ID.get(id) || null;
}

export function listBadCases({ failureType = null, layer = null } = {}) {
  return BAD_CASES.filter((item) =>
    (failureType == null || item.failureType === failureType) &&
    (layer == null || item.expectRejectAtLayer === layer),
  );
}

// 失败类型 → 关联的 Decision Test（供 route-decision-tests 取判据）
export function failureTypeToDecisionTest(failureType) {
  const map = {
    "geographic-inefficiency": "productBoundaryTest",
    "wrong-access-point": "removalTest",
    "too-many-similar-stops": "removalTest",
    "repository-duplication": "productBoundaryTest",
  };
  return map[failureType] || null;
}

// schema 自检
export function validateAllBadCases() {
  const errors = [];
  const VALID_LAYERS = ["concept", "decision-test", "validator", "acceptance"];
  for (const c of BAD_CASES) {
    const where = `bad case ${c.id || "(no id)"}`;
    if (!c.id) errors.push(`${where}: missing id`);
    if (!FAILURE_TYPES.includes(c.failureType)) errors.push(`${where}: unknown failureType ${c.failureType}`);
    if (!VALID_LAYERS.includes(c.expectRejectAtLayer)) errors.push(`${where}: invalid layer ${c.expectRejectAtLayer}`);
    if (!c.reason) errors.push(`${where}: missing reason`);
    if (!c.input) errors.push(`${where}: missing input`);
  }
  return { ok: errors.length === 0, errors };
}
