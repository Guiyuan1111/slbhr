# 性能优化战役 · r2 第二轮实施报告（perfopt2 槽 · 世界构建吞吐 + 冷启动）

> 2026-10-18 · perfopt2 槽 · 基线 git `8d2b6d5`（r1 终态，报告 HEAD `264781b`）→ 本轮终态 `55d580b`，六件一件一 commit。
> 红线全程遵守：vendor 字节零改动（三件均为**求值后运行时覆写**，r1 b2Timer 桩同款手法）；oracle/fixtures 数据零接触；
> det 基线门禁每件后复跑全绿。**位级中性实测：det 48/48 逐关一致（vs r0-baseline，综合链哈希逐字相同）+ fixtures 6/6
> PASS（oracle 系 maxDev 24.5357/142.6879 与 r0 逐字同值，内核系四关 maxDev=0 维持）**。
> 改动面：`packages/shared/src/box2d/load.ts`（vendor 求值边界，三件）、`packages/shared/src/kernel/build.ts`（一件）、
> `packages/server/src/levels.ts`（一件）、`scripts/e2e/routetool/kernel.mjs`（一件，quarantine 最小 diff，§五披露）。
> 依据：`note/report/perf/2026-10-18-r0-baseline.md` §routeio/§load 与 `note/report/perf/2026-10-18-r1-optimization.md`（同机同环境）。

## 〇、六件总表

| # | 改动 | commit | 前 → 后（同机同口径） | 门禁 |
|---|---|---|---|---|
| 件1 | **接触池懒填**（load.ts：求值后覆写 b2ContactFactory.AddType，预填 256×7 接触对象→0，接触按需走 createFcn 既有耗尽回退路径） | `c3661b0` | **perf-routeio build 9.2~11.0 → 2.2~4.0ms（-66%~-78%）**；回放 12.14→13.15 关/s | det 48/48 + fixtures 6/6 |
| 件2 | **b2PolygonShape 构造/Copy 直达分派**（load.ts：构造器与 Copy 逐字节转写，goog.base 分发≡父类直调；复用原 prototype+静态成员全量随迁） | `e3c8d75` | buildLevelWorld 再减半（01: 1.01→0.53ms）；routeio build → 1.4~2.3ms（累计 -79%~-85%）；回放 →13.41 关/s | det 48/48 + fixtures 6/6 |
| 件3 | **build.ts 构建层分配削减**（六种静态顶点模板缓存；groundFixture 顶点一步落 b2Vec2；实体 run/液体带改轴对齐四角直构 quadFixture） | `b2b9c47` | build 段微降（带内 1.4~2.4ms）；构建期 GC 压力面收窄（多世界并发受益，见 §四 perf-mem） | det 48/48 + fixtures 6/6 |
| 件4 | **b2CircleShape 构造/Copy 直达分派**（load.ts：件2 同款；机关构建段 goog.base 主力） | `cfeb2f8` | **decompose2：bonus_2 mech 段 3.32→1.40ms（-58%）**、char×2 0.09→0.03ms；routeio build 均值 1.4~2.2ms（893/s） | det 48/48 + fixtures 6/6 |
| 件5 | **服务端关卡解析缓存**（levels.ts：loadLevel 逐关卡 LevelBundle 缓存，id 为键含 json，上界=关卡总数） | `130863a` | 房间创建/切关与多世界基准免逐次 readFileSync+JSON.parse+parseLevel（0.3~0.5ms/次；命中 p50 0.0001ms）；/api/level/:id 同享 | det 48/48 + fixtures 6/6（det 每关双世界自动覆盖共享路径） |
| 件6 | **routetool makeWorld 解析缓存**（kernel.mjs：locateLevel+parseLevel 结果按关卡 id 进程内缓存，最小 diff） | `55d580b` | **perf-routeio build 9.9~11.0 → 1.0~2.0ms（-82%~-90%，构建 110→1166/s=10.5×）**；回放 12.14→13.37 关/s | det 48/48 + fixtures 6/6 |

一件一 commit、独立过门；无回滚件。

## 一、STEP1 剖析证据（本轮假设修正：解析层不是大头，Box2D 构建链才是）

**复测（r1 终态）**：perf-routeio `--compare r1-routeio`——build 8.71~11.01ms/关（≈110/s），回放 11.91 关/s
（r1 快照 12.14 同带内）——b2Timer 桩对构建段无影响（桩只作用于 Step 链计时器，构建不走 Step）。

**makeWorld 分解**（TEMP 探针，5 关×200 次中位；关=01/04/12/bonus_2/15）：

