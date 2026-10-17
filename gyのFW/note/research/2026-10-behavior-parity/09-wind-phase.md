# 09 号档 · 风 sin 相位对拍：时钟源裁定与恒定偏移定量（windphase 槽）

> 一句话：**判定=恒定偏移（可锚定修正）——oracle 风相位的钟是 `game.time.now`（=本帧 rAF 时间戳取整，帧顶刷新，假钟下=最后一次 `__vt.arm` 起算的 `floor(k·1000/60)` ms，arm 时刻完全可控）；内核缺省 `simTimeS`（Σdt，步前读）与它恒差 median 16.333ms≈1 帧（读点约定：oracle 读 dt 区间右端点、内核读左端点）+ 首 dt 钳制残差 0.667ms，去中位残差 fixed-60 ±0.333ms / 实录 dtSeq ≤1ms=整数 ms 量化下界——频率与公式全同，非结构性错位。力公式端到端 1010 笔 ApplyForce 实测 |obs−pred| max 3.6e-14（float64 噪声底）。锚定 A/B：风相位对轨迹位置叶 max 净贡献 138→96px（−30%），行为差仍是底座（风 engage 前 42px）。风关 oracle 金 fixture 首例落册：`forest_26/oracle-gold`（tolerance=173px、outcomeWindowF=128），runner 全量 6/6 PASS。**
>
> - 日期：2026-10-17
> - 前序：05 号档行动清单第 3 项；02 号档 §5.3（诚实差距清单之首）；07 号档 §2 表 #8（唯一未同构项）；06 号档 §7.3（风关 fixture 解禁条件）。
> - 交付：`scripts/e2e/oracle/windphase.mjs`（探针）+ `scripts/e2e/fixtures/forest_26/oracle-gold/`（风关 oracle 金首例）
> - commit：探针 `c53d0e0` + fixture `49185bc`

## §1 STEP1 oracle 风时钟源裁定（引文全录）

**结论：`game.time.now` = 本帧 rAF 回调时间戳取整（整数 ms），帧顶刷新；不是 Date.now 域，也不是进关起算的独立钟——它的原点就是 rAF 时间线的原点（真浏览器=页面导航起算），假钟下原点=最后一次 `__vt.arm` 时刻（值 0，帧号归零），完全可控。**

证据链（`note/reverse/oracle-a/` 严格只读，本档仅摘录）：

1. **风公式读 now**（模块件 `modules/States_Level_Devices_Wind.js` L134 = `init.beautified.js` L59564，07 号档 §1 同源）：
   ```js
   b.SelfMul(1.2 + Math.sin(this.game.time.now / 1000) * 0.2).SelfMul(100).SelfMul(1 - a.GetLength() / this.options.properties.length);
   ```
2. **now 的赋值点与刷新时机**（beautified）：
   - `Game.update`（L14653-14654）：`update: function (a) { this.time.update(a); …` —— `a` 是 rAF ts，**帧顶**即刷；
   - `Time.prototype.update`（L25938-25943）：`this.prevTime = this.now; this.now = a; this.elapsed = this.now - this.prevTime;` —— `now` 即当前帧 rAF ts；`elapsed` 是相邻两帧 rAF ts 之差（整数 ms）；
   - `RequestAnimationFrame.updateRAF`（L24247）：`this.game.update(Math.floor(a));` —— **整数 ms 域**；
   - 主循环次序（L14703-14742）：`updateLogic` 内 `doScheduledTicking` 每 tick 置 `elapsed` 后跑 stage 更新 → **Wind.update 读到的 now = 本帧值**（帧内不变，Time.update 已在 Game.update 顶部完成）。
3. **假钟下的原点值**（`scripts/e2e/oracle/lib.mjs` VT_INIT，只读引用）：rAF 劫持后 `ts = frame·(1000/60)`（L43/L80），`__vt.arm` 把 `frame` 归零（L62）→ **原点=arm 时刻，值恰 0**；arm 由控制器显式调用（enterLevel 内一次 + runScript 三段式起跑两次），时刻完全可控。此后第 k 帧读 `Game.update(Math.floor(k·16.6667))` → `now(k) = floor(k·1000/60)`（整数 ms），`elapsed(k) = now(k)−now(k−1)` ∈ {17,17,16} 循环（首采样帧 elapsed 因 arm 跳变被钳制为恰 1000/60，02 号档防线②）。
4. **实证闭环**（§2 探针）：oracle 侧 1010 笔真实 `ApplyForce` 力矢量与 `|F| = (1.2+0.2·sin(n/1000))·100·(1−dist/len)`（n=该 tick 的 `time.now`）比对，max 绝对误差 3.55e-14、相对 6.4e-15（box2d.js float64 运算噪声底）——**"风公式逐 tick 读当帧 time.now"由字节引文与运行时取证双重坐实**。

