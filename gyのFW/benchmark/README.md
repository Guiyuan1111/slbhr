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
中位 91.44；F2 相机修复后最优平移=(0,0) 域；39 号档 §7.2）。带顶不是硬上限：r17 件A（只动
DOM 皮肤）同码三次得 92.79 / 92.96 / 93.10，极差 0.31pt——单跑越顶 0.10pt 属带内抖动，
处置是按 README 的 ±2pt 抖动条款补跑取分布，而不是放宽容差或改代码。

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

- **`--compare` 参数写的是 label 本体，不含文件名前缀**：`perf-client` 存 `client-<label>.json`、
  `perf-advance` 存 `advance-<label>.json`，故对拍写 `--compare r16-f01` / `--compare r14`；
  写成 `--compare client-r16-f01` 会去找 `client-client-r16-f01.json` 而报缺快照（r17 门禁实跑踩到）。

- `perf-step`：每关预热 90 步 + 600 步计时（`PERF_STEPS`/`PERF_LEVELS` 可覆盖），
  产出 avg/p95/p99、每仿真秒物理占用；快照 `results/perf-<label>.json`。
- `perf-determinism`：48 关 × idle/scripted 双输入 × 600 步（`DET_STEPS` 可覆盖），
  每步全部刚体 6×f64 **原始位**链式哈希。**任何触碰物理路径的优化必须过本门**
  （--compare 退出码即结果）；快照 `results/det-<label>.json`。
- `perf-load`：构建产物冷启动（新 context）DCL/Menu/Game 激活、传输字节、请求数、
  reload 缓存命中；页面错误非空即失败。快照 `results/load-<label>.json`。
  **r15 拆账口径**：逐 URL `transferKB/decodedKB/startMs/endMs` + 逐 URL 真实响应头
  （`status/cache-control/content-encoding/etag`）；Menu/进房段按 **URL 集合差**归段
  （页面 `performance.now` 与 Node 墙钟不可跨基减法）；`revalidate` 用 **Node `http`+keepAlive**
  对幂等 URL 探测"整份重下 → 带 `If-None-Match` 复验"，避让 `/matchmake/*`（会真建房）、`blob:`、文档 URL。
  页内 `fetch(cache:"no-store")` **不可**用于该探测——Blink 会剥离条件请求头，测得的"仍 200 全量"是仪器伪差。
  **r16 档位/三段口径**：`--level forest_12` 可选档位（缺省 forest_01，`meta.level` 入快照，`--compare` 遇
  档位不同会告警——字节类指标跨档位不可直接比）；点击建房时刻取一次**页内时钟**样本 `cold.clickPerfMs`，
  据此把进房段再切成 `warmPhaseKB`（暖装，`endMs<=clickPerfMs`）与 `postClickKB`（点击→Game），
  音轨逐条按段归账 `audio.{menuKB,warmKB,postKB,tracks}`。**自动化 harness 里 `warmPhaseKB` 恒 0 是口径特性
  不是回归**：机器人点击早于暖装启动（页钟 ≈1011ms vs 暖装 +120ms），暖装字节全落进 `postClickKB`。
  配套门禁 `scripts/e2e/audiofamily.mjs`：本族两支入缓存且在播 / 另一族两支零缓存**零请求** / 类型无关件恒在 /
  页面零错误——缓存面与请求面双向对账（阳性对照不能靠 `cache.audio.set()`，Phaser 3.90 SoundCache 无此方法）。
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
  r12 起帧内写入计数器（同为零分配包装，只自增）：`camZoom`/`camCenter`=主相机 setZoom/centerOn
  实调用数，`setPos`/`setAngleW`/`setScaleW`/`setTex`=Image/Sprite/Container/BitmapText 四类对象的
  setPosition/setAngle/setScale/setTexture 实调用数；用于把"脏守卫是否真的生效"从推断变成直读
  （稳定态 setScaleW 应≈0 而非 3×帧数）。**勘误**：Phaser 3.90 的 setZoom/centerOn 不在
  `cameras.Base.prototype` 自有属性上，直接 `prototype.hasOwnProperty` 取原型的写法会静默计 0——
  必须沿活相机实例的原型链上溯到属主原型再包装（本轮首个量具 bug，基线已修后重跑）。
