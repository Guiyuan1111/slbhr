/**
 * ForestRoom：一局游戏 = 一个房间（0.3.0 保真重写版）。
 *
 * 职责：
 * - 密码校验（onAuth，创建与加入都走）
 * - 角色分配（先到先得 fireboy，后到 watergirl）；URL 参数选关（?level=forest_xx）
 * - 开局流程（原版 startLevel 语义）：双人到齐 → ready 2.0s → started + 开钟
 * - 固定步长驱动 box2d World（60Hz，累加器补偿抖动，防螺旋上限 6 步）
 * - 死亡流程（原版 E1）：任一人死 → 死亡烟雾 → gameover，静置等玩家点 GameOverMenu Retry
 *   （原版无自动重开；F2 翻转 2026-10-11）；任意客户端发 restart 即整关重开（won/gameover 时）
 * - 玩家暂停（原版 E4）：任一端 P 键 → 服务端权威全场物理冻结+时钟停摆，再按解除
 *   （F3 翻转 2026-10-11，原为本地停手 AFK 语义）
 * - 断线冻结：phase=paused 等待重连 60s，重连恢复、超时才踢出
 */
import { isIP } from "node:net";
import type { AuthContext, Client } from "colyseus";
import { appendFileSync } from "node:fs";
import { Room, ServerError } from "../colyseus.cjs.js";
import { ROLES, EMPTY_INPUT, type Role, type InputState } from "@fw/shared";
import { World, m2px, type WorldEvent } from "@fw/shared/kernel";
import { levelExists, loadLevel, type LevelBundle } from "../levels.js";
import { BeamState,
  TimedPusherState, RoomState, PlayerState, DiamondState, LeverState, PusherState, BodyState, WindState } from "./state.js";

interface JoinOptions {
  password?: string;
  levelId?: string;
}

const STEP_MS = 1000 / 60;

/** 环境变量数值读取（L3）：未设置/空串→fallback；非有限数或越界→console.warn 后 fallback。
 *  导出供单测；非法值绝不透传进房间常量（NaN 会让 patch interval/重连窗静默失效）。 */
export function envNumber(name: string, fallback: number, min: number, max: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < min || value > max) {
    console.warn(`[fw] 环境变量 ${name}="${raw}" 非法（需 ${min}..${max} 的有限数），已回退 ${fallback}`);
    return fallback;
  }
  return value;
}

/** 出站 patch 率：state 增量广播间隔。缺省 1000/60（60Hz，与模拟同频）——Colyseus 出厂默认
 *  1e3/20（@colyseus/core Room.js DEFAULT_PATCH_RATE）会让客户端只能 20Hz 阶梯地看到 60Hz 仿真
 *  （10 号档 §4 表现层根因之一，netopt 槽 11 号档把出站升到与模拟同频）。FW_PATCH_MS 仅
 *  取证对照/回退用（如 FW_PATCH_MS=50 复现旧 20Hz 出站，带宽 A/B 见 11 号档 §2）。 */
const PATCH_MS = envNumber("FW_PATCH_MS", 1000 / 60, 1, 1000);
/** 断线重连等待；FW_RECONNECT_SECONDS 仅供 e2e 缩短窗口（默认 60s 不变） */
const RECONNECT_SECONDS = envNumber("FW_RECONNECT_SECONDS", 60, 1, 3600);
/** 原版 startLevel：_.delay(1600)+_.delay(400) → 2.0s 开钟 */
const READY_MS = 2000;

/** matchmaking IP 限流（M5）：固定窗口 60s 内每 IP 最多 60 次尝试。
 *  只防公网隧道下的密码暴力尝试/占座洪水；与房间无关，状态进程级共享。
 *
 *  #21 两处加固：
 *  1. key 缺省只取 TCP 对端地址——X-Forwarded-For / x-real-ip 是客户端可伪造头，Colyseus
 *     的 context.ip 优先采信它们（Server.js:239），直接用等于无限换桶绕过限流。仅当部署方
 *     显式设置 FW_TRUST_PROXY=1（处于会覆写这些头的可信反代之后）才采信，并要求 net.isIP 合法。
 *  2. 容量治理有界化：惰性清扫每窗口至多一次（原实现每请求全表扫描=O(n²)）；超过硬限按
 *     插入序逐桶淘汰最旧（每新增一桶淘汰一个，均摊 O(1)）——窗口内轮换伪造 IP 时内存有界。 */
const AUTH_WINDOW_MS = 60_000;
const AUTH_MAX_ATTEMPTS = 60;
const AUTH_MAP_SOFT_LIMIT = 1024;
const AUTH_MAP_HARD_LIMIT = 4096;
interface AuthWindow {
  start: number;
  count: number;
}
const authWindows = new Map<string, AuthWindow>();
let lastSweepAt = 0;

/** 惰性清理：只扫过期项（调用方节流到每窗口至多一次） */
function pruneAuthWindows(now: number): void {
  for (const [ip, win] of authWindows) {
    if (now - win.start >= AUTH_WINDOW_MS) authWindows.delete(ip);
  }
}

/** 固定窗口计数（导出供单测注入 now）。返回 false 表示本窗口第 61+ 次。 */
export function checkAuthRateLimit(ip: string, now = Date.now()): boolean {
  const win = authWindows.get(ip);
  if (win && now - win.start < AUTH_WINDOW_MS) {
    win.count++;
    return win.count <= AUTH_MAX_ATTEMPTS;
  }
  // 新桶路径：容量治理只发生在建桶时，命中既有窗的热路径保持 O(1)
  authWindows.set(ip, { start: now, count: 1 });
  if (authWindows.size > AUTH_MAP_SOFT_LIMIT && now - lastSweepAt >= AUTH_WINDOW_MS) {
    lastSweepAt = now;
    pruneAuthWindows(now);
  }
  if (authWindows.size > AUTH_MAP_HARD_LIMIT) {
    // 时间窗内唯一 key 超硬限（伪造源 IP 洪水）：淘汰最旧桶防内存无界（Map 迭代序=插入序）
    for (const key of authWindows.keys()) {
      authWindows.delete(key);
      break;
    }
  }
  return true;
}

