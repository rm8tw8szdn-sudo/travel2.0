const statusLabel = {
  visited: "去过",
  blank: "未去过",
};

const statusSets = {
  world: {
    visited: new Set(["RU", "TH", "CZ", "SG", "JP", "KR", "MY", "VN", "FR", "IT", "AE"]),
  },
  china: {
    visited: new Set(["110000", "310000", "440000", "210000", "530000", "510000", "330000"]),
  },
};

const cityStatusSets = {
  china: {
    visited: new Set(["110100", "310100", "440100", "440300", "210100", "530100", "510100"]),
  },
};

const geoGroupOrder = {
  world: [
    "东亚",
    "东南亚",
    "南亚",
    "中亚",
    "西亚",
    "北欧",
    "西欧",
    "南欧",
    "东欧",
    "北非",
    "西非",
    "东非",
    "中非",
    "南非",
    "北美洲",
    "中美洲",
    "加勒比",
    "南美洲",
    "大洋洲",
    "其他",
  ],
  china: ["华北", "东北", "华东", "华中", "华南", "西南", "西北", "港澳台"],
};

const countryNumeric = {
  CN: "156",
  JP: "392",
  KR: "410",
  MN: "496",
  TH: "764",
  SG: "702",
  MY: "458",
  VN: "704",
  ID: "360",
  PH: "608",
  KH: "116",
  LA: "418",
  MM: "104",
  IN: "356",
  TR: "792",
  GE: "268",
  AE: "784",
  RU: "643",
  CZ: "203",
  AT: "040",
  HU: "348",
  FR: "250",
  IT: "380",
  ES: "724",
  PT: "620",
  GB: "826",
  CH: "756",
  GR: "300",
  NO: "578",
  FI: "246",
  DK: "208",
  EG: "818",
  MA: "504",
  AU: "036",
  NZ: "554",
  US: "840",
  CA: "124",
  MX: "484",
  BR: "076",
  AR: "032",
};

const manualCountries = [
  ["CN", "中国", "东亚"],
  ["JP", "日本", "东亚"],
  ["KR", "韩国", "东亚"],
  ["MN", "蒙古", "东亚"],
  ["TH", "泰国", "东南亚"],
  ["SG", "新加坡", "东南亚"],
  ["MY", "马来西亚", "东南亚"],
  ["VN", "越南", "东南亚"],
  ["ID", "印度尼西亚", "东南亚"],
  ["PH", "菲律宾", "东南亚"],
  ["KH", "柬埔寨", "东南亚"],
  ["LA", "老挝", "东南亚"],
  ["MM", "缅甸", "东南亚"],
  ["IN", "印度", "南亚"],
  ["TR", "土耳其", "西亚"],
  ["GE", "格鲁吉亚", "西亚"],
  ["AE", "阿联酋", "西亚"],
  ["RU", "俄罗斯", "东欧"],
  ["CZ", "捷克", "东欧"],
  ["AT", "奥地利", "西欧"],
  ["HU", "匈牙利", "东欧"],
  ["FR", "法国", "西欧"],
  ["IT", "意大利", "南欧"],
  ["ES", "西班牙", "南欧"],
  ["PT", "葡萄牙", "南欧"],
  ["GB", "英国", "北欧"],
  ["CH", "瑞士", "西欧"],
  ["GR", "希腊", "南欧"],
  ["NO", "挪威", "北欧"],
  ["FI", "芬兰", "北欧"],
  ["DK", "丹麦", "北欧"],
  ["EG", "埃及", "北非"],
  ["MA", "摩洛哥", "北非"],
  ["AU", "澳大利亚", "大洋洲"],
  ["NZ", "新西兰", "大洋洲"],
  ["US", "美国", "北美洲"],
  ["CA", "加拿大", "北美洲"],
  ["MX", "墨西哥", "北美洲"],
  ["BR", "巴西", "南美洲"],
  ["AR", "阿根廷", "南美洲"],
].map(([code, name, group]) => ({ code, name, group, numeric: countryNumeric[code] }));

const chinaPlaces = [
  ["110000", "北京", "华北"],
  ["120000", "天津", "华北"],
  ["130000", "河北", "华北"],
  ["140000", "山西", "华北"],
  ["150000", "内蒙古", "华北"],
  ["210000", "辽宁", "东北"],
  ["220000", "吉林", "东北"],
  ["230000", "黑龙江", "东北"],
  ["310000", "上海", "华东"],
  ["320000", "江苏", "华东"],
  ["330000", "浙江", "华东"],
  ["340000", "安徽", "华东"],
  ["350000", "福建", "华东"],
  ["360000", "江西", "华东"],
  ["370000", "山东", "华东"],
  ["410000", "河南", "华中"],
  ["420000", "湖北", "华中"],
  ["430000", "湖南", "华中"],
  ["440000", "广东", "华南"],
  ["450000", "广西", "华南"],
  ["460000", "海南", "华南"],
  ["500000", "重庆", "西南"],
  ["510000", "四川", "西南"],
  ["520000", "贵州", "西南"],
  ["530000", "云南", "西南"],
  ["540000", "西藏", "西南"],
  ["610000", "陕西", "西北"],
  ["620000", "甘肃", "西北"],
  ["630000", "青海", "西北"],
  ["640000", "宁夏", "西北"],
  ["650000", "新疆", "西北"],
  ["710000", "台湾", "港澳台"],
  ["810000", "香港", "港澳台"],
  ["820000", "澳门", "港澳台"],
].map(([code, name, group]) => ({ code, name, group }));

const provinceCities = {
  "110000": ["北京"],
  "120000": ["天津"],
  "130000": ["石家庄", "秦皇岛", "唐山", "保定"],
  "140000": ["太原", "大同", "平遥"],
  "150000": ["呼和浩特", "包头", "呼伦贝尔", "鄂尔多斯"],
  "210000": ["沈阳", "大连", "丹东"],
  "220000": ["长春", "吉林", "延边"],
  "230000": ["哈尔滨", "齐齐哈尔", "牡丹江"],
  "310000": ["上海"],
  "320000": ["南京", "苏州", "无锡", "扬州"],
  "330000": ["杭州", "宁波", "温州", "舟山"],
  "340000": ["合肥", "黄山", "芜湖"],
  "350000": ["福州", "厦门", "泉州", "武夷山"],
  "360000": ["南昌", "景德镇", "九江"],
  "370000": ["济南", "青岛", "烟台", "威海"],
  "410000": ["郑州", "洛阳", "开封"],
  "420000": ["武汉", "宜昌", "恩施"],
  "430000": ["长沙", "张家界", "岳阳"],
  "440000": ["广州", "深圳", "珠海", "佛山", "汕头"],
  "450000": ["南宁", "桂林", "北海"],
  "460000": ["海口", "三亚", "万宁"],
  "500000": ["重庆"],
  "510000": ["成都", "乐山", "阿坝", "甘孜"],
  "520000": ["贵阳", "遵义", "黔东南"],
  "530000": ["昆明", "大理", "丽江", "西双版纳"],
  "540000": ["拉萨", "林芝", "日喀则"],
  "610000": ["西安", "延安", "汉中"],
  "620000": ["兰州", "敦煌", "张掖"],
  "630000": ["西宁", "海西"],
  "640000": ["银川", "中卫"],
  "650000": ["乌鲁木齐", "伊犁", "喀什", "阿勒泰"],
  "710000": ["台北", "高雄", "花莲"],
  "810000": ["香港"],
  "820000": ["澳门"],
};

