# 04 · 外部逆向资源 + 复刻方法论 + 服务端 Box2D 可行性（子代理 D1/D2 完整报告）

> 产出日期：2026-10-04。两路网络调研均受出口网络限制，证据等级已逐条标注（D1：WebFetch 故障改用只读 HTTP GET；D2：GitHub/jsDelivr/Wayback 部分不可达，靠 npm registry、镜像 CDN、搜索索引取证，个别结论为摘要级置信）。引用外部仓库行号/统计以抓取时远端文件为准。

## Part 1（D1）：FBWG 外部逆向资源评估

### 结论：能直接当"机关行为规格书"的资源排序

1. **amhooman/fireboywatergirl**（官方 32 关 JSON + tileset type 语义 + roman/pulley/hanging 几何字段 + temple.json par 时限）——行为规格首选源。
2. **yezhiyi9670/fireboy-and-watergirl-grabber**——取新代官方包的管道 + schema 版本演进线索（**我们的本地参考包即出自此谱系**）。
3. **twboom/FBWG-Editor DOCS.md**——可读性最好的 gid 速查草稿（以官方 tileset 修正其 Button/pusher 命名与缺失项）。
4. **square-nine AS3 仓库**——只做"机关联动逻辑谱系"印证（平台电机 ±2 等少数数值精确同源），**不可当 H5 手感参数来源**。
5. 差异提醒：官方 Forest Temple 外部包 = **32 关**；我们本地包 = 48 关（含 13 个 `_1` 变体 + bonus_1/2/3）。`window` 类型不在外部 32 关包中——**数据代际不同，非事实冲突**；机关矩阵对比必须按同一分母（本地包）重算。

### 1. square-nine/fireboy-and-watergirl-source（AS3 反编译）

- 链接：https://github.com/square-nine/fireboy-and-watergirl-source
- 状态：2024-04-15 一次性上传，无后续维护；2★；约 180MB、17,741 文件。
- 存在性确认。**涵盖前 4 代**：Forest/Light/Ice/Crystal 四目录 + `EXEs`（各代 .swf 解出的源码、序列帧 PNG、音效、完整 Box2D-AS3 库含 `b2PulleyJoint.as`）。
- 机关类清单（Forest 为例，均在 `<Temple>/scripts/`）：`Ball.as`、`LeverBase/LeverMc`、`lever_light_1..6`、`lever_base_light_1..6`、`MovingBox`、`Platform1/PlatformBox/PlatformPulleyBox`、`PulleyAnchor(.2)`、`Rope/RopePulley/RopeTriangle`、`Roman/RomanBase`、`Wind/WindMaker`、`JumperBox`（蹦床）、`BlackBox/FireBox/WaterBox(+Tri)`、`Silver/Blue/RedDiamond`、`ContactListener`、`Game`、`level`。**Forest 没有独立 Pusher 类**（只有 `Pusher_Sound`；Pusher 逻辑类在 Crystal 才出现为 `LightPusher`）。
- **关键结构事实**：机关类全是 250–460 字节的 `[Embed]` 资源桩类，**全部玩法逻辑集中在一个 228KB 的 `level.as` 单体类**（+`Game.as` 35KB、`ContactListener.as` 10KB）——与 H5 版混淆 init.js 的单体结构互为印证。
- 数值对比（level.as 行号级证据 vs 我们的 H5 提取值）：

| 参数 | Flash AS3 | H5 版（01 报告提取） | 判定 |
|---|---|---|---|
| 世界步进 | `Step(1/26, 50迭代)`，ENTER_FRAME 驱动 | 60Hz/ptm 体系 | 不同源 |
| 重力 | `b2Vec2(0, 26)`（自定单位制） | 1000px/s²÷32≈31.25 | 量级一致数值不同 |
| 跳 | `SetLinearVelocity(y=-13.5)` + `ApplyImpulse(0,-0.5)` | jumpVelocity 15.5 | **实现公式同源，数值重调** |
| 跑 | 力模 17、速度钳 7、无输入 ×0.95 衰减 | runForce 50 / max 8.5 | 同上 |
| 平台电机 | `SetMotorSpeed(±2)` | runtime ±2（=64px/s） | **数值精确互证 ✓** |
| 杆/推块电机 | lever ±3、pusher ±1/±2、maxMotorTorque 10000 | lever ±0.2π 限位、pusher 行程 0.7m | 拓扑互证 ✓ |
| fixture 样本 | 角色 friction 0.2/density 0.01；箱 0.6/0/restitution 0.1；平台 1.5/0.3 | feetFriction 0.5 | 不同源 |