/** 测试观察口：当前限流桶总数（容量治理有界性断言用） */
export function authWindowsSize(): number {
  return authWindows.size;
}

/** 限流 key 的客户端地址：缺省只信 TCP 对端；FW_TRUST_PROXY=1 才采信 x-real-ip /
 *  X-Forwarded-For 首项（逗号列表取首项，须 net.isIP 合法，否则回退对端地址）。 */
export function authIp(context: AuthContext | undefined): string {
  const remote = context?.req?.socket?.remoteAddress;
  if (process.env.FW_TRUST_PROXY === "1") {
    const raw = context?.req?.headers?.["x-real-ip"] ?? context?.req?.headers?.["x-forwarded-for"];
    const first = String((Array.isArray(raw) ? raw[0] : raw) ?? "").split(",")[0].trim();
    if (first && isIP(first)) return first;
  }
  return remote ? String(remote) : "unknown";
}

export class ForestRoom extends Room<RoomState> {
  maxClients = 2;

  private world!: World;
  private bundle!: LevelBundle;
  private roles = new Map<string, Role>();
  private acc = 0;
  private pingAcc = 0;
  private roomPassword = "";
  private readyTimer: NodeJS.Timeout | undefined;
  /** 调试钩子 timer 句柄（FW_DEBUG_*，L-07）：onDispose 统一清理，防房间销毁后
   *  定时器继续运行访问已销毁的 World/叠加堆积（仅调试环境变量开启时存在）。 */
  private debugTimers: NodeJS.Timeout[] = [];
  /** 已就绪开钟标记（避免重复调度） */
  private startedOnce = false;
  /** FW_DUMP=1 诊断：内存缓冲、每 30 帧一次批量落盘（每步 appendFileSync 在 Windows
   * 上的阻塞会反过来污染输入到达时刻，诊断工具不得干扰被测系统） */
  private dumpBuf: string[] = [];
  private dumpSeg = 0;

  /** 换段（开钟/重开）：把残余缓冲落盘后开新文件 */
  private dumpReset() {
    if (process.env.FW_DUMP !== "1") return;
    if (this.dumpBuf.length > 0) {
      appendFileSync(`TEMP/server-dump-${this.dumpSeg}.jsonl`, this.dumpBuf.join("\n") + "\n");
      this.dumpBuf = [];
    }
    this.dumpSeg++;
  }  /** 输入队列：{到达墙钟, 角色, 全量快照}；tick 内按意图跨度排水（见 onMessage 注释） */
  private inputQueue: { t: number; role: Role; data: InputState }[] = [];
  /** 开钟墙钟零点：第 k 步意图跨度 = (startedWall + k·STEP_MS, startedWall + (k+1)·STEP_MS] */
  private startedWall = 0;
  /** 已运行步数（与 kernel 帧号一致） */
  private stepIndex = 0;
  /** 玩家暂停（F3：服务端权威，任一端可置/解除；tick 见 userPaused 早退） */
  private userPaused = false;
  private userPausedBy: Role | null = null;
  /** 冻结起始墙钟（B-01，#1）：userPaused 或断线等待 phase=paused 期间步进钟停摆而墙钟继续走，
   *  恢复后到达的输入时间戳会永远大于排水 deadline（startedWall+stepIndex·STEP_MS+4），队列
   *  只进不出、角色永久失灵。进入冻结记锚点，退出把冻结时长加回开钟零点（syncFreezeClock）。 */
  private freezeStartWall = 0;
  /** 风力时基零点（页面级语义：跨整关重开/换关延续，原版 Continue 直进下一关不刷新页面） */
  private worldEpochMs = 0;
  /** 最近一次 win 结算数据（L-02，#13）：finish 只广播不落任何状态，won 相位下断线重连
   *  端错过广播后 lastFinish 为 null，客户端以 0 兜底算星级——general 关 timeOk=limit>0&&0<=limit
   *  恒真，把 0 秒成绩写进本地最佳。restart/换关时清空；重连成功时补发（见 onLeave）。 */
  private lastFinish: { fbDiamonds: number; wgDiamonds: number; silver: number; timeMs: number } | null = null;

