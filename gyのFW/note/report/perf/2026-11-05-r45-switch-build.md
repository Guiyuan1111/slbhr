# r45 性能轮报告（2026-11-05）：换关链双重构建消除 + b2Island 惰性预分配

分支 `perf/r44`（沿用，本轮提交在 `c0f2181` 之后）。本轮换了优化点：从 r44 的「逐帧
免分配」转到**换关链（World 构建）**，这是 r44 报告里明确挂出的下一候选。

- 起点：`c0f2181`（r44 收口）
- 落点：`da871b0`（换关链）、`271ce12`（lazyIsland + 构建纯基准）
- 门禁：typecheck 0 错；vitest 479/479；det 241/241 位级一致

**本轮有可主张的正向收益**（与 r44 的"不可量化"不同）：
换关链 **−48.8%**（配对 A/B，噪声上界 6.2%），World 构建 **−15.4%**，
单 world 常驻内存 **−27.9%**。

---

## 一、两个发现（一个性能、一个复刻性）

### 1.1 `advance` 对同一关构建两次 World（性能）

`ForestRoom.onMessage("advance")` 原为：

```ts
this.bundle = loadLevel(id);
this.buildWorld();        // ← 按新关整建一次（b2World + 全机关 + 双角色）
/* ... 清空 20 张状态表 ... */
this.restartLevel();      // ← world.reset() 又整建一次
```

`restartLevel()` 第一行就是 `this.world.reset()`，而 `reset()` 会重新
`buildLevelWorld` / `buildMechanisms` / `new Character` ×2。**第一次建的 World 从未被使用**，
直接成为 GC 垃圾（vendor 无 `DestroyWorld`，两个旧 b2World 都交 GC）。

全库均摊：单次构建 1.43ms，双重构建 2.85ms —— **每次换关白付一整次构建**。

### 1.2 `World.reset()` 丢失 `startFrozen` 初始冻结（复刻性缺陷）

修 1.1 之前必须先解决一个陷阱：`reset()` 与构造器**当时是两份几乎重复但不等价的代码**，
构造器末尾有：

```ts
for (const liq of this.built.liquids) {
  if (liq.startFrozen && liq.liquidType === GROUND_TYPE.WATER) this.freezeLiquid(liq, startEvents);
}
```

而 `reset()` 没有这段。oracle 语义（`States/Level/Devices/Liquid.js`）是构造尾
`if (f.startFrozen) _.delay(this.initialFreeze, 10)`。

实测确认（构造 vs 构造后 reset，各跑 30 步）：

| 关 | 构造 +30 步 | reset +30 步 | 结果 |
|---|---|---|---|
| ice_02 | `-F---` | `-----` | ✗ 丢失 |
| ice_04 | `F--` | `---` | ✗ 丢失 |
| ice_31 | `-FF-` | `----` | ✗ 丢失 |
| ice_35 | `F` | `-` | ✗ 丢失 |

受影响共 **10 关**：`eice_1` `ice_02` `ice_04` `ice_04_1` `ice_07_1` `ice_12` `ice_14`
`ice_31` `ice_35` `ice_35_1`（含 55 型冰面砖）。

而这些关的 **retry 与 advance 都走 `reset()`** —— 也就是说玩家在 ice_02 死一次点重试，
冰面就不再是初始冻结状态，与原版不符。这是本次做性能时**顺带发现的既有复刻性缺陷**。

> 值得记一笔：**det 门禁完全不覆盖 reset 路径**（`perf-determinism.mjs` 只 `new World`），
> 所以这个缺陷此前从未被任何门禁抓到。本轮已补门禁（见 §四）。

---

## 二、改动

### 2.1 `da871b0` 换关链消除双重构建

- `World.reset(level?)` 支持改绑关卡；`reset` 与构造器抽出**同一条构建链**
  （构造器改为 `this.respawn = new RespawnManager(this); this.reset();`），
  并把 `startFrozen` 初始冻结补进这条共用链——一处修复同时消除重复代码与 1.2 的缺陷。
- `ForestRoom.restartLevel(nextLevel?)` 接受目标关；`advance` 改为
  `restartLevel(this.bundle.level)`，删掉那次白付的 `buildWorld()`。
- `buildWorld()` 保留给 `onCreate`（首次建房间）。

### 2.2 `271ce12` b2Island 惰性预分配

vendor `b2Island` 构造器一次铺满 5×1024 槽：

```js
this.m_bodies = new Array(1024),
this.m_contacts = new Array(1024),
this.m_joints = new Array(1024),
this.m_positions = b2Position.MakeArray(1024),
this.m_velocities = b2Velocity.MakeArray(1024)
```

