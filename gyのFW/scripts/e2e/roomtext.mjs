/**
 * 房内中文位图字逐像素对拍（r24 门禁件）。
 *
 * 为什么要有它：本轮把房内字体键 FONT_FULL 从官方全量图集 assets/fonts/chinese/font.png
 * （2191×1024，驻留 8.56MB）换成只含房内真正用到的 ~114 字的 font-room.png/.fnt。这类改动的
 * 失效模式极其隐蔽：Phaser 位图字缺纹理键时抛 `Invalid BitmapText key`，缺**字形**时更坏——
 * 不抛错，把缺字形的字直接画成空白。现有门禁全看不见这条路径：
 *   scripts/e2e/prephase-canvas.mjs 只覆盖进房前的五态（其头注自认"游戏内画面/HUD 不重复造轮子"）；
 *   benchmark/visual-diff.mjs 比的是整帧画布对原版，缺字空白恰好混在噪声里且它跑的是原版对照；
 *   冷启动/det/regression 只看 phase/纹理/零错误，位图字内容一概不上屏断言。
 * 本工具把房内**每一个会画中文的面**（时钟、教学文本、暂停/失败/结算三面板）都真的画上屏，
 * 在"产品现役键（'font-full'——指向哪张图集由当轮装载决定）"
 * 与"官方参照侧（页内补装 'font-cmp' = font.png/.fnt，不经产品装载路径）"下各渲染一次，
 * 取画布矩形逐字节对拍。**这一半是判据**：真实对象与同坐标官方复制体必须逐字节相同。
 *
 * Part B 的逐串探针是**诊断件，不是判据**（r24 实测教训）：
 *   - 同一轮里 24px「00:00」面级对拍逐字节相同，探针却报 −1.97% 墨迹 ⇒ 探针的两次抓取
 *     存在与图集无关的系统性差异，不能把差值归因给图集；
 *   - 官方参照侧跨跑也不可复现：同 head/同 bundle 的两次运行 22 条里 21 条 ref sha 不同，
 *     且全部是后跑少墨（−16～−169）。
 *   - 回退后的官方↔官方对照（产品键 font-full 与参照键 font-cmp 装同一张官方图集）：
 *     6/6 面逐字节相同，22/22 串探针仍全部不同（prod 侧少 1.1%～2.0% 墨迹）⇒ 串级偏差与图集无关。
 *   探针产物（glyph_* 与 manifest）只用于人工看趋势与定位，本工具不据此判红。
 *
 * 两种模式（--compare 为缺省）：
 *   node scripts/e2e/roomtext.mjs --baseline
 *       官方参照侧留档：把 'font-cmp'（官方 font.png/.fnt）一侧的面裁剪与探针逐串裁剪落档
 *       （TEMP/roomtext/baseline/ + manifest.json sha256 清单），供人工比对。
 *       **探针裁剪不是确定性基线**（见上），不得作为跨跑硬判据；inroom_* 含冻结世界背景，也仅供人工参考。
 *   node scripts/e2e/roomtext.mjs [--compare]
 *       面级双键对拍（判据）：房内真实对象 vs 同坐标 font-cmp（官方）复制体，逐字节不等 → 非零退出。
 *       探针逐串只登记 ink/sha 与存档，不作判据。
 *
 * 用法：
 *   node scripts/e2e/roomtext.mjs [--baseline|--compare] [--port 3641] [--help]
 *   端口缺省 3641（FW_ROOMTEXT_PORT 可覆盖；起服前请 `ss -ltn` 确认未被占用）。
 *   产物一律落 TEMP/roomtext/（gitignore 面），不改任何仓库受版本管理的文件；本工具不构建、不 commit。
 *
 * 机制（全部复用现成件，不新造产品行为）：
 *   - 入场：lib.mjs enterAs/waitForStarted 双页真联机（A=房主、B=加入方），level=forest_01。
 *   - 冻屏：prephase-canvas.mjs 的 DRIVER 三路封死 Phaser 自驱动（raf.start/loop.wake/loop.step），
 *     世界只按页内 __pp.step 喂合成 1000/60ms 时钟；Math.random 换 mulberry32 定种。
 *     截图前一律"只渲染不步进"（renderer.preRender→scene.render→postRender），显示列表原地不动，
 *     同一面 A/B 两次读屏之间不存在任何动画/时钟推进源。
 *   - 相机复位：sc.camFrozen=true + camScale=1 + camX/Y=视口中心 + applyCam(true)——
 *     教学文本（世界系）与时钟（scrollFactor 0）都落回设计屏幕位，跨跑/跨键可比。
 *   - 面的进入：PauseMenu 走产品路径 __fwTogglePause()（服务端回声→main.ts scene.start）；
 *     GameOverMenu/EndMenu 用运行时手段 game.scene.start(key[, data]) 补开（0.3.42 L-02 补结算链
 *     同款入口，真通关路线不在本量具里重放——route.mjs 已有端到端证据）。
 *     教学文本用 setVisible(true).setAlpha(1) **量具侧强制整组显影**、时钟初始态用 setText("00:00")
 *     **量具侧强制**——都不是产品行为，只为把既定字符串钉到既定坐标上拍像素。
 *   - 参照侧图集装载：页面上下文里 game.load.bitmapFont('font-cmp', '/assets/fonts/chinese/font.png',
 *     '/assets/fonts/chinese/font.fnt') + load.start() 并轮询到齐——不改产品源码即可拿到官方参照。
 *   - 判据：每面整幅画布 1280×960 三份 RGBA（A=真实对象(现役产品键的内容)、bare=真实隐藏、B=真实隐藏+同坐标
 *     font-cmp（官方）复制体）；硬断言 **A 与 B 逐字节相等**（复制体几何/字号/origin/align/maxWidth/alpha/depth/
 *     父子链全部从真实对象抄，位置逐像素重合），ink=bare→A 差异像素（该面确有文字上屏），
 *     不等则报差异 bbox/计数并以 1 退出。探针面（Part B）逐串在探针场景（黑底盖全屏）下两键各拍一张，
 *     只登记 ink 与 sha（诊断，不判红；原因见头注）。
 *   - 全程 console 监听 `Invalid BitmapText|has no frame|Texture key not found|...`（charsplay/regression
 *     同口径正则）与 pageerror，出现即非零退出。
 *
 * 残余风险（本量具挡不住的，说清楚）：won 真通关路径上面板数据串（时限取值）来自服务端 finish，这里用
 * 固定样例数据补开，若未来时限字符串口径变化需同步；HUD 的 DOM 侧中文不经画布，不归本工具管。
 */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright";
