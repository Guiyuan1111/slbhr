#!/usr/bin/env node
/**
 * r26 件1：三张进房图集"可上屏帧"的唯一口径（生成器与静态网共用）。
 *
 * Slim 图集把永不上屏的帧原地清零、坐标与 JSON 都不动；漏算一个消费点，那一帧就会静默画成
 * 透明（Phaser 画帧不校验像素）。所以 keep 集合是这套优化的全部风险面，需求源只有两类：
 *
 *  1) 关卡数据面：48 关逐关走与运行时同一份 parseLevel（packages/shared/src/level2.ts），
 *     机关/装饰/结算面板按关卡字段取帧；装饰帧复刻 GameScene.buildDecorations 的
 *     确定性步进（种子 "ASDFA" 固定，Math.random 只决定旋转/翻转，不影响取哪一帧）。
 *  2) 固定/动画面：与关卡数据无关的消费点，逐处内容钉（PINS）——帧名或调用形状一改，这里先红。
 *
 * 门外场景的消费者也在 keep 里：选关大厅背景 MenuBackground0000（TempleScene.ts:69）与
 * 三星彩带 Confetti0000-0003（menus.ts:109）。Slim 只按"这张图集在哪些场景被装载"切，
 * 不按"这一关用不用"切——拆分张是另一件事（r26 不做）。
 *
 * 清零面必须落在 DEAD 名单里：图集新增了没人消费的帧、或关卡新增了机制，生成器会先报错，
 * 逼着人先裁定再清零，而不是悄悄把活帧抹掉。
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

export const ATLAS_SPECS = {
  mech: {
    json: "assets/atlasses/MechAssets.json",
    officialPng: "assets/atlasses/MechAssets.png",
    slimPng: "assets/atlasses/MechAssetsSlim.png",
  },
  temple: {
    json: "assets/atlasses/Temples/forest/TempleAssets.json",
    officialPng: "assets/atlasses/Temples/forest/TempleAssets.png",
    slimPng: "assets/atlasses/Temples/forest/TempleAssetsSlim.png",
  },
  popup: {
    json: "assets/atlasses/PopupAssets.json",
    officialPng: "assets/atlasses/PopupAssets.png",
    slimPng: "assets/atlasses/PopupAssetsSlim.png",
  },
};

const pad4 = (n) => String(n).padStart(4, "0");
const seq4 = (prefix, start, end) => Array.from({ length: end - start + 1 }, (_, i) => `${prefix}${pad4(i + start)}`);

/** 风区动画帧（BootScene.ts:391-393 无条件注册；有风关卡才绘制，但只有 34 帧，保暖不贵） */
export const MECH_FIXED = [...seq4("wind_base", 0, 3), ...seq4("wind_effect", 0, 29)];

/** 与关卡无关的庙宇面：整幅背景/岩壁、HUD 时钟、两扇门的静态帧、选关大厅背景 */
export const TEMPLE_FIXED = ["BackGround0000", "ForeGround0000", "Clock0000", "FinishBoy0000", "FinishGirl0000", "MenuBackground0000"];

/** 与关卡类型无关的弹窗面：HUD 暂停键、结算板、勾叉/成就图标、三星彩带（CompleteScene） */
export const POPUP_FIXED = [
  "PauseButton0000",
  "PopupBackground0000",
  "popupArrow0000",
  "popupArrow0001",
  "TickIcon0000",
  "CrossIcon0000",
  "FinishIcon0000",
  ...seq4("Confetti", 0, 3),
];

/**
 * 允许清零的帧。families 是森林 48 关根本不解析的机制族（level2.ts 里没有对应字段或在注释里
 * 标明森林未用）；exact 是逐个裁定的零消费帧。FinishStoneDark 例外地按族清零：
 * 48 关类型只有 general/speed/puzzle（inspect() 每次都会断言），dark 分支永不执行。
 */
export const DEAD_RULES = {
  mech: {
    families: [
      "portal",
      "beamer",
      "infinitemirror",
      "rotmirror",
      "slider",
      "SliderDot",
      "SliderTrack",
      "timed_pusher",
      "lightpusher",
      "BoxMirror",
      "BackgroundCover",
      "pusher_block_silver",
    ],
    exact: [],
  },
  temple: {
    families: [],
    exact: ["Icon0000", "Icon0001", "Icon0002", "Diamond1_Bkg_Empty0000"],
  },
  popup: {
    families: ["FinishStoneDark"],
    exact: [
      "Clock0000",
      "CursorToggle0000",
      "DeviceItemRenderer0000",
      "FingerRingJump0000",
      "FingerRingLeft0000",
      "FingerRingRight0000",
      "MuteButton0000",
      "MuteButton0001",
      "_default0000",
    ],
  },
};

