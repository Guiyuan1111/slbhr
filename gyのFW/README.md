# 森林冰火人联机版（gyのFW）

服务端权威的《森林冰火人 1：森林神庙》双人对战合作网页游戏。完整开发计划见 [note/PLAN.md](note/PLAN.md)。

> **当前版本**：0.3.35（选关树浮雕质感还原：templeTreeBake 原版滤镜链 CPU 逐操作移植，分帧烘焙三层纹理（底影/全树枝干 3px 描边/通关金枝），oracle 对拍枝干中线 49/49+浮雕方向 50/50+通关层字节 99.82%；兼修树形数据暗病——edges 按 `_id` 连接（旧按 id 错连 47 条中的 41 条））。上版 0.3.34：性能战役 r8–r11 四轮收账：点击→Game 场景切换链 -11%（连接窗三段 -49%/-77%/-93%，temple.json 单例预取+waitForLevelId 事件驱动+关卡缓存+连接忙期画布冻结；换肤幕布连接窗性能税 +364ms 归档并回收）；空闲 CPU 面负结论收口（JS 面 script%<2% 地板、帧率上限因慢机砍帧弃件、幕布驻留税挂账真 GPU 口径）；工具链 vitest threads -12% + build 去 npm 层 -6.8%（dist 逐字节不变）；r0 §八 GC 挂账勘误收口（GC 份额 0-0.4%、无并发膨胀、bonus_2 158ms/建=前 60 步固有收敛）。上版 0.3.33：连接界面方向 A「石板大厅」换肤。上版 0.3.32：性能战役 r6–r7 收账（音频批 Menu 驻留暖装 +941ms、96 房容量拐点、渲染段 JS 面理论地板、font 子集化关闭、det 门禁并行 -44%）。上版 0.3.31：hanging 摆板 revolute 轴点归位 + 常驻服务器管理。行为复刻战役进行中（总索引见 [note/research/2026-10-behavior-parity/00-INDEX.md](note/research/2026-10-behavior-parity/00-INDEX.md)）。0.3.28 自验收体系落地（L0-L4 验收阶梯 note/self-acceptance.md）。此前 0.3.0-0.3.24 完成 box2d 保真重写 + 全 UI 复刻 + 48 关 + 机关全谱 + 物理复刻度 84.31/动画 99.97/视觉 95.20。量化基准见 [benchmark/](benchmark/README.md)，性能战役总账（r0–r7 七轮+r8–r11 四轮）见 [note/report/perf/2026-10-18-campaign-summary.md](note/report/perf/2026-10-18-campaign-summary.md) 与 [2026-10-20-r8-scene-switch.md](note/report/perf/2026-10-20-r8-scene-switch.md) 等 r8–r11 四报告，逐版改动见 [note/release/](note/release/)
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
| 位级确定性 | `node --import tsx benchmark/perf-determinism.mjs --compare r0-baseline`（并行缺省，`DET_WORKERS=0` 回退串行） | 全 48 关 det 位级基线（perf 战役现役锚 r0-baseline，与行为战役史锚 r32 同源互证；并行/串行/快照三方逐字节同） |
| 行为回归网 | `node --import tsx scripts/e2e/routetool/fixture-runner.mjs` | 金轨迹 fixture 6 case：v1 内核自基线 ×4（tolerance=0）+ oracle 金 ×2（forest_01/forest_26） |
| oracle 对拍 | `scripts/e2e/oracle/`（lib/vtrun/vtdiff/goldcollect/windphase/animprobe） | 原版虚拟钟机族：确定性 60Hz 逐帧对拍、金输出采集、风相位/动画审计 |
| dt 敏感度 | `node --import tsx scripts/e2e/routetool/dtsweep.mjs` | 同输入跨 dt 调度谱扫描（默认写 TEMP，写档案须显式 --outDir） |
| 量化基准 | `benchmark/`（fidelity-score / visual-diff / anim / audio / determinism / step / load / sync / serialize / routeio / mem / client / capacity） | 复刻度指数与性能快照（`--save`/`--compare`） |
| 性能优化战役 | [note/report/perf/2026-10-18-campaign-summary.md](note/report/perf/2026-10-18-campaign-summary.md)（总账）+ 同目录 r0–r11 各轮报告 | 2026-10-18/19 七轮 22 件全位级中性：步进 -15~-22%、世界构建 10.5×、客户端 update 分配 -97%、冷启 -32%、音频就绪点提前至 Menu 驻留、容量拐点 96 房/≤64 房实例；r7 负结论双件（渲染段理论地板/font 子集化无空间）实测防重复立项；2026-10-20 r8–r11 续账：点击→Game -11%（连接忙期画布冻结回收换肤幕布税）、空闲 CPU/帧率上限负结论、vitest -12%+build -6.8%、GC 拆账收口（总账 §八）（各轮 `--compare` 锚与快照索引见 [benchmark/README.md](benchmark/README.md)） |

行为复刻战役全档索引、工具用法速查与挂账清单：[note/research/2026-10-behavior-parity/00-INDEX.md](note/research/2026-10-behavior-parity/00-INDEX.md)。全库函数级代码分析报告（架构/运行原理/工作流/AI 替代，2026-10-18 codebase-analyzer 产出）：[note/report/codebase-analysis/](note/report/codebase-analysis/index.md)。

## 技术栈

TypeScript 全栈 · Phaser 3（客户端渲染） · Colyseus（房间/状态同步） · 自研 2D 内核（`packages/shared`，两端复用） · 官方 Tiled 关卡 JSON 直接装载。

## 联机架构

客户端只渲染 + 发输入，全部判定（物理、死亡、钻石、拉杆、移动平台、开门）在 Colyseus 服务器 60Hz 权威 tick 上计算——这是**原生在线联机**。作为对照：原版网页客户端是 2.27MB 混淆黑盒改无可改，[Steam 官方发行版](https://store.steampowered.com/app/5084260/) 也只有本地双人同屏 + Remote Play Together 串流（官方分类无 Online Co-op）。决策依据与实证详见 [note/multiplayer-architecture.md](note/multiplayer-architecture.md)。
