/**
 * 资源加载场景：官方 atlas / 图块集 / 背景图 / 动画定义。
 */
import Phaser from "phaser";

export const ATLAS_CHARS = "chars";
export const ATLAS_GROUND = "ground";
export const ATLAS_MECH = "mech";
/** Chars.png 图块集（64×64 × 8）：0火人标记 1水女孩 2火门 3水门 4红钻 5蓝钻 6银钻 7双色钻 */
export const SHEET_CHARS_TILES = "charstiles";
/** Ground.png 图块集（32×32 × 15 列） */
export const SHEET_GROUND_TILES = "groundtiles";
export const IMG_BG = "bg";

/** 官方素材以高分辨率绘制，统一缩小系数：目标角色显示高约 64px（2 瓦片） */
export const PLAYER_SCALE = 64 / 172;

export class BootScene extends Phaser.Scene {
  constructor() {
    super("Boot");
  }

  preload(): void {
    this.load.atlas(ATLAS_CHARS, "/assets/atlasses/CharAssets.png", "/assets/atlasses/CharAssets.json");
    this.load.atlas(ATLAS_GROUND, "/assets/atlasses/GroundAssets.png", "/assets/atlasses/GroundAssets.json");
    this.load.atlas(ATLAS_MECH, "/assets/atlasses/MechAssets.png", "/assets/atlasses/MechAssets.json");
    this.load.spritesheet(SHEET_CHARS_TILES, "/assets/tilemaps/tilesets/Chars.png", {
      frameWidth: 64,
      frameHeight: 64,
    });
    this.load.spritesheet(SHEET_GROUND_TILES, "/assets/tilemaps/tilesets/Ground.png", {
      frameWidth: 32,
      frameHeight: 32,
    });
    this.load.image(IMG_BG, "/assets/images/TempleHallForest.jpg");
  }

  create(): void {
    this.buildAnims();
    // 透传 main.ts 传入的 { net, level } 给 GameScene
    this.scene.start("Game", this.scene.settings.data);
  }

  private buildAnims(): void {
    const a = this.anims;
    const loop = (key: string, atlas: string, prefix: string, start: number, end: number, frameRate: number) => {
      if (a.exists(key)) return;
      const frames: Phaser.Types.Animations.AnimationFrame[] = [];
      for (let i = start; i <= end; i++) frames.push({ key: atlas, frame: `${prefix}${String(i).padStart(4, "0")}` });
      a.create({ key, frames, frameRate, repeat: -1 });
    };
    const once = (key: string, atlas: string, prefix: string, start: number, end: number, frameRate: number) => {
      if (a.exists(key)) return;
      const frames: Phaser.Types.Animations.AnimationFrame[] = [];
      for (let i = start; i <= end; i++) frames.push({ key: atlas, frame: `${prefix}${String(i).padStart(4, "0")}` });
      a.create({ key, frames, frameRate, repeat: 0 });
    };

    for (const [role, p] of [
      ["fire", "fire"],
      ["water", "water"],
    ] as const) {
      loop(`${role}_idle`, ATLAS_CHARS, `${p}_head_idle`, 0, role === "fire" ? 18 : 29, 12);
      loop(`${role}_legs_idle`, ATLAS_CHARS, `${p}_legs_idle`, 0, 0, 1);
      loop(`${role}_legs_run`, ATLAS_CHARS, `${p}_legs_running`, 0, 7, 14);
      once(`${role}_jump`, ATLAS_CHARS, `${p}_head_jumping`, 0, role === "fire" ? 10 : 10, 20);
      loop(`${role}_fall`, ATLAS_CHARS, `${p}_head_falling`, 0, role === "fire" ? 4 : 10, 12);
    }
    once("smoke", ATLAS_CHARS, "death_smoke", 0, 44, 30);
    loop("liquid_water", ATLAS_GROUND, "WaterBox", 0, 14, 10);
    loop("liquid_lava", ATLAS_GROUND, "FireBox", 0, 14, 10);
    loop("liquid_green", ATLAS_GROUND, "GreenBox", 0, 14, 10);
  }
}
