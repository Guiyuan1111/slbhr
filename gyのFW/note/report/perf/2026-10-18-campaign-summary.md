# 性能优化战役 · 总账（2026-10-18/19 七轮 r0–r7 收官 + 2026-10-20 §八 r8–r11 + 2026-10-21 §九 r12 增补）

> 2026-10-18 · perfsum 槽 · **零代码改动**（本报告与文档收口为纯文档件）；
> r6 段由主会话补记（三 Flash 槽并行收官后独立复验追加）；r7 段主会话补记（负结论轮）。
> 覆盖：r0 基线 → r1 服务端 tick 链 → r2 世界构建吞吐 → r3 客户端帧预算 → r4 encode 勘误+微优 → r5 冷启动
> → r6 音频暖装+容量基准+工具链（三槽并行，宿主机重启一次断点续作）
> → r7 真实 GPU 口径解锁+容量挂账归因+font 子集化评测+渲染段剖析（负结论轮：三测量件+1 勘误件）。
> 数字纪律：**全部数字逐项回溯到各轮报告原文、commit 消息与 `benchmark/results/*.json` 快照三方可核**，
> 禁新造数；各轮 commit 消息与报告/存档快照不一致处如实并列披露（§五），不擅自改数。
> 位级红线终态：**det 48/48（锚=det-r0-baseline，全六轮逐件复跑全绿；r6 起门禁本体并行化，
> 三方对照 r0 快照=串行回退=并行缺省 combined sha 同为 `34425e393ba1fa69…`）+ fixtures 6/6（oracle-gold
> 24.5357/142.6879 与 r0 逐字同值）+ patch 出站字节逐字不变**。

## 〇、七轮总表

