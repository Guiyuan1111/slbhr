# 并行性能线（qoder r12–r43）收容与移植分流 · 2026-10-27

## 这条线是什么（审核还是开发？核查结论）

用户以为派出去的是"审核"，实为**完整开发**：2026-10-21 14:43 → 10-23 11:52，209 个提交的客户端性能战役 r12–r43（32 轮），基点 0.3.42（18a54e8）。证据：

- packages/ 源码 42 文件 **+5799/−316**（BootScene +572、GameScene +299、main.ts +139、overlays +137、audio.ts +93、新文件 groundCache.ts/jsonRes.ts 等）；
- 新增 20+ 个测试/门禁文件（treebake/domskin/prephase-canvas/audiofamily/groundcache 等）；
- 34 份战役报告 +7173 行、战役总账扩至 §四十；
- 自行收口了一个 0.3.43（r12–r21 十轮收账）——**与 main 的 0.3.43（M12 相机）撞号不同容**；
- `git cherry main dade142` 全部 209 个提交 patch-id 与 main 不等价（非重复劳动，是平行实现）。

## 收容口径（2026-10-27）

- 代码与提交：固化分支 `qoder/r12-r43-perf-campaign`（指 dade142），原 qoder 工作树已撤（干净、untracked 无一）。
- 文档：34 份报告 + 战役总账超集（§九–§四十）收容入本目录；其 0.3.43 收口存档为 `note/release/0.3.43-qoder-perf-line.md`（同号不同容，仅存档）。
- **快照不入库**：该线 benchmark/results 证据快照 607 文件 ≈169 万行——体积红线（0.3.51 #42 刚把 tracked 降到 123MiB，CI 软阈值 150MiB），全部留在分支上，各报告数字以原文为准。
- 注意：该线数字全部针对 0.3.42 时代代码；main 后经 0.3.44 静态相机、0.3.45–0.3.47 灯光/冰雪、0.3.48/0.3.51 加固，**数字不可直接引用于当前 main**，移植须逐项重验证。

## 逐轮移植分流表

| 轮 | 主题 | main 现状（0.3.52） | 处置 |
|---|---|---|---|
| r12 | 帧内写入：相机弹簧亚像素吸附/HUD 反缩放/电机声标量差分 | 0.3.44 已改**静态相机**（跟随写入大面积不存在）；0.3.42 已有 T10 电机声逐台实例 | 前提部分失效，对照后小拣 |
| r13 | 换关链预取预烘下一关地面 + 地面缓存有界 LRU（groundCache.ts） | main 无此件；预取语义在静态相机下仍成立 | **可移植**（适配静态相机+三庙 139 关） |
| r14 | 选关驻留：templeTreeBake 分层流水线/离房释放/levelCache 有界 LRU | main 有 0.3.36 版 templeTreeBake；qoder 版 +159 行 | 可移植（需三方 diff 合并） |
| r15 | 冷启传输：staticGz 强 ETag/条件请求 + 关卡 API 协商压缩（jsonRes.ts） | main 两件皆无；staticGz 已叠加 #33 穿越/#45 方法闸门 | **0.3.53 已移植**（融合 #33/#45 演化） |
| r16 | 进房音频按关卡类型分族装载 | main 已加 bgm_level_dark（#31）与三庙 BGM | 概念适用，需扩三庙设计——后续批 |
| r17 | DOM 皮肤与整图集解耦（dom-skin 合成贴图） | main 未动 | 可移植（资产重打包+domskin 门禁配套） |
| r18/r19 | 中文位图字两段化 + 进房前字体图集重排 | main 未动 | 可移植（资产+prephase-canvas 取证配套） |
| r20 | 弱网档位量具（CDP 隧道节流） | main 无 | 工具件可独立移植（低风险） |
| r21 | 关卡循环曲出落定门（弱网 −2.1~21.4s） | main 未动 | 客户端行为件，后续批 |
| r22–r31 | 资产拆分/瘦身族（char/menu/popup/mech/room-font 等九件） | main 未动 | 资产重打包族，**单独立项**（换代取证流程配套） |
| r32–r40 | canvas shrink/repack 族 + advance warm + asset versioning + finish anim rebind | main 未动 | 同上资产族，单独立项 |
| r41–r43 | 离房释放族（leave/chars-play/menu-only release） | main 0.3.48 #29 已做"复用归零黑幕/浮尘/光束折线引用"（主题相邻实现不同） | 对照合并，待复核 |

## 首批移植（0.3.53）：r15 服务端两件

选 r15 的理由：main 完全缺失、纯服务端可全套 vitest 复验、收益与 0.3.42 无关（关卡 JSON 冗余度只增不减——ice 51 关更大）、与 #45 加固正交。融合要点：保留 main 的 #33 穿越防护与 #45 方法闸门；关卡 API 缓存策略沿用 main #45 的 `public, max-age=300`（该线原为 no-cache），叠加内容寻址 ETag 后 300 秒内共享缓存、过期条件复验 304。
