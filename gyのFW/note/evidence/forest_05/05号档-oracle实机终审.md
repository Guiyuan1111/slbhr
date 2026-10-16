# 05号档 — oracle 实机终审：forest_05 watergirl 能否登上 P3 东顶

- 槽位：o05a（预处理/备料槽）
- 日期：2026-10-16
- 被审对象：`Fireboy-and-Watergirl/output/A`（原版 oracle bundle，严格只读，本次全程未写入）
- 终审问题：r05f 内核 04号档实证 wg 唯一上升入口（登上 P3 东顶）被"三重封死"；原版引擎实机下是否同样封死
- **判定：ORACLE_SOLVED —— 原版引擎实机下 wg 能登上 P3 东顶，人手输入完全可行。**
- 上位文档：`04号档-r05f-W3封死实证与wg困死论证.md`（内核侧证据链）

---

## 1. 实验环境与进关管道

| 项 | 值 | 来源 |
|---|---|---|
| oracle bundle | `output/A/js/init.eb02fbdab2aa1d24.js`（上游改版 1224HuangJin，可变 dt box2d；60fps 帧锁下行为 ≡ 原版） | p0-inspect |
| 伺服 | `python3 -m http.server 8843 --bind 127.0.0.1 -d Fireboy-and-Watergirl/output/A`（只读目录，仅本机回环） | serve.log |
| 驱动 | playwright chromium headless `--mute-audio --disable-webgl` | lib.mjs |
| 进关管道 | AdManager.showAd 桩 → `g.currentTemple = temple.json` → `menu.skipToLevel(entry 原对象)`（o25a 先例逐字移植，端口 8842→8843） | lib.mjs `openGame/enterLevel` |
| 键位 | watergirl = W/A/D（KeyW/KeyA/KeyD）；fireboy = 方向键 | lib.mjs `WG/FB` |

管道对照（p2-control-win）：teleport 双角至各自门位 → `win:true` 全链路实录（p2-control-win.json）——进关、采样、判定、读态管道全程可用。

机关链对照（p1-leverflip）：fb tp (470,668.8) → **真实键盘** ArrowLeft 触杆2 → `lever.state===1` → P3 tween 572.26→700.26（约 2.4s，deviceGroups[3]）。真实输入驱动的机关链，非直接改状态。

角色物理模型（p0/p3 系列实测，与内核 04号档一致）：大圆 r15.36 圆心 core−6.4（头顶 = core−21.76）、小圆 r6.4 圆心 core+28.8（脚底 = core+35.2）；满跳 rise 102.5–102.75px、起飞 vy≈−480px/s、g≈1123px/s²、跑满速 vx≈272px/s。

## 2. 关卡几何（oracle 世界刚体 dump，双引擎一致）

来源：p3c-bodies-all.json / p3c-bodies-region.json（Box2D 全刚体 dump，与内核 geo.out 对照）。

- floor 896 仅 x∈[640,864]；x∈[864,896] 是全高支撑墙（tile col27）；tile-6 台面 y=864 从 x=896 起；east704 台 [768,896]×[704,736]。
- **wg 在本区可达地板实为 x∈[655.4,848.6]**（西界 655.4=西墙缘+体半径）。
- P3 fixture：半宽 68.0 × 半高 14.08px（x 向无 padding，y 向 padding 0.06m=1.92px）→ **东驻带 x∈[632.26,768.26]、y∈[803.92,832.08]**；杆2翻转后平台中心 x 572.26→700.26。
- 站位核心高：floor 896 → core 860.54；P3 东顶 803.92 → 站位 core 768.72（实测稳定值 768.48）。

## 3. 实验 A：复刻 r05f 弹幕扫参（oracle 版）

脚本 `p4-sweep.mjs`，全量采样 `p4-sweep.json`，命中轨迹 `p4-HIT.json`（16.7ms 全量采样）。

- 设计：x∈[660,790] 步 10 共 13 站位 × 预压 pre∈{1,3,5,8,11}f × 空中保持 hold∈{0,8,20,40}f，计划 260 组；HIT 后该行早停并补试，**实际 263 组全部有效，单会话完成（setupCount=1，全程零异常）**。
- 输入时序：`down(A) → pre×16.7ms → down(W) → 34ms → up(W) → hold×16.7ms → up(A)`。
- 判据：驻留 ≥15 采样 y∈[758,779] 且 |vy|<8 且 x∈(632,768)，或末态静止于该窗。