| 轮 | 焦点 | commit 链（一件一 commit） | 件数 | 关键前后数字（同机同口径） | 门禁 |
|---|---|---|---|---|---|
| r0 | 基线（测量，零代码） | `dd93e66`→`9e1ac7b`→`6238f5a`→`cf093f3`→`a81cdb5` | 4 既有基准快照 + 3 新基准（serialize/routeio/mem）+ 1 负载探针 | det 48/48（vs r32，新锚 `det-r0-baseline`·链哈希 `34425e393ba1fa69…`）+ fixtures 6/6；perf-step 48 关空载 avg **0.0227ms**（bonus_2 0.3752）；perf-load Menu 1078ms/4862KB·22req、reload 3KB；perf-sync f01 347B/bonus_2 2646B（旧口径，后勘误）；perf-serialize 60Hz patch 370/450/2685B、线路 21.7/26.4/157.3KB/s（伪影口径，后勘误）；perf-routeio **10.34 关/s**、World 构建 9.4~11.1ms；perf-mem 常驻 2.9/4.47MB | det+fixtures（红线双判据全绿） |
| r1 | 服务端 tick 链（步进/快照/回放） | `fa4a806`→`07fc78a`→`2b7efa6`→`8d2b6d5`→`264781b` | 4 件 | perf-step 综合 **0.0227→0.0177ms（-22.0% 时点；终态存档 0.0193，带 -15%~-22%）**，睡眠轻关最高 -58.5%；perf-sync sync 段 f01 **0.0210→0.0096ms（-54%）**/bonus_2 **0.0516→0.0191ms（-63%）**，patch 347/2646B 逐字不变；perf-routeio **10.34→12.14 关/s（+17.4%）**；r0 溢价归因勘误（§四） | det 48/48+fixtures 6/6 每件复跑+双路径 encodeAll 逐字节+e2e f01/f12 |
| r2 | 世界构建吞吐+冷启动盘点 | `c3661b0`→`e3c8d75`→`b2b9c47`→`cfeb2f8`→`130863a`→`55d580b`→`bb3b4ab` | 6 件 | **World 构建 9.2~11.0→1.0~2.0ms（-82%~-90%，110→1166 个/s=10.5×）**；回放 12.14→**13.35 关/s（+10.0%）**；每 World 常驻 01 **2.9→0.69MB（-76%）**/bonus_2 4.47→2.88MB（-36%）；50 并发峰值 **Δ152→35.2MB（-77%）**；创建销毁 78.4→251.6/s（+221%）；步进连带 -3%~-6%；冷启硬口径与 r0 逐字一致（无动作项） | det 48/48+fixtures 6/6 每件复跑（oracle-gold maxDev 与 r0 逐字同值） |
| r3 | 客户端帧预算 | `44ad165`→`158d395`→`be3d964`→`324d4f6`→`a96c636`→`9dea930` | 3 件+新基准 perf-client | **update() 分配份额 1044→31KB/s（-97%）**；页面总分配（canvas）**1374→1114KB/s（-19%）**；静止态 setDepth **968→0**/setAngle **2420→0**/setRotation **968→0**（/8s，depth 排序队列全消）；updateAvg **0.199→0.146ms**；满帧 60.6 维持；WebGL 分配 776KB/s 带内 | tsc/vitest 85/85+visual-diff 90.79/90.74（基线 89.42 同带）+e2e f01/f12 双 ALL PASS |
| r4 | 服务端 encode 段 | `3573bd6`→`f0118d3`→`5cee17e`→`a68c0bc` | 2 件（件1=基准口径勘误，件2=微优） | **头号产出=勘误**：patch 370/450/2685→**50/58/91B**（7.4×/7.8×/**29.5×** 伪影）、encCPU 3.08→0.21ms/仿真秒（9~13×）、60Hz 线路 21.7/26.4/157.3→**2.93/3.39/5.36KB/s/客户端**、tick 链占比 ~1-5% 非 ~10%（§四）；件2 $filter 遮蔽：enc/tick **f01 -10.1%/f12 -12.0%/bonus_2 -3.7%**（绝对 0.0001~0.0002ms/tick） | **4 关×600 帧双路径 patch+encodeAll 逐字节相等**+det 48/48+fixtures 6/6+e2e 双关静窗 |
| r5 | 冷启动资产管线 | `458bff2`→`476a254`→`71f4cff` | 1 件 | **冷启 Menu active 769→523.5ms（-32%，5 测中位；件 commit 时点读数 471ms/-39%）**；Menu 传输 **4863→3674KB、22→14req**（硬口径）；reload 759→532ms（-30%）；页内 DCL→menuActive **477→309ms（-35%）**（图片串行解码窗 275.7→150.9ms、首帧渲染 95.4→56.2ms）；点击建房→Game 567.5→697.5ms（快照存档值；即点路径等暖装尾巴，真人驻留路径不变，§三注） | visual-diff 90.67+det 48/48+fixtures 6/6+tsc/vitest 85/85+e2e f01/f12 静窗双 ALL PASS+邀请深链冒烟 |
| r6 | 音频暖装+容量基准+工具链（三槽并行） | `567b2d3`(a 音频)→`8ba9507`(b 容量)→`4a6eb60`+`10c6400`(c 工具链)→`ab68e0e`(CDP 量具,主会话) | 3 件+1 量具前置+1 门禁本体加速 | **音频就绪点：点击进 Game 后 → Menu 驻留 +941ms**（18 键 2.0MB 并入 r5 暖装队列；驻留后点击→Game 409ms；冷启硬口径 3674KB/14req 与 r5 逐位同、总传输 6899KB 不变）；**容量拐点 96 房/192 客户端**（patch 率破 54/s；降级形态=patch 网格变粗非物理超步，128 房 CPU 84.8% 时漂 ≤0.34%；CPU 拟合 12.55%+0.644%/房≈135 房上限、RSS 1694KB/房→2GB≈1163 房、实测带宽 1.43KB/s/客户端；建议 ≤64 房/实例）；**det 门禁 4.05→2.27s（-44%）**+typecheck 2.31→1.42s（-38%）；堵红线级漏洞（DET_WORKERS 非法值曾可静默绿门禁） | det 三方对照全等（快照=串行=并行×4）+fixtures 6/6+tsc/vitest 85/85+F4 响度 12 键对齐+0 页面错误（主会话收官独立复跑 det 48/48·2.2s+fixtures 6/6） |
| r7 | 真 GPU 口径+容量归因+font 评测+渲染段剖析（负结论轮） | `aea9d69`(主·GPU 解锁)→`a21b178`(a 归因)→`278cbfb`(f font)→`c5f95eb`+`535abb6`(r 渲染) | 1 勘误解锁件+3 测量件（两件负结论） | **渲染段 JS 面判到理论地板**：--gpu SVGA3D 口径整帧单批（drawcall 1.00/帧、138 quad、blend 0、bind 5.6=9 纹理×13 深度带下限、renderAvg 0.20~0.24ms≈帧预算 1.4%）——静态合批/atlas 排序/blend 消除/dirty 裁剪四候选全数据驳回，杠杆移至 present/合成器/负载调度面；**容量 6.4ms/s/房拆面闭合**（移动 44%/出站 patch 23%/模拟 14%/房间 10%/input 9%；stime 主导=loopback ws 发送内核成本、VMware 放大→96 房拐点口径偏保守，部署预算改收发字节加权）；**font 子集化实测关闭**（-5.2%<20% 线，图集 2191×1024 致密 94.79%，破线授权未动用、资产零改动） | det 48/48+fixtures 6/6 贯穿（a/f 件复跑全绿）；负结论件以双跑复验+逐条数据驳回代行；勘误 44fps=首跑基准窗负载污染非刷新封顶（xrandr 60Hz、静窗 61.1fps） |

汇总口径：r0→r6 累计，**整关回放 10.34→13.35 关/s（+29.1%）**、48 关空载步进 **-15%~-22%**、
World 构建 **10.5×**、每 World 常驻 **-76%**（forest_01）、客户端 update 分配份额 **-97%**、
冷启 Menu **-32%**（同日配对口径）、音频批就绪点提前到 Menu 驻留期、单进程容量边界摸清
（96 房拐点/建议 ≤64 房实例）、开发工具链 det 门禁 **-44%**/typecheck **-38%**——
全部位级中性（det/fixtures/patch 字节三门全绿贯穿六轮）。

## 〇.五、服务器容量面（r6 新测量面，公网部署选型输入）

