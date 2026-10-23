# 03 · H4 内存实测：templeTreeBake 烘焙缓存有界性（2026-10-23，C 槽）

> 对应 [04-fix-log.md](../../audit/2026-10-21-code-audit/04-fix-log.md) §3 遗留：「H4 内存：LRU=2 与分片只做了实现与门禁复验，未在真机测峰值 RSS；如需数字应另跑内存基准」。
> 本档只报实测数字与测量口径，不做门禁判定。H4 修复 commit：`c7dc51b`（LRU=2 + 行分片）。
> 环境：git `633d9d2`，Node v22.22.1，13th Gen Intel i5-13400F（8 核），Linux。

## 1. perf-mem 基线（全量内存基准，与 H4 无关的通用基线）

命令（纯 Node 差分法，无端口/服务器依赖）：

```
node --expose-gc --import tsx benchmark/perf-mem.mjs
```

| 项 | 结果 |
|---|---|
| 每 World 常驻（20 实例斜率中位，60 步） | forest_01 = **0.69MB/World**；forest_bonus_2 = **2.88MB/World** |
| 创建销毁吞吐（forest_01 ×150，60 步） | **4.3ms/World（232.4/s）**；三轮 heap 漂移 0.72 / 0 / 0.05MB（中位 0.05MB，≈0 即无泄漏迹象） |
| 50 世界并发峰值（60 步） | forest_01：heap 峰值 51.62MB（Δ**+35.2MB**，≈0.704MB/World），RSS 203.04MB，释放后 heap 17.03MB |
|  | forest_bonus_2：heap 峰值 168.12MB（Δ**+151.08MB**，≈3.022MB/World），RSS 284.9MB，释放后 heap 19.58MB |

## 2. H4 压测：12 个不同 cacheKey 连续烘焙

### 2.1 对外入口与 cacheKey 构成（读源码确认）

- 入口：`peekTreeBake(p)`（命中读 + LRU 刷新）、`startTreeBake(p)`（入队，MAX_JOBS=2）、`stepTreeBake(key, budgetMs)`（行分片步进，产品节奏 8ms/帧，TempleScene.ts L143-144）、`bakeTreeLayersSync`（测试/兜底）。
- cacheKey（templeTreeBake.ts L290-293）：`[canvasW, canvasH, Cf, Kf, color, scale, edges.length, levels 各关 stateOf 逗号串].join("|")`。星级变化（stateOf 语义 0=锁定 / 1=可玩 / 2..4=星数+1，TempleScene L95-98）即产生新 key。
- 缓存上限：`MAX_RESULTS=2`（L263）、`MAX_JOBS=2`（L264）；淘汰时先 `width=height=0` 释放位图再删引用（`rememberResult`，L296-311）。

### 2.2 测量方法（口径声明）

项目无 jsdom/node-canvas 依赖（单测走纯数学路径），故在 import 模块前注入最小 canvas 桩：

- canvas 按真实 W×H×4 分配 `Uint8Array` backing store；resize 即重分配、缩到 0 即释放（与浏览器 canvas 位图语义一致）；`getImageData/createImageData` 返回同尺寸 `Uint8ClampedArray`。
- **双口径**：① 确定性台账 liveBitmapBytes（桩内对每次分配/重分配精确加减，不依赖 GC）——度量结果画布位图驻留，是有界性主证据；② `process.memoryUsage()` 的 heapUsed + arrayBuffers + rss（1ms 采样器，在分片步进间隙触发）。heapUsed 不含 TypedArray backing store（堆外），故 buffer 通道以 arrayBuffers 为准。
- 烘焙内容为空（drawImage 桩 no-op → alpha 全零，滤镜走零内容 SAT 快路径），但模块的分配面（源画布 / raw ImageData / alphas / sats / outs / 结果画布）与真实路径**逐字节同尺寸**，内存口径不受影响。只测内存，不测耗时。
- 参数镜像 TempleScene.ts L61-72/L121-133：设计分辨率 1280×960（main.ts L615-616）→ k=864、C=min(1.2k,0.9W)=1036.8、scale=0.6、烘焙画布 **1036×864**；关卡/边取真实 `data/forest/temple.json`（48 关 47 边，#5B4610）。
- 进度模拟：12 轮、每轮多「通关」一关（stars 0..4 语义），stateOf 闭包读每轮快照——12 个 key 断言互异（复算公式与模块内 key 逐轮比对一致）。
- 命令：`node --expose-gc --import tsx TEMP/h4-mem/h4-bake-mem.mjs`（临时件，跑后已删；方法与口径以本档为准）。
- v1→v2 修正（如实记录）：v1 的 stateOf 闭包读了被后续轮继续改写的全局进度数组，导致驻留探测时旧 key 被追溯改写（harness 假象，非模块缺陷）；v2 改读每轮快照。v1 另漏了 arrayBuffers 口径与台账减法。

