# 07 号档 · 风阻尼 oracle 语义裁定与内核修复（windsem 槽）

> 一句话：**裁定=分支 B——oracle 风阻尼是 dt 加权的 `v × 0.975^(elapsed_ms/(1000/60))`（原 bundle 字节直证，开发者注释随原包分发），内核旧实现"每步 ×0.975"只是它在 dt=1/60 的特化；已照抄 oracle 公式修复（附带你发现并同修的推力钳制偏离）。关键事实：fixed 1/60 下指数恰≡1（float 验证），修复对 det r32 / fixtures v1 / 真机 e2e 全部位级零漂——det 基线不重录（r32 维持），fixtures expected.json 不变。** dtsweep 复扫：forest_26 风区漂移收窄 2–37%；forest_03 全部调度行位级不动——其翻转发生在入风柱之前，03 号档 §4.1 把 forest_03 翻转归因风阻尼的假设被实验证伪（见 §6，已按槽规在 03 号档尾追加勘误）。
>
> - 日期：2026-10-17
> - 前序：05 号档行动清单第 1 项（§4.1）；03 号档 §4.1/#4；02 号档 dt 量化序列。
> - 内核 commit：`4198ef3`（阻尼 dt 加权）+ `99ed9fc`（推力去钳制）。

## §1 裁定结论与证据链（oracle 侧）

**Oracle 风阻尼 = dt 加权**。证据链全部落在 L0 原字节上（保真仲裁以原 bundle 字节为准，reverse README 明载）：

1. **原 bundle 直查**（`Fireboy-and-Watergirl/output/A/js/init.eb02fbdab2aa1d24.js`，md5 `d637cb8c2a51423d418c93431fc37ad3` 与 reverse README L0 声明一致）：
   - `0.975 ** (this.game.time.elapsed / (1000 / 60))` 原文存在（唯一一处）；
   - 开发者注释 `Damping factor should be dependent on delta time, not constant.` **随原 bundle 分发**（grep 命中 1）——内核旧注释"bundle 内英文注释为再分发者所加"是误判，本档更正。
2. **beautified 定位**（`note/reverse/oracle-a/init.beautified.js`；模块件 `modules/States_Level_Devices_Wind.js` L136-142 = beautified L59569）：

   ```js
   // Damping factor should be dependent on delta time, not constant.
   // Use 60 as reference since the game assumed 60FPS.
   // Note that the this.game.time.elapsed is in milliseconds.
   d.body.data.SetLinearVelocity(d.body.data.GetLinearVelocity()
     .SelfMul(0.975 ** (this.game.time.elapsed / (1000 / 60))));   // L59569
   ```

3. **`time.elapsed` 语义 = 当步 dt 毫秒**（同一 bundle 框架层）：
   - 主循环 `updateLogic`（L14697-14716）：`preElapsed = this.time.elapsed` → `executeTick(delta => pendingUpdateTimeMS.push(delta * 1000), preElapsed / 1000)` → **每个 tick 执行前** `this.time.elapsed = this.time.elapsedMS = currElapsed / subsplits`（L14704），tick 链内跑 stage 更新（L14740-14742）→ Wind.update() 在其中 → 阻尼读到的 elapsed 就是**本 tick 的 dt（毫秒）**。
   - tick 划分 = `createExecuteTick`（L83-129）：自适应拆分，步长钳制 `[1/maxTPS, 1/minTPS]` = **[10ms, 20ms]**（minTPS=50 / maxTPS=100，L73-74）；默认分支（while 最大步长）恰好消费完累计墙时。quantumEdition=false（L25）→ subsplits=1。
   - 框架层开发者注释（L14692-14694）：`this.time.elapsed … contains actual time in ms since last frame`。
4. **oracle 整条物理就是变 dt 的**：Level 态覆写 box2d 步进器（L65628-65634）：

   ```js
   this.game.physics.box2d.useElapsedTime = true;
   this.game.physics.box2d.update = function () {
     … a = Math.min(0.04, this.game.time.elapsed / 1000);
     return this.world.Step(a, this.velocityIterations, this.positionIterations);   // 8/3 @L53136-53137
   };
   ```

   即阻尼公式的 elapsed 与物理积分的 dt 是**同一个量**——oracle 内部自洽，不是"固定 1/60 物理 + 变 dt 阻尼"的混合。

