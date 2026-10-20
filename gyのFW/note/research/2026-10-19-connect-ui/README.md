# 连接界面重设计调研（2026-10-19 · UI 设计调研槽）

范围：仅调研 + 方案 + mockup，**未改任何生产代码**。对象 = `packages/client/index.html` 的 DOM 联机面板（`#menu`）与其连接流（`packages/client/src/main.ts`）。
产出：本文 + `mockups/` 三份自包含 HTML（浏览器直接打开，1280×960 视口，图集帧 base64 内嵌）。

---

## 1. 现状盘点与痛点清单（逐条证据）

连接流事实（`main.ts`）：`bindUi()` 绑 `#btn-create`/`#btn-join` → `start(mode)` 读 `#password`/`#roomcode` → `show("连接中…")` → `Net.connect()` → `#hud-room` 回显 `房间码 <code>（密码已校验）` → `enterGame()` 隐 `#menu` 显 `#hud` → 切 Phaser Game 场景。创建者成功后往 `#hud-room` 里 append 一个「复制邀请链接」小按钮。

| # | 痛点 | 证据 |
|---|------|------|
| P1 | **视觉全面脱节**：面板是深色半透明圆角矩形 + system-ui 字 + 纯色扁平按钮（`--accent #ffb64c`/`--water`），与画布内"官方弹窗"语言（`overlays.ts` 的 PopupBackground0000 石板 1082×642 + StoneButton 两帧 hover 换帧 + FONT_MAIN 位图字）完全是两套系统；`index.html` 里零图集引用 | index.html L70-122；overlays.ts L32-60 |
| P2 | **开始界面美术被整块遮死**：`#menu` 是不透明径向渐变满屏层（z-index:10），身后 MenuScene 的 TempleHall 大厅背景、摆动光柱、火/水角色 idle 动画、飘浮蜡烛、菜单 BGM（`MenuScene.ts` L26-129）全部不可见——美术资产在联机路径上白费 | index.html L70-78；MenuScene.ts L26-129 |
| P3 | **无忙态、可双击**：`show("连接中…")` 只是往 `#menu-error` 塞一行小字，按钮不禁用、无 spinner；连点创建会并发两次 `Net.connect()` | main.ts L242-249（start 无 busy 闸） |
| P4 | **错误与进度共用同一元素同一样式**：`#menu-error` 只有一行 13px 红字样式；"连接中…"（进度）与报错（异常）同色同位；"room not found" 的 ~100 字诊断长文在小区里刷墙 | index.html L123；main.ts L131-133、L364-378（L374 长文案） |
| P5 | **房间码抄送弱**：建房成功即 `enterGame()` 隐面板，房间码只活在 HUD 顶部 12px 灰字里；邀请按钮 12px 内联样式塞在 `#hud-room` 内；对方需手抄 Colyseus roomId（大小写混合） | index.html L150；main.ts L333-361（按钮 cssText L344） |
| P6 | **提示文本墙**：`.hint` 两句长文连排，关键分键信息（火人 ↑←→ / 水女孩 WAD / R 重开）淹没在段落里 | index.html L191-194 |
| P7 | **输入无组织、无角色暗示**：两个 label 上下堆叠，"创建者设定 / 加入时填写"的时序关系靠小字括号；火/水仅标题两个字着色（`.fire`/`.water`） | index.html L93-94、L182-189 |
| P8 | **交互反馈缺失**：`.btn` 无 `:hover`（仅 `:active` 位移 1px）；input focus 仅换边框色；对比游戏内 StoneButton 有 hover 换帧（overlays.ts L57-58）。换关回面板（`onLevelPicked` → remove hidden）无过渡瞬间弹出 | index.html L107、L122；main.ts L402-412 |

## 2. 硬约束与 ID 兼容契约（重设计红线）

实测全仓依赖（`grep` 取证，行号为当前 HEAD）：

