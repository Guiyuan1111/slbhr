# handoff — AI 会话开工现状源 + 滚动日志

## 文件规范（2026-10-20 起生效）

- **定位**：本文件是 AI 会话开工时的现状速览源 + 滚动日志；只保留近 5 天条目，更早的下沉归档。
- **条目插入规则**：新条目置于文件顶部第 1 行（本规范头之下、条目区首位），全文件保持时间倒序。
- **条目格式（本日起强制）**：新条目必须多行结构化——
  - 首行：`**更新**：日期（主题一句话）`；
  - 随后接编号小节（①②③…），每小节 1-3 行，只留结论、关键数字与指针；
  - 单条目 ≤2000 字符；超长细节（证据链/引文/逐项清单）写入 `note/` 对应档卷，此处只留档卷路径指针。
- **归档规则**：条目老于 5 天，或本文件 >40KB 时，把最旧条目逐字原样迁入 `note/handoff/archive-2026-10.md`（插在该归档头部说明行之后，保持时间倒序）。

## 归档导航

| 范围 / 主题 | 去处 |
| --- | --- |
| 2026-10-05 → 10-14 条目 | `note/handoff/archive-2026-10.md`（前半段） |
| 2026-10-15 → 10-19 条目 | `note/handoff/archive-2026-10.md`（头部第二段，2026-10-20 迁入） |
| 2026-10-04 保真重写开工交接（需求冻结+Box2D 提取侦察） | `note/handoff/2026-10-04-fidelity-rewrite.md` |
| 2026-10-04 执行期需求冻结（三轮问答 12 项全冻结） | `note/handoff/2026-10-04-execution-freeze.md` |
| 2026-10-15 Windows→Ubuntu 移交接管简报（新会话开工指令） | `note/handoff/2026-10-15-ubuntu-takeover.md` |
| **2026-10-20 AI 会话交接简报（新开发会话开工指令，当前有效）** | `note/handoff/2026-10-20-session-handoff.md` |

今日（2026-10-20）起新条目写在文件顶部。

## 条目

**更新**：2026-10-23 下午（P-03 S 档试点开工：蓝图落地，数据改待下窗口；全程无子 agent）
① 用户裁决落地："按照你的建议进行开发"=P-03 S 档试点（14/14_1）获批 + forest_05 剔出缺陷关线转复活预案；colyseus 升级两路与 48 关量具仍未裁不动。
② S 档实施蓝图已落 17 号档 §6：门台/双楔/高台对象在 forest_14.json Ground 层逐格定位；三案推演结论=任何单案不足（升量缺口 3.8-7px 与楔面过顶相互咬合），最小可行组合预计乙±丙；验证工序六步（内核探针→路线续攻 f1945→MC≥98%→route e2e→分叉建档）。**数据改与探针实测须成对**，本窗口时间不足未动数据。
③ forest_05 口径勘误：根 README"判死路呈证待审"→复活预案线（05 号档 oracle ORACLE_SOLVED/06 号档 WIN@f1738）。
④ 14:00 高峰期停工令执行：7a0577a 提交后停，工作树净。

**更新**：2026-10-23（0.3.43 发版：M12 相机接线+交接复查批+四槽开发）
① 交接审查：0.3.41/0.3.42 交接 AI 成果合格（核心门禁亲核+四高风险 diff 逐 hunk 无实质缺陷），唯一失配 DEPLOY.md Node 版本已修（233e3d3）；盲区补验 e2e 11 跑 11 PASS/视觉带 91.11-92.45 无位移/H4 内存有界证实——证据 [evidence/2026-10-23-recheck/](evidence/2026-10-23-recheck/) 01-04。
② M12 相机子系统接线落地（ec3e057）：GameScene 2102→1950 行，视觉带 repeat5 中位 92.53 无显著位移，M12 剩共享 DTO 接线（草案 9eaf451 已备：8 类 48 字段+21 例漂移单测）。
③ 验收自动化：M4 clipboard 抽模块+7 例（e6a47e8）；M3 journey bgm 场景 12/12（c287bc3）；CI actions v4→v7（9813dc2）。
④ 待用户裁决四件：P-03 范围（17 号档：S=2/M=8/L=15-18 关，双口径警示真可通关仅 11/48）；forest_05 口径张力（oracle 实机已解 vs README 待审）；colyseus 0.18 立项（调研档 8b218cf：L 级 2.5-3 槽，B3 onLeave 语义坑+无中间态；Plan B=nanoid overrides 0.5 槽）；48 关视觉量具扩种。
⑤ 发版：0.3.43 门禁全绿（217 用例/det48/e2e 十场景/route f01+f12/audit 0 critical），release note [release/0.3.43.md](release/0.3.43.md)。

