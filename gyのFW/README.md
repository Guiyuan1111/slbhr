# 森林冰火人联机版（gyのFW）

服务端权威的《森林冰火人 1：森林神庙》双人对战合作网页游戏。完整开发计划见 [note/PLAN.md](note/PLAN.md)。

> **当前版本**：0.3.31（游玩期首个物理保真修复——hanging 摆板 revolute 轴点归位（原版轴在板心，含 hanging 7 关与 det 漂移面精确吻合）；scripts/dev/servers.sh 常驻服务器管理：游玩服 3700 + oracle 只读伺服 8787。发版后行为复刻战役进行中（未发版，总索引见 [note/research/2026-10-behavior-parity/00-INDEX.md](note/research/2026-10-behavior-parity/00-INDEX.md)）：虚拟钟 oracle 机族 + 金轨迹 fixture 回归网 + dt 敏感度谱三线建成；内核两笔风实现修复（阻尼 dt 加权 4198ef3、推力去钳 99ed9fc，均位级中性 det r32 不 bump）；表现层三修（机关位姿平滑 7903c57、dying 即藏身 5b783e7、出站 patch 60Hz 4ba8478+lead 重标 3e72433）。上版 0.3.29-0.3.30：冻结偏离翻转 F1-F8 收官、终局 HUD 原版口径修缮 + 结算直进下一关 + 路线 02/04/07 定产。0.3.28 自验收体系落地（L0-L4 验收阶梯与发版强制门禁清单 note/self-acceptance.md；P3 全程通关门禁 + 路线产线）。此前 0.3.0-0.3.24 完成 box2d 保真重写 + 全 UI 复刻 + 性能专项 + 保真四连轮：48 关、机关全谱、双浏览器真联机、物理复刻度 84.31、动画 99.97、视觉 95.20。量化基准见 [benchmark/](benchmark/README.md)，性能对比报告见 [note/report/perf/2026-10-08-perf-optimization.md](note/report/perf/2026-10-08-perf-optimization.md)，复刻度报告见 [2026-10-06-fidelity-benchmark.md](note/report/perf/2026-10-06-fidelity-benchmark.md)，逐版改动见 [note/release/](note/release/)）
>
> **使用边界**：本项目使用官方游戏素材与关卡数据，仅供两名开发者私下联机游玩。禁止公开分发、上线或商用。

## 快速开始

```bash
npm install
npm run dev:server    # 终端 1：游戏服务器 http://127.0.0.1:2567
npm run dev:client    # 终端 2：开发前端 http://localhost:5173
```

生产形态（开服）：

```bash
start.bat             # 构建 + 起服务器，配合樱花穿透使用（见计划附录 B）
```

## 命令

| 命令 | 作用 |
|---|---|
| `npm run dev:client` | Vite 开发前端（自动同步 assets/data 到 public） |
| `npm run dev:server` | tsx watch 游戏服务器 |
| `npm run build` | 构建客户端到 packages/client/dist |
| `npm run start` | 生产模式起服务器（同源托管静态页 + WebSocket） |
| `npm run typecheck` | TypeScript 全量检查 |
| `npm run test` | vitest 单元/集成测试 |

## 验证与量具

| 层 | 工具 | 说明 |
|---|---|---|
| 通关门禁 | `node scripts/e2e/route.mjs --level forest_01 --repeat 3 --offset -15` | 真实服务器 + 双浏览器回放（`--offset -15` 为本机标定基线） |
| 位级确定性 | `node --import tsx benchmark/perf-determinism.mjs --compare r32` | 全 48 关 det 位级基线（现役 r32） |
| 行为回归网 | `node --import tsx scripts/e2e/routetool/fixture-runner.mjs` | 金轨迹 fixture 6 case：v1 内核自基线 ×4（tolerance=0）+ oracle 金 ×2（forest_01/forest_26） |
| oracle 对拍 | `scripts/e2e/oracle/`（lib/vtrun/vtdiff/goldcollect/windphase/animprobe） | 原版虚拟钟机族：确定性 60Hz 逐帧对拍、金输出采集、风相位/动画审计 |
| dt 敏感度 | `node --import tsx scripts/e2e/routetool/dtsweep.mjs` | 同输入跨 dt 调度谱扫描（默认写 TEMP，写档案须显式 --outDir） |
| 量化基准 | `benchmark/`（fidelity-score / visual-diff / anim / audio / perf-step / load / sync） | 复刻度指数与性能快照（`--save`/`--compare`） |

行为复刻战役全档索引、工具用法速查与挂账清单：[note/research/2026-10-behavior-parity/00-INDEX.md](note/research/2026-10-behavior-parity/00-INDEX.md)。

## 技术栈

TypeScript 全栈 · Phaser 3（客户端渲染） · Colyseus（房间/状态同步） · 自研 2D 内核（`packages/shared`，两端复用） · 官方 Tiled 关卡 JSON 直接装载。

## 联机架构

客户端只渲染 + 发输入，全部判定（物理、死亡、钻石、拉杆、移动平台、开门）在 Colyseus 服务器 60Hz 权威 tick 上计算——这是**原生在线联机**。作为对照：原版网页客户端是 2.27MB 混淆黑盒改无可改，[Steam 官方发行版](https://store.steampowered.com/app/5084260/) 也只有本地双人同屏 + Remote Play Together 串流（官方分类无 Online Co-op）。决策依据与实证详见 [note/multiplayer-architecture.md](note/multiplayer-architecture.md)。
