import { P } from "./params.js";
import type { Role } from "./types.js";

/**
 * 官方 Tiled JSON 关卡解析。
 *
 * 数据事实（来自对 output/A 的实证侦察，详见 note/PLAN.md）：
 * - Ground：瓦片层，外部图块集 tilesets/Ground.json，tileproperties[localId].type 给出类型。
 *   实证（forest_02 网格）：type 0=实心地形主体；5/6=两种液体池；7=绿浆；其余少见于边缘。
 *   ⚠ type 5 与 6 谁是水谁是岩浆尚未真机对照，定义见下方 LIQUID_*，错了翻转常量即可。
 * - Chars：对象层，gid=16..23（图块集 firstgid=16）：
 *   16=火人出生点 17=水女孩出生点 18=火人门 19=水女孩门
 *   20=红钻(火人) 21=蓝钻(水女孩) 22=银钻 23=红蓝双色
 *   Tiled 老版对象以「底边」为 y 坐标（已实证：出生点 y=896 恰为地面行顶）。
 * - Objects：对象层。gid=24 拉杆（props.group）；type='platform' 移动平台（props.dx/dy 单位=图块）。
 *   其余机关（gid25/26/27/28/29...）M3 处理，本阶段忽略并记录。
 * - 名为 Tutorial_* 的对象层是教学提示，直接忽略。
 */

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type DiamondKind = "red" | "blue" | "silver" | "fbwg";

export interface DiamondDef {
  id: string;
  kind: DiamondKind;
  /** 中心点像素坐标 */
  x: number;
  y: number;
}

export interface LeverDef {
  id: string;
  group: number;
  rect: Rect;
  /** 原版出厂默认 startPos=−1（onis=−1）：杆体停在关节角下限 −0.2π（实测 jt≈−0.66），state=0（OFF），
   *  组平台开局位于高位端 target 0（实测 P1 body y=496）；玩家接触拨动 → 电机转向上限 +0.2π → 平台下沉。
   *  内核简化为接触翻转模型，startOn 恒为 false（startPos 缺省）。 */
  startOn: boolean;
}

/** 按钮板（原版 pusher）：被玩家/推箱压住时其组平台到端点 B，松开回端点 A */
export interface PlateDef {
  id: string;
  group: number;
  rect: Rect;
}

export interface PlatformDef {
  id: string;
  /** 端点 A（初始，左上角像素） */
  x: number;
  y: number;
  w: number;
  h: number;
  /** 端点 B 相对 A 的偏移（像素） */
  dx: number;
  dy: number;
  /** 关联拉杆组；undefined = 自动往返 */
  group?: number;
}

/** Objects 层带贴图的对象原样透出（客户端按 gid 选贴图渲染；物理另行建模） */
export interface MechPropDef {
  /** Objects 图块集 localId（0=拉杆 2=按钮 4=推箱 …） */
  gid: number;
  /** 对象矩形（y 已从底边换算为顶边） */
  rect: Rect;
  props: Record<string, unknown>;
}

/** Tutorial_* 层的文本提示（Tiled 文本对象 y 即顶边） */
export interface TutorialTextDef {
  x: number;
  y: number;
  w: number;
  h: number;
  text: string;
}

export interface LevelData {
  id: string;
  widthPx: number;
  heightPx: number;
  tile: number;
  /** 0=可通行 1=实心，行优先，宽=widthPx/tile */
  solid: Uint8Array;
  /** 0=无 1=水(杀火人) 2=岩浆(杀水女孩) 3=绿浆(全杀)，行优先 */
  liquid: Uint8Array;
  /** Ground 层原始 gid（0=空），客户端按它画花纹 */
  ground: Uint16Array;
  /**
   * Ground 层每格原始 type（行优先）：−99=空格；0/1/3=实心；2=非实心斜坡楔（活体实证 8 格可穿行，
   * 坡面行为由下方实心格 + stepHeight 32 攀步呈现）；5/6/7=液体池底（岩浆/水/绿浆）；
   * 8/9=液体端盖兼坡瓦；-1=装饰空砖。
   * 客户端按它选 MaskBox 蒙版帧与前景装饰（原版 drawTile 语义）。
   */
  groundTypes: Int16Array;
  cols: number;
  rows: number;
  spawn: Record<Role, { x: number; y: number }>;
  doors: Record<Role, Rect>;
  diamonds: DiamondDef[];
  levers: LeverDef[];
  plates: PlateDef[];
  platforms: PlatformDef[];
  /** 未纳入物理的机关对象（拉杆/按钮/推箱等），客户端照贴图渲染 */
  mechProps: MechPropDef[];
  /** 教学文字（选最匹配变体后仅一份） */
  tutorials: TutorialTextDef[];
}

