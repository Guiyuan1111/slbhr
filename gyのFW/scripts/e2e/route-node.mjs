/**
 * 路线产线·纯 Node 真服回放（无浏览器）。
 *
 * 背景：浏览器路径的输入注入层层受制于渲染进程——CDP evaluate fwd p50=28ms/±25、
 * 页主线程 setTimeout 被 Chromium 定时器策略推迟（17ms 实发 41-52ms，空白页则完美）、
 * worker postMessage 回主线程 +26ms 且与补丁唤醒节拍耦合；16.7ms 帧窗全部罩不住。
 * 而回放的断言（胜负/位置）全在服务端，浏览器不参与任何判定——直接以 colyseus.js
 * （node 可用）双客户端建/进房，node 定时器（±1ms）直发 input，服务端到达抖动 ±2-3ms。
 *
 * 锚定：服务器 stdout "[phase] ready @wall" 自报墙钟，开钟 = ready+2000（服务端
 * setTimeout 实测漂移 +0..5ms）；本机 node Date.now 与服务器同源内核时钟。
 *
 * 用法：node --import tsx scripts/e2e/route-node.mjs [--level light_02] [--repeat 3]
 *           [--offset -10] [--port 3575]
 * 退出码 0 = 全部 PASS。
 */
import { spawn } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "colyseus.js";

const args = process.argv.slice(2);
const argOf = (name, def) => { const i = args.indexOf(`--${name}`); return i >= 0 && i + 1 < args.length ? args[i + 1] : def; };
const LEVEL = argOf("level", "light_02");
const REPEAT = Number(argOf("repeat", "1"));
const OFFSET = Number(argOf("offset", "-10"));
const PORT = Number(argOf("port", "3575"));
const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "out");
const ROUTE = join(HERE, "inputs", "routes", `${LEVEL}.json`);
const PASSWORD = "e2e-pw";
const MS = 1000 / 60;

const phaseMs = { ready: 0, started: 0 };
let serverChild = null;
function startServer(port) {
  serverChild = spawn(process.execPath, [
    "--import", "tsx",
    join(HERE, "..", "..", "packages", "server", "src", "index.ts"),
  ], {
    env: { ...process.env, PORT: String(port), FW_HOST: "127.0.0.1", FW_WIND_PHASE: process.env.FW_WIND_PHASE ?? "0" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("server 启动超时")), 30000);
    const ondata = (buf) => {
      const s = String(buf);
      process.stdout.write(s);
      const mReady = s.match(/\[phase\] ready @(\d+)/);
      if (mReady) phaseMs.ready = Number(mReady[1]);
      const mStarted = s.match(/\[phase\] started @(\d+)/);
      if (mStarted) phaseMs.started = Number(mStarted[1]);
      if (s.includes("EADDRINUSE")) { clearTimeout(timer); reject(new Error("端口被占用")); }
      else if (s.includes("http+ws")) { clearTimeout(timer); resolve(); }
    };
    serverChild.stdout.on("data", ondata);
    serverChild.stderr.on("data", ondata);
    serverChild.on("exit", (code) => { if (code !== 0 && code !== null) console.log(`[e2e] server exit ${code}`); });
  });
}
function stopServer() {
  if (serverChild) { serverChild.kill("SIGKILL"); serverChild = null; }
}

