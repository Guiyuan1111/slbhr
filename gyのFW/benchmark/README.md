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

**捕获口径（2026-10-20 修）**：我方侧截帧前以 `display:none!important` 隐藏
`#hud/#menu/#toast` DOM 覆盖层，双 rAF 后截 canvas，随即恢复——39 号档
（note/research/2026-10-fidelity/39-visual-diff-drift.md §3.2）定谳 Playwright
元素截图实为页面合成结果，0.3.33 HUD 木牌化起 `#hud` 子树入镜净扣 3.35–4.1 分，
此修恢复"canvas 截图比对"设计本义。**跨口径带不可直列**，演变链：
95.2–95.8（旧带，10-06–10-13；旧轻量 HUD 文本仍入镜）→ 88.5–93.0（漂移期过渡带，
方案二=不修量具口径）→ 新口径带见下节复定档记录。

- 实测（0.3.6，旧口径）：最优平移 (−1,−2)（镜头取景几乎一致）、全帧匹配率 86.63%、
  顶部 HUD 带 76.58%（原版画布内 HUD 为已知系统性差异）。
- 原版侧注意：/multiplayer.js 在 output/ 父目录（静态服需父目录回退）；须等 menu
  资产加载空闲（load.isLoading===false）再跳关，否则 menu 残留 loader 回调会在
  level 加载完成时引爆并中断派发链。
- 端口被占可换口：`VD_STATIC_PORT`/`VD_OURS_PORT` 环境变量（缺省 8787/2567 不变）。
- 截图证据：results/visual-original.png / visual-ours.png。

## 性能基准（0.3.21 起；r0 七件基线与 r1 第一轮优化见 note/report/perf/2026-10-18-r0-baseline.md / 2026-10-18-r1-optimization.md）

```bash
node --import tsx benchmark/perf-step.mjs --save <label>        # 服务端物理 step：48 关计时
node --import tsx benchmark/perf-determinism.mjs --compare <label>  # 位级一致门禁（引擎改动硬门）
node --import tsx benchmark/perf-load.mjs --save <label>        # 客户端加载（先构建再测）
node --import tsx benchmark/perf-sync.mjs --save <label>        # tick 链拆解：step/syncState/encode(20Hz)
node --import tsx benchmark/perf-serialize.mjs --save <label>   # 真实 RoomState 出站 20 vs 60Hz 价签
node --import tsx benchmark/perf-routeio.mjs --save <label>     # 路线回放/纯 step/世界构建吞吐
node --expose-gc --import tsx benchmark/perf-mem.mjs --save <label>  # World 常驻/创建销毁/并发峰值
node benchmark/perf-client.mjs --save <label>                   # 客户端帧预算（r3 起；双渲染器）
node benchmark/perf-client.mjs --cdp http://宿主IP:9222 --host 本机IP --save <label>  # 远程真机 GPU（裸机金标准）
node benchmark/perf-client.mjs --gpu --save <label>             # VM 内真 GPU（vmwgfx SVGA3D，需先起 xorg9 真显示）
node --import tsx benchmark/perf-scene.mjs [--runs 5] --save <label>   # 场景切换链（r8）
node --import tsx benchmark/perf-scene.mjs --cold --no-build --compare <label>
node --import tsx benchmark/perf-idle.mjs [--secs 8] [--modes ...] --save <label>  # 空闲 CPU（r9）
node benchmark/perf-toolchain.mjs --save <label>                                    # 工具链（r10）
node --expose-gc --import tsx benchmark/perf-gc.mjs --save <label>                  # GC 拆账（r11）
```

- `perf-step`：每关预热 90 步 + 600 步计时（`PERF_STEPS`/`PERF_LEVELS` 可覆盖），
  产出 avg/p95/p99、每仿真秒物理占用；快照 `results/perf-<label>.json`。
- `perf-determinism`：48 关 × idle/scripted 双输入 × 600 步（`DET_STEPS` 可覆盖），
  每步全部刚体 6×f64 **原始位**链式哈希。**任何触碰物理路径的优化必须过本门**
  （--compare 退出码即结果）；快照 `results/det-<label>.json`。
- `perf-load`：构建产物冷启动（新 context）DCL/Menu/Game 激活、传输字节、请求数、
  reload 缓存命中；页面错误非空即失败。快照 `results/load-<label>.json`。
- `perf-sync`：快照路径成本拆解，buildState/syncState 与 ForestRoom.syncState 逐字段同构
  （r1 起机关位姿走 mechanisms 直读，镜像同构）；20Hz 编码；快照 `results/sync-<label>.json`。
  **r4 起生产语义**：encode 后 discardChanges（applyPatches 同款），patch=本网格真增量；
  r0/r1/r2 快照的 347/2646B 为累积并集伪影，绝对值不可再比（r4 报告勘误节）。
