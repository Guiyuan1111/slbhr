/**
 * 选关界面（原版 States/LevelMenu/LevelMenu 复刻；tree 型神庙走 LevelMenuTree≡LevelMenuButtons）。
 * temple.json 图结构：48 关卡节点（0~1 归一化 x/y）+ 47 条 edges 连线。
 * 树渲染：CPU 烘焙 oracle 三张 canvas 纹理（templeTreeBake.ts，字节级滤镜复刻：Bevel+ColorMatrix
 * +Outline，GLSL fp32 语义+SwiftShader unorm 实证），层序 imageAllBig→imageAll→imageDone（bundle
 * 层序同原版）。首入分帧烘焙，期间以平色 Graphics 回退；同参数结果缓存后零开销。
 * 布局：k=0.9H、C=min(1.2k, 0.9W)；节点 = (x·C − C/2, y·k − k/2)（居中系→这里直接用视口系）。
 * ★ 边端点引用 temple.json 的 _id（连续 1..48），非稀疏 level.id——原版 i=_find(levels, b._id===a)
 *   （bundle:1916140）；解锁传播同用 _id 邻接。
 * 进度：localStorage（progress.ts）；解锁 = initial 或相邻已通关（tree 传播）。
 * 点可玩关卡 → registry "onLevelPicked"(levelId, filename) → main.ts 弹出联机面板。
 *
 * ── multi 模式（E 部 elements，0.4.x）────────────────────────────────────────────
 * URL ?level= 命中 elements/*（templeIdOf）时走原版 HybridMenu 形态（E 包 bundle @1965000 区）：
 * 顶部 TempleIcons 七庙条带 + 当前庙 rows 网格单屏合成。解锁链/状态机/几何全部在
 * templeMultiLogic.ts（纯函数，逐条 bundle 偏移见其头注）：
 * - 条带：icon_distance=179.2，环形 wrap ±3.5 格冻结在当前庙锚 → 当前庙图标恒居屏心
 *   （原版"当前庙高亮"=居中，无独立高亮帧）；条带原点=屏底心、图标屏幕 y=H/2−105；
 *   帧语义 @1955000 区：软锁/购买锁庙 0000/0000、可切庙 0001(起)/0002(按)；软锁点击在
 *   HybridMenu 无 onShowPopup 消费者 → 拦截不弹窗；切庙=scene.restart 重载对应网格
 *   （原版 setTarget 落定→setTemple 换 HybridButtons，免视觉口径下取等价端点）。
 * - 网格：LevelMenuGrid 档（G=0.45）、B/C 居中、组 y=−80；三张烘焙纹理与 tree 共用
 *   templeTreeBake 管线（rows 数据 edges 恒空 → 无连线，纯菱形底座）。
 * - 状态机：rowsLevelState（0 锁/1 可玩/2..4 星+1）；state=0 节点点击弹 SoftLockMenu
 *   （menus.ts SoftLockScene，label 硬编码 "level" 同 :1923980 区）。
 * - 会话内当前庙记忆：模块级 multiTempleOverride ≡ oracle game.currentTemple（HybridButtons
 *   init 置位、跨选关重入保留）；首入以 URL 庙为初值。
 */
import Phaser from "phaser";
import { templeIdOf } from "../templeData";
import { guardLoadErrors } from "./loadGuard";
import { ATLAS_MENU, ATLAS_TEMPLE, FONT_MAIN } from "./BootScene";
import { clickSfx } from "./overlays";
import { fadeSwitch } from "./transition";
import { SoftLockScene } from "./menus";
import { loadPlayed, loadProgress, starsOf, takeFirstComplete } from "../progress";
import { getSettings } from "../settings";
import { peekTreeBake, startTreeBake, stepTreeBake, type MaskFrame, type TreeBakeParams, type TreeBakeResult } from "./templeTreeBake";
import {
  ELEMENT_TEMPLE_DIRS,
  ICON_RESCALE,
  type MultiLevel,
  type MultiTemple,
  completedCountOf,
  computeLearnedElements,
  gridBakePts,
  gridMetrics,
  gridNodeXY,
  purchaseLocked,
  rowsLevelState,
  stripIconX,
  stripIconY,
  templeHasNew,
  templeSoftLocked,
} from "./templeMultiLogic";

interface TempleLevel {
  id: number;
  _id: number; // 边端点引用键（连续 1..48）
  x: number;
  y: number;
  filename: string;
  time: number;
  type: string;
  initial: boolean;
}
interface TempleData {
  id: string;
  label: string;
  color: string;
  type: string;
  levels: TempleLevel[];
  edges: Array<{ id: string; source: number; target: number }>;
}

const TREE_TEX = { big: "tree-big", all: "tree-all", done: "tree-done" } as const;

