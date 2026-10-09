# Handoff：需要真人完成的事与已知限制

**更新**：2026-10-06（**0.3.14…0.3.20 已发布**：复刻收尾七连发——0.3.14 断链修复+性能（gzip −76%/HUD 单例/地面缓存）；0.3.15 设置/制作名单/全通关彩带；0.3.16 封面 cover/光柱/KiziLogo 校正（menu 像素差分 85.6%）+ win 链取证三路全通（FW_DEBUG 钩子留存）；0.3.17 帧/音/动画/文案四线审计（580 帧名 0 缺失）；0.3.18 角色 fixture 顺序三轮定案 + 服务器语义对齐 D1-D7（物理 84.31）；0.3.19 门定位/钻石浮动带/教学文字；0.3.20 单格液体端盖/出生 cx/翻转向层序/楼梯终态——GameScene 渲染审计 11 项全部清零。剩余待办：移动端触控（M）、单机同屏（M-L，待产品决定）、bonus_2 重关物理（wasm 级）。已推送 main + tag 0.3.14…0.3.20 + 各 GitHub Release 附产物包；过程见 handoff/2026-10-04-fidelity-rewrite.md §22-§29）

**更新**：2026-10-06（**0.3.13 已发布**：UI 复刻收官——画布内开始界面/选关大树/暂停/通关结算/失败面板五类全部落地（0.3.12+0.3.13），流程改为画布选关→联机面板；进度 localStorage 星级解锁；规格 research/09-ui-states.md。已推送 main + tag 0.3.12/0.3.13 + GitHub Release）

**更新**：2026-10-06（**0.3.11 已发布**：复刻度量化与保真优化十轮——新增 benchmark/ 双基准（物理 fidelity-score 84.53 / 视觉 visual-diff 94.95，复跑稳定可作回归门）；物理修复：风场阻尼与限速、推杆密度/电机力/T 形底唇、滑轮锚点方向、金轨迹 f0 相位（settle 60→5）；视觉修复：画布几何对齐原版 1280×960、时钟位图字与锚点/文字位、补渲染暂停钮、钻石计数迁出画布；房间码解析截断修复（Colyseus id 含非 alnum）。对比报告 note/report/perf/2026-10-06-fidelity-benchmark.md（§一-§十六），过程 handoff/2026-10-04-fidelity-rewrite.md §9-§17。已推送 main + tag 0.3.4…0.3.11 + 各 GitHub Release 附产物包）


**更新**：2026-10-05（**0.3.3 已发布**：实玩反馈第三批——拉杆支点/关节序/贴图锚点三重修正（贴图与碰撞错位根因）、头部跳跃动画循环（跑动定格根因）、无声根因修复（Phaser 对无扩展名音频 URL 跳过入队，0.2.0 起从未加载）、插值速度外推（阻尼感）；另修正 0.3.1 批量编辑 CRLF 静默失败漏落盘的三项（headTilt/拉杆/推压块跟体）与推压块梯形/竖直平台中心两处物理 bug；详见 release/0.3.3.md。已推送 main + tag 0.3.3 + GitHub Release）

**更新**：2026-10-05（**0.3.2 已发布**：实玩反馈第二批——HUD/时钟 setText 每帧重绘掉帧源修复（仅变化时写入）+ 装饰系统按原版 decorate 忠实移植（seedrandom ASDFA 从 init.js 提取封装，密度/分布与原版一致）；详见 release/0.3.2.md。已推送 main + tag 0.3.2 + GitHub Release）

**更新**：2026-10-05（**0.3.1 动画修正已发布**：实玩反馈修复——死亡烟雾位置/镜像、头部倾角渲染、拉杆支点公转+杆灯+36°、推压块跟体下沉（PusherState+x/y 进快照）、风区尾迹；详见 release/0.3.1.md。已推送 main + tag 0.3.1 + GitHub Release 附产物包）

**更新**：2026-10-05（**0.3.0 发布就绪**：保真重写全部完成——box2d 内核+机关全谱+48 关全可进+金轨迹对拍达标（7/8 刚体积分级一致）+ e2e ×3 零错误，已合并 main@5825947 并打 tag 0.3.0；产物包 `gyのFW-0.3.0-win64-portable.tar.gz` 在仓库根目录。**唯一剩余动作**：GitHub 登录后 `bash publish-0.3.0.sh` 完成远端推送与 Release；详见发布说明与冻结文档 §四）

