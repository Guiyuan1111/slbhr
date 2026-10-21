/**
 * vtoracle·lib：确定性 60Hz oracle 机（虚拟钟）驱动库。
 *
 * 原理（2026-10-17 冒烟定案，见 note/research/2026-10-behavior-parity/02-vt-oracle.md）：
 *  - CDP Emulation.setVirtualTimePolicy 能虚拟化 Date.now，但管不住 rAF（compositor 真实钟驱动，
 *    budget 泵步 48/60 步 rAF 饿死；HeadlessExperimental.beginFrame 在 Playwright headless shell 报协议错误）。
 *  - 故采用"退路 A 强化"：init-script 劫持 window.requestAnimationFrame + Date.now 全假钟，
 *    由 Node 控制器逐帧放行（__vt.step(n)），每步恰一次 game.update，零竞态。
 *  - oracle 计时模型（bundle 提取）：Game.update(Math.floor(rAF ts)) → time.elapsed=整数 ms 差
 *    → executeTick 累加器（minTPS=50/maxTPS=100，largest-step-first）→ world.Step(min(0.04, elapsed/1000))。
 *    虚拟 60Hz 下 ts=k·(1000/60)，elapsed 序列=[17,17,16]ms 循环（均值恰 1/60，实测见报告 §4）。
 *  - 风：force·(1.2+0.2·sin(game.time.now/1000))，game.time.now=虚拟帧号×16.667（锚定 arm 时刻）。
 *
 * 键盘注入与状态采样自 note/evidence/forest_25/tools/o25a/lib.mjs 移植（只读参考）。
 * 输入语义对齐 routetool/kernel.mjs expandFlat：每逻辑帧 {up,left,right} 布尔，帧边界注入。
 */
import { spawn } from "node:child_process";
import { chromium } from "playwright";

/** 原版只读产物目录（L1）：可用 ORACLE_ROOT 覆盖，缺省保留本机历史路径。 */
export const ORACLE_ROOT = process.env.ORACLE_ROOT || "/home/gy/桌面/dev/slbhr/Fireboy-and-Watergirl/output/A";
const PORT_CANDIDATES = [8842, 8843, 8844];
export const LAUNCH_ARGS = ["--mute-audio", "--disable-webgl", "--js-flags=--max-semi-space-size=64"];
export const VIEWPORT = { width: 1280, height: 800 };

/** 键位：wg=W/A/D，fb=方向键（bundle CharCursors 实证，同 o25a） */
export const WG = { up: "KeyW", left: "KeyA", right: "KeyD" };
export const FB = { up: "ArrowUp", left: "ArrowLeft", right: "ArrowRight" };
export const ROLES = { fb: FB, wg: WG };

/** 页内假钟 init 脚本（在页面任何脚本前执行）：Date.now 假钟 + rAF 劫持 + 定时器帧驱动化。
 * 用法与语义详见 note/research/2026-10-behavior-parity/02-vt-oracle.md。 */
