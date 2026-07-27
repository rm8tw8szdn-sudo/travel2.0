const routeFeed = document.querySelector("[data-route-feed]");
const routeFeedSentinel = document.querySelector("[data-route-feed-sentinel]");
const routeSearch = document.querySelector("[data-route-search]");
const routeSearchSummary = document.querySelector("[data-route-search-summary]");
const routeTabs = [...document.querySelectorAll("[data-route-tab]")];
const routeScrollRoot = document.querySelector(".route-screen");
let routeFeedObserver = null;
let routeFeedObserverActive = false;
let routeFeedSentinelNear = false;

const API_ENDPOINT = "/api/routes/discovery";
const IMAGE_ENDPOINT = "/api/routes/image-search";
const BATCH_SIZE = 6;
const FEED_PAGE_SIZE = BATCH_SIZE;
const FEED_CANDIDATE_PAGE_SIZE = FEED_PAGE_SIZE * 20;
const SEARCH_PAGE_SIZE = BATCH_SIZE;
const FEED_DEDUPE_WINDOW = 50;
const FEED_CLUSTER_COOLDOWN_WINDOW = 12;
const FEED_IMAGE_CANDIDATE_LIMIT = 24;
const FEED_CARD_IMAGE_TIMEOUT_MS = 2_000;
const FEED_COVER_PREPARE_DEADLINE_MS = 2_000;
const FEED_LOAD_WATCHDOG_MS = 8_000;
const ROUTE_FEED_SESSION_KEY = "travelCollection.routeFeedSession";
const ROUTE_FEED_PRELOAD_KEY = "travelCollection.routeFeedPreload.v2";
const ROUTE_FEED_PRELOAD_TTL_MS = 5 * 60 * 1000;
const ROUTE_FEED_QUERY_PARAM = "q";
const FALLBACK_ROUTE_COVER = "assets/trip-cover-placeholder.svg";
const routeImageAssets = globalThis.RouteV2ImageAssets || null;
const runtimeImageSearchEnabled = routeImageAssets?.isRuntimeImageSearchEnabled?.() === true;
const IMAGE_READY_COUNTRY_CODES = new Set([
  "AT", "BE", "FI", "FR", "GB", "HR", "HU", "IN", "IS", "IT", "JP", "KH", "LU", "MA", "NL", "SK", "TH", "TR", "US", "VN", "ZA",
  "AR", "CH", "CL", "CZ", "DE", "ES", "GR", "NO", "NP", "PL", "PT", "SE", "SI",
]);
const unsplashCover = (id) => `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=960&q=80`;
const BAD_REMOTE_COVER_PATTERNS = [
  /World_map_blank_without_borders/i,
  /\.svg(?:\.png)?(?:[?#]|$)/i,
  /(?:^|[/_-])map(?:[/_.-]|$)/i,
  /\.png(?:[?#]|$)/i,
  /danubemap/i,
  /tabliczka|road[_-]?sign|route[_-]?marker|locator|blank|flag|logo|icon|diagram/i,
  /collage|pays|statue|museum|camping|national[_-]?road|padang[_-]?besar|arkadenhof|front\.jpe?g|entrance|platform/i,
  /Big_Spy_Hop|Laguna_San_Ignacio|rosso|thumbnail\.jpg/i,
];
const ROUTE_IMAGE_COUNTRY_MISMATCH_RULES = [
  { pattern: /eiffel|paris|versailles|mont[-_ ]?saint[-_ ]?michel|france|bordeaux|photo-1502602898657/i, allowed: ["FR"] },
  { pattern: /milan|milano|venice|venezia|florence|firenze|rome|roma|tuscany|italy|photo-1523906834658/i, allowed: ["IT"] },
  { pattern: /london|westminster|tower[_-]?bridge|england|scotland|wales|photo-1513635269975/i, allowed: ["GB"] },
  { pattern: /budapest|hungarian[_-]?parliament|hungary/i, allowed: ["HU"] },
  { pattern: /prague|charles[_-]?bridge|czech/i, allowed: ["CZ"] },
  { pattern: /vienna|schonbrunn|sch%C3%B6nbrunn|austria/i, allowed: ["AT"] },
  { pattern: /lofoten|bergen|norway|fjord|photo-1518684079/i, allowed: ["NO"] },
  { pattern: /aurora|northern[_-]?lights|photo-1519681393784/i, allowed: ["NO", "SE", "FI", "IS", "CA", "US"] },
  { pattern: /iceland|jokulsarlon|reykjavik/i, allowed: ["IS"] },
  { pattern: /kyoto|tokyo|kiyomizu|fushimi|japan/i, allowed: ["JP"] },
  { pattern: /cappadocia|istanbul|pamukkale|turkey/i, allowed: ["TR"] },
  { pattern: /angkor|cambodia/i, allowed: ["KH"] },
  { pattern: /bangkok|thailand|photo-1537996194471/i, allowed: ["TH"] },
  { pattern: /halong|vietnam/i, allowed: ["VN"] },
  { pattern: /machu[_-]?picchu|peru/i, allowed: ["PE"] },
  { pattern: /ait[-_ ]?benhaddou|marrakesh|morocco/i, allowed: ["MA"] },
  { pattern: /safari|kenya|tanzania|namibia|sossusvlei|etosha/i, allowed: ["KE", "TZ", "NA", "ZA", "BW", "UG", "RW"] },
];
const badRuntimeImageUrls = new Set();
const ONLINE_FALLBACK_COVERS = [
  [/佛教|圣地|印度|阿富汗|越南|buddhist|india|vietnam/i, unsplashCover("1524492412937-b28074a5d7da")],
  [/中欧|奥地利|斯洛伐克|匈牙利|捷克|central europe/i, "https://upload.wikimedia.org/wikipedia/commons/thumb/9/99/Hungarian_Parliament_Building_from_across_the_Danube%2C_2025-01-11.jpg/960px-Hungarian_Parliament_Building_from_across_the_Danube%2C_2025-01-11.jpg"],
  [/欧洲E45|e45|布伦纳/i, "https://upload.wikimedia.org/wikipedia/commons/thumb/9/90/Brennerpass_nordrampe.jpg/960px-Brennerpass_nordrampe.jpg"],
  [/多瑙河|danube/i, "https://upload.wikimedia.org/wikipedia/commons/thumb/8/8d/Wachau_%282%29.JPG/960px-Wachau_%282%29.JPG"],
  [/曼谷.*新加坡|bangkok.*singapore/i, "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a4/Bangkok-large.png/960px-Bangkok-large.png"],
  [/加拿大|落基|rockies/i, "https://upload.wikimedia.org/wikipedia/commons/thumb/c/c5/Moraine_Lake_17092005.jpg/960px-Moraine_Lake_17092005.jpg"],
  [/荷兰|郁金香|tulip/i, "https://upload.wikimedia.org/wikipedia/commons/thumb/1/10/Keukenhof%2C_tulips_%2833513228345%29.jpg/960px-Keukenhof%2C_tulips_%2833513228345%29.jpg"],
  [/挪威|lofoten|norway/i, "https://upload.wikimedia.org/wikipedia/commons/thumb/4/4b/Reine_i_Lofoten_LC0148.jpg/960px-Reine_i_Lofoten_LC0148.jpg"],
  [/新西兰|南岛|new zealand/i, "https://upload.wikimedia.org/wikipedia/commons/thumb/d/da/Milford_Sound_in_Fiordland_National_Park_01.jpg/960px-Milford_Sound_in_Fiordland_National_Park_01.jpg"],
  [/加州|california|pacific coast/i, "https://upload.wikimedia.org/wikipedia/commons/thumb/c/ca/Bixby_Creek_Bridge%2C_California%2C_USA_-_May_2013.jpg/960px-Bixby_Creek_Bridge%2C_California%2C_USA_-_May_2013.jpg"],
  [/秘鲁|peru/i, "https://upload.wikimedia.org/wikipedia/commons/thumb/e/eb/Machu_Picchu%2C_Peru.jpg/960px-Machu_Picchu%2C_Peru.jpg"],
  [/摩洛哥|morocco/i, "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a4/A%C3%AFtBenhaddou_Morocco_2.jpg/960px-A%C3%AFtBenhaddou_Morocco_2.jpg"],
  [/伦敦|london/i, "https://upload.wikimedia.org/wikipedia/commons/thumb/6/63/Tower_Bridge_from_Shad_Thames.jpg/960px-Tower_Bridge_from_Shad_Thames.jpg"],
  [/camino|santiago|pilgrim/i, "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a9/Santiago_cathedral_2021.jpg/960px-Santiago_cathedral_2021.jpg"],
  [/southeast|banana|khao/i, "https://upload.wikimedia.org/wikipedia/commons/thumb/e/e0/Khao_San_East_2007.jpg/960px-Khao_San_East_2007.jpg"],
  [/francigena|aosta/i, "https://upload.wikimedia.org/wikipedia/commons/thumb/4/45/CastelloDiF%C3%A9nisJuly292023_06.jpg/960px-CastelloDiF%C3%A9nisJuly292023_06.jpg"],
  [/baltic|tallinn|estonia/i, "https://upload.wikimedia.org/wikipedia/commons/thumb/7/70/Raekoja_plats_at_night.jpg/960px-Raekoja_plats_at_night.jpg"],
  [/angkor|cambodia|mekong/i, "https://upload.wikimedia.org/wikipedia/commons/thumb/4/41/Angkor_Wat.jpg/960px-Angkor_Wat.jpg"],
  [/santorini|greece|island/i, "https://upload.wikimedia.org/wikipedia/commons/thumb/7/79/Oia_-_Santorini_-_Greece_-_16.jpg/960px-Oia_-_Santorini_-_Greece_-_16.jpg"],
  [/kyoto|japan|kansai/i, "https://upload.wikimedia.org/wikipedia/commons/thumb/8/83/Kiyomizu-dera%2C_Kyoto%2C_November_2016_-01.jpg/960px-Kiyomizu-dera%2C_Kyoto%2C_November_2016_-01.jpg"],
  [/cappadocia|turkey|balloon/i, "https://upload.wikimedia.org/wikipedia/commons/thumb/5/52/Hot_air_balloon_start_in_Cappadocia_2014.jpg/960px-Hot_air_balloon_start_in_Cappadocia_2014.jpg"],
];
const CENTRAL_EUROPE_FALLBACK_COVERS = [
  unsplashCover("1541849546-216549ae216d"),
  unsplashCover("1549877452-9c387954fbc2"),
  unsplashCover("1500530855697-b586d89ba3ee"),
  unsplashCover("1467269204594-9661b134dd2b"),
  unsplashCover("1502602898657-3e91760cbb34"),
  unsplashCover("1506744038136-46273834b3fb"),
];
const REGION_FALLBACK_COVERS = [
  { codes: ["NL", "BE", "LU"], images: [
    unsplashCover("1512470876302-972faa2aa9a4"),
    unsplashCover("1505761671935-60b3a7427bad"),
    "https://upload.wikimedia.org/wikipedia/commons/thumb/f/f7/Bruges_Belgium_Rozenhoedkaai-01.jpg/960px-Bruges_Belgium_Rozenhoedkaai-01.jpg",
  ] },
  { codes: ["GB", "FR"], images: [
    unsplashCover("1513635269975-59663e0ac1ad"),
    unsplashCover("1502602898657-3e91760cbb34"),
    "https://upload.wikimedia.org/wikipedia/commons/thumb/2/2f/Mont-Saint-Michel_vu_du_ciel.jpg/960px-Mont-Saint-Michel_vu_du_ciel.jpg",
  ] },
  { codes: ["DE", "FR"], images: [
    unsplashCover("1502602898657-3e91760cbb34"),
    unsplashCover("1467269204594-9661b134dd2b"),
    "https://upload.wikimedia.org/wikipedia/commons/thumb/5/5c/Strasbourg_Cathedral_Exterior_-_Diliff.jpg/960px-Strasbourg_Cathedral_Exterior_-_Diliff.jpg",
  ] },
  { codes: ["GB", "DE"], images: [
    unsplashCover("1513635269975-59663e0ac1ad"),
    unsplashCover("1467269204594-9661b134dd2b"),
    unsplashCover("1502602898657-3e91760cbb34"),
  ] },
  { codes: ["DE", "IT"], images: [
    unsplashCover("1467269204594-9661b134dd2b"),
    unsplashCover("1523906834658-6e24ef2386f9"),
    unsplashCover("1500534623283-312aade485b7"),
  ] },
  { codes: ["CZ", "IT"], images: [
    unsplashCover("1541849546-216549ae216d"),
    unsplashCover("1523906834658-6e24ef2386f9"),
    unsplashCover("1467269204594-9661b134dd2b"),
  ] },
  { codes: ["AR", "CL"], images: [
    unsplashCover("1500530855697-b586d89ba3ee"),
    unsplashCover("1469474968028-56623f02e42e"),
    unsplashCover("1506744038136-46273834b3fb"),
  ] },
  { codes: ["TH", "KH", "VN"], images: [
    "https://upload.wikimedia.org/wikipedia/commons/thumb/4/41/Angkor_Wat.jpg/960px-Angkor_Wat.jpg",
    unsplashCover("1507525428034-b723cf961d3e"),
    unsplashCover("1537996194471-e657df975ab4"),
  ] },
  { codes: ["LT", "LV", "EE", "FI"], images: [
    "https://upload.wikimedia.org/wikipedia/commons/thumb/7/70/Raekoja_plats_at_night.jpg/960px-Raekoja_plats_at_night.jpg",
    "https://upload.wikimedia.org/wikipedia/commons/thumb/e/e4/Riga_Dom_2010.jpg/960px-Riga_Dom_2010.jpg",
    "https://upload.wikimedia.org/wikipedia/commons/thumb/d/d9/Helsinki_Cathedral_in_July_2004.jpg/960px-Helsinki_Cathedral_in_July_2004.jpg",
  ] },
];
const COUNTRY_CONTINENT_SETS = {
  africa: new Set(["DZ", "AO", "BJ", "BW", "BF", "BI", "CV", "CM", "CF", "TD", "KM", "CG", "CD", "CI", "DJ", "EG", "GQ", "ER", "SZ", "ET", "GA", "GM", "GH", "GN", "GW", "KE", "LS", "LR", "LY", "MG", "MW", "ML", "MR", "MU", "MA", "MZ", "NA", "NE", "NG", "RW", "ST", "SN", "SC", "ZA", "SS", "SD", "TZ", "TG", "TN", "UG", "ZM", "ZW"]),
  americas: new Set(["AG", "AR", "BS", "BB", "BZ", "BO", "BR", "CA", "CL", "CO", "CR", "CU", "DM", "DO", "EC", "SV", "GD", "GT", "GY", "HT", "HN", "JM", "MX", "NI", "PA", "PY", "PE", "KN", "LC", "VC", "SR", "TT", "US", "UY", "VE"]),
  asia: new Set(["AF", "AM", "AZ", "BH", "BD", "BT", "BN", "KH", "CY", "GE", "IN", "ID", "IR", "IQ", "IL", "JP", "JO", "KZ", "KW", "KG", "LA", "LB", "MY", "MV", "MN", "MM", "NP", "KP", "OM", "PK", "PS", "PH", "QA", "SA", "SG", "KR", "LK", "SY", "TW", "TJ", "TH", "TL", "TR", "TM", "AE", "UZ", "VN", "YE"]),
  europe: new Set(["AD", "AL", "AT", "BA", "BE", "BG", "BY", "CH", "CZ", "DE", "DK", "EE", "ES", "FI", "FR", "GB", "GR", "HR", "HU", "IE", "IS", "IT", "LI", "LT", "LU", "LV", "MC", "MD", "ME", "MK", "MT", "NL", "NO", "PL", "PT", "RO", "RS", "RU", "SE", "SI", "SK", "SM", "UA", "VA", "XK"]),
  oceania: new Set(["AU", "FJ", "FM", "KI", "MH", "NR", "NZ", "PW", "PG", "WS", "SB", "TO", "TV", "VU"]),
};
const CONTINENT_ONLINE_FALLBACK_COVERS = {
  africa: [
    "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a4/A%C3%AFtBenhaddou_Morocco_2.jpg/960px-A%C3%AFtBenhaddou_Morocco_2.jpg",
    "https://upload.wikimedia.org/wikipedia/commons/thumb/5/51/NubianMeroePyramids30sep2005.jpg/960px-NubianMeroePyramids30sep2005.jpg",
    unsplashCover("1547471080-7cc2caa01a7e"),
    unsplashCover("1516026672322-bc52d61a55d5"),
    unsplashCover("1523805009345-7448845a9e53"),
    unsplashCover("1516426122078-c23e76319801"),
  ],
  americas: [
    unsplashCover("1500530855697-b586d89ba3ee"),
    unsplashCover("1469474968028-56623f02e42e"),
    "https://upload.wikimedia.org/wikipedia/commons/thumb/e/eb/Machu_Picchu%2C_Peru.jpg/960px-Machu_Picchu%2C_Peru.jpg",
    "https://upload.wikimedia.org/wikipedia/commons/thumb/3/35/Golden_Gate_Bridge_at_sunset_1.jpg/960px-Golden_Gate_Bridge_at_sunset_1.jpg",
    unsplashCover("1506744038136-46273834b3fb"),
    unsplashCover("1519681393784-d120267933ba"),
  ],
  asia: [
    "https://upload.wikimedia.org/wikipedia/commons/thumb/8/83/Kiyomizu-dera%2C_Kyoto%2C_November_2016_-01.jpg/960px-Kiyomizu-dera%2C_Kyoto%2C_November_2016_-01.jpg",
    "https://upload.wikimedia.org/wikipedia/commons/thumb/4/41/Angkor_Wat.jpg/960px-Angkor_Wat.jpg",
    "https://upload.wikimedia.org/wikipedia/commons/thumb/5/52/Hot_air_balloon_start_in_Cappadocia_2014.jpg/960px-Hot_air_balloon_start_in_Cappadocia_2014.jpg",
    unsplashCover("1537996194471-e657df975ab4"),
    unsplashCover("1507525428034-b723cf961d3e"),
    unsplashCover("1524492412937-b28074a5d7da"),
  ],
  europe: [
    unsplashCover("1541849546-216549ae216d"),
    unsplashCover("1467269204594-9661b134dd2b"),
    unsplashCover("1513635269975-59663e0ac1ad"),
    unsplashCover("1523906834658-6e24ef2386f9"),
    unsplashCover("1502602898657-3e91760cbb34"),
    "https://upload.wikimedia.org/wikipedia/commons/thumb/9/99/Hungarian_Parliament_Building_from_across_the_Danube%2C_2025-01-11.jpg/960px-Hungarian_Parliament_Building_from_across_the_Danube%2C_2025-01-11.jpg",
  ],
  oceania: [
    "https://upload.wikimedia.org/wikipedia/commons/thumb/d/da/Milford_Sound_in_Fiordland_National_Park_01.jpg/960px-Milford_Sound_in_Fiordland_National_Park_01.jpg",
    unsplashCover("1500530855697-b586d89ba3ee"),
    unsplashCover("1507525428034-b723cf961d3e"),
    unsplashCover("1518684079-3c830dcef090"),
    unsplashCover("1506744038136-46273834b3fb"),
    unsplashCover("1470770841072-f978cf4d019e"),
  ],
};
const GLOBAL_ONLINE_FALLBACK_COVERS = [
  unsplashCover("1500530855697-b586d89ba3ee"),
  unsplashCover("1469474968028-56623f02e42e"),
  unsplashCover("1476514525535-07fb3b4ae5f1"),
  unsplashCover("1493246507139-91e8fad9978e"),
  unsplashCover("1500534623283-312aade485b7"),
  unsplashCover("1506744038136-46273834b3fb"),
  unsplashCover("1519681393784-d120267933ba"),
  unsplashCover("1526772662000-3f88f10405ff"),
  unsplashCover("1537996194471-e657df975ab4"),
  unsplashCover("1541849546-216549ae216d"),
  unsplashCover("1467269204594-9661b134dd2b"),
  unsplashCover("1513635269975-59663e0ac1ad"),
  unsplashCover("1523906834658-6e24ef2386f9"),
  unsplashCover("1502602898657-3e91760cbb34"),
  unsplashCover("1547471080-7cc2caa01a7e"),
  unsplashCover("1516026672322-bc52d61a55d5"),
  unsplashCover("1523805009345-7448845a9e53"),
  unsplashCover("1516426122078-c23e76319801"),
  unsplashCover("1507525428034-b723cf961d3e"),
  unsplashCover("1524492412937-b28074a5d7da"),
  "https://upload.wikimedia.org/wikipedia/commons/thumb/d/db/Sunset_on_the_beach_in_Colonia_del_Sacramento.jpg/960px-Sunset_on_the_beach_in_Colonia_del_Sacramento.jpg",
  "https://upload.wikimedia.org/wikipedia/commons/thumb/4/40/Saariston_rengastie_11.jpg/960px-Saariston_rengastie_11.jpg",
  "https://upload.wikimedia.org/wikipedia/commons/thumb/8/87/Arroyo_del_Valle_-_Major_Cliffs.jpg/960px-Arroyo_del_Valle_-_Major_Cliffs.jpg",
  "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a2/Patapat_Viaduct_Bridge.jpg/960px-Patapat_Viaduct_Bridge.jpg",
  "https://upload.wikimedia.org/wikipedia/commons/thumb/f/f5/Trekking_Ausangate_Circuit_-_Kampeerplaats_Japata.jpg/960px-Trekking_Ausangate_Circuit_-_Kampeerplaats_Japata.jpg",
  "https://upload.wikimedia.org/wikipedia/commons/thumb/1/17/Anne_Beadell_Highway_2006.jpg/960px-Anne_Beadell_Highway_2006.jpg",
  "https://upload.wikimedia.org/wikipedia/commons/thumb/0/05/Parador_de_Carmona_1.jpg/960px-Parador_de_Carmona_1.jpg",
  "https://upload.wikimedia.org/wikipedia/commons/thumb/3/3c/Blue_Ridge_Parkway_-_Nature%27s_Palette_on_the_Blue_Ridge_Parkway_-_NARA_-_7717421.jpg/960px-Blue_Ridge_Parkway_-_Nature%27s_Palette_on_the_Blue_Ridge_Parkway_-_NARA_-_7717421.jpg",
  "https://upload.wikimedia.org/wikipedia/commons/thumb/5/51/NubianMeroePyramids30sep2005.jpg/960px-NubianMeroePyramids30sep2005.jpg",
  "https://upload.wikimedia.org/wikipedia/commons/thumb/5/54/Amtrak_California_Zephyr_on_the_Colorado_River_%2828154290124%29.jpg/960px-Amtrak_California_Zephyr_on_the_Colorado_River_%2828154290124%29.jpg",
  "https://upload.wikimedia.org/wikipedia/commons/thumb/f/fe/Central_Alexandria.JPG/960px-Central_Alexandria.JPG",
  "https://upload.wikimedia.org/wikipedia/commons/thumb/8/85/Ferry_on_Prince_William_Sound_at_Whittier.jpg/960px-Ferry_on_Prince_William_Sound_at_Whittier.jpg",
  "https://upload.wikimedia.org/wikipedia/commons/thumb/e/e6/Hunawihr1P7.jpg/960px-Hunawihr1P7.jpg",
  "https://upload.wikimedia.org/wikipedia/commons/thumb/e/e0/Khao_San_East_2007.jpg/960px-Khao_San_East_2007.jpg",
  "https://upload.wikimedia.org/wikipedia/commons/thumb/d/d1/1997-10-bruce-trail-river-r.jpg/960px-1997-10-bruce-trail-river-r.jpg",
  "https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Sarnath_Archaeological_Site_4.jpg/960px-Sarnath_Archaeological_Site_4.jpg",
  "https://upload.wikimedia.org/wikipedia/commons/thumb/7/7d/Kusttram_CAF_Middelkerke--Westende_08.jpg/960px-Kusttram_CAF_Middelkerke--Westende_08.jpg",
  "https://upload.wikimedia.org/wikipedia/commons/thumb/8/87/Puente_La_Quemada_-_San_Felipe%2C_Guanajuato_-_Camino_Real_de_Tierra_Adentro_6.jpg/960px-Puente_La_Quemada_-_San_Felipe%2C_Guanajuato_-_Camino_Real_de_Tierra_Adentro_6.jpg",
  "https://upload.wikimedia.org/wikipedia/commons/thumb/2/20/Black_Brooke_Green_Cove_Cabot_Trail_Nova_Scotia_Canada-2_%2827447976389%29.jpg/960px-Black_Brooke_Green_Cove_Cabot_Trail_Nova_Scotia_Canada-2_%2827447976389%29.jpg",
  "https://upload.wikimedia.org/wikipedia/commons/thumb/2/24/Outback_Xplorer_10_Mar_20.jpg/960px-Outback_Xplorer_10_Mar_20.jpg",
  "https://upload.wikimedia.org/wikipedia/commons/thumb/c/cc/Bishop_Peak_from_the_Coast_Starlight.jpg/960px-Bishop_Peak_from_the_Coast_Starlight.jpg",
  "https://upload.wikimedia.org/wikipedia/commons/thumb/2/26/Start_of_coast_to_coast_-_winter.jpg/960px-Start_of_coast_to_coast_-_winter.jpg",
  "https://upload.wikimedia.org/wikipedia/commons/thumb/2/27/Lagangarbh_cottage_with_Buachaille_Etive_M%C3%B2r.jpg/960px-Lagangarbh_cottage_with_Buachaille_Etive_M%C3%B2r.jpg",
  "https://upload.wikimedia.org/wikipedia/commons/thumb/e/e3/DarjeelingTrainFruitshop.JPG/960px-DarjeelingTrainFruitshop.JPG",
  "https://upload.wikimedia.org/wikipedia/commons/thumb/9/90/Brennerpass_nordrampe.jpg/960px-Brennerpass_nordrampe.jpg",
  "https://upload.wikimedia.org/wikipedia/commons/thumb/1/10/Milano%2C_Duomo_with_Milan_Cathedral_and_Galleria_Vittorio_Emanuele_II%2C_2016.jpg/960px-Milano%2C_Duomo_with_Milan_Cathedral_and_Galleria_Vittorio_Emanuele_II%2C_2016.jpg",
  "https://upload.wikimedia.org/wikipedia/commons/thumb/0/0a/Athens_City_Hall_from_NE_corner.JPG/960px-Athens_City_Hall_from_NE_corner.JPG",
  "https://upload.wikimedia.org/wikipedia/commons/thumb/1/18/138_-_Place_de_la_Bourse_et_le_miroir_d%27eau_-_Bordeaux.jpg/960px-138_-_Place_de_la_Bourse_et_le_miroir_d%27eau_-_Bordeaux.jpg",
  "https://upload.wikimedia.org/wikipedia/commons/thumb/8/86/City_of_London%2C_seen_from_Tower_Bridge.jpg/960px-City_of_London%2C_seen_from_Tower_Bridge.jpg",
  "https://upload.wikimedia.org/wikipedia/commons/thumb/3/3c/Kiyomizu.jpg/960px-Kiyomizu.jpg",
  "https://upload.wikimedia.org/wikipedia/commons/thumb/e/e2/Appalachian_National_Scenic_Trail_%28Vermont%29_%28f37a5748-d122-4f49-99f1-f13a6d68fb3f%29.jpg/960px-Appalachian_National_Scenic_Trail_%28Vermont%29_%28f37a5748-d122-4f49-99f1-f13a6d68fb3f%29.jpg",
  "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a9/Santiago_cathedral_2021.jpg/960px-Santiago_cathedral_2021.jpg",
];
const SAFE_WIKIMEDIA_FALLBACK_COVERS = {
  africa: [
    "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a4/A%C3%AFtBenhaddou_Morocco_2.jpg/960px-A%C3%AFtBenhaddou_Morocco_2.jpg",
    "https://upload.wikimedia.org/wikipedia/commons/thumb/5/51/NubianMeroePyramids30sep2005.jpg/960px-NubianMeroePyramids30sep2005.jpg",
    "https://upload.wikimedia.org/wikipedia/commons/thumb/f/fe/Central_Alexandria.JPG/960px-Central_Alexandria.JPG",
  ],
  americas: [
    "https://upload.wikimedia.org/wikipedia/commons/thumb/e/eb/Machu_Picchu%2C_Peru.jpg/960px-Machu_Picchu%2C_Peru.jpg",
    "https://upload.wikimedia.org/wikipedia/commons/thumb/3/35/Golden_Gate_Bridge_at_sunset_1.jpg/960px-Golden_Gate_Bridge_at_sunset_1.jpg",
    "https://upload.wikimedia.org/wikipedia/commons/thumb/8/87/Puente_La_Quemada_-_San_Felipe%2C_Guanajuato_-_Camino_Real_de_Tierra_Adentro_6.jpg/960px-Puente_La_Quemada_-_San_Felipe%2C_Guanajuato_-_Camino_Real_de_Tierra_Adentro_6.jpg",
  ],
  asia: [
    "https://upload.wikimedia.org/wikipedia/commons/thumb/4/41/Angkor_Wat.jpg/960px-Angkor_Wat.jpg",
    "https://upload.wikimedia.org/wikipedia/commons/thumb/8/83/Kiyomizu-dera%2C_Kyoto%2C_November_2016_-01.jpg/960px-Kiyomizu-dera%2C_Kyoto%2C_November_2016_-01.jpg",
    "https://upload.wikimedia.org/wikipedia/commons/thumb/5/52/Hot_air_balloon_start_in_Cappadocia_2014.jpg/960px-Hot_air_balloon_start_in_Cappadocia_2014.jpg",
    "https://upload.wikimedia.org/wikipedia/commons/thumb/4/4c/Halong_Bay_in_Vietnam.jpg/960px-Halong_Bay_in_Vietnam.jpg",
  ],
  europe: [
    "https://upload.wikimedia.org/wikipedia/commons/thumb/9/99/Hungarian_Parliament_Building_from_across_the_Danube%2C_2025-01-11.jpg/960px-Hungarian_Parliament_Building_from_across_the_Danube%2C_2025-01-11.jpg",
    "https://upload.wikimedia.org/wikipedia/commons/thumb/9/90/Brennerpass_nordrampe.jpg/960px-Brennerpass_nordrampe.jpg",
    "https://upload.wikimedia.org/wikipedia/commons/thumb/f/f7/Bruges_Belgium_Rozenhoedkaai-01.jpg/960px-Bruges_Belgium_Rozenhoedkaai-01.jpg",
    "https://upload.wikimedia.org/wikipedia/commons/thumb/7/70/Raekoja_plats_at_night.jpg/960px-Raekoja_plats_at_night.jpg",
    "https://upload.wikimedia.org/wikipedia/commons/thumb/d/d9/Helsinki_Cathedral_in_July_2004.jpg/960px-Helsinki_Cathedral_in_July_2004.jpg",
    "https://upload.wikimedia.org/wikipedia/commons/thumb/7/79/Oia_-_Santorini_-_Greece_-_16.jpg/960px-Oia_-_Santorini_-_Greece_-_16.jpg",
  ],
  oceania: [
    "https://upload.wikimedia.org/wikipedia/commons/thumb/d/da/Milford_Sound_in_Fiordland_National_Park_01.jpg/960px-Milford_Sound_in_Fiordland_National_Park_01.jpg",
    "https://upload.wikimedia.org/wikipedia/commons/thumb/2/24/Outback_Xplorer_10_Mar_20.jpg/960px-Outback_Xplorer_10_Mar_20.jpg",
  ],
};
const SAFE_WIKIMEDIA_FALLBACK_SET = new Set(Object.values(SAFE_WIKIMEDIA_FALLBACK_COVERS).flat().map((url) => String(url).toLowerCase()));
const UNIQUE_WIKIMEDIA_FALLBACK_COVERS = [...new Set([
  ...Object.values(SAFE_WIKIMEDIA_FALLBACK_COVERS).flat(),
  ...GLOBAL_ONLINE_FALLBACK_COVERS.filter((url) => /^https:\/\/upload\.wikimedia\.org\//i.test(url)),
])];
const LOCAL_COVER_BY_ROUTE_ID = {
  "gold-case-accepted-gold-1-jp-first-trip": "assets/route-japan-classic-cover.svg",
  "gold-case-accepted-gold-2-it-first-trip": "assets/atlas-italy-cover.svg",
  "gold-case-accepted-gold-3-jp-alps-deep-dive": "assets/route-japan-hokkaido-cover.svg",
  "gold-case-accepted-gold-4-central-europe-hopper": "assets/route-central-asia-loop-cover.svg",
  "gold-case-accepted-gold-5-scotland-road-trip": "assets/route-nordic-cover.svg",
  "gold-case-accepted-gold-6-swiss-rail-journey": "assets/route-nordic-cover.svg",
  "gold-case-accepted-gold-7-jp-autumn-seasonal": "assets/route-japan-kansai-cover.svg",
  "gold-case-accepted-gold-8-france-wine-theme": "assets/country-landmark-france.jpg",
  "gold-case-accepted-gold-9-greece-island-hopping": "assets/route-greece-civilization-cover.svg",
  "gold-case-accepted-gold-10-shikoku-pilgrimage": "assets/route-japan-classic-cover.svg",
  "gold-case-accepted-gold-11-london-city-break": "assets/route-central-asia-loop-cover.svg",
  "gold-case-accepted-gold-c45-3-peru-first-trip": "assets/favorite-route-central-asia.svg",
  "gold-case-accepted-gold-c45-4-morocco-first-trip": "assets/route-east-africa-safari-cover.svg",
  "gold-case-accepted-gold-c45-5-new-zealand-first-trip": "assets/favorite-route-canada.svg",
  "gold-case-accepted-gold-c45-7-andalusia-deep-dive": "assets/atlas-italy-cover.svg",
  "gold-case-accepted-gold-c45-8-patagonia-deep-dive": "assets/favorite-route-canada.svg",
  "gold-case-accepted-gold-c45-9-northern-norway-deep-dive": "assets/route-nordic-cover.svg",
  "gold-case-accepted-gold-c45-10-yucatan-deep-dive": "assets/route-greece-civilization-cover.svg",
  "gold-case-accepted-gold-c45-12-canadian-rockies-road-trip": "assets/favorite-route-canada.svg",
  "gold-case-accepted-gold-c45-13-california-pacific-coast": "assets/favorite-route-canada.svg",
  "gold-case-accepted-gold-c45-14-south-island-new-zealand": "assets/favorite-route-canada.svg",
  "gold-case-accepted-gold-c45-15-garden-route": "assets/route-east-africa-safari-cover.svg",
  "gold-case-accepted-gold-c45-17-japan-jr-grand-route": "assets/route-japan-classic-cover.svg",
  "gold-case-accepted-gold-c45-18-norway-scenic-railway": "assets/route-nordic-cover.svg",
  "gold-case-accepted-gold-c45-19-canadian-transcontinental-rail": "assets/favorite-route-canada.svg",
  "gold-case-accepted-gold-c45-20-central-europe-by-rail": "assets/route-central-asia-loop-cover.svg",
  "gold-case-accepted-gold-c45-22-netherlands-tulip-season": "assets/country-landmark-france.jpg",
  "gold-case-accepted-gold-c45-23-canada-autumn-rockies": "assets/favorite-route-canada.svg",
  "gold-case-accepted-gold-c45-24-germany-christmas-markets": "assets/route-central-asia-loop-cover.svg",
  "gold-case-accepted-gold-c45-25-namibia-dry-season-safari": "assets/route-east-africa-safari-cover.svg",
  "gold-case-accepted-gold-c45-27-italy-food-journey": "assets/atlas-italy-cover.svg",
  "gold-case-accepted-gold-c45-28-turkey-unesco-journey": "assets/trip-turkey-cover.svg",
  "gold-case-accepted-gold-c45-29-australia-wildlife-journey": "assets/route-east-africa-safari-cover.svg",
  "gold-case-accepted-gold-c45-30-mexico-maya-civilization": "assets/route-greece-civilization-cover.svg",
  "gold-case-accepted-gold-c45-32-croatian-islands": "assets/route-thai-islands-cover.svg",
  "gold-case-accepted-gold-c45-33-philippines-palawan": "assets/route-thai-islands-cover.svg",
  "gold-case-accepted-gold-c45-34-azores-islands": "assets/route-thai-islands-cover.svg",
  "gold-case-accepted-gold-c45-35-hawaii-island-journey": "assets/route-thai-islands-cover.svg",
  "gold-case-accepted-gold-c45-37-camino-frances": "assets/atlas-italy-cover.svg",
  "gold-case-accepted-gold-c45-38-kumano-kodo": "assets/route-japan-kansai-cover.svg",
  "gold-case-accepted-gold-c45-39-via-francigena": "assets/atlas-italy-cover.svg",
  "gold-case-accepted-gold-c45-42-baltic-capitals": "assets/route-nordic-cover.svg",
  "gold-case-accepted-gold-c45-43-benelux-explorer": "assets/route-central-asia-loop-cover.svg",
  "gold-case-accepted-gold-c45-44-balkan-sampler": "assets/route-central-asia-loop-cover.svg",
  "gold-case-accepted-gold-c45-45-mekong-discovery": "assets/route-southeast-asia-cover.svg",
};
const COUNTRY_ONLINE_FALLBACK_COVERS = {
  AT: "https://upload.wikimedia.org/wikipedia/commons/thumb/4/4f/Wien_-_Schloss_Sch%C3%B6nbrunn_%281%29.JPG/960px-Wien_-_Schloss_Sch%C3%B6nbrunn_%281%29.JPG",
  BE: "https://upload.wikimedia.org/wikipedia/commons/thumb/f/f7/Bruges_Belgium_Rozenhoedkaai-01.jpg/960px-Bruges_Belgium_Rozenhoedkaai-01.jpg",
  CZ: "https://upload.wikimedia.org/wikipedia/commons/thumb/7/70/Raekoja_plats_at_night.jpg/960px-Raekoja_plats_at_night.jpg",
  DE: "https://upload.wikimedia.org/wikipedia/commons/thumb/9/90/Brennerpass_nordrampe.jpg/960px-Brennerpass_nordrampe.jpg",
  FR: "https://upload.wikimedia.org/wikipedia/commons/thumb/2/2f/Mont-Saint-Michel_vu_du_ciel.jpg/960px-Mont-Saint-Michel_vu_du_ciel.jpg",
  GB: "https://upload.wikimedia.org/wikipedia/commons/thumb/6/63/Tower_Bridge_from_Shad_Thames.jpg/960px-Tower_Bridge_from_Shad_Thames.jpg",
  HU: "https://upload.wikimedia.org/wikipedia/commons/thumb/9/99/Hungarian_Parliament_Building_from_across_the_Danube%2C_2025-01-11.jpg/960px-Hungarian_Parliament_Building_from_across_the_Danube%2C_2025-01-11.jpg",
  IS: "https://upload.wikimedia.org/wikipedia/commons/thumb/e/e3/J%C3%B6kuls%C3%A1rl%C3%B3n_lagoon_in_Iceland.jpg/960px-J%C3%B6kuls%C3%A1rl%C3%B3n_lagoon_in_Iceland.jpg",
  IT: "https://upload.wikimedia.org/wikipedia/commons/thumb/1/10/Milano%2C_Duomo_with_Milan_Cathedral_and_Galleria_Vittorio_Emanuele_II%2C_2016.jpg/960px-Milano%2C_Duomo_with_Milan_Cathedral_and_Galleria_Vittorio_Emanuele_II%2C_2016.jpg",
  AR: "https://upload.wikimedia.org/wikipedia/commons/thumb/f/f5/Trekking_Ausangate_Circuit_-_Kampeerplaats_Japata.jpg/960px-Trekking_Ausangate_Circuit_-_Kampeerplaats_Japata.jpg",
  CL: "https://upload.wikimedia.org/wikipedia/commons/thumb/f/f5/Trekking_Ausangate_Circuit_-_Kampeerplaats_Japata.jpg/960px-Trekking_Ausangate_Circuit_-_Kampeerplaats_Japata.jpg",
  JP: "https://upload.wikimedia.org/wikipedia/commons/thumb/8/83/Kiyomizu-dera%2C_Kyoto%2C_November_2016_-01.jpg/960px-Kiyomizu-dera%2C_Kyoto%2C_November_2016_-01.jpg",
  KH: "https://upload.wikimedia.org/wikipedia/commons/thumb/4/41/Angkor_Wat.jpg/960px-Angkor_Wat.jpg",
  LU: "https://upload.wikimedia.org/wikipedia/commons/thumb/6/6b/Luxembourg_City_Grund_from_Bock.jpg/960px-Luxembourg_City_Grund_from_Bock.jpg",
  NL: "https://upload.wikimedia.org/wikipedia/commons/thumb/1/10/Keukenhof%2C_tulips_%2833513228345%29.jpg/960px-Keukenhof%2C_tulips_%2833513228345%29.jpg",
  SK: "https://upload.wikimedia.org/wikipedia/commons/thumb/4/47/Bratislava_Castle%2C_Danube%2C_St_Martin_Cathedral.jpg/960px-Bratislava_Castle%2C_Danube%2C_St_Martin_Cathedral.jpg",
  TH: "https://upload.wikimedia.org/wikipedia/commons/thumb/e/e0/Khao_San_East_2007.jpg/960px-Khao_San_East_2007.jpg",
  TR: "https://upload.wikimedia.org/wikipedia/commons/thumb/5/52/Hot_air_balloon_start_in_Cappadocia_2014.jpg/960px-Hot_air_balloon_start_in_Cappadocia_2014.jpg",
  US: "https://upload.wikimedia.org/wikipedia/commons/thumb/3/35/Golden_Gate_Bridge_at_sunset_1.jpg/960px-Golden_Gate_Bridge_at_sunset_1.jpg",
  VN: "https://upload.wikimedia.org/wikipedia/commons/thumb/4/4c/Halong_Bay_in_Vietnam.jpg/960px-Halong_Bay_in_Vietnam.jpg",
};
const LOCAL_COVER_BY_COUNTRY = {
  AE: "assets/country-landmark-uae.jpg",
  EG: "assets/route-egypt-pyramids-cover.svg",
  FI: "assets/country-landmark-finland.png",
  FR: "assets/country-landmark-france.jpg",
  GR: "assets/route-greece-civilization-cover.svg",
  IS: "assets/atlas-iceland-cover.svg",
  IT: "assets/atlas-italy-cover.svg",
  JP: "assets/route-japan-classic-cover.svg",
  KE: "assets/route-east-africa-safari-cover.svg",
  KG: "assets/route-central-asia-cover.svg",
  KH: "assets/country-landmark-cambodia.jpg",
  KR: "assets/country-landmark-korea.jpg",
  KZ: "assets/route-central-asia-cover.svg",
  MY: "assets/country-landmark-malaysia.jpg",
  NO: "assets/country-landmark-norway.jpg",
  SE: "assets/country-landmark-sweden.jpg",
  SG: "assets/country-landmark-singapore.jpg",
  TH: "assets/country-landmark-thailand.jpg",
  TR: "assets/trip-turkey-cover.svg",
  TZ: "assets/route-east-africa-safari-cover.svg",
  UZ: "assets/route-central-asia-cover.svg",
  VN: "assets/country-landmark-vietnam.jpg",
};
const LOCAL_COVER_BY_COUNTRY_NAME = {
  日本: LOCAL_COVER_BY_COUNTRY.JP,
  意大利: LOCAL_COVER_BY_COUNTRY.IT,
  法国: LOCAL_COVER_BY_COUNTRY.FR,
  希腊: LOCAL_COVER_BY_COUNTRY.GR,
  土耳其: LOCAL_COVER_BY_COUNTRY.TR,
  冰岛: LOCAL_COVER_BY_COUNTRY.IS,
  挪威: LOCAL_COVER_BY_COUNTRY.NO,
  芬兰: LOCAL_COVER_BY_COUNTRY.FI,
  瑞典: LOCAL_COVER_BY_COUNTRY.SE,
  埃及: LOCAL_COVER_BY_COUNTRY.EG,
  泰国: LOCAL_COVER_BY_COUNTRY.TH,
  越南: LOCAL_COVER_BY_COUNTRY.VN,
  柬埔寨: LOCAL_COVER_BY_COUNTRY.KH,
  马来西亚: LOCAL_COVER_BY_COUNTRY.MY,
  新加坡: LOCAL_COVER_BY_COUNTRY.SG,
  肯尼亚: LOCAL_COVER_BY_COUNTRY.KE,
  坦桑尼亚: LOCAL_COVER_BY_COUNTRY.TZ,
  韩国: LOCAL_COVER_BY_COUNTRY.KR,
  阿联酋: LOCAL_COVER_BY_COUNTRY.AE,
  乌兹别克斯坦: LOCAL_COVER_BY_COUNTRY.UZ,
  哈萨克斯坦: LOCAL_COVER_BY_COUNTRY.KZ,
  吉尔吉斯斯坦: LOCAL_COVER_BY_COUNTRY.KG,
};
const LOCAL_COVER_RULES = [
  [/湄公河|东南亚|曼谷|暹粒|金边|胡志明|seasia|southeast/i, "assets/route-southeast-asia-cover.svg"],
  [/日本|东京|京都|大阪|关西|熊野|四国|japan|kansai/i, "assets/route-japan-classic-cover.svg"],
  [/北海道|札幌|雪|hokkaido/i, "assets/route-japan-hokkaido-cover.svg"],
  [/挪威|芬兰|瑞典|北欧|极光|峡湾|norway|finland|sweden|nordic|aurora|fjord/i, "assets/route-nordic-cover.svg"],
  [/冰岛|reykjavik|iceland/i, "assets/atlas-iceland-cover.svg"],
  [/土耳其|卡帕多奇亚|伊斯坦布尔|turkey|cappadocia/i, "assets/trip-turkey-cover.svg"],
  [/希腊|雅典|圣托里尼|greece|athens|santorini/i, "assets/route-greece-civilization-cover.svg"],
  [/埃及|开罗|卢克索|金字塔|egypt|cairo|pyramid/i, "assets/route-egypt-pyramids-cover.svg"],
  [/中亚|乌兹别克|哈萨克|吉尔吉斯|撒马尔罕|central asia|samarkand/i, "assets/route-central-asia-cover.svg"],
  [/肯尼亚|坦桑尼亚|南非|纳米比亚|动物|野生|safari|kenya|tanzania|namibia/i, "assets/route-east-africa-safari-cover.svg"],
  [/跳岛|海岛|群岛|island|hawaii|palawan|azores|croatia/i, "assets/route-thai-islands-cover.svg"],
  [/铁路|火车|rail|train/i, "assets/route-nordic-cover.svg"],
  [/自驾|公路|海岸|高地|落基|road|coast|rockies|patagonia/i, "assets/favorite-route-canada.svg"],
  [/葡萄酒|美食|wine|food/i, "assets/atlas-italy-cover.svg"],
  [/多国|首都|欧洲|中欧|巴尔干|波罗的海|benelux|balkan|baltic|europe/i, "assets/route-central-asia-loop-cover.svg"],
];

const feedState = {
  records: [],
  cursor: null,
  hasMore: true,
  status: "idle",
  query: readRouteQueryFromUrl(),
  activeTab: "cross",
  feedRouteType: "cross",
  sessionId: createSessionId(),
  requestToken: 0,
  activeAbortController: null,
  activeImageAbortController: null,
  suggestions: [],
  pendingMore: false,
  pendingRetryAt: 0,
  prefetchedFeedPage: null,
  prefetchAbortController: null,
  prefetching: false,
  prefetchPromise: null,
  lastLoadDebug: null,
  skippedRouteIds: new Set(),
  nextRenderBatchId: 1,
  pendingBatchAnchorId: "",
  loadingStartedAt: 0,
  lastVisibleBatchAt: 0,
  searchResolved: false,
  searchResultCount: 0,
  searchFailureReason: "",
  searchFailureCodes: [],
  consecutiveEmptyPages: 0,
};

if ("scrollRestoration" in history) history.scrollRestoration = "manual";
window.scrollTo(0, 0);
window.addEventListener("pageshow", () => window.scrollTo(0, 0), { once: true });

function createSessionId() {
  const stored = sessionStorage.getItem(ROUTE_FEED_SESSION_KEY);
  if (stored) return stored;
  const next = globalThis.crypto?.randomUUID?.() || `route-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  sessionStorage.setItem(ROUTE_FEED_SESSION_KEY, next);
  return next;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function readRouteState() {
  return window.TravelState?.readTravelState?.() || {};
}

function updateRouteState(updater) {
  return window.TravelState?.updateTravelState?.(updater) || {};
}

function abortActiveRequest() {
  feedState.activeAbortController?.abort();
  feedState.activeImageAbortController?.abort();
  feedState.activeAbortController = null;
  feedState.activeImageAbortController = null;
  invalidateFeedPrefetch();
}

function invalidateFeedPrefetch() {
  feedState.prefetchAbortController?.abort();
  feedState.prefetchAbortController = null;
  feedState.prefetchedFeedPage = null;
  feedState.prefetching = false;
  feedState.prefetchPromise = null;
}

function timeoutSignal(timeoutMs) {
  if (globalThis.AbortSignal?.timeout) return AbortSignal.timeout(timeoutMs);
  const controller = new AbortController();
  setTimeout(() => controller.abort(), timeoutMs);
  return controller.signal;
}

function combineAbortSignals(signals = []) {
  const activeSignals = signals.filter(Boolean);
  if (globalThis.AbortSignal?.any) return AbortSignal.any(activeSignals);
  const controller = new AbortController();
  const abort = () => controller.abort();
  for (const signal of activeSignals) {
    if (signal.aborted) {
      controller.abort();
      break;
    }
    signal.addEventListener?.("abort", abort, { once: true });
  }
  return controller.signal;
}

function requestSignal(controller, timeoutMs) {
  const deadlineSignal = timeoutSignal(timeoutMs);
  if (!controller?.signal) return deadlineSignal;
  return combineAbortSignals([controller.signal, deadlineSignal]);
}

function childDeadlineSignal(parentSignal, timeoutMs) {
  const deadlineSignal = timeoutSignal(timeoutMs);
  if (!parentSignal) return deadlineSignal;
  return combineAbortSignals([parentSignal, deadlineSignal]);
}

function delay(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, Math.max(0, ms)));
}

function stableTextHash(value) {
  let hash = 2166136261;
  for (const char of String(value || "")) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function routeKind(record) {
  const entityCodes = (record.countryEntities || []).map((item) => item.countryCode).filter(Boolean);
  const fallbackCountries = (record.countries || []).filter(Boolean);
  const countryCount = new Set(entityCodes.length ? entityCodes : fallbackCountries).size;
  return countryCount > 1 ? "cross" : "single";
}

function visibleRecords() {
  const records = feedState.records.filter((record) => record?.id);
  if (feedState.query || !feedState.feedRouteType) return records;
  return records.filter((record) => routeKind(record) === feedState.activeTab);
}

function fixedPilotRouteCover(record = {}) {
  const resolved = routeImageAssets?.resolveLocalRouteCover?.(record)
    || routeImageAssets?.resolvePilotRouteCover(record.id);
  if (!resolved) return { url: FALLBACK_ROUTE_COVER, source: "local-placeholder", isFallback: true };
  if (resolved.key) record.coverImageKey = resolved.key;
  if (!resolved.isFallback && badRuntimeImageUrls.has(coverIdentity(resolved.url))) {
    return { url: FALLBACK_ROUTE_COVER, source: "local-placeholder", isFallback: true };
  }
  return resolved;
}

function readRouteQueryFromUrl() {
  try {
    return new URL(window.location.href).searchParams.get(ROUTE_FEED_QUERY_PARAM)?.trim() || "";
  } catch {
    return "";
  }
}

function persistRouteQueryInUrl(query) {
  const url = new URL(window.location.href);
  const normalized = String(query || "").trim();
  if (normalized) url.searchParams.set(ROUTE_FEED_QUERY_PARAM, normalized);
  else url.searchParams.delete(ROUTE_FEED_QUERY_PARAM);
  window.history.replaceState(window.history.state, "", url);
}

function coverUrl(record) {
  const fixedCover = fixedPilotRouteCover(record);
  if (!runtimeImageSearchEnabled || (fixedCover && !fixedCover.isFallback)) return fixedCover?.url || FALLBACK_ROUTE_COVER;
  if (
    isVerifiedRouteImageAsset(record, record.onlineCoverAsset)
      && !isPlannerFallbackCover(record.onlineCoverAsset)
      && !/picsum\.photos/i.test(record.onlineCoverAsset.imageUrl)
      && routeImageAllowed(record, record.onlineCoverAsset.imageUrl)
  ) return record.onlineCoverAsset.imageUrl;
  if (isPlannerMaterializedRecord(record)) return "";
  if (isPlannerPlaceholderCover(record)) return "";
  const remoteCover = record.coverAsset?.imageUrl || record.coverImage || "";
  if (remoteCover && isVerifiedRouteImageAsset(record, record.coverAsset) && routeImageAllowed(record, remoteCover)) return remoteCover;
  return fixedCover?.url || FALLBACK_ROUTE_COVER;
}

function displayCoverUrl(record) {
  const imageUrl = coverUrl(record);
  return imageUrl || "";
}

function markRouteCoverReady(record = {}, imageUrl = displayCoverUrl(record)) {
  const key = coverIdentity(imageUrl);
  if (key) record._coverReadyUrl = key;
}

function hasReadyRouteCover(record = {}) {
  const imageUrl = displayCoverUrl(record);
  return Boolean(imageUrl && coverIdentity(imageUrl) === record._coverReadyUrl);
}

function uniqueCoverCandidates(record = {}, offset = 0) {
  void offset;
  const candidates = [];
  const push = (imageUrl) => {
    const key = coverIdentity(imageUrl);
    if (key && !candidates.some((item) => coverIdentity(item) === key)) candidates.push(imageUrl);
  };
  push(displayCoverUrl(record));
  return candidates;
}

async function ensureUniqueReadyRouteCover(record, usedImages, controller, offset = 0) {
  void controller;
  void offset;
  const currentUrl = displayCoverUrl(record);
  const currentKey = routeImageDedupeKey(record) || coverIdentity(currentUrl);
  if (hasReadyRouteCover(record) && currentKey && !usedImages.has(currentKey)) {
    usedImages.add(currentKey);
    return true;
  }
  record.coverSearchFailed = true;
  clearRouteCover(record);
  return false;
}

async function enforceUniqueReadyCovers(records = [], previousRecords = [], controller) {
  void controller;
  const usedImages = new Set(previousRecords.slice(-FEED_DEDUPE_WINDOW)
    .map((record) => routeImageDedupeKey(record) || coverIdentity(displayCoverUrl(record)))
    .filter(Boolean));
  for (const [index, record] of records.entries()) {
    await ensureUniqueReadyRouteCover(record, usedImages, controller, index * 17);
  }
}

function forceReadyFallbackCovers(records = [], previousRecords = []) {
  void records;
  void previousRecords;
}

function isPlannerPlaceholderCover(record = {}) {
  if (!isPlannerMaterializedRecord(record) && record.coverAsset?.imageUrl && record.coverAsset?.provider && !isPlannerFallbackCover(record.coverAsset)) {
    return false;
  }
  return isPlannerMaterializedRecord(record);
}

function isPlannerMaterializedRecord(record = {}) {
  return Boolean(
    String(record.id || "").startsWith("materialized-")
      || record.contentEvidence?.plannerRuleVersion
      || record.contentEvidence?.materialized
      || record.coverAsset?.discoveredVia === "planner-rule-materialized"
      || record.coverAsset?.discoveredVia === "materialized-route-pool"
      || record.provenance?.providerId === "planner-rule-materialized",
  );
}

function isCentralEuropeMaterializedRoute(record = {}) {
  if (!isPlannerPlaceholderCover(record) && !record.contentEvidence?.plannerRuleVersion && !String(record.id || "").startsWith("materialized-")) return false;
  const codes = [
    ...(record.countries || []),
    ...(record.countryEntities || []).map((item) => item.countryCode),
  ].map((code) => String(code || "").toUpperCase()).filter(Boolean);
  const centralEuropeCodes = new Set(["AT", "CZ", "DE", "HU", "SK"]);
  return codes.length > 0 && codes.every((code) => centralEuropeCodes.has(code));
}

function isPlannerFallbackCover(asset = {}) {
  const provider = String(asset.provider || "").toLowerCase();
  return provider.includes("fallback") || provider.includes("prewarmed");
}

function routeSearchText(record = {}) {
  return [
    record.id,
    record.name,
    record.canonicalTitle,
    record.sourceTitle,
    ...(record.countries || []),
    ...(record.destinations || []),
    ...(record.cities || []),
    ...(record.themes || []),
    ...(record.tags || []),
  ].filter(Boolean).join(" ");
}

function routeCountryCodes(record = {}) {
  return [...new Set([
    ...(record.countryEntities || []).map((item) => item.countryCode),
    ...(record.countries || []),
  ].map((code) => String(code || "").toUpperCase()).filter((code) => /^[A-Z]{2}$/.test(code)))];
}

function routeImageDedupeKey(record = {}) {
  const fixedCover = fixedPilotRouteCover(record);
  if (fixedCover?.key) return `asset-key:${fixedCover.key}`;
  return record.onlineCoverAsset?.imageDedupeKey
    || record.onlineCoverAsset?.dedupeKey
    || record.coverAsset?.imageDedupeKey
    || record.coverAsset?.dedupeKey
    || coverIdentity(displayCoverUrl(record));
}

function imageCountryCodesForUrl(record = {}, imageUrl = "") {
  const key = coverIdentity(imageUrl);
  const candidates = [record.onlineCoverAsset, record.coverAsset].filter(Boolean);
  const asset = candidates.find((item) => coverIdentity(item?.imageUrl) === key) || candidates[0];
  return Array.isArray(asset?.imageCountryCodes)
    ? asset.imageCountryCodes.map((code) => String(code || "").toUpperCase()).filter(Boolean)
    : [];
}

function isVerifiedRouteImageAsset(record = {}, asset = {}) {
  if (!asset?.imageUrl) return false;
  if (asset.semanticStatus !== "verified" && asset.coverStatus !== "verified" && asset.status !== "verified") return false;
  const routeCodes = routeCountryCodes(record);
  const imageCodes = Array.isArray(asset.imageCountryCodes)
    ? asset.imageCountryCodes.map((code) => String(code || "").toUpperCase())
    : [];
  return routeCodes.length > 0 && imageCodes.some((code) => routeCodes.includes(code));
}

function routeHasAnyCountry(record = {}, allowedCodes = []) {
  const codes = new Set(routeCountryCodes(record));
  return allowedCodes.some((code) => codes.has(String(code || "").toUpperCase()));
}

function routeImageReadinessScore(record = {}) {
  const verifiedCoverBonus = displayCoverUrl(record) ? 100 : 0;
  return verifiedCoverBonus + routeCountryCodes(record).filter((code) => IMAGE_READY_COUNTRY_CODES.has(code)).length;
}

function routeImageAllowed(record = {}, imageUrl = "") {
  const text = String(imageUrl || "");
  if (!text) return false;
  if (/images\.unsplash\.com/i.test(text)) return false;
  if (/^https:\/\/loremflickr\.com\//i.test(text)) return false;
  if (BAD_REMOTE_COVER_PATTERNS.some((pattern) => pattern.test(text))) return false;
  if (badRuntimeImageUrls.has(coverIdentity(text))) return false;
  for (const rule of ROUTE_IMAGE_COUNTRY_MISMATCH_RULES) {
    if (rule.pattern.test(text) && !routeHasAnyCountry(record, rule.allowed)) return false;
  }
  const routeCodes = routeCountryCodes(record);
  const imageCodes = imageCountryCodesForUrl(record, text);
  return routeCodes.length > 0 && imageCodes.some((code) => routeCodes.includes(code));
}

function routeImageAllowedForAsset(record = {}, image = {}) {
  return Boolean(
    image?.imageUrl
      && routeImageAllowed({ ...record, onlineCoverAsset: image }, image.imageUrl),
  );
}

function isSafeWikimediaFallbackCover(imageUrl = "") {
  const raw = String(imageUrl || "").toLowerCase();
  if (BAD_REMOTE_COVER_PATTERNS.some((pattern) => pattern.test(raw))) return false;
  if (SAFE_WIKIMEDIA_FALLBACK_SET.has(raw)) return true;
  try {
    const decoded = decodeURIComponent(raw);
    if (BAD_REMOTE_COVER_PATTERNS.some((pattern) => pattern.test(decoded))) return false;
    return SAFE_WIKIMEDIA_FALLBACK_SET.has(decoded);
  } catch {
    return false;
  }
}

function isDisplayableRouteImage(record = {}, imageUrl = "") {
  return routeImageAllowed(record, imageUrl);
}

function isTemporaryRuntimeCover(imageUrl = "") {
  return /^https:\/\/loremflickr\.com\//i.test(String(imageUrl || ""));
}

function englishCountryNameForCode(code) {
  const normalized = String(code || "").toUpperCase();
  try {
    const displayNames = new Intl.DisplayNames(["en"], { type: "region" });
    return displayNames.of(normalized) || normalized;
  } catch {
    return normalized;
  }
}

function routeImageThemeKeyword(record = {}) {
  const text = routeSearchText(record);
  if (/沙漠|sahara|desert|dune/i.test(text)) return "desert";
  if (/海岛|跳岛|island|beach|coast/i.test(text)) return "coast";
  if (/铁路|火车|rail|train/i.test(text)) return "station";
  if (/古城|遗产|文明|castle|cathedral|temple|heritage|unesco/i.test(text)) return "landmark";
  if (/自然|野生|动物|safari|wildlife|fjord|glacier|mountain/i.test(text)) return "nature";
  return "landmark";
}

function dynamicCountryCoverUrl(record = {}, offset = 0) {
  const codes = routeCountryCodes(record);
  if (!codes.length) return "";
  const continents = [...new Set(codes.map(continentForCountryCode))];
  const continent = continents.length
    ? continents[(stableTextHash(`${record.id || record.name || ""}:safe-continent`) + offset) % continents.length]
    : "europe";
  const pool = SAFE_WIKIMEDIA_FALLBACK_COVERS[continent] || SAFE_WIKIMEDIA_FALLBACK_COVERS.europe;
  const hash = stableTextHash(`${record.id || record.name || ""}:${codes.join("|")}:safe-cover`);
  for (let index = 0; index < pool.length; index += 1) {
    const image = pool[(hash + offset + index) % pool.length];
    if (routeImageAllowed(record, image) || isSafeWikimediaFallbackCover(image)) return image;
  }
  const merged = Object.values(SAFE_WIKIMEDIA_FALLBACK_COVERS).flat();
  return merged[(hash + offset) % merged.length] || "";
}

function countryCodeFallbackCoverUrl(record = {}, offset = 0) {
  const codes = routeCountryCodes(record);
  const codeSet = new Set(codes);
  const region = REGION_FALLBACK_COVERS.find((item) => item.codes.every((code) => codeSet.has(code)));
  if (region) {
    const hash = [...String(record.id || record.name || "")].reduce((total, char) => total + char.charCodeAt(0), 0);
    const image = region.images[(hash + offset) % region.images.length];
    if (routeImageAllowed(record, image)) return image;
  }
  const images = codes.map((code) => COUNTRY_ONLINE_FALLBACK_COVERS[code]).filter(Boolean);
  if (images.length) {
    const hash = [...String(record.id || record.name || "")].reduce((total, char) => total + char.charCodeAt(0), 0);
    for (let index = 0; index < images.length; index += 1) {
      const image = images[(hash + offset + index) % images.length];
      if (routeImageAllowed(record, image) || isSafeWikimediaFallbackCover(image)) return image;
    }
  }
  for (let index = 0; index <= FEED_DEDUPE_WINDOW; index += 1) {
    const dynamicImage = dynamicCountryCoverUrl(record, offset + index);
    if (dynamicImage && routeImageAllowed(record, dynamicImage)) return dynamicImage;
  }
  return "";
}

function continentForCountryCode(code) {
  const normalized = String(code || "").toUpperCase();
  for (const [continent, codes] of Object.entries(COUNTRY_CONTINENT_SETS)) {
    if (codes.has(normalized)) return continent;
  }
  return "europe";
}

function continentFallbackCoverUrl(record = {}, offset = 0) {
  const codes = routeCountryCodes(record);
  const continents = [...new Set(codes.map(continentForCountryCode))];
  const continent = continents.length
    ? continents[(stableTextHash(record.id || record.name || "") + offset) % continents.length]
    : "europe";
  const images = CONTINENT_ONLINE_FALLBACK_COVERS[continent] || CONTINENT_ONLINE_FALLBACK_COVERS.europe;
  const hash = stableTextHash(`${record.id || record.name || ""}:${codes.join("|")}`);
  for (let index = 0; index < images.length; index += 1) {
    const image = images[(hash + offset + index) % images.length];
    if (routeImageAllowed(record, image) || isSafeWikimediaFallbackCover(image)) return image;
  }
  return codes.length ? dynamicCountryCoverUrl(record, offset) : GLOBAL_ONLINE_FALLBACK_COVERS[(hash + offset) % GLOBAL_ONLINE_FALLBACK_COVERS.length];
}

function clientFallbackCoverUrl(record = {}, offset = 0) {
  const codeFallback = countryCodeFallbackCoverUrl(record, offset);
  if (codeFallback) return codeFallback;
  const text = routeSearchText(record);
  const match = ONLINE_FALLBACK_COVERS.find(([pattern]) => pattern.test(text));
  if (match && offset === 0 && isDisplayableRouteImage(record, match[1])) return match[1];
  return "";
}

function isCurrentBoundedFallbackImage(record = {}, imageUrl = "") {
  const key = coverIdentity(imageUrl);
  if (!key || !routeImageAllowed(record, imageUrl)) return false;
  if (/^https:\/\/loremflickr\.com\//i.test(imageUrl)) return true;
  for (let offset = 0; offset <= FEED_DEDUPE_WINDOW; offset += 1) {
    const candidate = countryCodeFallbackCoverUrl(record, offset);
    if (candidate && coverIdentity(candidate) === key) return true;
  }
  return false;
}

function seededOnlineFallbackCover(record = {}, offset = 0) {
  if (isCentralEuropeMaterializedRoute(record)) {
    const hash = [...String(record.id || record.name || "")].reduce((total, char) => total + char.charCodeAt(0), 0);
    return CENTRAL_EUROPE_FALLBACK_COVERS[(hash + offset) % CENTRAL_EUROPE_FALLBACK_COVERS.length];
  }
  const codes = new Set(routeCountryCodes(record));
  const region = REGION_FALLBACK_COVERS.find((item) => item.codes.every((code) => codes.has(code)));
  if (region) {
    const hash = [...String(record.id || record.name || "")].reduce((total, char) => total + char.charCodeAt(0), 0);
    return region.images[(hash + offset) % region.images.length];
  }
  if (offset === 0) {
    const clientFallback = clientFallbackCoverUrl(record, offset);
    if (clientFallback) return clientFallback;
  }
  return continentFallbackCoverUrl(record, offset);
}

function normalizedRemoteImageUrl(imageUrl) {
  const text = String(imageUrl || "").trim();
  if (!/^https?:\/\//i.test(text)) return text;
  try {
    const url = new URL(text);
    if (url.hostname === "commons.wikimedia.org" && url.pathname.includes("/wiki/Special:FilePath/")) {
      url.searchParams.set("width", "960");
      return url.href;
    }
    if (url.hostname !== "upload.wikimedia.org") return text;
    const parts = url.pathname.split("/").filter(Boolean);
    const thumbIndex = parts.indexOf("thumb");
    if (thumbIndex >= 0 && parts.length > thumbIndex + 4) {
      const fileName = parts[parts.length - 2];
      parts[parts.length - 1] = `960px-${fileName}`;
      url.pathname = `/${parts.join("/")}`;
      return url.href;
    }
    const commonsIndex = parts.indexOf("commons");
    if (commonsIndex >= 0 && parts.length >= commonsIndex + 4) {
      const fileName = parts[parts.length - 1];
      if (/\.(jpe?g|webp)$/i.test(fileName)) {
        const thumbParts = [
          ...parts.slice(0, commonsIndex + 1),
          "thumb",
          ...parts.slice(commonsIndex + 1),
          `960px-${fileName}`,
        ];
        url.pathname = `/${thumbParts.join("/")}`;
        return url.href;
      }
    }
  } catch {
    return text;
  }
  return text;
}

function proxiedRouteImageUrl(imageUrl) {
  const text = normalizedRemoteImageUrl(imageUrl);
  if (routeImageAssets?.isConfiguredAssetUrl(text)) return text;
  if (!runtimeImageSearchEnabled && /^https?:\/\//i.test(text)) return FALLBACK_ROUTE_COVER;
  return /^https?:\/\//i.test(text) ? `/api/routes/image-proxy?url=${encodeURIComponent(text)}` : text;
}

function shouldPermanentlyRejectRouteImage(outcome = {}) {
  return (typeof outcome === "string" ? outcome : outcome.status) === "error";
}

async function warmProxiedImage(imageUrl, signal, timeoutMs = FEED_CARD_IMAGE_TIMEOUT_MS, onLateResult) {
  const proxiedUrl = proxiedRouteImageUrl(imageUrl);
  if (!proxiedUrl) return { status: "missing", imageUrl: "", proxiedUrl: "" };
  return new Promise((resolve) => {
    if (signal?.aborted) return resolve({ status: "aborted", imageUrl, proxiedUrl });
    const image = new Image();
    let initialSettled = false;
    let terminalSettled = false;
    const cleanup = () => {
      clearTimeout(timer);
      signal?.removeEventListener?.("abort", onAbort);
      image.onload = null;
      image.onerror = null;
    };
    const settleInitial = (outcome) => {
      if (initialSettled) return false;
      initialSettled = true;
      clearTimeout(timer);
      resolve(outcome);
      return true;
    };
    const finish = (status) => {
      if (terminalSettled) return;
      terminalSettled = true;
      const outcome = { status, imageUrl, proxiedUrl };
      const wasInitial = settleInitial(outcome);
      cleanup();
      if (!wasInitial) onLateResult?.(outcome);
    };
    const onAbort = () => finish("aborted");
    const timer = setTimeout(() => {
      settleInitial({ status: "timeout", imageUrl, proxiedUrl });
    }, Math.max(0, timeoutMs));
    signal?.addEventListener?.("abort", onAbort, { once: true });
    image.onload = () => finish(image.naturalWidth >= 20 ? "ready" : "error");
    image.onerror = () => finish("error");
    image.decoding = "async";
    image.src = proxiedUrl;
  });
}

function applyRouteImageOutcome(record, imageUrl, outcome = {}, { late = false } = {}) {
  if (!record) return outcome.status || "missing";
  const status = outcome.status || "missing";
  const imageKey = coverIdentity(imageUrl);
  record._coverLoadStatus = status;
  record._coverLoadUrl = imageUrl || "";
  if (status === "ready") {
    markRouteCoverReady(record, imageUrl);
  } else if (shouldPermanentlyRejectRouteImage(outcome)) {
    if (imageKey) badRuntimeImageUrls.add(imageKey);
    record.coverSearchFailed = true;
    clearRouteCover(record);
  }
  if (late) updateRenderedRouteImage(record);
  return status;
}

async function ensureRecordCoverReady(record, signal, usedImageUrls = new Set()) {
  const current = displayCoverUrl(record);
  const currentKey = coverIdentity(current);
  if (currentKey && !usedImageUrls.has(currentKey) && !badRuntimeImageUrls.has(currentKey)) {
    const outcome = await warmProxiedImage(current, signal, FEED_CARD_IMAGE_TIMEOUT_MS, (lateOutcome) => {
      applyRouteImageOutcome(record, current, lateOutcome, { late: true });
    }).catch(() => ({ status: "aborted" }));
    applyRouteImageOutcome(record, current, outcome);
    if (outcome.status === "ready") {
      markRouteCoverReady(record, current);
      usedImageUrls.add(currentKey);
      return true;
    }
    if (outcome.status === "timeout" || outcome.status === "aborted") return false;
  }

  if (!runtimeImageSearchEnabled) {
    clearRouteCover(record);
    record.coverSearchFailed = true;
    return false;
  }

  const image = await requestOnlineCover(record, signal, {
    excludeImageUrls: [...usedImageUrls],
    excludeImageTitles: [],
  }).catch(() => null);
  if (!routeImageAllowedForAsset(record, image)) {
    clearRouteCover(record);
    record.coverSearchFailed = true;
    return false;
  }
  const key = coverIdentity(image.imageUrl);
  const dedupeKey = image.imageDedupeKey || image.dedupeKey || key;
  if (!key || usedImageUrls.has(key) || badRuntimeImageUrls.has(key)) {
    clearRouteCover(record);
    return false;
  }
  if (dedupeKey && usedImageUrls.has(dedupeKey)) {
    clearRouteCover(record);
    return false;
  }
  applyOnlineCover(record, image);
  const outcome = await warmProxiedImage(image.imageUrl, signal, FEED_CARD_IMAGE_TIMEOUT_MS, (lateOutcome) => {
    applyRouteImageOutcome(record, image.imageUrl, lateOutcome, { late: true });
  }).catch(() => ({ status: "aborted" }));
  applyRouteImageOutcome(record, image.imageUrl, outcome);
  if (outcome.status !== "ready") {
    return false;
  }
  markRouteCoverReady(record, image.imageUrl);
  usedImageUrls.add(key);
  if (dedupeKey) usedImageUrls.add(dedupeKey);
  return true;
}

function localCoverForRoute(record = {}) {
  const resolved = routeImageAssets?.resolveLocalRouteCover?.(record);
  if (resolved?.url) return resolved.url;
  const routeCover = LOCAL_COVER_BY_ROUTE_ID[record.id];
  if (routeCover) return routeCover;
  const text = routeSearchText(record);
  const rule = LOCAL_COVER_RULES.find(([pattern]) => pattern.test(text));
  if (rule) return rule[1];
  const countryCodes = [
    ...(record.countries || []),
    ...(record.countryEntities || []).map((item) => item.countryCode),
  ].filter(Boolean);
  const codeCover = countryCodes.map((code) => LOCAL_COVER_BY_COUNTRY[String(code).toUpperCase()]).find(Boolean);
  if (codeCover) return codeCover;
  const countryNames = [
    ...(record.countries || []),
    ...(record.countryEntities || []).map((item) => item.name),
  ].filter(Boolean);
  const nameCover = countryNames.map((name) => LOCAL_COVER_BY_COUNTRY_NAME[name]).find(Boolean);
  return nameCover || FALLBACK_ROUTE_COVER;
}

function geographySummary(record) {
  const countries = (record.countries || []).join(" · ");
  const destinations = record.destinations || record.cities || [];
  const places = destinations.length > 5 ? `${destinations.slice(0, 5).join(" · ")} 等` : destinations.join(" · ");
  return [countries, places].filter(Boolean).join("｜");
}

function uniqueList(values = []) {
  return [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))];
}

function compactPlaceList(values = [], limit = 4) {
  const places = uniqueList(values);
  if (!places.length) return "";
  return places.length > limit ? `${places.slice(0, limit).join("、")}等地` : places.join("、");
}

function routeCountryNames(record = {}) {
  const entityNames = (record.countryEntities || []).map((item) => item.name).filter(Boolean);
  return uniqueList(entityNames.length ? entityNames : (record.countries || []));
}

function routeDestinations(record = {}) {
  return uniqueList([
    ...(record.destinations || []),
    ...(record.cities || []),
    ...(record.destinationEntities || []).map((item) => item.name),
  ]);
}

function routeThemePhrase(record = {}) {
  const text = routeSearchText(record);
  if (/自驾|road|coast|rockies|patagonia|garden route|南岛|加州|落基|花园大道/i.test(text)) return "适合看沿途风景，路上停留比赶景点更重要";
  if (/铁路|火车|rail|train|景观铁路/i.test(text)) return "适合用列车串起城市和风景，换城节奏相对清晰";
  if (/跳岛|海岛|island|hawaii|palawan|azores|croatia/i.test(text)) return "适合把海湾、老城和离岛慢慢串起来";
  if (/圣诞|christmas/i.test(text)) return "适合冬季看老城灯饰、市集和广场氛围";
  if (/美食|food|wine|葡萄酒/i.test(text)) return "适合把餐桌、街区和产区体验放进行程里";
  if (/朝圣|pilgrimage|camino|francigena|熊野|四国/i.test(text)) return "适合留出步行段，用更慢的节奏感受沿途城镇";
  if (/野生|safari|wildlife|动物|自然|namibia/i.test(text)) return "适合看自然景观和野生动物，早晚时段体验会更好";
  if (/文明|unesco|maya|遗产|古城|temple|cathedral/i.test(text)) return "适合围绕古迹、老城和世界遗产安排行程";
  if (/多国|跨国|hopper|balkan|baltic|benelux|中欧/i.test(text)) return "适合一次看几种城市气质，但每天不要排得太满";
  return "适合第一次了解这片区域，也适合按兴趣删减成更轻松的版本";
}

function routeIntro(record = {}) {
  const places = routeDestinations(record);
  const placeText = compactPlaceList(places, 4);
  const countries = routeCountryNames(record);
  const countryText = compactPlaceList(countries, 3);
  const dayText = record.recommendedDays || (record.durationDays ? `${record.durationDays}天` : "");
  const opening = placeText
    ? `从${places[0]}出发，串联${compactPlaceList(places.slice(1), 3) || countryText || "周边目的地"}。`
    : countryText
      ? `围绕${countryText}展开，适合做成${dayText || "一段"}主题旅行。`
      : "这条路线适合把几个重点目的地放在同一次旅行里。";
  const timing = dayText ? `${dayText}里` : "行程中";
  return `${opening}${timing}${routeThemePhrase(record)}。`;
}

function routeFeaturePhrase(record = {}) {
  return routeThemePhrase(record).replace(/^适合/, "适合");
}

function routeFeatureIntro(record = {}) {
  const days = Number.parseInt(record.durationDays || record.recommendedDays, 10);
  const pace = Number.isFinite(days)
    ? days <= 5 ? "短假友好" : days >= 14 ? "长线慢走" : "节奏适中"
    : "节奏适中";
  return `${pace}，${routeFeaturePhrase(record)}。`;
}
function routeFeatureIntroV2(record = {}) {
  const text = routeSearchText(record);
  const style = String(record.travelStyleConceptKey || record.travelStyle || record.concept?.travelStyle || "").toLowerCase();
  const days = Number.parseInt(record.durationDays || record.recommendedDays, 10);
  const destinations = routeDestinations(record);
  const theme = uniqueList([...(record.themes || []), ...(record.tags || [])])[0] || "";
  const countryCount = uniqueList([
    ...(record.countries || []),
    ...(record.countryEntities || []).map((item) => item.countryCode || item.name),
  ]).length;
  const destinationCount = destinations.length;
  const has = (pattern) => pattern.test(text);

  let feature = theme
    ? "围绕自然、餐桌或文化主题"
    : "突出城市与自然体验层次";
  if (has(/知识图候选池|顺路关系|planner designed/i)) {
    feature = "按顺路关系组织经典首访";
  } else if (style === "road-trip" || has(/自驾|road|drive|coast|highway|rockies|patagonia|garden route|南岛|加州|落基|公路/i)) {
    feature = "以公路串起观景、短步道与小镇停留";
  } else if (style === "rail-journey" || has(/铁路|火车|rail|train|景观铁路|列车/i)) {
    feature = "以铁路换城并兼顾沿线景观";
  } else if (style === "transport-journey") {
    feature = "强调沿线停靠与换乘节奏";
  } else if (style === "theme" || has(/wine|葡萄酒|美食|food|market|自然主题|theme/i)) {
    feature = "围绕餐桌、市场或文化主题";
  } else if (style === "deep-dive") {
    feature = "减少打卡，留时间给街区日常";
  } else if (style === "seasonal") {
    feature = "季节适配仍以证据为准";
  } else if (style === "city-break") {
    feature = "集中安排街区、餐厅和展馆";
  } else if (style === "country-hopper" || countryCount >= 3 || has(/多国|跨国|hopper|balkan|baltic|benelux|中欧/i)) {
    feature = "对照各地文化与饮食节奏";
  } else if (has(/沙漠|desert|sahara|撒哈拉|wadi|dune/i)) {
    feature = "为沙漠补给和长距离路段留余量";
  } else if (has(/海岛|跳岛|island|beach|azores|hawaii|palawan|croatia/i)) {
    feature = "分开安排海岸、老城和休息日";
  } else if (has(/pilgrimage|camino|francigena|朝圣|巡礼|熊野|四国/i)) {
    feature = "以路径串起步行段落与沿途住宿";
  } else if (has(/safari|wildlife|自然|野生|动物|冰川|峡湾|极光|aurora/i)) {
    feature = "侧重自然景观并为天气留余量";
  } else if (has(/unesco|heritage|temple|cathedral|古城|遗产|文明|城堡|教堂/i)) {
    feature = "围绕历史街区、遗产建筑和博物馆";
  }

  let rhythm = "日均一个主要体验";
  if (Number.isFinite(days)) {
    if (days <= 5) rhythm = destinationCount >= 4 ? `${days}天偏紧，只保留关键体验` : `${days}天适合短假`;
    else if (days >= 14) rhythm = `${days}天预留休息与改线时间`;
    else if (destinationCount >= 6) rhythm = `${days}天停留点多，先锁定重点`;
    else rhythm = `${days}天日均一个主要体验`;
  }
  const first = destinations[0] || "";
  const last = destinations.at(-1) || "";
  const middle = destinations.length > 2 ? destinations[Math.floor((destinations.length - 1) / 2)] : "";
  const compactPlace = (value) => String(value || "")
    .replace(/(?:区域风景带|自然腹地|门户城市|地方生活区|历史城区|文化停留区)$/u, "")
    .trim() || String(value || "");
  const compactFirst = compactPlace(first);
  const compactLastCandidate = compactPlace(last);
  const compactLast = compactLastCandidate === compactFirst ? last : compactLastCandidate;
  const compactMiddle = compactPlace(middle);
  const middleAnchor = compactMiddle
    && compactMiddle !== compactFirst
    && compactMiddle !== compactLast
    ? `经${compactMiddle}`
    : "";
  const anchor = first && last && first !== last
    ? `从${first}${middleAnchor}到${compactLast}`
    : first ? `以${first}为核心` : "围绕沿途停留点";
  return `${anchor}，${feature}；${rhythm}。`;
}

function routeDisplayTitleV2(record = {}) {
  return String(record.canonicalTitle || record.name || "")
    .replace(/(经典|精简|延展|深度|铁路|公路)\1/gu, "$1")
    .trim();
}
function cacheRouteRecords(records) {
  if (!window.TravelState?.cacheRouteMedia) return records;
  const state = records.reduce((current, record) => (
    window.TravelState.cacheRouteMedia(current, record, { refresh: Boolean(record.onlineCoverAsset?.imageUrl) })
  ), readRouteState());
  window.TravelState.writeTravelState?.(state);
  return records.map((record) => window.TravelState.applyCachedRouteMedia?.(state, record) || record);
}

function routeRenderKey(record = {}) {
  return record.id;
}

function routeDedupeKey(record = {}) {
  const title = String(record.canonicalTitle || record.name || "")
    .replace(/\s+/g, "")
    .toLocaleLowerCase("zh-CN");
  const countries = (record.countryEntities || [])
    .map((item) => item.countryCode || item.name)
    .filter(Boolean)
    .sort()
    .join("|");
  const style = record.travelStyleConceptKey || record.travelStyle || (record.themes || [])[0] || "";
  const days = Number(record.durationDays) || Number.parseInt(record.recommendedDays, 10) || "";
  return [title, countries, style, days].filter(Boolean).join("::");
}

function routeVisualClusterKey(record = {}) {
  const countries = (record.countryEntities || [])
    .map((item) => item.countryCode || item.name)
    .filter(Boolean)
    .sort()
    .join("|");
  return countries || "";
}

function routeStyleBucket(record = {}) {
  const style = String(record.travelStyleConceptKey || record.travelStyle || record.concept?.travelStyle || "").toLowerCase();
  const text = routeSearchText(record);
  if (style === "rail-journey" || style === "road-trip" || style === "transport-journey") return "transport";
  if (/铁路|火车|rail|train|自驾|road|drive|highway|交通线|transport|banana/i.test(text)) return "transport";
  if (style === "classic-first-trip" || style === "city-break") return "classic";
  if (style === "theme" || style === "seasonal" || style === "pilgrimage") return "theme";
  if (style === "deep-dive") return "deep";
  if (style === "country-hopper") return "hopper";
  return "general";
}

function isTransportStyle(record = {}) {
  return routeStyleBucket(record) === "transport";
}

function routeContinentBucket(record = {}) {
  const continents = [...new Set(routeCountryCodes(record).map(continentForCountryCode))];
  if (!continents.length) return "europe";
  if (continents.length === 1) return continents[0];
  return continents[stableTextHash(`${record.id || record.name || ""}:continent`) % continents.length] || "europe";
}

function recentFeedVisualClusters(records = feedState.records) {
  return new Set(records
    .slice(-FEED_CLUSTER_COOLDOWN_WINDOW)
    .map(routeVisualClusterKey)
    .filter(Boolean));
}

function stableRouteBatch(records = [], comparisonRecords = [], limit = BATCH_SIZE) {
  const knownIds = new Set(comparisonRecords.map((record) => record?.id).filter(Boolean));
  const knownTitles = new Set(comparisonRecords
    .map((record) => record?.canonicalTitle || record?.name)
    .filter(Boolean));
  const selected = [];
  for (const record of records) {
    const id = record?.id;
    const title = record?.canonicalTitle || record?.name || "";
    if (!id || knownIds.has(id) || (title && knownTitles.has(title))) continue;
    selected.push(record);
    knownIds.add(id);
    if (title) knownTitles.add(title);
    if (selected.length >= limit) break;
  }
  return selected;
}

function selectAppendableRecords(records, limit = FEED_PAGE_SIZE, comparisonRecords = feedState.records) {
  const stableRecords = cacheRouteRecords(records || []);
  return stableRouteBatch(stableRecords, comparisonRecords, limit);
}

function appendRecords(records, limit = FEED_PAGE_SIZE, { revealImmediately = true } = {}) {
  const insertedRecords = selectAppendableRecords(records, limit, feedState.records);
  const batchId = `batch-${feedState.nextRenderBatchId++}`;
  const preparedRecords = feedState.query
    ? insertedRecords.map((record) => ({
      ...record,
      _feedBatchId: batchId,
      _renderedImageReady: true,
    }))
    : insertedRecords.map((record, index) => ({
      ...record,
      _feedInstanceId: `${record.id}::${feedState.records.length + index}`,
      _feedBatchId: batchId,
      _renderedImageReady: true,
    }));
  void revealImmediately;
  feedState.records.push(...preparedRecords);
  return preparedRecords;
}

function unseenRecords(records) {
  const knownIds = new Set(feedState.records.map((record) => record.id));
  const knownTitles = new Set(feedState.records.map((record) => record.canonicalTitle || record.name));
  return (records || []).filter((record) => !knownIds.has(record.id) && !knownTitles.has(record.canonicalTitle || record.name));
}

function feedExcludeIdsForRequest() {
  const recentRecords = feedState.query
    ? feedState.records
    : feedState.records.slice(-FEED_DEDUPE_WINDOW);
  return [...recentRecords.map((record) => record.id), ...feedState.skippedRouteIds].filter(Boolean);
}

function selectFeedPageRecords(records = []) {
  const knownIds = new Set(feedState.records.map((record) => record.id));
  const knownTitles = new Set(feedState.records.map((record) => record.canonicalTitle || record.name));
  const knownKeys = new Set(feedState.records.map(routeDedupeKey).filter(Boolean));
  const previousContinent = feedState.records.length
    ? routeContinentBucket(feedState.records[feedState.records.length - 1])
    : "";
  const recentCountryCodes = new Set(feedState.records.slice(-FEED_DEDUPE_WINDOW).flatMap(routeCountryCodes));
  const selected = [];
  const selectedCountryCodes = new Set();
  const selectedContinents = new Set();
  const selectedStyles = new Set();
  const selectedDurations = new Set();
  const priorityScore = (record) => {
    const codes = routeCountryCodes(record);
    const hasVerifiedCover = Boolean(displayCoverUrl(record));
    const freshReady = codes.filter((code) => IMAGE_READY_COUNTRY_CODES.has(code) && !recentCountryCodes.has(code)).length;
    const repeatedReady = codes.filter((code) => IMAGE_READY_COUNTRY_CODES.has(code) && recentCountryCodes.has(code)).length;
    const selectedCountryOverlap = codes.filter((code) => selectedCountryCodes.has(code)).length;
    const continent = routeContinentBucket(record);
    const style = routeStyleBucket(record);
    const duration = Number(record.durationDays) || Number.parseInt(record.recommendedDays, 10) || 0;
    return (hasVerifiedCover ? 80 : 0)
      + freshReady * 24
      + repeatedReady * 8
      + (selectedContinents.has(continent) ? -5 : 6)
      + (selectedStyles.has(style) ? -3 : 4)
      + (selectedDurations.has(duration) ? -2 : 3)
      - selectedCountryOverlap * 6
      + (previousContinent && continent === previousContinent ? -3 : 0);
  };
  const sourceRecords = [...(records || [])];
  for (let pass = 0; pass < 2; pass += 1) {
    const prioritizedRecords = sourceRecords.sort((left, right) => priorityScore(right) - priorityScore(left));
    for (const record of prioritizedRecords) {
    if (selected.length >= FEED_CANDIDATE_PAGE_SIZE) break;
    const title = record.canonicalTitle || record.name;
    const key = routeDedupeKey(record);
    const codes = routeCountryCodes(record);
    const hasReadyCountry = displayCoverUrl(record) || codes.some((code) => IMAGE_READY_COUNTRY_CODES.has(code));
    if (!hasReadyCountry && pass === 0) continue;
    if (
      !record?.id
        || knownIds.has(record.id)
        || knownTitles.has(title)
        || (key && knownKeys.has(key))
    ) continue;
    selected.push(record);
    knownIds.add(record.id);
    knownTitles.add(title);
    if (key) knownKeys.add(key);
      codes.forEach((code) => selectedCountryCodes.add(code));
      selectedContinents.add(routeContinentBucket(record));
      selectedStyles.add(routeStyleBucket(record));
      selectedDurations.add(Number(record.durationDays) || Number.parseInt(record.recommendedDays, 10) || 0);
    }
    if (selected.length >= FEED_CANDIDATE_PAGE_SIZE) break;
  }
  return selected;
}

async function requestDiscoveryPage({ query, cursor, sessionId, excludeIds, routeType, signal }) {
  const isSearch = Boolean(String(query || "").trim());
  const excludeClusters = isSearch ? [] : [...recentFeedVisualClusters(feedState.records)];
  const response = await fetch(API_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json" },
    signal,
    body: JSON.stringify({
      mode: isSearch ? "search" : "feed",
      query,
      limit: isSearch ? SEARCH_PAGE_SIZE : FEED_PAGE_SIZE,
      cursor,
      sessionId,
      excludeIds,
      excludeClusters,
      routeType: isSearch ? "" : routeType,
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.ok || !Array.isArray(payload.records)) {
    throw new Error(payload.error?.message || `Route Discovery failed (${response.status})`);
  }
  return payload;
}

function needsOnlineCover(record) {
  return !coverUrl(record);
}

function coverIdentity(value) {
  return String(value || "").trim().toLowerCase();
}

function clearRouteCover(record) {
  if (record.onlineCoverAsset) record.onlineCoverAsset = null;
  if (record.coverAsset?.imageUrl) record.coverAsset = { ...record.coverAsset, imageUrl: "" };
  if (record.coverImage) record.coverImage = "";
  delete record._coverReadyUrl;
}

function applyOnlineCover(record, image) {
  record.coverSearchFailed = false;
  record.onlineCoverAsset = {
    ...image,
    status: image.status || "verified",
    semanticStatus: image.semanticStatus || "verified",
    coverStatus: image.coverStatus || "verified",
    imageDedupeKey: image.imageDedupeKey || image.dedupeKey || coverIdentity(image.imageUrl),
  };
  record.coverAsset = {
    ...(record.coverAsset || {}),
    provider: image.provider,
    imageUrl: image.imageUrl,
    sourceUrl: image.sourceUrl,
    title: image.title,
    status: image.status || "verified",
    semanticStatus: image.semanticStatus || "verified",
    coverStatus: image.coverStatus || "verified",
    imageCountryCodes: image.imageCountryCodes || [],
    imageDedupeKey: image.imageDedupeKey || image.dedupeKey || coverIdentity(image.imageUrl),
    imageMatchReason: image.matchEvidence || image.imageMatchReason || "",
  };
}

function isUsedCoverImage(image, usedImageUrls, usedImageTitles) {
  return usedImageUrls.has(coverIdentity(image?.imageUrl))
    || usedImageTitles.has(String(image?.title || "").trim().toLowerCase());
}

async function requestOnlineCover(record, signal, exclusions = {}) {
  const response = await fetch(IMAGE_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json" },
    signal,
    body: JSON.stringify({
      id: record.id,
      name: record.name,
      canonicalTitle: record.canonicalTitle,
      sourceTitle: record.sourceTitle,
      countries: record.countries,
      cities: record.cities,
      destinations: record.destinations,
      themes: record.themes,
      tags: record.tags,
      countryEntities: record.countryEntities,
      destinationEntities: record.destinationEntities,
      contentEvidence: record.contentEvidence,
      provenance: record.provenance,
      coverAsset: record.coverAsset,
      excludeImageUrls: exclusions.excludeImageUrls || [],
      excludeImageTitles: exclusions.excludeImageTitles || [],
    }),
  });
  const payload = await response.json().catch(() => ({}));
  return response.ok
    && payload.ok
    && payload.status === "verified"
    && payload.image?.imageUrl
    && payload.image?.semanticStatus === "verified"
    ? payload.image
    : null;
}

async function hydrateOnlineCovers(records, signal, existingRecords = [], options = {}) {
  if (!runtimeImageSearchEnabled) return records;
  const pageRecords = records || [];
  const usedImageUrls = new Set();
  const usedImageTitles = new Set();
  for (const record of existingRecords || []) {
    const imageUrl = coverUrl(record);
    const imageKey = coverIdentity(imageUrl);
    const imageTitle = String(record.onlineCoverAsset?.title || record.coverAsset?.title || "").trim().toLowerCase();
    if (imageKey) usedImageUrls.add(imageKey);
    if (imageTitle) usedImageTitles.add(imageTitle);
  }
  for (const record of pageRecords) {
    const imageUrl = coverUrl(record);
    const imageKey = coverIdentity(imageUrl);
    const imageTitle = String(record.onlineCoverAsset?.title || record.coverAsset?.title || "").trim().toLowerCase();
    if (!imageKey) continue;
    if (usedImageUrls.has(imageKey) || (imageTitle && usedImageTitles.has(imageTitle))) {
      clearRouteCover(record);
      continue;
    }
    usedImageUrls.add(imageKey);
    if (imageTitle) usedImageTitles.add(imageTitle);
  }
  const pending = pageRecords.filter(needsOnlineCover);
  for (const record of pending) {
    const recordSignal = childDeadlineSignal(signal, 2_800);
    let image = null;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      image = await requestOnlineCover(record, recordSignal, {
        excludeImageUrls: [...usedImageUrls],
        excludeImageTitles: [...usedImageTitles],
      }).catch(() => null);
      if (!routeImageAllowedForAsset(record, image)) break;
      if (!isUsedCoverImage(image, usedImageUrls, usedImageTitles)) break;
      usedImageUrls.add(coverIdentity(image.imageUrl));
      if (image.title) usedImageTitles.add(String(image.title).trim().toLowerCase());
      image = null;
    }
    if (image?.imageUrl) {
      applyOnlineCover(record, image);
      usedImageUrls.add(coverIdentity(image.imageUrl));
      if (image.title) usedImageTitles.add(String(image.title).trim().toLowerCase());
    } else {
      clearRouteCover(record);
      record.coverSearchFailed = true;
    }
    options.onRecord?.(record);
  }
  return records;
}

async function hydrateFeedOnlineCovers(records, signal, existingRecords = []) {
  if (!runtimeImageSearchEnabled) return;
  const pageRecords = records || [];
  const recentRecords = (existingRecords || []).slice(-FEED_DEDUPE_WINDOW);
  const usedImageUrls = new Set(recentRecords.map(displayCoverUrl).filter(Boolean));
  const usedImageTitles = new Set(recentRecords
    .map((record) => String(record.onlineCoverAsset?.title || record.coverAsset?.title || "").trim().toLowerCase())
    .filter(Boolean));
  const usedImageKeys = new Set([...usedImageUrls].map(coverIdentity).filter(Boolean));
  const targets = pageRecords.filter((record) => {
    const imageUrl = displayCoverUrl(record);
    const imageKey = coverIdentity(imageUrl);
    return !imageKey
      || usedImageKeys.has(imageKey)
      || isPlannerMaterializedRecord(record)
      || isPlannerFallbackCover(record.onlineCoverAsset)
      || isPlannerFallbackCover(record.coverAsset);
  }).slice(0, FEED_CANDIDATE_PAGE_SIZE);
  if (!targets.length) return;
  await Promise.all(targets.map(async (record) => {
    const currentUrl = displayCoverUrl(record);
    const image = await requestOnlineCover(record, childDeadlineSignal(signal, 1_600), {
      excludeImageUrls: [...usedImageUrls, currentUrl].filter(Boolean),
      excludeImageTitles: [...usedImageTitles],
    }).catch(() => null);
    if (!routeImageAllowedForAsset(record, image) || isUsedCoverImage(image, usedImageKeys, usedImageTitles)) return;
    applyOnlineCover(record, image);
    usedImageUrls.add(image.imageUrl);
    usedImageKeys.add(coverIdentity(image.imageUrl));
    if (image.title) usedImageTitles.add(String(image.title).trim().toLowerCase());
  }));
}

async function prepareRouteImageBatch(pageRecords = [], previousRecords = [], signal, timeoutMs = FEED_COVER_PREPARE_DEADLINE_MS) {
  const batch = pageRecords.slice(0, BATCH_SIZE);
  const usedImages = new Set(previousRecords
    .slice(-FEED_DEDUPE_WINDOW)
    .map((record) => routeImageDedupeKey(record) || coverIdentity(displayCoverUrl(record)))
    .filter(Boolean));
  const outcomes = await Promise.all(batch.map(async (record) => {
    const imageUrl = displayCoverUrl(record);
    const hasFixedAssetKey = Boolean(String(record.coverImageKey || "").trim());
    const imageKey = routeImageDedupeKey(record) || coverIdentity(imageUrl);
    if (!imageUrl || !imageKey || (!hasFixedAssetKey && !routeImageAllowed(record, imageUrl))) {
      record._coverLoadStatus = "missing";
      record._coverLoadUrl = "";
      return { status: "missing", routeId: record.id, imageUrl: "" };
    }
    if (usedImages.has(imageKey)) {
      record._coverLoadStatus = "duplicate";
      record._coverLoadUrl = imageUrl;
      clearRouteCover(record);
      return { status: "duplicate", routeId: record.id, imageUrl };
    }
    if (badRuntimeImageUrls.has(coverIdentity(imageUrl))) {
      record._coverLoadStatus = "error";
      record._coverLoadUrl = imageUrl;
      clearRouteCover(record);
      return { status: "error", routeId: record.id, imageUrl };
    }
    usedImages.add(imageKey);
    if (hasReadyRouteCover(record)) {
      record._coverLoadStatus = "ready";
      record._coverLoadUrl = imageUrl;
      return { status: "ready", routeId: record.id, imageUrl };
    }
    const outcome = await warmProxiedImage(imageUrl, signal, timeoutMs, (lateOutcome) => {
      applyRouteImageOutcome(record, imageUrl, lateOutcome, { late: true });
    }).catch(() => ({ status: "aborted", imageUrl }));
    applyRouteImageOutcome(record, imageUrl, outcome);
    return { ...outcome, routeId: record.id };
  }));
  return {
    records: batch,
    outcomes,
    ready: outcomes.filter((outcome) => outcome.status === "ready").length,
    placeholders: outcomes.filter((outcome) => outcome.status !== "ready").length,
  };
}

async function prefetchNextFeedPage() {
  if (
    feedState.status === "loading"
      || feedState.prefetching
      || feedState.prefetchedFeedPage
      || feedState.pendingMore
      || !feedState.hasMore
      || !feedState.cursor
  ) return;
  const controller = new AbortController();
  feedState.prefetchAbortController = controller;
  feedState.prefetching = true;
  const snapshot = {
    query: feedState.query,
    cursor: feedState.cursor,
    sessionId: feedState.sessionId,
    routeType: feedState.feedRouteType,
    excludeIds: feedExcludeIdsForRequest(),
  };
  const task = (async () => {
    try {
    const payload = await requestDiscoveryPage({
      query: snapshot.query,
      cursor: snapshot.cursor,
      sessionId: snapshot.sessionId,
      excludeIds: snapshot.excludeIds,
      routeType: snapshot.routeType,
      signal: requestSignal(controller, 4_000),
    });
    const candidates = snapshot.query ? unseenRecords(payload.records) : (payload.records || []);
    const pageRecords = selectAppendableRecords(candidates, BATCH_SIZE, feedState.records);
    const imageBatch = await prepareRouteImageBatch(pageRecords, feedState.records, controller.signal, FEED_COVER_PREPARE_DEADLINE_MS);
    if (controller.signal.aborted) return;
    feedState.prefetchedFeedPage = {
      ...snapshot,
      payload,
      pageRecords,
      imageBatch,
    };
    } catch {
      // Prefetch is opportunistic; foreground loading still handles failures.
    } finally {
      if (feedState.prefetchAbortController === controller) feedState.prefetchAbortController = null;
      feedState.prefetching = false;
    }
  })();
  feedState.prefetchPromise = task;
  await task;
  if (feedState.prefetchPromise === task) feedState.prefetchPromise = null;
}

function routeCardImageMarkup(record, index = 3) {
  void index;
  const fixedCover = fixedPilotRouteCover(record);
  const imageUrl = displayCoverUrl(record);
  const imageReady = Boolean(imageUrl && (
    record._coverLoadStatus === "ready"
      || (!record._coverLoadStatus && hasReadyRouteCover(record))
  ));
  const source = imageReady ? proxiedRouteImageUrl(imageUrl) : FALLBACK_ROUTE_COVER;
  const state = imageReady && !fixedCover?.isFallback ? "ready" : "placeholder";
  return `<img src="${escapeHtml(source)}" alt="${escapeHtml(routeDisplayTitleV2(record))}封面图" loading="eager" decoding="async" data-route-cover-state="${state}"${fixedCover?.key ? ` data-cover-image-key="${escapeHtml(fixedCover.key)}"` : ""} />`;
}

function updateRenderedRouteImage(record, card = null) {
  if (!record || !routeFeed) return;
  const storedRecord = feedState.records.find((item) => routeRenderKey(item) === routeRenderKey(record))
    || feedState.records.find((item) => item.id === record.id);
  if (storedRecord && storedRecord !== record) {
    storedRecord._coverLoadStatus = record._coverLoadStatus;
    storedRecord._coverLoadUrl = record._coverLoadUrl;
    if (record._coverReadyUrl) storedRecord._coverReadyUrl = record._coverReadyUrl;
    if (record._coverLoadStatus === "error") clearRouteCover(storedRecord);
  }
  const targetRecord = storedRecord || record;
  const targetCard = card || [...routeFeed.querySelectorAll("[data-route-card]")]
    .find((candidate) => candidate.dataset.routeCard === routeRenderKey(targetRecord));
  const image = targetCard?.querySelector("img");
  if (!image) return;
  const fixedCover = fixedPilotRouteCover(targetRecord);
  const imageUrl = displayCoverUrl(targetRecord);
  const ready = targetRecord._coverLoadStatus === "ready" && Boolean(imageUrl);
  const nextSource = ready ? proxiedRouteImageUrl(imageUrl) : FALLBACK_ROUTE_COVER;
  image.dataset.routeCoverState = ready && !fixedCover?.isFallback ? "ready" : "placeholder";
  if (fixedCover?.key) image.dataset.coverImageKey = fixedCover.key;
  if (image.getAttribute("src") !== nextSource) image.src = nextSource;
}

function repairDuplicateRecordCovers(records = []) {
  void records;
}

function renderRouteCard(record, index) {
  const state = readRouteState();
  const favorite = window.TravelState?.isRouteFavorite?.(state, record.id) || false;
  const detailParams = new URLSearchParams({ id: record.id });
  if (feedState.query) {
    detailParams.set("source", "search");
    detailParams.set("status", record.searchStatus || "accepted");
    detailParams.set("searchSessionId", feedState.sessionId);
    if (record.searchQueryId) detailParams.set("queryId", record.searchQueryId);
  }
  const dayText = record.recommendedDays || (record.durationDays ? `${record.durationDays}天` : "");
  const monthText = record.searchStatus === "needs-review"
    ? "证据待验证"
    : (record.bestMonths || []).join(" / ");
  const displayTitle = routeDisplayTitleV2(record);
  return `
    <article class="route-card route-inspiration-card" data-route-card="${escapeHtml(routeRenderKey(record))}" data-route-id="${escapeHtml(record.id)}" data-feed-batch="${escapeHtml(record._feedBatchId || "")}">
      <a class="route-card-main" href="route-detail.html?${detailParams.toString()}" data-route-open="${escapeHtml(record.id)}" aria-label="查看${escapeHtml(displayTitle)}详情">
        ${routeCardImageMarkup(record, index)}
        <span class="route-copy">
          <strong>${escapeHtml(displayTitle)}</strong>
          <em>${escapeHtml(geographySummary(record))}</em>
          <small>${escapeHtml(routeFeatureIntroV2(record))}</small>
        </span>
      </a>
      <div class="route-card-meta">
        <span>${escapeHtml(dayText)}</span>
        <span>${escapeHtml(monthText)}</span>
      </div>
      <div class="route-card-actions">
        <button type="button" data-route-add-trip="${escapeHtml(record.id)}">加入行程</button>
        <button class="${favorite ? "favorited" : ""}" type="button" data-route-favorite="${escapeHtml(record.id)}" aria-label="${favorite ? "取消收藏" : "收藏"}${escapeHtml(displayTitle)}" aria-pressed="${favorite}">♥</button>
      </div>
    </article>`;
}

function bindRenderedImageReadiness() {
  if (!routeFeed) return;
  routeFeed.querySelectorAll("[data-route-card]").forEach((card) => {
    if (card.dataset.imageReadinessBound === "1") return;
    card.dataset.imageReadinessBound = "1";
    const image = card.querySelector("img");
    const record = feedState.records.find((item) => routeRenderKey(item) === card.dataset.routeCard)
      || feedState.records.find((item) => item.id === card.dataset.routeId);
    if (!image || !record || image.dataset.routeCoverState !== "ready") return;
    const markReady = () => {
      if (image.naturalWidth >= 20) record._renderedImageReady = true;
    };
    if (image.complete && image.naturalWidth >= 20) {
      record._renderedImageReady = true;
      return;
    }
    image.addEventListener("load", markReady, { once: true });
  });
}

function repairRenderedDuplicateImages() {
  if (!routeFeed) return;
  const used = new Set();
  routeFeed.querySelectorAll("[data-route-card]").forEach((card) => {
    const record = feedState.records.find((item) => routeRenderKey(item) === card.dataset.routeCard)
      || feedState.records.find((item) => item.id === card.dataset.routeId);
    const key = record ? routeImageDedupeKey(record) : "";
    if (!record || !key) return;
    if (used.has(key)) {
      record._coverLoadStatus = "duplicate";
      clearRouteCover(record);
      updateRenderedRouteImage(record, card);
      return;
    }
    used.add(key);
  });
}

function scheduleSlowImageRepair() {
  void slowImageRepairTimer;
  void slowImageRepairRunning;
}

function suggestionsMarkup() {
  if (!feedState.query || !feedState.suggestions.length) return "";
  return `<span>可以试试：${feedState.suggestions.slice(0, 6).map(escapeHtml).join("、")}</span>`;
}

function stateMarkup() {
  const visible = visibleRecords();
  if (feedState.status === "loading") {
    const title = visible.length || feedState.searchResolved ? "正在加载更多路线…" : "正在发现路线…";
    const detail = visible.length || feedState.searchResolved
      ? "正在并行准备下一批封面"
      : feedState.query ? "正在解析旅行需求" : "正在读取路线库";
    return `<div class="route-empty-state" data-route-feed-state="loading"><p>${title}</p><span>${detail}</span></div>`;
  }
  if (feedState.status === "error") {
    return `<div class="route-empty-state" data-route-feed-state="error"><p>${visible.length ? "稍后重试" : "路线加载失败"}</p><span>当前请求没有成功完成</span><button type="button" ${visible.length ? "data-route-feed-more" : "data-route-feed-refresh"}>${visible.length ? "继续加载" : "重新加载"}</button></div>`;
  }
  if (!visible.length) {
    if (feedState.query && feedState.searchFailureReason === "constraint-conflict") {
      return `<div class="route-empty-state" data-route-feed-state="constraint-conflict"><p>这些条件暂时无法同时满足</p><span>请增加行程天数或减少城市后再试</span></div>`;
    }
    return `<div class="route-empty-state" data-route-feed-state="empty"><p>${feedState.query ? "暂时没有搜到路线" : "暂时没有发现路线"}</p>${suggestionsMarkup() || "<span>可以换一个旅行需求再试</span>"}</div>`;
  }
  if (!feedState.hasMore) return `<div class="route-empty-state" data-route-feed-state="complete"><p>${feedState.query ? "搜索结果已到底" : "已经到底了"}</p></div>`;
  return "";
}

function captureScrollAnchor() {
  const documentElement = document.documentElement;
  return {
    windowGap: Math.max(0, documentElement.scrollHeight - window.innerHeight - window.scrollY),
    windowNearEnd: window.innerHeight + window.scrollY >= documentElement.scrollHeight - 360,
    rootGap: routeScrollRoot
      ? Math.max(0, routeScrollRoot.scrollHeight - routeScrollRoot.clientHeight - routeScrollRoot.scrollTop)
      : 0,
    rootNearEnd: routeScrollRoot
      ? routeScrollRoot.clientHeight + routeScrollRoot.scrollTop >= routeScrollRoot.scrollHeight - 360
      : false,
  };
}

function restoreScrollAnchor(anchor, { preserveBottom = false } = {}) {
  if (!anchor) return;
  requestAnimationFrame(() => {
    if (preserveBottom && anchor.windowNearEnd) {
      const nextY = Math.max(0, document.documentElement.scrollHeight - window.innerHeight - anchor.windowGap);
      if (nextY > window.scrollY) window.scrollTo(0, nextY);
    }
    if (preserveBottom && routeScrollRoot && anchor.rootNearEnd) {
      const nextTop = Math.max(0, routeScrollRoot.scrollHeight - routeScrollRoot.clientHeight - anchor.rootGap);
      if (nextTop > routeScrollRoot.scrollTop) routeScrollRoot.scrollTop = nextTop;
    }
  });
}

function alignInsertedBatchStart(record) {
  if (!record || !routeFeed) return;
  const renderKey = routeRenderKey(record);
  requestAnimationFrame(() => {
    const card = [...routeFeed.querySelectorAll("[data-route-card]")]
      .find((candidate) => candidate.dataset.routeCard === renderKey);
    if (!card) return;
    const targetTop = 88;
    const rect = card.getBoundingClientRect();
    const delta = rect.top - targetTop;
    if (Math.abs(delta) <= 18) return;
    if (isRootScrollable()) {
      routeScrollRoot.scrollTop = Math.max(0, routeScrollRoot.scrollTop + delta);
      return;
    }
    window.scrollTo({ top: Math.max(0, window.scrollY + delta), behavior: "auto" });
  });
}

function schedulePendingBatchAnchor(retry = 0) {
  const anchorId = feedState.pendingBatchAnchorId;
  if (!anchorId || !routeFeed) return;
  clearTimeout(pendingBatchAnchorTimer);
  pendingBatchAnchorTimer = setTimeout(() => {
    if (feedState.pendingBatchAnchorId !== anchorId) return;
    const card = [...routeFeed.querySelectorAll("[data-route-id]")]
      .find((candidate) => candidate.dataset.routeId === anchorId);
    if (!card) return;
    const record = visibleRecords().find((item) => item.id === anchorId);
    if (!record) return;
    feedState.pendingBatchAnchorId = "";
    alignInsertedBatchStart(record);
  }, retry ? 100 : 50);
}

function renderSearchSummary() {
  if (!routeSearchSummary) return;
  routeSearchSummary.hidden = !feedState.query;
  if (!feedState.query) return;
  const count = visibleRecords().length;
  if (count) {
    routeSearchSummary.textContent = `已为“${feedState.query}”找到 ${count} 条路线`;
  } else if (!feedState.searchResolved) {
    routeSearchSummary.textContent = `正在搜索“${feedState.query}”`;
  } else if (feedState.searchResultCount) {
    routeSearchSummary.textContent = `已找到 ${feedState.searchResultCount} 条路线，正在准备首批卡片`;
  } else if (feedState.searchFailureReason === "constraint-conflict") {
    routeSearchSummary.textContent = `“${feedState.query}”的条件无法同时满足，请增加天数或减少城市`;
  } else {
    routeSearchSummary.textContent = `没有找到“${feedState.query}”的路线`;
  }
}
function renderFeed({ incremental = false } = {}) {
  if (!routeFeed) return;
  const scrollAnchor = incremental ? captureScrollAnchor() : null;
  const visible = visibleRecords();
  routeFeed.setAttribute("aria-busy", String(feedState.status === "loading"));
  routeFeed.dataset.feedStatus = feedState.status;
  routeFeed.dataset.feedHasMore = String(feedState.hasMore);
  routeFeed.dataset.feedCursor = feedState.cursor ? "1" : "0";
  routeFeed.dataset.feedRecords = String(feedState.records.length);
  routeFeed.dataset.feedVisible = String(visible.length);
  routeFeed.dataset.feedLoadingFor = feedState.loadingStartedAt ? String(Date.now() - feedState.loadingStartedAt) : "0";
  if (feedState.lastLoadDebug) routeFeed.dataset.feedLastLoad = JSON.stringify(feedState.lastLoadDebug);
  if (incremental) {
    routeFeed.querySelectorAll("[data-route-feed-state]").forEach((node) => node.remove());
    const recordsById = new Map(visible.map((record) => [routeRenderKey(record), record]));
    routeFeed.querySelectorAll("[data-route-card]").forEach((card) => {
      const record = recordsById.get(card.dataset.routeCard);
      if (!record) {
        card.remove();
        return;
      }
      updateRenderedRouteImage(record, card);
    });
    const renderedIds = new Set([...routeFeed.querySelectorAll("[data-route-card]")].map((card) => card.dataset.routeCard));
    const nextCards = visible.filter((record) => !renderedIds.has(routeRenderKey(record)));
    routeFeed.insertAdjacentHTML("beforeend", nextCards.map((record, index) => renderRouteCard(record, renderedIds.size + index)).join("") + stateMarkup());
  } else {
    routeFeed.innerHTML = visible.map(renderRouteCard).join("") + stateMarkup();
  }
  bindRenderedImageReadiness();
  repairRenderedDuplicateImages();
  renderSearchSummary();
  schedulePendingCoverHydration();
  restoreScrollAnchor(scrollAnchor);
  schedulePendingBatchAnchor();
  scheduleContinuationCheck();
  updateRouteFeedObserver();
}

function schedulePendingCoverHydration() {
  if (!runtimeImageSearchEnabled) return;
  if (pendingCoverHydrationTimer || pendingCoverHydrating) return;
  pendingCoverHydrationTimer = window.setTimeout(async () => {
    pendingCoverHydrationTimer = 0;
    if (pendingCoverHydrating || feedState.status === "loading") return;
    const visible = visibleRecords();
    const pending = visible
      .filter((record) => !displayCoverUrl(record) && Number(record._coverHydrationAttempts || 0) < 2)
      .slice(0, FEED_PAGE_SIZE * 4);
    if (!pending.length) return;
    pendingCoverHydrating = true;
    const usedImages = new Set(visible.map((record) => coverIdentity(displayCoverUrl(record))).filter(Boolean));
    try {
      await Promise.all(pending.map(async (record) => {
        record._coverHydrationAttempts = Number(record._coverHydrationAttempts || 0) + 1;
        await ensureRecordCoverReady(record, timeoutSignal(3_500), usedImages);
        updateRenderedRouteImage(record);
      }));
    } finally {
      pendingCoverHydrating = false;
    }
  }, 80);
}

function isStableFeedCursor(cursor) {
  try {
    const encoded = String(cursor || "").trim();
    if (!encoded || !/^[A-Za-z0-9_-]+$/u.test(encoded)) return false;
    const normalized = encoded.replaceAll("-", "+").replaceAll("_", "/");
    const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    const payload = JSON.parse(new TextDecoder().decode(bytes));
    const validHash = (value) => Number.isSafeInteger(value) && value >= 0;
    const validRandomRank = Number.isInteger(payload?.randomRank)
      && payload.randomRank >= 0
      && payload.randomRank <= 0xFFFFFFFF;
    return payload?.version === 1
      && payload.provider === "accepted-repository"
      && payload.orderVersion === 3
      && validHash(payload.sessionHash)
      && validHash(payload.filterHash)
      && validRandomRank
      && typeof payload.id === "string"
      && Boolean(payload.id.trim());
  } catch {
    return false;
  }
}

function readPreloadedRouteFeed() {
  try {
    const payload = JSON.parse(sessionStorage.getItem(ROUTE_FEED_PRELOAD_KEY) || "null");
    if (payload?.cacheVersion !== "route-preload-v2") return null;
    if (!payload.imagesReady) return null;
    if (!payload?.createdAt || Date.now() - payload.createdAt > ROUTE_FEED_PRELOAD_TTL_MS) return null;
    if (!Array.isArray(payload.records) || payload.records.length < FEED_PAGE_SIZE) return null;
    if (!payload.hasMore || !payload.nextCursor) return null;
    if (!isStableFeedCursor(payload.nextCursor)) return null;
    if (payload.records.some((record) => !displayCoverUrl(record))) return null;
    payload.records.forEach((record) => markRouteCoverReady(record));
    return payload;
  } catch {
    return null;
  }
}

function normalizeBootstrappedFeed(payload) {
  if (!payload || payload.cacheVersion !== "route-bootstrap-v1") return null;
  if (!Array.isArray(payload.records) || payload.records.length < FEED_PAGE_SIZE) return null;
  if (!payload.hasMore || !payload.nextCursor) return null;
  if (!isStableFeedCursor(payload.nextCursor)) return null;
  if (payload.records.some((record) => !displayCoverUrl(record))) return null;
  payload.records.forEach((record) => markRouteCoverReady(record));
  return payload;
}

function readBootstrappedRouteFeed(routeType = "cross") {
  const payload = window.__ROUTE_FEED_BOOTSTRAP;
  if (!payload || payload.cacheVersion !== "route-bootstrap-v1") return null;
  if (payload.feeds) return normalizeBootstrappedFeed(payload.feeds[routeType]);
  return normalizeBootstrappedFeed(payload);
}

function activateFeedScroll() {
  requestAnimationFrame(() => {
    hasUserScrolled = false;
    routeFeedBatchTriggerConsumed = false;
    feedReadyForScroll = true;
    if (!continuationPoller) {
      continuationPoller = setInterval(forceContinuationIfNeeded, 700);
    }
  });
}

function usePreloadedRouteFeed(payload) {
  abortActiveRequest();
  Object.assign(feedState, {
    records: [],
    cursor: payload.nextCursor || null,
    hasMore: Boolean(payload.hasMore && payload.nextCursor),
    status: "ready",
    query: "",
    activeTab: payload.routeType || "cross",
    feedRouteType: payload.routeType || "cross",
    sessionId: payload.sessionId || createSessionId(),
    suggestions: [],
    skippedRouteIds: new Set(),
    lastVisibleBatchAt: 0,
    searchResolved: false,
    searchResultCount: 0,
    searchFailureReason: "",
    searchFailureCodes: [],
    consecutiveEmptyPages: 0,
  });
  if (payload.sessionId) sessionStorage.setItem(ROUTE_FEED_SESSION_KEY, payload.sessionId);
  appendRecords(payload.records, FEED_PAGE_SIZE, { revealImmediately: Boolean(payload.revealImmediately) });
  renderFeed();
  window.scrollTo(0, 0);
  if (routeScrollRoot) routeScrollRoot.scrollTo?.(0, 0);
  activateFeedScroll();
  void prefetchNextFeedPage();
}

function resolveFeedContinuation({ insertedCount, serverHasMore, nextCursor, previousEmptyCount }) {
  if (insertedCount > 0) {
    const hasMore = Boolean(serverHasMore && nextCursor);
    return {
      hasMore,
      cursor: hasMore ? nextCursor : null,
      consecutiveEmptyPages: 0,
      retry: false,
      reason: hasMore ? "continue" : "exhausted",
    };
  }
  if (!serverHasMore || !nextCursor) {
    return {
      hasMore: false,
      cursor: null,
      consecutiveEmptyPages: 0,
      retry: false,
      reason: "exhausted",
    };
  }
  const consecutiveEmptyPages = Number(previousEmptyCount || 0) + 1;
  if (consecutiveEmptyPages >= 2) {
    return {
      hasMore: false,
      cursor: null,
      consecutiveEmptyPages,
      retry: false,
      reason: "empty-page-guard",
    };
  }
  return {
    hasMore: true,
    cursor: nextCursor,
    consecutiveEmptyPages,
    retry: true,
    reason: "empty-page-confirmation",
  };
}

async function loadFeed({ refresh = false } = {}) {
  if (!routeFeed || feedState.status === "loading" || (!refresh && !canRequestMoreFeed())) return;
  if (refresh) {
    abortActiveRequest();
    Object.assign(feedState, {
      records: [],
      cursor: null,
      hasMore: true,
      pendingMore: false,
      pendingRetryAt: 0,
      feedRouteType: feedState.query ? "" : feedState.activeTab,
      sessionId: createSessionId(),
      suggestions: [],
      skippedRouteIds: new Set(),
      lastVisibleBatchAt: 0,
      searchResolved: false,
      searchResultCount: 0,
      searchFailureReason: "",
      searchFailureCodes: [],
      consecutiveEmptyPages: 0,
    });
  }
  const token = ++feedState.requestToken;
  const controller = new AbortController();
  feedState.activeAbortController = controller;
  const requested = {
    query: feedState.query,
    cursor: feedState.cursor,
    sessionId: feedState.sessionId,
    excludeIds: feedExcludeIdsForRequest(),
    routeType: feedState.query ? "" : feedState.feedRouteType,
  };

  feedState.status = "loading";
  feedState.loadingStartedAt = Date.now();
  renderFeed({ incremental: feedState.records.length > 0 });
  const watchdogTimer = window.setTimeout(() => {
    if (token !== feedState.requestToken || feedState.status !== "loading") return;
    controller.abort();
    feedState.requestToken += 1;
    if (feedState.activeAbortController === controller) feedState.activeAbortController = null;
    feedState.status = feedState.records.length ? "ready" : "error";
    if (feedState.query) feedState.searchResolved = true;
    feedState.loadingStartedAt = 0;
    feedState.hasMore = true;
    renderFeed({ incremental: feedState.records.length > 0 });
    scheduleContinuationCheck();
  }, FEED_LOAD_WATCHDOG_MS);

  try {
    if (feedState.prefetchPromise) await feedState.prefetchPromise;
    if (token !== feedState.requestToken) return;
    const prefetched = feedState.prefetchedFeedPage
      && feedState.prefetchedFeedPage.query === requested.query
      && feedState.prefetchedFeedPage.cursor === requested.cursor
      && feedState.prefetchedFeedPage.sessionId === requested.sessionId
      && feedState.prefetchedFeedPage.routeType === requested.routeType
      && Array.isArray(feedState.prefetchedFeedPage.pageRecords)
      ? feedState.prefetchedFeedPage
      : null;
    if (prefetched) feedState.prefetchedFeedPage = null;
    const discoverySignal = requestSignal(controller, requested.query ? 3_200 : 4_800);
    let payload = prefetched?.payload || await requestDiscoveryPage({ ...requested, signal: discoverySignal });
    if (token !== feedState.requestToken) return;
    const previousCount = feedState.records.length;
    const previousRecords = feedState.records.slice();
    let pageRecords = prefetched?.pageRecords || (requested.query ? unseenRecords(payload.records) : (payload.records || []));
    const returnedCount = Number.isFinite(payload.returnedCount)
      ? payload.returnedCount
      : (Array.isArray(payload.records) ? payload.records.length : 0);
    let insertedRecords = [];
    let imageBatch = prefetched?.imageBatch || null;
    if (requested.query) {
      feedState.searchResolved = true;
      feedState.searchResultCount = returnedCount;
      feedState.searchFailureReason = String(payload.diagnostics?.reason || "");
      feedState.searchFailureCodes = Array.isArray(payload.diagnostics?.constraintConflict?.reasonCodes)
        ? payload.diagnostics.constraintConflict.reasonCodes.map(String)
        : [];
      renderSearchSummary();
      const batchRecords = selectAppendableRecords(pageRecords, BATCH_SIZE, previousRecords);
      if (!prefetched) {
        imageBatch = await prepareRouteImageBatch(batchRecords, previousRecords, controller.signal, FEED_COVER_PREPARE_DEADLINE_MS);
      }
      if (token !== feedState.requestToken) return;
      insertedRecords = appendRecords(batchRecords, SEARCH_PAGE_SIZE);
    } else {
      const appendableFeedRecords = selectAppendableRecords(pageRecords, FEED_PAGE_SIZE, previousRecords);
      if (!prefetched) {
        imageBatch = await prepareRouteImageBatch(appendableFeedRecords, previousRecords, controller.signal, FEED_COVER_PREPARE_DEADLINE_MS);
      }
      if (token !== feedState.requestToken) return;
      insertedRecords = appendRecords(appendableFeedRecords);
    }
    const continuation = resolveFeedContinuation({
      insertedCount: insertedRecords.length,
      serverHasMore: payload.hasMore === true,
      nextCursor: payload.nextCursor || null,
      previousEmptyCount: feedState.consecutiveEmptyPages,
    });
    feedState.lastLoadDebug = {
      returned: returnedCount,
      returnedCount,
      remainingCount: Number.isFinite(payload.remainingCount) ? payload.remainingCount : null,
      selected: pageRecords.length,
      ready: imageBatch?.ready || 0,
      placeholders: imageBatch?.placeholders || 0,
      appendable: selectAppendableRecords(pageRecords, FEED_PAGE_SIZE, previousRecords).length,
      inserted: insertedRecords.length,
      prev: previousCount,
      next: feedState.records.length,
      prefetched: Boolean(prefetched),
      routeType: requested.routeType || "",
      skipped: feedState.skippedRouteIds.size,
      selectedCodes: pageRecords.slice(0, 12).map((record) => routeCountryCodes(record).join(".")),
      readyCodes: (imageBatch?.outcomes || [])
        .filter((outcome) => outcome.status === "ready")
        .map((outcome) => outcome.routeId),
      insertedCodes: insertedRecords.map((record) => routeCountryCodes(record).join(".")),
      paginationReason: continuation.reason,
      consecutiveEmptyPages: continuation.consecutiveEmptyPages,
    };
    feedState.pendingMore = continuation.retry;
    feedState.pendingRetryAt = continuation.retry ? Date.now() + 1_500 : 0;
    feedState.suggestions = payload.suggestions || [];
    feedState.cursor = continuation.cursor;
    feedState.hasMore = continuation.hasMore;
    feedState.consecutiveEmptyPages = continuation.consecutiveEmptyPages;
    if (!continuation.hasMore) invalidateFeedPrefetch();
    feedState.status = "ready";
    feedState.loadingStartedAt = 0;
    if (feedState.activeAbortController === controller) feedState.activeAbortController = null;
    feedState.pendingBatchAnchorId = "";
    renderFeed({ incremental: previousCount > 0 });
    void prefetchNextFeedPage();
  } catch (error) {
    if (token !== feedState.requestToken) return;
    if (error?.name === "AbortError" || error?.name === "TimeoutError") {
      if (feedState.activeAbortController === controller) feedState.activeAbortController = null;
      feedState.status = feedState.records.length ? "ready" : "error";
      if (feedState.query) feedState.searchResolved = true;
      feedState.loadingStartedAt = 0;
      renderFeed({ incremental: feedState.records.length > 0 });
      return;
    }
    console.error("Route Discovery load failed", error);
    feedState.status = "error";
    if (feedState.query) feedState.searchResolved = true;
    feedState.loadingStartedAt = 0;
    if (feedState.activeAbortController === controller) feedState.activeAbortController = null;
    renderFeed({ incremental: feedState.records.length > 0 });
  } finally {
    window.clearTimeout(watchdogTimer);
  }
}

function resetDiscovery({ preferBootstrap = false } = {}) {
  abortActiveRequest();
  feedState.requestToken += 1;
  feedState.status = "idle";
  feedReadyForScroll = false;
  hasUserScrolled = false;
  window.scrollTo(0, 0);
  if (routeScrollRoot) routeScrollRoot.scrollTop = 0;
  if (preferBootstrap && !feedState.query) {
    const bootstrapped = readBootstrappedRouteFeed(feedState.activeTab);
    if (bootstrapped) {
      usePreloadedRouteFeed(bootstrapped);
      return Promise.resolve();
    }
  }
  return loadFeed({ refresh: true }).finally(() => {
    requestAnimationFrame(() => {
      hasUserScrolled = false;
      feedReadyForScroll = true;
      scheduleContinuationCheck();
    });
  });
}

routeTabs.forEach((button) => button.addEventListener("click", () => {
  feedState.activeTab = button.dataset.routeTab;
  routeTabs.forEach((item) => item.classList.toggle("active", item === button));
  if (!feedState.query) resetDiscovery({ preferBootstrap: true });
  else renderFeed();
}));

let searchTimer = 0;
routeSearch?.addEventListener("input", () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    feedState.query = routeSearch.value.trim();
    persistRouteQueryInUrl(feedState.query);
    resetDiscovery();
  }, 300);
});

routeFeed?.addEventListener("click", (event) => {
  if (event.target.closest("[data-route-feed-refresh]")) return resetDiscovery();
  if (event.target.closest("[data-route-feed-more]")) return loadFeed();
  const favoriteButton = event.target.closest("[data-route-favorite]");
  if (favoriteButton) {
    const record = feedState.records.find((item) => item.id === favoriteButton.dataset.routeFavorite);
    if (!record) return;
    const state = readRouteState();
    updateRouteState((current) => window.TravelState.setRouteFavorite(current, record, !window.TravelState.isRouteFavorite(state, record.id)));
    return renderFeed();
  }
  const tripButton = event.target.closest("[data-route-add-trip]");
  if (tripButton) {
    const record = feedState.records.find((item) => item.id === tripButton.dataset.routeAddTrip);
    if (record) updateRouteState((state) => window.TravelState.createTripFromRoute(state, record));
    if (record) window.location.href = "trips.html";
  }
});

routeFeed?.addEventListener("error", async (event) => {
  if (!(event.target instanceof HTMLImageElement)) return;
  if (event.target.dataset.routeCoverState !== "ready") return;
  const card = event.target.closest("[data-route-card]");
  const record = feedState.records.find((item) => routeRenderKey(item) === card?.dataset.routeCard)
    || feedState.records.find((item) => item.id === card?.dataset.routeId);
  const failedUrl = new URL(event.target.src, window.location.href).searchParams.get("url") || event.target.src;
  if (record) {
    applyRouteImageOutcome(record, failedUrl, { status: "error" }, { late: true });
    schedulePendingCoverHydration();
  }
  else {
    event.target.dataset.routeCoverState = "placeholder";
    event.target.src = FALLBACK_ROUTE_COVER;
  }
}, true);

let hasUserScrolled = false;
let feedReadyForScroll = false;
let routeFeedBatchTriggerConsumed = false;
let continuationTimer = 0;
let continuationPoller = 0;
let bottomBackfillTimer = 0;
let pendingBatchAnchorTimer = 0;
let pendingCoverHydrationTimer = 0;
let pendingCoverHydrating = false;
let slowImageRepairTimer = 0;
let slowImageRepairRunning = false;
const isWindowNearEnd = () => window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 240;
const isRootScrollable = () => routeScrollRoot
  ? routeScrollRoot.scrollHeight > routeScrollRoot.clientHeight + 24
  : false;
const isRootNearEnd = () => routeScrollRoot
  ? isRootScrollable() && routeScrollRoot.clientHeight + routeScrollRoot.scrollTop >= routeScrollRoot.scrollHeight - 240
  : false;
const isNearFeedEnd = () => isWindowNearEnd() || isRootNearEnd();
const shouldAutofillFeed = () => visibleRecords().length < FEED_PAGE_SIZE
  || document.documentElement.scrollHeight <= window.innerHeight + 24
  || (isRootScrollable() && routeScrollRoot.scrollHeight <= routeScrollRoot.clientHeight + 24);
const canContinueFeed = () => hasUserScrolled;
const canRequestMoreFeed = () => {
  if (!feedState.hasMore) return false;
  if (feedState.pendingMore && Date.now() < feedState.pendingRetryAt) return false;
  return true;
};
const canReactToFeedScroll = () => feedReadyForScroll || feedState.records.length >= FEED_PAGE_SIZE;
function triggerNextFeedBatch() {
  if (routeFeedBatchTriggerConsumed || feedState.status === "loading" || !canRequestMoreFeed()) return;
  routeFeedBatchTriggerConsumed = true;
  void loadFeed();
}
function scheduleContinuationCheck() {
  clearTimeout(continuationTimer);
  continuationTimer = setTimeout(() => {
    if (!canReactToFeedScroll() || !canContinueFeed() || feedState.status === "loading" || !canRequestMoreFeed()) return;
    if (isNearFeedEnd()) triggerNextFeedBatch();
  }, 120);
}
function scheduleBottomBackfill(delayMs = 120) {
  clearTimeout(bottomBackfillTimer);
  bottomBackfillTimer = setTimeout(() => {
    if (!hasUserScrolled || !canReactToFeedScroll() || feedState.status === "loading" || !canRequestMoreFeed()) return;
    if (isNearFeedEnd()) triggerNextFeedBatch();
  }, delayMs);
}
function forceContinuationIfNeeded() {
  if (feedState.status === "loading") {
    const loadingFor = feedState.loadingStartedAt ? Date.now() - feedState.loadingStartedAt : 0;
    if (loadingFor <= FEED_LOAD_WATCHDOG_MS + 1_500) return;
    feedState.activeAbortController?.abort?.();
    feedState.requestToken += 1;
    feedState.activeAbortController = null;
    feedState.status = feedState.records.length ? "ready" : "error";
    feedState.loadingStartedAt = 0;
    feedState.hasMore = true;
    renderFeed({ incremental: feedState.records.length > 0 });
  }
  if (!hasUserScrolled || !canReactToFeedScroll() || !canRequestMoreFeed()) return;
  if (isNearFeedEnd()) triggerNextFeedBatch();
}
const armPagination = () => {
  if (!canReactToFeedScroll()) return;
  hasUserScrolled = true;
  if (feedState.status !== "loading") routeFeedBatchTriggerConsumed = false;
  if (routeFeedSentinelNear || isNearFeedEnd()) triggerNextFeedBatch();
  else scheduleContinuationCheck();
};
window.addEventListener("wheel", armPagination, { passive: true });
window.addEventListener("touchmove", armPagination, { passive: true });
window.addEventListener("keydown", (event) => {
  if (["PageDown", "End", "ArrowDown", " "].includes(event.key)) armPagination();
});
window.addEventListener("scroll", () => {
  if (canReactToFeedScroll() && canContinueFeed() && isNearFeedEnd()) triggerNextFeedBatch();
  else scheduleContinuationCheck();
}, { passive: true });
routeScrollRoot?.addEventListener("scroll", () => {
  if (canReactToFeedScroll() && canContinueFeed() && isNearFeedEnd()) triggerNextFeedBatch();
  else scheduleContinuationCheck();
}, { passive: true });
function updateRouteFeedObserver() {
  if (!routeFeedObserver || !routeFeedSentinel) return;
  if (feedState.hasMore && !routeFeedObserverActive) {
    routeFeedObserver.observe(routeFeedSentinel);
    routeFeedObserverActive = true;
  } else if (!feedState.hasMore && routeFeedObserverActive) {
    routeFeedObserver.disconnect();
    routeFeedObserverActive = false;
    routeFeedSentinelNear = false;
  }
}

if (routeFeedSentinel && "IntersectionObserver" in window) {
  routeFeedObserver = new IntersectionObserver((entries) => {
    routeFeedSentinelNear = entries.some((entry) => entry.isIntersecting);
    if (canReactToFeedScroll() && canContinueFeed() && routeFeedSentinelNear) triggerNextFeedBatch();
  }, { rootMargin: "800px 0px" });
  updateRouteFeedObserver();
}
if (!continuationPoller) {
  continuationPoller = setInterval(forceContinuationIfNeeded, 700);
}

window.__routeFeedDebug = () => ({
  records: feedState.records.length,
  visible: visibleRecords().length,
  status: feedState.status,
  hasMore: feedState.hasMore,
  cursor: Boolean(feedState.cursor),
  query: feedState.query,
  activeTab: feedState.activeTab,
  feedRouteType: feedState.feedRouteType,
  hasUserScrolled,
  feedReadyForScroll,
  canContinue: canContinueFeed(),
  nearEnd: isNearFeedEnd(),
  shouldAutofill: shouldAutofillFeed(),
  prefetching: feedState.prefetching,
  prefetched: Boolean(feedState.prefetchedFeedPage),
  observerActive: routeFeedObserverActive,
  pendingMore: feedState.pendingMore,
  consecutiveEmptyPages: feedState.consecutiveEmptyPages,
  lastLoad: feedState.lastLoadDebug,
  scrollY: window.scrollY,
  viewportHeight: window.innerHeight,
  documentHeight: document.documentElement.scrollHeight,
});
window.__routeForceLoadFeed = () => loadFeed();

if (routeSearch && feedState.query) routeSearch.value = feedState.query;
const preloadedRouteFeed = feedState.query ? null : (readBootstrappedRouteFeed("cross") || readPreloadedRouteFeed());
if (preloadedRouteFeed) {
  usePreloadedRouteFeed(preloadedRouteFeed);
} else {
  loadFeed().finally(() => {
    window.scrollTo(0, 0);
    if (routeScrollRoot) routeScrollRoot.scrollTo?.(0, 0);
    activateFeedScroll();
  });
}
