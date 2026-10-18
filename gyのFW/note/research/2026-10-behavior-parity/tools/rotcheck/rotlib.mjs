/**
 * rotcheck·rotlib：旋转体系 oracle 对拍驱动（只读 import scripts/e2e/oracle/lib.mjs）。
 *
 * 对拍法（08 号档虚拟钟 oracle 机 + goldcollect 序列法）：
 *  - oracle 侧：虚拟钟逐帧泵，采样器记录 elapsed(ms) 与双角色状态 + 全部 hanging 板 [screenX, screenY, angle]。
 *  - 内核侧：makeWorld 同关，先 settle 段（runScript 三段式同款，dt=解析式 [S,17,17,16...]），
 *    再按实录 dt 序列步进；teleport 动作（同一帧、同一 API SetPosition+SetLinearVelocity(0,0)）两侧同步施加。
 *  - 对齐判据：fb/wg 位置 f0 残差应 ≈ goldcollect 的 0.0135px 静态偏置级；θ 残差判据 =
 *    ≤ 整数 ms 量化 + 0.8% 行为底座（08 号档分账口径）。
 */
import { readFileSync } from "node:fs";
import { openOracle, enterLevel, releaseAll, serveOracle, ORACLE_ROOT } from "../../scripts/e2e/oracle/lib.mjs";
import { pathToFileURL } from "node:url";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const E2E = resolve(dirname(fileURLToPath(import.meta.url)), "../../scripts/e2e");
const { makeWorld } = await import(pathToFileURL(join(E2E, "routetool", "kernel.mjs")).href);

const S = 1000 / 60;
/** arm 后第 k 帧的 elapsed 解析式（08 号档实录全吻合；k=0 为钳制帧恰 = S） */
export const eAna = (k) => (k === 0 ? S : Math.floor((k + 1) * S) - Math.floor(k * S));

/** oracle 旋转采样器：包 StateManager.update，每 game.update 尾采样。 */
async function attachRotSampler(page) {
  await page.evaluate(() => {
    const g = window.Phaser.GAMES[0];
    const rec = { samples: [], marks: {}, total: 0 };
    window.__rec = rec;
    const grab = (p) => {
      if (!p || !p.body || !p.body.data) return null;
      const pos = p.body.data.GetPosition();
      const vel = p.body.data.GetLinearVelocity();
      return [-32 * pos.x, -32 * pos.y, -32 * vel.x, -32 * vel.y];
    };
    const grabHang = () => {
      const out = [];
      const objs = g.level.objects || [];
      for (const o of objs) {
        if (o.options && o.options.type === "hanging" && o.platform && o.platform.body) {
          const pos = o.platform.body.data.GetPosition();
          const vel = o.platform.body.data.GetLinearVelocity();
          out.push([-32 * pos.x, -32 * pos.y, o.platform.body.data.GetAngle(), -32 * vel.x, -32 * vel.y]);
        }
      }
      return out;
    };
    const sm = g.state;
    const origUpdate = sm.update.bind(sm);
    sm.update = function (...args) {
      origUpdate(...args);
      try {
        const lv = g.level;
        if (!lv || !lv.pers2 || !lv.pers2.body) return;
        rec.samples.push({ s: g.state.current, n: g.time.now, e: g.time.elapsed, fb: grab(lv.pers1), wg: grab(lv.pers2), hang: grabHang() });
      } catch (e) {
        rec.samples.push({ err: String(e).slice(0, 80) });
      }
    };
    const hookFin = () => {
      const lv = g.level;
      if (!lv || lv.__hooked) return;
      lv.__hooked = true;
      const ow = lv.gameFinish.bind(lv);
      lv.gameFinish = function () { rec.marks.win = rec.total + rec.samples.length; return ow(); };
      const ol = lv.gameOver.bind(lv);
      lv.gameOver = function () { rec.marks.lose = rec.total + rec.samples.length; return ol(); };
    };
    const origPre = sm.preUpdate.bind(sm);
    sm.preUpdate = function (...args) {
      hookFin();
      return origPre(...args);
    };
  });
  return {
    async drain() {
      const r = await page.evaluate(() => {
        const r = window.__rec.samples;
        window.__rec.total += r.length;
        window.__rec.samples = [];
        return r;
      });
      return r;
    },
  };
}

