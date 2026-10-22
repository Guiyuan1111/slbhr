/**
 * r29 结算板图集拆张的静态防护网：主弹窗 Slim 只剩 6 帧（暂停键/板底/彩带），结算面板的
 * 星碑（每类型 22 帧）与图标/箭头（8 帧）拆成三张按关类型的 `PopupFinish*` 图集。
 *
 * 为什么需要它：这套拆法的失效模式有两种，且都**不报错**——
 *  1) 时间版（与 r23 chars-play 同形）：星碑动画在该张落地之前注册，`anims.create` 当场解析
 *     帧名（Animation.js:454），Play 帧名会各自绑上 `__BASE`，满屏花屏；所以注册点必须只在
 *     EndMenu.create（preload 已保证纹理到位），且 buildFinishAnims 自带纹理存在守卫。
 *  2) 空间版（与 r26 keep 口径同形）：主图集清零面漏算/多算了帧，结算板画成透明，冷启动、
 *     像素门禁之外的路径一切照常。
 * 期望值全部独立回算：官方 PopupAssets.png/json 的字节与坐标 + 消费点源码扫描；
 * needs.mjs 的集合只作为被核对对象，不参与期望值构造。
 *
 * 与生成器 scripts/split-popup-finish.mjs 的关系：本测试不调用其装配代码；复现性由该脚本的
 * `--check` 门禁负责（重建到 TEMP 后与在库六件产物比字节）。
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { cropRaw, decodePng } from "../../../../scripts/png-raw.mjs";
import { ATLAS_SPECS, inspect, popupFinishNeed } from "../../../../scripts/atlas-slim/needs.mjs";

const ROOT = path.resolve(import.meta.dirname, "..", "..", "..", "..");
const SRC = (p: string) => readFileSync(path.join(ROOT, p), "utf8");
const TT = 180_000;
const BOOT = "packages/client/src/scenes/BootScene.ts";
const GAME = "packages/client/src/scenes/GameScene.ts";
const OVERLAYS = "packages/client/src/scenes/overlays.ts";

const pad4 = (n: number) => String(n).padStart(4, "0");
const seq = (prefix: string, start: number, end: number) =>
  Array.from({ length: end - start + 1 }, (_, i) => `${prefix}${pad4(start + i)}`);

/** 进房即上屏的主图集面：HUD 暂停键、结算板底、选关大厅三星彩带 */
const EXPECTED_EARLY = ["PauseButton0000", "PopupBackground0000", ...seq("Confetti", 0, 3)];
/** 结算板的图标与箭头：勾叉/成就行图标 + 指向星碑的两帧箭头；钻石/计时只在三行布局画 */
const ICONS_COMMON = ["FinishIcon0000", "TickIcon0000", "CrossIcon0000", "popupArrow0000", "popupArrow0001"];
const ICONS_SCORED = [...ICONS_COMMON, "DiamondsIcon0000", "TimeIcon0000"];
/** puzzle 是两行布局：钻石行隐藏、银钻替代计时 ⇒ 不画 Diamonds/Time */
const ICONS_PUZZLE = [...ICONS_COMMON, "SilverIcon0000"];
/** 三张结算图集的期望帧集合（星碑 0000 构造帧 + 1..21 三段动画 + 本类型实际绘制的图标） */
const EXPECT_FINISH: Record<string, string[]> = {
  general: [...seq("FinishStone", 0, 21), ...ICONS_SCORED],
  speed: [...seq("FinishStoneSpeed", 0, 21), ...ICONS_SCORED],
  puzzle: [...seq("FinishStonePuzzle", 0, 21), ...ICONS_PUZZLE],
};
const PRODUCTS = [
  { type: "general", base: "PopupFinishGeneral" },
  { type: "speed", base: "PopupFinishSpeed" },
  { type: "puzzle", base: "PopupFinishPuzzle" },
];
/** 森林 48 关不存在的第四套星碑与九张旧零消费帧：拆张后仍必须留在清零面 */
const EXPECTED_DEAD = [
  ...seq("FinishStoneDark", 0, 21),
  "Clock0000",
  "CursorToggle0000",
  "DeviceItemRenderer0000",
  "FingerRingJump0000",
  "FingerRingLeft0000",
  "FingerRingRight0000",
  "MuteButton0000",
  "MuteButton0001",
  "_default0000",
];

