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

---

## 7. 环 9-12 内核连链实证（2026-11-01 fw-route-crystal3 续槽，oracle 十二环逐环复现）

主会话以 01号档 §4 十二环为蓝本派发连链任务。本轮在内核新建 probe9/10/10b/10c/11.mjs
（已收容本目录 tools-ring912/，复跑：node --import tsx <脚本>，probe11 chain 930）逐环实证，**环 9/10/11 全通，环 12 fb 侧全通（atDoor=true 站门），wg 侧结构性封死**——C5 封印
维持但机理换血：封死点不在 v11 所记「P6 带净升不足」，而在 **P7 带门台陷阱**。

### 7.1 环 9：口袋东下行→floor320 ✓（01号档 §5.1「唯一无连续证据环」补证）

- 几何真相：口袋台顶（C4 终点 611/612,220.5）东缘满速走断即**弹道飞行**——45° 下行楔
  （col20/21，x[640,704]，256→288→320）追不上 273.9px/s 平抛，char 全程凌空，落 416 板
  r13 阳台（x[672,800] top416）西端 797.4（与 v11 note「抛物线落板顶 797.4」逐位吻合）。
- fb 上 floor320：阳台落点 vx 被落地 scrub 至 ~0-25，**落板即跳**（up 持 12f，慢跳 vy≈490
  升 121px>64px 需求）落 floor320 西楔尖/台面（882-975）。probe9 A 扫参 jumpX 696-706×
  holdUp 8/12 共 8/8 变体稳定落 [975.05,284.55]（feet319.8，贴箱东侧，顺带把 box 960 踢至
  ~1019-1045，fb 落箱西侧即推位）。
- wg 下行：纯走断（无跳）：口袋→阳台→板东楔(416→448)→832 缘走断→512 楔西尖(896.5)→
  爬 512→480→448 板→西行——probe11 W0（E340f）实证停 [942.48,426.97]。
- 关键陷阱记录：**currentRunForce 初始 undefined（character.ts:37），首帧即按键=NaN 力永不动**
  ——所有探针/配方行走前必须 sleep≥3f（这正是既有全部配方以 sleep(3) 开头的根因）。

### 7.2 环 10：box 抛送+西推锁存 ✓

- 传送机制逐帧实证（f130-f155）：box 的 4096 portal-sensor 标记圆（r3.2）撞 **实体 eventHorizon**
  （cat/mask 4096、isSensor=false、西面 1212.8）钉死在中心 ~1209.45；传送带 |lx|≤0.22m=7.04px
  （西缘 1208.96）与钉点仅差 ~0.5px——**入带帧落点决定入口 vx 死活**：落点 <1209.4 → 入口
  vx 存活 → 出口镜像西抛（同 inverted 对 vx 反号 + 低速钳 SET 10/mass=228px/s）→ 西滑 56px
  停 row19 ~1149；落点 ≥1209.4 → vx 钉死 ≈0 → 出口近垂直下坠 → 落 row19 带内 → 12f 冷却后
  回传弹回 floor320（Yo-Yo，且回弹方向不可控，可东坠出世界丢失）。
- 相位解：fb 回退至 ~906-950 刹停 8f 再推（probe10c 扫 backTo 850-970：ALIVE 8/31，含
  906/910/922/926/930/938/946/950）；链内 brakeX=930 实证 BOX-TP#1@f254 box→[1205.3,578.31]
  （存活入口）→西滑停 ~1052。
- fb 跟传：fb 持续东行入带→自身 TP（91.5% 死入带钉 1209.35-1209.6，观测 f265 →[1209.36,572.04]）
  →**落地立即 hold left**：既离带（西缘 1208.96 仅 0.4px）又贴箱东面推箱——一步双效。
- 锁存：box 西推上按钮（pusher 1056,608）→ LATCH@f292 state=1 → 柱收起 platY 528→434.1
  （COLUMN-DOWN@f379）→ box 稳停 [1052.57,578.12] 恒压。**F8 松手时机关键**：持续推则箱滚过
  按钮西缘脱压、柱回弹、箱卡柱前（f360 实证 box 816 卡柱）。

### 7.3 环 11：柱下通道 ✓

柱收起（[480,576]→[384,480]）后 fb/wg row19 西行→576 楔(768-800) 上 row18→穿 x[705.92,734.08]
柱下通道（净空 [480,576]，char 高 ~71px 头部余隙 25px）→西段。柱未收时 char 正确钉在柱东面
（fb 749.7 实证，物理正确）。

