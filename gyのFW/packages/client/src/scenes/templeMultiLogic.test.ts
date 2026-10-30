/**
 * templeMultiLogic 单测：E 部 multi 选关纯逻辑。
 * - 合成庙夹具：逐条对 bundle 语义（见模块头注 bundle 偏移）。
 * - 实数据集成：直接读仓库 7 份 data/elements/各庙/temple.json，校验档卷 §3 解锁链表
 *   （forest 恒开 → fire/water 需 forest → wind 需 water → light 需 fire → ice 需 wind+light
 *   → crystal 需 light）与数据契约（rows/edges 空/required 连续/unlock_key 全 free）。
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { fileURLToPath } from "node:url";
import {
  ICON_DISTANCE,
  type MultiTemple,
  allIsLearned,
  completedCountOf,
  computeLearnedElements,
  gridBakePts,
  gridMetrics,
  gridNodeXY,
  purchaseLocked,
  rowsLevelState,
  stripIconX,
  stripIconY,
  templeHasNew,
  templeSoftLocked,
} from "./templeMultiLogic";

/** 合成庙：3 关 required 0/1/2，levels[0] elements 可配 */
function mkTemple(over: Partial<MultiTemple> & { levels?: Partial<MultiTemple["levels"][number]>[] }): MultiTemple {
  const base: MultiTemple["levels"] = [
    { id: 0, _id: 0, x: 0.2, y: 0.2, filename: "t.json", required: 0 },
    { id: 1, _id: 1, x: 0.5, y: 0.4, filename: "a.json", required: 1 },
    { id: 2, _id: 2, x: 0.8, y: 0.6, filename: "b.json", required: 2 },
  ];
  for (let i = 0; i < base.length; i++) Object.assign(base[i], over.levels?.[i]);
  return { id: "synth", index: 0, label: "Synth Temple", color: "#123456", type: "rows", levels: base, ...over, levels: base };
}

describe("rowsLevelState（setStates 非 tree 分支）", () => {
  const learned = new Set(["forest"]);
  it("best 星数映射 1/2/3 → state 2/3/4（不受锁门影响）", () => {
    const lv = { id: 1, _id: 1, x: 0, y: 0, filename: "x.json", required: 99 };
    expect(rowsLevelState(lv, 1, 0, learned)).toBe(2);
    expect(rowsLevelState(lv, 2, 0, learned)).toBe(3);
    expect(rowsLevelState(lv, 3, 0, learned)).toBe(4);
  });
  it("required 门：completedCount≥required 才可玩", () => {
    const lv = { id: 1, _id: 1, x: 0, y: 0, filename: "x.json", required: 2 };
    expect(rowsLevelState(lv, 0, 1, learned)).toBe(0);
    expect(rowsLevelState(lv, 0, 2, learned)).toBe(1);
  });
  it("教学关（id===0）elements 去尾：只查前置", () => {
    const tut = { id: 0, _id: 0, x: 0, y: 0, filename: "t.json", required: 0, elements: ["forest", "fire"] };
    expect(rowsLevelState(tut, 0, 0, new Set(["forest"]))).toBe(1); // fire 未学也放行
    expect(rowsLevelState(tut, 0, 0, new Set())).toBe(0);
  });
  it("非教学关 elements 全查：缺一即锁", () => {
    const lv = { id: 3, _id: 3, x: 0, y: 0, filename: "w.json", required: 0, elements: ["fire", "water"] };
    expect(rowsLevelState(lv, 0, 0, new Set(["fire", "water"]))).toBe(1);
    expect(rowsLevelState(lv, 0, 0, new Set(["fire"]))).toBe(0);
  });
  it("无 elements 的关只看 required", () => {
    const lv = { id: 1, _id: 1, x: 0, y: 0, filename: "p.json", required: 0 };
    expect(rowsLevelState(lv, 0, 0, new Set())).toBe(1);
  });
  it("购买锁（unlock_key≠free 且不在 myKeys）压回 state 0", () => {
    const lv = { id: 1, _id: 1, x: 0, y: 0, filename: "k.json", required: 0, unlock_key: "pay" };
    expect(rowsLevelState(lv, 0, 0, new Set(), [])).toBe(0);
    expect(rowsLevelState(lv, 0, 0, new Set(), ["pay"])).toBe(1);
  });
});

