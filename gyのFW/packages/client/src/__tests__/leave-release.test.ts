/**
 * r41/r42 离房资源交还的静态防护网。
 *
 * 失效模式全是静默的：字体/结算图集被提前卸掉而某个面板仍用旧键，BitmapText 不抛错——
 * 缺字形画空白；BGM 被卸掉而重进没有重取路径，`GameScene.sfx` 首行按 `cache.audio.exists`
 * 静默跳过——进房没声。r42 的角色序列帧还多一层 r39 类风险：动画键是全局的，纹理卸掉后
 * Frame.data 为 null，而 buildSeq 的 exists 卫拒绝重建。所以这里按"交还—重取"成对钉：
 * 每个被离房交还的键/动画，必须在源码里有一条可到达的重取声明；同时钉住交还只发生在
 * leaveToMenu（房内换关 advance 不得经过），且摘键先于卸纹理。
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { AUDIO_BGM_OVER, AUDIO_MENU, AUDIO_SFX, GAME_BGM_KEYS, bgmPackOf, bgmTerminalOf, bgmLoopOf } from "../audio";

const ROOT = path.resolve(import.meta.dirname, "..", "..", "..", "..");
const SRC = (p: string) => readFileSync(path.join(ROOT, p), "utf8");
const MAIN = "packages/client/src/main.ts";
const GAME = "packages/client/src/scenes/GameScene.ts";
const BOOT = "packages/client/src/scenes/BootScene.ts";
const AUDIO = "packages/client/src/audio.ts";
const HALL = ["packages/client/src/scenes/MenuScene.ts", "packages/client/src/scenes/TempleScene.ts", "packages/client/src/scenes/menus.ts"];

/** 三个结算键在 BootScene 里以字面量声明；测试独立抄一份，避免"用被测量当尺子" */
const FINISH_KEYS = ["popup-finish-general", "popup-finish-speed", "popup-finish-puzzle"] as const;

/** r42 角色房内十一式动画键；同样独立抄一份，与 BootScene 声明和 buildCharAnims 注册集三方对拍 */
const CHAR_KEYS = [
  "fire_legs_run", "fire_jump", "fire_fall", "fire_rising", "fire_stairs",
  "water_legs_run", "water_jump", "water_fall", "water_rising", "water_stairs",
  "smoke",
] as const;

/** 剥注释（保持长度与行号，跳过字符串）：注释里的示例调用不能当成调用点 */
function stripComments(src: string): string {
  const out = src.split("");
  const blank = (from: number, to: number) => {
    for (let i = from; i < to; i++) if (out[i] !== "\n") out[i] = " ";
  };
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    const n = src[i + 1];
    if (c === "/" && n === "/") {
      let j = i;
      while (j < src.length && src[j] !== "\n") j++;
      blank(i, j);
      i = j;
    } else if (c === "/" && n === "*") {
      const j = src.indexOf("*/", i + 2);
      const end = j < 0 ? src.length : j + 2;
      blank(i, end);
      i = end;
    } else if (c === '"' || c === "'" || c === "`") {
      let j = i + 1;
      while (j < src.length && (src[j] !== c || src[j - 1] === "\\")) j++;
      i = j + 1;
    } else i++;
  }
  return out.join("");
}

/** 取花括号配平的函数体（leaveToMenu 是箭头常量，按 `\n}` 切会切到别的函数） */
function bracedBody(file: string, sig: string): string {
  const src = stripComments(SRC(file));
  const at = src.indexOf(sig);
  expect(at, `${file} 里找不到 ${sig}`).toBeGreaterThan(-1);
  const start = src.indexOf("{", at);
  expect(start, `${sig} 没有函数体`).toBeGreaterThan(at);
  let depth = 0;
  for (let i = start; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}" && --depth === 0) return src.slice(start, i + 1);
  }
  throw new Error(`${sig} 花括号没有配平`);
}

const main = stripComments(SRC(MAIN));
const leave = bracedBody(MAIN, "const leaveToMenu = (): void =>");

