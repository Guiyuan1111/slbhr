/**
 * 客户端帧预算基准（r3 起）：headless chromium + 真服 + 双页入房，页面内打点采样。
 *
 * 口径（perfopt3 STEP1 同款，全部数字、无图判读）：
 *   - 每帧 game.events PRE_STEP→POST_STEP（update 段，含全局管理器+场景）/ PRE_STEP→POST_RENDER
 *     （帧总）/ 渲染段 = 帧总−update 段；p50/p95/p99/avg。
 *   - game.loop.rawDelta / actualFps → 有效 fps（帧数/时长）与步进间隔分布。
 *   - performance.memory（--enable-precise-memory-info）40ms 采样正增量累计 = 分配速率近似
 *     （负跳变≤-200KB 记一次 GC drop）。
 *   - mechTarget 调用计数（机关平滑路径）。
 *   - 渲染段细分探针（r7r 起，缺省开，零分配定长包装仅计数器自增；旧快照无对应字段，
 *     --compare 打 "-" 兼容）：
 *     · gl.drawArrays 计数+顶点数累计（drawcall 数/quad 数≈verts/6，Phaser 3.90 flush 逐 batch entry 走 drawArrays）
 *     · gl.bindTexture 计数（纹理绑定频次）
 *     · gl.blendFunc/blendFuncSeparate 计数（=setBlendMode 实际切换，Phaser 仅在混合模式真变时调）
 *     · WebGLPipeline.flush/bind 计数（批次 flush 数/pipeline 绑定数）
 *     · Canvas 渲染器 batchSprite 计数（软光栅逐精灵绘制数；gl=null 自动走此支）
 *   - 双渲染器各跑一轮：WebGL（真机主路径；headless SwiftShader 的 present 阻塞为环境项，
 *     见报告归因）与 Canvas（stub WebGL；软光栅全在主线程，渲染段可比）。
 *
 * 用法：
 *   node benchmark/perf-client.mjs [--level forest_01] [--secs 8] --save <label>
 *   node benchmark/perf-client.mjs --compare <label>          # 与快照对比打印前后表
 *   node benchmark/perf-client.mjs --cdp http://<宿主IP>:9222 --host <本机对宿主可达IP> --save r7-realgpu
 *                              # 真机口径：渲染跑在远程 Chrome 的真实 GPU 上（宿主 Windows 先开
 *                              # chrome --remote-debugging-port=9222 --remote-allow-origins=*）
 *   node benchmark/perf-client.mjs --gpu [--display :9] --save <label>
 *                              # VM 内真 GPU：有头跑在 vmwgfx Xorg（sudo systemd-run --unit=xorg9
 *                              # Xorg :9 -noreset 起显示）+ --ignore-gpu-blocklist——实测 renderer=
 *                              # SVGA3D（宿主 GPU 经 VMware 虚拟化转发）。headless（含 new headless
 *                              # channel=chromium）恒 SwiftShader，GPU 路径必须有真显示；Xvfb 也不行
 *                              # （GLX 软渲染）。绝对值含虚拟化 present 开销，A/B 相对比较有效；
 *                              # 裸机金标准仍走 --cdp。
 * 产物：benchmark/results/client-<label>.json
 */
