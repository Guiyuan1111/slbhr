#!/usr/bin/env bash
# ============================================================================
# gyのFW 单部神庙服务器一键部署（1.x=forest / 2.x=light / 3.x=ice）
#
# 给 AI / 运维的唯一入口：解包后在本目录执行
#
#     sudo ./deploy.sh                 # 默认：装成 systemd 服务，监听 2567（仅本机）
#     sudo ./deploy.sh --public        # 对外直连：FW_HOST=0.0.0.0 + 防火墙提示
#     sudo ./deploy.sh --port 8080     # 换端口
#     sudo ./deploy.sh --no-service    # 只前台试跑 + 验收，不装服务
#     sudo ./deploy.sh --verify-only   # 服务已在跑，只跑验收
#
# 本部（哪一部神庙）由包内 data/ 目录自动认定，服务名随之成为 gy-fw-<部>，
# 不让 2.x/3.x 误用 1.x 的服务名。
#
# 脚本做四件事，任何一步失败即非零退出并打印原因：
#   1. 前置自检（root / Linux x64 / Node ≥22.12 / 端口可用 / 包完整性）
#   2. 生成 systemd unit（路径按本目录实测路径填写，不用手改）
#   3. 起服并等待就绪
#   4. 跑 scripts/verify.mjs 全量验收（DEPLOY §5 六步 + 真开局双人 patch 断言）
#
# 不需要 npm、不需要 tsx、不需要构建工具：包内 server 已是预转译 .js。
# ============================================================================
set -euo pipefail

# -h/--help 先于一切解析：开发树里三部 data/ 并存，本部识别会拒，但看用法不该被拦。
for _a in "$@"; do
  case "$_a" in
    -h|--help) sed -n '2,23p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 0 ;;
  esac
done

SELF_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
# 脚本可能被放在包根（分发包里的 deploy.sh），也可能在仓库的 deploy/ 下（开发树）。
# 以「哪层有 packages/server/src/index.js」为准，两种摆放都正确。
if [[ -f "$SELF_DIR/packages/server/src/index.js" ]]; then
  PKG_DIR="$SELF_DIR"
else
  PKG_DIR="$(cd -- "$SELF_DIR/.." && pwd -P)"
fi

# 本部认定：包内 data/ 只剩本部目录（打包层已剪别部）。1.x=forest / 2.x=light / 3.x=ice
# 共用本脚本，服务名与首关都由此推导，不硬编码。
TEMPLE=""
for t in forest light ice; do
  if [[ -d "$PKG_DIR/data/$t" ]]; then
    if [[ -n "$TEMPLE" ]]; then TEMPLE=""; break; fi   # 多部同时存在 → 不是单部分包
    TEMPLE="$t"
  fi
done
[[ -n "$TEMPLE" ]] || { echo "✗ 无法从 data/ 认定本部（期望恰好一个 forest|light|ice 目录）"; exit 1; }

SERVICE_NAME="gy-fw-${TEMPLE}"
PORT=2567
BIND_HOST="127.0.0.1"
MODE="service"          # service | foreground | verify-only
EXTRA_ENV=()

c_red()   { printf '\033[31m%s\033[0m\n' "$*"; }
c_green() { printf '\033[32m%s\033[0m\n' "$*"; }
c_step()  { printf '\n\033[36m==> %s\033[0m\n' "$*"; }
die()     { c_red "✗ $*"; exit 1; }

while [[ $# -gt 0 ]]; do
  case "$1" in
    --port)        PORT="${2:?--port 需要端口号}"; shift 2 ;;
    --public)      BIND_HOST="0.0.0.0"; shift ;;
    --no-service)  MODE="foreground"; shift ;;
    --verify-only) MODE="verify-only"; shift ;;
    --trust-proxy) EXTRA_ENV+=("FW_TRUST_PROXY=1"); shift ;;
    --origins)     EXTRA_ENV+=("FW_ALLOWED_ORIGINS=${2:?--origins 需要域名}"); shift 2 ;;
    *)             die "未知参数：$1（--help 看用法）" ;;
  esac
done

# ---------------------------------------------------------------- 1. 前置自检
c_step "1/4 前置自检"
[[ "$(uname -s)" == "Linux" ]] || die "仅支持 Linux（当前 $(uname -s)）"
[[ "$(uname -m)" == "x86_64" ]] || die "仅支持 x86_64（当前 $(uname -m)）；其他架构需在包根跑 npm ci --omit=dev 重装依赖"

NODE_BIN="$(command -v node || true)"
[[ -n "$NODE_BIN" ]] || die "找不到 node，请先安装 Node.js ≥ 22.12"
NODE_VER="$("$NODE_BIN" -p 'process.versions.node')"
"$NODE_BIN" -e '
  const [maj, min] = process.versions.node.split(".").map(Number);
  process.exit(maj > 22 || (maj === 22 && min >= 12) ? 0 : 1);
' || die "Node 版本过低：$NODE_VER（需 ≥ 22.12）"
echo "  node $NODE_VER  ✓"

[[ -f "$PKG_DIR/packages/server/src/index.js" ]] \
  || die "包不完整：缺 packages/server/src/index.js（1.0.1+ 预转译布局）"

