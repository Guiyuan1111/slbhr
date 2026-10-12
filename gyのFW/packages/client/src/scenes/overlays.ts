/**
 * 游戏内弹窗三件套（原版 IngameMenu 基类 + PauseMenu/EndMenu/GameOverMenu 复刻）。
 * 以独立 Scene 叠于 GameScene 之上（scene.launch），Game 场景保持渲染
 * （won/gameover 时服务端已停步；pause 为服务端权威全场物理冻结——F3 翻转 2026-10-11，
 * 原版 togglePause=game.paused 语义，任一端 P 键双端同冻结）。
 *
 * 板 = PopupBackground0000 1082×642，容器置于 (99,159)（水平 (1280-1082)/2=99、
 * 垂直 (960-642)/2=159 精确居中——oracle 实拍 2026-10-12 板心=视口中心，旧值 64 整板左偏 35px）。
 * 子元素一律用板内局部坐标（板中心 = (541,321)）；screen = local + (99,159)。
 */
import Phaser from "phaser";
import { ATLAS_MENU, ATLAS_POPUP, FONT_MAIN } from "./BootScene";

const BOARD_X = 99;
const BOARD_Y = 159;
/** 板内中心（板 1082×642 的一半） */
const CX = 541;
const CY = 321;
/** 原版 contentSize 基准：halfWidth ≈ 433（0.8×板宽/2） */
const HALF_W = 433;
/** 原版位图字实测缩放（oracle 实拍 2026-10-12：原版同名义字号的字形渲染高约为我们
 *  Phaser3 的 1.6 倍——时钟 24 号实测 39px 高、按钮字 26 号 49px 高、时限文本 18 号 29px 高）。
 *  按钮字 26→42、标题 36→58、时限 18→29 均由此换算。 */
const FONT_SCALE = 1.6;

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


