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
（note/research/2026-10-fidelity/39-visual-diff-drift.md §3.2/§7）定谳 Playwright
元素截图实为页面合成结果，0.3.33 HUD 木牌化起 `#hud` 子树入镜净扣 3.35–4.1 分，
此修恢复"canvas 截图比对"设计本义。**跨口径带不可直列**，演变链：
95.2–95.8（旧带，10-06–10-13；旧轻量 HUD 文本仍入镜）→ 88.5–93.0（漂移期过渡带，
方案二=不修量具口径）→ **现行带 90.55–92.86**（新口径，0.3.38 repeat5 静窗定带，
中位 91.44；F2 相机修复后最优平移=(0,0) 域；39 号档 §7.2）→ **0.3.42 复验带
91.11–92.45**（同口径 repeat5，中位 92.04，完全落入旧带内，中位位移 +0.60 判无显著
位移——M9 静止清零/M12 平滑重构/T10 平台声实证不动 forest_01 像素；
note/evidence/2026-10-23-recheck/02-visual-audit.md）。

- 实测（0.3.6，旧口径）：最优平移 (−1,−2)（镜头取景几乎一致）、全帧匹配率 86.63%、
  顶部 HUD 带 76.58%（原版画布内 HUD 为已知系统性差异）。
- 原版侧注意：/multiplayer.js 在 output/ 父目录（静态服需父目录回退）；须等 menu
  资产加载空闲（load.isLoading===false）再跳关，否则 menu 残留 loader 回调会在
  level 加载完成时引爆并中断派发链。
- 端口被占可换口：`VD_STATIC_PORT`/`VD_OURS_PORT` 环境变量（缺省 8787/2567 不变）。
- 快照 JSON 含 `diff.grid`（12×9 全网格 rate48 遥测，gx,gy 升序；区域带分析用，如底部
  水体带 gy≥6——forest_01 有 IceBox水面层×5，见 38 号档 §逐关表）。
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

### 六部全库基准（r44 起，覆盖全部 241 关）

```bash
node --expose-gc --import tsx benchmark/perf-r44.mjs                        # 跑分打印
node --expose-gc --import tsx benchmark/perf-r44.mjs --save r44-after       # 存档
node --expose-gc --import tsx benchmark/perf-r44.mjs --compare r44-before   # 与快照对比
PERF_R44_TEMPLE=crystal,fairies   只跑指定部
PERF_R44_STEPS=1200 PERF_R44_ALLOC_STEPS=3000

node --expose-gc --import tsx benchmark/perf-r44-alloc.mjs --compare r44-alloc-before  # 分配专项
bash benchmark/ab-r44.sh 6c65c8d 3        # 配对 A/B（<基线提交> [轮次] [--save 前缀]）
```

- `perf-r44`：**241 关**（forest 48 / light 40 / ice 51 / crystal 36 / elements 35 /
  fairytales 31）的 step（idle+scripted）、build（中位 3 次）、alloc（GC 堆差）三面，
  按「部」聚合避免轻关稀释；快照 `results/r44-<label>.json`。
  **为何需要它**：r0–r43 的全部基准与位级锚只覆盖前三部 139 关，第 4–6 部是 2026-10-30
  之后入库的代码，此前从未进入任何性能口径。
- `perf-r44-alloc`：9 个代表用例（forest 轻/重、light 光束、ice 定时闸、ice TOI 极端、
  crystal 传送门、elements、fairytales 仙女 ×2）的 GC 事件数与耗时；`results/r44alloc-*.json`。
- `ab-r44`：**内容回退法**换臂（`git show <rev>:./<file> > <file>`，不切工作树，避免
  `meta.git` 记成检出 HEAD 的旧坑），两臂在同会话内**交替**跑 A B A B…，取中位并打印
  臂内散布；**散布 ≥ 臂间差时脚本明确拒绝给结论**。参与换臂的文件登记在脚本 `FILES`
  数组——改动面变了要同步加。
- 分配指标的已知局限：`allocBPerStep` 用 GC 前后堆差法，同代码两跑在服务端全库口径下
  有 216/241 关给出不同数值，**不具 percent 级分辨力**；判定请以配对 A/B + 臂内散布为准。

### 换关链与纯构建口径（r45/r46 起）