后两者是 1024 个对象 ×2。实测单个空 `b2World` 占 **224 KiB**，其中 island 约
**185 KiB（83%）**——而真实关卡同时活跃的岛体数远小于 1024（全库最重关
`forest_bonus_2` 也只有百余刚体）。

改法（`packages/shared/src/box2d/load.ts` 新增 `lazyIslandPrealloc`，沿用已有的
`stubB2TimerTelemetry` / `lazyContactPoolPrefill` / `fastPolygonShapeDispatch` 覆写先例）：
构造器从空数组起步，只改**初始容量、不碰任何方法体**。`Initialize` 本就有增长分支
（`while (m_bodies.length < a) push null`、`if (m_positions.length < a) 扩到 max(2*len, a)`），
`Solve`/`Report` 只读写 `[0, m_bodyCount)` 区间，该区间在 `Initialize` 后必已存在。

**踩到的坑**：vendor 方法体直接引用 `box2d.b2Island.s_timer` / `s_solverData` 等静态成员。
第一版覆写只换了构造器与 prototype，漏搬静态成员 → 首次 `Solve` 崩
（`TypeError: Cannot read properties of undefined (reading 'Reset')`）。现已逐个搬运。

---

## 三、量化结果

### 3.1 换关链（`benchmark/perf-switch.mjs`，241 关 × 9 轮，两臂交替）

| 指标 | legacy（修复前语义） | current（修复后） | 变化 |
|---|---:|---:|---:|
| 全库均摊 | 2.207 ms | 1.104 ms | **−1.103 ms（−50.0%）** |

分部（中位 legacy → current）：

| 部 | 关数 | legacy | current | 省 |
|---|---:|---:|---:|---:|
| forest | 48 | 2.777 ms | 1.254 ms | 1.523 ms（−54.8%） |
| ice | 51 | 2.549 ms | 1.273 ms | 1.275 ms（−50.0%） |
| crystal | 36 | 2.578 ms | 1.236 ms | 1.342 ms（−52.0%） |
| light | 40 | 2.294 ms | 1.153 ms | 1.141 ms（−49.7%） |
| elements | 35 | 2.092 ms | 1.025 ms | 1.067 ms（−51.0%） |
| fairytales | 31 | 2.225 ms | 1.210 ms | 1.014 ms（−45.6%） |

**配对 A/B（内容回退法，4 轮/臂交替，对比 `c0f2181`）**：

```
A 修复前 legacy 中位: 2.284ms  臂内散布 0.141
B 修复后 current 中位: 1.169ms  臂内散布 0.059
Δ = -48.8%   噪声上界（最大臂内散布/A）= 6.2%
→ 超出噪声，可主张 ↓ 快 48.8%
```

### 3.2 纯构建（`benchmark/perf-build.mjs`，241 关 × 7 轮）

| 口径 | 合计中位 | 每关均摊 | 单 world 常驻 |
|---|---:|---:|---:|
| r44 基线（`c0f2181`） | 420.87 ms | 1.746 ms | 895.5 KiB |
| 换关修复后、无 lazyIsland（`da871b0`） | 434.01 ms | 1.801 ms | 896.9 KiB |
| **r45 当前（`271ce12`）** | **367.09 ms** | **1.523 ms** | **649.9 KiB** |

- lazyIsland 单独归因：**434.01 → 367.11 ms（−15.4%）**、**896.9 → 646.6 KiB（−27.9%）**。
- 六轮交替 A/B：A 411–433 ms / B 364–375 ms，**两臂分布完全不重叠**。
- 换关修复本身不改单次构建耗时（434 vs 421 的差是时段漂移，两臂散布 72–89ms 覆盖了它），
  它的收益体现在「换关只建一次」——即 §3.1。

### 3.3 复刻性门禁（`startFrozen`）

`perf-switch.mjs` 内置断言：10 个含 55 型冰面砖的关，构造路径与 reset 路径的
冻结位串必须相同。**修复前 0/10，修复后 10/10。**

---

## 四、门禁加固：填补 reset 路径的空白

`perf-determinism.mjs` 原来只 `new World(level)`，**`reset()` 路径完全没有覆盖**——
这正是 §1.2 缺陷能长期存活的原因。本轮新增第三路哈希 `switched`：

```js
const w3 = new World(loadLevel(id).level);
w3.reset(loadLevel(id).level);
const switched = chainHash(w3, "scripted");   // 必须与 scripted 逐位相同
```

- 这是**自洽断言**（不依赖历史快照），任何 reset/构造不等价都会立刻暴露。
- 实测：`✓ reset 改绑路径与构造路径逐位等价（241 关）`。
- 同时保留原锚对比：`✓ 全部 241 关位级一致（对比 r44-full）`。

