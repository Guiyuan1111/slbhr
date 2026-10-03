import { defineConfig } from "vite";

export default defineConfig({
  root: "packages/client",
  publicDir: "public",
  server: {
    port: 5173,
    strictPort: true,
    fs: { allow: ["."], },
    // 开发时代理到本地游戏服务器（生产环境 express 同端口托管，无需代理）
    proxy: {
      "/assets": "http://127.0.0.1:2567",
      "/data": "http://127.0.0.1:2567",
      "/matchmake": { target: "http://127.0.0.1:2567", ws: true },
    },
  },
  optimizeDeps: {
    exclude: ["@fw/shared"],
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