describe("r41/r42 离房交还：调用点在 leaveToMenu 内且顺序固定", () => {
  it("先停场景与既有交还，再交还字体/结算/角色序列帧/BGM，最后才起 Temple", () => {
    const at = (s: string) => {
      const i = leave.indexOf(s);
      expect(i, `leaveToMenu 缺 ${s}`).toBeGreaterThan(-1);
      return i;
    };
    const order = [
      'sm.stop("Game")',
      "GameScene.releaseGrounds",
      "GameScene.releaseTempleFinish",
      "GameScene.releaseRoomFont",
      "GameScene.releasePopupFinish",
      "GameScene.releaseCharsPlay",
      "releaseGameBgms",
      'sm.start("Temple")',
    ];
    const pos = order.map(at);
    expect(pos).toEqual([...pos].sort((a, b) => a - b)); // 严格递增
    // 各只调一次：重复调用在 dispose 语义上无害，但说明有人把交还铺到了别处
    for (const s of ["GameScene.releaseRoomFont", "GameScene.releasePopupFinish", "GameScene.releaseCharsPlay", "releaseGameBgms"]) {
      expect(leave.split(s).length - 1, `${s} 在 leaveToMenu 里出现多次`).toBe(1);
    }
    // 交还的是全局 sound manager / textures / anims（scene 上的同名属性都是 game 级，见 Phaser InjectionMap）
    expect(leave).toContain("releaseGameBgms(phaser!.sound, phaser!.cache.audio)");
    expect(leave).toContain("GameScene.releaseCharsPlay(phaser!.textures, phaser!.anims)");
  });

  it("advance（房间内换关）不经过交还：四个入口在 main.ts 里只有 leaveToMenu 一处调用", () => {
    for (const s of ["GameScene.releaseRoomFont(", "GameScene.releasePopupFinish(", "GameScene.releaseCharsPlay(", "releaseGameBgms("]) {
      const calls = [...main.matchAll(new RegExp(s.replace(/[().]/g, "\\$&"), "g"))].length;
      expect(calls, `${s} 调用点数`).toBe(1);
    }
    // 「继续」的房内换关走 __fwNextLevel → net.advance，不碰 leaveToMenu
    expect(main).toContain("net.advance(nextId)");
  });
});

