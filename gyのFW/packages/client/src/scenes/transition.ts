/**
 * 换屏黑幕转场（oracle StateManager.state.fade 字节级复刻，13 号档 §1.1；
 * bundle:2211744 overlay 工厂 / :2212785 s() 淡入 / :2213182 q() 淡出 / :2213815 fade 本体）。
 *
 * 机制：fadeSwitch(ops) → FadeScene launch（fading 门防重入，进行中重复触发丢弃=oracle 同）
 * → 黑 rect 500ms Linear 淡入 → 执行 ops（幕下换场景，oracle state.start 时点）→ 旧"overlay"
 * 丢弃、新 rect alpha=1 → 下一帧 500ms Linear 淡出 → stop。"Loading"位图字（FONT_MAIN 30 号，
 * 屏心）800ms 后现、300ms 点循环 "Loading..."/"Loading"/"Loading."/"Loading.."
 * （:2212125/:2212213）。oracle 中文字仅在 fade-in overlay 存活超 800ms（广告等待/异步装载）
 * 时可见；无广告环境 oracle 亦一闪而过——机制照移植，文字淡出段不显示（fade-out overlay
 * showText:false，:2213961）。黑幕 setInteractive 吞输入为防双击加固（oracle 无此防护，档卷注明）。
 *
 * 接线（oracle 8 处 fade 调用面 → 我方六点）：Menu Play→Temple、Temple back→Menu、
 * enterGame→Game、leaveToMenu→Temple、reloadLevel(advance 回声)→Game、__fwRestart→Game。
 * 不加黑幕（oracle bare start 同构）：EndMenu/GameOverMenu 出现、Boot→Menu 首入链、
 * PauseMenu 进出、CompleteScene launch。
 */
import Phaser from "phaser";
import { FONT_MAIN } from "./BootScene";

export const FADE_SCENE = "XFade";

const FADE_MS = 500;
const TEXT_DELAY_MS = 800;
const DOT_MS = 300;
const DOTS = ["Loading...", "Loading", "Loading.", "Loading.."];

export class FadeScene extends Phaser.Scene {
  private shade!: Phaser.GameObjects.Rectangle;
  private label!: Phaser.GameObjects.BitmapText;
  private t0 = 0;
  private switched = false;

  constructor() {
    super(FADE_SCENE);
  }

  create(): void {
    this.switched = false;
    this.t0 = this.time.now;
    this.shade = this.add.rectangle(640, 480, 1280, 960, 0x000000, 1).setDepth(1000).setInteractive();
    this.shade.alpha = 0;
    this.label = this.add.bitmapText(640, 480, FONT_MAIN, "Loading...", 30).setOrigin(0.5, 0.5).setDepth(1001);
    this.label.alpha = 0;
    this.tweens.add({
      targets: this.shade,
      alpha: 1,
      duration: FADE_MS,
      ease: "Linear",
      onComplete: () => {
        // 幕下换场景（oracle：淡入完成 → showAd → state.start）
        const ops = this.registry.get("xfade-ops") as (() => void) | undefined;
        this.registry.remove("xfade-ops");
        ops?.();
        this.switched = true;
        // oracle：旧 overlay（含文字）kill，新 overlay showText:false、alpha=1，下一 rAF 才起 q()
        this.label.alpha = 0;
        this.time.delayedCall(0, () => {
          this.tweens.add({
            targets: this.shade,
            alpha: 0,
            duration: FADE_MS,
            ease: "Linear",
            onComplete: () => this.scene.stop(),
          });
        });
      },
    });
  }

  update(): void {
    if (this.switched) return;
    const d = this.time.now - this.t0;
    if (d > TEXT_DELAY_MS) {
      this.label.alpha = 1;
      this.label.text = DOTS[Math.floor((d - TEXT_DELAY_MS) / DOT_MS) % 4];
    }
  }
}

/** 换屏带黑幕：fade-in(500ms) → ops()（幕下切场景）→ fade-out(500ms)。
 *  转场进行中的重复调用整体丢弃（oracle `if (!this.fading)` 门），ops 不执行。 */
export function fadeSwitch(game: Phaser.Game, ops: () => void): void {
  const sm = game.scene;
  if (sm.isActive(FADE_SCENE)) return;
  game.registry.set("xfade-ops", ops);
  sm.start(FADE_SCENE); // SceneManager.start 自带置顶（已注册场景，停歇态重启 create）
}
