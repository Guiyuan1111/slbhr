/**
 * 覆盖率恢复批（fw-cov，2026-10-30）：World 液体光照 freeze/melt 全谱 + 钻石/门带/风柱/复位。
 *
 * 合成 Tiled 关卡（真实 tilesets：Ground/Objects/Chars.json）：
 *   双 beamer（蓝先红后创建 → lightDevices 逆序链蓝光后标记 → 冻结胜出）照同一水池；
 *   蓝光转离后红光接管 → 融冰。帽沿楔形（SHAPE_PTS 8/9）实测后以 50°/130° 陡束越沿入池。
 * 断言锚：world.ts freezeLiquid/meltLiquid（原版 Liquid.freeze @1667963 / melt @1671909）、
 *   钻石 char 谱（silver 全员可拾）、门 25fps 扫帧（21 帧到位）、风柱施力谱。
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";
import { describe, expect, it } from "vitest";
import { parseLevel, type LevelData } from "../level2.js";
import { World, type WorldEvent } from "../kernel/world.js";
import { b2 } from "../kernel/b2.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");

const TILESETS = [
  { firstgid: 1, source: "Ground.json" },
  { firstgid: 16, source: "Objects.json" },
  { firstgid: 32, source: "Chars.json" },
];

/** BoxedDevice 中心矫正逆运算：给定期望体心与旋转 → Tiled 对象坐标（level2 beamer/box 族公式反解） */
function boxed(cx: number, cy: number, rotDeg: number, size: number): { x: number; y: number; rotation: number } {
  const th = (-rotDeg * Math.PI) / 180;
  const a = 16 * size;
  const ex = a * (Math.cos(th) - Math.sin(th));
  const ey = a * (Math.sin(th) + Math.cos(th));
  return { x: cx - ex, y: cy + ey, rotation: rotDeg };
}

function synthLevel(opts: { beamerState?: number; beams?: boolean } = {}): LevelData {
  const { beamerState = 1, beams = true } = opts;
  const cols = 24;
  const rows = 16;
  const ground: number[] = new Array(cols * rows).fill(0);
  for (let c = 0; c < cols; c++) ground[14 * cols + c] = 1; // 地板 row14（顶 448）
  for (let c = 7; c <= 14; c++) ground[13 * cols + c] = 1; // 池底 row13
  for (let c = 8; c <= 13; c++) ground[12 * cols + c] = 6; // 水 row12 cols8..13（type5）
  const provider = (source: string) =>
    JSON.parse(readFileSync(join(ROOT, "assets/tilemaps/tilesets", source.split("/").pop()!), "utf8"));
  const objects: any[] = [
    { gid: 20, x: 308, y: 362, id: 12 }, // box 体心(340,330) 落池中段（两束终止点 305/417 之外）
    { gid: 31, x: 640, y: 448, rotation: -90, id: 13, properties: { initialState: 1, length: 6 } }, // 风柱上行
  ];
  if (beams) {
    objects.unshift(
      // 蓝先红后创建 → lightDevices 逆序链蓝光后标记 → 冻结胜出
      { gid: 21, ...boxed(230, 300, 50, 2), id: 10, properties: { color: "blue", group: 0, initialState: beamerState } },
      { gid: 21, ...boxed(500, 290, 130, 2), id: 11, properties: { color: "red", group: 0, initialState: beamerState } },
    );
  }
  return parseLevel(
    "cov_liquid",
    {
      width: cols,
      height: rows,
      tilewidth: 32,
      tilesets: TILESETS,
      layers: [
        { type: "tilelayer", name: "Ground", data: ground },
        {
          type: "objectgroup",
          name: "Chars",
          objects: [
            { gid: 32, x: 128, y: 448, id: 1 }, // fb char → spawn(160,448)
            { gid: 33, x: 192, y: 448, id: 2 }, // wg char → spawn(224,448)
            { gid: 34, x: 500, y: 448, id: 3 }, // fb door
            { gid: 35, x: 600, y: 448, id: 4 }, // wg door
            { gid: 38, x: 668, y: 456, id: 5 }, // silver diamond 中心(700,424)
            { gid: 37, x: 708, y: 456, id: 6 }, // blue diamond 中心(740,424)
          ],
        },
        { type: "objectgroup", name: "Objects", objects },
      ],
    },
    provider,
  );
}

