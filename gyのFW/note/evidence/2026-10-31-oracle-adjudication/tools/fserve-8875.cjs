// fserve-8875.cjs — oracle F 部（fairytales）快照只读静态伺服（本槽专属端口 8875）
// 来源：note/evidence/2026-10-31-oracle-adjudication/tools/serve-8871.cjs 改根目录/端口复用。
// 用法: node fserve-8875.cjs &   只 GET/HEAD；根目录=Fireboy-and-Watergirl/output/F，严格只读。
const http = require("node:http");
const { createReadStream, statSync } = require("node:fs");
const { join, extname } = require("node:path");

const ROOT = "/home/gy/桌面/dev/slbhr/Fireboy-and-Watergirl/output/F";
const PORT = 8875;
const MIME = {
  ".html": "text/html", ".htm": "text/html", ".js": "application/javascript", ".json": "application/json",
  ".png": "image/png", ".jpg": "image/jpeg", ".mp3": "audio/mpeg", ".fnt": "text/plain",
  ".ogg": "audio/ogg", ".wav": "audio/wav", ".m4a": "audio/mp4", ".webm": "video/webm",
};

http
  .createServer((req, res) => {
    if (req.method !== "GET" && req.method !== "HEAD") {
      res.writeHead(405).end("method not allowed");
      return;
    }
    let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
    if (p.endsWith("/")) p += "index.htm";
    const file = join(ROOT, p);
    if (!file.startsWith(ROOT)) {
      res.writeHead(403).end("forbidden");
      return;
    }
    try {
      const st = statSync(file);
      if (!st.isFile()) throw new Error("not file");
      res.writeHead(200, { "Content-Type": MIME[extname(file)] ?? "application/octet-stream", "Content-Length": st.size });
      if (req.method === "HEAD") res.end();
      else createReadStream(file).pipe(res);
    } catch {
      res.writeHead(404).end("not found");
    }
  })
  .listen(PORT, "127.0.0.1", () => console.log(`[fserve] ${ROOT} @ http://127.0.0.1:${PORT}/index.htm`));