| ID | 依赖方（file:line） | 断言形式 | 红线 |
|----|--------------------|----------|------|
| `#menu` | perf-client.mjs:93、perf-load.mjs:113、visual-diff.mjs:146/152、e2e/lib.mjs:62、journey.mjs:57/64/71、touch.mjs:67；main.ts L229/406/412 | `waitForSelector(state:"hidden")` + `classList.contains("hidden")` | 必须存在；`.hidden`=`display:none`；入房成功时必须切 hidden |
| `#password` | perf-client.mjs:90、perf-load.mjs:110、visual-diff.mjs:143、e2e/lib.mjs:59、journey.mjs:62/68、touch.mjs:65/78 | `page.fill()` | 真 `<input>`，可见、可编辑、enabled |
| `#roomcode` | perf-client.mjs:91、visual-diff.mjs:144、e2e/lib.mjs:60、journey.mjs:69、touch.mjs:79 | `page.fill()` | 同上；另被邀请深链回填（main.ts L430-432） |
| `#btn-create` | perf-client.mjs:92、perf-load.mjs:112、visual-diff.mjs:145/151、e2e/lib.mjs:61、journey.mjs:63、touch.mjs:66 | `page.click()` | 可见可点（真 `<button>`）；绑定在 DOMContentLoaded（main.ts L426） |
| `#btn-join` | perf-client.mjs:92、visual-diff.mjs:145、e2e/lib.mjs:61、journey.mjs:70、touch.mjs:80 | `page.click()` | 同上 |
| `#hud-room` | perf-client.mjs:94-95、perf-load.mjs:114、visual-diff.mjs:155-156/179、e2e/lib.mjs:63-64、journey.mjs:65、touch.mjs:68-69 | textContent 匹配 `/房间码 ([^（\s]{4,})/` 与提取 `/房间码 ([^（\s]+)/` | textContent 必须含连续子串 `房间码 <code>`；code 可用 `<b>` 包裹（textContent 不变）；`#btn-invite` 动态 append 须保 `pointer-events:auto` |
| `#menu-error` | visual-diff.mjs:148/153；main.ts `show()` L131-133 | textContent 读/清空 | 必须存在；清空 = 空字符串 → CSS 可用 `:not(:empty)` 做零占位分态 |
| `#menu-level` | journey.mjs:58（`=== "已选关卡：forest_02"` 严格相等） | textContent 精确串 | 文本必须且仅为该串；装饰只能 `::before/::after`（不产生 textContent） |
| `#hud-status` | journey.mjs:52（`=== "通关！"`） | textContent | 换皮可，不加子文本 |

**三条铁律**：①换皮不换骨——以上 ID、元素类型、可见性时序一律保留；②双端密码一致性流程不变（main.ts `start()`/`Net.connect` 契约）；③零外部资源——只用现有图集帧 + CSS + system 字体（版权红线；FONT_MAIN 位图字 `.fnt` 是 Phaser 专用格式，DOM 侧不引入渲染器）。

## 3. 视觉词汇源（全部现成，已程序化核实）

| 资产 | 规格（atlas JSON 实测） | 用法 |
|------|------------------------|------|
| `PopupAssets: PopupBackground0000` | 帧 1082×642；实心内容 1029×594、四周 18px 软影、**圆角 r≈40、雕边厚 ≈55px**（alpha 阈值 128 + 亮度剖面程序化实测） | 面板 border-image：`slice 74 fill round`（74 = 18 影 + 55 雕 + 1 余量）；裁片量化后仅 **12.9KB** |
| `MenuAssets: StoneButton0000/0001` | 帧 252×117（Phaser 侧 `setDisplaySize(252,117)`，overlays.ts L52-54） | 按钮 `background-size:100% 100%`，hover 换帧 |
| `images/GameNameForest.png` | 860×270 | 面板上方官方标题立绘 |
| `CharAssets: fire/water_head_idle0000、legs_idle0000、glow0000` | head 130×162、legs 130×172、glow 94×104；MenuScene 同心叠放法（同中心，glow 中心 +40px、α.85，MenuScene.ts L62-73） | 角色识别/装饰 |
| `MenuAssets: Navy0000`（蜡烛 72×69）、`Diamond0000` | — | 飘浮点缀（MenuScene 有 yoyo tween 先例 L85-101） |
| `PopupAssets: CrossIcon0000/TickIcon0000` | 61×61 / 69×69 | 错误/成功图标（`::before` 引用，不产生 textContent） |
| `images/TempleHallForest.jpg` | 1708×960（MenuScene cover ×1.25） | mockup 幕布后的大厅（生产中即身后 canvas，无需 DOM 加载） |

图集整图体积：MenuAssets.png 196KB、PopupAssets.png 342KB——DOM 路径**只该引裁片小图**（不把整图喂给 CSS）。

## 4. 三个重设计方向

### 方向 A「石板大厅」—— DOM 深度换肤（推荐，mockup: `mockups/a-stone-hall.html`）

