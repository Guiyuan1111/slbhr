# 01号档 · 冰雪神庙（ice）Phase 0 取证 + Phase 1 落地

> 日期：2026-10-25。对象：oracle 快照 `Fireboy-and-Watergirl/output/C`。方法同 light 01号档（程序化普查）。

## §1 对象与总体

- temple：id=ice、53 条目 = 共享教学关 forest_01 + light_01 + **自有 51 关**（ice_02…ice_50 +
  ice_bonus_1/2；ice_02 在 tutorials）。磁盘与 temple 引用一一对应（0 缺失）。
- 尺寸：39×29 ×52 + **ice_bonus_2 = 39×35**（第二部超高关，light 的 bonus_2 同款特例——
  静态相机整图入画逻辑已通用）。
- type 谱：general 28 / puzzle 17 / speed 8（**无 dark**）；per-level time 齐备（35 种组合）。

## §2 机关谱（解析器同款口径）

platform 245 / pusher 128 / lever 45 / **beamer 41** / box 37 / ball 30 / **timedpusher 25** /
rotmirror 15 / boxheavy 14 / **infinitemirror 13** / pulley 13 / wind 12 / lightpusher 11 /
slider 11 / hanging 10 / boxmirror 9 / window 1 / roman 1。

- **timedpusher ×25 = ice 唯一未实现机关**（level2 default 分支已预留名字；bundle 反解待 Phase 2）
- 光机关家族（beamer/rotmirror/boxmirror/infinitemirror/lightpusher/slider）**全套复用**——
  0.3.45 内核直接受益，Phase 2 仅剩 timedpusher。
- 图块集 Ground/Objects/LargeObjects 与 A 字节一致；Chars 类型映射一致（字节差在无关字段）。

## §3 资产层

- 每部三件：`atlasses/Temples/ice/TempleAssets.{json,png}` + `GameNameIce.png` + `TempleHallIce.jpg`
  （已入库）；音频树与 A 逐文件一致（33 文件）；基础资产全共享。

## §4 Phase 1 落地记录

1. 数据入库：`data/ice/levels/`（50 文件）+ `data/ice/temple.json` + `data/tutorials/levels/ice_02.json`。
   ⚠ 教训：拷贝 C 部 tutorials 时曾覆盖库里 B 部 light_01——**B/C 两部同文件不同字节**，已恢复
   B 版；tutorials 目录拷贝必须逐文件甄别归属（各部共享关以本部数据为准的原则待用户裁定）。
2. `levels.ts` LEVEL_DIRS 增 `data/ice/levels`（第三部）。
3. 冒烟：51/51 解析+建世界+60 步零失败；unknown=timedpusher×25（记录不阻断语义）。
4. det 锚：`r0-ice`（51 关，timedpusher 缺席语义）存档；CI 增 determinism-ice 作业（三部分锚格局）。
5. templeIdOf 前缀：客户端 `templeIdOf` 需加 ice 分支（Phase 3 时）——当前 light_02 属 light 前缀
   不受影响；ice_02 前缀 ice 待加。

## §5 Phase 2/3 待办

- Phase 2：**timedpusher 内核移植**（bundle `init.<C hash>.js` 反解 → 探针 → 落地 → 重锚 r0-ice）。
- Phase 3：templeIdOf 加 ice + 客户端三件资产路径（参数化已通用，仅前缀表）+ dark 无关。
- 路线：照 light 工序（人工初排→kernel→route.mjs repeat≥3）。
