/**
 * templesmoke — 三部（crystal/elements/fairytales）journey 冒烟 e2e（fw-journey-3temples 槽）。
 *
 * 用户三部游玩验收前的真浏览器管线扫盲：把「装载/建房/双人/门/胜利/换关」管线在三部各验
 * 一轮——深链 ?level= 装载 → A 建房（火娃席位）/ B 房码加入（水娃席位）→ phase=started →
 * FORCE_DOORS 开门通关（phase=won）→ 活房间 advance 换关 → 下一关正常加载 started。
 *
 * 断言全部读权威 state 轮询（journey.mjs 语义：DOM 文本轮询有 250ms 假空窗且 updateHud
 * 4Hz 慢一拍，一律 waitForFunction 权威相位/字段，不写死 sleep）。加速器与 lightsmoke 同
 * 口径：FW_DEBUG_FORCE_DOORS=1（既有服务端测试钩子——每 500ms 置双门 isOpen=true 模拟双
 * 角色站门内，走真实 25fps 扫帧 → isUp → win 判定路径，区别于 AUTO_WIN 直接注入 win 事件）。
 *
 * CSP 注意（0.3.51 #45 起 index.html 强制 script-src 'self' 无 unsafe-eval）：Playwright
 * 的 waitForFunction/evaluate 【字符串表达式】走页面内 eval，会被 CSP 拦成 EvalError——
 * 本脚本全部用【函数形态】gate（值经 arg 传参，闭包不跨上下文）。journey.mjs 的字符串门
 * 是 0.3.51 之前写的，当前 CSP 构建下已不可直接复用（lib.mjs waitForStarted/roomState 同因）。
 *
 * 选关（三部各一关 + 各自 advance 后继；理由详见 note/research/2026-11-01-temple-smoke.md）：
 * - C 部 crystal_04 → crystal_14：自有最低编号实关卡（crystal_01/02 不存在、crystal_03 已
 *   终审 oracle 固有死关——note/evidence/2026-10-31-oracle-adjudication/05号档，避开）；
 *   后继按 data/crystal/temple.json 数组序。
 * - E 部 e_tutorial_water → ewater_1：water 庙教学关（同族 e_tutorial_fire 已终审死关、
 *   门物理不可达——02号档，避开；e_tutorial_water 物理可通关性未终审，本冒烟只证
 *   FORCE_DOORS 下 win/换关管线，物理通关归路线搜索线）；后继按 elements/water temple.json。
 * - F 部 fairies_000 → fairies-12-dark：教学关（fairies-01 已终审死关——04号档 oracle
 *   裁决，避开）；后继按 fairytales temple.json 数组序自然落到 dark 关，顺带覆盖 dark 装载。
 *
 * 用法：
 *   node scripts/e2e/templesmoke.mjs                 # 自起服（3681，FORCE_DOORS）
 *   node scripts/e2e/templesmoke.mjs --port 2567    # 连已运行服（CI 用，不自杀服）
 *   node scripts/e2e/templesmoke.mjs --only crystal,fairytales
 *
 * 判据：每轮 11 项断言（入房/开局/席位×2/通关/门线字段/B 回声/advance/留场/活局/
 * pageerror）全绿退出码 0；结果 JSON 与截图落 scripts/e2e/out/（gitignore 内）。
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright";
import { OUT, argOf, enterAs, log, readRole, startServer } from "./lib.mjs";

const argv = process.argv.slice(2);
const PORT = Number(argOf(argv, "port", "3681"));
const ONLY = (argOf(argv, "only", "") || "").split(",").map((s) => s.trim()).filter(Boolean);
/** 显式 --port=连外部服（CI 模式，脚本不自杀服）；否则自起服并在收尾 kill */
const OWN_SERVER = !argv.includes("--port");

const TEMPLES = [
  { temple: "crystal", level: "crystal_04", next: "crystal_14" },
  { temple: "elements", level: "e_tutorial_water", next: "ewater_1" },
  { temple: "fairytales", level: "fairies_000", next: "fairies-12-dark" },
].filter((t) => ONLY.length === 0 || ONLY.includes(t.temple));
if (TEMPLES.length === 0) {
  console.error(`[e2e] --only 过滤后无部可跑（可选 crystal|elements|fairytales）`);
  process.exit(2);
}

const results = { port: PORT, temples: TEMPLES.map((t) => `${t.level}→${t.next}`), pass: false, checks: [] };
const check = (temple, name, ok, detail = "") => {
  results.checks.push({ temple, name, ok, detail });
  log(`${ok ? "✓" : "✗"} [${temple}] ${name}${detail ? " —— " + detail : ""}`);
  return ok;
};

