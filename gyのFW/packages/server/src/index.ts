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
import { ForestRoom } from "./rooms/ForestRoom.js";
import { levelExists, listLevelIds, loadLevel } from "./levels.js";

const ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const PORT = Number(process.env.PORT ?? 2567);
/** 默认只绑本机（安全）；真机/局域网试玩用 start-lan.bat 或设 FW_HOST=0.0.0.0 */
const HOST = process.env.FW_HOST ?? "127.0.0.1";

const app = express();
app.disable("x-powered-by");

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
