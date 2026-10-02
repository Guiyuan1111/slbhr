# 《Fireboy & Watergirl 1: The Forest Temple》Steam 版技术分析报告

- **分析对象**：Steam 版《森林冰火人 1：森林神庙》
- **游戏安装目录**：`D:\SteamLibrary\steamapps\common\Fireboy & Watergirl 1 The Forest Temple`
- **Steam AppID**：5084260（来自根目录 `steam_appid.txt`，7 字节纯数字）
- **分析方式**：纯静态分析（4 路并发子任务：Electron 外壳与 Steam 集成 / 引导链与引擎 / 关卡数据与资源 / 玩法逻辑与存档），未运行游戏、未读取任何图片内容
- **分析日期**：2026-10-02

---

## 1. 摘要（TL;DR）

这款 Steam 版"森林冰火人"**不是原生游戏，而是一个 2019 年构建的 Electron 3.1.13（Chromium 66 / Node 10.2）壳，里面装着一个 HTML5 移动版游戏工程**。游戏引擎为 **Phaser 2.6.2**（渲染 Pixi.js 2.2.9，关卡物理实际使用 box2d-web 2.3.0），全部游戏代码被 r.js 优化器打包成单个 1.79 MB、55 行、无 source map 的压缩文件 `www/js/init.js`（约 138 个命名 AMD 模块）。关卡是数据驱动的 **Tiled 地图 JSON**（共 32 关），Steam 集成通过 **greenworks**（Steamworks API 的 Node 绑定）完成，但仅用到成就功能，且**全游戏只有 2 个成就 ID**（`GAME_UNLOCKED` / `GAME_COMPLETE`）。代码中残留大量移动版移植痕迹（被注释的 Google Analytics、AdMob 空配置、看广告复活开关、PWA manifest、Kizi 平台 logo），证明本作由 Oslo Albet 的 HTML5 移动版工程"换配置 + 套 Electron 壳"直接移植上架 Steam。

---

## 2. 发行包整体结构

```
Fireboy & Watergirl 1 The Forest Temple\          ← Electron 3.1.13 运行时（v3.1.13 见 version 文件）
├── FbwgForest.exe                71,216,640 B   ← Electron 主程序（FileVersion 1.0.0，CompanyName "GitHub, Inc."）
├── steam_appid.txt               内容 "5084260"  ← Steamworks AppID 匹配
├── steam_api.dll / steam_api64.dll + .lib       ← Steamworks SDK 4.28.51.07（2017-12-15 构建，含无用链接库）
├── sdkencryptedappticket(.lib/.dll) ×2          ← 加密应用票据库（greenworks 静态依赖，游戏未调用）
├── node.dll（Node 10.2.0）/ ffmpeg.dll / libEGL / libGLESv2 / d3dcompiler_47 / icudtl.dat …
├── locales\                      54 个 .pak     ← Chromium 本地化资源
└── resources\
    ├── electron.asar                            ← Electron 自带占位
    └── app\                                     ← 游戏应用目录（未打 asar，electron-packager 13.x 默认行为）
        ├── main.js               59 行          ← Electron 主进程（官方模板代码级简短）
        ├── package.json                         ← "com.osloalbet.forest" v1.0.0
        ├── node_modules\greenworks\             ← Steamworks 绑定（详见第 4 节）
        └── www\                 189 文件/25.69MB ← 游戏本体（HTML5 应用）
            ├── index.html                       ← 页面壳：greenworks 初始化 + RequireJS 启动
            ├── game.json / manifest.json        ← 运行时配置 / PWA 清单
            ├── js\init.js       1,789,278 B     ← 全部游戏代码（单文件 bundle）
            ├── bower_components\requirejs\      ← RequireJS 2.2.0（唯一随包发布的库目录）
            ├── data\forest\ + data\tutorials\   ← 关卡 JSON（Tiled 格式）
            └── assets\          136 文件/23.38MB ← 图集/音频/字体/图片/瓦片集定义
```

**技术栈版本一览**（均有二进制/代码内字符串证据）：

