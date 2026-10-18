# 10 号档 · 旋转体系全链路 oracle 仲裁：物理面位级同源，根因在表现层（rotcheck 槽）

> 一句话：**用户实玩反馈"旋转体系还是没原版的好"，第三次回修后的全链路终审判定=旋转物理面与 oracle 位级同源（虚拟钟对拍 修正采样单 tick 约定后 max|Δθ|≤0.000186°≈3.25e-6 rad，idle 角色 0 残差），物理参数 diff=0 实义差异；体感差距根因在表现层——服务器模拟 60Hz 但 Colyseus 出站 patch 默认 20Hz（`DEFAULT_PATCH_RATE=1e3/20`，ForestRoom 未覆写），客户端机关位姿每帧直贴最新快照 → 旋转板渲染成 20Hz 阶梯（0/6.016° 交替，真值 3.808°/帧），而角色层本有 dead-reckoning 平滑 → "只有旋转发木"的反差。修复=客户端 mechTarget 速度外推 25ms+指数收敛 30/s（纯表现层，零物理/det 影响），playwright A/B 取证 maxStep 6.016°→3.794°（贴真值 3.808°）、冻结帧 9→0，e2e forest_12 repeat3 ALL PASS。**
>
> - 日期：2026-10-18（rotcheck 槽）
> - 前情：7024dd5（hanging 轴点锚→板心）、907ba54（锚点体质量/惯量逐位归位）、rpa-D1（转臂限位逐帧钳）、rpd（旋转箱中心/windWidth 透传）——见 `note/evidence/forest_02/03号档-hanging-轴点修复.md`、`note/research/2026-10-behavior-parity/08-round2.md`
> - 方法：oracle=唯一真相（`scripts/e2e/oracle/lib.mjs` 只读直用，08 号档虚拟钟机）；判定准则=残差 ≤ 整数 ms 量化 + 0.8% 行为底座（06/08 号档分账口径）

---

## 0. 结论速览

| 步 | 判定 |
|---|---|
| STEP1 oracle 参数提取 | 全 revolute 设备类（hanging/pulley/箱/转臂/lever/roman/ball）参数链闭合，引文齐 |
| STEP2 逐参数 diff | **0 实义差异**（可选属性全 48 关数据集零使用） |
| STEP3 虚拟钟对拍 | **物理面位级同源**：驱动场景 max|Δθ|=0.000186°/0.000115°（B/C），同位 3.808°=单 tick 采样签名 |
| STEP4 表现层审计 | 根因坐实=20Hz patch 出站 × 机关直贴；**客户端平滑修复落地并验证** |
| 处置 | STEP4 分支（表现层最小修）；物理零改动，fixtures/det 零波及 |

## 1. STEP1 · oracle 旋转设备参数提取（引文表）

原版 bundle：`note/reverse/oracle-a/init.eb02fbdab2aa1d24.js`（压缩）+ `init.beautified.js`（美化）；模块提取件 `note/reverse/oracle-a/modules/`。以下行号为提取件行号，@xxxxxxx 为压缩包字节偏移。

