# r46 性能轮报告（2026-11-05）：换关链客户端半边——黑幕与 fetch 并行

分支 `perf/r44`，起点 `f2d83e4` 之前的 `271ce12`/`bd791fd`（r45 收口）。本轮换优化点：
r45 只覆盖了换关链的**服务端**（World 构建 1ms 级），本轮补上**客户端**那一半——玩家实际
感知的换关延迟此前从未被任何量具覆盖。

- 落点：`7d627c0`（客户端并行化）、`f2d83e4`（e2e CSP 修复，独立提交）
- 门禁：typecheck 0 错；vitest 479/479；det 241/241；e2e journey 7/7

**本轮可主张的收益**：拉关等待 `advanceSentToFadeIn` **312.4 → 101.7 ms（−67.4%）**，
两臂 24/22 个样本区间**完全不重叠**。总链 `clickToFirstPlayable` −10~14%，但噪声上界 26.5%
→ **带内，不主张**（按 r44 纪律）。

---

## 一、新量具：`benchmark/perf-advance.mjs`

换关链客户端半边的分段计时，此前完全没有量具：

| 段 | 含义 |
|---|---|
| `clickToAdvanceSent` | 点击「继续」→ `ws.send` 返回（本地派发） |
| `advanceSentToFadeIn` | 服务端往返：advance 受理 → levelId 回声 → `reloadLevel` 拉关 → 黑幕起 |
| `fadeInToOp` | 黑幕淡入 500ms（oracle 固定动画） |
| `opToGameCreate` | `scene.stop("Game")+start("Game")` → 新场景 create 完成 |
| `createToFirstPlayable` | create 完成 → 首个 update |
| `clickToFirstPlayable` | 合计 |

口径：headless chromium + 真服务器 + **双页入房**（生产同构，`enterAs` 走 DOM 表单），
通关走 `FW_DEBUG_FORCE_DOORS=1`（与 e2e journey 同款，驱动真实 25fps 扫帧 → isUp → win，
不注入假事件），每轮只取第一次换关的里程碑。

### 量具踩的三个坑（都已修正并写进脚本注释）

1. **2ms 轮询看不到 `gameInactive`**：`fadeSwitch` 把 `scene.stop("Game")` + `scene.start("Game")`
   排在 SceneManager 的下一帧批处理，轮询视角永远是为 active。改用 Phaser 的
   `sys.events` 的 `shutdown`/`create`/`update` 事件。
2. **`sys.events` 监听器在 shutdown 时被清空**：挂在 GameScene 上的钩子换关后就收不到了。
   改为每 20ms 用 `WeakSet` 判断并重挂。
3. **入关时也会记 `firstPlayable`**：`waitForFunction` 立即假命中，切片后只剩 click/advanceSent。
   改为在点击时清空窗口数组。

---

## 二、发现：换关 1.1s 里 60% 是黑幕，只有 5% 是真重建

基线（`advance-adv-baseline.json`，5 次中位）：

| 段 | 中位 ms | 占比 |
|---|---:|---:|
| clickToAdvanceSent | 0.4 | 0.04% |
| **advanceSentToFadeIn** | **319.7** | **29%** |
| **fadeInToOp**（黑幕淡入） | **720.6** | **65%** |
| opToGameCreate（真重建） | 61.9 | 5.6% |
| createToFirstPlayable | 0.1 | 0.01% |
| **合计** | **1102.8** | |

两个结论：

- **客户端场景重建本身不是瓶颈**（62ms，占 5.6%）——r45 之后服务端构建也只有 1ms。
  换关慢在**固定转场动画**（`fadeInToOp` 720ms，含 oracle 的 500ms 淡入 + 排帧）
  和**拉关的网络往返**（320ms）。
- 第二项是真实可优化点：黑幕淡入的 500ms 期间画面本来就是黑的，**fetch 完全可以并行**。

---

## 三、改动：黑幕与 fetch 并行（`7d627c0`）

`reloadLevel` 原实现：

