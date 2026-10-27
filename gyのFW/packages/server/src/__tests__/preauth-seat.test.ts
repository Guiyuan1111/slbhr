/**
 * 占座先于鉴权回归（#48 High DoS）：Colyseus joinById 时序 = callOnAuth → reserveSeatFor，
 * 预约发生在 WebSocket 消费座位（onJoin）之前——密码校验若只在 onJoin，未鉴权 HTTP 即可
 * 占满 2 席置 locked（1 请求/15s 永久锁房）。
 *
 * 修复口径：静态 onAuth 前置三道门——join/joinOrCreate 关闭（官方客户端只用 create+joinById）、
 * joinById 用 matchMaker.getLocalRoomById 预约前比对密码。onCreate 另设 setSeatReservationTime(3)。
 *
 * 方法与 room-password.test.ts 同构：进程内真实 Colyseus Server（端口 0）+ colyseus.js
 * 真实 matchmake。断言「错密码被拒后合法队友仍能进」——若错密码产生了座位预约，合法加入
 * 会以 4212 room is locked 失败。
 */
import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Client } from "colyseus.js";

vi.hoisted(() => {
  process.env.FW_WIND_PHASE = "0";
});

import { Server, WebSocketTransport } from "../colyseus.cjs.js";
import { ForestRoom } from "../rooms/ForestRoom.js";

const PW = "preauth-pw-48";

interface Srv {
  url: string;
  shutdown: () => Promise<void>;
}

async function startServer(): Promise<Srv> {
  const httpServer = http.createServer();
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

describe("预约前鉴权（#48）", () => {
  it("错密码 joinById 被拒后不占座：合法队友凭正确密码仍可进（旧实现此处 4212 locked）", { timeout: 20_000 }, async () => {
    srv = await startServer();
    const owner = new Client(srv.url);
    const created = await owner.create("forest", { password: PW, levelId: "forest_01" });

    await expect(new Client(srv.url).joinById(created.roomId, { password: "wrong-pw" })).rejects.toMatchObject({ code: 4403 });

    const peer = await new Client(srv.url).joinById(created.roomId, { password: PW });
    expect(peer.roomId).toBe(created.roomId);
    await peer.leave();
  });

  it("随机匹配 join 入口已关闭（未鉴权扫射路径）", { timeout: 20_000 }, async () => {
    srv = await startServer();
    const c = new Client(srv.url);
    await expect(c.join("forest", { password: "whatever" })).rejects.toMatchObject({ code: 4404 });
  });

  it("joinOrCreate 入口已关闭", { timeout: 20_000 }, async () => {
    srv = await startServer();
    const c = new Client(srv.url);
    await expect(c.joinOrCreate("forest", { password: PW, levelId: "forest_01" })).rejects.toMatchObject({ code: 4404 });
  });

  it("无密码字段的 joinById 同样预约前被拒", { timeout: 20_000 }, async () => {
    srv = await startServer();
    const owner = new Client(srv.url);
    const created = await owner.create("forest", { password: PW, levelId: "forest_01" });
    await expect(new Client(srv.url).joinById(created.roomId, {} as never)).rejects.toMatchObject({ code: 4403 });
    const peer = await new Client(srv.url).joinById(created.roomId, { password: PW });
    expect(peer.roomId).toBe(created.roomId);
    await peer.leave();
  });

  it("create 路径不受影响：密码门槛仍在 onCreate（4-64 位）", { timeout: 20_000 }, async () => {
    srv = await startServer();
    const c = new Client(srv.url);
    await expect(c.create("forest", { password: "abc", levelId: "forest_01" })).rejects.toMatchObject({ code: 4400 });
    const ok = await c.create("forest", { password: PW, levelId: "forest_01" });
    expect(ok.roomId).toBeTruthy();
  });
});