const official = JSON.parse(readFileSync(path.join(ROOT, ATLAS_SPECS.popup.json), "utf8"));
const officialNames = official.frames.map((f: { filename: string }) => f.filename);
const officialByName = new Map<string, any>(official.frames.map((f: any) => [f.filename, f] as [string, any]));
const productJson = Object.fromEntries(
  PRODUCTS.map((p) => [p.type, JSON.parse(readFileSync(path.join(ROOT, `assets/atlasses/${p.base}.json`), "utf8"))]),
);
const namesOf = (a: { frames: { filename: string }[] }) => new Set(a.frames.map((f) => f.filename));

/** 整张 2048² 解码 16MB：像素账与环带共用，解一次存着 */
const pngCache = new Map<string, ReturnType<typeof decodePng>>();
const img = (f: string) => {
  let v = pngCache.get(f);
  if (!v) {
    v = decodePng(readFileSync(path.join(ROOT, `assets/atlasses/${f}`)), f);
    pngCache.set(f, v);
  }
  return v;
};

let needs: Awaited<ReturnType<typeof inspect>>;
beforeAll(async () => {
  needs = await inspect(ROOT);
}, TT);

/** 剥注释（长度不变、换行保留）：注释里的示例 URL/帧名不能当成消费点 */
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

/** 顶层函数体：从签名到第一个顶格 `}` */
function body(file: string, sig: string): string {
  const src = stripComments(SRC(file));
  const at = src.indexOf(sig);
  expect(at, `${file} 里找不到 ${sig}`).toBeGreaterThan(-1);
  const end = src.indexOf("\n}", at);
  expect(end, `${sig} 没有闭合`).toBeGreaterThan(at);
  return src.slice(at, end);
}