/**
 * 消费点内容钉：{file, has[, min]}。has 出现次数不足 min（默认 1）即判口径漂移。
 * 只钉"帧名是动态拼出来的、或决定了上屏集合"的行；静态全帧名字面量由 atlas-slim.test.ts
 * 的源码扫描独立兜住。
 */
const PINS = [
  // ── 机关（GameScene 逐机制建图）──
  { file: "packages/client/src/scenes/GameScene.ts", has: 'ATLAS_MECH, "pusher_block0000"' },
  { file: "packages/client/src/scenes/GameScene.ts", has: 'ATLAS_MECH, "pusher_block_light0000"' },
  { file: "packages/client/src/scenes/GameScene.ts", has: 'ATLAS_MECH, "lever_stick0000"' },
  { file: "packages/client/src/scenes/GameScene.ts", has: 'ATLAS_MECH, "lever_stick_light_off0000"' },
  { file: "packages/client/src/scenes/GameScene.ts", has: 'ATLAS_MECH, "lever_base0000"' },
  { file: "packages/client/src/scenes/GameScene.ts", has: 'ATLAS_MECH, "lever_base_light_off0000"' },
  { file: "packages/client/src/scenes/GameScene.ts", has: 'b.heavy ? "movingbox20000" : "movingbox0000"' },
  { file: "packages/client/src/scenes/GameScene.ts", has: 'ATLAS_MECH, "ball0000"' },
  { file: "packages/client/src/scenes/GameScene.ts", has: '"BarCapLeft0000"' },
  { file: "packages/client/src/scenes/GameScene.ts", has: '"BarCapRight0000"' },
  { file: "packages/client/src/scenes/GameScene.ts", has: '"BarCenter0000"' },
  { file: "packages/client/src/scenes/GameScene.ts", has: 'ns === 1 ? "moving_platform_light_on0000" : "moving_platform_light_off0000"' },
  { file: "packages/client/src/scenes/GameScene.ts", has: '"hanging_anchor0000"' },
  { file: "packages/client/src/scenes/GameScene.ts", has: '"hanging_platform0000"' },
  { file: "packages/client/src/scenes/GameScene.ts", has: '"hanging_base0000"' },
  { file: "packages/client/src/scenes/GameScene.ts", has: 'ATLAS_MECH, "pulley_base0000"' },
  { file: "packages/client/src/scenes/GameScene.ts", has: 'ATLAS_MECH, "pulley_anchor0000"' },
  { file: "packages/client/src/scenes/GameScene.ts", has: 'ATLAS_MECH, "pulley_platform0000"' },
  { file: "packages/client/src/scenes/GameScene.ts", has: 'ATLAS_MECH, "roman_center0000"' },
  { file: "packages/client/src/scenes/GameScene.ts", has: 'ATLAS_MECH, "roman_base0000"' },
  { file: "packages/client/src/scenes/GameScene.ts", has: 'ATLAS_MECH, "roman_bar0000"' },
  { file: "packages/client/src/scenes/GameScene.ts", has: 'ATLAS_MECH, "roman_end0000"' },
  { file: "packages/client/src/scenes/GameScene.ts", has: 'ATLAS_MECH, "_default0000"' },
  { file: "packages/client/src/scenes/GameScene.ts", has: '"WindowLeft0000"' },
  { file: "packages/client/src/scenes/GameScene.ts", has: '"WindowRight0000"' },
  { file: "packages/client/src/scenes/GameScene.ts", has: '"WindowCenter0000"' },
  { file: "packages/client/src/scenes/BootScene.ts", has: 'seq("wind_base", ATLAS_MECH, "wind_base", 0, 3, 30, -1)' },
  { file: "packages/client/src/scenes/BootScene.ts", has: 'seq("wind_effect", ATLAS_MECH, "wind_effect", 0, 29, 30, -1)' },
  // ── 庙宇 ──
  { file: "packages/client/src/scenes/GameScene.ts", has: 'ATLAS_TEMPLE, "BackGround0000"' },
  { file: "packages/client/src/scenes/GameScene.ts", has: 'ttex.get("ForeGround0000")' },
  { file: "packages/client/src/scenes/GameScene.ts", has: 'fireboy: "FinishBoy0000", watergirl: "FinishGirl0000"' },
  { file: "packages/client/src/scenes/GameScene.ts", has: 'String(frame).padStart(4, "0")' },
  { file: "packages/client/src/scenes/GameScene.ts", has: 'role === "fireboy" ? "FinishBoy" : "FinishGirl"' },
  { file: "packages/client/src/scenes/GameScene.ts", has: 'ATLAS_TEMPLE, "Clock0000"' },
  { file: "packages/client/src/scenes/TempleScene.ts", has: 'ATLAS_TEMPLE, "MenuBackground0000"' },
  // 装饰帧复刻：种子、步进、四类分派与空地形哨兵
  { file: "packages/client/src/scenes/GameScene.ts", has: 'createSeedrandomFactory()("ASDFA")' },
  { file: "packages/client/src/scenes/GameScene.ts", has: "Math.round(3 * rng() + 3.5)" },
  { file: "packages/client/src/scenes/GameScene.ts", has: "const EMPTY_TYPE = -99" },
  { file: "packages/client/src/scenes/GameScene.ts", has: "decor_O_${(w % 2) + 1}0000" },
  { file: "packages/client/src/scenes/GameScene.ts", has: "decor_T_${(w % 3) + 1}0000" },
  { file: "packages/client/src/scenes/GameScene.ts", has: '"decor_X0000"' },
  { file: "packages/client/src/scenes/GameScene.ts", has: '"decor_A0000"' },
  { file: "packages/client/src/scenes/GameScene.ts", has: '"decor_V0000"' },
  // ── 弹窗 ──
  { file: "packages/client/src/scenes/GameScene.ts", has: 'ATLAS_POPUP, "PauseButton0000"' },
  { file: "packages/client/src/scenes/overlays.ts", has: '"PopupBackground0000"', min: 2 },
  { file: "packages/client/src/scenes/overlays.ts", has: 'row.ok ? "TickIcon0000" : "CrossIcon0000"' },
  { file: "packages/client/src/scenes/overlays.ts", has: 'd.type === "puzzle" ? "SilverIcon0000" : "TimeIcon0000"' },
  { file: "packages/client/src/scenes/overlays.ts", has: 'icon: "DiamondsIcon0000"' },
  { file: "packages/client/src/scenes/overlays.ts", has: 'd.type === "puzzle" ? "FinishStonePuzzle" : d.type === "speed" ? "FinishStoneSpeed" : d.type === "dark" ? "FinishStoneDark" : "FinishStone"' },
  { file: "packages/client/src/scenes/overlays.ts", has: "stonePrefix + \"0000\"" },
  { file: "packages/client/src/scenes/overlays.ts", has: 'ATLAS_POPUP, "popupArrow0000"' },
  { file: "packages/client/src/scenes/overlays.ts", has: 'arrow.setFrame("popupArrow0001")' },
  { file: "packages/client/src/scenes/BootScene.ts", has: 'seq("finish_stone_1", ATLAS_POPUP, "FinishStone", 1, 7, 30, 0)' },
  { file: "packages/client/src/scenes/BootScene.ts", has: '["puzzle", "FinishStonePuzzle"]' },
  { file: "packages/client/src/scenes/BootScene.ts", has: '["speed", "FinishStoneSpeed"]' },
  { file: "packages/client/src/scenes/BootScene.ts", has: '["dark", "FinishStoneDark"]' },
  { file: "packages/client/src/scenes/menus.ts", has: "Confetti${String(i % 4).padStart(4, \"0\")}" },
];

