import { P } from "./params.js";
import type { DiamondDef, LevelData, Rect } from "./level.js";
import { copyInput, EMPTY_INPUT, type Anim, type InputState, type Role, type WorldEvent } from "./types.js";

export interface PlayerSim {
  x: number;
  y: number;
  vx: number;
  vy: number;
  facing: 1 | -1;
  grounded: boolean;
  alive: boolean;
  respawnT: number;
  atDoor: boolean;
  anim: Anim;
  deaths: number;
  coyote: number;
  jumpBuf: number;
}

export interface PlatformSim {
  def: PlatformDefDef;
  x: number;
  y: number;
  target: 0 | 1;
}

type PlatformDefDef = LevelData["platforms"][number];

interface LeverSim {
  id: string;
  group: number;
  rect: Rect;
  on: boolean;
  cd: number;
}

export class World {
  readonly level: LevelData;
  readonly inputs = new Map<Role, InputState>();
  players: Record<Role, PlayerSim>;
  diamonds: (DiamondDef & { collected: boolean; by?: Role })[];
  platforms: PlatformSim[];
  levers: LeverSim[];
  phase: "playing" | "finished" = "playing";
  timerMs = 0;

  constructor(level: LevelData) {
    this.level = level;
    this.players = { fireboy: this.makePlayer("fireboy"), watergirl: this.makePlayer("watergirl") };
    this.diamonds = level.diamonds.map((d) => ({ ...d, collected: false }));
    this.platforms = level.platforms.map((def) => ({ def, x: def.x, y: def.y, target: 0 }));
    this.levers = level.levers.map((l) => ({ ...l, on: false, cd: 0 }));
    for (const role of ["fireboy", "watergirl"] as Role[]) this.inputs.set(role, copyInput(EMPTY_INPUT));
  }

  /** 重开本关（保留输入映射） */
  reset(): void {
    const fresh = new World(this.level);
    this.players = fresh.players;
    this.diamonds = fresh.diamonds;
    this.platforms = fresh.platforms;
    this.levers = fresh.levers;
    this.phase = "playing";
    this.timerMs = 0;
    this.platformPrev.clear();
    for (const role of ["fireboy", "watergirl"] as Role[]) {
      this.inputs.set(role, { ...EMPTY_INPUT });
    }
  }

  private makePlayer(role: Role): PlayerSim {
    const s = this.level.spawn[role];
    return {
      x: s.x,
      y: s.y,
      vx: 0,
      vy: 0,
      facing: 1,
      grounded: false,
      alive: true,
      respawnT: 0,
      atDoor: false,
      anim: "idle",
      deaths: 0,
      coyote: 0,
      jumpBuf: 0,
    };
  }

