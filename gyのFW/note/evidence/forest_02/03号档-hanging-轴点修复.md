# forest_02 03号档 —— hanging 摆板不旋转：oracle 仲裁与轴点修复（2026-10-15）

> **结论**：用户游玩报告属实，非视觉问题——我方 `buildHanging` 把 revolute 轴点错用锚点（原版为板位置点=板心），板退化为钟摆锤、丢失自转自由度。修复后板绕板心自转，fullRotation 风车板语义归位。det 对 r29 漂移 7 关（皆含 hanging，预期），新基线 **r30**。

## 1. 现象与用户报告

用户联机游玩 forest_02（第二关）：水娃踩链条吊板（h0 @384,408），板**完全不旋转**，不符合原版逻辑。截图显示两块摆板均处初始水平位、链条竖直。

## 2. 仲裁取证链（字节级）

1. **关卡数据逐字节一致**：我方 `packages/client/public/data/forest/levels/forest_02.json` 与 oracle `Fireboy-and-Watergirl/output/A/data/forest/levels/forest_02.json` 的两个 hanging 对象（id41/42，均 `fullRotation:true`）json dump 全等。
2. **原版 Hanging 类**（init.eb02fbdab2aa1d24.js @1645783 起，模块 `States/Level/Devices/Hanging`）关键行 @1646198：
   ```js
   (o = new box2d.b2RevoluteJointDef()),
   o.Initialize(g.body.data, p.body.data, f),   // f = pxm(this.pos) —— 轴在【板位置点（板心）】
   ```
   原版结构：distance joint（绳，anchor↔板心）+ revolute（anchor↔platform，**轴=板心**）+ revolute 钉锚于地。板挂在绳末端绕**自身中心**旋转；`fullRotation=true` 时不设限位 → 角色踩一端可 driven 整圈旋转（风车板）。
3. **我方旧实现**（`packages/shared/src/kernel/mechanisms.ts` buildHanging）：`rd.Initialize(anchorBody, platform, phys(B, anchorPx.x, anchorPx.y))` —— 轴错用**锚点**。板相对锚只能摆（姿态锁在绳方向），自转自由度消失。

## 3. 实验复现（TEMP/hanging-probe.mjs，内核直驱）

水娃空投板东端 (424,340)：

| 版本 | 板角演化 |
|---|---|
| 修复前 | f15 起微摆 0.47°→6.3° 峰值即回摆（钟摆）；站板心恒 0.00° |
| 修复后 | f15 起 2.8°→5.8°→…→210° 持续旋转，角色随板转至下端挂住（y=459=板半宽 51px 端尖，自洽） |

## 4. 修复内容（commit 7024dd5）

- revolute 轴点：`phys(anchorPx)` → `phys(posPx)`（原版 @1646198 语义）
- 板 fixture filter 补 `categoryBits:65535, maskBits:65535`（原版 l.filter 全通；旧缺省 category=1）
- typecheck 零输出；vitest 85/85

## 5. 影响面

- det 48 关 `--compare r29`：**7 关位级漂移** = forest_02/12/12_1/19/19_1/25/25_1（idle+scripted 双异）——全部含 hanging，属"修对"的预期漂移；其余 41 关位级不变（含全部 8 绿关中无 hanging 的 6 关）。
- 含 hanging 关卡全清单（17）：02/04/04_1/05/12/12_1/19/19_1/21/24/24_1/25/25_1/29/30/bonus_1/bonus_2。
- 新基线 **r30** 存档 `benchmark/results/det-r30.json`，自验 48/48。
- 绿关 e2e 复跑：forest_04 / forest_12（绿关中仅此两关含 hanging）`--repeat 3`，见 §6。

## 6. 绿关 e2e 复跑结果

`node scripts/e2e/route.mjs --repeat 3`（真实服务器+双浏览器，offset -15）：

- forest_04：**ALL PASS（3/3）**，run3 winAt=18454ms final=won
- forest_12：**ALL PASS（3/3）**，run3 winAt=13479ms final=won

已通关路线对修复不敏感（两关路线均未依赖摆板自转行为）。探针脚本收容：`note/evidence/forest_02/tools/hanging-probe.mjs`（TEMP 原件已清）。
