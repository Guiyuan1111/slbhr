@echo off
cd /d "%~dp0"
title 森林冰火人联机服（局域网真机模式）

echo [1/2] 构建客户端...
call npm run build
if errorlevel 1 (
  echo 构建失败，请检查上方报错。
  pause
  exit /b 1
)

echo [2/2] 启动服务器（绑定 0.0.0.0，手机可连）...
echo 首次运行若弹出 Windows 防火墙提示，请勾选「专用网络」并允许。
echo.
set FW_HOST=0.0.0.0
call node --import tsx packages/server/src/index.ts
echo.
echo 服务器已退出。若上方有报错，请把报错内容截图反馈。
pause
