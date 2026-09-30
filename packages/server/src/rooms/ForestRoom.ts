/**
 * ForestRoom：一局游戏 = 一个房间。
 *
 * 职责：
 * - 密码校验（onAuth，创建与加入都走）
 * - 角色分配（先到先得 fireboy，后到 watergirl）
 * - 固定步长驱动 World（60Hz，累加器补偿抖动，防螺旋上限 6 步）
 * - 断线冻结：phase=paused 等待重连 60s，重连恢复、超时才踢出
 */
import type { Client } from "colyseus";
import { Room, ServerError } from "../colyseus.cjs.js";
import { ROLES, EMPTY_INPUT, type Role, type InputState, type WorldEvent } from "@fw/shared";
import { World } from "@fw/shared";
import { loadLevel, type LevelBundle } from "../levels.js";
import { RoomState, PlayerState, DiamondState, PlatformState } from "./state.js";
import { P } from "@fw/shared";

interface JoinOptions {
  password?: string;
  levelId?: string;
}

const STEP_MS = 1000 / P.tickRate;
const RECONNECT_SECONDS = 60;

export class ForestRoom extends Room<RoomState> {
  maxClients = 2;

  private world!: World;
  private bundle!: LevelBundle;
  private roles = new Map<string, Role>();
  private acc = 0;
  private roomPassword = "";

  onCreate(options: JoinOptions) {
    // 房间密码：创建者决定，之后加入者必须一致
    this.roomPassword = String(options.password ?? "");
    const levelId = options.levelId ?? "forest_01";

    this.bundle = loadLevel(levelId);
    this.world = new World(this.bundle.level);

    this.setState(new RoomState());
    this.state.levelId = levelId;
    this.state.phase = "playing";
    this.syncState();

    this.onMessage("input", (client, data: Partial<InputState>) => {
      const role = this.roles.get(client.sessionId);
      if (!role) return;
      // 全量快照语义：缺省键按 false 处理
      this.world.inputs.set(role, {
        up: data?.up === true,
        left: data?.left === true,
        right: data?.right === true,
      });
    });

    this.onMessage("restart", () => {
      if (this.state.phase === "finished") {
        this.world.reset();
        this.state.phase = "playing";
        this.syncState();
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
    this.world.inputs.set(role, { ...EMPTY_INPUT });
    // 告诉客户端它扮演谁（后续所有按角色区分的渲染都靠这条）
    client.send("role", role);
    this.syncState();
  }

  async onLeave(client: Client, consented: boolean) {
    const role = this.roles.get(client.sessionId);
    if (!role) return;

    // 主动离开（点退出/关页面前发了 leave）且另一人还在 → 也进入等待？
    // 简化：一律冻结等待重连 60s；真人不回来超时后才释放角色。
    this.state.phase = "paused";
    try {
      await this.allowReconnection(client, RECONNECT_SECONDS);
      if (this.state.phase === "paused") this.state.phase = "playing";
      this.syncState();
    } catch {
      this.roles.delete(client.sessionId);
      this.state.players.delete(role);
      this.world.inputs.set(role, { ...EMPTY_INPUT });
      // 两人都走了 → Colyseus 自动回收空房（默认 disposeOnDisconnect）
    }
  }

  onDispose() {
    // 房间销毁无需清理（World 随实例回收）
  }

  /** 固定步长累加器：一次最多补 6 步，卡顿后直接丢弃多余时间 */
  private tick(dtMs: number) {
    if (this.state.phase !== "playing") {
      this.acc = 0;
      return;
    }
    this.acc += Math.min(dtMs, 100);
    let steps = 0;
    while (this.acc >= STEP_MS && steps < 6) {
      this.handleEvents(this.world.step(STEP_MS / 1000));
      this.acc -= STEP_MS;
      steps++;
    }
    if (steps > 0) this.syncState();
  }

  private handleEvents(events: WorldEvent[]) {
    for (const ev of events) {
      if (ev.type === "win") {
        this.state.phase = "finished";
        this.broadcast("win", { timerMs: Math.round(this.world.timerMs) });
      } else if (ev.type === "death") {
        this.broadcast("death", { role: ev.role, cause: ev.cause });
      }
    }
  }

  /** World → Schema 状态（每 tick 全量写，框架出增量） */
  private syncState() {
    for (const role of ROLES) {
      const sim = this.world.players[role];
      let ps = this.state.players.get(role);
      if (!ps) {
        ps = new PlayerState();
        this.state.players.set(role, ps);
      }
      ps.x = Math.round(sim.x * 10) / 10;
      ps.y = Math.round(sim.y * 10) / 10;
      ps.facing = sim.facing;
      ps.anim = sim.anim;
      ps.alive = sim.alive;
      ps.atDoor = sim.atDoor;
      ps.deaths = sim.deaths;
    }
    for (const d of this.world.diamonds) {
      let ds = this.state.diamonds.get(d.id);
      if (!ds) {
        ds = new DiamondState();
        this.state.diamonds.set(d.id, ds);
      }
      ds.collected = d.collected;
    }
    for (const pf of this.world.platforms) {
      let ps = this.state.platforms.get(pf.def.id);
      if (!ps) {
        ps = new PlatformState();
        this.state.platforms.set(pf.def.id, ps);
      }
      ps.x = Math.round(pf.x * 10) / 10;
      ps.y = Math.round(pf.y * 10) / 10;
    }
    this.state.timerMs = Math.round(this.world.timerMs);
  }
}
