/**
 * 开始界面（原版 States/Menu/TempleHall 复刻；坐标经实机显示树二轮校准 2026-10-06）。
 * 实测：背景 TempleHallForest.jpg 1708×960 居中（大厅石柱是背景自带）；
 * 原版 8 根 Beam 光柱实际悬于屏幕外（y≈-1180，不可见）——不绘制；
 * KiziLogo 207×94 @ (640,93)；标题 GameNameForest 860×270 @ (640,288)；
 * 角色 0.95 缩放 legs/head 同心叠放 @ (320,875)/(960,875)，glow 于中心下 40px；
 * 「开始游戏」251×76 @ (640,513)（无底板）+ Navy 蜡烛 ×4（按钮组相对位）；
 * 左下设置齿轮 (100,860)、右上"?" (1240,40)。
 */
import Phaser from "phaser";
import { ATLAS_CHARS, ATLAS_MENU, FONT_MAIN, startBgWarm } from "./BootScene";
import { getSettings } from "../settings";

export class MenuScene extends Phaser.Scene {
  private beams: Phaser.GameObjects.Image[] = [];
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

    // 光柱 ×8（原版 TempleHall beams：anchor(0.5,-0.5) 使 y≈-1180 的柱体从顶部垂入画面约 887px，
    // SCREEN 混合 + alpha 0.6-1.0 = 顶部亮带；宽/高按实机 dump，x 按大厅柱间均布）。
    // update 里绕顶摆动（rotation = 0.2·sin）。
    const beamSpec: Array<[number, number, number]> = [
      // [x, y(center), width] —— 可视区均布（亮度带实测校准 2026-10-06）
      [80, -1180, 154],
      [240, -1230, 141],
      [400, -1232, 154],
      [560, -1021, 99],
      [720, -1135, 129],
      [880, -1154, 134],
      [1040, -1159, 135],
      [1200, -1079, 114],
    ];
    this.beams = beamSpec.map(([x, y, w], i) =>
      this.add
        .image(x, y, "Beam")
        .setOrigin(0.5, -0.5)
        .setDisplaySize(w, 1058 * cover)
        .setBlendMode(Phaser.BlendModes.SCREEN)
        .setAlpha(0.6 + 0.4 * ((i % 3) / 2))
        .setDepth(1)
    );

    // 品牌 logo（原版 kizi 位，顶部中央）
    this.add.image(W / 2, 93, "KiziLogo").setOrigin(0.5);

    // 标题
    this.add.image(W / 2, 288, "GameName").setOrigin(0.5).setDepth(3);

    // 火/水角色：0.95 缩放 legs/head 同心叠放（原版 createSprites 子元素全部 (0,0) anchor .5）
    for (const role of ["fire", "water"] as const) {
      const x = role === "fire" ? 320 : 960;
      const y = 875;
      this.add.image(x, y + 40, ATLAS_CHARS, `${role}_glow0000`).setOrigin(0.5).setAlpha(0.85).setDepth(2);
      this.add.image(x, y, ATLAS_CHARS, `${role}_legs_idle0000`).setOrigin(0.5).setScale(0.95).setDepth(3);
      const head = this.add
        .sprite(x, y, ATLAS_CHARS, `${role}_head_idle0000`)
        .setOrigin(0.5)
        .setScale(0.95)
        .setDepth(4);
      head.play(`${role}_idle`);
    }

    // Play：72px 位图字（原版 251×76 无底板）+ 交互区
    this.add.bitmapText(W / 2, 513, FONT_MAIN, "开始游戏", 72).setOrigin(0.5, 0.5).setDepth(4);
    this.add
      .zone(W / 2, 513, 300, 100)
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true })
      .setDepth(5)
      .on("pointerup", () => this.scene.start("Temple"));

    // Navy 蜡烛/装饰 ×4（按钮组相对位 (145,-8)/(105,-63)/(63,-223)/(37,29) → 屏幕）
    const navies: Array<[number, number]> = [
      [785, 505],
      [745, 450],
      [703, 290],
      [677, 542],
    ];
    navies.forEach(([nx, ny], i) => {
      const dust = this.add.image(nx, ny, ATLAS_MENU, "Navy0000").setDepth(3).setAlpha(0.95);
      this.tweens.add({
        targets: dust,
        y: ny - 14,
        duration: 1500 + i * 280,
        yoyo: true,
        repeat: -1,
        ease: "Sine.easeInOut",
      });
    });

    // 左下设置齿轮 + 右上"?"
    const gear = this.add
      .image(100, 860, ATLAS_MENU, "SettingsButton0002")
      .setInteractive({ useHandCursor: true })
      .setDepth(5);
    gear.on("pointerup", () => this.scene.launch("SettingsScene"));
    gear.on("pointerover", () => gear.setFrame("SettingsButton0003"));
    gear.on("pointerout", () => gear.setFrame("SettingsButton0002"));
    this.add
      .bitmapText(1240, 40, FONT_MAIN, "?", 30)
      .setOrigin(0.5)
      .setDepth(5)
      .setInteractive({ useHandCursor: true })
      .on("pointerup", () => this.scene.launch("CreditsScene"));

    // 菜单 BGM（settings.music 门控）
    if (getSettings().music && !this.sound.isPlaying("bgm_menu")) {
      this.sound.play("bgm_menu", { loop: true });
    }

    // 后台暖装游戏内四图集（r5 冷启动装载序整形）：利用玩家在开始界面的驻留把
    // ground/mech/temple/popup 提前拉齐，进 Game 时 GameScene.preload 只剩音频。
    // 延迟 120ms：先让 Menu 首帧独占渲染/解码，再开始后台拉取（不与首帧抢线程）；
    // 立刻建房时 enterGame 会等暖装落定再切 Game（BootScene.bgWarmSettled），
    // 不与 GameScene 兜底装载形成双载竞态。
    this.time.delayedCall(120, () => startBgWarm(this));
  }

  update(_time: number, delta: number): void {
    void _time;
    this.t += delta / 1000;
    this.beams.forEach((b, i) => {
      b.rotation = 0.2 * Math.sin(this.t * 0.8 + i * 0.9);
    });
  }
}