| 组件 | 版本 | 证据位置 |
|---|---|---|
| Electron | 3.1.13 | 根目录 `version` 文件；exe 内嵌 UA `Electron/3.1.13` |
| Chromium | 66.0.3359.181 | `FbwgForest.exe` 内字符串 |
| Node.js | 10.2.0 | `node.dll` 内 `node.js/v10.2.0` |
| Phaser | 2.6.2 | `www/js/init.js` 内 `VERSION:"2.6.2"` |
| Pixi.js | v2.2.9 | init.js 内 `b.VERSION="v2.2.9"` |
| Box2D (box2dweb) | 2.3.0 | init.js 内 `b2Version(2,3,0)` |
| RequireJS | 2.2.0 | `www/bower_components/requirejs/require.js` 文件头 |
| Hammer.js | 2.0.7 | init.js 内 `VERSION="2.0.7"` |
| underscore / Backbone | 1.8.3 / 1.3.3 | init.js 内版本字符串 |
| greenworks | 0.14.0（pin master commit `3ea4ab49`） | `package-lock.json`；原生模块 PE 时间戳 2021-10-03 |

---

## 3. 启动流程（从双击 exe 到游戏画面）

依据 `resources/app/main.js`、`resources/app/www/index.html`：

1. Steam 启动 `FbwgForest.exe`；Electron 按 `resources/app/package.json` 的 `"main": "main.js"` 执行主进程。
2. 主进程创建 **1280×720** `BrowserWindow`（`fullscreenable: true`，`devTools: true`；源码注释保留旧尺寸 1200×900），加载 `www/index.html`。
   - 未显式关闭 `nodeIntegration`（Electron 3 默认开启）——这是渲染进程能 `require("greenworks")` 的前提。
   - 注册全局快捷键 **Ctrl+Shift+F12** 切换 DevTools；未移除默认菜单栏。
3. 渲染进程执行 `index.html` 内联脚本：
   - `require("greenworks")` → `greenworks.init()` 初始化 Steamworks；成功则向 console 打印成就名单 / AppId / 安装目录；
   - **失败路径**：catch 块在黑屏上居中显示错误文本并 `throw "Steam is not running..."`——但该 throw 只终止当前 script 块，**后面的 RequireJS 标签照常执行，游戏仍会以"无成就"降级模式运行**（游戏侧对 `window.greenworks` / `goFullScreen` 均有判空保护）；
   - 注册 `window.goFullScreen()`（全屏切换）与 **Escape 退出全屏**；删除 `window.require/exports/module` 并保留 `nodeRequire`（避免 Node 与 AMD 冲突）。
4. RequireJS 以 `data-main="js/init.js"` 启动：init.js 本身就是 r.js 打包的单文件 bundle，末尾 `require.config({baseUrl:"js", deps:["main"]})` 命中 bundle 内已注册的 `define("main",...)`，游戏代码零额外网络/磁盘请求。
5. `main` 模块创建 `new Phaser.Game({renderer: AUTO, parent: "container", isElectron: true, devSkipAds: true, disableVibration: true, ...})`，注册全部 state，进入 `States/Boot`（动态加载 `game.json` 与预载图集）→ `States/Load` → 主菜单。

> 注意：`www/js/` 下只有 `init.js` 一个文件是正常的——所有源码模块在构建期已内联为命名 `define()`；`require.config` 中 `paths` 指向的 `bower_components/phaser/...` 等物理路径在发布目录中不存在，属残留配置。

---

## 4. Steam 集成层（greenworks）

### 4.1 模块与版本

