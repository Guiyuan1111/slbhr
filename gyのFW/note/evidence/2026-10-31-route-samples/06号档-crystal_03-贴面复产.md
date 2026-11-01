# 06号档 · crystal_03 贴面复产（fw-route-crystal3 槽，2026-10-31 派发）

任务：内核语义修复 b0566ae（传送门贴面即传）后第三次产出 crystal_03 route。
结论先行：**C0-C4 全链搜索定稿，route 已导出并真服验收（诚实未胜）；C5 维持预注册封印，终判留档不下。**

## 1. 贴面即传语义探针（工作项1，30s probe）

复核命令：`node --import tsx TEMP/fw-rc3-1/probe1.mjs A`（2026-11-02 复跑，与派发首轮数字逐位一致）：

| 案 | 场景 | 结果 |
|---|---|---|
| A1 | P6 口袋地板西行走入 | TRANSPORTED@f28，pre=[278.65,412.54,vx0,vy0] → post=[264.89,220.64]（慢走带缘 278.65px 即触发=带宽 0.22m） |
| A2 | 静止贴面 | TRANSPORTED@f0，pre=[265.59,412.8] → post=[278.46,220.75]（贴面即传，零位移帧） |
| A3 | wg 出口袋后西行 | TP#1@f28 [264.9,220.6] → AT-DOOR@f63 [125.2,220.5]（P7 西出口→门台） |

语义=mechanisms.ts checkTransport（|本地 x|≤0.2+0.02m，|本地 y|≤1.5m，Step 前，200ms/体冷却）——与 oracle begin-contact「贴面即传」等价（01号档 §1.3/§1.4 记档口径）。

## 2. C5 预注册封印（维持，不下终判）

v11 封印结论复核仍成立（checkpoints C5 段注记 + SEGC C5 注记，commit 1213ec2）：
- 语义实证全绿（§1 三案）但 P6 带几何封闭：带 x[265,279]×中心y[352,448]，板实心 y[448,480] 占带下段；上段需 feet≤448=净升≥128px，实测静跳 118.95 / 跑跳≈95（合速钳 |v|≤496，oracle D.har 逐字同式）——差 5~9px；
- 缓冲块封坡顶（头顶余隙 63-69<57+起跳量）；row-18 西段不可达（东链 probe2 板顶动量跳→东阶梯→544 塔面钉 (559.68,239.6)，塔顶需升 143.6>119）；
- what-if probe3 十二组 jumpX 全落回；关卡 JSON 与 oracle har 响应体逐字节全等（无转换缺陷）；gravity.y=1000px/s² 同。
- 本轮新增佐证：§3 search2 中 C4 收敛点 [612,221] 即 05号档 §1.6「主地板东台」；fb 惯性终点=544 墙钉 [559.8,169.6]（feet 205=stack 顶，与 §1.5 逐位吻合）——墙东西两侧 y[96,256] 不可穿越的实测在 C0-C4 全链下复现。
- 处置：--segs 0-4（C5 不烧预算，04号档 F4 先例）；C4→C5 seam 按设计不可过（search4 报告 seam=-1 (entry-no-fire)，R3 回退耗尽后停，属预期诚实终态）。

## 3. 搜索统计（autosearch，canonical flags：--evalchild --seamgrace 40 --maxminutes 30）

| 轮 | 报告 | 结果 | 关键修复（commit） |
|---|---|---|---|
| v11 重跑 4 | —（日志证据入 e17e5b2） | C2 穷举门 no-met fb[48,714] | trim 裁尾锁存坠龛→C2 撤杆件 hold→walkTo（e17e5b2） |
| v11 重跑 5 | —（6c6b803） | 搜索期过关稿 trim[11,11] seam=565 exFatal=0 被池错位丢弃 | 摊平 beam 全量保留（6c6b803） |
| v11 重跑 6 | —（0a0f227） | 穷举门 wg[348,861]/[279,861] | walkTo 刹车方向门+finPass 直传（0a0f227） |
| 本轮 search | TEMP/fw-rc3-1/crystal_03.search.json | C0 解 evals153 / C1 解 evals9 / C2 解 evals417（score'=6069 穷举Fatal=0 trim 11/11 seam@565）；C3 未解 evals2459（旧配方对关门假墙） | SEGC C0 jd×4（aeb7575）、holdLev（e1a4794）为前置 |
| search2 | crystal_03.search2.json | **C3 解 evals19（d1 recipe met=true best=5143 rob 0/6，trim[14,14] seam→C4 entry@1021 exFatal=0）**；C4 未解 evals3931（best fb/wg=[612,221] wp1/1 met=false——旧窗 py[230,290] 不可达） | SEGC C3 v12 重写（723e934）；C4 窗校正（11ec875） |
| search3 | —（误 resume 被 kill，无报告） | resume 语义坑：search2 报告只含本轮段（filter=1→startIdx=1），帧账错 | 改用合并 final 报告 c04.resume.json |
| search4 | crystal_03.search4.json | **C4 解 evals3766（d1 recipe met=true best=6308 rob 0/6，endF 1225，trim[17,19]）**；C4→C5 seam 按封印预期 entry-no-fire，R3 耗尽停 | checkpoints v12（11ec875） |

