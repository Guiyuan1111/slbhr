/**
 * F 部 fairytales 客户端渲染纯逻辑（fw-fairy-view 槽，照 gameGuards.ts 先例抽离：
 * 不依赖 DOM/Phaser，node 环境可直测）。
 *
 * 事实源：note/evidence/2026-10-30-fairytales/01号档 §2 与 oracle F fairy-tales.min.js
 * （Fairy L58979 / FairyCup L53157 / Device groupColors L52418 区 / BackgroundCover L1696081）。
 */
import type { TempleKey } from "../templeData";

// ---------------------------------------------------------------- 取色

/**
 * oracle F 部 Device.groupColors（fairy-tales.min.js L52418 区字证：
 * `c.groupColors = {1:"#ee6633",2:"#55ee22",3:"#57beff",4:"#ffee44",5:"#EC0EF1",
 * 6:"#88dddd",7:"#9933FF"}`）——F 部全设备灯层与仙女 tint 的唯一取色表。
 * 与 A–E 部标准表（1:#ff0000/2:#00cc00/3:#0D3EFF…，四部 bundle 逐一字证一致）不同。
 */
export const FAIRY_GROUP_COLORS: Record<number, number> = {
  1: 0xee6633,
  2: 0x55ee22,
  3: 0x57beff,
  4: 0xffee44,
  5: 0xec0ef1,
  6: 0x88dddd,
  7: 0x9933ff,
};

/** A–E 部共享组色表（原 GameScene.GROUP_COLORS，迁移至此保持单一事实源） */
export const SHARED_GROUP_COLORS: Record<number, number> = {
  1: 0xff0000,
  2: 0x00cc00,
  3: 0x0d3eff,
  4: 0xffff00,
  5: 0xec0ef1,
  6: 0x57beff,
  7: 0x9933ff,
};

/**
 * 设备/仙女取色（oracle Device.getColor/getColorIndex 字证）：组号取**首位数字**
 * 入表，0 或缺省=白。fairytales 庙走 F 部表，其余庙走共享表。
 */
export function deviceTintOf(temple: TempleKey, group: number): number {
  const table = temple === "fairytales" ? FAIRY_GROUP_COLORS : SHARED_GROUP_COLORS;
  return table[Number(String(group)[0])] ?? 0xffffff;
}

// ---------------------------------------------------------------- cover

/** cover 纯视觉矩形（oracle States/Level/Devices/BackgroundCover：32×32 黑帧拉伸到对象矩形） */
export interface CoverRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * 从关卡原始 JSON 提取 Objects 层 type=cover 对象（纯视觉，物理零语义——20 号档 §cover）。
 * Tiled 1.x 归一化数据把 tile type 抄写进 object.type（fairies_000/elements 全量普查
 * 逐文件实证，o.type 直接可读），不依赖外部图块集回查。level2 解析不收（shared 禁改，
 * 落 unknown 计数不碍服务端），仅 main.ts 在 fetchLevel 时顺带提取注入 GameInit。
 */
export function extractCovers(json: unknown): CoverRect[] {
  const out: CoverRect[] = [];
  const layers = (json as { layers?: unknown } | null)?.layers;
  if (!Array.isArray(layers)) return out;
  for (const layer of layers) {
    const lo = layer as { type?: unknown; name?: unknown; objects?: unknown };
    if (String(lo.type) !== "objectgroup" || String(lo.name) !== "Objects") continue;
    if (!Array.isArray(lo.objects)) continue;
    for (const o of lo.objects) {
      const oo = o as { type?: unknown; x?: unknown; y?: unknown; width?: unknown; height?: unknown };
      if (String(oo.type) !== "cover") continue;
      out.push({ x: Number(oo.x) || 0, y: Number(oo.y) || 0, w: Number(oo.width) || 0, h: Number(oo.height) || 0 });
    }
  }
  return out;
}

// ---------------------------------------------------------------- 拖拽命中

/** 房间快照 fairy 条目（状态契约：ArraySchema<{id,x,y,group,locked}>，x/y=屏幕 px 同 BodyState 口径） */
export interface FairySnap {
  id: string;
  x: number;
  y: number;
  group: number;
  locked: boolean;
}

/** 房间快照 fairyCup 条目（状态契约：ArraySchema<{id,state}>） */
export interface FairyCupSnap {
  id: string;
  state: number;
}

/** fairydrag 上行消息载荷（x=null=松手；服务端按 x==null 判释放） */
export interface FairyDragMsg {
  id: string;
  x: number | null;
  y: number | null;
}

/**
 * 拖拽命中：距指针 (px,py) ≤ radius 的最近仙女 id，无命中返回 null。
 * 命中半径 136px（oracle hitArea=2×身高≈136px 字证，2026-10-31 用户裁定跟原版口径）；
 * R1：oracle 拖拽无 locked 物理门控（锁定只门控相机 focus 与教学矩形，
 * L59692/L61934），此处亦不按 locked 过滤。
 */
/** oracle Phaser.Color.interpolateColor(groupColor, 0xFFFFFF, 5, 3)：
 *  组色向白插值 k∈[0,1]（尾迹粒子色，3/5=0.6） */
export function lerpColorTowardWhite(color: number, k: number): number {
  const r = (color >> 16) & 0xff;
  const g = (color >> 8) & 0xff;
  const b = color & 0xff;
  const m = (c: number): number => Math.round(c + (255 - c) * k);
  return (m(r) << 16) | (m(g) << 8) | m(b);
}

export function pickFairy(items: ReadonlyArray<{ id: string; x: number; y: number }>, px: number, py: number, radius: number): string | null {
  let best: string | null = null;
  let bestD = radius * radius;
  for (const it of items) {
    const d = (it.x - px) * (it.x - px) + (it.y - py) * (it.y - py);
    if (d < bestD) {
      bestD = d;
      best = it.id;
    }
  }
  return best;
}
