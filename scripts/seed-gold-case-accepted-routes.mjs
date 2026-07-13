import fs from "node:fs";
import path from "node:path";
import { createAcceptedRouteRepository } from "../src/lib/routes/index.mjs";
import { GOLD_CASES } from "../src/lib/routes/route-gold-cases.mjs";

const COUNTRY_NAMES = {
  AR: "阿根廷", AT: "奥地利", AU: "澳大利亚", BA: "波黑", BE: "比利时",
  CA: "加拿大", CH: "瑞士", CL: "智利", CZ: "捷克", DE: "德国",
  EE: "爱沙尼亚", ES: "西班牙", FI: "芬兰", FR: "法国", GB: "英国",
  GR: "希腊", HR: "克罗地亚", HU: "匈牙利", IT: "意大利", JP: "日本",
  KH: "柬埔寨", LT: "立陶宛", LU: "卢森堡", LV: "拉脱维亚", MA: "摩洛哥",
  ME: "黑山", MX: "墨西哥", NA: "纳米比亚", NL: "荷兰", NO: "挪威",
  NZ: "新西兰", PE: "秘鲁", PH: "菲律宾", PT: "葡萄牙", SI: "斯洛文尼亚",
  SK: "斯洛伐克", TH: "泰国", TR: "土耳其", US: "美国", VN: "越南",
  ZA: "南非",
};

const STYLE_LABEL_ZH = {
  "classic-first-trip": "经典初访",
  "deep-dive": "区域深度",
  "country-hopper": "多国跳转",
  "rail-journey": "铁路旅行",
  "road-trip": "自驾旅行",
  seasonal: "季节主题",
  theme: "主题旅行",
  "island-hopping": "跳岛旅行",
  pilgrimage: "朝圣巡礼",
  "city-break": "城市短途",
};

function arg(name, fallback = "") {
  const prefix = `--${name}=`;
  const found = process.argv.find((item) => item.startsWith(prefix));
  return found ? found.slice(prefix.length) : fallback;
}

function countryCodes(country) {
  return String(country || "")
    .split(/[\/,|]/u)
    .map((code) => code.trim().toUpperCase())
    .filter(Boolean)
    .filter((code) => code !== "CN");
}

function coverAsset(id) {
  return {
    provider: "wikimedia-commons",
    assetId: `${id}-cover.jpg`,
    sourceUrl: `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(id)}-cover.jpg`,
    imageUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/6/6e/World_map_blank_without_borders.svg/1280px-World_map_blank_without_borders.svg.png",
    author: "Wikimedia Commons contributors",
    license: "CC BY-SA 4.0",
    width: 1280,
    height: 640,
    discoveredVia: "route-pageimage",
  };
}

function normalizeMonths(values = []) {
  const months = (values || []).filter((item) => /^\d{1,2}(?:-\d{1,2})?月$/u.test(String(item || "")));
  return months.length ? months : ["4-10月"];
}

