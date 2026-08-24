if (!process.argv.some((value) => value.startsWith("--batch="))) {
  process.argv.push("--batch=07");
}

await import("./import-route-v2-dedicated-images-batch06.mjs");