### 2. twboom/FBWG-Editor

- 链接：https://github.com/twboom/FBWG-Editor · 状态：2023-06 创建，**最近 push 2026-05-07 仍在维护**；53 文件小型纯前端编辑器（Tiled-JSON 导出）。
- DOCS.md（1.6KB）：地面 tile gid 0–8（含水/岩浆/毒）、Chars gid 16–23（spawn/门/三色钻+fbwg）、Objects gid 24–39（button/lever 左右/box/mirror 系/ball/boxheavy/timed button/wind generator）、LargeObjects 40–41（portal）、`platform` 用 `type:"platform"` 无 gid、对象属性 `dx/dy/group`、tile 32×32（与 ptmRatio=32 吻合）、tileset firstgid 1/16/24/40。
- 与我们 48 关机制矩阵核对：platform/pusher(其称 Button gid24)/leverA(25)/leverB(26)/box(28)/boxheavy(37)/ball(34)/wind(39)/银钻(22) 全覆盖一致；**roman/pulley/hanging 完全未覆盖**（官方走 `object.type` 不走 gid，本编辑器不支持故未写进 DOCS）；`window` 在其官方 Forest 包中不存在（代际差异，见结论 5）。
- 增量解读：`group`=机关联动颜色组（1–8 色表）、`dx/dy`=平台行程矢量、lever 左右由 gid 区分、timed button(38)/portal(40/41)/mirror 系为后续神庙扩展；`example_level.json` 展示 Tutorial_dual/single/keyboard 三层结构。

### 3. amhooman/fireboywatergirl + 其他解包/复刻仓库

**a) amhooman/fireboywatergirl** — https://github.com/amhooman/fireboywatergirl
- 状态：2022-04 一次性，1★；内容为**官方 H5《森林神庙》完整解包**：32 关 json + 教程关 + temple.json + **官方 tileset JSON** + 图集 + 官方压缩 bundle（`fireboy-and-watergirl-forest-temple.min.js` 2.2MB、`main.min.js` 464KB，可与我们的 init.js 对照）。
- **官方 Objects/Chars/LargeObjects tileset JSON 给出权威 type 语义**：`pusher`(tile0)、`lever`(tile1/2 + 默认属性 `onis=±1, startPos=±1`)、`box`/`boxheavy`/`ball`、`timedpusher(time=2000)`、`wind(length=10)`、`beamer(color)`/`rotmirror(dir)`/`boxmirror`/`infinitemirror`/`lightpusher`、chars `char/door/diamond`+`fb/wg/silver/fbwg`、`portal(inverted,portalId)`。
- 32 关实测机关分布（其全关 JSON 统计）：platform 实例 96、pusher(gid24) 21、lever(gid25/26/27) 63、box 8、boxheavy 1、ball 3、**hanging 8 实例(4 关)、pulley 6 实例(6 关)、roman 3 实例(2 关: forest_14/24)**。对象 schema：roman=`polygon` 几何 + `dtheta/fullRotation/initialState`；pulley/hanging=`polyline` 几何（绳索路径逐点）+ `offsetY/fullRotation/barWidth`；另有 `windWidth`、顶层 `length`——这些是 **twboom DOCS 没有、我们常量提取也未必覆盖的"机关几何字段"**。
- ⚠ 注意：其 tile3(gid27)/tile9(gid33) 在官方 tileset 里无 type 却在关卡中用了 12/6 次，建议与我们 init.js 里的类名对一次。

**b) yezhiyi9670/fireboy-and-watergirl-grabber** — https://github.com/yezhiyi9670/fireboy-and-watergirl-grabber
- 状态：**2026-09-20 仍在维护**（本主题最活跃仓库）。HAR 驱动的官方 H5 5 神庙全套资源+关卡抓取脚本，带 Tiled 渲染图集。
- 关键情报：官方注明**旧版 FBWG1–5 关卡 JSON 是 Tiled 老格式、较新版本要求新 JSON 格式**——官方包 schema 跨版本发生过演进；复刻目标版本要据此选数据代际。

**c) 其他同谱**：`w193241125/FireboyAndWatergirl`（2019，Win AppX 商店包，与 amhooman 同构，佐证用）；`incrediblewebsite/fbwg2`（2022，FBWG2 UWP 解包）；`stefiitg/FireboyWatergirl*`（C++ 仿作）。评级：佐证/部分参考。