const IDLE = { fireboy: { up: false, left: false, right: false }, watergirl: { up: false, left: false, right: false } };

function teleport(w: World, role: "fireboy" | "watergirl", x: number, y: number): void {
  const B = b2();
  const body = w.players[role].body;
  body.SetPosition(new B.b2Vec2(-x / 32, -y / 32));
  body.SetLinearVelocity(new B.b2Vec2(0, 0));
  body.SetAwake(true); // 站立浸泡后体已睡眠：显式唤醒（kernel2 批以 10 帧短浸泡回避）
}

/** 累计式步进：事件全部落入 acc（freeze/melt 事件可能发生在任意早期帧，不可丢弃） */
function collectUntil(w: World, acc: WorldEvent[], pred: (evs: WorldEvent[]) => boolean, max = 360): void {
  for (let i = 0; i < max && !pred(acc); i++) acc.push(...w.step(1 / 60, IDLE));
}

function stepN(w: World, acc: WorldEvent[], n: number): void {
  for (let i = 0; i < n; i++) acc.push(...w.step(1 / 60, IDLE));
}

/** 物理落池布置：box 入水 + 水女孩入水（都是液面 sensor nearBodies 成员；束光先灭） */
function soakIn(w: World, acc: WorldEvent[]): void {
  stepN(w, acc, 90); // box 落池触液面 sensor
  teleport(w, "watergirl", 400, 391); // 池内（box 在 x340，落底后顶 342 不与角色落点重叠）
  stepN(w, acc, 30); // 沉底稳定（脚底圆落中段盒顶）
}

/** 物理 m → 屏幕 px（world.ts 导出口径） */
function m2px(m: number): number {
  return -m * 32;
}