- **设计语言**：游戏内官方弹窗语言平移到 DOM。`#menu` 底由不透明渐变改为半透幕布 `rgba(5,11,4,.42)` + `backdrop-filter: blur(1.5px)`，身后 MenuScene 大厅透出（P2 直接消除）；面板 = PopupBackground border-image；按钮 = StoneButton 帧 hover 换帧 + 角色头像帧（fire/water head）内嵌；输入 = 石壁凹槽（内阴影 + 琥珀 caret，focus 光环）；错误区三态（空 / 连接中 spinner / 错误横幅带 CrossIcon，`:not(:empty)` 驱动）；提示墙改 kbd 速查行。
- **布局草图**：

```
┌──────────── 半透幕布（透出 TempleHall 大厅与角色动画）────────────┐
│              〔GameNameForest 官方标题立绘（浮动）〕               │
│                 ╭ ◈已选关卡：forest_01（chip 右上）╮              │
│        ┌─── PopupBackground 石板（border-image slice74）───┐      │
│        │           双人联机 · 一人火人 · 一人水女孩           │      │
│        │   房间密码（创建者设定…）  [ ▒▒▒ 4321 ▒▒▒ ]        │      │
│        │   房间码（加入时填写）     [ ▒▒▒▒▒▒▒▒▒ ]           │      │
│        │   ┌──StoneButton──┐    ┌──StoneButton──┐           │      │
│        │   │ 🔥 创建房间    │    │ 💧 加入房间    │           │      │
│        │   └───────────────┘    └───────────────┘           │      │
│        │   ⚠ 错误横幅 / 连接中 spinner（:empty 时零占位）     │      │
│        │   火人 ↑←→  · 水女孩 W A D  · R 重开 · P 暂停       │      │
│        └────────────────────────────────────────────────────┘      │
└──────────────────────────────────────────────────────────────────┘
  入房成功 → HUD 木牌： 你扮演：火人 | 房间码 Ab3x9K（密码已校验）[复制邀请链接]
```

- **交互流**：与现状完全一致（建房/加入/深链自动加入/换关回面板）。增强项（需 main.ts 微改，见实施清单）：连接中按钮禁用 + `#menu-error.busy` spinner；错误长诊断可折叠（`.details`）；`#hud-room` 用 innerHTML 把 code 包 `<b>` 高亮（textContent 不变，正则不受影响）。
- **实现路径**：index.html `<style>` 重写（约 200 行）+ 一次性裁帧脚本产出 3 个小 PNG（popup-board 12.9KB、stone-btn 2.2/2.4KB → `public/assets/ui/`）+ main.ts 三处微改（busy class、错误分态、hud-room innerHTML）。**DOM 零动**。
- **工作量**：0.5–1 天。
- **风险**：石纹在 border-image 中段拉伸（`round` 平铺缓解，slice 值真机微调）；`backdrop-filter` 低端机性能（降级：去 blur 只留暗幕，@supports 包裹）；无其他——Playwright 语义零影响。

### 方向 B「画布原生化」—— 面板搬进 Phaser（mockup: `mockups/b-canvas-native.html`，**不推荐现下做**）

- **设计语言**：连接面板成为第二个 `overlays.ts` 板：PopupBackground0000 @(99,159) 整帧、FONT_MAIN 位图字、Back.easeOut 420ms 弹入、StoneButton——与暂停/结算菜单逐像素同源。DOM 只留**透明 `#menu` 契约壳**（`pointer-events:none`，宿主 opacity:0 的 `#password`/`#roomcode` 热区与透明按钮热区），供 Playwright fill/click 与软键盘。
- **布局草图**：

```
┌ 1280×960（无 DOM 视觉，全画布）─────────────────────────┐
│  TempleHall 大厅全清晰（无幕布）                          │
│     ┌ PopupBackground0000 @ (99,159) 1082×642 ┐         │
│     │        联机大厅（fontStone 36）           │         │
│     │        ◈已选关卡：forest_01               │         │
│     │   [石凹槽 #password（DOM 隐形热区）]       │         │
│     │   [石凹槽 #roomcode（DOM 隐形热区）]       │         │
│     │      (StoneButton 创建房间)               │         │
│     │      (StoneButton 加入房间)               │         │
│     └─────────────────────────────────────────┘         │
└─────────────────────────────────────────────────────────┘
  DOM: #menu 透明壳（input 热区 opacity:0，坐标与画布凹槽对位）
```

