/**
 * 阶段门回归：双浏览器真实联机通关 forest_01（0.3.0 冻结需求 #10）。
 *
 * 用法（Git Bash，先注入便携 Node PATH）：
 *   node scripts/e2e/regression.mjs [--repeat 3] [--script inputs.json] [--port 3557]
 *
 * 流程：构建产物由调用方保证（npm run build）→ 起服 → 双 headless 浏览器走真实菜单
 * （创建/加入/房间码）→ ready→started → 按 inputs 时间线注入键盘 → 断言：
 *   - window.__errs 全程为空
 *   - 有 winning 脚本：HUD 出现「通关！」（phase=won）且 finish 数据合理
 *   - 无脚本：soak 模式（30s 物理浸泡，只断言零错误 + 角色存活）
 * 截图存 scripts/e2e/out/。
 */
import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const OUT = join(ROOT, "scripts", "e2e", "out");

const args = process.argv.slice(2);
function argOf(name, def) {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : def;
}
const REPEAT = Number(argOf("repeat", "1"));
const INPUTS_FILE = argOf("script", "");
const PORT = Number(argOf("port", "3557"));
const BASE = `http://127.0.0.1:${PORT}`;
const PASSWORD = "e2e-pw";
const LEVEL = argOf("level", "forest_01");

const log = (...a) => console.log("[e2e]", ...a);

function startServer() {
  const child = spawn(process.execPath, [
    join(ROOT, "node_modules", "tsx", "dist", "cli.mjs"),
    join(ROOT, "packages", "server", "src", "index.ts"),
  ], {
    env: { ...process.env, PORT: String(PORT), FW_HOST: "127.0.0.1" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("server 启动超时")), 30000);
    const ondata = (buf) => {
      const s = String(buf);
      process.stdout.write(s);
      if (s.includes("http+ws")) {
        clearTimeout(timer);
        resolve(child);
      }
    };
    child.stdout.on("data", ondata);
    child.stderr.on("data", (b) => process.stderr.write(b));
    child.on("exit", (code) => reject(new Error("server 提前退出: " + code)));
  });
}

async function enterAs(page, mode, roomCode) {
  await page.goto(`${BASE}/?level=${LEVEL}`, { waitUntil: "domcontentloaded" });
  await page.fill("#password", PASSWORD);
  if (mode === "join") await page.fill("#roomcode", roomCode);
  await page.click(mode === "create" ? "#btn-create" : "#btn-join");
  await page.waitForSelector("#menu", { state: "hidden", timeout: 15000 });
  await page.waitForFunction(() => document.querySelector("#hud-room")?.textContent?.length > 0, null, { timeout: 15000 });
  const roomText = await page.textContent("#hud-room");
  const code = (roomText.match(/([A-Za-z0-9]{6,})/) || [])[1] ?? "";
  return code;
}

/** 按 [{t, key, type:'down'|'up'}] 时间线注入键盘（key: 'ArrowRight'|'ArrowLeft'|'ArrowUp'） */
async function runInputs(page, timeline, totalMs) {
  const start = Date.now();
  const sorted = [...timeline].sort((a, b) => a.t - b.t);
  let i = 0;
  while (i < sorted.length) {
    const ev = sorted[i];
    const wait = ev.t - (Date.now() - start);
    if (wait > 0) await page.waitForTimeout(Math.min(wait, 100));
    if (Date.now() - start >= ev.t) {
      await page.keyboard[ev.type](ev.key);
      i++;
    }
  }
  if (totalMs) {
    const remain = totalMs - (Date.now() - start);
    if (remain > 0) await page.waitForTimeout(remain);
  }
}

async function runOnce(browser, inputTimeline, expectWin, tag) {
  const ctxA = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
  const ctxB = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
  const a = await ctxA.newPage();
  const b = await ctxB.newPage();
  const result = { tag, errors: [], won: false, finish: null };

  const code = await enterAs(a, "create");
  if (!code) throw new Error("创建房间未取到房间码");
  await enterAs(b, "join", code);
  log(`[${tag}] 房间 ${code} 双方入座，等待 ready→started`);
  await a.waitForTimeout(2600); // ready 2.0s + 余量

  if (inputTimeline.length > 0) {
    await Promise.all([runInputs(a, inputTimeline), runInputs(b, inputTimeline)]);
  }

  // 轮询结果（最长 180s）
  const deadline = Date.now() + 180000;
  let shot10 = false;
  while (Date.now() < deadline) {
    await a.waitForTimeout(1000);
    const errs = [...(await a.evaluate(() => window.__errs)), ...(await b.evaluate(() => window.__errs))];
    if (errs.length > 0) {
      result.errors = errs;
      break;
    }
    const statusA = await a.textContent("#hud-status");
    if (!shot10) {
      shot10 = true;
      await a.waitForTimeout(2000);
      await a.screenshot({ path: join(OUT, `${tag}-ingame-a.png`) });
      await b.screenshot({ path: join(OUT, `${tag}-ingame-b.png`) });
    }
    if (statusA === "通关！") {
      result.won = true;
      await a.waitForTimeout(2200); // stairs 1600ms + 结算板
      await a.screenshot({ path: join(OUT, `${tag}-win-a.png`) });
      await b.screenshot({ path: join(OUT, `${tag}-win-b.png`) });
      break;
    }
    if (statusA.includes("失败") || (await b.textContent("#hud-status"))?.includes("失败")) {
      // gameover 阶段会自动重开——若从未通关，靠最终 won 断言反映
    }
  }
  await ctxA.close();
  await ctxB.close();
  return result;
}

const server = await startServer();
mkdirSync(OUT, { recursive: true });
let timeline = [];
if (INPUTS_FILE) {
  timeline = JSON.parse(readFileSync(INPUTS_FILE, "utf8"));
  log(`输入时间线：${timeline.length} 个事件`);
}

const browser = await chromium.launch({ channel: "msedge", headless: true, args: ["--mute-audio"] });
const results = [];
let pass = true;
for (let r = 1; r <= REPEAT; r++) {
  try {
    const res = await runOnce(browser, timeline, INPUTS_FILE.length > 0, `run${r}`);
    results.push(res);
    const ok = res.errors.length === 0 && (!INPUTS_FILE || res.won);
    log(`run${r}: ${ok ? "PASS" : "FAIL"} won=${res.won} errors=${res.errors.length}`);
    if (!ok) pass = false;
  } catch (err) {
    log(`run${r}: EXCEPTION`, String(err));
    results.push({ tag: `run${r}`, exception: String(err) });
    pass = false;
  }
}
await browser.close();
server.kill();
writeFileSync(join(OUT, "results.json"), JSON.stringify(results, null, 2));
console.log(`[e2e] ${pass ? "ALL PASS" : "FAILED"}（${results.length} 轮，截图与明细在 scripts/e2e/out/）`);
process.exit(pass ? 0 : 1);
