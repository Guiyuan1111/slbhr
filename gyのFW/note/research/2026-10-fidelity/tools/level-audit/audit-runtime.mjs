#!/usr/bin/env node
/**
 * level-audit/audit-runtime.mjs — 38 号档第 2+3 层采集器：48 关运行时显示列表 dump + 双帧截图。
 *
 * 两侧同构采集（静止初始态=0 输入）：
 *   oracle 侧：serveOracle（127.0.0.1，只读）+ 假钟 VT；enterLevel gate=intro 完成/物理冻结在出生点/
 *              相机冻结全图 → dump g.level.root 显示列表 → 截 canvas → 步 20 帧 → 再截（动态掩码第二帧）。
 *   我方侧：本仓 server（127.0.0.1）+ 双页建房/加入（房间双人门槛）；phase=ready（相机 camFrozen 全图、
 *           双角色在出生点、机关初始快照已到）→ dump GameScene children → 截 canvas → 700ms 后再截。
 *
 * 产物：--out 目录下 <id>.dl.json（两侧各自）、<id>-a.png / <id>-b.png、meta.json（相机/画布/门禁状态）。
 * 用法：
 *   node note/research/2026-10-fidelity/tools/level-audit/audit-runtime.mjs --side ours   --out TEMP/levelvis/ours   [--levels forest_02,forest_03] [--port 3991]
 *   node note/research/2026-10-fidelity/tools/level-audit/audit-runtime.mjs --side oracle --out TEMP/levelvis/oracle [--levels ...]
 */
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join, resolve, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const HERE = dirname(fileURLToPath(import.meta.url));
const FW = resolve(HERE, "..", "..", "..", "..", ".."); // gyのFW/（level-audit→tools→fidelity→research→note→FW）
const SLBHR = resolve(FW, "..");
const E2E = join(FW, "scripts", "e2e");
const { startServer, PASSWORD } = await import(join(E2E, "lib.mjs"));
const ORACLE = await import(join(E2E, "oracle", "lib.mjs"));

const argOf = (n, d) => (process.argv.includes(`--${n}`) ? process.argv[process.argv.indexOf(`--${n}`) + 1] : d);
const SIDE = argOf("side", "ours");
const OUT = resolve(argOf("out", `TEMP/levelvis/${SIDE}`));
const PORT = Number(argOf("port", SIDE === "ours" ? 3991 : 0));
const levelsArg = argOf("levels", "all");
const SHOT_GAP_MS = Number(argOf("gap", SIDE === "ours" ? 700 : 0)); // oracle 用帧步进
mkdirSync(OUT, { recursive: true });

// ---- 48 关清单 ----
const ORACLE_ROOT = ORACLE.ORACLE_ROOT;
const temple = JSON.parse(readFileSync(join(ORACLE_ROOT, "data", "forest", "temple.json"), "utf8"));
const ALL = temple.levels.map((l) => ({ id: basename(l.filename, ".json"), file: l.filename, lid: l.id }));
const LEVELS = levelsArg === "all" ? ALL : ALL.filter((l) => levelsArg.split(",").includes(l.id));
const log = (...a) => console.log(`[${SIDE}]`, ...a);

// ---- 显示列表 dump（页面内执行）----
const DUMP_OURS = () => {
  const r2 = (v) => Math.round(v * 100) / 100;
  const game = window.__fw;
  const scene = game.scene.getScene("Game");
  const out = [];
  const walk = (list, depthPath) => {
    for (const go of list) {
      if (!go || go.type === "Graphics") continue;
      let wx = go.x, wy = go.y, sx = go.scaleX, sy = go.scaleY;
      try {
        const m = go.getWorldTransformMatrix();
        wx = m.tx; wy = m.ty;
        sx = Math.sqrt(m.a * m.a + m.b * m.b) || 1;
        sy = Math.sqrt(m.c * m.c + m.d * m.d) || 1;
      } catch {}
      const e = {
        t: go.type,
        tex: go.texture && go.texture.key !== "__MISSING" ? String(go.texture.key) : undefined,
        f: typeof go.frame?.name === "string" ? go.frame.name : undefined,
        x: r2(wx), y: r2(wy), // 世界坐标（GetWorldTransformMatrix，含容器变换）
        z: go.depth, ox: go.originX, oy: go.originY,
        sx: r2(sx), sy: r2(sy),
        a: r2(go.angle), fx: !!go.flipX, fy: !!go.flipY,
        al: r2(go.alpha), v: go.visible,
        w: go.width, h: go.height,
        path: depthPath,
      };
      out.push(e);
      if (go.type === "Container" && go.list?.length) walk(go.list, depthPath + ">" + (go.name || go.type));
    }
  };
  walk(scene.children.list, "");
  const cam = scene.cameras.main;
  return {
    cam: { x: r2(cam.scrollX), y: r2(cam.scrollY), zoom: r2(cam.zoom) },
    frozen: scene.camFrozen,
    levelId: scene.d?.level?.id,
    dl: out,
  };
};

