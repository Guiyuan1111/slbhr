# 00 · 总索引——行为复刻战役档卷与工具链（behavior-parity）

> 维护：docsync 槽 2026-10-18 首建。口径：每号档一行（档名+一句话结论+状态），底部工具链速查与挂账清单；一切结论以各档原文与 git log 为准，本索引只做导航与现状摘要。
> 状态图例：✅ 收官（档卷+对应代码提交已入库）｜🔄 进行中（槽位在写）｜⏸ 挂账（有明确遗留动作）。

## §1 档卷一览（01–12）

| # | 档卷 | 一句话结论 | 状态 |
|---|---|---|---|
| 01 | [01-survey.md](01-survey.md) 方法论与开源先例调研 | 无 bit-exact 通道（原版=另一引擎+可变 dt），现实目标=「输入→结局分布等价」；业界先例（OpenMW/Ruffle/OpenRA）全走「原版当 oracle 的差分测试+固定 tick 金输出」；性价比最高发现=CDP 虚拟时间确定性化（后经 02 冒烟部分证伪，退路 A 强化落地） | ✅ 3b5bea6 |
| 02 | [02-vt-oracle.md](02-vt-oracle.md) 虚拟钟 oracle 机 | CDP 虚拟时间管不住 rAF（Date.now 可虚拟化、beginFrame 协议错误）→ 定案 init-script 全假钟+Node `__vt.step(n)` 逐帧放行（四道确定性防线），×3 BITEXACT；forest_01 差分对=出生点偏置 0.0135px、动态中位 16.2px/峰 98.7px、双方 WIN（内核 2365 vs oracle 2463） | ✅ 86fe4e9+48bf06e |
| 03 | [03-dt-sweep.md](03-dt-sweep.md) dt 敏感度谱 | 可扫仅 12/48 关（路线库缺口），11 条通关路线 7 条跨 dt 结局翻转、±8ms 抖动即翻 7 条；风阻尼 ×0.975/步=唯一内核 1/60 硬假设；无全局翻动依据（§9 勘误：forest_03 翻转非阻尼驱动，见 07 号档复扫） | ✅ 906a755+ae5d723（勘误 88dce2f） |
| 04 | [04-fixtures.md](04-fixtures.md) 金轨迹 fixture 协议 | Ruffle tests/swfs 协议的内核侧对应物：`fixtures/<level>/<case>/` = route.json+meta.json+expected.json；tolerance 0=位级 / >0=atol，帧号与结局 status 恒精确；oracle 金输出接入预案（§5） | ✅ 93323ba+f241b63+1576770 |
| 05 | [05-synthesis.md](05-synthesis.md) 三线实施综合 | 三线互证钉死「行为对齐走固定 60Hz 对拍」战略：dt 整数量化机理（02/03 互证）、P1-D2 维持降级；行动清单四项（风阻尼修复→oracle 金接入→风相位对拍→路线库补全），后全部落地或挂账见 §3 | ✅ 79342f4 |
| 06 | [06-oracle-gold-fixtures.md](06-oracle-gold-fixtures.md) oracle 金 fixture 首例 | 首例 `forest_01/oracle-gold`：实录 dt 序列 [17,17,16] 循环，「同 dt 序列⇒逐位」证伪（出生点 0.0135px+行为差距主导），tolerance=25px / outcomeWindowF=128 定值依据齐；48 关铺开预案（§7）与内核优化路线 0.8% 跑速偏置不可移植结论（§5）。容差口径后经 09/11 两轮重定（25→30），见 §3 挂账 5 | ✅ cdb038e+a431e07+b5854d2+787b90d |
| 07 | [07-wind-damping-semantics.md](07-wind-damping-semantics.md) 风阻尼语义裁定 | oracle=dt 加权 `0.975^(dt·60)`（bundle L59569 字节直证），内核旧「每步 ×0.975」只是 1/60 特化 → 已修（4198ef3）位级中性：det r32 48/48+fixtures 零漂、基线不 bump；forest_26 复扫收窄 2-37%、forest_03 翻转归因证伪；推力去钳同批（99ed9fc） | ✅ 88dce2f |
| 08 | [08-round2.md](08-round2.md) 二轮综合+状态板 | 行动项 1（风阻尼）✅、3（风相位）✅、2（oracle 金）首例落册全网 6/6 PASS、4（路线库补全）⏸ 与机器探索线决策联动；状态板=本索引 §3 挂账的上游 | ✅ fff8338+8845c5b |
| 09 | [09-wind-phase.md](09-wind-phase.md) 风 sin 相位对拍 | 时钟源裁定：oracle 风钟=game.time.now=本帧 rAF ts 取整（引文 L14653/L25938/L24247）；与内核 simTimeS 恒差 16.333ms=读点区间端点约定差+首 dt 钳残差，力公式 1010 笔 float64 闭环（max 3.55e-14）；forest_26/oracle-gold 落册（风关首例）；内核锚定改时未采纳留作可逆后续（§3 挂账 4） | ✅ c53d0e0+252c967+49185bc+3282ac0 |
| 10 | [10-rotation-system.md](10-rotation-system.md) 旋转体系全链路仲裁 | 用户「旋转没原版好」终审=物理面位级同源（对拍 max\|Δθ\|≤1.9e-4°，采样器单 tick 约定修正后），根因在表现层：Colyseus 默认 20Hz patch×客户端直贴=阶梯渲染 → 客户端 mechTarget 平滑已修（7903c57，rms 0.308°→0.232°、冻结 9→0 帧）；后续 1/2 转交 netopt（已落地，见 §3 挂账 5） | ✅ f660a41 |
| 11 | [11-network-and-alignment.md](11-network-and-alignment.md) 网络同步与量具收紧 | netopt 槽：patch 20→60Hz（4ba8478，带宽 ×2.8-3.0≈+1.3-1.9KB/s 可忽略）、self 角色 dead-reckoning lead 50→17ms（3e72433，rms 5.85→0.16px）、oracle-gold 采样对齐 alignShift=1（9ff9c1d，中位归零；win 帧 +96f 归因修正=oracle 终幕 tuck 动画）、tolerance 无偏重定 25→30/173→177；e2e 三门禁全绿 | ✅ 269d83d |
| 12 | [12-animation-audit.md](12-animation-audit.md) 动画保真度排查 | 状态级对拍（文字模型禁像素判读）：注册面 0 实义差异（getFrameIndexes 过滤字证）、切换序列逐事件同构、主家族双侧 30fps、循环长度 11/19/30/8/5 双侧一致、烟雾 ±2f；唯一实质差异=dying 即藏身已修（5b783e7，hidden 104/195→195/195 vs oracle 187/188）；大件挂账见 §3 挂账 3 | ✅ 623b372+5b783e7+e477f9c |

