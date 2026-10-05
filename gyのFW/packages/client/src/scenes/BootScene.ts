/**
 * 资源加载场景：官方 atlas / 音频 / 动画定义。
 *
 * 渲染复刻原版（Phaser 2 版 output/A）的实测配方：
 * - 背景与门框在 TempleAssets；机关在 MechAssets；角色/钻石在 CharAssets；
 *   液体/特效在 GroundAssets；UI 贴图在 PopupAssets/MenuAssets。
 * - 原 M1 加载的 tilemaps/tilesets/{Chars,Ground}.png 在素材包中不存在（Tiled 只留了
 *   元数据 JSON），地面改为程序化绘制（见 GameScene.buildGround）。
 */
import Phaser from "phaser";

export const ATLAS_CHARS = "chars";
export const ATLAS_GROUND = "ground";
export const ATLAS_MECH = "mech";
export const ATLAS_TEMPLE = "temple";
export const ATLAS_POPUP = "popup";
export const ATLAS_MENU = "menu";

/**
 * 官方素材以高分辨率绘制。原版运行时角色帧缩放 0.95（帧含大量透明边距，
 * 可见内容 ≈ 2 瓦片高），门框 0.8，机关贴图保持原尺寸。
 */
export const PLAYER_SCALE = 0.95;

export class BootScene extends Phaser.Scene {
  constructor() {
    super("Boot");
  }

  preload(): void {
    this.load.atlas(ATLAS_CHARS, "/assets/atlasses/CharAssets.png", "/assets/atlasses/CharAssets.json");
    this.load.atlas(ATLAS_GROUND, "/assets/atlasses/GroundAssets.png", "/assets/atlasses/GroundAssets.json");
    this.load.atlas(ATLAS_MECH, "/assets/atlasses/MechAssets.png", "/assets/atlasses/MechAssets.json");
    this.load.atlas(ATLAS_TEMPLE, "/assets/atlasses/Temples/forest/TempleAssets.png", "/assets/atlasses/Temples/forest/TempleAssets.json");
    this.load.atlas(ATLAS_POPUP, "/assets/atlasses/PopupAssets.png", "/assets/atlasses/PopupAssets.json");
    this.load.atlas(ATLAS_MENU, "/assets/atlasses/MenuAssets.png", "/assets/atlasses/MenuAssets.json");

    // 音频（仅本场景触发全集：跳跃/拾取/死亡/开门/拉杆/踏板/平台/水声/音乐）
    // 统一走无扩展名流式路由（/s/ 前缀，服务器补 .mp3）：IDM 等下载接管工具
    // 按 URL 扩展名拦截媒体请求，浏览器侧只会拿到 204 空响应
    for (const [key, file] of [
      ["sfx_jump_fb", "Jump_fb.mp3"],
      ["sfx_jump_wg", "Jump_wg.mp3"],
      ["sfx_diamond", "Diamond.mp3"],
      ["sfx_death", "Death.mp3"],
      ["sfx_door", "Door.mp3"],
      ["sfx_lever", "Lever.mp3"],
      ["sfx_pusher", "Pusher.mp3"],
      ["sfx_platform", "Platform.mp3"],
      ["sfx_water_steps", "WaterSteps.mp3"],
      ["sfx_end_pass", "EndPass.mp3"],
      ["bgm_level", "LevelMusic.mp3"],
      ["bgm_finish", "LevelMusicFinish.mp3"],
    ] as const) {
      this.load.audio(key, `/assets/audio/s/${file.replace(/\.mp3$/, "")}`);
    }
  }

  create(): void {
    this.buildAnims();
    // 场景数据统一走全局句柄（settings.data 会被 Phaser 填成 {}，不可靠）
    this.scene.start("Game");
  }

  private buildAnims(): void {
    const a = this.anims;
    const seq = (key: string, atlas: string, prefix: string, start: number, end: number, frameRate: number, repeat: number) => {
      if (a.exists(key)) return;
      const frames: Phaser.Types.Animations.AnimationFrame[] = [];
      for (let i = start; i <= end; i++) frames.push({ key: atlas, frame: `${prefix}${String(i).padStart(4, "0")}` });
      a.create({ key, frames, frameRate, repeat });
    };

    // 帧率全部按原版实测 30fps（init.js：idle/jumping/rising/falling 均 30）
    for (const role of ["fire", "water"] as const) {
      seq(`${role}_idle`, ATLAS_CHARS, `${role}_head_idle`, 0, role === "fire" ? 18 : 29, 30, -1);
      seq(`${role}_legs_idle`, ATLAS_CHARS, `${role}_legs_idle`, 0, 0, 1, -1);
      seq(`${role}_legs_run`, ATLAS_CHARS, `${role}_legs_running`, 0, 7, 30, -1);
      seq(`${role}_jump`, ATLAS_CHARS, `${role}_head_jumping`, 0, 10, 30, 0);
      // E19 字证（init.js@1861937）：falling 对双角色都只注册 0..4
      // （water 图集虽有 11 帧表，原版注册子区间仍是 0..4）
      seq(`${role}_fall`, ATLAS_CHARS, `${role}_head_falling`, 0, 4, 30, -1);
      // E19 字证（init.js@1862115）：rising 0..4@30fps 循环（water 图集 11 帧同取子区间）
      seq(`${role}_rising`, ATLAS_CHARS, `${role}_head_rising`, 0, 4, 30, -1);
      // 通关上楼梯（原版 25fps 一次性，31 帧收 0..29 同段）
      seq(`${role}_stairs`, ATLAS_CHARS, `${role}_stairs`, 0, 29, 25, 0);
    }
    seq("smoke", ATLAS_CHARS, "death_smoke", 0, 44, 30, 0);
    // 风区机身（原版 Wind：generateFrameNames("wind_base",0,4)@30fps 循环；图集实有 0..3）
    seq("wind_base", ATLAS_MECH, "wind_base", 0, 3, 30, -1);
    // 风区尾迹（原版 Wind：wind_effect 0..30@30fps 循环，图集实有 0..29；随机起始帧由场景侧 setProgress）
    seq("wind_effect", ATLAS_MECH, "wind_effect", 0, 29, 30, -1);
    // 液体三段各 15 帧 30fps 循环（Left/中/Right）
    for (const [key, base] of [
      ["water", "WaterBox"],
      ["lava", "FireBox"],
      ["green", "GreenBox"],
    ] as const) {
      seq(`liquid_${key}`, ATLAS_GROUND, base, 0, 14, 30, -1);
      seq(`liquid_${key}_left`, ATLAS_GROUND, `${base}Left`, 0, 14, 30, -1);
      seq(`liquid_${key}_right`, ATLAS_GROUND, `${base}Right`, 0, 14, 30, -1);
    }
    // 结算星级石碑（to_1=1-7 / to_2=8-14 / to_3=15-21，30fps 一次性）
    // 门动画键不再注册（E10：门改按快照 doorFrame 逐帧 setFrame，动画键会与帧驱动打架）
    seq("finish_stone_1", ATLAS_POPUP, "FinishStone", 1, 7, 30, 0);
    seq("finish_stone_2", ATLAS_POPUP, "FinishStone", 8, 14, 30, 0);
    seq("finish_stone_3", ATLAS_POPUP, "FinishStone", 15, 21, 30, 0);
  }
}