| 面 | 数字（4C/8T 本机，ws 轻量模拟客户端） | 出处 |
|---|---|---|
| 用户可感拐点 | **96 房/192 客户端**（patch 到达率破 54/s=60Hz 的 90%）；降级形态=patch 网格 16.7→~21ms，**非物理超步**（时漂全程 ≤0.34% vs 判据 2%） | r6b（`8ba9507`，capacity-r6b{,-ext}.json） |
| CPU 拟合 | 12.55% + 0.644%/房 → 算术上限 ≈135 房/270 客户端（单进程事件循环为瓶颈，横向分片是唯一规模化路径） | 同上 |
| 内存拟合 | RSS 126.3MB + 1694KB/房 → 2GB 预算 ≈1163 房（内存远非瓶颈） | 同上 |
| 带宽 | 实测 1.43KB/s/客户端（f01 walk）；f01 全量口径 2.93KB/s（r4 锚）；机关重卡按 r4 step 倍数 ~18× 打折 | r6b + serialize-r4-encode |
| 部署建议 | **≤64 房/实例留 25% 裕度**；64 房档复现 CPU 55.0%/54.6%（±1%） | r6b 报告 |

## 一、战役原则沉淀（三支柱，自五轮实践提炼）

### 支柱 1：测量先行——每轮先剖析、先证伪假设，再动手

五轮中任务书预置假设被剖析证伪/翻案四次，每次都改变了动手方向：

| 轮 | 被证伪/翻案的假设 | 剖析结论 | 证据 |
|---|---|---|---|
| r1 | r0「runKernel 对纯 step 溢价 +3.9%~+153%（3 关 ≥90%）主体是快照成本」 | **尾帧稀释伪影**：纯 step 基线结局后早退近乎免费摊薄均值；快照移除后真实剩余溢价仅 +8%~26%（1.08~1.26）；snapshotPlayer×2 实际 ~6µs/帧 | r1 报告 §三分解表（4 关 runKernel/纯 step 至结局帧） |
| r2 | 任务书「解析层（IO+JSON.parse+parseLevel）是大头」 | 解析层仅 **2-4%**，Box2D 构建链占 **95-97%**；goog.base self 74.5%，其中 7 类接触构造器 ~64%=vendor 每 b2World 预填 1792 接触对象的固定成本 | r2 报告 §一 makeWorld 分解+CPU profile |
| r4 | r0/r1 的 encode 段数字（占比 ~10%、60Hz 线路 21.7~157.3KB/s） | **累积伪影**，生产真值小一个数量级（占比 1-5%、线路 2.93~5.36KB/s）；r0 §六「最坏带宽」数字作废 | r4 报告 §一勘误表+快照 serialize-r4-encode |
| r5 | 任务书「网络瀑布/base64 内嵌是冷启瓶颈」 | 网络 19 请求全并行仅 ~55ms（maxParallelDownloads=32 缺省）；base64 前提不成立（Phaser 3.90 已 blob→objectURL）；真凶=**图片装载管线串行段 ~180ms+首帧渲染 ~100ms**（由总像素量决定） | r5 报告 §一 probe-decode 里程碑分桶 |

操作范式：**每轮 STEP1 = 剖析工具先行（收容 `note/report/perf/tools/perfopt{3,4,5}/` 可复跑），
先定量、先翻案，再选杠杆；结论全部来自可复现探针而非推断。**

### 支柱 2：基准口径警戒——基准必须镜像生产语义

- **r4 头号教训（29.5× 伪影）**：perf-serialize/perf-sync 缺 `encoder.discardChanges()`
  （生产 `SchemaSerializer.applyPatches` 发送后即清变更集），量出的是「自始变更字段并集按
  最新值重编码」而非本网格真增量——patch 放大至 29.5×、encCPU 9~13×、线路 24~29×。
  **基准脚本与生产路径逐字段/逐调用同构是硬要求**；修正后旧快照加头部注+meta 披露
  「绝对值不可再比」，新锚 `serialize-r4-encode`/`sync-r4-encode`（meta.git=f0118d3）。
- **同类前科（r1）**：结局后 step 早退 vs 跑满 totalFrames 的尾帧稀释伪影——对照双方
  「跑的帧数」必须同口径。
- **负载口径（r0）**：空载（落睡空转）与 scripted（走跳持续驱动）差 **2~6×**——容量/优化
  判读必须用 scripted 档，空载档只适合前后同口径自比（`benchmark/probe-step-load.mjs` 实证）。
- **跨机/跨窗口径**：10-08 旧报告测于另机仅量级参照；时长类指标轮间波动大（r0 当日冷启
  1244/912ms、r5 带 471~588ms），**跨轮对比以传输字节/请求数等硬口径+同日配对 A/B 为准**；
  时点读数与终态存档（5 测中位）须分列（§五披露）。
- **快照链纪律**：`--save`/`--compare` 每轮起锚下一轮（r0→r1→r2→r4→r5），快照 `meta.git`
  自动溯源；benchmark/README 对每件基准的口径演变（r2 build 缓存命中口径、r4 生产语义口径、
  r3 双渲染器口径）逐条加注。

### 支柱 3：位级中性门禁体系——四层门禁+抖动归因纪律

1. **det 位级锚**：`perf-determinism --compare r0-baseline`（48 关×600 步×idle/scripted 双输入，
   全刚体 6×f64 原始位链式哈希）——全五轮逐件复跑 **48/48 全绿**，锚自 r0 建立后未再 bump；
2. **fixtures 回归网**：6/6 PASS（v1 内核自基线 ×4 tolerance=0 + oracle-gold ×2），
   oracle-gold maxDev 24.5357/142.6879 与 r0 **逐字同值**贯穿五轮；
