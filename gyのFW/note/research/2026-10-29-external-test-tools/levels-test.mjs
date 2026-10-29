#!/usr/bin/env node
/**
 * 外网多关卡冒烟：对部署服务器抽测不同类型（general / speed / puzzle）与不同规模
 * 的关卡，验证「关卡数据能取到、能被服务端载入、物理能推进、无异常」。
 *
 * 用法：
 *   node TEMP/levels-test.mjs [--base http://110.42.36.114:2567] [--levels a,b,c]
 *
 * 为不干扰真实玩家、也不在服务器上留东西，只用 colyseus.js 建私密房间（密码随机），
 * 每关测完立刻 leave。每关判据：
 *  ① /api/level/<id> 200 且 JSON 可解析
 *  ② 建房成功（服务端 loadLevel 通过 = 关卡解析器吃得下）
 *  ③ 双人 started
 *  ④ 3 秒内 patch 持续（物理真在跑）
 *  ⑤ 无异常退出
 */
const args = process.argv.slice(2);
const argOf = (n, d) => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 ? args[i + 1] : d;
};
const BASE = argOf("base", process.env.FW_BASE ?? "http://110.42.36.114:2567");
const { Client } = await import("colyseus.js");

// 覆盖三类关卡类型、含长名/下划线变体、含靠后的关
const DEFAULT_LEVELS = [
  "forest_01",   // 教学（general）
  "forest_02",   // general 首关
  "forest_03",   // speed
  "forest_07",   // puzzle（含球）
  "forest_12_1", // 下划线变体
  "forest_20",   // 定时钮联动
  "forest_47",   // 末关
];
const LEVELS = argOf("levels", "") ? argOf("levels", "").split(",") : DEFAULT_LEVELS;

const fails = [];
const ok = (c, label, detail = "") => {
  console.log(`${c ? "PASS" : "FAIL"}  ${label}${detail ? `  ${detail}` : ""}`);
  if (!c) fails.push(label);
};

const url = BASE.replace(/^http/, "ws");

for (const level of LEVELS) {
  console.log(`\n--- ${level} ---`);
  // ① 关卡 JSON
  let jsonOk = false;
  let size = 0;
  try {
    const r = await fetch(`${BASE}/api/level/${level}`);
    const txt = await r.text();
    size = txt.length;
    if (r.ok) { JSON.parse(txt); jsonOk = true; }
  } catch { /* fallthrough */ }
  ok(jsonOk, `① /api/level/${level} 200 + 合法 JSON`, `${size} bytes`);
  if (!jsonOk) continue;

  const client = new Client(url);
  let a = null;
  let b = null;
  try {
    const pw = `lvl${Math.random().toString(36).slice(2, 7)}`;
    a = await client.create("forest", { levelId: level, password: pw });
    ok(!!a.roomId, "② 建房（服务端解析关卡通过）", `roomId=${a.roomId}`);
    let aPatches = 0;
    a.onStateChange(() => { aPatches++; });
    a.onMessage("role", () => {});
    b = await client.joinById(a.roomId, { password: pw });
    b.onStateChange(() => {});
    b.onMessage("role", () => {});

    const t0 = Date.now();
    let started = false;
    while (Date.now() - t0 < 20000) {
      if (String(a.state?.phase) === "started") { started = true; break; }
      await new Promise((r) => setTimeout(r, 150));
    }
    ok(started, "③ 双人 started", `levelId=${a.state?.levelId}`);

    const p0 = aPatches;
    await new Promise((r) => setTimeout(r, 3000));
    const gain = aPatches - p0;
    ok(gain / 3 >= 5, "④ 物理在跑（patch 持续）", `3s +${gain}（${(gain / 3).toFixed(1)}/s）`);
  } catch (err) {
    ok(false, "② 建房/开局", String(err).slice(0, 180));
  } finally {
    await b?.leave(true).catch(() => {});
    await a?.leave(true).catch(() => {});
  }
}

console.log(fails.length ? `\n=== ${fails.length} 项失败 ===` : `\n=== ${LEVELS.length} 关冒烟全绿 ===`);
process.exit(fails.length ? 1 : 0);