| 段 | 耗时 | 占比 |
|---|---|---|
| locateLevel（readFileSync+JSON.parse 关卡+图块集） | 0.17~0.30ms | ~2% |
| parseLevel（全量解析） | 0.12~0.18ms | 1~2% |
| **new World（buildLevelWorld+mechanisms+Character×2）** | **7.34~14.44ms** | **95~97%** |

**new World 内部**：buildLevelWorld 占 94~97%（多数关）/buildMechanisms 2~4%（bonus_2 34%）/Character×2 1~2%。

**CPU profile**（node --cpu-prof，buildLevelWorld×1600 混 4 关）self 热点：

- **goog.base 74.5%**——Closure 运行时父类分发（`arguments.callee.caller` 反射慢路径）。caller 分布：
  **7 类接触构造器合计 ~64%**（b2CircleContact/b2PolygonContact/b2EdgeAndPolygon/b2ChainAndCircle/b2EdgeAndCircle/b2ChainAndPolygon/b2PolygonAndCircle 各 ~9%）
  ——根源是 **b2ContactFactory.AddType 在每个工厂（=每个 b2World）构造时 `b2MakeArray(256, …)` 预填 7 类接触各 256 个**：
  1792 次构造器+goog.base 分派+2×b2Manifold+2×b2ContactEdge 分配，是**关卡无关的固定构建成本**；
  b2PolygonShape 构造 6.2% + Copy 3.0%（每个多边形 fixture 走构造×2：polygonFixture 本体 + b2Fixture.Create 的 shape.Clone）。
- 其余：GC 5.6%、b2Contact 2.2%、b2DynamicTree.InsertLeaf 1.8%、b2PolygonShape.Set 1.4%、b2AABB.Combine2 1.0%。

**机关构建段独立 profile**（bonus_2×1500）：goog.base 46.8%，caller=b2CircleShape 构造 13.1%+Copy 7.3%
（球/滑轮/角色圆件，每圆形 fixture 构造×2）+ b2PrismaticJoint 2.1% + PrismaticJointDef 0.8%。

**冷启动（perf-load r2-load）**：硬口径与 r0 **逐字一致**——传输 4862KB/22req、reload 3KB、进 Game 累计 6898KB、页面错误 0；
分解：DCL 144~192ms → __fw 就绪 283~352ms → Menu active 704~808ms（本机轮内波动大，r0 1078ms 同类）；资源构成
script 1×23KB / other 2×339KB（解码 1573KB）/ XHR 19×4501KB（解码 4708KB，Phaser 资产管线）。大头=phaser 1.48MB 块
（10-08 R3 已评估拆分不值）。**结论：headless 可量化范围内无动作项，本轮不动启动路径**（纪律：不瞎改）。

## 二、机制论证（三件 vendor 运行时覆写为何位级中性）

手法与 r1 b2Timer 桩同款：vendor 文件字节不动，`loadBox2d()` 求值返回前覆写（早于任何 b2World/工厂构造，装载顺序安全）。

**件1 接触池懒填**——与 vendor AddType 逐语句同构，唯一差异=预填数 256→0（接触对象改为首次需要时现场构造，
走 createFcn 本就存在的池耗尽回退 `a(alloc)`；destroy→push 回池复用语义不变；register.pool 全仓库只在 AddType 内写、无读者）：
- createFcn 两条来源产出的对象都经同一入口 `Reset(fA,iA,fB,iB)` 进用（m_flags=e_enabledFlag 清 toi/filter 位、
  m_manifold.pointCount=0、m_nodeA/B 全清、friction/restitution 由 fixture 重混）；
- 首次 Update 的换位（old↔current）把 Reset 后的 pointCount=0 流形挪入 old 槽 → warm-start 读 oldManifold.pointCount=0，
  与构造器新对象完全同值——回用对象的旧流形在被读之前必已被换位+Evaluate 覆写（vendor Update @3986-4021 逐行核）；
- m_toi 仅在 e_toiFlag 置位（伴随重写 @7836）后被读（@7810），Reset 清位；SetTangentSpeed 全仓库无调用方；
- 池回用（destroy→pop）本就是 vendor 运行期既有路径（钻石体销毁→接触销毁→回池），r0/r1 det 基线即含此行为。

**件2/件4 构造与 Copy 直达分派**——Closure goog.base 两分支的静态等价改写：
- 构造分发 `goog.base(this, 常量参数…)` ≡ `caller.superClass_.constructor.apply(me, slice(args,1))` ≡ `b2Shape.call(this, …)`
  （b2PolygonShape/b2CircleShape 的 superClass_ 均为 b2Shape.prototype，goog.inherits 静态确定）；
