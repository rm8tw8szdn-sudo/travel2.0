import crypto from "node:crypto";

import { cleanString, stableHash, uniqueStrings } from "./route-v2-utils.mjs";

export const LOCAL_EVIDENCE_SOURCE_TYPES = new Set([
  "official-transport-operator",
  "government-transport-agency",
  "official-tourism-board",
  "official-city-transport",
  "approved-high-trust-source",
]);

const TRUSTED_SOURCE_DOMAINS = Object.freeze([
  { domain: "global.jr-central.co.jp", sourceType: "official-transport-operator", publisher: "Central Japan Railway Company" },
  { domain: "jr-central.co.jp", sourceType: "official-transport-operator", publisher: "Central Japan Railway Company" },
  { domain: "jreast.co.jp", sourceType: "official-transport-operator", publisher: "East Japan Railway Company" },
  { domain: "jr-east.co.jp", sourceType: "official-transport-operator", publisher: "East Japan Railway Company" },
  { domain: "westjr.co.jp", sourceType: "official-transport-operator", publisher: "West Japan Railway Company" },
  { domain: "jr-west.co.jp", sourceType: "official-transport-operator", publisher: "West Japan Railway Company" },
  { domain: "jr-kyushu.co.jp", sourceType: "official-transport-operator", publisher: "Kyushu Railway Company" },
  { domain: "jrkyushu.co.jp", sourceType: "official-transport-operator", publisher: "Kyushu Railway Company" },
  { domain: "jr-hokkaido.co.jp", sourceType: "official-transport-operator", publisher: "Hokkaido Railway Company" },
  { domain: "jrhokkaido.co.jp", sourceType: "official-transport-operator", publisher: "Hokkaido Railway Company" },
  { domain: "jr-shikoku.co.jp", sourceType: "official-transport-operator", publisher: "Shikoku Railway Company" },
  { domain: "mlit.go.jp", sourceType: "government-transport-agency", publisher: "Ministry of Land, Infrastructure, Transport and Tourism" },
  { domain: "road-info-prvs.mlit.go.jp", sourceType: "government-transport-agency", publisher: "Ministry of Land, Infrastructure, Transport and Tourism" },
  { domain: "japan.travel", sourceType: "official-tourism-board", publisher: "Japan National Tourism Organization" },
  { domain: "visitjapan.jp", sourceType: "official-tourism-board", publisher: "Japan National Tourism Organization" },
  { domain: "visitkanazawa.jp", sourceType: "official-tourism-board", publisher: "Kanazawa City Tourism Association" },
  { domain: "kyoto.travel", sourceType: "official-tourism-board", publisher: "Kyoto City Official Travel Guide" },
  { domain: "osaka-info.jp", sourceType: "official-tourism-board", publisher: "Osaka Convention and Tourism Bureau" },
  { domain: "straeto.is", sourceType: "official-transport-operator", publisher: "Strætó bs." },
  { domain: "railway.co.th", sourceType: "official-transport-operator", publisher: "State Railway of Thailand" },
  { domain: "sbb.ch", sourceType: "official-transport-operator", publisher: "Swiss Federal Railways" },
  { domain: "airnewzealand.co.nz", sourceType: "official-transport-operator", publisher: "Air New Zealand" },
  { domain: "transportnsw.info", sourceType: "government-transport-agency", publisher: "Transport for NSW" },
  { domain: "info.korail.com", sourceType: "official-transport-operator", publisher: "Korea Railroad Corporation" },
  { domain: "trenitalia.com", sourceType: "official-transport-operator", publisher: "Trenitalia" },
  { domain: "trenord.it", sourceType: "official-transport-operator", publisher: "Trenord" },
  { domain: "sncf-connect.com", sourceType: "official-transport-operator", publisher: "SNCF Connect" },
  { domain: "renfe.com", sourceType: "official-transport-operator", publisher: "Renfe" },
  { domain: "euskotren.eus", sourceType: "official-transport-operator", publisher: "Euskotren" },
  { domain: "visitkorea.or.kr", sourceType: "official-tourism-board", publisher: "Korea Tourism Organization" },
  { domain: "airport.co.kr", sourceType: "government-transport-agency", publisher: "Korea Airports Corporation" },
  { domain: "vedur.is", sourceType: "approved-high-trust-source", publisher: "Icelandic Meteorological Office" },
  { domain: "tmd.go.th", sourceType: "approved-high-trust-source", publisher: "Thai Meteorological Department" },
  { domain: "meteoswiss.admin.ch", sourceType: "approved-high-trust-source", publisher: "Federal Office of Meteorology and Climatology MeteoSwiss" },
  { domain: "niwa.co.nz", sourceType: "approved-high-trust-source", publisher: "Earth Sciences New Zealand" },
  { domain: "bom.gov.au", sourceType: "approved-high-trust-source", publisher: "Australian Bureau of Meteorology" },
  { domain: "data.jma.go.jp", sourceType: "approved-high-trust-source", publisher: "Japan Meteorological Agency" },
  { domain: "protezionecivile.gov.it", sourceType: "approved-high-trust-source", publisher: "Italian Civil Protection Department" },
  { domain: "meteofrance.com", sourceType: "approved-high-trust-source", publisher: "Meteo-France" },
  { domain: "aemet.es", sourceType: "approved-high-trust-source", publisher: "AEMET" },
  { domain: "kma.go.kr", sourceType: "approved-high-trust-source", publisher: "Korea Meteorological Administration" },
  { domain: "bahn.de", sourceType: "official-transport-operator", publisher: "Deutsche Bahn AG" },
  { domain: "oebb.at", sourceType: "official-transport-operator", publisher: "Österreichische Bundesbahnen" },
  { domain: "cp.pt", sourceType: "official-transport-operator", publisher: "CP – Comboios de Portugal" },
  { domain: "hellenictrain.gr", sourceType: "official-transport-operator", publisher: "Hellenic Train" },
  { domain: "ktelargolida.gr", sourceType: "official-transport-operator", publisher: "KTEL Argolidas" },
  { domain: "ktel-fokidas.gr", sourceType: "official-transport-operator", publisher: "KTEL Fokidas" },
  { domain: "ktel-trikala.gr", sourceType: "official-transport-operator", publisher: "KTEL Trikala" },
  { domain: "aegeanair.com", sourceType: "official-transport-operator", publisher: "AEGEAN Airlines" },
  { domain: "e-ktel.com", sourceType: "official-transport-operator", publisher: "KTEL Chania-Rethymno" },
  { domain: "ns.nl", sourceType: "official-transport-operator", publisher: "Nederlandse Spoorwegen" },
  { domain: "dwd.de", sourceType: "approved-high-trust-source", publisher: "Deutscher Wetterdienst" },
  { domain: "geosphere.at", sourceType: "approved-high-trust-source", publisher: "GeoSphere Austria" },
  { domain: "ipma.pt", sourceType: "approved-high-trust-source", publisher: "Instituto Português do Mar e da Atmosfera" },
  { domain: "emy.gr", sourceType: "approved-high-trust-source", publisher: "Hellenic National Meteorological Service" },
  { domain: "knmi.nl", sourceType: "approved-high-trust-source", publisher: "Royal Netherlands Meteorological Institute" },
  { domain: "nationalrail.co.uk", sourceType: "official-transport-operator", publisher: "National Rail" },
  { domain: "irishrail.ie", sourceType: "official-transport-operator", publisher: "Iarnród Éireann" },
  { domain: "cd.cz", sourceType: "official-transport-operator", publisher: "České dráhy" },
  { domain: "mavcsoport.hu", sourceType: "official-transport-operator", publisher: "MÁV Group" },
  { domain: "croatiaairlines.com", sourceType: "official-transport-operator", publisher: "Croatia Airlines" },
  { domain: "vy.no", sourceType: "official-transport-operator", publisher: "Vygruppen AS" },
  { domain: "sj.se", sourceType: "official-transport-operator", publisher: "SJ AB" },
  { domain: "vr.fi", sourceType: "official-transport-operator", publisher: "VR Group" },
  { domain: "dsb.dk", sourceType: "official-transport-operator", publisher: "DSB" },
  { domain: "belgiantrain.be", sourceType: "official-transport-operator", publisher: "SNCB-NMBS" },
  { domain: "rozklad-pkp.pl", sourceType: "official-transport-operator", publisher: "PKP Group" },
  { domain: "potniski.sz.si", sourceType: "official-transport-operator", publisher: "Slovenske železnice" },
  { domain: "dsvn.vn", sourceType: "official-transport-operator", publisher: "Vietnam Railways" },
  { domain: "ktmb.com.my", sourceType: "official-transport-operator", publisher: "Keretapi Tanah Melayu Berhad" },
  { domain: "malaysiaairlines.com", sourceType: "official-transport-operator", publisher: "Malaysia Airlines" },
  { domain: "kai.id", sourceType: "official-transport-operator", publisher: "PT Kereta Api Indonesia" },
  { domain: "philippineairlines.com", sourceType: "official-transport-operator", publisher: "Philippine Airlines" },
  { domain: "viarail.ca", sourceType: "official-transport-operator", publisher: "VIA Rail Canada" },
  { domain: "amtrak.com", sourceType: "official-transport-operator", publisher: "Amtrak" },
  { domain: "aeromexico.com", sourceType: "official-transport-operator", publisher: "Aeroméxico" },
  { domain: "latamairlines.com", sourceType: "official-transport-operator", publisher: "LATAM Airlines" },
  { domain: "perurail.com", sourceType: "official-transport-operator", publisher: "PeruRail" },
  { domain: "metoffice.gov.uk", sourceType: "approved-high-trust-source", publisher: "UK Met Office" },
  { domain: "met.ie", sourceType: "approved-high-trust-source", publisher: "Met Éireann" },
  { domain: "chmi.cz", sourceType: "approved-high-trust-source", publisher: "Czech Hydrometeorological Institute" },
  { domain: "met.hu", sourceType: "approved-high-trust-source", publisher: "HungaroMet" },
  { domain: "meteo.hr", sourceType: "approved-high-trust-source", publisher: "Croatian Meteorological and Hydrological Service" },
  { domain: "met.no", sourceType: "approved-high-trust-source", publisher: "Norwegian Meteorological Institute" },
  { domain: "smhi.se", sourceType: "approved-high-trust-source", publisher: "Swedish Meteorological and Hydrological Institute" },
  { domain: "ilmatieteenlaitos.fi", sourceType: "approved-high-trust-source", publisher: "Finnish Meteorological Institute" },
  { domain: "dmi.dk", sourceType: "approved-high-trust-source", publisher: "Danish Meteorological Institute" },
  { domain: "meteo.be", sourceType: "approved-high-trust-source", publisher: "Royal Meteorological Institute of Belgium" },
  { domain: "imgw.pl", sourceType: "approved-high-trust-source", publisher: "Institute of Meteorology and Water Management" },
  { domain: "arso.gov.si", sourceType: "approved-high-trust-source", publisher: "Slovenian Environment Agency" },
  { domain: "nchmf.gov.vn", sourceType: "approved-high-trust-source", publisher: "Vietnam National Center for Hydro-Meteorological Forecasting" },
  { domain: "met.gov.my", sourceType: "approved-high-trust-source", publisher: "Malaysian Meteorological Department" },
  { domain: "bmkg.go.id", sourceType: "approved-high-trust-source", publisher: "BMKG" },
  { domain: "pagasa.dost.gov.ph", sourceType: "approved-high-trust-source", publisher: "PAGASA" },
  { domain: "weather.gc.ca", sourceType: "approved-high-trust-source", publisher: "Environment and Climate Change Canada" },
  { domain: "weather.gov", sourceType: "approved-high-trust-source", publisher: "US National Weather Service" },
  { domain: "conagua.gob.mx", sourceType: "approved-high-trust-source", publisher: "CONAGUA National Meteorological Service" },
  { domain: "senamhi.gob.pe", sourceType: "approved-high-trust-source", publisher: "SENAMHI Peru" },
  { domain: "transportpublic.ad", sourceType: "government-transport-agency", publisher: "Govern d'Andorra Public Transport" },
  { domain: "rta.ae", sourceType: "government-transport-agency", publisher: "Dubai Roads and Transport Authority" },
  { domain: "aerolineas.com", sourceType: "official-transport-operator", publisher: "Aerolíneas Argentinas" },
  { domain: "congoairways.com", sourceType: "official-transport-operator", publisher: "Congo Airways" },
  { domain: "trescruces.com.uy", sourceType: "official-transport-operator", publisher: "Tres Cruces" },
  { domain: "enr.gov.eg", sourceType: "official-transport-operator", publisher: "Egyptian National Railways" },
  { domain: "fijiairways.com", sourceType: "official-transport-operator", publisher: "Fiji Airways" },
  { domain: "rail.co.il", sourceType: "official-transport-operator", publisher: "Israel Railways" },
  { domain: "indianrailways.gov.in", sourceType: "government-transport-agency", publisher: "Indian Railways" },
  { domain: "krc.co.ke", sourceType: "official-transport-operator", publisher: "Kenya Railways Corporation" },
  { domain: "oncf-voyages.ma", sourceType: "official-transport-operator", publisher: "ONCF Voyages" },
  { domain: "flyairpeace.com", sourceType: "official-transport-operator", publisher: "Air Peace" },
  { domain: "rzd.ru", sourceType: "official-transport-operator", publisher: "Russian Railways" },
  { domain: "sar.com.sa", sourceType: "official-transport-operator", publisher: "Saudi Arabia Railways" },
  { domain: "flyairlink.com", sourceType: "official-transport-operator", publisher: "Airlink" },
  { domain: "royalrailway.com.kh", sourceType: "official-transport-operator", publisher: "Royal Railway Cambodia" },
  { domain: "cfrcalatori.ro", sourceType: "official-transport-operator", publisher: "CFR Călători" },
  { domain: "flysansa.com", sourceType: "official-transport-operator", publisher: "SANSA Airlines" },
  { domain: "meteo.ad", sourceType: "approved-high-trust-source", publisher: "Meteo Andorra" },
  { domain: "ncm.ae", sourceType: "approved-high-trust-source", publisher: "UAE National Center of Meteorology" },
  { domain: "smn.gob.ar", sourceType: "approved-high-trust-source", publisher: "Argentina National Meteorological Service" },
  { domain: "inmet.gov.br", sourceType: "approved-high-trust-source", publisher: "Brazil National Institute of Meteorology" },
  { domain: "meteordc.cd", sourceType: "approved-high-trust-source", publisher: "Mettelsat DRC" },
  { domain: "meteochile.gob.cl", sourceType: "approved-high-trust-source", publisher: "Dirección Meteorológica de Chile" },
  { domain: "inumet.gub.uy", sourceType: "approved-high-trust-source", publisher: "Instituto Uruguayo de Meteorología" },
  { domain: "ema.gov.eg", sourceType: "approved-high-trust-source", publisher: "Egyptian Meteorological Authority" },
  { domain: "met.gov.fj", sourceType: "approved-high-trust-source", publisher: "Fiji Meteorological Service" },
  { domain: "ims.gov.il", sourceType: "approved-high-trust-source", publisher: "Israel Meteorological Service" },
  { domain: "mausam.imd.gov.in", sourceType: "approved-high-trust-source", publisher: "India Meteorological Department" },
  { domain: "meteo.go.ke", sourceType: "approved-high-trust-source", publisher: "Kenya Meteorological Department" },
  { domain: "marocmeteo.ma", sourceType: "approved-high-trust-source", publisher: "Morocco Directorate General of Meteorology" },
  { domain: "nimet.gov.ng", sourceType: "approved-high-trust-source", publisher: "Nigerian Meteorological Agency" },
  { domain: "meteoinfo.ru", sourceType: "approved-high-trust-source", publisher: "Hydrometeorological Centre of Russia" },
  { domain: "ncm.gov.sa", sourceType: "approved-high-trust-source", publisher: "Saudi National Center for Meteorology" },
  { domain: "weathersa.co.za", sourceType: "approved-high-trust-source", publisher: "South African Weather Service" },
  { domain: "mowram.gov.kh", sourceType: "approved-high-trust-source", publisher: "Cambodia Ministry of Water Resources and Meteorology" },
  { domain: "meteoromania.ro", sourceType: "approved-high-trust-source", publisher: "Romania National Meteorological Administration" },
  { domain: "imn.ac.cr", sourceType: "approved-high-trust-source", publisher: "Costa Rica National Meteorological Institute" },
  { domain: "tirana.al", sourceType: "official-city-transport", publisher: "Municipality of Tirana" },
  { domain: "bdz.bg", sourceType: "official-transport-operator", publisher: "Bulgarian State Railways" },
  { domain: "publictransport.com.cy", sourceType: "official-transport-operator", publisher: "Cyprus Public Transport" },
  { domain: "elron.ee", sourceType: "official-transport-operator", publisher: "Elron" },
  { domain: "pv.lv", sourceType: "official-transport-operator", publisher: "Vivi Latvia" },
  { domain: "ltglink.lt", sourceType: "official-transport-operator", publisher: "LTG Link" },
  { domain: "publictransport.com.mt", sourceType: "official-transport-operator", publisher: "Malta Public Transport" },
  { domain: "zpcg.me", sourceType: "official-transport-operator", publisher: "Railway Transport of Montenegro" },
  { domain: "srbijavoz.rs", sourceType: "official-transport-operator", publisher: "Srbija Voz" },
  { domain: "zssk.sk", sourceType: "official-transport-operator", publisher: "ZSSK" },
  { domain: "tre.ge", sourceType: "official-transport-operator", publisher: "Georgian Railway" },
  { domain: "jett.com.jo", sourceType: "official-transport-operator", publisher: "JETT Jordan" },
  { domain: "railway.gov.lk", sourceType: "government-transport-agency", publisher: "Sri Lanka Railways" },
  { domain: "buddhaair.com", sourceType: "official-transport-operator", publisher: "Buddha Air" },
  { domain: "mtcc.mv", sourceType: "official-transport-operator", publisher: "Maldives Transport and Contracting Company" },
  { domain: "sncft.com.tn", sourceType: "official-transport-operator", publisher: "SNCFT" },
  { domain: "airtanzania.co.tz", sourceType: "official-transport-operator", publisher: "Air Tanzania" },
  { domain: "avianca.com", sourceType: "official-transport-operator", publisher: "Avianca" },
  { domain: "copaair.com", sourceType: "official-transport-operator", publisher: "Copa Airlines" },
  { domain: "tag.com.gt", sourceType: "official-transport-operator", publisher: "TAG Airlines" },
  { domain: "geo.edu.al", sourceType: "approved-high-trust-source", publisher: "Albanian Institute of Geosciences" },
  { domain: "meteo.bg", sourceType: "approved-high-trust-source", publisher: "Bulgaria National Institute of Meteorology" },
  { domain: "dom.org.cy", sourceType: "approved-high-trust-source", publisher: "Cyprus Department of Meteorology" },
  { domain: "ilmateenistus.ee", sourceType: "approved-high-trust-source", publisher: "Estonian Environment Agency" },
  { domain: "lvgmc.lv", sourceType: "approved-high-trust-source", publisher: "Latvian Environment Geology and Meteorology Centre" },
  { domain: "meteo.lt", sourceType: "approved-high-trust-source", publisher: "Lithuanian Hydrometeorological Service" },
  { domain: "maltairport.com", sourceType: "approved-high-trust-source", publisher: "Malta Airport Meteorological Office" },
  { domain: "meteo.co.me", sourceType: "approved-high-trust-source", publisher: "Montenegro Hydrometeorological Service" },
  { domain: "hidmet.gov.rs", sourceType: "approved-high-trust-source", publisher: "Serbia Hydrometeorological Service" },
  { domain: "shmu.sk", sourceType: "approved-high-trust-source", publisher: "Slovak Hydrometeorological Institute" },
  { domain: "meteo.gov.ge", sourceType: "approved-high-trust-source", publisher: "Georgia National Environmental Agency" },
  { domain: "jmd.gov.jo", sourceType: "approved-high-trust-source", publisher: "Jordan Meteorological Department" },
  { domain: "meteo.gov.lk", sourceType: "approved-high-trust-source", publisher: "Sri Lanka Department of Meteorology" },
  { domain: "dhm.gov.np", sourceType: "approved-high-trust-source", publisher: "Nepal Department of Hydrology and Meteorology" },
  { domain: "meteorology.gov.mv", sourceType: "approved-high-trust-source", publisher: "Maldives Meteorological Service" },
  { domain: "meteo.tn", sourceType: "approved-high-trust-source", publisher: "Tunisia National Institute of Meteorology" },
  { domain: "meteo.go.tz", sourceType: "approved-high-trust-source", publisher: "Tanzania Meteorological Authority" },
  { domain: "inamhi.gob.ec", sourceType: "approved-high-trust-source", publisher: "Ecuador INAMHI" },
  { domain: "imhpa.gob.pa", sourceType: "approved-high-trust-source", publisher: "Panama Institute of Meteorology and Hydrology" },
  { domain: "insivumeh.gob.gt", sourceType: "approved-high-trust-source", publisher: "Guatemala INSIVUMEH" },
  { domain: "eurostar.com", sourceType: "official-transport-operator", publisher: "Eurostar" },
  { domain: "oresundstag.se", sourceType: "official-transport-operator", publisher: "Öresundståg" },
]);

