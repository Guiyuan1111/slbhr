/**
 * 角色图集拆分（r22 件2）的静态防护网：两张派生图集的产物语义 + 代码里 ATLAS_CHARS/ATLAS_CHARS_GAME 的用法。
 *
 * 为什么需要它：官方 `CharAssets.png`（714.9KB / 239 帧）被拆成 Menu 张（53 帧，Boot 阻塞批）
 * 与 Game 张（186 帧，延迟批）两个纹理键。这条链最贵的失效模式是**帧与键配错**：
 * Phaser 的 `Texture.get` 遇到缺帧只 console.warn 并返回 `firstFrame`/`__BASE`
 * （Texture.js:246-255），于是那个角色不再画错——它把**整张图集**当成一帧贴上来：
 * 满屏花屏，但冷启动、像素门禁之外的路径一切照常。另一种错方向（Menu 张去画房内帧）
 * 同样静默。两类都只能靠"按调用点分类 + 逐像素回算"的静态断言挡住，与 r18/r19
 * 字体两段化的 FONT_MAIN/FONT_FULL 分类网同一形状。
 *
 * 与生成器 scripts/split-char-atlas.mjs 的关系：本测试**不调用**它的任何装配代码，
 * 期望值全部由「官方 CharAssets.png/json 的字节与坐标」＋「两张产物 json 声明的坐标」独立回算，
 * 生成器自己的断言若有口径错误，这里仍会独立发现。复现性（同输入必同输出）由 `--check` 门禁负责。
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { cropRaw, decodePng } from "../../../../scripts/png-raw.mjs";

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
const game = ATLAS("CharAssetsGame.json");
const namesOf = (a: { frames: { filename: string }[] }) => new Set(a.frames.map((f) => f.filename));
const menuNames = namesOf(menu);
const gameNames = namesOf(game);
const officialNames = namesOf(official);
/** Menu 张的帧集合由两处消费点定义（见头注）；这里独立重算一份，与产物对照 */
const seq = (prefix: string, start: number, end: number) =>
  Array.from({ length: end - start + 1 }, (_, i) => `${prefix}${String(start + i).padStart(4, "0")}`);
const EXPECTED_MENU = ["fire", "water"].flatMap((r) => [
  `${r}_glow0000`,
  `${r}_legs_idle0000`,
  ...seq(`${r}_head_idle`, 0, r === "fire" ? 18 : 29),
]);

const SCENES = [
  "packages/client/src/scenes/BootScene.ts",
  "packages/client/src/scenes/MenuScene.ts",
  "packages/client/src/scenes/GameScene.ts",
];
/** 动画键全集（拆前后都必须一模一样，拆的只是"在哪个图集取帧"） */
const ANIM_KEYS = [...["fire", "water"].flatMap((r) => [`${r}_idle`, `${r}_legs_idle`, `${r}_legs_run`, `${r}_jump`, `${r}_fall`, `${r}_rising`, `${r}_stairs`]), "smoke"];
/** 只服务开始界面的两式（其余 13 式随 Game 张注册） */
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

