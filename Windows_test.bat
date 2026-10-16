@echo off
setlocal
cd /d "%~dp0"

echo ================================================
echo   Fireboy ^& Watergirl 森林神庙 - Windows 一键测试
echo   自动：拉取最新代码 → 检查环境 → 安装依赖 → 构建 → 启动
echo ================================================
echo.

rem ---- 1. 拉取最新代码（失败仅警告，不影响本地游玩） ----
echo [1/4] 拉取最新代码...
git pull --ff-only
if errorlevel 1 echo [提示] git pull 未成功（无网络或本地有改动），将使用当前版本继续。
echo.

rem ---- 2. 检查 Node.js ----
echo [2/4] 检查环境...
where node >nul 2>nul
if errorlevel 1 (
  echo [错误] 未检测到 Node.js！请先安装 Node 22 LTS：https://nodejs.org/
  echo        安装后重新双击本脚本即可。
  pause
  exit /b 1
)
for /f "delims=" %%v in ('node -v') do set "NODEV=%%v"
echo   已检测到 Node %NODEV% （建议 22 LTS）
echo.

rem ---- 3. 安装依赖（首次完整安装，之后增量秒级） ----
cd /d "%~dp0gyのFW"
echo [3/4] 安装依赖...
if not exist node_modules (
  call npm ci --no-audit --no-fund
) else (
  call npm install --no-audit --no-fund
)
if errorlevel 1 (
  echo [错误] 依赖安装失败。可尝试：删除 gyのFW 下的 node_modules 文件夹后重新运行本脚本。
  pause
  exit /b 1
)
echo.

rem ---- 4. 构建客户端并启动游玩服务器 ----
echo [4/4] 构建客户端并启动游玩服务器...
echo.
echo   启动完成后，浏览器打开  http://127.0.0.1:2567  即可游玩
echo   停止：关闭本窗口或按 Ctrl+C
echo   若提示端口被占用，请先关闭旧的游玩服务器窗口再运行。
echo.
call npm run build
if errorlevel 1 (
  echo [错误] 客户端构建失败，请把本窗口截图发给开发者。
  pause
  exit /b 1
)
call npx tsx packages/server/src/index.ts

echo.
echo 游玩服务器已退出。
pause