function clean(value) {
  return cleanString(value);
}

function hostOf(value) {
  try {
    const url = new URL(clean(value));
    if (url.protocol !== "https:") return "";
    return url.hostname.replace(/^www\./u, "").toLocaleLowerCase("en-US");
  } catch {
    return "";
  }
}

function validIsoDate(value) {
  return Boolean(clean(value) && Number.isFinite(Date.parse(value)));
}

export function sha256EvidenceContent(value) {
  return crypto.createHash("sha256").update(clean(value)).digest("hex");
}

export function classifyLocalEvidenceSource(url) {
  const host = hostOf(url);
  if (!host) return null;
  const match = TRUSTED_SOURCE_DOMAINS.find((entry) => host === entry.domain || host.endsWith(`.${entry.domain}`));
  return match ? { ...match, host } : null;
}

export function createLocalEvidenceSourceId(input = {}) {
  return `les-${stableHash({
    url: clean(input.url),
    contentHash: clean(input.contentHash),
    sourceType: clean(input.sourceType),
  }).slice(0, 20)}`;
}

export function normalizeLocalEvidenceSource(input = {}) {
  const classification = classifyLocalEvidenceSource(input.url);
  const normalized = {
    sourceId: clean(input.sourceId),
    sourceType: clean(input.sourceType || classification?.sourceType),
    url: clean(input.url),
    publisher: clean(input.publisher || classification?.publisher),
    retrievedAt: clean(input.retrievedAt),
    supports: uniqueStrings(Array.isArray(input.supports) ? input.supports : []),
    confidence: Number(input.confidence),
    contentHash: clean(input.contentHash),
    factLocator: clean(input.factLocator).slice(0, 240),
    factExcerpt: clean(input.factExcerpt).slice(0, 600),
  };
  normalized.sourceId = normalized.sourceId || createLocalEvidenceSourceId(normalized);
  return normalized;
}

