/**
 * r7a 容量挂账归因探针（perfopt7）：把 r6b 的每房边际 CPU ≈6.4ms/s/房拆面。
 *
 * 背景：r6b（benchmark/perf-capacity.mjs）拟合 CPU% = 12.55 + 0.644×房，余 ~4.6ms/s/房
 * 挂账（ws 系统调用/房间定时器/GC/事件循环轮转，未深拆）。本探针用**真实服务器+真实 ws
 * 客户端**做差分模式阶梯，量具零改动（本文件独立；服务器零改动，仅用既有 FW_PATCH_MS 取证旋钮）。
 *
 * 模式（每房内容递增，斜率差=各面成本；全部走 ForestRoom 真生命周期）：
 *   lobby       每房 1 客户端，phase=lobby（tick 早退、1Hz ping、patch interval 空转、ws 闲连）
 *   sim-nopatch 双人到齐 started，无输入消息，FW_PATCH_MS=10000（无出站 patch；step+syncState+schema 写）
 *   sim-patch   双人 started，无输入消息，缺省 60Hz patch（timerMs-only 5B 包×2 端）
 *   idle        双人 started，15Hz/端全 false 输入（生产重发节奏，角色不动）
 *   walk        双人 started，walk 图案（r6b 主跑同款，玩家持续走动）
 *
 * 测量：/proc/<pid>/stat 的 utime 与 stime **分开**采（r6b 未拆）；每档 12s 窗，窗首窗尾同刻
 * 采齐（学 perf-capacity 的窗口尾对齐纪律）；patch 到达率/下行字节做 sanity；least squares 斜率。
 *
 * 用法：
 *   node note/report/perf/tools/perfopt7/capacity-attrib.mjs --modes lobby,sim-nopatch,sim-patch,idle,walk \
 *        --rooms 8,32,64 --secs 12 --repeat 2 --port 3697 --save r7
 *   node note/report/perf/tools/perfopt7/capacity-attrib.mjs --prof walk   --rooms 64 --secs 12 --port 3697
 *   node note/report/perf/tools/perfopt7/capacity-attrib.mjs --prof lobby  --rooms 64 --secs 12 --port 3697
 * 产物：benchmark/results/attrib-<label>-<mode>.json；prof 落 TEMP/perfopt7/prof/*.cpuprofile
 * （火焰解析另用 parse-cpuprofile.mjs）。服务器只绑 127.0.0.1。
 */