export function verifyPins(root = REPO_ROOT) {
  const cache = new Map();
  for (const pin of PINS) {
    let src = cache.get(pin.file);
    if (src === undefined) {
      src = readFileSync(join(root, pin.file), "utf8");
      cache.set(pin.file, src);
    }
    let count = 0;
    for (let i = src.indexOf(pin.has); i >= 0; i = src.indexOf(pin.has, i + 1)) count++;
    const min = pin.min ?? 1;
    if (count < min) {
      throw new Error(`atlas-slim 口径漂移：${pin.file} 里 "${pin.has}" 出现 ${count} 次（期望 ≥${min}）——先复核 keep 集合再重生成`);
    }
  }
}

/** buildDecorations 的取帧复刻（GameScene.ts:1162-1262）：只用种子 RNG 决定行列步进，
 *  旋转/翻转的 Math.random 不影响帧名。 */
export function decorFrames(level, makeRng) {
  const { cols, rows, groundType } = level;
  const rng = makeRng("ASDFA");
  const z = () => Math.round(3 * rng() + 3.5);
  const occupied = new Set();
  const mark = (px, py) => {
    const bx = Math.floor(px / 32);
    const by = Math.floor(py / 32);
    for (const [dx, dy] of [[0, 0], [-1, -1], [-1, 0], [0, -1]]) {
      const row = by + dy;
      const col = bx + dx;
      if (row >= 0 && row < rows && col >= 0 && col < cols) occupied.add(row + "," + col);
    }
  };
  for (const m of level.levers) mark(m.x, m.y);
  for (const m of level.pushers) mark(m.x, m.y);
  for (const b of level.boxes) mark(b.x, b.y);
  for (const b of level.balls) mark(b.x, b.y);
  const typeOf = (row, col) => {
    if (row < 0 || col < 0 || row >= rows || col >= cols) return null;
    const t = groundType[row * cols + col];
    return t === -99 ? null : t;
  };
  const key = (row, col) => row + "," + col;
  const picked = [];
  const pickedSet = new Set();
  let K = 1;
  while (K < rows) {
    let J = 1;
    while (J < cols - 1) {
      let got = false;
      for (let l = 0; l <= 6 && !got; l++) {
        for (let m = 0; m <= 6; m++) {
          const h = Math.min(Math.max(J + l, 0), cols - 2);
          const i = Math.min(Math.max(K + m, 0), rows - 1);
          if (typeOf(i, h) === null) continue;
          if (occupied.has(key(i, h))) continue;
          if ([key(i, h), key(i - 1, h), key(i, h + 1), key(i - 1, h + 1), key(i, h - 1), key(i - 1, h - 1)].some((k) => pickedSet.has(k))) continue;
          picked.push({ row: i, col: h });
          pickedSet.add(key(i, h));
          got = true;
          break;
        }
      }
      J += z();
    }
    K += z();
  }
  const frames = new Set();
  let w = 0;
  for (const d of picked) {
    const F = typeOf(d.row, d.col);
    const up = typeOf(d.row - 1, d.col);
    const right = typeOf(d.row, d.col + 1);
    const left = typeOf(d.row, d.col - 1);
    let G = null;
    if (F === 0 && up !== null && right !== null && left !== null) G = `decor_O_${(w % 2) + 1}0000`;
    else if (F !== 0 || up !== null) {
      if (F === 0) G = "decor_X0000";
      else if (F === 1 || F === 2) G = "decor_A0000";
      else if (F === 3 || F === 4) G = "decor_V0000";
    } else G = `decor_T_${(w % 3) + 1}0000`;
    if (G) frames.add(G);
    w++;
  }
  return [...frames];
}