const DUMP_ORACLE = () => {
  const g = window.Phaser.GAMES[0];
  const lv = g.level;
  const r2 = (v) => (typeof v === "number" ? Math.round(v * 100) / 100 : v);
  const out = [];
  // 手动累积父变换（世界组含 camera scroll，不能用 worldTransform；本地链 =
  // root(−levelCenter·scale) → 层组 → …；角度顺时针度）
  const walk = (o, d, path, px, py, ps, pr) => {
    if (!o || d > 6 || out.length > 4000) return;
    const th = ((o.angle || 0) + pr) * Math.PI / 180;
    const sx = (o.scale ? o.scale.x : 1) * ps;
    const sy = (o.scale ? o.scale.y : 1) * ps;
    const lx = o.x * ps, ly = o.y * ps;
    const wx = px + lx * Math.cos(th) - ly * Math.sin(th);
    const wy = py + lx * Math.sin(th) + ly * Math.cos(th);
    const isContainer = !!o.children;
    const key = o.key && typeof o.key === "string" ? o.key : undefined;
    const frame = typeof o.frameName === "string" ? o.frameName : o.frame && typeof o.frame.name === "string" ? o.frame.name : undefined;
    out.push({
      t: o.type,
      tex: key === "groundTexture" || key === "decosTexture" ? key : key && key.includes(".") ? key.split("/").pop().split(".")[0] : key,
      f: frame,
      x: r2(wx), y: r2(wy), // level 系绝对坐标（含 root 偏移，compare 侧归一）
      ax: r2(o.anchor ? o.anchor.x : 0), ay: r2(o.anchor ? o.anchor.y : 0),
      sx: r2(o.scale ? o.scale.x : 1), sy: r2(o.scale ? o.scale.y : 1),
      a: r2(o.angle), fx: o.scale && o.scale.x < 0,
      al: r2(o.alpha), v: o.visible !== false,
      w: o.width, h: o.height,
      path,
    });
    if (isContainer) for (const c of o.children) walk(c, d + 1, path + ">" + (c.key || c.type), wx, wy, sx, ((o.angle || 0) + pr));
  };
  const root = lv.root ?? lv.group ?? g.world;
  // 根自身不入变换栈（其 −levelCenter·scale 由 rootXY 记录，compare 侧归一）；
  // 子孙从根位姿起累积（walk 内含角度/缩放合成）。
  {
    const rs = root.scale ? root.scale.x : 1;
    for (const c of root.children ?? []) {
      walk(c, 1, ">" + (c.key || c.type), root.x, root.y, rs, root.angle || 0);
    }
  }
  return {
    cam: { x: r2(g.camera.x), y: r2(g.camera.y), zoom: r2(g.camera.scale.x) },
    rootScale: r2(root.scale ? root.scale.x : 1),
    rootXY: [r2(root.x), r2(root.y)],
    canvas: { w: g.width, h: g.height },
    dl: out,
  };
};

const shot = async (page, path) => {
  const data = await page.evaluate(() => {
    const cs = [...document.querySelectorAll("canvas")];
    const cv = cs.sort((a, b) => b.width * b.height - a.width * a.height)[0];
    return { url: cv.toDataURL("image/png"), w: cv.width, h: cv.height };
  });
  writeFileSync(path, Buffer.from(data.url.split(",")[1], "base64"));
  return { w: data.w, h: data.h };
};

