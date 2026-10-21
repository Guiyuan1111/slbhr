/**
 * 开始界面（原版 States/Menu/TempleHall 复刻；静态件坐标经实机显示树二轮校准 2026-10-06，
 * 动态件 2026-10-20 按 bundle 字节真相重写——13 号档 #24/#25/#26）。
 * 背景 TempleHallForest.jpg 1708×960 居中（大厅石柱是背景自带）；
 * 光柱 ×8：oracle 全部创建于组心（屏心 640），anchor(0.5,-0.5) 从顶垂入满屏高、SCREEN 混合，
 *   update 帧驱动 t+=0.003：rotation=0.2·sin(t_offset+t·t_speed)、y 随 |sin| 摆、宽 0.6-1.0 脉冲
 *   （:1094049/:1097040/:1097136/:1097166——旧「柱间均布」静态校准无 bundle 支持，已废）；
 * KiziLogo 207×94 @ (640,93)；标题 GameNameForest 860×270 @ (640,288)；
 * 角色 0.95 缩放 legs/head 同心叠放 @ (320,875)/(960,875)，glow 于中心下 40px（alpha=1）；
 * 「开始游戏」251×76 @ (640,513)（无底板）+ Navy 蜡烛 ×4（Navies 组挂屏心，双频 lissajous 漂移）；
 * 左下设置齿轮 (100,860)、右上"?" (1240,40)。
 */
import Phaser from "phaser";
import { ATLAS_CHARS, ATLAS_MENU, ensureMenuBgm, FONT_MAIN, startBgWarm } from "./BootScene";
import { clickSfx } from "./overlays";
import { fadeSwitch } from "./transition";
import { takeFirstComplete } from "../progress";

/** 光柱动态态（oracle :1094049 创建期随机相位/速度） */
interface Beam extends Phaser.GameObjects.Image {
  tOffset: number;
  tSpeed: number;
}
/** 蜡烛动态态（oracle Navies :1091311-:1091971） */
interface Navy extends Phaser.GameObjects.Image {
  cart: { x: number; y: number };
  offR: number;
  rprime: number;
  sR: number;
  sT: number;
  theta: number;
  r: number;
}

export class MenuScene extends Phaser.Scene {
  private beams: Beam[] = [];
  private navies: Navy[] = [];
  private t = 0;

  constructor() {
    super("Menu");
  }

