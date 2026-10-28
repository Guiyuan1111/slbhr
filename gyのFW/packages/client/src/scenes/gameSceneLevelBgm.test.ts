/**
 * #31 回归：暗关 BGM 键 bgm_level_dark 必须纳入所有「停止关卡 BGM」路径。
 *
 * bgm_level_dark 由 bgmKey() 在暗关选中，但此前的停止点（create 起播前清场、
 * SHUTDOWN 兜底、applyMusicSetting 关闭分支与重开判断、死亡切失败曲、重试重播、
 * 通关演出、暂停菜单退关）只处理 bgm_level/bgm_level_speed——关设置后暗关曲继续播、
 * 退关与大厅 BGM 叠播、重开 music 再叠一层、死亡/通关两曲同播、换关串音。
 *
 * GameScene 依赖完整 Phaser 运行时（无 headless harness），以源码契约为断言对象。
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { fileURLToPath } from "node:url";
import { LEVEL_BGM_KEYS } from "../audio.js";

const gameScene = readFileSync(fileURLToPath(new URL("./GameScene.ts", import.meta.url)), "utf8");
const menus = readFileSync(fileURLToPath(new URL("./menus.ts", import.meta.url)), "utf8");

describe("#31 bgm_level_dark 停音清单", () => {
  it("stopLevelBgm 覆盖三键（#49：键清单提 LEVEL_BGM_KEYS 常量——stopLevelBgm/SHUTDOWN 同源引用，键表内容由 audio-families 钉死）", () => {
    expect([...LEVEL_BGM_KEYS]).toEqual(["bgm_level", "bgm_level_speed", "bgm_level_dark"]);
    // 循环引用常量（不再内联字面量）：散键漏改会绕过同源清单
    expect(gameScene).toContain("for (const k of LEVEL_BGM_KEYS) this.sound.stopByKey(k);");
  });

  it("GameScene 中两键散停全部替换为 stopLevelBgm（仅定义处保留三键列表）", () => {
    // 修复前 5 处散停各写 stopByKey("bgm_level")+("bgm_level_speed") 两行；
    // 修复后仅 stopLevelBgm 定义内出现循环键。
    expect(gameScene.match(/this\.sound\.stopByKey\("bgm_level"\)/g)?.length ?? 0).toBe(0);
    expect(gameScene.match(/this\.sound\.stopByKey\("bgm_level_speed"\)/g)?.length ?? 0).toBe(0);
    expect(gameScene).toContain("this.stopLevelBgm()");
    // 五个调用点：create 起播前 / applyMusicSetting off / retry / 通关演出 / 死亡
    expect(gameScene.match(/this\.stopLevelBgm\(\)/g)!.length).toBe(5);
  });

  it("applyMusicSetting 重开判断三键任一在播不重播", () => {
    const m = gameScene.match(/applyMusicSetting\(\): void \{([\s\S]*?)\n  \}/);
    expect(m, "找不到 applyMusicSetting").toBeTruthy();
    expect(m![1]).toContain('!this.sound.isPlaying("bgm_level_dark")');
  });

  it("SHUTDOWN 兜底列表展开 LEVEL_BGM_KEYS（与 stopLevelBgm 同源，#49）", () => {
    const i = gameScene.indexOf("Events.SHUTDOWN, () => {");
    const body = gameScene.slice(i, i + 900);
    expect(body).toContain("...LEVEL_BGM_KEYS");
  });

  it("menus.ts 退关/关设置分支补停 bgm_level_dark", () => {
    expect(menus).toContain('this.sound.stopByKey("bgm_level_dark")');
  });
});
