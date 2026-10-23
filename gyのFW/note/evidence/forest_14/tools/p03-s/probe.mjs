/**
 * P-03 S 档·forest_14 内核探针（蓝图 17-p03 §6 工序①）。
 * 按 17 号档出生点注入复现（fb 中心 (256,348.8) 落 r12 跑道，rest≈x271.6/feet 383.7），
 * 西上跳冲门台；逐变体断言：fb/wg 双双落台 + 双门 isUp（phase=won）。
 * 变体作用于 doc 副本（parseLevel 直载），不动 data/ 真文件。
 * 运行：node --import tsx TEMP/p03/probe.mjs [forest_14] [V0|V-c|V-b32|V-cb32|V-ca32]
 */
import { pathToFileURL } from "node:url";
import { join } from "node:path";
import { makeProvider, locateLevel } from "../../scripts/e2e/routetool/kernel.mjs";
import { ROOT } from "../../scripts/e2e/lib.mjs";

const { parseLevel } = await import(pathToFileURL(join(ROOT, "packages", "shared", "src", "level2.ts")).href);
const { World } = await import(pathToFileURL(join(ROOT, "packages", "shared", "src", "kernel", "world.ts")).href);

const LEVEL = process.argv[2] ?? "forest_14";
const VARIANT = process.argv[3] ?? "V0";

/** doc 变体（纯数据副本变换，字段级可记档）。Ground 行列号 r/c 即瓦片网格。 */
function applyVariant(doc, v) {
  const d = JSON.parse(JSON.stringify(doc));
  const W = d.width;
  const ground = d.layers.find((l) => l.type === "tilelayer" && l.name === "Ground").data;
  const set = (r, c, g) => (ground[r * W + c] = g);
  // 楔面四瓦（dump 实测）：r6c9=2, r7c8=2, r7c9=5, r8c8=5 —— 双列楼梯（c8 顶224/c9 顶192）带 45° 防护面
  const WEDGES = [[6, 9, 2], [7, 8, 2], [7, 9, 5], [8, 8, 5]];
  if (v === "V-c" || v === "V-cb32" || v === "V-ca32") {
    for (const [r, c] of WEDGES) set(r, c, 0); // 丙：楔面四瓦全删
  }
  if (v === "V-b32" || v === "V-cb32") {
    // 乙(整行版)：门台 r8c0-7 下移一行至 r9，门对象随移 +32
    for (let c = 0; c <= 7; c++) { set(8, c, 0); set(9, c, 1); }
    if (v === "V-b32") {
      // 楔列整体下移一行（保持台-梯衔接形态）
      for (const [r, c] of WEDGES) set(r, c, 0);
      set(7, 9, 2); set(8, 8, 2); set(8, 9, 5); set(9, 8, 5);
    }
    for (const o of d.layers.find((l) => l.name === "Chars").objects) if (o.id === 23 || o.id === 24) o.y += 32;
  }
  if (v === "V-ca32") {
    // 甲(整行版)：跑道 r12c6-9 抬一行至 r11（顶 384→352）
    for (let c = 6; c <= 9; c++) { set(12, c, 0); set(11, c, 1); }
  }
  return d;
}

function build(v) {
  const { dir, doc } = locateLevel(LEVEL);
  const mod = v === "V0" ? doc : applyVariant(doc, v);
  return new World(parseLevel(LEVEL, mod, makeProvider(dir)));
}

function trial(w, { jumpLeft = true, holdF = 60, settleF = 150, traceF = 240, walkF = 300 } = {}) {
  const V = w.players.fireboy.body.GetPosition().constructor;
  const put = (c, x, y) => c.body.SetPosition(new V(-x / 32, -y / 32));
  put(w.players.fireboy, 256, 348.8);
  put(w.players.watergirl, 306, 348.8);
  const idle = { up: false, left: false, right: false };
  for (let f = 0; f < settleF; f++) w.step(1 / 60, { fireboy: idle, watergirl: idle });
  const rest = { fb: w.snapshotPlayer("fireboy"), wg: w.snapshotPlayer("watergirl") };
  const jump = { up: true, left: jumpLeft, right: false };
  let minY = 1e9;
  for (let f = 0; f < traceF; f++) {
    w.step(1 / 60, { fireboy: f < holdF ? jump : idle, watergirl: f < holdF ? jump : idle });
    minY = Math.min(minY, w.snapshotPlayer("fireboy").y);
    if (w.phase !== "playing") break;
  }
  const after = { fb: w.snapshotPlayer("fireboy"), wg: w.snapshotPlayer("watergirl") };
  // 走位阶段：各自走向门传感器中心（fb x96 / wg x192），站满待 isUp
  for (let f = 0; f < walkF && w.phase === "playing"; f++) {
    const adv = (c, tx) => {
      const s = w.snapshotPlayer(c);
      if (Math.abs(s.x - tx) < 4) return idle;
      return { up: false, left: s.x > tx, right: s.x < tx };
    };
    w.step(1 / 60, { fireboy: adv("fireboy", 96), watergirl: adv("watergirl", 192) });
  }
  const doors = w.built?.doors ?? {};
  return {
    rest: { fbX: rest.fb.x.toFixed(1), fbFeet: (rest.fb.y + 35.5).toFixed(1) },
    risePx: (rest.fb.y - minY).toFixed(1),
    after: {
      fb: [after.fb.x.toFixed(1), (after.fb.y + 35.5).toFixed(1)],
      wg: [after.wg.x.toFixed(1), (after.wg.y + 35.5).toFixed(1)],
      fbDead: !!after.fb.dead,
    },
    phase: w.phase,
    doorFb: !!doors.fireboy?.isUp,
    doorWg: !!doors.watergirl?.isUp,
  };
}

const w = build(VARIANT);
console.log(`== ${LEVEL} ${VARIANT} ==`);
console.log(JSON.stringify(trial(w), null, 1));
