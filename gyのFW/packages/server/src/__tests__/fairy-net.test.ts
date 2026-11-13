/**
 * F 部仙女服务端状态同步与拖拽输入（fw-net 槽，net 契约集成测试）。
 *
 * 覆盖契约（与 fw-fairy-view 并行约定，勿单方更改）：
 *   state.fairies: ArraySchema<FairyState{id,x,y,group,locked}>（x,y=px，BodyState 口径）
 *   state.fairyCups: ArraySchema<FairyCupState{id,state}>
 *   消息 "fairydrag" {id, x, y}（px；x=null 松手）→ px2m → setDrag；找不到 id 忽略；
 *   任何客户端可拖任何仙女；playing（房间层 started）相位才受理。
 *
 * 方法：进程内真实 Colyseus Server + colyseus.js 客户端（同 forest-room.integration
 * 先例），断言读权威 state，不 mock 房间内部。杯口坐标用同关卡数据在测试进程内
 * 构建参考 World 取内核 cup.center 换算 px——不硬编码坐标（换关/改图不碎），同时
 * 端到端锚定 ForestRoom 本地 px2m（=−px/32）与内核 m2px 的往返一致性：系数错了
 * 仙女就落不进杯，state.fairyCups[].state 永不点亮。
 *
 * 真数据：fairies_000（data/tutorials/levels）——仙女组色 [4,0,5]、杯组 [5,3,1,41]
 * （内核 kernel-fairy.test.ts 同源探针：group4 拖入 group41 杯 ~56 帧点亮）。
 */
import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { Client, type Room as ClientRoom } from "colyseus.js";

vi.hoisted(() => {
  process.env.FW_WIND_PHASE = "0"; // 风力固定相位（e2e/门禁同口径）
});

import { Server, WebSocketTransport } from "../colyseus.cjs.js";
import { ForestRoom } from "../rooms/ForestRoom.js";
import { loadLevel } from "../levels.js";
import { World, m2px } from "@fw/shared/kernel";

const PW = "fairy-net-7f42";
const READY_MS = 2000;
const LEVEL = "fairies_000";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface Srv {
  url: string;
  shutdown: () => Promise<void>;
}

const liveServers: Srv[] = [];
afterEach(async () => {
  while (liveServers.length) await liveServers.pop()!.shutdown();
});