```bash
PERF_SWITCH_ROUNDS=9 node --import tsx benchmark/perf-switch.mjs --save r45-final
node --expose-gc --import tsx benchmark/perf-build.mjs --mem --save build-r45
node --expose-gc --import tsx benchmark/perf-build.mjs --compare build-r44-baseline
```

- `perf-switch`：241 关 × ROUNDS 轮（`PERF_SWITCH_ROUNDS`，默认 15）量「换关链总成本」。
  每轮对同一关交替跑两臂：`legacy`（`new World(next)` + `reset()`，复刻修复前双建语义）与
  `current`（`reset(next)` 单建）——**同进程相邻执行**消时段漂移。内置 **startFrozen 一致性
  断言**：10 个含 55 型冰面砖的关，构造路径与 reset 路径的冻结位串必须相同，不符即退出码 1。
  快照 `results/switch-<label>.json`。
- `perf-build`：**纯构建口径**，241 关按 id 序整轮 `new World`，预热 30 关后跑
  `BUILD_ROUNDS`（默认 7）轮取中位；`--mem` 报 GC 后单 world 常驻堆（需 `--expose-gc`）。
  快照 `results/build-<label>.json`。
  **口径纪律**：只作用于构建期的改动（fixture 构造、island 预分配、shape 模板）必须用本件
  判定，不能用换关链口径——每轮 60 步物理会把构建占比稀释近 5 倍（同一优化实测
  switch 口径 −3.4% 带内 / build 口径 −15.4% 两臂不重叠）。
- `perf-determinism` 的第三条哈希 `switched`：`reset(本关)` 后跑同一 scripted 脚本，
  须与新建路径**逐位相同**（自洽断言，不依赖历史快照）。reset 路径此前零覆盖，
  正是 `startFrozen` 缺陷能长期存活的原因；现 241/241 逐位等价。

### 每步分配归因（r47 起）

```bash
LEVELS=crystal_20,light_23 STEPS=1500 WARM=600 PROF_MODE=1 \
  node --expose-gc --import tsx benchmark/perf-server-alloc.mjs
node --expose-gc --max-semi-space-size=1 --import tsx benchmark/perf-server-alloc.mjs   # 净堆量级（噪声大）
```

- `perf-server-alloc`：两种口径——**净堆增量**（GC×2 前后差，噪声大、同代码两跑可差 2 倍，
  只作量级参考）与**采样归因**（`PROF_MODE=1`，`node:inspector` HeapProfiler，**只覆盖步进
  窗口**，按函数聚合 selfSize）。
- **关键坑**：整进程 `--heap-prof` 会被启动期 module loader/tsx 转译淹没（首版 top1 是
  `compileForInternalLoader` 20.9%，与步进无关）。必须手动 start/stopSampling 圈窗口。
- 首次归因结论（2026-11-05，`crystal_20`）：vendor 的 prismatic joint（13.6%）+ island solve
  （13.0%）为禁区；**自有代码里 `character.update` 9.8% 是最大一块**，零分配化后降至 5.4%，
  每步分配 11758→10594 B/step（−9.9%，两臂不重叠），但单步 CPU 带内——**分配与耗时分开主张**。

### 换关链客户端半边（r46 起）

```bash
node --import tsx benchmark/perf-advance.mjs --runs 5 --save adv-r46   # 双页真房，FORCE_DOORS 真通关
node --import tsx benchmark/perf-advance.mjs --no-build --compare adv-baseline
```

- `perf-advance`：量「won 点继续 → 下一关可玩」的**客户端半边**。双页入房（`enterAs` 走
  DOM 表单，生产同构），通关走 `FW_DEBUG_FORCE_DOORS=1`（真实 25fps 扫帧，不注入假事件）。
  六段里程碑：`clickToAdvanceSent` / `advanceSentToFadeIn` / `fadeInToOp` /
  `opToGameCreate` / `createToFirstPlayable` / `clickToFirstPlayable`。
  快照 `results/advance-<label>.json`。
  **量具陷阱**（已写进脚本注释）：Phaser 把 `scene.stop+start` 排到下一帧批处理，2ms 轮询
  永远看不到 inactive；`sys.events` 监听器在 shutdown 时被清空，需每 20ms 重挂；
  入关时也会记 `firstPlayable`，须在点击时清空窗口。