- 依赖声明：`"greenworks": "git+https://github.com/greenheartgames/greenworks.git"`（master，无版本号），lock 文件 pin 到 commit `3ea4ab490b56676de3f0a237c74bcfdb17323e60`，版本字段 0.14.0；构建机路径泄露为 `D:\dev\javascript\fb\electron`。
- `node_modules/greenworks/lib/greenworks-win64.node`（658,944 B，PE 时间戳 2021-10-03）为实际加载的原生模块，导入 `node.dll`、`steam_api64.dll`、`sdkencryptedappticket64.dll`。
- **包内存在三份 Steam API DLL**：根目录 `steam_api(64).dll` v04.28.51.07（2017-12-15 构建）与 `greenworks/lib/steam_api64.dll` v06.75.97.18（2021-09-10 构建），MD5 互不相同；由于 Windows 从 `.node` 同目录优先加载依赖，运行时更可能使用 greenworks 自带的 2021 版（此点为推断，两份都在、依赖总能满足）。根目录还散落着运行时无用的 `.lib` 链接库，属整目录拷贝的打包冗余。

### 4.2 实际用到的 Steam 功能：仅成就，且只有 2 个 ID

游戏代码中全部 greenworks 调用（`www/js/init.js` 压缩代码内定位）：

| 成就 ID | 触发条件（`ProgressModel` 逻辑） |
|---|---|
| `GAME_UNLOCKED` | 首次达成"游戏完成"：所有正式关卡（id≠0）均至少获得 1 星（有 best 记录） |
| `GAME_COMPLETE` | 首次达成"完全完成"：所有正式关卡全部 3 星（同时也会补发 `GAME_UNLOCKED`） |

- 触发时机：通关后**返回选关图**时由 `LevelMenu.afterAddContent` 检查 `firstComplete/firstTotalComplete` 标志并发送；成功/失败仅 console.log。
- 成就名单来自 Steam 后台配置（启动时 `getAchievementNames()` 只打进 console）。
- 隐藏后门：`window.devResetAchievements()` 可遍历所有成就逐个 `clearAchievement` 重置（开发用途）。
- **未使用**的能力：云存档（存档纯本地 localStorage）、Overlay（`activateGameOverlay` 调用被注释）、Rich Presence、统计（stats）、创意工坊——尽管 greenworks 绑定本身暴露了成就/统计/云/Overlay/好友/票据/UGC/大厅等约 80 个 API。`sdkencryptedappticket.dll` 只是 greenworks 自 v0.8.0 起的强制静态依赖，游戏代码零调用。

---

## 5. 游戏代码组织（init.js 单文件 bundle）

`www/js/init.js`：1,789,278 字节 / 55 行（超长压缩行），**无 source map**（全文件 0 处 `sourceMappingURL`）。标识符已混淆，但 r.js 的命名 `define("模块名")` 使模块结构完全可辨认，约 138 个模块：

- **行 1–4** p2.js 物理引擎（Phaser 2 内置，本作未主用）；**行 5–8** Pixi.js 2.2.9；**行 9** js-signals；**行 10–25** Phaser 2.6.2 核心；**行 26–40** box2d-web 2.3.0（本作关卡物理实际使用）；**行 40–55** 游戏自有代码 + underscore/jQuery 等。
- **状态机模块**：`States/Boot`、`States/Load`、`States/Menu/*`（TempleHall、TempleSelector、MultiMenu…）、`States/LevelMenu/*`（LevelMenuTree/Grid/Button）、`States/Settings/*`、`States/Credits/*`、`States/Complete/*`、`States/TutorialPrompt/*`。
- **关卡运行时**：`States/Level/Level`、`Ground`、`MechManager`、`CameraManager`、`RespawnManager`、`LevelUI`、`PauseMenu`、`GameOverMenu`、`EndMenu`、`Clock`。
- **机关（Devices/，31 种）**：Portal、Lever、Pulley、Slider、Pusher、TimedPusher、LightPusher、Wind、Snow、RotMirror、InfiniteMirror、Beamer、Liquid、Diamond、Door、FairyCup、Box/BoxHeavy/BoxMirror 等——本作关卡数据只用到其中一部分（见第 7 节），其余是为系列其他"神庙"准备的通用引擎能力。
- **角色（Characters/）**：MainCharacter、Fairy、FatCharacter、JumpCharacter、SmallCharacter、FriendCharacter（后几种本作未上场）。
- **本地化**：`utils/lang/langs/{en,de,fr,es,it,nl,ru,cn}` 8 种语言字典。
- **移动版遗留**：`Ads/AdManager`（Provider 硬编码为 `NonProvider` 空实现，showAd 全 no-op）、`FakeStore`（内购模拟）、`TouchManager`/Hammer.js 触摸链。

