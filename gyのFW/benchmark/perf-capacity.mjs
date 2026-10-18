/**
 * 服务器容量阶梯基准（r6-b）：N 房间 × 2 模拟客户端，爬载测"这台服务器能带多少房间/客户端"。
 * 为公网部署选型供数（2026-10-18 perfopt6b 槽）。
 *
 * 口径（全部数字、无图判读）：
 *   - 模拟客户端 = colyseus.js 轻量脚本客户端（Node 内拉起，不拉真浏览器）——容量是服务器侧
 *     口径。上行语义与生产对齐：66ms 强制重发（≈15Hz，input.ts RESEND_MS 同款）+ 跳跃 treadm
 *     图案（hop：1.78s 周期前 264ms 按 ↑，原地跳 x 不漂移、forest_01 无风区无死亡风险）。
 *   - 房间 = ForestRoom 真房（create+joinById 成对入房，双人到齐走 ready 2.0s → started），
 *     阶梯累计（4→8→16→…，前档房间在后档测量窗内继续跑）。
 *   - 每档测量窗（--secs，默认 12s）采：服务器进程 CPU%（/proc utime+stime）、RSS、每客户端
 *     下行/上行 KB/s（ws 帧字节，按协议码分类：15=state patch / 13,17=广播消息）、每客户端
 *     patch 到达率（60Hz 应满）、timerMs 时漂（服务器追不上实时即正漂移）、死亡/重开数。
 *   - 降级判据（任一触发=该档降级，首个降级档=容量拐点）：cpuSat 服务器 CPU≥95%；
 *     driftBad 时漂≥2%（started 净房间）；patchLow patch 到达率中位<54/s（60 的 90%）。
 *     loadgen 自身 CPU≥95% 记 measure-invalid（负载发生器饱和，数字需谨慎）。
 *   - 容量外推：每房 CPU ms/s（窗内 CPU%×10/房间数）线性外推单核房间上限；RSS 最小二乘
 *     (a+b·N) 外推 2GB 预算房间数；带宽对照 r4 线路口径 5.36KB/s/客户端（91B×60Hz）。
 *   - 安全红线：服务器只绑 127.0.0.1（FW_HOST 写死，量具自管生命周期，学 perf-client.mjs）。
 *
 * 用法：
 *   node benchmark/perf-capacity.mjs --rooms "4,8,16,32" --secs 12 --save <label>
 *   node benchmark/perf-capacity.mjs --rooms "2" --secs 6          # 低档冒烟
 *   node benchmark/perf-capacity.mjs --compare <label>             # 与快照对比
 * 产物：benchmark/results/capacity-<label>.json
 */