**更新**：2026-10-04（**执行期冻结完成**：第二轮三轮问答 12 项全冻结（0.3.0 闭环/48 关可进/对拍全绿自动发版/视觉授权抽查/对拍工具入库 scripts/baseline/URL 选关等），执行已开工，入口见 [handoff/2026-10-04-execution-freeze.md](handoff/2026-10-04-execution-freeze.md)；视觉能力已获用户授权，数值差分仍为唯一硬验收）

**更新**：2026-10-04（**保真重写开工**：三轮提问完成、需求冻结，分支 `feat/fidelity-rewrite` 已建；Box2D 提取侦察完成——引擎实为 init.js @1,133,390–1,655,056 的 509KB Closure 编译 bundle（旧"多模块区间"假设作废）；本机原无任何 Node 运行时，便携版 v22.15.0 已装 `gyのFW/TEMP/node/`（gitignore 内，用前注入 PATH）。**接续执行者的唯一入口：[handoff/2026-10-04-fidelity-rewrite.md](handoff/2026-10-04-fidelity-rewrite.md)**，含冻结需求/提取步骤/todo 快照/坑清单）

**更新**：2026-10-04（**使命调整 + 调研落档**：当前阶段目标改为"尽可能忠实复刻原版 HTML5 森林神庙"；五份只读调研报告归档于 [research/2026-10-fidelity/](research/2026-10-fidelity/)，接续工作先读其 `00-overview.md`；文末新增「2026-10-04 使命调整与调研纠偏」一节，本文正文旧表述以其为准）

**更新**：2026-10-03（0.2.0 验收收尾：双浏览器真联机通关 ×3、视觉终审全项 pass、main 合并 + tag 0.2.0）

> **⚠ 仓库迁移（2026-10-03）**：整个 `slbhr` 已合并为单一 monorepo 并推送 GitHub 私有仓库 `Guiyuan1111/slbhr`。`gyのFW` 的完整历史以双亲合并并入（原 tag 0.2.0 一并保留）。**此后所有提交在 `slbhr` 根目录进行**；`gyのFW/.git` 已改名 `.git.migrated` 停用（防双仓库分叉，需要找回旧镜像时改回即可）。

**更新**：2026-10-09（**0.3.24 已发布：结算「继续」直进下一关**——实玩反馈「通关后进不了下一关」诊断：自动化全链路复现（won→存档 stars:2→解锁→点 forest_02→面板→新房 levelId=forest_02）全通、内核真实门感应测试（实走入门→doorUp）本就在 83 内，断点=原版 Continue 直进下一关而我方只回选关树。修复：__fwNextLevel 预选 temple.json 下一关+弹联机面板（最后一关停选关树）。83/83+e2e 双模式+复现脚本验证 ✓。release/0.3.24.md）

**更新**：2026-10-09（**0.3.23 已发布：保真优化四连轮 F1-F4**——F1 动画：新基准 fidelity-anim（原版实机轨迹采集），腿部/层序两处字证修正，composite 97.85→99.97；F2 物理驱动序：探针实证原版 step() 帧序（doors→wg→fb→设备逆序→Step），金轨迹 5 关位级零漂移、7/48 非金关相位对齐、det-f2 48/48；F3 视觉：相机 setBounds 小于视口致 scroll 被钳 (32,32) 的 16px 全局偏移根因修复（差分最优偏移归零）+ 门锚点 0.5（Box2D enable 副作用）+ 平台灯罩第 4 子节点 + 8px 软阴影，visual 94.31→95.20 零偏移；F4 响度：master 0.1 + 逐键对齐原版（新基准 audio-loudness，before 10 键失配→after 12/12 + runtime 0.1）；e2e started 门禁竞态修复（改读权威相位），movements.json 澄清为冒烟脚本、胜利链走 FW_DEBUG_FORCE_DOORS。报告 §二十六，release/0.3.23.md。已推送 main + tag 0.3.23 + GitHub Release）

