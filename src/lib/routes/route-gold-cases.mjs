// Route V2 Gold Cases — Knowledge Assets (not test data)
//
// 每个 Gold Case 是 Planner 的知识资产，四段式：
//   ① Route DNA            身份指纹
//   ①b Product Metadata    产品规格（productName/Summary/coreExperience/USP）
//   ② Planner Reasoning    step-aligned，每步 Step/Decision/Reason/Evidence·DesignRule/Alternatives Considered
//   ③ Structured Expected Output  机器可比（designRules 与 evidenceReferences 分离），宽松匹配
//   ④ Alternative / Rejection    五字段，直接服务 Decision Tests
//
// 枚举对齐（Phase 2 接 concept 模块）：
//   durationBand:        1-3d | 4-6d | 7-10d | 10-14d | 15d+
//   travelStyle (spec):  Classic First Trip | Deep Dive | Country Hopper | Rail Journey | Road Trip |
//                        Seasonal | Theme | Island Hopping | Pilgrimage | City Break
//   travelStyleConceptKey (route-planning-concept.mjs 的 concept key，Phase 2a 已对齐全部 10 style):
//                        classic-first-trip | deep-dive | country-hopper | rail-journey | road-trip |
//                        seasonal | theme | island-hopping | pilgrimage | city-break
//                        （transport-journey 为兜底，用于交通过程明确但铁路/公路/海岛均不显著时）
//   pace:                intensive | moderate | relaxed
//   designRules:         Geographic | Regional | Theme | Season | Transport | Travel Efficiency | Depth | Anchor + Satellite

import { createCanonicalGoldCaseAdditions } from "./route-gold-case-canonical-additions.mjs";

export const GOLD_CASE_SCHEMA_VERSION = 1;

// ─── 共用：构造单步推理 ───────────────────────────────────────────
function step(name, decision, reason, opts = {}) {
  return {
    step: name,
    decision,
    reason,
    ...(opts.evidenceOrRule ? { evidenceOrRule: opts.evidenceOrRule } : {}),
    ...(opts.alternativesConsidered ? { alternativesConsidered: opts.alternativesConsidered } : {}),
  };
}

// ─── Gold Case 1：日本经典初访（Classic First Trip / 东亚） ───────
const goldCase1 = {
  // ① Route DNA
  id: "gold-1-jp-first-trip",
  schemaVersion: GOLD_CASE_SCHEMA_VERSION,
  caseVersion: 1,
  durationDays: 8,
  durationBand: "7-10d",
  tripIntent: "First Trip",
  travelStyle: "Classic First Trip",
  travelStyleConceptKey: "classic-first-trip",
  season: "Spring / Autumn",
  country: "JP",
  region: "本州中部",
  pace: "Moderate",
  targetTraveler: "第一次去日本的人",
  whoShouldAvoid: "追求小众体验、希望高覆盖或深度文化的二次访日者",

  // ①b Product Metadata
  productName: "日本经典初访",
  productSummary: "8 天串联东京、富士山、京都、奈良、大阪，建立对日本最均衡的第一印象。",
  coreExperience: "现代都市 → 自然景观 → 古都文化 → 美食收束的完整初访体验",
  uniqueSellingPoint: "用最少的取舍覆盖日本最具代表性的文化、城市与自然，节奏不赶路。",

  // ② Planner Reasoning（step-aligned，每步含 Reason + Alternatives Considered）
  reasoning: [
    step("Duration", "8 天", "中等长度，可覆盖日本两个代表性区域，但不足以深度游全国或跨岛。",
      { alternativesConsidered: "5 天→只能单区域；12 天→应转向深度产品而非初访。" }),
    step("Trip Intent", "First Trip", "目标是第一次日本，优先代表性文化/城市/自然，非小众或高覆盖。",
      { alternativesConsidered: "Repeat Visit→应选中部/北陆；Seasonal→应围绕红叶/樱花窗口。" }),
    step("Travel Style", "Classic First Trip", "体验均衡，在有限时间建立完整第一印象，而非赶路或单区域深扎。"),
    step("Travel Value", "用一次旅行建立对日本最完整、最均衡的第一印象", "价值来自代表性而非覆盖率：删掉任一核心目的地，第一印象就缺一角。"),
    step("Destination Selection", "东京 / 富士山 / 京都 / 奈良 / 大阪",
      "东京=国际门户+都市；富士山=自然缓冲，过渡都市到古都；京都=传统文化不可替代；奈良=京都延伸以减少换酒店；大阪=美食+返程枢纽。",
      { evidenceOrRule: "Geographic（空间连续）+ Travel Efficiency（减少折返）+ Classic（代表性优先）",
        alternativesConsidered: "北海道/九州/金泽→更适合二次访日，排除；威尼斯式长移动→破坏节奏，排除。" }),
    step("Route Order", "东京 → 富士山 → 京都 → 奈良 → 大阪",
      "都市→自然→古都→延伸→都市，节奏从现代过渡到传统再收束于美食返程。",
      { evidenceOrRule: "Travel Efficiency（避免折返）+ Geographic（由东向西顺路）" }),
    step("Alternatives", "排除北海道/九州/金泽；不加威尼斯类长移动",
      "这些更适合 Repeat Visit 或会破坏初访主线节奏；加入即变成另一产品。",
      { alternativesConsidered: "加金泽/白川乡→演化为 Deep Dive 新产品（见 expansionStrategy）。" }),
  ],

  // ③ Structured Expected Output（designRules 与 evidenceReferences 分离）
  expected: {
    destinations: ["东京", "富士山", "京都", "奈良", "大阪"],
    order: ["东京", "富士山", "京都", "奈良", "大阪"],
    travelStyle: "Classic First Trip",
    designRules: ["Geographic", "Travel Efficiency", "Depth"],
    evidenceReferences: [], // Phase 4 Tavily 采集后回填
    travelValue: "用一次旅行建立对日本最完整、最均衡的第一印象",
    pace: "Moderate",
    targetTraveler: "第一次去日本的人",
    whoShouldAvoid: "追求小众体验、希望高覆盖或深度文化的二次访日者",
    bestMonths: ["3-5月", "10-11月"],
  },

  // ④ Alternative / Rejection（五字段，服务 Decision Tests）
  rejectedDestinations: [
    { name: "北海道", reason: "需额外长距离移动，更适合二次访日" },
    { name: "九州", reason: "跨岛跨度大，破坏初访主线节奏" },
    { name: "金泽/白川乡", reason: "属中部深度产品，不适合初访" },
  ],
  rejectedStyles: [
    { style: "Deep Dive", reason: "目标是初访覆盖，不是单区域深扎" },
    { style: "Country Hopper", reason: "单国产品，无多国需求" },
  ],
  rejectedProducts: [
    { product: "日本温泉之旅", reason: "主题产品，应独立设计（Theme）" },
    { product: "日本铁路体验", reason: "交通产品，应独立设计（Rail Journey）" },
  ],
  expansionStrategy: [
    { addDays: 3, addDestinations: ["金泽", "白川乡"], evolvesTo: "Deep Dive 新产品", reason: "加体验而非原地多待" },
  ],
  compressionStrategy: [
    { removeDays: 2, removeDestination: "奈良", keep: ["东京", "京都", "大阪"], reason: "奈良为延伸，体验价值最低，非末位删除" },
  ],

  // 断言阈值（宽松匹配）
  assertions: { minDestJaccard: 0.6, orderPass: true, styleExact: true, rulesExact: true },
};

