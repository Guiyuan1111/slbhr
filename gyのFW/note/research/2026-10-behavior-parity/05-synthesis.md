# 05 号档 · 行为复刻三线实施综合（主会话整合）

> 一句话：**三线全部落地并互证成功——"oracle 可钉 60Hz"（02）+"可变 dt 面连结局都不稳定"（03）+"回归网已织好"（04），共同把行为对齐战略钉死为：对拍走固定 60Hz，内核不追可变 dt。** 首个精确答案：forest_01 内核 vs 虚拟钟 oracle，出生点偏置 0.0135px，动态漂移中位 16.2px/峰 98.7px（跳跃/长下落相位），接触面重收敛至 0.005px，结局同 WIN（内核 f2365 / oracle f2463，+4.1% 时长漂移）。
>
> - 日期：2026-10-17
> - 前序：01 调研（survey）→ 02/03/04 三槽并行实施（vtoracle / dtsweep / fixtures），本档为主会话整合。

## §1 三线结果一览

| 线 | 槽 | 交付 | 核心数字 |
|---|---|---|---|
| 02 虚拟钟 oracle | vtoracle | `scripts/e2e/oracle/{lib,vtrun,vtdiff}.mjs` + 02 号档 | ×3 BITEXACT 双口径（路线 2500 帧 WIN、hold-right LOSE）；survey CDP 组合拳半数证伪→退路 A 强化（init-script 全假钟+Node `__vt.step(n)` 逐帧放行）；四道确定性防线 |
| 03 dt 敏感度谱 | dtsweep | `scripts/e2e/routetool/dtsweep.mjs` + 03 号档 + 156+36 组合数据 | 可扫 12/48 关（路线库缺口）；11 通关路线 **7 条结局翻转**、±8ms 抖动即翻 7 条、**钝感关 0**；风阻尼 `mechanisms.ts:673` ×0.975/步=唯一内核 1/60 硬假设（60Hz 每秒 ×0.218 vs 120Hz ×0.048，差 4.5 倍）；forest_25 封印裁定对 dt 谱稳健（36 组合） |
| 04 金轨迹回归 | fixtures | `fixture-runner.mjs` + 4 关 v1 基线 + 04 号档 | 4/4 PASS maxDev 0、自确定性 ×2 sha256 全同、负测试精确报发散；forest_12（摆板轴点修复锁）+forest_26（风时钟口径锁）已入网 |

## §2 交叉验证（三线互证，主会话判读）

1. **dt 整数 ms 量化机理，两个独立观察角度同一结论**：02 的差值曲线（[17,17,16]ms 量化 vs 1/60 → 放大-归零，接触面重收敛 0.005px）与 03 的抖动谱（稳定关漂移 53–287px 但结局稳、无钝感关）互证——漂移是 dt 序列的确定函数，不是随机噪声。
2. **战略三线共同背书**：02 证明 oracle 可钉 60Hz 且逐位可复现；03 证明可变 dt 面上连结局都不稳定（对拍无定义）；01 的 Ruffle/OpenMW 先例同路线。⇒ **行为对齐唯一可行口径=固定 60Hz 对拍**。
3. **P1-D2（oracle 可变 dt 模拟）定案材料齐备**：联机优先战略下维持降级是对的——03 显示全局改可变 dt 会作废 12 关 det 位级基线且拉不平谱；02 提供了需要时"精确测量oracle 可变 dt 行为"的工具（真实钟模式照跑）。

## §3 决策输入更新（呈用户）

- **机器探索线三选一有了新维度**：路线库只有 12/48 关可扫——auto-build 产线不只是"通关供给"，是 48 关 dt 谱与 fixture 行为网的**路线供给方**。复活它=同时补齐行为复刻的覆盖率瓶颈。
- **风阻尼修复时机**：`mechanisms.ts:673` 的 ×0.975/步改 dt 加权是唯一有硬缺陷背书的定点靶。但改内核会漂移 det r32 与 fixtures v1 两套基线——须走 fixture-runner `--update` 人审流程，这将是 fixture 体系第一次实战（也正好验证它）。
- **+4.1% 时长漂移**：对 razor 关（forest_05/15 类）足以翻结局——"相位鲁棒"判据（联合扫描结局恒定域）现在有工具基础（dtsweep 调度器 × botcore）。

## §4 行动清单（建议顺序）

1. **风阻尼 dt 加权修复**（mechanisms.ts:673，一处改动）→ det r32 + fixtures v1 双基线 `--update` 人审 → e2e 绿关复跑。预期 forest_03/26 类风关的跨 dt 翻转显著收窄。
2. **oracle 金输出接入 fixtures**：vtrun 采集器对接 fixture 协议（source:"oracle"），首批 forest_01，tolerance 从 0 起步（×3 BITEXACT 已证可位级）；建成后=行为面进度总账正式运转。
3. **风相位对拍**（02 诚实差距清单之首）：假钟下 game.time.now 可控，vtdiff 扩展风相位比对项。
4. **路线库补全**：与机器探索线决策联动（§3 第一条）。
5. **呈现层兜底抽查**（低优先）：01 号档 §5.2 像素 diff 工具仅在需要时上。

## §5 整合期事件记录

- 主会话独立复验：fixture-runner 4/4 PASS（maxDev 0）；dtsweep `--selftest` 两关基线位级等价+确定性全过。
- **dtsweep footgun 修复**（本次整合发现）：裸跑（或敲错 flag 如 `--selfcheck`）默认只扫 forest_01 但默认 outDir 原指向已提交档案目录，一次误跑即把 144 组合 summary.csv 覆盖成 12 组合（已 `git checkout` 恢复）。修复=默认 outDir 改 TEMP/dtsweep，写档案目录须显式 `--outDir`。合法自检 flag 为 `--selftest`。
- 三槽纪律全数履行：oracle 目录与内核只读、无 co-author、TEMP 清理（TEMP/dtsweep、TEMP/vtoracle、TEMP/fixtures 零残留，8842 伺服进程已清）。
