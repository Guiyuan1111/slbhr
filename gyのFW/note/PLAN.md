> **执行补充（2026-09-30）**：项目根目录为 `D:\Guiyuan1111\GitHub\slbhr\gyのFW`（原 fireboy-online 目录作废）。素材已拷贝至本仓库 assets/ 与 data/，无需再从旧仓库复制。M1 关卡定为 forest_02，M1 机关范围 = 拉杆(gid24) + 移动平台(type=platform)。

# 森林冰火人联机版（fireboy-online）开发计划书

> **⚠ 历史文档（2026-09-30 v1.0）**：本文是立项时的执行规范。其中 **D4「自写轻量 2D 物理」决策已于
> 2026-10-04 被保真重写推翻**（现为提取原版 box2d.js 的服务端权威内核），M1 关卡/机关范围等亦已调整。
> 现行事实以 [handoff.md](handoff.md)「2026-10-04 使命调整与调研纠偏」及
> [handoff/2026-10-04-fidelity-rewrite.md](handoff/2026-10-04-fidelity-rewrite.md) 为准；
> 本文保留作为决策沿革记录，勿据其开工。
>
> **进度补记（2026-10-20）**：项目已远超本文 M0–M5 框架——48 关全数复刻、物理复刻度 84.31/动画 99.97/视觉 95.20、
> 版本 0.3.35（选关树浮雕还原、石板大厅连接界面、性能战役 r0–r11 收账）。日常现状以 [handoff.md](handoff.md)
> 前置条目与 [README](../README.md) 版本段为准，挂账以行为复刻 [00-INDEX §3](research/2026-10-behavior-parity/00-INDEX.md) 为准。

**版本**：v1.0 · **制定日期**：2026-09-30
**执行者**：AI 开发主力（本文档的主要读者）；人类仅承担「验收、真机测试、手感反馈、穿透账号操作」四类事项（均以 `[人工]` 标注）。
**文档性质**：自包含执行规范。执行 AI 应能在不追问的情况下据此开工；需要人类介入的事项统一标 `[人工]` 并汇总到 `note/handoff.md`。

---

## 0. 给执行 AI 的使用说明

1. **严格按里程碑顺序推进**（M0→M5），每个里程碑有明确验收标准（DoD）。DoD 未全部达成，不得进入下一里程碑。
2. 一次只做一个任务；每个任务完成后：`typecheck` 通过 + 测试通过 + 细粒度 git commit，然后才做下一个。
3. 技术决策第 4 节为**定稿项**，不得更改（如认为确有问题，写入 `note/objections.md` 并继续按定稿执行）。
4. 所有调研结论、来源链接、历史教训在第 12、13 节。不确定的事先查这两节，再查外链，禁止臆测。
5. 本项目**仅限两人私下游玩**，不上线、不分发、不公开仓库。官方素材仅私用（见第 3 节）。
6. 每完成一个里程碑：在 `note/release/<版本号>.md` 写发布说明（遵循全局规则），并 `[人工]` 请求人类验收。

---

## 1. 项目目标

为《森林冰火人 1：森林神庙》开发一个**真联机**网页版：服务端权威模拟，两名玩家各在一台设备上各控制一个角色（火人/水女孩），共享同一关卡视角。

**场景优先级**（架构必须同时覆盖三者）：

| 优先级 | 场景 | 说明 |
|---|---|---|
| 理想 | 双手机 | 一人 iOS、一人安卓，浏览器打开链接即玩 |
| 次选 | 一人 Windows 开服 + 一人手机 | 同一架构，无需改动 |
| 保底 | 双 Windows | 同一架构，键盘操作 |

**与旧项目的关系**：`D:\Guiyuan1111\GitHub\Fireboy-and-Watergirl` 是旧仓库（官方游戏抓取 + GitHub Pages + 按键中继联机 v3，P1 已验收）。本项目是**全新重写**，不是对旧仓库做兼容。旧仓库保留两个用途：① 官方素材来源（见第 5 节）；② 桌面双人联机的过渡备胎（其 v3 中继方案在重写完成前仍可用）。