// ─── Gold Case 2：意大利第一次旅行（Classic First Trip / 欧洲） ──
const goldCase2 = {
  id: "gold-2-it-first-trip",
  schemaVersion: GOLD_CASE_SCHEMA_VERSION,
  caseVersion: 1,
  durationDays: 9,
  durationBand: "7-10d",
  tripIntent: "First Trip",
  travelStyle: "Classic First Trip",
  travelStyleConceptKey: "classic-first-trip",
  season: "April–June / September–October",
  country: "IT",
  region: "北部至南部",
  pace: "Moderate",
  targetTraveler: "第一次去意大利的人",
  whoShouldAvoid: "只想去海滩度假、或希望深度单一区域的人",

  productName: "意大利经典初访",
  productSummary: "9 天米兰→佛罗伦萨→罗马→那不勒斯，南下体验历史、艺术与生活方式脉络。",
  coreExperience: "现代都市 → 文艺复兴 → 古罗马 → 南意生活的文化层次递进",
  uniqueSellingPoint: "用一条南下路线串联意大利最具辨识度的四个文化层，而非堆砌城市。",

  reasoning: [
    step("Duration", "9 天", "足够覆盖意大利四个代表性文化层，但不足以同时加威尼斯或西西里。"),
    step("Trip Intent", "First Trip", "第一次意大利，应覆盖最具代表性的文化层次，而非最多城市。"),
    step("Travel Style", "Classic First Trip", "以代表性文化层为主线，节奏适中。"),
    step("Travel Value", "用一条南下路线体验意大利历史、艺术与生活方式的发展脉络", "价值在文化递进，不在城市数量。"),
    step("Destination Selection", "米兰 / 佛罗伦萨 / 罗马 / 那不勒斯",
      "米兰=国际入口+现代都市；佛罗伦萨=文艺复兴；罗马=古罗马文明；那不勒斯=南意文化与生活方式。",
      { evidenceOrRule: "Geographic（由北向南顺路）+ Travel Efficiency（单向不折返）+ Classic（代表性优先）",
        alternativesConsidered: "威尼斯→9天加它意味长距离移动却不显著提升初访体验，排除。" }),
    step("Route Order", "米兰 → 佛罗伦萨 → 罗马 → 那不勒斯", "由北向南单向推进，体验强度递增，无折返。"),
    step("Alternatives", "不加威尼斯", "加入增加长移动、压缩停留，Travel Value 反而下降。"),
  ],

  expected: {
    destinations: ["米兰", "佛罗伦萨", "罗马", "那不勒斯"],
    order: ["米兰", "佛罗伦萨", "罗马", "那不勒斯"],
    travelStyle: "Classic First Trip",
    designRules: ["Geographic", "Travel Efficiency", "Depth"],
    evidenceReferences: [],
    travelValue: "用一条南下路线体验意大利历史、艺术与生活方式的发展脉络",
    pace: "Moderate",
    targetTraveler: "第一次去意大利的人",
    whoShouldAvoid: "只想去海滩度假、或希望深度单一区域的人",
    bestMonths: ["4-6月", "9-10月"],
  },

  rejectedDestinations: [
    { name: "威尼斯", reason: "9天加入意味长距离移动，不显著提升初访体验" },
    { name: "西西里", reason: "跨岛，属另一产品" },
  ],
  rejectedStyles: [
    { style: "Deep Dive", reason: "初访覆盖为目标，非托斯卡纳深扎" },
  ],
  rejectedProducts: [
    { product: "托斯卡纳深度", reason: "区域 Deep Dive，应独立" },
  ],
  expansionStrategy: [
    { addDays: 3, addDestinations: ["威尼斯", "五渔村"], evolvesTo: "意大利扩展经典", reason: "加体验层而非原地延长" },
  ],
  compressionStrategy: [
    { removeDays: 2, removeDestination: "那不勒斯", keep: ["米兰", "佛罗伦萨", "罗马"], reason: "南意为延伸层，价值最低" },
  ],

  assertions: { minDestJaccard: 0.6, orderPass: true, styleExact: true, rulesExact: true },
};

