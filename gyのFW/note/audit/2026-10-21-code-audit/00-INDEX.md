# 代码工程审计（2026-10-21）

> 独立审计：不以既往 AI 交付说明为依据，结论以当前代码与实测门禁为准。审计阶段只读；修复进度与逐项 commit 见 [04-fix-log.md](04-fix-log.md)。
>
> **收口状态（2026-10-21，0.3.41）**：H1–H4、M1–M11、M13、L1–L3 已修；M12 架构重构挂账；L4 为有意边界。最终门禁：13 文件/158 用例、build、48/48 determinism、pause/leave/refresh 三组浏览器 e2e 全通过。

## §1 范围与方法

- 审计对象：`gyのFW` 0.3.40 工作区（93 个 TS/JS 文件，含 `packages/client`、`packages/server`、`packages/shared`、`scripts/`、`benchmark/`）。
- 14 个只读子代理按域并行：房间生命周期、服务端 HTTP/部署、物理内核、关卡解析、客户端网络、输入、GameScene、UI 场景、选关树烘焙、音频、测试、工具链、安全、数据管线。
- 代理结论不直接采信：高危项逐条回读源码；对 `currentRunForce`、实例级 `onAuth`、`roles.size` 三项代理结论做了证伪/修正（见 [03-low-and-false-positives.md](03-low-and-false-positives.md)）。
- 修复阶段以本文档记录的问题为唯一清单，不夹带未登记改动。

## §2 并发调研

- Qoder 官方文档与本地配置未发现子代理并发的硬性上限字段，无官方数字可引用。
- DeepSeek 公开的是 API 账户级并发限制（[Rate Limit](https://api-docs.deepseek.com/quick_start/rate_limit)），不是 Qoder 代理调度上限。
- 实际按代码域拆分派出 **14 路并行代理**，全部返回，未触发限流。继续增加代理会与既有域重复，故 14 为本次审计的有效上限。

## §3 门禁实测（审计时点）

| 门 | 结果 |
|---|---|
| `npm run typecheck` | 通过（exit 0） |
| `npm run build` | 通过（exit 0） |
| `npx vitest run` | 126/126 通过，9 个测试文件，61.5s |
| `node --import tsx benchmark/perf-determinism.mjs --compare r0-baseline` | 48/48 关位级一致，7.0s |
| e2e / journey / pause / rejoin / visual-diff | 审计时未跑；下文缺陷恰好落在这些门禁覆盖不到或只覆盖一次的场景 |

门禁全绿不能证明会话生命周期正确：H1/H2/H3 均可通过静态读码确认，而现有 L3 用例没有覆盖“二次暂停 / 刷新回座 / 主动离房”的完整组合。

## §4 总体判断

- **内核与基准体系强**：确定性基线、oracle 对拍、房间集成测试的质量高于一般个人项目。
- **外围会话生命周期弱**：暂停、离房、刷新回座、输入/Touch 生命周期存在可稳定触发的缺陷。
- **发布流程部分失真**：无 CI/lint；版本号在 README、lockfile 与 release note 之间不一致；release note 的“版本一致性已统一”与事实不符。
- **安全边界**：默认绑定 127.0.0.1 时风险低；按 README 经隧道暴露公网时，鉴权时序、速率限制、请求体上限与 Origin 校验不足。

## §5 档案

| 文档 | 内容 |
|---|---|
| [01-high.md](01-high.md) | H1–H4：暂停菜单关闭闩锁、刷新回座相机冻结、主动离房误判断线、选关树烘焙无界缓存 |
| [02-medium.md](02-medium.md) | M1–M13：令牌刷新、输入/Touch 泄漏、BGM 类型、剪贴板、鉴权/限流、测试/CI、版本、静态缓存、机关平滑、加载条、temple 失败缓存、类型边界、localStorage 保护 |
| [03-low-and-false-positives.md](03-low-and-false-positives.md) | 低危/代码卫生 + 被证伪或需修正的代理结论 |
| [04-fix-log.md](04-fix-log.md) | 修复台账：状态、commit、门禁与遗留 |

## §6 修复优先级

1. **P0**：H1 暂停菜单复位；H3 主动离房关闭码/离开标志；H2 相机按当前 phase 初始化；H4 烘焙缓存 LRU 与预处理分片。
2. **P1**：M1 重连令牌刷新；M3 速度关 BGM；M4 剪贴板回退；M2 输入/触屏释放；M5 鉴权/限流/请求体；M6 测试与 CI。
3. **P2**：M7–M13 与低危项；架构级类型边界/GameScene 拆分单独挂账，不在本次批量修复中强行重构。
