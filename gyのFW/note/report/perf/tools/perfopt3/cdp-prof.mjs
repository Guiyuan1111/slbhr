/**
 * CDP 剖析：CPU profile（self time 按函数聚合）+ Heap 分配采样（KB/s 按调用点聚合）。
 * Canvas 模式（stub WebGL）——软光栅全在主线程，render 成本可见。
 * 用法：node TEMP/perfopt3/cdp-prof.mjs [--mode idle|replay] [--secs 8] [--what cpu|heap|both]
 */
import { spawn } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
const PORT = 3597;
const args = process.argv.slice(2);
const argOf = (n, d) => (args.includes(`--${n}`) ? args[args.indexOf(`--${n}`) + 1] : d);
const MODE = argOf("mode", "idle");
const SECS = Number(argOf("secs", "8"));
const WHAT = argOf("what", "both");
const LEVEL = argOf("level", "forest_01");
const OUT = argOf("out", `cdp-${MODE}`);
const log = (...a) => console.error("[cdp]", ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function startServer() {
  const child = spawn(process.execPath, ["--import", "tsx", join(ROOT, "packages", "server", "src", "index.ts")], {
    cwd: ROOT, env: { ...process.env, PORT: String(PORT), FW_HOST: "127.0.0.1", FW_WIND_PHASE: "0" }, stdio: ["ignore", "pipe", "pipe"] });
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), 60000);
    const ondata = (buf) => { const s = String(buf); if (s.includes("EADDRINUSE")) { clearTimeout(timer); reject(new Error("EADDRINUSE")); } else if (s.includes("http+ws")) { clearTimeout(timer); resolve(child); } };
    child.stdout.on("data", ondata); child.stderr.on("data", () => {}); child.on("exit", (c) => reject(new Error("exit " + c)));
  });
}
async function enterAs(page, mode, code) {
  await page.goto(`http://127.0.0.1:${PORT}/?level=${LEVEL}`, { waitUntil: "domcontentloaded" });
  await page.fill("#password", "pw");
  if (mode === "join") await page.fill("#roomcode", code);
  await page.click(mode === "create" ? "#btn-create" : "#btn-join");
  await page.waitForSelector("#menu", { state: "hidden", timeout: 15000 });
  await page.waitForFunction(() => /房间码 [^（\s]{4,}/.test(document.querySelector("#hud-room")?.textContent ?? ""), null, { timeout: 20000 });
  return (await page.textContent("#hud-room")).match(/房间码 ([^（\s]+)/)?.[1] ?? "";
}

