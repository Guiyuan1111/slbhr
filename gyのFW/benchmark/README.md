# benchmark · 复刻度量化基准

对 5 条官方原版金轨迹（`scripts/baseline/golden/*_fixeddt.json`）逐帧对拍内核，
产出可追踪的**复刻度指数（0-100）**与逐体指标，用于量化每一轮优化的前后对比。

## 用法

```bash
export PATH="$PWD/TEMP/node:$PATH"

node benchmark/fidelity-score.mjs                    # 跑分打印
node benchmark/fidelity-score.mjs --save v0.3.4      # 存快照 benchmark/results/<label>.json
node benchmark/fidelity-score.mjs --compare v0.3.4   # 与快照对比（优化前后表）
```

## 指标口径

| 指标 | 含义 | 备注 |
|---|---|---|
| maxDisp | 逐帧位置误差峰值（m） | 混沌瞬态敏感 |
| finalDisp | 末帧位置误差（m） | 终态保真，最强信号 |
| trajRMS | 全帧位置误差均方根（m） | 持续性漂移敏感 |
| maxDv | 速度误差峰值（m/s） | 冲击/弹跳差异敏感 |

评分平滑单调：`bodyScore = 100·exp(−max(0, maxDisp−0.05)/0.6)`，
`endScore = 100·exp(−max(0, finalDisp−0.02)/0.3)`；
综合复刻度 = 0.6·mean(bodyScore) + 0.4·mean(endScore)。

## 快照索引

| 快照 | git | 综合指数 | 说明 |
|---|---|---|---|
| v0.3.4 | 8a49d81 | （见 results/v0.3.4.json） | 优化前基线 |

## 注意

- 输入对齐 INPUT_SHIFT 默认 +1（实测标定），可用 `DIFF_SHIFT` 环境变量覆盖。
- settle=60 帧（对齐原版开局未采样帧）；bonus_2 类重箱关的 settle 敏感性见对比报告。
- 本基准只读（不改内核/金轨迹），稳定性红线无关项。