import { spawn, execSync } from "node:child_process";
import { writeFileSync, readFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { networkInterfaces } from "node:os";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const RESULTS = join(ROOT, "benchmark", "results");
const PORT = 3617;
const args = process.argv.slice(2);
const argOf = (n, d) => (args.includes(`--${n}`) ? args[args.indexOf(`--${n}`) + 1] : d);
const LEVEL = argOf("level", "forest_01");
const SECS = Number(argOf("secs", "8"));
const argSave = argOf("save", undefined);
const argCompare = argOf("compare", undefined);
const argCdp = argOf("cdp", undefined); // 远程真机模式：playwright connectOverCDP 目标
const argHost = argOf("host", undefined); // cdp 模式下本机对远程可达的地址（默认自动取第一个非 lo IPv4）
const argGpu = args.includes("--gpu"); // VM 内真 GPU：有头 + --ignore-gpu-blocklist（vmwgfx SVGA3D）
const argDisplay = argOf("display", ":9"); // gpu 模式的 X display（vmwgfx 真显示）
const argDumpDl = args.includes("--dumpdl"); // 采样后一次性显示清单分解（depth/type/texture 聚合，剖析用，正常跑零成本）
const log = (...a) => console.log("[client]", ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function localIp() {
  for (const list of Object.values(networkInterfaces())) {
    for (const ni of list || []) if (ni.family === "IPv4" && !ni.internal) return ni.address;
  }
  throw new Error("未找到非 lo IPv4 地址（--host 手动指定）");
}
const HOST_BIND = argCdp ? "0.0.0.0" : "127.0.0.1";
const BASE = `http://${argCdp ? (argHost ?? localIp()) : "127.0.0.1"}:${PORT}`;

function startServer() {
  const child = spawn(process.execPath, ["--import", "tsx", join(ROOT, "packages", "server", "src", "index.ts")], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT), FW_HOST: HOST_BIND, FW_WIND_PHASE: "0" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("server 启动超时")), 60000);
    const ondata = (buf) => {
      const s = String(buf);
      if (s.includes("EADDRINUSE")) { clearTimeout(timer); reject(new Error("端口被占用")); }
      else if (s.includes("http+ws")) { clearTimeout(timer); resolve(child); }
    };
    child.stdout.on("data", ondata);
    child.stderr.on("data", () => {});
    child.on("exit", (code) => { clearTimeout(timer); reject(new Error("server 提前退出: " + code)); });
  });
}

async function enterAs(page, mode, roomCode) {
  await page.goto(`${BASE}/?level=${LEVEL}`, { waitUntil: "domcontentloaded" });
  await page.fill("#password", "client-pw");
  if (mode === "join") await page.fill("#roomcode", roomCode);
  await page.click(mode === "create" ? "#btn-create" : "#btn-join");
  await page.waitForSelector("#menu", { state: "hidden", timeout: 15000 });
  await page.waitForFunction(() => /房间码 [^（\s]{4,}/.test(document.querySelector("#hud-room")?.textContent ?? ""), null, { timeout: 20000 });
  return (await page.textContent("#hud-room")).match(/房间码 ([^（\s]+)/)?.[1] ?? "";
}

