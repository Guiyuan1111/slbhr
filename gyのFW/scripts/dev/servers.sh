#!/usr/bin/env bash
# 常驻开发服务器管理：游玩服(3700) + oracle 只读伺服(8787)。
# 用法：scripts/dev/servers.sh {start|stop|status|restart} [play|oracle|all]
#   缺省目标 all。start 幂等（已在跑则跳过）；stop 幂等；status 附带 HTTP 探活。
# pidfile/日志落 TEMP/（gitignore 内），进程用 nohup 脱离会话，终端关闭不影响。
set -u
cd "$(dirname "$0")/../.."   # → gyのFW 仓库根
mkdir -p TEMP                # 干净 checkout 无 TEMP/，pidfile/日志写入会失败（#37）

PLAY_PID="TEMP/play-server.pid"
ORACLE_PID="TEMP/oracle-serve.pid"
PLAY_LOG="TEMP/play-server.log"
ORACLE_LOG="TEMP/oracle-serve.log"

alive() { [ -f "$1" ] && kill -0 "$(cat "$1")" 2>/dev/null; }

# 端口当前监听者的 pid（残留检测）。Linux 走 ss；Git Bash/Windows 无 ss，兜底 netstat -ano。
# 拿不到（命令缺失/权限不足）返回空，调用方按"无残留"处理。
port_listener_pid() {
  if command -v ss >/dev/null 2>&1; then
    ss -tlnp 2>/dev/null | grep ":$1 " | grep -oP 'pid=\K[0-9]+' | head -1
  elif command -v netstat >/dev/null 2>&1; then
    netstat -ano 2>/dev/null | grep -iE "tcp[[:space:]].*[:.]$1[[:space:]]" | grep -i LISTENING | awk '{print $NF}' | head -1
  fi
}

start_one() {
  local name="$1" pidfile="$2" log="$3"; shift 3
  if alive "$pidfile"; then
    echo "[$name] 已在跑 (pid $(cat "$pidfile"))，跳过"
    return
  fi
  # 清理无 pidfile 的残留监听（此前手工 nohup 起的进程）
  local port="$1"; shift
  local old
  old=$(port_listener_pid "$port" | head -1)
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
  local name="$1" pidfile="$2" port="$3"
  if alive "$pidfile"; then
    local pid
    pid=$(cat "$pidfile")
    kill "$pid" 2>/dev/null
    # 等进程真正退出再返回（M-04：此前 npx tsx 四层进程链只杀最外层，node 孙进程
    # 孤儿占端口；现统一 node --import tsx 单进程，kill 直接命中服务进程）。
    local i
    for i in 1 2 3 4 5 6 7 8 9 10; do
      kill -0 "$pid" 2>/dev/null || break
      sleep 1
    done
    if kill -0 "$pid" 2>/dev/null; then
      kill -9 "$pid" 2>/dev/null
      echo "[$name] 10s 未退，已 SIGKILL"
    fi
    rm -f "$pidfile"
    echo "[$name] 已停止"
  else
    rm -f "$pidfile"
    echo "[$name] 未在跑"
  fi
  # 端口释放兜底：colyseus 优雅停机是异步的，立刻 restart 会撞 EADDRINUSE
  if [ -n "$port" ]; then
    local i
    for i in 1 2 3 4 5; do
      [ -z "$(port_listener_pid "$port")" ] && break
      sleep 1
    done
    local stale
    stale=$(port_listener_pid "$port" | head -1)
    if [ -n "$stale" ]; then echo "[$name] 警告：端口 $port 仍被 pid=$stale 监听"; fi
  fi
}

status_one() {
  local name="$1" pidfile="$2" url="$3" port="$4"
  if alive "$pidfile"; then
    local code
    code=$(curl -s -o /dev/null -w '%{http_code}' --connect-timeout 3 "$url" 2>/dev/null)
    echo "[$name] pid $(cat "$pidfile")，HTTP $code"
  elif [ -n "$(port_listener_pid "$port")" ]; then
    echo "[$name] 无 pidfile 但端口 $port 有监听（旧进程），可 restart 接管"
  else
    echo "[$name] 未在跑"
  fi
}

do_play() {
  case "${1:-}" in
    # node --import tsx：进程内加载 TS，单进程无 CLI 孙进程（M-04）——kill 即真正杀掉
    # 服务器；npx tsx 会派生 node 子进程，stop 后变孤儿霸占端口（实测坑，同 e2e/lib.mjs）
    start)  start_one play "$PLAY_PID" "$PLAY_LOG" 3700 PORT=3700 FW_HOST=127.0.0.1 node --import tsx packages/server/src/index.ts ;;
    stop)   stop_one play "$PLAY_PID" 3700 ;;
    status) status_one play "$PLAY_PID" http://127.0.0.1:3700/ 3700 ;;
  esac
}

do_oracle() {
  case "${1:-}" in
    start)  start_one oracle "$ORACLE_PID" "$ORACLE_LOG" 8787 node scripts/baseline/serve-original.mjs ;;
    stop)   stop_one oracle "$ORACLE_PID" 8787 ;;
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
