/**
 * 音频清单与分批装载（0.3.21 加载性能优化）。
 *
 * 原版游戏音频全集按【首个使用场景】分两批：
 * - menu 批：开始/选关/设置/制作名单/全通关彩带界面需要的键（仅 bgm_menu）；
 * - game 批：游戏内音效与关卡音乐（跳跃/拾取/死亡/开门/拉杆/平台/BGM 共 18 键，
 *   磁盘实测 2,058,151B ≈ 2.0MB，LevelMusic.mp3 占 1.29MB）——Menu 冷启动不为其付出
 *   传输：0.3.21 起由 GameScene.preload 懒装载（建房握手期并行下载），r6 起提前到
 *   MenuScene 驻留期后台暖装（BootScene.startBgWarm 同批），GameScene.preload 保留为
 *   兜底声明（已入 cache.audio 的键由 Phaser Loader 静默跳过）。
 *
 * 装载方式沿用 BootScene 既有约定：
 * - 无扩展名流式路由 /assets/audio/s/<name>（防 IDM 等按扩展名劫持媒体请求的工具）；
 * - 对象形式显式 type=mp3（无扩展名时 Phaser 会静默跳过入队——0.2.0 无声的根因）。
 */

/** [缓存键, 磁盘文件名] */
export const AUDIO_MENU: ReadonlyArray<readonly [string, string]> = [["bgm_menu", "MenuMusic.mp3"]];

export const AUDIO_GAME: ReadonlyArray<readonly [string, string]> = [
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
  ["bgm_over", "LevelMusicOver.mp3"],
  ["bgm_level_speed", "LevelMusic_speed.mp3"],
  ["bgm_finish_speed", "LevelMusicFinish_speed.mp3"],
  ["sfx_freeze", "Freeze.mp3"],
  ["sfx_melt", "Melt.mp3"],
  ["sfx_slider", "Slider.mp3"],
  ["sfx_lightpusher", "LightPusher.mp3"],
  ["bgm_level", "LevelMusic.mp3"],
  ["bgm_level_dark", "LevelMusic_dark.mp3"],
  ["bgm_finish", "LevelMusicFinish.mp3"],
] as const;

/** 按清单向场景装载器入队（已在缓存中的键由 Phaser Loader 自动跳过） */
export function loadAudioPack(scene: Phaser.Scene, pack: ReadonlyArray<readonly [string, string]>): void {
  for (const [key, file] of pack) {
    scene.load.audio(key, [{ url: `/assets/audio/s/${file.replace(/.mp3$/, "")}`, type: "mp3" }]);
  }
}
