# 12 号档 · 动画保真度排查与修复（animcheck 槽）

日期：2026-10-18 ｜ 槽位：animcheck ｜ 方法：与 rotcheck（10 号档）同构——oracle 仲裁为唯一事实源，**状态级对拍**（本机为文字模型，禁像素截图判读，一切取证走动画名/帧号/时间戳序列）。

## 0. 结论速览

- **STEP1/STEP2（代码面）**：oracle 全部动画注册（角色 7 族 + 设备/环境 9 类）与 tween 用法提取成表；我方客户端（`BootScene.buildAnims` + `GameScene` 播放点 + tween）逐项对照，**注册面 0 实义差异**（oracle `FrameData.getFrameIndexes` 会过滤图集不存在的帧名——fire idle 0..29 注册实收 19 帧、stairs 0..30 实收 30、smoke 0..45 实收 45，与客户端直接按图集实有帧注册等价，见 §1.3 字证）。
- **STEP3（运行面对拍）**：虚拟钟 oracle（60Hz 逐帧精确）vs 真服+playwright 客户端（60fps rAF），forest_01 四段位（settle/idle/walk/coast/jump）+ forest_02 死亡段，逐帧采样 head/legs 动画名+帧号+烟雾+dying/hidden：
  - 切换序列**逐事件同构**（`idle→jumping→idle→rising→idle→falling→idle` 全链两侧一致，含空中低速带的 rising→idle→falling 三连）；
  - 切换时机 client = oracle **+2~3 帧**（恒定网络偏移：20Hz 快照 50ms + 平滑收敛，≤4 帧量化窗）；
  - 帧率：主家族双侧 **30fps**（环周期口径实测 oracle 30/30/30，client 30/29.2~31.4）；
  - 循环长度：head jumping 11f / idle fire 19f / idle water 30f / legs running 8f / rising·falling 5f 双侧一致（原始帧序逐帧同构，§3.2）；
  - 死亡烟雾：双侧 #0..44 单次播放、时长 ~88 采样=45f@30fps、起播 ±2f 一致。
- **唯一实质差异（已修）**：**dying 期间 oracle 全身即时隐藏**（init L63173-63175：dying 分支每帧 `bodySprite/legs/head.visible=false`，烟雾独行），我方客户端此前 dying 期间身体可见直到 `isDead`。修复=1 行（`GameScene` visible 判据加 `ps.dying !== true`），纯表现层零物理/det 影响。
- **A/B**：death 段 watergirl `hidden 104/195 → 195/195`、`dyingHidden 104 → 195`（oracle 同口径 187/188，差 1 样本为切换帧归属）；walk/jump/idle 全部序列不变。
- **验证**：tsc 0 错 / vitest 85/85 / vite build 过；e2e `forest_01`、`forest_12` repeat3 `--offset -15` **双 ALL PASS**（forest_12 winAt 13.068s，与历史 13.475s 同带；首轮一次 run1 失败为输入注入层既有抖动——fb 卡出生点未动、未死亡，与本修复无关层，复跑即过）。
- **大件挂账（不实现，§5）**：液体冻结/冰面演出族（frost/vapor/ice_legs/onice——森林无用例，level2.ts:540 字证 beamer 未用）、portal 渲染族（森林无用例）、结算楼梯已实现不再列。

## 1. STEP1 · oracle 动画地板真值（引文表）

以下行号均指 `note/reverse/oracle-a/init.beautified.js`（严格只读）。character 模块范围 L62846-L63459（MODULES.md）。

### 1.1 角色动画注册（States/Level/character）

