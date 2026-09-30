import { P } from "./params.js";
import type { DiamondDef, LevelData, PlateDef, Rect } from "./level.js";
import { copyInput, EMPTY_INPUT, type Anim, type InputState, type Role, type WorldEvent } from "./types.js";

const ROLES = ["fireboy", "watergirl"] as const;

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

export interface PlateSim {
  def: PlateDef;
  pressed: boolean;
}

/** 推箱：可被玩家推行、可站立、可压住按钮板 */
export interface BoxSim {
  x: number;
  y: number;
  w: number;
  h: number;
  vy: number;
  grounded: boolean;
}

export class World {
  readonly level: LevelData;
  readonly inputs = new Map<Role, InputState>();
  players: Record<Role, PlayerSim>;
  diamonds: (DiamondDef & { collected: boolean; by?: Role })[];
  platforms: PlatformSim[];
  levers: LeverSim[];
  plates: PlateSim[];
  box: BoxSim | null;
  phase: "playing" | "finished" = "playing";
  timerMs = 0;

  constructor(level: LevelData) {
    this.level = level;
    this.players = { fireboy: this.makePlayer("fireboy"), watergirl: this.makePlayer("watergirl") };
    this.diamonds = level.diamonds.map((d) => ({ ...d, collected: false }));
    // 原版实证（live jt 读数）：对象矩形位=高位端（target 0）；state 1=下沉端=target 0−(dx,dy)。
    // 开局带 startPos=1 拉杆的组平台位于下沉端（左平台 jt=-3.01）。
    const startLoweredGroups = new Set(level.levers.filter((l) => l.startOn).map((l) => l.group));
    this.platforms = level.platforms.map((def) => ({
      def,
      x: def.x,
      y: def.y,
      target: def.group !== undefined && startLoweredGroups.has(def.group) ? 1 : 0,
    }));
    this.levers = level.levers.map((l) => ({ ...l, on: l.startOn, cd: 0 }));
    this.plates = level.plates.map((def) => ({ def, pressed: false }));
    const boxDef = level.mechProps.find((m) => m.gid === 4);
    this.box = boxDef
      ? { x: boxDef.rect.x, y: boxDef.rect.y, w: boxDef.rect.w, h: boxDef.rect.h, vy: 0, grounded: false }
      : null;
    for (const role of ROLES) this.inputs.set(role, copyInput(EMPTY_INPUT));
  }

