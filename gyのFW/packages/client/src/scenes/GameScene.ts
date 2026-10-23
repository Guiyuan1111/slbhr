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
import { windBodyPos } from "@fw/shared/level2";
import { AUDIO_GAME, loadAudioPack } from "../audio.js";
import type { FinishData, Net } from "../net";
import type { KeyboardInput } from "../input";
import { createSeedrandomFactory } from "../vendor/seedrandom.js";
import { ATLAS_CHARS, ATLAS_GROUND, ATLAS_MECH, ATLAS_MENU, ATLAS_POPUP, ATLAS_TEMPLE, FONT_MAIN, PLAYER_SCALE, buildGameAnims, loadGameAtlases } from "./BootScene";
import { CameraRig, PAD, type CamApply } from "./cameraRig";
import { getSettings } from "../settings";
import { loadTempleLevels } from "../templeData";
import { validateSnapshot } from "../snapshotValidation";
import { MechanismSmoother } from "./mechSmoothing";
import { PlatformSoundTracker } from "./platformSound";

export interface GameInit {
  net: Net;
  level: LevelData;
  keyboard: KeyboardInput;
  /** 服务端入关时附带的 temple.json 条目（main.ts 注入）：create 同步选 BGM 用；
   *  缺省时仍由 fetchTempleTime 异步兜底。 */
  templeEntry?: { filename: string; time: number; type: string } | null;
}

/** 关卡四周留白（原版 groundTexture 1312×992 @(-32,-32) 实测）——常量本体已移 cameraRig.ts 统一导出 */
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

/** 相机最小可视格子常量随 updateCamTarget 一并移入 cameraRig.ts（TILES_DESKTOP/SMALL） */

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
  /** r3 脏守卫：上次写入的渲染状态（值未变跳过 setter，免无谓 dirty 标记/排序请求） */
  lx: number; // 上次写入的组中心 x
  ly: number;
  legsDepth: number; // 上次 legs 深度（rising 5.1 / 其余 4.9）
  flip: boolean; // 上次水平翻转
  tilt: number; // 上次头部倾角
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

/** 吊挂（原版 §8）：绳 tileSprite 从锚点指向板，板随快照位姿。
 *  base=hanging_base0000（F3a：oracle 吊板容器=platform+base 同位双精灵 @1646952，
 *  base 后 addChild → 盖在 platform 上、自然宽不缩放、随板同位姿）。 */
interface HangingView {
  rope: Phaser.GameObjects.TileSprite;
  plank: Phaser.GameObjects.Image;
  base: Phaser.GameObjects.Image;
  anchorX: number;
  anchorY: number;
}

/** 滑轮（原版 §9）：两板 + 三段绳 + 两轮（轮转角=绳长/π/10 装饰）。
 *  bases=pulley_base0000（F3c：oracle 挂在两块动板容器内 @1699887——base 先 addChild 于
 *  platform1/2 再加 plat → 板底衬、随板位姿；非静态轮锚点装饰） */
interface PulleyView {
  planks: [Phaser.GameObjects.Image, Phaser.GameObjects.Image];
  bases: [Phaser.GameObjects.Image, Phaser.GameObjects.Image];
  ropes: [Phaser.GameObjects.TileSprite, Phaser.GameObjects.TileSprite, Phaser.GameObjects.TileSprite];
  wheels: [Phaser.GameObjects.Image, Phaser.GameObjects.Image];
  anchor1: { x: number; y: number };
  anchor2: { x: number; y: number };
  /** r3 脏守卫：三段绳/轮上次重指时的双板位置（任一板变位才重算绳段与轮转） */
  segX1: number;
  segY1: number;
  segX2: number;
  segY2: number;
}

/** 罗马杠（原版 §10）：杠容器（杠面+两端）随 bar 体位姿，中轴/底座静态 */
interface RomanView {
  bar: Phaser.GameObjects.Container;
}

interface WindView {
  base: Phaser.GameObjects.Sprite;
  on: boolean;
  effect: Phaser.GameObjects.Sprite;
  /** F3b：Device 基类灯层（wind_base_light_on/off0000，组色 tint，随 state 换帧；
   *  oracle 为 base 精灵子精灵 @1620378 → 同位同角，updateLight 先于 updateState 即时切换） */
  light: Phaser.GameObjects.Image;
}

/**
 * 快照键 → 视图解析缓存条目（r3 客户端帧预算）：快照按数组下标/"kind:idx"/"u<i><a|b>"
 * 键下发，视图按 LevelData id 键建。此前每帧现场做模板串拼接 / propViewKey 切片 /
 * 滑轮正则解析——现首见时解析一次缓存（v=null 表示该键无视图，跳过并记忆），
 * k 为机关平滑键（取视图 id，全类前缀互不冲突）。
 */
