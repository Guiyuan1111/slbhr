# 童话神庙（第六部）档卷索引

> 立项：2026-10-30（F 部取证槽）。快照 = oracle `output/F`（fairytales，六部唯一 `canRevive:true`）。
> 方法论总纲：[note/next-games-playbook.md](../../next-games-playbook.md)。

| 档 | 内容 |
|---|---|
| [01号档-取证.md](01号档-取证.md) | 引擎同源性判定（同库新 vintage：Phaser 2.6.15/Tiled 1.x）+ fairy/fairycup/RespawnManager 反解 + 32 关与 temple.json 全普查 + 资产音频差 + 无头实跑（仙女入杯闭环）+ 风险 R1–R7 |
| tools/ | census_levels.cjs（全量普查）/ fairy_count.cjs（仙女逐关）/ temple_check.cjs（temple 核查）/ fairy_drag_probe.cjs（无头拖拽实验，先起 8790 静态服） |

一句话结论：**异构的是壳不是数据骨架**——关卡数据与 A–E 同构但换 Tiled 1.x 表达且逐关 firstgid 排布不一；
引擎同一代码库新包，新增语义集中在 fairycup + fairy + 检查点复活三件套，其余机关谱与 A–E 全量复用。
