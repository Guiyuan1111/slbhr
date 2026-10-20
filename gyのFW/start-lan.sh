#!/usr/bin/env bash
# 森林冰火人联机服（局域网真机模式）Linux/macOS 启动脚本（等价 start-lan.bat）
set -e
cd "$(dirname "$0")"
echo "[1/2] 构建客户端..."
npm run build
echo "[2/2] 启动服务器（绑定 0.0.0.0，手机可连）..."
export FW_HOST=0.0.0.0
node --import tsx packages/server/src/index.ts
echo "服务器已退出。若上方有报错，请把报错内容反馈。"