const provinceMotifs = {
  "110000": ["flower", "市花月季"],
  "120000": ["wave", "海河"],
  "130000": ["mountain", "燕山太行"],
  "140000": ["pagoda", "古建"],
  "150000": ["grass", "草原"],
  "210000": ["snow", "北方雪原"],
  "220000": ["pine", "长白林海"],
  "230000": ["snow", "冰雪"],
  "310000": ["skyline", "城市天际线"],
  "320000": ["leaf", "园林"],
  "330000": ["wave", "江南水乡"],
  "340000": ["moon", "徽州月"],
  "350000": ["boat", "海丝"],
  "360000": ["mountain", "庐山"],
  "370000": ["boat", "海岸"],
  "410000": ["grass", "中原麦田"],
  "420000": ["bridge", "长江大桥"],
  "430000": ["orange", "洞庭橘"],
  "440000": ["palm", "岭南"],
  "450000": ["mountain", "喀斯特"],
  "460000": ["wave", "海岛"],
  "500000": ["bridge", "山城桥"],
  "510000": ["panda", "熊猫"],
  "520000": ["leaf", "黔山"],
  "530000": ["flower", "云花"],
  "540000": ["snowmount", "雪山"],
  "610000": ["pagoda", "古都"],
  "620000": ["desert", "敦煌沙丘"],
  "630000": ["cloud", "青海云"],
  "640000": ["grape", "贺兰葡萄"],
  "650000": ["moon", "西域弯月"],
  "710000": ["wave", "海峡"],
  "810000": ["skyline", "港岛天际线"],
  "820000": ["spark", "夜景"],
};

const chinaCityLabels = [
  ["北京", 116.4074, 39.9042],
  ["上海", 121.4737, 31.2304],
  ["广州", 113.2644, 23.1291],
  ["深圳", 114.0579, 22.5431],
  ["成都", 104.0665, 30.5723],
  ["重庆", 106.5516, 29.563],
  ["昆明", 102.8329, 24.8801],
  ["大理", 100.2676, 25.6065],
  ["西安", 108.9398, 34.3416],
  ["银川", 106.2309, 38.4872],
  ["西宁", 101.7782, 36.6171],
  ["兰州", 103.8343, 36.0611],
  ["呼和浩特", 111.7492, 40.8426],
  ["沈阳", 123.4315, 41.8057],
  ["长春", 125.3235, 43.8171],
  ["哈尔滨", 126.5349, 45.8038],
  ["济南", 117.1201, 36.6512],
  ["青岛", 120.3826, 36.0671],
  ["郑州", 113.6254, 34.7466],
  ["武汉", 114.3055, 30.5928],
  ["长沙", 112.9388, 28.2282],
  ["南京", 118.7969, 32.0603],
  ["杭州", 120.1551, 30.2741],
  ["福州", 119.2965, 26.0745],
  ["厦门", 118.0894, 24.4798],
  ["南昌", 115.8582, 28.6829],
  ["贵阳", 106.6302, 26.6477],
  ["南宁", 108.3669, 22.817],
  ["海口", 110.1983, 20.044],
  ["三亚", 109.5119, 18.2528],
].map(([name, lon, lat]) => ({ name, lon, lat }));

const regionNameMap = {
  Asia: "其他",
  Europe: "欧洲",
  Africa: "其他",
  Americas: "其他",
  Oceania: "大洋洲",
};

const subregionNameMap = {
  "Eastern Asia": "东亚",
  "South-Eastern Asia": "东南亚",
  "Southern Asia": "南亚",
  "Central Asia": "中亚",
  "Western Asia": "西亚",
  "Northern Europe": "北欧",
  "Western Europe": "西欧",
  "Southern Europe": "南欧",
  "Eastern Europe": "东欧",
  "Northern Africa": "北非",
  "Western Africa": "西非",
  "Eastern Africa": "东非",
  "Middle Africa": "中非",
  "Southern Africa": "南非",
  "South America": "南美洲",
  "North America": "北美洲",
  "Central America": "中美洲",
  Caribbean: "加勒比",
};

const zhNameOverrides = {
  CN: "中国",
  SG: "新加坡",
  HK: "中国香港",
  MO: "中国澳门",
  TW: "中国台湾",
  US: "美国",
  GB: "英国",
  AE: "阿联酋",
  KR: "韩国",
  KP: "朝鲜",
  CZ: "捷克",
};

const state = {
  mode: "world",
  filter: "all",
  search: "",
  sortVisitedFirst: false,
  expandedProvinces: new Set(),
  expandedWorldGroups: new Set(["东亚", "东南亚", "北欧", "西欧", "南欧", "东欧"]),
  worldPlaces: manualCountries,
  worldFeatures: [],
  chinaPlaces,
  chinaFeatures: [],
  chinaCityMap: {},
  loadingCityProvinces: new Set(),
  globePaused: true,
  globeRotation: { x: 0.55, y: -1.38 },
  selectedWorldCode: "",
};

const mapSvg = document.querySelector("#collectionMap");
const mapStatus = document.querySelector("#mapStatus");
const placeGrid = document.querySelector("#placeGrid");
const listTitle = document.querySelector("#listTitle");
const pageTitle = document.querySelector("#pageTitle");
const collectionEyebrow = document.querySelector("#collectionEyebrow");
const searchInput = document.querySelector("#placeSearch");
const mapPopover = document.querySelector("#mapPopover");
const globeToggle = document.querySelector("#globeToggle");
const globeVideo = document.querySelector("#globeVideo");
const globe3d = document.querySelector("#globe3d");
const globeReset = document.querySelector("#globeReset");
let zoomBehavior = null;
let zoomLayer = null;
let globeTimer = null;
let threeGlobe = null;
let threeAnimationFrame = 0;

