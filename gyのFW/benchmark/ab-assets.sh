#!/bin/bash
# 同场 A/B/A「只换资产」复测台（r19 立，口径见 note/report/perf/2026-10-21-r19-font-atlas-reflow.md §五之一）。
#
# 与 benchmark/load-ab-era.sh 的分工：那一台交替**源码代次**（要重建两次，两条臂的 JS bundle 也各自换代号）；
# 这一台只换 `packages/client/dist` 里的资产对，**三次运行的 JS bundle 逐字节相同**——
# 于是两条臂之间唯一的自变量就是那份资产本身。适合判"位图幅面/编码变了到底省不省驻留"这类资产轴问题。
#
# 用法：
#   ASSETS="assets/fonts/chinese/font-prephase.png assets/fonts/chinese/font-prephase.fnt" \
#   ARM_A_DIR=TEMP/ab-a TOOL=perf-resident LABEL_A=ab-a-prev LABEL_B=ab-b-cur LABEL_C=ab-c-prev \
#     ./benchmark/ab-assets.sh
#   - ASSETS：dist 相对路径（空格分隔），两条臂都按 basename 取文件；
#   - ARM_A_DIR：臂 A（上一代）那份资产所在目录，臂 B 恒为当前 dist 内容；
#   - TOOL：perf-resident（默认）或 perf-load，都用 --no-build；
#   - 快照标签即 --save 的标签，产物落 benchmark/results/。
#
# 硬门（脚本自己判，不靠人记）：
#   1) 三条臂的 dist 入口 chunk 指纹必须逐字符相同，否则说明换臂把 JS 也带跑了，直接中止；
#   2) 收尾把现役资产装回并复算指纹，与开工时不符即报错——绝不把换臂状态留在 dist 里。
set -u
cd "$(dirname "$0")/.."

: "${ASSETS:?请设 ASSETS=空格分隔的 dist 相对路径}"
: "${ARM_A_DIR:?请设 ARM_A_DIR=臂 A 资产所在目录}"
TOOL="${TOOL:-perf-resident}"
LABEL_A="${LABEL_A:-ab-a}"; LABEL_B="${LABEL_B:-ab-b}"; LABEL_C="${LABEL_C:-ab-a2}"
DIST=packages/client/dist
[ -d "$DIST" ] || { echo "dist 不存在，先 npm run build" >&2; exit 1; }
[ -d "$ARM_A_DIR" ] || { echo "臂 A 目录不存在：$ARM_A_DIR" >&2; exit 1; }

fp () { sha256sum "$DIST/assets/$(ls "$DIST/assets" | grep -E '^index-.*\.js$' | head -1)" | cut -c1-16; }
BUNDLE0=$(fp)

BK=$(mktemp -d)
restore () {
  for p in $ASSETS; do
    [ -f "$BK/cur-$(basename "$p")" ] || continue
    cp "$BK/cur-$(basename "$p")" "$DIST/$p" || { echo "收尾装回 $p 失败，须人工核查 dist" >&2; exit 1; }
  done
  [ "$(fp)" = "$BUNDLE0" ] || { echo "收尾指纹漂移：JS bundle 被换臂动过，须人工核查 dist" >&2; exit 1; }
  for p in $ASSETS; do echo "restored $(basename "$p") sha=$(sha256sum "$DIST/$p" | cut -c1-12)"; done
  rm -rf "$BK"
}

# 先把资产对校验干净，再武装 trap——否则缺件时 trap 会打印一条它并没有做到的 "restored"
for p in $ASSETS; do
  [ -f "$DIST/$p" ] || { echo "dist 缺 $p（该资产可能不在当前构建里）" >&2; exit 1; }
  [ -f "$ARM_A_DIR/$(basename "$p")" ] || { echo "臂 A 缺 $(basename "$p")" >&2; exit 1; }
done
trap restore EXIT
for p in $ASSETS; do cp "$DIST/$p" "$BK/cur-$(basename "$p")"; done
echo "开工：入口指纹=$BUNDLE0（三次必须相同）"

arm () { # $1=a|b  $2=快照标签
  for p in $ASSETS; do
    if [ "$1" = a ]; then cp "$ARM_A_DIR/$(basename "$p")" "$DIST/$p"; else cp "$BK/cur-$(basename "$p")" "$DIST/$p"; fi
  done
  local got; got=$(fp)
  [ "$got" = "$BUNDLE0" ] || { echo "臂 $2 入口指纹变成 $got，中止：换臂把 JS 带跑了" >&2; exit 1; }
  echo "===== [$2] arm=$1 资产 sha=$(for p in $ASSETS; do printf '%s:%s ' "$(basename "$p")" "$(sha256sum "$DIST/$p" | cut -c1-12)"; done) ====="
  node --import tsx "benchmark/$TOOL.mjs" --no-build --save "$2"
}

arm a "$LABEL_A"
arm b "$LABEL_B"
arm a "$LABEL_C"
echo "A/B/A DONE：同臂（$LABEL_A↔$LABEL_C）之差即本机漂移带，跨臂差只有超出该带才可主张"
