# 性能优化战役 · r1 第一轮实施报告（perfopt1 槽）

> 2026-10-18 · perfopt1 槽 · 基线 git `e477f9c`（r0 基线，0.3.31）→ 本轮终态 `8d2b6d5`，四件一件一 commit。
> 红线全程遵守：vendor 字节零改动（b2Timer 走求值后覆写）；对外协议零改动（patch 字节逐字不变）；
> det 基线门禁每件后复跑全绿。**位级中性实测：det 48/48 逐关一致（vs r0-baseline，综合链
> 哈希逐字相同）+ fixtures 6/6 PASS（内核系四关 maxDev=0 维持）**。
> 改动面：kernel/{b2,world}.ts（内核）、ForestRoom.ts（序列化）、routetool/kernel.mjs（工具链）、
> benchmark/perf-{sync,routeio}.mjs（镜像同构适配）。依据：`note/research/2026-10-18-perf-hotspot/01-hotspot.md`
> 与 `note/report/perf/2026-10-18-r0-baseline.md`（同机同环境）。

## 〇、四件总表

| # | 改动 | commit | r0 前 → r1 后（同机同口径） | 门禁 |
|---|---|---|---|---|
| 件1 | jumpSound 闭包提升模块级（world.ts step() 逐帧新建空闭包→模块级单例，tsx keep-names `__name` 包装随之消失） | `fa4a806` | 热身件（收益并入件2 的 perf-step 读数；hotspot 估值 replay incl 1.6%/idle 2-4%） | det 48/48 + fixtures 6/6 |
| 件2 | b2Timer 恒零遥测桩（b2.ts 装载后覆写原型 Reset/GetMilliseconds 与构造器，免每步 12~13 次 `new Date().getTime()`；vendor 字节不动） | `07fc78a` | **perf-step 48 关综合 avg 0.0227 → 0.0177ms（-22.0%，件2 时点读数；终态存档复跑 0.0193，带内 -15%~-22%）**；睡眠关收益最大：forest_32 -58.5%/forest_31 -50.4%（件2 时点） | det 48/48 + fixtures 6/6 |
| 件3 | syncState 机关位姿 mechanisms 直读（消除每 tick ~30 个 mechSnapshot 中间对象/数组，滑轮 halves 数组一并消除；world.ts 再导出 m2px） | `2b7efa6` | **perf-sync sync 段 forest_01 0.0210 → 0.0096ms（-54%）/ bonus_2 0.0516 → 0.0191ms（-63%）；patch 347B/2646B 逐字不变**；等价自证 4 关×600 帧双路径 encodeAll 逐字节一致 | det 48/48 + fixtures 6/6 |
| 件4 | runKernel 缺省路径死亡判定直读角色状态（免逐帧两次 snapshotPlayer 分配；traceTo 全量轨迹路径原样保留） | `8d2b6d5` | **perf-routeio 12 路线均值 10.34 → 12.14 关/s（+17.4%，16660→19623 帧/s）；帧耗 -12%~-20%（如 forest_02 48.2→38.5µs）** | fixtures 6/6 + 12 路线双路径结局逐一相同 |

一件一 commit、独立过门；无回滚件。

## 一、件2 b2Timer 桩（收益最大件，细节）

- 位置：`packages/shared/src/kernel/b2.ts` `b2()` 装载缓存后调用 `stubB2TimerTelemetry(ns)`：
  原型 `Reset`（置零返 this）与 `GetMilliseconds`（恒 0）就地覆写——vendor 求值期已创建的静态计时器
  （`b2TimeOfImpact.s_timer`/`b2Island.s_timer`）与该原型共享，一并覆盖；构造器替换为免 `new Date()`
  的零桩并复用原原型（instanceof 语义不变）。
- 中性论证：m_profile 8 处赋值+2 处累加、`b2_toiTime/b2_toiCalls/b2_toiMaxTime` 计数器全仓库无读者
  （静态审计，hotspot 01 号档 §2.2）；本件后 det 48/48 位级一致实测背书。
- 空载面读数（48 关 perf-step，件2 时点）：综合 -22.0%；最慢关 bonus_2 0.3752→0.3151ms（-16.0%）；
  睡眠态占比高的轻关收益最大（forest_32 -58.5%、forest_31 -50.4%——世界睡眠后计时器占比凸显，
  与 hotspot"idle self 13.4%"预判吻合）。轮间波动带 0.0177~0.0193ms（终态存档 perf-r1-step.json 为 0.0193，
  -15.0%；两次读数差异属 run-to-run 带，非代码差异）。

## 二、件3 syncState 直读（序列化侧）

- 位置：`packages/server/src/rooms/ForestRoom.ts` syncState——8 类机关（levers/pushers/platforms/props/
  winds/hangings/pulleys×2 半/romans）不经 `world.mechSnapshot()` 中间快照，改由 `world.mechanisms`
  直读逐字段写 RoomState；取整/取负/换算表达式与旧路径逐操作同构（如 lever：
  `Math.round(((l.angleDeg()*Math.PI)/180)*1000)/1000`）。滑轮 helper `syncPulleyHalf` 消除旧
  `halves` 数组分配。`World.mechSnapshot()` 公共 API 不动（fixture-runner/autosearch 等持有式调用方语义保持）。
