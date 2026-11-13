#!/usr/bin/env node
/**
 * 外网并发与回收测试：
 *  A. 并发建 N 个双人房间，全部进 started（验证多房间隔离与容量）
 *  B. 全部离开后再建新房间，验证旧房已释放（房号不复用、服务端仍健康）
 *  C. 单房间三客户端（超员）必须被拒绝（房间上限 2 人的约束）
 *
 * 用法：node TEMP/concurrency-test.mjs [--base http://110.42.36.114:2567] [--rooms 5]
 *
 * 注意：只在客户端侧并发，房间都是密码保护的临时房，测完全部 leave。
 */
const args = process.argv.slice(2);
const argOf = (n, d) => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 ? args[i + 1] : d;
};
const BASE = argOf("base", process.env.FW_BASE ?? "http://110.42.36.114:2567");
const ROOMS = Number(argOf("rooms", "5"));
const { Client } = await import("colyseus.js");

const fails = [];
const ok = (c, label, detail = "") => {
  console.log(`${c ? "PASS" : "FAIL"}  ${label}${detail ? `  ${detail}` : ""}`);
  if (!c) fails.push(label);
};
const url = BASE.replace(/^http/, "ws");

// ---------- A. 并发建 N 房 ----------
console.log(`--- A. 并发 ${ROOMS} 个双人房间 ---`);
const created = [];
try {
  const setups = Array.from({ length: ROOMS }, async (_, i) => {
    const client = new Client(url);
    const pw = `conc${i}${Math.random().toString(36).slice(2, 5)}`;
    const a = await client.create("forest", { levelId: "forest_02", password: pw });
    const b = await client.joinById(a.roomId, { password: pw });
    b.onMessage("role", () => {});
    a.onMessage("role", () => {});
    return { client, a, b, pw, roomId: a.roomId };
  });
  const results = await Promise.allSettled(setups);
  const good = results.filter((r) => r.status === "fulfilled").map((r) => r.value);
  const bad = results.filter((r) => r.status === "rejected");
  created.push(...good);
  ok(good.length === ROOMS, `A1 并发建房全部成功`, `${good.length}/${ROOMS}${bad.length ? " 失败：" + String(bad[0].reason).slice(0, 80) : ""}`);
  ok(new Set(good.map((g) => g.roomId)).size === good.length, "A2 房间号互不相同（隔离）", `${new Set(good.map((g) => g.roomId)).size} 个唯一房号`);

  // 全部进 started
  const startedFlags = await Promise.all(
    good.map((g) =>
      new Promise((resolve) => {
        const t0 = Date.now();
        const tick = setInterval(() => {
          if (String(g.a.state?.phase) === "started") { clearInterval(tick); resolve(true); }
          else if (Date.now() - t0 > 25000) { clearInterval(tick); resolve(false); }
        }, 200);
      }),
    ),
  );
  ok(startedFlags.every(Boolean), "A3 所有房间都进 started", `${startedFlags.filter(Boolean).length}/${good.length}`);

  // 每房物理都在跑
  const counts = good.map((g) => { const c = { n: 0 }; g.a.onStateChange(() => { c.n++; }); return c; });
  await new Promise((r) => setTimeout(r, 3000));
  const rates = counts.map((c) => c.n / 3);
  const minRate = Math.min(...rates);
  ok(minRate >= 5, "A4 所有房间物理都在跑", `最低 ${minRate.toFixed(1)}/s，最高 ${Math.max(...rates).toFixed(1)}/s`);
} catch (err) {
  ok(false, "A 并发建房", String(err).slice(0, 200));
}

// ---------- C. 超员拒绝（在第 1 个房里塞第三个人）----------
console.log("\n--- C. 超员拒绝 ---");
try {
  const g = created[0];
  if (g) {
    let rejected = false;
    let reason = "";
    try {
      const c3 = await g.client.joinById(g.roomId, { password: g.pw });
      // 没抛错就看是否被服务端立刻踢掉
      await new Promise((r) => setTimeout(r, 1500));
      const stillThere = !!c3.sessionId && c3.state?.players?.size > 2;
      rejected = !stillThere;
      await c3.leave(true).catch(() => {});
      reason = `未抛错，players=${c3.state?.players?.size}`;
    } catch (e) {
      rejected = true;
      reason = String(e).slice(0, 80);
    }
    ok(rejected, "C1 第三人加入被拒绝", reason);
  } else {
    ok(false, "C1 第三人加入被拒绝", "（A 阶段未建出房间）");
  }
} catch (err) {
  ok(false, "C1 超员拒绝", String(err).slice(0, 150));
}

// ---------- B. 全部离开后服务端仍健康 ----------
console.log("\n--- B. 全部离开后健康 ---");
for (const g of created) {
  await g.b?.leave(true).catch(() => {});
  await g.a?.leave(true).catch(() => {});
}
await new Promise((r) => setTimeout(r, 2000));

const hz = await fetch(`${BASE}/healthz`).then((r) => (r.ok ? r.json() : null)).catch(() => null);
ok(!!hz?.ok, "B1 全部离开后 /healthz 仍 ok", JSON.stringify(hz));

try {
  const client = new Client(url);
  const a = await client.create("forest", { levelId: "forest_03", password: "after1" });
  const b = await client.joinById(a.roomId, { password: "after1" });
  let patches = 0;
  a.onStateChange(() => { patches++; });
  a.onMessage("role", () => {});
  b.onMessage("role", () => {});
  const t0 = Date.now();
  while (Date.now() - t0 < 20000 && String(a.state?.phase) !== "started") {
    await new Promise((r) => setTimeout(r, 200));
  }
  const p0 = patches;
  await new Promise((r) => setTimeout(r, 3000));
  const gain = patches - p0;
  ok(String(a.state?.phase) === "started" && gain / 3 >= 5, "B2 清空后再建新房正常", `phase=${a.state?.phase} +${gain}/3s`);
  await b.leave(true).catch(() => {});
  await a.leave(true).catch(() => {});
} catch (err) {
  ok(false, "B2 清空后再建新房", String(err).slice(0, 150));
}

console.log(fails.length ? `\n=== ${fails.length} 项失败 ===` : "\n=== 并发与回收测试全绿 ===");
process.exit(fails.length ? 1 : 0);
