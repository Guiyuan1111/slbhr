# 02 · 中危问题

> 状态以 [04-fix-log.md](04-fix-log.md) 为准。M12 为架构级挂账，本次不做大重构；其余按 P1/P2 批量修复。

| 编号 | 问题 | 证据 | 影响 | 修复方案 |
|---|---|---|---|---|
| M1 | 重连后不刷新恢复令牌 | `packages/client/src/net.ts:114-119` 只在收到 `role` 时保存；`:181-183` 重连成功只重绑回调。Colyseus 每次 `_onJoin` 生成新 token（`Room.js:502`）。 | 网络抖动自动重连后，再刷新页面会用旧 token，回座失败。 | 重连成功后 `saveResume()`；`tryResume` 恢复角色后也保存新 token。 |
| M2 | 键盘 window 监听器与触屏 DOM 根节点不释放 | `input.ts:63-66` 匿名 handler；`:114-116` `destroy()` 只清 interval；`touch.ts:27-42` 每次构造 append 新根节点且无 dispose；`main.ts:234-239` 每次入房新建。 | 反复离房/入房后监听器、DOM 节点累积；触屏 hide 时虚拟键可能滞留。 | 保存具名 handler 并 `removeEventListener`；`TouchControls.dispose()` 移除根节点、释放按键；`lostpointercapture` 纳入释放。 |
| M3 | 速度关 BGM 可能整关放错 | `GameScene.ts:258` 默认 general 且 `init` 不重置；`:426` create 同步起 BGM；`:486-492` 异步才设置 type，之后不重起。 | 普通关/速度关交替进入时首曲沿用上一关类型，且不会纠正。 | 由 `main.ts` 把 `currentTempleEntry` 随 `__fwInit` 同步传入；GameScene `init` 直接设置 type/time；保留异步加载为兜底。 |
| M4 | 局域网 HTTP 下复制邀请链接直接抛异常 | `main.ts:497-511` 直接访问 `navigator.clipboard.writeText`；非安全上下文下 `navigator.clipboard` 为 `undefined`，在 `.catch` 前同步抛 TypeError。 | 复制按钮在 LAN 部署下失效，且无回退。 | 先 feature detect；不可用时直接 textarea + `execCommand` 回退。 |
| M5 | 鉴权发生在占座之后，且无速率/请求体限制 | `ForestRoom.ts:244-249` 实例级 `onAuth`；Colyseus matchmaking 忽略实例级方法（`MatchMaker.js:255-257`），实际在 `_onJoin` 才检查（`Room.js:533-543`）。`/matchmake` 请求体无上限（`Server.js:225-231`）；WS 无 Origin 校验、无房间配额（`server/src/index.ts:74-79`）。 | 密码不会被绕过，但公网隧道下可被暴力尝试、恶意占座或大 body 打爆内存。 | 保留实例 onAuth（按房间密码无法用静态 onAuth 校验）；增加静态 onAuth 做 IP 速率限制；生产入口对 `/matchmake` 加体量上限；Origin/反代限流写入部署文档。 |
| M6 | 测试与 CI 覆盖不到上述路径 | `package.json:17` 的 `test` 只跑 vitest；无 lint 脚本、无 CI 配置；仅 9 个测试文件，客户端 net/input/overlays/GameScene 生命周期无单测。 | H1/H2/H3 这类缺陷可长期全绿。 | 增加 GitHub Actions（typecheck/vitest/build/det）；补纯函数/模块单测；扩展 journey e2e 覆盖二次暂停与主动离房。 |
| M7 | Node 引擎与锁文件/文档版本不一致 | `package.json:34-36` 声明 `node >=20.6`，但 vitest 5 要求 `^22.12 || ^24 || >=26`；`package-lock.json:3928-3938` 三个 workspace 仍是 0.3.31；`README.md:5` 仍是 0.3.38。 | 0.3.40 release note 声称“根/三子包/lock/README 统一 0.3.40”，实际未做到；Node 20 环境可能安装/测试失败。 | 升 engines；重生成 lock；更新 README/版本；增加版本一致性校验脚本。 |
| M8 | Vite 产物哈希未命中 immutable 缓存规则 | `staticGz.ts:20` 只匹配 8 位小写十六进制；实际产物如 `index-CnbrvQg2.js` 含大写/非十六进制字符，退化为 1 天缓存而非 1 年 immutable（`:24`）。`:99-105` 在请求路径同步 brotli/gzip。 | 增加回源与首包延迟。 | 按 Vite 实际 hash 规则匹配或对 `/assets/*` 统一 immutable；压缩改预生成/异步作为后续性能项。 |
| M9 | 机关平滑外推速度不衰减，静止后永久偏移 | `GameScene.ts:1762-1769` 只在位置变化时更新速度，不变时不清零；`:1771-1774` 始终按 `25ms × v` 外推。 | 平台/摆锤停止后仍保留最后一次速度的 25ms 前导，产生固定视觉错位。 | 超过一个快照周期无变化即把速度清零并推进 `m.t`，恢复运动时按正常帧间隔计算。 |
| M10 | Boot 加载条监听错误的 Phaser 事件名 | `BootScene.ts:131` 监听 `filecomplete-atlas-preloader`；Phaser 的 `load.atlas` 文件类型是 `atlasjson`（`AtlasJSONFile.js:79`），事件名为 `filecomplete-atlasjson-preloader`。 | 启动加载条永远不会构建。 | 改用 `filecomplete-atlasjson-${ATLAS_PRELOADER}`。 |
| M11 | temple.json 失败后永久缓存空数组 | `templeData.ts:19-29` 的 `pending` 在 reject 时被 `.catch(() => [])` 固化，后续不再重试。 | 一次瞬时网络失败会让本页所有关卡类型/限时退化为 general，BGM/星级/结算口径随之错误。 | 失败时清空 `pending`，当前调用返回空数组，下一次调用重试；加 warning 与单测。 |
| M12 | 客户端网络边界大量 `any`，场景类过度集中 | `GameScene.ts:185` 起 2087 行、约 50 个可变字段、8 个手工快照消费方法（`:1801-2032`）；`st:any`、`Number(x) || 0` 遍布。 | 服务端 schema 字段漂移会被静默吞掉（0.3.25 defineTypes 漏注册即此类）。 | 共享 DTO/生成类型、拆分 GameScene 子系统、快照字段存在性校验——架构级改造，单独立项，不在本次批量修复中强行重构。 |
| M13 | localStorage 写入无保护 | `progress.ts:39-45` 的 `saveBest` 直接 `setItem`；load 只捕获 parse 异常；settings/game-complete 同类。 | 隐私模式/配额满时，通关结算链中的写入异常会中断 `onPhase("won")`，结算/存档失败。 | 统一 try/catch；写失败保留游戏内结果并 warning，不让结算链中断。 |
