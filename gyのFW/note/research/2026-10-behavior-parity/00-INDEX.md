# 00 · 总索引——行为复刻战役档卷与工具链（behavior-parity）

> 维护：docsync 槽 2026-10-18 首建。口径：每号档一行（档名+一句话结论+状态），底部工具链速查与挂账清单；一切结论以各档原文与 git log 为准，本索引只做导航与现状摘要。
> 状态图例：✅ 收官（档卷+对应代码提交已入库）｜🔄 进行中（槽位在写）｜⏸ 挂账（有明确遗留动作）。

## §1 档卷一览（01–16）

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
| 13 | [13-ui-transition-audit.md](13-ui-transition-audit.md) UI 转场动画保真审计（只读考古） | oracle 换屏全走自建 state.fade 黑幕（500+500ms+Loading 点循环 800/300ms，bundle:2213815；camera.fade/flash 0 命中），我方全裸切；面板滑入=弹簧（force 2.3/friction 0.7/起点 1.5H）非 Back.easeOut 420ms、黑幕跟板动态；popupArrow 系末拍单帧恒亮非 2fps 闪烁、星碑分段 to_N 非累计播放、按钮换帧=按压语义非 hover——41 项盘点（LevelMenu 无 stagger、NewSign 无弹跳两假设证伪）：已复刻 10/偏差 18/缺失 10/不适用 3，Top6 建议在档 | ✅ 大批已实施（0.3.37 二十五项 B–E 批+0.3.39 遗留四件/两划销，逐项见档卷 §实施记录；#34→16 号档 P-02 已裁按原版） |
| 14 | [14-audio-audit.md](14-audio-audit.md) 音效保真度审计（只读考古） | oracle 33 键全景（Boot 全载+menu 态 2 键+level 态 18+按图追加；主音量 0.1、**fx=总静音含 BGM**、music 只 gate BGM 起停而 one-shot 曲目无门、endFail 双方同死资产）；我方 19 键：适用面参数全一致（0.1/0.5/0.2/loop），缺失触发 1 类=**UI 按钮点击音全缺**（oracle 每钮播 pusher）、触发不一致 9（速度关终局曲错装+底噪叠播、**退场 scene.stop 不停音泄漏进菜单**、门控语义、fadeOut、puzzle 空拍、平台音粒度）、资产缺 14 键经 58 份森林地图字证除 charToggle（单模式）外全 0 用例；Top3 建议在档 | ✅ 大批已实施（0.3.38 音效六件 T2-T6/T8；T1/T9 被 0.3.36/37 覆盖划销；T7 用户裁保留全静；T10 随机制批） |
| 15 | [15-camera-vfx-audit.md](15-camera-vfx-audit.md) 镜头行为与场景环境 VFX 审计（只读考古） | oracle 真相机=自建 CameraManager（root 容器双角色适配+弹簧 1/15·阻尼 0.5+滚轮 0.8/1.2+捏合+关卡矩形钳边；Phaser camera 游戏侧 0 操作、GameConfig.zooming 0.9/0.97/1.5、40×30 格钳 id=forest 恒桌面），我方 0.3.29-F4 参数面 14 项全对齐、行为面 7 偏差（focusOn 取整/pan 除数/捏合平移补偿/wheel 监听面/移动判定/cursors 闸/16px 钳边域差=38 号档 settled scroll 同源）；ambient VFX 侧 Navies/液体/钻石/decor/层序全一致，实质缺口 4=风 off 400ms 延迟停帧+effect 相位常驻缺、平台灯组色 tint 缺、暂停非全画面静帧（game.paused 语义），休眠件 3 族（尘埃/dark/雪面森林 0 用例双侧等价）——缺失 8（可见 5+休眠 3）/偏差 7/一致 16，Top3（均 S）在档 | ✅ Top3 已实施（0.3.38 V13 灯 tint/V9-V10 风停帧/V17 暂停静帧）；行为面 7 偏差中 16px 钳边随 F2 相机修复归零（0.3.38） |
| 16 | [16-original-improve-proposals.md](16-original-improve-proposals.md) 原版不合理优化提案池（方针档） | 2026-10-20 用户立线：此类优化须先审后行；流程=提案卡→用户审→批准派槽→回验收。已裁 #0 T7 关音乐全静（保留我方）、P-02 CompleteScene 已实施并终裁按原版（字节真相=firstComplete 系全 48 关 3 星 100% 一次性庆典，非单关首通）；待审 P-01 隐藏行静音/P-03 缺陷关重设计；P-04 征集机制常开（issue 带 original-optimize 入池） | 🔄 常开 |

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

