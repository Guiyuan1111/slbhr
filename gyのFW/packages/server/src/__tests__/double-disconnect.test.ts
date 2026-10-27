/**
 * won 相位双端同时断线回归（#43，#13 L-02 的双端残量）：
 * - 旧实现 per-client prevPhase：先断线者置 paused，后断线者捕获的 prevPhase 已被污染；
 *   先重连端的补发条件（prevPhase==="won"）失配 → 一端 lastFinish=null → 客户端 0 兜底
 *   写 0 秒最佳（openEndMenu `?? 0`，本地存档不可逆污染）
 * - 新实现：补发只看房间级 lastFinish（restart/换关即清），双端各自补发一次（幂等）；
 *   相位恢复由「补发时仍处 paused」的一路执行，来源相位记房间级 pausedFrom
 *
 * 方法与 forest-room.integration.test.ts 同构：真实 Colyseus Server + colyseus.js，
 * FW_DEBUG_AUTO_WIN=1 注入真实 win 事件。
 */
import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Client, type Room as ClientRoom } from "colyseus.js";

vi.hoisted(() => {
  process.env.FW_RECONNECT_SECONDS = "4";
  process.env.FW_WIND_PHASE = "0";
  // 本文件全部用例走 win 流：AUTO_WIN（started 后 5s 注入真实 win 事件，onCreate 读取）
  process.env.FW_DEBUG_AUTO_WIN = "1";
});

import { Server, WebSocketTransport } from "../colyseus.cjs.js";
import { ForestRoom } from "../rooms/ForestRoom.js";

const PW = "double-dc-4843";
const READY_MS = 2000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface Srv {
  url: string;
  shutdown: () => Promise<void>;
}

const liveServers: Srv[] = [];
afterEach(async () => {
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
    if (Date.now() - t0 > timeoutMs) throw new Error(`等待超时: ${desc}`);
    await sleep(25);
  }
}

const phaseOf = (room: ClientRoom<any>) => String((room.state as any).phase);
async function waitPhase(room: ClientRoom<any>, phase: string, timeoutMs = 10000): Promise<void> {
  await waitFor(`phase=${phase}`, () => phaseOf(room) === phase, timeoutMs);
}

function collect(room: ClientRoom<any>, type: string): any[] {
  const arr: any[] = [];
  room.onMessage(type, (m) => arr.push(m));
  return arr;
}

describe("won 相位双端同时断线（#43）", () => {
  it("双断线后两端各自重连：都收到 finish 补发且相位恢复 won", { timeout: 40000 }, async () => {
    const srv = await startServer();
    const c1 = new Client(srv.url);
    const a = await c1.create("forest", { password: PW });
    const c2 = new Client(srv.url);
    const b = await c2.joinById(a.roomId, { password: PW });
    await waitPhase(a, "started", READY_MS + 2500);
    await waitPhase(a, "won", 12000); // AUTO_WIN：started 后 5s 注入真实 win

    const tokA = a.reconnectionToken;
    const tokB = b.reconnectionToken;
    // 双端「同时」断线：先执行者置 paused，后执行者 prevPhase 被污染（旧实现根因）
    await Promise.all([a.leave(false), b.leave(false)]);
    await sleep(150); // 两路 onLeave 落定

    const a2 = await c1.reconnect(tokA);
    const b2 = await c2.reconnect(tokB);
    const finA = collect(a2, "finish");
    const finB = collect(b2, "finish");

    await waitFor("A 收到补发 finish", () => finA.length >= 1, 3000);
    await waitFor("B 收到补发 finish", () => finB.length >= 1, 3000);
    expect(finA[0]).toMatchObject({ fbDiamonds: 3, wgDiamonds: 4, silver: 0 });
    await waitPhase(a2, "won", 3000);
    await waitPhase(b2, "won", 3000);
  }, 45000);

  it("单端断线重连行为不回归：finish 补发 + 相位恢复（#13 原用例语义）", { timeout: 40000 }, async () => {
    const srv = await startServer();
    const c1 = new Client(srv.url);
    const a = await c1.create("forest", { password: PW });
    const c2 = new Client(srv.url);
    const b = await c2.joinById(a.roomId, { password: PW });
    await waitPhase(a, "started", READY_MS + 2500);
    await waitPhase(a, "won", 12000);

    const tok = a.reconnectionToken;
    await a.leave(false);
    await waitPhase(b, "paused");

    const a2 = await c1.reconnect(tok);
    const finA = collect(a2, "finish");
    await waitFor("重连端收到补发 finish", () => finA.length >= 1, 3000);
    await waitPhase(a2, "won", 3000);
    expect(phaseOf(b)).toBe("won");
  }, 45000);
});
