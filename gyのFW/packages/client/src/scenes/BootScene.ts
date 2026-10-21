/**
 * 资源加载场景：官方 atlas / 音频 / 动画定义。
 *
 * 渲染复刻原版（Phaser 2 版 output/A）的实测配方：
 * - 背景与门框在 TempleAssets；机关在 MechAssets；角色/钻石在 CharAssets；
 *   液体/特效在 GroundAssets；UI 贴图在 PopupAssets/MenuAssets。
 * - 原 M1 加载的 tilemaps/tilesets/{Chars,Ground}.png 在素材包中不存在（Tiled 只留了
 *   元数据 JSON），地面改为程序化绘制（见 GameScene.buildGround）。
 *
 * 冷启动装载序整形（r5 perf，2026-10-18）：Boot 只装开始界面首帧必需
 * （CharAssets 角色立绘/MenuAssets/位图字/四张独立图/menu 音频）；ground/mech/temple/popup
 * 四图集（≈1.35MB）移出关键路径——MenuScene.create 首帧后由本场景 loader 后台暖装，
 * GameScene.preload / TempleScene 等消费方照常声明装载（Phaser Loader 对已入纹理缓存
 * 的键静默跳过，见 LoaderPlugin.keyExists→File.hasCacheConflict），暖装被提前打断时
 * 由消费方补齐，任何进入路径都保证纹理就绪。剖析依据：DCL→Menu 大头是图片装载管线
 * 的串行段（blob→Image ~180ms）而非网络（19 请求全并行仅 ~55ms）。
 */
import Phaser from "phaser";
import { AUDIO_BGM_OVER, AUDIO_MENU, AUDIO_SFX, bgmFamilyOf, bgmFinishOf, bgmLoopOf, loadAudioPack, type BgmFamily } from "../audio.js";

export const ATLAS_CHARS = "chars";
export const ATLAS_GROUND = "ground";
export const ATLAS_MECH = "mech";
export const ATLAS_TEMPLE = "temple";
export const ATLAS_POPUP = "popup";
export const ATLAS_MENU = "menu";
export const ATLAS_PRELOADER = "preloader";
export const FONT_MAIN = "font";
/** 全量位图字体（r18 两段化）：Boot 关键路径只装 FONT_MAIN 子集，本键由消费方 preload
 *  经 loadFontFull 装载——用第二个键而不是覆盖 "font"，因为 TextureManager.checkKey
 *  (:248) 拒绝同名重载并 console.error，addImage (:469) 随即早退——旧纹理与其上已挂的
 *  BitmapText 帧引用原样留着（换纹理只能 textures.remove，那会让在场字对象抛错）。
 *  本键可被多处声明（Menu 暖装、GameScene.preload、弹窗三件套 preload，见 loadFontFull），
 *  这是安全的。机制在 BitmapFontFile：`loader.bitmapFont` 是把**两个子文件各自入队**
 *  （:234 `addFile(multifile.files)`），所以跳过判定按子文件分别做——png 子文件的
 *  hasCacheConflict 打 textureManager（ImageFile.js:66），第二次声明**既不重下 1.6MB 也不换纹理**；
 *  fnt 子文件打 cache.xml（XMLFile.js:56），而 BitmapFontFile.addToCache 只写
 *  cacheManager.bitmapFont（:105）、从不填 cache.xml ⇒ **元数据每次都会重新请求**
 *  （本机靠 r15 的 ETag 契约是 0 字节 304；四张图集的 *.json 从 r5 起就是同一形状，
 *  逐 URL 账为证）。重新解析也不会发生：MultiFile.pending 按子文件数初始化（:125）且只由
 *  真正加载完的子文件递减，png 缺席就永远 `isReadyToProcess()` 为假 ⇒ addToCache 直接返回；
 *  装载完成同样不受影响——被跳过的子文件根本没进队列，队列空则 start() 当场 loadComplete。 */
export const FONT_FULL = "font-full";

/**
 * 官方素材以高分辨率绘制。原版运行时角色帧缩放 0.95（帧含大量透明边距，
 * 可见内容 ≈ 2 瓦片高），门框 0.8，机关贴图保持原尺寸。
 */
