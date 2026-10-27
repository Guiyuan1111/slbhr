# slbhr

森林冰火人（Fireboy & Watergirl）复刻：服务端权威在线双人版，三部神庙全量入库——**森林（forest，48 关）/ 灯光（light，40 关）/ 冰雪（ice，51 关）**。当前版本以 `gyのFW/package.json` 的 `version` 为准（避免本行再次漂移），版本史见 `gyのFW/note/release/`。

私有仓库，禁止公开分发；官方素材仅限私用。

## 仓库结构

| 目录 | 用途 |
|---|---|
| `gyのFW/` | 主工程（npm workspaces：client = Phaser 3 + Vite，server = Colyseus 权威服务端，shared = Box2D 物理内核）。开发文档全部在 `gyのFW/note/` |
| `Fireboy-and-Watergirl/` | 原版官方网页参考库，**严格只读**（保真仲裁的唯一事实源） |
| `报告/`、`codebase-analyzer/` | 技术分析产出（历史） |
| `.zcode/agents/` | 子 agent 槽型定义（flash-prep 预处理/生产槽） |

提交一律在仓库根进行（monorepo，2026-10-03 起）。

## 开发命令（在 `gyのFW/` 内）

```bash
npm ci                          # 安装依赖（Node 22 LTS）
npm run typecheck               # 零输出 = 过
npm run test                    # vitest，应全绿
npm run build                   # vite 构建（含素材同步）

# 关卡验收门禁（真实服务器 + 纯 Node 双客户端回放；CI routes-smoke 同款）
node --import tsx scripts/e2e/route-node.mjs --level forest_01 --repeat 3 --offset -15
# 浏览器回放变体：前置 npx playwright install chromium（Windows 缺省 msedge 通道，FW_BROWSER_CHANNEL 可覆盖）
node scripts/e2e/route.mjs --level forest_01 --repeat 3 --offset -15
# 三部分部确定性基线（逐位一致）
node --import tsx benchmark/perf-determinism.mjs --filter forest --compare r0-baseline
node --import tsx benchmark/perf-determinism.mjs --filter light  --compare r0-light
node --import tsx benchmark/perf-determinism.mjs --filter ice    --compare r0-ice

# 常驻服务器（游玩服 3700 + oracle 只读伺服 8787）
scripts/dev/servers.sh start|stop|status|restart [play|oracle|all]
```

## 游玩

`scripts/dev/servers.sh start` 后浏览器双开 `http://127.0.0.1:3700/?level=forest_XX`：
A 标签建房选火人（方向键），B 标签房码加入选水女孩（WASD），P 暂停。

## 文档入口

- **总导航**：`gyのFW/note/00-INDEX.md`（全部文档域的枢纽，先看这个）
- **当前状态/交接**：`gyのFW/note/handoff.md`（顶部最新条目）+ `gyのFW/note/handoff/`（历次交接简报）
- **版本说明**：`gyのFW/note/release/<版本号>.md`
- **关卡取证档卷**：`gyのFW/note/evidence/forest_XX/`
- **研究档卷**：`gyのFW/note/research/`（保真审计 2026-10-fidelity/00-INDEX.md 01–37 号档、行为复刻 2026-10-behavior-parity/00-INDEX.md 总索引、autoplay 等，各域均有索引）
- **性能/环境报告**：`gyのFW/note/report/`

## 关卡账目（forest 48 关；light 40 关 / ice 51 关账目见 gyのFW/note/ 各档卷）

绿关 8（01/03/04/06/06_1/07/12/26）+ 豁免 13（03_1/09/09_1/11/12_1/16/19/21/28/32_1 + 23/24/08〔2026-10-15 用户终裁保原样〕）+ 挂起 4（02/32/14/14_1，内核 WIN·门禁受阻族）= 终态 25/48（8+13+4；2026-10-20 对 handoff 归档终裁条目核对属实，0.3.51 #46 修正账目口径）（2026-10-20 对 handoff 归档终裁条目核对属实）；另有 forest_05〔2026-10-23 剔出缺陷关线：05 号档 oracle 实机 ORACLE_SOLVED、06 号档内核有 WIN@f1738 路线（MC 门禁架构级未过），转复活预案线处置〕、forest_25 保原样豁免候选（第 16，oracle 实机 ORACLE_UNSOLVED）自主执行待用户追认，若追认则 26/48；P-03 缺陷关重设计 S 档试点（forest_14/14_1）2026-10-23 获批、数据分叉 cb32 落地（865a0fb），2026-10-24 整关路线重建完成：**双关内核 WIN（统一循环梯子路线，winF=3026，15 钻+双门+零死亡，路线入库 scripts/e2e/inputs/routes/，validate 退出码 0；「真可通关」口径 11→13）**；但 MC 门禁 0%×3、真服 route e2e 0/7（0/3+偏移扫 0/4）——平坦事件表无法承载 goo 岛链滑翔 ±6px 发射窗与 roman 中性跷跷板双人态编排（闭环设计 vs 开环回放的结构性冲突，同 forest_02/05 MC 架构墙族），两关自豁免账转**内核 WIN·门禁受阻挂起族**（02/32/14/14_1），终态 25/48 不变；攻关档案与断点见 gyのFW/note/evidence/forest_14/02号档；其余按生产线逐关推进。