describe("r41 交还键表：只交还房内独占，菜单与音效不动", () => {
  it("五支 BGM 恰为 GameScene SHUTDOWN 停音表里去掉 bgm_menu/sfx 的余集", () => {
    const game = stripComments(SRC(GAME));
    const m = game.match(/for \(const k of \[([^\]]+)\]\) \{\s*this\.sound\.stopByKey\(k\)/);
    expect(m, "GameScene 的 SHUTDOWN 停音表找不到").not.toBeNull();
    const stopped = [...m![1].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
    expect(stopped).toContain("bgm_menu"); // 菜单曲在停音表里，但必须留在缓存
    const expected = stopped.filter((k) => k !== "bgm_menu" && !k.startsWith("sfx_"));
    expect([...GAME_BGM_KEYS].sort()).toEqual(expected.sort());
  });

  it("键表不含 bgm_menu、不含任何 sfx；菜单批与音效批的装载清单未被改动", () => {
    const keys: readonly string[] = GAME_BGM_KEYS;
    expect([...AUDIO_MENU].map(([k]) => k)).toEqual(["bgm_menu"]);
    expect(keys.includes("bgm_menu")).toBe(false);
    for (const [k] of AUDIO_SFX) expect(keys.includes(k), `${k} 被从大厅交还`).toBe(false);
    // 五键与三张装载表同源：general/speed 循环+终局、失败曲
    const loaded = new Set([
      ...[...bgmPackOf("general"), ...bgmPackOf("speed"), ...AUDIO_BGM_OVER].map(([k]) => k),
      ...[...bgmTerminalOf("general"), ...bgmTerminalOf("speed"), ...bgmLoopOf("general"), ...bgmLoopOf("speed")].map(([k]) => k),
    ]);
    expect([...GAME_BGM_KEYS].filter((k) => !loaded.has(k))).toEqual([]);
  });

  it("先销毁 Sound 实例再删缓存：WebAudioSound.audioBuffer 会钉住 PCM", () => {
    const src = stripComments(SRC(AUDIO));
    const at = src.indexOf("export function releaseGameBgms");
    expect(at).toBeGreaterThan(-1);
    const fn = src.slice(at, src.indexOf("\n}", at));
    expect(fn).toContain("GAME_BGM_KEYS");
    expect(fn).toContain("sound.removeByKey(key)");
    expect(fn).toContain("cache.remove(key)");
    expect(fn.indexOf("removeByKey")).toBeLessThan(fn.indexOf("cache.remove"));
  });
});

describe("r41 重取路径成对存在", () => {
  it("字体：两变体都交还，进房 preload 与三块面板的 preload 仍是重取入口", () => {
    const fn = bracedBody(GAME, "static releaseRoomFont");
    expect(fn).toContain("FONT_FULL");
    expect(fn).toContain("FONT_ROOM");
    expect(fn).toContain("textures.remove");
    expect(bracedBody(GAME, "preload(): void"), "GameScene.preload 少了字体兜底").toContain("loadRoomFont(this.load)");
    const overlays = stripComments(SRC("packages/client/src/scenes/overlays.ts"));
    expect([...overlays.matchAll(/loadRoomFont\(this\.load\)/g)].length, "三块面板各要一条兜底声明").toBe(3);
  });

  it("结算变体：三张都在交还表，kickPopupFinish 与 EndMenu.preload 仍声明", () => {
    expect([...FINISH_KEYS]).toEqual(["popup-finish-general", "popup-finish-speed", "popup-finish-puzzle"]);
    const fn = bracedBody(GAME, "static releasePopupFinish");
    expect(fn).toContain("FINISH_ATLAS_KEYS");
    const boot = stripComments(SRC(BOOT));
    const decl = boot.match(/export const FINISH_ATLAS_KEYS = \[([^\]]+)\]/);
    expect(decl, "FINISH_ATLAS_KEYS 声明找不到").not.toBeNull();
    const ids = ["ATLAS_FINISH_GENERAL", "ATLAS_FINISH_SPEED", "ATLAS_FINISH_PUZZLE"];
    expect([...decl![1].matchAll(/[A-Z_]+/g)].map((x) => x[0])).toEqual(ids);
    for (const [i, k] of FINISH_KEYS.entries()) {
      expect(boot, `${k} 的字面量声明不在 BootScene`).toContain(`export const ${ids[i]} = "${k}"`);
    }
    expect(bracedBody(GAME, "private kickPopupFinish")).toContain("loadPopupFinish(this.load");
    const overlays = stripComments(SRC("packages/client/src/scenes/overlays.ts"));
    expect(overlays).toContain("loadPopupFinish(this.load");
  });

  it("BGM：create 仍挂两条 kick，交还的五键各有装载来源", () => {
    const create = bracedBody(GAME, "create(): void");
    expect(create).toContain("this.kickBgmLoop()");
    expect(create).toContain("this.kickBgmTerminal()");
    expect(bracedBody(GAME, "private kickBgmLoop")).toContain("bgmLoopOf(bgmFamilyOf");
    expect(bracedBody(GAME, "private kickBgmTerminal")).toContain("bgmTerminalOf(bgmFamilyOf");
    const loops = new Set([...bgmLoopOf("general"), ...bgmLoopOf("speed")].map(([k]) => k));
    const terminal = new Set([...bgmTerminalOf("general"), ...bgmTerminalOf("speed")].map(([k]) => k));
    for (const k of GAME_BGM_KEYS) expect(loops.has(k) || terminal.has(k), `${k} 没有重取来源`).toBe(true);
  });

  it("大厅零消费：菜单/选关/面板不装载房内字体、结算变体与关卡 BGM（stopByKey 不算消费）", () => {
    for (const f of HALL) {
      const src = stripComments(SRC(f));
      for (const ban of ["FONT_FULL", "FONT_ROOM", "ATLAS_FINISH_", "popupFinishKey", "bgmLoopOf", "bgmTerminalOf", "loadRoomFont", "loadPopupFinish"]) {
        expect(src.includes(ban), `${f} 仍引用 ${ban}`).toBe(false);
      }
      for (const k of GAME_BGM_KEYS) {
        expect(new RegExp(`sfx\\("${k}"`).test(src), `${f} 仍在起播 ${k}`).toBe(false);
      }
    }
    // 大厅自己的字走 FONT_MAIN；bgm_menu 由 Temple/Menu 起播
    expect(stripComments(SRC("packages/client/src/scenes/TempleScene.ts"))).toContain("ensureMenuBgm");
  });
});