export const PLAYER_SCALE = 0.95;

/**
 * 全量位图字体的装载声明（唯一一处，路径与键都只在这里）：房内文案（GameScene HUD、
 * 弹窗三件套）用的 FONT_FULL 由它进缓存。声明方一律是消费方自己的 preload：已入纹理缓存时
 * png 子文件静默跳过（不重下、不换纹理，机制见 FONT_FULL 注释），代价只有 .fnt 元数据再走一次
 * 条件复验（本机 0 字节 304）；若键已在缓存或队列里则本次不产生请求，队列空时 start() 当场
 * loadComplete（LoaderPlugin.js 的 `list.size === 0` 分支），所以既不重下也不多等一帧，
 * 无脑声明比"猜上游已经装过"便宜。0.3.43 实测教训：刷新回座 won/gameover 时 enterGame 的黑幕把
 * Game 起步压到淡入之后，而 resumeWonIfNeeded/onPhase 会先 start 弹窗场景，靠上游兜底就
 * 撞上 `Invalid BitmapText key: font-full`（create 中断，结算板开不出来）。
 */
export function loadFontFull(load: Phaser.Loader.LoaderPlugin): void {
  load.bitmapFont(FONT_FULL, "/assets/fonts/chinese/font.png", "/assets/fonts/chinese/font.fnt");
}

/** 游戏内四图集（Menu 首帧用不到）：进阶装载共用入口——已缓存的键 Phaser 自动跳过 */
export function loadGameAtlases(load: Phaser.Loader.LoaderPlugin): void {
  load.atlas(ATLAS_GROUND, "/assets/atlasses/GroundAssets.png", "/assets/atlasses/GroundAssets.json");
  load.atlas(ATLAS_MECH, "/assets/atlasses/MechAssets.png", "/assets/atlasses/MechAssets.json");
  load.atlas(ATLAS_TEMPLE, "/assets/atlasses/Temples/forest/TempleAssets.png", "/assets/atlasses/Temples/forest/TempleAssets.json");
  load.atlas(ATLAS_POPUP, "/assets/atlasses/PopupAssets.png", "/assets/atlasses/PopupAssets.json");
  // r18 件2b：全量位图字体同走这条延迟通道（Menu 驻留暖装 / GameScene.preload 兜底，
  //  已缓存的键照旧静默跳过）。进房前文案一律 FONT_MAIN 子集，故房前不等这 1.6MB。
  loadFontFull(load);
}

/** 后台暖装落定状态（r5）：MenuScene 启动暖装时登记，进 Game 前等待其落定，
 *  避免「暖装仍在飞 + GameScene 兜底重复拉同一批文件」的双载竞态 */
let warmState: { done: Promise<void>; resolve: () => void } | null = null;

/** 暖装期 BGM 族猜测（r16 件A）：暖装发生在 Menu 驻留期，此时目标关卡通常未知，
 *  只能按缺省 general 猜（48 关里 38 关命中）。main.ts 在 temple.json 单例落定后
 *  若已能从 `?level=` 深链定出类型，则先于暖装写入本字段。暖装已启动后改它无效
 *  ——缺的族由 GameScene.preload 兜底声明补齐（未缓存的键照常下载）。 */
let warmBgmFamily: BgmFamily = "general";
export function setWarmBgmFamily(type: string | null | undefined): void {
  if (warmState) return;
  warmBgmFamily = bgmFamilyOf(type);
}

