# baseline/ — 原版金轨迹采集基建

对只读参考库 `Fireboy-and-Watergirl/output/A/`（森林神庙，4399 内核 + ak-ioi 镜像）做
**原版行为金轨迹采集**，用于与本项目复刻内核做逐帧数值对拍。参考库永久只读；本目录所有
脚本只读参考库、只写本工作区。

## 文件

| 文件 | 用途 |
|---|---|
| `serve-original.mjs` | 零依赖静态伺服器：把 `output/A/` 挂到 `127.0.0.1:8787`（禁缓存、防目录穿越、全 MIME） |
| `capture.mjs` | 核心采集器：Playwright 驱动系统 Edge/Chrome，跳关 + 帧序输入注入 + Step 后采样 + 确定性复验 |
| `render-level.mjs` | 关卡 JSON → ASCII 地图（含机关/出生点/门/液体标注），路线分析用 |
| `golden/*.json` | 金轨迹成品（见下） |

环境要求：便携 Node 在 `TEMP/node/`（gitignore 内），每次先
`export PATH="$PWD/TEMP/node:$PATH"`；`npm i -D playwright` 已装入 workspace 根
（`PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1`，走 `chromium.launch({channel:'msedge'})` 用系统 Edge）。

## 快速开始

```bash
export PATH="$PWD/TEMP/node:$PATH"

# 1) 起伺服器（前台或 nohup 后台）
node scripts/baseline/serve-original.mjs &

# 2) 采集：forest_01，A1 输入脚本，双跑确定性复验
node scripts/baseline/capture.mjs \
  --level forest_01 --script scripts/baseline/golden/forest_01_a1_input.json \
  --frames 720 --runs 2 --out scripts/baseline/golden/forest_01_a1.json

# 严格对拍模式（钉死 dt=1/60，漂移亚像素；偏离原版可变 dt）
node scripts/baseline/capture.mjs --level forest_01 \
  --script scripts/baseline/golden/forest_01_a1_input.json \
  --frames 720 --runs 2 --fixed-dt 0.0166667 --out golden/xxx.json

# 调试：保渲染开 + 指定采样帧截图（存 TEMP/baseline/shots/；截图有节流扰动，金轨迹勿用）
node scripts/baseline/capture.mjs --level forest_01 --render --shot 100,300 --out TEMP/x.json
```

capture.mjs 参数：`--level`（在 temple.json levels 里按文件名后缀自动匹配，如
`forest_01` → `tutorials/levels/forest_01.json`）、`--script`（帧序输入脚本）、`--frames`
（每行程采样上限，默认 720）、`--runs`（确定性连跑次数）、`--out`、`--shot`、`--render`、
`--restarts`（死亡/通关后自动重进）、`--settle`、`--fixed-dt`。
stdout 末行输出 `RESULT {...}` 供上层脚本消费。

## 已实测验证的配方（全部本机跑通）

### 游戏实例与跳关

```js
// Phaser 实例（页面 console 已被游戏覆写成 noop，探针用 addInitScript 存 window.__origLog）
const g = require('Phaser').GAMES[0];     // require 全局可用（gameIndex 先置 undefined 后被 requirejs 重定义）
const L = g.level;                        // Level 状态实例（loadComplete 里赋值），含 pers1/pers2/objects/groundBody/levelState
const plugin = g.physics.box2d;           // box2d 插件：world/ptmRatio(32)/velocityIterations(8)/positionIterations(3)/paused

// 跳关（无需改文件/存档；levelData 来自 progress 已 fetch 的 temple.json）
const temple = g.progress.attributes.temples.find(t => t.id === 'forest');
const levelData = temple.levels.find(l => l.filename.endsWith('/forest_01.json'));
g.currentTemple = temple;                          // TempleAssets 路径依赖它
g.state.add('level', require('States/Level/Level'));
g.state.start('level', true, false, JSON.parse(JSON.stringify(levelData)));
// 就绪判定：g.level.loadCompleted && g.level.pers1.body && g.physics.box2d.paused === false
// （loadComplete 会把 plugin.paused 置 true 并覆写 plugin.update，startLevel 后才解禁）
```

