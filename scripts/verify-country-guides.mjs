import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL("../legacy/mobile-app.js", import.meta.url), "utf8");
const start = source.indexOf("const countryGuides = ");
const end = source.indexOf("\nconst groupGuideProfiles = ");

if (start === -1 || end === -1) {
  throw new Error("Could not find country guide block in legacy/mobile-app.js");
}

const context = {};
vm.createContext(context);
vm.runInContext(`${source.slice(start, end)}\nthis.countryGuides = countryGuides;`, context);

const requiredCodes = [
  "JP", "KR", "TH", "SG", "MY", "VN", "ID", "PH", "KH", "LA", "IN", "NP", "LK",
  "TR", "AE", "QA", "JO", "EG", "UZ", "KZ", "KG",
  "FR", "IT", "CH", "DE", "AT", "CZ", "HU", "ES", "PT", "NL", "BE", "GB", "IE", "NO", "SE", "FI", "IS", "DK", "GR",
  "US", "CA", "MX", "PE", "BR", "AR", "AU", "NZ", "MA", "KE", "ZA",
];

const errors = [];

for (const code of requiredCodes) {
  const guide = context.countryGuides[code];
  if (!guide) {
    errors.push(`${code}: missing guide`);
    continue;
  }
  if (guide.status !== "draft") errors.push(`${code}: status must be draft`);
  for (const key of ["days", "season", "budget"]) {
    if (!guide[key] || typeof guide[key] !== "string") errors.push(`${code}: missing ${key}`);
  }
  if (!Array.isArray(guide.style) || guide.style.length > 5 || guide.style.length === 0) errors.push(`${code}: style must have 1-5 tags`);
  if (!Array.isArray(guide.routes) || guide.routes.length > 3 || guide.routes.length === 0) errors.push(`${code}: routes must have 1-3 items`);
  if (!Array.isArray(guide.cities) || guide.cities.length > 3 || guide.cities.length === 0) errors.push(`${code}: cities must have 1-3 items`);
  for (const city of guide.cities || []) {
    if (!city.name || !city.note) errors.push(`${code}: city missing name or note`);
    if (!Array.isArray(city.spots) || city.spots.length > 3 || city.spots.length === 0) errors.push(`${code}/${city.name}: spots must have 1-3 items`);
    for (const spot of city.spots || []) {
      if (!spot.name || !spot.tip) errors.push(`${code}/${city.name}: spot missing name or one-line tip`);
    }
  }
}

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log(`Verified ${requiredCodes.length} draft country guides.`);
