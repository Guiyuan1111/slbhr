#!/usr/bin/env bash
# 森林冰火人联机版 Linux/macOS 启动脚本（等价 start.bat）
set -e
cd "$(dirname "$0")"
echo "[森林冰火人联机版] 构建客户端..."
npm run build
echo "[启动服务器] http://127.0.0.1:2567  （Ctrl+C 停止）"
node --import tsx packages/server/src/index.ts
echo "服务器已退出。若上方有报错，请把报错内容反馈。"
