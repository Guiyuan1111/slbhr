// probe-crystal04-a.mjs — crystal_04 行为探针 A（fw-route-crystal04 槽，2026-11-01）
// kernel 只读调用（level 走 ../../../data/crystal/levels/crystal_04 路径技巧，绕过 LEVELS_DIRS
// 缺 crystal 目录的管线缺口，不改内核）；botcore.drive 原语程序直跑 + traceAll/onFrame 遥测。
// 用法: node --import tsx note/research/2026-10-autoplay/tools/probe-crystal04-a.mjs [case...]
import { makeWorld } from "../../../../scripts/e2e/routetool/kernel.mjs";
import { NONE, S, S2, drive } from "../../../../scripts/e2e/routetool/botcore.mjs";

const LEVEL = "../../../data/crystal/levels/crystal_04";
const r1 = (v) => Math.round(v * 10) / 10;
const ds = (d) => (d > 0 ? "right" : "left");

/** walkTo（autosearch PRIM_TABLE 同语义本地拷贝，仅供探针；词表正本在 autosearch 内） */
function walkTo(d, xLine, vMax = 70) {
  let cur = 0;
  return {
    name: `walkTo${d}${xLine}`,
    run: (c) => {
      const dx = c.me.x - xLine;
      const want = Math.abs(dx) <= 2 ? 0 : (dx > 0 ? -1 : 1);
      const vv = Math.abs(c.me.vx) > vMax ? 0 : want;
      cur = vv;
      return vv === 0 ? NONE : { ...NONE, [ds(vv)]: true };
    },
    done: (c) => (d > 0 ? c.me.x >= xLine : c.me.x <= xLine) && c.me.grounded,
  };
}

/** 终局摘要 + 采样帧过滤输出 */
function report(r, tag, every = 20) {
  console.log(`[${tag}] result=${JSON.stringify(r.result)}`);
  const rows = r.trace.filter((_, i) => i % every === 0);
  for (const t of rows) console.log(`  f${t.f} fb[${t.fb}] fbv[${t.fbv}] wg[${t.wg}] wgv[${t.wgv}]`);
}

// A1 出生→r9 台西缘走落：落点/落层取证（错峰 30f）
function a1() {
  const w = makeWorld(LEVEL);
  const r = drive(w, {
    fb: [S.sleep(3), walkTo(-1, 940, 999), S.sleep(80)],
    wg: [S.sleep(33), walkTo(-1, 940, 999), S.sleep(80)],
  }, 400, { traceAll: true });
  report(r, "A1-走落", 10);
}

// A2 平台上东行 P3 未压钮（关门假墙钉点取证）
function a2() {
  const w = makeWorld(LEVEL);
  const r = drive(w, {
    fb: [S.sleep(3), walkTo(-1, 940, 999), walkTo(1, 1220, 999), S.sleep(60)],
    wg: [S.sleep(3), walkTo(-1, 1000, 999), S.sleep(200)],
  }, 500, { traceAll: true });
  report(r, "A2-P3假墙", 20);
}

// A3 压钮 b0：fb 站上钮(944,640)，采样 pusher/portals/platform 时序；wg 西缘驻留
function a3() {
  const w = makeWorld(LEVEL);
  const rows = [];
  const r = drive(w, {
    fb: [S.sleep(3), walkTo(-1, 940, 999), walkTo(1, 944, 999), S.sleep(300)],
    wg: [S.sleep(3), walkTo(-1, 1000, 999), S.sleep(300)],
  }, 500, {
    traceAll: true,
    onFrame: (f) => {
      if (f % 10) return;
      const M = w.mechSnapshot();
      rows.push({ f, push: M.pushers[0]?.state, lev: M.levers[0]?.state,
        plat: M.platforms[0] ? [+r1(M.platforms[0].y), M.platforms[0].state] : null,
        por: M.portals.map((p) => p.state).join(""), ph: w.phase });
    },
  });
  console.log(`[A3-压钮] result=${JSON.stringify(r.result)}`);
  for (const t of r.trace.filter((_, i) => i % 20 === 0)) console.log(`  f${t.f} fb[${t.fb}] wg[${t.wg}]`);
  console.log("A3 mech 时序（每 10f 去重）:");
  let prev = "";
  for (const m of rows) {
    const line = JSON.stringify(m);
    if (line !== prev) { console.log(" ", line); prev = line; }
  }
}

// A4 拉杆：fb 压钮保持 P3/P5 开，wg 东行入 P3 →P5 出口落 r13 → 东行碰杆 l0 → 采样 p0 时序
function a4() {
  const w = makeWorld(LEVEL);
  const rows = [];
  const r = drive(w, {
    fb: [S.sleep(3), walkTo(-1, 940, 999), walkTo(1, 944, 999), S.sleep(600)],
    wg: [S.sleep(3), walkTo(-1, 940, 999), walkTo(1, 1215, 999), S.sleep(30), walkTo(1, 1135, 999), S.sleep(200)],
  }, 900, {
    traceAll: true,
    onFrame: (f) => {
      if (f % 10) return;
      const M = w.mechSnapshot();
      rows.push({ f, push: M.pushers[0]?.state, lev: M.levers[0]?.state,
        plat: M.platforms[0] ? [+r1(M.platforms[0].y), M.platforms[0].state] : null,
        por: M.portals.map((p) => p.state).join(""), ph: w.phase });
    },
  });
  console.log(`[A4-压钮+传送+拉杆] result=${JSON.stringify(r.result)}`);
  for (const t of r.trace.filter((_, i) => i % 20 === 0)) console.log(`  f${t.f} fb[${t.fb}] wg[${t.wg}]`);
  console.log("A4 mech 时序（每 10f 去重）:");
  let prev = "";
  for (const m of rows) {
    const line = JSON.stringify(m);
    if (line !== prev) { console.log(" ", line); prev = line; }
  }
}

const cases = { a1, a2, a3, a4 };
for (const name of process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(cases)) {
  cases[name]();
}
