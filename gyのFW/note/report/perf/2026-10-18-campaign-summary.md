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

## 十、r13 增补（2026-10-21，0.3.42 后第二轮）

> 报告 `2026-10-21-r13-advance-chain-prefetch.md`。本轮双收：把 r12 挂账的"帧内分配归因"钉死结案，
> 再把火力收在用户每次通关都要付、且完全可控的**换关链**上。

| 轮 | 焦点 | commit | 关键数字（同机同口径） | 门禁 |
|---|---|---|---|---|
| r13 | 换关链（点继续→可玩帧）：下一关地面预取/预烘 + 地面缓存有界 LRU + 同 canvas 免纹理重传 | `47c4e18`(量具)、`09c6c13`+`9cd0c3a`(件)、`1c48478`(取证件) | dwell1200：烘焙 **71.4→16.9ms（−76.3%）**、链内网络 **35.7→0ms（8/8 零网络）**、**点继续→可玩帧 1239.6→1045.0ms（−15.7%）**（真实工作 ≈240→≈45ms，已逼近 FadeScene 500×2=1000ms 设计下界）、峰帧 7.8→3.1、峰隔 222.7→198ms；dwell120（秒点）：烘焙 −65.9%、网络 −29.9%、墙钟 −0.5%、峰隔 −2.1%，代价＝把一次烘焙搬进过场窗（空闲掉帧 151→177 次/峰 530.7→667.8ms，软件渲染口径） | det 48/48 位级一致、vitest **178/178**、journey 7/7 + deathretry 4/4 + refresh 3/3 + wonrefresh 6/6、route f03 3/3（winAt 15045/15049/15059）、visual 0.9062/0.9056（带内）、perf-client 1025KB/s（对 r12 零帧内回归）、`scripts/e2e/groundcache.mjs` 6/6（地面像素逐位一致 + 免重传直读 + 计数器阳性对照） |

**结案一笔**：`perf-alloc` 四组口径（f01/fb2 × WebGL/Canvas）采样显示**我方 app chunk 恒占 2.1–2.9%**，
其余在 colyseus.js `onMessageCallback`（≤71.1%）与 Phaser 渲染器 `S`（≤65.5%）内部——帧内分配线判至
**库内地板**，再压需动依赖或渲染管线（红线风险 > <3% 收益），此线不再立项。

**三条勘误入档**：①`bakeMs` 包整段 `buildGround`，命中＝仅剩重绑+≈5.2MB 上传、未命中＝整幅烘焙，
探针无命中标志 → 只能用"与该档整幅下沿比较"间接判（已列精修）；②关卡构建跑在 `create` 的 loader
回调里，属**帧间任务**，`prestep→postrender` 帧内口径看不见它（首版读成 2–11ms 无害帧，实为 146–182ms
掉帧）→ 量具必须并记 `worstGap` 并把 `__hitches` 按链窗/空闲窗归位，否则"搬家型"优化会被读成没改善；
③**路线门禁取样禁含 forest_02**（用户已裁定挂起关、结构性 MC 上限 ≈95.6%，不计绿）；本轮为其 3/3 FAIL
另做 `f7dfe6e` 基线构建对照，签名逐字相同（@65215/65213/65227ms）→ 既有状态，非 r13 回归。

剩余挂账（r14 起）：`prepareGround/buildGround` 命中计数（把均值下降读成命中率）、秒点档过场窗掉帧的
**真机 GPU 口径**、换关链剩余 ≈45ms（Game 场景创建与图集取用，非烘焙/网络）、服务端 tick 侧候选、
幕布驻留税（前置真 GPU）。

## 十一、r14 增补（2026-10-21，0.3.42 后第三轮）

> 报告 `2026-10-21-r14-temple-resident-memory.md`。火力从"帧时间/分配速率"切到**驻留字节与分配峰值**：
> 前者决定低配进选关会不会被系统杀，后者决定每次进出选关白付多少垃圾。

| 轮 | 焦点 | commit | 关键数字（同机同口径） | 门禁 |
|---|---|---|---|---|
| r14 | 选关线驻留内存四件：烘焙逐层流水线+分带收尾(A)、树纹理重进免重传(D)、离房清地面 LRU(B)、levelCache 有界(C) | `e02fe86`(量具)、`9a0d862`(金样门禁)、`9412c62`/`62bf35f`/`6cbef64`/`626bf80`(四件) | 冷烘在飞 typed array 峰 **33.31→11.97MB（−64.1%）**、事件内堆峰 **86.2→61.3MB**、分配流水 **74.5→49.6MB（−33.4%）**；重进（缓存命中）**15.6→5.5MB/次（−64.7%）**并免掉三张 1036×864 全幅重传；离房回选关驻留 **33.5→28.6MB**（地面 4.96→0、纹理账 −4.97MB）；离房后冷烘 **70.2→32.1MB**、堆峰 **93.1→55.0MB**；烘焙在飞时长 28→25 个 20ms 采样点（未劣化）、游玩中 22.9MB 驻留与帧内 1044KB/s 分配**逐字不动** | det 48/48 位级一致、vitest **179/179**、**新件 `scripts/e2e/treebake.mjs` 9/9**（三层 FNV-1a 金样逐位命中 + 重进零重烘 + **重进免重传（canvas 标记 + remove 计数双证）** + 阳性对照）、groundcache、journey 7/7+deathretry 4/4+refresh 3/3+wonrefresh 6/6、route f01（winAt 39488 带内）、visual 91.19/92.56（带内）、perf-client f01 60.3fps/1044KB·s⁻¹、fb2 59fps/2299KB·s⁻¹、advance 5/5 零网络·烘焙 9.8ms·链 1035.7ms |

**量具一笔（新支柱）**：`benchmark/perf-resident.mjs` 把驻留拆成 `churn / 在飞峰 / 常驻Δ / 字节分解`
四类，逐事件 `collectGarbage→记录器→落定→再 GC`。**V8 采样堆分析器对 typed array 大块字节失明**
（同次冷烘 `sampledTotal` 0.32MB vs 堆增长 74MB）——整块 ArrayBuffer 的账只能走事件级 GC 基线，
`perf-alloc` 那条线继续只管小对象归因。

**三条勘误入档**：①`page.evaluate("() => {...}")` 传**字符串**箭头函数会被当表达式求值，代码根本不执行
（返回函数对象→序列化为 undefined），量具全部改传函数字面量；②落定条件只看 `jobs===0` 会在
`Temple.create` 未执行时即为真，把在飞烘焙当"常驻"（离房后虚报 81.4MB），须 `textures.exists("tree-all") && jobs===0`；
③Chromium 全透明像素 RGB 读回被归零，像素金样的**阳性对照必须改 alpha>127 的像素**，否则"一致"毫无意义。

剩余挂账（r15 起）：冷烘余下 49.6MB 的大头已非 typed array（`getImageData` ImageData 与三层 canvas 本体），
再压触及保真红线；**真机 GPU 口径**的 `texMB` 与烘焙峰值；`prepareGround/buildGround` 命中计数；
换关链剩余 ≈45ms；服务端 tick 侧候选；幕布/图集常驻税。


## 十二、r15 增补（2026-10-21，0.3.42 后第四轮）

> 报告 `2026-10-21-r15-cold-start-transfer.md`。火力从"帧时间/驻留字节"切到**线上字节与缓存校验契约**：
> 本作经樱花隧道对外，回环毫秒不可信，唯一可信度量是逐 URL 传输字节。

