# r48 性能轮报告（2026-11-05）：选关菜单进度读取 + 四个方向的量化证否

分支 `perf/r44`，起点 `ad587f9`（r46 挂账关闭）。

**本轮换的角度**：前几轮都在量的「服务端物理步进」与「换关链」，本轮把镜头转到
**客户端选关菜单入场**——一段从未被任何一轮量过的路径；同时用新量具把「服务端物理
还能不能继续优化」这个问题一次性量到底，给出可复用的上限结论。

**本轮结论（诚实分面）**：

| 分面 | 结论 | 判定依据 |
|---|---|---|
| 选关菜单 `starsOf` 全量 parse | **微基准 −99.8%（22.4ms → 37.6µs），可主张** | 两臂 9 轮区间完全分离 |
| 同上，页面端 | **−7.5% ~ −14.9%，不可主张** | 两臂区间重叠（噪声带 ±10%） |
| 服务端物理 CPU 优化空间 | **已见底**：vendor 占 83–97%，自有内核合计 ~2–16% | 新量具 `perf-step-cpu` 五关实测 |
| 「关节卡限位 → 整岛不睡」 | **现象真实但不可修**，四个修法全部被位级门禁否决 | 见 §四 |

- 落点：`progress.ts` + 4 条新单测；`benchmark/` 三件新量具
- 门禁：typecheck 0 错；vitest **483/483**（原 479 + 新增 4）；det **241/241** 位级一致

---

## 一、主线：`starsOf` 每次全量 `JSON.parse`

### 1.1 问题

`progress.ts` 原实现：

```ts
export function loadProgress() {
  return JSON.parse(localStorage.getItem(KEY) ?? "{}") ?? {};
}
export function starsOf(filename) {
  return loadProgress()[filename]?.stars ?? 0;
}
```

每次 `starsOf` 都做一次 `getItem` + **全量 `JSON.parse`**。而选关菜单入场时它的调用
次数是 **O(关卡数)**，同一批文件被反复问：

| 路径 | 调用点 | 次数（forest, L=48） |
|---|---|---|
| tree（forest/light/ice/crystal） | `done` 扫描 | L |
| | 节点循环 | L |
| | 烘焙 `stateOf`（edges×2 + levels） | ~3L |
| | 平色回退扫描 | L |
| elements multi（7 庙 39 关） | `computeLearnedElements` | 39 |
| | 每庙 `completedCountOf` | 7×L |
| | `rowsLevelState` 循环 | 39 |
| | `templeHasNew`（内含 `rowsLevelState` + `completedCountOf`） | ~2×7×L |

### 1.2 量化（`benchmark/perf-progress.mjs`，node 微基准，同进程交替 A/B）

252 条存档（13.4KB），每次入场 332 次 `starsOf`，各 9 轮：

| 臂 | 中位 | 区间 |
|---|---:|---|
| A 每次 parse（原实现） | **22410.6 µs** | 21782.6–30930.3 |
| B 按原文串记忆 | **37.6 µs** | 32.5–274.4 |

**Δ −99.8%，区间完全分离 → 可主张。** 22.4ms 正是玩家点「开始」到看见关卡树之间
那段可感卡顿的直接成本。

### 1.3 改动

`loadProgress` 改为「按原文串记忆」：

```ts
let progressRaw: string | null = null;
let progressParsed: Record<string, LevelBest> = {};

export function loadProgress() {
  const raw = localStorage.getItem(KEY);      // 仍每次读串
  const text = raw ?? "{}";
  if (text === progressRaw) return progressParsed;  // 串没变 → 复用
  progressParsed = JSON.parse(text) ?? {};
  progressRaw = text;
  return progressParsed;
}
```

**为什么这样缓存安全**：每次仍读原文串，只有内容变化才重 parse——外部写入（另一个
标签页、本页 `saveBest`）都会被立刻看见，不存在读到陈旧数据。`getItem` 比 `parse`
低一个数量级，所以「比对串」远比「重新 parse」便宜。