import { spawn, execSync } from "node:child_process";
import { writeFileSync, readFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import os from "node:os";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..", "..");
const TOOLS = dirname(fileURLToPath(import.meta.url));
const RESULTS = join(ROOT, "benchmark", "results");
const TEMP = join(ROOT, "TEMP", "perfopt7");
const args = process.argv.slice(2);
const argOf = (n, d) => (args.includes(`--${n}`) ? args[args.indexOf(`--${n}`) + 1] : d);

const MODES_ARG = String(argOf("modes", "lobby,sim-nopatch,sim-patch,idle,walk"));
const LADDER = String(argOf("rooms", "8,32,64")).split(",").map(Number).filter((n) => n > 0);
const SECS = Number(argOf("secs", "12"));
const REPEAT = Number(argOf("repeat", "1"));
const PORT = Number(argOf("port", 3697));
const LEVEL = String(argOf("level", "forest_01"));
const LABEL = String(argOf("save", "r7"));
const PROF_MODE = argOf("prof", undefined); // walk | lobby
const WALK_LADDER = String(argOf("walkRooms", "4,8,16,32,64")).split(",").map(Number);
const log = (...a) => console.log("[attrib]", ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const CLK_TCK = Number(execSync("getconf CLK_TCK").toString().trim()) || 100;

// ---- 模式定义 ----
const MODES = {
  "lobby": { pairs: false, driver: null, env: {} },
  "sim-nopatch": { pairs: true, driver: null, env: { FW_PATCH_MS: "10000" } },
  "sim-patch": { pairs: true, driver: null, env: {} },
  "idle": { pairs: true, driver: "idle", env: {} },
  "walk": { pairs: true, driver: "walk", env: {} },
};
const ladderOf = (mode) => (MODES[mode].driver === "walk" ? WALK_LADDER : LADDER);

// ---- ws 字节/包计数（学 perf-capacity：先包 globalThis.WebSocket 再 import colyseus.js）----
const WS_STAT = new WeakMap();
const RealWS = globalThis.WebSocket;
globalThis.WebSocket = class extends RealWS {
  constructor(...a) {
    super(...a);
    const st = { inB: 0, inPatch: 0, inMsg: 0, outB: 0, outN: 0 };
    WS_STAT.set(this, st);
    this.addEventListener("message", (ev) => {
      const d = ev.data;
      if (typeof d === "string") return;
      let u8;
      if (d instanceof ArrayBuffer) u8 = new Uint8Array(d);
      else if (ArrayBuffer.isView(d)) u8 = new Uint8Array(d.buffer, d.byteOffset, d.byteLength);
      if (!u8) return;
      st.inB += u8.length;
      if (u8[0] === 15) st.inPatch++;
      else if (u8[0] === 13 || u8[0] === 17) st.inMsg++;
    });
    const orig = this.send;
    this.send = (data) => {
      st.outB += typeof data === "string" ? Buffer.byteLength(data) : (data?.byteLength ?? data?.length ?? 0);
      st.outN++;
      return orig.call(this, data);
    };
  }
};
const { Client } = await import("colyseus.js");

// ---- /proc 采样：utime/stime 分开（r6b 只记合量）----
function procStatMs(pid) {
  const s = readFileSync(`/proc/${pid}/stat`, "utf8");
  const f = s.slice(s.lastIndexOf(")") + 2).split(" ");
  // f[k]=第 3+k 字段：utime=14→k=11，stime=15→k=12（含全部线程累计）；minflt=10→k=7
  return { u: Number(f[11]) * (1000 / CLK_TCK), s: Number(f[12]) * (1000 / CLK_TCK), mf: Number(f[7]) };
}
function procRssKB(pid) {
  const s = readFileSync(`/proc/${pid}/status`, "utf8");
  const m = s.match(/VmRSS:\s+(\d+)\s+kB/);
  return m ? Number(m[1]) : 0;
}
const median = (arr) => (arr.length ? [...arr].sort((a, b) => a - b)[Math.floor(arr.length / 2)] : 0);
// 最小二乘 y = a + b·x → 斜率 b（学 perf-capacity：边际成本以斜率为准）
function slope(pts) {
  const n = pts.length;
  if (n < 2) return { b: 0, a: pts[0]?.y ?? 0 };
  const sx = pts.reduce((s, p) => s + p.x, 0), sy = pts.reduce((s, p) => s + p.y, 0);
  const sxx = pts.reduce((s, p) => s + p.x * p.x, 0), sxy = pts.reduce((s, p) => s + p.x * p.y, 0);
  const b = (n * sxy - sx * sy) / (n * sxx - sx * sx);
  return { b, a: sy / n - (b * sx) / n };
}

function startServer(envExtra, profName) {
  const env = { ...process.env, PORT: String(PORT), FW_HOST: "127.0.0.1", FW_WIND_PHASE: "0", ...envExtra };
  const nodeArgs = ["--import", "tsx", join(ROOT, "packages", "server", "src", "index.ts")];
  if (args.includes("--traceGc")) nodeArgs.unshift("--trace-gc"); // NODE_OPTIONS 不允许 --trace-gc，直接进 node 参数
  if (profName) {
    mkdirSync(join(TEMP, "prof"), { recursive: true });
    env.NODE_OPTIONS = [
      process.env.NODE_OPTIONS ?? "",
      `--cpu-prof --cpu-prof-dir=${join(TEMP, "prof")} --cpu-prof-name=${profName}`,
      `--require ${join(TOOLS, "prof-exit.cjs")}`,
    ].join(" ").trim();
  }
  // --srvPrefix "cmd arg ..."：服务器进程外再包一层（如 strace -c -f），仅探针取证用
  const prefix = String(argOf("srvPrefix", "")).trim();
  const cmd = prefix ? prefix.split(/\s+/) : [];
  const child = (cmd.length ? spawn(cmd[0], [...cmd.slice(1), process.execPath, ...nodeArgs], { cwd: ROOT, env, stdio: ["ignore", "pipe", "pipe"] })
    : spawn(process.execPath, nodeArgs, { cwd: ROOT, env, stdio: ["ignore", "pipe", "pipe"] }));
  // server 实际 pid（有 prefix 时是其子进程，从端口反查）
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("server 启动超时")), 60000);
    const ondata = (buf) => {
      process.stdout.write(buf); // 透传（--trace-gc 在本机 Node 上写 stdout，不能吞）
      const s = String(buf);
      if (s.includes("EADDRINUSE")) { clearTimeout(timer); reject(new Error(`端口 ${PORT} 被占用`)); }
      else if (s.includes("http+ws")) {
        clearTimeout(timer);
        clearTimeout(timer);
        if (cmd.length) {
          // 有外层包壳（strace 等）：child.pid 是壳，真实 server pid 从端口反查
          setTimeout(() => {
            try {
              const out = execSync(`ss -ltnp | grep ':${PORT} '`).toString();
              const m = out.match(/pid=(\d+)/);
              child.resolvedPid = m ? Number(m[1]) : child.pid;
            } catch { child.resolvedPid = child.pid; }
            resolve(child);
          }, 300);
        } else resolve(child);
      }
    };
    child.stdout.on("data", ondata);
    child.stderr.on("data", (b) => process.stderr.write(b));
    child.on("exit", (code) => { clearTimeout(timer); reject(new Error("server 提前退出: " + code)); });
  });
}