/** 页内打点钩子（安装后 window.__prof 收集；数字口径见文件头注） */
const HOOK = `(() => {
  const g = window.__fw;
  const scene = g.scene.getScene("Game");
  const P = window.__prof = { frames: [], mechCalls: 0, setDepth: 0 };
  const origMT = scene.mechTarget.bind(scene);
  scene.mechTarget = (...a) => { P.mechCalls++; return origMT(...a); };
  for (const cls of ["Image", "Sprite", "Container", "TileSprite", "BitmapText"]) {
    const p = Phaser.GameObjects[cls]?.prototype;
    if (p?.setDepth) { const o = p.setDepth; p.setDepth = function (...a) { P.setDepth++; return o.apply(this, a); }; }
  }
  // r12 写入计数探针（仅自增计数，零行为改动）：量化「每帧强写」面——
  // 相机弹簧 applyCam(force) 与 HUD 反缩放补偿、以及机关位姿 setter 的静止态残留写入。
  P.camZoom = 0; P.camCenter = 0; P.setPos = 0; P.setAngleW = 0; P.setScaleW = 0; P.setTextureW = 0;
  const CB = Phaser.cameras?.Base?.prototype;
  if (CB?.setZoom) { const o = CB.setZoom; CB.setZoom = function (...a) { P.camZoom++; return o.apply(this, a); }; }
  if (CB?.centerOn) { const o = CB.centerOn; CB.centerOn = function (...a) { P.camCenter++; return o.apply(this, a); }; }
  for (const cls of ["Image", "Sprite", "Container", "BitmapText"]) {
    const p = Phaser.GameObjects[cls]?.prototype;
    if (!p) continue;
    if (p.setPosition) { const o = p.setPosition; p.setPosition = function (...a) { P.setPos++; return o.apply(this, a); }; }
    if (p.setAngle) { const o = p.setAngle; p.setAngle = function (...a) { P.setAngleW++; return o.apply(this, a); }; }
    if (p.setScale) { const o = p.setScale; p.setScale = function (...a) { P.setScaleW++; return o.apply(this, a); }; }
    if (p.setTexture) { const o = p.setTexture; p.setTexture = function (...a) { P.setTextureW++; return o.apply(this, a); }; }
  }
  // r7r 渲染段细分探针（零分配：定长签名包装，仅计数器自增；采样窗内累计，COLLECT 汇总）
  P.draws = 0; P.verts = 0; P.texBinds = 0; P.blendSets = 0; P.flushes = 0; P.pipeBinds = 0; P.batchSprites = 0;
  if (g.renderer.gl) {
    const gl = g.renderer.gl;
    const origDA = gl.drawArrays.bind(gl);
    gl.drawArrays = function (mode, first, count) { P.draws++; P.verts += count; return origDA(mode, first, count); };
    const origBT = gl.bindTexture.bind(gl);
    gl.bindTexture = function (target, tex) { P.texBinds++; return origBT(target, tex); };
    const origBF = gl.blendFunc.bind(gl);
    gl.blendFunc = function (s, d) { P.blendSets++; return origBF(s, d); };
    const origBFS = gl.blendFuncSeparate.bind(gl);
    gl.blendFuncSeparate = function (s, d, sa, da) { P.blendSets++; return origBFS(s, d, sa, da); };
    const PL = Phaser.Renderer.WebGL.WebGLPipeline.prototype;
    const origFlush = PL.flush;
    PL.flush = function (isPostFlush) { P.flushes++; return origFlush.call(this, isPostFlush); };
    const origBind = PL.bind;
    PL.bind = function (currentShader) { P.pipeBinds++; return origBind.call(this, currentShader); };
  } else {
    const CR = Phaser.Renderer.Canvas?.CanvasRenderer?.prototype;
    if (CR?.batchSprite) {
      const origBS = CR.batchSprite;
      CR.batchSprite = function (sprite, frame, camera, ptm) { P.batchSprites++; return origBS.call(this, sprite, frame, camera, ptm); };
    }
  }
  let f = null;
  g.events.on("prestep", (time) => {
    f = { t: time, raw: g.loop.rawDelta, _t0: performance.now() };
    if (performance.memory) f.heap = performance.memory.usedJSHeapSize;
  });
  g.events.on("poststep", () => { if (f) f._t1 = performance.now(); });
  g.events.on("postrender", () => {
    if (!f) return;
    const t2 = performance.now();
    f.total = t2 - f._t0;
    f.update = (f._t1 ?? t2) - f._t0;
    P.frames.push(f);
    f = null;
  });
  let gpu = "";
  try {
    const c = document.createElement("canvas");
    const gl = c.getContext("webgl2") || c.getContext("webgl");
    const dbg = gl && gl.getExtension("WEBGL_debug_renderer_info");
    if (dbg && gl) gpu = String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL));
  } catch {}
  return { renderer: g.renderer.type === 2 ? "webgl" : "canvas", children: scene.children.length, gpu };
})()`;

const COLLECT = `(() => {
  const P = window.__prof;
  let posSum = 0, gcDrops = 0;
  for (let i = 1; i < P.frames.length; i++) {
    const d = (P.frames[i].heap ?? 0) - (P.frames[i - 1].heap ?? 0);
    if (d > 0) posSum += d;
    else if (d < -200 * 1024) gcDrops++;
  }
  const dtMs = (P.frames[P.frames.length - 1].t - P.frames[0].t) || 1;
  const fr = P.frames;
  const q = (k, p) => { const s = fr.map((x) => x[k]).sort((a, b) => a - b); return +s[Math.min(s.length - 1, Math.floor((s.length - 1) * p))].toFixed(3); };
  const avg = (k) => +(fr.reduce((x, y) => x + (y[k] ?? 0), 0) / fr.length).toFixed(3);
  return {
    frames: fr.length,
    secs: +(dtMs / 1000).toFixed(1),
    effectiveFps: +(fr.length / dtMs * 1000).toFixed(1),
    rawP50: q("raw", 0.5), rawP95: q("raw", 0.95),
    totalP50: q("total", 0.5), totalP95: q("total", 0.95), totalAvg: avg("total"),
    updateP50: q("update", 0.5), updateP95: q("update", 0.95), updateAvg: avg("update"),
    renderAvg: +(avg("total") - avg("update")).toFixed(3),
    allocKBs: +(posSum / 1024 / (dtMs / 1000)).toFixed(0),
    gcDrops,
    mechCalls: P.mechCalls,
    setDepth: P.setDepth,
    camZoom: P.camZoom, camCenter: P.camCenter, setPos: P.setPos,
    setAngleW: P.setAngleW, setScaleW: P.setScaleW, setTextureW: P.setTextureW,
    draws: P.draws, verts: P.verts, texBinds: P.texBinds, blendSets: P.blendSets,
    flushes: P.flushes, pipeBinds: P.pipeBinds, batchSprites: P.batchSprites,
    renderer: window.__fw.renderer.type === 2 ? "webgl" : "canvas",
  };
})()`;

