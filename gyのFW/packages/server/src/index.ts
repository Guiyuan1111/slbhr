/**
 * 服务器入口：
 * - express 托管客户端构建产物（packages/client/dist）+ 官方素材（/assets /data）
 * - Colyseus 同端口接管 WebSocket（upgrade）与 /matchmake 路由
 * - 只绑定 127.0.0.1，公网访问一律走樱花穿透隧道
 */
import fs from "node:fs";
import zlib from "node:zlib";
import http from "node:http";
import os from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { Server, WebSocketTransport } from "./colyseus.cjs.js";
import { ForestRoom } from "./rooms/ForestRoom.js";
import { levelExists, listLevelIds, loadLevel } from "./levels.js";

const ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const PORT = Number(process.env.PORT ?? 2567);
/** 默认只绑本机（安全）；真机/局域网试玩用 start-lan.bat 或设 FW_HOST=0.0.0.0 */
const HOST = process.env.FW_HOST ?? "127.0.0.1";

const app = express();
app.disable("x-powered-by");

// 静态资源压缩 + 缓存策略（0.3.14 起 gzip；0.3.21 升级 brotli 协商 + 分级缓存）。
// - 压缩：文本类扩展名 + ≥1KB ≤8MB；客户端支持 br 优先 brotli（比 gzip 再省 ~15%），
//   否则 gzip；产物按 路径+mtime+编码 内存缓存；异常回退 express.static。
// - 缓存（perf-load 基准优化项）：
//   · Vite 内容哈希产物（*.[-8hex].js 等）→ immutable 1 年（版本升级换文件名自然失效）；
//   · index.html → no-cache（必须回源校验，才能拿到新哈希引用）；
//   · 其余（图集/音频/数据）→ public 1 天（内容随版本可能原地更新，不可 immutable）。
//   · 压缩响应带 Vary: Accept-Encoding（经代理/隧道缓存时的协商正确性）。
const GZ_EXT = /.(js|mjs|json|html|css|svg|fnt|txt|xml)$/;
const HASHED_EXT = /-[0-9a-f]{8}.(js|mjs|css)$/;

function cachePolicy(urlPath: string): string {
  if (urlPath.endsWith(".html")) return "no-cache";
  if (HASHED_EXT.test(urlPath)) return "public, max-age=31536000, immutable";
  return "public, max-age=86400";
}

interface CompCacheEntry {
  mtimeMs: number;
  br?: Buffer;
  gz?: Buffer;
}
const compCache = new Map<string, CompCacheEntry>();

function staticGz(root: string) {
  const fallback = express.static(root);
  return (req: express.Request, res: express.Response, next: express.NextFunction): void => {
    const enc = String(req.headers["accept-encoding"] ?? "");
    let urlPath = "";
    try {
      urlPath = decodeURIComponent((req.url ?? "").split("?")[0]);
    } catch {
      urlPath = req.url ?? "";
    }
    const wantBr = enc.includes("br");
    if ((!wantBr && !enc.includes("gzip")) || !GZ_EXT.test(urlPath)) {
      fallback(req, res, next);
      return;
    }
    const fp = join(root, urlPath);
    let st: fs.Stats;
    try {
      st = fs.statSync(fp);
      if (!st.isFile() || st.size < 1024 || st.size > 8 << 20) {
        fallback(req, res, next);
        return;
      }
    } catch {
      fallback(req, res, next);
      return;
    }
    const isHtml = urlPath.endsWith(".html");
    // html 走 no-cache + 原样（体量小，压缩收益低于协商成本）
    if (isHtml) {
      res.setHeader("Cache-Control", "no-cache");
      fallback(req, res, next);
      return;
    }
    let cached = compCache.get(fp);
    if (!cached || cached.mtimeMs !== st.mtimeMs) {
      cached = { mtimeMs: st.mtimeMs };
      compCache.set(fp, cached);
    }
    const ctype = urlPath.endsWith(".js") || urlPath.endsWith(".mjs")
      ? "application/javascript"
      : urlPath.endsWith(".json")
        ? "application/json"
        : urlPath.endsWith(".css")
          ? "text/css"
          : urlPath.endsWith(".svg")
            ? "image/svg+xml"
            : urlPath.endsWith(".fnt")
              ? "text/plain"
              : "application/octet-stream";
    res.setHeader("Content-Type", ctype);
    res.setHeader("Cache-Control", cachePolicy(urlPath));
    res.setHeader("Vary", "Accept-Encoding");
    try {
      if (wantBr) {
        if (!cached.br) cached.br = zlib.brotliCompressSync(fs.readFileSync(fp), { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 5 } });
        res.setHeader("Content-Encoding", "br");
        res.setHeader("Content-Length", String(cached.br.length));
        res.status(200).end(cached.br);
      } else {
        if (!cached.gz) cached.gz = zlib.gzipSync(fs.readFileSync(fp), { level: 6 });
        res.setHeader("Content-Encoding", "gzip");
        res.setHeader("Content-Length", String(cached.gz.length));
        res.status(200).end(cached.gz);
      }
    } catch {
      fallback(req, res, next);
      return;
    }
  };
}