document.body.dataset.theme = "mint";

function currentPlaces() {
  return state.mode === "world" ? state.worldPlaces : state.chinaPlaces;
}

function getStatus(code) {
  const sets = statusSets[state.mode];
  if (sets.visited.has(code)) return "visited";
  return "blank";
}

function setVisited(code, isVisited) {
  if (isVisited) {
    statusSets[state.mode].visited.add(code);
  } else {
    statusSets[state.mode].visited.delete(code);
  }
  renderAll();
}

function cityKey(provinceCode, cityName) {
  return `${provinceCode}-${cityName}`;
}

function cityCode(city) {
  return String(city.code || cityKey(city.provinceCode, city.name));
}

function setCityVisited(provinceCode, city, isVisited) {
  const key = cityCode(city);
  if (isVisited) {
    cityStatusSets.china.visited.add(key);
    statusSets.china.visited.add(provinceCode);
  } else {
    cityStatusSets.china.visited.delete(key);
  }
  renderAll();
}

function flagEmoji(code) {
  if (state.mode === "china") return "";
  if (!/^[A-Z]{2}$/.test(code)) return "◇";
  return code
    .split("")
    .map((char) => String.fromCodePoint(127397 + char.charCodeAt(0)))
    .join("");
}

function provinceIcon(code) {
  const [type, title] = provinceMotifs[code] || ["spark", "地方印象"];
  const icons = {
    panda: `<svg viewBox="0 0 36 36" aria-hidden="true"><circle cx="18" cy="18" r="11"/><circle cx="10" cy="11" r="5"/><circle cx="26" cy="11" r="5"/><ellipse cx="14" cy="18" rx="3.8" ry="4.6"/><ellipse cx="22" cy="18" rx="3.8" ry="4.6"/><circle class="cut" cx="14.5" cy="17.4" r="1.2"/><circle class="cut" cx="21.5" cy="17.4" r="1.2"/><path d="M15 24c2 1.4 4 1.4 6 0"/></svg>`,
    flower: `<svg viewBox="0 0 36 36" aria-hidden="true"><circle cx="18" cy="18" r="3.5"/><path d="M18 6c3 4 3 7 0 10-3-3-3-6 0-10ZM18 30c-3-4-3-7 0-10 3 3 3 6 0 10ZM6 18c4-3 7-3 10 0-3 3-6 3-10 0ZM30 18c-4 3-7 3-10 0 3-3 6-3 10 0ZM9.8 9.8c4.8.7 7 2.9 7.1 7.1-4.2-.1-6.4-2.3-7.1-7.1ZM26.2 26.2c-4.8-.7-7-2.9-7.1-7.1 4.2.1 6.4 2.3 7.1 7.1ZM26.2 9.8c-.7 4.8-2.9 7-7.1 7.1.1-4.2 2.3-6.4 7.1-7.1ZM9.8 26.2c.7-4.8 2.9-7 7.1-7.1-.1 4.2-2.3 6.4-7.1 7.1Z"/></svg>`,
    wave: `<svg viewBox="0 0 36 36" aria-hidden="true"><path d="M5 21c4-5 8-5 12 0s8 5 14 0"/><path d="M5 27c4-4 8-4 12 0s8 4 14 0"/><path d="M8 14c3-4 6-4 9 0s7 4 11 0"/></svg>`,
    mountain: `<svg viewBox="0 0 36 36" aria-hidden="true"><path d="M4 29 14 11l6 9 4-6 8 15H4Z"/><path class="cut" d="m14 11 2.8 7 3.2 2"/></svg>`,
    snowmount: `<svg viewBox="0 0 36 36" aria-hidden="true"><path d="M4 29 15 9l5 8 4-6 8 18H4Z"/><path class="cut" d="m15 9 2.7 8 2.3 0 4-6 2.6 8"/></svg>`,
    pagoda: `<svg viewBox="0 0 36 36" aria-hidden="true"><path d="M8 14h20L18 7 8 14ZM11 20h14l-7-5-7 5ZM13 27h10l-5-5-5 5Z"/><path d="M18 27v4"/></svg>`,
    grass: `<svg viewBox="0 0 36 36" aria-hidden="true"><path d="M7 28c6-14 8-14 11 0M18 28c3-14 6-14 11 0M5 28h26"/></svg>`,
    snow: `<svg viewBox="0 0 36 36" aria-hidden="true"><path d="M18 6v24M8 12l20 12M28 12 8 24"/><circle cx="18" cy="18" r="3"/></svg>`,
    pine: `<svg viewBox="0 0 36 36" aria-hidden="true"><path d="M18 6 9 18h5l-7 9h22l-7-9h5L18 6Z"/><path d="M18 27v4"/></svg>`,
    skyline: `<svg viewBox="0 0 36 36" aria-hidden="true"><path d="M7 29V16h6v13M15 29V9h7v20M24 29V14h5v15M5 29h26"/></svg>`,
    leaf: `<svg viewBox="0 0 36 36" aria-hidden="true"><path d="M29 8C16 8 8 15 8 28c13 0 21-7 21-20Z"/><path class="cut" d="M10 26c5-7 10-11 17-16"/></svg>`,
    moon: `<svg viewBox="0 0 36 36" aria-hidden="true"><path d="M24 7c-8 2-12 8-10 15 2 6 8 9 15 6-3 4-10 6-16 3C5 27 3 17 9 10c4-5 10-6 15-3Z"/></svg>`,
    boat: `<svg viewBox="0 0 36 36" aria-hidden="true"><path d="M18 7v15M18 9l9 10h-9M18 11 10 21h8"/><path d="M6 24h24l-4 6H10l-4-6Z"/></svg>`,
    bridge: `<svg viewBox="0 0 36 36" aria-hidden="true"><path d="M6 25c4-9 20-9 24 0"/><path d="M8 25h20M12 25v5M18 23v7M24 25v5"/></svg>`,
    orange: `<svg viewBox="0 0 36 36" aria-hidden="true"><circle cx="18" cy="20" r="10"/><path d="M18 10c1-4 4-5 8-4-1 4-4 6-8 4Z"/><path class="cut" d="M13 19h.1M22 23h.1M18 27h.1"/></svg>`,
    palm: `<svg viewBox="0 0 36 36" aria-hidden="true"><path d="M18 14c-3-5-7-6-12-3 5 0 8 2 12 7M18 14c3-5 7-6 12-3-5 0-8 2-12 7M18 14c-1-5 1-8 5-10-1 5-2 8-5 12M18 14c1-5-1-8-5-10 1 5 2 8 5 12M18 16c-1 5-2 10-4 15h8c-2-5-3-10-4-15Z"/></svg>`,
    desert: `<svg viewBox="0 0 36 36" aria-hidden="true"><path d="M5 25c6-5 12-5 18 0 3 2 6 2 8 0"/><path d="M9 29c5-3 10-3 15 0"/><circle cx="25" cy="10" r="4"/></svg>`,
    cloud: `<svg viewBox="0 0 36 36" aria-hidden="true"><path d="M11 25h15a6 6 0 0 0 0-12 9 9 0 0 0-17 4 4 4 0 0 0 2 8Z"/></svg>`,
    grape: `<svg viewBox="0 0 36 36" aria-hidden="true"><circle cx="16" cy="13" r="4"/><circle cx="22" cy="13" r="4"/><circle cx="13" cy="20" r="4"/><circle cx="19" cy="20" r="4"/><circle cx="16" cy="27" r="4"/><path d="M20 8c3-2 5-2 8 0"/></svg>`,
    spark: `<svg viewBox="0 0 36 36" aria-hidden="true"><path d="M18 5 21 15l10 3-10 3-3 10-3-10-10-3 10-3 3-10Z"/></svg>`,
  };
  return `<span class="province-icon icon-${type}" title="${title}" aria-label="${title}">${icons[type] || icons.spark}</span>`;
}