describe("角色图集拆分产物语义（r22 件2）", () => {
  it("切分唯一且完备：两张不相交、并集恰等于官方 239 帧", () => {
    expect(menuNames.size).toBe(53);
    expect(gameNames.size).toBe(186);
    expect([...menuNames].filter((n) => gameNames.has(n))).toEqual([]);
    expect([...menuNames].filter((n) => !officialNames.has(n))).toEqual([]);
    expect([...gameNames].filter((n) => !officialNames.has(n))).toEqual([]);
    expect(menuNames.size + gameNames.size).toBe(officialNames.size);
    expect([...menuNames].sort()).toEqual([...EXPECTED_MENU].sort()); // 与消费点重算一致
  });

  it("几何等价：每帧 w/h 与 sourceSize 照抄官方，meta.image 各指自己那张", () => {
    const byName = new Map<string, any>(official.frames.map((f: any) => [f.filename, f] as [string, any]));
    for (const a of [menu, game]) {
      expect(a.meta.image).toBe(`${a === menu ? "CharAssetsMenu" : "CharAssetsGame"}.png`);
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
    for (const a of [menu, game]) {
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
    for (const a of [menu, game]) {
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

  it("拆两张确实比整张便宜（这是拆而非加的立论，素材换版变大就该看见）", () => {
    const kb = (f: string) => readFileSync(path.join(ROOT, `assets/atlasses/${f}`)).length / 1024;
    const whole = kb("CharAssets.png");
    expect(kb("CharAssetsMenu.png")).toBeLessThan(whole / 2);
    expect(kb("CharAssetsMenu.png") + kb("CharAssetsGame.png")).toBeLessThan(whole);
    // 解码驻留同向：两张画布像素之和不超过原 2048² 画布
    const px = (a: { meta: { size: { w: number; h: number } } }) => a.meta.size.w * a.meta.size.h;
    expect(px(menu) + px(game)).toBeLessThanOrEqual(px(official));
  });
});

describe("r22 件2 拆分：调用点分类", () => {
  it("Boot 阻塞批只装 Menu 张对，Game 张只在延迟通道里声明一次", () => {
    const boot = SRC("packages/client/src/scenes/BootScene.ts");
    expect(boot.includes('this.load.atlas(ATLAS_CHARS, "/assets/atlasses/CharAssetsMenu.png", "/assets/atlasses/CharAssetsMenu.json")')).toBe(true);
    expect(boot.includes('load.atlas(ATLAS_CHARS_GAME, "/assets/atlasses/CharAssetsGame.png", "/assets/atlasses/CharAssetsGame.json")')).toBe(true);
    const preload = boot.slice(boot.indexOf("preload(): void"), boot.indexOf("create(): void"));
    expect(preload.includes("CharAssetsGame")).toBe(false); // 阻塞批不再碰 Game 张
    expect(preload.includes("CharAssetsMenu")).toBe(true);
  });

  it("官方整张 CharAssets.png/json 在场景源码里不再被引用（绕过拆分=第二下载源）", () => {
    for (const f of SCENES) {
      expect(stripComments(SRC(f)).match(/CharAssets\.(png|json)/g), `${f} 仍引用官方整张`).toEqual(null);
    }
  });

  it("画的每一帧都落在自己那张里：ATLAS_CHARS 站点全在 Menu 张，ATLAS_CHARS_GAME 站点全在 Game 张", () => {
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
    expect(draws("ATLAS_CHARS_GAME", gameNames)).toBe(3); // 钻石 / 楼梯 / 烟雾
  });

  it("动画键拆分：Menu 组只留两式（四键）取 Menu 张帧，Game 组补齐其余十一式取 Game 张帧", () => {
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
    const g = anims("ATLAS_CHARS_GAME");
    expect(m.keys).toEqual([...MENU_ANIM_KEYS].sort());
    expect(g.keys).toEqual(ANIM_KEYS.filter((k) => !MENU_ANIM_KEYS.includes(k)).sort());
    for (const n of m.frames) expect(menuNames.has(n), `Menu 动画帧 ${n} 不在 Menu 张`).toBe(true);
    for (const n of g.frames) expect(gameNames.has(n), `Game 动画帧 ${n} 不在 Game 张`).toBe(true);
    // 拆前拆后键集相同（少一式就是"进房后某个状态定格"的静默表现回归）
    expect([...m.keys, ...g.keys].sort()).toEqual([...ANIM_KEYS].sort());
  });

  it("Game 组动画随房内装载序注册（与 buildGameAnims 同处，早一帧都没有）", () => {
    const game = stripComments(SRC("packages/client/src/scenes/GameScene.ts"));
    const create = game.slice(game.indexOf("create(): void"));
    expect(create.includes("buildCharAnims(this.anims)")).toBe(true);
    expect(create.indexOf("buildCharAnims(this.anims)")).toBeLessThan(create.indexOf("setupCameraManager(level)")); // 角色在 create 后段才建
    const boot = stripComments(SRC("packages/client/src/scenes/BootScene.ts"));
    expect(boot.includes("export function buildCharAnims")).toBe(true);
    expect(boot.includes("buildCharAnims(this.anims)")).toBe(false); // Boot 侧只注册菜单两式
  });
});