| 精灵 | 动画名 | 帧 | 帧率 | loop | 引文 |
|---|---|---|---|---|---|
| legs | `running` | `{fb\|wg}_legs_running` 0-7 | 30 | yes | L62967 |
| legs（仅 wg） | `onice` | 同 running 帧 | **10** | yes | L62969 |
| legs | 静帧 | `{o}_legs_idle0000` | — | — | L62971（默认帧）、L63438（非 jumping 态停帧回置） |
| head | `idle` | `{o}_head_idle` 0-29 | 30 | yes | L62974 |
| head | `falling` | `{o}_head_falling` 0-4 | 30 | yes | L62975 |
| head | `jumping` | `{o}_head_jumping` 0-10 | 30 | yes | L62976 |
| head | `rising` | `{o}_head_rising` 0-4 | 30 | yes | L62977 |
| ice 贴层 | `loop` | `{o}_ice_legs` 0-4（图集实有 3 帧） | 10 | yes | L62983 |
| smoke | `play` | `death_smoke` 0-45 | 30 | **no**（killOnComplete） | L63044/L63070 |
| stairs | `up` | `{o}_stairs` 0-30 | **25** | no | L63095，组 scale tween→0.8/360ms Linear L63097-63100 |

### 1.2 角色状态机（update，每帧判据）

引文 L63350-63401（`b` = head 动画名、`t` = head scale.x 朝向）：

- 有地面接触（`n != null`）：左键→`jumping`/t=-1（头倾角=法线角-π/2 钳 [-0.1π, +0.25π]，L63356-63359）；右键→`jumping`/t=+1（钳 [-0.25π, +0.1π]，L63361-63364）；无键→`idle`/a=0（L63366）。
- 空中：`vx>4`→`jumping`/t=-1；`vx<-4`→`jumping`/t=+1 且角+π；`vy>3`→`rising`；`vy<-3`→`falling`；带键低速→`jumping`；全无→`idle`（L63371-63396）。
- **空中低速带（|vy|≤3 且 |vx|≤4）= `idle`**：起跳弧呈现 rising→idle→falling 三连（§3.2 实测两侧同构，这是我方内核 updateAnim 的 1:1 字证）。
- 腿部规则（L63407-63438）：`b==="jumping"` → wg&&onIce 播 `onice`@10fps（L63430），否则播 `running`@30fps（L63432）；非 jumping 态 → 停帧回置 `_legs_idle0000`（L63438）。**注意无独立"run"头态**：头部在地面移动时也是 `jumping`。
- **dying 即藏身**（L63172-63179）：`if (this.dying) { this.bodySprite.visible=false; legs.visible=false; head.visible=false; ... return; }`——每帧执行，烟雾子精灵独行（L63069-63082：死亡即播 45f 烟雾，onComplete → `sprite.visible=false` + `isDead=true` + signal）。
- 层序：`rising` 时 legs 提到 head 之上（renderOrderID 交换，L63403-63410）。

### 1.3 Phaser 2 动画引擎语义（对拍口径的三个字证）

| 语义 | 引文 | 对拍含义 |
|---|---|---|
| `AnimationManager.play` 守卫：同名动画已播放 → **不重启**（`if (this.currentAnim === this._anims[a]) { if (isPlaying===false) {...play} else return currentAnim }`） | L26358-26365 | update 每帧 `play(b)` 幂等；换名才从 0 重播 |
| `Animation.update`：`time≥_timeNextFrame` 才推进；低帧率**多帧追赶**（`_frameSkip=floor(diff/delay)`）；loop=取模回卷 | L26605 | 帧率=delay=1000/rate，游戏钟域 |
| `FrameData.getFrameIndexes`：**只收图集存在的帧名**（`else if (this.getFrameByName(a[d]))`） | L26892-26905 | generateFrameNames(0,29) 在 fire idle 上实收 19 帧（图集 `fire_head_idle0000..0018`），**无"冻结尾巴"**；stairs 0..30 实收 30、smoke 0..45 实收 45、ice_legs 0..4 实收 3 |

### 1.4 设备/环境动画