export const VT_INIT = String.raw`
(() => {
  const realDN = Date.now.bind(Date);
  const STEP = 1000 / 60;
  let mode = "boot"; // "boot"（ts=k·17，Date.now 走真实）| "virtual"（ts=k·STEP，Date.now 假钟）
  let baseDN = 1700000000000;
  let frame = 0;
  let nextRafId = 1;
  let nextTimerId = 1;
  const rafQueue = [];
  const timers = []; // { id, fn, due, period(null=timeout) }
  const vnow = () => (mode === "virtual" ? baseDN + Math.floor(frame * STEP) : frame * 17);
  Date.now = vnow;
  window.requestAnimationFrame = (cb) => { const id = nextRafId++; rafQueue.push({ id, cb }); return id; };
  window.cancelAnimationFrame = (id) => { const i = rafQueue.findIndex((e) => e.id === id); if (i >= 0) rafQueue.splice(i, 1); };
  window.setTimeout = (fn, ms) => {
    const id = nextTimerId++;
    timers.push({ id, fn, due: vnow() + (ms ?? 0), period: null });
    return id;
  };
  window.setInterval = (fn, ms) => {
    const id = nextTimerId++;
    timers.push({ id, fn, due: vnow() + (ms ?? 0), period: ms ?? 0 });
    return id;
  };
  window.clearTimeout = window.clearInterval = (id) => {
    const i = timers.findIndex((t) => t.id === id);
    if (i >= 0) timers.splice(i, 1);
  };
  window.__vt = {
    arm(dnBase) { baseDN = dnBase; frame = 0; mode = "virtual"; },
    get frame() { return frame; },
    get mode() { return mode; },
    step(n) {
      n = n || 1;
      const errs = [];
      for (let i = 0; i < n; i++) {
        frame++;
        const now = vnow();
        // 到期定时器先于 rAF 派发（仅扫本帧开始时已到期者，帧内新排者留到下帧，防同帧无限循环）
        const due = timers.filter((t) => t.due <= now);
        for (const t of due) {
          const j = timers.indexOf(t);
          if (j < 0) continue;
          if (t.period !== null) t.due = now + t.period;
          else timers.splice(j, 1);
          try { typeof t.fn === "function" ? t.fn() : eval(String(t.fn)); } catch (e) { errs.push("timer:" + String(e).slice(0, 100)); }
        }
        const ts = mode === "virtual" ? frame * STEP : frame * 17;
        const cbs = rafQueue.splice(0, rafQueue.length);
        for (const { cb } of cbs) { try { cb(ts); } catch (e) { errs.push(String(e).slice(0, 120)); } }
      }
      return errs;
    },
  };
  // 负 elapsed 修复：arm 把 rAF 时基重置到 0，跳变帧 elapsed = 16 - boot末帧ts ≈ 负数千 ms。
  // 真实 rAF 时间戳单调，负 elapsed 不可能发生；不修则 bundle 的 executeTick 累加器
  // （minTPS=50/maxTPS=100）按 +0.017s/帧爬坑 ~393 帧，期间 stage/physics 全不 tick。
  // 钳到恰 1000/60 s → 跳变帧以 dt=1/60 精确 tick，与内核逐帧对齐。
  window.__vtClampElapsed = () => {
    const T = window.Phaser && window.Phaser.Time;
    if (!T || !T.prototype || T.prototype.__vtClamped) return !!T;
    const orig = T.prototype.update;
    T.prototype.update = function (a) {
      orig.call(this, a);
      if (!(this.elapsed >= 0) || this.elapsed > 100) this.elapsed = STEP; // NaN/负/超时 → 恰一帧
    };
    T.prototype.__vtClamped = true;
    return true;
  };
})();`;

/**
 * oracle 静态伺服（只读 serve bundle 目录）。已有机（其它槽共享）则复用；否则本进程 spawn 并登记 kill。
 * 返回 { base, close() }；close 只杀自己 spawn 的。
 */
export async function serveOracle() {
  let base = null;
  let child = null;
  for (const port of PORT_CANDIDATES) {
    base = `http://127.0.0.1:${port}`;
    try {
      const r = await fetch(`${base}/gameIndex.html`, { method: "GET", signal: AbortSignal.timeout(1500) });
      if (r.ok) return { base, close() {} }; // 已有机
    } catch {
      // 端口空置 → 尝试占用
      child = spawn("python3", ["-m", "http.server", String(port), "--bind", "127.0.0.1", "-d", ORACLE_ROOT], {
        stdio: "ignore",
        detached: false,
      });
      await new Promise((resolve) => {
        child.once("error", () => resolve(null));
        setTimeout(resolve, 600);
      });
      try {
        const r = await fetch(`${base}/gameIndex.html`, { signal: AbortSignal.timeout(1500) });
        if (r.ok) return { base, close: () => child.kill() };
      } catch {
        child.kill();
      }
      child = null;
    }
  }
  throw new Error("oracle 伺服端口全部不可用（8842/8843/8844）");
}

