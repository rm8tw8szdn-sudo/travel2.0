import fs from "node:fs";

const css = fs.readFileSync(new URL("../mobile.css", import.meta.url), "utf8");
const docs = fs.existsSync(new URL("../docs/design-system.md", import.meta.url))
  ? fs.readFileSync(new URL("../docs/design-system.md", import.meta.url), "utf8")
  : "";

const requiredTokens = [
  "--ds-font-h1",
  "--ds-font-h2",
  "--ds-font-body",
  "--ds-font-caption",
  "--ds-color-text-primary",
  "--ds-color-text-secondary",
  "--ds-color-text-tag",
  "--ds-radius-card",
  "--ds-radius-control",
  "--ds-shadow-card",
  "--ds-space-card",
  "--ds-control-height",
];

const requiredClasses = [
  ".ds-h1",
  ".ds-h2",
  ".ds-body",
  ".ds-caption",
  ".primary-button",
  ".secondary-button",
  ".glass-card",
  ".form-control",
  ".tag-chip",
  ".tag-pill",
];

const requiredDocs = [
  "Design System",
  "禁止新增裸 font-size",
  "禁止新增裸 border-radius",
  "禁止新增输入框风格",
];

const requiredTokenUsage = [
  "font-size: var(--ds-font-h1)",
  "font-size: var(--ds-font-h2)",
  "font-size: var(--ds-font-body)",
  "font-size: var(--ds-font-caption)",
  "color: var(--ds-color-text-primary)",
  "color: var(--ds-color-text-secondary)",
  "color: var(--ds-color-text-tag)",
  "border-radius: var(--ds-radius-card)",
  "box-shadow: var(--ds-shadow-card)",
  "min-height: var(--ds-control-height)",
];

const requiredAppUsage = [
  "class=\"guide-modal-title ds-h2\"",
  "class=\"guide-modal-kicker ds-caption\"",
  "class=\"form-control\"",
  "class=\"guide-modal-actions\"",
  "class=\"primary-button guide-modal-save\"",
  "class=\"secondary-button guide-modal-cancel\"",
];

const missing = [
  ...requiredTokens.filter((marker) => !css.includes(marker)),
  ...requiredClasses.filter((marker) => !css.includes(marker)),
  ...requiredTokenUsage.filter((marker) => !css.includes(marker)),
  ...requiredDocs.filter((marker) => !docs.includes(marker)),
  ...requiredAppUsage.filter((marker) => !fs.readFileSync(new URL("../legacy/mobile-app.js", import.meta.url), "utf8").includes(marker) && !css.includes(marker)),
];

if (missing.length) {
  console.error(`Missing design system markers:\n${missing.join("\n")}`);
  process.exit(1);
}

console.log("Design system verified.");
