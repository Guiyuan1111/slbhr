// r17f 探针批3：fb 东链 S1-S4
import { replay, teleport, fmtP } from "./lib17.mjs";
const L = "forest_17";
const mode = process.argv[2] ?? "all";

// S1: mesa top → p2 f0 (704-800@641.9) 垂直跳+东漂
if (mode === "S1" || mode === "all") {
  console.log("== S1: mesa→p2 垂直跳扫描（tele 到 mesa x0，x>=jx 起跳，起跳后按右） ==");
  for (const jx of [620, 610, 600, 590, 580, 570, 560]) {
    let jumped = false;
    const r = replay(L, { ctrl: (w, f, s) => {
      if (f < 5) return {};
      if (!jumped) {
        if (s.fb.x >= jx) { jumped = true; return { fb: { right: true, up: true } }; }
        return { fb: { right: true } };
      }
      return { fb: { right: true } };
    } }, 200, { sample: 0, tele: [{ f: 0, role: "fireboy", x: 500, feetY: 768 }] });
    const e = r.endSnap.fb;
    const onP2 = e.y < 660 && e.x > 690 && e.x < 815;
    console.log(`jx=${jx} endF=${r.endF} fb(${e.x.toFixed(1)},${e.y.toFixed(1)}) v(${e.vx.toFixed(0)},${e.vy.toFixed(0)}) ${onP2 ? "ON-P2" : ""}`);
  }
}

// S2: p5 f0 (960-1056@641.9) → y512 mid 东缘 (角落啃边) 垂直跳+西漂
if (mode === "S2" || mode === "all") {
  console.log("== S2: p5→mid 西跳扫描（tele 到 p5，x<=jx 起跳，起跳后按左） ==");
  for (const jx of [1000, 995, 990, 985, 980, 975, 970]) {
    let jumped = false;
    const r = replay(L, { ctrl: (w, f, s) => {
      if (f < 5) return {};
      if (!jumped) {
        if (s.fb.x <= jx) { jumped = true; return { fb: { left: true, up: true } }; }
        return { fb: { left: true } };
      }
      return { fb: { left: true } };
    } }, 200, { sample: 0, tele: [{ f: 0, role: "fireboy", x: 1040, feetY: 641.9 }] });
    const e = r.endSnap.fb;
    const onMid = Math.abs(e.y - 476.5) < 8 && e.x > 850 && e.x < 975;
    console.log(`jx=${jx} endF=${r.endF} fb(${e.x.toFixed(1)},${e.y.toFixed(1)}) v(${e.vx.toFixed(0)},${e.vy.toFixed(0)}) ${onMid ? "ON-MID" : ""}`);
  }
}

// S3: mid top → p7 f0 顶 (930-958@416) +96 → D 坡
if (mode === "S3" || mode === "all") {
  console.log("== S3: mid→p7顶 垂直跳扫描（tele 到 mid x850，x>=jx 起跳，起跳后按右） ==");
  for (const jx of [946, 942, 938, 934, 930, 926, 922]) {
    let jumped = false;
    const r = replay(L, { ctrl: (w, f, s) => {
      if (f < 5) return {};
      if (!jumped) {
        if (s.fb.x >= jx) { jumped = true; return { fb: { right: true, up: true } }; }
        return { fb: { right: true } };
      }
      return { fb: { right: true } };
    } }, 200, { sample: 0, tele: [{ f: 0, role: "fireboy", x: 850, feetY: 512 }] });
    const e = r.endSnap.fb;
    const onD = e.y < 400 && e.x > 950 && e.x < 1250;
    console.log(`jx=${jx} endF=${r.endF} fb(${e.x.toFixed(1)},${e.y.toFixed(1)}) v(${e.vx.toFixed(0)},${e.vy.toFixed(0)}) ${onD ? "ON-D" : ""}`);
  }
}

// S4: D top → 爬坡 → p4 f0 顶 → block
if (mode === "S4" || mode === "all") {
  console.log("== S4: D→爬坡→p4 跳扫描（tele 到 D x1000，东行，x>=jx 跳上 p4） ==");
  for (const jx of [1140, 1136, 1132, 1128, 1124, 1120]) {
    let jumped = false;
    const r = replay(L, { ctrl: (w, f, s) => {
      if (f < 5) return {};
      if (!jumped) {
        if (s.fb.x >= jx) { jumped = true; return { fb: { right: true, up: true } }; }
        return { fb: { right: true } };
      }
      return { fb: { right: true, up: s.fb.y > 250 } };
    } }, 220, { sample: 0, tele: [{ f: 0, role: "fireboy", x: 1000, feetY: 384 }] });
    const e = r.endSnap.fb;
    const onP4 = e.y < 260 && e.x > 1110 && e.x < 1225;
    console.log(`jx=${jx} endF=${r.endF} fb(${e.x.toFixed(1)},${e.y.toFixed(1)}) v(${e.vx.toFixed(0)},${e.vy.toFixed(0)}) ${onP4 ? "ON-P4" : ""}`);
  }
}
