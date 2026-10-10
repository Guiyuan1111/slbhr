# 11 · 残余偏差成因分析：为什么"逻辑全掌握"仍无法逐帧一致

> 2026-10-08。回答的问题：在复刻度 84.31（物理）/ 94.97（视觉）的水平上，剩余差异为什么存在——
> 是缺少逆向工具，还是别的什么？结论基于：本地代码取证（kernel/vendor）+ 两路并发检索
> （物理引擎确定性官方口径 / 游戏逆向复刻社区经验，来源链接全附 §五）。

## 0. TLDR

1. **不是缺逆向工具**。读码工具（美化 + 字节偏移 + 运行时 hook）与验收工具（金轨迹对拍 =
   业界 libTAS/OpenRCT2 同款范式）都已建齐；检索未发现任何公开项目在本类目标（minified JS
   游戏物理复刻）上做得更细。
2. **剩余差异的根源是确定性物理的数学约束，不是理解缺口**：接触求解是顺序敏感的迭代过程，
   任何 1-ULP/亚像素级驱动差异在数百步（约 5 秒）内被指数放大成可见分叉——这是 Box2D 作者
   官方口径，也被我方五条金轨迹的残余项逐一定性证实。
3. **求解器本身与原版逐位同源**（vendor/box2d.js 从 init.js 按字节提取，同一 V8 执行），
   分叉源头全部在**重写的驱动层**（步进调度/施力顺序/风力时基/输入对齐）。
4. **要 100% 逐帧一致只有一条路：整包原样执行原版逻辑**——与本项目"服务端权威联机"的
   架构目标互斥。这是取舍，不是能力缺口。

## 1. 我们到底"掌握"了什么

- 原版没有源码：2,273,196 字节 Closure 编译产物（54323 行美化版），无 source map。
  "逻辑掌握" = 静态读码（字节偏移 @N 定位）+ 运行时插桩（金轨迹录制）两条腿。
- **物理内核是字节级同源件**：`packages/shared/src/box2d/load.ts` 明确 vendor/box2d.js
  按 `scripts/vendor-box2d.mjs` 从原版 init.js 原样提取（含 Phaser.Physics.Box2D 插件段，
  vm 沙箱 stub 求值）。即 Box2DFlash 2.1a 求解器的每一条算术指令与原版相同，跑在同一个
  V8 引擎家族上。**纯求解器算术不是分叉源**。
- 驱动层是重写件（world.ts `step()` 的施力/步进/事件链、机关 update、门扫帧、角色力模型），
  以及输入路径（键盘事件→60Hz 帧对齐）。**分叉源全部在这一层**。

## 2. 差异的四个真实来源（按证据强度排序）

### A. 混沌放大（数学约束，无法"修"）
Box2D 接触求解 = Gauss-Seidel 迭代，结果依赖接触数组顺序——Catto 原话
"The Box2D solver produces different results if the contact array has a different order"。
1-ULP 级差异实测在 ~300 步内改写整局状态（官方 issue #1086：FMA 差异使入睡步数 294→261、
transform 哈希全变）。我方五条金轨迹残余项全部落在此类（报告 §五/§十六）：
- forest_01 fb 0.17m = 箱角接触点 ~1px 差 → 助跑末速差 13px/s；
- bonus_2 坍缩链 = f2 落地时序 ~1 帧差 → 27 体级联；
- forest_07 球级联 = 行走相位 ~1 帧 → 球→推杆→平台。
定性：终态/机制行为一致，逐帧不可对齐。

### B. 驱动层重写（可修，已修到收益边界）
步进调度（原版 rAF 可变 elapsed、`min(0.04,elapsed)` vs 我方固定 1/60）、施力与机关检查
顺序、接触事件处理时机（原版回调内直接改状态+_toRemove 延迟 vs 我方步后统一处理，
world.ts `processContactEvents`）。静态读码曾三次给出可执行但错误的结论，全靠金轨迹裁决：
- lever 双 fixture 方案偏 2.54px → 回退旧形制（0.0000 全对）；
- 角色 fixture 顺序三轮定案 portal→躯干圆→脚圆→梯形（bundle 42897-42911）；
- 金轨迹 f0 = 起跑后第 5 帧（settle 60→5，dy=3.45px 实证）。
方法论已固化：**金轨迹实证 > bundle 静态解读**。

### C. 原理上不可复现项（live play 范畴）
- 风力相位：原版 `(1.2+0.2·sin(elapsed/1000))·100·衰减` 的 elapsed 是**墙钟**（页面加载
  时刻决定相位），我方用 simTimeS。金轨迹对拍在 fixed-dt 下可对齐幅值（±17% 有界），
  live 相位本质上依赖"玩家何时打开页面"。
  **〔2026-10-11 勘误·F6 已翻转〕**内核增 `WorldOptions.windClockS` 注入缝：生产服务端
  传墙钟（`commit 835c1e7`），与原版同语义；det/金轨迹/单测走缺省 simTimeS 口径保持
  位级可复现（det 48/48 对比 r28 全同、fidelity 87.51 持平）；e2e/门禁服务端经
  `FW_WIND_PHASE` 固定相位偏移。分类由 C 转 B（已修）：live 相位随机性随墙钟时基
  忠实保留，对拍体系经注入缝与随机性解耦。