**d) 联机项目**：
- `pavel-skala/Fireboy-and-Watergirl`（13★，push 2025-10，在线版在 `online` 分支）：自写 AABB/三角形碰撞（不用 box2d）。公开记录在案的坑：自认 "a lot of bugs"、`fixing fps to 60`（固定帧率与渲染耦合）、triangle collision / pond triangle、"cube bug"、关卡加入即带 bugfix 连锁。
- `studiosonf-waltfield/fireboy-watergirl-online`（2026-09 单日）：给 **Steam 版（=H5 同一文件集）**做 WebRTC P2P 联机 mod；README 本身是坑清单：4 位房间码+最小信令、双方 mod 版本强一致校验、strict NAT 需 TURN、guest 状态镜像（游戏/暂停/结算全走 host 权威）、安装器需还原 Steam 原文件。
- `github-Vge`（Unity+C# 状态同步服务端）、`sjayan009`、`DKhurana7/ember-and-tide`（WebRTC P2P 自研）：小型练手，物理均自研近似。
- 练手复刻（`hadigghazi`、`sarahaven`、Phaser 系、Qt/SFML/Flutter 系、`lv0senku`）：无参考价值。
- **全网没有任何第三方公开发布过"原版 H5 手感参数文档"**——除我们从 init.js 提取的之外不存在现成参数表（01 报告的提取是独家资产，务必维护好）。

### 4. 速通/帧数据/中文社区

- speedrun.com/faw1：分板**活跃**，类别 Any%/100%/1 Branch ×1P/2P + **每关 32 独立榜单**；WR Any%1P=14:59（2025-09-26）。**但没有帧数据、无 H5 vs Flash 变量、无机关时序测量**——速通界对该作无技术向研究。
- 最有用的时序材料其实在**官方包 temple.json**：每关自带官方 par 时限 `time`/`mobileTime`（如 forest_15=100s/150s）、3 关 `speed` 型、多关 `puzzle` 型——可直接用于机关时序/难度校准。
- 中文社区（搜索通道中途降级，覆盖面受限）：抖音/好看视频/233乐园均为玩法向视频攻略，无帧数/手感参数研究；4399 只有聚合专题页。未发现 B 站/贴吧系统性逆向测量。

### 5. 作者/发行方资料

- 一手确认：Steam `Fireboy & Watergirl 1: The Forest Temple`（appid 5084260）**developer=publisher=Oslo Albet**，2026-09-01 上架（5 神庙单列 + Elements 1003480 + Fairy Tales 1781350）——官方 H5 现由作者自发行，Steam 版即我们复刻的 H5 血统。
- **BulkyPop 域名已失效（NXDOMAIN，2026-10 实测）**。未检索到任何 Oslo Albet / BulkyPop 公开设计文档、GDC 演讲或合作解谜机制规范；Kizi 仅为分发站。该题无可用外部资料。

---

## Part 2（D2）：复刻方法论 + 服务端 Box2D 可行性

### A. "服务端用 box2d 复刻原版 Box2D 行为"——判定：**有条件成立**

#### A1 planck.js（piqnt/planck.js，原 shakiba/planck.js）

| 维度 | 关键事实（出处） | 对我们的含义 |
|---|---|---|
| 身份/谱系 | README 自称 "JavaScript/TypeScript rewrite of Box2D"（npmmirror readme + jsDelivr 镜像 README）。**未标注对应 Box2D C++ 版本号**；是手写重写，非 kripken 编译系衍生物 | planck 与原版用的 port 是**两代不同语义**：planck 对齐 C++ 2.3/2.4 代（Step(8,3) 双迭代、C++ 代 joint motor 设计）；原版是 Flash-2.1a 代 JS 移植家族（见 A2） |
| API/集成 | npm planck 1.5.0：TS 编写、ESM+CJS+d.ts、`engines: node>=24`、无原生依赖；贡献者含 Erin Catto 本人 | 迁移是 API 级重写，但类型完整、无绑定层，成本在适配不在风险 |
| ptmRatio | planck **无 ptmRatio 概念**，物理单位直接用米（旁证：Box2D 本身对 PTM_RATIO 无感，只是像素↔米换算） | 换内核需显式 1/32 米↔像素适配层；所有像素坐标/尺寸/力要过这层，否则手感全错 |
| joint/motor 一致性 | **未找到任何公开的 "planck vs box2d.js/box2dweb 同场景行为对照" 测量或 issue** | 关键证据缺口：电机曲线、摩擦混合、sleep 阈值、TOI 差异必须自建对拍验证 |
| Node 案例 | `engines: node>=24` 官方背书；公开用例多在前端/桌面（Electron+PixiJS 弹珠台、@akashic/melonjs 适配层）。**未找到 "planck 做联机权威服务器" 公开案例** | "可行"有元数据背书，"先例"只能类比 A3 的工业先例 |

