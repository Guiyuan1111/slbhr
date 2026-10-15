// r17f 探针批1：fb 底部爬梯 R1-R3
import { replay, teleport, fmtP } from "./lib17.mjs";
const L = "forest_17";
const mode = process.argv[2] ?? "all";

// ---- R1b: 裙坡墙角跳 +64（扫描起跳点：东行中 x>=jx 时跳）
if (mode === "R1" || mode === "all") {
  console.log("== R1b: 墙角跳扫描 ==");
  for (const jx of [366, 362, 358, 354, 350]) {
    let jumped = false;
    const r = replay(L, { ctrl: (w, f, s) => {
      if (f < 5) return {};
      if (!jumped) {
        if (s.fb.x >= jx) { jumped = true; return { fb: { right: true, up: true } }; }
        return { fb: { right: true } };
      }
      return { fb: { right: true, up: s.fb.y > 790 } };
    } }, 300, { sample: 0 });
    const e = r.endSnap.fb;
    const ok = e.x > 400 && Math.abs(e.y - 824.5) < 8;
    console.log(`jx=${jx} endF=${r.endF} fb(${e.x.toFixed(1)},${e.y.toFixed(1)}) v(${e.vx.toFixed(0)},${e.vy.toFixed(0)}) ${ok ? "MESATOP" : ""}`);
  }
}

// ---- R2: mesa→p10 平跳西（160px 缝，同高平跳）
if (mode === "R2" || mode === "all") {
  console.log("== R2: mesa 顶出发全速西行，x<=jx 起跳 ==");
  for (const jx of [414, 412, 410, 408, 406, 404, 402]) {
    let jumped = false;
    const r = replay(L, {
        ctrl: (w, f, s) => {
        if (f < 5) return {};
        if (!jumped) {
          if (s.fb.x <= jx) { jumped = true; return { fb: { left: true, up: true } }; }
          return { fb: { left: true } };
        }
        return { fb: { left: true, up: s.fb.y > 700 } };
      },
    }, 220, { sample: 0, tele: [{ f: 0, role: "fireboy", x: 700, feetY: 768 }] });
    const e = r.endSnap.fb;
    const onP10 = e.x >= 140 && e.x <= 270 && Math.abs(e.y - 724.5) < 8;
    console.log(`jx=${jx} endF=${r.endF} fb(${e.x.toFixed(1)},${e.y.toFixed(1)}) v(${e.vx.toFixed(0)},${e.vy.toFixed(0)}) ${onP10 ? "ON-P10/768W" : ""}`);
  }
}

// ---- R3: 768W (顶768, x0-128) → 裙坡(96,672)->(128,640) → 640W slab（顶640）
if (mode === "R3" || mode === "all") {
  console.log("== R3: 768W 东行上裙坡跳 ==");
  for (const jx of [100, 94, 88, 82, 76, 70, 64]) {
    let jumped = false;
    const r = replay(L, {
        ctrl: (w, f, s) => {
        if (f < 5) return {};
        if (!jumped) {
          if (s.fb.x >= jx) { jumped = true; return { fb: { up: true } }; }
          return { fb: { right: true } };
        }
        return { fb: { right: s.fb.y < 660, up: s.fb.y > 660 && s.fb.vy < -200 } };
      },
    }, 200, { sample: 0, tele: [{ f: 0, role: "fireboy", x: 40, feetY: 768 }] });
    const e = r.endSnap.fb;
    const on640 = Math.abs(e.y - 596.5) < 10 && e.x > 120 && e.x < 400;
    console.log(`jx=${jx} endF=${r.endF} fb(${e.x.toFixed(1)},${e.y.toFixed(1)}) v(${e.vx.toFixed(0)},${e.vy.toFixed(0)}) ${on640 ? "ON-640W" : ""}`);
  }
}
