function durationBandForDays(days) {
  if (days <= 3) return "1-3d";
  if (days <= 6) return "4-6d";
  if (days <= 10) return "7-10d";
  if (days <= 14) return "10-14d";
  return "15d+";
}

function step(name, decision, reason, opts = {}) {
  return {
    step: name,
    decision,
    reason,
    ...(opts.evidenceOrRule ? { evidenceOrRule: opts.evidenceOrRule } : {}),
    ...(opts.alternativesConsidered ? { alternativesConsidered: opts.alternativesConsidered } : {}),
  };
}

const STYLE_META = {
  "classic-first-trip": {
    travelStyle: "Classic First Trip",
    tripIntent: "First Trip",
    designRules: ["Geographic", "Travel Efficiency", "Depth"],
    pace: "Moderate",
    traveler: "第一次前往该目的地、希望建立完整第一印象的人",
    avoid: "只想深挖单一区域或追求小众专题体验的人",
  },
  "deep-dive": {
    travelStyle: "Deep Dive",
    tripIntent: "Repeat Visit",
    designRules: ["Regional", "Depth", "Geographic"],
    pace: "Relaxed",
    traveler: "希望深入一个区域、理解地方文化和自然层次的人",
    avoid: "第一次到访且希望快速覆盖全国代表城市的人",
  },
  "road-trip": {
    travelStyle: "Road Trip",
    tripIntent: "Transport-led",
    designRules: ["Geographic", "Transport", "Travel Efficiency"],
    pace: "Moderate",
    traveler: "愿意自驾并把沿途景观视为旅行体验的人",
    avoid: "不想开车、害怕长距离移动或需要全程公共交通的人",
  },
  "rail-journey": {
    travelStyle: "Rail Journey",
    tripIntent: "Transport-led",
    designRules: ["Transport", "Geographic", "Travel Efficiency"],
    pace: "Moderate",
    traveler: "希望把铁路或交通过程本身作为体验核心的人",
    avoid: "只想在单个城市深度停留、不愿频繁换乘的人",
  },
  seasonal: {
    travelStyle: "Seasonal",
    tripIntent: "Seasonal Window",
    designRules: ["Season", "Theme", "Geographic"],
    pace: "Moderate",
    traveler: "愿意围绕明确季节窗口安排旅行的人",
    avoid: "出行时间无法匹配季节窗口或不在意季节主题的人",
  },
  theme: {
    travelStyle: "Theme",
    tripIntent: "Theme-led",
    designRules: ["Theme", "Regional", "Travel Efficiency"],
    pace: "Relaxed",
    traveler: "希望围绕一个清晰主题形成连续体验的人",
    avoid: "希望同时混合太多主题或只追求打卡城市的人",
  },
  "island-hopping": {
    travelStyle: "Island Hopping",
    tripIntent: "Island Collection",
    designRules: ["Regional", "Transport", "Theme"],
    pace: "Moderate",
    traveler: "愿意通过渡轮或短途航线体验不同岛屿角色的人",
    avoid: "不想换岛、晕船或只想固定酒店度假的人",
  },
  pilgrimage: {
    travelStyle: "Pilgrimage",
    tripIntent: "Pilgrimage",
    designRules: ["Transport", "Depth", "Geographic"],
    pace: "Moderate",
    traveler: "关注历史路线、宗教文化或徒步精神体验的人",
    avoid: "只想轻松观光或不想按路线网络移动的人",
  },
  "country-hopper": {
    travelStyle: "Country Hopper",
    tripIntent: "Country Collection",
    designRules: ["Geographic", "Transport", "Travel Efficiency"],
    pace: "Intensive",
    traveler: "希望在有限时间体验多个国家差异的人",
    avoid: "希望慢游、亲子出行或不喜欢频繁换城的人",
  },
};

