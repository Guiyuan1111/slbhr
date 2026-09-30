@echo off
chcp 65001 >nul
cd /d %~dp0
echo [森林冰火人联机版] 构建客户端...
call npm run build || goto :err
echo [启动服务器] http://127.0.0.1:2567  （Ctrl+C 停止）
call npx tsx packages/server/src/index.ts
goto :eof
:err
echo 构建失败，请检查上方报错。
pause