- 存档命名空间 `fb-forest`（`fb-forest:progress` / `fb-forest:settings` / `fb-forest:invulnerable` / `fb-forest:unlock`）。
  镜像注入的作弊钩子 `fb-forest:invulnerable` / `fb-forest:unlock` **金轨迹一律不用**（会改变死亡判定/解锁）。
- `skipToLevel`（init.js @1988080）与 `state.fade`（@2268004）是等价官方入口；`state.fade` 会走
  AdManager，直接 `state.start` 更干净。
- 死亡/通关后：`stateCurrent` 变 `endGame` 且 `physics.box2d.paused=true`。重进 = 重新执行上面的跳关序列。

### 步进钩子（Step 前注入 / Step 后采样）

```js
const origUpdate = plugin.update;   // 引擎的实例覆写版：if(!paused) world.Step(min(0.04,elapsed/1000), 8, 3)
plugin.update = function () {
  // ...按 frameIndex 应用输入脚本增量（只在状态变化时派发键盘事件）...
  var dt = Math.min(0.04, this.game.time.elapsed / 1e3);   // 与引擎同式
  origUpdate.call(this);
  if (this.paused) return;                                  // 死亡/通关瞬间补采一帧终止状态
  /* 采样 tracked 刚体 {x,y,a,vx,vy} */ 
};
```

- 该覆写是**实例属性**（Level.loadComplete 里赋值），重启关卡后必须重取 `plugin.update` 再包一层。
- 注意镜像注入的自适应 tick 调度器（`g.executeTick`，minTPS 50 / maxTPS 100 累积器）在
  plugin.update 之外调度；headless 下 rAF≈130Hz，实测物理步频 ≈65 步/s，墙钟≈仿真时间。

### 键盘注入

```js
// 合成 KeyboardEvent 的 keyCode/which 是只读派生属性，需 defineProperty 覆盖后 dispatch 到 document
const ev = new KeyboardEvent(type, { bubbles: true, cancelable: true });
Object.defineProperty(ev, 'keyCode', { get: () => code });
Object.defineProperty(ev, 'which',   { get: () => code });
document.dispatchEvent(ev);   // document 派发可同时命中 window 监听（Phaser Keyboard）
```

键码：火人 = 方向键 left 37 / up 38 / right 39 / down 40；水女孩 = a 65 / w 87 / d 68 / s 83
（controls=keyboard 时；教程层文本可证：方向键=火男孩、AWSD=冰女孩）。

### 刚体识别（body→tag 配方）

- 角色：`L.pers1.body.data` = **火人 fb**（方向键），`L.pers2.body.data` = **水女孩 wg**（WASD）；
  身体 userData=`"pers"`（fb/wg 靠引用身份区分，勿靠 userData）。
- 地面：world 里唯一 `GetUserData() === 'ground'` 的 body（`L.groundBody` 直达）。
- 机关：`L.objects` 数组 + `instanceof` 模块类（`require('States/Level/Devices/<Name>')`）：

| 类 | 取刚体 | 备注 |
|---|---|---|
| MovingPlatform | `d.sprite.body.data` | options.type='platform'，properties.dx/dy=行程(米)，group |
| Box / BoxHeavy… | `d.sprite.body.data` | frame=`movingbox0000` |
| Pusher | `d.button.body.data` | 踏板体；`d.base`/`d.joint`(prismatic) |
| Lever | `d.body.data` | 杆体角度即关键量；`d.base`/`d.joint`(revolute ±0.2π) |
| Door | `d.body`；标志 `d.isOpen`/`d.isUp` | `L.door1`/`L.door2` 直达；`data.char='fb'/'wg'` |
| Liquid | 无独立刚体采样 | killFixture userData `{type:'liquid_death'}`；显示带为动画 |
| Diamond | `d.sprite.body.data` | mass0 传感器，±5px 漂浮 |