/** CPU profile 树聚合 self 时间（按 functionName+url+line），incl 时间按函数名聚合 */
function aggCpu(profile) {
  const { nodes, samples, timeDeltas } = profile;
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const self = new Map(); // nodeId → µs
  for (let i = 0; i < samples.length; i++) {
    const d = timeDeltas[i] ?? 0;
    if (d <= 0) continue;
    self.set(samples[i], (self.get(samples[i]) ?? 0) + d);
  }
  const label = (n) => {
    const cf = n.callFrame;
    const url = (cf.url || "").replace(/^.*\/dist\//, "dist/").replace(/^.*\/node_modules\//, "nm/");
    return `${cf.functionName || "(anon)"} @ ${url}:${cf.lineNumber + 1}`;
  };
  const selfByFn = new Map();
  for (const [id, us] of self) {
    const n = byId.get(id);
    if (!n) continue;
    const l = label(n);
    selfByFn.set(l, (selfByFn.get(l) ?? 0) + us);
  }
  // incl（按函数名，全树）
  const inclByFn = new Map();
  const childrenOf = new Map(nodes.map((n) => [n.id, n.children ?? []]));
  // 子树聚合：node 的 self + 子树
  const memo = new Map();
  const subtree = (id) => {
    if (memo.has(id)) return memo.get(id);
    let t = self.get(id) ?? 0;
    for (const c of childrenOf.get(id) ?? []) t += subtree(c);
    memo.set(id, t);
    return t;
  };
  for (const n of nodes) {
    const name = n.callFrame.functionName || "(anon)";
    // 只取「函数首次出现在 parent 链之外」太复杂——直接累加所有同名 node 的子树（会重复计递归，接受）
    inclByFn.set(name, (inclByFn.get(name) ?? 0) + subtree(n.id));
  }
  const totalUs = [...self.values()].reduce((a, b) => a + b, 0);
  return { totalUs, selfByFn, inclByFn };
}

/** heap sampling profile 聚合 */
function aggHeap(profile) {
  const head = profile.head;
  const samples = profile.samples;
  const selfByFn = new Map();
  let totalBytes = 0;
  // sampling 走 callframe 树的 leaf；V8SamplingHeapProfiler: head 树每节点 selfSize
  const walk = (node) => {
    const cf = node.callFrame;
    const url = (cf.url || "").replace(/^.*\/dist\//, "dist/").replace(/^.*\/node_modules\//, "nm/");
    const key = `${cf.functionName || "(anon)"} @ ${url}:${cf.lineNumber + 1}`;
    if (node.selfSize > 0) selfByFn.set(key, (selfByFn.get(key) ?? 0) + node.selfSize);
    totalBytes += node.selfSize;
    for (const c of node.children ?? []) walk(c);
  };
  walk(head);
  return { totalBytes, selfByFn };
}

const server = await startServer();
const browser = await chromium.launch({ headless: true, args: ["--mute-audio", "--enable-precise-memory-info", "--js-flags=--sampling-heap-profiler-suppress-randomness"] });
try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 960 } });
  await ctx.addInitScript(() => {
    const orig = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
      if (type === "webgl" || type === "webgl2" || type === "experimental-webgl") return null;
      return orig.call(this, type, ...rest);
    };
  });
  const a = await ctx.newPage();
  const b = await ctx.newPage();
  const code = await enterAs(a, "create", "");
  await enterAs(b, "join", code);
  await a.waitForFunction(() => window.__fwInit?.net?.room?.state?.phase === "started", null, { timeout: 20000 });
  await sleep(2000);
  const cdp = await ctx.newCDPSession(a);

  let timeline = null;
  if (MODE === "replay") {
    const routeDoc = JSON.parse(readFileSync(join(ROOT, "scripts", "e2e", "inputs", "routes", `${LEVEL}.json`), "utf8"));
    const KEYS = { fb: { up: "ArrowUp", left: "ArrowLeft", right: "ArrowRight" }, wg: { up: "KeyW", left: "KeyA", right: "KeyD" } };
    const evs = [];
    for (const [role, pg] of [["fb", a], ["wg", b]]) for (const ev of routeDoc[role]) evs.push({ t: Math.round(ev.f * (1000 / routeDoc.tickHz)) - 10, pg, key: KEYS[role][ev.dir], type: ev.type });
    evs.sort((x, y) => x.t - y.t);
    const totalMs = routeDoc.totalFrames * (1000 / routeDoc.tickHz);
    timeline = (async () => {
      const t0 = Date.now(); let i = 0;
      while (i < evs.length) {
        const wait = evs[i].t - (Date.now() - t0);
        if (wait > 0) await sleep(Math.min(wait, 100)); else await sleep(0);
        if (Date.now() - t0 >= evs[i].t) { await evs[i].pg.keyboard[evs[i].type](evs[i].key); i++; }
      }
      return totalMs;
    })();
  }

  const out = { meta: { mode: MODE, secs: SECS, level: LEVEL, renderer: "canvas" } };
  if (WHAT === "cpu" || WHAT === "both") {
    await cdp.send("Profiler.enable");
    await cdp.send("Profiler.setSamplingInterval", { interval: 500 });
    await cdp.send("Profiler.start");
    await sleep(SECS * 1000);
    const { profile } = await cdp.send("Profiler.stop");
    const { totalUs, selfByFn, inclByFn } = aggCpu(profile);
    out.cpu = {
      totalMs: +(totalUs / 1000).toFixed(1),
      selfTop: [...selfByFn.entries()].sort((x, y) => y[1] - x[1]).slice(0, 60).map(([k, v]) => [k, +(v / 1000).toFixed(2)]),
      inclTop: [...inclByFn.entries()].sort((x, y) => y[1] - x[1]).slice(0, 40).map(([k, v]) => [k, +(v / 1000).toFixed(2)]),
    };
  }
  if (WHAT === "heap" || WHAT === "both") {
    await cdp.send("HeapProfiler.enable");
    await cdp.send("HeapProfiler.startSampling", { samplingInterval: 512 });
    await sleep(SECS * 1000);
    const { profile } = await cdp.send("HeapProfiler.stopSampling");
    const { totalBytes, selfByFn } = aggHeap(profile);
    out.heap = {
      totalKB: +(totalBytes / 1024).toFixed(1),
      perSecKB: +(totalBytes / 1024 / SECS).toFixed(1),
      top: [...selfByFn.entries()].sort((x, y) => y[1] - x[1]).slice(0, 60).map(([k, v]) => [k, +(v / 1024).toFixed(2)]),
    };
  }
  if (timeline) await timeline;
  writeFileSync(join(ROOT, "TEMP", "perfopt3", `${OUT}.json`), JSON.stringify(out, null, 1));
  // 摘要打印
  if (out.cpu) {
    console.log(`\n=== CPU self TOP30（总 ${out.cpu.totalMs}ms / ${SECS}s = ${(out.cpu.totalMs / SECS).toFixed(2)}ms/s）===`);
    for (const [k, v] of out.cpu.selfTop.slice(0, 30)) console.log(String(v).padStart(9), "ms", k);
    console.log(`\n=== CPU incl TOP20 ===`);
    for (const [k, v] of out.cpu.inclTop.slice(0, 20)) console.log(String(v).padStart(9), "ms", k);
  }
  if (out.heap) {
    console.log(`\n=== Heap 分配 TOP30（${out.heap.perSecKB}KB/s）===`);
    for (const [k, v] of out.heap.top.slice(0, 30)) console.log(String(v).padStart(9), "KB", k);
  }
} finally {
  await browser.close().catch(() => {});
  try { server.kill(); } catch {}
  await sleep(400); try { server.kill("SIGKILL"); } catch {}
}
