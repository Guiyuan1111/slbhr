/**
 * 网络层：封装 Colyseus 客户端。
 *
 * - 开发模式直连 2567 端口（Vite 代理只负责静态资源）
 * - 生产模式同源（http→ws、https→wss，隧道场景天然成立）
 * - 断线时尝试 room.reconnect() 自动重连（配合服务端 allowReconnection）
 *
 * 0.3.0 消息面（与 server ForestRoom 对齐）：
 * - 私发 "role"；广播 "death" {role} / "finish" {fbDiamonds,wgDiamonds,silver,timeMs} /
 *   "sfx" {kind,...}（lever|pusher 机关音、diamond|door 备用）；
 * - phase 词汇 lobby|ready|started|paused|won|gameover，经 onStateChange 差分出 onPhase。
 */
import { Client, type Room } from "colyseus.js";
import type { InputState, Role } from "@fw/shared";
import type { InputMessage } from "./input";

export interface JoinParams {
  mode: "create" | "join";
  /** 加入模式必填：房间码 */
  code?: string;
  password: string;
  /** 仅 create 生效；join 以房间 state.levelId 为准（服务端 join 不读它，传了无害） */
  levelId: string;
}

/** finish 消息载荷（原版 gameFinish 结算数据：普通钻按角色分计、银钻合计、正计时） */
export interface FinishData {
  fbDiamonds: number;
  wgDiamonds: number;
  silver: number;
  timeMs: number;
}

/** sfx 消息载荷：kind=lever|pusher（机关翻转）、diamond|door（客户端本地差分已覆盖，忽略） */
export interface SfxMessage {
  kind: string;
  group?: number;
  state?: number;
  role?: Role;
}

export interface NetCallbacks {
  onRole: (role: Role) => void;
  onDeath: (p: { role: Role }) => void;
  onFinish?: (p: FinishData) => void;
  onSfx?: (p: SfxMessage) => void;
  /** phase 迁移（onStateChange 差分，带前值） */
  onPhase?: (phase: string, prev: string) => void;
  /** 连接断开（已自动尝试重连）；参数=是否重连成功 */
  onDisconnect: (recovered: boolean) => void;
}

export class Net {
  room!: Room<any>;
  /** 自己扮演的角色（服务端 onJoin 私发 "role" 消息） */
  myRole: Role | null = null;
  /** 最近一次 finish 消息（通关结算板数据；场景晚于消息启动时也能取到） */
  lastFinish: FinishData | null = null;
  /** sfx 消息队列（场景每帧取空；sfx 有可感知延迟但 ≤1 帧，可接受） */
  sfxQueue: SfxMessage[] = [];
  private client!: Client;

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
    net.room =
      p.mode === "create"
        ? await client.create("forest", { levelId: p.levelId, password: p.password })
        : await client.joinById(p.code!.trim(), { levelId: p.levelId, password: p.password });

    net.room.onMessage("role", (role: Role) => {
      net.myRole = role;
      cb.onRole(role);
    });
    net.room.onMessage("death", (payload: { role: Role }) => cb.onDeath(payload));
    net.room.onMessage("finish", (payload: FinishData) => {
      net.lastFinish = payload;
      cb.onFinish?.(payload);
    });
    net.room.onMessage("sfx", (payload: SfxMessage) => {
      net.sfxQueue.push(payload);
      cb.onSfx?.(payload);
    });
    // levelError 为保留通道：当前 create 校验走 MatchMakeError；先注册接入
    net.room.onMessage("levelError", (payload: { message?: string }) => {
      console.warn("[fw] levelError:", payload?.message);
    });

    // phase 迁移差分（比轮询及时，且带前值）
    let prevPhase = "";
    net.room.onStateChange((state) => {
      const phase = String(state?.phase ?? "");
      if (phase && phase !== prevPhase) {
        const prev = prevPhase;
        prevPhase = phase;
        cb.onPhase?.(phase, prev);
      }
    });

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

  /**
   * 等待房间 state 首次同步出 levelId（加入方依赖它拿房间真实关卡）。
   * 超时返回 ""（调用方回退 URL 参数/默认关）。
   */
  async waitForLevelId(timeoutMs = 3000): Promise<string> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const id = String(this.room.state?.levelId ?? "");
      if (id) return id;
      await new Promise((r) => setTimeout(r, 50));
    }
    return "";
  }

  sendInput(input: InputMessage | InputState): void {
    this.room.send("input", input);
  }

  restart(): void {
    this.room.send("restart", {});
  }

  leave(): void {
    this.room.leave(true);
  }
}
