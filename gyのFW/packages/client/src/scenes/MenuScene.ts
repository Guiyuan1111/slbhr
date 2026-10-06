/**
 * 开始界面（原版 States/Menu/TempleHall + Menu 复刻；坐标经实机显示树实测校正）。
 * 实测（1280×960）：背景 TempleHallForest.jpg 1708×960；石柱 8 根（Beam.png ~107-154×1058）；
 * 标题 GameNameForest.png 860×270 @ 中心系 (0,−192)；Play 文字 ~251×76 @ (0,33)（无底板，
 * 周围 Navy0000 蜡烛×5）；火/水角色 @ (±320, 395)（glow+legs+head，约 330 高）。
 */
import Phaser from "phaser";
import { ATLAS_CHARS, ATLAS_MENU, FONT_MAIN } from "./BootScene";

export class MenuScene extends Phaser.Scene {
  private pillars: Phaser.GameObjects.Image[] = [];
  private t = 0;

  constructor() {
    super("Menu");
  }

  create(): void {
    const W = this.scale.width;
    const H = this.scale.height;

    // 背景：TempleHallForest.jpg 1708×960，居中（左右各裁 214px）
    this.add.image(W / 2, H / 2, "TempleHall");

    // 石柱 ×8（Beam.png）：均匀分布，全高，微差宽度
    for (let i = 0; i < 8; i++) {
      const x = W * ((i + 0.5) / 8) + (i % 2 === 0 ? -14 : 14);
      this.pillars.push(
        this.add
          .image(x, H / 2 - 30, "Beam")
          .setDisplaySize(118 + (i % 3) * 14, H + 100)
          .setDepth(1)
      );
    }

    // 标题 GameNameForest.png 860×270 @ 中心系 (0,−192) → 屏幕 (640, 288)
    this.add.image(W / 2, 288, "GameName").setOrigin(0.5).setDepth(3);

    // 火/水角色 @ (±320, 875)：glow + legs + head（head 叠放于腿上方）
    for (const role of ["fire", "water"] as const) {
      const x = role === "fire" ? 320 : 960;
      const y = 875;
      this.add.image(x, y - 60, ATLAS_CHARS, `${role}_glow0000`).setAlpha(0.6).setDepth(2);
      const legs = this.add.image(x, y, ATLAS_CHARS, `${role}_legs_idle0000`).setOrigin(0.5, 1).setDepth(3);
      const head = this.add
        .sprite(x, y - legs.height + 10, ATLAS_CHARS, `${role}_head_idle0000`)
        .setOrigin(0.5, 1)
        .setDepth(4);
      head.play(`${role}_idle`);
    }

    // Play：bitmapText「开始游戏」@ (640, 513)，~72px（原版逐字 sprite 合成 251×76），无底板
    this.add
      .bitmapText(W / 2, 513, FONT_MAIN, "开始游戏", 72)
      .setOrigin(0.5, 0.5)
      .setDepth(4);
    const zone = this.add
      .zone(W / 2, 513, 300, 100)
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true })
      .setDepth(5);
    zone.on("pointerup", () => this.scene.start("Temple"));

    // Navy0000 蜡烛/装饰 ×5（按钮周围）
    for (let i = 0; i < 5; i++) {
      const dust = this.add
        .image(W / 2 + (i - 2) * 78, 470, ATLAS_MENU, "Navy0000")
        .setDepth(3)
        .setAlpha(0.9);
      this.tweens.add({
        targets: dust,
        y: 440 + (i % 2) * 18,
        duration: 1500 + i * 280,
        yoyo: true,
        repeat: -1,
        ease: "Sine.easeInOut",
      });
    }
  }

  update(_time: number, delta: number): void {
    void _time;
    this.t += delta / 1000;
    // 石柱入场微动（原版有入场动画；稳态后静止，这里保留轻微呼吸感）
    this.pillars.forEach((p, i) => {
      p.setY(this.scale.height / 2 - 30 + Math.sin(this.t * 0.6 + i) * 2);
    });
  }
}