- 输入量化：真实键盘事件落帧因人而异（INPUT_SHIFT +1 为实测最优标定，全表扫描 0/1/2
  差异 ≤1 分，判定噪声不过拟合）。

### D. 环境层（同仓同机可忽略，跨机存在）
JS 四则运算 IEEE754 逐位一致（语言规范保证），但 `Math.sin` 等超越函数规范只要求
"implementation-approximated"——跨 V8 版本/跨浏览器引擎无逐位保证（crashcat 实测
`Math.atan` 跨引擎差 4 ULP 并使铰链分叉）。同一台机器同一 Node 版本下我方链路确定
（金轨迹复跑稳定）；跨环境属已知变量。

## 3. 是缺少逆向工具吗——工具对照

| 能力 | 社区参照 | 我方现状 |
|---|---|---|
| 读回混淆代码 | webcrack/de4js/美化（但 JS 逆向公开案例止步于数据提取，如 Wordle） | 美化版 + 字节偏移 @N 体系，完成度高于公开案例 |
| 原版行为采集 | libTAS/BizHawk：输入录制+帧步进+状态序列化 | 金轨迹基建（8787 静态服+跳关+物理步计数钩子+确定性输入注入）——同范式 |
| 对拍验收 | OpenRCT2/Factorio：逐 tick 状态校验和回归 | fidelity-score 逐帧对拍 + --save/--compare 快照回归 |
| 位级验收 | SM64/OoT/Pokémon decomp：ROM 哈希对比（前提=找回原编译器+选项） | 对 JS 无意义：bundle 本身可运行，"重打包逐字节一致"无社区实践 |
| 求解器内部状态 diff | crashcat：对 warm-start/island/broadphase 做校验和（可提前数百帧发现分叉） | **未建**（目前只比刚体 transform）——唯一值得考虑的增项，属诊断增强非保真手段 |

结论：**不存在"缺一个工具就能逐帧一致"的缺口**。检索佐证：把逻辑重写到另一载体的一切
项目（re3/OpenRW/sm64ex-coop 等）无一做到帧级物理一致，业界共识即为"重写=行为级天花板，
位级只属于原编译单元复原"；而 JS 游戏的位级真身就是 bundle 本身——我们已经把其中
物理引擎部分原样执行了，这在公开案例里没有先例可对标。

## 4. 若想继续压差距，理论上还剩三条路（及为何暂不走）

1. **驱动序逐项对拍**（M 级）：把原版 update 链逐帧 dump（机关顺序、施力顺序、回调时机）
   与我方 step() 逐项 diff，消掉 B 类残余。收益预估：部分混沌触发点后移，指数 +0.5~2，
   不改变混沌定性。
2. **求解器内部状态校验和**（M 级，诊断向）：借 crashcat 方案对 warm-start/island 做
   per-step checksum，把"分叉发生在第几帧、哪个子系统"从推断变实测。提升可解释性，
   不直接提分。
3. **整包原样执行**（L 级，架构否决）：原版全部游戏逻辑就在 bundle 里，headless 跑原版
   Devices/Level 状态机即可按构造逐位一致——但那等于放弃服务端权威联机重写（原版是
   客户端单机黑盒，无权威状态缝，联机必须自建）。**保真度与联机架构此消彼长，0.3.0
   冻结需求已裁：联机架构不变，保真以金轨迹对拍为验收。**

## 5. 检索来源（子代理产出全文摘录，全部附完整链接）

### 5.1 物理引擎确定性（子代理 A，15 条摘其纲）
- Box2D 2.x 官方 FAQ：同二进制确定、跨二进制/平台不保证；不支持定点数方案。
  https://github.com/erincatto/box2d/blob/v2.4.2/docs/FAQ.md
- Box2D 3.1 官方：跨平台确定性为一等特性；不提供 rollback 确定性；勿指望 pixel-perfect。
  https://github.com/erincatto/box2d/blob/main/docs/questions.md
- Erin Catto《Determinism》(2024)：fast-math 禁用、FMA 需 `-ffp-contract=off`、自写
  sinf/cosf/atan2f（sqrtf 全平台一致）；"The Box2D solver produces different results if
  the contact array has a different order"；同机重跑需重建 world（free-list 顺序漂移）。
  https://box2d.org/posts/2024/08/determinism/
- 官方 issue #845（Reset world for determinism）。
  https://github.com/erincatto/box2d/issues/845
