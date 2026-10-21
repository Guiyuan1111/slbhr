/**
 * 驻留内存与分配流水拆账（r14）：每个状态切换事件单独计量「分配多少 / 峰值多少 / 留下多少」。
 *
 * 面：r9 的 perf-idle 只读 `JSHeapUsedSize` 端点，测出 temple 态 58.2MB 而 menu 8.4MB、
 * game-idle 9MB，但既不强制 GC、也不拆构成。r14 基线（旧口径）先暴露了两个必须分开的问题：
 *   - **分配流水**（churn）：进一次选关冷烘焙堆从 11.7 冲到 85.5MB（GC 后 26.9）→ 一次烘焙
 *     造出 ≈74MB 垃圾、在飞峰值 ≈33MB；重进（结果缓存命中、零烘焙）仍造 ≈16MB/次。
 *   - **驻留**（resident）：强制 GC 后真正留下的字节（menu 11.7 → temple 26.9 → game 22.8）。
 * 两者优化手段完全不同（前者减分配/减峰值，后者减缓存常驻），故本量具把每个事件都做成
 * 「GC 基线 → 页内 20ms 记录器 → 触发 → 稳定 → GC 终值」，churn 与 resident 同时出。
 *
 * 指标：
 *   - heapGCMB：强制 `HeapProfiler.collectGarbage` 后的堆 = 真实常驻（canvas 像素在
 *     Chromium 里计入 usedJSHeapSize 的外部缓冲，故纹理/画布会体现在此）
 *   - churnMB：事件期间 raw 堆峰值 − GC 基线 = 该事件造出的字节（含随后被回收的垃圾）
 *   - residentDeltaMB：事件后 GC 值 − 事件前 GC 值 = 该事件真正留下的字节
 *   - peakJobMB / bakeSamples：选关树分帧烘焙在飞期间的 typed array 峰值与在飞采样数
 *     （jobs>0 的样本数即「这次到底烘没烘」的判据，命中缓存时恒 0）
 *   - texMB / audioMB / groundMB / treeMB：纹理逐源 w·h·4、解码后 PCM、地面 LRU、树结果位图
 *   - dom / objs：DOM 节点数与场景显示对象数
 * 口径注：game 与 temple-after-game 属第二文档线（enterAs 整页 goto 会重置模块级缓存），
 * 与菜单线只可比 heapGC / tex / audio 这类文档级字节。
 *
 * 用法：
 *   node --import tsx benchmark/perf-resident.mjs [--port 3568] --save <label>
 *   node --import tsx benchmark/perf-resident.mjs --compare r14-before [--no-build]
 * 产物：benchmark/results/resident-<label>.json
 */
import { spawn, execSync } from "node:child_process";
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { enterAs, log, startServer, waitForStarted } from "../scripts/e2e/lib.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const RESULTS = join(ROOT, "benchmark", "results");
const argSave = process.argv.includes("--save") ? process.argv[process.argv.indexOf("--save") + 1] : undefined;
const argCompare = process.argv.includes("--compare") ? process.argv[process.argv.indexOf("--compare") + 1] : undefined;
const NO_BUILD = process.argv.includes("--no-build");
const LEVEL = process.env.FW_R14_LEVEL ?? "forest_01";
const PORT = Number(process.env.FW_R14_PORT ?? 3568);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

if (!NO_BUILD) {
  log("构建客户端…");
  execSync("npm run build", { cwd: ROOT, stdio: "inherit" });
}

