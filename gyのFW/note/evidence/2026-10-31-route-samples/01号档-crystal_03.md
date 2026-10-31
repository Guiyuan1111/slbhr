# 01号档 · crystal_03 通关路线搜索（fw-route-crystal 槽）

- 日期：2026-10-26 ～ 2026-10-31
- 分支：`release/1.0-forest`（仓库根 slbhr，工作目录 gyのFW）
- 结论：**FAIL——未产出可入库的 `routes/crystal_03.json`**（红线：不许造假，未伪造；routes/ 目录确认无本关文件）。
  检查点链 v9（commit `91295b6`）与搜索报告（commit `cb9e0f5`）已入库，供 5.3 槽接手。
- 本档所有坐标为屏幕 px；py = snapshot 中心 y = 脚 − 35；char 碰撞半径 ~15.7px（直径 31.4px）。

## 1. 一句话结论

crystal_03 在本仓库 kernel 下，**唯一 win 路径的必经触发态不可达**：双门 isUp 需经 P7(272,208 门台) ← P6(272,400 基座) 传送，而 P6 触发带 y[448,544] 只与 row-18 台顶站姿（feet 576）相交，row-18 台顶被「col16 全高柱 + 停驻升降柱×r13 板底 32px 横缝 + 口袋阶梯闭环」三向物理封锁。autosearch 推进至 C1/C2 段后，C4 段经 9 轮 kernel probe（probe31-45）确认为结构性死锁，按红线停止，不 resume、不造假。

## 2. 检查点链设计（checkpoints-crystal_03.json v9，commit 91295b6）

| 段 | 目标 | 语义 | 状态 |
|---|---|---|---|
| C0 | 出生笼→东廊 | 笼内 jd×6/×7 连跳（笼式封顶弧 rise≈70px），末弧满速跨 P0(32,848) 触发带（raw 位置 38.35 落带内被 Step 前检查捕获）传至 P1 东廊 | ✅ 内核实证（probe23；报告 C1 段 evals 9 即含此链） |
| C1 | 东廊→y736 地板杆西 | 双角色 jd 链登 [608,800] 下降阶梯（896→736），west 抵杆西待命（fb 396/wg 501） | ✅ 报告 solved，evals 9 |
| C2 | 拉杆 l0(496,736) 东翻 | v10「压钉点」：fb hold(1,488) 压至杆西面 487 钉点（杆翻后挡东行），完成线 488 零速完成；wg hold(1,565) 东行短停不触杆 | ✅ kernel 实证（probe26/29）＋报告 solved，evals 1852 |
| C3 | P3(32,624)←P2(1216,112) 井弧传送 | 杆翻开 P2/P3：fb 西行 jd×4 封顶弧链（每弧 vx 衰减 ×0.76），弧 3 钉点补跳触发 P3 → P2 出口 y≈118 抛体落 row-6 (~1134, feet 192)；wg 先 hold(1,575)+runJump(-1,535) 空中越杆后同链 | ✅ kernel 实证（probe28/29），未入 autosearch 报告（run 于 C2 后停） |
| C4 | row-6→…→P6 带内触发→P7→双门 | **结构性封锁（§4），未解** | ❌ |

## 3. 搜索耗时/代数（note/research/2026-10-autoplay/tools/out/crystal_03.autosearch.search.json）

- 参数：`--beam 24 --budget 6000 --samples 10 --maxminutes 30 --evalchild --seamgrace 40`，chain=v9。
- startedAt 2026-10-30T21:39:37Z；totals：**segsSolved 1/5、evals 1861、wallS 340.9s、fullAuto false**。
- segs 明细：C1 solved（evals 9，wallS 11.8s，endF 484，fb[396,701] wg[501,700]）；C2 solved:true（evals 1852，wallS 309.5s；totals 计 1 系停机时点 seam 未满 grace）。
- C3/C4 未进搜索：C3 链改为 kernel probe 直验（probe28/29，v11 定稿入 SEGC）；C4 经 probe31-45 判死锁（§4），按红线不再 resume。

## 4. 终章封锁——几何 audit（证据：TEMP/fw-route-crystal probe31-45 + dumpgrid/dumpobj/dumpmech 逐格复核）

### 4.1 win 路径唯一性

- 门为 sensor（mkDoor 仅基座 1×0.125m sensor fixture，无实体门板，穿行即开）；win = 双门 isUp（world.ts checkEnd，无钻石门禁）。
- 门台 [0,512] 顶 256 被东向 col16 全高柱 [512,544]×[32,288] 封死（r01-r08 连体），唯一入口 = P7(272,208)。
- P7 ← P6(272,400) 传送（state1 开）；P6 带 x[240,304]×y[448,544]（实测触发：row-18 台顶西行 body [303,335]×[531,576] 于 x≈319 掠带即传，probe40 系）。
- 基座顶 448 站姿 body y[363,448] 与带 y[448,544] 零交——**必须站上 row-18 台顶西段 [160,706]（顶 576）**。

### 4.2 row-18 台顶三向封锁（本轮逐格复核 + probe 实测）

