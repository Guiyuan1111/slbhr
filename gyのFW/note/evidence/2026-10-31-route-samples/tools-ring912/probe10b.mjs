// fw-route-crystal3 槽 · crystal_03 环 10 相位扫参：fb 起点逐像素扫描 + 刹车再推变体
// 机制（f130-f155 逐帧实证）：box 的 4096 标记圆(r3.2) 撞实体 horizon(西面 1212.8) 钉死在中心 ~1209.45；
// TP 带 |lx|≤7.04 → 西缘 1208.96。存活窗=[1208.96,~1209.4)（0.5px）——box 入带帧步距 ≤0.6px 才可能
// 存活；全速 4.5px/f 步距 82% 概率直接钉死（入口 vx=0→出口垂直下坠→落 row19 带内→冷却回传弹回）。
// 存活入带→出口=镜像西向 钳 SET 10/mass=228px/s→西滑出带→停 row19。扫 fb 起点相位找存活解。
// 用法: node --import tsx TEMP/fw-rc3-1/probe10b.mjs [scan|brake|pulse]
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
function findRoot(dir) {
  for (let d = dir; ; d = dirname(d)) {
    try { readFileSync(join(d, "package.json")); return d; } catch { /* 向上 */ }
  }
}
const ROOT = findRoot(dirname(fileURLToPath(import.meta.url)));
const { makeWorld } = await import(pathToFileURL(join(ROOT, "scripts", "e2e", "routetool", "kernel.mjs")).href);
const B = (await import(pathToFileURL(join(ROOT, "packages", "shared", "src", "kernel", "b2.js")).href)).b2();

const part = process.argv[2] ?? "scan";
const NONE = { up: false, left: false, right: false };
const place = (w, role, sx, syCenter) => {
  const body = w.players[role === "fb" ? "fireboy" : "watergirl"].body;
  body.SetPosition(new B.b2Vec2(-sx / 32, -syCenter / 32));
  body.SetLinearVelocity(new B.b2Vec2(0, 0));
  body.SetAwake(true);
};
const boxPos = (w) => {
  const p = w.mechanisms.props[0]?.body.GetPosition();
  return p ? { x: +(-p.x * 32).toFixed(2), y: +(-p.y * 32).toFixed(2) } : null;
};
const mech = (w) => {
  const p = w.mechanisms.pushers[0];
  const pl = w.mechanisms.platforms[0];
  return { pusherState: p.state, platY: +(-pl.body.GetPosition().y * 32).toFixed(1) };
};

// 单跑：fb 置 x0，sleep3，hold right 直到 f_max；返回 {boxTP 次数, box 终点, pusher, fb 终点}
function run(x0, maxF = 700, brakeAt = null, pulse = null) {
  const w = makeWorld("crystal_03");
  place(w, "fb", x0, 284.8);
  let lastBoxX = 960, lastFbX = x0, boxTPs = 0, fbTPs = 0, firstBoxTPF = -1, latchF = -1, fbDownF = -1;
  for (let f = 0; f < maxF; f++) {
    let inp = {};
    if (f >= 3) {
      if (pulse && f >= pulse.t0) {
        const cyc = (f - pulse.t0) % (pulse.on + pulse.off);
        inp = cyc < pulse.on ? { right: true } : {};
      } else if (brakeAt != null && lastFbX >= brakeAt && boxTPs === 0) {
        // 刹车到 brakeAt 再短暂停顿后继续推（模拟 walkTo(1160)+walkTo 东）
        inp = (f % 12) < 8 ? { right: true } : {};
      } else inp = { right: true };
    }
    w.step(1 / 60, { fireboy: { ...NONE, ...inp }, watergirl: { ...NONE } });
    const bx = boxPos(w);
    const s = w.snapshotPlayer("fireboy");
    if (bx && Math.abs(bx.x - lastBoxX) > 40) { boxTPs++; if (firstBoxTPF < 0) firstBoxTPF = f; }
    if (Math.abs(s.x - lastFbX) > 40) { fbTPs++; if (fbDownF < 0) fbDownF = f; }
    const m = mech(w);
    if (m.pusherState === 1 && latchF < 0) latchF = f;
    lastBoxX = bx ? bx.x : lastBoxX;
    lastFbX = s.x;
    if (latchF >= 0 && f > latchF + 200) break;
  }
  const bx = boxPos(w);
  const m = mech(w);
  const s = w.snapshotPlayer("fireboy");
  return { boxTPs, fbTPs, firstBoxTPF, fbDownF, latchF, box: bx, pusher: m.pusherState, platY: m.platY, fbX: +s.x.toFixed(1), fbY: +s.y.toFixed(1) };
}

if (part === "scan") {
  console.log("x0 | boxTPs fbTPs | boxEnd | pusher platY | fbEnd | tpf");
  for (let x0 = 840; x0 <= 872; x0++) {
    const r = run(x0, 800);
    const tag = r.pusher === 1 ? "LATCH" : r.boxTPs >= 1 && r.box.y > 500 ? "ROW19" : r.boxTPs >= 2 ? "PINGPONG" : r.boxTPs === 1 ? "TP1" : "notp";
    console.log(`${x0} | ${r.boxTPs}/${r.fbTPs} | [${r.box.x},${r.box.y}] | ${r.pusher} ${r.platY} | fb[${r.fbX},${r.fbY}] | ${r.firstBoxTPF}/${r.fbDownF}/${r.latchF} ${tag}`);
  }
  process.exit(0);
}
if (part === "brake") {
  for (const ba of [1120, 1140, 1150, 1160]) {
    const r = run(860, 900, ba);
    console.log(`brake@${ba}: boxTPs=${r.boxTPs} fbTPs=${r.fbTPs} box=[${r.box.x},${r.box.y}] pusher=${r.pusher} plat=${r.platY} fb=[${r.fbX},${r.fbY}] tpf=${r.firstBoxTPF}/${r.fbDownF}/${r.latchF}`);
  }
  process.exit(0);
}
if (part === "pulse") {
  for (const on of [2, 3, 4]) {
    for (const off of [2, 4, 6]) {
      const r = run(1000, 1400, null, { t0: 3, on, off });
      console.log(`pulse on${on}/off${off}: boxTPs=${r.boxTPs} fbTPs=${r.fbTPs} box=[${r.box.x},${r.box.y}] pusher=${r.pusher} plat=${r.platY} fb=[${r.fbX},${r.fbY}] tpf=${r.firstBoxTPF}/${r.fbDownF}/${r.latchF}`);
    }
  }
  process.exit(0);
}
console.log("unknown part", part);
