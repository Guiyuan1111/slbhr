/**
 * ForestRoom：一局游戏 = 一个房间（0.3.0 保真重写版）。
 *
 * 职责：
 * - 密码校验（onAuth，创建与加入都走）
 * - 角色分配（先到先得 fireboy，后到 watergirl）；URL 参数选关（?level=forest_xx）
 * - 开局流程（原版 startLevel 语义）：双人到齐 → ready 2.0s → started + 开钟
 * - 固定步长驱动 box2d World（60Hz，累加器补偿抖动，防螺旋上限 6 步）
 * - 死亡流程（原版 E1）：任一人死 → 死亡烟雾 → gameover → 2.5s 自动整关重开；
 *   任意客户端可发 restart 提前重开（won/gameover 时）
 * - 断线冻结：phase=paused 等待重连 60s，重连恢复、超时才踢出
 */
import type { Client } from "colyseus";
import { Room, ServerError } from "../colyseus.cjs.js";
import { ROLES, EMPTY_INPUT, type Role, type InputState } from "@fw/shared";
import { World, type WorldEvent } from "@fw/shared/kernel";
import { levelExists, loadLevel, type LevelBundle } from "../levels.js";
import { RoomState, PlayerState, DiamondState, LeverState, PusherState, BodyState, WindState } from "./state.js";

interface JoinOptions {
  password?: string;
  levelId?: string;
}

const STEP_MS = 1000 / 60;
const RECONNECT_SECONDS = 60;
/** 原版 startLevel：_.delay(1600)+_.delay(400) → 2.0s 开钟 */
const READY_MS = 2000;
/** gameover → 自动整关重开（原版 GameOver 菜单 Retry 的联机化，偏离已记录） */
const AUTO_RESTART_MS = 2500;

export class ForestRoom extends Room<RoomState> {
  maxClients = 2;

  private world!: World;
  private bundle!: LevelBundle;
  private roles = new Map<string, Role>();
  private acc = 0;
  private roomPassword = "";
  private readyTimer: NodeJS.Timeout | undefined;
  private restartTimer: NodeJS.Timeout | undefined;
  /** 已就绪开钟标记（避免重复调度） */
  private startedOnce = false;

  onCreate(options: JoinOptions) {
    this.roomPassword = String(options.password ?? "");
    const levelId = String(options.levelId ?? "forest_01");
    if (!levelExists(levelId)) {
      throw new ServerError(4404, `关卡不存在: ${levelId}`);
    }

    this.bundle = loadLevel(levelId);
    this.world = new World(this.bundle.level);

    this.setState(new RoomState());
    this.state.levelId = levelId;
    this.state.phase = "lobby";
    this.syncState();

    this.onMessage("input", (client, data: Partial<InputState>) => {
      const role = this.roles.get(client.sessionId);
      if (!role) return;
      // 全量快照语义：缺省键按 false 处理（World.step 直读，见 currentInputs）
      this.currentInputs[role] = {
        up: data?.up === true,
        left: data?.left === true,
        right: data?.right === true,
      };
    });

    this.onMessage("restart", () => {
      // won/gameover 阶段任意客户端可立即重开（gameover 另有 2.5s 自动重开兜底）
      if (this.state.phase === "won" || this.state.phase === "gameover") {
        this.restartLevel();
      }
    });

    this.setSimulationInterval((dtMs) => this.tick(dtMs));
  }

  /** 创建与加入共用：密码不对直接拒绝 */
  onAuth(_client: Client, options: JoinOptions) {
    if (String(options?.password ?? "") !== this.roomPassword) {
      throw new ServerError(4403, "房间密码错误");
    }
    return true;
  }

  onJoin(client: Client) {
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
    // 双人到齐 → 开局倒计时（原版 startLevel 语义：延时后开钟）
    if (this.roles.size === 2 && !this.startedOnce) {
      this.beginReady();
    }
    this.syncState();
  }

  async onLeave(client: Client, consented: boolean) {
    const role = this.roles.get(client.sessionId);
    if (!role) return;

    // 一律冻结等待重连 60s；真人不回来超时后才释放角色。
    const prevPhase = this.state.phase;
    this.state.phase = "paused";
    try {
      await this.allowReconnection(client, RECONNECT_SECONDS);
      if (this.state.phase === "paused") this.state.phase = prevPhase;
      this.syncState();
    } catch {
      this.roles.delete(client.sessionId);
      this.state.players.delete(role);
      this.currentInputs[role] = { ...EMPTY_INPUT };
      // 两人都走了 → Colyseus 自动回收空房（默认 disposeOnDisconnect）
    }
  }

  onDispose() {
    if (this.readyTimer) clearTimeout(this.readyTimer);
    if (this.restartTimer) clearTimeout(this.restartTimer);
  }

  /** 双人到齐：ready 2.0s → started（原版 1600+400ms 开钟） */
  private beginReady() {
    this.state.phase = "ready";
    this.syncState();
    this.readyTimer = setTimeout(() => {
      this.startedOnce = true;
      this.state.phase = "started";
      this.syncState();
    }, READY_MS);
  }