function groupIndex(place) {
  const groups = geoGroupOrder[state.mode];
  const index = groups.indexOf(place.group);
  return index === -1 ? groups.length : index;
}

function visiblePlaces() {
  const query = state.search.trim().toLowerCase();
  return currentPlaces()
    .map((place) => ({ ...place, status: getStatus(place.code) }))
    .filter((place) => state.filter === "all" || place.status === state.filter)
    .filter((place) => !query || place.name.toLowerCase().includes(query) || place.code.toLowerCase().includes(query))
    .sort((a, b) => {
      const statusOrder = { visited: 0, blank: 1 };
      if (state.sortVisitedFirst) {
        return statusOrder[a.status] - statusOrder[b.status] || groupIndex(a) - groupIndex(b) || a.name.localeCompare(b.name, "zh-CN");
      }
      return groupIndex(a) - groupIndex(b) || statusOrder[a.status] - statusOrder[b.status] || a.name.localeCompare(b.name, "zh-CN");
    });
}

function renderScoreboard() {
  const places = currentPlaces();
  const count = (status) => places.filter((place) => getStatus(place.code) === status).length;
  document.querySelector("#visitedCount").textContent = count("visited");
  document.querySelector("#blankCount").textContent = count("blank");
  document.querySelector("#totalCount").textContent = places.length;
  const visited = count("visited");
  const total = places.length || 1;
  document.querySelector("#progressLabel").textContent = state.mode === "world" ? "世界点亮进度" : "中国点亮进度";
  document.querySelector("#progressText").textContent = `${visited} / ${places.length}`;
  document.querySelector("#progressFill").style.width = `${Math.round((visited / total) * 100)}%`;
}

function renderChrome() {
  const isWorld = state.mode === "world";
  pageTitle.textContent = "脚印";
  document.body.classList.toggle("world-mode", isWorld);
  document.body.classList.toggle("china-mode", !isWorld);
  document.body.classList.toggle("globe-inspect", isWorld && state.globePaused);
  if (globeToggle) globeToggle.hidden = !isWorld;
  if (globeVideo) globeVideo.hidden = !isWorld;
  if (globeReset) globeReset.hidden = !isWorld;
  if (globe3d) globe3d.hidden = !isWorld;
  updateGlobeToggle();
  collectionEyebrow.textContent = isWorld ? "国家收集册" : "省份收集册";
  searchInput.placeholder = isWorld ? "搜索国家" : "搜索省份 / 城市";
  const baseTitle = isWorld ? "所有国家" : "所有省份";
  const filterTitle = state.filter === "all" ? baseTitle : statusLabel[state.filter];
  listTitle.textContent = state.search.trim() ? `搜索：${state.search.trim()}` : filterTitle;
  document.querySelectorAll("[data-mode]").forEach((button) => button.classList.toggle("active", button.dataset.mode === state.mode));
  document.querySelectorAll("[data-filter]").forEach((button) => button.classList.toggle("active", button.dataset.filter === state.filter));
}

function renderList() {
  const list = visiblePlaces();
  if (state.mode === "world") {
    renderWorldList(list);
    return;
  }
  placeGrid.innerHTML = list
    .map((place) => {
      const icon = provinceIcon(place.code);
      const cityDrawer = renderCityDrawer(place);
      return `
        <article class="place-card ${place.status}" data-code="${place.code}">
          <button class="place-chip ${place.status}" type="button" data-expand-code="${place.code}">
            ${icon}
            <strong>${place.name}</strong>
            <span class="chip-actions">
              <i class="expand-mark ${state.expandedProvinces.has(place.code) ? "open" : ""}"></i>
              <span class="visited-toggle ${place.status === "visited" ? "checked" : ""}" data-toggle-visited="${place.code}" aria-label="标记已去过">
                ${place.status === "visited" ? "✓" : ""}
              </span>
            </span>
          </button>
          ${cityDrawer}
        </article>
      `;
    })
    .join("");
}

function renderWorldList(list) {
  const grouped = geoGroupOrder.world
    .map((group) => ({
      group,
      places: list.filter((place) => place.group === group),
    }))
    .filter((item) => item.places.length);

  placeGrid.innerHTML = grouped
    .map(({ group, places }) => {
      const visited = places.filter((place) => place.status === "visited").length;
      const expanded = state.expandedWorldGroups.has(group) || Boolean(state.search.trim());
      return `
        <article class="world-group ${expanded ? "open" : ""}">
          <button class="world-group-head" type="button" data-world-group="${group}" aria-expanded="${expanded}">
            <strong>${group}</strong>
            <em>${visited}/${places.length}</em>
            <i class="expand-mark ${expanded ? "open" : ""}"></i>
          </button>
          <div class="world-country-list">
            ${expanded ? places.map(renderCountryRow).join("") : ""}
          </div>
        </article>
      `;
    })
    .join("");
}

function renderCountryRow(place) {
  return `
    <button class="country-row ${place.status}" type="button" data-country-code="${place.code}">
      <span class="flag">${flagEmoji(place.code)}</span>
      <span class="country-name">${place.name}</span>
      <span class="visited-toggle ${place.status === "visited" ? "checked" : ""}" data-toggle-visited="${place.code}" aria-label="标记已去过">
        ${place.status === "visited" ? "✓" : ""}
      </span>
    </button>
  `;
}

