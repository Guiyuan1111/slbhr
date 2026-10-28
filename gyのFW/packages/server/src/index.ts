/**
 * 服务器入口：
 * - express 托管客户端构建产物（packages/client/dist）+ 官方素材（/assets /data）
 * - Colyseus 同端口接管 WebSocket（upgrade）与 /matchmake 路由
 * - 只绑定 127.0.0.1，公网访问一律走樱花穿透隧道
 */
import http from "node:http";
import os from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { Server, WebSocketTransport } from "./colyseus.cjs.js";
import { staticGz } from "./staticGz.js";
import { sendJson } from "./jsonRes.js";
import { applyServerTimeouts } from "./serverTimeouts.js";
import { installMatchmakeBodyGuard } from "./matchmakeGuard.js";
import { isOriginAllowed, wsOriginVerify } from "./originPolicy.js";
import { buildInlineScriptHashes, composeCsp, securityHeadersMiddleware } from "./serverHeaders.js";
import { fixedWindowRateLimit } from "./rateLimit.js";
import { logFatal } from "./processGuards.js";
import { guardSchemaSemantics } from "./schemaSelfCheck.js";
import { ForestRoom } from "./rooms/ForestRoom.js";
import { levelExists, listLevelIds, loadLevel } from "./levels.js";

// #51 第一道门：状态字段必须是 schema 访问器。分发/编译链路一旦丢掉 tsconfig 的
// useDefineForClassFields:false，`x!: number` 会变成原生字段覆盖访问器——那要到
// 房间首次增量广播才炸（玩家卡 loading、整进程带崩）。这里在监听端口前先判形态，
// 不对立即退出，运维在启动日志就能看到原因。
guardSchemaSemantics();

const ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const PORT = Number(process.env.PORT ?? 2567);
/** 默认只绑本机（安全）；真机/局域网试玩用 start-lan.bat 或设 FW_HOST=0.0.0.0 */
const HOST = process.env.FW_HOST ?? "127.0.0.1";
/** 跨域白名单（#45）：同源恒放行；隧道自定义域名等场景用逗号分隔显式列出 */
const ALLOWED_ORIGINS = (process.env.FW_ALLOWED_ORIGINS ?? "")
  .split(",")
  .map((x) => x.trim())
  .filter(Boolean);

/** 安全响应头（#45 纵深防御）：CSP 内联脚本哈希从实际服务的构建产物提取（实现见 ./serverHeaders.ts） */
const CSP = composeCsp(buildInlineScriptHashes(ROOT));

const app = express();
app.disable("x-powered-by");

app.use(securityHeadersMiddleware(CSP));

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
app.get("/api/levels", (req, res) => {
  sendJson(req, res, { ids: listLevelIds() });
});
app.get("/api/level/:id", (req, res) => {
  const id = String(req.params.id ?? "");
  if (!levelExists(id)) {
    res.status(404).json({ error: `关卡不存在: ${id}` });
    return;
  }
  try {
    const bundle = loadLevel(id);
    // 关卡 JSON 随版本发布后不变，短程共享缓存安全（#45）；r15 移植（2026-10-27）：
    // 叠加内容寻址 ETag + br/gzip 协商压缩——300s 新鲜期后条件复验 304（不整份重下），
    // 正文按编码传输（实测单关 JSON 冗余 90%+）。实现见 ./jsonRes.ts
    sendJson(req, res, { id: bundle.id, json: bundle.json }, "public, max-age=300");
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
    verifyClient: wsOriginVerify(ALLOWED_ORIGINS),
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

// 进程级最后防线（#45，实现见 ./processGuards.ts）：@pm2/io 等依赖也会注册全局
// handler，项目自身不依赖其「兜底不退出」语义。
process.on("uncaughtException", logFatal("uncaughtException"));
process.on("unhandledRejection", logFatal("unhandledRejection"));