- **交互流**：点画布石钮 → 画布画焦点环 → 转发 focus 给隐形 input → 软键盘/IME 照常 → 值同步回 scene → start()。
- **实现路径**：新增 ConnectScene（或 MenuScene 扩展）+ ghost 桥（坐标同步、focus 转发、值双向绑定）+ main.ts start() 改从 scene 回调取值 + 裁帧零新增（画布直读图集）。
- **工作量**：3–5 天。
- **风险（高，故不推荐）**：①Playwright 的可见性判定对 `opacity:0` 碰巧放行，但 click 命中测试/焦点与 canvas 互相抢，热区必须逐像素叠位；②中文 IME 组合输入事件需在幽灵层实测；③移动端软键盘唤起依赖真实 focus 时序；④画布值与 input 值双渲染源同步；⑤与"换皮不换骨"约束精神冲突，除非基准脚本先迁移到 `window.__fw` API——那是另一个战役。mockup 中蓝色虚线即幽灵层示意（可切换真实视图）。

### 方向 C「神庙双门」—— 火水分流布局（mockup: `mockups/c-twin-gates.html`）

- **设计语言**：横排构图：中央"神庙口令"小石牌（密码两门共用 → 直观表达"双方一致"）+ 左火门（创建）/右水门（加入）两张 PopupBackground 卡；角色按 MenuScene 同心叠放法（legs+head+glow）压在门楣上；门卡顶部 10% 火/水渐变 tint；输入 focus 色分火（琥珀）/水（蓝）。宽屏一眼分清两角色，`<1020px` 回落单列（即方向 A 式）。
- **布局草图**：

```
│          〔GameNameForest〕        [◈已选关卡：forest_01] │
│  ╔火·门卡╗       ╔神庙口令牌╗       ╔水·门卡╗             │
│   🔥 立绘          房间密码            💧 立绘             │
│  ┌StoneButton┐     [ ▒ 4321 ▒ ]      [ 房间码输入 ]       │
│  │ 创建房间   │                       ┌StoneButton┐       │
│  │ 我当火人   │                       │ 加入房间   │       │
│  └───────────┘      FIREBOY │ WATERGIRL └───────────┘     │
│          ⚠ 错误槽位   ·  kbd 速查一行  ·                   │
```

- **交互流**：与现状一致。**红线自查**：两输入恒可见（不做渐进披露，否则 e2e"先 fill 后 click"时序必炸）；Tab 序 = DOM 序 = 视觉序（密码 → 创建 → 房间码 → 加入）。
- **实现路径**：index.html DOM 重排（同 ID 同类型）+ CSS 约 300 行 + 方向 A 同款裁帧资产 + 断点回落。
- **工作量**：1–2 天。
- **风险**：窄屏断点回落成本；门楣立绘在小屏挤压（断点里隐藏 legs 只留 head）；错误横幅横跨三卡时的宽度上限。

## 5. 方向对比

| 维度 | A 石板大厅 | B 画布原生化 | C 神庙双门 |
|------|-----------|-------------|-----------|
| 视觉收益 | 高（官方弹窗语言 + 大厅透出） | 最高（与游戏内弹窗逐像素同源） | 高（构图/角色叙事新） |
| 契约（ID/perf/e2e）风险 | **零**（DOM 不动） | 高（幽灵热区/焦点/IME） | 低（重排不动 ID） |
| 工作量 | **0.5–1 天** | 3–5 天 | 1–2 天 |
| 移动端 | 好（纯 CSS） | 差（软键盘对位） | 中（需断点回落） |
| 可回滚性 | 高（CSS + 3 小图） | 低（新场景 + 桥接层） | 中 |
| 长期维护 | 低 | 高（双渲染源） | 中 |

## 6. 推荐

**方向 A 先行**（收益/风险/工作量最优；吸收 C 的 kbd 速查行），**C 作为二期布局演进可选项**（在同一套裁帧资产上换布局），**B 挂起**（触发条件：基准/脚本先迁移到显式 API 后再议）。
阶段二增强（正交于方向，均需 main.ts 数行微改）：忙态锁定防双击（P3）；错误分级：进度 spinner / 短错误横幅 / 长诊断折叠（P4）；建房成功 8 秒大号房间码浮层（新元素，不触契约）+ `#hud-room` code 高亮（P5）；换关回面板加 200ms 淡入（P8）。

## 7. 实施清单（以方向 A 落地为例）

