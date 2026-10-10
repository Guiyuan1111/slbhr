import type { Role } from "./types.js";

/**
 * 官方 Tiled JSON 关卡解析 v2 —— 全机制数据驱动（0.3.0 保真重写）。
 *
 * 数据事实全部来自对官方 48 关的逐一扫描与 init.js 字节偏移实证
 * （note/research/2026-10-fidelity/01 §2、05；本文件注释不再重复偏移，凡"原版"处见 research）。
 *
 * 坐标约定：一律使用 Tiled 原始像素坐标（y 向下、屏幕系）。物理内核负责换算
 * （屏幕 = (−32·b2x, −32·b2y)，即 b2x = −x/32、b2y = −y/32）。
 *
 * 关键数据事实：
 * - 老版 Tiled：图块对象（gid）的 y 是【底边】，矩形/折线/多边形对象的 y 是【顶边】。
 * - gid → 图块集归属按 Phaser 规则：取 firstgid ≤ gid 中【最大】者（实测 forest_09
 *   Ground@1/Chars@16/LargeObjects@24/Objects@27，gid28 必须归 Objects#1 拉杆）。
 * - firstgid 逐关可变：Ground 恒 1；Chars 16/32/35；Objects 24/23/27/16/26；LargeObjects 24/39/40/32/23。
 *   解析必须逐关读 tilesets[].firstgid+source，禁止任何写死的本地 id。
 * - 机关默认属性在【图块集】的 tileproperties 里（如 lever 的 onis/startPos、wind 的 length:10），
 *   关卡对象上的 properties 覆盖同名默认（原版 parseMapPropper 运行时合并语义）。
 * - Ground 层地图数据只出现 gid1..8（本地 0..7 → type 0..7）；type 8/9（液体端盖）是运行时生成，
 *   不来自地图；type 11/12 雪地变体与 55 冰面森林未用（解析器仍按原版 remap 语义处理）。
 * - 教学层每关最多一种变体名（Tutorial_dual/single/keyboard），步骤=触发矩形对象+文本对象，按 properties.id 配对。
 */

// ---------------------------------------------------------------- 常量

/** Ground 层 type 语义（Ground.json tileproperties.type，原版 createGroundShape/drawTile 分支） */
export const GROUND_TYPE = {
  /** 实心整格 */
  SOLID: 0,
  /** 凸斜面"/"：实心三角 (−1,0)(−1,−1)(0,−1)，本地单位=米 */
  SLOPE_A: 1,
  /** 凸斜面"\"（镜像） */
  SLOPE_B: 2,
  /** 半格三角 (0,0)(−1,0)(−1,−1) */
  WEDGE_C: 3,
  /** 半格三角 (0,0)(−1,0)(0,−1) */
  WEDGE_D: 4,
  WATER: 5,
  LAVA: 6,
  GREEN: 7,
  /** 液体行左端盖墙（运行时生成，顶外扩 0.3m） */
  CAP_L: 8,
  /** 液体行右端盖墙 */
  CAP_R: 9,
  /** 装饰空砖：只画不撞（森林未出现） */
  DECOR: -1,
} as const;

/** 雪地变体 remap（原版 drawTile @1831600：11→1、12→2） */
const SLOPE_REMAP: Record<number, number> = { 11: 1, 12: 2 };

export type LiquidKind = "water" | "lava" | "green";

export function liquidKindOf(type: number): LiquidKind | undefined {
  if (type === GROUND_TYPE.WATER) return "water";
  if (type === GROUND_TYPE.LAVA) return "lava";
  if (type === GROUND_TYPE.GREEN) return "green";
  return undefined;
}

// ---------------------------------------------------------------- 数据类型

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Point {
  x: number;
  y: number;
}

export type DiamondKind = "red" | "blue" | "silver" | "fbwg";

export interface DiamondDef {
  id: string;
  kind: DiamondKind;
  /** 64×64 图块对象的中心（像素；原版生成时再整体上抬 1m，由内核处理） */
  x: number;
  y: number;
}

