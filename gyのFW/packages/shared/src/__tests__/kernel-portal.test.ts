import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";
import { describe, expect, it } from "vitest";
import { parseLevel } from "../level2.js";
import { World } from "../kernel/world.js";
import { Portal } from "../kernel/mechanisms.js";
import { b2 } from "../kernel/b2.js";

const B = b2();

const IDLE = { fireboy: { up: false, left: false, right: false }, watergirl: { up: false, left: false, right: false } };
import { circleFixture } from "../kernel/b2.js";

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

/** 合成门对（绕开关卡装配，直测 §1.4 数学）：pos/rotDeg/inverted 全可控 */
function mkPair(
  a: { x: number; y: number; rot: number; inv: boolean },
  b: { x: number; y: number; rot: number; inv: boolean },
): [Portal, Portal] {
  const world = new B.b2World(new B.b2Vec2(0, 0), true);
  const pa = new Portal(B, world, { id: "PA", x: 0, y: 0, rotation: a.rot, group: 0, portalId: 7, inverted: a.inv, initialState: 1 });
  const pb = new Portal(B, world, { id: "PB", x: 0, y: 0, rotation: b.rot, group: 0, portalId: 7, inverted: b.inv, initialState: 1 });
  // 直插物理位（def x/y 是屏幕 px，走 phys 换算；测试里用米级物理坐标直接 SetPosition）
  pa.body.SetPosition(new B.b2Vec2(a.x, a.y));
  pb.body.SetPosition(new B.b2Vec2(b.x, b.y));
  pa.other = pb;
  pb.other = pa;
  return [pa, pb];
}

/** 可传载体替身：带密度可控的标记圆（mass=密度×πr²，r=0.1） */
function mkBody(mass: number): any {
  const world = new B.b2World(new B.b2Vec2(0, 0), true);
  const bd = new B.b2BodyDef();
  bd.type = B.b2BodyType.b2_dynamicBody;
  const body = world.CreateBody(bd);
  circleFixture(body, B, 0.1, undefined, { categoryBits: 4096, maskBits: 4096, density: mass / (Math.PI * 0.01) });
  return body;
}

