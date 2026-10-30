import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";
import { describe, expect, it } from "vitest";
import { parseLevel } from "../level2.js";
import { World } from "../kernel/world.js";

// packages/shared/src/__tests__ → 仓库根
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");

function loadLevel(id: string, dir: string) {
  const json = JSON.parse(readFileSync(`${ROOT}/data/${dir}/${id}.json`, "utf8"));
  const cache = new Map<string, any>();
  const prov = (source: string) => {
    if (!cache.has(source)) {
      cache.set(source, JSON.parse(readFileSync(fileURLToPath(new URL(source, `file:///${ROOT}/data/${dir}/`)), "utf8")));
    }
    return cache.get(source);
  };
  return parseLevel(id, json, prov);
}

const IDLE = { fireboy: { up: false, left: false, right: false }, watergirl: { up: false, left: false, right: false } };

function fairyPos(w: World): number[][] {
  return w.mechs.fairies.map((f) => {
    const p = f.body.GetPosition();
    return [Math.round(p.x * 100) / 100, Math.round(p.y * 100) / 100];
  });
}

// F 部 fairytales 内核（01号档 §2 语义）：仙女零重力悬浮 + 杯口色配感应 + 按钮语义派发。
// oracle 墙钟/构造期随机（toffset/aoffset）在内核换仿真钟与按序确定性偏移——偏差已在档卷记档。
describe("Fairy/FairyCup 内核（fairies_000 真数据）", () => {
  it("仙女零重力悬浮：120 帧位置漂移且双跑逐位一致（确定性）", () => {
    const lv = loadLevel("fairies_000", "tutorials/levels");
    const w1 = new World(lv);
    const spawn = lv.fairies.map((f) => [f.x, f.y]);
    for (let i = 0; i < 120; i++) w1.step(1 / 60, IDLE);
    const p1 = fairyPos(w1);
    const w2 = new World(lv);
    for (let i = 0; i < 120; i++) w2.step(1 / 60, IDLE);
    expect(p1).toEqual(fairyPos(w2));
    expect(p1.some((p, i) => Math.hypot(p[0] * 32 + spawn[i][0], p[1] * 32 + spawn[i][1]) > 8)).toBe(true);
  });

  it("色配拖拽入杯：group4 仙女入 group41 杯 → state 0→1，其余杯不受影响（oracle 实跑探针同款）", () => {
    const lv = loadLevel("fairies_000", "tutorials/levels");
    const w = new World(lv);
    for (let i = 0; i < 30; i++) w.step(1 / 60, IDLE);
    const cup = w.mechs.fairyCups.find((c) => c.group === 41)!;
    const fy = w.mechs.fairies.find((f) => f.group === 4)!;
    for (let i = 0; i < 120; i++) {
      fy.setDrag({ x: cup.center.x, y: cup.center.y });
      w.step(1 / 60, IDLE);
    }
    expect(cup.state).toBe(1);
    expect(cup.currentFairies).toContain(fy);
    expect(fy.externalCup).toBe(cup);
    expect(w.mechs.fairyCups.filter((c) => c !== cup).every((c) => c.state === 0)).toBe(true);
    // 事件谱出现 fairycup 迁移
  });

  it("色不配不入杯：group0 杯（百搭）可收任意，但非百搭杯对异色仙女保持 state 0", () => {
    const lv = loadLevel("fairies_000", "tutorials/levels");
    const w = new World(lv);
    for (let i = 0; i < 30; i++) w.step(1 / 60, IDLE);
    // fairies_000 杯组：5/3/1/41——group5 仙女组只有 4/0/5，取 group1 杯（首位 1）+ group4 仙女 = 不配
    const cup1 = w.mechs.fairyCups.find((c) => String(c.group).startsWith("1") && c.group !== 41)!;
    const fy4 = w.mechs.fairies.find((f) => f.group === 4)!;
    for (let i = 0; i < 120; i++) {
      fy4.setDrag({ x: cup1.center.x, y: cup1.center.y });
      w.step(1 / 60, IDLE);
    }
    expect(cup1.state).toBe(0);
    expect(fy4.externalCup).not.toBe(cup1);
  });

  it("松手 maxForce 降 5%：就地漂浮停驻（速度衰减，不继续飞离拖拽点——oracle 无回原点语义）", () => {
    const lv = loadLevel("fairies_000", "tutorials/levels");
    const w = new World(lv);
    const fy = w.mechs.fairies[0];
    for (let i = 0; i < 60; i++) {
      fy.setDrag({ x: fy.body.GetPosition().x + 5, y: fy.body.GetPosition().y });
      w.step(1 / 60, IDLE);
    }
    const releasedAt = { ...fy.body.GetPosition() };
    fy.setDrag(null);
    for (let i = 0; i < 120; i++) w.step(1 / 60, IDLE);
    expect(fy.dragging).toBe(false);
    const v = fy.body.GetLinearVelocity();
    expect(Math.hypot(v.x, v.y)).toBeLessThan(1);
    const p = fy.body.GetPosition();
    expect(Math.hypot(p.x - releasedAt.x, p.y - releasedAt.y)).toBeLessThan(2);
  });
});
