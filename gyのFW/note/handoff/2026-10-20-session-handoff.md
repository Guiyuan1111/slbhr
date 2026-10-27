# 2026-10-20 AI 会话交接简报（新开发会话开工指令）

> **2026-10-27 时效注**：本文门禁数字为 2026-10-20 快照（现役：vitest 260 例、三部 det 48/40/51、route-node 为真服回放主力）；light 路线产线已收官（0.3.49）。最新现状以 [../handoff.md](../handoff.md) 顶部条目为准。
> 写给接手开发的 AI：这一份是你的开工说明书。读完再看 [../handoff.md](../handoff.md) 置顶条目（滚动动态）与 [../00-INDEX.md](../00-INDEX.md)（总导航）。本简报写于 0.3.40 发版后，与仓库 HEAD 同步。

## 0. 使命与项目定位

- 项目：Fireboy & Watergirl 森林神庙**完全复刻**，服务端权威在线双人版。仓库 `slbhr`（私有，禁公开/禁分发；官方素材仅私用，衍生资产同样）。
- **立身原则：完全复刻是默认**——一切表现/行为以 oracle 字节为唯一真相源；"优化原版不合理处"是例外工作线，**任何一项必须先经用户审核批准才可实施**（提案池：[../research/2026-10-behavior-parity/16-original-improve-proposals.md](../research/2026-10-behavior-parity/16-original-improve-proposals.md)）。
- 用户协作模式：游玩协作（用户实玩→报告差异→oracle 仲裁→修复）+ 审批流（提案卡→用户审→批准派槽→完成回验收）+ 并发多槽开发（flash-prep 子 agent，**并发上限 5**）。

## 1. 铁律（违反即事故）

1. **oracle 严格只读**：`/home/gy/桌面/dev/slbhr/Fireboy-and-Watergirl/` 一个字节都不能写。bundle `init.eb02fbdab2aa1d24.js`（~2.22MB latin1）是唯一真相源，行号引用格式 `:2152850`。
2. **git 纪律**：细粒度 commit；**禁 co-author**；**禁 `git add -A`**（只 add 自己的文件）；多槽共享 index **禁 git reset**（用 pathspec 限定提交）；index.lock 冲突等 2s×10 重试；发版四件套=根 README 版本段+`note/release/<版>.md`+handoff 置顶条目+注解 tag。
3. **子 agent**：统一 `flash-prep` 槽、后台派发；派单必须含：文件域边界（防撞车）、门禁红线、TEMP 清理、回摘要格式。
4. **TEMP**：一律用项目内 `TEMP/<槽名>/`，用完必须清理（多次实测纪律）。
5. **本机账号凭据**只在用户全局 AGENTS.md 里，**勿写入任何仓库文件**。
6. **模型为文字模型**：禁止读取图片/截图；一切视觉对拍走数字管线（像素分块差分/显示列表 dump/字节对照）。
7. 版本号只进不退；tag 用注解 tag 随版打。

## 2. 架构 60 秒

- monorepo `gyのFW/`：`packages/client`（Phaser 3.90 + Vite，DOM 连接界面 index.html/main.ts 与 9-ID 契约）+ `packages/server`（Colyseus，60Hz patch + dead reckoning，房间 `ForestRoom.ts`）+ `packages/shared`（Box2D 确定性内核，det 48/48 位级锚 r0-baseline）。
- **门禁全家桶（发版前必须全绿）**：tsc 0 错 / build / **vitest 126/126**（含 48 关行为测试 STRICT=true + ForestRoom 集成测试 13 例）/ **det 48/48 `--compare r0-baseline`** / census 18,446 PASS / e2e `route.mjs f01+f12 --repeat1`（本机标定 `--offset -15`）/ journey 7/7+pause 9/9+rejoin 3/3+deathretry 4/4+rolesplit 6/6 / touch 6/6 / visual-diff（**新口径带 90.55–92.86**，截帧隐 `#hud/#menu/#toast`，与旧带不可直比）/ ID 契约探针 14/14 / `npm audit --omit=dev` 0 critical。
- oracle 参考库可起（8787 冒烟口径）；我方服务器只绑 127.0.0.1。

## 3. 当前状态（2026-10-20 收盘）

- **版本 0.3.40**（tag 已推）。0.3.36→0.3.40 五版主线：连接界面精修 → UI 转场对齐（黑幕/弹簧/按压/结算拍链/MenuScene idle）→ 审计修复批（相机语义/机构子精灵/音效六件/暂停静帧）→ 转场遗留收尾（NewSign/LoaderBar/板缩放/R 键）→ **issue 批 17 修**。
- **GitHub issues 20/20 关闭**（17 修+3 证伪），处置档案 [../issues-2026-10-20/00-INDEX.md](../issues-2026-10-20/00-INDEX.md)。
- 档卷新增：38 全 48 关视觉审计、39 量具漂移定谳（量具 bug：#hud 入镜，已修口径重定带）、40 修复验收取证（oracle-vs-我方并排图）、14 音效审计、15 镜头 VFX 审计、16 原版优化提案池。
- 关卡账目：绿 8+豁免 15+挂起 2=**终态 25/48**（全名单在根 README"关卡账目"段）；forest_05 判死路待审、forest_25 豁免候选待追认。
- 原版优化线已立：T7（关音乐全静）与 P-02（全收集庆典）已裁按上述语义定版，**勿翻案**。

