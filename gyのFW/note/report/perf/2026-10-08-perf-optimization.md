# 性能优化专项报告（0.3.21）

> 2026-10-08 · 性能专项四轮 · 基线 0.3.20（3a1cfdf）→ 0.3.21
> 测试程序：`benchmark/perf-step.mjs`（服务端物理 step）、`benchmark/perf-determinism.mjs`
> （位级一致门禁）、`benchmark/perf-load.mjs`（客户端加载）；快照存 `benchmark/results/`。
> 红线：安全性 / 稳定性 / 兼容性（含物理行为——复刻保真是本项目验收维度，任何引擎层
> 改动必须位级一致，由确定性门禁强制）。

## 〇、结论速览

| 维度 | 优化前 | 优化后 | 变化 |
|---|---|---|---|
| 服务端物理单步（48 关均值） | 0.676ms | **0.065ms** | **−90.4%** |
| forest_bonus_2 单步（最重关） | 28.80ms（超 60Hz 预算 73%） | **2.43ms**（6.8 倍实时余量） | **−91.5%** |
| forest_bonus_2 每仿真秒物理占用 | 1727.8ms（慢动作） | 146.1ms | −91.5% |
| 单测套件时长 | 22.7s | **4.5s** | −80% |
| 客户端冷启动传输（Menu） | 6909KB / 39 req | **4858KB** | −29.7% |
| 客户端 reload 传输 | 408KB | **3KB**（缓存全命中） | −99% |
| 客户端 reload → Menu 激活 | 807ms | 570ms | −29% |
| 物理复刻度 / 视觉复刻度 | 84.31 / 94.97 | **84.31（逐位一致）/ 94.61（噪声带内）** | 零回归 |

bonus_2 曾被 0.3.14 性能审计记录为「单步 24.2ms 超 60Hz 预算，wasm 换核或分帧属 L 级工程，
暂缓」——本轮以**位级一致的加载器修复**直接解决，无需换核。

## 一、基准程序建设（先建门、后动手）

| 程序 | 测什么 | 门禁语义 |
|---|---|---|
| `perf-step.mjs` | 48 关逐关 build + 预热 + 600 步计时，avg/p95/p99、每仿真秒物理占用、60Hz 预算余量 | `--save/--compare` 出前后表（对标 fidelity-score 用法） |
| `perf-determinism.mjs` | 48 关 × idle/scripted 双输入脚本 × 每步全部刚体 6×f64 **原始位**哈希链（链式，含体数） | `--compare` 要求逐关哈希一致；**任何引擎层优化的硬门禁** |
| `perf-load.mjs` | 构建产物冷启动（新 context）：DCL/__fw/Menu/Game 激活、传输/解码字节、请求数、reload 缓存命中 | `--save/--compare`；页面错误非空即失败 |

## 二、R1 · 服务端物理 step（本轮主战场）

### 2.1 取证链（为什么慢）

1. CPU profile（--cpu-prof）：时间均匀分布在引擎各物理函数（b2FindMaxSeparation 11.6% /
   b2Distance 8.0% / SolveTOI 7.8% …），`--trace-deopt` 零反优化——不是热点劣化，是**整体常数因子差**。
2. 对照实验（同引擎同负载、独立进程）：vm 沙箱求值 **1.14-1.19ms/步** vs 主上下文求值
   **0.15-0.17ms/步** —— **7 倍差距来自 vm 上下文本身**。进一步排除：沙箱 own-Math/host-Math
   无差别（1.34-1.47ms）；`vm.runInThisContext`（主上下文、脚本作用域）0.17ms——即与求值机制
   无关、与上下文绑定。定性为 vm context 全局代理的属性访问慢路径拖累 Closure bundle 的
   高频命名空间读写（`box2d.xxx` 系隐式全局）。
3. `new Function` 以 `{}` 为 this 求值失败（`box2d is not defined`）证明 bundle 靠**隐式全局赋值**
   挂命名空间——修复必须以真实 globalThis 为 this。

### 2.2 修复（`packages/shared/src/box2d/load.ts` 重写）

