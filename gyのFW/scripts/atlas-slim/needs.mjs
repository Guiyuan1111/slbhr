#!/usr/bin/env node
/**
 * r26 件1：客户端四张图集"可上屏帧"的唯一口径（生成器与静态网共用；r31 起含 MenuAssets）。
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
 * 不按"这一关用不用"切——按关拆张是另一件事。
 *
 * r29 起弹窗图集只有三帧组留在主图集（进房就会上屏：HUD 暂停键/结算板底/选关彩带），
 * 结算面板的内容帧（星碑 88 帧 + 图标箭头 8 帧）全部清零，改由 `scripts/split-popup-finish.mjs`
 * 按关类型重打包成三张 `PopupFinish*.{png,json}`，房间可玩之后由 GameScene 预取。
 * keep 口径因此从"48 关并集"收窄成"主图集消费面"；拆出帧的消费面由 `__tests__/popup-finish.test.ts`
 * 与生成器的覆盖断言独立兜住（本文件仍导出 `popupFinishNeed` 作为唯一帧集合口径）。
 *
 * r31 起 MenuAssets（选关大厅/设置/暂停板共用的 UI 图集，1024²）纳入同一口径：keep 是
 * 选关星碑四套（含森林不存在的 Dark——烘焙 masks 表按四前缀静态取底座）、按钮与 HUD 帧；
 * 原版的设置/触屏/静音/振动/解锁等 UI 族在复刻里没有消费点，整族清零。
 *
 * 清零面必须落在 DEAD 名单里：图集新增了没人消费的帧、或关卡新增了机制，生成器会先报错，
 * 逼着人先裁定再清零，而不是悄悄把活帧抹掉。
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { MECH_WIND_FIXED as MECH_FIXED, mechNeed } from "../../packages/shared/src/mech-needs.ts";

export { MECH_FIXED, mechNeed };

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
  menu: {
    json: "assets/atlasses/MenuAssets.json",
    officialPng: "assets/atlasses/MenuAssets.png",
    slimPng: "assets/atlasses/MenuAssetsSlim.png",
  },
};

const pad4 = (n) => String(n).padStart(4, "0");
const seq4 = (prefix, start, end) => Array.from({ length: end - start + 1 }, (_, i) => `${prefix}${pad4(i + start)}`);

/** 风区动画帧（MECH_WIND_FIXED）：r30 起只给有风关卡的变体；48 关并集仍按此保暖。
 *  （定义已移到 packages/shared/src/mech-needs.ts，生成器/客户端/静态网共用同一份。） */

/** 与关卡无关的庙宇面：整幅背景/岩壁、HUD 时钟、两扇门的静态帧、选关大厅背景 */
export const TEMPLE_FIXED = ["BackGround0000", "ForeGround0000", "Clock0000", "FinishBoy0000", "FinishGirl0000", "MenuBackground0000"];

/** 主图集（Slim）保留的弹窗面：进房就会上屏的 HUD 暂停键与结算板底，以及选关大厅的三星彩带
 *  （CompleteScene）。r29 起结算板的图标/箭头/星碑全部拆到按关类型的 PopupFinish 图集。 */
export const POPUP_EARLY = ["PauseButton0000", "PopupBackground0000", ...seq4("Confetti", 0, 3)];

/** 选关/设置/暂停面的固定帧（r31）：MenuAssets 里与关卡数据无关的消费点。
 *  - 星级与底座按类型前缀拼：TempleScene.prefixOf 的四种（speed/puzzle/dark/默认）都能拼出来，
 *    但森林 48 关只有 general/speed/puzzle（inspect 对关卡类型有断言），dark 星碑永不绘制；
 *    底座例外——`templeTreeBake` 的 masks 表按四前缀静态取 `_Bkg_Mask0000`，dark 底座仍要保留。
 *  - Music/Fx/StoneButton 的 0000/0001 是开关与按压态；SettingsButton 只留 0002/0003
 *    （0000/0001 是原版旧齿轮，复刻直接用 0002 作静止帧）。 */
export const MENU_STAR_PREFIXES = ["Diamond", "DiamondSpeed", "DiamondPuzzle"];
export const MENU_MASK_PREFIXES = [...MENU_STAR_PREFIXES, "DiamondDark"];
export const MENU_FIXED = [
  "BackButton0000",
  "BackButton0001",
  "Lock0000",
  "MusicButton0000",
  "MusicButton0001",
  "FxButton0000",
  "FxButton0001",
  "Navy0000",
  "NewSign0000",
  "SettingsButton0002",
  "SettingsButton0003",
  "StoneButton0000",
  "StoneButton0001",
  ...MENU_STAR_PREFIXES.flatMap((p) => seq4(p, 0, 3)),
  ...MENU_MASK_PREFIXES.map((p) => `${p}_Bkg_Mask0000`),
];

/** 结算面板按关类型的帧集合（r29 拆张的唯一帧口径，生成器与静态网共用）：
 *  星碑 22 帧（0000 初始帧 + 1..21 三段动画）+ 该类型实际绘制的图标/箭头。
 *  puzzle 是两行布局（钻石行隐藏、银钻替代计时），不画 Diamonds/Time 图标；
 *  general/speed 三行全画。dark 在森林 48 关不存在（inspect 断言），归一到 general。 */