#### A2 原版内核血统核实（重要结论）

- kripken/box2d.js = Emscripten 编译 Box2D **C++ 2.3.1**；npm 包 `box2d`(1.0.0) 是无关的 2010 node 原生绑定（**包名陷阱**）；活跃后继 `box2d-wasm`（npm 7.0.0，birch-san）。
- box2dweb = hecht-software/box2dweb，npm 生态版本 `~2.1.0-b`，即 **Box2DFlashAS3 2.1a 代移植**。
- **Phaser2 Box2D 插件真实来源（核实链）**：① phaser.io shop 付费插件；② 官方公告存档（phaser.io/news 2015-03-11）原文："It uses the excellent **box2d-html5 JavaScript port by Isaac Burns**"；③ Isaac Burns 的 port = **flyover/box2d.js**（含 LiquidFun 的 Box2D JS 移植），同谱系 flyover/box2d.ts → cocos-creator/box2d.ts = npm **@cocos/box2d，最新版恰好 1.0.2**。
- "box2d.js 1.0.2" = **该 JS 移植自身的版本号**（与 @cocos/box2d 家族版本号吻合），不是 Box2D C++ 版本。"Eukalyptus" 署名在公开索引零命中、无法证实，更可能是插件包装层署名或 bundle 自加注记。
- **结论（中高置信）：原版内置既非 kripken Emscripten 编译、也非 box2dweb，而是 Box2DJS/box2d-html5（Isaac Burns）系移植，语义≈Box2DFlash 2.1a 代。**
- 防混淆：新官方 `phaser-box2d`（npm 1.1.0，2024-12）是 **Box2D v3** 直接转换（自带 Canvas DebugDraw、宣称 client/server 可跑、<70KB）——与 Phaser2 同名插件无关，引用必须区分代际。

#### A3 确定性 / 服务端权威先例

- **Box2D 官方 FAQ**（erincatto/box2d v2.4.1 docs）：同 binary 同输入可复现；跨 binary/平台 "**The answer is no**"；不支持定点数。
- JS 层放大项：MDN——超越函数精度 implementation-dependent，同引擎跨 OS/架构结果可能不同（基础四则 IEEE754 确定；Box2D 大量 sqrt/atan2/cos）。
- 固定步长是复现前提：Gaffer on Games《Fix Your Timestep》。
- **"Box2D 在 Node 服务端多实例的 sleep 阈值/步进顺序非确定性"专项公开讨论：未检索到**（缺口）；公开确定性担忧集中在 lockstep/回放场景。
- 服务端权威 + 低频快照 + 客户端插值直接先例：**Gabriel Gambetta 四部曲**（Part I "don't trust the player"；Part III 服务器 10Hz 广播、客户端 100ms 渲染延迟插值；Part II 预测/和解承认未处理真实物理引擎发散）——我们 20Hz 快照属标准变体；**GDC 2017《Overwatch Gameplay Architecture and Netcode》**（Timothy Ford）：服务器权威+确定性重模拟的工业先例。
- 推论：**单权威实例 + 快照同步不需要跨机确定性**；只有将来做回放/回滚/多进程房间镜像才会踩浮点确定性坑。

#### A4 直接结论与内核选型排序

1. "planck.js/box2d 同族能在 Node 权威服务器跑"——**成立**（纯 JS、官方 Node 背书、2 玩家+静态机关性能余量巨大）。
2. "换内核 ⇒ 自动保真原版行为"——**不成立**。原版是 2.1a 代移植语义；planck/kripken/box2d-wasm/phaser-box2d(v3) 全不是该代语义；代际差异公开层面无对照资料，只能实测。
3. 条件清单（坑）：必须先建对拍基线（否则无验收标准）；ptmRatio 适配层显式化；**电机类机关（拉杆/升降平台/压力板）手感差异风险最高**（revolute motor 在 2.1a→2.2/2.3 有行为改动，官方 changelog 原文未取到，待补）；sleep 阈值差异 → 静止抖动/推箱不同、快照流里"睡眠体冻结 vs 持续积分"会表现成对端小位移不同步；子弹/TOI 差异 → 高速穿透不同（中文社区对 box2dweb "穿透率特别高" 有实测抱怨，说明移植间穿透确有差异）；npm 包名陷阱（`box2d`≠kripken；`@cocos/box2d@1.0.2` 与游戏 "box2d.js 1.0.2" 同版本号但谱系需核文件头）。
4. 选型建议：
   - **首选实验线：`@cocos/box2d`（1.0.2）或 flyover/box2d.js 本体**——与原版最同族（Box2DJS 直系），预期差异最小；风险：需验证 Node 无 DOM 可跑（testbed 是浏览器形态，无服务器案例）、维护一般。
   - **主路线：planck.js**——唯一持续维护、类型完备、官方 Node 支持；代价=代际语义差需靠对拍基线重标定。
   - **备选：box2d-wasm**（C++ 2.3.x，指针/destroy API，服务器可用但最重，与 2.1a 亦不一致）。