- Jolt 官方确定性前提：API 调用序完全一致；broadphase 查询顺序/回调顺序永远非确定。
  https://jrouwe.github.io/JoltPhysics/ （#deterministic-simulation）
- ECMAScript：Math.sin 为 implementation-approximated；IEEE754 只保证 +−×÷/sqrt。
  https://tc39.es/ecma262/multipage/numbers-and-dates.html#sec-math.sin
  https://macwright.com/2020/02/14/math-keeps-changing.html
- crashcat 实测：Math.atan 跨引擎差 4 ULP 致铰链分叉；量化后四引擎 210+ 检查点逐位一致；
  内部状态 ~150-700 帧分叉、位姿 798 帧才可见。V8 的 Math.sin 走 fdlibm builtin。
  https://github.com/isaac-mason/crashcat/issues/7
  https://github.com/v8/v8/blob/main/src/builtins/math.tq
- issue #1086：RISC-V 自动向量化绕过 fp-contract 生成 FMA → 入睡步数 294→261、哈希全变。
  https://github.com/erincatto/box2d/issues/1086
- Bruce Dawson《Floating-Point Determinism》："1 ULP 之差可能就是角色生死"，epsilon 救不了。
  https://randomascii.wordpress.com/2013/07/16/floating-point-determinism/
- planck.js（Box2D 官方 JS 移植）自述：仅"同一 JS runtime"内确定，跨 runtime 答案是 no。
  https://piqnt.com/planck.js/docs/limitations
- lockstep 范式（1500 Archers，GDC 2001）与 desync 实战。
  https://www.gamedeveloper.com/business/1500-archers-on-a-28-8-network-programming-in-age-of-empires-and-beyond
  https://www.forrestthewoods.com/synchronous-rts-engines-and-a-tale-of-desyncs/
- GGPO rollback 同样以确定性模拟为前提（消除的是输入延迟不是确定性要求）。
  https://words.infil.net/w02-netcode-p6.html
- 固定 timestep 是复现性先决条件（Fix Your Timestep!）。
  https://gafferongames.com/post/fix_your_timestep/

### 5.2 游戏逆向复刻经验（子代理 B，15 条摘其纲）
- SM64 decomp：matching = 原编译器(IDO)+原选项重编译出逐字节 ROM；工具链 m2c/decomp.me/
  decomp-permuter（"编译器当裁判"）。
  https://github.com/n64decomp/sm64
  https://github.com/matt-kempster/m2c
  https://decomp.me/
  https://github.com/simonlindholm/decomp-permuter
- ZeldaRET OoT/MM 100% matching 进度站；pret Gen3 以 ROM SHA-1 验收。
  https://zelda.deco.mp/
  https://github.com/pret/pokeemerald
  https://github.com/topics/matching-decompilation
- 静态重编译（N64Recomp / Zelda 64: Recompiled）：机器码直译=按构造行为一致，当今最高
  实用保真等级。
  https://github.com/Mr-Wiseguy/N64Recomp
  https://github.com/Zelda64Recomp/Zelda64Recomp
- 重写路线全部停在行为级：re3（遭 DMCA）、OpenRW（停滞）、sm64ex-coop（重构+60fps 插值
  改变帧语义）、OpenTDU/TDURecomp（同一游戏两条保真路线对比）。
  https://github.com/OpenRW/openrw
  https://github.com/robertkirkman/sm64ex-coop
  https://github.com/testdriveupgrade/TDURecomp
- 逐 tick 状态对拍被联机游戏用于自家引擎回归（OpenRCT2 replays、Factorio FFF #188）。
  https://github.com/OpenRCT2/replays
  https://factorio.com/blog/post/fff-188
- JS 逆向工具与案例：webcrack/de4js/方法论 gist；Wordle 明文提取——**未检索到任何
  「minified JS 游戏物理逐帧对拍复刻」公开案例（阴性发现）**。
  https://github.com/j4k0xb/webcrack
  https://gist.github.com/0xdevalias/d8b743efb82c0e9406fc69da0d6c6581
  https://reichel.dev/blog/reverse-engineering-wordle
- TAS 生态=金轨迹范式先例：libTAS（"tries to make the game run deterministically"）、
  BizHawk 帧步进/防弹录放。
  https://github.com/clementgallet/libTAS
  https://tasvideos.org/EmulatorResources/Features

## 6. 判定

剩余差异 = A（混沌，主导）+ B（驱动序，已压至收益边界）+ C（墙钟相位/输入落帧，原理性）
+ D（跨环境超越函数，同机部署不影响）。**非工具缺口**；当前 84.31 的定级（终态/机制一致、
逐帧混沌）与业界"重写=行为级天花板"共识吻合，且 vendor 原样执行求解器这一步超出可检索到
的公开实践基线。
