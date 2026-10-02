/**
 * 游戏渲染场景（按原版 output/A 的逆向配方 1:1 复刻，报告见 note/）：
 *
 * 原版层序（自底向上，root 内）：
 *   background(背景平铺+门) → tutorial → underGround(钻石/平台/推块) →
 *   ground(岩壁蒙版合成) → overGround(拉杆) → chars(角色) →
 *   decorations(前景植物) → liquids(液体) → dust → ui(时钟)
 *
 * 坐标系：世界 = 关卡 (1248×928) 四周各扩 32px 边距 → 1312×992，内容统一 +PAD。
 * 地面 = ForeGround0000 岩壁纹理 × MaskBox 蒙版（每格随机 4 变体），叠加
 * 3.5px 黑外描边与右下 8px 软投影——用 2D canvas 合成后一次性贴上，等价原版
 * BitmapData + 三滤镜管线。服务器是唯一权威：本场景不做任何物理。
 */
import Phaser from "phaser";
import { ROLES, type LevelData, type Role } from "@fw/shared";
import type { Net } from "../net";
import { ATLAS_CHARS, ATLAS_GROUND, ATLAS_MECH, ATLAS_MENU, ATLAS_POPUP, ATLAS_TEMPLE, PLAYER_SCALE } from "./BootScene";

export interface GameInit {
  net: Net;
  level: LevelData;
}

/** 关卡四周留白（原版 groundTexture 1312×992 @(-32,-32) 实测） */
const PAD = 32;
/** 关卡倒计时（原版时钟 2:00 起倒） */
const LEVEL_SECONDS = 120;
/** 角色组锚点=帧中心；足圆心在锚点下方 28.8px（0.95 标定），换算 0.4 比例 */
const FEET_TO_CENTER = Math.round((28.8 * PLAYER_SCALE) / 0.95);
/** 机关组色（原版 Device.groupColors），用于点亮贴图 tint */
const GROUP_COLORS: Record<number, number> = {
  1: 0xff0000, 2: 0x00cc00, 3: 0x0d3eff, 4: 0xffff00, 5: 0xec0ef1, 6: 0x57beff, 7: 0x9933ff,
};

const EMPTY_TYPE = -99;
const LIQUID_FAMILY = ["", "WaterBox", "FireBox", "GreenBox"] as const;
const DIAMOND_FRAME: Record<string, string> = {
  red: "diamond_fb0000",
  blue: "diamond_wg0000",
  silver: "diamond_silver0000",
  fbwg: "diamond_fbwg0000",
};

interface PlayerView {
  glow: Phaser.GameObjects.Image;
  legs: Phaser.GameObjects.Sprite;
  head: Phaser.GameObjects.Sprite;
  smoke: Phaser.GameObjects.Sprite;
  cx: number; // 平滑后的角色组中心 x
  cy: number; // 平滑后的角色组中心 y
  anim: string;
  alive: boolean;
}

