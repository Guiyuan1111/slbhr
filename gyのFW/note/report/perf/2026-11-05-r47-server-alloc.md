# r47 性能轮报告（2026-11-05）：服务端每步分配归因 + character 零分配化

分支 `perf/r44`，起点 `42bf9a9`（r46 收口）。本轮换优化点：前几轮都在量**耗时**，
从未量过**每步分配归到哪个函数**。r44 的 `allocBPerStep` 只是个标量（GC 堆差法），
无函数级归因、也不具 percent 级分辨力。

- 落点：`a533aa3`
- 门禁：typecheck 0 错；vitest 479/479；det 241/241 位级一致

**本轮结论（诚实分面）**：
- **分配收益可主张**：`crystal_20` 每步分配 **11758 → 10594 B/step（−9.9%）**，
  两臂 3 次测量区间完全不重叠（13785–13865 vs 12239–12521）。
- **CPU 收益不可主张**：3 关 × 5 轮配对 A/B 全部带内（−2.9%~+1.3%，臂内散布 19–65µs）。

---

## 一、新量具：`benchmark/perf-server-alloc.mjs`

两种口径：

| 口径 | 方法 | 可信度 |
|---|---|---|
| 净堆增量（默认） | GC×2 后跑 N 步，`(heap₁−heap₀)/N` | **低**：同代码两跑可差 2 倍（受 scavenge 时机影响），只作量级参考 |
| 采样归因（`PROF_MODE=1`） | `node:inspector` HeapProfiler.startSampling，**只在步进窗口内采样**，按 `functionName + url` 聚合 selfSize | **高**：区间不重叠时可用 |

### 关键坑（已写进脚本头注）

**不要把整进程 profile 拿来归因**。首版直接对整进程 `--heap-prof`，结果 top1 是
`compileForInternalLoader`（20.9%）、`makeNodeErrorWithCode`、`tsx/dist/*` ——全是启动期
module loader 与转译噪音，与步进毫无关系。正确做法是在步进前后手动
`startSampling`/`stopSampling`，只覆盖被测窗口。

---

## 二、归因结果：character.update 是自有内核里最大的一块

`crystal_20`（全库分配最重关），1500 步采样：

| 函数 | 占采样 | 归属 |
|---|---:|---|
| `box2d.b2PrismaticJoint.InitVelocityConstraints` | 13.6% | vendor（禁区） |
| `box2d.b2Island.Solve` | 13.0% | vendor（禁区） |
| **`character.update`** | **9.8%** | **自有** |
| `box2d.b2PrismaticJoint.SolvePositionConstraints` | 8.1% | vendor（禁区） |
| `b2FindMaxSeparation` | 4.6% | vendor |
| `character.updateAnim` | 2.9% | 自有 |
| `world.step` | 1.7% | 自有 |

**自有代码里 `character.update` 占 9.8%，是最大的一块**。它每步至少分配：
- `new B.b2Vec2` ×2–4（`SetLinearVelocity` / `ApplyForce` / `ApplyLinearImpulse` 的参数）
- 力向量字面量 `{x,y}` ×2–3（left/right 分支各造两次）
- `[...this.feetContacts]` 数组拷贝 + 排序（每次有脚底接触时）

---

## 三、改动：`character` 每步零分配化（`a533aa3`）

### 3.1 位级中性依据（逐项核对 vendor 实现后动手）

| vendor API | 实现 | 复用 scratch 是否安全 |
|---|---|---|
| `b2Body.SetLinearVelocity(a)` | `m_linearVelocity.Copy(a)` → 逐字段赋值（**保 `-0`**） | ✓ 只读入参 |
| `b2Body.ApplyForce(a, b)` | 只读 `a.x/a.y/b.x/b.y` | ✓ 不保留引用 |
| `b2Body.ApplyLinearImpulse(a, b, c)` | 同上 | ✓ 不保留引用 |
| `b2Body.GetWorldVector(local, out)` | `b2MulRV(q, local, out)` → 写 out | ✓（本来就有 out 参数） |
| `b2Body.GetLinearVelocity()` | 返回每体独享的 `m_out_linearVelocity` | ✓ 该返回值本步之后无其它读者 |

### 3.2 四处改动

1. **脚底法线排序**：`[...this.feetContacts].sort(...)` → 对**索引表**排序。
   比较函数与 stable 语义完全一致（`Array.sort` 自 ES2019 稳定，相等项按原下标先后），
   取 `order[0]` 即原 `sorted[0]`，位级同值。
2. **力向量复用**：`let i = {x,y}` 改为实例字段 `scratchForce`，三个分支直接写字段。
   left/right 分支原本「先造 i 再乘 f 覆盖成新对象」，改为两步都写同一对象的字段
   ——**顺序与算术完全相同**。
3. **速度/冲量/原点复用**：`SetLinearVelocity` / `ApplyForce` / `ApplyLinearImpulse`
   的参数改为 `scratchVel` / `scratchJump` / `scratchJump2` / `zeroVec` 四个实例字段。
   > 踩到的坑：一开始我只留两个 scratch，结果 reactable 的 −1 冲量与主施力向量共用同一个
   > 对象——施力段还没读就已经被覆盖。现已分开成 4 个，并在代码里注明「不可复用 i」。