/** 类内方法体（两格缩进闭合）：body() 会一路取到 class 末尾 */
function methodBody(file: string, sig: string): string {
  const src = stripComments(SRC(file));
  const at = src.indexOf(sig);
  expect(at, `${file} 里找不到 ${sig}`).toBeGreaterThan(-1);
  const end = src.indexOf("\n  }", at);
  expect(end, `${sig} 没有闭合`).toBeGreaterThan(at);
  return src.slice(at, end);
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

describe("r29 切分完备：主图集 6 帧 / 三张结算 74 帧 / 死帧 31 帧", () => {
  it("官方 111 帧被三段恰好覆盖，且三段互斥", () => {
    const finishUnion = new Set(Object.values(EXPECT_FINISH).flat());
    expect(EXPECTED_EARLY.length).toBe(6);
    expect(finishUnion.size).toBe(74);
    expect([...EXPECTED_EARLY].filter((n) => finishUnion.has(n))).toEqual([]);
    const dead = officialNames.filter((n: string) => !EXPECTED_EARLY.includes(n) && !finishUnion.has(n));
    expect(dead.length).toBe(31);
    expect([...dead].sort()).toEqual([...EXPECTED_DEAD].sort());
    expect(EXPECTED_EARLY.length + finishUnion.size + dead.length).toBe(officialNames.length);
    // 每个期望帧都在官方图集里（防独立回算写出不存在的名字）
    for (const n of [...EXPECTED_EARLY, ...finishUnion, ...EXPECTED_DEAD]) expect(officialByName.has(n), `${n} 不在官方图集`).toBe(true);
  });

  it("三张产物声明的帧恰等于按类型回算的集合（多一帧=白背字节，少一帧=开板透明）", () => {
    for (const p of PRODUCTS) {
      expect([...namesOf(productJson[p.type])].sort(), p.base).toEqual([...EXPECT_FINISH[p.type]].sort());
    }
    // 星碑不跨张：三张之间只允许共用图标/箭头
    const sets = PRODUCTS.map((p) => namesOf(productJson[p.type]));
    const pairs = [[0, 1], [0, 2], [1, 2]];
    for (const [i, j] of pairs) {
      const shared = [...sets[i]].filter((n) => sets[j].has(n));
      expect(shared.filter((n) => /^FinishStone/.test(n)), `${PRODUCTS[i].base}∩${PRODUCTS[j].base} 星碑重叠`).toEqual([]);
    }
    expect([...sets[0]].filter((n) => sets[1].has(n)).sort()).toEqual([...ICONS_SCORED].sort());
    expect([...sets[0]].filter((n) => sets[2].has(n)).sort()).toEqual([...ICONS_COMMON].sort());
    expect([...sets[1]].filter((n) => sets[2].has(n)).sort()).toEqual([...ICONS_COMMON].sort());
    expect(new Set(PRODUCTS.flatMap((p) => [...sets[PRODUCTS.indexOf(p)]])).size).toBe(74);
  });

  it("needs.mjs 的共享口径与独立回算一致；结算帧全部落在主图集清零面", () => {
    for (const type of ["general", "speed", "puzzle"]) {
      expect([...popupFinishNeed(type)].sort(), `popupFinishNeed(${type})`).toEqual([...EXPECT_FINISH[type]].sort());
    }
    expect([...needs.atlases.popup.keep].sort()).toEqual([...EXPECTED_EARLY].sort());
    expect(needs.atlases.popup.blank.length).toBe(105);
    for (const p of PRODUCTS) {
      for (const n of EXPECT_FINISH[p.type]) expect(needs.atlases.popup.blank, `${n} 未在主图集清零`).toContain(n);
    }
  });

  it("官方帧全部未 trim、偏移为 0（生成器几何等价的前提，变了要先改脚本）", () => {
    const bad = official.frames.filter((f: any) => f.trimmed || f.spriteSourceSize?.x || f.spriteSourceSize?.y);
    expect(bad.map((f: any) => f.filename)).toEqual([]);
  });
});

describe("r29 产物几何与像素（独立回算，不看生成器的证明）", () => {
  it("每帧 w/h/sourceSize 照抄官方，spriteSourceSize 归零，meta.image 各指自己那张", () => {
    for (const p of PRODUCTS) {
      const a = productJson[p.type];
      expect(a.meta.image).toBe(`${p.base}.png`);
      expect(a.meta.size.w).toBeGreaterThanOrEqual(a.frames.reduce((m: number, f: any) => Math.max(m, f.frame.x + f.frame.w), 0));
      expect(a.meta.size.h).toBeGreaterThanOrEqual(a.frames.reduce((m: number, f: any) => Math.max(m, f.frame.y + f.frame.h), 0));
      for (const f of a.frames as any[]) {
        const o = officialByName.get(f.filename);
        expect(f.spriteSourceSize, `${p.base}/${f.filename} 源偏移`).toEqual({ x: 0, y: 0, w: o.sourceSize.w, h: o.sourceSize.h });
        expect([f.frame.w, f.frame.h, f.sourceSize.w, f.sourceSize.h, f.trimmed, f.rotated], `${p.base}/${f.filename} 几何被改动`).toEqual([
          o.frame.w, o.frame.h, o.sourceSize.w, o.sourceSize.h, o.trimmed, o.rotated,
        ]);
      }
    }
  });

  it("逐帧像素与官方裁片逐字节相等", () => {
    const src = img("PopupAssets.png");
    const bad: string[] = [];
    for (const p of PRODUCTS) {
      const sheet = img(`${p.base}.png`);
      for (const f of productJson[p.type].frames as any[]) {
        const o = officialByName.get(f.filename);
        if (Buffer.compare(cropRaw(sheet, f.frame.x, f.frame.y, f.frame.w, f.frame.h), cropRaw(src, o.frame.x, o.frame.y, o.frame.w, o.frame.h)) !== 0) {
          bad.push(`${p.base}/${f.filename}`);
        }
      }
    }
    expect(bad, "这些帧的像素与官方裁片不一致").toEqual([]);
  }, TT);

  it("帧四周 1px 环带全透明：缩放采样核在边界只可能读到透明", () => {
    const bad: string[] = [];
    for (const p of PRODUCTS) {
      const sheet = img(`${p.base}.png`);
      for (const f of productJson[p.type].frames as any[]) {
        const { x, y, w, h } = f.frame;
        const tag = `${p.base}/${f.filename}`;
        if (!(x - 1 >= 0 && y - 1 >= 0 && x + w + 1 <= sheet.w && y + h + 1 <= sheet.h)) {
          bad.push(`${tag} 贴到了画布边（无隔离带）`);
          continue;
        }
        const alpha = (c: number, r: number) => sheet.data[(r * sheet.w + c) * 4 + 3];
        for (let c = x - 1; c <= x + w; c++) {
          for (const r of [y - 1, y + h]) if (alpha(c, r) !== 0) bad.push(`${tag} 上下环带 ${c},${r}`);
        }
        for (let r = y - 1; r <= y + h; r++) {
          for (const c of [x - 1, x + w]) if (alpha(c, r) !== 0) bad.push(`${tag} 左右环带 ${c},${r}`);
        }
      }
    }
    expect(bad, "存在贴边或非透明的隔离像素").toEqual([]);
  }, TT);

  it("像素账：主图集不到整张四分之一；三张结算图集合起来仍轻于整张，最坏路径（主+一张）也不及整张", () => {
    const kb = (f: string) => readFileSync(path.join(ROOT, `assets/atlasses/${f}`)).length / 1024;
    const whole = kb("PopupAssets.png");
    const main = kb("PopupAssetsSlim.png");
    expect(main).toBeLessThan(whole / 4);
    const finish = PRODUCTS.reduce((s, p) => s + kb(`${p.base}.png`), 0);
    expect(finish).toBeLessThan(whole);
    for (const p of PRODUCTS) {
      expect(kb(`${p.base}.png`), `${p.base} png 预算`).toBeLessThan(80);
      expect(kb(`${p.base}.json`), `${p.base} json 预算`).toBeLessThan(12);
    }
    const worst = Math.max(...PRODUCTS.map((p) => kb(`${p.base}.png`) + kb(`${p.base}.json`)));
    expect(main + worst).toBeLessThan(whole);
    // 主图集幅面不变（坐标不动，只清像素）
    const src = img("PopupAssets.png");
    const slim = img("PopupAssetsSlim.png");
    expect({ w: slim.w, h: slim.h }).toEqual({ w: src.w, h: src.h });
  });

  it("生成器在库且提供 --check 复现性门禁", () => {
    const gen = SRC("scripts/split-popup-finish.mjs");
    expect(existsSync(path.join(ROOT, "scripts/split-popup-finish.mjs"))).toBe(true);
    expect(gen).toContain('process.argv.includes("--check")');
    expect(gen).toContain("Buffer.compare(");
    for (const p of PRODUCTS) expect(gen).toContain(`PopupFinish\${type[0].toUpperCase()}\${type.slice(1)}`);
  });
});

describe("r29 装载批与调用点：结算图集只在可玩后取，动画只在其落地后注册", () => {
  it("阻塞批与落定门都不出现结算图集；装载唯一路径是 loadPopupFinish（清旧变体 + 声明本关那张）", () => {
    const preload = body(BOOT, "preload(): void");
    const gate = body(BOOT, "export function loadGameAtlases");
    expect(preload).not.toContain("PopupFinish");
    expect(gate).not.toContain("PopupFinish");
    const load = body(BOOT, "export function loadPopupFinish");
    expect(load).toContain("finishVariantOf(type)");
    expect(load).toContain("load.scene.textures.exists(a.key)");
    expect(load).toContain("load.scene.textures.remove(a.key)"); // 一个会话只留本关变体（同一张 ~1.9MB 解码）
    expect(load).toContain("load.atlas(key, `/assets/atlasses/${file}.png`");
    expect(load).toContain("return key;");
  });

  it("结算图集文件名只在 BootScene 的映射表里出现（绕过 loadPopupFinish = 第二下载源）", () => {
    const bad: string[] = [];
    for (const file of walk(path.join(ROOT, "packages/client/src"))) {
      const rel = path.relative(ROOT, file);
      const src = stripComments(readFileSync(file, "utf8"));
      if (rel !== BOOT) {
        for (const m of src.matchAll(/PopupFinish(General|Speed|Puzzle)/g)) bad.push(`${rel}: ${m[0]}`);
      }
      for (const m of src.matchAll(/\/assets\/atlasses\/PopupFinish/g)) bad.push(`${rel}: URL`);
    }
    expect(bad).toEqual([]);
    // 三个文件名的映射只在 BootScene，且键名与需求变体一一对应
    const boot = stripComments(SRC(BOOT));
    for (const [v, file] of [["general", "PopupFinishGeneral"], ["speed", "PopupFinishSpeed"], ["puzzle", "PopupFinishPuzzle"]]) {
      expect(boot).toContain(`${v}: { key:`);
      expect(boot).toContain(`file: "${file}"`);
    }
  });

  it("预取在房间可玩之后：kickPopupFinish 排在 kickCharsPlay 之后、循环曲之前，已缓存零请求", () => {
    const game = stripComments(SRC(GAME));
    const create = game.slice(game.indexOf("create(): void"));
    expect(create).toContain("this.kickPopupFinish()");
    expect(create.indexOf("this.kickCharsPlay()")).toBeLessThan(create.indexOf("this.kickPopupFinish()"));
    expect(create.indexOf("this.kickPopupFinish()")).toBeLessThan(create.indexOf("this.kickBgmLoop()"));
    const kick = methodBody(GAME, "private kickPopupFinish");
    expect(kick).toContain("this.textures.exists(popupFinishKey(this.templeType))");
    expect(kick).toContain("loadPopupFinish(this.load, this.templeType)");
    expect(kick).toContain("if (!cached) this.load.start()");
  });

  it("EndMenu.preload 兜底声明本关那张；create 的每处结算绘制都取 uiAtlas，退回主图集也走同名空帧", () => {
    const overlays = stripComments(SRC(OVERLAYS));
    const endmenu = overlays.slice(overlays.indexOf("export class EndMenu"), overlays.indexOf("export class GameOverMenu"));
    const preload = endmenu.slice(endmenu.indexOf("preload(): void"), endmenu.indexOf("create(): void"));
    expect(preload).toContain("loadPopupFinish(this.load, this.result().type)");
    expect(preload.indexOf("loadRoomFont")).toBeLessThan(preload.indexOf("loadPopupFinish"));
    expect(endmenu).toContain("const finishKey = popupFinishKey(d.type)");
    expect(endmenu).toContain("const uiAtlas = this.textures.exists(finishKey) ? finishKey : ATLAS_POPUP;");
    expect(endmenu).toContain("if (uiAtlas === finishKey) buildFinishAnims(this, d.type)");
    // 类内 ATLAS_POPUP 只许出现在退回分支：别处出现即"结算板还在画清零帧"
    expect(endmenu.match(/ATLAS_POPUP/g)?.length).toBe(1);
    expect(endmenu).toContain("this.add.image(294.5, y, uiAtlas, row.icon)");
    expect(endmenu).toContain("this.add.sprite(721, 261, uiAtlas, stonePrefix + \"0000\")");
    expect(endmenu).toContain("this.add.sprite(546, 261, uiAtlas, \"popupArrow0000\")");
    expect(endmenu).toContain("stone.play(stoneKey)");
    // 退回分支的帧名仍在官方 JSON 里声明（透明但不会落 __MISSING/__BASE）
    for (const p of PRODUCTS) for (const n of EXPECT_FINISH[p.type]) expect(officialByName.has(n)).toBe(true);
  });

  it("动画注册时机：buildFinishAnims 唯一调用点在 EndMenu.create，且自带纹理存在守卫", () => {
    expect(stripComments(SRC(OVERLAYS)).match(/buildFinishAnims\(/g)?.length).toBe(1);
    for (const f of ["packages/client/src/scenes/MenuScene.ts", GAME]) {
      expect(stripComments(SRC(f)).includes("buildFinishAnims("), `${f} 抢跑注册`).toBe(false);
    }
    const build = body(BOOT, "export function buildFinishAnims");
    expect(build).toContain("const key = popupFinishKey(type)");
    expect(build).toContain("if (!scene.textures.exists(key)) return;");
    expect([...build.matchAll(/seq\(`finish_stone_\$\{tag\}(\d)`/g)].map((m) => m[1])).toEqual(["1", "2", "3"]);
    for (const range of ["base, 1, 7, 30, 0", "base, 8, 14, 30, 0", "base, 15, 21, 30, 0"]) expect(build).toContain(range);
    expect(build).toContain('const tag = finishVariantOf(type) === "general" ? "" :');
  });

  it("键集与拆前逐字相同：general=finish_stone_N，speed/puzzle=finish_stone_<v>_N；buildGameAnims 不再注册", () => {
    const animKey = body(BOOT, "export function finishStoneAnimKey");
    expect(animKey).toContain('v === "general" ? `finish_stone_${stars}` : `finish_stone_${v}_${stars}`');
    expect([...stripComments(SRC(BOOT)).matchAll(/seq\(`finish_stone_/g)].length).toBe(3);
    expect(body(BOOT, "export function buildGameAnims")).not.toContain("finish_stone_");
    // 星碑前缀与类型映射：general 用无前缀族，另两张各用带类型名的族
    const boot = stripComments(SRC(BOOT));
    expect(boot).toContain('general: { key: ATLAS_FINISH_GENERAL, file: "PopupFinishGeneral", stone: "FinishStone" }');
    expect(boot).toContain('speed: { key: ATLAS_FINISH_SPEED, file: "PopupFinishSpeed", stone: "FinishStoneSpeed" }');
    expect(boot).toContain('puzzle: { key: ATLAS_FINISH_PUZZLE, file: "PopupFinishPuzzle", stone: "FinishStonePuzzle" }');
    expect(body(BOOT, "export function finishVariantOf")).toContain('type === "speed" || type === "puzzle" ? type : "general"');
  });
});
