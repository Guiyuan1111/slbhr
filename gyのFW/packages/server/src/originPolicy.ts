/**
 * Origin 校验口径（#45）：同源优先 + 环境变量显式扩权。
 *
 * 浏览器侧的跨站发起（matchmake POST/OPTIONS、WS upgrade）按此判定；无 Origin 的
 * 请求（curl / colyseus.js Node 客户端 / e2e 回放）放行——它们本不受 CORS 约束，
 * 这层防线只拦浏览器。匹配规则：
 *  1. Origin 头缺失 → 放行；
 *  2. Origin 的 host 与 Host 头一致（同源，含缺省端口归一）→ 放行；
 *  3. Origin 命中 FW_ALLOWED_ORIGINS（逗号分隔的显式白名单，如隧道自定义域名）→ 放行；
 *  4. 其余（含不可解析的 Origin）→ 拒绝。
 */
export function isOriginAllowed(
  origin: string | undefined,
  host: string | undefined,
  allowlist: readonly string[],
): boolean {
  if (!origin) return true;
  let o: URL;
  try {
    o = new URL(origin);
  } catch {
    return false;
  }
  if (host) {
    const hostNoPort = host.split(":")[0];
    if (o.host === host || o.hostname === hostNoPort) return true;
  }
  return allowlist.includes(origin);
}