import { PASSWORD, ROOT, enterAs, log, startServer, waitForStarted } from "./lib.mjs";

const argv = process.argv.slice(2);
if (argv.includes("--help") || argv.includes("-h")) {
  log("用法：node scripts/e2e/roomtext.mjs [--baseline|--compare] [--port 3641]");
  log("  --compare 缺省：产品侧（font-full，内容随当轮装载）对官方参照侧（页内 'font-cmp'=font.png）逐像素硬对拍");
  log("  --baseline ：只把官方参照侧各面裁剪像素落 TEMP/roomtext/baseline/ + sha256 清单（仅存档，非判定基线）");
  process.exit(0);
}
const MODE = argv.includes("--baseline") ? "baseline" : "compare";
const PORT_IDX = argv.indexOf("--port");
const PORT = Number(PORT_IDX >= 0 ? argv[PORT_IDX + 1] : process.env.FW_ROOMTEXT_PORT || 3641);
if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) throw new Error(`端口不合法：${argv[PORT_IDX + 1]}`);
const BASE_URL = `http://127.0.0.1:${PORT}`;
const LEVEL = "forest_01";
const OUTDIR = join(ROOT, "TEMP", "roomtext");
const BASELINE_DIR = join(OUTDIR, "baseline");
const DIFF_DIR = join(OUTDIR, "diff");
const ROOM_PNG = join(ROOT, "assets", "fonts", "chinese", "font-room.png");
const ROOM_FNT = join(ROOT, "assets", "fonts", "chinese", "font-room.fnt");
// 参照侧=官方全量 font.png/.fnt（件1b 后产品不再装载它，页内补装做对拍/留档锚点）
const OFF_PNG = join(ROOT, "assets", "fonts", "chinese", "font.png");
const OFF_FNT = join(ROOT, "assets", "fonts", "chinese", "font.fnt");
const CMP_URL = { png: "/assets/fonts/chinese/font.png", fnt: "/assets/fonts/chinese/font.fnt" };
const CMP_KEY = "font-cmp";
const STEP_MS = 1000 / 60;
const RNG_SEED = 0x5eed1e;
const TEX_WARN = /has no frame|Texture key not found|No texture found matching key|Invalid BitmapText/i;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sha = (b) => createHash("sha256").update(b).digest("hex");
const sha16 = (b) => sha(b).slice(0, 16);
const mmss = (sec) => `${String(Math.floor(sec / 60)).padStart(2, "0")}:${String(sec % 60).padStart(2, "0")}`;
const fromB64 = (du) => Buffer.from(du.slice(du.indexOf(",") + 1), "base64");

// ── 数据侧事实（Node 直接读仓库 JSON，页面只认这份） ────────────────────────────
const TEMPLE = JSON.parse(readFileSync(join(ROOT, "data", "forest", "temple.json"), "utf8"));
const F01_ENTRY = TEMPLE.levels.find((l) => l.filename === "tutorials/levels/forest_01.json");
const F01_LIMIT = Number(F01_ENTRY?.time ?? 40); // 00:40：Part A EndMenu 传参与 Part B 规范串同口径
/** 全部关卡教学文本（48 关= tutorials 1 + forest 47；实测仅 forest_01 与 forest_bonus_1 带 Tutorial 层） */
function collectTutorialStrings() {
  const seen = new Map();
  const dirs = [join(ROOT, "data", "tutorials", "levels"), join(ROOT, "data", "forest", "levels")];
  const files = dirs.flatMap((d) => readdirSync(d).filter((f) => f.endsWith(".json")).map((f) => join(d, f)));
  for (const p of files) {
    const d = JSON.parse(readFileSync(p, "utf8"));
    for (const L of d.layers ?? []) {
      if (!String(L.name ?? "").startsWith("Tutorial_")) continue;
      for (const o of L.objects ?? []) {
        const t = o.text?.text;
        if (!t) continue;
        // buildTutorial（GameScene.ts:1469-1476）口径：size=18，align=halign??'left'，maxWidth=对象宽
        const spec = { text: String(t), size: 18, align: o.text.halign ?? "left", maxWidth: Number(o.width) || 0 };
        seen.set(`${spec.text}|${spec.size}|${spec.align}|${spec.maxWidth}`, spec);
      }
    }
  }
  return [...seen.values()];
}
const TUT_STRINGS = collectTutorialStrings();

/** EndMenu create 的 scene.start 数据（形状照 main.ts:327-335 openEndMenu；时限=temple.forest_01.time） */
const ENDMENU_DATA = {
  diamonds: 7,
  diamondsTotal: 7,
  silver: 0,
  timeSec: 25,
  timeLimitSec: F01_LIMIT,
  type: "general",
  stars: 3,
};

/** Part B 硬断言的字符串全集：面板规范串 + 时钟（00:00 + 现场跑出的某一刻）+ 全部教学文本 */
function buildStringList(liveClock) {
  const list = [
    { group: "clock", text: "00:00", size: 24 },
    { group: "panel", text: "暫停", size: 36, align: "center" },
    { group: "panel", text: "游戏结束", size: 36, align: "center" },
    { group: "panel", text: "再试一次", size: 26, align: "center" },
    { group: "panel", text: "返回菜单", size: 26, align: "center" },
    { group: "panel", text: "继续", size: 26, align: "center" },
    { group: "panel", text: mmss(F01_LIMIT), size: 18, align: "center", alpha: 0.7 }, // EndMenu 时限（overlays.ts:298-303）
  ];
  if (liveClock && liveClock !== "00:00") list.unshift({ group: "clock", text: liveClock, size: 24 });
  for (const t of TUT_STRINGS) list.push({ group: "tutorial", ...t });
  // 去重（规范串可能与现场/教学串重合）
  const uniq = new Map();
  list.forEach((s, i) => {
    const k = `${s.text}|${s.size}|${s.align ?? "left"}|${s.maxWidth ?? 0}|${s.alpha ?? 1}`;
    if (!uniq.has(k)) uniq.set(k, { ...s, slug: `p${String(i).padStart(2, "0")}` });
  });
  return [...uniq.values()];
}