function makeCase(input, schemaVersion) {
  const style = STYLE_META[input.style];
  const destinationText = input.destinations.join("、");
  const destinationDecision = input.destinations.join(" / ");
  const productName = input.productName;
  const travelValue = `${productName}的价值在于${input.value}`;
  const compressionTarget = input.destinations.at(-1);
  const rejected = input.rejected || input.destinations.at(0);
  return {
    id: input.id,
    canonicalNumber: input.canonicalNumber,
    schemaVersion,
    caseVersion: 1,
    durationDays: input.days,
    durationBand: input.durationBand || durationBandForDays(input.days),
    tripIntent: input.tripIntent || style.tripIntent,
    travelStyle: style.travelStyle,
    travelStyleConceptKey: input.style,
    season: input.season || "4-10月",
    country: input.country,
    region: input.region || productName,
    pace: input.pace || style.pace,
    targetTraveler: input.targetTraveler || style.traveler,
    whoShouldAvoid: input.whoShouldAvoid || style.avoid,
    destinationCountryCodes: input.destinationCountryCodes || [],

    productName,
    productSummary: `${input.days}天串联${destinationText}，形成${productName}的完整旅行产品。`,
    coreExperience: input.coreExperience || `${destinationText}之间形成清晰的体验递进。`,
    uniqueSellingPoint: input.uniqueSellingPoint || `以${style.travelStyle}的产品逻辑筛选目的地，避免为了数量牺牲旅行价值。`,

    reasoning: [
      step("Duration", `${input.days}天`, `这个时长足以支撑${productName}，但不适合无限扩展目的地。`,
        { alternativesConsidered: "更短会压缩核心体验，更长则应演化为新的扩展产品。" }),
      step("Trip Intent", input.tripIntent || style.tripIntent, `本路线的目标是${input.value}，不是简单打卡地点。`),
      step("Travel Style", style.travelStyle, `采用${style.travelStyle}，因为目的地组合、移动方式和体验节奏都服务于同一种产品定位。`),
      step("Travel Value", travelValue, "每个目的地都承担角色，删除核心节点会削弱路线价值。"),
      step("Destination Selection", destinationDecision, `选择${destinationText}，因为它们共同构成${productName}的核心骨架。`,
        { evidenceOrRule: style.designRules.join(" + "), alternativesConsidered: `${rejected}以外的远端或弱相关目的地会稀释主题。` }),
      step("Route Order", destinationText, "顺序遵循地理连续性、交通效率和体验递进，避免无意义折返。"),
      step("Alternatives", `不加入${rejected}以外的弱相关节点`, "额外目的地如果不能增强当前产品价值，应拆成另一个产品而不是硬塞进本路线。"),
    ],

    expected: {
      destinations: input.destinations,
      order: input.destinations,
      travelStyle: style.travelStyle,
      designRules: style.designRules,
      evidenceReferences: [],
      travelValue,
      pace: input.pace || style.pace,
      targetTraveler: input.targetTraveler || style.traveler,
      whoShouldAvoid: input.whoShouldAvoid || style.avoid,
      bestMonths: input.bestMonths || ["4-10月"],
    },

    rejectedDestinations: [
      { name: rejected, reason: "与当前路线产品边界不一致，应保留给另一个产品。" },
    ],
    rejectedStyles: [
      { style: "Classic First Trip", reason: input.style === "classic-first-trip" ? "本路线已经是经典初访产品。" : "当前旅行目标不是经典初访覆盖。" },
    ],
    rejectedProducts: [
      { product: `${productName}扩展版`, reason: "扩展版需要更多天数和新的产品边界。" },
    ],
    expansionStrategy: [
      { addDays: 3, addDestinations: [rejected], evolvesTo: `${productName}扩展路线`, reason: "新增目的地会改变产品边界，应作为扩展版本处理。" },
    ],
    compressionStrategy: [
      { removeDays: 2, removeDestination: compressionTarget, keep: input.destinations.slice(0, -1), reason: `${compressionTarget}是可压缩节点，核心骨架仍可保留。` },
    ],
    assertions: { minDestJaccard: 0.6, orderPass: true, styleExact: true, rulesExact: true },
  };
}

