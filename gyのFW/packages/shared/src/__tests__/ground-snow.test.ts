/**
 * Ground 类型谱锚 + ice 雪面行为锚（#34/#35）：
 * - 谱锚：三部全量 groundType ∈ {−99}∪0..9（10/11/12 已 remap、55 已转冻结水）——未来新 type
 *   漏建 fixture 会在入库存档前被此测试拦下（#34 的教训：330 块 type10 无碰撞体）
 * - 雪面碰撞：type10 直桥可站立（修复前穿透坠落）
 * - 雪面摩擦：fb 冰面滑行（脚摩擦 0）；wg 冰面无输入即停（@63257 清零速度）且限速 2
 */
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseLevel, type LevelData } from "../level2.js";
import { World } from "../kernel/world.js";
import { b2 } from "../kernel/b2.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const LEVEL_DIRS = ["forest/levels", "light/levels", "ice/levels", "tutorials/levels"].map((d) =>
  join(ROOT, "data", d),
);

function loadLevel(id: string): LevelData {
  for (const dir of LEVEL_DIRS) {
    try {
      const json = JSON.parse(readFileSync(join(dir, `${id}.json`), "utf-8"));
      return parseLevel(id, json, (source: string) => JSON.parse(readFileSync(join(dir, source), "utf-8")));
    } catch {
      /* 下个目录 */
    }
  }
  throw new Error(`level not found: ${id}`);
}

function allLevelIds(): string[] {
  const ids: string[] = [];
  for (const dir of LEVEL_DIRS) {
    for (const f of readdirSync(dir)) {
      if (f.endsWith(".json")) ids.push(f.replace(/\.json$/, ""));
    }
  }
  return ids;
}

/** 体中心放到“脚底贴 (col,row) 砖顶”处并静止步进到落定。返回脚底 screen y。 */
function placeAndSettle(w: World, role: "fireboy" | "watergirl", col: number, row: number, frames = 120): number {
  const body = w.players[role].body;
  const cx = -(col * 32 + 16) / 32; // 格中心 x（screen→phys）
  const cy = (35.2 - row * 32) / 32; // 脚底=体中心 screen +35.2 → 贴砖顶
  const B = b2() as any;
  body.SetTransformVecRadians(new B.b2Vec2(cx, cy), 0);
  body.SetLinearVelocity(new (b2() as any).b2Vec2(0, 0));
  const idle = { fireboy: { up: false, left: false, right: false }, watergirl: { up: false, left: false, right: false } };
  for (let f = 0; f < frames; f++) w.step(1 / 60, idle as never);
  const p = body.GetPosition();
  return -p.y * 32 + 35.2;
}

