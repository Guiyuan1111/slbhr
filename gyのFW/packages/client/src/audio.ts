/**
 * 音频清单与分批装载（0.3.21 加载性能优化；r16 移植 2026-10-27 起 BGM 按关卡类型选族）。
 *
 * 原版游戏音频全集按【首个使用场景】分两批：
 * - menu 批：开始/选关/设置/制作名单/全通关彩带界面需要的键（仅 bgm_menu）；
 * - game 批：游戏内音效与关卡音乐——Menu 冷启动不为其付出传输：0.3.21 起由
 *   GameScene.preload 懒装载（建房握手期并行下载），r6 起提前到 MenuScene 驻留期
 *   后台暖装（BootScene.startBgWarm 同批），GameScene.preload 保留为兜底声明
 *   （已入 cache.audio 的键由 Phaser Loader 静默跳过）。
 *
 * r16（并行性能线移植，适配三庙）：game 批的 BGM 不再全取。与 oracle
 * `preloadAudioFiles`（bundle:1887237）同构——dark → (levelMusic_dark, Over,
 * Finish)、speed → (levelMusic_speed, Over, Finish_speed)、其余（含 puzzle）→
 * (levelMusic, Over, Finish)。三庙 142 关类型分布 general 69 / puzzle 41 / speed 25 /
 * dark 7（light 部新增 dark，qoder 原版"森林无 dark"前提在 main 已不成立，故扩三族）。
 * 播放侧键选择（GameScene.bgmKey/finishKey）本就三分支同式，此处仅装载面收口。
 * 字节面额（磁盘实测）：general/puzzle 关省 speed 两支 180,354B + dark 一支 481,698B
 * ≈646.5KB；speed 关省 1,965,275B ≈1919.2KB；dark 关省 1,659,752B ≈1620.9KB。
 * 代价：暖装猜错族时（缺省 general、深链预判兜住大部分）缺的那支落到进房路径补齐。
 *
 * 装载方式沿用 BootScene 既有约定：
 * - 无扩展名流式路由 /assets/audio/s/<name>（防 IDM 等按扩展名劫持媒体请求的工具）；
 * - 对象形式显式 type=mp3（无扩展名时 Phaser 会静默跳过入队——0.2.0 无声的根因）。
 */

/** [缓存键, 磁盘文件名] */
export const AUDIO_MENU: ReadonlyArray<readonly [string, string]> = [["bgm_menu", "MenuMusic.mp3"]];

/** 游戏内音效全集（与关卡类型无关，恒取——三庙机关声都在内，拆庙收益小且徒增缺键面） */
export const AUDIO_SFX: ReadonlyArray<readonly [string, string]> = [
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
  ["sfx_end_fail", "EndFail.mp3"],
  ["sfx_end_diamond", "EndDiamond.mp3"],
  ["sfx_wind", "Wind.mp3"],
  ["sfx_freeze", "Freeze.mp3"],
  ["sfx_melt", "Melt.mp3"],
  ["sfx_slider", "Slider.mp3"],
  ["sfx_lightpusher", "LightPusher.mp3"],
  ["sfx_clock", "Clock.mp3"],
] as const;

/** 失败曲：三种类型都用它（oracle 同式，bundle:1887237 的 levelMusicOver） */
export const AUDIO_BGM_OVER: ReadonlyArray<readonly [string, string]> = [["bgm_over", "LevelMusicOver.mp3"]] as const;

export type BgmFamily = "general" | "speed" | "dark";

/** general/puzzle 族：开局曲 + 终局曲 */
export const AUDIO_BGM_GENERAL: ReadonlyArray<readonly [string, string]> = [
  ["bgm_level", "LevelMusic.mp3"],
  ["bgm_finish", "LevelMusicFinish.mp3"],
] as const;

/** speed 族专属变体 */
export const AUDIO_BGM_SPEED: ReadonlyArray<readonly [string, string]> = [
  ["bgm_level_speed", "LevelMusic_speed.mp3"],
  ["bgm_finish_speed", "LevelMusicFinish_speed.mp3"],
] as const;

/** dark 族（light 部 7 关）：开局曲用暗关变体，终局曲与 general 共用（oracle 同式，
 *  GameScene.finishKey 的 else 分支即此语义——speed 才换 finish，dark 不换） */
export const AUDIO_BGM_DARK: ReadonlyArray<readonly [string, string]> = [
  ["bgm_level_dark", "LevelMusic_dark.mp3"],
  ["bgm_finish", "LevelMusicFinish.mp3"],
] as const;

/** 关卡类型 → BGM 族。与 GameScene.bgmKey 的 speed/dark/其余三分支逐字同式 */
export function bgmFamilyOf(templeType: string | null | undefined): BgmFamily {
  if (templeType === "speed") return "speed";
  if (templeType === "dark") return "dark";
  return "general";
}

/** 某族的 BGM 族清单（不含 sfx 与失败曲） */
export function bgmPackOf(family: BgmFamily): ReadonlyArray<readonly [string, string]> {
  return family === "speed" ? AUDIO_BGM_SPEED : family === "dark" ? AUDIO_BGM_DARK : AUDIO_BGM_GENERAL;
}

/** 某关卡类型的完整 game 批（sfx + 失败曲 + 本族 BGM）——暖装与 GameScene.preload 共用 */
export function audioGamePackOf(templeType: string | null | undefined): ReadonlyArray<readonly [string, string]> {
  return [...AUDIO_SFX, ...AUDIO_BGM_OVER, ...bgmPackOf(bgmFamilyOf(templeType))];
}

/** 按清单向场景装载器入队（已在缓存中的键由 Phaser Loader 自动跳过） */
export function loadAudioPack(scene: Phaser.Scene, pack: ReadonlyArray<readonly [string, string]>): void {
  for (const [key, file] of pack) {
    scene.load.audio(key, [{ url: `/assets/audio/s/${file.replace(/.mp3$/, "")}`, type: "mp3" }]);
  }
}