/** 显示清单一次性分解（--dumpdl 才跑）：按 depth|type|texture 聚合对象数，热点表输入 */
const DUMPDL = `(() => {
  const scene = window.__fw.scene.getScene("Game");
  const agg = new Map();
  const walk = (list, inherited) => {
    for (const ch of list) {
      const tex = ch.texture?.key ?? (ch.type === "Container" ? "" : "?");
      const d = ch.depth !== 0 ? ch.depth : inherited;
      const k = d + "|" + ch.type + "|" + tex;
      const e = agg.get(k) ?? { n: 0, visible: 0 };
      e.n++; if (ch.visible) e.visible++;
      agg.set(k, e);
      if (ch.type === "Container" || ch.type === "Layer") walk(ch.list ?? [], d);
    }
  };
  walk(scene.children.list, 0);
  return [...agg.entries()].map(([k, v]) => { const [depth, type, tex] = k.split("|"); return { depth: +depth, type, tex, n: v.n, vis: v.visible }; }).sort((a, b) => a.depth - b.depth || b.n - a.n);
})()`;

async function runOnce(server, browser, rendererMode) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 960 } });
  if (rendererMode === "canvas") {
    await ctx.addInitScript(() => {
      const orig = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
        if (type === "webgl" || type === "webgl2" || type === "experimental-webgl") return null;
        return orig.call(this, type, ...rest);
      };
    });
  }
  const a = await ctx.newPage();
  const b = await ctx.newPage();
  const errs = [];
  a.on("pageerror", (e) => errs.push(String(e)));
  b.on("pageerror", (e) => errs.push(String(e)));
  const code = await enterAs(a, "create", "");
  await enterAs(b, "join", code);
  await a.waitForFunction(() => window.__fwInit?.net?.room?.state?.phase === "started", null, { timeout: 20000 });
  await sleep(2000); // 稳态（相机弹簧/平滑收敛）
  const meta = await a.evaluate(HOOK);
  await sleep(SECS * 1000);
  const r = await a.evaluate(COLLECT);
  if (argDumpDl) {
    const dl = await a.evaluate(DUMPDL);
    let tot = 0;
    for (const d of dl) { tot += d.n; console.log(`  [dl] depth=${String(d.depth).padEnd(5)} ${d.type.padEnd(12)} ${String(d.tex).padEnd(14)} n=${d.n} vis=${d.vis}`); }
    console.log(`  [dl] 合计 ${tot} 对象`);
  }
  await ctx.close();
  r.pageErrors = errs;
  r.sceneChildren = meta.children;
  r.gpu = meta.gpu || "";
  if (!remoteGpu && meta.gpu) remoteGpu = meta.gpu;
  log(`${rendererMode}: fps=${r.effectiveFps} 帧总 p50=${r.totalP50}/avg=${r.totalP50 && r.totalAvg}ms update p50=${r.updateP50}ms 分配=${r.allocKBs}KB/s gc=${r.gcDrops} setDepth=${r.setDepth} camZoom=${r.camZoom} camCenter=${r.camCenter} setPos=${r.setPos} setAngle=${r.setAngleW} setScale=${r.setScaleW} setTex=${r.setTextureW} draws=${r.draws}(${r.verts}v) tex=${r.texBinds} blend=${r.blendSets} flush=${r.flushes} pipe=${r.pipeBinds}${r.batchSprites ? ` bspr=${r.batchSprites}` : ""}`);
  if (errs.length) log(`${rendererMode} 页面错误:`, errs.join("; "));
  return r;
}