### game.json 配置解读（运行时由 Boot 状态加载）

```json
{"id":"forest","type":"legacy","assets":"forest","temples":"forest",
 "canRevive":false,"skipTutorial":true,"ADMOB_APP_ID":"","ADMOB_UNIT_ID":"","ADMOB_UNIT_ID_REWARDED":""}
```

| 字段 | 含义 |
|---|---|
| `id:"forest"` | 应用实例 id；localStorage 命名空间 `setNamespace("fb-"+id)` → 存档键 `fb-forest:*`（移动版旧 id 为 `fairytales`） |
| `type:"legacy"` | "经典复刻"产品线标记（同一引擎家族还发布过 Ice/Light/Crystal/Elements 等神庙） |
| `temples:"forest"` | 多神殿引擎只启用森林神殿（对应 `data/forest/temple.json`） |
| `canRevive:false` | 关闭移动版"死亡后看广告复活"（`ReviveButton` 不显示） |
| `skipTutorial:true` | 跳过首次教程询问（第 1 关本身仍是教程关） |
| `ADMOB_*` 全空 | 移动版 AdMob 广告位残留；Steam 版广告代码已被剥离为 NonProvider |

---

## 6. 关卡数据（Tiled JSON，数据驱动）

### 6.1 关卡清单 `www/data/forest/temple.json`

- **32 关确认**：`levels` 数组恰 32 项（id 1–32）；文件 = `data/forest/levels/forest_02~32.json`（31 个）+ `data/tutorials/levels/forest_01.json`（第 1 关，带教程）。
- 每关节点：`{id, x, y, filename, time, mobileTime, required, type, initial}`——`x/y` 为选关树坐标；`time` 桌面双人目标时限（秒），`mobileTime` 单人触控时限（移动版计分残留）；`edges` 数组构成有向解锁图（有分支，如第 4 关分出 4 条支线）。
- 关卡类型：**普通 16 关**、**speed 限时冲刺 7 关**（3/6/12/14/16/21/26）、**puzzle 银钻谜题 9 关**（7/11/13/17/20/23/27/29/32，每关恰 1 颗银钻）。

### 6.2 关卡文件格式（以 `forest_02.json` 为例）

标准 **Tiled 地图 JSON**（`tiledversion 1.1.3`，tileset 部分由 Tiled 1.6.0 导出，新旧混用）：

- 地图 39×29 格 × 32 px（=1248×928 px，各关统一；个别教学关例外）。
- **三个图层**：
  - `Ground`（tilelayer）：一维 gid 数组。瓦片语义由 tileset JSON 的 `tileproperties.type` 定义：**0=实心地面**（引擎将横向连续块合并为单个 Box2D 多边形）、1–4=四种切角斜面、**5=水**（淹死火人）、**6=岩浆**（烧死水人）、**7=绿酸**（双杀）、8/9=液体岸壁斜坡、10=纯装饰、**55=初始冻结的水（冰面）**。
  - `Chars`（objectgroup）：角色/门/钻石。gid 引用 Chars tileset：tile0=火娃出生点（`char:fb`）、tile1=水娃出生点、tile2/3=火/水出口门、tile4=红钻（仅火人可拿）、tile5=蓝钻（仅水人可拿）、tile6=银钻（谜题关，任何人可拿）、tile7=双人通用钻（本作未用）。
  - `Objects`（objectgroup）：机关。两种写法——gid 引用 Objects/LargeObjects tileset（pusher、lever、box、wind、portal…）或无 gid 的几何 shape（`platform{dx,dy}`、`hanging`、`pulley`、`roman{polygon}`）。
