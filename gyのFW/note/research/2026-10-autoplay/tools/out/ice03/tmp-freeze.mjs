// tmp-freeze.mjs — 观察 ice_03 液体冻结触发条件：wg 执行 v20a 程序，每 30f 打印 mechSnapshot
import { makeWorld } from "../../../../../../scripts/e2e/routetool/kernel.mjs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "../../../../../../");
const lvl = "ice_03";

const wt = (d, x, v) => ({ n: "walkTo", a: v == null ? [d, x] : [d, x, v] });
const jd = (d, f, h) => ({ n: "jumpDrift", a: [d, f, h] });
const sl = (t) => ({ n: "sleep", a: [t] });

// 与 drive-ice03 一致的 primitive 展开最小实现：直接手工状态机（walkTo/sleep/jumpDrift）
function stepOf(node, role) {
  // 简化：仅本探针需要的类型
  return node;
}

const world = makeWorld(lvl);
// 输入: {left,right,up,down} 推断自 kernel; jump=up
const prog = {
  wg: [
    wt(-1, 1075, 70), jd(-1, 40, 40), jd(-1, 20, 20), wt(-1, 780, 60),
    wt(-1, 505, 40), jd(-1, 40, 50), jd(-1, 12, 24),
    wt(1, 446, 40), sl(120), wt(1, 502, 40), sl(120),
    wt(1, 508, 40), sl(120), wt(1, 538, 40), sl(120), wt(1, 556, 40),
  ],
  fb: [sl(2000)],
};
// 手工解释器（与 autosearch 语义近似）：
//  walkTo(d,x,v): 朝 x 以 vMax 走，过冲刹车；done=|px-x|<=3 或已越目标
//  sleep(t): 全空闲 t 帧
//  jumpDrift(d,f,h): 需 grounded，hold up+dir 共 ~f 帧后放开 dir，落地 done
const st = { wg: { i: 0, t: 0, ph: 0 }, fb: { i: 0, t: 0, ph: 0 } };
const NONE = { left: false, right: false, up: false, down: false };
const getInp = (role) => {
  const s = st[role];
  const node = prog[role][s.i];
  if (!node) return NONE;
  const [a0, a1, a2] = node.a;
  if (node.n === "sleep") { s.t++; if (s.t >= a0) { s.i++; s.t = 0; } return NONE; }
  const snap = world.snapshotPlayer(role === "fb" ? "fireboy" : "watergirl");
  const grounded = world.players[role === "fb" ? "fireboy" : "watergirl"].feetContacts.length > 0;
  if (node.n === "walkTo") {
    const vMax = a2 == null ? 60 : a2;
    const dir = a0; const target = a1;
    const dx = target - snap.x;
    const inp = { ...NONE };
    if (Math.abs(dx) <= 3) { s.i++; return NONE; }
    if (dir < 0) { inp.left = true; if (snap.x <= target) { s.i++; return NONE; } }
    else { inp.right = true; if (snap.x >= target) { s.i++; return NONE; } }
    return inp;
  }
  if (node.n === "jumpDrift") {
    const [dir, holdF, holdH] = [a0, a1, a2];
    // 阶段0: 等待 grounded 且起跳
    if (s.ph === 0) {
      if (!grounded) return NONE;
      s.ph = 1; s.t = 0;
    }
    if (s.ph === 1) {
      const inp = { up: true, left: dir < 0 && s.t < holdF, right: dir > 0 && s.t < holdF, down: false };
      s.t++;
      if (s.t >= holdH && !grounded) { s.ph = 2; }
      if (s.t > 200) { s.ph = 2; }
      return inp;
    }
    // 阶段2: 等待落地
    if (!grounded) return { ...NONE };
    s.ph = 0; s.i++;
    return NONE;
  }
  s.i++;
  return NONE;
};

for (let f = 0; f < 2600; f++) {
  const inpWg = f < 5 ? NONE : getInp("wg");
  const inpFb = f < 5 ? NONE : getInp("fb");
  world.step(1 / 60, { fireboy: inpFb, watergirl: inpWg });
  if (f % 30 === 0 || f > 2500) {
    const M = world.mechSnapshot();
    const wg = world.snapshotPlayer("watergirl");
    const puck = M.sliders?.[0];
    console.log(
      `f=${f} wg=[${wg.x.toFixed(1)},${wg.y.toFixed(1)}] puck=${puck ? puck.x.toFixed(1) : "?"} frozen=[${(M.liquidsFrozen || []).join(",")}] wgSt.i=${st.wg.i}`
    );
  }
}
