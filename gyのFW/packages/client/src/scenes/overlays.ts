/**
 * 游戏内弹窗三件套（原版 IngameMenu 基类 + PauseMenu/EndMenu/GameOverMenu 复刻）。
 * 以独立 Scene 叠于 GameScene 之上（scene.launch），Game 场景保持渲染
 * （won/gameover 时服务端已停步；pause 为服务端权威全场物理冻结——F3 翻转 2026-10-11，
 * 原版 togglePause=game.paused 语义，任一端 P 键双端同冻结）。
 *
 * 板 = PopupBackground0000 1082×642，容器精确居中（1280×960 视口下 (99,159)——
 * oracle 实拍 2026-10-12 板心=视口中心，旧值 64 整板左偏 35px）。0.3.39 起整板随
 * 视口自适应缩放（oracle fixToCamera :1851667 公式，buildBoard 内推导；现视口 =1 恒等）。
 * 子元素一律用板内局部坐标（板中心 = (541,321)）；1280×960 下 screen = local + (99,159)。
 */
import Phaser from "phaser";
import { ATLAS_MENU, ATLAS_POPUP, FONT_MAIN } from "./BootScene";
import { getSettings } from "../settings";

/** 板原生尺寸（PopupBackground0000 帧 1082×642，sourceSize 实测；运行时以纹理帧为准） */
const BOARD_W = 1082;
const BOARD_H = 642;
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
  // —— 自适应几何（13 号档 #9，0.3.39；oracle fixToCamera :1851667 区逐式复刻：
  //    a=Math.min(1, Math.min(realWidth/boardBg.texture.frame.width, realHeight/boardBg.texture.frame.height)); board.scale.set(a)。
  //    现视口 1280×960 ⇒ a=1，boardX/Y=99/159、outY=1119、黑幕 1280×960——与旧固定值逐位恒等（零视觉差，档口径"自适应公式落地"）；
  //    行程恒等式 outY−Y=H 与 a 无关，黑幕 alpha 比例式不变形。CX/CY/HALF_W 为板局部系，容器缩放自动生效。）
  const W = scene.scale.width;
  const H = scene.scale.height;
  const popupFrame = scene.textures.get(ATLAS_POPUP).get("PopupBackground0000");
  const boardScale = Math.min(1, Math.min(W / popupFrame.width, H / popupFrame.height));
  const boardX = (W - BOARD_W * boardScale) / 2;
  const boardY = (H - BOARD_H * boardScale) / 2;
  /** 板滑出目标（容器顶左口径）：板心停 1.5H（oracle outside.y=1.5·realHeight :1852057） */
  const boardOutY = 1.5 * H - CY * boardScale;
  const shade = scene.add.rectangle(W / 2, H / 2, W, H, 0x000000, 1).setDepth(0).setInteractive();
  shade.alpha = 0;
  const board = scene.add.container(boardX, boardOutY).setDepth(1).setScale(boardScale) as Board;
  board.add(scene.add.image(0, 0, ATLAS_POPUP, "PopupBackground0000").setOrigin(0, 0));
  let vy = 0;
  let target = boardOutY;
  let settledOutCb: (() => void) | null = null;
  const show = (): void => {
    target = boardY;
    board.setVisible(true);
  };
  const hide = (cb?: () => void): void => {
    settledOutCb = cb ?? null;
    target = boardOutY;
  };
  board.show = show;
  board.hide = hide;
  const tick = (): void => {
    if (!board.visible) return;
    shade.alpha = SHADE_MAX * (1 - (board.y - boardY) / (boardOutY - boardY));
    if (Math.abs(board.y - target) < 1 && Math.abs(vy) < 1) return;
    const dt = Math.min(0.04, scene.game.loop.delta / 1000);
    vy = (vy + (target - board.y) * SPRING_FORCE * dt) * SPRING_FRICTION;
    board.y += vy;
    if (Math.abs(board.y - boardOutY) < 3) {
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


/** pusher 点击音（oracle Button 基类统一 `settings.fx && currentSounds.pusher.play()`，
 *  :1088100 区；键在 AUDIO_SFX 清单，Menu 暖装 120ms 后可用，极早点击缺键仅 console 警告） */
export function clickSfx(scene: Phaser.Scene): void {
  if (!getSettings().fx) return;
  scene.sound.play("sfx_pusher");
}

/** StoneButton（底图 + fontStone 文字）；x/y = 板内局部坐标。
 *  oracle 实拍：标签 86×49、位于按钮中心上方 −14（2026-10-12）。
 *  按压语义（oracle Button :1088674 区——mousedown 换帧+label 0.95，mouseup 复位+fx 门控
 *  pusher 音+回调，窗外松开只复位；无 hover 事件）：opts.disabled 为真时不换帧不回调（oracle 同）。 */
export function stoneButton(
  scene: Phaser.Scene,
  board: Phaser.GameObjects.Container,
  x: number,
  y: number,
  label: string,
  onClick: () => void,
  opts?: { disabled?: () => boolean }
): void {
  const btn = scene.add
    .image(x, y, ATLAS_MENU, "StoneButton0000")
    .setDisplaySize(252, 117)
    .setInteractive({ useHandCursor: true });
  const txt = scene.add.bitmapText(x, y - 14, FONT_MAIN, label, 26).setOrigin(0.5, 0.5);
  btn.on("pointerdown", () => {
    if (opts?.disabled?.()) return;
    btn.setFrame("StoneButton0001");
    txt.setScale(0.95);
  });
  btn.on("pointerup", () => {
    btn.setFrame("StoneButton0000");
    txt.setScale(1);
    if (opts?.disabled?.()) return;
    clickSfx(scene);
    onClick();
  });
  btn.on("pointerupoutside", () => {
    btn.setFrame("StoneButton0000");
    txt.setScale(1);
  });
  board.add([btn, txt]);
}

/** 暂停菜单（P 键 / 画布暂停钮 → main togglePause 启动） */
export class PauseMenu extends Phaser.Scene {
  private board?: Board;
  private closing = false;

  constructor() {
    super("PauseMenu");
  }
  /** 场景实例在 stop/start 间复用，create 前必须清掉上次弹簧关闭态：
   *  否则 closing 残留 true 会让第二次打开的 requestClose 被幂等守卫直接吞掉。 */
  init(): void {
    this.closing = false;
    this.board = undefined;
  }
  create(): void {
    // V17（15 号档 Top3）：oracle togglePause=game.paused 引擎级冻结（:416750 区——paused
    // 分支不跑 stage.update ⇒ 液面/钻石/海军/风效全部静帧，仅面板经 pauseUpdate 继续）。
    // Phaser 3 同构：pause("Game") 停其 update/tweens/anims/时钟（渲染照常 → 末帧画面保留，
    // SceneManager.render 对 PAUSED 状态仍出图）；解除统一走本场景 SHUTDOWN 钩子 resume——
    // 覆盖 requestClose/再试/返回菜单/换关全部停面板路径（含先停 Game 的序列：此时 Game
    // 已非 PAUSED，isPaused 守卫跳过，无僵尸复活）。
    if (!this.scene.isPaused("Game")) this.scene.pause("Game");
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      if (this.scene.isPaused("Game")) this.scene.resume("Game");
    });
    this.board = buildBoard(this);
    const board = this.board;
    board.add(this.add.bitmapText(CX, 40, FONT_MAIN, "暫停", 36).setOrigin(0.5, 0.5));
    // 再试/返回：oracle 为 fade 包络（:1909660/:1910067），面板由黑幕 ops 统一停，本地不抢停
    stoneButton(this, board, CX + HALF_W / 3, 108, "再试一次", () => {
      handle().__fwRestart?.();
    });
    stoneButton(this, board, CX - HALF_W / 3, 108, "返回菜单", () => {
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
    // twoRows 700/1400/1400/2100。隐藏行不建图、拍链照走；P-01（用户 2026-10-21 裁定）：
    // oracle 隐藏行仍播 endPass，双人结算听感属误响，这里保留空拍但静音。
    const rowTicks: Array<() => void> = [];
    rows.forEach((row, i) => {
      const y = 321 - 160.5 + (twoRows ? [60, 140, 140][i] : [20, 100, 180][i]);
      if (row.hide) {
        rowTicks.push(() => {});
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
    // Continue（与星碑同拍启用）：原版直进下一关；联机形态=活房间 advance 换关（main.ts __fwNextLevel）。
    // 面板由黑幕 ops 统一停（oracle fade("levelMenu") :1878226）；leaving 门防黑幕窗内双击重触发。
    let leaving = false;
    stoneButton(
      this,
      board,
      CX,
      502,
      "继续",
      () => {
        if (leaving) return;
        leaving = true;
        const h = handle() as unknown as { __fwNextLevel?: () => void; __fwLeaveToMenu?: () => void };
        if (h.__fwNextLevel) h.__fwNextLevel();
        else h.__fwLeaveToMenu?.();
      },
      { disabled: () => !enabled || leaving },
    );
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
    // 双钮：oracle 为 fade 包络（:1880672 Menu / :1909660 Retry），面板由黑幕 ops 统一停
    stoneButton(this, board, CX - 0.4 * HALF_W, 254, "返回菜单", () => {
      handle().__fwLeaveToMenu?.();
    });
    stoneButton(this, board, CX + 0.4 * HALF_W, 254, "再试一次", () => {
      handle().__fwRestart?.();
    });
  }
}