/** TempleIcons 图集键（multi 条带；BootScene 不持有此图集，multi preload 首载） */
const KEY_ICONS = "templeIcons";
/** MenuBackgrounds 图集键（multi 条带背板/托盘；oracle 同名键 :2218500 区） */
const KEY_MENUBG = "menuBackgrounds";
/** multi 模式会话内当前庙（≡ oracle game.currentTemple：HybridButtons.init 置位、跨重入保留；
 *  null=尚未浏览过，用 URL 庙。模块级变量页面生命周期内存续，刷新归零） */
let multiTempleOverride: string | null = null;

/** 庙名 ch 词典（E 包 bundle :2223208 区逐键，含原版条目前导空格；locale(label) 消费） */
const TEMPLE_LABEL_ZH: Record<string, string> = {
  "Forest Temple": " 森林圣殿",
  "Water Temple": " 水之神殿",
  "Fire Temple": " 火之神殿",
  "Light Temple": " 光明神殿",
  "Ice Temple": " 寒冰神殿",
  "Crystal Temple": " 水晶殿",
  "Wind Temple": " 风之圣殿",
};

/** 菱形节点帧前缀（type→Diamond 族；E 数据仅 general(缺省)/puzzle 两档，bundle:1919440 区同表） */
const prefixOf = (type: string): string =>
  type === "speed" ? "DiamondSpeed" : type === "puzzle" ? "DiamondPuzzle" : type === "dark" ? "DiamondDark" : "Diamond";

// —— 平色染色（烘焙期间回退层用；_Bkg_Mask 帧素色 (255,203,0)，setTint 乘法反推，tree 侧原注） ——
const flatTint = (tint: number): number => {
  const c = Phaser.Display.Color.IntegerToColor(tint);
  return Phaser.Display.Color.GetColor(Math.round(c.red * 0.85), Math.round(c.green * 0.85), Math.round(c.blue * 0.85));
};
const maskTintOf = (target: number): number => {
  const c = Phaser.Display.Color.IntegerToColor(target);
  return Phaser.Display.Color.GetColor(c.red, Math.round(c.green / (203 / 255)), 0);
};

export class TempleScene extends Phaser.Scene {
  private data_!: TempleData;
  private showNumbers = true;
  private numberTexts: Phaser.GameObjects.BitmapText[] = [];
  private flatFallbacks: Array<Phaser.GameObjects.Graphics | Phaser.GameObjects.Image> = [];
  private bakeHandler?: () => void;
  /** multi 模式（URL 庙属 elements/*）；multiAtlasKey=当前庙 TempleAssets 图集键 */
  private multi = false;
  private multiAtlasKey = "";

  constructor() {
    super("Temple");
  }

  preload(): void {
    guardLoadErrors(this);
    // #47-2：场景重入清空上一轮节点计数/降级图形引用（持有已销毁对象线性累积）
    this.numberTexts = [];
    this.flatFallbacks = [];
    const temple = templeIdOf(new URLSearchParams(location.search).get("level"));
    this.multi = temple.startsWith("elements/");
    if (this.multi) {
      // multi：并行拉全 7 庙 temple.json（oracle Progress.fetch @2197104 区 [].concat(gameConfig.temples)
      // 逐条 ajax 同构）+ TempleIcons 图集 + 当前庙 TempleAssets（逐庙独立键——不动 BootScene 的
      // ATLAS_TEMPLE 记账，切换庙只补载缺键，重访秒开）
      const cur = multiTempleOverride ?? temple.slice("elements/".length);
      for (const d of ELEMENT_TEMPLE_DIRS) this.load.json(`templeDataE-${d}`, `/data/elements/${d}/temple.json`);
      if (!this.textures.exists(KEY_ICONS))
        this.load.atlas(KEY_ICONS, "/assets/atlasses/TempleIcons.png", "/assets/atlasses/TempleIcons.json");
      // oracle multi Load 批（:2218500 区）同载 MenuBackgrounds（条带背板/托盘帧）；我方其余
      // 场景不消费该图集，随 multi 场景装载即可
      if (!this.textures.exists(KEY_MENUBG))
        this.load.atlas(KEY_MENUBG, "/assets/atlasses/MenuBackgrounds.png", "/assets/atlasses/MenuBackgrounds.json");
      this.multiAtlasKey = `templeAssets-${cur}`;
      if (!this.textures.exists(this.multiAtlasKey))
        this.load.atlas(
          this.multiAtlasKey,
          `/assets/atlasses/Temples/elements/${cur}/TempleAssets.png`,
          `/assets/atlasses/Temples/elements/${cur}/TempleAssets.json`,
        );
      return;
    }
    this.load.json("templeData", `/data/${temple}/temple.json`);
    // r5 装载序兜底：temple 图集随游戏内批次延迟装载（MenuScene 后台暖装通常已就绪，
    // 此处静默跳过）；极快速进入选关时在此补齐
    this.load.atlas(ATLAS_TEMPLE, `/assets/atlasses/Temples/${temple}/TempleAssets.png`, `/assets/atlasses/Temples/${temple}/TempleAssets.json`);
  }