**更新**：2026-10-21（**🚢 0.3.42 发版：M12 渐进拆分 + T10 平台电机声 + A 槽 L-02/L-01 + P-01 静音**。①M12 按用户裁定走渐进拆分：机关平滑 `scenes/mechSmoothing.ts`、快照字段校验 `snapshotValidation.ts`、平台声 `scenes/platformSound.ts` 抽为纯模块并接入，新增 14 例单测；相机子系统与共享 DTO 仍挂账（见 `note/audit/2026-10-21-code-audit/02-medium.md`）。②T10 平台电机声由全局单发改为逐台实例（起步/限位停/反向重启），SHUTDOWN 与整轮复位统一释放。③A 槽：L-02 won 相位刷新/重连回座补开结算（`openEndMenu`+`endMenuShown` 幂等），L-01 终局爬梯幽灵隐藏；L-01 因共享工作树卷入 `5225d74`，未改写历史，归属见 `note/issues-2026-10-20/A-server-room.md`。④P-01 按用户裁定：twoRows 隐藏钻石行保留空拍但静音。⑤门禁：16 文件/172 用例、build、det 48/48 位级一致、e2e pause 11/11·leave 3/3·refresh 3/3·wonrefresh 6/6·rejoin 3/3；f12 repeat3 ALL PASS（winAt 12989/13477/12967ms，判定墙钟抖动，0.3.39 ~268ms 存疑按环境漂移结案）。⑥版本四处+lock+README 统一 0.3.42，发行说明 `note/release/0.3.42.md`；遗留：M12 相机/DTO、LAN 剪贴板手测、速度关 BGM 听感、烘焙内存峰值、真机触屏/弱网。）

**更新**：2026-10-20（**📋 交接简报就位（用户令"写好文档，交给另一个 AI 开发"）**——`note/handoff/2026-10-20-session-handoff.md`：使命与立身原则（完全复刻默认+原版优化须先审后行）/八条铁律/架构与门禁全家桶数字（vitest 126·det 48/48·新口径带 90.55-92.86）/0.3.40 收盘状态/待用户裁决六项/下一波队列（A 槽客户端余量三项+T10+f12 复测）/八条血泪教训（审计误报四例·仪器伪差·tag 字典序·深链兼容等）/文件速查/开工三步。归档导航已登记，总导航快速定位已挂。后续会话以该简报为开工第一读物，动态仍看本文件置顶条目。）

**更新**：2026-10-20（**🚢 0.3.40 发版：issue 批 20 条收官（17 修+3 证伪）+P-02 全收集庆典+L-06 版本收口——协调方统一发版**。①issue 总账：17 修（B-01 时基漂移 Blocker/H-01/H-02/M-01/M-06/L-01/L-02 房间七件；M-02 路径穿越/M-04 孤儿/M-05 生产链/I-01 healthz/I-02 vitest 5.0.5/L-04 密码门槛 基建六件；H-04 重连/L-05 邀请链接/L-04 客户端半 DOM 三件；M-03 STRICT+13 房间测试/L-07 调试定时器/L-03 注释对齐 门禁真实化三件）+3 证伪关闭（#4/#10 子项/#20 余量）；总表与逐条 hash 见 `note/release/0.3.40.md`+`note/issues-2026-10-20/`。②**P-02 落地含字节真相修正**：oracle firstComplete=全 48 关 3 星 100% 首次达成庆典（非单关首通，提案前提有误已按字节改）；星门保留在置位侧；fw-gamecomplete-v1+firstComplete 双旗；呈现 launch=oracle bare start clearWorld=!1 等价；semcheck 11/11（evidence/p02-complete）。③门禁总态 vitest 126/126/det 48/48/f01+f12/journey 全套/touch 6/6/visual-diff 92.54 带内/audit 生产树 0 critical。④L-06 收口：根/三子包/lock/README 统一 0.3.40，#17 关。⑤f12 winAt 确定性右移 ~268ms 存疑挂账（det 位级一致+服务端零触碰，P-02 档卷 §存疑）。⑥用户审批流新例：P-02 按批准字面实施但字节真相与提案前提有出入——后续此类"批准后字节修正"一律如本条方式显式回呈。）

