/**
 * Origin 校验口径（#45）：同源/无 Origin/白名单放行，其余拒绝。
 * 防线目标：拦浏览器侧跨站发起（matchmake POST/OPTIONS、WS upgrade）；
 * 无 Origin 的非浏览器客户端（curl/colyseus.js Node/e2e）恒放行。
 */
import { describe, expect, it } from "vitest";
import { isOriginAllowed } from "../originPolicy.js";

describe("isOriginAllowed（#45）", () => {
  it("无 Origin 头放行（curl/Node 客户端/e2e 回放）", () => {
    expect(isOriginAllowed(undefined, "example.com", [])).toBe(true);
  });

  it("同源放行：Origin host 与 Host 头一致", () => {
    expect(isOriginAllowed("https://example.com", "example.com", [])).toBe(true);
    expect(isOriginAllowed("https://example.com:8443", "example.com:8443", [])).toBe(true);
  });

  it("同源放行：Host 头显式缺省端口（:443）时按 hostname 兜底比对", () => {
    expect(isOriginAllowed("https://example.com", "example.com:443", [])).toBe(true);
  });

  it("白名单命中放行（隧道自定义域名等）", () => {
    expect(isOriginAllowed("https://tun.example", "other.com", ["https://tun.example"])).toBe(true);
  });

  it("跨站且不在白名单 → 拒绝", () => {
    expect(isOriginAllowed("https://evil.example", "example.com", [])).toBe(false);
  });

  it("不可解析的 Origin → 拒绝", () => {
    expect(isOriginAllowed("not-a-url", "example.com", [])).toBe(false);
  });
});