/** 液体行段：Ground 层同一行内连续同种液体格（原版 Liquid 每"行段"一对象） */
export interface LiquidRun {
  kind: LiquidKind;
  /** 行号（0=顶） */
  row: number;
  /** 起止列（含端点） */
  col0: number;
  col1: number;
}

export interface LeverDef {
  id: string;
  group: number;
  /** 电机回弹方向系数（Objects#1 → +1，#2 → −1） */
  onis: number;
  /** 初始扳向（图块集默认 −1/+1） */
  startPos: number;
  /** 64×64 图块对象中心（像素） */
  x: number;
  y: number;
}

/** 按钮/压板（原版 Pusher：prismatic 踏板，行程 0.7m、阈值 0.2m） */
export interface PusherDef {
  id: string;
  group: number;
  x: number;
  y: number;
}

export interface BoxDef {
  id: string;
  /** boxheavy（仅 bonus_2）：密度/摩擦不同的重箱 */
  heavy: boolean;
  x: number;
  y: number;
  /** 度（原版 Device 基类 SetAngle(rad(rotation))；forest_24_1 实测 17.4°） */
  rotation: number;
}

export interface BallDef {
  id: string;
  x: number;
  y: number;
}

/** 风区（Objects#15 或 LargeObjects#2 两种载体，森林只用后者） */
export interface WindDef {
  id: string;
  group: number;
  /** 对象矩形（顶边系） */
  rect: Rect;
  /** 度（forest_03 实测 −90） */
  rotation: number;
  /** 米（图块集默认 10） */
  lengthM: number;
  initialState: number;
}

/** 风机身体原点（=原版 wind_base/wind_effect 精灵位）：BoxedDevice 矫正（bundle @1772560，
 * 金轨迹实证）。boxSize={x:−3,y:2} 经插件 mpx(正)→e=(−48,+32)px，按 −(rotation+90)° 旋转；
 * center = (原始x + e.x, 原始底边y − e.y)；rect.y 已换算顶边 → 底边 = rect.y + rect.h。
 * 内核 Wind body 与客户端风机贴图共用此点（原版 enable() 自动同步精灵=体位）。 */
export function windBodyPos(def: { rect: Rect; rotation: number }): { x: number; y: number } {
  const rotDeg = def.rotation + 90;
  const eAng = (-rotDeg * Math.PI) / 180;
  const ex = -48 * Math.cos(eAng) - 32 * Math.sin(eAng);
  const ey = -48 * Math.sin(eAng) + 32 * Math.cos(eAng);
  return { x: def.rect.x + ex, y: def.rect.y + def.rect.h - ey };
}

export interface PlatformDef {
  id: string;
  /** 端点 A = 对象矩形（顶边系，像素） */
  x: number;
  y: number;
  w: number;
  h: number;
  /** 平移轴向量，单位=格=米（原版 dx/dy 属性；缺省 dx=4、dy=0） */
  dx: number;
  dy: number;
  /** 关联拉杆/按钮组（缺省 0；平台纯信号驱动，无组信号即停在原位） */
  group: number;
  /** 旋转臂角度，度（实测 90）；存在时为旋转平台 */
  dtheta?: number;
  /** 旋转/竖直变体的 y 偏移，米（实测 −1/−1.5） */
  offsetY?: number;
  /** Tiled 旋转，度（原版体角=SetAngle(rotation)；森林平台多为 0，bonus_3 有 135° 斜台） */
  rotation: number;
}

export interface HangingDef {
  id: string;
  /** 折线绝对坐标（像素）：锚点→绳→板 */
  pts: Point[];
  fullRotation?: boolean;
  barWidth?: number;
}

export interface PulleyDef {
  id: string;
  /** 折线绝对坐标：板1、轮1、轮2、板2 */
  pts: Point[];
  barWidth?: number;
}

export interface RomanDef {
  id: string;
  /** 多边形绝对坐标（实测 2 点：杠两端） */
  pts: Point[];
}

