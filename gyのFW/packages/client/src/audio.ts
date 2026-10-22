/**
 * 音频清单与分批装载（0.3.21 加载性能优化；r16 起 BGM 按关卡类型选族）。
 *
 * 原版游戏音频全集按【首个使用场景】分两批：
 * - menu 批：开始/选关/设置/制作名单/全通关彩带界面需要的键（仅 bgm_menu）；
 * - game 批：游戏内音效与关卡音乐——Menu 冷启动不为其付出传输：0.3.21 起由
 *   GameScene.preload 懒装载（建房握手期并行下载），r6 起提前到 MenuScene 驻留期
 *   后台暖装（BootScene.startBgWarm 同批），GameScene.preload 保留为兜底声明
 *   （已入 cache.audio 的键由 Phaser Loader 静默跳过）。
 *
 * r16 件A：game 批的 BGM 不再四支全取。与 oracle `preloadAudioFiles`
 * （bundle:1887237）同构——它按 `levelData.type` 只入三支：
 * `dark → (levelMusic_dark, Over, Finish)`、`speed → (levelMusic_speed, Over,
 * Finish_speed)`、其余 → `(levelMusic, Over, Finish)`。我方森林 48 关类型分布
 * general 24 / puzzle 14 / speed 10、无 dark 条目，且 `bgmKey()/finishKey()` 本就把
 * 非 speed 一律当 general，故这里只做两支族（缺省 general）。字节面额（磁盘实测，
 * benchmark 口径 KB=bytes/1024）：非 speed 关省两支 `_speed` 变体 180,354B ≈176.1KB，
 * speed 关省 `LevelMusic`(1,315,960B)+`LevelMusicFinish`(167,617B) ≈1448.8KB；代价是
 * 「选关线进 speed 关」时那 176.1KB 落到进房路径（暖装只能猜缺省族）。`LevelMusic_dark`
 * 481,698B 森林 48 关无 dark 条目，沿用现状不装载（oracle 有、我方无入口）。
 *
 * 装载方式沿用 BootScene 既有约定：
 * - 无扩展名流式路由 /assets/audio/s/<name>（防 IDM 等按扩展名劫持媒体请求的工具）；
 * - 对象形式显式 type=mp3（无扩展名时 Phaser 会静默跳过入队——0.2.0 无声的根因）。
 */

/** [缓存键, 磁盘文件名] */
export const AUDIO_MENU: ReadonlyArray<readonly [string, string]> = [["bgm_menu", "MenuMusic.mp3"]];

/** 游戏内音效全集（与关卡类型无关） */
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
] as const;

/** 失败曲：三种类型都用它（oracle 同式，bundle:1887237 的 levelMusicOver） */
export const AUDIO_BGM_OVER: ReadonlyArray<readonly [string, string]> = [["bgm_over", "LevelMusicOver.mp3"]] as const;

export type BgmFamily = "general" | "speed";

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

/** 关卡类型 → BGM 族。与 GameScene.bgmKey/finishKey 的 `=== "speed"` 判据逐字同式 */
export function bgmFamilyOf(templeType: string | null | undefined): BgmFamily {
  return templeType === "speed" ? "speed" : "general";
}

/** 某族的 BGM 族清单（不含 sfx 与失败曲） */
export function bgmPackOf(family: BgmFamily): ReadonlyArray<readonly [string, string]> {
  return family === "speed" ? AUDIO_BGM_SPEED : AUDIO_BGM_GENERAL;
}

/**
 * 族内**循环曲**单支（r21）：`LevelMusic` 1285.4KB / `LevelMusic_speed` 是其变体。
 * 它是进房段单笔最大的一支，却不参与"可玩"所需的任何一帧——从落定门与阻塞批里挪出，
 * 改为门后二段 + create 后兜底（见 BootScene.startBgWarm / GameScene.kickBgmLoop）。
 */
export function bgmLoopOf(family: BgmFamily): ReadonlyArray<readonly [string, string]> {
  return bgmPackOf(family).filter(([key]) => key === "bgm_level" || key === "bgm_level_speed");
}

/** 族内**终局曲**单支。r25 起它出落定门（原先留门的理由是"won 补演可能在 create 同帧取键"，
 *  那条前提成立、但结论错了：缺键不会抛错也不会警告——`GameScene.sfx` 第一行就按
 *  `cache.audio.exists` 静默跳过（GameScene.ts:581），所以留门的代价（163.7KB）买来的是
 *  "补演可能晚响一秒"，而不是"补演能不能活"。晚响由 `GameScene.kickBgmTerminal` 的补起处理。 */
export function bgmFinishOf(family: BgmFamily): ReadonlyArray<readonly [string, string]> {
  return bgmPackOf(family).filter(([key]) => key === "bgm_finish" || key === "bgm_finish_speed");
}

/**
 * 两支**终局时刻曲**（r25）：失败曲（与类型无关，159.6KB）＋ 本族终局曲（general 163.7KB／
 * speed 变体 68.9KB）。它们是落定门里最后一笔"没有一帧、没有一秒靠它"的字节——出声时点在
 * 死亡或通关那一刻，而那必然晚于进房若干秒。与 r21 循环曲同条门后批（BootScene.thenLoop），
 * 快速进房那条路再由 GameScene.kickBgmTerminal 兜底。
 */
export function bgmTerminalOf(family: BgmFamily): ReadonlyArray<readonly [string, string]> {
  return [...AUDIO_BGM_OVER, ...bgmFinishOf(family)];
}

/** 按清单向场景装载器入队（已在缓存中的键由 Phaser Loader 自动跳过） */
export function loadAudioPack(scene: Phaser.Scene, pack: ReadonlyArray<readonly [string, string]>): void {
  for (const [key, file] of pack) {
    scene.load.audio(key, [{ url: `/assets/audio/s/${file.replace(/.mp3$/, "")}`, type: "mp3" }]);
  }
}
