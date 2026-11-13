# 外网测试工具集（2026-10-29）

对部署实例跑的一组纯客户端测试脚本。原本在 `TEMP/`，按项目约定「临时目录测试后清理」，
但其中有长期价值的部分留档于此（其余可随时重建）。

全部脚本**只做客户端行为**，不改服务端任何状态；房间都是密码保护的临时房，测完立刻
leave。服务器侧只应有「读日志」与「部署换版」两类操作。

## 脚本

| 文件 | 作用 |
|---|---|
| `net-test.mjs` | 双 colyseus.js 客户端：建房 → 双人 started → 双端 patch 持续 → 零异常断开 |
| `browser-test.mjs` | 单浏览器：Menu → 建房 → Game，断言零 pageerror / 零失败请求 / 资源全 200 |
| `play-test.mjs` | 双浏览器真人操作：邀请链接加入 → 按键 → **两端读到的角色坐标一致**（服务端权威实证） |
| `levels-test.mjs` | 多关卡冒烟：抽 general/speed/puzzle/bonus/`_1` 变体，每关验 JSON + 建房 + started + 物理在跑 |
| `reconnect-test.mjs` | 断网 → paused 冻结 → 恢复 → started；刷新页面 → 回座 |
| `concurrency-test.mjs` | N 房并发 + 房号唯一 + 超员拒绝 + 清空后重建 |
| `touch-ext-test.mjs` | iPhone 描述符 + CDP 人手量级按压：三键虚拟按键真的驱动角色 |
| `hud-fix-test.mjs` | HUD 六档视口不溢出（**正式版已迁入 `scripts/e2e/hud-narrow.mjs` 并接入 CI**） |
| `jump-diag.mjs` | 跳跃输入三层定位探针（pointerdown / 输入上报 / 位移），排障用 |

用法统一：

```bash
node <script> --base http://<host>:2567
```

## 两个测量陷阱（复用时务必注意）

**1. 跳跃高度不能用 Node 侧定时 evaluate 采样。**
跨公网单次 `evaluate` 往返可达 100ms+，而跳跃顶点只持续几十毫秒——会漏掉最高点，
同一操作在 0~39px 之间随机跳动（假失败）。正确做法：在**页面内**用 `requestAnimationFrame`
逐帧记录 `min y`，再一次性读回（见 `touch-ext-test.mjs` 的 `startTrack`）。

**2. 触屏点击必须按压 ~240ms。**
`page.touchscreen.tap` 把 touchStart/End 并发齐发，Chromium 同任务合成 → 服务端同一
tick 消费 down+up 对消，位移恒为 0。90ms 也偏短（角色刚起跳就松手，实测只抬 23px）。
用 CDP `Input.dispatchTouchEvent` 顺序注入 + 240ms 保持（见 `scripts/e2e/touch.mjs` 头注）。

这两条都曾让我误判「功能坏了」，实际是测法问题。交叉验证方式：同一操作分别用
键盘、pointer 序列、CDP 触屏三条路径测，三条一致才说明真实。
