#!/usr/bin/env node
/**
 * serve-original.mjs — 原版参考库静态伺服器（零依赖，node:http）
 *
 * 伺服 D:\01_Guiyuan1111\GitHub\slbhr\Fireboy-and-Watergirl\output\A\（只读参考库，绝不写入）。
 * 端口固定 127.0.0.1:8787（8099/2567/5173 另有他用，禁用）。
 *
 * 用法：
 *   node scripts/baseline/serve-original.mjs            # 前台运行
 *   node scripts/baseline/serve-original.mjs --port 8788
 *
 * 说明：
 *  - 全部响应带 no-store 缓存禁用头，保证采集确定性。
 *  - MIME 覆盖游戏用到的全部类型（html/js/json/png/mp3/fnt/jpg...)。
 *  - 只做 GET/HEAD，路径归一化 + 前缀校验防目录穿越。
 */
import http from "node:http";
import path from "node:path";
import { promises as fsp } from "node:fs";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// 参考库只读根：output/A（森林神庙完整客户端）
const ROOT = path.resolve(__dirname, "../../../Fireboy-and-Watergirl/output/A");
const PORT = Number(process.argv.includes("--port") ? process.argv[process.argv.indexOf("--port") + 1] : 8787);
const HOST = "127.0.0.1";

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".htm": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".mp3": "audio/mpeg",
  ".ogg": "audio/ogg",
  ".wav": "audio/wav",
  ".fnt": "text/plain; charset=utf-8", // 位图字体描述（BMFont 文本格式）
  ".css": "text/css; charset=utf-8",
  ".ico": "image/x-icon",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml",
};

const NO_CACHE = {
  "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
  Pragma: "no-cache",
  Expires: "0",
};

/** 将 URL 路径安全映射到 ROOT 内的绝对路径 */
function resolveSafe(urlPath) {
  let p = decodeURIComponent(urlPath.split("?")[0]);
  p = p.replace(/\\/g, "/");
  if (p.endsWith("/")) p += "gameIndex.html"; // 目录默认入口
  if (p === "" || p === "/") p = "/gameIndex.html";
  const abs = path.normalize(path.join(ROOT, p));
  if (abs !== ROOT && !abs.startsWith(ROOT + path.sep)) return null; // 穿越
  return abs;
}

const server = http.createServer(async (req, res) => {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405, { ...NO_CACHE, Allow: "GET, HEAD" });
    return res.end();
  }
  const abs = resolveSafe(req.url || "/");
  if (!abs) {
    res.writeHead(403, NO_CACHE);
    return res.end("forbidden");
  }
  try {
    const st = await fsp.stat(abs);
    if (st.isDirectory()) {
      res.writeHead(301, { ...NO_CACHE, Location: req.url + "/" });
      return res.end();
    }
    const ext = path.extname(abs).toLowerCase();
    res.writeHead(200, {
      "Content-Type": MIME[ext] || "application/octet-stream",
      "Content-Length": st.size,
      ...NO_CACHE,
    });
    if (req.method === "HEAD") return res.end();
    const data = await fsp.readFile(abs);
    return res.end(data);
  } catch {
    res.writeHead(404, { ...NO_CACHE, "Content-Type": "text/plain; charset=utf-8" });
    return res.end("404 not found: " + req.url);
  }
});

server.listen(PORT, HOST, () => {
  console.log(`[serve-original] serving READ-ONLY root: ${ROOT}`);
  console.log(`[serve-original] URL: http://${HOST}:${PORT}/gameIndex.html`);
});