  onCreate(options: JoinOptions) {
    this.roomPassword = String(options.password ?? "");
    // L-04（服务端半）：私用场景最低门槛——建房时密码 4-64 位（note/PLAN.md「4 位以上」
    // 落地；上限仅防异常巨串，不做复杂度策略）。加入侧走 onAuth 相等比较，短密码天然
    // 不匹配无需另判；ServerError message 经 MatchMakeError 直达客户端提示。
    if (this.roomPassword.length < 4 || this.roomPassword.length > 64) {
      throw new ServerError(4400, "房间密码需 4-64 位");
    }
    const levelId = String(options.levelId ?? "forest_01");
    if (!levelExists(levelId)) {
      throw new ServerError(4404, `关卡不存在: ${levelId}`);
    }

    this.bundle = loadLevel(levelId);
    this.worldEpochMs = Date.now();
    this.buildWorld();

    this.setState(new RoomState());
    this.state.levelId = levelId;
    this.state.phase = "lobby";
    this.syncState();

    this.onMessage("input", (client, data: Partial<InputState>) => {
      const role = this.roles.get(client.sessionId);
      if (!role) return;
      // 全量快照语义：缺省键按 false 处理。带到达时间戳入队，由 tick 按意图跨度排水——
      // 直接写 currentInputs 会被「晚到的唤醒」提前一个步消费（Wakeup 与 16.7ms 边界
      // 有 ±5-15ms 抖动，多步补帧时同输入还会覆盖两个步），队列消费与唤醒时机解耦。
      this.inputQueue.push({
        t: Date.now(),
        role,
        data: {
          up: data?.up === true,
          left: data?.left === true,
          right: data?.right === true,
        },
      });
      if (this.inputQueue.length > 128) this.inputQueue.splice(0, this.inputQueue.length - 128);
    });

    this.onMessage("restart", () => {
      // won/gameover 阶段任意客户端可重开（原版 GameOverMenu/EndMenu Retry 的联机化映射）
      if (this.state.phase === "won" || this.state.phase === "gameover") {
        this.restartLevel();
      } else if (this.userPaused && this.state.phase === "started") {
        // M-06（#11）：暂停菜单「再试一次」——玩家暂停不占用 phase（仍是 started），上面的
        // won/gameover 守卫会把它忽略掉，客户端已停面板而服务端不重开，游戏冻在原地。
        // 先解除暂停并广播（发起端面板已自行停掉，这里让对端面板关闭），再整关重开。
        this.userPaused = false;
        this.userPausedBy = null;
        this.syncFreezeClock();
        this.broadcast("pause-changed", { paused: false, by: null });
        this.restartLevel();
      }
    });

    // 结算「继续」直进下一关（原版 EndMenu Continue 的联机化，2026-10-12 实玩反馈）：
    // 活房间内换关、双方席位保留，不再回大厅重建房间。下一关 id 由发起端按 temple.json
    // 序算好带上（关卡合法性以服务端为准），仅 won 受理——双端各点一次时第二发在
    // phase=ready 被天然忽略。
    this.onMessage("advance", (_client, data: { levelId?: string }) => {
      if (this.state.phase !== "won") return;
      const id = String(data?.levelId ?? "");
      if (!id || !levelExists(id) || id === this.state.levelId) return;
      this.bundle = loadLevel(id);
      this.buildWorld();
      this.state.levelId = id;
      // 旧关条目不能带进新关（syncState 只增不删，残留=幽灵机关/钻石/刚体）
      this.state.diamonds.clear();
      this.state.levers.clear();
      this.state.pushers.clear();
      this.state.platforms.clear();
      this.state.props.clear();
      this.state.winds.clear();
      this.state.hangings.clear();
      this.state.pulleys.clear();
      this.state.beamers.clear();
      this.state.rotMirrors.clear();
      this.state.boxMirrors.clear();
      this.state.infiniteMirrors.clear();
      this.state.lightPushers.clear();
      this.state.sliders.clear();
      this.state.timedPushers.clear();
      this.state.liquids = "";
      this.state.romans.clear();
      this.restartLevel();
    });

    // 玩家暂停（F3 翻转，原版 E4 togglePause=game.paused 全场冻结）：任一端 P 键都打给
    // 服务端，由这里权威置位/解除并广播双端。started 才受理（lobby/ready/won/gameover
    // 没有可冻结的物理；断线等待的 phase=paused 是另一套冻结，不与玩家暂停叠加）。
    // 暂停期键不冻结（原版键掩码在 game.paused 下保留，恢复后按住即生效——服务端 tick
    // 早退但 inputQueue 照常入队，恢复后按意图跨度自然归帧）。
    this.onMessage("pause", (client) => {
      const role = this.roles.get(client.sessionId);
      if (!role || this.userPaused || this.state.phase !== "started") return;
      this.userPaused = true;
      this.userPausedBy = role;
      this.syncFreezeClock();
      this.broadcast("pause-changed", { paused: true, by: role });
    });
    this.onMessage("resume", () => {
      if (!this.userPaused) {
        // M-01（#6）：幂等回声——余端的暂停面板若错过了解除广播（断线超时/离场清场瞬间
        // 正停在菜单里），点「继续」只发 resume 且被这里无视的话菜单永远关不上；
        // 无论是否处于暂停，resume 一律回一条 paused:false 关闭陈旧面板（幂等无害）
        this.broadcast("pause-changed", { paused: false, by: null });
        return;
      }
      this.userPaused = false;
      const by = this.userPausedBy;
      this.userPausedBy = null;
      this.syncFreezeClock();
      this.broadcast("pause-changed", { paused: false, by });
    });

    // 调试钩子（FW_DEBUG_AUTO_WIN=1）：started 5s 后注入真实 win 事件，验证 win 下流全链
    if (process.env.FW_DEBUG_AUTO_WIN === "1") {
      this.debugTimers.push(setTimeout(() => {
        if (this.state.phase === "started") {
          this.handleEvents([{ type: "win", data: { fbDiamonds: 3, wgDiamonds: 4, silver: 0, timeMs: 5000 } }]);
        }
      }, 5000));
    }
    // 调试钩子（FW_DEBUG_DOORS=1）：每 2s 打印内核门状态推进（isOpen/frac/isUp）
    if (process.env.FW_DEBUG_DOORS === "1") {
      this.debugTimers.push(setInterval(() => {
        if (this.state.phase !== "started") return;
        const d = this.world.doors;
        console.log("[doors] fb open=" + d.fireboy.isOpen + " frac=" + d.fireboy.frac.toFixed(1) + " up=" + d.fireboy.isUp + " | wg open=" + d.watergirl.isOpen + " frac=" + d.watergirl.frac.toFixed(1) + " up=" + d.watergirl.isUp);
      }, 2000));
    }
    // 调试钩子（FW_DEBUG_FORCE_DOORS=1）：每 500ms 置双门 isOpen=true（模拟双角色站门内），
    // 驱动真实的 25fps 扫帧 → isUp → win 判定路径（区别于 AUTO_WIN 直接注入 win 事件）
    if (process.env.FW_DEBUG_FORCE_DOORS === "1") {
      this.debugTimers.push(setInterval(() => {
        if (this.state.phase !== "started") return;
        this.world.doors.fireboy.isOpen = true;
        this.world.doors.watergirl.isOpen = true;
      }, 500));
    }
    // 模拟唤醒保持默认 16.7ms：Windows 定时器分辨率 ~15.6ms，更密的 interval 会被钳制
    // （实测 setInterval(4) 实际均值 16.8ms、p95 24.7ms）。输入应用的帧精度不靠唤醒密度，
    // 靠 inputQueue 的意图跨度排水（见 tick/inputQueue 注释）。
    this.setSimulationInterval((dtMs) => this.tick(dtMs));
    // 出站 patch 率（step 后置即可：Colyseus 0.16 的 setPatchRate→patchRate 访问器会清旧
    // 50ms interval 重建，__init 在 onCreate 前已跑）。广播按 patch 网格发增量，无变化不发包。
    this.setPatchRate(PATCH_MS);
  }

