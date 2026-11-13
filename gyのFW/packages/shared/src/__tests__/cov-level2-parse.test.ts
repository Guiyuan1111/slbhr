import { describe, expect, it } from "vitest";
import { parseLevel, type LevelData, type TilesetProvider } from "../level2.js";

/**
 * level2 解析分支补测（fw-cov 批）：合成 Tiled JSON 直打解析分支——
 * Tiled 1.x 数组式归一化（tiles[].properties 折叠 + WeakMap 快照）、refOf/resolveGid
 * 抛错、Chars 未知类型、slider/Objects-wind/灯光 BoxedDevice 族/箱镜/定时推杆/仙女杯、
 * LargeObjects portal 与未知类型、教学 stepId<0、出生点/门终检。
 * 中心矫正期望值 = 注释内手工旋转矩阵推导（θ=−rot·π/180，非实现复读）；
 * 非 0/45 整倍角坐标一律 toBeCloseTo（JS cos(−π/2)=6.1e-17 ε）。
 */

// ---- 图块集（老式 A–E 字典态） ----

function groundTs() {
  // Ground firstgid 1：local0=SOLID、local5=WATER、local6=LAVA
  return { tilewidth: 32, tileproperties: { "0": { type: "0" }, "5": { type: "5" }, "6": { type: "6" } } };
}

function charsTs() {
  // Chars firstgid 16：local0=char、local1=door、local2=diamond、local9=未知
  return { tiles: { "0": { type: "char" }, "1": { type: "door" }, "2": { type: "diamond" }, "9": { type: "mystery" } } };
}

function objectsTs() {
  // Objects firstgid 32：机关/灯光全谱
  return {
    tiles: {
      "0": { type: "pusher" },
      "1": { type: "lever" },
      "2": { type: "box" },
      "3": { type: "ball" },
      "4": { type: "wind" },
      "5": { type: "beamer" },
      "6": { type: "rotmirror" },
      "7": { type: "lightpusher" },
      "8": { type: "infinitemirror" },
      "9": { type: "boxmirror" },
      "10": { type: "timedpusher" },
      "11": { type: "fairycup" },
    },
  };
}

function largeTs() {
  // LargeObjects firstgid 64：local0=wind、local1=portal、local2=未知
  return { tiles: { "0": { type: "wind" }, "1": { type: "portal" }, "2": { type: "deco" } } };
}

const TILESETS: Record<string, unknown> = {
  Ground: groundTs(),
  Chars: charsTs(),
  Objects: objectsTs(),
  LargeObjects: largeTs(),
};

/** provider：按 source 文件名取图块集；未登记 → null（provider-null 分支用） */
const prov: TilesetProvider = (s) => {
  const base = s.slice(s.lastIndexOf("/") + 1, s.lastIndexOf("."));
  return TILESETS[base] ?? null;
};

// ---- 关卡 JSON 骨架 ----

const COLS = 20;
const ROWS = 10;

function tilesets(refs: Array<[string, number]> = [["Ground", 1], ["Chars", 16], ["Objects", 32], ["LargeObjects", 64]]) {
  return refs.map(([base, firstgid]) => ({ source: `${base}.json`, firstgid }));
}

function groundLayer(data: number[] = []) {
  const full = data.slice();
  while (full.length < COLS * ROWS) full.push(0);
  return { type: "tilelayer", name: "Ground", width: COLS, height: ROWS, data: full };
}

/** 标准出生层：fb/wg 角色与双门（过终检最小集） */
function charsLayer() {
  return {
    type: "objectgroup",
    name: "Chars",
    objects: [
      { id: 1, gid: 16, x: 64, y: 256, width: 64, height: 64, properties: { char: "fb" } },
      { id: 2, gid: 16, x: 64, y: 192, width: 64, height: 64, properties: { char: "wg" } },
      { id: 3, gid: 17, x: 512, y: 128, width: 64, height: 64, properties: { char: "fb" } },
      { id: 4, gid: 17, x: 640, y: 128, width: 64, height: 64, properties: { char: "wg" } },
    ],
  };
}

