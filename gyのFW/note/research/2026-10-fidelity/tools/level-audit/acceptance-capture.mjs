#!/usr/bin/env node
/**
 * level-audit/acceptance-capture.mjs — 40 号档（修复验收取证）采集器。
 *
 * 基于 38 号档 audit-runtime.mjs 同构采集口径（静止初始态=0 输入、相机收敛、假钟 enterLevel gate），
 * 扩展三种状态：
 *   static — 双侧静止初始态 a/b 双帧 + 显示列表 dump（新增：有效可见性 ev=祖先链可见合成、tint 数值）。
 *   pause  — 暂停静帧态：我方 KeyP→PauseMenu 面板弹簧落位后 pa/pb 双帧 + PauseMenu/Game 场景 dump+
 *            isPaused 旗标；oracle 右上暂停钮定位点击（worldTransform 屏坐标）→ game.paused 引擎分支
 *            → pa/pb 双帧 + 面板出现后 dump + g.paused 旗标（定位失败依次回退：HUD 惯用位(1265,15)→
 *            onInputUp 派发；全败记 error 不硬造）。
 *   menu   — 菜单光柱态：oracle 泵到 menu + stubAds 后 ma/mb 双帧；我方裸页（不 join）Menu 起来后
 *            隐藏 DOM 联机面板（20c7287 同口径 display:none）→ ma/mb 双帧。
 *
 * 用法：
 *   node acceptance-capture.mjs --side ours   --out TEMP/fixacc/ours   [--port 3991] [--levels a,b] [--modes static,pause]
 *   node acceptance-capture.mjs --side oracle --out TEMP/fixacc/oracle [--levels a,b] [--modes static,pause]
 *   （--root 可指 942d00d worktree 以采修复前；本槽经评估弃用 worktree：node_modules/@fw/* 软链
 *     指向主仓 packages，服务端会串到主仓 shared/client 代码——修复前证据按派发豁免条款引 38 号档。）
 *
 * 产物：--out 下 <id>-a/b.png（static）、<id>-pa/pb.png（pause）、<id>-ma/mb.png（menu）、
 *       <id>.dl.json（static dump）、<id>.dl.pause.json、<id>.meta.json。
 * 文件命名与 audit-runtime.mjs 兼容，compare.py 可直接消费 a/b 与 dl.json。
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const HERE = dirname(fileURLToPath(import.meta.url));
const FW = resolve(HERE, "..", "..", "..", "..", ".."); // gyのFW/
const E2E = join(FW, "scripts", "e2e");
const argOf = (n, d) => (process.argv.includes(`--${n}`) ? process.argv[process.argv.indexOf(`--${n}`) + 1] : d);

const SIDE = argOf("side", "ours");
const OUT = resolve(argOf("out", `TEMP/fixacc/${SIDE}`));
const ROOT = resolve(argOf("root", FW)); // 仓库根（worktree 备选，本槽默认不用，见头注）
const PORT = Number(argOf("port", SIDE === "ours" ? 3991 : 0));
const levelsArg = argOf("levels", "all");
const MODES = new Set(argOf("modes", "static").split(","));
const { startServer, PASSWORD } = await import(join(E2E, "lib.mjs"));
const ORACLE = await import(join(E2E, "oracle", "lib.mjs"));
const ORACLE_ROOT = ORACLE.ORACLE_ROOT;

mkdirSync(OUT, { recursive: true });
const log = (...a) => console.log(`[${SIDE}]`, ...a);

// ---- 关卡清单（temple.json 同 38 号档口径）----
const temple = JSON.parse((await import("node:fs")).readFileSync(join(ORACLE_ROOT, "data", "forest", "temple.json"), "utf8"));
const ALL = temple.levels.map((l) => ({ id: basename(l.filename, ".json"), file: l.filename, lid: l.id }));
const LEVELS = levelsArg === "all" ? ALL : ALL.filter((l) => levelsArg.split(",").includes(l.id));

// ---- 截 canvas ----
const shot = async (page, path) => {
  const data = await page.evaluate(() => {
    const cs = [...document.querySelectorAll("canvas")];
    const cv = cs.sort((a, b) => b.width * b.height - a.width * a.height)[0];
    return { url: cv.toDataURL("image/png"), w: cv.width, h: cv.height };
  });
  writeFileSync(path, Buffer.from(data.url.split(",")[1], "base64"));
  return { w: data.w, h: data.h };
};
const shotEl = async (page, path) => {
  const el = page.locator("canvas").first();
  await el.screenshot({ path });
  return { el: true };
};

// ================= 我方侧 dump（38 号档 DUMP_OURS 扩展 ev/tint） =================
const DUMP_OURS_SCENE = (sceneKey) => {
  const r2 = (v) => Math.round(v * 100) / 100;
  const game = window.__fw;
  const scene = game.scene.getScene(sceneKey);
  if (!scene) return null;
  const out = [];
  const walk = (list, depthPath, parentEv) => {
    for (const go of list) {
      if (!go || go.type === "Graphics") continue;
      let wx = go.x, wy = go.y, sx = go.scaleX, sy = go.scaleY;
      try {
        const m = go.getWorldTransformMatrix();
        wx = m.tx; wy = m.ty;
        sx = Math.sqrt(m.a * m.a + m.b * m.b) || 1;
        sy = Math.sqrt(m.c * m.c + m.d * m.d) || 1;
      } catch {}
      const ev = parentEv && go.visible !== false;
      const e = {
        t: go.type,
        tex: go.texture && go.texture.key !== "__MISSING" ? String(go.texture.key) : undefined,
        f: typeof go.frame?.name === "string" ? go.frame.name : undefined,
        x: r2(wx), y: r2(wy),
        z: go.depth, ox: go.originX, oy: go.originY,
        sx: r2(sx), sy: r2(sy),
        a: r2(go.angle), fx: !!go.flipX, fy: !!go.flipY,
        al: r2(go.alpha), v: go.visible, ev,
        tint: typeof go.tintTopLeft === "number" ? go.tintTopLeft : undefined,
        w: go.width, h: go.height,
        path: depthPath,
      };
      out.push(e);
      if (go.type === "Container" && go.list?.length) walk(go.list, depthPath + ">" + (go.name || go.type), ev);
    }
  };
  walk(scene.children.list, "", true);
  return { dl: out };
};

const DUMP_OURS = () => {
  const scene = window.__fw.scene.getScene("Game");
  const cam = scene.cameras.main;
  const base = DUMP_OURS_SCENE("Game");
  return {
    ...base,
    cam: { x: Math.round(cam.scrollX * 100) / 100, y: Math.round(cam.scrollY * 100) / 100, zoom: Math.round(cam.zoom * 10000) / 10000 },
    frozen: scene.camFrozen,
    levelId: scene.d?.level?.id,
    scenes: window.__fw.scene.scenes.map((s) => ({ key: s.scene.key, status: s.scene.status, paused: s.scene.isPaused?.() ?? null })),
  };
};

const DUMP_OURS_PAUSE = () => {
  const pm = DUMP_OURS_SCENE("PauseMenu");
  return { pauseMenu: pm, flags: DUMP_OURS().scenes };
};

// ================= oracle 侧 dump（38 号档 DUMP_ORACLE 扩展 ev/tint） =================
const DUMP_ORACLE = () => {
  const g = window.Phaser.GAMES[0];
  const lv = g.level;
  const r2 = (v) => (typeof v === "number" ? Math.round(v * 100) / 100 : v);
  const out = [];
  const walk = (o, d, path, M, parentEv) => {
    if (!o || d > 6 || out.length > 5000) return;
    const th = (o.angle || 0) * Math.PI / 180;
    const cs = Math.cos(th), sn = Math.sin(th);
    const sx = o.scale ? o.scale.x : 1, sy = o.scale ? o.scale.y : 1;
    const A = { a: cs * sx, b: sn * sx, c: -sn * sy, d: cs * sy };
    const N = {
      a: M.a * A.a + M.c * A.b,
      b: M.b * A.a + M.d * A.b,
      c: M.a * A.c + M.c * A.d,
      d: M.b * A.c + M.d * A.d,
    };
    const wx = M.a * o.x + M.c * o.y + M.tx;
    const wy = M.b * o.x + M.d * o.y + M.ty;
    const isContainer = !!o.children;
    const key = o.key && typeof o.key === "string" ? o.key : undefined;
    const frame = typeof o.frameName === "string" ? o.frameName : o.frame && typeof o.frame.name === "string" ? o.frame.name : undefined;
    const ev = parentEv && o.visible !== false;
    out.push({
      t: o.type,
      tex: key === "groundTexture" || key === "decosTexture" ? key : key && key.includes(".") ? key.split("/").pop().split(".")[0] : key,
      f: frame,
      x: r2(wx), y: r2(wy),
      ax: r2(o.anchor ? o.anchor.x : 0), ay: r2(o.anchor ? o.anchor.y : 0),
      sx: r2(sx), sy: r2(sy),
      a: r2(o.angle), fx: sx < 0,
      al: r2(o.alpha), v: o.visible !== false, ev,
      tint: typeof o.tint === "number" ? o.tint : undefined,
      w: o.width, h: o.height,
      path,
    });
    if (isContainer) {
      const NM = {
        a: N.a, b: N.b, c: N.c, d: N.d, tx: wx, ty: wy,
      };
      for (const c of o.children) walk(c, d + 1, path + ">" + (c.key || c.type), NM, ev);
    }
  };
  const root = lv.root ?? lv.group ?? g.world;
  {
    const rth = (root.angle || 0) * Math.PI / 180;
    const rcs = Math.cos(rth), rsn = Math.sin(rth);
    const rsx = root.scale ? root.scale.x : 1, rsy = root.scale ? root.scale.y : 1;
    const RM = { a: rcs * rsx, b: rsn * rsx, c: -rsn * rsy, d: rcs * rsy, tx: root.x, ty: root.y };
    const rootEv = root.visible !== false;
    for (const c of root.children ?? []) walk(c, 1, ">" + (c.key || c.type), RM, rootEv);
  }
  return {
    cam: { x: r2(g.camera.x), y: r2(g.camera.y), zoom: r2(g.camera.scale.x) },
    rootScale: r2(root.scale ? root.scale.x : 1),
    rootXY: [r2(root.x), r2(root.y)],
    canvas: { w: g.width, h: g.height },
    gamePaused: !!g.paused,
    dl: out,
  };
};

// ---- oracle 暂停钮定位：帧名/键名含 paus 的对象 → PIXI worldTransform 屏坐标（含相机链）----
const FIND_PAUSE_SPRITE = () => {
  const g = window.Phaser.GAMES[0];
  const lv = g.level;
  const hits = [];
  const readWT = (o) => {
    try {
      const wt = o.worldTransform;
      if (!wt) return null;
      if (Array.isArray(wt)) return { a: wt[0], b: wt[1], c: wt[3], d: wt[4], tx: wt[2], ty: wt[5] };
      if (typeof wt.tx === "number") return { a: wt.a, b: wt.b, c: wt.c, d: wt.d, tx: wt.tx, ty: wt.ty };
    } catch {}
    return null;
  };
  const vis = (o) => o.visible !== false && (!o.parent || o.parent.worldVisible !== false);
  const walk = (o, d) => {
    if (!o || d > 7 || hits.length > 8) return;
    const key = typeof o.key === "string" ? o.key : "";
    const fn = typeof o.frameName === "string" ? o.frameName : "";
    if (/paus/i.test(key) || /paus/i.test(fn)) {
      const wt = readWT(o);
      const ax = o.anchor ? o.anchor.x : 0, ay = o.anchor ? o.anchor.y : 0;
      const sx = o.scale ? o.scale.x : 1, sy = o.scale ? o.scale.y : 1;
      const cx = wt ? wt.tx + (0.5 - ax) * o.width * sx : null;
      const cy = wt ? wt.ty + (0.5 - ay) * o.height * sy : null;
      hits.push({ key, frame: fn, wt, cx, cy, w: o.width, h: o.height, ax, ay, vis: vis(o), hasInput: !!(o.input && o.input.enabled), upEvt: !!(o.events && o.events.onInputUp) });
    }
    if (o.children) for (const c of o.children) walk(c, d + 1);
  };
  const root = lv.root ?? lv.group ?? g.world;
  const tops = [root];
  // 暂停钮挂 game.layers.ui（LevelUI 基类 @1870814 区字证），可能不在 lv.root 子树——world 兜底同扫
  if (g.world && g.world !== root) tops.push(g.world);
  for (const top of tops) for (const c of top.children ?? []) walk(c, 1);
  return hits;
};

// ================= oracle 侧流程 =================
async function runOracle() {
  const { base, close } = await ORACLE.serveOracle();
  log("oracle served at", base);
  const browser = await chromium.launch({ headless: true, args: ORACLE.LAUNCH_ARGS });
  for (const lv of LEVELS) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 960 } });
    page.on("pageerror", (e) => { const s = String(e); if (!s.includes("h5api")) log("pageerror", s.slice(0, 120)); });
    try {
      await page.addInitScript(ORACLE.VT_INIT);
      await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort());
      await page.goto(`${base}/gameIndex.html`, { waitUntil: "domcontentloaded" });
      let booted = false;
      for (let i = 0; i < 8000; i++) {
        await page.evaluate(() => window.__vt.step(1));
        if (i % 25 === 0 && (await page.evaluate(() => window.Phaser?.GAMES?.[0]?.state?.current === "menu"))) { booted = true; break; }
      }
      if (!booted) throw new Error("boot 超帧");

      if (MODES.has("menu")) {
        await ORACLE.stubAds(page);
        await shotEl(page, join(OUT, `${lv.id}-ma.png`));
        await page.evaluate(() => window.__vt.step(60));
        await shotEl(page, join(OUT, `${lv.id}-mb.png`));
        writeFileSync(join(OUT, `${lv.id}.meta.menu.json`), JSON.stringify({ side: "oracle", level: lv, mode: "menu", frame: await page.evaluate(() => window.__vt.frame) }));
        if (!MODES.has("static") && !MODES.has("pause")) { await page.close(); continue; }
      }

      await ORACLE.stubAds(page);
      await ORACLE.enterLevel(page, lv.lid, lv.file);
      await page.evaluate(() => window.__vtRelease && window.__vtRelease());
      let stableRun = 0, last = null, settled = false;
      for (let i = 0; i < 1800; i++) {
        await page.evaluate(() => window.__vt.step(1));
        const cur = await page.evaluate(() => {
          const g = window.Phaser.GAMES[0];
          const r = g.level.root ?? g.level.group ?? g.world;
          return { s: r.scale ? Math.round(r.scale.x * 1e6) / 1e6 : 1, cx: Math.round(g.camera.x * 100) / 100, cy: Math.round(g.camera.y * 100) / 100 };
        });
        if (last && Math.abs(cur.s - last.s) < 1e-4 && Math.abs(cur.cx - last.cx) < 0.05 && Math.abs(cur.cy - last.cy) < 0.05) stableRun++;
        else stableRun = 0;
        last = cur;
        if (stableRun >= 30) { settled = true; break; }
      }
      if (MODES.has("static")) {
        const cvA = await shot(page, join(OUT, `${lv.id}-a.png`));
        await page.evaluate(() => window.__vt.step(20));
        const cvB = await shot(page, join(OUT, `${lv.id}-b.png`));
        const dump = await page.evaluate(DUMP_ORACLE);
        dump.settle = { settled, frames: (await page.evaluate(() => window.__vt.frame)), last };
        writeFileSync(join(OUT, `${lv.id}.dl.json`), JSON.stringify(dump));
        writeFileSync(join(OUT, `${lv.id}.meta.json`), JSON.stringify({ side: "oracle", level: lv, gate: { settled }, canvas: [cvA, cvB] }));
        log(lv.id, "static ok dl=" + dump.dl.length, "settled=" + settled);
      }
      if (MODES.has("pause")) {
        const hits = await page.evaluate(FIND_PAUSE_SPRITE);
        log(lv.id, "pause-candidates", JSON.stringify(hits));
        let pathTaken = null;
        const pausedCheck = () => page.evaluate(() => { const g = window.Phaser.GAMES[0]; return { p: !!g.paused, st: g.state.current }; });
        const visibleHit = hits.find((h) => h.vis && h.cx !== null && h.cx >= 0 && h.cx <= 1280 && h.cy >= 0 && h.cy <= 960);
        if (visibleHit) {
          await page.mouse.click(visibleHit.cx, visibleHit.cy);
          pathTaken = "worldTransform-click";
        } else {
          await page.mouse.click(1265, 15);
          pathTaken = "hud-fallback-click";
        }
        await page.evaluate(() => window.__vt.step(12));
        let st = await pausedCheck();
        if (!st.p) {
          const d = await page.evaluate(() => {
            const g = window.Phaser.GAMES[0];
            const lv = g.level;
            const walk = (o, dd, acc) => {
              if (!o || dd > 7) return;
              if (o.events && o.events.onInputUp && /paus/i.test(String(o.key || "") + String(o.frameName || ""))) acc.push(o);
              if (o.children) for (const c of o.children) walk(c, dd + 1, acc);
            };
            const acc = [];
            const root = lv.root ?? lv.group ?? g.world;
            const tops = (g.world && g.world !== root) ? [root, g.world] : [root];
            for (const top of tops) for (const c of top.children ?? []) walk(c, 1, acc);
            let n = 0;
            for (const o of acc) { try { o.events.onInputUp.dispatch(o, g.input.activePointer); n++; } catch (e) {} }
            return n;
          });
          await page.evaluate(() => window.__vt.step(12));
          st = await pausedCheck();
          pathTaken = `onInputUp-dispatch(${d})`;
        }
        await page.evaluate(() => window.__vt.step(33)); // 面板弹簧落位累计 45+ 步
        const cvPa = await shot(page, join(OUT, `${lv.id}-pa.png`));
        await page.evaluate(() => window.__vt.step(42)); // ≈700ms
        const cvPb = await shot(page, join(OUT, `${lv.id}-pb.png`));
        const dump = await page.evaluate(DUMP_ORACLE);
        writeFileSync(join(OUT, `${lv.id}.dl.pause.json`), JSON.stringify(dump));
        writeFileSync(join(OUT, `${lv.id}.meta.pause.json`), JSON.stringify({ side: "oracle", level: lv, mode: "pause", pathTaken, pausedNow: st, candidates: hits }));
        log(lv.id, "pause ok path=" + pathTaken, "paused=" + st.p);
      }
    } catch (e) {
      log(lv.id, "FAIL", String(e).slice(0, 160));
      writeFileSync(join(OUT, `${lv.id}.meta.json`), JSON.stringify({ side: "oracle", level: lv, error: String(e) }));
    }
    await page.close();
  }
  await browser.close();
  close();
}

// ================= 我方侧流程 =================
async function runOurs() {
  const server = await startServer(PORT);
  log("server on", PORT);
  const browser = await chromium.launch({ headless: true, args: ["--mute-audio", "--disable-webgl", "--js-flags=--max-semi-space-size=64"] });

  if (MODES.has("menu")) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 960 } });
    try {
      await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(1800); // Boot→Menu（Phaser 起来 + 首批纹理）
      await page.evaluate(() => {
        for (const sel of ["#menu", "#hud", "#toast"]) {
          const m = document.querySelector(sel);
          if (m) m.style.display = "none";
        }
      });
      await page.waitForTimeout(300);
      const scenes = await page.evaluate(() => { try { return window.__fw.scene.scenes.map((s) => s.scene.key); } catch { return []; } });
      await shotEl(page, join(OUT, `MENU-ma.png`));
      await page.waitForTimeout(700);
      await shotEl(page, join(OUT, `MENU-mb.png`));
      writeFileSync(join(OUT, `MENU.meta.menu.json`), JSON.stringify({ side: "ours", mode: "menu", scenes }));
      log("menu ok scenes=" + JSON.stringify(scenes));
    } catch (e) {
      log("menu FAIL", String(e).slice(0, 160));
      writeFileSync(join(OUT, `MENU.meta.menu.json`), JSON.stringify({ side: "ours", mode: "menu", error: String(e) }));
    }
    await page.close();
  }

  if (MODES.has("static") || MODES.has("pause")) {
    const gate = `(() => { try { return window.__fwInit.net.room.state.phase === "started"; } catch { return false; } })()`;
    for (const lv of LEVELS) {
      let a = null, b = null;
      try {
        a = await browser.newPage({ viewport: { width: 1280, height: 960 } });
        b = await browser.newPage({ viewport: { width: 1280, height: 960 } });
        const errs = [];
        a.on("pageerror", (e) => errs.push(String(e).slice(0, 120)));
        await a.goto(`http://127.0.0.1:${PORT}/?level=${lv.id}`, { waitUntil: "domcontentloaded" });
        await a.fill("#password", PASSWORD);
        await a.click("#btn-create");
        await a.waitForSelector("#menu", { state: "hidden", timeout: 15000 });
        const roomText = await a.textContent("#hud-room");
        const code = (roomText.match(/房间码 ([^（\s]+)/) || [])[1];
        if (!code) throw new Error("房间码未取得: " + String(roomText).slice(0, 60));
        await b.goto(`http://127.0.0.1:${PORT}/?level=${lv.id}`, { waitUntil: "domcontentloaded" });
        await b.fill("#password", PASSWORD);
        await b.fill("#roomcode", code);
        await b.click("#btn-join");
        await b.waitForSelector("#menu", { state: "hidden", timeout: 15000 });
        await a.waitForFunction(gate, null, { timeout: 20000 });
        const stable = await a.waitForFunction(() => {
          const s = window.__fw.scene.getScene("Game");
          if (!s || s.camFrozen) return false;
          const w = window.__camWin ?? (window.__camWin = { t: 0, x: NaN, y: NaN, z: NaN, run: 0 });
          if (Math.abs(s.camX - w.x) < 0.02 && Math.abs(s.camY - w.y) < 0.02 && Math.abs(s.camScale - w.z) < 0.0005) w.run++;
          else { w.run = 0; w.x = s.camX; w.y = s.camY; w.z = s.camScale; }
          w.t = Date.now();
          return w.run > 36;
        }, null, { timeout: 12000 }).then(() => true).catch(() => false);
        await a.waitForTimeout(400);
        const camPre = await a.evaluate(() => { const s = window.__fw.scene.getScene("Game"); return { x: s.camX, y: s.camY, z: s.camScale }; });
        if (MODES.has("static")) {
          const cvA = await shot(a, join(OUT, `${lv.id}-a.png`));
          await a.waitForTimeout(700);
          const cvB = await shot(a, join(OUT, `${lv.id}-b.png`));
          await a.evaluate(() => window.__fw.loop.sleep());
          const dump = await a.evaluate(DUMP_OURS);
          dump.camStable = stable;
          writeFileSync(join(OUT, `${lv.id}.dl.json`), JSON.stringify(dump));
          writeFileSync(join(OUT, `${lv.id}.meta.json`), JSON.stringify({ side: "ours", level: lv, canvas: [cvA, cvB], camPre, pageErrors: errs.slice(0, 3) }));
          log(lv.id, "static ok dl=" + dump.dl.length, "stable=" + stable, `cam=(${camPre.x.toFixed(1)},${camPre.y.toFixed(1)},${camPre.z.toFixed(4)})`);
        }
        if (MODES.has("pause")) {
          await a.evaluate(() => window.__fw.loop.wake());
          await a.waitForTimeout(250);
          await a.keyboard.press("p");
          await a.waitForTimeout(1700); // 面板弹簧落位（1.5s 兜底线之上）
          const cvPa = await shot(a, join(OUT, `${lv.id}-pa.png`));
          await a.waitForTimeout(700);
          const cvPb = await shot(a, join(OUT, `${lv.id}-pb.png`));
          await a.evaluate(() => window.__fw.loop.sleep());
          const dump = await a.evaluate(DUMP_OURS_PAUSE);
          writeFileSync(join(OUT, `${lv.id}.dl.pause.json`), JSON.stringify(dump));
          writeFileSync(join(OUT, `${lv.id}.meta.pause.json`), JSON.stringify({ side: "ours", level: lv, mode: "pause", flags: dump.flags, pageErrors: errs.slice(0, 3) }));
          log(lv.id, "pause ok flags=" + JSON.stringify(dump.flags));
        }
      } catch (e) {
        log(lv.id, "FAIL", String(e).slice(0, 160));
        writeFileSync(join(OUT, `${lv.id}.meta.json`), JSON.stringify({ side: "ours", level: lv, error: String(e) }));
      }
      if (a) await a.close();
      if (b) await b.close();
    }
  }
  await browser.close();
  try { process.kill(server.pid, "SIGTERM"); } catch {}
}

await (SIDE === "ours" ? runOurs() : runOracle());
log("DONE");