/** 页内采集：常驻字节分解（全只读，不改任何状态） */
function collectPage() {
  const g = globalThis.__fw;
  if (!g) return { ok: false };
  const px = (w, h) => w * h * 4;
  let texMB = 0, canvasTexMB = 0;
  const texTop = [];
  for (const key of Object.keys(g.textures.list)) {
    const t = g.textures.list[key];
    let b = 0, isCanvas = 0;
    for (const s of Object.values(t.source || [])) {
      const img = s && s.image;
      if (!img || !img.width) continue;
      if (typeof HTMLCanvasElement !== "undefined" && img instanceof HTMLCanvasElement) isCanvas += px(img.width, img.height);
      b += px(img.width, img.height);
    }
    texMB += b;
    canvasTexMB += isCanvas;
    if (b > 200000) texTop.push([key, +(b / 1048576).toFixed(2)]);
  }
  let audioMB = 0;
  const audioTop = [];
  try {
    for (const k of g.cache.audio.keys || []) {
      const buf = g.cache.audio.get(k);
      if (!buf) continue;
      const b = (buf.length || 0) * (buf.numberOfChannels || 1) * 4;
      audioMB += b;
      if (b > 200000) audioTop.push([k, +(b / 1048576).toFixed(2)]);
    }
  } catch (e) { audioTop.push(["ERR", String(e)]); }
  const sceneObjs = {};
  for (const s of g.scene.scenes) if (s.scene.isActive() && s.children) sceneObjs[s.scene.key] = s.children.length;
  const gc = globalThis.__fwGroundStats ? globalThis.__fwGroundStats() : null;
  const tb = globalThis.__fwTreeStats ? globalThis.__fwTreeStats() : null;
  return {
    ok: true,
    texMB: +(texMB / 1048576).toFixed(2),
    canvasTexMB: +(canvasTexMB / 1048576).toFixed(2),
    texTop: texTop.sort((a, b) => b[1] - a[1]).slice(0, 6),
    audioMB: +(audioMB / 1048576).toFixed(2),
    audioTop: audioTop.sort((a, b) => b[1] - a[1]).slice(0, 6),
    audioCount: (g.cache.audio.keys || []).length,
    ground: gc,
    tree: tb,
    dom: document.querySelectorAll("*").length,
    sceneObjs,
    heapRawMB: +(performance.memory.usedJSHeapSize / 1048576).toFixed(1),
  };
}

/** 页内判定：本轮烘焙已落定（贴图已上纹理 且 无在飞任务）。
 *  单看 jobs===0 会在 Temple.create 尚未执行时立即为真，故必须配贴图条件。 */
function treeIdlePage() {
  const t = globalThis.__fwTreeStats?.();
  return !!globalThis.__fw?.textures?.exists("tree-all") && (!t || t.jobs === 0);
}

/** 页内 20ms 记录器：只记峰值/计数，避免 node 侧往返把采样窗吃掉 */
function installRecorder() {
  globalThis.__recStart = () => {
    globalThis.__rec = { peakJobMB: 0, peakHeapMB: 0, samples: 0, jobSamples: 0, resultMB: 0, t0: performance.now() };
    clearInterval(globalThis.__recTimer);
    globalThis.__recTimer = setInterval(() => {
      const t = globalThis.__fwTreeStats?.();
      const r = globalThis.__rec;
      const heap = performance.memory.usedJSHeapSize / 1048576;
      r.samples++;
      if (t) {
        if (t.jobMB > r.peakJobMB) r.peakJobMB = +t.jobMB.toFixed(2);
        if (t.jobs > 0) r.jobSamples++;
        if (t.resultMB > r.resultMB) r.resultMB = t.resultMB;
      }
      if (heap > r.peakHeapMB) r.peakHeapMB = +heap.toFixed(1);
    }, 20);
  };
  globalThis.__recStop = () => {
    clearInterval(globalThis.__recTimer);
    return { ...globalThis.__rec, ms: +(performance.now() - globalThis.__rec.t0).toFixed(0) };
  };
}

const server = await startServer(PORT, {});
const browser = await chromium.launch({
  headless: true,
  args: ["--mute-audio", "--enable-precise-memory-info", "--disable-background-timer-throttling", "--disable-renderer-backgrounding"],
});
const out = [];
const errs = [];
let cdp = null;
let pageA = null;

async function heapRaw() {
  return await pageA.evaluate(() => +(performance.memory.usedJSHeapSize / 1048576).toFixed(1));
}
async function forceGC() {
  await cdp.send("HeapProfiler.collectGarbage");
  await sleep(200);
  return heapRaw();
}

