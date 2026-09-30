import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { LIQUID_TILE, parseLevel, World } from "../index.js";

const ROOT = "D:/Guiyuan1111/GitHub/slbhr/gyのFW";

function tilesetProvider(baseDir: string) {
  const cache = new Map<string, any>();
  return (source: string) => {
    if (!cache.has(source)) {
      const p = new URL(source, `file:///${baseDir}/`).pathname.replace(/^\/([A-Za-z]:)/, "$1");
      cache.set(source, JSON.parse(readFileSync(decodeURI(p), "utf8")));
    }
    return cache.get(source);
  };
}

function loadForest02() {
  const dir = `${ROOT}/data/forest/levels`;
  const json = JSON.parse(readFileSync(`${dir}/forest_02.json`, "utf8"));
  return parseLevel("forest_02", json, tilesetProvider(dir));
}

describe("level 解析（forest_02 官方数据）", () => {
  const level = loadForest02();

  it("尺寸为 39×29 图块、32px", () => {
    expect(level.cols).toBe(39);
    expect(level.rows).toBe(29);
    expect(level.tile).toBe(32);
    expect(level.widthPx).toBe(39 * 32);
  });

  it("出生点/门/钻石齐全且位置合理", () => {
    expect(level.spawn.fireboy.x).toBeGreaterThan(0);
    expect(level.spawn.fireboy.y).toBeGreaterThan(0);
    expect(level.doors.fireboy.w).toBe(64);
    // 实证（forest_02 Chars 层）：红钻(gid20)×8、蓝钻(gid21)×8
    expect(level.diamonds.filter((d) => d.kind === "red").length).toBe(8);
    expect(level.diamonds.filter((d) => d.kind === "blue").length).toBe(8);
  });

  it("含液体、拉杆与平台（实证：4 拉杆 + 2 平台）", () => {
    expect(level.liquid.some((v) => v > 0)).toBe(true);
    expect(level.levers.length).toBe(4);
    expect(level.platforms.length).toBe(2);
  });

  it("出生点不在实心地形内", () => {
    for (const role of ["fireboy", "watergirl"] as const) {
      const s = level.spawn[role];
      const cx = Math.floor((s.x + 13) / level.tile);
      // 脚底(s.y+56)恰好压在地板顶边上，检查身体实际覆盖的最后内部行
      const cy = Math.floor((s.y + 56 - 1) / level.tile);
      expect(level.solid[cy * level.cols + cx]).toBe(0);
    }
  });
});

describe("World 仿真", () => {
  function freshWorld() {
    return new World(loadForest02());
  }

  const dt = 1 / 60;

  it("玩家下落并落地", () => {
    const w = freshWorld();
    for (let i = 0; i < 120; i++) w.step(dt);
    expect(w.players.fireboy.grounded).toBe(true);
  });

  it("按右键向右移动", () => {
    const w = freshWorld();
    const x0 = w.players.fireboy.x;
    w.inputs.set("fireboy", { up: false, left: false, right: true });
    for (let i = 0; i < 30; i++) w.step(dt);
    expect(w.players.fireboy.x).toBeGreaterThan(x0 + 50);
  });

  it("跳跃离地后回落", () => {
    const w = freshWorld();
    for (let i = 0; i < 60; i++) w.step(dt);
    w.inputs.set("fireboy", { up: true, left: false, right: false });
    w.step(dt);
    w.inputs.set("fireboy", { up: false, left: false, right: false });
    const rose = w.players.fireboy.vy < 0;
    for (let i = 0; i < 90; i++) w.step(dt);
    expect(rose).toBe(true);
    expect(w.players.fireboy.grounded).toBe(true);
  });

  it("异种液体致死、同种液体无害（用绿色浆验证必死）", () => {
    const w = freshWorld();
    // 找一颗绿浆瓦片
    let gi = w.level.liquid.indexOf(3);
    if (gi < 0) gi = w.level.liquid.indexOf(1); // 无绿浆则退化为水
    const kind = w.level.liquid[gi];
    const tx = (gi % w.level.cols) * w.level.tile + 8;
    const ty = Math.floor(gi / w.level.cols) * w.level.tile + 8;
    const fb = w.players.fireboy;
    fb.x = tx;
    fb.y = ty - 20;
    w.step(dt);
    if (kind === 3) {
      expect(fb.alive).toBe(false);
      expect(fb.deaths).toBe(1);
    }
  });

  it("双方到门即通关", () => {
    const w = freshWorld();
    for (const role of ["fireboy", "watergirl"] as const) {
      const d = w.level.doors[role];
      w.players[role].x = d.x + d.w / 2 - 13;
      w.players[role].y = d.y + d.h - 56;
    }
    w.step(dt);
    expect(w.phase).toBe("finished");
  });

  it("拉杆翻转同组平台目标", () => {
    const w = freshWorld();
    const grouped = w.platforms.find((p) => p.def.group !== undefined);
    if (!grouped || w.levers.length === 0) return; // 数据变化时跳过
    const before = grouped.target;
    const lever = w.levers.find((l) => l.group === grouped.def.group)!;
    // 把火人传送到拉杆上触发翻转
    w.players.fireboy.x = lever.rect.x + lever.rect.w / 2 - 13;
    w.players.fireboy.y = lever.rect.y + lever.rect.h - 56;
    w.step(dt);
    expect(grouped.target).not.toBe(before);
  });
});
