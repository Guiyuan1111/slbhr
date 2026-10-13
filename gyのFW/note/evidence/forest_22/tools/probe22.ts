// flashbp22 探针: forest_22 headless——pusher 压杆 → 平台真实行程实测（不起端口）
import { readFileSync } from "node:fs";
import { parseLevel } from "../../packages/shared/src/level2.js";
import { World } from "../../packages/shared/src/kernel/world.js";

const ROOT = new URL(".", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const dir = "D:/01_Guiyuan1111/GitHub/slbhr/gyのFW/data/forest/levels";
const json = JSON.parse(readFileSync(`${dir}/forest_22.json`, "utf8"));
const provider = (source: string) => {
  const p = new URL(source, `file:///${dir}/`).pathname.replace(/^\/([A-Za-z]:)/, "$1");
  return JSON.parse(readFileSync(decodeURI(p), "utf8"));
};
const level = parseLevel("forest_22", json, provider);
const world = new World(level);
const NONE = { up: false, left: false, right: false };
const B = (world as any).B;

const toScr = (p: any) => ({ x: -p.x * 32, y: -p.y * 32 });
const fmt = (s: { x: number; y: number }) => `(${s.x.toFixed(1)},${s.y.toFixed(1)})`;

const step = (n: number) => { for (let i = 0; i < n; i++) world.step(1 / 60, { fireboy: NONE, watergirl: NONE }); };

function snap(label: string) {
  const m = world.mechSnapshot();
  const rows = m.platforms.map((p) => `p${p.id}@${fmt(toScr((world as any).mechanisms.platforms[p.id].body.GetPosition()))} state=${p.state}`);
  const push = m.pushers.map((p) => `b${p.id} group=${p.group} state=${p.state}`);
  const winds = m.winds.map((w) => `f${w.id}(g${w.group})=${w.state}`).join(",");
  console.log(`  [${label}]`);
  console.log(`    ${rows.join("  ")}`);
  console.log(`    pushers: ${push.join("  ")}  winds: ${winds}`);
}

console.log("== 平台初始（世界系屏幕坐标, 板中心; p0=id28 p1=id30 p2=id31 p3=id32 p4=id37）==");
step(30);
snap("settle 30f");

// 压 b0 (id33, group5): 力 phys(0,-F) = 屏幕向下
const pushers = (world as any).mechanisms.pushers;
console.log("\n== 压 pusher b0 (obj33, group5) 300N×120f ==");
for (let i = 0; i < 120; i++) {
  pushers[0].body.ApplyForce(new B.b2Vec2(0, -300), pushers[0].body.GetPosition());
  world.step(1 / 60, { fireboy: NONE, watergirl: NONE });
}
snap("after press b0");
step(120);
snap("release +120f");

console.log("\n== 压 pusher b1 (obj34, group0) 300N×120f ==");
for (let i = 0; i < 120; i++) {
  pushers[1].body.ApplyForce(new B.b2Vec2(0, -300), pushers[1].body.GetPosition());
  world.step(1 / 60, { fireboy: NONE, watergirl: NONE });
}
snap("after press b1");
step(120);
snap("release +120f");

console.log("\n== 双压 b0+b1 240f ==");
for (let i = 0; i < 240; i++) {
  pushers[0].body.ApplyForce(new B.b2Vec2(0, -300), pushers[0].body.GetPosition());
  pushers[1].body.ApplyForce(new B.b2Vec2(0, -300), pushers[1].body.GetPosition());
  world.step(1 / 60, { fireboy: NONE, watergirl: NONE });
}
snap("both pressed");
step(60);
snap("release +60f");

console.log("\n== 角色落点（30f 后） ==");
const w2 = new World(parseLevel("forest_22", json, provider));
for (let i = 0; i < 120; i++) w2.step(1 / 60, { fireboy: NONE, watergirl: NONE });
const ps = (w2 as any).players ?? (w2 as any).chars;
console.log("  players keys:", Object.keys(ps ?? {}));
for (const k of Object.keys(ps ?? {})) {
  const c = ps[k];
  const p = c.body.GetPosition();
  const v = c.body.GetLinearVelocity();
  console.log(`  ${k}: pos=${fmt(toScr(p))} v=(${(-v.x * 32).toFixed(1)},${(-v.y * 32).toFixed(1)})px/s phase=${(w2 as any).phase}`);
}

// ---- 风柱托举实测: 传送 fireboy 到 fan obj24 (id24, body 208,880) 风柱内 ----
console.log("\n== 风柱托举: fireboy 传送到 (208,820) [fan obj24 柱 x166-250] ==");
const w3 = new World(parseLevel("forest_22", json, provider));
for (let i = 0; i < 30; i++) w3.step(1 / 60, { fireboy: NONE, watergirl: NONE });
const fb = (w3 as any).players.fireboy;
fb.body.SetPosition(new (w3 as any).B.b2Vec2(-208 / 32, -820 / 32));
fb.body.SetLinearVelocity(new (w3 as any).B.b2Vec2(0, 0));
for (let f = 0; f <= 300; f++) {
  w3.step(1 / 60, { fireboy: NONE, watergirl: NONE });
  if (f % 60 === 0) {
    const p = fb.body.GetPosition(), v = fb.body.GetLinearVelocity();
    console.log(`  f${f}: pos=${fmt(toScr(p))} vy=${(-v.y * 32).toFixed(1)}px/s`);
  }
}
