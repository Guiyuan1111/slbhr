// r25d p6：吊板钟摆定量测量（新内核）—— 板心着陆稳定性 / 落地冲量摆响应 / 泵荡增益 / 西极跳岛台窗口
import { makeWorld } from "../../scripts/e2e/routetool/kernel.mjs";
const px = (n) => Math.round(n * 10) / 10;
const N = { up: false, left: false, right: false };
const L = { up: false, left: true, right: false };
const R = { up: false, left: false, right: true };
const LL = { up: true, left: true, right: false };

function fresh() {
  const w = makeWorld("forest_25");
  for (let i = 0; i < 200; i++) { w.mechanisms.levers[0].body.ApplyTorque(30); w.step(1 / 60, { fireboy: N, watergirl: N }); }
  return w;
}
const vec = (x, y) => new (globalThis.box2d).b2Vec2(x, y);
function tp(w, x, y, vx = 0, vy = 0) {
  w.players.fireboy.body.SetTransformVecRadians(vec(-x / 32, -y / 32), 0);
  w.players.fireboy.body.SetLinearVelocity(vec(-vx / 32, -vy / 32));
}
const st = (w) => {
  const p = w.snapshotPlayer("fireboy");
  const h = w.mechSnapshot().hangings[0];
  return { p, h, txt: `fb=(${px(p.x)},${px(p.y)}) v=(${px(p.vx)},${px(p.vy)}) ${p.anim} | 板心=(${px(h.x)},${px(h.y)}) ang=${h.angle.toFixed(3)}` };
};

// ── B1: 板心精确着陆稳定性（vx=0 落心，idle 600f） ──
console.log("=== B1 板心着陆 (688, vy100) idle 600f ===");
{
  const w = fresh();
  tp(w, 688, 690, 0, 100);
  for (let i = 0; i < 600; i++) w.step(1 / 60, { fireboy: N, watergirl: N });
  console.log("B1:", st(w).txt, w.snapshotPlayer("fireboy").dead ? "DEAD" : "alive");
}

// ── B2: 带速着陆冲量响应（vx=-246 全速落心） ──
console.log("\n=== B2 全速西向落心（vx=-246, vy=100） 板摆响应 300f ===");
{
  const w = fresh();
  tp(w, 700, 690, -246, 100);
  for (let i = 0; i < 300; i++) {
    w.step(1 / 60, { fireboy: N, watergirl: N });
    if (i % 20 === 0) {
      const { p, h, txt } = st(w);
      console.log(`f${i}: ${txt}`);
    }
    if (w.snapshotPlayer("fireboy").dead) { console.log("B2: DEAD"); break; }
  }
}

// ── B3: 泵荡循环测量——站心起跳(直上)→空中 L 漂 Tf→落心，循环 K 次，读摆角/板速 ──
// 判"落心"：|fb.x - 板心x| < 14 且 vy>0 且脚接触（anim idle/jumping 交替难判，用 vy 反号近似）
function pumpCycle(w, driftF, maxF = 200, dbg = false) {
  // 前提：fb 站板心（相对）。执行：起跳→空中按 L driftF 帧→松，等落回
  let jumped = -1, landed = false;
  for (let f = 0; f < maxF; f++) {
    const p = w.snapshotPlayer("fireboy");
    const h = w.mechSnapshot().hangings[0];
    let inp = N;
    if (jumped < 0) {
      if (p.anim === "idle" || p.anim === "jumping" || p.anim === "rising" || p.anim === "falling") {
        // 站稳即跳
        inp = LL; jumped = f;
      }
    } else {
      inp = f - jumped < driftF ? L : N;
      // 落板判定：y 速度由负转正后再次接近 0 且接近板顶
      if (f - jumped > driftF + 10 && Math.abs(p.vy) < 40 && p.y > h.y - 50 && Math.abs(p.x - h.x) < 20) { landed = true; break; }
      if (p.dead) break;
    }
    w.step(1 / 60, { fireboy: inp, watergirl: N });
    if (w.snapshotPlayer("fireboy").dead) break;
  }
  return landed;
}
console.log("\n=== B3 泵荡（落心 vx=-246 起始后，循环 L漂移泵） ===");
for (const drift of [15, 25, 35]) {
  const w = fresh();
  tp(w, 700, 690, -246, 100);
  for (let i = 0; i < 80; i++) w.step(1 / 60, { fireboy: N, watergirl: N });
  const s0 = st(w);
  console.log(`drift=${drift} 初始: ${s0.txt}`);
  for (let k = 0; k < 8; k++) {
    const ok = pumpCycle(w, drift);
    const s = st(w);
    console.log(`  泵${k + 1}${ok ? "" : "(未判落)"}: ${s.txt}${s.p.dead ? " DEAD" : ""}`);
    if (s.p.dead) break;
  }
}