// ---- 房间编排（学 perf-capacity）----
let client = null;
const recs = [];
async function resetClient() {
  client = new Client(`ws://127.0.0.1:${PORT}`);
  recs.length = 0;
}
async function joinPair() {
  const opts = { password: "", levelId: LEVEL };
  const a = await client.create("forest", opts);
  const b = await client.joinById(a.roomId, opts);
  const rec = {
    roomId: a.roomId, primary: a, secondary: b,
    stA: WS_STAT.get(a.connection.transport.ws), stB: WS_STAT.get(b.connection.transport.ws),
    phase: "", deaths: 0, restarts: 0, lastTrans: Date.now(),
  };
  for (const room of [a, b]) {
    for (const t of ["role", "ping", "sfx", "death", "finish", "pause-changed"]) room.onMessage(t, () => {});
  }
  recs.push(rec);
}
async function joinSingle() {
  const a = await client.create("forest", { password: "", levelId: LEVEL });
  const rec = { roomId: a.roomId, primary: a, stA: WS_STAT.get(a.connection.transport.ws), phase: "", deaths: 0, restarts: 0, lastTrans: Date.now() };
  for (const t of ["role", "ping", "sfx", "death", "finish", "pause-changed"]) a.onMessage(t, () => {});
  recs.push(rec);
}
async function waitPhase(pred, timeoutMs = 30000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    if (recs.every((r) => pred(r))) return Date.now() - t0;
    await sleep(150);
  }
  throw new Error(`等相位超时：${recs.filter((r) => !pred(r)).length} 房未就绪`);
}
const isStarted = (r) => String(r.primary.state?.phase ?? "") === "started";
const isLobby = (r) => String(r.primary.state?.phase ?? "") === "lobby";

let caretaker = null;
function startCaretaker() {
  caretaker = setInterval(() => {
    const now = Date.now();
    for (const r of recs) {
      const p = String(r.primary.state?.phase ?? "");
      if (p !== r.phase) {
        if ((p === "gameover" || p === "won") && r.phase === "started") r.deaths++;
        if (p === "gameover" || p === "won") {
          try { r.primary.send("restart", {}); r.restarts++; } catch { /* 下轮再试 */ }
        }
        r.phase = p;
        r.lastTrans = now;
      }
    }
  }, 400);
}