## §2 STEP2 相位对拍（探针设计与数据）

**探针**（`scripts/e2e/oracle/windphase.mjs`，运行序镜像 lib.runScript 三段式起跑，仅插被动布防）：oracle 虚拟钟跑 forest_26 全程路线，采样器逐帧记 `{n=time.now, e=time.elapsed}`；另包 ①每个 wind 设备（`MechManager.deviceGroups` 过滤 `windSensor`）update 前记施力 tick 读点 `{n,e,active}`（945 tick）；②双角色 `body.ApplyForce` 记力矢量+体/柱位置（1010 笔）。内核三口径回放同路线，逐步记 applyForce 收到的 nowS（=步前 `world.simSeconds`，由 `world.ts:247→270` 次序保证）：**P1** fixed 1/60（det/fixture 口径）；**P2** 实录 dtSeq=e/1000（oracle-gold fixture 口径，goldcollect --compare 同式）；**P3** = P2 + `WorldOptions.windClockS` 锚定 +median(Δ)（§3 A/B 用）。

**数据**（forest_26，oracle WIN@f1593 采样 1600 帧 / 内核三口径均 won@f1497；风 engage f416–，施力帧 945）：

| 口径 | Δ=n/1000−nowS（sin 自变量，ms） | median | 去中位残差 max | 判定 |
|---|---|---|---|---|
| P1 fixed-60 | [16, 16.6667] | **16.3333** | **0.3333** | 恒定偏移（可锚定修正） |
| P2 实录 dtSeq | [15.3333, 16.3333] | **16.3333** | **1.0（=量化下界）** | 恒定偏移（可锚定修正） |

- P1 有解析闭式：`Δ(k) = floor((k+1)·S) − k·S = S − frac((k+1)·S)`，S=1000/60 → 值域 {16, 16.333, 16.667} 三帧循环（frac ∈ {0.667,0.333,0}），实测与解析式最大偏差 **3.7e-10 ms**（纯 float 噪声）——相位差谱被解析式完全解释，无自由参数、无漂移项。
- P2 模型：`Δ(k) = e_k − 0.667`（e∈{17,17,16}，0.667=首 dt 钳制 16.6667 与原始 now_0=16 之差）→ {16.333, 16.333, 15.333}，实测吻合。
- 风因子误差（w=1.2+0.2·sin θ，945 施力帧）：原始 max |Δw| = 0.003333（P1，=0.2×其 max|Δ| 16.667ms 的 sin 主项）/0.003267（P2，=0.2×0.016333 精确吻合）；**锚定修正后 6.67e-5（P1，=0.2×0.333ms）/ 2.0e-4（P2，=0.2×1ms）**——恰为各自残差×幅值 0.2，无非模型成分。

**三选一判定：恒定偏移（可锚定修正）**——残差≤量化下界（oracle 整数 ms floor 摆幅 [0,1)ms ⇒ Q=1ms）但 |median|=16.33ms≫Q。偏移的机械分解：

1. **读点约定差 ≈1 帧（16.667ms）**：oracle 帧顶刷新后读（dt 区间**右端点** n_k=t_{k−1}+e_k），内核 applyForce 在 `simTimeS+=dt` 前读（dt 区间**左端点** T_k）。两者各自自洽，非任何一侧的缺陷。
2. **首 dt 钳制残差 +0.667ms**（仅实录 dtSeq 口径）：e_0 被钳为 1000/60 而原始 now_0=16（02 号档防线②的副产物，常数）。

**修正入口已内建**：`WorldOptions.windClockS`（world.ts:63-69，F6 裁定），`FW_WIND_PHASE` 服务端即 `simTimeS + PHASE`——P3 口径实测 PHASE=median(Δ)（16.3333ms/1000）即对齐至量化噪声底。注：06 号档 §7.3 预估"实录 dt 下与 oracle 恒差 ≤0.5ms"比较的是**钟原点**（arm t0 ↔ simTime 0，确然相等）；本档实测表明**风读点**还叠有上述 ≈1 帧的区间端点约定差——对拍以本档实测为准。

## §3 轨迹 A/B（可公度性判据）

P2（PHASE=0）vs P3（PHASE=+16.333ms）同 dtSeq 回放 vs oracle 金流，唯一差异=风相位：

