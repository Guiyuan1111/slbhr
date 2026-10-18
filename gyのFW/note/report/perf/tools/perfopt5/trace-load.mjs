/**
 * r5 冷启全链路剖析：CDP Tracing + 资源瀑布 + 主线程分桶（DCL→MenuReady）。
 * 产出（纯数字表，文字模型可读）：
 *  - 里程碑：nav start / DCL / __fw ready / Menu active（页内 rAF 级 mark，非 40ms 轮询量化）
 *  - 逐资源瀑布：startTime/duration/transfer/decoded/initiator
 *  - trace 主线程分桶：EvaluateScript / Decode Image / 网络 receive / FunctionCall / 其他
 *  - 网络请求 trace 侧时间线（send→first byte→finish）
 * 用法：node --import tsx note/report/perf/tools/perfopt5/trace-load.mjs [rounds] [outPrefix]
 * 已知限制：playwright CDPSession 的 Tracing 流在本环境未回收（trace 事件 0，落在
 * dataCollected/tracingComplete.stream 双路径均空）——里程碑/资源瀑布/页内钩子数据完整
 * （本档 STEP1 主数据源），trace 分桶需求由 probe-decode.mjs 的页内钩子替代覆盖。
 */
import { spawn } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..", "..");
const PORT = 3571;
const BASE = `http://127.0.0.1:${PORT}`;
const LEVEL = "forest_01";

const rounds = Number(process.argv[2] ?? 2);
const outPrefix = process.argv[3] ?? "trace";
const log = (...a) => console.log("[r5]", ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function startServer() {
  const child = spawn(process.execPath, ["--import", "tsx", join(ROOT, "packages", "server", "src", "index.ts")], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT), FW_HOST: "127.0.0.1" },
    stdio: ["ignore", "pipe", "pipe"],
    detached: true,
  });
  child.negate = true; // 标记：进程组杀死
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("server 启动超时")), 60000);
    const ondata = (buf) => {
      const s = String(buf);
      if (s.includes("EADDRINUSE")) { clearTimeout(timer); reject(new Error("端口被占用")); }
      else if (s.includes("http+ws")) { clearTimeout(timer); resolve(child); }
    };
    child.stdout.on("data", ondata);
    child.stderr.on("data", (b) => process.stderr.write(b));
    child.on("exit", (code) => { clearTimeout(timer); reject(new Error("server 提前退出: " + code)); });
  });
}

/** 页内细粒度里程碑 mark（rAF 循环检测，非轮询量化） */
const INIT_MARKS = `
(() => {
  const marks = window.__marks = { fwReady: 0, menuActive: 0, bootCreate: 0 };
  const check = () => {
    const g = globalThis.__fw;
    if (g && !marks.fwReady) marks.fwReady = performance.now();
    if (g && g.scene && g.scene.isActive && g.scene.isActive("Menu") && !marks.menuActive) {
      marks.menuActive = performance.now();
      try { performance.mark("menuActive"); } catch {}
    }
    requestAnimationFrame(check);
  };
  requestAnimationFrame(check);
})();
`;

const TRACE_CATEGORIES = [
  "devtools.timeline",
  "disabled-by-default-devtools.timeline",
  "loading,rail",
  "blink.user_timing",
].join(",");

async function runRound(browser, round) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 960 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push(String(e)));
  await page.addInitScript(INIT_MARKS);
  const cdp = await ctx.newCDPSession(page);
  const chunks = [];
  await cdp.send("Tracing.start", { categories: TRACE_CATEGORIES, options: "sampling-frequency:10000", transferMode: "ReturnAsStream" });
  const collect = (ev) => { if (ev.method === "dataCollected") chunks.push(...ev.params.value); };
  cdp.on("Tracing.dataCollected", collect);
  const t0 = Date.now();
  await page.goto(`${BASE}/?level=${LEVEL}`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => globalThis.__fw?.scene?.isActive?.("Menu"), null, { timeout: 30000 });
  await page.waitForTimeout(250); // 让尾帧 trace 落盘
  const traces = await new Promise(async (resolve) => {
    cdp.once("Tracing.tracingComplete", async (ev) => {
      cdp.off("Tracing.dataCollected", collect);
      const stream = ev?.params?.stream;
      if (stream) {
        try {
          let data = "";
          for (;;) {
            const r = await cdp.send("IO.read", { handle: stream });
            data += r.base64Encoded ? Buffer.from(r.data, "base64").toString() : r.data;
            if (r.eof) break;
          }
          await cdp.send("IO.close", { handle: stream }).catch(() => {});
          resolve(data ? JSON.parse(data).traceEvents : []);
          return;
        } catch { /* 流式失败回落 chunks */ }
      }
      resolve(chunks);
    });
    await cdp.send("Tracing.end");
  });
  const info = await page.evaluate(() => {
    const marks = globalThis.__marks ?? {};
    const nav = performance.getEntriesByType("navigation")[0];
    const res = performance.getEntriesByType("resource").map((e) => ({
      name: e.name.replace(location.origin, ""),
      start: +e.startTime.toFixed(1),
      dur: +e.duration.toFixed(1),
      fetchStart: +(e.fetchStart ?? e.startTime).toFixed(1),
      respEnd: +e.responseEnd.toFixed(1),
      transfer: e.transferSize ?? 0,
      decoded: e.decodedBodySize ?? 0,
      type: e.initiatorType,
    }));
    return { marks, nav: { dcl: nav?.domContentLoadedEventEnd, loadEvt: nav?.loadEventEnd, respStart: nav?.responseStart, ttfb: nav?.responseStart }, res };
  });
  await ctx.close();
  return { round, wallMenuMs: Date.now() - t0, info, traces, errs };
}

