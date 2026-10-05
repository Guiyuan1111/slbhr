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

## 视觉差分基准

```bash
node --import tsx benchmark/visual-diff.mjs --save visual-r7
```

forest_01 就绪后第 60 物理帧（无输入 idle）对 canvas 元素截图：原版侧 capture.mjs
同款基建（8787 静态服 + temple 跳关 + 物理步计数钩子），我方侧 2567 服务器 +
双浏览器入房。页内 480×360 灰度归一 + ±48px 平移搜索取最优对齐，报告容差
24/48 匹配率。**视觉复刻度指数 = 容差48匹配率**。

- 实测（0.3.6）：最优平移 (−1,−2)（镜头取景几乎一致）、全帧匹配率 86.63%、
  顶部 HUD 带 76.58%（原版画布内 HUD 为已知系统性差异）。
- 原版侧注意：/multiplayer.js 在 output/ 父目录（静态服需父目录回退）；须等 menu
  资产加载空闲（load.isLoading===false）再跳关，否则 menu 残留 loader 回调会在
  level 加载完成时引爆并中断派发链。
- 截图证据：results/visual-original.png / visual-ours.png。

## 快照索引

| 快照 | git | 综合指数 | 说明 |
|---|---|---|---|
| v0.3.4 | 8a49d81 | 82.55 | 优化前基线 |
| r1-settle5 | 82f3dd6 前 | 82.51 | settle 相位证据修正 |
| r2-wind | 1f22a99 | 84.57 | 风场阻尼/限速 |
| r4-final | 82f3dd6 | 84.57 | 第二轮起点 |
| r6-final | 3c55a20 | 84.53 | pusher 保真修复 + lever 判定存档 |
| visual-r7 | 3c55a20 | 86.63 | 视觉差分基线（容差48匹配率，独立维度） |
| visual-r8 | 3fe1da9 | 86.62 | 时钟位图字保真 + 网格热图诊断 |
| visual-r9 | 0.3.8 | 94.91 | 1280×960 原版几何画布（+8.3） |

## 注意

- 输入对齐 INPUT_SHIFT 默认 +1（实测标定），可用 `DIFF_SHIFT` 环境变量覆盖。
- fidelity-score settle=5 帧（金轨迹 f0=起跑后第 5 帧，实证见报告 §四 R1）；bonus_2 类重箱关的 settle 敏感性见对比报告。
- 本基准只读（不改内核/金轨迹），稳定性红线无关项。