// ---- 输入驱动（学 perf-capacity：66ms 强制重发 15Hz；walk=前 8 拍←后 8 拍→，wg 相位 +13）----
const PAT_CYCLE = 27, PAT_WALK = 8;
let tick = 0, driver = null;
function inputFor(role, t) {
  const p = (t + (role === "wg" ? 13 : 0)) % PAT_CYCLE;
  if (MODES[currentMode].driver === "idle") return { up: false, left: false, right: false };
  if (MODES[currentMode].driver === "walk") return { up: false, left: p < PAT_WALK, right: p >= PAT_WALK && p < PAT_WALK * 2 };
  return { up: false, left: false, right: false };
}
function startDriver() {
  driver = setInterval(() => {
    tick++;
    for (const r of recs) {
      if (!r.secondary) continue;
      try {
        r.primary.send("input", { ...inputFor("fb", tick) });
        r.secondary.send("input", { ...inputFor("wg", tick) });
      } catch { /* 断线房交给守护 */ }
    }
  }, 66);
}
function stopIntervals() { try { clearInterval(driver); } catch {} try { clearInterval(caretaker); } catch {} driver = caretaker = null; }

// ---- 测量窗 ----
const meta = {
  git: execSync("git rev-parse --short HEAD", { cwd: ROOT }).toString().trim(),
  date: new Date().toISOString(),
  node: process.version, level: LEVEL, secsPerTier: SECS, port: PORT,
  clkTck: CLK_TCK, cores: os.cpus().length, host: "127.0.0.1",
};
let serverChild = null, serverPid = 0, currentMode = "?";

async function measureTier(roomsTotal) {
  const s0 = procStatMs(serverPid), g0 = procStatMs(process.pid);
  const snap = recs.map((r) => ({ rec: r, pA: r.stA.inPatch, bA: r.stA.inB, oA: r.stA.outB, timerMs: Number(r.primary.state?.timerMs ?? 0) }));
  const t0 = Date.now();
  await sleep(SECS * 1000);
  const wallMs = Date.now() - t0;
  const s1 = procStatMs(serverPid), g1 = procStatMs(process.pid);
  const minfltPerSec = +(((s1.mf - s0.mf) / (wallMs / 1000))).toFixed(0);
  const endSnap = recs.map((r) => ({ inPatch: r.stA.inPatch, inB: r.stA.inB, outB: r.stA.outB, timerMs: Number(r.primary.state?.timerMs ?? 0) }));
  const rssSamples = [];
  for (let i = 0; i < 3; i++) { rssSamples.push(procRssKB(serverPid)); await sleep(200); }

  const per = snap.map((s, i) => {
    const clean = (MODES[currentMode].pairs ? isStarted(s.rec) : isLobby(s.rec)) && s.rec.lastTrans < t0;
    const e = endSnap[i];
    return {
      patchPerSec: +((e.inPatch - s.pA) / (wallMs / 1000)).toFixed(2),
      downKBs: +((e.inB - s.bA) / 1024 / (wallMs / 1000)).toFixed(3),
      upKBs: +((e.outB - s.oA) / 1024 / (wallMs / 1000)).toFixed(3),
      driftPct: (MODES[currentMode].pairs && !MODES[currentMode].env.FW_PATCH_MS) && clean
        ? +(((wallMs - (e.timerMs - s.timerMs)) / wallMs) * 100).toFixed(2) : null,
    };
  });
  const driftVals = per.map((p) => p.driftPct).filter((v) => v != null);
  const utimePct = +((s1.u - s0.u) / wallMs * 100).toFixed(2);
  const stimePct = +((s1.s - s0.s) / wallMs * 100).toFixed(2);
  const cpuPct = +(utimePct + stimePct).toFixed(2);
  const genPct = +(((g1.u + g1.s) - (g0.u + g0.s)) / wallMs * 100).toFixed(1);
  const patchArr = per.map((p) => p.patchPerSec);
  const row = {
    roomsTotal,
    deaths: recs.reduce((n, r) => n + r.deaths, 0),
    restarts: recs.reduce((n, r) => n + r.restarts, 0),
    serverCpuPct: cpuPct, utimePct, stimePct,
    cpuMsPerRoom: +(cpuPct * 10 / roomsTotal).toFixed(2),
    utimeMsPerRoom: +(utimePct * 10 / roomsTotal).toFixed(2),
    stimeMsPerRoom: +(stimePct * 10 / roomsTotal).toFixed(2),
    serverRssKB: median(rssSamples),
    patchPerSecP50: +median(patchArr).toFixed(2),
    downKBsP50: +median(per.map((p) => p.downKBs)).toFixed(3),
    upKBsP50: +median(per.map((p) => p.upKBs)).toFixed(3),
    driftMaxPct: driftVals.length ? +Math.max(...driftVals).toFixed(2) : null,
    loadgenCpuPct: genPct,
  };
  console.log(
    `[${currentMode}] 房=${String(roomsTotal).padStart(3)} | CPU=${String(row.serverCpuPct).padStart(5)}% (u=${row.utimePct} s=${row.stimePct}) 每房=${row.cpuMsPerRoom}ms/s (u=${row.utimeMsPerRoom} s=${row.stimeMsPerRoom})` +
    ` | 缺页=${minfltPerSec}/s | patch=${row.patchPerSecP50}/s 下行=${row.downKBsP50}KB/s 时漂=${row.driftMaxPct == null ? "n/a" : row.driftMaxPct + "%"} 死亡=${row.deaths} 负载器=${genPct}%`,
  );
  row.minfltPerSec = minfltPerSec;
  return row;
}

