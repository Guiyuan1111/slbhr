/**
 * P-03 forest_14_1 路线 bot（循环梯子版）：
 * 脊柱与 14 相同至 r14；终段=双人循环抬升梯子（无塔/无箱/无NE）。
 * 时序：fb站668 → wg渡[26,26,36]（翻板+fb抬起）→ fb跳台[56]采d9 →
 *  wg泵复位[22,22]+站670 → fb东降(576)回归620 → fb再渡[26,26,36]（wg抬起）
 *  → wg跳台[56]采d10 → wg西降终跳 → fb泵复位[22,22]+西走离 → 西路→终跳。
 * 运行：node --import tsx TEMP/p03r/bot14b.mjs [--log]
 */
import { writeFileSync } from "node:fs";
import { makeWorld } from "../../../../../scripts/e2e/routetool/kernel.mjs";
import { NONE, S, S2, drive, toRouteDoc } from "../../../../../scripts/e2e/routetool/botcore.mjs";

const logSteps = process.argv.includes("--log");
const HALF = 35.5;

function hopTo(dir, holdF, name = "hop" + dir + holdF) {
  let phase = 0, t = 0, air = false, pad = 0;
  return {
    name,
    run(c) {
      if (phase === 0) {
        if (c.me.grounded && Math.abs(c.me.vx) < 12 && Math.abs(c.me.vy) < 12) { if (++pad >= 7) { phase = 1; t = 0; return { ...NONE, [dir]: true, up: true }; } return NONE; }
        pad = 0;
        return NONE;
      }
      t++;
      return t <= holdF ? { ...NONE, [dir]: true } : NONE;
    },
    done(c) { if (phase === 1 && !c.me.grounded) air = true; return air && c.me.grounded && c.me.vy >= -8 && Math.abs(c.me.vx) < 40; },
  };
}

const windEnter = () => ({ name: "windEnter", run: () => ({ ...NONE, left: true }), done: (c) => !c.me.grounded && c.me.x < 100 });
const windRise = (yHi) => ({ name: "wind<" + yHi, run: () => NONE, done: (c) => c.me.y + HALF < yHi });
const windDrift = () => ({
  name: "windDrift",
  run: () => ({ ...NONE, right: true }),
  done: (c) => c.me.y + HALF > 380 && Math.abs(c.me.vy) < 6 && c.me.grounded && c.me.x > 155,
});

function launch(x0, name = "launch" + x0) {
  let phase = 0, t = 0;
  return {
    name,
    run(c) {
      if (phase === 0) {
        const d = x0 - c.me.x;
        if (Math.abs(d) <= 5 && c.me.grounded && Math.abs(c.me.vx) < 12) { phase = 1; t = 0; return { ...NONE, left: true, up: true }; }
        return d > 0 ? { ...NONE, right: true } : { ...NONE, left: true };
      }
      t++;
      return t <= 60 ? { ...NONE, left: true, up: true } : NONE;
    },
    done: (c) => phase === 1 && t > 60 && c.me.grounded && c.me.y + HALF < 300 && Math.abs(c.me.vy) < 8,
  };
}

const standDoor = (x) => ({
  name: "door" + x,
  run(c) { const d = x - c.me.x; if (Math.abs(d) < 4) return NONE; return d > 0 ? { ...NONE, right: true } : { ...NONE, left: true }; },
  done: () => false,
});

const slideLeft = (targetY, limitX) => ({
  name: "slideL<" + targetY,
  run: () => ({ ...NONE, left: true }),
  done: (c) => c.me.y + HALF > targetY && c.me.grounded && c.me.x < limitX,
});

const go = (x, tol = 10) => S.goTo(x, tol);
const END = () => ({ name: "END", run: () => NONE, done: () => false });
/** 乘行起跳：feet<yHi 且 grounded 即跳（无 vy 门——乘升面 vy 大是常态）持左 56f */
function liftJump(yHi, name = "liftJump" + yHi) {
  let jumped = false, air = false, pad = 0;
  return {
    name,
    run(c) {
      if (!jumped) {
        const f = c.me.y + HALF;
        if (c.me.grounded && f < yHi && f > 200) { if (++pad >= 4) { jumped = true; return { ...NONE, left: true, up: true }; } return NONE; }
        pad = 0;
        return NONE;
      }
      return { ...NONE, left: true };
    },
    done(c) { if (jumped && !c.me.grounded) air = true; return air && c.me.grounded && c.me.vy >= -8; },
  };
}
/** 高台东降：走到东缘东掉落 SLP_A/mega */
const dropEast = () => S2.edgeDrop("right", 10, "dropE");
/** 持左走离板西端（+19 西面下坡走到 mega） */
const walkOffWest = () => ({
  name: "walkOffW",
  run: () => ({ ...NONE, left: true }),
  done: (c) => c.me.grounded && c.me.x < 640 && c.me.y + HALF > 400,
});