- 首次测量结论（2026-11-05）：换关 1.1s 中黑幕淡入占 **65%**（oracle 固定动画，不可动）、
  拉关+回声 **29%**、客户端场景重建仅 **5.6%**。因此优化面只有网络往返——
  黑幕与 fetch 并行后拉关等待 312→102ms（−67.4%，两臂不重叠）。

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
| det-r0-baseline | 865a0fb | — | — | 位级门禁现锚（P-03 S 档 forest_14/14_1 分叉后重锚两行，余 46 行哈希不变，--compare 48/48 全绿） |
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

### perf-progress.mjs — 选关菜单进度读取成本（r48 起）

```bash
node --import tsx benchmark/perf-progress.mjs
N=332 ENTRIES=252 ROUNDS=9 node --import tsx benchmark/perf-progress.mjs
```

量 `progress.ts` 的 `starsOf` —— 原实现每次调用都 `getItem` + **全量 `JSON.parse`**，而
选关菜单入场时它的调用次数是 O(关卡数)（同一批文件被反复问）。两臂在同一进程内**交替**
测量（A=每次 parse，B=按原文串记忆），消除进程间 JIT/频率差异。

**关键坑**：这是微基准，只代表 `starsOf` 这一段本身。页面端的整体入场耗时
（`perf-temple.mjs`）噪声大得多，22ms 的省时在 1000ms 路径里只占 2%——**不要把微基准的
−99.8% 说成"菜单快了 15%"**。

### perf-temple.mjs — 选关菜单入场延迟（r48 起）

```bash
npm run build
ROUNDS=15 node --import tsx benchmark/perf-temple.mjs --save r48-opt
```

真实浏览器测「点开始 → TempleScene 烘焙完成可交互」。里程碑：`click` / `templeActive` /
`interactive`（节点数稳定 120ms 判定）。

**口径要点**：每轮开新 browser context（冷缓存 + 干净 localStorage），否则
`templeTreeBake` 的进程内 LRU 会让复访显著偏快。预置 252 条存档使 `starsOf` 成本落在
真实上限。页内打点，不经 CDP。

### perf-step-cpu.mjs — 单步 CPU 自时间归因（r48 起）

```bash
LEVELS=crystal_20,light_23,fairies-30 node --import tsx benchmark/perf-step-cpu.mjs
STEPS=2500 WARM=600 INTERVAL=50 node --import tsx benchmark/perf-step-cpu.mjs
```

`Profiler`（samples + timeDeltas）按 self time 聚合，只覆盖步进窗口。与
`perf-server-alloc.mjs` 分工：**那个量分配，这个量耗时**。

**两个必须知道的口径坑**：

1. **vendor 不能按 url 分类**——`box2d.js` 是 `new Function` 装载的，栈帧 url 恒空。
   首版按 url 分桶，全部物理帧掉进 `native/other`，得出「vendor 不耗时」的荒谬结论。
   现以函数名前缀 `box2d.` 为主判据。
2. **剖析器自开销必须剔出分母**——实测 profile 总时长可超过墙钟（134ms 墙 vs 174ms 采样），
   混进去会把 vendor 从 93% 稀释到 71%。

**可复用结论**：vendor 占 **83–97%**，自有内核合计仅 **2–16%**。内核代码的 percent 级
微优化收益上限被 vendor 压死——这是 r44/r47 CPU 收益全部落在噪声带内的根本原因。

### perf-sleep.mjs — 「关节卡限位 → 整岛永不入睡」扫描（r48 起）

```bash
node --import tsx benchmark/perf-sleep.mjs --save r48-baseline
LEVELS=ice_03,forest_bonus_2 ROUNDS=7 node --import tsx benchmark/perf-sleep.mjs
```

扫描全库：静止 900 步后统计「`m_sleepTime` 已越过 `b2_timeToSleep` 却仍醒着」的体，
并用配对 A/B（B 臂=每步强制让静止体入睡）给出**上界**收益。

**为什么单独建**：box2d 的岛入睡要求「低速够 0.5s」**且**「位置约束收敛」；被电机压在
行程限位上的平台、以及互相挤压的紧贴平台让后者恒假 → 整岛永不入睡，哪怕位形几千步逐位
不变。全库 241 关有 **15 关**中招，典型 `forest_bonus_2` 5 个紧贴平台
（|v| ≤ 4.4e−16、sleepTime 14s、**3000 步位移精确为 0**）。