- `perf-alloc`：帧内分配函数级归因（r13 起）——CDP `HeapProfiler.startSampling/stopSampling`
  采样堆 + `source-map-js` 还原 TS 源（需先 `npx vite build --sourcemap`，纯产物无源可还原）。
  **口径警告**：采样堆记的是"被抽中对象自身字节"，样本数 ∝ 1/`--interval`（缺省 256），
  绝对 KB/s 与 perf-client 的 allocKBs **不同量纲，只可并列看份额，不可直列差值**；
  样本 <200 时输出无统计意义警告。产物 `results/alloc-<label>.json`（chunks=app/phaser/colyseus 归口）。
- `perf-advance`：换关链分段计时（r13 起）——`FW_DEBUG_FORCE_DOORS=1` 加速通关，直调
  `window.__fwNextLevel`（=EndMenu「继续」按钮 handler 本体），双页真服实跑 N 次链。
  分段：`bakeMs`(buildGround 包装)/`fetchMs`(/api/level/ 包装，命中缓存即 0)/
  `sceneStopped`→`sceneStarted`→`firstRender`/`worstFrame`(帧内)/`worstGap`(**帧间隔**)。
  两口径必须并记：关卡构建跑在 create 的 loader 回调里，属帧间任务，落在 prestep→postrender
  窗外——只量帧内会得到 2-11ms 的"无害帧"，实际是 146-182ms 掉帧（本工具首跑抓到的口径盲区）。
  `__hitches` 全程掉帧流水按"链窗内/空闲窗"归位：把开销挪到结算空闲窗的优化，
  只看链内会读成"没变好"，须两处分开报。`--dwell` 控制结算面板停留（缺省 1200ms；
  120ms 模拟"秒点继续"，此时预取未起跳、链内退化回现烘，两档都要跑才是公平对比）。
  产物 `results/advance-<label>.json`。
- `perf-resident`：驻留内存与分配峰值拆账（r14 起）——按**事件**而非按时间窗计量：
  `HeapProfiler.collectGarbage` → 读 GC 基线 → 页内 20ms 记录器 → 触发事件 → 等落定 → 再 GC → 读终值。
  出四类数：`churnMB`（该事件造出的字节，含随后回收的垃圾）、`peakJobMB`（选关树分帧烘焙在飞
  typed array 峰值，直读 `__fwTreeStats().jobMB`）、`heapGCMB`/`residentDeltaMB`（强制 GC 后的真常驻
  与其增量——**不 GC 就会把垃圾读成驻留**）、字节分解（`texMB` 逐源 w·h·4、`ground.bytesMB`、
  `tree.resultMB`、DOM/场景对象数）。态序固定：menu 暖装 → temple 首入（冷烘）→ 重进×2（命中）
  → game 开局静止 → 离房后 temple（冷烘），故 `--compare` 直接给同事件前后表。
  `FW_R14_LEVEL`/`FW_R14_PORT` 可切档位与端口（`meta.level` 入快照）。
  **`audioMB` 探针勘误（r16）**：`cache.audio` 的枚举入口**只有 `getKeys()`**——账本 `entries` 是 List 包装
  （own keys 仅 `entries`/`size`），r14 版读不存在的 `.keys`、首版修复读 `Object.keys(entries)` 都恒得 0，
  故 r14/r15 快照的 `audioMB`/`audioCount` 一律不作数。条目是 `AudioBuffer`，PCM 字节=帧数×声道×4
  （`bgm_level` 1,575,383 帧×2ch≈12.02MB@48kHz）；这块在 **JS 堆外**，所以 `heapGCMB` 不随音频族增减移动。
  **口径前提（勘误）**：`perf-alloc` 的 `HeapProfiler.startSampling` 对 typed array 大块字节**失明**
  （同次冷烘 `sampledTotal` 0.32MB vs 堆增长 74MB）——小对象归因走采样器，整块 ArrayBuffer/SAT 的账
  只能走本工具的事件级 GC 基线。落定条件须写复合判据 `textures.exists("tree-all") && jobs===0`：
  只看 `jobs===0` 会在 `Temple.create` 尚未执行时即为真，把在飞烘焙当常驻。
  产物 `results/resident-<label>.json`；位级回归保护由 `scripts/e2e/treebake.mjs`（三层 FNV-1a 金样
  + 重进零重烘 + 重进免重传 + 阳性对照）承担，金样 `scripts/e2e/fixtures/tree-layers.json`。
