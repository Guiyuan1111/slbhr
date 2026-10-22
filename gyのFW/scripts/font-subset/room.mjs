/**
 * 房内字体子集的共用口径层（生成器 scripts/font-subset/build-font-blank.mjs 与静态测试
 * packages/client/src/__tests__/font-roomblank.test.ts 共用，避免两处各写一份解析而漂移）。
 *
 * 定位与 scripts/font-subset/prephase.mjs（进房前链）完全一致：字形图集只动像素与坐标，
 * 授权区＝官方字形帧矩形 ∪ 四周 ring 环带逐字节照抄 font.png，其余 RGBA 全 0；
 * `.fnt` 侧只改写 <char> 的 x/y 与 <common> 的 scaleW/scaleH，度量面零变更。
 * 这里的职责只到"房内会画的中文需求到底是哪些字符"，像素合成由 build-font-room.mjs 做。
 *
 * 需求来自三类（件0 实测，见 note/report/perf/2026-10-22-r24-room-font-subset.md）：
 *  1. 关卡教学文本：只有 tutorial 层的文本对象会进位图字，且客户端只取"选中的那一层"
 *     （level2.ts:590-595 Tutorial_keyboard ?? Tutorial_dual ?? Tutorial_single ?? 首个）。
 *  2. 行钉字面量：overlays/GameScene 里写死的几处中文。
 *  3. 动态数字点：时钟 mm:ss 与结算板时限 limitStr ⇒ 固定字符集 `0123456789:`。
 * 关卡文件是否被取到，取决于 data/forest/temple.json 的 levels[].filename 与磁盘 *.json 一一对应——
 * 这条不变式在本层钉死（按关出图/漏字检测都依赖它）。
 */
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { parseFnt } from "./prephase.mjs";

/** 行钉字面量：每条断言"该文案仍在那一行"，一漂移就抛（r18 的行钉口径）。 */
export const ROOM_LITERAL_SITES = [
  { file: "packages/client/src/scenes/overlays.ts", line: 186, texts: ["暫停"], note: "暂停面板标题" },
  { file: "packages/client/src/scenes/overlays.ts", line: 193, texts: ["再试一次"], note: "PauseMenu stoneButton label" },
  { file: "packages/client/src/scenes/overlays.ts", line: 204, texts: ["返回菜单"], note: "PauseMenu stoneButton label" },
  { file: "packages/client/src/scenes/overlays.ts", line: 210, texts: ["继续"], note: "PauseMenu stoneButton label" },
  { file: "packages/client/src/scenes/overlays.ts", line: 357, texts: ["继续"], note: "EndMenu stoneButton label" },
  { file: "packages/client/src/scenes/overlays.ts", line: 381, texts: ["游戏结束"], note: "GameOverMenu 标题" },
  { file: "packages/client/src/scenes/overlays.ts", line: 388, texts: ["返回菜单"], note: "GameOverMenu label" },
  { file: "packages/client/src/scenes/overlays.ts", line: 399, texts: ["再试一次"], note: "GameOverMenu label" },
  { file: "packages/client/src/scenes/GameScene.ts", line: 1625, texts: ["00:00"], note: "时钟初值" },
];

/** 动态点：只声明"这一行仍产出这种字符"，不声明具体串。 */
export const ROOM_DYNAMIC_SITES = [
  { file: "packages/client/src/scenes/GameScene.ts", line: 1663, re: /mmss\(clockSec\)/, chars: "0123456789:", note: "时钟 mm:ss（GameScene.ts:195 padStart(2,\"0\") + ':'）" },
  { file: "packages/client/src/scenes/overlays.ts", line: 321, re: /padStart\(2, "0"\)/, chars: "0123456789:", note: "结算板时限文本 limitStr" },
];

const lineOf = (root, file, line) => readFileSync(join(root, file), "utf8").split("\n")[line - 1];

/** 逐条核对行钉：文案/动态点一改就抛——声明与代码脱钩是这条链唯一真正致命的失效模式。 */
export function assertRoomPins(root) {
  const errs = [];
  for (const s of ROOM_LITERAL_SITES) {
    const line = lineOf(root, s.file, s.line) ?? "";
    const miss = s.texts.filter((t) => !line.includes(t));
    if (miss.length) errs.push(`${s.file}:${s.line} 不含 ${JSON.stringify(miss)}（${s.note}）`);
  }
  for (const s of ROOM_DYNAMIC_SITES) {
    const line = lineOf(root, s.file, s.line) ?? "";
    if (!s.re.test(line)) errs.push(`${s.file}:${s.line} 已不是 ${s.re}（${s.note}）`);
  }
  if (errs.length) throw new Error(`房内行钉失败：\n - ${errs.join("\n - ")}`);
}

/** 磁盘上 data/<组>/levels 下的 .json 相对路径集合（用于与 temple.json 列表对账）。 */
export function diskLevelPaths(root) {
  const dataDir = join(root, "data");
  const out = new Set();
  for (const group of readdirSync(dataDir)) {
    const levelsDir = join(dataDir, group, "levels");
    let files;
    try {
      files = readdirSync(levelsDir);
    } catch {
      continue;
    }
    for (const f of files) if (f.endsWith(".json")) out.add(`${group}/levels/${f}`);
  }
  return out;
}

