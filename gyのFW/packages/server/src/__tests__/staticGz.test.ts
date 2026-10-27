/**
 * staticGz 根前缀校验回归（M-02）：
 * 修复前 `join(root, urlPath)` 不消解 `..`，`/..%2f` 可穿越到仓库其它目录读取
 * 满足扩展名/大小条件的 JSON/HTML。修复后 resolve 归一化 + 根前缀白名单，
 * 越界请求一律走 fallback（404）。
 *
 * 用原生 http.request 发原始路径（不归一化 `%2f`），等价 `curl --path-as-is`。
 */
import http from "node:http";
import zlib from "node:zlib";
import os from "node:os";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdtempSync, mkdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import express from "express";
import { cachePolicy, entityTag, staticGz } from "../staticGz.js";

let server: http.Server;
let port = 0;
let root = "";
let secretName = "";
let secretPath = "";
const DATA_JSON = JSON.stringify({ pad: "x".repeat(2048) });
// #33：secret 必须 >1KB 过 staticGz 体积门槛——否则删除前缀校验后仍因 size<1024
// 走 fallback 表现为 404，测试假绿（验证的是 express 兜底而非本项目校验）
const SECRET_JSON = JSON.stringify({ secret: "top", padding: "x".repeat(4096) });

beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), "fw-staticgz-root-"));
  mkdirSync(join(root, "dist"));
  writeFileSync(join(root, "dist", "data.json"), DATA_JSON);
  writeFileSync(join(root, "dist", "tiny.json"), "x"); // <1KB 走 fallback
  // 穿越目标：根目录的兄弟文件（模拟仓库内 package.json 等越界文件）
  secretName = `fw-staticgz-secret-${Date.now()}.json`;
  secretPath = join(root, "..", secretName);
  writeFileSync(secretPath, SECRET_JSON);

  const app = express();
  app.use(staticGz(root)); // 根挂载（同 packages/client/dist）
  app.use("/assets", staticGz(join(root, "dist"))); // 前缀挂载（同 /assets /data）
  server = http.createServer(app);
  await new Promise<void>((res) => server.listen(0, "127.0.0.1", res));
  port = (server.address() as AddressInfo).port;
});

afterAll(() => {
  server.close();
  rmSync(root, { recursive: true, force: true });
  rmSync(secretPath, { force: true });
});

function rawGet(path: string, acceptEncoding = "gzip", method = "GET"): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: Buffer }> {
  return new Promise((res, rej) => {
    const req = http.request(
      { host: "127.0.0.1", port, path, method, headers: { "accept-encoding": acceptEncoding } },
      (r) => {
        const chunks: Buffer[] = [];
        r.on("data", (c) => chunks.push(c as Buffer));
        r.on("end", () => res({ status: r.statusCode!, headers: r.headers, body: Buffer.concat(chunks) }));
      },
    );
    req.on("error", rej);
    req.end();
  });
}

describe("方法闸门（#45）", () => {
  it("POST/PUT 到静态路径不再 200 回压缩文件，交 fallback（404）", async () => {
    for (const method of ["POST", "PUT", "DELETE"]) {
      const r = await rawGet("/dist/data.json", "gzip", method);
      expect(r.status, method).toBe(404);
      expect(r.headers["content-encoding"], method).toBeUndefined();
    }
    // GET 基线不受影响
    expect((await rawGet("/dist/data.json")).status).toBe(200);
  });
});

