# benchmark · 复刻度量化基准

对 5 条官方原版金轨迹（`scripts/baseline/golden/*_fixeddt.json`）逐帧对拍内核，
产出可追踪的**复刻度指数（0-100）**与逐体指标，用于量化每一轮优化的前后对比。

## 用法

```bash
export PATH="$PWD/TEMP/node:$PATH"

node --import tsx benchmark/fidelity-score.mjs                    # 跑分打印
node --import tsx benchmark/fidelity-score.mjs --save v0.3.4      # 存快照 benchmark/results/<label>.json
node --import tsx benchmark/fidelity-score.mjs --compare v0.3.4   # 与快照对比（优化前后表）
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

## 性能基准（0.3.21 起，性能专项报告见 note/report/perf/2026-10-08-perf-optimization.md）

```bash
node --import tsx benchmark/perf-step.mjs --save <label>        # 服务端物理 step：48 关计时
node --import tsx benchmark/perf-determinism.mjs --compare <label>  # 位级一致门禁（引擎改动硬门）
node --import tsx benchmark/perf-load.mjs --save <label>        # 客户端加载（先构建再测）
```

- `perf-step`：每关预热 90 步 + 600 步计时（`PERF_STEPS`/`PERF_LEVELS` 可覆盖），
  产出 avg/p95/p99、每仿真秒物理占用；快照 `results/perf-<label>.json`。
- `perf-determinism`：48 关 × idle/scripted 双输入 × 600 步（`DET_STEPS` 可覆盖），
  每步全部刚体 6×f64 **原始位**链式哈希。**任何触碰物理路径的优化必须过本门**
  （--compare 退出码即结果）；快照 `results/det-<label>.json`。
- `perf-load`：构建产物冷启动（新 context）DCL/Menu/Game 激活、传输字节、请求数、
  reload 缓存命中；页面错误非空即失败。快照 `results/load-<label>.json`。

## 快照索引

git 列以快照 JSON `meta.git`（存档时脚本记录）为准；visual 系快照未记录 git，以版本号标注。
「—」= 该轮未另存快照（口径沿用上一归档值）。

| 快照 | git / 版本 | 综合指数 | 说明 |
|---|---|---|---|
| v0.3.4 | 8a49d81 | 82.55 | 物理优化前基线 |
| r1-settle5 | 8a49d81 | 82.51 | settle 相位证据修正（脚本参数，非增益项） |
| r2-wind | 1f22a99 | 84.57 | 风场阻尼/限速 |
| r4-final | 1f22a99 | 84.57 | 第二轮起点复跑 |
| r6-final | ebaebe1 | 84.53 | 推杆保真修复 + lever 判定存档（物理维度收敛值） |
| visual-r7 | 0.3.6 | 86.63 | 视觉差分基线（容差48匹配率，独立维度） |
| visual-r8 | 0.3.7 | 86.55 | 时钟位图字保真 + 网格热图诊断 |
| visual-r9 | 0.3.8 | 94.84 | 1280×960 原版几何画布（+8.3） |
| visual-r9b | 0.3.8 | 94.91 | r9 复跑确认（正式归档值） |
| visual-r10 | 0.3.9 | 95.00 | 时钟锚点/文字位校正 + 1:1 采样 |
| visual-r11 | 0.3.10 | 94.96 | 画布内暂停钮渲染保真 |
| visual-r12 | 0.3.11 | 94.95 | 钻石计数迁出画布（原版形态） |
| visual-r14 | 0.3.14 | 94.97 | 界面复刻轮视觉指数（正式归档） |
| visual-r15 | 0.3.15 | 95.06 | 缺口收口轮（设置/制作/彩带） |
| （四线审计轮） | 0.3.17 | — | 帧/音/动画/文案审计，游戏画布零扰动（沿用 94.97 口径） |
| （menu 像素差分） | 0.3.16 | 85.6% | 开始界面像素差分（原版对照，TEMP/uidiff） |
| （渲染细节批） | 0.3.19 | 94.36-94.97 | 门定位/钻石浮动带等 6 项（idle 相位噪声波动带，报告 §二十四） |
| （渲染收尾批） | 0.3.20 | — | 渲染审计 11 项清零（视觉沿用 94.97 口径） |
| r24-docaudit | 19b990e | 84.31 | fixture 顺序定案后的物理指数归档（0.3.18 起口径，2026-10-08 复现存档） |
| （性能专项） | 0.3.21 | — | 物理 84.31 零漂移（perf-determinism 位级一致门通过） |

**性能快照**（perf-step 综合为 48 关 step avg；详见性能报告）：

| 快照 | git | 48 关 avg | bonus_2 avg | 说明 |
|---|---|---|---|---|
| perf-baseline-vm | 3a1cfdf | 0.6759ms | 28.7958ms | 优化前基线（vm 沙箱加载器） |
| perf-r1-loader | 9f0155c | 0.0648ms | 2.4347ms | 主上下文加载器（R1，−90.4%） |
| perf-r4-final | 0.3.21 | 0.0656ms | 2.4577ms | 终版复核（含 R3 客户端改动后） |
| det-baseline-vm | 3a1cfdf | — | — | 位级哈希链基线（后续引擎改动的对照锚） |
| load-baseline / load-r3-load | 9f0155c | — | — | 客户端加载前/后（冷启动 6909→4858KB） |

## 注意

- 输入对齐 INPUT_SHIFT 默认 +1（实测标定），可用 `DIFF_SHIFT` 环境变量覆盖。
- fidelity-score settle=5 帧（金轨迹 f0=起跑后第 5 帧，实证见报告 §四 R1）；bonus_2 类重箱关的 settle 敏感性见对比报告。
- 本基准只读（不改内核/金轨迹），稳定性红线无关项。