- 世界里还有若干 `lightProperties` 微型传感器 body（userData=null），采样时按排除法跳过。
- 机关类名是 Closure 压缩后的短名（'d'/'c'），**必须用 instanceof 对模块类判定**，勿用 constructor.name。

### 坐标系与数值

- 采样输出为 **box2d 原始物理坐标**（米，y 向上，负空间）。换算屏幕像素：`screen = (-32·x, -32·y)`。
- 引擎常量（实测）：ptmRatio 32；gravity (0, +1000px/s²)=+31.25 m/s²（插件内部 y 取负）；
  Step=min(0.04, elapsed/1000)，velocityIterations 8 / positionIterations 3；useElapsedTime=true。
- 顶部计时器为**正计时**；教学文本 8 条触发式渐进（Tutorial_keyboard 层 8 个触发框）。

### 采集期关键机制（14 轮迭代实测，路线设计必读）

1. **松开跳跃键 = 立即清零上升速度**（可变跳高）。满跳（107px/3.34m）必须按住 ~32 帧到顶点。
2. **按住跳跃键落地会自动再跳**（prohibitJump 只在松键时清零）。空中按下、落地即满跳。
3. **贴脸（接触台阶/墙体侧面）时起跳会被接触法线投毒**：n.y≈0 → `v0=n.y^0.25×15.5≈0` 的零跳。
   上台阶必须先脱离面、助跑后跳。
4. **无 32px 自动上台阶**——原版所有台阶都要跳。
5. **空中无摩擦**：松开方向键不减速（vx 保持）；按住方向键 = floatForce 持续加速到 8.5 m/s。
   落地松键才有刹车冲量 `(7·−vx, 0)`。
6. **头部撞天花板 = 上升清零**（部分跳跃距离恰好被设计成撞头后落到目标平台）。
7. 液体表面站立/慢速通过不一定致死（kill 触发与进入方式相关）；**快速坠落可能隧穿 kill 传感器**，
   且会把 `isOnLiquid` 卡在 true（此后移速被压到 ~2m/s 的水慢速状态）。金轨迹绕开一切液体。

### forest_01 地形与路线图（实测 + render-level.mjs）

完整 ASCII 图：`node scripts/baseline/render-level.mjs <参考库>/data/tutorials/levels/forest_01.json`

- 底层（row 27-28）：火人出生 (3,27)、岩浆池 cols 18-22（杀水女孩）、solid 槽位 cols 23-25、
  水池 cols 26-30（杀火男孩）、右侧底层 cols 31-38。**两人各自涉水/岩浆安全，跳过各自禁忌池**。
- 水女孩出生在 (3,23) 的独立地板（row 24, cols 0-12），右缘跳下到底层。
- 机关：pusher×2（col 31 row 11、col 11 row 15，group 5）、lever（col 9 row 20，group 4）、
  box（col 23 row 8，在板缝走廊里）、platform_0（cols 34-37 row 12，group 5，行程 row 9↔15）、
  platform_1（cols 1-4 row 15，group 4，行程 row 12↔18）。
- 门：火人门 col 33 row 5、水女孩门 col 36 row 5，站在 row 6 顶层。

**已打通的腿（金轨迹级可靠）**：出生 → 底层右行（火人跳岩浆落槽位再跳水池；水女孩坠落中按跳
自动满跳飞越岩浆溅入水池涉出）→ 右侧二层台阶（row 26/25，需脱离面助跑跳 ×2）→ row 25 墙边。
斜坡尖端（col 35.8，feet≈800）助跑满跳可落 row 22 右侧平台（cols 29-32）——已单点验证落点
col 32.2，但容差 ~±0.5 tile，需 a 键中途释放控速。