/** 一事件：GC 基线 → 记录器 → fire → （可选）等在飞烘焙落定 → 稳定 → GC 终值 + 字节分解 */
async function event(label, fire, settleMs = 1600, extra = {}, until = null) {
  const base = await forceGC();
  await pageA.evaluate(installRecorder);
  await pageA.evaluate(() => globalThis.__recStart());
  if (fire) await pageA.evaluate(fire);
  if (until) {
    // 分帧烘焙在本机（软件渲染 + 8ms/帧预算）可能要数秒；不等它落定就把在飞 typed array
    // 当成"常驻"，会得出虚高的 GC 后字节（基线首跑即为此，见 r14 报告口径注）
    await pageA.waitForFunction(until, null, { timeout: 20000, polling: 60 }).catch(() => {});
  }
  await sleep(settleMs);
  const rec = await pageA.evaluate(() => ({ ...globalThis.__recStop() }));
  const rawPeak = rec.peakHeapMB;
  const detail = await pageA.evaluate(collectPage);
  const gc = await forceGC();
  const r = {
    mode: label,
    ...detail,
    ...rec,
    ...extra,
    gcBaseMB: base,
    heapGCMB: gc,
    churnMB: +(rawPeak - base).toFixed(1),
    residentDeltaMB: +(gc - base).toFixed(1),
  };
  log(
    `${label.padEnd(20)} GC基线 ${String(base).padStart(6)} → 峰 ${String(rawPeak).padStart(6)} → GC ${String(gc).padStart(6)}MB` +
      `  流水 ${String(r.churnMB).padStart(6)}MB  驻留Δ ${String(r.residentDeltaMB).padStart(6)}MB` +
      `  | 纹 ${r.texMB}(画布 ${r.canvasTexMB}) 音 ${r.audioMB}/${r.audioCount}键 地面 ${r.ground?.bytesMB ?? "-"}/${r.ground?.size ?? "-"}张 树 job峰 ${r.peakJobMB}→结果 ${r.tree?.resultMB ?? "-"}` +
      `  烘样 ${r.jobSamples}/${r.samples}  DOM ${r.dom} objs ${Object.values(r.sceneObjs).reduce((x, y) => x + y, 0)}`,
  );
  return r;
}

try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 960 } });
  pageA = await ctx.newPage();
  pageA.on("pageerror", (e) => errs.push("A:" + String(e)));
  cdp = await ctx.newCDPSession(pageA);
  await cdp.send("HeapProfiler.enable");
  await pageA.goto(`http://127.0.0.1:${PORT}/?level=${LEVEL}`, { waitUntil: "domcontentloaded" });
  await pageA.waitForFunction(() => globalThis.__fw?.scene?.isActive("Menu"), null, { timeout: 30000, polling: 20 });
  await pageA.waitForFunction(() => globalThis.__fw?.textures?.exists("ground"), null, { timeout: 30000, polling: 50 });

  out.push(await event("menu（暖装落定）", null, 1200, { lineage: 1 }));
  out.push(await event("temple 首入（冷烘）", () => { globalThis.__fw.scene.getScene("Menu").scene.start("Temple"); }, 800, { lineage: 1 }, treeIdlePage));
  out.push(await event("temple 重进（命中）", () => { globalThis.__fw.scene.getScene("Temple").scene.restart(); }, 2200, { lineage: 1 }));
  out.push(await event("temple 三进（命中）", () => { globalThis.__fw.scene.getScene("Temple").scene.restart(); }, 2200, { lineage: 1 }));
  await ctx.close();

  // —— 第二文档线（游戏线）：另开 context，避免与菜单线的缓存史互相污染
  const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 960 } });
  const a2 = await ctx2.newPage();
  a2.on("pageerror", (e) => errs.push("A2:" + String(e)));
  const cdp2 = await ctx2.newCDPSession(a2);
  await cdp2.send("HeapProfiler.enable");
  pageA = a2;
  cdp = cdp2;
  const code = await enterAs(a2, PORT, "create", "", LEVEL);
  const ctxB = await browser.newContext({ viewport: { width: 1280, height: 960 } });
  const b = await ctxB.newPage();
  b.on("pageerror", (e) => errs.push("B:" + String(e)));
  await enterAs(b, PORT, "join", code, LEVEL);
  await waitForStarted(a2);
  await sleep(2500); // 相机收敛 + 首帧稳定
  // game 驻留：无操作静置 2s，流水即「在房内挂机时每秒造多少垃圾」
  out.push(await event("game（开局静止）", null, 2000, { lineage: 2 }));
  // 离房回选关：地面 LRU + 树冷烘叠加后的常驻
  out.push(await event("temple 离房后（冷烘）", () => { globalThis.__fwLeaveToMenu?.(); }, 800, { lineage: 2 }, treeIdlePage));

  await ctxB.close();
  await ctx2.close();
} finally {
  await browser.close();
  server.kill("SIGTERM");
}
await browser.close();
server.kill("SIGTERM");