  /** 重开本关（保留输入映射） */
  reset(): void {
    const fresh = new World(this.level);
    this.players = fresh.players;
    this.diamonds = fresh.diamonds;
    this.platforms = fresh.platforms;
    this.levers = fresh.levers;
    this.plates = fresh.plates;
    this.box = fresh.box;
    this.phase = "playing";
    this.timerMs = 0;
    this.platformPrev.clear();
    for (const role of ROLES) {
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

    // 1) 平台移动（先于玩家，产生位移用于载具）。target 0=高位端(def)，target 1=下沉端(def−(dx,dy))
    for (const pl of this.platforms) {
      const tx = pl.target === 0 ? pl.def.x : pl.def.x - pl.def.dx;
      const ty = pl.target === 0 ? pl.def.y : pl.def.y - pl.def.dy;
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
      for (const role of ROLES) {
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

    // 2.5) 按钮板（原版语义：被存活玩家或推箱压住 → 组平台到端点 B；无人压 → 回端点 A）
    if (this.plates.length > 0) {
      const pressedGroups = new Set<number>();
      const plateGroups = new Set(this.plates.map((pt) => pt.def.group));
      for (const pt of this.plates) {
        pt.pressed = false;
        for (const role of ROLES) {
          const pl = this.players[role];
          if (pl.alive && overlap(plRect(pl), pt.def.rect)) {
            pt.pressed = true;
            break;
          }
        }
        if (!pt.pressed && this.box && overlap(this.box, pt.def.rect)) pt.pressed = true;
        if (pt.pressed) pressedGroups.add(pt.def.group);
      }
      for (const pf of this.platforms) {
        if (pf.def.group !== undefined && plateGroups.has(pf.def.group)) {
          pf.target = pressedGroups.has(pf.def.group) ? 1 : 0;
        }
      }
    }

    // 2.7) 推箱：重力下落 + 与地形/平台/边界解算（玩家推挤在玩家位移阶段处理）
    if (this.box) {
      const b = this.box;
      b.vy = Math.min(b.vy + P.gravity * dt, P.maxFall);
      b.y += b.vy * dt;
      b.grounded = false;
      for (const r of this.solidsFor(b.x, b.y, b.w, b.h)) {
        if (!overlap(b, r)) continue;
        if (b.vy > 0) {
          b.y = r.y - b.h;
          b.grounded = true;
        } else if (b.vy < 0) {
          b.y = r.y + r.h;
        }
        b.vy = 0;
      }
    }

    // 3) 玩家
    for (const role of ROLES) {
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
      // X 阶段不含推箱：撞到推箱时改为推行（见下方推挤逻辑）
      const solids = this.solidsNear(pl);
      pl.x += pl.vx * dt;
      for (const r of solids) {
        if (!overlap(plRect(pl), r)) continue;
        // 自动上台阶：贴地行走撞上 ≤stepHeight 的矮台且头顶无遮挡 → 抬升走上去
        // （原版此处是 45° 整格斜坡可直接走上，本内核以整格实心+自动上台阶复现同一可走性）
        const lift = pl.y + P.playerH - r.y;
        if (pl.grounded && lift > 0 && lift <= P.stepHeight) {
          const lifted = { x: pl.x, y: r.y - P.playerH, w: P.playerW, h: P.playerH };
          if (!solids.some((o) => o !== r && overlap(lifted, o))) {
            pl.y = lifted.y;
            continue;
          }
        }
        if (pl.vx > 0) pl.x = r.x - P.playerW;
        else if (pl.vx < 0) pl.x = r.x + r.w;
        pl.vx = 0;
      }
      // 推挤推箱：玩家嵌入箱子则推动箱子同样的位移，再贴回箱子边缘
      if (this.box && pl.vx !== 0) {
        const b = this.box;
        const pr = plRect(pl);
        if (overlap(pr, b)) {
          if (pl.vx > 0) {
            this.moveBoxX(pr.x + pr.w - b.x);
            pl.x = b.x - P.playerW;
          } else {
            this.moveBoxX(-(b.x + b.w - pr.x));
            pl.x = b.x + b.w;
          }
          pl.vx = 0;
        }
      }
      // Y 阶段：推箱同为实心（可站立）
      if (this.box) solids.push({ ...this.box });
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

  /** 推行推箱：位移后与地形解算，撞墙则停在墙上 */
  private moveBoxX(dx: number): void {
    const b = this.box;
    if (!b || dx === 0) return;
    b.x += dx;
    for (const r of this.solidsFor(b.x, b.y, b.w, b.h)) {
      if (!overlap({ x: b.x, y: b.y, w: b.w, h: b.h }, r)) continue;
      b.x = dx > 0 ? r.x - b.w : r.x + r.w;
    }
  }

  private solidsFor(x: number, y: number, w: number, h: number): Rect[] {
    const out: Rect[] = [];
    const { tile, solid, liquid, cols, rows, widthPx, heightPx } = this.level;
    const t = tile;
    const x0 = Math.max(0, Math.floor((x - t) / t));
    const x1 = Math.min(cols - 1, Math.floor((x + w + t) / t));
    const y0 = Math.max(0, Math.floor((y - t) / t));
    const y1 = Math.min(rows - 1, Math.floor((y + h + t) / t));
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        const i = cy * cols + cx;
        if (solid[i]) {
          out.push({ x: cx * t, y: cy * t, w: t, h: t });
        } else if (liquid[i]) {
          // 液体格：下半格实心（对应原版半高池底蒙版）——免疫角色蹚水时站进去、没腰
          out.push({ x: cx * t, y: cy * t + t / 2, w: t, h: t / 2 });
        }
      }
    }
    for (const pf of this.platforms) out.push({ x: pf.x, y: pf.y, w: pf.def.w, h: pf.def.h });
    // 边界墙（四周封闭，底部兜底防坠出世界）
    out.push({ x: -t, y: -t, w: t, h: heightPx + 2 * t });
    out.push({ x: widthPx, y: -t, w: t, h: heightPx + 2 * t });
    out.push({ x: -t, y: heightPx, w: widthPx + 2 * t, h: t });
    return out;
  }

  private solidsNear(pl: PlayerSim): Rect[] {
    return this.solidsFor(pl.x, pl.y, P.playerW, P.playerH);
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
