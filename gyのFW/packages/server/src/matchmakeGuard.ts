/**
 * matchmakeGuard：/matchmake 请求体上限（M5）。
 *
 * 背景：Colyseus 0.16 的 Server.handleMatchMakeRequest 对 POST body 无上限——持续
 * `req.on("data")` 累加后 `Buffer.concat` + `JSON.parse`（Server.js:225-231），公网隧道下
 * 一个超大 body 即可打爆内存。这里在 http.Server 的 request 事件最前面加一道 16KB 闸门。
 *
 * 安装顺序（关键）：Server 构造时 attachMatchMakingRoutes 会 `removeAllListeners("request")`
 * 并重新挂自己的监听器（Server.js:192-194），因此必须在 `new Server(...)` 之后安装；
 * 用 `prependListener` 保证先于 Colyseus 监听器执行。未超限的请求只做字节计数，
 * 不缓存 body、不 pause，Colyseus 仍能正常读取完整 body。
 */
import type http from "node:http";

export const MATCHMAKE_MAX_BYTES = 16 * 1024;

/**
 * 在 server 上安装 /matchmake POST 请求体上限。
 * @param server 与 Colyseus WebSocketTransport 共用的 http.Server
 * @param maxBytes 允许的最大 body 字节数（缺省 16KB）
 */
export function installMatchmakeBodyGuard(server: http.Server, maxBytes = MATCHMAKE_MAX_BYTES): void {
  server.prependListener("request", (req, res) => {
    // 用 "/matchmake"（与 Colyseus Server.js:196 的 indexOf 判定同口径，含末尾无斜杠变体），
    // 避免 /matchmake 裸路径绕过上限。静态资源/健康检查/WS upgrade 完全不受影响。
    if (!(req.url ?? "").includes("/matchmake")) return;

    // #32：Colyseus handleMatchMakeRequest 只有 OPTIONS/POST 分支（Server.js:206-245），
    // 其余方法不写响应也不 end——socket 永久挂起（未鉴权连接可无限占用 FD）。立即 405
    // 并关闭连接；OPTIONS 交还 Colyseus 的 CORS 预检分支。
    if (req.method !== "POST" && req.method !== "OPTIONS") {
      if (!res.headersSent) {
        res.writeHead(405, { Allow: "OPTIONS, POST", Connection: "close" });
        res.end(() => req.destroy());
      } else {
        req.destroy();
      }
      return;
    }
    if (req.method !== "POST") return;

    let rejected = false;
    const reject = (): void => {
      if (rejected) return;
      rejected = true;
      const body = JSON.stringify({ error: "请求体过大" });
      if (!res.headersSent) {
        res.writeHead(413, {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
          Connection: "close",
        });
        // end 回调在响应刷出后销毁请求，避免 RST 先于 413 到达客户端
        res.end(body, () => req.destroy());
      } else {
        req.destroy();
      }
    };

    // 声明长度已超限：无需等 body，立即拒绝
    const declared = Number(req.headers["content-length"]);
    if (Number.isFinite(declared) && declared > maxBytes) {
      reject();
      return;
    }

    // 无 content-length（chunked）或声明值不超限：边收边计数；不消费/不 pause，
    // Colyseus 的 data 监听器照常拿到同一批 chunk。
    let received = 0;
    req.on("data", (chunk: Buffer) => {
      received += chunk.length;
      if (received > maxBytes) reject();
    });
  });
}