// ── 页内驱动（prephase-canvas.mjs DRIVER 同型：三路封死自驱动 + 合成步进；再加房内量具件） ──
function driver({ stepMs, cmpKey, cmpPng, cmpFnt }) {
  let s = 0x5eed1e >>> 0;
  const rand = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  Math.random = rand;

  const pp = { clock: 0, counts: {}, steps: 0, game: null };
  globalThis.__pp = pp;
  const arm = (g) => {
    pp.game = g;
    g.loop.sleep();
    g.loop.raf.start = () => {};
    g.loop.wake = () => {};
    g.loop.step = () => {};
  };
  let captured;
  Object.defineProperty(globalThis, "__fw", {
    configurable: true,
    enumerable: true,
    get: () => captured,
    set: (g) => {
      captured = g;
      arm(g);
    },
  });

  pp.step = (n) => {
    const g = pp.game;
    if (!g) return false;
    for (let i = 0; i < n; i++) {
      pp.clock += stepMs;
      pp.steps++;
      const L = g.loop;
      L.now = pp.clock;
      L.time = pp.clock;
      L.delta = stepMs;
      L.rawDelta = stepMs;
      L.frame++;
      g.step(pp.clock, stepMs);
      for (const sc of g.scene.getScenes(true)) {
        const k = sc.scene.key;
        pp.counts[k] = (pp.counts[k] || 0) + 1;
      }
    }
    return true;
  };
  pp.count = (k) => pp.counts[k] || 0;
  pp.active = (k) => !!pp.game && pp.game.scene.isActive(k);

  // ── roomtext 量具件 ──
  const rt = { cmpKey, cmpPng, cmpFnt, probeBt: null };
  globalThis.__rt = rt;
  const game = () => pp.game;
  /** 只渲染不步进：preRender(清屏)→逐场景 render→postRender，等价 Game.step 的渲染半段 */
  rt.render = () => {
    const g = game();
    const R = g.renderer;
    R.preRender();
    g.scene.render(R);
    R.postRender();
  };
  rt.info = () => {
    const g = game();
    const cv = g.canvas;
    return {
      // Phaser 3.90 CanvasRenderer 无 .name/.gl 判定面：this.type=CONST.CANVAS(1)/WEBGL(2)（dist 核实）
      renderer: g.renderer ? (g.renderer.type === 1 ? "Canvas" : g.renderer.type === 2 ? "WebGL" : "type" + g.renderer.type) : "未就绪",
      paused: !!g.isPaused,
      cw: cv.width,
      ch: cv.height,
      scenes: g.scene.getScenes(true).map((x) => x.scene.key),
      hasFull: g.textures.exists("font-full"),
      hasCmp: g.textures.exists(cmpKey),
      fullSrc: g.textures.exists("font-full") ? (() => { const so = g.textures.get("font-full").source[0]; return so.width + "x" + so.height; })() : "-",
      cmpSrc: g.textures.exists(cmpKey) ? (() => { const so = g.textures.get(cmpKey).source[0]; return so.width + "x" + so.height; })() : "-",
      // 位图字 .fnt 元数据在解析后即成纹理帧，cache.text 里并无它——字数按 frames 计（去掉 __BASE）
      cmpChars: g.textures.exists(cmpKey) ? Object.keys(g.textures.get(cmpKey).frames).length - 1 : -1,
      fullChars: g.textures.exists("font-full") ? Object.keys(g.textures.get("font-full").frames).length - 1 : -1,
    };
  };
  /** 页内补装第二图集（Loader 事件驱动，步进封死也到齐）；返回 Promise 结果轮询用 exists() */
  rt.loadCmp = () => {
    const g = game();
    if (g.textures.exists(cmpKey)) return "cached";
    const sc = g.scene.getScene("Game");
    sc.load.bitmapFont(cmpKey, cmpPng, cmpFnt);
    sc.load.start();
    return "queued";
  };
  rt.cmpReady = () => {
    const g = game();
    if (!g.textures.exists(cmpKey)) return false;
    const t = g.textures.get(cmpKey);
    // png 先到 __BASE、fnt 解析完才出字形帧：帧数>1 才算两文件齐（cache.text 里没有 .fnt，勿用）
    return t.has("__BASE") && t.get("__BASE").source.width > 1 && Object.keys(t.frames).length > 1;
  };
  /** 房内相机钉死：camFrozen + zoom1/scroll(0,0) + HUD 补偿复位（applyCam 的 zoom=1 恒等分支） */
  rt.pinCam = () => {
    const sc = game().scene.getScene("Game");
    sc.camFrozen = true;
    sc.camScale = 1;
    sc.camTScale = 1;
    sc.camX = sc.scale.width / 2;
    sc.camY = sc.scale.height / 2;
    sc.applyCam(true);
    return { zoom: sc.cameras.main.zoom, sx: sc.cameras.main.scrollX, sy: sc.cameras.main.scrollY };
  };
  /** 教学文本强制显影（量具侧手段，非产品行为）：Tutorial_keyboard 组整组 visible/alpha=1 */
  rt.forceTutorial = () => {
    const sc = game().scene.getScene("Game");
    let n = 0;
    for (const it of sc.tutorialItems) {
      it.shown = true;
      for (const t of it.texts) {
        t.setVisible(true).setAlpha(1);
        n++;
      }
    }
    return n;
  };
  /** 时钟强制回初始 "00:00"（量具侧 setText，非产品行为）；返回强制前现场串 */
  rt.forceClockInit = () => {
    const sc = game().scene.getScene("Game");
    const live = sc.lastClock || sc.clockText.text;
    sc.clockText.setText("00:00");
    sc.lastClock = "00:00";
    sc.lastClockSec = 0;
    return live;
  };
  rt.clockLive = () => game().scene.getScene("Game").clockText.text;

  const walk = (list, out) => {
    for (const o of list || []) {
      if (o.type === "Container") {
        walk(o.list, out);
        continue;
      }
      if (o.type === "BitmapText") out.push(o);
    }
  };
  /** 按面描述收集真实 BitmapText 对象 */
  rt.faceObjs = (spec) => {
    const g = game();
    const out = [];
    if (spec.kind === "scene") {
      const sc = g.scene.getScene(spec.scene);
      walk(sc.children.list, out);
      return out;
    }
    if (spec.kind === "clock") {
      out.push(g.scene.getScene("Game").clockText);
      return out;
    }
    if (spec.kind === "tutorial") {
      for (const it of g.scene.getScene("Game").tutorialItems) out.push(...it.texts);
      return out;
    }
    throw new Error("未知面 " + spec.kind);
  };
  /** 从真实对象抄配置建 font-cmp 复制体，并插回父列表同一索引（父子链/深度/换行宽度全同） */
  rt.mkCopy = (t) => {
    const sc = t.scene;
    const c = sc.add.bitmapText(t.x, t.y, cmpKey, t.text, t.fontSize);
    c.setOrigin(t.originX, t.originY);
    c.align = t.align;
    const mw = t.maxWidth;
    if (mw && mw > 0) c.setMaxWidth(mw);
    c.setAlpha(t.alpha);
    c.setDepth(t.depth);
    c.setScale(t.scaleX, t.scaleY);
    c.rotation = t.rotation;
    if (t.parentContainer) {
      // t.parentContainer.list 是普通数组，没有 addAt——走 Container.addAt（ArrayUtils.AddAt 带 addHandler）：
      // exclusive 容器下它会摘出场景 displayList（防双绘）、挂 parentContainer、补 DESTROY 钩子，与产品路径同构。
      const pc = t.parentContainer;
      const idx = pc.list.indexOf(t);
      pc.addAt(c, idx < 0 ? pc.list.length : idx + 1);
    }
    return c;
  };
  rt.grab = () => {
    const cv = game().canvas;
    return cv.getContext("2d").getImageData(0, 0, cv.width, cv.height).data;
  };
  const bboxDiff = (a, b, w, h) => {
    let x0 = w, y0 = h, x1 = -1, y1 = -1, n = 0;
    for (let y = 0; y < h; y++) {
      const row = y * w;
      for (let x = 0; x < w; x++) {
        const i = (row + x) * 4;
        if (a[i] !== b[i] || a[i + 1] !== b[i + 1] || a[i + 2] !== b[i + 2]) {
          n++;
          if (x < x0) x0 = x;
          if (x > x1) x1 = x;
          if (y < y0) y0 = y;
          if (y > y1) y1 = y;
        }
      }
    }
    return { n, x0: x1 < 0 ? 0 : x0, y0: x1 < 0 ? 0 : y0, w: x1 < 0 ? 0 : x1 - x0 + 1, h: x1 < 0 ? 0 : y1 - y0 + 1 };
  };
  const cropUrl = (data, W, x0, y0, cw, ch) => {
    const off = document.createElement("canvas");
    off.width = cw;
    off.height = ch;
    const oc = off.getContext("2d");
    const img = oc.createImageData(cw, ch);
    for (let y = 0; y < ch; y++) {
      img.data.set(data.subarray(((y0 + y) * W + x0) * 4, ((y0 + y) * W + x0 + cw) * 4), y * cw * 4);
    }
    oc.putImageData(img, 0, 0);
    return off.toDataURL("image/png");
  };
  /**
   * 一面三拍：A=真实对象（现役 FONT_FULL 产物路径）；bare=真实隐藏；B=真实隐藏+cmp 复制体。
   * 全部只 render 不 step；返回 A/B 逐字节等、ink（bare→A）、差异 bbox、裁剪 PNG(base64)。
   */
  rt.measureFace = (spec) => {
    const reals = rt.faceObjs(spec);
    const meta = reals.map((t) => ({ text: String(t.text), size: t.fontSize, origin: [t.originX, t.originY], x: t.x, y: t.y, depth: t.depth, alpha: t.alpha, align: t.align, maxWidth: t.maxWidth || 0, inContainer: !!t.parentContainer }));
    rt.render();
    const A = rt.grab();
    for (const t of reals) t.setVisible(false);
    rt.render();
    const bare = rt.grab();
    let B = null;
    if (rt.cmpKey && rt.cmpReady()) {
      const copies = reals.map(rt.mkCopy);
      rt.render();
      B = rt.grab();
      for (const c of copies) c.destroy();
    }
    for (const t of reals) t.setVisible(true);
    const g = game();
    const W = g.canvas.width;
    const H = g.canvas.height;
    const ink = bboxDiff(bare, A, W, H);
    const pad = 4;
    const x0 = Math.max(0, ink.x0 - pad);
    const y0 = Math.max(0, ink.y0 - pad);
    const cw = Math.min(W - x0, ink.w + 2 * pad);
    const ch = Math.min(H - y0, ink.h + 2 * pad);
    const out = {
      objects: meta.length,
      canvas: [W, H],
      ink: { w: ink.w, h: ink.h, n: ink.n, x0: ink.x0, y0: ink.y0 },
      cropA: ink.n > 0 ? cropUrl(A, W, x0, y0, cw, ch) : null,
      cropB: B && ink.n > 0 ? cropUrl(B, W, x0, y0, cw, ch) : null,
      cmp: null,
    };
    if (B) {
      const d = bboxDiff(A, B, W, H);
      out.cmp = { equal: d.n === 0, diff: d.n, bbox: [d.x0, d.y0, d.w, d.h] };
    }
    return out;
  };
  /** 探针场景：黑底盖全屏的独立 Scene，逐串在指定键下渲染读像素（确定性裁剪件） */
  rt.probeInit = () => {
    const g = game();
    if (!g.scene.isActive("RoomTextProbe")) {
      g.scene.add("RoomTextProbe", { key: "RoomTextProbe", backgroundColor: "#000000", create() {} }, true);
    }
    return g.scene.isActive("RoomTextProbe");
  };
  rt.probeReady = () => game().scene.isActive("RoomTextProbe");
  rt.probeShot = (spec) => {
    const g = game();
    const sc = g.scene.getScene("RoomTextProbe");
    if (rt.probeBt) {
      rt.probeBt.destroy();
      rt.probeBt = null;
    }
    // 步进一拍让探针场景过 create（SceneManager.processQueue 挂 update），随即恢复步进封死态
    pp.step(1);
    const bt = sc.add.bitmapText(24, 24, spec.key, spec.text, spec.size);
    if (spec.align) bt.align = spec.align;
    if (spec.maxWidth > 0) bt.setMaxWidth(spec.maxWidth);
    if (spec.alpha !== undefined) bt.setAlpha(spec.alpha);
    rt.render();
    const rect = { x: 20, y: 20, w: Math.min(g.canvas.width - 20, Math.ceil(bt.width) + 8), h: Math.min(g.canvas.height - 20, Math.ceil(bt.height) + 8) };
    const data = g.canvas.getContext("2d").getImageData(rect.x, rect.y, rect.w, rect.h).data;
    let ink = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i] !== 0 || data[i + 1] !== 0 || data[i + 2] !== 0) ink++;
    }
    const off = document.createElement("canvas");
    off.width = rect.w;
    off.height = rect.h;
    const oc = off.getContext("2d");
    const img = new ImageData(new Uint8ClampedArray(data), rect.w, rect.h);
    oc.putImageData(img, 0, 0);
    return { w: rect.w, h: rect.h, ink, layout: [Math.round(bt.width * 100) / 100, Math.round(bt.height * 100) / 100], png: off.toDataURL("image/png") };
  };
  rt.probeDone = () => {
    if (rt.probeBt) rt.probeBt.destroy();
    rt.probeBt = null;
    game().scene.stop("RoomTextProbe");
  };
  /** 面板弹簧落位检查（overlays.ts buildBoard：板顶左目标 y=(960−642)/2=159） */
  rt.board = (sceneKey) => {
    const sc = game().scene.getScene(sceneKey);
    const c = sc && sc.children ? sc.children.list.find((o) => o.type === "Container") : null;
    return c ? { y: c.y, visible: c.visible } : null;
  };
}

