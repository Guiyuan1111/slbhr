/**
 * r7a loopback ws 发送成本微探针（perfopt7）：receiver 进程起 ws server，sender 进程（被量）
 * 以固定速率发固定大小帧，量 sender 自身 /proc utime/stime。
 * 目的：判定服务器 sim-patch/walk 的巨额 stime 是否为 loopback socket 路径真实成本
 * （每发送/每字节），还是该进程组合（多 socket+epoll+定时器交错）才有的现象。
 *
 * 用法：node note/report/perf/tools/perfopt7/loopback-send.mjs --rate 7424 --size 56 --secs 5
 *      node note/report/perf/tools/perfopt7/loopback-send.mjs --grid           # 速率×大小扫描
 * 红线：只绑 127.0.0.1。
 */
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const TOOLS = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const argOf = (n, d) => (args.includes(`--${n}`) ? args[args.indexOf(`--${n}`) + 1] : d);
const RATE = Number(argOf("rate", 7424));
const SIZE = Number(argOf("size", 56));
const SECS = Number(argOf("secs", 5));
const PORT = Number(argOf("port", 3698));
const GRID = args.includes("--grid");
const log = (...a) => console.log("[loopsend]", ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const CLK_TCK = 100;

function procStatMs(pid) {
  const s = readFileSync(`/proc/${pid}/stat`, "utf8");
  const f = s.slice(s.lastIndexOf(")") + 2).split(" ");
  return { u: Number(f[11]) * (1000 / CLK_TCK), s: Number(f[12]) * (1000 / CLK_TCK) };
}

// receiver：独立进程，只收不回；--busy 让接收端模拟 ~20% CPU 忙碌（服务器场景里 colyseus.js 负载器在跑）
if (process.argv[2] === "--child") {
  const busy = process.argv.includes("--busy");
  const { WebSocketServer } = await import("ws");
  const wss = new WebSocketServer({ host: "127.0.0.1", port: PORT }, () => console.log("rx-ready"));
  let n = 0;
  wss.on("connection", (ws) => { ws.on("message", () => { if (busy) { const s = performance.now(); while (performance.now() - s < 0.12) n++; } }); });
  setInterval(() => {}, 1000);
  setTimeout(() => process.exit(0), 90000).unref(); // 兜底：孤儿 rx 90s 自杀，不占端口
} else if (GRID) {
  // 扫描：速率 {1860,3712,7424,14848}/s × 大小 {11,56,512}B（≈ws 帧总长）
  log("rate×size 扫描（每格 4s，sender u/s 单独量）");
  console.log("rate\\size    11B         56B        512B");
  for (const rate of [1860, 3712, 7424, 14848]) {
    const row = [];
    for (const size of [11, 56, 512]) {
      const r = await runCell(rate, size, 4);
      row.push(`u=${String(r.utimePct).padStart(5)}% s=${String(r.stimePct).padStart(5)}%`);
    }
    console.log(String(rate).padStart(8) + "  " + row.join("  "));
  }
} else if (args.includes("--fanout")) {
  // 扇出×对端忙碌四格：定位服务器 walk@64 的巨额 stime 是否为 fan-out+busy-peer 的内核成本放大
  console.log("conns=1 idle :", JSON.stringify(await runCell(RATE, SIZE, SECS, 1, false)));
  console.log("conns=1 busy :", JSON.stringify(await runCell(RATE, SIZE, SECS, 1, true)));
  console.log("conns=128 idle:", JSON.stringify(await runCell(RATE, SIZE, SECS, 128, false)));
  console.log("conns=128 busy:", JSON.stringify(await runCell(RATE, SIZE, SECS, 128, true)));
} else {
  const r = await runCell(RATE, SIZE, SECS);
  console.log(JSON.stringify({ rate: RATE, size: SIZE, secs: SECS, ...r }));
}

async function runCell(rate, size, secs, conns = 1, busy = false) {
  const rxArgs = [join(TOOLS, "loopback-send.mjs"), "--child", "--port", String(PORT)];
  if (busy) rxArgs.push("--busy");
  const rx = spawn(process.execPath, rxArgs, { stdio: ["ignore", "pipe", "inherit"] });
  await new Promise((res, rej) => {
    rx.stdout.on("data", (b) => String(b).includes("rx-ready") && res());
    setTimeout(() => rej(new Error("rx 启动超时")), 10000);
  });
  const { WebSocket } = await import("ws");
  const sockets = [];
  process.on("unhandledRejection", () => {}); // 连接竞争期的 error 不许炸掉量具
  for (let i = 0; i < conns; i++) {
    const ws = new WebSocket(`ws://127.0.0.1:${PORT}`);
    ws.on("error", () => {});
    await new Promise((res, rej) => { ws.on("open", res); ws.on("error", rej); });
    ws.on("message", () => {});
    sockets.push(ws);
  }
  const buf = Buffer.alloc(size, 7);
  const me = process.pid;
  // 批量 pacer：每 1ms tick 发 rate/1000 帧（setInterval 亚毫秒会被钳到 1ms，速率虚低 10 倍）
  const perTick = Math.max(1, Math.round(rate / 1000));
  let sent = 0, rot = 0;
  const sendLoop = setInterval(() => {
    for (let k = 0; k < perTick; k++) { sockets[rot++ % sockets.length].send(buf, { binary: true }); sent++; }
  }, 1);
  await sleep(1000);
  const s0 = procStatMs(me), t0 = Date.now(), n0 = sent;
  await sleep(secs * 1000);
  const s1 = procStatMs(me), wall = Date.now() - t0, n1 = sent;
  clearInterval(sendLoop);
  for (const ws of sockets) try { ws.close(); } catch {}
  rx.kill("SIGKILL");
  const out = {
    sentPerSec: +((n1 - n0) / (wall / 1000)).toFixed(0),
    mbpsOut: +(((n1 - n0) * size) / (wall / 1000) / 1e6).toFixed(2),
    utimePct: +((s1.u - s0.u) / wall * 100).toFixed(2),
    stimePct: +((s1.s - s0.s) / wall * 100).toFixed(2),
    stimeNsPerSend: Math.round((s1.s - s0.s) / (n1 - n0) * 1e6),
    utimeNsPerSend: Math.round((s1.u - s0.u) / (n1 - n0) * 1e6),
  };
  return out;
}