- `scripts/e2e/domskin.mjs`：**DOM 皮肤逐像素门禁**（r17 起）。连接面板是纯 DOM，
  canvas 的 visual-diff 拍不到它、journey 只看 textContent，所以"改 CSS 背景指向"这类动作
  原本没有任何回归面。口径：截屏前 `#game-root` 摘画布（角色待机相位不是确定量）、
  `animation/transition:none` 冻结时间基（`.menu-logo` 的 menu-floaty 4s 实测让同版本两次截图
  差出 1%~3% 像素），再遍历 `#menu *` 的 `::before/::after` 计算值取全部 `background-image`
  URL 逐个 `Image.decode()`（背景图不参与 `img.complete`，也不被 `document.fonts.ready` 覆盖，
  不等就是把"715KB 还没解码"读成"头像没画"）。四态 wide-idle/wide-hover/wide-error/narrow-idle
  覆盖全部 5 处皮肤引用。判据 **SHA-256 逐字节相等，零容差**；FAIL 时打印 `magick compare -metric AE`
  并把差图落 `TEMP/domskin/`（不入库）。有意改皮的三步流程（量表→写报告→`--save`）写在脚本头，
  基线代次由 `results/domskin/manifest.json` 的 `provenance` 记录。
- `scripts/font-subset/`：**进房前字体子集链**（r18 起，生产资产 `assets/fonts/chinese/font-prephase.png` 的来源）。
  与 r7f 的老工具分工要说清：`subset.py` 是按**全项目普查并集**清字形的休眠件（r7f 实测 −5.2% 未破 20% 停止线，
  未上生产），`build-font-prephase.mjs` 才是本轮上产的——它只按**进房前会渲染的文案**（声明源
  `prephase-chars.json`）保留字形，口径层 `prephase.mjs` 同时被生成器与 `font-prephase.test.ts` 使用，
  测试与产物不可能各算一套字形集。授权区 = 保留字形帧矩形 ∪ `padding="4,4,4,4"` 原样环带（LINEAR 滤波会采到帧外一格），
  `.fnt` 一字未动故 260 条度量全在原位。生成器硬断言：padding 四边相等、字形帧两两不重叠、非授权区 RGBA 全零、
  辅助块集合与源一致、重解码样本全等；`--check` 只重建到 TEMP 与在库产物比字节（复现性门禁，当前 304.5KB / −1295.8KB）。
- `scripts/png-raw.mjs`：零依赖 PNG 原始样本层（inflate IDAT + 反滤波 0–4 → RGBA；重编码保留非 IDAT/IEND 辅助块）。
  r17 先用于 DOM 皮肤裁片对拍，r18 起字体子集自证也走它——**"`magick compare` AE=0" 不能充当"字节没变"的证明**：
  两侧同过一套色彩管理，±1 级量化差会被抹平，"看着无损"不等于"存着无损"。
