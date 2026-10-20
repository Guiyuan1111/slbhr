# 00 · 总索引——CPU/分配热点剖析（perf-hotspot）

> 维护：noteidx 槽 2026-10-20 首建。口径：每号档一行+tools/ 逐件列用途；一切结论以档卷原文与 git log 为准，本索引只做导航。
> 定位：性能优化战役第一轮（hotspot 槽，2026-10-18）——回答"慢在哪"的热点剖析；姊妹篇=bench 槽 r0 基线同日测"多快"（note/report/perf/2026-10-18-r0-baseline.md）。产品代码零改动，全部产出为剖析与可复跑工具。
> 关系：后继优化落地与 r0–r11 十一轮战役速查挂 behavior-parity [00-INDEX §4](../2026-10-behavior-parity/00-INDEX.md)；性能总账在 [note/report/perf/2026-10-18-campaign-summary.md](../../report/perf/2026-10-18-campaign-summary.md)。
> 状态图例：✅ 已收口｜🔄 活档｜⏸ 断点保留。

## §1 档卷一览

| # | 档卷 | 一句话主题与关键产出/结论 | 状态 |
|---|---|---|---|
| 01 | [01-hotspot.md](01-hotspot.md) CPU/分配热点剖析（性能优化第一轮） | 三面时间去向定位：主动物理负载下 box2d 引擎内部 self 86.4%（服务器链 64.1%），最大可动单项=vendor 遥测计时器 b2Timer（idle self 13.4%/replay 5.8%，纯写不读、物理零依赖，m_profile 只写静态审计过）；内核胶水仅 ~4%，唯一实义热点=step() 体内逐步新建的 jumpSound 闭包；序列化非瓶颈（encode 9.6%/tick、384B 增量）；分配 idle 2.4KB/步、主动 10KB/步，GC self ≤2.7%。交接清单：#1 b2Timer 桩（须证明位级中性）、#2 mechSnapshot 中间对象消除（零风险）、#3 jumpSound 提升；#6/#7/#8 列必漂禁区（SolveTOI/InsertLeaf/goog.base/关节求解序，永挂账不动）。存疑：与派发口径"63µs/帧、31 回放/s"存在 2~4 倍出入已如实记录不裁决，以 bench 槽 r0 同机数字为准 | ✅ 已收口（bb6f049，交接完成） |

## §2 tools/ 目录速查（18 件，全部自包含可复跑）

| 件 | 用途 |
|---|---|
| prof-kernel-idle.mjs | 负载 A 驱动：内核空载步进剖析（makeWorld(forest_12)+EMPTY_INPUT，默认 400k 步） |
| prof-kernel-replay.mjs | 负载 B 驱动：整关回放剖析（routes/forest_01.json 事件流逐帧回放 WIN@f2365 锚，60 遍） |
| prof-server-chain.mjs | 负载 C 驱动：服务器 tick 链 headless 剖析（world.step → syncState（ForestRoom.ts L410-536 逐行镜像）→ Colyseus Encoder.encode，30k tick） |
| parse-profiles.mjs | .cpuprofile/.heapprofile 解析聚合器（self/inclusive 时间或分配字节按函数聚合+分类汇总） |
| callers.mjs | cpuprofile 调用者/被调者归因查询（含递归去重栈 self/incl 汇总） |
| agg-cpu-idle-400k.json / agg-cpu-replay-60.json / agg-cpu-serverchain-30k.json | 三负载 CPU profile 聚合结果表 |
| agg-heap-idle-400k.json / agg-heap-replay-180.json / agg-heap-serverchain-30k.json | 三负载 heap profile 聚合结果表 |
| raw/ | 原始 profile 收容 ×7（cpu 4 件：idle-20k/idle-400k/replay-60/serverchain-30k；heap 3 件：idle-400k/replay-180/serverchain-30k，单件 ≤316KB） |