| 设备类 | 引文 | 关键参数 |
|---|---|---|
| Hanging 吊板 | `modules/States_Level_Devices_Hanging.js` L56563-56670 | 平台体 SetLinearDamping(0.4)/SetAngularDamping(0.3)；六边形板 fixture 顶点 (±m,±0.12)/(±n,0)、density 2.5、friction 0.4、filter 65535/65535；distance joint（pxm(anchor)↔pxm(pos)，锚点钉地 static）；**revolute `o.Initialize(g.body.data, p.body.data, f)`，f=pxm(pos)=板心**（@1646198，7024dd5 依据）；限位 `Math.PI*∓0.85/2`（±0.425π）且仅 `!fullRotation` 时 `enableLimit=true`（fullRotation=自由风车）；update() 只画绳（视觉件不进物理） |
| Pulley 滑轮 | `modules/States_Level_Devices_Pulley.js` L58312-58489 | 双板 fixedRotation、SetLinearDamping(0.1)、userData="reactable"、density 3；定滑轮圆体+绳 distance joints；角色跳踩板施 (0,−1) 冲量（通用支路 `init.beautified.js` L63296-63302，fixtureA-only quirk） |
| BoxPrototype 旋转箱 | `modules/States_Level_Devices_BoxPrototype.js` L56093-56193（+BoxedDevice/Device 基类 L55504-55674） | 八边形箱体、SetLinearDamping(1)/SetAngularDamping(20) |
| MovingPlatform 转臂 | `modules/States_Level_Devices_MovingPlatform.js` L57601-57849 | revolute 马达 maxMotorTorque 200；**update() 逐帧限位钳制**（rpa-D1 依据） |
| Lever 拉杆 | `modules/States_Level_Devices_Lever.js` L56805-56922 | revolute+limit、maxMotorTorque 10 |
| Roman 十字转轮 | `modules/States_Level_Devices_Roman.js` L58628-58733 | bar+base 双体 |
| Ball 球 | `modules/States_Level_Devices_Ball.js` L55747-55800 | 圆球体 |
| 全局 | `modules/…Level.js` L460-469（setPTMRatio(32)、gravity.y=1000）、L65628-65634（`Step(min(0.04, elapsed/1000), 8, 3)`）、`init.beautified.js` L53136-53137（box2d 插件默认 velocityIterations=8 / positionIterations=3） | 与我方 `packages/shared/src/kernel/world.ts` L268 `Step(dt, 8, 3)` 同构 |

## 2. STEP2 · 逐参数 diff（我方 `packages/shared/src/kernel/mechanisms.ts`）

对照点：buildHanging L437、buildPulley L497、buildBox L356、buildRoman L535、Lever L84（torque 10 @L124）、MovingPlatform L225（torque 200 @L300、update() 逐帧钳）、character reactable 冲量 `packages/shared/src/kernel/character.ts` L232-236。

| 参数 | oracle | 我方 | 判定 |
|---|---|---|---|
| hanging 轴点 / 限位 / LD·AD / fixture | 板心 @1646198 / ±0.425π 仅 !fullRotation / 0.4·0.3 / d2.5 f0.4 filter 全开 | 同（7024dd5/907ba54 后逐位） | ✅ |
| pulley fixedRotation / LD / userData / density | ✓ / 0.1 / "reactable" / 3 | 同 | ✅ |
| 箱 形状 / LD / AD | 八边形 / 1 / 20 | 同 | ✅ |
| 转臂 马达 / 限位方式 | 200 / update() 逐帧钳 | 同（rpa-D1 后） | ✅ |
| lever torque | 10 | 10 | ✅ |
| solver 迭代 / 重力 / PTM / reactable 冲量 | 8·3 / 1000 / 32 / (0,−1) | 8·3（world.ts L268）/ 1000 / 32 / 同（character.ts L232-236） | ✅ |
| oracle 可选属性（friction/boxSize/linearDamping/angularDamping/paddingX/offsetX） | 解析器支持 | **全 48 关森林数据集零使用**（grep `note/reverse/oracle-a/data/forest/levels/*.json` 证） | —（全走默认，无参数面可 diff） |

**diff 计数=0 实义差异，最重项=无**。前三次回修（7024dd5/907ba54/rpa-D1/rpd）后参数面已闭合；用户残感不来自物理参数。

## 3. STEP3 · 虚拟钟对拍（oracle 机只读直用）

工具：`tools/rotcheck/`（rotlib=oracle 采样器+内核实录 dt 回放+同帧同 API teleport；两侧 teleport 均补 `SetAwake(true)`——vendor `SetPosition`→`SetTransformXYRadians` 不唤醒，静置 0.5s 体已睡，此为两侧同款 API 行为，不破坏同源性；vendor 证据 `packages/shared/vendor/box2d.js` L7225-7230）。

**采样器单 tick 约定（关键发现）**：`scripts/e2e/oracle/lib.mjs` attachSampler 包 StateManager.update——采样发生在场景更新后、物理 Step 前；我方 runKernel 在 `w.step` 后采样 → **oracle sample[k+1] ≡ kernel sample[k]**。probe-tele 坠落段逐位实证：oracle f61=(435.200,340.256,vy16.000) ≡ kernel f60，f62≡f61、…连续 5 帧全同（`tools/rotcheck/probe-tele.log`）。同位对齐的一切"漂移"由此为单 tick 运动量签名。