### 7.4 环 12：fb 侧全通 ✓ / wg 侧封死 ✗

**fb 全通**：row18 西行→台阶 576→544→512 自动攀→512 西端(47.6 墙钉)折返→86-94 缘跑跳东
（vx 272）→**弧线中段穿 P6 带（东向）**→P7 东出口落门台 (283.79,202.63)→东行 425 刹停
446.32→**atDoor=true 站门**（FB-AT-DOOR-ZONE@f708）。与 oracle probe4-F（板跳终态 244.5,412.5
同预置复刻 fb 落 [226.47,412.54] 永稳）及 probe3-C（东行穿带→门台落点）双吻合。
注意 board-jump 弧线 vy 满速时被合速钳压至 435，弧线中段中心 y 366-392 恰落在 P6 带 y[352,448]
内——**512 楼板全速板跳必然东向传送**（fb 正确利用；wg 因此无法西向）。

**wg 封死（新机理链，五重独立陷阱）**：
1. **缓冲块封 Wedge 路线**：row18 (~370) 静跳/左漂跳上壁龛板东段——头颅撞缓冲块
   x[324.8,347.2]×y[388.8,411.2]（v11 §2 已记），rise 截断至 43-83px（实测 minFeet 489-537），
   上不去；x≥368 净空起跳则落点在楔东/原地（静跳漂移东 0-22px 实测），回 row18。
2. **512 楼板板跳必东向**：全速板跳弧线中心 y 366-392 恰在 P6 带 y[352,448] 内→弧线中段
   x[265,279] 必触发东向传送（fb 同机制）；减速跳（vx≤200）落板西段 226-264，东行至带缘
   265 又即触发（带西缘=板面行走可达）。
3. **P7 带门台陷阱**：东向传送出口 (278.5-279,220.5) 东滑后西行返带（279.04）→ 二次传送
   上行至 P6 板 (265,412.8)→板西缘 224 走断坠腔室（x[32,128]×y[288,512]，底 512）→row18→
   台阶→512 楼板→板跳→**闭环**。腔室底 (feet 511.7) 距门传感器 (96,256) 220px，腔内跳
   头顶 286 距传感器底 264 差 22px，均不可达。
4. **P7 实体 horizon 封平台西行**：门台上西行 char 身体撞 P7 horizon（x[268.8,275.2]×
   y[160,256] 实体）钉死于 278.4（05号档「西门不可东来」机理实测复现，probe11 END
   wg 钉 278.66→冷却后传送落板 265.34）。跳越 horizon：起跳 vx≤100 时弧脚 148-170 可净空
   其顶 160（容差 0-11px），但落点 298-368 全在带东侧，西行返带闭环；vx>130 弧脚 179-191
   拍中 horizon 顶（差 2-31px）→坠落→P6 带传送→出口 (272,220.59) **spawn 于 P7 实体
   horizon 内部**（body y[185,256] ⊂ horizon y[160,256]）→box2d 楔穿平台落板——全变体闭环。
5. **跳越带落点右界**：probe 扫 x0 280-320×左持 20-55 共 20 组，落点 284.9-310.8 全部在
   带东缘 279.04 之东（漂移上限 ~17.8px）；落点须 <264.96 需漂移 ≥25px，超 h 力上限。

**门角色锁定实测**：fb 置 wg 门/wg 置 fb 门 → 双门 isOpen 全 false（角色锁定）；各归其位
→ 双 isUp@f60 → phase=won（win 机制本身正常）。

### 7.5 结论

- 环 9/10/11 + 环 12-fb：**内核全通**（tools-ring912/fb-chain-complete-wg-sealed.log：fb 全链 f0-f708 至 atDoor，零死亡）。
- 环 12-wg：**P7 带门台陷阱封死**——与 v11 §2 封印结论（C5 不可胜）一致，但封死机理精确化：
  非「净升差 5-9px」单点，而是「板东段不可达 + 带东向强制 + horizon 钉 + 落点右界 + 腔室闭环」
  五重复合。oracle 十二环的 wg 门路段在 01号档本就属诚实缺口（§5.2 连续通关未达成），
  其 wg 门可达性从未被 oracle 实测支持。
- route 定稿维持 693fcad（C0-C4 全链诚实未胜）；C5 封印维持。fb 侧链路可作后续解封的
  已证资产（若 wg 门机制获裁决放开，fb 半链现成）。