**更新**：2026-10-08（**0.3.21 已发布：性能专项四轮**——R1 服务端物理 step −90.4%（根因：vendor 引擎在 node:vm 沙箱求值慢 ~7 倍，改主上下文 new Function 求值；bonus_2 单步 28.8→2.4ms，重关慢动作消失，物理**位级一致**：48 关全刚体 f64 哈希链门禁 + fidelity 84.31 零漂移）；R2 快照路径量化后确认已最优（Colyseus setter 相同值短路，sync+encode 占 tick ≤2%）；R3 客户端加载四件套（音频懒装载/brotli/immutable 分级缓存/vendor 分包：冷启动传输 6909→4858KB，reload 408KB→3KB）；R4 装载/内存验证收口（建房 8-21ms、GC 摊销 0.02ms/步、60s 浸泡 60fps 堆稳定）。新增基准 perf-step/perf-determinism/perf-load（benchmark/README）。对比报告 note/report/perf/2026-10-08-perf-optimization.md。e2e PASS 0 错误、83/83、视觉 94.61（噪声带内）。剩余待办不变：移动端触控（M）、单机同屏（M-L 待产品决定））

**更新**：2026-10-08（**0.3.22 已发布：M2 触屏虚拟按键**——左下左右/右下跳三键，Pointer Events+指针捕获多点同按，合成输入码与键盘同源合并（协议零变化）；粗指针或 ?touch=1 显示，DOM 覆盖层不进画布；iOS 100dvh 假全屏。自动化触摸 e2e 六项全过（iPhone 设备描述符：tap 跳跃 Δy=53.7px、按住右移 Δx=344.6px、桌面不创建、零错误）；83/83 + 标准 e2e + 视觉 94.61 持平。**M2 剩余 [人工] 项：樱花穿透注册/隧道联调 + 双手机真机验收（含 iOS Safari/Edge 实测）**。同日稍早发布 0.3.21 性能专项（见上条））

## 你要做的事

1. **GitHub 私有仓库**（PLAN §11）：`gh repo create <名字> --private` 后推送本目录。官方素材仅供两人私用，仓库保持 private。
2. **试玩验收**（最有价值）：本机跑 `start.bat`（构建 + 起服 127.0.0.1:2567），两台设备各开浏览器进同一房间码 + 密码，验证：
   - 火人趟水应安然无恙、水女孩趟水应化烟（若反了 → 把 `packages/shared/src/level.ts` 的 `LIQUID_TILE` 里 water/lava 数值对调再试）；
   - 跳跃/移动手感，偏差则调 `packages/shared/src/params.ts`（唯一调参入口，注释齐全）；
   - 渲染观感：角色大小（`BootScene.ts` 的 `PLAYER_SCALE`）、头部与腿部对齐偏移（`GameScene.ts` 的 `headLift`）。
3. **开发模式热重载**（改代码时用）：终端 A `npm run dev:server`，终端 B `npm run dev:client`，浏览器开 vite 显示的端口（5173 已设 strictPort，被占会直接报错而不是悄悄换口）。
4. **M2 预备**：注册樱花穿透、领免费隧道（HTTP 类型 + 海外建站节点 + 免费子域），配置卡在 [PLAN.md 附录](PLAN.md)。

## 已知限制 / 技术备注