3. **patch 字节逐字节门禁**：r1 双路径 encodeAll 逐字节、r4 升级为 4 关×600 帧双路径
   patch+encodeAll 逐字节（协议出站零变化的直接证据，`tools/perfopt4/ab-filter.mjs --gate` 可复现）；
4. **visual-diff 首帧完整性**：r3/r5 客户端轮 90.67~90.79（HEAD 旧基线 89.42 同偏移同带）。
- **e2e+抖动归因纪律**：真实双浏览器 e2e（repeat3×--offset -15）全轮通过；期间多次 1/3、0/3
  抖动全部按同一流程归因——失败形态比对已录「输入注入抖动」签名族+**基线 worktree 独立构建
  A/B**（r1 f04：基线 a81cdb5 同率翻车；r3 首窗 0/3：四版本稳定窗全 3/3；r5：基线 a68c0bc 3/3+
  HEAD 静窗 3/3）——归因环境窗非回归，从不拿抖动窗当门禁；操作教训固化：**重启后 ≥30min 或
  静窗再上门禁**。
- **一件一 commit、独立过门、quarantine 披露**：全战役 16 个实施件零回滚件；r2 件6 触及 r1
  改动面（kernel.mjs）按 quarantine 最小 diff 单独披露（r2 报告 §五）。

## 二、收益总账（按用户价值面）

### 服务端 tick 链（游玩直感：服务器容量与单 tick 延迟）

| 面 | r0 → r5 | 出处 |
|---|---|---|
| 48 关空载步进 avg | 0.0227 → 0.0177~0.0193ms（**-15%~-22%**；睡眠轻关最高 -58.5%） | r1 件1/件2（fa4a806/07fc78a） |
| syncState 快照写路径 | f01 **-54%** / bonus_2 **-63%**（0.0210→0.0096 / 0.0516→0.0191ms） | r1 件3（2b7efa6，存档 sync-r1-sync.json） |
| encode 段 | 轻关 **-10.1%~-12.0%**（重关 -3.7%；绝对 0.0001~0.0002ms/tick） | r4 件2（f0118d3） |
| 出站带宽（生产口径勘误后真值） | 60Hz scripted 2.93/3.39/5.36KB/s/客户端——**r0 伪影值（21.7~157.3）作废** | r4 件1（3573bd6，serialize-r4-encode） |
| 协议输出 | patch 字节五轮**逐字不变**（r1 等价性结论在 r4 生产口径下复证成立） | r1 件3+r4 §一连锁勘误 4 |

判读注：r4 勘误后 encode 段生产占比仅 ~1-5%，r1 的 sync 优化（占比曾达 19~33%）才是 tick 链
真正的第二大头；步进物理本体（box2d Step 链）始终占绝对主导且为 vendor 必漂禁区（§四）。

### 世界构建与内存（机器探索供给面/多房间容量）

| 面 | r0/r1 → r2 | 出处 |
|---|---|---|
| World 构建 | 9.2~11.0 → **1.0~2.0ms（-82%~-90%，110→1166 个/s=10.5×）** | r2 件1-4/件6（c3661b0…55d580b） |
| 整关回放吞吐 | 10.34 → 12.14（r1 +17.4%）→ **13.35 关/s（r2 +10.0%，累计 +29.1%）** | r1 件4+r2（8d2b6d5/55d580b，routeio-r2-routeio.json） |
| 每 World 常驻 | forest_01 2.9→**0.69MB（-76%）**；bonus_2 4.47→2.88MB（-36%） | r2 件1（1792 预填接触对象消失，mem-r2-mem） |
| 50 世界并发峰值 | Δ152→**35.2MB（-77%）**/Δ232→151MB；释放后回 17~20MB | 同上 |
| 创建销毁吞吐 | 78.4→**251.6/s（+221%）**（12.76→3.97ms/World） | 同上 |
| 关卡解析 | 服务端 loadLevel+routetool makeWorld 双缓存（0.3~0.5ms/次消除，命中 p50 0.0001ms） | r2 件5/件6（130863a/55d580b） |

### 客户端（游玩直感：帧预算/GC 压力/加载速度）

| 面 | before → after | 出处 |
|---|---|---|
| update() 段分配份额 | 1044 → **31KB/s（-97%，≈0.6KB/帧）** | r3 件1+件3（44ad165/be3d964，alloc-paired 配对差分） |
| 页面总分配（canvas） | 1374 → **1114KB/s（-19%）** | r3（client-r3-client 快照，16:44 复跑 1124 同带） |
| 静止态 setter 写入 | setDepth **968→0**、setAngle **2420→0**、setRotation **968→0**（/8s）——depth 排序队列全消 | r3 件2（158d395） |
| updateAvg | 0.199 → **0.146ms**（满帧 60.6 维持，mechCalls 2904 零变化） | r3（perf-client） |
| 冷启 Menu active | 769 → **523.5ms（-32%，同日配对 A/B）** | r5 件1（458bff2，load-r5-coldstart） |
| 冷启传输（硬口径） | 4863 → **3674KB、22→14req（-1.19MB/-8req）**；进 Game 累计 6899KB 持平（总量不变只改分布） | 同上 |
| reload / 页内口径 | 759→532ms（-30%）/ DCL→menuActive 477→309ms（-35%） | 同上 |
| 游戏内音频就绪点 | 点击进 Game 后 GameScene.preload 才装 → **Menu 驻留 +941ms**（r5 暖装队列同款；驻留后点击→Game 409ms，GameScene.preload 留兜底声明） | r6a（`567b2d3`，load-r6-audio.json） |

