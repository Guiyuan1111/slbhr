/**
 * 网络层：封装 Colyseus 客户端。
 *
 * - 开发模式直连 2567 端口（Vite 代理只负责静态资源）
 * - 生产模式同源（http→ws、https→wss，隧道场景天然成立）
 * - 断线时用重连令牌自动回座（配合服务端 allowReconnection）：有限次退避重试
 *   （issue #5 H-04，原实现只试一次且令牌缺失误报恢复成功）；令牌+角色落
 *   sessionStorage，同标签页刷新后可经 Net.tryResume 尝试恢复（自用可接受）
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
  /** 连接断开（已自动尝试重连）；参数=是否重连成功（含自己主动离开 code 1000） */
  onDisconnect: (recovered: boolean) => void;
  /** 断线重连进行中（attempt 从 1 计，共 max 次）——UI 挂常驻横幅用（issue #5 H-04） */
  onReconnecting?: (attempt: number, max: number) => void;
}

/** 重连令牌+角色持久化键（sessionStorage：同标签页刷新存活，关标签即弃；issue #5 H-04） */
const RESUME_KEY = "fw-resume";

/** 主动离开的关闭码：1000=正常关闭，4000=WS_CLOSE_CONSENTED（Colyseus room.leave 的关闭码） */
export function isConsentedClose(code: number): boolean {
  return code === 1000 || code === 4000;
}

/** 断线重连退避序列（毫秒）：首试 +3 次重试，总窗 ~7s+尝试耗时（服务端席位窗默认 60s） */
const RECONNECT_DELAYS_MS = [0, 1000, 2000, 4000];
/** 单次重连尝试超时（#41-B）：半开网络下 vendor reconnect 可无限挂起，无超时则退避
 *  循环失效、onDisconnect 永不触发、玩家永久卡「正在重连」且耗尽服务端席位窗。 */
export const RECONNECT_ATTEMPT_TIMEOUT_MS = 5000;

/**
 * 单次重连尝试 + 超时护栏（#41-B，tryResume 同法收敛复用）。
 * Promise.race 超时不会取消底层 reconnect：迟到 resolve 的房间由本函数主动 leave(true)，
 * 防孤儿连接；超时向调用方抛错以进入下一次退避。
 */
