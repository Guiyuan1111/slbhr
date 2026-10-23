/**
 * CameraRig 单测（M12 相机拆分草案，模块未接线——被测对象是 cameraRig.ts 纯状态机草案）。
 * 覆盖点（对齐 note/evidence/2026-10-23-recheck/04-m12-camera-prep.md）：
 *  1. 复位语义逐字段（H2 c7dc51b，GameScene.ts:370-387 等价；resetForLevel :1309-1325 等价）
 *  2. 冻结门挡三类输入（wheel / 捏合 / 拖拽，:1178/:1190）
 *  3. 惯性衰减收敛到零（弹簧阻尼 0.5，:1267-1277）
 *  4. 缩放夹取边界（滚轮/捏合钳 [minScale,maxScale]、lockAtMinScale 回弹、wheel>user 优先级）
 * 附加：checkBounds 两支、窄屏 tiles 降档、脏守卫 NaN 起步、init→create 全链路演练。
 * 标准关取值（data 同款 1248×928，视口 1280×960）：
 *  minScale = 0.9·1280/1248 ≈ 0.923077；lockScale = 0.97·1280/1248 ≈ 0.994872；
 *  初始中心 = (1248/2+32, 928/2+32) = (656, 496)。
 */
import { describe, expect, it } from "vitest";
import { CameraRig, type RigPointer, type RigPointerEnv } from "../scenes/cameraRig";

const LEVEL = { widthPx: 1248, heightPx: 928 };
const BIG_LEVEL = { widthPx: 3000, heightPx: 2000 };
const RW = 1280;
const RH = 960;
const MIN = (0.9 * RW) / LEVEL.widthPx;
const LOCK = (0.97 * RW) / LEVEL.widthPx;
const CX = LEVEL.widthPx / 2 + 32; // 656
const CY = LEVEL.heightPx / 2 + 32; // 496

/** 假时钟：RigTimers 的 node 侧替身（缺省 windowTimers 依赖 window，node 环境不可用） */
class FakeTimers {
  now = 0;
  private seq = 0;
  private pending = new Map<number, { at: number; fn: () => void }>();
  schedule = (delayMs: number, fn: () => void): number => {
    const id = ++this.seq;
    this.pending.set(id, { at: this.now + delayMs, fn });
    return id;
  };
  cancel = (handle: number): void => {
    this.pending.delete(handle);
  };
  advance(ms: number): void {
    this.now += ms;
    for (const [id, p] of [...this.pending]) {
      if (this.now >= p.at) {
        this.pending.delete(id);
        p.fn();
      }
    }
  }
  get size(): number {
    return this.pending.size;
  }
}

function mkRig(): { rig: CameraRig; timers: FakeTimers } {
  const timers = new FakeTimers();
  return { rig: new CameraRig(timers), timers };
}

/** 静态双指（isDown 双真）环境：dist=p1↔p2 距离 */
function pinchEnv(zoom: number, p1: { x: number; y: number }, p2: { x: number; y: number }): { env: RigPointerEnv; p: RigPointer } {
  return {
    env: {
      zoom,
      pointer1: { isDown: true, x: p1.x, y: p1.y, getDistance: () => 0 },
      pointer2: { isDown: true, x: p2.x, y: p2.y, getDistance: () => 0 },
    },
    p: { isDown: true, x: p1.x, y: p1.y, getDistance: () => 0 },
  };
}

/** 单指拖拽环境：pointer2 抬起 */
function panEnv(zoom: number, x: number, y: number, dist: number): { env: RigPointerEnv; p: RigPointer } {
  return {
    env: {
      zoom,
      pointer1: { isDown: true, x, y, getDistance: () => dist },
      pointer2: { isDown: false, x: 0, y: 0, getDistance: () => 0 },
    },
    p: { isDown: true, x, y, getDistance: () => dist },
  };
}

