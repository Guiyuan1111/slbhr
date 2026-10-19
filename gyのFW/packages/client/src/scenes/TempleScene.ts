/**
 * 选关界面（原版 States/LevelMenu/LevelMenu 复刻；tree 型神庙走 LevelMenuTree≡LevelMenuButtons）。
 * temple.json 图结构：48 关卡节点（0~1 归一化 x/y）+ 47 条 edges 连线。
 * 树渲染两层平色近似原版三张 canvas 纹理（考古证据与 bundle 字节偏移见 create() 内注释与
 * note/research/2026-10-fidelity/37-temple-tree-branches.md）：底层=全树恒绘（temple 色），
 * 上层=已通关侧金色叠绘（#FFD620 调域）。
 * 布局：k=0.9H、C=min(1.2k, 0.9W)；节点 = (x·C − C/2, y·k − k/2)（居中系→这里直接用视口系）。
 * 进度：localStorage（progress.ts）；解锁 = initial 或相邻已通关（tree 传播）。
 * 点可玩关卡 → registry "onLevelPicked"(levelId, filename) → main.ts 弹出联机面板。
 */
import Phaser from "phaser";
import { ATLAS_MENU, ATLAS_TEMPLE, FONT_MAIN } from "./BootScene";
import { loadProgress, starsOf } from "../progress";
import { getSettings } from "../settings";

interface TempleLevel {
  id: number;
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

export class TempleScene extends Phaser.Scene {
  private data_!: TempleData;
  private showNumbers = true;
  private numberTexts: Phaser.GameObjects.BitmapText[] = [];

  constructor() {
    super("Temple");
  }

  preload(): void {
    this.load.json("templeData", "/data/forest/temple.json");
    // r5 装载序兜底：temple 图集随游戏内批次延迟装载（MenuScene 后台暖装通常已就绪，
    // 此处静默跳过）；极快速进入选关时在此补齐
    this.load.atlas(ATLAS_TEMPLE, "/assets/atlasses/Temples/forest/TempleAssets.png", "/assets/atlasses/Temples/forest/TempleAssets.json");
  }

