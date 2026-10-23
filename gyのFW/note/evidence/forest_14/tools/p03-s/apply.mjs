/**
 * P-03 S 档落地：forest_14 / forest_14_1 数据修改（cb32 = 丙+乙整行）。
 *  - 丙：删楔面四瓦 r6c9/r7c8/r7c9/r8c8（45° 漏斗封门台，双引擎封印主因）
 *  - 乙(整行)：门台 r8c0-7 下移一行至 r9（顶 256→288，补干净弹道 apex 259.5 的 3.8px 缺口），
 *    门对象 id23/id24 随移 y+32
 * 写回复刻 Tiled 转义（非 ASCII \uXXXX）保字节风格；同时同步 public/data 镜像。
 * 运行：node TEMP/p03/apply.mjs [--dry]
 */
import { readFileSync, writeFileSync, copyFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(dirname(dirname(fileURLToPath(import.meta.url)))));
const DRY = process.argv.includes("--dry");
const LEVELS = ["forest_14", "forest_14_1"];
const esc = (s) => s.replace(/[\u0080-\uffff]/g, (c) => "\\u" + c.charCodeAt(0).toString(16).padStart(4, "0"));

for (const lv of LEVELS) {
  const p = join(ROOT, "data/forest/levels", `${lv}.json`);
  const raw = readFileSync(p, "utf8");
  const d = JSON.parse(raw);
  const W = d.width;
  const ground = d.layers.find((l) => l.type === "tilelayer" && l.name === "Ground").data;
  const edits = [];
  const set = (r, c, g, why) => {
    const i = r * W + c;
    edits.push(`${why}: r${r}c${c} ${ground[i]}->${g}`);
    ground[i] = g;
  };
  for (const [r, c] of [[6, 9], [7, 8], [7, 9], [8, 8]]) set(r, c, 0, "丙删楔");
  // 乙台撤/落只动 c1-7：c0 是贯通全高的西墙列，不得开豁口（r9c0 原本就是墙 1）
  for (let c = 1; c <= 7; c++) { set(8, c, 0, "乙台撤"); set(9, c, 1, "乙台落"); }
  const chars = d.layers.find((l) => l.name === "Chars").objects;
  for (const o of chars) if (o.id === 23 || o.id === 24) { edits.push(`门id${o.id}: y ${o.y}->${o.y + 32}`); o.y += 32; }
  const out = esc(JSON.stringify(d));
  if (esc(JSON.stringify(JSON.parse(out))) !== out) throw new Error(`${lv} 往返失真`);
  console.log(`[${lv}] ${edits.length} 处：\n  ` + edits.join("\n  "));
  if (!DRY) {
    writeFileSync(p, out);
    copyFileSync(p, join(ROOT, "packages/client/public/data/forest/levels", `${lv}.json`));
    console.log(`[${lv}] 已写 data/ 与 public 镜像`);
  }
}