/** 打开页面：假钟 init → goto → 逐帧泵 boot → menu。返回 { browser, page }。 */
export async function openOracle(serverBase, opts = {}) {
  const browser = await chromium.launch({ headless: true, args: LAUNCH_ARGS });
  const page = await browser.newPage({ viewport: VIEWPORT });
  page.on("pageerror", (e) => {
    const s = String(e);
    if (s.includes("h5api")) return; // 4399 平台钩子噪音（同 o25a）
    console.log("[pageerror]", s.slice(0, 200));
  });
  await page.addInitScript(VT_INIT);
  await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort());
  await page.goto(`${serverBase}/gameIndex.html`, { waitUntil: "domcontentloaded" });

  // 逐帧泵 boot（rAF 已劫持，必须由我们驱动）；就绪检查每 25 帧一次（读态不影响帧确定性）
  const checkMenu = () => page.evaluate(() => window.Phaser?.GAMES?.[0]?.state?.current === "menu");
  for (let i = 0; i < (opts.bootFrames ?? 6000); i++) {
    await page.evaluate(() => window.__vt.step(1));
    if (i % 25 === 0 && (await checkMenu())) return { browser, page };
  }
  throw new Error("oracle boot 超帧（泵 6000 帧未到 menu）");
}

/** 页内环境整形：stub 广告层（同 o25a）。 */
export async function stubAds(page) {
  await page.evaluate(() => {
    const g = window.Phaser.GAMES[0];
    if (g.AdManager) g.AdManager.showAd = function (cb) { if (cb) cb(); };
  });
}

/**
 * 进关（确定性版）：布防 level.create 完成钩子——create 返回即
 *   ① physics.box2d.paused = true（intro 期物理冻结，body 保持 level-data 初始态，
 *      消除"真实加载抖动 → intro tick 数不定 → 落地 y 差 2e-3px"的跨运行分叉）；
 *   ② __vt.arm：frame 归零、Date.now 锚定常数（游戏期绝对钟逐运行一致）、ts 切 16.667ms 序列；
 *   ③ 负 elapsed 钳制（arm 跳变帧恰以 dt=1/60 tick 一次）。
 * 随后泵帧至 levelStarted 且物理解冻（startLevel 在确定 tick 触发）。返回条目对象。
 */
export async function enterLevel(page, id, filename, required = 0) {
  await stubAds(page);
  const entry = await page.evaluate(async ({ id, filename, required }) => {
    const g = window.Phaser.GAMES[0];
    // level 状态由 skipToLevel 才注册（menu 期 states.level 不存在），故 skipToLevel 前后各布防一次；
    // 钩子幂等（__vtArmed 门），create 返回即 冻结物理 + 锚定虚拟钟 + 负 elapsed 钳制。
    const armHook = (lv) => {
      if (!lv || lv.__vtArmed) return false;
      lv.__vtArmed = true;
      const oc = lv.create.bind(lv);
      lv.create = function (...a) {
        const r = oc(...a);
        try {
          // 锚定顺序：先 arm（Date.now/帧号归零）再清定时器、冻结物理（box2d 插件可能尚未 boot，须判空——
          // intro 期游戏自身也会 paused=true，此处仅兜底）。
          window.__vt.arm(1700000000000); // 固定 Date.now 锚，游戏期绝对钟跨运行逐位一致
          g.time.events.removeAll(); // 清掉 menu/preload 期遗留定时事件，防锚定跳变误触发
          if (g.physics && g.physics.box2d) g.physics.box2d.paused = true;
          if (window.__vtClampElapsed) window.__vtClampElapsed();
        } catch (e) {
          window.__armErr = String(e).slice(0, 200);
        }
        return r;
      };
      return true;
    };
    armHook(g.state.states.level);
    // 冻结保持钩子：box2d 插件在 level create 之后才 boot，须挂 lv.update 首帧懒安装。
    // 把 physics.box2d.paused 改为 accessor：intro/未放行期游戏自身的 unpause 请求一律"挂号不执行"
    // （否则 gate 前会溜进一次变 dt 杂 tick，接触暖启动残差造成 ULP 级发散）；由控制器 __vtRelease 放行。
    const holdHook = (lv) => {
      if (!lv || lv.__holdHooked) return;
      lv.__holdHooked = true;
      const ou = lv.update.bind(lv);
      lv.update = function (...a) {
        if (!window.__holdHooked && g.physics && g.physics.box2d) {
          window.__holdHooked = true;
          const B = g.physics.box2d;
          const st = { p: true, pending: false, released: false };
          Object.defineProperty(B, "paused", {
            configurable: true,
            get: () => st.p,
            set(v) {
              if (!st.released && v === false) { st.pending = true; return; } // 挂号
              st.p = v;
            },
          });
          st.p = true; // 冻结整个 intro
          window.__pendUnpause = () => st.pending;
          window.__vtRelease = () => { st.released = true; st.p = false; st.pending = false; };
        }
        return ou(...a);
      };
    };
    holdHook(g.state.states.level);
    const r = await fetch("data/forest/temple.json");
    const temple = await r.json();
    const e = temple.levels.find((l) => l.filename === filename && l.id === id) ?? temple.levels.find((l) => l.id === id);
    g.currentTemple = temple;
    g.state.states.menu.skipToLevel(e ?? { id, filename, required });
    armHook(g.state.states.level); // 注册发生在 skipToLevel 内 → 此刻补布防（create 尚未跑，preload 未完）
    holdHook(g.state.states.level);
    return e ?? null;
  }, { id, filename, required });
  const ok = await pumpUntil(
    page,
    () => {
      const g = window.Phaser.GAMES[0];
      // gate = intro 完成（levelStarted）且游戏已请求解冻（被 accessor 挂号）——此刻物理一次都未 tick 过
      return g.state.current === "level" && !!g.level && !!g.level.pers1 && !!g.level.pers2 && !!g.level.levelStarted && window.__pendUnpause?.() === true;
    },
    12000,
  );
  if (!ok)
    throw new Error(`进关超帧（12000 帧未到 level/unpause 请求；armErr=${await page.evaluate(() => window.__armErr ?? null)}）`);
  const dbg = await page.evaluate(() => {
    const g = window.Phaser.GAMES[0];
    return {
      vtMode: window.__vt.mode,
      armed: !!g.state.states.level?.__vtArmed,
      holdHooked: !!window.__holdHooked,
      armErr: window.__armErr ?? null,
      now: g.time.now,
      paused: g.physics?.box2d?.paused,
    };
  });
  console.log(`[lib] enterLevel gate: ${JSON.stringify(dbg)}`);
  return entry;
}