function mkLevel(layers: any[], refs?: Array<[string, number]>) {
  return { width: COLS, height: ROWS, tilewidth: 32, layers, tilesets: tilesets(refs) };
}

function parse(json: any, provider: TilesetProvider = prov, id = "synth"): LevelData {
  return parseLevel(id, json, provider);
}

describe("level2 解析：引用与 gid 归属抛错", () => {
  it("缺 Ground 图块集引用 → refOf 抛「缺少图块集引用」", () => {
    const json = mkLevel([groundLayer()], [["Objects", 32]]);
    expect(() => parse(json)).toThrow(/缺少图块集引用: Ground/);
  });

  it("对象 gid 小于全部 firstgid → resolveGid 抛「不属于任何图块集」", () => {
    const json = mkLevel([
      groundLayer(),
      charsLayer(),
      { type: "objectgroup", name: "Objects", objects: [{ id: 9, gid: 0, x: 100, y: 100, width: 64, height: 64 }] },
    ]);
    // gid 0 小于最小 firstgid(1) → 无归属
    expect(() => parse(json)).toThrow(/gid 0 不属于任何图块集/);
  });
});

describe("level2 解析：Tiled 1.x 数组式归一化（F 部格式）", () => {
  it("tiles[].properties 折叠进 tileproperties 供 mergedProps；原始数组零突变", () => {
    const chars: any = {
      tiles: [
        { id: 0, type: "char", properties: [{ name: "char", type: "string", value: "fb" }] },
        { id: 1, type: "door", properties: [{ name: "char", value: "wg" }] },
      ],
    };
    const map: Record<string, unknown> = { Ground: groundTs(), Chars: chars, Objects: objectsTs(), LargeObjects: largeTs() };
    const p: TilesetProvider = (s) => map[s.slice(s.lastIndexOf("/") + 1, s.lastIndexOf("."))] ?? null;
    // 对象属性也是数组式（Tiled 1.x）：解析入口 propsToObj 展平
    const json = mkLevel([
      groundLayer(),
      {
        type: "objectgroup",
        name: "Chars",
        objects: [
          { id: 1, gid: 16, x: 64, y: 256, width: 64, height: 64, properties: [{ name: "char", value: "fb" }] },
          { id: 2, gid: 16, x: 64, y: 192, width: 64, height: 64, properties: [{ name: "char", value: "wg" }] },
          { id: 3, gid: 16, x: 128, y: 192, width: 64, height: 64, properties: [{ name: "char", value: "wg" }] },
          { id: 4, gid: 17, x: 512, y: 128, width: 64, height: 64, properties: [{ name: "char", value: "fb" }] },
          { id: 5, gid: 17, x: 640, y: 128, width: 64, height: 64, properties: [{ name: "char", value: "wg" }] },
        ],
      },
    ]);
    const L = parse(json, p);
    expect(L.spawn.fireboy).toEqual({ x: 96, y: 256 });
    expect(L.spawn.watergirl).toEqual({ x: 160, y: 192 });
    expect(L.doors.watergirl).toEqual({ x: 640, y: 64, w: 64, h: 64 });
    // 归一化写在浅拷贝上：原始图块集的列表态原样保留（幂等前提）
    expect(Array.isArray(chars.tiles)).toBe(true);
  });

  it("WeakMap 快照：同图块集对象二次解析命中缓存（改写原数组不影响已归一产物）", () => {
    const chars: any = { tiles: [{ id: 0, type: "char" }, { id: 1, type: "door" }] };
    const map: Record<string, unknown> = { Ground: groundTs(), Chars: chars, Objects: objectsTs(), LargeObjects: largeTs() };
    const p: TilesetProvider = (s) => map[s.slice(s.lastIndexOf("/") + 1, s.lastIndexOf("."))] ?? null;
    const L1 = parse(mkLevel([groundLayer(), charsLayer()]), p);
    expect(L1.spawn.fireboy.x).toBe(96);
    // 破坏性改写原始数组后重解析：若未命中 WeakMap 快照，char 会变未知类型 → 出生点缺失抛错
    chars.tiles = [{ id: 0, type: "mystery" }];
    const L2 = parse(mkLevel([groundLayer(), charsLayer()]), p);
    expect(L2.spawn.fireboy.x).toBe(96);
  });
});