1. 资产：一次性脚本裁 `PopupBackground0000` → `public/assets/ui/popup-board.png`（quantize 后 ~13KB）、`StoneButton0000/0001` → `stone-btn-0/1.png`（~2.3KB/帧）。禁止把 342KB 整图喂给 CSS。
2. `index.html`：重写 `<style>`（幕布 / border-image 面板 / 凹槽输入 / StoneButton / `#menu-error` 三态 / kbd 提示），DOM 结构与 ID 不动。
3. `main.ts` 微改（推荐，各行独立可回滚）：`start()` 进连接即加 `#menu-error.busy` + 双按钮 `disabled`；`show()` 增加可选 `cls` 参数区分进度/错误；建房成功 `#hud-room` 改 `innerHTML` 高亮 code（textContent 串不变）。
4. **回归（必须全绿）**：
   - `node benchmark/perf-client.mjs` —— `#password`/`#roomcode`/`#btn-*`/`#menu` hidden/`#hud-room` 正则，选择器零改动；
   - `node scripts/e2e/journey.mjs` —— （2026-10-20 改写后不再读 `#menu-level`/回面板：0.3.12 活房间 advance 语义，断言全走权威 state 轮询）；
   - `node scripts/e2e/touch.mjs`、`benchmark/visual-diff.mjs`（后者读 `#hud-room`/`#menu-error` 文本；若其菜单截图纳入基线需重录）；
   - 手动：`?room=&pw=` 深链自动加入、窄窗（<420px）与移动端 Safari、F3 暂停/R 重开时面板不复活。
5. **验收红线速查**：`#password`/`#roomcode` 为真 input 且恒可见；`#btn-create`/`#btn-join` 可点；`#menu.hidden` = display:none；`#menu-level` textContent 精确串；`#hud-room` 含连续 `房间码 <code>`；装饰一律 `::before/::after`。

## 8. Mockup 使用说明与验证记录

- `mockups/a-stone-hall.html` / `b-canvas-native.html` / `c-twin-gates.html`：自包含单文件（图集帧 base64 内嵌），浏览器 `file://` 直开，1280×960 自动缩放适配。右下 DEMO 控制台可切换：连接中 / 错误（短/长）/ 建房成功→HUD；B 另有幽灵层"真实视图"切换与弹入重播。页面内保留全部契约 ID（`#menu`/`#menu-level`/`#password`/`#roomcode`/`#btn-create`/`#btn-join`/`#menu-error`/`#hud-room`/`#btn-invite`），DEMO 之外无臆造交互。
- 无头验证（2026-10-19，Playwright chromium，1280×960）：三份 mockup 均通过——零 console/page 错误；benchmark 同款动作（fill `#password`/`#roomcode`、click `#btn-create`/`#btn-join`、`waitForSelector("#menu", hidden)`、`#hud-room` 匹配 `/房间码 [^（\s]{4,}/`、`#menu-level` 精确串）全部成功；全部 `<img>` 解码成功；关键元素无舞台溢出。验证脚本属临时件，随 TEMP 清理，逻辑即上文第 2/7 节断言。

---

## §实施记录（2026-10-19 · 方向 A 实施槽）

按本文方向 A 落地，commit `477cec0`（实现）+ `3808338`（census 清单）+ 档卷。只动 `packages/client/index.html`（主体）、`packages/client/src/main.ts`（最小接线）、根 `package.json` 0.3.32→0.3.33、`scripts/font-subset/used-chars.json`（测试防护网自述的刷新流程）、release note。

### ID 契约自证（§2 逐条）
九 ID 全部原名原元素类型原语义；装饰全部走伪元素（`#menu-level::before` "◈ "、`#menu-error::before` CrossIcon 帧——textContent 零污染）。探针实证（TEMP 探针，12/12）：`#menu-level` textContent 精确串、`.menu-fit` 在 1280×720 实测 `matrix(0.75,…)`（=min(1280/1280,720/960)，与画布 FIT 同因子，tan/atan2 在门禁 chromium 生效）、hover 换帧 `0px 0px → 33.1606% 0px`、fill/click 全视口（1280×720 / 1400×1000 / iPhone 13）可用、`?room=&pw=` 深链回填、忙态 spinner+双按钮禁用→失败回横幅+解锁、零 console/page 错误。