/** 机关帧：首帧 + 事件帧（施法/亮灯/开门动画），按关卡字段取 */
export function mechNeed(level) {
  const first = [];
  const event = [];
  if (level.pushers.length) first.push("pusher_block0000", "pusher_block_light0000");
  if (level.levers.length) {
    first.push("lever_stick0000", "lever_stick_light_off0000", "lever_base0000", "lever_base_light_off0000");
    event.push("lever_base_light_on0000", "lever_stick_light_on0000");
  }
  if (level.boxes.length) first.push("movingbox0000");
  if (level.boxes.some((b) => b.heavy)) first.push("movingbox20000");
  if (level.balls.length) first.push("ball0000");
  if (level.platforms.length) {
    first.push("BarCapLeft0000", "BarCapRight0000", "BarCenter0000", "moving_platform_light_off0000");
    event.push("moving_platform_light_on0000");
  }
  if (level.hangings.length) first.push("hanging_anchor0000", "pulley_rope0000", "hanging_platform0000", "hanging_base0000");
  if (level.pulleys.length) first.push("pulley_base0000", "pulley_anchor0000", "pulley_rope0000", "pulley_platform0000");
  if (level.romans.length) first.push("roman_center0000", "roman_base0000", "roman_bar0000", "roman_end0000");
  if (level.winds.length) {
    first.push("wind_base0000", "wind_effect0000", "wind_base_light_off0000");
    event.push("wind_base_light_on0000");
  }
  if (level.windows.length) first.push("_default0000", "WindowLeft0000", "WindowRight0000", "WindowCenter0000");
  return { first, event };
}

