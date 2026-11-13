/**
 * 网络载荷口径：真实会话的 WS 入/出站字节计数（r55 新增）。
 *
 * ## 为什么需要
 * 性能战役 55 轮覆盖了服务端物理/分配/换关链/选关菜单/客户端 update/声池/时钟
 * 分辨率/数据布局——**唯独从未量过网络载荷**。服务端每仿真 tick 写
 * `state.f`（帧号镜像，恒脏）与 `state.timerMs`（HUD 时钟，ms 级恒脏），出站
 * patch 率为 60Hz（11 号档 netopt 有意从 20Hz 升频换表现保真）。本件回答：
 * 真实字节量级是多少？恒脏字段的占比值不值得动？
 *
 * ## 口径
 * 双页真实开局（forest_bonus_2），在火娃页挂 WS 计数器：
 *   - 入站：对底层 WebSocket 加 `message` 监听，按 `byteLength/size/length` 计字节
 *   - 出站：包同实例的 `send`
 * 两个窗口各 150 个 started 帧：**怠速**（无输入）与**运动**（按住方向键）。
 * 附确定性事实：入站消息条数、每条均长。f/timerMs 的编码占比按 varint 字节
 * 数解析（f Δ=+1 → 1 字节；timerMs Δ≈16 → 1-2 字节；各加 1 字节域索引）。
 *
 * 用法：
 *   LEVEL=forest_bonus_2 node --import tsx benchmark/perf-net-payload.mjs --save r55-net
 */
import { spawn } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { enterAs, waitForStarted } from "../scripts/e2e/lib.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const RESULTS = join(ROOT, "benchmark", "results");
const PORT = Number(process.env.PORT ?? 3679);
const LEVEL = process.env.LEVEL ?? "forest_bonus_2";
const FRAMES = Number(process.env.FRAMES ?? 150);
const argSave = process.argv.includes("--save") ? process.argv[process.argv.indexOf("--save") + 1] : undefined;

function startServer() {
  const child = spawn(process.execPath, ["--import", "tsx", join(ROOT, "packages", "server", "src", "index.ts")], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT), FW_HOST: "127.0.0.1", FW_WIND_PHASE: "0" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("server 启动超时")), 60000);
    child.stdout.on("data", (buf) => {
      const s = String(buf);
      if (s.includes("EADDRINUSE")) { clearTimeout(timer); reject(new Error("端口被占用")); }
      else if (s.includes("http+ws")) { clearTimeout(timer); resolve(child); }
    });
    child.stderr.on("data", () => {});
    child.on("exit", (code) => { clearTimeout(timer); reject(new Error("server 提前退出: " + code)); });
  });
}

/** 找到底层 WebSocket 并挂字节计数器；返回取表函数 */
const INSTALL = `(() => {
  const scene = window.__fw?.scene?.getScene("Game");
  const room = scene?.d?.net?.room;
  if (!room) return { error: "room 不可用" };
  let ws = room.connection?.transport?.ws ?? room.connection?.ws;
  if (!ws || typeof ws.addEventListener !== "function") {
    const c = room.connection?.transport ?? room.connection;
    if (c && typeof c.url === "string" && typeof c.readyState === "number") ws = c;
  }
  if (!ws || typeof ws.addEventListener !== "function") return { error: "底层 ws 不可达: " + (room.connection && Object.keys(room.connection)).join(",") };
  const stat = { inMsgs: 0, inBytes: 0, outMsgs: 0, outBytes: 0 };
  const sizeOf = (d) => d == null ? 0 : (d.byteLength ?? d.size ?? d.length ?? 0);
  ws.addEventListener("message", (ev) => { stat.inMsgs++; stat.inBytes += sizeOf(ev.data); });
  const realSend = ws.send.bind(ws);
  ws.send = (d) => { stat.outMsgs++; stat.outBytes += sizeOf(d); return realSend(d); };
  window.__netstat = stat;
  return { ok: true, url: String(ws.url || "") };
})()`;

