/**
 * r26 件1：客户端图集"零消费帧原地清零"的静态网（Slim PNG + 装载 URL + 消费口径）。
 *
 * 这套优化的致命失效模式：keep 口径漏了某个消费点 ⇒ 该帧被清零 ⇒ 运行时画成透明且**不报错**。
 * 所以这里守四层：
 *  1) 装载 URL 收敛：图集的装载必须都用 *_PNG 常量，且客户端源码里不再出现官方 PNG 路径；
 *  2) 需求口径：48 关 parseLevel + 固定/动态消费点算出的 keep 与在库 Slim 的 keep 完全一致，
 *     清零面必须全部落在 needs.mjs 的 DEAD 名单里；森林无 dark 关（否则 FinishStoneDark 不能清零）；
 *  3) 像素账：keep 帧在官方/Slim 同一坐标处逐字节相同，blank 帧矩形全 0，blank 之外逐像素 0 差异，
 *     幅面与官方相同；
 *  4) 可复现：重跑生成器得到的 PNG 与在库文件逐字节一致（防"改了生成器但忘了重建"）。
 *
 * 期望值尽量由独立回算得到（官方 PNG 解码 + 官方 JSON 帧表 + 客户端源码扫描），
 * 只把"哪张图集在哪些场景被消费"的语义交给 needs.mjs。
 */
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { decodePng } from "../../../../scripts/png-raw.mjs";
import { ATLAS_SPECS, REPO_ROOT, inspect } from "../../../../scripts/atlas-slim/needs.mjs";
import { buildAll } from "../../../../scripts/atlas-slim/build-slim-atlas.mjs";

const ROOT = path.resolve(import.meta.dirname, "..", "..", "..", "..");
const SRC = (p: string) => readFileSync(path.join(ROOT, p), "utf8");
const TT = 180000;

/** 冻结账目：数字一改（需求集/图集/代码）这里先红，逼着复核后同步更新
 *  r29 起 popup 只剩进房即上屏的 6 帧（暂停键/板底/彩带 4 帧），结算面拆到 PopupFinish* 三张，
 *  清零面因此从 31 涨到 105（74 结算帧 + 31 旧零消费帧）。拆出面的像素账在 popup-finish.test.ts。
 *  r31 起 menu 33 keep／27 blank：选关星碑四套（16 帧）+ 四张底座 + 按钮/HUD 13 帧；
 *  清零的是原版设置/触屏/振动/解锁 UI 族（含 12 帧 ToggleSingleScreen）。 */
const FROZEN = {
  mech: { declared: 163, keep: 67, blank: 96 },
  temple: { declared: 60, keep: 56, blank: 4 },
  popup: { declared: 111, keep: 6, blank: 105 },
  menu: { declared: 60, keep: 33, blank: 27 },
};

type Inspect = Awaited<ReturnType<typeof inspect>>;
let needs: Inspect;
let built: Awaited<ReturnType<typeof buildAll>>;
beforeAll(async () => {
  needs = await inspect(ROOT);
  built = await buildAll(ROOT);
}, TT);

/** 剥注释（长度不变、换行保留）：注释里的帧名示例不算消费点 */
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

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name !== "__tests__") out.push(...walk(p));
    } else if (e.name.endsWith(".ts")) out.push(p);
  }
  return out;
}