if (errs.length) {
  log("页面错误（失败）：", errs.join("; "));
  process.exit(1);
}

const snapshot = {
  meta: {
    label: argSave ?? null,
    git: execSync("git rev-parse --short HEAD", { cwd: ROOT }).toString().trim(),
    date: new Date().toISOString(),
    node: process.version,
    level: LEVEL,
    note: "churnMB=事件期间 raw 堆峰 − GC 基线（该事件造出的字节，含随后回收的垃圾）；heapGCMB/residentDeltaMB=强制 HeapProfiler.collectGarbage 后的真实常驻与其增量；peakJobMB=选关树分帧烘焙在飞 typed array 峰值；烘样 jobs>0 的采样数（0=结果缓存命中、零烘焙）；texMB 逐源 w·h·4（含透明边距）；audioMB 解码后 PCM；game 与 temple 离房后属第二文档线",
  },
  results: out,
};
if (argSave) {
  writeFileSync(join(RESULTS, `resident-${argSave}.json`), JSON.stringify(snapshot, null, 2));
  log(`快照：results/resident-${argSave}.json`);
}
if (argCompare) {
  const p = join(RESULTS, `resident-${argCompare}.json`);
  if (!existsSync(p)) {
    log(`对比快照不存在: ${p}`);
    process.exit(1);
  }
  const prev = JSON.parse(readFileSync(p, "utf8"));
  const prevBy = Object.fromEntries(prev.results.map((r) => [r.mode, r]));
  const num = (r, path) => {
    const [a, b] = path.split(".");
    const v = b ? r[a]?.[b] : r[a];
    return typeof v === "number" ? v : null;
  };
  console.log("\n[resident] 前后对比（流水=事件造出的字节，驻留Δ=GC 后留下的字节，结果/地面=缓存字节；负值=更省）");
  const KEYS = ["churnMB", "heapGCMB", "residentDeltaMB", "peakJobMB", "peakHeapMB", "tree.resultMB", "ground.bytesMB", "texMB", "audioMB"];
  for (const r of out) {
    const q = prevBy[r.mode];
    if (!q) { console.log(`  ${r.mode.padEnd(22)}（前快照无此态）`); continue; }
    console.log(`  ${r.mode}`);
    for (const k of KEYS) {
      const now = num(r, k);
      const was = num(q, k);
      if (now === null || was === null) continue;
      const d = now - was;
      console.log(`    ${k.padEnd(17)} ${String(was).padStart(7)} → ${String(now).padStart(7)} (${d >= 0 ? "+" : ""}${+d.toFixed(2)})`);
    }
    console.log(`    ${"烘样 jobs>0".padEnd(17)} ${String(q.jobSamples + "/" + q.samples).padStart(7)} → ${String(r.jobSamples + "/" + r.samples).padStart(7)}`);
  }
}
