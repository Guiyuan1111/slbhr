# 复刻程度审查方法论（Fidelity Audit Method）

> 产出日期：2026-10-11。性质：**只读盘点后的方法设计**——定义「如何审查复刻程度」的分层口径、
> 观测点清单、日志格式与补齐路线，不含实现代码。
> 缘起（用户关切）：「只有调试的方法搞好，才能确保检验的结果符合预期」。0.3.27 门卡摆是标本：
> 单测全绿、det 48 关位级全绿、e2e 通关全绿，实玩必挂（note/self-acceptance.md §一、
> research/2026-10-fidelity/13-door-sweep-stall.md）——检验结果可信的前提是**观测与裁决方法本身可信**。
> 行号基准：2026-10-11 实读工作区。行号会漂移，**函数名+代码片段为第一锚点，行号仅辅助定位**
> （惯例沿 note/plans/wiring-0.3.0.md）。

---

## 一、审查维度分层（六层口径）

复刻程度不是一个数字，是六层各自独立可裁决的信号集。每层定义：审查什么 / 用什么信号 / 判定标准。
与自验收阶梯（note/self-acceptance.md §二 L0-L4）的映射见 §一.7。

### 1.1 输入层——一次按键从浏览器到 `currentInputs` 的全链路

| 项 | 内容 |
|---|---|
| 审查什么 | ① 派发时刻精度（计划 t vs 实际 done）；② 服务端入队到达时刻；③ 意图跨度排水是否把事件归入正确帧（`deadline = startedWall + stepIndex·STEP_MS + 4`，ForestRoom.ts `tick()` 内）；④ 有无事件跨 ≥2 帧漂移或被 128 深度队列截断（ForestRoom.ts `inputQueue` 上限 splice） |
| 用什么信号 | 派发侧 trace：route.mjs `dispatch` 循环逐事件写 `{t 计划, done 实际, f, role, dir, type}`；消费侧日志：`FW_DUMP=1` 时 ForestRoom `onMessage("input")` 入队（带 `Date.now()`）+ tick 内 `consume` 行 `{consume 帧号, role, at, keys}`；锚点：服务端 `[phase] started @<wall>`（beginReady 的 setTimeout 回调） |
| 判定标准 | 统计级：派发偏差 `done−t` 直方图（p95 ≤ ~5ms 量级，绝对值随环境标定）；消费帧 − 计划帧 ∈ {0, ±1}，≥2 帧记缺陷；`at` 分布应聚集在 `f·16.67−10±窗口`（OFFSET=−10 设计，route.mjs 头注）。无「输入丢失」（每派发事件恰有一条 consume 行） |

### 1.2 传输层——权威 state 是否真实到达客户端

| 项 | 内容 |
|---|---|
| 审查什么 | 服务端 `syncState()` 全部映射条目的字段是否真实上 wire（Colyseus defineTypes 漏注册则客户端解码为 undefined，0.3.25 BodyState.state 即此缺陷，note/self-acceptance.md §一）；patch 到达节奏与客户端观测延迟 |
| 用什么信号 | lib.mjs `syncProbe()`：页面内直读权威 state，断言 platforms/props/hangings/pulleys/romans 的 `state` 字段、doors 六字段、levelId 全部非 undefined；route.mjs 页内 40ms 记录器 `__rec`（客户端视角坐标时间线）；0.3.27 附带审计范式（handoff.md 更新①：服务端→客户端全链审计） |
| 判定标准 | 位级存在性：syncProbe 零缺失（计入 regression PASS 判定，已落地）；统计级：`__rec` 客户端观测坐标与服务端 dump 同帧坐标收敛（滞后 ≤ patch 周期 50ms + RTT，作为新增分析项，见 §四 缺口 3） |

### 1.3 确定性层——三个对拍面（位级 / 阈值级 / 统计级）

