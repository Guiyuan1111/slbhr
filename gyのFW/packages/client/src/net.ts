/**
 * 网络层：封装 Colyseus 客户端。
 *
 * - 开发模式直连 2567 端口（Vite 代理只负责静态资源）
 * - 生产模式同源（http→ws、https→wss，隧道场景天然成立）
 * - 断线时尝试 room.reconnect() 自动重连（配合服务端 allowReconnection）
 */
import { Client, type Room } from "colyseus.js";
import type { InputState, Role } from "@fw/shared";

export interface JoinParams {
  mode: "create" | "join";
  /** 加入模式必填：房间码 */
  code?: string;
  password: string;
  levelId: string;
}

export interface NetCallbacks {
  onRole: (role: Role) => void;
  onDeath: (p: { role: Role; cause: string }) => void;
  onWin: (p: { timerMs: number }) => void;
  /** 连接断开（已自动尝试重连）；参数=是否重连成功 */
  onDisconnect: (recovered: boolean) => void;
}

export class Net {
  room!: Room<any>;
  /** 自己扮演的角色（服务端 onJoin 私发 "role" 消息） */
  myRole: Role | null = null;
  private client!: Client;
  private cb!: NetCallbacks;

  /** 服务器地址：开发直连 2567，生产同源自适应 ws/wss */
  static serverUrl(): string {
    const proto = location.protocol === "https:" ? "wss" : "ws";
    if (import.meta.env.DEV) return `${proto}://${location.hostname}:2567`;
    return `${proto}://${location.host}`;
  }

  /** 进房（创建或按房间码加入）。失败抛 MatchMakeError（message 可直接显示） */
  static async connect(p: JoinParams, cb: NetCallbacks): Promise<Net> {
    const client = new Client(Net.serverUrl());
    const net = new Net();
    net.client = client;
    net.cb = cb;
    net.room =
      p.mode === "create"
        ? await client.create("forest", { levelId: p.levelId, password: p.password })
        : await client.joinById(p.code!.trim(), { levelId: p.levelId, password: p.password });

    net.room.onMessage("role", (role: Role) => {
      net.myRole = role;
      cb.onRole(role);
    });
    net.room.onMessage("death", (payload) => cb.onDeath(payload));
    net.room.onMessage("win", (payload) => cb.onWin(payload));

    net.room.onLeave(async (code) => {
      // 1000 = 自己主动离开；否则用重连令牌自动重连（服务端冻结等待中）
      if (code === 1000) {
        cb.onDisconnect(true);
        return;
      }
      try {
        const token = (net.room as unknown as { reconnectionToken?: string }).reconnectionToken;
        if (token) await client.reconnect(token);
        cb.onDisconnect(true);
      } catch {
        cb.onDisconnect(false);
      }
    });
    return net;
  }

  sendInput(input: InputState): void {
    this.room.send("input", input);
  }

  restart(): void {
    this.room.send("restart", {});
  }

  leave(): void {
    this.room.leave(true);
  }
}
