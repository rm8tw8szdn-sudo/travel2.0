import path from "node:path";
import {
  createEvidenceRepository,
  createWebSearchEvidenceProvider,
  createWebSearchEvidenceRunner,
  WEB_SEARCH_PHASE2C_QUERIES,
} from "../src/lib/routes/index.mjs";

const INJECTED_RESULTS = {
  "Kansai rail travel Kyoto Osaka Nara": [
    {
      url: "https://www.japan.travel/en/destinations/kansai/",
      title: "Kansai Travel Guide | Japan National Tourism Organization",
      snippet: "Kansai links Kyoto, Osaka and Nara with frequent rail connections and is known for temples, food and historic cities.",
    },
    {
      url: "https://en.wikivoyage.org/wiki/Kansai",
      title: "Kansai - Wikivoyage",
      snippet: "Kansai includes Kyoto, Osaka, Nara and nearby cities; rail travel is the usual way to move between them.",
    },
  ],
  "Shikoku pilgrimage best season": [
    {
      url: "https://en.wikivoyage.org/wiki/88_Temple_Pilgrimage",
      title: "88 Temple Pilgrimage - Wikivoyage",
      snippet: "The Shikoku pilgrimage connects temples around Shikoku and is a walking pilgrimage route often planned for spring or autumn.",
    },
  ],
  "Swiss scenic train route": [
    {
      url: "https://www.myswissalps.com/travel/train/scenictrains/",
      title: "Swiss scenic trains",
      snippet: "Swiss scenic trains such as the Glacier Express and Bernina Express connect Alpine regions by rail and are popular in summer.",
    },
  ],
  "Norway northern lights season": [
    {
      url: "https://www.visitnorway.com/things-to-do/nature-attractions/northern-lights/",
      title: "Northern lights in Norway",
      snippet: "Northern Norway is known for northern lights, with winter months offering the strongest season for aurora travel.",
    },
  ],
  "Croatia island ferry route": [
    {
      url: "https://www.croatia.hr/en-gb/islands",
      title: "Croatian islands",
      snippet: "Croatia's islands are linked by ferry route networks and are usually visited for island and coastal travel in summer.",
    },
  ],
};

function arg(name, fallback = "") {
  const prefix = `--${name}=`;
  const value = process.argv.find((item) => item.startsWith(prefix));
  if (value) return value.slice(prefix.length);
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] || fallback : fallback;
}

const mode = arg("mode", "injected");
const limit = Number(arg("limit", "10"));
const dryRun = process.argv.includes("--dry-run");
const queryVariants = process.argv.includes("--query-variants");
const maxQueryVariants = Number(arg("max-query-variants", "3"));
const defaultEvidenceStorage = path.basename(process.cwd()) === "travel-collection"
  ? path.resolve(".route-v2-cache", "route-evidence.json")
  : path.resolve("travel-collection", ".route-v2-cache", "route-evidence.json");
const storagePath = arg("evidence-storage", defaultEvidenceStorage);
const explicitQueries = process.argv.filter((item) => item.startsWith("--query=")).map((item) => item.slice("--query=".length).trim()).filter(Boolean);
const queries = explicitQueries.length
  ? explicitQueries
  : (arg("query-set", "phase2c-small") === "phase2c-small" ? WEB_SEARCH_PHASE2C_QUERIES : []);

const repository = createEvidenceRepository({ storagePath });
const provider = createWebSearchEvidenceProvider({
  mode,
  injectedResults: INJECTED_RESULTS,
});
const runner = createWebSearchEvidenceRunner({
  evidenceRepository: repository,
  provider,
});

const report = await runner.run({ mode, queries, limit, dryRun, queryVariants, maxQueryVariants });
console.log(JSON.stringify(report, null, 2));