| 项 | oracle 行为 | 引文 |
|---|---|---|
| Lever | 杆=物理 revolute ±0.2π（本体无帧动画）；灯贴图 off/on 两静帧换帧 | L56826-56839 |
| Door | 注册 `open` 0-21@10fps no-loop（L56452）**但不走 Animation**：update 手动步进 `currentFrac += min(0.04, elapsed)·25` → 25 帧/s（≈0.88s 全程），`animations.frame=round(currentFrac)` | L56495-56520（`b=Math.min(0.04,...)` L56503、`currentFrac+=c` L56507） |
| Diamond | 浮动 tween：y -5→+5、2000ms、Sinusoidal.InOut、yoyo+loop、随机延迟 0-2s | L56385-56390 |
| Liquid 表面 | `{WaterBox\|FireBox\|GreenBox}[Left\|Right]` 0-14@30fps loop，三段同相位 | L57223/L57234/L57243 |
| Liquid 冻结 | frost/vapor 0-10@30fps loop + 三条 Linear mask tween（冻结机制属 Beamer 族） | L57432-57433/L57550-57551 |
| Portal | center 0-39@30 loop；glow 0-29@30 loop ×2（alpha 0 待激活） | L57902-57919 |
| Wind | base 0-4@30 loop；effect 0-30@30 loop + **随机起始帧** `next(floor(random·30))`，激活才 visible | L59508-59513、L59514 |
| 提示区 | alpha 0↔1 tween 400ms Linear（进出触发） | L66023-66032 |
| 结算星 | `to_1/to_2/to_3`（FinishStone 1-7/8-14/15-21）@30fps once | L64915-64917 |
| Rope/Hanging | 无帧动画，绳角=物理 `atan2` 逐帧 | Hanging.js L105 |

## 2. STEP2 · 我方客户端动画清单与逐项对照

注册全部在 `packages/client/src/scenes/BootScene.ts` `buildAnims()`（L59-102），播放点在 `GameScene.ts`。

| 项 | 客户端 | oracle | 判定 |
|---|---|---|---|
| head idle | fire 0-18 / water 0-29 @30 loop（BootScene L70） | 同（图集过滤后） | ✅ 一致 |
| head jump/fall/rising | 0-10 / 0-4 / 0-4 @30 loop（L73/76/78） | L62976/75/77 | ✅ |
| legs run | 0-7@30 loop（L72） | L62967 | ✅ |
| legs idle | 0-0@1fps loop（L71） | 静帧 L63438 | ✅ 视觉等价（lP=true 仅采样口径差） |
| smoke | 0-44@30 once（L82） | 45 有效帧 once | ✅ |
| stairs | 0-29@25 once + tween scale 0.76/360ms（GameScene L1325-1326，0.95×0.8） | 30 有效帧 + 0.8/360ms | ✅ |
| 状态机 | 服务端内核 `character.ts updateAnim`（L266-322）= oracle L63350-63396 逐字移植 | — | ✅（rotcheck/06 号档 det 面已闭环） |
| 切换不重启 | `view.anim !== anim` 才 `play()`（GameScene L1409） | AnimationManager 守卫 | ✅ 同语义 |
| 层序 | rising depth 5.1 / 其余 4.9（L1406-1408） | renderOrderID 交换 | ✅ |
| dying 藏身 | **此前仅 isDead 后隐藏（L1376）** | dying 即藏 L63173-63175 | ❌ → **本轮修复** |
| 腿部规则 | `anim==="jumping" ? legs_run : legs_idle`（L1432-1436） | L63432/63438 | ✅ |
| 门 | 快照 `doorFrame` @25fps setFrame（E10 先例） | 25 帧/s 手动步进 | ✅ |
| 钻石浮动 | y ±5 / 2000ms / Sine.inOut / yoyo+loop / rand delay（GameScene L466-473） | L56385-56390 | ✅ |
| 液体表面 | 3 段 0-14@30 同相位（L743-749） | L57223-57247 | ✅ |
| 风 | base/effect 0-3/0-29@30 + `setProgress(random)`（L681-682、L1598-1599） | 图集实有同帧数 + rand 起始 | ✅ |
| 提示区/结算星 | 400ms / 30fps once（L1103-1108、overlays L165-174） | 同 | ✅ |
| ice 贴层/onice 腿 | **未注册** | L62969/L62983 | ⚠️ 不适用→大件（§5.1） |
| portal | **未渲染** | L57902-57919 | ⚠️ 不适用（森林无用例，§5.2） |
| frost/vapor | **未注册** | L57432/57550 | ⚠️ 不适用→大件（§5.1） |

