/**
 * 驻留内存拆账（r14）：各驻留态"真正占着的字节"，并区分垃圾与常驻。
 *
 * 面：r9 的 perf-idle 只读 `JSHeapUsedSize` 端点，测出 temple 态 58.2MB 而 menu 8.4MB、
 * game-idle 9MB——但从不强制 GC，也从不拆解这 58MB 由什么构成（选关树分帧烘焙的 typed
 * array 是"已分配未回收的垃圾"还是"模块级缓存常驻"？图集/音频解码缓冲/地面 LRU 各占多少？）。
 * 本量具把两件事分开：
 *   - heapRaw：JSHeapUsedSize 端点（与 r9 同口径，可直接对照旧快照）
 *   - heapGC：CDP `HeapProfiler.collectGarbage` 之后再读 → **真实常驻**
 *   - texMB：TextureManager 逐源 w·h·4 求和（含 top 键名），画布源/图片源分列
 *   - audioMB：`cache.audio` 逐键 AudioBuffer length·channels·4（解码后 PCM，非磁盘 mp3 字节）
 *   - groundMB / treeMB：我方模块级缓存自报（GameScene 地面 LRU、选关树烘焙结果）
 *   - peakJobMB / peakHeapMB：进入选关时 40ms 轮询取到的在飞 typed array 峰值与堆峰值
 *     （分帧烘焙的瞬时占用只有轮询能看见，驻留端点会把它当垃圾抹掉）
 *   - dom / objs：DOM 节点数与场景显示对象数
 * 态：menu（大厅驻留，暖装落定）→ temple（首入，含分帧烘焙）→ temple-again（重进，命中缓存）
 *     → game（开局静止）→ temple-after（玩过再回选关，看缓存叠加后的常驻）
 * 用法：
 *   node --import tsx benchmark/perf-resident.mjs [--port 3568] [--save r14-before] [--no-build]
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
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

if (!NO_BUILD) {
  log("构建客户端…");
  execSync("npm run build", { cwd: ROOT, stdio: "inherit" });
}

/** 页内一次性采集：常驻字节分解（全部只读，不改任何状态） */
const COLLECT = `(() => {
  const g = globalThis.__fw;
  if (!g) return { ok: false };
  const px = (w, h) => w * h * 4;
  let texMB = 0, canvasTexMB = 0;
  const perTex = [];
  for (const key of Object.keys(g.textures.list)) {
    const t = g.textures.list[key];
    let b = 0, isCanvas = false;
    for (const s of Object.values(t.source || [])) {
      const img = s && s.image;
      if (!img || !img.width) continue;
      if (img instanceof HTMLCanvasElement) { isCanvas = true; canvasTexMB += px(img.width, img.height); }
      b += px(img.width, img.height);
    }
    texMB += b;
    if (b > 200000) perTex.push([key, +(b / 1048576).toFixed(2)]);
  }
  let audioMB = 0;
  const audioKeys = [];
  try {
    for (const k of g.cache.audio.keys || []) {
      const buf = g.cache.audio.get(k);
      if (!buf) continue;
      const b = (buf.length || 0) * (buf.numberOfChannels || buf.channelCount || 1) * 4;
      audioMB += b;
      if (b > 200000) audioKeys.push([k, +(b / 1048576).toFixed(2)]);
    }
  } catch (e) { audioKeys.push(["ERR", String(e)]); }
  const scenes = {};
  for (const s of g.scene.scenes) if (s.scene.isActive()) scenes[s.scene.key] = s.children ? s.children.length : 0;
  const gc = globalThis.__fwGroundStats ? globalThis.__fwGroundStats() : null;
  const tb = globalThis.__fwTreeStats ? globalThis.__fwTreeStats() : null;
  return {
    ok: true,
    texMB: +(texMB / 1048576).toFixed(2),
    canvasTexMB: +(canvasTexMB / 1048576).toFixed(2),
    texTop: perTex.sort((a, b) => b[1] - a[1]).slice(0, 6),
    audioMB: +(audioMB / 1048576).toFixed(2),
    audioTop: audioKeys.sort((a, b) => b[1] - a[1]).slice(0, 6),
    audioCount: (g.cache.audio.keys || []).length,
    ground: gc, tree: tb,
    dom: document.querySelectorAll("*").length,
    sceneObjs: scenes,
    heapRawMB: +(performance.memory.usedJSHeapSize / 1048576).toFixed(1),
  };
})()`;