**换算**：`elapsed_ms/(1000/60) = dt_s × 60`。真实 60fps 下每 tick 阻尼 ≈ `0.975^(1±ulp)`；vtrun 虚拟钟整数 ms 序列 [17,17,16] 下 = `0.975^1.02 / 0.975^0.96` 交替（goldfix 槽实录序列，与本档 §7 衔接）。**每秒阻尼与 tick 率无关，恒 ≈ 0.975^60 ≈ 0.218**——03 号档 §2 表 #4 推算的"120Hz 每秒 ×0.048"是内核旧实现的后果，不是 oracle 行为。

## §2 内核 vs oracle 风实现逐行对照表

引擎层（box2d.js）为同一份字节级提取件（kernel/b2.ts 头注），Step 自动 ClearForces（bundle L50666-50667）等语义构造性一致，不在表内重复。

| # | 项 | oracle（bundle 行号） | 内核（修复前） | 判定 |
|---|---|---|---|---|
| 1 | **阻尼公式** | L59569：`v × 0.975^(elapsed_ms/(1000/60))`，elapsed=当 tick dt（L14704） | mechanisms.ts:673 `v.SelfMul(0.975)` 固定每步 | **偏离 → 修复**（4198ef3：`0.975 ** (dtS*60)`，严格同式；fixed 1/60 时指数恰≡1 → 位级等价） |
| 2 | 作用时机 | 每 stage tick、physics Step 前（L14740→14747 两段 doScheduledTicking） | world.ts:247 applyForce 在 :268 Step 前 | 同构 |
| 3 | 作用对象 | 风柱 sensor 内 `sprite.character != null` 的体（模块件 L62-77 回调收集） | activeRoles fireboy/watergirl（world.ts:336-341 分发） | 同构（本游戏仅双子） |
| 4 | 开关门 | `state===1` 才执行（模块件 L126） | `state !== 1 return`（mechanisms.ts:659） | 同构 |
| 5 | **推力公式** | L59568：`(0,1)·Rot(rot+90°)×(1.2+0.2·sin(now/1000))×100×(1−dist/length)`，**无钳制**（dist>length 为负因子=反向吸回） | `Math.max(0, 1−dist/length)` 且 `f>0` 才施力 | **偏离 → 修复**（99ed9fc 去钳制；sensor 局部 y∈[0.5,length+0.5]（L49）→ 柱顶带可达 dist>length，吸回力可观） |
| 6 | 限速 | 阻尼后 `min(\|v\|,15)`（L59570-59571，归一化实现） | mechanisms.ts 同（SelfMul(15/speed)） | 同构 |
| 7 | 施力顺序 | 力累积→立即阻尼→立即限速，随后 Step（力在 Step 内以 f·dt/m 积分，步末 ClearForces） | 同序（applyForce 内三段连做） | 同构 |
| 8 | sin 相位时基 | `time.now`（rAF 墙钟，epoch 随机） | `windClockS()`（生产=墙钟 / e2e=simTimeS，world.ts:62-70 F6 已裁定） | 已知受控差异（行动清单 #3 风相位对拍，非本槽） |
| 9 | 物理 dt | `Step(min(0.04, elapsed/1000), 8, 3)`（L65628-65634） | `Step(dt, 8, 3)`，dt 由调用方喂（world.ts:268） | 同构（kernel.mjs 固定 1/60；dtsweep 变 dt） |

修复后内核（mechanisms.ts:658-680）：`applyForce(nowS, dtS)`，推力无钳制全量 ApplyForce + `v.SelfMul(0.975 ** (dtS * 60))` + 15m/s 限速。

## §3 位级中性证明（为什么基线不漂）