describe("合成池 World：液体光照 freeze/melt（原版 Liquid freeze/melt 逐字转写）", () => {
  it("蓝光冻水：liquid-frozen 事件 + 池内角色上推 0.5m + 箱体转 static + 重冻早退", () => {
    const w = new World(synthLevel({ beamerState: 0 })); // 光先灭：人/箱先落位再开灯
    const acc: WorldEvent[] = [];
    stepN(w, acc, 90); // box 落池触液面 sensor（nearBodies 非角色支成员）
    const box = w.mechanisms.props[0];
    const B = b2();
    expect(box.body.GetType()).toBe(B.b2BodyType.b2_dynamicBody);
    // 水女孩梯形底 (中心+28.8px) 贴住液面 sensor 带顶 (388.8px)：中心 371 → 底 399.8 恰入带，
    // 低速建立接触并保持（实测高空落入会触发带内 EndContact 出表，371 慢速入带则持续在表）
    teleport(w, "watergirl", 400, 371);
    stepN(w, acc, 5);
    const yBefore = w.players.watergirl.body.GetPosition().y;
    w.mechanisms.beamers.forEach((b) => {
      b.state = 1;
    }); // 开灯（白盒置位；initialState=0 的生产路径见其余用例）
    collectUntil(w, acc, (evs) => evs.some((e) => e.type === "liquid-frozen"));
    expect(acc.some((e) => e.type === "liquid-frozen")).toBe(true);
    const water = w.liquids.find((l) => l.kind === "water")!;
    expect(water.frozen).toBe(true);
    // 蓝光后标记胜出（逆序链：蓝先建后跑 → iluminated=blue）
    expect(water.sensorLp.iluminated).toBe("blue");
    // 池内角色上推 0.5m=16px（原版 nearBodies 角色支；实测冻结帧净跳变 ~15.7px）
    const yAfter = w.players.watergirl.body.GetPosition().y;
    expect(m2px(yBefore - yAfter)).toBeGreaterThan(12);
    // 池内箱体转 static（非角色支）
    expect(box.body.GetType()).toBe(B.b2BodyType.b2_staticBody);
    // 已冻结再照：早退分支，事件不重复
    const n = acc.length;
    stepN(w, acc, 60);
    expect(acc.slice(n).filter((e) => e.type === "liquid-frozen").length).toBe(0);
  });

  it("红光融冰：蓝光转离后 iluminated=red → liquid-melted + 冻结箱还原 dynamic", () => {
    const w = new World(synthLevel({ beamerState: 0 }));
    const acc: WorldEvent[] = [];
    soakIn(w, acc);
    const B = b2();
    w.mechanisms.beamers.forEach((b) => {
      b.state = 1;
    });
    collectUntil(w, acc, (evs) => evs.some((e) => e.type === "liquid-frozen"));
    const water = w.liquids.find((l) => l.kind === "water")!;
    expect(water.frozen).toBe(true);
    // 蓝光（beamers[0]，先建）转向背池 → 红光成为末位标记
    w.mechanisms.beamers[0].body.SetAngle(Math.PI);
    collectUntil(w, acc, (evs) => evs.some((e) => e.type === "liquid-melted"));
    expect(acc.some((e) => e.type === "liquid-melted")).toBe(true);
    expect(water.frozen).toBe(false);
    expect(w.mechanisms.props[0].body.GetType()).toBe(B.b2BodyType.b2_dynamicBody);
    // 融后红光持续标记：melt 早退分支（frozen=false 入口）
    const n = acc.length;
    stepN(w, acc, 30);
    expect(acc.slice(n).filter((e) => e.type === "liquid-melted").length).toBe(0);
  });

  it("出池：液面 sensor 离席 + 脚底致死带离席 → isOnLiquid 复位（snapshot inLiquid=false）", () => {
    const w = new World(synthLevel({ beams: false })); // 无束光：池保持液态
    const acc: WorldEvent[] = [];
    stepN(w, acc, 60);
    teleport(w, "watergirl", 400, 391); // 池内（box 在 x340 不重叠）
    stepN(w, acc, 20);
    expect(w.snapshotPlayer("watergirl").inLiquid).toBe(true);
    teleport(w, "watergirl", 224, 413); // 回出生台
    stepN(w, acc, 20);
    expect(w.snapshotPlayer("watergirl").inLiquid).toBe(false);
  });
});

