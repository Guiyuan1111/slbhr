/**
 * 设置/制作人员/全通关/软锁四个弹窗（原版 SettingsMenu/CreditsMenu/GameCompleteMenu/SoftLockMenu 复刻）。
 * 复用 overlays 的板与 StoneButton（IngameMenu 基类形制）；子元素一律板内局部坐标
 * （板 1082×642，容器 (99,159)，板内中心 (541,321)）；进出为弹簧滑入/滑出（overlays.buildBoard）。
 * - SettingsScene：Music/Fx 双开关（原版 keyboard 模式布局，bundle:43824-43920），
 *   切换即时生效并持久化（settings.ts）。
 * - CreditsScene：右上"?"进入，制作名单按原版 ch 字典（bundle:45885-45925）。
 * - CompleteScene：48 关全 3 星首通一次性彩带雨（Confetti0000-3）+ 恭喜弹窗（bundle:45603-45721）。
 * - SoftLockScene（E 部 multi 选关，0.4.x）：rows 网格 state=0 节点点击的"完成更多关卡"提示
 *   （原版 SoftLockMenu renderContent :1917010 区；TempleScene 运行时 scene.add 注册后 launch）。
 */
import Phaser from "phaser";
import { ATLAS_MENU, ATLAS_POPUP, FONT_MAIN } from "./BootScene";
import { buildBoard, clickSfx, stoneButton } from "./overlays";
import { getSettings, setSettings } from "../settings";

const W = 1280;
const H = 960;
/** 板内中心（板局部系） */
const CX = 541;

/** 设置面板（叠于任意活动场景；音乐开关即时启停 BGM） */
export class SettingsScene extends Phaser.Scene {
  constructor() {
    super("SettingsScene");
  }
  create(): void {
    const board = buildBoard(this);
    // oracle SettingsMenu keyboard 模式（A 包 init 偏移 1856960 区，2026-10-23 勘误）：
    //   无标题文本；Fx(−c/3)/Music(+c/3) 双开关中心位 y=0（板内 (397,321)/(685,321)，c=halfW=433）；
    //   Ok 石钮中心 (0, 1.1·halfH/2) ⇒ 板内 (541,498)，文案 ch 字典 Ok="继续"。
    //   旧版标题"设置"/侧边文字标签系无据自创，一并去除。
    const applyMusic = (): void => {
      const st = getSettings();
      if (st.music) {
        // 菜单态即时恢复 BGM（menus 域）；Game 态即时起播交 GameScene.applyMusicSetting（T6）
        const act = this.game.scene.getScenes(true).map((s) => s.scene.key);
        if ((act.includes("Menu") || act.includes("Temple")) && !this.sound.isPlaying("bgm_menu")) {
          this.sound.play("bgm_menu", { loop: true });
        }
        const gs = this.game.scene.getScene("Game") as unknown as { applyMusicSetting?: () => void } | null;
        gs?.applyMusicSetting?.();
      } else {
        this.sound.stopByKey("bgm_menu");
        this.sound.stopByKey("bgm_level");
        this.sound.stopByKey("bgm_level_speed");
        this.sound.stopByKey("bgm_level_dark"); // #31：暗关 BGM 不得在关设置后残留
      }
    };
    // Music / Fx 双开关（oracle ToggleSettingButton：选中态 0000 / 关态 0001，按压帧同帧）
    const toggle = (x: number, label: string, key: "music" | "fx"): void => {
      const img = this.add
        .image(x, 321, ATLAS_MENU, `${label}Button${getSettings()[key] ? "0000" : "0001"}`)
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true });
      img.on("pointerup", () => {
        clickSfx(this);
        const next = setSettings({ [key]: !getSettings()[key] });
        img.setFrame(`${label}Button${next[key] ? "0000" : "0001"}`);
        if (key === "music") applyMusic();
        // T5（14 号档）：fx 开关=全局总静音（含 BGM，oracle fx 信号 sound.mute=!fx :2209677）
        else this.game.sound.mute = !next.fx;
      });
      board.add(img);
    };
    toggle(CX - HALF_W() / 3, "Fx", "fx");
    toggle(CX + HALF_W() / 3, "Music", "music");
    stoneButton(this, board, CX, 498, "继续", () => board.hide(() => this.scene.stop()));
  }
}

/** oracle contentSize halfWidth ≈ 433（0.8×板宽/2，同 overlays.HALF_W） */
function HALF_W(): number {
  return 433;
}

