/**
 * P-03 forest_14 整关路线 bot v6：全部发射位按扫参窗口定值。
 * 脊柱：spawn→(170)→island1(304)→py24(480)→island2(710)→py23(880)→r25e(1100)→
 *   r22e(1180)→r19e(1030)→r18e(880/896)→[缝降 r19mid→620]→r17→(wg d13@600 / fb d5 途中)
 *   →slideLeft→r20(80)→风井→斜坡→runway(288d7/300)→r14→mega(d8/d11)→roman(870/1100/1035→冲跳)
 *   →高台(d9/d10)→(340)西降→r13岛→runway(292/305)→终跳→门。
 * 运行：node --import tsx TEMP/p03r/bot14.mjs [--log]
 */
import { writeFileSync } from "node:fs";
import { makeWorld } from "../../../../../scripts/e2e/routetool/kernel.mjs";
import { NONE, S, S2, drive, toRouteDoc } from "../../../../../scripts/e2e/routetool/botcore.mjs";

const logSteps = process.argv.includes("--log");
const HALF = 35.5;

/** 定点跳：先无输入刹停，再 dir+up 起跳，持 dir holdF，落地且慢速完成 */
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

/** 持左走进风柱：步行西行被风抓离地后继续压左到 x<100（保证升程穿过钻区 x[68,91]） */
const windEnter = () => ({ name: "windEnter", run: () => ({ ...NONE, left: true }), done: (c) => !c.me.grounded && c.me.x < 100 });
/** 风升：无输入直到接近柱顶（feet<415；早漂会被强风段阻尼困死） */
const windRise = (yHi) => ({ name: "wind<" + yHi, run: () => NONE, done: (c) => c.me.y + HALF < yHi });
/** 柱顶东漂出柱：持右直到落定坡带（feet>380 防门控卡死） */
const windDrift = () => ({
  name: "windDrift",
  run: () => ({ ...NONE, right: true }),
  done: (c) => c.me.y + HALF > 380 && Math.abs(c.me.vy) < 6 && c.me.grounded && c.me.x > 155,
});

/** roman 冲板跳：持左西冲，窗口内起跳 */
function plankJump(minX, maxX, maxFeet, name = "plankJ") {
  let jumped = false, air = false;
  return {
    name,
    run(c) {
      if (!jumped) {
        const f = c.me.y + HALF;
        if (c.me.x < maxX && c.me.x > minX && f < maxFeet && f > 190) { jumped = true; return { ...NONE, left: true, up: true }; }
        return { ...NONE, left: true };
      }
      return { ...NONE, left: true };
    },
    done(c) { if (!c.me.grounded) air = true; return jumped && air && c.me.grounded && c.me.vy >= -8; },
  };
}

/** 终跳：走到 x0 刹停，left+up 60f，落门台完成 */
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

/** +19 板东坡冲刺中段起跳直达 NE 台：窗口 (minX,maxX) 且 feet<maxFeet */
function plankSprintJump(minX, maxX, maxFeet, name = "sprintJ") {
  let jumped = false, air = false;
  return {
    name,
    run(c) {
      if (!jumped) {
        const f = c.me.y + HALF;
        if (c.me.x > minX && c.me.x < maxX && f < maxFeet && f > 190 && c.me.grounded) { jumped = true; return { ...NONE, right: true, up: true }; }
        return { ...NONE, right: true };
      }
      return { ...NONE, right: true };
    },
    done(c) { if (jumped && !c.me.grounded) air = true; return air && c.me.grounded && c.me.vy >= -8 && c.me.y + HALF < 220; },
  };
}

const standDoor = (x) => ({
  name: "door" + x,
  run(c) { const d = x - c.me.x; if (Math.abs(d) < 4) return NONE; return d > 0 ? { ...NONE, right: true } : { ...NONE, left: true }; },
  done: () => false,
});

/** 持右东渡：走/被运到板东坡→过枢轴→被倒东端平台上（x>1060 落定） */
const crossEast = () => ({
  name: "crossE",
  run: () => ({ ...NONE, right: true }),
  done: (c) => c.me.x > 1060 && c.me.grounded && Math.abs(c.me.vx) < 6 && Math.abs(c.me.vy) < 6,
});

const slideLeft = (targetY, limitX) => ({
  name: "slideL<" + targetY,
  run: () => ({ ...NONE, left: true }),
  done: (c) => c.me.y + HALF > targetY && c.me.grounded && c.me.x < limitX,
});

const go = (x, tol = 10) => S.goTo(x, tol);
const END = () => ({ name: "END", run: () => NONE, done: () => false });

