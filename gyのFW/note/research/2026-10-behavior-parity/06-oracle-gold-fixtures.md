# 06 号档 · oracle 金输出接入 fixture 回归网（goldfix 槽）

> 结论先行：**「同 dt 序列 ⇒ 逐位一致」质变假说不成立，但同 dt 对齐是真实的量具增益**。实录 oracle 虚拟钟 dt 序列（钳制帧 1000/60 后接整数 [17,17,16] ms 循环，解析式全吻合，×2 BITEXACT）照喂内核后：forest_01 位置残差中位 7.1→4.8px、max 40.9→20.2px（减半），但逐位仍不成立——出生点静态偏置 0.0135px 起步，行为差距（跑速 ~0.8%/落地相位 ±1 帧/门序）主导。首批 oracle 金 fixture 落地 1 例：`forest_01/oracle-gold`（tolerance=25px，outcome 窗 ±128f），fixture-runner 全量 **5/5 PASS ×2 确定性**（v1 四关 maxDev 0 零波及）。forest_04 路线 oracle 不可移植（超时）、forest_12 结局可移植但轨迹远（中位 357px）——均如实挂账不伪造。
>
> - 日期：2026-10-17
> - 前序：02 号档（oracle 机）→ 04 号档（fixture 协议，§5 接入预案）→ 05 号档 §4 行动清单第 2 项（本档）
> - 交付：`scripts/e2e/oracle/goldcollect.mjs`（采集比对器/fixture 机写）+ `scripts/e2e/fixtures/forest_01/oracle-gold/`（source:"oracle" 首例）+ fixture-runner oracle 扩展（见 §4，最小向后兼容，v1 零波及）

## §1 STEP1 dt 序列取证（不假设模式，只实录）

goldcollect `--capture`：oracle 虚拟钟机跑路线，采样器逐帧记录 `{s, n=time.now, e=time.elapsed, fb, wg}`（02 号档同款口径）。forest_01 全程（2500 帧，WIN@f2463）×2 冷启动 **BITEXACT**；dt 取证：

- **首样本 e=16.666666666666668**（=1000/60 双精度逐位，arm 跳变钳制帧，02 号档防线②）；
- 其后全为**整数 ms**，值域 {16,17}，与解析式 `floor((k+1)·1000/60) − floor(k·1000/60)` **2499/2499 全吻合**，即 [17,17,16] 三帧循环（均值恰 1/60）；
- `n[k] − n[k−1] ≡ e[k]` 全程成立（elapsed 确为整数 ms 差分，无隐藏再量化）；
- 同一序列在 forest_04（1129/1129）、forest_12（899/899）成立——**序列与关卡无关，只由假钟结构决定**，长跑不漂移。

消费侧算式：dt = e/1000（双精度除法），与 oracle `world.Step(min(0.04, elapsed/1000))` **同一浮点算式**——内核侧喂入无换算误差。

## §2 STEP2 内核同 dt 序列回放比对（forest_01）

`goldcollect --compare`：内核 makeWorld 按实录 dtSeq 回放同路线，与 oracle 状态流逐帧 8 分量（fb/wg × x/y/vx/vy）比对。

| 口径 | 位置残差中位 | 位置 max | 结局 |
|---|---|---|---|
| 内核 fixed-60 vs oracle（02 号档差分口径，本档重测） | 7.11px | 40.9px | 内核 WIN@f2365 / oracle WIN@f2463 |
| **内核 实录 dtSeq vs oracle（同 dt）** | **4.80px** | **20.2px** | 内核 WIN@f2367 / oracle WIN@f2463 |

**逐位判定：不成立。** 首发散 f0（fb.y/wg.y 各 0.013479px——出生点标定残差，02 号档 §4 同值）；此后零偏差帧 0/2368。

残差结构（位置叶，2368 帧）：

| 叶 | 中位 | p99 | max | max@ |
|---|---|---|---|---|
| fb.x | 1.89 | 5.04 | 5.38 | f1885 |
| fb.y | 0.00 | 7.48 | 8.19 | f2096 |
| wg.x | 4.45 | 19.62 | 20.17 | f1890 |
| wg.y | 0.00 | 8.14 | 19.69 | f1205 |

