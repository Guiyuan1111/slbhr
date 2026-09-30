# Handoff：需要真人完成的事与已知限制

**更新**：2026-09-30（0.2.0 视觉复刻完成）

## 你要做的事

1. **GitHub 私有仓库**（PLAN §11）：`gh repo create <名字> --private` 后推送本目录。官方素材仅供两人私用，仓库保持 private。
2. **试玩验收**（最有价值）：本机跑 `start.bat`（构建 + 起服 127.0.0.1:2567），两台设备各开浏览器进同一房间码 + 密码，验证：
   - 火人趟水应安然无恙、水女孩趟水应化烟（若反了 → 把 `packages/shared/src/level.ts` 的 `LIQUID_TILE` 里 water/lava 数值对调再试）；
   - 跳跃/移动手感，偏差则调 `packages/shared/src/params.ts`（唯一调参入口，注释齐全）；
   - 渲染观感：角色大小（`BootScene.ts` 的 `PLAYER_SCALE`）、头部与腿部对齐偏移（`GameScene.ts` 的 `headLift`）。
3. **开发模式热重载**（改代码时用）：终端 A `npm run dev:server`，终端 B `npm run dev:client`，浏览器开 vite 显示的端口（5173 已设 strictPort，被占会直接报错而不是悄悄换口）。
4. **M2 预备**：注册樱花穿透、领免费隧道（HTTP 类型 + 海外建站节点 + 免费子域），配置卡在 [PLAN.md 附录](PLAN.md)。

## 已知限制 / 技术备注

- **断线重连**：服务器冻结等待 60 秒。仅「网络闪断但页面没刷新」时浏览器会用内存里的重连令牌自动回座；**刷新/关闭标签会丢失令牌**，对方需等 60 秒超时后重新进房。如需刷新也能回座，M2 可把令牌存 sessionStorage。
- **房间码 = Colyseus roomId**（9 位随机串），未做 6 位短码映射；需要更短码时在房间层加映射表即可。
- **插值**：指数平滑（自己 22/s、对方 12/s 的收敛速率），局域网够顺滑；公网要顺滑需升级为 100ms 快照缓冲插值（M3）。
- **bat 脚本编码坑**（改动 start*.bat 前必读）：cmd 按 GBK 解析批处理，**禁止用 UTF-8 保存含中文的 .bat 或加 `chcp 65001`**——UTF-8 中文字节按 GBK 解码会撕裂整行命令（症状：双击窗口一闪而过，报 `'xx' 不是内部或外部命令`）。正确做法：文件存 **GBK 编码 + CRLF 行尾**，不写 chcp。生成方式：UTF-8 写临时文件后 `iconv -f UTF-8 -t GBK`，再 `sed -i 's/$/\r/'`。
- **Colyseus 版本坑**（重要，升级前必读）：
  - `colyseus` 必须钉 `0.16.0` 整版——0.16.1+ 硬依赖 git 仓库的 uWebSockets transport，npm 12 默认拒绝装 git 依赖（EALLOWGIT）。
  - 所有 colyseus 运行时导入统一从 `packages/server/src/colyseus.cjs.ts` 走 require 链；直接 `import "@colyseus/ws-transport"` 会加载它的 ESM 入口，与主包分裂成两个 core 实例（症状：seat reservation expired）。
  - Schema 子类字段一律在 `constructor` 里赋值；tsconfig 已设 `useDefineForClassFields: false`。
- **渲染**：0.2.0 起为像素级复刻（配方逆向自原版 init.js，见下「视觉复刻坑」）。角色 `PLAYER_SCALE=0.95`（原版实测），legs/head/glow 同锚点同心叠加，组锚点在脚底上方 `FEET_TO_CENTER=29px`。
- **视觉复刻坑**（改 GameScene/BootScene 前必读）：
  - **图块集必须预取后同步供给** `parseLevel`——直接把 fetch Promise 传进 TilesetProvider 会让 `tileTypeOf` 全部失败，所有地块退化成实心（液体/斜坡消失）。见 `main.ts` `fetchLevel`。
  - **帧名陷阱**：Phaser `texture.get(不存在的名字)` 静默返回图集第一帧（GroundAssets 是 `BeamDust0000`），不报错。MaskBox 实心帧是 5 位数字（`MaskBox00000`~`00003`），decor 帧带 `0000` 后缀（`decor_X0000`）。
  - **机关 gid 是图块集本地 id**：parseLevel 输出 `原始gid − Objects图块集firstgid(24)`，即本地 0=推块、2=拉杆、4=推箱（GameScene.buildMechs 有注释）。
  - **液体行扫描**：run 结束时循环变量已归 0，液体族必须取 run 起始格的值（buildLiquids）。
  - **内嵌浏览器 rAF 冻结**：遮挡/后台页签 `visibilityState==="visible"` 但 requestAnimationFrame 永不触发，Phaser 场景队列卡死（`loop.frame=0`）。已用 `fps:{forceSetTimeOut:true,target:60}` 修复，别删。
  - **场景数据传递**：Phaser `settings.data` 未传数据时是 `{}` 不是 undefined，`??` 兜底永远不触发——统一走 `globalThis.__fwInit`（main.ts 注入）。
  - 原版层序/坐标公式/动画帧率全部记录在 GameScene.ts 头注释与各 build* 注释内；原版参照截图在 TEMP/reference/（清理前自行留存）。
  - **已知行为差异**：原版参考页（8099 魔改版）教学文字渐进显示，我们按真实原版静态全显；原版有动态变焦相机（minScale≈全景），我们固定 1312×992 全景。
- 服务器只绑定 `127.0.0.1`，公网访问必须走穿透隧道（wss 由隧道 HTTPS 自动升级，客户端 `net.ts` 按页面协议自适应）。

## 里程碑进度

- [x] M0 环境/侦察/骨架
- [x] M1 联机最小闭环（本版）
- [ ] M2 樱花穿透联调 + 手机浏览器适配（触屏虚拟按键）
- [ ] M3 全机关数据驱动（梯子/推箱/球/激光等按 gid 枚举）+ 快照缓冲插值 + 存档/计时最优记录
- [ ] M4 多关卡选择与结算画面打磨
- [ ] M5 联调收尾与体验调参
