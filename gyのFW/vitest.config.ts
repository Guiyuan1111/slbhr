import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["packages/**/*.test.ts"],
    // r10 perf 件：threads 池替缺省 forks（-12% 墙钟，纯 JS 内核无原生崩溃面；
    // --no-isolate 实测无增益且弱化隔离，不用）。89/89 全绿背书。
    pool: "threads",
  },
});
