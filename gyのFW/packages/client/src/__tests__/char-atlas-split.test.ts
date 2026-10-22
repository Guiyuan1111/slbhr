/**
 * 角色图集拆分（r22 件2 两张 → r23 件1 三张）的静态防护网：三张派生图集的产物语义
 * + 代码里 ATLAS_CHARS / ATLAS_CHARS_ENTRY / ATLAS_CHARS_PLAY 的用法。
 *
 * 为什么需要它：官方 `CharAssets.png`（714.9KB / 239 帧）被切成 Menu 张（53 帧，Boot 阻塞批）、
 * Entry 张（7 帧，随 loadGameAtlases 进落定门）、Play 张（182 帧，房间可玩之后才取）三个纹理键。
 * 这条链最贵的失效模式是**帧与键配错**：Phaser 的 `Texture.get` 遇到缺帧只 console.warn 并返回
 * `firstFrame`/`__BASE`（Texture.js:246-255），于是那个角色不再画错——它把**整张图集**当成一帧贴上来：
 * 满屏花屏，但冷启动、像素门禁之外的路径一切照常。r23 新增的失效模式是同一条的**时间版**：
 * 动画注册（`anims.create → Animation.getFrames`，Animation.js:454 当场解析帧名）如果跑在 Play 张
 * 落地之前，那 11 式的 163 个帧名就各自绑上一个 `__BASE`，而 `buildSeq` 的 exists 幂等卫禁止之后重建——
 * 错帧会一路带着播。所以除了"帧属于哪张"，本测试还钉"注册点必须经 ensureCharAnims 走"。
 * 三类都只能靠"按调用点分类 + 逐像素回算"的静态断言挡住，与 r18/r19 字体两段化的
 * FONT_MAIN/FONT_FULL 分类网同一形状。
 *
 * 另一件只有拆三张才出现的事：Entry 与 Play **故意相交**（三个既是构造首帧又是动画第 0 帧的
 * `0000`）。它是本轮的代价而不是 bug，所以这里把它钉成"恰等于白名单"——多一个交点就是漏算，
 * 少一个交点就是某张缺第 0 帧（注册时照样落 `__BASE`）。
 *
 * 与生成器 scripts/split-char-atlas.mjs 的关系：本测试**不调用**它的任何装配代码，
 * 期望值全部由「官方 CharAssets.png/json 的字节与坐标」＋「三张产物 json 声明的坐标」独立回算，
 * 生成器自己的断言若有口径错误，这里仍会独立发现。复现性（同输入必同输出）由 `--check` 门禁负责。
 *
 * 末尾那个 r25 describe 装的是**音频分批**的同类网（门里/门后/兜底三处名单）。放这里不是顺手：
 * 音频的失效模式与错帧同形——`GameScene.sfx` 首行按 `cache.audio.exists` 静默跳过，
 * 缺键不抛不警告，冷启动/像素/回归三条门禁全都读不出"死亡没声"，只有按调用点分类才挡得住。
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { cropRaw, decodePng } from "../../../../scripts/png-raw.mjs";
import { AUDIO_SFX, bgmFinishOf, bgmLoopOf, bgmPackOf, bgmTerminalOf } from "../audio";

const ROOT = path.resolve(import.meta.dirname, "..", "..", "..", "..");
const SRC = (p: string) => readFileSync(path.join(ROOT, p), "utf8");
const ATLAS = (f: string) => JSON.parse(readFileSync(path.join(ROOT, `assets/atlasses/${f}`), "utf8"));
/** 整张 2048² 解码要 16MB 且耗时秒级，逐帧回算/环带/裁片三处都要用：解一次存着 */
const pngCache = new Map<string, ReturnType<typeof decodePng>>();
const img = (f: string) => {
  let v = pngCache.get(f);
  if (!v) {
    v = decodePng(readFileSync(path.join(ROOT, `assets/atlasses/${f}`)), f);
    pngCache.set(f, v);
  }
  return v;
};

