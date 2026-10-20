# 40 号档：0.3.38 修复验收取证——oracle vs 我方并排对照（F1/F3/F2 + 15 号档 Top1/Top2/Top3 + 菜单光柱）

- 槽：修复验收取证槽（只读取证，零生产 diff）。日期：2026-10-20。
- 被验版本：我方 HEAD `9deaa2a`（0.3.38 发版链 fa27b8b→…→884457a 之后），客户端 dist=4c5cff6 构建（发版后无 client/server/shared 源变更，`git diff 4c5cff6..HEAD -- packages/*/src` 为空已核）；oracle `Fireboy-and-Watergirl/`（只读）。
- 工具（收容于本目录 `tools/level-audit/`）：`acceptance-capture.mjs`（三态采集器，38 号档 audit-runtime 同构口径扩展）+ `acceptance-report.py`（逐族判定指标+并排拼图）+ 复用 `compare.py`；证据快照与 21 张并排 PNG 收容 `tools/level-audit/acceptance/`（PNG 摘要见 §5）。
- 门禁纪律：等 `note/release/0.3.38.md` 提交（4c5cff6）且 `git status --porcelain` 干净（15:03:11 达成）方开拍；双侧各 1 浏览器、我方服 3991 / oracle 静态服 8842（拍前 ss 确认空闲，收拍确认释放）。

## 0. 结论速览（逐族判定表）

| 族 | 采样关 | 判定 | 关键数字 |
|---|---|---|---|
| F1 水体冰膜（隐藏覆盖层） | forest_09_1/10/27_1/28/25_1/12 | ✅ 对齐（附 1 项结构残差，见 §2.1） | 6 关冰膜 dy=0.0 零偏移、ev=false 双侧 100%；计数 27_1 14/14、28 23/23、25_1 5/5、12 3/3 全等；仅 09_1（24/28）与 10（21/25）差 4 格=双格水段 edge 判别规则异（§3.1） |
| F3a hanging_base | forest_25_1（7）/12（3） | ✅ | base-platform Δ=(0,0) 全部 10+3 对，双侧同构 |
| F3b wind 灯层 | forest_22（on×5）/27_1（off×3） | ✅ | light-base Δ=(0,0) 全部；tint 双侧等（22 全黄 0xFFFF00；27_1 黄+白缺省混合逐灯等） |
| F3c pulley_base 板位锚 | forest_04（2）/bonus_2（4） | ✅ | base==platform 同位：04 oracle (79.6,875.9)/(907.8,193.1) vs 我方 (80,880)/(912,194)（亚 5px 整数物理位差；修复前我方 (80,114) 轮锚实录见 e6111e5）；bonus_2 四台 Δ≤0.4px |
| F3d lever 杆灯换帧 | forest_28/25_1/09_1（on）、04/10/27_1/bonus_2/3（off） | ✅ | on 帧在位 2/2、1/1、2/2、1/1 且 off 帧同在；on/off 双帧随 state（64b099d）运行时实证 |
| F2 相机 settled scroll | 全部 10 关 | ✅ | 修复前 9/10 关带移（-16,-16 等，bonus_2 (0,+32)，引 38 号档 report48b align）→ 修复后 **10/10 关 align=(0,0)** |
| V13 平台灯组色 tint | 全部 10 关（含平台关） | ✅ | 逐关 tint 值集合双侧全等；bonus_2 单关七色 [0x00cc00,0x57beff,0x9933ff,0xEC0EF1,0xFF0000,0xFFFF00,0xFFFFFF] 精确等；bonus_3 on 态灯 tint（0xEC0EF1）同证 |
| V9/V10 风机关演出 | forest_27_1（off×3） | ✅ 结构面 / ⏸ 时序面未动态对拍 | off 灯层帧 3/3 在位+组色 tint 等；wind_effect 帧号双侧异=随机相位常驻（oracle 语义）；400ms 延迟停帧为时序行为，本槽未做翻转动态对拍，依 6884ba8 修复记录+journey 基线（§2.6 范围注记） |
| V17 暂停全画面静帧 | 全部 10 关 | ✅ | 暂停态 pa/pb 双帧差分（板外区）：我方 **0.0%** ×10、oracle **0.0%** ×10；我方全帧亦 0.0%（面板弹簧已落位），oracle 全帧 4.53-4.64%=oracle 面板自身动画（15 号档 V17 oracle 列「仅面板动」同源），世界面双侧零动 |
| 菜单光柱（MenuScene idle） | 双侧 menu 态 | ✅ 在位+活体 | 自差分（ma vs mb，700ms）：oracle 9.77%、我方 6.14%——双侧光柱动画活体；几何口径（屏心堆叠扇×8+t_offset/t_speed 帧驱动）依 fe3353c 字节真相，菜单非像素同构目标（cross struct 35.2% 系两侧菜单版面差异，不判） |