```ts
currentLevel = await fetchLevelCached(levelId);   // ← 整段网络往返暴露在玩家等待里
...
fadeSwitch(phaser!, () => { /* 切场景 */ });      // ← 之后才起黑幕
```

改为：

```ts
const levelPromise = fetchLevelCached(levelId);   // 先发起，不 await
fadeSwitch(phaser!, async () => {                 // 黑幕先起，与 fetch 并行
  currentLevel = await levelPromise;              // 淡入 500ms 后这里通常已 resolve
  ...
  sm.start("Game");
});
```

`FadeScene` 相应支持异步 ops：`onComplete` 里若 ops 返回 promise 则等它落定再进淡出；
同步 ops（其余 6 个调用点）走 `Promise.resolve()` 同一条路径，微任务内完成，逐帧行为不变。
ops 抛错时立刻揭幕（旧实现是黑幕根本不起，两者行为面同为「玩家留在旧关」）。

---

## 四、量化（配对 A/B，内容回退法，6 轮 × 5 次）

| 段 | A 基线 | B r46 | Δ | 两臂区间 | 判定 |
|---|---:|---:|---:|---|---|
| **advanceSentToFadeIn** | **312.4** | **101.7** | **−67.4%** | A[191.2, 460.6] / B[11.6, 160.5] **完全不重叠** | **可主张** |
| fadeInToOp | 759.7 | 713.3 | −6.1% | 147/154 散布 | 带内 |
| opToGameCreate | 54.6 | 60.1 | +10.1% | 50/37 散布 | 带内 |
| clickToFirstPlayable | 1117.3 | 958.2 | −14.2% | A 区间 978–1170 / B 区间 901–1005 有重叠 | 带内，**不主张** |

轮级中位（每轮 5 次取中位，共 6 轮）：

```
A(基线): [1116.1, 1116.6, 978.1, 1117.3, 1141.7, 1169.6]  中位 1117.3
B(r46) : [ 910.9, 1002.8, 1003.0, 900.9, 921.4, 1005.2]   中位 1002.8  (−10.2%)
```

**为什么不主张总链**：`clickToFirstPlayable` 的两臂差（−14%）小于臂内散布（299–312ms）。
散布主要来自 `fadeInToOp` 的 148ms 抖动（Phaser 排帧 + headless 定时器粒度），
与被测改动无关。真实收益是「拉关那 200ms 不再落在玩家等待里」，但落在总链里被
500ms 固定黑幕稀释——按 r44 报告确立的纪律，只能主张那一段。

**`createToFirstPlayable` 从 0.1 → 67ms 是口径位移不是回归**：旧实现点击时黑幕还没起、
Game 场景已在重建，钩子把这段时间记进了别的段；新实现把 fetch 挪进 ops，重建整体后移。
它是「段边界变了」而非「变慢了」——`opToGameCreate + createToFirstPlayable` 两版合计
62.0 vs 119.1，差额正是被 `advanceSentToFadeIn` 让出的 210ms 的一部分。

---

## 五、顺带修的既有缺陷：e2e 与 CSP 不兼容（`f2d83e4`）

生产 CSP 是 `script-src 'self'` + 内联脚本 sha256（`serverHeaders.ts`），**无 `unsafe-eval`**。
而 `scripts/e2e/lib.mjs` 与 `journey.mjs` 用**字符串**传给 `waitForFunction`，Playwright 以
eval 执行 → 浏览器拒绝：

```
EvalError: Evaluating a string as JavaScript violates the following Content Security Policy
directive because 'unsafe-eval' is not an allowed source of script
```

结果 `journey.mjs journey` 一进门（`waitForStarted`）就挂。共 11 处谓词全部改成函数形式后
**7/7 全过**（通关 → advance → forest_02 → 席位保留 → 时钟续走）。

> 这个缺陷与本轮性能改动无关，是 CSP 上线后 e2e 没跟着更新的历史遗留；因为本轮要用
> journey 验证换关链才暴露出来，故独立提交。