**⚠ 这个量具的噪声底约 ±10%**：对照组（226 个无卡睡体的关）平均 Δ 也是 10.6%，
其中 81 关假阳性"区间分离"。只有远超该量级（如 `ice_03` 的 −79%）才可信。

**结论（r48）**：现象真实但**不可修**。平台经 prismatic/distance 关节直连 ground，
box2d 的岛构建必然并入同一岛（实测 `ice_03` 孤岛 = `[dynamic, static(ground), dynamic]`），
"排除静态体的岛"判据放行次数归零；"位形逐位不变即睡"则 det 门 13 关漂移。详见报告 §四。

### perf-bake-cpu.mjs — 选关树烘焙 CPU 分阶段（r49 起）

```bash
node --import tsx benchmark/dump-tree-alpha.mjs           # 先导出真实 alpha（一次性）
node --import tsx benchmark/perf-bake-cpu.mjs
ROUNDS=7 node --import tsx benchmark/perf-bake-cpu.mjs --save r49-bake-cpu
node --import tsx benchmark/perf-bake-cpu.mjs --compare r49-bake-cpu
```

把 `stepTreeBake` 的**纯 CPU 部分**拆到 stage 级（`alphaSat` / `bevel` / `satOut` /
`outline` / `premult`），用**真实 alpha** 重放，Node 口径无 DOM。

**为什么要它**：浏览器里 `toBaked` 的 1.5–2.0s 中有 **70.3% 是 `(program)`**
（headless SwiftShader 合成等待），JS 只有约 350ms。要判断内核改动值多少，必须把 CPU
单独拿出来量。r49 实测：`outlinePass` **48.7%** + `bevelColorMatrix` **40.4%** = 89.1%。

**⚠ 数据来源是硬依赖**：缺 `benchmark/results/alpha-<temple>.json` 与对应 `.bin` 时报错
退出，**不退回合成输入**——见下条。

### perf-bevel.mjs — 烘焙内核配对 A/B（r49 起）

```bash
node --import tsx benchmark/perf-bevel.mjs
ROUNDS=9 node --import tsx benchmark/perf-bevel.mjs --save r49-final
```

同进程**交替**跑参照臂（改造前实现）与当前臂，用区间是否分离判定，并把
**位级一致作为每轮硬门禁**（不一致立即 exit 1）。覆盖 `bevelColorMatrix`（三层）与
`outlinePass`。

**为什么必须用真实数据（r49 最痛的教训）**：把 `sampleA2` 坐标分解改表驱动时漏了一个
`fr()`，**33 条合成单测全绿，真实数据一跑就红**（偏移 613864）。事后量化盲区：

| 探测 | 漏 `fr` 显形次数 |
|---|---|
| 24×20 随机噪声，144000 像素 | **0** |
| 均匀块，255 种 alpha 全试 | **0** |
| 真实全画布 1036×864 | **必红** |

原因：`fr()` 直接作用于 alpha 通道时 0/256 值受影响（`round(a*255)` 吸收舍入），差异只在
`gray*a` 的 double 乘法跨过 Uint8 台阶时显形。

> **合成输入不能替代真实数据做等价性判定。** 单测保证"常规路径等价"，真实数据等价性
> 必须靠本量具。

**另两个位级必要条件**（写进实现注释）：
- 坐标分解须逐字同序：`t0x=(x+0.5)*FX → tx=t0x+ox → px=tx−0.5`。合并成
  `(x+0.5)*FX+ox−0.5` 会在边缘像素产生 1 ULP 偏差。
- `FX = canvasW/Cf = 1036/1036.8 = 0.99923`（**不是 1**），`FY = 1`。

### perf-bake.mjs — 选关树烘焙分帧预算（r49 起）

```bash
BUDGET=8 ROUNDS=7 node --import tsx benchmark/perf-bake.mjs --save r49-b8
BUDGET=48 node --import tsx benchmark/perf-bake.mjs --compare r49-b8
```

