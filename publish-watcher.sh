#!/usr/bin/env bash
# 设备码守望循环：持续发码直到用户完成授权，随后自动推送 + 发 Release。
# 当前设备码实时写入 publish-code.txt（仓库根目录）。
set -u
export PATH="$PATH:/c/Program Files/Git/cmd"
cd "$(dirname "$0")"
CODEFILE="publish-code.txt"
for i in $(seq 1 8); do
  echo "[$(date +%H:%M)] 第 $i 轮发码（每轮 15 分钟）" >> "$CODEFILE"
  printf 'y\n' | gh auth login --hostname github.com --git-protocol https --web > gh-login.log 2>&1 &
  GH_PID=$!
  # 等码出现并写入 codefile
  sleep 6
  grep -oE "[A-Z0-9]{4}-[A-Z0-9]{4}" gh-login.log | head -1 > "$CODEFILE"
  echo "当前设备码：$(cat "$CODEFILE") → https://github.com/login/device" >> "$CODEFILE"
  # 等 gh 进程结束（成功=授权完成；超时=换下一轮）
  wait $GH_PID
  if gh auth status >/dev/null 2>&1; then
    echo "AUTHORIZED" > "$CODEFILE"
    echo "授权成功！执行发布…"
    bash publish-0.3.0.sh && { echo "PUBLISH DONE" >> "$CODEFILE"; exit 0; }
  fi
done
echo "EXPIRED ALL ROUNDS" >> "$CODEFILE"
