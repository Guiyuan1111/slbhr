#!/usr/bin/env node
/**
 * render-level.mjs — 关卡 JSON → ASCII 地图（含机关/角色标注）
 *
 * 用法：
 *   node scripts/baseline/render-level.mjs <level.json>       # level.json 为只读参考库内关卡文件路径
 *   node scripts/baseline/render-level.mjs --all              # 列出参考库全部 forest 关卡路径
 *
 * 图例：
 *   # 实心  / \ 斜坡  C D 凹件  ~=水(杀火)  !=岩浆(杀水)  g=绿泥(双杀)
 *   1=火人出生 2=水女孩出生 A=火人门 B=水女孩门 *=钻石  P=按钮踏板 L=拉杆 X=箱子 ==移动平台
 *
 * 坐标系：Tiled 网格 (col,row)，col 0 在左。tile=32px=1m。
 *   gid→类型换算：Ground firstgid=1：1实心 2/3斜坡 4/5凹件 5水 6岩浆 7绿泥。
 *   注意本图例的 '~'/'!' 直接按 gid 语义渲染（6=水杀火、7=岩浆杀水）。
 */
import { readFileSync } from "node:fs";

const args = process.argv.slice(2);
const refRoot = "D:/01_Guiyuan1111/GitHub/slbhr/Fireboy-and-Watergirl/output/A";

if (args[0] === "--all") {
  console.log(`${refRoot}/data/tutorials/levels/forest_01.json`);
  const list = JSON.parse(readFileSync(`${refRoot}/data/forest/temple.json`, "utf8"));
  for (const l of list.levels) console.log(`${refRoot}/data/${l.filename}`);
  process.exit(0);
}
const file = args[0];
if (!file) {
  console.error("usage: render-level.mjs <level.json> | --all");
  process.exit(1);
}
const j = JSON.parse(readFileSync(file, "utf8"));
const g = j.layers.find((l) => l.name === "Ground").data;
const W = j.width, H = j.height;
const sym = { 0: " ", 1: "#", 2: "/", 3: "\\", 4: "C", 5: "D", 6: "~", 7: "!", 8: "g" };
const chars = j.layers.find((l) => l.name === "Chars").objects;
const objs = j.layers.find((l) => l.name === "Objects").objects;
const grid = [...Array(H)].map(() => Array(W).fill(" "));
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) grid[y][x] = sym[g[y * W + x]] ?? "?";
const mark = (x, y, c) => {
  const cx = Math.floor(x / 32), cy = Math.floor(y / 32);
  if (grid[cy] && grid[cy][cx] !== undefined) grid[cy][cx] = c;
};
const cmark = { 16: "1", 17: "2", 18: "A", 19: "B", 20: "*", 21: "*" };
for (const o of chars) mark(o.x + 32, o.y - 32, cmark[o.gid] ?? "c");
for (const o of objs) {
  if (o.gid === 24) mark(o.x + 32, o.y - 32, "P");
  else if (o.gid === 25 || o.gid === 26) mark(o.x + 32, o.y - 32, "L"); // 拉杆（gid 随图块集 firstgid 浮动）
  else if (o.gid === 28) mark(o.x + 32, o.y - 32, "X");
  else if (o.type === "platform") {
    const w = Math.round(o.width / 32);
    for (let i = 0; i < w; i++) grid[Math.floor((o.y + 16) / 32)][Math.floor((o.x + i * 32 + 16) / 32)] = "=";
    console.log(`# platform id=${o.id} pos=(${o.x},${o.y}) size=${o.width}x${o.height} d=(${o.properties.dx},${o.properties.dy}) group=${o.properties.group}`);
  }
}
let top = "    ";
for (let x = 0; x < W; x++) top += x % 10;
console.log(top);
for (let y = 0; y < H; y++) console.log(String(y).padStart(3) + " " + grid[y].join(""));