  create(): void {
    const W = this.scale.width;
    const H = this.scale.height;
    // 选关界面延续菜单 BGM（Menu→Temple 不断；原版进关才 fadeOut(500)，bundle:1935104 LevelMenu.startLevel）
    if (getSettings().music && !this.sound.isPlaying("bgm_menu")) this.sound.play("bgm_menu", { loop: true });
    if (this.multi) {
      this.createMulti(W, H);
      return;
    }
    this.data_ = this.cache.json.get("templeData") as TempleData;

    // 背景：MenuBackground0000 平铺（最底）
    this.add.tileSprite(W / 2, H / 2, W, H, ATLAS_TEMPLE, "MenuBackground0000").setDepth(-10);

    // 布局（原版：k=0.9H，C=min(1.2k, 0.9W)，缩放 x = min(k,C)<800 ? 0.5 : 0.6）
    const k = 0.9 * H;
    const C = Math.min(1.2 * k, 0.9 * W);
    const scale = Math.min(k, C) < 800 ? 0.5 : 0.6;
    const px = (lv: TempleLevel): number => (lv.x * C - C / 2) + W / 2;
    const py = (lv: TempleLevel): number => (lv.y * k - k / 2) + H / 2;
    // ★ 边端点/传播邻接用 _id（连续 1..48），非稀疏 level.id（bundle:1916140 实证）
    const byOid = new Map<number, TempleLevel>();
    for (const lv of this.data_.levels) byOid.set(lv._id, lv);

    // 进度态（原版 state 语义：0=锁定 / 1=可玩未通 / 2..4=星数+1，bundle:2150431）
    const done = new Set<string>();
    for (const lv of this.data_.levels) if (starsOf(lv.filename) > 0) done.add(lv.filename);
    const playable = new Set<string>();
    for (const lv of this.data_.levels) if (lv.initial) playable.add(lv.filename);
    let grew = true;
    while (grew) {
      grew = false;
      for (const e of this.data_.edges) {
        const s = byOid.get(e.source), t = byOid.get(e.target);
        if (!s || !t) continue;
        if (done.has(s.filename) && !playable.has(t.filename)) { playable.add(t.filename); grew = true; }
        if (done.has(t.filename) && !playable.has(s.filename)) { playable.add(s.filename); grew = true; }
      }
    }
    const stateOf = (filename: string): number => {
      const s = starsOf(filename);
      return s > 0 ? s + 1 : playable.has(filename) ? 1 : 0;
    };

    // _Bkg_Mask 帧素色实测 (255,203,0)（MenuAssets 帧像素采样，PNG 与 oracle 逐字节一致）——
    // setTint 是乘法，按帧色反推 tint 使乘积 ≈ 目标平色（蓝通道帧色为 0，弃）
    const baseColor = flatTint(Phaser.Display.Color.HexStringToColor(this.data_.color).color);
    const goldColor = flatTint(0xffd620);

    // —— 烘焙参数（oracle h() 内容 + Bevel/CM/Outline 滤镜链，见 templeTreeBake.ts 头注）
    const menuTex = this.textures.get(ATLAS_MENU);
    const maskFrame = (prefix: string): MaskFrame => {
      const f = menuTex.get(`${prefix}_Bkg_Mask0000`);
      return { img: menuTex.getSourceImage() as CanvasImageSource, x: f.cutX, y: f.cutY, w: f.cutWidth, h: f.cutHeight };
    };
    const bakeParams: TreeBakeParams = {
      levels: this.data_.levels.map((lv) => ({ oid: lv._id, x: lv.x, y: lv.y, maskKey: prefixOf(lv.type ?? ""), filename: lv.filename })),
      edges: this.data_.edges.map((e) => ({ source: e.source, target: e.target })),
      color: this.data_.color,
      scale,
      canvasW: Math.floor(C),
      canvasH: Math.floor(k),
      Cf: C,
      Kf: k,
      masks: new Map(
        (["Diamond", "DiamondSpeed", "DiamondPuzzle", "DiamondDark"] as const).map((p) => [p, maskFrame(p)]),
      ),
      stateOf,
    };

    // 首入：平色回退 + 分帧烘焙；命中缓存：直接贴图（tree 画布中心=屏心）
    this.mountBaked(bakeParams, W, H / 2, () =>
      this.buildFlatFallback(scale, baseColor, goldColor, byOid, px, py, done, playable),
    );

    // 节点按钮
    const played = loadPlayed();
    for (const lv of this.data_.levels) {
      const x = px(lv), y = py(lv);
      const stars = starsOf(lv.filename);
      const isPlayable = playable.has(lv.filename);
      if (!isPlayable && stars === 0) {
        this.add.image(x, y, ATLAS_MENU, "Lock0000").setScale(scale); // 原版 Lock 无透明度（bundle:1919870）
        continue;
      }
      // 帧号=星数（原版 y(p.state)：state 2/3/4 → "0001"/"0002"/"0003"，state=星数+1，bundle:1919440）
      const frame = `${prefixOf(lv.type ?? "")}${String(Math.min(stars, 3)).padStart(4, "0")}`;
      const btn = this.add
        .image(x, y, ATLAS_MENU, frame)
        .setScale(scale)
        .setInteractive({ useHandCursor: true });
      // NewSign 静态贴片（13 号档 #13，0.3.39）：oracle `p.state>0 && p.isNew` →
      // Sprite("NewSign0000") 位置 (节点+40,节点−20)、scale=布局尺（偏移不乘尺）、
      // anchor 0.5、无 tween 无弹跳（bundle:1920491 原文复核）；isNew=!played&&!initial
      // （:2150010 区；tree 型 locked 并入 state=0），played 于进关置位（:1935016），
      // 徽标随下次重建消失=oracle 回 levelMenu 重建同构。层序 btn→贴片→数字=内容组同序。
      if (!lv.initial && !played.has(lv.filename)) {
        this.add.image(x + 40, y - 20, ATLAS_MENU, "NewSign0000").setScale(scale).setOrigin(0.5);
      }
      const num = this.add
        .bitmapText(x, y + 3, FONT_MAIN, String(lv.id), 28)
        .setOrigin(0.5)
        .setVisible(false);
      this.numberTexts.push(num);
      // 菱形节点按压（oracle LevelButton :1105210/:1105414：down→scale 0.95（基尺 1 的相对 5% 缩，
      // upFrame==downFrame 帧不变），up→100ms 后回尺+pusher 音；此处乘布局尺保相对语义）
      btn.on("pointerdown", () => btn.setScale(scale * 0.95));
      btn.on("pointerup", () => {
        this.time.delayedCall(100, () => btn.setScale(scale));
        clickSfx(this);
        const levelId = lv.filename.split("/").pop()!.replace(".json", "");
        const cb = this.registry.get("onLevelPicked") as ((levelId: string, filename: string) => void) | undefined;
        cb?.(levelId, lv.filename);
      });
      btn.on("pointerupoutside", () => this.time.delayedCall(100, () => btn.setScale(scale)));
    }

    this.addBackButton(H);
    this.consumeFirstComplete();
    this.addNumbersToggle(W, H);
  }