  /** 固定步长推进一步（dt 应恒为 1/P.tickRate）。返回本步产生的事件。 */
  step(dt: number): WorldEvent[] {
    const events: WorldEvent[] = [];
    if (this.phase !== "playing") return events;
    this.timerMs += dt * 1000;

    // 1) 平台移动（先于玩家，产生位移用于载具）
    for (const pl of this.platforms) {
      const tx = pl.target === 0 ? pl.def.x : pl.def.x + pl.def.dx;
      const ty = pl.target === 0 ? pl.def.y : pl.def.y + pl.def.dy;
      const dx = tx - pl.x;
      const dy = ty - pl.y;
      const dist = Math.hypot(dx, dy);
      if (dist > 0.5) {
        const mv = Math.min(P.platformSpeed * dt, dist);
        pl.x += (dx / dist) * mv;
        pl.y += (dy / dist) * mv;
      } else if (pl.def.group === undefined) {
        pl.target = pl.target === 0 ? 1 : 0; // 无组平台自动往返
      }
    }

    // 2) 拉杆（接触翻转，带冷却）
    for (const lv of this.levers) {
      lv.cd = Math.max(0, lv.cd - dt);
      if (lv.cd > 0) continue;
      for (const role of ["fireboy", "watergirl"] as Role[]) {
        const pl = this.players[role];
        if (pl.alive && overlap(plRect(pl), lv.rect)) {
          lv.on = !lv.on;
          lv.cd = P.leverCooldown;
          for (const pf of this.platforms) if (pf.def.group === lv.group) pf.target = pf.target === 0 ? 1 : 0;
          events.push({ type: "lever", group: lv.group, on: lv.on });
          break;
        }
      }
    }

    // 3) 玩家
    for (const role of ["fireboy", "watergirl"] as Role[]) {
      const pl = this.players[role];
      if (!pl.alive) {
        pl.respawnT -= dt;
        if (pl.respawnT <= 0) {
          const s = this.level.spawn[role];
          pl.x = s.x;
          pl.y = s.y;
          pl.vx = 0;
          pl.vy = 0;
          pl.alive = true;
          events.push({ type: "respawn", role });
        }
        continue;
      }
      const input = this.inputs.get(role) ?? EMPTY_INPUT;

      // 载具：站在平台上则继承平台位移
      for (const pf of this.platforms) {
        const pr = { x: pf.x, y: pf.y, w: pf.def.w, h: pf.def.h };
        const r = plRect(pl);
        if (r.x + r.w > pr.x && r.x < pr.x + pr.w && Math.abs(r.y + r.h - pr.y) < 3) {
          const prev = this.platformPrev.get(pf);
          if (prev) {
            pl.x += pf.x - prev.x;
            pl.y += pf.y - prev.y;
          }
        }
      }

      // 水平输入
      pl.vx = 0;
      if (input.left) {
        pl.vx = -P.moveSpeed;
        pl.facing = -1;
      }
      if (input.right) {
        pl.vx = P.moveSpeed;
        pl.facing = 1;
      }

      // 跳跃（缓冲 + 土狼时间）
      pl.jumpBuf = input.up ? P.jumpBuffer : Math.max(0, pl.jumpBuf - dt);
      pl.coyote = pl.grounded ? P.coyote : Math.max(0, pl.coyote - dt);
      if (pl.jumpBuf > 0 && pl.coyote > 0) {
        pl.vy = P.jumpVel;
        pl.jumpBuf = 0;
        pl.coyote = 0;
        pl.grounded = false;
      }

      pl.vy = Math.min(pl.vy + P.gravity * dt, P.maxFall);

      // 位移 + 碰撞：先 X 后 Y，瓦片与平台同为实心
      const solids = this.solidsNear(pl);
      pl.x += pl.vx * dt;
      for (const r of solids) {
        if (overlap(plRect(pl), r)) {
          if (pl.vx > 0) pl.x = r.x - P.playerW;
          else if (pl.vx < 0) pl.x = r.x + r.w;
          pl.vx = 0;
        }
      }
      const wasGrounded = pl.grounded;
      pl.grounded = false;
      pl.y += pl.vy * dt;
      for (const r of solids) {
        if (overlap(plRect(pl), r)) {
          if (pl.vy > 0) {
            pl.y = r.y - P.playerH;
            pl.grounded = true;
          } else if (pl.vy < 0) {
            pl.y = r.y + r.h;
          }
          pl.vy = 0;
        }
      }
      if (!wasGrounded && pl.grounded) pl.coyote = P.coyote;

      // 液体致死（内缩判定）
      const cause = this.liquidTouch(pl);
      if (cause) {
        pl.alive = false;
        pl.deaths++;
        pl.respawnT = P.respawnDelay;
        events.push({ type: "death", role, cause });
        continue;
      }

      // 钻石
      for (const d of this.diamonds) {
        if (d.collected) continue;
        const cx = pl.x + P.playerW / 2;
        const cy = pl.y + P.playerH / 2;
        if (Math.hypot(cx - d.x, cy - d.y) <= P.diamondRadius) {
          if (d.kind === "red" && role !== "fireboy") continue;
          if (d.kind === "blue" && role !== "watergirl") continue;
          d.collected = true;
          d.by = role;
          events.push({ type: "diamond", id: d.id, role });
        }
      }

      // 站门
      const door = this.level.doors[role];
      pl.atDoor =
        pl.x + P.playerW / 2 > door.x - P.doorTolerance &&
        pl.x + P.playerW / 2 < door.x + door.w + P.doorTolerance &&
        pl.y + P.playerH > door.y - P.doorTolerance &&
        pl.y + P.playerH < door.y + door.h + P.doorTolerance;

      // 动画推导
      pl.anim = !pl.alive
        ? "dead"
        : !pl.grounded
          ? pl.vy < 0
            ? "jump"
            : "fall"
          : Math.abs(pl.vx) > 0
            ? "run"
            : "idle";
    }

    // 4) 通关：双活 + 双双站门
    if (this.players.fireboy.alive && this.players.watergirl.alive && this.players.fireboy.atDoor && this.players.watergirl.atDoor) {
      this.phase = "finished";
      events.push({ type: "win" });
    }

    // 记录平台旧位置（供载具计算）
    this.platformPrev.clear();
    for (const pf of this.platforms) this.platformPrev.set(pf, { x: pf.x, y: pf.y });
    return events;
  }

  private platformPrev = new Map<PlatformSim, { x: number; y: number }>();

  private solidsNear(pl: PlayerSim): Rect[] {
    const out: Rect[] = [];
    const { tile, solid, cols, rows, widthPx, heightPx } = this.level;
    const t = tile;
    const x0 = Math.max(0, Math.floor((pl.x - t) / t));
    const x1 = Math.min(cols - 1, Math.floor((pl.x + P.playerW + t) / t));
    const y0 = Math.max(0, Math.floor((pl.y - t) / t));
    const y1 = Math.min(rows - 1, Math.floor((pl.y + P.playerH + t) / t));
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        if (solid[cy * cols + cx]) out.push({ x: cx * t, y: cy * t, w: t, h: t });
      }
    }
    for (const pf of this.platforms) out.push({ x: pf.x, y: pf.y, w: pf.def.w, h: pf.def.h });
    // 边界墙
    out.push({ x: -t, y: -t, w: t, h: heightPx + 2 * t });
    out.push({ x: widthPx, y: -t, w: t, h: heightPx + 2 * t });
    return out;
  }

  private liquidTouch(pl: PlayerSim): "water" | "lava" | "green" | null {
    const { tile, liquid, cols, rows } = this.level;
    const inset = P.liquidInset;
    const x0 = Math.max(0, Math.floor((pl.x + inset) / tile));
    const x1 = Math.min(cols - 1, Math.floor((pl.x + P.playerW - inset) / tile));
    const y0 = Math.max(0, Math.floor((pl.y + inset) / tile));
    const y1 = Math.min(rows - 1, Math.floor((pl.y + P.playerH - inset) / tile));
    let touch: "water" | "lava" | "green" | null = null;
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        const v = liquid[cy * cols + cx];
        if (!v) continue;
        if (v === 3) return "green"; // 绿浆必死，直接返回
        touch = v === 1 ? "water" : "lava";
      }
    }
    if (!touch) return null;
    if (touch === "water" && pl === this.players.fireboy) return "water";
    if (touch === "lava" && pl === this.players.watergirl) return "lava";
    return null; // 自己克制的液体无害
  }
}

function plRect(pl: PlayerSim): Rect {
  return { x: pl.x, y: pl.y, w: P.playerW, h: P.playerH };
}

function overlap(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}