- 方法分发 `goog.base(this, "Copy", a)` 走查从 `a.constructor` 起、命中首个超类实现 ≡ `b2Shape.prototype.Copy.call(this, a)`
  （走查链 b2PolygonShape→b2Shape 静态确定；其余字段语句逐序照抄，ENABLE_ASSERTS 恒 false）；
- 复用**原 prototype 对象**（instanceof 语义/静态 scratch Set.s_ps 等不变；prototype.constructor 仍指原函数，goog.base
  方法走查行为不变）；静态成员全量随迁（superClass_/base/ComputeCentroid；跳过严格模式毒属性 caller/callee/arguments）。

**件3 build.ts**——顶点数值与求值序逐操作同构（`p.x - ox` 同式），消除的只是中间 {x,y}[] 与二次 map；
b2PolygonShape.Set 只读输入数组并拷贝进自身 m_vertices（不持引用），共享静态模板安全。

**件5/件6 解析缓存**——LevelData 为纯定义数据：kernel 构建链只读不写（mechanisms/character/build 全量审计无
def/level 字段赋值）；`World.reset()` 整关重开本就复用同一 LevelData 实例重建世界——多世界共享解析产物的不变式既有；
det 门禁每关双 World（w1/w2）在缓存后自动覆盖共享路径，48 关全绿背书。

## 三、主指标前后表

**perf-routeio（12 路线，--compare r1-routeio → 终态快照 routeio-r2-routeio）**：

| 关 | build r1 → r2 | 回放帧耗 r1 → r2 |
|---|---|---|
| forest_01 | 9.88 → 1.01ms | 52.2 → 50.2µs |
| forest_02 | 9.61 → 1.20ms | 38.5 → 36.2µs |
| forest_03 | 9.65 → 1.45ms | 50.5 → 42.9µs |
| forest_04 | 9.62 → 1.23ms | 72.8 → 65.0µs |
| forest_05 | 9.94 → 1.29ms | 58.8 → 52.9µs |
| forest_06 | 10.67 → 1.75ms | 52.4 → 46.7µs |
| forest_06_1 | 10.39 → 1.55ms | 53.2 → 47.3µs |
| forest_07 | 11.02 → 1.98ms | 55.9 → 53.4µs |
| forest_12 | 10.74 → 1.81ms | 64.0 → 56.7µs |
| forest_15 | 9.20 → 1.11ms | 57.3 → 59.7µs |
| forest_26 | 10.81 → 1.79ms | 52.5 → 49.9µs |
| forest_32 | 9.48 → 1.15ms | 31.4 → 31.3µs |

汇总：**世界构建 110 → 1166/s（10.5×，-82%~-90%/关）；整关回放 12.14 → 13.35 关/s（+10.0%）**；
纯 step 29.9~74.3µs/f 与 r1 同带（步进物理链未动）。

**decompose2（World 构建内部分解，中位）**：buildLevelWorld 6.46~9.03 → 0.37~1.03ms；buildMechanisms
0.15~0.30 → 0.08~0.19ms（bonus_2 3.92 → 1.40ms）；Character×2 0.09~0.11 → 0.03~0.04ms。

**次级收益（同批快照）**：

| 基准 | r0/r1 → r2 |
|---|---|
| perf-step 48 关综合 | 0.0193（r1）→ 0.0181~0.0188ms（-3%~-6%：接触按需构造走快速形状，早期步进同步受益；forest_32_1 单关 -55.7%） |
| perf-sync | patch **347B/2646B 逐字不变**（协议零变化）；step/sync/enc 均在带内 |
| perf-mem 每 World 常驻 | forest_01 **2.9 → 0.69MB（-76%）** · bonus_2 **4.47 → 2.88MB（-36%）**（1792 预填接触对象消失） |
| perf-mem 创建销毁 | 12.76 → **3.97ms/World（78.4 → 251.6/s，+221%）**；heap 漂移中位 0.05MB 无泄漏 |
| perf-mem 50 并发峰值 | 01 Δ**152 → 35.2MB**（RSS 287→207）/ bonus_2 Δ**232 → 151MB**（RSS 375→289）；释放后回 17~20MB |
| perf-load | 硬口径与 r0 逐字一致（4862KB/22req、reload 3KB、0 错误）——客户端 bundle 未含内核（load.ts 不进 Vite 产物），本轮零影响 |

## 四、总验收（终态 55d580b）

- typecheck 零输出；vitest **85/85**；vite build ✓（3.85s，产物无回归）。
- det `--compare r0-baseline`：**48/48 位级一致**；fixtures：**6/6 PASS**（01/main 0、01/oracle-gold 24.5357、04 0、12 0、
  26/main 0、26/oracle-gold 142.6879——与 r0 逐字同值）。