// 静态资源：构建产物 + 官方素材/关卡数据（与开发时 Vite public 同布局）
app.use(staticGz(join(ROOT, "packages/client/dist")));
app.use("/assets", staticGz(join(ROOT, "assets")));
app.use("/data", staticGz(join(ROOT, "data")));

// 音频流式路由（无扩展名 URL，服务器补 .mp3）：IDM 等下载接管工具按 URL
// 扩展名拦截媒体请求，浏览器侧只会拿到 204 空响应导致音频永远缺键；
// 无扩展名 + octet-stream 不在接管名单，正片环境与自动化验收都走这里
app.get("/assets/audio/s/:name", (req, res) => {
  const name = String(req.params.name ?? "");
  if (!/^[A-Za-z0-9_.-]+$/.test(name)) {
    res.sendStatus(400);
    return;
  }
  res.sendFile(
    join(ROOT, "assets/audio", `${name}.mp3`),
    { headers: { "Content-Type": "application/octet-stream", "Cache-Control": "public, max-age=86400" } },
    (err) => {
      if (err && !res.headersSent) res.sendStatus((err as { statusCode?: number }).statusCode ?? 404);
    },
  );
});

// 关卡数据 API（E14/E16：两端取关路径统一——客户端不再自行拼 tutorials/forest 目录，
// 统一走本接口按 id 取关；服务端 LEVEL_DIRS 顺序为唯一权威）
app.get("/api/levels", (_req, res) => {
  res.json({ ids: listLevelIds() });
});
app.get("/api/level/:id", (req, res) => {
  const id = String(req.params.id ?? "");
  if (!levelExists(id)) {
    res.status(404).json({ error: `关卡不存在: ${id}` });
    return;
  }
  try {
    const bundle = loadLevel(id);
    res.json({ id: bundle.id, json: bundle.json });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

const httpServer = http.createServer(app);

const gameServer = new Server({
  transport: new WebSocketTransport({ server: httpServer }),
});
gameServer.define("forest", ForestRoom);

// gameServer.listen 会驱动内部 httpServer 监听（matchmake 路由 + express + ws 同端口）
gameServer
  .listen(PORT, HOST)
  .then(() => {
    console.log(`[fw] http+ws  http://${HOST}:${PORT}`);
    if (HOST === "0.0.0.0") {
      for (const addrs of Object.values(os.networkInterfaces())) {
        for (const a of addrs ?? []) {
          if (a.family === "IPv4" && !a.internal) {
            console.log(`[fw] 局域网可访问  http://${a.address}:${PORT}`);
          }
        }
      }
    }
  })
  .catch((err) => {
    console.error("[fw] 服务器启动失败:", err);
    process.exit(1);
  });
