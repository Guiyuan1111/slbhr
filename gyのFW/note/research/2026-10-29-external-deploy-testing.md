# 外网真机测试报告（2026-10-29）

> 被测目标：`http://110.42.36.114:2567`（1.0.3 部署实例）
> 测试方：本地开发机，全部测试脚本在 `TEMP/`，**未在服务器上做任何写操作**
> 服务器侧只执行两件事：`journalctl` 读日志、按部署流程换版

## 一、结论

对外服务可用。双人联机、服务端权威同步、断线重连、多房间并发、触屏操作全部实测通过。
发现并修复 3 个缺陷，其中 2 个是文档/测试脚本问题，1 个是真实的窄屏 UI 缺陷（1.0.4 已修）。

| 测试面 | 结果 |
|---|---|
| 基础探活 + 安全头 + 静态资源 | 全绿 |
| 双客户端联机（2 轮 × 6s） | 全绿，双端各 ~60 patch/s |
| 双浏览器真人操作（建房 / 邀请链接 / 按键位移） | 全绿，坐标两端一致 |
| 多关卡冒烟（12 关：general/speed/puzzle/bonus/变体） | 全绿 |
| 断线重连（断网→paused→恢复→started / 刷新回座） | 全绿 |
| 并发（5 房并行）+ 超员拒绝 + 清空后重建 | 全绿 |
| 触屏（iPhone 三键虚拟按键） | 全绿（跳跃 Δy=33px、右移 Δx=303px） |
| 多端适配（4 档视口） | 进 Game 全绿；**HUD 窄屏裁切已修** |
| 服务器日志（近 2 小时） | 零错误、零重启、内存 66MB |

## 二、实测数字

**基础面**

```
/healthz      200  0.176s
/              200  0.361s  25,897 bytes
/api/levels    200  0.179s  626 bytes（48 关）
index-DttC88Wo.js     200  117,843 bytes
phaser-BMeCXOGt.js    200  1,482,296 bytes
colyseus-BEjLCa9D.js  200  128,894 bytes
```

安全头齐全：`X-Content-Type-Options: nosniff`、`X-Frame-Options: DENY`、
`Referrer-Policy: no-referrer`、CSP（`script-src 'self'` + 单一 sha256 白名单）。

**联机面**：房主端 60.0/59.0 patch/s，队友端 59.3/60.7 patch/s；双人角色分派
`fireboy` / `watergirl` 恒不相同。

**服务端权威实证**：房主按右方向键 1.5s 后，fireboy 从 `x=96` 移到 `x=472`；
**队友端看到的也是 472**——两端读的是同一份权威状态，不是各自本地模拟。

**断线重连**：队友断网后房主侧相位 `started → paused`（冻结等待，不是掉人），
网络恢复后自动 `paused → started`，且队友端仍在 Game 场景未被踢回菜单；
房主刷新页面后回座成功，相位保持 `started`、角色坐标从快照还原。

**并发**：5 个双人房间并行，房号互不相同，全部进 started，
各房物理速率最低 58.0/s、最高 62.7/s；第三人加入被服务端以
`room "..." is locked` 拒绝；全部离开后 `/healthz` 仍 ok 且能正常建新房。

**触屏**：iPhone 13 描述符下三键虚拟按键可见、都在视口内（390×664）；
跳跃 Δy=33.1px、按住右移 Δx=303.2px；桌面端不创建虚拟按键。

## 三、发现的三个问题

### 1. 窄屏 HUD 被左右裁切（真实缺陷，1.0.4 已修）

390×664 竖屏实测 `#hud-top` 的 rect 是 `left=-113, right=503`，房间码的「房」字
和「等待另一位玩家」都被裁掉，320px 档更严重。根因是居中定位 + `white-space: nowrap`
+ 无宽度上限。修法与六档视口回归见 `note/release/1.0.4.md`。

### 2. DEPLOY.md 关卡构成写错（文档缺陷，1.0.4 已修）

