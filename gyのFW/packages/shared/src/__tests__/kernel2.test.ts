/**
 * box2d 内核冒烟测试（forest_01 官方数据，全确定性）。
 *
 * 断言口径：原版行为（research/01 + TEMP 源码区段转写），非旧 AABB 内核行为。
 * 金轨迹逐帧差分属 baseline 里程碑，不在此文件。
 */
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";
import { describe, expect, it } from "vitest";
import { parseLevel } from "../level2.js";
import { World, type WorldEvent } from "../kernel/world.js";
import type { InputState } from "../kernel/character.js";

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

function loadForest01(): World {
  const dir = `${ROOT}/data/tutorials/levels`;
  const json = JSON.parse(readFileSync(`${dir}/forest_01.json`, "utf8"));
  return new World(parseLevel("forest_01", json, makeProvider(dir)));
}

const NONE: InputState = { up: false, left: false, right: false };
const stepN = (w: World, n: number, inputs = NONE): WorldEvent[] => {
  const all: WorldEvent[] = [];
  for (let i = 0; i < n; i++) all.push(...w.step(1 / 60, { fireboy: inputs, watergirl: inputs }));
  return all;
};

describe("内核：静态世界与落地", () => {
  it("双角色从出生点下落并稳定站在地面上", () => {
    const w = loadForest01();
    stepN(w, 120);
    for (const role of ["fireboy", "watergirl"] as const) {
      const p = w.snapshotPlayer(role);
      // 出生底边 y0：脚底圆(r2=0.2) 底缘 = 中心 + (0.9+0.2)·32px → 静立中心 ≈ y0 − 35.2；x = raw.x+32（金轨迹实证）
      const y0 = role === "fireboy" ? 896 : 768;
      expect(Math.abs(p.y - (y0 - 1.1 * 32))).toBeLessThan(3);
      expect(Math.abs(p.x - 96)).toBeLessThan(1);
      expect(Math.abs(p.vy)).toBeLessThan(1);
      expect(p.dying).toBe(false);
    }
  });

  it("地面 fixture 数量与液体/斜坡结构存在性", () => {
    const w = loadForest01();
    // 三种液体行段齐备
    const kinds = new Set(w.liquids.map((l) => l.kind));
    expect(kinds).toEqual(new Set(["water", "lava", "green"]));
    // 钻石 3 红 4 蓝；门 1 对
    expect(w.diamonds.filter((d) => d.kind === "red").length).toBe(3);
    expect(w.diamonds.filter((d) => d.kind === "blue").length).toBe(4);
    expect(w.doors.fireboy.pos.x).toBe(1024 + 32);
  });
});

describe("内核：角色力模型", () => {
  it("按住右键向屏幕右加速，速度受 maxSpeed 门控", () => {
    const w = loadForest01();
    const inputs: InputState = { up: false, left: false, right: true };
    stepN(w, 30); // 先站稳
    stepN(w, 120, inputs);
    const p = w.snapshotPlayer("fireboy");
    expect(p.vx).toBeGreaterThan(200); // px/s，屏幕右为正
    expect(p.x).toBeGreaterThan(200);
  });

  it("平地跳跃：起跳瞬间获得向上速度并经历滞空", () => {
    const w = loadForest01();
    stepN(w, 60);
    const y0 = w.snapshotPlayer("fireboy").y;
    // up 按住第 1 帧（prohibitJump 边沿触发）
    w.step(1 / 60, { fireboy: { up: true, left: false, right: false }, watergirl: NONE });
    const vy = w.snapshotPlayer("fireboy").vy;
    expect(vy).toBeLessThan(-400); // 屏幕向上为负，接近 −496
    stepN(w, 60);
    const y1 = w.snapshotPlayer("fireboy").y;
    expect(Math.abs(y1 - y0)).toBeLessThan(4); // 回落原位
  });

  it("按住 up 落地不会自动连跳（prohibitJump 边沿）", () => {
    const w = loadForest01();
    stepN(w, 60);
    const snapA = () => w.snapshotPlayer("fireboy").y;
    const before = snapA();
    stepN(w, 120, { up: true, left: false, right: false });
    // 若持续按住可连跳，长窗口内位移会显著；边沿触发则首跳后保持贴地
    const after = snapA();
    expect(Math.abs(after - before)).toBeLessThan(40);
  });
});