### 2.3 数字（连跑两轮，可复现）

| 轮次 | #1 | #2 |
|---|---|---|
| 基线（gc 后） | heap 6.26MB + arrayBuffers 0.02MB = 6.28MB，RSS 98.78MB | 同 6.28MB，RSS 95.66MB |
| 驻留位图台账（逐轮 gc 后） | 第 1 轮起平台 **20.49MB = 6.0 张整屏画布 = 2 键**，12 轮不增长 | 同 |
| heap+arrayBuffers 稳态（逐轮 gc 后） | 第 1 轮 +10.50MB → 第 2 轮起平台 **+20.79~+20.89MB**（≈2 键结果位图 20.49MB + key 串） | 同 |
| 全程采样峰值 | **68.43MB（Δ+62.15）**，RSS 峰值 193.6MB | 68.40MB（Δ+62.13），RSS 191.44MB |
| 弃引用 + gc 后 | 27.16MB（Δ**+20.88MB** ≈ 恰好 2 键位图） | 27.15MB（Δ+20.88MB） |
| LRU 驻留探测（12 键按序 peek） | **仅 key#11、key#12 命中，#1-#10 全 miss（驻留=2）** | 同 |
| canvas 桩台账 | 分配 348 次 / 累计 300.89MB；**归零释放 66 次 / 225.36MB**（=36 次源画布 prepare 后自清 + 30 次结果画布被淘汰，与推演逐一吻合）；仍驻留 20.49MB | 同 |

峰值分解：采样峰值 68.43MB − 稳态 27.16MB ≈ **41.3MB 为分片任务中间缓冲**（行分片的 raw ImageData/alphas/SAT/out，最多约 2 层并存 + 单层 prepare 瞬时的源画布位图 + ImageData 拷贝），任务完成后全部释放——这正是「无界结果缓存 → 有界任务缓冲」的修复形态。

### 2.4 有界性结论（实测，非门禁判定）

1. **缓存有界成立**：12 个不同 key 连续烘焙，驻留位图第 2 轮起恒为 20.49MB（=2 键 × 3 张 1036×864 画布），行为探测恰好最近 2 键驻留、其余 10 键 miss；反证：若缓存无界，12 键结果位图应为 122.92MB，实测 20.49MB。
2. **稳态额外占用** ≈ +20.9MB（2 键结果位图，符合设计的 LRU=2 上限）；**瞬时峰值** ≈ +62.1MB（含分片任务中间缓冲，任务结束回落至稳态）；RSS 峰值 ≈ 192-194MB（含 Node 运行时 ≈95MB 底座）。

### 2.5 与审计估算（10.7MB/键）对照

- 审计口径：每 key 约 3 张整屏 canvas ≈10.7MB。实测单张 1036×864×4 = 3,580,416 字节，×3 层 = 10,741,248 字节 = **10.74MB（十进制 MB）/ 10.24MiB**——与审计估算 **10.7MB/键吻合**（估算按十进制 MB 且与 1036.8×864 的浮点尺寸几乎一致）。
- 审计假设的「无界 Map 每 key 累加」在本压测的反证面：12 键应为 ≈128.9MB（十进制）/ 122.92MiB，实测驻留 21.5MB（十进制）/ 20.49MiB，即 **有界上限 = 2 键 ≈ 21.5MB，与进度操作次数无关**。

### 2.6 口径局限（如实声明）

- 桩绘制内容为空：像素算术走零内容快路径，但**分配面与真实路径逐字节同尺寸**（画布、ImageData、SAT、输出缓冲均按真实 W×H 分配），内存结论不受影响；真实内容下峰值不会因内容而新增分配面。
- 浏览器 canvas 位图可能在 GPU/离堆，不占 JS heap——本压测把它显式计入台账与 arrayBuffers，属**保守上界**；浏览器实际进程内存口径以 RSS 类比。
- Node 22 单进程口径，非真机浏览器多进程（GPU 进程另计）；「真机峰值 RSS」仍以浏览器实测为准，本档提供的是逻辑有界性与量级证据。
