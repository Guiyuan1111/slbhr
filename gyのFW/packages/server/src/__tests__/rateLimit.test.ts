/**
 * 固定窗口限流（#45）：超限 429 + Retry-After，窗口翻新后恢复。
 * 真实 express + node fetch（Node 22 内建），短窗口便于测试。
 */
import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, describe, expect, it } from "vitest";
import express from "express";
import { fixedWindowRateLimit } from "../rateLimit.js";

let server: http.Server | undefined;
let port = 0;

afterAll(async () => {
  if (server) await new Promise<void>((r) => server!.close(() => r()));
});

async function start(max: number, windowMs: number): Promise<void> {
  const app = express();
  app.get("/hit", fixedWindowRateLimit({ windowMs, max }), (_req, res) => res.json({ ok: true }));
  server = http.createServer(app);
  await new Promise<void>((r) => server!.listen(0, "127.0.0.1", r));
  port = (server.address() as AddressInfo).port;
}

describe("fixedWindowRateLimit（#45 /api 限流）", () => {
  it("窗口内 max 次放行，第 max+1 次 429 + Retry-After", async () => {
    await start(3, 60_000);
    for (let i = 0; i < 3; i++) {
      const r = await fetch(`http://127.0.0.1:${port}/hit`);
      expect(r.status).toBe(200);
    }
    const r4 = await fetch(`http://127.0.0.1:${port}/hit`);
    expect(r4.status).toBe(429);
    expect(Number(r4.headers.get("retry-after"))).toBeGreaterThan(0);
    expect(await (await fetch(`http://127.0.0.1:${port}/hit`)).json()).toEqual({ error: "请求过于频繁" });
  });

  it("窗口翻新后恢复放行", async () => {
    await start(1, 60);
    expect((await fetch(`http://127.0.0.1:${port}/hit`)).status).toBe(200);
    expect((await fetch(`http://127.0.0.1:${port}/hit`)).status).toBe(429);
    await new Promise((r) => setTimeout(r, 80));
    expect((await fetch(`http://127.0.0.1:${port}/hit`)).status).toBe(200);
  });
});