const server = await startServer();
const browser = await chromium.launch({ headless: true });
let res;
try {
  const ctxA = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const ctxB = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctxA.newPage();
  const pageB = await ctxB.newPage();
  try {
    const code = await enterAs(page, PORT, "create", "", LEVEL);
    await enterAs(pageB, PORT, "join", code, LEVEL);
    await waitForStarted(page, 30000);
    await waitForStarted(pageB, 30000);

    const inst = await page.evaluate(INSTALL);
    if (!inst.ok) throw new Error(inst.error);

    const probe = async () => await page.evaluate(`(async (frames) => {
      const g = window.__fw;
      const scene = g.scene.getScene("Game");
      const stat = window.__netstat;
      const snap = () => ({ inMsgs: stat.inMsgs, inBytes: stat.inBytes, outMsgs: stat.outMsgs, outBytes: stat.outBytes });
      const waitFrames = (n) => new Promise((done) => {
        // 以 sys.sceneUpdate 为活原件（r50 坑：boot 时一次性快照）；完成时两处都还原，
        // 否则上一窗闭包会把本窗计数器踩死（首版实测第二窗永挂）。
        const orig = scene.sys.sceneUpdate;
        let c = 0;
        const w = function (t, d) {
          const st = this.d?.net?.room?.state;
          if (st && String(st.phase ?? "") === "started" && ++c >= n) {
            scene.update = orig; if (scene.sys) scene.sys.sceneUpdate = orig;
            return done();
          }
          return orig.call(this, t, d);
        };
        scene.update = w; if (scene.sys) scene.sys.sceneUpdate = w;
      });
      const idle0 = snap();
      await waitFrames(frames);
      const idle1 = snap();
      return { idle0, idle1 };
    })(${FRAMES})`);

    // 窗口 1：怠速
    const idle = await probe();
    // 窗口 2：运动（fb 方向键右 + wg D；走 150 帧后松键）
    await page.keyboard.down("ArrowRight");
    await pageB.keyboard.down("KeyD");
    const act = await probe();
    await page.keyboard.up("ArrowRight");
    await pageB.keyboard.up("KeyD");

    const perFrame = (a, b, k) => (b[k] - a[k]) / FRAMES;
    const pf = (v) => v.toFixed(1);
    const idleIn = perFrame(idle.idle0, idle.idle1, "inBytes");
    const actIn = perFrame(act.idle0, act.idle1, "inBytes");
    const idleInM = perFrame(idle.idle0, idle.idle1, "inMsgs");
    const actInM = perFrame(act.idle0, act.idle1, "inMsgs");
    const idleOut = perFrame(idle.idle0, idle.idle1, "outBytes");
    const actOut = perFrame(act.idle0, act.idle1, "outBytes");

    console.log(`\n网络载荷（${LEVEL}，双窗各 ${FRAMES} started 帧，60Hz patch）\n`);
    console.log(`  入站（服务端→客户端）`);
    console.log(`    怠速  ${pf(idleIn)} B/帧 = ${pf(idleIn * 60)} B/s   ${pf(idleInM)} msg/帧`);
    console.log(`    运动  ${pf(actIn)} B/帧 = ${pf(actIn * 60)} B/s   ${pf(actInM)} msg/帧`);
    console.log(`  出站（客户端→服务端）`);
    console.log(`    怠速  ${pf(idleOut)} B/帧 = ${pf(idleOut * 60)} B/s`);
    console.log(`    运动  ${pf(actOut)} B/帧 = ${pf(actOut * 60)} B/s`);
    console.log(`  怠速入站均长  ${((idle.idle1.inBytes - idle.idle0.inBytes) / Math.max(1, idle.idle1.inMsgs - idle.idle0.inMsgs)).toFixed(1)} B/msg`);

    res = { idle, act, idleIn, actIn, idleInM, actInM, idleOut, actOut, frames: FRAMES, level: LEVEL };
  } finally {
    await ctxA.close();
    await ctxB.close();
  }
} finally {
  await browser.close();
  server.kill("SIGTERM");
}

if (argSave) {
  mkdirSync(RESULTS, { recursive: true });
  const f = join(RESULTS, `net-${argSave}.json`);
  writeFileSync(f, JSON.stringify({ at: new Date().toISOString(), ...res }, null, 1));
  console.log(`\n[net] 快照已存 ${f}`);
}