  create(): void {
    const W = this.scale.width;
    const H = this.scale.height;

    // 背景（大厅全景）：cover 缩放（原版 s = max(w/bkgW, h/bkgH)——图 1366×768 ×1.25 → 1708×960）
    const hall = this.textures.get("TempleHall").getSourceImage() as HTMLImageElement;
    const cover = Math.max(W / hall.width, H / hall.height);
    this.add.image(W / 2, H / 2, "TempleHall").setScale(cover);

    // 光柱 ×8（oracle TempleHall :1094049 区字节直证：8 根全部 make.sprite(0,0)——组=root 中心，
    // 无任何 x 赋值，即全部位于屏心；anchor(0.5,-0.5) 从顶垂入；alpha=0.6+0.4·rand（创建期恒定）；
    // t_offset=2π(i−k/2)/k−rand·π/6、t_speed=0.6·rand（k=8）；SCREEN 混合。Beam.png 159×846，
    // y 尺 846×1.25=1057.5 满屏高。动态见 update。）
    this.beams = Array.from({ length: 8 }, (_, i) => {
      const b = this.add
        .image(W / 2, 0, "Beam")
        .setOrigin(0.5, -0.5)
        .setBlendMode(Phaser.BlendModes.SCREEN)
        .setAlpha(0.6 + 0.4 * Math.random())
        .setDepth(1) as Beam;
      b.tOffset = (2 * Math.PI * (i - 4)) / 8 - (Math.random() * Math.PI) / 6;
      b.tSpeed = 0.6 * Math.random();
      return b;
    });

    // 品牌 logo（原版 kizi 位，顶部中央）
    this.add.image(W / 2, 93, "KiziLogo").setOrigin(0.5);

    // 标题
    this.add.image(W / 2, 288, "GameName").setOrigin(0.5).setDepth(3);

    // 火/水角色：0.95 缩放 legs/head 同心叠放（原版 createSprites 子元素全部 (0,0) anchor .5）
    for (const role of ["fire", "water"] as const) {
      const x = role === "fire" ? 320 : 960;
      const y = 875;
      this.add.image(x, y + 40, ATLAS_CHARS, `${role}_glow0000`).setOrigin(0.5).setDepth(2);
      this.add.image(x, y, ATLAS_CHARS, `${role}_legs_idle0000`).setOrigin(0.5).setScale(0.95).setDepth(3);
      const head = this.add
        .sprite(x, y, ATLAS_CHARS, `${role}_head_idle0000`)
        .setOrigin(0.5)
        .setScale(0.95)
        .setDepth(4);
      head.play(`${role}_idle`);
    }

    // Play：72px 位图字（原版 251×76 无底板）+ 交互区；GoldButton 按压语义（oracle :1089911：
    // 无换帧、label 0.95 + pusher 音）
    const playTxt = this.add.bitmapText(W / 2, 513, FONT_MAIN, "开始游戏", 72).setOrigin(0.5, 0.5).setDepth(4);
    this.add
      .zone(W / 2, 513, 300, 100)
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true })
      .setDepth(5)
      .on("pointerdown", () => playTxt.setScale(0.95))
      .on("pointerup", () => {
        playTxt.setScale(1);
        clickSfx(this);
        // 进选关黑幕（oracle Menu.startTemple fade("levelMenu") :1941847）
        fadeSwitch(this.game, () => this.scene.start("Temple"));
      })
      .on("pointerupoutside", () => playTxt.setScale(1));

    // Navy 蜡烛 ×4（oracle Navies :1090834 区：组挂 TempleHall 原点=屏心，每根随机——
    // scale=0.3+0.7·rand、offsetCart=(±100,±25)、offset.r=400·rand、speed.r=7e-4+5e-4·rand、
    // speed.theta=3e-4+5e-4·(rand−.5)、pos.theta=rand·2π；update 见下。旧「按钮组相对位静态
    // 摆位+yoyo tween」无 bundle 支持，按字节真相重写。）
    for (let i = 0; i < 4; i++) {
      const dust = this.add.image(W / 2, H / 2, ATLAS_MENU, "Navy0000").setDepth(3) as Navy;
      dust.setScale(0.3 + 0.7 * Math.random());
      dust.cart = { x: 200 * (Math.random() - 0.5), y: 50 * (Math.random() - 0.5) };
      dust.offR = 400 * Math.random();
      dust.rprime = 0;
      dust.sR = 7e-4 + 5e-4 * Math.random();
      dust.sT = 3e-4 + 5e-4 * (Math.random() - 0.5);
      dust.theta = Math.random() * Math.PI * 2;
      dust.r = Math.random();
      this.navies.push(dust);
    }

    // 左下设置齿轮 + 右上"?"（oracle :1940071 区：帧 0002/0003=非 multi 分支，按压换帧+pusher 音；
    // "?"=GoldButton 同族 label 0.95+pusher 音——按压语义，无 hover）
    const gear = this.add
      .image(100, 860, ATLAS_MENU, "SettingsButton0002")
      .setInteractive({ useHandCursor: true })
      .setDepth(5);
    gear.on("pointerdown", () => gear.setFrame("SettingsButton0003"));
    gear.on("pointerup", () => {
      gear.setFrame("SettingsButton0002");
      clickSfx(this);
      this.scene.launch("SettingsScene");
    });
    gear.on("pointerupoutside", () => gear.setFrame("SettingsButton0002"));
    const creditsTxt = this.add
      .bitmapText(1240, 40, FONT_MAIN, "?", 30)
      .setOrigin(0.5)
      .setDepth(5)
      .setInteractive({ useHandCursor: true });
    creditsTxt.on("pointerdown", () => creditsTxt.setScale(0.95));
    creditsTxt.on("pointerup", () => {
      creditsTxt.setScale(1);
      clickSfx(this);
      this.scene.launch("CreditsScene");
    });
    creditsTxt.on("pointerupoutside", () => creditsTxt.setScale(1));

    // 菜单 BGM（settings.music 门控）：r22 件1 起它不在 Boot 阻塞批里，键多半还没入缓存，
    // 由下面 delayedCall 的 ensureMenuBgm 取回后起播——首帧不再有义务等这 150.1KB。

    // 全 3 星首通庆典·消费点 2/2（P-02 #34，0.3.40）：本场景≡oracle Menu，afterAddContent
    // （:1939446/:1939549）与 LevelMenu 同款检查——通关时刻置位（main.ts won 分支），此处读即清。
    // launch 并行景=oracle bare start clearWorld=!1 显示表保留的 Phaser 3 等价物（字节链详见
    // TempleScene 消费点注）；先到先得，与 Temple 消费点共用同一瞬态旗。
    if (takeFirstComplete()) this.scene.launch("CompleteScene");

    // 后台暖装游戏内四图集+音频批（r5 冷启动装载序整形；r6 并入音频）：利用玩家在
    // 开始界面的驻留把 ground/mech/temple/popup 与游戏内 18 音频键提前拉齐，进 Game 时
    // GameScene.preload 通常全命中缓存零装载。
    // 延迟 120ms：先让 Menu 首帧独占渲染/解码，再开始后台拉取（不与首帧抢线程）；
    // 立刻建房时 enterGame 会等暖装落定再切 Game（BootScene.bgWarmSettled），
    // 不与 GameScene 兜底装载形成双载竞态。
    // r22 件1：菜单曲排在这一步**之前**——它单独占一段管道时到达最快（150.1KB，四图集没来抢），
    // 暖装排在它落定之后。饱和管道下总时长是字节账（r20 归因律），串行不比并行贵，故进房路径
    // 与今日等价，而 Menu 里程碑不再为这支曲子等 307ms@4g。
    this.time.delayedCall(120, () => ensureMenuBgm(this, () => startBgWarm(this)));
  }

  update(_time: number, delta: number): void {
    void _time;
    void delta;
    // oracle 帧驱动（:1097040 t+=0.003/帧、:1097136/:1097166 摆动/摆幅/宽脉冲；
    // :1091591 区蜡烛双频 lissajous）
    this.t += 0.003;
    for (const b of this.beams) {
      const phase = b.tOffset + this.t * b.tSpeed;
      const s = Math.sin(phase);
      b.rotation = 0.2 * s;
      b.y = -480 - 528.75 - Math.abs(s) * 240; // −H/2 − 846·1.25/2 − |sin|·H/4
      b.setScale(0.6 + 0.4 * Math.abs(s), 1.25); // 屏显宽 95..159 × 高 1057.5
    }
    for (const n of this.navies) {
      n.rprime += n.sR;
      n.r = n.offR * Math.sin(n.rprime);
      n.theta += n.sT;
      n.x = 640 + n.cart.x + n.r * Math.cos(n.theta);
      n.y = 480 + n.cart.y + n.r * Math.sin(n.theta);
    }
  }
}
