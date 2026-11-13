# r44 性能轮报告（2026-11-05）：六部全库纳入 + 内核/客户端逐帧免分配

分支 `perf/r44`（自 `release/1.0-forest` 切出）。本轮首次把**全部 241 关**（forest 48 /
light 40 / ice 51 / crystal 36 / elements 35 / fairytales 31）纳入统一性能口径，并补上
前三部之外从未有过的位级锚。

- 基线提交：`6c65c8d`（WIP 收容）→ `3a57b13` 起算改动
- 收口提交：`c769ad5`
- 门禁：typecheck 0 错；vitest 479/479；det 241/241 位级一致

---

## 一、本轮做了什么

| # | 提交 | 优化点 | 改动面 |
|---|---|---|---|
| 1 | `3a57b13` | 仙女拖拽关节目标原位改写 + ApplyForce 入口收拢 | `mechanisms.ts` |
| 2 | `c5115dd` | Beamer 复用帧 `lightAt` 原位改写（免每帧每 sensor 新建对象） | `mechanisms.ts` |
| 3 | `ee01ba8` | 客户端「快照键 → 视图」解析首见缓存（传送门/仙女/仙杯） | `GameScene.ts`、`sceneState.ts` |
| 4 | `08d5cf5` | **补落**内核免分配三件（仙女位置缓冲 / 传送门载体表 / 锁回调单例） | `world.ts` |
| 5 | `c769ad5` | 客户端逐帧分配削减（腿部键布尔化 / 掩膜指纹数值化 / 浮尘早退） | `GameScene.ts`、`sceneState.ts` |
| — | `9f9fd25` | 顺带修复：font-subset census 清单刷新（**既有失败**，非本轮回退） | `scripts/font-subset/used-chars.json` |

> **勘误（重要）**：`3a57b13` 的提交信息列了 `world.ts` 改动，但实际只提交了
> `mechanisms.ts`——内核那三件在 `world.ts` 里并未落地（`world.step` 仍在每帧分配仙女
> 位置数组与锁闭包，`updatePortals` 仍在每帧新建载体表）。本轮的 `08d5cf5` 是补落，
> 不是新增优化。这条已在本报告与提交信息中如实标注。

---

## 二、新增测量件

### 2.1 `benchmark/perf-r44.mjs` — 六部全库基准

首次覆盖 241 关，三个测量面：`step`（idle / scripted 双输入逐关）、`build`（中位 3 次）、
`alloc`（GC 前后堆差 / 步数）。按「部」聚合，避免 241 关均值被轻关稀释。

```bash
node --expose-gc --import tsx benchmark/perf-r44.mjs --save r44-after
node --expose-gc --import tsx benchmark/perf-r44.mjs --compare r44-before
PERF_R44_TEMPLE=crystal,fairies   只跑指定部
```

### 2.2 `benchmark/perf-r44-alloc.mjs` — 分配专项

9 个代表用例（forest 轻/重、light 光束、ice 定时闸、ice TOI 极端、crystal 传送门、
elements、fairytales 仙女 ×2），GC 观察器测事件数与耗时。

### 2.3 `benchmark/ab-r44.sh` — 配对 A/B 台架（内容回退法）

不切工作树，用 `git show <rev>:./<file> > <file>` 换臂，两臂在同一会话内交替跑，
取中位并打印臂内散布；散布 ≥ 臂间差时**拒绝给结论**。

### 2.4 `benchmark/results/det-r44-full.json` — 首个 241 关位级锚

合并链哈希 `16650daa83db0548…`，600 步，idle + scripted 双输入。此前的三个锚只覆盖
forest / light / ice 三部（139 关），第 4–6 部与 portal/仙女/复活内核**从未进入任何
位级门禁**。本件补上该缺口。

---

## 三、全库基准数字（241 关，600 步，node v22.22.1）

### 3.1 当前 HEAD（`c769ad5`）

| 部 | 关数 | idle avg | scripted avg | scripted p95 | build | alloc |
|---|---:|---:|---:|---:|---:|---:|
| crystal | 36 | 0.01549 | 0.05401 | 0.11373 | 1.53ms | 31.8B |
| elements | 35 | 0.02092 | 0.05132 | 0.10665 | 1.32ms | 10.4B |
| fairytales | 31 | 0.03845 | 0.05452 | 0.11441 | 1.33ms | 20.4B |
| forest | 48 | 0.01902 | 0.05519 | 0.10465 | 1.44ms | 12.2B |
| ice | 51 | 0.06018 | 0.06343 | 0.10910 | 1.45ms | 17.3B |
| light | 40 | 0.01487 | 0.05080 | 0.10554 | 1.32ms | 21.4B |
| **全库** | **241** | **0.02929** | **0.05538** | **0.10583** | — | — |

最慢 8 关（scripted）：`forest_bonus_2=0.54768` `ice_17=0.35572` `ice_bonus_1=0.21439`
`ice_15=0.14747` `efire_2=0.13165` `ice_15_1=0.12118` `ice_14=0.11943` `elight_light-ez=0.11725`（ms）

### 3.2 与基线直比：**不可作为结论**