export function validateLocalEvidenceSource(input = {}) {
  const reasons = [];
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { accepted: false, reasons: ["local-evidence-source-not-object"] };
  }
  const source = normalizeLocalEvidenceSource(input);
  const classification = classifyLocalEvidenceSource(source.url);
  if (!classification) reasons.push("local-evidence-source-untrusted-or-not-https");
  if (!LOCAL_EVIDENCE_SOURCE_TYPES.has(source.sourceType)) reasons.push("local-evidence-sourceType-invalid");
  if (classification && source.sourceType !== classification.sourceType) reasons.push("local-evidence-sourceType-mismatch");
  if (classification && source.publisher !== classification.publisher) reasons.push("local-evidence-publisher-mismatch");
  if (!source.publisher) reasons.push("local-evidence-publisher-required");
  if (!validIsoDate(source.retrievedAt)) reasons.push("local-evidence-retrievedAt-invalid");
  if (!source.supports.length) reasons.push("local-evidence-supports-required");
  if (!Number.isFinite(source.confidence) || source.confidence < 0 || source.confidence > 1) reasons.push("local-evidence-confidence-invalid");
  if (!/^[a-f0-9]{64}$/u.test(source.contentHash)) reasons.push("local-evidence-contentHash-invalid");
  if (source.factLocator && source.factLocator.length > 240) reasons.push("local-evidence-factLocator-too-long");
  if (source.factExcerpt && source.factExcerpt.length > 600) reasons.push("local-evidence-factExcerpt-too-long");
  if (source.sourceId !== createLocalEvidenceSourceId(source)) reasons.push("local-evidence-sourceId-mismatch");
  return { accepted: reasons.length === 0, reasons, source: structuredClone(source) };
}

export function normalizeLocalEvidenceSources(values = []) {
  const byId = new Map();
  for (const value of Array.isArray(values) ? values : []) {
    const validation = validateLocalEvidenceSource(value);
    if (!validation.accepted) continue;
    byId.set(validation.source.sourceId, validation.source);
  }
  return [...byId.values()].sort((left, right) => left.sourceId.localeCompare(right.sourceId, "en"));
}

export function validateLocalEvidenceSources(values = []) {
  const reasons = [];
  if (!Array.isArray(values)) return { accepted: false, reasons: ["local-evidence-sources-array-required"], sources: [] };
  const sources = [];
  const seenIds = new Set();
  values.forEach((value, index) => {
    const validation = validateLocalEvidenceSource(value);
    if (!validation.accepted) {
      reasons.push(...validation.reasons.map((reason) => `sources[${index}]:${reason}`));
      return;
    }
    if (seenIds.has(validation.source.sourceId)) {
      reasons.push(`sources[${index}]:local-evidence-source-duplicate`);
      return;
    }
    seenIds.add(validation.source.sourceId);
    sources.push(validation.source);
  });
  return { accepted: reasons.length === 0, reasons, sources: structuredClone(sources) };
}
