/**
 * 选关界面（原版 States/LevelMenu/LevelMenu 复刻）。
 * temple.json 图结构：48 关卡节点（0~1 归一化 x/y）+ 47 条 edges 连线。
 * 布局：k=0.9H、C=min(1.2k, 0.9W)；节点 = (x·C − C/2, y·k − k/2)（居中系→这里直接用视口系）。
 * 进度：localStorage（progress.ts）；解锁 = initial 或相邻已通关（tree 传播）。
 * 点可玩关卡 → registry "onLevelPicked"(levelId, filename) → main.ts 弹出联机面板。
 */
import Phaser from "phaser";
import { ATLAS_MENU, ATLAS_TEMPLE, FONT_MAIN } from "./BootScene";
import { loadProgress, starsOf } from "../progress";

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
  }

  create(): void {
    const W = this.scale.width;
    const H = this.scale.height;
    // 选关界面延续菜单 BGM（Menu→Temple 不断；原版 45853 进关才 fadeOut）
    if (!this.sound.isPlaying("bgm_menu")) this.sound.play("bgm_menu", { loop: true, volume: 0.3 });
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

    // 连线（原版只画已解锁侧，颜色 = temple.color）
    const g = this.add.graphics();
    g.lineStyle(16 * scale, Phaser.Display.Color.HexStringToColor(this.data_.color).color, 1);
    for (const e of this.data_.edges) {
      const s = byId.get(e.source), t = byId.get(e.target);
      if (!s || !t) continue;
      if (!(done.has(s.filename) || done.has(t.filename))) continue;
      g.lineBetween(px(s), py(s), px(t), py(t));
    }

    // 节点按钮
    for (const lv of this.data_.levels) {
      const x = px(lv), y = py(lv);
      const stars = starsOf(lv.filename);
      const isPlayable = playable.has(lv.filename);
      if (!isPlayable && stars === 0) {
        this.add.image(x, y, ATLAS_MENU, "Lock0000").setScale(scale).setAlpha(0.9);
        continue;
      }
      const stateIdx = Math.min(stars, 3); // 0/1/2 星 → 0000/0001/0002；3 星 → 0003
      const prefix =
        lv.type === "speed" ? "DiamondSpeed" : lv.type === "puzzle" ? "DiamondPuzzle" : lv.type === "dark" ? "DiamondDark" : "Diamond";
      const frame = `${prefix}${String(stateIdx === 3 ? 3 : stars === 0 ? 0 : stars - 1).padStart(4, "0")}`;
      const btn = this.add
        .image(x, y, ATLAS_MENU, frame)
        .setScale(scale)
        .setInteractive({ useHandCursor: true });
      const num = this.add
        .bitmapText(x, y, FONT_MAIN, String(lv.id), 28)
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