1. **东端 45° 斜面**：col24 '3' [768,800] 斜面自 r19(608) 西升 (768,576)。45° 坡仅动量可攀、落地即滞（probe42 实证口袋坡 601→560 可攀，但那是以竖直 32px 自动攀台阶收尾；r18 东帽无台阶）。probe44/45 满助跑 jd 弧落 **750（feet 576，已上台面级）**。
2. **停驻升降柱隔断（750 钉点真因，本档更正早期「char 互堵/坡不可攀」误判）**：平台 def (704,480,32,96,dx0,dy3,group4)，prismatic lower=−3/upper=0，**0=创建位=驻位 [480,576]**；state0 马达向 0（不动），state1 向 −96px＝压入 row-18 板＝死位（probelev 实测永不动，decor）。柱东面 734+15.7=**749.7=750 钉点**。柱顶 480 与上方 r13 板底 448 夹 **32px 横缝**，char 直径 31.4px 理论过缝中心窗仅 0.6px，不可操。⇒ row-18 顶东西两段物理隔断，西段 [160,706] 不可从东段到达。
3. **西域坠落入口闭环**：row-4 唇口 [640,672]'2' 斜面西滑坠落被 row-8 架 [576,672] 顶 256 接住成口袋（probe34-38）。口袋西＝col16 全高柱封；上方开放竖井（row-4 col17-19 空）跳升 ~115px 无檐可落；东下行阶梯（col20/21 斜面→col21 柱顶 320→r12 斜面→r13 阳台 416）循环出口袋。r13 阳台 [704,832] 西端被 col21 柱 [672,704]×[320,448]（r10-r13 连体，本轮新证）东面拦（高出 r13 面 96px，非 32px 自动攀）。r13 东尖下行落 r19 [800,1248] 顶 608，即 §4.2.1 死路。

### 4.3 v20 最远链（probe44/45 kernel 实证，止于 750 钉点，已定稿入 autosearch.mjs C4 recipe）

`hold(-1,900) row-6 冲刺越阶 → walkTo(-1,684,90) row-4 → walkTo(-1,660,20) 唇口滑落 → walkTo(-1,612,30) 落口袋 → hold(1,690) 东下行阶梯 → walkTo(1,704,200) 落 r13 → hold(1,836) 东尖落 r19 → sleep(300)（fb 错峰，防双角色 750 同帧互堵）→ jumpDrift(-1,0,40) 弧落 750 → walkTo(-1,300,250)（钉死于升降柱）`；wg 尾段 `jumpDrift(-1,0,40)+walkTo(-1,96,200)` 为 P7 出口预设（过带防重传跳），未达。

## 5. 疑似数据缺陷候选（存疑待核，不下原版终判）

1. **P6 触发带 y 范围**：带 y[448,544] 低于基座顶 448，仅台顶站姿可触发；若原版带以标记 (272,400) 为中心对称（y[352,448]），基座顶站姿即触发、本关可解。实测 kernel 带来自 snapshot/dumpobj 逐帧核验（probe40 系触发点 x≈319 与带右缘 304 吻合）。
2. **升降柱初始 translation**：kernel 以创建位=translation 0=驻位；若原版柱初位在下、受 group4 板控升（顶 480→384 开隧道），本关可解。probelev 实测 kernel 内按压板不动。
3. **col16 柱 r08 '5' 楔**：柱底楔 [512,544]×[256,288] 与门台东缘齐平，无 32px 台阶可借自动攀。
4. 原版 oracle（Fireboy-and-Watergirl/，只读未动）同图行为未比对——以上仅为 kernel 侧证据，差异点已列明，供 5.3 槽/后续核对。

## 6. 关键实测物理（本关复用）

- 笼/顶板封顶跳：rise 封顶 ~70px；开阔地满跳 rise ≈115px（v0y≈480, g≈958）。
- 空气阻力重（τ≈0.15s）：空中漂移上限 ≈ v0·τ ≈ 44-48px；jd 连跳每跳落点 vx≈−272 保满速（C0 链）。
- 45° 坡：动量攀可、驻停必滑滞；竖直 32px 台阶面走行自动攀（probe42）。
- char-char 碰撞存在（probe42 对穿/44/45 同帧互堵）；sensor 门带 [432,464](fb)/[80,112](wg)。
- P0/P2/P3/P6 传送触发：bullet CCD+求解器钉 face+3.2+0.256=38.656 vs 触发边 38.4——需跳跃弧 raw 深入带内（probe20/21/23）。

## 7. 交付物清单

| 文件 | 状态 |
|---|---|
| `note/research/2026-10-autoplay/tools/checkpoints-crystal_03.json`（v9） | ✅ commit 91295b6 |
| `note/research/2026-10-autoplay/tools/out/crystal_03.autosearch.search.json` | ✅ commit cb9e0f5 |
| `scripts/e2e/routetool/autosearch.mjs` SEGC C0-C4（C2 v10/C3 v11 实证链 + C4 audit 定稿） | ✅ commit cb9e0f5 |
| `scripts/e2e/inputs/routes/crystal_03.json` / `.autosearch.json` | ❌ 未产出（不许造假） |
| TEMP/fw-route-crystal/（probe1-45 等） | 用后已清理 |