if [[ "$MODE" == "service" || "$MODE" == "verify-only" ]]; then
  [[ "$(id -u)" == "0" ]] || die "装 systemd 服务需要 root：sudo ./deploy.sh"
fi

if [[ "$MODE" != "verify-only" ]]; then
  if ss -tln 2>/dev/null | awk '{print $4}' | grep -qE "[:.]${PORT}\$"; then
    die "端口 $PORT 已被占用。查占用：ss -tlnp | grep :$PORT  然后 kill 掉，或换 --port"
  fi
  echo "  端口 $PORT 空闲  ✓"
fi

# sha256 自校验（只在包旁有 .sha256 时做）
SHA_FILE="$(ls "$PKG_DIR/../$(basename "$PKG_DIR").tar.gz.sha256" 2>/dev/null || true)"
if [[ -n "$SHA_FILE" ]]; then
  echo "  包校验和文件在旁：跳过（解包后无法回溯 tar 字节）"
fi
echo "  安装目录：$PKG_DIR"

# ---------------------------------------------------------------- 2. systemd
UNIT_PATH="/etc/systemd/system/${SERVICE_NAME}.service"

write_unit() {
  c_step "2/4 生成 systemd 服务"
  local env_lines="Environment=PORT=${PORT}"$'\n'"Environment=FW_HOST=${BIND_HOST}"
  local e
  for e in "${EXTRA_ENV[@]+"${EXTRA_ENV[@]}"}"; do
    env_lines+=$'\n'"Environment=${e}"
  done
  cat > "$UNIT_PATH" <<UNIT
[Unit]
Description=gy no FW ${TEMPLE} server
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=${PKG_DIR}
${env_lines}
ExecStart=${NODE_BIN} packages/server/src/index.js
Restart=always
RestartSec=3
User=nobody
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ReadWritePaths=${PKG_DIR}

[Install]
WantedBy=multi-user.target
UNIT
  chmod 0644 "$UNIT_PATH"
  systemctl daemon-reload
  systemctl enable "$SERVICE_NAME" >/dev/null 2>&1
  echo "  写入 $UNIT_PATH"
  echo "  监听 ${BIND_HOST}:${PORT}"
}

start_service() {
  systemctl restart "$SERVICE_NAME"
  local i
  for i in $(seq 1 30); do
    if curl -sf "http://127.0.0.1:${PORT}/healthz" >/dev/null 2>&1; then
      echo "  服务就绪（${i}s）  ✓"
      return 0
    fi
    sleep 1
  done
  c_red "服务 30s 内未就绪，最近日志："
  journalctl -u "$SERVICE_NAME" -n 30 --no-pager || true
  return 1
}

case "$MODE" in
  service)
    write_unit
    c_step "3/4 启动服务"
    start_service || die "服务启动失败（见上方日志）"
    ;;
  foreground)
    c_step "2-3/4 前台试跑（Ctrl+C 结束）"
    PORT=$PORT FW_HOST=$BIND_HOST "$NODE_BIN" "$PKG_DIR/packages/server/src/index.js" &
    FG_PID=$!
    trap 'kill $FG_PID 2>/dev/null || true' EXIT
    for i in $(seq 1 30); do
      curl -sf "http://127.0.0.1:${PORT}/healthz" >/dev/null 2>&1 && break
      sleep 1
    done
    ;;
  verify-only)
    c_step "2-3/4 跳过安装（--verify-only）"
    ;;
esac

# ---------------------------------------------------------------- 4. 验收
c_step "4/4 验收（DEPLOY §5 六步 + 真开局双人 patch）"
VERIFY_ARGS=(--base "http://127.0.0.1:${PORT}")
if [[ ! -d "$PKG_DIR/node_modules/playwright" ]]; then
  VERIFY_ARGS+=(--no-browser)
fi

set +e
"$NODE_BIN" "$PKG_DIR/scripts/verify.mjs" "${VERIFY_ARGS[@]}"
RC=$?
set -e

echo
if [[ $RC -eq 0 ]]; then
  c_green "════════════════════════════════════════════"
  c_green " ✓ 部署完成，验收全绿"
  c_green "════════════════════════════════════════════"
  if [[ "$BIND_HOST" == "0.0.0.0" ]]; then
    IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
    echo "  玩家地址：http://${IP:-<本机IP>}:${PORT}"
    echo "  记得放行防火墙：ufw allow ${PORT}/tcp  （或对应云厂商安全组）"
  else
    echo "  仅本机可访问。对外请加 --public，或置于 nginx 反代后。"
  fi
  [[ "$MODE" == "service" ]] && echo "  日志：journalctl -u ${SERVICE_NAME} -f"
  [[ "$MODE" == "service" ]] && echo "  停机：systemctl stop ${SERVICE_NAME}"
  exit 0
else
  c_red "════════════════════════════════════════════"
  c_red " ✗ 验收未通过（退出码 $RC）"
  c_red "════════════════════════════════════════════"
  echo "  常见原因见 DEPLOY.md §7 故障速查。"
  [[ "$MODE" == "service" ]] && echo "  服务日志：journalctl -u ${SERVICE_NAME} -n 50 --no-pager"
  exit "$RC"
fi