## §3 当前挂账清单（2026-10-20 重提取口径）

> 2026-10-20 挂账重提取槽全库重提取（grep 全部档卷 `note/research/*/`+`note/handoff.md`，逐条核最近一次状态提及，不照抄旧条目），替代 2026-10-18 老快照口径；每条附「来源档卷与最近验证」。旧六条去向：1→挂账 #1、2→已变异并入挂账 #2（用户已拍板 A 方案）、3→挂账 #3、4→挂账 #4、5→移入销账区、6→挂账 #5。性质图例：待用户裁决｜待实施｜待核。

### 3.1 挂账区（当前真实未收口）

| # | 事项 | 来源档卷与最近验证 | 性质 |
|---|---|---|---|
| 1 | **oracle-gold 48 关铺开待路线**：行为网仍 6 case（01/04/12/26 各 main+oracle-gold）；可扫路线 12/48 缺口未变；内核优化路线带 0.8% 跑速偏置、跨引擎不可移植（06 §5）→ 供给方须 oracle 自搜路线，与 #2 联动 | 06 号档 §7（预案原文）；最近验证=autoplay 03 号档验收门未达成（2026-10-19）+ `scripts/e2e/fixtures` 复点 6 case（2026-10-20） | 待实施（前置=#2 路线供给） |
| 2 | **机器探索线 A 方案攻坚断点**（原 05 号档「三选一」已变异）：用户已拍板 A（auto-build 复活）；r8a S4 定稿门队史首破，S5 停于 exFatal 刀锋（wg[47] left-down@1375 −1f 级联，乘升振荡相位×缝差耦合锚点层不可解，v20-v24 五变体同败）超预算止损；r8c 续攻槽死于宿主重启（probe8c.mjs 未验跑）；断点 tools/r5.search.json 可续、最优种子 v24 已固化 autosearch.mjs；整关 WIN 未达，现役整关导出仍前槽 s7j 脆弱件（±1f 365/614） | autoplay 03 号档 §3b 断点 24-27（2026-10-19 15:29 更新）+handoff 2026-10-19 ④⑤；tools/{r5.search.json,probe8c.mjs} 复点在库（2026-10-20） | 待用户裁决（续攻 S5 ／切 B 绿迹提取半自动） |
| 3 | **表现层大件两族**：①液体冻结/冰面演出族（前置 Beamer→Liquid 冻结机制，内核无 frozen/beamer，森林 48 关 0 用例 level2.ts:540）②Portal 渲染族（森林/教学关数据 0 用例）；机制+表现一体，大庙开荒随机制一并做 | 12 号档 §5（2026-10-18）；最近验证=10-19/10-20 全档卷无新提及、无用例落库（2026-10-20 复查） | 待实施（低优先，用例/大庙开荒触发） |
| 4 | **风相位内核锚定未采纳**：WorldOptions.windClockS+16.333ms 修正入口已内建，未采纳——动风钟漂 det 基线、生产固定 dt 下玩家不可见，留作可逆后续；存疑待核：收益数字 173→~120px 系 alignShift 重定前口径，11 号档 tolerance 已改 177，若启动须按新口径重估 | 09 号档（2026-10-18）+11 号档 177 重定（档卷 269d83d）；最近验证=10-19/10-20 无新提及（2026-10-20 复查） | 待用户裁决（默认不做） |
| 5 | **r8–r11 战役剩余挂账**：①幕布驻留税——石板大厅 backdrop-filter 驻留期成本待真 GPU 口径复测（前置：本机 sudo/su 均被禁、xorg9 不可复现）②matchmake 点击派发管线成本（两态共有，低优先）③temple 态 heap 58MB（非每帧成本，披露性记账） | 总账 §八「剩余挂账」（[2026-10-18-campaign-summary.md](../../report/perf/2026-10-18-campaign-summary.md)）+handoff 2026-10-20 r8–r11 条目；挂账落点 r9 `78c2d30` | ①待核 ②待实施（低优先） |
| 6 | ~~e2e 场景脚本未跟版本（基线同败 3 项）~~ **已收口（2026-10-20，销账迁移 §3.2；编号保留防引用断裂）** | §3.2 销账区对应行 | 已销账（`3caa1cf`+`ac1ee09`） |
| 7 | ~~visual-diff 分数带漂移待核~~ **已收口（2026-10-20，迁移 §3.2；编号保留）**：39 号档定谳=量具 bug（#hud 子树入镜净扣 3.35-4.1），截帧口径已修+新带 90.55-92.86 入配置（`d98f19b`+`37fbd2b`） | fidelity/00-INDEX §2 行 39+39 号档 §7 | 已销账 |
| 8 | **选关树滤镜残余四处**（0.3.35 落地余项）：①水平仿射 ~1.5e-3+0.25px＝FilterTexture texel 1037 vs 逻辑 1036.8 回贴映射假说，未做机理级证明（不影响门禁，门禁按经验仿射对齐）②边缘带 ~2.4% 像素 >10 亚像素相位（双方同族色）③中线 ±2 窗 18 点未中（±10 门禁全过，信息性）④金层近边采样认知已修正（记录性） | 37 号档 §7.3-7.4（`fa17e12`）+handoff 2026-10-20 滤镜条目 ③ | 待核（低优先，门禁已过） |
| 9 | **选关树按钮层三小件**：锁图标视觉与 oracle 石钻观感差异、NewSign **已实现（0.3.39 `985914a`，fw-played-v1+markPlayed，oracle setPlayed :1935016 同语义）**、BackButton 微位——37 号档记录「维持不动」，是否立项 UI 校准轮待裁 | 37 号档 §3.1/§7.4-4（`fa17e12`）+handoff 2026-10-19 ② | 待用户裁决 |
| 10 | **连接面板方向 A 遗留小件**：①连接失败横幅 raw 错误串直通（如 "[object ProgressEvent]"，0.3.32 同款 catch 行为，非回归）②<560px 回流皮石纹边中段拉伸与 74px 角片比例失配（小屏不显眼；若立项可换方向 C 双门布局，同套帧坐标资产直接复用） | connect-ui README §既有问题/§遗留（`31a277d`）+handoff 2026-10-19 ⑤；最近验证=10-20 无后续收口（2026-10-20 复查） | ①待实施（低优先）②待用户裁决 |
| 11 | **官方素材二进制再编码（冷启动 88.8% 字节的面额）**：15 个 ≥64KB 未压缩响应合计 **6148.5KB**（`font.png` 1600.6 / `LevelMusic` 1285.4 / 四张图集 PNG 1814.1 / 其余音频），br/gzip 对其无效。候选=图集 PNG→WebP-lossless 或 AVIF-lossless、MP3 重压。**损像素/损听感与老浏览器解码面**，属兼容性红线；已排除的旁路：`font.png` 裁剪（alpha 包围盒 98.7%）、调色板化（6264 唯一 RGBA 色）、libpng L9（≈现产物尺寸）、字形子集（−5.2% 低于 20% 停线） | r15 报告 §二/§七（[2026-10-21-r15-cold-start-transfer.md](../../report/perf/2026-10-21-r15-cold-start-transfer.md)）+快照 `benchmark/results/load-r15-after.json` 逐 URL 账；**r16 件A 后**：speed 关不再取 general 族（`LevelMusic` 1285.4 已离路径），general 关仍付这支；工具可用性本机已核实 | **待用户裁决**（未擅自动手） |
| 12 | **战役 r12–r16 剩余挂账**：①~~进房段 `LevelMusicFinish/Over/_speed` 四轨 500.6KB 按相位分池~~ **r16 改按关卡类型分族收口**（`ac0516f`：general −176.7KB / speed −1449.4KB），而"按相位推迟取结算轨"的件B **判负不做**——弱网下 `won`/`gameover` 到达时轨可能真缺席＝行为回归，弱网手测未做 ②perf-load **隧道节流档**（`--rtt`/CDP emulate）未实现，r15/r16 的字节收益仍靠换算而非实测延迟（speed 关 −1449KB 在 2Mbps ≈ 少等 5.8s）③真机 GPU 口径 `texMB`/烘焙峰值、`prepareGround/buildGround` 命中计数 ④换关链剩余 ≈45ms（Game 场景创建与图集取用）⑤服务端 tick 侧候选 ⑥LAN 剪贴板/BGM 听感/真机触屏弱网手测 ⑦**r17 候选**：四张图集 PNG 的分场景装载（temple 态用不到 game 图集，反之亦然） | 总账 §九～§十三「剩余挂账」+ 各轮报告 §挂账；r17 候选证据=r16 报告 §八 | ②③④⑤⑦待实施/待核 ⑥待用户手测 |

