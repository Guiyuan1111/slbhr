# 联机架构决策记录：为什么重写而非改造原版 HTML

**日期**：2026-10-03
**结论**：原生在线联机必须自建服务端权威模拟（本项目的 Colyseus 60Hz 架构）；在原版 HTML 客户端上改造出可信联机在技术与合规上都不成立。此决策有本地实证与 Steam 官方发行版双重佐证。

## 一、原版是闭源编译黑盒（本地实证）

- 复刻基准 `Fireboy-and-Watergirl` 文件夹（只读）中，游戏全部逻辑在单一打包文件
  `output/A/js/init.eb02fbdab2aa1d24.js`：**2,273,196 字节 / 54,323 行压缩混淆代码**，requirejs 加载。
- 文件头注释自证封闭性：*"The code in the game disables console.log"*、*"Don't edit this in console"*。
- 玩家坐标、物理、死亡、钻石、拉杆、移动平台状态全部锁在运行时内部内存，**无源码、无 API、无状态导出口子**——联机所需的"读写游戏状态"无从下手。

## 二、前人已试过并失败：按键转发方案（实物在原版仓库）

原版仓库携带一份 `multiplayer.js`（`Fireboy-and-Watergirl/multiplayer.js` 与 `output/multiplayer.js` 两份），思路：

1. PeerJS 1.5.1（CDN）P2P 连接，主机 `?host=1`、客机输房间码；
2. **双方各自跑一份完整游戏**，只互相转发键盘按键，收到后 `new KeyboardEvent()` 本地模拟对方按键；
3. 客机用 capture 相位监听屏蔽本地键盘，仅收主机转发。

**致命缺陷：只同步输入，不同步状态。** 两边物理模拟各自独立——移动平台相位、帧率波动、加载时间差、内部随机数，几秒内两边画面必然漂移：一方看到的火人站在平台，另一方可能已判死；钻石计数、死亡判定、开门进度互不一致。没有权威裁决者，无法玩需要精确配合的关卡。

## 三、联机的本质要求：单一权威状态源

原版设计为双人**同屏**（两人读写同一块本地内存，零延迟、天然一致）。拆到两台设备后必须回答"状态冲突听谁的"：

- 服务器权威模拟（我们的选择）：全部判定在服务器算，客户端只渲染+发输入；
- 或确定性锁步（要求干预模拟循环内部，闭源黑盒做不到）。

这就是本项目 `packages/server`（Colyseus 房间 + 60Hz 权威 tick）存在的意义。0.2.0 验收以双浏览器真联机通关 ×3（60.3–60.7s、0 死亡）实证该架构可行。

## 四、Steam 官方发行版也未做原生在线联机（2026-10-03 查证）

Steam 官方分类 API（appdetails）实时数据：

| 游戏 | 联机相关官方分类 | Online Co-op |
|---|---|---|
| [Fireboy & Watergirl 1: The Forest Temple](https://store.steampowered.com/app/5084260/)（2026-09-01 发售） | Multi-player · Co-op · Shared/Split Screen Co-op · Shared/Split Screen · Remote Play Together | ❌ 无 |
| [Fireboy & Watergirl: Elements](https://store.steampowered.com/app/1003480/)（2019-01-24 发售） | 同上 | ❌ 无 |

- Forest Temple 官方描述原话：*"You can play with a friend **on the same device** or with **Steam's Remote Play Together**."*
  （[商店页](https://store.steampowered.com/app/5084260/) / [appdetails API](https://store.steampowered.com/api/appdetails?appids=5084260&cc=us&l=en)）
- Elements 分类数据：[appdetails API](https://store.steampowered.com/api/appdetails?appids=1003480&cc=us&l=en)
- Steam 分类体系中 **Online Co-op 是独立标签**，以上两款均无。
- **Remote Play Together ≠ 游戏内联机**：它是 Steam 的画面串流（一人持有游戏，画面流出、好友输入流回），即"远程输入+串流"方案的官方版，延迟受网络支配。第三方比价站（如 GG.deals）把它标成 "online co-op" 属误导性标注。
- 引擎形态：系列 2009 年为 Flash 游戏，后整体转 HTML5；Steam 版是 HTML5 构建打包的桌面发行（TCRF 平台标注 HTML5/Android/iOS/Windows/Mac）。具体封装器未从权威源核实（PCGamingWiki 拒绝访问、Fandom 超时），不下断言——但同为闭源客户端、无 mod API，性质与网页版一致。

## 五、推论与合规

- 连版权方（Oslo Albet / BulkyPop 发行）自己都没做原生在线联机——它必须重写权威模拟层，黑盒上做不到。本复刻版的联机功能**超越官方所有发行版本**。
- 合规边界不变：官方素材仅供两人私用，不上线不分发不商用；复刻基准文件夹保持只读（往里注入脚本直接违约）。

## 附：IDM 防护（浏览器自动化标准前置措施）

用户实测 IDM 会按 URL 媒体扩展名在网络层劫持请求（被劫持请求返回 204/0 字节，`--disable-extensions` 无效）。任何自动化开浏览器前必须先部署防护：

- **正片**：音频走无扩展名路由 `/assets/audio/s/:name`（服务器补 `.mp3`、octet-stream 返回），不进 IDM 接管名单；
- **自动化访问原版参考页**：三层防护——浏览器内 `page.route` 正则拦截全部媒体请求（不产生 socket，IDM 失明）+ 代理层媒体一律 204 + 屏蔽一切外联域名。
