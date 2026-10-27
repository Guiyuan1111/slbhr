/**
 * box2d 内核 —— 关卡世界构建。
 *
 * 逐字节转写原版 States/Level/Ground.convertTilemap（note/evidence/init-js-regions/ground-region.js）+ 插件 setBounds
 * （vendor bundle）+ Liquid（note/evidence/init-js-regions/liquid-region.js）+ Diamond/Door（note/evidence/init-js-regions/door-diamond-region.js）。
 * 关卡网格 type 语义见 ../level2.ts（GROUND_TYPE）。
 *
 * 坐标：LevelData 是屏幕像素（y 向下）；物理 = (−x/32, −y/32)。原版多边形的负号
 * 已经把这层镜像烘焙进顶点数组，本文件按原版数组原样转写，不再额外镜像。
 */
import type { LevelData, LiquidRun } from "../level2.js";
import { GROUND_TYPE, liquidKindOf } from "../level2.js";
import type { B2 } from "./b2.js";
import { b2, FILTER, boxFixture, makeFixtureDef, px2m, type FixtureOptions } from "./b2.js";

export interface LiquidInfo {
  /** 物理世界中的 body（static，位置 (−col0, −row)） */
  body: any;
  kind: "water" | "lava" | "green";
  liquidType: number;
  /** 行段（列/行，0 基） */
  col0: number;
  col1: number;
  row: number;
  /** 冻结面（type55，森林未用） */
  startFrozen: boolean;
  // ---- 灯光神庙光照/冻结运行时态（02号档 §9；森林恒 false/空）----
  frozen: boolean;
  /** 液面 sensor fixture（lightProperties.normal+sensor；冻结后 type 翻 mirror） */
  sensorFixture: any;
  sensorLp: { type: "normal" | "mirror"; sensor: boolean; iluminated: string | null; lightAt: { x: number; y: number } | null };
  /** 冰面碰撞 fixture（mask 0=融化态；冻结 mask 16 仅对角色层） */
  iceFixture: any;
  /** 液面 sensor 接触体（fixture id 序插入；freeze 时角色上推 0.5m、其余转 static） */
  nearBodies: Array<{ id: number; body: any }>;
  /** freeze 时转 static 的体（melt 时还原） */
  frozenBodies: any[];
}

export interface DiamondInfo {
  id: string;
  body: any;
  kind: "red" | "blue" | "silver" | "fbwg";
  /** 原版 userData "diamond-{fb|wg|silver|fbwg}" */
  char: string;
  collected: boolean;
  /** 屏幕 px 中心（原始解析值） */
  x: number;
  y: number;
}

export interface DoorInfo {
  body: any;
  role: "fireboy" | "watergirl";
  char: "fb" | "wg";
  /** 门底铰点屏幕 px（pos = (x+32, y)，Door 构造体） */
  pos: { x: number; y: number };
  /** 当前角色站在感应带上 */
  isOpen: boolean;
  /** 开门扫帧进度（25fps，21 帧到位） */
  frac: number;
  isUp: boolean;
  /** 已派发到位信号（防重复） */
  signaled: boolean;
}

export interface BuiltWorld {
  B: B2;
  world: any;
  groundBody: any;
  liquids: LiquidInfo[];
  diamonds: DiamondInfo[];
  doors: Record<"fireboy" | "watergirl", DoorInfo>;
  /** 屏幕像素尺寸 */
  widthPx: number;
  heightPx: number;
}

/** 原版 createGroundShape（type 8/9 端盖、1/2 斜面、3/4 半格楔，单位米，本地顶点）。
 *  r2 件3：六种顶点全静态，缓存为模块级常量（构建期不再逐次分配）。 */
const SHAPE_PTS: Readonly<Record<number, ReadonlyArray<{ x: number; y: number }>>> = {
  1: [{ x: -1, y: 0 }, { x: -1, y: -1 }, { x: 0, y: -1 }], // 也可 -2 / 11（11 已在解析层 remap 成 1）
  2: [{ x: 0, y: 0 }, { x: -1, y: -1 }, { x: 0, y: -1 }], // 也可 12（已 remap）
  3: [{ x: 0, y: 0 }, { x: -1, y: 0 }, { x: -1, y: -1 }],
  4: [{ x: 0, y: 0 }, { x: -1, y: 0 }, { x: 0, y: -1 }],
  // 液体左端盖：整格宽 + 顶向外扩 0.3m（源码 (0,0)(-1.3,-0.5)(-1.3,-1)(0,-1)）
  8: [{ x: 0, y: 0 }, { x: -1.3, y: -0.5 }, { x: -1.3, y: -1 }, { x: 0, y: -1 }],
  // 液体右端盖（镜像）
  9: [{ x: 0.3, y: -0.5 }, { x: -1, y: 0 }, { x: -1, y: -1 }, { x: 0.3, y: -1 }],
};