浏览器口径：点 Play → 烘焙纹理上屏（`flatFallbacks` 清空）。量 `toActive` /
`bakeSegment` / `toBaked`。两臂靠改 `TempleScene.mountBaked` 的预算常量区分，需重新 build。

**⚠ 这个口径不可跨会话比较。** budget=8ms 时 headless 帧率本身只有 ~13fps，
`bakeSegment` 由**帧数**而非 CPU 主导（实测 8→48ms 时 −53.3%、8→200ms −81.0%，
但单帧 p95 飙到 240–280ms，玩家可感知卡顿）。r49 同会话交替 A/B 显示内核 −27.8%
在这里只兑现 **−0.1%（带内）**——因为内核只占总时长 12.5%，其余 87.5% 是合成等待。

### perf-create.mjs — GameScene.create 分段（r49 起）

```bash
node --import tsx benchmark/perf-create.mjs
LEVEL=forest_bonus_2 ROUNDS=7 node --import tsx benchmark/perf-create.mjs --save r49-base
```

钩 `GameScene.create` 与 12 个 `build*` 方法，报每个的 self 时间 + `__buildSum` +
`__unaccounted`。r49 实测总计仅 **9.5–14.4ms**（`buildMechs` 3.5ms 最大），
相对换关链 1.1s 太小，**未立项优化**。

### perf-update.mjs — GameScene.update 逐帧分段（r50 起）

```bash
FRAMES=200 ROUNDS=3 node --import tsx benchmark/perf-update.mjs --save r50-update
node --import tsx benchmark/perf-update.mjs --compare r50-update
```

把 `GameScene.update` 拆到 13 个子步骤（角色/钻石/机关/仙女/传送门/浮尘/黑幕/教学…），
页内 `performance.now()` 逐段累计，仅 `started` 相位。r50 实测 `forest_bonus_2`：
`updateMechs` **57.7%** + `updatePlatformSound` **18.9%** = 76.6%，全程 214.0 µs/帧。

**⚠ r51 勘误：本环境的 `performance.now()` 量化到 100µs**（headless 非隔离上下文的
Chrome 计时器粗化）——**信号 < 100µs 的段读数是「撞 tick 帧数占比」的换算值，不是耗时**。
`updatePlatformSound` 真值 ~1.3–12.5µs（约 7%，非 18.9%）；其余小段同理作废。
亚百微秒段请改用下面的 `perf-update-ablate`（消融法）或确定性计数。
r51 版还曾把 16 个机关回调也逐个包计时——钩子自身让整帧 214→270.5µs（+26.5%），
测的是钩子不是代码，已保留但仅作反例快照（`results/update-r51-mech.json`）。

**⚠ 两个坑（都踩过）**：
1. **包装原型上的 `update` 完全无效。** Phaser 在 `SceneManager.bootScene` 里
   `sys.sceneUpdate = scene.update`（`phaser/src/scene/SceneManager.js:636-638`）——
   `create()` 结束后的**一次性快照**，之后不走原型链。只包原型会得到 `calls: 0`。
   必须包**实例**的 `update` 并重指 `sys.sceneUpdate`。12 个分段方法走 `this.xxx()`
   原型链，包原型有效——两类分开处理。
2. **单页进不了 `started`。** 服务端权威双人房要求双人到齐 → ready 2s → started。
   本件沿用 `scripts/e2e/lib.mjs` 的 `enterAs` / `waitForStarted` 双页流程。

### perf-update-alloc.mjs — 逐帧分配消除的 A/B（r50 起）

```bash
ROUNDS=9 PLATFORMS=47 node --import tsx benchmark/perf-update-alloc.mjs --save r50-alloc
```

**主指标：对象实例身份计数**（把 `update` 桩收到的每个 `pose` 塞进 `Set`，
`Set.size` = 不同实例数）——确定性，不依赖统计判据。r50 实测 28200 次 update：
A 臂 28200 个实例 → B 臂 1 个（−100%）。耗时口径为次要指标。

**⚠ 口径坑：堆差对短命对象失明。** 首版用 `--expose-gc` + `heapUsed` 前后差，
两臂几乎相同（**2,034,416 vs 2,034,560 字节**）——V8 把短命对象分配在 new space，
回收后堆差归零。与 r47「typed array 大块对采样器失明」同类。
`perf-client` 的总量分配速率也不适用（r47 已量到 86.8% 在 Phaser 内部）。