### 勘误史（防虚账——本战役「负产出」同样入库）

| 勘误/翻案 | 内容 | 影响 |
|---|---|---|
| r4 encode 累积伪影 | patch 370/450/2685→50/58/91B（最高 **29.5×**）、encCPU 0.68~3.08→0.07~0.21ms/仿真秒、60Hz 线路 21.7/26.4/157.3→2.93/3.39/5.36KB/s、tick 链占比 ~10%→**1-5%** | r0/r1 旧 serialize/sync 快照绝对值作废（口径注已挂 benchmark/README）；timerMs 降频、按关分级出站等「带宽优化」候选随之失去前提（r4 弃件） |
| r1 routeio 溢价伪影 | r0「+3.9%~+153%」→真实剩余 +8%~26%（1.08~1.26），尾帧稀释 | 机器探索供给面读数以关/s 为准 |
| r2 解析层假设证伪 | 解析 2-4% vs 构建链 95-97% | 优化方向从 IO 转向 vendor 构建链（收获 10.5×） |
| r5 冷启瓶颈翻案 | 网络（55ms 全并行）/base64（已 blob）双假设证伪；真凶=图片装载串行段+首帧渲染（总像素量决定） | 优化从网络/编码转向装载序整形；「资产子集化」成为仅剩大杠杆（需破红线，§四） |
| r0→r5 冷启时长口径 | r0 Menu 1078ms（当日 1244/912 波动）vs r5-before 769ms——时长类轮间波动大，非回归 | 硬口径（传输/req）+同日配对 A/B 为跨轮唯一可比口径 |
| r6a 音频批体积勘误 | 游戏内音频批旧档 2.8MB → 磁盘实测 **2.0MB**（2,058,151B，LevelMusic.mp3 占 1.29MB） | audio.ts 头注与 BootScene 注释已改；r5 总账引用处不受影响（r5 只涉传输字节实测） |
| r6b 带宽口径归属澄清 | r4 的 5.36KB/s/客户端实为 **forest_bonus_2@60Hz** 档（91B/patch），forest_01 应为 2.93KB/s（50B）——r4 快照三档 f01/f12/bonus_2=2.93/3.39/5.36，引用单值时须带关卡归属 | r6b 实测 f01 walk 1.43KB/s 交叉印证；r4 报告原文无错，防误引 |
| r6c 门禁本体红线漏洞 | det 并行化半成品曾存在 `DET_WORKERS=非数字`→NaN→零 worker→零行→compare 报「0 关位级一致」exit 0 **静默绿门禁**路径；且 worker 线程 tsx 钩子在本机 Node 22.22.1 必不自动注册（特性门 [[22,22,3]] 不满足） | 已修：非法值显式 exit 1；worker 分支显式 `tsx/esm/api register()`（探针实证）——门禁工具自身也须过「空跑≠绿」审查 |

## 三、实施件清单（22 件全览，零回滚）

| 轮·件 | 改动一句话 | commit |
|---|---|---|
| r1·1 | jumpSound 闭包提升模块级（免逐帧新建） | `fa4a806` |
| r1·2 | b2Timer 恒零遥测桩（免每步 12~13 次 new Date，vendor 字节不动） | `07fc78a` |
| r1·3 | syncState 机关位姿 mechanisms 直读（免每 tick ~30 中间对象） | `2b7efa6` |
| r1·4 | runKernel 缺省路径死亡判定直读（免逐帧双快照） | `8d2b6d5` |
| r2·1 | 接触池懒填（预填 1792→0，goog.base 构建大头） | `c3661b0` |
| r2·2 | b2PolygonShape 构造/Copy 直达分派 | `e3c8d75` |
| r2·3 | build.ts 构建层分配削减（静态顶点模板/quadFixture 直构） | `b2b9c47` |
| r2·4 | b2CircleShape 构造/Copy 直达分派 | `cfeb2f8` |
| r2·5 | 服务端 loadLevel 逐关卡解析缓存 | `130863a` |
| r2·6 | routetool makeWorld 逐关卡解析缓存（quarantine 最小 diff） | `55d580b` |
| r3·1 | GameScene update 零稳态分配（回调绑定/首见缓存/输出复用） | `44ad165` |
| r3·2 | 渲染脏标记守卫（静止态零 setter 写入） | `158d395` |
| r3·3 | 输入轮询零分配（pressed 直查/预组合键集） | `be3d964` |
| r4·1 | perf-serialize/perf-sync 生产语义修正（discardChanges，勘误件） | `3573bd6` |
| r4·2 | 声明侧遮蔽 Schema[$filter]（8 schema 类，字节逐字不变） | `f0118d3` |
| r5·1 | 冷启动装载序整形（四图集移出 Boot 关键路径+120ms 后台暖装+落定门） | `458bff2` |
| r6·a | 游戏内音频批 18 键并入 Menu 驻留期后台暖装（r5 队列同款+落定门，preload 留兜底） | `567b2d3` |
| r6·b | 容量基准量具 perf-capacity.mjs+全曲线（96 房拐点/CPU·RSS·带宽拟合/部署建议） | `8ba9507` |
| r6·c | det 门禁并行化（cap 4 worker+逆序派发，-44%）+DET_WORKERS 堵漏+typecheck --incremental | `4a6eb60`+`10c6400` |
| r6·主 | perf-client CDP 远程真机模式（--cdp/--host、connectOverCDP、GPU 串采集；渲染段真口径量具前置） | `ab68e0e` |
| r7·a | 容量挂账归因：6.4ms/s/房拆面闭合（移动 44%/patch 23%/模拟 14%/房间 10%/input 9%）；stime 主导=loopback ws 发送内核成本（VMware 放大）——96 房口径偏保守，部署预算改收发字节加权 | `a21b178` |
| r7·主 | VM 内真 GPU 口径勘误解锁（Chromium 黑名单非架构死路，--ignore-gpu-blocklist+vmwgfx 真显示）+perf-client --gpu 量化+_gpu 基线 | `aea9d69` |
| r7·f | font 子集化普查收官=负结果关闭（-5.2%<20% 线未破线资产零改动；四源普查工具+清单+防护网 4 断言入库） | `278cbfb` |
| r7·r | 渲染段细分探针入共享量具（drawcall/bind/blend/flush 零分配缺省开+--dumpdl）+负结论剖析（整帧单批=理论地板，四候选数据驳回） | `c5f95eb`+`535abb6` |

