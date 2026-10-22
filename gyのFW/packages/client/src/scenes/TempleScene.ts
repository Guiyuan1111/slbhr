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
 */
import Phaser from "phaser";
import { ATLAS_MENU, ATLAS_TEMPLE, ATLAS_TEMPLE_PNG, ensureMenuBgm, FONT_MAIN } from "./BootScene";
import { clickSfx } from "./overlays";
import { fadeSwitch } from "./transition";
import { loadPlayed, loadProgress, starsOf, takeFirstComplete } from "../progress";
import { peekTreeBake, startTreeBake, stepTreeBake, type MaskFrame, type TreeBakeParams, type TreeBakeResult } from "./templeTreeBake";

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

export class TempleScene extends Phaser.Scene {
  private data_!: TempleData;
  private showNumbers = true;
  private numberTexts: Phaser.GameObjects.BitmapText[] = [];
  private flatFallbacks: Array<Phaser.GameObjects.Graphics | Phaser.GameObjects.Image> = [];
  private bakeHandler?: () => void;

  constructor() {
    super("Temple");
  }

  preload(): void {
    this.load.json("templeData", "/data/forest/temple.json");
    // r5 装载序兜底：temple 图集随游戏内批次延迟装载（MenuScene 后台暖装通常已就绪，
    // 此处静默跳过）；极快速进入选关时在此补齐
    this.load.atlas(ATLAS_TEMPLE, ATLAS_TEMPLE_PNG, "/assets/atlasses/Temples/forest/TempleAssets.json");
  }