// ─── Gold Case 3：日本中部深度（Deep Dive） ─────────────────────
const goldCase3 = {
  id: "gold-3-jp-alps-deep-dive",
  schemaVersion: GOLD_CASE_SCHEMA_VERSION,
  caseVersion: 1,
  durationDays: 10,
  durationBand: "10-14d",
  tripIntent: "Repeat Visit",
  travelStyle: "Deep Dive",
  travelStyleConceptKey: "deep-dive",
  season: "Spring / Autumn",
  country: "JP",
  region: "日本中部（北陆/飞驒）",
  pace: "Relaxed",
  targetTraveler: "二刷日本、喜欢自然和传统文化的人",
  whoShouldAvoid: "第一次来日本、希望一次看完所有经典城市的人",

  productName: "日本中部深度",
  productSummary: "10 天金泽→白川乡→高山→上高地→松本，深入北陆文化与日本阿尔卑斯。",
  coreExperience: "北陆文化 → 飞驒古镇 → 日本阿尔卑斯山岳的连续深度体验",
  uniqueSellingPoint: "看见游客很少看到的日本，以完整区域体验为单位而非国家。",

  reasoning: [
    step("Duration", "10 天", "足够完成一个区域的深度，但不适合跨多区域。"),
    step("Trip Intent", "Repeat Visit", "已去过东京京都，希望看到更多日本不同风景，而非经典城市。"),
    step("Travel Style", "Deep Dive", "核心是不增加目的地数量，在有限区域获更完整体验，主动降跨区域移动、增停留。"),
    step("Travel Value", "看见游客很少看到的日本", "价值来自区域完整性，Deep Dive 不以国家为单位，以完整旅行区域为单位。"),
    step("Destination Selection", "金泽 / 白川乡 / 高山 / 上高地 / 松本",
      "金泽=北陆门户+文化；白川乡=金泽与高山间自然串联；高山=飞驒古镇；上高地=山岳自然；松本=返程+城堡文化闭环。",
      { evidenceOrRule: "Regional（同一旅行区域）+ Depth（完整体验优先）+ Geographic（顺路无折返）",
        alternativesConsidered: "东京/京都→已满足初访，不加；大阪→属另一产品，排除。" }),
    step("Route Order", "金泽 → 白川乡 → 高山 → 上高地 → 松本", "由门户深入山岳再收束于返程城市，文化→自然的节奏过渡。"),
    step("Alternatives", "不加大阪/东京", "它们属另一产品；加入即破坏 Deep Dive 的区域完整性。"),
  ],

  expected: {
    destinations: ["金泽", "白川乡", "高山", "上高地", "松本"],
    order: ["金泽", "白川乡", "高山", "上高地", "松本"],
    travelStyle: "Deep Dive",
    designRules: ["Regional", "Depth", "Geographic"],
    evidenceReferences: [],
    travelValue: "看见游客很少看到的日本",
    pace: "Relaxed",
    targetTraveler: "二刷日本、喜欢自然和传统文化的人",
    whoShouldAvoid: "第一次来日本、希望一次看完所有经典城市的人",
    bestMonths: ["3-5月", "10-11月"],
  },

  rejectedDestinations: [
    { name: "大阪", reason: "属另一产品，破坏区域完整性" },
    { name: "北海道", reason: "跨区域跨度过大，破坏 Deep Dive" },
  ],
  rejectedStyles: [
    { style: "Country Hopper", reason: "单区域产品，无多国需求" },
    { style: "Classic First Trip", reason: "目标是深度，非代表性覆盖" },
  ],
  rejectedProducts: [
    { product: "日本经典初访", reason: "初访产品，与 Deep Dive 互斥" },
  ],
  expansionStrategy: [
    { addDays: 3, addDestinations: ["新潟", "佐渡岛"], evolvesTo: "本州北部 Deep Dive 扩展", reason: "同区域延伸" },
  ],
  compressionStrategy: [
    { removeDays: 2, removeDestination: "上高地", keep: ["金泽", "白川乡", "高山", "松本"], reason: "上高地季节性强、可达性低，价值可舍" },
  ],

  assertions: { minDestJaccard: 0.6, orderPass: true, styleExact: true, rulesExact: true },
};

// ─── Gold Case 4：中欧四国快闪（Country Hopper） ─────────────────
const goldCase4 = {
  id: "gold-4-central-europe-hopper",
  schemaVersion: GOLD_CASE_SCHEMA_VERSION,
  caseVersion: 1,
  durationDays: 7,
  durationBand: "7-10d",
  tripIntent: "Country Collection",
  travelStyle: "Country Hopper",
  travelStyleConceptKey: "country-hopper",
  season: "April–October",
  country: "AT/SK/HU/CZ",
  region: "中欧",
  pace: "Intensive",
  targetTraveler: "第一次欧洲、希望短时间体验多个国家的人",
  whoShouldAvoid: "想慢游、亲子出行、不喜欢频繁换城市或第一次长线旅行的人",

  productName: "中欧四国快闪",
  productSummary: "7 天维也纳→布拉迪斯拉发→布达佩斯→布拉格，以最低移动成本体验四国。",
  coreExperience: "四个中欧首都的文化差异与高效率铁路串联",
  uniqueSellingPoint: "考验交通效率而非国家数量——4 天 4 国因成熟铁路而成立。",

  reasoning: [
    step("Duration", "7 天", "不足以深度游一国，也不足以覆盖全欧，但适合多国快闪。"),
    step("Trip Intent", "Country Collection", "希望在有限时间体验多个国家，而非单国深度。"),
    step("Travel Style", "Country Hopper", "目标是最低移动成本体验多国，允许高移动强度但要求成熟交通连接。"),
    step("Travel Value", "用最少的移动成本体验四个中欧国家不同的历史与文化", "价值在交通效率与国家切换的体验差异，不在国旗数量。"),
    step("Destination Selection", "维也纳 / 布拉迪斯拉发 / 布达佩斯 / 布拉格",
      "四城间成熟铁路、跨境简单、短时间完成国家切换；每城文化特色鲜明。维也纳=入口枢纽；布拉迪斯拉发=距维也纳<1h 轻松第二国；布达佩斯=多瑙文化；布拉格=收束。",
      { evidenceOrRule: "Transport（成熟铁路连接）+ Travel Efficiency（单向无折返）+ Geographic（整体向西北推进）",
        alternativesConsidered: "德国→城市间移动时间长，排除；萨尔茨堡→加它拉长移动不符 7 天，排除。" }),
    step("Route Order", "维也纳 → 布拉迪斯拉发 → 布达佩斯 → 布拉格", "整体向西北推进避免折返；维也纳为入口因国际航班丰富。"),
    step("Alternatives", "不加德国/萨尔茨堡", "加入明显增加移动时间，不符 Country Hopper 的效率目标。"),
  ],

  expected: {
    destinations: ["维也纳", "布拉迪斯拉发", "布达佩斯", "布拉格"],
    order: ["维也纳", "布拉迪斯拉发", "布达佩斯", "布拉格"],
    travelStyle: "Country Hopper",
    designRules: ["Transport", "Travel Efficiency", "Geographic"],
    evidenceReferences: [],
    travelValue: "用最少的移动成本体验四个中欧国家不同的历史与文化",
    pace: "Intensive",
    targetTraveler: "第一次欧洲、希望短时间体验多个国家的人",
    whoShouldAvoid: "想慢游、亲子出行、不喜欢频繁换城市或第一次长线旅行的人",
    bestMonths: ["4-10月"],
  },

  rejectedDestinations: [
    { name: "慕尼黑（德国）", reason: "城市间移动时间长，削弱中欧城市链完整性" },
    { name: "萨尔茨堡", reason: "加它拉长移动，不符 7 天效率目标" },
  ],
  rejectedStyles: [
    { style: "Classic First Trip", reason: "目标是多国，非单国经典" },
    { style: "Deep Dive", reason: "无单区域深扎需求" },
  ],
  rejectedProducts: [
    { product: "奥地利深度", reason: "单国产品，与多国快闪互斥" },
  ],
  expansionStrategy: [
    { addDays: 3, addDestinations: ["克拉科夫", "德累斯顿"], evolvesTo: "中欧扩展快闪", reason: "同铁路网延伸，不破坏效率" },
  ],
  compressionStrategy: [
    { removeDays: 2, removeDestination: "布拉迪斯拉发", keep: ["维也纳", "布达佩斯", "布拉格"], reason: "布拉迪斯拉发体验最轻，可舍" },
  ],

  assertions: { minDestJaccard: 0.6, orderPass: true, styleExact: true, rulesExact: true },
};

