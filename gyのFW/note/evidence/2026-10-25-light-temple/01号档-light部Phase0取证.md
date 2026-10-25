# 01号档 · 灯光神庙（light）Phase 0 取证

> 日期：2026-10-25。方法：全部程序化普查（python 解析 oracle JSON），oracle 严格只读。
> 定位：第二部开发开工档。续作方法论见 [note/next-games-playbook.md](../../next-games-playbook.md)。

## §1 对象与总体

- 对象 = oracle 快照 `Fireboy-and-Watergirl/output/B`（灯光神庙 light，系列第二部）。
- 关卡：temple.levels **41 条目** = 共享教学关 forest_01（tutorials）+ **自有 40 关**（light_01…light_40，无 bonus 关）。
  磁盘：`data/light/levels/` 39 文件（light_02…light_40）+ `data/tutorials/levels/light_01.json`，temple 引用与磁盘一一对应（0 缺失）。
- 全部关卡 **39×29**（无超高关，不同于 forest 的 bonus_2=39×35）。
- temple.json：`id=light, type=tree`，比 forest 多用 `label/color/edges`（树形图通用字段，forest 同有）；
  **每关自带 time/mobileTime**（16–130s），type 分布 general 26 / puzzle 8 / speed 6 / **dark 5**。
  → 客户端 `bgmKey()` 需新增 dark 映射（`LevelMusic_dark.mp3` 资产已存在，A/B 音频树逐文件一致 33=33）。

## §2 机关谱（解析器同款口径：gid→tileset 帧名，2026-10-25 全量扫描）

| 类型 | light | forest | 归属 |
|---|---|---|---|
| platform(非gid) | 141 | 223 | 共用，内核已有 |
| lever | 43 | 74 | 共用 |
| pusher | 44 | 73 | 共用 |
| ball | 13 | 20 | 共用 |
| box | 10 | 42 | 共用 |
| boxheavy | 3 | 17 | 共用 |
| wind(LargeObjects) | 10 | 33 | 共用 |
| hanging | 3 | 20 | 共用 |
| pulley | 9 | 11 | 共用 |
| roman | 3 | 6 | 共用 |
| **beamer** | **21** | 0 | **新机关** |
| **lightpusher** | **35** | 0 | **新机关** |
| **boxmirror** | **21** | 0 | **新机关** |
| **rotmirror** | **17** | 0 | **新机关** |
| **infinitemirror** | **12** | 0 | **新机关** |
| **slider(非gid polyline+group)** | **12** | 0 | **新机关** |
| window | 0 | 2 | forest 独有（light 不用） |

6 类新机关全部是光机制（发光器/旋转镜/箱镜/无限镜/光推器/滑轨）。**A/B 的 Objects.json 字节级一致**——
类型名早已在共享图块集里，level2.ts default 分支注释也预留了这批名字（"森林未用，记录即可"）。
Phase 2 内核工作 = 这 6 类的字节语义移植（bundle 反解 → 探针 → 落地）。

## §3 资产层

- **全系列共享一套基础资产**：A/B assets 树 diff 仅 6 个文件：
  `atlasses/Temples/{forest,light}/TempleAssets.{json,png}` + `images/GameName{Forest,Light}.png` +
  `images/TempleHall{Forest,Light}.jpg`。图块集 Ground/Objects/LargeObjects A/B 字节一致；Chars.json
  字节不同但 tile 类型映射完全一致（char/door/diamond，差在无关字段）。
- 音频 33 文件逐文件一致（dark 曲两游戏都在，light 用到）。
- 我方 `assets/` 取自 A（forest），**无需补拷**基础资产；Phase 3 仅需补 light 的 TempleAssets 图集 + 两张图。

## §4 引擎接线点盘点（我方 forest 硬编码清单，Phase 1/3 逐个参数化）

| 位置 | 现状 | 第二部动作 |
|---|---|---|
| `packages/server/src/levels.ts` LEVEL_DIRS | forest+tutorials | ✅ 已加 `data/light/levels`（本次） |
| `packages/client/src/templeData.ts` | fetch `/data/forest/temple.json` | 按 levelId 前缀选神庙 |
| `packages/client/src/scenes/BootScene.ts:40` | 装载 forest TempleAssets | 按关卡前缀装载对应图集 |
| `packages/client/src/scenes/TempleScene.ts:54-57` | forest temple.json+图集 | 同上 |
| `packages/client/src/main.ts` DEFAULT_LEVEL_ID | forest_01 | 保持（首部缺省不变） |
| `packages/client/src/scenes/GameScene.ts` bgmKey | general/speed | +dark |
| `benchmark` / `scripts/e2e` | 全量枚举 | det 已 --filter 分部（本次），其余后续按需 |

## §5 Phase 1 落地记录（本次已做）

1. 数据入库：`data/light/levels/`（39）+ `data/light/temple.json` + `data/tutorials/levels/light_01.json`。
   tileset 引用 `../../../assets/...` 相对深度与 oracle 布局逐位同构，我方现有 tileset 直接命中。
2. `levels.ts` LEVEL_DIRS 加 light 目录（tutorials 兜底序不变）。
3. 冒烟（tools/smoke.mjs）：40/40 关 loadLevel+World 建+60 步 **零失败**；unknown 谱 = §2 六类新机关
   计数逐项吻合（beamer21/lightpusher35/boxmirror21/infinitemirror12/slider12/rotmirror17）——解析器
   对未知机关"记录不阻断"语义实证。
4. det 分部基线：`--filter` 参数落地 + 比对段重复计数缺陷修复（新部 40 关曾被双计为 80 漂移）；
   `det-r0-light.json`（40 关锚，commit 内）。forest 侧 `--compare r0-baseline --filter forest` **48/48 ✓**
   ——第二部入库对第一部物理**零影响**的直接证据。
5. `level2.test.ts` 权威直方图锚收窄到 forest_*（tutorials 枚举被 light_01 破坏 49≠48，修复）。
6. CI：determinism 作业拆双（forest r0-baseline / light r0-light 各自 --filter）。

## §6 Phase 2/3 待办（承接档）

- Phase 2：6 类光机关内核移植（B bundle `init.9f90a1e8c8c137c8.js` 反解；slider=polyline+group 待解）；
  落地后重锚 r0-light（diff 只许预期行变化）。
- Phase 3：§4 接线点参数化 + light TempleAssets 补拷 + bgmKey dark + 对拍（capture-one 已参数化，
  oracle 侧 RESOLVE/NAVIGATE 的 temple id='forest' 需按 B bundle 实测适配）。
- 冒烟后待办：浏览器端 light_01 入房加载全链（本档 Phase 1 冒烟只到服务端+内核层）。

## 附：环境注记

本档证据采集期间同机另一会话在跑 ruffle-web 测试（8200，42 webkit 进程，负载 6–13）——
journey e2e 门禁因渲染帧饥饿多次超时，与本项目代码无关（DOM 仪表化诊断：按钮几何恒定/零动画/非 busy，
page.screenshot 同样挂起=合成器帧饥饿）；13:08 同客户端代码 journey 7/7 通过。已挂后台负载窗口重试环。
