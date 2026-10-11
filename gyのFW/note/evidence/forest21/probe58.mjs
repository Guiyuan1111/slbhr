// 列实体图 c24-c33 全行 + c10-c13(对照西路段)
import fs from "node:fs";
const raw = JSON.parse(fs.readFileSync("data/forest/levels/forest_21.json", "utf8"));
const T = g => g === 0 ? 0 : ((g - 1) % 7) + 1;
const NAMES = ["", "SOLID", "A/", "B\\", "WC", "WD", "WATER", "LAVA"];
const gl = raw.layers.find(l => /ground/i.test(l.name ?? ""));
const w = Number(raw.width), h = Number(raw.height), gid = gl.data;
for (let c = 24; c <= 33; c++) {
  const rows = [];
  for (let r = 0; r < h; r++) { const t = T(gid[r * w + c]); if (t) rows.push(`r${r}=${NAMES[t]}`); }
  console.log(`c${c}(x${c * 32}): ${rows.join(" ")}`);
}
