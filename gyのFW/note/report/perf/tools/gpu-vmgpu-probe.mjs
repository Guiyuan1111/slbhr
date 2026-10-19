/** GPU 路径探针（r7 勘误件）：VM 内 Chromium 四模式矩阵，验 renderer 是否 SVGA3D。
 *  背景：gpu-vmwgfx-diagnosis §8 勘误——真凶是 Chromium GPU 黑名单非架构。
 *  用法：先 sudo systemd-run --unit=xorg9 Xorg :9 -noreset，再 node gpu-vmgpu-probe.mjs。
 *  期待：unblock 行 renderer=SVGA3D；其余为 SwiftShader 或 null。 */
import { chromium } from "playwright";

const probe = async (args, label) => {
  let b;
  try {
    b = await chromium.launch({ headless: false, args, env: { ...process.env, DISPLAY: ":9" } });
    const p = await b.newPage();
    await p.goto("about:blank", { timeout: 15000 });
    const info = await p.evaluate(() => {
      const c = document.createElement("canvas");
      const gl = c.getContext("webgl2") || c.getContext("webgl");
      if (!gl) return { webgl: false };
      const d = gl.getExtension("WEBGL_debug_renderer_info");
      return { renderer: d ? gl.getParameter(d.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER) };
    });
    console.log(`${label}: ${JSON.stringify(info)}`);
  } catch (e) {
    console.log(`${label}: FAIL ${String(e).slice(0, 160)}`);
  } finally {
    await b?.close().catch(() => {});
  }
};

await probe(["--no-sandbox"], "default(headed)");
await probe(["--no-sandbox", "--use-angle=gl"], "angle=gl    ");
await probe(["--no-sandbox", "--use-angle=vulkan"], "angle=vulkan");
await probe(["--no-sandbox", "--ignore-gpu-blocklist", "--enable-gpu-rasterization"], "unblock     ");
process.exit(0);