function groundShapePts(type: number): ReadonlyArray<{ x: number; y: number }> {
  const pts = SHAPE_PTS[type];
  if (!pts) throw new Error(`createGroundShape: 未支持的 type ${type}`);
  return pts;
}

/** 地面 fixture 公共过滤项（原版 createGroundFixture 语义） */
const GROUND_FIXTURE_OPTS: FixtureOptions = {
  categoryBits: FILTER.GROUND_CAT,
  maskBits: FILTER.GROUND_MASK,
  friction: 0.8,
};

/**
 * 多边形 fixture 直构（r2 件3）：顶点一步到位落 b2Vec2——省旧路径
 * 「模板 → 平移出中间 {x,y}[] → polygonFixture 再 map 出 b2Vec2[]」的两层数组/对象
 * 分配（b2PolygonShape.Set 只读输入数组并拷贝进自身 m_vertices，不保留引用）。
 * 平移表达式与旧路径逐操作同构（p.x - ox / p.y - oy），位级同值。
 */
function groundFixture(B: B2, groundBody: any, pts: ReadonlyArray<{ x: number; y: number }>, ox: number, oy: number): void {
  const shape = new B.b2PolygonShape();
  const verts = new Array(pts.length);
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    verts[i] = new B.b2Vec2(p.x - ox, p.y - oy);
  }
  shape.Set(verts);
  groundBody.CreateFixture(makeFixtureDef(B, { shape, ...GROUND_FIXTURE_OPTS }));
}

/** 轴对齐四边形 fixture 直构（实体 run / 液体中段与感应带：四角坐标 → b2Vec2 一步到位） */
function quadFixture(body: any, B: B2, x1: number, y1: number, x2: number, y2: number, opts: FixtureOptions): any {
  const shape = new B.b2PolygonShape();
  shape.Set([new B.b2Vec2(x1, y1), new B.b2Vec2(x2, y1), new B.b2Vec2(x2, y2), new B.b2Vec2(x1, y2)]);
  return body.CreateFixture(makeFixtureDef(B, { shape, ...opts }));
}

/** 液体行段三件静态几何 + Liquid 感应体（convertTilemap 液体分支 + Liquid 构造体逐字节转写） */
function buildLiquid(B: B2, world: any, groundBody: any, run: LiquidRunInfo): void {
  const { col0, col1, row } = run;
  const A = col1 - col0 + 1;
  // 左端盖：createGroundShape(8, (pxm(d)-A+1, pxm(e)))，d=col1*32、e=row*32 → 平移 (col0, row)
  groundFixture(B, groundBody, groundShapePts(8), col0, row);
  // 右端盖：createGroundShape(9, (pxm(d), pxm(e))) → 平移 (col1, row)
  groundFixture(B, groundBody, groundShapePts(9), col1, row);
  // 中段下半格盒：(−1,−0.45)(−A+1,−0.45)(−A+1,−1)(−1,−1) − (col0, row)
  quadFixture(groundBody, B, -1 - col0, -0.45 - row, -A + 1 - col0, -1 - row, GROUND_FIXTURE_OPTS);

  // Liquid 设备体：static body SetPosition(−col0, −row)，局部 fixture [−A,0]×…
  const bd = new B.b2BodyDef();
  bd.type = B.b2BodyType.b2_staticBody;
  bd.position = new B.b2Vec2(-col0, -row);
  const body = world.CreateBody(bd);
  // 显示/光源带：液面下 0.15–0.5m，mask 61695（不含角色），sensor；
  // lp normal+sensor（原版 sensorFixture userData @1664790 逐字）——Beamer 照射标记落点
  const sensorFixture = quadFixture(body, B, 0, -0.15, -A, -0.5, {
    categoryBits: FILTER.GROUND_CAT,
    maskBits: FILTER.LIQUID_SENSOR_MASK,
    friction: 0.7,
    isSensor: true,
    userData: { type: "liquid", liquidType: run.liquidType, lightProperties: { type: "normal", sensor: true, iluminated: null, lightAt: null } },
  });
  // 冰面带：上半格，mask 0（森林无冰，保留几何保真）；lp transparent（原版 iceFixture @1664810——
  // 光束穿冰面碰撞体打到下方液面 sensor，冻结后 sensor 翻 mirror 在液面反光）
  const iceFixture = quadFixture(body, B, 0, 0, -A, -0.5, {
    categoryBits: FILTER.GROUND_CAT,
    maskBits: 0,
    friction: 0,
    userData: { type: "ice", liquidType: run.liquidType, lightProperties: { type: "transparent" } },
  });
  // 致死带：液面下 0.18–1.0m，mask 4369，sensor；lp transparent（原版 killFixture @1664350——光束穿入水体）
  quadFixture(body, B, 0, -0.18, -A, -1, {
    categoryBits: FILTER.GROUND_CAT,
    maskBits: FILTER.GROUND_MASK,
    friction: 0.7,
    isSensor: true,
    userData: { type: "liquid_death", liquidType: run.liquidType, lightProperties: { type: "transparent" } },
  });
  run.body = body;
  run.sensorFixture = sensorFixture;
  run.iceFixture = iceFixture;
}