// ================= oracle 侧 =================
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
      // 泵到 menu（复用 openOracle 逻辑，浏览器不逐关重建）
      let booted = false;
      for (let i = 0; i < 8000; i++) {
        await page.evaluate(() => window.__vt.step(1));
        if (i % 25 === 0 && (await page.evaluate(() => window.Phaser?.GAMES?.[0]?.state?.current === "menu"))) { booted = true; break; }
      }
      if (!booted) throw new Error("boot 超帧");
      await ORACLE.stubAds(page);
      await ORACLE.enterLevel(page, lv.lid, lv.file);
      // 放行物理（0 输入），泵到相机稳定（root scale + camera scroll 连续 30 帧不变）
      await page.evaluate(() => window.__vtRelease && window.__vtRelease());
      let stableRun = 0;
      let last = null;
      let settled = false;
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
      const meta = await page.evaluate(() => {
        const g = window.Phaser.GAMES[0];
        return { frame: window.__vt.frame, started: !!g.level?.levelStarted, chars: !!g.level?.pers1 && !!g.level?.pers2 };
      });
      const cvA = await shot(page, join(OUT, `${lv.id}-a.png`));
      await page.evaluate(() => window.__vt.step(20));
      const cvB = await shot(page, join(OUT, `${lv.id}-b.png`));
      const dump = await page.evaluate(DUMP_ORACLE);
      dump.settle = { settled, frames: meta.frame, last };
      writeFileSync(join(OUT, `${lv.id}.dl.json`), JSON.stringify(dump));
      writeFileSync(join(OUT, `${lv.id}.meta.json`), JSON.stringify({ side: "oracle", level: lv, gate: meta, canvas: [cvA, cvB] }));
      log(lv.id, "ok dl=" + dump.dl.length, "settled=" + settled, "scale=" + (last && last.s));
    } catch (e) {
      log(lv.id, "FAIL", String(e).slice(0, 160));
      writeFileSync(join(OUT, `${lv.id}.meta.json`), JSON.stringify({ side: "oracle", level: lv, error: String(e) }));
    }
    await page.close();
  }
  await browser.close();
  close();
}

// ================= 我方侧 =================
async function runOurs() {
  const server = await startServer(PORT);
  log("server on", PORT);
  const browser = await chromium.launch({ headless: true, args: ["--mute-audio", "--disable-webgl", "--js-flags=--max-semi-space-size=64"] });
  const gate = `(() => { try { return window.__fwInit.net.room.state.phase === "started"; } catch { return false; } })()`;
  for (const lv of LEVELS) {
    try {
      const a = await browser.newPage({ viewport: { width: 1280, height: 960 } });
      const b = await browser.newPage({ viewport: { width: 1280, height: 960 } });
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
      // 相机稳定：spring 收敛（三值 600ms 窗内不变）；封顶 12s
      const stable = await a.waitForFunction(() => {
        const s = window.__fw.scene.getScene("Game");
        if (!s || s.camFrozen) return false;
        const w = window.__camWin ?? (window.__camWin = { t: 0, x: NaN, y: NaN, z: NaN, run: 0 });
        if (Math.abs(s.camX - w.x) < 0.02 && Math.abs(s.camY - w.y) < 0.02 && Math.abs(s.camScale - w.z) < 0.0005) {
          w.run++;
        } else { w.run = 0; w.x = s.camX; w.y = s.camY; w.z = s.camScale; }
        w.t = Date.now();
        return w.run > 36;
      }, null, { timeout: 12000 }).then(() => true).catch(() => false);
      await a.waitForTimeout(400);
      const camPre = await a.evaluate(() => { const s = window.__fw.scene.getScene("Game"); return { x: s.camX, y: s.camY, z: s.camScale }; });
      const cvA = await shot(a, join(OUT, `${lv.id}-a.png`));
      await a.waitForTimeout(SHOT_GAP_MS);
      const cvB = await shot(a, join(OUT, `${lv.id}-b.png`));
      // 冻结帧循环后取显示列表（免采集窗口内漂移）
      await a.evaluate(() => window.__fw.loop.sleep());
      const dump = await a.evaluate(DUMP_OURS);
      dump.camStable = stable;
      writeFileSync(join(OUT, `${lv.id}.dl.json`), JSON.stringify(dump));
      writeFileSync(join(OUT, `${lv.id}.meta.json`), JSON.stringify({ side: "ours", level: lv, canvas: [cvA, cvB], camPre, pageErrors: errs.slice(0, 3) }));
      log(lv.id, "ok dl=" + dump.dl.length, "stable=" + stable, `cam=(${camPre.x.toFixed(1)},${camPre.y.toFixed(1)},${camPre.z.toFixed(4)})`);
      await a.close();
      await b.close();
    } catch (e) {
      log(lv.id, "FAIL", String(e).slice(0, 160));
      writeFileSync(join(OUT, `${lv.id}.meta.json`), JSON.stringify({ side: "ours", level: lv, error: String(e) }));
    }
  }
  await browser.close();
  try { process.kill(server.pid, "SIGTERM"); } catch {}
}

await (SIDE === "ours" ? runOurs() : runOracle());
log("DONE");