describe("allIsLearned / purchaseLocked / 庙级 softLock", () => {
  it("allIsLearned 三分支", () => {
    expect(allIsLearned(undefined, true, new Set())).toBe(true);
    expect(allIsLearned(["a", "b"], true, new Set(["a"]))).toBe(true); // 教学关去尾 → 只查 a
    expect(allIsLearned(["a", "b"], false, new Set(["a"]))).toBe(false);
  });
  it("purchaseLocked：null/undefined/free 恒不锁（null!=undefined 为 false）", () => {
    expect(purchaseLocked(undefined, [])).toBe(false);
    expect(purchaseLocked("free", [])).toBe(false);
    expect(purchaseLocked("pay", [])).toBe(true);
  });
  it("softLocked=levels[0].elements 去尾后未全学", () => {
    const t = mkTemple({ levels: [{ elements: ["forest", "fire"] }] });
    expect(templeSoftLocked(t, new Set(["forest"]))).toBe(false);
    expect(templeSoftLocked(t, new Set())).toBe(true);
  });
});

describe("completedCount / learnedElements / 图标 hasNew", () => {
  it("completedCount 只数 best 非空关", () => {
    const t = mkTemple({});
    expect(completedCountOf(t, (f) => (f === "t.json" || f === "a.json" ? 3 : 0))).toBe(2);
  });
  it("learnedElements=通关关 elements 并集（跨庙）", () => {
    const t1 = mkTemple({ id: "x", levels: [{ elements: ["forest", "fire"] }, { elements: ["wind"] }, {}] });
    const t2 = mkTemple({ id: "y", levels: [{}, { filename: "l.json", elements: ["light"] }, {}] });
    const learned = computeLearnedElements([t1, t2], (f) => (f === "t.json" || f === "a.json" || f === "l.json" ? 1 : 0));
    expect([...learned].sort()).toEqual(["fire", "forest", "light", "wind"]);
  });
  it("hasNew：新关且 state>0 才亮；forest 教学关豁免", () => {
    const played = new Set<string>();
    const t = mkTemple({ id: "forest", levels: [{}, { elements: ["forest"], required: 0 }, {}] });
    // 未学 forest：lv1 state=0 不亮；lv0（id0）即便 state>0 也被 forest∧id0 豁免
    expect(templeHasNew(t, () => 0, played, new Set(), 0)).toBe(false);
    expect(templeHasNew(t, () => 0, played, new Set(["forest"]), 0)).toBe(true);
    // 玩过即非 new
    expect(templeHasNew(t, () => 0, new Set(["a.json"]), new Set(["forest"]), 0)).toBe(false);
    // 非 forest 庙 id0 不豁免
    const t2 = mkTemple({ id: "fire" });
    expect(templeHasNew(t2, () => 0, played, new Set(), 0)).toBe(true);
  });
});

