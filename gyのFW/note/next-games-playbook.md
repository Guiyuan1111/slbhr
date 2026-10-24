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
| 通关门禁 | `scripts/e2e/route.mjs`（routetool/kernel.mjs 内核回跑） | repeat≥3 ALL PASS 才算关卡通关 |
| 联机场景 | `scripts/e2e/journey.mjs`（+deathretry/pause/rejoin/rolesplit/touch） | 7/7+4/4+9/9+3/3+6/6+6/6 |
| 性能 | `benchmark/perf-*.mjs` 十余件 | 容量/步进/GC/序列化等 |

### 1.5 数据格式
关卡 JSON：39×29 tile（本作唯一例外 bonus_2=39×35）、Chars/Objects 层、tileset 相对引用；
神庙注册：单 temple id + levels 数组，**特例注意**：forest_01 在 `data/tutorials/levels/`，其余在
`data/forest/levels/`——续作大概率同构（第 1 关独立目录），检索代码已按双目录兼容
（`routetool/kernel.mjs locateLevel`）。

## 2. 续作真正要新做的（工作量地图）

1. **oracle 取证**（最大前置）：本地 oracle 快照（`Fireboy-and-Watergirl/`，严格只读）只含 Forest 一部。
   每续作先由 [人工] 获取该作原版页面与资源，落同款只读快照，再照 §3.5 反解。**没有 oracle 就没有对拍锚，
   禁止凭系列常识猜实现**——系列常识（Light=光束镜面反射、Ice=低摩擦冰面等）只能作取证时的候选清单。
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

- **Phase 0 取证**：[人工] 获取该作 oracle → 只读快照落位 → bundle 反解盘点（temple id / levels 目录结构 /
  atlas 键清单 / 机关类型清单 / 数值参数表 / BGM-SFX 清单 / 通关演出帧拍）→ 产出该作《XX 号档·取证》。
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
