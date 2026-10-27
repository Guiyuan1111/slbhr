/**
 * ForestRoom 服务端房间生命周期·集成测试（issue #8 / M-03 门禁真实化）。
 *
 * 方法：进程内起真实 Colyseus Server（WebSocketTransport + ForestRoom，端口 0 临时分配），
 * colyseus.js Node 客户端真实入场——断言全部读权威 state 与服务端广播消息，不 mock 房间
 * 内部。用例语义以 A 槽探针（note/issues-2026-10-20/A-server-room.md，TEMP/roomfix/probe.mjs
 * 8/8 PASS 实录）为蓝本改造成 vitest 常驻用例，覆盖：
 *   暂停/恢复（F3）｜started 期断线/重连（B-01 前置场景）｜#2 H-01 主动退出（含暂停者离场变体）
 *   #3 H-02 ready 期断线（守卫不缺人开跑 + 超时回 lobby）｜#6 M-01 超时清暂停广播 + resume 幂等回声
 *   #11 M-06 started 重试｜#12 L-01 幽灵角色｜win/finish 语义｜#13 L-02 won 重连结算
 *   #1 B-01 时基恢复（最小版）｜入场守卫（密码 4403 / 满员拒绝）
 *
 * 缩窗与确定性：
 * - FW_RECONNECT_SECONDS=2（ForestRoom 模块顶部读一次 → 用 vi.hoisted 在 import 前注入）
 * - FW_WIND_PHASE=0（e2e/门禁同口径，风力固定相位）
 * - FW_DEBUG_AUTO_WIN=1 仅 win 流用例注入（onCreate 时读取；started 后 5s 注入真实 win 事件，
 *   与 e2e journey 同一加速器惯例）
 * 红线：本文件为纯测试，不改 ForestRoom.ts 产品码；断言语义以当前实现为准（A 槽七修后行为）。
 */
import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { Client, type Room as ClientRoom } from "colyseus.js";

vi.hoisted(() => {
  // 重连窗取 4s > READY_MS=2s：H-02 用例要在「旧 ready 钟到点」与「重连超时」两个事件
  // 之间留出无碰撞观察窗（两者同窗会竞态，首跑实录 12/13 即败于此）
  process.env.FW_RECONNECT_SECONDS = "4";
  process.env.FW_WIND_PHASE = "0";
});

import { Server, WebSocketTransport } from "../colyseus.cjs.js";
import { ForestRoom } from "../rooms/ForestRoom.js";

const PW = "gate-pw-123";
/** 原版 startLevel：ready 2.0s 开钟（ForestRoom READY_MS） */
const READY_MS = 2000;
/** 本文件注入的断线重连窗（FW_RECONNECT_SECONDS=4） */
const RECONNECT_MS = 4000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface Srv {
  url: string;
  shutdown: () => Promise<void>;
}

/** 进程内真实服务器：每用例独立实例（端口 0 临时分配，用后优雅停机+环境还原） */
async function startServer(extraEnv: Record<string, string> = {}): Promise<Srv> {
  const saved = Object.entries(extraEnv).map(([k]) => [k, process.env[k]] as const);
  for (const [k, v] of Object.entries(extraEnv)) process.env[k] = v;
  const httpServer = http.createServer();
// 注记（#39）：每个 new Server 在进程级泄 4 监听器（Colyseus 无 tearDown API），
// 多实例后的 MaxListenersExceededWarning 是噪声非缺陷，进程退出即回收。
  const gameServer = new Server({ transport: new WebSocketTransport({ server: httpServer }) });
  gameServer.define("forest", ForestRoom);
  await gameServer.listen(0, "127.0.0.1");
  const port = (httpServer.address() as AddressInfo).port;
  return {
    url: `ws://127.0.0.1:${port}`,
    shutdown: async () => {
      try {
        await gameServer.gracefullyShutdown(false);
      } catch {
        /* 已停 */
      }
      for (const [k, v] of saved) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
    },
  };
}

/** 已启动未停机的服务器（afterEach 统一回收） */
const liveServers: Srv[] = [];
afterEach(async () => {
  while (liveServers.length) await liveServers.pop()!.shutdown();
});

/** 轮询等待：权威 state 经 patch 异步到达（25ms 步进） */
async function waitFor(desc: string, fn: () => boolean, timeoutMs = 8000): Promise<void> {
  const t0 = Date.now();
  while (!fn()) {
    if (Date.now() - t0 > timeoutMs) throw new Error(`等待超时: ${desc}（已等 ${Date.now() - t0}ms）`);
    await sleep(25);
  }
}

const phaseOf = (room: ClientRoom<any>) => String((room.state as any).phase);
const timerOf = (room: ClientRoom<any>) => (room.state as any).timerMs;
const playersOf = (room: ClientRoom<any>) => (room.state as any).players;