describe("条带/网格几何", () => {
  it("icon_distance=179.2、当前庙恒居屏心、wrap ±3.5 格", () => {
    const W = 1280;
    expect(stripIconX(0, 0, W)).toBe(W / 2);
    expect(stripIconX(3, 3, W)).toBe(W / 2);
    expect(stripIconX(-3, 0, W)).toBeCloseTo(W / 2 - 3 * ICON_DISTANCE, 6);
    // 选 crystal(3)：ice(−3) 差 −6 → wrap +7 → 落右侧 +1 格
    expect(stripIconX(-3, 3, W)).toBeCloseTo(W / 2 + ICON_DISTANCE, 6);
    // 选 ice(−3)：crystal(3) 差 +6 → wrap −7 → 落左侧 −1 格
    expect(stripIconX(3, -3, W)).toBeCloseTo(W / 2 - ICON_DISTANCE, 6);
    expect(stripIconY(960)).toBe(480 - 105);
  });
  it("gridMetrics：o=576、M=2o/√3、G=0.45（min<800 档）", () => {
    const m = gridMetrics(960);
    expect(m.o).toBe(576);
    expect(m.M).toBeCloseTo((2 * 576) / Math.sqrt(3), 9);
    expect(m.G).toBe(0.45);
  });
  it("gridNodeXY 对 fire 实测坐标逐项命中（X/Y 公式+组偏移 −80）", () => {
    // fire 实况：x∈[0.2425,0.7275] y∈[0.21,0.63] → B=0.2575 C=0.29
    const levels = [
      { x: 0.485, y: 0.21 },
      { x: 0.3637, y: 0.42 },
      { x: 0.6062, y: 0.42 },
      { x: 0.2425, y: 0.63 },
      { x: 0.7275, y: 0.63 },
    ];
    const m = gridMetrics(960);
    const p = gridNodeXY(levels[3], levels, m, 1280, 960);
    const M = m.M;
    expect(p.x).toBeCloseTo(640 + 0.2575 * M - M / 2, 6);
    expect(p.y).toBeCloseTo(480 + 0.71 * 576 - 288 - 80, 6);
  });
  it("gridBakePts：居中归一化坐标 + 画布 floor(M)×floor(o)", () => {
    const m = gridMetrics(960);
    const r = gridBakePts([{ x: 0.2, y: 0.1 }, { x: 0.6, y: 0.5 }], m);
    expect(r.canvasW).toBe(Math.floor(m.M));
    expect(r.canvasH).toBe(576);
    expect(r.Cf).toBeCloseTo(m.M, 9);
    expect(r.pts[1].x).toBeCloseTo((1 - 0.4) / 2 + 0.6 - 0.2, 9);
    expect(r.pts[1].y).toBeCloseTo((1 - 0.4) / 2 + 0.5 - 0.1, 9);
  });
});

// —— 实数据集成（仓库 7 份 temple.json） ——

const REPO_ROOT = fileURLToPath(new URL("../../../..", import.meta.url));
const DIRS = ["fire", "forest", "ice", "water", "crystal", "light", "wind"] as const;
const load = (): MultiTemple[] =>
  DIRS.map((d) => JSON.parse(readFileSync(`${REPO_ROOT}/data/elements/${d}/temple.json`, "utf8")) as MultiTemple);

/** 档卷 §3 解锁链：初始进度进度化场景 → 哪些庙解锁 */
function unlockedWith(stars: Record<string, number>): Set<string> {
  const temples = load();
  const starsOf = (f: string): number => stars[f] ?? 0;
  const learned = computeLearnedElements(temples, starsOf);
  return new Set(temples.filter((t) => !templeSoftLocked(t, learned)).map((t) => t.id));
}

describe("实数据：数据契约（7 份 temple.json）", () => {
  it("rows 型 / edges 恒空 / required 0..N 连续 / unlock_key 全 free / index 唯一且连续 −3..3", () => {
    const temples = load();
    expect(temples).toHaveLength(7);
    expect(new Set(temples.map((t) => t.index))).toEqual(new Set([-3, -2, -1, 0, 1, 2, 3]));
    for (const t of temples) {
      expect(t.type).toBe("rows");
      const reqs = t.levels.map((lv) => lv.required).sort((a, b) => a - b);
      expect(reqs).toEqual(Array.from({ length: t.levels.length }, (_, i) => i));
      for (const lv of t.levels) expect(lv.unlock_key ?? "free").toBe("free");
    }
  });
});