describe("合成池 World：钻石/门带/风柱/复位", () => {
  it("银钻全员可拾：silverDiamond+1 + 事件 kind=silver；蓝钻火人不可拾（end 离席无异常）", () => {
    const w = new World(synthLevel());
    const acc: WorldEvent[] = [];
    stepN(w, acc, 30);
    teleport(w, "fireboy", 700, 424); // 银钻中心（kernel2 同款直落中心）
    collectUntil(w, acc, (evs) => evs.some((e) => e.type === "diamond"), 60);
    const dia = acc.find((e) => e.type === "diamond")!;
    expect(dia).toMatchObject({ type: "diamond", role: "fireboy", kind: "silver" });
    expect(w.players.fireboy.silverDiamond).toBe(1);
    const silver = w.diamonds.find((d) => d.kind === "silver")!;
    expect(silver.collected).toBe(true);
    // 蓝钻：火人不合格（begin 无事）；离开 → end 分支（钻石 !begin 早退）
    teleport(w, "fireboy", 740, 424);
    stepN(w, acc, 10);
    expect(w.players.fireboy.diamonds).toBe(0);
    expect(w.diamonds.find((d) => d.kind === "blue")!.collected).toBe(false);
    teleport(w, "fireboy", 160, 413);
    stepN(w, acc, 10);
    expect(w.players.fireboy.diamonds).toBe(0);
  });

  it("门带：入区 isOpen 推进扫帧、离区回落（25fps 扫帧双向）", () => {
    const w = new World(synthLevel());
    const acc: WorldEvent[] = [];
    stepN(w, acc, 30);
    // 门条带在 pos.y+4±4px：从高处落入带区建立接触（rest 位脚底圆与带顶相切不触发）
    teleport(w, "fireboy", w.doors.fireboy.pos.x, w.doors.fireboy.pos.y - 48);
    stepN(w, acc, 30); // 落地 + 感应带建立接触（实测 ~12 帧出 isOpen）
    expect(w.snapshotPlayer("fireboy").atDoor).toBe(true);
    expect(w.snapshotPlayer("fireboy").doorFrame).toBeGreaterThan(0);
    teleport(w, "fireboy", 160, 413);
    stepN(w, acc, 60);
    const snap = w.snapshotPlayer("fireboy");
    expect(snap.atDoor).toBe(false);
    expect(snap.doorFrame).toBe(0);
    expect(w.phase).toBe("playing"); // 单门未到位不通关
  });

  it("风柱：入柱接触分发 + 上行力把角色举起（windClockS 缺省仿真钟）", () => {
    const w = new World(synthLevel());
    const acc: WorldEvent[] = [];
    stepN(w, acc, 60);
    teleport(w, "fireboy", 592, 320); // 风柱体(592,416) 上方柱内
    const y0 = w.players.fireboy.body.GetPosition().y;
    stepN(w, acc, 60);
    const y1 = w.players.fireboy.body.GetPosition().y;
    expect(m2px(y0 - y1)).toBeGreaterThan(8); // 净上浮 ≥8px
    expect(Number.isFinite(y1)).toBe(true);
    expect(w.mechSnapshot().winds[0].state).toBe(1);
  });

  it("reset：整关重建 + 风/光设备重挂 + 仿真钟归零 + 光链重建后可再冻", () => {
    const w = new World(synthLevel({ beamerState: 0 }));
    const acc: WorldEvent[] = [];
    soakIn(w, acc);
    w.mechanisms.beamers.forEach((b) => {
      b.state = 1;
    });
    collectUntil(w, acc, (evs) => evs.some((e) => e.type === "liquid-frozen"));
    expect(w.liquids.find((l) => l.kind === "water")!.frozen).toBe(true);
    teleport(w, "fireboy", 592, 320);
    stepN(w, acc, 30);
    expect(w.simSeconds).toBeGreaterThan(1);
    w.reset();
    expect(w.phase).toBe("playing");
    expect(w.timerMs).toBe(0);
    expect(w.simSeconds).toBe(0);
    expect(w.liquids.find((l) => l.kind === "water")!.frozen).toBe(false);
    expect(w.mechanisms.beamers.length).toBe(2);
    expect(w.mechanisms.winds.length).toBe(1);
    stepN(w, acc, 60);
    expect(w.snapshotPlayer("fireboy").dead).toBe(false);
    // 重建世界后光链照常工作（initialState=0 束已随重置恢复 state0 → 重新开灯再冻）
    w.mechanisms.beamers.forEach((b) => {
      b.state = 1;
    });
    collectUntil(w, acc, (evs) => evs.some((e) => e.type === "liquid-frozen" && e !== acc[acc.length - 1]) && acc.filter((e) => e.type === "liquid-frozen").length >= 2, 360);
    expect(acc.filter((e) => e.type === "liquid-frozen").length).toBeGreaterThanOrEqual(2);
  });

  it("mechSnapshot：双束光/道具/风/冻表全字段可序列化", () => {
    const w = new World(synthLevel());
    const acc: WorldEvent[] = [];
    stepN(w, acc, 30);
    const m = w.mechSnapshot();
    expect(m.beamers.length).toBe(2);
    expect(m.beamers.every((b) => typeof b.pts === "string" && b.pts.length > 0)).toBe(true);
    expect(m.props).toHaveLength(1);
    expect(m.props[0].kind).toBe("box");
    expect(m.winds).toHaveLength(1);
    expect(m.liquidsFrozen).toHaveLength(1);
    expect(typeof m.liquidsFrozen[0]).toBe("boolean");
    expect(m.timedPushers).toEqual([]);
    expect(m.rotMirrors).toEqual([]);
  });
});