**重写相对旧注入方案的本质提升**：旧方案是"官方游戏页面 + 按键注入"（零物理工作，但只能键盘、无法正确适配手机、机关状态无法服务端管理）；新方案是"服务端权威 + 自研客户端"，目标是手机原生体验 + 存档/计时/收集系统。

---

## 2. 环境与玩家约束

| 项 | 值 |
|---|---|
| 人类玩家 | 2 人：开发者本人（新手，iOS 手机 + Windows 电脑）与伙伴（安卓手机 + Windows 电脑） |
| 手机 | 一台 iOS、一台安卓。iOS 上的 Edge 底层为 WebKit，兼容要求与 Safari 一致 |
| 服务器 | 开发者的 Windows 家用电脑，**玩前手动开服**（一键脚本），不做系统服务注册 |
| 网络 | 中国大陆；家庭宽带上行需 ≥5 Mbps（跑 Node 服务绰绰有余）；穿透用樱花（SakuraFrp） |
| 开发环境 | Windows + Git Bash；Node.js ≥18 LTS（若未安装 `[人工]`） |
| 人类开发水平 | TypeScript/Node 基本新手 → 代码必须对新手可读：不过度抽象、关键算法有中文注释、参数集中在单一文件 |

---

## 3. 使用边界（合规红线）

- 原版游戏 IP 归 Oslo Albet 所有。本项目使用的官方图集/音频/关卡数据**仅供两名开发者私下游玩**，禁止公开分发、上线、商用。
- 仓库必须设为 **GitHub 私有**。`assets/` 目录内容不得修改、不得二次分发。
- 面向公网的入口必须有房间密码（见第 5.5 节）。

---

## 4. 技术决策（定稿，不可更改）

| # | 决策 | 内容与理由 |
|---|---|---|
| D1 | 语言 | TypeScript 全栈（strict 模式）。服务端 Node ≥18 + Colyseus；客户端 Phaser 3。单一语言便于共享代码 |
| D2 | 架构 | **服务端权威**：服务端独占运行物理与全部机关逻辑（60Hz 固定步长），客户端只做输入上行 + 快照渲染。M1 阶段客户端**不做**任何本地物理与预测（M5 可选加自己角色的预测） |
| D3 | 同步 | Colyseus Schema 状态同步，20Hz 下发增量补丁；客户端维护 100ms 插值缓冲渲染远端实体。**不做帧同步**（跨设备 JS 引擎的浮点/超越函数差异是真实风险，且合作游戏无带宽压力） |
| D4 | 物理 | **自写轻量 2D 物理**（AABB 碰撞 + 瓦片地形 + 液体区域判定），不引入 p2.js/Box2D/Matter。参数从官方版本提取（见第 8 节），但实现自己写——新手可控、无依赖黑盒 |
| D5 | 关卡 | **关卡即数据**：直接加载官方 Tiled JSON。服务端读碰撞层与机关实体，客户端读渲染层。加关卡 = 放一个 JSON 文件 |
| D6 | 素材 | 官方图集（TexturePacker JSON+PNG，Phaser 3 原生支持）、官方音频 mp3。来源为本地旧仓库（第 5 节），无需联网下载 |
| D7 | 网络 | 静态页面与 WebSocket **同源单端口**；ws/wss 按页面协议自适应（`https:` 页面连 `wss://`，`http:` 连 `ws://`）——沿用旧项目 v3 已验证的做法，天然规避混合内容问题 |
| D8 | 部署 | 樱花穿透 1 条隧道 + `start.bat` 一键启动（Node 服务 + frpc）。隧道配置见附录 B |
| D9 | 断线 | M1：掉线冻结房间 + 客户端自动重连（Colyseus 内置）；M4 升级为暂停并保留座位 60 秒（`allowReconnection(client, 60)`），超时才释放 |
| D10 | 账号 | **无账号系统**。房间 = 6 位房间码 + 房间密码；进度存档为服务器端单一共享存档文件（两人共用一份存档，如 Minecraft 局域网世界） |
| D11 | 明确不做 | 不做账号/注册、不做大厅匹配（一房一码直连）、不做回放/观战、不做微信专项适配（浏览器打开即可）、不引入构建复杂度（Vite 够用，不上 monorepo 工具链） |

---

## 5. 系统架构

### 5.1 总体形态

