/**
 * 机关机制测试（合成关卡，确定性）：
 * - 按钮板按住语义（玩家/推箱压住 → 组平台到端点 B；松开回端点 A）
 * - 推箱物理（推行、站立、压板、悬空下落）
 */
import { describe, expect, it } from "vitest";
import type { LevelData } from "../level.js";
import { World } from "../world.js";

const T = 32;
const COLS = 20;
const ROWS = 10;

/** 合成关卡：底行实心，一块 group7 平台(128,128 → +64)、一块 group7 按钮板、一只推箱 */
function synthLevel(): LevelData {
  const solid = new Uint8Array(COLS * ROWS);
  for (let c = 0; c < COLS; c++) solid[(ROWS - 1) * COLS + c] = 1; // 底行 y=288..320
  return {
    id: "synth",
    widthPx: COLS * T,
    heightPx: ROWS * T,
    tile: T,
    solid,
    liquid: new Uint8Array(COLS * ROWS),
    ground: new Uint16Array(COLS * ROWS),
    groundTypes: new Int16Array(COLS * ROWS).fill(-99),
    cols: COLS,
    rows: ROWS,
    spawn: { fireboy: { x: 32, y: 288 - 56 }, watergirl: { x: 64, y: 288 - 56 } },
    doors: {
      fireboy: { x: 500, y: 224, w: 64, h: 64 },
      watergirl: { x: 560, y: 224, w: 64, h: 64 },
    },
    diamonds: [],
    levers: [],
    plates: [{ id: "b0", group: 7, rect: { x: 160, y: 256, w: 32, h: 32 } }],
    platforms: [{ id: "p0", x: 128, y: 128, w: 64, h: 16, dx: 0, dy: 64, group: 7 }],
    mechProps: [{ gid: 4, rect: { x: 320, y: 224, w: 64, h: 64 }, props: {} }],
    tutorials: [],
  };
}

describe("按钮板（按住语义）", () => {
  const dt = 1 / 60;

  it("玩家压住 → 组平台去端点 B；走开 → 回端点 A", () => {
    const w = new World(synthLevel());
    const pf = w.platforms[0];
    expect(pf.target).toBe(0);
    // 站在按钮板上（板贴地 256..288，玩家站地板：身体 232..288 与板相交）
    const fb = w.players.fireboy;
    fb.x = 168;
    fb.y = 288 - 56;
    w.step(dt);
    expect(w.plates[0].pressed).toBe(true);
    expect(pf.target).toBe(1);
    for (let i = 0; i < 60; i++) w.step(dt);
    expect(pf.y).toBeCloseTo(192, 0); // 128+64
    // 走开
    fb.x = 400;
    w.step(dt);
    expect(w.plates[0].pressed).toBe(false);
    expect(pf.target).toBe(0);
    for (let i = 0; i < 60; i++) w.step(dt);
    expect(pf.y).toBeCloseTo(128, 0);
  });

  it("推箱压住同样生效；推离后释放", () => {
    const w = new World(synthLevel());
    const pf = w.platforms[0];
    // 推箱初始在 (320,224)，地板顶 288：落地
    for (let i = 0; i < 10; i++) w.step(dt);
    expect(w.box!.grounded).toBe(true);
    expect(w.box!.y + w.box!.h).toBeCloseTo(288, 0);
    // 直接把推箱放到按钮板上
    w.box!.x = 160;
    for (let i = 0; i < 5; i++) w.step(dt);
    expect(w.plates[0].pressed).toBe(true);
    expect(pf.target).toBe(1);
    // 推离（玩家从左侧向右推箱子）
    const fb = w.players.fireboy;
    fb.x = 96;
    fb.y = 288 - 56;
    w.inputs.set("fireboy", { up: false, left: false, right: true });
    for (let i = 0; i < 90; i++) w.step(dt);
    w.inputs.set("fireboy", { up: false, left: false, right: false });
    expect(w.box!.x).toBeGreaterThan(200); // 被推离按钮板
    expect(w.plates[0].pressed).toBe(false);
    expect(pf.target).toBe(0);
  });
});

describe("推箱物理", () => {
  const dt = 1 / 60;

  it("玩家可推行推箱，箱子撞墙停住且玩家被挡", () => {
    const w = new World(synthLevel());
    for (let i = 0; i < 10; i++) w.step(dt);
    const fb = w.players.fireboy;
    // 站到箱子左侧
    fb.x = 320 - 26 - 1;
    fb.y = 288 - 56;
    w.inputs.set("fireboy", { up: false, left: false, right: true });
    for (let i = 0; i < 60; i++) w.step(dt);
    w.inputs.set("fireboy", { up: false, left: false, right: false });
    expect(w.box!.x).toBeGreaterThan(320); // 箱子被推走
    expect(w.box!.x + w.box!.w).toBeLessThanOrEqual(w.level.widthPx); // 没穿右墙
    // 玩家贴在箱子左侧
    expect(fb.x + 26).toBeLessThanOrEqual(w.box!.x + 1);
  });

  it("玩家可以站上推箱", () => {
    const w = new World(synthLevel());
    for (let i = 0; i < 10; i++) w.step(dt);
    const fb = w.players.fireboy;
    fb.x = 320 + 16; // 箱子上方
    fb.y = 224 - 56 - 8; // 略高于箱顶，落下
    for (let i = 0; i < 60; i++) w.step(dt);
    expect(fb.grounded).toBe(true);
    expect(fb.y + 56).toBeCloseTo(224, 0); // 站在箱顶
  });

  it("推箱悬空会下落落地", () => {
    const w = new World(synthLevel());
    const box = w.box!;
    box.x = 480;
    box.y = 100;
    box.vy = 0;
    for (let i = 0; i < 120; i++) w.step(dt);
    expect(box.grounded).toBe(true);
    expect(box.y + box.h).toBeCloseTo(288, 0);
  });
});