/** 制作人员（原版 CreditsMenu：ch 字典名单） */
export class CreditsScene extends Phaser.Scene {
  constructor() {
    super("CreditsScene");
  }
  create(): void {
    const board = buildBoard(this);
    // oracle CreditsMenu（A 包 init 偏移 1935914 区，2026-10-23 勘误）：无标题，三文本块
    //   锚(0.5) 中心位 (0,−160)/20 号、(0,−40)/24 号多行块、(0,80)/16 号 ⇒ 板内 161/281/401；
    //   Ok (0, 1.1·halfH/2) ⇒ 板内 (541,498)，ch 字典 Ok="继续"（旧标题/列表挤板顶、Ok 文案自创）。
    board.add(this.add.bitmapText(CX, 161, FONT_MAIN, "本复刻基于原版游戏", 20).setOrigin(0.5, 0.5).setAlpha(0.7));
    // 名单块（oracle 为单条  分行位图文本；此处按行渲染，间距=24 号行高 52×0.5=26）
    ["Oslo Albet", "Anna Tamarit", "Jan Villanueva"].forEach((line, i) => {
      board.add(this.add.bitmapText(CX, 281 + (i - 1) * 26, FONT_MAIN, line, 24).setOrigin(0.5, 0.5));
    });
    board.add(this.add.bitmapText(CX, 401, FONT_MAIN, "septimania 2018", 16).setOrigin(0.5, 0.5));
    stoneButton(this, board, CX, 498, "继续", () => board.hide(() => this.scene.stop()));
  }
}

/**
 * 软锁提示（原版 States/Common/SoftLockMenu，E 包 bundle :1916970 区逐句）：
 * IngameMenu 板 + 三行 fontStone 文案 + "Ok!" StoneButton；关闭=hide 后 1000ms 收场景
 * （oracle close 的 _.delay(1e3) 同构）。launch 入参 { label }：
 * - 网格节点点击：label 固定 "level"（LevelMenuButtons.showPopup :1923980 区硬编码）；
 * - 条带软锁庙图标：原版 dispatch onShowPopup 但 HybridMenu 无消费者（:1965000 区 define 块
 *   无 onShowPopup.add）→ 点击无弹窗，故 temple 路径在本复刻不触达，仅留词典完备性。
 * 文案 = ch 词典（:2223208 区逐键）；locale 回退 = `key+"|locale"`（:2224051 原句）。
 */
const SOFTLOCK_CH: Record<string, string> = {
  this: "这个",
  level: "级别",
  not_yet: "这个级别尚不可用",
  complete_more: "完成更多关卡",
  to_unlock: "解锁",
  "Ok!": "继续",
};
export class SoftLockScene extends Phaser.Scene {
  constructor() {
    super("SoftLock");
  }
  create(data: { label?: string }): void {
    const board = buildBoard(this);
    const locale = (k: string): string => SOFTLOCK_CH[k] ?? `${k}|locale`;
    const label = data?.label ?? "level";
    // 三行 y=板内 321+(−321/2+30/140/200)：oracle renderContent 的 −halfH/2+offset
    board.add(this.add.bitmapText(CX, 321 - 130.5, FONT_MAIN, `${locale("this")} ${locale(label)} ${locale("not_yet")}`, 26).setOrigin(0.5));
    board.add(this.add.bitmapText(CX, 321 - 20.5, FONT_MAIN, locale("complete_more"), 22).setOrigin(0.5));
    board.add(this.add.bitmapText(CX, 321 + 39.5, FONT_MAIN, locale("to_unlock"), 22).setOrigin(0.5));
    // Ok! 位置 = 1.1·halfH/2（与 Settings/Credits 的 Ok 同式，板内 497.55≈498）
    stoneButton(this, board, CX, 498, locale("Ok!"), () =>
      board.hide(() => {
        this.time.delayedCall(1000, () => this.scene.stop());
      }),
    );
  }
}

/** 全 3 星首通：彩带雨 + 恭喜（原版 Complete/GameCompleteMenu） */
export class CompleteScene extends Phaser.Scene {
  constructor() {
    super("CompleteScene");
  }
  preload(): void {
    // r5 装载序兜底：popup 图集延迟装载后保证彩带帧就绪（暖装已就绪则静默跳过）
    this.load.atlas(ATLAS_POPUP, "/assets/atlasses/PopupAssets.png", "/assets/atlasses/PopupAssets.json");
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
    // oracle GameCompleteMenu（A 包 init 偏移 1925026 区，2026-10-23 勘误）：标题锚(0.5)
    //   (0,−halfH/3) ⇒ 板内 (541,214)；副题 (0,−halfH/3+1.2·标题高≈70) ⇒ (541,299)，文案
    //   ch 字典 you_completed="你完成了比赛"；Ok (0, halfH/2) ⇒ (541,482)、Ok="继续"。
    board.add(this.add.bitmapText(CX, 214, FONT_MAIN, "恭喜！", 36).setOrigin(0.5, 0.5));
    board.add(this.add.bitmapText(CX, 299, FONT_MAIN, "你完成了比赛", 28).setOrigin(0.5, 0.5));
    // 关闭时序（oracle GameCompleteMenu.close 行 45689：hide→1000ms→onClose 收尾）
    stoneButton(this, board, CX, 482, "继续", () =>
      board.hide(() => {
        this.time.delayedCall(1000, () => this.scene.stop());
      }),
    );
  }
}
