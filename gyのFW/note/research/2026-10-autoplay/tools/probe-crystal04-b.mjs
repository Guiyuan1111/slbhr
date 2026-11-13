// probe-crystal04-b.mjs — crystal_04 路线腿探针 B（fw-route-crystal04 槽，2026-11-01）
// 腿假设（地形 RLE + A 探针推导）：
//   L1 出生→r9 台西行滚落（r8 块 x928-960 顶 256 踏板）→ 续西 → 落 r20 平台（顶 640，x~810-980）
//   L2 平台 x608-640 跳上 r16 d19 楔（608-640，顶 ~528）→ 再跳漂东上 r15 架（640-768，顶 480）
//   L3 r15 架东行入 P2 带（x713-727，center 444.5）→ 传 P1（西墙 32,336）→ 西竖井坠落 → 底厅西地（896）
//   L4a fb 西地东行趟熔岩池（r28 x352-544）→ 岛（544-736）→ r25 d22 楔（704-736 顶 816）跳入 r24 熔岩带
//       （736-928 底 782.4）→ 东行 → 越东盖（928）落东地 → fb 门（1136-1200,y832-896）
//   L4b wg 西地东行止于熔岩前 → r25 d10 楔（320-352 顶 816）跳入 r24 水带（352-544 底 782.4）→ 东行
//       → 越东盖（544）落 d17 楔（544-576 顶 816）→ 岛 → 趟 r28 水池（736-928）→ 东地 → r25 d33 楔
//       （1056-1088 顶 816）→ r24 架（1088-1248 顶 768）→ wg 门（1136-1200,y704-768）
// 用法: node --import tsx note/research/2026-10-autoplay/tools/probe-crystal04-b.mjs [L1 L2 L3 L4 ...]
import { makeWorld } from "../../../../scripts/e2e/routetool/kernel.mjs";
import { NONE, S, S2, drive } from "../../../../scripts/e2e/routetool/botcore.mjs";

const LEVEL = "../../../data/crystal/levels/crystal_04";
const r1 = (v) => Math.round(v * 10) / 10;
const ds = (d) => (d > 0 ? "right" : "left");

function walkTo(d, xLine, vMax = 999) {
  return {
    name: `walkTo${d}${xLine}`,
    run: (c) => {
      const dx = c.me.x - xLine;
      const want = Math.abs(dx) <= 2 ? 0 : (dx > 0 ? -1 : 1);
      const vv = Math.abs(c.me.vx) > vMax ? 0 : want;
      return vv === 0 ? NONE : { ...NONE, [ds(vv)]: true };
    },
    done: (c) => (d > 0 ? c.me.x >= xLine : c.me.x <= xLine) && c.me.grounded,
  };
}

function report(r, tag, every = 20) {
  console.log(`[${tag}] result=${JSON.stringify(r.result)}`);
  const rows = r.trace;
  for (let i = 0; i < rows.length; i += every) {
    const t = rows[i];
    console.log(`  f${t.f} fb[${t.fb}]v${t.fbv} wg[${t.wg}]v${t.wgv}`);
  }
  const last = rows[rows.length - 1];
  if (last) console.log(`  END f${last.f} fb[${last.fb}] wg[${last.wg}]`);
}

// L1: 双人出生西行滚落到平台（错峰）
function L1() {
  const w = makeWorld(LEVEL);
  const r = drive(w, {
    fb: [S.sleep(3), walkTo(-1, 810, 999), S.sleep(60)],
    wg: [S.sleep(40), walkTo(-1, 850, 999), S.sleep(60)],
  }, 500, { traceAll: true });
  report(r, "L1-滚落到平台", 20);
}

// L2: fb 在平台跳 d19 → 跳漂上 r15 架（多组起跳线扫参）
function L2() {
  for (const line of [616, 622, 628, 634]) {
    const w = makeWorld(LEVEL);
    const r = drive(w, {
      fb: [S.sleep(3), walkTo(-1, 700, 999), walkTo(-1, line, 999), S.jumpDrift(1, 0, 900), S.sleep(40)],
      wg: [S.sleep(3), walkTo(-1, 900, 999), S.sleep(200)],
    }, 700, { traceAll: true });
    const last = r.trace[r.trace.length - 1];
    const apex = r.trace.reduce((m, t) => (t.fb[1] < m ? t.fb[1] : m), 999);
    console.log(`[L2 line=${line}] result=${JSON.stringify(r.result)} minFbY=${apex} end=fb[${last?.fb}] wg[${last?.wg}]`);
  }
}

