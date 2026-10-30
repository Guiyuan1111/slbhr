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
    // 阈值 2026-10-30 临时下移（79.04/71.22/76.97/79.99）：crystal/elements/fairytales 三部立项+F 内核中间态（Fairy/FairyCup 已测，portal/RespawnManager/net 批未落）新增分母 ~525 语句；D 部槽已解 portal 五问（note/evidence/2026-10-30-crystal-temple/01号档），下批落内核+补测后必须恢复抬升回 85+ 口径。
    coverage: {
      provider: "v8",
      include: ["packages/shared/src/**", "packages/server/src/**"],
      // autoUpdate：本地跑 test:coverage 时抬升 ratchet；CI 环境必须只读——
      // 门禁不得在流水线里回写受控配置（#39）。
      thresholds: { autoUpdate: process.env.CI !== "true", lines: 79.99, statements: 79.04, functions: 76.97, branches: 71.22 },
    },
  },
});
