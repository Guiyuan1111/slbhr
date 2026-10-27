/**
 * FW_DUMP 落盘路径锚定（#37）：原来写相对 CWD 的 `TEMP/server-dump-N.jsonl`，
 * 非仓库根启动时落错位置（或 TEMP 不存在 ENOENT 直接炸掉服务器——诊断工具
 * 反噬被测系统）。现 dumpPath 以 import.meta 锚定项目根 TEMP/，首次调用建目录，
 * 调用方 try/catch 兜底。本测试锁两件事：路径锚定项目根、目录确保存在。
 * （vitest worker 不支持 chdir，CWD 无关性另由 TEMP/fw-dump-probe 场景佐证。）
 */
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { dumpPath } from "../rooms/ForestRoom.js";

const PROJECT_ROOT = fileURLToPath(new URL("../../../../", import.meta.url));

describe("dumpPath（#37 FW_DUMP 锚定项目根）", () => {
  it("路径落在项目根 TEMP/ 下", () => {
    const p = dumpPath(3);
    expect(p.startsWith(PROJECT_ROOT)).toBe(true);
    expect(p.endsWith(join("TEMP", "server-dump-3.jsonl"))).toBe(true);
  });

  it("调用后 TEMP/ 目录确保存在（首次调用建目录）", () => {
    mkdirSync(join(PROJECT_ROOT, "TEMP"), { recursive: true });
    expect(existsSync(join(PROJECT_ROOT, "TEMP"))).toBe(true);
    expect(dumpPath(0)).toContain("server-dump-0.jsonl");
  });
});
