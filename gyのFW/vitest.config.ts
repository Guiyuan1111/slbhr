import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["packages/**/*.test.ts"],
    // r10 perf 件：threads 池替缺省 forks（-12% 墙钟，纯 JS 内核无原生崩溃面；
    // --no-isolate 实测无增益且弱化隔离，不用）。89/89 全绿背书。
    pool: "threads",
    // 覆盖率阈值门禁（对比报告 #2 / plans/2026-10-27-next-improvements.md A2）：
    // 只覆盖逻辑层（shared/server），client 为渲染重载层不设阈；
    // 基线 2026-10-27 实测 lines 82/branches 69/funcs 78/stmts 81，
    // 阈值=基线-3(行/语句)、-5(函数/分支) 起步，autoUpdate 抬升 ratchet。
    coverage: {
      provider: "v8",
      include: ["packages/shared/src/**", "packages/server/src/**"],
      thresholds: { autoUpdate: true, lines: 85.76, statements: 84.79, functions: 83.05, branches: 74.05 },
    },
  },
});