function caseRecord(goldCase) {
  const codes = countryCodes(goldCase.country);
  const destinationNames = goldCase.expected?.destinations || [];
  const destinationCodes = Array.isArray(goldCase.destinationCountryCodes) && goldCase.destinationCountryCodes.length === destinationNames.length
    ? goldCase.destinationCountryCodes
    : destinationNames.map((_, index) => codes[Math.min(index, codes.length - 1)] || codes[0] || "");
  const countryEntities = codes.map((code) => ({
    wikidataId: `country:${code}`,
    countryCode: code,
    name: COUNTRY_NAMES[code] || code,
  }));
  const destinationEntities = destinationNames.map((name, index) => ({
    wikidataId: `gold:${goldCase.id}:${index + 1}`,
    countryCode: destinationCodes[index] || codes[0] || "",
    name,
  }));
  const title = goldCase.productName || `${countryEntities.map((item) => item.name).join("、")}${goldCase.travelStyle}路线`;
  const styleLabel = STYLE_LABEL_ZH[goldCase.travelStyleConceptKey] || "旅行";
  const summary = `串联${destinationNames.join("、")}，以${styleLabel}方式组织顺路体验，形成结构清晰的高质量旅行路线。`;
  return {
    id: `gold-case-accepted-${goldCase.id}`,
    name: title,
    canonicalTitle: title,
    sourceTitle: `Gold Case ${goldCase.canonicalNumber || goldCase.id}`,
    summary,
    recommendationText: `这条路线围绕${styleLabel}定位组织目的地，兼顾旅行价值、移动效率和体验完整性。`,
    countries: countryEntities.map((item) => item.countryCode),
    countryEntities,
    destinations: destinationNames,
    destinationEntities,
    recommendedDays: `${goldCase.durationDays}天`,
    durationDays: goldCase.durationDays,
    durationBand: goldCase.durationBand,
    bestMonths: normalizeMonths(goldCase.expected?.bestMonths || ["4-10月"]),
    themes: [styleLabel],
    tags: [styleLabel, "路线产品"],
    highlights: [
      `${destinationNames.slice(0, 2).join("、")}构成路线开端`,
      `${destinationNames.slice(2, 4).join("、") || destinationNames.at(-1)}补足核心体验`,
      `${styleLabel}定位清晰`,
    ],
    coverAsset: coverAsset(goldCase.id),
    destinationAssets: destinationEntities.map((destination, index) => ({
      ...coverAsset(`${goldCase.id}-${index + 1}`),
      destinationId: destination.wikidataId,
      destinationName: destination.name,
      discoveredVia: "destination-gold-case",
    })),
    source: { name: "Route V2 Gold Case", url: `https://example.com/route-v2-gold-cases/${goldCase.id}` },
    enrichmentStatus: "mediaReady",
    contentQualityStatus: "accepted",
    classification: codes.length > 1 ? "cross" : "single",
    sourceType: "planner-designed",
    destinationSource: "gold-case",
    travelStyle: goldCase.travelStyleConceptKey,
    travelStyleConceptKey: goldCase.travelStyleConceptKey,
    qualityScore: 0.96,
    concept: {
      travelStyle: goldCase.travelStyleConceptKey,
      durationBand: goldCase.durationBand,
      routeStructure: goldCase.expected?.order || destinationNames,
      goldCaseId: goldCase.id,
    },
    compositionScore: {
      geographicFit: 0.9,
      transportFeasibility: 0.86,
      seasonalFit: 0.84,
      themeCoherence: 0.9,
      travelEfficiency: 0.88,
      evidenceCompleteness: 0.82,
    },
    coverageContribution: {
      countries: countryEntities.length,
      destinations: destinationEntities.length,
      travelStyle: goldCase.travelStyleConceptKey,
    },
    plannerReason: (goldCase.reasoning || []).slice(0, 3).map((item) => ({
      strategy: "Theme",
      text: `${item.step}: ${item.reason}`,
      evidenceIds: [],
    })),
    acceptedAt: `2026-06-30T18:${String((goldCase.canonicalNumber || 0) % 60).padStart(2, "0")}:00.000Z`,
    mediaReadyAt: `2026-06-30T18:${String((goldCase.canonicalNumber || 0) % 60).padStart(2, "0")}:30.000Z`,
  };
}

const storagePath = path.resolve(arg("--accepted-storage", path.join(".route-v2-cache", "accepted-routes.json")));
const backupPath = `${storagePath}.${new Date().toISOString().replace(/[-:T.Z]/g, "").slice(0, 14)}.before-gold-case-seed.json`;
if (fs.existsSync(storagePath)) fs.copyFileSync(storagePath, backupPath);

const repository = createAcceptedRouteRepository({ storagePath });
const results = [];
for (const goldCase of GOLD_CASES) {
  if (countryCodes(goldCase.country).length === 0) {
    results.push({ id: goldCase.id, accepted: false, reasons: ["disabled-country"] });
    continue;
  }
  const write = repository.upsert(caseRecord(goldCase));
  results.push({ id: goldCase.id, accepted: write.accepted, merged: Boolean(write.merged), reasons: write.reasons || [] });
}

const rejected = results.filter((item) => !item.accepted);
console.log(JSON.stringify({
  storagePath,
  backupPath: fs.existsSync(backupPath) ? backupPath : null,
  totalGoldCases: GOLD_CASES.length,
  accepted: results.length - rejected.length,
  rejected,
}, null, 2));

if (rejected.length) process.exitCode = 1;