  /** 世界构建（onCreate 与 advance 换关共用）。
   *  风力时基（F6 翻转）：生产=墙钟（原版页面加载起算的逐跑随机相位；锚=房间创建时刻，
   *  跨整关重开/换关延续——原版 Continue 直进下一关不刷新页面，同为页面级时基）。
   *  FW_WIND_PHASE=X（e2e/门禁专用）→ simTimeS+X 固定相位偏移，X=0 与内核缺省位级相同，
   *  路线回放与 det/金轨迹口径全线可复现。 */
  private buildWorld(): void {
    const windPhase = process.env.FW_WIND_PHASE !== undefined ? Number(process.env.FW_WIND_PHASE) : null;
    this.world = new World(this.bundle.level, {
      windClockS: windPhase !== null
        ? () => this.world.simSeconds + windPhase
        : () => (Date.now() - this.worldEpochMs) / 1000,
    });
  }

  /** Colyseus 0.16 matchmaking 级静态 onAuth（MatchMaker.js:469-470 的调用签名为
   *  `onAuth(token, options, authContext)`，authContext 含 ip/headers/req）。
   *  这里只做 IP 固定窗口限流，返回 true 仅表示放行 matchmaking，**不代表房间密码已通过**。
   *
   *  注意：Room._onJoin 在 authData 为真时不再自动调用实例 onAuth（Room.js:531-535），
   *  因此密码校验仍由实例 onAuth 完成，并在 onJoin 入口显式调用；两处不可删。
   *  也不能把密码校验搬到这里：create 时房间尚未建立，joinById 时静态层读不到房间实例密码。 */
  static async onAuth(_token: string, _options: unknown, context?: AuthContext): Promise<true> {
    const ip = authIp(context);
    if (!checkAuthRateLimit(ip)) {
      throw new ServerError(4429, "尝试过于频繁，请稍后再试");
    }
    return true;
  }

  /** 房间密码校验（#28 Critical：原为实例 onAuth，且 onJoin 按 options 类型判断调用——
   *  matchmaking 把请求体原样作 joinOptions 传入，joinById(roomId, true) 即可整体绕过。
   *  现无条件执行；实例级 onAuth 本就被框架忽略（启动时明确告警），不再保留该名字。） */
  private assertPassword(options?: JoinOptions | true): void {
    const pw = typeof options === "object" && options !== null ? String(options.password ?? "") : "";
    if (pw !== this.roomPassword) throw new ServerError(4403, "房间密码错误");
  }

  onJoin(client: Client, options?: JoinOptions | true) {
    // 密码无条件校验（#28）：onCreate 强制 4-64 位密码，不存在免密房——true/缺参/错参一律
    // 4403。断线重连不走这里（Colyseus 0.16 Room.js:527-534 isWaitingReconnection 分支直接
    // resolve，不调用 onJoin），座位恢复靠服务端预留座位，不依赖旧的「true 跳过」分支。
    this.assertPassword(options);
    let role: Role | undefined = this.roles.get(client.sessionId);
    if (!role) {
      role = ROLES.find((r) => ![...this.roles.values()].includes(r));
      if (!role) throw new ServerError(4409, "房间已满");
      this.roles.set(client.sessionId, role);
    }
    if (!this.state.players.get(role)) {
      this.state.players.set(role, new PlayerState());
    }
    this.currentInputs[role] = { ...EMPTY_INPUT };
    // 告诉客户端它扮演谁（后续所有按角色区分的渲染都靠这条）
    client.send("role", role);
    // 双人到齐 → 开局倒计时（原版 startLevel 语义：延时后开钟）。
    // startedOnce 后的补位（断线超时释放席位、phase 已回 lobby）走整关重开而非首开
    if (this.roles.size === 2) {
      if (!this.startedOnce) {
        this.beginReady();
      } else if (this.state.phase === "lobby") {
        this.restartLevel();
      }
    }
    this.syncState();
  }

