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
/** 板滑出目标（容器顶左口径）＝1.5H−321=1119：板心停 1440=1.5·realHeight（oracle :1852057） */
const BOARD_OUT_Y = 1119;
/** 弹簧三常量（bundle :1850446/:1850514/:1852409 直证） */
const SPRING_FORCE = 2.3;
const SPRING_FRICTION = 0.7;
const SHADE_MAX = 0.7;
/** 板内中心（板 1082×642 的一半） */
const CX = 541;
const CY = 321;
/** 原版 contentSize 基准：halfWidth ≈ 433（0.8×板宽/2） */
const HALF_W = 433;
/** 字号口径（2026-10-13 推翻 ×1.6，一手证据见 note/research 20 §6）：Phaser2 与 Phaser3
 *  的位图字缩放语义完全一致——scale = fontSize / fnt.info.size(=48)，两引擎同一字体文件
 *  同名义字号渲染像素相同。此前 ×1.6 系口径混淆：oracle dump 的 h 是"墨迹高"（字形高×scale），
 *  我方 dH 是 lineHeight×scale 的对象高，二者相除得伪比值 1.6，实际把字放大了 1.6 倍。
 *  （时钟 24 号墨迹高 77×0.5=38.5≈39、按钮字 26 号 88×0.542≈48、时限 18 号 77×0.375≈29
 *  ——都是 oracle 名义字号下的原生结果，不是要乘 1.6 的理由。）*/

type Handle = Record<string, any>;
const handle = (): Handle => (globalThis as unknown as Handle) ?? {};

/** 板句柄：Container + show/hide（oracle IngameMenu :1850938/:1851068——show 置 visible=true，
 *  hide 仅翻 target=outside，visible 由 update 近 outside 判定收起） */
export type Board = Phaser.GameObjects.Container & {
  show(): void;
  hide(onSettledOut?: () => void): void;
};

/**
 * 板 + 动态黑幕 + 弹簧滑入/滑出（IngameMenu 基类复刻，六面同享）。
 * 非 tween：逐帧弹簧积分（oracle :1852409 区），dt 钳 0.04；黑幕 alpha 跟板位动态
 * `0.7·(1−(y−center)/(outside−center))`（:1852225），静止也每帧更新；静止门
 * |y−target|<1 且 |vy|<1；|y−outside|<3 → visible=false。比例式以容器顶左口径恒等：
 * (board.y−159)/960 ≡ (board.y+321−480)/(1440−480)。
 */
export function buildBoard(scene: Phaser.Scene): Board {
  const shade = scene.add.rectangle(640, 480, 1280, 960, 0x000000, 1).setDepth(0).setInteractive();
  shade.alpha = 0;
  const board = scene.add.container(BOARD_X, BOARD_OUT_Y).setDepth(1) as Board;
  board.add(scene.add.image(0, 0, ATLAS_POPUP, "PopupBackground0000").setOrigin(0, 0));
  let vy = 0;
  let target = BOARD_OUT_Y;
  let settledOutCb: (() => void) | null = null;
  const show = (): void => {
    target = BOARD_Y;
    board.setVisible(true);
  };
  const hide = (cb?: () => void): void => {
    settledOutCb = cb ?? null;
    target = BOARD_OUT_Y;
  };
  board.show = show;
  board.hide = hide;
  const tick = (): void => {
    if (!board.visible) return;
    shade.alpha = SHADE_MAX * (1 - (board.y - BOARD_Y) / (BOARD_OUT_Y - BOARD_Y));
    if (Math.abs(board.y - target) < 1 && Math.abs(vy) < 1) return;
    const dt = Math.min(0.04, scene.game.loop.delta / 1000);
    vy = (vy + (target - board.y) * SPRING_FORCE * dt) * SPRING_FRICTION;
    board.y += vy;
    if (Math.abs(board.y - BOARD_OUT_Y) < 3) {
      board.setVisible(false);
      const cb = settledOutCb;
      settledOutCb = null;
      cb?.();
    }
  };
  scene.events.on(Phaser.Scenes.Events.UPDATE, tick);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
    scene.events.off(Phaser.Scenes.Events.UPDATE, tick);
  });
  show(); // 创建即自屏外弹簧入场（oracle init 置 outside，create 调 show）
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
  const txt = scene.add.bitmapText(x, y - 14, FONT_MAIN, label, 26).setOrigin(0.5, 0.5);
  btn.on("pointerup", onClick);
  btn.on("pointerover", () => btn.setFrame("StoneButton0001"));
  btn.on("pointerout", () => btn.setFrame("StoneButton0000"));
  board.add([btn, txt]);
}

/** 暂停菜单（P 键 / 画布暂停钮 → main togglePause 启动） */
export class PauseMenu extends Phaser.Scene {
  private board?: Board;
  private closing = false;

