/**
 * Box2D 引擎加载器（仅服务端/测试使用！）
 *
 * vendor/box2d.js 是从原版 init.js 按字节原样提取的 Closure bundle（见 scripts/vendor-box2d.mjs），
 * 其中除裸 Box2D 类外还编入了 Phaser.Physics.Box2D 插件段（引用全局 Phaser），
 * 因此必须在带浏览器痕迹 stub 的 vm 沙箱里求值；导出为扁平命名空间 sandbox.box2d，
 * 与原版 requirejs 适配器 `define("box2d", …) → this.box2d` 的语义一致。
 *
 * ⚠ 不在 src/index.ts 桶导出里引用本文件——node:fs/node:vm 会打断 Vite 客户端构建。
 *   服务端与测试用 `@fw/shared/box2d` 子路径导入。
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

/** 引擎命名空间（类型在机关封装层逐步收窄，此处保持宽松） */
export type Box2DNamespace = Record<string, any>;

const VENDOR = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "vendor", "box2d.js");

let cached: Box2DNamespace | undefined;

export function loadBox2d(): Box2DNamespace {
  if (cached) return cached;
  const src = readFileSync(VENDOR, "latin1");
  const sandbox: any = {
    navigator: {
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
      appName: "Netscape",
      platform: "Win32",
    },
    document: {},
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    console,
    Math,
    JSON,
    // bundle 里的 Phaser.Physics.Box2D 插件段只读全局 Phaser（挂类引用），最小占位即可
    Phaser: { Physics: {} },
    // 若 bundle 里出现 requirejs 调用则收集（实测为 0 次，保留防御）
    define: () => {},
  };
  sandbox.window = sandbox;
  sandbox.self = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  // 切片落在逗号表达式链中段，末尾多一个衔接逗号——去掉后独立成句；
  // 沙箱顶层 this 即 sandbox，与浏览器脚本顶层 this=window 同构（引擎正是把类挂上 this.box2d）
  vm.runInContext(src.replace(/[\s,]+$/, "") + "\n;", sandbox, { filename: "box2d-vendor" });
  if (!sandbox.box2d) throw new Error("box2d bundle 求值完成但未见 this.box2d 导出");
  cached = sandbox.box2d as Box2DNamespace;
  return cached;
}