**速度叶不可公度**：|Δv|>100px/s 共 20–40 帧/2368（各叶），最长连跑 6 帧，峰值 ±490px/s；结构=「同位置、一侧 v=0 另一侧 ±480px/s」——**±1 帧落地相位翻转**（480px/s 下落帧差 8px，与位置残差 5–20px 自洽），非持续速度差。

**win 帧 +96f 是行为差不是 dt 差**：同 dt 下内核 WIN@f2367 与 fixed-60 的 f2365 几乎同点，oracle 恒 f2463——即 02 号档 +4.1% 时长漂移在 dt 对齐后原样保留，源=跑速/门序等行为差（实测 oracle 跑速 ~241px/s vs 内核 ~243px/s，0.8%）。

## §3 tolerance 定值（诚实基准）

- **tolerance=25px**：位置叶实测 max 20.17px（wg.x）×1.24 跨机余量。速度叶/相位尖峰在 atol 语义下不可公度（盖住需 ~500px/s=无锁）→ `compareVelocities=false` 跳过。
- **outcomeWindowF=128**：status 恒精确（won=won），frame |2367−2463|=96 ≤ 128。窗口承认行为性时长偏移，不锁时长；结局翻转（won→dead/timeout）仍即 FAIL。
- **compareEvents=false**：oracle 侧采不到内核 WorldEvent 语义（diamond/door-open/mech 为内核事件层，两侧各自实现——02 号档诚实差距⑤），expected.ev 恒 []，跳过该叶。
- **comparePhase=false**：oracle ph 恒 "level"（无比对值），且 win 帧错位使末帧 ph 必然不等。
- **mechEvery=0**：机关快照同属内核事件层，oracle 无对应采样。
- 本 fixture 现阶段定位=**粗粒度行为回归检测器**（结局不翻 + 全程位置跟踪 ≤25px）；随内核控制器保真度提升（跑速/落地相位/门序），用 `goldcollect --compare` 重测收紧 tolerance 与窗口。

## §4 fixture-runner oracle 扩展（披露）

04 号档 §5.5 预案「source:"oracle" 时 runner 零改动」在实测面前不成立（dtSchedule 未知值报错、ev/ph 叶结构必发散、outcome 帧精确比对必 FAIL），本槽对 `scripts/e2e/routetool/fixture-runner.mjs` 做了**最小向后兼容扩展**（当时 AskUser 无应答，按任务 STEP3 明示要求「新 case 按其 tolerance 判定」执行，逐条披露如下）：

1. `dtSchedule:"ms-quantized-rec"`：读 case 目录 `dtschedule.json`（format/unit/dt[ms]），dt=值/1000，序列不足报错；
2. `compareEvents=false` / `comparePhase=false` / `compareVelocities=false`：比对前对称剥叶（meta 缺省=原行为，v1 零影响）；
3. `outcomeWindowF=N`：outcome.status 恒精确，frame 允 ±N；窗口成立时帧流长度差不再另报；
4. `source:"oracle"` 的 case **禁用 --update**（防内核回放覆盖金输出；重录走 goldcollect 采集链）——负测试已验：guard 报错 + expected.json sha256 不变。

**v1 零波及复验**：扩展后全量 4/4 PASS maxDev 0；新 case 入册后全量 **5/5 PASS ×2 输出逐字一致，exit 0**。

## §5 第二关调查（两例均不落册，证据留档）

- **forest_04（pulley，无风）**：f0 对齐同 0.0135px；f150 桶曾收敛至 max 4.2px——但中段发散（速度尖峰 763px/s），**oracle 跑满 1130 帧不结局**，末态 wg=(304,740) fb=(208,740) 静立于半途（等已过期的输入），内核同 dt WIN@f1100。定性：**为内核优化的路线对 oracle 不可移植**（pulley 段行为差累积超容忍）。不伪造 timeout 基线，挂账。
- **forest_12（hanging，无风）**：oracle WIN@f872（×2 BITEXACT），内核 776（fixed-60 与实录 dt 同点——dt 序列在本关不移动 win 帧）。但轨迹层**中位 wg.y 残差 357px、~90% 帧位置差 >20px**（首发散后摆板动力学分叉）——结局可移植、轨迹不可锁，25px 级 tolerance 无意义，不落册。
- 附带修复：goldcollect 初版误用 vtrun 的 `levelId=1` 硬编码，非 forest_01 关卡经 enterLevel 的 `?? find(id)` 兜底**静默载错关**（vtrun 只跑过 forest_01 故未暴露）；已改为按 filename 从 oracle temple.json（只读）解析 id。上表数据均为修复后复测。