// ─── Gold Case 5：苏格兰高地自驾（Road Trip） ─────────────────────
const goldCase5 = {
  id: "gold-5-scotland-road-trip",
  schemaVersion: GOLD_CASE_SCHEMA_VERSION,
  caseVersion: 1,
  durationDays: 7,
  durationBand: "7-10d",
  tripIntent: "Scenic Nature",
  travelStyle: "Road Trip",
  travelStyleConceptKey: "road-trip",
  season: "May–September",
  country: "GB",
  region: "苏格兰高地",
  pace: "Moderate",
  targetTraveler: "喜欢驾驶、摄影和自然风光的旅行者",
  whoShouldAvoid: "没有驾照、不愿长时间开车或希望以城市观光为主的人",

  productName: "苏格兰高地自驾",
  productSummary: "7 天爱丁堡→凯恩戈姆→尼斯湖→威廉堡→格伦科→格拉斯哥的高地环线。",
  coreExperience: "高地自然景观公路驾驶，城市只是入口出口",
  uniqueSellingPoint: "公路本身是景点——每天 2-4 小时驾驶，每天都有不同自然景观。",

  reasoning: [
    step("Duration", "7 天", "适合中等长度自驾，优先风景公路而非铁路或城市串联。"),
    step("Trip Intent", "Scenic Nature", "希望体验自然风景、沿途驾驶和国家公园，而非打卡城市。"),
    step("Travel Style", "Road Trip", "让驾驶本身成为旅行体验；每日驾驶距离、路况、景观变化比城市数量重要。"),
    step("Travel Value", "一次完整体验苏格兰高地，而不是打卡苏格兰城市", "价值在公路与景观，城市只是停车点。"),
    step("Destination Selection", "爱丁堡 / 凯恩戈姆国家公园 / 尼斯湖 / 威廉堡 / 格伦科 / 格拉斯哥",
      "爱丁堡=入口；凯恩戈姆/尼斯湖/威廉堡/格伦科=高地核心景观；格拉斯哥=出口。城市只是起止点。",
      { evidenceOrRule: "Geographic（环线无折返）+ Travel Efficiency（每日驾驶 2-4h 均匀分散）+ Depth（高地重点而非全英）",
        alternativesConsidered: "爱丁堡→阿伯丁→因弗内斯→格拉斯哥→大量时间在高速、缺高地代表景观，价值更低，排除。" }),
    step("Route Order", "爱丁堡 → 凯恩戈姆 → 尼斯湖 → 威廉堡 → 格伦科 → 格拉斯哥", "环线结构，从东进入高地再由西部返回，避免折返。"),
    step("Alternatives", "不加天空岛", "7 天加它会让后半段变赶路，压缩高地停留。"),
  ],

  expected: {
    destinations: ["爱丁堡", "凯恩戈姆国家公园", "尼斯湖", "威廉堡", "格伦科", "格拉斯哥"],
    order: ["爱丁堡", "凯恩戈姆国家公园", "尼斯湖", "威廉堡", "格伦科", "格拉斯哥"],
    travelStyle: "Road Trip",
    designRules: ["Geographic", "Travel Efficiency", "Depth"],
    evidenceReferences: [],
    travelValue: "一次完整体验苏格兰高地，而不是打卡苏格兰城市",
    pace: "Moderate",
    targetTraveler: "喜欢驾驶、摄影和自然风光的旅行者",
    whoShouldAvoid: "没有驾照、不愿长时间开车或希望以城市观光为主的人",
    bestMonths: ["5-9月"],
  },

  rejectedDestinations: [
    { name: "天空岛", reason: "7 天加它会让后半段变赶路" },
    { name: "阿伯丁", reason: "城市导向，缺高地代表景观" },
  ],
  rejectedStyles: [
    { style: "Classic First Trip", reason: "重点是驾驶与景观，非城市覆盖" },
  ],
  rejectedProducts: [
    { product: "苏格兰城市游", reason: "城市产品，与自驾高地互斥" },
  ],
  expansionStrategy: [
    { addDays: 2, addDestinations: ["天空岛"], evolvesTo: "高地扩展自驾", reason: "加天空岛需更多时间以保节奏" },
  ],
  compressionStrategy: [
    { removeDays: 2, removeDestination: "凯恩戈姆国家公园", keep: ["爱丁堡", "尼斯湖", "威廉堡", "格伦科", "格拉斯哥"], reason: "凯恩戈姆为可选自然段，价值可舍" },
  ],

  assertions: { minDestJaccard: 0.5, orderPass: true, styleExact: true, rulesExact: true },
};

