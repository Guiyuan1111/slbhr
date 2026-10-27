/**
 * matchmaking 限流回归（#21 High）：
 *  - 固定窗口语义保持（61 次拒绝、窗口轮换放行）；
 *  - authIp 缺省只信 TCP 对端——1000 个伪造 X-Forwarded-For 不得改变限流 key；
 *  - FW_TRUST_PROXY=1 时才采信 x-real-ip / XFF【最右项】（#48-B：首项可被客户端伪造），
 *    且必须 net.isIP 合法；
 *  - 窗口内 2 万唯一 key 洪水：内存有界（≤硬限）、耗时近线性（原实现 O(n²) 实测 3s+）。
 */
import { afterEach, describe, expect, it } from "vitest";
import { authIp, authWindowsSize, checkAuthRateLimit } from "../rooms/ForestRoom.js";

const T = 1_700_000_000_000;

afterEach(() => {
  delete process.env.FW_TRUST_PROXY;
});

describe("checkAuthRateLimit 固定窗口（M5 语义保持）", () => {
  it("同 key 第 61 次拒绝，窗口轮换后放行", () => {
    const key = "10.1.1.1";
    for (let i = 0; i < 60; i++) expect(checkAuthRateLimit(key, T)).toBe(true);
    expect(checkAuthRateLimit(key, T)).toBe(false);
    expect(checkAuthRateLimit(key, T + 1_000)).toBe(false);
    expect(checkAuthRateLimit(key, T + 60_000)).toBe(true);
  });
});

describe("authIp 伪造头防绕过（#21）", () => {
  const ctx = (headers: Record<string, string | string[]>, remote = "203.0.113.9") =>
    ({ req: { headers, socket: { remoteAddress: remote } } }) as never;

  it("缺省（FW_TRUST_PROXY 未设）：1000 个伪造 XFF 全部落到同一 socket 桶", () => {
    const keys = new Set<string>();
    for (let i = 0; i < 1000; i++) keys.add(authIp(ctx({ "x-forwarded-for": `198.51.100.${i % 256}`, "x-real-ip": `198.51.100.${i % 256}` })));
    expect(keys.size).toBe(1);
    expect([...keys][0]).toBe("203.0.113.9");
  });

  it("FW_TRUST_PROXY=1：x-real-ip 优先，XFF 取首项，非法值回退对端", () => {
    process.env.FW_TRUST_PROXY = "1";
    expect(authIp(ctx({ "x-real-ip": "198.51.100.7", "x-forwarded-for": "198.51.100.8, 10.0.0.1" }))).toBe("198.51.100.7");
    expect(authIp(ctx({ "x-forwarded-for": "198.51.100.8, 10.0.0.1" }))).toBe("10.0.0.1");
    // 追加式反代下首项是客户端自带字段：伪造值被忽略，只认最右可信跳
    expect(authIp(ctx({ "x-forwarded-for": "6.6.6.6, 198.51.100.8, 10.0.0.1" }))).toBe("10.0.0.1");
    expect(authIp(ctx({ "x-forwarded-for": "not-an-ip" }))).toBe("203.0.113.9");
    expect(authIp(ctx({}))).toBe("203.0.113.9");
  });
});

describe("容量治理有界化（#21）", () => {
  it("2 万唯一 key 洪水：桶数 ≤ 硬限、耗时近线性（原 O(n²) 20k 实测 3s+）", () => {
    const t0 = performance.now();
    let allowed = 0;
    for (let i = 0; i < 20_000; i++) {
      if (checkAuthRateLimit(`198.51.100.${i}:flood`, T)) allowed++;
    }
    const ms = performance.now() - t0;
    expect(allowed).toBe(20_000); // 每个新桶第 1 次都放行（限的是单桶 60 次/窗）
    expect(authWindowsSize()).toBeLessThanOrEqual(4096);
    expect(ms).toBeLessThan(2_500);
  });

  it("被淘汰的最旧桶重新进入视为新窗口（不复活旧计数）", () => {
    const old = "198.51.100.1:evict";
    expect(checkAuthRateLimit(old, T)).toBe(true);
    for (let i = 0; i < 59; i++) expect(checkAuthRateLimit(old, T)).toBe(true);
    expect(checkAuthRateLimit(old, T)).toBe(false); // 满窗
    // 洪水把最旧桶挤出；随后同 key 再来视为新桶（固定窗口语义，防的是爆破而非记忆）
    for (let i = 0; i < 8192; i++) checkAuthRateLimit(`198.51.100.${i}:evict-flood`, T);
    expect(checkAuthRateLimit(old, T)).toBe(true);
  });
});