  /** 整关重开（原版 retry：整状态重载） */
  private restartLevel() {
    if (this.restartTimer) clearTimeout(this.restartTimer);
    this.world.reset();
    this.state.phase = "ready";
    this.syncState();
    this.readyTimer = setTimeout(() => {
      this.state.phase = "started";
      this.syncState();
    }, READY_MS);
  }

  /** 固定步长累加器：一次最多补 6 步，卡顿后直接丢弃多余时间 */
  private tick(dtMs: number) {
    if (this.state.phase !== "started") {
      this.acc = 0;
      return;
    }
    this.acc += Math.min(dtMs, 100);
    let steps = 0;
    while (this.acc >= STEP_MS && steps < 6) {
      this.handleEvents(this.world.step(STEP_MS / 1000, this.currentInputs));
      this.acc -= STEP_MS;
      steps++;
    }
    if (steps > 0) this.syncState();
  }

  private handleEvents(events: WorldEvent[]) {
    for (const ev of events) {
      if (ev.type === "win") {
        this.state.phase = "won";
        // 结算数据全量随消息下发（星级/用时由客户端按原版公式呈现）
        this.broadcast("finish", {
          fbDiamonds: ev.data.fbDiamonds,
          wgDiamonds: ev.data.wgDiamonds,
          silver: ev.data.silver,
          timeMs: Math.round(ev.data.timeMs),
        });
      } else if (ev.type === "death") {
        this.broadcast("death", { role: ev.role });
      } else if (ev.type === "gameover") {
        this.state.phase = "gameover";
        // 原版 GameOver 菜单 Retry 的联机化：2.5s 后自动整关重开
        if (this.restartTimer) clearTimeout(this.restartTimer);
        this.restartTimer = setTimeout(() => this.restartLevel(), AUTO_RESTART_MS);
      } else if (ev.type === "mech") {
        // 机关音效/灯事件直发（lever/pusher 翻转）
        this.broadcast("sfx", { kind: ev.event.kind, group: ev.event.group, state: ev.event.state });
      } else if (ev.type === "diamond") {
        this.broadcast("sfx", { kind: "diamond", role: ev.role });
      } else if (ev.type === "door-open") {
        this.broadcast("sfx", { kind: "door", role: ev.role });
      }
    }
  }

  /** World → Schema 状态（每 tick 全量写，框架出增量） */
  private syncState() {
    const snap = this.world.mechSnapshot();
    for (const role of ROLES) {
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
    for (const l of snap.levers) {
      let ls = this.state.levers.get(String(l.id));
      if (!ls) {
        ls = new LeverState();
        this.state.levers.set(String(l.id), ls);
      }
      ls.group = l.group;
      ls.state = l.state;
      ls.angle = Math.round(l.angle * 1000) / 1000;
    }
    for (const p of snap.pushers) {
      let ps = this.state.pushers.get(String(p.id));
      if (!ps) {
        ps = new PusherState();
        this.state.pushers.set(String(p.id), ps);
      }
      ps.group = p.group;
      ps.state = p.state;
    ps.x = Math.round(p.x * 10) / 10;
    ps.y = Math.round(p.y * 10) / 10;
    }
    for (const p of snap.platforms) {
      let bs = this.state.platforms.get(String(p.id));
      if (!bs) {
        bs = new BodyState();
        this.state.platforms.set(String(p.id), bs);
      }
      bs.x = Math.round(p.x * 10) / 10;
      bs.y = Math.round(p.y * 10) / 10;
      bs.angle = Math.round(p.angle * 1000) / 1000;
    }
    for (const p of snap.props) {
      let bs = this.state.props.get(`${p.kind}:${p.id}`);
      if (!bs) {
        bs = new BodyState();
        this.state.props.set(`${p.kind}:${p.id}`, bs);
      }
      bs.x = Math.round(p.x * 10) / 10;
      bs.y = Math.round(p.y * 10) / 10;
      bs.angle = Math.round(p.angle * 1000) / 1000;
    }
    for (const wd of snap.winds) {
      let ws = this.state.winds.get(String(wd.id));
      if (!ws) {
        ws = new WindState();
        this.state.winds.set(String(wd.id), ws);
      }
      ws.group = wd.group;
      ws.state = wd.state;
    }
    const doors = this.world.doors;
    this.state.doors.fbAtDoor = doors.fireboy.isOpen;
    this.state.doors.wgAtDoor = doors.watergirl.isOpen;
    this.state.doors.fbFrame = doors.fireboy.frac;
    this.state.doors.wgFrame = doors.watergirl.frac;
    this.state.doors.fbUp = doors.fireboy.isUp;
    this.state.doors.wgUp = doors.watergirl.isUp;
    this.state.timerMs = Math.round(this.world.timerMs);
  }

  /** 每角色最近一次输入快照（input 消息全量语义） */
  private currentInputs: Record<Role, InputState> = {
    fireboy: { ...EMPTY_INPUT },
    watergirl: { ...EMPTY_INPUT },
  };
}