// ─── Gold Case 6：瑞士景观铁路（Rail Journey） ───────────────────
const goldCase6 = {
  id: "gold-6-swiss-rail-journey",
  schemaVersion: GOLD_CASE_SCHEMA_VERSION,
  caseVersion: 1,
  durationDays: 8,
  durationBand: "7-10d",
  tripIntent: "Scenic Rail Experience",
  travelStyle: "Rail Journey",
  travelStyleConceptKey: "rail-journey",
  season: "June–September",
  country: "CH",
  region: "瑞士全境",
  pace: "Relaxed",
  targetTraveler: "把铁路过程本身视为旅行体验的人",
  whoShouldAvoid: "不喜欢长时间在路上或只想停留城市体验的人",

  productName: "瑞士景观铁路",
  productSummary: "8 天卢塞恩→因特拉肯→采尔马特→圣莫里茨→卢加诺，串联三条世界级景观铁路。",
  coreExperience: "Glacier Express / Bernina Express / GoldenPass 三条铁路本身即景点",
  uniqueSellingPoint: "铁路是产品，城市只是换乘节点——Validator 不会因城市少而 reject。",

  reasoning: [
    step("Duration", "8 天", "足够串联三条景观铁路并保留沿线停留。"),
    step("Trip Intent", "Scenic Rail Experience", "体验瑞士景观铁路，而非城市。"),
    step("Travel Style", "Rail Journey", "铁路本身就是旅行体验；城市只是换乘节点。"),
    step("Travel Value", "一次旅行体验瑞士最经典的三条景观铁路", "价值在铁路连续性与景观，不在城市数量。"),
    step("Destination Selection", "卢塞恩 / 因特拉肯 / 采尔马特 / 圣莫里茨 / 卢加诺",
      "围绕 GoldenPass/Glacier Express/Bernina Express 组织；采尔马特=Glacier Express 节点；卢加诺=Bernina 终点闭环。",
      { evidenceOrRule: "Transport（铁路连续性）+ Geographic（自然闭环）+ Depth（铁路体验深度）",
        alternativesConsidered: "苏黎世/伯尔尼/日内瓦→无法增加铁路体验价值，排除。" }),
    step("Route Order", "卢塞恩 → 因特拉肯 → 采尔马特 → 圣莫里茨 → 卢加诺", "沿三条铁路自然推进，终点形成闭环。"),
    step("Alternatives", "不加日内瓦", "它无法增加铁路体验价值，离开铁路网络无意义。"),
  ],

  expected: {
    destinations: ["卢塞恩", "因特拉肯", "采尔马特", "圣莫里茨", "卢加诺"],
    order: ["卢塞恩", "因特拉肯", "采尔马特", "圣莫里茨", "卢加诺"],
    travelStyle: "Rail Journey",
    designRules: ["Transport", "Geographic", "Depth"],
    evidenceReferences: [],
    travelValue: "一次旅行体验瑞士最经典的三条景观铁路",
    pace: "Relaxed",
    targetTraveler: "把铁路过程本身视为旅行体验的人",
    whoShouldAvoid: "不喜欢长时间在路上或只想停留城市体验的人",
    bestMonths: ["6-9月"],
  },

  rejectedDestinations: [
    { name: "日内瓦", reason: "无法增加铁路体验价值" },
    { name: "苏黎世", reason: "城市节点，非铁路核心" },
  ],
  rejectedStyles: [
    { style: "Classic First Trip", reason: "重点是铁路，非城市覆盖" },
    { style: "Country Hopper", reason: "单国产品" },
  ],
  rejectedProducts: [
    { product: "瑞士城市游", reason: "城市产品，与铁路体验互斥" },
  ],
  expansionStrategy: [
    { addDays: 3, addDestinations: ["蒙特勒", "洛伊克巴德"], evolvesTo: "瑞士扩展铁路", reason: "沿铁路网延伸" },
  ],
  compressionStrategy: [
    { removeDays: 2, removeDestination: "卢加诺", keep: ["卢塞恩", "因特拉肯", "采尔马特", "圣莫里茨"], reason: "卢加诺为闭环终点，可舍" },
  ],

  assertions: { minDestJaccard: 0.5, orderPass: true, styleExact: true, rulesExact: true },
};

// ─── Gold Case 7：日本关西红叶（Seasonal） ───────────────────────
const goldCase7 = {
  id: "gold-7-jp-autumn-seasonal",
  schemaVersion: GOLD_CASE_SCHEMA_VERSION,
  caseVersion: 1,
  durationDays: 8,
  durationBand: "7-10d",
  tripIntent: "Autumn Foliage",
  travelStyle: "Seasonal",
  travelStyleConceptKey: "seasonal",
  season: "11 月中下旬",
  country: "JP",
  region: "关西",
  pace: "Relaxed",
  targetTraveler: "摄影爱好者、自然景观爱好者及二次访日游客",
  whoShouldAvoid: "希望一次覆盖东京京都大阪全部经典景点的首次旅行者",

  productName: "日本关西红叶季",
  productSummary: "8 天京都→岚山→宇治→奈良→高野山，围绕 11 月红叶最佳窗口设计。",
  coreExperience: "关西红叶时间高度重叠的多目的地连续赏叶",
  uniqueSellingPoint: "季节是第一约束——即使有更经典城市，也不为覆盖率破坏最佳季节体验。",

  reasoning: [
    step("Duration", "8 天", "旅行日期 11 月中旬已定，季节成为第一约束而非城市位置。"),
    step("Trip Intent", "Autumn Foliage", "目标是赏红叶，不是第一次日本。"),
    step("Travel Style", "Seasonal", "目标是在最佳时间连续体验同一季节主题，允许减城市以换完整体验。"),
    step("Travel Value", "一次看见关西最美的秋天", "价值来自季节窗口的一致性，非地点本身。"),
    step("Destination Selection", "京都 / 岚山 / 宇治 / 奈良 / 高野山",
      "红叶时间高度重叠的关西目的地；京都=红叶景点最丰富+交通中心；岚山=避首日人流；宇治奈良=周边延伸减换酒店；高野山=安静收尾。",
      { evidenceOrRule: "Season（红叶时间窗口一致）+ Regional（关西同区域）+ Travel Efficiency（减少长移动）",
        alternativesConsidered: "东京→红叶时间略晚于京都，季节一致性下降，排除；白川乡→已接近红叶尾声，排除。" }),
    step("Route Order", "京都 → 岚山 → 宇治 → 奈良 → 高野山", "由热闹古都过渡到山林寺院，体验渐入安静。"),
    step("Alternatives", "不加东京/白川乡", "东京红叶时间略晚降低一致性；白川乡已近尾声不符窗口。"),
  ],

  expected: {
    destinations: ["京都", "岚山", "宇治", "奈良", "高野山"],
    order: ["京都", "岚山", "宇治", "奈良", "高野山"],
    travelStyle: "Seasonal",
    designRules: ["Season", "Regional", "Travel Efficiency"],
    evidenceReferences: [],
    travelValue: "一次看见关西最美的秋天",
    pace: "Relaxed",
    targetTraveler: "摄影爱好者、自然景观爱好者及二次访日游客",
    whoShouldAvoid: "希望一次覆盖东京京都大阪全部经典景点的首次旅行者",
    bestMonths: ["11月中下旬"],
  },

  rejectedDestinations: [
    { name: "东京", reason: "红叶时间略晚于京都，季节一致性下降" },
    { name: "白川乡", reason: "已接近红叶尾声，不符时间窗口" },
  ],
  rejectedStyles: [
    { style: "Classic First Trip", reason: "目标是季节主题，非初访覆盖" },
  ],
  rejectedProducts: [
    { product: "日本经典初访", reason: "初访产品，会破坏季节一致性" },
  ],
  expansionStrategy: [
    { addDays: 2, addDestinations: ["大原", "贵船"], evolvesTo: "关西红叶扩展", reason: "同季节窗口同区域延伸" },
  ],
  compressionStrategy: [
    { removeDays: 2, removeDestination: "高野山", keep: ["京都", "岚山", "宇治", "奈良"], reason: "高野山为收尾点缀，价值可舍" },
  ],

  assertions: { minDestJaccard: 0.5, orderPass: true, styleExact: true, rulesExact: true },
};

