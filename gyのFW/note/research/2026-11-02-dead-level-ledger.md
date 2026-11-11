# 死关台账（2026-11-02 汇总，主会话；2026-11-11 增第六案）——六关候选待用户追认

依据：oracle 取证 + 内核双侧探针，全部档卷可复现（各档卷 §复现 命令照跑即证）。
「死关」定义：oracle 原生机制（无 FORCE_DOORS/无调试钩子）下双角色不可双双到门 WIN；内核与 oracle 数据同源（md5 逐关核验）且物理逐位同构（det 锚 241 关位级一致）。

| # | 关卡 | 终判 | 一句话机理 | 证据档卷 |
|---|------|------|-----------|---------|
| 1 | e_tutorial_fire | oracle 固有死关 | 双门对出生区零物理通路 | note/evidence/2026-10-31-oracle-adjudication/02号档（cf041d2/0d3776e 复核维持） |
| 2 | fairies-01 | oracle 固有死关 | 03号档（先期批） | note/evidence/ 同目录 03号档 |
| 3 | crystal_03 | oracle 固有死关（双侧同构） | wg 门五重封死：col-8 竖墙+P7 实体带 isSensor:false+448 板东段不可登；fb 侧全链可达门=单边 | 01号档（112dfe0 勘误）/04号档（连续 10 轮无 WIN）/05号档（2da9091 终审 NO）；内核侧 route-samples/06号档 §7 五重封死 |
| 4 | e_tutorial_water | oracle 固有死关（双侧死封） | 唯一咽喉走廊 x[1120,1152] 被顶悬立柱+钻石实体三重封死，9/9 相位全灭（差 ≥60px）；正对照证机制全健康 | 06号档（79093b9/5ef82b4/a2b3d2f+复核 276ac9a/6960ae3） |
| 5 | ice_02 | 结构性死点候选（双侧同构；反事实因果已证） | TimedPusher hold-to-reset 正确窗口模型：末位过闸者窗口=末次离开+264f；fb 最优 262-266f（差 2-6f 刀锋）/wg 314-319f（差 52f 冰拖角色物理墙，无动词可调）；oracle 侧独立缺口 ~73f 同构收敛；**反事实实验：单改 timeMs 即双配方全链 WIN（内核官方 phase=won）=闸窗口唯一约束因果坐实** | oracle：2026-10-25-ice-temple/02号档（dd334c9）；内核：note/research/2026-10-autoplay/07-ice02-i4-holdtoreset-final.md（f1b8673）+04号档勘正横幅；反事实：08-ice02-counterfactual-timeMs.md（69c7724） |
| 6 | eforest_1 | 死关候选（内核侧机械闭包证明；fw-foothold-ef 槽 2026-11-11） | plateau 双门（WIN 条件）在孤立上半区：512 层唯一入口在 416、416 唯一入口在 slab——递归无基例；跳力恒 70.5px 不可补 rise128；箱子只能压 b0/b1 门禁无桥接；机械闭包 BFS 固定点 138/272 段含全部可达面 | note/evidence/2026-10-31-route-samples/07号档-eforest_1.md（1d64932，CP0-CP7 真机链+可达域回溯） |

## 数值口径注意

- oracle harness（headless playwright + 帧劫持）存在运行间抖动：中途采样 ±0.3px、末帧收敛——档卷数值读 ±~1.5px；凡「逐位复现」仅指末帧/终态字段（06号档 §7 二次更正）。
- 各死判裕量（9.1px/62px/73f/52f）均 ≫ 抖动包络，判定不受影响。

## 处置选项（待用户裁决）

1. **追认六关为已知死关**→README 关卡账目注记（玩家可见「该关原版即不可通关」），样例 corpus 标注。
2. **ice_02 特殊项**：低成本解锁=关卡数据 timeMs 上调（反事实实证：**双配方全解最低 5800ms**；仅救 fb 末位架构 4500ms 即解；5700/5800 为 6f 相位刀锋，若做变体关建议 ≥6400 留余量——08号档 §4/§8）——即「改数据放行」，属产品决策非技术问题；机制反事实实验已完成（08号档）。
3. 路线复产能力位转移：crystal_04 / ice_03（2026-11-11 复产批次进行中：crystal_04 C0/C1 已过门，C2/C3 收官中）。

## 路线样例现状（route 不造假纪律）

- forest 线：多关已定稿（routes/forest_*.json）。
- crystal_03.json：诚实未胜稿（C0-C4， 无 WIN）留库作死关旁证。
- ice_02/crystal_04/ice_03：见各档卷；无全链 WIN 不出 route JSON。
- elements/fairytales 立足点（2026-11-11）：eforest_1 死关候选（07号档）；fairies-02 CP0-CP2 真机 + 光路情报成文（08号档），后续槽可续。