### perf-static.mjs — 静态资源服务（r50 起）

```bash
ROUNDS=7 node --import tsx benchmark/perf-static.mjs --save r50-static
```

真 HTTP 口径（**不用 mock req/res**：`compCache` 是模块级私有清不掉，冷测从第二轮起
就是热缓存；mock res 缺 `getHeader` 时 express.static 异步回调会崩）。冷/热靠
**重启服务进程**区分。

r50 基线：首屏 3 chunk burst(cold) **88.96ms** / warm 12.21ms / 304 0.46ms；
`brotliCompressSync` q5 单 1.4MB chunk **23.91ms**、`gzipSync` 6 27.01ms、
`readFileSync` 0.87ms。

**结论：不立项。** 一次性成本（systemd 长期运行，每文件只在 cache 冷时压一次；
全量 280 文件 77ms、首屏 67ms），预压缩只影响「重启后第一个玩家」且启动反慢 67ms。
另 `statSync` 每请求仅 0.95µs（1000 req/s 占 0.10% CPU），`compCache` 全量
br+gz 常驻仅 1.3MB。

### perf-update-ablate.mjs — GameScene.update 消融归因（r51 起，现役口径）

```bash
LEVEL=forest_bonus_2 ROUNDS=4 TOTAL_FRAMES=200 node --import tsx benchmark/perf-update-ablate.mjs --save r51-ablate
MECH_MODE=1 ROUNDS=4 TOTAL_FRAMES=200 node --import tsx benchmark/perf-update-ablate.mjs --save r51-ablate-mech   # 逐机关类
ABLATE_TARGETS=__smoother ROUNDS=8 TOTAL_FRAMES=150 node --import tsx benchmark/perf-update-ablate.mjs --save x   # 只跑指定臂
```

**口径：消融（ablation）**——不测「段内耗时」，测「把段拿掉后整帧少多少」。
A 臂=真实 `update`，B 臂=目标方法换空桩，交替多轮取中位差。整帧 ~160–270µs
是**信号 > 100µs 量子**的量，逐帧相对误差 ~2%，配对后更小。

r51 实测 `forest_bonus_2`：`__views`（15 回调全空桩）**104.5µs（67.0%）**、
`__smoother`（平滑管线归零）**34.5µs（22.1%）**、噪声底 ±5.5µs。

**⚠ 固有局限**：①消融会改变下游工作量（视图停摆 → 脏守卫整链变便宜），
是**上界估计**；②有跨段副作用的段（`updatePlayers` 提供 `pFb/pWg`）只能作参考值。
**⚠ 坑**：`cbXxx` 是 create 期 `bind` 出的**实例属性**（`GameScene.ts:530-539`），
不在原型上——钩 `proto[name]` 无效，会得到随机符号的无效臂（r50 `sys.sceneUpdate`
快照坑同类）。结构性臂 `__smoother`/`__views` 走实例级钩子，始终有效。

### perf-mech-class.mjs — `updateMechs` 批量按类分解 + 脏守卫对照（r51）

```bash
LEVEL=forest_bonus_2 ROUNDS=7 node --import tsx benchmark/perf-mech-class.mjs --save r51-mechclass
```

批量法（一趟只取 1 对时钟，趟数自适应到 ≥20ms）拆三类口径：稳态同值
（8.02µs/趟）、脏守卫打开（+5.78µs）、真实 Colyseus 访问器 + 推进时间（8.38µs）。
**与消融口径 104.5µs 差 13 倍 = 热循环 ≠ 真实帧**（页内工作集被渲染栈挤出缓存）。
批量口径只能用于 A/B 相对比较与确定性计数，不能当量级看。

### perf-plat-pass.mjs / perf-plat-merge.mjs — `st.platforms` 双趟遍历（r51）

```bash
node --import tsx benchmark/perf-plat-pass.mjs --save r51-platpass
node --import tsx benchmark/perf-plat-merge.mjs --save r51-platmerge
```

`plat-pass` 拆双趟遍历的可回收量：纯遍历 0.23µs + 三属性读 0.48µs +
tracker 0.44µs ≈ **0.90µs/帧**。`plat-merge` 直接 A/B「双趟 vs 合并单趟」：
**Δ 0.0% 区间重叠 → 合并候选判负**（r50 的定性判断获得定量支撑）。

