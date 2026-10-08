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
  cached = ns as Box2DNamespace;
  return cached;
}