function bucketMainThread(traces, fromUs, toUs) {
  // 主线程 slice：D 的 track events（ph=“X” Complete）与旧式 devtools.timeline 事件
  const buckets = {};
  let total = 0;
  for (const ev of traces) {
    if (!ev || ev.ph !== "X") continue;
    const ts = ev.ts ?? 0, dur = ev.dur ?? 0;
    if (ts + dur < fromUs || ts > toUs || dur <= 0) continue;
    const tid = ev.tid;
    // 只统计浏览器主线程：排除 renderer 其他线程的 name 集不可靠——按 name 分桶时全归主线程常见
    const name = ev.name;
    if (!name) continue;
    let key;
    if (name === "EvaluateScript") key = "EvaluateScript(JS parse+exec)";
    else if (name === "Decode Image" || name === "ImageDecodeTask") key = "Decode Image";
    else if (name === "ResourceReceiveData") key = "ResourceReceiveData(网络收包)";
    else if (name === "XHRLoad") key = "XHRLoad";
    else if (name === "RequestAnimationFrame" || name === "FireAnimationFrame") key = "rAF";
    else if (name === "TimerFire" || name === "FireTimer") key = "Timer(setTimeout 驱动的 Phaser 步)";
    else if (name === "FunctionCall" || name === "v8.callFunction") key = "FunctionCall(JS 业务)";
    else if (name === "ParseHTML" || name === "ParseAuthorStyleSheet") key = "Parse";
    else if (name === "Layout" || name === "UpdateLayoutTree") key = "Layout";
    else if (name === "Paint" || name === "PrePaint" || name === "Layerize") key = "Paint";
    else if (name === "GPUTask" || name.startsWith("GPU")) key = "GPU";
    else if (name === "V8.Execute" || name === "V8.CompileCode" || name === "v8.compile") key = "V8 compile/exec";
    else if (name === "Commit" || name === "UpdateLayers" || name === "DrawFrame") key = "提交合成";
    else if (name === "Profiler") key = "(采样器自身)";
    else if (name === "ThreadDescription" || name === "Metadata" || name === "process_uptime_seconds") continue;
    else key = "其他:" + name;
    // 与窗重叠部分计入
    const s = Math.max(ts, fromUs), e = Math.min(ts + dur, toUs);
    buckets[key] = (buckets[key] ?? 0) + (e - s);
    total += e - s;
  }
  const arr = Object.entries(buckets).sort((a, b) => b[1] - a[1]);
  return { totalUs: total, buckets: arr };
}

function networkTimeline(traces) {
  const reqs = new Map();
  for (const ev of traces) {
    if (!ev || ev.ph !== "I" && ev.ph !== "R" && ev.ph !== "X" && ev.ph !== "B" && ev.ph !== "E") continue;
    const n = ev.name, p = ev.args?.data ?? {};
    if (n === "ResourceSendRequest" || n === "ResourceWillBeSent") {
      const id = p.requestId;
      if (id != null && !reqs.has(id)) reqs.set(id, { id, url: p.url ?? "", sendTs: ev.ts, prio: p.priority });
    } else if (n === "ResourceReceiveResponse") {
      const r = reqs.get(p.requestId); if (r) r.firstByteTs = ev.ts;
    } else if (n === "ResourceReceiveData") {
      const r = reqs.get(p.requestId); if (r) { r.lastDataTs = ev.ts; r.bytes = (r.bytes ?? 0) + (p.encodedDataLength ?? 0); }
    } else if (n === "ResourceFinish") {
      const r = reqs.get(p.requestId); if (r) r.finishTs = ev.ts;
    }
  }
  return [...reqs.values()].sort((a, b) => a.sendTs - b.sendTs);
}