export interface WindowDef {
  id: string;
  rect: Rect;
  dx: number;
  dy: number;
  group: number;
}

export interface TutorialStep {
  /** 步骤 id（properties.id） */
  id: number;
  /** 触发矩形（无文本的矩形对象；原版角色进入后文字 400ms 淡入） */
  trigger?: Rect;
  /** 首条显示文本（兼容字段，= texts[0]） */
  text?: string;
  /** 首条文本显示区（= textRects[0]） */
  textRect?: Rect;
  /** 全部文本（同 id 多条，forest_01 Tutorial_dual id=0 实测 2 条） */
  texts: string[];
  textRects: Rect[];
  /**
   * 逐文本对象明细（原版 setupTutorial @1929845：bitmapText(k.x, k.y, "font", 文本, 18, halign)、
   * maxWidth = 对象宽、初始不可见——位置用 text 对象自身坐标而非触发矩形换算）。
   */
  textItems: Array<{ text: string; halign?: string; x: number; y: number; width: number }>;
}

export interface LevelData {
  id: string;
  cols: number;
  rows: number;
  tile: number;
  widthPx: number;
  heightPx: number;
  /** Ground 层原始 gid（0=空），客户端选贴图用 */
  ground: Uint16Array;
  /** 每格 type（行优先）：−99=空格，其余见 GROUND_TYPE；雪地变体已 remap */
  groundType: Int16Array;
  /** 液体行段（原版 Liquid 对象粒度） */
  liquidRuns: LiquidRun[];
  spawn: Record<Role, Point>;
  doors: Record<Role, Rect>;
  diamonds: DiamondDef[];
  levers: LeverDef[];
  pushers: PusherDef[];
  boxes: BoxDef[];
  balls: BallDef[];
  winds: WindDef[];
  platforms: PlatformDef[];
  hangings: HangingDef[];
  pulleys: PulleyDef[];
  romans: RomanDef[];
  windows: WindowDef[];
  /** 教学步骤（已按 id 配对触发区与文本；选层优先级 dual > keyboard > single > 任意） */
  tutorials: TutorialStep[];
  /** 各教学层变体（layer 名 → 步骤），原版按 settings.controls 选层 */
  tutorialVariants: Record<string, TutorialStep[]>;
  /** 无 gid 无 type 的噪声对象等（原版 console.warn 跳过；保留计数便于审计） */
  unknown: string[];
}

// ---------------------------------------------------------------- 解析

export type TilesetProvider = (source: string) => unknown;

interface TilesetRef {
  base: string;
  firstgid: number;
  source: string;
}

function baseNameOf(source: string): string {
  const s = String(source);
  return s.slice(s.lastIndexOf("/") + 1, s.lastIndexOf("."));
}

/** 外部图块集引用按 source 文件名匹配（老版 Tiled 条目无 name） */
function refOf(json: any, base: string): TilesetRef {
  const ref = json.tilesets.find((t: any) => baseNameOf(t.source) === base);
  if (!ref) throw new Error(`缺少图块集引用: ${base}`);
  return { base, firstgid: Number(ref.firstgid), source: String(ref.source) };
}

/**
 * gid 归属：Phaser 规则 —— 所有 firstgid ≤ gid 的图块集中取 firstgid 最大者。
 * 同 firstgid 时取数组靠后者（与 Phaser 顺序遍历保留最后匹配一致）。
 */
function resolveGid(json: any, gid: number): TilesetRef {
  let best: TilesetRef | undefined;
  for (const t of json.tilesets as any[]) {
    const firstgid = Number(t.firstgid);
    if (firstgid <= gid && (!best || firstgid >= best.firstgid)) {
      best = { base: baseNameOf(t.source), firstgid, source: String(t.source) };
    }
  }
  if (!best) throw new Error(`gid ${gid} 不属于任何图块集`);
  return best;
}