**更新**：2026-10-20（**⚖️ 新工作线开启+首裁：原版不合理优化线（用户令"关音乐就该全静…优化之前原版不合理的地方，必须经过我的审核"）**。①方针：此类优化正式立线，**任何一项必须先经用户审核批准才可实施**；流程=提案卡（证据/改法/影响/成本）→用户审→批准派槽→回验收；基线关系=保真为默认、优化为例外且逐条裁定。②首裁 **T7**：关音乐即全静，保留我方 music 门覆盖胜负短曲，不做 oracle 免门忠实向（14 号档 §未实施 已改"已裁保留偏差"）。③提案池开张：`note/research/2026-10-behavior-parity/16-original-improve-proposals.md`——P-01 twoRows 隐藏行照发音（S）/P-02 CompleteScene 触发语义（原 #34 并入，S）/P-03 缺陷关批量重设计（15 豁免+02/32 挂起，L×N 须裁范围）/P-04 征集机制（issue 带 original-optimize 即入池）；全部待审未动码。④issue 批进度：L-07 关（17/20）→M-03 关（18/20；STRICT=true 置红+allowlist 空【48/48 收集零异常，"假绿"机制成立但无真异常藏匿】+房间集成测试 13 例，vitest 119/119）；开放仅余 L-03（待 0.3.39 槽交还 GameScene）/L-06（0.3.40 发版时协调方收口）。）

**更新**：2026-10-20（**🧩 13 号档遗留八项收尾（0.3.39）——四修两划销，两划销系复核证伪**）。
①**复核证伪划销**（用户批复照准，证据链全文见 13 号档 §实施记录(flashp1)）：**#22 MuteButton=oracle 死代码**——全 bundle 0 实例化（UIState/LevelUI 两处 import 均被 IIFE 形参遮蔽，this.muteButton 3 处纯读零赋值），oracle 实际从不渲染静音钮，补件=背离 oracle；**#17 TempleSelector=multi 形态专属**——仅 MultiHall/MultiMenu 实例化（:1956494/:1961502），单机形态 startTemple 直 fade("levelMenu")（:1941847），我方单神庙形态本就该无此件。
②#13 NewSign（985914a）：TempleScene 节点静态贴片（+40/−20 布局尺无 tween）+progress played 集（fw-played-v1）+进关 markPlayed（oracle setPlayed :1935016 同语义，联机时点注记在案）。
③#41 LoaderBar（2ae3a9b）：BootScene buildLoaderBar 逐参复刻 :2164711（crop 200×20/Holder/Title anchor.47，进度≡onFileComplete 百分比同源，COMPLETE 销毁）；PreloaderAssets 两侧字节一致，+1 文件 ≈4KB。
④#9 板缩放自适应（c16e77e）：buildBoard 按 fixToCamera :1851667 公式 s=min(1,min(W/帧宽,H/帧高))；现视口 s=1 与旧值逐位恒等（零视觉差口径），行程恒等式不变形。
⑤R 键黑幕（9d1fdb5+92eb6de）：restartWithFade 模块级信封，__fwRestart/KeyR 键鼠同路归一（oracle 键盘仅 P 无 R，R 属我方 E1 扩展、retry 本走 fade）。
⑥门禁：tsc 0/build 3.98s/vitest 106/106（基线 95→106 系并行 B-infra 2e74e54 vitest 升级）/e2e f01=39468+f12=13075 PASS（f12 首跑 FAIL=末段 CDP 抖动，复跑+干净 worktree 复证非回归）/visual-diff 92.11 最优平移 (0,0) 同带/det 零物理交集。
⑦并行槽冲突两起处置入档（985914a 前身误入他槽 main.ts WIP 已拆分重做；update-index 相对路径教训）；#35/#34 范围外原样保留。

