/**
 * 游戏渲染场景（按原版 output/A 的逆向配方复刻，报告见 note/）：
 *
 * 原版层序（自底向上，root 内）：
 *   background(背景平铺+门) → tutorial → underGround(钻石/平台/推块) →
 *   ground(岩壁蒙版合成) → overGround(拉杆/箱/球) → chars(角色) →
 *   decorations(前景植物) → liquids(液体/风) → ui(时钟)
 *
 * 坐标系：世界 = 关卡 (1248×928) 四周各扩 32px 边距 → 1312×992，内容统一 +PAD。
 * 数据源：LevelData v2（@fw/shared/level2，全机制解析）；运行时状态全部来自服务器
 * 快照（phase/players/diamonds/levers/pushers/platforms/props/winds/doors）——
 * 服务器是唯一权威，本场景不做任何玩法判定。
 * 快照角度约定：服务器统一发 -body.GetAngle()（物理弧度），客户端换算
 * Phaser 角（度）= -快照角·180/π（点反射映射保旋转方向，见 b2.ts 头注）。
 * 快照坐标约定：players/props/platforms 均为"屏幕像素中心坐标"（m2px 已换算），
 * 客户端直接 +PAD 使用，不再做 0.2.0 时代的 feet→center 换算。
 */
import Phaser from "phaser";
import { DOOR, ROLES, type Role } from "@fw/shared";
import type { LevelData, Rect } from "@fw/shared/level2";
import { AUDIO_GAME, loadAudioPack } from "../audio.js";
import type { FinishData, Net } from "../net";
import type { KeyboardInput } from "../input";
import { createSeedrandomFactory } from "../vendor/seedrandom.js";
import { ATLAS_CHARS, ATLAS_GROUND, ATLAS_MECH, ATLAS_MENU, ATLAS_POPUP, ATLAS_TEMPLE, FONT_MAIN, PLAYER_SCALE } from "./BootScene";
import { getSettings } from "../settings";

export interface GameInit {
  net: Net;
  level: LevelData;
  keyboard: KeyboardInput;
}

/** 关卡四周留白（原版 groundTexture 1312×992 @(-32,-32) 实测） */
const PAD = 32;
/** 机关组色（原版 Device.groupColors），用于点亮贴图 tint */
const GROUP_COLORS: Record<number, number> = {
  1: 0xff0000, 2: 0x00cc00, 3: 0x0d3eff, 4: 0xffff00, 5: 0xec0ef1, 6: 0x57beff, 7: 0x9933ff,
};

const EMPTY_TYPE = -99;
const LIQUID_ATLAS: Record<string, string> = { water: "WaterBox", lava: "FireBox", green: "GreenBox" };
const DIAMOND_FRAME: Record<string, string> = {
  red: "diamond_fb0000",
  blue: "diamond_wg0000",
  silver: "diamond_silver0000",
  fbwg: "diamond_fbwg0000",
};
/** 角色贴图前缀（动画键/帧名用 fire|water，角色标识用 fireboy|watergirl） */
const PREFIX: Record<Role, string> = { fireboy: "fire", watergirl: "water" };

interface PlayerView {
  glow: Phaser.GameObjects.Image;
  legs: Phaser.GameObjects.Sprite;
  head: Phaser.GameObjects.Sprite;
  smoke: Phaser.GameObjects.Sprite;
  cx: number; // 平滑后的角色组中心 x
  cy: number; // 平滑后的角色组中心 y
  anim: string;
  legsKey: string;
  dying: boolean;
}

interface LeverView {
  stick: Phaser.GameObjects.Image;
  stickLight: Phaser.GameObjects.Image;
  light: Phaser.GameObjects.Image;
  /** 支点（屏幕 px：质心−0.7m = 图块中心下方 4.8px） */
  pivotX: number;
  pivotY: number;
  /** 当前贴图角（Phaser 度） */
  angle: number;
  lightOn: boolean;
}

interface PusherView {
  block: Phaser.GameObjects.Image;
  light: Phaser.GameObjects.Image;
  state: number;
}

interface WindView {
  base: Phaser.GameObjects.Sprite;
  on: boolean;
  effect: Phaser.GameObjects.Sprite;
}

/** Navies 单只光点（原版 States/Common/Navies @1116883：极坐标正弦漂移） */
interface NavyItem {
  img: Phaser.GameObjects.Image;
  offsetCart: { x: number; y: number };
  offset: { r: number; theta: number };
  rprime: number;
  speed: { r: number; theta: number };
  pos: { r: number; theta: number };
}

interface TutorialItem {
  text: Phaser.GameObjects.Text;
  trigger: Rect | undefined;
  shown: boolean;
}

/** 可复现的伪随机（地面蒙版/装饰撒点用；原版装饰种子 seedrandom("ASDFA")——G12 待 0.3.1） */
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