结果（p4-sweep.json summary：`{total:263, hits:1, maxRise:102.56, riseMedian:7.22, onTopAny:true}`）：

| 站位 x | 组数 | 命中 | maxRise (px) | 形态 |
|---|---|---|---|---|
| 660–770 | 240 | 0 | 6.95–7.3 | 满跳撞 P3 底（净空 7px，弹起即落） |
| 780 | 20 | 0 | 38–68.6 | 东棱角刮擦中间带（擦棱弹开） |
| 790 | 3 | **1** | **102.53** | **东缝跳命中** |

HIT 组合：**x=790，pre=1f，hold=20f** —— 起飞点 core_x 789.46、起跳 vx −22.87（西向小速）、顶点 core_y 758.01（高于台面站位线 768.72 约 10.7px）、越缘西漂后落于台面 (751.34, 768.48)，**驻留 42 采样帧**。全量轨迹见 p4-HIT.json。

## 4. 实验 B：人手微操鲁棒性

脚本 `p5-micro.mjs`（timelineTrial 绝对毫秒时间线调度器），全量 `p5-micro.json`。**35 组 28 中，单会话零冻结**：

| 组 | 内容 | 结果 |
|---|---|---|
| B1 | HIT 组合时机抖动 ±1–3f | 19/20 |
| B2 | 模式变体（W 先 A 后 / A 顶点放 / A 脉冲 / A+D 刹车） | 4/4 |
| B3 | 站位窗 785.5–793（HIT 输入不变） | 5/5 |
| B4 | 阻塞区 x≤784（负对照） | 0/6 |

结论：命中不依赖毫秒级精度；**站位窗 x∈[785.5,793] + 低预压（≤2f）+ 满跳 + 空中 A 保持 ≥12f 即稳定登顶**——真人可复现的操作窗。

## 5. 命中复现与三重验证（p4b）

脚本 `p4b-repro.mjs`，`p4b-repro.json`，登顶截图 `p4b-hit-top.png`。

- **22/24 命中**；有效窗 x∈[786,792] × pre≤2f × hold≥12f（例外：786-hold20 刮擦 44.58、794-hold12 落缘外）。
- 每次命中过三重验证：
  1. Box2D 接触查证：`contactsOnP3≥2 && anyTouching`（真接触非悬停）；
  2. 1.5s 静置后位置漂移 <0.1px（稳固）；
  3. 起跳一次再落回台面（复跳）。
- 当日复跑（本报告收尾前）仍 22/24，同会话数百次 tp/跳零异常——排除环境漂移。

## 6. 与内核 04号档的闭合度

| 量 | 内核 (04号档) | oracle 实机 | 闭合 |
|---|---|---|---|
| 满跳 rise | 102.5px | 102.5–102.75px | 一致 |
| 撞底截停 | 336 组一律 7.1–7.3px | x∈[660,770] 240 组 6.95–7.3px | **闭合**（内核预测净空 6.70px + 求解器穿透 0.3–0.6px，实测落在预测带上沿） |
| B4 阻塞区 x≤784 | 与内核 sweep 全灭一致 | 0/6 | 一致 |
| 登顶 | 0/336 | 263 组 1 命中 + 复现 22/24 + B 28/35 | 分歧，见下 |

**分歧根源（对 04号档 §5/§6 的关键勘误）**：内核 sweep 的走位原语 `S.hold("left", x<=pos)` 有滑停惯性——命令"走到 pos"实际停在 pos 西侧，再经 pre 帧蠕行后起飞点进一步西移，**336 组的实际起飞点全部落在 ≤780 撞底区**（对 pos=790 无感，一律 7.1–7.3）。即内核数据证明的是"其自动化走位原语到不了起跳窗"，**不构成"物理上不可登顶"的证明**。oracle 侧用 tp 精确站位（789–790）与人手走位（B3 785.5–793）都能进入起跳窗。04号档 §7 预留的"复活入口"方向由此坐实。

## 7. 地形勘误（双引擎一致，修 04号档）