/** StoneButton（底图 + fontStone 文字，hover 换帧）；x/y = 板内局部坐标。
 *  oracle 实拍：标签 86×49、位于按钮中心上方 −14（2026-10-12）。 */
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
  const txt = scene.add.bitmapText(x, y - 14, FONT_MAIN, label, Math.round(26 * FONT_SCALE)).setOrigin(0.5, 0.5);
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
    board.add(this.add.bitmapText(CX, 40, FONT_MAIN, "暫停", Math.round(36 * FONT_SCALE)).setOrigin(0.5, 0.5));
    stoneButton(this, board, CX + HALF_W / 3, 108, "再试一次", () => {
      this.scene.stop();
      handle().__fwRestart?.();
    });
    stoneButton(this, board, CX - HALF_W / 3, 108, "返回菜单", () => {
      this.scene.stop();
      handle().__fwLeaveToMenu?.();
    });
    stoneButton(this, board, CX, 241, "继续", () => {
      // F3：经 __fwTogglePause 发 resume 给服务端；菜单由 pause-changed 回声统一关闭
      // （本地不抢停——若对端已解除，回声早已关掉本面板，此钮不会存在）
      handle().__fwTogglePause?.();
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
    // 原版 EndMenu @1917750（renderContent + layoutContent @1919230）：
    //   行 y = 板中心 + (−0.5·halfHeight + {20,100,180})（general 三行；halfHeight=板高/2=321 → +180.5/260.5/340.5）；
    //   puzzle/dark 两行 +60/+140 且钻石行隐藏；行组 x=−200（图标中心=行组−e.width/2=−246.5、勾叉=+46.5）；
    //   星碑 (180,−60)、popupArrow (5,−60)、Continue (0, halfHeight−140)；逐行达成 700ms 节拍。
    // 板内中心 (541,321) 换算：图标 x=294.5、勾叉 x=387.5、星碑 (721,261)、箭头 (546,261)、Continue (541,502)。
    // （2026-10-12 勘误重排：旧版行位 60/140/220 偏上 120px、偏右 46px，星碑偏上 100px，箭头漏画。）
    // （2026-10-12 二次勘误（oracle 实拍终结面板子树）：原版时间行下方确有一条**时限**静态文本
    //  ——"00:40"=temple.json 的 time 限值、位板心 (−244,+55)、18 号字形实测 29px 高；此前"原版无
    //  任何数值文本"判定过宽：镜像注入物的真实手法是把这条时限文本**替换成用时文本**，现按原版
    //  语义恢复时限；行组/勾叉/星碑/箭头/Continue 坐标全部与实拍一致（行 −140/−60/+20、
    //  星碑 (180,−60)、箭头 (5,−60)、Continue (0,181)）。）
    const twoRows = d.type === "puzzle" || d.type === "dark";
    const rows: Array<{ icon: string; ok: boolean; hide?: boolean }> = [
      { icon: "FinishIcon0000", ok: true },
      { icon: "DiamondsIcon0000", ok: d.diamonds >= d.diamondsTotal, hide: twoRows },
      { icon: d.type === "puzzle" ? "SilverIcon0000" : "TimeIcon0000", ok: twoRows ? d.silver > 0 : d.timeLimitSec > 0 && d.timeSec <= d.timeLimitSec },
    ];
    rows.forEach((row, i) => {
      const y = 321 - 160.5 + (twoRows ? [60, 140, 140][i] : [20, 100, 180][i]);
      if (row.hide) return;
      board.add(this.add.image(294.5, y, ATLAS_POPUP, row.icon).setOrigin(0.5));
      const tick = this.add
        .image(387.5, y, ATLAS_POPUP, row.ok ? "TickIcon0000" : "CrossIcon0000")
        .setOrigin(0.5)
        .setVisible(false);
      board.add(tick);
      // 原版时序：每 700ms 逐行达成（f=700 起 _.delay 步进）
      this.time.delayedCall(700 + i * 700, () => {
        tick.setVisible(true);
        handle().__fwSfx?.("sfx_end_pass");
      });
    });
    // 时间行时限文本（oracle 实拍：B1/4 位板心 (−244,+55) 中心锚定，内容=本关时限 mmss，静态）
    if (!twoRows && d.timeLimitSec > 0) {
      const m = Math.floor(d.timeLimitSec / 60);
      const s = d.timeLimitSec % 60;
      const limitStr = `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
      board.add(
        this.add.bitmapText(541 - 244, 321 + 55, FONT_MAIN, limitStr, Math.round(18 * FONT_SCALE)).setOrigin(0.5, 0.5)
      );
    }
    // 星数由 main 按关卡类型算好传入（puzzle=银钻口径；general=1+钻石+限时）；帧段 1-7/8-14/15-21
    const stars = Math.max(1, Math.min(3, d.stars || 1));
    // 星碑贴图按关卡类型选变体（原版 44320-22：general/speed/puzzle/dark）
    const stonePrefix = d.type === "puzzle" ? "FinishStonePuzzle" : d.type === "speed" ? "FinishStoneSpeed" : d.type === "dark" ? "FinishStoneDark" : "FinishStone";
    const stone = this.add.sprite(721, 261, ATLAS_POPUP, stonePrefix + "0000").setOrigin(0.5);
    board.add(stone);
    // 原版指示箭头 popupArrow (5,−60)：指向星碑；图集恰两帧 0000/0001，原版为闪烁指示（实拍 0001）
    const arrow = this.add.sprite(546, 261, ATLAS_POPUP, "popupArrow0000").setOrigin(0.5);
    board.add(arrow);
    if (!this.anims.exists("popup-arrow-blink")) {
      this.anims.create({
        key: "popup-arrow-blink",
        frames: [
          { key: ATLAS_POPUP, frame: "popupArrow0000" },
          { key: ATLAS_POPUP, frame: "popupArrow0001" },
        ],
        frameRate: 2,
        repeat: -1,
      });
    }
    arrow.play("popup-arrow-blink");
    const endF = stars === 3 ? 21 : stars === 2 ? 14 : 7;
    this.anims.create({
      key: `finish-stars-${stars}`,
      frames: Array.from({ length: endF }, (_, n) => ({
        key: ATLAS_POPUP,
        frame: `${stonePrefix}${String(n + 1).padStart(4, "0")}`,
      })),
      frameRate: 30,
    });
    this.time.delayedCall(700 + 3 * 700, () => {
      stone.play(`finish-stars-${stars}`);
      handle().__fwSfx?.("sfx_end_diamond");
    });
    // Continue（星动画后启用）：原版直进下一关；联机形态=活房间 advance 换关（main.ts __fwNextLevel）
    let enabled = false;
    stoneButton(this, board, CX, 502, "继续", () => {
      if (!enabled) return;
      this.scene.stop();
      const h = handle() as unknown as { __fwNextLevel?: () => void; __fwLeaveToMenu?: () => void };
      if (h.__fwNextLevel) h.__fwNextLevel();
      else h.__fwLeaveToMenu?.();
    });
    this.time.delayedCall(700 + 3 * 700 + 300, () => {
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
    board.add(this.add.bitmapText(CX, 40, FONT_MAIN, "游戏结束", Math.round(36 * FONT_SCALE)).setOrigin(0.5, 0.5));
    stoneButton(this, board, CX - 0.4 * HALF_W, 254, "返回菜单", () => {
      this.scene.stop();
      handle().__fwLeaveToMenu?.();
    });
    stoneButton(this, board, CX + 0.4 * HALF_W, 254, "再试一次", () => {
      this.scene.stop();
      handle().__fwRestart?.();
    });
  }
}
