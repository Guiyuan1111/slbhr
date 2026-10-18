#!/usr/bin/env bash
# r7a build 分布测量（perfopt7 槽，挂账②）：npm run build 连跑分布 + 清 node_modules/.vite 对照。
# 只测量不改动产物口径；dist 指纹校验产物逐字节稳定。
# 用法：bash note/report/perf/tools/perfopt7/build-dist.sh [组标签]
set -u
cd "$(dirname "$0")/../../../.." || exit 1
LABEL="${1:?组标签，如 warm 或 novite}"
echo "== build-dist 组=$LABEL git=$(git rev-parse --short HEAD) node=$(node -v) 核=$(nproc) load=$(cut -d' ' -f1-3 /proc/loadavg)"
echo "cpu: $(lscpu | grep -m1 'Model name' | sed 's/.*: //')"

fp() { find packages/client/dist -type f -print0 2>/dev/null | sort -z | xargs -0 sha256sum 2>/dev/null | sha256sum | cut -c1-16; }

export TIMEFORMAT='%R %U %S'
for i in 1 2 3 4 5; do
  S=$(date +%s.%N)
  T=$( { time npm run build > /dev/null 2>&1; } 2>&1 )
  E=$(date +%s.%N)
  echo "run$i wall=$(echo "$E - $S" | bc) time(real user sys)=$T fp=$(fp)"
done
