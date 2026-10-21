# 00 · 总索引——高保真复刻调研与保真审计档卷（fidelity）

> 维护：noteidx 槽 2026-10-20 首建。口径：每号档一行（档名+一句话主题/关键结论+状态），tools/ 只列目录级用途；一切结论以各档原文与 git log 为准，本索引只做导航。
> 定位：本项目保真战役的源头档卷线——2026-10-04 首轮只读调研（00–05）起，经行为取证（06–26，含 8 关不可解封印族）到逐参数保真审计（30–37）。编号 27–29 缺号（无该档卷）。
> 关系：总挂账与现状汇总挂 behavior-parity [00-INDEX §3](../2026-10-behavior-parity/00-INDEX.md)；方法论落地（金轨迹/oracle 机）见其 §1–§2；性能线见其 §4。
> 状态图例：✅ 已收口（结论定案/修复已入库/用户已裁决）｜🔄 活档｜⏸ 断点保留。本目录 35 档全部收口。

## §1 档卷一览（00–26 调研与取证期）

| # | 档卷 | 一句话主题与关键产出/结论 | 状态 |
|---|---|---|---|
| 00 | [00-overview.md](00-overview.md) 总览与接续指南 | 首轮 5 路子代理调研汇总：素材文件层 100% 保真但接线大面积断连（音频 7/33、机关建模 4/12+ 类、关卡 1/48），逻辑系四层系统性偏离（自写 AABB 换掉 Box2D 等）；五项接续工作经 2026-10-08 状态更新全部执行完毕；含证据引用约定与"本地包非纯净原版/代际差异"双警告 | ✅ |
| 01 | [01-original-engine-spec.md](01-original-engine-spec.md) 原版构建包行为规格（子代理 A） | bundle 逐字节挖掘（init.js 2,273,196B，@N=字节偏移）；§0 全局警告=该包非纯净原版（4399 内核+镜像站注入五处）；部分常数后被内核落地勘误（球半径 0.9→0.4、箱宽 1.8→1.77 等，权威勘误在 handoff §四与 05 号结案注） | ✅ |
| 02 | [02-gap-audit-logic.md](02-gap-audit-logic.md) 复刻工程逻辑审计（子代理 B） | E1 死亡模型反向（原版任一人死整关重开 vs 复刻 1.1s 原地复活）领衔的确定错误清单按严重度排序；`FW\data\` 与原版字节一致（MD5 已核）；init.js:NNNN 为美化版行号需与字节偏移交叉定位 | ✅ |
| 03 | [03-asset-data-fidelity.md](03-asset-data-fidelity.md) 素材与数据保真度盘点（子代理 C） | assets 59 件+data 49 件逐字节 md5 一致、460 个静态帧引用全命中 0 缺；真差距=图集装载 6/8、机关 4 类/全作 12+ 类、音频 7/33、关卡 1/48、整条菜单/中文字体管线未用原版素材 | ✅ |
| 04 | [04-external-resources-and-methodology.md](04-external-resources-and-methodology.md) 外部逆向资源+方法论（子代理 D1/D2） | 外部资源规格书排序：amhooman/fireboywatergirl（官方 32 关 JSON+tileset 语义）为行为规格首选源；两路网络调研受出口限制、证据等级逐条标注；代际差异（48 关本地包 vs 32 关外部包）以本地包为保真基准 | ✅ |
| 05 | [05-mechanism-constants.md](05-mechanism-constants.md) 机关常数提取 | 原版混淆 JS 逐字节证据（latin1 切片法，切片留 TEMP），机关物理常数权威出处；⚠ 与 30–37 号档所用 bundle（2,218,873B）非同一版本，@偏移不可互查（换包成因未查，30 号档附建议确认长期事实源） | ✅ |
| 06 | [06-48-level-behavior-smoke.md](06-48-level-behavior-smoke.md) 48 关行为级冒烟 | 零输入 600 帧（10s@1/60）浸泡 48/48 通过异常 0；收集模式 STRICT=false（异常只打印不置红），冻结标准满足后可翻 true 转严格断言 | ✅ |
| 07 | [07-methodology-web.md](07-methodology-web.md) 复刻验证方法论检索 | 金轨迹对拍=业界标准方法论（录原始输入+固定 tick 复现+差分快照）；Box2D 确定性边界判定=同机同 V8+fixed-dt 下 float 一致，方法论成立、无跨机问题 | ✅ |
| 08 | [08-pulley-forensics.md](08-pulley-forensics.md) forest_04 滑轮金轨迹取证 | 终点全部吻合、定性 1:1 联动正确；残余瞬态 maxDy 1.31m=接触序敏感的亚像素混沌非机制错误；含金轨迹解码两处误读纠偏（板2 不在追踪列表、@fN 是 maxΔv 帧） | ✅ |
| 09 | [09-ui-states.md](09-ui-states.md) 原版 UI 状态机规格 | boot→load→menu→levelMenu→level→endGame 全景+坐标/字体（font 族全指 font.fnt 基准 48）逆向提取；我方 0.3.12 落地 Menu/Temple/进度树，0.3.13 补 EndMenu/GameOver/Pause 三弹窗；省略项（kizi logo/buy/SoftLockMenu 等）功能性豁免 | ✅ |
| 10 | [10-gap-analysis-2026-10.md](10-gap-analysis-2026-10.md) 对照原版差距分析（0.3.14） | 本轮修复：P0-1 菜单三图未加载、P0-2 进度保存零调用（解锁永不推进）、P0-3 限时数据断链（星级恒≤2）等；另证 i18n 与存档导出 UI 为原版也没有的项 | ✅ |
| 11 | [11-residual-divergence-forensics.md](11-residual-divergence-forensics.md) 残余偏差成因分析 | 复刻度 84.31（物理）/94.97（视觉）下剩余差异根源=确定性物理的数学约束（接触求解顺序敏感迭代）而非理解缺口；读码+验收工具已建齐，检索未见公开项目做得更细 | ✅ |
| 12 | [12-mech-collider-audit.md](12-mech-collider-audit.md) 机关碰撞体/贴图一致性专项审计 | "源码在为什么会错"五根因：实为 509KB minified Closure bundle（@字节偏移即全部知识）、同一数在四层坐标系四个含义等；双代理并行审计+14 机关族全扫，结案归档 | ✅ |
| 13 | [13-door-sweep-stall.md](13-door-sweep-stall.md) 门扫帧 round 闸门卡摆取证（0.3.27） | 实玩永不通关根因=`Math.round(frac)<21` 恒卡 20.83 帧+isUp 退化单步脉冲（双门错峰脉冲难同帧）；原版判据 `door1.isUp && door2.isUp` 无附加前提；已修且 det 位级一致，链路审计顺带修四处缺陷（fe148a0） | ✅ |
| 14 | [14-forest031-unsolvable-seal.md](14-forest031-unsolvable-seal.md) forest_03_1 拓扑封闭判定 | 不可解：fb/wg 门位交叉、wg 门与 9 蓝钻封于无入口几何组件，原版数据（字节级一致）+原版行为下即不可通；〔用户裁决 2026-10-13〕保原样豁免，按 47/48 如实标注 | ✅ |
| 15 | [15-forest21-unsolvable-seal.md](15-forest21-unsolvable-seal.md) forest_21 断电不可解判定 | 3 台风机全缺 initialState→永久断电，西高台/动滑轮链/置物架全不可达；可收集钻石上限 3/10（内核实测）；〔用户裁决〕保原样豁免 | ✅ |
| 16 | [16-121-oracle-jump-calibration.md](16-121-oracle-jump-calibration.md) 12_1 双引擎跳跃对照 | oracle（@8787 只读）同点同协议对照证伪"107.8 跳升常数"为撞头伪值；出生点注入法（拦 JSON 改 Chars 出生，引擎零改动）成后续 oracle 实验范式 | ✅ |
| 17 | [17-forest14-dual-engine.md](17-forest14-dual-engine.md) forest_14/14_1 双引擎对照收口 | 两关物理等价（Ground diff 空、仅 firstgid 偏移 39/40）；门台 r8 几何封闭，干净弹道升 124.2 vs 需 ≥131.2=差 3.8px 系统性短缺，引擎无关；〔用户裁决〕保原样豁免 | ✅ |
| 18 | [18-forest11-unsolvable-seal.md](18-forest11-unsolvable-seal.md) forest_11 bump 闸门无钥判定 | 底层西行通道被 bump+p1 板 32px 挤压缝封锁，开闸钥匙 l0 在只进不出密封腔；p1 真实行为=下降 96px 入池（推翻旧档"上升成池桥"）；〔用户裁决〕保原样豁免 | ✅ |
| 19 | [19-external-repo-uwp-comparison.md](19-external-repo-uwp-comparison.md) 外部 GitHub 仓库对比 | w193241125/FireboyAndWatergirl 实为微软商店 UWP 版 appx 脱壳（WinJS 4.0.1 壳，bundle 仍 2,365,819B 混淆）非可读源码；与本地基线结构化逐字段 diff | ✅ |
| 20 | [20-visual-misalign-fixes.md](20-visual-misalign-fixes.md) 第一关文字错位与结算面板修复 | 三处客户端缺陷+一处镜像注入误移植已修；二次勘误（oracle 终结面板实拍）：原版结算面板确有时限文本"00:40"（非用时），镜像注入手法=替换该文本；oracle 工具新坑=镜像 h5api 须 Proxy 全 no-op 桩（第 5 处注入实证） | ✅ |
| 21 | [21-forest28-unsolvable-seal.md](21-forest28-unsolvable-seal.md) forest_28 拓扑封闭判定 | l3 密袋无入口→p1 永不升起→fb 门封死；p1 实测为贴地通道"活门"（home 位=阻挡位，g0=1 上升 96px 让路）；〔用户裁决〕保原样豁免 | ✅ |
| 22 | [22-forest09-unsolvable-seal.md](22-forest09-unsolvable-seal.md) forest_09/09_1 门厅密封判定 | fb 门厅腔对 fb 全部入口封闭，双引擎不可解；门传感器实为 8px 高贴地条（纠"门在水渠上"液体叠加层误读）；〔用户裁决〕保原样豁免 | ✅ |
| 23 | [23-forest16-unsolvable-seal.md](23-forest16-unsolvable-seal.md) forest_16 峰板腔隔离判定 | 跨层换门关：wg 门可达，fb 从出生域（896 环廊）到门地板 768 层七重封印（内核穷举+oracle 复核）；〔用户裁决〕保原样豁免 | ✅ |
| 24 | [24-forest32-crossing-seal.md](24-forest32-crossing-seal.md) forest_32 wg 西渡疑似不可达 | 渡河出箱落点散布 ±25-35px（箱停 ±8 ⊕ 骑程 ±15-25 ⊕ 弧长 ±10）对 MC 门禁（≥98%,150 试验,seed42）疑似物理不可达；oracle 真服 spot-check 未做留后续；〔用户裁决〕维持 win24 挂起：路线入库不计绿不删档 | ✅ |
| 25 | [25-platform-ghost-penetration-oracle-proof.md](25-platform-ghost-penetration-oracle-proof.md) 平台幽灵穿透 oracle 实证 | 判别实验（p0 竖闸与实心板零间隙相贴：顶死 vs 穿透升 96px）证幽灵穿透=原版同构忠实语义，结案；工具入库 note/evidence/forest_25/tools/ | ✅ |
| 26 | [26-forest24-upper-cavity-oracle-verdict.md](26-forest24-upper-cavity-oracle-verdict.md) forest_24 上腔封闭 oracle 定谳 | r24b 三疑似分歧点逐一裁决（杆质量/惯量/静息角逐位一致等）；上腔不可达定谳；〔用户裁决 2026-10-15〕保原样豁免（豁免名单第 14 个） | ✅ |

## §2 档卷一览（30–37 逐参数保真审计期，rpa/rpb/rpc/rpd/rb1/rcm 各槽+uitree/filterport）

| # | 档卷 | 一句话主题与关键产出/结论 | 状态 |
|---|---|---|---|
| 30 | [30-parity-platform-pusher-lever.md](30-parity-platform-pusher-lever.md) platform/pusher/lever/Device 基类（rpa） | P0=0、P1=2、P2=11：四机制物理语义（关节/锚点/限位/马达/密度/摩擦/过滤/组联动）与原版逐参数一致；唯一实测偏差=转臂限位过冲（oracle 逐帧硬钳、内核无）；⚠ 当前 bundle 2,218,873B 与 05 号非同版，偏移只对本文有效 | ✅ |
| 31 | [31-parity-hanging-pulley-roman-window.md](31-parity-hanging-pulley-roman-window.md) hanging/pulley/roman/window（rpb） | §1.3 hanging 锚点体 P0 已修（907ba54：fixture 改原版精灵矩形 38×35px，锚点 mass=1.2988/inertia=0.2821 逐位归位、8 N·s 冲量板摆 339→415px；det 面 hanging 7 关漂移、其余 41 关位级不变）；window 渲染缺失 P1 已按原版结构补绘 | ✅ |
| 32 | [32-parity-character-liquid-door-diamond.md](32-parity-character-liquid-door-diamond.md) character/liquid/door/diamond（rpc） | 按 define 模块边界切片逐参数对照（character/Door/Diamond/Ground/MechManager 等 11 区段）；utf-8 字符偏移口径，与 33 号档 latin1 偏移在涉及区段恒差 +9（交叉验证互证） | ✅ |
| 33 | [33-parity-portal-mirror-wind-props.md](33-parity-portal-mirror-wind-props.md) portal/boxmirror·boxheavy/infinitemirror/wind（rpd） | portal 无设备实现但 49 关数据 0 对象（oracle 亦 0，P2 潜在缺失）；windWidth 不透传致 forest_22 唯一 `windWidth:1.5` 被缺省 2.6 覆盖（风带宽 44%）等 P1 定案；latin1 字节偏移口径 | ✅ |
| 34 | [34-parity-ball.md](34-parity-ball.md) ball（BallPrototype）（rb1） | P0=0、P1=0、P2=3：ball 为 Devices 家族结构最简动力学道具（单主圆 fixture+portal sensor）；探针走真实 parseLevel→World 链可复跑 | ✅ |
| 35 | [35-simplification-root-cause.md](35-simplification-root-cause.md) "简化掉原版自由度"根因分析 | 四个已实证结构性简化样本解剖（hanging 锚点零惯量丢绳摆自由度/转臂无限位/风柱宽度缺省覆盖/旋转箱中心偏 32px，全部已修）+同构风险面排查状态与防线盘点 | ✅ |
| 36 | [36-parity-collision-matrix.md](36-parity-collision-matrix.md) 碰撞矩阵全谱对齐（rcm） | oracle 侧 47 个 b2FixtureDef 定义点逐位提取完毕；我方活跃设备 18,446 条逐 fixture 断言全部 PASS（0 FAIL），P0=P1=0——"碰撞与原版不一样"不来自定义层，差异只能在行为面残差；未改内核 | ✅ 8606444 |
| 37 | [37-temple-tree-branches.md](37-temple-tree-branches.md) 选关树"枝"不可见修复+滤镜还原 | 考古证原版=全树恒绘打底+已通关金色叠绘两层，我方只画 done 侧且暗橄榄平色双偏差，已修（f366e02：TempleScene 双层平色近似+星帧映射兼修）；§7（2026-10-20 filterport）CPU 精确烘焙 Bevel/Outline/CM 三层管线还原浮雕质感，对拍结构化 49/49、方向 50/50、密集 97.56%（fa17e12） | ✅ f366e02+fa17e12 |
| 38 | [38-level-visual-audit.md](38-level-visual-audit.md) 全 48 关视觉元素三层审计 | 数据层 canonical 全同（掉层疑虑排除）；运行时显示列表 6 组缺失 family 共 524 精灵（F1 水体冰膜 423/31 关、F3 机构子精灵 82/24 关：hanging_base 20·wind 灯层 33·pulley_base 错锚 19·lever 杆灯永不换帧 10）+ 相机 settled scroll 系统差 44/48（F2，冻结 zoom 0.9231 vs 1.0，疑 0.3.29-F4 引入待核）；像素结构差 inner 均值 6.89% vs oracle 自噪声底 1.35-2.06%；分布：缺元素 42/错位 4（07/13/13_1/15）/轻微 2/干净 0；只审计未改码，F1-F3 修复待立项 | 🔍 5de0524 |
| 39 | [39-visual-diff-drift.md](39-visual-diff-drift.md) visual-diff 门禁带内漂移核查（vdrift） | 88.66–92.8 vs 历史带 95.2–95.8 归因三分类定谳：(a) 0.3.35 选关树=0 帧（量具捕获流不含选关画面，oracle 直跳 level/我方深链）；(b) **量具 bug 定谳**——"DOM 不入镜"假设证伪，`#hud` 子树（0.3.33 HUD 木牌化批）入镜净扣 3.35–4.1 分；oracle zoom 轨迹恒 1.0 排除相机时变，多尺度"缩放差"系 DOM 污染对齐的伪象（两侧 settled zoom 实为 1.0，兼作 38 号档 0.9231 冻结瞬态的口径桥）；(c) 无定谳项（noDom 最差格与 10-13 逐格同型，残差 −1.4±1.5 在噪声带；6fec4a3 同窗 A/B 因停止门 5de0524 关门弃跑，程序留档其 §3.5）；建议新带 93.2–96.2（修量具后，待批准）；**fixband 收口（§7）：量具口径已修（截帧藏 #hud/#menu/#toast 双 rAF 后截 canvas 随即恢复，20c7287/af422cc，同窗三帧 A/B 复现 +3.5 净扣）+0.3.38 repeat5 静窗定带 90.55–92.86（中位 91.44；auditfix 槽独立四跑 90.77–92.84 带内互证；F2 后最优平移=(0,0) 域）——低于 §4 预测的归因=预测所本 noDom 94.56–94.71 系旧相机 (6,-6) 16px 校正域观测+0.3.37/38 渲染演进+跨会话相位噪声低尾（极差实测 2.31）；F1 冰膜=visible=false 字节语义伪差，水体带 gy≥6 前后 87.86/88.89 同带零变化（委托「显著上行」预期由修复批+本槽实测共同修正为「不变化」）；带演变链终态 95.2–95.8→88.5–93.0→90.55–92.86 入量具配置 benchmark/README.md | ✅ vdrift+fixband |
| 40 | [40-fix-acceptance.md](40-fix-acceptance.md) 0.3.38 修复验收取证（fixacc） | 10 关三态采样（static/pause/menu）oracle-vs-我方并排对照：六面修复全数对齐——F1 冰膜 dy=0/ev=false 双侧 100%（残差=双格水段 edge 判别 oracle 全 middle vs 我方 Left+Right，隐藏层像素零影响）、F3a-d 位级闭合（base-platform Δ=(0,0)、pulley_base 随板 (80,880) vs oracle (79.6,875.9)）、F2 修复前 9/10 关带移→修复后 align=(0,0)×10、V13 平台灯 tint 逐关全等（bonus_2 单关七色全谱）、V17 暂停板外双帧差 0.0%/0.0%、菜单光柱双侧活体；工具 acceptance-capture.mjs/acceptance-report.py+21 张并排 PNG 收容 tools/level-audit/acceptance/；修复前依派发豁免引 38 号档 report48b（worktree 因 @fw workspace 软链串包弃用）；PAD 框架自勘误防复蹈（§1.3） | ✅ fixacc |
| 41 | [41-chinese-font-glyph-coverage.md](41-chinese-font-glyph-coverage.md) 中文字形覆盖缺口归属定谳（glyphcov） | 触发=r18 两段化量化“进房前 75 字”时逐码位核出 22 个无字形。素材同一性：我方 `font.png` 与官方变体 A **`cmp` 无差**、`font.fnt` 唯一差异 CRLF→LF ⇒ 天花板由官方资产决定。关键前提（推翻“官方用 DOM 渲染中文”）：`utils/lang/ch` 是内置中文字典（`init.beautified.js:77980-78008`）→`Lang.locale()`→`make.bitmapText(…,"font",…)`，与设置/制作/结算面板同一张 260 字形图集（四键注册 `:77922-77925`）⇒ **原版中文界面自己就带空白洞**：`congratulations`=「恭喜！」只显「！」、`credits_to`=「所有学分都会去」缺「所学去」、`unlock_all` 缺 `U`/`k`/`!`。判据取“官方 bundle 搜不搜得到同字面”（`grep -rl` 变体 A 全树命中数）：**G1 我方自创**（设置/音乐/音效/制作人员/致谢行/`Loading...`＝0 命中；原版对应位置是 `MusicButton/FxButton` 图集图标、CreditsMenu 无标题、LoaderBar 是 `PreloaderAssets` 纯 sprite）＝我方呈现层缺口，任何官方图集含 `output/E` 315 字版都补不出；**G2 与原版同形**（「恭喜！」1 命中＝官方字典自带）；**G2′ 我方放大**（官方「你完成了比赛」缺 3 字→我方改写「你完成了全部挑战」缺 5 字）。变体差异实测：E 315 码位多 恭/喜/你/比/赛/学/所/去 等 55 字，但反丢 A 有的 `c`/`g`，且仍缺 设置音乐效员基于暂重。含两份委托取证的勘误（一份路径哈希全虚构、一份方向对但外延为假）＋可复跑 `cmp`/集合运算脚本；处置四条待裁决，只取证未改码 | ⏳ 待裁决 |