- 等价自证（TEMP 复跑件 equiv-sync.mjs，已清理）：4 关（01/04/12/bonus_2）×600 帧 scripted，旧路径与
  新路径各写一份 RoomState，每帧 `Encoder.encodeAll()` 全树字节逐一相等。
- perf-sync（r0-sync → r1-sync 存档）：forest_01 sync 0.0210→0.0096ms、bonus_2 0.0516→0.0191ms；
  **平均 patch 347B/2646B 两关逐字不变**（协议输出零变化）；step 列同步受益于件1/2（0.0187→0.0156、
  0.3477→0.2854ms）。

## 三、件4 runKernel 减负 + r0 溢价归因勘误（重要发现）

- 位置：`scripts/e2e/routetool/kernel.mjs`——缺省（无 traceTo）死亡判定改 `w.players.fireboy/watergirl`
  的 `dead/dying` 直读（snapshotPlayer 的同名字段即 Character 直读，语义逐位相同）；`traceTo` 路径
  保持原快照口径（validate/dtsweep/vtdiff 全量轨迹不变）。12 路线双路径自检：结局（won/deathF/winF）
  逐一相同且与 r0 表全对上。
- **r0 归因勘误**：r0 报告 §七"runKernel 对纯 step 溢价 +3.9%~+153%（3 关 ≥90%）"含**口径伪影**——
  纯 step 基线跑满 totalFrames，结局（死亡/win→gameover）后 step 早退近乎免费，摊薄了每帧均值
  （forest_02：1880 活跃帧+2283 尾帧/totalFrames=4163）。快照移除后分解实测（9 轮中位）：

  | 关 | runKernel | 纯 step 至结局帧 | 比值 |
  |---|---|---|---|
  | forest_01 | 126.6ms | 117.0ms | 1.08 |
  | forest_02 | 75.9ms | 67.9ms | 1.12 |
  | forest_03 | 45.1ms | 38.3ms | 1.18 |
  | forest_12 | 53.3ms | 42.3ms | 1.26 |

  即快照×2 移除后剩余 harness 溢价仅 +8%~26%（构成=每次调用的 expandFlat 输入展开固定成本+判定），
  r0 的"+153%"主体是尾帧稀释伪影而非快照成本；snapshotPlayer×2 实际约 6µs/帧（forest_02 实测
  溢价 28.3→22.2µs 段）。机器探索供给面的真实读数以关/s 为准：**10.34 → 12.14 关/s（+17.4%）**。

## 四、总验收（终态 8d2b6d5）

- typecheck 零输出；vitest **85/85**；vite build ✓（4.0s，产物无回归）。
- det `--compare r0-baseline`：**48/48 位级一致**；fixtures：**6/6 PASS**（01/main 0、01/oracle-gold
  24.5357、04 0、12 0、26/main 0、26/oracle-gold 142.6879——与 r0 逐字同值）。
- e2e 真机门禁（repeat3 × --offset -15）：forest_01 **ALL PASS**（winAt 39467ms 带）、forest_12
  **ALL PASS**（winAt 12941ms 带）；forest_04 抖动归因见 §五。
- r1 存档：`benchmark/results/{perf-r1-step, sync-r1-sync, routeio-r1-routeio}.json`。

## 五、forest_04 e2e 抖动归因（A/B 实证，非本轮回归）

HEAD 侧 5 组 repeat3：3 组 ALL PASS、2 组各含 1 轮 FAIL（失败形态=角色卡半途未死/输入时序致死，
与 handoff 已录两例同门禁抖动同签名：netopt 槽 f01 round3、animcheck 槽 f12 run1，均在改动前代码）。
**基线 A/B**（git worktree 挂 r0 基点 `a81cdb5`、独立 node_modules/@fw 指向 worktree 本体、独立构建）：
2 组 repeat3 → 1 组 ALL PASS、1 组 run1 FAIL（dying@17730ms，输入时序致死）——**无本轮改动的基线
同率翻车**，失败形态同族。结论：forest_04 e2e 为既有输入注入抖动（razor 时序关），非本轮回归；
本轮位级中性由 det/fixture/encodeAll 三重实测独立背书。

## 六、第一轮总收益（一句话版）

**空载步进 -15%~-22%（48 关综合 0.0227→0.0177~0.0193ms/步，睡眠轻关最高 -58%）、服务器快照写路径
sync -54%~-63%（tick 链中 sync 段占比相应减半以上）、路线回放吞吐 +17%（10.34→12.14 关/s），
三面全部位级中性（det 48/48 + fixtures 6/6 + patch 字节不变）。**

## 七、复现

```bash
node --import tsx benchmark/perf-determinism.mjs --compare r0-baseline   # 位级门（每件后均复跑全绿）
node --import tsx scripts/e2e/routetool/fixture-runner.mjs              # fixtures 6/6
node --import tsx benchmark/perf-step.mjs --compare r0-step             # 件1+2 面
node --import tsx benchmark/perf-sync.mjs --compare r0-sync             # 件3 面（patch 字节不变）
node --import tsx benchmark/perf-routeio.mjs --compare r0-routeio       # 件4 面
```

r1 快照：perf-r1-step / sync-r1-sync / routeio-r1-routeio（供第二轮 `--compare r1-*` 起锚）。
提交链：`fa4a806 → 07fc78a → 2b7efa6 → 8d2b6d5`（+报告/文档 commit）。