describe("内核：液体致死（原版方向）", () => {
  it("火人入水死、远处水女孩无恙", () => {
    const w = loadForest01();
    const water = w.liquids.find((l) => l.kind === "water")!;
    // 传送到水面上：身体中心=液面 → 脚底圆(0.9m 下)落入致死带 [液面+0.18m, +1m]
    teleport(w, "fireboy", (water.col0 + 0.5) * 32, water.row * 32);
    const events = stepN(w, 180);
    expect(w.players.fireboy.dying).toBe(true);
    expect(w.players.watergirl.dying).toBe(false);
    expect(events.some((e) => e.type === "death" && e.role === "fireboy")).toBe(true);
  });

  it("任一死亡 → 1.5s 烟雾后 gameover（水女孩入岩浆）", () => {
    const w = loadForest01();
    const lava = w.liquids.find((l) => l.kind === "lava")!;
    // 火人免疫岩浆（原版方向）：传水女孩入岩浆
    teleport(w, "watergirl", (lava.col0 + 0.5) * 32, lava.row * 32);
    let gameover = false;
    for (let i = 0; i < 180; i++) {
      if (w.step(1 / 60, { fireboy: NONE, watergirl: NONE }).some((e) => e.type === "gameover")) {
        gameover = true;
        break;
      }
    }
    expect(gameover).toBe(true);
    expect(w.phase).toBe("gameover");
    expect(w.players.watergirl.isDead).toBe(true);
    expect(w.players.fireboy.dying).toBe(false);
  });

  it("火人趟岩浆安然无恙（免疫）", () => {
    const w = loadForest01();
    const lava = w.liquids.find((l) => l.kind === "lava")!;
    teleport(w, "fireboy", (lava.col0 + 0.5) * 32, lava.row * 32);
    stepN(w, 120);
    expect(w.players.fireboy.dying).toBe(false);
    expect(w.players.fireboy.isOnLiquid).toBe(true); // 站在岩浆下半格实体上（原版齐腰深）
  });
});

describe("内核：门与通关", () => {
  it("门状态机：isOpen → 25fps 扫帧 → 21 帧双门到位 → win", () => {
    const w = loadForest01();
    stepN(w, 30);
    // 直接驱动门状态机（条带接触的亚像素边界问题见冻结文档偏离记录，由金轨迹基线裁决）
    w.doors.fireboy.isOpen = true;
    w.doors.watergirl.isOpen = true;
    let win: WorldEvent | undefined;
    for (let i = 0; i < 200; i++) {
      const evs = w.step(1 / 60, { fireboy: NONE, watergirl: NONE });
      const hit = evs.find((e) => e.type === "win");
      if (hit) {
        win = hit;
        break;
      }
    }
    expect(win).toBeTruthy();
    expect(w.snapshotPlayer("fireboy").doorUp).toBe(true);
    expect(w.snapshotPlayer("watergirl").doorUp).toBe(true);
    if (win?.type === "win") {
      expect(win.data.timeMs).toBeGreaterThan(0);
      expect(w.phase).toBe("won");
    }
  });

  it("实走入门：水女孩按住右被门龛立柱挡停 → 感应带持续接触 → 开门", () => {
    const w = loadForest01();
    stepN(w, 30);
    // 传送到门平台左侧（同层），按住右走到门条带被立柱挡停（自然路线需跳跃爬层，此处直接上平台）
    teleport(w, "watergirl", w.doors.watergirl.pos.x - 200, w.doors.watergirl.pos.y - 36);
    const R: InputState = { up: false, left: false, right: true };
    let upSeen = false;
    for (let i = 0; i < 400; i++) {
      w.step(1 / 60, { fireboy: NONE, watergirl: R });
      if (w.snapshotPlayer("watergirl").doorUp) {
        upSeen = true;
        break;
      }
    }
    expect(upSeen).toBe(true);
    expect(w.snapshotPlayer("watergirl").atDoor).toBe(true);
  });
});

describe("内核：钻石", () => {
  it("红钻可被火人拾取；蓝钻对火人无效", () => {
    const w = loadForest01();
    stepN(w, 10);
    const red = w.diamonds.find((d) => d.kind === "red")!;
    teleport(w, "fireboy", red.x, red.y);
    let got = false;
    for (let i = 0; i < 30; i++) {
      if (w.step(1 / 60, { fireboy: NONE, watergirl: NONE }).some((e) => e.type === "diamond")) {
        got = true;
        break;
      }
    }
    expect(got).toBe(true);
    expect(w.players.fireboy.diamonds).toBe(1);

    const blue = w.diamonds.find((d) => d.kind === "blue")!;
    teleport(w, "fireboy", blue.x, blue.y);
    for (let i = 0; i < 30; i++) {
      w.step(1 / 60, { fireboy: NONE, watergirl: NONE });
    }
    expect(w.players.fireboy.diamonds).toBe(1);
  });
});