```
[玩家A浏览器]──┐                                ┌── 静态页面（Phaser客户端）
[玩家B浏览器]──┼── 樱花隧道 ── 家中Windows ── Node服务 ─┤
               │   (1条)      (手动开服)         └── Colyseus 房间服务（权威仿真 60Hz）
```

### 5.2 仿真与同步协议

- 服务端固定步长 `dt = 1/60`，与渲染帧率完全解耦（旧开源实现 pavel-skala 裸用 rAF 导致 144Hz 下 2.4 倍速，是必须规避的反面教材）；
- 输入：客户端上行 `InputState { up: boolean; left: boolean; right: boolean }`，变化即发 + 至少 15Hz 重发（防丢包），带单调递增 seq；
- 快照：Colyseus Schema，20Hz；
- 客户端渲染：远端角色按 100ms 延迟的插值缓冲平滑绘制；自己角色在 M1 也直接绘制服务端状态（低速平台跳跃 50ms 级 RTT 下无感）。

### 5.3 房间状态（Colyseus Schema 草案）

```
RoomState {
  phase: "lobby" | "playing" | "paused" | "finished"
  levelId: string                // 如 "forest_02"
  tick: number
  timerMs: number                // 本关已用时间
  players: MapSchema<PlayerState>       // key = sessionId
  diamonds: MapSchema<boolean>          // 本关各钻石是否已被拾取
  mechanisms: MapSchema<MechState>      // 所有动态机关的权威状态
}
PlayerState { x, y, vx, vy, facing, anim, alive, atDoor }
```

机关实现要求：**任何影响玩法的状态（按钮按压、拉杆角度、箱子位移、平台位置、门开闭）都必须是服务端状态的一部分**并进快照。旧开源联机版"机关不同步导致合作关必然状态分裂"即为反面教材。

### 5.4 输入抽象（键盘/触屏同源）

```
InputSource（接口）→ KeyboardSource（M1）→ TouchSource（M2，左/右/跳三键）
```

客户端维护单一 `InputState` 并上行；来源切换不影响内核。触屏要求：`touchstart/touchend` + `preventDefault`，按钮布局左下（左右）右下（跳）。

### 5.5 鉴权与安全

- 房间创建时设置 4 位以上房间密码（`config.json` 可改默认值）；加入需 `roomCode + password`；
- 服务端限制：每房 2 人、单消息 ≤2KB、单连接 >30msg/s 丢弃、空房 5 分钟回收；
- 服务器只监听 `127.0.0.1`，公网暴露完全依赖樱花隧道。

### 5.6 存档（M4）

服务器端 `data/save.json`（单一共享存档）：每关 `{ unlocked, bestTimeMs, diamonds: [红,蓝], deaths, cleared }`。选关门户数据直接用官方 `data/forest/temple.json` 的节点坐标与 `edges` 解锁关系。

---

## 6. 目录结构

```
fireboy-online/
├─ packages/
│  ├─ shared/                 # 游戏内核（两端复用，零 Phaser/Colyseus 依赖）
│  │  ├─ src/params.ts        # ★ 全部物理/手感参数集中于此（唯一调参入口）
│  │  ├─ src/world.ts         # 固定步长仿真：地形AABB、重力、跳跃、液体判定
│  │  ├─ src/mechanisms/      # 机关类：button.ts / lever.ts / box.ts / platform.ts / door.ts ...
│  │  ├─ src/level.ts         # Tiled JSON 解析 → 碰撞网格 + 实体列表
│  │  └─ src/__tests__/       # vitest 单元测试
│  ├─ server/                 # Colyseus 房间、存档、静态文件托管、房间密码
│  │  ├─ src/rooms/ForestRoom.ts
│  │  ├─ src/index.ts         # http 静态服务 + Colyseus attach（同源单端口）
│  │  ├─ config.json          # 端口 / 默认房间密码
│  │  └─ data/save.json       # 共享存档（M4）
│  └─ client/                 # Phaser 3：渲染、插值、InputSource、虚拟按键、UI
│     ├─ src/scenes/          # Boot / Portal(选关) / Game
│     ├─ src/input/           # KeyboardSource.ts / TouchSource.ts
│     └─ src/render/          # 图集装载、插值渲染器
├─ assets/                    # 官方素材副本（只读，见第5节来源；禁止修改/分发）
├─ public/                    # index.html、样式（假全屏 100dvh、触屏布局）
├─ start.bat                  # [人工]一键开服：npm:start + frpc
├─ note/                      # 全局规则要求的笔记目录（含本文件）
└─ package.json               # npm workspaces: shared/server/client
```

