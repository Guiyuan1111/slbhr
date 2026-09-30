/**
 * 游戏渲染场景：
 * - 从 @fw/shared 的 LevelData 构建静态视觉层（地面/门/钻石/拉杆/液体）
 * - 每帧读取 Colyseus 状态做平滑插值（自己快、对方慢），推导动画
 * - 服务器是唯一权威：本场景不做任何物理
 */
import Phaser from "phaser";
import { ROLES, type LevelData, type Role } from "@fw/shared";
import type { Net } from "../net";
import { ATLAS_CHARS, ATLAS_GROUND, ATLAS_MECH, IMG_BG, PLAYER_SCALE, SHEET_CHARS_TILES, SHEET_GROUND_TILES } from "./BootScene";

export interface GameInit {
  net: Net;
  level: LevelData;
}

interface PlayerView {
  legs: Phaser.GameObjects.Sprite;
  head: Phaser.GameObjects.Sprite;
  smoke: Phaser.GameObjects.Sprite;
  rx: number; // 平滑后的脚底中心 x
  ry: number; // 平滑后的脚底 y
  anim: string;
  alive: boolean;
}

const LIQUID_VISUALS = ["", "liquid_water", "liquid_lava", "liquid_green"] as const;
const LIQUID_FRAME = ["", "WaterBox0000", "FireBox0000", "GreenBox0000"] as const;
/** 液体贴图帧高（47/50px），缩放到瓦片高 */
const LIQUID_SCALE = 32 / 50;

export class GameScene extends Phaser.Scene {
  private d!: GameInit;
  private myRole: Role | null = null;
  private views = new Map<Role, PlayerView>();
  private diamondSprites = new Map<string, Phaser.GameObjects.Image>();
  private platformSprites = new Map<string, Phaser.GameObjects.Image>();

  constructor() {
    super("Game");
  }

  init(data: GameInit): void {
    this.d = data;
    this.views.clear();
    this.diamondSprites.clear();
    this.platformSprites.clear();
  }

  create(): void {
    const { level } = this.d;
    this.cameras.main.setBounds(0, 0, level.widthPx, level.heightPx);

    // 背景（官方神庙底图）
    this.add.image(0, 0, IMG_BG).setOrigin(0);

    this.buildGround(level);
    this.buildDoors(level);
    this.buildDiamonds(level);
    this.buildLevers(level);
    this.buildPlatforms(level);
    this.buildPlayers(level);
  }

  /** 地面：Ground.png 原始花纹 + 液体动画精灵覆盖 */
  private buildGround(level: LevelData): void {
    const rt = this.add.renderTexture(0, 0, level.widthPx, level.heightPx).setOrigin(0).setDepth(0);
    rt.beginDraw();
    for (let i = 0; i < level.ground.length; i++) {
      const gid = level.ground[i];
      if (!gid) continue;
      const cx = (i % level.cols) * level.tile;
      const cy = Math.floor(i / level.cols) * level.tile;
      rt.drawFrame(SHEET_GROUND_TILES, gid - 1, cx, cy);
    }
    rt.endDraw();

    // 液体动画
    for (let i = 0; i < level.liquid.length; i++) {
      const v = level.liquid[i];
      if (!v) continue;
      const cx = (i % level.cols) * level.tile + level.tile / 2;
      const cy = (Math.floor(i / level.cols) + 1) * level.tile;
      const s = this.add
        .sprite(cx, cy, ATLAS_GROUND, LIQUID_FRAME[v])
        .setOrigin(0.5, 1)
        .setScale(LIQUID_SCALE)
        .setDepth(1);
      s.playAfterDelay(LIQUID_VISUALS[v], Math.random() * 400);
    }
  }

  private buildDoors(level: LevelData): void {
    // charstiles 帧：2=火门 3=水门
    const doorFrame = { fireboy: 2, watergirl: 3 } as const;
    for (const role of ROLES) {
      const r = level.doors[role];
      this.add.image(r.x, r.y, SHEET_CHARS_TILES, doorFrame[role]).setOrigin(0).setDepth(1);
    }
  }

  private buildDiamonds(level: LevelData): void {
    // 帧：4红 5蓝 6银 7双色
    const frameOf = { red: 4, blue: 5, silver: 6, fbwg: 7 } as const;
    for (const d of level.diamonds) {
      const img = this.add
        .image(d.x, d.y, SHEET_CHARS_TILES, frameOf[d.kind])
        .setOrigin(0.5)
        .setScale(0.5)
        .setDepth(2);
      this.diamondSprites.set(d.id, img);
    }
  }

