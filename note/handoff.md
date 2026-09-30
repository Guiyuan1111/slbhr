# Handoff：需要真人完成的事与已知限制

**更新**：2026-09-30（M1 完成）

## 你要做的事

1. **GitHub 私有仓库**（PLAN §11）：`gh repo create <名字> --private` 后推送本目录。官方素材仅供两人私用，仓库保持 private。
2. **试玩验收**（最有价值）：本机跑 `start.bat`（构建 + 起服 127.0.0.1:2567），两台设备各开浏览器进同一房间码 + 密码，验证：
   - 火人趟水应安然无恙、水女孩趟水应化烟（若反了 → 把 `packages/shared/src/level.ts` 的 `LIQUID_TILE` 里 water/lava 数值对调再试）；
   - 跳跃/移动手感，偏差则调 `packages/shared/src/params.ts`（唯一调参入口，注释齐全）；
   - 渲染观感：角色大小（`BootScene.ts` 的 `PLAYER_SCALE`）、头部与腿部对齐偏移（`GameScene.ts` 的 `headLift`）。
3. **开发模式热重载**（改代码时用）：终端 A `npm run dev:server`，终端 B `npm run dev:client`，浏览器开 vite 显示的端口（5173 已设 strictPort，被占会直接报错而不是悄悄换口）。
4. **M2 预备**：注册樱花穿透、领免费隧道（HTTP 类型 + 海外建站节点 + 免费子域），配置卡在 [PLAN.md 附录](PLAN.md)。

## 已知限制 / 技术备注

- **断线重连**：服务器冻结等待 60 秒，期间对方刷新页面可以 `client.reconnect(token)` 回到原座位（浏览器端已接）。超过 60 秒角色被释放，对方需重新进房。
- **房间码 = Colyseus roomId**（9 位随机串），未做 6 位短码映射；需要更短码时在房间层加映射表即可。
- **插值**：指数平滑（自己 22/s、对方 12/s 的收敛速率），局域网够顺滑；公网要顺滑需升级为 100ms 快照缓冲插值（M3）。
- **Colyseus 版本坑**（重要，升级前必读）：
  - `colyseus` 必须钉 `0.16.0` 整版——0.16.1+ 硬依赖 git 仓库的 uWebSockets transport，npm 12 默认拒绝装 git 依赖（EALLOWGIT）。
  - 所有 colyseus 运行时导入统一从 `packages/server/src/colyseus.cjs.ts` 走 require 链；直接 `import "@colyseus/ws-transport"` 会加载它的 ESM 入口，与主包分裂成两个 core 实例（症状：seat reservation expired）。
  - Schema 子类字段一律在 `constructor` 里赋值；tsconfig 已设 `useDefineForClassFields: false`。
- **渲染**：官方素材是高清帧（玩家 130×172），统一缩放系数 `PLAYER_SCALE=64/172`；头/腿按画布底对齐叠加，偏移量 `headLift=10*PLAYER_SCALE` 为估算值，试玩后可微调。平台贴图按逻辑尺寸拉伸（128×32）。
- **关卡数据**：`level.ground` 保存原始 gid 供客户端画花纹；`liquid` 的水/岩浆语义待真人验证（见上）。
- 服务器只绑定 `127.0.0.1`，公网访问必须走穿透隧道（wss 由隧道 HTTPS 自动升级，客户端 `net.ts` 按页面协议自适应）。

## 里程碑进度

- [x] M0 环境/侦察/骨架
- [x] M1 联机最小闭环（本版）
- [ ] M2 樱花穿透联调 + 手机浏览器适配（触屏虚拟按键）
- [ ] M3 全机关数据驱动（梯子/推箱/球/激光等按 gid 枚举）+ 快照缓冲插值 + 存档/计时最优记录
- [ ] M4 多关卡选择与结算画面打磨
- [ ] M5 联调收尾与体验调参
