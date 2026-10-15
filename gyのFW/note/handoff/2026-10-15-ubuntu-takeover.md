# gyのFW 复刻项目接管简报（Windows → Ubuntu 移交，2026-10-15）

你是接管本项目的新 ZCode 会话。项目已从原 Windows 开发机整体迁至本机（本仓库即完整载体，clone 自足，无外部依赖遗留）。本文档是你的开工指令；更细的历史脉络在 `note/handoff.md`。

## 一、项目是什么

- 仓库根 `gyのFW/` 为主工程（npm workspaces）：`packages/client`（Phaser 3 + Vite 前端）、`packages/server`（Colyseus 服务端权威）、`packages/shared`（物理内核 + 从原版按字节抽取的 Box2D vendor）。
- **使命（冻结，不得重新解释）**：完全复刻原版游戏 Fireboy-and-Watergirl 森林神庙。三支柱：①全部 48 关真实可通关；②功能完整对齐；③引擎数值等价。
- 原版本体在仓库根 `Fireboy-and-Watergirl/`（706 文件）——**严格只读 oracle，绝不写入**。只读伺服：`node scripts/baseline/serve-original.mjs`（127.0.0.1:8787）。
- **单关验收金标准**：真实服务器 + 双浏览器（一火人一水女孩，真实联机协议）+ 无任何调试 hook（FW_DEBUG 禁用于验收）+ `scripts/e2e/route.mjs --repeat 3` 全过，并经主会话独立复跑确认（子 agent 自报永远不算绿）。

## 二、当前状态（截至 0.3.30 发版，2026-10-15）

- 版本：**0.3.30 已发**（tag `0.3.30`，GitHub Release 含便携包）。
- 关卡账目 **22/48**：绿关 8（01/03/04/06/06_1/07/12/26）＋ 豁免 12（03_1/09/09_1/11/12_1/14/14_1/16/19/21/28/32_1）＋ 挂起 2（02/32）。
- **待用户裁决三案（接手后尽快转呈，切勿自行修复）**：forest_23 / forest_24 / forest_08。三关均已证明"原版亦封死"（oracle 实验档卷：`note/evidence/forest_23/03号档-*`、`note/evidence/forest_24/26号档-*`、`note/evidence/r08e/` + `note/forest08-route.md`，档卷头部挂"待裁"横幅）。每案选项：保原样豁免 / 跳过 / 数据修复。
- 生产线：5 条 Flash 生产流在原 Windows 机撞配额墙阵亡，断点已全部收容入库。**复活预案（按离交付排序）**：r15f（forest_15，从 v43 起步，内核已 WIN@7936，路线在 `scripts/e2e/inputs/routes/forest_15.json.v43.json`）→ r25d（forest_25）→ r05f（forest_05）→ r17g（forest_17）→ r29d（forest_29）。断点工具在 `note/evidence/**/tools/breakpoint-*`。
- 结算面板等 UI 修缮已含在 0.3.30，待用户游玩目验。

## 三、接手后先做（按序）

1. 读 `note/handoff.md` 顶部 5 条（最新状态入口，全部历史在此）。
2. 环境验证：`npm run typecheck`（应零输出）→ `npm run test`（应 85/85）→ `npm run build`（应成功）。
3. **时序基线重定**：本机是 Linux，绝对时序与原 Windows 机不同属预期。跑一次 `node scripts/e2e/route.mjs --level forest_01 --repeat 3` 记录新基线。验收口径不变（repeat 3 ALL PASS + det 48 关位级一致）；物理内核确定性保证同输入同轨迹，**路线 JSON 不需要任何修改**。
4. 向用户报到：环境验证结果 + 新基线数字 + 转呈三案裁决 + 询问是否复活生产线。

## 四、工作纪律（长期有效）

- **禁止编造**：每个论断必须附 oracle 实验或原版 init.js 字节证据；引用必须带完整路径/链接。
- 细粒度 git commit，随时可回滚；commit 信息**禁止 co-author**；**禁止 `git add -A`**（只 add 自己的文件）。
- 文档随做随写：状态进 `note/handoff.md`（顶部插入新条目）；取证档卷进 `note/evidence/forest_XX/`；发行说明进 `note/release/<版本号>.md`；性能报告进 `note/report/perf/`。
- `TEMP/` 是草稿区，收尾必须清理。
- 官方素材仅限私用、禁止分发；服务器默认只绑 127.0.0.1。
- e2e 浏览器通道：环境变量 `FW_BROWSER_CHANNEL`（Linux 默认已落 bundled chromium，无需设置；Windows 语义默认 msedge）。
- 生产流撞配额墙时（[1302] 限速 / [1308] 池尽）：心跳提交断点后停止，勿硬重试空烧配额。
- 版本号四包（root/client/server/shared）统一更新，改动大时发 Release。

## 五、与用户的协作模式（用户已选定）

- 用户会**亲自游玩并逐条提要求**（"游玩→审查→提要求→修复"模式）：修复默认 UI/体验层，每条要求细粒度提交，不想要的整条丢弃、想要的合回 main。
- 若要求涉及物理/关卡保真（"这关不可能过/物理不对"）：**必须先对照原版 oracle 仲裁**——原版也如此 = 保真语义，不动；确认我方 diverge 才修。
- 较大改动开分支（如 `playtest`），避免直接在 main 上试验。

## 六、关键文件速查

| 用途 | 位置 |
|---|---|
| 路线库（含 .vNN.json 历史版本） | `scripts/e2e/inputs/routes/forest_XX*.json` |
| 生产工具链（optimize/validate/scan/multistart） | `scripts/e2e/routetool/` |
| 验收回放 / 蒙特卡洛 | `scripts/e2e/route.mjs --repeat N` / `mc.mjs --trials 150`（≥98% 才算硬） |
| oracle 探针骨架范例（READY 钩子/teleport/设备 dump） | `note/evidence/forest_25/tools/oracle-ghost-penetration.mjs` |
| 关卡数据解码（ASCII 地图） | `node scripts/baseline/render-level.mjs <level.json>` |
| 原版只读伺服（8787）/ 基准静态服（8791） | `scripts/baseline/serve-original.mjs` |
| 子 agent 槽型定义（Flash 预处理/生产槽） | `.zcode/agents/flash-prep.md` |

—— 以上。验证链全绿后向用户报到即可开工。