**同时修掉一个缓存引入的风险**：`saveBest` 走「读-改-写」，命中缓存时拿到的是**缓存
对象本身**；若 `setItem` 抛错（配额满/隐私模式），缓存会被污染成"已写入"，后续读档
读到假成绩。改为 `const all = { ...loadProgress() }` 先复制。

### 1.4 四条语义边界（新单测钉死）

`progress.test.ts` 新增 4 条（13/13 全过）：

1. **外部写入立即可见** —— 绕过模块直接改底层串，下次 `loadProgress` 必须拿到新值；
2. **`saveBest` 后读到新值** —— 缓存随串自动失效；
3. **写入抛错不污染缓存** —— 配额满时再读仍是写前的真实存档；
4. **存档串损坏按空存档降级** —— 不抛错，后续写入仍能恢复正常。

### 1.5 页面端口径（`benchmark/perf-temple.mjs`，新量具）

真实浏览器、每轮新 context（冷缓存）、预置 252 条存档，测「点开始 → 关卡树可交互」：

| 臂 | 轮数 | total 中位 | 区间 |
|---|---:|---:|---|
| 基线 | 7 | **1147.0 ms** | 937.3–1229.0 |
| r48 | 7 | 975.9 ms | 917.3–1255.5 |
| r48 | 15 | 1060.8 ms | 874.1–1217.7 |

**区间重叠 → 页面端收益不可主张。** 这与 22.4ms 的微基准收益完全自洽：22ms 落在
1000ms 的入场路径里只占 2%，远小于该路径 ±10% 的噪声。

> 诚实交代：**这项改动的可主张收益只在 `starsOf` 这一段本身**（微基准口径）。
> 它是零风险垃圾减量（13/13 单测 + typecheck + det 全绿），但**不能说它让选关菜单
> 快了 15%**——那在噪声带内。

---

## 二、新量具 `benchmark/perf-step-cpu.mjs`：单步 CPU 自时间归因

r47 用 `HeapProfiler` 量的是**分配**；本件用 `Profiler`（samples + timeDeltas 聚合
self time）量**耗时**，补上「自有代码在单步 CPU 里到底占多少」这个此前只有整进程粗分
（r44：physics 22.4% / 自有内核 3.5%）的问题。

### 2.1 两个口径坑（已写进脚本头注）

**坑一：vendor 不能用 url 分类。** `box2d.js` 是 `new Function` 装载的，栈帧 url 恒为
空。首版按 url 分桶，结果全部物理帧掉进 `native/other`，得出「vendor 不耗时」的荒谬
结论（top1 是 `b2Island.Solve` 却归到 native）。改用函数名前缀 `box2d.` 为主判据。

**坑二：剖析器自开销必须从分母剔除。** 实测 profile 总时长可超过墙钟（2000 步墙
134ms、采样累计 174ms），差额正是 `node:inspector` 的采样写回开销。若混在分母里会
凭空稀释每个真实占比——首版因此把 vendor 从 93% 压到 71%。

### 2.2 结果：自有内核合计 2–16%，物理已见底

| 关卡 | 单步 | vendor | kernel(own) |
|---|---:|---:|---:|
| crystal_20 | 67.2 µs | 83.2% | 9.8% |
| light_23 | 80.6 µs | 77.7% | 11.9% |
| fairies-30 | 45.7 µs | 83.3% | 16.4% |
| fairies-06 | 47.2 µs | 87.3% | 8.1% |
| forest_bonus_2 | 1313.1 µs | **97.5%** | **1.5%** |

24 关随机抽样聚合（自有代码 top）：`world.step` 3.0%、`character.update` 1.2%、
`updatePortals` 1.1%、`mechanisms.checkState` 0.5%、`mechanisms.update` 0.4%。

**这就是本轮最重要的可复用结论**：在内核代码里做 percent 级微优化，收益上限被
vendor 的 83–97% 死死压住——这也解释了为什么 r44/r47 的 CPU 收益全部落在噪声带内。
后续若还要提性能，方向必须是「减少求解工作量」（物理语义，受复刻红线约束），
而不是「把自有代码写得更快」。

