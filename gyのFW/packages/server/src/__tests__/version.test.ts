/**
 * 版本一致性门禁（M7）：根/三子包/package-lock 的 version 与根 engines 不得漂移。
 * 发版时同步修改四处 version；本测试只断言“彼此一致”与 engines 门限，不锁死具体版本号。
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const readJson = (rel: string): any => JSON.parse(readFileSync(join(ROOT, rel), "utf8"));

describe("版本/engines/lock 一致性（M7）", () => {
  const root = readJson("package.json");
  const client = readJson("packages/client/package.json");
  const server = readJson("packages/server/package.json");
  const shared = readJson("packages/shared/package.json");
  const lock = readJson("package-lock.json");

  it("根与三子包 version 一致", () => {
    expect(root.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(client.version).toBe(root.version);
    expect(server.version).toBe(root.version);
    expect(shared.version).toBe(root.version);
  });

  it("lock 根 version/engines 与根 package.json 一致", () => {
    expect(lock.version).toBe(root.version);
    expect(lock.packages[""].version).toBe(root.version);
    expect(lock.packages[""].engines).toEqual(root.engines);
  });

  it("lock 三个 workspace 条目 version 与各自 package.json 一致", () => {
    expect(lock.packages["packages/client"].version).toBe(client.version);
    expect(lock.packages["packages/server"].version).toBe(server.version);
    expect(lock.packages["packages/shared"].version).toBe(shared.version);
  });

  it("根 engines.node 覆盖 vitest 5 要求（>=22.12.0）", () => {
    expect(root.engines.node).toBe(">=22.12.0");
  });

  it("README 当前版本行与根 package.json 一致（#38：bump --verify 的常驻等价门禁）", () => {
    const readme = readFileSync(join(ROOT, "README.md"), "utf8");
    const m = readme.match(/^> \*\*当前版本\*\*：(\d+\.\d+\.\d+)/m);
    expect(m, "README 缺「当前版本」行").toBeTruthy();
    expect(m![1]).toBe(root.version);
  });

  it("README 当前版本行带非空描述（2026-10-27 审计 P2-03：杜绝版本号挂上一版描述）", () => {
    const readme = readFileSync(join(ROOT, "README.md"), "utf8");
    const m = readme.match(/^> \*\*当前版本\*\*：\d+\.\d+\.\d+（([^）]+)/m);
    expect(m, "当前版本行缺（描述）——bump 须带 --desc 入链").toBeTruthy();
    expect(m![1].trim().length, "当前版本行描述为空").toBeGreaterThan(0);
    expect(m![1]).not.toContain("待补");
  });
});