// ─── Gold Case 8：法国葡萄酒之路（Theme） ────────────────────────
const goldCase8 = {
  id: "gold-8-france-wine-theme",
  schemaVersion: GOLD_CASE_SCHEMA_VERSION,
  caseVersion: 1,
  durationDays: 6,
  durationBand: "4-6d",
  tripIntent: "Wine Experience",
  travelStyle: "Theme",
  travelStyleConceptKey: "theme",
  season: "September–October",
  country: "FR",
  region: "波尔多/阿尔萨斯",
  pace: "Relaxed",
  targetTraveler: "葡萄酒爱好者、希望深入体验酒庄文化的人",
  whoShouldAvoid: "对葡萄酒不感兴趣、希望覆盖法国经典城市的人",

  productName: "法国葡萄酒之路",
  productSummary: "6 天波尔多→圣埃美隆→梅多克→阿卡雄，深入顶级葡萄酒产区。",
  coreExperience: "酒庄、品酒课程与当地美食的连续主题体验",
  uniqueSellingPoint: "主题唯一——不加巴黎/尼斯，因为它们会破坏葡萄酒主题。",

  reasoning: [
    step("Duration", "6 天", "足够深入一个葡萄酒产区，不适合同时覆盖多区域。"),
    step("Trip Intent", "Wine Experience", "目标是体验顶级葡萄酒产区，非法国初访。"),
    step("Travel Style", "Theme", "整个旅行围绕一种体验展开，地点服务于体验。"),
    step("Travel Value", "深入体验波尔多葡萄酒文化", "价值在主题完整性，删一城对主题无影响则不该存在。"),
    step("Destination Selection", "波尔多 / 圣埃美隆 / 梅多克 / 阿卡雄",
      "围绕葡萄园/酒庄/品酒组织；阿卡雄=最后一天从葡萄园过渡到海岸，增体验层次而非续参观酒庄。",
      { evidenceOrRule: "Theme（主题唯一）+ Regional（同一产区）+ Travel Efficiency（短距离）",
        alternativesConsidered: "巴黎/尼斯/里昂→破坏葡萄酒主题，排除。" }),
    step("Route Order", "波尔多 → 圣埃美隆 → 梅多克 → 阿卡雄", "由中心产区到海岸收尾，避免连续酒庄审美疲劳。"),
    step("Alternatives", "不加巴黎/尼斯", "它们会破坏 Theme 的唯一性。"),
  ],

  expected: {
    destinations: ["波尔多", "圣埃美隆", "梅多克", "阿卡雄"],
    order: ["波尔多", "圣埃美隆", "梅多克", "阿卡雄"],
    travelStyle: "Theme",
    designRules: ["Theme", "Regional", "Travel Efficiency"],
    evidenceReferences: [],
    travelValue: "深入体验波尔多葡萄酒文化",
    pace: "Relaxed",
    targetTraveler: "葡萄酒爱好者、希望深入体验酒庄文化的人",
    whoShouldAvoid: "对葡萄酒不感兴趣、希望覆盖法国经典城市的人",
    bestMonths: ["9-10月"],
  },

  rejectedDestinations: [
    { name: "巴黎", reason: "破坏葡萄酒主题唯一性" },
    { name: "尼斯", reason: "海滨产品，与酒庄主题无关" },
  ],
  rejectedStyles: [
    { style: "Classic First Trip", reason: "目标是主题，非法国初访覆盖" },
  ],
  rejectedProducts: [
    { product: "法国经典初访", reason: "初访产品，会破坏主题" },
  ],
  expansionStrategy: [
    { addDays: 3, addDestinations: ["阿尔萨斯（科尔马/里屈埃维）"], evolvesTo: "法国双产区葡萄酒扩展", reason: "同主题跨产区延伸" },
  ],
  compressionStrategy: [
    { removeDays: 1, removeDestination: "阿卡雄", keep: ["波尔多", "圣埃美隆", "梅多克"], reason: "阿卡雄为层次点缀，非主题核心" },
  ],

  assertions: { minDestJaccard: 0.5, orderPass: true, styleExact: true, rulesExact: true },
};

// ─── Gold Case 9：希腊基克拉泽跳岛（Island Hopping） ─────────────
const goldCase9 = {
  id: "gold-9-greece-island-hopping",
  schemaVersion: GOLD_CASE_SCHEMA_VERSION,
  caseVersion: 1,
  durationDays: 8,
  durationBand: "7-10d",
  tripIntent: "First Greek Islands",
  travelStyle: "Island Hopping",
  travelStyleConceptKey: "island-hopping",
  season: "May–September",
  country: "GR",
  region: "基克拉泽群岛",
  pace: "Moderate",
  targetTraveler: "第一次去希腊、想体验经典海岛的人",
  whoShouldAvoid: "不喜欢坐船、晕船、想深度历史文化的人",

  productName: "希腊跳岛",
  productSummary: "8 天雅典→圣托里尼→纳克索斯→帕罗斯→雅典，三岛不同性格的爱琴海体验。",
  coreExperience: "经典景观岛 + 本地生活岛 + 慢节奏港镇的递进",
  uniqueSellingPoint: "每座岛不同角色，而非换酒店继续度假——8 天加第四岛会每天赶船。",

  reasoning: [
    step("Duration", "8 天", "不适合走太多岛也不适合只待雅典，选 Island Hopping。"),
    step("Trip Intent", "First Greek Islands", "想体验爱琴海，非雅典历史深度。"),
    step("Travel Style", "Island Hopping", "交通、节奏、岛屿个性共同组成体验，每岛须有不同角色。"),
    step("Travel Value", "一次体验不同性格的爱琴海岛屿，而不是打卡最多岛", "价值在岛屿角色差异，不在数量。"),
    step("Destination Selection", "雅典 / 圣托里尼 / 纳克索斯 / 帕罗斯",
      "雅典=国际入口+历史起点，1-2 天即可；圣托里尼=经典景观但不适合撑全程（贵/人多/偏观光）；纳克索斯+帕罗斯=补足松弛本地化体验。",
      { evidenceOrRule: "Regional（同一群岛）+ Travel Efficiency（成熟渡轮连接）+ Theme（爱琴海生活方式）",
        alternativesConsidered: "米科诺斯→圣托里尼+米科诺斯易变高消费打卡线，8 天换岛过多降体验，排除。" }),
    step("Route Order", "雅典 → 圣托里尼 → 纳克索斯 → 帕罗斯 → 雅典", "经典岛→本地岛→慢节奏港镇，形成环线返程。"),
    step("Alternatives", "不加米科诺斯", "8 天加第四岛意味每天赶船，体验下降。"),
  ],

  expected: {
    destinations: ["雅典", "圣托里尼", "纳克索斯", "帕罗斯"],
    order: ["雅典", "圣托里尼", "纳克索斯", "帕罗斯", "雅典"],
    travelStyle: "Island Hopping",
    designRules: ["Regional", "Travel Efficiency", "Theme"],
    evidenceReferences: [],
    travelValue: "一次体验不同性格的爱琴海岛屿，而不是打卡最多岛",
    pace: "Moderate",
    targetTraveler: "第一次去希腊、想体验经典海岛的人",
    whoShouldAvoid: "不喜欢坐船、晕船、想深度历史文化的人",
    bestMonths: ["5-9月"],
  },

  rejectedDestinations: [
    { name: "米科诺斯", reason: "8 天加第四岛意味每天赶船，体验下降" },
  ],
  rejectedStyles: [
    { style: "Classic First Trip", reason: "重点是岛屿角色差异，非城市覆盖" },
  ],
  rejectedProducts: [
    { product: "希腊文化深度", reason: "历史产品，与海岛跳岛互斥" },
  ],
  expansionStrategy: [
    { addDays: 3, addDestinations: ["米科诺斯", "提洛斯"], evolvesTo: "基克拉泽扩展跳岛", reason: "同群岛延伸" },
  ],
  compressionStrategy: [
    { removeDays: 2, removeDestination: "帕罗斯", keep: ["雅典", "圣托里尼", "纳克索斯"], reason: "帕罗斯为慢节奏补充，价值可舍" },
  ],

  assertions: { minDestJaccard: 0.5, orderPass: true, styleExact: true, rulesExact: true },
};