### 与 mockup 的差异点（及理由）
1. **资产**：mockup 用 base64 裁片 + border-image；生产按派发要求零新增资产——直引图集（PopupAssets/MenuAssets/CharAssets，画布 BootScene 已预载同 URL，CSS 引用零额外字节），帧坐标走 background-size/position 百分比换算（2048/1082、205/1406、1024/252、256/772、61/18 推导）。整图 border-image 不可行已证：PopupBackground0000 在 atlas (0,205)，非贴边，slice 无法隔离（CrossIcon 等帧会漏入角片）。
2. **面板几何**：mockup 板外框 748px 流式；生产桌面为**原生 1082×642 整帧**（与 overlays.ts 画布弹窗逐像素同几何，经 `.menu-fit` 与画布同因子缩放），`<560px 宽或 <420px 高`回落流宽回流皮（四角 74px 原生裁片盖片在两皮共用，回流皮下边中段随比例拉伸，与 mockup border-image 同级折衷）。
3. **按钮**：mockup 竖排整宽（600px 板所迫）；生产桌面双钮**并排原生 252×117**（同游戏内弹窗钮组语言），回流皮回到整宽堆叠。
4. **保留 h1**（mockup 删除）：作为板内标题（同画布弹窗标题位），a11y 保留。
5. **删去 mockup 的 DOM 蜡烛**：身后 MenuScene 画布本就有 4 支 Navy 蜡烛+角色 idle，DOM 再画一遍会重影——P2 的正确解就是幕布透出，不需 DOM 复刻。
6. **画布自带标题**：GameName 在幕布后半透可见，与 DOM logo（460px）部分叠合属预期合成；kizi logo 顶部 50px 弱可见，接受。
7. **错误长诊断折叠（.details/<small>）未做**：`show()` 保持 textContent 单一来源（避免 innerHTML 注入面），长文案由横幅 line-height 换行承载；三态（空/busy/错误）照搬。
8. **输入框 height 46px、字号 17px**（≥16px，iOS 聚焦不触发视口缩放，较旧版 15px 改善）。

### 门禁数字
| 项 | 结果 |
|---|---|
| tsc（typecheck） | PASS |
| vite build（仓库根） | PASS（dist/index.html 17.39KB） |
| vitest 全量 | **89/89 PASS**（首跑 88/89：换肤新增文案触发 font census 防护网——按测试自述重跑 `census.ts` 刷新清单后全绿，client 源字符 395→527、fnt 交集 247→248） |
| e2e route forest_01 repeat1 | **ALL PASS**（winAt=39559ms，房间 eqOX4nx-a） |
| journey | **✗ 2 项——基线复跑同点同文失败，判定既有问题非本次回归**（见下；**2026-10-20 已收口**：场景按 0.3.12 advance 语义改写，双跑 7/7 ALL PASS，`3caa1cf`） |
| touch | **✗ 1 项——基线复跑同点同文失败，判定既有问题非本次回归**（见下；**2026-10-20 已收口**：根因=Playwright tap 并发齐发致服务端同 tick 对消，探针改 CDP 90ms 按压，Δy 0.0→30.7/32.5px 双跑 6/6 PASS，`ac1ee09`） |
| visual-diff | 91.97 / 92.8（两跑，方差 ~0.8pt；**只截 canvas 元素，DOM 换皮不入镜**；历史 95.2–95.8 为 10-13 win 环境数字，本槽未触 canvas 渲染路径，差值归环境/漂移面存疑待核） |
| perf-client 本地冒烟 | 完成（建房→进房链路通；headless swiftshader webgl 13.3fps / canvas 60.6fps 属环境正常值） |

### 既有问题（基线取证，未修——不在本槽文件边界内）
- **journey「联机面板弹出并预选下一关」**：`__fwNextLevel` 现行走活房间 advance（0.3.12 语义，服务端仅 won 受理、双端留场换关），菜单不再弹出；journey.mjs 的该检查仍是旧 Continue 回大厅语义。基线（477cec0^）复跑：同两 ✗、detail 逐字同（`已选关卡：forest_01`）。→ **已收口（2026-10-20，`3caa1cf`）**：场景 1 按现语义改写（双端 advance 同房换关/面板不弹出/席位保留/时钟续走，7 项断言双跑 ALL PASS），旧断言随语义退役。
- **touch「tap 跳跃 → y 上抬」**：Δy=0.0px ×2（本槽）+ 基线 ×1 同值；右移/三键/零报错均绿。→ **已收口（2026-10-20，`ac1ee09`）**：定谳非内核开关/坐标问题——Playwright 1.63 `touchscreen.tap` 并发齐发 touchStart/End，按钮同帧 down/up，两条 input WS 1ms 内到达，服务端 tick 意图跨度排水同一步消费对消（FW_DUMP 字证 step=50 at=821/822ms），物理步采样 up=false；探针改 CDP 顺序注入+人手量级 90ms 按压后 Δy 30.7/32.5px，双跑 6/6 PASS。
- **连接失败横幅显示 raw 错误串**（如 "[object ProgressEvent]"）：0.3.32 同款 catch 直通行为，非本次引入。

### 遗留
- `<560px` 回流皮的石纹边中段拉伸与 74px 固定角片的比例失配，小屏上不显眼；若后续立项可换 §3 方向 C 双门布局（同一套帧坐标资产可直接复用）。

---

## §精修记录（2026-10-20 · 连接界面精修槽）