**总结论：0.3.38 六面修复（F1/F3a/F3b/F3c/F3d/F2 + V13/V9/V10/V17）在 10 关采样上 oracle-vs-我方全数对齐；残余 1 项结构差异（F1 双格水段 edge 判别，隐藏层、像素零影响）与 2 类已知仪器伪差（§3.2/3.3）如实记录。**

## 1. 方法与口径

### 1.1 采集态（双侧同语义：已进场/静止初始/相机收敛）
- **oracle**：静态服 8842 + 假钟 VT（劫持 rAF/定时器，`__vt.step` 逐帧放行）→ 泵到 menu → stubAds → `enterLevel` 门（intro 完成、物理冻结出生点）→ `__vtRelease` → root scale+camera scroll 连续 30 帧稳定 → 截 A 帧 → 步 20 帧 → 截 B 帧。38 号档 audit-runtime.mjs 原口径。
- **我方**：本仓 server 3991 + 双页 create/join（房间双人门槛）→ 权威 phase=started → 相机 spring 连续 36 帧稳定 → 400ms 截 A → 700ms 截 B。同 audit-runtime 口径。
- **三态扩展**（acceptance-capture.mjs）：
  - static：a/b 双帧 + 显示列表 dump（38 号档 schema + 新增 `ev`=祖先链可见性合成、`tint` 数值）。
  - pause：我方 KeyP（main.ts:513→togglePause→PauseMenu create 时 scene.pause("Game")）→ 面板弹簧落位 1700ms → pa → 700ms → pb + PauseMenu/Game 场景 dump + isPaused 旗标；oracle 右上暂停钮（LevelUI 基类 @1870814 区字证：挂 `game.layers.ui`、位 `realWidth/2,-realHeight/2`、anchor(1,0)、hitArea 大圆——**不在 lv.root 子树，38 号档 dl 恰未采到 PauseButton 的根因面**）经 PIXI worldTransform 屏坐标定位（实测 (1256,24)，全 10 关命中同一点）→ 真鼠标点击 → `game.paused=true` 引擎分支 → 步 45 帧（面板落位）→ pa → 42 帧 → pb。
  - menu：oracle 泵到 menu + stubAds 后 ma/mb（隔 60 帧）；我方裸页（不 join）Menu 场景起来后隐藏 DOM 联机面板（#menu/#hud/#toast display:none，39 号档 20c7287 量具口径）→ ma/mb（隔 700ms）。

### 1.2 对拍仪器
- 显示列表：`compare.py` 原器（oracle level 系=(abs−rootXY)/rootScale ↔ 我方 world−PAD；family=帧名去尾号、近邻 ≤48px 配对）。
- 像素：`compare.py` 原器（±40px 最优平移搜索+结构差分 |Δ|>8+动态掩码）。
- 暂停静帧：pa/pb 灰度 |Δ|>8 占比，全帧 + 板外区（板=PopupBackground0000 1082×642 @board(99,159)，外扩 20px → 框外=(79,139)-(1201,821) 之外）。
- 逐族指标（acceptance-report.py）：目标族计数/ev/tint 值集合双侧对照 + 前后 align 引用（prefix_ref=38 号档 report48b.json）。

### 1.3 坐标框架自勘误（防止后续槽复蹈）
分析中一度测得「液体+冰膜整族 +32px 系统偏移」——系**我方世界系含 PAD(+32,+32) 未减**的仪器框架错位（对比了未减 PAD 的我方锚点与已归一的 oracle 坐标）。修正框架（我方 world−PAD）后全数 dy=0.0。判据：地面/像素 align=(0,0) 证明整体框架对齐，任何单族"系统偏移"须先排除框架差。

### 1.4 修复前口径（派发豁免条款）
worktree 942d00d 对照经评估弃用：本仓 `node_modules/@fw/{client,server,shared}` 为指向主仓 packages 的符号链接，worktree 服务端会经 workspace 软链串到主仓修复后代码，隔离需整树重建 node_modules，成本/风险过重。**修复前证据按派发许可引用 38 号档 evidence（report48b.json，5de0524 审计时点逐关 dl+px 全量）**，本档各表 "修复前" 列均出自该快照。

## 2. 逐族判定