**受阻的腿（A2 未闭环的原因，全部实测定位）**：
1. row 22 右侧平台 → 左侧平台（跳绿泥 cols 24-28）：跳远了掉泥、跳近了上不了岸，容差 <±0.5 tile；
   且**沿绿泥表面步行已被证实可存活**（v13 走过 cols 27→23），可作低精度通路。
2. 左侧平台 → 拉杆层（row 20）：需 2 次 32px 跳（row 21 块 cols 15-17 为中转），未及迭代。
3. **登顶主链**：row 22 右侧 → 楔形台（rows 17-19, cols 33-38）C 斜面为**单向向下**（从中层跳下），
   从下往上被 row 25 上方 640 高度的楔形底面精确封死（跳跃顶点 feet=700 撞底面 640 下的落点
   恰好回到 row 25）。中层/顶层唯一入口是 platform_0（group 5，需 pusher 按住才动）与
   platform_1（group 4，lever 翻转驱动）——两者都在登顶之后，构成协作闭环：推测设计为
   水女孩先经左塔（row 22 左→拉杆→platform_1→row 11→pusher_0）解锁电梯，火人再跟进。
   该协作链的自动化（platform 相位等待 + 推箱走廊 + 双门汇合）留待下一轮。

## 金轨迹成品

| 文件 | 内容 | 采样 |
|---|---|---|
| `golden/forest_01_a1.json` | forest_01 前 720 帧（≈11.1s 引擎时间）：起步右跑 / 跑跳 / 高速急停 / 折返左跑 / 左跳 / 二次急停 / 静止段；9 个刚体全采样（fb/wg/2×pusher/lever/2×platform/box/ground） | 引擎真实可变 dt（avg 15.5ms） |
| `golden/forest_01_a1_fixeddt.json` | 同一输入脚本的 fixed-dt 版（对拍用） | dt 钉 16.667ms |
| `golden/*_input.json` | 对应输入脚本（与 meta.inputScript 一致） | — |

帧格式：`{f, dt, b:{tag:{x,y,a,vx,vy}}, fl:{ended,d1up,d2up,d1open,d2open,dead1,dead2,paused}}`，
坐标为 box2d 米（屏幕像素 = -32×坐标）。

## 确定性数据（同脚本双跑，逐帧最大 |Δ|）

| 模式 | fb（火人） | wg / 全部机关 | 首个分叉帧 |
|---|---|---|---|
| 引擎真实可变 dt | dx 0.571m (18.3px)、dy 0.717m @f358 | ≤2mm（box 4.7mm） | f33 |
| fixed-dt 16.667ms | dx 0.0106m (**0.34px**)、dy 1.5mm | box 4.7mm，其余 ~0 | f325 |

结论：原版引擎在真实可变帧率下**本身不具备帧级确定性**（dt 序列抖动经跳跃弧线混沌放大，
12s 内 0.57m）；对拍硬验收应使用 fixed-dt 模式（与本项目 60Hz 定步内核同构，漂移亚像素），
或对可变 dt 金轨迹采用动作级/容差比对。

## 已知限制 / 坑

- **同浏览器第二个 context 偶发关卡资源加载竞态**（level 不就绪）：已用「每 run 全新
  browser + 25s 未就绪自动重跳一次 + 整 run 重试」三重兜底。
- console.log 已被游戏覆写成 noop（init.js @2262459）；探针日志用 `window.__origLog`
  （capture.mjs 的 addInitScript 已存）。
- 页面存在无害异常 `ReferenceError: h5api is not defined`（4399 SDK 残留）与外联请求
  （analytics/cloudflare，已被路由 abort）；mp3 全部 abort（提速 + 防 IDM 劫持），不影响进关。
- `--shot` 截图有节流扰动，仅调试用；金轨迹不加。
- headless 无需 lockRender 也很快（~65 步/s）；`lockRender=true` 在纯数据模式下默认开启省 GPU。
- Windows 下 `gyのFW` 目录名含日文字符，Git Bash 传路径一律用引号包裹。