  async onLeave(client: Client, consented: boolean) {
    const role = this.roles.get(client.sessionId);
    if (!role) return;

    // H-01（#2）：主动退出（客户端 room.leave(true) → consented=true）不占用断线重连窗——
    // 立即释放席位，剩余端秒回 lobby 可补位，而不是被「对方断线」冻结满 60s。
    if (consented) {
      this.releaseSeat(client, role);
      return;
    }

    // 断线冻结等待重连；真人不回来超时后才释放席位。
    const prevPhase = this.state.phase;
    this.state.phase = "paused";
    this.syncFreezeClock();
    try {
      await this.allowReconnection(client, RECONNECT_SECONDS);
      if (this.state.phase === "paused") {
        if (prevPhase === "won" && this.lastFinish) {
          // L-02：won 相位下重连，先补发 finish、延迟恢复相位——客户端 onPhase("won") 读
          // lastFinish 计算星级/最佳，相位先到会用 0 兜底（0 秒最佳根因）。重连握手完成
          // 后客户端立即重绑 onMessage（net.ts reconnect→bindRoom），120ms 足够落定，
          // 补发必被接住；随后恢复相位触发 onPhase("won") 时 lastFinish 已就位。
          // 不可直接发：allowReconnection resolve 发生在 core Room._onJoin 内部、早于
          // JOIN_ROOM 载荷（Room.js:576），此刻发会被尚未重绑的客户端 Room 丢弃。
          const finish = this.lastFinish;
          setTimeout(() => {
            if (this.state.phase !== "paused") return; // 期间已有迁移（另一路超时回 lobby 等）
            client.send("finish", finish);
            this.state.phase = prevPhase;
            this.syncFreezeClock();
            this.syncState();
          }, 120);
        } else {
          this.state.phase = prevPhase;
          // H-02：ready 期断线回来——旧 ready 钟大概率已被守卫拦掉（断线期 phase=paused），
          // 重排一轮（beginReady 自带 clearTimeout，不会叠加）
          if (prevPhase === "ready") this.beginReady();
          this.syncFreezeClock();
        }
      }
      this.syncState();
      // 重连端错过了 pause-changed 广播：仍处玩家暂停则补发一条，让它恢复暂停画面
      if (this.userPaused) client.send("pause-changed", { paused: true, by: this.userPausedBy });
    } catch {
      this.releaseSeat(client, role);
    }
  }

  /** 释放席位（H-01 主动退出 / 断线超时共用）：删角色与输入、解除玩家暂停、余员回 lobby。
   *  离场者可能是暂停发起者——解除必须同时广播 paused:false，否则余端的暂停菜单
   *  点「继续」只发 resume、无回声关不上（M-01 的超时路径同源）。 */
  private releaseSeat(client: Client, role: Role): void {
    this.roles.delete(client.sessionId);
    this.state.players.delete(role);
    this.currentInputs[role] = { ...EMPTY_INPUT };
    // 超时踢出/离场：玩家暂停一并解除（剩余端回 lobby；若不解除，补位新对会被冻在开局前）
    const hadPause = this.userPaused;
    this.userPaused = false;
    this.userPausedBy = null;
    // 仍有一人在场 → 相位回 lobby 允许补位；补位 join 走 restartLevel 整关重开
    // （原版 retry 语义）。不回 lobby 的话 phase 永久卡 paused，tick 停转成死房。
    if (this.roles.size > 0) {
      this.state.phase = "lobby";
      if (hadPause) this.broadcast("pause-changed", { paused: false, by: null });
      this.syncFreezeClock();
      this.syncState();
    }
    // 两人都走了 → Colyseus 自动回收空房（默认 disposeOnDisconnect）
  }

  onDispose() {
    if (this.readyTimer) clearTimeout(this.readyTimer);
    // L-07：调试钩子 timer 一并清理，防销毁后继续访问已销毁的 World/多房间叠加
    for (const t of this.debugTimers) {
      clearTimeout(t);
      clearInterval(t);
    }
    this.debugTimers = [];
  }

  /** 冻结态 = 玩家暂停 ∪ 断线等待（两种冻结都停 tick，共享同一时基补偿——B-01） */
  private isFrozen(): boolean {
    return this.userPaused || this.state.phase === "paused";
  }

  /** 冻结进出时同步补偿 startedWall（B-01）：进入记锚点；退出把冻结时长加回开钟零点，
   *  使「意图跨度排水」的 deadline 跟着墙钟前移——恢复后按住的键立即生效（原版键掩码语义）。
   *  两种冻结可叠加（A 暂停中 B 断线），以最外层进出为准，补偿量=实际冻结时长。 */
  private syncFreezeClock(): void {
    if (this.isFrozen()) {
      if (this.freezeStartWall === 0) this.freezeStartWall = Date.now();
    } else if (this.freezeStartWall !== 0) {
      if (this.startedWall !== 0) this.startedWall += Date.now() - this.freezeStartWall;
      this.freezeStartWall = 0;
    }
  }

  /** 双人到齐：ready 2.0s → started（原版 1600+400ms 开钟） */
  private beginReady() {
    // H-02（#3）：先清旧钟防叠加——补位/重连重排/连发 restart 时旧 timer 还挂着，
    // 两钟并存会先到者开钟、后到者再开一次（相位机错乱）
    if (this.readyTimer) clearTimeout(this.readyTimer);
    this.state.phase = "ready";
    this.syncState();
    // 纯观测时间戳（e2e 路由回放的 t0 锚点）：不参与任何逻辑分支
    console.log(`[phase] ready @${Date.now()}`);
    this.readyTimer = setTimeout(() => {
      // H-02 相位/人数守卫：ready 期有人断线（phase 已被 onLeave 置 paused）或席位不齐时
      // 不得开钟——否则缺一开跑，缺席角色被残留输入带进液体/机关；缺席者重连后相位已
      // started 也回不去 ready。重连成功路径对 prevPhase=ready 会重排 beginReady。
      if (this.state.phase !== "ready" || this.roles.size !== 2) return;
      this.startedOnce = true;
      this.state.phase = "started";
      // 输入队列时基零点：清掉 ready 期残留，第 k 步跨度以此为基准
      this.startedWall = Date.now();
      this.stepIndex = 0;
      this.inputQueue = [];
      this.freezeStartWall = 0;
      this.dumpReset();
      this.syncState();
      console.log(`[phase] started @${Date.now()}`);
    }, READY_MS);
  }

  /** 整关重开（原版 retry：整状态重载） */
  private restartLevel() {
    if (this.readyTimer) clearTimeout(this.readyTimer); // H-02：同 beginReady，防钟叠加
    this.world.reset();
    // L-02：旧关结算不跨重开
    this.lastFinish = null;
    // 玩家暂停不跨重开（原版 retry 走完整 startLevel，game.paused 归 false）
    this.userPaused = false;
    this.userPausedBy = null;
    this.state.phase = "ready";
    this.syncState();
    this.readyTimer = setTimeout(() => {
      if (this.state.phase !== "ready" || this.roles.size !== 2) return; // H-02 守卫，同 beginReady
      this.state.phase = "started";
      this.startedWall = Date.now();
      this.stepIndex = 0;
      this.inputQueue = [];
      this.freezeStartWall = 0;
      this.dumpReset();
      this.syncState();
    }, READY_MS);
  }

