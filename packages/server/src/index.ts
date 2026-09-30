/**
 * 服务器入口：
 * - express 托管客户端构建产物（packages/client/dist）+ 官方素材（/assets /data）
 * - Colyseus 同端口接管 WebSocket（upgrade）与 /matchmake 路由
 * - 只绑定 127.0.0.1，公网访问一律走樱花穿透隧道
 */
import http from "node:http";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { Server, WebSocketTransport } from "./colyseus.cjs.js";
import { ForestRoom } from "./rooms/ForestRoom.js";

const ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const PORT = Number(process.env.PORT ?? 2567);

const app = express();
app.disable("x-powered-by");

// 静态资源：构建产物 + 官方素材/关卡数据（与开发时 Vite public 同布局）
app.use(express.static(join(ROOT, "packages/client/dist"), { maxAge: "1h" }));
app.use("/assets", express.static(join(ROOT, "assets"), { maxAge: "1d" }));
app.use("/data", express.static(join(ROOT, "data"), { maxAge: "1d" }));

const httpServer = http.createServer(app);

const gameServer = new Server({
  transport: new WebSocketTransport({ server: httpServer }),
});
gameServer.define("forest", ForestRoom);

// gameServer.listen 会驱动内部 httpServer 监听（matchmake 路由 + express + ws 同端口）
gameServer
  .listen(PORT, "127.0.0.1")
  .then(() => console.log(`[fw] http+ws  http://127.0.0.1:${PORT}`))
  .catch((err) => {
    console.error("[fw] 服务器启动失败:", err);
    process.exit(1);
  });