  private buildLevers(level: LevelData): void {
    for (const lv of level.levers) {
      const cx = lv.rect.x + lv.rect.w / 2;
      const cy = lv.rect.y + lv.rect.h / 2;
      this.add.image(cx, cy, ATLAS_MECH, "lever_base0000").setOrigin(0.5).setScale(32 / 110).setDepth(2);
      const stick = this.add
        .image(cx, cy, ATLAS_MECH, "lever_stick0000")
        .setOrigin(0.5)
        .setScale(32 / 108)
        .setDepth(2);
      stick.setData("leverId", lv.id);
      // M1：拉杆状态视觉简化为翻转，M3 用统一机制表驱动
    }
  }

  private buildPlatforms(level: LevelData): void {
    for (const p of level.platforms) {
      const img = this.add.image(p.x, p.y, ATLAS_MECH, "movingbox0000").setOrigin(0).setDepth(3);
      img.setDisplaySize(p.w, p.h);
      this.platformSprites.set(p.id, img);
    }
  }

  private buildPlayers(level: LevelData): void {
    for (const role of ROLES) {
      const s = level.spawn[role];
      const feetX = s.x + 13;
      const feetY = s.y + 56;
      const legs = this.add
        .sprite(feetX, feetY, ATLAS_CHARS, `${role === "fireboy" ? "fire" : "water"}_legs_idle0000`)
        .setOrigin(0.5, 1)
        .setScale(PLAYER_SCALE)
        .setDepth(4);
      const head = this.add
        .sprite(feetX, feetY + 10 * PLAYER_SCALE, ATLAS_CHARS, `${role === "fireboy" ? "fire" : "water"}_head_idle0000`)
        .setOrigin(0.5, 1)
        .setScale(PLAYER_SCALE)
        .setDepth(5);
      const smoke = this.add
        .sprite(feetX, feetY - 10, ATLAS_CHARS, "death_smoke0000")
        .setOrigin(0.5, 1)
        .setScale(0.6)
        .setDepth(6)
        .setVisible(false);
      smoke.on(Phaser.Animations.Events.ANIMATION_COMPLETE, () => smoke.setVisible(false));
      legs.play(`${role === "fireboy" ? "fire" : "water"}_legs_idle`);
      head.play(`${role === "fireboy" ? "fire" : "water"}_idle`);
      this.views.set(role, { legs, head, smoke, rx: feetX, ry: feetY, anim: "idle", alive: true });
    }
  }

  setMyRole(role: Role): void {
    this.myRole = role;
  }

  update(time: number, delta: number): void {
    void time;
    const st = this.d.net.room?.state;
    if (!st) return;

    // 玩家平滑与动画
    for (const role of ROLES) {
      const view = this.views.get(role);
      const ps = st.players?.get?.(role);
      if (!view) continue;
      if (!ps) {
        view.legs.visible = false;
        view.head.visible = false;
        continue;
      }
      view.legs.visible = true;
      view.head.visible = true;
      const tx = ps.x + 13;
      const ty = ps.y + 56;
      // 帧率无关指数平滑：自己跟手（更快），对方稍缓
      const rate = role === this.myRole ? 22 : 12;
      const k = 1 - Math.exp((-rate * delta) / 1000);
      view.rx += (tx - view.rx) * k;
      view.ry += (ty - view.ry) * k;
      const headLift = 10 * PLAYER_SCALE;
      view.legs.setPosition(view.rx, view.ry);
      view.head.setPosition(view.rx, view.ry + headLift);
      view.smoke.setPosition(view.rx, view.ry - 10);

      const flip = ps.facing < 0;
      view.legs.setFlipX(flip);
      view.head.setFlipX(flip);

      // 死亡/复活
      if (view.alive && !ps.alive) {
        view.legs.visible = false;
        view.head.visible = false;
        view.smoke.setVisible(true).play("smoke");
      } else if (!view.alive && ps.alive) {
        view.legs.visible = true;
        view.head.visible = true;
        view.smoke.setVisible(false).stop();
      }
      view.alive = ps.alive;
      if (!ps.alive) continue;

      // 动画切换
      if (view.anim !== ps.anim) {
        view.anim = ps.anim;
        const p = role === "fireboy" ? "fire" : "water";
        switch (ps.anim) {
          case "run":
            view.legs.play(`${p}_legs_run`);
            view.head.play(`${p}_idle`);
            break;
          case "jump":
            view.legs.play(`${p}_legs_idle`);
            view.head.play(`${p}_jump`);
            break;
          case "fall":
            view.legs.play(`${p}_legs_idle`);
            view.head.play(`${p}_fall`);
            break;
          default:
            view.legs.play(`${p}_legs_idle`);
            view.head.play(`${p}_idle`);
        }
      }
    }

    // 钻石收集
    st.diamonds?.forEach?.((ds: { collected: boolean }, id: string) => {
      const img = this.diamondSprites.get(id);
      if (img) img.setVisible(!ds.collected);
    });

    // 平台位置（服务端匀速移动，直接跟随即可）
    st.platforms?.forEach?.((ps: { x: number; y: number }, id: string) => {
      const img = this.platformSprites.get(id);
      if (img) img.setPosition(ps.x, ps.y);
    });
  }
}