describe("cachePolicy（M8 Vite 哈希产物）", () => {
  it.each([
    ["/assets/index-CnbrvQg2.js", "大小写混合哈希（实际 Vite 产物）"],
    ["/assets/vendor-B1Q2w3e4.js", "非十六进制字符"],
    ["/assets/app-abcdef12.css", "8 位纯十六进制 CSS"],
    ["/assets/chunk-_aB3dE9z.mjs", "含下划线/下划线开头的 mjs"],
  ])("%s → immutable（%s）", (path) => {
    expect(cachePolicy(path)).toBe("public, max-age=31536000, immutable");
  });

  it("index.html → no-cache（必须回源拿新哈希引用）", () => {
    expect(cachePolicy("/index.html")).toBe("no-cache");
  });

  it("logo.png → public 1 天（原地可能更新，不可 immutable）", () => {
    expect(cachePolicy("/assets/logo.png")).toBe("public, max-age=86400");
  });

  it("短横线后缀不足 8 位不误判 immutable", () => {
    expect(cachePolicy("/assets/app-abc123.js")).toBe("public, max-age=86400");
  });
});

describe("staticGz 根前缀校验（M-02）", () => {
  it("根内文件正常 gzip 响应（不误伤）", async () => {
    const r = await rawGet("/dist/data.json");
    expect(r.status).toBe(200);
    expect(r.headers["content-encoding"]).toBe("gzip");
    expect(zlib.gunzipSync(r.body).toString("utf8")).toBe(DATA_JSON);
  });

  it("不压缩客户端走 fallback 正常拿到原文件", async () => {
    const r = await rawGet("/dist/data.json", "identity");
    expect(r.status).toBe(200);
    expect(r.headers["content-encoding"]).toBeUndefined();
    expect(r.body.toString("utf8")).toBe(DATA_JSON);
  });

  it("<1KB 文件走 fallback 原样响应", async () => {
    const r = await rawGet("/dist/tiny.json");
    expect(r.status).toBe(200);
    expect(r.body.toString("utf8")).toBe("x");
  });

  it("前缀挂载下根内文件正常（不误伤）", async () => {
    const r = await rawGet("/assets/data.json");
    expect(r.status).toBe(200);
    expect(r.headers["content-encoding"]).toBe("gzip");
  });

  // #33：变体必须在用例运行时构造——it.each 的表在 describe 注册时求值，彼时
  // beforeAll 尚未给 secretName 赋值（实为空串），六条请求发的一直是 "/..%2f"，
  // 无论前缀校验在与否都 404，M-02 回归从写下起就是假绿。
  it("越界请求被拒（6 编码变体，运行时构造含真实 secret 名）", async () => {
    const variants: Array<[string, string]> = [
      ["/..%2f" + secretName, "单层 .. 穿越到根外"],
      ["/..%2f..%2f" + secretName, "双层 .. 穿越到根外"],
      ["/dist%2f..%2f..%2f" + secretName, "先入子目录再 .. 回穿"],
      ["/dist/%2e%2e/%2e%2e/" + secretName, "点号编码 .. 回穿"],
      ["/assets/..%2f..%2f" + secretName, "前缀挂载下穿越"],
      ["/..%5c..%5c" + secretName, "反斜杠编码变体"],
    ];
    for (const [path, desc] of variants) {
      const r = await rawGet(path);
      expect(r.status, `${desc}（${path}）`).toBe(404);
      // 若前缀校验被删，越界 secret（>1KB 过体积门槛）会被 staticGz 真实读取
      // 并以 200+gzip 返回——以下断言立即变红（已实证）
      expect(r.headers["content-encoding"], desc).toBeUndefined();
      expect(r.body.toString("utf8"), desc).not.toContain("top");
    }
  });

  it("根内点段路径（/../ 不出根）不受影响", async () => {
    const r = await rawGet("/dist/../dist/data.json");
    expect(r.status).toBe(200);
    expect(r.headers["content-encoding"]).toBe("gzip");
  });
});


/** r15 移植（2026-10-27）：条件校验用——任意请求头组合（If-None-Match/If-Modified-Since） */
function condGet(path: string, headers: Record<string, string>): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: Buffer }> {
  return new Promise((res, rej) => {
    const req = http.request({ host: "127.0.0.1", port, path, headers }, (r) => {
      const chunks: Buffer[] = [];
      r.on("data", (c) => chunks.push(c as Buffer));
      r.on("end", () => res({ status: r.statusCode!, headers: r.headers, body: Buffer.concat(chunks) }));
    });
    req.on("error", rej);
    req.end();
  });
}