describe("CameraRig", () => {
  it("setupForLevel：minScale/lockScale 标定与初始全图三元组（GameScene:1160-1170 等价）", () => {
    const { rig } = mkRig();
    const ap = rig.setupForLevel(LEVEL, RW, RH);
    expect(rig.camMinScale).toBeCloseTo(MIN, 12);
    expect(rig.camMinScale).toBeLessThan((0.9 * RH) / LEVEL.heightPx); // 取 min 支
    expect(rig.camLockScale).toBeCloseTo(LOCK, 12);
    expect(rig.camMaxScale).toBe(1.5);
    expect(rig.camX).toBe(CX);
    expect(rig.camY).toBe(CY);
    expect(rig.camTX).toBe(CX);
    expect(rig.camTY).toBe(CY);
    expect(rig.camScale).toBeCloseTo(MIN, 12);
    expect(rig.camTScale).toBeCloseTo(MIN, 12);
    expect(ap.x).toBe(CX);
    expect(ap.y).toBe(CY);
    expect(ap.scale).toBeCloseTo(MIN, 12);
    // applyForced 记录 last 三值（:1284-1286）
    expect(rig.camLastX).toBe(CX);
    expect(rig.camLastY).toBe(CY);
    expect(rig.camLastScale).toBeCloseTo(MIN, 12);
  });

  it("resetTransient 逐字段复位（H2 :370-387 逐字段等价，且不碰位姿三值）", () => {
    const { rig, timers } = mkRig();
    rig.setupForLevel(LEVEL, RW, RH);
    // 先把全部临时态弄脏
    rig.camFrozen = false;
    rig.onCamWheel(120, 1.2); // wheel 态 + 挂起回弹句柄
    expect(timers.size).toBe(1);
    const pinch = pinchEnv(1.2, { x: 100, y: 100 }, { x: 220, y: 100 });
    rig.onCamPointerMove(pinch.p, pinch.env); // 捏合态 + camUserScale
    rig.onCamPointerUp();
    const pan = panEnv(1, 200, 200, 25);
    rig.onCamPointerMove(pan.p, pan.env); // 拖拽态 + camUserCenter
    rig.camTX = 2000;
    rig.animateCam();
    rig.animateCam();
    expect(rig.camVX).not.toBe(0);
    expect(Number.isNaN(rig.camLastX)).toBe(false);
    const before = { x: rig.camX, y: rig.camY, s: rig.camScale, tx: rig.camTX, ty: rig.camTY, ts: rig.camTScale };
    // H2 复位
    rig.resetTransient();
    expect(rig.camFrozen).toBe(true); // :372
    expect(rig.camUserScale).toBeNull(); // :373
    expect(rig.camWheelScale).toBeNull(); // :374
    expect(rig.camUserCenter).toBeNull(); // :375
    expect(rig.camWheelReset).toBeNull(); // :376-379
    expect(timers.size).toBe(0); // 回弹句柄已取消
    expect(rig.pinchState).toBeNull(); // :380
    expect(rig.panState).toBeNull(); // :381
    expect(rig.camVX).toBe(0); // :382-384
    expect(rig.camVY).toBe(0);
    expect(rig.camVScale).toBe(0);
    expect(Number.isNaN(rig.camLastX)).toBe(true); // :385-387 NaN 起步
    expect(Number.isNaN(rig.camLastY)).toBe(true);
    expect(Number.isNaN(rig.camLastScale)).toBe(true);
    // 不碰位姿三值（由 create→setupForLevel 设定，:370-371 注释语义）
    expect(rig.camX).toBe(before.x);
    expect(rig.camY).toBe(before.y);
    expect(rig.camScale).toBe(before.s);
    expect(rig.camTX).toBe(before.tx);
    expect(rig.camTY).toBe(before.ty);
    expect(rig.camTScale).toBe(before.ts);
  });

  it("冻结门：camFrozen=true 时滚轮/捏合/拖拽三类输入全被挡（:1178/:1190）", () => {
    const { rig, timers } = mkRig(); // 构造默认 camFrozen=true（:225）
    rig.onCamWheel(120, 1.0);
    expect(rig.camWheelScale).toBeNull();
    expect(timers.size).toBe(0); // 未挂回弹句柄
    const pinch = pinchEnv(1.2, { x: 100, y: 100 }, { x: 220, y: 100 });
    rig.onCamPointerMove(pinch.p, pinch.env);
    expect(rig.camUserScale).toBeNull();
    expect(rig.pinchState).toBeNull();
    const pan = panEnv(1, 200, 200, 25);
    rig.onCamPointerMove(pan.p, pan.env);
    expect(rig.camUserCenter).toBeNull();
    expect(rig.panState).toBeNull();
  });

  it("解冻后同一批调用生效（证明门即 camFrozen 本体）", () => {
    const { rig, timers } = mkRig();
    rig.setupForLevel(LEVEL, RW, RH);
    rig.camFrozen = false;
    rig.onCamWheel(120, 1.0); // 0.8×1.0=0.8 < minScale → 夹到 minScale
    expect(rig.camWheelScale).toBeCloseTo(MIN, 12);
    expect(timers.size).toBe(1);
    const pinch = pinchEnv(1.2, { x: 100, y: 100 }, { x: 220, y: 100 });
    rig.onCamPointerMove(pinch.p, pinch.env);
    expect(rig.camUserScale).toBeCloseTo(1.2, 12); // 1.2×(120/120)
    rig.onCamPointerUp();
    const pan = panEnv(1, 200, 200, 25);
    rig.onCamPointerMove(pan.p, pan.env);
    expect(rig.camUserCenter).toEqual({ x: CX - 32, y: CY - 32 });
  });

  it("onCamWheel 缩放夹取边界（:1179，×0.8/×1.2 钳 [minScale,maxScale]）", () => {
    const { rig } = mkRig();
    rig.setupForLevel(LEVEL, RW, RH);
    rig.camFrozen = false;
    rig.onCamWheel(120, 10); // dy>0 → ×0.8=8 → 上夹 maxScale
    expect(rig.camWheelScale).toBe(1.5);
    rig.onCamWheel(120, 0.01); // ×0.8=0.008 → 下夹 minScale
    expect(rig.camWheelScale).toBeCloseTo(MIN, 12);
    rig.onCamWheel(-120, 1.4); // dy≤0 → ×1.2=1.68 → 上夹 maxScale
    expect(rig.camWheelScale).toBe(1.5);
    rig.onCamWheel(-120, 1.0); // ×1.2=1.2 → 域内原值
    expect(rig.camWheelScale).toBeCloseTo(1.2, 12);
  });

  it("onCamWheel 1s 静置回弹：≤lockScale 锁 lockScale，>lockScale 复位（:1182-1185）+ debounce 重挂", () => {
    const { rig, timers } = mkRig();
    rig.setupForLevel(LEVEL, RW, RH);
    rig.camFrozen = false;
    // debounce 重挂：两次滚轮只留最新句柄
    rig.onCamWheel(120, 1.0);
    rig.onCamWheel(120, 1.0);
    expect(timers.size).toBe(1);
    rig.camWheelScale = LOCK - 0.01; // 回弹前静置值 ≤ lockScale
    timers.advance(999);
    expect(rig.camWheelScale).toBe(LOCK - 0.01); // 未到期
    timers.advance(1);
    expect(rig.camWheelScale).toBe(LOCK); // 锁在 lockScale（lockAtMinScale）
    expect(rig.camWheelReset).toBeNull();
    expect(timers.size).toBe(0);
    // >lockScale → 复位交还自动适配
    rig.onCamWheel(120, 1.0);
    rig.camWheelScale = LOCK + 0.01;
    timers.advance(1000);
    expect(rig.camWheelScale).toBeNull();
  });

  it("onCamPointerMove 捏合：startScale×距离比 + 夹取 + 锚定不随 zoom 漂移（:1195-1197）", () => {
    const { rig } = mkRig();
    rig.setupForLevel(LEVEL, RW, RH);
    rig.camFrozen = false;
    let s = pinchEnv(1, { x: 100, y: 100 }, { x: 200, y: 100 }); // dist=100，startScale=1
    rig.onCamPointerMove(s.p, s.env);
    expect(rig.pinchState).toEqual({ startDist: 100, startScale: 1 });
    expect(rig.camUserScale).toBeCloseTo(1, 12);
    s = pinchEnv(1, { x: 100, y: 100 }, { x: 1100, y: 100 }); // dist=1000 → ×10 → 上夹
    rig.onCamPointerMove(s.p, s.env);
    expect(rig.camUserScale).toBe(1.5);
    s = pinchEnv(1, { x: 100, y: 100 }, { x: 100.5, y: 100 }); // dist=0.5 → ×0.005 → 下夹
    rig.onCamPointerMove(s.p, s.env);
    expect(rig.camUserScale).toBeCloseTo(MIN, 12);
    // startScale 锚定首帧：中途 zoom 变化不影响（startDist>0 分支只看锚）
    // （锚 1.2 取域内值：夹取上界 1.5，锚 2 会被夹到 1.5 而看不出锚定）
    rig.resetTransient();
    rig.camFrozen = false;
    let t = pinchEnv(1.2, { x: 100, y: 100 }, { x: 200, y: 100 });
    rig.onCamPointerMove(t.p, t.env); // 锚 startScale=1.2
    t = pinchEnv(99, { x: 100, y: 100 }, { x: 200, y: 100 });
    rig.onCamPointerMove(t.p, t.env);
    expect(rig.camUserScale).toBeCloseTo(1.2, 12);
    // startDist=0 边界：不赋 camUserScale（:1196 守卫）
    rig.resetTransient();
    rig.camFrozen = false;
    const z = pinchEnv(1.2, { x: 50, y: 50 }, { x: 50, y: 50 });
    rig.onCamPointerMove(z.p, z.env);
    expect(rig.pinchState).toEqual({ startDist: 0, startScale: 1.2 });
    expect(rig.camUserScale).toBeNull();
  });

  it("onCamPointerMove 拖拽：threshold 10 + 位移/zoom 世界换算（:1201-1209）", () => {
    const { rig } = mkRig();
    rig.setupForLevel(LEVEL, RW, RH);
    rig.camFrozen = false;
    let p = panEnv(1, 200, 200, 5); // <10：不起拖拽
    rig.onCamPointerMove(p.p, p.env);
    expect(rig.camUserCenter).toBeNull();
    expect(rig.panState).toBeNull();
    p = panEnv(1, 200, 200, 25);
    rig.onCamPointerMove(p.p, p.env); // 起拖：锚 (camX-32, camY-32)
    expect(rig.panState).toEqual({ cx: CX - 32, cy: CY - 32, px: 200, py: 200 });
    expect(rig.camUserCenter).toEqual({ x: CX - 32, y: CY - 32 });
    p = panEnv(1, 260, 230, 90);
    rig.onCamPointerMove(p.p, p.env); // 位移 (60,30)/zoom=1
    expect(rig.camUserCenter).toEqual({ x: CX - 32 - 60, y: CY - 32 - 30 });
    p = panEnv(0.5, 460, 530, 300);
    rig.onCamPointerMove(p.p, p.env); // 位移 (260,330)/0.5 = (520,660)
    expect(rig.camUserCenter).toEqual({ x: 104, y: -196 });
  });

  it("onCamPointerUp：userScale lockAtMinScale 回弹 + 手势态清空，无冻结门（:1212-1220）", () => {
    const { rig } = mkRig();
    rig.setupForLevel(LEVEL, RW, RH);
    rig.camFrozen = false;
    rig.camUserScale = LOCK; // ==lockScale → 锁
    rig.onCamPointerUp();
    expect(rig.camUserScale).toBe(LOCK);
    rig.camUserScale = LOCK + 0.05; // >lockScale → 复位
    rig.onCamPointerUp();
    expect(rig.camUserScale).toBeNull();
    rig.camUserScale = LOCK - 0.05; // <lockScale → 锁
    rig.onCamPointerUp();
    expect(rig.camUserScale).toBe(LOCK);
    rig.camUserCenter = { x: 1, y: 2 };
    rig.pinchState = { startDist: 3, startScale: 4 };
    rig.panState = { cx: 5, cy: 6, px: 7, py: 8 };
    rig.onCamPointerUp();
    expect(rig.camUserCenter).toBeNull();
    expect(rig.pinchState).toBeNull();
    expect(rig.panState).toBeNull();
    // 冻结期抬起同样清手势态（原实现无 camFrozen 闸；r2 需先标定 lockScale）
    const { rig: r2 } = mkRig();
    r2.setupForLevel(LEVEL, RW, RH);
    r2.camUserScale = LOCK;
    r2.onCamPointerUp();
    expect(r2.camUserScale).toBe(LOCK);
  });

  it("updateCamTarget：userScale/wheelScale 覆盖优先级 wheel>user（:1247-1249）", () => {
    const { rig } = mkRig();
    rig.setupForLevel(LEVEL, RW, RH);
    const fb = { x: 600, y: 400 };
    const wg = { x: 648, y: 448 }; // 近距双角色 → 自动适配 h=1
    rig.updateCamTarget(LEVEL, fb, wg, RW, RH, true);
    expect(rig.camTScale).toBe(1);
    expect(rig.camTX).toBe(CX); // W·h=1248<1280 → 钉关卡中心
    expect(rig.camTY).toBe(CY); // H·h=928<960 → 钉关卡中心
    rig.camUserScale = 1.2;
    rig.updateCamTarget(LEVEL, fb, wg, RW, RH, true);
    expect(rig.camTScale).toBeCloseTo(1.2, 12);
    rig.camWheelScale = 0.95;
    rig.updateCamTarget(LEVEL, fb, wg, RW, RH, true);
    expect(rig.camTScale).toBeCloseTo(0.95, 12); // wheel 覆盖 user
    rig.camUserScale = null;
    rig.updateCamTarget(LEVEL, fb, wg, RW, RH, true);
    expect(rig.camTScale).toBeCloseTo(0.95, 12);
  });

  it("updateCamTarget：checkBounds 居中支无视焦点、钳制支夹进关卡矩形（:1261-1264）", () => {
    const { rig } = mkRig();
    rig.setupForLevel(LEVEL, RW, RH);
    const fb = { x: 600, y: 400 };
    const wg = { x: 648, y: 448 }; // h=1
    // 标准关（W·h<视口）：userCenter 拉飞仍钉关卡中心（居中支与焦点无关）
    rig.camUserCenter = { x: 1e6, y: -1e6 };
    rig.updateCamTarget(LEVEL, fb, wg, RW, RH, true);
    expect(rig.camTX).toBe(CX);
    expect(rig.camTY).toBe(CY);
    // 大关（W·h≥视口）：钳 [PAD+rw/(2h), PAD+W−rw/(2h)] × [PAD+rh/(2h), PAD+H−rh/(2h)]
    rig.camUserCenter = { x: 5000, y: 5000 };
    rig.updateCamTarget(BIG_LEVEL, fb, wg, RW, RH, true);
    expect(rig.camTX).toBe(2392); // 32+3000−640
    expect(rig.camTY).toBe(1552); // 32+2000−480
    rig.camUserCenter = { x: -100, y: -100 };
    rig.updateCamTarget(BIG_LEVEL, fb, wg, RW, RH, true);
    expect(rig.camTX).toBe(672); // 32+640
    expect(rig.camTY).toBe(512); // 32+480
    rig.camUserCenter = { x: 1500, y: 1000 };
    rig.updateCamTarget(BIG_LEVEL, fb, wg, RW, RH, true);
    expect(rig.camTX).toBe(1532); // 域内原值
    expect(rig.camTY).toBe(1032);
  });

  it("updateCamTarget：窄屏/移动 tiles 降档 20×15（:1243-1246）+ fb/wg 缺一早退（:1227）", () => {
    const { rig } = mkRig();
    rig.setupForLevel(LEVEL, RW, RH);
    const fb = { x: 600, y: 400 };
    const wg = { x: 648, y: 448 };
    // desktop=false 且 rw=600≤… → small：1×20×32=640>600 → h=600/640=0.9375
    rig.updateCamTarget(LEVEL, fb, wg, 600, 480, false);
    expect(rig.camTScale).toBeCloseTo(0.9375, 12);
    // desktop=true 但 rw≤780 → 同样 small：640≤780 且 450≤960 → h=1
    rig.updateCamTarget(LEVEL, fb, wg, 780, 960, true);
    expect(rig.camTScale).toBe(1);
    // fb/wg 缺一早退：目标三值原地不动
    rig.camTX = 123;
    rig.camTScale = 0.7;
    rig.updateCamTarget(LEVEL, fb, null, RW, RH, true);
    rig.updateCamTarget(LEVEL, null, wg, RW, RH, true);
    expect(rig.camTX).toBe(123);
    expect(rig.camTScale).toBe(0.7);
  });

  it("animateCam：弹簧阻尼 0.5，速度与位置误差收敛到零（:1267-1277）", () => {
    const { rig } = mkRig();
    rig.setupForLevel(LEVEL, RW, RH);
    rig.camTX = 2000;
    rig.camTY = 300;
    rig.camTScale = 1.4;
    let ap = { ...rig.animateCam() };
    for (let n = 0; n < 1000; n++) ap = { ...rig.animateCam() };
    // 阈值取 double 噪声底以上（初差 1344 量级下速度地板 ~9e-14）：仍比初值收敛 12 个数量级
    expect(Math.abs(rig.camVX)).toBeLessThan(1e-12);
    expect(Math.abs(rig.camVY)).toBeLessThan(1e-12);
    expect(Math.abs(rig.camVScale)).toBeLessThan(1e-12);
    expect(Math.abs(rig.camX - 2000)).toBeLessThan(1e-10);
    expect(Math.abs(rig.camY - 300)).toBeLessThan(1e-10);
    expect(Math.abs(rig.camScale - 1.4)).toBeLessThan(1e-10);
    expect(ap.x).toBe(rig.camX); // 返回现值三元组（applyCam(true) 等价）
    expect(rig.camLastX).toBe(rig.camX);
    expect(rig.camLastScale).toBe(rig.camScale);
  });

  it("animateCam：用户平移中 a=1/3 快档，首步速度恰为自动档 5 倍（a 比 (1/3)/(1/15)=5）（:1269）", () => {
    const auto = mkRig().rig;
    const pan = mkRig().rig;
    for (const r of [auto, pan]) {
      r.setupForLevel(LEVEL, RW, RH);
      r.camTX = 2000;
    }
    pan.camUserCenter = { x: 0, y: 0 }; // 非 null → a=1/3
    auto.animateCam();
    pan.animateCam();
    expect(pan.camVX).toBeCloseTo(auto.camVX * 5, 9); // v=d·a·0.5 同 d → 纯 a 比
  });

  it("resetForLevel：回冻结全图 + 脏守卫决定引擎写（:1309-1325 与 :1283）", () => {
    // 脏支：三值偏离 last → 返回三元组（引擎写）
    const { rig, timers } = mkRig();
    rig.setupForLevel(LEVEL, RW, RH);
    rig.camFrozen = false;
    rig.camTX = 2000;
    rig.animateCam(); // last 随动离开 (656,496,min)
    rig.camUserScale = 1.3;
    rig.onCamWheel(120, 1.0);
    expect(timers.size).toBe(1);
    rig.pinchState = { startDist: 9, startScale: 9 };
    rig.panState = { cx: 9, cy: 9, px: 9, py: 9 };
    rig.camUserCenter = { x: 9, y: 9 };
    const ap = rig.resetForLevel(LEVEL);
    expect(ap).not.toBeNull();
    expect(ap!.x).toBe(CX);
    expect(ap!.y).toBe(CY);
    expect(ap!.scale).toBeCloseTo(MIN, 12);
    expect(rig.camFrozen).toBe(true); // :1323
    expect(rig.camUserScale).toBeNull(); // :1313
    expect(rig.camWheelScale).toBeNull(); // :1314
    expect(rig.camUserCenter).toBeNull(); // :1315
    expect(rig.pinchState).toBeNull(); // :1316
    expect(rig.panState).toBeNull(); // :1317
    expect(rig.camWheelReset).toBeNull(); // :1311-1312
    expect(timers.size).toBe(0);
    expect(rig.camVX).toBe(0); // :1318
    expect(rig.camScale).toBeCloseTo(MIN, 12); // :1319
    expect(rig.camX).toBe(CX); // :1320-1321
    expect(rig.camTX).toBe(CX);
    expect(rig.camTScale).toBeCloseTo(MIN, 12); // :1322
    // 净支：三值与 last 全等 → null（引擎写跳过，r3 脏守卫原语义）
    const { rig: r2 } = mkRig();
    r2.setupForLevel(LEVEL, RW, RH); // last=(656,496,min)
    expect(r2.resetForLevel(LEVEL)).toBeNull();
    expect(r2.camFrozen).toBe(true);
  });

  it("applyIfDirty：NaN 起步首帧强制应用，随后同值跳过（:1283 r3 脏守卫）", () => {
    const { rig } = mkRig(); // 未 setup：last=NaN
    const ap = rig.applyIfDirty();
    expect(ap).not.toBeNull();
    expect(ap!.x).toBe(0);
    expect(ap!.scale).toBe(1);
    expect(rig.applyIfDirty()).toBeNull(); // 三值与 last 全等
    rig.camX += 0.5;
    const ap2 = rig.applyIfDirty();
    expect(ap2!.x).toBe(0.5);
    expect(rig.camLastX).toBe(0.5);
  });

  it("H2 全链路演练：scene 重启顺序 init 复位 → create 标定（:370-387 → :1160-1170）", () => {
    const { rig, timers } = mkRig();
    // 第一局
    rig.setupForLevel(LEVEL, RW, RH);
    rig.camFrozen = false;
    rig.onCamWheel(120, 1.0);
    rig.camTX = 2000;
    rig.animateCam();
    // 重启：init 段 resetTransient → create 段 setupForLevel
    rig.resetTransient();
    expect(rig.camFrozen).toBe(true);
    expect(Number.isNaN(rig.camLastX)).toBe(true);
    rig.setupForLevel(LEVEL, RW, RH);
    expect(rig.camX).toBe(CX);
    expect(rig.camScale).toBeCloseTo(MIN, 12);
    expect(rig.camLastX).toBe(CX); // applyForced 记录，脏守卫基线就位
    expect(rig.camWheelScale).toBeNull();
    expect(timers.size).toBe(0);
  });
});