// ── Node 侧流程 ──────────────────────────────────────────────────────────────
const fontFp = {};
for (const f of ["font.png", "font.fnt", "font-prephase.png", "font-prephase.fnt", "font-room.png", "font-room.fnt"]) {
  const p = join(ROOT, "assets", "fonts", "chinese", f);
  if (existsSync(p)) fontFp[f] = sha16(readFileSync(p));
}
const distAssets = join(ROOT, "packages", "client", "dist", "assets");
let bundle = null;
if (existsSync(distAssets)) {
  const chunks = readdirSync(distAssets).filter((f) => /^index-.+\.js$/.test(f)).sort();
  if (chunks.length) bundle = { chunk: chunks[0], chunkSha: sha16(readFileSync(join(distAssets, chunks[0]))) };
}
let HEAD = "(git 不可用)";
try {
  HEAD = execFileSync("git", ["rev-parse", "--short", "HEAD"], { cwd: ROOT, encoding: "utf8" }).trim();
} catch { /* 只作溯源，缺了不拦 */ }

let mode = MODE;
let modeNote = "";
if (!(existsSync(ROOM_PNG) && existsSync(ROOM_FNT))) {
  // r24 件1b 已回退（966e7a5），产品 FONT_FULL 指回官方；产物缺失不影响跑，只记一条
  log("ℹ font-room.* 缺失：产品现役 FONT_FULL=官方，本次对拍两侧同源（面级应全同；若看子集差异需先换装）");
}
if (!(existsSync(OFF_PNG) && existsSync(OFF_FNT))) {
  throw new Error("官方参照面 font.png/.fnt 缺失：逐像素一致性的锚点没了（它在仓库受版本管理面，不该消失）");
}
if (mode === "baseline") modeNote = "baseline：仅官方参照侧（'font-cmp'=font.png）存档（TEMP/roomtext/baseline/），不做判据";
else modeNote = "compare：产品现役键（font-full）对官方参照侧逐像素对拍；串级探针只诊断";

