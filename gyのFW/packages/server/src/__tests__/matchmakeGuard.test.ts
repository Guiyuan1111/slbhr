/**
 * matchmakeGuard 回归（M5）：真实 http.Server 上的 /matchmake POST 请求体上限。
 *
 * 覆盖：
 * - content-length 明确超限 → 413（Connection: close），后续正常请求不受影响；
 * - 无 content-length（chunked）边收边超限 → 413/连接关闭；
 * - 未超限的小请求仍抵达后续 listener（body 完整、不被 guard 消费）；
 * - 非 /matchmake 路径不拦截。
 */
import http from "node:http";
import type { AddressInfo, Socket } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { installMatchmakeBodyGuard } from "../matchmakeGuard.js";

const LIMIT = 32;
let server: http.Server | undefined;
const sockets = new Set<Socket>();

afterEach(async () => {
  for (const s of sockets) s.destroy();
  sockets.clear();
  if (server) {
    await new Promise<void>((resolve) => server!.close(() => resolve()));
    server = undefined;
  }
});

async function startServer(maxBytes = LIMIT): Promise<number> {
  server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true, bytes: Buffer.concat(chunks).length }));
    });
  });
  server.on("connection", (s) => {
    sockets.add(s);
    s.on("close", () => sockets.delete(s));
  });
  installMatchmakeBodyGuard(server, maxBytes);
  await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", resolve));
  return (server.address() as AddressInfo).port;
}

interface Result {
  status?: number;
  headers?: http.IncomingHttpHeaders;
  body?: string;
  error?: string;
}

function post(
  port: number,
  path: string,
  opts: { body?: string | Buffer; headers?: http.OutgoingHttpHeaders } = {},
): Promise<Result> {
  return new Promise((resolve) => {
    const req = http.request(
      { host: "127.0.0.1", port, path, method: "POST", headers: opts.headers },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () =>
          resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString("utf8") }),
        );
      },
    );
    req.on("error", (e) => resolve({ error: e.message }));
    req.end(opts.body ?? "");
  });
}

describe("installMatchmakeBodyGuard（M5 /matchmake 请求体上限）", () => {
  it("content-length 超限：立即 413 + Connection: close", async () => {
    const port = await startServer();
    const r = await post(port, "/matchmake/joinById/room-1", {
      headers: { "content-length": String(LIMIT + 1) },
    });
    expect(r.status).toBe(413);
    expect(r.headers?.connection).toBe("close");
  });

  it("裸 /matchmake（无尾部斜杠）同样受上限保护", async () => {
    const port = await startServer();
    const r = await post(port, "/matchmake", { headers: { "content-length": String(LIMIT + 1) } });
    expect(r.status).toBe(413);
  });

  it("无 content-length 的 chunked 超限：413 或连接关闭，不崩溃", async () => {
    const port = await startServer();
    const r = await post(port, "/matchmake/joinOrCreate/forest", {
      body: Buffer.alloc(LIMIT + 1, 0x61),
    });
    // 服务端在超限瞬间可能先 RST；两种结果都代表已拦截且进程存活
    expect(r.status === 413 || r.error !== undefined).toBe(true);
    // 服务器仍可服务后续请求
    const ok = await post(port, "/matchmake/joinById/room-1", { body: "{}" });
    expect(ok.status).toBe(200);
  });

  it("未超限的小请求完整抵达后续 listener", async () => {
    const port = await startServer();
    const payload = JSON.stringify({ password: "pw-1234" });
    const r = await post(port, "/matchmake/joinById/room-1", { body: payload });
    expect(r.status).toBe(200);
    expect(JSON.parse(r.body!)).toEqual({ ok: true, bytes: Buffer.byteLength(payload) });
  });

  it("非 /matchmake 路径的大 body 不受影响", async () => {
    const port = await startServer();
    const r = await post(port, "/api/other", { body: Buffer.alloc(LIMIT * 4, 0x62) });
    expect(r.status).toBe(200);
    expect(JSON.parse(r.body!).bytes).toBe(LIMIT * 4);
  });
});
