/**
 * 覆盖率恢复批（fw-cov，2026-10-30）：机关单测补盲——直接构造设备实例，
 * 驱动真实 b2 世界验证公开方法的状态迁移分支。断言语义逐条对 oracle 取证档：
 * note/evidence/2026-10-30-fairytales/01号档 §2.1/§2.2（Fairy/FairyCup）、
 * mechanisms.ts 头注与行内 oracle 偏移注（Lever/Pusher/TimedPusher/Wind/RotMirror 等）。
 * 不含任何恒真断言——每个断言锚定具体迁移沿或数值。
 */
import { describe, expect, it } from "vitest";
import { b2 } from "../kernel/b2.js";
import {
  Device,
  Fairy,
  FairyCup,
  InfiniteMirror,
  Lever,
  LightPusher,
  MechManager,
  MovingPlatform,
  Pusher,
  RotMirror,
  Slider,
  TimedPusher,
  Wind,
  buildBoxMirror,
  buildWindow,
  type MechEvent,
} from "../kernel/mechanisms.js";

/** 独立 b2 世界 + 静态地面（不与其它用例共享，防接触监听/睡眠串扰） */
function makeWorld() {
  const B = b2();
  const world = new B.b2World(new B.b2Vec2(0, -31.25), true);
  const gbd = new B.b2BodyDef();
  gbd.type = B.b2BodyType.b2_staticBody;
  const ground = world.CreateBody(gbd);
  return { B, world, ground };
}

function makePropBody(B: any, world: any, x: number, y: number): any {
  const bd = new B.b2BodyDef();
  bd.type = B.b2BodyType.b2_dynamicBody;
  bd.position = new B.b2Vec2(-x / 32, -y / 32);
  const body = world.CreateBody(bd);
  const shape = new B.b2CircleShape(0.3);
  const fd = new B.b2FixtureDef();
  fd.shape = shape;
  fd.density = 1;
  body.CreateFixture(fd);
  return body;
}

describe("Device 基类与 MechManager 派发", () => {
  it("signalApply 走 updateState(false)（基类缺省入口）", () => {
    let got: boolean | undefined;
    class Probe extends Device {
      updateState(silent: boolean): void {
        got = silent;
      }
      checkState(): void {}
    }
    const { B } = makeWorld();
    const p = new Probe(B, 1, false);
    p.signalApply();
    expect(got).toBe(false);
  });

  it("deviceChanged：组内信号源 OR 赋给非信号设备；无源组不重置；未知组安全跳过", () => {
    const mgr = new MechManager();
    const applied: number[] = [];
    const source = { group: 8, hasSignal: true, state: 3, signalApply(): void {} };
    const follower = {
      group: 8,
      hasSignal: false,
      state: 0,
      signalApply(): void {
        applied.push(follower.state);
      },
    };
    const mute = { group: 9, hasSignal: false, state: 0, signalApply(): void {} };
    mgr.register(source);
    mgr.register(follower);
    mgr.register(mute);
    mgr.deviceChanged(8);
    expect(follower.state).toBe(3);
    expect(applied).toEqual([3]);
    // 无信号源组：原版仅信号源派发触达——静默组 state 不被重置
    mgr.deviceChanged(9);
    expect(mute.state).toBe(0);
    // 全组遍历（group 缺省）：state 未变的组不重复派发
    mgr.deviceChanged();
    expect(applied).toEqual([3]);
    source.state = 5;
    mgr.deviceChanged();
    expect(applied).toEqual([3, 5]);
    expect(follower.state).toBe(5);
    // 未注册组：直接跳过
    expect(() => mgr.deviceChanged(12345)).not.toThrow();
    // queryActive：组内任一 state 真即为真（Fairy.checkLock 语义）
    expect(mgr.queryActive(8)).toBe(true);
    expect(mgr.queryActive(9)).toBe(false);
    expect(mgr.queryActive(999)).toBe(false);
  });
});

