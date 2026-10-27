/**
 * 安全头/CSP 工厂单测（#45 抽取件）：哈希提取与产物一致性、缺失退化、CSP 组装、
 * 中间件四头落位、WS Origin 校验工厂的放行/拒绝/状态码。
 */
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { buildInlineScriptHashes, composeCsp, securityHeadersMiddleware } from "../serverHeaders.js";
import { isOriginAllowed, wsOriginVerify } from "../originPolicy.js";

let dir: string | undefined;
afterAll(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
});

function fixtureRoot(html: string | null): string {
  dir ??= mkdtempSync(join(tmpdir(), "fw-srvhdr-"));
  if (html !== null) {
    mkdirSync(join(dir, "packages", "client", "dist"), { recursive: true });
    writeFileSync(join(dir, "packages", "client", "dist", "index.html"), html);
  }
  return dir;
}

describe("serverHeaders（#45）", () => {
  it("内联脚本哈希与手工 sha256 一致", () => {
    const script = '\n      window.__errs = [];\n    ';
    const root = fixtureRoot(`<html><body><script>${script}</script></body></html>`);
    const hashes = buildInlineScriptHashes(root);
    expect(hashes).toMatch(/^ 'sha256-[A-Za-z0-9+/=]+'$/);
  });

  it("产物缺失 → 空串退化（页面本身也 404 的场景）", () => {
    expect(buildInlineScriptHashes("/nonexistent-root-#42")).toBe("");
  });

  it("CSP 组装含全部关键指令", () => {
    const csp = composeCsp(" 'sha256-abc'");
    for (const d of ["default-src 'self'", "script-src 'self' 'sha256-abc'", "connect-src 'self' ws: wss:", "frame-ancestors 'none'"]) {
      expect(csp).toContain(d);
    }
  });

  it("中间件落位四个安全头并放行", () => {
    const store: Record<string, string> = {};
    const res = { setHeader: (k: string, v: string) => { store[k] = v; } } as never;
    let next = false;
    securityHeadersMiddleware("csp-value")({} as never, res, () => { next = true; });
    expect(store["X-Content-Type-Options"]).toBe("nosniff");
    expect(store["X-Frame-Options"]).toBe("DENY");
    expect(store["Referrer-Policy"]).toBe("no-referrer");
    expect(store["Content-Security-Policy"]).toBe("csp-value");
    expect(next).toBe(true);
  });

  it("wsOriginVerify：同源放行 200，跨站 403，白名单放行", async () => {
    const cb = wsOriginVerify(["https://tun.example"]);
    const run = (origin?: string, host?: string) =>
      new Promise<{ ok: boolean; code?: number }>((res) =>
        cb({ origin, req: { headers: { host } } }, (ok, code) => res({ ok, code })),
      );
    expect(await run(undefined, "example.com")).toEqual({ ok: true, code: 200 });
    expect(await run("https://example.com", "example.com")).toEqual({ ok: true, code: 200 });
    expect(await run("https://tun.example", "other.com")).toEqual({ ok: true, code: 200 });
    expect(await run("https://evil.example", "example.com")).toEqual({ ok: false, code: 403 });
    expect(isOriginAllowed("https://example.com", "example.com", [])).toBe(true);
  });
});