## §3 tools/ 目录速查

| 件/子目录 | 用途 |
|---|---|
| collision-census-probe.mjs | 36 号档探针 A：碰撞矩阵运行时全量普查（真实 parseLevel→World 逐 fixture dump，对 oracle 普查表逐项断言） |
| collision-behavior-probe.mjs | 36 号档探针 B：5 个典型碰撞对行为基线（承载/坠落/液体致死/推箱/ball 冲撞），重跑应逐位一致 |
| collision-behavior-probe-baseline.txt | 探针 B 的基线输出存档（供用户"碰撞差异"报告对照） |
| temple-tree/ | 37 号档选关树取证与对拍件：shoot-temple.mjs（起服+种进度+截 canvas 冒烟）、probe-progress.mjs（localStorage 种子/星帧状态探针）、compare-temple.py（oracle vs 我方 1280×960 对拍门禁：47 边三点结构化采样）、compare-result.json 与 oracle/ours/probe 三 PNG 产物 |
| visual-drift/ | 39 号档量具漂移核查件：probe1.mjs（visual-diff 诊断副本——oracle zoom 轨迹/我方 DOM 层清单/藏 DOM 双帧差分，ROOT 绝对路径）、probe1-result.json（normal 91.21 vs noDom 94.56）与 orig-pair/ours-nodom/ours-normal 三 PNG 证据 |
| acceptance/ | 40 号档修复验收证据收容：10 关 static/pause 并排 PNG+MENU 菜单光柱并排（21 张）与 acceptance-verdicts/acceptance-compare 两 JSON 快照；采集器 acceptance-capture.mjs 与判定器 acceptance-report.py 在本目录（§4 40 号档复现式） |
