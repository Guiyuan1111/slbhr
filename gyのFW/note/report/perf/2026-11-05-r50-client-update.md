# r50 · 客户端逐帧零分配化 + r45 stash 处置（2026-11-05）

> 战役总账见 [2026-10-18-campaign-summary.md §四十七](2026-10-18-campaign-summary.md)。
> 前轮：[r49 选关树烘焙内核](2026-11-05-r49-tree-bake.md)。
> 配套：[stash@{0} 处置档](2026-11-05-r50-stash-disposition.md)。

## 本轮换的角度

前 49 轮的性能量具覆盖了：服务端物理单步（`perf-step`）、分配（`perf-server-alloc`）、
换关链（`perf-advance`/`perf-switch`）、选关菜单入场（`perf-temple`）、树烘焙
（`perf-bake-cpu`/`perf-bevel`）——**唯独没有一件拆过客户端 `GameScene.update` 内部**。

r47 量到「客户端逐帧分配 86.8% 在 Phaser 内部」，但那是**总量**口径，无法定位自有代码
里还有没有可消除的分配。r50 补上分段量具，并按结构定位到两处。

## 50.1 新量具 `perf-update.mjs`：`GameScene.update` 13 段分解

真浏览器 + 双人开局，页内 `performance.now()` 逐段累计，仅 `started` 相位。

**`forest_bonus_2`（结构最重关），3 轮 × 200 帧：**

| 段 | µs/帧 | 占比 |
|---|---:|---:|
| `updateMechs` | **123.5** | **57.7%** |
| `updatePlatformSound` | **40.5** | **18.9%** |
| `updateNavies` | 13.0 | 6.1% |
| `updatePlayers` | 11.5 | 5.4% |
| `updateDiamonds` | 2.5 | 1.2% |
| `drainSfx` | 2.0 | 0.9% |
| `updateFairies` / `updatePortals` / `drawDarkness` | 1.0 / 1.0 / 1.0 | 各 0.5% |
| `flushFairyDrag` / `updateTutorial` | 0.5 / 0.5 | 各 0.2% |
| `updateDust` | 0 | 0% |
| `__unaccounted` | 17.0 | 7.9% |
| **update 全程** | **214.0** | 100% |

`updateMechs` + `updatePlatformSound` = **76.6%**，且**两者都在遍历 `st.platforms`**。

### 两个量具坑（都花了调试时间，已写入实现注释）

**坑 1：包装原型上的 `update` 完全无效。** Phaser 在 `SceneManager.bootScene` 里
`sys.sceneUpdate = scene.update`（`phaser/src/scene/SceneManager.js:636-638`），
这是 `create()` 结束后的**一次性快照**，之后每帧调 `sys.sceneUpdate`，不再走原型链。
首版只包 `Object.getPrototypeOf(scene).update`，实测 `calls: 0`，采集 0 帧。
正确做法：包**实例**的 `update` 并重指 `sys.sceneUpdate`。
（12 个分段方法走 `this.xxx()` 原型链调用，包原型有效——两类要分开处理。）

**坑 2：单页进不了 `started`。** 本游戏是服务端权威双人房，
`ForestRoom` 要求双人到齐 → ready 2s → started。首版只开一个 page，在 Menu 卡 40s。
沿用 `scripts/e2e/lib.mjs` 的 `enterAs` 双页流程后正常。

## 50.2 主线：两处逐帧对象分配

### (a) `stepPlatSnd` —— 每帧每平台新建位姿对象

```js
this.platformSounds.update(id, {
  x: Number(b.x) || 0,
  y: Number(b.y) || 0,
  angle: Number(b.angle) || 0,
});
```

`PlatformSoundTracker.update` 只读 `pose.x/y/angle` 三个数，**不持有引用**
（`platformSound.ts:44`：首见把三值拷进 `Track`，之后只做差值比较）。
`forest_bonus_2` 47 平台 × ~60fps = **2820 对象/秒**。

改为实例级 `platPoseScratch` 复用。复用安全性：`forEach` 串行调用，前一次 `update`
已把三值拷进 `Track` 才返回，下一次覆盖 scratch 不影响任何已存状态。

### (b) `updatePortals` —— 每帧新建闭包

```js
st.portals?.forEach?.((s, idx) => { /* 捕获 anyOpen */ });
```

改为绑定回调 `cbPortals` + 成员标志 `portalAnyOpen`（与 r3 已采用的 `cbXxx` 同一模式）。

## 50.3 量化：主指标是确定性的

新量具 `perf-update-alloc.mjs`，主指标用**对象实例身份计数**（把 `update` 桩收到的
每个 `pose` 塞进 `Set`，`Set.size` = 不同实例数）：

| 臂 | 不同位姿对象实例数（28200 次 update） |
|---|---:|
| A 改造前 | **28,200** |
| B 改造后 | **1** |
| | **−100%（每次 update 少建 1 个对象）** |

**这是确定性事实，不依赖统计判据。** 两臂写入结果逐项一致（语义等价由量具断言）。

耗时口径（9 轮交替）：A 2.20ms → B 0.60ms（−72.7%），但区间重叠
（A [1.81–28.38] / B [0.48–4.96]）→ **带内，不主张**。

> 按 r47 纪律：分配与 CPU 分开记账。本轮可主张的是**分配消除**，不是「update 变快了」。

### 口径坑：堆差对短命对象失明