另新增换关等价性验证（`TEMP/switchcheck.mjs`，一次性探针）：复用世界
`reset(目标关)` vs 全新 `new World(目标关)`，241 关 × 300 步逐体哈希 → **241/241 一致**。

---

## 五、本轮试过但**回退**的候选（负结论入库）

### 5.1 groundFixture / quadFixture 顶点 scratch 复用 —— 带内，回退

子 agent 分析给出的首要候选：把每 fixture 的 `new B.b2PolygonShape()` + 4 个
`new B.b2Vec2` 换成模块级 scratch + `SetXY` 直写。

- **隔离实验**（326 个同尺寸 quad 的极端场景）：1.826 → 1.476 ms，**−19.2%**。
- **`-0` 陷阱实证**：vendor `b2Vec2` 构造器是 `(this.x = a || 0)`，把 `-0` 归一成 `+0`；
  而 `SetXY` 直写保留 `-0`。裸 SetXY 在 `[-0,0,0,-0]` 类输入上产生**位差**
  （7 组用例 2 处位差）；补 `|| 0` 后逐位相同。位级安全性可以做到。
- **但真实全库构建里测不出收益**：8 轮交替纯构建 A/B，
  基线中位 199.54ms / scratch 中位 200.89ms，**Δ +0.68%，噪声 7.94% → 带内**。
  隔离实验的 19% 是「326 个同尺寸 quad 独占」的场景，真实关卡混合了大量
  `CreateFixture` 的 vendor 开销（每 fixture ~6.1 KB，占构建分配 ~74%），把自有侧的
  顶点构造稀释掉了。

按 r44 报告确立的纪律（*percent 级优化若无法在同会话配对 A/B 中超出臂内散布，
就如实判「不可量化」而不是挑一次最好看的结果上报*），**已回退**。

### 5.2 ground shape 模板 WeakMap 缓存 —— 未实施

子 agent 估「buildLevelWorld −25%」。未实施理由：§5.1 已证明自有侧顶点开销在全库
口径下不可见；模板缓存还要引入按 `LevelData` 的 WeakMap 生命周期管理与 256 KiB/关的
缓存体积，收益/复杂度比不成立。

### 5.3 旧 b2World 未释放 —— 不是问题

原以为 vendor 无 `DestroyWorld` 会导致换关累积泄漏。实测连续换关 50 次、GC 后净堆
增量仅 **5.87 MiB**（若真累积 50×0.65 MiB 应为 ~32.5 MiB），说明旧 world 能被正常回收。
**不构成问题，不做改动。**

---

## 六、方法论沉淀（本轮新增两条）

1. **构建期改动必须用"纯构建口径"判定，不能用换关链口径。**
   同一个 lazyIsland 优化，在 `perf-switch`（每轮含 60 步物理）下只有 −3.4%（带内），
   在 `perf-build`（纯 241 关构建）下是 −15.4%（两臂完全不重叠）。物理步进把构建
   占比稀释了近 5 倍。已把这条写进 `perf-build.mjs` 头注并固化为独立量具。

2. **修性能之前先确认两条路径是否真的等价。**
   `advance` 的双重构建看起来是"删掉一行"的纯冗余，实际删之前发现 `reset()` 与构造器
   不等价（`startFrozen` 缺失）。如果直接删掉 `buildWorld()`，会把这个差异从
   "retry 时丢失冻结"变成"换关时也丢失"——**扩大**了缺陷面。正确顺序是先统一两条
   构建链，再删冗余。

---

## 七、复现

```bash
# 换关链（含 startFrozen 断言）
PERF_SWITCH_ROUNDS=9 node --import tsx benchmark/perf-switch.mjs --save r45-final

# 纯构建（含 --mem 常驻测量，需 --expose-gc）
node --expose-gc --import tsx benchmark/perf-build.mjs --mem --save build-r45

# 位级门禁（含 reset 路径自洽断言）
node --import tsx benchmark/perf-determinism.mjs --compare r44-full
```

产物：`benchmark/results/switch-*.json`、`build-*.json`。

---

## 八、环境与口径披露

- 机器：Linux 7.0.0-38-generic x64，node v22.22.1。
- `perf-switch`：每关两臂各 `new World(基准关) → 跑 60 步 → 换关`，交替 ROUNDS 轮取中位；
  「legacy」臂显式复刻修复前的双建语义（`new World(next) + reset()`），
  「current」臂走 `reset(next)`——**两臂在同一进程内相邻执行**，消时段漂移。
- `perf-build`：241 关按 id 序整轮构建，预热 30 关，取 7 轮中位。
  内存面用 GC 前后堆增量 / world 数（`--expose-gc`）。
- 所有 A/B 判定沿用 r44 纪律：**臂内散布 ≥ 臂间差时明确拒绝给结论**。
