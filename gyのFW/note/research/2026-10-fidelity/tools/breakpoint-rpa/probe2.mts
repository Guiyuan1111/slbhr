import { parseLevel } from "/home/gy/桌面/dev/slbhr/gyのFW/packages/shared/src/level2.js";
import { World } from "/home/gy/桌面/dev/slbhr/gyのFW/packages/shared/src/kernel/world.js";
import { readFileSync } from "node:fs";
const getTileset = (src: string) => JSON.parse(readFileSync(`/home/gy/桌面/dev/slbhr/gyのFW/assets/tilemaps/tilesets/${src.split("/").pop()}`, "utf8"));
const load = (n: string) => JSON.parse(readFileSync(`/home/gy/桌面/dev/slbhr/gyのFW/data/forest/levels/${n}.json`, "utf8"));
const noinput = { fireboy: {} as any, watergirl: {} as any };

// 转臂平台 forest_07：w=32 h=96（竖直）、dtheta=90、offsetY=-1
const lv7 = parseLevel("forest_07", load("forest_07"), getTileset);
console.log("f07 platforms:", lv7.platforms.map(p => ({ x: p.x, y: p.y, dx: p.dx, dy: p.dy, dtheta: p.dtheta, offY: p.offsetY, rot: p.rotation })));
const w7 = new World(lv7);
const arm = w7.mechanisms.platforms.find(p => (p as any).isRevolute)!;
console.log("arm mass:", arm.body.GetMass(), "angle(deg,b2):", arm.body.GetAngle() * 180 / Math.PI);
for (let i = 0; i < 60; i++) w7.step(1 / 60, noinput);
console.log("after 1s idle angle(deg):", arm.body.GetAngle() * 180 / Math.PI);
arm.state = 1; arm.signalApply();
for (let i = 0; i < 90; i++) w7.step(1 / 60, noinput);
console.log("after state1 1.5s angle(deg):", arm.body.GetAngle() * 180 / Math.PI, "（dtheta>0 预期体角→-90°）");

// 拉杆：找最近带 lever 的关
const lv = parseLevel("forest_05", load("forest_05"), getTileset);
console.log("f05 levers:", lv.levers);
const w5 = new World(lv);
const lever = w5.mechanisms.levers[0];
console.log("lever mass:", lever.body.GetMass(), "COM(local):", lever.body.GetLocalCenter ? lever.body.GetLocalCenter() : lever.body.m_sweep.localCenter, "angle0(deg):", lever.body.GetAngle() * 180 / Math.PI);
for (let i = 0; i < 120; i++) w5.step(1 / 60, noinput);
console.log("lever after 2s idle angle(deg):", lever.body.GetAngle() * 180 / Math.PI, "state:", lever.state, "（不自翻=金轨迹口径）");
// 推杆 forest_02：按钮下沉量
const lv2 = parseLevel("forest_02", load("forest_02"), getTileset);
const w2 = new World(lv2);
const pusher = w2.mechanisms.pushers[0];
const pb = pusher.body;
console.log("pusher mass:", pb.GetMass(), "pos screen:", (() => { const p = pb.GetPosition(); return { x: -32 * p.x, y: -32 * p.y }; })());