// ---------------- wg 全程（领前 solo）----------------
const wg = [
  S.sleep(14, "settle"),
  go(170), hopTo("right", 42, "j-island1"),   // → ~316
  go(304),                                    // d0 + 发射位
  hopTo("right", 42, "j-py24"),               // 304 → ~492
  go(480),                                    // 岛心
  hopTo("right", 42, "j-island2"),            // → ~663
  go(710, 6),                                 // d1 途中 + 安全窗 [704,720]
  hopTo("right", 42, "j-py23"),               // → 827 缘
  go(880, 6),                                 // 立即东行离缘（安全窗 [868,892]）
  hopTo("right", 42, "j-r25e"),               // → ~1035
  go(1100, 6),                                // 檐外发射位
  hopTo("right", 48, "j-r22e"),               // → ~1200
  go(1200),
  hopTo("left", 48, "j-r19e"),                // → ~1006
  go(1030),
  hopTo("left", 42, "j-r18e"),                // → ~889
  go(896),                                    // d14 途中
  hopTo("left", 42, "j-gap"),                 // → r19mid ~746@608
  go(620),                                    // 西行到 probe11 位
  hopTo("left", 42, "j-r17"),                 // → ~516@544
  go(600, 8),                                 // 东行采 d13（r17 东坡）
  go(240),
  slideLeft(630, 170),                        // 连滑到 r20
  windEnter(),
  windRise(415),                              // d12 途中
  windDrift(),
  go(300),
  go(314),
  S2.edgeDrop("right", 8, "drop-r14"),
  go(448),                                    // d11（r14 台上站采）
  go(620),
  S.wait((c) => c.other.x > 580 && c.other.grounded && Math.abs(c.other.vx) < 80, "sync-fb"),
  S.sleep(75, "cross-delay"),
  crossEast(),                                // tandem 东渡（后被倒 ~1137）
  go(1020),                                   // 站上板东面：活锚（助 fb 链稳）
  S.wait((c) => c.other.y + HALF < 220 && c.other.x < 620, "fb-escaped"),
  hopTo("left", 22, "chain1"),                // → ~1017,384
  hopTo("left", 22, "chain2"),                // → ~917,350
  hopTo("left", 22, "chain3"),                // → ~816,316
  hopTo("left", 16, "chain4"),                // → ~730,312（缩短防漂过）
  hopTo("left", 14, "chain5"),                // → ~672,286 板尖区（短跳）
  hopTo("left", 60, "tip-jump"),              // → ~470,192 高台（全漂移深内，越缘高35px+）
  go(504),                                    // d10
  go(330, 6),
  S2.edgeDrop("left", 8, "drop-west"),        // 西缘落 r12 跑道
  go(305),
  launch(305),
  standDoor(192),
  END(),
];

// ---------------- fb（延后串行）----------------
const fb = [
  S.sleep(96, "settle+buffer"),
  go(170), hopTo("right", 42, "j-island1"),
  go(304),
  hopTo("right", 42, "j-py24"),
  go(480),                                    // d2 站采
  hopTo("right", 42, "j-island2"),
  go(710, 6),
  hopTo("right", 42, "j-py23"),
  go(880, 6),                                 // d3 途中
  hopTo("right", 42, "j-r25e"),
  go(1100, 6),
  hopTo("right", 48, "j-r22e"),
  go(1200),
  hopTo("left", 48, "j-r19e"),
  go(1030),
  hopTo("left", 42, "j-r18e"),
  go(880),
  hopTo("left", 42, "j-gap-d4"),              // d4 早弧
  go(620),
  hopTo("left", 42, "j-r17"),
  go(246),
  slideLeft(630, 170),                        // d5 途中（r18isl@576 x~200）
  S.wait((c) => c.other.x > 200, "sync-wind"),
  windEnter(),
  windRise(415),                              // d6
  windDrift(),
  go(300),                                    // d7@288 途中
  go(314),
  S2.edgeDrop("right", 8, "drop-r14"),
  go(620),                                    // d8@608 途中
  crossEast(),                                // tandem 东渡（先被倒 ~1137）
  hopTo("left", 22, "chain1"),                // → ~1017,384
  hopTo("left", 22, "chain2"),                // → ~917,350
  hopTo("left", 22, "chain3"),                // → ~816,316
  hopTo("left", 16, "chain4"),                // → ~730,312（缩短防漂过）
  hopTo("left", 14, "chain5"),                // → ~672,286 板尖区（短跳）
  hopTo("left", 60, "tip-jump"),              // → ~470,192 高台（全漂移深内，越缘高35px+）
  go(352),                                    // d9
  go(330, 6),
  S2.edgeDrop("left", 8, "drop-west"),
  go(292),
  launch(292),
  standDoor(96),
  END(),
];

const w = makeWorld("forest_14");
const TOTAL = 7200;
let doorWgF = -1;
const r = drive(w, { fb, wg }, TOTAL, {
  logSteps,
  traceEvery: 10,
  onFrame(f) {
    if (doorWgF < 0) {
      const s = w.snapshotPlayer("watergirl");
      if (Math.abs(s.x - 192) < 5 && s.y + HALF < 300) doorWgF = f;
    }
    if (f >= 1400 && f <= 2000 && f % 10 === 0) {
      const s = w.snapshotPlayer("watergirl");
      const b = w.snapshotPlayer("fireboy");
      const a = (-w.mechs.romans[0].bar.GetAngle() * 180 / Math.PI).toFixed(0);
      console.log("[dia] f" + f, "wg", s.x.toFixed(0), (s.y + HALF).toFixed(0), "| fb", b.x.toFixed(0), (b.y + HALF).toFixed(0), "a" + a);
    }
  },
});
console.log("result:", JSON.stringify(r.result), "wg-door@f" + doorWgF);
const missing = w.built.diamonds.filter((d) => !d.collected).map((d) => d.id);
console.log("diamonds missing:", missing.join(",") || "15/15 ALL");
console.log("phase:", w.phase);
const fbS = w.snapshotPlayer("fireboy"), wgS = w.snapshotPlayer("watergirl");
console.log("fb:", fbS.x.toFixed(0), (fbS.y + HALF).toFixed(0), "atDoor", fbS.atDoor, "| wg:", wgS.x.toFixed(0), (wgS.y + HALF).toFixed(0), "atDoor", wgS.atDoor);
if (r.result.won) {
  const doc = toRouteDoc("forest_14", r.events, r.result.winF + 5, "p03-hand-bot-v10");
  writeFileSync("TEMP/p03r/route.json", JSON.stringify(doc, null, 1));
  console.log("WIN →", "TEMP/p03r/route.json", "winF", r.result.winF, "events", doc.fb.length, "+", doc.wg.length);
} else {
  writeFileSync("TEMP/p03r/trace.fail.json", JSON.stringify(r.trace));
  console.log("FAIL trace → TEMP/p03r/trace.fail.json");
}
