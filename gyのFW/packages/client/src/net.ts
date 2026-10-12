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
 * - "pause-changed" {paused,by}（F3 翻转：任一端 P 键 → 服务端权威全场冻结，广播双端）；
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

/** pause-changed 消息载荷（F3：服务端权威玩家暂停，双端广播/重连补发） */
export interface PauseChangedMessage {
  paused: boolean;
  by: Role | null;
}

export interface NetCallbacks {
  onRole: (role: Role) => void;
  onDeath: (p: { role: Role }) => void;
  onFinish?: (p: FinishData) => void;
  onSfx?: (p: SfxMessage) => void;
  /** 玩家暂停状态翻转（服务端权威；本端发起的也会经广播回来，不本地抢先置位） */
  onPauseChanged?: (p: PauseChangedMessage) => void;
  /** phase 迁移（onStateChange 差分，带前值） */
  onPhase?: (phase: string, prev: string) => void;
  /** 关卡切换（onStateChange 差分；活房间 advance 换关回声，双端同触发） */
  onLevelId?: (levelId: string, prev: string) => void;
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
  private prevPhase = "";
  private prevLevelId = "";

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
    net.bindRoom(cb);
    return net;
  }

  /** 绑定本房间的全部消息/状态监听。重连拿到新 Room 实例后必须重绑，否则一切回调静默失效 */
  private bindRoom(cb: NetCallbacks): void {
    const room = this.room;
    room.onMessage("role", (role: Role) => {
      this.myRole = role;
      cb.onRole(role);
    });
    room.onMessage("death", (payload: { role: Role }) => cb.onDeath(payload));
    room.onMessage("finish", (payload: FinishData) => {
      this.lastFinish = payload;
      cb.onFinish?.(payload);
    });
    room.onMessage("sfx", (payload: SfxMessage) => {
      this.sfxQueue.push(payload);
      cb.onSfx?.(payload);
    });
    room.onMessage("pause-changed", (payload: PauseChangedMessage) => cb.onPauseChanged?.(payload));
    // levelError 为保留通道：当前 create 校验走 MatchMakeError；先注册接入
    room.onMessage("levelError", (payload: { message?: string }) => {
      console.warn("[fw] levelError:", payload?.message);
    });

    // phase/levelId 迁移差分（比轮询及时，且带前值；prev* 挂实例上，重连重绑后仍连续）
    room.onStateChange((state) => {
      const phase = String(state?.phase ?? "");
      if (phase && phase !== this.prevPhase) {
        const prev = this.prevPhase;
        this.prevPhase = phase;
        cb.onPhase?.(phase, prev);
      }
      const levelId = String(state?.levelId ?? "");
      if (levelId && levelId !== this.prevLevelId) {
        const prev = this.prevLevelId;
        this.prevLevelId = levelId;
        cb.onLevelId?.(levelId, prev);
      }
    });

    room.onLeave(async (code) => {
      // 1000 = 自己主动离开；否则用重连令牌自动重连（服务端冻结等待中）
      if (code === 1000) {
        cb.onDisconnect(true);
        return;
      }
      try {
        const token = (room as unknown as { reconnectionToken?: string }).reconnectionToken;
        if (token) {
          // reconnect 返回的是新 Room 实例：必须换绑 net.room 并重挂全部监听
          this.room = await this.client.reconnect(token);
          this.bindRoom(cb);
        }
        cb.onDisconnect(true);
      } catch {
        cb.onDisconnect(false);
      }
    });
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

  /** 结算「继续」：活房间内直进下一关（服务端 advance 换关，席位保留） */
  advance(levelId: string): void {
    this.room.send("advance", { levelId });
  }

  /** 请求全场暂停（P 键；服务端权威置位后经 pause-changed 广播回双端） */
  pause(): void {
    this.room.send("pause", {});
  }

  /** 请求解除暂停 */
  resume(): void {
    this.room.send("resume", {});
  }

  leave(): void {
    this.room.leave(true);
  }
}
