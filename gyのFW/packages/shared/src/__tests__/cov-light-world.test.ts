/**
 * 覆盖率恢复批（fw-cov，2026-10-30）：灯光神庙内核 + World 液体光照/风柱/钻石/门带集成。
 *
 * A 段：light 真数据关（light_11 滑轨/无限镜/转镜、light_29 滑轮箱镜、light_31 风车罗马杆、
 *       light_03 吊挂）——World 级 step 驱动 lightDevices 逆序链与 mechSnapshot 全字段。
 * B 段：合成光具台（裸 b2 世界直构 Beamer/LightPusher）——光束分类回调四支
 *       （不透明/transparent-sensor/mirror 反射/portal 穿透）+ 熄灭清束 + 缓存复用。
 * 断言语义锚：mechanisms.ts 行内 oracle 偏移注（@1629100 ReportFixture、@1630033 反射式）、
 * world.ts 头注 F7/门 25fps 扫帧、note/evidence/2026-10-30-fairytales/01号档。
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";
import { describe, expect, it } from "vitest";
import { parseLevel, type LevelData } from "../level2.js";
import { World } from "../kernel/world.js";
import { Beamer, LightPusher } from "../kernel/mechanisms.js";
import { b2 } from "../kernel/b2.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");

function loadLevel(id: string, dir: string): LevelData {
  const json = JSON.parse(readFileSync(`${ROOT}/data/${dir}/${id}.json`, "utf8"));
  const cache = new Map<string, any>();
  const prov = (source: string) => {
    const base = source.split("/").pop()!;
    if (!cache.has(base)) cache.set(base, JSON.parse(readFileSync(join(ROOT, "assets/tilemaps/tilesets", base), "utf8")));
    return cache.get(base);
  };
  return parseLevel(id, json, prov);
}

const IDLE = { fireboy: { up: false, left: false, right: false }, watergirl: { up: false, left: false, right: false } };

function teleport(w: World, role: "fireboy" | "watergirl", screenX: number, screenY: number): void {
  w.players[role].body.SetPosition(new (w as any).B.b2Vec2(-screenX / 32, -screenY / 32));
  w.players[role].body.SetLinearVelocity(new (w as any).B.b2Vec2(0, 0));
}

describe("A. light 真数据：World 光链 + 快照全字段", () => {
  it("light_11：滑轨/无限镜/转镜/光钮/光束全装配，步进后光束成形且快照可序列化", () => {
    const lv = loadLevel("light_11", "light/levels");
    const w = new World(lv);
    expect(w.mechanisms.beamers.length).toBeGreaterThan(0);
    expect(w.mechanisms.rotMirrors.length).toBeGreaterThan(0);
    expect(w.mechanisms.infiniteMirrors.length).toBeGreaterThan(0);
    expect(w.mechanisms.lightPushers.length).toBeGreaterThan(0);
    expect(w.mechanisms.sliders.length).toBeGreaterThan(0);
    for (let i = 0; i < 90; i++) w.step(1 / 60, IDLE);
    // 光束成形：亮束 beamer 折线非空（世界四壁兜底恒命中）
    const lit = w.mechanisms.beamers.filter((b) => b.state === 1);
    expect(lit.length).toBeGreaterThan(0);
    expect(lit[0].beamPts!.length).toBeGreaterThanOrEqual(2);
    // 缓存复用：静止世界两帧 packed 逐位一致（r12 Round A/C 语义）
    const p1 = lit[0].packed();
    w.step(1 / 60, IDLE);
    expect(lit[0].packed()).toBe(p1);
    // 仿真钟推进（缺省 windClockS=simTimeS 口径）
    expect(w.simSeconds).toBeCloseTo(91 / 60, 5);
    // 快照全字段序列化（server 每 tick 写 schema 的直读面）
    const m = w.mechSnapshot();
    expect(m.beamers.length).toBe(w.mechanisms.beamers.length);
    expect(m.rotMirrors.length).toBe(w.mechanisms.rotMirrors.length);
    expect(m.infiniteMirrors.length).toBe(w.mechanisms.infiniteMirrors.length);
    expect(m.lightPushers.length).toBe(w.mechanisms.lightPushers.length);
    expect(m.sliders.length).toBe(w.mechanisms.sliders.length);
    expect(Number.isFinite(m.beamers[0].id)).toBe(true);
    expect(typeof m.beamers[0].pts).toBe("string");
    expect(Number.isFinite(m.rotMirrors[0].x)).toBe(true);
    expect(Number.isFinite(m.sliders[0].x)).toBe(true);
    expect(m.liquidsFrozen.every((f) => f === false)).toBe(true);
  });

  it("mechSnapshot 吊挂/滑轮/罗马/风车/道具/定时杆字段（light_03/29/31 三关拼图）", () => {
    for (const [id, dir] of [
      ["light_03", "light/levels"],
      ["light_29", "light/levels"],
      ["light_31", "light/levels"],
    ] as const) {
      const w = new World(loadLevel(id, dir));
      const m = w.mechSnapshot();
      if (id === "light_03") {
        expect(m.hangings.length).toBe(1);
        expect(Number.isFinite(m.hangings[0].x)).toBe(true);
      }
      if (id === "light_29") {
        expect(m.pulleys.length).toBe(1);
        expect(Number.isFinite(m.pulleys[0].a.x)).toBe(true);
        expect(Number.isFinite(m.pulleys[0].b.angle)).toBe(true);
        expect(m.props.some((p) => p.kind === "boxheavy")).toBe(true);
      }
      if (id === "light_31") {
        expect(m.romans.length).toBe(1);
        expect(m.winds.length).toBe(1);
        expect(typeof m.winds[0].state).toBe("number");
        expect(m.winds[0].group).toBeDefined();
        expect(m.props.some((p) => p.kind === "ball")).toBe(true);
      }
      if (id !== "light_03") {
        expect(m.levers.length).toBeGreaterThan(0);
        expect(m.pushers.length).toBeGreaterThan(0);
        expect(m.platforms.length).toBeGreaterThan(0);
        expect(Number.isFinite(m.platforms[0].x)).toBe(true);
      }
    }
  });
});

describe("B. 合成光具台：光束分类回调四支 + 熄灭/复用", () => {
  /** 裸世界光具台：三束 beamer + 镜/透感/portal 具 + 光钮 */
  function rig() {
    const B = b2();
    const world = new B.b2World(new B.b2Vec2(0, -31.25), true);
    const mkStatic = (x: number, y: number, hw: number, hh: number, lp: any, angle = 0) => {
      const bd = new B.b2BodyDef();
      bd.type = B.b2BodyType.b2_staticBody;
      bd.position = new B.b2Vec2(-x / 32, -y / 32);
      bd.angle = angle;
      const body = world.CreateBody(bd);
      const shape = new B.b2PolygonShape();
      shape.SetAsOrientedBox(hw, hh, new B.b2Vec2(0, 0), 0);
      const fd = new B.b2FixtureDef();
      fd.shape = shape;
      fd.userData = lp ? { lightProperties: lp } : undefined;
      body.CreateFixture(fd);
      return body;
    };
    const beamer = (x: number, y: number, color: string) => {
      const b = new Beamer(B, world, { id: "L", x, y, rotation: 0, group: 0, color, initialState: 1 });
      return b;
    };
    // B1：(200,200) 射屏右 → 透感(300) → 镜(400) 反射 → 终点任意
    const b1 = beamer(200, 200, "yellow");
    mkStatic(300, 200, 0.2, 0.2, { type: "transparent", sensor: true }); // 透感：标记+穿透
    const mirror = mkStatic(400, 200, 0.5, 0.05, { type: "mirror" }, Math.PI / 4); // 45° 镜：反射
    // B2：(100,400) 射屏右 → portal 具穿透 → 世界无命中 → 50m 断束
    const b2beam = beamer(100, 400, "red");
    mkStatic(500, 400, 0.3, 0.3, { type: "portal" });
    // B3：(100,300) 射屏右 → 光钮 sensor(400) 停束
    const b3 = beamer(100, 300, "blue");
    const pusher = new LightPusher(B, world, { id: "P", x: 400, y: 300, rotation: 0, group: 5, color: "blue" });
    return { B, world, b1, b2beam, b3, pusher, mirror };
  }

  it("透感标记/镜反射/portal 穿透/无命中断束 四支 + 透感 iluminated 写入", () => {
    const { b1, b2beam, b3, pusher } = rig();
    b1.update(false, 0);
    // 透感被标记（iluminated/lightAt 写入——02号档 §8 消费后自清语义归 LightPusher）
    b1.update(true, 1); // 第二帧：签名稳定+epoch 同 → 缓存复用分支（重放标记）
    expect(b1.beamPts!.length).toBeGreaterThanOrEqual(3); // 起点+镜点+反射终点（透感不放点）
    const packed = b1.packed();
    expect(packed).toContain(","); // 多折点打包串
    b2beam.update(false, 0);
    // portal 穿透后世界无命中：折线=起点+50m 断束点，恰 2 点
    expect(b2beam.beamPts!.length).toBe(2);
    // 光钮：B3 照射 → iluminated=color → checkState 0→1 派发
    b3.update(false, 0);
    const events: any[] = [];
    pusher.checkState(events);
    expect(pusher.state).toBe(1);
    expect(events).toEqual([{ kind: "lightpusher", group: 5, state: 1 }]);
    // 光钮 sensor lp 被标记后每帧清（@1659550 尾行：iluminated 消费后自清）
    expect((pusher as unknown as { sensorLp: { iluminated: string | null } }).sensorLp.iluminated).toBeNull();
    // 熄灭：state=0 → 清束（beamPts null / packed 空）
    b2beam.state = 0;
    b2beam.update(true, 2);
    expect(b2beam.beamPts).toBeNull();
    expect(b2beam.packed()).toBe("");
    b2beam.state = 1;
    b2beam.update(false, 3);
    expect(b2beam.beamPts!.length).toBe(2);
  });

  it("光钮光断：光源转向后 sensor 失照 → state 1→0 派发（照到=1/光断=0）", () => {
    const { b3, pusher } = rig();
    b3.update(false, 0);
    pusher.checkState([]);
    expect(pusher.state).toBe(1);
    // 转向背对：束不再触 sensor → 失照
    b3.body.SetAngle(Math.PI);
    b3.update(false, 1);
    const events: any[] = [];
    pusher.checkState(events);
    expect(pusher.state).toBe(0);
    expect(events).toEqual([{ kind: "lightpusher", group: 5, state: 0 }]);
    expect(() => pusher.updateState(false)).not.toThrow();
  });
});