| 轮 | 焦点 | commit | 关键数字（同机同口径） | 门禁 |
|---|---|---|---|---|
| r15 | 冷启动/入房传输 + 压缩路径的 ETag/304 契约修复 + 关卡 API 协商压缩 | `754d136`+`aede24f`(量具/复验探测)、`a29dde3`(件B)、`fbc8ba3`(件C) | 冷启动全链 **6942KB/56 响应** 拆成 Menu 段 4054KB(21req) + 进房段 2889KB(35req)；**关卡数据 API 传输 16.9→1.8KB（−89.3%）**（解码 16.6KB 逐字不变），进房段随之 −16KB；**br 响应带校验器 0/14 → 15/15**，修复前 14 个无校验器文本响应＝**388.2KB**（硬刷新/过期只能整份重下）；复验探测 47 幂等 URL **6912KB→0KB、非 304 者 0 个**；服务端重压成本实测 br q5 1.03ms / gzip6 0.56ms（9.33ms 系 JIT 预热）故不落包缓存；**Menu 段与请求数不动**（88.8% 字节是 br 无法再压的二进制载荷，再编码须用户裁决） | det **48/48** 位级一致（对现役基线 r32）、vitest 18 文件 **191/191**（staticGz 15→**24**、新 `jsonRes` **6**）、build/typecheck、treebake 9/9、groundcache 6/6、journey 7/7·pause 11/11·leave 3/3·refresh 3/3·wonrefresh 6/6·rejoin 3/3·rolesplit 6/6·deathretry 4/4、route f01（winAt 39504 带内）、visual **91.54%**（带内）、perf-client canvas 60.6fps/**1042KB·s⁻¹**（零帧内回归）、advance 5/5 零网络·链 1049.3ms |

**契约一笔**：0.3.21 把压缩响应改为自持 `res.end(buffer)` 后 `express.static` 的 ETag/Last-Modified 不再可达——
凡走过 br/gzip 的文本响应失去条件复用能力（`Cache-Control` 还在，看起来"缓存工作正常"，过期后才整份重下）。
本轮补齐并规定：**编码写进强 ETag**（`"br-<mtime>-<size>"`，同 URL 的 br/gzip/identity 不可互换校验），
原地可改的数据（关卡 JSON）另用**内容寻址弱族**（`"json-"+sha256`，配 `no-cache`）。压缩缓存失效键 mtime→**mtime+size**。

**三条勘误入档**：①页面 `performance.now` 与 Node 墙钟**不可做跨基减法**，归段改用 URL 集合差；
②页内 `fetch(cache:"no-store")` 会**剥离条件请求头**（Blink），据此测 304 必得假阴性、差点把件B 判成无效——
校验类探测必须走 Node `http`+keepAlive，且避让 `/matchmake/*`（会真建房）、`blob:`、文档 URL；
③首版 `gamePhaseKB` 恒 0（phase 打在 Menu 快照上，进房段新增 URL 未赋值）→ 改从 `resourcesAfterGame` 反算并**重取基线**。

**不主张之项明写**：`Menu active 800→716ms`、`建房→Game 1424.5→1477ms`、`reload 615.5→831.5ms` 全落在
本机 ±120ms 噪声带内，本轮收益口径只有字节与头部契约，不声称延迟。

剩余挂账（r16 起）：**待裁决**——二进制再编码（WebP-lossless/AVIF/MP3 重压）面额 6148.5KB（15 个 ≥64KB 未压缩响应）；
下一轮候选（量具已给证据）——进房段一次性 22 req/2.87MB 中 `LevelMusicFinish/Over/_speed` 四轨 **500.6KB** 属
结算/速度模式才用，压在开局关键路径上，按"开局必需/相位到达再取"分池可直减进房段 ≈17%；perf-load 隧道节流档
（`--rtt`/CDP emulate）未实现，字节收益仍靠换算；真机 GPU 口径、`prepareGround/buildGround` 命中计数、
换关链剩余 ≈45ms、服务端 tick 侧、LAN/触屏/弱网手测。

## 十三、r16 增补（2026-10-21，0.3.42 后第五轮）

> 报告 `2026-10-21-r16-audio-family-by-level-type.md`。方向切到**进房段的音频字节构成**：开局装的 5 支 BGM
> 里最多 2 支会响。零协议、零像素、零音频内容改动，补的是原版 `preloadAudioFiles`（bundle:1887237）
> 按 `levelData.type` 三选一装 BGM 的既有语义。

| 轮 | 焦点 | commit | 关键数字（同机同口径） | 门禁 |
|---|---|---|---|---|
| r16 | 音频清单按关卡类型分族（general/speed），装载点只取目标族 + 暖装族预测 | `c83c805`+`0496baf`+`58b87f7`(量具/探针勘误/新门禁)、`ac0516f`(件A) | **general 关（38/48）音轨 2165.3→1988.6KB＝−176.7KB**；**speed 关（10/48）2165.3→715.9KB＝−1449.4KB**，点击→Game 段 **2872→1423KB（−50.5%）**、冷启动全链 6926→5477KB（−20.9%）；48 关全逛 = **省 20.7MB**、单次进房均 **≈442KB**；解码后 PCM 驻留 game 态 **24.96→21.81MB**(general) / **24.96→11.44MB**(speed)，与少装的族逐轨对得上（speed 关少 `bgm_level` 12.02 + `bgm_finish` 1.50）；**Menu 段 4054KB/21req 不动** | det **48/48**（对 r32）、vitest **191/191**、**新门禁 audiofamily 14/14 ALL PASS**（本族在播 + 另一族零缓存零请求 + 页面零错误）、treebake 9/9、groundcache 6/6、journey 8 模式、route f01（winAt 39507 带内）、visual **90.07%**（带内）、perf-client canvas 60.4fps/**1039KB·s⁻¹**（对 r15 1042 零帧内回归）、advance 5/5 零网络·链 1020.2ms |

**为什么这样切**：`temple.json` 类型分布 general 24 / puzzle 14 / speed 10，`LevelMusic_dark` 470.4KB 无对应关卡、
本来就不装。所以省下的是"另一族"，不是"下一相位"——r15 挂账里那 500.6KB 的拆法（按相位推迟取结算/速度轨）
分析后**否决**：弱网下 `won`/`gameover` 到达时轨可能真缺席，属行为回归，而弱网手测未做，不能拿自动化门禁
论证测不到的场景。兼容性红线优先于 324KB。

**三条勘误入档**：①**`cache.audio` 只能用 `getKeys()` 枚举**——账本 `entries` 是 List 包装（own keys 只有
`entries`/`size`），r14 读不存在的 `.keys`、首版修复读 `Object.keys(entries)` 都恒 0，r14/r15 驻留表的
`音 0/2键` 全是仪器伪差（正文未引用 audioMB，故无需勘误正文；旧快照该字段一律不作数）；
②Phaser 3.90 SoundCache **没有 `set()`**，门禁的阳性对照不能靠注入缓存，改为**请求面**断言；
③A/B 手法"5 文件回退 `bddd85b`→构建→测→恢复 `ac0516f`"会让 base 快照的 `meta.git` 记成检出 HEAD 而非内容
提交——共档对比先看内容回退记录。

**不主张之项明写**：`Menu active 741.5→745.5`(f01)、`640→782.5`(f12，超 ±120ms 带但本轮无 Menu 面改动可解释，
按跨进程复测漂移处理)、`点击→Game 1323→1274.5`/`1303.5→1248.5` 一律不声称延迟收益。`heapGCMB` game 态
22.9→22.9 **不动**——Chromium 的 AudioBuffer PCM 在 JS 堆外，−13.52MB 是 WebAudio 持有的解码缓冲，
不是 V8 堆。harness 里"暖装(点击前)"段恒 0KB 是机器人点击过快（页钟 1011ms vs 暖装 +120ms 启动）所致，
真人停留时这些字节本就发生在点击前。

剩余挂账（r17 起）：**待裁决不变**——二进制再编码 6148.5KB（冷启动总传输 88.8%），件A 后 general 关的
`LevelMusic` 1285.4KB 仍是单关最大项；下一轮候选——**四张图集 PNG 的分场景装载**（temple 态用不到 game 图集）；
perf-load 隧道节流档（`--rtt`/CDP emulate）未实现，−1449KB 在 2Mbps 下"少等 5.8s"仍是换算；真机 GPU 口径、
`prepareGround/buildGround` 命中计数、换关链剩余 ≈45ms、服务端 tick 侧、LAN/触屏/弱网手测、M12 拆分。

## 十四、r17 增补（2026-10-21，0.3.42 后第六轮）

> 报告 `2026-10-21-r17-dom-skin-atlas-decoupling.md`。方向切到**HTML 临路径上的 CSS 背景图**：
> 连接面板（石板大厅）是纯 DOM，其 CSS 用负 `background-position` 直接从三张整游戏图集取帧。
> 零协议、零物理、零 canvas 改动；素材像素逐字节不变（原始样本层证明）。

| 轮 | 焦点 | commit | 关键数字（同机同口径） | 门禁 |
|---|---|---|---|---|
| r17 | DOM 皮肤改专用合成贴图（图集退出 HTML 临路径）+ 新门禁 domskin | `3a5848b`+`98d383f`+`83d27a3`(量具/判据)、`043b2a5`(L5 预修)、`7c19e61`(件A)、`305715e`(普查刷新) | **Menu 段 4054→3799KB（−255.0KB，−6.3%）、请求 21→19**；CSS 皮肤行 3 条(1241.1KB, 20–24ms 起跳占 6 连接中 3 条近 60ms)→**1 条(80.5KB, 26–74ms)**；**DOM 侧解码位图 36.00→4.08MiB（−88.7%）**；**全链 6751→6830KB＝+79.0KB（本轮代价，明写）** | det **48/48**、vitest **191/191**、build/typecheck、**新门禁 domskin 4/4 零容差字节全等**、treebake 9/9、groundcache 6/6、journey 8 模式、route f01（winAt 39540 带内）、visual **92.79/92.96/93.10**（同码三次，极差 0.31pt）、perf-client canvas 60.9fps/1042KB·s⁻¹、advance 5/5 零网络·链 **1035.7→963.8/909.1ms**、audiofamily 14/14 |

**最不顺眼的那条必须先摆正**：基线里 PopupAssets.png 的 CSS 行在 20–78ms 就把 334.4KB 拉完，
1148ms 时 Phaser 自己的 XHR 只花 **0.3KB**（缓存命中）——这三张图集的字节**本来就要下**，
DOM 皮肤只是把同一笔账提前到最贵的窗口。件A 后 PopupAssets 退回点击后真实下载（1208–1239ms，31ms），
所以分段账是 Menu 段 −255KB、点击→Game 段 +334KB、全链 **+79KB**。收益落在**争用形状**
（HTML 解析关键窗的连接占用 3→1）、**解码位图面**（−31.92MiB，Phaser 那份本来就存在）与**结构解耦**
（`grep -rn atlasses` 在 `packages/**/*.{html,css}` 已为空集，皮肤与游戏图集再无坐标耦合）。
LAN 场景 +79KB≈0.06s@100Mbps，故裁定**保留件A、不补 `fetchpriority=low` 图集 preload**——
补 preload 等于把"提前下载"换个写法请回来，而里程碑没有任何需要抢救的回退。

**等价性用两层各自表态**：内容层自写 PNG 解码器（inflate IDAT + 反滤波 0–4）取 RGBA 原始字节对拍，
6 帧 **3,197,812 个样本字节 0 差异** + 隔离带全透明 + 块序一致；画面层四态逐像素表（整幅最大级差 39.6/255、
区均 0.0149，大值只在石板棱边与头像边缘——"同一内容换了重采样相位"的形状）。为什么 `magick compare` 不能充当内容层证明：
两侧都过同一套色彩管理，±1 量化差被抹平成 AE=0，它测不出"字节变过"。**门禁坚持零容差**，
本轮按脚本头写好的三步"有意换代"流程收口（量表→报告→`--save`，代次记进 `manifest.provenance`），
不为一次改动放宽容差。

**门禁顺手抓到的两件事**：① L5——`.btn .av` 的 `background` 简写（特异性 0,2,0）把 `.av-fire/.av-water`
（0,1,0）的 `background-position` 复位，**火头像从来没画对过**，AE=1248/最大级差 255 定位在两颗头像框；
② 普查防护网转红——census 对 `client` 根 `*.html` 取原文（注释也算），L5 的中文 CSS 注释带来"特"等字，
按测试自述补救刷新 `used-chars.json`（字体仍是 r7f"不子集化"全量，无渲染影响）。

**不主张之项明写**：DCL 232.5→234.5、`__fw` 就绪 489.5→433.0、Menu active 754.5→732.0（两轮 861→773 与 648→691
方向相反＝带内抖动）、点击→Game 1502→1416、暖重载 715→813.5ms，全在 ±120ms 噪声带内，一律不作延迟收益主张；
`bakeMs` 均值 9.8→20.1 与本轮无因果路径（件A 不动换关链，r14 中位仅 7.6、5 次链里一次预烘未命中即整层冷烘拉高均值），
按两态分布处理并挂 r18 复测；`audio.count` 17→18 而同集合同 `totalKB`＝同一曲目重复计数，非多下一首歌。

剩余挂账（r18 起）：**待裁决不变**——二进制再编码 6148.5KB（冷启动 88.8%），它是最大单一杠杆；
**r17 候选"四张图集分场景装载"本轮已量到边界并基本关闭**（CharAssets 是 Boot 关键路径＝Menu 立绘/idle，
MenuAssets 是 Menu 首帧石板按钮，PopupAssets 已在 `loadGameAtlases()` 暖装队列，font.png 被 `MenuScene.ts:92`
bitmapText 直接要用——可挪的只剩 Menu 不用的帧，上限个位数 KB）；perf-load 隧道节流档（`--rtt`/CDP emulate）
仍未实现，+79KB 在弱网的代价只能外推；真机 GPU texMB/烘焙峰、`prepareGround/buildGround` 命中计数、
换关链剩余 ≈45ms、服务端 tick、LAN/触屏/弱网手测、M12 相机与共享 DTO 拆分。

## 十五、r18 增补（2026-10-21，0.3.42 后第七轮）

> 报告 `2026-10-21-r18-font-two-phase.md`。方向切到 **Boot 关键路径上最大的单一文件**：
> `assets/fonts/chinese/font.png` 1600.3KB（占当时 Menu 段 3799KB 的 42.1%）。进房前画布真的只需要 75 个字符
> （其中 53 个在 `font.fnt` 有字形），于是把这一份拆成两代：Boot 装子集 304.5KB，全量延到游戏内文本真要用的时候才装。
> 零协议、零物理、零像素设计——子集是从官方 `font.png` 按字框**逐字节抄写**，其余 RGBA 清零。

| 轮 | 焦点 | commit | 关键数字（同机同口径） | 门禁 |
|---|---|---|---|---|
| r18 | 中文位图字两段化（`FONT_MAIN` 子集先行 / `FONT_FULL` 延迟）+ 新门禁 prephase-canvas | `4453c1a`+`7daea81`(量具)、`94290e3`(基线)、`c37f585`(件A 子集资产)、`90fe319`(件B 两段化)、`d25b275`/`add2616`/`832bccb`/`2ae6154`(防护网+门禁)、`20ae670`(件C) | **Menu 段 3799→2504KB（−1295.0KB，−34.1%），请求 19→19**；点击→Game 段 3031→4632KB（+1600.6＝全量字体挪到这一段）；**全链 6830→7135KB＝+304.8KB（本轮代价＝子集那份新文件）**；驻留位图 **1→2 张 8,974,336B**；条件复验 46→47 URL、6816.1→7120.7KB→**0KB** | det **48/48**、vitest **202/202**、**新门禁 prephase-canvas 5/5 零容差字节全等（三代产物指纹互验）**、treebake 9/9、groundcache 6/6、audiofamily 14/14、domskin 4/4、journey 8 模式（**wonrefresh 6/6＝件C 靶**）、route f01（winAt 39494·39514·39505 带内）、visual **90.63%** 平移 (0,0)、perf-client canvas 60.3fps/998KB·s⁻¹、advance 5/5 零网络·链 1090.5ms |

**收益在形状不在总量，代价必须明写**：Menu 段砍掉三分之一，但全链多出 304.8KB，且页面生命周期里从此挂着
**两张同尺寸（2191×1024）解码位图**——件A 刻意不动 `.fnt`（260 条度量留在原位），子集就只能与全量同幅。
`benchmark/font-decode-probe.mjs` 实测：1600.3KB 的传输在同场批内只占 **36ms**，解码差（createImageBitmap 110.9 vs 37.0ms）
也小于驻留差。所以本机口径下这轮**不主张任何毫秒收益**，只主张字节形状、请求占用窗与那条翻出来的 r19 靶：
**字形帧紧凑重排＋配套 `.fnt`**，把两张 8.97MB 一起降到 ≈1–2MB 量级。

**本轮最重要的收获是量具纪律**：跨快照（相隔数小时、中间跑过整套门禁）的 ms 比较**不算证据**。
同场 A/B/A（回退重建→测→恢复→测→再回退→测，`load-r18-ab-{full,split,full2}.json`）显示：
**同一份全量代产物两次跑，点击→Game 差 446ms**（1716.5 vs 1270.5），远宽于战役此前用 DCL/menuActive/reload 标定的 ±120ms 带。
本轮先前记的"Menu active +108ms""点击→Game +370ms"因此**全部撤回**，报告 §五之一留全文。

**为什么必须新造第四道门禁**：`domskin` 截屏前把画布摘掉、`visual-diff` 只拍 Game 战斗帧、`journey` 只读 DOM `textContent`——
前场画布里那些中文（「开始游戏」、选关 48 枚编号、面板标题）一旦少一个字框，用户看到的是字面一个洞，而三套门禁全绿。
prephase-canvas 把 Phaser 自驱动三路封死、改按 1000/60ms 合成步推 `Game.step`（相位＝步数），`Math.random` 换 mulberry32，
`--save` 前做非空画布体检，判据 SHA-256 逐字节；代次**由产物指纹判不由 HEAD 判**，`manifest.bundlesVerified` 已并列三代。

**两处勘误（都是本轮先写错、后按实源改对）**：① "重复声明 `FONT_FULL` 完全免费"不成立——`bitmapFont` 两个孩子各自入队
（`BitmapFontFile.js:234`），png 命中 `textureManager` 被跳过（不重下、不换纹理），但 `.fnt` 元数据**每次重声明都会再请一次**
（本机 0 字节 304），与 r5 起四张图集 `*.json` 一直是同一形状；② 件C——首轮套件就抓到 `journey wonrefresh` 与 vitest 各一条红
（`Invalid BitmapText key: font-full`，刷新回座 `won` 时结算板根本开不出来）。根因是件B 留下的隐含假设"房前文案的纹理总有人会先装好"：
`enterGame` 的 500ms 黑幕把 `Game.preload` 压到弹窗场景之后。修法取既有约定同构的**消费方自备声明**（抽 `loadFontFull()`，
`loadGameAtlases()` 与三块面板各自 `preload()` 调它），防护网补第 11 例静态断言并做过阴性对照。

**发现（非本轮回归）**：进房前 75 字里 **22 个今天就没有字形**（`menus.ts:29` 的「设置」整块、`transition.ts:26` 的 `Loading...` 等），
`.fnt` 未声明 ⇒ Phaser 静默跳过、advance 为 0。本轮刻意不补（补字形＝往官方图生成新墨＝有意变外观），列为待裁决。
**归属已定谳、且分两群（[41 号档](../research/2026-10-fidelity/41-chinese-font-glyph-coverage.md)，结论不是单向的）**：
G1 六串文案（设置/音乐/音效/制作人员/致谢行/`Loading...`）在官方变体 A 全树 `grep -rl` **0 命中**——原版这些位置是图集图标
（`MusicButton/FxButton`）或 `PreloaderAssets` 纯 sprite，属**我方自创文本＝我方缺口**，任何官方图集（含 `output/E` 的 315 字版）都补不出；
G2 的「恭喜！」却与官方 `utils/lang/ch` 字典字面逐字相同，官方也走这张 260 字形 canvas 图集（`States_Complete_GameCompleteMenu.js:17`）
⇒ **原版同样只显「！」，属忠实呈现**，而 E 的 315 字图集可补齐它。处置四条按群分别裁，仍待裁决。

剩余挂账（r19 起）：**待裁决面额按终态重算**——≥64KB 未压缩二进制 15 条 **6357.1KB＝全链 7120.7KB 的 89.3%**（r15 旧记 6148.5KB/88.8% 作废），
其中两份字体副本 1905.4KB（26.8%）也在这本账里；**r19 首位＝字体图集重排**（同上）；22 缺字形处置待裁；
perf-load 隧道节流档（`--rtt`/CDP emulate）仍缺位，r17 的 +79KB、本轮的 +304.8KB 在弱网只能换算；
真机 GPU texMB/烘焙峰、`prepareGround/buildGround` 命中计数、换关链剩余 ≈45ms、服务端 tick、LAN/触屏/弱网手测、M12 相机与共享 DTO 拆分。

## 十六、r19 增补（2026-10-22，0.3.43 收口轮）

> 报告 `2026-10-21-r19-font-atlas-reflow.md`。打的是 r18 自己立下的那张靶：**字形帧紧凑重排＋配套 `.fnt`**。
> 做法只改坐标——`<char>` 的 `x=`/`y=` 与 `<common>` 的 `scaleW`/`scaleH`，261 条声明的
> `width/height/xoffset/yoffset/xadvance/page/chnl/lineHeight/base/padding` 逐条不变。

| 轮 | 焦点 | commit | 关键数字（同机同口径） | 门禁 |
|---|---|---|---|---|
| r19 | 进房前字体图集重排（区域＝帧 ∪ `padding=4` 环带整块搬源；206 条未保留声明＋2 条 0×0 共享一块透明块） | `7906e56`(量具＋假设核验)、`99fcb30`(生成器)、`02841b0`(产物)、`09c8a2e`(装载)、`fd4bcdb`(静态网)、`5e4341c`+`08097c7`+`c82903d`+`4a40074`(取证工具与量具换代)、`8b30619`+`2eaffcd`(换代证据＋基线)、`b043eb0`+`e616a72`(快照)、`9f50dac`(报告) | 产物 **311,836→248,196B（−63,640B，−20.4%）**、解码位图 **8,974,336→1,521,072B（−83.0%）**、幅面 2191×1024→**1006×378**；Menu 段 **2504→2440KB**、全链 **7135→7076KB**、请求 19/48→19/**49**；**同场 A/B/A（只换 dist 资产、JS bundle 逐字节相同）六态 texMB 各低 7.10~7.11MB、同臂复跑逐位相同、`heapGCMB` 三臂不动**；换臂法转正为 `benchmark/ab-assets.sh`，用新台复跑一遍 18 个 texMB 读数与证据逐位相同（`resident-smoke-ab-*.json`）；换代取证 **2,635px＝0.018%，R/G/B 最大差 1，100% 落在 3x3 有渐变的抗锯齿边缘、平坦区 0 个** | det **48/48**、vitest **203/203**、**prephase-canvas 5/5 逐字节（换代，`--reason` 全文入 `manifest.provenance`）**、treebake 9/9、groundcache 6/6、audiofamily 14/14、domskin 4/4、journey 8 模式、route f01（winAt 39538·39520·39533 带内）、visual **90.61%** 平移 (0,0)、perf-client canvas 60.6fps/1043KB·s⁻¹、advance 5/5 零网络·链 1130.3ms（不主张） |

**本轮最值钱的是一条否定**：开工前的共识"padding 声明的是每帧四周的透明衬边，重排留 ≥1 texel 隔离带就安全"
被量具逐字节推翻——`font.png` 里 **258 条有墨字形全部同时命中 `bandViol` 与 `outsideViol`**，帧墨顶到帧边、
帧外 1 texel 读到的是邻帧的墨。**衬边是声明，不是事实**。由此：① 只搬帧矩形的"原样重排"作废（采样邻域变了）；
② 裁到墨迹包围盒要改 `xoffset/yoffset`，且裁掉的像素正是被邻帧采到的墨 ⇒ 排除；
③ 环带必须跟着搬，于是**全量图集重排成内存负收益**（A′ 候选 1598×1453＝8.86MB，比今日 8.56MB 还大）——
r18 期望的"两张 8.97MB 一起降到 1–2MB"只兑现了进房前那半张。

**两个口径坑登记**：① **POT×POT 拒绝**——Phaser 按 `generateMipmap = IsSizePowerOfTwo(w,h)`
（`WebGLTextureWrapper.js:344`）决定采样级别，重排候选若凑成 2 的幂对，就从纯 LINEAR 变成 LINEAR_MIPMAP_LINEAR，
"只动坐标"这句话当场不成立；`pack()` 因此多了 `forbidden(w,h)` 回调，量具与生成器共用同一口径层。
② **换代耦合**——量具与生成器都不能把参照系指向某一代在库产物：`reflow-measure.mjs` 读在库那张重排代 PNG
按源帧坐标去裁，直接越界抛错（`4a40074` 改为 `composeSubset` 内存复现上一代）；`build-font-prephase.mjs`
则加 `guardReflowGeneration()` 拒写"旧布局 png 配新坐标 fnt"这类错代成对产物，阴性对照实测退出码 1。

**门禁换代流程首次成形**：`--save` 在像素与前批不等且无 `--reason` 时硬抛（本轮首跑就撞在这条上），
理由直接写进 `manifest.provenance`；差图与逐像素取证 JSON 落 `benchmark/results/prephase-canvas/r19-reflow-evidence/`。
新增 `scripts/e2e/pixel-forensics.mjs` 把"AE 一个数字"拆成每通道计数/最大差/α 可比性/渐变-平坦归属/包围盒，
判据固定为**平坦区有差或 α 有差＝缺陷，全落渐变且平坦 0 才可按换代入账**；`png-raw` 顺带支持 colour type 2（截图基线）。
α 一栏在这类配对上标 **n/a**（RGB 截图补出来的 α 恒 255 是同义反复），透明度由资产层"区域含 α 逐字节＝源"的硬断言覆盖。

剩余挂账（r20 起）：**待裁决面额按 r19 终态重算**——≥64KB 未压缩二进制 **15 条 6295.0KB＝全链 7061.1KB 的 89.1%**
（上一记 6357.1KB/89.3% 作废），其中两份字体副本 1843.3KB（26.1%）；**全量字体那 8.56MB 本轮判为不可动**，
动它只有一条路＝接受采样级别变化或改度量面，属观感/复刻层面决策，须先立新判据件；
`iTXt` 16.9KB 生产者元数据可再省产物 6.7%，但要连"辅助块原样保留＋块序核"一起重定口径，收益小、动的是可复现性判据，暂不排；
22 缺字形四条处置仍**待用户裁决**；perf-load 隧道节流档（`--rtt`/CDP emulate）仍缺位，r17 的 +79KB、
r18 的 +304.8KB、本轮的 −63.6KB 在弱网只能换算；真机 GPU 显存口径、换关链剩余、服务端 tick、LAN/触屏/弱网手测、
M12 相机与共享 DTO 拆分照旧。


## 十七、r20 增补（2026-10-22，弱网档位量具轮）

> 报告 `2026-10-22-r20-network-tiers.md`。这一轮不产出收益，产出的是**判据**：
> 挂账多时的"perf-load 隧道节流档"补上，此后所有弱网数字是实测而不是换算。

| 轮 | 焦点 | commit | 关键数字（同机同口径） | 门禁 |
|---|---|---|---|---|
| r20 | `--net off/cable/4g/fast3g/slow3g`（CDP `Network.emulateNetworkConditions`）＋生效自检＋阴性对照；四档基线与冷启动关键路径归因；进房前阻塞批预取件**实测判退**；PNG 无损重压缩执行器就位（未 apply） | `dc95246`(量具)、`d043f2d`(基线归因)、`405a594`(件2 判退)、`30b4e0f`(件3 执行器)、`0d70a7a`+`85dcd98`(收口＋更正) | 弱网三段"闸前富余"仅 **13.4%/8.0%/5.1%** ⇒ Menu 段与进房段都是**字节账**；每 KB 价签 **4g 2.048ms／fast3g 5.12ms／slow3g 16.384ms**；进房段 4636.0KB、字节下限 4g 9.49s／slow3g 76.0s；同臂复跑带 4g 12–23ms、off 103–330ms；预取件机制成立（crossorigin 复用）但里程碑一升一降、无跨带净收益 ⇒ 全退；`png-opt` 14 个 **4322→4175KB＝−147.6KB** | typecheck 0 错、vitest 203/203、产物指纹与 r19 逐字节相同（`rel="preload"` 源码与 dist 均 0）、`reflow-prephase --check` RC=0、`build-font-prephase --check` RC=1（设计内护栏）、`png-opt --check` RC=0、`FW_NET_NOOP=1` 逼出自检报错、off 档回归与 r19 逐字节一致 |

**登记一条自己写错又当场更正的口径**：曾用 Node 墙钟跨度（`gameActiveAfterClickMs`）去比页钟绝对值
（Resource Timing `responseEnd`），得出"Game active 不被房内资产门控"——**这是假结论**。
页钟对齐（`clickPerfMs` 为原点）后八组一致：Game active 恒在最后一笔落定后 140–215ms。
此后铁律：**任何跨 `clickPerfMs` 的比较必须先归一到页钟**。

## 十八、r21 增补（2026-10-22，循环曲出落定门轮）

> 报告 `2026-10-22-r21-bgm-out-of-gate.md`。按 r20 那张价签表反向施工：
> 既然进房段是字节账，就把**单笔最大且首帧用不到**的那一笔（关卡循环曲 1285.4KB）搬出落定门。

| 轮 | 焦点 | commit | 关键数字（同机同口径） | 门禁 |
|---|---|---|---|---|
| r21 | 循环曲出落定门与阻塞批：门内只留 sfx＋终局曲＋失败曲；Menu 落定后 +1500ms 追取，快进路径由 `GameScene.kickBgmLoop` 在 create 后补取、`load.complete` 时补播（守卫逐字对齐 create，SHUTDOWN 摘 `once` 句柄） | `1eefcf1`(实施)、`4f1bab1`+`b65279d`(台架)、`1cba76f`+`231a60a`(量具) | 四档 A/B/A 的 `点击→Game`：4g **10505→7813.5ms（Δ−2678，同臂带 27ms 的 99×）**、fast3g **24845→18332（Δ−6465，带 97ms 的 66×）**、slow3g **78607.5→57218.5（Δ−21448，带 118.5ms 的 181×）**、off +193ms（带内，无回归）；进房段 **4636→3350KB**、到 `Game active` 累计 **7076→5791KB**、请求 19→19；**实测与 r20 单价表吻合到 1.8% 内**（这是该归因律第三次独立复现） | typecheck 0 错、vitest 203/203、det **48/48**、audiofamily **14/14**（general/speed 双档都是延迟批兜底后真在播）、journey refresh/wonrefresh/deathretry/rejoin、**route forest_01 与 forest_12 双双 won**、prephase-canvas/domskin 逐字节、treebake/groundcache 全过、三臂 `doubleDownloads` 全空、复验 7061.2→**0KB**、页面错误 0 |

**代价与它为什么仍然成立**：字节守恒，搬运不是免费午餐。快进路径（不在 Menu 停留就建房）弱网下
出现"已可玩但无 BGM"窗口，4g 实测 **2749ms**；但同一档位"进房且有声"的端到端时刻只挪了 **+39ms**
（改前 16800ms／改后 16839ms）——可玩提前 2710ms，音乐到位时刻几乎不动。驻留路径实测
出声与进房同帧（4g 驻留 14s：进房 1741ms；改前同路径 1782ms），正常玩法不受影响。

**登记一条量具假设的证伪**：原以为"快照时仍在飞"会留下 `responseEnd=0` 的 pending 条目，
实测**音轨走 XHR，Resource Timing 只在请求完成时入表**——12 份 A/B/A 快照 `pendingCount` 恒为 0，
出闸的证据形态是"整条缺席"。因此新增 `loopDeferred` 作为这一类改动的通过条件，
而不是拿 pending 当判据。

## 十九、r22 增补（2026-10-22，Menu 段最后一笔非像素字节＋角色图集按消费点拆张）

> 报告 `2026-10-22-r22-menu-bgm-out-of-blocking-batch.md`（件1/件1b）与
> `2026-10-22-r22-char-atlas-split.md`（件2）。r21 把进房段最大的一笔搬走，本轮搬 Menu 段：
> 先是唯一不落在像素上的 `MenuMusic.mp3`（150.1KB），再是阻塞批里最大的 `CharAssets.png`（714.9KB/239 帧）。

| 轮 | 焦点 | commit | 关键数字（同机同口径） | 门禁 |
|---|---|---|---|---|
| r22 件1/件1b | 菜单曲出 Boot 阻塞批：v1（`ecf47ec`）单独成批、暖装串在其后；v2（`dd9e915`，现役）把它并进暖装**队头**，起播绑自己那支文件的 `filecomplete`，并按 `settings.music` 门控 | `ecf47ec`(v1)、`dd9e915`(v2) | `Menu active` Δ＝4g **−327ms**（最差带 132，5.8× 配对带）、fast3g **−784ms**（带 81，9.7×）、slow3g **−2540ms**（带 92，27.6×）、off −9ms（带内）；Menu 段 **2441→2291KB**、请求 **19→18**，到落定总量不变（字节只换窗口）；行为面：菜单曲到位在点击后 1788/4519/14519/196ms，仍早于进房 6419/14633/45215/1291ms | det 48/48、audiofamily 14/14、journey 四模式、route 双关 won、12 快照 `doubleDownloads` 全空、页面错误 0 |
| r22 件2 | 角色图集按消费点拆两张：`CharAssetsMenu`（53 帧 152.1KB，留阻塞批）＋ `CharAssetsGame`（186 帧 461.9KB，走 `loadGameAtlases` 延迟批）；`buildMenuAnims` 缩到 idle 两式，房内十一式 `buildCharAnims` 推迟到纹理落定后注册 | `536fadc`(素材)、`7a9e289`(隔离带)、`24684b3`(接线)、`9bedda1`(取证) | `Menu active` Δ＝4g **−1182.6ms**（10 轮/臂，最差带 191 的 6.2×）、fast3g **−3004.3ms**（带 148，20.3×）、slow3g **−9221.0ms**（带 31，297.5×）、off −29.6（带内）；落定门 `gameActivePerfMs` ＝4g −188.4（带内）、fast3g **−460.8**、slow3g **−1655.5**、off −32.7（带内）；Boot 窗线上 **−565KB**、全链会话 **−80.3KB**（两张相加仍比整张小）、驻留纹理六态各 **−0.13~0.14MB**（算术 0.1378）；**与 r20 单价表吻合到 0.4%–3.9%**（归因律第四次独立复现） | typecheck 0 错、vitest **213/213**、`split-char-atlas --check` 逐字节、det **48/48**、canvas 换代入账＋对拍 **5/5 逐字节**、domskin **4/4**、audiofamily **14/14**、journey 3/3·6/6·4/4·3/3、route forest_01 39550ms 与 forest_12 13014ms 双双 won、treebake 9/9、groundcache 6/6、regression **缺帧警告=0** |

**换代入账（canvas 口径第一次因"拆张"而非"重排"而改）**：`prephase-canvas` 基线 5 态重写，与上一批差
**23 像素**（menu 13 / settings 5 / credits 5），逐通道最大级差 1、平均绝对差 0.36~0.40、
**100% 落在抗锯齿渐变区、平坦区 0**，menu 那 13 个聚在 `x[295,993] y[839,889]`（双角色脚下渐变带）；
`temple`/`temple-numbers` 逐字节相同 ⇒ 改动只影响画角色的三态。机制＝POT 2048²→NPOT 两幅的采样/UV 取整变化。

**登记判据补条（噪声闸门从两条增至三条）**：跨臂主张一个差值，必须同时过
① 同臂**最差带** `max_{r,r'}|A_r−C_r'|`（均值带与配对带都不够——它们各自只在单轮配对上收缩）；
② **臂B 自身散布**（同代产物内部都差这么多，就不能读作臂间差）；
③ **高漂移档要求 ≥8 轮/臂池化**——off 这类管线绑定档臂间散布可达数百 ms，2 轮链连"带"本身都还没框住。
本轮两次踩线并当场更正：件1b 的 off 档"+564ms/带 7ms"（`verdict.mjs` 只读 `rounds[0]`，两轮换算实为 +170ms/带 254、臂B 自身差 1001ms）；
件2 的 off 档"+287ms 代价"（①②都过，③不过——10 轮池化后 −32.7ms/带 866，代价不存在）。
另一条同形状纪律：**差值口径的带不能比它的组成部分更严**——`gameActiveAfterClickMs` 的跨度 Δ 超带而它的两个组成
（绝对进房、点击时刻）都在带内时，一律读作带内。跨度列（`clickPerfMs`/`gameActiveAfterClickMs`）在
锚定点击的量具里天然被里程碑移动污染，只作旁证，落定门一律读页钟绝对值 `gameActivePerfMs`。

三条闸门已有执行器（本轮升入库，替代各轮 TEMP 里的一次性算带脚本）：
`node benchmark/load-ab-bands.mjs <档> <链[,链…]> [指标…]` 直接打均值带/配对带/最差带、臂A/臂B 散布、
逐轮样本与闸门①②③的判定，末尾附四档字节窗口表；高漂移档轮数不足时它拒绝给"可主张"。
r22 的全部主张与两条作废读数都能用它复算（`4g r22c,r22d,r22e,r22f,r22g`／`off r22c,r22d,r22e,r22f,r22g`／`off r22`／`off r22b`）。

## 二十、r23 增补（2026-10-22，把角色播放序列那张图搬出落定门）

> 报告 `2026-10-22-r23-chars-play-out-of-gate.md`。r22 把 `CharAssets` 按消费点拆成 Menu/Game 两张，
> 本轮再切一刀并把**播放序列那 182 帧整体搬出门**：`CharAssetsEntry`（7 帧 28.3KB，留落定门）＋
> `CharAssetsPlay`（182 帧 442.4KB，房间可玩之后才取）。代 A=`acc044f`，代 B=当前 HEAD。

| 轮 | 焦点 | commit | 关键数字（同机同口径） | 门禁 |
|---|---|---|---|---|
| r23 件1 | chars-play 出落定门：Entry 留门、Play 出门；Play 张声明方两处（`startBgWarm` complete 后门落定时入队＋`GameScene.kickCharsPlay`）；房内十一式注册改为**到位即建**（只等 `filecomplete-atlasjson-chars-play`） | `40b20ba`＋`2a82051`＋`561c462` | 落定门线上 **463.5→28.7KB（−434.8KB）**、门后 +443.9KB、会话合计 **+9.1KB**、驻留纹理 **+0.30MB**、门内条目 3→5；`gameActivePerfMs` Δ＝4g **−819.1ms**（6 轮/臂，最差带 351 的 2.3×，面额 −890 兑现 92.0%）、fast3g **−2195.8ms**（带 244 的 9.0×，兑现 98.6%）、slow3g **−6985.3ms**（带 398 的 17.6×，兑现 98.1%）、off +21.8ms（最差带 967、臂B 自身散布 404 ⇒ 带内）；`Menu active` 四档全带内（阻塞批 Δ 0.0KB，本轮自带对照） | det **48/48**、`split-char-atlas --check` 六件逐字节、canvas **5/5** 逐字节（本轮**未**换代）、domskin 4/4、charsplay 21 项、treebake 9/9、groundcache 6/6、journey 3/3·6/6·4/4·3/3、route 双关 won、regression errors=0 缺帧警告=0 |
| r23 件1b | 代价侧专用量具：`perf-load` 的冷启快照看不见"门落定之后才入队"的请求（视界内**整条条目不存在**），故窗口改由 `scripts/e2e/charsplay.mjs` 用例二在自然路径上量 | `48ad05f`＋`f515026`＋`296d42a` | 窗口＝4g **+2053ms** / fast3g **+6753ms** / slow3g **+22183ms** / off **−3135ms**（负＝窗口不存在）；注册上界比 png 落定晚 250~300ms；`charsPlayInWindow` 由三值布尔升为三态观测 `none｜before-gate｜after-gate` ＋ `charsPlayArrivalAfterGateMs`，库里不留恒假字段 | charsplay 四档（含三档节流"真的生效"对照：最大单笔 font.png 体耗时 5985/19843/70342ms）全绿 |
| r23 附带修复 | 把入场链放到节流档，第一次撞出**换屏黑幕静默挂死**（与 r23 无关）：4g 早入场时 `FadeScene.create` 抛 `Invalid BitmapText key: font`，场景永久钉在 CREATING ⇒ 幕下 ops 永不执行 ⇒ 房间再也进不去 | `959db74`＋`8682956` | HEAD 与 `acc044f` 两条代次**同一条栈**复现（@3384ms／@3345ms，钉死 ≥40s）；加 `textures.exists(FONT_MAIN)` 卫后 `exit-ok`→ops 消费→XFade=8→Game 3→5（页钟 13.4s）零错误。历轮看不见它：off 档 Boot 批 ~0.6s 落定，而 `perf-load` 单坐路径等过 `Menu active` 才点建房 | 修复后代次 18 步套件 16 步当场绿；两步红在 `prephase-chars.json` 的**行钉**（源码加注释即漂移），同步行号后 reflow-check `--check` 产物逐字节不变、vitest **20 文件/215 用例** |

**本轮三条可复用结论**：
① **"搬窗口"的代价形状里有一种量具根本看不见的类型**——资源在快照之后才入队时，Resource Timing 里不是
`pending`、不是"晚于进房"，而是**没有条目**。任何"门外/延迟"类改动若把断言写成 `list.length > 0`，
在正确行为下恒假。修法：字段照录三态观测、判定交给专用探针（锚在"确实上屏"那一刻），并保留一条阴性对照。
② **注册时机是 r22 那条急切解析陷阱的时间版**：`anims.create → Animation.getFrames` 在注册那一刻解析全部帧名，
早一步就各自绑 `__BASE`（只 `console.warn`）且 `exists` 幂等卫禁止重建 ⇒ 错帧一路带着播。窗口期行为是良性降级
（`Missing animation` 后原样留着当前帧，形状＝"以 idle 的样子跑跳"），静态网把 Entry∩Play 的三个 0000 帧交集钉成精确集合相等。
③ **行钉式静态网的税**：`prephase-chars.json` 以"文件＋绝对行号＋该行必须含该文案"绑定子集与源码，
加注释就会红（本轮红了两步）。这是刻意的防漏字设计，暂不改口径；若要改成"锚点符号±窗口"属于口径变更，需另立一轮补测。

## 二十一、r25 增补（2026-10-22，把两支终局时刻曲搬出落定门）

> 报告 `2026-10-22-r25-terminal-bgm-out-of-gate.md`。落定门里的最后一笔"进房用不到"的字节：
> 失败曲 `LevelMusicOver`（159.6KB）＋本族终局曲 `LevelMusicFinish[_speed]`（163.7／68.9KB）出门，
> 并入 r21 那条 `delayedCall(1500)` 门后 BGM 批、排在循环曲之后。代 A＝`e35b960`，代 B＝现役。

| 轮 | 焦点 | commit | 关键数字（同机同口径） | 门禁 |
|---|---|---|---|---|
| r25 件1 | 两支出门：`bgmTerminalOf(family)` 单一口径＋`thenLoop` 追加一批＋房内 `kickBgmTerminal()` 兜底快速进房；`catchUpFinish` 三道卫只补终局曲、失败曲**不补**（时刻绑定的一次性音） | `a3e2ba9`＋`c7d621d`＋`22c17d7` | 落定门线上音频 **323.9→0KB**；`gameActivePerfMs` Δ＝4g **−623.8ms**（最差带 127 的 4.9×，面额 −662.1 兑现 94.2%）、fast3g **−1610.8ms**（带 90 的 17.9×，兑现 97.3%）、slow3g **−5362.8ms**（带 140 的 38.3×，兑现 101.2%）、off −79.0ms（臂B 自身散布 108 ⇒ 不足判定不主张）；`Menu active` 四档全带内（阻塞批 1727KB/18 条 Δ0.0KB）；房内窗 3531→3207KB（−324KB／−2 条）、到落定 5258→4934KB；会话与驻留 Δ0 | det **48/48**、canvas **5/5** 逐字节（产物哈希换代 BZ9iZU0M→CxewXNds，像素不变）、`split-char-atlas --check` 六件逐字节、`reflow-prephase --check` 逐字节、vitest **20 文件/220 用例**（＋5 条 r25 静态网）、domskin 4/4、treebake 9/9、groundcache 6/6、journey 3/3·6/6·4/4·3/3、route 双关 won 39469／13430ms、regression errors=0 缺帧警告=0 |
| r25 件2 | 代价侧量具：`audiofamily` 升四档节流口径，串三次 `waitForFunction` 换页钟观察器，到位上限按 slow3g 实测重取（2×名义 → 8×名义） | `63b181a`＋`e1229b0`＋`d91ab86` | 终局时刻曲到齐窗口 4g **4109／4218ms**、fast3g **20739／20131ms**、slow3g **78234／76793ms**、off **0ms**；循环曲窗口 7796／3884、32746／19314、119986／74144ms——两臂对比臂B 反而更早，无 r25 归因的"挤后"；12 份快照入库 `load-r25-ab-*` | 四档 audiofamily 全绿（off 22 项）；三档节流"真的生效"对照逐档通过 |

**本轮三条可复用结论**：
① **"慢但正确"与"永远不来"只能靠有界断言区分**：把设计行为写成"进房即在播"这种瞬时硬断言，
4g 首轮就红了 4 项（循环曲还在飞时终局曲先到）。判据应是"CAP 内入缓存"＋"到位后真在播"，
瞬时态只登记不判定。
② **窗口类量具的锚点必须只有一个**：串三次 `waitForFunction` 会把前两次的空等算进后一次的"自锚点毫秒"，
本轮读出过 119741ms 这种不可能的数。改成页内一次观察器、逐键记首次 sightings、附网络侧 `responseEnd`，
既拿到各自窗口，也能区分"到得晚"与"根本没请求"。
③ **上限系数要按实测有效吞吐取，名义档位带宽在多用例并发下不可用**：slow3g 名义 62.5KB/s 下
2051.7KB 音频批应当 ≈32.8s，实测循环曲 119986ms（3.7×）——同一页在落定后还要付 font.png 1600.6KB 等一票字节，
且本用例同时挂着两个节流上下文。系数按"≥2×实测窗口"取，并把首次超时当成量具问题而不是产品问题。

## 二十二、r24 增补（2026-10-22，房内字体子集：测得 −909.6KB/4.64MiB，但像素等价性判负，未 ship）

> 报告 `2026-10-22-r24-room-font-subset.md`。件0 勘察（114 字、871×1179）→ 件1a 生成器/产物/静态网 →
> 件1b 换装载（`c4bc9d5`）→ 件2 四档 A/B/A 与驻留 → 件3 像素门禁判负 → **回退 `966e7a5`**，
> 现役 `FONT_FULL` 指回官方 `font.png`。下面的 ms/MiB 是"若像素等价成立本可兑现"的面额，不计入线上成绩。

| 轮 | 焦点 | commit | 关键数字（同机同口径） | 门禁/裁决 |
|---|---|---|---|---|
| r24 件0 | 48 关 `parseLevel` 选层 ∪ 行钉字面量 ∪ 动态数字点，同口径图集测量 | 勘察件在 TEMP（已清理） | **114 字符，全有帧**；官方 1631.1KB/8.56MiB → 子集 **721.6KB/3.92MiB**（−909.6KB / −4.64MiB） | 两份独立需求代码集合差为空 |
| r24 件1a | `room.mjs` 口径 + `build-font-room.mjs` + 产物 + `font-room.test.ts` | `5a2bf1f`＋`cf9fd48`＋`998b9be` | 871×1179、707,913B、帧密度 74.94%、114 字帧与环带逐字节、需求外全零、260 条声明度量不变 | typecheck、vitest、三复现门禁；独立核验 `scripts/font-subset/verify-room.mjs` 全绿 |
| r24 件1b | `FONT_FULL` 只换 URL（键与消费点不动） | `c4bc9d5` → 回退 `966e7a5` | — | **像素门禁判负**：18/24px 逐字节同，26/36px 不同（gameover 407px、pause 52px）⇒ 回退 |
| r24 件2 | 四档 A/B/A（2 轮/臂）+ 驻留 A/B | 快照 `load-r24-ab-*`、`resident-r24-*` | `gameActivePerfMs` Δ＝4g **−1873.5ms**（最差带 107 的 **17.5×**）、fast3g **−4688.8ms**（带 174 的 26.9×）、slow3g **−15356.0ms**（带 342 的 44.9×）、off −168.3ms（带内）；兑现 100.6/100.7/103.0%；`Menu active` 四档全带内；房内窗 **3207→2298KB**（−909KB）、驻留 **−4.64MiB**（Menu 84→79.36、进房 98.94→94.29） | 三闸门全过（潜在面额） |
| r24 件3 | 根因定位、回退、量具修正、门禁收口 | `966e7a5` + docs | 根因：Canvas 位图字按**绝对源矩形** drawImage，Chromium 降采样核相位依赖该坐标；`font-phase-probe` 实测 **18/24/48 = 0/114 差，26 = 66～81/114，36 = 0～54/114** | 回退后全套 **FAIL=0**：det 48/48、prephase 5/5、vitest 21/230、journey 11/3/3/6、route won 40018ms、regression 零错 |

**四条可复用结论**：
① **图集帧字节等价 ≠ 位图字上屏等价**：`drawImage` 的降采样核相位由源矩形在图集里的绝对坐标决定，
只有 scale ∈ {1, 1/2, 3/8} 与位置无关。任何图集重排先按"实际字号 × 目标相位"过
`benchmark/font-phase-probe.mjs`（常驻），不能只验帧字节。
② **跨跑像素基线不是免费的**：同一 head/同一 bundle 的两次运行，探针参照侧 21/22 条 sha 不同、且全部后跑少墨；
同轮里 24px「00:00」面级对拍逐字节相同、探针却报 −1.97%；回退后官方↔官方的对照更是 6/6 面逐字节相同而
22/22 串仍差 1.1–2.0% 墨迹 ⇒ 串级探针不能作判据，只有**同轮双键面级对拍**能判。
③ **面额兑现率可以超过 100%**：砍房内窗字节主体（font 占 49.9%）在 4g/fast3g/slow3g 兑现 100.6/100.7/103.0%，
与 r25"搬尾巴"的 94–101% 构成两种兑现结构。
④ **负结论也要闭环**：生成器/产物/静态网/独立核验/相位探针全部留在树里，下一轮解决 26/36px 等价性后可直接复用；
TEMP 中间件清理，不把负结论的残留留在工作区。

## 二十三、r26 增补（2026-10-22，三张进房图集零消费帧原地清零）

> 报告 `2026-10-22-r26-atlas-blank-in-place.md`。r24 的相位教训之后，本轮不重排、不缩放、不动图集尺寸：
> 只把 48 关永不绘制的帧矩形在原地清零，官方 JSON 与全部活帧坐标不动，Slim PNG 只换装载 URL。

| 件 | 内容 | commit | 关键数字 |
|---|---|---|---|
| r26 件0 | 48 关 census：逐关机关/装饰需求、按关子集方案、整张出门方案的面额对比 | 勘察件在 TEMP（已清理） | mech 每关仅 34–53 帧、24 种不同子集；整张出门在门内值 4g 972/577/687ms，但首帧缺 63/14/1 帧；原地清零取"零机制、零坐标移动"的子集 |
| r26 件1 | `scripts/atlas-slim`（需求口径＋生成器）＋三张 Slim PNG＋三处装载换 URL＋11 例静态网 | `2c45c79`＋`2343f0a`＋`6c38772` | mech 163 帧 keep 67/blank 96、temple 60/56/4、popup 111/80/31；**1087.4→631.7KB（−455.7KB，−41.9%）**；blank 只落在 `DEAD_RULES`、与 keep 矩形不相交、活帧逐字节同、blank 全零、blank 外 0 差异；`--check` 三张逐字节 |
| r26 件2 | 四档 A/B/A（2 轮/臂）＋驻留 A/B | 快照 `load-r26-ab-*`、`resident-r26-a/b` | 房内窗 **3207→2752KB（−455KB／0 条）**、到落定 4934→4478KB，Menu 窗 1727KB/18 条 Δ0；`gameActivePerfMs` Δ＝4g **−884.0ms**（最差带 202 的 4.4×，面额 −933.3 兑现 94.7%）、fast3g **−2348.8ms**（带 215 的 10.9×，兑现 100.7%）、slow3g **−7515.0ms**（带 151 的 49.8×，兑现 100.7%）、off −194.8ms（①②过、③ n=2 不过 ⇒ 不主张）；`Menu active` 四档全带内；纹理 84/98.94/93.39MB、音频 6.82/21.81MB 两臂逐项相同 ⇒ 驻留 Δ0 |
| r26 件3 | 门禁、报告与文档收口 | docs | 全套 **FAIL=0**：typecheck 0 错、Slim/chars/prephase 三 `--check` 逐字节、build 4.42s、vitest **22 文件/241 例**、det **48/48**、canvas **5/5**、domskin **4/4**、audiofamily 22 项、charsplay 21 项、treebake 9/9、groundcache 6/6、journey 3/3·6/6·4/4·3/3、route 双关 won 39490／12978ms、regression won=true 零错零缺帧 |

**三条可复用结论**：
① **原地清零是唯一不碰采样相位的图集缩减手段**：活帧矩形与图集尺寸都不动，像素门禁就能保持逐字节；
任何重排/换尺寸都必须先过 `font-phase-probe`（r24 判负的根因）。
② **"画了空帧"对通用门禁不可见**：帧仍在 JSON 里、不报缺帧、不报错，只会透明。可靠性来自
"需求口径可执行化"（48 关 parseLevel＋同种子装饰移植＋行钉）与白名单闸，而不是靠冷启动/像素门禁。
③ **兑现结构**：r26 与 r25 同型（94–101%），因为省的是门内排队字节；r24 是"砍主体"型（100.6–103.0%）。
off 档无价签，永远只作回归对照。

## 二十四、r27 增补（2026-10-22，官方 font.png 未用字形原地清零）

> 报告 `2026-10-22-r27-font-blank-in-place.md`。r24 判负（26/36px 降采样相位）之后只剩两条路：
> 放弃房内字体，或不碰任何坐标。本轮走第二条：画布 2191×1024、`font.fnt`、258 条声明与全部保留字形坐标
> 逐字节不动，只把房内不画的像素清零；保留面＝字形帧 ∪ 4px（= fnt padding）环带。

| 件 | 内容 | commit | 关键数字 |
|---|---|---|---|
| r27 件1 | `build-font-blank.mjs` 生成器（keepMask＝帧∪环带、重解码自检、`--check`）＋ `font-roomblank.png` ＋ 换装载 URL＋9 例静态网；r24 的生成器/核验/产物移除 | `85253c2` | 官方 1,638,701B → **795,671B（777.0KB，−823.3KB／−48.6%）**；fnt 复用（Δ0）、画布/chunks/258 声明/保留 114 字形坐标全不动；保留 884,444 texel 逐字节、清零面 1,359,140 texel 全零（原有墨点 1,321,113）；sha256 `6434548a…` |
| r27 件2 | `roomtext --compare` 面级逐像素＋四档 A/B/A（2 轮/臂）＋驻留 A/B | 快照 `load-r27-ab-*`（12 份）、`resident-r27-a/b` | roomtext **6/6 面逐字节**（18/24/26/36px；r24 的 26/36px 差按构造消失）；房内窗 **2752→1928KB／39 条**、到落定 4478→3655KB；`gameActivePerfMs` Δ＝4g **−1783.0ms**（最差带 143 的 12.5×，面额 −1686.1 兑现 105.7%）、fast3g **−4242.3ms**（带 216 的 19.6×，兑现 100.6%）、slow3g **−13778.5ms**（带 263 的 52.4×，兑现 102.1%）、off −123.8ms（①②③不过 ⇒ 不主张）；`Menu active` 四档全带内（1727KB/18 条 Δ0，自带对照）；驻留纹理/音频两臂逐项相同（Δ0） |
| r27 件3 | 门禁、量具修正、报告与文档收口 | `docs` | 全套 **FAIL=0**：typecheck 0 错、四件 `--check` 逐字节、build `index-BHsTUBOe`、vitest **22 文件/240 例**、det **48/48**、canvas **5/5**、domskin **4/4**、audiofamily 22 项、charsplay 21 项、treebake 9/9、groundcache 6/6、journey 3/3·6/6·4/4·3/3、route 双关 won、regression won=true 零错零缺帧；roomtext 量具启动竞态修复后连续 **6 次** ALL PASS |

**三条可复用结论**：
① **采样等价的充分条件是"源矩形＋滤波邻域"逐字节不变**，画布尺寸、坐标、chunks、fnt 都可以不动。
r24 搬家失败与 r27 原地清零成功构成正反两面：只要邻域不变，26/36px 的降采样核相位就与官方逐字节相同。
这是现有结论里唯一能同时做到"字节缩减"与"构造等价"的图集缩减手段。
② **环带宽度取 fnt padding（本例 4px）而不是经验值**：它正是位图字采样会读到的邻域；环带里保留邻帧像素看似浪费，
却把"构造等价"变成生成器自检＋静态网可验证的不变量（保留面逐字节、清零面全零、幅面/块序不变）。
③ **量具也会制造缺陷**：合成步进必须在 Phaser 启动链（`isRunning && scene.isBooted`）之后才能驱动
`Game.step`，否则 `SceneManager.processQueue` 会把 `_pending` 里的场景整批清空。此类"量具自伤"要按
"现场 dump＋源码路径＋产品调用链是否存在"三件套与产品缺陷分开归因，不能计入产品回归。

## 二十五、r28 增补（2026-10-22，房内字体按关双变体）

> 报告 `2026-10-22-r28-font-variant-per-level.md`。r27 把 114 字全集压到 777.0KB 之后，剩下的浪费是"按关用不上"：
> 48 关里只有 `forest_01` 与 `forest_bonus_1` 的选中教学层带文本，其余 46 关只需 27 个字
> （暫停／再试一次／返回菜单／继续／游戏结束＋`0123456789:`）。本轮不碰任何像素口径，只按需求集再切一刀。

| 件 | 内容 | commit | 关键数字 |
|---|---|---|---|
| r28 件1 | 生成器从单产物扩成同口径双产物（`font-roomblank` 114 字／`font-roombase` 27 字，画布 2191×1024、chunks、官方 `font.fnt`、全部坐标不动）＋需求口径 `room.mjs` 单份＋12 例静态网＋`roomFontKey`/`loadRoomFont` 按关选键与跨变体卸键＋教学关 `warmRoomFontFor` 门内回补 | `b6d0446`＋`27e857e`＋`5a9e27b`＋`0d0289b` | 官方 1,638,701B；blank **795,671B（777.0KB）**、保留 114/258、sha256 `6434548a…`；base **214,876B（209.8KB，−86.9%）**、保留 27/258、sha256 `ebcb004d…`；两变体解码同为 8,974,336B |
| r28 件2 | roomtext 双变体面级对拍＋跨变体换关探针＋四档 A/B/A（2 轮/臂）＋教学关 4g 回归对照＋驻留 A/B | 快照 `load-r28-ab-*`（12 份）、`load-r28f01-ab-4g-*`（3 份）、`resident-r28-forest_12.json` | 非教学关字体 **777.3→210.1KB（−567.2KB）**；`gameActivePerfMs` Δ＝4g **−501.0ms**（最差带 315 的 1.6×，兑现 43.1%）、fast3g **−1725.3ms**（带 98 的 17.6×，兑现 59.4%）、slow3g **−5488.5ms**（带 100 的 54.9×，兑现 59.1%）、off +158.5ms（带内 n=2 不主张）；`Menu activeMs` 四档全带内（1727KB/18 条 Δ0 自带对照）；教学关 forest_01 4g **+63.3ms 带内**（最差带 80／臂B 散布 201）、字节 3655KB/57 三臂一致；房内窗 fast3g/slow3g **1927→1360KB／38→37 条** |
| r28 件3 | 像素门禁、驻留口径与文档收口 | `docs` | roomtext forest_01 **6/6**、forest_12 **5/5** 逐字节；跨变体探针 PASS（任一刻恰 1 把字体键、恒 8,974,336B）；驻留 game 93.43MB（Δ+0.04）、Menu **75.45 vs 84.00MB（−8.56MB）**、temple 98.94 不变；全套 **FAIL=0**：typecheck 0 错、四件 `--check` 逐字节、build `index-W3CG4guI`、vitest **22 文件/243 例**、det **48/48**、canvas **5/5**、domskin **4/4**、audiofamily 22 项、charsplay 21 项、treebake 9/9、groundcache 6/6、journey 3/3·6/6·4/4·3/3、route 双关 won、regression won=true 零错零缺帧 |

**三条可复用结论**：
① **同一像素口径能按需求集切任意多张变体，线上字节随实际用量走而解码驻留不变**：两张 PNG 都保留 2191×1024 画布与
官方绝对坐标，所以房内解码恒为 8.56MiB，省下的只是线上字节。驻留的唯一收益发生在 Menu 段（不再预装任何房内字体，−8.56MB）。
② **多变体的正确性条件是"键即变体、同一时刻只有一把"**：Phaser `TextureManager.checkKey` 拒绝同键重载，故两变体必须用
不同键，且装载新键前显式 `textures.remove(oldKey)`——否则跨变体换关会叠第二份 8.56MB 解码。
③ **面额兑现率不是常数**：r25–r27 的 94%～106% 源于省的是"门内排队字节"；r28 省的是"门内本来有并行覆盖的字节"，
实测只有面额的 43%～59%。价签只能当上界，产品收益必须以 A/B/A 实测为准；4g 的窗口总量还会被快照边界效应吃掉一部分
（臂 B 的 chars-play 提前到位），字节账要按稳定档逐请求差算。

**下一轮候选**：Popup 结算板拆张（249.3KB，r23/r25 同型、风险最低）、MechAssets 按关装载（152.9KB、24 种子集，
可复用 r28 的"关卡定出后补进暖装门"通道）、MenuAssets 同类清零（191.5KB）。
素材再编码（任务 #42）仍是用户保留项，未经裁决不动。