describe("条件校验（r15 移植：压缩路径 ETag/304）", () => {
  it("br 响应带强 ETag；If-None-Match 回放 → 304 无正文且不带 Content-Encoding/Length", async () => {
    const first = await condGet("/dist/data.json", { "accept-encoding": "br, gzip" });
    expect(first.status).toBe(200);
    expect(first.headers["content-encoding"]).toBe("br");
    expect(first.headers.etag).toMatch(/^"br-/);
    const again = await condGet("/dist/data.json", { "accept-encoding": "br, gzip", "if-none-match": String(first.headers.etag) });
    expect(again.status).toBe(304);
    expect(again.body.length).toBe(0);
    expect(again.headers["content-encoding"]).toBeUndefined();
    expect(again.headers["content-length"]).toBeUndefined();
    expect(again.headers.etag).toBe(first.headers.etag);
    expect(again.headers.vary).toBe("Accept-Encoding");
  });

  it("同一文件的 br 与 gzip 是两种表示，实体标签不可互认", async () => {
    const br = await condGet("/dist/data.json", { "accept-encoding": "br" });
    const asGzip = await condGet("/dist/data.json", { "accept-encoding": "gzip", "if-none-match": String(br.headers.etag) });
    expect(asGzip.status).toBe(200);
    expect(asGzip.headers["content-encoding"]).toBe("gzip");
    expect(asGzip.headers.etag).toMatch(/^"gzip-/);
    expect(asGzip.headers.etag).not.toBe(br.headers.etag);
  });

  it("弱比较：W/ 前缀与多标签列表也算命中", async () => {
    const first = await condGet("/dist/data.json", { "accept-encoding": "gzip" });
    const etag = String(first.headers.etag);
    const weak = await condGet("/dist/data.json", { "accept-encoding": "gzip", "if-none-match": `W/${etag}` });
    expect(weak.status).toBe(304);
    const list = await condGet("/dist/data.json", { "accept-encoding": "gzip", "if-none-match": `"other-tag", ${etag}` });
    expect(list.status).toBe(304);
    const star = await condGet("/dist/data.json", { "accept-encoding": "gzip", "if-none-match": "*" });
    expect(star.status).toBe(304);
  });

  it("If-Modified-Since 兜底（无 If-None-Match 时）：未来时间 304、过去时间 200", async () => {
    const future = await condGet("/dist/data.json", { "accept-encoding": "gzip", "if-modified-since": new Date(Date.now() + 60_000).toUTCString() });
    expect(future.status).toBe(304);
    const past = await condGet("/dist/data.json", { "accept-encoding": "gzip", "if-modified-since": new Date(Date.now() - 3_600_000).toUTCString() });
    expect(past.status).toBe(200);
  });

  it("原地换内容 → 标签失配（不能把 304 当成永久免下载）", async () => {
    const before = await condGet("/dist/data.json", { "accept-encoding": "gzip" });
    const oldEtag = String(before.headers.etag);
    // 换不同长度的内容：mtime+size 双变化，压缩缓存与 ETag 都失效
    writeFileSync(join(root, "dist", "data.json"), JSON.stringify({ pad: "y".repeat(4096) }));
    const after = await condGet("/dist/data.json", { "accept-encoding": "gzip", "if-none-match": oldEtag });
    expect(after.status).toBe(200);
    expect(after.headers.etag).not.toBe(oldEtag);
    const replayNew = await condGet("/dist/data.json", { "accept-encoding": "gzip", "if-none-match": String(after.headers.etag) });
    expect(replayNew.status).toBe(304);
  });

  it("entityTag 只依赖编码+mtime+size（同 stats 稳定）", () => {
    const st = statSync(join(root, "dist", "data.json"));
    expect(entityTag(st, "gzip")).toBe(entityTag(st, "gzip"));
    expect(entityTag(st, "br")).not.toBe(entityTag(st, "gzip"));
  });
});