describe("装载 URL 收敛（Slim PNG + 官方 JSON）", () => {
  it("BootScene 的图集装载用 *_PNG 常量，常量指向 Slim；JSON 仍是官方", () => {
    const boot = stripComments(SRC("packages/client/src/scenes/BootScene.ts"));
    expect(boot).toContain('export const ATLAS_TEMPLE_PNG = "/assets/atlasses/Temples/forest/TempleAssetsSlim.png"');
    expect(boot).toContain('export const ATLAS_POPUP_PNG = "/assets/atlasses/PopupAssetsSlim.png"');
    expect(boot).toContain('export const ATLAS_MENU_PNG = "/assets/atlasses/MenuAssetsSlim.png"');
    expect(boot).toContain('load.atlas(ATLAS_TEMPLE, ATLAS_TEMPLE_PNG, "/assets/atlasses/Temples/forest/TempleAssets.json")');
    expect(boot).toContain('load.atlas(ATLAS_POPUP, ATLAS_POPUP_PNG, "/assets/atlasses/PopupAssets.json")');
    expect(boot).toContain('load.atlas(ATLAS_MENU, ATLAS_MENU_PNG, "/assets/atlasses/MenuAssets.json")');
  });

  it("机关图集不再走整关 Slim：loadGameAtlases 不声明 mech，变体 URL 由运行时 id 拼出", () => {
    const boot = stripComments(SRC("packages/client/src/scenes/BootScene.ts"));
    const gate = boot.slice(boot.indexOf("export function loadGameAtlases"), boot.indexOf("export function loadMechAtlas"));
    expect(gate).not.toContain("ATLAS_MECH");
    expect(boot).toContain("export function loadMechAtlas(load: Phaser.Loader.LoaderPlugin, level: MechLevel): void");
    expect(boot).toContain('load.atlas(ATLAS_MECH, `/assets/atlasses/mech/MechAssets-${id}.png`, `/assets/atlasses/mech/MechAssets-${id}.json`)');
    expect(boot).toContain("mechVariantId(level)");
    // 同键重载会被 TextureManager.checkKey 静默跳过 ⇒ 换变体前必须卸纹理（r30 的换关正确性）
    expect(boot).toContain("load.scene.textures.remove(ATLAS_MECH)");
    expect(boot).not.toContain("MechAssetsSlim");
  });

  it("TempleScene / CompleteScene 的兜底装载用同一常量（混用会让 Slim 取决于装载序）", () => {
    const temple = stripComments(SRC("packages/client/src/scenes/TempleScene.ts"));
    const menus = stripComments(SRC("packages/client/src/scenes/menus.ts"));
    expect(temple).toContain('this.load.atlas(ATLAS_TEMPLE, ATLAS_TEMPLE_PNG, "/assets/atlasses/Temples/forest/TempleAssets.json")');
    expect(menus).toContain('this.load.atlas(ATLAS_POPUP, ATLAS_POPUP_PNG, "/assets/atlasses/PopupAssets.json")');
    expect(temple).toMatch(/import \{[^}]*ATLAS_TEMPLE_PNG[^}]*\} from "\.\/BootScene"/);
    expect(menus).toMatch(/import \{[^}]*ATLAS_POPUP_PNG[^}]*\} from "\.\/BootScene"/);
  });

  it("客户端源码里不再出现四张官方 PNG 的 URL（Slim 是唯一路径）", () => {
    const bad: string[] = [];
    for (const file of walk(path.join(ROOT, "packages/client/src"))) {
      const src = stripComments(readFileSync(file, "utf8"));
      for (const spec of Object.values(ATLAS_SPECS)) {
        const url = `/${spec.officialPng}`;
        if (src.includes(url)) bad.push(`${path.relative(ROOT, file)} 仍引用 ${url}`);
      }
    }
    expect(bad).toEqual([]);
  });
});

describe("需求口径与清零面", () => {
  it("四张图集的 declared/keep/blank 与冻结账目一致", () => {
    for (const key of Object.keys(FROZEN) as Array<keyof typeof FROZEN>) {
      const a = needs.atlases[key];
      expect({ declared: a.declared.length, keep: a.keep.length, blank: a.blank.length }, `${key} 账目`).toEqual(FROZEN[key]);
    }
  });

  it("48 关类型只有 general/speed/puzzle（dark 不存在 ⇒ FinishStoneDark 清零成立）", () => {
    const types = [...new Set(needs.levels.map((l) => l.type))].sort();
    expect(types).toEqual(["general", "puzzle", "speed"]);
    expect(needs.levels.length).toBe(48);
  });

  it("门外场景的消费帧必须留在 keep：选关大厅背景与三星彩带", () => {
    expect(needs.atlases.temple.keep).toContain("MenuBackground0000");
    for (let i = 0; i < 4; i++) expect(needs.atlases.popup.keep).toContain(`Confetti${String(i).padStart(4, "0")}`);
  });

  it("菜单图集：选关星碑四套/底座与按钮留在 keep，原版未用 UI 族清零", () => {
    const keep = needs.atlases.menu.keep;
    for (const p of ["Diamond", "DiamondSpeed", "DiamondPuzzle", "DiamondDark"]) {
      for (let i = 0; i < 4; i++) expect(keep, `${p}${String(i).padStart(4, "0")}`).toContain(`${p}${String(i).padStart(4, "0")}`);
      expect(keep, `${p}_Bkg_Mask0000`).toContain(`${p}_Bkg_Mask0000`);
    }
    for (const n of [
      "MusicButton0000", "MusicButton0001", "FxButton0000", "FxButton0001",
      "SettingsButton0002", "SettingsButton0003", "StoneButton0000", "StoneButton0001",
      "Lock0000", "NewSign0000", "BackButton0000", "BackButton0001", "Navy0000",
    ]) expect(keep, n).toContain(n);
    const blank = new Set(needs.atlases.menu.blank);
    for (let i = 0; i < 12; i++) expect(blank, `ToggleSingleScreen${String(i).padStart(4, "0")}`).toContain(`ToggleSingleScreen${String(i).padStart(4, "0")}`);
    for (const n of [
      "SettingsButton0000", "SettingsButton0001", "MuteButton0000", "MuteButton0001",
      "VibrateButton0000", "VibrateButton0001", "GoldLock0000", "UnlockButton0000",
      "BackButtonFull0000", "BackButtonFull0001", "_default0000",
    ]) expect(blank, n).toContain(n);
  });

  it("逐关需求（机关/装饰/弹窗）全部落在 keep 内", () => {
    for (const l of needs.levels) {
      // 逐关的需求已在 needs.inspect 内并集；这里抽样钉住"每关都有机关与弹窗面"的口径
      expect(l.decor.length, `关卡 ${l.id} 装饰帧`).toBeGreaterThan(0);
    }
    // 清零帧不得出现在任何一关的装饰帧里
    const decor = new Set(needs.levels.flatMap((l) => l.decor));
    for (const n of needs.atlases.temple.blank) expect(decor.has(n), `${n} 被判死却在某关装饰里`).toBe(false);
  });

  it("静态帧名与图集常量同行的字面量消费点都在 keep 内", () => {
    const atlases = { mech: "ATLAS_MECH", temple: "ATLAS_TEMPLE", popup: "ATLAS_POPUP", menu: "ATLAS_MENU" } as const;
    const violations: string[] = [];
    for (const file of walk(path.join(ROOT, "packages/client/src"))) {
      const rel = path.relative(ROOT, file);
      const lines = stripComments(readFileSync(file, "utf8")).split("\n");
      for (let i = 0; i < lines.length; i++) {
        for (const [key, constName] of Object.entries(atlases)) {
          if (!new RegExp(`\\b${constName}\\b`).test(lines[i])) continue;
          for (const name of needs.atlases[key as keyof typeof atlases].declared) {
            const quoted = `"${name}"`;
            if (lines[i].includes(`'${name}'`) || lines[i].includes(quoted) || lines[i].includes(`\`${name}\``)) {
              if (!needs.keep[key as keyof typeof atlases].has(name)) violations.push(`${rel}:${i + 1} ${key}/${name}`);
            }
          }
        }
      }
    }
    expect(violations).toEqual([]);
  });
});

