import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const forbiddenPatterns = [
  [/href="#"/, "href=\"#\""],
  [/console\.log/, "console.log"],
  [/人口[：:]/, "人口字段"],
  [/面积[：:]/, "面积字段"],
  [/GDP/i, "GDP"],
  [/时区[：:]/, "时区字段"],
  [/首都[：:]/, "首都字段"],
  [/语言[：:]/, "语言字段"],
  [/km²/, "km²"],
  [/完成度/, "完成度"],
  [/收藏人数|人收藏/, "收藏人数"],
  [/探索统计/, "探索统计"],
  [/排行榜/, "排行榜"],
  [/好友/, "好友"],
  [/社交动态/, "社交动态"],
  [/Day[123]/, "Day1/Day2/Day3"],
  [/复制行程/, "复制行程"],
  [/再来一次/, "再来一次"],
  [/<status-bar\b/, "<status-bar>"],
  [/9:41/, "模拟状态栏时间"],
  [/home-statusbar/, "模拟状态栏"],
  [/home-status-icons/, "模拟状态栏图标"],
  [/status-signal|status-wifi|status-battery/, "模拟信号/WiFi/电池图标"],
  [/StatusBar/, "模拟状态栏组件"],
  [/--color-phone-border|--radius-phone|--shadow-phone/, "手机壳样式变量"],
  [/width:\s*(245|390|430)px/, "固定手机预览宽度"],
  [/place-items:\s*start center/, "居中手机预览布局"],
];

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    const relative = path.relative(root, fullPath);
    if (entry.isDirectory()) {
      if (["assets", "vendor"].includes(entry.name)) return [];
      return walk(fullPath);
    }
    if (!/\.(html|js|css)$/.test(entry.name)) return [];
    if (relative.startsWith(`scripts${path.sep}verify-`)) return [];
    return [fullPath];
  });
}

const failures = [];

for (const file of walk(root)) {
  const relative = path.relative(root, file);
  const source = fs.readFileSync(file, "utf8");
  for (const [pattern, label] of forbiddenPatterns) {
    if (pattern.test(source)) failures.push(`${relative}: ${label}`);
  }
}

assert.deepEqual(failures, [], `Forbidden task 6 markers remain:\n${failures.join("\n")}`);

console.log("Task 6 forbidden markers verified.");