### 2.1 F1 水体冰膜层（隐藏覆盖层对齐）
- **复核前提**（fa27b8b 定谳）：oracle 冰膜 `iceGraphics.visible=false` 建时即隐，森林恒不可见——38 号档 F1「像素抬升」系其对拍器未合成祖先组可见性的仪器伪差。故本族验收判据=**显示列表结构对齐**（存在性/位置/有效可见性），非像素。
- **实测**（6 带水关）：
  - 位置：全部冰膜格最近邻 dy=0.0（零方差）， IceBoxLeft/Right/IceBox 三变体逐格配对。
  - 有效可见性：oracle ev=false 100%、我方 ev=false 100%（隐藏覆盖层同构，IceBox tint 双侧同为缺省白 0xFFFFFF=未 tint）。
  - 计数：27_1 14/14、28 23/23、25_1 5/5、12 3/3 全等；**09_1 24/28、forest_10 21/25**——各差 4 个 middle 格，实位核对为**双格水段**：oracle 生成 [IceBox0000, IceBox0000]（全 middle），我方生成 [IceBoxLeft0000, IceBoxRight0000]（左右边缘）。2 关 ×4 格，同构位置逐格对上（例：09_1 (1072,308)/(1104,308) oracle 双 middle ↔ 我方 Left(1072)/Right(1104)）。
- **判定**：✅ 隐藏覆盖层结构对齐（像素零影响面）；双格段 edge 判别规则残差归 §3.1（待生产槽裁量是否修，像素/可见性双零影响）。

### 2.2 F3a 吊板 hanging_base（8ad63f6）
- forest_25_1：oracle base×7 / 我方 base×7；base-platform 位置差 Δ=(0,0) ×7 双侧。forest_12：3/3、Δ=(0,0) ×3 双侧。✅ 同位双精灵结构落地。

### 2.3 F3b wind 灯层（4cc9886）
- forest_22（on×5）：oracle/我方各 5，light-base Δ=(0,0) ×5，tint 全 0xFFFF00（黄）双侧逐灯等。
- forest_27_1（off×3）：3/3，Δ=(0,0) ×3，tint {黄, 白缺省} 混合双侧等。✅

### 2.4 F3c pulley_base 板位锚（e6111e5）
- forest_04：oracle base=(79.6,875.9)/(907.8,193.1)，我方=(80,880)/(912,194)——与各自 platform 完全同位（Δ≤(0.4,4.1)px，我方整数字锚 vs oracle 连续值，为 settled 物理位快照口径差）。修复前我方误挂轮锚 (80,114)（e6111e5 实录）→ 修复后随板。forest_bonus_2：4 台全对位，Δ≤0.4px。✅

### 2.5 F3d lever 杆灯（64b099d）
- on 帧在位：forest_28 2/2、25_1 1/1、09_1 2/2、bonus_3 1/1；off 帧同步在位（04/10/27_1/bonus_2/bonus_3 各 1-2 对）。on/off 双帧随 state 运行时实证（同关同帧双态共存于 25_1/28/bonus_3）。✅

### 2.6 V9/V10 风机关演出（6884ba8）——范围注记
- 结构面（本槽实测）：forest_27_1 三台 off 风 `wind_base_light_off0000` 3/3 在位、组色 tint 逐灯等；wind_effect 帧号双侧不同（oracle [0005,0019,0022,0027] vs 我方 [0014,0020,0026,0029] 等）=**建时随机相位常驻**（oracle 语义，V10 目标即此）。
- 时序面（400ms 延迟停帧、400ms 窗内再 on 复位 quirk）：为翻转瞬态行为，需输入注入动态对拍，超出本槽静态两态取证范围——依 6884ba8 落地记录（bundle `_.delay(…,400)` @1737260 字证+quirk 保留）与既有 journey 基线背书，标 ⏸ 未动态复拍（如需可后续单独立项）。

### 2.7 V17 暂停全画面静帧（3477519）
- 我方：10 关暂停态 pa/pb 差分全帧=0.0%（面板弹簧落位后面板亦静态）、板外区=0.0%——液面/钻石/海军/风效全冻结，scene.pause("Game") 引擎级静帧实证（Game 场景 isPaused=true 旗标 ×10）。
- oracle：板外区=0.0% ×10（game.paused 引擎分支，世界冻结）；全帧 4.53-4.64% 为 oracle 面板自身动画（15 号档 V17 oracle 列「动画全停仅面板动」同源现象，双态截取恰将其显影）。
- 双侧板外零动=世界静帧语义对齐。✅ （另录：oracle 暂停钮全 10 关 worldTransform 定位 (1256,24) 一击命中，面板正常弹出。）

### 2.8 V13 平台灯组色 tint（04005a5）
- 逐关 tint 值集合双侧全等（9 关有平台灯）：10/25_1/27_1/28 蓝 0x0D3EFF 系、04/22/25_1/28 品红 0xEC0EF1 系、黄 0xFFFF00 系…… **forest_bonus_2 单关 47 盏七色全谱 [0x00CC00, 0x57BEFF, 0x9933FF, 0xEC0EF1, 0xFF0000, 0xFFFF00, 0xFFFFFF 缺省白] 精确等**；forest_bonus_3 另证 on 态灯 tint（0xEC0EF1）与 off 同色（oracle @1620676 双帧同 tint 字证）。✅ 「灯色五组+白缺省」全谱落地。

