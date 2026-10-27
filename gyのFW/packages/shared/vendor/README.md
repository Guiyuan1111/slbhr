# vendor/box2d.js — 原版引擎 Bundle（字节级原样提取）

| 项 | 值 |
|---|---|
| 来源 | `Fireboy-and-Watergirl/output/A/js/init.eb02fbdab2aa1d24.js`（2,218,873 字节，永久只读参考库） |
| 字节区间 | `[1,105,959, 1,616,882)`（起点=全文件唯一 `var COMPILED = !1,`，终点=`define("box2d",` 适配器前；脚本按锚文本动态定位） |
| 大小 | 510,923 字节 |
| SHA-256 | `d8a9edad036999053839ae5da070811e34417a6616dc39af6743f802471ee80e` |
| 复现 | gyのFW 下 `node scripts/vendor-box2d.mjs`（锚文本定位 + sha256 闸门，三处锚与 README/load.ts 一致才落盘） |

> #44 勘误：上表曾记录旧参考库（Fireboy-and-Watergun 拼写、2,273,196B、[1,132,453, 1,654,645)、522,192B、48819921…）——那是历史提取的参数，对当前参考库复现会失败。现表与当前参考库逐字节实测一致（vendor 文件本体自始未变，仅文档/脚本过期）。
| 引擎身份 | Google Closure 编译的 Box2DJS 端口（Isaac Burns 线，≈Box2DFlash 2.1a 语义），含 `b2_epsilon_sq`/`b2_aabbExtension` 等 2.1a 常量；非 planck、非 WASM |

## 内容说明

- 起于 Closure prelude（`var COMPILED = !1, goog = goog || {};`，全文件唯一），是原版 init.js 里一段顶层逗号表达式链的中段；
- 除裸 Box2D 类外还编入了 **Phaser.Physics.Box2D 插件段**（引用全局 `Phaser`，在 `load.ts` 沙箱里以最小占位满足）；
- 引擎把扁平命名空间挂到 `this.box2d`（沙箱顶层 this 等价浏览器 window）；原版 requirejs 适配器 `define("box2d", ["Phaser"], …)` @1,654,645（411 字节）**不在本切片内**，读取的正是 `this.box2d`，两侧语义已实测吻合；
- 切片末尾保留了一个衔接逗号（原文件中用于连接下一条），由 `src/box2d/load.ts` 求值时剥离——因此本文件与参考库该区间**逐字节一致**，可用 certutil/PowerShell Get-FileHash 对照。

## 已实测的积分基线（冒烟测试 `packages/shared/__tests__/box2d.test.ts`）

- 半隐式欧拉：先速度积分后位置积分。g=31.25 m/s²、h=1/60、60 步自由落体位移 = g·h²·n(n+1)/2 = 15.8854 m（=508.33px @ ptm 32）；
- 体类型枚举 static=0 / kinematic=1 / dynamic=2；
- `CreateFixture` 只接受 `b2FixtureDef`（2.1a 语义，无便捷重载）；
- 接触停稳存在 linearSlop 级残余（~0.024m），封装层不得假设精确贴合。

## 合规

官方商业游戏资产与代码，仅供本仓库（private）两人私人联机复刻研究使用；**禁止分发、公开或商用**。提取自本地参考库，无任何网络获取的二进制。
