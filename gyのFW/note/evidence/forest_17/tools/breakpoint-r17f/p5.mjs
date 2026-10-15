// r17f 探针批5：过槽弧线裁决 + 东链各跳内核实测
import { replay } from "./lib17.mjs";
const L = "forest_17";
const mode = process.argv[2] ?? "all";
const run = (name, fn) => { if (mode === "all" || mode === name) fn(); };
const FB = (o) => ({ fb: o });
const ft = (e) => e.y + 35.5;

// 槽位跨越: island 顶 (feet160) 跑西 x<=jx 起跳 持续按左; pins 可选 (l3=p9-ON)
function slotJump(jx, pins, tag) {
  let jumped = false;
  const r = replay(L, { ctrl: (w, f, s) => {
    if (f < 5) return {};
    if (!jumped && s.fb.x <= jx) { jumped = true; return FB({ left: true, up: true }); }
    return FB({ left: true });
  } }, 200, { sample: 0, pins, tele: [{ f: 0, role: "fireboy", x: 760, feetY: 160 }] });
  const e = r.endSnap.fb;
  const onLedge = ft(e) < 133 && e.x > 40 && e.x < 481;
  const onRamp = ft(e) > 160 && ft(e) < 180 && e.x > 510 && e.x < 545;
  const onBlock = Math.abs(ft(e) - 192) < 3 && e.x > 512 && e.x < 1120;
  const where = onLedge ? "ON-LEDGE" : onRamp ? "ON-RAMP" : onBlock ? "ON-BLOCK" : `(${e.x.toFixed(0)},${ft(e).toFixed(0)})`;
  console.log(`${tag} jx=${jx} endF=${r.endF} fb(${e.x.toFixed(1)},feet ${ft(e).toFixed(1)}) ${where}`);
  return { onLedge, e, r };
}

run("SLOT", () => {
  console.log("== SLOT: island 西跳 vs p9 状态 ==");
  for (const jx of [712, 708, 700]) slotJump(jx, [], "p9f0");
  for (const jx of [712, 708, 700]) slotJump(jx, [3], "p9ON");
});

run("HILL", () => { // 山跳 → mid 顶
  console.log("== HILL: wg 山顶西跳 ==");
  for (const jx of [1006, 1012, 1020]) {
    let jumped = false;
    const r = replay(L, { ctrl: (w, f, s) => {
      if (f < 5) return {};
      if (!jumped && s.wg.x <= jx) { jumped = true; return { wg: { left: true, up: true } }; }
      return { wg: { left: true } };
    } }, 200, { sample: 0, tele: [{ f: 0, role: "watergirl", x: 1060, feetY: 128 }] });
    const e = r.endSnap.wg;
    const onMid = Math.abs(ft(e) - 512) < 3 && e.x > 512 && e.x < 961;
    console.log(`jx=${jx} endF=${r.endF} wg(${e.x.toFixed(1)},feet ${ft(e).toFixed(1)}) ${onMid ? "ON-MID" : "MISS"}`);
  }
});

run("CJUMP", () => { // mid 顶 → C 西坡 (672,384)-(704,416)
  console.log("== CJUMP: mid→C坡 ==");
  for (const jx of [706, 700, 694]) {
    let jumped = false;
    const r = replay(L, { ctrl: (w, f, s) => {
      if (f < 5) return {};
      if (!jumped && s.fb.x <= jx) { jumped = true; return FB({ left: true, up: true }); }
      return FB({ left: true });
    } }, 200, { sample: 0, tele: [{ f: 0, role: "fireboy", x: 800, feetY: 512 }] });
    const e = r.endSnap.fb;
    const onC = Math.abs(ft(e) - 384) < 5 && e.x > 500 && e.x < 690;
    console.log(`jx=${jx} endF=${r.endF} fb(${e.x.toFixed(1)},feet ${ft(e).toFixed(1)}) ${onC ? "ON-C" : "MISS"}`);
  }
});