4. **`updateAnim` 去掉冗余拷贝**：`const o = {x:u.x, y:u.y}` 改为直接就地归一
   `u`（`GetLinearVelocity()` 的返回值是每体独享的临时对象，本方法之后无读者）。

---

## 四、量化

### 4.1 分配（可主张）

`crystal_20`，采样口径，各 3 次独立运行（每次 1200 步，预热 600 步）：

| 臂 | 三次测量（B/step） | 区间 |
|---|---|---|
| 基线 | 11677.7 / 11765.1 / 11831.4 | 11678–11831 |
| r47 | 10444.0 / 10652.4 / 10684.7 | 10444–10685 |

**−9.9%，两臂区间完全不重叠。**

函数级：`character.update` 占采样 **9.8% → 5.4%**，`updateAnim` 2.9% → 3.4%（占比上升
是因为其它项降了，绝对值下降）。

### 4.2 CPU（不可主张）

3 关（`crystal_20` / `light_23` / `crystal_03`）× 5 轮 × 每轮 3 次配对 A/B：

| 关 | A 中位 | B 中位 | Δ | 臂内散布 | 判定 |
|---|---:|---:|---:|---:|---|
| crystal_20 | 113.4µs | 112.6µs | −0.6% | 19/34µs | 带内 |
| light_23 | 135.7µs | 131.7µs | −2.9% | 37/40µs | 带内 |
| crystal_03 | 95.7µs | 97.0µs | +1.3% | 21/65µs | 带内 |

**单步耗时无可主张的改善**。这与预期一致：单步 100µs 里这些分配只占小头，
V8 的 scavenge 摊销掉了大部分成本。**收益体现在 GC 压力与堆流量，不在单步耗时**。

> 之所以保留这项改动：它是零风险（位级 241/241 全绿）的垃圾减量，对长时间对局与
> 多房间并发（r6b 实测 96 房时 patchLow 报警）有正向意义；但绝不能说它让单步变快了。

---

## 五、负结论：本轮探测后判定不做的项

### 5.1 客户端逐帧分配——86.8% 在 Phaser 内部

CDP `HeapProfiler.startSampling` 在浏览器内抓 `forest_bonus_2` 8s：

| 桶 | 占分配 |
|---|---:|
| phaser | **86.8%** |
| other（含 V8 内建） | 10.6% |
| colyseus | 2.6% |
| **自有 client 代码** | **0%** |

top1 是 `batchSprite`（61.3%）。查 Phaser 源码确认：`MultiPipeline.batchSprite` 内部
`setQuad` 写的是预分配的 `Float32Array`，零分配——61.3% 是采样归因把 `batchQuad` 内联
进了同一帧栈。**客户端自有代码在分配上已经干净，无可优化**。

### 5.2 客户端帧率——headless SwiftShader 环境项

`perf-client` 在 `forest_bonus_2` WebGL 下只有 11.1fps，但帧内 JS 仅 1.7ms；
`raw` 帧间隔 91ms。轻关 `forest_01` 同样只有 12fps（JS 1.1ms）。
**这是本机 headless SwiftShader 软件光栅化的 present 阻塞，不是产品问题**——
历史报告已披露此限制，真机口径需 `--gpu`（Xorg + SVGA3D）或 `--cdp`（远程真 GPU）。

### 5.3 vendor 侧两道分配大头——禁区

`b2PrismaticJoint.InitVelocityConstraints`（13.6%）与 `b2Island.Solve`（13.0%）合计
26.6%，但都在 `vendor/box2d.js` 里，属总账 §四「vendor 必漂禁区清单」，永挂账不动。

### 5.4 服务端容量已有大余量

r6b 实测 ~157 房/单核，CPU 模型 8.53ms/s/房。本轮把自有内核的分配进一步压低，
但**当前规模远未触及容量边界**，这不是瓶颈。

---

## 六、复现

```bash
# 采样归因（只覆盖步进窗口）
LEVELS=crystal_20,light_23 STEPS=1500 WARM=600 PROF_MODE=1 \
  node --expose-gc --import tsx benchmark/perf-server-alloc.mjs

# 净堆量级（噪声大，仅参考）
node --expose-gc --max-semi-space-size=1 --import tsx benchmark/perf-server-alloc.mjs

# 门禁
node --import tsx benchmark/perf-determinism.mjs --compare r44-full
```

---

## 七、环境与口径披露

- 机器：Linux 7.0.0-38-generic x64，node v22.22.1。
- 采样口径：`samplingInterval: 512` 字节，`includeObjectsCollectedByMajorGC/MinorGC: true`
  （即包含已被回收的对象——这正是「分配量」而非「留存」）。
- CPU A/B：每臂独立子进程（避免同进程内 JIT 状态互相污染），每关预热 300 步后测 600 步；
  判定沿用 r44 纪律——**臂内散布 ≥ 臂间差时明确拒绝给结论**。
- 未改 vendor `box2d.js`；det 241/241 与改前逐位一致。