- **断线重连**：服务器冻结等待 60 秒。仅「网络闪断但页面没刷新」时浏览器会用内存里的重连令牌自动回座；**刷新/关闭标签会丢失令牌**，对方需等 60 秒超时后重新进房。如需刷新也能回座，M2 可把令牌存 sessionStorage。
- **房间码 = Colyseus roomId**（9 位随机串），未做 6 位短码映射；需要更短码时在房间层加映射表即可。
- **插值**：指数平滑（自己 22/s、对方 12/s 的收敛速率），局域网够顺滑；公网要顺滑需升级为 100ms 快照缓冲插值（M3）。
- **bat 脚本编码坑**（改动 start*.bat 前必读）：cmd 按 GBK 解析批处理，**禁止用 UTF-8 保存含中文的 .bat 或加 `chcp 65001`**——UTF-8 中文字节按 GBK 解码会撕裂整行命令（症状：双击窗口一闪而过，报 `'xx' 不是内部或外部命令`）。正确做法：文件存 **GBK 编码 + CRLF 行尾**，不写 chcp。生成方式：UTF-8 写临时文件后 `iconv -f UTF-8 -t GBK`，再 `sed -i 's/$/\r/'`。
- **Colyseus 版本坑**（重要，升级前必读）：
  - `colyseus` 必须钉 `0.16.0` 整版——0.16.1+ 硬依赖 git 仓库的 uWebSockets transport，npm 12 默认拒绝装 git 依赖（EALLOWGIT）。
  - 所有 colyseus 运行时导入统一从 `packages/server/src/colyseus.cjs.ts` 走 require 链；直接 `import "@colyseus/ws-transport"` 会加载它的 ESM 入口，与主包分裂成两个 core 实例（症状：seat reservation expired）。
  - Schema 子类字段一律在 `constructor` 里赋值；tsconfig 已设 `useDefineForClassFields: false`。
- **渲染**：0.2.0 起为像素级复刻（配方逆向自原版 init.js，见下「视觉复刻坑」）。角色 `PLAYER_SCALE=0.95`（原版实测），legs/head/glow 同锚点同心叠加，（0.3.0 重写后无独立脚底偏移常量，锚点即体心）。
- **联机架构决策**（为什么重写而非改造原版 HTML，含 Steam 官方版对比实证）：见 [multiplayer-architecture.md](multiplayer-architecture.md)。核心：原版是 2.27MB 混淆黑盒、按键转发必然漂移、联机必须有权威状态源——官方 Steam 版也只有本地双人 + 串流，无原生在线联机。
- **IDM 防护（开浏览器自动化前必须先部署）**：IDM 按 URL 媒体扩展名在网络层劫持（204/0 字节，`--disable-extensions` 无效）。正片音频已走无扩展名路由 `/assets/audio/s/:name`（`BootScene.ts` 加载、服务器 `index.ts` 补 `.mp3`）；自动化访问原版参考页须浏览器内 `page.route` 拦截媒体 + 代理 204 + 屏蔽外联，详见 ADR 附录。
- **视觉复刻坑**（改 GameScene/BootScene 前必读）：
  - **图块集必须预取后同步供给** `parseLevel`——直接把 fetch Promise 传进 TilesetProvider 会让 `tileTypeOf` 全部失败，所有地块退化成实心（液体/斜坡消失）。见 `main.ts` `fetchLevel`。
  - **帧名陷阱**：Phaser `texture.get(不存在的名字)` 静默返回图集第一帧（GroundAssets 是 `BeamDust0000`），不报错。MaskBox 实心帧是 5 位数字（`MaskBox00000`~`00003`），decor 帧带 `0000` 后缀（`decor_X0000`）。
  - **机关 gid 是图块集本地 id**：parseLevel 输出 `原始gid − Objects图块集firstgid(24)`，即本地 0=推块、2=拉杆、4=推箱（GameScene.buildMechs 有注释）。
  - **液体行扫描**：run 结束时循环变量已归 0，液体族必须取 run 起始格的值（buildLiquids）。
  - **内嵌浏览器 rAF 冻结**：遮挡/后台页签 `visibilityState==="visible"` 但 requestAnimationFrame 永不触发，Phaser 场景队列卡死（`loop.frame=0`）。已用 `fps:{forceSetTimeOut:true,target:60}` 修复，别删。
  - **场景数据传递**：Phaser `settings.data` 未传数据时是 `{}` 不是 undefined，`??` 兜底永远不触发——统一走 `globalThis.__fwInit`（main.ts 注入）。
  - 原版层序/坐标公式/动画帧率全部记录在 GameScene.ts 头注释与各 build* 注释内；验收对照样张在 `note/report/visual-0.2.0/`。
  - **顶部藤蔓时钟是正计时**（00:00 起已用时间 MM:SS，原版实拍 f3/f4 实证，a26308c 纠偏）——别改回倒计时。
  - **已知行为差异**：原版参考页（8099 魔改版）教学文字渐进显示，我们按真实原版静态全显；原版有动态变焦相机（minScale≈全景），我们固定 1280×960（0.3.8 起对齐原版几何）。