新增量具：perf-serialize/perf-routeio/perf-mem（r0）、perf-client（r3）、probe-step-load（r0）、
**perf-capacity（r6b）**；量具强化：**perf-determinism 并行化（r6c，判据零变化三方对照）、
perf-client CDP 远程模式（r6·主）**；
剖析工具收容档 `note/report/perf/tools/perfopt{3,4,5}/`（r3 14 脚本+8 数据件、r4 5 脚本+2 profile、
r5 3 脚本；r1/r2 无独立收容档，剖析产物随报告入档；hotspot 01 号档工具在
`note/research/2026-10-18-perf-hotspot/tools/`）。

## 四、剩余候选与前置（第七轮起）

| 候选 | 数据 | 前置/定性 |
|---|---|---|
| ~~客户端渲染段（JS 面）~~（r3 TOP1 → **r7r 实测关闭**） | --gpu SVGA3D 真口径剖析：整帧单批（drawcall 1.00/帧）、blend 0、bind 5.6/帧=带数下限、renderAvg 0.20~0.24ms≈帧预算 1.4%——Phaser 3.90 多纹理合批已是理论地板，四候选全数据驳回 | **负结论归档**（`535abb6`）：JS 渲染段无 artifact 中性优化空间；真剩余杠杆=present/合成器/负载调度面（超出本项目代码边界）；挂账候选（rAF 节拍/WebGL 分配超额归因/视口裁剪=vendor 红线）附不做理由在报告 |
| ~~font.png 子集化~~（r5 候选 TOP → **r7f 实测关闭**） | 四源普查并集 1082 字符 ∩ fnt 260 字形=保留 247/清零 13（面积占 4.07%）；方案 A 实测 **-5.2%**（1638701→1553047B）、B 面积上界 ≈-5%——远低 20% 停止线。勘误：图集实为 2191×1024 非 2048²，保留字形占声明面积 94.79%=图集本就致密，**无子集化空间** | 用户授权破线后按停止规则**未破线**（`278cbfb`：普查/再生工具+字符清单+防护网 4 断言入库，生产资产 md5 零改动）；冷启剩余杠杆只剩渲染段（r7r 进行中） |
| ~~GameScene 音频批暖装~~ | **r6a 已做**（`567b2d3`，就绪点=Menu 驻留 +941ms） | 完结移入实施件 |
| phaser 1.48MB 块拆分 | 脚本段 parse/eval ~120ms | r2 判拆分不值，r5 复核未推翻——维持不动 |
| 50 并发 GC 拆账（r0 §八存疑） | 50×bonus_2 构建总耗时 ≈166ms/World vs 冷建 14ms，GC 暂停未拆账 | 仅多房间大并发场景相关，单人单房无关；拆账需每轮隔离 gc |
| **vendor 必漂禁区清单（永挂账，除非用户特批）** | ①b2TimeOfImpact/SolveTOI 18%（r0 hotspot #6）②宽相代理插入链 b2DynamicTree.InsertLeaf 等 25~30%（r2 剩余热点）③goog.base 剩余（关节类 <5%，r2 §六）④关节求解序 7.2%（r0 hotspot #8） | 动则 det 位级基线必漂、fixtures/金轨迹全网重录——**永挂账不动** |

弃件存档（数据支撑的放弃，防止重复立项）：**font.png 子集化**（r7f 实测 -5.2%/上界 -5% < 20% 停止线——图集本就致密；再生工具休眠入库，未来文案大改可一键重评）、timerMs 降频出站（r4：idle 线路 <3KB/s 不值协议变更）、
imageLoadType=HTMLImageElement（r5：A/B 494.5 vs 471~533 带内无收益）、r0 候选 60Hz 分级出站
（r4 勘误后带宽前提消失）。