/** MenuScene 调用：开始后台暖装并登记落定门（complete 或场景被切走都算落定） */
export function startBgWarm(scene: Phaser.Scene): void {
  if (warmState) return;
  let resolve: () => void = () => {};
  const done = new Promise<void>((r) => {
    resolve = r;
  });
  warmState = { done, resolve };
  const finish = (): void => warmState?.resolve();
  // r21：关卡循环曲（LevelMusic 1285.4KB）不进落定门——它是"可玩"之前最大的一笔，却没有一帧靠它。
  // 门只等必需集（四图集+全量字体+sfx+失败曲+终局曲）。循环曲排在**门落定之后**再入队：
  // 快速建房/邀请深链那条路上 Menu 在落定后几百毫秒就被切走，定时器随场景停用作废、请求根本不发起，
  // 循环曲改由 GameScene.kickBgmLoop 在 create 之后兜底；驻留路径（真人正常节奏）则在门后把它预缓存，
  // 进房即有声，与今日等价。节拍取 1500ms：必须晚于 fadeSwitch 的切场窗口，否则又变回与必需集抢管道。
  const thenLoop = (): void => {
    if (!scene.sys.isActive()) return; // Menu 已被切走（含切场瞬间竞态）：交给 Game 侧兜底
    loadAudioPack(scene, bgmLoopOf(warmBgmFamily));
    scene.load.start();
  };
  scene.load.once("complete", () => {
    finish();
    scene.time.delayedCall(1500, thenLoop);
  });
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, finish);
  loadGameAtlases(scene.load);
  // 游戏内音频批（r6，同 r5 模式）：并入同一暖装队列与落定门——进 Game 前若暖装在飞，
  // GameScene.preload 的兜底声明会整体等门后重跑（已入 cache.audio 的键静默跳过），
  // 不产生双载竞态；请求数仍 < maxParallelDownloads 32，全并行。
  // r16 件A：BGM 只取一族（sfx + 失败曲与类型无关，恒取）。
  loadAudioPack(scene, AUDIO_SFX);
  loadAudioPack(scene, AUDIO_BGM_OVER);
  loadAudioPack(scene, bgmFinishOf(warmBgmFamily));
  scene.load.start();
}

/** 进 Game 前等待暖装落定（未启动/已落定立即返回；剩余键由 GameScene.preload 兜底） */
export function bgWarmSettled(): Promise<void> {
  return warmState ? warmState.done : Promise.resolve();
}

export class BootScene extends Phaser.Scene {
  constructor() {
    super("Boot");
  }

  preload(): void {
    // LoaderBar 贴图首位装载（13 号档 #41，0.3.39：oracle Boot 态预装 PreloaderAssets
    // bundle:2160057 区 → Load 态全程有条；单场景镜像=本队列尽早可用，见 buildLoaderBar）
    this.load.atlas(ATLAS_PRELOADER, "/assets/atlasses/PreloaderAssets.png", "/assets/atlasses/PreloaderAssets.json");
    // Menu 首帧必需：角色立绘（MenuScene 双角色 + idle 动画）/菜单图集/位图字/四张独立图
    this.load.atlas(ATLAS_CHARS, "/assets/atlasses/CharAssets.png", "/assets/atlasses/CharAssets.json");
    this.load.atlas(ATLAS_MENU, "/assets/atlasses/MenuAssets.png", "/assets/atlasses/MenuAssets.json");
    // 原版画布内时钟的位图字（font 48 基准，LevelUI Clock 用 24 号 = 半缩放）
    // 进房前字体子集（r18 件1 生成器 scripts/font-subset/build-font-prephase.mjs；
    // r19 件1 重排版 scripts/font-subset/reflow-prephase.mjs）：帧坐标改写后的紧凑图集
    // 1006x378，配 font-prephase.fnt（与官方 font.fnt 只差 x/y 与 scaleW/scaleH，度量逐条相同）。
    // 304.5KB/8.56MB 解码 → 242.4KB/1.45MB。
    this.load.bitmapFont(FONT_MAIN, "/assets/fonts/chinese/font-prephase.png", "/assets/fonts/chinese/font-prephase.fnt");
    // 独立图片（0.3.12 起开始界面引用，此前漏载致缺纹理静默空白——差距审计 P0）
    this.load.image("TempleHall", "/assets/images/TempleHallForest.jpg");
    this.load.image("Beam", "/assets/images/Beam.png");
    this.load.image("GameName", "/assets/images/GameNameForest.png");
    this.load.image("KiziLogo", "/assets/images/branding/branding_logo_kizi.png");

    // 音频仅装 menu 批（bgm_menu）；游戏内批（0.3.21 起 Menu 冷启动不再为其付出传输；
    // r6 起由 MenuScene 驻留期后台暖装提前拉齐，GameScene.preload 仅兜底；r16 件A 起
    // BGM 只取目标关卡类型的一族，见 audio.ts）。装载方式沿用无扩展名流式路由 +
    // 显式 type=mp3 的 IDM 防劫持约定。
    loadAudioPack(this, AUDIO_MENU);
    // ground/mech/temple/popup 不在 Boot 关键路径（r5 冷启动装载序整形，见文件头注释）
    this.buildLoaderBar();
  }

