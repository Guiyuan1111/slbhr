#!/usr/bin/env bash
# 0.3.0 一键发布：推送 main + 标签，并创建 GitHub Release（附产物包）。
# 前置：gh auth login 已完成（或 gh auth status 显示已登录）。
set -e
cd "$(dirname "$0")"
git push origin main 0.3.0
gh release create 0.3.0 "gyのFW-0.3.0-win64-portable.tar.gz" \
  --title "0.3.0 保真重写" \
  --notes "内核换官方 Box2D（init.js 字节级提取）、48 关全可进、机关全谱、金轨迹对拍达标。详见 gyのFW/note/release/0.3.0.md"
echo "发布完成。"
