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
    // 首次基线 2026-10-27 实测 lines 82/branches 69/funcs 78/stmts 81；
    // 阈值已随 autoUpdate ratchet 至 86.17/85.22/83.39/75.81（当前零余量口径，#46 注释同步）。
    coverage: {
      provider: "v8",
      include: ["packages/shared/src/**", "packages/server/src/**"],
      // autoUpdate：本地跑 test:coverage 时抬升 ratchet；CI 环境必须只读——
      // 门禁不得在流水线里回写受控配置（#39）。
      thresholds: { autoUpdate: process.env.CI !== "true", lines: 86.17, statements: 85.22, functions: 83.39, branches: 75.81 },
    },
  },
});