  /** 固定步长累加器：一次最多补 6 步，卡顿后直接丢弃多余时间 */
  private tick(dtMs: number) {
    if (this.state.phase !== "started") {
      this.acc = 0;
      // 大厅/暂停期心跳：每秒一跳，死 TCP（对端消失/服务重启）会在 1-2s 内触发
      // ws close，让双方页面及时显示断线，而不是挂着假活的等待页（实玩反馈 2026-10-05）
      this.pingAcc += dtMs;
      if (this.pingAcc >= 1000) {
        this.pingAcc = 0;
        this.broadcast("ping");
      }
      return;
    }
    if (this.userPaused) {
      // F3 玩家暂停：全场物理冻结+时钟停摆（原版 clock.pause 语义）。弃掉暂停期墙钟
      // （恢复不跳帧）；心跳照发保持断线探测；inputQueue 不动——暂停期到达的输入留在
      // 队里，恢复后按意图跨度归帧，按住不放=恢复瞬间生效（与原版键掩码语义一致）
      this.acc = 0;
      this.pingAcc += dtMs;
      if (this.pingAcc >= 1000) {
        this.pingAcc = 0;
        this.broadcast("ping");
      }
      return;
    }
    // B-01 卡顿重锚定：acc 被 Math.min(dtMs,100) 截断后，步进钟（startedWall+stepIndex·STEP_MS）
    // 落后墙钟且永不追回——此后到达的输入时间戳全部大于排水 deadline，队列只进不出（与暂停
    // 漂移同族）。落后超 200ms（健康运行 ≤~25ms）时把开钟零点重锚到现在：意图跨度整体平移，
    // 卡顿期排队的输入按「按住恢复」语义归入当前步，行为面不变。
    const now = Date.now();
    const behind = now - (this.startedWall + this.stepIndex * STEP_MS);
    if (behind > 200) this.startedWall = now - this.stepIndex * STEP_MS;
    this.acc += Math.min(dtMs, 100);
    let steps = 0;
    while (this.acc >= STEP_MS && steps < 6) {
      // 按意图跨度排水输入队列：第 k 步消费「目标帧为 k」的消息。
      // 路由派发目标 = startedWall + k·STEP_MS − 10ms（到达 ≈ −8ms，CDP 抖动 ±2ms），
      // deadline 取 B_k + 4：比它早到的消息归本步（吸收 10ms 迟到），比上个 deadline
      // （B_{k−1}+4 = B_k − 12.7）晚到的消息才归本步（容忍 4.7ms 提前）。唤醒相位 φ
      // 相对 started 本是随机的（interval 从建房就跑、acc 在 started 前清零），队列
      // 消费只认意图跨度，φ 与唤醒抖动都被解耦。
      const deadline = this.startedWall + this.stepIndex * STEP_MS + 4;
      while (this.inputQueue.length > 0 && this.inputQueue[0].t <= deadline) {
        const q = this.inputQueue.shift()!;
        if (process.env.FW_DUMP === "1") {
          this.dumpBuf.push(JSON.stringify({ consume: this.stepIndex, role: q.role, at: q.t - this.startedWall, keys: q.data }));
        }
        this.currentInputs[q.role] = q.data;
      }
      this.handleEvents(this.world.step(STEP_MS / 1000, this.currentInputs));
      if (process.env.FW_DUMP === "1") {
        // 与内核 trace 同惯例：step 后写（本行 = 第 f 帧步进完成态）
        const fb = this.world.snapshotPlayer("fireboy");
        const wg = this.world.snapshotPlayer("watergirl");
        this.dumpBuf.push(JSON.stringify({
          f: this.stepIndex,
          fb: [fb.x, fb.y],
          wg: [wg.x, wg.y],
          in: {
            fb: { ...this.currentInputs.fireboy },
            wg: { ...this.currentInputs.watergirl },
          },
        }));
        if (this.dumpBuf.length >= 30) {
          appendFileSync(`TEMP/server-dump-${this.dumpSeg}.jsonl`, this.dumpBuf.join("\n") + "\n");
          this.dumpBuf = [];
        }
      }
      this.acc -= STEP_MS;
      steps++;
      this.stepIndex++;
    }
    if (steps > 0) this.syncState();
  }

  private handleEvents(events: WorldEvent[]) {
    for (const ev of events) {
      if (ev.type === "win") {
        if (process.env.FW_DEBUG_DOORS === "1") console.log("[win] 事件触发，切 phase=won");
        this.state.phase = "won";
        // L-02：结算数据落服务端，won 相位下断线重连时可补发（广播仍为主通道）
        this.lastFinish = {
          fbDiamonds: ev.data.fbDiamonds,
          wgDiamonds: ev.data.wgDiamonds,
          silver: ev.data.silver,
          timeMs: Math.round(ev.data.timeMs),
        };
        // 结算数据全量随消息下发（星级/用时由客户端按原版公式呈现）
        this.broadcast("finish", this.lastFinish);
      } else if (ev.type === "death") {
        this.broadcast("death", { role: ev.role });
      } else if (ev.type === "gameover") {
        // 原版语义（F2 翻转）：gameover 静置，GameOverMenu Retry 点击才整关重开（onMessage restart）
        this.state.phase = "gameover";
      } else if (ev.type === "mech") {
        // 机关音效/灯事件直发（lever/pusher 翻转）
        this.broadcast("sfx", { kind: ev.event.kind, group: ev.event.group, state: ev.event.state });
      } else if (ev.type === "liquid-frozen") {
        this.broadcast("sfx", { kind: "liquid-frozen" });
      } else if (ev.type === "liquid-melted") {
        this.broadcast("sfx", { kind: "liquid-melted" });
      } else if (ev.type === "diamond") {
        this.broadcast("sfx", { kind: "diamond", role: ev.role });
      } else if (ev.type === "door-open") {
        this.broadcast("sfx", { kind: "door", role: ev.role });
      }
    }
  }

