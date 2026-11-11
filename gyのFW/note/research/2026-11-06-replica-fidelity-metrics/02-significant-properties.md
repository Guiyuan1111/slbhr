# 02 · 显著属性 → 量具 → 阈值 总表（2026-11-11）

> 落点：调研 01-survey.md §3 表的 ⚠️ 行——「门禁清单事实上就是显著属性清单，
> 可补一份显式总表」。框架出处：数字保存学 significant properties
> （Hedstrom 等 2006 一脉；execution/experiential fidelity 二分源自 Rosenthal 2015，
> 经 CLIR pub194 引入，见 01-survey.md §2.6 带链接）。
> 性质：**纯文档工作**，把既有量具按「保真什么/用什么量/判什么阈值/还缺多少」
> 显式化，不新增量具。本项目目标=保存级（execution 与 experiential 两维都最高）。

## 总表

| # | 显著属性 | 量具 | 锚 | 判据/阈值（出处） | 覆盖现状 |
|---|---|---|---|---|---|
| 1 | **物理行为轨迹**（execution 保真核心） | oracle-gold 对拍网：`scripts/e2e/oracle/goldcollect.mjs` 实录 dt 序列（ms-quantized-rec，如 [17,17,16] 循环）+ `vtdiff.mjs` 逐帧对拍 | **原版** | tolerance 30px（forest_01，alignShift=1；25→30 无偏重定=11 号档）/ 177px（forest_26 风关，风段锚定后可收紧 ~120px）；outcomeWindowF=128；见行为复刻 INDEX「oracle-gold fixtures」行 | **6/48 森林关**（01/04/12/26 各 main+oracle-gold）——铺开卡路线供给，=复刻挂账 §3 #1 |
| 2 | 金轨迹综合分（同上属性的分数量化面） | `benchmark/fidelity-score.mjs`：5 条官方金轨迹（`scripts/baseline/golden/`）逐帧对拍，maxDisp/finalDisp/trajRMS/maxDv → 综合复刻度 0-100 | 原版实录 | 评分公式见 [benchmark/README.md](../../../benchmark/README.md) 指标口径节 | 常备，历轮快照在 `benchmark/results/` |
| 3 | 全库回归位级一致（**自锚防回归**，非复刻度指标——两层不可混，01-survey §1.3） | `benchmark/perf-determinism.mjs --compare <label>` | 本项目历史基线 | 241/241 位级一致（六部全库；引擎改动硬门） | ✅ 全覆盖 |
| 4 | **关卡内容数据** | 证据库 31 目录字段级 diff（Tiled/JSON 对照原版逐对象） | 原版数据 | 0 diff（例：fairies-01 28 对象零 diff，03号档） | ✅ 已入库 |
| 5 | **视觉呈现·像素面** | `benchmark/visual-diff.mjs`：480×360 灰度 + ±48px 对齐 + 容差 24/48 匹配率（自造指数）+ **SSIM**（`diff.ssim`，IEEE TIP 2004 标准指标，2026-11-11 增） | 原版截图 | 带（同口径期内可比，跨口径不可直列）：现行 rate48 三跑 95.93–96.10；**SSIM 基线带 0.7813–0.7887**（越带 ±0.01 记显著）；带演变链见 benchmark/README.md 视觉差分节 | forest_01 代表帧；扩展到逐关=未立项（量具单关口径） |
| 6 | **视觉呈现·动画状态面** | `scripts/e2e/oracle/animprobe.mjs` 状态级对拍（oracle 虚拟钟 vs 真服 playwright，head/legs/smoke/dying 序列） | 原版 | 注册面 0 差异、序列同构、30fps 同步（12 号档 STEP3） | ✅ 已建档 |
| 7 | **音频** | F4 逐键音量对表（master 0.1 + 逐键覆写 vs bundle 逆向） | 原版 bundle | 逐键一致（源级参数对照，强于 BS.1770 响度等价判据——01-survey §2.3） | ✅；LUFS 总响度对照判不做（§3.1 #11②） |
| 8 | **机制语义常量** | oracle 逆向对表：风相位 float64 闭环（1010 笔 max 3.55e-14，09 号档）、portal transport 数学逐字（crystal 01号档）、旋转对拍 max\|Δθ\|≤1.9e-4° 等 | 原版 bundle/实跑 | 常量逐字或浮点闭环阈值 | ✅ 随各庙取证档卷累积 |
| 9 | **可通关性/结局行为** | 路线产线双门：内核全链 WIN（autosearch evalchild finalize 回放）+ 真服 `route-node.mjs --repeat 3` 全 PASS（旧线另有 mc.mjs ≥98% 鲁棒门，[route-production-playbook.md](../../plans/route-production-playbook.md) §0/§3） | 自证可玩（非原版对照） | 3/3 PASS 才出 route JSON（不造假纪律） | 森林多关定稿；其余部按部就班（见各 slot 档卷） |
| 10 | **输入/时序基础设施** | 服务端时序噪声模型（done-t∈[1,5]ms，~1/315 离群 40ms；playbook §1）+ tick 60Hz 语义 | 物理模型 | 路线结构铁律据此设计（禁相位耦合链，长按进墙/定点跳自愈原语） | ✅ |
| 11 | **体验保真**（experiential） | 人类试玩验收——**量具不可替代**（CLIR/Rosenthal 框架明示两维独立） | 玩家 | 三部游玩验收=用户保留事项（2026-10-30 契约），项目侧不得代行 | 待用户 |

## 缺口小结（对齐 01-survey §3 结论）

1. 唯一开工级缺口仍是 **oracle-gold 覆盖 6/48**（#1 行）。⚠️ 供给勘误
   （[18 号档普查](../2026-10-behavior-parity/18-oracle-gold-census.md)，
   2026-11-11）：复刻侧路线对 oracle-gold **实证无效**（9 关全 C 类、结局翻），
   #9 行产线只供给 det/真服/可玩性层；oracle-gold 的供给须 oracle 原生路线
   产线（待裁候选 行为复刻 INDEX §3.1 #12）。
2. SSIM 分量已落地（#5 行，基线带已定）；LUFS 判不做（#7 行）。
3. experiential 一维（#11 行）按契约永久保留给用户，任何量具扩张不覆盖它。
