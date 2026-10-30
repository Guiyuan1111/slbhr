/**
 * D/E 部传送门状态下发 + F 部 revive 消息面（portal 渲染批，2026-10-31 逻辑验证轮）。
 *
 * 覆盖契约：
 *   state.portals: ArraySchema<PortalState{id,state}>（id=pt{数组序}，state 0/1=关/开门；
 *     体静态几何不下发，客户端自 level.portals 取）——数组长度与初始态 = 参考 World
 *     （同关数据独立构建，不硬编码关卡数）。
 *   state.revived: boolean（R2 复活门禁镜像，初始 false）。
 *   消息 "revive"：仅 gameover 相位受理；started 相位发送被忽略（不炸、相位不变）。
 *
 * 真数据：crystal_04（D 部，含 initialState:1 开门对）、ecrystal_ez-1（E 部 crystal 子庙）。
 */
import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { Client, type Room as ClientRoom } from "colyseus.js";

vi.hoisted(() => {
  process.env.FW_WIND_PHASE = "0";
});

import { Server, WebSocketTransport } from "../colyseus.cjs.js";
import { ForestRoom } from "../rooms/ForestRoom.js";
import { loadLevel } from "../levels.js";
import { World } from "@fw/shared/kernel";

const PW = "portal-net-9e13";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface Srv {
  url: string;
  shutdown: () => Promise<void>;
}

const liveServers: Srv[] = [];
afterEach(async () => {
  while (liveServers.length) await liveServers.pop()!.shutdown();
});
afterAll(async () => {
  while (liveServers.length) await liveServers.pop()!.shutdown();
});

async function startServer(): Promise<Srv> {
  const httpServer = http.createServer();
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
    },
  };
  liveServers.push(srv);
  return srv;
}

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

function arrOf(v: any): any[] {
  return [...(v ?? [])];
}

/** 双人入场并等到 started */
async function joinStarted(url: string, levelId: string) {
  const c1 = new Client(url);
  const a = await c1.create("forest", { password: PW, levelId });
  const c2 = new Client(url);
  const b = await c2.joinById(a.roomId, { password: PW });
  await waitPhase(a, "ready");
  await waitPhase(a, "started", 4500);
  return { a, b };
}

describe("D/E 部传送门状态下发 + revive 消息面（真房集成）", () => {
  it("crystal_04：state.portals 长度/初始态 = 参考 World（含 initialState 开门对），id=pt{n}", async () => {
    const ref = new World(loadLevel("crystal_04").level);
    const refStates = ref.portals.map((p) => p.state);

    const srv = await startServer();
    const c1 = new Client(srv.url);
    const a = await c1.create("forest", { password: PW, levelId: "crystal_04" });
    await waitFor("portals 数组到达", () => arrOf((a.state as any).portals).length === ref.portals.length);

    const portals = arrOf((a.state as any).portals);
    expect(portals.map((p) => p.id)).toEqual(ref.portals.map((_, i) => `pt${i}`));
    expect(portals.map((p) => p.state)).toEqual(refStates);
    expect((a.state as any).revived).toBe(false);
    // D 槽实证：crystal_04 id66 关有 initialState:1 开门对——开门态必须真实出现在快照
    expect(refStates).toContain(1);
  }, 20000);

  it("ecrystal_ez-1（E 部 crystal 子庙）：portals 数组长度 = 参考值且全为数值态", async () => {
    const ref = new World(loadLevel("ecrystal_ez-1").level);
    expect(ref.portals.length).toBeGreaterThan(0);

    const srv = await startServer();
    const c1 = new Client(srv.url);
    const a = await c1.create("forest", { password: PW, levelId: "ecrystal_ez-1" });
    await waitFor("portals 数组到达", () => arrOf((a.state as any).portals).length === ref.portals.length);
    const portals = arrOf((a.state as any).portals);
    expect(portals.every((p) => p.state === 0 || p.state === 1)).toBe(true);
  }, 20000);

  it("revive 消息：started 相位发送被忽略（相位不变、revived 仍 false、连接存活）", async () => {
    const srv = await startServer();
    const { a } = await joinStarted(srv.url, "fairies-01");
    a.send("revive", {});
    await sleep(300);
    expect(phaseOf(a)).toBe("started");
    expect((a.state as any).revived).toBe(false);
    expect(a.connection.isOpen).toBe(true);
  }, 20000);
});