/** 通用泵帧等待：每帧步进后查谓词。gate 类谓词必须逐帧查（步进与查态间无帧运行，
 * 保证 gate 帧即首个满足帧，后面无多跑帧）。 */
export async function pumpUntil(page, pred, maxFrames) {
  for (let i = 0; i < maxFrames; i++) {
    await page.evaluate(() => window.__vt.step(1));
    if (await page.evaluate(pred)) return true;
  }
  return (await page.evaluate(pred)) === true;
}

/**
 * 采样器（o25a attachSampler 移植，浮点全精度不取整）：
 * 包 StateManager.update，每 game.update 尾采样一次。返回 { drain, readMarks }。
 * 样本：{ s: state.current, n: time.now, e: time.elapsed, fb:[x,y,vx,vy], wg:[x,y,vx,vy] }。
 * 另包 level.gameFinish/gameOver 记胜负帧（winF/loseF = 采样序号）。
 */
export async function attachSampler(page) {
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
    const sm = g.state;
    const origUpdate = sm.update.bind(sm);
    sm.update = function (...args) {
      origUpdate(...args);
      try {
        const lv = g.level;
        if (!lv || !lv.pers2 || !lv.pers2.body) return;
        rec.samples.push({ s: g.state.current, n: g.time.now, e: g.time.elapsed, fb: grab(lv.pers1), wg: grab(lv.pers2) });
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
      return page.evaluate(() => {
        const r = window.__rec.samples;
        window.__rec.total += r.length;
        window.__rec.samples = [];
        return r;
      });
    },
    async readMarks() {
      return page.evaluate(() => ({ ...window.__rec.marks }));
    },
  };
}

/**
 * 逐帧输入表（对齐 kernel.mjs expandFlat：事件 {f,dir,type}，同帧先 up 后 down，
 * 得每帧 {up,left,right} 布尔）。返回 { fb: [...], wg: [...], totalFrames }。
 */