function renderCityDrawer(place) {
  if (!state.expandedProvinces.has(place.code)) return "";
  if (state.loadingCityProvinces.has(place.code)) {
    return `<div class="city-drawer"><span class="city-empty">正在加载城市...</span></div>`;
  }
  const cities = state.chinaCityMap[place.code] || (provinceCities[place.code] || []).map((name) => ({ code: cityKey(place.code, name), name, provinceCode: place.code }));
  if (!cities.length) return `<div class="city-drawer"><span class="city-empty">还没有城市数据</span></div>`;
  return `
    <div class="city-drawer">
      ${cities
        .map((city) => {
          const checked = cityStatusSets.china.visited.has(cityCode(city));
          return `
            <button class="city-chip ${checked ? "visited" : ""}" type="button" data-city-toggle="${place.code}" data-city-code="${cityCode(city)}" data-city-name="${city.name}">
              <span>${city.name}</span>
              <i>${checked ? "✓" : ""}</i>
            </button>
          `;
        })
        .join("")}
    </div>
  `;
}

async function ensureProvinceCities(provinceCode) {
  if (state.chinaCityMap[provinceCode] || state.loadingCityProvinces.has(provinceCode)) return;
  state.loadingCityProvinces.add(provinceCode);
  renderAll();
  try {
    const data = await fetch(`https://geo.datav.aliyun.com/areas_v3/bound/${provinceCode}_full.json`).then((res) => res.json());
    const cities = (data.features || [])
      .filter((feature) => feature.properties?.name && feature.properties?.level === "city")
      .map((feature) => ({
        code: String(feature.properties.adcode),
        name: feature.properties.name.replace(/(市|地区|盟|自治州|特别行政区)$/u, ""),
        provinceCode,
      }));
    state.chinaCityMap[provinceCode] = cities.length
      ? cities
      : (provinceCities[provinceCode] || []).map((name) => ({ code: cityKey(provinceCode, name), name, provinceCode }));
  } catch {
    state.chinaCityMap[provinceCode] = (provinceCities[provinceCode] || []).map((name) => ({ code: cityKey(provinceCode, name), name, provinceCode }));
  } finally {
    state.loadingCityProvinces.delete(provinceCode);
    renderAll();
  }
}

function renderMap() {
  if (!globalThis.d3) return;
  hidePopover();
  if (state.mode === "world" && state.worldFeatures.length) renderWorldMap();
  if (state.mode === "china" && state.chinaFeatures.length) renderChinaMap();
  applyMapStates();
  wireMapClicks();
}

function renderWorldMap() {
  stopGlobeAnimation();
  const svg = d3.select(mapSvg);
  const width = 820;
  const height = 620;
  mapSvg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  mapSvg.classList.remove("china-map");
  mapSvg.classList.add("globe-map");
  svg.selectAll("*").remove();
  initThreeGlobe();
  updateThreeCountryStates();
  startGlobeAnimation();
}

function renderChinaMap() {
  stopGlobeAnimation();
  const svg = d3.select(mapSvg);
  const width = 720;
  const height = 720;
  mapSvg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  mapSvg.classList.add("china-map");
  mapSvg.classList.remove("globe-map");
  svg.selectAll("*").remove();

  const projection = d3.geoIdentity().reflectY(true).fitExtent(
    [
      [34, 34],
      [width - 34, height - 42],
    ],
    { type: "FeatureCollection", features: state.chinaFeatures },
  );
  const path = d3.geoPath(projection);

  zoomLayer = svg.append("g").attr("class", "zoom-layer");
  const contentLayer = zoomLayer
    .append("g")
    .attr("class", "china-content")
    .attr("transform", "translate(0,-76) scale(1,1.28)");
  contentLayer
    .selectAll("path")
    .data(state.chinaFeatures)
    .join("path")
    .attr("class", "map-shape")
    .attr("data-code", (feature) => String(feature.properties.adcode || ""))
    .attr("d", path)
    .append("title")
    .text((feature) => feature.properties.name || "");

  contentLayer
    .append("g")
    .attr("class", "label-layer")
    .selectAll("text")
    .data(chinaCityLabels)
    .join("text")
    .attr("class", "map-label city-label")
    .attr("x", (city) => projection([city.lon, city.lat])?.[0] || 0)
    .attr("y", (city) => projection([city.lon, city.lat])?.[1] || 0)
    .text((city) => city.name);

  attachZoom(svg);
}

function initThreeGlobe() {
  if (!globalThis.THREE || !globe3d) return;
  if (threeGlobe) {
    resizeThreeGlobe();
    threeGlobe.group.rotation.x = state.globeRotation.x;
    threeGlobe.group.rotation.y = state.globeRotation.y;
    return;
  }

  const THREE = globalThis.THREE;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);
  camera.position.set(0, 0, 4.8);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0x000000, 0);
  globe3d.replaceChildren(renderer.domElement);

  const group = new THREE.Group();
  group.rotation.set(state.globeRotation.x, state.globeRotation.y, 0);
  scene.add(group);

  const globe = new THREE.Mesh(
    new THREE.SphereGeometry(1.45, 96, 96),
    new THREE.MeshPhongMaterial({
      color: 0x10273a,
      emissive: 0x02070d,
      shininess: 18,
      specular: 0x355c78,
      transparent: true,
      opacity: 0.98,
    }),
  );
  group.add(globe);

  const atmosphere = new THREE.Mesh(
    new THREE.SphereGeometry(1.49, 96, 96),
    new THREE.MeshBasicMaterial({
      color: 0x2e6f9d,
      transparent: true,
      opacity: 0.14,
      side: THREE.BackSide,
      blending: THREE.AdditiveBlending,
    }),
  );
  group.add(atmosphere);

  scene.add(new THREE.AmbientLight(0x294b64, 1.35));
  const key = new THREE.DirectionalLight(0xd9f2ff, 2.3);
  key.position.set(-2.8, 2.2, 4.6);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x6dc6ff, 1.2);
  rim.position.set(3.2, -0.8, -2.4);
  scene.add(rim);

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const lineObjects = [];
  const selectedMarker = createCountryMarker(0xeaff9b, 0.22);
  selectedMarker.visible = false;
  group.add(selectedMarker);

  const boundaries = createCountryBoundaryObjects();
  boundaries.forEach((line) => {
    lineObjects.push(line);
    group.add(line);
  });

  threeGlobe = {
    scene,
    camera,
    renderer,
    group,
    globe,
    lineObjects,
    selectedMarker,
    raycaster,
    pointer,
    scale: 1,
    dragging: false,
    moved: false,
    lastX: 0,
    lastY: 0,
  };
  window.__threeGlobe = threeGlobe;

  renderer.domElement.addEventListener("pointerdown", handleThreePointerDown);
  renderer.domElement.addEventListener("pointermove", handleThreePointerMove);
  renderer.domElement.addEventListener("pointerup", handleThreePointerUp);
  renderer.domElement.addEventListener("pointerleave", handleThreePointerUp);
  window.addEventListener("resize", resizeThreeGlobe);
  resizeThreeGlobe();
  renderThreeGlobe();
}