  create(): void {
    const W = this.scale.width;
    const H = this.scale.height;
    // 选关界面延续菜单 BGM（Menu→Temple 不断；原版进关才 fadeOut(500)，bundle:1935104 LevelMenu.startLevel）
    // r22 件1：键可能尚未入缓存（菜单曲移出 Boot 阻塞批后，快速进选关那条路上它还在飞或被切走），
    // 交给 ensureMenuBgm 补齐再播，而不是撞缺键警告。
    ensureMenuBgm(this);
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

    const prefixOf = (type: string): string =>
      type === "speed" ? "DiamondSpeed" : type === "puzzle" ? "DiamondPuzzle" : type === "dark" ? "DiamondDark" : "Diamond";
    // _Bkg_Mask 帧素色实测 (255,203,0)（MenuAssets 帧像素采样，PNG 与 oracle 逐字节一致）——
    // setTint 是乘法，按帧色反推 tint 使乘积 ≈ 目标平色（蓝通道帧色为 0，弃）
    const flat = (tint: number): number => {
      const c = Phaser.Display.Color.IntegerToColor(tint);
      return Phaser.Display.Color.GetColor(Math.round(c.red * 0.85), Math.round(c.green * 0.85), Math.round(c.blue * 0.85));
    };
    const baseColor = flat(Phaser.Display.Color.HexStringToColor(this.data_.color).color);
    const goldColor = flat(0xffd620);
    const maskTint = (target: number): number => {
      const c = Phaser.Display.Color.IntegerToColor(target);
      return Phaser.Display.Color.GetColor(c.red, Math.round(c.green / (203 / 255)), 0);
    };

    // —— 烘焙参数（oracle h() 内容 + Bevel/CM/Outline 滤镜链，见 templeTreeBake.ts 头注）
    const menuTex = this.textures.get(ATLAS_MENU);
    const maskFrame = (prefix: string): MaskFrame => {
      const f = menuTex.get(`${prefix}_Bkg_Mask0000`);
      return { img: menuTex.getSourceImage() as CanvasImageSource, x: f.cutX, y: f.cutY, w: f.cutWidth, h: f.cutHeight };
    };
    const bakeParams: TreeBakeParams = {
      levels: this.data_.levels.map((lv) => ({ oid: lv._id, x: lv.x, y: lv.y, maskKey: prefixOf(lv.type), filename: lv.filename })),
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

    // 首入：平色回退 + 分帧烘焙；命中缓存：直接贴图
    const cached = peekTreeBake(bakeParams);
    if (cached) {
      this.applyTreeTextures(cached, W, H);
    } else {
      this.buildFlatFallback(scale, baseColor, goldColor, byOid, px, py, done, playable);
      const key = startTreeBake(bakeParams);
      this.bakeHandler = (): void => {
        const r = stepTreeBake(key, 8);
        if (r) {
          this.events.off("postupdate", this.bakeHandler);
          this.bakeHandler = undefined;
          this.applyTreeTextures(r, W, H);
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
      const frame = `${prefixOf(lv.type)}${String(Math.min(stars, 3)).padStart(4, "0")}`;
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

    // 返回按钮（左下；oracle BackButton :1910728：帧 0000↔0001 按压换帧+label 0.95+pusher 音）
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
      // 返主菜单黑幕（oracle goBack fade("menu") :1935440）
      fadeSwitch(this.game, () => this.scene.start("Menu"));
    });
    back.on("pointerupoutside", () => {
      back.setFrame("BackButton0000");
      backLabel.setScale(1);
    });

    // 全 3 星首通庆典·消费点 1/2（P-02 #34，0.3.40）：本场景≡oracle LevelMenu，
    // afterAddContent（:1932272/:1932358）内容构建末检查 firstComplete——置位已前移至
    // 通关时刻（main.ts won 分支 processWinResult，oracle EndMenu.create→update :1881953/
    // :2149507 同构），此处读即清并起 CompleteScene。呈现=launch 并行景（无黑幕）：oracle
    // bare start("gameComplete",!1,!1) 的 clearWorld=!1 保留旧态显示表（Phaser2 core
    // :357600 区仅 clearWorld 才 world.shutdown）⇒ 庆典浮于选关画面之上；Phaser 3 语义下
    // scene.start 会清掉 Temple（关掉庆典后黑屏）⇔ oracle 行为相悖，launch 即其等价物。
    // 星门留在置位侧（全 48 关 3 星=:2149483 字节语义，非单关首通）。
    if (takeFirstComplete()) this.scene.launch("CompleteScene");

    // 显示关卡数切换（右下，fontStone 20；oracle 同位 Button 按压 label 0.95+pusher 音）
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
        this.add.image(px(lv), py(lv), ATLAS_MENU, `${prefixOf(lv.type)}_Bkg_Mask0000`).setScale(scale).setTint(maskTint(baseColor)).setDepth(-4),
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
        this.add.image(px(lv), py(lv), ATLAS_MENU, `${prefixOf(lv.type)}_Bkg_Mask0000`).setScale(scale).setTint(maskTint(goldColor)).setDepth(-4),
      );
    }
  }

  /** 烘焙产物入纹理系统并按 oracle 层序铺放（底影→全树→进度，全部低于节点按钮） */
  private applyTreeTextures(r: TreeBakeResult, W: number, H: number): void {
    // 纹理绑定：已指着同一张烘焙 canvas 就整段跳过（r14 件D，与 buildGround 的
    // bound 免重传同款）。场景 shutdown 不带走 game 级纹理，因此结果缓存命中重进时
    // 三张 1036×864 仍在纹理里——省掉 remove+addCanvas 的三次 texImage2D 全幅重传
    // 与随之而来的一帧卡顿。canvas 被 LRU 逐出（width 归零）时必然伴随新对象，
    // 身份不等 → 照旧重绑。
    const binds: Array<[string, HTMLCanvasElement]> = [
      [TREE_TEX.big, r.canvases.big],
      [TREE_TEX.all, r.canvases.all],
      [TREE_TEX.done, r.canvases.done],
    ];
    for (const [key, canvas] of binds) {
      const tex = this.textures.exists(key) ? this.textures.get(key) : null;
      if (tex && tex.source[0]?.image === canvas) continue;
      if (tex) this.textures.remove(key);
      this.textures.addCanvas(key, canvas);
    }
    this.add.image(W / 2, H / 2, TREE_TEX.big).setDepth(-7);
    this.add.image(W / 2, H / 2, TREE_TEX.all).setDepth(-6);
    this.add.image(W / 2, H / 2, TREE_TEX.done).setDepth(-5);
  }
}
