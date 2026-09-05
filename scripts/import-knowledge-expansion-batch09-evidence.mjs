if (!process.argv.some((value) => value.startsWith("--batch="))) {
  process.argv.push("--batch=09");
}

await import("./import-knowledge-expansion-batch06-evidence.mjs");