- **格式陷阱**：各关 tileset 的 `firstgid` 分配不一致（多数为 Ground=1/Chars=16/Objects=23，但 forest_14/16/20 等为 Objects=16/Chars=32，forest_03/26 仅 2 个 tileset…），解析 gid 必须按每关自身的 firstgid 表换算。
- `assets/tilemaps/tilesets/` 下只有 4 个 tileset 定义 JSON（Ground/Chars/Objects/LargeObjects），**没有对应 PNG**——运行时 tileset 只提供"语义"（碰撞类型/实体种类），全部像素由 `assets/atlasses/` 图集程序化绘制。

### 6.3 全 32 关实体统计

| 实体 | 数量 | 实体 | 数量 |
|---|---|---|---|
| 火娃/水娃出生点 | 各 32 | 火/水出口门 | 各 32 |
| 红钻石（火人） | 161 | 蓝钻石（水人） | 159 |
| 银钻石（谜题关） | 9 | 移动平台 platform | 98 |
| 拉杆 lever | 49 | 踏板按钮 pusher | 47 |
| 风扇 wind | 24 | 推箱 box | 14 |
| 滚球 ball | 12 | 吊摆 hanging | 8 |
| 滑轮 pulley | 6 | 跷跷板 roman | 3 |

（forest_06、forest_12 为纯地形关，无 Objects 层。）

---

## 7. 核心玩法逻辑（均自 init.js 压缩代码定位验证）

### 7.1 死亡判定（`Character.liquidTouched`，逐字验证）

```js
if (7===a || ("fb"!==this.char && 6===a) || ("fb"===this.char && 5===a)) return this.kill()
```

- **绿酸（7）：任何角色碰即死**；**岩浆（6）：除火人外全灭**；**水（5）：只有火人碰即死**（水人免疫）。
- 掉出地图边界同样判死。死亡演出：46 帧 `death_smoke` 烟雾 + 死亡音效 + BGM 切换 → GameOver 菜单（本作 `canRevive:false`，无复活按钮）。

### 7.2 钻石与过关

- 红钻仅火人、蓝钻仅水人可拾取；银钻/通用钻任意角色。拾取判定：`"silver"===char || "fbwg"===char || character.char===diamond.char`。
- **过关条件**：两名角色分别站上自己的出口门使门完全升起（`door1.isUp && door2.isUp`）→ 停止物理 → 双人上楼梯动画（1.6s）→ 结算。
- **任一角色死亡 → GameOver**（无中途复活，只能重试）。

### 7.3 机关联动（`MechManager` 按 `properties.group` 分组）

- 同 `group` 编号的机关同步：**拉杆保持状态**（教程文案"Levers remain as you left them"），**踏板必须持续压住**（"Pushers however must be held"），状态变化广播给同组的平台/推块等。
- 移动平台用 `dx/dy`（平移速度）或 `dtheta`（旋转摆）+ Box2D prismatic/revolute 关节电机；跷跷板按 polygon 多边形生成；吊摆支持整圈旋转。
- 箱子/滚球可被推动，用于压住机关。

### 7.4 角色物理参数（`MainCharacter`）

`jumpVelocity=16.5`、`runForce=50`、`defaultMaxSpeed=8.5`、`waterIceMaxSpeed=2`（涉水/冰面强制减速）、`feetFriction=0.5`；跳跃需脚部接触法线朝上（`y>0.2`）或 ≥2 个接触点。未上场的胖/小/跳朋友角色各有独立参数（如 jump 角色 `jumpVelocity=23`）。

### 7.5 重生检查点（`RespawnManager`）

每 666ms 检查全员"存活、双脚着地、速度<0.01、无按键、踩在法线朝上的地面"→ 抓取快照，最多保留 5 个；重试时恢复距死亡 1s 前的最新检查点（角色/钻石/机关状态）。

### 7.6 输入控制（`CharCursors`）

| 按键 | 作用 |
|---|---|
| 方向键 ←↑→ | 火娃移动/跳跃 |
| W / A / D | 水娃跳跃/左/右 |
| Space | 单人模式切换操控角色 |
| P | 暂停/继续 |
| R | 暂停中=重试本关；结算/死亡菜单中=重试 |
| Escape | 暂停中=退回菜单；任意时刻=退出全屏 |

