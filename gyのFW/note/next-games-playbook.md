# 森林冰火人系列·经验总结与续作开发手册

> **制定**：2026-10-24（森林神庙收官于 0.3.44 静态相机）。**目的**：把本作从立项到收官的可迁移经验固化，
> 供系列后续各部（Light / Ice / Crystal 等）直接开工，不重交学费。
> **事实基准**：现状以 [README](../README.md) 版本段与 [handoff.md](handoff.md) 前置条目为准；挂账以
> [research/2026-10-behavior-parity/00-INDEX §3](research/2026-10-behavior-parity/00-INDEX.md) 为准；本文只写**可迁移的结论**，不重复细节。

---

## 1. 直接可复用的底盘（续作近零改动）

### 1.1 工程结构
monorepo `gyのFW/`：`packages/shared`（Box2D 确定性内核：`level2.ts` 解析 + `kernel/world.ts` 权威物理）+
`packages/server`（Colyseus，60Hz patch + 客户端 dead reckoning；`ForestRoom.ts`）+ `packages/client`
（Phaser 3.90 + Vite；`GameScene.ts` ~1900 行为主战场）。**双人对战/房间/席位/retry/advance 换关/重连回座**
全部与"哪一神庙"无关，续作原样继承。

### 1.2 与关卡内容解耦的客户端能力
连接大厅（石板大厅换肤）、选关树（templeTreeBake 滤镜链烘焙）、GameScene 骨架（教学渐显/Navies 装饰/
结算演出/时钟/暂停静帧）、HUD 与反缩放、音频管理（SHUTDOWN 统一停音/speed 关换曲）、静态相机（0.3.44
起固定全图）。续作换的是**资产与关卡数据**，不是这些骨架。

### 1.3 机关内核全谱（`shared/src/kernel/mechanisms.ts`）
Lever（拉杆）/ Pusher（推杆）/ MovingPlatform / box·boxheavy（箱，轻重两构）/ ball / Hanging（摆板·锁链吊板）/
Pulley（滑轮）/ Roman / Wind（风机关）/ Window——外加 world 层的液体/门/钻石。后续各部新机关（光束/镜面/
冰面摩擦等）在此**注册制扩展**，每类机关自带单测。

### 1.4 工具链全家桶（续作验收直接搬）
| 量具 | 入口 | 用途 |
|---|---|---|
| 物理位级比对 | `node --import tsx benchmark/perf-determinism.mjs --compare <基线>` | det 48/48 门禁，改内核必跑 |
| 视觉差分 | `benchmark/visual-diff.mjs`；任意关批量用档卷收容件 `capture-one.mjs`（已参数化） | 双端像素比对（页内 480×360 灰度+平移搜索） |
| 动画保真 | `benchmark/fidelity-anim.mjs` / `fidelity-score.mjs` | 帧级动画比对 |
| 通关门禁 | `scripts/e2e/route-node.mjs`（0.3.49 起：纯 node 真服回放主力，colyseus.js 双端 + 真服 stdout 锚点）；`scripts/e2e/route.mjs`（内核回跑）作内核侧交叉验证 | 真服 repeat≥3 ALL PASS 才算关卡通关 |
| 联机场景 | `scripts/e2e/journey.mjs`（+deathretry/pause/rejoin/rolesplit/touch） | 7/7+4/4+9/9+3/3+6/6+6/6 |
| 性能 | `benchmark/perf-*.mjs` 十余件 | 容量/步进/GC/序列化等 |

### 1.5 数据格式
关卡 JSON：39×29 tile（本作唯一例外 bonus_2=39×35）、Chars/Objects 层、tileset 相对引用；
神庙注册：单 temple id + levels 数组，**特例注意**：forest_01 在 `data/tutorials/levels/`，其余在
`data/forest/levels/`——续作大概率同构（第 1 关独立目录），检索代码已按双目录兼容
（`routetool/kernel.mjs locateLevel`）。

## 2. 续作真正要新做的（工作量地图）

### 2.0 六部原版快照全部在本地（2026-10-24 勘误：手册初版误记"只含 Forest"）

oracle 根目录（`Fireboy-and-Watergirl/`，严格只读）`output/<A..F>` 即系列六部，关卡 JSON 与各部
`temple.json` 对账一致：

