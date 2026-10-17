# 02 号档 · 虚拟钟 oracle 机：确定性 60Hz 改造与最小差分验证（vtoracle 槽）

> 结论先行：**CDP 虚拟时间能虚拟化 `Date.now` 但管不住 rAF（headless shell 里 `HeadlessExperimental.beginFrame` 直接协议错误）——survey §4.4 的"组合拳"假说只对了一半。定案"退路 A 强化"：init-script 全假钟（`Date.now` + `requestAnimationFrame` + 定时器）+ Node 控制器逐帧放行，每步恰一次 `game.update`，零竞态。成品达成：同输入 ×3 逐位一致（forest_01 路线 2500 帧全量浮点 + hold-right 两口径）；与内核差分对（forest_01）：出生点静态偏置仅 0.0135px，动态段漂移中位 16px/峰值 99px 且落点重收敛，双方均 WIN（内核 f2365 / oracle f2463，+98 帧 = +4.1%，与 dt 整数 ms 量化定量吻合）。**
>
> - 日期：2026-10-17
> - 槽位：vtoracle（survey 01 号档 §4.3/§4.4/§6 推荐一的 oracle 侧落地）
> - 交付：`scripts/e2e/oracle/`（lib.mjs 驱动库 / vtrun.mjs 确定性验收 / vtdiff.mjs 差分对）；oracle 目录（Fireboy-and-Watergirl）与内核（scripts/e2e/routetool/kernel.mjs）、o25a 全程只读
> - 数据：`scripts/e2e/out/oracle-vt/`（gitignored，复现命令见 §6）

## §0 一页结论

| 验收项 | 要求 | 实测 | 判定 |
|---|---|---|---|
| STEP1 冒烟 | Date.now 是否被 CDP 虚拟化；rAF 是否确定性 | Date.now ✓；rAF ✗（真实合成器钟）；beginFrame ✗（协议错误） | 路线改判（§1） |
| STEP3 确定性 | forest_01 简单脚本 ×3 状态流逐位一致 | 路线 ×3 与 hold-right ×3 均 BITEXACT（2500 帧全量 float64 逐位） | PASS |
| STEP4 差分对 | 出生点校准 → 首发散帧 + 双方数值 → 发散前差值曲线 | f0 静态偏置 0.0135px；动态段中位 16.2px / 峰值 98.7px；双方 WIN | PASS（差距清单见 §5） |

## §1 STEP1 冒烟：CDP 虚拟时间三问三答

环境：Playwright Chromium headless shell（与 o25a 同基建），`Emulation.setVirtualTimePolicy` budget 泵步 16.667ms。