/** 液体归属已活体实证：左侧盆地=岩浆(6)、右侧盆地=水(5)、大厅凹槽=绿浆(7)（fireboy 蹚绿浆即死×2） */
export const LIQUID_TILE = { water: 5, lava: 6, green: 7 } as const;
// 原版活体实证：type 2 的 8 个斜坡楔格无碰撞（角色直接穿行），不得计入实心
const SOLID_TYPES = new Set([0, 1, 3, 4, 8, 9, 11, -1]);

export type TilesetProvider = (source: string) => unknown;

/** 读取老版 Tiled 图块集的 tileproperties：localId → 属性对象 */
function tileTypeOf(tileset: any, localId: number): number | undefined {
  const props = (tileset?.tileproperties ?? {})[String(localId)];
  return props ? Number(props.type) : undefined;
}

/** 外部图块集引用条目没有 name，按 source 文件名匹配（Ground.json → Ground） */
function tilesetRef(json: any, baseName: string): { firstgid: number; source: string } {
  const ref = json.tilesets.find((t: any) => {
    const src = String(t.source ?? "");
    const file = src.slice(src.lastIndexOf("/") + 1, src.lastIndexOf("."));
    return file === baseName;
  });
  if (!ref) throw new Error(`缺少图块集引用: ${baseName}`);
  return ref;
}

function objRect(o: any): Rect {
  // Tiled 老版：图块对象 y 为底边
  const w = Number(o.width ?? 64);
  const h = Number(o.height ?? 64);
  return { x: o.x, y: o.y - h, w, h };
}