| 快照 | 作品 | 关卡数 | 引擎入口 |
|---|---|---|---|
| output/A | **forest 森林神庙（本作，已复刻）** | 48 | `gameIndex.html` + `js/init.<hash>.js` |
| output/B | light 灯光神庙 | 41 | 同 A 构型 |
| output/C | ice 冰雪神庙 | 53 | 同 A 构型 |
| output/D | crystal 水晶神庙 | 39 | 同 A 构型 |
| output/E | elements 元素合集 | 39 | 同 A 构型；`data/elements/<元素>/` 七元素小关集（crystal6/fire5/forest6/ice6/light5/water6/wind5） |
| output/F | fairytales 童话 | 32 | **异构**：`index.htm` + `fairy-tales.min.js` 单文件引擎，A–E 的反解钩子未必适用，取证时先验 |

注意两点：①各部 tutorials 目录含首关（B：forest_01+light_01；C：forest_01+ice_02+light_01——ice 部第 2 关
也在 tutorials，检索逻辑照 `locateLevel` 双目录兼容处理）；②**没有 oracle 对拍锚的机关/演出禁止凭系列常识
实现**（Light=光束镜面、Ice=低摩擦等只作取证候选清单）。

### 2.1 工作量清单
1. **oracle 取证**（最大前置，已就位）：对应 `output/<X>` 只读快照直接反解（A–E 同构可复用全套钩子；
   F 异构先验），产出该作《XX 号档·取证》。
2. **资产**：atlas/纹理/BGM/SFX（`scripts/sync-assets.mjs` 管线已备）、大厅与选关树换肤。
3. **关卡内容**：全量关卡 JSON 搬运进 `data/<game>/levels/`；per-level `time`/`type`（general/speed/puzzle）核对。
4. **新机关类型**：字节语义移植（bundle 反解 → 探针变体实测 → 落地），内核 + 客户端 View 两侧。
5. **门区/结算差异**：若该作通关演出不同（stairs 序列等），按 oracle 帧拍移植。

## 3. 方法论八条（本作用血泪验证，按重要性排序）

1. **量具先行，修复在后**：任何"感觉不对"先造可重复测量，再动手。量具自己会生病——39 号档实锤：
   Playwright 元素截图=页面合成结果，HUD 覆盖层入镜净扣 3.35–4.1 分，制造了整段"漂移期"伪带。
   修量具前后数据不可直列，换口径必须建档声明。
2. **程序化验证为准，目测仅供参考**：本作目测三连误判（条带图读出 ±26px 视差、暗色♂符号读成位移、
   "色调偏暗"错觉）全部被像素采样/RGB 统计推翻。官方美术截图严禁上传外部识图服务——验证一律
   **页内 canvas 采样 / 显示树抽坐标**。
3. **单点采样会撒谎**：bonus_2 加载初态 79.3 分"缺陷"，稳态采样（oracle 600 物理帧/我方 10s）实为 94.54
   全关第 5——运动关（boxheavy 等）两端物理微差经混沌演化放大，单点撞上动力学差。先分清
   **渲染差 vs 动力学差**（残差图定位差异体：静态元素对齐而运动体白块=动力学），运动关对拍用稳态窗口。
4. **决定性实验**：一次只动一个变量（稳态实验/双次独立采样互比/帧 2 采样）。bonus_2 相机恒定性就是
   两轮互比 (0,0)/99.67% 一锤定音。
5. **oracle bundle 反解是最高仲裁**：offset 级引用（如 CameraManager @1881500）+ 探针变体实测后才落码；
   "字节语义移植"优于任何猜测。反解注意 API 代差：原版 Phaser 2 用 root.scale 缩世界容器，
   Phaser 3 camera.zoom 连 HUD 一起缩——需 applyCam 逐帧反缩放补偿。
6. **基线与分叉纪律**：det r0-baseline 位级锚是物理确知性的锚。改内核走：探针变体实测 → 落地 →
   重锚，且重锚 diff **只许预期行变化**（P-03 实操：48 行只变 2 行才通过）。
7. **门禁全绿才算完成**：typecheck / vitest / build / journey 族 / det 基线 / 视觉带 / ID 契约 / audit。
   子 agent 与工具的"自述成功"不算数，必须亲自验证产物或复跑测试。
8. **档卷文化**：`note/evidence/<日期-主题>/` + 编号档（01号档…）+ `tools/` 收容公用件 + handoff 前插条目。
   跨会话协作的生命线是可追溯性；handoff 条目格式见其头部（新条目置顶、**条目本体不带 `## 条目` 表头**）。

## 4. 踩坑清单（每条都是真实返工，按域分组）