  create(): void {
    const W = this.scale.width;
    const H = this.scale.height;
    // 选关界面延续菜单 BGM（Menu→Temple 不断；原版进关才 fadeOut(500)，bundle:1935104 LevelMenu.startLevel）
    if (getSettings().music && !this.sound.isPlaying("bgm_menu")) this.sound.play("bgm_menu", { loop: true });
    this.data_ = this.cache.json.get("templeData") as TempleData;

    // 背景：MenuBackground0000 平铺
    this.add.tileSprite(W / 2, H / 2, W, H, ATLAS_TEMPLE, "MenuBackground0000");

    // 布局（原版：k=0.9H，C=min(1.2k, 0.9W)，缩放 x = min(k,C)<800 ? 0.5 : 0.6）
    const k = 0.9 * H;
    const C = Math.min(1.2 * k, 0.9 * W);
    const scale = Math.min(k, C) < 800 ? 0.5 : 0.6;
    const px = (lv: TempleLevel): number => (lv.x * C - C / 2) + W / 2;
    const py = (lv: TempleLevel): number => (lv.y * k - k / 2) + H / 2;
    const byId = new Map<number, TempleLevel>();
    for (const lv of this.data_.levels) byId.set(lv.id, lv);

    // 解锁传播：initial 恒通；与已通关节点相邻者可玩
    const done = new Set<string>();
    for (const lv of this.data_.levels) if (starsOf(lv.filename) > 0) done.add(lv.filename);
    const playable = new Set<string>();
    for (const lv of this.data_.levels) if (lv.initial) playable.add(lv.filename);
    let grew = true;
    while (grew) {
      grew = false;
      for (const e of this.data_.edges) {
        const s = byId.get(e.source), t = byId.get(e.target);
        if (!s || !t) continue;
        if (done.has(s.filename) && !playable.has(t.filename)) { playable.add(t.filename); grew = true; }
        if (done.has(t.filename) && !playable.has(s.filename)) { playable.add(s.filename); grew = true; }
      }
    }

    // —— 树纹理复刻（原版 LevelMenuButtons.addContent 的 h(b,c) 一次性把「边线 + 节点 _Bkg_Mask 底座」
    // 画进 canvas 纹理，产三张叠加：imageAllBig=h(!0,1.2) 1.2 倍浮雕底影 bundle:1917745、
    // imageAll=h(!0) 全树 bundle:1917713、imageDone=h(!1) 已通关侧 bundle:1917785，自下而上 addChild。
    // 绘制条件：b=true 边全画；b=false 仅 source.state+target.state>2 才画（bundle:1917030）；
    // 节点底座同理（全画 / l.state>0 才画，bundle:1917244）。线样式：strokeStyle=temple.color
    // （bundle:1916856）、lineWidth=16*x（bundle:1916896，x=0.5/0.6 同我们 scale）。
    // 三张纹理各过 BevelFilter（rgb 强制 0.5 灰度浮雕，bundle:1779406）+ ColorMatrix(1.7×tint，
    // bundle:1782424) → 平色近似最终色 = 0.85×tint。全树/底影 tint=temple.color；已通关侧
    // tint=16766496=#FFD620 金（bundle:1918127）。原版节点 state=星数+1（ProgressModel.setStates
    // tree 分支 bundle:2150431），>2 判据与我方「至少一端 ≥1 星」在传播语义下逐真值表等价
    // （≥1 星节点的相邻节点经 setStates 必为 state≥1，见档卷 37 §2.3）。
    const flat = (tint: number): number => {
      const c = Phaser.Display.Color.IntegerToColor(tint);
      return Phaser.Display.Color.GetColor(Math.round(c.red * 0.85), Math.round(c.green * 0.85), Math.round(c.blue * 0.85));
    };
    const baseColor = flat(Phaser.Display.Color.HexStringToColor(this.data_.color).color);
    const goldColor = flat(0xffd620);
    const prefixOf = (type: string): string =>
      type === "speed" ? "DiamondSpeed" : type === "puzzle" ? "DiamondPuzzle" : type === "dark" ? "DiamondDark" : "Diamond";
    // _Bkg_Mask 帧素色实测 (255,203,0)（MenuAssets 帧像素采样，PNG 与 oracle 逐字节一致）——
    // setTint 是乘法，按帧色反推 tint 使乘积 ≈ 目标平色（蓝通道帧色为 0，弃）
    const maskTint = (target: number): number => {
      const c = Phaser.Display.Color.IntegerToColor(target);
      return Phaser.Display.Color.GetColor(c.red, Math.round(c.green / (203 / 255)), 0);
    };

    // 底层（imageAll 平色近似）：47 条边全画 + 48 节点底座全画——用户可见的"枝"
    const gAll = this.add.graphics();
    gAll.lineStyle(16 * scale, baseColor, 1);
    for (const e of this.data_.edges) {
      const s = byId.get(e.source), t = byId.get(e.target);
      if (!s || !t) continue;
      gAll.lineBetween(px(s), py(s), px(t), py(t));
    }
    for (const lv of this.data_.levels) {
      this.add.image(px(lv), py(lv), ATLAS_MENU, `${prefixOf(lv.type)}_Bkg_Mask0000`).setScale(scale).setTint(maskTint(baseColor));
    }

    // 上层（imageDone 平色近似）：已通关侧金色叠绘（判据=至少一端 ≥1 星）+ 已解锁节点金色底座
    const gDone = this.add.graphics();
    gDone.lineStyle(16 * scale, goldColor, 1);
    for (const e of this.data_.edges) {
      const s = byId.get(e.source), t = byId.get(e.target);
      if (!s || !t) continue;
      if (!(done.has(s.filename) || done.has(t.filename))) continue;
      gDone.lineBetween(px(s), py(s), px(t), py(t));
    }
    for (const lv of this.data_.levels) {
      if (!playable.has(lv.filename) && starsOf(lv.filename) === 0) continue;
      this.add.image(px(lv), py(lv), ATLAS_MENU, `${prefixOf(lv.type)}_Bkg_Mask0000`).setScale(scale).setTint(maskTint(goldColor));
    }

    // 节点按钮
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
      const num = this.add
        .bitmapText(x, y + 3, FONT_MAIN, String(lv.id), 28)
        .setOrigin(0.5)
        .setVisible(false);
      this.numberTexts.push(num);
      btn.on("pointerup", () => {
        const levelId = lv.filename.split("/").pop()!.replace(".json", "");
        const cb = this.registry.get("onLevelPicked") as ((levelId: string, filename: string) => void) | undefined;
        cb?.(levelId, lv.filename);
      });
    }

    // 返回按钮（左下）
    const back = this.add
      .image(70, H - 80, ATLAS_MENU, "BackButton0000")
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    back.on("pointerup", () => this.scene.start("Menu"));
    this.add.bitmapText(70, H - 12, FONT_MAIN, "返回", 20).setOrigin(0.5);

    // 全 3 星首通 → 彩带（原版 firstComplete：置位 ProgressModel.process bundle:2149507，
    // 检查 LevelMenu.afterAddContent bundle:1932358）
    if (this.data_.levels.length > 0 && this.data_.levels.every((lv) => starsOf(lv.filename) === 3)) {
      if (!localStorage.getItem("fw-complete-shown")) {
        localStorage.setItem("fw-complete-shown", "1");
        this.scene.launch("CompleteScene");
      }
    }

    // 显示关卡数切换（右下，fontStone 20）
    const toggle = this.add
      .bitmapText(W - 115, H - 51, FONT_MAIN, "显示关卡数", 20)
      .setOrigin(0, 0.5)
      .setInteractive({ useHandCursor: true });
    toggle.on("pointerup", () => {
      this.showNumbers = !this.showNumbers;
      for (const t of this.numberTexts) t.setVisible(this.showNumbers);
    });
  }
}
