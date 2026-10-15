/**
 * 阶段门回归：双浏览器真实联机通关 forest_01（0.3.0 冻结需求 #10）。
 *
 * 用法（Git Bash，先注入便携 Node PATH）：
 *   node scripts/e2e/regression.mjs [--repeat 3] [--script inputs.json] [--port 3557]
 *
 * 流程：构建产物由调用方保证（npm run build）→ 起服 → 双 headless 浏览器走真实菜单
 * （创建/加入/房间码）→ ready→started → 按 inputs 时间线注入键盘（F1 按角色分键后，方向键只作用于 fb 页、WASD 只作用于 wg 页——一条时间线双页同注入各取所需，walkin-doors.json 即此用法）→ 断言：
 *   - window.__errs 全程为空
 *   - 有 winning 脚本：HUD 出现「通关！」（phase=won）且 finish 数据合理
 *   - 无脚本：soak 模式（30s 物理浸泡，只断言零错误 + 角色存活）
 * 截图存 scripts/e2e/out/。
 *
 * 真实走位入门（0.3.27 起，不依赖 FW_DEBUG_FORCE_DOORS）：
 *   node scripts/e2e/regression.mjs --level zz_probe --script scripts/e2e/inputs/walkin-doors.json --expect-win
 * zz_probe 是 forest_01 克隆（出生点挪到门带左侧平地），fixtures/levels/*.json 起服前
 * 安装进 data/tutorials/levels、结束后自动移除——不污染官方 48 关枚举测试与发行数据。
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright";
import { OUT, ROOT, argOf, enterAs, log, readRole, runInputs, startServer, syncProbe, waitForStarted } from "./lib.mjs";

const args = process.argv.slice(2);
const REPEAT = Number(argOf(args, "repeat", "1"));
const EXPECT_WIN = args.includes("--expect-win");
const INPUTS_FILE = argOf(args, "script", "");
const PORT = Number(argOf(args, "port", "3557"));
const LEVEL = argOf(args, "level", "forest_01");

/** fixtures/levels/*.json → data/tutorials/levels/（仅安装缺省不存在的；返回安装清单供清理） */
function installFixtures() {
  const srcDir = join(ROOT, "scripts", "e2e", "fixtures", "levels");
  const dstDir = join(ROOT, "data", "tutorials", "levels");
  if (!existsSync(srcDir)) return [];
  const installed = [];
  for (const f of readdirSync(srcDir)) {
    if (!f.endsWith(".json")) continue;
    const dst = join(dstDir, f);
    if (!existsSync(dst)) {
      copyFileSync(join(srcDir, f), dst);
      installed.push(dst);
    }
  }
  return installed;
}

/** 按 [{t, key, type:'down'|'up'}] 时间线注入键盘（key 为 Playwright 键名；方向键只作用于 fb 页、WASD 只作用于 wg 页，F1 按角色分键） */
async function runOnce(browser, inputTimeline, expectWin, tag) {
  const ctxA = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
  const ctxB = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
  const a = await ctxA.newPage();
  const b = await ctxB.newPage();
  const result = { tag, errors: [], won: false, finish: null, syncErrors: [] };

  const code = await enterAs(a, PORT, "create", "", LEVEL);
  if (!code) throw new Error("创建房间未取到房间码");
  await enterAs(b, PORT, "join", code, LEVEL);
  log(`[${tag}] 房间 ${code} 双方入座，等待 ready→started`);
  // 等 started：必须读权威状态相位，不能等 DOM 文本清空——hud-status 由 250ms 轮询刷写
  // 且初始即为空串，轮询 tick 前存在假空窗，会让注入抢先于 started，输入被客户端键盘
  // 暂停闸（setPaused(phase!=="started")）整段丢弃且 15Hz 重发重放"全松"快照，角色冻结、
  // won 永假（2026-10-09 诊断：双方 30s 钉在出生点 vx=0 anim=idle）
  await waitForStarted(a);
  await waitForStarted(b);
  await a.waitForTimeout(300);

  // sync 字段探针：defineTypes 漏注册类缺陷（0.3.25 BodyState.state）在客户端表现为字段缺席
  result.syncErrors = await syncProbe(a);
  if (result.syncErrors.length > 0) log(`[${tag}] ⚠ sync 探针异常: ${result.syncErrors.join("; ")}`);
  result.role = await readRole(a);

  if (inputTimeline.length > 0) {
    await Promise.all([runInputs(a, inputTimeline), runInputs(b, inputTimeline)]);
  }

  // 轮询结果（最长 180s）
  const deadline = Date.now() + (EXPECT_WIN ? 180000 : 20000);
  let shot10 = false;
  let poll = 0;
  while (Date.now() < deadline) {
    await a.waitForTimeout(1000);
    poll++;
    const errs = [...(await a.evaluate(() => window.__errs)), ...(await b.evaluate(() => window.__errs))];
    if (errs.length > 0) {
      result.errors = errs;
      break;
    }
    const statusA = await a.textContent("#hud-status");
    if (poll % 3 === 0) log(`[${tag}] poll${poll} status="${statusA}" role=${await a.textContent("#hud-role")}`);
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
      // gameover 后静置等 Retry（F2 翻转，原版无自动重开）——若从未通关，靠最终 won 断言反映
    }
  }
  await ctxA.close();
  await ctxB.close();
  return result;
}

const installedFixtures = installFixtures();
if (installedFixtures.length > 0) log(`已安装关卡 fixture：${installedFixtures.map((f) => f.split(/[\\/]/).pop()).join(", ")}`);

let server;
let pass = false;
const results = [];
try {
  server = await startServer(PORT);
  mkdirSync(OUT, { recursive: true });
  let timeline = [];
  if (INPUTS_FILE) {
    timeline = JSON.parse(readFileSync(INPUTS_FILE, "utf8"));
    log(`输入时间线：${timeline.length} 个事件`);
  }

  const browser = await chromium.launch({ channel: process.env.FW_BROWSER_CHANNEL ?? (process.platform === "win32" ? "msedge" : undefined), headless: true, args: ["--mute-audio"] });
  pass = true;
  for (let r = 1; r <= REPEAT; r++) {
    try {
      const res = await runOnce(browser, timeline, INPUTS_FILE.length > 0, `run${r}`);
      results.push(res);
      const ok = res.errors.length === 0 && res.syncErrors.length === 0 && (!EXPECT_WIN || res.won);
      log(`run${r}: ${ok ? "PASS" : "FAIL"} won=${res.won} errors=${res.errors.length} sync=${res.syncErrors.length}`);
      if (!ok) pass = false;
    } catch (err) {
      log(`run${r}: EXCEPTION`, String(err));
      results.push({ tag: `run${r}`, exception: String(err) });
      pass = false;
    }
  }
  await browser.close();
} finally {
  server?.kill();
  for (const f of installedFixtures) rmSync(f, { force: true });
}
writeFileSync(join(OUT, "results.json"), JSON.stringify(results, null, 2));
console.log(`[e2e] ${pass ? "ALL PASS" : "FAILED"}（${results.length} 轮，截图与明细在 scripts/e2e/out/）`);
process.exit(pass ? 0 : 1);