describe("Ground 类型谱锚（#34）", () => {
  it("三部全量 groundType ∈ {−99}∪0..9（10/11/12 已 remap、55 已转冻结水）", () => {
    const ids = allLevelIds();
    expect(ids.length).toBeGreaterThanOrEqual(130);
    const offenders: string[] = [];
    for (const id of ids) {
      const lv = loadLevel(id);
      for (let i = 0; i < lv.groundType.length; i++) {
        const t = lv.groundType[i];
        if (t !== -99 && (t < 0 || t > 9)) offenders.push(`${id}@${i}=${t}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("ice 庙含雪地变体且 ice_06 有 type10 直桥（数据锚）", () => {
    const lv = loadLevel("ice_06");
    let tens = 0;
    for (let i = 0; i < lv.snowGrid.length; i++) if (lv.snowGrid[i] === 10) tens++;
    expect(tens).toBeGreaterThan(0);
  });
});

describe("ice_06 type10 直桥行为（#34/#35）", () => {
  // 非雪实心对照格：≥2 连续段（雪桥格 remap 后也是 0，必须排除 snowGrid）+ 上方 3 格空（防传送进墙）
  function findSolidControl(lv: LevelData): { row: number; col: number } {
    const clear = (r: number, c: number) => r >= 0 && lv.groundType[r * lv.cols + c] === -99;
    for (let row = 1; row < lv.rows; row++) {
      let run = 0;
      for (let c = 0; c < lv.cols; c++) {
        const solid = lv.groundType[row * lv.cols + c] === 0 && !lv.snowGrid[row * lv.cols + c];
        if (solid) {
          run++;
          continue;
        }
        if (run >= 2) {
          const mid = c - 1 - ((run - 1) >> 1);
          if (clear(row - 1, mid) && clear(row - 2, mid) && clear(row - 3, mid)) return { row, col: mid };
        }
        run = 0;
      }
    }
    throw new Error("ice_06 无可用非雪实心对照格");
  }

  it("type10 桥面可站立（修复前穿透坠落）；非雪实心对照同高", { timeout: 30000 }, () => {
    const lv = loadLevel("ice_06");
    const solid = findSolidControl(lv);
    // 桥：第一段 ≥2 连续 type10
    let row = -1, snowCol = -1;
    outer: for (let r = 0; r < lv.rows; r++) {
      for (let c = 0; c < lv.cols - 1; c++) {
        if (lv.snowGrid[r * lv.cols + c] === 10 && lv.snowGrid[r * lv.cols + c + 1] === 10) {
          row = r;
          snowCol = c;
          break outer;
        }
      }
    }
    expect(row).toBeGreaterThanOrEqual(0);
    const w = new World(lv);
    const feetSnow = placeAndSettle(w, "fireboy", snowCol, row);
    expect(Math.abs(feetSnow - row * 32)).toBeLessThanOrEqual(3);
    const feetSolid = placeAndSettle(w, "fireboy", solid.col, solid.row);
    expect(Math.abs(feetSolid - solid.row * 32)).toBeLessThanOrEqual(3);
  });

  // 全关最长 type10 段（ice_06 row13 有 9 连格）作滑行跑道，避免短桥撞墙/滑出边缘
  function longestSnowRun(): { row: number; col0: number; len: number } {
    const lv = loadLevel("ice_06");
    let best = { row: -1, col0: -1, len: 0 };
    for (let row = 0; row < lv.rows; row++) {
      let run = 0;
      let start = -1;
      for (let col = 0; col <= lv.cols; col++) {
        if (col < lv.cols && lv.snowGrid[row * lv.cols + col] === 10) {
          if (!run) start = col;
          run++;
          if (run > best.len) best = { row, col0: start, len: run };
        } else run = 0;
      }
    }
    if (best.len < 2) throw new Error("ice_06 无 type10 段");
    return best;
  }

  it("fb 雪面滑行（脚摩擦 0）：10 帧后速度衰减显著小于实心对照；isOnIce 且限速不变", { timeout: 30000 }, () => {
    const run = longestSnowRun();
    const lv = loadLevel("ice_06");
    const solid = findSolidControl(lv);
    const B = b2() as any;
    const idle = { fireboy: { up: false, left: false, right: false }, watergirl: { up: false, left: false, right: false } };
    const w = new World(loadLevel("ice_06"));

    placeAndSettle(w, "fireboy", run.col0 + 1, run.row);
    const fb = w.players.fireboy;
    expect(fb.isOnIce).toBe(true);
    expect(fb.maxSpeed).toBe(8.5);
    fb.body.SetLinearVelocity(new B.b2Vec2(-6, 0)); // screen 向右 6 m/s
    for (let f = 0; f < 10; f++) w.step(1 / 60, idle as never);
    const vxSnow = Math.abs(fb.body.GetLinearVelocity().x);

    placeAndSettle(w, "fireboy", solid.col, solid.row);
    fb.body.SetLinearVelocity(new B.b2Vec2(-6, 0));
    for (let f = 0; f < 10; f++) w.step(1 / 60, idle as never);
    const vxSolid = Math.abs(fb.body.GetLinearVelocity().x);

    expect(vxSnow).toBeGreaterThan(vxSolid + 0.3);
  });

  it("wg 雪面无输入即停（速度清零）且限速 waterIceMaxSpeed=2", { timeout: 30000 }, () => {
    const run = longestSnowRun();
    const B = b2() as any;
    const idle = { fireboy: { up: false, left: false, right: false }, watergirl: { up: false, left: false, right: false } };
    const w = new World(loadLevel("ice_06"));
    placeAndSettle(w, "watergirl", run.col0 + 1, run.row);
    const wg = w.players.watergirl;
    expect(wg.isOnIce).toBe(true);
    expect(wg.maxSpeed).toBe(2);
    const x0 = wg.body.GetPosition().x;
    wg.body.SetLinearVelocity(new B.b2Vec2(-6, 0));
    for (let f = 0; f < 2; f++) w.step(1 / 60, idle as never);
    const v = wg.body.GetLinearVelocity();
    expect(Math.abs(v.x)).toBeLessThan(0.5);
    const drift = Math.abs(wg.body.GetPosition().x - x0) * 32;
    expect(drift).toBeLessThan(4);
  });
});