| 叶 | P2 PHASE=0 | P3 锚定 | 风相位净贡献 |
|---|---|---|---|
| 位置（fb/wg x,y，fixture 比对面） | median 4.64 / p99 131.1 / **max 138.35px@f1224** | median 4.50 / p99 95.4 / **max 96.37px@f1157** | max −30%，p99 −27% |
| 复合 8 分量（含速度） | max 637.9px@f242 | 637.9px@f242（p99 473.7→395.4） | 速度尖峰（±1 帧落地相位，f242 在风 engage 前）与相位无关 |

分账：**风 engage（f416）前位置 max 已 42.0px**——行为差（内核优化路线跑速/落地相位，06 号档 §2 同类）是底座；风相位在风段贡献真实但非主导（138→96px）。位置叶中位 4.64px 与 forest_01 同 dt 口径（4.80px）同级。**风场机制层完全公度**（公式 float64 逐位闭环+相位偏移常数可锚）；轨迹层受行为差支配，与 02/06 号档结论一致。

## §4 STEP3 fixture：forest_26/oracle-gold（落册）

06 号档 §7.3 风关解禁条件核验：windsem 阻尼修复（4198ef3+99ed9fc）已落定 ✓、风相位对拍已做且判定=恒定偏移可锚（非结构性错位）✓ → 建册。

- 采集：`goldcollect --capture --route forest_26 --runs 2` → ×2 采样流 **BITEXACT**，WIN@f1593 双跑，dt 取证解析式 1599/1599 全吻合（同 06 号档 §1 形态）。
- 机写三件 + meta 人写：`scripts/e2e/fixtures/forest_26/oracle-gold/{route,dtschedule,expected,meta}.json`（expected 1594 帧，won@f1593，routeSig `459c2d0abc662e51`）。
- **tolerance=173px**：runner 以缺省 PHASE=0 回放，实测位置叶 max 138.35px ×1.25（06 号档 §7.2 公式）——该实测**已包含**风相位恒定偏移的全部影响（偏移常数可锚但 runner 无 windClockS 注入口，余量覆盖）；锚定后可达 ~120px（96.37×1.25），记为 runner 扩展后的收紧路径。
- **outcomeWindowF=128**：内核 won@f1497 vs oracle WIN@f1593，|Δ|=96，round(96×1.33)=128（status 恒精确）。
- compareEvents/comparePhase/compareVelocities=false（同 forest_01/oracle-gold 口径：oracle 采不到内核事件层/相位层，速度叶=±1 帧落地相位尖峰不可 atol）。
- runner 三件套：全量 **6/6 PASS** exit 0（v1 四关 maxDev 0 零波及、forest_01/oracle-gold 不动）；×2 输出逐字一致（确定性）；负测试 `--filter oracle-gold --update` 被拒收 guard 拦截、expected.json sha256 前后不变。

## §5 诚实边界

1. 单关单路线：对拍在 forest_26（5 风柱、945 施力 tick）上完成；公式与时钟源裁定是 bundle 级的（全风关同一 Wind 模块），但 P1/P2 残差谱数值是"该路线该 dt 序列"的，其它风关复用探针每关一次 route 回放即可。
2. 偏移未回修内核：判定=恒定偏移且修正入口（windClockS/FW_WIND_PHASE）已内建，但 det r32/fixtures v1 全部基于缺省 PHASE=0——改缺省=全基线漂移，无必要不做；fixture 以 tolerance 覆盖偏移影响。
3. P2 残差恰触量化下界（1.0ms）：由首帧钳制（0.667ms）与 [17,16] 整数循环共同决定，是"实录 dtSeq 口径"的结构常数，非测量不确定度；fixed-60 口径残差 0.333ms。
4. 速度叶不可公度维持 06 号档结论（本次复合 max 637.9px@f242 与 P3 无差，坐实为行为性落地相位尖峰）。
5. 探针布防是被动记录（包 update/ApplyForce），不触物理与时钟；oracle 采样流与 goldcollect 同链（本档探针跑 WIN@f1593 与 capture ×2 逐位同 marks）。

## §6 复现

```bash
cd gyのFW
node --import tsx scripts/e2e/oracle/windphase.mjs --probe --out TEMP/windphase          # 全程探针+判定+轨迹A/B（报告 JSON 同目录）
node --import tsx scripts/e2e/oracle/goldcollect.mjs --capture --route forest_26 --runs 2 --out TEMP/windphase/goldfix
node --import tsx scripts/e2e/oracle/goldcollect.mjs --compare --gold TEMP/windphase/goldfix/gold-forest_26-r1.json
node --import tsx scripts/e2e/routetool/fixture-runner.mjs                              # 6/6 PASS
node --import tsx scripts/e2e/routetool/fixture-runner.mjs --filter oracle-gold --update # 必须拒绝（负测试）
```

产物 `TEMP/windphase/`（gitignored）已于收尾清理；报告数值全录本档与 fixture meta.notes。