- `scripts/e2e/prephase-canvas.mjs`：**前场画布逐像素门禁**（r18 起）。"进房前"这一段
  （Menu/Temple/Settings/Credits）此前没有任何画布面：visual-diff 只拍 Game 的 forest_01 战斗帧、
  domskin 把画布摘掉、journey 只看 textContent——所以"把 `font.png` 换成子集"这种动整个前场
  中文渲染的改法，原本可以在零报警的情况下把字框切秃。口径：`Math.random` 换 mulberry32
  （`MenuScene.create` 一轮消费 52 个随机数，不锁就不是确定编舞）、Phaser 自驱动主循环封死
  （`loop.sleep()` + 把 `raf.start`/`loop.wake`/`loop.step` 在 `__fw` setter 处拦掉），
  改由 1000/60ms 合成步驱动 `Game.step`；视口 1280×960、`deviceScaleFactor` 1、DOM 覆盖层隐藏，
  只截 `#game-root` canvas。五态靠真实点击走到（含 `assertBoard` 校验板心 y≈159、
  temple-numbers 要求 48/48 编号已上墙），判据 **SHA-256 逐字节相等，零容差**，
  FAIL 打印 `magick compare -metric AE` 与差图（`TEMP/`，不入库）；`--save` 前先做
  `magick identify -format %k` 颜色数体检（防把空白图当基线存档）。
  **代次由产物指纹判、不由 HEAD 判**（共享工作树里 dist 可能落后 HEAD）：读入口 chunk 哈希 +
  字体目录内每个 PNG 的哈希，据 `font-prephase` 引用有无定"全量代/两段化代"，
  三份证据（首捕代/上一批/本批）并列写进 `manifest.bundlesVerified`。
- `font-decode-probe.mjs`：**字体位图解码归因件**（r18）。同一次 Chromium 页内对 `font.png` 与
  `font-prephase.png`（同尺寸 2191×1024）分别计 `fetch`/`createImageBitmap`/`Image.decode()`/绘进同尺寸 canvas+取像素
  四段。用途是把"少下 1.3MB"与"多挂一张 8.97MB 解码位图"两笔账分开——r18 实测 1600.3KB 传输在批内只占 36ms，
  所以本机口径下字体拆代的收益是**字节形状**而非毫秒，代价是驻留（见 r18 报告 §五之一、§五之二）。
- `scripts/build-dom-skin.mjs`：DOM 皮肤合成贴图生成器（r17 件A 的资产侧）。
  帧坐标取自 `assets/atlasses/*.json` 并**断言**（素材重打包即红）；裁片拼成 1082×988 + 2px 透明隔离带。
  **无损证明走原始样本**：自解 IDAT + 反滤波拿 RGBA 字节，与图集原帧逐字节全等（`compare` 两侧同过
  ImageMagick 色彩管理，会把 ±1 级量化差抹平成 AE=0——"看着无损"不等于"存着无损"）；
  另断言隔离带全 0、辅助块集合与图集一致（图集只有 IHDR/IDAT/IEND，多一个色彩块就换解码路径）、
  `--check` 重跑字节可复现。

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
| alloc-r13-{f01,fb2}-{webgl,canvas} | f7dfe6e | — | — | r13 帧内分配函数级归因（CDP 采样，self 份额口径）：我方 app chunk **2.1–2.9%**，其余 colyseus 消息回调 41.6–76.1% / Phaser 渲染器 19.2–97.1% → 判库内地板 |
| advance-r13-before / -before-fast | f7dfe6e | — | — | r13 换关链基线两档：dwell1200 烘 71.4ms、网 35.7ms、可玩帧 1239.6ms、峰隔 222.7ms；dwell120（秒点）88.5/80.7/1272.7/190.5 |
| advance-r13-prefetch / -prefetch2 | f7dfe6e | — | — | r13 预取+预烘+LRU+免重传后（-prefetch2 为抽模块后复测，数字同带）：烘 **16.9ms（-76.3%）**、网 **0ms（8/8 零网络）**、可玩帧 **1045ms（-15.7%）**、峰隔 198ms |
| advance-r13-{before,prefetch,prefetch2}-fast | f7dfe6e | — | — | r13 秒点档（`--dwell 120`，点击早于 500ms 预取起跳）：烘 88.5→**30.2ms（-65.9%）**、网 80.7→56.6、可玩帧 1272.7→1266.6（-0.5%，被 1000ms 黑幕包络淹没）、峰隔 190.5→186.5；代价＝过场窗空闲掉帧 151→177 次/峰 530.7→667.8ms |