export const FINISH_STONE_PREFIX = { general: "FinishStone", speed: "FinishStoneSpeed", puzzle: "FinishStonePuzzle" };
export const POPUP_FINISH_TYPES = ["general", "speed", "puzzle"];
const FINISH_ICONS_COMMON = ["FinishIcon0000", "TickIcon0000", "CrossIcon0000", "popupArrow0000", "popupArrow0001"];
const FINISH_ICONS_PUZZLE = [...FINISH_ICONS_COMMON, "SilverIcon0000"];
const FINISH_ICONS_SCORED = [...FINISH_ICONS_COMMON, "DiamondsIcon0000", "TimeIcon0000"];
export function finishVariant(type) {
  return type === "speed" || type === "puzzle" ? type : "general";
}
export function popupFinishNeed(type) {
  const t = finishVariant(type);
  return [...seq4(FINISH_STONE_PREFIX[t], 0, 21), ...(t === "puzzle" ? FINISH_ICONS_PUZZLE : FINISH_ICONS_SCORED)];
}

/**
 * 允许清零的帧。families 是森林 48 关根本不解析的机制族（level2.ts 里没有对应字段或在注释里
 * 标明森林未用）；exact 是逐个裁定的零消费帧。FinishStone 整族按前缀清零：r29 起星碑（含
 * general/speed/puzzle 三种与永不出现的 dark）全部搬进按关类型的 PopupFinish 图集，主图集
 * 一个星碑帧都不留；图标/箭头同理（结算板的消费点改用 PopupFinish 键）。
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
    families: ["FinishStone"],
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
      "FinishIcon0000",
      "DiamondsIcon0000",
      "SilverIcon0000",
      "TimeIcon0000",
      "TickIcon0000",
      "CrossIcon0000",
      "popupArrow0000",
      "popupArrow0001",
    ],
  },
  menu: {
    // 原版设置/触屏控制 UI 族，复刻的 SettingsScene 只用 Music/Fx 双开关，无这些控件
    families: ["BackButtonFull", "ToggleControlButtonDual", "ToggleControlButtonSingle", "ToggleSingleScreen"],
    exact: [
      "GoldLock0000", // 原版付费锁；森林进度锁只用 Lock0000
      "MuteButton0000",
      "MuteButton0001", // 静音在设置面板用 FxButton 表达
      "SettingsButton0000",
      "SettingsButton0001", // 旧齿轮两帧；MenuScene 直接用 0002/0003
      "DiamondDark0000", // 森林无 dark 关（inspect 断言类型只有 general/speed/puzzle）
      "DiamondDark0001",
      "DiamondDark0002",
      "DiamondDark0003", // 底座 DiamondDark_Bkg_Mask0000 例外：树烘焙静态取四前缀
      "UnlockButton0000",
      "VibrateButton0000",
      "VibrateButton0001",
      "_default0000", // Phaser 缺帧兜底帧，任何上屏都算 bug
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
  // ── 弹窗（主图集：暂停键/板底/彩带）──
  { file: "packages/client/src/scenes/GameScene.ts", has: 'ATLAS_POPUP, "PauseButton0000"' },
  { file: "packages/client/src/scenes/overlays.ts", has: '"PopupBackground0000"', min: 2 },
  { file: "packages/client/src/scenes/menus.ts", has: "Confetti${String(i % 4).padStart(4, \"0\")}" },
  // ── 弹窗（r29 结算图集：图标/箭头/星碑）──
  { file: "packages/client/src/scenes/overlays.ts", has: 'row.ok ? "TickIcon0000" : "CrossIcon0000"' },
  { file: "packages/client/src/scenes/overlays.ts", has: 'd.type === "puzzle" ? "SilverIcon0000" : "TimeIcon0000"' },
  { file: "packages/client/src/scenes/overlays.ts", has: 'icon: "DiamondsIcon0000"' },
  { file: "packages/client/src/scenes/overlays.ts", has: "const stonePrefix = finishStonePrefix(d.type)" },
  { file: "packages/client/src/scenes/overlays.ts", has: "const stoneKey = finishStoneAnimKey(d.type, stars)" },
  { file: "packages/client/src/scenes/overlays.ts", has: "stonePrefix + \"0000\"" },
  { file: "packages/client/src/scenes/overlays.ts", has: 'uiAtlas, "popupArrow0000"' },
  { file: "packages/client/src/scenes/overlays.ts", has: 'arrow.setFrame("popupArrow0001")' },
  { file: "packages/client/src/scenes/overlays.ts", has: "loadPopupFinish(this.load, this.result().type)" },
  { file: "packages/client/src/scenes/overlays.ts", has: "buildFinishAnims(this, d.type)" },
  { file: "packages/client/src/scenes/GameScene.ts", has: "this.kickPopupFinish()" },
  { file: "packages/client/src/scenes/BootScene.ts", has: 'seq(`finish_stone_${tag}1`, key, base, 1, 7, 30, 0)' },
  { file: "packages/client/src/scenes/BootScene.ts", has: 'seq(`finish_stone_${tag}3`, key, base, 15, 21, 30, 0)' },
  { file: "packages/client/src/scenes/BootScene.ts", has: 'file: "PopupFinishGeneral"' },
  { file: "packages/client/src/scenes/BootScene.ts", has: 'file: "PopupFinishSpeed"' },
  { file: "packages/client/src/scenes/BootScene.ts", has: 'file: "PopupFinishPuzzle"' },
  // ── 菜单图集（r31：选关大厅/设置/暂停板）──
  { file: "packages/client/src/scenes/TempleScene.ts", has: 'type === "speed" ? "DiamondSpeed" : type === "puzzle" ? "DiamondPuzzle" : type === "dark" ? "DiamondDark" : "Diamond"' },
  { file: "packages/client/src/scenes/TempleScene.ts", has: '`${prefixOf(lv.type)}${String(Math.min(stars, 3)).padStart(4, "0")}`' },
  { file: "packages/client/src/scenes/TempleScene.ts", has: 'menuTex.get(`${prefix}_Bkg_Mask0000`)' },
  { file: "packages/client/src/scenes/TempleScene.ts", has: '`${prefixOf(lv.type)}_Bkg_Mask0000`', min: 2 },
  { file: "packages/client/src/scenes/TempleScene.ts", has: '(["Diamond", "DiamondSpeed", "DiamondPuzzle", "DiamondDark"] as const)' },
  { file: "packages/client/src/scenes/TempleScene.ts", has: 'ATLAS_MENU, "Lock0000"' },
  { file: "packages/client/src/scenes/TempleScene.ts", has: 'ATLAS_MENU, "NewSign0000"' },
  { file: "packages/client/src/scenes/TempleScene.ts", has: 'ATLAS_MENU, "BackButton0000"' },
  { file: "packages/client/src/scenes/TempleScene.ts", has: 'back.setFrame("BackButton0001")' },
  { file: "packages/client/src/scenes/TempleScene.ts", has: 'back.setFrame("BackButton0000")', min: 2 },
  { file: "packages/client/src/scenes/MenuScene.ts", has: 'ATLAS_MENU, "Navy0000"' },
  { file: "packages/client/src/scenes/MenuScene.ts", has: 'ATLAS_MENU, "SettingsButton0002"' },
  { file: "packages/client/src/scenes/MenuScene.ts", has: 'gear.setFrame("SettingsButton0003")' },
  { file: "packages/client/src/scenes/MenuScene.ts", has: 'gear.setFrame("SettingsButton0002")', min: 2 },
  { file: "packages/client/src/scenes/GameScene.ts", has: 'ATLAS_MENU, "Navy0000"' },
  { file: "packages/client/src/scenes/overlays.ts", has: 'ATLAS_MENU, "StoneButton0000"' },
  { file: "packages/client/src/scenes/overlays.ts", has: 'btn.setFrame("StoneButton0001")' },
  { file: "packages/client/src/scenes/overlays.ts", has: 'btn.setFrame("StoneButton0000")', min: 2 },
  { file: "packages/client/src/scenes/menus.ts", has: 'ATLAS_MENU, `${label}Button${getSettings()[key] ? "0000" : "0001"}`' },
  { file: "packages/client/src/scenes/menus.ts", has: 'img.setFrame(`${label}Button${next[key] ? "0000" : "0001"}`)' },
  { file: "packages/client/src/scenes/menus.ts", has: 'toggleRow(CY0() - 60, "Music", "music", "音乐")' },
  { file: "packages/client/src/scenes/menus.ts", has: 'toggleRow(CY0() + 60, "Fx", "fx", "音效")' },
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
 * 类型面断言：48 关只允许结算图集的三种类型（general/speed/puzzle）；第四种出现时
 * FinishStone* 的拆张口径需重新裁定——直接抛。
 */
export async function inspect(root = REPO_ROOT) {
  verifyPins(root);
  const { levels, doorFrames } = await loadLevels(root);
  const types = new Set(levels.map((l) => l.type));
  const unknownTypes = [...types].filter((t) => !POPUP_FINISH_TYPES.includes(t));
  if (unknownTypes.length) {
    throw new Error(`atlas-slim：关卡类型出现 ${unknownTypes.join(",")}——结算图集只有 ${POPUP_FINISH_TYPES.join("/")} 三张，需重新裁定`);
  }
  const keep = {
    mech: new Set(MECH_FIXED),
    temple: new Set([...TEMPLE_FIXED, ...seq4("FinishBoy", 1, doorFrames), ...seq4("FinishGirl", 1, doorFrames)]),
    popup: new Set(POPUP_EARLY),
    menu: new Set(MENU_FIXED),
  };
  for (const l of levels) {
    const m = mechNeed(l.parsed);
    for (const n of [...m.first, ...m.event]) keep.mech.add(n);
    for (const n of l.decor) keep.temple.add(n);
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
