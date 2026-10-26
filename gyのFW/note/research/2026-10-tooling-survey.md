# 外部工具链调研：GitHub 项目推荐清单（2026-10-26）

结论：本项目技术栈自足性很强（Phaser 3.90 / Colyseus 0.16 / vitest / Playwright 均为现成最优选），无需引入新框架；值得引入的是以下与痛点直接对口的工具。

## 一、痛点直接对口

### 1. 缺陷关批量重设计（15 豁免 + 2 挂起）→ Tiled
- https://github.com/mapeditor/tiled
- 关卡数据本就是官方 Tiled JSON（data/{forest,light,ice,tutorials}/levels/*.json），Tiled 编辑器可直接打开编辑与校验；其 JS 脚本（Automation）可写批量检查器：死路检测、图块属性/出生点/机关完整性校验，是 L×N 重设计的产线工具。

### 2. 手搓限流的维护负担（#21 伪造头 + 无界内存）→ express-rate-limit
- https://github.com/express-rate-limit/express-rate-limit
- 内置 X-Forwarded-For 等头部信任校验（validations）与有界 memory store，直接替换自研 matchmake 限流，删掉一块自维护安全面。

### 3. 安全响应头 → helmet（一行接入）
- https://github.com/helmetjs/helmet
- 审计批 #21–#33 的自然延伸：Express 静态面一行挂上 CSP 等安全头。

### 4. 公网穿透选型（待裁决项）→ 三选一
- frp：https://github.com/fatedier/frp （Go，生态成熟、配置最灵活）
- rathole：https://github.com/rapiz1/rathole （Rust 单二进制、轻量高性能、配置极简）
- cloudflared：https://github.com/cloudflare/cloudflared （Cloudflare Tunnel：无公网 IP 也能开服，但流量过 CF）

### 5. "版本六处手改 + 发版记" → changesets
- https://github.com/changesets/changesets
- npm workspaces 原生支持（fixed/linked 模式锁三包同版本），版本号、CHANGELOG、Release PR 自动化；发版流程从手工清单变成 changeset add + changeset version。

### 6. 依赖 CVE 手动升级 → GitHub 原生 Dependabot（非独立项目）
- 文档：https://docs.github.com/dependabot
- dependabot.yml 按 workspace 分组自动开升级 PR；与现有 CI 审计 job 互补（audit 只报警，Dependabot 给补丁）。

### 7. 内核不变量与随机探索 → fast-check
- https://github.com/dubzzz/fast-check
- TS 性质测试：随机输入序列（数千例）下断言内核不变量——角色不出墙体、双角色状态机合法迁移、同输入重放同状态哈希；也是 S5 机器探索的轻量前置（随机游走 + 金轨迹对拍）。

### 8. visual-diff 口径重定 → pixelmatch
- https://github.com/mapbox/pixelmatch
- 业界标准像素对比（Playwright 截图断言同款内核），感知权重/AA 阈值可调；"量具会撒谎"的分歧可先与它的口径对齐再定自家阈值。

## 二、调试 / 参考（不引入代码）

### 9. 房间状态可视化 → @colyseus/monitor
- https://github.com/colyseus/colyseus-monitor
- 活跃房间列表 + 状态/客户端实时检查；注意服务端是 Colyseus 0.16，需装与 0.16 配套的 monitor 旧版（npm 最新 0.18.6 面向 0.18）。

### 10. Box2D 权威参考 → box2d.js / box2d 上游
- https://github.com/kripken/box2d.js （与内核同代的老牌 Box2D JS 移植，查 b2 API 语义时可读参考）
- https://github.com/erincatto/box2d （C++ 上游，求解器行为权威）
- 仅作查阅，不 vendor 进仓库（保持与原版 init.js 逐字节一致原则）。

## 三、核实后明确不采用

- **Flash 工具链（FFDec / Ruffle / swf-parser）**：原版是 HTML5（4399 内核）而非 Flash，资产与关卡数据已逐字节 md5 对齐，无 SWF 可解。
  - https://github.com/jindrapetrik/jpexs-decompiler
  - https://github.com/ruffle-rs/ruffle
  - https://github.com/open-flash/swf-parser
- **第三方物理引擎（Matter.js / Planck.js / Fx2D 等）**："与原版逐位一致"的目标决定内核只能用从原版 init.js 按字节抽出的 Box2D；任何第三方引擎都换基线。
  - https://github.com/liabru/matter-js
  - https://github.com/shakiba/planck.js

## 附：优先级建议

1. Tiled（解锁缺陷关重设计产线，当前最大瓶颈）
2. changesets（发版纯手工，收益/成本比最高）
3. express-rate-limit（删自维护安全面）
4. fast-check（内核质量网加密）
5. 公网穿透三选一（等选型裁决后落地）
6. 其余按需。
