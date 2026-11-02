# ice_02 反事实档卷：TimedPusher timeMs 窗口因果实验（2026-11-01，槽 fw-ice02-cf）

> **【反事实副本实验，非原版路线】** 本档全部结果来自关卡数据**内存副本**（`data/tutorials/levels/ice_02.json` 深拷贝注入 `properties.time`）的回放，**不构成 ice_02 原版的任何通关路线**；原文件全程只读零接触，收尾 md5 核验不变（见 §7）。route 不造假边界不受影响，ice_02 原版链仍 4/5。

状态：**反事实成立（因果方向证实），07号档 §7.1 数字面证伪并修正**。单改 `timeMs` 一个字节级参数即把两条结构性死点配方翻转为全链 WIN——「闸窗口是 I4 唯一约束」从推断升级为因果；但精确阈值与 §7.1 预测不同：**fb 侧 4500ms 即解（预测 5600 远超所需），wg 侧 5800ms 才解（预测 5600 仍钉死）**。双配方同时全解的最低点 = **5800ms**。

## 0. 结论速览

| 断言 | 判定 | 关键数字 |
|---|---|---|
| 闸窗口是 I4 唯一约束（§7.1 假设的因果部分） | **成立** | 单改 timeMs：M1 于 4500ms 起 WIN@2069；G3 于 5800ms 起 WIN@2292 |
| §7.1「4000→5600 则双端同解」 | **数字面证伪** | 5600 时 M1 已 WIN（过阈值 1100ms 冗余）；G3 仍 TIMEOUT（wg 钉 259，差 200ms） |
| §2 窗口账本「过闸面 center≤272 + 24f 封头」 | **模型欠准（修正）** | 真约束=闸**体**面 x∈[256,288] 头托滑过；pin 点 fb263/wg282/259/254 均已越过 272 平面（§5） |

## 1. 装载机制与注入路径

- `scripts/e2e/routetool/kernel.mjs` `makeWorld` → `locateLevel` 按 `LEVELS_DIRS` 固定序检索 `${level}.json`，**无关卡 doc 覆盖钩子**（只读确认）。
- parseLevel 链：关卡 JSON `layers[3].objects[8]`（gid 38，`properties.time=4000`）→ `level2.ts:868` `timedPushers[0].time`（缺省 2000）→ `mechanisms.ts` TimedPusher `this.timeMs = def.time` → `checkState` 计时到 `timeMs` 落闸（hold-to-reset：按压期每帧清零计时）。
- 本槽驱动绕过 `makeWorld` 缓存：**内存深拷贝 doc → 改 `properties.time` → `parseLevel("ice_02", docCopy, makeProvider(原目录))` → `new World`**。原 JSON 与 `packages/**`、`scripts/e2e/routetool/**` 零改动。

## 2. 驱动与等价性验收

- 驱动：`note/research/2026-10-autoplay/tools/sweep-ice02-cf.mjs`（本槽自建件；照 `sweep-ice02-i4.mjs` 口径）。回放环逐行复刻 `autosearch.mjs evaluate` 物理口径：同 `PRIM_TABLE` 编译（`ice_02.autosearch.search.json` 末段定稿前缀 + 变体后缀）、同 step→快照顺序、同队列空输入锁存；遥测=AS_DBG_MOD=2 同列同格式（f,fbx,fby,fbg,wgx,wgy,wgg,P2y，全 toFixed(0)）。与 evaluate 的差异仅搜索无关项（无 entryG/horizon 冻结，跑到 死亡/WIN/capF=3829）。
- **对照验收（timeMs=4000）**：M1/G3 帧 CSV 与 07号档存档 `w16.M1-ml645-w425-d116.csv` / `w13.G3-wgD200.csv` **1232/1232 行逐行一致**（f=0..2462）；事件行（press/open/fall/deadF_est）1512/1600/1924/1946 与 1512/1600/2066/2088 逐位复现。证据：`tools/out/ice02-cf/cf-control-parity.txt`。驱动等价性由逐字节对表证毕，变体跑的数字因此可信。

## 3. 全矩阵数字表（实跑 CSV：tools/out/ice02-cf/cf-results-full.csv；28 跑）

