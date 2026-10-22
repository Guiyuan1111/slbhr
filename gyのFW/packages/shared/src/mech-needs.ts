/**
 * r30：MechAssets 按关子集的唯一口径（生成器、客户端装载、静态网共用）。
 *
 * 图集帧的绝对坐标不能动（r26 的原地清零口径）：变体仍在 2048² 画布上、帧矩形与 Slim
 * 逐字节相同，只把本关不消费的帧矩形清零。变体 id 由帧集合内容决定，客户端按解析后的
 * 关卡数据当场算出，无需清单文件——生成器与运行时走同一个函数，口径漂移会直接对不上文件。
 *
 * 风区 34 帧是唯一"按关"的固定面：buildGameAnims 原本无条件注册 wind_base/wind_effect，
 * 只有 15 个风关卡真正绘制；r30 起非风关不装这 34 帧（110.2KB），动画注册也改为按关。
 */
import type { LevelData } from "./level2.js";

const pad4 = (n: number) => String(n).padStart(4, "0");
const seq4 = (prefix: string, start: number, end: number) =>
  Array.from({ length: end - start + 1 }, (_, i) => `${prefix}${pad4(i + start)}`);

/** 风区动画帧（有风关卡才装；动画键 wind_base/wind_effect 同帧集） */
export const MECH_WIND_FIXED = [...seq4("wind_base", 0, 3), ...seq4("wind_effect", 0, 29)];

/** 零机关关卡的占位帧：变体仍需要一张合法纹理（2048² 画布、1×1 全透明），
 *  避免「键不存在」在下游以缺纹理形式暴露。 */
export const MECH_EMPTY_FRAME = "mech_empty0000";

export type MechLevel = Pick<
  LevelData,
  "levers" | "pushers" | "boxes" | "balls" | "platforms" | "hangings" | "pulleys" | "romans" | "winds" | "windows"
>;

/** 机关帧：首帧 + 事件帧（施法/亮灯/开门动画），按关卡字段取（GameScene.buildMechs 的消费面） */
export function mechNeed(level: MechLevel): { first: string[]; event: string[] } {
  const first: string[] = [];
  const event: string[] = [];
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

/** 本关 MechAssets 变体需要的全部帧（排序去重）。风区动画帧只给有风关卡；
 *  零机关关卡返回占位帧。生成器按同一函数决定每张变体的 PNG/JSON 内容。 */
export function mechAtlasFrames(level: MechLevel): string[] {
  const { first, event } = mechNeed(level);
  const frames = new Set<string>([...(level.winds.length ? MECH_WIND_FIXED : []), ...first, ...event]);
  if (!frames.size) frames.add(MECH_EMPTY_FRAME);
  return [...frames].sort();
}

/** FNV-1a 32bit：帧集合（排序后以换行连接）→ 8 位十六进制变体 id。
 *  生成器与运行时共用；不同集合撞同一 id 会在生成器里直接断言失败。 */
export function mechVariantId(level: MechLevel): string {
  const s = mechAtlasFrames(level).join("\n");
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}