### perf-smoother-ab.mjs / perf-smoother-micro.mjs — 平滑器 A/B（r51）

```bash
FRAMES=400 node --import tsx benchmark/perf-smoother-ab.mjs --save r51-smoother   # 页内配对 + 块计时
FRAMES=400 node --import tsx benchmark/perf-smoother-ab.mjs --capture             # 导出真实调用序列
node benchmark/perf-smoother-micro.mjs --trace benchmark/results/trace-r51-smoother.json --rounds 12 --repeat 20 --save r51-smoother
```

页内件把真实 `mechSmoother` 的调用参数逐帧抓下来，同页并联新/参考两实现交替计时
（块计时：20 帧/块只取 1 对时钟）。微基准件回放**真实序列**（非合成数据），
内置逐位一致性断言 + **确定性计数器**（exp 调用数、快路命中数）。
r51 结果：热循环 −32.4%～−44.5%（区间分离），**页面口径不主张**（热循环不迁移）。

### perf-exp-count.mjs — 页内确定性计数（r51）

```bash
LEVEL=forest_bonus_2 FRAMES=300 node --import tsx benchmark/perf-exp-count.mjs --save r51-expcount
```

在真实开局页面统计 smoother 的 `Math.exp` 调用与静止快路命中。**exp 桩只装在
smoother 调用窗口内**——窗口外 `GameScene.ts:1967` 的相机收敛每帧还有 2 次 exp，
首版全局计数实测 102 次/帧即此因。内置断言「每帧 exp ≤1.02」，不满足 exit 1。

r51 实测（`forest_bonus_2`，300 帧）：exp **100/帧 → 1/帧（−99.0%）**、
快路命中 **60.2%**——确定性事实，本轮主张的主指标。

**⚠ r51 最大教训：页内量具必须先验证被测代码真的在跑。**
`dist` 是改动前构建的，`perf-smoother-ab` 两臂因此测出「新=旧」；
靠确定性断言当场抓住，而不是靠时间数字的异常反推。改源码后先 `npm run build`。

### perf-sound-churn.mjs — 平台电机声实例生命周期计数（r52）

```bash
LEVEL=forest_bonus_2 FRAMES=300 node --import tsx benchmark/perf-sound-churn.mjs --save r52-churn
```

包 `scene.sound.add` 与 `BaseSound.destroy/play/stop`（按 key `sfx_platform` 过滤），
统计 N 个真实 started 帧内的实例生命周期事件：`sound.add` 新建数、destroy 数、
play/stop 事件数（运动模式随会话浮动，仅作分母参照）、同时存活峰值。

**确定性口径**（r50 实例计数、r51 exp 计数同一纪律）：池化前后新建/销毁数
是结构性事实，不依赖统计判据。

r52 实测（`forest_bonus_2`，300 帧）：基线 **17 新建 + 19 销毁**（destroy > add
的差值来自探针挂上之前已建的 2 个实例在窗口内被销毁，账目自洽），峰值并发 2；
`platSndPool` 池化后 **双归零（−100%）**。首版报告口径（`forest_bonus_2` 128 帧
18 play + 18 stop、峰值 4）与终版（300 帧 17/19、峰值 2）的差异说明事件密度
随会话浮动——**新建/销毁的归零才是指标，play/stop 计数不是**。

### perf-timer-res.mjs — 页内时钟分辨率测定（r53）

```bash
node --import tsx benchmark/perf-timer-res.mjs --save r53-coop
```

连采 N 个 `performance.now()` 差值：隔离标志、非零差值集合、最小正差值、
零差占比、`Date.now` 对照。r53 加 COOP/COEP 双头后 `crossOriginIsolated=true`，
量化 **100µs→5µs**——r51 发现的「亚百微秒段不可测」自本轮解除，
块计时类量具（perf-plat-merge / perf-smoother-ab）单趟/单帧信号直接可测。

**⚠ 噪声底真相（r53）**：量化解除后，整帧消融（perf-update-ablate）的噪声底
仍 ±5–7µs——主要来自 headless **帧调度抖动**，不是时钟。<10µs 的段改动在
整帧口径依旧不可判，别指望精细时钟救消融。