**更新**：2026-10-20（**🔨 审计遗留大批实施（0.3.38）——38/15/14 三档 10 commit，F1 前提复核被推翻系对拍器伪差**）。
①F1 冰膜复核修正：oracle iceGraphics 建时 visible=false（@1666560）、仅 55 型瓦片/光束冻结可点亮，森林 58 图 0 用例 ⇒ 恒不可见；38 号档「423 精灵缺失致像素差」判为对拍器未合成祖先组可见性的仪器伪差（与 F5 同族）——按字节语义落隐藏覆盖层，像素零影响，水体关分数上行预期作废。
②F3 四件逐 commit：hanging_base 同位第二精灵/wind_base_light 灯层(组色 tint)/pulley_base 改挂双板位(forest_04 实证 762px 错位)/lever_stick_light 换帧（「不随杆旋转」亦系对拍器局部角伪语义，旋转行为保持）。
③F2 相机 settled scroll 改 oracle 关卡矩形语义（checkBounds @1845100）：W·h<realW 钉关卡中心——44/48 关 ±16px 系统差归零，visual-diff 最优平移 (5,−6)→(0,0)、零偏移项 80.7→92.0。
④15 号档 Top3：平台灯组色 tint（221 台面五色）/风机关 base 400ms 延迟停帧+effect 相位常驻（oracle 400ms 窗 quirk 原样保留）/暂停全画面静帧（scene.pause("Game")+SHUTDOWN 钩子 resume，journey pause 9/9）。
⑤14 号档：T1/T9 复核划销（0.3.36/0.3.37 已覆盖）；落地 T2+T3（finishKey 选 bgm_finish_speed+终局补停 _speed）、T4（GameScene SHUTDOWN 统一停音收泄漏）、T5（fx=总静音三处同步）、T6（music Game 态即时，oracle 叠播 quirk 不移植记偏差）、T8（menuMusic fadeOut 500）；T7 待用户、T10 随机制批。
⑥门禁逐批全绿：tsc 0/vitest 95/95/det 48/48@r0-baseline/census 18446 PASS（F1/F3 纯精灵层物理零交集）/e2e f01+f12 PASS/journey pause 9/9/visual-diff 90.77→92.84→92.01→92.03 带内。
⑦commit 链：fa27b8b→8ad63f6→4cc9886→e6111e5→64b099d→04005a5→6884ba8→3477519→83a8bef→884457a+文档发版；档卷 38/15/14 各 §实施记录；TEMP/auditfix 已清。

**更新**：2026-10-20（**🔧 journey/touch 工具两件三查清账——挂账 §3-6 销账（`3caa1cf`+`ac1ee09`），新基线 journey 7/7、touch 6/6**）。
①journey「联机面板弹出并预选下一关」×2：按 0.3.12 活房间 advance 语义改写场景 1——旧断言随语义退役（继续=net.advance 同房换关，不再回大厅弹面板），新 7 项：phase=won 权威闸/双端 levelId 回声同房留场（房间码不变）/面板不弹出+EndMenu 关+Game 重建（0.3.37 黑幕 500ms×2 包络，全程状态轮询零写死 sleep）/ready→started/席位保留×2/权威时钟续走；修复前=1/3 后 Crash（menu 填充超时），修复后双跑 7/7 ALL PASS；self-acceptance §三 L3 行同步改写。
②touch「tap 跳跃 Δy=0」：定谳非内核开关/坐标换算——Playwright 1.63 `touchscreen.tap` 并发齐发 touchStart/End（coreBundle.js Promise.all），按钮同帧 down/up→两条 input WS 1ms 内到达→服务端 tick 意图跨度排水同一步消费对消（ForestRoom.ts:348-353；FW_DUMP 字证 `step=50 at=821ms up=true / at=822ms up=false` 同步对消，物理步采样 up=false）；纯页三路径+应用三层隔离+CDP hold 0-150ms 扫描全过佐证；探针改 CDP Input.dispatchTouchEvent 顺序注入+人手量级 90ms 按压（同款原语、touch 合成路径全真），Δy 0.0→30.7/32.5px 双跑 6/6 PASS。
③账面：parity INDEX §3-6 已迁销账区（编号保留防引用断裂）；connect-ui README §门禁数字/§既有问题两行注收口；挂账三件（journey×2+touch×1）全清。取证脚本与 dump 属临时件已清，字节证据已固化进 touch.mjs 头注+INDEX 销账行。