  create(): void {
    this.buildMenuAnims();
    // 先进开始界面（原版 load → menu 流）；GameScene 由入房后 scene.start 切入
    this.scene.start("Menu");
  }

  /**
   * 加载条（13 号档 #41，0.3.39；oracle LoaderBar 组 bundle:2164711 字证逐参复刻）：
   * LoaderBar0000 置 (−100,−10)（屏心系→我方 (cx−100, cy−10)，默认 (0,0) 锚）自左
   * crop `Rectangle(0,0,0,20)`；LoaderHolder0000 居中 anchor 0.5；LoaderTitle0000
   * (0,−80) anchor 0.47（双轴）；组内层序 bar→holder→title。进度=装载完成度百分比
   * （Phaser3 progress 0..1 ≡ oracle onFileComplete a/100 同一数据源，:2164711 区
   * `j.width=(a/100)*200; crop`）；onLoadComplete 销毁（oracle 同构）。oracle
   * h5api.progress 为发牌平台 API，无对应物，不移植（档注明）。
   */
  private buildLoaderBar(): void {
    const cx = this.scale.width / 2;
    const cy = this.scale.height / 2;
    const BAR_W = 200; // oracle 常量 i=200（:2164711 区）
    const BAR_H = 20; // oracle 常量 g=20
    let bar: Phaser.GameObjects.Image | null = null;
    const cropTo = (frac: number): void => {
      bar?.setCrop(0, 0, BAR_W * frac, BAR_H);
    };
    const build = (): void => {
      bar = this.add.image(cx - BAR_W / 2, cy - BAR_H / 2, ATLAS_PRELOADER, "LoaderBar0000");
      cropTo(this.load.progress);
      this.add.image(cx, cy, ATLAS_PRELOADER, "LoaderHolder0000").setOrigin(0.5, 0.5);
      this.add.image(cx, cy - 80, ATLAS_PRELOADER, "LoaderTitle0000").setOrigin(0.47, 0.47);
    };
    if (this.textures.exists(ATLAS_PRELOADER)) build();
    else this.load.once("filecomplete-atlasjson-" + ATLAS_PRELOADER, build);
    this.load.on("progress", cropTo);
    this.load.once(Phaser.Loader.Events.COMPLETE, () => {
      this.load.off("progress", cropTo);
      if (bar) bar.destroy(); // holder/title 随场景切换整体回收；bar 显式销毁=oracle destroy 语义
    });
  }

  /** Menu 阶段就需要的动画（全部 CharAssets 帧与 MenuScene 立绘共用同一图集） */
  private buildMenuAnims(): void {
    const a = this.anims;
    const seq = buildSeq(a);
    // 帧率全部按原版实测 30fps（init.js：idle/jumping/rising/falling 均 30）
    for (const role of ["fire", "water"] as const) {
      seq(`${role}_idle`, ATLAS_CHARS, `${role}_head_idle`, 0, role === "fire" ? 18 : 29, 30, -1);
      seq(`${role}_legs_idle`, ATLAS_CHARS, `${role}_legs_idle`, 0, 0, 1, -1);
      seq(`${role}_legs_run`, ATLAS_CHARS, `${role}_legs_running`, 0, 7, 30, -1);
      seq(`${role}_jump`, ATLAS_CHARS, `${role}_head_jumping`, 0, 10, 30, -1); // 原版 jumping 30,!0 循环——起跑后头部定格即此处漏循环
      // E19 字证（init.js@1861937）：falling 对双角色都只注册 0..4
      // （water 图集虽有 11 帧表，原版注册子区间仍是 0..4）
      seq(`${role}_fall`, ATLAS_CHARS, `${role}_head_falling`, 0, 4, 30, -1);
      // E19 字证（init.js@1862115）：rising 0..4@30fps 循环（water 图集 11 帧同取子区间）
      seq(`${role}_rising`, ATLAS_CHARS, `${role}_head_rising`, 0, 4, 30, -1);
      // 通关上楼梯（原版 25fps 一次性，31 帧收 0..29 同段）
      seq(`${role}_stairs`, ATLAS_CHARS, `${role}_stairs`, 0, 29, 25, 0);
    }
    seq("smoke", ATLAS_CHARS, "death_smoke", 0, 44, 30, 0);
  }
}

