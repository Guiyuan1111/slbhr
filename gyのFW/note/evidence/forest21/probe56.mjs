// 墙体几何: c30 列 (960-1024) 全行 tile 实体性 + plat1/plat2/box/风/杆 原始对象
import { makeWorld } from "../../../scripts/e2e/routetool/kernel.mjs";
import fs from "node:fs";
const raw = JSON.parse(fs.readFileSync("data/forest/levels/forest_21.json", "utf8"));
const T = g => g === 0 ? 0 : ((g - 1) % 7) + 1;
const NAMES = ["", "SOLID", "SLOPE_A/", "SLOPE_B\\", "WEDGE_C", "WEDGE_D", "WATER", "LAVA"];
const w = Number(raw.width), h = Number(raw.height);
// 找 Ground 层
const gl = raw.layers.find(l => /^ground$/i.test(l.name ?? "") || l.type === "tilelayer" && /ground/i.test(l.name ?? ""));
const gid = gl.data;
const c30 = [];
for (let r = 0; r < h; r++) {
  const a = T(gid[r * w + 30]), b = T(gid[r * w + 31]);
  if (a || b) c30.push(`r${r}(y${r * 32}): c30=${NAMES[a]} c31=${NAMES[b]}`);
}
console.log("== c30/c31 列实体 =="); console.log(c30.join("\n"));
console.log("\n== objects ==");
for (const o of (raw.layers.find(l => l.type === "objectgroup")?.objects ?? []))
  console.log(JSON.stringify(o));
