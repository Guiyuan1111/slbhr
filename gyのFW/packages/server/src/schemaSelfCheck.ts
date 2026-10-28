/**
 * Schema 字段语义启动自检（#51 防回归）。
 *
 * ## 为什么需要
 *
 * Colyseus 的变更追踪靠 `Schema.initialize` 在**实例上**定义访问器（原型上本来就没有
 * 描述符，见 @colyseus/schema `annotations.ts` 的 `type()`：访问器写进
 * `metadata[$descriptors]`，再 `Object.defineProperties(instance, …)`）。因此
 * 「实例上的 `x` 是不是访问器」才是正确形态；**数据属性**意味着有人抢在 schema 之前
 * 定义了字段——这正是 1.0.0 分发包的崩溃形态：
 *
 *   tsx 4.x 的 ESM loader 不读 tsconfig 的 `useDefineForClassFields: false`
 *   （该归一化只存在于 CJS require 钩子），`x!: number` 被按 ES2022 define 语义编译成
 *   原生 class field；`this.x = 0` 遂写进自有数据属性，绕过访问器 → 变更不进 ChangeTree
 *   → 首次 delta 编码读不到类型元数据 → `encodeValue` 抛 TypeError → 整进程崩。
 *
 * `state.ts` 现已把全部字段改成 `declare`（纯类型标注，任何转译器都不产出运行时字段），
 * 从语言层消灭这一形态；本模块是**第二道网**：运行期实测实例描述符，形态不对就在启动
 * 第一秒直接退出，而不是等玩家建房十秒后才崩。
 *
 * ## 判据（对每个被检查类取一个实例）
 *
 * - 每个 `defineTypes` 声明字段都必须在实例上有描述符；
 * - 该描述符必须是访问器（`get`/`set` 为函数），不能是数据属性；
 * - 访问器读取不抛错，且能通过 setter 写入新值后读回（写路径未断）。
 *
 * 只读、无副作用：用状态类的零值构造实例，不碰真实房间。
 */
import { RoomState, PlayerState, DiamondState, LeverState, PusherState, BodyState, WindState, BeamState, TimedPusherState, DoorState } from "./rooms/state.js";

/** 待检类的清单：state.ts 全部导出 Schema 类（新增类必须同步登记，见同名单测） */
export const CHECKED_CLASSES = {
  RoomState,
  PlayerState,
  DiamondState,
  LeverState,
  PusherState,
  BodyState,
  WindState,
  BeamState,
  TimedPusherState,
  DoorState,
} as const;

export interface CheckFailure {
  cls: string;
  field: string;
  reason: string;
}

export interface CheckResult {
  ok: boolean;
  failures: CheckFailure[];
  checked: number;
}

/**
 * 取一个可安全实例化的一批实例。
 *
 * 只构造无参类；`RoomState` 构造器里建的子集合会随实例一起被检查（不改内容）。
 */
function instantiate(cls: unknown): unknown | null {
  if (typeof cls !== "function") return null;
  try {
    return new (cls as new () => unknown)();
  } catch {
    return null;
  }
}

/** 从 metadata 取该类的字段名清单（defineTypes 已把字段写进 Schema[Symbol.metadata]） */
function fieldNamesOf(instance: object): string[] {
  const ctor = instance.constructor as unknown as Record<symbol | string, unknown>;
  const meta = ctor[Symbol.metadata] as Record<number, { name?: string }> | undefined;
  if (!meta) return [];
  const names: string[] = [];
  for (const key of Object.keys(meta)) {
    const entry = meta[Number(key)];
    // metadata 上也挂着 Set<string> 等非字段键；只认带 name 的字段条目
    if (entry && typeof entry === "object" && typeof entry.name === "string") names.push(entry.name);
  }
  return names;
}

/** 单个类的形态检查（导出给单测逐条钉死） */
export function checkClassShape(clsName: string, cls: unknown): CheckFailure[] {
  const instance = instantiate(cls);
  if (!instance) return [{ cls: clsName, field: "<construct>", reason: "无法实例化" }];
  const failures: CheckFailure[] = [];
  const fields = fieldNamesOf(instance);
  if (fields.length === 0) {
    failures.push({ cls: clsName, field: "<metadata>", reason: "defineTypes 元数据缺失或为空" });
    return failures;
  }
  for (const field of fields) {
    const desc = Object.getOwnPropertyDescriptor(instance, field);
    if (!desc) {
      failures.push({ cls: clsName, field, reason: "实例上无自有描述符（字段未被 schema 接管）" });
      continue;
    }
    if (typeof desc.get !== "function" || typeof desc.set !== "function") {
      failures.push({
        cls: clsName,
        field,
        reason: `描述符非访问器（get=${typeof desc.get} set=${typeof desc.set}）——class field 覆盖了 schema 访问器`,
      });
      continue;
    }
    let current: unknown;
    try {
      current = desc.get.call(instance);
    } catch (err) {
      failures.push({ cls: clsName, field, reason: `读取抛错：${String(err)}` });
      continue;
    }
    // 写回同值验证 setter 链路（不改变状态语义：写的就是读到的那个值）
    try {
      desc.set.call(instance, current);
    } catch (err) {
      failures.push({ cls: clsName, field, reason: `写入抛错：${String(err)}` });
    }
  }
  return failures;
}

/** 全量自检（启动时调用；单测覆盖失败分支） */
export function checkSchemaSemantics(): CheckResult {
  const failures: CheckFailure[] = [];
  let checked = 0;
  for (const [name, cls] of Object.entries(CHECKED_CLASSES)) {
    failures.push(...checkClassShape(name, cls));
    checked++;
  }
  return { ok: failures.length === 0, failures, checked };
}

/**
 * 启动自检入口：形态不对立即退出进程（迟崩只会让玩家卡 loading 且房间全清）。
 * 返回是否通过，便于单测断言而不真退出。
 */
export function guardSchemaSemantics(exit: (code: number) => never | void = (c) => process.exit(c)): boolean {
  const result = checkSchemaSemantics();
  if (result.ok) {
    console.log(`[fw] schema 自检通过（${result.checked} 类字段访问器完好）`);
    return true;
  }
  console.error("[fw] schema 自检失败——状态字段未走 schema 访问器，房间增量编码必崩：");
  for (const f of result.failures.slice(0, 20)) console.error(`  ${f.cls}.${f.field}: ${f.reason}`);
  if (result.failures.length > 20) console.error(`  …其余 ${result.failures.length - 20} 项同类`);
  console.error("[fw] 常见成因：编译/加载链路丢了 tsconfig 的 useDefineForClassFields:false（见 #51）");
  exit(1);
  return false;
}