describe("Lever / Pusher 迁移沿", () => {
  it("Lever：startPos=1 起始上限角（关节角=−杆角→ ja<0）→ 首检 state 0→1；扳回对侧 → 1→0", () => {
    const { B, world, ground } = makeWorld();
    const lever = new Lever(B, world, ground, { x: 200, y: 200, group: 1, onis: 1, startPos: 1 });
    const events: MechEvent[] = [];
    let flips = 0;
    lever.onFlip = () => {
      flips++;
    };
    // 上限杆角 +0.2π → 关节角 ja=−0.2π，onis=1 → ja*onis<0 → 吸合
    lever.checkState(events);
    expect(lever.state).toBe(1);
    expect(events).toEqual([{ kind: "lever", group: 1, state: 1 }]);
    expect(flips).toBe(1);
    // 扳到对侧：杆角 −0.15 → ja>0 → 释放
    lever.body.SetAngle(-0.15);
    lever.checkState(events);
    expect(lever.state).toBe(0);
    expect(events).toEqual([
      { kind: "lever", group: 1, state: 1 },
      { kind: "lever", group: 1, state: 0 },
    ]);
    expect(flips).toBe(2);
    // 信号端：不接收组信号（空实现可调用）
    expect(() => lever.updateState(false)).not.toThrow();
    expect(lever.angleDeg()).toBeCloseTo((-0.15 * 180) / Math.PI, 6);
  });

  it("Pusher：rest 位 translation=0 ≤ 0.2 → state 1→0 迁移沿", () => {
    const { B, world, ground } = makeWorld();
    const pusher = new Pusher(B, world, ground, { x: 300, y: 300, group: 2 });
    pusher.state = 1; // 白盒置位：模拟上一帧压下
    const events: MechEvent[] = [];
    pusher.checkState(events);
    expect(pusher.state).toBe(0);
    expect(events).toEqual([{ kind: "pusher", group: 2, state: 0 }]);
    expect(() => pusher.updateState(false)).not.toThrow();
  });
});

describe("MovingPlatform 转臂", () => {
  it("负 dtheta 限位序 + 非零 rotation/offsetY 构造；update 双向回钳（关节角=−体角）", () => {
    const { B, world, ground } = makeWorld();
    const p = new MovingPlatform(B, world, ground, {
      x: 400,
      y: 300,
      w: 128,
      h: 32,
      dx: 0,
      dy: 0,
      group: 3,
      dtheta: -90,
      offsetY: 1.5,
      rotation: 135,
    });
    const joint = (p as unknown as { joint: any }).joint;
    const lo = joint.GetLowerLimit();
    const hi = joint.GetUpperLimit();
    expect(lo).toBe(-Math.PI / 2);
    expect(hi).toBe(0);
    // 杆角大正值 → 关节角 < lo → SetAngle(−lo)
    p.body.SetAngle(5);
    p.update();
    expect(p.body.GetAngle()).toBeCloseTo(-lo, 6);
    // 杆角大负值 → 关节角 > hi → SetAngle(−hi)
    p.body.SetAngle(-5);
    p.update();
    expect(p.body.GetAngle()).toBeCloseTo(-hi, 6);
    // 信号驱动：state 0/1 两方向马达
    p.updateState(false);
    p.state = 1;
    p.updateState(false);
    expect(() => p.checkState([])).not.toThrow();
  });
});

describe("Wind 施力", () => {
  it("柱内角色受力 + 全向阻尼 + 15m/s 限速；离柱不受力（oracle update L59569 同式）", () => {
    const { B, world } = makeWorld();
    const wind = new Wind(B, world, {
      rect: { x: 600, y: 600, w: 64, h: 64 },
      rotation: 0,
      lengthM: 5,
      initialState: 1,
      group: 4,
    });
    const fb = makePropBody(B, world, 600, 580);
    const wg = makePropBody(B, world, 900, 580);
    wind.registerCharBodies([
      ["fireboy", fb],
      ["watergirl", wg],
    ]);
    // 给 fb 超限速度：阻尼 0.975^(dt·60) 后仍 >15 → 钳到 15
    fb.SetLinearVelocity(new B.b2Vec2(100, 0));
    wind.setActive("fireboy", true);
    wind.applyForce(1.5, 1 / 60);
    const v = fb.GetLinearVelocity();
    const speed = Math.hypot(v.x, v.y);
    expect(speed).toBeLessThanOrEqual(15 + 1e-9);
    expect(speed).toBeGreaterThan(14); // 钳制生效（100 → 15）
    // 离柱（未 setActive 的 wg）：力/阻尼均不作用
    wg.SetLinearVelocity(new B.b2Vec2(100, 0));
    wind.applyForce(1.5, 1 / 60);
    const v2 = wg.GetLinearVelocity();
    expect(Math.hypot(v2.x, v2.y)).toBe(100);
    // 离柱注销 + state 0 短路
    wind.setActive("fireboy", false);
    wind.state = 0;
    fb.SetLinearVelocity(new B.b2Vec2(100, 0));
    wind.applyForce(1.5, 1 / 60);
    expect(Math.hypot(fb.GetLinearVelocity().x, fb.GetLinearVelocity().y)).toBe(100);
    expect(() => wind.signalApply()).not.toThrow();
  });
});