// ─── Gold Case 10：四国八十八所巡礼（Pilgrimage） ────────────────
const goldCase10 = {
  id: "gold-10-shikoku-pilgrimage",
  schemaVersion: GOLD_CASE_SCHEMA_VERSION,
  caseVersion: 1,
  durationDays: 12,
  durationBand: "10-14d",
  tripIntent: "Pilgrimage",
  travelStyle: "Pilgrimage",
  travelStyleConceptKey: "pilgrimage",
  season: "March–May / September–November",
  country: "JP",
  region: "四国",
  pace: "Moderate",
  targetTraveler: "徒步、宗教文化、日本深度旅行者",
  whoShouldAvoid: "希望轻松度假、不喜欢长时间步行或无宗教文化兴趣的人",

  productName: "四国八十八所巡礼（节选）",
  productSummary: "12 天沿四国八十八所巡礼路线分段：德岛→高知→松山→高松。",
  coreExperience: "沿正式巡礼 Route Network 的宗教文化体验",
  uniqueSellingPoint: "基于真实巡礼网络，严格区分 Core Route 与 Access Point——大阪只是入口非核心。",

  reasoning: [
    step("Duration", "12 天", "足够完成巡礼节选路段，不适合全 88 所。"),
    step("Trip Intent", "Pilgrimage", "目标是沿正式巡礼路线，非四国观光。"),
    step("Travel Style", "Pilgrimage", "遵循具有历史和文化意义的正式 Route Network，比 Theme 更强调路线结构。"),
    step("Travel Value", "体验日本最完整的巡礼文化", "价值在线路连续性与精神意义，非景点观光。"),
    step("Destination Selection", "德岛 / 高知 / 松山 / 高松",
      "对应巡礼不同阶段；德岛=起点阶段，高知=中段，松山=后段，高松=终段返程。大阪=Access Point 不能作 Core。",
      { evidenceOrRule: "Transport（沿巡礼网络）+ Depth（文化精神深度）+ Geographic（按线路顺序）",
        alternativesConsidered: "大阪→仅交通入口，非线路组成，不作 Core Destination。" }),
    step("Route Order", "德岛 → 高知 → 松山 → 高松", "严格按巡礼顺序，不可跳跃或重排。"),
    step("Alternatives", "不加大阪作 Core", "大阪不是线路主体；加入即偏离巡礼产品定位。"),
  ],

  expected: {
    destinations: ["德岛", "高知", "松山", "高松"],
    order: ["德岛", "高知", "松山", "高松"],
    travelStyle: "Pilgrimage",
    designRules: ["Transport", "Depth", "Geographic"],
    evidenceReferences: [],
    travelValue: "体验日本最完整的巡礼文化",
    pace: "Moderate",
    targetTraveler: "徒步、宗教文化、日本深度旅行者",
    whoShouldAvoid: "希望轻松度假、不喜欢长时间步行或无宗教文化兴趣的人",
    bestMonths: ["3-5月", "9-11月"],
  },

  rejectedDestinations: [
    { name: "大阪（作 Core）", reason: "大阪仅交通入口，非巡礼线路组成" },
  ],
  rejectedStyles: [
    { style: "Classic First Trip", reason: "重点是巡礼路线结构，非观光覆盖" },
  ],
  rejectedProducts: [
    { product: "四国观光", reason: "观光产品，与巡礼路线互斥" },
  ],
  expansionStrategy: [
    { addDays: 5, addDestinations: ["全 88 所完整巡礼"], evolvesTo: "完整四国遍路", reason: "同线路网络完整化" },
  ],
  compressionStrategy: [
    { removeDays: 3, removeDestination: "高知段", keep: ["德岛", "松山", "高松"], reason: "中段可节选，保留起止与终段" },
  ],

  assertions: { minDestJaccard: 0.5, orderPass: true, styleExact: true, rulesExact: true },
};