/** 纯 node 双客户端一轮回放 */
async function runOnce(runTag) {
  const clientA = new Client(`ws://127.0.0.1:${PORT}`);
  const clientB = new Client(`ws://127.0.0.1:${PORT}`);
  const result = { tag: runTag, won: false, diedAt: null, winAtMs: null, phaseSeen: "" };
  const withTimeout = (p, ms, tag) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(`${tag} 超时`)), ms))]);
  const roomA = await withTimeout(clientA.create("forest", { levelId: LEVEL, password: PASSWORD }), 15000, "create");
  const roleA = await withTimeout(new Promise((res) => roomA.onMessage("role", (r) => res(r))), 5000, "roleA");
  const roomB = await withTimeout(clientB.joinById(roomA.roomId, { levelId: LEVEL, password: PASSWORD }), 15000, "join");
  const roleB = await withTimeout(new Promise((res) => roomB.onMessage("role", (r) => res(r))), 5000, "roleB");
  if (roleA !== "fireboy" || roleB !== "watergirl") throw new Error(`角色异常 A=${roleA} B=${roleB}`);
  const sendA = (st) => roomA.send("input", st);
  const sendB = (st) => roomB.send("input", st);

  // 终局观察：事件驱动（onStateChange），不留 5ms 轮询与派发抢事件循环——
  // node 侧唯一残敌是偶发 20ms+ 停顿（GC/调度），一切周期任务都要让位派发精度。
  const wonP = new Promise((res) => {
    roomA.onStateChange((state) => {
      const ph = String(state?.phase ?? "");
      result.phaseSeen = ph;
      if (ph === "won") res({ won: true });
      else if (ph === "gameover") res({ won: false, dead: true });
    });
  });

  // 锚定：等 stdout ready（服务端自报墙钟；readyTimer 2s 后开钟，实测漂移 +0..5ms）。
  // 注意：runOnce 开头已把 phaseMs 归零，此处捕到的是本轮房间的 ready。
  for (;;) { if (phaseMs.ready) break; await new Promise((r) => setTimeout(r, 2)); }
  const t0 = phaseMs.ready + 2000; // 开钟预估（墙 ms）

  // 合并时间线：doc.fb → A(fireboy)，doc.wg → B(watergirl)
  const st = { A: { up: false, left: false, right: false }, B: { up: false, left: false, right: false } };
  const KEYS = { fb: { up: "up", left: "left", right: "right" }, wg: { up: "up", left: "left", right: "right" } };
  const timeline = [
    ...doc.fb.map((e) => ({ t: e.f * MS + OFFSET, room: "A", dir: KEYS.fb[e.dir], type: e.type, f: e.f })),
    ...doc.wg.map((e) => ({ t: e.f * MS + OFFSET, room: "B", dir: KEYS.wg[e.dir], type: e.type, f: e.f })),
  ].sort((a, b) => a.t - b.t || (a.type === "up" ? -1 : 1));

  const trace = [];
  let i = 0;
  const nowRel = () => Date.now() - t0; // 相对开钟预估的毫秒（负值=未开钟）
  await new Promise((resolve) => {
    const step = () => {
      const now = nowRel();
      while (i < timeline.length && timeline[i].t <= now) {
        const ev = timeline[i++];
        const cur = st[ev.room];
        cur[ev.dir] = ev.type === "down";
        (ev.room === "A" ? sendA : sendB)({ up: cur.up, left: cur.left, right: cur.right });
        trace.push({ dispatch: { t: Math.round(ev.t), done: Math.round(nowRel()), f: ev.f, role: ev.room === "A" ? "fb" : "wg", dir: ev.dir, type: ev.type } });
      }
      if (i < timeline.length) setTimeout(step, Math.max(0, timeline[i].t - nowRel()));
      else resolve();
    };
    setTimeout(step, Math.max(0, timeline[0].t - nowRel()));
  });

  // 输入发完等终局（超时 15s）
  const outcome = await Promise.race([
    wonP,
    new Promise((res) => setTimeout(() => res({ won: false, timeout: true }), 15000)),
  ]);
  result.won = outcome.won === true;
  result.diedAt = outcome.dead ? "gameover" : outcome.timeout ? "timeout" : null;
  if (!result.won && !outcome.timeout) {
    // 记录终局位置（state.players）
    const ps = roomA.state.players;
    result.final = Object.fromEntries([...ps.entries()].map(([k, v]) => [k, [Math.round(v.x), Math.round(v.y)]]));
  }
  result.trace = trace;
  await roomA.leave().catch(() => {});
  await roomB.leave().catch(() => {});
  return result;
}

// ---- 主流程 ----
const doc = JSON.parse(readFileSync(ROUTE, "utf8"));
console.log(`[e2e] route-node ${LEVEL}: ${doc.fb.length + doc.wg.length} 事件, offset=${OFFSET}, repeat=${REPEAT}`);
await startServer(PORT);
const results = [];
let pass = 0;
for (let r = 1; r <= REPEAT; r++) {
  phaseMs.ready = 0; phaseMs.started = 0;
  let run;
  try { run = await runOnce(`node-run${r}`); } catch (e) { run = { tag: `node-run${r}`, won: false, error: String(e) }; }
  results.push(run);
  if (run.won) pass++;
  console.log(`[e2e] [${run.tag}] ${run.won ? "PASS won" : `FAIL won=false ${run.error ?? ""}`} ${run.final ? JSON.stringify(run.final) : ""}`);
  await new Promise((res) => setTimeout(res, 800)); // 房间销毁间隙
}
stopServer();
writeFileSync(join(OUT, "route-results-node.json"), JSON.stringify({ level: LEVEL, offset: OFFSET, pass, results }, null, 1));
console.log(`[e2e] route-node ${LEVEL}: ${pass}/${REPEAT} PASS`);
process.exit(pass === REPEAT ? 0 : 1);
