/**
 * 服务器入口端到端冒烟（#45/#46）：子进程真起 index.ts（单端口 http+ws 全家），
 * 打 /healthz、/api/levels、/api/level/:id、音频流路由——锁入口契约并覆盖入口
 * 处理器（此前 index.ts 全文件 0% 计入分母，拉低 functions 阈值）。
 */
import { spawn } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
const PORT = 3766;

let child: ReturnType<typeof spawn> | undefined;
afterAll(async () => {
  child?.kill();
});

function startServer(): Promise<void> {
  child = spawn(process.execPath, ["--import", "tsx", join(ROOT, "packages/server/src/index.ts")], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT), FW_HOST: "127.0.0.1" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stderr?.on("data", (d) => process.stderr.write(`[srv-err] ${d}`));
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("server 启动超时")), 30_000);
    const ondata = (b: Buffer): void => {
      if (String(b).includes("http+ws")) {
        clearTimeout(timer);
        resolve();
      }
    };
    child!.stdout?.on("data", ondata);
    child!.stderr?.on("data", ondata);
  });
}

describe("server 入口端到端（/healthz /api 音频流）", () => {
  it("健康探针/关卡 API/音频路由契约", { timeout: 40_000 }, async () => {
    await startServer();
    const base = `http://127.0.0.1:${PORT}`;

    const health = await fetch(`${base}/healthz`);
    expect(health.status).toBe(200);
    const healthBody = (await health.json()) as { ok: boolean; uptime: number };
    expect(healthBody.ok).toBe(true);
    expect(healthBody.uptime).toBeGreaterThanOrEqual(0);
    expect(health.headers.get("x-content-type-options")).toBe("nosniff");

    const levels = await fetch(`${base}/api/levels`);
    expect(levels.status).toBe(200);
    const ids = ((await levels.json()) as { ids: string[] }).ids;
    expect(ids).toContain("forest_01");

    const level = await fetch(`${base}/api/level/forest_01`);
    expect(level.status).toBe(200);
    expect(((await level.json()) as { id: string }).id).toBe("forest_01");

    const missing = await fetch(`${base}/api/level/does_not_exist`);
    expect(missing.status).toBe(404);

    // 音频流路由：非法名 400（路径穿越/扩展名校验）
    const badAudio = await fetch(`${base}/assets/audio/s/..%2F..%2Fpackage.json`);
    expect(badAudio.status).toBe(400);
  });
});