04号档"floor 896 延伸至 x=1152"偏乐观。实况（oracle 刚体 dump + 内核 geo.out 双证）：
- floor 896 仅 x∈[640,864]；x∈[864,896] 全高支撑墙；x≥896 为 tile-6 台面 y=864；
- east704 台 [768,896]×[704,736] 悬于地板上方；
- wg 可达地板 x∈[655.4,848.6]。
本勘误不影响 04号档封死论证的方向（786–792 起跳窗仍在可达地板内），仅修正带宽。

## 8. 实验 C：未建模机制普查 —— INCONCLUSIVE（harness 受阻，如实挂账）

脚本 `p6-census.mjs`（多探针会话）、`p6b-singleshot.mjs`（单发会话）、`p6c-warmup.mjs`（暖身对照）；数据 `p6-census.json`（anomalies 12 条）、`p6b-singleshot.json`、`p6c-warmup.json`。

- 现象：teleport 探针注入后，oracle 以约确定的概率进入**自发性双门胜利僵尸态**：`st=endGame`、`physics paused`、wg 被吸至其门位 (304,548)、fb 吸至 (948,548)；页内 retry/skipToLevel 均不可恢复，仅重启浏览器可用。
- 触发模式：首探针点 x=656 或 700 即冻（p3d ×1、p6 ×5+、p6b 单发 ×1、p6c 对照 ×1）；**tp(788) 暖身后再 tp(700)+跳仍冻**（p6c A/C）。
- 决定性对照：p4-sweep x=660 行 20 次"真实走位+跳+撞头"（同为 P3 东驻下方）零事发；p4b 同会话数百次 tp(786–794)+跳零事发；p5 35 组零冻结。
- 结论：冻结与 **tp 位置注入**强相关，人类玩家无法 teleport → 判定为 **harness 伪影，非游戏本体行为**，不影响登顶判定与 04号档勘误。机理未定位（Level.prototype.animateFinish 取证钩子捕获的触发栈未读到有效样本），挂账如下节。
- 后果：C 的辅助探针（east704 台下穿透、terrace864 毒性、ledge544、tween 扫掠期 wg 漂移、双向横穿）未跑出数据。但 C 的核心问题"floor 660–790 是否存在隐藏上升机制"已被 A 实质覆盖（263 组无任何 >103px 或穿模异常，形态只有撞底/刮擦/命中三种）。

## 9. 判定与遗留

**ORACLE_SOLVED**：原版引擎实机下 wg 能登上 P3 东顶。操作：站位 x∈[785.5,793]（带东缘 768.26 与 east704 台支撑墙之间的连续地板上）→ 低预压 ≤2f 起跳满跳 → 空中按住 A ≥12f 西漂越缘落顶。留证：输入序列 p4-sweep.mjs 头注 + p4-HIT.json 全量轨迹；截图 p4b-hit-top.png。

由此，04号档"wg 困死"结论在原版引擎下**不成立**；其 7.1–7.3px 截停数据本身与 oracle 精确闭合（差 ≤0.35px），差异全部来自走位原语止步偏差，非物理差异。

存疑挂账（不隐瞒）：
1. tp 冻结毛刺机理未定位（见 §8）；
2. oracle 侧 x=700 单次 rise 118.9px 异常未能复现（p3 阶段观察一次，后续数百次无重现），按求解器毛刺挂账；
3. C 的辅助探针数据缺失（terrace 毒性、台底穿透等未测）；P3 移动中（tween 期）与 wg 的交互未实测；
4. 本判定的"可通关"仅指 wg 登 P3 东顶这一上升入口可行；全关通关路线设计归 5.3 生产槽，不在本档范围。

## 10. 复现指引

```bash
# 1) 伺服（只读，回环）
python3 -m http.server 8843 --bind 127.0.0.1 -d Fireboy-and-Watergirl/output/A &
# 2) 依赖：node>=18、playwright(chromium)
cd note/evidence/forest_05/tools/o05a
node p4b-repro.mjs     # ~5min，22/24 命中 + p4b-hit-top.png
node p4-sweep.mjs      # ~25min，263 组全量弹幕
node p5-micro.mjs      # ~8min，人手微操 35 组
```
注意：p6 系列（tp 普查）会触发 §8 冻结毛刺，属已知 harness 伪影。