/** 图块集默认属性（tileproperties[localId]），关卡对象属性覆盖同名键（原版 parseMapPropper 语义） */
function mergedProps(tileset: any, localId: number, object: any): Record<string, unknown> {
  return { ...(tileset?.tileproperties?.[String(localId)] ?? {}), ...(object.properties ?? {}) };
}

function num(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

/** 图块对象（gid）：y 是底边 → 换算顶边矩形 */
function tileObjRect(o: any): Rect {
  const w = num(o.width, 64);
  const h = num(o.height, 64);
  return { x: num(o.x), y: num(o.y) - h, w, h };
}

function centerOf(r: Rect): Point {
  return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
}

/** 折线/多边形对象的点 → 绝对坐标 */
function absPoints(o: any): Point[] {
  const raw = o.polyline ?? o.polygon ?? [];
  return raw.map((p: any) => ({ x: num(o.x) + num(p.x), y: num(o.y) + num(p.y) }));
}

export function parseLevel(id: string, json: any, getTileset: TilesetProvider): LevelData {
  const tile = num(json.tilewidth, 32);
  const cols = num(json.width);
  const rows = num(json.height);
  const groundLayer = (json.layers as any[]).find((l) => l.type === "tilelayer" && l.name === "Ground");
  if (!groundLayer) throw new Error(`关卡 ${id} 缺少 Ground 层`);

  const groundRef = refOf(json, "Ground");
  const groundTs = getTileset(groundRef.source) as any;

  // ---- Ground 网格 ----
  const ground = new Uint16Array(cols * rows);
  const groundType = new Int16Array(cols * rows).fill(-99);
  const liquidRuns: LiquidRun[] = [];
  for (let row = 0; row < rows; row++) {
    let runKind: LiquidKind | undefined;
    let runStart = 0;
    for (let col = 0; col <= cols; col++) {
      const i = row * cols + col;
      let kind: LiquidKind | undefined;
      if (col < cols) {
        const gid = Number(groundLayer.data[i]) | 0;
        if (gid) {
          ground[i] = gid;
          const localId = gid - groundRef.firstgid;
          let t = groundTs?.tileproperties?.[String(localId)]?.type;
          if (t === undefined) t = GROUND_TYPE.SOLID;
          t = Number(t);
          if (SLOPE_REMAP[t] !== undefined) t = SLOPE_REMAP[t];
          groundType[i] = t;
          kind = liquidKindOf(t);
        }
      }
      // 行扫描：同种液体连续段成 run（col==cols 收尾）
      if (kind !== runKind && runKind !== undefined) {
        liquidRuns.push({ kind: runKind, row, col0: runStart, col1: col - 1 });
      }
      if (kind !== runKind) {
        runKind = kind;
        runStart = col;
      }
    }
  }

  const spawn: Record<Role, Point> = {
    fireboy: { x: NaN, y: NaN },
    watergirl: { x: NaN, y: NaN },
  };
  const doors: Record<Role, Rect> = {
    fireboy: { x: NaN, y: NaN, w: 0, h: 0 },
    watergirl: { x: NaN, y: NaN, w: 0, h: 0 },
  };
  const diamonds: DiamondDef[] = [];
  const levers: LeverDef[] = [];
  const pushers: PusherDef[] = [];
  const boxes: BoxDef[] = [];
  const balls: BallDef[] = [];
  const winds: WindDef[] = [];
  const platforms: PlatformDef[] = [];
  const hangings: HangingDef[] = [];
  const pulleys: PulleyDef[] = [];
  const romans: RomanDef[] = [];
  const windows: WindowDef[] = [];
  const unknown: string[] = [];
  const tutorialVariants: Record<string, TutorialStep[]> = {};

  const charDiamondKind: Record<string, DiamondKind> = { fb: "red", wg: "blue", silver: "silver", fbwg: "fbwg" };

  for (const layer of json.layers as any[]) {
    if (layer.type !== "objectgroup") continue;
    const name = String(layer.name ?? "");

    if (name === "Chars") {
      for (const o of layer.objects ?? []) {
        if (o.gid === undefined) {
          unknown.push(`Chars:空对象 id=${o.id}`);
          continue;
        }
        const ref = resolveGid(json, Number(o.gid));
        const localId = Number(o.gid) - ref.firstgid;
        const ts = getTileset(ref.source) as any;
        const kind = ts?.tiles?.[String(localId)]?.type;
        const props = mergedProps(ts, localId, o);
        const r = tileObjRect(o);
        if (kind === "char") {
          const role: Role = props.char === "wg" ? "watergirl" : "fireboy";
          // 出生点 = 图块对象底边中点（原版 new character 前的锚点）
          spawn[role] = { x: r.x + r.w / 2, y: r.y + r.h };
        } else if (kind === "door") {
          doors[props.char === "wg" ? "watergirl" : "fireboy"] = r;
        } else if (kind === "diamond") {
          const c = centerOf(r);
          diamonds.push({
            id: `d${diamonds.length}`,
            kind: charDiamondKind[String(props.char)] ?? "red",
            x: c.x,
            y: c.y,
          });
        } else {
          unknown.push(`Chars:未知类型 local=${localId} type=${kind}`);
        }
      }
      continue;
    }

    if (name === "Objects") {
      for (const o of layer.objects ?? []) {
        if (o.gid === undefined && !o.type) {
          unknown.push(`Objects:空对象 id=${o.id}`);
          continue;
        }
        if (o.gid === undefined) {
          const type = String(o.type);
          if (type === "platform") {
            platforms.push({
              id: `p${platforms.length}`,
              x: num(o.x),
              y: num(o.y),
              w: num(o.width, 128),
              h: num(o.height, 32),
              // 类默认 properties:{group:0, dx:4, dy:0}（deepObjectExtend 只补缺失键）
              dx: num(o.properties?.dx, 4),
              dy: num(o.properties?.dy, 0),
              group: num(o.properties?.group, 0),
              dtheta: o.properties?.dtheta === undefined ? undefined : num(o.properties.dtheta),
              offsetY: o.properties?.offsetY === undefined ? undefined : num(o.properties.offsetY),
              rotation: num(o.rotation),
            });
          } else if (type === "hanging" || type === "pulley") {
            const pts = absPoints(o);
            if (type === "hanging") {
              hangings.push({
                id: `h${hangings.length}`,
                pts,
                fullRotation: o.properties?.fullRotation === true,
                barWidth: o.properties?.barWidth === undefined ? undefined : num(o.properties.barWidth),
              });
            } else {
              pulleys.push({
                id: `u${pulleys.length}`,
                pts,
                barWidth: o.properties?.barWidth === undefined ? undefined : num(o.properties.barWidth),
              });
            }
          } else if (type === "roman") {
            romans.push({ id: `r${romans.length}`, pts: absPoints(o) });
          } else if (type === "window") {
            windows.push({
              id: `w${windows.length}`,
              rect: { x: num(o.x), y: num(o.y), w: num(o.width, 64), h: num(o.height, 32) },
              dx: num(o.properties?.dx),
              dy: num(o.properties?.dy),
              group: num(o.properties?.group),
            });
          } else {
            unknown.push(`Objects:type=${type}`);
          }
          continue;
        }
        const gid = Number(o.gid);
        const ref = resolveGid(json, gid);
        const localId = gid - ref.firstgid;
        const ts = getTileset(ref.source) as any;
        const typeName = String(ts?.tiles?.[String(localId)]?.type ?? "");
        const r = tileObjRect(o);
        const c = centerOf(r);
        if (ref.base === "Objects") {
          const props = mergedProps(ts, localId, o);
          switch (typeName) {
            case "pusher":
              pushers.push({ id: `b${pushers.length}`, group: num(props.group), x: c.x, y: c.y });
              break;
            case "lever":
              levers.push({
                id: `l${levers.length}`,
                group: num(props.group),
                onis: num(props.onis, 1),
                startPos: num(props.startPos, -1),
                x: c.x,
                y: c.y,
              });
              break;
            case "box":
              boxes.push({ id: `x${boxes.length}`, heavy: false, x: c.x, y: c.y, rotation: num(o.rotation) });
              break;
            case "boxheavy":
              boxes.push({ id: `x${boxes.length}`, heavy: true, x: c.x, y: c.y, rotation: num(o.rotation) });
              break;
            case "ball":
              balls.push({ id: `a${balls.length}`, x: c.x, y: c.y });
              break;
            case "wind":
              winds.push({
                id: `f${winds.length}`,
                group: num(props.group),
                rect: r,
                rotation: num(o.rotation),
                lengthM: num(props.length, 10),
                initialState: num(props.initialState),
              });
              break;
            default:
              // beamer/rotmirror/lightpusher/infinitemirror/boxmirror/timedpusher：森林未用，记录即可
              unknown.push(`Objects:${typeName || `local${localId}`}`);
          }
        } else if (ref.base === "LargeObjects") {
          const props = mergedProps(ts, localId, o);
          if (typeName === "wind") {
            winds.push({
              id: `f${winds.length}`,
              group: num(props.group),
              rect: r,
              // 风向是 Tiled 对象自身的 rotation 字段（度；forest_03 实测 −90），不是属性
              rotation: num(o.rotation),
              lengthM: num(props.length, 10),
              initialState: num(props.initialState),
            });
          } else {
            unknown.push(`LargeObjects:${typeName || `local${localId}`}`);
          }
        } else {
          unknown.push(`Objects:gid=${gid}@${ref.base}`);
        }
      }
      continue;
    }

    if (name.startsWith("Tutorial_")) {
      const steps = new Map<number, TutorialStep>();
      for (const o of layer.objects ?? []) {
        const stepId = num(o.properties?.id, -1);
        if (stepId < 0) continue;
        const step = steps.get(stepId) ?? { id: stepId, texts: [], textRects: [], textItems: [] };
        if (o.text?.text) {
          step.texts.push(String(o.text.text));
          step.textRects.push({ x: num(o.x), y: num(o.y), w: num(o.width), h: num(o.height) });
          step.text = step.texts[0];
          step.textRect = step.textRects[0];
          step.textItems.push({ text: String(o.text.text), halign: o.text.halign, x: num(o.x), y: num(o.y), width: num(o.width) });
        } else {
          step.trigger = { x: num(o.x), y: num(o.y), w: num(o.width), h: num(o.height) };
        }
        steps.set(stepId, step);
      }
      tutorialVariants[name] = [...steps.values()].sort((a, b) => a.id - b.id);
    }
    // 其余层忽略
  }

  // 原版按 settings.controls 取层（桌面默认 keyboard，bundle:44756）；keyboard 文案
  // =「请用A,W,D键移动冰女孩/请用方向键移动火男孩」——我方双机双控正是键盘并用，键盘层优先
  const tutorials =
    tutorialVariants["Tutorial_keyboard"] ??
    tutorialVariants["Tutorial_dual"] ??
    tutorialVariants["Tutorial_single"] ??
    Object.values(tutorialVariants)[0] ??
    [];

  if (Number.isNaN(spawn.fireboy.x) || Number.isNaN(spawn.watergirl.x)) {
    throw new Error(`关卡 ${id} 出生点缺失（fb=(${spawn.fireboy.x},${spawn.fireboy.y}) wg=(${spawn.watergirl.x},${spawn.watergirl.y})）`);
  }

  return {
    id,
    cols,
    rows,
    tile,
    widthPx: cols * tile,
    heightPx: rows * tile,
    ground,
    groundType,
    liquidRuns,
    spawn,
    doors,
    diamonds,
    levers,
    pushers,
    boxes,
    balls,
    winds,
    platforms,
    hangings,
    pulleys,
    romans,
    windows,
    tutorials,
    tutorialVariants,
    unknown,
  };
}
