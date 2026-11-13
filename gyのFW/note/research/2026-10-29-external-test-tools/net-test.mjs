#!/usr/bin/env node
/**
 * 外网真机联机测试：对本项目部署的服务器（默认 110.42.36.114:2567）跑双客户端
 * 周期，验证「建房→双人 ready→started→物理增量持续→离开」整条链路。
 *
 * 用法：
 *   node TEMP/net-test.mjs [--base http://110.42.36.114:2567] [--level forest_01]
 *                          [--rounds 3] [--window 6000] [--password test1]
 *
 * 只做客户端行为，不碰服务器文件。判据：
 *  ① /healthz true        ② 建房有 roomId
 *  ③ 双人都拿到 role      ④ started 相位
 *  ⑤ started 期内 patch 持续（≥5/s）  ⑥ 双人 patch 都在流（不是只有房主）
 *  ⑦ 全程无 ws 错误/异常关闭          ⑧ 离开干净
 */
import { Client } from "colyseus.js";

const args = process.argv.slice(2);
const argOf = (n, d) => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 ? args[i + 1] : d;
};
const BASE = argOf("base", process.env.FW_BASE ?? "http://110.42.36.114:2567");
const LEVEL = argOf("level", "forest_01");
const ROUNDS = Number(argOf("rounds", "3"));
const WINDOW = Number(argOf("window", "6000"));
const PW = argOf("password", "test1");

const fails = [];
const ok = (cond, label, detail = "") => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}${detail ? `  ${detail}` : ""}`);
  if (!cond) fails.push(label);
};

const hz = await fetch(`${BASE}/healthz`).then((r) => (r.ok ? r.json() : null)).catch(() => null);
ok(!!hz?.ok, "① /healthz ok", JSON.stringify(hz));

const url = BASE.replace(/^http/, "ws");
let allRounds = 0;

for (let round = 1; round <= ROUNDS; round++) {
  console.log(`\n--- 第 ${round}/${ROUNDS} 轮  level=${LEVEL} ---`);
  const client = new Client(url);
  const errors = [];
  let a = null;
  let b = null;
  try {
    a = await client.create("forest", { levelId: LEVEL, password: PW });
    ok(!!a.roomId && !!a.sessionId, "② 建房", `roomId=${a.roomId} sid=${a.sessionId}`);

    let aRole = null;
    let bRole = null;
    let aPatches = 0;
    let bPatches = 0;
    a.onMessage("role", (r) => { aRole = r; });
    a.onStateChange(() => { aPatches++; });
    a.onError((c, m) => errors.push(`A error ${c}: ${m}`));
    a.onLeave((code) => { if (code !== 1000) errors.push(`A leave code=${code}`); });

    b = await client.joinById(a.roomId, { password: PW }); 
    ok(!!b.sessionId, "② 第二人入房", `sid=${b.sessionId}`);
    b.onMessage("role", (r) => { bRole = r; });
    b.onStateChange(() => { bPatches++; });
    b.onError((c, m) => errors.push(`B error ${c}: ${m}`));
    b.onLeave((code) => { if (code !== 1000) errors.push(`B leave code=${code}`); });

    // 等角色分配 + 相位推进
    const t0 = Date.now();
    let started = false;
    while (Date.now() - t0 < 25000) {
      if (String(a.state?.phase) === "started") { started = true; break; }
      await new Promise((r) => setTimeout(r, 150));
    }
    ok(!!aRole && !!bRole && aRole !== bRole, "③ 双人角色分派且不同", `A=${aRole} B=${bRole}`);
    ok(started, "④ 进入 started", `phase=${a.state?.phase} levelId=${a.state?.levelId}`);

    // 采样期内双端 patch 都要在流
    const pa = aPatches;
    const pb = bPatches;
    const t1 = Date.now();
    await new Promise((r) => setTimeout(r, WINDOW));
    const ga = aPatches - pa;
    const gb = bPatches - pb;
    const secs = (Date.now() - t1) / 1000;
    ok(ga / secs >= 5, "⑤ 房主端 patch 持续", `${secs.toFixed(1)}s +${ga}（${(ga / secs).toFixed(1)}/s）`);
    ok(gb / secs >= 5, "⑥ 队友端 patch 持续", `${secs.toFixed(1)}s +${gb}（${(gb / secs).toFixed(1)}/s）`);
    ok(errors.length === 0, "⑦ 全程无错误/异常断开", errors.length ? errors.slice(0, 2).join(" | ") : "");
    allRounds++;
  } catch (err) {
    ok(false, `第 ${round} 轮执行`, String(err).slice(0, 200));
  } finally {
    await b?.leave(true).catch(() => {});
    await a?.leave(true).catch(() => {});
  }
}

ok(allRounds === ROUNDS, "⑧ 全部轮次跑完", `${allRounds}/${ROUNDS}`);
console.log(fails.length ? `\n=== ${fails.length} 项失败 ===` : "\n=== 外网联机测试全绿 ===");
process.exit(fails.length ? 1 : 0);
