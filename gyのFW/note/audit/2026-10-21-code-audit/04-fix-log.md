# 04 · 修复台账

> 状态：`待修` / `进行中` / `已修` / `挂账` / `不修（附理由）`。每个已修项必须附 commit 与复验门禁。
>
> 收口时点：2026-10-21。修复批次 commit：`9fc2bb3`（客户端网络/输入）、`c7dc51b`（客户端场景/存储）、`bd151d8`（服务端加固）、`86731ec`（CI/版本门禁）、`fa7e075`（客户端单测）、`5cdf0d2`（浏览器 e2e）；CI 工作流根目录修正见 `70cf984`。审计建档见 `42195c0`。0.3.42 追加：M12 渐进拆分 `cef6359`+`fc2bb52`+`5225d74`、A 槽 L-02 `1b7532f`+`e40fb23`、P-01 `d6d5861`。

| ID | 问题 | 优先级 | 状态 | commit | 复验 |
|---|---|---|---|---|---|
| H1 | PauseMenu `closing` 闩锁不重置 | P0 | 已修 | `c7dc51b` | `journey pause` 二次暂停/关闭 2 项断言通过（11/11） |
| H2 | 刷新回座进入 started 相机冻结 | P0 | 已修 | `c7dc51b` | `journey refresh` 回座后 `camFrozen=false`（3/3） |
| H3 | 主动离房 4000 被当断线 | P0 | 已修 | `9fc2bb3` | `journey leave` 无重连横幅、余端回 lobby（3/3）+ 静态回读 |
| H4 | 选关树烘焙缓存无界 + 同步预处理 | P0 | 已修 | `c7dc51b` | LRU/分片实现回读 + 全量门禁；内存峰值未单独量测 |
| M1 | 重连后不保存新令牌 | P1 | 已修 | `9fc2bb3` | `journey refresh` 连续两次刷新均回座（3/3） |
| M2 | 键盘/Touch 监听与 DOM 泄漏 | P1 | 已修 | `9fc2bb3` | 具名 handler 精确摘除 + `dispose` 回读；重复入房未单独压测 |
| M3 | 速度关 BGM 类型滞后 | P1 | 已修 | `c7dc51b`+`9fc2bb3` | `templeEntry` 同步注入回读 + 全量门禁；音频实听未做 |
| M4 | HTTP 剪贴板无回退 | P1 | 已修 | `9fc2bb3` | 特性检测/`execCommand` 回退回读；LAN 非安全上下文未手测 |
| M5 | 鉴权时序/速率/请求体 | P1 | 已修 | `bd151d8` | 限流/静态 onAuth 单测 3 例 + 请求体上限 5 例 + 集成测试密码 4403 仍生效 |
| M6 | 测试/CI 覆盖缺口 | P1 | 已修 | `bd151d8`+`86731ec`+`fa7e075`+`5cdf0d2`+`70cf984` | 新增 3 个服务端测试文件、templeData 单测与 progress 扩展、3 个 e2e 场景；GitHub Actions run `39538401687` 两 job 全绿 |
| M7 | 版本/engines 漂移 | P2 | 已修 | `86731ec`+发版提交 | `version.test` 4 例通过；根/三子包/lock/README 统一 0.3.41 |
| M8 | Vite 哈希缓存规则 | P2 | 已修 | `bd151d8` | `cachePolicy` 哈希用例通过；实际构建产物 `index-Co3t3lNC.js` 命中 |
| M9 | 机关平滑速度不衰减 | P2 | 已修 | `c7dc51b` | 超 80ms 静止清零回读 + 全量门禁；未做视觉抽帧 |
| M10 | Boot 加载条事件名 | P2 | 已修 | `c7dc51b` | `filecomplete-atlasjson-` 回读；加载条视觉未单独断言 |
| M11 | temple.json 失败永久缓存 | P2 | 已修 | `c7dc51b`+`fa7e075` | `templeData.test` 失败/网络拒绝重试 + 成功单例 3 例 |
| M12 | any/GameScene 巨型类 | P2 | 大部已修 | `cef6359`+`fc2bb52`+`5225d74`+`09adfe8`+`ec3e057` | 渐进拆分：机关平滑 `scenes/mechSmoothing.ts`（单测 4）、快照字段校验 `snapshotValidation.ts`（单测 5）、平台声 `scenes/platformSound.ts`（单测 5）、相机子系统 `scenes/cameraRig.ts`（单测 17；0.3.43 接线 `ec3e057`，GameScene 2102→1950 行，视觉带 repeat5 中位 92.53 无显著位移+det48+e2e 全绿）已接入；共享 DTO 清单已落地并接入 snapshotValidation（netDto `9eaf451`+接线 `cb4a21c`：Player 5→14 字段/winds 1→2/新增 doors 单对象监控，真局探针实证误报归零）；剩余=消费面 st:any 换用生成类型（低优先），见 [02-medium.md](02-medium.md) |
| M13 | localStorage 写入无保护 | P2 | 已修 | `c7dc51b`+`fa7e075` | `progress.test` 写入/读取抛错降级 2 例 |
| L1 | oracle 路径硬编码 | P3 | 已修 | `bd151d8` | `ORACLE_ROOT` 环境变量覆盖回读 |
| L2 | `/api/level` 异常文本泄漏 | P3 | 已修 | `bd151d8` | 错误细节转服务端日志、响应通用文案回读 |
| L3 | 环境变量无范围校验 | P3 | 已修 | `bd151d8` | `envNumber` 合法/非法/边界 3+6 例单测 |
| L4 | params.ts 配置脱节 | P3 | 说明 | — | 属于有意的边界映射，已在审计档注明，不改 |