const official = ATLAS("CharAssets.json");
const menu = ATLAS("CharAssetsMenu.json");
const entry = ATLAS("CharAssetsEntry.json");
const play = ATLAS("CharAssetsPlay.json");
const SHEETS = [menu, entry, play];
const namesOf = (a: { frames: { filename: string }[] }) => new Set(a.frames.map((f) => f.filename));
const menuNames = namesOf(menu);
const entryNames = namesOf(entry);
const playNames = namesOf(play);
const officialNames = namesOf(official);
/** Menu 张的帧集合由两处消费点定义（见头注）；这里独立重算一份，与产物对照 */
const seq = (prefix: string, start: number, end: number) =>
  Array.from({ length: end - start + 1 }, (_, i) => `${prefix}${String(start + i).padStart(4, "0")}`);
const EXPECTED_MENU = ["fire", "water"].flatMap((r) => [
  `${r}_glow0000`,
  `${r}_legs_idle0000`,
  ...seq(`${r}_head_idle`, 0, r === "fire" ? 18 : 29),
]);
/** Entry 张的帧集合同样由消费点独立重算：钻石四式（首帧可见，无任何动画引用它）
 *  + 构造即解析的三个 0000 帧（烟雾/双角色楼梯，它们同时也在 Play 张的动画区间里） */
const DIAMONDS = ["diamond_fb0000", "diamond_wg0000", "diamond_silver0000", "diamond_fbwg0000"];
const CONSTRUCTION_SHARED = ["death_smoke0000", "fire_stairs0000", "water_stairs0000"];
const EXPECTED_ENTRY = [...DIAMONDS, ...CONSTRUCTION_SHARED];

const SCENES = [
  "packages/client/src/scenes/BootScene.ts",
  "packages/client/src/scenes/MenuScene.ts",
  "packages/client/src/scenes/GameScene.ts",
];
/** 动画键全集（拆前后都必须一模一样，拆的只是"在哪个图集取帧"） */
const ANIM_KEYS = [...["fire", "water"].flatMap((r) => [`${r}_idle`, `${r}_legs_idle`, `${r}_legs_run`, `${r}_jump`, `${r}_fall`, `${r}_rising`, `${r}_stairs`]), "smoke"];
/** 只服务开始界面的两式（其余十一式随 Play 张注册） */
const MENU_ANIM_KEYS = ["fire_idle", "water_idle", "fire_legs_idle", "water_legs_idle"];
/** 角色标识在源码里有 `role`/`p` 两种模板变量名，取值恒为这两个 */
const ROLES = ["fire", "water"];

/** 剥注释（保持长度与行号，同字体网的做法）：逆向注释里的示例调用不能当成调用点 */
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

/** 从 `(` 起做括号配平，取回实参串并按顶层逗号切分 */
function callArgs(src: string, openParen: number): string[] {
  let depth = 0;
  let i = openParen;
  for (; i < src.length; i++) {
    const c = src[i];
    if (c === "(" || c === "[" || c === "{") depth++;
    else if (c === ")" || c === "]" || c === "}") {
      depth--;
      if (depth === 0) break;
    }
  }
  const raw = src.slice(openParen + 1, i);
  const parts: string[] = [];
  let d = 0;
  let cur = "";
  for (const c of raw) {
    if (c === "(" || c === "[" || c === "{") d++;
    else if (c === ")" || c === "]" || c === "}") d--;
    if (c === "," && d === 0) {
      parts.push(cur.trim());
      cur = "";
    } else cur += c;
  }
  parts.push(cur.trim());
  return parts;
}

