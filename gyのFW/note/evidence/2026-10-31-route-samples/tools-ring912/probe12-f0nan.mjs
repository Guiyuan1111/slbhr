// 主会话 f0 NaN 考证直测（2026-11-01）——06号档 §7 附带发现「首帧按键=NaN 力永久毒化」的勘误探针
// 结论（三方实证：本件 + TEMP 内联直读 + oracle 原件对拍）：
//   1) NaN 力被 character.ts:297-298 的 i.x 比较守卫丢弃——oracle init.beautified.js @63321-63330
//      逐字同构（if (i.x > 0 && u.x < maxSpeed) / if (i.x < 0 && u.x > -maxSpeed)，NaN 比较恒
//      false ⇒ ApplyForce 从不被 NaN 调用 ⇒ 物理永不被毒化）。
//   2) 实测语义（forest_01，f0 起按右 45f → 松 3f → 再按右 45f）：f0-30 冻结（crf=undefined，
//      NaN 力丢弃；f0 未接地帧空气分支 floatForce 给 +0.1px 微推）→ ~f36 体睡眠（零速 0.5s
//      Box2D 正常睡眠，内联 IsAwake 直读实测）→ f48 起恢复（松键帧 else 分支初始化
//      currentRunForce=0.475·s，再按真实力唤醒睡眠体）→ xEnd=232.9 复跑逐位一致。
//   3) 与 params.ts:60 注记「初值 undefined 是原版事实——首按不发力，松键→0.475·runForce 初始化」
//      完全吻合 ⇒ 内核零缺陷、不改内核；配方 sleep(3) 前缀仍是正确实用规避（避免开场冻结），
//      但「NaN 永久毒化」机理注记按本件更正。
// 注：本件用 snapshotPlayer+字段直读（文件态实证可跑结构）；awake 直读版本曾在 -e 态实测
//     （f36-42 awake=false）。用复现：node --import tsx 本件路径
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

const NONE = { up: false, left: false, right: false };
const IN = (o) => ({ fireboy: { ...NONE, ...o }, watergirl: { ...NONE, ...o } });
const R = IN({ right: true });
const N = IN({});

function run(name, sched) {
  const w = makeWorld("forest_01");
  const out = [];
  for (let f = 0; f < sched.length; f++) {
    w.step(1 / 60, sched[f]);
    if (f % 6 === 0) {
      const s = w.snapshotPlayer("fireboy");
      out.push({ f, x: +s.x.toFixed(2), crf: +(w.players.fireboy.currentRunForce ?? -1).toFixed(2) });
    }
  }
  return { name, out };
}

const fmt = (r) => ({
  name: r.name,
  x0: r.out[0].x,
  xEnd: r.out[r.out.length - 1].x,
  moved: +(r.out[r.out.length - 1].x - r.out[0].x).toFixed(2),
  trace: r.out.filter((_, i) => i % 3 === 0),
});

console.log(JSON.stringify([
  fmt(run("B f0R45+rel3+R45", [...Array(45).fill(R), N, N, N, ...Array(45).fill(R)])),
  fmt(run("A idle3+R60", [N, N, N, ...Array(60).fill(R)])),
  fmt(run("C all-idle", Array(93).fill(N))),
]));