原文「48 关（forest_01–47 + forest_01 教学副本）」。真实构成是
32 主关 + 12 个 `_1` 变体 + 3 个 bonus + 教学关 `forest_01`，**编号只到 forest_32**。
我按文档去测 `forest_47` 得到 404，才查出这条错。已改为准确描述。

### 3. 测试脚本两处自身错误（非产品问题）

- 「触屏无操作通路」的判断是错的：我触摸的是画布，而虚拟按键是 `#touch-controls`
  里的三个 `.touch-btn`。改用真实按键后全绿。
- 跳跃 Δy 一度测出 0 或 23px：单次按压 90ms 太短（角色还没起跳就松开），
  且跨公网每 40ms 一次 `evaluate` 往返会漏掉顶点。改为 240ms 按压 +
  **页面内 rAF 逐帧记录**后稳定在 33px。同一操作在旧测法下会在 0~39px 之间随机，
  这是测量误差不是物理差异——用键盘上键、pointer 序列、CDP 触屏三条路径交叉验证过，
  跳跃本身一直正常。

## 四、服务器纪律执行情况

按用户要求，服务器上只做两类操作：

1. **读日志**：`journalctl -u gy-fw-forest`、`systemctl show`、`free`、`/proc/loadavg`
2. **部署换版**：rsync 传包 → 新目录解包 → `./deploy.sh --no-service` 试跑验收 →
   停旧服务 → `./deploy.sh` 装新服务 → 删旧目录

未在服务器上做：编译、跑测试套件、装依赖、压测、改配置（`FW_HOST=0.0.0.0` 是上一
会话已有的部署产物，本次沿用）。

负载实测 0.09 / 内存可用 1491 MiB / 服务进程 66 MB / NRestarts=0。

## 五、复跑命令

```bash
# 全部脚本都是纯客户端行为，可对任何部署实例跑
node TEMP/net-test.mjs        --base http://110.42.36.114:2567   # 双客户端联机
node TEMP/browser-test.mjs    --base http://110.42.36.114:2567   # 单浏览器进 Game
node TEMP/play-test.mjs       --base http://110.42.36.114:2567   # 双浏览器真人操作
node TEMP/levels-test.mjs     --base http://110.42.36.114:2567   # 多关卡冒烟
node TEMP/reconnect-test.mjs  --base http://110.42.36.114:2567   # 断线重连
node TEMP/concurrency-test.mjs --base http://110.42.36.114:2567  # 并发与回收
node TEMP/touch-ext-test.mjs  --base http://110.42.36.114:2567   # 触屏虚拟按键
node TEMP/hud-fix-test.mjs    --base http://110.42.36.114:2567   # HUD 全视口不溢出
```

`TEMP/` 为临时目录，按项目约定测试完清理；需要留档请把脚本迁入
`scripts/e2e/`（HUD 回归脚本建议迁，它防的是一类会静默复发的布局回退）。

---

## 六、收尾（1.0.4 上线后复跑）

1.0.4 部署到服务器后，对**生产实例**重跑关键面，确认修复生效且无退化：

| 测试 | 结果 |
|---|---|
| `hud-narrow`（六档视口 30 条断言） | ALL GREEN（线上 dist） |
| `net-test` 双客户端 | 全绿，58.2 / 59.0 patch/s |
| `play-test` 双浏览器真人操作 | 全绿，fireboy x 96→469，**两端坐标一致** |
| `touch-ext-test` 触屏 | 全绿，跳跃 Δy=30.8px、右移 Δx=298.8px |
| `reconnect-test` 断线重连 | 全绿（paused→started、刷新回座） |

服务器状态：零异常日志、`NRestarts=0`、内存 53 MB（1.0.3 时 66 MB）、
负载 0.03 / 可用 1497 MiB。旧版 1.0.3 目录与 tar 已删，`/opt/slbhr` 只留 1.0.4。

测试脚本中具长期价值的已留档于
[2026-10-29-external-test-tools/](2026-10-29-external-test-tools/)（含两个测量陷阱说明），
HUD 回归则正式迁入 `scripts/e2e/hud-narrow.mjs` 并接入 CI。
