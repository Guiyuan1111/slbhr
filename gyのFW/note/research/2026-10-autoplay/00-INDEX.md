# 00 · 总索引——机器自动探索通关线（autoplay）

> 维护：noteidx 槽 2026-10-20 首建。口径：每号档一行（档名+一句话主题/关键结论+状态），tools/ 逐件列用途；一切结论以各档原文与 git log 为准，本索引只做导航。
> 定位：机器探索通关线全档卷——从可行性调研（01）到实现级设计（02）到 forest_01 分段搜索实施档卷（03，含 r8a/r8b 续攻与 r8c 阵亡记录）。下游产线=autosearch.mjs（scripts/e2e/routetool/，本线孵化）。
> 关系：总挂账挂 behavior-parity [00-INDEX §3](../2026-10-behavior-parity/00-INDEX.md) 挂账 1/2（oracle-gold 48 关路线供给方与机器探索线三选一决策）；oracle-gold fixture 协议见 behavior-parity §1–§2。
> 状态图例：✅ 已收口｜🔄 活档｜⏸ 断点保留（有明确续作断点与恢复命令）。

## §1 档卷一览（01–03）

| # | 档卷 | 一句话主题与关键产出/结论 | 状态 |
|---|---|---|---|
| 01 | [01-feasibility.md](01-feasibility.md) 自动探索通关方法可行性调研（auto 槽 2026-10-15） | 可行且本项目是自动搜索理想宿主，推荐"原语级闭环搜索（机器粗搜）→ 现有硬化产线精修"混合路线、不上 RL：内核确定性+整关回放 63µs/帧、ScanPool(7) 稳态 31 次整关回放/s（1h×7 核 ≈11 万次）；考古结论=bot 系工具是"闭环原语步骤机"死于配额墙可复活；最大坑=内核 WIN≠真机 PASS（真机 CDP 0-5ms/事件抖动+1/315 的 40ms 离群），目标函数必须含鲁棒性项；MVP ≤2 人日；理想试点=forest_15 尾段 7523 跳台像素带（现成 94.0% 前缀、失败封闭 ~32px 落点带） | ✅ 已收口 |
| 02 | [02-design-mvp.md](02-design-mvp.md) 机器自动探索通关 MVP 实现级设计（auto-design 槽 2026-10-15） | 三核心假设全过检：①检查点评分函数有区分度（E3：S0a 段 12 层 best −1996→+392 单调爬升，wg 子目标解锁评分跳变 +1074）②检查点断言全部可计算（E1：9 段×146 条按"组内同帧联合满足"全命中，S0a@378→S7@2365(WIN) 缝差 ≤1f）③鲁棒口径有内核基线（E2：绿路线 ±1f fatal 0/222、±2f 13/222）；§8 施工清单供实施槽照单施工，待决项 6 条见 §9 | ✅ 已收口 |
| 03 | [03-mvp-forest01.md](03-mvp-forest01.md) forest_01 机器自动探索通关 MVP 档卷（auto-build2 槽 2026-10-16/17+r8a/r8b 续攻 10-19+r8c 阵亡记录） | MVP 三态：全自动 S0a–S4 六段（段级 ±1f 穷举 Fatal=0，S4 end@f1370）；半自动 S5（搜索 met=entry+690f 双窗命中，但 ±1f 穷举恒剩恰 1 fatal——S4→S5 缝上 wg[47] -1f 乘升 ride 振荡相位耦合级联，v20-v24 五变体同败，预算超限止损）；未竟 S6/S7。验收门未达成（整关导出件仍为前槽 s7j ±1f 365/614 脆版）。新证机制 28 条（§3-1~9 基础+§3a-10~16 r8a+§3b-17~28 r8b/r8c：泊位剪跨段反噬/定稿修剪对角梯盲区/append-only 结构死路/吸收头模式/slick 刹车振荡/跳跃冲量随足底法线衰减/板面→台面连续西升斜坡西端 ~710-715 断崖等）；断点=tools/r5.search.json（S5 最优种子 v24 已固化 autosearch.mjs），r8c 槽随宿主二次重启阵亡未及 commit，续攻线索①ride 相位门控②wg[47] 对冲脉冲原封未试 | ⏸ 断点保留 |
| 04 | [04-ice02-i4-gate.md](04-ice02-i4-gate.md) ice_02 I4 闸门段攻坚档卷（探针 v19-v29+beam 8000 evals） | 未解开卷：窗口律=首次按压+~390f（三跑交叉）、横渡 470-535f>445f 几何缺口、池缘擦碰/斜坡栈双轮盘、种子 rob=0/6、四条复攻入口 | ⏸ 断点保留 |

## §2 tools/ 目录速查

| 件 | 用途 |
|---|---|
| bench1.mjs / bench2.mjs / bench3.mjs | 01 号档基准实测三件：回放速度/step 单帧/构建 vs reset；严格分解（JIT 预热）+并行吞吐+确定性复核；活跃 vs 睡眠体成本+池稳态吞吐（§2 数字出处） |
| microsearch.mjs | 01 号档微型端到端验证：原语序列 beam search（Demo 级非通关，163→1103 分对照基线） |
| beam-seg.mjs | 02 号档 E3：分段 beam 搜索微原型（检查点评分函数区分度验证，产出 beam-seg-result.json） |
| explore.mjs | 02 号档 E1a：绿路线回放探查，反推检查点分段用的位置/机关时间线（输出 out/explore-events.json、explore-trace.json） |
| verify-chain.mjs | 02 号档 E1b：检查点链断言可计算性验证（绿路线回放逐帧求值全部断言，产出 chain-verify.json） |
| perturb.mjs | 02 号档 E2：已绿路线 ±Nf 单事件扰动 fatal 率基线（产出 perturb-result.json） |
| scan1f.mjs | 全量 ±1f 扰动扫描（03 号档验收门工具，ScanPool 口径；记录每条 fatal 的扰动帧与死亡帧分布） |
| dbg29.mjs | S3/S4 段件取证台（dbg27 谱系唯一保留件；TGT=s3\|s4 的 trace/seam 模式） |
| probe8c.mjs | r8c 槽 S5 定稿门续攻取证台（gate/trace/cliff/phase 四模式；**未验跑**，复活时先 `node probe8c.mjs cliff` 与 `phase` 各跑一遍自证） |
| geom.mjs | 几何速查：打印内核解析后 forest_01 关键实体坐标 |
| checkpoints-forest_01.json | 检查点定义（r8a 轮放宽 S4.target/S5.entry fb px → [940,1030] 去人工边界） |
| full7b.search.json / full14b.search.json / full15a.search.json / r5.search.json | 链谱系断点四件：S0a–S2 定稿（S3 final 已清）→ +S3 wall-anchor 终稿 → +S4 定稿链（S3+S4，fb25/wg25 原语、前缀 1370f）→ S5 收容断点（68b1b06 版，续攻 resume 入口） |
| beam-seg-result.json / chain-verify.json / perturb-result.json | E3 / E1b / E2 实验产出存档 |
| out/ | explore.mjs 产出收容（explore-events/trace.json、forest_01.autosearch.search.json 前槽搜索报告） |
04-ice02-i4-gate.md | ice_02 I4 闸门段攻坚档卷：窗口律=首次按压+~390f（三跑交叉）、横渡账本 470-535f>445f、池缘擦碰/斜坡栈双轮盘地图、beam 8000 evals 平台地形实录与四条复攻入口
