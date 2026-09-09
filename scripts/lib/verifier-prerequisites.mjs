import fs from "node:fs";
import path from "node:path";

export const VERIFIER_PREREQUISITE_EXIT_CODE = 2;

export function reportMissingVerifierPrerequisites({ verifier, files, restore }) {
  const missing = files.filter((filePath) => !fs.existsSync(filePath));
  if (!missing.length) return;
  console.error(JSON.stringify({
    verifier,
    status: "BLOCKED",
    code: "VERIFIER_PREREQUISITE_MISSING",
    missing: missing.map((filePath) => path.relative(process.cwd(), filePath).replaceAll("\\", "/")),
    restore,
  }, null, 2));
  process.exit(VERIFIER_PREREQUISITE_EXIT_CODE);
}

export function readVerifierJson(filePath, { verifier, restore } = {}) {
  const text = fs.readFileSync(filePath, "utf8");
  if (text.startsWith("version https://git-lfs.github.com/spec/v1")) {
    console.error(JSON.stringify({
      verifier,
      status: "BLOCKED",
      code: "GIT_LFS_CONTENT_MISSING",
      file: path.relative(process.cwd(), filePath).replaceAll("\\", "/"),
      restore: restore || "Run git lfs pull, then rerun the verifier.",
    }, null, 2));
    process.exit(VERIFIER_PREREQUISITE_EXIT_CODE);
  }
  return JSON.parse(text);
}