export function expandInputs(fbEvs, wgEvs, totalFrames) {
  const mk = (evs) => {
    const sorted = [...evs].sort((a, b) => a.f - b.f || (a.type === "up" ? -1 : 1));
    const st = { up: false, left: false, right: false };
    const byF = new Map();
    for (const e of sorted) byF.set(e.f, [...(byF.get(e.f) ?? []), [e.dir, e.type === "down"]]);
    const out = [];
    for (let f = 0; f < totalFrames; f++) {
      for (const [k, v] of byF.get(f) ?? []) st[k] = v;
      out.push({ ...st });
    }
    return out;
  };
  return { fb: mk(fbEvs), wg: mk(wgEvs) };
}

/**
 * 帧边界按键注入（差分式：仅状态变化时派发）。
 * cur 是 Node 侧键状态镜像 {fb:{up..},wg:{up..}}；返回本帧派发事件数。
 */
export async function injectFrame(page, cur, insFb, insWg) {
  let n = 0;
  for (const [role, ins] of [["fb", insFb], ["wg", insWg]]) {
    const keys = ROLES[role];
    for (const dir of ["up", "left", "right"]) {
      if (ins[dir] !== cur[role][dir]) {
        cur[role][dir] = ins[dir];
        if (ins[dir]) await page.keyboard.down(keys[dir]);
        else await page.keyboard.up(keys[dir]);
        n++;
      }
    }
  }
  return n;
}

/** 释放全部按键（收尾）。 */
export async function releaseAll(page, cur) {
  for (const role of ["fb", "wg"]) {
    for (const dir of ["up", "left", "right"]) {
      if (cur[role][dir]) {
        cur[role][dir] = false;
        await page.keyboard.up(ROLES[role][dir]);
      }
    }
  }
}

/** 一条输入脚本的确定性跑。tick 对齐口径：enterLevel 出 gate 后的首个 tick = tick0（读帧 0 输入），
 * 其后每帧恰一次 tick（帧 k+1 = tick k，dt 取 elapsed∈{16,17}ms 整数序列）；
 * oracle tick k ↔ 内核 trace[k]（同为第 k+1 次 tick 后状态，dt 口径差异见报告）。 */
export async function runScript({ serverBase, levelId, levelFile, totalFrames, fbIns, wgIns, onFrame, drainEvery = 500, settleFrames = 30 }) {
  const { browser, page } = await openOracle(serverBase);
  const cur = { fb: { up: false, left: false, right: false }, wg: { up: false, left: false, right: false } };
  try {
    await enterLevel(page, levelId, levelFile);
    // gate 后三段式起跑：①二次锚定（t0/风相位钉死，intro gate 帧号含真实异步抖动）→②放行解冻，
    // 先跑 settleFrames 帧无输入落地（出生点从 level-data 锚落到地面，dt 序列自钳制帧起完全确定）
    // →③三次锚定（清掉落地瞬态，clamp 帧恰一次 dt=1/60 tick，暖启动来自确定性 settle 序列）。
    // 解冻前物理一次未 tick（accessor 冻结保持），无任何变 dt 暖启动残差。
    await page.evaluate(() => {
      window.__vt.arm(1700000000000);
      window.__vtRelease();
    });
    await page.evaluate((n) => window.__vt.step(n), settleFrames);
    await page.evaluate(() => window.__vt.arm(1700000000000));
    const sampler = await attachSampler(page);
    const t0 = Date.now();
    for (let f = 0; f < totalFrames; f++) {
      await injectFrame(page, cur, fbIns[f], wgIns[f]);
      const errs = await page.evaluate(() => window.__vt.step(1));
      if (errs.length) throw new Error(`帧 ${f} 页内异常: ${errs[0]}`);
      if ((f + 1) % drainEvery === 0 || f === totalFrames - 1) {
        const chunk = await sampler.drain();
        if (onFrame) onFrame(f, chunk);
      }
      const marks = (f % 50 === 49 ? await sampler.readMarks() : null);
      if (marks && (marks.win !== undefined || marks.lose !== undefined)) {
        await releaseAll(page, cur);
        const tail = await sampler.drain();
        if (onFrame) onFrame(f, tail);
        return { ended: true, marks, frames: f + 1, wallMs: Date.now() - t0 };
      }
    }
    await releaseAll(page, cur);
    const marks = await sampler.readMarks();
    return { ended: false, marks, frames: totalFrames, wallMs: Date.now() - t0 };
  } finally {
    await browser.close().catch(() => {});
  }
}
