// forest_18 parseLevel 全解码 + Ground 网格渲染 + 液体行段
import { parseLevel } from "../../../../packages/shared/src/level2.ts";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = join(import.meta.dirname, "..", "..", "..", "..");
const dir = join(ROOT, "data", "forest", "levels");
const doc = JSON.parse(readFileSync(join(dir, "forest_18.json"), "utf8"));
const provider = (source) => {
  const p = new URL(source, `file:///${dir}/`).pathname.replace(/^\/([A-Za-z]:)/, "$1");
  return JSON.parse(readFileSync(decodeURI(p), "utf8"));
};
const lv = parseLevel("forest_18", doc, provider);

console.log("== size:", lv.cols, "x", lv.rows, "=", lv.widthPx, "x", lv.heightPx);
console.log("== spawn:", JSON.stringify(lv.spawn));
console.log("== doors:", JSON.stringify(lv.doors));
console.log("== diamonds:", lv.diamonds.map(d => `${d.id}:${d.kind}@(${d.x},${d.y})`).join(" "));
console.log("== levers:", JSON.stringify(lv.levers));
console.log("== pushers:", JSON.stringify(lv.pushers));
console.log("== platforms:", JSON.stringify(lv.platforms, null, 0).replaceAll("},", "},\n   "));
console.log("== winds:", JSON.stringify(lv.winds));
console.log("== boxes:", JSON.stringify(lv.boxes), "balls:", JSON.stringify(lv.balls));
console.log("== hangings:", JSON.stringify(lv.hangings), "pulleys:", JSON.stringify(lv.pulleys), "romans:", JSON.stringify(lv.romans), "windows:", JSON.stringify(lv.windows));
console.log("== liquidRuns:", JSON.stringify(lv.liquidRuns));
console.log("== unknown:", JSON.stringify(lv.unknown));

const TN = { 0: "#", 1: "/", 2: "\\", 3: "c", 4: "d", 5: "w", 6: "L", 7: "G" };
console.log("\n== Ground grid (col ruler: tens digit rows) ==");
let ruler = "    ";
for (let c = 0; c < lv.cols; c++) ruler += c % 10 === 0 ? String(Math.floor(c / 10) % 10) : ".";
console.log(ruler);
for (let r = 0; r < lv.rows; r++) {
  let line = String(r).padStart(2) + "  ";
  for (let c = 0; c < lv.cols; c++) {
    const t = lv.groundType[r * lv.cols + c];
    line += t === -99 ? " " : (TN[t] ?? "?");
  }
  console.log(line + "  " + r * 32 + "-" + (r * 32 + 32));
}