run("BRIDGE", () => { // p0 桥 (384-480@386) 西端 → 跳上横梁 (256-352@256)
  console.log("== BRIDGE: 桥→横梁 ==");
  for (const jx of [412, 406, 400]) {
    let jumped = false;
    const r = replay(L, { ctrl: (w, f, s) => {
      if (f < 5) return {};
      if (!jumped && s.fb.x <= jx) { jumped = true; return FB({ left: true, up: true }); }
      return FB({ left: true });
    } }, 200, { sample: 0, tele: [{ f: 0, role: "fireboy", x: 470, feetY: 386 }] });
    const e = r.endSnap.fb;
    const onBeam = Math.abs(ft(e) - 256) < 4 && e.x > 250 && e.x < 360;
    console.log(`jx=${jx} endF=${r.endF} fb(${e.x.toFixed(1)},feet ${ft(e).toFixed(1)}) ${onBeam ? "ON-BEAM" : "MISS"}`);
  }
});

run("PILLAR", () => { // mesa 东档跳 → 立柱顶 (928-960@672) 落点窗
  console.log("== PILLAR: mesa→立柱顶 ==");
  for (const jx of [700, 680, 660, 640]) {
    let jumped = false;
    const r = replay(L, { ctrl: (w, f, s) => {
      if (f < 5) return {};
      if (!jumped && s.fb.x >= jx) { jumped = true; return FB({ right: true, up: true }); }
      return FB({ right: true });
    } }, 160, { sample: 0, tele: [{ f: 0, role: "fireboy", x: 450, feetY: 768 }] });
    const e = r.endSnap.fb;
    const onPillar = Math.abs(ft(e) - 672) < 4 && e.x > 920 && e.x < 966;
    const onMid = Math.abs(ft(e) - 640) < 4 && e.x > 830 && e.x < 930;
    const on768E = Math.abs(ft(e) - 768) < 4 && e.x > 926 && e.x < 1057;
    console.log(`jx=${jx} endF=${r.endF} fb(${e.x.toFixed(1)},feet ${ft(e).toFixed(1)}) ${onPillar ? "ON-PILLAR" : onMid ? "ON-640MID" : on768E ? "ON-768E" : "MISS"}`);
  }
});

run("P7", () => { // mid 顶 → p7 f0 顶 (929.9-958.1@416) → D 裙
  console.log("== P7: mid→p7顶→D ==");
  let ph = "run";
  const r = replay(L, { ctrl: (w, f, s) => {
    if (f < 5) return {};
    const c = s.fb;
    if (ph === "run") { if (c.x >= 900) { ph = "jump"; return FB({ up: true, right: true }); } return FB({ right: true }); }
    return FB({ right: true });
  } }, 260, { sample: 0, tele: [{ f: 0, role: "fireboy", x: 850, feetY: 512 }] });
  const e = r.endSnap.fb;
  const onD = Math.abs(ft(e) - 384) < 5 && e.x > 958 && e.x < 1240;
  console.log(`endF=${r.endF} fb(${e.x.toFixed(1)},feet ${ft(e).toFixed(1)}) ${onD ? "ON-D" : "MISS"}`);
});

run("P4CLIP", () => { // D 顶 x~1000 起跑到 x~1095 vx~90 起跳無输入 → p4 顶 (1166-1202)
  console.log("== P4CLIP: D→p4顶 ==");
  for (const jx of [1092, 1088, 1084]) {
    let ph = "run", jf = 0;
    const r = replay(L, { ctrl: (w, f, s) => {
      if (f < 5) return {};
      const c = s.fb;
      if (ph === "run") { if (c.x >= jx && Math.abs(c.vx) <= 105) { ph = "jump"; jf = 0; return FB({ up: true }); } return FB({ right: true }); }
      if (ph === "jump") { jf++; if (jf > 4) ph = "coast"; return FB({ up: true }); }
      return {};
    } }, 220, { sample: 0, tele: [{ f: 0, role: "fireboy", x: 1000, feetY: 384 }] });
    const e = r.endSnap.fb;
    const onP4 = Math.abs(ft(e) - 258) < 4 && e.x > 1160 && e.x < 1210;
    console.log(`jx=${jx} endF=${r.endF} fb(${e.x.toFixed(1)},feet ${ft(e).toFixed(1)}) ${onP4 ? "ON-P4" : "MISS"}`);
  }
});
