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
    // 2026-10-30 恢复抬升（fw-cov 批）：实测 lines 91.53 / stmts 90.78 / funcs 90.33 / branches 82.23
    // （全量 63 文件 472 测试背书）。补测面=cov-* 四件：机关单测、灯光关世界链、液体冻结/融化全链路（合成 Tiled）、
    // level2 解析分支（Tiled1.x 归一化/灯光机关族/portal/终检）+ 服务端关卡加载。其余未达面（ForestRoom/character/
    // schemaSelfCheck 等）归 net/respawn 等后续批次，本批不动其测试。
    coverage: {
      provider: "v8",
      include: ["packages/shared/src/**", "packages/server/src/**"],
      // autoUpdate：本地跑 test:coverage 时抬升 ratchet；CI 环境必须只读——
      // 门禁不得在流水线里回写受控配置（#39）。
      thresholds: { autoUpdate: process.env.CI !== "true", lines: 91.53, statements: 90.78, functions: 90.33, branches: 82.23 },
    },
  },
});