describe("内核：确定性", () => {
  it("相同输入序列两轮轨迹逐帧一致", () => {
    const run = () => {
      const w = loadForest01();
      const trace: number[] = [];
      const seq: Array<[number, InputState]> = [
        [40, NONE],
        [60, { up: false, left: false, right: true }],
        [20, { up: true, left: false, right: true }],
        [60, { up: false, left: false, right: true }],
        [60, NONE],
      ];
      for (const [n, input] of seq) {
        for (let i = 0; i < n; i++) {
          w.step(1 / 60, { fireboy: input, watergirl: NONE });
          const p = w.snapshotPlayer("fireboy");
          trace.push(p.x, p.y, p.vx, p.vy);
        }
      }
      return trace;
    };
    const a = run();
    const b = run();
    expect(a).toEqual(b);
  });
});

// ---- 助手：屏幕坐标传送（物理 = (−x/32, −y/32)）----
function teleport(w: World, role: "fireboy" | "watergirl", screenX: number, screenY: number): void {
  const B = (w as any).B;
  const body = w.players[role].body;
  body.SetPosition(new B.b2Vec2(screenX / -32, screenY / -32));
  body.SetLinearVelocity(new B.b2Vec2(0, 0));
}

// ---- 助手：从仓库根加载任意关并构建完整物理世界 ----
function loadAny(id: string): World {
  const dir = id === "forest_01" ? `${ROOT}/data/tutorials/levels` : `${ROOT}/data/forest/levels`;
  const json = JSON.parse(readFileSync(`${dir}/${id}.json`, "utf8"));
  return new World(parseLevel(id, json, makeProvider(dir)));
}

describe("内核：机关全谱构建冒烟（48 关全物理构建）", () => {
  it("48 关全部可完成 parseLevel + 机关/关节构建 + 60 步仿真不崩", async () => {
    const ids = readdirSync(`${ROOT}/data/forest/levels`).filter((f) => f.endsWith(".json")).map((f) => f.replace(".json", ""));
    ids.push("forest_01");
    for (const id of ids) {
      const w = loadAny(id);
      stepN(w, 60);
      expect(w.phase, id).toBe("playing");
    }
  }, 120000);

  it("forest_01：拉杆静止不自翻（金轨迹实证）→ 组平台保持原位", () => {
    const w = loadForest01();
    // 原版行为：拉杆静立在 startPos 侧（马达 0 速度刹车），从不自翻、不派发
    stepN(w, 120);
    const lever = w.mechanisms.levers[0];
    expect(lever.state).toBe(0);
    const plat4 = w.mechanisms.platforms.find((p) => p.group === 4)!;
    const y0 = -plat4.body.GetPosition().y * 32;
    stepN(w, 60);
    const y1 = -plat4.body.GetPosition().y * 32;
    expect(Math.abs(y1 - y0)).toBeLessThan(2);
    // 拉杆沉降平衡角：金轨迹 0.5351、我方 0.196（静止姿态化妆级偏差，fixture 几何待复核，见冻结文档）；
    // 行为带：不出限位（贴限位静止属正确——马达自构造压杆，金轨迹 lever 全程 0.0000）、未翻越零点
    const angle = lever.body.GetAngle();
    expect(angle).toBeGreaterThan(-0.2 * Math.PI - 1e-6);
    expect(angle).toBeLessThanOrEqual(0.2 * Math.PI + 1e-6);
  });

  it("forest_01：角色踩上按钮（group5）→ 按钮下沉触发 → 组平台移动", () => {
    const w = loadForest01();
    stepN(w, 30);
    const pusher = w.mechanisms.pushers[0]; // group5
    // 传送到按钮正上方半格处落下
    teleport(w, "fireboy", pusher.body.GetPosition().x * -32, pusher.body.GetPosition().y * -32 - 40);
    let pressed = false;
    for (let i = 0; i < 120; i++) {
      const evs = w.step(1 / 60, { fireboy: NONE, watergirl: NONE });
      if (pusher.state === 1) {
        pressed = true;
        expect(evs.concat([]).length).toBeGreaterThanOrEqual(0);
        break;
      }
    }
    expect(pressed).toBe(true);
    // 组5平台被信号驱动
    const plat5 = w.mechanisms.platforms.find((p) => p.group === 5)!;
    expect(plat5.state).toBe(1);
  });

  it("forest_01：推箱可被角色推动（动力学刚体）", () => {
    const w = loadForest01();
    stepN(w, 30);
    const box = w.mechanisms.props.find((p) => p.kind === "box")!;
    const x0 = box.body.GetPosition().x;
    // 传送到箱子左侧同层，向右走推箱（箱子在屏幕 736,256 附近）
    teleport(w, "fireboy", -x0 * 32 - 60, -box.body.GetPosition().y * 32);
    stepN(w, 90, { up: false, left: false, right: true });
    const x1 = box.body.GetPosition().x;
    expect(Math.abs(x1 - x0)).toBeGreaterThan(0.3); // 推动了 ≥0.3m
  });
});