## §2 工具链速查

### scripts/e2e/oracle/ ——虚拟钟 oracle 机族（对原版 oracle 全程只读）

| 件 | 用途 | 用法 |
|---|---|---|
| lib.mjs | 虚拟钟机本体+采样器：init-script 全假钟（Date.now/rAF/定时器）+Node `__vt.step(n)` 逐帧放行；四道确定性防线（arm-at-create/负 elapsed 钳制/解冻冻结保持/settle 三段式起跑）；attachSampler 包 StateManager.update 采样（pre-step 约定，读数对齐 oracle[k+1]≡kernel[k]，见 10 号档 §3） | 被族内各件 import，不直接跑 |
| vtrun.mjs | 跑输入脚本导出逐帧状态流；`--runs N` 做 ×N 逐位一致性验收（BITEXACT/FIRST-DIFF 判读） | `node scripts/e2e/oracle/vtrun.mjs --route forest_01 --runs 3 --out ../../scripts/e2e/out/oracle-vt/`（`--hold-right 900` 自造脚本） |
| vtdiff.mjs | 内核（固定 1/60）vs oracle（虚拟 60Hz）forest_01 最小差分对：首发散帧/差值摘要/结局对照 | `node --import tsx scripts/e2e/oracle/vtdiff.mjs [--oracle <run json>] [--out <dir>]` |
| goldcollect.mjs | oracle 金输出采集（`--capture` ×N BITEXACT+dtSeq 实录）+内核同 dtSeq 回放比对（`--compare`，fixture tolerance 定值流程）；机写 route/dtschedule/expected 三件；按 filename 查 oracle temple.json 载关 | `node scripts/e2e/oracle/goldcollect.mjs --capture --route forest_01 --runs 2` ／ `--compare --gold <json> [--align-shift 1]` |
| windphase.mjs | 风 sin 相位对拍探针：时钟源读点取证+ApplyForce 力矢量闭环+轨迹 A/B 分账（P1/P2/P3 口径） | `node scripts/e2e/oracle/windphase.mjs --probe [--route forest_26] [--frames N] [--out TEMP/windphase]` |
| animprobe.mjs | 动画状态级对拍：oracle 虚拟钟 vs 真服 playwright 双侧同输入采样 head/legs/smoke/dying 序列（12 号档 STEP3） | `node scripts/e2e/oracle/animprobe.mjs --oracle` ／ `--client [--port 3591]` ／ `--report` |

### scripts/e2e/routetool/ 新增二件