  /** World → Schema 状态（每 tick 全量写，框架出增量）。
   *  r1 perf 件3（2026-10-18）：机关位姿不再经 mechSnapshot() 中间快照（每 tick ~30 个
   *  快照对象+数组纯为序列化而建，hotspot 01 号档 §2.2），改由 mechanisms 直读逐字段写
   *  RoomState——写入表达式与旧路径逐操作同构（角度/坐标取整算式原样），纯序列化侧零
   *  物理影响，det 门 48/48 + fixtures 6/6 实测背书。 */
  private syncState() {
    const mechs = this.world.mechanisms;
    for (const role of ROLES) {
      // L-01（#12）：席位已释放（超时/离场）的角色不写不建——否则上一行刚被 releaseSeat
      // 删掉的 PlayerState 立刻在这里按 World 快照补建回来，余端看到离场角色的幽灵
      // （冻结在最后位置）。World 侧角色仍在但不再映射进状态，补位重开 world.reset() 归位。
      if (!this.hasSeat(role)) continue;
      const sim = this.world.snapshotPlayer(role);
      let ps = this.state.players.get(role);
      if (!ps) {
        ps = new PlayerState();
        this.state.players.set(role, ps);
      }
      ps.x = Math.round(sim.x * 10) / 10;
      ps.y = Math.round(sim.y * 10) / 10;
      ps.vx = Math.round(sim.vx * 10) / 10;
      ps.vy = Math.round(sim.vy * 10) / 10;
      ps.facing = sim.facing;
      ps.anim = sim.anim;
      ps.headTilt = Math.round(sim.headTilt * 1000) / 1000;
      ps.inLiquid = sim.inLiquid;
      ps.dying = sim.dying;
      ps.dead = sim.dead;
      ps.isDead = sim.isDead;
      ps.atDoor = sim.atDoor;
      ps.doorFrame = sim.doorFrame;
      ps.doorUp = sim.doorUp;
    }
    for (const d of this.world.diamonds) {
      let ds = this.state.diamonds.get(d.id);
      if (!ds) {
        ds = new DiamondState();
        this.state.diamonds.set(d.id, ds);
      }
      ds.collected = d.collected;
    }
    for (let id = 0; id < mechs.levers.length; id++) {
      const l = mechs.levers[id];
      let ls = this.state.levers.get(String(id));
      if (!ls) {
        ls = new LeverState();
        this.state.levers.set(String(id), ls);
      }
      ls.group = l.group;
      ls.state = l.state;
      ls.angle = Math.round(((l.angleDeg() * Math.PI) / 180) * 1000) / 1000;
    }
    for (let id = 0; id < mechs.pushers.length; id++) {
      const p = mechs.pushers[id];
      let ps = this.state.pushers.get(String(id));
      if (!ps) {
        ps = new PusherState();
        this.state.pushers.set(String(id), ps);
      }
      ps.group = p.group;
      ps.state = p.state;
      const pos = p.body.GetPosition();
      ps.x = Math.round(m2px(pos.x) * 10) / 10;
      ps.y = Math.round(m2px(pos.y) * 10) / 10;
    }
    for (let id = 0; id < mechs.platforms.length; id++) {
      const p = mechs.platforms[id];
      let bs = this.state.platforms.get(String(id));
      if (!bs) {
        bs = new BodyState();
        this.state.platforms.set(String(id), bs);
      }
      const pos = p.body.GetPosition();
      bs.x = Math.round(m2px(pos.x) * 10) / 10;
      bs.y = Math.round(m2px(pos.y) * 10) / 10;
      bs.angle = Math.round(-p.body.GetAngle() * 1000) / 1000;
      bs.state = p.state;
    }
    for (let id = 0; id < mechs.props.length; id++) {
      const p = mechs.props[id];
      const key = `${p.kind}:${id}`;
      let bs = this.state.props.get(key);
      if (!bs) {
        bs = new BodyState();
        this.state.props.set(key, bs);
      }
      const pos = p.body.GetPosition();
      bs.x = Math.round(m2px(pos.x) * 10) / 10;
      bs.y = Math.round(m2px(pos.y) * 10) / 10;
      bs.angle = Math.round(-p.body.GetAngle() * 1000) / 1000;
    }
    for (let id = 0; id < mechs.winds.length; id++) {
      const wd = mechs.winds[id];
      let ws = this.state.winds.get(String(id));
      if (!ws) {
        ws = new WindState();
        this.state.winds.set(String(id), ws);
      }
      ws.group = wd.group;
      ws.state = wd.state;
    }
    // 吊挂/滑轮/罗马杆位姿（0.3.25：此前内核有体、快照不下发，客户端板子全隐形）
    for (let id = 0; id < mechs.hangings.length; id++) {
      const h = mechs.hangings[id];
      let bs = this.state.hangings.get(String(id));
      if (!bs) {
        bs = new BodyState();
        this.state.hangings.set(String(id), bs);
      }
      const pos = h.platform.GetPosition();
      bs.x = Math.round(m2px(pos.x) * 10) / 10;
      bs.y = Math.round(m2px(pos.y) * 10) / 10;
      bs.angle = Math.round(h.platform.GetAngle() * 1000) / 1000;
    }
    for (let id = 0; id < mechs.pulleys.length; id++) {
      const p = mechs.pulleys[id];
      this.syncPulleyHalf(`u${id}a`, p.plat1);
      this.syncPulleyHalf(`u${id}b`, p.plat2);
    }
    for (let id = 0; id < mechs.romans.length; id++) {
      const r = mechs.romans[id];
      let bs = this.state.romans.get(String(id));
      if (!bs) {
        bs = new BodyState();
        this.state.romans.set(String(id), bs);
      }
      const pos = r.bar.GetPosition();
      bs.x = Math.round(m2px(pos.x) * 10) / 10;
      bs.y = Math.round(m2px(pos.y) * 10) / 10;
      bs.angle = Math.round(r.bar.GetAngle() * 1000) / 1000;
    }
    // ---- 灯光神庙机关（light 关非空；forest 恒零循环）----
    for (let id = 0; id < mechs.beamers.length; id++) {
      const b = mechs.beamers[id];
      let bs = this.state.beamers.get(String(id));
      if (!bs) {
        bs = new BeamState();
        this.state.beamers.set(String(id), bs);
      }
      bs.state = b.state;
      // 折线打包（r12：Beamer.packed() 坐标缓存比对，未变零构建；不变则不写=框架零增量）
      const pts = b.packed();
      if (bs.pts !== pts) bs.pts = pts;
    }
    const syncBody = (map: any, key: string, body: any, angleSign: number, state?: number): void => {
      let bs = map.get(key);
      if (!bs) {
        bs = new BodyState();
        map.set(key, bs);
      }
      const pos = body.GetPosition();
      bs.x = Math.round(m2px(pos.x) * 10) / 10;
      bs.y = Math.round(m2px(pos.y) * 10) / 10;
      bs.angle = Math.round(angleSign * body.GetAngle() * 1000) / 1000;
      if (state !== undefined) bs.state = state;
    };
    for (let id = 0; id < mechs.rotMirrors.length; id++) syncBody(this.state.rotMirrors, String(id), mechs.rotMirrors[id].body, 1, mechs.rotMirrors[id].state);
    for (let id = 0; id < mechs.boxMirrors.length; id++) syncBody(this.state.boxMirrors, String(id), mechs.boxMirrors[id].body, 1);
    for (let id = 0; id < mechs.infiniteMirrors.length; id++) syncBody(this.state.infiniteMirrors, String(id), mechs.infiniteMirrors[id].body, 1);
    for (let id = 0; id < mechs.lightPushers.length; id++) {
      const m = mechs.lightPushers[id];
      let ps = this.state.lightPushers.get(String(id));
      if (!ps) {
        ps = new PusherState();
        this.state.lightPushers.set(String(id), ps);
      }
      ps.group = m.group;
      ps.state = m.state;
      const pos = m.body.GetPosition();
      ps.x = Math.round(m2px(pos.x) * 10) / 10;
      ps.y = Math.round(m2px(pos.y) * 10) / 10;
    }
    for (let id = 0; id < mechs.sliders.length; id++) syncBody(this.state.sliders, String(id), mechs.sliders[id].body, 1);
    for (let id = 0; id < mechs.timedPushers.length; id++) {
      const m = mechs.timedPushers[id];
      let ps = this.state.timedPushers.get(String(id));
      if (!ps) {
        ps = new TimedPusherState();
        this.state.timedPushers.set(String(id), ps);
      }
      ps.state = m.state;
      ps.downState = m.downState;
      // 时钟进度：按压保持期 1−elapsed/time（原版 1−timer.ms/time），非保持期 0
      const frac = m.timerActive ? Math.max(0, Math.min(1, 1 - m.timerElapsedMs / m.timeMs)) : 0;
      const fr = Math.round(frac * 1000) / 1000;
      if (ps.frac !== fr) ps.frac = fr;
      const pos = m.body.GetPosition();
      ps.x = Math.round(m2px(pos.x) * 10) / 10;
      ps.y = Math.round(m2px(pos.y) * 10) / 10;
    }
    // 液体冻结旗标（行段序 0/1 串）
    const liquidsFlag = this.world.liquids.map((l: any) => (l.frozen ? "1" : "0")).join("");
    if (this.state.liquids !== liquidsFlag) this.state.liquids = liquidsFlag;

    const doors = this.world.doors;
    this.state.doors.fbAtDoor = doors.fireboy.isOpen;
    this.state.doors.wgAtDoor = doors.watergirl.isOpen;
    this.state.doors.fbFrame = doors.fireboy.frac;
    this.state.doors.wgFrame = doors.watergirl.frac;
    this.state.doors.fbUp = doors.fireboy.isUp;
    this.state.doors.wgUp = doors.watergirl.isUp;
    this.state.timerMs = Math.round(this.world.timerMs);
  }

  /** 滑轮半侧位姿写入（u<id>a/u<id>b 两键，位姿口径同吊挂/罗马杆：+体角） */
  private syncPulleyHalf(key: string, body: any) {
    let bs = this.state.pulleys.get(key);
    if (!bs) {
      bs = new BodyState();
      this.state.pulleys.set(key, bs);
    }
    const pos = body.GetPosition();
    bs.x = Math.round(m2px(pos.x) * 10) / 10;
    bs.y = Math.round(m2px(pos.y) * 10) / 10;
    bs.angle = Math.round(body.GetAngle() * 1000) / 1000;
  }

  /** 角色当前是否有人占席（roles 以 sessionId 为键，反查；每 tick 调用，零分配）。
   *  断线等待期席位未释放（仍占席，冻结值照常下发），超时/主动退出释放后即缺席——L-01。 */
  private hasSeat(role: Role): boolean {
    for (const r of this.roles.values()) if (r === role) return true;
    return false;
  }

  /** 每角色最近一次输入快照（input 消息全量语义） */
  private currentInputs: Record<Role, InputState> = {
    fireboy: { ...EMPTY_INPUT },
    watergirl: { ...EMPTY_INPUT },
  };
}