## §2 复验门禁（修复后最终代码）

| 门 | 命令 | 结果 |
|---|---|---|
| 类型检查 | `npm run typecheck` | exit 0 |
| 单测 | `npx vitest run` | **13 文件 / 158 用例全通过**（57.97s，含 13 例房间集成） |
| 构建 | `npm run build` | 成功（4.73s）；产物 `index-Co3t3lNC.js` / `colyseus-BEjLCa9D.js` / `phaser-BMeCXOGt.js` |
| 确定性 | `node --import tsx benchmark/perf-determinism.mjs --compare r0-baseline` | **48/48 关位级一致**（2.8s） |
| 浏览器 e2e | `node scripts/e2e/journey.mjs pause` | **11/11**：冻结/恢复/时基 + 二次暂停开关 |
| 浏览器 e2e | `node scripts/e2e/journey.mjs leave` | **3/3**：回选关树、无断线横幅、余端回 lobby |
| 浏览器 e2e | `node scripts/e2e/journey.mjs refresh` | **3/3**：两次刷新回座 + 相机解冻 |
| GitHub CI | Actions run `39538401687`（push `70cf984`） | **两 job 全绿**：typecheck/test/build 1m43s、determinism 22s |

## §2.1 0.3.42 追加复验（2026-10-21）

| 门 | 结果 |
|---|---|
| 单测 | **16 文件 / 172 用例全通过**（新增 M12 三模块 14 例 + 既有 158） |
| 确定性 | **48/48 关位级一致**（2.6s） |
| 浏览器 e2e | pause **11/11**、leave **3/3**、refresh **3/3**、wonrefresh **6/6**、journey rejoin **3/3**；f12 route repeat3 **ALL PASS**（winAt 12989/13477/12967ms，墙钟抖动） |
| GitHub CI | Actions run [39543650721](https://github.com/Guiyuan1111/slbhr/actions/runs/39543650721)（push `af6d873`） | **两 job 全绿**（typecheck/test/build + determinism） |

## §3 遗留与说明

- **M12（架构级）**：渐进拆分已完成机关平滑/快照字段校验/平台声三个低耦合子系统；`GameScene` 相机子系统、共享 DTO/生成类型仍挂账，风险与方案保留在 02-medium.md。
- **M4 / M3 实机口径**：剪贴板仅做代码路径与回退审查，未在局域网 HTTP 浏览器手测；速度关 BGM 未做听感验收。
- **H4 内存**：LRU=2 与分片只做了实现与门禁复验，未在真机测峰值 RSS；如需数字应另跑内存基准。
- **CI**：仓库根 `.github/workflows/ci.yml`（`working-directory: gyのFW`，`paths: gyのFW/**`）已随 `70cf984` 推送在 GitHub 实跑通过（run [39538401687](https://github.com/Guiyuan1111/slbhr/actions/runs/39538401687)）；仅有 `actions/checkout@v4`/`setup-node@v4` 的 Node 20 运行时弃用提示，不影响门禁结果。
- **Colyseus 警告**：定义静态 `onAuth` 后框架打印 "instance onAuth will be ignored" 属预期；实例 `onAuth` 由 `onJoin` 显式调用，集成测试的 4403 密码错误用例证明校验未被绕过。
- 浏览器/单测均使用无头 Chromium 与 Node 22；未覆盖真机触屏、弱网、跨设备代理链路。