const server = await startServer();
let browser;
let remoteGpu = "";
if (argCdp) {
  browser = await chromium.connectOverCDP(argCdp);
  log(`CDP 远程模式: ${argCdp}（游戏服 ${BASE}，渲染跑在远程浏览器真机 GPU）`);
} else {
  browser = await chromium.launch({
    channel: process.env.FW_BROWSER_CHANNEL ?? (process.platform === "win32" ? "msedge" : undefined),
    headless: !argGpu,
    args: [
      "--mute-audio",
      "--enable-precise-memory-info",
      "--disable-background-timer-throttling",
      "--disable-renderer-backgrounding",
      // vmwgfx(SVGA3D) 在 Chromium GPU 黑名单内——不解除则恒落 SwiftShader；
      // gpu-rasterization 让栅格化也走 GPU 路径
      ...(argGpu ? ["--ignore-gpu-blocklist", "--enable-gpu-rasterization"] : []),
    ],
    ...(argGpu ? { env: { ...process.env, DISPLAY: argDisplay } } : {}),
  });
  if (argGpu) log(`VM 内真 GPU 模式: DISPLAY=${argDisplay} 有头 + ignore-gpu-blocklist（期待 renderer=SVGA3D）`);
}
let webgl, canvas;
try {
  webgl = await runOnce(server, browser, "webgl");
  canvas = await runOnce(server, browser, "canvas");
} finally {
  await browser.close().catch(() => {});
  try { server.kill(); } catch {}
  await sleep(400);
  try { server.kill("SIGKILL"); } catch {}
}

const results = {
  meta: {
    label: argSave ?? argCompare ?? "(run)",
    level: LEVEL,
    secs: SECS,
    git: execSync("git rev-parse --short HEAD", { cwd: ROOT }).toString().trim(),
    date: new Date().toISOString(),
    node: process.version,
    note: argGpu
      ? "VM 内真 GPU 口径：vmwgfx SVGA3D（宿主 GPU 虚拟化），绝对值含虚拟化 present 开销，A/B 相对可比"
      : "WebGL=headless SwiftShader（present 阻塞为环境项，JS 面可比）；Canvas=软光栅全主线程（渲染段可比）",
    mode: argCdp ? `remote-cdp ${argCdp}` : argGpu ? `local-xorg-gpu ${argDisplay}` : "local-headless",
    remoteGpu: remoteGpu || undefined,
  },
  webgl,
  canvas,
};

const line = (name, b, c) => console.log(`${name.padEnd(26)} ${String(b ?? "-").padStart(10)} → ${String(c ?? "-").padStart(10)}`);
console.log("\n=== 汇总 ===");
console.log(`            WebGL: fps=${webgl.effectiveFps} 帧总avg=${webgl.totalAvg}ms (update ${webgl.updateAvg}/render ${webgl.renderAvg}) 分配=${webgl.allocKBs}KB/s gc=${webgl.gcDrops} setDepth=${webgl.setDepth}`);
console.log(`            Canvas: fps=${canvas.effectiveFps} 帧总avg=${canvas.totalAvg}ms (update ${canvas.updateAvg}/render ${canvas.renderAvg}) 分配=${canvas.allocKBs}KB/s gc=${canvas.gcDrops} setDepth=${canvas.setDepth}`);

if (argSave || argCompare) mkdirSync(RESULTS, { recursive: true });
if (argSave) {
  writeFileSync(join(RESULTS, `client-${argSave}.json`), JSON.stringify(results, null, 2));
  console.log(`已存档 client-${argSave}.json`);
}
if (argCompare) {
  const fp = join(RESULTS, `client-${argCompare}.json`);
  if (!existsSync(fp)) throw new Error(`快照不存在: ${fp}`);
  const base = JSON.parse(readFileSync(fp, "utf8"));
  console.log(`\n===== 对比：${argCompare}（${base.meta.git}）→ 当前（${results.meta.git}）=====`);
  for (const key of ["webgl", "canvas"]) {
    console.log(`--- ${key} ---`);
    for (const m of ["effectiveFps", "totalP50", "totalAvg", "updateP50", "updateAvg", "renderAvg", "allocKBs", "gcDrops", "setDepth", "mechCalls", "camZoom", "camCenter", "setPos", "setAngleW", "setScaleW", "setTextureW", "draws", "verts", "texBinds", "blendSets", "flushes", "pipeBinds", "batchSprites"]) {
      line(m, base[key][m], results[key][m]);
    }
  }
  if (webgl.pageErrors.length || canvas.pageErrors.length) { console.log("⚠ 页面错误"); process.exitCode = 1; }
}
