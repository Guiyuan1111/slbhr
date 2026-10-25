import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";
import { describe, expect, it } from "vitest";
import { GROUND_TYPE, liquidKindOf, parseLevel, type LevelData } from "../level2.js";

// packages/shared/src/__tests__ → 仓库根
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");

function makeProvider(baseDir: string) {
  const cache = new Map<string, any>();
  return (source: string) => {
    if (!cache.has(source)) {
      const p = new URL(source, `file:///${baseDir}/`).pathname.replace(/^\/([A-Za-z]:)/, "$1");
      cache.set(source, JSON.parse(readFileSync(decodeURI(p), "utf8")));
    }
    return cache.get(source);
  };
}

const cache = new Map<string, LevelData>();
function loadLevel(id: string): LevelData {
  if (!cache.has(id)) {
    const dir = id === "forest_01" ? `${ROOT}/data/tutorials/levels` : `${ROOT}/data/forest/levels`;
    const json = JSON.parse(readFileSync(`${dir}/${id}.json`, "utf8"));
    cache.set(id, parseLevel(id, json, makeProvider(dir)));
  }
  return cache.get(id)!;
}

function allLevelIds(): string[] {
  // 第二部 light 入库（2026-10-25）后 tutorials 目录含 light_01——本 describe 的
  // 48 关冒烟/直方图锚是 forest 战役权威扫描，枚举只认 forest_*，light 另立档锚。
  return [
    ...readdirSync(`${ROOT}/data/tutorials/levels`).filter((f) => f.endsWith(".json") && f.startsWith("forest_")),
    ...readdirSync(`${ROOT}/data/forest/levels`).filter((f) => f.endsWith(".json")),
  ].map((f) => f.replace(".json", ""));
}

