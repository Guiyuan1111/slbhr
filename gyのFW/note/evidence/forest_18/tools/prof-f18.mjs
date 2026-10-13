// forest_18 逐列地面剖面（TestPoint 剖面法：每列输出实心 y 区间 + 斜/楔/液标注）
import { parseLevel } from "../../../../packages/shared/src/level2.ts";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const dir = join(import.meta.dirname, "..", "..", "..", "..", "data", "forest", "levels");
const doc = JSON.parse(readFileSync(join(dir, "forest_18.json"), "utf8"));
const provider = (source) => {
  const p = new URL(source, `file:///${dir}/`).pathname.replace(/^\/([A-Za-z]:)/, "$1");
  return JSON.parse(readFileSync(decodeURI(p), "utf8"));
};
const lv = parseLevel("forest_18", doc, provider);
const T = (r, c) => lv.groundType[r * lv.cols + c];

console.log("== 逐列剖面（x=col*32；区间为 [y0,y1)；标记: #实心 /斜 \\楔c楔d w水 L岩 G绿）==");
for (let c = 0; c < lv.cols; c++) {
  const spans = [];
  let cur = null;
  for (let r = 0; r < lv.rows; r++) {
    const t = T(r, c);
    const solidish = t !== -99;
    if (solidish && cur && cur.t === t) cur.y1 = (r + 1) * 32;
    else {
      if (cur) spans.push(cur);
      cur = solidish ? { y0: r * 32, y1: (r + 1) * 32, t } : null;
    }
  }
  if (cur) spans.push(cur);
  const NM = { 0: "#", 1: "/", 2: "\\", 3: "c", 4: "d", 5: "w", 6: "L", 7: "G" };
  if (spans.length) console.log(`c${String(c).padStart(2)} x${String(c * 32).padStart(4)}: ` + spans.map(s => `${NM[s.t]}[${s.y0}-${s.y1}]`).join(" "));
}