**换臂重建法（r53 立例）**：整帧 A/B 需要旧实现时——旧码入源 → 重建 →
**用确定性断言（如 exp 计数）故意验证它失败，确认旧码真的在跑** → 测 →
恢复 → 重建 → 断言 ✓ 确认还原。r51 教训（页内量具必须验证被测代码在跑）
的跨构建版。

### perf-smoother-layout.mjs — 数据布局重写信号预估（r54）

```bash
node benchmark/perf-smoother-layout.mjs --trace benchmark/results/trace-r51-smoother.json --save r54-layout
# trace 用 perf-smoother-ab.mjs --capture 抓取（2.8MB，用后即删，可再生）
```

四臂括弧回放真实调用序列：**Old**（r51 前锚点）/ **New**（现行，位级基准）/
**Arr**（槽位布局原型：位置命中 + key 校验 + Map 兜底 + `beginFrame()` 游标）/
**NoMap**（零 Map 零校验**天花板**）。天花板臂的存在理由：连它都够不到裁决线，
则任何合法布局变体都够不到——一次测量封死整个方向。

r54 实测：Arr 直中率 99.8%、位级 0 不一致（布局机械成立），但进程内信号
−0.14µs（重叠）；**天花板 −0.47µs/帧 → ×10 整帧 ≈ −4.7µs ≪ 15µs 裁决线 →
判负**。教训：**先量「方向的天花板」再动产线代码**——布局重写这类结构级
改动的可行性，用一个不合法但上界最大的假想臂就能裁决。

### perf-net-payload.mjs — 网络载荷字节计数（r55）

```bash
LEVEL=forest_bonus_2 FRAMES=150 node --import tsx benchmark/perf-net-payload.mjs --save r55-net
```

双页真实会话，对**底层 WebSocket**（`room.connection.transport.ws`——Colyseus
0.16 的 `connection` 是 events/transport 包装，不是 ws 本体）挂字节计数：
入站 `message` 事件按 `byteLength/size/length` 计，出站包同实例 `send`。
怠速/运动双窗各 N 个 started 帧。

r55 实测：下行怠速 ~5.9 KB/s → 运动 ~8.7 KB/s（均长 17.2 B/msg，载荷由真实
状态变化驱动）；上行 ~2 KB/s 恒定（客户端每帧上报输入）。**量级即否决，
判不立项**。候选（恒脏字段 f+timerMs、出站改变化触发）分别栽在：帧锚/HUD
红线、服务端「按住恢复」排水语义——**网络口径的复刻语义是承重墙，别碰**。

**⚠ 双窗探针坑**：前一窗完成时若只还原 `sys.sceneUpdate` 不还原
`scene.update`，下一窗把残留闭包当原件再包，首帧即被旧闭包踩死（第二窗永挂）。
修法：以 `sys.sceneUpdate` 为活原件，完成时**两处都还原**。

### perf-mem-residency.mjs — 内存常驻画像（r56）

```bash
LEVEL=forest_bonus_2 SECS=150 node --import tsx benchmark/perf-mem-residency.mjs --save r56-mem
```

双页真实会话长浸泡：`--enable-precise-memory-info` 逐秒采样 `usedJSHeapSize`，
同场确定性计数纹理（键数 + 源像素和）、音频（**`BaseCache.getKeys()`**——
`cache.audio.keys` 不是可靠公开面）、房间实体。每 10s 注入 1s 移动输入，
防「全静死房」假设失真。

**⚠ 泄漏判据：用 GC 地板线，不用原始斜率。** JS 堆是锯齿，斜率符号由
加载期垃圾排空节奏决定——r56 两场会话都测出 −750 KB/分钟「负斜率」（堆在
缩小），拿它当趋势就是误读。正确做法：按 30s 桶取堆最低点（地板），
**地板上升才叫泄漏**（r56 实测 +0.1 MB/分钟 = 平坦）。

另一个坑：`window.__fw` **就是** Phaser.Game 实例（`main.ts:726`），没有
`.game` 子柄；房间在 `scene.d.net.room`。

r56 结论：堆常驻 ~27 MB、地板平坦、四缓存恒定 → **判不立项**（会话内存
无可优化项）。