npm scripts（根）：`dev:server` / `dev:client` / `build` / `typecheck` / `test` / `start`（= build + node server）。

---

## 7. 里程碑

### M0 工程搭建
任务：git init + 关联 GitHub 私有仓库 `[人工：建仓]`；npm workspaces 三包骨架；TS strict + vitest + Vite；从旧仓库拷贝 `assets/`（见第 5 节，只拷 assets 与 data，**不带** js/bower_components）；`start.bat` 骨架；README（含"仅供私用"声明）。
**DoD**：克隆后 `npm install && npm run dev:client + dev:server` 能打开一个空 Phaser 场景；typecheck/test 通过；commit 规范就位。

### M1 键盘联机 demo（1 关）
任务：
1. `shared`：固定步长世界仿真（地形碰撞、重力、跳跃、移动、朝向、液体死亡判定）；Tiled 解析器（Ground 层瓦片碰撞类型用官方 tileproperties 的 type 值）；
2. 关卡选取：解析 `data/forest/levels/*.json`，选实体最少的一关装载（大概率是教学关 forest_01）；
3. Colyseus `ForestRoom`：创建/加入/满员开局/掉线冻结+自动重连；Schema 按 5.3；
4. 客户端：图集装载、快照插值渲染、KeyboardSource（火人=方向键、水女孩=WASD）、死亡重生、双门通关、简化 UI（房间码/状态徽标）；
5. 内核单元测试：碰撞、跳跃弧线、液体判定、双门条件。
**DoD**：两台电脑双人联机通关该关；机关/门/钻石状态服务端权威；60Hz 定步验证（修改 `requestAnimationFrame` 帧率不影响仿真速度）；掉线一方重连后继续；typecheck/test 绿。

### M2 触屏 + 手机 + 穿透
任务：TouchSource + 虚拟按键 UI；iOS WebKit 三件套（`100dvh` 假全屏、首触摸 `resume()` AudioContext、viewport/缩放锁定）；`start.bat` 接入樱花 frpc `[人工：注册/实名/建隧道，配置卡见附录 B]`；房间密码接入。
**DoD** `[人工]`：双手机（iOS Safari/Edge + 安卓 Chrome）经公网链接联机通关该关；4G 弱网可玩；键鼠端不受影响（回归）。

### M3 全机关 + 全关卡滚动补全
任务：
1. **数据驱动开工**：写脚本枚举 `data/forest/levels/*.json` 中全部 Objects/Chars 对象 gid，得到本作真实机关清单（以此为准，不凭记忆猜测）；
2. 按批次实现机关（每批 = 2–3 种机关 + 其单测 + 装载用到它们的关卡）：
   - 批次A：按钮（按压/定时）、拉杆、可推箱（含站箱）、门/钻石扩展；
   - 批次B：移动平台、升降平台、滑轮/绳索；
   - 批次C：逐关遗留特殊件。
   机关行为规格对照旧仓库反编译 AS3 源码 `Fireboy-and-Watergirl-source/Forest Temple/scripts/`（Lever.as、Platform.as、MovingBox.as、ContactListener.as 等）逐类移植；
3. 选关门户（`temple.json` 节点 + `edges` 解锁）。
**DoD**：双人从教学关连续推进至最终关；枚举出的机关 100% 有实现或明确标注"该关不可达+原因"；全关卡机关状态服务端权威；性能：服务端单房仿真 <2ms/tick。

### M4 周边系统四件套
任务：共享存档 + 选关解锁（5.6）；每关计时 + 最佳纪录（官方 `temple.json` 的 `time`/`mobileTime` 为基准）；钻石收集统计；结算画面（时间/钻石/死亡数）；断线升级为"暂停 + 保留座位 60 秒"。
**DoD**：重启服务器后进度保留；每关通关出结算；任一端刷新/断线 60 秒内重连原地继续。