async function idleBaseline() {
  await sleep(2500);
  const s0 = procStatMs(serverPid);
  await sleep(3000);
  const s1 = procStatMs(serverPid);
  const rs = [];
  for (let i = 0; i < 3; i++) { rs.push(procRssKB(serverPid)); await sleep(200); }
  return {
    utimePct: +((s1.u - s0.u) / 3000 * 100).toFixed(2),
    stimePct: +((s1.s - s0.s) / 3000 * 100).toFixed(2),
    serverCpuPct: +(((s1.u + s1.s) - (s0.u + s0.s)) / 3000 * 100).toFixed(2),
    serverRssKB: median(rs),
  };
}

async function runModeOnce(mode, rep, ladder) {
  currentMode = mode;
  const m = MODES[mode];
  serverChild = await startServer(m.env, null);
  serverPid = serverChild.resolvedPid ?? serverChild.pid;
  log(`server-start-wall ${Date.now()} pid=${serverPid}`);
  let crashed = false;
  serverChild.on("exit", () => { crashed = true; });
  await resetClient();
  const idle = await idleBaseline();
  console.log(`[${mode}] rep${rep} server pid=${serverPid} 空载 CPU=${idle.serverCpuPct}% (u=${idle.utimePct} s=${idle.stimePct}) RSS=${idle.serverRssKB}KB`);
  if (m.pairs) startCaretaker();
  if (m.driver) startDriver();

  const tiers = [];
  for (const target of ladder) {
    // delta 按房间数算：pairs 模式每个 rec = 1 房（2 客户端）
    const delta = target - recs.length;
    if (m.pairs) await Promise.all(Array.from({ length: delta }, () => joinPair()));
    else await Promise.all(Array.from({ length: delta }, () => joinSingle()));
    const ms = m.pairs ? await waitPhase(isStarted) : await waitPhase(isLobby);
    log(`[${mode}] +${delta} 房入位 ${ms}ms，稳 1500ms 后测`);
    await sleep(1500);
    log(`window-start-wall ${Date.now()} rooms=${target}`); // GC/trace 时间过滤锚
    const row = await measureTier(target);
    tiers.push(row);
  }
  stopIntervals();
  if (!args.includes("--leaveSrv")) { // strace 取证时保留壳由外部收尾（SIGTERM 会打断 strace 写 summary）
    try { serverChild.kill("SIGTERM"); await sleep(800); try { serverChild.kill("SIGKILL"); } catch {} } catch {}
  }
  const pts = tiers.map((t) => ({ x: t.roomsTotal, y: t.serverCpuPct }));
  const ut = slope(tiers.map((t) => ({ x: t.roomsTotal, y: t.utimePct })));
  const st = slope(tiers.map((t) => ({ x: t.roomsTotal, y: t.stimePct })));
  return {
    mode, repeat: rep, ladder, idleBaseline: idle, tiers, crashed,
    slope: {
      cpuMsPerRoom: +(slope(pts).b * 10).toFixed(2),
      utimeMsPerRoom: +(ut.b * 10).toFixed(2),
      stimeMsPerRoom: +(st.b * 10).toFixed(2),
      interceptCpuPct: +slope(pts).a.toFixed(2),
    },
  };
}

