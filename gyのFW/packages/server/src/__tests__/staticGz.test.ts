/**
 * staticGz 回归：
 * 1) 根前缀校验（M-02）——修复前 `join(root, urlPath)` 不消解 `..`，`/..%2f` 可穿越到仓库
 *    其它目录读取满足扩展名/大小条件的 JSON/HTML；修复后 resolve 归一化 + 根前缀白名单，
 *    越界请求一律走 fallback（404）。用原生 http.request 发原始路径（不归一化 `%2f`），
 *    等价 `curl --path-as-is`。
 * 2) 条件校验（r15）——压缩路径自行 res.end(buffer)，0.3.21 起绕过 express.static 的
 *    ETag/304（perf-load 头部拆账实测 br 响应 etag 全为 no）；现补强 ETag + If-None-Match
 *    /If-Modified-Since → 304，并锁住"每种编码是独立表示"的标签语义。
 * 3) cachePolicy 分级（M8）——Vite 哈希产物 immutable、html no-cache、其余 1 天。
 */
import http from "node:http";
import zlib from "node:zlib";
import os from "node:os";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import express from "express";
import { cachePolicy, entityTag, fallbackCachePolicy, isVersionedUrl, staticGz } from "../staticGz.js";

let server: http.Server;
let port = 0;
let root = "";
let secretName = "";
let secretPath = "";
const DATA_JSON = JSON.stringify({ pad: "x".repeat(2048) });
const SECRET_JSON = JSON.stringify({ secret: "top" });

beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), "fw-staticgz-root-"));
  mkdirSync(join(root, "dist"));
  writeFileSync(join(root, "dist", "data.json"), DATA_JSON);
  writeFileSync(join(root, "dist", "tiny.json"), "x"); // <1KB 走 fallback
  writeFileSync(join(root, "dist", "logo.png"), Buffer.alloc(2048, 7)); // 二进制走 fallback
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