| 件 | 用途 | 用法 |
|---|---|---|
| dtsweep.mjs | dt 调度谱扫描器：路线×合成调度（60/120/144/50Hz/±8ms 抖动/5% 尖峰）回跑内核，time/frame 双映射口径；**默认 outDir=TEMP 防覆盖档案（11119ca），写档案目录须显式 --outDir** | `node --import tsx scripts/e2e/routetool/dtsweep.mjs --all --outDir note/research/2026-10-behavior-parity/tools/dtsweep`（`--selftest` 自检／`--probe25` 政策探针） |
| fixture-runner.mjs | 金轨迹 fixture 回归 runner：route+meta+expected 目录协议；tolerance 0=位级 / >0=atol，帧号/结局 status 恒精确；meta 可选叶 compareEvents/comparePhase/compareVelocities/outcomeWindowF/alignShift（缺省关=原行为）；source=oracle 的 case 禁 `--update`（重录走 goldcollect） | `node --import tsx scripts/e2e/routetool/fixture-runner.mjs [--filter forest_01]`（无新依赖、不接 CI、无 npm script） |

### scripts/e2e/fixtures/ ——金轨迹回归网（当前 6 case，runner 6/6 PASS ×2 逐字一致）

| case | source | tolerance | 口径要点 |
|---|---|---|---|
| forest_01/main、forest_04/main、forest_12/main、forest_26/main | kernel-v1 | 0（位级锁行为） | route=inputs/routes 逐字节拷贝；forest_12=hanging 轴点修复行为锁、forest_26=风时钟缺省口径锁 |
| forest_01/oracle-gold | oracle | 30（alignShift=1） | dtSchedule=ms-quantized-rec（实录 [17,17,16]）；compareEvents/Phase/Velocities=false；outcomeWindowF=128；tolerance 25→30（netopt 无偏重定） |
| forest_26/oracle-gold | oracle | 177（alignShift=1） | 风关首例；PHASE=0 含 16.333ms 读点偏移全影响；tolerance 173→177（同上）；风段锚定后可收紧 ~120px 的 runner 扩展路径记 meta notes |

## §3 当前挂账清单（自各档 §挂账/§状态板提取，2026-10-18 口径）

1. **oracle-gold 48 关铺开待路线**（08 状态板 #2、06 号档 §7）：可扫路线仅 12/48（03 号档 §3 覆盖率诚实口径）；内核优化路线带 0.8% 跑速偏置、跨引擎不可移植（06 §5）→ 行为网供给方应是 oracle 自搜路线，与挂账 2 联动。
2. **机器探索线三选一**（05 号档 §3，决策呈用户待裁）：auto-build 产线复活不只是通关供给，是 48 关 dt 谱与 fixture 行为网的路线供给方，复活=同时补齐行为复刻覆盖率瓶颈。
3. **表现层大件**（12 号档 §5）：①液体冻结/冰面演出族（机制+表现一体、工作量档大；森林 48 关无用例，大庙开荒随机制一并做）②Portal 渲染族（中档；森林/教学关数据 0 用例）。TOP3 结算楼梯已实现、仅剩 <1 帧级微差，不需要做。
4. **风相位内核锚定改时未采纳**（08 状态板 #3、09 号档）：WorldOptions.windClockS+16.333ms 修正入口已内建，未采纳——动风钟漂 det 基线、生产固定 dt 下玩家不可见，留作可逆后续。存疑待核：其收益数字（oracle-gold 容差收紧 173→~120px）系 alignShift 重定前口径，11 号档 tolerance 已改 177，若启动需按新口径重估。
5. **已完成销账**（原 10 号档 §5 后续 1/2，netopt 槽落地，代码+档卷提交可核）：+1 采样对齐收紧 → 9ff9c1d（alignShift=1+两关 tolerance 重定，档卷 269d83d）；服务器 setPatchRate(1000/60) → 4ba8478（档卷同上）。

## §4 性能优化战役速查（2026-10-18/19 七轮，perfsum 槽补录·主会话续记）

> 行为复刻战役之外的姊妹战役：七轮 22 件（含两件负结论测量件）全部位级中性（det 48/48 锚=det-r0-baseline + fixtures 6/6 + patch 字节逐字不变贯穿），本节只做导航，数字以各轮报告与 `benchmark/results/` 快照为准。总账：[note/report/perf/2026-10-18-campaign-summary.md](../../report/perf/2026-10-18-campaign-summary.md)。

