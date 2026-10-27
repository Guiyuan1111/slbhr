/**
 * 房间密码校验回归（#28 Critical）：onJoin 必须无条件校验——joinById(roomId, true)、
 * 错误密码都不得入场；正确密码可入；断线重连不依赖旧的「true 跳过」分支。
 *
 * 方法与 forest-room.integration.test.ts 同构：进程内真实 Colyseus Server（端口 0）+
 * colyseus.js Node 客户端真实 matchmake——断言全走真实加入路径，不 mock 房间内部。
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

const PW = "audit-pw-9527";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface Srv {
  url: string;
  shutdown: () => Promise<void>;
}

async function startServer(): Promise<Srv> {
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
      await gameServer.gracefullyShutdown(false);
      httpServer.close();
    },
  };
}

let srv: Srv | undefined;
afterEach(async () => {
  await srv?.shutdown();
  srv = undefined;
});

async function createRoom(c: Client): Promise<ClientRoom> {
  return c.create("forest", { password: PW, levelId: "forest_01" });
}

describe("房间密码无条件校验（#28）", () => {
  it("joinById(roomId, true) 被 4403 拒绝（原绕过路径）", { timeout: 20_000 }, async () => {
    srv = await startServer();
    const c = new Client(srv.url);
    const created = await createRoom(c);
    await expect(c.joinById(created.roomId, true as never)).rejects.toMatchObject({ code: 4403 });
  });

  it("joinById(roomId, {password:\"wrong\"}) 被 4403 拒绝", { timeout: 20_000 }, async () => {
    srv = await startServer();
    const c = new Client(srv.url);
    const created = await createRoom(c);
    await expect(c.joinById(created.roomId, { password: "wrong-pw" })).rejects.toMatchObject({ code: 4403 });
  });

  it("正确密码可正常加入", { timeout: 20_000 }, async () => {
    srv = await startServer();
    const c = new Client(srv.url);
    const created = await createRoom(c);
    const room = await c.joinById(created.roomId, { password: PW });
    expect(room.roomId).toBe(created.roomId);
    await room.leave();
  });

  it("断线重连不依赖 onJoin 跳过分支：reconnectionToken 可恢复座位", { timeout: 25_000 }, async () => {
    srv = await startServer();
    const c = new Client(srv.url);
    // create 的返回即创建者的活连接（已占 1 座）——勿再对同客户端 joinById，会占满
    // maxClients=2 致房间锁定，对端无法入场。
    const room = await createRoom(c);
    // 对端以正确密码按 ID 入场（最后一人离开房间即销毁，无从重连）
    const c2 = new Client(srv.url);
    const peer = await c2.joinById(room.roomId, { password: PW });
    const token = room.reconnectionToken;
    // 模拟断线（非主动退出，consented=false）：onLeave 走 allowReconnection 预留座位——
    // 恢复路径不经过 onJoin（若经过，会被密码校验 4403 拒绝）；与 integration 套件同机制。
    // 必须等对端看到 paused（服务端已处理断线、重连座位就绪）再重连，否则竞态 invalid token。
    await room.leave(false);
    const t0 = Date.now();
    while ((peer.state as { phase?: string }).phase !== "paused") {
      if (Date.now() - t0 > 5000) throw new Error("等待 phase=paused 超时");
      await sleep(50);
    }
    const resumed = await c.reconnect(token);
    expect(resumed.roomId).toBe(room.roomId);
    await resumed.leave();
    await peer.leave();
  });
});

afterAll(() => {
  // 还原 vi.hoisted 注入的 FW_*：threads 池复用 worker 线程，process.env 跨文件
  // 存续，不还原会污染后续测试文件的 ForestRoom 模块读取（#39 实测项）。
  for (const k of ["FW_RECONNECT_SECONDS", "FW_WIND_PHASE", "FW_DEBUG_AUTO_WIN"]) delete process.env[k];
});