/** 客户端取教学层的规则（level2.ts:590-595）：只认 Tutorial_ 开头的层，按 keyboard→dual→single→首个选一层。 */
function selectedTutorialLayerName(json) {
  const names = (json.layers ?? []).filter((l) => String(l.name ?? "").startsWith("Tutorial_")).map((l) => l.name);
  for (const n of ["Tutorial_keyboard", "Tutorial_dual", "Tutorial_single"]) if (names.includes(n)) return n;
  return names[0] ?? "(无)";
}

/**
 * 用客户端同一个 parseLevel 遍历 temple.json 列出的关卡，返回每关 {id, filename, texts[], selectedLayer}。
 * texts = 选中那一层的全部文本对象（与 level2 的 tutorials 字段同源，含无触发矩形的步）。
 * 顺带钉死"磁盘关卡集合 == temple.json 列表"这条不变式。
 */
export async function roomLevelTexts(root) {
  // level2.ts 是 TS：走 tsx / vitest 的 loader（与运行时同一份源码，不存在"本层自己重述解析规则"）
  const { parseLevel } = await import(pathToFileURL(join(root, "packages/shared/src/level2.ts")).href);
  const templePath = join(root, "data/forest/temple.json");
  const temple = JSON.parse(readFileSync(templePath, "utf8"));
  const listed = temple.levels.map((lv) => lv.filename);
  const disk = diskLevelPaths(root);
  const listedSet = new Set(listed);
  if (listedSet.size !== listed.length) throw new Error(`temple.json 有重复 filename：${listed.length} 条但 ${listedSet.size} 种`);
  const missing = listed.filter((p) => !disk.has(p));
  const orphans = [...disk].filter((p) => !listedSet.has(p));
  if (missing.length) throw new Error(`temple.json 列了但磁盘没有：${missing.join(", ")}`);
  if (orphans.length) throw new Error(`磁盘有但 temple.json 没列（孤儿关卡，按关出图会漏）：${orphans.join(", ")}`);

  const tilesetCache = new Map();
  const providerFor = (baseDir) => (source) => {
    const p = join(baseDir, decodeURIComponent(String(source).replace(/^file:\/\//, "")));
    if (!tilesetCache.has(p)) tilesetCache.set(p, JSON.parse(readFileSync(p, "utf8")));
    return tilesetCache.get(p);
  };

  const levels = [];
  for (const lv of temple.levels) {
    const json = JSON.parse(readFileSync(join(root, "data", lv.filename), "utf8"));
    const dir = join(root, "data", dirname(lv.filename));
    const parsed = parseLevel(String(lv.id), json, providerFor(dir));
    levels.push({
      id: lv.id,
      filename: lv.filename,
      selectedLayer: selectedTutorialLayerName(json),
      texts: parsed.tutorials.flatMap((s) => s.textItems.map((t) => t.text)),
    });
  }
  return levels;
}

/** where 表 → 与 prephase.mjs 同形状的 { chars, kept, noGlyph }（kept 按 code 升序）。 */
function materialize(where, fnt) {
  const kept = [];
  const noGlyph = [];
  for (const [ch, w] of where) {
    const g = fnt.glyphs.get(ch.codePointAt(0));
    if (g) kept.push({ ch, code: g.id, glyph: g, where: w });
    else noGlyph.push({ ch, where: w });
  }
  kept.sort((a, b) => a.code - b.code);
  noGlyph.sort((a, b) => a.ch.codePointAt(0) - b.ch.codePointAt(0));
  return { chars: new Set(where.keys()), kept, noGlyph };
}

function baseWhere() {
  /** @type {Map<string, string>} */
  const where = new Map();
  const add = (ch, w) => {
    if (!where.has(ch)) where.set(ch, w);
  };
  for (const s of ROOM_LITERAL_SITES) for (const t of s.texts) for (const ch of t) add(ch, `${s.file}:${s.line}`);
  for (const s of ROOM_DYNAMIC_SITES) for (const ch of s.chars) add(ch, `${s.file}:${s.line}(动态)`);
  return where;
}

/**
 * 基础集（r28）：不依赖关卡的房内文案——三块面板字面量 ＋ 时钟/结算数字。
 * 46/48 关只用它；有教学文本的两关才需要 roomChars 的全集。
 */
export function roomBaseChars(root, fnt) {
  assertRoomPins(root);
  return materialize(baseWhere(), fnt);
}

/**
 * 房内会画的中文需求集合：教学文本（选中层）∪ 行钉字面量 ∪ 动态数字点。
 * 返回形状与 prephase.mjs 的 prephaseChars 一致：{ chars:Set, kept:[{ch,code,glyph,where}], noGlyph:[{ch,where}] }，
 * kept 按 code 升序。读取前先跑行钉断言。
 */
export async function roomChars(root, fnt) {
  assertRoomPins(root);
  const where = baseWhere();
  const add = (ch, w) => {
    if (!where.has(ch)) where.set(ch, w);
  };
  for (const l of await roomLevelTexts(root)) {
    for (const text of l.texts) for (const ch of text) add(ch, `关卡 ${l.id}(${l.selectedLayer})`);
  }
  return materialize(where, fnt);
}

/** 有教学文本的关卡（客户端按关选字体变体的唯一依据；生成器/静态网共用）。 */
export async function tutorialLevels(root) {
  return (await roomLevelTexts(root)).filter((l) => l.texts.length > 0);
}

/** 便捷入口：读官方 font.fnt 后求房内字符集（测试与一次性脚本常用）。 */
export async function roomCharsFromOfficial(root, fntPath = "assets/fonts/chinese/font.fnt") {
  const fnt = parseFnt(join(root, fntPath));
  return { fnt, ...(await roomChars(root, fnt)) };
}