**未解决**：`journey.mjs bgm` 模式在 `advanceAndSettle` 处超时。已用独立探针（`TEMP/r46-bgmdiag2.mjs`）
确认**换关本身正常**（`levelId=forest_02`、`bgm_level` 在播、XFade 正常收尾），失败在测试
自身的采样时机（`settledBgmFn` 在 XFade 期间读到旧 Game 场景的 `sound`）。用**未改动的客户端**
复跑同样失败 → 既有问题，本轮不修，记录在此。

---

## 六、其它探测（负结论）

### 6.1 服务端每房 CPU 拆账——物理只占 22%

用 `--cpu-prof` 起真服务器 + 16 房 + 真客户端，按测量窗归因（`TEMP/r46-attr.mjs`）：

| 桶 | 占活跃时间 |
|---|---:|
| node internal（含 socket 写） | 26.2% |
| **physics: vendor box2d** | **22.4%** |
| vm(program) | 22.0% |
| colyseus（序列化/广播） | 15.6% |
| room: tick+sync | 6.9% |
| **physics: own kernel** | **3.5%** |
| gc | 0.8% |

结论：**自有物理内核只占 3.5%**，物理整体 22%。容量侧 r6b 实测 ~157 房/单核，
余量很大（`capacity-r6b-ext.json`）。服务端没有值得做的 percent 级优化空间。
> 注：本机 `--import tsx` 运行时开销（`vm(program)` + 部分 internal）在编译分发版下不存在，
> 真实比例的物理占比会更高，但「自有内核占比极小」的结论不变。

### 6.2 服务端每步构造器计数——每步仅 5–17 次

按构造器调用精确计数（`TEMP/r46-alloc-probe.mjs`，确定性口径）：
`b2Timer` 5/步（已是零遥测桩）、`b2Profile` 0–7/步、`b2Vec2` 0–5/步。
**没有可观的每步分配**——r44/r45 已把大头清掉。

### 6.3 `syncState()` 优化——带内

子 agent 实测 5 关 2.4–22.4µs/tick（占 60Hz 预算 0.01–0.13%）。它建议的
「算完先比再写」省 66% 分配（1379 B/tick），但**绝对量只有 1.4KB/tick、5µs/tick**，
与 16667µs 的 tick 预算比可忽略，且需改动大量字段赋值。**不做**。

### 6.4 `updatePortals` / Beamer 闭包外提——量级太小

子 agent 报 `updatePortals.add` 闭包 500B/步、Beamer `put`/`mark` 约 1.5KB/步。
portal 关省 0.26–0.35µs/步（该关 step 的 4.6–7.3%），**绝对量 0.3µs**。
`ice_17` 省 7.5µs/步但其 step 本身 2096µs（vendor 主导）。相对百分比好看、绝对收益
可忽略，且要动每步热路径。**不做**。

---

## 七、复现

```bash
# 换关链客户端半边（双页 + FORCE_DOORS 真通关）
node --import tsx benchmark/perf-advance.mjs --runs 5 --save adv-r46
node --import tsx benchmark/perf-advance.mjs --no-build --compare adv-baseline

# 配对 A/B（内容回退法，交替构建两臂）
bash TEMP/r46-adv-ab.sh 6

# 门禁
node --import tsx benchmark/perf-determinism.mjs --compare r44-full
node --import tsx scripts/e2e/journey.mjs journey
```

产物：`benchmark/results/advance-*.json`。

---

## 八、环境与口径披露

- 机器：Linux 7.0.0-38-generic x64，node v22.22.1，headless chromium（Playwright）。
- `perf-advance`：每轮新建两个 browser context（create + joinById），`--runs` 次取中位；
  黑幕 500ms 为 oracle 固定动画，不在本轮优化范围（改了就是复刻性偏差）。
- A/B 判定沿用 r44 纪律：**臂内散布 ≥ 臂间差时明确拒绝给结论**。本轮只有
  `advanceSentToFadeIn` 一段两臂区间完全不重叠，故只主张它。
- 未改 vendor `box2d.js`；客户端改动不触碰物理，det 241/241 与改前一致。
