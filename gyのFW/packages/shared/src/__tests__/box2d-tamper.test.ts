/**
 * vendor 完整性闸门（#44）：box2d.js 被替换/损坏时 loadBox2d 必须 fail-fast，
 * 错误信息指向三处一致性锚（load.ts / vendor/README.md / scripts/vendor-box2d.mjs）。
 * 本文件以 vi.mock 把 vendor 读取劫持为篡改字节——真实加载回归在 box2d.test.ts。
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  const realRead = actual.readFileSync;
  return {
    ...actual,
    readFileSync: ((p: Parameters<typeof realRead>[0], ...rest: unknown[]) =>
      String(p).endsWith(`vendor${"box2d.js"}`.replace("box2d", "/box2d"))
        ? Buffer.from("// tampered by test")
        : (realRead as (...a: unknown[]) => unknown)(p, ...rest)) as typeof realRead,
  };
});

import { loadBox2d } from "../box2d/load.js";

describe("vendor box2d 完整性闸门（#44）", () => {
  it("内容被篡改 → fail-fast 并指明同步锚", () => {
    let err: Error | undefined;
    try {
      loadBox2d();
    } catch (e) {
      err = e as Error;
    }
    expect(err).toBeTruthy();
    expect(err!.message).toContain("完整性校验失败");
    expect(err!.message).toContain("scripts/vendor-box2d.mjs");
  });
});