**更新**：2026-10-20（**🎬 UI 转场动画保真修复落地（0.3.37）——13 号档五批 25 项，等 38 号档完工信号后实施**）。
①换屏黑幕 state.fade（缺失 Top1）：新增 transition.ts FadeScene 顶景（500ms Linear 入/出+Loading 字 800ms/300ms 点循环+重入丢弃门，bundle 字节复刻），接线六换屏点，面板钮去即时 stop 由黑幕统一停；EndMenu/GameOver 出现保持裸切（oracle 同构非遗漏）。
②面板弹簧滑入（Top2）：buildBoard 去 Back.easeOut 改逐帧弹簧（2.3/0.7/1.5H/dt 钳 0.04）+黑幕跟板动态，六面同享；关闭滑出+Complete +1000ms 收尾+暂停解除 requestClose。
③按钮按压包（Top3）：StoneButton hover→按压语义+label 0.95+pusher 音（fx 门控），Menu Play/?/齿轮/菱形节点/BackButton/显示关卡数同族；DOM CSS hover 未动。
④结算面五件（Top4）：拍链 oracle 实参精确配对（twoRows 700/1400/1400/2100）、星碑分段 to_N 激活死代码键、popupArrow 末拍恒亮、Continue 同拍启用、时限 alpha 0.7；顺带修正 13 号档未察的 twoRows 隐藏行少一拍音偏差。
⑤MenuScene idle（Top5，**字节真相超审计记录**）：oracle 光柱 8 根 x 全 0=屏心堆叠扇（旧「柱间均布」2026-10-06 校准无 bundle 支持，已废重写），蜡烛 ×4 组挂屏心 lissajous（旧 yoyo 废），glow 归 1，头注勘误——布局变更已档卷注明，建议后续实机并排目验。
⑥门禁：tsc 0/build 3.80s/vitest 95/95/e2e f01+12 repeat1 PASS（winAt 39471/13461ms，f01 基线带零位移——黑幕不触服务端锚定时间线）/visual-diff 92.80 同带/det/fixtures 零物理交集。遗留 8 项（#13/#22/#35/#34/#41/#17/#9/R 键）逐项原因见 13 号档 §实施记录。
⑦commit 链：ef68c96(B)→283d976(D)→6e395b0(C)→fe3353c(E)→057cf4c(A)+档卷/发版；TEMP/uitrans-fix 已清理。

