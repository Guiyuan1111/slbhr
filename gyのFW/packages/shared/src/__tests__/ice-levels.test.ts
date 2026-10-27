/**
 * 冰雪神庙（第三部）解析/内核锚——51 关冒烟 + 全量机关直方图 + TimedPusher 专项
 * （#25：ice 此前无任何解析/行为测试，仅靠自生成 det 基线兜底；本文件锚 =
 * 权威扫描 2026-10-26，扫描脚本口径与 light-levels.test.ts 同款 gid→tileset 帧名）。
 * forest 锚在 level2.test.ts、light 锚在 light-levels.test.ts（互不触碰对方数据）。
 */
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseLevel, type LevelData } from "../level2.js";
import { World } from "../kernel/world.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const cache = new Map<string, LevelData>();
function loadLevel(id: string): LevelData {
  if (!cache.has(id)) {
    const dir = id === "ice_02" ? `${ROOT}/data/tutorials/levels` : `${ROOT}/data/ice/levels`;
    const json = JSON.parse(readFileSync(`${dir}/${id}.json`, "utf8"));
    cache.set(id, parseLevel(id, json, (source) => JSON.parse(readFileSync(join(dir, source), "utf8"))));
  }
  return cache.get(id)!;
}
function allLevelIds(): string[] {
  return ["ice_02", ...readdirSync(`${ROOT}/data/ice/levels`).filter((f) => f.endsWith(".json")).map((f) => f.replace(".json", ""))].sort();
}

/** 权威直方图（2026-10-26 全 51 关扫描；lever 拆分按 mergedProps 对象级覆写口径 onis=±1） */
const EXPECTED = {
  leverA: 16,
  leverB: 27,
  pusher: 126,
  box: 36,
  boxheavy: 14,
  ball: 30,
  wind: 12,
  platform: 239,
  hanging: 10,
  pulley: 13,
  roman: 1,
  window: 1,
  beamer: 39,
  rotMirror: 14,
  boxMirror: 8,
  infiniteMirror: 12,
  lightPusher: 7,
  slider: 10,
  timedPusher: 25,
};

/** TimedPusher 每关 time（ms）权威表：id → 升序排列的 time 集合（14 关 25 实例） */
const EXPECTED_TIMED: Record<string, number[]> = {
  ice_02: [4000],
  ice_07: [2600, 4000],
  ice_07_1: [2600, 4500, 5000],
  ice_11: [4200],
  ice_12: [4000],
  ice_21: [5000, 6000, 6000, 8000, 9000],
  ice_24: [11000, 11000],
  ice_24_1: [14000, 14000],
  ice_30: [6000],
  ice_30_1: [6000],
  ice_36: [13000, 24000],
  ice_36_1: [14000, 24000],
  ice_bonus_1: [21000],
  ice_bonus_2: [12000],
};

describe("ice 部 51 关冒烟 + 全量机关直方图", () => {
  it("51 关全部可解析、出生点/门恰一对", () => {
    const ids = allLevelIds();
    expect(ids.length).toBe(51);
    for (const id of ids) {
      const L = loadLevel(id);
      expect(L.spawn.fireboy.x, id).not.toBeNaN();
      expect(L.spawn.watergirl.x, id).not.toBeNaN();
      expect(L.doors.fireboy.w, id).toBe(64);
      expect(L.doors.watergirl.w, id).toBe(64);
      expect(L.ground.length, id).toBe(L.cols * L.rows);
    }
  });

  it("全量机关直方图与权威扫描一致（含 timedPusher 总量 25）", () => {
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
      bump("beamer", L.beamers.length);
      bump("rotMirror", L.rotMirrors.length);
      bump("boxMirror", L.boxMirrors.length);
      bump("infiniteMirror", L.infiniteMirrors.length);
      bump("lightPusher", L.lightPushers.length);
      bump("slider", L.sliders.length);
      bump("timedPusher", L.timedPushers.length);
    }
    for (const [k, v] of Object.entries(EXPECTED)) expect(totals[k], k).toBe(v);
  });

  it("TimedPusher 分布与 time 逐关逐实例一致（25 实例/14 关）", () => {
    const withTimed = allLevelIds().filter((id) => loadLevel(id).timedPushers.length > 0);
    expect(withTimed.length).toBe(14);
    expect(withTimed.sort()).toEqual(Object.keys(EXPECTED_TIMED).sort());
    for (const [id, times] of Object.entries(EXPECTED_TIMED)) {
      const got = loadLevel(id).timedPushers.map((t) => t.time).sort((a, b) => a - b);
      expect(got, id).toEqual(times);
    }
    // time 必为正且非缺省漂移（缺省 2000 在 ice 数据中不出现，出现即解析漏合并属性）
    for (const id of withTimed) {
      for (const t of loadLevel(id).timedPushers) expect(t.time, id).toBeGreaterThan(2000);
    }
  });

  // 覆盖率插桩下 51 关×60 步超 5s 默认超时（裸跑 ~4s），单独放宽到 30s
  it("内核全 51 关建世界+60 步零失败；mechSnapshot timedPushers 数量与解析一致", { timeout: 30000 }, () => {
    for (const id of allLevelIds()) {
      const L = loadLevel(id);
      const w = new World(L);
      for (let f = 0; f < 60; f++) w.step(1 / 60, { fireboy: { up: false, left: false, right: false }, watergirl: { up: false, left: false, right: false } });
      const snap = w.mechSnapshot();
      expect(snap.timedPushers.length, id).toBe(L.timedPushers.length);
      for (const tp of snap.timedPushers) {
        expect(Number.isFinite(tp.x), `${id}#${tp.id}`).toBe(true);
        expect(Number.isFinite(tp.y), `${id}#${tp.id}`).toBe(true);
      }
      expect(snap.beamers.length, id).toBe(L.beamers.length);
    }
  });
});