describe("r42 角色序列帧：摘键先于卸图，重取链完整，大厅零消费", () => {
  it("交还实现：先删十一式动画键，再 remove chars-play 纹理", () => {
    const fn = bracedBody(GAME, "static releaseCharsPlay");
    expect(fn).toContain("CHAR_PLAY_ANIM_KEYS");
    expect(fn).toContain("anims.exists");
    expect(fn).toContain("anims.remove");
    expect(fn).toContain("textures.exists(ATLAS_CHARS_PLAY)");
    expect(fn).toContain("textures.remove(ATLAS_CHARS_PLAY)");
    expect(fn.indexOf("anims.remove"), "摘键必须早于卸纹理（r39 的 Frame 失效模式）").toBeLessThan(fn.indexOf("textures.remove"));
  });

  it("键表三方一致：BootScene 声明 == 测试清单 == buildCharAnims 注册集", () => {
    const boot = stripComments(SRC(BOOT));
    const decl = boot.match(/export const CHAR_PLAY_ANIM_KEYS = \[([\s\S]*?)\] as const/);
    expect(decl, "CHAR_PLAY_ANIM_KEYS 声明找不到").not.toBeNull();
    const declared = [...decl![1].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
    expect(declared.sort()).toEqual([...CHAR_KEYS].sort());

    const body = bracedBody(BOOT, "export function buildCharAnims");
    const roles = [...(body.match(/for \(const role of \[([^\]]+)\]/)![1].matchAll(/"([^"]+)"/g))].map((x) => x[1]);
    expect(roles.sort()).toEqual(["fire", "water"]);
    const prefixes = [...body.matchAll(/seq\(`\$\{role\}_([a-z_]+)`/g)].map((x) => x[1]);
    const smoke = [...body.matchAll(/seq\("([a-z_]+)", ATLAS_CHARS_PLAY/g)].map((x) => x[1]);
    expect(prefixes.length, "buildCharAnims 的模板注册数").toBe(5);
    expect(smoke).toEqual(["smoke"]);
    const registered = [...roles.flatMap((r) => prefixes.map((p) => `${r}_${p}`)), ...smoke].sort();
    expect([...CHAR_KEYS].sort()).toEqual(registered);
  });

  it("重取路径：create 仍挂 kickCharsPlay 与 ensureCharAnims，纹理到达后重建动画", () => {
    const create = bracedBody(GAME, "create(): void");
    expect(create).toContain("ensureCharAnims(this");
    expect(create).toContain("this.kickCharsPlay()");
    const kick = bracedBody(GAME, "private kickCharsPlay");
    expect(kick).toContain("textures.exists(ATLAS_CHARS_PLAY)");
    expect(kick).toContain("loadCharsPlay(this.load)");
    const ensure = bracedBody(BOOT, "export function ensureCharAnims");
    expect(ensure).toContain('textures.exists(ATLAS_CHARS_PLAY)');
    expect(ensure).toContain("buildCharAnims(scene.anims)");
    expect(ensure).toContain("atlasjson-${ATLAS_CHARS_PLAY}");
  });

  it("大厅零消费：Menu/Temple/Settings 不引用 chars-play 纹理、装载器或十一式动画键", () => {
    for (const f of HALL) {
      const src = stripComments(SRC(f));
      for (const ban of ["ATLAS_CHARS_PLAY", "loadCharsPlay", "chars-play", ...CHAR_KEYS]) {
        expect(src.includes(ban), `${f} 仍引用 ${ban}`).toBe(false);
      }
    }
  });
});