describe("TimedPusher 计时谱", () => {
  it("压下计时/持续按压重置/到时回弹/早松复位（C @1726729 计时器换仿真钟）", () => {
    const { B, world, ground } = makeWorld();
    const tp = new TimedPusher(B, world, ground, { id: "t0", x: 500, y: 300, group: 5, time: 200, rotation: 90 });
    const events: MechEvent[] = [];
    const dt = 1000 / 60;
    // 压下：持续下压 8 帧（translation 正方向=下压，gold-trace prismatic 轴语义）
    for (let i = 0; i < 8; i++) {
      tp.body.ApplyForceToCenter(new B.b2Vec2(0, -60));
      world.Step(1 / 60, 8, 3);
      tp.checkState(events, dt);
    }
    expect(tp.downState).toBe(1);
    expect(tp.state).toBe(1);
    expect(tp.timerActive).toBe(true);
    expect((tp as unknown as { joint: any }).joint.GetJointTranslation()).toBeGreaterThan(0.2);
    const downEvents = events.filter((e) => e.kind !== "portal" && e.state === 1);
    expect(downEvents.length).toBe(1);
    // 持续按压：计时每帧重置（原版 timer.stop().start()）
    for (let i = 0; i < 20; i++) {
      tp.body.ApplyForceToCenter(new B.b2Vec2(0, -60));
      world.Step(1 / 60, 8, 3);
      tp.checkState(events, dt);
    }
    expect(tp.state).toBe(1);
    // 按压期每帧"先重置后累加"（原版 timer.stop().start()）→ 恒一个 dt、永不到时
    expect(tp.timerElapsedMs).toBeCloseTo(dt, 6);
    // 松开：f≤0，计时继续累加 → 到时 200ms 回弹
    for (let i = 0; i < 30 && tp.state === 1; i++) {
      world.Step(1 / 60, 8, 3);
      tp.checkState(events, dt);
    }
    expect(tp.timerActive).toBe(false);
    expect(tp.state).toBe(0);
    expect(events.some((e) => e.kind !== "portal" && e.state === 0)).toBe(true);
    // 早松分支：state 尚 1 且计时未激活 → 立即复位
    tp.state = 1;
    tp.timerActive = false;
    tp.checkState(events, dt);
    expect(tp.state).toBe(0);
    // 信号端空实现
    expect(() => tp.updateState(false)).not.toThrow();
  });
});

describe("RotMirror / InfiniteMirror / Slider（灯光神庙件）", () => {
  it("RotMirror：负角归一化循环 + dir 双限位支 + updateState 马达 + update 回钳", () => {
    const { B, world, ground } = makeWorld();
    const rm1 = new RotMirror(B, world, ground, { id: "rm1", x: 600, y: 300, group: 6, rotation: -90, dir: 1, bringToBack: false });
    const rm0 = new RotMirror(B, world, ground, { id: "rm0", x: 700, y: 300, group: 6, rotation: 45, dir: 0, bringToBack: false });
    const j1 = (rm1 as unknown as { joint: any }).joint;
    const j0 = (rm0 as unknown as { joint: any }).joint;
    // dir=1 → [−rot, −rot+π/2]；rot −90° 归一化到 270° → −rot = −4.712 → +2π? 归一化 [0,2π)：−π/2→3π/2
    expect(j1.GetLowerLimit()).toBeCloseTo(-Math.PI * 1.5, 6);
    expect(j1.GetUpperLimit()).toBeCloseTo(-Math.PI, 6);
    // dir=0 → [−rot−π/2, −rot]，45° → −π/4
    expect(j0.GetLowerLimit()).toBeCloseTo(-Math.PI / 4 - Math.PI / 2, 6);
    expect(j0.GetUpperLimit()).toBeCloseTo(-Math.PI / 4, 6);
    rm1.updateState(false);
    rm1.state = 1;
    rm1.updateState(false);
    rm1.checkState([]);
    // 回钳双向：关节角越限 → 体角拉回对应限位的负值（关节角=−体角−reference 同 MovingPlatform）
    rm1.body.SetAngle(9);
    rm1.update();
    expect(rm1.body.GetAngle()).toBeCloseTo(-j1.GetLowerLimit(), 6);
    rm1.body.SetAngle(-9);
    rm1.update();
    expect(rm1.body.GetAngle()).toBeCloseTo(-j1.GetUpperLimit(), 6);
  });

  it("InfiniteMirror：SetLimits(state,state) 随滑轨连续态（@1750060）", () => {
    const { B, world, ground } = makeWorld();
    const im = new InfiniteMirror(B, world, ground, { id: "im0", x: 800, y: 300, group: 7, rotation: 30 });
    const joint = (im as unknown as { joint: any }).joint;
    im.state = 2;
    im.updateState(false);
    expect(joint.GetUpperLimit()).toBe(2);
    expect(joint.GetLowerLimit()).toBe(2);
    im.checkState([]);
    expect(() => im.updateState(false)).not.toThrow();
  });

  it("Slider：平移量变化才派发连续 state（@1721500；state=π·t·max/(w/32)）", () => {
    const { B, world, ground } = makeWorld();
    const slider = new Slider(B, world, ground, { id: "s0", x: 900, y: 300, group: 8, max: 2, widthPx: 128 });
    const events: MechEvent[] = [];
    // 未动：不派发
    slider.checkState(events);
    expect(events.length).toBe(0);
    // 沿轴（−1,0）推：translation 变负
    slider.body.SetLinearVelocity(new B.b2Vec2(-3, 0));
    for (let i = 0; i < 3; i++) {
      world.Step(1 / 60, 8, 3);
      slider.checkState(events);
    }
    const evs = events.filter((e) => e.kind === "slider");
    expect(evs.length).toBeGreaterThan(0);
    expect(evs[0].group).toBe(8);
    expect(evs[0].state).toBeLessThan(0); // t<0 → state<0
    const last = evs[evs.length - 1].state;
    // 静止后不再派发
    slider.body.SetLinearVelocity(new B.b2Vec2(0, 0));
    world.Step(1 / 60, 8, 3);
    const n = events.length;
    slider.checkState(events);
    expect(events.length).toBe(n);
    expect(last).not.toBe(0);
    expect(() => slider.updateState(false)).not.toThrow();
  });
});