| 对拍面 | 审查什么 | 信号 | 判定标准 |
|---|---|---|---|
| C1 内核↔内核（跨提交） | 引擎任何改动前后物理是否位级一致 | benchmark/perf-determinism.mjs：48 关 × idle+scripted 双输入 × 600 步，每步全刚体 6×f64 原始位链式 SHA-256（含体数，销毁体也被捕获） | **位级**：`--compare <基线>` 逐关哈希全等，退出码 0/1（benchmark/results/det-*.json 快照体系） |
| C2 内核↔原版（金轨迹） | 与原版同输入同定步长下的数值贴合 | scripts/baseline/capture.mjs 采集原版 fixed-dt 金轨迹（Step 钩子前后采样，`{f,dt,b:{tag:{x,y,a,vx,vy}},fl:{...}}`）；diff-kernel.mjs / fidelity-score.mjs 逐帧对拍（SETTLE=5、INPUT_SHIFT=1 为实测标定） | **阈值级+统计级**：<0.05m 积分细节级 / <0.15m 一致 / <0.5m 行为一致 / ≥0.5m FAIL（diff-kernel.mjs 头注）；评分 `bodyScore=100·exp(−(maxDisp−0.05)/0.6)`、综合 = 0.6·mean(bodyScore)+0.4·mean(endScore)（fidelity-score.mjs 头注）；终态/机制一致、逐帧混沌为已知定性（research/11 §2） |
| C3 内核↔服务端（同实现双宿主） | 服务端 60Hz 累加器 + inputQueue 管道是否引入任何非内核语义的偏差 | 服务端 `FW_DUMP=1` 逐帧 dump（ForestRoom.ts `tick()`，与内核 trace 同「step 后写」惯例）↔ routetool/kernel.mjs `runKernel` 的 `traceTo` 逐帧 `{f, fb:[x,y], wg:[x,y], ph}`（两侧同为 `snapshotPlayer` 的 px 值，量纲一致） | **位级**（同输入模式）：把 dump 的 `in` 字段逐帧喂内核复跑，fb/wg 应与 dump 逐位全等——这是「服务端管道无隐藏状态」的可操作定义；**统计级**（真实回放模式）：route.mjs 真实键盘回放产生的 dump vs 路线表回放的内核 trace，事件消费偏差 ±1 帧窗、逐帧位置差 p95 阈值（建议 ≤2px/帧当步） |

### 1.4 行为层——真实输入 → 真实服务端 → 双浏览器通关

| 项 | 内容 |
|---|---|
| 审查什么 | 全链路集成：相位机（lobby→ready→started→won/gameover）、输入管道、网络同步、死亡/重开/续关/暂停/断线补位等用户旅程 |
| 用什么信号 | route.mjs（双浏览器真实键盘回放，repeat≥3，全程零调试钩子，断言读权威 state）；regression.mjs（soak / 强制通关 / 真实走位入门 zz_probe）；journey.mjs（journey/pause/rejoin 三旅程）；touch.mjs（触屏虚拟键）；fixtures/levels/zz_probe.json 运行时安装/移除 |
| 判定标准 | repeat≥3 ALL PASS（每轮 `won && !diedAt && !dispatchError`，route.mjs 汇总写 route-results.json）；journey/regression 全 check 通过；页面 `window.__errs` 全程为空；**加速器钩子（FW_DEBUG_FORCE_DOORS 等）只作加速，其覆盖面必须有非钩子等价用例**（lib.mjs 头注、self-acceptance.md 教训 2） |

### 1.5 视听层——关键帧画面 / 动画状态 / 响度