## 3. STEP3 · 状态级对拍（oracle 虚拟钟 vs 真服 playwright）

工具：`scripts/e2e/oracle/animprobe.mjs`（本槽新建；只读 import oracle/lib.mjs 与 e2e/lib.mjs）。oracle 侧包 `StateManager.update` 尾采样 Phaser 2 精灵动画态；客户端侧 `Game.events.on("postupdate")` 采样 `PlayerView` + 权威 `ps.anim`。帧身份统一用 atlas frameName（数字尾号=帧号、去尾号=家族名）。

段位（同输入脚本，帧 ↔ ms×1000/60）：forest_01 `settle[0,30)→idle[30,210)→walk[210,270)→coast[270,300)→jump[300,390)`（fb 动 / wg 静置=idle 参照；**段位设计避开 forest_01 右墙根液体池**——首版贴墙跳因客户端输入相位 ±2 帧抖动 fb 落池身亡、oracle 贴边生还，属输入层噪声非行为分歧，改慢走+原地跳后两侧行程完全对齐）；forest_02 `settle→death`（wg 按住 D 进 row28 岩浆，journey deathretry 同路）。

### 3.1 切换序列与时机

| 段/角色 | oracle | client | 时机差 |
|---|---|---|---|
| walk/fb | idle@207 → jumping@211 → idle@271 | idle@207 → jumping@214 → idle@274 | +3f |
| coast/fb | jumping@267 → idle@271 | jumping@268 → idle@274 | +3f |
| jump/fb | idle@297 → rising@303 → **idle@307** → falling@313 → idle@324 | idle@298 → rising@305 → **idle@309** → falling@315 → idle@326 | +2f 恒定 |

空中低速带三连（rising→idle→falling）两侧同构——`updateAnim` 内核移植的直接运行面证据。+2~3f 恒定偏移 = 20Hz 快照（50ms）+平滑的传输量化，≤4f 量化窗。

### 3.2 帧率与循环（原始帧序摘录）

oracle walk/fb head jumping（f211-270，60 样本）：
`0,1,1,2,2,3,3,4,4,5,5,6,6,7,7,8,8,9,9,10,10,0,0,1,1,...` —— 30fps@60Hz、11 帧环。
client walk/fb head jumping（同窗）：
`0,0,1,1,2,2,...,10,10,0,0,...` —— 同上（首个 15 为切换瞬间的 idle 尾帧）。
legs running 两侧均 8 帧环 30fps；idle fire 19 帧环、water 30 帧环双侧一致（环周期口径 fps：oracle 30/30/30/30，client 30/30/29.2~31.4，短 run 无完整环处为 null——非差异）。

### 3.3 死亡段（forest_02 watergirl）

| 指标 | oracle | client（修复前） | 判定 |
|---|---|---|---|
| 烟雾帧域 | `#0..44 play[35..123]` | `#0..44 play[36..126]` | ✅ 45f@30fps 单次（~88 采样≈1.47s），起播 +2f |
| dying 样本 | 188 | 195 | ✅（窗内） |
| dead 样本 | 99 | 104 | ✅ |
| **dying 期间 hidden** | **187/188** | **104/195** | ❌ 唯一实质差异 |
| lose mark | f151 | —（gameover 相位） | ✅ 对齐（isDead=烟完 → gameOver） |

## 4. STEP4 · 修复与 A/B

### 4.1 修复（1 行，纯表现层）

`packages/client/src/scenes/GameScene.ts` L1376：

```diff
-      const visible = ps.isDead !== true;
+      // dying 即藏身（animcheck 12 号档对拍：原版 update 首行 dying 分支每帧
+      // bodySprite/legs/head 全 invisible，烟雾独行；此前 dying 期间身体可见直到 isDead，
+      // 与原版「触液即化烟、本体消失」观感不符——playwright A/B：dyingHidden 104/195 → 全覆盖）
+      const visible = ps.isDead !== true && ps.dying !== true;
```