describe("实数据：档卷 §3 解锁链", () => {
  const TUT = {
    forest: "tutorials/levels/forest_01.json",
    fire: "tutorials/levels/e_tutorial_fire.json",
    water: "tutorials/levels/e_tutorial_water.json",
    wind: "tutorials/levels/e_tutorial_wind.json",
    light: "tutorials/levels/light_01.json",
  };
  it("空进度：仅 forest 开", () => {
    expect(unlockedWith({})).toEqual(new Set(["forest"]));
  });
  it("forest 毕业 → fire/water 开", () => {
    expect(unlockedWith({ [TUT.forest]: 1 })).toEqual(new Set(["forest", "fire", "water"]));
  });
  it("fire 教学（含 forest+fire 元素）→ 连 light 一并开", () => {
    expect(unlockedWith({ [TUT.fire]: 1 })).toEqual(new Set(["forest", "fire", "water", "light"]));
  });
  it("water 教学（含 forest+water 元素）→ 连 wind 一并开", () => {
    expect(unlockedWith({ [TUT.forest]: 1, [TUT.water]: 1 })).toEqual(new Set(["forest", "fire", "water", "wind"]));
  });
  it("链隙实证：只通 wind 教学关（learned={water,wind}）→ fire/water 反锁（二者需 forest 元素）", () => {
    // 原版元素链本就如此：fire/water 庙软锁查 "forest"，而 forest 元素只在 forest_01 与
    // e_tutorial_fire 的 elements 里——wind 开不等价 water 开。
    expect(unlockedWith({ [TUT.wind]: 1 })).toEqual(new Set(["forest", "wind"]));
  });
  it("三教学关（forest/water/fire）→ 五庙开；crystal 仍锁（light 元素未学）", () => {
    // learnedElements={forest,water,fire}：crystal 软锁查元素 "light"——三教学关都不携带它
    expect(unlockedWith({ [TUT.forest]: 1, [TUT.water]: 1, [TUT.fire]: 1 })).toEqual(
      new Set(["forest", "fire", "water", "wind", "light"]),
    );
  });
  it("light 需 fire 毕业（light 教学 elements=[fire,light] 去尾=fire）", () => {
    expect(unlockedWith({ [TUT.fire]: 1, [TUT.light]: 1 })).toEqual(
      new Set(["forest", "fire", "water", "light", "crystal"]),
    );
  });
  it("ice 需 wind+light 都毕业", () => {
    expect(unlockedWith({ [TUT.wind]: 1 })).toEqual(new Set(["forest", "wind"]));
    // {water,wind}∪{fire,light}：fire/water 反锁（缺 forest 元素），其余全开
    expect(unlockedWith({ [TUT.wind]: 1, [TUT.light]: 1 })).toEqual(
      new Set(["forest", "wind", "light", "crystal", "ice"]),
    );
  });
  it("crystal 需 light 毕业", () => {
    // light 教学 elements=[fire,light]：learned={fire,light} → fire/water 反锁（缺 forest）
    expect(unlockedWith({ [TUT.light]: 1 })).toEqual(new Set(["forest", "light", "crystal"]));
  });
});

describe("实数据：fire 庙 rows 状态机三场景", () => {
  const F_TUT = "tutorials/levels/e_tutorial_fire.json";
  const F_1 = "elements/fire/levels/efire_4.json"; // required 1，无 elements
  const F_3 = "elements/fire/levels/efire_2.json"; // required 3，elements=[wind]
  it("空进度：教学关也锁（去尾=[forest] 未学），completedCount=0 压全表", () => {
    const temples = load();
    const fire = temples.find((t) => t.id === "fire")!;
    const learned = computeLearnedElements(temples, () => 0);
    const completed = completedCountOf(fire, () => 0);
    for (const lv of fire.levels) expect(rowsLevelState(lv, 0, completed, learned)).toBe(0);
  });
  it("forest 学会后：教学关开（state1），required≥1 仍锁", () => {
    const temples = load();
    const fire = temples.find((t) => t.id === "fire")!;
    const learned = computeLearnedElements(temples, (f) => (f === "tutorials/levels/forest_01.json" ? 1 : 0));
    expect(rowsLevelState(fire.levels[0], 0, 0, learned)).toBe(1);
    expect(rowsLevelState(fire.levels[1], 0, 0, learned)).toBe(0);
  });
  it("通教学关后：state2、required1 关开、elements=[wind] 的 required3 关仍锁", () => {
    const temples = load();
    const fire = temples.find((t) => t.id === "fire")!;
    const stars = (f: string): number => (f === F_TUT ? 1 : 0);
    const learned = computeLearnedElements(temples, stars);
    expect(learned.has("forest")).toBe(true);
    expect(learned.has("fire")).toBe(true);
    expect(rowsLevelState(fire.levels[0], stars(F_TUT), completedCountOf(fire, stars), learned)).toBe(2);
    expect(rowsLevelState(fire.levels[1], 0, completedCountOf(fire, stars), learned)).toBe(1);
    const lv3 = fire.levels.find((lv) => lv.filename === F_3)!;
    expect(rowsLevelState(lv3, 0, completedCountOf(fire, stars), learned)).toBe(0); // wind 未学
  });
});