/** 弹窗帧：面板全类型共用 + 结算行图标（两行类型隐藏钻石行）+ 星碑（按类型） */
export function popupNeed(type) {
  const frames = POPUP_FIXED.filter((n) => !n.startsWith("Confetti"));
  frames.push(type === "puzzle" ? "SilverIcon0000" : "TimeIcon0000");
  if (type !== "puzzle" && type !== "dark") frames.push("DiamondsIcon0000");
  const stone = type === "puzzle" ? "FinishStonePuzzle" : type === "speed" ? "FinishStoneSpeed" : type === "dark" ? "FinishStoneDark" : "FinishStone";
  frames.push(...seq4(stone, 0, 21));
  return frames;
}

async function loadLevels(root) {
  const { parseLevel } = await import(pathToFileURL(join(root, "packages/shared/src/level2.ts")).href);
  const { createSeedrandomFactory } = await import(pathToFileURL(join(root, "packages/client/src/vendor/seedrandom.ts")).href);
  const { DOOR } = await import(pathToFileURL(join(root, "packages/shared/src/params.ts")).href);
  const temple = JSON.parse(readFileSync(join(root, "data/forest/temple.json"), "utf8"));
  const tilesets = new Map();
  const providerFor = (baseDir) => (source) => {
    const p = join(baseDir, decodeURIComponent(String(source).replace(/^file:\/\//, "")));
    if (!tilesets.has(p)) tilesets.set(p, JSON.parse(readFileSync(p, "utf8")));
    return tilesets.get(p);
  };
  const levels = temple.levels.map((lv) => {
    const json = JSON.parse(readFileSync(join(root, "data", lv.filename), "utf8"));
    const parsed = parseLevel(String(lv.id), json, providerFor(join(root, "data", dirname(lv.filename))));
    return {
      id: lv.id,
      filename: lv.filename,
      type: String(lv.type ?? "general"),
      parsed,
      decor: decorFrames(parsed, createSeedrandomFactory()),
    };
  });
  return { levels, doorFrames: DOOR.frames };
}

/**
 * 计算三张图集的 keep/blank。返回 {levels, keep, atlases}：
 *  atlases[key] = {declared, keep, blank, meta}（均为帧名数组，顺序照官方 JSON）。
 * 类型面断言：森林 48 关出现 dark 会让 FinishStoneDark 进需求，而它已被清零——直接抛。
 */
export async function inspect(root = REPO_ROOT) {
  verifyPins(root);
  const { levels, doorFrames } = await loadLevels(root);
  const types = new Set(levels.map((l) => l.type));
  const unknownTypes = [...types].filter((t) => !["general", "speed", "puzzle"].includes(t));
  if (unknownTypes.length) {
    throw new Error(`atlas-slim：关卡类型出现 ${unknownTypes.join(",")}——弹窗星碑/两行口径需重新裁定（FinishStoneDark 是否清零）`);
  }
  const keep = {
    mech: new Set(MECH_FIXED),
    temple: new Set([...TEMPLE_FIXED, ...seq4("FinishBoy", 1, doorFrames), ...seq4("FinishGirl", 1, doorFrames)]),
    popup: new Set(POPUP_FIXED),
  };
  for (const l of levels) {
    const m = mechNeed(l.parsed);
    for (const n of [...m.first, ...m.event]) keep.mech.add(n);
    for (const n of l.decor) keep.temple.add(n);
    for (const n of popupNeed(l.type)) keep.popup.add(n);
  }
  const atlases = {};
  for (const [key, spec] of Object.entries(ATLAS_SPECS)) {
    const meta = JSON.parse(readFileSync(join(root, spec.json), "utf8"));
    const declared = meta.frames.map((f) => f.filename);
    const declaredSet = new Set(declared);
    const missing = [...keep[key]].filter((n) => !declaredSet.has(n));
    if (missing.length) throw new Error(`atlas-slim/${key}：需求帧不在官方图集里：${missing.slice(0, 8).join(",")}`);
    const blank = declared.filter((n) => !keep[key].has(n));
    const rule = DEAD_RULES[key];
    const bad = blank.filter((n) => !rule.families.some((p) => n.startsWith(p)) && !rule.exact.includes(n));
    if (bad.length) {
      throw new Error(`atlas-slim/${key}：${bad.length} 个零消费帧不在 DEAD 名单（${bad.slice(0, 8).join(",")}）——先裁定是否真的永不上屏`);
    }
    atlases[key] = { declared, keep: declared.filter((n) => keep[key].has(n)), blank, meta };
  }
  return { levels, keep, atlases };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { atlases } = await inspect();
  for (const [key, a] of Object.entries(atlases)) {
    console.log(`${key}: ${a.declared.length} 帧，keep ${a.keep.length}，blank ${a.blank.length}`);
  }
}