配方：`M1-ml645-w425-d116`（v-wave16，fb 末位离开，fb leave≈1684）与 `G3-wgD200`（v-wave13，wg 板驻留 dawdle 末位离开，wg leave≈1826）。fallF/deadF_est 等 2f 采样粒度。

| timeMs | timer(f) | M1 判定 | M1 fb endX | M1 fallF | G3 判定 | G3 wg endX | G3 fallF |
|---|---|---|---|---|---|---|---|
| 4000 | 240 | TIMEOUT（对照） | 302 钉 | 1924 | TIMEOUT（对照） | 302 钉 | 2066 |
| 4400 | 264 | TIMEOUT | **263 钉**（已越 272 平面） | 1948 | TIMEOUT | 302 | 2090 |
| **4500** | 270 | **WIN@2069** | 48 | 1954 | TIMEOUT | 302 | 2096 |
| 4600 | 276 | WIN@2069 | 48 | 1960 | TIMEOUT | 302 | 2102 |
| 4800 | 288 | WIN@2069 | 48 | 1972 | TIMEOUT | 302 | 2114 |
| 5000 | 300 | WIN@2069 | 48 | 1982 | TIMEOUT | 302 | 2124 |
| 5200 | 312 | WIN@2069 | 48 | 1994 | TIMEOUT | **282 钉** | 2136 |
| 5600 | 336 | WIN@2069 | 48 | 2018 | TIMEOUT | **259 钉**（已越 272 平面） | 2160 |
| 5700 | 342 | WIN@2069 | 48 | 2024 | TIMEOUT | **254 钉，P2 驻 55** | 2166 |
| **5800** | 348 | WIN@2069 | 48 | 2030 | **WIN@2292** | **183** | 2172 |
| 5900 | 354 | WIN@2069 | 48 | 2036 | WIN@2292 | 183 | 2178 |
| 6000 | 360 | WIN@2069 | 48 | 2042 | WIN@2292 | 183 | 2184 |
| 6400 | 384 | WIN@2069 | 48 | 2066 | WIN@2292 | 183 | 2208 |
| 6800 | 408 | WIN@2069 | 48 | -1（WIN 先至，闸未落） | WIN@2292 | 183 | 2232 |

恒量对照（不变性）：pressF=1512、openF=1600 全程不变（按压/开闸段与 timeMs 无关）；fallF 随 timeMs 精确 +1f/20ms 平移（1924→2232）；M1 wg（先过者）endX=182 与 G3 fb（先过者）endX=48 全程不变。WIN 帧恒定：M1=2069（fb 末到门）、G3=2292（wg 末到门）。

## 4. 阈值判定

- **fb 侧阈值 = 4500ms**（M1 配方）：4400 败（fb 钉 263）→ 4500 WIN@2069。07号档 §2「fb 最优 262-266f 差 2-6f」→ 精确缺口 ≈ 30f timer（240→270），即 fb 只差 **+500ms**。
- **wg 侧阈值 = 5800ms**（G3 配方）：5700 败（wg 钉 254）→ 5800 WIN@2292。07号档 §2「wg 314-319f 超 52f」→ 精确缺口 ≈ 108f timer（240→348），即 wg 需 **+1800ms**。
- **双配方全解最低点 = 5800ms**（M1、G3 均 WIN@各自恒定帧）。§7.1 选的 5600 恰落在 wg 侧缺口内（5600 时 wg 钉 259，仍差 200ms）。

## 5. 新机制发现：闸体面头托滑过判据（修正 §2 窗口账本）