/** 强制 GC 后再读堆（口径：真实常驻，不含待回收垃圾） */
async function heapAfterGC(cdp, page) {
  await cdp.send("HeapProfiler.collectGarbage");
  await sleep(120);
  const m = await page.evaluate(`performance.memory.usedJSHeapSize`);
  return +(m / 1048576).toFixed(1);
}

/** 烘焙期峰值轮询：分帧任务在飞时的 typed array 字节 + 堆峰值（40ms 采样，落到 temple 快照） */
const PEAK = `(() => {
  const g = globalThis.__fw;
  const tb = globalThis.__fwTreeStats ? globalThis.__fwTreeStats() : null;
  return { jobMB: tb ? tb.jobMB : 0, resultMB: tb ? tb.resultMB : 0, heapMB: +(performance.memory.usedJSHeapSize / 1048576).toFixed(1) };
})()`;

async function pollPeak(page, doneExpr, timeoutMs = 30000) {
  const t0 = Date.now();
  let peakJobMB = 0, peakHeapMB = 0, samples = 0;
  while (Date.now() - t0 < timeoutMs) {
    const p = await page.evaluate(PEAK);
    samples++;
    if (p.jobMB > peakJobMB) peakJobMB = p.jobMB;
    if (p.heapMB > peakHeapMB) peakHeapMB = p.heapMB;
    if (await page.evaluate(doneExpr)) break;
    await sleep(40);
  }
  return { peakJobMB: +peakJobMB.toFixed(2), peakHeapMB: +peakHeapMB.toFixed(1), peakSamples: samples, peakMs: Date.now() - t0 };
}

async function snap(name, page, cdp, extra = {}) {
  await sleep(800); // 态切换余波（场景 create/分帧烘焙/纹理绑定）
  const raw = await page.evaluate(COLLECT);
  const heapGC = await heapAfterGC(cdp, page);
  const after = await page.evaluate(COLLECT);
  const r = { mode: name, ...after, ...extra, heapGCMB: heapGC, heapRawBeforeGC: raw.heapRawMB };
  const tree = r.tree ? `job ${r.tree.jobMB}/result ${r.tree.resultMB}MB` + (r.peakJobMB !== undefined ? `(峰 ${r.peakJobMB})` : "") : "-";
  log(`${name.padEnd(14)} heap ${String(r.heapRawBeforeGC).padStart(5)}MB →GC ${String(heapGC).padStart(5)}MB  纹 ${String(r.texMB).padStart(6)}MB(画布 ${r.canvasTexMB})  音 ${String(r.audioMB).padStart(6)}MB/${r.audioCount}键  地面 ${r.ground ? r.ground.bytesMB : "-"}MB/${r.ground ? r.ground.size : "-"}张  树 ${tree}  DOM ${r.dom}  objs ${Object.values(r.sceneObjs).reduce((x, y) => x + y, 0)}`);
  return r;
}