/**
 * oracle 跑一个场景：三段式起跑（与 runScript 同款）+ 可选 teleport 动作表。
 * actions: [{f, role:"pers1"|"pers2", x, y}]（屏幕 px，帧 f 的 tick 前瞬移+清速度）。
 * 返回 { samples, marks, frames, ended }。
 */
export async function runOracle({ levelId, levelFile, frames, actions = [], settle = 30, drainEvery = 500 }) {
  const server = await serveOracle();
  let browser;
  try {
    const opened = await openOracle(server.base);
    browser = opened.browser;
    const page = opened.page;
    await enterLevel(page, levelId, levelFile);
    await page.evaluate(() => {
      window.__vt.arm(1700000000000);
      window.__vtRelease();
    });
    await page.evaluate((n) => window.__vt.step(n), settle);
    await page.evaluate(() => window.__vt.arm(1700000000000));
    const sampler = await attachRotSampler(page);
    const chunks = [];
    for (let f = 0; f < frames; f++) {
      for (const a of actions.filter((a) => a.f === f)) {
        await page.evaluate(({ role, x, y }) => {
          const g = window.Phaser.GAMES[0];
          const b = g.level[role].body.data;
          b.SetPosition({ x: -x / 32, y: -y / 32 });
          b.SetLinearVelocity({ x: 0, y: 0 });
          b.SetAwake(true); // SetPosition 不唤醒（vendor SetTransformXYRadians 无 SetAwake），静置 0.5s 后体已睡
        }, { role: a.role, x: a.x, y: a.y });
      }
      const errs = await page.evaluate(() => window.__vt.step(1));
      if (errs.length) throw new Error(`oracle 帧 ${f} 页内异常: ${errs[0]}`);
      if ((f + 1) % drainEvery === 0 || f === frames - 1) chunks.push(...(await sampler.drain()));
    }
    const marks = await page.evaluate(() => ({ ...window.__rec.marks }));
    await releaseAll(page, { fb: {}, wg: {} }).catch(() => {});
    return { samples: chunks, marks, frames, ended: !!(marks.win || marks.lose) };
  } finally {
    await browser?.close().catch(() => {});
  }
}

/**
 * 内核跑同一场景：settle 段（解析 dt）→ 主段（实录 dt）。
 * 返回逐帧样本 [{ fb, wg, hang }]（hang: [[screenX, screenY, angle], ...]）。
 */
export async function runKernel({ level, frames, dtMs, actions = [], settle = 30 }) {
  const w = makeWorld(level);
  const grab = (role) => {
    const p = w.players[role].body.GetPosition();
    const v = w.players[role].body.GetLinearVelocity();
    return [-32 * p.x, -32 * p.y, -32 * v.x, -32 * v.y];
  };
  const grabHang = () =>
    w.mechanisms.hangings.map((h) => {
      const pos = h.platform.GetPosition();
      const vel = h.platform.GetLinearVelocity();
      return [-32 * pos.x, -32 * pos.y, h.platform.GetAngle(), -32 * vel.x, -32 * vel.y];
    });
  const noIns = { fireboy: { up: false, left: false, right: false }, watergirl: { up: false, left: false, right: false } };
  const samples = [];
  const tele = (a) => {
    const role = a.role === "pers1" ? "fireboy" : "watergirl";
    w.players[role].body.SetPosition({ x: -a.x / 32, y: -a.y / 32 });
    w.players[role].body.SetLinearVelocity({ x: 0, y: 0 });
    w.players[role].body.SetAwake(true);
  };
  for (let k = 0; k < settle; k++) w.step(eAna(k) / 1000, noIns);
  for (let k = 0; k < frames; k++) {
    for (const a of actions.filter((a) => a.f === k)) tele(a);
    w.step(dtMs[k] / 1000, noIns);
    samples.push({ fb: grab("fireboy"), wg: grab("watergirl"), hang: grabHang() });
  }
  return samples;
}

export function templeId(filename) {
  const temple = JSON.parse(readFileSync(join(ORACLE_ROOT, "data", "forest", "temple.json"), "utf8"));
  const hit = temple.levels.find((l) => l.filename === filename);
  if (!hit) throw new Error(`temple.json 无 ${filename}`);
  return hit.id;
}
