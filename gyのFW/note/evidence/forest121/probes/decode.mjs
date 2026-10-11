// forest_12_1 ASCII 图解码 + 机关清单（只读诊断）
import { readFileSync } from "node:fs";
import { join } from "node:path";
const ROOT = "D:/01_Guiyuan1111/GitHub/slbhr/gyのFW";
const doc = JSON.parse(readFileSync(join(ROOT, "data/forest/levels/forest_12_1.json"), "utf8"));
const { width: W, height: H } = doc;
const ground = doc.layers.find(l => l.name === "Ground");
const chars = doc.layers.find(l => l.name === "Chars");
const props = JSON.parse(readFileSync(join(ROOT, "assets/tilemaps/tilesets/Ground.json"), "utf8")).tileproperties;
const SYM = { 0: "#", 1: "/", 2: "\\", 3: "c", 4: "d", 5: "w", 6: "l", 7: "g" };
const grid = [];
for (let r = 0; r < H; r++) {
  let row = "";
  for (let c = 0; c < W; c++) {
    const v = ground.data[r * W + c];
    row += v === 0 || v === undefined ? " " : (SYM[props[v - 1].type] ?? "?");
  }
  grid.push(row);
}
// 叠加角色/钻石/门标记（覆盖显示）
const mark = (x, y, ch) => {
  const c = Math.floor(x / 32), r = Math.floor(y / 32);
  if (r >= 0 && r < H && c >= 0 && c < W) {
    const cur = grid[r][c];
    grid[r] = grid[r].slice(0, c) + (cur === " " ? ch : cur === "#" ? ch : cur) + grid[r].slice(c + 1);
  }
};
for (const o of chars.objects) {
  const cx = o.x + 32, cy = o.y + 32;
  const ch = { 16: "F", 17: "G", 18: "P", 19: "Q", 20: "R", 21: "B" }[o.gid] ?? "?";
  mark(cx, cy, ch);
}
console.log("cols=" + W + " rows=" + H + "  tile=32px  map=1248x928");
console.log("      " + Array.from({ length: W }, (_, c) => c % 10).join(""));
for (let r = 0; r < H; r++) console.log(String(r).padStart(4) + " " + grid[r]);
console.log("\n图例: #=实心 /=凸斜A \\=凸斜B c/d=半块楔 w=水 l=岩浆  F=fb出生 G=wg出生 P=fb门 Q=wg门 R=红钻(fb) B=蓝钻(wg)");
console.log("\nObjects:");
for (const o of doc.layers.find(l => l.name === "Objects").objects) {
  console.log(JSON.stringify({ id: o.id, type: o.type, x: o.x, y: o.y, pts: o.polyline, props: o.properties }));
}
console.log("\nChars:");
for (const o of chars.objects) {
  const ch = { 16: "fb出生", 17: "wg出生", 18: "fb门", 19: "wg门", 20: "红钻", 21: "蓝钻" }[o.gid];
  console.log(`${ch} 中心=(${o.x + 32},${o.y + 32})`);
}