import { spawn, execSync } from "node:child_process";
import { writeFileSync, readFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import os from "node:os";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const RESULTS = join(ROOT, "benchmark", "results");
const TEMP = join(ROOT, "TEMP", "perfopt6b");
const args = process.argv.slice(2);
const argOf = (n, d) => (args.includes(`--${n}`) ? args[args.indexOf(`--${n}`) + 1] : d);
const LADDER = String(argOf("rooms", "4,8,16,32")).split(",").map((s) => Number(s.trim())).filter((n) => n > 0);
const SECS = Number(argOf("secs", "12"));
const LEVEL = String(argOf("level", "forest_01"));
const PORT = Number(argOf("port", 3673));
const PATTERN = String(argOf("pattern", "hop")); // hop | idle | walk
const SETTLE_MS = Number(argOf("settle", "1500"));
const argSave = argOf("save", undefined);
const argCompare = argOf("compare", undefined);
const log = (...a) => console.log("[capacity]", ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const CLK_TCK = Number(execSync("getconf CLK_TCK").toString().trim()) || 100;

// ---- ws 字节计数：包一层 globalThis.WebSocket（colyseus.js 在模块加载时捕获 global，须先于 import）----
// 帧首字节 = colyseus 协议码（colyseus.js Room.onMessageCallback it.offset=1）：15=state patch，
// 13/17=ROOM_DATA(广播 sfx/ping 等)。patch 与广播分开计数，patch 到达率才是模拟帧率口径。
const WS_STAT = new WeakMap();
const RealWS = globalThis.WebSocket;
globalThis.WebSocket = class extends RealWS {
  constructor(...a) {
    super(...a);
    const st = { inB: 0, inPatch: 0, inMsg: 0, inOther: 0, outB: 0, outN: 0 };
    WS_STAT.set(this, st);
    this.addEventListener("message", (ev) => {
      const d = ev.data;
      if (typeof d === "string") { st.inOther++; return; }
      let u8;
      if (d instanceof ArrayBuffer) u8 = new Uint8Array(d);
      else if (ArrayBuffer.isView(d)) u8 = new Uint8Array(d.buffer, d.byteOffset, d.byteLength);
      if (!u8) { st.inOther += (d?.size ?? 0); return; }
      st.inB += u8.length;
      if (u8[0] === 15) st.inPatch++;
      else if (u8[0] === 13 || u8[0] === 17) st.inMsg++;
      else st.inOther++;
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

// ---- /proc 采样（Linux；量具与服务器同机）----
function procCpuMs(pid) {
  const s = readFileSync(`/proc/${pid}/stat`, "utf8");
  const f = s.slice(s.lastIndexOf(")") + 2).split(" ");
  // f[k] = 第 3+k 字段：utime=14→k=11，stime=15→k=12（含全部线程累计）
  return (Number(f[11]) + Number(f[12])) * (1000 / CLK_TCK);
}
function procRssKB(pid) {
  const s = readFileSync(`/proc/${pid}/status`, "utf8");
  const m = s.match(/VmRSS:\s+(\d+)\s+kB/);
  return m ? Number(m[1]) : 0;
}
const median = (arr) => (arr.length ? [...arr].sort((a, b) => a - b)[Math.floor(arr.length / 2)] : 0);

function startServer() {
  const child = spawn(process.execPath, ["--import", "tsx", join(ROOT, "packages", "server", "src", "index.ts")], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT), FW_HOST: "127.0.0.1", FW_WIND_PHASE: "0" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("server 启动超时")), 60000);
    const ondata = (buf) => {
      const s = String(buf);
      if (s.includes("EADDRINUSE")) { clearTimeout(timer); reject(new Error(`端口 ${PORT} 被占用`)); }
      else if (s.includes("http+ws")) { clearTimeout(timer); resolve(child); }
      else if (s.includes("started @")) log("  [server]", s.trim());
    };
    child.stdout.on("data", ondata);
    child.stderr.on("data", (b) => process.stderr.write(b));
    child.on("exit", (code) => { clearTimeout(timer); reject(new Error("server 提前退出: " + code)); });
  });
}

// ---- 房间编排 ----
const client = new Client(`ws://127.0.0.1:${PORT}`);
const recs = []; // { roomId, primary, secondary, stA, stB, phase, deaths, restarts, lastTrans, startedAt }

async function joinPair() {
  const opts = { password: "", levelId: LEVEL };
  const a = await client.create("forest", opts); // 创建者 = fireboy（onJoin 先到先得）
  const b = await client.joinById(a.roomId, opts); // 加入者 = watergirl
  const rec = {
    roomId: a.roomId, primary: a, secondary: b,
    stA: WS_STAT.get(a.connection.transport.ws), stB: WS_STAT.get(b.connection.transport.ws),
    phase: "", deaths: 0, restarts: 0, lastTrans: Date.now(), joinedAt: Date.now(),
  };
  // no-op 消息处理器：对齐生产客户端（net.ts 全量注册），顺带消掉 colyseus.js
  // "onMessage() not registered" stderr 噪声（role 每端 1 条、ping 非开局期 1/s/房）
  for (const room of [a, b]) {
    for (const t of ["role", "ping", "sfx", "death", "finish", "pause-changed"]) room.onMessage(t, () => {});
  }
  recs.push(rec);
  return rec;
}

async function waitAllStarted(list, timeoutMs = 30000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    if (list.every((r) => String(r.primary.state?.phase ?? "") === "started" && String(r.secondary.state?.phase ?? "") === "started")) return Date.now() - t0;
    await sleep(150);
  }
  throw new Error(`等 started 超时：${list.filter((r) => String(r.primary.state?.phase ?? "") !== "started").length} 房未开局`);
}

// 守护：死亡/胜利 → restart 整关重开（ForestRoom onMessage restart 原版 retry 语义）；
// 记录相位迁移时刻（测量窗内迁移过的房 = 不净，漂移/patch 率口径剔除）。
let caretaker = null;
function startCaretaker() {
  caretaker = setInterval(() => {
    const now = Date.now();
    for (const r of recs) {
      const p = String(r.primary.state?.phase ?? "");
      if (p !== r.phase) {
        if ((p === "gameover" || p === "won") && r.phase === "started") r.deaths++;
        if (p === "gameover" || p === "won") {
          try { r.primary.send("restart", {}); r.restarts++; } catch { /* 留守护下轮再试 */ }
        }
        r.phase = p;
        r.lastTrans = now;
      }
    }
  }, 400);
}

// ---- 输入驱动：66ms 强制重发（生产 input.ts RESEND_MS 同款 15Hz）----
// hop：1.78s 周期前 4 拍(264ms) 按 ↑ 原地跳（x 不漂移、无风区无死亡）；idle：全松；
// walk：前 8 拍 ← 后 8 拍 →（会游走，长跑有死亡风险，仅供短窗对照）。
const PAT_CYCLE = 27, PAT_UP = 4, PAT_WALK = 8;
let tick = 0;
let driver = null;
function inputFor(role, t) {
  const p = (t + (role === "wg" ? 13 : 0)) % PAT_CYCLE;
  if (PATTERN === "idle") return { up: false, left: false, right: false };
  if (PATTERN === "walk") return { up: false, left: p < PAT_WALK, right: p >= PAT_WALK && p < PAT_WALK * 2 };
  return { up: p < PAT_UP, left: false, right: false };
}
function startDriver() {
  let seq = 0;
  driver = setInterval(() => {
    tick++;
    for (const r of recs) {
      try {
        r.primary.send("input", { ...inputFor("fb", tick), seq: ++seq });
        r.secondary.send("input", { ...inputFor("wg", tick), seq: ++seq });
      } catch { /* 断线的房由 onLeave 侧处理，守护不抛 */ }
    }
  }, 66);
}

// ---- 测量 ----
const meta = {
  label: argSave ?? argCompare ?? "(run)",
  git: execSync("git rev-parse --short HEAD", { cwd: ROOT }).toString().trim(),
  date: new Date().toISOString(),
  node: process.version,
  level: LEVEL, secsPerTier: SECS, pattern: PATTERN, ladder: LADDER,
  host: "127.0.0.1", port: PORT, clkTck: CLK_TCK, cores: os.cpus().length,
  uplinkModel: "colyseus.js 66ms 强制重发（≈15Hz/客户端，input.ts RESEND_MS 生产同款）",
  r4BandwidthLineKBs: 5.36, // r4 线路口径：forest_01 scripted avgPatch 91B × 60Hz ≈ 5.36KB/s/客户端（KB=1024B）
};
let serverChild = null, serverPid = 0, crashed = false, intentionalKill = false;
const tiers = [];

function dumpPartial(reason) {
  const payload = { meta: { ...meta, crashed: true, crashReason: reason }, tiers };
  try { mkdirSync(TEMP, { recursive: true }); writeFileSync(join(TEMP, `capacity-crash-${Date.now()}.json`), JSON.stringify(payload, null, 2)); } catch {}
  if (argSave) {
    try { mkdirSync(RESULTS, { recursive: true }); writeFileSync(join(RESULTS, `capacity-${argSave}.json`), JSON.stringify(payload, null, 2)); } catch {}
  }
  log(`!! ${reason} —— 现场已留档（TEMP/perfopt6b/capacity-crash-*.json${argSave ? ` + results/capacity-${argSave}.json` : ""}），不掩盖`);
}

async function measureTier(roomsTotal, prevRss, prevRooms) {
  const srv0 = procCpuMs(serverPid), gen0 = procCpuMs(process.pid);
  const snap = recs.map((r) => ({
    rec: r, pA: r.stA.inPatch, bA: r.stA.inB, oA: r.stA.outB,
    timerMs: Number(r.primary.state?.timerMs ?? 0),
  }));
  const t0 = Date.now();
  await sleep(SECS * 1000);
  // 窗口尾一次采齐（CPU/计数器/timerMs 必须同刻：晚读会把窗外时间算进速率，
  // 首版冒烟曾在 RSS 三采 ~750ms 后才读尾值 → 全体速率虚高 ~12%，时漂 -12% 伪影）
  const wallMs = Date.now() - t0;
  const srv1 = procCpuMs(serverPid), gen1 = procCpuMs(process.pid);
  const endSnap = recs.map((r) => ({
    inPatch: r.stA.inPatch, inB: r.stA.inB, outB: r.stA.outB,
    timerMs: Number(r.primary.state?.timerMs ?? 0),
  }));
  // RSS 在速率口径采完后连采 3 取中位（GC 锯齿去噪；不参与速率运算）
  const rssSamples = [];
  for (let i = 0; i < 3; i++) { rssSamples.push(procRssKB(serverPid)); await sleep(250); }
  const rssKB = median(rssSamples);

  const per = snap.map((s, i) => {
    const clean = s.rec.phase === "started" && s.rec.lastTrans < t0;
    const e = endSnap[i];
    return {
      roomId: s.rec.roomId, clean,
      patchPerSec: +((e.inPatch - s.pA) / (wallMs / 1000)).toFixed(2),
      downKBs: +((e.inB - s.bA) / 1024 / (wallMs / 1000)).toFixed(3),
      upKBs: +((e.outB - s.oA) / 1024 / (wallMs / 1000)).toFixed(3),
      driftPct: clean ? +(((wallMs - (e.timerMs - s.timerMs)) / wallMs) * 100).toFixed(2) : null,
    };
  });
  const cleans = per.filter((p) => p.clean);
  const cpuPct = +(((srv1 - srv0) / wallMs) * 100).toFixed(1);
  const genPct = +(((gen1 - gen0) / wallMs) * 100).toFixed(1);
  const patchP50 = +median(cleans.map((p) => p.patchPerSec)).toFixed(2);
  const row = {
    roomsTotal,
    roomsClean: cleans.length,
    deathsTier: recs.reduce((n, r) => n + r.deaths, 0),
    restartsTotal: recs.reduce((n, r) => n + r.restarts, 0),
    serverCpuPct: cpuPct,
    cpuMsPerRoomPerSec: +(cpuPct * 10 / roomsTotal).toFixed(2), // 100% 核 = 1000ms/s
    serverRssKB: rssKB,
    memDeltaKBPerRoom: prevRss ? +Math.max(0, (rssKB - prevRss) / (roomsTotal - prevRooms)).toFixed(0) : null,
    downKBsClientAvg: +(per.reduce((s, p) => s + p.downKBs, 0) / per.length).toFixed(3),
    downKBsClientP50: +median(per.map((p) => p.downKBs)).toFixed(3),
    upKBsClientAvg: +(per.reduce((s, p) => s + p.upKBs, 0) / per.length).toFixed(3),
    patchPerSecP50: patchP50,
    driftMaxPct: cleans.length ? +Math.max(...cleans.map((p) => p.driftPct)).toFixed(2) : null,
    loadgenCpuPct: genPct,
    alarms: {
      cpuSat: cpuPct >= 95,
      driftBad: cleans.length > 0 && Math.max(...cleans.map((p) => p.driftPct)) >= 2,
      patchLow: cleans.length > 0 && patchP50 < 54,
      loadgenSat: genPct >= 95, // 负载发生器饱和 → 本档数字效力存疑
    },
  };
  row.degraded = row.alarms.cpuSat || row.alarms.driftBad || row.alarms.patchLow;
  tiers.push(row);
  console.log(
    `房=${String(roomsTotal).padStart(3)} 净=${String(row.roomsClean).padStart(3)} 死亡=${row.deathsTier} | CPU=${String(row.serverCpuPct).padStart(5)}% (每房=${row.cpuMsPerRoomPerSec}ms/s) RSS=${String(row.serverRssKB).padStart(6)}KB` +
    `${row.memDeltaKBPerRoom != null ? ` (+${row.memDeltaKBPerRoom}KB/房)` : "      "} | 下行=${row.downKBsClientP50}KB/s patch=${row.patchPerSecP50}/s 时漂=${row.driftMaxPct == null ? "n/a" : row.driftMaxPct + "%"} 负载器=${row.loadgenCpuPct}%` +
    `${row.degraded ? "  ⚠降级:" + Object.entries(row.alarms).filter(([, v]) => v).map(([k]) => k).join("+") : ""}`,
  );
  return row;
}

async function main() {
  console.log(`容量阶梯：${LADDER.join("→")} 房间（累计）× 2 客户端 | 每档窗 ${SECS}s | 图案=${PATTERN} | git ${meta.git} | ${meta.cores} 核`);
  serverChild = await startServer();
  serverPid = serverChild.pid;
  log(`server up pid=${serverPid} http://127.0.0.1:${PORT}`);
  let intentional = false; // 收尾 SIGTERM 不算 crash
  serverChild.on("exit", (code) => {
    if (intentionalKill) return;
    crashed = true;
    dumpPartial(`server 进程退出 code=${code}（第 ${tiers.length} 档后）`);
    try { clearInterval(driver); clearInterval(caretaker); } catch {}
    setTimeout(() => process.exit(2), 300);
  });

  // 空载基线（0 房）：CPU 3s 窗；RSS 连采 3 取中位（启动期 GC 锯齿，首版单点偏高 ~10MB）
  await sleep(2500);
  {
    const c0 = procCpuMs(serverPid);
    await sleep(3000);
    const c1 = procCpuMs(serverPid);
    const rs = [];
    for (let i = 0; i < 3; i++) { rs.push(procRssKB(serverPid)); await sleep(250); }
    meta.idleBaseline = { serverCpuPct: +(((c1 - c0) / 3000) * 100).toFixed(2), serverRssKB: median(rs) };
  }
  console.log(`空载基线：CPU=${meta.idleBaseline.serverCpuPct}% RSS=${meta.idleBaseline.serverRssKB}KB`);

  startCaretaker();
  startDriver();

  let prevRss = meta.idleBaseline.serverRssKB, prevRooms = 0, joinMs = 0;
  const inflectionTiers = [];
  for (const target of LADDER) {
    const delta = target - recs.length;
    if (delta <= 0) { log(`跳过 ${target}（已累计 ${recs.length} 房）`); continue; }
    const jt = Date.now();
    await Promise.all(Array.from({ length: delta }, () => joinPair()));
    const startedMs = await waitAllStarted(recs.slice(-delta));
    joinMs = Date.now() - jt;
    log(`+${delta} 房入位 join=${startedMs}ms 总 join=${joinMs}ms，稳 ${SETTLE_MS}ms 后测`);
    await sleep(SETTLE_MS);
    const row = await measureTier(recs.length, prevRss, prevRooms);
    row.joinMs = joinMs;
    prevRss = row.serverRssKB; prevRooms = row.roomsTotal;
    if (row.degraded || row.alarms.loadgenSat) inflectionTiers.push(target);
  }

  clearInterval(driver); clearInterval(caretaker);

  // ---- 汇总：拐点 + 容量外推 ----
  const cleanTiers = tiers.filter((t) => !t.degraded && !t.alarms.loadgenSat);
  const cpuPerRoom = median(cleanTiers.map((t) => t.cpuMsPerRoomPerSec));
  const memPerRoom = median(tiers.map((t) => t.memDeltaKBPerRoom).filter((v) => v != null));
  const idleCpuMs = meta.idleBaseline.serverCpuPct * 10;
  // CPU 最小二乘 cpuPct = a + b·rooms（低档位 jiffy 噪声大，边际成本以斜率 b 为准而非均值；
  // 首版冒烟 2 房 49.5ms/s/房 vs 8 房 20.5ms/s/房 的发散即固定/噪声混入均值所致）
  const nC = tiers.length, cx = tiers.reduce((s, t) => s + t.roomsTotal, 0), cy = tiers.reduce((s, t) => s + t.serverCpuPct, 0);
  const cxx = tiers.reduce((s, t) => s + t.roomsTotal * t.roomsTotal, 0), cxy = tiers.reduce((s, t) => s + t.roomsTotal * t.serverCpuPct, 0);
  const bCPU = nC > 1 ? (nC * cxy - cx * cy) / (nC * cxx - cx * cx) : 0; // %核/房
  const aCPU = cy / nC - (bCPU * cx) / nC; // %核 截距
  // RSS 最小二乘 rssKB = a + b·rooms
  const n = tiers.length, sx = tiers.reduce((s, t) => s + t.roomsTotal, 0), sy = tiers.reduce((s, t) => s + t.serverRssKB, 0);
  const sxx = tiers.reduce((s, t) => s + t.roomsTotal * t.roomsTotal, 0), sxy = tiers.reduce((s, t) => s + t.roomsTotal * t.serverRssKB, 0);
  const bRSS = n > 1 ? (n * sxy - sx * sy) / (n * sxx - sx * sx) : 0;
  const aRSS = sy / n - (bRSS * sx) / n;
  const estRoomsCpu = bCPU > 0 ? Math.floor((100 - aCPU) / bCPU) : null;
  const summary = {
    firstInflectionRooms: inflectionTiers[0] ?? null,
    inflectionAt: inflectionTiers.length ? inflectionTiers.join(",") : null,
    cpuModel: {
      cpuMsPerRoom: cpuPerRoom,
      cpuFit: { interceptPct: +aCPU.toFixed(2), slopePctPerRoom: +bCPU.toFixed(3) },
      estMaxRoomsOneCoreFit: estRoomsCpu,
      estMaxClientsOneCoreFit: estRoomsCpu != null ? estRoomsCpu * 2 : null,
      estMaxRoomsOneCoreAvg: cpuPerRoom > 0 ? Math.floor((1000 - idleCpuMs) / cpuPerRoom) : null,
      note: "斜率拟合为准（低档噪声/截距混入均值）；estMax 为单核算术上限，非可用容量（时漂/patch 判据优先）",
    },
    rssModel: { baselineKB: +aRSS.toFixed(0), perRoomKB: +bRSS.toFixed(0), estRoomsAt2GB: bRSS > 0 ? Math.floor((2 * 1024 * 1024 - aRSS) / bRSS) : null },
    memPerRoomMedianKB: memPerRoom,
    bandwidth: {
      downKBsClientP50AtTop: tiers[tiers.length - 1]?.downKBsClientP50 ?? null,
      r4LineKBs: meta.r4BandwidthLineKBs,
      ratioVsR4: tiers[tiers.length - 1] ? +(tiers[tiers.length - 1].downKBsClientP50 / meta.r4BandwidthLineKBs).toFixed(2) : null,
    },
    ladderObservedWithin: tiers.length ? [tiers[0].roomsTotal, tiers[tiers.length - 1].roomsTotal] : null,
  };
  console.log("\n=== 汇总 ===");
  console.log(`首个降级拐点：${summary.firstInflectionRooms == null ? "阶梯内无（全部档位干净）" : `${summary.firstInflectionRooms} 房（${summary.inflectionAt}）`}`);
  console.log(`CPU 模型：拟合 ${aCPU.toFixed(2)}% + ${bCPU.toFixed(3)}%/房 → 单核外推 ≈${summary.cpuModel.estMaxRoomsOneCoreFit} 房 / ${summary.cpuModel.estMaxClientsOneCoreFit} 客户端（均值法：${summary.cpuModel.estMaxRoomsOneCoreAvg ?? "n/a"} 房）`);
  console.log(`RSS 模型：基线 ${summary.rssModel.baselineKB}KB + ${summary.rssModel.perRoomKB}KB/房 → 2GB 预算外推 ≈${summary.rssModel.estRoomsAt2GB} 房`);
  console.log(`带宽：顶档下行 ${summary.bandwidth.downKBsClientP50AtTop}KB/s/客户端 vs r4 线 ${meta.r4BandwidthLineKBs}KB/s（×${summary.bandwidth.ratioVsR4}）`);

  const payload = { meta, tiers, summary };
  if (argSave || argCompare) mkdirSync(RESULTS, { recursive: true });
  if (argSave) {
    writeFileSync(join(RESULTS, `capacity-${argSave}.json`), JSON.stringify(payload, null, 2));
    console.log(`已存档 capacity-${argSave}.json`);
  }
  if (argCompare) {
    const fp = join(RESULTS, `capacity-${argCompare}.json`);
    if (!existsSync(fp)) throw new Error(`快照不存在: ${fp}`);
    const base = JSON.parse(readFileSync(fp, "utf8"));
    console.log(`\n===== 对比：${argCompare}（${base.meta.git}）→ 当前（${meta.git}）=====`);
    const line = (name, x, y) => console.log(`${name.padEnd(22)} ${String(x).padStart(11)} → ${String(y).padStart(11)}`);
    for (const cur of tiers) {
      const ref = base.tiers.find((t) => t.roomsTotal === cur.roomsTotal);
      if (!ref) { console.log(`房=${cur.roomsTotal}（快照缺失该档）`); continue; }
      line(`房=${cur.roomsTotal} CPU%`, ref.serverCpuPct, cur.serverCpuPct);
      line(`  RSS KB`, ref.serverRssKB, cur.serverRssKB);
      line(`  下行 KB/s`, ref.downKBsClientP50, cur.downKBsClientP50);
      line(`  patch/s`, ref.patchPerSecP50, cur.patchPerSecP50);
      line(`  时漂 %`, ref.driftMaxPct, cur.driftMaxPct);
    }
  }
}

try {
  await main();
} catch (err) {
  dumpPartial("异常: " + (err?.stack ?? String(err)));
  if (serverChild) { try { serverChild.kill("SIGKILL"); } catch {} }
  process.exit(1);
}
// 收尾：杀服务器（SIGTERM → 兜底 SIGKILL）；intentionalKill 防正常收尾被 exit handler 误报 crash
intentionalKill = true;
try {
  serverChild.kill("SIGTERM");
  await sleep(800);
  try { serverChild.kill("SIGKILL"); } catch {}
} catch {}
process.exit(0);