控制模式 `settings.controls`：`keyboard`（双人同键盘，桌面默认）/ `single`（单人轮流）/ `dual`（移动端双摇杆）。

### 7.7 计时与星级评分

- 每关 `Clock` 计时（MM:SS），开局镜头动画后起表，暂停停表。
- **普通/speed 关**：完成=1 星；钻石全收 +1；时间 ≤ 目标（`time` 或单人用 `mobileTime`）+1，最多 3 星。
- **puzzle 关**：拿到那颗银钻且钻石全收=3 星，否则 0 星（不计通关）。
- 最佳记录逐级比较：星多 > 钻多 > 时间短。存档驱动全局标志 `gameComplete`（全关 ≥1 星）/ `gameTotalComplete`（全关 3 星）→ 对应两个 Steam 成就。

### 7.8 场景状态机

```
boot → load → menu(TempleHall：开始/设置/制作名单/语言/全屏)
              → levelMenu（32 关树状选关；菱形宝石图标，帧 0-4 = 锁/开/1/2/3星）
              → level（P 暂停 → PauseMenu；教程关内嵌 Tutorial_dual/single/keyboard 三套提示层，8 步）
              → endGame（EndMenu 结算：完成/钻石/时间三连勾 → 石碑星级动画；或 GameOverMenu）
              → gameComplete（撒花庆祝，达成全成就条件时）
```

---

## 8. 存档系统

- 存储：PhaserSuperStorage 插件，底层 localStorage；命名空间 `"fb-forest:"`：
  - `fb-forest:progress`：Backbone Model 序列化 JSON——`temples`（每关 `best={stars,diamonds,time,silverDiamond}`、`played`、`locked`、`state`）、`gameComplete`、`gameTotalComplete`、`reviveTokens`（本作不生效）。
  - `fb-forest:settings`：`{vibrate, music, fx, controls, lang}`（8 种语言）。
- 解锁逻辑：通关（state>1）沿 `edges` 把相邻关卡从 0（锁）置 1（开）；state 2/3/4 = 1/2/3 星。
- 清档入口：设置内 erase（`storage.clear()`）。
- **无 Steam 云存档代码**——换机器进度不随行。

---

## 9. 资源清单（`www/assets/`，136 文件 / 23.38 MB）

| 类别 | 规模 | 要点 |
|---|---|---|
| 图集 atlasses | 15 对 json+png（3.62 MB）+ 森林神殿 1 对 | TexturePacker/Phaser JSON Hash 格式。`CharAssets`（239 帧：火/水娃全套动画含 45 帧死亡烟雾）、`FriendsAssets`（855 帧：未上场的第 4 代角色）、`GroundAssets`（343 帧：地面 + 水/岩浆/绿酸 15 帧动画）、`MechAssets`（188 帧机关）、`TempleIcons`（**7 神殿图标**，通用引擎铁证）等 |
| 音频 audio | 39 个 mp3（3.03 MB） | 死亡/吃钻/开门/拉杆/推块/平台/传送门/风/冻结融化等音效；火/水脚步与跳跃分角色；BGM：MenuMusic、LevelMusic（1.3MB）及通关/失败/冲刺变体 |
| 字体 fonts | 8 fnt + 22 png（10.01 MB） | BMFont 位图字体，主字体 **TrajanPro-Regular**（罗马碑刻体，契合神庙主题）；另有 1024×2748 的**中文位图字库**（`chinese/font.fnt`），但语言菜单仅暴露 7 种语言（de/en/es/fr/it/nl/ru），中文是否可达未在配置中找到入口 |
| 图片 images | 19 png + 10 jpg（5.06 MB） | **9 座神殿大厅背景**（本作只用 Forest）、各系列标题字、`branding_logo_kizi.png`（**Flash 门户时代发行商遗留**）、`stores/{steam,android,ios,microsoft}.png` 四商店图标 |
| 瓦片集定义 | 4 json（12 KB） | Ground/Chars/Objects/LargeObjects 的语义映射（见 6.2） |

