#!/bin/bash
# 从 oracle B bundle 整块切出 27 个 Devices 模块（RE 用，oracle 只读）。
# 用法：bash extract-devices.sh /tmp/bdev
OUT="${1:-/tmp/bdev}"; mkdir -p "$OUT"
cd /home/gy/桌面/dev/slbhr/Fireboy-and-Watergirl/output/B
grep -bo 'define("States/Level/Devices/[A-Za-z]*"' js/init.*.js | sed 's/define("States\/Level\/Devices\///;s/"//' | awk -F: '{print $2, $1}' | sort > /tmp/b-devices.txt
python3 - "$OUT" <<'PY'
import sys
out = sys.argv[1]
s = open('js/init.9f90a1e8c8c137c8.js', encoding='utf-8', errors='replace').read()
rows = []
for line in open('/tmp/b-devices.txt'):
    name, off = line.split()
    rows.append((name, int(off)))
rows.sort(key=lambda r: r[1])
for i, (name, off) in enumerate(rows):
    end = rows[i+1][1] if i+1 < len(rows) else len(s)
    open(f'{out}/{name}.js', 'w', encoding='utf-8').write(s[off:end])
print(len(rows), 'modules →', out)
PY
