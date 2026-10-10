/**
 * e2e 公共库：起服/入场/键盘注入/started 闸/sync 字段探针。
 *
 * 自验收制度（note/self-acceptance.md）L3 行为层共用件：
 * - 一律走真实菜单与真实服务端（唯一允许的加速器是 FW_DEBUG_* 钩子，且其覆盖面
 *   必须另有非钩子等价用例，如 regression.mjs 的真实走位通关模式）。
 * - sync 探针：客户端页面内直读权威 state，断言全部映射条目的同步字段真实到达——
 *   服务端 defineTypes 漏注册类缺陷（0.3.25 BodyState.state）在此暴露。
 */
import { spawn } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const OUT = join(ROOT, "scripts", "e2e", "out");
export const PASSWORD = "e2e-pw";

export function argOf(argv, name, def) {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : def;
}

export const log = (...a) => console.log("[e2e]", ...a);

export function startServer(port, extraEnv = {}) {
  // --import tsx：进程内加载 TS（无 CLI 子进程）——kill 才能真正杀掉服务器，
  // 否则 tsx CLI 的 node 子进程会变孤儿霸占端口（实测坑，见冻结文档）
  const child = spawn(process.execPath, [
    "--import", "tsx",
    join(ROOT, "packages", "server", "src", "index.ts"),
  ], {
    // FW_WIND_PHASE=0：e2e/门禁服务端风力用固定相位偏移（F6），与内核缺省位级同口径——
    // 否则生产墙钟相位逐跑随机，风区关路线回放永远不可复现。需要随机相位时显式覆盖。
    env: { ...process.env, PORT: String(port), FW_HOST: "127.0.0.1", FW_WIND_PHASE: process.env.FW_WIND_PHASE ?? "0", ...extraEnv },
    stdio: ["ignore", "pipe", "pipe"],
  });
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("server 启动超时")), 30000);
    const ondata = (buf) => {
      const s = String(buf);
      process.stdout.write(s);
      if (s.includes("EADDRINUSE")) {
        clearTimeout(timer);
        reject(new Error("端口被占用（疑似孤儿服务器进程，先按端口清理）"));
      } else if (s.includes("http+ws")) {
        clearTimeout(timer);
        resolve(child);
      }
    };
    child.stdout.on("data", ondata);
    child.stderr.on("data", (b) => process.stderr.write(b));
    child.on("exit", (code) => reject(new Error("server 提前退出: " + code)));
  });
}

export async function enterAs(page, port, mode, roomCode, level = "forest_01") {
  const BASE = `http://127.0.0.1:${port}`;
  await page.goto(`${BASE}/?level=${level}`, { waitUntil: "domcontentloaded" });
  await page.fill("#password", PASSWORD);
  if (mode === "join") await page.fill("#roomcode", roomCode);
  await page.click(mode === "create" ? "#btn-create" : "#btn-join");
  await page.waitForSelector("#menu", { state: "hidden", timeout: 15000 });
  await page.waitForFunction(() => /房间码 [^（\s]{4,}/.test(document.querySelector("#hud-room")?.textContent ?? ""), null, { timeout: 20000 });
  const roomText = await page.textContent("#hud-room");
  // Colyseus roomId 字符集不止 alnum：取 房间码 与（密码已校验）之间的完整串
  return (roomText.match(/房间码 ([^（\s]+)/) || [])[1] ?? "";
}

/** 按 [{t, key, type:'down'|'up'}] 时间线注入键盘（key 为 Playwright 键名，如 'ArrowRight'/'d'） */
export async function runInputs(page, timeline, totalMs) {
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

/** 等权威相位到 started：必须读状态相位，DOM 文本轮询有 250ms 假空窗（见 regression 头注） */
export async function waitForStarted(page, timeoutMs = 20000) {
  const gate = `(() => { try { return window.__fwInit.net.room.state.phase === "started"; } catch { return false; } })()`;
  await page.waitForFunction(gate, null, { timeout: timeoutMs });
}

/**
 * sync 字段探针（页面内直读权威 state）：全部映射条目的 state 字段、doors 六字段必须真实到达。
 * 服务端 defineTypes 漏注册的字段不上 wire，客户端解码后为 undefined——0.3.25 灯罩换帧
 * 从未生效即此类缺陷，页面内可精确断言。
 */
export async function syncProbe(page) {
  return page.evaluate(() => {
    try {
      const s = window.__fwInit.net.room.state;
      if (!s) return ["state 不可用"];
      const errs = [];
      const entries = (m) => {
        if (!m) return [];
        if (typeof m.entries === "function") return [...m.entries()];
        if (m.all && typeof m.all === "object") return Object.entries(m.all);
        return Object.entries(m);
      };
      for (const k of ["platforms", "props", "hangings", "pulleys", "romans"]) {
        for (const [id, b] of entries(s[k])) {
          if (typeof b?.state !== "number") errs.push(`${k}[${id}].state=${String(typeof b?.state)}`);
        }
      }
      const d = s.doors ?? {};
      for (const f of ["fbAtDoor", "wgAtDoor", "fbFrame", "wgFrame", "fbUp", "wgUp"]) {
        if (typeof d[f] === "undefined") errs.push(`doors.${f} 缺失`);
      }
      for (const k of ["lobby", "levelId"]) {
        if (k === "levelId" && !String(s.levelId ?? "")) errs.push("levelId 为空");
      }
      return errs;
    } catch (e) {
      return ["syncProbe 异常: " + String(e)];
    }
  });
}

export async function readRole(page) {
  return (await page.textContent("#hud-role")) ?? "";
}

export async function roomState(page, expr) {
  return page.evaluate(`(() => { try { const s = window.__fwInit.net.room.state; return (${expr}); } catch (e) { return "ERR:" + e; } })()`);
}
