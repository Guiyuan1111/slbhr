// r17f 探针批4b：fb 东链 v6 关键跳（修正 ctrl 键名 fb:/wg:）
import { replay } from "./lib17.mjs";
const L = "forest_17";
const mode = process.argv[2] ?? "all";
const run = (name, fn) => { if (mode === "all" || mode === name) fn(); };
const FB = (o) => ({ fb: o });

function stopJump({ tele, trig, post = () => ({}), total = 220, settleV = 15, jumpHold = 5 }) {
  let ph = "run"; let jf = 0;
  return replay(L, { ctrl: (w, f, s) => {
    const c = s.fb;
    if (f < 5) return {};
    if (ph === "run") { if (trig(c)) { ph = "settle"; return {}; } return FB({ right: true }); }
    if (ph === "settle") { if (Math.abs(c.vx) < settleV) { ph = "jump"; jf = 0; return FB({ up: true }); } return {}; }
    if (ph === "jump") { jf++; if (jf >= jumpHold) ph = "post"; return FB({ up: true }); }
    return FB(post(c));
  } }, total, { sample: 0, tele: [tele] });
}
const feet = (e) => e.y + 35.5;

run("A", () => {
  console.log("== A: mesa 东档跳 ==");
  for (const jx of [790, 770, 750]) {
    let jumped = false;
    const r = replay(L, { ctrl: (w, f, s) => {
      if (f < 5) return {};
      if (!jumped && s.fb.x >= jx) { jumped = true; return FB({ right: true, up: true }); }
      return FB({ right: true });
    } }, 160, { sample: 0, tele: [{ f: 0, role: "fireboy", x: 450, feetY: 768 }] });
    const e = r.endSnap.fb;
    const on768E = Math.abs(feet(e) - 768) < 3 && e.x > 920 && e.x < 1062;
    const onPillar = Math.abs(feet(e) - 672) < 3 && e.x > 926 && e.x < 962;
    console.log(`jx=${jx} endF=${r.endF} fb(${e.x.toFixed(1)}, feet ${feet(e).toFixed(1)}) ${on768E ? "ON-768E" : onPillar ? "ON-PILLAR" : "MISS"}`);
  }
});

run("B", () => {
  console.log("== B: 768E→p5 f0 垂直啃边 ==");
  for (const x0 of [1000, 1010, 990, 1020]) {
    const r = stopJump({ tele: { f: 0, role: "fireboy", x: x0, feetY: 768 }, trig: () => true, total: 200 });
    const e = r.endSnap.fb;
    const onP5 = Math.abs(feet(e) - 641.9) < 3 && e.x > 955 && e.x < 1061;
    console.log(`x0=${x0} endF=${r.endF} fb(${e.x.toFixed(1)}, feet ${feet(e).toFixed(1)}) ${onP5 ? "ON-P5" : "MISS"}`);
  }
});

run("C", () => {
  console.log("== C: mid→p7顶→D ==");
  let ph = "run";
  const r = replay(L, { ctrl: (w, f, s) => {
    if (f < 5) return {};
    const c = s.fb;
    if (ph === "run") { if (c.x >= 912) { ph = "jump"; return FB({ up: true, right: true }); } return FB({ right: true }); }
    return FB({ right: c.y > 430, up: c.y > 430 && c.vy < -300 });
  } }, 260, { sample: 0, tele: [{ f: 0, role: "fireboy", x: 880, feetY: 512 }] });
  const e = r.endSnap.fb;
  const onD = Math.abs(feet(e) - 384) < 4 && e.x > 958 && e.x < 1240;
  console.log(`endF=${r.endF} fb(${e.x.toFixed(1)}, feet ${feet(e).toFixed(1)}) ${onD ? "ON-D" : "MISS"}`);
});

run("D", () => {
  console.log("== D: D→p4 顶垂直啃边 ==");
  for (const x0 of [1180, 1190, 1170]) {
    const r = stopJump({ tele: { f: 0, role: "fireboy", x: x0, feetY: 384 }, trig: () => true, total: 200 });
    const e = r.endSnap.fb;
    const onP4 = Math.abs(feet(e) - 258) < 3 && e.x > 1164 && e.x < 1204;
    console.log(`x0=${x0} endF=${r.endF} fb(${e.x.toFixed(1)}, feet ${feet(e).toFixed(1)}) ${onP4 ? "ON-P4" : "MISS"}`);
  }
});

run("E", () => {
  console.log("== E: p4 顶→大块 西跳 ==");
  for (const jx of [1175, 1165]) {
    let jumped = false;
    const r = replay(L, { ctrl: (w, f, s) => {
      if (f < 5) return {};
      if (!jumped && s.fb.x <= jx) { jumped = true; return FB({ left: true, up: true }); }
      return FB({ left: true });
    } }, 160, { sample: 0, tele: [{ f: 0, role: "fireboy", x: 1195, feetY: 258 }] });
    const e = r.endSnap.fb;
    const onBlock = Math.abs(feet(e) - 192) < 3 && e.x > 512 && e.x < 1126;
    console.log(`jx=${jx} endF=${r.endF} fb(${e.x.toFixed(1)}, feet ${feet(e).toFixed(1)}) ${onBlock ? "ON-BLOCK" : "MISS"}`);
  }
});

run("F", () => {
  console.log("== F: 大块→棚 助跑西跳 ==");
  for (const jx of [560, 545, 530]) {
    let jumped = false;
    const r = replay(L, { ctrl: (w, f, s) => {
      if (f < 5) return {};
      if (!jumped && s.fb.x <= jx) { jumped = true; return FB({ left: true, up: true }); }
      return FB({ left: true });
    } }, 160, { sample: 0, tele: [{ f: 0, role: "fireboy", x: 850, feetY: 192 }] });
    const e = r.endSnap.fb;
    const onLedge = Math.abs(feet(e) - 128) < 3 && e.x > 40 && e.x < 480;
    console.log(`jx=${jx} endF=${r.endF} fb(${e.x.toFixed(1)}, feet ${feet(e).toFixed(1)}) ${onLedge ? "ON-LEDGE" : "MISS"}`);
  }
});

run("G", () => {
  console.log("== G: wg 丘西行下大块（带采样） ==");
  const r = replay(L, { ctrl: (w, f, s) => (f < 5 ? {} : { wg: { left: true } }) }, 300, { sample: 30, tele: [{ f: 0, role: "watergirl", x: 1024, feetY: 128 }] });
  for (const smp of r.samples) console.log(`f=${smp.f} wg(${smp.wg.x.toFixed(1)}, feet ${feet(smp.wg).toFixed(1)})`);
  const e = r.endSnap.wg;
  console.log(`endF=${r.endF} wg(${e.x.toFixed(1)}, feet ${feet(e).toFixed(1)})`);
});