| 场景 | 设置 | 同位对齐 max | **+1 移位对齐 max** | −1 反向 |
|---|---|---|---|---|
| A idle（forest_02，180f，probe-align） | 无输入静置 | 角色 0.000e+0 位级；板中心 5.968e-7px（dust） | — | — |
| B 驱动（forest_02 h0，f60 空投 fb→板东端 (435.2,340)，风车自转→甩飞，死亡 @f184） | 190f 采样，实录 dt 回放 | Δθ max **3.8083°**（恰=每帧自转步幅）；dPers max 6.709px（=单 tick 运动，中位 2.97e-5px） | **Δθ max 0.000186°（3.25e-6 rad）** | 7.597°（排除） |
| C 驱动（forest_12 h2，f60 空投 wg→(675.2,636)，死亡 @f194） | 200f | Δθ max 3.8082° | **Δθ max 0.000115°（2.0e-6 rad）** | 7.597° |
| B/C 长程（900f/1800f，scen-bc，含死亡后段） | 同上 | hangAng max 0.0665/0.0736 rad | 同一单 tick 签名 | — |

- Δθ 残差底=整数 ms dt 量化（[S,17,17,16…] 解析式 eAna 全吻合）+ float64 噪声，远优于判据（整数 ms 量化 + 0.8% 行为底座）。
- 分账脚本：`tools/rotcheck/eval-align.mjs`（同位/±1 移位三口径+大残差帧清单）；全序列 `final-b.json`/`final-c.json`；日志 `scen-final.log`/`probe-align.log`/`probe-tele.log`/`scen-bc.log`。
- **判定：旋转物理面位级同源。用户反馈不是物理问题。**
- 交叉发现：06 号档（oracle-gold）"±1 帧落地相位尖峰"与 f0 0.0135px 偏置的部分来源即本采样约定——goldcollect `--compare` 若采纳 +1 对齐可收紧金 fixture 容差（涉及重录人审，另槽）。

## 4. STEP4 · 表现层审计与修复（用户玩的是在线版：60Hz 服务端权威 + 网络同步 + 客户端渲染）

### 4.1 链路审计（根因链）

1. 服务器 60Hz 模拟（同内核）→ schema 位姿 `Math.round` 量化。
2. **Colyseus 出站 patch 默认 20Hz**：`node_modules/@colyseus/core/build/Room.js` L49 `const DEFAULT_PATCH_RATE = 1e3 / 20;`、L86 默认赋值；`packages/server/src/rooms/ForestRoom.ts` 无 setPatchRate 覆写（grep 空）→ 客户端每 50ms 才收到一批位姿。
3. 客户端 `updateMechs` 每帧把最新快照**直贴**渲染对象（旧代码，带 change-guard/lever 0.25° 死区）→ 旋转板渲染角=20Hz 阶梯。
4. 量化证据（playwright 真 Chromium 重放，`tools/rotcheck/ab-run.mjs`+`ab-page.html`，final-b 实录 θ 流经 20Hz patch 域驱动旧算法）：风车真值 3.808°/帧 → 渲染步幅 0°/6.016° 交替（**+58% 突跳**）+ 每周期 1 冻结帧。
5. 角色层本有 dead-reckoning（`packages/client/src/scenes/GameScene.ts` L1360-1365，lead 50/25ms 外推）→ **只有旋转/机关发木**——与用户"旋转没原版的好"精确对应。原版本地 rAF 每帧直读 body.angle，无此层。

### 4.2 修复（最小 diff，纯客户端表现层，零物理/det 影响）

`packages/client/src/scenes/GameScene.ts`：