### 2.9 F2 相机 settled scroll（83a8bef）
- 修复前（report48b align）：09_1/10/22/27_1/28 (-16,-16)、25_1 (+16,-16)、12 (0,-16)、bonus_3 (-16,+16)、bonus_2 (0,+32)、04 (0,0)——9/10 关带移。
- 修复后：**10/10 关 align=(0,0)**（mean_after 3.31-6.27，与修复前同量级=残余为 F4 砖场随机场与每局随机，非相机）。✅ settled scroll 关卡矩形语义落地，±16px 系统差清零。

### 2.10 菜单光柱（fe3353c，0.3.37 E 批）
- 双侧菜单 ma/mb 自差分：oracle 9.77%、我方 6.14%——光柱动画双侧活体（相位/宽度脉冲在动）。
- 几何口径（屏心堆叠扇×8、x 全 0 无散布、t+=0.003 帧驱动）依 fe3353c 字节真相，本槽以 PNG 并排留证（MENU-sbs.png）供人工复核；菜单两侧版面/字体本为自有实现域，cross struct 35.2% 不作为判定项。

## 3. 残余差异与仪器伪差清单

### 3.1 结构残差（真实差异，待生产槽裁量）
- **F1 双格水段 edge 判别**：oracle 对 2 格宽水段生成双 middle（IceBox0000×2），我方生成 Left+Right——影响 09_1/10 各 4 格（推及全部 31 关双格段）；隐藏覆盖层（ev=false 双侧）+ 静帧 0000 无动画 ⇒ **像素与可见性双零影响**，仅显示列表 family 计数差。修复如需：buildLiquids 补「段宽=2 → 全 middle」判别（成本 S）。

### 3.2 仪器伪差（不判差异）
- pulley_rope "missing"（forest_04 ×3、bonus_2 ×6）与 BackGround/roman_base "extra"：我方 TileSprite 帧名在 Phaser 3 丢失（UUID 纹理键+`__BASE`，38 号档 F5 同族），compare.py 尺寸启发（h==20→rope）与我方绳实高 h=19 失配致未归类；38 号档已证绳区域像素无热块。
- wind_effect 帧号双侧不同：随机相位常驻（V10 语义）。
- Navy/decor/钻石相位差异：每局随机族，compare 原器不报告。

### 3.3 采样覆盖说明
- 10 关覆盖五族×1-2 关+多族复用（25_1 一关四族、09_1/28 三族）；48 关全量以 38 号档 report48b 为底册，本档为修复验收抽样取证，非全量复审。

## 4. 复现方式

```bash
# 双侧采集（先按门禁纪律确认 git 树干净；我方服 3991 / oracle 8842）
node note/research/2026-10-fidelity/tools/level-audit/acceptance-capture.mjs --side ours   --out TEMP/fixacc/ours   --port 3991 --levels <ids> --modes static,pause,menu
node note/research/2026-10-fidelity/tools/level-audit/acceptance-capture.mjs --side oracle --out TEMP/fixacc/oracle --levels <ids> --modes static,pause,menu

# 显示列表+像素对拍（38 号档原器）
python3 note/research/2026-10-fidelity/tools/level-audit/compare.py TEMP/fixacc/ours TEMP/fixacc/oracle --out TEMP/fixacc/acceptance-compare.json

# 逐族判定+并排拼图
python3 note/research/2026-10-fidelity/tools/level-audit/acceptance-report.py --ours TEMP/fixacc/ours --oracle TEMP/fixacc/oracle \
  --prefix-ref note/research/2026-10-fidelity/tools/level-audit/evidence/report48b.json --cmp TEMP/fixacc/acceptance-compare.json \
  --pngs TEMP/fixacc/pngs --out TEMP/fixacc/acceptance-verdicts.json --levels <ids>
```

## 5. 证据清单（tools/level-audit/acceptance/）

- 并排 PNG ×21：`<id>-static-sbs.png`（oracle|我方静止初始态）×10、`<id>-pause-sbs.png`（双侧暂停静帧）×10、`MENU-sbs.png`（双侧菜单光柱）。
- `acceptance-verdicts.json`（逐关逐族计数/ev/tint/pause/menu 指标+修复前引用）、`acceptance-compare.json`（compare.py 全量）。
- 采集 dump 与双侧 a/b 原帧为 TEMP 过程件，按纪律已清理（本目录 PNG/JSON 为收容快照）。

## 6. 纪律记录

- 零生产代码改动；仅新增本目录工具件与档卷。TEMP/fixacc 采集残留（~60MB）已清理。
- git 只 add 本槽文件；无 co-author。