export async function reconnectAttempt(
  client: Pick<Client, "reconnect">,
  token: string,
  timeoutMs = RECONNECT_ATTEMPT_TIMEOUT_MS,
): Promise<Room> {
  const attempt = client.reconnect(token);
  try {
    return await Promise.race([
      attempt,
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error("重连超时")), timeoutMs)),
    ]);
  } catch (e) {
    attempt.then((room) => room.leave(true)).catch(() => {});
    throw e;
  }
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
  /** r8 件2：waitForLevelId 等待者（onStateChange 首个 levelId 即时唤醒，替代 50ms 轮询） */
  private levelIdWaiters: Array<(id: string) => void> = [];
  /** 最近一次绑定的回调（重连重试/恢复路径复用；bindRoom 时更新） */
  private cb: NetCallbacks | null = null;
  /** 本端已主动离开（leave 置位）：onLeave 不再走重连退避 */
  private leaving = false;

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
    this.cb = cb;
    room.onMessage("role", (role: Role) => {
      this.myRole = role;
      // role 到位即补写恢复令牌快照（刷新恢复需要角色——allowReconnection 不重跑 onJoin，
      // 服务端不会重发 role，刷新后只能本地还原）
      this.saveResume();
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
    // #47-1：服务端非 started 相位每秒广播 ping（ForestRoom 心跳），无 handler 时
    // colyseus.js 每秒打一条 "not registered" warn 淹没真实错误——静默吞掉
    room.onMessage("ping", () => {});

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
        // r8 件2：首见 levelId 即时放行等待者（旧 50ms 轮询平均 +25ms、最坏 +50ms）
        if (this.levelIdWaiters.length > 0) {
          const waiters = this.levelIdWaiters;
          this.levelIdWaiters = [];
          for (const w of waiters) w(levelId);
        }
      }
    });

    room.onLeave(async (code) => {
      // 主动离开（1000 正常关闭 / 4000=WS_CLOSE_CONSENTED）不重连，也不留回座预期
      if (this.leaving || isConsentedClose(code)) {
        this.clearResume();
        cb.onDisconnect(true);
        return;
      }
      // issue #5 H-04：令牌缺失按失败处理（原实现会穿透到 onDisconnect(true) 误报恢复成功）
      const token = (room as unknown as { reconnectionToken?: string }).reconnectionToken;
      if (!token) {
        this.clearResume();
        cb.onDisconnect(false);
        return;
      }
      // 有限次退避重试（原实现只试一次，短抖动/服务重启即永久断开）
      const max = RECONNECT_DELAYS_MS.length;
      for (let attempt = 1; attempt <= max; attempt++) {
        if (this.leaving) return;
        if (RECONNECT_DELAYS_MS[attempt - 1] > 0) {
          await new Promise((r) => setTimeout(r, RECONNECT_DELAYS_MS[attempt - 1]));
          if (this.leaving) return;
        }
        cb.onReconnecting?.(attempt, max);
        try {
          // reconnect 返回的是新 Room 实例：必须换绑 net.room 并重挂全部监听。
          // #41-B：单次尝试带超时（reconnectAttempt），半开网络不再永久挂起
          const room = await reconnectAttempt(this.client, token);
          if (this.leaving) {
            // 重连期间本端已主动离开：关掉刚拿到的房间，避免留下孤儿连接
            room.leave(true);
            return;
          }
          this.room = room;
          this.bindRoom(cb);
          // 重连后服务端可能已换发令牌，立即落盘供后续刷新恢复
          this.saveResume();
          cb.onDisconnect(true);
          return;
        } catch {
          /* 服务重启/令牌失效/网络未恢复 → 退避后重试 */
        }
      }
      // 重试耗尽：令牌已无回座价值，清存储
      this.clearResume();
      cb.onDisconnect(false);
    });
  }

  // ---- 重连令牌持久化（issue #5 H-04：同标签页刷新后可尝试回座）----

  /** 清除持久化恢复令牌（#41-A：回座后半程失败时调用——连接已关，令牌不会再有效） */
  static clearSavedResume(): void {
    try {
      sessionStorage.removeItem(RESUME_KEY);
    } catch {
      /* 存储不可用时无持久化可言 */
    }
  }

  private saveResume(): void {
    const token = (this.room as unknown as { reconnectionToken?: string }).reconnectionToken;
    if (!token) return;
    try {
      sessionStorage.setItem(RESUME_KEY, JSON.stringify({ token, role: this.myRole }));
    } catch {
      /* 隐身模式等存储不可用：静默降级为仅内存令牌（原行为） */
    }
  }

  private clearResume(): void {
    try {
      sessionStorage.removeItem(RESUME_KEY);
    } catch {
      /* 存储不可用时无持久化可言 */
    }
  }

  /**
   * 页面刷新后的回座尝试：读 sessionStorage 快照（令牌+角色）重连。
   * - 有快照且重连成功 → 绑好回调的 Net（myRole 已本地还原；服务端 allowReconnection
   *   不重跑 onJoin、不重发 role，只能靠快照）。
   * - 无快照 → { net: null, hadToken: false }（调用方走正常进房面板）。
   * - 有快照但重连失败/超时 → { net: null, hadToken: true }（调用方给明确提示）。
   */
  static async tryResume(cb: NetCallbacks, timeoutMs = 8000): Promise<{ net: Net | null; hadToken: boolean }> {
    let saved: { token?: string; role?: Role | null } = {};
    try {
      saved = JSON.parse(sessionStorage.getItem(RESUME_KEY) ?? "{}") as { token?: string; role?: Role | null };
    } catch {
      return { net: null, hadToken: false };
    }
    if (!saved.token) return { net: null, hadToken: false };
    const client = new Client(Net.serverUrl());
    const net = new Net();
    net.client = client;
    // #41-B：超时护栏统一走 reconnectAttempt（迟到 resolve 的房间由其关房）
    try {
      net.room = await reconnectAttempt(client, saved.token, timeoutMs);
    } catch {
      // 隐私模式下 sessionStorage 可能直接抛 SecurityError，不能让清理失败盖过返回值
      try {
        sessionStorage.removeItem(RESUME_KEY);
      } catch {
        /* 存储不可用时无持久化可言 */
      }
      return { net: null, hadToken: true };
    }
    net.myRole = saved.role ?? null;
    net.bindRoom(cb);
    net.saveResume();
    return { net, hadToken: true };
  }

  /**
   * 等待房间 state 首次同步出 levelId（加入方依赖它拿房间真实关卡）。
   * 超时返回 ""（调用方回退 URL 参数/默认关）。
   */
  async waitForLevelId(timeoutMs = 3000): Promise<string> {
    const id = String(this.room.state?.levelId ?? "");
    if (id) return id;
    // r8 件2：事件驱动等待（onStateChange 首见 levelId 放行；超时返回 "" 语义不变）
    return new Promise<string>((resolve) => {
      const timer = setTimeout(() => {
        this.levelIdWaiters = this.levelIdWaiters.filter((w) => w !== waiter);
        resolve("");
      }, timeoutMs);
      const waiter = (lv: string) => {
        clearTimeout(timer);
        resolve(lv);
      };
      this.levelIdWaiters.push(waiter);
    });
  }

  sendInput(input: InputMessage | InputState): void {
    this.room.send("input", input);
  }

  /**
   * F 部仙女拖拽（fw-fairy-view；状态契约与 net 槽对齐）：{id, x, y}（关卡 px，
   * 服务端换算 mouse joint target）；x=null=松手（maxForce 降 5% 回落悬浮）。
   * 服务端 handler 由 net 槽当日落地——先发不炸（Colyseus 未知消息类型服务端忽略）。
   */
  sendFairyDrag(id: string, x: number | null, y: number | null): void {
    this.room.send("fairydrag", { id, x, y });
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
    if (this.leaving) return;
    this.leaving = true;
    this.clearResume();
    this.room.leave(true);
  }
}