function rawGet(
  path: string,
  acceptEncoding = "gzip",
  extra: Record<string, string> = {},
): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: Buffer }> {
  return new Promise((res, rej) => {
    const req = http.request(
      { host: "127.0.0.1", port, path, headers: { "accept-encoding": acceptEncoding, ...extra } },
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

describe("r37 内容寻址 v= 的缓存分级", () => {
  it("只认 8 位小写十六进制 v", () => {
    expect(isVersionedUrl("/a.png?v=abcdef12")).toBe(true);
    expect(isVersionedUrl("/a.png?x=1&v=0123abcd")).toBe(true);
    expect(isVersionedUrl("/a.png?v=ABCDEF12")).toBe(false);
    expect(isVersionedUrl("/a.png?v=abcdef1")).toBe(false);
    expect(isVersionedUrl("/a.png?v=abcdef123")).toBe(false);
  });

  it("版本化 URL 文本与二进制都 immutable；HTML 永远 no-cache", () => {
    expect(cachePolicy("/data.json", true)).toBe("public, max-age=31536000, immutable");
    expect(cachePolicy("/index.html", true)).toBe("no-cache");
    expect(fallbackCachePolicy("/logo.png", true)).toBe("public, max-age=31536000, immutable");
    expect(fallbackCachePolicy("/index.html", true)).toBe("no-cache");
  });

  it("未版本化二进制仍是 max-age=0（图集布局与 JS 同版本耦合）", () => {
    expect(fallbackCachePolicy("/logo.png", false)).toBe("public, max-age=0");
  });

  it("二进制带 v：immutable；不带的保持 0；小文本同理", async () => {
    const plain = await rawGet("/dist/logo.png", "identity");
    expect(plain.status).toBe(200);
    expect(plain.headers["cache-control"]).toBe("public, max-age=0");
    const versioned = await rawGet("/dist/logo.png?v=abcdef12", "identity");
    expect(versioned.status).toBe(200);
    expect(versioned.headers["cache-control"]).toBe("public, max-age=31536000, immutable");
    const tiny = await rawGet("/dist/tiny.json?v=abcdef12", "identity");
    expect(tiny.headers["cache-control"]).toBe("public, max-age=31536000, immutable");
  });

  it("文本压缩路径同样识别 v；无 v 仍 1 天", async () => {
    const plain = await rawGet("/dist/data.json", "gzip");
    expect(plain.headers["cache-control"]).toBe("public, max-age=86400");
    const versioned = await rawGet("/dist/data.json?v=abcdef12", "gzip");
    expect(versioned.status).toBe(200);
    expect(versioned.headers["cache-control"]).toBe("public, max-age=31536000, immutable");
  });
});

describe("条件校验（r15：压缩路径补 ETag/304）", () => {
  it("br 响应带强 ETag，且新鲜时命中 304 无正文", async () => {
    const first = await rawGet("/dist/data.json", "br");
    expect(first.status).toBe(200);
    expect(first.headers.etag).toMatch(/^"br-[0-9a-f]+-[0-9a-f]+"$/);
    const again = await rawGet("/dist/data.json", "br", { "if-none-match": String(first.headers.etag) });
    expect(again.status).toBe(304);
    expect(again.body.length).toBe(0);
    // 304 仍要带上缓存与协商头（否则缓存无法续期/选表示）
    expect(again.headers.etag).toBe(first.headers.etag);
    expect(again.headers["cache-control"]).toBe("public, max-age=86400");
    expect(again.headers.vary).toBe("Accept-Encoding");
    expect(again.headers["content-encoding"]).toBeUndefined();
  });

  it("同一文件的 br 与 gzip 是两种表示，实体标签不可互认", async () => {
    const br = await rawGet("/dist/data.json", "br");
    const gz = await rawGet("/dist/data.json", "gzip");
    expect(br.headers.etag).not.toBe(gz.headers.etag);
    // 拿 br 的标签去问 gzip：必须 200 重新给 gzip 正文，不能 304（否则缓存拿到错编码）
    const cross = await rawGet("/dist/data.json", "gzip", { "if-none-match": String(br.headers.etag) });
    expect(cross.status).toBe(200);
    expect(cross.headers["content-encoding"]).toBe("gzip");
    expect(zlib.gunzipSync(cross.body).toString("utf8")).toBe(DATA_JSON);
  });

  it("弱比较：W/ 前缀与多标签列表也算命中", async () => {
    const first = await rawGet("/dist/data.json", "gzip");
    const etag = String(first.headers.etag);
    const weak = await rawGet("/dist/data.json", "gzip", { "if-none-match": `W/${etag}` });
    expect(weak.status).toBe(304);
    const list = await rawGet("/dist/data.json", "gzip", { "if-none-match": `"other-0-0", ${etag}` });
    expect(list.status).toBe(304);
    const star = await rawGet("/dist/data.json", "gzip", { "if-none-match": "*" });
    expect(star.status).toBe(304);
  });

  it("If-Modified-Since 兜底（无 If-None-Match 时）：未来时间 304、过去时间 200", async () => {
    const future = new Date(Date.now() + 3600_000).toUTCString();
    const hit = await rawGet("/dist/data.json", "gzip", { "if-modified-since": future });
    expect(hit.status).toBe(304);
    const past = new Date(Date.now() - 3600_000).toUTCString();
    const miss = await rawGet("/dist/data.json", "gzip", { "if-modified-since": past });
    expect(miss.status).toBe(200);
  });

  it("原地换内容 → 标签失配（不能把 304 当成永久免下载）", async () => {
    const before = await rawGet("/dist/data.json", "gzip");
    // 换长度：ETag 含 size，故不依赖 mtime 时钟粒度，判定稳定
    writeFileSync(join(root, "dist", "data.json"), JSON.stringify({ pad: "y".repeat(3000) }));
    const after = await rawGet("/dist/data.json", "gzip", { "if-none-match": String(before.headers.etag) });
    expect(after.status).toBe(200);
    expect(after.headers.etag).not.toBe(before.headers.etag);
    expect(zlib.gunzipSync(after.body).toString("utf8")).not.toBe(DATA_JSON);
    // 还原，避免影响其它用例的 DATA_JSON 断言
    writeFileSync(join(root, "dist", "data.json"), DATA_JSON);
  });

  it("entityTag 只依赖 mtime+大小（同值稳定，跨请求一致）", () => {
    const st = { mtimeMs: 1_700_000_000_000, size: 4096 } as import("node:fs").Stats;
    expect(entityTag(st, "br")).toBe(entityTag(st, "br"));
    expect(entityTag(st, "gzip")).toBe(`"gzip-${(1_700_000_000_000).toString(16)}-1000"`);
    expect(entityTag(st, "br")).not.toBe(entityTag(st, "gzip"));
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

  it.each([
    ["/..%2f" + secretName, "单层 .. 穿越到根外"],
    ["/..%2f..%2f" + secretName, "双层 .. 穿越到根外"],
    ["/dist%2f..%2f..%2f" + secretName, "先入子目录再 .. 回穿"],
    ["/dist/%2e%2e/%2e%2e/" + secretName, "点号编码 .. 回穿"],
    ["/assets/..%2f..%2f" + secretName, "前缀挂载下穿越"],
    ["/..%5c..%5c" + secretName, "反斜杠编码变体"],
  ])("越界请求被拒（%s，%s）", async (path) => {
    const r = await rawGet(path);
    expect(r.status).toBe(404);
    expect(r.body.toString("utf8")).not.toContain("top");
  });

  it("根内点段路径（/../ 不出根）不受影响", async () => {
    const r = await rawGet("/dist/../dist/data.json");
    expect(r.status).toBe(200);
    expect(r.headers["content-encoding"]).toBe("gzip");
  });
});