/** 可复现的伪随机（原版装饰撒点用固定种子 seedrandom("ASDFA")） */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class GameScene extends Phaser.Scene {
  private d!: GameInit;
  private myRole: Role | null = null;
  private views = new Map<Role, PlayerView>();
  private diamondSprites = new Map<string, Phaser.GameObjects.Image>();
  private platformViews = new Map<string, Phaser.GameObjects.Container>();
  private boxView: Phaser.GameObjects.Image | null = null;
  private doorSprites = new Map<Role, Phaser.GameObjects.Sprite>();
  private doorOpen = new Map<Role, boolean>();
  private clockText!: Phaser.GameObjects.Text;
  private redHudText!: Phaser.GameObjects.Text;
  private blueHudText!: Phaser.GameObjects.Text;
  private redTotal = 0;
  private blueTotal = 0;
  private finished = false;
  private finishShown = false;

  constructor() {
    super("Game");
  }

  init(): void {
    // 场景 settings.data 默认 {}（非空），不可靠——统一从全局句柄取（main.ts 注入）
    const d = (globalThis as unknown as Record<string, GameInit | undefined>).__fwInit;
    if (!d) throw new Error("[fw] 缺少 __fwInit（main.ts 未注入场景数据）");
    this.d = d;
    this.views.clear();
    this.diamondSprites.clear();
    this.platformViews.clear();
    this.doorSprites.clear();
    this.doorOpen.clear();
    this.finished = false;
    this.finishShown = false;
    this.myRole = this.d.net.myRole ?? this.myRole;
  }

  create(): void {
    const { level } = this.d;
    const worldW = level.widthPx + PAD * 2;
    const worldH = level.heightPx + PAD * 2;
    this.cameras.main.setBounds(0, 0, worldW, worldH);

    for (const d of level.diamonds) {
      if (d.kind === "red") this.redTotal++;
      else if (d.kind === "blue") this.blueTotal++;
    }

    // background：BackGround 256×256 砖纹只铺关卡本体（原版 tileSprite(0,0,1248,928)，边距留黑）
    this.add
      .tileSprite(PAD, PAD, level.widthPx, level.heightPx, ATLAS_TEMPLE, "BackGround0000")
      .setOrigin(0)
      .setDepth(0);

    this.buildDoors(level); // 原版门挂在 background 层（背景之上、地面之下）
    this.buildTutorial(level);
    this.buildDiamonds(level);
    this.buildMechs(level);
    this.buildGround(level);
    this.buildPlayers(level);
    this.buildDecorations(level);
    this.buildLiquids(level);
    this.buildDust(level);
    this.buildHud(level);

    this.sound.stopByKey("bgm_level");
    this.sfx("bgm_level", { loop: true, volume: 0.35 });
  }

  /** 播音频（键未入缓存时静默跳过：音频缺失不应炸掉整个场景更新循环） */
  private sfx(key: string, opts?: Phaser.Types.Sound.SoundConfig): void {
    if (this.cache.audio.exists(key)) this.sound.play(key, opts);
  }

  /** 地面：岩壁纹理 × 蒙版合成 + 黑外描边 + 右下软投影（canvas 一次性合成） */
  private buildGround(level: LevelData): void {
    const W = level.widthPx + PAD * 2;
    const H = level.heightPx + PAD * 2;
    const { tile, cols, rows } = level;
    const gtex = this.textures.get(ATLAS_GROUND);
    const gimg = gtex.getSourceImage() as HTMLImageElement;
    const stamp = (ctx: CanvasRenderingContext2D, name: string, cx: number, cy: number): void => {
      const f = gtex.get(name);
      if (!f || !f.cutWidth) return;
      // 帧中心 = 格中心 + 32 边距（原版 drawTile 公式）
      ctx.drawImage(gimg, f.cutX, f.cutY, f.cutWidth, f.cutHeight, cx + PAD - f.cutWidth / 2, cy + PAD - f.cutHeight / 2, f.cutWidth, f.cutHeight);
    };

    // 1) 蒙版：每格按类型盖 MaskBox（实心随机 4 变体；液体行首尾换端盖）
    const mask = document.createElement("canvas");
    mask.width = W;
    mask.height = H;
    const mc = mask.getContext("2d")!;
    const rnd = mulberry32(0x1a2b3c);
    const typeAt = (i: number): number => level.groundTypes[i];
    for (let cy = 0; cy < rows; cy++) {
      for (let cx = 0; cx < cols; cx++) {
        const i = cy * cols + cx;
        const t = typeAt(i);
        if (t === EMPTY_TYPE) continue;
        const px = cx * tile + tile / 2;
        const py = cy * tile + tile / 2;
        if (t === 0 || t === 10 || t === 11 || t === 12 || t === -1) {
          // 实心（10/11/12 归一为 0；-1 装饰空砖只画不建刚体）；帧名 5 位数字
          stamp(mc, `MaskBox0000${Math.floor(rnd() * 4)}`, px, py);
        } else if (t >= 1 && t <= 9) {
          stamp(mc, `MaskBox${t}0000`, px, py);
        }
      }
      // 液体行：首格 MaskBox8、末格 MaskBox9、中间 MaskBox5/6/7（池底半高）
      let run = 0;
      for (let cx = 0; cx <= cols; cx++) {
        const t = cx < cols ? typeAt(cy * cols + cx) : EMPTY_TYPE;
        const isLiq = t === 5 || t === 6 || t === 7;
        if (isLiq) {
          run++;
          continue;
        }
        if (run > 0) {
          const a = cx - run;
          const b = cx - 1;
          const mid = `MaskBox${typeAt(cy * cols + a)}0000`;
          stamp(mc, "MaskBox80000", a * tile + tile / 2, cy * tile + tile / 2);
          for (let k = a + 1; k < b; k++) stamp(mc, mid, k * tile + tile / 2, cy * tile + tile / 2);
          if (b > a) stamp(mc, "MaskBox90000", b * tile + tile / 2, cy * tile + tile / 2);
          run = 0;
        }
      }
    }

    // 2) 岩壁纹理平铺整幅，再用蒙版裁形（等价原版 alphaMask）
    const rock = document.createElement("canvas");
    rock.width = W;
    rock.height = H;
    const rc = rock.getContext("2d")!;
    const ttex = this.textures.get(ATLAS_TEMPLE);
    const tf = ttex.get("ForeGround0000");
    const timg = ttex.getSourceImage() as HTMLImageElement;
    for (let y = 0; y < H; y += 256) {
      for (let x = 0; x < W; x += 256) {
        rc.drawImage(timg, tf.cutX, tf.cutY, tf.cutWidth, tf.cutHeight, x, y, tf.cutWidth, tf.cutHeight);
      }
    }
    rc.globalCompositeOperation = "destination-in";
    rc.drawImage(mask, 0, 0);

    // 3) 黑色剪影（描边/投影原料）
    const black = document.createElement("canvas");
    black.width = W;
    black.height = H;
    const bc = black.getContext("2d")!;
    bc.drawImage(mask, 0, 0);
    bc.globalCompositeOperation = "source-in";
    bc.fillStyle = "#000";
    bc.fillRect(0, 0, W, H);

    // 4) 合成：右下 8px 软投影(alpha .1) → 3.5px 黑外描边(膨胀近似) → 岩壁
    const final = document.createElement("canvas");
    final.width = W;
    final.height = H;
    const fc = final.getContext("2d")!;
    fc.globalAlpha = 0.1;
    fc.drawImage(black, 6, 6);
    fc.globalAlpha = 1;
    for (const [ox, oy] of [[3, 0], [-3, 0], [0, 3], [0, -3], [2, 2], [-2, 2], [2, -2], [-2, -2], [3, 3], [-3, 3], [3, -3], [-3, -3]] as const) {
      fc.drawImage(black, ox, oy);
    }
    fc.drawImage(rock, 0, 0);

    if (this.textures.exists("groundTex")) this.textures.remove("groundTex");
    this.textures.addCanvas("groundTex", final);
    this.add.image(0, 0, "groundTex").setOrigin(0).setDepth(2);
  }

  /** 钻石（underGround：地面之下，会被地形边缘稍遮；原尺寸 + ±5px 正弦浮动） */
  private buildDiamonds(level: LevelData): void {
    for (const d of level.diamonds) {
      const img = this.add
        .image(d.x + PAD, d.y + PAD - 5, ATLAS_CHARS, DIAMOND_FRAME[d.kind])
        .setOrigin(0.5)
        .setDepth(1);
      this.tweens.add({
        targets: img,
        y: img.y - 10,
        duration: 2000,
        yoyo: true,
        repeat: -1,
        ease: "Sine.inOut",
        delay: Math.random() * 2000,
      });
      this.diamondSprites.set(d.id, img);
    }
  }

  /**
   * 机关（贴图中心 = 对象矩形中心 + 边距，原版公式 x+32 / y−32）：
   * gid24=推块（underGround）、gid26=拉杆（overGround）、gid28=推箱（underGround）
   */
  private buildMechs(level: LevelData): void {
    const center = (r: { x: number; y: number; w: number; h: number }): { x: number; y: number } => ({
      x: r.x + r.w / 2 + PAD,
      y: r.y + r.h / 2 + PAD,
    });
    for (const m of level.mechProps) {
      const c = center(m.rect);
      // parseLevel 的 gid 是 Objects 图块集本地 id（原始 gid − firstgid 24）：
      // 本地 0=推块(原始24)、2=拉杆(26)、4=推箱(28)
      if (m.gid === 0) {
        // 推块：block 110×86 + 点亮层（tint 组色），underGround 层
        this.add.image(c.x, c.y, ATLAS_MECH, "pusher_block0000").setOrigin(0.5).setDepth(1.2);
        this.add
          .image(c.x, c.y, ATLAS_MECH, "pusher_block_light0000")
          .setOrigin(0.5)
          .setTint(GROUP_COLORS[Number(m.props.group ?? 2)] ?? 0xffffff)
          .setDepth(1.2);
      } else if (m.gid === 2) {
        // 拉杆：先杆后底座（底座盖住杆根），原版静止时杆向左倾（−31°，限位 ±36°）
        const dir = Number(m.props.startPos ?? -1) >= 0 ? 1 : -1;
        this.add.image(c.x + 2, c.y + 1, ATLAS_MECH, "lever_stick0000").setOrigin(0.5).setAngle(31 * dir).setDepth(3);
        this.add.image(c.x, c.y, ATLAS_MECH, "lever_base0000").setOrigin(0.5).setDepth(3);
      } else if (m.gid === 4) {
        this.boxView = this.add.image(c.x, c.y, ATLAS_MECH, "movingbox0000").setOrigin(0.5).setDepth(1.2);
      }
    }

    // 移动平台（underGround：从岩缝里伸出）：黄帽+中段+黄帽，整体 scale(1.05,0.95)
    for (const p of level.platforms) {
      const capScale = p.h / 48;
      const capL = this.add.image(-(p.w / 2 - 16), 0, ATLAS_MECH, "BarCapLeft0000").setOrigin(0.5).setScale(capScale);
      const capR = this.add.image(p.w / 2 - 16, 0, ATLAS_MECH, "BarCapRight0000").setOrigin(0.5).setScale(capScale);
      const mid = this.add.image(0, 0, ATLAS_MECH, "BarCenter0000").setOrigin(0.5);
      mid.scaleX = (p.w / 32 - 2) / 3; // 原版 scale.x=(宽格-2)/3
      const c = this.add
        .container(p.x + p.w / 2 + PAD, p.y + p.h / 2 + PAD, [capL, mid, capR])
        .setDepth(1.2)
        .setScale(1.05, 0.95);
      this.platformViews.set(p.id, c);
    }
  }

  /** 液体：每池 Left/中/Right 三段精灵 30fps，随机相位；整体下移 2px */
  private buildLiquids(level: LevelData): void {
    const { tile, cols, rows } = level;
    const animOf = ["", "water", "lava", "green"] as const;
    for (let cy = 0; cy < rows; cy++) {
      let run = 0;
      for (let cx = 0; cx <= cols; cx++) {
        const v = cx < cols ? level.liquid[cy * cols + cx] : 0;
        if (v > 0) {
          run++;
          continue;
        }
        if (run === 0) continue;
        const a = cx - run;
        const b = cx - 1;
        // v 此刻已归 0，液体族必须取自 run 起始格
        const type = level.liquid[cy * cols + a];
        const fam = LIQUID_FAMILY[type];
        const key = animOf[type];
        for (let k = a; k <= b; k++) {
          const pos = k === a ? "Left" : k === b && b > a ? "Right" : "";
          const s = this.add
            .sprite(k * tile + tile / 2 + PAD, cy * tile + tile / 2 + 2 + PAD, ATLAS_GROUND, `${fam}${pos}0000`)
            .setOrigin(0.5)
            .setDepth(7);
          s.playAfterDelay(`liquid_${key}${pos ? `_${pos.toLowerCase()}` : ""}`, Math.random() * 900);
        }
        run = 0;
      }
    }
  }

  /** 门：FinishBoy/Girl 0000 静帧，scale 0.8，anchor(0.5,0.99)，位置=(中心, 底边+4) */
  private buildDoors(level: LevelData): void {
    const frameOf: Record<Role, string> = { fireboy: "FinishBoy0000", watergirl: "FinishGirl0000" };
    for (const role of ROLES) {
      const r = level.doors[role];
      const s = this.add
        .sprite(r.x + r.w / 2 + PAD, r.y + r.h + 4 + PAD, ATLAS_TEMPLE, frameOf[role])
        .setOrigin(0.5, 0.99)
        .setScale(0.8)
        .setDepth(0.5);
      this.doorSprites.set(role, s);
    }
  }

  /**
   * 角色（chars 层）：原版 legs+head+glow 同心叠加（anchor 0.5 同点），
   * 组锚点在脚底上方 FEET_TO_CENTER 处；死亡烟在组内 (0,−22.4px) 等比。
   */
  private buildPlayers(level: LevelData): void {
    for (const role of ROLES) {
      const s = level.spawn[role];
      const feetX = s.x + 13 + PAD;
      const feetY = s.y + 56 + PAD;
      const cx = feetX;
      const cy = feetY - FEET_TO_CENTER;
      const p = role === "fireboy" ? "fire" : "water";
      const glow = this.add.image(cx, cy, ATLAS_CHARS, `${p}_glow0000`).setOrigin(0.5).setScale(PLAYER_SCALE).setAlpha(0.9).setDepth(4);
      const legs = this.add.sprite(cx, cy, ATLAS_CHARS, `${p}_legs_idle0000`).setOrigin(0.5).setScale(PLAYER_SCALE).setDepth(5);
      const head = this.add.sprite(cx, cy, ATLAS_CHARS, `${p}_head_idle0000`).setOrigin(0.5).setScale(PLAYER_SCALE).setDepth(5);
      const smoke = this.add.sprite(cx, cy - 9, ATLAS_CHARS, "death_smoke0000").setOrigin(0.5).setScale(PLAYER_SCALE).setDepth(5.5).setVisible(false);
      smoke.on(Phaser.Animations.Events.ANIMATION_COMPLETE, () => smoke.setVisible(false));
      legs.play(`${p}_legs_idle`);
      head.play(`${role}_idle`);
      this.views.set(role, { glow, legs, head, smoke, cx, cy, anim: "idle", alive: true });
    }
  }

  /** 前景装饰（decorations 层，在角色之上）：固定种子撒点 + 原版分派规则 */
  private buildDecorations(level: LevelData): void {
    const rnd = mulberry32(0x5eedfa); // ASDFA 的哈希种子（分布复刻，逐点位置无感知差异）
    const z = () => Math.round(3 * rnd() + 3.5); // 行列步进 4~6 格
    const { tile, cols, rows } = level;
    const typeAt = (cx: number, cy: number): number =>
      cx < 0 || cy < 0 || cx >= cols || cy >= rows ? EMPTY_TYPE : level.groundTypes[cy * cols + cx];
    const hasGid = (cx: number, cy: number): boolean => typeAt(cx, cy) !== EMPTY_TYPE;
    const deviceAt = (px: number, py: number): boolean =>
      level.mechProps.some((m) => px >= m.rect.x && px <= m.rect.x + m.rect.w && py >= m.rect.y && py <= m.rect.y + m.rect.h);

    let py = Math.floor(rnd() * 4);
    while (py < rows) {
      let px = Math.floor(rnd() * 4);
      while (px < cols) {
        // 在 +0..6 窗口内找第一个可撒点格子
        for (let k = 0; k <= 6; k++) {
          const cx = px + k;
          if (cx >= cols) break;
          const t = typeAt(cx, py);
          if (t === EMPTY_TYPE || deviceAt(cx * tile, py * tile)) continue;
          const left = hasGid(cx - 1, py);
          const right = hasGid(cx + 1, py);
          const top = hasGid(cx, py - 1);
          let frame: string | null = null;
          let flip = false;
          let rot = 0;
          if (t === 0) {
            if (left || right) {
              frame = `decor_O_${Math.floor(rnd() * 2) + 1}0000`; // 墙内裂纹
              if (rnd() < 0.5) rot = 90;
            } else if (top) {
              frame = "decor_X0000"; // 墙面苔藓，随机 90° 旋转
              rot = 90 * Math.floor(rnd() * 4);
            } else {
              frame = `decor_T_${Math.floor(rnd() * 3) + 1}0000`; // 地表植物
              flip = rnd() < 0.5;
            }
          } else if (t === 1 || t === 2) {
            frame = "decor_A0000"; // 藤蔓
            flip = t === 2;
          } else if (t === 3 || t === 4) {
            frame = "decor_V0000";
            flip = t === 4;
          }
          if (frame && this.textures.get(ATLAS_TEMPLE).has(frame)) {
            this.add
              .image(cx * tile + tile / 2 + PAD, py * tile + tile / 2 + PAD, ATLAS_TEMPLE, frame)
              .setOrigin(0.5)
              .setFlipX(flip)
              .setAngle(rot)
              .setDepth(6);
          }
          break; // 原版取窗口内第一个命中格
        }
        px += z();
      }
      py += z();
    }
  }

  /** 教学文字（tutorial 层：背景之上、钻石之下；淡金衬线 + 细描边） */
  private buildTutorial(level: LevelData): void {
    for (const t of level.tutorials) {
      this.add
        .text(t.x + PAD, t.y + PAD, t.text, {
          fontFamily: 'Georgia, "KaiTi", "STKaiti", "SimSun", serif',
          fontSize: "21px",
          color: "#efe6b0",
          stroke: "#241d0e",
          strokeThickness: 2,
          fontStyle: "bold",
        })
        .setOrigin(0, 0)
        .setDepth(0.8);
    }
  }

  /** 气尘（dust 层，液体之上）：黑暗区域漂浮的白色光点，原版 dust 层 */
  private buildDust(level: LevelData): void {
    const rnd = mulberry32(0xd057);
    for (let i = 0; i < 18; i++) {
      const x = PAD + rnd() * level.widthPx;
      const y = PAD + rnd() * level.heightPx;
      const s = this.add
        .image(x, y, ATLAS_GROUND, rnd() < 0.5 ? "Dust0000" : "BeamDust0000")
        .setOrigin(0.5)
        .setDepth(7.5)
        .setAlpha(0.3 + rnd() * 0.4);
      this.tweens.add({
        targets: s,
        y: y - 14 - rnd() * 20,
        alpha: 0.05,
        duration: 2600 + rnd() * 2600,
        repeat: -1,
        yoyo: true,
        ease: "Sine.inOut",
        delay: rnd() * 3000,
      });
    }
  }

  /** ui 层：顶部藤蔓时钟（倒计时 MM:SS）+ 左上角红/蓝钻石计数 */
  private buildHud(level: LevelData): void {
    const clockX = level.widthPx / 2 + PAD;
    this.add.image(clockX, 0, ATLAS_TEMPLE, "Clock0000").setOrigin(0.5, 0).setDepth(9);
    this.clockText = this.add
      .text(clockX, 62, "02:00", {
        fontFamily: 'Georgia, "Times New Roman", serif',
          fontSize: "24px",
          color: "#f3e6a8",
          stroke: "#1a140a",
          strokeThickness: 4,
          fontStyle: "bold",
        })
        .setOrigin(0.5)
        .setDepth(9);

    const counter = (x: number, frame: string, total: number): Phaser.GameObjects.Text => {
      this.add.image(x, 28, ATLAS_CHARS, frame).setOrigin(0.5).setScale(0.34).setDepth(9);
      const t = this.add
        .text(x + 26, 28, `0/${total}`, {
          fontFamily: 'Georgia, "Times New Roman", serif',
          fontSize: "20px",
          color: "#f5efd5",
          stroke: "#1a140a",
          strokeThickness: 4,
          fontStyle: "bold",
        })
        .setOrigin(0, 0.5)
        .setDepth(9);
      return t;
    };
    this.redHudText = counter(34, DIAMOND_FRAME.red, this.redTotal);
    this.blueHudText = counter(150, DIAMOND_FRAME.blue, this.blueTotal);
  }

  setMyRole(role: Role): void {
    this.myRole = role;
  }

  update(time: number, delta: number): void {
    void time;
    const st = this.d.net.room?.state;
    if (!st) return;

    // 倒计时（原版 2:00 起倒，归零停住）
    if (!this.finished) {
      const remain = Math.max(0, LEVEL_SECONDS * 1000 - (st.timerMs ?? 0));
      const s = Math.floor(remain / 1000);
      this.clockText.setText(`${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`);
    }

    for (const role of ROLES) {
      const view = this.views.get(role);
      const ps = st.players?.get?.(role);
      if (!view) continue;
      if (!ps) {
        view.glow.visible = view.legs.visible = view.head.visible = false;
        continue;
      }
      const tx = ps.x + 13 + PAD;
      const ty = ps.y + 56 + PAD - FEET_TO_CENTER;
      // 帧率无关指数平滑：自己跟手（更快），对方稍缓
      const rate = role === this.myRole ? 22 : 12;
      const k = 1 - Math.exp((-rate * delta) / 1000);
      view.cx += (tx - view.cx) * k;
      view.cy += (ty - view.cy) * k;
      view.glow.setPosition(view.cx, view.cy);
      view.legs.setPosition(view.cx, view.cy);
      view.head.setPosition(view.cx, view.cy);
      view.smoke.setPosition(view.cx, view.cy - 9);
      view.glow.visible = view.legs.visible = view.head.visible = ps.alive;
      const flip = ps.facing < 0;
      view.legs.setFlipX(flip);
      view.head.setFlipX(flip);

      // 死亡 → 烟 + 音效；复活 → 还原
      if (view.alive && !ps.alive) {
        view.smoke.setVisible(true).setPosition(view.cx, view.cy - 9).play("smoke");
        this.sfx("sfx_death", { volume: 0.55 });
      } else if (!view.alive && ps.alive) {
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
            view.head.play(`${role}_idle`);
            break;
          case "jump":
            view.legs.play(`${p}_legs_idle`);
            view.head.play(`${role}_jump`);
            if (role === this.myRole) this.sfx(role === "fireboy" ? "sfx_jump_fb" : "sfx_jump_wg", { volume: 0.45 });
            break;
          case "fall":
            view.legs.play(`${p}_legs_idle`);
            view.head.play(`${role}_fall`);
            break;
          default:
            view.legs.play(`${p}_legs_idle`);
            view.head.play(`${role}_idle`);
        }
      }

      // 门前开门（原版 0→21 帧，离开反向关门）
      const atDoor = ps.atDoor === true;
      const wasOpen = this.doorOpen.get(role) ?? false;
      if (atDoor && !wasOpen) {
        this.doorSprites.get(role)?.play(role === "fireboy" ? "door_fb_open" : "door_wg_open");
        this.sfx("sfx_door", { volume: 0.45 });
      } else if (!atDoor && wasOpen) {
        this.doorSprites.get(role)?.stop().setFrame(role === "fireboy" ? "FinishBoy0000" : "FinishGirl0000");
      }
      this.doorOpen.set(role, atDoor);
    }

    // 钻石收集：隐藏 + 音效（HUD 计数按定义色统计）
    st.diamonds?.forEach?.((ds: { collected: boolean }, id: string) => {
      const img = this.diamondSprites.get(id);
      if (!img) return;
      if (ds.collected && img.visible) {
        img.setVisible(false);
        this.sfx("sfx_diamond", { volume: 0.5 });
      }
    });
    this.redHudText.setText(`${countCollected(this.d, "red", this.redTotal)}/${this.redTotal}`);
    this.blueHudText.setText(`${countCollected(this.d, "blue", this.blueTotal)}/${this.blueTotal}`);

    // 平台跟随服务端（左上角 → 容器中心）
    st.platforms?.forEach?.((ps: { x: number; y: number }, id: string) => {
      const v = this.platformViews.get(id);
      if (!v) return;
      const def = this.d.level.platforms.find((x) => x.id === id);
      if (def) v.setPosition(ps.x + def.w / 2 + PAD, ps.y + def.h / 2 + PAD);
    });

    // 推箱跟随服务端（左上角 → 贴图中心）
    if (this.boxView && st.box) {
      const b = this.d.level.mechProps.find((m) => m.gid === 4);
      if (b) this.boxView.setPosition(st.box.x + b.rect.w / 2 + PAD, st.box.y + b.rect.h / 2 + PAD);
    }

    // 通关演出（原版：双门到位 → 停 BGM 播通关曲 → 黑罩 + 结算板滑入）
    if (st.phase === "finished") {
      if (!this.finished) {
        this.finished = true;
        this.sound.stopByKey("bgm_level");
        this.sfx("bgm_finish", { volume: 0.4 });
      }
      const bothIn = ROLES.every((r) => this.doorOpen.get(r) === true);
      if (bothIn && !this.finishShown) {
        this.finishShown = true;
        this.showFinishBoard();
      }
    }
  }

  /** 结算板（PopupAssets）：黑罩 → 板滑入 → 三行徽章 + 星级石碑 + 继续按钮 */
  private showFinishBoard(): void {
    const { level } = this.d;
    const W = level.widthPx + PAD * 2;
    const H = level.heightPx + PAD * 2;
    const cx = W / 2;
    const cy = H / 2;
    const layer = this.add.container(0, 0).setDepth(20);

    const shade = this.add.rectangle(cx, cy, W, H, 0x000000, 0);
    layer.add(shade);
    this.tweens.add({ targets: shade, fillAlpha: 0.7, duration: 500 });

    const board = this.add.image(cx, cy + 800, ATLAS_POPUP, "PopupBackground0000");
    board.setScale(Math.min(1, Math.min(W / board.width, H / board.height)));
    layer.add(board);
    this.tweens.add({ targets: board, y: cy, duration: 650, ease: "Cubic.Out" });

    // 三行：通关徽章 / 钻石 / 用时（收集数判定 ✓/✗）
    const top = cy - (board.height * board.scaleY) / 2;
    const rows: Array<{ frame: string; h: number; ok: boolean; value: string }> = [
      { frame: "FinishIcon0000", h: 107, ok: true, value: "" },
      { frame: "DiamondsIcon0000", h: 73, ok: this.collectedAll(), value: `${this.countGot()}/${this.d.level.diamonds.length}` },
      { frame: "TimeIcon0000", h: 73, ok: true, value: this.elapsedText() },
    ];
    let ry = top + 30;
    for (const r of rows) {
      layer.add(this.add.image(cx - 200, ry + r.h / 2, ATLAS_POPUP, r.frame));
      if (r.value) {
        layer.add(
          this.add
            .text(cx - 130, ry + r.h / 2, r.value, {
              fontFamily: 'Georgia, "Times New Roman", serif',
              fontSize: "26px",
              color: "#ffffff",
            })
            .setOrigin(0, 0.5),
        );
      }
      layer.add(this.add.image(cx + 120, ry + r.h / 2, ATLAS_POPUP, r.ok ? "TickIcon0000" : "CrossIcon0000"));
      ry += r.h + 46;
    }

    // 星级石碑 + 箭头（星级=钻石全收 3 / 过半 2 / 其余 1）
    const stars = this.collectedAll() ? 3 : this.countGot() > this.d.level.diamonds.length / 2 ? 2 : 1;
    const stone = this.add.sprite(cx + 180, cy - 60, ATLAS_POPUP, "FinishStone0000");
    layer.add(stone);
    stone.play(`finish_stone_${stars}`);
    const arrow = this.add.image(cx + 5, cy - 60, ATLAS_POPUP, "popupArrow0000");
    layer.add(arrow);
    this.tweens.add({ targets: arrow, x: "+=10", duration: 700, yoyo: true, repeat: -1, ease: "Sine.inOut" });

    // 继续按钮（原版石按钮；点击=再来一局）
    const btnY = top + board.height * board.scaleY - 60;
    const btn = this.add.image(cx, btnY, ATLAS_MENU, "StoneButton0000").setInteractive({ useHandCursor: true });
    const btnText = this.add
      .text(cx, btnY, "继续", {
        fontFamily: 'Georgia, "KaiTi", serif',
        fontSize: "24px",
        color: "#ffe9b0",
        fontStyle: "bold",
      })
      .setOrigin(0.5);
    layer.add([btn, btnText]);
    btn.on("pointerover", () => btn.setFrame("StoneButton0001"));
    btn.on("pointerout", () => btn.setFrame("StoneButton0000"));
    btn.on("pointerdown", () => this.restartLevel());
  }

  private collectedAll(): boolean {
    return this.countGot() >= this.d.level.diamonds.length;
  }

  private countGot(): number {
    const st = this.d.net.room?.state;
    if (!st) return 0;
    let got = 0;
    st.diamonds.forEach((ds: { collected: boolean }) => {
      if (ds.collected) got++;
    });
    return got;
  }

  private elapsedText(): string {
    const st = this.d.net.room?.state;
    const ms = Math.min(st?.timerMs ?? 0, LEVEL_SECONDS * 1000);
    const s = Math.floor(ms / 1000);
    return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
  }

  private restartLevel(): void {
    this.d.net.restart();
    this.scene.restart();
  }
}

function countCollected(d: GameInit, kind: "red" | "blue", cap: number): number {
  const st = d.net.room?.state;
  if (!st) return 0;
  let n = 0;
  st.diamonds.forEach((ds: { collected: boolean }, id: string) => {
    if (!ds.collected || n >= cap) return;
    const def = d.level.diamonds.find((x) => x.id === id);
    if (def && (def.kind === kind || def.kind === "fbwg")) n++;
  });
  return n;
}
