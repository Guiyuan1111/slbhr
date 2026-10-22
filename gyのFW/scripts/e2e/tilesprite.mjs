/**
 * WebGL TileSprite 私有画布瘦身的像素门禁（r38 门禁件）。
 *
 * 为什么要有它：r38 把 WebGL 下的 TileSprite 改成"按 1×1 构造、再撑开显示尺寸"，
 * 依据是 TileSpriteWebGLRenderer 只消费 fillPattern/displayFrame/tileScale/tilePosition，
 * 从不碰构造器私有画布（Canvas 渲染器则照旧全尺寸构造）。这类改动的失效模式不上报错：
 * 画面直接缺背景/缺绳/缺罗马杠，或平铺相位、origin、旋转、容器父子链错位。
 * 现有门禁看不见这条路径——roomtext 用 `--disable-webgl` 走 CanvasRenderer（helper 的
 * fallback 分支），perf-advance 只看时序/驻留，visual-diff 比的是原版且噪声大。
 *
 * 判据（页内、冻屏、逐对象）：
 *   对目标场景里每一个 TileSprite（含容器子级；缺省 Game，--temple 追加 Temple）：
 *     A    = 真实对象（现役产品路径构造）；
 *     bare = 真实对象隐藏（uncovered 底片，用于证明该对象确有像素上屏）；
 *     B    = 真实对象隐藏 + 同坐标 raw 复制体（`scene.add.tileSprite` 原版全尺寸构造）。
 *   A 与 B 必须整幅画布 RGBA **逐字节相等**，且 bare→A 的 ink > 0（排除"对象根本没上屏"的假通过）；
 *   真实对象的私有画布面积必须 ≤4px²（r38 的瘦身本体，退化成全尺寸构造即失败）。
 *   复制体把 texture/frame/宽高/origin/位置/旋转/缩放/alpha/depth/tilePosition/tileScale/
 *   flip/blendMode/tint/scrollFactor 与父子链全部从真实对象抄；相机临时居中到对象包围盒，
 *   拍完恢复。全程只 render 不 step（loop 三路封死），A/B 之间不存在任何时钟/动画推进源。
 *
 * 用法：
 *   node scripts/e2e/tilesprite.mjs [--level forest_01] [--port 3642] [--temple] [--help]
 *   --level 取关卡文件名：forest_01（背景 1248×928 最大对象）与 forest_24（pulley 绳×3 +
 *   roman base/bar，覆盖旋转/细长/容器子级）是 r38 报告引用的两条。
 *   --temple 在 Game 拍完后走真实 __fwLeaveToMenu（黑幕→停 Game→Temple），再拍
 *   TempleScene 的 MenuBackground0000（r38 第 6 个调用点）。
 *   端口缺省 3642（FW_TILESPRITE_PORT 可覆盖）。
 *
 * 机制（复用现成件，不新造产品行为）：
 *   - 起服/双页真联机入场沿用 lib.mjs startServer/enterAs/waitForStarted。
 *   - 冻屏沿用 roomtext.mjs 的 DRIVER 同型：raf.start/loop.wake/loop.step 三路封死，
 *     只按页内 __pp.step 喂合成 1000/60ms 时钟；Math.random 换 mulberry32 定种。
 *   - 读屏：WebGLRenderer.preRender→SceneManager.render→postRender 后直接
 *     `gl.readPixels(0,0,drawingBufferWidth,drawingBufferHeight)`（Phaser 自带 snapshot
 *     同一时机的同款读法；不经 PNG 编解码，无压缩损耗）。renderer 非 WebGL(2) 即报错，
 *     绝不静默降到 Canvas——那会绕过本门禁要验的分支。
 */
import { chromium } from "playwright";
import { PASSWORD, enterAs, log, startServer, waitForStarted } from "./lib.mjs";