  /** 返回按钮（左下；oracle BackButton :1910728：帧 0000↔0001 按压换帧+label 0.95+pusher 音；
   *  multi/tree 两分支同位——oracle rows layoutContent 与 tree 同式 @1970800 区） */
  private addBackButton(H: number): void {
    const back = this.add
      .image(70, H - 80, ATLAS_MENU, "BackButton0000")
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    const backLabel = this.add.bitmapText(70, H - 12, FONT_MAIN, "返回", 20).setOrigin(0.5);
    back.on("pointerdown", () => {
      back.setFrame("BackButton0001");
      backLabel.setScale(0.95);
    });
    back.on("pointerup", () => {
      back.setFrame("BackButton0000");
      backLabel.setScale(1);
      clickSfx(this);
      // 返主菜单黑幕（oracle goBack fade("menu") :1935440）；联机面板随选关流程结束收起
      // （onHideLobby 由 main.ts 注册收 DOM——面板仅属于选关页，此前残留在主菜单上
      //   压住画布标题/开始游戏钮，2026-10-23 用户报告）
      fadeSwitch(this.game, () => {
        const cb = this.registry.get("onHideLobby") as (() => void) | undefined;
        cb?.();
        this.scene.start("Menu");
      });
    });
    back.on("pointerupoutside", () => {
      back.setFrame("BackButton0000");
      backLabel.setScale(1);
    });
  }

