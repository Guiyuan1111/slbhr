/**
 * r16 移植（2026-10-27，并行性能线）：BGM 按关卡类型选族的纯函数回归。
 *
 * 钉住四件事：①族映射与 GameScene.bgmKey/finishKey 的三分支逐字同式（speed/dark/其余
 * 含 puzzle）；②DARK 族终局曲与 general 共用（finishKey 的 else 分支语义——speed 才换
 * finish，dark 不换）；③sfx 与失败曲与类型无关恒取（三庙机关声都在内）；④三庙 142 关
 * 全类型覆盖下 audioGamePackOf 只含本族 BGM，绝无跨族键。
 */
import { describe, expect, it } from "vitest";
import {
  AUDIO_BGM_DARK,
  AUDIO_BGM_GENERAL,
  AUDIO_BGM_OVER,
  AUDIO_BGM_SPEED,
  AUDIO_SFX,
  audioGamePackOf,
  bgmFamilyOf,
  bgmPackOf,
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

describe("audioGamePackOf：sfx+失败曲恒取，BGM 只取本族", () => {
  it("sfx 覆盖三庙机关声（forest 风/ice 冻融/light 滑块光推时钟）", () => {
    for (const t of ["speed", "dark", "general"]) {
      const ks = keys(audioGamePackOf(t));
      for (const s of ["sfx_wind", "sfx_freeze", "sfx_melt", "sfx_slider", "sfx_lightpusher", "sfx_clock"]) {
        expect(ks, `${t} 缺 ${s}`).toContain(s);
      }
      expect(ks).toContain("bgm_over");
    }
    expect(keys(AUDIO_SFX)).toHaveLength(18);
    expect(keys(AUDIO_BGM_OVER)).toEqual(["bgm_over"]);
  });

  it("speed 关：含 speed 双变体，不含 general/dark 开局曲与 general 终局曲", () => {
    const ks = keys(audioGamePackOf("speed"));
    expect(ks).toContain("bgm_level_speed");
    expect(ks).toContain("bgm_finish_speed");
    for (const absent of ["bgm_level", "bgm_level_dark", "bgm_finish"]) expect(ks).not.toContain(absent);
  });

  it("dark 关：含暗开局曲+general 终局曲，不含 general/speed 开局曲", () => {
    const ks = keys(audioGamePackOf("dark"));
    for (const present of ["bgm_level_dark", "bgm_finish"]) expect(ks).toContain(present);
    for (const absent of ["bgm_level", "bgm_level_speed", "bgm_finish_speed"]) expect(ks).not.toContain(absent);
  });

  it("general/puzzle 关：含 general 双曲，不含 dark 与 speed 变体", () => {
    for (const t of ["general", "puzzle", undefined]) {
      const ks = keys(audioGamePackOf(t));
      for (const present of ["bgm_level", "bgm_finish"]) expect(ks, String(t)).toContain(present);
      for (const absent of ["bgm_level_dark", "bgm_level_speed", "bgm_finish_speed"]) expect(ks, String(t)).not.toContain(absent);
    }
  });
});