async function runProf(mode) {
  currentMode = mode;
  const m = MODES[mode];
  const name = `attrib-r7-prof-${mode}.cpuprofile`;
  serverChild = await startServer(m.env, name);
  serverPid = serverChild.pid;
  await resetClient();
  await sleep(2500);
  if (m.pairs) startCaretaker();
  if (m.driver) startDriver();
  const target = Number(argOf("rooms", "64"));
  const delta = target; // 房间数；pairs 模式 joinPair 一次 = 1 房 2 客户端
  if (m.pairs) await Promise.all(Array.from({ length: delta }, () => joinPair()));
  else await Promise.all(Array.from({ length: delta }, () => joinSingle()));
  await (m.pairs ? waitPhase(isStarted) : waitPhase(isLobby));
  await sleep(1500);
  log(`prof 采样窗 ${SECS}s @ ${target} 房（${mode}）...`);
  await measureTier(target);
  stopIntervals();
  const profPath = join(TEMP, "prof", name);
  try { execSync(`rm -f ${JSON.stringify(profPath)}`); } catch {} // 清陈旧文件，落盘校验才可信
  serverChild.kill("SIGTERM");
  await sleep(1500);
  if (!existsSync(profPath)) throw new Error(`prof 未落盘: ${profPath}`);
  log(`prof 已落盘 ${profPath} (${(execSync(`stat -c %s ${JSON.stringify(profPath)}`).toString().trim())}B)`);
  return { profPath, mode };
}

async function main() {
  console.log(`r7a 归因探针 | git ${meta.git} | ${meta.cores} 核 | 端口 ${PORT} | 窗 ${SECS}s`);
  if (PROF_MODE) {
    const r = await runProf(PROF_MODE);
    console.log(`\nPROF_DONE ${JSON.stringify(r)}`);
    return;
  }
  const modes = MODES_ARG.split(",").map((s) => s.trim()).filter(Boolean);
  const out = { meta, runs: {} };
  for (const mode of modes) {
    if (!MODES[mode]) throw new Error(`未知模式: ${mode}`);
    out.runs[mode] = [];
    for (let rep = 1; rep <= REPEAT; rep++) {
      const r = await runModeOnce(mode, rep, ladderOf(mode));
      out.runs[mode].push(r);
      console.log(`[${mode}] rep${rep} 斜率: CPU=${r.slope.cpuMsPerRoom}ms/s/房 (utime=${r.slope.utimeMsPerRoom} stime=${r.slope.stimeMsPerRoom}) 截距=${r.slope.interceptCpuPct}%`);
      await sleep(1000);
    }
  }
  if (LABEL !== "none") {
    mkdirSync(RESULTS, { recursive: true });
    for (const mode of modes) {
      writeFileSync(join(RESULTS, `attrib-${LABEL}-${mode}.json`), JSON.stringify({ meta, runs: out.runs[mode] }, null, 2));
    }
    console.log(`已存档 benchmark/results/attrib-${LABEL}-<mode>.json × ${modes.length}`);
  }
}

try {
  await main();
} catch (err) {
  console.error("!! 异常:", err?.stack ?? String(err));
  try { stopIntervals(); } catch {}
  if (serverChild) { try { serverChild.kill("SIGKILL"); } catch {} }
  process.exit(1);
}
process.exit(0);