### 3.2 销账区（旧条目/查核项已收口，保可追溯）

| 原条目/查核项 | 销账事实 | 销账 commit |
|---|---|---|
| §3-7 visual-diff 分数带漂移待核 | 39 号档定谳=量具 bug（"DOM 不入镜"被证伪：#hud 木牌化后入镜净扣 3.35-4.1 分），截帧口径修复+repeat5 重定带 90.55-92.86 中位 91.44 入量具配置；水体关同带佐证 F1 冰膜伪差定谳 | `d98f19b`+`37fbd2b` |
| §3-9 选关树按钮层三小件之 NewSign | 0.3.39 收尾批实现：TempleScene 静态贴片+fw-played-v1 played 集+进关 markPlayed（oracle setPlayed :1935016 同语义）；余锁图标观感/BackButton 微位仍挂 | `985914a` |
| 原 §3-6 e2e 场景脚本未跟版本（journey 回面板预选 ×2+touch tap Δy=0 ×1，基线同败 3 项） | 两件三查全收口（2026-10-20 journey/touch 修复槽）：①journey 场景 1 按 0.3.12 活房间 advance 语义改写——旧「联机面板弹出并预选下一关」×2 随语义退役，新 7 项断言（phase=won 权威闸/双端 levelId 回声同房留场/面板不弹出+EndMenu 关+Game 重建（0.3.37 黑幕包络状态轮询零 sleep）/ready→started/席位保留×2/权威时钟续走）双跑 7/7 ALL PASS（self-acceptance §三 L3 行同步改写）；②touch tap 定谳=Playwright 1.63 touchscreen.tap 并发齐发 touchStart/End（coreBundle.js Promise.all），按钮同帧 down/up→两条 input WS 1ms 内到达→服务端 tick 意图跨度排水同一步消费对消（ForestRoom.ts:348-353；FW_DUMP 字证 step=50 at=821ms up=true/at=822ms up=false 同步对消，物理步采样 up=false）——非内核开关/坐标换算问题（纯页 tap 三路径取证+真实应用三层隔离+CDP hold 扫描 0-150ms 全过）；探针改 CDP Input.dispatchTouchEvent 顺序注入+人手量级 90ms 按压，Δy 0.0→30.7/32.5px，双跑 6/6 PASS | journey `3caa1cf`+touch `ac1ee09`（connect-ui README §既有问题两行已注收口） |
| 旧 §3-5（原 10 号档 §5 后续 1/2：+1 采样对齐收紧、服务器 setPatchRate(1000/60)） | netopt 槽 2026-10-18 落地：alignShift=1+两 oracle-gold tolerance 无偏重定 25→30/173→177；setPatchRate(1000/60)+FW_PATCH_MS 回退钩子，带宽实测 ×2.8-3.0 可忽略；档卷 11 号档 | 代码 `9ff9c1d`+`4ba8478`（档卷 `269d83d`） |
| census 防护网首跑 88/89（2026-10-20 重提取查核项，原疑挂账） | 非挂账：换肤新文案按设计触发 font census 防护网，按 census.ts 自述刷新 used-chars 247→248 即绿（client 源字符 395→527、fnt 交集 247→248） | `3808338` |
| 发版 tag 惯例（重提取初版挂账 #11，源自文档审计观察项"tag 止于 0.3.9"） | 已收口：该观察系抽样误读（`git tag -l` 字典序+tail -5 遮蔽 0.3.10–0.3.31 段），实际一直有 tag；缺口仅 0.3.32–0.3.35 且远端已在（并行工作流所打），本地重打与之冲突→删本地重复+fetch 收敛；现 0.3.1–0.3.35 全覆盖（36 tag）、本地=远端逐标签一致、四标签均锚定正确发版提交（8e71487/477cec0/44be8f1/92f7fc3）；惯例=今后每版发版随手打注解 tag 并推送 | 无代码面（git tag 收敛核验 2026-10-20，本地/远端 diff 为空） |