`1/60*60 === 1`、`(1000/60)/1000*60 === 1`、`0.975**1 === 0.975` 全部 float 精确成立（node 直验）；服务器 tick `STEP_MS/1000` 与 `1/60` 是同一个 double（ForestRoom.ts:28）。故 fixed 1/60 路径上新旧实现**逐位相同**。变 dt 喂入（dtsweep）下才显形：旧实现 120Hz 每秒 ×0.048，新实现恒 ×0.218（与 oracle 一致）。另验：oracle 运算序 `ms/(1000/60)` 与内核 `dt*60` 在 17/16/16.667ms 上给出同一 double、同阻尼因子——未来按实录 dtSeq 回放不存在运算序 ulp 差。

## §4 基线与回归验证（两笔修复各自独立复验）

| 验证 | 阻尼修复后 | 阻尼+去钳制后 |
|---|---|---|
| typecheck / vitest | ✓ / 85 ✓ | ✓ / 85 ✓ |
| det r32（48 关×idle+scripted，600 步链式哈希） | **48/48 位级一致** | **48/48 位级一致** |
| fixtures v1（forest_01/04/12/26） | 4/4 PASS maxDev 0 | 4/4 PASS maxDev 0 |

**处置**：det 基线**维持 r32 不 bump**（位级全同，重录=空转）；fixtures expected.json **零改动**（无 --update、无人审负担）；det 之所以对两笔修复全盲，是 det 固定脚本不触发风柱接触（handoff 10-15 r29 条已知）+推力吸回带从未被现有记录面进入（fixtures forest_26 风柱内有角色 511 步（60hz 探针），但 dist 恒 ≤length——柱顶吸回带在现存全部记录轨迹中 0 进入）。

## §5 dtsweep 复扫（修复生效性 + 03 号档假设检验）

复扫 forest_03/26（`--outDir TEMP/windsem/dtsweep`，种子同档案 20261017；单步探针独立证明新公式在内核内生效：dt=1/120 单步 vy 实测=新公式预测至全精度 10.55639794371454，旧实现应为 10.432189114648793）。数据收容 `tools/dtsweep/postfix-windsem/`（与档案同 schema）。

**forest_26（5 风柱，60hz WIN@1497；时间映射归档 vs 修复后）**：

| 调度 | 归档 maxDevPx | 修复后 | 变化 | 结局 |
|---|---|---|---|---|
| 120hz | 224.58 | 219.37 | −2.3% | WIN@2996 不变 |
| 144hz | 286.92 | 224.39 | **−21.8%** | WIN@3596 不变 |
| jitter8ms | 223.71 | 140.86 | **−37.0%** | WIN@1500 不变 |
| 50hz | 225.83 | 236.70 | +4.8% | WIN@1247 不变 |
| spike5pct | 212.43 | 212.43 | 0（max 在 f13=入风柱前定格，风区差异不超早峰） | WIN@1414 不变 |

结局集合零变化；**风区段漂移按预期收窄但不清零**——其余差异来自输入重量化+积分器差（03 号档 §7.2 口径），不是阻尼一项能拉平的，与 §6"不存在拉平谱的口径"互证。

**forest_03（2 风柱， initialState=1）**：**全部 12 行（6 调度×2 映射）与归档位级相同**（120hz time DEAD@f565/227.73、50hz DEAD@f229/220.07 等逐一相符）。根因探针：60hz 基线风接触窗 = f418–f559（墙时 6.97–9.32s），而全部翻调度的死亡发生在墙时 3.5–4.8s——**角色到死都没进风柱，阻尼根本没参与**。→ **03 号档 §4.1"forest_03 翻转有风阻尼硬缺陷背书"的归因被实验证伪**：forest_03 的跨 dt 翻转是入风柱前的平台段（razor）所致；"风关"标签不构成该关翻转的机制解释。勘误已按槽规追加至 03 号档尾（§8 产物之后，不改动原文其它内容）。

## §6 真机 e2e 绿关复跑（npm run build 后，口径 repeat3 × offset −15）

| 关 | 结果 | 明细 |
|---|---|---|
| forest_04 | **3/3 ALL PASS** | winAt 19.4s 级 |
| forest_12 | **3/3 ALL PASS** | winAt 13.1s 级 |
| forest_01 | 2/3 × 3 次（fail 分别 run1/run1/run2，超时于不同段） | **A/B 排除回归**：`git checkout 79342f4`（修复前内核）复跑同口径同样 **2/3**（run3 超时）；失败散布不同 run、失败形态不同（wg 未登门/双人未登门/中段坠落）——本机已知开局相位彩票（10-16 handoff c06c6e3 实锤 ±1-2f）+当日 goldfix 槽并行占用，与内核 diff 无关 |