  /** 全 3 星首通庆典·消费点 1/2（P-02 #34，0.3.40）：本场景≡oracle LevelMenu/HybridMenu，
   * afterAddContent（:1932272/:1932358/:1967900 区）内容构建末检查 firstComplete——置位已前移至
   * 通关时刻（main.ts won 分支 processWinResult，oracle EndMenu.create→update :1881953/
   * :2149507 同构），此处读即清并起 CompleteScene。呈现=launch 并行景（无黑幕）：oracle
   * bare start("gameComplete",!1,!1) 的 clearWorld=!1 保留旧态显示表（Phaser2 core
   * :357600 区仅 clearWorld 才 world.shutdown）⇒ 庆典浮于选关画面之上；Phaser 3 语义下
   * scene.start 会清掉 Temple（关掉庆典后黑屏）⇔ oracle 行为相悖，launch 即其等价物。
   * 星门留在置位侧（全 48 关 3 星=:2149483 字节语义，非单关首通）。 */
  private consumeFirstComplete(): void {
    if (takeFirstComplete()) this.scene.launch("CompleteScene");
  }

  /** 显示关卡数切换（右下，fontStone 20；oracle 同位 Button 按压 label 0.95+pusher 音）。
   *  multi 行沿用本复刻常显口径（oracle rows 由 gameConfig.showShowNumBtn 门控、tree 恒有） */
  private addNumbersToggle(W: number, H: number): void {
    const toggle = this.add
      .bitmapText(W - 115, H - 51, FONT_MAIN, "显示关卡数", 20)
      .setOrigin(0, 0.5)
      .setInteractive({ useHandCursor: true });
    toggle.on("pointerdown", () => toggle.setScale(0.95));
    toggle.on("pointerup", () => {
      toggle.setScale(1);
      clickSfx(this);
      this.showNumbers = !this.showNumbers;
      for (const t of this.numberTexts) t.setVisible(this.showNumbers);
    });
    toggle.on("pointerupoutside", () => toggle.setScale(1));
  }

  /** 三张烘焙纹理挂载（首入：平色回退+分帧烘焙；命中缓存：直接贴图；cy=画布中心屏幕 Y） */
  private mountBaked(params: TreeBakeParams, W: number, cy: number, buildFallback: () => void): void {
    const cached = peekTreeBake(params);
    if (cached) {
      this.applyTreeTextures(cached, W, cy);
      return;
    }
    buildFallback();
    const key = startTreeBake(params);
    this.bakeHandler = (): void => {
      const r = stepTreeBake(key, 8);
      if (r) {
        this.events.off("postupdate", this.bakeHandler);
        this.bakeHandler = undefined;
        this.applyTreeTextures(r, W, cy);
        for (const o of this.flatFallbacks) o.destroy();
        this.flatFallbacks = [];
      }
    };
    this.events.on("postupdate", this.bakeHandler);
    // 离场摘除步进（任务保留在模块级，重进 startTreeBake 同键续接）
    this.events.once("shutdown", () => {
      if (this.bakeHandler) this.events.off("postupdate", this.bakeHandler);
      this.bakeHandler = undefined;
    });
  }

  // ── multi 模式（E 部 elements/*；oracle States/LevelMenu/HybridMenu 单屏合成） ──