## §4 性能优化战役速查（2026-10-18/19 七轮 + 2026-10-20 r8–r11 续账 + 2026-10-21 r12–r16，perfsum 槽补录·主会话续记）

> 行为复刻战役之外的姊妹战役：七轮 22 件（含两件负结论测量件）全部位级中性（det 48/48 锚=det-r0-baseline + fixtures 6/6 + patch 字节逐字不变贯穿），r8–r11 四轮续账（0.3.34 收账，零生产 diff 面）同纪律，本节只做导航，数字以各轮报告与 `benchmark/results/` 快照为准。总账：[note/report/perf/2026-10-18-campaign-summary.md](../../report/perf/2026-10-18-campaign-summary.md)。

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
| r8 场景切换链 | [2026-10-20-r8-scene-switch](../../report/perf/2026-10-20-r8-scene-switch.md) | 点击→Game 驻留配对 -11.0%（连接窗三段 -49.5/-76.5/-93.3%：连接忙期画布冻结/事件驱动/temple.json 单例/关卡缓存）；换肤幕布性能税 +364ms 归档并连接期回收 | `9799145` |
| r9 空闲 CPU | [2026-10-20-r9-idle-power](../../report/perf/2026-10-20-r9-idle-power.md) | 负结论轮：JS 面 script%<2% 地板、task%=软栅环境项；帧率上限弃件（慢机砍帧 67→48=视觉回归红线）；幕布驻留税挂账真 GPU 口径 | `78c2d30` |
| r10 工具链 | [2026-10-20-r10-toolchain](../../report/perf/2026-10-20-r10-toolchain.md) | vitest threads 池 -12%、build 去 npm 嵌套层 -6.8%（dist md5 逐字节不变）；判负 sync-assets 增量/gzip 报表 | `cc5d6b4` |
| r11 GC 拆账 | [2026-10-20-r11-gc-attribution](../../report/perf/2026-10-20-r11-gc-attribution.md) | GC 份额 0-0.4% 三场景非因素、无并发膨胀；r0「166 vs 14」勘误=跨关伪影；bonus_2 158ms/建=前 60 步固有收敛 | `a57532e` |
| r12 帧内写入 | [2026-10-21-r12-client-frame-writes](../../report/perf/2026-10-21-r12-client-frame-writes.md) | T10 平台声改标量入参、相机弹簧亚像素吸附走脏守卫、HUD 补偿按 zoom 独立守卫：相机写 −85~−94%、帧分配 1149→1044 / 2438→2246 KB·s⁻¹ | `6221aeb`+`e7a788e` |
| r13 换关链 | [2026-10-21-r13-advance-chain-prefetch](../../report/perf/2026-10-21-r13-advance-chain-prefetch.md) | 地面字节记账 LRU(24MB) + won 后预取预烘下一关 + 同 canvas 免纹理重传：烘焙 71.4→16.9ms、链内网络 35.7→0（8/8）、点继续→可玩 1239.6→1045.0ms；**帧内分配线判至库内地板结案** | `47c4e18`+`09c6c13`+`9cd0c3a` |
| r14 驻留内存 | [2026-10-21-r14-temple-resident-memory](../../report/perf/2026-10-21-r14-temple-resident-memory.md) | 烘焙逐层流水线+分带收尾、树纹理重进免重传、离房清地面 LRU、levelCache 有界(4)：在飞峰 33.31→11.97MB、冷烘流水 −33.4%、重进 15.6→5.5MB/次、离房驻留 33.5→28.6MB；新金样门禁 `treebake.mjs` | `e02fe86`+`9412c62`+`62bf35f`+`6cbef64`+`626bf80` |
| r15 传输字节/缓存契约 | [2026-10-21-r15-cold-start-transfer](../../report/perf/2026-10-21-r15-cold-start-transfer.md) | 逐 URL 传输/响应头/集合差归段 + Node 侧条件复验探测；压缩路径补**编码入强 ETag**+304（0.3.21 静默回归）、关卡 API 内容寻址 ETag+br/gzip 协商：API 16.9→1.8KB（−89.3%）、br 带校验器 0/14→15/15、复验探测 6912→0KB | `754d136`+`aede24f`+`a29dde3`+`fbc8ba3` |
| r16 进房音频分族 | [2026-10-21-r16-audio-family-by-level-type](../../report/perf/2026-10-21-r16-audio-family-by-level-type.md) | 音频清单按 `templeType` 拆 general/speed 族，装载点/暖装只取目标族（对齐原版 `preloadAudioFiles` 语义）：general 关音轨 **2165.3→1988.6KB（−176.7）**、speed 关 **2165.3→715.9KB（−1449.4）**、speed 深链点击→Game 段 **−50.5%**、48 关全逛省 **20.7MB**；驻留 PCM 24.96→21.81/11.44MB；新门禁 `audiofamily.mjs` 14/14；**按相位推迟结算轨判负**（弱网行为回归红线） | `c83c805`+`0496baf`+`58b87f7`+`ac0516f` |

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