---

## 三、`forest_bonus_2` 单步 1313µs 的归因：不是浪费，是 792 个接触

本轮一开始被这个数字吸引（同内核，比 `crystal_20` 慢 19 倍）。归因结果：

| 关卡 | 动态体 | 静止 600 步后接触对 |
|---|---:|---:|
| forest_bonus_2 | 102 | **792** |
| crystal_20 | 16 | 26 |

`b2ContactManager.Collide` 每步要遍历全部接触做 AABB 更新与流形重算。这是关卡数据
固有规模（35 箱 + 47 平台），**不是实现缺陷**。

顺带核了一个看似可省的点：792 个接触里 **273 个（34.5%）是双方都已入睡的动态体之间
的接触**。但 vendor 本身已有短路（@6684 区 `if (i || j)`：双方都不醒时跳过 `TestOverlap`
与 `Update`，只走一次链表前进），所以这 273 个的每步成本已接近零。**放弃**。

---

## 四、四个被量化证否的方向（负结论，含证据）

### 4.1 「关节卡限位 → 整岛永不入睡」——现象真实，但不可修

**现象**：新量具 `benchmark/perf-sleep.mjs` 扫描全库 241 关，**15 关**存在「该睡没睡」
的体（`m_sleepTime` 已越过阈值 `b2_timeToSleep=0.5s` 却仍醒着）。典型
`forest_bonus_2` 的 5 个紧贴平台：速度 |v| ≤ 4.4e−16、`sleepTime` 涨到 14s、
**3000 步（50s）位移精确为 0**，却始终醒着。

**根因**（vendor @6087-6097）：岛入睡要求 **(a)** 所有体低速够 0.5s **且 (b)** 位置
约束全部收敛。被电机压在行程限位上的平台、以及互相挤压的紧贴平台，`SolvePositionConstraints`
每步都报「不收敛」→ (b) 恒假 → 整岛永不入睡，哪怕位形几千步逐位不变。

**上界量化**（配对 A/B，7 轮 × 500 步，B 臂=每步强制让静止体入睡）：

| 关卡 | 卡睡体/动态 | A 中位 | B 中位 | Δ | 判定 |
|---|---:|---:|---:|---:|---|
| ice_03 | 2 / 5 | 44.44 | 9.31 | **−79.0%** | 区间分离 |
| ice_03_1 | 2 / 5 | 40.43 | 9.22 | **−77.2%** | 区间分离 |
| elight_light-ez | 2 / 16 | 43.14 | 11.27 | **−73.9%** | 区间分离 |
| ecrystal_portal7 | 1 / 11 | 20.24 | 11.34 | −44.0% | 区间分离 |
| fairies-24-dark | 1 / 28 | 31.03 | 17.55 | −43.4% | 区间分离 |
| forest_bonus_2 | 5 / 102 | 236.5 | 241.25 | +2.0% | **带内** |

**修法尝试（全部否决）**：

1. **「本步位形逐位不变即准许入睡」** —— 覆写 `b2Island.prototype.Solve`（不动 vendor
   字节，与 `stubB2TimerTelemetry` 同款）。**det 门 13 关漂移，否决。**
   复核发现：所有触发的岛都含静态体（`forest_bonus_2` 222/222、`fairies-24-dark` 570/570）。
2. **「排除含静态体的岛」** —— 收紧后放行次数**归零**。原因：平台通过 prismatic/distance
   关节**直接连到 ground**，box2d 的岛构建必然把它并入同一岛
   （实测 `ice_03` 孤岛组成 = `[dynamic, static(ground), dynamic]`）。判据永不触发。
3. **「只放行纯动态岛」** —— 同上，8 关实测 `fires=0`，位级虽"一致"但毫无意义。
4. **「依赖唤醒路径兜底」** —— 核实 `ApplyForce`/`SetMotorSpeed` 同值调用确实会唤醒体
   （vendor 7284/7290、1660），唤醒路径完好；但入睡导致的**当帧求解跳过**仍改变轨迹。

