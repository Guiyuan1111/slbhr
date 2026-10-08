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
      "/api": "http://127.0.0.1:2567",
      "/matchmake": { target: "http://127.0.0.1:2567", ws: true },
    },
  },
  optimizeDeps: {
    exclude: ["@fw/shared"],
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    // 长缓存分包（0.3.21 加载性能优化）：phaser/colyseus 拆独立内容哈希块，
    // 业务代码更新时这两个大块命中浏览器缓存，仅重传小块 index。
    rollupOptions: {
      output: {
        manualChunks: {
          phaser: ["phaser"],
          colyseus: ["colyseus.js"],
        },
      },
    },
  },
});
