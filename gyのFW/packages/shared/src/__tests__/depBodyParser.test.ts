/**
 * #24 回归：生产依赖链中的 body-parser 必须不低于 1.20.9
 * （GHSA-27r3-jxmh-p828 压缩请求体尾部字节 DoS 的修复版本）。
 *
 * body-parser 是 express 的传递依赖（express ~1.20.5 范围内可直接更新）；
 * 服务端暂未挂载 body 解析中间件，但一旦挂载漏洞即进入可达路径——lock 版本
 * 必须钉在修复版之上，回退即红。
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { fileURLToPath } from "node:url";

const lock = JSON.parse(readFileSync(fileURLToPath(new URL("../../../../package-lock.json", import.meta.url)), "utf8")) as {
  packages: Record<string, { version?: string }>;
};

describe("#24 body-parser 依赖版本", () => {
  it("lock 中 body-parser >= 1.20.9", () => {
    const entry = lock.packages["node_modules/body-parser"];
    expect(entry, "package-lock.json 缺少 node_modules/body-parser 条目").toBeTruthy();
    const [major, minor, patch] = entry!.version!.split(".").map(Number);
    const actual = major * 10000 + minor * 100 + patch;
    expect(actual, `body-parser ${entry!.version} 低于修复版 1.20.9`).toBeGreaterThanOrEqual(10209);
  });
});
