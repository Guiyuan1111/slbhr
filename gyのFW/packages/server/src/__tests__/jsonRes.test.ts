/**
 * jsonRes 回归（r15 件C）：API JSON 的协商压缩与校验式复用。
 *
 * 钉住四件事：①压缩只在客户端声明支持且正文 ≥1KB 时发生，且解压后与 res.json 语义逐字节
 * 等价（含 key 顺序——同一 JSON.stringify 产物）；②ETag 内容寻址（同 payload 稳定、
 * 改一个字节即变）；③If-None-Match 命中即 304 且无正文；④不给新鲜期
 * （no-cache + Vary: Accept-Encoding），避免"新版逻辑 + 旧版关卡数据"错位。
 */
import http from "node:http";
import zlib from "node:zlib";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import express from "express";
import { sendJson } from "../jsonRes.js";

let server: http.Server;
let port = 0;
const PAD = "x".repeat(4096);

beforeAll(async () => {
  const app = express();
  app.get("/big", (req, res) => sendJson(req, res, { id: "forest_01", pad: PAD }));
  app.get("/small", (req, res) => sendJson(req, res, { ids: ["a"] }));
  app.get("/mutate", (req, res) => sendJson(req, res, { v: String(req.query.v ?? "1") + PAD }));
  server = http.createServer(app);
  await new Promise<void>((res) => server.listen(0, "127.0.0.1", res));
  port = (server.address() as AddressInfo).port;
});

afterAll(() => server.close());

function get(path: string, acceptEncoding?: string, ifNoneMatch?: string) {
  return new Promise<{ status: number; headers: http.IncomingHttpHeaders; body: Buffer }>((res, rej) => {
    const headers: Record<string, string> = {};
    if (acceptEncoding !== undefined) headers["accept-encoding"] = acceptEncoding;
    if (ifNoneMatch !== undefined) headers["if-none-match"] = ifNoneMatch;
    const req = http.request({ host: "127.0.0.1", port, path, headers }, (r) => {
      const chunks: Buffer[] = [];
      r.on("data", (c) => chunks.push(c as Buffer));
      r.on("end", () => res({ status: r.statusCode!, headers: r.headers, body: Buffer.concat(chunks) }));
    });
    req.on("error", rej);
    req.end();
  });
}

const ORIGINAL = JSON.stringify({ id: "forest_01", pad: PAD });

describe("sendJson（r15 件C）", () => {
  it("声明 br → brotli 正文，解压后与 res.json 语义逐字节一致", async () => {
    const r = await get("/big", "br, gzip");
    expect(r.status).toBe(200);
    expect(r.headers["content-encoding"]).toBe("br");
    expect(zlib.brotliDecompressSync(r.body).toString("utf8")).toBe(ORIGINAL);
    expect(Number(r.headers["content-length"])).toBe(r.body.length);
    expect(r.body.length).toBeLessThan(Buffer.byteLength(ORIGINAL));
  });

  it("只声明 gzip → gzip 正文；未声明/identity → 原样且无 Content-Encoding", async () => {
    const gz = await get("/big", "gzip");
    expect(gz.headers["content-encoding"]).toBe("gzip");
    expect(zlib.gunzipSync(gz.body).toString("utf8")).toBe(ORIGINAL);
    const identity = await get("/big", "identity");
    expect(identity.headers["content-encoding"]).toBeUndefined();
    expect(identity.body.toString("utf8")).toBe(ORIGINAL);
    const noHeader = await get("/big", undefined);
    expect(noHeader.headers["content-encoding"]).toBeUndefined();
    expect(noHeader.body.toString("utf8")).toBe(ORIGINAL);
  });

  it("<1KB 正文不压缩（协商成本高于收益）", async () => {
    const r = await get("/small", "br, gzip");
    expect(r.headers["content-encoding"]).toBeUndefined();
    expect(r.body.toString("utf8")).toBe(JSON.stringify({ ids: ["a"] }));
  });

  it("ETag 内容寻址：同 payload 稳定，payload 变即变", async () => {
    const a = await get("/big", "br");
    const b = await get("/big", "gzip");
    expect(a.headers.etag).toBe(b.headers.etag); // 标签随内容，不随编码
    const m1 = await get("/mutate?v=1", "gzip");
    const m2 = await get("/mutate?v=2", "gzip");
    expect(m1.headers.etag).not.toBe(m2.headers.etag);
  });

  it("If-None-Match 命中 → 304 无正文，且仍带缓存/协商头", async () => {
    const first = await get("/big", "br");
    const again = await get("/big", "br", String(first.headers.etag));
    expect(again.status).toBe(304);
    expect(again.body.length).toBe(0);
    expect(again.headers.etag).toBe(first.headers.etag);
    expect(again.headers["cache-control"]).toBe("no-cache");
    expect(again.headers.vary).toBe("Accept-Encoding");
  });

  it("不给新鲜期：no-cache + Vary（关卡数据可原地更新，不可 max-age）", async () => {
    const r = await get("/big", "br");
    expect(r.headers["cache-control"]).toBe("no-cache");
    expect(r.headers.vary).toBe("Accept-Encoding");
    expect(r.headers["content-type"]).toBe("application/json; charset=utf-8");
  });
});