## 五、数字一致性核查（如实并列披露，不擅自改数）

以下为各轮**实施 commit 消息时点读数**与**报告/存档快照终态口径**的差异，总账一律采用
报告+存档快照口径，时点读数如实并列：

| 项 | commit 消息值（时点） | 报告+存档快照值（终态） | 快照核验 |
|---|---|---|---|
| r1·3 sync 段 | `2b7efa6`：「0.0210→0.0070ms / 0.0516→0.0187ms」 | r1 报告：**0.0096 / 0.0191ms**（-54%/-63%） | `sync-r1-sync.json`（meta.git=8d2b6d5）syncMs=0.0096/0.0191——**报告/存档一致，commit 值为时点读数** |
| r2·6 回放/构建 | `55d580b`：「13.37 关/s（+10.1%）、构建 110→1153/s」 | r2 报告 §三：**13.35 关/s（+10.0%）、1166/s** | `routeio-r2-routeio.json`（meta.git=55d580b）summary.replaysPerSec=**13.35**——报告与 commit bb3b4ab 用存档值，件 commit 为时点值；r2 报告 §〇件6 行亦留 13.37 时点值（报告内部两口径并存） |
| r5·1 冷启 | `458bff2`：「Menu 769→**471ms（-39%）**、reload→517ms、点击→Game→615ms」 | r5 报告 §三：**523.5ms（-32%，5 测中位）**、reload 532ms、点击→Game 620~698 带（存档 697.5） | `load-r5-coldstart.json`（meta.git=458bff2）cold.menuActiveMs=**523.5**、gameActiveAfterClickMs=697.5；`476a254` 快照 commit 消息与存档一致——件 commit 取 5 测最快时点，总账取中位 -32% 并披露 -39% 时点值 |
| r4 encCPU 两口径 | `a68c0bc`：「3.08→0.21ms/仿真秒」（纯 encode 计时，bonus_2） | `5cee17e`/快照：「0.29/0.11/0.27ms/仿真秒」（perf-serialize 基准环 60Hz scripted） | `serialize-r4-encode.json`（meta.git=f0118d3）encCpuMsPerSimSec=0.29/0.11/0.27——**非矛盾，两个口径**（纯计时 vs 基准环），引用时须注明口径，总账两值并存 |

## 六、复现（门禁与基准总入口）

```bash
node --import tsx benchmark/perf-determinism.mjs --compare r0-baseline   # 位级门（现锚，全轮 48/48）
node --import tsx scripts/e2e/routetool/fixture-runner.mjs              # fixtures 6/6
node --import tsx benchmark/perf-step.mjs --compare perf-r2-step        # 步进面（r2 起锚）
node --import tsx benchmark/perf-sync.mjs --compare r4-encode           # 生产语义口径锚
node --import tsx benchmark/perf-serialize.mjs --compare r4-encode      # 出站生产口径锚
node --import tsx benchmark/perf-routeio.mjs --compare r2-routeio       # 回放/构建吞吐
node --expose-gc --import tsx benchmark/perf-mem.mjs --compare r2-mem   # 内存面
node benchmark/perf-client.mjs --compare r3-client                      # 客户端帧预算
node --import tsx benchmark/perf-load.mjs --no-build --compare r5-coldstart  # 冷启口径
node --import tsx benchmark/perf-capacity.mjs --save <label>            # 容量曲线（r6b 量具，慢基准）
node benchmark/visual-diff.mjs                                          # 首帧完整性（客户端轮门禁）
node --import tsx note/report/perf/tools/perfopt4/ab-filter.mjs --gate  # patch 字节逐字节门禁
node scripts/e2e/route.mjs --level forest_01 --repeat 3 --offset -15    # e2e（空机时段/静窗！）
```

六轮报告：`note/report/perf/2026-10-18-r{0,1,2,3,4,5}-*.md` + `2026-10-18-r6-{audio-warmup,capacity,toolchain}.md`
+ `2026-10-19-r7-{capacity-attribution,font-subset,render}.md`；
快照：`benchmark/results/`（各轮 `--compare` 锚见 benchmark/README 快照索引）。

## 七、一句话总账

**七轮 22 件+1 基准口径勘误+8 件量具新建（另有门禁并行化与渲染细分探针两笔量具强化），
全部位级中性（det 48/48+fixtures 6/6+patch 字节逐字不变贯穿；r6 门禁本体并行化三方对照逐字节同）：
服务端步进 -15~-22%、sync -54~-63%、encode -10~12%（真值占比 1-5%），世界构建 10.5×/回放 +29.1%/
每 World 常驻 -76%/50 并发 -77%，客户端 update 分配 -97%/页面分配 -19%/冷启 Menu -32%/传输 -1.19MB/
音频就绪点提前到 Menu 驻留，单进程容量边界摸清（96 房拐点、≤64 房/实例、stime 主导=loopback 发送
内核成本→真机部署口径更宽），开发环 det 门禁 -44%/typecheck -38%；r7 负结论双件同价值：渲染段 JS 面
判到理论地板（杠杆在 present/合成器面非本项目代码）、font 子集化无空间（图集致密 94.79%，授权未动用）
——战役最大遗产除数字外是方法论：测量先行（四次假设翻案+两处主会话勘误自纠）、基准镜像生产语义
（29.5× 伪影教训）、四层位级门禁+抖动 A/B 归因、门禁工具防静默绿、断点续作，以及「负结论也是结论，
不硬凑优化」。**