describe("level2 解析：Chars 层类型谱", () => {
  it("钻石四色映射（含未配 char 兜底 red）", () => {
    const json = mkLevel([
      groundLayer(),
      charsLayer(),
      {
        type: "objectgroup",
        name: "Chars",
        objects: [
          { id: 11, gid: 18, x: 300, y: 300, width: 64, height: 64, properties: { char: "silver" } },
          { id: 12, gid: 18, x: 400, y: 300, width: 64, height: 64, properties: { char: "fbwg" } },
          { id: 13, gid: 18, x: 500, y: 300, width: 64, height: 64, properties: { char: "???" } },
        ],
      },
    ]);
    const L = parse(json);
    // 钻石中心 = 底边矩形中心 (x+32, y−32)
    expect(L.diamonds).toEqual([
      { id: "d0", kind: "silver", x: 332, y: 268 },
      { id: "d1", kind: "fbwg", x: 432, y: 268 },
      { id: "d2", kind: "red", x: 532, y: 268 },
    ]);
  });

  it("未知类型记入 unknown；无 gid 空对象容忍", () => {
    const json = mkLevel([
      groundLayer(),
      charsLayer(),
      {
        type: "objectgroup",
        name: "Chars",
        objects: [
          { id: 21, gid: 25, x: 0, y: 0, width: 64, height: 64 }, // local9=未知类型
          { id: 22, x: 10, y: 10 }, // 无 gid
        ],
      },
    ]);
    const L = parse(json);
    expect(L.unknown).toContain("Chars:未知类型 local=9 type=mystery");
    expect(L.unknown).toContain("Chars:空对象 id=22");
  });
});

describe("level2 解析：Objects 非 gid 对象谱", () => {
  it("slider：轨宽=polyline 两端 x 差，体心=起点+半宽", () => {
    const json = mkLevel([
      groundLayer(),
      charsLayer(),
      {
        type: "objectgroup",
        name: "Objects",
        objects: [
          {
            id: 31,
            type: "slider",
            x: 128,
            y: 300,
            polyline: [{ x: 0, y: 0 }, { x: 192, y: 0 }],
            properties: { group: 7, max: 2 },
          },
        ],
      },
    ]);
    const L = parse(json);
    expect(L.sliders).toEqual([{ id: "S0", x: 224, y: 300, group: 7, max: 2, widthPx: 192 }]);
  });

  it("未知 type 记入 unknown", () => {
    const json = mkLevel([
      groundLayer(),
      charsLayer(),
      { type: "objectgroup", name: "Objects", objects: [{ id: 32, type: "mysteryBox", x: 0, y: 0 }] },
    ]);
    expect(parse(json).unknown).toContain("Objects:type=mysteryBox");
  });
});

