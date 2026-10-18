/**
 * r7a 纯定时器面微探针（perfopt7）：K 个"房间"×（1 sim interval + 1 patch interval）@1000/60ms
 * 的原生 setInterval（与 @colyseus/core Room.setSimulationInterval / #_patchInterval 同机制），
 * 每次触发只做与"空转房间"同量级的最小工作（属性读+计数器），量 /proc CPU 对 K 的斜率。
 * 用途：从 lobby 模式斜率里分离「定时器调度本身」与「房间对象/ws 闲连/colyseus 基础设施」。
 *
 * 口径：无 ws、无网络栈、无 colyseus——纯 Node 事件循环定时器面。
 * 用法：node note/report/perf/tools/perfopt7/timer-flood.mjs --rooms 0,64,128,192,256 --secs 10 --port 0 --save r7
 * 产物：benchmark/results/attrib-<label>-timerflood.json（--save 给了才写）
 */
import { execSync } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import os from "node:os";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..", "..");
const RESULTS = join(ROOT, "benchmark", "results");
const args = process.argv.slice(2);
const argOf = (n, d) => (args.includes(`--${n}`) ? args[args.indexOf(`--${n}`) + 1] : d);
const LADDER = String(argOf("rooms", "0,64,128,192,256")).split(",").map(Number).filter((n) => n >= 0);
const SECS = Number(argOf("secs", "10"));
const LABEL = argOf("save", undefined);
const CLK_TCK = Number(execSync("getconf CLK_TCK").toString().trim()) || 100;
const log = (...a) => console.log("[timerflood]", ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function procStatMs(pid) {
  const s = execSync(`cat /proc/${pid}/stat`).toString();
  const f = s.slice(s.lastIndexOf(")") + 2).split(" ");
  return { u: Number(f[11]) * (1000 / CLK_TCK), s: Number(f[12]) * (1000 / CLK_TCK) };
}
function slope(pts) {
  const n = pts.length;
  const sx = pts.reduce((s, p) => s + p.x, 0), sy = pts.reduce((s, p) => s + p.y, 0);
  const sxx = pts.reduce((s, p) => s + p.x * p.x, 0), sxy = pts.reduce((s, p) => s + p.x * p.y, 0);
  const b = (n * sxy - sx * sy) / (n * sxx - sx * sx);
  return { b, a: sy / n - (b * sx) / n };
}

const timers = [];
const STEP_MS = 1000 / 60;

function spawnRooms(K) {
  // 清旧定时器
  for (const t of timers) clearInterval(t);
  timers.length = 0;
  // 每"房"2 个 interval，与真实房间一致：sim tick（早退形：读 acc、pingAcc 计数）+ patch（脏检查形）
  for (let i = 0; i < K; i++) {
    const room = { acc: 0, pingAcc: 0, dirty: true, fires: 0, pings: 0 };
    timers.push(setInterval(() => {
      room.acc += STEP_MS; room.fires++;
      room.pingAcc += STEP_MS;
      if (room.pingAcc >= 1000) { room.pingAcc = 0; room.pings++; } // 1Hz ping 形
    }, STEP_MS));
    timers.push(setInterval(() => {
      if (room.dirty) { room.dirty = false; room.fires++; } // broadcastPatch 脏检查形（脏→计数即回）
    }, STEP_MS));
  }
}

const tiers = [];
for (const K of LADDER) {
  spawnRooms(K);
  await sleep(1200); // 定时器建齐+稳定
  const s0 = procStatMs(process.pid);
  const t0 = Date.now();
  await sleep(SECS * 1000);
  const wall = Date.now() - t0;
  const s1 = procStatMs(process.pid);
  const cpuPct = +(((s1.u + s1.s) - (s0.u + s0.s)) / wall * 100).toFixed(2);
  const utimePct = +((s1.u - s0.u) / wall * 100).toFixed(2);
  const stimePct = +((s1.s - s0.s) / wall * 100).toFixed(2);
  tiers.push({ rooms: K, serverCpuPct: cpuPct, utimePct, stimePct });
  log(`K=${String(K).padStart(4)} CPU=${String(cpuPct).padStart(5)}% (u=${utimePct} s=${stimePct})`);
}
for (const t of timers) clearInterval(t);
const fit = slope(tiers.map((t) => ({ x: t.rooms, y: t.serverCpuPct })));
const res = {
  meta: {
    git: execSync("git rev-parse --short HEAD", { cwd: ROOT }).toString().trim(),
    date: new Date().toISOString(), node: process.version, clkTck: CLK_TCK, cores: os.cpus().length,
    note: "纯定时器面：K 房 ×(sim 60Hz + patch 60Hz) 原生 setInterval 最小工作量，无 ws 无 colyseus",
  },
  tiers,
  slope: { cpuMsPerRoom: +(fit.b * 10).toFixed(3), interceptCpuPct: +fit.a.toFixed(2) },
};
console.log(`斜率：${res.slope.cpuMsPerRoom}ms/s/房（截距 ${res.slope.interceptCpuPct}%）`);
if (LABEL) {
  mkdirSync(RESULTS, { recursive: true });
  writeFileSync(join(RESULTS, `attrib-${LABEL}-timerflood.json`), JSON.stringify(res, null, 2));
  log(`已存档 attrib-${LABEL}-timerflood.json`);
}
