#!/bin/bash
# 同场 A/B/A 跨代复测（r18 立，口径见 note/report/perf/2026-10-21-r18-font-two-phase.md §五之一）：
# 把两个源码代次在同一台机器、同一段时间窗里交替构建并测 perf-load，
# 用来判定跨快照的 ms 差到底是代价还是漂移。r18 用它的三次交替（1716.5 / 1542.5 / 1270.5）
# 证明同一份产物两次跑就能差 446ms，远宽于 ±120ms 带 ⇒ 跨快照 ms 比较不算证据。
#
# 用法：
#   FILES="packages/client/src/a.ts packages/client/src/b.ts" \
#   ERA_A=<臂A 的源码代次提交>  ./benchmark/load-ab-era.sh
# 臂B 恒为当前工作树源码。
# 档位透传：EXTRA_ARGS="--net 4g" 让三臂跑同一节流档（r21 加，与 ab-assets.sh 同式；
# 换臂不动它，故三臂档位一致——弱网档的漂移带比本机 off 窄一个量级，见 r20 §五之一）。
# 量具选择（r34 加）：TOOL=perf-load（默认）或 perf-resident——两者都支持 --no-build/--save，
# 且都按同一 FILES 换臂；驻留档的档位参数无意义，EXTRA_ARGS 留空即可。
#
# 安全约束：本脚本会用 `git checkout <rev> -- $FILES` 临时改写工作树并在收尾恢复。
# 共享工作树里这有风险，故开工前强制要求 $FILES 无未提交改动，否则直接退出。
set -u
cd "$(dirname "$0")/.."

: "${FILES:?请设 FILES=空格分隔的源码路径}"
: "${ERA_A:?请设 ERA_A=臂A 的源码代次提交}"
LABEL_A="${LABEL_A:-era-a}"
LABEL_B="${LABEL_B:-era-b}"
LABEL_C="${LABEL_C:-era-a2}"
EXTRA_ARGS="${EXTRA_ARGS:-}"
TOOL="${TOOL:-perf-load}"

dirty=$(git status --porcelain -- $FILES)
if [ -n "$dirty" ]; then
  echo "拒绝运行：FILES 里有未提交改动，交替改写会丢工作" >&2
  echo "$dirty" >&2
  exit 1
fi

BK=$(mktemp -d)
# 备份必须保留原路径：旧写法 `cp $FILES $BK/` + `cp $BK/*.ts packages/client/src/` 把
# packages/client/src/scenes/*.ts 摊平回了 src/ 根目录——臂2/收尾的"恢复"于是写出不存在的
# 文件、真正的 scenes 文件却停在臂A 代次（r21 换臂前自查发现，未跑成即拦住）。
restore () { for f in $FILES; do cp "$BK/$f" "$f" 2>/dev/null; done; }
trap 'restore; rm -rf "$BK"' EXIT
for f in $FILES; do
  [ -f "$f" ] || { echo "FILES 里找不到 $f" >&2; exit 1; }
  mkdir -p "$BK/$(dirname "$f")"; cp "$f" "$BK/$f" || exit 1
done
echo "已备份现役源码（保留路径）→ $BK"

build_and_measure () { # $1 = label, $2 = 说明
  npm run build >/dev/null 2>&1 || { echo "构建失败 $1"; exit 1; }
  local chunk; chunk=$(ls packages/client/dist/assets/index-*.js | head -1)
  echo "[$1] dist 入口=$(basename "$chunk") $2"
  node --import tsx "benchmark/$TOOL.mjs" --no-build --save "$1" $EXTRA_ARGS 2>&1 | tail -3
}

echo "===== 臂1 $LABEL_A（源码代 $ERA_A）====="
git checkout "$ERA_A" -- $FILES && build_and_measure "$LABEL_A" "臂A"

echo "===== 臂2 $LABEL_B（当前工作树源码）====="
restore && build_and_measure "$LABEL_B" "臂B"

echo "===== 臂3 $LABEL_C（$ERA_A 复测，用来框住漂移）====="
git checkout "$ERA_A" -- $FILES && build_and_measure "$LABEL_C" "臂A 复测"

echo "===== 收尾：恢复工作树并重建 ====="
restore
git reset -q HEAD -- $FILES   # 只退索引，不动工作树：让 git status 回到干净基线
if [ -n "$(git status --porcelain -- $FILES)" ]; then
  echo "⚠ 收尾核验失败：$FILES 仍有差异，请手工核对" >&2
  git status --short -- $FILES
else
  echo "✓ 收尾核验：$FILES 与 HEAD 逐字节一致（工作树已回到现役源码）"
fi
npm run build >/dev/null 2>&1 && echo "已按现役源码重建 dist：$(basename "$(ls packages/client/dist/assets/index-*.js | head -1)")"
echo "A/B/A DONE：三份快照同名前缀，比 ms 只看 臂1↔臂3 的带宽，臂间差超出该带才算差异"