// ── CSP 安全探针（全函数形态，值走 arg；读权威 state，异常按未到位处理）──
/** 等权威相位到位 */
const waitPhase = (page, target, timeoutMs) =>
  page.waitForFunction((t) => {
    try { return window.__fwInit?.net?.room?.state?.phase === t; } catch { return false; }
  }, target, { timeout: timeoutMs });
/** 等权威 levelId 等于目标 */
const waitLevel = (page, target, timeoutMs) =>
  page.waitForFunction((t) => {
    try { return String(window.__fwInit?.net?.room?.state?.levelId ?? "") === t; } catch { return false; }
  }, target, { timeout: timeoutMs });
/** 等权威时钟走过 t1（新关活局） */
const waitTimerGt = (page, t1, timeoutMs) =>
  page.waitForFunction((t) => {
    try { return Number(window.__fwInit?.net?.room?.state?.timerMs) > t; } catch { return false; }
  }, t1, { timeout: timeoutMs });
/** 换关后等 started。FORCE_DOORS 下新关 started 窗口仅 ~1s（ready 2s → started → 钩子
 * ~1s 内再推 won）——轮询错过 started 窗时，won 相位只能从 started 迁移而来
 * （ForestRoom.restartLevel: ready→started→checkEnd won），读到 won 即证明 started 已发生。 */
const waitStartedOrWon = async (page, timeoutMs = 20000) => {
  try {
    await waitPhase(page, "started", timeoutMs);
    return "started";
  } catch {
    const ph = await readS(page, "phase");
    if (ph === "won") return "won(蕴含started)";
    throw new Error("started 未达，phase=" + ph);
  }
};
/** 读权威 state 单字段（k: phase|levelId|timer|doors） */
const readS = (page, k) =>
  page.evaluate((key) => {
    try {
      const s = window.__fwInit?.net?.room?.state;
      if (!s) return null;
      if (key === "phase") return String(s.phase);
      if (key === "levelId") return String(s.levelId ?? "");
      if (key === "timer") return Number(s.timerMs);
      if (key === "doors") {
        // 断言面收口到 wire：站门模拟（players.atDoor）与门扫帧到位（doors.fbUp/wgUp）
        return JSON.stringify({
          fbAtDoor: s.players?.get?.("fireboy")?.atDoor === true,
          wgAtDoor: s.players?.get?.("watergirl")?.atDoor === true,
          fbUp: s.doors?.fbUp === true,
          wgUp: s.doors?.wgUp === true,
        });
      }
      return null;
    } catch (e) {
      return "ERR:" + String(e);
    }
  }, k);