- 新增 `mechSm` 平滑态表 + `mechTarget()`（L1491-…）：快照域目标=最新快照 + v·lead（**lead 25ms≈半个快照周期**）→ 渲染值向目标指数收敛（**rate 30/s**）；角差走最短弧；`snapPending` 帧与 `resetRound()`（L1273 clear）直贴/清态。
- 全机关类走查统一过 mechTarget：lever `l*`（并删 0.25° 死区门）、pusher `b*`、platform `p*`、prop `x*`、hanging `h*`（绳视觉随平滑后板重瞄）、pulley `u*a/b`（轮+绳随平滑板）、roman `r*`；删除旧 change-guard，每帧写渲染值。
- 参数选定：final-b 实录 θ 流上 (lead,rate) 网格扫描，rate 40 回归（rms 0.23°→0.85°，追阶梯噪声），**lead25/rate30 rms/max 双优**。
- 零物理/det：不触 kernel/mechanisms/world/e2e 基线任何文件。

### 4.3 A/B 取证（191 渲染帧，误差基准=60Hz 真值线性插值≈原版每帧直读）

| 指标 | 旧（直贴） | 新（mechTarget） | 真值 |
|---|---|---|---|
| 渲染角 rms 误差 | 0.3081° | **0.2316°** | — |
| 渲染角 max 误差 | 2.9858° | 1.4569° | — |
| 自转段冻结帧 | 9 帧 | **0 帧** | 0 |
| 渲染 maxStep | 6.0161°（+58%） | **3.794°（−0.4%）** | 3.808° |

数据：`tools/rotcheck/ab-result.json`（含 truth/old/neu 全序列）。

### 4.4 验证

- `npm run typecheck` 零输出；`npm run test`（vitest）**85/85**；`npm run build` 通过。
- 真机 e2e（独立实例，不碰游玩服）：**forest_12 repeat3 ALL PASS**（winAt 13475/13446/13478ms，与 03 号档 oracle-gold 13.479s 同带）；`tools/rotcheck/e2e-f12.log`。
- forest_02 路线 FAIL=**已知死路线基线**（03-dt-sweep.md：主路线/.best/.opt 全灭 @f1879，未入册不伪造），非回归；`tools/rotcheck/e2e-f02.log`。

## 5. 处置与后续

- **处置=STEP4 分支**：物理零改动（STEP2/STEP3 证明无需动）；客户端表现层修复已落地。
- 后续 1（另槽）：oracle-gold 容差收紧——goldcompare 采纳采样 +1 对齐（§3 交叉发现），预期显著收窄 06 号档 tolerance，走 fixture 重录人审流程。
- 后续 2（候选）：服务器 `setPatchRate(1000/60)` 可把出站升 60Hz，从根上消阶梯——动网络面（带宽/所有实体），本期不做；客户端平滑已达 maxStep 贴真值，作为网络优化独立候选挂账。
- 后续 3（记档）：`scripts/e2e/oracle/lib.mjs` attachSampler 为 pre-step 采样（只读未动），goldcollect/vtdiff 系工具读数时按 §3 约定对齐。

## 6. 复跑指南（tools/rotcheck/，17 文件）

```bash
cd gyのFW
cp -r note/research/2026-10-behavior-parity/tools/rotcheck TEMP/rotcheck
node --import tsx TEMP/rotcheck/probe-align.mjs   # 场景 A idle 位级（→probe-align.log）
node --import tsx TEMP/rotcheck/probe-tele.mjs    # 采样单 tick 逐位实证（→probe-tele.log）
node --import tsx TEMP/rotcheck/scen-final.mjs    # 场景 B/C 全序列（→final-b/c.json + scen-final.log）
node --import tsx TEMP/rotcheck/eval-align.mjs    # 同位/±1 移位三口径分账
node TEMP/rotcheck/ab-run.mjs                     # A/B 渲染取证（真 chromium，→ab-result.json）
# 收尾：rm -rf TEMP/rotcheck
```

（kernel 侧 import 链含 TS 源，须 `node --import tsx`；oracle 机与 e2e 均起独立实例，不碰 3700 游玩服。）

## 提交链

- 客户端修复：7903c57（GameScene.ts mechTarget，79+/31−）
- 本档+工具+handoff：本提交

> 引用约定：本档文件行号以当前工作树为准（commit 后行号随版本浮动，以提交链版本的路径+符号名为准）；oracle 提取件行号为 `note/reverse/oracle-a/modules/` 静态行号。