async function startServer(extraEnv: Record<string, string> = {}): Promise<Srv> {
  const saved = Object.entries(extraEnv).map(([k]) => [k, process.env[k]] as const);
  for (const [k, v] of Object.entries(extraEnv)) process.env[k] = v;
  const httpServer = http.createServer();
  // 注记（#39）：每个 new Server 进程级泄 4 监听器，MaxListenersExceededWarning 是噪声非缺陷
  const gameServer = new Server({ transport: new WebSocketTransport({ server: httpServer }) });
  gameServer.define("forest", ForestRoom);
  await gameServer.listen(0, "127.0.0.1");
  const port = (httpServer.address() as AddressInfo).port;
  const srv: Srv = {
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
  liveServers.push(srv);
  return srv;
}

/** 轮询等待：权威 state 经 patch 异步到达 */
async function waitFor(desc: string, fn: () => boolean, timeoutMs = 8000): Promise<void> {
  const t0 = Date.now();
  while (!fn()) {
    if (Date.now() - t0 > timeoutMs) throw new Error(`等待超时: ${desc}（已等 ${Date.now() - t0}ms）`);
    await sleep(25);
  }
}

const phaseOf = (room: ClientRoom<any>) => String((room.state as any).phase);
async function waitPhase(room: ClientRoom<any>, phase: string, timeoutMs = 10000): Promise<void> {
  await waitFor(`phase=${phase}`, () => phaseOf(room) === phase, timeoutMs);
}

/** 客户端解码 ArraySchema → 实体数组（Schema 3.x 带 Symbol.iterator，spawn 实测） */
function arrOf(v: any): any[] {
  return [...(v ?? [])];
}
const fairiesOf = (room: ClientRoom<any>) => arrOf((room.state as any).fairies);
const cupsOf = (room: ClientRoom<any>) => arrOf((room.state as any).fairyCups);

/** 双人入场 fairies_000 并等到 started */
async function joinStarted(url: string) {
  const c1 = new Client(url);
  const a = await c1.create("forest", { password: PW, levelId: LEVEL });
  const c2 = new Client(url);
  const b = await c2.joinById(a.roomId, { password: PW });
  await waitPhase(a, "ready");
  await waitPhase(a, "started", READY_MS + 2500);
  return { a, b };
}

/**
 * 参考世界（同关卡数据独立构建，房间 World 不可从客户端触达）：
 * 返回 group4 仙女 id、group41 杯的数组序与杯口 px 坐标。
 */
function referenceTargets(): { fairyId: string; cupIdx: number; cupX: number; cupY: number } {
  const w = new World(loadLevel(LEVEL).level);
  const fyIdx = w.fairies.findIndex((f) => f.group === 4);
  const cupIdx = w.fairyCups.findIndex((c) => c.group === 41);
  expect(fyIdx).toBeGreaterThanOrEqual(0);
  expect(cupIdx).toBeGreaterThanOrEqual(0);
  const center = w.fairyCups[cupIdx].center;
  return { fairyId: `fy${fyIdx}`, cupIdx, cupX: m2px(center.x), cupY: m2px(center.y) };
}

describe("F 部仙女 net 同步（fw-net 契约，fairies_000 真数据）", () => {
  it("建房初始化：state.fairies 长度 3 组色 4/0/5（id=fy{n}）+ fairyCups 长度 4 全 0", async () => {
    const srv = await startServer();
    const c1 = new Client(srv.url);
    const a = await c1.create("forest", { password: PW, levelId: LEVEL });
    await waitFor("fairies 数组到达", () => fairiesOf(a).length === 3);
    await waitFor("fairyCups 数组到达", () => cupsOf(a).length === 4);

    const fairies = fairiesOf(a);
    expect(fairies.map((f) => f.group)).toEqual([4, 0, 5]); // 内核数组序（=level2 解析序）
    expect(fairies.map((f) => f.id)).toEqual(["fy0", "fy1", "fy2"]);
    for (const f of fairies) {
      expect(Number.isFinite(f.x)).toBe(true);
      expect(Number.isFinite(f.y)).toBe(true);
      expect(typeof f.locked).toBe("boolean");
    }
    const cups = cupsOf(a);
    expect(cups.map((c) => c.id)).toEqual(["fc0", "fc1", "fc2", "fc3"]);
    expect(cups.every((c) => c.state === 0)).toBe(true);
  }, 20000);

  it("fairydrag 拖 group4 仙女入 group41 杯：若干帧后 state.fairyCups 该杯 state=1，余杯不受影响", async () => {
    const srv = await startServer();
    const { a, b } = await joinStarted(srv.url);
    const { fairyId, cupIdx, cupX, cupY } = referenceTargets();

    // 模拟客户端拖拽：100ms 节流连发（目标点在两条消息间由内核 dragTarget 持有，
    // 探针实测单条即够——连发只吸收丢包/乱序），等待权威 state 点亮该杯
    const sendDrag = (who: ClientRoom<any>) => who.send("fairydrag", { id: fairyId, x: cupX, y: cupY });
    sendDrag(a);
    const spam = setInterval(() => sendDrag(b), 100); // b 端拖 a 看到的仙女：任何客户端可拖任何仙女
    try {
      await waitFor("group41 杯点亮", () => cupsOf(a)[cupIdx]?.state === 1, 12000);
    } finally {
      clearInterval(spam);
    }
    expect(cupsOf(a)[cupIdx].state).toBe(1);
    // 其余杯（5/3/1）不得被带亮
    expect(cupsOf(a).filter((_, i) => i !== cupIdx).every((c) => c.state === 0)).toBe(true);
    // 仙女本体已被吸到杯口附近（杯口 sensor r=1.3m + 仙女 r=0.3m = 51.2px 感应带内）
    const fy = fairiesOf(a)[Number(fairyId.slice(2))];
    expect(Math.hypot(fy.x - cupX, fy.y - cupY)).toBeLessThan(60);
  }, 30000);

  it("松手与垃圾载荷不炸：x=null 松手后房间照常步进；未知 id/坏载荷被忽略", async () => {
    const srv = await startServer();
    const { a, b } = await joinStarted(srv.url);
    const { fairyId, cupIdx, cupX, cupY } = referenceTargets();

    a.send("fairydrag", { id: fairyId, x: cupX, y: cupY });
    await waitFor("拖拽生效（杯点亮）", () => cupsOf(a)[cupIdx]?.state === 1, 12000);

    // 松手（契约：x=null 松手；杯内仙女被 externalTarget 吸附保持，杯不熄）
    a.send("fairydrag", { id: fairyId, x: null, y: null });
    // 垃圾载荷：未知 id / 非法 id / NaN / 缺字段——一律忽略不抛
    a.send("fairydrag", { id: "fy99", x: 1, y: 1 });
    a.send("fairydrag", { id: "garbage", x: 1, y: 1 });
    a.send("fairydrag", { id: fairyId, x: "px", y: null });
    a.send("fairydrag", { id: fairyId });
    a.send("fairydrag", null);

    // 房间存活且物理继续步进（松手/垃圾不触发 onUncaughtException → disconnect）
    await sleep(700);
    expect(phaseOf(a)).toBe("started");
    const t1 = (a.state as any).timerMs;
    await waitFor("松手后物理继续推进", () => (a.state as any).timerMs > t1, 3000);
    expect(phaseOf(b)).toBe("started");
    expect(cupsOf(b)[cupIdx].state).toBe(1); // 杯仍点亮（松手不出杯）
  }, 40000);

  it("相位门禁：lobby 期 fairydrag 不受理不炸；开局后同房拖拽照常生效", async () => {
    const srv = await startServer();
    const c1 = new Client(srv.url);
    const a = await c1.create("forest", { password: PW, levelId: LEVEL });
    const { fairyId, cupIdx, cupX, cupY } = referenceTargets();

    await waitFor("fairies 初始化", () => fairiesOf(a).length === 3);
    expect(phaseOf(a)).toBe("lobby"); // 单人在场，未开钟
    a.send("fairydrag", { id: fairyId, x: cupX, y: cupY }); // lobby 期被拒：仅不得崩
    await sleep(300);
    expect(phaseOf(a)).toBe("lobby");

    // 双人到齐开钟后，同一房间的拖拽受理
    const c2 = new Client(srv.url);
    const b = await c2.joinById(a.roomId, { password: PW });
    await waitPhase(a, "started", READY_MS + 2500);
    a.send("fairydrag", { id: fairyId, x: cupX, y: cupY });
    await waitFor("started 后拖拽生效", () => cupsOf(a)[cupIdx]?.state === 1, 12000);
    expect(phaseOf(b)).toBe("started");
  }, 40000);

  it("advance 换关数组重建：fairy 关 won 后 advance 到无仙女的 forest_01，fairies/fairyCups 清空不残留", async () => {
    const srv = await startServer({ FW_DEBUG_AUTO_WIN: "1" }); // started+5s 注入真实 win（既有加速器惯例）
    const { a } = await joinStarted(srv.url);
    await waitPhase(a, "won", 12000);
    await waitFor("won 前仙女在册", () => fairiesOf(a).length === 3);

    a.send("advance", { levelId: "forest_01" });
    await waitPhase(a, "ready", 3000);
    await waitFor("换关后 fairies 重建为空数组", () => fairiesOf(a).length === 0 && cupsOf(a).length === 0);
    expect(phaseOf(a)).toBe("ready");
    // 房间存活：新关正常开跑（重建路径未破坏 tick/相位机）
    await waitPhase(a, "started", READY_MS + 2500);
  }, 40000);
});

afterAll(() => {
  // 还原 vi.hoisted 注入的 FW_*：threads 池复用 worker 线程，process.env 跨文件存续
  //（#39 实测项，同 forest-room.integration 惯例）。
  delete process.env.FW_WIND_PHASE;
});