- 闸台 p2 定义（ice_02.json layer3）：`x=256 w=32 h=96 props{dx:0,dy:3}` → **体面 x∈[256,288]**，快照 P2=(272,112) 为居中锚点。开态 P2 y=16，闭态 112，落闸 ~1px/f。
- **真判据不是「过闸面 center≤272+24f」而是「闸体压头前身体东缘越过闸西缘 256（center≤240）」**。实测 pin 点全部落在 272 平面与 240 净空线之间：fb 263@4400、wg 282@5200、259@5600、254@5700——即 §2 的「不可通过」事件行（P2≥42）之后角色仍可滑行 ~12-43px。
- **头托滑过（5800 通过侧）**：G3@5800 wg 2172 落闸（P2 16→上行）后仍以 ~1px/f 西爬，P2 升至 46-61 区间闸底压头，闸**骑在 wg 头上**随其爬行，直至 ~2214 身体出 256 西缘即自由，2280 到门条 183，2292 WIN。逐帧：`tools/out/ice02-cf/G3-wgD200.t5800.csv`（f2160-2300 段，wg 293→183，P2 16→112）。
- **摩擦锁死（5700 失败侧）**：相位差仅 6f（落闸 2166 vs 2172），wg 钉 254，且 **P2 驻停在 55 不再下行**——闸被托在 wg 头上互锁，永困。逐帧：`G3-wgD200.t5700.csv`（f2204 起 wg=254/P2=55 恒定）。
- 因此「窗口」是动态条件（角色闸下爬速 ~1px/f vs 落闸 1px/f 的相位赛），静态「末次离开+Nf」账本只到一阶近似；阈值邻域 5700/5800 为 6f 相位刀锋。

## 6. 反事实判定（对 07号档 §7.1 的最终答复）

> §7.1 原文：「oracle 副本实验证 timeMs 缩放→窗口迁移（4000→5600ms 即 +96f，两端角色同时解）」。

- **因果方向成立**：timeMs 是充分解锁参数——无需动配方、动物理、动其他机关，单改 timeMs 即两配方全链 WIN（含门条、双门、phase=won 全程内核官方判定）。
- **具体数字证伪**：5600 不是双解点。fb 只需 4500（§2 的 fb 账本高估了 30f 缺口中的大部分），wg 需 5800（§2 的 wg 账本 314-319f 低估了闸体滑过段，实际 timer 缺口 108f）。两缺口不对称源于末位离开者身份相反（M1=fb 末位、G3=wg 末位）+ wg 冰拖物理（board→graze 114f vs fb 90f）。
- 若上游 chain 允许机制 override：**5800ms 是双配方全解的最低 timeMs**；若只救 M1 类 fb 末位架构，4500ms 足矣。

## 7. 红线核验与产物清单

- 原文件核验：`data/tutorials/levels/ice_02.json` md5 = `117f76d4aa2ea5587cd45c648c2944ff`（实验前后一致，实验中零写入）；`packages/client/public/data/tutorials/levels/ice_02.json` 同值未动。
- 禁改域确认：`packages/**`、`scripts/e2e/routetool/**`（只读 import）、oracle 快照、`note/handoff.md`、README 零改动。
- 本槽产物：
  - 驱动：`tools/sweep-ice02-cf.mjs`
  - 变体库：`tools/out/ice02-cf/v-cf.json`（M1/G3 原样拷自 v-wave16/v-wave13）
  - 汇总：`tools/out/ice02-cf/cf-results-full.csv`（14 timeMs × 2 配方）
  - 逐帧：`tools/out/ice02-cf/{M1,G3}-*.t<timeMs>.csv` ×28
  - 对照验收：`tools/out/ice02-cf/cf-control-parity.txt`
- 临时环境 `TEMP/fw-icf-1`（括号扫初稿）已清理。
- 复现命令：
  ```
  node --import tsx note/research/2026-10-autoplay/tools/sweep-ice02-cf.mjs \
    note/research/2026-10-autoplay/tools/out/ice02-cf/v-cf.json \
    --timeMs 4000,4500,5800 --csv /tmp/x.csv --frames-dir /tmp/frames
  ```
  （驱动会自动补 `--level ice_02` 供 autosearch 顶层 chain 校验；对照 4000 需与 `tools/out/ice02-i4/w16/w13.*.csv` 逐帧一致方为有效跑。）

## 8. 对后续槽的输入

1. 若做机制参数面关卡（ice_02-t5800 变体关）：阈值 4500/5800 已给，且 5800 邻域为 6f 刀锋，做关时应留 >10% 余量（如 6400-6800）。
2. 原版 ice_02 判负结论不变：本档不改变原版链内无解的判定，仅把「唯一约束=闸窗口」从推断升格为实证因果，并修正窗口账本的闸体滑过细节（§5）。