let server;
let fail = 0;
try {
  if (OWN_SERVER) {
    server = await startServer(PORT, { FW_DEBUG_FORCE_DOORS: "1" });
  } else {
    log(`连接外部服务器 :${PORT}（CI 模式，须以 FW_DEBUG_FORCE_DOORS=1 启动）`);
  }
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: true, args: ["--mute-audio"] });

  for (const { temple, level, next } of TEMPLES) {
    const errsA = [];
    const errsB = [];
    const ctxA = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
    const ctxB = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
    const a = await ctxA.newPage();
    const b = await ctxB.newPage();
    a.on("pageerror", (e) => errsA.push(String(e?.stack ?? e).slice(0, 800)));
    b.on("pageerror", (e) => errsB.push(String(e?.stack ?? e).slice(0, 800)));
    try {
      // ── 装载 + 建房/加入 ──
      const code = await enterAs(a, PORT, "create", "", level);
      let joined = false;
      for (let i = 0; i < 3 && !joined; i++) {
        try {
          await enterAs(b, PORT, "join", code, level);
          joined = true;
        } catch {
          log(`[${temple}] join 第${i + 1}次失败重试`);
        }
      }
      check(temple, `${level} 双人入房（A 建房选火 / B 房码加入选水）`, joined, `房间码=${code}`);
      if (!joined) throw new Error("join 3 连败");
      // 开局判定走相位链（started 为 ~1s 瞬态：ready 2s → started → FORCE_DOORS ~1s 内
      // 推 won；个别端 patch 停顿时会整窗错过 started 直跳 won——won 只能从 started 迁移，
      // 相位 ∈ {started,won} + 权威时钟已走字即证明完整 ready→started→(活局) 链发生）
      const startA = await waitStartedOrWon(a);
      const startB = await waitStartedOrWon(b);
      const lvl1 = await readS(a, "levelId");
      const ph1 = await readS(a, "phase");
      const t0 = await readS(a, "timer");
      check(
        temple,
        `${level} 开局 started 且 levelId 权威回声`,
        (ph1 === "started" || ph1 === "won") && lvl1 === level && t0 > 0,
        `levelId=${lvl1} phase=${ph1} t=${t0} 路径 A=${startA}/B=${startB}`,
      );
      check(temple, "席位保留 A=火娃", ((await readRole(a)) ?? "").includes("火娃"), await readRole(a));
      check(temple, "席位保留 B=水娃", ((await readRole(b)) ?? "").includes("水娃"), await readRole(b));

      // ── FORCE_DOORS 通关 ──
      let won = false;
      try {
        await waitPhase(a, "won", 45000);
        won = true;
      } catch { /* 超时按失败记 */ }
      check(temple, `${level} FORCE_DOORS 通关（phase=won）`, won);
      const doors = await readS(a, "doors");
      check(
        temple,
        "站门+门到位线上字段（atDoor×2 / fbUp/wgUp）",
        doors === '{"fbAtDoor":true,"wgAtDoor":true,"fbUp":true,"wgUp":true}',
        doors,
      );
      await waitPhase(b, "won", 10000).catch(() => {});
      const phB = await readS(b, "phase");
      check(temple, "B 端 won 回声", phB === "won", `phase=${phB}`);

      // ── 活房间 advance 换关（双端 __fwNextLevel；第二发在 ready 相位被服务端天然忽略）──
      for (const page of [a, b]) await page.evaluate(() => window.__fwNextLevel());
      let echoed = true;
      for (const page of [a, b]) {
        try {
          await waitLevel(page, next, 15000);
        } catch {
          echoed = false;
        }
      }
      const seatA = await waitStartedOrWon(a);
      const seatB = await waitStartedOrWon(b);
      const lvl2 = await readS(a, "levelId");
      const ph2 = await readS(a, "phase");
      check(temple, `活房间 advance → ${next} started（双端 levelId 回声）`, echoed && lvl2 === next && (ph2 === "started" || ph2 === "won"), `levelId=${lvl2} phase=${ph2} 到位路径 A=${seatA}/B=${seatB}`);
      const codeA2 = (((await a.textContent("#hud-room")) ?? "").match(/房间码 ([^（\s]+)/) || [])[1] ?? "";
      check(temple, "换关同房留场（房间码不变）", codeA2 === code, `${code}→${codeA2}`);
      // 新关活局：权威时钟在新关已走字（restartLevel 清零后逐 tick 增长）。FORCE_DOORS 下
      // 新关 ~1s 内被钩子再次推到 won、tick 早退时钟冻结——故断言 timerMs>0（冻结终值即
      // 走字证据）而非"持续增长"，避免与钩子自动通关竞态；时钟卡死/世界不 tick 类缺陷仍以 0 值暴露。
      let ticked = false;
      try {
        await waitTimerGt(a, 0, 5000);
        ticked = true;
      } catch { /* 超时按失败记 */ }
      const t2 = await readS(a, "timer");
      check(temple, `${next} 新关活局（权威时钟已走字）`, ticked && t2 > 0, `t=${t2}`);
      // 全程 pageerror=0（browser-room 口径：三部新客户端视图链路无脚本异常）
      check(temple, "全程 pageerror=0（A/B 双端）", errsA.length === 0 && errsB.length === 0, [...errsA, ...errsB].join("; ").slice(0, 300));
      await a.screenshot({ path: join(OUT, `temple-${temple}-a.png`) });
      await b.screenshot({ path: join(OUT, `temple-${temple}-b.png`) });
    } catch (e) {
      check(temple, `${temple} 轮执行中断`, false, String(e).slice(0, 300));
      for (const [tag, page] of [["a", a], ["b", b]]) {
        await page.screenshot({ path: join(OUT, `temple-${temple}-${tag}-FAIL.png`) }).catch(() => {});
      }
    }
    await ctxA.close();
    await ctxB.close();
  }

  await browser.close();
} finally {
  fail = results.checks.filter((c) => !c.ok).length;
  writeFileSync(join(OUT, "templesmoke.json"), JSON.stringify(results, null, 2));
  server?.kill();
}
const passCount = results.checks.filter((c) => c.ok).length;
console.log(`[e2e] templesmoke: ${fail === 0 ? "ALL PASS" : "FAILED"}（${passCount}/${results.checks.length} 项）`);
process.exit(fail === 0 ? 0 : 1);