const PORT = Number(process.env.FW_R14_PORT ?? 3568);
const server = await startServer(PORT, {});
const browser = await chromium.launch({
  headless: true,
  args: ["--mute-audio", "--enable-precise-memory-info", "--disable-background-timer-throttling", "--disable-renderer-backgrounding"],
});
const out = [];
const errs = [];
try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 960 } });
  const a = await ctx.newPage();
  a.on("pageerror", (e) => errs.push("A:" + String(e)));
  const cdp = await ctx.newCDPSession(a);
  await cdp.send("Performance.enable");
  await cdp.send("HeapProfiler.enable");
  await a.goto(`http://127.0.0.1:${PORT}/?level=${LEVEL}`, { waitUntil: "domcontentloaded" });
  await a.waitForFunction(() => globalThis.__fw?.scene?.isActive("Menu"), null, { timeout: 30000, polling: 20 });
  // 等暖装落定（与 r9 menu 态同条件：地面图集已在纹理里）
  await a.waitForFunction(() => globalThis.__fw?.textures?.exists("ground"), null, { timeout: 30000, polling: 50 });
  out.push(await snap("menu", a, cdp));

  await a.evaluate(() => globalThis.__fw?.scene?.getScene("Menu")?.scene?.start("Temple"));
  const peak = await pollPeak(a, `!!globalThis.__fw?.textures?.exists("tree-all")`);
  await a.waitForFunction(() => globalThis.__fw?.scene?.isActive("Temple"), null, { timeout: 30000, polling: 20 });
  await a.waitForFunction(() => globalThis.__fw?.textures?.exists("tree-all"), null, { timeout: 30000, polling: 50 });
  out.push(await snap("temple", a, cdp, peak));

  // 重进选关（模块级结果缓存命中路径）：同场景 restart，先于游戏段
  await a.evaluate(() => globalThis.__fw?.scene?.getScene("Temple")?.scene?.restart());
  await a.waitForFunction(() => globalThis.__fw?.scene?.isActive("Temple"), null, { timeout: 30000, polling: 20 });
  await a.waitForFunction(() => globalThis.__fw?.textures?.exists("tree-all"), null, { timeout: 30000, polling: 50 });
  out.push(await snap("temple-again", a, cdp));

  // 开局静止：双人房（单方入房停在 ready，永远等不到 started）。
  // 注意 lineage：enterAs 会整页 goto → 模块级缓存（树结果/地面 LRU/关卡 JSON）随
  // 文档重置。故 game 与 temple-after-game 属**第二文档线**（游戏线常驻），
  // menu/temple/temple-again 属第一文档线（菜单线常驻）——两线各自内部可比，
  // 跨线只比 heapGC 与 tex/audio 这类文档级字节。
  const ctxB = await browser.newContext({ viewport: { width: 1280, height: 960 } });
  const b = await ctxB.newPage();
  b.on("pageerror", (e) => errs.push("B:" + String(e)));
  const code = await enterAs(a, PORT, "create", "", LEVEL);
  await enterAs(b, PORT, "join", code, LEVEL);
  await waitForStarted(a);
  await sleep(2000); // 相机收敛 + 首帧稳定
  out.push(await snap("game", a, cdp, { lineage: 2 }));

  // 玩过再回选关：地面 LRU + 树结果 + 关卡 JSON 缓存叠加后的常驻
  // （leaveToMenu 目标即 Temple；此文档树缓存为冷态，故同采烘焙峰值）
  await a.evaluate(() => globalThis.__fwLeaveToMenu?.());
  const peak2 = await pollPeak(a, `!!globalThis.__fw?.textures?.exists("tree-all")`);
  await a.waitForFunction(() => globalThis.__fw?.scene?.isActive("Temple"), null, { timeout: 30000, polling: 40 });
  out.push(await snap("temple-after-game", a, cdp, { ...peak2, lineage: 2 }));

  await ctxB.close();
  await ctx.close();
} finally {
  await browser.close();
  server.kill("SIGTERM");
}

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
    note: "heapGC=强制 HeapProfiler.collectGarbage 后的常驻；texMB 为逐源 w·h·4 估算（含透明边距，非可见面积）；audioMB 为解码后 PCM 字节；peakJobMB/peakHeapMB 为分帧烘焙在飞期间的 40ms 轮询峰值；game 与 temple-after-game 属第二文档线（enterAs 整页 goto 会重置模块级缓存）",
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
  console.log("\n[resident] 前后对比（堆=强制 GC 后常驻 MB；负值=更省）");
  for (const key of ["heapGCMB", "texMB", "audioMB", "dom"]) {
    console.log(`  ${key}`);
    for (const r of out) {
      const q = prevBy[r.mode];
      if (!q) continue;
      const d = r[key] - q[key];
      console.log(`    ${r.mode.padEnd(18)} ${String(q[key]).padStart(7)} → ${String(r[key]).padStart(7)} (${d >= 0 ? "+" : ""}${+d.toFixed(2)})`);
    }
  }
  for (const key of ["peakJobMB", "peakHeapMB"]) {
    console.log(`  ${key}（仅 temple 态有采样）`);
    for (const r of out) {
      const q = prevBy[r.mode];
      if (!q || r[key] === undefined || q[key] === undefined) continue;
      const d = r[key] - q[key];
      console.log(`    ${r.mode.padEnd(18)} ${String(q[key]).padStart(7)} → ${String(r[key]).padStart(7)} (${d >= 0 ? "+" : ""}${+d.toFixed(2)})`);
    }
  }
  const fields = { ground: ["bytesMB", "size"], tree: ["jobMB", "resultMB"] };
  for (const [key, subs] of Object.entries(fields)) {
    for (const sub of subs) {
      console.log(`  ${key}.${sub}`);
      for (const r of out) {
        const q = prevBy[r.mode];
        if (!q) continue;
        const cv = r[key] ? r[key][sub] : 0;
        const pv = q[key] ? q[key][sub] : 0;
        if (cv === undefined || pv === undefined) continue;
        console.log(`    ${r.mode.padEnd(18)} ${String(pv).padStart(7)} → ${String(cv).padStart(7)} (${cv - pv >= 0 ? "+" : ""}${+(cv - pv).toFixed(2)})`);
      }
    }
  }
}
