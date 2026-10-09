/**
 * 设置/制作人员/全通关三个弹窗（原版 SettingsMenu/CreditsMenu/GameCompleteMenu 复刻）。
 * 复用 overlays 的板与 StoneButton（IngameMenu 基类形制）；子元素一律板内局部坐标
 * （板 1082×642，容器 (64,159)，板内中心 (541,321)）。
 * - SettingsScene：Music/Fx 双开关（原版 keyboard 模式布局，bundle:43824-43920），
 *   切换即时生效并持久化（settings.ts）。
 * - CreditsScene：右上"?"进入，制作名单按原版 ch 字典（bundle:45885-45925）。
 * - CompleteScene：48 关全 3 星首通一次性彩带雨（Confetti0000-3）+ 恭喜弹窗（bundle:45603-45721）。
 */
import Phaser from "phaser";
import { ATLAS_MENU, ATLAS_POPUP, FONT_MAIN } from "./BootScene";
import { buildBoard, stoneButton } from "./overlays";
import { getSettings, setSettings } from "../settings";

const W = 1280;
const H = 960;
/** 板内中心（板局部系） */
const CX = 541;
const TITLE_Y = 40;
const OK_Y = 502;

/** 设置面板（叠于任意活动场景；音乐开关即时启停 BGM） */
export class SettingsScene extends Phaser.Scene {
  constructor() {
    super("SettingsScene");
  }
  create(): void {
    const board = buildBoard(this);
    board.add(this.add.bitmapText(CX, TITLE_Y, FONT_MAIN, "设置", 36).setOrigin(0.5, 0.5));
    const applyMusic = (): void => {
      const st = getSettings();
      if (st.music) {
        // 菜单态即时恢复 BGM（Game 态由下次 bgmKey 播放时自然生效）
        const act = this.game.scene.getScenes(true).map((s) => s.scene.key);
        if ((act.includes("Menu") || act.includes("Temple")) && !this.sound.isPlaying("bgm_menu")) {
          this.sound.play("bgm_menu", { loop: true });
        }
      } else {
        this.sound.stopByKey("bgm_menu");
        this.sound.stopByKey("bgm_level");
        this.sound.stopByKey("bgm_level_speed");
      }
    };
    // Music / Fx 双开关（原版 keyboard 模式两钮 + Ok）
    const toggleRow = (y: number, label: string, key: "music" | "fx", text: string): void => {
      const img = this.add
        .image(CX - 120, y, ATLAS_MENU, `${label}Button${getSettings()[key] ? "0000" : "0001"}`)
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true });
      const txt = this.add.bitmapText(CX + 60, y, FONT_MAIN, text, 26).setOrigin(0, 0.5);
      img.on("pointerup", () => {
        const next = setSettings({ [key]: !getSettings()[key] });
        img.setFrame(`${label}Button${next[key] ? "0000" : "0001"}`);
        if (key === "music") applyMusic();
      });
      board.add([img, txt]);
    };
    toggleRow(CY0() - 60, "Music", "music", "音乐");
    toggleRow(CY0() + 60, "Fx", "fx", "音效");
    stoneButton(this, board, CX, OK_Y, "好的", () => this.scene.stop());
  }
}

/** 板内竖直中心（321） */
function CY0(): number {
  return 321;
}

/** 制作人员（原版 CreditsMenu：ch 字典名单） */
export class CreditsScene extends Phaser.Scene {
  constructor() {
    super("CreditsScene");
  }
  create(): void {
    const board = buildBoard(this);
    board.add(this.add.bitmapText(CX, TITLE_Y, FONT_MAIN, "制作人员", 36).setOrigin(0.5, 0.5));
    const lines = ["本复刻基于原版游戏", "Oslo Albet", "Anna Tamarit", "Jan Villanueva", "septimania 2018"];
    lines.forEach((line, i) => {
      board.add(
        this.add
          .bitmapText(CX, CY0() - 110 + i * 52, FONT_MAIN, line, i === 0 ? 20 : 28)
          .setOrigin(0.5, 0.5)
          .setAlpha(i === 0 ? 0.7 : 1)
      );
    });
    stoneButton(this, board, CX, OK_Y, "好的", () => this.scene.stop());
  }
}

/** 全 3 星首通：彩带雨 + 恭喜（原版 Complete/GameCompleteMenu） */
export class CompleteScene extends Phaser.Scene {
  constructor() {
    super("CompleteScene");
  }
  create(): void {
    const board = buildBoard(this);
    // 彩带雨（Confetti0000-3，顶部随机下落旋转；两波 ≈4.5s，纯视觉不阻塞交互）
    const confetti = (): void => {
      for (let i = 0; i < 60; i++) {
        const f = `Confetti${String(i % 4).padStart(4, "0")}`;
        const c = this.add
          .image(Math.random() * W, -20 - Math.random() * 200, ATLAS_POPUP, f)
          .setDepth(3)
          .setRotation(Math.random() * Math.PI);
        this.tweens.add({
          targets: c,
          y: H + 40,
          rotation: c.rotation + (Math.random() * 4 - 2),
          duration: 1400 + Math.random() * 1200,
          onComplete: () => c.destroy(),
        });
      }
    };
    confetti();
    this.time.delayedCall(1500, confetti);
    board.add(this.add.bitmapText(CX, TITLE_Y, FONT_MAIN, "恭喜！", 36).setOrigin(0.5, 0.5));
    board.add(this.add.bitmapText(CX, TITLE_Y + 70, FONT_MAIN, "你完成了全部挑战", 28).setOrigin(0.5, 0.5));
    stoneButton(this, board, CX, OK_Y, "好的", () => this.scene.stop());
  }
}