1. **`Date.now` 虚拟化？——是。** budget 推进下 `Date.now()` 精确跟随虚拟钟，无真实墙钟泄漏。survey §4.4 引 Blink 设计文档标注的"唯一前置不确定点"就此落定（设计文档：[Deterministic page loading for Blink](https://github.com/rstudio/pagedown/issues/22)；协议总纲：[devtools-protocol](https://chromedevtools.github.io/devtools-protocol/)）。
2. **rAF 确定性触发？——否。** budget 泵 48/60 步 rAF 回调数为 0，`maxVirtualTimeTaskStarvationCount` 也救不动；`policy=pause` 同样冻不住 rAF（合成器真实钟驱动，不走虚拟钟）。"rAF/timer 在虚拟时间下必确定性"这条 survey 的乐观假设在本环境被证伪（方法文档：[setVirtualTimePolicy](https://chromedevtools.github.io/devtools-protocol/tot/Emulation/#method-setVirtualTimePolicy)）。
3. **`HeadlessExperimental.beginFrame` 兜底？——否。** Playwright headless shell 下直接协议错误（[beginFrame](https://chromedevtools.github.io/devtools-protocol/tot/HeadlessExperimental/#method-beginFrame)），纯 CDP 帧驾驭路线不可用。

**定案：退路 A 强化**（survey §4.2 的 fake-clock 路线，加定时器与锚定工程）：init-script 在页面任何脚本前劫持 `Date.now`/`requestAnimationFrame`/`setTimeout`/`setInterval`/`clearTimeout`/`clearInterval`，Node 控制器 `__vt.step(n)` 逐帧放行——每步从 rAF 队列取回调、先扫到期定时器再跑本帧 rAF（帧内快照防同帧循环）。一个 `step` = 恰一次 `game.update`，注入与采样都发生在帧边界上，结构性排除竞态。虚钟下 `ts = frame·(1000/60)`，游戏侧 `time.elapsed`（整数 ms 差）实测序列 **[17,17,16]ms 循环**（首采样 16,33,50,66,83,100…），均值恰 1/60。

## §2 成品架构（scripts/e2e/oracle/lib.mjs）

oracle 计时模型（bundle 提取，`init.eb02fbdab2aa1d24.js` 只读取证）：`Game.update(Math.floor(rAF ts))` → `Time.update` 算 `elapsed` → `executeTick` 累加器（minTPS=50/maxTPS=100，largest-step-first）→ `world.Step(min(0.04, elapsed/1000))`。对这条链的四道确定性防线：

1. **arm-at-create**：`level.create` 返回即 `__vt.arm(1700000000000)`——帧号归零、`Date.now` 锚常数（`game.time.now` 绝对钟跨运行逐位一致，风公式 `1.2+0.2·sin(now/1000)` 相位随之钉死）；`time.events.removeAll()` 清 menu 期遗留定时事件。
2. **负 elapsed 钳制**：arm 的 ts 跳变会让下一帧 `elapsed ≈ 负数千 ms`，bundle 累加器按 +0.017s/帧爬坑约 393 帧期间 stage/physics 全停（实测踩中后 0 采样）。包 `Phaser.Time.prototype.update`：`elapsed` 非法（负/NaN/>100）即钳到恰 1000/60 s——跳变帧以 dt=1/60 精确 tick 一次，与内核对齐。
3. **解冻冻结保持**：intro 期游戏自身 `_.delay`（真实 setTimeout 链）解冻物理，时机含 ±3 帧真实异步抖动，且解冻首 tick 带变 dt 暖启动残差（ULP 级，曾致 ×3 在 vY 第 1 样本发散 1.7e-16）。对策：重定义 `physics.box2d.paused` accessor，解冻请求一律挂起，控制器 `__vtRelease()` 后才放行。
4. **gate 二次锚定 + settle 三段式起跑**：出 gate（levelStarted 且挂起解冻就绪）后再 `arm` 一次杀 intro 链抖动 → release → 无输入 settle 30 帧（出生点从 level-data 锚 y=864 落地，dt 序列自钳制帧起全确定）→ 第三次 `arm` 清落地瞬态，采样器随即挂载、tick0 = settle 后首个 tick，暖启动来自确定性 settle 序列。

采样与注入自 o25a `lib.mjs` 移植（只读参考）：`StateManager.update` 包尾采样 `{s,n,e,fb:[x,y,vx,vy],wg:[x,y,vx,vy]}` 浮点全精度；胜负经 `gameFinish/gameOver` 包裹记绝对帧号；键入为 diff 式 `keyboard.down/up`，帧边界生效。坐标口径两侧一致：**px = −32·meters**，无需换算。

## §3 STEP3 确定性验收：×3 逐位一致

同一进程内三次独立冷启动（每 run 新 browser + 新伺服探活），全量样本逐位比较（float64 全精度，非容差）：

| 口径 | 帧数 | run1/2/3 结果 | 逐位 | 墙钟 |
|---|---|---|---|---|
| forest_01 通关路线（`scripts/e2e/inputs/routes/forest_01.json`，56+55 事件） | 2500 | 均 WIN，marks `win:2463` 三连 | **BITEXACT** | ~24 s/run |
| hold-right 900（合成单键） | 250（f220 早停） | 均 LOSE，marks `lose:220` 三连 | **BITEXACT** | ~2.5 s/run |

对照消融（路线口径，历史版本实测）：无 gate 二次锚定 → gate 帧号 2200/2233/2183 抖动；无冻结保持 → 第 1 样本 vY 差 1.7e-16。两道防线各自对应一处真实发散源，非过度设计。

## §4 STEP4 差分对：内核（固定 1/60）vs oracle（虚拟 60Hz），forest_01

**出生点校准**：两侧同约定 px=−32·meters，x 轴零差。y 的 0.0135px 静态偏置 = 内核出生点标定（落点解析解 860.5575）与 oracle settle 后 box2d 地面接触（860.5440）之差，属初始条件标定残差，非发散。

**首个发散帧与数值**（f0，任一分量 |Δ|>0 的首帧；`e=16.667` 为钳制帧）：

```
内核  f0: fb=(96.0000, 860.5575, 0.0000, 0.0000)  wg=(96.0000, 732.5575, 0.0000, 0.0000)  ph=playing
oracle f0: fb=(96.0000, 860.5440, 0.0000, 0.0000)  wg=(96.0000, 732.5440, 0.0000, 0.0000)  n=16 e=16.667
|Δ|  : fb=[0, 1.35e-2, 0, 0]  wg=[0, 1.35e-2, 0, 0]   （顺序 x,y,vx,vy）
```

**发散前/全程差值曲线**（每 50 帧 max|Δ| 全分量，48 桶全量见 `vtdiff-forest_01.json`）：

- 静止/接触段重收敛：f300 桶 0.005px、f1050 桶 1.05px——位移差不单调累积，落回同一接触面即清零（box2d 接触求解吸收）。
- 动态段（走跳/摆荡/下落）：**中位 16.2px、峰值 98.7px（f1850）**；次峰 f1200=92.7px、f600=64.1px、f750=56.5px，全部落在跳跃/长下落相位——dt 整数量化（[17,17,16] vs 精确 1/60）在大步相位放大、接触相位归零，与 03 号档 dt 谱的机理一致。
- 结局：**双方 WIN**。内核 `won @f2365`，oracle `win:2463`（**+98 帧 ≈ +4.1%**，同输入下关卡时长拉长 4%，纯 dt 口径差异）；oracle 末样本双角色已立在门位（wg=(1168,196) fb=(1056,196)）。

## §5 诚实差距清单

1. **dt 整数量化**：oracle 每步 dt ∈ {16,17,17}ms（bundle `Math.floor(rAF ts)` 差分所迫，非可选项），内核精确 1/60。同输入轨迹差中位 16px、峰值 ~99px，通关帧 +4.1%。对 razor 邻近/余量秒级关卡，这条 +4% 足以翻转结局（03 号档 ±8ms 抖动即翻 7/11 同机理）——oracle 判 WIN 的路线送内核门禁须以内核复核为准。
2. **出生点标定残差 0.0135px**：内核落点解析解 vs oracle box2d settle 接触态。静止差异，但意味着两引擎"同一初始帧"在 ULP 级就不重合，逐位比对只对"各自 ×3"成立，跨引擎恒为容差比对。
3. **风相位未对拍**：`game.time.now` 已随 arm 锚定（相位确定性的机制在），但 forest_01 无风区，风关（forest_03/26）差分对本档未做，留作风关专用验证。
4. **关卡计时器口径**：oracle 关卡带 `time:40` 计时器，内核无计时器模型；本档实测 2463 帧（虚拟 41.05 s）仍正常 WIN，说明该计时器不斩通关，但其余语义（HUD/超时分支）未逐项核对。
5. **非物理层不比对（设计如此）**：pickups/门/动画状态机/通关编排两侧各自实现，差分仅覆盖物理状态流与胜负判定。
6. **同机同 runtime 前提**：逐位一致性仅在"同机同 Chromium/V8"内成立（planck.js #271 口径：<https://github.com/piqnt/planck.js/issues/271>；跨 runtime 反例 #181：<https://github.com/piqnt/planck.js/issues/181>）。换机器/换 headless 模式需重验 ×3。

## §6 复现

```bash
cd gyのFW
node scripts/e2e/oracle/vtrun.mjs --route forest_01 --runs 3     # ×3 确定性 → VERDICT BITEXACT
node scripts/e2e/oracle/vtrun.mjs --hold-right 900 --runs 3      # 简单口径 ×3
node --import tsx scripts/e2e/oracle/vtdiff.mjs                  # STEP4 差分对 → vtdiff-forest_01.json
```

伺服 8842–8844 端口复用已有机（其它槽共享），否则自 spawn；产物写 `scripts/e2e/out/oracle-vt/`（gitignored）。