**forest_01 与 diff 无关的硬证明**：该关风柱数=0（探针）→ 两笔修复的代码路径完全不执行；且 det r32 位级全同已封死"任何关卡物理被改变"的可能。当日未重试至绿（重试至绿=不诚实），如实记录 2/3×3 + 修复前 2/3×1 的对照。

## §7 对既有档卷与后续槽的影响

- **05 号档行动清单**：第 1 项（风阻尼 dt 加权修复）**关闭**——但结果形态与预期不同：预期"det r32→r33 重录+fixtures --update 人审"实际为零漂移（§3 位级中性），"预期 forest_03/26 类风关跨 dt 翻转显著收窄"实际=forest_26 收窄不清零、forest_03 不动（翻转非阻尼驱动，§5）。
- **03 号档**：§4.1/#4 的"内核唯一 1/60 假设"审计结论成立且已修；但其对 forest_03 翻转的归因部分证伪（§5），尾注记已加；"修后重跑本谱验证风关漂移收窄"已执行，数据在 `tools/dtsweep/postfix-windsem/`。
- **goldfix 槽（06 号档）衔接**：其⑦预案"修复落定前不建风关 oracle fixture"的等待已解除。修复后内核按实录 dtSeq 回放时，风阻尼对 oracle 逐 tick 同式（§3 运算序同双精度），风关 oracle 金 fixture 的阻尼口径障碍清除；风相位（sin 时基 #8）仍是下一个对拍项（行动清单 #3）。
- **内核注释勘误**：旧注释"bundle 内英文注释为再分发者所加"证伪（§1.1），"门 b·d>0"与"v×(1−0.025·elapsed/16.67) 线性式"均与原文字不符，已随 4198ef3 一并更正。

## §8 诚实边界

1. 单 seed（20261017）单序列复扫：jitter/spike 各是一条 dt 序列；收窄幅度是"该序列下"的数，非分布。
2. forest_26 的 50hz 行 +4.8%：收窄不是单调保证——阻尼修正改变的是轨迹本身，maxDev 是对 60hz 基线的偏差泛函，可升可降；结论只主张"风区段行为更接近 oracle 公式"，不主张"谱全面变平"（03 号档 §6 已证不存在拉平口径）。
3. forest_03 归因证伪只覆盖该关现有路线与 5 个合成调度；"其它风关的翻转是否阻尼驱动"须逐关对照"死亡墙时 vs 首风接触墙时"才能归因（复用本档探针法，成本每关一次 route 回放）。
4. e2e forest_01 当日 2/3 的环境归因有 A/B 支撑但样本小（修复前后各若干次）；如需更硬口径可在独占机时段复跑。
5. 本槽未动：sin 相位时基（#8，F6 已裁定）、`min(0.04,·)` 步长帽（oracle L65631 有、内核无——现有喂入 dt ≤ 21ms 远不及 40ms 帽，零行为差；记为观察项，非本槽范围）。

## §9 产物与复现

- 内核：`packages/shared/src/kernel/mechanisms.ts` + `world.ts`（commit `4198ef3` + `99ed9fc`）
- 数据：`tools/dtsweep/postfix-windsem/`（forest_03/26 修复后谱 + summary.csv）
- 复现：
  ```
  node --import tsx benchmark/perf-determinism.mjs --compare r32        # 48/48 位级一致
  node --import tsx scripts/e2e/routetool/fixture-runner.mjs            # 4/4 PASS maxDev 0
  node --import tsx scripts/e2e/routetool/dtsweep.mjs --levels forest_03,forest_26 --outDir TEMP/windsem/dtsweep
  node scripts/e2e/route.mjs --level forest_04 --repeat 3 --offset -15  # ALL PASS
  ```
- TEMP/windsem 探针（damping/activeroles/firstactive/nowind/windstate）已于收尾清理（结论均录本档）。
