# slbhr

森林冰火人（Fireboy & Watergirl 森林神庙）完全复刻：服务端权威在线双人版。当前版本 **0.3.35**（版本史见 `gyのFW/note/release/`）。

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
npm run test                    # vitest，应 95/95
npm run build                   # vite 构建（含素材同步）

# 关卡验收门禁（真实服务器 + 双浏览器回放）
node scripts/e2e/route.mjs --level forest_01 --repeat 3 --offset -15
# 全 48 关位级确定性基线
node --import tsx benchmark/perf-determinism.mjs --compare r0-baseline

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

## 关卡账目（48 关）

绿关 8（01/03/04/06/06_1/07/12/26）+ 豁免 15（03_1/09/09_1/11/12_1/14/14_1/16/19/21/28/32_1 + 23/24/08〔2026-10-15 用户终裁保原样〕）+ 挂起 2（02/32）= 终态 25/48（2026-10-20 对 handoff 归档终裁条目核对属实）；另有 forest_05 判死路呈证待审、forest_25 保原样豁免候选（第 16，oracle 实机 ORACLE_UNSOLVED）自主执行待用户追认，若追认则 26/48；其余按生产线逐关推进。