另：`data/tutorials/levels/` 中还有 ice/light/wind/crystal/fairies 等其他神殿的教学关（未被 temple.json 引用），与 `FriendsAssets`、7 神殿图标共同证明这是 **Fireboy & Watergirl 全系列通用引擎的"单神庙精简发布"**。

---

## 10. 移动版移植痕迹与工程观察

1. **血缘关系实锤**：index.html 中两段被整体注释的 Google Analytics（gtag `G-8RSVZN6LGC` / ga `UA-208543346-1`），内含 `capacitor://` 协议适配注释和读取 `fb-fairytales:settings` 的代码——移动版应用 id 为 `fairytales`（合集 App），Steam 单作品版改为 `forest`，存档前缀随之变为 `fb-forest:`。
2. **商业功能剥离方式是"配置关闭"而非删除**：AdMob 字段留空、广告 Provider 编译为 NonProvider 空实现、`canRevive:false` 关闭看广告复活、`devSkipAds:true`、`skipTutorial:true`；但 FakeStore（内购模拟）、reviveTokens、TouchManager、Hammer.js 触摸链、`mobileTime` 计分目标全部保留在包内。
3. **PWA 痕迹**：`manifest.json`（`display:"fullscreen"`、`orientation:"landscape"`、三档 icon）说明同一 Web 构建曾以 PWA/移动 Web 形态发布，Electron 壳直接沿用整套 Web 产物。
4. **供应链时间线有趣**：2019-07-30 构建的 Electron 3.1.13 外壳（GitHub, Inc. 默认产品信息未改）+ 2021-10-03 为其重编译的 greenworks master 原生模块 + 2017/2021 两套 Steamworks DLL 并存 + 无用的 .lib 链接库——典型的"老壳新芯"快速上架。
5. **安全面**：渲染进程保留完整 Node 集成（`require` 可用）+ DevTools 快捷键开启（Ctrl+Shift+F12）+ 游戏代码未加载任何远程内容（全本地），本地单机风险面很小；但 Electron 3/Chromium 66 距今已非常老旧。
6. Steam 初始化失败时游戏**不会拒绝运行**（throw 不阻断后续 script），仅丢失成就功能——比常见的"强校验"实现宽松。

---

## 11. 局限与未验证项

以下事项在静态分析中无法确认，如实标注：

- 运行时实际加载哪份 `steam_api64.dll`（2017 根目录版 / 2021 greenworks 版）为推断，未运行动态验证。
- Steam 后台实际配置的成就显示名/图标（`getAchievementNames()` 名单仅打印进 console，且游戏 log 关闭时 console.log 为空函数）。
- p2 物理引擎具体小版本（压缩代码中无独立 VERSION 字符串）。
- 中文字体是否可通过隐藏入口启用（字库存在但语言菜单未暴露）。
- `type:"legacy"` 的完整取值域需对比同系列其他作品才能确认。
- 未运行游戏，所有"运行时行为"结论均来自代码路径推演（如 Steam 失败降级、成就触发时机）。

---

## 附录：关键文件路径索引

| 内容 | 路径 |
|---|---|
| Electron 主进程 | `D:\SteamLibrary\steamapps\common\Fireboy & Watergirl 1 The Forest Temple\resources\app\main.js` |
| 页面壳（Steam 初始化） | `...\resources\app\www\index.html` |
| 游戏全部代码 | `...\resources\app\www\js\init.js` |
| 运行时配置 | `...\resources\app\www\game.json` |
| 关卡清单 | `...\resources\app\www\data\forest\temple.json` |
| 关卡文件（样例） | `...\resources\app\www\data\forest\levels\forest_02.json`、`...\data\tutorials\levels\forest_01.json` |
| 瓦片语义定义 | `...\resources\app\www\assets\tilemaps\tilesets\{Ground,Chars,Objects,LargeObjects}.json` |
| Steamworks 绑定 | `...\resources\app\node_modules\greenworks\` |
| greenworks 源码仓库 | https://github.com/greenheartgames/greenworks （package.json 中声明的 git 依赖） |
