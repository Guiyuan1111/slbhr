/**
 * 房间级异常隔离（#45）：此前 ForestRoom 未定义 onUncaughtException，tick/onMessage
 * 的未捕获异常走 Colyseus 全局 uncaughtException → 优雅停机——一个坏房间拖垮全服。
 * 修复后在 onCreate 注册房间级 handler（日志 + disconnect），本测试以最小房间复刻
 * 同款 handler，断言：onMessage 抛异常后房间被弃置，但服务器进程仍可正常建房。
 */
import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, describe, expect, it, vi } from "vitest";
import { Client } from "colyseus.js";

vi.hoisted(() => {
  process.env.FW_WIND_PHASE = "0";
});

import { Room, Server, WebSocketTransport } from "../colyseus.cjs.js";

let server: http.Server | undefined;
let gameServer: InstanceType<typeof Server> | undefined;
let disposed = false;

afterAll(async () => {
  if (gameServer) await gameServer.gracefullyShutdown(false);
  if (server) await new Promise<void>((r) => server!.close(() => r()));
});

class BoomRoom extends Room {
  onCreate() {
    // 与 ForestRoom.onCreate 的 #45 handler 同款
    this.onUncaughtException = (error, methodName) => {
      console.error(`[fw] 房间 ${this.roomId} 未捕获异常 @${String(methodName)}:`, error);
      this.disconnect().catch(() => { /* 已 dispose */ });
    };
    this.onMessage("boom", () => {
      throw new Error("boom-intentional");
    });
  }

  onDispose(): void {
    disposed = true;
  }
}

class QuietRoom extends Room {
  onCreate() {}
}

describe("onUncaughtException 房间级隔离（#45）", () => {
  it("onMessage 抛异常只弃本房间，服务器仍可继续建房", { timeout: 20_000 }, async () => {
    server = http.createServer();
    gameServer = new Server({ transport: new WebSocketTransport({ server }) });
    gameServer.define("boom", BoomRoom);
    gameServer.define("quiet", QuietRoom);
    await new Promise<void>((r) => server!.listen(0, "127.0.0.1", r));
    const port = (server.address() as AddressInfo).port;

    const client = new Client(`ws://127.0.0.1:${port}`);
    const room = await client.create("boom");
    room.send("boom");
    await new Promise((r) => setTimeout(r, 800));
    expect(disposed).toBe(true);

    // 服务器未垮：同进程还能正常建新房并收到回执
    const fresh = await client.create("quiet");
    expect(fresh.roomId).toBeTruthy();
    await fresh.leave();
  });
});
