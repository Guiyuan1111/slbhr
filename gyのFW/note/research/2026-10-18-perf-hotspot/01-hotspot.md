# 01 号档 · CPU/分配热点剖析（hotspot 槽，性能优化第一轮）

> 一句话：**三面（内核 / 服务器 tick 链 / 序列化）的时间去向已定位——主动物理负载下 Box2D 引擎内部占 self 时间 86.4%（服务器链 64.1%），其中最大可动单项是 vendor 遥测计时器 b2Timer（idle self 13.4%、replay 5.8%，纯写不读、物理零依赖）；内核胶水层仅 ~4%，唯一实义热点是 `step()` 体内逐步新建的 `jumpSound` 闭包（tsx keep-names `__name` 开销）；序列化不是瓶颈（encode 9.6%/tick、384B 增量）；分配面 idle 2.4KB/步、主动 10KB/步，GC self ≤2.7%——第一轮优化清单 TOP1=b2Timer 桩（需证明中性）、TOP2=mechSnapshot 中间对象消除（零风险）。**
>
> - 日期：2026-10-18（hotspot 槽）
> - 方法：`node --cpu-prof` / `--heap-prof` / `--trace-gc` + 自研解析器（tools/parse-profiles.mjs、tools/callers.mjs，自包含可复跑）；负载三件驱动 tools/prof-kernel-{idle,replay,server-chain}.mjs
> - 红线遵守：产品代码零改动（packages/**、scripts/**、benchmark/** 只读）；原始 profile 全部收容 tools/raw/（单件 ≤316KB，均 <5MB）
> - 交叉参照：`note/report/perf/2026-10-18-r0-baseline.md`（bench 槽同日 r0 基线，测"多快"；本档测"慢在哪"）

---

## 0. 环境与方法

| 项 | 值 |
|---|---|
| 基线 git | `9e1ac7b`（剖析期间无产品代码变更，HEAD 与剖的对象一致） |
| node / 机 | v22.22.1 · i5-13400F · Linux（与 r0 同机） |
| 负载纪律 | 剖析窗口 1min load 1.2~1.9（>2 时等待重试，遵守派发纪律）；跑前 ps 复核无 >6%CPU 的他进程 |
| 引擎形态 | `packages/shared/vendor/box2d.js`（init.js 字节级切片）经 `new Function` 主上下文求值（`box2d/load.ts`）→ **cpuprofile 内无 URL，按函数名 `box2d.` 前缀归类**（Closure exportPath 保留完整原型方法名，可读性良好） |
| 剖析件 | cpu：idle-20k / idle-400k / replay-60 / serverchain-30k；heap：idle-400k / replay-180 / serverchain-30k；gc：三负载 --trace-gc 日志（parsed 入表） |

三负载定义（与派发任务一一对应）：

| 负载 | 驱动 | 规模 | 热态耗时 |
|---|---|---|---|
| A 内核空载 | `World(loadLevel("forest_12"))` + EMPTY_INPUT step | 400,000 步（另存任务规定 ×20000 档 raw） | 4.9~5.9 µs/步 |
| B 整关回放 | routes/forest_01.json 事件流→逐帧输入表回放（WIN@f2365，60 遍每次 reset） | 141,960 步 | 61~66 µs/步（剖析器下）；无剖析器热态 ≈39.5 关/s（纯步 7.38µs + reset 7.8ms） |
| C 服务器 tick 链 | ForestRoom.tick 三段 headless 镜像：`world.step` → `syncState`（ForestRoom.ts L410-536 逐行镜像）→ Colyseus `Encoder.encode()`（@colyseus/schema 3.0.76 CJS 同源实例） | 30,000 tick | step 77.5 + sync 4.8 + encode 8.7 µs/tick |

回放正确性锚：60 遍全部 `endFrames=[2365,…,2365]`，与路由注记 "kernel WIN @f2365" 逐字一致；服务器链 patch 非空率 100%、平均 384B/tick（bench 槽 r0 sync 口径 347B@20Hz 同量级）。

---

## 1. STEP1 · CPU profile 结果

### 1.1 分类汇总（self 时间，去掉归类误差后）

| 分类 | A idle-400k | B replay-60 | C serverchain-30k |
|---|---|---|---|
| **box2d 引擎内部** | **73.8%** | **86.4%** | **64.1%** |
| 内核胶水（shared/kernel） | 9.1% | 3.3% | 4.3% |
| Colyseus/schema | — | — | 10.5% |
| GC | 2.1% | 2.6% | 2.7% |
| node 内部（含 tsx 启动噪声） | 8.7% | 2.2% | 9.1% |
| 采样总时长 | 2457ms | 9760ms | 3175ms |

注：A/C 的 node 内部占比含一次性模块加载（tsx/esm hooks/bootstrap，约 300ms 定值），稳态占比应更低；B 采样最长、启动摊薄最干净，是**主动物理负载的代表面**。

### 1.2 self 时间 TOP（replay-60，主动物理代表面）

| # | 函数 | self% | 归属 |
|---|---|---|---|
| 1 | `box2d.b2RevoluteJoint.SolveVelocityConstraints` | 7.23% | box2d 求解器（旋转关节=机关转臂/吊板/滑轮） |
| 2 | `box2d.b2World.Step` | 7.01% | box2d 步进外壳（含遥测计时器构造） |
| 3 | `box2d.b2Island.Solve` | 5.94% | box2d 岛求解循环 |
| 4 | `box2d.b2ContactSolver.SolveVelocityConstraints` | 4.68% | box2d 接触求解 |
| 5 | `box2d.b2BroadPhase.UpdatePairs` | 4.26% | box2d 宽相（动态树配对） |
| 6 | `box2d.b2World.Solve` | 4.16% | box2d |
| 7 | `box2d.b2Distance` | 3.93% | box2d 距离几何（TOI 支柱） |
| 8 | `box2d.b2World.SolveTOI` | 3.90% | box2d 连续碰撞外壳 |
| 9 | `box2d.b2TimeOfImpact` | 3.86% | box2d TOI 保守推进 |
| 10 | `goog.base` | 3.85% | Closure 构造链——**contact 对象创建路径**（调用者全是 `b2PolygonAndCircleContact.Reset` 等 contact 构造/复位） |
| 11 | `box2d.b2Timer.GetMilliseconds` | 3.80% | **vendor 遥测**（`new Date().getTime()`） |
| 12 | (garbage collector) | 2.64% | GC |
| 13 | `box2d.b2ContactManager.Collide` | 1.99% | box2d 窄相 |
| 14 | `box2d.b2Timer.Reset` | 1.97% | **vendor 遥测** |
| 15 | `box2d.b2FindMaxSeparation` | 1.80% | box2d 窄相 |
| 16 | `box2d.b2DynamicTree.InsertLeaf` | 1.73% | box2d 宽相 |
| 17 | `box2d.b2DistanceProxy.GetSupport` | 1.69% | box2d TOI |
| 18 | `box2d.b2AABB.Combine2` | 1.68% | box2d |
| 19 | `box2d.b2DynamicTree.MoveProxy` | 1.32% | box2d 宽相 |
| 20 | `box2d.b2PolygonShape.ComputeAABB` | 1.16% | box2d |
| 21 | `box2d.b2SeparationFunction.FindMinSeparation` | 1.08% | box2d TOI |
| 22 | `box2d.b2Body.IsAwake` | 1.05% | box2d（调用者=引擎内部 SolveTOI/Collide/Solve，非内核） |
| 23 | `__name @kernel/world.ts` | 0.98% | **tsx keep-names 助手**（caller=`step @kernel/world.ts`，即逐步新建的 `jumpSound` 闭包，world.ts L242） |
| 24 | `box2d.b2Fixture.Synchronize` | 0.96% | box2d |
| 25 | `box2d.b2ContactSolver.SolvePositionConstraints` | 0.95% | box2d |

### 1.3 inclusive 结构（replay-60，去重栈口径）

`step @kernel/world.ts` = 90.1% → `b2World.Step` = 86.3%（**内核胶水本身仅 ~4%**）：

| 子树 | incl% | 说明 |
|---|---|---|
| `b2World.Solve` | 45.6% | 其内 `b2Island.Solve` 25.2%、RevoluteJoint 速度约束 7.3% self |
| `b2World.SolveTOI` | 24.0% | 其内 `b2TimeOfImpact` **18.0%**——TOI 是单族最大物理面 |
| 窄相+宽相（Collide 7.6% + FindNewContacts 6.5% + UpdatePairs 6.2% + MoveProxy 5.3%） | ~15%（有父链重叠） | contact 创建/维护面（goog.base 4.1% 在此路径） |
| `b2Body.SynchronizeFixtures` | 8.5% | AABB 重同步 |
| `reset @kernel/world.ts`（整关重建） | 4.0% | buildLevelWorld+机关装配 7.8ms/次 |

（idle 面特殊项：`b2Timer.GetMilliseconds` 6.8% + `b2Timer` 构造 6.6% = **13.4%**——世界睡眠后计时器占比凸显；`b2Body.IsAwake` 2.5%。）

（serverchain 面特殊项：colyseus `encode` 2.85% + schema `set` 1.62% + `encodeSchemaOperation` 1.33% = ~5.8% self；`syncStateMirror` self 1.6%。）

### 1.4 三面结论（派发要求的逐面一句）

- **shared 物理内核**：最大热点 = Box2D 求解器内部整体（Solve 45.6% + SolveTOI 24.0% incl），单函数占 self 最大 = `b2RevoluteJoint.SolveVelocityConstraints` 7.2%；**唯一"免费"大项 = b2Timer 遥测（idle 13.4% / replay 5.8% self，纯 `new Date()`）**。
- **服务器 tick 链**：时间花在 `world.step`（85.1% 链内占比），syncState 4.8µs + encode 8.7µs 合计 ~14%——tick 链的优化即内核优化。
- **序列化**：`Encoder.encode()` 每 tick 8.7µs / 384B 增量（60Hz patch，ForestRoom `setPatchRate(1000/60)` 生产同频，netopt 11 号档），全量 encodeAll 350B——**占比 9.6%，不是瓶颈**；无字符串分配大户（schema 编码出二进制字节流，`anim` 字段低频变更）。

---

## 2. STEP2 · 分配剖析

### 2.1 分配速率（--trace-gc 热窗口实测，比 heap-prof 采样粒度 512KB 桶可靠）

| 负载 | 稳态 young GC 间隔 | 每次回收 | 分配速率 | 折每步 | full GC |
|---|---|---|---|---|---|
| A idle 400k 步 | 15.8ms | 7.9MB | 0.489 GB/s（最高速率口径） | **≈2.4 KB/步** | 0 次/1.96s |
| B replay 60 遍 | 71ms | 11.9MB | 164 MB/s | **≈10 KB/步** | 6 次/8.66s（暂停 1.6~4.9ms/次） |
| C chain 30k tick | 64.5ms | 11.9MB | 180 MB/s | **≈16 KB/tick**（含 snapshot/schema/encode） | 2 次/2.64s |

heap-prof 函数级字节表受 V8 采样桶 512KB 粒度 + 启动一次性分配（模块编译 ~5MB）污染，仅作定性归因（tools/agg-heap-*.json 全档）；**可靠归因组合 = trace-gc 总量 + CPU profile 交叉**：

### 2.2 分配大户定性结论（证据 = heap top + vendor 源码直读）

| 分配源 | 证据 | 性质 |
|---|---|---|
| **b2Timer 的 `new Date()`**：`Step` 内 3 处构造 + `b2Island.Solve` 内 1 处 + `GetMilliseconds()` ×9/步 ≈ **每步 12~13 个 Date 对象 + 等量时钟系统调用** | vendor 直读 `box2d.b2Timer = function () { this.m_start = new Date().getTime(); }`；`GetMilliseconds(){ return new Date().getTime() - this.m_start }`；Step 源码 3×`new box2d.b2Timer()` | 遥测，写 m_profile/`b2_toiTime` 后无人读 |
| **contact 对象创建/销毁链**：`b2Contact` 构造 + `goog.base` 调用链 + 各 `b2XAndYContact.Create/Reset`（serverchain heap 桶 top1 22.2%、replay 5.0%） | heap-prof top + callers.mjs（goog.base 调用者 100% 是 contact 构造/复位） | 引擎内部，随接触数浮动 |
| **TOI 几何临时量**：`b2WorldManifold.Initialize`、`b2DistanceProxy.GetSupport`、`b2CrossVV`、`b2AABB.Combine2`（各 2~4% 桶） | heap top + replay inclusive | 引擎内部 |
| **内核侧每步新建**：`jumpSound` 闭包（world.ts L242 step 体内）、`events`/`mechEvents` 数组、`Wind.applyForce` 的 `new b2Vec2`（mechanisms.ts L665/674，仅风柱激活时）、`character.ts` 施力/速度写路径 `new b2Vec2`（L158/230/252-253） | 源码直读 + `__name` self 1.0% | 内核胶水 |
| **mechSnapshot() 每 tick 新建 ~30 个快照对象 + 数组**（world.ts L165-208：levers/pushers/platforms/props/winds/hangings/pulleys×2/romans 各 map 出新对象） | 源码直读；chain 每步分配 16KB 中 sync 段对应部分 | 序列化胶水，物理无依赖 |

### 2.3 关于"Vec2 分配在 Box2D.js 内的占比"（派发点名问题）

**getter 零分配**：`GetPosition`/`GetLinearVelocity`/`GetWorldCenter` 等全部走 out-param 模式（`a = a || this.m_out_xf.p; a.Copy(...)`，vendor 直读）——内核每步大量调用的读取不产生 b2Vec2 垃圾。Box2D 内部的分配大头是 **Date（遥测）+ contact 生命周期 + TOI 临时几何**，不是向量 getter。

### 2.4 GC 量级判读

- young 暂停 0.13~0.4ms/次（idle 面 124 次/1.96s）；full GC 仅主动负载出现（replay 6 次/8.7s，单次 1.6~4.9ms）。
- 折算生产（60Hz、单世界）：active 世界 ≈600KB/s 分配；50 世界并行 ≈30MB/s → 共享 young 代（默认 16MB 量级）约每 0.5s 一次 scavenge。**GC 现状非主要矛盾，但 TOP1/TOP2 落地后 idle 分配可减约半**。

---

## 3. STEP3 · 优化机会分类表（可动作清单）

风险档定义：`零风险`=物理路径零触碰；`需证明中性`=预期不改任何 f64 位，但必须过 det 门 + fixture 网后才能合入；`必漂`=会改计算顺序/算法结果，**禁动，除非用户特批**。

| # | 机会 | 预期收益 | 风险档 | 验证命令 |
|---|---|---|---|---|
| **1** | **b2Timer 遥测桩**：`load.ts` 求值后覆写 `box2d.b2Timer`→零钟桩（`GetMilliseconds:()=>0`），vendor 字节不动。已证 m_profile 8 处赋值+2 处累加（`solveInit += …`）+ `GetProfile` getter 全仓库无人调用，`b2_toiTime/b2_toiCalls` 纯计数器 | **高**：idle self 13.4%、replay 5.8%（+Reset 2.0%）、每步 12~13 个 Date 对象与时钟调用消失 | 需证明中性 | `node --import tsx benchmark/perf-determinism.mjs --compare r0-baseline`（48 关位级）+ fixture runner 6/6（`node scripts/e2e/routetool/fixture-runner.mjs`）+ `node --import tsx benchmark/fidelity-score.mjs --compare` |
| **2** | **mechSnapshot() 中间对象消除**：直接写 RoomState 或复用快照对象（消灭 ~30 对象+数组/tick） | 中：chain 面分配大头（~16KB/tick 中的 sync 段）+ sync 自身 4.8µs 一部分 | 零风险（纯序列化侧） | 同上 det 门 + `node --import tsx benchmark/perf-sync.mjs --compare`（sync 段前后对照）+ fixtures |
| **3** | **`jumpSound` 闭包提升到模块级**（world.ts L242 → module const；空钩子语义不变，tsx keep-names 的 `__name` 包装随之消失） | 低-中：replay incl 1.6%/self 1.0%，idle 面 `__name`+`step` 关联开销 ~2-4% | 零风险 | det 门 + fixtures（同 #1） |
| **4** | **step() 返回数组复用**（`events`/`mechEvents` 预分配清空复用；调用方 ForestRoom.handleEvents 同步消费即弃） | 低（<1%） | 需证明中性（返回值生命周期契约变化，需核全调用方） | det 门 + e2e route（forest_01/04/12 repeat3） |
| **5** | **character/mechanisms 施力写路径 b2Vec2 复用**（character.ts L230/252-253、mechanisms.ts L665/674 的每步 `new B.b2Vec2` → 复用临时向量） | 低（<0.5% CPU，几 KB/s/世界） | 需证明中性（写值位不变，但触碰接触路径，必过 det） | det 门 + fixtures |
| 6 | SolveTOI/b2TimeOfImpact（18.0% incl 单族最大） | 高（若可减半） | **必漂**（迭代步数/保守推进任何改动都改 f64 序列）——禁动，除非用户特批并全量重录基线+fixture 容差重定 | 特批后：det --save 新基线 + fixture tolerance 重审 + oracle-gold 全网 |
| 7 | goog.base 构造链重构（contact 创建路径 4.1%，Closure 泛型分派开销） | 中（≤4%） | **必漂/高危**（vendor 内部手术，构造顺序影响池化行为）——禁动，除非用户特批 | 同 #6 全套 |
| 8 | RevoluteJoint 速度约束求解（7.2% self）与关节迭代序 | 高 | **必漂**——禁动 | 同 #6 全套 |

**位级中性类小结**：#1/#2/#3/#4/#5（其中 #1 收益最大且证据最完备）。
**必漂基线类**：#6/#7/#8——本档只登记，不动。
**附带低风险项**：服务器 50 世界并发下 GC 节奏由 #1+#2 自然改善，无需独立动作。

---

## 4. 数据表与原始件收容

| 文件 | 内容 |
|---|---|
| `tools/prof-kernel-idle.mjs` / `prof-kernel-replay.mjs` / `prof-server-chain.mjs` | 三负载驱动（HS_* 环境变量可调规模；回放驱动含路由→逐帧输入表转换，WIN 锚验证） |
| `tools/parse-profiles.mjs` | .cpuprofile/.heapprofile 解析聚合（self/incl 栈去重、分类、box2d 家族） |
| `tools/callers.mjs` | 调用者/被调者归因查询（栈逐样本重建） |
| `tools/agg-cpu-*.json` ×3 / `tools/agg-heap-*.json` ×3 | 解析后的聚合表（top25 self + top20 incl + 分类 + box2d 家族 / 分配 top20 + 分类） |
| `tools/raw/*.cpuprofile|.heapprofile` ×7 | 原始 profile（idle-20k/idle-400k/replay-60/serverchain-30k CPU；idle-400k/replay-180/serverchain-30k heap；单件 ≤316KB） |

复跑示例：

```bash
cd gyのFW
HS_STEPS=400000 node --import tsx --cpu-prof --cpu-prof-dir TEMP/hotspot TEMP/hotspot/..../tools/prof-kernel-idle.mjs
HS_REPLAYS=60  node --import tsx --cpu-prof TEMP/hotspot/... tools/prof-kernel-replay.mjs
node tools/parse-profiles.mjs <file.cpuprofile> 25
node tools/callers.mjs <file.cpuprofile> "b2Timer" callers
```

（TEMP/hotspot 已在收容后清理；tools/ 即全部可复跑资产。）

## 5. 存疑与挂账

1. **"内核热态 63µs/帧、31 整关回放/秒"（派发背景口径）**：本机实测主动物理 61~66µs/步（剖析器下）/ 约 16.3k 帧/s 路由回放（≈6.9 关/s 含 reset 与剖析开销；无剖析器热态 ≈39.5 关/s，其中 reset 重建 7.8ms/关）。与派发口径存在 2~4 倍出入，疑为不同负载口径/机器，已如实记录不裁决；以 bench 槽 r0 同机数字为准（scripted 档 forest_01 0.105~0.112ms/步、routeio 10.34 关/s）。
2. **heap-prof 字节归因**：V8 采样桶 512KB + 动态采样间隔，跨运行绝对字节不可比（差分法已证伪弃用）；本文分配结论以 --trace-gc 总量 + CPU/源码交叉为准。
3. **b2Timer 桩的"位级中性"是静态证据**（全部读写点审计：m_profile 只写、GetProfile 无调用方、toi 计数器无物理分支）——合入前仍必须跑完 #1 的三件验证命令，静态审计不替代门禁。
4. 负载 A（idle）`__name @kernel/world.ts` self 3.6% 高于 replay 面（1.0%）：idle 下世界睡眠、基数小，遥测/闭包占比放大所致；主动负载的表才是优化主依据。

## 6. 交接（handoff 同步条目见 note/handoff.md 顶部）

- 下一槽可直接执行：#1 b2Timer 桩（改动面=packages/shared/src/box2d/load.ts 一处 + 三件验证）、#2 mechSnapshot 消除、#3 jumpSound 提升；三件可独立提交、独立过门。
- #6/#7/#8 已列为必漂禁区；如用户特批，需按 r0 报告口径全量重录（det 新基线 + fixture 容差重审 + fidelity-score 对照）。
