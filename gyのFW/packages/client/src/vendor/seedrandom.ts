/**
 * seedrandom（David Bau ARC4 实现）工厂——官方 init.js @1826037 起提取（见 ./seedrandom.umd.ts）。
 * 用途：decorate() 的 z() 步进序列必须与原版一致（G12 装饰复刻）。
 *
 * 加载方式沿革：原为字符串内联 + new Function 注入 define shim——CSP（0.3.51 #45）
 * 禁 eval 后浏览器侧当场抛 EvalError（Game create 炸、场景永停 CREATING 的 P0 根因，
 * 2026-10-28 r13 移植验证时抓出）。现改为真实源码模块 ./seedrandom.umd.ts，本文件
 * 只剩工厂壳；行为等值由 seedrandom-parity 单测钉死。
 */
import { runSeedrandom } from "./seedrandom.umd.js";

export function createSeedrandomFactory(): (seed: string) => () => number {
  let exported: unknown;
  function define(_name: string, _deps: unknown[], factory: () => unknown) {
    exported = factory();
  }
  (define as unknown as { amd: object }).amd = {};
  runSeedrandom(define);
  return exported as (seed: string) => () => number;
}