| 轮 | 报告 | 一句话 | 终态 commit |
|---|---|---|---|
| r0 基线 | [2026-10-18-r0-baseline.md](../../report/perf/2026-10-18-r0-baseline.md) | 七件基准全量落快照+三新件（serialize/routeio/mem），det 新锚 r0-baseline；负载口径发现（空载 vs scripted 2~6×） | `a81cdb5` |
| r1 tick 链 | [2026-10-18-r1-optimization.md](../../report/perf/2026-10-18-r1-optimization.md) | 四件：步进 -15~-22%、sync -54~-63%（patch 字节不变）、回放 +17.4%；r0 溢价归因勘误（尾帧稀释伪影） | `264781b` |
| r2 世界构建 | [2026-10-18-r2-optimization.md](../../report/perf/2026-10-18-r2-optimization.md) | 六件：World 构建 10.5×（-82~-90%）、常驻内存 -76%、50 并发 -77%、回放再 +10%；剖析修正解析层假设（仅 2-4%） | `bb3b4ab` |
| r3 客户端帧预算 | [2026-10-18-r3-client.md](../../report/perf/2026-10-18-r3-client.md) | 三件零稳态分配/脏标记守卫：update 分配份额 -97%、setDepth 968→0、页面分配 -19%；新增 perf-client；前任槽关机事故 3b 收尾披露 | `9dea930` |
| r4 encode | [2026-10-18-r4-encode.md](../../report/perf/2026-10-18-r4-encode.md) | 头号产出=勘误（基准缺 discardChanges 累积伪影 29.5×，生产真值小一个量级）+件2 $filter 遮蔽 enc -10~12%（字节逐字不变） | `a68c0bc` |
| r5 冷启动 | [2026-10-18-r5-coldstart.md](../../report/perf/2026-10-18-r5-coldstart.md) | 瓶颈翻案（网络/base64 非瓶颈，真凶=图片装载串行段+首帧渲染）；装载序整形冷启 Menu -32%、传输 -1.19MB/-8req | `71f4cff` |
| r6 音频/容量/工具链 | [r6-audio-warmup](../../report/perf/2026-10-18-r6-audio-warmup.md) / [r6-capacity](../../report/perf/2026-10-18-r6-capacity.md) / [r6-toolchain](../../report/perf/2026-10-18-r6-toolchain.md) | 三槽并行（重启断点续作）：音频就绪点提前至 Menu 驻留+941ms；容量拐点 96 房/192 客户端（建议 ≤64 房/实例）；det 门禁 -44%+typecheck -38%+堵 DET_WORKERS 静默绿漏洞 | `10c6400` |
| r7 负结论轮 | [r7-capacity-attribution](../../report/perf/2026-10-19-r7-capacity-attribution.md) / [r7-font-subset](../../report/perf/2026-10-19-r7-font-subset.md) / [r7-render](../../report/perf/2026-10-19-r7-render.md) | GPU 黑名单勘误解锁（--gpu 量具 SVGA3D 实证）；容量 6.4ms/s/房拆面闭合（stime 主导）；font 实测关闭（-5.2%，授权未动用）；渲染段 JS 面理论地板 | `535abb6` |

遗留候选与 vendor 必漂禁区清单（SolveTOI/InsertLeaf/goog.base/关节求解序——永挂账不动）见总账报告 §四。

## 附录 · 文档盘点记录（docsync 槽，2026-10-18）

| 项 | 盘点结论 | 处置 |
|---|---|---|
| 本目录 01–12 号档 | 12/12 全部收官入库（11 号档由 netopt 槽于本次盘点进行中提交，269d83d，索引已随之更新状态） | 建本索引 |
| gyのFW/README.md | 版本横幅停在 0.3.28（缺 0.3.29-31 与发版后行为复刻线）；无验证/量具章节 | 已更新：横幅更至 0.3.31+行为复刻线概述，新增「验证与量具」节指向本索引 |
| 根 README.md | det 基线示例 `--compare r30` 过期（现役 **r32**，det-r32.json，24c5e0f 定版；风阻尼修复位级中性故不 bump）；文档入口缺 research 档卷；关卡账目缺 forest_25 豁免候选待追认注记 | 已更新三处 |
| note/ubuntu-server-profile.md | 2026-10-15 接管日快照，逐项核对当下实态（22/80/443/3389/8787/11010/15888/23107 监听在、EasyTier/1Panel/RDP 描述相符、3700 游玩服为可起停运行态非档案项） | 相符，未改 |
| benchmark/README.md | perf-step/load/sync 三新基准与 r0 基线 bench 槽在写（未完不成文） | 不碰，待 bench 收官后另次同步 |
| 不碰清单 | note/handoff.md（各槽自记）、note/report/perf/2026-10-18-*（bench 在写）、note/research/2026-10-18-perf-hotspot/（hotspot 在写）、11-network-and-alignment.md（netopt 在写）、一切代码 | 未动 |
