# issues-2026-10-20 · GitHub issue 批量处置档案（20/20 收官）

> 2026-10-20 用户提交 20 条 issue（B-01 Blocker/H-01..04 High/M-01..06 Medium/L-01..07 Low/I-01..02 Info），三槽并发批判性处置（每条先复核/复现再动手），0.3.40 统一发版收官（tag `0.3.40`，commit `1287442`）。
> **总账：17 修 + 3 证伪/论证关闭，全部带证据与 commit hash 关闭。** 逐版摘要见 [../release/0.3.40.md](../release/0.3.40.md)。

| 档 | 槽 | 覆盖 issue | 要点 |
|---|---|---|---|
| [A-server-room.md](A-server-room.md) | 服务端房间 8 条 | #1 B-01 时基漂移(Blocker)、#2 H-01、#3 H-02、#4 H-03(证伪)、#6 M-01、#11 M-06、#12 L-01、#13 L-02 | 全落 ForestRoom.ts；B-01 探针 0px→255px 实证；H-03 双断线卡 lobby 机制不可达字证关闭 |
| [B-infra-deploy.md](B-infra-deploy.md) | 基建/安全/部署 6 条 | #7 M-02、#9 M-04、#10 M-05、#19 I-01、#20 I-02、#15 L-04(服务端半) | 路径穿越 200 泄漏实证修复+11 例回归；vitest 3→5.0.5 消 critical；SIGTERM 子项证伪（colyseus 默认链） |
| [C-client-dom.md](C-client-dom.md) | 客户端 DOM 3 条 | #5 H-04、#16 L-05、#15 L-04(客户端半) | 重连退避 4 次+常驻断线横幅（修复前 190ms 被冲掉实测）；邀请链接去密码（深链兼容）；密码框 type=password |
| [D-l07.md](D-l07.md) | L-07 单条 | #18 L-07 | FW_DEBUG_* 定时器句柄入账+onDispose 统一清理（泄漏 1→2→3→4→0 实证） |
| [E-m03.md](E-m03.md) | M-03 单条 | #8 M-03 | 48 关行为测试 STRICT=true 置红（取证 48/48 零异常，allowlist 空）+ForestRoom 集成测试 13 例（vitest 106→119） |

## 复核证伪/论证关闭三件（防误修记录）

- **#4 H-03**：双断线一方超时另一方卡 lobby——phase=lobby 仅两处写且必先删席，"roles=2 双在线卡 lobby"不可达；迟到重连=设计等补位残局。
- **#10 M-05 子项**："缺 SIGTERM"——colyseus 0.16 默认 `gracefullyShutdown` 已注册 SIGTERM/SIGINT/SIGUSR2，实测端口秒级释放。
- **#20 I-02 余量**：12 项 audit 告警全在 colyseus 传递链（nanoid 整数 9 调用不可达、auth/redis 0 引用）；colyseus 0.18 升级系破坏性大版本，另立项。

## 遗留与移交

- A 槽客户端余量三项（won 重连不重触发 onPhase 面板不重开、本地幽灵渲染、HUD 文案）——待排波次。
- colyseus 0.16→0.18 升级：需独立分支+全门禁，待立项。
- touch Δy 阈值 >30px 偏紧（实测 30.7-38.1px±5 噪声）：偶发再议。
- P-02 CompleteScene 语义变更（用户批，非 issue）另见 [../research/2026-10-behavior-parity/16-original-improve-proposals.md](../research/2026-10-behavior-parity/16-original-improve-proposals.md)。