`--compare r44-before`（`3a57b13` → `c769ad5`）给出全库 scripted **+2.77%**，且有 70 关
单关 >+5%。但这**不是回归证据**——同机同日同代码两次运行的本底散布已达 ±5%（见
`note/report/perf/2026-10-18-campaign-summary.md` 支柱 2 与 r18 的 446ms 教训）。

本轮为此专门做了配对 A/B（交替跑、取中位、比臂内散布），结果见下节。

### 3.3 配对 A/B：全部落在噪声带内

客户端分配剖析（headless Chromium + CDP `HeapProfiler.startSampling`，采样间隔 4096B）：

| 关 | 臂 | 游戏包内分配（B/帧） |
|---|---|---:|
| light_22（8s × 3 轮） | A 基线 中位 | 11,819 |
| | B 优化 中位 | 10,797 |
| light_22（25s × 3 轮，长窗） | A 基线 中位 | 8,669 |
| | B 优化 中位 | 8,916 |
| light_32（16s × 2 轮，光束频繁变化） | A 基线 中位 | 9,282 / 9,359 |
| | B 优化 中位 | 9,304 / 9,484 |

短窗单次曾见到 −8.7%，但**加长采样窗后两臂重合，臂内散布（~4%）大于臂间差（~2.8%）**。
按战役纪律：**带内，不主张**。

---

## 四、诚实结论：本轮收益无法主张

本轮的改动在**代码语义层面确实成立**（消除了每帧的模板串、数组、包装对象构建），但：

1. **wall-clock 与分配指标都测不出可信的 percent 级差异**。这台机器上，同代码两跑
   的全库 scripted 散布、CDP 分配采样的臂内散布，量级都盖过了改动的真实幅度。
2. 剖析显示全库 self-time 的 **88.2% 在 box2d vendor**（`b2World.Step` 9.4%、
   `b2Island.Solve` 4.5%、`SolveTOI` 4.0%、`b2BroadPhase.UpdatePairs` 3.9% …），
   自有代码里最大的 `world.step` 自身仅 2.2%、`mechanisms.ts` 2.0%、`character.ts` 1.1%。
3. 自有代码稳态分配经 V8 采样剖析（差分法，扣掉启动期）只剩约 **29 B/步**，且集中在
   vendor 的 `b2Vec2.SelfAddXY` / `b2MulXV` / `b2Sweep.Normalize` 等内部写法，
   属 vendor 红线范围。

因此本轮**记录为「位级中性、收益不可量化」**，不作为性能提升上报。它的实际价值是：
补上了 241 关位级锚与六部基准这两件此前完全缺失的测量基础设施。

---

## 五、剖析到的红线事实（不入改动，归档备查）

1. **ice_17 的 0.356ms/步 是 94% 的 TOI 成本**，来自 vendor `b2World.SolveTOI`。
   对照 oracle bundle（`Fireboy-and-Watergirl/output/A/js/init.eb02fbdab2aa1d24.js`，
   md5 `d637cb8c…`）逐字确认其 `SolveTOI` 内同样有 `j.SetAwake(!0), k.SetAwake(!0)`——
   **这是原版行为，不是我方缺陷**。属 fidelity 红线，不动。
2. `forest_bonus_2` 的 0.548ms/步 同样以 vendor 求解为主，非自有代码热点。
3. 渲染段已在 r7r 判到理论地板（整帧单批 drawcall 1.00、blend 0，`renderAvg` 0.20~0.24ms
   ≈ 帧预算 1.4%），本轮复核该结论仍成立，未再触碰。
4. 服务端 `syncState` 占 tick 的 4.0%（forest_bonus_2）~ 12.8%（crystal_04），
   与 r2 的「sync+encode ≤2%」口径不同（本次含 241 关里的重机关关），但量级仍小，
   且分配剖析显示其逐 tick `String(id)` 键构造在 avg 1~4 个机关的规模下不构成热点。

---

## 六、复现

```bash
# 位级门禁（241 关）
node --import tsx benchmark/perf-determinism.mjs --compare r44-full

# 全库基准
node --expose-gc --import tsx benchmark/perf-r44.mjs --save r44-after
node --expose-gc --import tsx benchmark/perf-r44.mjs --compare r44-before

# 分配专项
node --expose-gc --import tsx benchmark/perf-r44-alloc.mjs --compare r44-alloc-before

# 配对 A/B（bash，交替换臂）
bash benchmark/ab-r44.sh 6c65c8d 3
```

产物：`benchmark/results/r44-*.json`、`r44alloc-*.json`、`det-r44-full.json`。

---

## 七、环境与口径披露

- 机器：Linux 7.0.0-38-generic x64，node v22.22.1；基准为长时单进程，**受 CPU 频率/
  热漂影响**，故一切跨时段直比只作方向指引。
- 客户端分配剖析：headless Chromium（SwiftShader），CDP 采样间隔 4096B。SwiftShader 的
  present 阻塞属环境项，故只比**JS 侧分配**，不比 fps。
- 所有 `allocBPerStep` 用 GC 前后堆差法；此法在服务端全库口径下同代码两次运行有
  216/241 关给出不同数值，**不具 percent 级分辨力**，已在 §3.3 说明其局限。
