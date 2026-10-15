#!/usr/bin/env bash
# 常驻开发服务器管理：游玩服(3700) + oracle 只读伺服(8787)。
# 用法：scripts/dev/servers.sh {start|stop|status|restart} [play|oracle|all]
#   缺省目标 all。start 幂等（已在跑则跳过）；stop 幂等；status 附带 HTTP 探活。
# pidfile/日志落 TEMP/（gitignore 内），进程用 nohup 脱离会话，终端关闭不影响。
set -u
cd "$(dirname "$0")/../.."   # → gyのFW 仓库根

PLAY_PID="TEMP/play-server.pid"
ORACLE_PID="TEMP/oracle-serve.pid"
PLAY_LOG="TEMP/play-server.log"
ORACLE_LOG="TEMP/oracle-serve.log"

alive() { [ -f "$1" ] && kill -0 "$(cat "$1")" 2>/dev/null; }

start_one() {
  local name="$1" pidfile="$2" log="$3"; shift 3
  if alive "$pidfile"; then
    echo "[$name] 已在跑 (pid $(cat "$pidfile"))，跳过"
    return
  fi
  # 清理无 pidfile 的残留监听（此前手工 nohup 起的进程）
  local port="$1"; shift
  local old
  old=$(ss -tlnp 2>/dev/null | grep ":$port " | grep -oP 'pid=\K[0-9]+' | head -1 || true)
  if [ -n "$old" ]; then
    echo "[$name] 发现无 pidfile 残留进程 pid=$old，接管"
    kill "$old" 2>/dev/null; sleep 1
  fi
  nohup env "$@" >>"$log" 2>&1 &
  echo $! >"$pidfile"
  sleep 2
  if alive "$pidfile"; then echo "[$name] 已启动 (pid $(cat "$pidfile"))，日志 $log"
  else echo "[$name] 启动失败，见 $log"; rm -f "$pidfile"; return 1; fi
}

stop_one() {
  local name="$1" pidfile="$2"
  if alive "$pidfile"; then
    kill "$(cat "$pidfile")" 2>/dev/null
    rm -f "$pidfile"
    echo "[$name] 已停止"
  else
    rm -f "$pidfile"
    echo "[$name] 未在跑"
  fi
}

status_one() {
  local name="$1" pidfile="$2" url="$3" port="$4"
  if alive "$pidfile"; then
    local code
    code=$(curl -s -o /dev/null -w '%{http_code}' --connect-timeout 3 "$url" 2>/dev/null)
    echo "[$name] pid $(cat "$pidfile")，HTTP $code"
  elif ss -tln 2>/dev/null | grep -q ":$port "; then
    echo "[$name] 无 pidfile 但端口 $port 有监听（旧进程），可 restart 接管"
  else
    echo "[$name] 未在跑"
  fi
}

do_play() {
  case "${1:-}" in
    start)  start_one play "$PLAY_PID" "$PLAY_LOG" 3700 PORT=3700 FW_HOST=127.0.0.1 npx tsx packages/server/src/index.ts ;;
    stop)   stop_one play "$PLAY_PID" ;;
    status) status_one play "$PLAY_PID" http://127.0.0.1:3700/ 3700 ;;
  esac
}

do_oracle() {
  case "${1:-}" in
    start)  start_one oracle "$ORACLE_PID" "$ORACLE_LOG" 8787 node scripts/baseline/serve-original.mjs ;;
    stop)   stop_one oracle "$ORACLE_PID" ;;
    status) status_one oracle "$ORACLE_PID" http://127.0.0.1:8787/ 8787 ;;
  esac
}

ACTION="${1:-status}"
# restart = stop 后 start（幂等基础上的语义糖）
[ "$ACTION" = "restart" ] && ACTION="stop%start"
TARGET="${2:-all}"
run_target() {
  case "$1" in
    play)   do_play "$2" ;;
    oracle) do_oracle "$2" ;;
  esac
}
case "$TARGET" in
  play|oracle)
    if [ "$ACTION" = "stop%start" ]; then run_target "$TARGET" stop; run_target "$TARGET" start
    else run_target "$TARGET" "$ACTION"; fi ;;
  all)
    if [ "$ACTION" = "stop%start" ]; then do_play stop; do_oracle stop; do_play start; do_oracle start
    else do_play "$ACTION"; do_oracle "$ACTION"; fi ;;
  *) echo "目标只能是 play|oracle|all"; exit 2 ;;
esac