- `perf-serialize`：真实 RoomState+Encoder+客户端 Reflection/Decoder 全管线（含等价校验
  exit 1 守门），20Hz vs 60Hz 出站对比（patch 尺寸与出站率无关，60Hz=3×包数）；快照
  `results/serialize-<label>.json`。r4 起同上生产语义修正（旧 370/450/2685B 档→50/58/91B 档）。
- `perf-routeio`：12 正式路线整关回放（runKernel 门禁路径）/纯 step 环/世界构建三口径
  （`PERF_ROUTES`/`PERF_RR_RUNS` 可覆盖）；快照 `results/routeio-<label>.json`。
  r2 起 makeWorld 内含逐关卡解析缓存（55d580b）：build 计量为**缓存命中态**（首个预热调用
  已填缓存）——对比 r1 及更早快照的 build 列时注意口径差（旧值含 0.3~0.5ms/次的 IO+解析）。
- `perf-mem`：World 常驻斜率、创建销毁吞吐、50 并发峰值差分（需 --expose-gc）；
  快照 `results/mem-<label>.json`。r2 起接触池懒填（c3661b0）后每 World 常驻含按需接触，
  与 r0 快照（预填 1792 接触对象口径）不可直列。
- `perf-scene`：场景切换链（r8 起）——点击「创建」→ GameScene 激活分段计时（页内
  performance.now 里程碑：click→matchmake→level 拉→menu 隐→Game 激活；2ms 轮询粒度）。
  缺省**驻留档**：等暖装落定（`textures.exists("ground")`+300ms 静默双条件——r8 勘误：
  仅"300ms 无新资源完成"会把暖装启动后首个资源完成前的静默窗误判为落定，暖装尾巴
  混进 create 段）后点击；`--cold` 冷路径档（Menu active 即点，深链/极速建房）。`--prof`
  末轮附 CDP CPU 剖析（TEMP/scene-prof.cpuprofile）。matchmake 段读数含 Playwright
  点击派发/输入管线成本且双峰波动大（±100ms），跨变体对比以 ws+state/level/menuHidden
  三段与总时长中位为准（r8 报告 §四.2）。快照 `results/scene-<label>.json`。
- `perf-idle`：空闲 CPU/功耗（r9 起）——六驻留态（menu/temple/game-idle/game-paused/
  bg-game/bg-menu）8s 窗 CDP Performance.getMetrics：taskPct（主线程任务占比）+scriptPct+heap。
  bg 态走默认旗标独立 context（headless 无遮挡不节流=环境伪影，快照行按 r9 报告 §四.1 判读）；
  `--noblur` 幕布归因、`--gpu` xorg9 真 GPU 口径（需 sudo，见 r9 §4.3）。**注意 stepLimitFPS
  模式下 loop.actualFps 计 tick 非渲染帧**（r9 §4.2），渲染帧率用 POST_RENDER 计数
  （tools/perfopt9/cap-verify.mjs）。快照 `results/idle-<label>.json`。
- `perf-toolchain`：开发工具链（r10 起）——npm test / sync-assets / build(全) / typecheck
  四命令 3 轮中位墙钟；build 拆 sync 与纯 vite 段（差值口径）。注意读数含 npm 包装层与
  并行在飞文件扰动（r10 报告 §勘误：sync-assets 432ms 中 ~330ms 是 npm 层非拷贝——
  裸 node 全量拷贝仅 0.10s）。快照 `results/toolchain-<label>.json`。
- `perf-gc`：GC 拆账（r11 起）——冷跑/持有 50 世界两场景的 GC 暂停按构建窗口归账
  （major/minor 分计、前后半程爬坡判定）。结论已收口：GC 份额 0-0.4%、无并发膨胀
  （r0 §八 166vs14 为跨关伪影）、bonus_2 158ms/建=新世界前 60 步固有收敛（vendor 面）。
  观察者投递需同步块后冲刷（量具哑火勘误见 r11 §一）。快照 `results/gc-<label>.json`。