- 服务器只绑定 `127.0.0.1`，公网访问必须走穿透隧道（wss 由隧道 HTTPS 自动升级，客户端 `net.ts` 按页面协议自适应）。

## 里程碑进度

- [x] M0 环境/侦察/骨架
- [x] M1 联机最小闭环（本版）
- [~] M2 樱花穿透联调 + 手机浏览器适配（触屏虚拟按键 0.3.22 已落地并自动化验证；穿透注册/真机联调待 [人工]）
- [x] M3 全机关数据驱动（梯子/推箱/球/激光等按 gid 枚举）+ 快照缓冲插值 + 存档/计时最优记录
- [x] M4 多关卡选择与结算画面打磨
- [x] M5（选关/结算已落地；快照缓冲插值与触屏保留待办） 联调收尾与体验调参

## 2026-10-04 使命调整与调研纠偏（新增，只增不改正文）

**当前使命**：尽可能忠实复刻原版 HTML5《森林冰火人1：森林神庙》（基准 = 本地参考包 `Fireboy-and-Watergirl/output/A/`，注意其含 4399/镜像注入段，甄别方法见 research 01 §0）。联机架构（服务端权威 Colyseus + Phaser3 客户端）不变；**"复刻保真度"自此为唯一验收维度**，"能通关/看着像"不再充分。调研全文见 [research/2026-10-fidelity/](research/2026-10-fidelity/)（00 总览/接续指南、01 原版引擎规格、02 逻辑审计 E1-E20/G1-G15/M1-M12、03 素材保真、04 外部资源与方法论+服务端 Box2D 可行性）。

**本文件（及发布说明）中被调研推翻的旧表述**——正文保留原文不删，以本节为准：
1. 「你要做的事」第 2 条的 LIQUID_TILE 存疑：5=水(杀火)/6=岩浆(杀水)/7=绿泥(双杀) 已三方证实**方向正确，不必对调**；反而是那句验收文案写反了——原版**火人趟水必死、水女孩趟岩浆必死**（01 §2.2）。
2. 「视觉复刻坑」"教学文字静态全显=真实原版行为"：**错**。原版是触发式渐进淡入（02 E20：setupTutorial visible=false + 进入触发矩形 400ms 淡入）。"顶部藤蔓时钟正计时"仍正确。
3. 0.2.0 发布说明自我批判的"液体下半格实心/世界封底"**不是魔改**，恰好是原版行为（02 G15）；真正的魔改是自动上坎 E3、拉杆冷却 E6、钻石半径 40 E17、原地复活 E1。
4. 0.1.0"首关 forest_02：4 拉杆 + 2 移动平台"：实测 = 4 按钮 + 3 平台 + 2 摆绳、**0 拉杆**（01 §5）。
5. forest01-route.md 的拉杆"0.6s 冷却/站柱再翻转"机制与其摆渡方案：是**复刻自身行为**的观测，原版不存在（02 E6）；route 笔记不可再当原版依据（其坐标变换、图块集预取等工程性结论仍有效）。
6. params.ts 的"实测/原版提取"类注释多为自证：coyote/jumpBuffer/doorTolerance/leverCooldown/diamondRadius/liquidInset 无原版对应物；**平台速度原版实际 64px/s（runtime motorSpeed ±2），我们的 16 是 4 倍慢**（02 E7/G1-G7，AS3 源码独立佐证）。
7. 顶部「M1 联机最小闭环（本版）」之后插入了一个未记里程碑：0.2.0 = forest_01 像素级视觉复刻（非 M2）；M2 尚未开始。

**对后续 AI 的三条硬规则**：
- 任何"复刻 X 行为"的改动，先引 research 01/02 的原版证据；证据不足则按 04 §B 建对拍基线实测，**禁止再用对复刻自身的观测当原版依据**。
- 修复优先级见 00-overview §"接续工作优先级"（规则层→解析层→状态同步→物理模型层→接线补齐→机关全覆盖批次）。
- 物理内核大切换（planck / @cocos/box2d / 重写力模型三选一）在基线建成前**只做实验、不做迁移**。
