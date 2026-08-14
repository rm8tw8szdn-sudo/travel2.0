import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const OUTPUT = "data/knowledge/raw/knowledge-expansion-batch05-countries.wikidata.json";
const RETRIEVED_AT = "2026-08-11T02:00:00.000Z";
const QIDS = ["Q28", "Q34", "Q215", "Q224"];
const url = new URL("https://www.wikidata.org/w/api.php");
url.search = new URLSearchParams({
  action: "wbgetentities", ids: QIDS.join("|"), props: "labels|aliases|descriptions|claims|sitelinks",
  languages: "en|zh-hans|zh", languagefallback: "1", format: "json", origin: "*",
});
const response = await fetch(url, { headers: { "User-Agent": "travel2-route-v2-knowledge-expansion-batch05/1.0" } });
if (!response.ok) throw new Error(`wikidata-country-fetch-failed:${response.status}`);
const payload = await response.json();
const entities = payload.entities || {};
if (QIDS.some((qid) => !entities[qid] || entities[qid].missing !== undefined)) throw new Error("wikidata-country-snapshot-incomplete");
const filePath = path.join(ROOT, OUTPUT);
await mkdir(path.dirname(filePath), { recursive: true });
const temporary = `${filePath}.${process.pid}.tmp`;
try {
  await writeFile(temporary, `${JSON.stringify({
    schemaVersion: "route-v2-knowledge-expansion-batch05-country-raw-v1",
    retrievedAt: RETRIEVED_AT, endpoint: url.origin + url.pathname, qids: QIDS, wikidata: { entities },
  }, null, 2)}\n`, "utf8");
  await rename(temporary, filePath);
} finally {
  await rm(temporary, { force: true });
}
console.log(JSON.stringify({ status: "PASS", countries: QIDS.length, output: OUTPUT }, null, 2));