**发版**
- 版本**五处**统一：根 package.json / 三子包 / **package-lock.json** / README 版本段。L-06 一致性测试
  把守（查根+三子包+lock）；漏 lock → CI 红（run 40065895641）。发版批必须重跑 vitest（本地门禁
  是在 bump 前跑的，测不出 bump 自身的问题）。

**量具与采集**
- 物理帧数不可控：我方截图用 "WAIT ms" 会撞进握手期物理/关转场动画——oracle 侧用 INSTALL_HOOK 物理
  帧计数（FRAME_TARGET），我方侧认 `hud-status` 空 + 固定等待，运动关另做稳态口径。
- 跳关前等 `g.load.isLoading === false` + 静置：menu 的 loader 残留回调会在中途跳关时引爆（a.game null）。
- route 拦截白名单只放行静态服端口 + 禁 mp3，防止外联与音频卡采集。
- 特征点位移场会被周期纹理污染（mad≈0 伪匹配遍布）——弃相关法，用残差图+决定性实验。
- RESOLVE 模板替换用裸替换，勿把 JSON.stringify 的引号带进单引号字面量（永 null 陷阱）。

**Node / 工具**
- ESM 里 `URL.pathname` 百分号编码中文路径 → 必须 `fileURLToPath`。
- TEMP 目录先 `mkdir -p` 再写文件；**收容清单必须含全部公用件**（serve8787 漏收容→二跑 MODULE_NOT_FOUND）。
- nohup 后台链同行的 `&` 作用域坑 → 用子 shell `(nohup ... &)` 逐个起；起完 lsof 复核端口。
- 脚本异常退出会跳过 finally → 孤儿 2567 服务器毒化后续运行，catch 里先 kill 再 exit。
- jq 合并多层结构：`jq -s 'map(...) + $f' --slurpfile` 一次成型，别管道里二次索引。
- diff.json 之类嵌套产物先看结构再取字段（`.diff.bestOffset` vs `.bestOffset` 首查全 null）。

**文档操作**
- anchor 断言前先看实际字节（handoff 表头后**无空行**，是 `## 条目\n`）；插入条目**勿自带表头**（重复
  表头返工一次）；python 批量改文件前 count 断言。

**渲染 / 引擎**
- Phaser `setBounds` 陷阱：视口(1280×960)大于关卡矩形(1248×928)时钳制钉死 (32,32)，所有 centerOn 失效
  → 自行钳制（现静态相机已绕开，恢复动态相机时切记）。
- 关卡矩形 [PAD, PAD+W] 恰好填满 1280×960（PAD=32 内建于关卡坐标）；超高关（>960 高）是视口特例，
  静态相机用 min(1, rw/W, rh/H) 整图适配。
- 世界坐标=关卡坐标+PAD（教学文本曾漏加 → 32px 错位实锤）。
- 我方 Game 是常驻场景：won 后须显式停判教学（freezeTutorial，原版靠 endGame 切态天然停跑）；快照
  `ps.x/ps.y` 已是关卡坐标，别二次加 PAD。

**音频 / 生命周期**
- 场景 SHUTDOWN 统一停音（Phaser 3 全局 sound manager，scene.stop 不停音）；speed 关 BGM 键换曲、
  终局曲有 _speed 变体；fx 开关=总静音（oracle 同式）。

## 5. 续作标准开发流程（SOP）

- **Phase 0 取证**：选定该作本地快照（`Fireboy-and-Watergirl/output/<X>`，六部全在，见 §2.0）→ bundle 反解盘点
  （temple id / levels 目录结构 / atlas 键清单 / 机关类型清单 / 数值参数表 / BGM-SFX 清单 / 通关演出帧拍；
  F 部异构先验探针）→ 产出该作《XX 号档·取证》。
- **Phase 1 内容**：关卡 JSON 全量入 `data/<game>/levels/`（核对第 1 关目录特例与 tileset 引用）；
  atlas/音频走 sync-assets；先把**加载初态渲染**对拍绿（capture-one 批量），不急着可玩。
- **Phase 2 内核**：新机关类型注册（mechanisms.ts + 单测）；数据层字节核对（Objects 层与本作差异表）；
  锚该作 det 基线；route 产线走通至少第 1 关。
- **Phase 3 客户端**：temple id/BGM 键/decor 与 Navies 公式参数化核对；大厅与选关树换肤；
  新机关 View 移植；对拍动画（fidelity-anim）。