  constructor() {
    super("PauseMenu");
  }
  create(): void {
    this.board = buildBoard(this);
    const board = this.board;
    board.add(this.add.bitmapText(CX, 40, FONT_MAIN, "暫停", 36).setOrigin(0.5, 0.5));
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
  /** 弹簧滑出关闭（oracle hide()→target=outside，近 outside 自动隐）。main.ts pause-changed
   *  回声路由至此；幂等，1.5s 兜底强停（防弹簧数值边缘不触发落位回调）。 */
  requestClose(): void {
    if (this.closing || !this.board) return;
    this.closing = true;
    this.board.hide(() => this.scene.stop());
    this.time.delayedCall(1500, () => this.scene.stop());
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
    // 勾叉节拍链（oracle :1876767 起 f=700 四级 _.delay 嵌套；各拍实参精确配对：
    // 拍0=j.visible&&f(:1876786)、拍1=j.visible&&f(:1877004)、拍2=g.visible&&f(:1877210)——g=钻石行
    // twoRows 隐藏 ⇒ 拍2 串联 0、拍3=m.visible&&f(:1877517) ⇒ general 累计 700/1400/2100/2800、
    // twoRows 700/1400/1400/2100。隐藏行不建图但音照拍（oracle 拍回调不看可见性 :1877004）。
    const rowTicks: Array<() => void> = [];
    rows.forEach((row, i) => {
      const y = 321 - 160.5 + (twoRows ? [60, 140, 140][i] : [20, 100, 180][i]);
      if (row.hide) {
        rowTicks.push(() => handle().__fwSfx?.("sfx_end_pass"));
        return;
      }
      board.add(this.add.image(294.5, y, ATLAS_POPUP, row.icon).setOrigin(0.5));
      const tick = this.add
        .image(387.5, y, ATLAS_POPUP, row.ok ? "TickIcon0000" : "CrossIcon0000")
        .setOrigin(0.5)
        .setVisible(false);
      board.add(tick);
      rowTicks.push(() => {
        tick.setVisible(true);
        handle().__fwSfx?.("sfx_end_pass");
      });
    });
    {
      const beatDelays = [700, 700, twoRows ? 0 : 700];
      let at = 0;
      beatDelays.forEach((d, i) => {
        at += d;
        this.time.delayedCall(at, rowTicks[i]);
      });
    }
    // 时间行时限文本（oracle 实拍：B1/4 位板心 (−244,+55) 中心锚定，内容=本关时限 mmss，静态）
    if (!twoRows && d.timeLimitSec > 0) {
      const m = Math.floor(d.timeLimitSec / 60);
      const s = d.timeLimitSec % 60;
      const limitStr = `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
      board.add(
        this.add.bitmapText(541 - 244, 321 + 55, FONT_MAIN, limitStr, 18).setOrigin(0.5, 0.5).setAlpha(0.7)
      );
    }
    // 星数由 main 按关卡类型算好传入（puzzle=银钻口径；general=1+钻石+限时）
    const stars = Math.max(1, Math.min(3, d.stars || 1));
    // 星碑贴图按关卡类型选变体（原版 44320-22：general/speed/puzzle/dark）；播分段键 to_N
    // （oracle :1876428 注册 1-7/8-14/15-21 @30fps once、:1877727 play("to_"+stars)——键注册于 BootScene）
    const stonePrefix = d.type === "puzzle" ? "FinishStonePuzzle" : d.type === "speed" ? "FinishStoneSpeed" : d.type === "dark" ? "FinishStoneDark" : "FinishStone";
    const stoneKey = stonePrefix === "FinishStone" ? `finish_stone_${stars}` : `finish_stone_${d.type}_${stars}`;
    const stone = this.add.sprite(721, 261, ATLAS_POPUP, stonePrefix + "0000").setOrigin(0.5);
    board.add(stone);
    // 原版指示箭头 popupArrow (5,−60)：指向星碑；末拍单帧 0001 恒亮（:1877517，全 bundle 仅
    // 生成/末拍两处引用、无动画注册——非闪烁，13 号档 #30）
    const arrow = this.add.sprite(546, 261, ATLAS_POPUP, "popupArrow0000").setOrigin(0.5);
    board.add(arrow);
    // 末拍同回调（oracle :1877700 内联序）：endDiamond 音 → 箭头 0001 → 星碑分段播放 → Continue 启用
    const finalAt = 700 + 700 + (twoRows ? 0 : 700) + 700;
    let enabled = false;
    this.time.delayedCall(finalAt, () => {
      handle().__fwSfx?.("sfx_end_diamond");
      arrow.setFrame("popupArrow0001");
      stone.play(stoneKey);
      enabled = true;
    });
    // Continue（与星碑同拍启用）：原版直进下一关；联机形态=活房间 advance 换关（main.ts __fwNextLevel）
    stoneButton(this, board, CX, 502, "继续", () => {
      if (!enabled) return;
      this.scene.stop();
      const h = handle() as unknown as { __fwNextLevel?: () => void; __fwLeaveToMenu?: () => void };
      if (h.__fwNextLevel) h.__fwNextLevel();
      else h.__fwLeaveToMenu?.();
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
    board.add(this.add.bitmapText(CX, 40, FONT_MAIN, "游戏结束", 36).setOrigin(0.5, 0.5));
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