首版用 `--expose-gc` + `heapUsed` 前后差，两臂几乎相同
（**2,034,416 vs 2,034,560 字节**）。原因：V8 把短命对象分配在 new space，
回收后堆差归零。这与 r47 记录的「typed array 大块对采样器失明」是同类问题——
**堆口径对短命对象失明**，必须改用实例计数。

## 50.4 探测后判定不做：静态资源压缩

新量具 `perf-static.mjs`（真 HTTP 口径，不是 mock 中间件）。基线：

| 文件 | 大小 | cold | warm | revalidate(304) |
|---|---:|---:|---:|---:|
| phaser chunk | 1448KB | **112.24ms** | 12.04ms | 0.46ms |
| index chunk | 136KB | 8.88ms | 1.77ms | 0.48ms |
| colyseus chunk | 126KB | 6.85ms | 1.64ms | 0.46ms |
| temple json | 9KB | 2.64ms | 0.75ms | 0.47ms |
| **首屏 3 chunk 并发** | 1709KB | **88.96ms** | 12.21ms | — |

拆开看 `staticGz` 的三处同步操作（1.4MB phaser chunk）：

| 操作 | 中位 |
|---|---:|
| `readFileSync` | 0.87ms |
| `brotliCompressSync` q5 | **23.91ms** |
| `gzipSync` level 6 | 27.01ms |

**判定不立项**，理由：

1. **这是一次性成本。** 服务是 systemd 长期运行；压缩每个文件只在 `compCache` 冷时发生
   一次。全量 280 文件预热合计 brotli 77ms + gzip 62ms，首屏 3 chunk 约 67ms。
2. **收益上限小。** 预压缩（`listen()` 前做完）能让请求路径省掉 24ms/文件，
   但代价是启动慢 67ms，且只影响「服务重启后的第一个玩家」。
3. **与 r49 的教训一致**：别为一次性成本做复杂优化。r49 已量化过
   「内核 −27.8% 在 headless 页面口径只兑现 −0.1%」——优化必须打在**持续成本**上。

`staticGz` 的其余可疑点也逐项排除：
- `statSync` 每请求 0.95µs（p95 1.71µs）→ 1000 请求/秒也只占 0.10% CPU，不是问题。
- `compCache` 无上限，但全量 br+gz 常驻仅 **1.3MB**（单 world 常驻 646KB 作参照），
  没有淘汰需求。

## 50.5 顺带完成：r45 stash@{0} 处置

详细证据见 [stash@{0} 处置档](2026-11-05-r50-stash-disposition.md)。摘要：

**结论：丢弃**（已执行 `git stash drop`，ref `3eeeec7` 可追溯）。

**但 r45 报告的数字是错的**，必须勘误：

| | r45 报告 | r50 实测 |
|---|---|---|
| 241 关聚合 | +0.68%（噪声 7.94%）「带内」 | **−1.43%**，CI95 [−7.63, −1.75]，t=−3.22，符号检验 p=0.0022 |
| 空对照 | 无 | Δ +0.14%，t=0.90，CI 含 0 → 量具无偏 |

即 r45 当年是**测量力不足**（单次 8 轮的臂内散布 ~80ms 远大于 4.7ms 信号），
不是「效果为零」。

**但结论仍然成立**，因为真实工作单元是**单关**：
`World.reset(level)` 每次只建一关，241 关的 −4.69ms 摊到单关是 **0.019ms/关**，
而单关构建本身 1.5–2.7ms、单轮散布 0.6–16ms。主 agent 亲自复跑单关口径
（`forest_bonus_3`，40 轮）：scratch 2.32ms vs 原版 2.67ms，两臂散布均 ~10ms。

另有 r45 报告的一处**描述错误**：它写「把 `new b2PolygonShape()` + 4 个 `new b2Vec2`
换成 scratch」，但代码里 `new B.b2PolygonShape()` 仍在——该改动只消除 `b2Vec2`。

**方法论产出**：判定构建期改动用哪件量具，取决于**生产的工作单元**。
241 关全量是基准口径（适合发现方向），判定必须回到单关（真实调用粒度）。
r45 用全量口径得出「带内」、r50 用全量口径得出「−1.4%」，都是同一个偏差的两面——
**口径选错会让一个真实但无用的效果看起来像可优化项**。

## 50.6 门禁

| 门禁 | 结果 |
|---|---|
| `npx tsc --noEmit` | 0 错误 |
| `npx vitest run` | **509/509** |
| `det --compare r44-full` | **241/241 位级一致** |

## 50.7 遗留与下一步候选

- **`updateMechs` 仍是 57.7%（123.5µs/帧）**，但逐项核对：`cbPlatforms`/`cbProps`/
  `mechSmoother` 都已是零分配（`MechanismSmoother` 复用 `this.out`，r47 同款修法已在位）。
  剩余成本是 16 类机关的 `forEach` + `Map.get` 本身的固有开销，需要按类拆细才能继续。
- **`updatePlatformSound` 与 `updateMechs` 重复遍历 `st.platforms`**（47 次/帧 × 2）。
  合并可省一趟，但会让 `stepPlatforms` 承担声音副作用、且改变调用顺序
  （`updatePlatformSound` 在 `update` 末尾）——收益与风险比不成立，**本轮未做**。
- `staticGz` 冷压缩 24ms/文件（一次性）——不立项，理由见 50.4。