function mmss(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

export class GameScene extends Phaser.Scene {
  private d!: GameInit;
  private myRole: Role | null = null;
  private views = new Map<Role, PlayerView>();
  private diamondSprites = new Map<string, Phaser.GameObjects.Image>();
  /** HUD/时钟缓存（Text.setText 无条件重绘 canvas 纹理，仅变化时写入防掉帧） */
  private lastClock = "";
  private diamondKinds = new Map<string, string>();
  private platformViews = new Map<string, Phaser.GameObjects.Container>();
  private leverViews = new Map<string, LeverView>();
  private pusherViews = new Map<string, PusherView>();
  private bodyViews = new Map<string, Phaser.GameObjects.Image>();
  private windViews = new Map<string, WindView>();
  private doorSprites = new Map<Role, Phaser.GameObjects.Sprite>();
  private doorFrames = new Map<Role, number>();
  private clockText!: Phaser.GameObjects.BitmapText;
  private redTotal = 0;
  private blueTotal = 0;
  private silverTotal = 0;
  private navyItems: NavyItem[] = [];
  private tutorialItems: TutorialItem[] = [];
  private stairsSprites = new Map<Role, Phaser.GameObjects.Sprite>();
  /** 通关演出/结算板状态 */
  private stairsPlayed = false;
  private finishData: FinishData | null = null;
  private finishLayer: Phaser.GameObjects.Container | null = null;
  private finishDelayEvent: Phaser.Time.TimerEvent | undefined;
  /** phase 差分（场景侧自算，net.onPhase 仅刷新 DOM HUD） */
  private prevPhase = "";
  /** ready 瞬移标记（跨图平滑会把角色从门口滑回出生点，E15/E1） */
  private snapPending = false;
  /** 原版限时（data/forest/temple.json 的 time 字段；取不到=不限时） */
  private templeTimeSec: number | null = null;
  /** temple.json 的关卡类型（general/speed/puzzle），bgm 选曲与星级口径用 */
  private templeType: string = "general";
  private waterPlaying = false;
  private platformPrev = new Map<string, { x: number; y: number }>();
  private platformMoving = new Set<string>();

  constructor() {
    super("Game");
  }

  preload(): void {
    // 游戏内音频懒装载（0.3.21 加载性能优化）：18 键 ≈2.8MB 从 Boot 挪到此处，
    // Menu/选关冷启动不再为其付出传输；建房（网络握手）期间并行下载。
    // 场景重启时 Loader 对已入缓存的键自动跳过，不会重复下载。
    loadAudioPack(this, AUDIO_GAME);
  }

  init(): void {
    // 场景 settings.data 默认 {}（非空），不可靠——统一从全局句柄取（main.ts 注入）
    const d = (globalThis as unknown as Record<string, GameInit | undefined>).__fwInit;
    if (!d) throw new Error("[fw] 缺少 __fwInit（main.ts 未注入场景数据）");
    this.d = d;
    this.views.clear();
    this.diamondSprites.clear();
    this.diamondKinds.clear();
    this.platformViews.clear();
    this.leverViews.clear();
    this.pusherViews.clear();
    this.bodyViews.clear();
    this.windViews.clear();
    this.doorSprites.clear();
    this.doorFrames.clear();
    this.navyItems = [];
    this.tutorialItems = [];
    this.stairsSprites.clear();
    this.stairsPlayed = false;
    this.finishData = null;
    this.finishLayer = null;
    this.finishDelayEvent = undefined;
    this.prevPhase = "";
    this.snapPending = false;
    this.templeTimeSec = null;
    this.waterPlaying = false;
    this.platformPrev.clear();
    this.platformMoving.clear();
    this.myRole = this.d.net.myRole ?? this.myRole;
  }

  create(): void {
    const { level } = this.d;
    // 相机：可视域 = 画布 1280×960，scroll=(16,16) → 屏幕 = 世界−16 = 关卡+16（原版 settled
    // 实测 stage=level+(16,16)，2026-10-09 帧探针）。此前 setBounds(32,32,1248,928) 小于视口，
    // 边界钳制把 centerOn 的 scroll(16,16) 压成 (32,32)，全场景整体上移 16px（地形顶实测 192 vs 原版 208）。
    // 边界改设画布全幅 (0,0,1312,992)：钳制区间 [0,32]，scroll 16 不再被吞。
    this.cameras.main.setBounds(0, 0, level.widthPx + PAD * 2, level.heightPx + PAD * 2);
    this.cameras.main.centerOn(level.widthPx / 2 + PAD, level.heightPx / 2 + PAD);

    for (const d of level.diamonds) {
      this.diamondKinds.set(d.id, d.kind);
      if (d.kind === "red") this.redTotal++;
      else if (d.kind === "blue") this.blueTotal++;
      else if (d.kind === "silver") this.silverTotal++;
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
    this.buildNavies(level); // 替换 0.2.0 臆造 buildDust（G13：森林从不出现 BeamDust/Dust）
    this.buildHud();
    this.fetchTempleTime(level.id);

    this.sound.stopByKey("bgm_level");
    this.sound.stopByKey("bgm_level_speed");
    this.sound.stopByKey("bgm_menu");
    this.sound.stopByKey("bgm_over");
    this.sfx(this.bgmKey(), { loop: true });

    // 场景晚于 phase 启动（如重连进 won 房）：补一次演出
    this.prevPhase = String(this.d.net.room?.state?.phase ?? "");
    if (this.prevPhase === "won") this.playStairsSequence();
  }

  /** 关卡 BGM 键：speed 关用专属曲（原版 preloadAudioFiles 按 levelData.type 换曲） */
  private bgmKey(): string {
    return this.templeType === "speed" ? "bgm_level_speed" : "bgm_level";
  }

  /** 播音频（键未入缓存时静默跳过：音频缺失不应炸掉整个场景更新循环） */
  private sfx(key: string, opts?: Phaser.Types.Sound.SoundConfig): void {
    if (!this.cache.audio.exists(key)) return;
    // 原版 settings.fx/music 分轨：BGM 受音乐开关、其余音效受音效开关
    if (key.startsWith("bgm")) {
      if (!getSettings().music) return;
    } else if (!getSettings().fx) return;
    this.sound.play(key, opts);
  }

  /** 原版限时（E17：EndMenu TimeIcon 的 limit 来自 temple.json 的 time 字段） */
  private fetchTempleTime(levelId: string): void {
    fetch("/data/forest/temple.json")
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { levels?: Array<{ filename?: string; time?: number; type?: string }> } | null) => {
        const entry = (j?.levels ?? []).find((lv) => String(lv?.filename ?? "").endsWith(`/${levelId}.json`));
        const t = Number(entry?.time);
        this.templeTimeSec = Number.isFinite(t) && t > 0 ? t : null;
        this.templeType = String(entry?.type ?? "general");
      })
      .catch(() => {
        this.templeTimeSec = null;
      });
  }

  /** 地面合成缓存（性能审计 #5：重开重进整段重付 ≈20.8MB 像素缓冲；键=levelId，单槽够用） */
  private static groundCache: { levelId: string; canvas: HTMLCanvasElement } | null = null;

  /** 地面：岩壁纹理 × 蒙版合成 + 黑外描边 + 右下软投影（canvas 一次性合成） */
  private buildGround(level: LevelData): void {
    if (GameScene.groundCache && GameScene.groundCache.levelId === this.d.level.id) {
      if (this.textures.exists("groundTex")) this.textures.remove("groundTex");
      this.textures.addCanvas("groundTex", GameScene.groundCache.canvas);
      this.add.image(0, 0, "groundTex").setOrigin(0).setDepth(2);
      return;
    }
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
    const typeAt = (i: number): number => level.groundType[i];
    for (let cy = 0; cy < rows; cy++) {
      for (let cx = 0; cx < cols; cx++) {
        const i = cy * cols + cx;
        const t = typeAt(i);
        if (t === EMPTY_TYPE) continue;
        const px = cx * tile + tile / 2;
        const py = cy * tile + tile / 2;
        if (t === 0 || t === 10 || t === 11 || t === 12 || t === -1) {
          // 实心（10/11/12 雪地变体解析期已 remap，留分支兜底；-1 装饰空砖只画不建刚体）
          stamp(mc, `MaskBox0000${Math.floor(rnd() * 4)}`, px, py);
        } else if (t >= 1 && t <= 4) {
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

    // 4) 合成：8px 高斯软投影(α.45, 零偏移) → 3.5px 黑外描边(膨胀近似) → 岩壁。
    //    原版 applyFilter 管线（1829279-1829390）：InlineFilter(3,red)+OutlineFilter(3.5,black)
    //    +ShadowFilter(8,0)——旧实现硬偏移(6,6) α.1 无模糊，边界带差实测 14px（x=140 列
    //    原版 398 vs 我方 384，2026-10-09）；InlineFilter 红色内缘在灰度实测不可辨，暂不近似
    const shadow = document.createElement("canvas");
    shadow.width = W;
    shadow.height = H;
    const sc = shadow.getContext("2d")!;
    sc.filter = "blur(8px)";
    sc.drawImage(black, 0, 0);
    const final = document.createElement("canvas");
    final.width = W;
    final.height = H;
    const fc = final.getContext("2d")!;
    fc.globalAlpha = 0.45;
    fc.drawImage(shadow, 0, 0);
    fc.globalAlpha = 1;
    for (const [ox, oy] of [[3, 0], [-3, 0], [0, 3], [0, -3], [2, 2], [-2, 2], [2, -2], [-2, -2], [3, 3], [-3, 3], [3, -3], [-3, -3]] as const) {
      fc.drawImage(black, ox, oy);
    }
    fc.drawImage(rock, 0, 0);

    if (this.textures.exists("groundTex")) this.textures.remove("groundTex");
    this.textures.addCanvas("groundTex", final);
    GameScene.groundCache = { levelId: this.d.level.id, canvas: final };
    this.add.image(0, 0, "groundTex").setOrigin(0).setDepth(2);
  }

  /** 钻石（underGround：地面之下，会被地形边缘稍遮；原尺寸 + ±5px 正弦浮动） */
  private buildDiamonds(level: LevelData): void {
    for (const d of level.diamonds) {
      const img = this.add
        .image(d.x + PAD, d.y + PAD - 5, ATLAS_CHARS, DIAMOND_FRAME[d.kind])
        .setOrigin(0.5)
        .setDepth(1);
      // 原版浮动带 = 中心 ±5px（38380-38393：sprite.y=-5 → tween y:+5）
      this.tweens.add({
        targets: img,
        y: img.y + 10,
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
   * 机关视图（贴图中心 = 对象矩形中心 + 边距）。运行时位姿全部由快照驱动（E13）：
   * levers{id→{group,state,angle}} / pushers{id→{group,state}} /
   * platforms|props{id→{x,y,angle}} / winds{id→{group,state}}。
   * 快照 key 是机关数组下标（"0","1",…；props 另带 kind 前缀），视图 key 是
   * LevelData v2 的 id（l0/b0/p0/x0/a0/f0），消费时按下标回映射。
   */
  private buildMechs(level: LevelData): void {
    // 推块（underGround）：block + 点亮层（tint 组色）。快照只有压下二值（state 0|1），
    // 贴图压下取 6px≈0.2m 阈值位移（原版 0.7m 连续行程二档化，冻结偏离 #5）
    for (const m of level.pushers) {
      const block = this.add.image(m.x + PAD, m.y + PAD, ATLAS_MECH, "pusher_block0000").setOrigin(0.5).setDepth(1.2);
      const light = this.add
        .image(m.x + PAD, m.y + PAD, ATLAS_MECH, "pusher_block_light0000")
        .setOrigin(0.5)
        .setTint(GROUP_COLORS[m.group] ?? 0xffffff)
        .setDepth(1.2);
      this.pusherViews.set(m.id, { block, light, state: 0 });
    }

    // 拉杆（overGround）：先杆后底座（底座盖住杆根）+ 亮灯层（lever_base_light_on/off）。
    // 初始角按 startPos（-1 → 左倾 -31°），运行时吃快照连续角
    // 拉杆（overGround）：原版杆/杆灯贴图中心 = body origin（图块中心），随杆角绕支点公转。
    // 支点 = 质心−0.7m = 图块中心下方 4.8px（质心=fixture 中心，在中心上 17.6px）。
    // 初始角按 startPos（±0.2π = ±36°），运行时吃快照连续角
    for (const m of level.levers) {
      const phi0 = (m.startPos >= 0 ? 1 : -1) * 36;
      const pivotX = m.x + PAD;
      const pivotY = m.y + 4.8 + PAD;
      const rad = (phi0 * Math.PI) / 180;
      const sx = pivotX + 4.8 * Math.sin(rad);
      const sy = pivotY - 4.8 * Math.cos(rad);
      const tint = GROUP_COLORS[m.group] ?? 0xffffff;
      const stick = this.add.image(sx, sy, ATLAS_MECH, "lever_stick0000").setOrigin(0.5).setAngle(phi0).setDepth(3);
      const stickLight = this.add
        .image(sx, sy, ATLAS_MECH, "lever_stick_light_off0000")
        .setOrigin(0.5)
        .setAngle(phi0)
        .setTint(tint)
        .setDepth(3.02);
      this.add.image(pivotX, m.y + PAD, ATLAS_MECH, "lever_base0000").setOrigin(0.5).setDepth(3);
      const light = this.add
        .image(pivotX, m.y + PAD, ATLAS_MECH, "lever_base_light_off0000")
        .setOrigin(0.5)
        .setTint(tint)
        .setDepth(3.05);
      this.leverViews.set(m.id, { stick, stickLight, light, pivotX, pivotY, angle: phi0, lightOn: false });
    }

    // 箱/球（overGround，原版 BoxedDevice/Ball）：movingbox0000 / boxheavy=movingbox20000（d07 字证）/ ball0000
    for (const b of level.boxes) {
      const img = this.add
        .image(b.x + PAD, b.y + PAD, ATLAS_MECH, b.heavy ? "movingbox20000" : "movingbox0000")
        .setOrigin(0.5)
        .setDepth(3);
      this.bodyViews.set(b.id, img);
    }
    for (const ball of level.balls) {
      const img = this.add.image(ball.x + PAD, ball.y + PAD, ATLAS_MECH, "ball0000").setOrigin(0.5).setDepth(3);
      this.bodyViews.set(ball.id, img);
    }

    // 移动平台（underGround：从岩缝里伸出）：黄帽+黄帽+中段+灯罩，整体 scale(1.05,0.95)。
    // 子序照原版（运行时探针 2026-10-09 forest_01 帧 60）：capL(−w/2+16)→capR(+w/2−16)→
    // center(0, scale.x=(格数−2)/3)→light(0,0, scale.x=(格数−1)/3, off 帧常显；on 态切帧属
    // 服务端状态语义，快照无平台 state，暂不接)
    for (const p of level.platforms) {
      const capScale = p.h / 48;
      const capL = this.add.image(-(p.w / 2 - 16), 0, ATLAS_MECH, "BarCapLeft0000").setOrigin(0.5).setScale(capScale);
      const capR = this.add.image(p.w / 2 - 16, 0, ATLAS_MECH, "BarCapRight0000").setOrigin(0.5).setScale(capScale);
      const mid = this.add.image(0, 0, ATLAS_MECH, "BarCenter0000").setOrigin(0.5);
      mid.scaleX = (p.w / 32 - 2) / 3; // 原版 scale.x=(宽格-2)/3
      const light = this.add.image(0, 0, ATLAS_MECH, "moving_platform_light_off0000").setOrigin(0.5);
      light.scaleX = (p.w / 32 - 1) / 3; // 原版 scale.x=(宽格-1)/3
      const c = this.add
        .container(p.x + p.w / 2 + PAD, p.y + p.h / 2 + PAD, [capL, capR, mid, light])
        .setDepth(1.2)
        .setScale(1.05, 0.95);
      this.platformViews.set(p.id, c);
    }

    // 风区机身（liquids 层，depth 7）：wind_base 0000..0003@30fps；state≠0 时播循环
    for (const w of level.winds) {
      const base = this.add
        .sprite(w.rect.x + w.rect.w / 2 + PAD, w.rect.y + w.rect.h / 2 + PAD, ATLAS_MECH, "wind_base0000")
        .setOrigin(0.5)
        .setDepth(7)
        .setAngle(w.rotation + 90); // 内核 bd.angle=π(rotation+90)/180，物理角=Phaser 角
      const effect = this.add
        .sprite(base.x, base.y + 8, ATLAS_MECH, "wind_effect0000")
        .setOrigin(0.5, 1)
        .setDepth(7.5)
        .setAngle(base.angle)
        .setVisible(false);
      effect.displayHeight = w.lengthM * 32;
      effect.play("wind_effect");
      effect.anims.setProgress(Math.random());
      effect.setVisible(false);
      this.windViews.set(w.id, { base, effect, on: false });
    }
  }

  /** props 快照 key（"box:0"/"boxheavy:2"/"ball:3"）→ 视图 key（x 下标 / a 下标-boxes 数） */
  private propViewKey(key: string): string | undefined {
    const i = key.indexOf(":");
    if (i < 0) return undefined;
    const kind = key.slice(0, i);
    const idx = Number(key.slice(i + 1));
    if (!Number.isFinite(idx)) return undefined;
    if (kind === "ball") return `a${idx - this.d.level.boxes.length}`;
    return `x${idx}`; // box / boxheavy 同数组（level.boxes 顺序）
  }

  /** 液体：LiquidRun 行段 Left/中/Right 三类精灵 30fps 同相位；整体下移 2px */
  private buildLiquids(level: LevelData): void {
    const { tile } = level;
    for (const run of level.liquidRuns) {
      const fam = LIQUID_ATLAS[run.kind] ?? "WaterBox";
      const single = run.col0 === run.col1;
      for (let k = run.col0; k <= run.col1; k++) {
        const pos = k === run.col0 ? (single ? "Left" : "Left") : k === run.col1 ? "Right" : "";
        const s = this.add
          .sprite(k * tile + tile / 2 + PAD, run.row * tile + tile / 2 + 2 + PAD, ATLAS_GROUND, `${fam}${pos}0000`)
          .setOrigin(0.5)
          .setDepth(7);
        // 原版三段液体同相位播放（bundle:38988-39006 无随机延迟）；width=1 时 Left/Right 同格叠放
        s.play(`liquid_${run.kind}${pos ? `_${pos.toLowerCase()}` : ""}`);
        if (single) {
          const cap = this.add
            .sprite(k * tile + tile / 2 + PAD, run.row * tile + tile / 2 + 2 + PAD, ATLAS_GROUND, `${fam}Right0000`)
            .setOrigin(0.5)
            .setDepth(7);
          cap.play(`liquid_${run.kind}_right`);
        }
      }
    }
  }

  /** 门：FinishBoy/Girl 0000 静帧，scale 0.8，anchor(0.5,0.99)，位置=(中心, 底边+4)；帧号由快照驱动 */
  private buildDoors(level: LevelData): void {
    const frameOf: Record<Role, string> = { fireboy: "FinishBoy0000", watergirl: "FinishGirl0000" };
    for (const role of ROLES) {
      const r = level.doors[role];
      // 原版 Door（38427-38440）：sprite 建于 (c=x+mpx(1)=中心, e+4)，anchor.y=0.99；Box2D
      // enable() 会把 anchor.x 设 0.5（运行时探针 2026-10-09 实测 ax=0.5）——故 origin=(0.5,0.99)，
      // x=中心。此前误转写为 x 锚 0（左缘对齐），门整体右移 33px（视觉门区 61-77% 差异簇根因）
      const s = this.add
        .sprite(r.x + r.w / 2 + PAD, r.y + r.h + 4 + PAD, ATLAS_TEMPLE, frameOf[role])
        .setOrigin(0.5, 0.99)
        .setScale(0.8)
        .setDepth(0.5);
      this.doorSprites.set(role, s);
    }
  }

  /**
   * 角色（chars 层）：原版 legs+head+glow 同心叠加（anchor 0.5 同点）。
   * 内核出生偏移 (+32,−32)px（character.ts 构造体），快照坐标即贴图中心。
   * 死亡烟：原版 _doKill 挂在角色容器 (0,−0.7m) = 中心上方 ≈21px（0.95 比例）；vx<0 时 scale.x=−1。
   */
  private buildPlayers(level: LevelData): void {
    for (const role of ROLES) {
      const s = level.spawn[role];
      const cx = s.x + PAD; // level2 spawn 已是图块中心（kernel 体中心同位）；此前 +32 为双重偏移
      const cy = s.y - 32 + PAD;
      const p = PREFIX[role];
      const glow = this.add.image(cx, cy, ATLAS_CHARS, `${p}_glow0000`).setOrigin(0.5).setScale(PLAYER_SCALE).setAlpha(0.9).setDepth(4);
      const legs = this.add.sprite(cx, cy, ATLAS_CHARS, `${p}_legs_idle0000`).setOrigin(0.5).setScale(PLAYER_SCALE).setDepth(5);
      const head = this.add.sprite(cx, cy, ATLAS_CHARS, `${p}_head_idle0000`).setOrigin(0.5).setScale(PLAYER_SCALE).setDepth(5);
      const smoke = this.add.sprite(cx, cy + 21, ATLAS_CHARS, "death_smoke0000").setOrigin(0.5).setScale(PLAYER_SCALE).setDepth(5.5).setVisible(false);
      smoke.on(Phaser.Animations.Events.ANIMATION_COMPLETE, () => smoke.setVisible(false));
      legs.play(`${p}_legs_idle`);
      head.play(`${p}_idle`);
      this.views.set(role, { glow, legs, head, smoke, cx, cy, anim: "idle", legsKey: `${p}_legs_idle`, dying: false });
    }
  }

  /**
   * 前景装饰（decorations 层）——原版 Ground.decorate 忠实移植（G12）。
   * 算法：seedrandom("ASDFA") 的 z()=round(3r+3.5) 行列步进 → 7×7 窗口搜索未占用/未选 tile →
   * 分派 decor_O(墙内)/X(苔藓)/A(藤蔓)/V(倒藤)/T(地表)（变体与旋转用 Math.random，原版亦然）。
   * 占位：BoxedDevice 家族（lever/pusher/box/ball）按中心 tile 标记 2×2 occupied。
   * 依据：note/evidence/init-js-regions/ground-region.js decorate 段。
   */
  private buildDecorations(level: LevelData): void {
    const { cols, rows, tile } = level;
    const rng = createSeedrandomFactory()("ASDFA");
    const z = () => Math.round(3 * rng() + 3.5);
    // 原版 ocupy：BoxedDevice 家族标记中心 tile 与上/左邻共 2×2
    const occupied = new Set<string>();
    const mark = (px: number, py: number): void => {
      const bx = Math.floor(px / 32);
      const by = Math.floor(py / 32);
      for (const [dx, dy] of [[0, 0], [-1, -1], [-1, 0], [0, -1]]) {
        const row = by + dy;
        const col = bx + dx;
        if (row >= 0 && row < rows && col >= 0 && col < cols) occupied.add(row + "," + col);
      }
    };
    for (const m of level.levers) mark(m.x, m.y);
    for (const m of level.pushers) mark(m.x, m.y);
    for (const b of level.boxes) mark(b.x, b.y);
    for (const b of level.balls) mark(b.x, b.y);
    const typeOf = (row: number, col: number): number | null => {
      if (row < 0 || col < 0 || row >= rows || col >= cols) return null;
      const t = level.groundType[row * cols + col];
      return t === EMPTY_TYPE ? null : t;
    };
    const key = (row: number, col: number): string => row + "," + col;
    const picked: Array<{ row: number; col: number }> = [];
    const pickedSet = new Set<string>();
    let K = 1;
    while (K < rows) {
      let J = 1;
      while (J < cols - 1) {
        let got = false;
        for (let l = 0; l <= 6 && !got; l++) {
          for (let m = 0; m <= 6; m++) {
            const h = Math.min(Math.max(J + l, 0), cols - 2);
            const i = Math.min(Math.max(K + m, 0), rows - 1);
            if (typeOf(i, h) === null) continue;
            if (occupied.has(key(i, h))) continue;
            if (
              pickedSet.has(key(i, h)) ||
              pickedSet.has(key(i - 1, h)) ||
              pickedSet.has(key(i, h + 1)) ||
              pickedSet.has(key(i - 1, h + 1)) ||
              pickedSet.has(key(i, h - 1)) ||
              pickedSet.has(key(i - 1, h - 1))
            ) {
              continue;
            }
            picked.push({ row: i, col: h });
            pickedSet.add(key(i, h));
            got = true;
            break;
          }
        }
        J += z();
      }
      K += z();
    }
    // 渲染分派（Math.random 仅用于变体/旋转——原版亦然）
    let w = 0;
    for (const d of picked) {
      const F = typeOf(d.row, d.col);
      const up = typeOf(d.row - 1, d.col);
      const right = typeOf(d.row, d.col + 1);
      const left = typeOf(d.row, d.col - 1);
      let G: string | null = null;
      let rot = 0;
      let flip = 1;
      let u = 1;
      if (F === 0 && up !== null && right !== null && left !== null) {
        G = `decor_O_${(w % 2) + 1}0000`;
      } else if (F !== 0 || up !== null) {
        if (F === 0) {
          G = "decor_X0000";
          rot = (Math.floor(Math.random() * 3) * Math.PI) / 2;
        } else if (F === 1) {
          G = "decor_A0000";
        } else if (F === 2) {
          G = "decor_A0000";
          flip = -1;
        } else if (F === 3) {
          G = "decor_V0000";
        } else if (F === 4) {
          G = "decor_V0000";
          flip = -1;
        }
      } else {
        G = `decor_T_${(w % 3) + 1}0000`;
        u = Math.random() < 0.5 ? -1 : 1;
      }
      w++;
      if (G && this.textures.get(ATLAS_TEMPLE).has(G)) {
        this.add
          .image((d.col + 0.5) * tile + PAD, (d.row + 0.5) * tile + PAD, ATLAS_TEMPLE, G)
          .setOrigin(0.5)
          .setFlipX(u * flip < 0)
          .setAngle(rot)
          .setDepth(6);
      }
    }
  }

  private buildTutorial(level: LevelData): void {
    for (const step of level.tutorials) {
      if (!step.text || !step.textRect) continue;
      const text = this.add
        .text(step.textRect.x + PAD + step.textRect.w / 2, step.textRect.y + PAD, step.text, {
          fontFamily: 'Georgia, "KaiTi", "STKaiti", "SimSun", serif',
          fontSize: "19px",
          color: "#efe6b0",
          stroke: "#241d0e",
          strokeThickness: 2,
          fontStyle: "bold",
          wordWrap: { width: step.textRect.w, useAdvancedWrap: true },
          align: "center",
        })
        .setOrigin(0.5, 0)
        .setDepth(0.8)
        .setVisible(false)
        .setAlpha(0);
      this.tutorialItems.push({ text, trigger: step.trigger, shown: false });
    }
  }

  /** 教学渐显判定（冻结偏离 #4：按本机角色；原版=任一角色进矩形，结构上可直接扩展） */
  private updateTutorial(...points: Array<{ x: number; y: number }>): void {
    for (const item of this.tutorialItems) {
      const hit = points.some((p) => p.x >= item.trigger!.x && p.x <= item.trigger!.x + item.trigger!.w && p.y >= item.trigger!.y && p.y <= item.trigger!.y + item.trigger!.h);
      const r = item.trigger;
      if (!r) continue;
      const inside = points.some((p) => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h);
      if (inside && !item.shown) {
        item.shown = true;
        item.text.setVisible(true).setAlpha(0);
        this.tweens.add({ targets: item.text, alpha: 1, duration: 400 });
      } else if (!inside && item.shown) {
        item.shown = false;
        this.tweens.add({ targets: item.text, alpha: 0, duration: 400, onComplete: () => item.text.setVisible(false) });
      }
    }
  }

  /**
   * Navies（overGround 层，depth 3.5）：原版 @1940249 spawn + @1116883 Navies 类逐字节复刻。
   * 取点（getNaviesPoints @1836428）：4 个种子点全部由行数导出（第 4 点与第 2 点重复是
   * 原版原样），沿随机 ±1 对角步进走到第一格空地（type 缺省 = groundType −99）即 valid。
   * 每组 2..4 只（floor(1+3·rand)+1，原版循环含端点），容器整体随机缩放 0.3+0.7·rand。
   */
  private buildNavies(level: LevelData): void {
    const { cols, rows, tile } = level;
    const seeds: Array<{ x: number; y: number }> = [
      { x: Math.floor(rows / 4), y: Math.floor(rows / 4) },
      { x: Math.floor((3 * rows) / 4), y: Math.floor(rows / 4) },
      { x: Math.floor(rows / 4), y: Math.floor((3 * rows) / 4) },
      { x: Math.floor((3 * rows) / 4), y: Math.floor(rows / 4) },
    ];
    const signOf = (v: number): number => (v > 0 ? 1 : v < 0 ? -1 : 0);
    for (const seed of seeds) {
      let x = seed.x;
      let y = seed.y;
      let valid = false;
      const sx = signOf(Math.random() - 0.5);
      const sy = signOf(Math.random() - 0.5);
      while (x > 0 && x < cols && y > 0 && y < rows) {
        if (level.groundType[y * cols + x] === EMPTY_TYPE) {
          valid = true;
          break;
        }
        x += sx;
        y += sy;
      }
      if (!valid) continue;
      const group = this.add.container(x * tile + PAD, y * tile + PAD).setDepth(3.5).setScale(0.3 + 0.7 * Math.random());
      const count = Math.floor(1 + 3 * Math.random()) + 1;
      for (let i = 0; i < count; i++) {
        const img = this.add.image(0, 0, ATLAS_MENU, "Navy0000").setOrigin(0.5).setScale(0.3 + 0.7 * Math.random());
        group.add(img);
        this.navyItems.push({
          img,
          offsetCart: { x: 200 * (Math.random() - 0.5), y: 50 * (Math.random() - 0.5) },
          offset: { r: 400 * Math.random(), theta: Math.random() },
          rprime: 0,
          speed: { r: 7e-4 + 5e-4 * Math.random(), theta: 3e-4 + 5e-4 * (Math.random() - 0.5) },
          pos: { r: Math.random(), theta: Math.random() * Math.PI * 2 },
        });
      }
    }
  }

  /** ui 层：顶部藤蔓时钟（正计时 MM:SS 真实秒，G14 去占位）+ 左上角红/蓝/银钻石计数 */
  private buildHud(): void {
    // HUD 挂相机（scrollFactor 0），坐标 = 视口系（关卡矩形内）
    const clockX = 640; // 画布 1280 的水平中心（原版 LevelUI 时钟位）
    // 原版 Clock 锚点 (0.5, 0.05)：盘面上探 5px；文字区在 y≈55-83（像素差分热图实证）
    this.add.image(clockX, 0, ATLAS_TEMPLE, "Clock0000").setOrigin(0.5, 0.05).setDepth(9).setScrollFactor(0);
    // 原版 LevelUI 右上暂停钮（渲染保真；联机暂停语义属服务端功能，此处仅视觉）
    // 原版 LevelUI 右上暂停钮（0.3.13 起接本机暂停：P 键/点击 → PauseMenu，本地停手语义）
    this.add
      .image(1265, 15, ATLAS_POPUP, "PauseButton0000")
      .setOrigin(1, 0)
      .setDepth(9)
      .setScrollFactor(0)
      .setInteractive({ useHandCursor: true })
      .on("pointerup", () => (globalThis as unknown as { __fwTogglePause?: () => void }).__fwTogglePause?.());
    // 原版 LevelUI/Clock：TempleAssets Clock0000 + font 位图字 24 号（bitmapText 基准 48 半缩放）
    this.clockText = this.add
      .bitmapText(clockX, 56, FONT_MAIN, "00:00", 24)
      .setOrigin(0.5, 0)
      .setDepth(9)
      .setScrollFactor(0);

    // 钻石计数迁出画布（原版游戏内无计数，仅通关结算面板有）→ DOM #hud-diamonds
    (globalThis as unknown as Record<string, unknown>).__fwHudTotals = { red: this.redTotal, blue: this.blueTotal, silver: this.silverTotal };
  }

  setMyRole(role: Role): void {
    this.myRole = role;
  }

  update(time: number, delta: number): void {
    void time;
    const st = this.d.net.room?.state;
    if (!st) return;

    // 时钟：真实正计时秒（服务端只在 started 步进内累计，won/gameover 天然冻结）
    const clockStr = mmss((Number(st.timerMs) || 0) / 1000);
    if (clockStr !== this.lastClock) { this.clockText.setText(clockStr); this.lastClock = clockStr; }

    // phase 差分（won 演出、ready 瞬移与整轮复位都挂在这里）
    const phase = String(st.phase ?? "");
    if (phase !== this.prevPhase) {
      const prev = this.prevPhase;
      this.prevPhase = phase;
      this.onPhaseChanged(prev, phase);
    }

    this.drainSfx();

    this.updatePlayers(st, delta);
    this.updateDiamonds(st);
    this.updateMechs(st);
    this.updatePlatformSound(st);

    // 教学渐显按本机角色（传世界坐标=快照中心+PAD，与触发矩形同域）
    const pts: Array<{ x: number; y: number }> = [];
    for (const role of ["fireboy", "watergirl"] as const) {
      const ps = st.players?.get?.(role);
      if (ps && ps.dying !== true) pts.push({ x: (Number(ps.x) || 0) + PAD, y: (Number(ps.y) || 0) + PAD });
    }
    if (pts.length > 0) this.updateTutorial(...pts);

    this.updateNavies();
    this.snapPending = false;
  }

  /** phase 迁移副作用（E15/E1/M9） */
  private onPhaseChanged(prev: string, cur: string): void {
    if (cur === "ready") this.resetRound(prev);
    if (cur === "won" && !this.stairsPlayed) this.playStairsSequence();
  }

  /** 整轮复位（重开=ready）：瞬移标记 + 清演出/门帧/烟，跨图平滑会把角色滑回出生点 */
  private resetRound(prev: string): void {
    this.snapPending = true;
    this.stairsPlayed = false;
    this.finishData = null;
    this.d.net.lastFinish = null;
    this.finishDelayEvent?.remove();
    this.finishDelayEvent = undefined;
    this.finishLayer?.destroy();
    this.finishLayer = null;
    this.doorFrames.clear();
    for (const role of ROLES) {
      this.doorSprites.get(role)?.setFrame(role === "fireboy" ? "FinishBoy0000" : "FinishGirl0000");
      this.stairsSprites.get(role)?.destroy();
      this.stairsSprites.delete(role);
      const view = this.views.get(role);
      if (view) {
        view.anim = "";
        view.legsKey = "";
        view.dying = false;
        view.smoke.setVisible(false).stop();
      }
    }
    this.stopWater();
    if (prev === "won" || prev === "gameover") {
      // 原版 retry=整状态重载：BGM 重新起（首次开局 prev=lobby/"" 不重播）
      this.sound.stopByKey("bgm_level");
      this.sound.stopByKey("bgm_level_speed");
      this.sound.stopByKey("bgm_over");
      this.sfx(this.bgmKey(), { loop: true });
    }
  }

  /** 通关演出（原版 animateFinish @1951222：停 BGM → levelMusicFinish → 双 animateStairs → 1600ms → 结算） */
  private playStairsSequence(): void {
    this.stairsPlayed = true;
    this.sound.stopByKey("bgm_level");
    this.sfx("bgm_finish");
    for (const role of ROLES) {
      const view = this.views.get(role);
      const door = this.d.level.doors[role];
      if (view) {
        // 原版 animateStairs：藏 head/legs（glow 随组隐藏），body 传送门口
        view.legs.visible = view.head.visible = view.glow.visible = false;
        view.smoke.setVisible(false).stop();
      }
      const p = PREFIX[role];
      const s = this.add
        .sprite(door.x + door.w / 2 + PAD, door.y + door.h + 4 + PAD, ATLAS_CHARS, `${p}_stairs0000`)
        .setOrigin(0.5, 1)
        .setScale(PLAYER_SCALE)
        .setDepth(5);
      this.tweens.add({ targets: s, scale: 0.76, duration: 360 }); // 原版组 0.95×0.8=0.76 / 360ms Linear
      s.play(`${p}_stairs`);
      this.stairsSprites.set(role, s);
    }
    this.finishDelayEvent = this.time.delayedCall(DOOR.finishDelayMs, () => {
      const fd = this.d.net.lastFinish;
      if (fd) this.showFinishBoard(fd);
    });
  }

  /** 服务器 sfx 消息消费（机关音）；diamond/door 客户端差分已覆盖，忽略防双发 */
  private drainSfx(): void {
    const q = this.d.net.sfxQueue;
    while (q.length > 0) {
      const m = q.shift()!;
      if (m.kind === "lever") this.sfx("sfx_lever");
      else if (m.kind === "pusher") this.sfx("sfx_pusher");
    }
  }

  private updatePlayers(st: any, delta: number): void {
    for (const role of ROLES) {
      const view = this.views.get(role);
      if (!view) continue;
      const ps = st.players?.get?.(role);
      if (!ps) {
        view.glow.visible = view.legs.visible = view.head.visible = false;
        continue;
      }
      const tx = (Number(ps.x) || 0) + PAD;
      const ty = (Number(ps.y) || 0) + PAD;
      if (this.snapPending) {
        view.cx = tx;
        view.cy = ty;
      } else {
        // 速度外推（dead reckoning）+ 高收敛率：服务端 20Hz 快照阶梯位 + 纯指数平滑会产生
        // 持续滞后的"阻尼感"（实玩反馈）。先按快照速度前推半个快照周期，再向目标强收敛——
        // 本机角色近乎贴手，对方也明显跟脚。
        const lead = role === this.myRole ? 50 : 25; // ms 外推（≈半个快照周期）
        const ex = tx + ((Number(ps.vx) || 0) * lead) / 1000;
        const ey = ty + ((Number(ps.vy) || 0) * lead) / 1000;
        const rate = role === this.myRole ? 40 : 20;
        const k = 1 - Math.exp((-rate * delta) / 1000);
        view.cx += (ex - view.cx) * k;
        view.cy += (ey - view.cy) * k;
      }
      view.glow.setPosition(view.cx, view.cy);
      view.legs.setPosition(view.cx, view.cy);
      view.head.setPosition(view.cx, view.cy);
      view.smoke.setPosition(view.cx, view.cy - 21);
      // isDead（烟雾 onComplete）后原版 sprite.visible=false；dying 期间仍可见
      const visible = ps.isDead !== true;
      view.glow.visible = view.legs.visible = view.head.visible = visible;
      const flip = Number(ps.facing) < 0;
      view.legs.setFlipX(flip);
      view.head.setFlipX(flip);
      // 头部倾角（原版 head.rotation = a：坡面接触法线/空中速度方向，内核逐帧算好）
      view.head.setRotation(Number(ps.headTilt) || 0);

      // 死亡烟雾（dying 触发，45 帧@30fps 一次性；原版 _doKill：death 音 + 烟随初速镜像）
      if (!view.dying && ps.dying === true) {
        view.smoke.setVisible(true).setPosition(view.cx, view.cy - 21).setFlipX(Number(ps.vx) < 0).play("smoke");
        this.sfx("sfx_death");
        // 原版 _doKill：死亡即停关卡 BGM 切失败曲（LevelMusicOver）
        this.sound.stopByKey("bgm_level");
        this.sound.stopByKey("bgm_level_speed");
        this.sfx("bgm_over");
      } else if (view.dying && ps.dying !== true) {
        view.smoke.setVisible(false).stop();
      }
      view.dying = ps.dying === true;
      if (view.dying || !visible) {
        if (role === this.myRole) this.stopWater();
        continue;
      }

      // 动画切换（内核 AnimState = 原版状态机 b：idle/jumping/rising/falling → 头部四态；
      // 腿部与层序都只由 b 决定，char-region.js:374-384 / init.js@1874819-1875042 字证）
      const anim = String(ps.anim ?? "idle");
      const p = PREFIX[role];
      // 层序按状态："rising" 时 legs 提到 head 之上，其余 head 在上（removeChild+addChild 的
      // Phaser3 等效 = setDepth；此前误实现为面向驱动，向左走/上升两层序全反）
      view.legs.setDepth(anim === "rising" ? 5.1 : 5);
      if (view.anim !== anim) {
        view.anim = anim;
        switch (anim) {
          case "jumping":
            view.head.play(`${p}_jump`);
            // 起跳帧向上速度显著；起跑也进 jumping（vy≈0）不播跳声
            if (role === this.myRole && Number(ps.vy) < -60) {
              this.sfx(role === "fireboy" ? "sfx_jump_fb" : "sfx_jump_wg");
            }
            break;
          case "rising":
            view.head.play(`${p}_rising`);
            break;
          case "falling":
            view.head.play(`${p}_fall`);
            break;
          default:
            view.head.play(`${p}_idle`);
        }
      }
      // 腿部规则（原版逐字）：b==="jumping" 无条件播 running（含地面顶墙跑），否则停帧 idle0000；
      // 此前的 |vx|>20 阈值是多余近似（空中低速带指令、地面顶墙两场景与原版不符）
      const wantLegs = anim === "jumping" ? `${p}_legs_run` : `${p}_legs_idle`;
      if (view.legsKey !== wantLegs) {
        view.legsKey = wantLegs;
        view.legs.play(wantLegs);
      }

      // 水声（原版 @1868233：左右键按住 && isOnLiquid → waterSteps loop volume .5）
      if (role === this.myRole) {
        const want = ps.inLiquid === true && this.d.keyboard.isMoveDown();
        if (want && !this.waterPlaying) {
          this.waterPlaying = true;
          this.sfx("sfx_water_steps", { loop: true, volume: 0.5 }); // 原版显式 0.5（bundle:1868233）
        } else if (!want && this.waterPlaying) {
          this.stopWater();
        }
      }

      // 门逐帧扫（E10：快照 doorFrame 0..DOOR.frames@25fps，setFrame 驱动；开门即播音 @1681104）
      const frame = Math.max(0, Math.min(DOOR.frames, Math.round(Number(ps.doorFrame) || 0)));
      const prev = this.doorFrames.get(role) ?? 0;
      if (frame !== prev) {
        this.doorSprites.get(role)?.setFrame(`${role === "fireboy" ? "FinishBoy" : "FinishGirl"}${String(frame).padStart(4, "0")}`);
        // 原版 Door.update（38465-38485）：开/关移动全程维持门音实例，到 0/21 帧停
        if (frame > 0 && frame < 21 && !this.sound.isPlaying("sfx_door")) this.sfx("sfx_door");
        if ((frame === 0 || frame === 21) && this.sound.isPlaying("sfx_door")) this.sound.stopByKey("sfx_door");
        this.doorFrames.set(role, frame);
      }
    }
  }

  private stopWater(): void {
    if (!this.waterPlaying) return;
    this.waterPlaying = false;
    this.sound.stopByKey("sfx_water_steps");
  }

  /** 钻石双向差分（隐藏 + 音效；整关重开 collected=false 时复位可见，E1） */
  private updateDiamonds(st: any): void {
    let redGot = 0;
    let blueGot = 0;
    let silverGot = 0;
    st.diamonds?.forEach?.((ds: { collected: boolean }, id: string) => {
      const kind = this.diamondKinds.get(id);
      if (ds.collected) {
        if (kind === "red") redGot++;
        else if (kind === "blue") blueGot++;
        else if (kind === "silver") silverGot++;
      }
      const img = this.diamondSprites.get(id);
      if (!img) return;
      if (ds.collected && img.visible) {
        img.setVisible(false);
        this.sfx("sfx_diamond");
      } else if (!ds.collected && !img.visible) {
        img.setVisible(true);
      }
    });
    // E17：红栏只数红、蓝栏只数蓝（fbwg/银钻不进红蓝栏），银钻单列
    const redStr = `${redGot}/${this.redTotal}`;
    const blueStr = `${blueGot}/${this.blueTotal}`;
    const silverStr = `${silverGot}/${this.silverTotal}`;
    (globalThis as unknown as Record<string, unknown>).__fwHudCounts = { red: redGot, blue: blueGot, silver: silverGot };
  }

  /** 机关快照消费（E13）：lever 角度+灯、pusher 压下、平台/箱/球位姿、风区显隐 */
  private updateMechs(st: any): void {
    st.levers?.forEach?.((s: { state: number; angle: number }, id: string) => {
      const v = this.leverViews.get(`l${id}`);
      if (!v) return;
      // 屏幕角 = +Box2D 体角（phys 两轴同负 = 180° 旋转保手性，原版实证 sprite.angle = +body.angle，
      // forest_05 拉杆原版精灵 +30.66° 与内核沉降角同号同侧；旧版取负致贴图与碰撞体绕枢点镜像分离）
      const deg = (Number(s.angle) || 0) * (180 / Math.PI);
      if (Math.abs(deg - v.angle) > 0.25) {
        v.angle = deg;
        // 杆贴图中心 = body origin，绕支点半径 4.8px 公转（与 create 段初始公式同源）
        const rad = (deg * Math.PI) / 180;
        const sx = v.pivotX + 4.8 * Math.sin(rad);
        const sy = v.pivotY - 4.8 * Math.cos(rad);
        v.stick.setAngle(deg);
        v.stick.setPosition(sx, sy);
        v.stickLight.setAngle(deg);
        v.stickLight.setPosition(sx, sy);
      }
      const on = Number(s.state) === 1;
      if (on !== v.lightOn) {
        v.lightOn = on;
        v.light.setFrame(`lever_base_light_${on ? "on" : "off"}0000`);
      }
    });
    st.pushers?.forEach?.((s: { state: number; x: number; y: number }, id: string) => {
      const v = this.pusherViews.get(`b${id}`);
      if (!v) return;
      // 块体随 prismatic 连续下沉，贴图跟体（快照 x/y），state 仅用于灯光语义
      const bx = (Number(s.x) || 0) + PAD;
      const by = (Number(s.y) || 0) + PAD;
      if (bx !== v.block.x || by !== v.block.y) {
        v.block.setPosition(bx, by);
        v.light.setPosition(bx, by);
      }
      v.state = Number(s.state) === 1 ? 1 : 0;
    });
    st.platforms?.forEach?.((b: { x: number; y: number; angle: number }, id: string) => {
      const v = this.platformViews.get(`p${id}`);
      if (!v) return;
      const px2 = (Number(b.x) || 0) + PAD;
      const py2 = (Number(b.y) || 0) + PAD;
      const pa = -(Number(b.angle) || 0) * (180 / Math.PI);
      if (px2 !== v.x || py2 !== v.y || pa !== v.angle) {
        v.setPosition(px2, py2);
        v.setAngle(pa);
      }
    });
    st.props?.forEach?.((b: { x: number; y: number; angle: number }, key: string) => {
      const v = this.bodyViews.get(this.propViewKey(key) ?? "");
      if (!v) return;
      const qx = (Number(b.x) || 0) + PAD;
      const qy = (Number(b.y) || 0) + PAD;
      const qa = -(Number(b.angle) || 0) * (180 / Math.PI);
      if (qx !== v.x || qy !== v.y || qa !== v.angle) {
        v.setPosition(qx, qy);
        v.setAngle(qa); // 球必转，angle 必吃
      }
    });
    st.winds?.forEach?.((wd: { state: number }, id: string) => {
      const v = this.windViews.get(`f${id}`);
      if (!v) return;
      const on = Number(wd.state) !== 0;
      if (on === v.on) return;
      v.on = on;
      v.effect.setVisible(on);
      if (on) {
        v.base.play("wind_base");
        v.effect.play("wind_effect");
      } else {
        v.base.stop().setFrame("wind_base0000");
        v.effect.stop().setFrame("wind_effect0000");
      }
      // 原版 Wind.updateState：激活 playInstance 循环、失活停止（森林 14 关有风区）
      const anyOn = [...this.windViews.values()].some((w) => w.on);
      if (anyOn && !this.sound.isPlaying("sfx_wind")) this.sfx("sfx_wind", { loop: true, volume: 0.2 }); // 原版显式 0.2（bundle:1968490 附近）
      if (!anyOn) this.sound.stopByKey("sfx_wind");
    });
  }

  /** 平台电机声（原版 updateState 激活时 playInstance @1719824；无事件通道，按位移自检） */
  private updatePlatformSound(st: any): void {
    let anyStart = false;
    st.platforms?.forEach?.((b: { x: number; y: number }, id: string) => {
      const x = Number(b.x) || 0;
      const y = Number(b.y) || 0;
      const prev = this.platformPrev.get(id);
      const moved = prev ? Math.abs(prev.x - x) + Math.abs(prev.y - y) > 0.5 : false;
      if (moved && !this.platformMoving.has(id)) anyStart = true;
      if (moved) this.platformMoving.add(id);
      else this.platformMoving.delete(id);
      this.platformPrev.set(id, { x, y });
    });
    if (anyStart) this.sfx("sfx_platform");
  }

  /** Navies 漂移（原版每帧：r′+=speed.r → pos.r=offset.r·sin r′ → 极坐标转直角坐标） */
  private updateNavies(): void {
    for (const it of this.navyItems) {
      it.rprime += it.speed.r;
      it.pos.r = it.offset.r * Math.sin(it.rprime);
      it.pos.theta += it.speed.theta;
      it.img.x = it.offsetCart.x + it.pos.r * Math.cos(it.pos.theta);
      it.img.y = it.offsetCart.y + it.pos.r * Math.sin(it.pos.theta);
    }
  }

  /** 结算板（PopupAssets）：黑罩 → 板滑入 → 徽章行 + 星级石碑 + 继续按钮（数据全由 finish 消息提供） */
  private showFinishBoard(data: FinishData): void {
    void data;
    // 0.3.14 起退役：结算统一由 EndMenu 场景承载（原版亦仅一块结算板，两套口径曾并存）
  }

  private restartLevel(): void {
    this.d.net.restart();
    this.scene.restart();
  }
}