## §6 纪律与并发记录

- oracle 目录 `Fireboy-and-Watergirl/` 与 `note/reverse/` 严格只读（temple.json 亦只读）；`packages/shared/**`、det 基线、v1 四 fixture 未触碰（windsem 槽并行暂存的 shared 改动全程未入我的 commit——提交按路径限定）。
- **windsem 并发提交实录**：本槽工作期间 windsem 落盘 4198ef3（风阻尼 dt 加权 0.975^(dt·60)）+ 99ed9fc（风推力去 max(0,·) 钳制）——恰为 05 行动清单①。按「以 git 最新态重跑为准」执行：终态全量 5/5 PASS（forest_01 无风，不受风阻尼/推力改动影响；oracle-gold 的 expected 为 oracle 引擎输出，与内核改动无关）。
- 04 号档 §2「未知 dtSchedule 报错」语义自本档起由 §4 扩展更新（04 档非本槽文件，未改，以本档为准）。
- AskUser（runner 扩展权限）无应答；按任务 STEP3 明示要求执行最小扩展并全量披露（§4），若判定越权可 revert fixture-runner.mjs 单文件，fixture 随之降级为协议错误挂账（goldcollect --compare 仍为等效量具）。

## §7 48 关铺开预案

1. **可移植性普查先行**（每关 1× capture，~15s/关）：oracle 在路线帧长内 WIN→A 类（建 fixture）；结局达但轨迹远→B 类（挂账等内核保真）；超时/路线死→C 类（路线须 oracle 侧重造——与机器探索线联动：**oracle 自搜路线才是行为网的供给方**，内核优化路线天然带 0.8% 跑速偏置）。
2. tolerance/window 标准化：`--compare` 位置叶统计 → tolerance=round(max×1.25)、outcomeWindowF=round(Δ×1.33)，notes 记定值依据。
3. **风关（forest_03/26 等）须先解风相位口径**：oracle 风=force·(1.2+0.2·sin(time.now/1000))，now=arm 锚+帧×16.667ms 已确定（02 号档）；内核侧 F6 时基缺省 simTimeS 累加（实录 dt 下与 oracle 的 frame×16.667 恒差 ≤0.5ms，需逐帧核）——且 **windsem 的风阻尼 ×0.975/步修复（05 行动清单①）落定前，风关 oracle fixture 不建**（阻尼口径一变，expected 全作废）。落地顺序：windsem 修复 → det r33+v1 `--update` 人审 → 风相位对拍（02 §5.3）→ 风关 fixture。
4. **razor 关（forest_05/15 类）**：+4% 行为性时长偏移足以翻结局，预期大量 C 类；其 fixture 价值在**死亡路径锁**（oracle-lose 亦可注册，runner 原生支持 dead 结局，本档未遇实需）。
5. 每批落册后：runner 全量 + ×2 确定性 + 负测试（--update guard）三件套。

## §8 复现

```bash
cd gyのFW
# STEP1 采集（×2 BITEXACT + dt 取证）→ TEMP/goldfix/
node --import tsx scripts/e2e/oracle/goldcollect.mjs --capture --route forest_01 --runs 2
# STEP2 同 dt 序列比对（逐位/残差/win 对齐）
node --import tsx scripts/e2e/oracle/goldcollect.mjs --compare --gold TEMP/goldfix/gold-forest_01-r1.json
# STEP3 fixture 机写三件（meta.json 人写）
node --import tsx scripts/e2e/oracle/goldcollect.mjs --build-fixture --gold TEMP/goldfix/gold-forest_01-r1.json \
  --dir scripts/e2e/fixtures/forest_01/oracle-gold --tolerance 25 --outcome-window 128
# 终验
node --import tsx scripts/e2e/routetool/fixture-runner.mjs          # 5/5 PASS, exit 0
node --import tsx scripts/e2e/routetool/fixture-runner.mjs --filter oracle-gold --update   # 必须拒绝
```