describe("level2 解析：Objects gid 机关谱（灯光 BoxedDevice 族）", () => {
  const layer = (objects: any[]) => ({ type: "objectgroup", name: "Objects", objects });

  it("wind（Objects）：group/length/initialState/windWidth 属性合并", () => {
    const json = mkLevel([
      groundLayer(),
      charsLayer(),
      layer([{ id: 41, gid: 36, x: 100, y: 164, width: 64, height: 64, rotation: -90, properties: { group: 3, length: 12, initialState: 1, windWidth: 2.5 } }]),
    ]);
    const L = parse(json);
    // 图块对象 y 底边 → rect 顶边 y=100；风向取对象 rotation 字段
    expect(L.winds[0]).toMatchObject({ group: 3, rotation: -90, lengthM: 12, initialState: 1, windWidth: 2.5, rect: { x: 100, y: 100, w: 64, h: 64 } });
  });

  it("beamer/rotmirror/lightpusher/infinitemirror：中心矫正按尺寸 2 / 1.8", () => {
    const json = mkLevel([
      groundLayer(),
      charsLayer(),
      layer([
        // beamer 2×2：rot 0 → e=(32,32) → (x+32, y−32)
        { id: 51, gid: 37, x: 200, y: 262, width: 64, height: 64, properties: { group: 1, color: "blue", initialState: 1 } },
        // rotmirror 1.8：rot 45 → e=(28.8·√2, ~0) → (x+40.73, y)
        { id: 52, gid: 38, x: 400, y: 300, width: 64, height: 64, rotation: 45, properties: { group: 2, dir: -1, bringToBack: true } },
        // lightpusher 2×2：rot 90 → e=(~32, ~−32) → (x+32, y+32)
        { id: 53, gid: 39, x: 600, y: 300, width: 64, height: 64, rotation: 90, properties: { group: 4, color: "red" } },
        // infinitemirror 1.8：rot 0 → e=(28.8,28.8) → (x+28.8, y−28.8)
        { id: 54, gid: 40, x: 800, y: 300, width: 64, height: 64, properties: { group: 5 } },
      ]),
    ]);
    const L = parse(json);
    // 矫正锚是对象 anchor 点（图块对象底边中点）：rot 0 时 (x+32, y−32) 恰为图块中心
    expect(L.beamers).toEqual([{ id: "L0", x: 232, y: 230, rotation: 0, group: 1, color: "blue", initialState: 1 }]);
    expect(L.rotMirrors[0]).toMatchObject({ rotation: 45, group: 2, dir: -1, bringToBack: true });
    expect(L.rotMirrors[0].x).toBeCloseTo(400 + 28.8 * Math.SQRT2, 3);
    expect(L.rotMirrors[0].y).toBeCloseTo(300, 6);
    expect(L.lightPushers[0].x).toBeCloseTo(632, 6);
    expect(L.lightPushers[0].y).toBeCloseTo(332, 6);
    expect(L.lightPushers[0]).toMatchObject({ rotation: 90, group: 4, color: "red" });
    expect(L.infiniteMirrors).toEqual([{ id: "M0", x: 828.8, y: 271.2, rotation: 0, group: 5 }]);
  });

  it("boxmirror：boxSize/friction 可选（有/无两态），矫正恒 2×2", () => {
    const json = mkLevel([
      groundLayer(),
      charsLayer(),
      layer([
        { id: 61, gid: 41, x: 100, y: 164, width: 64, height: 64, properties: { boxSize: 3, friction: 0.4 } },
        { id: 62, gid: 41, x: 300, y: 164, width: 64, height: 64 },
      ]),
    ]);
    const L = parse(json);
    // 恒 2×2 矫正：rot 0 → (x+32, y−32)，锚=对象底边点 y=164
    expect(L.boxMirrors[0]).toEqual({ id: "B0", x: 132, y: 132, rotation: 0, boxSize: 3, friction: 0.4 });
    expect(L.boxMirrors[1]).toEqual({ id: "B1", x: 332, y: 132, rotation: 0, boxSize: undefined, friction: undefined });
  });

  it("timedpusher 与 fairycup：BoxedDevice 矫正 + 杯口取底边矩形中心", () => {
    const json = mkLevel([
      groundLayer(),
      charsLayer(),
      layer([
        { id: 71, gid: 42, x: 100, y: 164, width: 64, height: 64, properties: { group: 6, time: 1500 } },
        { id: 72, gid: 43, x: 300, y: 164, width: 64, height: 64, properties: { group: 41 } },
      ]),
    ]);
    const L = parse(json);
    expect(L.timedPushers).toEqual([{ id: "t0", x: 132, y: 132, rotation: 0, group: 6, time: 1500 }]);
    // 杯走 centerOf 口径（与 BoxedDevice rot0 等值）
    expect(L.fairyCups).toEqual([{ id: "fc0", x: 332, y: 132, group: 41 }]);
  });

  it("provider 返回 null → typeName 空串走 default，记 unknown", () => {
    const nullProv: TilesetProvider = (s) => (s.includes("Objects") ? null : prov(s));
    const json = mkLevel([groundLayer(), charsLayer(), layer([{ id: 81, gid: 32, x: 0, y: 64, width: 64, height: 64 }])]);
    expect(parse(json, nullProv).unknown).toContain("Objects:local0");
  });
});