const unquote = (s = "") => s.replace(/^[`'"]/, "").replace(/[`'"]$/, "");
const withRole = (s: string, role: string) => s.replace(/\$\{(role|p)\}/g, role);
/** 帧区间实参：整数，或今日 fire/water 的 head_idle 用的 `role === "fire" ? 18 : 29` */
function numExpr(arg = "", role: string): number {
  const t = /^\s*role === "fire" \? (\d+) : (\d+)\s*$/.exec(arg);
  if (t) return Number(role === "fire" ? t[1] : t[2]);
  const n = Number(arg);
  return Number.isInteger(n) ? n : NaN;
}

/** 一个实参里的帧名：字面量取自身，`${role}`/`${p}` 模板按两个角色展开，
 *  `DIAMOND_FRAME[...]` 取那张表的四个值；解析不出来的模板返回空（调用处按"必须非空"钉死） */
function framesOf(arg: string | undefined): string[] {
  if (!arg) return [];
  if (/DIAMOND_FRAME\[/.test(arg)) {
    const tbl = SRC("packages/client/src/scenes/GameScene.ts").match(/const DIAMOND_FRAME[^=]*=\s*\{([\s\S]*?)\n\};/);
    return tbl ? [...tbl[1].matchAll(/:\s*"([^"]+)"/g)].map((m) => m[1]) : [];
  }
  const body = unquote(arg);
  if (!/\$\{/.test(body)) return [body];
  if (!/\$\{(role|p)\}/.test(body)) return [];
  return ROLES.map((r) => withRole(body, r));
}

/** 一个文件里所有"以某纹理键为实参"的调用点：`add.image/sprite(...)`、`seq(...)`、`load.atlas(...)` */
function keySites(file: string, keyConst: string) {
  const src = stripComments(SRC(file));
  const re = new RegExp(`\\b${keyConst}\\b`, "g");
  const out: { line: number; kind: "anim" | "draw" | "load"; keys: string[]; frames: string[]; raw: string }[] = [];
  for (let m = re.exec(src); m !== null; m = re.exec(src)) {
    const open = src.lastIndexOf("(", m.index);
    if (open < 0) continue;
    // head 含那个 `(`：判定"这是哪一类调用"靠的是 `xxx(`，切片不含括号就全都落空
    const head = src.slice(Math.max(0, open - 40), open + 1);
    const parts = callArgs(src, open);
    const at = parts.indexOf(keyConst);
    if (at < 0) continue;
    const line = src.slice(0, m.index).split("\n").length;
    if (/\.sprite\(|\.image\(/.test(head)) {
      out.push({ line, kind: "draw", keys: [], frames: framesOf(parts[at + 1]), raw: parts.slice(at, at + 2).join(",").replace(/\s+/g, " ") });
    } else if (/seq\(/.test(head)) {
      // `seq(键, 图集, 前缀, 起, 止, 帧率, 循环)`：模板里每个角色各算一遍，
      // 起止允许 `role === "fire" ? 18 : 29` 这种实参（今日 fire_idle/water_idle 正是它）
      const keyArg = parts[at - 1] ?? "";
      const prefixArg = parts[at + 1] ?? "";
      const roles = /\$\{(role|p)\}/.test(`${keyArg}${prefixArg}`) ? ROLES : [""];
      const keys: string[] = [];
      const frames: string[] = [];
      for (const role of roles) {
        const sub = (s: string) => unquote(s).replace(/\$\{(role|p)\}/g, role);
        const start = numExpr(parts[at + 2], role);
        const end = numExpr(parts[at + 3], role);
        if (!Number.isInteger(start) || !Number.isInteger(end)) continue;
        keys.push(sub(keyArg));
        frames.push(...seq(sub(prefixArg), start, end));
      }
      out.push({ line, kind: "anim", keys, frames, raw: parts.slice(0, 5).join(",").replace(/\s+/g, " ") });
    } else if (/load\.atlas\(/.test(head)) {
      out.push({ line, kind: "load", keys: [], frames: [], raw: parts.slice(at + 1, at + 3).join(",").replace(/\s+/g, " ") });
    }
  }
  return out;
}

/** 取某个顶层/类内函数的体（从签名起，到下一个同样缩进的 `\n}` 止）：装载序断言按"在哪条批里"分类 */
function body(file: string, sig: string): string {
  const src = stripComments(SRC(file));
  const at = src.indexOf(sig);
  expect(at, `${file} 里找不到 ${sig}`).toBeGreaterThan(-1);
  const end = src.indexOf("\n}", at);
  expect(end, `${sig} 没有闭合`).toBeGreaterThan(at);
  return src.slice(at, end);
}

describe("角色图集拆分产物语义（r22 件2 → r23 件1 三张）", () => {
  it("切分完备且交集受控：并集恰等于官方 239 帧，Entry∩Play 只剩三个故意重复的构造帧", () => {
    expect(menuNames.size).toBe(53);
    expect(entryNames.size).toBe(7);
    expect(playNames.size).toBe(182);
    expect([...menuNames].filter((n) => entryNames.has(n) || playNames.has(n))).toEqual([]);
    expect([...entryNames].filter((n) => playNames.has(n)).sort()).toEqual([...CONSTRUCTION_SHARED].sort());
    expect([...entryNames].sort()).toEqual([...EXPECTED_ENTRY].sort()); // 与消费点重算一致
    for (const set of [menuNames, entryNames, playNames]) {
      expect([...set].filter((n) => !officialNames.has(n))).toEqual([]);
    }
    const union = new Set([...menuNames, ...entryNames, ...playNames]);
    expect(union.size).toBe(officialNames.size); // 53+7+182-3=239：一帧不漏，也不无中生有
    expect([...menuNames, ...playNames].filter((n) => !union.has(n))).toEqual([]);
  });

  it("派生产物只有三张（r22 的两张方案不留文件，官方整张仍在原地供回算）", () => {
    expect(existsSync(path.join(ROOT, "assets/atlasses/CharAssetsGame.png"))).toBe(false);
    expect(existsSync(path.join(ROOT, "assets/atlasses/CharAssetsGame.json"))).toBe(false);
    expect(existsSync(path.join(ROOT, "assets/atlasses/CharAssets.png"))).toBe(true);
  });

  it("几何等价：每帧 w/h 与 sourceSize 照抄官方，meta.image 各指自己那张", () => {
    const imageOf = new Map([[menu, "CharAssetsMenu.png"], [entry, "CharAssetsEntry.png"], [play, "CharAssetsPlay.png"]]);
    const byName = new Map<string, any>(official.frames.map((f: any) => [f.filename, f] as [string, any]));
    for (const a of SHEETS) {
      expect(a.meta.image).toBe(imageOf.get(a));
      expect(a.meta.size.w).toBeGreaterThanOrEqual(a.frames.reduce((m: number, f: any) => Math.max(m, f.frame.x + f.frame.w), 0));
      expect(a.meta.size.h).toBeGreaterThanOrEqual(a.frames.reduce((m: number, f: any) => Math.max(m, f.frame.y + f.frame.h), 0));
      for (const f of a.frames as any[]) {
        const o = byName.get(f.filename);
        expect([f.frame.w, f.frame.h, f.sourceSize.w, f.sourceSize.h, f.trimmed, f.rotated], `${f.filename} 几何被改动`).toEqual([
          o.frame.w, o.frame.h, o.sourceSize.w, o.sourceSize.h, o.trimmed, o.rotated,
        ]);
      }
    }
  });

  it("逐帧像素与官方裁片逐字节相等（独立回算，不看生成器的证明）", () => {
    const src = img("CharAssets.png");
    const byName = new Map<string, any>(official.frames.map((f: any) => [f.filename, f] as [string, any]));
    const bad: string[] = [];
    for (const a of SHEETS) {
      const sheet = img(`${a.meta.image}`);
      for (const f of a.frames as any[]) {
        const o = byName.get(f.filename);
        if (Buffer.compare(cropRaw(sheet, f.frame.x, f.frame.y, f.frame.w, f.frame.h), cropRaw(src, o.frame.x, o.frame.y, o.frame.w, o.frame.h)) !== 0) {
          bad.push(`${a.meta.image}/${f.filename}`);
        }
      }
    }
    expect(bad, "这些帧的像素与官方裁片不一致").toEqual([]);
  }, 180_000);

  it("帧四周 1px 环带全透明：缩放采样核在边界只可能读到透明，与邻帧内容彻底解耦", () => {
    const bad: string[] = [];
    for (const a of SHEETS) {
      const sheet = img(`${a.meta.image}`);
      for (const f of a.frames as any[]) {
        const { x, y, w, h } = f.frame;
        if (!(x - 1 >= 0 && y - 1 >= 0 && x + w + 1 <= sheet.w && y + h + 1 <= sheet.h)) {
          bad.push(`${a.meta.image}/${f.filename} 贴到了画布边（无隔离带）`);
          continue;
        }
        const alpha = (c: number, r: number) => sheet.data[(r * sheet.w + c) * 4 + 3];
        for (let c = x - 1; c <= x + w && bad.at(-1) !== `${a.meta.image}/${f.filename}`; c++) {
          for (const r of [y - 1, y + h]) if (alpha(c, r) !== 0) bad.push(`${a.meta.image}/${f.filename} 上下环带 ${c},${r}`);
        }
        for (let r = y - 1; r <= y + h && bad.at(-1) !== `${a.meta.image}/${f.filename}`; r++) {
          for (const c of [x - 1, x + w]) if (alpha(c, r) !== 0) bad.push(`${a.meta.image}/${f.filename} 左右环带 ${c},${r}`);
        }
      }
    }
    expect(bad, "存在贴边或非透明的隔离像素").toEqual([]);
  }, 180_000);

  it("字节账：三张 png（连 json 一起算）都轻于整张；解码画布的增量被重复帧+隔离带吃掉的份额写死为预算", () => {
    const kb = (f: string) => readFileSync(path.join(ROOT, `assets/atlasses/${f}`)).length / 1024;
    const whole = kb("CharAssets.png");
    const part = ["CharAssetsMenu", "CharAssetsEntry", "CharAssetsPlay"];
    expect(kb("CharAssetsMenu.png")).toBeLessThan(whole / 2);
    expect(part.reduce((s, n) => s + kb(`${n}.png`), 0)).toBeLessThan(whole);
    // 三个 json 也算进去仍然更便宜（json 还额外走 brotli，png 是 identity 直发）
    expect(part.reduce((s, n) => s + kb(`${n}.png`) + kb(`${n}.json`), 0)).toBeLessThan(kb("CharAssets.png") + kb("CharAssets.json"));
    // 反向代价必须可见：三张画布像素之和略高于原 2048²（3 帧重复 + 每帧隔离带），
    // 拆得越多这块浪费越大——素材换版或再切一刀时这条会先响
    const px = (a: { meta: { size: { w: number; h: number } } }) => a.meta.size.w * a.meta.size.h;
    const sum = px(menu) + px(entry) + px(play);
    expect(sum).toBeGreaterThan(px(official));
    expect(sum - px(official)).toBeLessThanOrEqual(Math.round(px(official) * 0.02));
  });
});

describe("r23 件1 拆分：装载批与调用点分类", () => {
  it("三张各自只在自己那条批里声明一次：Boot 阻塞批=Menu 张，落定门=Entry 张，延迟通道=Play 张", () => {
    const boot = "packages/client/src/scenes/BootScene.ts";
    const preload = body(boot, "preload(): void");
    const gate = body(boot, "export function loadGameAtlases");
    const deferred = body(boot, "export function loadCharsPlay");
    expect(preload).toContain('this.load.atlas(ATLAS_CHARS, "/assets/atlasses/CharAssetsMenu.png", "/assets/atlasses/CharAssetsMenu.json")');
    expect(gate).toContain('load.atlas(ATLAS_CHARS_ENTRY, "/assets/atlasses/CharAssetsEntry.png", "/assets/atlasses/CharAssetsEntry.json")');
    expect(deferred).toContain('load.atlas(ATLAS_CHARS_PLAY, "/assets/atlasses/CharAssetsPlay.png", "/assets/atlasses/CharAssetsPlay.json")');
    // 逐条批核对"谁不许出现在这里"：漏一条就是一次回退（阻塞批多字节 / 落定门多 442KB / 双载）
    for (const ban of ["CharAssetsPlay", "CharAssetsEntry", "CharAssetsGame"]) expect(preload.includes(ban), `Boot 阻塞批出现 ${ban}`).toBe(false);
    for (const ban of ["CharAssetsPlay", "CharAssetsGame"]) expect(gate.includes(ban), `落定门出现 ${ban}`).toBe(false);
    for (const ban of ["CharAssetsMenu", "CharAssetsEntry", "CharAssetsGame"]) expect(deferred.includes(ban), `延迟通道出现 ${ban}`).toBe(false);
  });

  it("Play 张在门落定之后、循环曲之前入队；进房路径另有兜底声明且排在循环曲兜底之前", () => {
    const boot = stripComments(SRC("packages/client/src/scenes/BootScene.ts"));
    expect(boot.indexOf("loadCharsPlay(scene.load)")).toBeLessThan(boot.indexOf("scene.time.delayedCall(1500, thenLoop)"));
    // r34 件2：进房在途时门内预热必须让路（与门后房内全量字体抢管道，fast3g 实测 +1.3s），
    // 只剩驻留路径预缓存；进房侧由 GameScene.kickCharsPlay 兜底
    expect(boot).toContain("if (scene.sys.isActive() && !entryPending) {");
    expect(boot).toContain("const entryPending = entryInFlight;");
    expect(boot).toContain("entryInFlight = false;");
    const main = stripComments(SRC("packages/client/src/main.ts"));
    expect(main).toContain("markEntryInFlight();");
    expect(main.indexOf("markEntryInFlight();")).toBeGreaterThan(main.indexOf("async function enterGame"));
    const game = stripComments(SRC("packages/client/src/scenes/GameScene.ts"));
    const kick = body("packages/client/src/scenes/GameScene.ts", "private kickCharsPlay");
    expect(kick).toContain("this.textures.exists(ATLAS_CHARS_PLAY)"); // 已缓存就零请求
    expect(kick).toContain("loadCharsPlay(this.load)");
    expect(game.indexOf("this.kickCharsPlay()")).toBeLessThan(game.indexOf("this.kickBgmLoop()"));
  });

  it("官方整张与 r22 旧键在场景源码里都不再被引用（绕过拆分=第二下载源，留旧名=静音的死引用）", () => {
    for (const f of SCENES) {
      expect(stripComments(SRC(f)).match(/CharAssets\.(png|json)/g), `${f} 仍引用官方整张`).toEqual(null);
      expect(stripComments(SRC(f)).match(/CharAssetsGame|ATLAS_CHARS_GAME/g), `${f} 仍引用 r22 旧键`).toEqual(null);
    }
  });

  it("画的每一帧都落在自己那张里：Menu 张 6 处、Entry 张 3 处，Play 张一处也不许被直接画", () => {
    const draws = (key: string, set: Set<string>) => {
      let sites = 0;
      for (const file of SCENES) {
        for (const site of keySites(file, key)) {
          if (site.kind !== "draw") continue;
          sites++;
          expect(site.frames.length, `${file}:${site.line} 的帧名解析不出来（${site.raw}）`).toBeGreaterThan(0);
          for (const n of site.frames) expect(set.has(n), `${file}:${site.line} 的 ${n} 不在 ${key} 那张`).toBe(true);
        }
      }
      return sites;
    };
    expect(draws("ATLAS_CHARS", menuNames)).toBe(6); // Menu 三处（glow/legs/head）+ 房内同款三处
    expect(draws("ATLAS_CHARS_ENTRY", entryNames)).toBe(3); // 钻石 / 楼梯首帧 / 烟雾首帧
    expect(draws("ATLAS_CHARS_PLAY", playNames)).toBe(0); // 播放序列只经动画键消费
  });

  it("动画键拆分：Menu 组只留两式（四键）取 Menu 张帧，Play 组补齐其余十一式取 Play 张帧", () => {
    const anims = (key: string) => {
      const keys: string[] = [];
      const frames: string[] = [];
      for (const site of keySites("packages/client/src/scenes/BootScene.ts", key)) {
        if (site.kind !== "anim") continue;
        keys.push(...site.keys);
        frames.push(...site.frames);
      }
      return { keys: keys.sort(), frames };
    };
    const m = anims("ATLAS_CHARS");
    const g = anims("ATLAS_CHARS_PLAY");
    expect(m.keys).toEqual([...MENU_ANIM_KEYS].sort());
    expect(g.keys).toEqual(ANIM_KEYS.filter((k) => !MENU_ANIM_KEYS.includes(k)).sort());
    for (const n of m.frames) expect(menuNames.has(n), `Menu 动画帧 ${n} 不在 Menu 张`).toBe(true);
    for (const n of g.frames) expect(playNames.has(n), `Play 动画帧 ${n} 不在 Play 张`).toBe(true);
    // 拆前拆后键集相同（少一式就是"进房后某个状态定格"的静默回归）
    expect([...m.keys, ...g.keys].sort()).toEqual([...ANIM_KEYS].sort());
    // 十一式的第 0 帧里有三个同时也是构造帧：它们必须**同时**在 Play 张（否则注册当场落 __BASE）
    for (const n of CONSTRUCTION_SHARED) expect(playNames.has(n), `${n} 被从 Play 张里挤掉了`).toBe(true);
    expect(g.frames.length).toBe(163); // 2×(8+11+5+5+30)+45，注册期解析的帧名总数即时间窗口的暴露面
  });

  it("注册时机：buildCharAnims 的唯一调用点在 ensureCharAnims 内，场景侧只许调 ensureCharAnims", () => {
    const boot = stripComments(SRC("packages/client/src/scenes/BootScene.ts"));
    const ensure = body("packages/client/src/scenes/BootScene.ts", "export function ensureCharAnims");
    expect(boot.includes("export function buildCharAnims")).toBe(true);
    expect([...boot.matchAll(/buildCharAnims\(/g)].length).toBe(3); // 1 处声明 + ensure 里 2 处（缓存命中/到达回调）
    expect([...ensure.matchAll(/buildCharAnims\(/g)].length).toBe(2);
    expect(ensure).toContain("scene.textures.exists(ATLAS_CHARS_PLAY)"); // 已在缓存就当场注册
    expect(ensure).toContain("Phaser.Loader.Events.FILE_KEY_COMPLETE"); // 还在飞就等 atlasjson
    expect(ensure).toContain("atlasjson-${ATLAS_CHARS_PLAY}");
    expect(ensure.includes("scene.load.off(evt, arrive)")).toBe(true); // 跨场景复用 loader，不摘会回调旧场景
    expect(boot.includes("buildCharAnims(this.anims)")).toBe(false); // Boot 侧只注册菜单两式
    for (const f of ["packages/client/src/scenes/MenuScene.ts", "packages/client/src/scenes/GameScene.ts"]) {
      expect(stripComments(SRC(f)).includes("buildCharAnims("), `${f} 抢跑注册`).toBe(false);
    }
    const game = stripComments(SRC("packages/client/src/scenes/GameScene.ts"));
    const create = game.slice(game.indexOf("create(): void"));
    expect(create).toContain("ensureCharAnims(this");
    expect(create.indexOf("ensureCharAnims(this")).toBeLessThan(create.indexOf("setupCameraManager(level)")); // 角色在 create 后段才建
  });
});

/** 类内方法体（两格缩进闭合）：body() 对类方法会一路取到 class 末尾，"不许出现在这条批里"需要紧口径 */
function methodBody(file: string, sig: string): string {
  const src = stripComments(SRC(file));
  const at = src.indexOf(sig);
  expect(at, `${file} 里找不到 ${sig}`).toBeGreaterThan(-1);
  const end = src.indexOf("\n  }", at);
  expect(end, `${sig} 没有闭合`).toBeGreaterThan(at);
  return src.slice(at, end);
}

describe("r25 件1 音频分批：落定门只等 sfx", () => {
  const BOOT = "packages/client/src/scenes/BootScene.ts";
  const GAME = "packages/client/src/scenes/GameScene.ts";

  it("清单闭包：族两支恰是循环曲＋终局曲（不相交、不缺支），终局批=失败曲＋本族终局曲", () => {
    for (const fam of ["general", "speed"] as const) {
      const loop = bgmLoopOf(fam).map(([k]) => k);
      const fin = bgmFinishOf(fam).map(([k]) => k);
      expect([...loop, ...fin].sort()).toEqual(bgmPackOf(fam).map(([k]) => k).sort());
      expect(new Set([...loop, ...fin]).size).toBe(2); // 相交 = 门后同一条批双载
      expect(bgmTerminalOf(fam).map(([k]) => k)).toEqual(["bgm_over", ...fin]);
    }
    expect(bgmPackOf("general").map(([k]) => k)).toEqual(["bgm_level", "bgm_finish"]);
    expect(bgmPackOf("speed").map(([k]) => k)).toEqual(["bgm_level_speed", "bgm_finish_speed"]);
    expect(AUDIO_SFX.length).toBe(13);
  });

  it("门内只剩 sfx 一条音频批；循环曲与三支终局时刻曲同在门后 thenLoop 批", () => {
    const gate = body(BOOT, "export function startBgWarm");
    const calls = [...gate.matchAll(/loadAudioPack\((.*?)\)\s*;/g)].map((m) => m[1].replace(/\s+/g, ""));
    expect(calls.sort()).toEqual([
      "scene,AUDIO_MENU",
      "scene,AUDIO_SFX",
      "scene,bgmLoopOf(warmBgmFamily)",
      "scene,bgmTerminalOf(warmBgmFamily)",
    ]);
    for (const ban of ["AUDIO_BGM_OVER", "bgmFinishOf"]) expect(gate.includes(ban), `落定门出现 ${ban}`).toBe(false);
    const at = gate.indexOf("const thenLoop");
    const thenLoop = gate.slice(at, gate.indexOf("};", at));
    for (const want of ["bgmLoopOf(warmBgmFamily)", "bgmTerminalOf(warmBgmFamily)"]) expect(thenLoop).toContain(want);
    expect(thenLoop).toContain("scene.sys.isActive()"); // Menu 被切走就作废，交给 Game 侧兜底
  });

  it("GameScene 兜底声明：preload 只补 sfx，三条 kick 按 画面 > 循环曲 > 终局曲 排队", () => {
    const preload = methodBody(GAME, "preload(): void");
    expect(preload).toContain("loadAudioPack(this, AUDIO_SFX)");
    for (const ban of ["AUDIO_BGM_OVER", "bgmFinishOf", "bgmTerminalOf", "bgmLoopOf"]) {
      expect(preload.includes(ban), `进房阻塞批出现 ${ban}`).toBe(false);
    }
    const game = stripComments(SRC(GAME));
    expect(game.indexOf("this.kickCharsPlay()")).toBeLessThan(game.indexOf("this.kickBgmLoop()"));
    expect(game.indexOf("this.kickBgmLoop()")).toBeLessThan(game.indexOf("this.kickBgmTerminal()"));
  });

  it("终局曲补起钉死在三道卫上；失败曲不补（时刻绑定的一次性音，晚放会把重生盖成失败音）", () => {
    const kick = methodBody(GAME, "private kickBgmTerminal");
    expect(kick).toContain('this.cache.audio.exists("bgm_over")');
    expect(kick).toContain("loadAudioPack(this, bgmTerminalOf(bgmFamilyOf(this.templeType)))");
    expect(kick).toContain("if (!this.stairsPlayed) return;");
    expect(kick).toContain('!== "won"');
    expect(kick).toContain("this.sound.isPlaying(fin)");
    expect([...kick.matchAll(/this\.sfx\(/g)].length).toBe(1);
    expect(kick).not.toContain('this.sfx("bgm_over")');
    expect(kick).toContain('this.load.off("complete", catchUpFinish)'); // 监听随 SHUTDOWN 摘除，否则每次 create 累积一个
  });

  it("出门批的字节面额：general 323.3KB／speed 228.5KB（素材换版时这条先响，报告口径要重算）", () => {
    const kb = (f: string) => readFileSync(path.join(ROOT, "packages/client/public/assets/audio", f)).length / 1024;
    const over = kb("LevelMusicOver.mp3");
    expect(over + kb("LevelMusicFinish.mp3")).toBeCloseTo(323.3, 1);
    expect(over + kb("LevelMusicFinish_speed.mp3")).toBeCloseTo(228.5, 1);
  });
});