## 4. 待用户裁决（只列不擅动）

| 项 | 内容 |
|---|---|
| P-01 | twoRows 隐藏行照发音→改静音（S，16 号档） |
| P-03 | 缺陷关批量重设计范围（15 豁免+02/32 挂起；L×N 大工程） |
| S5 | 机器探索线索①②限时续攻→不行切 B 方案（绿迹提取，降半自动；断点 `research/2026-10-autoplay/tools/r5.search.json`，取证台 probe8c.mjs 复活先自证） |
| 公网穿透 | 选型未定 |
| forest_05/25 | 处置待裁 |
| colyseus 0.18 | 破坏性升级，需独立分支+全门禁，待立项 |

## 5. 下一波开发队列（可直接开工）

1. **A 槽移交客户端余量三项**（见 [../issues-2026-10-20/A-server-room.md](../issues-2026-10-20/A-server-room.md) 移交节）：won 重连不重触发 onPhase 致面板不重开 / 本地幽灵渲染 / HUD 文案。
2. **T10 平台音实例管理**（S-M，14 号档；随机制批）。
3. **f12 winAt 确定性右移 ~268ms** 静窗复测（P-02 档卷 §存疑；det 位级一致+服务端零触碰佐证非回归）。
4. 已收口勿重做：L-03/L-06/M-03/L-07/H-03；**不推荐**：F4 地砖随机场逆向（L 成本零观感收益）、彩带发射器（性能面挂账）。

## 6. 血泪教训（前人踩过的坑，勿再踩）

- **静态审计会误报（已四例）**：冰膜"缺失"=对拍器不合成祖先组可见性的伪差；杆灯"不应旋转"=局部角伪语义；#22 MuteButton=oracle 死代码；#17 TempleSelector=multi 形态专属。**动码前必须对 HEAD 做字节级复核**，档卷结论也可能是错的。
- **仪器会撒谎**：量具结论要与字节链互证（visual-diff"漂移"实为 #hud 入镜；"DOM 不入镜"假设已证伪）。
- **git tag 字典序陷阱**：`git tag -l | tail -5` 抽样会误判覆盖范围（0.3.10 < 0.3.7）。
- **Edit 工具**：并发槽改动后报 "File has been modified" → 重读再改；长表格行编辑用 python 行级手术更稳。
- **时序类自动化**：等待条件用状态轮询，禁写死 sleep；首跑瞬态 FAIL（并行争核）同命令复跑即绿，归因前先静窗重跑。
- **`?pw=` 深链**有兼容消费者（旧书签/benchmark/perf-idle）——改连接面先查深链依赖；新增 DOM 文案会触发 census used-chars 断言，按自述刷新计数是合法收尾。
- ** COMPLETE 场景（P-02）语义**=全 48 关 3 星 100% 一次性庆典（用户已裁按原版）；因豁免关不可通关，实际几乎永不触发——**这不是 bug，勿"修复"**。
- det/fixtures 是物理红线：表现层修复也必须跑 det 48/48 证明零物理交集。

## 7. 文件速查

| 要找什么 | 位置 |
|---|---|
| 开工顺序 | 主 README 版本段 → [../handoff.md](../handoff.md) 置顶条目 → [../00-INDEX.md](../00-INDEX.md) → 各域索引 |
| 行为复刻（主域） | [../research/2026-10-behavior-parity/00-INDEX.md](../research/2026-10-behavior-parity/00-INDEX.md)（01–16 号档+§3 挂账+§4 性能速查） |
| 保真档卷（01–40） | [../research/2026-10-fidelity/00-INDEX.md](../research/2026-10-fidelity/00-INDEX.md) |
| issue 处置 | [../issues-2026-10-20/00-INDEX.md](../issues-2026-10-20/00-INDEX.md) |
| 提案池（先审后行） | [../research/2026-10-behavior-parity/16-original-improve-proposals.md](../research/2026-10-behavior-parity/16-original-improve-proposals.md) |
| 自动通关线 | [../research/2026-10-autoplay/00-INDEX.md](../research/2026-10-autoplay/00-INDEX.md) |
| 发版记（0.3.1–0.3.40） | [../release/](../release/) |
| 逐日开发日志 | [../handoff/](../handoff/)（archive-2026-10.md 10-05→10-19 全量） |
| 服务器档案 | [../ubuntu-server-profile.md](../ubuntu-server-profile.md)；健康探针 `/healthz`；deploy/ 样例可选 |

## 8. 开工建议（第一条指令怎么下）

1. `git log --oneline -15` + 读 [../handoff.md](../handoff.md) 置顶三条 → 确认无在飞槽残留（工作树应净）。
2. 跑一遍门禁冒烟确认环境：`npm run build` + vitest + det（数字对照 §2）。
3. 从 §5 队列挑活或等用户新指令；涉及"原版优化"一律先出提案卡。