describe("level2 解析：LargeObjects 谱", () => {
  // 实库口径：层名恒 "Objects"，gid 归属 LargeObjects 图块集（forest_03 风区同款）
  const layer = (objects: any[]) => ({ type: "objectgroup", name: "Objects", objects });

  it("portal：半尺寸 (32,48) 旋转矫正 + inverted/portalId", () => {
    const json = mkLevel([
      groundLayer(),
      charsLayer(),
      layer([
        // rot 90：ex≈48、ey≈−32 → (x+48, y+32)
        { id: 91, gid: 65, x: 200, y: 300, width: 128, height: 64, rotation: 90, properties: { group: 1, portalId: 3, inverted: true, initialState: 1 } },
      ]),
    ]);
    const L = parse(json);
    expect(L.portals[0]).toMatchObject({ rect: { x: 200, y: 236, w: 128, h: 64 }, rotation: 90, group: 1, portalId: 3, inverted: true, initialState: 1 });
    expect(L.portals[0].x).toBeCloseTo(248, 6);
    expect(L.portals[0].y).toBeCloseTo(332, 6);
  });

  it("LargeObjects 未知类型记入 unknown", () => {
    const json = mkLevel([groundLayer(), charsLayer(), layer([{ id: 92, gid: 66, x: 0, y: 64, width: 64, height: 64 }])]);
    expect(parse(json).unknown).toContain("LargeObjects:deco");
  });
});

describe("level2 解析：教学层与终检", () => {
  it("stepId<0 的教学对象跳过；text/trigger 按 id 配对", () => {
    const json = mkLevel([
      groundLayer(),
      charsLayer(),
      {
        type: "objectgroup",
        name: "Tutorial_keyboard",
        objects: [
          { id: 101, x: 0, y: 0, width: 64, height: 64 }, // 无 properties.id → 跳过
          { id: 102, x: 10, y: 10, width: 100, height: 50, properties: { id: 0 } },
          { id: 103, x: 40, y: 40, width: 200, height: 30, properties: { id: 0 }, text: { text: "请用方向键", halign: "center" } },
        ],
      },
    ]);
    const L = parse(json);
    expect(L.tutorials.length).toBe(1);
    expect(L.tutorials[0].id).toBe(0);
    expect(L.tutorials[0].trigger).toEqual({ x: 10, y: 10, w: 100, h: 50 });
    expect(L.tutorials[0].text).toBe("请用方向键");
    expect(L.tutorials[0].textRect).toEqual({ x: 40, y: 40, w: 200, h: 30 });
    expect(L.tutorials[0].textItems[0]).toMatchObject({ halign: "center", x: 40, y: 40, width: 200 });
    expect(L.tutorialVariants.Tutorial_keyboard.length).toBe(1);
  });

  it("无 Chars 层 → 出生点缺失抛错", () => {
    expect(() => parse(mkLevel([groundLayer()]))).toThrow(/出生点缺失/);
  });

  it("双角色俱全但无门 → 缺少出生门抛错", () => {
    const noDoors = charsLayer();
    noDoors.objects = noDoors.objects.slice(0, 2); // 只留 fb/wg 角色
    const json = mkLevel([groundLayer(), noDoors]);
    expect(() => parse(json)).toThrow(/缺少 fireboy 出生门/);
  });
});