// ─── Gold Case 11：伦敦城市短途（City Break） ───────────────────
const goldCase11 = {
  id: "gold-11-london-city-break",
  schemaVersion: GOLD_CASE_SCHEMA_VERSION,
  caseVersion: 1,
  durationDays: 3,
  durationBand: "1-3d",
  tripIntent: "Short Break",
  travelStyle: "City Break",
  travelStyleConceptKey: "city-break",
  season: "All year",
  country: "GB",
  region: "大伦敦",
  pace: "Relaxed",
  targetTraveler: "想用短假期轻量体验一个城市及近郊的人",
  whoShouldAvoid: "想跨区域、多城市深度旅行的人",

  productName: "伦敦城市短途",
  productSummary: "3 天以伦敦为基地加近郊一日游，不跨区域移动。",
  coreExperience: "单城市深度 + 近郊延伸的轻量短假",
  uniqueSellingPoint: "不赶路、不换酒店——以伦敦为大本营辐射近郊，符合短假节奏。",

  reasoning: [
    step("Duration", "3 天", "只够单城市或城市+近郊，不适合跨区域或多城市。"),
    step("Trip Intent", "Short Break", "利用较短时间完成一次旅行，非完整目的地体验。"),
    step("Travel Style", "City Break", "以单城市或近郊为主，节奏松弛，不跨区域移动。"),
    step("Travel Value", "用短假期轻量体验伦敦及近郊", "价值在低移动强度下的城市浓度体验。"),
    step("Destination Selection", "伦敦（基地） / 格林尼治（近郊一日游）",
      "伦敦=基地承担文化/博物馆/街区；格林尼治=近郊一日游延伸，当日往返不换酒店。",
      { evidenceOrRule: "Anchor + Satellite（以伦敦为锚，近郊为卫星）+ Travel Efficiency（不换酒店）",
        alternativesConsidered: "牛津/巴斯→虽可一日游但移动偏长，3 天内压缩伦敦体验，排除作 Core；剑桥→同理。" }),
    step("Route Order", "伦敦 → 格林尼治 → 伦敦", "基地+近郊往返结构，非链式跨城。"),
    step("Alternatives", "不作多城市串联", "3 天跨城会变赶路，违背 City Break 松弛定位。"),
  ],

  expected: {
    destinations: ["伦敦", "格林尼治"],
    order: ["伦敦", "格林尼治", "伦敦"],
    travelStyle: "City Break",
    designRules: ["Anchor + Satellite", "Travel Efficiency"],
    evidenceReferences: [],
    travelValue: "用短假期轻量体验伦敦及近郊",
    pace: "Relaxed",
    targetTraveler: "想用短假期轻量体验一个城市及近郊的人",
    whoShouldAvoid: "想跨区域、多城市深度旅行的人",
    bestMonths: ["全年"],
  },

  rejectedDestinations: [
    { name: "牛津", reason: "3 天内作 Core 会压缩伦敦体验，仅适合作可选近郊" },
    { name: "巴黎（欧陆）", reason: "跨区域跨国，属另一产品" },
  ],
  rejectedStyles: [
    { style: "Classic First Trip", reason: "3 天不足以经典覆盖，仅适合作短假" },
    { style: "Country Hopper", reason: "单城市产品，无多国需求" },
  ],
  rejectedProducts: [
    { product: "英国经典初访", reason: "需 7+ 天，与 3 天短假互斥" },
  ],
  expansionStrategy: [
    { addDays: 2, addDestinations: ["牛津", "巴斯"], evolvesTo: "英格兰南部短线", reason: "近郊扩展，仍以伦敦为锚" },
  ],
  compressionStrategy: [
    { removeDays: 1, removeDestination: "格林尼治", keep: ["伦敦"], reason: "近郊为延伸，删之仍为完整伦敦短假" },
  ],

  assertions: { minDestJaccard: 0.5, orderPass: true, styleExact: true, rulesExact: true },
};

// ─── 注册表 ──────────────────────────────────────────────────────
export const GOLD_CASES = [
  goldCase1, goldCase2, goldCase3, goldCase4, goldCase5,
  goldCase6, goldCase7, goldCase8, goldCase9, goldCase10, goldCase11,
  ...createCanonicalGoldCaseAdditions({ schemaVersion: GOLD_CASE_SCHEMA_VERSION }),
];

const CASE_BY_ID = new Map(GOLD_CASES.map((item) => [item.id, item]));

// ─── 导出 API ────────────────────────────────────────────────────
export function getCase(id) {
  return CASE_BY_ID.get(id) || null;
}

export function listCases({ travelStyle = null } = {}) {
  return GOLD_CASES.filter((item) => travelStyle == null || item.travelStyle === travelStyle);
}

// ② Planner Reasoning → few-shot 上下文（LLM 学推理过程，非答案）
export function asFewShotReasoning(id) {
  const c = CASE_BY_ID.get(id);
  if (!c) return null;
  const lines = c.reasoning.map((r) => {
    const parts = [`- ${r.step}: ${r.decision} → ${r.reason}`];
    if (r.evidenceOrRule) parts.push(`    Evidence/DesignRule: ${r.evidenceOrRule}`);
    if (r.alternativesConsidered) parts.push(`    Alternatives Considered: ${r.alternativesConsidered}`);
    return parts.join("\n");
  });
  return {
    id: c.id,
    routeDna: {
      durationDays: c.durationDays, durationBand: c.durationBand,
      tripIntent: c.tripIntent, travelStyle: c.travelStyle,
      season: c.season, country: c.country, region: c.region, pace: c.pace,
    },
    reasoning: lines.join("\n"),
  };
}

// ③ Structured Expected Output（决策测试/单测用）
export function asExpectedOutput(id) {
  const c = CASE_BY_ID.get(id);
  return c ? c.expected : null;
}

// 断言阈值
export function asAssertions(id) {
  const c = CASE_BY_ID.get(id);
  return c ? c.assertions : null;
}

// ④ Alternative/Rejection（Decision Tests 判据）
export function asAlternatives(id) {
  const c = CASE_BY_ID.get(id);
  if (!c) return null;
  return {
    rejectedDestinations: c.rejectedDestinations,
    rejectedStyles: c.rejectedStyles,
    rejectedProducts: c.rejectedProducts,
    expansionStrategy: c.expansionStrategy,
    compressionStrategy: c.compressionStrategy,
  };
}

// schema 自检：所有 Case 字段完整性
export function validateAllCases() {
  const errors = [];
  const REQUIRED_DNA = ["id", "schemaVersion", "caseVersion", "durationDays", "durationBand", "tripIntent", "travelStyle", "travelStyleConceptKey", "season", "country", "pace", "targetTraveler", "whoShouldAvoid"];
  const REQUIRED_META = ["productName", "productSummary", "coreExperience", "uniqueSellingPoint"];
  const REQUIRED_EXPECTED = ["destinations", "order", "travelStyle", "designRules", "evidenceReferences", "travelValue", "pace", "targetTraveler", "whoShouldAvoid"];
  const REQUIRED_ALT = ["rejectedDestinations", "rejectedStyles", "rejectedProducts", "expansionStrategy", "compressionStrategy"];
  for (const c of GOLD_CASES) {
    const where = `case ${c.id || "(no id)"}`;
    for (const f of REQUIRED_DNA) if (!c[f]) errors.push(`${where}: missing dna.${f}`);
    for (const f of REQUIRED_META) if (!c[f]) errors.push(`${where}: missing meta.${f}`);
    if (!Array.isArray(c.reasoning) || c.reasoning.length < 7) errors.push(`${where}: reasoning must have >=7 steps, got ${c.reasoning?.length}`);
    for (const f of REQUIRED_EXPECTED) if (c.expected?.[f] == null) errors.push(`${where}: missing expected.${f}`);
    for (const f of REQUIRED_ALT) if (!c[f]) errors.push(`${where}: missing alt.${f}`);
    if (c.expected && c.expected.travelStyle !== c.travelStyle) errors.push(`${where}: expected.travelStyle mismatch dna`);
    if (c.expected && c.expected.pace !== c.pace) errors.push(`${where}: expected.pace mismatch dna`);
  }
  return { ok: errors.length === 0, errors };
}
