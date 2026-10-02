# 森林冰火人联机版（gyのFW）

服务端权威的《森林冰火人 1：森林神庙》双人对战合作网页游戏。完整开发计划见 [note/PLAN.md](note/PLAN.md)。

> **当前版本**：0.2.0（像素级视觉复刻，双浏览器真联机通关实测 ×3，验收全项 pass）
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

## 技术栈

TypeScript 全栈 · Phaser 3（客户端渲染） · Colyseus（房间/状态同步） · 自研 2D 内核（`packages/shared`，两端复用） · 官方 Tiled 关卡 JSON 直接装载。

## 联机架构

客户端只渲染 + 发输入，全部判定（物理、死亡、钻石、拉杆、移动平台、开门）在 Colyseus 服务器 60Hz 权威 tick 上计算——这是**原生在线联机**。作为对照：原版网页客户端是 2.27MB 混淆黑盒改无可改，[Steam 官方发行版](https://store.steampowered.com/app/5084260/) 也只有本地双人同屏 + Remote Play Together 串流（官方分类无 Online Co-op）。决策依据与实证详见 [note/multiplayer-architecture.md](note/multiplayer-architecture.md)。