## 八、r8–r11 增补（2026-10-20，四轮续账）

> 续作四轮（方法论沿用；报告 `2026-10-20-r{8,9,10,11}-*.md`，版本 0.3.34 收账）。

| 轮 | 焦点 | commit | 关键数字（同机同口径） | 门禁 |
|---|---|---|---|---|
| r8 | 客户端场景切换链（点击→Game） | `3313403`(量具)+`9799145`(件1-4) | **驻留配对 551.1→490.6ms（-11.0%；8 轮 -7.3%）**：ws+state -49.5%/level 拉取 -76.5%/menu 隐 -93.3%；**换肤幕布性能税归档 +364ms/55%**（pre-skin worktree A/B+CSS 注入 A/B）；两勘误（驻留判定洞/wake 唤醒税位置） | det 48/48+fixtures 6/6+vitest 89+e2e repeat3 静窗 ALL PASS+visual-diff 同带+perf-client 不变量 |
| r9 | 空闲 CPU/功耗（负结论轮） | `78c2d30` | 量具 perf-idle 六态：**JS 面地板（script% 0.7-1.8%）**、task% 77-95%=软栅环境项、bg=headless 伪影；**帧率上限弃件**（fps.limit 慢机砍帧 67→48/4s=视觉回归红线、_target 无效）；幕布驻留税挂账真 GPU 口径（sudo 被禁 xorg9 不可复现，披露） | 零生产 diff；量具 4 跑通+0 页面错误 |
| r10 | 工具链第三面 | `cc5d6b4` | **vitest threads 池 -12%（3557→3110ms）**、**build 去 npm 嵌套层 -6.8%（5491→5118ms，dist md5 逐字节不变）**；判负两件（sync-assets 增量=勘误 330ms 是 npm 层非拷贝、vite gzip 报表无增益）；勘误：npm run 层 ~330ms 污染短命令计时 | dist md5 同值+vitest 89/89+sync 零 diff |
| r11 | 容量 GC 拆账（r0 §八挂账收口） | `a57532e` | **GC 份额 0-0.4% 三场景全非因素；无并发膨胀**（bonus_2 持有 158≈冷跑 170ms/建零爬坡）；**r0「166 vs 14」勘误=跨关伪影**；bonus_2 158ms/建=前 60 步固有收敛（构建仅 3.96ms，vendor 永挂账同源）；量具哑火勘误（观察者同步块不投递） | 零生产 diff；阳性对照+复跑 |

r8-r11 累计：**点击→Game -11% + 连接窗三段 -49/-77/-93%、vitest -12%、build -6.8%、
挂账两笔收口（GC 拆账/50 并发膨胀）、负结论三件防重复立项（帧率上限/sync-assets 增量/gzip 报表）**；
位级三门（det/fixtures/patch 字节）全绿贯穿，dist 逐字节不变；新增量具 4 件
（perf-scene/perf-idle/perf-toolchain/perf-gc）。剩余挂账：幕布驻留税（前置真 GPU 口径）、
matchmake 点击派发管线成本（两态共有，低优先）、temple 态 heap 58MB（非每帧成本）。

## 九、r12 增补（2026-10-21，0.3.42 后首轮）

> 报告 `2026-10-21-r12-client-frame-writes.md`。战役首次用「帧内写入计数器」把"脏守卫是否真生效"
> 从推断变成直读。

| 轮 | 焦点 | commit | 关键数字（同机同口径） | 门禁 |
|---|---|---|---|---|
| r12 | 客户端帧内残余分配 + 相机/HUD 每帧强写 | `1251929`+`300a75f`(量具)、`6221aeb`+`e7a788e`(件) | canvas 60fps 主路径：相机 setZoom/centerOn **484→31（f01）/460→69（fb2）**、HUD 补偿写 **1452→93/1380→207（−85~−94%）**、帧分配 **1149→1044 / 2438→2246 KB/s**（与 47 台×60fps 位姿对象 ≈192KB/s 理论值对齐）、fb2 update 段 0.292→0.270ms；WebGL fb2 update 段 −14.5%，低帧率下相机目标仍逐帧变→写数≈帧数属正确行为（收益只在 60fps 主路径） | det 48/48 位级一致、visual-diff 92.92（带内上沿）、vitest 172/172、journey 26 项全 PASS、route f01+f12 各 3/3（winAt 基线带内） |

r12 新增量具：`perf-client` 帧内写入计数器（camZoom/camCenter/setPos/setAngleW/setScaleW/setTextureW）。
两条勘误入档：①Phaser 3.90 的 setZoom/centerOn 不在 `cameras.Base.prototype` 自有属性上，
包装必须沿活实例原型链找属主（否则静默计 0）；②两个 `route-all` 并发共用默认 `--port-base 3620`
互撞端口→各报"1/2 过"假失败，并行须显式分口。
剩余挂账（r13 起）：帧内分配剩余 ~1044KB/s 的**函数级归因**（新量具 `benchmark/perf-alloc.mjs`，
CDP `HeapProfiler.startSampling` + source-map-js 还原到 TS 源）、换关纹理重传与下一关预取、
服务端 tick 侧候选。
