/**
 * 游戏内弹窗三件套（原版 IngameMenu 基类 + PauseMenu/EndMenu/GameOverMenu 复刻）。
 * 以独立 Scene 叠于 GameScene 之上（scene.launch），Game 场景保持渲染
 * （won/gameover 时服务端已停步；pause 为本地停手，服务端继续——联机对齐 AFK 语义）。
 *
 * 板 = PopupBackground0000 1082×642，容器置于 (64,159)（居中）。
 * 子元素一律用板内局部坐标（板中心 = (541,321)）；screen = local + (64,159)。
 */
import Phaser from "phaser";
import { ATLAS_MENU, ATLAS_POPUP, FONT_MAIN } from "./BootScene";

const BOARD_X = 64;
const BOARD_Y = 159;
/** 板内中心（板 1082×642 的一半） */
const CX = 541;
const CY = 321;
/** 原版 contentSize 基准：halfWidth ≈ 433（0.8×板宽/2） */
const HALF_W = 433;

type Handle = Record<string, any>;
const handle = (): Handle => (globalThis as unknown as Handle) ?? {};

/** 板 + 黑幕 + 弹簧滑入（IngameMenu 基类复刻） */
export function buildBoard(scene: Phaser.Scene): Phaser.GameObjects.Container {
  const shade = scene.add.rectangle(640, 480, 1280, 960, 0x000000, 0.7).setDepth(0).setInteractive();
  const board = scene.add.container(BOARD_X, 960).setDepth(1);
  board.add(scene.add.image(0, 0, ATLAS_POPUP, "PopupBackground0000").setOrigin(0, 0));
  scene.tweens.add({ targets: board, y: BOARD_Y, duration: 420, ease: "Back.easeOut" });
  return board;
}


/** StoneButton（底图 + fontStone 文字，hover 换帧）；x/y = 板内局部坐标 */
export function stoneButton(
  scene: Phaser.Scene,
  board: Phaser.GameObjects.Container,
  x: number,
  y: number,
  label: string,
  onClick: () => void
): void {
  const btn = scene.add
    .image(x, y, ATLAS_MENU, "StoneButton0000")
    .setDisplaySize(252, 117)
    .setInteractive({ useHandCursor: true });
  const txt = scene.add.bitmapText(x, y, FONT_MAIN, label, 26).setOrigin(0.5, 0.5);
  btn.on("pointerup", onClick);
  btn.on("pointerover", () => btn.setFrame("StoneButton0001"));
  btn.on("pointerout", () => btn.setFrame("StoneButton0000"));
  board.add([btn, txt]);
}

/** 暂停菜单（P 键 / 画布暂停钮 → main togglePause 启动） */
export class PauseMenu extends Phaser.Scene {
  constructor() {
    super("PauseMenu");
  }
  create(): void {
    const board = buildBoard(this);
    board.add(this.add.bitmapText(CX, 40, FONT_MAIN, "已暂停", 36).setOrigin(0.5, 0.5));
    stoneButton(this, board, CX + HALF_W / 3, 108, "重玩", () => {
      this.scene.stop();
      handle().__fwRestart?.();
    });
    stoneButton(this, board, CX - HALF_W / 3, 108, "返回菜单", () => {
      this.scene.stop();
      handle().__fwLeaveToMenu?.();
    });
    stoneButton(this, board, CX, 241, "继续游戏", () => {
      handle().__fwPauseKeyboard?.(false);
      this.scene.stop();
    });
  }
}

/** 通关面板（原版 EndMenu：三行 FinishCounter 逐行达成 + FinishStone 星动画 + Continue） */
export class EndMenu extends Phaser.Scene {
  constructor() {
    super("EndMenu");
  }
  create(): void {
    const d = (this.scene.settings.data ?? {}) as {
      diamonds: number;
      diamondsTotal: number;
      silver: number;
      timeSec: number;
      timeLimitSec: number;
      type: string;
      stars: number;
    };
    const board = buildBoard(this);
    // 原版 EndMenu：general 三行（Finish/Diamonds/Time）；puzzle 两行（Finish/Silver，钻石行隐藏）
    const rows: Array<{ icon: string; ok: boolean; limit?: string }> =
      d.type === "puzzle"
        ? [
            { icon: "FinishIcon0000", ok: true },
            { icon: "SilverIcon0000", ok: d.silver > 0 },
          ]
        : [
            { icon: "FinishIcon0000", ok: true },
            { icon: "DiamondsIcon0000", ok: d.diamonds >= d.diamondsTotal },
            { icon: "TimeIcon0000", ok: d.timeLimitSec > 0 && d.timeSec <= d.timeLimitSec, limit: `限时 ${d.timeLimitSec}s` },
          ];
    rows.forEach((row, i) => {
      const y = 60 + i * 80;
      board.add(this.add.image(341, y, ATLAS_POPUP, row.icon).setOrigin(0.5));
      if (row.limit) {
        board.add(
          this.add.bitmapText(301, y + 35, FONT_MAIN, row.limit, 18).setOrigin(0.5).setAlpha(0.7)
        );
      }
      const tick = this.add
        .image(433, y, ATLAS_POPUP, row.ok ? "TickIcon0000" : "CrossIcon0000")
        .setOrigin(0.5)
        .setVisible(false);
      board.add(tick);
      // 原版时序：每 700ms 逐行达成
      this.time.delayedCall(500 + i * 700, () => {
        tick.setVisible(true);
        if (row.ok) handle().__fwSfx?.("sfx_end_pass");
      });
    });
    // 星数由 main 按关卡类型算好传入（puzzle=银钻口径；general=1+钻石+限时）；帧段 1-7/8-14/15-21
    const stars = Math.max(1, Math.min(3, d.stars || 1));
    const stone = this.add.sprite(721, 161, ATLAS_POPUP, "FinishStone0000").setOrigin(0.5);
    board.add(stone);
    const endF = stars === 3 ? 21 : stars === 2 ? 14 : 7;
    this.anims.create({
      key: `finish-stars-${stars}`,
      frames: Array.from({ length: endF }, (_, n) => ({
        key: ATLAS_POPUP,
        frame: `FinishStone${String(n + 1).padStart(4, "0")}`,
      })),
      frameRate: 30,
    });
    this.time.delayedCall(500 + 3 * 700, () => {
      stone.play(`finish-stars-${stars}`);
      handle().__fwSfx?.("sfx_end_diamond");
    });
    // Continue（星动画后启用）
    let enabled = false;
    stoneButton(this, board, CX, 502, "继续", () => {
      if (!enabled) return;
      this.scene.stop();
      handle().__fwLeaveToMenu?.();
    });
    this.time.delayedCall(500 + 3 * 700 + 300, () => {
      enabled = true;
    });
  }
}

/** 失败面板（原版 GameOverMenu：Menu/Retry 双钮） */
export class GameOverMenu extends Phaser.Scene {
  constructor() {
    super("GameOverMenu");
  }
  create(): void {
    const board = buildBoard(this);
    board.add(this.add.bitmapText(CX, 40, FONT_MAIN, "Game Over", 36).setOrigin(0.5, 0.5));
    stoneButton(this, board, CX - 0.4 * HALF_W, 254, "返回菜单", () => {
      this.scene.stop();
      handle().__fwLeaveToMenu?.();
    });
    stoneButton(this, board, CX + 0.4 * HALF_W, 254, "重玩本关", () => {
      this.scene.stop();
      handle().__fwRestart?.();
    });
  }
}
