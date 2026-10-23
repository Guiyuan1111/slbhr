/**
 * r43 开始界面独占四图的交还/重取静态防护网。
 *
 * 失效模式全是静默的：纹理在显示列表仍引用时被卸掉 → 该帧取到已销毁的 Texture
 * （canvas 变黑或绘制抛错）；交还后没有重取入口 → 重进 Menu 时 `Texture.get` 落到
 * `__MISSING` 分支，背景/光柱/标题/logo 全缺且只 console.warn；重取 URL 与首装不同 →
 * r37 的 immutable 失效，slow3g 下每次重进多付 ~400ms RTT。所以这里按「交还—重取成对」钉：
 * 四键字面量、Boot 唯一首装点、Menu.preload 重取、SHUTDOWN 交还、清单版本化、其他场景零消费。
 */
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ASSET_VERSIONS } from "../asset-versions";

const ROOT = path.resolve(import.meta.dirname, "..", "..", "..", "..");
const SRC = (p: string) => readFileSync(path.join(ROOT, p), "utf8");
const BOOT = "packages/client/src/scenes/BootScene.ts";
const MENU = "packages/client/src/scenes/MenuScene.ts";
const SCENES_DIR = "packages/client/src/scenes";

/** 四键独立抄一份：避免拿被测量自己当尺子 */
const MENU_ONLY = [
  ["TempleHall", "/assets/images/TempleHallForest.jpg"],
  ["Beam", "/assets/images/Beam.png"],
  ["GameName", "/assets/images/GameNameForest.png"],
  ["KiziLogo", "/assets/images/branding/branding_logo_kizi.png"],
] as const;

/** 剥注释（保持长度与行号，跳过字符串）：注释里的键名不能当成消费点 */
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

describe("r43 键表与内容寻址", () => {
  it("BootScene 声明的四键/四路径与独立清单一致，且全部经 versionedAsset", () => {
    const boot = stripComments(SRC(BOOT));
    const decl = boot.match(/export const MENU_ONLY_IMAGES[^=]*=\s*\[([\s\S]*?)\n\];/);
    expect(decl, "MENU_ONLY_IMAGES 声明找不到").not.toBeNull();
    const rows = [...decl![1].matchAll(/\["([^"]+)",\s*versionedAsset\("([^"]+)"\)\]/g)].map((x) => [x[1], x[2]]);
    expect(rows).toEqual(MENU_ONLY.map(([k, p]) => [k, p]));
    // 少一条 versionedAsset 都会让重取 URL 与首装漂移 → immutable 失效
    expect(decl![1].match(/versionedAsset\(/g)?.length).toBe(4);
    expect(boot).toContain("export const MENU_ONLY_KEYS: readonly string[] = MENU_ONLY_IMAGES.map(([k]) => k);");
  });

  it("四个路径都在 r37 清单里（8 位 sha1），重取能命中 immutable", () => {
    for (const [, p] of MENU_ONLY) {
      expect(ASSET_VERSIONS[p], `${p} 未登记`).toMatch(/^[0-9a-f]{8}$/);
    }
  });

  it("index.html 的 DOM 标题图带同一个 v：冷启动不与 Boot 各下一份", () => {
    const html = SRC("packages/client/index.html");
    const p = "/assets/images/GameNameForest.png";
    expect(html).toContain(`src="${p}?v=${ASSET_VERSIONS[p]}"`);
    // 无 v 的裸 URL 仍在 HTML 里 = 清单同步被绕过
    expect(html).not.toContain(`src="${p}"`);
  });
});

describe("r43 交还—重取成对", () => {
  it("Boot 首装只有一处且走共用清单，没有内联 load.image", () => {
    const pre = bracedBody(BOOT, "preload(): void");
    expect(pre).toContain("loadMenuOnlyImages(this.load)");
    const boot = stripComments(SRC(BOOT));
    for (const [k] of MENU_ONLY) {
      expect(boot.includes(`this.load.image("${k}"`), `Boot 仍内联装载 ${k}`).toBe(false);
    }
  });

  it("Menu.preload 用同一清单重取；首装已存在时跳过", () => {
    const pre = bracedBody(MENU, "preload(): void");
    expect(pre).toContain("loadMenuOnlyImages(this.load)");
    const load = bracedBody(BOOT, "export function loadMenuOnlyImages");
    expect(load).toContain("MENU_ONLY_IMAGES");
    expect(load).toContain("load.scene.textures.exists(key)");
    expect(load).toContain("load.image(key, url)");
  });

  it("Menu SHUTDOWN 交还四键，注册先于任何显示对象创建", () => {
    const create = bracedBody(MENU, "create(): void");
    expect(create).toContain("Phaser.Scenes.Events.SHUTDOWN");
    expect(create).toContain("releaseMenuOnlyImages(this.textures)");
    const reg = create.indexOf("releaseMenuOnlyImages(this.textures)");
    const firstAdd = create.indexOf("this.add.");
    expect(firstAdd, "create 里没有显示对象？").toBeGreaterThan(-1);
    expect(reg, "交还注册必须早于显示对象创建：create 中途抛错会漏交还").toBeLessThan(firstAdd);
    // 入口唯一：交还只允许出现在 Menu 的 SHUTDOWN 上（Boot 里只有声明）
    expect(stripComments(SRC(BOOT)).split("releaseMenuOnlyImages").length - 1).toBe(1);
    expect(stripComments(SRC(MENU)).split("releaseMenuOnlyImages").length - 1).toBe(2); // import + 调用
  });

  it("交还实现：存在卫 + 逐键 remove，不清别人的同前缀键", () => {
    const fn = bracedBody(BOOT, "export function releaseMenuOnlyImages");
    expect(fn).toContain("for (const key of MENU_ONLY_KEYS)");
    expect(fn).toContain("textures.exists(key)");
    expect(fn).toContain("textures.remove(key)");
    expect(fn).not.toContain("removeAll");
  });
});

describe("r43 零消费：四张图只在开始界面", () => {
  it("其余场景/入口不引用四键（Temple/Game/面板/过渡）", () => {
    const files = readdirSync(path.join(ROOT, SCENES_DIR))
      .filter((f) => f.endsWith(".ts") && f !== "BootScene.ts" && f !== "MenuScene.ts")
      .map((f) => `${SCENES_DIR}/${f}`)
      .concat(["packages/client/src/main.ts"]);
    for (const f of files) {
      const src = stripComments(SRC(f));
      for (const [k] of MENU_ONLY) {
        expect(src.includes(`"${k}"`), `${f} 仍引用 ${k}`).toBe(false);
      }
    }
  });
});
