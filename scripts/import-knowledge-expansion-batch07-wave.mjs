if (!process.argv.some((value) => value.startsWith("--batch="))) {
  process.argv.push("--batch=07");
}

await import("./import-knowledge-expansion-batch05-wave.mjs");