`new Function(参数遮蔽 stub…) + .call(globalThis)` 主上下文求值：

- 浏览器痕迹 stub（navigator/document/Phaser/define/window/self）以**函数参数**遮蔽提供，
  语义与旧沙箱属性注入一致（stub 值原样保留，含 userAgent 串），不污染全局；
- 命名空间（box2d/goog/COMPILED）落在服务端进程 globalThis（与 Node/express/colyseus 无
  命名冲突，已核对）；
- **安全姿态不变**：node:vm 本就不是安全边界（官方文档明示），被求值的始终是仓库内字节级
  受控、带 SHA-256 溯源的 vendor 文件；无新增依赖、无网络/IO 行为变化；
- 文件尾部衔接逗号的剥离逻辑与旧实现一致。

### 2.3 位级一致验证（红线核心）

- `perf-determinism --compare baseline-vm`：48 关 × idle+scripted × 600 步 × 全刚体 f64 位
  哈希链**逐关一致**（修复前后）；
- `fidelity-score --compare r24-docaudit`：**84.31 → 84.31**，五条金轨迹逐体无变化；
- 83/83 单测、typecheck 全绿；e2e 联机 PASS（0 错误）。

### 2.4 数字（perf-step，两轮存档 `perf-baseline-vm` → `perf-r1-loader`/`r4-final`）

| 关卡 | 前 avg | 后 avg | Δ | 每仿真秒 前→后 |
|---|---|---|---|---|
| forest_bonus_2（113 刚体） | 28.7958ms | 2.4347ms | −91.5% | 1727.8 → 146.1ms |
| forest_bonus_1（66 刚体） | 1.3477ms | 0.1309ms | −90.3% | 80.9 → 7.8ms |
| forest_30 | 0.0888ms | 0.0197ms | −77.8% | 5.3 → 1.2ms |
| 中位关（forest_17 等） | ~0.04ms | ~0.009ms | −70~85% | <1ms |
| 48 关合计 | 0.6759ms | 0.0648ms | **−90.4%** | — |

- 服务端单房间 CPU（旧实测 3.2%/核，普通关）中物理占比 ≈90%，本轮后同规模房间预估
  ≈0.4%/核；理论容量从 ~30 房/核 提升一个量级（本项目 1 房即用，纯属余量）。
- 实际收益外溢：vitest 22.7s → 4.5s（bonus_2 浸泡用例 16.6s → 1.6s 级）。

### 2.5 R1b · 引擎热点微优化（评估后不做，记录理由）

新 profile（修复后）已平坦（最大单项 b2Distance 7.9%，含 tsx 加载器钩子噪声 ~5%）。
识别到 `b2Timer.GetMilliseconds` 每次 `new Date()` 分配（自耗时 2.5%）等 ~1-2% 级机会，
但修复须改 `vendor/box2d.js`——该文件的价值是**与原版 init.js 字节区间逐字节一致**
（SHA-256 溯源，vendor/README），为 1-2% 破坏溯源不值。判定：不做，留档。

## 三、R2 · 快照编码/带宽（量化后确认已最优）

- 事实核验：Colyseus Schema 0.16 setter 对 `value === previousValue` 短路
  （node_modules 源码直证），`syncState` 全量写不会产生假增量；
- 实测拆解（`benchmark/perf-sync.mjs`，真实 RoomState + Encoder + 20Hz 编码，森林基准关 / 最重关）：

| 关 | step | syncState | encode@20Hz | 平均 patch |
|---|---|---|---|---|
| forest_01 | 0.024ms | 0.009ms | 0.022ms | 335B |
| forest_bonus_2 | 3.06ms | 0.067ms | 0.078ms | 2488B |

- sync+encode 合计占 bonus_2 tick 的 ~2%、普通关 <0.1% 预算；patch 字节反映 47 平台的
  真实运动，无水分。**结论：该路径已有效最优，不做投机改写。**

## 四、R3 · 客户端加载（四件套）

1. **音频懒装载**（`packages/client/src/audio.ts` 新增）：Menu 冷启动只装 bgm_menu；
   游戏内 18 键 ≈2.8MB 移入 GameScene.preload（与建房握手/2s ready 倒计时并行）。
   探针验证：Menu 阶段 `cache.audio` 仅 bgm_menu=true；Game 阶段 18 键全部就位；零页面错误。