async function waitPhase(room: ClientRoom<any>, phase: string, timeoutMs = 10000): Promise<void> {
  await waitFor(`phase=${phase}`, () => phaseOf(room) === phase, timeoutMs);
}

/** 收集某类广播消息（join 返回后注册即可覆盖后续广播） */
function collect(room: ClientRoom<any>, type: string): any[] {
  const arr: any[] = [];
  room.onMessage(type, (m) => arr.push(m));
  return arr;
}

/** MapSchema 的键列表（colyseus 0.16 v3 解码：条目存 $items Map，键需显式枚举） */
function mapKeys(m: any): string[] {
  return [...((m?.$items as Map<string, unknown>)?.keys() ?? [])].map(String).sort();
}

/** 按角色取玩家动态对象 */
function playerOf(room: ClientRoom<any>, role: string) {
  return (playersOf(room) as any).get(role);
}

/** 双人入场：a 建房（fireboy）、b joinById（watergirl），等待开局倒计时 */
async function joinPair(url: string, levelId = "forest_01") {
  const c1 = new Client(url);
  const a = await c1.create("forest", { password: PW, levelId });
  const c2 = new Client(url);
  const b = await c2.joinById(a.roomId, { password: PW });
  await waitPhase(a, "ready");
  return { a, b };
}

/** 入场并等到 started 开钟 */
async function joinStarted(url: string, levelId = "forest_01") {
  const pair = await joinPair(url, levelId);
  await waitPhase(pair.a, "started", READY_MS + 2500);
  return pair;
}