const argv = process.argv.slice(2);
function argOf(name, fallback) {
  const i = argv.indexOf(name);
  if (i < 0) return fallback;
  const v = argv[i + 1];
  if (!v || v.startsWith("--")) throw new Error(`${name} 缺参数值`);
  return v;
}
if (argv.includes("--help") || argv.includes("-h")) {
  log("用法：node scripts/e2e/tilesprite.mjs [--level forest_01] [--port 3642] [--temple]");
  log("  对目标场景每个 TileSprite：真实对象 vs 同坐标原版全尺寸复制体，整幅画布逐字节对拍；");
  log("  ink=原对象隐藏→真实对象 的差异像素，必须 >0（证明确有像素上屏）；私有画布面积必须 ≤4px²。");
  log("  --temple 追加：真实 __fwLeaveToMenu 切到 Temple，再拍 MenuBackground0000。");
  process.exit(0);
}
const LEVEL = argOf("--level", "forest_01");
const TEMPLE = argv.includes("--temple");
const PORT = Number(argOf("--port", process.env.FW_TILESPRITE_PORT || 3642));
if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) throw new Error(`端口不合法：${PORT}`);
const BASE_URL = `http://127.0.0.1:${PORT}`;
const STEP_MS = 1000 / 60;
const TEX_WARN = /has no frame|Texture key not found|No texture found matching key|Invalid BitmapText/i;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── 页内驱动（roomtext.mjs DRIVER 同型：三路封死自驱动 + 合成步进 + WebGL 直读） ──
function driver() {
  let s = 0x5eed1e >>> 0;
  const rand = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  Math.random = rand;

  const pp = { clock: 0, steps: 0, game: null };
  globalThis.__pp = pp;
  let captured;
  Object.defineProperty(globalThis, "__fw", {
    configurable: true,
    enumerable: true,
    get: () => captured,
    set: (g) => {
      captured = g;
      pp.game = g;
      g.loop.sleep();
      g.loop.raf.start = () => {};
      g.loop.wake = () => {};
      g.loop.step = () => {};
    },
  });

  pp.step = (n) => {
    const g = pp.game;
    if (!g) return false;
    if (!g.isRunning || !g.scene.isBooted) return false;
    for (let i = 0; i < n; i++) {
      pp.clock += 1000 / 60;
      pp.steps++;
      const L = g.loop;
      L.now = pp.clock;
      L.time = pp.clock;
      L.delta = 1000 / 60;
      L.rawDelta = 1000 / 60;
      L.frame++;
      g.step(pp.clock, 1000 / 60);
    }
    return true;
  };

  // ── tilesprite 量具件 ──
  const ts = {};
  globalThis.__ts = ts;
  const game = () => pp.game;

  /** 只渲染不步进：等价 Game.step 的渲染半段 */
  ts.render = () => {
    const g = game();
    const R = g.renderer;
    R.preRender();
    g.scene.render(R);
    R.postRender();
  };
  ts.info = (sceneKey = "Game") => {
    const g = game();
    const cv = g.canvas;
    const sc = g.scene.getScene(sceneKey);
    const tiles = [];
    const walk = (list) => {
      for (const o of list || []) {
        if (o.type === "TileSprite") tiles.push(o);
        if (Array.isArray(o.list)) walk(o.list);
      }
    };
    if (sc) walk(sc.children.list);
    return {
      renderer: g.renderer ? (g.renderer.type === 1 ? "Canvas" : g.renderer.type === 2 ? "WebGL" : "type" + g.renderer.type) : "未就绪",
      cw: cv.width,
      ch: cv.height,
      dbw: g.renderer && g.renderer.gl ? g.renderer.gl.drawingBufferWidth : -1,
      dbh: g.renderer && g.renderer.gl ? g.renderer.gl.drawingBufferHeight : -1,
      scenes: g.scene.getScenes(true).map((x) => x.scene.key),
      steps: pp.steps,
      tileCount: tiles.length,
      tiles: tiles.map((t) => ({
        key: t.displayTexture ? t.displayTexture.key : "-",
        frame: t.displayFrame ? t.displayFrame.name : "-",
        w: Math.round(t.width * 100) / 100,
        h: Math.round(t.height * 100) / 100,
        x: Math.round(t.x * 100) / 100,
        y: Math.round(t.y * 100) / 100,
        depth: t.depth,
        rot: Math.round(t.rotation * 1000) / 1000,
        inContainer: !!t.parentContainer,
        alpha: t.alpha,
        texW: t.texture ? t.texture.source[0].width : -1,
        texH: t.texture ? t.texture.source[0].height : -1,
        canvasW: t.canvas ? t.canvas.width : -1,
        canvasH: t.canvas ? t.canvas.height : -1,
      })),
    };
  };

  /** 原始全尺寸构造的复制体（与 r37 及更早的产品路径同构） */
  ts.makeReplica = (t) => {
    const sc = t.scene;
    const key = t.displayTexture.key;
    const frame = t.displayFrame.name;
    const c = sc.add.tileSprite(t.x, t.y, t.width, t.height, key, frame);
    // 构造器会把非零宽高向下取整（TileSprite.js:111）；机制同步在运行期写入的是 float
    // （如 forest_24 中段绳 251.08），复制体必须回到对象当前的真实值，否则差 0.08px 的
    // 长条斜线上的亚像素边缘会假报不等。displayOrigin 不参与 TileSprite 的 WebGL 渲染
    // （renderer 用 originX*width），故只覆盖宽高。
    c.width = t.width;
    c.height = t.height;
    c.setOrigin(t.originX, t.originY);
    c.setRotation(t.rotation);
    c.setScale(t.scaleX, t.scaleY);
    c.setAlpha(t.alpha);
    c.setDepth(t.depth);
    c.setTileScale(t.tileScaleX, t.tileScaleY);
    c.setTilePosition(t.tilePositionX, t.tilePositionY);
    if (t.flipX) c.setFlipX(true);
    if (t.flipY) c.setFlipY(true);
    if (t.tintFill) c.setTintFill(t.tintTopLeft);
    else if (t.tintTopLeft !== 0xffffff) c.setTint(t.tintTopLeft);
    c.scrollFactorX = t.scrollFactorX;
    c.scrollFactorY = t.scrollFactorY;
    if (t.parentContainer) {
      const pc = t.parentContainer;
      const idx = pc.list.indexOf(t);
      // Container.addAt：exclusive 容器会摘出场景 displayList / 补 DESTROY 钩子（roomtext mkCopy 同法）
      pc.addAt(c, idx < 0 ? pc.list.length : idx + 1);
    }
    return c;
  };

  /** 整幅画布 RGBA（readPixels 自底向上，A/B 同口径即可） */
  ts.grab = () => {
    const g = game();
    const R = g.renderer;
    ts.render();
    const gl = R.gl;
    const w = gl.drawingBufferWidth;
    const h = gl.drawingBufferHeight;
    const data = new Uint8Array(w * h * 4);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, data);
    return { w, h, data };
  };

  const diffStat = (a, b, w) => {
    const n = a.length;
    let nd = 0;
    let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
    let ha = 0x811c9dc5;
    let hb = 0x811c9dc5;
    for (let i = 0; i < n; i += 4) {
      ha ^= a[i]; ha = Math.imul(ha, 0x01000193);
      ha ^= a[i + 1]; ha = Math.imul(ha, 0x01000193);
      ha ^= a[i + 2]; ha = Math.imul(ha, 0x01000193);
      hb ^= b[i]; hb = Math.imul(hb, 0x01000193);
      hb ^= b[i + 1]; hb = Math.imul(hb, 0x01000193);
      hb ^= b[i + 2]; hb = Math.imul(hb, 0x01000193);
      if (a[i] !== b[i] || a[i + 1] !== b[i + 1] || a[i + 2] !== b[i + 2]) {
        nd++;
        const p = i / 4;
        const x = p % w;
        const y = Math.floor(p / w);
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
    const h = (v) => (v >>> 0).toString(16).padStart(8, "0");
    return { nd, bbox: x1 < 0 ? null : [x0, y0, x1 - x0 + 1, y1 - y0 + 1], hashA: h(ha), hashB: h(hb) };
  };

  /**
   * 逐 TileSprite 三拍。全程同步执行（无 await），loop 已封死，页内不存在时间推进。
   */
  ts.parityAll = (sceneKey = "Game") => {
    const g = game();
    const sc = g.scene.getScene(sceneKey);
    const cam = sc.cameras.main;
    const out = [];
    const all = [];
    const walk = (list, parent) => {
      for (const o of list || []) {
        all.push({ o, parent });
        if (Array.isArray(o.list)) walk(o.list, o);
      }
    };
    walk(sc.children.list, null);
    const tiles = all.filter((e) => e.o.type === "TileSprite");
    const savedVis = all.map((e) => e.o.visible);
    const savedScroll = { x: cam.scrollX, y: cam.scrollY };
    const restoreScroll = () => cam.setScroll(savedScroll.x, savedScroll.y);

    for (const { o: t } of tiles) {
      const meta = {
        key: t.displayTexture.key,
        frame: t.displayFrame.name,
        w: Math.round(t.width * 100) / 100,
        h: Math.round(t.height * 100) / 100,
        x: Math.round(t.x * 100) / 100,
        y: Math.round(t.y * 100) / 100,
        depth: t.depth,
        rot: Math.round(t.rotation * 1000) / 1000,
        inContainer: !!t.parentContainer,
        canvasW: t.canvas ? t.canvas.width : -1,
        canvasH: t.canvas ? t.canvas.height : -1,
        fillW: t.fillPattern && t.fillPattern.width ? t.fillPattern.width : -1,
        fillH: t.fillPattern && t.fillPattern.height ? t.fillPattern.height : -1,
      };
      let replica = null;
      try {
        for (let i = 0; i < all.length; i++) all[i].o.visible = false;
        let p = t;
        const chain = [];
        while (p) { chain.push(p); p = p.parentContainer; }
        for (const o of chain) o.visible = true;
        // 相机临时居中到对象包围盒（含旋转 AABB），拍完恢复
        const b = t.getBounds();
        cam.setScroll(b.centerX - cam.width / (2 * cam.zoom), b.centerY - cam.height / (2 * cam.zoom));
        const A = ts.grab();
        for (const o of chain) o.visible = false;
        // 复制体挂回原父容器：祖先必须重新可见，否则容器内对象（roman bar）整棵不渲染
        for (const o of chain.slice(1)) o.visible = true;
        const bare = ts.grab();
        replica = ts.makeReplica(t);
        const B = ts.grab();
        const inkA = diffStat(A.data, bare.data, A.w);
        const cmp = diffStat(A.data, B.data, A.w);
        const slim = meta.canvasW > 0 && meta.canvasW * meta.canvasH <= 4;
        out.push({
          ...meta,
          ink: inkA.nd,
          ndiff: cmp.nd,
          bbox: cmp.bbox,
          shaA: cmp.hashA,
          shaB: cmp.hashB,
          pass: cmp.nd === 0 && inkA.nd > 0 && slim,
          reason:
            cmp.nd !== 0
              ? `像素不等 ${cmp.nd}`
              : inkA.nd === 0
                ? "未上屏（ink=0）"
                : !slim
                  ? `私有画布未瘦身（${meta.canvasW}×${meta.canvasH}）`
                  : "",
        });
      } catch (e) {
        out.push({ ...meta, pass: false, reason: `异常 ${e && e.stack ? String(e.stack).split("\n")[0] : e}` });
      } finally {
        if (replica) replica.destroy();
        for (let i = 0; i < all.length; i++) all[i].o.visible = savedVis[i];
        restoreScroll();
      }
    }
    return out;
  };
}

const server = await startServer(PORT, {});
const browser = await chromium.launch({
  channel: process.env.FW_BROWSER_CHANNEL ?? (process.platform === "win32" ? "msedge" : undefined),
  headless: true,
  // 必须 WebGL：本门禁验的正是 WebGL 分支（Canvas fallback 由 roomtext 覆盖）
  args: ["--mute-audio"],
});
const fails = [];
let pumping = false;
let pageA = null;
try {
  const ctxA = await browser.newContext({ viewport: { width: 1280, height: 960 }, deviceScaleFactor: 1 });
  pageA = await ctxA.newPage();
  pageA.on("pageerror", (e) => fails.push(`A pageerror: ${e}`));
  pageA.on("console", (m) => {
    if (m.type() === "error" && TEX_WARN.test(m.text())) fails.push(`A console.error: ${m.text()}`);
    if (m.type() === "warning" && TEX_WARN.test(m.text())) fails.push(`A console.warn: ${m.text()}`);
  });
  await pageA.addInitScript(driver);

  const ctxB = await browser.newContext({ viewport: { width: 1280, height: 960 }, deviceScaleFactor: 1 });
  const pageB = await ctxB.newPage();
  pageB.on("pageerror", (e) => fails.push(`B pageerror: ${e}`));

  await pageA.goto(`${BASE_URL}/?level=${LEVEL}`, { waitUntil: "domcontentloaded" });
  await pageA.waitForFunction(
    () => !!globalThis.__pp && !!globalThis.__pp.game && !!globalThis.__pp.game.renderer,
    null,
    { timeout: 30000, polling: 20 },
  );

  pumping = true;
  const pumpLoop = (async () => {
    while (pumping) {
      await pageA
        .evaluate((k) => globalThis.__pp.step(k), 30)
        .catch((e) => {
          const m = String((e && e.message) || e);
          // enterAs 自身的 page.goto 会销毁在途 evaluate 的执行上下文，属预期导航；其余照记
          if (!/Execution context was destroyed|navigat/i.test(m)) fails.push(`pump: ${m.slice(0, 300)}`);
        });
      await sleep(60);
    }
  })();

  const code = await enterAs(pageA, PORT, "create", "", LEVEL);
  await enterAs(pageB, PORT, "join", code, LEVEL);
  await waitForStarted(pageA, 40000);
  await waitForStarted(pageB, 40000);
  log(`房间 ${code} 双人 started（level=${LEVEL}）`);
  await pageA.waitForFunction(
    `(() => { const g=window.__pp.game; if(!g||!g.scene.isActive("Game")) return false;
      const walk=(l)=>{ for(const o of l||[]){ if(o.type==="Container"){ if(walk(o.list)) return true; } const k=o.texture&&o.texture.key; if(k&&k.indexOf("chars")===0) return true; } return false; };
      return walk(g.scene.getScene("Game").children.list); })()`,
    null,
    { timeout: 60000, polling: 100 },
  );
  pumping = false;
  await pumpLoop.catch(() => {});

  const auditScene = async (sceneKey) => {
    const info = await pageA.evaluate((k) => globalThis.__ts.info(k), sceneKey);
    if (info.renderer !== "WebGL") throw new Error(`renderer=${info.renderer}（本门禁要求 WebGL：--disable-webgl 未加？）`);
    if (!info.tileCount) throw new Error(`${sceneKey} 场景无 TileSprite（建图未完成或选错场景？）`);
    log(
      `[${sceneKey}] renderer=${info.renderer} canvas=${info.cw}×${info.ch} buffer=${info.dbw}×${info.dbh} ` +
        `场景=${info.scenes.join(",")} TileSprite=${info.tileCount}`,
    );
    for (const t of info.tiles) {
      log(
        `  · ${t.key}/${t.frame} ${t.w}×${t.h} @${t.x},${t.y} depth=${t.depth} rot=${t.rot} ` +
          `${t.inContainer ? "容器内" : "顶层"} 私有画布=${t.canvasW}×${t.canvasH} 私有纹理=${t.texW}×${t.texH}`,
      );
    }
    const results = await pageA.evaluate((k) => globalThis.__ts.parityAll(k), sceneKey);
    for (const r of results) {
      const line =
        `[${sceneKey}] ${r.pass ? "PASS" : "FAIL"} ${r.key}/${r.frame} ${r.w}×${r.h} rot=${r.rot} ` +
        `${r.inContainer ? "容器内" : "顶层"} 私有=${r.canvasW}×${r.canvasH} fill=${r.fillW}×${r.fillH} ` +
        `ink=${r.ink} ndiff=${r.ndiff} sha=${r.shaA}→${r.shaB}` +
        (r.bbox ? ` bbox=${r.bbox.join(",")}` : "") +
        (r.reason ? `（${r.reason}）` : "");
      log(line);
      if (!r.pass) fails.push(line);
    }
    const frames = [...new Set(results.map((r) => r.frame))];
    log(`[${sceneKey}] 判据汇总：${results.filter((r) => r.pass).length}/${results.length} 通过，覆盖帧 ${frames.join(",")}`);
    return frames;
  };

  const gameFrames = await auditScene("Game");
  if (!gameFrames.some((f) => /BackGround/i.test(f))) fails.push("[Game] 未覆盖背景帧（BackGround*）");

  if (TEMPLE) {
    log("走真实 __fwLeaveToMenu（黑幕→停 Game→Temple），拍第 6 个调用点 MenuBackground0000");
    pumping = true;
    const pumpTemple = (async () => {
      while (pumping) {
        await pageA
          .evaluate((k) => globalThis.__pp.step(k), 30)
          .catch((e) => {
            const m = String((e && e.message) || e);
            if (!/Execution context was destroyed|navigat/i.test(m)) fails.push(`pump: ${m.slice(0, 300)}`);
          });
        await sleep(60);
      }
    })();
    try {
      // 入场黑幕若仍在淡出，fadeSwitch 的 fading 门会把离房 ops 整体丢弃（只泵不切场）
      await pageA.waitForFunction(
        `(() => { const g=window.__pp.game; return !!g && !g.scene.isActive("XFade"); })()`,
        null,
        { timeout: 15000, polling: 100 },
      );
      await pageA.evaluate(() => globalThis.__fwLeaveToMenu());
      await pageA.waitForFunction(
        `(() => { const g=window.__pp.game; return !!g && g.scene.isActive("Temple") && !g.scene.isActive("XFade"); })()`,
        null,
        { timeout: 30000, polling: 100 },
      );
    } finally {
      pumping = false;
      await pumpTemple.catch(() => {});
    }
    const templeFrames = await auditScene("Temple");
    if (!templeFrames.some((f) => /MenuBackground/i.test(f))) fails.push("[Temple] 未覆盖 MenuBackground 帧");
  }
} catch (e) {
  fails.push(`顶层异常：${(e && e.stack) || e}`);
} finally {
  pumping = false;
  if (pageA) await pageA.close().catch(() => {});
  await browser.close().catch(() => {});
  server.kill("SIGTERM");
}

if (fails.length) {
  console.error(`[tilesprite] 失败 ${fails.length} 项：`);
  for (const f of fails) console.error("  - " + f);
  process.exit(1);
}
log(`[tilesprite] 全部通过（level=${LEVEL}）`);
process.exit(0);
