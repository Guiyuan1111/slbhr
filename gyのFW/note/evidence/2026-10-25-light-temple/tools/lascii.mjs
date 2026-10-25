import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseLevel, GROUND_TYPE } from "../packages/shared/src/level2.ts";
const dir = "data/tutorials/levels";
const json = JSON.parse(readFileSync(join(dir, "light_01.json"), "utf8"));
const L = parseLevel("light_01", json, (source) => JSON.parse(readFileSync(join(dir, source), "utf8")));
// 行优先：0=空 −99；其余实心/斜/楔/液体
const mark = new Array(L.rows * L.cols).fill(" ");
const put = (x, y, ch) => { const c = Math.floor(x / 32), r = Math.floor(y / 32); if (c >= 0 && c < L.cols && r >= 0 && r < L.rows) mark[r * L.cols + c] = ch; };
for (const m of L.platforms) { const c0 = Math.floor(m.x / 32), r0 = Math.floor(m.y / 32); for (let r = r0; r < r0 + m.h / 32; r++) for (let c = c0; c < c0 + m.w / 32; c++) if (r*L.cols+c >= 0 && r*L.cols+c < mark.length) mark[r * L.cols + c] = "P"; }
put(L.spawn.fireboy.x, L.spawn.fireboy.y, "F"); put(L.spawn.watergirl.x, L.spawn.watergirl.y, "W");
put(L.doors.fireboy.x + 32, L.doors.fireboy.y + 32, "f"); put(L.doors.watergirl.x + 32, L.doors.watergirl.y + 32, "w");
for (const m of L.levers) put(m.x, m.y, "l");
for (const m of L.beamers) put(m.x, m.y, "B");
for (const m of L.rotMirrors) put(m.x, m.y, "R");
for (const m of L.boxMirrors) put(m.x, m.y, "b");
for (const m of L.infiniteMirrors) put(m.x, m.y, "M");
for (const m of L.lightPushers) put(m.x, m.y, "p");
for (const m of L.sliders) put(m.x, m.y, "S");
for (const d of L.diamonds) put(d.x, d.y, "*");
for (let r = 0; r < L.rows; r++) {
  let line = "";
  for (let c = 0; c < L.cols; c++) {
    const t = L.groundType[r * L.cols + c];
    const m = mark[r * L.cols + c];
    if (m !== " ") line += m;
    else if (t === -99) line += ".";
    else if (t === GROUND_TYPE.SOLID) line += "#";
    else if (t === GROUND_TYPE.WATER) line += "~";
    else if (t === GROUND_TYPE.LAVA) line += "^";
    else if (t === GROUND_TYPE.GREEN) line += "%";
    else line += "/";
  }
  console.log(String(r).padStart(2) + " " + line);
}
console.log("   0123456789012345678901234567890123456789");
console.log("F=fb出生 W=wg出生 f/w=门 P=平台 l=拉杆 B=发光器 R=旋镜 b=箱镜 M=无限镜 p=光推器 S=滑轨 *=钻石");