> 注：r13 各快照的 `meta.git` 均记为 `f7dfe6e`——测量时改动仍在工作树未提交，工具按 HEAD 打戳；
> 实施件随后落为 `09c6c13`+`9cd0c3a`，还原实现态复跑 `route forest_03` 与 `scripts/e2e/groundcache.mjs`
> 均 PASS，故快照与代码态可对应。
| client-r12-baseline-* / -opt-* | 6221aeb | — | — | r12 帧内写入计数基线/实施后（相机 484→31、HUD 1452→93、分配 1149→1044KB/s） |
| visual-r13 / visual-r13b | f7dfe6e | — | — | r13 视觉差分（新口径带 90.0–92.9 内，run-to-run 抖动 ±2pt，须与 r12 同带并读） |
| load-r17-base-f01 | e0080b2 | — | — | r17 DOM 皮改指前的冷启基线（Menu 段 4054KB/21req，其中 3 条 `type:css` 图集行 1241.1KB 落在 20–81ms） |
| domskin-{wide-idle,wide-hover,wide-error,narrow-idle}.png | 7c19e61 | — | — | DOM 皮肤四态逐像素基线（合成贴图皮一代；上一代图集皮在 `043b2a5`） |
| load-r17-after-f01 | 7c19e61 | — | — | r17 件A 后冷启（Menu 段 3799KB/19req，DOM 皮 80.5KB 单行；全链 6830KB＝基线 +79.0KB，PopupAssets 334.4KB 退回点击后真实下载） |
| visual-r17b{1,2} | 305715e | — | — | r17 件A 同码补跑（92.79 / 93.10，与首跑 92.96 并记，极差 0.31pt＝带顶抖动） |
| load-r18-base-f01 | 851f0a2 | — | — | r18 拆代前基线：Menu 段 3799KB/19req，其中 `font.png` 1600.3KB＝42.1%（Boot 关键路径最大单文件） |
| load-r18-after-f01 | 0969558 | — | — | 件C 后终态：Menu 段 **2504KB**/19req（−1295.0KB·−34.1%），全链 7135KB＝**+304.8KB（本轮代价）**；条件复验 47 URL 7120.7KB→0KB、reload 4KB |
| load-r18-ab-{full,split,full2} | 0969558（检出 HEAD；代际由工作树回退重建决定，同 r16 口径） | — | — | **同场 A/B/A** 三快照：点击→Game 1716.5 / 1542.5 / 1270.5ms——同一份全量代产物两次跑差 **446ms**，故本轮两个 ms 差全部撤回，只留字节与位图账 |
| client-r18-f01 | 0969558 | — | — | canvas 60.3fps、帧内分配 998KB·s⁻¹（webgl 12.1fps 软件光栅口径） |
| advance-r18 | 0969558 | — | — | 5/5 零网络、烘焙均值 28.5ms、换关→可玩均值 1090.5ms（与 r13/r17 同带＝字体拆代未触碰换关链） |
| prephase-canvas/（5 PNG + manifest） | c37f585 → c39679f | — | — | 前场五态逐像素基线（menu 803825B/temple 279822B/temple-numbers 448944B/settings 327029B/credits 378094B）；`bundlesVerified` 已登三代产物指纹互验（全量代首捕 `CJqW9TNF`、两段化 `rlLaY6Dc`、终态 `BEyFZ836`） |

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
