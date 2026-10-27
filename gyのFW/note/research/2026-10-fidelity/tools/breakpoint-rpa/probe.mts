import { parseLevel } from "/home/gy/桌面/dev/slbhr/gyのFW/packages/shared/src/level2.js";
import { World } from "/home/gy/桌面/dev/slbhr/gyのFW/packages/shared/src/kernel/world.js";
import { readFileSync } from "node:fs";
const getTileset = (src: string) => JSON.parse(readFileSync(`/home/gy/桌面/dev/slbhr/gyのFW/assets/tilemaps/tilesets/${src.split("/").pop()}`, "utf8"));
const load = (n: string) => JSON.parse(readFileSync(`/home/gy/桌面/dev/slbhr/gyのFW/data/forest/levels/${n}.json`, "utf8"));

const lv = parseLevel("forest_02", load("forest_02"), getTileset);
console.log("forest_02 platforms:", lv.platforms.map(p => ({ x: p.x, y: p.y, w: p.w, h: p.h, dx: p.dx, dy: p.dy, group: p.group, dtheta: p.dtheta, rot: p.rotation })));
console.log("forest_02 levers:", lv.levers);
console.log("forest_02 pushers:", lv.pushers);

const w = new World(lv);
const m = w.mechanisms.platforms[0];
const px = (b: any) => { const p = b.GetPosition(); return { x: -32 * p.x, y: -32 * p.y }; };
console.log("platform0 body screen(px):", px(m.body), "angle(rad):", m.body.GetAngle(), "mass:", m.body.GetMass());
const noinput = { fireboy: {} as any, watergirl: {} as any };
for (let i = 0; i < 120; i++) w.step(1 / 60, noinput);
const p0 = px(m.body);
console.log("after 2s idle:", p0, "state:", m.state);

// 平移平台：组信号置 1 → 位移方向验证
m.state = 1; m.signalApply();
for (let i = 0; i < 300; i++) w.step(1 / 60, noinput);
const p1 = px(m.body);
const L = Math.hypot(m["joint"] ? 0 : 0);
const def = lv.platforms[0];
const len = Math.hypot(def.dx, def.dy);
console.log("after state1:", p1, "disp(px):", (p1.x - p0.x).toFixed(2), (p1.y - p0.y).toFixed(2), "expect (-dx,-dy)/|.|*len*32 =", (-def.dx / len * len * 32).toFixed(2), (-def.dy / len * len * 32).toFixed(2));