/** 帧序列动画注册原语（exists 幂等，重启/重入不重复建） */
function buildSeq(a: Phaser.Animations.AnimationManager) {
  return (key: string, atlas: string, prefix: string, start: number, end: number, frameRate: number, repeat: number): void => {
    if (a.exists(key)) return;
    const frames: Phaser.Types.Animations.AnimationFrame[] = [];
    for (let i = start; i <= end; i++) frames.push({ key: atlas, frame: `${prefix}${String(i).padStart(4, "0")}` });
    a.create({ key, frames, frameRate, repeat });
  };
}

/** 游戏内动画（ground/mech/popup 帧——图集随 GameScene 装载后再注册，r5 随装载序迁移） */
export function buildGameAnims(a: Phaser.Animations.AnimationManager): void {
  const seq = buildSeq(a);
  // 风区机身（原版 Wind：generateFrameNames("wind_base",0,4)@30fps 循环；图集实有 0..3）
  seq("wind_base", ATLAS_MECH, "wind_base", 0, 3, 30, -1);
  // 风区尾迹（原版 Wind：wind_effect 0..30@30fps 循环，图集实有 0..29；随机起始帧由场景侧 setProgress）
  seq("wind_effect", ATLAS_MECH, "wind_effect", 0, 29, 30, -1);
  // 液体三段各 15 帧 30fps 循环（Left/中/Right）
  for (const [key, base] of [
    ["water", "WaterBox"],
    ["lava", "FireBox"],
    ["green", "GreenBox"],
  ] as const) {
    seq(`liquid_${key}`, ATLAS_GROUND, base, 0, 14, 30, -1);
    seq(`liquid_${key}_left`, ATLAS_GROUND, `${base}Left`, 0, 14, 30, -1);
    seq(`liquid_${key}_right`, ATLAS_GROUND, `${base}Right`, 0, 14, 30, -1);
  }
  // 结算星级石碑分段（oracle EndMenu renderContent :1876428：to_1/2/3 = 帧 1-7/8-14/15-21 @30fps once，
  // 前缀按关卡类型 FinishStone{,Puzzle,Speed,Dark}；13 号档 #29——此前累计播法使分段键成死代码）
  // 门动画键不再注册（E10：门改按快照 doorFrame 逐帧 setFrame，动画键会与帧驱动打架）
  seq("finish_stone_1", ATLAS_POPUP, "FinishStone", 1, 7, 30, 0);
  seq("finish_stone_2", ATLAS_POPUP, "FinishStone", 8, 14, 30, 0);
  seq("finish_stone_3", ATLAS_POPUP, "FinishStone", 15, 21, 30, 0);
  for (const [tag, base] of [
    ["puzzle", "FinishStonePuzzle"],
    ["speed", "FinishStoneSpeed"],
    ["dark", "FinishStoneDark"],
  ] as const) {
    seq(`finish_stone_${tag}_1`, ATLAS_POPUP, base, 1, 7, 30, 0);
    seq(`finish_stone_${tag}_2`, ATLAS_POPUP, base, 8, 14, 30, 0);
    seq(`finish_stone_${tag}_3`, ATLAS_POPUP, base, 15, 21, 30, 0);
  }
}