// L3: L2 成功位直达测试：跳上 r15 架后东行入 P2 → 传 P1 → 竖井落底厅（观察 tp 与落点）
function L3() {
  const w = makeWorld(LEVEL);
  const tps = [];
  const r = drive(w, {
    fb: [S.sleep(3), walkTo(-1, 700, 999), walkTo(-1, 622, 999), S.jumpDrift(1, 0, 900), S.sleep(30), walkTo(1, 720, 999), S.sleep(150)],
    wg: [S.sleep(3), walkTo(-1, 900, 999), S.sleep(300)],
  }, 900, {
    traceAll: true,
    onFrame: () => {
      while (w.tpEvents?.length) {
        const e = w.tpEvents.shift();
        tps.push({ f, ...e });
      }
    },
  });
  report(r, "L3-P2→P1→竖井", 20);
  console.log("  tpEvents:", JSON.stringify(tps));
}

// L4: 底厅双池横穿（直接放置不可行——从 L3 续；此处只测底厅地板段与楔跳）：
//     假设 L3 后 fb 落 ~x100；先测 fb: 西地东行趟熔岩 → 岛 → d22 楔跳 → 熔岩带东行 → 越盖 → 东地
function L4() {
  const w = makeWorld(LEVEL);
  const r = drive(w, {
    // fb: 传送后落西地 → 一路东（趟熔岩池 352-544）→ 岛 → 跳 d22(704-736 顶 816) → 跳东入熔岩带 → 东行 → 越盖 928
    fb: [S.sleep(3), walkTo(-1, 700, 999), walkTo(-1, 622, 999), S.jumpDrift(1, 0, 900), S.sleep(30), walkTo(1, 720, 999), S.sleep(120),
      walkTo(1, 600, 999), S.sleep(20), S.jumpOnto(1, 820), S.sleep(20), S.jumpDrift(1, 0, 60), walkTo(1, 940, 999), S.sleep(80)],
    wg: [S.sleep(3), walkTo(-1, 900, 999), S.sleep(600)],
  }, 1500, { traceAll: true });
  report(r, "L4-fb底厅东征", 30);
}

// L5: wg 底厅：西地东行止 340 → d10 楔跳 → 水带东行 → 越盖落 d17 → 岛 → 水池 → 东地 → d33 → r24 架 → wg 门
function L5() {
  const w = makeWorld(LEVEL);
  const r = drive(w, {
    fb: [S.sleep(3), walkTo(-1, 700, 999), walkTo(-1, 622, 999), S.jumpDrift(1, 0, 900), S.sleep(30), walkTo(1, 720, 999), S.sleep(150),
      walkTo(1, 600, 999), S.sleep(20), S.jumpOnto(1, 820), S.sleep(20), S.jumpDrift(1, 0, 60), walkTo(1, 1168, 999), S.sleep(200)],
    wg: [S.sleep(3), walkTo(-1, 700, 999), walkTo(-1, 622, 999), S.jumpDrift(1, 0, 900), S.sleep(30), walkTo(1, 720, 999), S.sleep(150),
      walkTo(1, 336, 999), S.sleep(20), S.jumpOnto(1, 820), S.sleep(20), S.jumpDrift(1, 0, 60), walkTo(1, 540, 999),
      S.sleep(40), walkTo(1, 900, 999), S.sleep(60), S.jumpOnto(1, 820), S.sleep(20), S.jumpDrift(1, 0, 60), walkTo(1, 1168, 999), S.sleep(150)],
  }, 2400, { traceAll: true });
  report(r, "L5-双人全链", 40);
}

const cases = { L1, L2, L3, L4, L5 };
for (const name of process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(cases)) {
  cases[name]();
}
