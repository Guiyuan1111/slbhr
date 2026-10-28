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

/** 族内**循环曲**单支（r21 移植）：LevelMusic 1,315,960B / _speed / _dark 变体——进房段
 *  单笔最大的一笔，却不参与"可玩"所需的任何一帧：不进落定门也不进 GameScene 阻塞批，
 *  改为门后二段（BootScene.thenBgmDefer）+ create 后兜底（GameScene.kickBgmLoop）。 */
export function bgmLoopOf(family: BgmFamily): ReadonlyArray<readonly [string, string]> {
  return bgmPackOf(family).filter(([key]) => key === "bgm_level" || key === "bgm_level_speed" || key === "bgm_level_dark");
}

/** 族内**终局曲**单支（r25 移植语义；dark 与 general 共用 bgm_finish）。 */
export function bgmFinishOf(family: BgmFamily): ReadonlyArray<readonly [string, string]> {
  return bgmPackOf(family).filter(([key]) => key === "bgm_finish" || key === "bgm_finish_speed");
}

/** 两支**终局时刻曲**（r25 移植）：失败曲（与类型无关，163,438B）＋ 本族终局曲。它们出声的
 *  时点在死亡或通关那一刻，必然晚于进房若干秒——出落定门与阻塞批，门后二段兜底；
 *  缺键时 sfx 的 exists 卫静默跳过（won 补演只是晚响一秒，不是能不能活）。 */
export function bgmTerminalOf(family: BgmFamily): ReadonlyArray<readonly [string, string]> {
  return [...AUDIO_BGM_OVER, ...bgmFinishOf(family)];
}

/** 关卡循环曲三键停音清单（#31→#49）：bgm_level_dark 曾漏出全部停止路径致叠播/串音；
 *  stopLevelBgm 与 SHUTDOWN 兜底列表同源引用，键表改动单测钉死（audio-families）。 */
export const LEVEL_BGM_KEYS = ["bgm_level", "bgm_level_speed", "bgm_level_dark"] as const;

/** 房内 BGM 键全表（r41 移植，扩三族六键）：离房回选关时连同解码 PCM 一起交还——大厅只活
 *  bgm_menu 与 sfx，这六支在大厅一秒也不响。重进由 kickBgmLoop/kickBgmTerminal 按需重取
 *  （服务端 r15 ETag 使复验只花 304 往返，无正文重下）。 */
export const GAME_BGM_KEYS = [
  "bgm_level",
  "bgm_level_speed",
  "bgm_level_dark",
  "bgm_finish",
  "bgm_finish_speed",
  "bgm_over",
] as const;

/** 交还房内 BGM：先销毁 Sound 实例（WebAudioSound.audioBuffer 仍引用 PCM），再删缓存条目；
 *  顺序反了缓冲区会被实例钉住——缓存账归零而堆不还。 */
export function releaseGameBgms(sound: Phaser.Sound.BaseSoundManager, cache: Phaser.Cache.BaseCache): void {
  for (const key of GAME_BGM_KEYS) {
    sound.removeByKey(key);
    cache.remove(key);
  }
}

/** 按清单向场景装载器入队（已在缓存中的键由 Phaser Loader 自动跳过） */
export function loadAudioPack(scene: Phaser.Scene, pack: ReadonlyArray<readonly [string, string]>): void {
  for (const [key, file] of pack) {
    scene.load.audio(key, [{ url: `/assets/audio/s/${file.replace(/.mp3$/, "")}`, type: "mp3" }]);
  }
}
