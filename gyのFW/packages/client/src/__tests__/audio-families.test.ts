/**
 * r16 移植（2026-10-27，并行性能线）+ r21/r25/r41 移植：BGM 选族与拆批的纯函数回归。
 *
 * 钉住：①族映射与 GameScene.bgmKey/finishKey 的三分支逐字同式（speed/dark/其余含
 * puzzle）；②DARK 族终局曲与 general 共用（speed 才换 finish，dark 不换）；③sfx 与
 * 失败曲与类型无关恒取（三庙机关声都在内）；④族包拆成 loop/terminal 两支后并集与族包
 * 恒等（r21/r25）；⑤GAME_BGM_KEYS 恰为三族并集，releaseGameBgms 每键先实例后缓存
 * （r41——实例钉 PCM，反序缓存归零而堆不还）。
 */
import { describe, expect, it } from "vitest";
import {
  AUDIO_BGM_DARK,
  AUDIO_BGM_GENERAL,
  AUDIO_BGM_OVER,
  AUDIO_BGM_SPEED,
  AUDIO_SFX,
  GAME_BGM_KEYS,
  LEVEL_BGM_KEYS,
  bgmFamilyOf,
  bgmFinishOf,
  bgmLoopOf,
  bgmPackOf,
  bgmTerminalOf,
  releaseGameBgms,
} from "../audio.js";

const keys = (pack: ReadonlyArray<readonly [string, string]>): string[] => pack.map(([k]) => k);

describe("bgmFamilyOf：与 GameScene.bgmKey 三分支同式", () => {
  it("speed/dark 各归其族，general/puzzle/未知/缺省一律 general", () => {
    expect(bgmFamilyOf("speed")).toBe("speed");
    expect(bgmFamilyOf("dark")).toBe("dark");
    for (const t of ["general", "puzzle", "", undefined, null]) {
      expect(bgmFamilyOf(t)).toBe("general");
    }
    expect(bgmFamilyOf("SPEED")).toBe("general"); // 严格比较，与 bgmKey 一致
  });
});

describe("三族清单与播放键一致性", () => {
  it("GENERAL = 开局曲+终局曲；SPEED = 双变体；DARK = 暗开局曲+general 终局曲", () => {
    expect(keys(AUDIO_BGM_GENERAL)).toEqual(["bgm_level", "bgm_finish"]);
    expect(keys(AUDIO_BGM_SPEED)).toEqual(["bgm_level_speed", "bgm_finish_speed"]);
    expect(keys(AUDIO_BGM_DARK)).toEqual(["bgm_level_dark", "bgm_finish"]);
  });

  it("DARK 族不含 speed 终局曲（finishKey 的 else 分支：dark 用 bgm_finish）", () => {
    expect(keys(AUDIO_BGM_DARK)).not.toContain("bgm_finish_speed");
    expect(keys(bgmPackOf("dark"))).toContain("bgm_finish");
  });
});

describe("族包拆分（r21/r25）：loop 与 terminal 两支", () => {
  it("循环曲每族恰一支：general/speed/dark 各归其变体", () => {
    expect(keys(bgmLoopOf("general"))).toEqual(["bgm_level"]);
    expect(keys(bgmLoopOf("speed"))).toEqual(["bgm_level_speed"]);
    expect(keys(bgmLoopOf("dark"))).toEqual(["bgm_level_dark"]);
  });

  it("终局时刻曲 = 失败曲（恒取）+ 本族终局曲；dark 与 general 共用 bgm_finish", () => {
    expect(keys(bgmTerminalOf("general"))).toEqual(["bgm_over", "bgm_finish"]);
    expect(keys(bgmTerminalOf("speed"))).toEqual(["bgm_over", "bgm_finish_speed"]);
    expect(keys(bgmTerminalOf("dark"))).toEqual(["bgm_over", "bgm_finish"]);
    expect(keys(bgmFinishOf("dark"))).toEqual(["bgm_finish"]);
  });

  it("loop ∪ terminal === 族包 ∪ 失败曲（拆批不丢键不添键）", () => {
    for (const f of ["general", "speed", "dark"] as const) {
      const pack = [...keys(bgmPackOf(f)), "bgm_over"].sort();
      const split = [...keys(bgmLoopOf(f)), ...keys(bgmTerminalOf(f))].sort();
      expect(split, f).toEqual(pack);
    }
  });

  it("GAME_BGM_KEYS 恰为三族 loop∪terminal 之并（离房交还全表无漏配）", () => {
    const union = new Set<string>();
    for (const f of ["general", "speed", "dark"] as const) {
      for (const [k] of [...bgmLoopOf(f), ...bgmTerminalOf(f)]) union.add(k);
    }
    expect([...union].sort()).toEqual([...GAME_BGM_KEYS].slice().sort());
  });

  it("LEVEL_BGM_KEYS 恰为三族循环曲键（#31 停音清单同源：漏键=叠播/串音）", () => {
    expect([...LEVEL_BGM_KEYS]).toEqual(["bgm_level", "bgm_level_speed", "bgm_level_dark"]);
    expect([...LEVEL_BGM_KEYS].sort()).toEqual(["bgm_level", "bgm_level_dark", "bgm_level_speed"].sort());
  });

  it("sfx 覆盖三庙机关声（forest 风/ice 冻融/light 滑块光推时钟）", () => {
    const ks = keys(AUDIO_SFX);
    for (const s of ["sfx_wind", "sfx_freeze", "sfx_melt", "sfx_slider", "sfx_lightpusher", "sfx_clock"]) {
      expect(ks, `缺 ${s}`).toContain(s);
    }
    expect(ks).toHaveLength(22);
    expect(keys(AUDIO_BGM_OVER)).toEqual(["bgm_over"]);
  });
});

describe("releaseGameBgms（r41）：六键全交还，先实例后缓存", () => {
  it("每键 sound.removeByKey 先于 cache.remove——顺序反了 PCM 被实例钉住", () => {
    const log: string[] = [];
    const sound = { removeByKey: (k: string) => log.push(`s:${k}`) } as unknown as Parameters<typeof releaseGameBgms>[0];
    const cache = { remove: (k: string) => log.push(`c:${k}`) } as unknown as Parameters<typeof releaseGameBgms>[1];
    releaseGameBgms(sound, cache);
    expect(log).toEqual(GAME_BGM_KEYS.flatMap((k) => [`s:${k}`, `c:${k}`]));
  });
});