- `perf-client`：客户端帧预算（r3 起）——headless chromium + 真服 + 双页入房，页内打点
  PRE_STEP→POST_STEP（update 段）/POST_RENDER（帧总）+ performance.memory 正增量累计（分配速率近似）
  + mechTarget/setDepth 计数；每轮双渲染器：WebGL（headless SwiftShader 的 present 阻塞为环境项，
  JS 面可比）与 Canvas（stub WebGL，软光栅全主线程，渲染段可比）。快照 `results/client-<label>.json`。
  同带复跑波动参考：canvas 分配 ±1%、帧总 p50 ±0.6ms；--gpu 口径 renderAvg 复跑带 ±15%、Canvas ±6%（r7r 实测）。
  r7r 起渲染段细分探针（缺省开，零分配定长包装）：gl.drawArrays 计数+顶点数、gl.bindTexture、
  gl.blendFunc(Separate)（=混合实切换）、WebGLPipeline.flush/bind、Canvas batchSprite；旧快照无对应字段
  （--compare 打 "-" 兼容）。`--dumpdl` 增打印一次性显示清单分解（depth/type/texture 聚合，剖析用）。

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
| perf-r4-final | 0.3.21 | 0.0656ms | 2.4577ms | 终版复核（含 R3 客户端改动后；另机，仅量级参照） |
| perf-r0-step | e477f9c | 0.0227ms | 0.3752ms | 本机 r0 基线（空载口径；scripted 档见 r0 报告 §二） |
| perf-r1-step | 8d2b6d5 | 0.0193ms | 0.3205ms | r1 四件后（b2Timer 桩+jumpSound；时点读数 0.0177，带内 -15%~-22%） |
| det-baseline-vm | 3a1cfdf | — | — | 位级哈希链基线（后续引擎改动的对照锚） |
| det-r0-baseline | e477f9c | — | — | 位级门禁现锚（r1 四件后 --compare 仍 48/48 全绿） |
| load-baseline / load-r3-load | 9f0155c | — | — | 客户端加载前/后（冷启动 6909→4858KB） |
| sync-r0-sync → sync-r1-sync | e477f9c→8d2b6d5 | — | — | sync 段 forest_01 0.0210→0.0096ms（patch 字节不变） |
| routeio-r0-routeio → routeio-r1-routeio | 269d83d→8d2b6d5 | — | — | 整关回放 10.34→12.14 关/s |
| routeio-r2-routeio | 55d580b | — | — | r2 六件后：整关回放 13.35 关/s、**世界构建 110→1166/s**（build 1.0~2.0ms，缓存命中口径） |
| perf-r2-step | 55d580b | 0.0188ms | 0.3405ms | r2 后空载综合（接触按需构造连带收益 -3~-6%） |
| sync-r2-sync | 55d580b | — | — | patch 347/2646B 逐字不变（锚仍可 --compare r1-sync） |
| mem-r2-mem | 55d580b | — | — | 每 World 常驻 01 0.69/bonus_2 2.88MB、创建销毁 251.6/s、50 并发 Δ35/151MB |
| load-r2-load | 55d580b | — | — | 冷启硬口径与 r0 逐字一致（4862KB/22req、reload 3KB） |
| client-r3-client-before / -before2 | bb3b4ab | — | — | r3 前基线×2（canvas 分配 1374/1372KB/s、setDepth 968/966/8s、updateAvg 0.199/0.176ms） |
| client-r3-client | be3d964 | — | — | r3 三件后：canvas 分配 **1114KB/s（-19%）**、setDepth **968→0**、updateAvg 0.146ms；WebGL 分配 776KB/s 带内 |
| serialize-r4-encode / sync-r4-encode | f0118d3 | — | — | r4 两件后（生产语义）：60Hz scripted patch 50/58/91B、encCPU 0.29/0.11/0.27ms/仿真秒、线路 2.93/3.39/5.36KB/s/客户端；idle 20Hz patch 4/12B；**旧 serialize/sync 快照为累积伪影口径不可比** |
| load-r5-before | a68c0bc | — | — | r5 冷启基线：Menu 769ms/4863KB·22req、reload 759ms/3KB |
| load-r5-coldstart | 458bff2 | — | — | r5 件1 装载序整形后：**Menu 523.5ms（-32%）/3674KB·14req**、reload 532ms、即点→Game 620~698ms（真人驻留路径不变，见 r5 报告 §三注） |

## 注意

- 输入对齐 INPUT_SHIFT 默认 +1（实测标定），可用 `DIFF_SHIFT` 环境变量覆盖。
- fidelity-score settle=5 帧（金轨迹 f0=起跑后第 5 帧，实证见报告 §四 R1）；bonus_2 类重箱关的 settle 敏感性见对比报告。
- 本基准只读（不改内核/金轨迹），稳定性红线无关项。

### audio-loudness.mjs — F4 响度保真对拍（2026-10-09）

```bash
node benchmark/audio-loudness.mjs --runtime --save f4
```

静态解析客户端逐键音量对表原版（master 0.1 + waterSteps 0.5 / wind 0.2，余 1.0），
--runtime 另起服读实机 `__fw.sound.volume`（WebAudio 挂起态需先派发手势解锁）。
结果存 benchmark/results/audio-<tag>.json；exit 0 = 全对齐。