const server = await startServer();
const browser = await chromium.launch({
  channel: process.env.FW_BROWSER_CHANNEL ?? undefined,
  headless: true,
  args: ["--mute-audio", "--enable-precise-memory-info"],
});
const out = { rounds: [] };
try {
  for (let i = 1; i <= rounds; i++) {
    const r = await runRound(browser, i);
    log(`round${i}: wall(DCL 等待返回→Menu active)=${r.wallMenuMs}ms 页内menuActive=${r.info.marks.menuActive?.toFixed?.(1) ?? r.info.marks.menuActive}ms 资源=${r.info.res.length} trace事件=${r.traces.length} err=${r.errs.length}`);
    out.rounds.push(r);
  }
} finally {
  await browser.close().catch(() => {});
  try { process.kill(-server.pid, "SIGKILL"); } catch {}
  try { server.kill("SIGKILL"); } catch {}
}

// ==== 汇总解析 ====
for (const r of out.rounds) {
  const { marks, nav, res } = r.info;
  console.log(`\n===== round${r.round} 里程碑（页内 performance.now，ms）=====`);
  console.log(`  nav TTFB=${nav.ttfb?.toFixed(1)} DCL=${nav.dcl?.toFixed(1)} loadEvt=${nav.loadEvt?.toFixed(1)} | __fwReady=${(+marks.fwReady).toFixed(1)} menuActive=${(+marks.menuActive).toFixed(1)}`);
  console.log(`  DCL→fwReady=${(+marks.fwReady - nav.dcl).toFixed(1)}  fwReady→menuActive=${(+marks.menuActive - +marks.fwReady).toFixed(1)}  DCL→menuActive=${(+marks.menuActive - nav.dcl).toFixed(1)}`);
  console.log(`  资源瀑布（按 start 排序，ms；transfer/decoded B）：`);
  const sorted = [...res].sort((a, b) => a.start - b.start);
  for (const e of sorted) {
    console.log(`    ${String(e.start).padStart(7)} →${String(e.respEnd).padStart(8)}  dur=${String(e.dur).padStart(7)}  ${e.type.padEnd(15)} tr=${String(e.transfer).padStart(8)} dec=${String(e.decoded).padStart(8)}  ${e.name.slice(0, 70)}`);
  }
  // trace 分桶：DCL → menuActive（页内 ms → us）
  const dclUs = nav.dcl * 1000;
  const menuUs = +marks.menuActive * 1000;
  const b = bucketMainThread(r.traces, dclUs, menuUs);
  console.log(`  trace 主线程分桶（DCL→menuActive 窗，重叠计时，合计 ${(b.totalUs / 1000).toFixed(1)}ms——含并行 slice 重叠可能>墙钟）：`);
  for (const [k, v] of b.buckets.slice(0, 22)) console.log(`    ${String((v / 1000).toFixed(1)).padStart(8)}ms  ${k}`);
  // fwReady 前的分桶（DCL→fwReady 多为 Phaser chunk eval）
  const b2 = bucketMainThread(r.traces, dclUs, Math.min(dclUs + 1000, +marks.fwReady * 1000));
  console.log(`  trace 主线程分桶（DCL→fwReady 窗）：`);
  for (const [k, v] of b2.buckets.slice(0, 10)) console.log(`    ${String((v / 1000).toFixed(1)).padStart(8)}ms  ${k}`);
  // 网络时间线
  const net = networkTimeline(r.traces);
  console.log(`  trace 网络时间线（send→firstByte→finish，ms 相对 nav）：`);
  for (const q of net) {
    const base = net[0].sendTs;
    console.log(`    send=${((q.sendTs - base) / 1000).toFixed(1).padStart(6)} fb=${(((q.firstByteTs ?? q.sendTs) - base) / 1000).toFixed(1).padStart(7)} fin=${(((q.finishTs ?? q.lastDataTs ?? q.sendTs) - base) / 1000).toFixed(1).padStart(7)} bytes=${String(q.bytes ?? 0).padStart(8)} ${(q.url ?? "").slice(0, 70)}`);
  }
  // 保存原始 trace 供复查
  mkdirSync(join(ROOT, "TEMP", "perfopt5"), { recursive: true });
  writeFileSync(join(ROOT, "TEMP", "perfopt5", `${outPrefix}-round${r.round}-trace.json`), JSON.stringify(r.traces));
}
mkdirSync(join(ROOT, "TEMP", "perfopt5"), { recursive: true });
  writeFileSync(join(ROOT, "TEMP", "perfopt5", `${outPrefix}-info.json`), JSON.stringify(out, (k, v) => (k === "traces" ? undefined : v), 2));
log("剖析完成，原始 trace 已存 TEMP/perfopt5/");