  private createMulti(W: number, H: number): void {
    // 7 庙数据（preload 已并行装载；按 index 排=条带展示序 ice(−3)…crystal(3)）
    const temples = ELEMENT_TEMPLE_DIRS.map((d) => this.cache.json.get(`templeDataE-${d}`) as MultiTemple).filter(Boolean);
    const urlId = (templeIdOf(new URLSearchParams(location.search).get("level")) as string).slice("elements/".length);
    const cur = temples.find((t) => t.id === (multiTempleOverride ?? urlId)) ?? temples[0];
    if (!cur) return; // 数据全缺（loader 失败已由 loadGuard 报错），无物可渲染
    multiTempleOverride = cur.id; // ≡ oracle game.currentTemple（HybridButtons.init 置位）

    // —— 进度态（templeMultiLogic 纯函数；消费现有 localStorage 进度源 progress.ts） ——
    const played = loadPlayed();
    const learned = computeLearnedElements(temples, starsOf);
    const soft = new Map<string, boolean>();
    const statesByTemple = new Map<string, Map<string, number>>();
    for (const t of temples) {
      soft.set(t.id, templeSoftLocked(t, learned));
      const sm = new Map<string, number>();
      const done = completedCountOf(t, starsOf);
      for (const lv of t.levels) sm.set(lv.filename, rowsLevelState(lv, starsOf(lv.filename), done, learned));
      statesByTemple.set(t.id, sm);
    }
    const states = statesByTemple.get(cur.id)!;

    // 背景：当前庙 TempleAssets 菜单底纹（oracle HybridButtons bkg @1946600 区；换庙即换底，
    // 此处以 restart 等价 setTemple 的整体重建）
    this.add.tileSprite(W / 2, H / 2, W, H, this.multiAtlasKey, "MenuBackground0000").setDepth(-10);
    // 庙名（oracle HybridButtons text @1946900 区：fontStone_large 30、y=−H/2+100、水平居中；
    // 文案=ch 词典 locale(label)（:2223208 区），词典缺失回退原文）
    this.add.bitmapText(W / 2, 100, FONT_MAIN, TEMPLE_LABEL_ZH[cur.label] ?? cur.label, 30).setOrigin(0.5);

    // —— rows 网格：三张烘焙纹理与 tree 共用管线（edges 恒空→无连线；画布中心 (W/2, H/2−80)） ——
    const m = gridMetrics(H);
    const baked = gridBakePts(cur.levels, m);
    const baseColor = flatTint(Phaser.Display.Color.HexStringToColor(cur.color).color);
    const goldColor = flatTint(0xffd620);
    const menuTex = this.textures.get(ATLAS_MENU);
    const maskFrame = (prefix: string): MaskFrame => {
      const f = menuTex.get(`${prefix}_Bkg_Mask0000`);
      return { img: menuTex.getSourceImage() as CanvasImageSource, x: f.cutX, y: f.cutY, w: f.cutWidth, h: f.cutHeight };
    };
    const bakeParams: TreeBakeParams = {
      levels: cur.levels.map((lv, i) => ({
        oid: lv._id,
        x: baked.pts[i].x,
        y: baked.pts[i].y,
        maskKey: prefixOf(lv.type ?? ""),
        filename: lv.filename,
      })),
      edges: [], // E 部 rows 数据 edges 恒空（档卷 §3 实测 7/7）；数据驱动而非硬编码假设
      color: cur.color,
      scale: m.G,
      canvasW: baked.canvasW,
      canvasH: baked.canvasH,
      Cf: baked.Cf,
      Kf: baked.Kf,
      masks: new Map((["Diamond", "DiamondSpeed", "DiamondPuzzle", "DiamondDark"] as const).map((p) => [p, maskFrame(p)])),
      stateOf: (filename) => states.get(filename) ?? 0,
    };
    this.mountBaked(bakeParams, W, H / 2 - 80, () => this.buildRowsFlatFallback(cur, states, m, W, H, baseColor, goldColor));

    // —— 网格节点（oracle LevelMenuButtons @1923200 区：帧 H(state)=0/1→0000、2→0001、3→0002、
    //      4→0003；按压=LevelButton 同 tree；state=0 点击弹 SoftLockMenu（label 硬编码 "level"
    //      同 :1923980 区）；购买锁节点=仅 Lock0000 无按钮——E 数据 unlock_key 全 free，不可达仅存真） ——
    for (const lv of cur.levels) {
      const { x, y } = gridNodeXY(lv, cur.levels, m, W, H);
      const st = states.get(lv.filename) ?? 0;
      if (purchaseLocked(lv.unlock_key, [])) {
        this.add.image(x, y, ATLAS_MENU, "Lock0000").setScale(m.G); // 原版 Lock 无透明度（bundle:1919870）
        continue;
      }
      const frame = `${prefixOf(lv.type ?? "")}${st >= 2 ? String(st - 1).padStart(4, "0") : "0000"}`;
      const btn = this.add.image(x, y, ATLAS_MENU, frame).setScale(m.G).setInteractive({ useHandCursor: true });
      // NewSign（oracle :1923980 区：state>0 ∧ isNew ∧ 非(forest∧id0)；isNew=!played∧!initial；
      // 位置 (节点+40,节点−20) 不乘尺、scale=G——Sign 挂 z 组不经按钮缩放，同 tree 侧 13 号档口径）
      if (st > 0 && !played.has(lv.filename) && !lv.initial && !(cur.id === "forest" && lv.id === 0)) {
        this.add.image(x + 40, y - 20, ATLAS_MENU, "NewSign0000").setScale(m.G).setOrigin(0.5);
      }
      const num = this.add.bitmapText(x, y + 3, FONT_MAIN, String(lv.id), 28).setOrigin(0.5).setVisible(false);
      this.numberTexts.push(num);
      btn.on("pointerdown", () => btn.setScale(m.G * 0.95));
      btn.on("pointerup", () => {
        this.time.delayedCall(100, () => btn.setScale(m.G));
        clickSfx(this); // oracle LevelButton mouseup：先 pusher 音再回调（state0 弹窗分支亦播）
        if (st > 0) {
          const levelId = lv.filename.split("/").pop()!.replace(".json", "");
          const cb = this.registry.get("onLevelPicked") as ((levelId: string, filename: string) => void) | undefined;
          cb?.(levelId, lv.filename);
        } else {
          this.showSoftLock("level");
        }
      });
      btn.on("pointerupoutside", () => this.time.delayedCall(100, () => btn.setScale(m.G)));
    }

    // —— 顶部条带（TempleSelectorHybrid @1952500 区；环形轮播冻结在当前锚 → 当前庙恒居屏心，
    //      即原版的"当前庙"指示——icon 0000=锁/软锁、0001 起/0002 按，无独立高亮帧） ——
    // 背板 SimpleBackground0000 平铺（x=−W/2 起 255 步进 ceil(W/256)+1 块、y=−C、origin(0,0)；
    // 原版随条带平移，此处冻结为满宽铺贴——重复纹理相位差不可感知，免视觉口径）
    const bandY = H / 2 - 210;
    for (let i = 0, n = Math.ceil(W / 256) + 1; i < n; i++) {
      this.add.image(255 * i, bandY, KEY_MENUBG, "SimpleBackground0000").setOrigin(0, 0).setDepth(2);
    }
    for (const t of temples) {
      const x = stripIconX(t.index, cur.index, W);
      const y = stripIconY(H);
      const isSoft = soft.get(t.id) ?? false;
      // 庙级购买锁（oracle unlockLevels `g.locked=b(g)` 作用 temple 对象的 unlock_key——
      // E 的 temple.json 无此字段 → undefined≠null 为 false 恒不锁；分支仅存真）
      const locked = purchaseLocked((t as MultiTemple & { unlock_key?: string }).unlock_key, []);
      // 帧组（@1955000 区）：锁/软锁庙 0000/0000；可切庙 0001(起)/0002(按)
      const upFrame = locked || isSoft ? `${t.id}Icon0000` : `${t.id}Icon0001`;
      const downFrame = locked || isSoft ? `${t.id}Icon0000` : `${t.id}Icon0002`;
      const icon = this.add
        .image(x, y, KEY_ICONS, upFrame)
        .setScale(ICON_RESCALE)
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true })
        .setDepth(3);
      if (locked) {
        // GoldLock 子件（@1955072 区：scale 1×按钮 0.7、anchor 0.5、居中；点击走 buyTemple 弹窗
        // ——onShowPopup 在 HybridMenu 无消费者 → 拦截，与软锁同）
        this.add.image(x, y, ATLAS_MENU, "GoldLock0000").setScale(ICON_RESCALE).setOrigin(0.5).setDepth(3);
      } else if (!isSoft && templeHasNew(t, starsOf, played, learned, completedCountOf(t, starsOf))) {
        // NewSign 子件（@1955100 区：scale 0.7×按钮 0.7、偏移 (+60,−60)×按钮尺=±42）
        this.add.image(x + 42, y - 42, ATLAS_MENU, "NewSign0000").setScale(ICON_RESCALE * 0.7).setOrigin(0.5).setDepth(3);
      }
      icon.on("pointerdown", () => icon.setFrame(downFrame));
      icon.on("pointerup", () => {
        icon.setFrame(upFrame);
        clickSfx(this); // oracle Button 基类 mouseup 统一 pusher 音（软锁分支也播）
        // 可切庙 → 换网格（原版 onSelected→setTarget→落定 onTarget→setTemple（仅异庙），
        // 本复刻以 restart 重载对应 temple.json 网格=等价端点）；软锁/购买锁=点击拦截
        // （原版 showSoftLockWarning/showBuyTemple 的 onShowPopup 在 HybridMenu 无消费者）
        if (!locked && !isSoft && t.id !== cur.id) {
          multiTempleOverride = t.id;
          this.scene.restart();
        }
      });
      icon.on("pointerupoutside", () => icon.setFrame(upFrame));
    }
    // 托盘（@1955500 区：SliderHolder0000 scale 0.7、anchor(0.5,1)、条带局部 y=+40；两侧
    // HolderTexture0000 平铺补满屏宽——三件均无交互，纯装饰；盖于图标之上=原版 addChild 序）
    const trayBottom = H / 2 + 40;
    this.add.image(W / 2, trayBottom, KEY_MENUBG, "SliderHolder0000").setOrigin(0.5, 1).setScale(ICON_RESCALE).setDepth(4);
    const sideW = (W - 800 * ICON_RESCALE) / (2 * ICON_RESCALE);
    const sideH = 395 / ICON_RESCALE;
    this.add
      .tileSprite(W / 2 - 400, trayBottom, sideW, sideH, KEY_MENUBG, "HolderTexture0000")
      .setOrigin(1, 1)
      .setScale(ICON_RESCALE)
      .setDepth(4);
    this.add
      .tileSprite(W / 2 + 400, trayBottom, sideW, sideH, KEY_MENUBG, "HolderTexture0000")
      .setOrigin(0, 1)
      .setScale(ICON_RESCALE)
      .setDepth(4);

    this.addBackButton(H);
    this.consumeFirstComplete();
    this.addNumbersToggle(W, H);
  }

  /** rows 平色回退（烘焙期间短暂可见；oracle h(!0) 全量底座/h(!1) state>0 金底座，无连线层） */
  private buildRowsFlatFallback(
    cur: MultiTemple,
    states: Map<string, number>,
    m: { o: number; M: number; G: number },
    W: number,
    H: number,
    baseColor: number,
    goldColor: number,
  ): void {
    for (const lv of cur.levels) {
      const { x, y } = gridNodeXY(lv, cur.levels, m, W, H);
      this.flatFallbacks.push(
        this.add.image(x, y, ATLAS_MENU, `${prefixOf(lv.type ?? "")}_Bkg_Mask0000`).setScale(m.G).setTint(maskTintOf(baseColor)).setDepth(-4),
      );
      if ((states.get(lv.filename) ?? 0) > 0) {
        this.flatFallbacks.push(
          this.add.image(x, y, ATLAS_MENU, `${prefixOf(lv.type ?? "")}_Bkg_Mask0000`).setScale(m.G).setTint(maskTintOf(goldColor)).setDepth(-4),
        );
      }
    }
  }

  /** SoftLockMenu 弹窗（menus.ts SoftLockScene；oracle 由 LevelMenuButtons.showPopup 直接 new，
   *  本复刻为 scene 制——动态注册一次后 launch，并行景盖于本场景之上） */
  private showSoftLock(label: string): void {
    if (!this.scene.get("SoftLock")) this.scene.add("SoftLock", SoftLockScene, false);
    this.scene.launch("SoftLock", { label });
  }

  /** 平色回退（烘焙期间短暂可见；结构与 oracle h() 同集合：全树边+全底座 / done 边+金底座） */
  private buildFlatFallback(
    scale: number,
    baseColor: number,
    goldColor: number,
    byOid: Map<number, TempleLevel>,
    px: (lv: TempleLevel) => number,
    py: (lv: TempleLevel) => number,
    done: Set<string>,
    playable: Set<string>,
  ): void {
    const maskTint = (target: number): number => {
      const c = Phaser.Display.Color.IntegerToColor(target);
      return Phaser.Display.Color.GetColor(c.red, Math.round(c.green / (203 / 255)), 0);
    };
    const prefixOf = (type: string): string =>
      type === "speed" ? "DiamondSpeed" : type === "puzzle" ? "DiamondPuzzle" : type === "dark" ? "DiamondDark" : "Diamond";
    const gAll = this.add.graphics().setDepth(-4);
    gAll.lineStyle(16 * scale, baseColor, 1);
    for (const e of this.data_.edges) {
      const s = byOid.get(e.source), t = byOid.get(e.target);
      if (!s || !t) continue;
      gAll.lineBetween(px(s), py(s), px(t), py(t));
    }
    this.flatFallbacks.push(gAll);
    for (const lv of this.data_.levels) {
      this.flatFallbacks.push(
        this.add.image(px(lv), py(lv), ATLAS_MENU, `${prefixOf(lv.type ?? "")}_Bkg_Mask0000`).setScale(scale).setTint(maskTint(baseColor)).setDepth(-4),
      );
    }
    const gDone = this.add.graphics().setDepth(-4);
    gDone.lineStyle(16 * scale, goldColor, 1);
    for (const e of this.data_.edges) {
      const s = byOid.get(e.source), t = byOid.get(e.target);
      if (!s || !t) continue;
      if (!(done.has(s.filename) || done.has(t.filename))) continue;
      gDone.lineBetween(px(s), py(s), px(t), py(t));
    }
    this.flatFallbacks.push(gDone);
    for (const lv of this.data_.levels) {
      if (!playable.has(lv.filename) && starsOf(lv.filename) === 0) continue;
      this.flatFallbacks.push(
        this.add.image(px(lv), py(lv), ATLAS_MENU, `${prefixOf(lv.type ?? "")}_Bkg_Mask0000`).setScale(scale).setTint(maskTint(goldColor)).setDepth(-4),
      );
    }
  }

  /** 烘焙产物入纹理系统并按 oracle 层序铺放（底影→全树→进度，全部低于节点按钮；cy=画布中心屏幕 Y） */
  private applyTreeTextures(r: TreeBakeResult, W: number, cy: number): void {
    for (const key of Object.values(TREE_TEX)) {
      if (this.textures.exists(key)) this.textures.remove(key);
    }
    this.textures.addCanvas(TREE_TEX.big, r.canvases.big);
    this.textures.addCanvas(TREE_TEX.all, r.canvases.all);
    this.textures.addCanvas(TREE_TEX.done, r.canvases.done);
    this.add.image(W / 2, cy, TREE_TEX.big).setDepth(-7);
    this.add.image(W / 2, cy, TREE_TEX.all).setDepth(-6);
    this.add.image(W / 2, cy, TREE_TEX.done).setDepth(-5);
  }
}