interface LeverSnap { v: LeverView; k: string }
interface PusherSnap { v: PusherView; k: string }
interface PlatformSnap { v: Phaser.GameObjects.Container; k: string; lv: { img: Phaser.GameObjects.Image; state: number } | null }
interface PropSnap { v: Phaser.GameObjects.Image | null; k: string }
interface WindSnap { v: WindView; k: string }
interface HangingSnap { v: HangingView; k: string }
interface PulleySnap { v: PulleyView; idx: number; k: string }
interface RomanSnap { v: RomanView; k: string }

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
  /** 同 id 组的全部文本对象（原版一条 text 对象 = 一条 bitmapText，见 setupTutorial @1929845） */
  texts: Phaser.GameObjects.BitmapText[];
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
  /** 平台灯罩视图（key 同 platformViews；快照 state 驱动 light_on/off 换帧） */
  private platformLights = new Map<string, { img: Phaser.GameObjects.Image; state: number }>();
  private leverViews = new Map<string, LeverView>();
  private pusherViews = new Map<string, PusherView>();
  private bodyViews = new Map<string, Phaser.GameObjects.Image>();
  private windViews = new Map<string, WindView>();
  private hangingViews = new Map<string, HangingView>();
  private pulleyViews = new Map<string, PulleyView>();
  private romanViews = new Map<string, RomanView>();
  private doorSprites = new Map<Role, Phaser.GameObjects.Sprite>();
  private doorFrames = new Map<Role, number>();
  private clockText!: Phaser.GameObjects.BitmapText;

  // ---- 相机管理（原版 CameraManager bundle @1881500 移植，F4 翻转；M12 抽为 cameraRig.ts
  // 纯状态机——冻结门/弹簧/缩放夹取/checkBounds 全在 rig，本类只留引擎写与监听注册）----
  // GameConfig.zooming（bundle @1260）：lockAtMinScale=true, minScaleRatio=0.9, lockScaleRatio=0.97；
  // maxScale=1.5；滚轮 ×0.8/×1.2 钳 [minScale,maxScale]，1s 静置 debounce 回弹；
  // 自动适配 worldPadding{top:100,left:200,bottom:100,right:200}、viewportPadding top64、
  // 最小可视 40×30 格（窄屏/移动 20×15）；焦点=双角色中点；弹簧 a=1/15（用户操作 1/3）、阻尼 0.5。
  private readonly camRig = new CameraRig();
  /** HUD 反缩放登记（zoom≠1 时逐帧补偿，见 buildHud 头注） */
  private hudItems: Array<{ obj: Phaser.GameObjects.Image | Phaser.GameObjects.BitmapText; x: number; y: number }> = [];
  private redTotal = 0;
  private blueTotal = 0;
  private silverTotal = 0;
  private navyItems: NavyItem[] = [];
  private tutorialItems: TutorialItem[] = [];
  /** won/gameover 后教学判定冻结（原版 endGame 切态后 Level.update 停跑 → updateTutorial 不再执行，
   *  见 note/research 09 §结算弹窗与 TEMP/uifix1 oracle 取证；我方 Game 为常驻场景须显式停判） */
  private tutorialFrozen = false;
  private stairsSprites = new Map<Role, Phaser.GameObjects.Sprite>();
  /** 通关演出/结算板状态 */
  private stairsPlayed = false;
  private finishData: FinishData | null = null;
  private finishLayer: Phaser.GameObjects.Container | null = null;
  private finishDelayEvent: Phaser.Time.TimerEvent | undefined;
  /** phase 差分（场景侧自算，net.onPhase 仅刷新 DOM HUD） */
  private prevPhase = "";
  /** M12：首个快照做一次 schema 字段校验（每关一次，漂移只告警不阻塞渲染） */
  private snapshotChecked = false;
  /** ready 瞬移标记（跨图平滑会把角色从门口滑回出生点，E15/E1） */
  private snapPending = false;
  /** 原版限时（data/forest/temple.json 的 time 字段；取不到=不限时） */
  private templeTimeSec: number | null = null;
  /** temple.json 的关卡类型（general/speed/puzzle），bgm 选曲与星级口径用 */
  private templeType: string = "general";
  private waterPlaying = false;
  /** T10：逐台平台电机声实例（限位/反向即停，见 platformSound.ts） */
  private readonly platformSounds = new PlatformSoundTracker<Phaser.Sound.BaseSound>({
    play: (id) => this.startPlatformSound(id),
    stop: (_id, sound) => this.stopPlatformSound(sound),
  });
  // ---- r3 客户端帧预算：update 路径零稳态分配 ----
  /** 快照键解析缓存（首见填入；场景重启清空） */
  private leverSnaps = new Map<string, LeverSnap | null>();
  private pusherSnaps = new Map<string, PusherSnap | null>();
  private platformSnaps = new Map<string, PlatformSnap | null>();
  private propSnaps = new Map<string, PropSnap>();
  private windSnaps = new Map<string, WindSnap | null>();
  private hangingSnaps = new Map<string, HangingSnap | null>();
  private pulleySnaps = new Map<string, PulleySnap | null>();
  private romanSnaps = new Map<string, RomanSnap | null>();
  /** 每帧快照上下文（供提升后的 forEach 回调读取，免逐帧闭包捕获） */
  private curNow = 0;
  private curDelta = 0;
  /** 每帧取一次的角色快照引用（update/updatePlayers/updateCamTarget 共用，替代每帧 6 次 map get） */
  private pFb: any = null;
  private pWg: any = null;
  /** 时钟秒缓存（整秒不变则连字符串都不重算） */
  private lastClockSec = -1;
  /** 机关快照消费回调（create 时绑定一次；st.levers.forEach 等直接传函数引用） */
  private cbLevers!: (s: { state: number; angle: number }, id: string) => void;
  private cbPushers!: (s: { state: number; x: number; y: number }, id: string) => void;
  private cbPlatforms!: (b: { x: number; y: number; angle: number; state?: number }, id: string) => void;
  private cbProps!: (b: { x: number; y: number; angle: number }, key: string) => void;
  private cbWinds!: (wd: { state: number }, id: string) => void;
  private cbHangings!: (s: { x: number; y: number; angle: number }, id: string) => void;
  private cbPulleys!: (s: { x: number; y: number; angle: number }, key: string) => void;
  private cbRomans!: (s: { x: number; y: number; angle: number }, id: string) => void;
  private cbDiamonds!: (ds: { collected: boolean }, id: string) => void;
  private cbPlatSnd!: (b: { x: number; y: number }, id: string) => void;

  constructor() {
    super("Game");
  }

  preload(): void {
    // 游戏内音频兜底装载（0.3.21 从 Boot 挪出；r6 起 MenuScene 驻留期已后台暖装，
    // 常规路径此处全部命中 cache.audio 静默跳过零传输）；暖装未启动/被打断的路径
    // （邀请深链直进等）在此补齐。场景重启时同样不会重复下载。
    loadAudioPack(this, AUDIO_GAME);
    // 游戏内四图集（r5 冷启动装载序整形）：Boot 不再装载（Menu 首帧用不到），
    // MenuScene 后台暖装通常已就绪（此处静默跳过）；暖装被提前打断（快速建房/
    // 邀请深链直进）时在此补齐，保证 create 前纹理完备——与旧 Boot 全量装载等价。
    loadGameAtlases(this.load);
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
    this.platformLights.clear();
    this.leverViews.clear();
    this.pusherViews.clear();
    this.bodyViews.clear();
    this.windViews.clear();
    this.hangingViews.clear();
    this.pulleyViews.clear();
    this.romanViews.clear();
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
    // M3：templeEntry 由 main.ts 随 __fwInit 同步注入（速度关 BGM 必须赶在 create 选曲前就位）；
    // 先回缺省再按条目赋值，create 里 fetchTempleTime 的异步结果仍可覆盖。
    this.templeType = "general";
    const entry = d.templeEntry;
    if (entry) {
      this.templeType = String(entry.type ?? "general");
      const t = Number(entry.time);
      this.templeTimeSec = Number.isFinite(t) && t > 0 ? t : null;
    }
    this.waterPlaying = false;
    this.platformSounds.clear();
    this.snapshotChecked = false;
    this.leverSnaps.clear();
    this.pusherSnaps.clear();
    this.platformSnaps.clear();
    this.propSnaps.clear();
    this.windSnaps.clear();
    this.hangingSnaps.clear();
    this.pulleySnaps.clear();
    this.romanSnaps.clear();
    this.lastClockSec = -1;
    this.pFb = null;
    this.pWg = null;
    // H2：场景实例在 stop/start 间复用，相机临时态须逐次复位——尤其 camFrozen
    // （刷新回座 started 由 create 末尾解冻；refresh 进 ready 则保持冻结到开局事件）。
    this.camRig.resetTransient();
    this.myRole = this.d.net.myRole ?? this.myRole;
  }

  create(): void {
    const { level } = this.d;
    // 游戏内动画注册（r5 随装载序从 BootScene 迁来：wind/liquid/finish_stone 的帧在
    // ground/mech/popup 图集，Boot 阶段尚未装载；exists 幂等，重开/换关不重复建）
    buildGameAnims(this.anims);
    // 相机管理（F4 翻转，原版 CameraManager @1881500）：此前固定全景（冻结偏离）。
    // 原版行为：加载期 camFreeze 在全图 minScale，started 解冻后每帧自动适配双角色。
    // settled 口径（F2 后）：标准关 settled 恒钉关卡矩形中心 → scroll(16,16)
    // （关卡 1248×928 vs 画布 1280×960；与焦点无关，38 号档 F2/39 号档 §3.3 口径桥）。
    this.setupCameraManager(level);

    // 机关/钻石快照消费回调（r3：绑定一次，消除每帧 forEach 现场闭包分配）
    this.cbLevers = this.stepLevers.bind(this);
    this.cbPushers = this.stepPushers.bind(this);
    this.cbPlatforms = this.stepPlatforms.bind(this);
    this.cbProps = this.stepProps.bind(this);
    this.cbWinds = this.stepWinds.bind(this);
    this.cbHangings = this.stepHangings.bind(this);
    this.cbPulleys = this.stepPulleys.bind(this);
    this.cbRomans = this.stepRomans.bind(this);
    this.cbDiamonds = this.stepDiamonds.bind(this);
    this.cbPlatSnd = this.stepPlatSnd.bind(this);

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
    // T8（14 号档）：menuMusic 退场=fadeOut(500)+完停（oracle LevelMenu.startLevel :1935104），
    // 非硬停；未播/未装载时退回幂等 stop。（cast：BaseSound 类型缺 volume 声明，
    // WebAudio/HTML5Audio 两实现同 surface，运行时鸭子类型安全。）
    const menuBgm = this.sound.get("bgm_menu") as Phaser.Sound.WebAudioSound | null;
    if (menuBgm && menuBgm.isPlaying) {
      this.tweens.add({
        targets: menuBgm,
        volume: 0,
        duration: 500,
        onComplete: () => {
          menuBgm.stop();
          menuBgm.volume = 1;
        },
      });
    } else {
      this.sound.stopByKey("bgm_menu");
    }
    this.sound.stopByKey("bgm_over");
    // T5（14 号档）：fx 开关=全局总静音（含 BGM，oracle Level init sound.mute=!fx :1886199；
    // Boot :2162295 / fx 信号 :2209677 同式——settings.ts 分轨语义仅保留 music 侧）
    this.sound.mute = !getSettings().fx;
    this.sfx(this.bgmKey(), { loop: true });

    // T4（14 号档）：退场统一停音。Phaser 3 场景共享全局 sound manager（InjectionMap
    // sound:'sound'，scene.stop 不停音）——quit/换关/重开路径都过本场景 SHUTDOWN，在此
    // 停掉本场景全部键（BGM 族+循环音 wind/water/door），对齐 oracle quit/retry 显式
    // levelMusic.stop（:1909660/:1910022）。restart 的 SHUTDOWN→create 重播链不受影响
    // （oracle retry 同样重起 BGM）。
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.stopWater();
      this.platformSounds.clear();
      for (const k of ["bgm_menu", "bgm_level", "bgm_level_speed", "bgm_over", "bgm_finish", "bgm_finish_speed", "sfx_wind", "sfx_door"]) {
        this.sound.stopByKey(k);
      }
    });

    // 场景晚于 phase 启动（如重连进 won 房）：补一次演出
    this.prevPhase = String(this.d.net.room?.state?.phase ?? "");
    if (this.prevPhase === "won") this.playStairsSequence();
    // H2：刷新回座时已在 started，create 到首个 update 之间不会再有 ready→started 迁移事件，
    // 在此直接解冻；ready 仍保持冻结，由既有 onPhaseChanged 在开局时解冻。
    if (this.prevPhase === "started") this.camRig.camFrozen = false;
  }

  /** 关卡 BGM 键：speed 关用专属曲（原版 preloadAudioFiles 按 levelData.type 换曲） */
  private bgmKey(): string {
    return this.templeType === "speed" ? "bgm_level_speed" : "bgm_level";
  }

  /** 终局曲键：speed 关用 _speed 变体（oracle animateFinish @1906276 按 type 选曲；T2——
   *  bgm_finish_speed 此前装载 0 播）。templeType 在 create 即异步填充，won 时必已就绪。 */
  private finishKey(): string {
    return this.templeType === "speed" ? "bgm_finish_speed" : "bgm_finish";
  }

  /** T6（14 号档）：music 开关 Game 态即时生效（oracle settingsSignal→updateMusic :1905636）。
   *  off=停两支关卡 BGM；on=仅 started 进行中且无 BGM 在播时补起。won/ready 态不自动起乐
   *  ——oracle 死亡/终局停曲后再开 music 会重播 levelMusic 与 Over/Finish 叠播，该 quirk
   *  不移植（记 14 号档 §实施记录偏差项）。 */
  applyMusicSetting(): void {
    if (!this.d) return;
    if (!getSettings().music) {
      this.sound.stopByKey("bgm_level");
      this.sound.stopByKey("bgm_level_speed");
      return;
    }
    const phase = String(this.d.net.room?.state?.phase ?? "");
    if (phase !== "started" || this.stairsPlayed) return;
    if (!this.sound.isPlaying("bgm_level") && !this.sound.isPlaying("bgm_level_speed")) {
      this.sfx(this.bgmKey(), { loop: true });
    }
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

  /** 原版限时（E17：EndMenu TimeIcon 的 limit 来自 temple.json 的 time 字段）。
   *  r8 件3：走页面级单例（此前每次 create 各自 fetch+parse 同一文件）。 */
  private fetchTempleTime(levelId: string): void {
    loadTempleLevels().then((levels) => {
      const entry = levels.find((lv) => String(lv?.filename ?? "").endsWith(`/${levelId}.json`));
      const t = Number(entry?.time);
      this.templeTimeSec = Number.isFinite(t) && t > 0 ? t : null;
      this.templeType = String(entry?.type ?? "general");
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
    // 贴图压下取 6px≈0.2m 阈值位移（0.3.1 起快照下发连续 x/y，块体贴图随体——原版 0.7m 连续行程已对齐）
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
      if (b.rotation) img.setAngle(b.rotation); // 体角=Tiled 旋转（快照同族取负配对，初角先行）
      this.bodyViews.set(b.id, img);
    }
    for (const ball of level.balls) {
      // 体心 = 图块中心 + (−16, +20.8)（内核 buildBall：原版 x−=mpx(0.5)、y+=mpx(0.65)），首帧即对位
      const img = this.add
        .image(ball.x - 16 + PAD, ball.y + 20.8 + PAD, ATLAS_MECH, "ball0000")
        .setOrigin(0.5)
        .setDepth(3);
      this.bodyViews.set(ball.id, img);
    }

    // 移动平台（underGround：从岩缝里伸出）：黄帽+黄帽+中段+灯罩。两级变换逐层照原版
    // （MovingPlatform @1714490：外组 scale=n===0?(1.05,0.95):(0.95,1.05)、角=体角（快照端
    // −GetAngle、客户端再取负 → pa=体角）；内组 shapeSprite.rotation=n=−90° 仅竖直平台。
    // 帽无缩放、y=16−厚/2；中段 scale.x=(长格−2)/3、灯 (长格−1)/3——长格=换轴后宽）。
    for (const p of level.platforms) {
      const vert = p.w < p.h;
      const wSw = vert ? p.h : p.w; // 换轴后长边（原版 c.width↔c.height 互换）
      const hSw = vert ? p.w : p.h;
      const capY = 16 - hSw / 2; // mpx(h/2−0.5)=−(h_px/2−16)
      const capL = this.add.image(-(wSw / 2 - 16), capY, ATLAS_MECH, "BarCapLeft0000").setOrigin(0.5);
      const capR = this.add.image(wSw / 2 - 16, capY, ATLAS_MECH, "BarCapRight0000").setOrigin(0.5);
      const mid = this.add.image(0, 0, ATLAS_MECH, "BarCenter0000").setOrigin(0.5);
      mid.scaleX = (wSw / 32 - 2) / 3; // 原版 scale.x=(宽格-2)/3
      // V13（15 号档 Top1）：设备灯组色 tint（Device.setupLight @1620676：on/off 双帧同 tint
      // =groupColors[group 首位]，0/缺省白；平台灯此前恒白）。平台=森林最高频设备
      // （221 台面，group 1-6 五色在用——14 号档 §1.4 数据字证）。
      const light = this.add
        .image(0, 0, ATLAS_MECH, "moving_platform_light_off0000")
        .setOrigin(0.5)
        .setTint(GROUP_COLORS[p.group] ?? 0xffffff);
      light.scaleX = (wSw / 32 - 1) / 3; // 原版 scale.x=(宽格-1)/3
      const inner = this.add.container(0, 0, [capL, capR, mid, light]);
      if (vert) inner.setAngle(-90); // 内组 n=−π/2 常驻（原版 shapeSprite.rotation）
      const c = this.add
        .container(p.x + p.w / 2 + PAD, p.y + p.h / 2 + PAD, [inner])
        .setDepth(1.2)
        .setScale(vert ? 0.95 : 1.05, vert ? 1.05 : 0.95);
      // 初角=Tiled 旋转（快照体角，bonus_3 斜台 135°）；内组 −90° 与原版两级结构同构
      if (p.rotation) c.setAngle(p.rotation);
      this.platformViews.set(p.id, c);
      this.platformLights.set(p.id, { img: light, state: 0 });
    }

    // 吊挂（原版 §8 Hanging @1684262）：锚轮 hanging_anchor0000 + 绳 tileSprite(pulley_rope0000,高20)
    // + 板 hanging_platform0000 宽 1.15·barWidth。绳原版用"负宽+atan2(−Δy,−Δx)"翻转技巧，
    // 这里取等效正宽形式（dist + atan2(Δy,Δx)，贴图水平纹理等价）。
    for (const h of level.hangings) {
      const ax = h.pts[0].x + PAD;
      const ay = h.pts[0].y + PAD;
      const bw = (h.barWidth ?? 3.2) * 32;
      this.add.image(ax, ay, ATLAS_MECH, "hanging_anchor0000").setOrigin(0.5).setDepth(1.28);
      const bx = h.pts[1].x + PAD;
      const by = h.pts[1].y + PAD;
      const rope = this.add
        .tileSprite(ax, ay, Math.max(1, Math.hypot(bx - ax, by - ay)), 20, ATLAS_MECH, "pulley_rope0000")
        .setOrigin(0, 0.5)
        .setDepth(1.26);
      rope.setRotation(Math.atan2(by - ay, bx - ax));
      const plank = this.add.image(bx, by, ATLAS_MECH, "hanging_platform0000").setOrigin(0.5).setDepth(1.3);
      plank.displayWidth = 1.15 * bw;
      // F3a：oracle 吊板容器第二精灵（@1647088 自然宽、anchor 0.5、后 addChild 盖 platform）
      const base = this.add.image(bx, by, ATLAS_MECH, "hanging_base0000").setOrigin(0.5).setDepth(1.31);
      this.hangingViews.set(h.id, { rope, plank, base, anchorX: ax, anchorY: ay });
    }

    // 滑轮（原版 §9 Pulley @1737345）：轮静态（轮锚点=轮点下方 2m，kernel 同式），
    // 两板 pulley_platform0000 宽 1.3·barWidth 随快照，三段绳（锚1↔板1、板1↔板2、板2↔锚2）。
    // F3c：pulley_base0000 改挂两板位（oracle @1699887：base1/base2 为 platform1/2 容器内
    // 首子精灵 → 板底衬、随板动；旧版误挂静态轮锚点=10 关 19 精灵系统错位）。层序按 oracle
    // underGround addChild 序（绳 → 平台[base,plat] → 轮）：base 1.23 落绳上、轮下。
    for (const p of level.pulleys) {
      const bw = (p.barWidth ?? 2.7) * 32;
      const a1 = { x: p.pts[1].x + PAD, y: p.pts[1].y + 64 + PAD };
      const a2 = { x: p.pts[2].x + PAD, y: p.pts[2].y + 64 + PAD };
      const bases: [Phaser.GameObjects.Image, Phaser.GameObjects.Image] = [
        this.add.image(p.pts[0].x + PAD, p.pts[0].y + PAD, ATLAS_MECH, "pulley_base0000").setOrigin(0.5).setDepth(1.23),
        this.add.image(p.pts[3].x + PAD, p.pts[3].y + PAD, ATLAS_MECH, "pulley_base0000").setOrigin(0.5).setDepth(1.23),
      ];
      const wheels: [Phaser.GameObjects.Image, Phaser.GameObjects.Image] = [
        this.add.image(a1.x + 10, a1.y - 50, ATLAS_MECH, "pulley_anchor0000").setOrigin(0.5).setDepth(1.26),
        this.add.image(a2.x - 10, a2.y - 50, ATLAS_MECH, "pulley_anchor0000").setOrigin(0.5).setDepth(1.26),
      ];
      const mkRope = (fx: number, fy: number, tx: number, ty: number): Phaser.GameObjects.TileSprite => {
        const r = this.add
          .tileSprite(fx, fy, Math.max(1, Math.hypot(tx - fx, ty - fy)), 19, ATLAS_MECH, "pulley_rope0000")
          .setOrigin(0, 0.5)
          .setDepth(1.22);
        r.setRotation(Math.atan2(ty - fy, tx - fx));
        return r;
      };
      // 三段绳（oracle Pulley.update @1702579 区：ropeLeft=轮1→板1顶、ropeCenter=轮1↔轮2
      // 定长顶段（不随板动）、ropeRight=轮2→板2顶；绳端=板体位 − baseHeight 60（板顶）。
      // 用户实测 2026-10-24 bonus_2：旧版中段误接板1↔板2，板一移动整条链斜穿地图）。
      const ropes: [Phaser.GameObjects.TileSprite, Phaser.GameObjects.TileSprite, Phaser.GameObjects.TileSprite] = [
        mkRope(a1.x, a1.y, p.pts[0].x + PAD, p.pts[0].y - 60 + PAD),
        mkRope(a1.x, a1.y, a2.x, a2.y),
        mkRope(a2.x, a2.y, p.pts[3].x + PAD, p.pts[3].y - 60 + PAD),
      ];
      const planks: [Phaser.GameObjects.Image, Phaser.GameObjects.Image] = [
        this.add.image(p.pts[0].x + PAD, p.pts[0].y + PAD, ATLAS_MECH, "pulley_platform0000").setOrigin(0.5).setDepth(1.3),
        this.add.image(p.pts[3].x + PAD, p.pts[3].y + PAD, ATLAS_MECH, "pulley_platform0000").setOrigin(0.5).setDepth(1.3),
      ];
      planks[0].displayWidth = 1.3 * bw;
      planks[1].displayWidth = 1.3 * bw;
      this.pulleyViews.set(p.id, { planks, bases, ropes, wheels, anchor1: a1, anchor2: a2, segX1: NaN, segY1: NaN, segX2: NaN, segY2: NaN });
    }

    // 罗马杠（原版 §10 Roman @1748214）：杠容器（roman_bar0000 宽 2·|Δx| + 两端 roman_end0000
    // anchor(0.05,0.5)、右端镜像）随 bar 体位姿；中轴 roman_center0000@h=p1+(−32,+32)、
    // 底座 roman_base0000 自基边向上（高 64|k|）静态。
    for (const r of level.romans) {
      const pts = r.pts;
      let mPx: number;
      let kPx: number;
      if (pts.length >= 3 && pts[0].x === pts[1].x) {
        mPx = -(pts[2].x - pts[1].x) * 2;
        kPx = -(pts[1].y - pts[0].y);
      } else {
        mPx = -(pts[1].x - pts[0].x) * 2;
        kPx = -(pts[1].y - pts[0].y);
      }
      const hx = pts[1].x - 32 + PAD;
      const hy = pts[1].y + 32 + PAD;
      this.add.image(hx, hy, ATLAS_MECH, "roman_center0000").setOrigin(0.5).setDepth(1.29);
      const baseH = Math.abs(2 * kPx);
      if (baseH > 1) {
        this.add
          .tileSprite(hx, hy + kPx, 138, baseH, ATLAS_MECH, "roman_base0000")
          .setOrigin(0.5, kPx >= 0 ? 1 : 0)
          .setDepth(1.2);
      }
      const w = Math.abs(mPx);
      const bar = this.add.container(
        hx,
        hy,
        [
          this.add.tileSprite(0, 0, w, 30, ATLAS_MECH, "roman_bar0000").setOrigin(0.5),
          this.add.image(-w / 2, 0, ATLAS_MECH, "roman_end0000").setOrigin(0.05, 0.5),
          this.add.image(w / 2, 0, ATLAS_MECH, "roman_end0000").setOrigin(0.05, 0.5).setScale(-1, 1),
        ],
      ).setDepth(1.3);
      this.romanViews.set(r.id, { bar });
    }

    // 风区机身（liquids 层，depth 7）：wind_base 0000..0003@30fps；state≠0 时播循环。
    // 机身/风柱位 = windBodyPos（内核 body 同点；原版 enable() 同步精灵=体位，bundle @1773990：
    // effect 亦锚体位、origin(0.5,1)、rotation=同机身角、高=32·length、overChars 层）
    for (const w of level.winds) {
      const bp = windBodyPos(w);
      const base = this.add
        .sprite(bp.x + PAD, bp.y + PAD, ATLAS_MECH, "wind_base0000")
        .setOrigin(0.5)
        .setDepth(7)
        .setAngle(w.rotation + 90); // 内核 bd.angle=π(rotation+90)/180，物理角=Phaser 角
      const effect = this.add
        .sprite(base.x, base.y, ATLAS_MECH, "wind_effect0000")
        .setOrigin(0.5, 1)
        .setDepth(7.5)
        .setAngle(base.angle)
        .setVisible(false);
      effect.displayHeight = w.lengthM * 32;
      effect.play("wind_effect");
      effect.anims.setProgress(Math.random());
      effect.setVisible(false);
      // F3b：灯层（oracle Device 基类 @1620378：lightFrame+"0001" 子精灵、off 帧起、
      // setupLight 双帧 tint=组色；风 defaults lightFrame="wind_base_light" @1735654）
      const light = this.add
        .image(base.x, base.y, ATLAS_MECH, "wind_base_light_off0000")
        .setOrigin(0.5)
        .setDepth(7.1)
        .setAngle(base.angle)
        .setTint(GROUP_COLORS[w.group] ?? 0xffffff);
      this.windViews.set(w.id, { base, light, effect, on: false });
    }

    // 窗框（仅 forest_bonus_1 两处，64×32 横窗）：oracle @1740286-1742086——主精灵
    // _default0000 载体帧（34×34）+ 子帧 WindowLeft/Right0000 分列 x=∓(w/2−0.5)m
    // （mpx=−32v 双取负，屏幕 Left 在左）、WindowCenter0000 居中且 scale.x=(w−2)/3
    // （2m 窗=0 不画），整体 1.05 缩放；竖窄窗走交换支（w<h→sw/sh 互换+angle −90）。
    // 此前"三帧不存在、原版亦渲染空白"系审计误判——帧实存 MechAssets A–F 全部图集
    // （31 号档 §4.2），物理面（静态盒 cat1/mask61695）内核早已复刻。
    for (const w of level.windows) {
      const wm = w.rect.w / 32;
      const hm = w.rect.h / 32;
      let sw = wm;
      let sh = hm;
      let angle = 0;
      if (wm < hm) {
        [sw, sh] = [hm, wm];
        angle = -90;
      }
      const capX = (sw / 2 - 0.5) * 32;
      const capY = -(sh / 2 - 0.5) * 32;
      const win = this.add
        .container(w.rect.x + w.rect.w / 2 + PAD, w.rect.y + w.rect.h / 2 + PAD)
        .setDepth(1.27)
        .setAngle(angle)
        .setScale(1.05);
      win.add([
        this.add.image(0, 0, ATLAS_MECH, "_default0000").setOrigin(0.5),
        this.add.image(-capX, capY, ATLAS_MECH, "WindowLeft0000").setOrigin(0.5),
        this.add.image(capX, capY, ATLAS_MECH, "WindowRight0000").setOrigin(0.5),
        this.add.image(0, 0, ATLAS_MECH, "WindowCenter0000").setOrigin(0.5).setScale((sw - 2) / 3, 1),
      ]);
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

  /**
   * 液体：LiquidRun 行段 Left/中/Right 三类精灵 30fps 同相位；整体下移 2px。
   * 水体（kind=water）另建冰膜覆盖层（oracle Liquid.createIceGraphics @1666474 字证）：
   * 仅 type5 水体建 iceGraphics 子组（组 y=+4、Left/中(IceBox)/Right 三段 0000 静帧无动画、
   * addChild 序在 liquidGraphics 之上），建时 `iceGraphics.visible=false`，只有 startFrozen
   * （55 型瓦片 Liquid 构造 @1661093 重映射）/光束冻结（initialFreeze/freeze @1667800）才置
   * visible（且同时 liquidGraphics 隐、冰带 fixture mask 换 16）。森林 58 份地图 0 个 55 型
   * 瓦片（含 flip 位全量重扫）+ 0 beamer（14 号档 §1.4）⇒ oracle 森林该层恒不可见——38 号档
   * F1「冰膜缺失致带水关像素抬升」系其对拍器只记子精灵自身 visible、未合成祖先组可见性的
   * 仪器伪差（与 F5 pulley_rope TileSprite 帧名丢失同族；forest_01 水区无热块、IceBox 记录
   * 坐标 y=行心+4 与 iceGraphics.position.y=4 同源佐证）。此处按字节语义补齐隐藏覆盖层：
   * 像素零影响、显示列表对齐，未来庙域冻结机制可在该容器上接线。
   */
  private buildLiquids(level: LevelData): void {
    const { tile } = level;
    for (const run of level.liquidRuns) {
      const fam = LIQUID_ATLAS[run.kind] ?? "WaterBox";
      const single = run.col0 === run.col1;
      const ice = run.kind === "water" ? this.add.container(0, 0).setDepth(7.05).setVisible(false) : null;
      for (let k = run.col0; k <= run.col1; k++) {
        const pos = k === run.col0 ? (single ? "Left" : "Left") : k === run.col1 ? "Right" : "";
        const s = this.add
          .sprite(k * tile + tile / 2 + PAD, run.row * tile + tile / 2 + 2 + PAD, ATLAS_GROUND, `${fam}${pos}0000`)
          .setOrigin(0.5)
          .setDepth(7);
        // 原版三段液体同相位播放（bundle:38988-39006 无随机延迟）；width=1 时 Left/Right 同格叠放
        s.play(`liquid_${run.kind}${pos ? `_${pos.toLowerCase()}` : ""}`);
        if (ice) {
          const ipos = pos; // Left/中(裸 IceBox)/Right 与水面三段同格同规则
          ice.add(
            this.add
              .image(k * tile + tile / 2 + PAD, run.row * tile + tile / 2 + 4 + PAD, ATLAS_GROUND, `IceBox${ipos}0000`)
              .setOrigin(0.5)
          );
        }
        if (single) {
          const cap = this.add
            .sprite(k * tile + tile / 2 + PAD, run.row * tile + tile / 2 + 2 + PAD, ATLAS_GROUND, `${fam}Right0000`)
            .setOrigin(0.5)
            .setDepth(7);
          cap.play(`liquid_${run.kind}_right`);
          // width=1 冰膜同格补 Right（oracle createIceGraphics 无条件建 Left+Right 两枚）
          if (ice) {
            ice.add(
              this.add.image(k * tile + tile / 2 + PAD, run.row * tile + tile / 2 + 4 + PAD, ATLAS_GROUND, "IceBoxRight0000").setOrigin(0.5)
            );
          }
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
      const legs = this.add.sprite(cx, cy, ATLAS_CHARS, `${p}_legs_idle0000`).setOrigin(0.5).setScale(PLAYER_SCALE).setDepth(4.9);
      const head = this.add.sprite(cx, cy, ATLAS_CHARS, `${p}_head_idle0000`).setOrigin(0.5).setScale(PLAYER_SCALE).setDepth(5);
      const smoke = this.add.sprite(cx, cy + 21, ATLAS_CHARS, "death_smoke0000").setOrigin(0.5).setScale(PLAYER_SCALE).setDepth(5.5).setVisible(false);
      smoke.on(Phaser.Animations.Events.ANIMATION_COMPLETE, () => smoke.setVisible(false));
      legs.play(`${p}_legs_idle`);
      head.play(`${p}_idle`);
      this.views.set(role, { glow, legs, head, smoke, cx, cy, anim: "idle", legsKey: `${p}_legs_idle`, dying: false, lx: NaN, ly: NaN, legsDepth: 4.9, flip: false, tilt: 0 });
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

  /**
   * 相机管理（原版 CameraManager bundle @1881500 移植，F4 翻转）：
   * - 初始冻结在全图 minScale（原版 camFreeze 直到开局序列 @1943673 解冻）；
   * - started 解冻后每帧 updateCamTarget + 弹簧 animate（a=1/15，用户操作中 1/3，阻尼 0.5）；
   * - 滚轮 ×0.8/×1.2 钳 [minScale,1.5]，1s 静置 lockAtMinScale 回弹（≤lockScale 停在 lockScale，否则复位）；
   * - 双指捏合缩放、单指拖拽 >10px 平移（panend/pinchend 复位）；
   *   原版以 cursors.active 闸（触屏光标激活禁用），本复刻触屏键为 DOM 按钮不占画布，无此闸。
   * 边界（F2 翻转）=关卡矩形语义（oracle checkBounds @1845100）：W·h<视口 → 钉关卡中心、
   * 否则按半视口钳进关卡矩形（全 realW/realH 屏域，无 PAD）；标准关 settled=scroll(16,16)。
   */
  private setupCameraManager(level: LevelData): void {
    const rw = this.scale.width;
    const rh = this.scale.height;
    // 不用 Phaser setBounds：视口(1280×960)大于关卡矩形(1248×928)时其钳制会把滚动
    // 钉死在 (32,32)，centerOn 全被否决——0.3.29-F4 动态相机因此在所有标准关上失效
    // （2026-10-12 相机轨迹实测：角色从出生点走到门区相机纹丝不动）。改为在弹簧目标上
    // 按原版 checkBounds(@1889585) 语义自行钳制（rig.updateCamTarget 内，含视口>世界时居中）。
    // 标定+初值+强制应用守卫半在 rig（setupForLevel 返回三元组），本方法只落引擎写与监听。
    this.applyCamTriplet(this.camRig.setupForLevel(level, rw, rh));
    this.input.on("wheel", (_p: unknown, _ov: unknown, _dx: number, dy: number) => this.camRig.onCamWheel(dy, this.cameras.main.zoom));
    this.input.on("pointermove", (p: Phaser.Input.Pointer) => this.camRig.onCamPointerMove(p, { zoom: this.cameras.main.zoom, pointer1: this.input.pointer1, pointer2: this.input.pointer2 }));
    this.input.on("pointerup", () => this.camRig.onCamPointerUp());
  }

  /** 每帧目标+弹簧逼近（焦点=双角色中点/checkBounds 钳制/a=1/15·阻尼 0.5）——状态机在 rig，
   *  本方法只喂参并落引擎写；详细语义注释随实现移入 cameraRig.ts（updateCamTarget/animateCam）。 */
  private stepCamera(): void {
    this.camRig.updateCamTarget(this.d.level, this.pFb, this.pWg, this.scale.width, this.scale.height, this.sys.game.device.os.desktop);
    this.applyCamTriplet(this.camRig.animateCam());
  }

  /** 引擎写半（rig 交付三元组 → setZoom/centerOn + HUD 反缩放） */
  private applyCamTriplet(ap: CamApply): void {
    const cam = this.cameras.main;
    cam.setZoom(ap.scale);
    cam.centerOn(ap.x, ap.y);
    // HUD 反缩放：zoom 以视口中点为枢轴，screen = M + (pos−M)·zoom → 保持 screen=pos 需 pos' = M + (pos−M)/zoom
    if (ap.scale !== 1 && this.hudItems.length > 0) {
      const inv = 1 / ap.scale;
      const mx = this.scale.width / 2;
      const my = this.scale.height / 2;
      for (const h of this.hudItems) {
        h.obj.setScale(inv);
        h.obj.x = mx + (h.x - mx) * inv;
        h.obj.y = my + (h.y - my) * inv;
      }
    } else if (this.hudItems.length > 0) {
      for (const h of this.hudItems) {
        h.obj.setScale(1);
        h.obj.x = h.x;
        h.obj.y = h.y;
      }
    }
  }

  /** 应用相机（r3 脏守卫半在 rig.applyIfDirty；force=true 供 HUD 重建等需强制补偿的调用方） */
  private applyCam(force = false): void {
    const ap = force ? this.camRig.applyForced() : this.camRig.applyIfDirty();
    if (ap) this.applyCamTriplet(ap);
  }

  /** 相机复位（ready 整轮重开，等价原版整关 reload 回冻结全图）；脏守卫半在 rig（净态返回 null 跳引擎写） */
  private resetCamera(level: LevelData): void {
    const ap = this.camRig.resetForLevel(level);
    if (ap) this.applyCamTriplet(ap);
  }

  private buildTutorial(level: LevelData): void {
    for (const step of level.tutorials) {
      if (!step.textItems.length || !step.trigger) continue;
      // 原版 setupTutorial（bundle @1929845）：每 text 对象一条 bitmapText(k.x, k.y, "font", 文本, 18, halign)，
      // maxWidth = 对象宽，初始不可见；同 id 组共享触发矩形，任一角色进入整组淡入。
      // （原版 cacheAsBitmap 是 Phaser 2 渲染缓存优化，非语义，此处不移植。）
      const texts = step.textItems.map((t) => {
        // 世界 = 关卡 +PAD：文本与触发矩形同域（此前漏 +PAD 致文本相对地砖偏 32px，
        // 2026-10-12 用户报告第一关文字错位时实锤）
        const bt = this.add.bitmapText(t.x + PAD, t.y + PAD, FONT_MAIN, t.text, 18);
        // 运行时接受 'left'|'center'|'right'（Phaser 3 字体排版），本仓 phaser 类型标注偏差强转
        bt.align = (t.halign ?? "left") as unknown as typeof bt.align;
        return bt.setMaxWidth(t.width).setDepth(0.8).setVisible(false).setAlpha(0);
      });
      this.tutorialItems.push({ texts, trigger: step.trigger, shown: false });
    }
  }

  /** 教学渐显判定：原版=任一角色进矩形，组内全部文本 400ms 淡入/淡出（双角色坐标；r3 标量直传零分配） */
  private updateTutorial(x1: number, y1: number, ok1: boolean, x2: number, y2: number, ok2: boolean): void {
    for (const item of this.tutorialItems) {
      const r = item.trigger;
      if (!r) continue;
      const inside =
        (ok1 && x1 >= r.x && x1 <= r.x + r.w && y1 >= r.y && y1 <= r.y + r.h) ||
        (ok2 && x2 >= r.x && x2 <= r.x + r.w && y2 >= r.y && y2 <= r.y + r.h);
      if (inside && !item.shown) {
        item.shown = true;
        for (const t of item.texts) {
          t.setVisible(true).setAlpha(0);
          this.tweens.add({ targets: t, alpha: 1, duration: 400 });
        }
      } else if (!inside && item.shown) {
        item.shown = false;
        for (const t of item.texts) {
          this.tweens.add({ targets: t, alpha: 0, duration: 400, onComplete: () => t.setVisible(false) });
        }
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

  /** ui 层：顶部藤蔓时钟（正计时 MM:SS 真实秒，G14 去占位）+ 右上暂停钮。
   *  （旧注「左上角红/蓝/银钻石计数」系笔误：钻石只在世界内拾取、无计数 HUD——原版
   *  LevelUI（bundle @1914421）亦仅 PauseButton+Clock 两件，结算行内才有钻石达成图标。）*/
  private buildHud(): void {
    // HUD 挂相机（scrollFactor 0），坐标 = 视口系（关卡矩形内）。
    // 原版 Phaser 2 的 root.scale 只缩世界容器、HUD 不动；Phaser 3 camera.zoom 会连 HUD 一起缩，
    // 由 applyCam 逐帧做 1/zoom 反缩放+反平移补偿（zoom=1 恒等，基线无扰）。
    const clockX = 640; // 画布 1280 的水平中心（原版 LevelUI 时钟位）
    // 原版 Clock 锚点 (0.5, 0.05)：盘面上探 5px；文字区在 y≈55-83（像素差分热图实证）
    const clockFace = this.add.image(clockX, 0, ATLAS_TEMPLE, "Clock0000").setOrigin(0.5, 0.05).setDepth(9).setScrollFactor(0);
    // 原版 LevelUI 右上暂停钮（0.3.13 起接本机暂停：P 键/点击 → PauseMenu）
    const pauseBtn = this.add
      .image(1265, 15, ATLAS_POPUP, "PauseButton0000")
      .setOrigin(1, 0)
      .setDepth(9)
      .setScrollFactor(0)
      .setInteractive({ useHandCursor: true })
      .on("pointerup", () => (globalThis as unknown as { __fwTogglePause?: () => void }).__fwTogglePause?.());
    // 原版 LevelUI/Clock：TempleAssets Clock0000 + font 位图字（oracle 实拍 2026-10-12：字形 39px 高
    // ≈ 名义字号×1.6；旧 24 号只渲染 26px 高，偏小——注意文字 y=56 是文字区起点，加高后仍落在盘面内）
    this.clockText = this.add
      .bitmapText(clockX, 56, FONT_MAIN, "00:00", 24)
      .setOrigin(0.5, 0)
      .setDepth(9)
      .setScrollFactor(0);
    this.hudItems = [
      { obj: clockFace, x: clockX, y: 0 },
      { obj: pauseBtn, x: 1265, y: 15 },
      { obj: this.clockText, x: clockX, y: 56 },
    ];
    this.applyCam(true); // 建好后立即补一次 HUD 补偿（冻结期 minScale 视图下 HUD 也不缩）
  }

  setMyRole(role: Role): void {
    this.myRole = role;
  }

  update(time: number, delta: number): void {
    const st = this.d.net.room?.state;
    if (!st) return;
    // 换关窗口闸（用户实测 2026-10-24：下一关人物模型短暂出现在上一关地图内）——
    // advance 回声先于黑幕换景：服务端 buildWorld 已把玩家落新关出生点，旧场景若继续
    // 消费会把新关站位画进旧地图（resetRound 重显+瞬移）。oracle gameFinish 后
    // Level.update 停跑无此窗口；我方 scene 重建由 reloadLevel 幕下完成，期间旧场景冻结。
    if (String(st.levelId ?? "") !== this.d.level.id) return;
    const nowMs = Number(time) || 0;

    // M12：首个快照做一次字段校验。schema 漂移（漏 defineTypes/字段改名）此前被
    // Number(x)||0 静默吞成 0；这里只告警不阻塞，避免渲染层与协议悄悄脱节。
    if (!this.snapshotChecked) {
      this.snapshotChecked = true;
      const issues = validateSnapshot(st, ROLES);
      if (issues.length > 0) console.warn("[fw] 快照字段异常（schema 漂移？）", issues.slice(0, 8));
    }

    // 每帧取一次双角色引用（下游 updatePlayers/updateCamTarget/tutorial 复用）
    this.pFb = st.players?.get?.("fireboy") ?? null;
    this.pWg = st.players?.get?.("watergirl") ?? null;

    // 时钟：真实正计时秒（服务端只在 started 步进内累计，won/gameover 天然冻结）。
    // r3：整秒不变跳过字符串重算（mmss 每帧 3 个模板串分配消除）
    const clockSec = Math.max(0, Math.floor((Number(st.timerMs) || 0) / 1000));
    if (clockSec !== this.lastClockSec) {
      this.lastClockSec = clockSec;
      const clockStr = mmss(clockSec);
      if (clockStr !== this.lastClock) { this.clockText.setText(clockStr); this.lastClock = clockStr; }
    }

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
    this.updateMechs(st, nowMs, delta);
    this.updatePlatformSound(st);

    // 教学渐显判定：原版=任一角色进矩形（双方同用关卡坐标），组内全部文本 400ms 淡入/淡出。
    // 快照 ps.x/ps.y 本就是关卡坐标，与触发矩形同域直比（此前误加 PAD 形成 32px 迟触发死区）。
    // r3：标量直传（pts 数组/对象/闭包分配消除）
    let ok1 = false, ok2 = false, tx1 = 0, ty1 = 0, tx2 = 0, ty2 = 0;
    if (this.pFb && this.pFb.dying !== true) { ok1 = true; tx1 = Number(this.pFb.x) || 0; ty1 = Number(this.pFb.y) || 0; }
    if (this.pWg && this.pWg.dying !== true) { ok2 = true; tx2 = Number(this.pWg.x) || 0; ty2 = Number(this.pWg.y) || 0; }
    if ((ok1 || ok2) && !this.tutorialFrozen) this.updateTutorial(tx1, ty1, ok1, tx2, ty2, ok2);

    // 相机管理：解冻后每帧目标适配 + 弹簧逼近（原版 Level.update → camManager.update()）
    if (!this.camRig.camFrozen) {
      this.stepCamera();
    }

    this.updateNavies();
    this.snapPending = false;
  }

  /** phase 迁移副作用（E15/E1/M9） */
  private onPhaseChanged(prev: string, cur: string): void {
    if (cur === "ready") this.resetRound(prev);
    if (cur === "started") this.camRig.camFrozen = false; // 原版开局序列解冻相机（camFreeze=@1943673）
    if (cur === "won" || cur === "gameover") this.freezeTutorial();
    if (cur === "won" && !this.stairsPlayed) this.playStairsSequence();
  }

  /**
   * 终局教学冻结（原版口径 2026-10-14 取证 TEMP/uifix1）：
   * 原版 gameFinish/gameOver（bundle @1950896/@1949960 一带）= ui.clock.stop() + state.start("endGame")
   * 整态切换——Level.update 停跑，updateTutorial 不再执行，文字以切换瞬间的可见态冻结
   * （oracle won 实拍顶部条带无教学文字残留，峰值仅为砖高光 153,153,153）。
   * 我方 Game 为常驻场景、update 持续跑，won 后角色钉在门口会触发「站在门前」组滞留——
   * 故终局显式停判，并把已显示组按原版淡出臂（400ms alpha→0 后隐藏，bundle updateTutorial else 分支）收掉。
   * 时钟/暂停钮不在此列：原版仅 stop 计数、sprite 保留渲染于 0.7 黑罩下（won 实拍金色峰值
   * 77,69,21 = 进行中 254,227,71 的 0.30 倍），我方画布内实测 77,68,20 已逐像素同口径。
   */
  private freezeTutorial(): void {
    this.tutorialFrozen = true;
    for (const item of this.tutorialItems) {
      if (!item.shown) continue;
      item.shown = false;
      for (const t of item.texts) {
        this.tweens.add({ targets: t, alpha: 0, duration: 400, onComplete: () => t.setVisible(false) });
      }
    }
  }

  /** 整轮复位（重开=ready）：瞬移标记 + 清演出/门帧/烟，跨图平滑会把角色滑回出生点 */
  private resetRound(prev: string): void {
    this.snapPending = true;
    this.mechSmoother.clear(); // 机关位姿平滑态一并作废（重开=整关重载，快照域瞬移）
    this.platformSounds.clear(); // 平台电机声随整轮复位停止，避免旧实例跨轮滞留
    this.resetCamera(this.d.level); // 相机回冻结全图（原版整关 reload 重建 CameraManager）
    this.stairsPlayed = false;
    this.tutorialFrozen = false; // 新一轮恢复教学判定（原版 retry=整状态重载重建 tutorialTexts）
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
    // T3（14 号档）：speed 关同停 _speed 变体（oracle levelMusic.stop :1906226 不分变体）
    this.sound.stopByKey("bgm_level");
    this.sound.stopByKey("bgm_level_speed");
    this.sfx(this.finishKey()); // T2：按 temple.json type 选终局曲（oracle :1906276）
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
      const ps = role === "fireboy" ? this.pFb : this.pWg; // r3：每帧一次取（update 顶部）
      if (!ps) {
        view.glow.visible = view.legs.visible = view.head.visible = false;
        // L-01：席位释放后快照不再含该 role——终局爬梯 sprite 是独立于角色视图的对象，
        // 不随本体隐藏；won 后对端超时/主动离场、余端回 lobby 时门口会残留幽灵。
        this.stairsSprites.get(role)?.setVisible(false);
        continue;
      }
      const tx = (Number(ps.x) || 0) + PAD;
      const ty = (Number(ps.y) || 0) + PAD;
      if (this.snapPending) {
        view.cx = tx;
        view.cy = ty;
      } else {
        // 速度外推（dead reckoning）+ 高收敛率：先按快照速度前推 lead，再向目标强收敛——
        // 本机角色近乎贴手，对方也明显跟脚。lead 的职责随出站 patch 率而变（netopt 11 号档）：
        // 60Hz patch（现役）下快照零陈旧，lead 只需抵消本档收敛滞后 16.67·(1−k)/k
        // （self rate40 k=0.487 → 17.6ms；other rate20 k=0.283 → 42ms，对方留 25ms 少量
        // 跟随滞后防超车感，60Hz 实测不劣化故不调）；20Hz patch（FW_PATCH_MS=50 回退口径）
        // 下还需抵消半个快照周期的陈旧锯齿，原 self lead50 即为此设——60Hz 下反而前冲震荡
        // （A/B 网格扫描：self rms 5.85→0.16px、maxAbs 9.49→1.93；对 20Hz 回退 3.0→3.3px 同级）。
        const lead = role === this.myRole ? 17 : 25; // ms 外推
        const ex = tx + ((Number(ps.vx) || 0) * lead) / 1000;
        const ey = ty + ((Number(ps.vy) || 0) * lead) / 1000;
        const rate = role === this.myRole ? 40 : 20;
        const k = 1 - Math.exp((-rate * delta) / 1000);
        view.cx += (ex - view.cx) * k;
        view.cy += (ey - view.cy) * k;
      }
      // r3 脏守卫：位置/翻转/倾角值未变跳过 setter（静止收敛后零写入；写同值本无视觉差，
      // 仅省 setter/dirty 开销与 smoke 越界写）
      if (view.cx !== view.lx || view.cy !== view.ly) {
        view.lx = view.cx;
        view.ly = view.cy;
        view.glow.setPosition(view.cx, view.cy);
        view.legs.setPosition(view.cx, view.cy);
        view.head.setPosition(view.cx, view.cy);
        view.smoke.setPosition(view.cx, view.cy - 21);
      }
      // isDead（烟雾 onComplete）后原版 sprite.visible=false；dying 期间仍可见
      // dying 即藏身（animcheck 12 号档对拍：原版 update 首行 dying 分支每帧
      // bodySprite/legs/head 全 invisible，烟雾独行；此前 dying 期间身体可见直到 isDead，
      // 与原版「触液即化烟、本体消失」观感不符——playwright A/B：dyingHidden 104/195 → 全覆盖）
      // won 爬梯演出（用户实测 2026-10-24：门口出现两个人）——原版 gameFinish 后 Level.update
      // 停跑不再重显，我方 update 常驻，须在此守住 playStairsSequence 的藏身，否则同帧被冲掉
      const visible = ps.isDead !== true && ps.dying !== true && !this.stairsPlayed;
      view.glow.visible = view.legs.visible = view.head.visible = visible;
      const flip = Number(ps.facing) < 0;
      if (flip !== view.flip) {
        view.flip = flip;
        view.legs.setFlipX(flip);
        view.head.setFlipX(flip);
      }
      // 头部倾角（原版 head.rotation = a：坡面接触法线/空中速度方向，内核逐帧算好）
      const tilt = Number(ps.headTilt) || 0;
      if (tilt !== view.tilt) {
        view.tilt = tilt;
        view.head.setRotation(tilt);
      }

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
      // Phaser3 等效 = setDepth）。⚠ 深度必须错开而不能同为 5：rising 后归位的等深度经稳定
      // 排序会保留交换后的列表序 → legs 永久压过 head（用户实测 2026-10-13：跳跃后静立脖子接缝异常）
      // r3 脏守卫：目标深度不变不调 setDepth——depth setter 无条件 queueDepthSort，
      // 旧代码每帧两调 → 显示列表每帧全量 StableSort（new Array(104)+O(n log n)）白付
      const wantDepth = anim === "rising" ? 5.1 : 4.9;
      if (wantDepth !== view.legsDepth) {
        view.legsDepth = wantDepth;
        view.legs.setDepth(wantDepth);
      }
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

  /** 钻石双向差分（隐藏 + 音效；整关重开 collected=false 时复位可见，E1）。原版局内无计数 UI，钻石只在结算面板出现 */
  private updateDiamonds(st: any): void {
    st.diamonds?.forEach?.(this.cbDiamonds);
  }

  private stepDiamonds(ds: { collected: boolean }, id: string): void {
    const img = this.diamondSprites.get(id);
    if (!img) return;
    if (ds.collected && img.visible) {
      img.setVisible(false);
      this.sfx("sfx_diamond");
    } else if (!ds.collected && !img.visible) {
      img.setVisible(true);
    }
  }

  /**
   * 机关位姿平滑（rotcheck 10 号档，E13 二轮）：服务端 60Hz 仿真写 schema，Colyseus patch 出站
   * 现役同为 60Hz——ForestRoom onCreate 里 setPatchRate(PATCH_MS)=1000/60 已覆写缺省 20Hz。
   * 角色层已有"速度外推+强收敛"（updatePlayers）；机关（拉杆/推杆/平台/箱球/吊板/滑轮/罗马杠）
   * 此前直吃快照，即用户"旋转体系没原版好"的表现层根因。实现已抽至 mechSmoothing.ts：
   * 有限差分估速（角度最短弧）→ 目标=最新快照+v·lead → 指数收敛；纯表现层，零物理/det 影响。
   */
  private readonly mechSmoother = new MechanismSmoother();

  /** 取 key 的平滑后位姿（快照域数值，转换与 PAD 由各视图块自理）。snapPending 帧=瞬移直贴。 */
  private mechTarget(key: string, x: number, y: number, a: number): { x: number; y: number; a: number } {
    return this.mechSmoother.target(key, x, y, a, this.curNow, this.curDelta, this.snapPending);
  }

  /** 机关快照消费（E13）：lever 角度+灯、pusher 压下、平台/箱/球位姿、风区显隐。
   *  r3：遍历回调改为 create 期绑定的 cbXxx（消除每帧 ~10 个现场闭包），
   *  快照键→视图解析首见缓存（消除逐帧模板串/propViewKey 切片/滑轮正则）。 */
  private updateMechs(st: any, nowMs: number, deltaMs: number): void {
    this.curNow = nowMs;
    this.curDelta = deltaMs;
    st.levers?.forEach?.(this.cbLevers);
    st.pushers?.forEach?.(this.cbPushers);
    st.platforms?.forEach?.(this.cbPlatforms);
    st.props?.forEach?.(this.cbProps);
    st.winds?.forEach?.(this.cbWinds);
    st.hangings?.forEach?.(this.cbHangings);
    st.pulleys?.forEach?.(this.cbPulleys);
    st.romans?.forEach?.(this.cbRomans);
  }

  private stepLevers(s: { state: number; angle: number }, id: string): void {
    let e = this.leverSnaps.get(id);
    if (e === undefined) {
      const k = `l${id}`;
      const v = this.leverViews.get(k) ?? null;
      e = v ? { v, k } : null;
      this.leverSnaps.set(id, e);
    }
    if (!e) return;
    const v = e.v;
    // 屏幕角 = +Box2D 体角（phys 两轴同负 = 180° 旋转保手性，原版实证 sprite.angle = +body.angle，
    // forest_05 拉杆原版精灵 +30.66° 与内核沉降角同号同侧；旧版取负致贴图与碰撞体绕枢点镜像分离）
    const deg = this.mechTarget(e.k, 0, 0, Number(s.angle) || 0).a * (180 / Math.PI);
    // r3 脏守卫：角度未变跳过（杆位由支点+角唯一决定）
    if (deg !== v.angle) {
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
      // F3d：杆灯换帧（oracle Lever @1653884：stick_light 入 lights 列表 → updateLight 随
      // state 换 on/off 帧；其"不随杆旋转"系 38 号档对拍器只记局部角 a 的仪器语义——
      // 字节面 n=lever_stick_light 是旋转体 m 的子精灵 @1653790，随杆公转自转均同原版）
      v.stickLight.setFrame(`lever_stick_light_${on ? "on" : "off"}0000`);
    }
  }

  private stepPushers(s: { state: number; x: number; y: number }, id: string): void {
    let e = this.pusherSnaps.get(id);
    if (e === undefined) {
      const k = `b${id}`;
      const v = this.pusherViews.get(k) ?? null;
      e = v ? { v, k } : null;
      this.pusherSnaps.set(id, e);
    }
    if (!e) return;
    const v = e.v;
    // 块体随 prismatic 连续下沉，贴图跟体（快照 x/y 平滑后），state 仅用于灯光语义
    const pt = this.mechTarget(e.k, Number(s.x) || 0, Number(s.y) || 0, 0);
    const bx = pt.x + PAD;
    const by = pt.y + PAD;
    if (bx !== v.block.x || by !== v.block.y) {
      v.block.setPosition(bx, by);
      v.light.setPosition(bx, by);
    }
    v.state = Number(s.state) === 1 ? 1 : 0;
  }

  private stepPlatforms(b: { x: number; y: number; angle: number; state?: number }, id: string): void {
    let e = this.platformSnaps.get(id);
    if (e === undefined) {
      const k = `p${id}`;
      const v = this.platformViews.get(k) ?? null;
      const lv = v ? this.platformLights.get(k) ?? null : null;
      e = v ? { v, k, lv } : null;
      this.platformSnaps.set(id, e);
    }
    if (!e) return;
    const pt = this.mechTarget(e.k, Number(b.x) || 0, Number(b.y) || 0, Number(b.angle) || 0);
    const px2 = pt.x + PAD;
    const py2 = pt.y + PAD;
    const pa = -pt.a * (180 / Math.PI);
    // r3 脏守卫：静止收敛后零写入
    if (e.v.x !== px2 || e.v.y !== py2) e.v.setPosition(px2, py2);
    if (e.v.angle !== pa) e.v.setAngle(pa);
    const ns = Number(b.state) === 1 ? 1 : 0;
    if (e.lv && ns !== e.lv.state) {
      e.lv.state = ns;
      e.lv.img.setTexture(ATLAS_MECH, ns === 1 ? "moving_platform_light_on0000" : "moving_platform_light_off0000");
    }
  }

  private stepProps(b: { x: number; y: number; angle: number }, key: string): void {
    let e = this.propSnaps.get(key);
    if (e === undefined) {
      const vk = this.propViewKey(key) ?? "";
      const v = vk ? this.bodyViews.get(vk) ?? null : null;
      e = { v, k: vk };
      this.propSnaps.set(key, e);
    }
    if (!e.v) return;
    const pt = this.mechTarget(e.k, Number(b.x) || 0, Number(b.y) || 0, Number(b.angle) || 0);
    // r3 脏守卫：静止收敛后零写入（球/箱位姿快照驱动）
    if (e.v.x !== pt.x + PAD || e.v.y !== pt.y + PAD) e.v.setPosition(pt.x + PAD, pt.y + PAD);
    const qa = -pt.a * (180 / Math.PI);
    if (e.v.angle !== qa) e.v.setAngle(qa); // 球必转，angle 必吃
  }

  private stepWinds(wd: { state: number }, id: string): void {
    let e = this.windSnaps.get(id);
    if (e === undefined) {
      const k = `f${id}`;
      const v = this.windViews.get(k) ?? null;
      e = v ? { v, k } : null;
      this.windSnaps.set(id, e);
    }
    if (!e) return;
    const v = e.v;
    const on = Number(wd.state) !== 0;
    if (on === v.on) return;
    v.on = on;
    // V9/V10（15 号档 Top2，oracle updateState @1737222-1737260 字证）：
    // on：effect 只切 visible（其动画建时即播+随机相位 @1735078，常驻不停→相位连续）、
    //     base 立即 play；light 即时换帧（updateLight 先于 updateState @1622404）。
    // off：effect 即隐（动画不停→相位保留）；base 立刻继续播、400ms _.delay 后 stop+复位
    //     0000 帧（无取消机制：400ms 窗内再 on 会被滞后回调复位——oracle 原样保留该 quirk）；
    //     light 同样即时换 off。
    if (on) {
      v.effect.setVisible(true);
      v.base.play("wind_base");
      v.light.setFrame("wind_base_light_on0000");
    } else {
      v.effect.setVisible(false);
      v.light.setFrame("wind_base_light_off0000");
      this.time.delayedCall(400, () => {
        v.base.stop();
        v.base.setFrame("wind_base0000");
      });
    }
    // 原版 Wind.updateState：激活 playInstance 循环、失活停止（森林 14 关有风区）
    const anyOn = [...this.windViews.values()].some((w) => w.on);
    if (anyOn && !this.sound.isPlaying("sfx_wind")) this.sfx("sfx_wind", { loop: true, volume: 0.2 }); // 原版显式 0.2（bundle:1968490 附近）
    if (!anyOn) this.sound.stopByKey("sfx_wind");
  }

  // 吊挂/滑轮/罗马杆位姿消费（+体角口径，同 lever）：板/杠跟体（位姿平滑），绳逐帧重指
  private stepHangings(s: { x: number; y: number; angle: number }, id: string): void {
    let e = this.hangingSnaps.get(id);
    if (e === undefined) {
      const k = `h${id}`;
      const v = this.hangingViews.get(k) ?? null;
      e = v ? { v, k } : null;
      this.hangingSnaps.set(id, e);
    }
    if (!e) return;
    const v = e.v;
    const pt = this.mechTarget(e.k, Number(s.x) || 0, Number(s.y) || 0, Number(s.angle) || 0);
    const x = pt.x + PAD;
    const y = pt.y + PAD;
    // r3 脏守卫：板位/角与绳形（绳形由板位唯一决定）变位才写
    const deg = pt.a * (180 / Math.PI);
    if (x !== v.plank.x || y !== v.plank.y) {
      v.plank.setPosition(x, y);
      v.base.setPosition(x, y); // F3a：base 为板容器第二精灵，同位姿
      const dx = x - v.anchorX;
      const dy = y - v.anchorY;
      v.rope.setPosition(v.anchorX, v.anchorY);
      v.rope.width = Math.max(1, Math.hypot(dx, dy));
      v.rope.setRotation(Math.atan2(dy, dx));
    }
    if (deg !== v.plank.angle) {
      v.plank.setAngle(deg);
      v.base.setAngle(deg);
    }
  }

  private stepPulleys(s: { x: number; y: number; angle: number }, key: string): void {
    let e = this.pulleySnaps.get(key);
    if (e === undefined) {
      const m = /^u(\d+)([ab])$/.exec(String(key));
      if (m) {
        const v = this.pulleyViews.get(`u${m[1]}`) ?? null;
        e = v ? { v, idx: m[2] === "a" ? 0 : 1, k: `u${m[1]}${m[2]}` } : null;
      } else {
        e = null;
      }
      this.pulleySnaps.set(key, e);
    }
    if (!e) return;
    const v = e.v;
    const idx = e.idx;
    const pt = this.mechTarget(e.k, Number(s.x) || 0, Number(s.y) || 0, Number(s.angle) || 0);
    const x = pt.x + PAD;
    const y = pt.y + PAD;
    if (x !== v.planks[idx].x || y !== v.planks[idx].y) {
      v.planks[idx].setPosition(x, y);
      v.bases[idx].setPosition(x, y); // F3c：base 为板容器内衬精灵，同板位姿
    }
    const deg = pt.a * (180 / Math.PI);
    if (deg !== v.planks[idx].angle) {
      v.planks[idx].setAngle(deg);
      v.bases[idx].setAngle(deg);
    }
    const b1 = v.planks[0];
    const b2 = v.planks[1];
      // r3 脏守卫：两段垂绳+轮转角只依赖双板位置——任一板变位才重指
      //（中段 ropeCenter=锚1↔锚2 定长，create 时已就位，step 不碰）
      if (b1.x !== v.segX1 || b1.y !== v.segY1 || b2.x !== v.segX2 || b2.y !== v.segY2) {
        v.segX1 = b1.x;
        v.segY1 = b1.y;
        v.segX2 = b2.x;
        v.segY2 = b2.y;
        const e1y = b1.y - 60; // 绳端=板顶（oracle baseHeight 60）
        const e2y = b2.y - 60;
        const r0 = v.ropes[0];
        r0.setPosition(v.anchor1.x, v.anchor1.y);
        r0.width = Math.max(1, Math.hypot(b1.x - v.anchor1.x, e1y - v.anchor1.y));
        r0.setRotation(Math.atan2(e1y - v.anchor1.y, b1.x - v.anchor1.x));
        const r2 = v.ropes[2];
        r2.setPosition(v.anchor2.x, v.anchor2.y);
        r2.width = Math.max(1, Math.hypot(b2.x - v.anchor2.x, e2y - v.anchor2.y));
        r2.setRotation(Math.atan2(e2y - v.anchor2.y, b2.x - v.anchor2.x));
        // 轮转角 = 右绳长/π/10（oracle e.Length() 装饰语义）
        const turn = r2.width / (Math.PI * 10);
        v.wheels[0].setRotation(turn);
        v.wheels[1].setRotation(turn);
    }
  }

  private stepRomans(s: { x: number; y: number; angle: number }, id: string): void {
    let e = this.romanSnaps.get(id);
    if (e === undefined) {
      const k = `r${id}`;
      const v = this.romanViews.get(k) ?? null;
      e = v ? { v, k } : null;
      this.romanSnaps.set(id, e);
    }
    if (!e) return;
    const pt = this.mechTarget(e.k, Number(s.x) || 0, Number(s.y) || 0, Number(s.angle) || 0);
    // r3 脏守卫：静止收敛后零写入
    if (e.v.bar.x !== pt.x + PAD || e.v.bar.y !== pt.y + PAD) e.v.bar.setPosition(pt.x + PAD, pt.y + PAD);
    const deg = pt.a * (180 / Math.PI);
    if (e.v.bar.angle !== deg) e.v.bar.setAngle(deg);
  }

  /** T10：平台电机声逐台实例（oracle MovingPlatform/RotMirror 的 playInstance/stopInstance 语义）。
   *  快照无事件通道，起步/限位/反向由 PlatformSoundTracker 按位姿差分判定。 */
  private updatePlatformSound(st: any): void {
    st.platforms?.forEach?.(this.cbPlatSnd);
  }

  private stepPlatSnd(b: { x: number; y: number; angle?: number }, id: string): void {
    this.platformSounds.update(id, {
      x: Number(b.x) || 0,
      y: Number(b.y) || 0,
      angle: Number(b.angle) || 0,
    });
  }

  private startPlatformSound(_id: string): Phaser.Sound.BaseSound | null {
    if (!getSettings().fx || !this.cache.audio.exists("sfx_platform")) return null;
    const s = this.sound.add("sfx_platform");
    s.play();
    return s;
  }

  private stopPlatformSound(s: Phaser.Sound.BaseSound): void {
    s.stop();
    s.destroy();
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
