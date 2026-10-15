// forest_02 摆板物理探针：水娃空投到 h0 板上，逐帧记录板角与板位置
import { readFileSync } from "node:fs";
import { parseLevel } from "../packages/shared/src/level2.js";
import { World } from "../packages/shared/src/kernel/world.js";

const dir = "packages/client/public/data/forest/levels";
const json = JSON.parse(readFileSync(`${dir}/forest_02.json`, "utf8"));
const provider = (source) => JSON.parse(readFileSync(decodeURIComponent(new URL(source, `file:///${process.cwd()}/${dir}/`).pathname), "utf8"));
const w = new World(parseLevel("forest_02", json, provider));

const snap0 = w.mechSnapshot();
console.log("初始 hangings:", snap0.hangings.map((h) => ({ id: h.id, x: h.x.toFixed(1), y: h.y.toFixed(1), angleDeg: (h.angle * 180 / Math.PI).toFixed(2) })));
console.log("初始 pulleys:", snap0.pulleys.length, " platforms:", snap0.platforms.length);

// 水娃空投到 h0 板（板中心 384,408）上方
const wg = w.chars.watergirl;
const px = -424 / 32, py = -340 / 32;
wg.body.SetTransformVecRadians({ x: px, y: py }, 0);
wg.body.SetLinearVelocity({ x: 0, y: 0 });

const NONE = { up: false, left: false, right: false };
for (let f = 1; f <= 300; f++) {
  w.step(1 / 60, { fireboy: NONE, watergirl: NONE });
  if (f % 15 === 0 || f < 30) {
    const s = w.mechSnapshot();
    const p = w.snapshotPlayer("watergirl");
    const h0 = s.hangings[0], h1 = s.hangings[1];
    console.log(
      `f${String(f).padStart(4)} wg(${p.x.toFixed(0)},${p.y.toFixed(0)}) h0(${h0.x.toFixed(1)},${h0.y.toFixed(1)}) a=${(h0.angle * 180 / Math.PI).toFixed(2)}° h1 a=${(h1.angle * 180 / Math.PI).toFixed(2)}°`,
    );
  }
}