2. **brotli 协商**（q5，node:zlib 内建零依赖）：客户端支持 br 时优先，比 gzip 再省 ~15%。
3. **分级缓存**：Vite 内容哈希产物 `immutable, max-age=1y`；index.html `no-cache`（保证
   版本升级能拿到新哈希）；其余素材 1 天。压缩响应补 `Vary: Accept-Encoding`（经代理/隧道
   缓存时的协商正确性）。
4. **vendor 分包**（vite manualChunks）：phaser 1.48MB / colyseus 129KB 独立哈希块——
   业务代码更新时大块命中缓存，仅重传 19KB gzip 的 index 块。

实测（perf-load 两轮均值，`load-baseline` → `load-r3-load`）：

| 指标 | 前 | 后 |
|---|---|---|
| 冷启动传输（Menu 激活时） | 6909.5KB / 39 req | 4858KB（−29.7%） |
| 冷启动 Menu 激活 | 894ms | 861ms（本地磁盘带宽下改进有限，公网隧道按比例放大） |
| 点击建房 → Game 激活 | 272ms | 364ms（+92ms = GameScene 预载音频，本地直测值；与建房/倒计时并行，实际被掩盖） |
| reload 传输 | 408KB | **3KB**（immutable 全命中） |
| reload Menu 激活 | 807ms | 570ms（−29%） |

公网意义：樱花隧道带宽是本项目的现实约束（历史实测 ~22MB/局），冷启动 −2MB / 会话 +
reload 近零传输直接放大为局数配额。

## 五、R4 · 关卡装载/内存/GC（验证收口）

- 服务端建房/重开延迟（稳态实测）：forest_01 8.3ms / bonus_2 21.0ms；reset 8-13ms——
  每局一次的量级，无需优化；
- GC：bonus_2 持续 3000 步（50 仿真秒）Scavenge ~0.2-0.5ms/次、摊销 ≈0.02ms/步；
  堆 19MB / RSS 87.7MB 稳定；
- 客户端（bonus_2 双人 started 60s 浸泡）：heap 24.62 → 25.01MB（Δ0.39MB，无泄漏迹象），
  loop fps 60.02，零页面错误；
- 结论：装载与内存路径健康，**无需改动**，数据归档。

## 六、验证矩阵（全部通过）

| 门 | 结果 |
|---|---|
| typecheck | 绿 |
| 单元测试 | 83/83（4.5s） |
| 确定性门禁（48 关位级哈希链） | 逐关一致（vs baseline-vm） |
| fidelity-score | 84.31 → 84.31（金轨迹逐体无变化） |
| e2e 联机回归（双浏览器真实房间） | PASS，0 错误 |
| visual-diff | 94.61（历史噪声带 94.36-94.97 内） |
| 音频在位探针（懒装载后） | Menu=1 键 / Game=19 键全在，零错误 |
| 60fps 浸泡（bonus_2 双人 60s） | 60.02fps，堆稳定 |

## 七、文档一致性核验（本次任务另一问）

- README/handoff/release 所引数字抽查属实：0.3.20、83/83、84.31（19b990e 复现存档
  r24-docaudit，本轮在 3a1cfdf 复跑仍精确一致）、bonus_2 24.2ms（本轮基线复测 28.8ms，
  同量级——原值测于 1200 步含更深预热段，差异属测量口径）、gzip −76%（代码在位）。
- 本报告所有新数字均可由 benchmark/ 三程序 + `benchmark/results/` 快照复现。

## 八、后续可做（收益/成本已评估，均非必须）

- `b2Timer` Date 分配等 vendor 微优化（~1-2%，破坏字节溯源，不做）；
- LevelMusic_dark 等 per-关卡类型音乐的按需三批（dark/speed 曲目仅对应关型使用，
  当前已并入 Game 批，进一步拆分收益 <1MB，复杂度不值）;
- HTTP/2（express http1 + 隧道场景收益有限）。