// ---------------- wg：脊柱 + C1 渡 + 泵复位等待 + C2 被抬 + 跳台 + 终局 ----------------
const wg = [
  S.sleep(14, "settle"),
  go(170), hopTo("right", 42, "j-island1"),
  go(304),
  hopTo("right", 42, "j-py24"),
  go(480),
  hopTo("right", 42, "j-island2"),
  go(716, 4),
  hopTo("right", 44, "j-py23"),
  go(886, 4),
  hopTo("right", 42, "j-r25e"),
  go(1100, 6),
  hopTo("right", 48, "j-r22e"),
  go(1200),
  hopTo("left", 48, "j-r19e"),
  go(1030),
  hopTo("left", 42, "j-r18e"),
  go(896),
  hopTo("left", 42, "j-gap"),
  go(620),
  hopTo("left", 42, "j-r17"),
  go(600, 8),
  go(240),
  slideLeft(630, 170),
  windEnter(),
  windRise(415),
  windDrift(),
  go(300),
  go(314),
  S2.edgeDrop("right", 8, "drop-r14"),
  go(448),
  go(620),
  S.wait((c) => c.other.x > 655 && c.other.x < 690 && c.other.grounded, "sync-fb-stand"),
  // C1：wg 渡（fb 被₁抬起）
  hopTo("right", 26, "c1-1"),
  hopTo("right", 26, "c1-2"),
  hopTo("right", 36, "c1-3"),
  // 泵复位 + 回等待位 670
  hopTo("left", 22, "pump-1"),
  hopTo("left", 22, "pump-2"),
  go(670),
  // 等 fb 回归再渡（C2）→ 自己被抬起
  liftJump(292, "wg-tip"),
  go(504),                                    // d10
  go(330, 6),
  S2.edgeDrop("left", 8, "drop-r13isl"),
  S2.edgeDrop("left", 8, "drop-runway"),
  go(305),
  launch(305),
  standDoor(192),
  END(),
];

// ---------------- fb：脊柱 + 站668被抬 + 跳台d9 + 东降回归 + C2 渡 + 泵复位西走 + 终局 ----------------
const fb = [
  S.sleep(96, "settle+buffer"),
  go(170), hopTo("right", 42, "j-island1"),
  go(304),
  hopTo("right", 42, "j-py24"),
  go(480),                                    // d2
  hopTo("right", 42, "j-island2"),
  go(716, 4),
  hopTo("right", 44, "j-py23"),
  go(886, 4),                                 // d3 途中
  hopTo("right", 42, "j-r25e"),
  go(1100, 6),
  hopTo("right", 48, "j-r22e"),
  go(1200),
  hopTo("left", 48, "j-r19e"),
  go(1030),
  hopTo("left", 42, "j-r18e"),
  go(880),
  hopTo("left", 42, "j-gap-d4"),
  go(620),
  hopTo("left", 42, "j-r17"),
  go(246),
  slideLeft(630, 170),                        // d5 途中
  S.wait((c) => c.other.x > 200, "sync-wind"),
  windEnter(),
  windRise(415),                              // d6
  windDrift(),
  go(300),                                    // d7@288 途中
  go(314),
  S2.edgeDrop("right", 8, "drop-r14"),
  go(620),                                    // d8@608 途中
  go(668),                                    // 站位（C1 被抬者）
  liftJump(292, "fb-tip"),                    // wg 渡 → 翻板抬升 → 乘行起跳上高台
  go(352),                                    // d9
  // 等 wg 泵复位+站回 670
  S.wait((c) => c.other.x < 700 && c.other.y + 35.5 > 370 && c.other.grounded, "sync-wg-stand"),
  go(565),
  dropEast(),                                 // 高台东缘落 SLP_A/mega
  go(620),
  // C2：fb 再渡（wg 被抬起）
  hopTo("right", 26, "c2-1"),
  hopTo("right", 26, "c2-2"),
  hopTo("right", 36, "c2-3"),
  // 泵复位 + 西走离板
  hopTo("left", 22, "fp-1"),
  hopTo("left", 22, "fp-2"),
  walkOffWest(),                              // +19 西面下坡走离到 mega
  slideLeft(445, 420),                        // 持西下坡 SLP_A→r14 至中西段落定
  go(292),                                    // 续西落 r12 跑道
  launch(292),
  standDoor(96),
  END(),
];

const w = makeWorld(process.env.LVL ?? "forest_14_1");
const TOTAL = 7200;
let doorWgF = -1;
const r = drive(w, { fb, wg }, TOTAL, {
  logSteps,
  onFrame(f) {
    if ((f >= 1600 && f <= 1800) || (f >= 2280 && f <= 2500)) {
      if (f % 10 === 0) {
        const a = w.snapshotPlayer("fireboy"), b = w.snapshotPlayer("watergirl");
        console.log("[tip] f" + f, "fb", a.x.toFixed(0), (a.y + HALF).toFixed(0), "| wg", b.x.toFixed(0), (b.y + HALF).toFixed(0), "a" + (-w.mechs.romans[0].bar.GetAngle() * 180 / Math.PI).toFixed(0));
      }
    }
    if (doorWgF < 0) {
      const s = w.snapshotPlayer("watergirl");
      if (Math.abs(s.x - 192) < 5 && s.y + HALF < 300) doorWgF = f;
    }
  },
});
console.log("result:", JSON.stringify(r.result), "wg-door@f" + doorWgF);
const missing = w.built.diamonds.filter((d) => !d.collected).map((d) => d.id);
console.log("diamonds missing:", missing.join(",") || "15/15 ALL");
const fbS = w.snapshotPlayer("fireboy"), wgS = w.snapshotPlayer("watergirl");
console.log("fb:", fbS.x.toFixed(0), (fbS.y + HALF).toFixed(0), "atDoor", fbS.atDoor, "| wg:", wgS.x.toFixed(0), (wgS.y + HALF).toFixed(0), "atDoor", wgS.atDoor);
if (r.result.won) {
  const doc = toRouteDoc(process.env.LVL ?? "forest_14_1", r.events, r.result.winF + 5, "p03-ladder-bot-v1");
  writeFileSync("TEMP/p03r/route.L.json", JSON.stringify(doc, null, 1));
  console.log("WIN →", "TEMP/p03r/route.L.json", "winF", r.result.winF, "events", doc.fb.length, "+", doc.wg.length);
} else {
  writeFileSync("TEMP/p03r/traceb.fail.json", JSON.stringify(r.trace ?? []));
  console.log("FAIL");
}
