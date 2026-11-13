# 05号档 · crystal_03 路线复产尝试（fw-route-crystal2 槽，2026-11-01）

槽位：fw-route-crystal2。仓库根 slbhr，分支 release/1.0-forest。文件域：checkpoints-crystal_03.json、
routes/crystal_03*.json（未定稿）、autosearch.mjs SEGC 块（未改）、本档、TEMP/fw-rc2-*。
禁碰 packages/**、data/**。铁律：禁编造、结论附可复现来源、route JSON 不造假。

---

## §0 交付总览

| 项 | 状态 | 证据 |
|---|---|---|
| 门归属/胜负条件实证（fb=448/wg=96，sensor r0.5px 点圆，win=双 isUp 无钻石门禁） | 完成 | TEMP/fw-rc2-1/doors.mjs、doors2.mjs（commit 3198ded/a7bb09b） |
| 全关地形 AABB 精确定界（geo-probe 区域 A-F+C2） | 完成 | geo-probe.mjs、geo2.mjs（同上） |
| C0-C3+P2 口袋→唇落主地板 手上全链内核实证（两次端到端） | 完成 | probe42-scanW0.log、probe42-final1.log |
| 南带 TP 双向发射道（jdE@163→东室 309.8→门441；jdW@376→西室 224.9→门96） | 完成（内核 mini 实证） | mini-final9/11.mjs+.out |
| stack 顶越塔方案 | 证伪 | scan2.mjs+scan2-dbg.log（冻结 x=559.5 逐帧） |
| 台面西 runway 四向可达性 | 全部证伪 | calib.mjs/.out、geo2.mjs、scan2-dbg.log |
| checkpoints v10（C0-C3 不变+C4 唇落 staging+C5 诚实门目标） | 已提交 a903e9c | checkpoints-crystal_03.json |
| autosearch v10 官方尝试（--maxminutes 30） | 两轮均止于 C2→C3 seam | TEMP/fw-rc2-1/autosearch-v10*.log（git 已存） |
| routes/crystal_03.json 定稿 + route-node 3/3 | **未达成（C5 封锁，见 §3）** | §3/§4 |

提交链：3198ded（证据链首提）→ a903e9c（checkpoints v10）→ a7bb09b（stack 证伪）→ 本档。

---

## §1 已证事实（本槽新增，全部可复现）

### 1.1 门与胜负（doors.mjs / doors2.mjs，活世界直读）
- fireboy 门 pos=(448,256)、watergirl 门 pos=(96,256)——两者都在 x=544 墙之西的主地板西段。
- 门 sensor=CIRCLE r=0.016m=0.512px 点圆（world.ts checkEnd:682 `doors.fireboy.isUp &&
  doors.watergirl.isUp → won`；isOpen=角色任意 fixture 与门 sensor 重叠）——须角色站上门位 ±~13px。
- 钻石不门禁（diamonds 12 颗 type,char 均非 gate）。

### 1.2 传送对全表（geo-probe/doors2 + level JSON）
| 对 | 槽位 | 语义 |
|---|---|---|
| P0/P1 | (32,848)/(1216,848) | 出生笼→东廊（C0 已证，TP@202/429） |
| P2/P3 | (1216,112)/(32,624) | 竖井链：P2 口袋地板=x[992,1248] top192，P3 槽直落 lever floor 736（C2 区 y[660,790] 无 672 中转地板）——上行 wg 已证（TP@2674 (38,602)→(1205,87)），下行放回 lever floor，非西路 |
| P4/P5 | (1216,272)/(1216,560) | row-19↔甲板（v25 双向已证，环东侧） |
| P6/P7 | (272,208)/(272,400) | 北带/南带：北带须主地板西侧行走入场（272<544 被墙隔）；南带唯一入场=台面 runway 跳入（见 1.4 不可达） |
| P7' | (32,848)/(1216,848) 对 5 | 出生层西↔东横联，与门无关 |

### 1.3 南带发射道（mini-final9/11.mjs，内核 mini 实证——WIN 能力成立）
- fbE：走 680→200、pause9、→163、sleep25、jd1f(+1,40,110) → TP (265.7,447.5)→(283.9,255.8)
  落主地板东段 → 走 441 进 fb 门带。
- wg jdW：走 680→430、pause2、→392、sleep30、jd1f(-1,40,110) → 西室 224.9 → 走 110 进 wg 门带。
- **发射点在台面西跑道 x[160,705.9] top576——跑道本身不可达（1.4），发射道保留为 5.3 复核用通道。**

### 1.4 台面西 runway 四向不可达（本槽核心负结论）
1. **东来（主地板 256）**：主地板东缘 672 踏出→落 416 板碗形区（calib：板上任何西跳含
   jd(-1,40..) 助跑/静跳全落回 739-748）；row-19 侧登台被 416 板底封顶（rise 上限 ~128 < 160）；
   甲板 edgeJumpW 落 (661,239) 碗内（v25 log）。
2. **西来（lever floor 736）**：台面西端 128 top576，净升 160 > 128 封顶；西阶 x[96,128] top512
   净升 224 同封。
3. **P3/P2**：竖井链（1.2），不放人上台面。
4. **北带 (272,208)**：中心带 y[160,256] 与主地板行走面重合，但 272 < 544——从东侧被 544 墙隔断
   （1.5），从西侧须先已在西侧（循环）。

### 1.5 544 平面硬 X 屏障（scan2-dbg.log 逐帧实证——C5 的封锁本体）
- 塔2 柱 x[512,544] y[96,224] + 基座 y[224,256] + stack 西面（x=544）构成 y[96,256] 连续墙。
- 自 stack 顶（站姿 feet≈205，scan2 实测 204.5-208.5）任何 jd(-1, holdF∈{40,60,80,100}, 110)：
  起跳→上升到身体西缘触墙（x=559.5=544+16−0.5）瞬间 **vx 被面接触置零**；此后即使身体已越过
  塔顶高带（feet 89.2 < 96，f1821-1830 实测），左键持续按住 **加速度为零**（内核空气无控制力），
  垂直落回 stack（f1851 落 561）。
- 塔顶 x[512,544] top96 站立需身体中心 ≤556（脚圆内偏 ±10 的角抓几何），冻结面 559.5 永差 3.5px。
- 主地板步行穿越：611→西行自动上步 608 台(224)→576 stack(205)→544 塔面墙净高 109px 不可步越（钉 560）。
- **结论：本内核几何下 544 墙东西两侧在 y[96,256] 全高不可穿越。两门全在墙西 → C5 封锁。**

### 1.6 手上已证全链（C0→主地板东台，probe42 两次端到端）
C0 三/四连跳 P0→P1（TP@202/429）→C1 东廊西行登 736→C2 拉杆 l0+1→C3 井弧→P2 口袋
（fb TP@1092 (38,601)→(1206,94)、wg 拼接错峰后 TP@2674）→口袋地板 192 西行→992 缘→row-4 板
(128)→西行→672 唇落→主地板 (611,256)——probe42-final1.log f0-f3326 无死亡无卡段；
wg 上行依赖 v25 WGSX 拼接（sleep1300 错峰+井弧再入），已并入 probe42 wg 前缀。

---

## §2 autosearch 官方尝试（--maxminutes 30）

| 轮 | 配置 | 结果 |
|---|---|---|
| v10-resume | --resume 上槽报告，segs 0-5 | 92s 停：C1/C2 种子定稿在 v10 链上 C2→C3 seam 蒸发（fb[638,710] 不在 entry [280,490]），R3 回退耗尽，0/6 |
| v10-fresh | 无 resume，segs 0-5，beam24/budget6000 | 161s 停：C0-C2 新解（2/6），C2→C3 seam 同因失败（end-state-evaporated），C3-C5 未触及 |

两轮日志：TEMP/fw-rc2-1/autosearch-v10.log、autosearch-v10f.log（git 已存 a7bb09b 后续提交）。
seam 断点与上槽 autosearch.mjs:853 注释同因（C2 定稿终态接触钉态脆弱，seam 复放漂出 entry 窗），
属工具链限制，不构成新路线信息；机器两轮均未能抵达 C5，故不能以搜索结果反驳 §1.5 静态封锁。

---

## §3 终局定性

- **01号档「C4 封锁系探针误读、路线可复产」——本槽证实其前半**：C0-C4'（至主地板东台）全链
  手上复产并两次内核实证（§1.6），上槽探针的组信号误读已绕开（v25 WGSX 拼接+错峰）。
- **后半（可通关）在本内核不成立**：C5 双门跨 544 墙被 §1.5 逐帧证据封锁；四向绕行全数证伪
  （§1.4）。01号档已记档内核/原版 portal 语义分歧（原版 begin-contact 贴面即传 vs 内核
  band+CCD 弧线才可入）——若按原版语义，南带贴面即传或使 runway 免跳直达，属内核-原版
  差异裁决面（存疑待核，非本槽终判权限）。
- route-node 3/3 未跑（无定稿路线可跑，跑了必败，不造假）。

## §4 移交清单（5.3 生产槽）
1. 可复用资产：probe42.mjs（C0-C4' 全链步表+dump 模式）、mini-final9/11（发射道参数）、
   geo-probe/geo2/doors2（几何问询器）、scan2（双跳扫描器框架）。
2. 若内核 portal 语义获裁决放开（贴面即传），C5 复活路径=1.3 发射道，发射点=台面 runway——
   仍需 runway 可达性先解（1.4），或直接按原版语义重测北带行走入场。
3. checkpoints v10 已就位；若 5.3 需再跑 autosearch，建议先修 C2→C3 seam（trim 后终态=钉态
   的复放脆弱性），否则机器无法越过 C3。