interface LiquidRunInfo {
  col0: number;
  col1: number;
  row: number;
  kind: "water" | "lava" | "green";
  liquidType: number;
  startFrozen: boolean;
  body?: any;
  sensorFixture?: any;
  iceFixture?: any;
}

export function buildLevelWorld(level: LevelData): BuiltWorld {
  const B = b2();
  const world = new B.b2World(new B.b2Vec2(0, -31.25), true);

  // ---- 地面体（原版单一 static groundBody，userData "ground"）----
  const gbd = new B.b2BodyDef();
  gbd.type = B.b2BodyType.b2_staticBody;
  gbd.position = new B.b2Vec2(0, 0);
  const groundBody = world.CreateBody(gbd);
  groundBody.SetUserData("ground");

  const liquids: LiquidInfo[] = [];
  const runInfos: LiquidRunInfo[] = level.liquidRuns.map((r: LiquidRun) => ({
    col0: r.col0,
    col1: r.col1,
    row: r.row,
    kind: r.kind,
    liquidType: r.kind === "water" ? GROUND_TYPE.WATER : r.kind === "lava" ? GROUND_TYPE.LAVA : GROUND_TYPE.GREEN,
    startFrozen: r.startFrozen,
  }));

  // ---- Snow 雪面设备（#35；原版 CreateSnows @62343：type10/11/12 每格设备，cat1/mask16/friction1/
  //      isSensor，snowCount 计数 → setOnIce。oracle 按行/对角 run 合并建设备，覆盖格集相同，
  //      这里按格建 sensor 逐位等价；实体碰撞体由主扫描按 remap 后类型另建，互不替代）----
  for (let i = 0; i < level.snowGrid.length; i++) {
    const t = level.snowGrid[i];
    if (!t) continue;
    const col = i % level.cols;
    const row = (i / level.cols) | 0;
    quadFixture(groundBody, B, -1 - col, -1 - row, -col, -row, {
      categoryBits: FILTER.GROUND_CAT,
      maskBits: FILTER.CHAR_CAT,
      friction: 1,
      isSensor: true,
      userData: { type: "snow" },
    });
  }

  // ---- convertTilemap 主扫描（行优先；实体横向合并、液体行段、其余逐格）----
  for (let row = 0; row < level.rows; row++) {
    let runA = 0;
    let runV = 0;
    for (let col = 0; col <= level.cols; col++) {
      const inside = col < level.cols;
      const t = inside ? level.groundType[row * level.cols + col] : -99;
      if (inside && t === GROUND_TYPE.SOLID) {
        const px = col * 32;
        const py = row * 32;
        if (runA === 0) {
          runV = px;
          runA = 1;
        } else {
          runA += 1;
        }
        const right = col + 1 < level.cols ? level.groundType[row * level.cols + col + 1] : -99;
        if (right === GROUND_TYPE.SOLID) continue;
        // 实体 run 收口：[(0,0),(−A,0),(−A,−1),(0,−1)] − (v/32, w/32)
        quadFixture(groundBody, B, -runV / 32, -py / 32, -runA - runV / 32, -1 - py / 32, GROUND_FIXTURE_OPTS);
        runA = 0;
      } else if (inside && (t === GROUND_TYPE.SLOPE_A || t === GROUND_TYPE.SLOPE_B || t === GROUND_TYPE.WEDGE_C || t === GROUND_TYPE.WEDGE_D)) {
        // 斜面/半格楔：createGroundShape(t, (col, row))
        groundFixture(B, groundBody, groundShapePts(t), col, row);
      }
      // 液体格与 DECOR(−1)/空格：液体行段由 level.liquidRuns 统一构建，此处仅天然打断实体 run
    }
  }

  // 液体行段（独立于网格扫描：level2 已合并好 run）
  for (const r of runInfos) {
    buildLiquid(B, world, groundBody, r);
    liquids.push({
      body: r.body,
      kind: r.kind,
      liquidType: r.liquidType,
      col0: r.col0,
      col1: r.col1,
      row: r.row,
      startFrozen: r.startFrozen,
      frozen: false,
      sensorFixture: r.sensorFixture,
      sensorLp: (r.sensorFixture?.GetUserData ? r.sensorFixture.GetUserData() : r.sensorFixture?.m_userData)?.lightProperties,
      iceFixture: r.iceFixture,
      nearBodies: [],
      frozenBodies: [],
    });
  }

  // ---- 世界四壁（插件 setBounds(−100,−100,W+200,H+200)，厚度 100px=3.125m）----
  const W = level.widthPx;
  const H = level.heightPx;
  const m = 100 / 32;
  const wallDef = () => {
    const bd = new B.b2BodyDef();
    bd.type = B.b2BodyType.b2_staticBody;
    bd.position = new B.b2Vec2(0, 0);
    return world.CreateBody(bd);
  };
  const wallOpts = { categoryBits: FILTER.WALL_CAT, maskBits: FILTER.WALL_MASK };
  // left：half(3.125, H/32+3.125) center(6.25, 3.125)
  boxFixture(wallDef(), B, m, H / 32 + m, { x: m - -100 / 32, y: -(-100 / 32) }, 0, wallOpts);
  // right：center(−W/32−3.125, 3.125)
  boxFixture(wallDef(), B, m, H / 32 + m, { x: -(W + 200) / 32 - m - -100 / 32, y: -(-100 / 32) }, 0, wallOpts);
  // top：half(W/32+6.25, 3.125) center(3.125, 6.25)
  boxFixture(wallDef(), B, W / 32 + m, m, { x: -(-100 / 32), y: m - -100 / 32 }, 0, wallOpts);
  // bottom：center(3.125, −H/32−6.25)
  boxFixture(wallDef(), B, W / 32 + m, m, { x: -(-100 / 32), y: -(H + 200) / 32 - m - -100 / 32 }, 0, wallOpts);

  // ---- 钻石（Diamond 构造体：(raw.x+32, raw.y−32)——level2 中心恰为该值，无需再加偏移）----
  const diamonds: DiamondInfo[] = level.diamonds.map((d) => {
    const bd = new B.b2BodyDef();
    bd.type = B.b2BodyType.b2_staticBody;
    bd.position = new B.b2Vec2(px2m(d.x), px2m(d.y));
    const body = world.CreateBody(bd);
    boxFixture(body, B, 0.35, 0.35, { x: 0, y: 0 }, 0, {
      friction: 0.7,
      restitution: 0,
      density: 0,
      isSensor: true,
      userData: { type: "diamond", char: diamondChar(d.kind) },
    });
    return { id: d.id, body, kind: d.kind, char: diamondChar(d.kind), collected: false, x: d.x, y: d.y };
  });

  // ---- 门（Door 构造体：pos=(x+32, y底边)，sprite y+4；sensor 1×0.125m 于门底条带）----
  const mkDoor = (role: "fireboy" | "watergirl", rect: { x: number; y: number; h: number }): DoorInfo => {
    const char = role === "fireboy" ? "fb" : "wg";
    // 原版 Door 用对象的【底边】y（pos=(x+32px, y底)），level2 已把 doors.y 换算为顶边 → 加回 h
    const pos = { x: rect.x + 32, y: rect.y + rect.h };
    const bd = new B.b2BodyDef();
    bd.type = B.b2BodyType.b2_staticBody;
    bd.position = new B.b2Vec2(px2m(pos.x), px2m(pos.y + 4));
    const body = world.CreateBody(bd);
    boxFixture(body, B, 1, 0.125, { x: 0, y: 0 }, 0, {
      friction: 0.7,
      restitution: 0,
      density: 0,
      isSensor: true,
      userData: { type: "door", char },
    });
    return { body, role, char, pos, isOpen: false, frac: 0, isUp: false, signaled: false };
  };
  const doors: Record<"fireboy" | "watergirl", DoorInfo> = {
    fireboy: mkDoor("fireboy", level.doors.fireboy),
    watergirl: mkDoor("watergirl", level.doors.watergirl),
  };

  return { B, world, groundBody, liquids, diamonds, doors, widthPx: W, heightPx: H };
}

function diamondChar(kind: "red" | "blue" | "silver" | "fbwg"): string {
  return kind === "red" ? "fb" : kind === "blue" ? "wg" : kind;
}