| 项 | 内容 |
|---|---|
| 审查什么 | 布局/贴图/相机/时钟等渲染面；角色动画状态机（head/legs/facing）；音频响度表 |
| 用什么信号 | benchmark/visual-diff.mjs：原版第 60 物理帧 vs 我方 started+1s，页内 480×360 灰度归一 + ±48px 平移搜索，报告容差 24/48 匹配率与 HUD 带单列；benchmark/fidelity-anim.mjs：原版实机动画轨迹逐帧对拍（对齐窗 ±0.1m + 输入沿 ±2 帧剔除，legs 规则可选）；benchmark/audio-loudness.mjs：静态解析逐键音量 + 运行时 `__fw.sound.volume` 探针；截图制品 scripts/e2e/out/*.png、note/report/visual-0.2.0/ |
| 判定标准 | **统计级回归**：视觉指数（容差 48 匹配率，最新 95.20，handoff.md 0.3.23 条）、动画 composite 99.97（results/anim-f1-final.json）、物理 composite 84.53（results/r6-final.json）、响度 12/12 键对齐——均 `--compare` 基线不降；最优平移偏移应在 (0,0) 附近（非零=系统性取景偏移，F3 曾据此修复 16px 偏移）；关键演出帧（死亡烟雾/通关楼梯/星级板/菜单）按冻结 #4 口径截图抽查（handoff/2026-10-04-execution-freeze.md §一#4），不做全量像素对比 |

### 1.6 功能层——菜单/存档/音效/触屏等全功能面对齐

| 项 | 内容 |
|---|---|
| 审查什么 | 与原版全功能面逐项勾稽：菜单树（TempleHall/选关/Settings/Credits/gameComplete）、存档解锁与星级、结算「继续」链、教学文本、触屏、音频键表 |
| 用什么信号 | research/2026-10-fidelity/09-ui-states.md（原版 UI 状态机规格）、10-gap-analysis-2026-10.md（逐项差距清单与三态处置）；journey.mjs journey 场景（通关→存档→继续→新房）；touch.mjs；audio-loudness.mjs |
| 判定标准 | 清单逐项三态：**已复刻 / 有意偏离（联机化决定，须记录）/ 缺口**——不允许存在未分类项（10-gap-analysis 的口径）；每项功能性改动同提交附带 L3 用例（self-acceptance.md §四） |

### 1.7 与 L0-L4 的映射

| 六层 | L0 静态 | L1 内核 | L2 数值 | L3 行为在体 | L4 视觉 |
|---|---|---|---|---|---|
| 输入层 | — | — | — | ●（route dispatch/consume trace） | — |
| 传输层 | — | — | — | ●（syncProbe） | — |
| 确定性层 C1/C2 | — | ●（属性化用例） | ●（det/金轨迹） | ●（C3 经真实管道） | — |
| 行为层 | — | — | — | ●（全部场景） | — |
| 视听层 | — | — | — | — | ●（visual-diff/anim/loudness + 抽查） |
| 功能层 | ●（typecheck/build） | — | — | ●（journey/touch） | ●（UI 截图） |

六层是**观测口径**，L0-L4 是**执行门禁**：每层信号必须能挂到至少一个 L 上成为强制门（§五）。

---

## 二、观测点与调试日志设计

### 2.1 现有观测点清单（全部实读核实）

**服务端（packages/server/src/rooms/ForestRoom.ts）**

| 观测点 | 位置 | 内容与格式 |
|---|---|---|
| 输入入队 | `onMessage("input")` | `{t: Date.now(), role, data 全量快照}` 入 inputQueue；超 128 截断（隐式观测：截断即缺陷） |
| consume 日志 | `tick()` 内 `FW_DUMP==="1"` 分支 | `{"consume":<帧号>,"role":"watergirl","at":<t−startedWall>,"keys":{up,left,right}}`——逐事件消费记录 |
| 逐帧状态 dump | `tick()` 内同分支，world.step 之后 | `{"f":<帧>,"fb":[x,y],"wg":[x,y],"in":{"fb":{...},"wg":{...}}}`——px 单位，snapshotPlayer 口径；实测样例 TEMP/server-dump-1.jsonl（3649 行，consume 与 f 行交错） |
| 落盘机制 | `dumpBuf`/`dumpReset()` | 内存缓冲 ≥30 帧批量 `appendFileSync("TEMP/server-dump-<seg>.jsonl")`；开钟/重开时 `dumpReset()` 换段——**观测不扰动被测的现有实践**（见 §三） |
| 相位时间戳 | `beginReady()` | `console.log("[phase] ready @<Date.now()>")` / `"[phase] started @…"`——纯观测，注释明言「不参与任何逻辑分支」，是 route.mjs t0 锚定的权威源 |
| 调试钩子 ×3 | `onCreate()` | `FW_DEBUG_AUTO_WIN`（注入 win 事件）/ `FW_DEBUG_DOORS`（2s 打印门状态）/ `FW_DEBUG_FORCE_DOORS`（500ms 置双门 isOpen）——仅加速器，门禁本体禁用（§三） |

**内核 harness（scripts/e2e/routetool/）**

| 观测点 | 位置 | 内容与格式 |
|---|---|---|
| 逐帧 trace | kernel.mjs `runKernel(…, {traceTo})` | 每步 push `{f, fb:[x,y], wg:[x,y], ph}`；返回 `{won, deathF, winF}` |
| trace 落盘 | validate.mjs `--trace <out>` | JSON 数组写盘；死亡时截断到 deathF+1 |
| ±1f 硬化信号 | optimize.mjs `scanTables`/`moveSets` | 逐事件 ±1f 致命计数 fatal、成组平移移动集；每轮 sweep 落 `<route>.best.json` 断点 |

**真实门禁 runner（scripts/e2e/route.mjs + lib.mjs）**

| 观测点 | 位置 | 内容与格式 |
|---|---|---|
| 派发 trace | route.mjs `dispatch` 循环 | `{dispatch:{t, done, f, role, dir, key, type}}` 混入 result.trace |
| 页内相位观察器 | route.mjs `a.evaluate` 注入 | rAF 逐帧记录 `__fwPhaseT[phase]=Date.now()`——锚定原理：ready 与 started 的观察延迟同源相消 |
| 页内 40ms 记录器 | 同上 `__recTimer` | `{t, ph, fb:[x,y], wg:[x,y]}` 只读权威 state，客户端视角 |
| 锚定元数据 | `result.flipAnchor` | readySeen/startedSeen/joinedB/used/serverReady/serverStarted/obsLatency×2——锚源四级回退全程留痕 |
| 250ms 采样器 | `sampler` 协程 | `{f, fb, wg, ph}`（f 由墙钟反推） |
| 截图 | mid @5s / win+2.2s / fail | `scripts/e2e/out/route-run<N>-{mid,win,fail}-{a,b}.png` |
| 汇总 | route.mjs 末尾 | `out/route-results.json`：{level, offset, pass, results[]} |
| sync 探针 | lib.mjs `syncProbe()` | 字段存在性错误串数组（regression 计入 PASS） |
| started 闸 | lib.mjs `waitForStarted()` | 读权威相位，注释记录 250ms DOM 假空窗教训 |

**原版对照链路（scripts/baseline/ + benchmark/）**

| 观测点 | 位置 | 内容与格式 |
|---|---|---|
| 原版伺服 | serve-original.mjs | `output/A/` 挂 127.0.0.1:8787（8099 为参考魔改页，**不当金标准**；capture.mjs 走 8787 纯净站） |
| 金轨迹采集 | capture.mjs | 跳关 + Step 前注入键盘 + Step 后采样 `{f, dt, b:{tag:{x,y,a,vx,vy}}, fl:{ended,d1up,…}}`；`--runs≥2` 双跑确定性复验输出逐帧漂移；`--fixed-dt` 对拍模式；机关专项含钻石计数 d1d/d1s |
| 金轨迹成品 | golden/*.json | 5 条 fixeddt（forest_01_a1 / 03_wind / 04_pulley / 07_ball / bonus_2_boxheavy）+ 输入脚本；README 记录双跑漂移与首分叉帧 |
| 原版↔内核对拍 | diff-kernel.mjs | 逐体 maxDx/maxDy/maxΔv + 全刚体 RMS + 首超 0.5m 帧；阈值四级判定 |
| 位级门禁 | benchmark/perf-determinism.mjs | 48 关链式哈希 + `--save/--compare` 快照（results/det-*.json） |
| 复刻度评分 | fidelity-score.mjs / fidelity-anim.mjs / visual-diff.mjs / audio-loudness.mjs | 见 §1.5；快照 results/{r6-final, anim-f1-final, visual-r15, audio-f4}.json |

**行为/功能 e2e（scripts/e2e/）**：regression.mjs（soak/强制通关/真实走位 + syncProbe）、journey.mjs（journey/pause/rejoin，断言读权威 state 或服务端日志）、touch.mjs（Playwright 触摸仿真五检查点）、fixtures/levels/zz_probe.json（探针关运行时装卸）。

### 2.2 各层日志格式规范（现状 + 增补设计）

| 层 | 流 | 格式（增补以 ▲ 标注） | 落盘与采样 |
|---|---|---|---|
| 输入 | 派发 | `{dispatch:{t, done, f, role, dir, type}}`（已有）；▲ 汇总增补 `{dispStats:{n, p50, p95, max}}` | route-results.json 内，全量事件 |
| 输入 | 消费 | `{consume, role, at, keys}`（已有）；▲ 增补逐事件 `cf = consume − (f + offset)` 偏差与直方图 | TEMP/server-dump-*.jsonl，全量；直方图由 differ 汇总 |
| 确定性 | 服务端 dump | `{f, fb:[x,y], wg:[x,y], in:{fb,wg}}`（已有，30 帧批量） | TEMP/server-dump-<seg>.jsonl；▲ 门禁模式改落 `scripts/e2e/out/server-dump-<run>.jsonl` 归档 |
| 确定性 | 内核 trace | `{f, fb, wg, ph}`（已有） | validate `--trace`；▲ route 门禁轮内自动生成并归档 |
| 传输 | 客户端记录 | `{t, ph, fb, wg}` @40ms（已有）；▲ 增补 `__rec` vs dump 的滞后估计（互相关首峰） | 内存 + result.trace；分析入 differ 报告 |
| 行为 | 轮次结论 | `{tag, won, winAtMs, diedAt, finalPhase, final, flipAnchor, trace[]}`（已有） | route-results.json |
| 视听 | 关键帧 | PNG 截图 + visual-diff JSON（已有）；▲ 扩展为「关键帧集」：每类演出/机关动作一帧，命名 `<level>-<anchor>-f<物理帧>.png`，锚定物理帧而非墙钟（复用 capture.mjs 物理步计数钩子口径） | benchmark/results/visual-*、note/report/ |

### 2.3 重点设计：内核 trace ↔ 服务端 dump 自动 diff 工具（建议 `scripts/e2e/diff-trace.mjs`）

**定位**：C3 对拍面的裁决器——当前两侧 trace 都存在（validate --trace、FW_DUMP）但无自动比对，
0.3.27 类「管道语义缺陷」恰好落在两者之间。规格：

- **输入**（三个文件 + 一条路线）：
  1. 服务端 dump：`FW_DUMP=1` 一轮产生的 `server-dump-<seg>.jsonl`（consume 行 + f 行）；
  2. 内核侧参照：路线 JSON（`scripts/e2e/inputs/routes/<level>.json`）经 `runKernel(traceTo)` 再生 trace，**或** dump 的 `in` 字段直接作为逐帧输入喂 `World.step`（同输入模式，推荐为主判据）；
  3. 路线 JSON 本身（事件表，用于对齐与延迟统计）；
  4. 参数：`--mode same-input|replay`、`--tol-px`、`--event-window`。
- **对齐方式**：
  - 帧号直对齐：两侧同一计数原点（服务端 `stepIndex` 在开钟清零、dump 同步换段；内核 f=0 为第一步；两侧同「step 后写」惯例）；
  - 量纲直比：两侧均为 `snapshotPlayer` 的 px 值，无坐标变换；
  - 事件对齐：consume 行的 `consume` 帧号 vs 路线事件计划帧 `f`（真实回放语义下 offset=−10 已计入，比对 `consume − (f+offset)`）；
  - 分段处理：dump 按段号拼接，段边界=开钟/重开，只取与内核 trace 对应的首段（重开语义下逐段各自对齐）。
- **输出报告**（JSON + 人读摘要，落 `scripts/e2e/out/diff-trace-<level>-<run>.json`）：
  - `sameInputBitExact: boolean`——同输入模式逐帧 fb/wg 逐位全等与否；不等时给**首个失位帧**、失位体与双端数值；
  - `posStats`——逐帧位置差 max/p95/RMS（replay 模式）；
  - `eventTable`——逐事件 {计划 f, 派发 done, 到达 at, 消费 consume, 偏差 cf}；`latencyHistogram`——派发偏差、入队→消费偏差双直方图（分桶 1 帧）；
  - `winAgreement`——内核 winF vs 服务端 dump 首帧 `in.fb.atDoor&&in.wg.atDoor` 后 isUp 收敛帧（或 dump 终态）一致性；
  - 结论行：`C3 same-input 位级 PASS/FAIL`、`C3 replay 统计 PASS/FAIL`。
- **容忍度统计**：same-input 模式**零容忍**（位级全等——同一 World 实现、同一输入序列、同一 V8；任何一位差即服务端管道缺陷）；replay 模式事件偏差容忍 ±1 帧（服务端 deadline 设计吸收带）、位置差建议阈值 ±2px（后续按实测标定，方法同 INPUT_SHIFT 标定：全表扫描取最优并报告灵敏度）。
- **实现要点**：same-input 模式需给 kernel.mjs 增加逐帧输入回放入口（现 `runKernel` 只吃事件表；dump 的 `in` 即逐帧输入数组，扩展一个 `runFromInputs(level, framesIn)` 即可，不动 World）；解析 JSONL 逐行流式读取，避免整文件载入。

---

## 三、可信度原则（观测方法论的红线）

1. **观测不得扰动被观测**。现有实践为范本：
   - ForestRoom.ts `dumpBuf` 头注释：「每步 appendFileSync 在 Windows 上的阻塞会反过来污染输入到达
     时刻，诊断工具不得干扰被测系统」——内存缓冲、30 帧批量落盘、开钟换段；
   - route.mjs 页内观察器：「只读权威 state，零行为干预」；CDP 预热用 Shift（不在游戏键表，无副作用）；
   - capture.mjs：`--shot` 截图有节流扰动「金轨迹勿用」（baseline/README.md 已知限制节）；console.log
     被原版覆写为 noop，探针走预存 `__origLog`；
   - 推广规则：**新增任何逐帧观测必须走内存缓冲 + 批量落盘；任何截图/渲染开启的采集模式不得与
     数值金轨迹混采**；高频记录器（如 __rec 40ms）只允许读，不允许写任何参与判定的状态。
2. **门禁本体禁调试钩子**。route.mjs 头注「全程零调试钩子：物理只由真实键盘输入驱动」；lib.mjs 头注
   「FW_DEBUG_* 只允许作为加速器，其覆盖面必须另有非钩子等价用例」。0.3.27 教训①的根因正是
   FORCE_DOORS 与传送实验共享「双门同帧锁步」盲区（self-acceptance.md §一；13-door-sweep-stall.md）。
   推广规则：**任何经 FW_DEBUG_* 跑过的门禁，必须在同版本内存在一条非钩子等价用例并 PASS**。
3. **证据落盘为制品，可复验**。数值结论必须能从制品重放：scripts/e2e/out/（route-results.json +
   截图）、benchmark/results/（det-/visual-/anim-/audio- 快照，--save/--compare 体系）、
   scripts/baseline/golden/（金轨迹 + 输入脚本 + meta.inputScript 一致性）、note/report/（对比报告）。
   文档引用遵循「函数名+片段为第一锚点，行号仅辅助」（wiring-0.3.0.md 惯例）。
4. **测试与实现不得共享盲区**。自验收教训 1：「测试与实现共享假设时，测试只是实现的复读机」——
   必须存在与实现不同源的用例：原版 bundle 字证（research 01/02/13 的 @字节偏移体系）、金轨迹
   （原版实机采集）、属性化随机用例（L1）。**金轨迹实证 > bundle 静态解读**（research/11 §2B 三次
   静态误读均由金轨迹裁决）。
5. **锚定必须消掉观察延迟**。t0 锚定从 readySeen+2000（把 ~50ms 观察延迟系统性算进零点，导致
   混合 +3f/+4f 滑帧）演进为服务端 `[phase] started` 权威戳 + mono↔wall 桥接（route.mjs 头注与
   flipAnchor 元数据）——**任何新时间锚必须记录观察延迟项并相消或留痕**（flipAnchor 模式）。

---

## 四、缺口清单与补齐顺序

现有覆盖：输入层（派发/消费两侧 trace 均有，缺汇总统计）、传输层（syncProbe 已成门）、确定性层
C1/C2 完备、C3 两侧数据齐但**无裁决器**、行为层单关完备（48 关覆盖面缺）、视听层单帧完备
（关键帧集缺）、功能层清单化管理已有。

按建议补齐顺序（编号即顺序）：

| # | 缺口 | 现状证据 | 建议实现 | 验收标准 |
|---|---|---|---|---|
| 1 | **内核↔服务端自动 differ**（C3 裁决器） | 两侧 trace 齐备（§2.1），无自动比对；0.3.27 缺陷位于此层 | 按 §2.3 规格新建 scripts/e2e/diff-trace.mjs；kernel.mjs 增 `runFromInputs` | FW_DUMP 一轮 → 报告 `sameInputBitExact=true`；人为注入一处服务端偏差能被 FAIL 捕获（工具自检） |
| 2 | **服务端 dump 接入门禁 runner** | route.mjs `startServer(PORT)` 未传 extraEnv（route.mjs 主流程），FW_DUMP 只能手动开 | route.mjs 增 `--dump` 旋钮传 `FW_DUMP:"1"`，产物落 out/ 并随轮归档 | `route.mjs --dump` 一轮后 out/ 内 dump 与 route-results.json 同轮可查；differ 自动被调用（与 #1 串联） |
| 3 | **输入链三层延迟直方图** | dispatch{t,done} 与 consume{at} 均已落盘，无统计汇总 | differ 内实现（§2.3 eventTable/latencyHistogram），route-results.json 增 dispStats | 每轮报告 p50/p95/max 三分布；消费偏差 cf 直方图全部落在 ±1 帧 |
| 4 | **48 关路线库 + 批量真实通关跑批器** | 路线库仅 forest_01（inputs/routes/）；self-acceptance §五.1 已列此缺口 | routetool 产线逐关初排→optimize→validate 产出 48 路线；新跑批器循环调 route.mjs（端口错开/串行）并汇总矩阵报告 | 48 关 × repeat≥3 ALL PASS 矩阵入 out/；任一关 FAIL 报告定位到轮与事件 |
| 5 | **视听关键帧集扩展** | visual-diff 仅 forest_01 第 60 帧 idle 单场景（FRAME_TARGET=60） | 按 §2.2 关键帧命名规范扩 capture 基建：每类机关动作/死亡/通关演出各 ≥1 帧 × 抽样 8-10 关；物理帧锚定 | 关键帧集基线建立并入 --compare 回归；冻结 #4 口径（抽查非全量）保持 |
| 6 | **音频行为级断言** | audio-loudness 为静态表+运行时音量（audio-loudness.mjs），无「事件→发声」断言；self-acceptance §五.3 | 页内 hook Phaser sound 播放调用记录 {key, t}，断言 win/death/diamond/mech 事件后对应 key 出现 | journey/regression 场景内追加音频断言，通关轮检出全部预期 sfx key |
| 7（可选） | 求解器内部状态校验和 | research/11 §3 工具对照表标「未建」，定位为诊断增强 | 借 crashcat 方案对 warm-start/island 做 per-step checksum，仅诊断不计分 | 分叉「发生在第几帧、哪个子系统」可实测（配合 C2 首超帧定位） |

补齐顺序依据：#1-#3 同属「确定性层闭环 + 输入层量化」，共享一次实现且直接回应 0.3.27 类漏网
（真实管道无位级证据是当前方法最薄弱点）；#4 把行为层从单关外推到 48 关全覆盖（用户验收口径
「48 关全部真实可通关」的唯一直接证据）；#5-#6 补视听/功能层的自动化覆盖面。

---

## 五、与产线的衔接（routetool 初排→optimize→validate→route 门禁）

| 环节 | 挂接的审查信号 | 落盘制品 |
|---|---|---|
| 初排（人工/半自动内核走通） | render-level.mjs ASCII 地图；validate `--trace` 逐帧位置人工诊断；baseline README 机关机制结论（金轨迹 14 轮实测） | trace JSON（诊断期，可不归档） |
| optimize（±1f 硬化） | fatal 计数逐轮递减曲线即硬化信号；`.best.json` 断点 | `<route>.opt.json`（source 字段记录 fatal 统计，optimize.mjs 已实现） |
| validate（内核复核） | C2 同口径内核回跑；**--trace 必开并归档**（升为规范） | out/validate-<level>-trace.json |
| route 门禁（真实服务端） | 输入层 dispatch/consume trace；C3 differ（--dump 联动 #1/#2）；flipAnchor 元数据；行为层 repeat≥3 ALL PASS；syncProbe（随 regression） | out/route-results.json、server-dump-<run>.jsonl、diff-trace-*.json、截图 |
| 发版门（self-acceptance §四） | L0 typecheck/build；L1 vitest 属性化；L2 `det --compare` 48 关位级 + fidelity-score/anim/visual `--compare` 不降；L3 §三全场景；L4 截图留档 | release/<版本>.md 记录本轮各层结果（既有制度） |

衔接原则：**产线每一环的输出即下一环的输入与证据**——路线是输入层的计划，trace 是确定性层的
观测，differ 报告是 C3 的裁决，route-results 是行为层的裁决；四者同轮归档后，任何一关的 PASS/FAIL
都能从制品回放到事件级原因。

---

## 六、待核实

1. self-acceptance.md §五.4「触屏无 e2e 覆盖」与 touch.mjs 已存在的事实存在时间差（文档滞后），
   制度文档更新不在本任务范围内；
2. visual-diff 最新指数以 results/visual-r15.json 原始 JSON 为准（本档引用 handoff.md 0.3.23 条的 95.20）；
3. §2.3 replay 模式位置差阈值 ±2px 为建议初值，需按 #1 落地后实测标定（方法：全表扫描 + 灵敏度报告，
   同 INPUT_SHIFT 标定惯例，research/11 §2C）。
