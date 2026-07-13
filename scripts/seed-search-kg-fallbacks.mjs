import path from "node:path";
import {
  mergeSearchKnowledgeGraphFallbacks,
  readKnowledgeGraphCache,
  writeKnowledgeGraphCache,
} from "../src/lib/routes/index.mjs";

const storagePath = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.resolve(".route-v2-cache", "knowledge-graph-pool.json");

const before = readKnowledgeGraphCache(storagePath);
const after = mergeSearchKnowledgeGraphFallbacks(before);
writeKnowledgeGraphCache(storagePath, after);

const countries = ["IS", "TR"].map((code) => `${code}:${(after[code] || []).length}`).join(", ");
console.log(`Search KG fallbacks seeded: ${countries}`);
