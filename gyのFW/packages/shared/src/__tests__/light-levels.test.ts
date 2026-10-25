/**
 * 灯光神庙（第二部）解析/内核锚——40 关冒烟 + 全量机关直方图（权威扫描 2026-10-25，
 * note/evidence/2026-10-25-light-temple/01号档 §2 表；解析器同款口径 gid→tileset 帧名）。
 * forest 锚在 level2.test.ts（本文件不碰 forest 数据）。
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
    const dir = id === "light_01" ? `${ROOT}/data/tutorials/levels` : `${ROOT}/data/light/levels`;
    const json = JSON.parse(readFileSync(`${dir}/${id}.json`, "utf8"));
    cache.set(id, parseLevel(id, json, (source) => JSON.parse(readFileSync(join(dir, source), "utf8"))));
  }
  return cache.get(id)!;
}
function allLevelIds(): string[] {
  return ["light_01", ...readdirSync(`${ROOT}/data/light/levels`).filter((f) => f.endsWith(".json")).map((f) => f.replace(".json", ""))].sort();
}

/** 权威直方图（01号档 §2 表 + lever 拆分按 mergedProps 对象级覆写口径：
 *  light_13 lever 对象 onis=1 覆写 tile −1，故 leverA=10/leverB=33） */
const EXPECTED = {
  leverA: 10,
  leverB: 33,
  pusher: 44,
  box: 10,
  boxheavy: 3,
  ball: 13,
  wind: 10,
  platform: 141,
  hanging: 3,
  pulley: 9,
  roman: 3,
  window: 0,
  beamer: 21,
  rotMirror: 17,
  boxMirror: 21,
  infiniteMirror: 12,
  lightPusher: 35,
  slider: 12,
};

describe("light 部 40 关冒烟 + 全量机关直方图", () => {
  it("40 关全部可解析、出生点/门恰一对", () => {
    const ids = allLevelIds();
    expect(ids.length).toBe(40);
    for (const id of ids) {
      const L = loadLevel(id);
      expect(L.spawn.fireboy.x, id).not.toBeNaN();
      expect(L.spawn.watergirl.x, id).not.toBeNaN();
      expect(L.doors.fireboy.w, id).toBe(64);
      expect(L.doors.watergirl.w, id).toBe(64);
      expect(L.ground.length, id).toBe(L.cols * L.rows);
    }
  });

  it("全量机关直方图与权威扫描一致（含六类光机关）", () => {
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
    }
    for (const [k, v] of Object.entries(EXPECTED)) expect(totals[k], k).toBe(v);
  });

  it("内核全 40 关建世界+60 步零失败；带亮 beamer 的关光束折线非空", () => {
    let litBeamers = 0;
    let beamsDrawn = 0;
    for (const id of allLevelIds()) {
      const w = new World(loadLevel(id));
      for (let f = 0; f < 60; f++) w.step(1 / 60, { fireboy: {}, watergirl: {} });
      const snap = w.mechSnapshot();
      expect(snap.beamers.length, id).toBe(loadLevel(id).beamers.length);
      for (const b of snap.beamers) {
        if (b.state === 1) {
          litBeamers++;
          if (b.pts.length >= 2) beamsDrawn++;
        }
      }
    }
    expect(litBeamers).toBeGreaterThan(0);
    // 光束必须全部画出（世界四壁兜底命中；镜面反射链不空）
    expect(beamsDrawn).toBe(litBeamers);
  });
});