function createCountryBoundaryObjects() {
  const THREE = globalThis.THREE;
  const codeByNumeric = new Map(state.worldPlaces.map((place) => [String(place.numeric).padStart(3, "0"), place.code]));
  return state.worldFeatures
    .map((feature) => {
      const code = codeByNumeric.get(String(feature.id).padStart(3, "0")) || "";
      const points = boundaryPointsForFeature(feature, 1.462);
      if (points.length < 2) return null;
      const geometry = new THREE.BufferGeometry().setFromPoints(points);
      const material = new THREE.LineBasicMaterial({
        color: 0xdff2da,
        transparent: true,
        opacity: code ? 0.18 : 0.06,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const line = new THREE.LineSegments(geometry, material);
      line.userData.code = code;
      return line;
    })
    .filter(Boolean);
}

function boundaryPointsForFeature(feature, radius) {
  const points = [];
  const pushRing = (ring) => {
    for (let index = 1; index < ring.length; index += 1) {
      points.push(lonLatToVector3(ring[index - 1][0], ring[index - 1][1], radius));
      points.push(lonLatToVector3(ring[index][0], ring[index][1], radius));
    }
  };
  const coordinates = feature.geometry?.coordinates || [];
  if (feature.geometry?.type === "Polygon") {
    coordinates.forEach(pushRing);
  }
  if (feature.geometry?.type === "MultiPolygon") {
    coordinates.forEach((polygon) => polygon.forEach(pushRing));
  }
  return points;
}

function lonLatToVector3(lon, lat, radius) {
  const phi = (lat * Math.PI) / 180;
  const theta = (lon * Math.PI) / 180;
  return new THREE.Vector3(
    radius * Math.cos(phi) * Math.sin(theta),
    radius * Math.sin(phi),
    radius * Math.cos(phi) * Math.cos(theta),
  );
}

function vector3ToLonLat(vector) {
  const normalized = vector.clone().normalize();
  const lon = (Math.atan2(normalized.x, normalized.z) * 180) / Math.PI;
  const lat = (Math.asin(normalized.y) * 180) / Math.PI;
  return [lon, lat];
}

function createCountryMarker(color, opacity) {
  return new THREE.Mesh(
    new THREE.SphereGeometry(1.468, 96, 96),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
}

function renderThreeGlobe() {
  if (!threeGlobe) return;
  threeGlobe.renderer.render(threeGlobe.scene, threeGlobe.camera);
}

function resizeThreeGlobe() {
  if (!threeGlobe || !globe3d) return;
  const rect = globe3d.getBoundingClientRect();
  const width = Math.max(1, rect.width);
  const height = Math.max(1, rect.height);
  threeGlobe.camera.aspect = width / height;
  threeGlobe.camera.updateProjectionMatrix();
  threeGlobe.renderer.setSize(width, height, false);
  renderThreeGlobe();
}

function updateThreeCountryStates() {
  if (!threeGlobe) return;
  threeGlobe.lineObjects.forEach((line) => {
    const status = getStatus(line.userData.code);
    const selected = state.selectedWorldCode && line.userData.code === state.selectedWorldCode;
    line.material.color.set(selected ? 0xffffff : status === "visited" ? 0xeaff9b : 0xdff2da);
    line.material.opacity = selected ? 0.72 : status === "visited" ? 0.44 : line.userData.code ? 0.16 : 0.05;
  });
  renderThreeGlobe();
}

function handleThreePointerDown(event) {
  if (!threeGlobe || state.mode !== "world") return;
  threeGlobe.dragging = true;
  threeGlobe.moved = false;
  threeGlobe.lastX = event.clientX;
  threeGlobe.lastY = event.clientY;
  state.globePaused = true;
  updateGlobeToggle();
  stopGlobeAnimation();
  event.currentTarget.setPointerCapture?.(event.pointerId);
}

function handleThreePointerMove(event) {
  if (!threeGlobe?.dragging) return;
  const dx = event.clientX - threeGlobe.lastX;
  const dy = event.clientY - threeGlobe.lastY;
  if (Math.abs(dx) + Math.abs(dy) > 2) threeGlobe.moved = true;
  threeGlobe.lastX = event.clientX;
  threeGlobe.lastY = event.clientY;
  threeGlobe.group.rotation.y += dx * 0.006;
  threeGlobe.group.rotation.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, threeGlobe.group.rotation.x + dy * 0.006));
  state.globeRotation = { x: threeGlobe.group.rotation.x, y: threeGlobe.group.rotation.y };
  hidePopover();
  renderThreeGlobe();
}

function handleThreePointerUp(event) {
  if (!threeGlobe?.dragging) return;
  threeGlobe.dragging = false;
  if (!threeGlobe.moved) selectCountryFromThreePointer(event);
}

function selectCountryFromThreePointer(event) {
  if (!threeGlobe) return;
  const rect = threeGlobe.renderer.domElement.getBoundingClientRect();
  threeGlobe.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  threeGlobe.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  threeGlobe.raycaster.setFromCamera(threeGlobe.pointer, threeGlobe.camera);
  const hit = threeGlobe.raycaster.intersectObject(threeGlobe.globe, false)[0];
  if (!hit) return;
  const local = threeGlobe.group.worldToLocal(hit.point.clone());
  const lonLat = vector3ToLonLat(local);
  const place = placeAtLonLat(lonLat);
  if (!place) return;
  state.selectedWorldCode = place.code;
  updateThreeCountryStates();
  showPopover(place, event);
}

function placeAtLonLat(lonLat) {
  const listed = state.worldFeatures
    .map((feature) => ({
      feature,
      place: state.worldPlaces.find((item) => String(item.numeric).padStart(3, "0") === String(feature.id).padStart(3, "0")),
    }))
    .filter((item) => item.place);
  const contained = listed.find((item) => d3.geoContains(item.feature, lonLat));
  if (contained) return contained.place;
  const nearest = listed
    .map((item) => ({
      ...item,
      distance: d3.geoDistance(lonLat, d3.geoCentroid(item.feature)),
    }))
    .sort((a, b) => a.distance - b.distance)[0];
  return nearest && nearest.distance < 0.22 ? nearest.place : null;
}

function resetThreeGlobe() {
  state.globePaused = true;
  state.globeRotation = { x: 0.55, y: -1.38 };
  updateGlobeToggle();
  stopGlobeAnimation();
  if (threeGlobe) {
    threeGlobe.group.rotation.x = state.globeRotation.x;
    threeGlobe.group.rotation.y = state.globeRotation.y;
    threeGlobe.scale = 1;
    threeGlobe.group.scale.setScalar(1);
    renderThreeGlobe();
  }
}

function startGlobeAnimation() {
  stopGlobeAnimation();
  if (state.globePaused || state.mode !== "world") return;
  globeTimer = d3.timer(() => {
    if (!threeGlobe) return;
    threeGlobe.group.rotation.y += 0.0022;
    state.globeRotation = { x: threeGlobe.group.rotation.x, y: threeGlobe.group.rotation.y };
    renderThreeGlobe();
  });
}

function stopGlobeAnimation() {
  globeVideo?.pause?.();
  if (globeTimer) {
    if (threeGlobe) {
      state.globeRotation = { x: threeGlobe.group.rotation.x, y: threeGlobe.group.rotation.y };
    }
    globeTimer.stop();
    globeTimer = null;
  }
}

function updateGlobeToggle() {
  if (!globeToggle) return;
  globeToggle.textContent = state.globePaused ? "播放" : "暂停";
  globeToggle.setAttribute("aria-label", state.globePaused ? "播放地球动画" : "暂停地球动画");
  document.body.classList.toggle("globe-inspect", state.mode === "world" && state.globePaused);
}

function attachGlobeInteraction(svg) {
  if (threeGlobe) return;
  zoomBehavior = d3
    .zoom()
    .scaleExtent([1, 3.8])
    .on("zoom", (event) => {
      if (!globeProjection) return;
      globeProjection.scale(globeBaseScale * event.transform.k);
      mapSvg.classList.toggle("show-labels", event.transform.k >= 1.35);
      drawGlobe();
      hidePopover();
    });

  const drag = d3
    .drag()
    .on("start", () => {
      state.globePaused = true;
      updateGlobeToggle();
      stopGlobeAnimation();
    })
    .on("drag", (event) => {
      const rotate = globeProjection.rotate();
      state.globeRotation = [rotate[0] + event.dx * 0.28, Math.max(-65, Math.min(65, rotate[1] - event.dy * 0.28)), 0];
      globeProjection.rotate(state.globeRotation);
      drawGlobe();
      hidePopover();
    });

  svg.call(zoomBehavior);
  svg.call(zoomBehavior.transform, d3.zoomIdentity);
  svg.call(drag);
  mapSvg.classList.remove("show-labels");
}

function applyMapStates() {
  document.querySelectorAll(".map-shape").forEach((shape) => {
    const code = shape.dataset.code;
    shape.classList.remove("visited", "blank");
    shape.classList.add(getStatus(code));
  });
}

function attachZoom(svg) {
  zoomBehavior = d3
    .zoom()
    .scaleExtent([1, 5])
    .translateExtent([
      [-180, -100],
      [1100, 920],
    ])
    .on("zoom", (event) => {
      if (event.transform.k <= 1.01 && (Math.abs(event.transform.x) > 0.5 || Math.abs(event.transform.y) > 0.5)) {
        svg.call(zoomBehavior.transform, d3.zoomIdentity);
        return;
      }
      if (zoomLayer) zoomLayer.attr("transform", event.transform.k <= 1.01 ? d3.zoomIdentity : event.transform);
      mapSvg.classList.toggle("show-labels", event.transform.k >= 1.35);
      hidePopover();
    });

  svg.call(zoomBehavior);
  svg.call(zoomBehavior.transform, d3.zoomIdentity);
  mapSvg.classList.remove("show-labels");
}

function placeByCode(code) {
  return currentPlaces().find((place) => place.code === code);
}

function wireMapClicks() {
  document.querySelectorAll(".map-shape").forEach((shape) => {
    shape.addEventListener("click", (event) => {
      event.stopPropagation();
      const code = shape.dataset.code;
      const place = placeByCode(code);
      if (!place) return;
      document.querySelectorAll(".map-shape.active").forEach((item) => item.classList.remove("active"));
      shape.classList.add("active");
      showPopover(place, event);
    });
  });
}

function showPopover(place, event) {
  const canvas = document.querySelector(".map-canvas").getBoundingClientRect();
  const x = Math.min(Math.max(event.clientX - canvas.left + 10, 10), canvas.width - 150);
  const y = Math.min(Math.max(event.clientY - canvas.top - 46, 10), canvas.height - 56);
  const icon =
    state.mode === "world"
      ? `<span class="mini-flag">${flagEmoji(place.code)}</span>`
      : provinceIcon(place.code);
  const checked = getStatus(place.code) === "visited" ? "checked" : "";
  mapPopover.innerHTML = `
    ${icon}
    <span>${place.name}</span>
    <label class="popover-check">
      <input type="checkbox" data-popover-visited="${place.code}" ${checked} />
      已去过
    </label>
  `;
  mapPopover.style.left = `${x}px`;
  mapPopover.style.top = `${y}px`;
  mapPopover.classList.remove("hidden");
}

function hidePopover() {
  mapPopover.classList.add("hidden");
  document.querySelectorAll(".map-shape.active").forEach((item) => item.classList.remove("active"));
}

function renderAll() {
  renderChrome();
  renderScoreboard();
  renderList();
  renderMap();
}

async function loadWorldFeatures() {
  const world = await fetch("data/countries-50m.json").then((res) => res.json());
  return topojson.feature(world, world.objects.countries).features;
}

async function loadChinaFeatures() {
  const data = await fetch("data/china-100000-full.json").then((res) => res.json());
  return (data.features || [])
    .filter((feature) => feature.properties?.name)
    .map((feature) => ({
      ...feature,
      geometry: removeOffshoreIslands(feature.geometry),
    }));
}

function removeOffshoreIslands(geometry) {
  if (!geometry || !Array.isArray(geometry.coordinates)) return geometry;
  const keepRing = (ring) => {
    const bounds = ring.reduce(
      (box, point) => ({
        minLon: Math.min(box.minLon, point[0]),
        maxLon: Math.max(box.maxLon, point[0]),
        minLat: Math.min(box.minLat, point[1]),
        maxLat: Math.max(box.maxLat, point[1]),
      }),
      { minLon: Infinity, maxLon: -Infinity, minLat: Infinity, maxLat: -Infinity },
    );
    const areaHint = (bounds.maxLon - bounds.minLon) * (bounds.maxLat - bounds.minLat);
    const inFarSouthSea = bounds.maxLat < 18 || bounds.minLon > 116 && bounds.maxLat < 24 && areaHint < 0.05;
    return !inFarSouthSea;
  };
  if (geometry.type === "MultiPolygon") {
    const coordinates = geometry.coordinates
      .map((polygon) => polygon.filter((ring, index) => index === 0 ? keepRing(ring) : true))
      .filter((polygon) => polygon.length);
    return { ...geometry, coordinates };
  }
  if (geometry.type === "Polygon") {
    const coordinates = geometry.coordinates.filter((ring, index) => index === 0 ? keepRing(ring) : true);
    return { ...geometry, coordinates };
  }
  return geometry;
}

document.querySelectorAll("[data-mode]").forEach((button) => {
  button.addEventListener("click", () => {
    state.mode = button.dataset.mode;
    state.filter = "all";
    state.search = "";
    searchInput.value = "";
    renderAll();
    mapStatus.textContent = state.mode === "world" ? "点击国家后可勾选已去过，地图支持拖动和缩放。" : "点击省份后可勾选已去过，地图支持拖动和缩放。";
  });
});

document.querySelectorAll("[data-filter]").forEach((button) => {
  button.addEventListener("click", () => {
    state.filter = button.dataset.filter;
    renderAll();
  });
});

searchInput.addEventListener("input", (event) => {
  state.search = event.target.value;
  renderAll();
});

placeGrid.addEventListener("click", (event) => {
  const toggle = event.target.closest("[data-toggle-visited]");
  if (toggle) {
    event.preventDefault();
    event.stopPropagation();
    const code = toggle.dataset.toggleVisited;
    setVisited(code, getStatus(code) !== "visited");
    return;
  }

  const cityToggle = event.target.closest("[data-city-toggle]");
  if (cityToggle) {
    event.preventDefault();
    event.stopPropagation();
    const provinceCode = cityToggle.dataset.cityToggle;
    const city = { code: cityToggle.dataset.cityCode, name: cityToggle.dataset.cityName, provinceCode };
    setCityVisited(provinceCode, city, !cityStatusSets.china.visited.has(cityCode(city)));
    return;
  }

  const expand = event.target.closest("[data-expand-code]");
  if (expand && state.mode === "china") {
    const code = expand.dataset.expandCode;
    if (state.expandedProvinces.has(code)) {
      state.expandedProvinces.delete(code);
    } else {
      state.expandedProvinces.add(code);
    }
    renderAll();
    ensureProvinceCities(code);
  }

  const worldGroup = event.target.closest("[data-world-group]");
  if (worldGroup && state.mode === "world") {
    const group = worldGroup.dataset.worldGroup;
    if (state.expandedWorldGroups.has(group)) {
      state.expandedWorldGroups.delete(group);
    } else {
      state.expandedWorldGroups.add(group);
    }
    renderAll();
    return;
  }

  const countryRow = event.target.closest("[data-country-code]");
  if (countryRow && state.mode === "world") {
    const code = countryRow.dataset.countryCode;
    setVisited(code, getStatus(code) !== "visited");
  }
});

mapPopover.addEventListener("change", (event) => {
  const input = event.target.closest("[data-popover-visited]");
  if (!input) return;
  setVisited(input.dataset.popoverVisited, input.checked);
});

document.querySelector("#zoomIn").addEventListener("click", () => {
  zoomBy(1.45);
});

document.querySelector("#zoomOut").addEventListener("click", () => {
  zoomBy(0.72);
});

globeToggle?.addEventListener("click", () => {
  state.globePaused = !state.globePaused;
  updateGlobeToggle();
  if (state.globePaused) {
    stopGlobeAnimation();
  } else {
    startGlobeAnimation();
  }
});

globeVideo?.addEventListener("click", () => {
  if (state.mode !== "world") return;
  state.globePaused = true;
  updateGlobeToggle();
  stopGlobeAnimation();
});

globeReset?.addEventListener("click", () => {
  resetThreeGlobe();
});

function zoomBy(factor) {
  if (state.mode === "world" && threeGlobe) {
    threeGlobe.scale = Math.max(0.75, Math.min(2.8, threeGlobe.scale * factor));
    threeGlobe.group.scale.setScalar(threeGlobe.scale);
    renderThreeGlobe();
    return;
  }
  if (!zoomBehavior || !globalThis.d3) return;
  const svg = d3.select(mapSvg);
  const box = mapSvg.viewBox.baseVal;
  const current = d3.zoomTransform(mapSvg);
  const nextScale = Math.max(1, Math.min(5, current.k * factor));
  if (nextScale <= 1.01) {
    svg.call(zoomBehavior.transform, d3.zoomIdentity);
    return;
  }
  const cx = box.width / 2;
  const cy = box.height / 2;
  const next = d3.zoomIdentity
    .translate(cx - ((cx - current.x) / current.k) * nextScale, cy - ((cy - current.y) / current.k) * nextScale)
    .scale(nextScale);
  svg.call(zoomBehavior.transform, next);
}

window.__travelMapZoomBy = zoomBy;

document.querySelector("#refreshList").addEventListener("click", () => {
  state.sortVisitedFirst = true;
  renderAll();
});

mapSvg.addEventListener("click", (event) => {
  if (event.target === mapSvg) hidePopover();
});

async function init() {
  renderAll();
  if (!globalThis.d3 || !globalThis.topojson) {
    mapStatus.textContent = "地图脚本未加载，当前只显示列表。";
    return;
  }

  try {
    const [worldFeatures, chinaFeatures] = await Promise.all([
      loadWorldFeatures(),
      loadChinaFeatures(),
    ]);
    const mapNumerics = new Set(worldFeatures.map((feature) => String(feature.id).padStart(3, "0")));
    state.worldPlaces = manualCountries.filter((place) => mapNumerics.has(String(place.numeric).padStart(3, "0")));
    state.worldFeatures = worldFeatures;
    state.chinaFeatures = chinaFeatures;
    renderAll();
    mapStatus.textContent = "已用本地国家列表加速首屏，点击地区可展开。";
  } catch {
    mapStatus.textContent = "地图数据暂时加载失败，已保留本地列表。";
  }
}

init();
