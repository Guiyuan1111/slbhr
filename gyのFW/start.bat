@echo off
cd /d "%~dp0"
echo [森林冰火人联机版] 构建客户端...
call npm run build
if errorlevel 1 (
  echo 构建失败，请检查上方报错。
  pause
  exit /b 1
)
echo [启动服务器] http://127.0.0.1:2567  （Ctrl+C 停止，关闭此窗口=停服）
call node --import tsx packages/server/src/index.ts
echo.
echo 服务器已退出。若上方有报错，请把报错内容截图反馈。
pause