辅助实证（TEMP/fw-rc3-1/）：arcsweep3（portal 2 强开→板缘/坑底 jd(-1) 全传送 TP@f13-47）、c3v2（W1 runJump(-1,535) MET@1021 / W3 jd×6 MET@1005 / W2 rj505 落杆 unflip 困死 [47.6,714.2]）、slopesettle（45° 坡 5/5 滑落）、docreplay（消费端事件表回放）。

### 3.1 两大根因更正（v11 → v12）

1. **C3「钉点 0.6px 差」= portal 2 关门假墙**：c3diag 期 sweep 全程未拉杆；P3 west well（Tiled obj x=0,y=672,w=64,h=96 → level2 中心矫正 (32,624)，带 x[24.96,39.04]×y[576,672]）`initialState` 缺省 0=关（mechanisms.ts:1773），关门假墙实体化钉死行进。真实 C3 入口 lever=1（C2 holdLev 断言）→ 门开 → 板缘 jd(-1) 直接传送。杆陷阱（c3v2 W2 反证）：西行踏杆=unflip→关门→双方困死；wg（567.1 杆东）必须 runJump(-1,535) 空中越杆。
2. **C4 目标窗表面 y 误作中心 y**：v11 py[230,290] 按 probe42「(611,256)」写窗；半高 35.5px 双锚（row-6 顶 192↔静心 156.5；台顶 256↔静心 220.5）+ 45° 坡 settle 5/5 滑落证明窗内无可站立面。窗校正 [180,230]（commit 11ec875）。

## 4. route 定稿与导出（工作项3）

- 定稿：`scripts/e2e/inputs/routes/crystal_03.json`（commit 693fcad；totalFrames 1285，fb 270 / wg 332 事件）。
- 程序来源：search4 C4 final 累积程序（fb 17/wg 19，trim 裁尾）+ 消费端语义补尾（fb +[hold(-1,614),sleep(30)]、wg +[sleep(30)]——trim 稿表尾缺释放=末键按到表尾，事件表回放 fb 惯性越唇滑至 544 墙钉 [559.8,169.6]，补尾后双角色稳定泊窗）。
- 消费端回放复核（docreplay，同 runKernel 语义）：C3 双入窗@f1021（row-6 x[960,1260] py[60,175] grounded）、C4 双入窗@f1208、终态 fb[611.2,220.5] / wg[612.2,220.5] grounded 泊校正窗、lev=1、零死亡、phase=playing；runKernel 复核 未胜/deathF=-1（C5 封印内诚实终态，非缺陷）。

## 5. 真服验收（工作项4）

`node --import tsx scripts/e2e/route-node.mjs --level crystal_03 --repeat 3 --port 3577`：
**0/3 PASS**——三跑全部 won=false / diedAt=timeout / phaseSeen=started，零死亡、逐跑一致（scripts/e2e/out/route-results-node.json）。与内核回放同构：路线确定性走到 C4 终点（主地板东台），C5 封印使 phase 不可达 won。**按任务书预期如实记录，不造假。**

## 6. 处置与移交

- route JSON 与 checkpoints v12、SEGC C3/C4 配方均已细粒度 commit（723e934 / 11ec875 / 693fcad）。
- C5 仍封印：后续如解封，需先复核 §2 三重证据（数据同/物理同/净升差），终判留档不下。
- 存疑项：
  1. search4 C4 final 的 metAt 记账（204，相对值）与 doc 消费端实测（绝对 f1208=段内 187）差 17 帧——finalize 回放（expandFlat 表尾锁存语义）与消费端在表尾帧级有微差，入窗事实两口径均成立，帧账未深究；
  2. C4 final inlineFatal=1/10（finPass 复用路径未带 groups 明细，致死扰动组未知）——route 已由真服 3 跑零死亡兜底，鲁棒谱细节存疑待查；
  3. portal 2 的 `inverted` 两端身份未逐端核验（arcsweep3 以 `!p.inverted` 选端，传送方向与落点实证覆盖了方向正确性）。
- TEMP/fw-rc3-1 探针/诊断脚本（probe1/arcsweep3/c3v2/c4diag/slopesettle/docreplay/export-route 等）随清理删除，本档已摘录全部关键数字。