### M5 打磨（可选，按需）
自己角色的客户端预测 + 服务端和解（输入带 seq 回滚）；音频补全（跳跃/死亡/开门/拾取，素材在 `assets/audio`）；全屏与横竖屏体验；（远期可选）WebRTC DataChannel 加速数据面。

---

## 8. 手感调参工作流（"贴近原版"的保障）

手感是全项目迭代次数最多的环节，固定流程如下：

1. **offline 沙盒模式**：客户端支持 `?mode=offline`——不起服务器，本地直接跑 `shared` 内核仿真。调手感只在此模式做，改参数刷新即见（秒级迭代）；
2. 所有参数收敛于 `packages/shared/src/params.ts`：重力、跳跃初速、移速、加速度/摩擦、土狼时间、跳跃缓冲、各液体判定余量、推箱速度等，每项带中文注释；
3. **参数起点**：官方 H5 的 `output/A/js/*.min.js` 字符串未混淆（`FireBoy`、`cursors` 等可检索），提取运行时数值；原版 Flash 为 Box2D AS3，反编译源码中密度/摩擦设定可做参照；
4. **并排对照**：`npx serve output/A`（旧仓库目录下）本地跑原版，与 offline 模式并排玩，同操作对比跳跃弧线/落地/推箱手感；
5. 每调定一批：`params.ts` 单独 commit（信息注明"手感：xxx"），便于回滚到上个手感版本。

---

## 9. 兼容与测试矩阵

| 端 | 浏览器 | 里程碑 | 检查点 |
|---|---|---|---|
| 开发机 ×2 | Chrome/Edge | M1 | 键盘双人、重连、不同刷新率屏幕仿真速度一致 |
| 安卓手机 | Chrome | M2 | 触屏三键、多点同时按、虚拟键不触发页面滚动 |
| iOS 手机 | Safari + Edge（同为 WebKit） | M2 | `100dvh` 假全屏、首触摸解锁音频、触摸 preventDefault、无 requestFullscreen（不要调用它） |
| 公网 | 樱花隧道 | M2 | 首屏加载时长、wss 握手、25s 心跳防代理空闲断线、frpc 断线自动恢复 |

已知事实（勿再验证）：https 页面连 `ws://` 会被拦截 → 必须按页面协议自适应 wss（D7）；樱花 HTTP 隧道对 WebSocket 的透传官方未书面承诺 → M2 冒烟测试必须包含，失败则回退 TCP 隧道（`http://节点域名:端口`）。

---

## 10. 工程规则（全局规则 + 仓库规范）

1. **git**：细粒度提交（一个任务一个或多个 commit），Conventional Commits 风格；**严禁**添加 co-author/协作者署名；不直接在 main 上开发风险改动时开分支；
2. **笔记**：要点/决策/踩坑写入 `note/`；每个里程碑发 `note/release/<版本号>.md`（M1=0.1.0，M2=0.2.0 …）；
3. **测试**：`packages/shared` 的核心逻辑必须有 vitest 单测；服务端房间逻辑可用集成测试（Colyseus 提供测试工具）；**禁止**靠"打开浏览器人肉点"代替可自动化的验证；
4. **临时代码/测试残留**放 `TEMP/`，里程碑结束清理；
5. 执行中遇到本计划未覆盖的决策：优先选最简单可行方案，写入 `note/decisions.md`，不阻塞等待人类；
6. 需要人类的操作（真机测试、扫码、注册、验收）统一追加到 `note/handoff.md`，攒批处理。

---

## 11. 人类职责（仅此四类）

| 事项 | 时机 |
|---|---|
| GitHub 私有仓库创建 / Node 安装 | M0 |
| 樱花穿透：注册、1 元实名、建隧道、拿地址 | M2（配置卡见附录 B） |
| 真机测试：双手机、伙伴实测、弱网 | M2 起 |
| 手感反馈：对照原版打分（跳跃/移动/推箱各 1–5 分，说差异） | M1 起、M3 每批 |
| 里程碑验收：按各 DoD 逐条确认 | 每个里程碑末 |

---

## 12. 关键参考链接