### B. 高保真复刻方法论（做法/出处/适配度）

#### B1 从"未混淆压缩 JS"提取行为规格
- 做法：js-beautify 还原 + 按 `define('Module',…)` 切模块定位类；数值常量上下文提取；运行时插桩取状态。公开出处：cnblogs《JS 逆向百例·反混淆入门》(2021-11-30)、B 站《JavaScript 反混淆与逆向工程实践》系列、公众号《逆向之 WebJs 逆向整纲》(2024-01-13)——均为通用逆向；**"requirejs 切分做游戏规格提取"无公开专文**（我们的自研流程已验证可行，即 01 报告的产出方式）。
- **console.log 禁用绕过**：直接出处 CSDN(2025)——创建隐藏 iframe、console 指向其 `contentWindow.console`（页面级 noop 不影响新 window）；MDN 亦证 console 是普通全局对象可在注入早期重定义。hook rAF 取游戏实例、从 DOM canvas 反查 Phaser Game：未找到公开先例（属常规技巧，需自证）。

#### B2 复刻项目的行为级验证实践
- **TASVideos《MovieRules》**（原文）："make sure your movie syncs from beginning to end"；judges 验证输入文件在官方 emulator build 上同步；利用引擎 bug 的 run 会被避 bug 的更慢 run obsolete。→ 与我们"固定输入序列+逐帧状态比对+保真优先于速度"完全同构，最强方法论出处。
- **Ruffle**（ruffle.rs + /compatibility）：以 AVM1/AVM2 语言/API 完成度百分比跟踪，bug 定义="not present in the original Flash Player"（**与原始实现差异即 bug**）。
- NES：nesdev wiki《TestSuites》（Nestest 类测试 ROM；URL: https://wiki.nesdev.org/w/index.php?title=TestSuites ，本次被 403 挡，URL 可引）。
- OpenBW：本轮未检索到 replay 状态哈希对拍的公开描述（注意：搜索引擎小模型曾编造"校验和机制"，**不可当出处**）；sm64decomp 类 matching-decomp 本轮未能取证，待补。

#### B3 浏览器内逐帧物理数据录制
- debugDraw 对照：Box2D 调试绘图教程群（cnblogs 多篇）；**planck 自带浏览器 testbed**（`planck-with-testbed`）；新 phaser-box2d(v3) README 原文含 `CreateDebugDraw`/`b2World_Draw`（"testing without a game framework"）。
- **专用 "H5 游戏逐帧物理录像" 工具/文章：未找到公开项**（缺口）。自研路线：CDP（Chrome DevTools Protocol）`Runtime.evaluate` 注入世界对象、按 `world.step` 帧采样 {body transforms, velocities, contacts} + 截图哈希；原版为固定步 rAF 驱动，采样可行（依据：Gaffer 固定步长论证 + Phaser2+rAF）。
- 我们已有的可复用资产：`TEMP/browser-bot.mjs` 双 headless 键盘 bot 经验（真实键盘事件驱动、状态轮询 ≤50ms 滞后补偿）可整体平移到原版页面上做"金标准轨迹采集"。

### 给我们的行动含义（本报告作者归纳）

1. 先建对拍基线管线（B1 插桩 + B2 输入序列同步比对 + B3 逐帧采样），再谈任何物理修复；
2. 内核选型做"同族优先"实验（@cocos/box2d / flyover/box2d.js），planck 作主路线对照；
3. 修复顺序 = 规则层（E1/E10/E15/E20）→ 解析层（E4/E5/G8）→ 状态同步（E13）→ 物理模型层（依赖基线）；
4. 外部数据交叉验证一律以本地 48 关包为基准，amhooman 包作机关字段补全参考。
