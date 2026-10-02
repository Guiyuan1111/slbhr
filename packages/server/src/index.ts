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
import { ForestRoom } from "./rooms/ForestRoom.js";

const ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const PORT = Number(process.env.PORT ?? 2567);
/** 默认只绑本机（安全）；真机/局域网试玩用 start-lan.bat 或设 FW_HOST=0.0.0.0 */
const HOST = process.env.FW_HOST ?? "127.0.0.1";

const app = express();
app.disable("x-powered-by");

// 静态资源：构建产物 + 官方素材/关卡数据（与开发时 Vite public 同布局）
app.use(express.static(join(ROOT, "packages/client/dist"), { maxAge: "1h" }));
app.use("/assets", express.static(join(ROOT, "assets"), { maxAge: "1d" }));
app.use("/data", express.static(join(ROOT, "data"), { maxAge: "1d" }));

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