在方向 A 实现上视觉精修（非推倒重来）。只动 `packages/client/index.html`（CSS 主体 + 新增一枚装饰 `<div class="divider" aria-hidden>`）；`main.ts` **零改动**（比派发允许的"房间码 class 接线"更省——用纯 CSS 达成）。版本 0.3.35→0.3.36。

### 关键发现与对策
1. **灰板根因**：PopupBackground0000 原帧程序化解码实测为中灰石板（内容区均值 RGB(150,150,150)，atlas 内 1:1 无缩放）——A 槽奶油/暖灰文字直接压在灰板上，对比仅 1.6~2.5:1，"灰、扁平"观感的根源。对策：面板与四角 74px 裁片统一叠平铺暖黑罩 `--tint: rgba(24,16,8,.66)`（石纹 34% 透出；罩层为平面色，任意拼缝不可见），暖色底同时奠基火/水主题色系。
2. **placeholder 建议值触红线**：派发建议 #8a8070 对凹槽实测底色仅 4.0:1（<4.5）——按可访问性红线优先，取同族 #948a76（仍较旧值 #9b8d70 深一档），实测 4.69:1。
3. **房间码大字零接线**：`:not(:placeholder-shown):not(:focus)` 即可表达"有值且未聚焦"（深链回填/带码回面板呈现 22px tabular-nums 琥珀码；聚焦打字回落 17px 防跳字），main.ts 不必动。

### 对比度实算表（Playwright dsf=2 渲染像素；底色=元素旁/内干净补丁逐通道中位数；字形=盒内最亮/最暗 2% 像素均值，方向由计算色明暗决定；抗锯齿使核均值略低于纯色，故实测≤计算）

| 目标 | 实测底色 | 字形核(实测) | 实测比 | 纯色计算比 | 判定 |
|---|---|---|---|---|---|
| H1 基色「·」26px bold | #443e39 | （像素混样无独立意义） | — | **8.81** | ✓ |
| H1 火字 26px bold | #443e39 | #ff7a3d | **4.06** | 4.06 | ✓ 大文本 ≥3:1（≥18.66px bold 口径） |
| H1 水字 26px bold | #443e39 | #3fb9ff | **4.81** | 4.81 | ✓ 大文本 |
| 副标题 13px | #443e39 | #c0b499 | **5.13** | 5.65 | ✓ ≥4.5 |
| 标签-房间密码 13px | #443e39 | #c9bda0 | **5.65** | 5.65 | ✓ |
| 标签-房间码 13px | #443e39 | #c7bb9f | **5.56** | 5.65 | ✓ |
| 输入正文 17px | #24211f | #ffbb54 | **9.52** | 11.39 | ✓ |
| placeholder 17px | #24211f | #948a76 | **4.69** | （伪元素色 getComputedStyle 不直读） | ✓ |
| 房间码正文 17px 聚焦 | #24211f | #febf5a | **9.79** | 11.39 | ✓ |
| 房间码大字 22px 失焦 | #24211f | #cb9446 | **6.01** | 9.18 | ✓ |
| 按钮创建·主字 19px bold | #412d25（ember 罩石） | #fff3d8 | **11.72** | 11.72 | ✓ |
| 按钮加入·主字 19px bold | #30353e（aqua 罩石） | #e5dbc6 | **8.96** | 10.21 | ✓ |
| kbd 键帽字 11px/600 | #1b1815（键帽暗底） | #e8d9b8 | **12.68** | — | ✓ |
| 提示行 b 12px | #443e39 | #d8cba9 | **6.54** | 6.54 | ✓ |

角片拼缝检查：74px 裁片右缘列剖面阶跃 0.97/255（邻域自然梯度 0.12/255）——绝对值约 1/255，远低于可感知阈（~3/255），判定无可见拼缝。

### ID 契约探针 12/12（复跑 2026-10-20，本档 TEMP 探针，随清理移除；逻辑即下述断言）
T1 八 ID 在场+元素类型（div,input,input,button,button,div,div,span）；T2 `#menu-level` textContent 精确串 `已选关卡：forest_02`；T3 `.menu-fit` @1280×720 scale=0.75（与画布 FIT 同因子）；T4 hover 帧切换 `0px 0px → 33.1606% 0px` + `translateY(-2px)`；T5 创建流 @1280×720（fill→click→`#menu` hidden→`#hud-room` 正则）；T6 创建+加入对 @1400×1000；T7 回流皮 join @390×844；T8 深链 `?room=&pw=` 回填（自动加入失败回落面板后值保留）；T9 busy：ws 挂起页 spinner+双按钮 disabled+`::before` animationName=menu-spin；T10 失败→横幅+解锁（等待条件须排除 busy 期"连接中…"4 字——首轮探针在此误判过一次）；T11 失败后输入可编辑；T12 真实流页面零 console/page 错误。
- **伪影注记**：ws 人为挂起页出现 pageerror `protocols[0]: expected string, got object`——colyseus.js 0.16 `WebSocketTransport.connect` 浏览器路径先按 Node 签名 `new WebSocket(url,{headers,protocols})` 构造（抛 SyntaxError 被 try 捕获后回落合法签名）；正常连接窗内不冒出，仅探针挂死握手走重试路径时以 pageerror 可见。本次改动纯 CSS/静态 DOM，不可能引入 JS 异常，归探针伪影单列。