const ADDITIONS = [
  { canonicalNumber: 3, id: "gold-c45-3-peru-first-trip", country: "PE", style: "classic-first-trip", days: 10, productName: "秘鲁经典初访", destinations: ["利马", "库斯科", "圣谷", "马丘比丘", "的的喀喀湖"], value: "逐步适应海拔并理解安第斯文明", bestMonths: ["5-9月"] },
  { canonicalNumber: 4, id: "gold-c45-4-morocco-first-trip", country: "MA", style: "classic-first-trip", days: 9, productName: "摩洛哥经典环线", destinations: ["马拉喀什", "阿伊特本哈杜", "撒哈拉沙漠", "菲斯", "舍夫沙万", "卡萨布兰卡"], value: "串联古城、沙漠和蓝色山城的文化层次", bestMonths: ["3-5月", "9-11月"] },
  { canonicalNumber: 5, id: "gold-c45-5-new-zealand-first-trip", country: "NZ", style: "classic-first-trip", days: 10, productName: "新西兰经典初访", destinations: ["奥克兰", "罗托鲁瓦", "陶波", "惠灵顿", "皇后镇"], value: "用南北岛代表体验建立新西兰第一印象", bestMonths: ["11-3月"] },
  { canonicalNumber: 7, id: "gold-c45-7-andalusia-deep-dive", country: "ES", style: "deep-dive", days: 9, productName: "安达卢西亚深度", destinations: ["塞维利亚", "科尔多瓦", "格拉纳达", "乌韦达", "巴埃萨", "龙达", "马拉加"], value: "完整体验西班牙南部的伊斯兰遗产与白色山城", bestMonths: ["3-5月", "9-10月"] },
  { canonicalNumber: 8, id: "gold-c45-8-patagonia-deep-dive", country: "AR/CL", style: "deep-dive", days: 10, productName: "巴塔哥尼亚深度", destinations: ["埃尔卡拉法特", "莫雷诺冰川", "埃尔查尔坦", "托雷斯德尔潘恩"], destinationCountryCodes: ["AR", "AR", "AR", "CL"], value: "围绕冰川、徒步和南部荒野形成完整自然体验", bestMonths: ["11-3月"] },
  { canonicalNumber: 9, id: "gold-c45-9-northern-norway-deep-dive", country: "NO", style: "deep-dive", days: 9, productName: "挪威北部深度", destinations: ["特罗姆瑟", "塞尼亚岛", "安岛", "韦斯特龙群岛", "哈尔斯塔"], value: "深入北极圈海岸、峡湾和极光地区", bestMonths: ["9-3月"] },
  { canonicalNumber: 10, id: "gold-c45-10-yucatan-deep-dive", country: "MX", style: "deep-dive", days: 9, productName: "尤卡坦深度", destinations: ["梅里达", "乌斯马尔", "坎佩切", "卡拉克穆尔", "巴卡拉尔"], value: "围绕玛雅遗址、殖民城市和泻湖形成区域深度", bestMonths: ["11-4月"] },
  { canonicalNumber: 12, id: "gold-c45-12-canadian-rockies-road-trip", country: "CA", style: "road-trip", days: 8, productName: "加拿大落基山自驾", destinations: ["卡尔加里", "班夫", "路易斯湖", "冰原大道", "贾斯珀", "埃德蒙顿"], value: "把景观公路和国家公园串成连续驾驶体验", bestMonths: ["6-9月"] },
  { canonicalNumber: 13, id: "gold-c45-13-california-pacific-coast", country: "US", style: "road-trip", days: 7, productName: "加州太平洋海岸自驾", destinations: ["旧金山", "蒙特雷", "大苏尔", "圣巴巴拉", "洛杉矶"], value: "让海岸公路本身成为旅行体验", bestMonths: ["4-10月"] },
  { canonicalNumber: 14, id: "gold-c45-14-south-island-new-zealand", country: "NZ", style: "road-trip", days: 8, productName: "新西兰南岛自驾", destinations: ["基督城", "特卡波湖", "库克山", "瓦纳卡", "皇后镇", "米尔福德峡湾"], value: "沿南岛高山湖泊和峡湾形成景观递进", bestMonths: ["11-3月"] },
  { canonicalNumber: 15, id: "gold-c45-15-garden-route", country: "ZA", style: "road-trip", days: 8, productName: "南非花园大道自驾", destinations: ["开普敦", "赫曼努斯", "奈斯纳", "齐齐卡马国家公园", "伊丽莎白港"], value: "沿南非海岸串联观鲸、森林和国家公园", bestMonths: ["9-4月"] },
  { canonicalNumber: 17, id: "gold-c45-17-japan-jr-grand-route", country: "JP", style: "rail-journey", days: 10, productName: "日本铁路纵贯", destinations: ["东京", "长野", "金泽", "京都", "广岛", "博多"], value: "把新干线和区域铁路组织成纵贯体验", bestMonths: ["3-5月", "10-11月"] },
  { canonicalNumber: 18, id: "gold-c45-18-norway-scenic-railway", country: "NO", style: "rail-journey", days: 6, productName: "挪威景观铁路", destinations: ["奥斯陆", "弗洛姆", "峡湾", "卑尔根"], value: "让铁路、峡湾和山地景观共同构成体验", bestMonths: ["5-9月"] },
  { canonicalNumber: 19, id: "gold-c45-19-canadian-transcontinental-rail", country: "CA", style: "rail-journey", days: 9, productName: "加拿大横贯铁路", destinations: ["多伦多", "温尼伯", "萨斯卡通", "埃德蒙顿", "贾斯珀", "温哥华"], value: "用铁路横跨草原、落基山和太平洋海岸", bestMonths: ["5-9月"] },
  { canonicalNumber: 20, id: "gold-c45-20-central-europe-by-rail", country: "AT/SK/HU/CZ", style: "rail-journey", days: 7, productName: "中欧铁路四城", destinations: ["维也纳", "布拉迪斯拉发", "布达佩斯", "布拉格"], destinationCountryCodes: ["AT", "SK", "HU", "CZ"], value: "以成熟铁路连接四座中欧首都", bestMonths: ["4-10月"] },
  { canonicalNumber: 22, id: "gold-c45-22-netherlands-tulip-season", country: "NL", style: "seasonal", days: 5, productName: "荷兰郁金香季", destinations: ["阿姆斯特丹", "库肯霍夫花园", "莱顿", "海牙", "鹿特丹"], value: "围绕春季花期形成不可替代的季节产品", bestMonths: ["4月"] },
  { canonicalNumber: 23, id: "gold-c45-23-canada-autumn-rockies", country: "CA", style: "seasonal", days: 7, productName: "加拿大落基山秋色", destinations: ["卡尔加里", "班夫", "路易斯湖", "幽鹤国家公园", "贾斯珀"], value: "围绕秋色窗口组织高山湖泊和国家公园", bestMonths: ["9-10月"] },
  { canonicalNumber: 24, id: "gold-c45-24-germany-christmas-markets", country: "DE", style: "seasonal", days: 7, productName: "德国圣诞市场", destinations: ["法兰克福", "海德堡", "罗腾堡", "纽伦堡", "慕尼黑"], value: "围绕圣诞市场季节窗口形成城市串联", bestMonths: ["12月"] },
  { canonicalNumber: 25, id: "gold-c45-25-namibia-dry-season-safari", country: "NA", style: "seasonal", days: 10, productName: "纳米比亚旱季自然之旅", destinations: ["温得和克", "埃托沙国家公园", "达马拉兰", "斯瓦科普蒙德", "苏丝斯黎"], value: "利用旱季观景和野生动物窗口组织沙漠体验", bestMonths: ["6-10月"] },
  { canonicalNumber: 27, id: "gold-c45-27-italy-food-journey", country: "IT", style: "theme", days: 7, productName: "意大利美食主题", destinations: ["博洛尼亚", "摩德纳", "帕尔马", "兰盖", "都灵"], value: "以美食产区和城市餐桌文化作为唯一主题", bestMonths: ["4-6月", "9-10月"] },
  { canonicalNumber: 28, id: "gold-c45-28-turkey-unesco-journey", country: "TR", style: "theme", days: 9, productName: "土耳其世界遗产主题", destinations: ["伊斯坦布尔", "卡帕多奇亚", "哈图沙", "番红花城"], value: "围绕世界遗产层次理解安纳托利亚文明", bestMonths: ["4-6月", "9-10月"] },
  { canonicalNumber: 29, id: "gold-c45-29-australia-wildlife-journey", country: "AU", style: "theme", days: 10, productName: "澳大利亚野生动物主题", destinations: ["凯恩斯", "丹翠雨林", "玛格内特岛", "艾尔利海滩", "袋鼠岛"], value: "以野生动物和生态体验串联不同自然环境", bestMonths: ["5-10月"] },
  { canonicalNumber: 30, id: "gold-c45-30-mexico-maya-civilization", country: "MX", style: "theme", days: 9, productName: "墨西哥玛雅文明主题", destinations: ["梅里达", "乌斯马尔", "奇琴伊察", "卡拉克穆尔", "帕伦克"], value: "以玛雅文明遗址和城市层次构成主题路线", bestMonths: ["11-4月"] },
  { canonicalNumber: 32, id: "gold-c45-32-croatian-islands", country: "HR", style: "island-hopping", days: 8, productName: "克罗地亚跳岛", destinations: ["斯普利特", "布拉奇岛", "赫瓦尔岛", "科尔丘拉岛", "杜布罗夫尼克"], value: "让亚得里亚海岛屿角色逐步递进", bestMonths: ["5-9月"] },
  { canonicalNumber: 33, id: "gold-c45-33-philippines-palawan", country: "PH", style: "island-hopping", days: 8, productName: "菲律宾巴拉望跳岛", destinations: ["公主港", "爱妮岛", "科隆", "布桑加"], value: "围绕泻湖、海岛和潜水形成巴拉望主线", bestMonths: ["11-5月"] },
  { canonicalNumber: 34, id: "gold-c45-34-azores-islands", country: "PT", style: "island-hopping", days: 9, productName: "亚速尔群岛跳岛", destinations: ["圣米格尔岛", "法亚尔岛", "皮库岛"], value: "用火山湖、海洋和岛屿地貌形成差异化体验", bestMonths: ["5-9月"] },
  { canonicalNumber: 35, id: "gold-c45-35-hawaii-island-journey", country: "US", style: "island-hopping", days: 10, productName: "夏威夷群岛跳岛", destinations: ["欧胡岛", "茂宜岛", "夏威夷大岛"], value: "用不同岛屿角色组合城市、海滩和火山体验", bestMonths: ["4-10月"] },
  { canonicalNumber: 37, id: "gold-c45-37-camino-frances", country: "ES", style: "pilgrimage", days: 14, productName: "法国之路朝圣精选", destinations: ["圣让皮耶德波尔", "潘普洛纳", "布尔戈斯", "莱昂", "圣地亚哥"], value: "沿真实朝圣网络体验路线精神和城镇递进", bestMonths: ["4-6月", "9-10月"] },
  { canonicalNumber: 38, id: "gold-c45-38-kumano-kodo", country: "JP", style: "pilgrimage", days: 5, productName: "熊野古道朝圣", destinations: ["田边", "发心门王子", "熊野本宫大社", "熊野速玉大社", "熊野那智大社"], value: "沿真实古道网络体验神社和徒步精神", bestMonths: ["3-5月", "10-11月"] },
  { canonicalNumber: 39, id: "gold-c45-39-via-francigena", country: "GB/FR/CH/IT", style: "pilgrimage", days: 14, productName: "法兰奇杰纳之路精选", destinations: ["坎特伯雷", "兰斯", "洛桑", "奥斯塔", "罗马"], destinationCountryCodes: ["GB", "FR", "CH", "IT", "IT"], value: "沿欧洲历史朝圣路线精选关键路段", bestMonths: ["5-9月"] },
  { canonicalNumber: 40, id: "gold-c45-40-mount-kailash-pilgrimage", country: "CN", style: "pilgrimage", days: 10, productName: "冈仁波齐朝圣", destinations: ["拉萨", "萨嘎", "冈仁波齐", "塔钦", "玛旁雍错"], value: "围绕高原适应和转山路线形成朝圣产品", bestMonths: ["5-9月"] },
  { canonicalNumber: 42, id: "gold-c45-42-baltic-capitals", country: "LT/LV/EE/FI", style: "country-hopper", days: 8, productName: "波罗的海首都连线", destinations: ["维尔纽斯", "里加", "塔林", "赫尔辛基"], destinationCountryCodes: ["LT", "LV", "EE", "FI"], value: "用相邻首都体验波罗的海和北欧边界差异", bestMonths: ["5-9月"] },
  { canonicalNumber: 43, id: "gold-c45-43-benelux-explorer", country: "NL/BE/LU", style: "country-hopper", days: 6, productName: "比荷卢多国探索", destinations: ["阿姆斯特丹", "鹿特丹", "布鲁塞尔", "布鲁日", "卢森堡市"], destinationCountryCodes: ["NL", "NL", "BE", "BE", "LU"], value: "用短距离铁路串联低地国家城市差异", bestMonths: ["4-10月"] },
  { canonicalNumber: 44, id: "gold-c45-44-balkan-sampler", country: "SI/HR/BA/ME", style: "country-hopper", days: 9, productName: "巴尔干多国采样", destinations: ["卢布尔雅那", "萨格勒布", "萨拉热窝", "莫斯塔尔", "科托尔"], destinationCountryCodes: ["SI", "HR", "BA", "BA", "ME"], value: "用相邻城市展示巴尔干文化和地貌差异", bestMonths: ["5-9月"] },
  { canonicalNumber: 45, id: "gold-c45-45-mekong-discovery", country: "TH/KH/VN", style: "country-hopper", days: 8, productName: "湄公河多国发现", destinations: ["曼谷", "暹粒", "金边", "胡志明市"], destinationCountryCodes: ["TH", "KH", "KH", "VN"], value: "沿东南亚文化走廊体验国家切换带来的差异", bestMonths: ["11-3月"] },
];

export function createCanonicalGoldCaseAdditions({ schemaVersion = 1 } = {}) {
  return ADDITIONS
    .filter((item) => item.country !== "CN")
    .map((item) => makeCase(item, schemaVersion));
}