describe("ForestRoom 房间生命周期（issue #8 集成测试，A 槽探针语义）", () => {
  it("玩家暂停/恢复：服务端权威冻结（timerMs/坐标停摆）+ 双端广播（F3）", async () => {
    liveServers.push(await startServer());
    const { url } = liveServers[0];
    const { a, b } = await joinStarted(url);
    const seenA = collect(a, "pause-changed");
    const seenB = collect(b, "pause-changed");

    a.send("pause", {});
    await waitFor("双端收到 paused:true", () => seenA.at(-1)?.paused === true && seenB.at(-1)?.paused === true);
    expect(seenA.at(-1)?.by).toBe("fireboy");
    expect(phaseOf(a)).toBe("started"); // 玩家暂停不占相位（仍为 started）

    const t1 = timerOf(a);
    const x1 = playerOf(a, "fireboy")?.x;
    await sleep(700);
    expect(timerOf(a)).toBe(t1); // 冻结：时钟停摆
    expect(playerOf(a, "fireboy")?.x).toBe(x1); // 冻结：物理停摆

    a.send("resume", {});
    await waitFor("双端收到 paused:false", () => seenA.at(-1)?.paused === false && seenB.at(-1)?.paused === false);
    await waitFor("恢复后 timerMs 继续前进", () => timerOf(a) > t1, 3000);
  }, 25000);

  it("started 期断线/重连：断线冻结 paused（席位保留）、窗内重连恢复 started", async () => {
    liveServers.push(await startServer());
    const { url } = liveServers[0];
    const c1 = new Client(url);
    const a = await c1.create("forest", { password: PW });
    const c2 = new Client(url);
    const b = await c2.joinById(a.roomId, { password: PW });
    await waitPhase(a, "started", READY_MS + 2500);

    const token = a.reconnectionToken;
    await a.leave(false); // 模拟断线（非主动退出）
    await waitPhase(b, "paused"); // 断线冻结等待重连
    expect(mapKeys(playersOf(b))).toEqual(["fireboy", "watergirl"]); // 等待期席位不释放
    const t1 = timerOf(b);
    await sleep(600);
    expect(timerOf(b)).toBe(t1); // 冻结：不推进

    const a2 = await c1.reconnect(token);
    await waitPhase(b, "started", 5000); // prevPhase=started 恢复
    expect(mapKeys(playersOf(a2))).toEqual(["fireboy", "watergirl"]);
    await waitFor("重连后物理恢复推进", () => timerOf(b) > t1, 3000);
  }, 30000);

  it("H-01 主动退出：余端秒回 lobby、席位立即可补位整关重开", async () => {
    liveServers.push(await startServer());
    const { url } = liveServers[0];
    const c1 = new Client(url);
    const a = await c1.create("forest", { password: PW });
    const c2 = new Client(url);
    const b = await c2.joinById(a.roomId, { password: PW });
    await waitPhase(a, "started", READY_MS + 2500);

    const t0 = Date.now();
    await b.leave(true); // consented 主动退出
    await waitFor("余端 A 回 lobby（不被断线窗冻结）", () => phaseOf(a) === "lobby", 1500);
    expect(Date.now() - t0).toBeLessThan(2000);
    expect(mapKeys(playersOf(a))).toEqual(["fireboy"]); // watergirl 席位已释放

    // 补位重进：startedOnce 后走整关重开（原版 retry 语义），不卡死房
    const c3 = new Client(url);
    await c3.joinById(a.roomId, { password: PW });
    await waitPhase(a, "ready", 3000);
    await waitPhase(a, "started", READY_MS + 2500);
  }, 30000);

  it("H-01 变体：暂停发起者主动退出 → 解除广播 paused:false + 余端回 lobby", async () => {
    liveServers.push(await startServer());
    const { url } = liveServers[0];
    const { a, b } = await joinStarted(url);
    const seenB = collect(b, "pause-changed");
    a.send("pause", {});
    await waitFor("B 收到 paused:true", () => seenB.at(-1)?.paused === true);

    await a.leave(true); // 暂停中主动退出
    await waitFor("余端 B 收到解除广播 paused:false", () => seenB.at(-1)?.paused === false, 2000);
    await waitFor("余端 B 回 lobby", () => phaseOf(b) === "lobby", 2000);
  }, 25000);

  it("H-02 ready 期断线：不缺人开钟（守卫拦旧钟），窗内重连重排 ready→started", async () => {
    liveServers.push(await startServer());
    const { url } = liveServers[0];
    const c1 = new Client(url);
    const a = await c1.create("forest", { password: PW });
    const c2 = new Client(url);
    const b = await c2.joinById(a.roomId, { password: PW });
    await waitPhase(a, "ready"); // ready 2s 窗口内断线

    await a.leave(false);
    await waitPhase(b, "paused");
    // 旧 ready 钟到点（断线后 ~1.9s，仍在 4s 重连窗内）：无守卫会在此缺人开钟——H-02 根因
    await sleep(READY_MS + 600);
    expect(phaseOf(b)).toBe("paused"); // 不得 started

    const a2 = await c1.reconnect(a.reconnectionToken);
    await waitPhase(a2, "ready", 3000); // prevPhase=ready → 重排 beginReady
    await waitPhase(a2, "started", READY_MS + 2500); // 双人到齐才开钟
    expect(mapKeys(playersOf(a2))).toEqual(["fireboy", "watergirl"]);
  }, 30000);

  it("H-02 超时：ready 期断线不重连 → 超时释放席位回 lobby（L-01 同路径）", async () => {
    liveServers.push(await startServer());
    const { url } = liveServers[0];
    const { a, b } = await joinPair(url);
    await waitPhase(a, "ready");

    await a.leave(false);
    await waitPhase(b, "paused");
    await waitFor("超时后回 lobby", () => phaseOf(b) === "lobby", RECONNECT_MS + 2500);
    expect(mapKeys(playersOf(b))).toEqual(["watergirl"]);
  }, 30000);

  it("M-01 超时清暂停：超时释放席位解除玩家暂停并广播 paused:false；resume 幂等回声", async () => {
    liveServers.push(await startServer());
    const { url } = liveServers[0];
    const { a, b } = await joinStarted(url);
    const seenB = collect(b, "pause-changed");
    a.send("pause", {});
    await waitFor("B 收到 paused:true", () => seenB.at(-1)?.paused === true);

    await a.leave(false); // 暂停者断线，等 2s 超时
    await waitFor("超时后余端回 lobby", () => phaseOf(b) === "lobby", RECONNECT_MS + 2500);
    expect(seenB.at(-1)?.paused).toBe(false); // releaseSeat 必须广播解除（M-01 超时半）
    expect(mapKeys(playersOf(b))).toEqual(["watergirl"]);

    // M-01 回声半：余端陈旧面板点「继续」只发 resume，无论是否暂停都回 paused:false
    const n = seenB.length;
    b.send("resume", {});
    await waitFor("resume 收到幂等回声", () => seenB.length > n, 2000);
    expect(seenB.at(-1)?.paused).toBe(false);
  }, 30000);

  it("M-06 暂停菜单再试一次：started+userPaused 下 restart 受理——解除广播 + 整关重开 + 时钟重置", async () => {
    liveServers.push(await startServer());
    const { url } = liveServers[0];
    const { a, b } = await joinStarted(url);
    const seenB = collect(b, "pause-changed");

    await waitFor("开局跑一段（timerMs>600）", () => timerOf(a) > 600, 3000);
    a.send("pause", {});
    await waitFor("B 收到 paused:true", () => seenB.at(-1)?.paused === true);

    a.send("restart"); // 暂停菜单「再试一次」（won/gameover 守卫之外的新分支）
    await waitFor("双端收到解除广播 paused:false", () => seenB.at(-1)?.paused === false, 2000);
    await waitPhase(a, "ready", 2000); // 整关重开
    await waitPhase(a, "started", READY_MS + 2500);
    expect(timerOf(a)).toBeLessThan(800); // 时钟已重置（原 1483→1500 续走的缺陷不再现）
  }, 30000);

  it("L-01 断线超时后不补建幽灵角色：state.players 仅存余端", async () => {
    liveServers.push(await startServer());
    const { url } = liveServers[0];
    const { a, b } = await joinStarted(url);
    expect(mapKeys(playersOf(b))).toEqual(["fireboy", "watergirl"]);

    await a.leave(false); // fireboy 断线等超时
    await waitFor("超时释放席位回 lobby", () => phaseOf(b) === "lobby", RECONNECT_MS + 2500);
    // 幽灵角色（syncState 按 World 快照补建）不得再现
    expect(mapKeys(playersOf(b))).toEqual(["watergirl"]);
  }, 30000);

  it("win/finish 语义：真实 win 事件 → 广播 finish 全字段 + phase=won 静置（无自动重开）", async () => {
    liveServers.push(await startServer({ FW_DEBUG_AUTO_WIN: "1" }));
    const { url } = liveServers[0];
    const { a, b } = await joinStarted(url);
    const finA = collect(a, "finish");
    const finB = collect(b, "finish");

    await waitPhase(a, "won", 12000); // AUTO_WIN：onCreate+5s 注入
    await waitFor("双端各收 finish", () => finA.length >= 1 && finB.length >= 1, 2000);
    expect(finA).toHaveLength(1); // 只广播一次
    for (const f of [...finA, ...finB]) {
      expect(f).toMatchObject({ fbDiamonds: 3, wgDiamonds: 4, silver: 0 });
      expect(typeof f.timeMs).toBe("number");
      expect(f.timeMs).toBeGreaterThan(0);
    }
    await sleep(500);
    expect(phaseOf(a)).toBe("won"); // 静置等 Retry，不自动重开
  }, 30000);

  it("L-02 won 相位断线重连：finish 补发 + 相位恢复 won（先补发后恢复，防 0 秒最佳）", async () => {
    liveServers.push(await startServer({ FW_DEBUG_AUTO_WIN: "1" }));
    const { url } = liveServers[0];
    const c1 = new Client(url);
    const a = await c1.create("forest", { password: PW });
    const c2 = new Client(url);
    const b = await c2.joinById(a.roomId, { password: PW });
    await waitPhase(a, "started", READY_MS + 2500);
    await waitPhase(a, "won", 12000);

    const token = a.reconnectionToken;
    await a.leave(false);
    await waitPhase(b, "paused");

    const a2 = await c1.reconnect(token);
    const finA2 = collect(a2, "finish");
    await waitFor("重连端收到补发 finish", () => finA2.length >= 1, 3000);
    expect(finA2[0]).toMatchObject({ fbDiamonds: 3, wgDiamonds: 4, silver: 0 });
    await waitPhase(a2, "won", 2000); // 120ms 后恢复相位（finish 先于相位就位）
    expect(phaseOf(b)).toBe("won");
  }, 40000);

  it("B-01 时基恢复（最小版）：暂停 3s 后按住右 1.2s 角色移动 >30px（修复前 0px 永冻）", async () => {
    liveServers.push(await startServer());
    const { url } = liveServers[0];
    const { a } = await joinStarted(url);
    const seenA = collect(a, "pause-changed");

    a.send("pause", {});
    await waitFor("paused:true", () => seenA.at(-1)?.paused === true);
    await sleep(3000); // 冻结 3s

    a.send("resume", {});
    a.send("input", { right: true }); // 恢复后按住右（全量快照语义，单发持续生效）
    await sleep(1200);
    const x = playerOf(a, "fireboy")?.x;
    expect(x).toBeGreaterThan(30); // 修复前 0.0px（队列死锁），修复后 ≈255px，判据 >30
  }, 40000);

  it("入场守卫：密码错误 4403 拒绝；满员后第三人加入被拒", async () => {
    liveServers.push(await startServer());
    const { url } = liveServers[0];
    const c1 = new Client(url);
    const a = await c1.create("forest", { password: PW });

    const c0 = new Client(url);
    await expect(c0.joinById(a.roomId, { password: "wrong-pass" })).rejects.toThrow(/密码|4403/);

    const c2 = new Client(url);
    await c2.joinById(a.roomId, { password: PW });
    const c3 = new Client(url);
    await expect(c3.joinById(a.roomId, { password: PW })).rejects.toThrow(); // maxClients=2 满员
  }, 20000);
});

afterAll(() => {
  // 还原 vi.hoisted 注入的 FW_*：threads 池复用 worker 线程，process.env 跨文件
  // 存续，不还原会污染后续测试文件的 ForestRoom 模块读取（#39 实测项）。
  for (const k of ["FW_RECONNECT_SECONDS", "FW_WIND_PHASE", "FW_DEBUG_AUTO_WIN"]) delete process.env[k];
});
