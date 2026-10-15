# Ubuntu 新机「非浏览器工具链」可用性冒烟矩阵

- 日期：2026-10-15（flash-prep 槽）
- 环境：Ubuntu（linux 7.0.0-38-generic x64），系统 Node v22.22.1
- 范围：仅非浏览器工具链。playwright/chromium/journey/regression/route*/visual-diff/fidelity 全程未触碰（主会话 e2e 时序验证专管）
- 命令单条超时上限 60s；未跑 MC 全量、未跑 optimize 全量

## 检测矩阵

| # | 工具 / 命令 | 结果 | 关键输出 / 备注 |
|---|---|---|---|
| 1 | `node --check` × 14 文件：`scripts/baseline/*.mjs`(4) + `scripts/e2e/lib.mjs` + `scripts/e2e/mc.mjs` + `scripts/e2e/routetool/*.mjs`(8) | PASS 14/14 | 全部语法级通过，无失败文件 |
| 2 | `node scripts/baseline/render-level.mjs <level.json>` | PASS | oracle `output/A/data/tutorials/levels/forest_01.json` EXIT=0 出完整 ASCII 图（含平台行、出生点 1/2、门 A/B、按钮 P、拉杆 L、箱 X）；本地 `data/forest/levels/forest_02.json` EXIT=0。备注 a：forest_01 实际在 `data/tutorials/levels/`（本地与 oracle 一致），`data/forest/levels/` 从 forest_02 起，无 forest_01.json。备注 b（存疑待核）：forest_02 渲染 platform 32 `d=(5,undefined)`、platform 36 `group=undefined`，本地该关 platform properties 有缺字段（脚本直接读 `properties.dx/dy/group`，内核是否有默认值未查，不下终判） |
| 3 | `node --import tsx scripts/e2e/mc.mjs --level forest_01 --trials 1 --seed 42` | PASS | `forest_01 MC: 1/1 (100.0%) seed=42 判据: ≥98%`，EXIT=0，real 1.662s。内核仿真链路（kernel.mjs + 关卡 JSON + 路线输入）本机可运行。备注：用法注释要求 `PATH="$PWD/TEMP/node:$PATH"`，本机无 `TEMP/node/`（便携 Node 未装）；mc.mjs 不 spawn 子进程，系统 Node 直接可跑 |
| 4 | routetool CLI 入口 × 4：optimize / scan / multistart / validate | PASS 4/4 | 四工具均无 `--help`/usage 分支，按约束以坏参数触发立即退出为存活判据：`--route /nonexistent/route.json`（scan 为位置参数）均报 `Error: ENOENT ... /nonexistent/route.json` 且 EXIT=1，顶层执行至 readFileSync，证明 ESM 依赖图（tsx + lib/kernel/pool）完整加载、入口可达，未真跑优化 |
| 5 | `scripts/vendor-box2d.mjs` import 试载 | **FAIL** | `Error: init.js 长度 2218873 ≠ 2273196，参考库可能被改动，中止`，EXIT=1。详见下节取证 |
| 6 | `scripts/baseline/golden/` 金轨迹完整性 | PASS | 12 文件（6 轨迹 + 6 input）与 `scripts/baseline/README.md` L176-182 记载吻合，无缺件；12/12 JSON 可解析（PARSE_OK） |

## #5 FAIL 取证与初步归因（存疑待核，不下终判）

错误原文：

```
Error: init.js 长度 2218873 ≠ 2273196，参考库可能被改动，中止
```

证据链（均可复现）：

1. 脚本硬编码（`scripts/vendor-box2d.mjs` L11-13）：期望 init.js 全长 **2,273,196 B**，切片 `[START=1,132,453, END=1,654,645)`，即期望产物 **522,192 B**。
2. 本机 oracle 文件 `Fireboy-and-Watergirl/output/A/js/init.eb02fbdab2aa1d24.js`：实测 **2,218,873 B**，sha256 `337125629748bace45e23b040e54b0d206e4cd78c9c8709d7785faa637e00677`；git blob（cea1fd1）同为 2,218,873 B，工作区 `git status` 干净（未被本地改动）；文件 CR 计数 0（纯 LF，排除 git 换行转换）。该文件来自提交 `cea1fd1`（merge: 并入 Fireboy-and-Watergirl 官方参考库，upstream 1224HuangJin）。
3. 字节差 **54,323 B** 为真实内容差异（非 CRLF）：疑为 vendor 脚本注释记录的是另一构建版本的 init.js，与本机 upstream 版本不一致。同名不同长（文件名含内容 hash eb02fbdab2aa1d24）这一点反常，待核。
4. 既有产物 `packages/shared/vendor/box2d.js` **510,923 B**，sha256 `d8a9edad036999053839ae5da070811e34417a6616dc39af6743f802471ee80e`，git 已跟踪且工作区干净；不等于 END-START=522,192（差 11,269 B），说明该产物也非按本机 oracle 用当前偏移可复现的切片。
5. 守卫在 writeFileSync 之前触发：本次试载**未写任何文件、未污染工作区**（`git status --porcelain` 中无 vendor 相关条目）。

初步归因（待主会话/5.3 生产槽裁决）：vendor-box2d.mjs 的硬编码长度/偏移与本机 upstream 参考库 init.js 版本不匹配，提取链路在本机当前数据上不可复现既有产物；不排除 upstream 合入版本与脚本撰写时所用构建版本不同源。

## 环境观察（非阻断）

- `scripts/baseline/README.md` L16-18 要求便携 Node 放 `TEMP/node/`（gitignore 内）。本机缺失该目录；本次全部冒烟用系统 Node v22.22.1 通过。浏览器类脚本（capture.mjs 走系统 Edge channel）不在本次范围，未验证。
- 工作区在本次冒烟前已有他人改动（`scripts/e2e/route.mjs`、`scripts/e2e/inputs/routes/forest_15.json.best.json` 修改，未跟踪 `.v2c/`、`note/ubuntu-server-profile.md`），本次未触碰。

## 结论

12 项子检测：11 PASS / 1 FAIL。唯一 FAIL 为 vendor-box2d.mjs 提取守卫（oracle init.js 字节数不符），不影响内核仿真、渲染解码、路线工具链的可用性；复现/重提取 vendor bundle 前需先解决版本锚定问题。
