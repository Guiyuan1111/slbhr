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
import { afterEach, beforeEach, describe, expect, it } from "vitest";
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

describe("真实 Colyseus 栈的方法分流（#32/#36 端到端）", () => {
  // 假下游测不了 vendor 真分支——#36 的教训：断言前提必须对真实 vendor 成立。
  // 这里用真实 Server（同 room-password.test 口径）验证 GET 404 / PUT 405 各恰一次响应，
  // 且 guard 交还的请求不触发 ERR_HTTP_HEADERS_SENT（其后真实 matchmake 仍健康）。
  let srv: { url: string; port: number; shutdown: () => Promise<void> } | undefined;
  afterEach(async () => {
    await srv?.shutdown();
    srv = undefined;
  });

  async function startReal(): Promise<{ url: string; port: number; shutdown: () => Promise<void> }> {
    const { Server, WebSocketTransport } = await import("../colyseus.cjs.js");
    const { ForestRoom } = await import("../rooms/ForestRoom.js");
    const httpServer = http.createServer();
    const gameServer = new Server({ transport: new WebSocketTransport({ server: httpServer }) });
    // 顺序约束（guard 头注释）：Server 构造的 attachMatchMakingRoutes 会 removeAllListeners，
    // guard 必须在其之后安装（与生产 index.ts 同序）
    installMatchmakeBodyGuard(httpServer);
    gameServer.define("forest", ForestRoom);
    await gameServer.listen(0, "127.0.0.1");
    const port = (httpServer.address() as AddressInfo).port;
    return {
      url: `ws://127.0.0.1:${port}`,
      port,
      shutdown: async () => {
        await gameServer.gracefullyShutdown(false);
        httpServer.close();
      },
    };
  }

  const raw = (method: string, port: number, path: string) =>
    new Promise<{ status: number; allow?: string }>((resolve, reject) => {
      const req = http.request({ host: "127.0.0.1", port, method, path }, (res) => {
        res.resume();
        res.on("end", () => resolve({ status: res.statusCode ?? 0, allow: res.headers.allow as string | undefined }));
      });
      req.on("error", reject);
      req.end();
    });

  it("GET → vendor 404 恰一次；PUT → guard 405；其后真实 create 仍成功", { timeout: 20_000 }, async () => {
    srv = await startReal();
    const get = await raw("GET", srv.port, "/matchmake/forest");
    expect(get.status).toBe(404);
    const put = await raw("PUT", srv.port, "/matchmake/create/forest");
    expect(put.status).toBe(405);
    expect(put.allow).toBe("OPTIONS, POST, GET");
    const { Client } = await import("colyseus.js");
    const c = new Client(srv.url);
    const room = await c.create("forest", { password: "pw-1234", levelId: "forest_01" });
    expect(room.roomId).toBeTruthy();
    await room.leave();
  });
});

describe("非 POST 方法分流（#32）", () => {
  /** guard 之后再挂一个「假 Colyseus 监听器」：命中即置位。镜像 vendor 真实分支
   *  （core Server.js:206-256）：OPTIONS/POST/GET 有响应（GET 404），PUT/DELETE/HEAD/PATCH
   *  不写响应不 end（socket 永久挂起）——这类请求的 405 必须由 guard 发出。 */
  let hit = false;
  let server: http.Server | undefined;
  const sockets = new Set<Socket>();

  beforeEach(() => {
    hit = false;
  });

  afterEach(async () => {
    for (const s of sockets) s.destroy();
    sockets.clear();
    if (server) {
      await new Promise<void>((resolve) => server!.close(() => resolve()));
      server = undefined;
    }
  });

  async function start(): Promise<number> {
    server = http.createServer(() => {});
    server.on("connection", (s) => {
      sockets.add(s);
      s.on("close", () => sockets.delete(s));
    });
    installMatchmakeBodyGuard(server);
    // 假下游栈：guard 未响应（headersSent=false）时 200 并打标；guard 已 405 的请求到此
    // 自滤（真实场景 Colyseus 对非 OPTIONS/POST 本就无响应分支，重复执行无害）。
    server.addListener("request", (req, res) => {
      if (res.headersSent || res.writableEnded) return;
      // 挂起语义只模拟 /matchmake 范围（非 matchmake 路径的应用路由总有响应）
      const mm = (req.url ?? "").includes("/matchmake");
      if (mm && (req.method === "PUT" || req.method === "DELETE" || req.method === "HEAD" || req.method === "PATCH")) return;
      hit = true;
      res.writeHead(mm && req.method === "GET" ? 404 : 200);
      res.end("{}");
    });
    await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", resolve));
    return (server.address() as AddressInfo).port;
  }

  const fetchRaw = async (method: string, port: number, path = "/matchmake/joinById/x"): Promise<{ status: number; allow?: string; hitAfter: boolean }> => {
    return new Promise((resolve, reject) => {
      const req = http.request({ host: "127.0.0.1", port, method, path }, (res) => {
        res.resume();
        res.on("end", () => resolve({ status: res.statusCode ?? 0, allow: res.headers.allow as string | undefined, hitAfter: hit }));
      });
      req.on("error", reject);
      req.end();
    });
  };

  it("PUT/DELETE/HEAD/PATCH 立即 405（Allow: OPTIONS, POST, GET）且不进 Colyseus 分支", async () => {
    const port = await start();
    for (const method of ["PUT", "DELETE", "HEAD", "PATCH"]) {
      hit = false;
      const r = await fetchRaw(method, port);
      expect(r.status, method).toBe(405);
      expect(r.allow).toBe("OPTIONS, POST, GET");
      expect(r.hitAfter, method).toBe(false);
    }
  });

  it("GET 交还 Colyseus 分支（vendor 404），不再被 guard 405（#36 回归）", async () => {
    const port = await start();
    hit = false;
    const r = await fetchRaw("GET", port, "/matchmake/forest");
    expect(r.status).toBe(404);
    expect(r.hitAfter).toBe(true);
  });

  it("OPTIONS 与 POST 仍照常进入 Colyseus 分支", async () => {
    const port = await start();
    hit = false;
    expect((await fetchRaw("OPTIONS", port)).hitAfter).toBe(true);
    hit = false;
    expect((await fetchRaw("POST", port, "/matchmake/create/forest")).hitAfter).toBe(true);
  });

  it("非 /matchmake 路径的其他方法不受拦截", async () => {
    const port = await start();
    hit = false;
    const r = await fetchRaw("PUT", port, "/healthz");
    expect(r.hitAfter).toBe(true);
    expect(r.status).toBe(200);
  });
});