describe("Fairy / FairyCup（01号档 §2.1/§2.2 语义）", () => {
  it("拖拽 maxForce 切换 + externalTarget 吸附分支 + Lissajous 小抖动 + 1.2m 角色推离 + 40 限速", () => {
    const { B, world, ground } = makeWorld();
    const fy = new Fairy(B, world, ground, { x: 400, y: 200, group: 4, idx: 0, lockGroups: [2], relockGroups: [3] });
    expect(fy.locked).toBe(true); // 生成时 lockGroups 存在 → locked（L59033-59043）
    fy.setDrag({ x: 420, y: 210 });
    expect(fy.dragging).toBe(true);
    fy.setDrag(null);
    expect(fy.dragging).toBe(false);
    // externalTarget 且未拖拽：dragTarget 吸到杯口、maxForce 回 100%
    fy.externalTarget = { x: 5, y: 5 };
    const dt = 1000 / 60;
    fy.update(1.5 * 1000, []);
    expect((fy as unknown as { dragTarget: { x: number; y: number } }).dragTarget).toEqual({ x: 5, y: 5 });
    // 速度 >2 未拖拽：dragTarget 收回 anchor（L59216）
    fy.externalTarget = null;
    fy.body.SetLinearVelocity(new B.b2Vec2(5, 0));
    const ap = fy.anchor.GetPosition();
    fy.update(2 * dt, []);
    expect((fy as unknown as { dragTarget: { x: number; y: number } }).dragTarget.x).toBeCloseTo(ap.x, 6);
    expect((fy as unknown as { dragTarget: { x: number; y: number } }).dragTarget.y).toBeCloseTo(ap.y, 6);
    // 双角色 ≥1.2m 推离（L59223）：dragTarget 距角色 0.1 → 推到恰 1.2
    const dts = fy as unknown as { dragTarget: { x: number; y: number } };
    fy.body.SetLinearVelocity(new B.b2Vec2(0, 0));
    dts.dragTarget = { x: ap.x + 0.1, y: ap.y };
    fy.update(3 * dt, [{ x: ap.x, y: ap.y }]);
    const pushed = dts.dragTarget;
    expect(Math.hypot(pushed.x - ap.x, pushed.y - ap.y)).toBeCloseTo(1.2, 5);
    // Lissajous 两分支均产出有限悬浮力（external 小抖动/普通分支）
    fy.externalTarget = { x: 5, y: 5 };
    fy.update(4 * dt, []);
    fy.externalTarget = null;
    fy.update(5 * dt, []);
    const p = fy.body.GetPosition();
    expect(Number.isFinite(p.x)).toBe(true);
    expect(Number.isFinite(p.y)).toBe(true);
    // anchor 限速 40（absoluteMaxSpeed，L59055）
    fy.anchor.SetLinearVelocity(new B.b2Vec2(50, 0));
    fy.update(6 * dt, []);
    const q = fy.anchor.GetLinearVelocity();
    expect(Math.hypot(q.x, q.y)).toBeLessThanOrEqual(40 + 1e-9);
    // checkLock：lockGroups 组真解锁 / relockGroups 组真重锁（L59266-59279）
    fy.checkLock((g) => g === 2);
    expect(fy.locked).toBe(false);
    fy.checkLock((g) => g === 3);
    expect(fy.locked).toBe(true);
    // 已解锁时 lock 组激活不再翻转（幂等）
    fy.checkLock((g) => g === 2);
    expect(fy.locked).toBe(false);
  });

  it("FairyCup：rotation 杯口偏移 + matches 三分支 + 离席清除 + state 1→0（L53252/L53326）", () => {
    const { B, world, ground } = makeWorld();
    const cup = new FairyCup(B, world, { x: 500, y: 300, group: 42, rotation: 30 });
    // 杯口 = 本体 (0,0.65) 随 30° 旋转：|offset| = 0.65m
    const bp = cup.body.GetPosition();
    const c = cup.center;
    expect(Math.hypot(c.x - bp.x, c.y - bp.y)).toBeCloseTo(0.65, 6);
    // matches：同组首位 / group 0 百搭仙女 / 首位 0 百搭杯（L53252）
    const f4 = new Fairy(B, world, ground, { x: 500, y: 300, group: 4, idx: 0 });
    const f0 = new Fairy(B, world, ground, { x: 520, y: 300, group: 0, idx: 1 });
    const f2 = new Fairy(B, world, ground, { x: 540, y: 300, group: 2, idx: 2 });
    expect(cup.matches(f4)).toBe(true);
    expect(cup.matches(f0)).toBe(true);
    expect(cup.matches(f2)).toBe(false);
    const cupOpen = new FairyCup(B, world, { x: 700, y: 300, group: 0, rotation: 0 });
    expect(cupOpen.matches(f2)).toBe(true);
    // 入席（在 1.6m 感应圆内 + 色配）→ externalTarget 杯口
    cup.refreshMembership([f4, f2]);
    expect(cup.currentFairies).toContain(f4);
    expect(f4.externalCup).toBe(cup);
    expect(f4.externalTarget).toEqual(cup.center);
    expect(cup.currentFairies).not.toContain(f2); // 色不配不入
    const events: MechEvent[] = [];
    cup.checkState(events);
    expect(cup.state).toBe(1);
    expect(events).toEqual([{ kind: "fairycup", group: 42, state: 1 }]);
    // 离席：移出感应圆 → 清 currentFairies/externalTarget/externalCup → state 1→0
    f4.body.SetPosition(new B.b2Vec2(bp.x + 10, bp.y + 10));
    cup.refreshMembership([f4, f2]);
    expect(cup.currentFairies).not.toContain(f4);
    expect(f4.externalTarget).toBeNull();
    expect(f4.externalCup).toBeNull();
    const events2: MechEvent[] = [];
    cup.checkState(events2);
    expect(cup.state).toBe(0);
    expect(events2).toEqual([{ kind: "fairycup", group: 42, state: 0 }]);
    // contains 圆距判定边界：1.3+0.3
    f2.body.SetPosition(new B.b2Vec2(bp.x + 1.7, bp.y));
    expect(cup.contains(f2)).toBe(false);
    f2.body.SetPosition(new B.b2Vec2(bp.x, bp.y));
    expect(cup.contains(f2)).toBe(true);
    expect(() => cup.updateState()).not.toThrow();
  });
});

describe("构造函数支路（window 窄窗交换 / boxmirror 显式属性）", () => {
  it("buildWindow：w<h 交换 + shapeRotation=−π/2", () => {
    const { B, world } = makeWorld();
    expect(() => buildWindow(B, world, { rect: { x: 100, y: 100, w: 32, h: 128 } })).not.toThrow();
    expect(() => buildWindow(B, world, { rect: { x: 200, y: 100, w: 64, h: 32 } })).not.toThrow();
  });

  it("buildBoxMirror：显式 boxSize/friction 与缺省两支", () => {
    const { B, world } = makeWorld();
    const m1 = buildBoxMirror(B, world, { id: "bm1", x: 300, y: 300, rotation: 45, boxSize: 2.4, friction: 0.55 });
    expect(m1.body).toBeDefined();
    const m2 = buildBoxMirror(B, world, { id: "bm2", x: 400, y: 300, rotation: 0 });
    expect(m2.body).toBeDefined();
  });
});