log(`模式=${MODE}→实际=${mode}（${modeNote}）`);
log(`字体指纹：${JSON.stringify(fontFp)}`);
if (bundle) log(`dist 产物：${bundle.chunk}=${bundle.chunkSha}`);

const server = await startServer(PORT, {});
const browser = await chromium.launch({
  channel: process.env.FW_BROWSER_CHANNEL ?? (process.platform === "win32" ? "msedge" : undefined),
  headless: true,
  // --disable-webgl：强制 Phaser.AUTO 落 CanvasRenderer——本量具的读屏口径是 game.canvas
  // 的 getImageData（WebGL 上下文不可直读），renderer.type 非 CONST.CANVAS(1) 即报错，绝不静默降级
  args: ["--mute-audio", "--disable-webgl"],
});
const fails = [];
const warnLines = [];
const errLines = [];
let pumping = false;
let pageA = null;
let live = "";
const faceResults = [];
const probeResults = [];
let baselineManifest = null;
const baselinePath = join(BASELINE_DIR, "manifest.json");

try {
  // B 页：正常 loop 的第二玩家（只为凑双人开局，不采像素）
  const ctxB = await browser.newContext({ viewport: { width: 1280, height: 960 }, deviceScaleFactor: 1 });
  const pageB = await ctxB.newPage();
  pageB.on("pageerror", (e) => fails.push(`B pageerror: ${e}`));

  // A 页：驱动页（循环封死 + 合成步进）
  const ctxA = await browser.newContext({ viewport: { width: 1280, height: 960 }, deviceScaleFactor: 1 });
  pageA = await ctxA.newPage();
  pageA.on("pageerror", (e) => fails.push(`A pageerror: ${e}`));
  pageA.on("console", (m) => {
    if (m.type() === "error" && errLines.length < 20) errLines.push(m.text());
    if ((m.type() === "warning" || m.type() === "error") && TEX_WARN.test(m.text())) warnLines.push(`A console.${m.type()}: ${m.text()}`);
  });
  await pageA.addInitScript(driver, { stepMs: STEP_MS, cmpKey: CMP_KEY, cmpPng: CMP_URL.png, cmpFnt: CMP_URL.fnt });
  await pageA.goto(`${BASE_URL}/?level=${LEVEL}`, { waitUntil: "domcontentloaded" });
  await pageA.waitForFunction(() => !!globalThis.__pp && !!globalThis.__pp.game && !!globalThis.__pp.game.renderer, null, { timeout: 30000, polling: 20 });

  // 与建/入房并行的合成步进泵（替代被封死的自驱动；started 与上屏都要靠它推场景队列）
  pumping = true;
  const pumpLoop = (async () => {
    while (pumping) {
      await pageA
        .evaluate((k) => {
          try {
            return globalThis.__pp.step(k);
          } catch (e) {
            // 步进里抛出的场景异常若不裹这里的信息，会被 evaluate 的 rejection 静默吞掉（曾致 60s 空转假死）
            throw new Error(`pp.step@${globalThis.__pp.steps}(${globalThis.__pp.game.scene.getScenes(true).map((s) => s.scene.key).join(",") || "-"}): ${e && e.stack ? String(e.stack).split("\n").slice(0, 3).join(" / ") : e}`);
          }
        }, 30)
        .catch((e) => {
          if (errLines.length < 20) errLines.push(`pump ${String((e && e.message) || e).slice(0, 500)}`);
        });
      await sleep(60);
    }
  })();
  const code = await enterAs(pageA, PORT, "create", "", LEVEL);
  await enterAs(pageB, PORT, "join", code, LEVEL);
  await waitForStarted(pageA, 40000);
  await waitForStarted(pageB, 40000);
  log(`房间 ${code} 双人 started`);
  // 等 Game 场景活动且角色上屏（charsplay waitPainted 同判据，靠泵推进）
  await pageA.waitForFunction(
    `(() => { const g=window.__pp.game; if(!g||!g.scene.isActive("Game")) return false;
      const walk=(l)=>{ for(const o of l||[]){ if(o.type==="Container"){ if(walk(o.list)) return true; } const k=o.texture&&o.texture.key; if(k&&k.indexOf("chars")===0) return true; } return false; };
      return walk(g.scene.getScene("Game").children.list); })()`,
    null,
    { timeout: 60000, polling: 100 },
  );
  pumping = false;
  await pumpLoop.catch(() => {});

  const info = await pageA.evaluate(() => globalThis.__rt.info());
  if (info.renderer !== "Canvas") throw new Error(`renderer=${info.renderer}（量具要求 Canvas：--disable-webgl 未生效？换键读像素口径失效）`);
  if (info.paused) throw new Error("game.isPaused=true（页面被判为不可见），合成时钟推不动世界");
  if (info.cw !== 1280 || info.ch !== 960) throw new Error(`画布缓冲非 1280×960（${info.cw}×${info.ch}）`);
  if (!info.hasFull) throw new Error("房内字体键 font-full 未装载（Game 未真进房？或其装载失败？）");
  log(`房内就绪：产品侧 font-full=${info.fullSrc}（${info.fullChars} 字形帧），场景=${info.scenes.join(",")}`);

  // 参照侧（官方 font.png/.fnt）两模式都装：compare 用它对拍，baseline 用它留档
  await pageA.evaluate(() => globalThis.__rt.loadCmp());
  await pageA.waitForFunction(() => globalThis.__rt.cmpReady(), null, { timeout: 25000 });
  {
    const i2 = await pageA.evaluate(() => globalThis.__rt.info());
    log(`参照侧就绪：font-cmp=官方 font.png ${i2.cmpSrc} 驻留 ${(i2.cmpSrc.split("x").reduce((a, b) => a * b * 4) / 1048576).toFixed(2)}MB，${i2.cmpChars} 字形帧`);
  }
  if (existsSync(baselinePath)) baselineManifest = JSON.parse(readFileSync(baselinePath, "utf8"));

  // ── 冻屏与相机钉死（量具侧强制，见头注） ──
  live = await pageA.evaluate(() => globalThis.__rt.clockLive());
  const cam = await pageA.evaluate(() => globalThis.__rt.pinCam());
  if (cam.zoom !== 1 || cam.sx !== 0 || cam.sy !== 0) log(`ℹ 相机钉死读数 zoom=${cam.zoom} scroll=(${cam.sx},${cam.sy})`);

  // ── Part A：房内各面，同坐标双键逐像素对拍 ──
  const faces = [
    { id: "clock-live", desc: "时钟（started 后 mmss 跑到的某一刻，真实权威读数）", spec: { kind: "clock" }, stage: null },
    { id: "clock-initial", desc: "时钟初始 00:00（量具侧 setText 强制，非产品行为）", spec: { kind: "clock" }, stage: "init" },
    { id: "tutorial-forest01", desc: "forest_01 Tutorial_keyboard 教学文本（量具侧强制整组显影，非产品行为）", spec: { kind: "tutorial" }, stage: "tut" },
    { id: "gameover", desc: "失败面板 GameOverMenu：游戏结束 + 返回菜单/再试一次（game.scene.start 运行时手段）", spec: { kind: "scene", scene: "GameOverMenu" }, stage: "go" },
    { id: "end", desc: "结算面板 EndMenu：时限 + 继续（game.scene.start(data) 量具侧补开，非真通关）", spec: { kind: "scene", scene: "EndMenu" }, stage: "end" },
    { id: "pause", desc: "暂停面板 PauseMenu：暫停 + 三 StoneButton（产品路径 __fwTogglePause）", spec: { kind: "scene", scene: "PauseMenu" }, stage: "pause" },
  ];
  const STAGE = {
    async init() {
      await pageA.evaluate(() => globalThis.__rt.forceClockInit());
    },
    async tut() {
      const n = await pageA.evaluate(() => globalThis.__rt.forceTutorial());
      if (n === 0) throw new Error("forest_01 教学文本为 0 条（Tutorial 层解析失效？）");
    },
    async go() {
      await pageA.evaluate(() => globalThis.__pp.game.scene.start("GameOverMenu"));
      await settlePanel("GameOverMenu");
    },
    async end() {
      await pageA.evaluate((data) => {
        const g = globalThis.__pp.game;
        g.scene.stop("GameOverMenu");
        g.scene.start("EndMenu", data);
      }, ENDMENU_DATA);
      await settlePanel("EndMenu");
    },
    async pause() {
      await pageA.evaluate(() => {
        const g = globalThis.__pp.game;
        g.scene.stop("EndMenu");
        globalThis.__fwTogglePause(); // 产品路径（main.ts:384 挂在 globalThis）：请求发服务端，面板由 pause-changed 回声 scene.start
      });
      for (let t = 0; t < 100 && !(await pageA.evaluate(() => globalThis.__pp.active("PauseMenu"))); t++) {
        await pageA.evaluate(() => globalThis.__pp.step(6));
        await sleep(40);
      }
      if (!(await pageA.evaluate(() => globalThis.__pp.active("PauseMenu")))) throw new Error("__fwTogglePause 后 PauseMenu 未起来（服务端回声超时？）");
      await settlePanel("PauseMenu");
    },
  };
  /**
   * 弹簧入场收敛：分轮步进（每轮 30 步一次往返，轮间让出事件循环）。
   * 必须分轮的原因：弹窗场景（EndMenu/GameOverMenu）的 preload 会再声明一次 FONT_FULL 的
   * .fnt 元数据请求（r18 注释：png 子文件静默跳过、fnt 每次重走条件复验）——XHR 回调只能在
   * evaluate 往返之间落地，单条连续 step(422) 里 create 会排在步进结束之后，板永远停在屏外。
   * ≥8 轮（≈240 步≈4s 场景时）同时盖住 EndMenu 勾叉节拍链（700/1400/2100/2800ms）与
   * prephase BOARD_POST=420 步的弹簧落位经验值。
   */
  async function settlePanel(key) {
    let b = null;
    for (let round = 0; round < 40; round++) {
      await pageA.evaluate(() => globalThis.__pp.step(30));
      await sleep(30);
      b = await pageA.evaluate((k) => globalThis.__rt.board(k), key);
      if (b && b.visible && Math.abs(b.y - 159) < 1 && round >= 7) break;
    }
    if (!b || !b.visible || Math.abs(b.y - 159) > 1) {
      throw new Error(`${key} 面板弹簧未落位（y=${b ? b.y.toFixed(3) : "-"}，目标 159.000±1）`);
    }
  }

  mkdirSync(BASELINE_DIR, { recursive: true });
  for (const f of faces) {
    if (f.stage) await STAGE[f.stage]();
    const r = await pageA.evaluate((spec) => globalThis.__rt.measureFace(spec), f.spec);
    r.id = f.id;
    r.desc = f.desc;
    faceResults.push(r);
    if (r.ink.n === 0) fails.push(`${f.id}：该面没有画上任何字（bare→A 全等，量具或面板失效）`);
    if (mode === "compare") {
      if (!r.cmp) fails.push(`${f.id}：无 font-cmp（官方参照）侧数据`);
      else if (!r.cmp.equal) {
        mkdirSync(DIFF_DIR, { recursive: true });
        if (r.cropB) writeFileSync(join(DIFF_DIR, `${f.id}.ref.png`), fromB64(r.cropB));
        if (r.cropA) writeFileSync(join(DIFF_DIR, `${f.id}.prod.png`), fromB64(r.cropA));
        fails.push(`${f.id}：产品侧与官方参照画布差异 ${r.cmp.diff} px（bbox ${r.cmp.bbox.join(",")}），差图 TEMP/roomtext/diff/`);
      }
    }
    // 留档取 B 侧（官方参照=font.png 复制体），跨代可比；A 侧是现役子集，不作锚点
    if (r.cropB && mode === "baseline") writeFileSync(join(BASELINE_DIR, `inroom_${f.id}.png`), fromB64(r.cropB));
    const cmpTxt = mode === "compare" ? (r.cmp && r.cmp.equal ? "逐字节相同 PASS" : `FAIL diff=${r.cmp ? r.cmp.diff : "-"}`) : "（baseline 只留档不判）";
    log(`[面 ${f.id.padEnd(18)}] ${String(r.canvas)} ink=${r.ink.n} bbox=${r.ink.w}×${r.ink.h}@(${r.ink.x0},${r.ink.y0}) 对象=${r.objects} 键对拍=${cmpTxt}`);
  }

  // ── Part B：全部待画字符串逐条双键硬断言（探针场景，黑底确定性裁剪） ──
  const strings = buildStringList(live);
  log(`[Part B] 待断言字符串 ${strings.length} 条（时钟/面板规范串 + 48 关教学文本去重）`);
  await pageA.evaluate(() => globalThis.__rt.probeInit());
  await pageA.waitForFunction(() => globalThis.__rt.probeReady(), null, { timeout: 15000 });
  for (const s of strings) {
    const shot = (key) => pageA.evaluate((spec) => globalThis.__rt.probeShot(spec), { ...s, key });
    const ref = await shot(CMP_KEY); // 官方参照侧（font.png）——跨跑漂移只登记不判红（见头注）
    const row = { ...s, ref: { ink: ref.ink, size: [ref.w, ref.h], layout: ref.layout, sha: sha(fromB64(ref.png)) } };
    if (mode === "compare") {
      const prod = await shot("font-full"); // 产品现役侧（内容随装载：r24 件1b 期间=font-room 子集）
      const b64 = fromB64(prod.png);
      row.prod = { ink: prod.ink, size: [prod.w, prod.h], sha: sha(b64) };
      row.equal = prod.sha === row.ref.sha && prod.ink === row.ref.ink;
      if (!row.equal) {
        mkdirSync(DIFF_DIR, { recursive: true });
        writeFileSync(join(DIFF_DIR, `glyph_${s.slug}.prod.png`), b64);
        writeFileSync(join(DIFF_DIR, `glyph_${s.slug}.ref.png`), fromB64(ref.png));
      }
    } else {
      writeFileSync(join(BASELINE_DIR, `glyph_${s.slug}.png`), fromB64(ref.png));
    }
    // 参照侧跨跑核对：只登记（探针跨跑本就不稳定，不能据此判红）
    if (baselineManifest) {
      const old = (baselineManifest.strings ?? []).find((x) => x.slug === s.slug && x.text === s.text && x.size === s.size);
      row.refDrift = old && old.ref ? old.ref.sha !== row.ref.sha : null;
    }
    probeResults.push(row);
  }
  await pageA.evaluate(() => globalThis.__rt.probeDone());

  const zeroInk = probeResults.filter((r) => r.ref.ink === 0);
  if (zeroInk.length) log(`[Part B] 官方参照即画不出（ink=0，双键同等空白，不算回归）：${zeroInk.map((r) => `「${r.text}」`).join(" ")}`);
  if (mode === "compare") {
    const bad = probeResults.filter((r) => !r.equal).length;
    const drift = probeResults.filter((r) => r.refDrift).length;
    log(`[Part B] 诊断（不判红）：${probeResults.length - bad}/${probeResults.length} 条双键同像素${bad ? `，${bad} 条不同（见 TEMP/roomtext/diff/）` : ""}` +
      (baselineManifest ? `；参照侧跨跑漂移 ${drift}/${probeResults.length} 条` : ""));
  } else {
    log(`[Part B] baseline 留档 ${probeResults.length} 条官方参照裁剪 → TEMP/roomtext/baseline/glyph_*.png`);
  }

  // 留档 manifest（baseline 写全量；compare 也写一份当前态供人工核查，不动 baseline/manifest）
  const manifest = {
    note: "房内中文位图字逐像素基线/对拍账目（r24 门禁件）：glyph_*/inroom_* 均取官方参照侧（'font-cmp'=font.png；后者含冻结世界背景仅人工参考），glyph_* 为探针场景黑底确定性裁剪（跨跑逐字节可复现，硬基线）。机制与强制显示口径见 scripts/e2e/roomtext.mjs 头注",
    mode,
    modeNote,
    head: HEAD,
    port: PORT,
    level: LEVEL,
    liveClock: live,
    bundle,
    fontFiles: fontFp,
    faces: faceResults.map((r) => ({
      id: r.id,
      desc: r.desc,
      canvas: r.canvas,
      ink: r.ink,
      keyCmp: mode === "compare" ? (r.cmp ? (r.cmp.equal ? "PASS 逐字节相同" : `FAIL diff=${r.cmp.diff} bbox=${r.cmp.bbox.join(",")}`) : "缺参照侧") : "baseline 未判",
      inroomSha: r.cropB ? sha(fromB64(r.cropB)) : null,
      texts: r.objects,
    })),
    strings: probeResults.map((r) => ({ slug: r.slug, group: r.group, text: r.text, size: r.size, align: r.align ?? "left", maxWidth: r.maxWidth ?? 0, alpha: r.alpha ?? 1, refInk: r.ref.ink, refSize: r.ref.size, refSha: r.ref.sha, refDrift: r.refDrift ?? null, prodInk: r.prod ? r.prod.ink : null, prodSha: r.prod ? r.prod.sha : null, equal: r.prod ? r.equal : null })),
  };
  if (mode === "baseline") writeFileSync(join(BASELINE_DIR, "manifest.json"), JSON.stringify(manifest, null, 2));
  else writeFileSync(join(OUTDIR, "compare-report.json"), JSON.stringify(manifest, null, 2));
} catch (e) {
  // 失败诊断：现场读数随异常一并吐出（finally 会收掉浏览器与 server，不留僵尸）
  pumping = false;
  log(`诊断：异常 ${String((e && e.stack) || e).split("\n").slice(0, 3).join(" / ")}`);
  const ginfo = pageA && (await pageA.evaluate(() => globalThis.__rt.info()).catch(() => null));
  if (ginfo) log(`诊断 info：${JSON.stringify(ginfo)}`);
  const scs = pageA && (await pageA.evaluate(() => `${globalThis.__pp.steps} 步；` + globalThis.__pp.game.scene.getScenes(false).map((x) => `${x.scene.key}:${x.scene.settings.active ? "A" : "I"}`).join(" ")).catch(() => "(不可读)"));
  log(`诊断 步进数与场景（A=活动 I=闲置）：${scs}`);
  for (const x of [...fails, ...warnLines, ...errLines].slice(0, 12)) log(`诊断 页侧：${String(x).slice(0, 300)}`);
  throw e;
} finally {
  await browser.close().catch(() => {});
  server.kill("SIGTERM");
}

if (warnLines.length) fails.push(`Phaser 纹理/位图字告警 ${warnLines.length} 条：${warnLines.slice(0, 3).join(" | ")}`);
if (fails.length) {
  log(`roomtext[${MODE}]: ${fails.length} 项 FAIL`);
  for (const f of fails) log(`  ✗ ${f}`);
  process.exit(1);
}
log(
  mode === "compare"
    ? `roomtext[compare]: ALL PASS（${faceResults.length} 面产品侧对官方参照逐字节相同；${probeResults.length} 串探针仅诊断，不判红）`
    : `roomtext[baseline]: 官方参照侧留档完成（${faceResults.length} 面 inroom + ${probeResults.length} 串 glyph → TEMP/roomtext/baseline/）——${modeNote}`,
);
process.exit(0);
