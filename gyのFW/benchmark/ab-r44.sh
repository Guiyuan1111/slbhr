#!/usr/bin/env bash
# r44 配对 A/B 台架（内容回退法，非检出法）。
#
# 为什么需要它：r44 优化幅度在 percent 级，而 perf-r44 单次运行的臂间噪声实测可达
# ±5%（同日同机两跑 0.05486 vs 0.05230ms）。跨提交/跨时段直比会把噪声读成收益
# （战役支柱 2 / r18 的 446ms 教训）。因此：
#   - 两臂**在同一会话内交替**跑（A B A B A B），消解时段漂移；
#   - 每臂取多次的**中位数**，并打印臂内散布，散布 ≥ 臂间差时拒绝给结论；
#   - 用**内容回退**换臂（git show <rev>:<file> > <file>），不切工作树——避免
#     meta.git 记成检出 HEAD 而非内容提交的旧坑（r16 勘误③）。
#
# 用法：
#   bash benchmark/ab-r44.sh <基线提交> [轮次=3] [--save 前缀]
# 例：
#   bash benchmark/ab-r44.sh 6c65c8d 3
#
# 环境：需 --expose-gc（脚本内置）；PERF_R44_TEMPLE / PERF_R44_STEPS 可透传。
set -uo pipefail

BASE_REV="${1:?用法: ab-r44.sh <基线提交> [轮次] [--save 前缀]}"
ROUNDS="${2:-3}"
SAVE="${4:-ab}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# 参与换臂的文件（相对仓库根）——r44 各轮改动面登记于此
FILES=(
  packages/shared/src/kernel/world.ts
  packages/shared/src/kernel/mechanisms.ts
)

BACKUP="$(mktemp -d)"
trap 'restore; rm -rf "$BACKUP"' EXIT

save_current() { for f in "${FILES[@]}"; do mkdir -p "$BACKUP/cur/$(dirname "$f")"; cp "$f" "$BACKUP/cur/$f"; done; }
restore()     { [ -d "$BACKUP/cur" ] && for f in "${FILES[@]}"; do cp "$BACKUP/cur/$f" "$f"; done; }
to_base()     { for f in "${FILES[@]}"; do git show "$BASE_REV:./$f" > "$f" || { echo "!! 取基线失败: $f@$BASE_REV"; exit 1; }; done; }

save_current
echo "基线 = $BASE_REV；轮次 = $ROUNDS；文件 = ${#FILES[@]} 件"

run_arm() { # $1=arm(A=基线 B=当前) $2=round
  local arm="$1" r="$2"
  if [ "$arm" = "A" ]; then to_base; else restore; fi
  # 基线臂存档不覆盖当前臂；用统一前缀 + 臂字母 + 轮次
  node --expose-gc --import tsx benchmark/perf-r44.mjs --save "${SAVE}-${arm}${r}" >"$BACKUP/log-${arm}${r}.txt" 2>&1
  local rc=$?
  if [ $rc -ne 0 ]; then echo "!! $arm$r 失败（rc=$rc），日志 $BACKUP/log-${arm}${r}.txt"; tail -5 "$BACKUP/log-${arm}${r}.txt"; return $rc; fi
  echo "  $arm$r 完成"
}

for r in $(seq 1 "$ROUNDS"); do
  run_arm A "$r" || exit 1
  run_arm B "$r" || exit 1
done
restore
echo "已恢复当前代码（工作区应与跑之前一致）"

# 汇总：读快照，按部取两臂中位数，并给出臂内散布
node --input-type=module -e "
import { readFileSync, existsSync } from 'node:fs';
const rounds = $ROUNDS, pref = '$SAVE';
const arms = { A: [], B: [] };
for (const arm of ['A','B']) for (let r = 1; r <= rounds; r++) {
  const p = 'benchmark/results/r44-' + pref + '-' + arm + r + '.json';
  if (!existsSync(p)) { console.error('缺快照', p); process.exit(1); }
  arms[arm].push(JSON.parse(readFileSync(p, 'utf8')));
}
const med = (a) => { const s=[...a].sort((x,y)=>x-y); return s[Math.floor(s.length/2)]; };
const spread = (a) => { const s=[...a].sort((x,y)=>x-y); return s[s.length-1]-s[0]; };
const temples = Object.keys(arms.A[0].byTemple);
console.log('\n===== 配对 A/B（中位，' + rounds + ' 轮/臂，交替执行）=====');
console.log('部'.padEnd(12) + 'A 基线'.padStart(12) + 'B 优化'.padStart(12) + 'Δ%'.padStart(9) + '  A散布'.padStart(10) + 'B散布'.padStart(10) + '  判定');
let anyClaim = false;
for (const t of temples) {
  const a = med(arms.A.map(x => x.byTemple[t].scrAvgMs));
  const b = med(arms.B.map(x => x.byTemple[t].scrAvgMs));
  const sa = spread(arms.A.map(x => x.byTemple[t].scrAvgMs));
  const sb = spread(arms.B.map(x => x.byTemple[t].scrAvgMs));
  const d = (b - a) / a * 100;
  const noise = Math.max(sa, sb) / a * 100;
  const verdict = Math.abs(d) >= noise ? (d < 0 ? '可主张 ↓' : '可主张 ↑') : '带内（不下判）';
  if (verdict.startsWith('可主张')) anyClaim = true;
  console.log(t.padEnd(12) + a.toFixed(5).padStart(12) + b.toFixed(5).padStart(12) + (d>=0?'+':'') + d.toFixed(1).padStart(8) + '%' + sa.toFixed(5).padStart(10) + sb.toFixed(5).padStart(10) + '  ' + verdict);
}
const aAll = med(arms.A.map(x => x.overall.scrAvgMs));
const bAll = med(arms.B.map(x => x.overall.scrAvgMs));
const sAll = Math.max(spread(arms.A.map(x => x.overall.scrAvgMs)), spread(arms.B.map(x => x.overall.scrAvgMs)));
const dAll = (bAll - aAll) / aAll * 100;
console.log('\n全库 scripted：' + aAll.toFixed(5) + ' → ' + bAll.toFixed(5) + '（' + (dAll>=0?'+':'') + dAll.toFixed(2) + '%，最大臂内散布 ' + sAll.toFixed(5) + '）');
console.log(Math.abs(dAll) >= sAll / aAll * 100 ? '→ 超出噪声，可主张' : '→ 未超出臂内散布，不主张');
"