export function parseLevel(id: string, json: any, getTileset: TilesetProvider): LevelData {
  const tile = Number(json.tilewidth);
  const cols = Number(json.width);
  const rows = Number(json.height);
  const ground = json.layers.find((l: any) => l.type === "tilelayer" && l.name === "Ground");
  if (!ground) throw new Error(`关卡 ${id} 缺少 Ground 层`);
  const groundSet = tilesetRef(json, "Ground");
  const groundTs = getTileset(groundSet.source);

  const solid = new Uint8Array(cols * rows);
  const liquid = new Uint8Array(cols * rows);
  const groundGid = new Uint16Array(cols * rows);
  const groundTypes = new Int16Array(cols * rows).fill(-99);
  for (let i = 0; i < ground.data.length; i++) {
    const gid = ground.data[i];
    if (!gid) continue;
    groundGid[i] = gid;
    const localId = gid - groundSet.firstgid;
    const type = tileTypeOf(groundTs, localId);
    const t = type === undefined ? 0 : type; // 无属性图块按实心处理（保守）
    groundTypes[i] = t;
    if (t === LIQUID_TILE.water) liquid[i] = 1;
    else if (t === LIQUID_TILE.lava) liquid[i] = 2;
    else if (t === LIQUID_TILE.green) liquid[i] = 3;
    else if (SOLID_TYPES.has(t)) solid[i] = 1;
    // 其余类型：既不实心也不致死（当前数据里未出现）
  }

  const spawn: Record<Role, { x: number; y: number }> = {
    fireboy: { x: 0, y: 0 },
    watergirl: { x: 0, y: 0 },
  };
  const doors: Record<Role, Rect> = {
    fireboy: { x: 0, y: 0, w: 0, h: 0 },
    watergirl: { x: 0, y: 0, w: 0, h: 0 },
  };
  const diamonds: DiamondDef[] = [];
  const levers: LeverDef[] = [];
  const plates: PlateDef[] = [];
  const platforms: PlatformDef[] = [];
  const mechProps: MechPropDef[] = [];
  const tutorialVariants = new Map<string, TutorialTextDef[]>();
  const ignored: string[] = [];

  const charsSet = tilesetRef(json, "Chars");
  const objectsSet = tilesetRef(json, "Objects");
  const charLocal = (gid: number) => gid - charsSet.firstgid;
  const objLocal = (gid: number) => gid - objectsSet.firstgid;

  for (const layer of json.layers) {
    if (layer.type !== "objectgroup") continue;
    if (layer.name === "Chars") {
      for (const o of layer.objects) {
        const r = objRect(o);
        const base = o.y; // 底边
        switch (charLocal(o.gid)) {
          case 0:
            spawn.fireboy = { x: r.x + r.w / 2 - P.playerW / 2, y: base - P.playerH };
            break;
          case 1:
            spawn.watergirl = { x: r.x + r.w / 2 - P.playerW / 2, y: base - P.playerH };
            break;
          case 2:
            doors.fireboy = r;
            break;
          case 3:
            doors.watergirl = r;
            break;
          case 4:
          case 5:
          case 6:
          case 7: {
            const kind: DiamondKind = (["red", "blue", "silver", "fbwg"] as const)[charLocal(o.gid) - 4];
            diamonds.push({
              id: `d${diamonds.length}`,
              kind,
              x: r.x + r.w / 2,
              y: base - r.h / 2,
            });
            break;
          }
        }
      }
    } else if (layer.name === "Objects") {
      for (const o of layer.objects) {
        if (o.type === "platform") {
          platforms.push({
            id: `p${platforms.length}`,
            x: o.x,
            y: o.y,
            w: Number(o.width ?? 128),
            h: Number(o.height ?? 32),
            dx: Number(o.properties?.dx ?? 0) * tile,
            dy: Number(o.properties?.dy ?? 0) * tile,
            group: o.properties?.group === undefined ? undefined : Number(o.properties.group),
          });
          continue;
        }
        if (o.gid !== undefined) {
          const r = objRect(o);
          const local = objLocal(o.gid);
          mechProps.push({
            gid: local,
            rect: r,
            props: (o.properties ?? {}) as Record<string, unknown>,
          });
          if (local === 0) {
            // 按钮板（原版实证：gid0=pusher，按住生效；教学文案「必须要有1个人留下来按住按钮」）
            plates.push({ id: `b${plates.length}`, group: Number(o.properties?.group ?? 0), rect: r });
          } else if (local === 2) {
            // 拉杆（接触翻转，带冷却）；startPos=1 表示开局 ON（组平台初始在下沉端）
            levers.push({
              id: `l${levers.length}`,
              group: Number(o.properties?.group ?? 0),
              rect: r,
              startOn: Number(o.properties?.startPos ?? 0) === 1,
            });
          }
          continue;
        }
        ignored.push(`${layer.name}:gid=${o.gid ?? "-"}:type=${o.type ?? "-"}`);
      }
    } else if (layer.name.startsWith("Tutorial_") && Array.isArray(layer.objects)) {
      // 教学层：收集文本对象，按变体名分组
      const list = tutorialVariants.get(layer.name) ?? [];
      for (const o of layer.objects) {
        if (o.text?.text) {
          list.push({ x: Number(o.x), y: Number(o.y), w: Number(o.width ?? 0), h: Number(o.height ?? 0), text: String(o.text.text) });
        }
      }
      tutorialVariants.set(layer.name, list);
    }
    // 其余层忽略
  }

  // 教学文案变体择一：keyboard（双端键盘）> single > dual > 任意
  const tutorials =
    tutorialVariants.get("Tutorial_keyboard") ??
    tutorialVariants.get("Tutorial_single") ??
    tutorialVariants.get("Tutorial_dual") ??
    (tutorialVariants.values().next().value ?? []);

  if (ignored.length > 0) {
    // 不打印重复项，仅提示存在未实现机关
    console.log(`[level ${id}] 暂未实现的机关对象 ×${ignored.length}（M3 处理）`);
  }

  return {
    id,
    widthPx: cols * tile,
    heightPx: rows * tile,
    tile,
    solid,
    liquid,
    ground: groundGid,
    groundTypes,
    cols,
    rows,
    spawn,
    doors,
    diamonds,
    levers,
    plates,
    platforms,
    mechProps,
    tutorials,
  };
}
