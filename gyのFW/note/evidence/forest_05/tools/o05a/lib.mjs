/**
 * o05a 共用库：oracle（output/A）headless 实机探针基建。
 * 移植自 note/evidence/forest_25/tools/o25a/lib.mjs（forest_05 审计用），仅改端口 8843。
 * 进关：menu.skipToLevel({id,_id?, filename, required})（bundle Menu.prototype.skipToLevel 实证）。
 * WIN：game.state.current === "endGame"（Level.prototype.gameFinish → endGame{success:true}）。
 */
import { chromium } from "playwright";

export const ORACLE_ROOT = "/home/gy/桌面/dev/slbhr/Fireboy-and-Watergirl/output/A";
export const BASE = "http://127.0.0.1:8843/gameIndex.html";

export const LAUNCH_ARGS = ["--mute-audio", "--disable-webgl", "--js-flags=--max-semi-space-size=64"];
export const VIEWPORT = { width: 1280, height: 800 };

/** 打开页面并等待游戏 boot 到指定 state。 */
export async function openGame(opts = {}) {
  const browser = await chromium.launch({ headless: true, args: LAUNCH_ARGS });
  const page = await browser.newPage({ viewport: VIEWPORT });
  page.on("pageerror", (e) => {
    const s = String(e);
    if (s.includes("h5api")) return; // 4399 平台进度钩子，原站脚本被注释，无害噪音
    console.log("[pageerror]", s.slice(0, 300), "\n", String(e.stack ?? "").slice(0, 1000));
  });
  // 屏蔽外网（analytics/cloudflare/netlib），避免离线挂起噪音
  await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort());
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  // 等 Phaser.GAMES[0] 出现且 boot 完成
  await page.waitForFunction(
    () => {
      const g = window.Phar?.GAMES?.[0] || window.Phaser?.GAMES?.[0];
      return !!g && !!g.state && !!g.state.states && Object.keys(g.state.states).length > 0;
    },
    { timeout: opts.bootTimeout ?? 60000 },
  );
  // 等 menu 状态真正激活（skipToLevel 里 this.game 需已链接）
  await page.waitForFunction(
    () => {
      const g = window.Phaser.GAMES[0];
      return g.state.current === "menu" && !!g.state.states.menu && typeof g.state.states.menu.skipToLevel === "function";
    },
    { timeout: opts.menuTimeout ?? 60000 },
  );
  return { browser, page };
}

/** 页内一次性环境整形：stub 广告层（离线无广告，showAd 直接回调；不影响物理/玩法代码）。 */
export async function stubAds(page) {
  await page.evaluate(() => {
    const g = window.Phaser.GAMES[0];
    if (g.AdManager) g.AdManager.showAd = function (cb) { if (cb) cb(); };
  });
}

/**
 * 进关：取 temple.json 关卡条目原样对象，设 game.currentTemple（level UI 加载 TempleAssets 图集需要 .id），
 * 再 menu.skipToLevel(entry)。等 level active 且 startLevel 已开钟。
 */
export async function enterLevel(page, filename, id, required = 0) {
  await stubAds(page);
  const temple = await page.evaluate(async (fn) => {
    const r = await fetch("data/forest/temple.json");
    return r.json();
  }, filename);
  const entry = temple.levels.find((l) => l.filename === filename && l.id === id);
  if (!entry) throw new Error(`temple.json 无条目 filename=${filename} id=${id}`);
  await page.evaluate(
    ({ temple, entry }) => {
      const g = window.Phaser.GAMES[0];
      g.currentTemple = temple;
      g.state.states.menu.skipToLevel(entry);
    },
    { temple, entry },
  );
  await page.waitForFunction(
    () => {
      const g = window.Phaser.GAMES[0];
      return g.state.current === "level" && !!g.level && g.level.pers1 && g.level.pers2 && g.level.levelStarted;
    },
    { timeout: 60000 },
  );
  return entry;
}

/**
 * 采样器：rAF 对齐钩子。在 game 状态机 update 末尾采样（每真实帧一次）。
 * 采样：wg/fb 物理坐标(px=-32x,-32y 双取负) + 速度 + state.current + time.now + elapsed。
 * 返回 handle：{ stop(), drain() }。
 */
export async function attachSampler(page) {
  await page.evaluate(() => {
    const g = window.Phaser.GAMES[0];
    const rec = { samples: [], marks: [], t0: performance.now() };
    window.__o05a = rec;
    const px = (m) => -32 * m;
    window.__o05aTick = () => {
      try {
        const lv = g.level;
        if (!lv || !lv.pers2 || !lv.pers2.body) return;
        const now = performance.now() - rec.t0;
        const grab = (p) => {
          if (!p || !p.body || !p.body.data) return null;
          const pos = p.body.data.GetPosition();
          const vel = p.body.data.GetLinearVelocity();
          return { x: +px(pos.x).toFixed(2), y: +px(pos.y).toFixed(2), vx: +(px(vel.x)).toFixed(2), vy: +(px(vel.y)).toFixed(2) };
        };
        rec.samples.push({
          t: +now.toFixed(1),
          st: g.state.current,
          now: g.time.now,
          el: Math.round(g.time.elapsed * 100) / 100,
          wg: grab(lv.pers2),
          fb: grab(lv.pers1),
        });
      } catch (e) {
        rec.samples.push({ err: String(e) });
      }
    };
    // 挂在 state.update 之后：包一层 state（Phaser StateManager 每帧调 update）
    const sm = g.state;
    const origUpdate = sm.update.bind(sm);
    sm.update = function (...args) {
      origUpdate(...args);
      window.__o05aTick();
    };
  });
  return {
    async stop() {},
    async drain() {
      return page.evaluate(() => { const r = window.__o05a.samples; window.__o05a.samples = []; return r; });
    },
  };
}

/** 键控助手：wg=W/A/D，fb=方向键（bundle CharCursors 实证）。 */
export const WG = { up: "KeyW", left: "KeyA", right: "KeyD" };
export const FB = { up: "ArrowUp", left: "ArrowLeft", right: "ArrowRight" };