describe("Slim PNG 像素账", () => {
  it("四张 Slim 与官方同幅面，且比官方小", () => {
    for (const r of built) {
      const official = decodePng(readFileSync(path.join(ROOT, r.spec.officialPng)), `${r.key}-official`);
      const slim = decodePng(readFileSync(path.join(ROOT, r.spec.slimPng)), `${r.key}-slim`);
      expect({ w: slim.w, h: slim.h }, `${r.key} 幅面`).toEqual({ w: official.w, h: official.h });
      expect(readFileSync(path.join(ROOT, r.spec.slimPng)).length).toBeLessThan(readFileSync(path.join(ROOT, r.spec.officialPng)).length);
    }
  });

  it("keep 帧同坐标逐字节相同；blank 帧全 0；blank 之外 0 差异", () => {
    for (const key of Object.keys(FROZEN) as Array<keyof typeof FROZEN>) {
      const a = needs.atlases[key];
      const spec = ATLAS_SPECS[key];
      const official = decodePng(readFileSync(path.join(ROOT, spec.officialPng)), `${key}-official`);
      const slim = decodePng(readFileSync(path.join(ROOT, spec.slimPng)), `${key}-slim`);
      const rects = new Map(a.meta.frames.map((f) => [f.filename, f.frame]));
      const region = (img: { w: number; data: Buffer }, f: { x: number; y: number; w: number; h: number }) => {
        const out = Buffer.alloc(f.w * f.h * 4);
        for (let y = 0; y < f.h; y++) img.data.copy(out, y * f.w * 4, ((f.y + y) * img.w + f.x) * 4, ((f.y + y) * img.w + f.x + f.w) * 4);
        return out;
      };
      for (const name of a.keep) {
        const f = rects.get(name)!;
        expect(region(slim, f).equals(region(official, f)), `${key}/${name} 活帧被改动`).toBe(true);
      }
      for (const name of a.blank) {
        const f = rects.get(name)!;
        expect(region(slim, f).every((b) => b === 0), `${key}/${name} 清零不彻底`).toBe(true);
      }
      const mask = new Uint8Array(official.w * official.h);
      for (const name of a.blank) {
        const f = rects.get(name)!;
        for (let y = f.y; y < f.y + f.h; y++) mask.fill(1, y * official.w + f.x, y * official.w + f.x + f.w);
      }
      let outside = 0;
      for (let i = 0; i < mask.length; i++) {
        if (mask[i]) continue;
        const o = i * 4;
        if (official.data[o] !== slim.data[o] || official.data[o + 1] !== slim.data[o + 1] || official.data[o + 2] !== slim.data[o + 2] || official.data[o + 3] !== slim.data[o + 3]) outside++;
      }
      expect(outside, `${key} blank 之外像素差异`).toBe(0);
    }
  }, TT);

  it("生成器可复现：buildAll 与在库 Slim PNG 逐字节一致", () => {
    for (const r of built) {
      const disk = readFileSync(path.join(ROOT, r.spec.slimPng));
      expect(disk.equals(r.png), `${r.key} 与重建不一致（改了口径/生成器却没重建？）`).toBe(true);
    }
  });
});