**结论**：这是 box2d 岛构建语义下的固有行为，原版同构（oracle `updateState`
逐字相同）。**放弃，不修。**

### 4.2 「光束签名收窄到只含可挡光体」——前提错误

`light_23` 里 `b2DynamicTree.RayCast` 占单步 **14.8%**，而该关只有 1 个 beamer。
r12 已有缓存门（签名稳定则复用折线），实测**签名稳定率 0%**（120 步全不稳定）——
因为签名覆盖全部 12 个动态体，角色每帧在动。

看似可收窄：12 个动态体里只有 5 个带 `lightProperties`。**但读完 raycast 回调
（`mechanisms.ts` `rcCtx.cb`）发现前提错了**：无 `lightProperties` 的 fixture 走
`if (!lp) { h.hit = true; ... }` —— 它们被当作**不透明实体挡住光束**。它们的位置
确实会改变命中点，签名必须包含它们。**原实现是对的，收窄会改变光路。**

### 4.3 「服务端 `syncState` 的 `String(id)` 分配」——量级可忽略

微基准：`String(i%100)` 5.92 ns，预计算查表 2.45 ns。每 tick 约 100 次 →
**省 0.35 µs/tick**。tick 预算 16667 µs，占比 **0.002%**。**不值得动。**

### 4.4 「`getSettings()` 每次 JSON.parse」——不在热路径

全部 12 处调用点都在菜单/场景初始化（`menus.ts` 按钮构建、`GameScene.create`、
`main.ts` 音效门），**没有一处在逐帧路径上**。**不构成问题。**

---

## 五、量具噪声底披露（重要）

`perf-sleep.mjs` 的配对 A/B 里，**对照组（226 个无卡睡体的关）平均 Δ 也是 10.6%，
其中 81 关标为"区间分离"**——正常应为 0。

这说明该量具在单关上的噪声底约 **±10%**，个别关甚至能假阳性到"区间分离"。因此：

- `ice_03` 那类 −79% / −77% / −74% **远超噪声底**，现象是真实的；
- 但 ±15% 以内的单关数字**一律不可采信**；
- 上一轮（r47）「单步 CPU 全部带内」的结论与本次噪声底量级一致，互为印证。

---

## 六、复现

```bash
# 主线：选关菜单进度读取（微基准，同进程交替 A/B）
node --import tsx benchmark/perf-progress.mjs
N=332 ENTRIES=252 ROUNDS=9 node --import tsx benchmark/perf-progress.mjs

# 主线：页面端口径（冷缓存，每轮新 context）
npm run build
ROUNDS=15 node --import tsx benchmark/perf-temple.mjs --save r48-opt-15

# 新量具：单步 CPU 自时间归因
LEVELS=crystal_20,light_23,fairies-30 node --import tsx benchmark/perf-step-cpu.mjs

# 新量具：全库「该睡没睡」扫描 + 配对 A/B 上界
node --import tsx benchmark/perf-sleep.mjs --save r48-baseline

# 门禁
npx tsc -b && npx vitest run
node --import tsx benchmark/perf-determinism.mjs --compare r44-full
```

---

## 七、环境与口径披露

- 机器：Linux 7.0.0-38-generic x64，node v22.22.1，Chromium（Playwright，headless SwiftShader）。
- 微基准 `perf-progress`：`JSON.parse` 是引擎原生实现，node 与浏览器同源；`localStorage`
  用内存桩。两臂同进程交替，消除进程间 JIT/频率差异。
- 页面端 `perf-temple`：每轮新 browser context（冷缓存 + 干净 localStorage），
  预置 252 条存档使 `starsOf` 成本落在真实上限；里程碑用页内 `performance.now`。
- CPU 归因：`Profiler.setSamplingInterval` 50 µs，只覆盖步进窗口；剖析器自开销独立成桶
  并从分母剔除（见 §2.1）。
- 未改 vendor `box2d.js`；本轮所有物理侧尝试均已撤回，det 241/241 与改前逐位一致。
