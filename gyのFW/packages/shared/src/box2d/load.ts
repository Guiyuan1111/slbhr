/**
 * Box2D 引擎加载器（仅服务端/测试使用！）
 *
 * vendor/box2d.js 是从原版 init.js 按字节原样提取的 Closure bundle（见 scripts/vendor-box2d.mjs），
 * 其中除裸 Box2D 类外还编入了 Phaser.Physics.Box2D 插件段（引用全局 Phaser）。
 *
 * ## 求值方式（0.3.21 性能重写，此前为 node:vm 沙箱）
 *
 * 用 `new Function(参数遮蔽 stub…) + .call(globalThis)` 在**主上下文**求值：
 * - Closure bundle 靠隐式全局赋值挂命名空间（`box2d.xxx`、goog.exportPath_ 写
 *   `goog.global`），顶层 this 必须是真实全局对象，命名空间才能落位；
 * - 浏览器痕迹 stub（navigator/document/Phaser/define）以**函数参数**遮蔽提供，
 *   与旧沙箱的属性注入语义一致，不污染全局；
 * - ⚠ 为什么放弃 vm 沙箱：vm context 的全局代理属性访问走慢路径，同一引擎负载
 *   实测慢 ~7 倍（benchmark/perf-step：bonus_2 单步 28.8ms → 4.5ms，详见
 *   note/report/perf/2026-10-08-perf-optimization.md）。node:vm 本就不是安全边界
 *   （官方文档明示），被求值的始终是本仓库内字节级受控的 vendor 文件，安全姿态不变；
 * - 副作用：`box2d`/`goog`/`COMPILED` 等命名空间落在服务端进程 globalThis 上
 *   （与 Node/express/colyseus 无命名冲突，已核对）。
 *
 * 物理输出位级不变的验证：benchmark/perf-determinism.mjs（48 关 × 双输入模式 ×
 * 每步全刚体 float64 位哈希链，优化前后必须逐关一致）+ 83 项单测 + fidelity-score。
 *
 * ⚠ 不在 src/index.ts 桶导出里引用本文件——new Function 求值会打断 Vite 客户端构建。
 *   服务端与测试用 `@fw/shared/box2d` 子路径导入。
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/** 引擎命名空间（类型在机关封装层逐步收窄，此处保持宽松） */
export type Box2DNamespace = Record<string, any>;

const VENDOR = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "vendor", "box2d.js");

let cached: Box2DNamespace | undefined;

/**
 * 接触池懒填（r2 perf 件1，2026-10-18）：vendor 的 b2ContactFactory.AddType 在每个工厂
 * （= 每个 b2World）构造时 `b2MakeArray(256, …)` 预填 7 类接触各 256 个——1792 次构造器
 * + goog.base 父类分派（`arguments.callee.caller` 慢路径），占世界构建 CPU ~64%
 * （r2 剖析：note/report/perf/2026-10-18-r2-optimization.md §一）；而关卡全期真实接触
 * 创建远低于此量，createFcn 本就有池耗尽回退（`e.length > 0 ? e.pop() : a(alloc)`）。
 *
 * 求值后覆写 AddType（vendor 字节不动），与 vendor 实现逐语句同构——唯一差异是预填
 * 256→0：接触对象改为首次需要时现场构造（走同一条回退路径），destroy→push 回池复用
 * 语义不变；register.pool 字段全仓库只在 AddType 内写入、无其它读者。覆写发生在
 * loadBox2d 返回前——早于任何 b2World/工厂构造，装载顺序安全。
 *
 * 数值零依赖论证（对象构造时机后移、状态同值）：
 * - createFcn 两条来源（预填 pop / 回退构造）产出的对象都经同一入口 Reset(fixtureA,
 *   indexA, fixtureB, indexB) 进入使用：m_flags = e_enabledFlag（清 toi/filter 位）、
 *   m_manifold.pointCount = 0、m_nodeA/B 全清、friction/restitution 由 fixture 重混；
 * - 首次 Update 的换位（old↔current）把 Reset 后的 pointCount=0 流形挪入 old 槽 →
 *   warm-start 循环读 oldManifold.pointCount=0，与构造器新对象完全同值——回用对象
 *   携带的旧流形在被读之前必已被换位+Evaluate 覆写；
 * - m_toi 仅在 e_toiFlag 置位（伴随重写，@7836）后才被读（@7810），Reset 清位；
 * - SetTangentSpeed 全仓库无调用方，m_tangentSpeed 恒原型值 0；
 * - 池回用（destroy→pop）本就是 vendor 运行期既有路径（钻石体销毁→接触销毁→回池），
 *   r0/r1 det 基线即含此行为。位级中性由 det 48/48 + fixtures 6/6 实测背书。
 */
function lazyContactPoolPrefill(ns: Box2DNamespace): void {
  ns.b2ContactFactory.prototype.AddType = function (
    this: {
      m_registers: Array<Array<{ pool: unknown; createFcn: (a: unknown) => any; destroyFcn: (a: any, b: unknown) => void; primary: boolean }>>;
    },
    create: (a: unknown) => any,
    _destroy: (a: any, b: unknown) => void,
    type1: number,
    type2: number,
  ): void {
    const pool: any[] = []; // 与 vendor 唯一差异：不预填 256
    const createFcn = (alloc: unknown) => (pool.length > 0 ? pool.pop() : create(alloc));
    const destroyFcn = (contact: any, _alloc: unknown) => {
      pool.push(contact);
    };
    const forward = this.m_registers[type1][type2];
    forward.pool = pool;
    forward.createFcn = createFcn;
    forward.destroyFcn = destroyFcn;
    forward.primary = true;
    if (type1 !== type2) {
      const reverse = this.m_registers[type2][type1];
      reverse.pool = pool;
      reverse.createFcn = createFcn;
      reverse.destroyFcn = destroyFcn;
      reverse.primary = false;
    }
  };
}

export function loadBox2d(): Box2DNamespace {
  if (cached) return cached;
  const src = readFileSync(VENDOR, "latin1");
  // 切片落在逗号表达式链中段，末尾多一个衔接逗号——去掉后独立成句
  const body = src.replace(/[\s,]+$/, "") + "\n;return this.box2d;";
  // 参数名与 bundle 引用的裸全局一一对应（window/self 指向真实全局，同旧沙箱 window=self=globalThis 语义）
  const evaluate = new Function(
    "navigator",
    "document",
    "setTimeout",
    "clearTimeout",
    "setInterval",
    "clearInterval",
    "console",
    "Math",
    "JSON",
    "Phaser",
    "define",
    "window",
    "self",
    body,
  );
  const ns = evaluate.call(
    globalThis,
    {
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
      appName: "Netscape",
      platform: "Win32",
    },
    {},
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    console,
    Math,
    JSON,
    // bundle 里的 Phaser.Physics.Box2D 插件段只读全局 Phaser（挂类引用），最小占位即可
    { Physics: {} },
    // 若 bundle 里出现 requirejs 调用则收集（实测为 0 次，保留防御）
    () => {},
    globalThis,
    globalThis,
  );
  if (!ns) throw new Error("box2d bundle 求值完成但未见 this.box2d 导出");
  lazyContactPoolPrefill(ns);
  cached = ns as Box2DNamespace;
  return cached;
}