- **Phase 4 验收**：census → det → route 全关 repeat≥3 → visual-diff 批量（运动关记稳态口径）→
  journey 族 → 性能冒烟（对照本作基准带，防明显回退）。
- **Phase 5 发版**：版本五处 + `note/release/<版本>.md` + handoff 条目 + push 盯 CI（CI 红先查日志再动）。
- 每 Phase 末：细粒度 commit + 档卷落证。**任何一个"偏离原版"的决定，先问用户再实施。**

## 6. 不变纪律（红线）

oracle 严格只读；官方素材仅私用、禁分发、截图禁上传外部服务；本机账号/密码不入任何版本库；
commit 禁 co-author、禁 `git add -A`；服务器默认只绑 127.0.0.1；项目仅两人私用不上线不公开；
TEMP 用后必清；保真是默认、优化是例外且逐条经用户裁定；禁止编造，产物必须亲自验证。

## 7. 维护

续作立项时在本文件追加该作 §8"取证要点"；与 [00-INDEX.md](00-INDEX.md) 互链登记。

---

## §8 灯光神庙（light，第二部）取证要点（2026-10-25 立项，进行中）

- 快照：`output/B`，40 自有关（light_01…light_40，无 bonus）+共享 forest_01 教学关；全 39×29 无超高关。
- 关卡类型四种：general/puzzle/speed/**dark**（5 关，配 LevelMusic_dark.mp3）——bgmKey 需加 dark 映射；每关自带 time/mobileTime。
- 新机关 6 类全光机制：beamer(21)/lightpusher(35)/boxmirror(21)/rotmirror(17)/infinitemirror(12)/slider(12，非gid polyline+group)。
  A/B 的 Objects.json 字节一致（类型名在共享图块集），level2 default 分支已预留注释。
- 资产：全系列共享基础资产+音频（A/B 音频树一致 33 文件），每部仅差 TempleAssets 图集+GameName+TempleHall 三件。
- det 基线分部制：r0-baseline(forest 48) / r0-light(40) 分文件，`--filter <前缀>` 闭合比对（详见档卷 01号档 §5）。
- 档卷：[evidence/2026-10-25-light-temple/00-INDEX.md](evidence/2026-10-25-light-temple/00-INDEX.md)。

---

## §9 水晶神庙（crystal，第四部）取证要点（2026-10-30 立项，进行中）

- 快照：`output/D`，35 自有关（crystal_04…crystal_38）+4 共享教学关；39×29；temple 39 节点 general 25/puzzle 9/speed 5，**无 dark**。
- **portal 五问速览**（唯一新机制，D 独有使用）：①配对=`portalId`（每 id 恰 2 个，缺省 portalId=0 归并，connectPortals 无守卫）；②group=电路（同组 lever/pusher 开关 portal，`initialState:1`=初始开）；③触发=eventHorizon 实体薄片（0.1×1.5m）+载体 r=0.1 `portal-sensor` 标记（cat/mask 4096：角色/箱/球可传，液体/钻石不传）。
- ④传送=出口偏移保留（inverted 相异才镜像）+Δ 旋转+速度地板 `normalize(v)×(10/mass)`（角色 10.4734 m/s，10 除的是**质量**）+200ms 墙钟冷却+内嵌一步 `physics.update()`；⑤光束穿门是一等语义（getPoint/getOutput），**光与实体在同 inverted 对的出口变换原版就不一致——两套公式照抄勿统一**（存疑待实机对拍）。
- **same-inverted 对出口速度镜像回射=原版固有乒乓**（实测 7486 次/4 分钟），须复刻勿"修"。
- Ground `-1` = **portal 背衬墙**（D 独有新增：无地面碰撞，solidity 由所属 portal 假墙按开关供给；D 198 块）；11/12/55/10 均为 C 已有语义——普查勘误：D 新增只有 -1。
- 资产差：D 与 C 文件级差仅 5 组（TempleAssets/GameName/TempleHall 三件套+data+bundle）；**portal 零新资产**——74 帧全在共享 MechAssets，四音效四部同库。
- 数据坑：crystal_20 无 LargeObjects 引用（tilesets 不恒 4 项）；92 对构成 mixed 32/same0 50/same1 10（逐关验收清单见档卷 §5.4）。
- 档卷：[evidence/2026-10-30-crystal-temple/00-INDEX.md](evidence/2026-10-30-crystal-temple/00-INDEX.md)。

## §10 元素合集（elements，第五部）取证要点（2026-10-30 立项，进行中）

- 快照：`output/E`，系列唯一 `type:"multi"`：39 关=7 教学+32 自有（forest5/fire4/light4/crystal5/water5/wind4/ice5）；`id` 不连续、顺序语义只看 `required`；**无 initial/opened 字段**（required=0 即首关）；无 dark/speed 关。
- multi 选关：七庙 temple.json 全 `type:"rows"`，横向条带按 `index` 排开（ice −3…crystal 3，forest 居中）；解锁链=元素学习门（教学关 elements `slice(0,-1)` 去尾、庙 softLocked=首关前置未学齐）。
- **cover=纯视觉遮罩**（47 处）：BackgroundCover extends Phaser.Group 非 Device——32×32 纯黑帧拉伸铺 background 层+ocupy 抑制 decor 撒布；无碰撞/不挡光/无每帧行为，level2 解析忽略即可，客户端可选补黑矩形。
- **入库命名空间化决策**（2935bb7）：六元素 `1.json` 同名撞车 → 关卡文件 `e<元素>_<原名>` + temple.json filename 同步改写（关卡 JSON 本体保持 oracle 字节）；E 独有教学 `e_tutorial_{fire,water,wind}`。
- **firstgid 漂移勘误（重要）**：LargeObjects firstgid 逐关漂移（40/24/16/1/不引用五态），portal/wind gid 随之变——严禁硬编码 gid，按逐关 firstgid 区间解析（"portal(42)"实为首 gid 40 关的 wind 位误锚）。
- 教学关共用：forest_01/crystal_03/ice_02/light_01 与前部内容全同（仅 Tiled 元数据代差），只补 3 件 e_tutorial。
- 资产：audio 33 文件与 A 字节一致、无 per-element 曲目；七套 TempleAssets 换皮结构零差异；Ground 10/11/12/55/−1 对 E 零新增工作（level2.ts 已全支持）。
- 档卷：[evidence/2026-10-30-elements/00-INDEX.md](evidence/2026-10-30-elements/00-INDEX.md)。

## §11 童话神庙（fairytales，第六部）取证要点（2026-10-30 立项，进行中）

- 快照：`output/F`，32 关=forest_01 共享教学+fairies_000 树图 hub+自有 30（tree 四枝 wing 1..4）；六部唯一 `canRevive:true`。
- **引擎同源判定**：F 与 A–E 同一代码库（`define("States/…")` 模块树同构、createGroundShape/parseMapPropper 指纹同数、classNames 仅多 `fairycup`）——"单文件引擎不可反解"先验不成立；异构只是包 vintage：Phaser 2.6.15（A–E 2.6.2）+Tiled 1.x 新格式。
- **fairy 三件套**：①Fairy 角色（零重力 r=0.3+anchor/elbow 距离关节提线+mouse joint 拖拽+`group` 首位数字取色）；②FairyCup 杯机关（r=1.3 杯口 sensor 色配→state 0→1 派发，音效复用 lightPusher）；③`lockToDeviceGroup/reLockToDeviceGroup` 锁链（25+3 只，运行时仅影响相机 focus 与教学提示——存疑留观）。
- RespawnManager：双足着地静止每 ≥667ms 自动检查点、环形 5 份、复活取 4 秒前最近份+计时回拨；canRevive 复活链依赖 h5ads 无法无头实测，复刻按免费一次。
- **Tiled 1.x 归一化**：对象/瓦片属性数组化 `[{name,value}]` 压平、tileset `tiles[]` 数组式、Ground 排首外链合并——归一化后即可复用 A–E 解析管线。
- **尺寸全谱**：F 关卡**不是 39×29**——30×40…61×25 全谱（竖 31×56/横 61×25），静态相机整图适配照用；firstgid 两套排布（fairies-01 一份、其余 31 关另一份），必须按各关 tilesets 归属。
- oracle 数据瑕疵如实记录（复刻照旧勿"修"）：fairies-22 ball 属性 typo `donFocus`、fairies-20 Objects 层 2 颗 diamond 被引擎丢弃、NewCharAssets 缺 `flying_glow0001` 帧、R 键调未定义 `setCheckpoint`（被 jQuery handler 吞）。
- 资产/音频：audio 33 文件与 C 字节一致零新增；新图集 NewCharAssets（仙女 7 帧）+MechAssets +25 fairycup 帧+TempleAssets/fairy 三件套。
- 档卷：[evidence/2026-10-30-fairytales/00-INDEX.md](evidence/2026-10-30-fairytales/00-INDEX.md)。
