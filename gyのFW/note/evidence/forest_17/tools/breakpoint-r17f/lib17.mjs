// r17f forest_17 步进工具库：闭环控制回放 + 采样 + 传送 + 钉杆
import { makeWorld } from "../../scripts/e2e/routetool/kernel.mjs";

export const noInput = () => ({ fireboy: { up: false, left: false, right: false }, watergirl: { up: false, left: false, right: false } });
const I = (o = {}) => ({ up: false, left: false, right: false, ...o });

/** 事件表展开（同帧先 up 后 down，与 kernel.expandFlat 一致） */
function expand(evs, total) {
  const sorted = [...evs].sort((a, b) => a.f - b.f || (a.type === "up" ? -1 : 1));
  const st = { up: false, left: false, right: false };
  const byF = new Map();
  for (const e of sorted) byF.set(e.f, [...(byF.get(e.f) ?? []), [e.dir, e.type === "down"]]);
  const out = [];
  for (let f = 0; f < total; f++) {
    for (const [k, v] of byF.get(f) ?? []) st[k] = v;
    out.push({ ...st });
  }
  return out;
}

export const snap = (w) => ({
  fb: w.snapshotPlayer("fireboy"),
  wg: w.snapshotPlayer("watergirl"),
  phase: w.phase,
  levers: w.mechanisms.levers.map((l, i) => `l${i}:s${l.state}@${l.angleDeg().toFixed(1)}`).join(" "),
  plats: w.mechanisms.platforms.map((p, i) => {
    const pos = p.body.GetPosition();
    return `p${i}(${(-pos.x * 32).toFixed(0)},${(-pos.y * 32).toFixed(0)})`;
  }).join(" "),
});

/**
 * 回放。ctrl(w,f,s) 每帧返回 {fb:I(),wg:I()}（闭环脚本）；或 events={fb,wg} 事件表。
 * opts: { until(s,f), sample(n), pins:[leverIdx...](每帧钉角), tele:{f, role, x, feetY, vx, vy}[] }
 * 返回 { w, samples, endSnap, endF, death }
 */
export function replay(level, script, total, opts = {}) {
  const w = makeWorld(level);
  const evIn = script.events
    ? { fb: expand(script.events.fb ?? [], total), wg: expand(script.events.wg ?? [], total) }
    : null;
  const samples = [];
  let endF = -1, death = null;
  const teles = [...(opts.tele ?? [])];
  for (let f = 0; f < total; f++) {
    for (const t of teles) if (t.f === f) teleport(w, t.role, t.x, t.feetY, t.vx ?? 0, t.vy ?? 0);
    let inp;
    if (evIn) inp = { fireboy: I(evIn.fb[f]), watergirl: I(evIn.wg[f]) };
    else {
      const c = script.ctrl(w, f, snap(w)) ?? {};
      inp = { fireboy: I(c.fb), watergirl: I(c.wg) };
    }
    if (opts.pins) for (const idx of opts.pins) pinLever(w, idx);
    w.step(1 / 60, inp);
    const s = snap(w);
    opts.onFrame?.(w, f, s);
    if (opts.sample && f % opts.sample === 0) samples.push({ f, ...s });
    if (opts.until?.(s, f)) { endF = f; break; }
    const fb = w.snapshotPlayer("fireboy"), wg = w.snapshotPlayer("watergirl");
    if (fb.dead || wg.dead || fb.dying || wg.dying) { death = { f, fb: [fb.x, fb.y], wg: [wg.x, wg.y] }; break; }
    if (w.phase === "won") { endF = f; break; }
  }
  return { w, samples, endSnap: snap(w), endF, death };
}

/** 传送角色（屏幕坐标：x 直接用；y=脚底 → body center=feet-35.5；速度屏幕 px/s） */
export function teleport(w, role, x, feetY, vx = 0, vy = 0) {
  const b = w.chars[role].body;
  b.SetPosition({ x: -x / 32, y: -(feetY - 35.5) / 32 }, 0);
  b.SetLinearVelocity({ x: -vx / 32, y: -vy / 32 });
}

/** 钉杆角（等效压杆保持）：gid25(初始+36°) 钉 -0.3rad；gid24(初始-36°) 钉 +0.3 */
export function pinLever(w, idx) {
  const lev = w.mechanisms.levers[idx];
  const a = lev.angleDeg() > 0 ? -0.3 : 0.3;
  lev.body.SetAngle(a);
  lev.body.SetAngularVelocity(0);
  return lev;
}

export const fmtP = (s) => `fb(${s.fb.x.toFixed(1)},${s.fb.y.toFixed(1)}) v(${s.fb.vx.toFixed(0)},${s.fb.vy.toFixed(0)}) | wg(${s.wg.x.toFixed(1)},${s.wg.y.toFixed(1)}) v(${s.wg.vx.toFixed(0)},${s.wg.vy.toFixed(0)})`;