**本机资源（优先）**
- 官方素材与关卡：`D:\Guiyuan1111\GitHub\Fireboy-and-Watergirl\output\A\`（assets/atlasses 图集、assets/audio 音频、assets/tilemaps、data/forest/temple.json 选关图、data/forest/levels/ 关卡 JSON、data/tutorials/ 教学关）
- 机关行为规格：`D:\Guiyuan1111\GitHub\Fireboy-and-Watergirl\` 旁的反编译源码目录（若本地无，见下方 square-nine）
- 旧方案笔记（架构教训/樱花配置）：`...\Fireboy-and-Watergirl\note\multiplayer-plan-option2.md`、`multiplayer-deployment-options.md`

**外部**
- Phaser 3：https://phaser.io · 文档 https://newdocs.phaser.io · 入门 https://phaser.io/tutorials/making-your-first-phaser-3-game
- Colyseus：https://colyseus.io · 文档 https://docs.colyseus.io · 教程 https://docs.colyseus.io/learn/tutorial/ · 断线重连 https://docs.colyseus.io/room/reconnection/
- Tiled 格式：https://github.com/mapeditor/tiled
- 备用素材源（与本地 output/A 同源）：https://github.com/amhooman/fireboywatergirl
- 反编译 AS3（前 4 代，机关规格参考）：https://github.com/square-nine/fireboy-and-watergirl-source
- 物件清单参考：https://github.com/twboom/FBWG-Editor （DOCS.md）
- 网科参考实现（预测/插值规格）：https://github.com/naticorrea-03/savoria
- 樱花文档：https://doc.natfrp.com （HTTP 隧道 /app/http.html · 自动 HTTPS /frpc/auto-https.html · 备案 /faq/beian.html）

---

## 13. 附录

### 附录 A：旧项目经验教训（必读）

| 编号 | 教训 | 对本项目的约束 |
|---|---|---|
| D1 | 页面里绝对路径引用脚本在部署后 404 | 静态资源一律相对路径 |
| D2 | 全局键盘拦截会破坏官方游戏输入（注入方案时代） | 本项目输入走 Phaser 原生键盘 + 自有 InputState，**不做**任何全局按键拦截/篡改 |
| — | 旧 v3 中继协议（create/joined/keys/peer/ping-pong 25s）已本地双标签验收通过 | 同源自适应 ws(s)、应用层心跳间隔、房间码交互可照搬其成熟语义 |
| — | 樱花 HTTP 隧道对 ws 透传官方未书面承诺 | M2 冒烟测试项；回退路径 = TCP 隧道 |
| — | 带宽实测预算：首载 ~22MB/局（双向计费按 44MB 账面），免费档 5GiB ≈ 110 局/月 | 免费档够用；静态资源必须带 `Cache-Control` |
| — | 代理空闲断线常见 60s | 应用层心跳 ≤25s（旧方案已验证） |

### 附录 B：樱花穿透配置卡 `[人工]`

1. 注册并实名（1 元购资格 + 支付宝刷脸，完成后不可撤销）；
2. 面板申请免费 `*.nyat.app` 子域（该子域强制 HSTS，必须 HTTPS）；
3. 建隧道：类型 **HTTP**，本地 `127.0.0.1:<server端口>`，绑定子域；节点选**带"建站"标的海外节点**（免备案；内地建站节点须备案，不可选）；
4. 自动 HTTPS 设为"自动"，重启 frpc 下发证书；
5. Windows 用官方启动器跑 frpc；`start.bat` 里顺序：起 Node → 起 frpc → 打印访问地址与房间码提示；
6. 回退：HTTP 隧道 ws 透传冒烟失败 → 改 TCP 隧道（非内地节点），地址形如 `http://节点域名:远程端口`。

### 附录 C：执行顺序检查单（执行 AI 逐项勾选）

- [ ] M0 工程骨架 + 私有仓库 + assets 拷贝
- [ ] M1 内核仿真 + 关卡解析 + Colyseus 房间 + 键盘双人 demo + 单测
- [ ] M2 触屏 + iOS 兼容 + 穿透开服 + 真机验收
- [ ] M3 机关枚举 → 批次实现 → 全关卡装载 → 选关门户
- [ ] M4 存档/计时/钻石/结算 + 60 秒重连
- [ ] M5 打磨（可选）