- e2e 真机门禁（repeat3 × --offset -15）：forest_01 **ALL PASS**（winAt 39966ms 带）；forest_12 **ALL PASS**
  （winAt 13468ms 带）；forest_04 两组：组一 2/3（FAIL=died@17730ms）、组二 2/3（FAIL=died@17723ms）——
  两组 FAIL 均为 **~17.72~17.73s 同位死亡签名**，与 r1 报告 §五基线 A/B 实证的既有输入注入抖动（基线 a81cdb5 独立构建
  同率翻车、同 dying@17730ms 签名）完全同族；本轮 det 位级同 r0 → 服务端物理逐位未动，该 FAIL 不可能由本轮改动引起
  （归因沿用 r1 f04 先例，不另做 worktree A/B）。
- r2 存档：`benchmark/results/{routeio-r2-routeio, perf-r2-step, sync-r2-sync, mem-r2-mem, load-r2-load}.json`
  （第三轮 `--compare r2-*` 起锚；det 锚仍为 r0-baseline 不变）。

## 五、quarantine 披露与红线核对

- **kernel.mjs（r1 件4 改动面）**：本轮件6 为剖析证实的最小侵入（makeWorld 单函数 14 行净增，locateLevel/makeProvider
  导出与语义不动）——剖析显示 IO+parse 占 makeWorld 剩余成本 ~15%（件1-4 把构建压至 1~2ms 后占比放大），routeio build
  主指标与 autosearch/scan/optimize 单进程逐次试验直接受益。**未触碰** world.ts/b2.ts/mechanisms.ts/character.ts/
  ForestRoom.ts/fixtures/oracle/vendor 字节。
- load.ts 的三件覆写均在 `loadBox2d()` 返回前完成（早于首个 b2World 构造）；`b2()` 缓存单例保证仅执行一次。
- git：六件独立 commit（c3661b0→e3c8d75→b2b9c47→cfeb2f8→130863a→55d580b），无 co-author，无 add -A，无 reset。

## 六、剩余热点（下轮候选，数据在 r2 剖析档）

1. **宽相代理插入链 ~25~30%**（b2DynamicTree.InsertLeaf 12.0%+Combine2 8.3%+CreateProxy 3.8%+Balance 2.0%+AllocateNode
   1.6%）：随 fixture 数线性，vendor 必漂禁区（r1 hotspot 档结论），不动。
2. **b2PolygonShape.Set 凸包计算 ~8%+ComputeCentroid 1.5%**：vendor 算法本体，同上不动。
3. **关节类 goog.base**（b2PrismaticJoint 2.1%+Def 0.8%，bonus_2 档）：可做件2 同款转写，预计收益 <5%，本轮未做。
4. 冷启动：无可量化动作项（§一）；若未来网络环境变化，回看 r0 §六 60Hz 出站价签与 R3 拆分评估记录。

## 七、复现

```bash
node --import tsx benchmark/perf-determinism.mjs --compare r0-baseline   # 位级门（每件后均复跑全绿）
node --import tsx scripts/e2e/routetool/fixture-runner.mjs              # fixtures 6/6
node --import tsx benchmark/perf-routeio.mjs --compare r2-routeio       # 本轮主指标（构建/回放吞吐）
node --import tsx benchmark/perf-step.mjs --compare r2-step             # 步进面
node --import tsx benchmark/perf-sync.mjs --compare r1-sync             # patch 字节（锚不变）
node --expose-gc --import tsx benchmark/perf-mem.mjs --compare r2-mem   # 内存面（常驻/创建销毁/并发峰值）
node --import tsx benchmark/perf-load.mjs --no-build --compare r2-load  # 冷启硬口径
```

## 八、一句话总结

**世界构建 9.2~11.0ms → 1.0~2.0ms（-82%~-90%，110→1166 关/s=10.5×）——大头是 vendor 每个 b2World 预填 1792 个
接触对象的 goog.base 慢速分发（懒池）与多边形/圆形 shape 构造链（直达分派），三件求值后覆写 vendor 字节零改动；
附带每 World 常驻内存 -76%（2.9→0.69MB）、50 并发峰值 -77%（Δ152→35MB）、创建销毁吞吐 +221%、步进面 -3~-6%、
回放吞吐 +10%；解析缓存两件（服务端房间创建+routetool 试验环）消除同关卡重复 IO/解析；六件全部位级中性
（det 48/48 + fixtures 6/6 + patch 字节逐字不变），冷启动硬口径与 r0 逐字一致（无动作项）。**