// D 部 crystal 传送门内核（01号档 §1.1-1.7 / §5.2 九例对拍口径）：
// 配对=portalId 桶；transport 出口偏移（混合对门平面镜像）/速度（同 inverted 对镜像回弹）、
// 低速钳 10/mass、200ms 每体冷却、关门不传。
describe("Portal 内核", () => {
  it("crystal_03 真数据：8 门全部 portalId 配对互指，体/fixture 就位", () => {
    const lv = loadLevel("crystal_03", "tutorials/levels");
    expect(lv.portals.length).toBe(8);
    expect(Number.isFinite(lv.portals[0].x)).toBe(true);
    expect(Number.isFinite(lv.portals[0].y)).toBe(true);
    const w = new World(lv);
    expect(w.portals.length).toBe(8);
    for (const p of w.portals) {
      expect(p.other).not.toBeNull();
      expect(p.other!.other).toBe(p);
      expect(p.sensorFixture).toBeTruthy();
      expect(p.eventHorizon).toBeTruthy();
    }
  });

  it("crystal_04 initialState:1 → 建世即开门（01号档 §1.1 实测链）", () => {
    const lv = loadLevel("crystal_04", "crystal/levels");
    expect(lv.portals.some((p) => p.initialState === 1)).toBe(true);
    const w = new World(lv);
    expect(w.portals.some((p) => p.state === 1)).toBe(true);
  });

  it("transport 数学·混合对（rot0）：偏移门平面镜像、速度直穿 + 低速钳 10/mass", () => {
    const [a, b] = mkPair({ x: 10, y: 0, rot: 0, inv: false }, { x: -5, y: 3, rot: 0, inv: true });
    const body = mkBody(0.5);
    body.SetPosition(new B.b2Vec2(10.5, 0.7));
    body.SetLinearVelocity(new B.b2Vec2(2, 1));
    a.transport(body, new WeakMap(), 0);
    const p = body.GetPosition();
    expect(p.x).toBeCloseTo(-5.5, 9); // d=(0.5,0.7) 镜像→(−0.5,0.7)，Δ=0 直加
    expect(p.y).toBeCloseTo(3.7, 9);
    const v = body.GetLinearVelocity();
    const m = Math.hypot(v.x, v.y);
    expect(m).toBeCloseTo(10 / 0.5, 6); // |(2,1)|=√5<10 → 钳到 10/mass=20
    expect(v.x / v.y).toBeCloseTo(2, 6); // 方向不变（直穿）
  });

  it("transport 数学·同 inverted 对（rot0）：偏移不镜像、速度镜 x 回弹（|v|≥10 不触钳）", () => {
    const [a, b] = mkPair({ x: 10, y: 0, rot: 0, inv: false }, { x: -5, y: 3, rot: 0, inv: false });
    const body = mkBody(0.5);
    body.SetPosition(new B.b2Vec2(10.5, 0.7));
    body.SetLinearVelocity(new B.b2Vec2(12, 3));
    a.transport(body, new WeakMap(), 0);
    const p = body.GetPosition();
    expect(p.x).toBeCloseTo(-4.5, 9); // d 不镜像
    expect(p.y).toBeCloseTo(3.7, 9);
    const v = body.GetLinearVelocity();
    expect(v.x).toBeCloseTo(-12, 9); // 关于门平面（竖直）镜像：vx 反号
    expect(v.y).toBeCloseTo(3, 9);
  });

  it("transport 数学·Δ=90°：出口偏移按两门转差旋转（CCW 口径与 §5.2 对拍一致）", () => {
    const [a, b] = mkPair({ x: 10, y: 0, rot: 0, inv: false }, { x: -5, y: 3, rot: 90, inv: true });
    const body = mkBody(0.5);
    body.SetPosition(new B.b2Vec2(10.5, 0.7));
    body.SetLinearVelocity(new B.b2Vec2(20, 0));
    a.transport(body, new WeakMap(), 0);
    const p = body.GetPosition();
    // 混合对：d 镜像→(−0.5,0.7)；Δ=+π/2 → rd=(d·cosΔ−d·sinΔ, d·sinΔ+d·cosΔ)=(−0.7,−0.5)
    expect(p.x).toBeCloseTo(-5 - 0.7, 9);
    expect(p.y).toBeCloseTo(3 - 0.5, 9);
    const v = body.GetLinearVelocity();
    expect(Math.hypot(v.x, v.y)).toBeCloseTo(20, 6); // 速度只转不镜、≥10 不触钳
  });

  it("近面判定 + 200ms 每体冷却：贴面即传、冷却内拦、跨 200ms 放行、关门不传", () => {
    const [a] = mkPair({ x: 10, y: 0, rot: 0, inv: false }, { x: -5, y: 3, rot: 0, inv: true });
    const body = mkBody(0.5);
    const lastT = new WeakMap<object, number>();
    const onPlane = new B.b2Vec2(10.1, 0.5); // |本地x|=0.1 ≤ 0.2 带、|y|=0.5 ≤ 1.5
    body.SetPosition(new B.b2Vec2(onPlane.x, onPlane.y));
    a.checkTransport([{ body }], lastT, 1000);
    expect(body.GetPosition().x).toBeCloseTo(-5.1, 9); // 已传到出口侧（镜像 x）

    body.SetPosition(new B.b2Vec2(onPlane.x, onPlane.y));
    a.checkTransport([{ body }], lastT, 1100); // 100ms < 200ms → 拦
    expect(body.GetPosition().x).toBeCloseTo(onPlane.x, 9);

    body.SetPosition(new B.b2Vec2(onPlane.x, onPlane.y));
    a.checkTransport([{ body }], lastT, 1300); // 300ms ≥ 200ms → 放行
    expect(body.GetPosition().x).toBeCloseTo(-5.1, 9);

    a.state = 0;
    a.signalApply(); // 关门（filter 0）
    body.SetPosition(new B.b2Vec2(onPlane.x, onPlane.y));
    a.checkTransport([{ body }], lastT, 5000);
    expect(body.GetPosition().x).toBeCloseTo(onPlane.x, 9); // 关门不传
    expect(a.soundQueue).toContain("portalClose"); // 开关门音效入队
  });

  it("带外不触发：本地 |x|>0.2（感应区外沿）与 |y|>1.5（门外高度）均不传", () => {
    const [a] = mkPair({ x: 10, y: 0, rot: 0, inv: false }, { x: -5, y: 3, rot: 0, inv: true });
    const body = mkBody(0.5);
    const lastT = new WeakMap<object, number>();
    body.SetPosition(new B.b2Vec2(10.3, 0)); // |x|=0.3 出带
    a.checkTransport([{ body }], lastT, 0);
    expect(body.GetPosition().x).toBeCloseTo(10.3, 9);
    body.SetPosition(new B.b2Vec2(10.05, 1.8)); // |y|=1.8 门外
    a.checkTransport([{ body }], lastT, 0);
    expect(body.GetPosition().y).toBeCloseTo(1.8, 9);
  });

  it("光束穿开门（§1.5）：Beamer 命中入射面 → 跳出口门续射；关门 → 光不交互直穿", async () => {
    const { Beamer } = await import("../kernel/mechanisms.js");
    // 门对：入口 (0,0) rot0 inv=false，出口 (−6,2) rot0 inv=true（混合对）
    const world = new B.b2World(new B.b2Vec2(0, 0), true);
    const pa = new Portal(B, world, { id: "PA", x: 0, y: 0, rotation: 0, group: 0, portalId: 3, inverted: false, initialState: 1 });
    const pb = new Portal(B, world, { id: "PB", x: 0, y: 0, rotation: 0, group: 0, portalId: 3, inverted: true, initialState: 1 });
    pa.body.SetPosition(new B.b2Vec2(0, 0));
    pb.body.SetPosition(new B.b2Vec2(-6, 2));
    pa.other = pb;
    pb.other = pa;
    // 发射座 (5,0) 朝 −x（rotation 0 默认向左）→ 射向入口门面（竖直）
    const beamer = new Beamer(B, world, { id: "b0", x: -160, y: 0, rotation: 0, group: 0, color: "red", initialState: 1 });
    beamer.body.SetPosition(new B.b2Vec2(5, 0));
    beamer.update(true, 1);
    let pts = beamer.beamPts!;
    expect(pts.length).toBeGreaterThanOrEqual(3); // 座 → 入射点 → 出口门续射段
    expect(pts[1].x).toBeCloseTo(0.1, 6); // 入射面 x=+0.1（eventHorizon 半厚）
    // 出口续射原点：入射点 (0.1,0) 关于门面镜像→(−0.1,0)，加出口位 → (−6.1,2)
    expect(pts[2].x).toBeCloseTo(-6.1, 6);
    expect(pts[2].y).toBeCloseTo(2, 6);
    // 关门（filter 0 语义=光不交互）：束线不再含入射点，直穿门位向世界边
    pa.state = 0;
    pa.signalApply();
    beamer.update(false, 2);
    pts = beamer.beamPts!;
    expect(pts.some((q) => Math.abs(q.x - 0.1) < 1e-6)).toBe(false);
  });

  it("crystal_04 真数据集成：initialState 开门对全链路传送（World.step 含 Step 求解）", () => {
    const lv = loadLevel("crystal_04", "crystal/levels");
    const w = new World(lv);
    const open = w.portals.find((p) => p.state === 1 && p.other);
    expect(open).toBeDefined();
    const other = open!.other!;
    // 角色置于入口门触发带（本地 +x 0.15、门高 +0.5 处）
    const ang = open!.body.GetAngle();
    const pos = open!.body.GetPosition();
    const nx = Math.cos(ang);
    const ny = Math.sin(ang);
    const ex = -Math.sin(ang);
    const ey = Math.cos(ang);
    const fb = w.players.fireboy.body;
    fb.SetPosition(new B.b2Vec2(pos.x + nx * 0.15 + ex * 0.5, pos.y + ny * 0.15 + ey * 0.5));
    fb.SetLinearVelocity(new B.b2Vec2(0, 0));
    const ev1 = w.step(1 / 60, IDLE);
    const p2 = fb.GetPosition();
    const opos = other.body.GetPosition();
    // 已传到出口门邻域（≤2.5m；含重力一步/低速钳推进）
    expect(Math.hypot(p2.x - opos.x, p2.y - opos.y)).toBeLessThan(2.5);
    // 传送帧 portalTransport 音效排水为 mech 事件
    expect(ev1.some((e) => e.type === "mech" && e.event.kind === "portal")).toBe(true);
  });
});
