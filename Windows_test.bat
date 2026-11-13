@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"

echo ================================================
echo   Fireboy ^& Watergirl 森林冰火人 - Windows 一键开始
echo   自动拉取最新代码 → 检查环境 → 安装依赖 → 构建 → 起服
echo ================================================
echo.

rem ---- 1. 拉取最新代码（失败仅提示，不影响本次游玩）----
echo [1/4] 拉取最新代码...
git pull --ff-only
if errorlevel 1 echo [提示] git pull 未成功（离线或本地有改动），使用当前版本继续。
echo.

rem ---- 2. 检查 Node.js ----
echo [2/4] 检查环境...
where node >nul 2>nul
if errorlevel 1 (
  echo [错误] 未检测到 Node.js。请先安装 Node 22 LTS：https://nodejs.org/
  echo        安装完成后重新双击本脚本即可。
  pause
  exit /b 1
)
for /f "delims=" %%v in ('node -v') do set "NODEV=%%v"
echo   已检测到 Node %NODEV%（建议 22 LTS）。
echo.

rem ---- 3. 定位工程目录（gy?FW 目录名含非 GBK 字符，用通配符匹配避免编码死路）----
set "APPDIR="
for /d %%d in ("%~dp0gy*FW") do set "APPDIR=%%d"
if not defined APPDIR (
  echo [错误] 未找到工程目录 gyのFW（应与本脚本同级）。请确认完整克隆了仓库。
  pause
  exit /b 1
)
cd /d "%APPDIR%"
echo [3/4] 安装依赖...
if not exist node_modules (
  call npm ci --no-audit --no-fund
) else (
  call npm install --no-audit --no-fund
)
if errorlevel 1 (
  echo [错误] 依赖安装失败。可尝试删除 node_modules 文件夹后重新运行本脚本。
  pause
  exit /b 1
)
echo.

rem ---- 4. 构建客户端并起服务器（与 gyのFW/start.bat 同款链）----
echo [4/4] 构建客户端并启动游戏服务器...
echo.
echo   启动完成后浏览器打开  http://127.0.0.1:2567  即可游玩
echo   停止：关闭本窗口或按 Ctrl+C
echo   如提示端口被占用，请先关闭旧的服务器窗口再试。
echo.
call npm run build
if errorlevel 1 (
  echo [错误] 客户端构建失败，请截图本窗口全部内容求助。
  pause
  exit /b 1
)
call node --import tsx packages/server/src/index.ts

echo.
echo 服务器已退出。
pause
