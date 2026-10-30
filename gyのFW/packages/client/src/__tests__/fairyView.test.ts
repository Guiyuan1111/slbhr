/**
 * F 部 fairytales 客户端渲染纯逻辑单测（fw-fairy-view 槽）：
 * 取色表对 oracle 字证、cover 提取对真数据 fairies_000、拖拽命中几何。
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { deviceTintOf, extractCovers, FAIRY_GROUP_COLORS, pickFairy, SHARED_GROUP_COLORS } from "../scenes/fairyView";

/** repo 根（__tests__ → src → client → packages → gyのFW） */
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../../..");

describe("deviceTintOf 组色（oracle F Device.groupColors L52418 区字证）", () => {
  it("F 部表与 oracle hex 逐值一致", () => {
    // oracle 字面：1:"#ee6633" 2:"#55ee22" 3:"#57beff" 4:"#ffee44" 5:"#EC0EF1" 6:"#88dddd" 7:"#9933FF"
    expect(FAIRY_GROUP_COLORS).toEqual({
      1: 0xee6633,
      2: 0x55ee22,
      3: 0x57beff,
      4: 0xffee44,
      5: 0xec0ef1,
      6: 0x88dddd,
      7: 0x9933ff,
    });
  });

  it("A–E 共享表与四部 bundle 字证一致（1:#ff0000 3:#0D3EFF 6:#57beff…）", () => {
    expect(SHARED_GROUP_COLORS[1]).toBe(0xff0000);
    expect(SHARED_GROUP_COLORS[2]).toBe(0x00cc00);
    expect(SHARED_GROUP_COLORS[3]).toBe(0x0d3eff);
    expect(SHARED_GROUP_COLORS[4]).toBe(0xffff00);
    expect(SHARED_GROUP_COLORS[5]).toBe(0xec0ef1);
    expect(SHARED_GROUP_COLORS[6]).toBe(0x57beff);
    expect(SHARED_GROUP_COLORS[7]).toBe(0x9933ff);
  });

  it("组号取首位数字（41→4）；0/缺省=白；F 部与共享表同组不同色", () => {
    expect(deviceTintOf("fairytales", 41)).toBe(0xffee44); // 首位 4 → #ffee44
    expect(deviceTintOf("forest", 41)).toBe(0xffff00); // 首位 4 → #ffff00
    expect(deviceTintOf("fairytales", 4)).not.toBe(deviceTintOf("forest", 4)); // 4 号色两表不同
    expect(deviceTintOf("fairytales", 0)).toBe(0xffffff);
    expect(deviceTintOf("forest", 0)).toBe(0xffffff);
    expect(deviceTintOf("fairytales", 99)).toBe(0xffffff); // 首位 9 不在表 → 白
  });
});

describe("extractCovers（真数据 fairies_000 + 健壮性）", () => {
  it("fairies_000 两处 cover 矩形逐字段命中", () => {
    const json = JSON.parse(readFileSync(join(ROOT, "data/tutorials/levels/fairies_000.json"), "utf-8"));
    expect(extractCovers(json)).toEqual([
      { x: 1024, y: 496, w: 112, h: 56 },
      { x: 728, y: 1056, w: 48, h: 88 },
    ]);
  });

  it("非 objectgroup/非 Objects 层与非 cover 类型全忽略；垃圾输入返回空", () => {
    expect(
      extractCovers({
        layers: [
          { type: "tilelayer", name: "Objects", objects: [{ type: "cover", x: 1, y: 1, width: 2, height: 2 }] },
          { type: "objectgroup", name: "Chars", objects: [{ type: "cover", x: 3, y: 3, width: 4, height: 4 }] },
          { type: "objectgroup", name: "Objects", objects: [{ type: "pusher", x: 5, y: 5, width: 6, height: 6 }] },
        ],
      }),
    ).toEqual([]);
    expect(extractCovers(null)).toEqual([]);
    expect(extractCovers({})).toEqual([]);
    expect(extractCovers({ layers: "nope" })).toEqual([]);
  });

  it("森林关（无 cover）提取为空数组", () => {
    const json = JSON.parse(readFileSync(join(ROOT, "data/forest/levels/forest_02.json"), "utf-8"));
    expect(extractCovers(json)).toEqual([]);
  });
});

describe("pickFairy 拖拽命中（40px 手感半径）", () => {
  const pts = [
    { id: "f0", x: 100, y: 100 },
    { id: "f1", x: 200, y: 200 },
  ];

  it("半径内取最近者；半径外返回 null", () => {
    expect(pickFairy(pts, 104, 103, 40)).toBe("f0");
    expect(pickFairy(pts, 190, 195, 40)).toBe("f1");
    expect(pickFairy(pts, 160, 160, 40)).toBeNull(); // 两仙各距 ~56px
    expect(pickFairy(pts, 141, 141, 40)).toBeNull(); // 恰在 40px 圆外（√2·29≈41）
    expect(pickFairy([], 100, 100, 40)).toBeNull();
  });

  it("不按 locked 过滤（R1：oracle 拖拽无锁定门控）", () => {
    const lockedPts = [{ id: "f0", x: 0, y: 0, locked: true }];
    expect(pickFairy(lockedPts, 5, 5, 40)).toBe("f0");
  });
});