**更新**：2026-10-20（**🏗 文档结构优化（用户令"优化项目结构与 note 内容"）+ tag 缺口收敛始末**）。
①新增 `note/00-INDEX.md` 总导航（`38f8ffe`）：快速定位/五研究域/报告版本/规划方法逆向证据/归档导航；立规则——新研究域必带 00-INDEX 并登记、新挂账一律进行为复刻 INDEX §3。
②四研究域索引补齐（A 槽 `d5befc9`）：fidelity（35 档+tools 速查；27-29 缺号已注记）、autoplay（03 号档断点保留）、perf-hotspot、connect-ui 各得 00-INDEX；⚠ 已警示：fidelity 05 与 30-37 两期所用 bundle 版本不同（2,273,196B vs 2,218,873B），字节偏移不可互查。
③handoff 结构债清偿（B 槽 `2bea6ec`）：10-15→10-19 共 31 条逐字迁 archive-2026-10.md，本文件 77KB/最长行 4397 字符→6.8KB/29 行；零丢失双校验 PASS（条目数 34=31+3、字符数恒等、排序 md5 一致）；新格式规范头生效（多行结构化、单条 ≤2000 字符、5 天或 >40KB 归档）。
④§3 挂账 2026-10-20 重提取（C 槽 `29febc8`+本槽 `7900ab5` 后修正）：挂账 10 条+销账 3 条，旧六条逐条核最近证据不照抄；待核小件并册（journey/touch 三件、visual-diff 漂移、滤镜仿射四处、连接面板遗留两件）。
⑤tag 缺口收敛（**更正 2026-10-20 审计条目的错误观察**）：前条"tag 止于 0.3.9"系字典序+tail -5 抽样误读——0.3.10-0.3.31 一直有 tag；缺口仅 0.3.32-35 且远端已在（并行工作流所打），本地重打冲突后删重复+fetch 收敛；现 0.3.1-0.3.35 全覆盖 36 tag、本地=远端逐标签一致、四标签锚定正确发版提交；惯例=今后每版随手打注解 tag。§3 原 #11 已移销账区。
⑥根 README 对齐（`02183c0`）：0.3.35、vitest 应 95/95、det 锚 r0-baseline（旧 r32）、文档入口增总导航。遗留核毕（2026-10-20）：账目 25/48 对 handoff 归档 10-15 终裁条目核对属实（豁免 15=原 12+08/23/24 三案用户终裁保原样），README 已补豁免全名单并增 forest_05 待审项。
**更新**：2026-10-20（**🔍 文档-事实相符性审计（用户令"检查文档描述是否与事实相符"）——三处漂移全修正**：①README 版本段 0.3.34→0.3.35（滤镜版漏记）+战役行 r0–r7→r0–r11 补 r8–r11 续账一句；②00-INDEX §4 补 r8–r11 四行（并行战役 0.3.34 漏更索引）+标题/引言口径扩"七轮+r8–r11 续账"；③总账标题"七轮总账"→"总账（七轮收官+§八 r8–r11 增补）"。其余全查属实：13 个被引 commit 逐个 cat-file 存在、r8–r11 四报告/量具四件（perf-scene/idle/toolchain/gc）/总账 §八/0.3.33-35 发版记齐、templeTreeBake.ts+TempleScene import/menu-fit/setBusy 代码声明属实、connect-ui 与 fidelity 目录在库（fidelity 档卷无索引系既有惯例非漂移）；门禁复现：tsc OK/vitest 95/95/det 48/48@r0-baseline 2.3s/build 4.11s。观察项未动：git tag 止于 0.3.9+V0+checkpoint-20261014（0.3.10 起未打 tag，发版惯例待用户定夺）；00-INDEX §3 挂账口径自带"2026-10-18"日期声明系历史快照，r8-r11 挂账见 §4 与总账 §八。）
**更新**：2026-10-20（**🌳 选关树浮雕质感还原落地 `8e56200`+`fa17e12`（0.3.35 独立成版）——用户令"自己开发滤镜还原"；并行 r8–r11 战役 01:24 已切 0.3.34，滤镜提交落其上故另发 0.3.35**。①**兼修重大保真暗病：edges 按 `_id` 连接**（oracle bundle:45363-45364 实证）——旧 TempleScene byId(lv.id) 错连 47 条中的 41 条，树形长期大面积错接，1 星进度下不可见故未暴露。②新增 templeTreeBake.ts：BevelFilter（t=180/200、dir±1、outer）/OutlineFilter(3,0)/ColorMatrix(1.7×tint) 全链逐操作 fp32 CPU 移植——GLSL 循环展开（t=200→3 采样、t=180 fp32 累积→4 采样）、UV 裸步长怪癖换算（onePixel 声明未用）、半 texel 采样、unorm round-half-up、SAT 加速+分块行任务；create 平色兜底 + 8ms/帧分帧烘焙（全同步 ≈1.07s→分帧成立），完成 addCanvas 三纹理 big/all/done（深度 −7/−6/−5），节点/按钮/彩带未动。③oracle 对拍（同进度 1 星 1280×960）：47 边×3 中线点 49/49 |diff|≤10/通道、±3.2px 法向凹凸方向 50/50、密集区 778,496px 全通道 ≤10 占 97.56%（通道均差 ≤0.94）；层字节 vs oracle RenderTexture 回读 big 94.80%/all 97.02%/done 99.82%；残余偏差四处入档（水平仿射 ~1.5e-3+0.25px＝FilterTexture texel 1037 vs 逻辑 1036.8 假说存疑待核、边缘带 2.4% 亚像素相位、中线 ±2 窗 18 点未中但 ±10 门禁全过、金层近边采样认知修正）。④门禁：tsc ✓/build ✓/vitest 95/95（原 89 族+新 6 断言）/e2e f01 repeat1 PASS（winAt 39472ms）；与 r8 画布冻结改动（main.ts setBusy 面）零交集。⑤档卷 37 §滤镜还原（GLSL verbatim+三层配方 f()+对拍表+残余清单）+compare-temple.py 工具与 PNG 产物收容 tools/temple-tree/；TEMP 清、残留 http.server 8859/8846 已杀。跨会话协同闭环：对方 44be8f1 预记"滤镜槽在飞零接触、其 4 测试失败为其 WIP"——终态 vitest 95/95 全绿。）
**更新**：2026-10-20（**⚡ 性能战役 r8–r11 四轮收账 `3313403`→`a57532e`（0.3.34）——用户令"持续多轮性能优化+基准量化+报告"**。①r8 场景切换链（-11%：551→491ms 驻留配对；件1 连接忙期画布冻结 setBusy→loop.sleep+floaty 暂停/唤醒双路兜底且 wake 定位 bgWarmSettled 前【早醒有"唤醒税"】、件2 waitForLevelId 事件驱动 -49.5%、件3 temple.json 单例+预取 -93.3%、件4 fetchLevel 缓存；**换肤幕布性能税 +364ms/55% 归档**——pre-skin worktree A/B+CSS 注入 A/B，无 GPU 合成环境 blur 逐帧重算拥塞连接窗，连接期已回收、驻留期挂账真 GPU）；②r9 空闲 CPU 负结论（量具 perf-idle 六态：JS 面 script%<2% 地板、task%=软栅环境项、帧率上限弃件【fps.limit 经 smoothStep 在慢机砍帧 67→48/4s=视觉回归红线】）；③r10 工具链（vitest threads -12%、build 直呼 node 去 npm 层 -6.8%【dist md5 逐字节不变】；判负：sync-assets 增量【330ms 是 npm 层非拷贝】）；④r11 r0 §八挂账收口（**GC 份额 0-0.4%、无并发膨胀、166vs14=跨关伪影**；bonus_2 158ms/建=前 60 步固有收敛=vendor 禁区）。门禁：det 48/48+fixtures 6/6+vitest 89+e2e repeat3 静窗 ALL PASS（一次 1/3=并行负载污染自纠归因）+visual-diff 88.66-90.17 同带。量具 4 件入库（perf-scene/idle/toolchain/gc）+工具归档 perfopt{8,9}；报告 note/report/perf/2026-10-20-r{8,9,10,11}-*.md+总账 §八增补；勘误五条入档（驻留判定洞/唤醒税/bg 旗标/actualFps 计 tick/npm 层计时污染/观察者哑火）。挂账：幕布驻留税（前置真 GPU 口径——**本会话 sudo/su 均被禁 xorg9 不可复现**）、matchmake 点击派发管线（两态共有低优先）。注意：并行会话"滤镜槽"在飞（templeTreeBake.*/TempleScene 改动未入库），其 4 测试失败为其自身 WIP 非本战役面，零接触。）
