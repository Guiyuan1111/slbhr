/**
 * 服务器入口：
 * - express 托管客户端构建产物（packages/client/dist）+ 官方素材（/assets /data）
 * - Colyseus 同端口接管 WebSocket（upgrade）与 /matchmake 路由
 * - 只绑定 127.0.0.1，公网访问一律走樱花穿透隧道
 */
import http from "node:http";
import { createHash } from "node:crypto";
import os from "node:os";
import { join } from "node:path";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import express from "express";
import { Server, WebSocketTransport } from "./colyseus.cjs.js";
import { staticGz } from "./staticGz.js";
import { applyServerTimeouts } from "./serverTimeouts.js";
import { installMatchmakeBodyGuard } from "./matchmakeGuard.js";
import { isOriginAllowed } from "./originPolicy.js";
import { fixedWindowRateLimit } from "./rateLimit.js";
import { ForestRoom } from "./rooms/ForestRoom.js";
import { levelExists, listLevelIds, loadLevel } from "./levels.js";

const ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const PORT = Number(process.env.PORT ?? 2567);
/** 默认只绑本机（安全）；真机/局域网试玩用 start-lan.bat 或设 FW_HOST=0.0.0.0 */
const HOST = process.env.FW_HOST ?? "127.0.0.1";
/** 跨域白名单（#45）：同源恒放行；隧道自定义域名等场景用逗号分隔显式列出 */
const ALLOWED_ORIGINS = (process.env.FW_ALLOWED_ORIGINS ?? "")
  .split(",")
  .map((x) => x.trim())
  .filter(Boolean);

/** index.html 内联脚本的 CSP sha256 清单（#45）：从实际服务的构建产物提取，保证与
 *  所服务内容一致；产物缺失（未 build，页面本身也 404）时退化为仅 'self'。 */
function buildInlineScriptHashes(root: string): string {
  try {
    const html = readFileSync(join(root, "packages/client/dist/index.html"), "utf8");
    const hashes = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(
      (m) => `'sha256-${createHash("sha256").update(m[1]).digest("base64")}'`,
    );
    return hashes.length ? " " + hashes.join(" ") : "";
  } catch {
    return "";
  }
}

/** 安全响应头（#45 纵深防御）：客户端审计无 XSS sink，此处为纵深——外部脚本注入、
 *  点击劫持、MIME 嗅探、Referer 泄漏。CSP 的 connect-src 放开 ws/wss 以兼容局域网
 *  IP 直连与隧道（同源升级时 'self' 在部分浏览器不覆盖 ws: scheme）。 */
const CSP = [
  "default-src 'self'",
  "script-src 'self'" + buildInlineScriptHashes(ROOT),
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "media-src 'self' blob: data:",
  "connect-src 'self' ws: wss:",
  "font-src 'self' data:",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
].join("; ");

const app = express();
app.disable("x-powered-by");

app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Content-Security-Policy", CSP);
  next();
});

// 健康探针（I-01）：systemd/反代/隧道探活用——进程活着且事件循环在跑即 200。
// 挂在静态与 WS 之前，零依赖零鉴权；不反映房间数（私用场景无此需求）。
app.get("/healthz", (_req, res) => {
  res.json({ ok: true, uptime: Math.round(process.uptime()) });
});

// 静态资源：构建产物 + 官方素材/关卡数据（与开发时 Vite public 同布局）
// 压缩协商/缓存策略/根前缀校验实现见 ./staticGz.ts
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
// 统一走本接口按 id 取关；服务端 LEVEL_DIRS 顺序为唯一权威）。#45：无鉴权面加
// 固定窗口限流（60 req/10s/IP，隧道暴露时挡低成本刷 CPU/IO）。
app.use("/api", fixedWindowRateLimit({ windowMs: 10_000, max: 60 }));
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
    // 关卡 JSON 随版本发布后不变，短程共享缓存安全（#45：无鉴权热路径减负）
    res.setHeader("Cache-Control", "public, max-age=300");
    res.json({ id: bundle.id, json: bundle.json });
  } catch (err) {
    // L2：异常细节只进服务端日志（含路径/堆栈），响应保持通用文案，避免泄漏部署结构
    console.error("[fw] 关卡加载失败:", err);
    res.status(500).json({ error: "关卡加载失败" });
  }
});

const httpServer = http.createServer(app);
applyServerTimeouts(httpServer);

const gameServer = new Server({
  transport: new WebSocketTransport({
    server: httpServer,
    // #45：WS 升级同 matchmake 口径校验 Origin（同源/白名单/无 Origin 放行），
    // 拒绝时 403 断开升级。浏览器跨站 WS 不受 CORS 管，必须在此收口。
    verifyClient: (info, cb) => {
      const ok = isOriginAllowed(info.origin || undefined, info.req.headers.host, ALLOWED_ORIGINS);
      cb(ok, ok ? 200 : 403);
    },
  }),
});

// M5：Colyseus 的 /matchmake 请求体无上限（Server.js:225-231 全量 concat 后 JSON.parse），
// 在 new Server 之后（attachMatchMakingRoutes 会 removeAllListeners("request")）、listen 之前
// 用 prependListener 抢在 Colyseus 之前做 16KB 上限拦截。注意 src/matchmakeGuard.ts 的实现顺序依赖。
installMatchmakeBodyGuard(httpServer, { allowedOrigins: ALLOWED_ORIGINS });

gameServer.define("forest", ForestRoom);

// SIGTERM/SIGINT 优雅停机（M-05 复核：colyseus 0.16 Server 默认 gracefullyShutdown=true
// 已注册 SIGINT/SIGTERM/SIGUSR2 → matchMaker 回收房间（触发各房 onDispose）→ transport
// shutdown 关 httpServer → process.exit，实测端口随退随释放。这里只挂 onShutdown 钩子
// 留停机完成日志供 journald/运维观测，不重复注册信号处理器。
gameServer.onShutdown(() => {
  console.log("[fw] 优雅停机完成（房间已回收，端口即将释放）");
});

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

// 进程级最后防线（#45）：房间级异常已由 ForestRoom.onUncaughtException 隔离（只弃
// 出事房间）；这两个 handler 只做可观测（完整堆栈入日志），不主动退出——此时进程
// 退出只会放大爆炸半径（全部房间同时掉线）。@pm2/io 等依赖也会注册全局 handler，
// 项目自身不依赖其「兜底不退出」语义。
process.on("uncaughtException", (err) => {
  console.error("[fw] uncaughtException:", err);
});
process.on("unhandledRejection", (reason) => {
  console.error("[fw] unhandledRejection:", reason);
});