零物理/det 影响：只改渲染可见性判据，不动内核、快照消费、平滑参数。

### 4.2 A/B（forest_02 death/watergirl，同输入脚本）

| 指标 | 修复前 | 修复后 | oracle |
|---|---|---|---|
| hidden（dying 全程） | 104/195 | **195/195** | 187/188 |
| dyingHidden | 104 | **195** | 187 |
| 烟雾帧域 | #0..44 play[36..126] | #0..44 play[37..128]（±1 采样抖动） | #0..44 play[35..123] |
| walk/jump/idle 序列与 fps | — | 与修复前逐位一致 | 同构 |

证据收容：`note/evidence/animcheck/`（oracle-forest_01/02、client-before/after、report-before/after，git add -f 过 ignore）。

### 4.3 验证

- `tsc --noEmit` 0 错；`vitest run` 85/85；`vite build` 过。
- e2e `route.mjs --level forest_01 --repeat 3 --offset -15`：**ALL PASS**。
- e2e `route.mjs --level forest_12 --repeat 3 --offset -15`：**ALL PASS**（winAt 13.068s ≈ 历史 13.475-13.478s 带）。首轮一次 run1 FAIL 为输入注入层既有抖动（fb 卡出生点、`died=-` 无死亡、终态=spawn 点坐标），与本修复无关层，复跑 3/3 过。

## 5. 大件清单（不实现，挂账）

| # | 件 | 内容 | 工作量档 | 优先级建议 |
|---|---|---|---|---|
| 1 | **液体冻结/冰面演出族** | 前置=Beamer→Liquid 冻结机制（我方内核无 frozen/beamer，level2.ts L540 字证「森林未用」）；表现面=frost/vapor 0-10@30fps 环 + 三条 Linear mask tween + 角色 `ice_legs` 3 帧贴层@10fps + wg `onice` 腿 10fps（oracle L57379-57561/L62969/L62983）。机制+表现一体，非纯表现层 | 大（机制 S + 表现 M，涉内核/det 面） | 低（森林 48 关无用例；大庙开荒时随机制一并做） |
| 2 | **Portal 渲染族** | center 0-39@30 + glow 0-29@30×2 + 灯换帧（L57902-57919）；森林/教学关数据 0 用例（`grep portal data/`=空），我方亦无传送机制 | 中（纯表现 S + 机制 M） | 低（同上，随用例出现再做） |
| 3 | 结算楼梯细部 | 已实现（stairs 25fps once + scale tween 0.76/360ms + 结算星 30fps），仅剩 smoke/stairs 的 killOnComplete 级微差（<1 帧级，无观感差） | — | 不需要 |

## 6. 复跑指南

```bash
# oracle 侧（虚拟钟，产物 TEMP/animcheck/）
node scripts/e2e/oracle/animprobe.mjs --oracle --out TEMP/animcheck
# 客户端侧（真服自起 :3596，产物 TEMP/animcheck/，需先 vite build）
node scripts/e2e/oracle/animprobe.mjs --client --port 3596 --out TEMP/animcheck
# 报告（三口径：切换序列/环周期 fps/死亡行为）
node scripts/e2e/oracle/animprobe.mjs --report --out TEMP/animcheck
# 收尾
rm -rf TEMP/animcheck TEMP/animcheck-after
```

已知口径注记：客户端采样含 2×PAD 渲染偏移（cx=ps.x+2·PAD），位置比对需扣除；head/legs 动画身份比对用 frameName 家族（两侧同源 atlas 名），不用动画 key（两侧命名域不同：`fire_idle` vs `idle`）。

## 7. 提交链

- `feat(e2e)`: animprobe 探针（scripts/e2e/oracle/animprobe.mjs）
- `fix(client)`: dying 即藏身（GameScene.ts 1 行）
- `docs(note)`: 12 号档 + 证据收容 + handoff 条目