### 门禁数字
| 项 | 结果 |
|---|---|
| tsc（typecheck） | PASS |
| vite build（仓库根） | PASS（3.7s） |
| vitest 全量 | **95/95 PASS**（本次零新增文案字符，font census 防护网未触发） |
| e2e route forest_01 repeat1 | **ALL PASS**（winAt=39477ms） |
| visual-diff | 92.45 / 91.36（两跑，方差 ~1.1pt；只截 canvas，DOM 不入镜；与 §实施记录 91.97/92.8 同带） |
| 契约探针 | **12/12**（上节） |

### 五态截图（用户浏览器直看验收）
`polish-2026-10-20/`（1280×960，`?level=forest_01` 深链直达面板；busy 态经 routeWebSocket 挂起握手真实点击进入，错误横幅为真实 join 不存在房间的服务端 404）：
`1-default.png`（默认）/ `2-hover-primary.png`（主钮 hover：换帧+提亮+上浮+ember 光晕）/ `3-input-focus.png`（密码聚焦：琥珀光环+caret）/ `4-busy.png`（spinner+双钮压暗禁用+幕布冻结）/ `5-error-banner.png`（错误横幅）/ `6-roomcode-stamped.png`（加拍：房间码 22px 琥珀大字仪式态）。

### 精修映射（派发设计语言八条 → 落点）
1. 8pt 阶梯：面板 padding 48/56/40、label 24/8、divider 24、按钮组 32（组间）与 16（组内）、error 16、hint 32、hint gap 24、回流皮 32/40/16/24——组间距>组内间距。
2. 层级三档：H1 26px/#f5ead0/letter-spacing 2px；标签 13px #c9bda0；输入正文 17px #ffd479（--ink）。每档只靠字号/颜色/字重。
3. 主次梯度：创建=252×117+ember 内环 `inset 0 0 0 2px rgba(255,122,60,.55)`+顶 1px 高光+文字暖光；加入=240×108+aqua 环 `rgba(80,180,255,.5)`+opacity .92；hover 换帧（瞬时，background-position 不参与 transition）+brightness(1.07)+translateY(-2px)+阴影扩散 150ms ease-out；active 压平回落 rest 阴影；busy=既有 disabled 压暗+`#menu-error` spinner。头像帧保留。
4. 主题色贯穿：`label[for]::before` 8px 圆点（火/水+同色 glow）；kbd 火/水 `border-bottom:3px` 主题色条。
5. 凹槽：inset 0 3px 8px rgba(0,0,0,.72)（加深一档）+`inset 0 -1px 0 rgba(255,244,214,.09)`（下缘内高光，上暗下亮）；focus 琥珀光环 150ms；placeholder #948a76（见对策 2）。
6. 房间码仪式感：纯 CSS（对策 3）。
7. 雕刻分隔：`.divider` 双线（上 1px rgba(0,0,0,.55)+下 1px rgba(255,240,200,.13)，560px 对齐表单列）；hint 上方 32px。
8. 对比度红线：上表全 ≥4.5（H1 主题字 26px bold 按大文本 ≥3:1 口径）；`:focus-visible` 琥珀 outline 保留。
9. 性能红线：零新增 backdrop-filter/blur/无限动画（幕布 1.5px blur 与 floaty/spin 均既有；floaty 忙期暂停、reduced-motion 停用均既有保留）；box-shadow 全静态层，hover 过渡仅为一次性 150ms。

### 遗留
- H1「·」的实测像素混样无意义（'·' 像素数少于 2% 窗口），以纯色计算比 8.81 记录——方法局限，非视觉问题。
- 次钮 opacity .92 与 240×108 的主次差在窄屏回流皮保留色环/高度差、恢复同宽（`#btn-join{width:100%}`）——窄屏并排不可行下的折衷。