describe("level2 解析（forest_01 教学关）", () => {
  const L = loadLevel("forest_01");

  it("尺寸 39×29、出生点在图块对象底边中点", () => {
    expect(L.cols).toBe(39);
    expect(L.rows).toBe(29);
    // Chars 层实证：fb (64,896 底边) → 底边中点 (96,896)；wg (64,768) → (96,768)
    expect(L.spawn.fireboy).toEqual({ x: 96, y: 896 });
    expect(L.spawn.watergirl).toEqual({ x: 96, y: 768 });
  });

  it("门为顶边矩形（y 已从底边换算）", () => {
    // fb 门 (1024,192 底边) → y=128；wg 门 (1136,192) → y=128
    expect(L.doors.fireboy).toEqual({ x: 1024, y: 128, w: 64, h: 64 });
    expect(L.doors.watergirl).toEqual({ x: 1136, y: 128, w: 64, h: 64 });
  });

  it("钻石：3 红 4 蓝、中心坐标", () => {
    expect(L.diamonds.filter((d) => d.kind === "red").length).toBe(3);
    expect(L.diamonds.filter((d) => d.kind === "blue").length).toBe(4);
    // 红钻 (338,112 底边) → 中心 (370,80)；顺序按 Chars 层对象序
    const red = L.diamonds.find((d) => d.kind === "red");
    expect(red).toMatchObject({ kind: "red", x: 370, y: 80 });
    const blue = L.diamonds.find((d) => d.kind === "blue");
    expect(blue).toMatchObject({ kind: "blue", x: 752, y: 464 });
  });

  it("机关：2 按钮(group5) + 1 拉杆(group4, onis=-1) + 1 推箱 + 2 平台(dy=-3)", () => {
    expect(L.pushers.length).toBe(2);
    expect(L.pushers.every((p) => p.group === 5)).toBe(true);
    expect(L.levers.length).toBe(1);
    expect(L.levers[0]).toMatchObject({ group: 4, onis: -1, startPos: 1 });
    expect(L.boxes.length).toBe(1);
    expect(L.platforms.length).toBe(2);
    expect(L.platforms.every((p) => p.dy === -3)).toBe(true);
    expect(L.platforms.map((p) => p.group).sort()).toEqual([4, 5]);
  });

  it("液体行段：水/岩浆/绿浆三池齐全", () => {
    const kinds = new Set(L.liquidRuns.map((r) => r.kind));
    expect(kinds.has("water")).toBe(true);
    expect(kinds.has("lava")).toBe(true);
    expect(kinds.has("green")).toBe(true);
    for (const r of L.liquidRuns) {
      expect(r.col1).toBeGreaterThanOrEqual(r.col0);
      // run 内每格 type 一致
      for (let c = r.col0; c <= r.col1; c++) {
        expect(liquidKindOf(L.groundType[r.row * L.cols + c])).toBe(r.kind);
      }
    }
  });

  it("教学步骤按 id 配对（8 步，dual 变体优先）", () => {
    expect(L.tutorials.length).toBe(8);
    expect(L.tutorials.map((s) => s.id)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    for (const s of L.tutorials) {
      expect(s.text).toBeTruthy();
      expect(s.trigger).toBeTruthy();
    }
  });
});

describe("level2 解析（图块集变体关）", () => {
  it("forest_02：4 按钮(2×group2) + 2 平台 + 2 摆绳 + 0 拉杆（数据实证）", () => {
    const L = loadLevel("forest_02");
    expect(L.pushers.length).toBe(4);
    expect(L.pushers.filter((p) => p.group === 2).length).toBe(2);
    expect(L.platforms.length).toBe(2);
    expect(L.platforms[0]).toMatchObject({ dx: 5, dy: 0, group: 2, w: 160, h: 32 });
    expect(L.platforms[1]).toMatchObject({ dx: 0, dy: 4, w: 32, h: 128 });
    expect(L.hangings.length).toBe(2);
    expect(L.hangings[0].pts.length).toBeGreaterThanOrEqual(2);
    expect(L.levers.length).toBe(0);
  });

  it("forest_03：无 Objects 图块集不崩，风区来自 LargeObjects@24（rot=-90, length=15）", () => {
    const L = loadLevel("forest_03");
    expect(L.winds.length).toBeGreaterThan(0);
    expect(L.winds[0]).toMatchObject({ rotation: -90, lengthM: 15 });
  });

  it("forest_05：Objects@23 可解析，Chars 层空对象被容忍", () => {
    const L = loadLevel("forest_05");
    expect(L.pushers.length + L.levers.length).toBeGreaterThan(0);
  });

  it("forest_09：Objects@27 与 LargeObjects@24 共存，gid28 归 Objects#1 拉杆 A（Phaser 规则）", () => {
    const L = loadLevel("forest_09");
    expect(L.levers.filter((l) => l.onis === 1).length).toBeGreaterThan(0);
    expect(L.winds.length).toBeGreaterThan(0);
  });

  it("forest_14：Objects@16 + Chars@32/35 变体可解析", () => {
    const L = loadLevel("forest_14");
    expect(L.spawn.fireboy.x).not.toBeNaN();
    expect(L.romans.length).toBeGreaterThan(0);
  });

  it("forest_07：Objects@23 下 gid23 是 pusher 而非 fbwg 钻石（firstgid 区间归属实证）", () => {
    const L = loadLevel("forest_07");
    expect(L.pushers.length).toBe(4);
    expect(L.diamonds.filter((d) => d.kind === "fbwg").length).toBe(0);
  });
});

describe("level2 全 48 关冒烟 + 全量直方图", () => {
  // 权威直方图（Phaser gid 归属规则，2026-10-04 扫描；对 research 01 §2.5 的修正：
  // pusher=73（含 Objects@23 关的 gid23）、leverA/B=25/49、fbwg=0（11 个 gid23 实为 pusher））
  const EXPECTED: Record<string, number> = {
    leverA: 25,
    leverB: 49,
    pusher: 73,
    box: 42,
    boxheavy: 17,
    ball: 20,
    wind: 33,
    platform: 223,
    hanging: 20,
    pulley: 11,
    roman: 6,
    window: 2,
    red: 235,
    blue: 230,
    silver: 14,
    fbwg: 0,
  };

  it("48 关全部可解析、出生点/门恰一对", () => {
    const ids = allLevelIds();
    expect(ids.length).toBe(48);
    for (const id of ids) {
      const L = loadLevel(id);
      expect(L.spawn.fireboy.x, id).not.toBeNaN();
      expect(L.spawn.watergirl.x, id).not.toBeNaN();
      expect(L.doors.fireboy.w, id).toBe(64);
      expect(L.doors.watergirl.w, id).toBe(64);
      expect(L.ground.length, id).toBe(L.cols * L.rows);
    }
  });

  it("全量机关直方图与权威扫描一致", () => {
    const totals: Record<string, number> = {};
    const bump = (k: string, n: number) => (totals[k] = (totals[k] ?? 0) + n);
    for (const id of allLevelIds()) {
      const L = loadLevel(id);
      bump("leverA", L.levers.filter((l) => l.onis === 1).length);
      bump("leverB", L.levers.filter((l) => l.onis === -1).length);
      bump("pusher", L.pushers.length);
      bump("box", L.boxes.filter((b) => !b.heavy).length);
      bump("boxheavy", L.boxes.filter((b) => b.heavy).length);
      bump("ball", L.balls.length);
      bump("wind", L.winds.length);
      bump("platform", L.platforms.length);
      bump("hanging", L.hangings.length);
      bump("pulley", L.pulleys.length);
      bump("roman", L.romans.length);
      bump("window", L.windows.length);
      for (const kind of ["red", "blue", "silver", "fbwg"] as const) {
        bump(kind, L.diamonds.filter((d) => d.kind === kind).length);
      }
    }
    for (const [k, v] of Object.entries(EXPECTED)) {
      expect(totals[k], k).toBe(v);
    }
  });

  it("地面类型直方图与官方数据一致（仅 gid1..8）", () => {
    const counts: Record<number, number> = {};
    for (const id of allLevelIds()) {
      const L = loadLevel(id);
      for (let i = 0; i < L.groundType.length; i++) {
        const t = L.groundType[i];
        if (t === -99) continue;
        counts[t] = (counts[t] ?? 0) + 1;
      }
    }
    expect(counts).toEqual({
      [GROUND_TYPE.SOLID]: 14114,
      // P-03 S 档分叉（2026-10-23，forest_14/14_1 cb32 门台修）：删楔面 gid2×2/gid5×2 ×两关
      // ——oracle 账为 SLOPE_A 764 / WEDGE_D 628，见 evidence/forest_14 分叉建档
      [GROUND_TYPE.SLOPE_A]: 760,
      [GROUND_TYPE.SLOPE_B]: 881,
      [GROUND_TYPE.WEDGE_C]: 770,
      [GROUND_TYPE.WEDGE_D]: 624,
      [GROUND_TYPE.WATER]: 407,
      [GROUND_TYPE.LAVA]: 327,
      [GROUND_TYPE.GREEN]: 315,
    });
  });
});
