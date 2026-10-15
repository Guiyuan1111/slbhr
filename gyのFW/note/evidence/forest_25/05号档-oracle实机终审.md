# forest_25 05号档：oracle 实机终审（mesa 东行可解性）

- 槽位：o25a（oracle 实机终审槽）
- 日期：2026-10-15
- 判定（三态之一）：**ORACLE_UNSOLVED —— mesa 东行在原版引擎实机（oracle bundle + 原版数据 + 可变 dt + 真实键盘输入）下不可达：30 次全程作战 max_x 全部 < 1056（阈值=缺口西缘），绝对上限 1014.9px，与解析上界 1015px 闭合（差 0.1px）。**
- 附注（如实挂账，不改变上述判定）：风机关闭支路（lever l0 ← 摆杆乘骑）几何链成立但 8 代脚本控制器未能稳定乘摆（INCONCLUSIVE-lever，见 §7）；该支路不涉及"风开状态下 mesa 东行"，不影响本判定。
- 管道对照（实验 C）：**通过**——能进关、能采样、能判死、能 WIN（p3c 门机链 animateFinish→gameFinish→endGame{success:true}）。

---

## 1. 环境与入口（全部可复现）

- 服务：`python3 -m http.server 8842 --bind 127.0.0.1 -d Fireboy-and-Watergirl/output/A`（只读 serve，进程记录 `TEMP/o25a/serve.pid`）。
- 浏览器：playwright chromium headless，`--mute-audio --disable-webgl --js-flags=--max-semi-space-size=64`，视口 1280×800（lib.mjs `openGame()`）。
- 进关（绕过 UI，不改 oracle 任何字节）：
  1. `AdManager.showAd = (cb) => cb()`（广告桩，仅页内运行时）；
  2. 页内 fetch `data/forest/temple.json` → `g.currentTemple = temple`（skipToLevel 需要 temple.id 装载图集）；
  3. `g.state.states.menu.skipToLevel(entry)`，entry 为 temple.json 中 `{id:25,_id:29,filename:"forest/levels/forest_25.json",time:45}` 原对象。
- 键位（bundle keymap 实测）：watergirl=W/A/D（87/65/68），fireboy=ArrowKeys。
- 采样：包 `state.update` 逐帧记录 wg/fb 像素坐标+速度（lib.mjs `attachSampler`）；胜利/失败链：hook `gameFinish`/`gameOver` + 包 `state.start` 抓 `{success}` 实参。
- 基建：`TEMP/o25a/lib.mjs`（openGame/enterLevel/attachSampler/键位表），已入库 `note/evidence/forest_25/tools/o25a/lib.mjs`。

## 2. oracle bundle 溯源披露（判决适用范围）

- 文件 `output/A/js/init.eb02fbdab2aa1d24.js`，2,218,873 B，md5 `d637cb8c2a51423d418c93431fc37ad3`，merge commit `cea1fd1` 带入、无本地改动。
- 该 bundle 为**上游改版**（1224HuangJin）：①自定义 tick 调度器（GameConfig minTPS=50/maxTPS=100，dt 钳位 [1/100,1/50]，替换 Phaser.Game.updateLogic 为 accumulator）；②风阻尼改 dt-aware `0.975 ** (elapsed/16.67)`——60fps 下逐帧 ≡ 原版 0.975；③localStorage 作弊旗标存在但**本槽全程未使用**。
- box2d 步进仍为原版 `min(0.04, game.time.elapsed/1e3)` 可变 dt。**60fps 实跑下行为 ≡ 原版引擎**；dt 敏感性已由 r25d p59 扫描（21 组合全 <1056）排除为封印原因。
- 关卡数据保真：`forest_25.json` 与我方转录 md5 相同 `e65b96c8d51297e5acb2b4739fc94c77`（04号档 §1）。

## 3. 角色与风常数实测（oracle vs 内核）

| 项 | oracle 实测 | 内核 | 来源 |
|---|---|---|---|
| runForce | 50 | 50 | bundle ~1817300 区段 / kernel character.ts |
| jumpVelocity | 15.5 m/s (496px/s) | 同 | 同 |
| floatForce / defaultMaxSpeed / absoluteMaxSpeed / jumpImpulse / feetFriction | 30 / 8.5 / 40 / 1 / 0.5 | 同 | 同 |
| **wg 质量** | **0.9548 kg** | （内核假设 2.79） | `p2-windprobe.json`（body.data.GetMass()） |
| 线性阻尼 | 0 | 0 | 同 |
| world gravity | (0, 1000)/PTM32 = 31.25 m/s² | 同 | 同 |
| 风机身/朝向/长/组 | (1216,208)px、−1.5712（吹西）、len 14、group 4、running=true | 同（level2.ts 公式） | `p2-windprobe.json` |

- 质量差 0.9548 vs 2.79 的判决含义：力比较（runForce 50N vs 风力）与质量无关，**解析墙不受影响**（§5）；质量只进入惯性项（跳跃弧长、被吹回的恢复时间），方向上质量更小=被吹得更狠，同样不利于东行。内核（2.79）比 oracle 更"抗吹"，即**内核是更乐观的近似，oracle 更严酷**——04号档内核判死方向与 oracle 一致且 oracle 更强。

## 4. 对照实验 C：管道有效性（先于一切判定）

1. **进关+采样+判死**：p0-boot（进 25 关、双人出生 (1152,92.6)/(1088,92.6)、移动验证）；p1 30 次作战含死亡检测零误报。
2. **WIN 机器证明**（p3c，forest_03）：teleport 双角至 `door.y − 11` 落门板 → 跳醒身体 → 双门 `isUp` → `checkEndGame` → 实录 `["animateFinish",true,true] → ["gameFinish",3] → state.start("endGame",{success:true})`，`win:true`。**oracle 胜利链全通**。
3. **内核路线不可移植**（p3）：forest_03 内核验证路线逐帧回放 oracle，5/5 死（变 dt 混沌发散，死点各异）——证明比较只能在同一引擎内做（本档全部实验均为 oracle 原生输入脚本，非路线移植）。

## 5. 实验 A（核心）：mesa 东行 30 次全程作战

- 策略三族（复刻 r25d p56 + 相位/扰动扩展），全部真实 CDP 键盘输入：
  - `run`×15：西落 mesa (x≈802) 着陆后全程 R + 落地即跳（p56 策略本体），起点相位随机化；
  - `phase`×10：按 `game.time.now` 相位 [3.3,4.5]s 定时出发（扫风力 sin 相位 ±17% 振荡全周期）；
  - `spam`×5：D+W 高频拍键（50/60ms）扰动。
- 共同接近段：出生台西落 → 水槽 shelf → D+W 阶梯上 mesa；作战窗 25s，采样排空防污染。
- **结果（`p1-mesa-final.json` summary 原文）：**

| 策略 | n | min | median | max |
|---|---|---|---|---|
| run | 15 | 970.3 | 981.4 | **1014.9** |
| phase | 10 | 970.3 | 970.3 | 971.0 |
| spam | 5 | 923.1 | 924.3 | 924.6 |
| **全体** | **30** | **923.1** | **970.3** | **1014.9** |

  阈值 1056（缺口西缘）：**0/30 达成**；30/30 TIMEOUT（25s 未达缺口，无死亡误判）。
- run 族分布全列：970.3×5, 970.8, 974.3, 981.4, 983.8, 991.7, 995.9, 1002.5, 1006.6, 1012.3, **1014.9**——970.3 为强吸引子（=风-摩擦平衡极限环西端，与 r25d p53 kernel 极限环 942↔977 同族）。
- **解析封印（与实测闭合）**：风力 `f(x)=(1.2+0.2·sin)·100·(1−d/14)`，机身 1216：在 x≥992 处即使 sin=−1（相位谷底）风力仍 ≥50N=runForce → 992 以东净力恒向西，跑步不可再东移；仅存着陆滑距 `v²/(2a)`，a=f/m=50/0.9548·32≈1676px/s²、v=272px/s（绝对限速 8.5m/s）→ 22px；992+22≈**1014**。实测 max **1014.9** = 上界闭合（差 1px）。**风开状态下 mesa 东行在 oracle 中数学性封死。**

## 6. 实验 B：直落竖井（oracle 复核，5 run）

- p58（r25d/kernel）假设出生台面在井口 [1056,1088] 有洞可"跑跳下穿风带入井"。
- oracle 实测（`p5b-dive.json`）：**平台面 [1056,1088] 为实心**——口上垂直跳 ×3（x0=1060/1072/1084）全部原点落回 y=92.5 站位（bandDrift=null，从未下探 y<160）；西漂跳 ×2 落回板面 (1075.9/1095.9, 92.5)。
- 结论更正（对 04号档 §5 的 oracle 级复核）：**竖井唯一入口是 mesa 舷缘（x=1056，风带内 d=5m，风力 60-77N>50N，04号档 §3 已判步行不可越）**。井道与风带构成同一封印的两面。p58 的 48 组扫描失败根源即"板面无洞"。

## 7. 附加调查：lever l0 风关支路（INCONCLUSIVE-lever，如实挂账）

- 动机：l0（464,480，onis=−1，group4=风+此杆）翻转 → wind.running=false → 风开封印失效。stick 盒 [459.2,468.8]×[440,484.8] 位于摆杆（anchor 688,496，臂长 248）西弧扫掠区内。
- **几何链成立**（bundle 1645900-1649600 反混淆）：platform 为动态体、摆臂 revolute 限位 ±0.85·π/2=±76.5°（臂端可达 x≈447<459=杆盒区）；乘员西偏站位倾板（p4j 实测 rotMax=1.173rad=67°，倾板能力实证），倾 ~30° 时板缘在 x=464 处 y≈482 切入杆盒 y[440,484.8]；接触法线对 stick 铰 (464,502) 产生 τ<0，与翻转所需 angle<0（angle·onis>0）方向一致。
- **脚本乘摆未成**（8 代控制器 p4b→p4k，产物齐全）：331px 自由悬挂板上开环/半闭环平衡不可稳——p4b"乘摆成功"系**误读并更正**（tp 点 x=688 恰骑竖 bar 碰撞线，被挤落绿台 842.9，"位移"实为绿台步行）；p4h2 仪表实证恒 A 陷弧底势阱（板随人走、无相对滑动，f130-f1170 x 抖动 ±5px）；相位共振泵 p4j 落板循环 retP=137、p4k retP=151。45s 原版计时内窗口更紧（本槽实验为延时可信度曾覆写 `ui.clock.getElapsedSeconds`，均已披露）。
- 定性：**该支路未证伪（人手 60fps 闭环可能做到），也未被脚本证实**。它不触及"风开状态 mesa 东行"判死；若未来人类录像证实乘摆关风，则整关可解性翻案路径存在。按"不伪造"原则记 INCONCLUSIVE-lever。
- 顺带勘误（p5 副产物）：`lv.objects[6]`=摆杆实例；`MechManager` 在 `g.MechManager`（`lv.MechManager` 为 null）；hanging 不在 `deviceGroups`（wind/lever/pusher/platform 在）。

## 8. 终审裁定

1. **mesa 东行（风开）：ORACLE_UNSOLVED。** 证据三重：①解析墙（x≥992 净力向西+滑距上界 1014）与实测 1014.9 闭合（§5）；②30/30 作战 0 达标，吸引子 970.3 与 kernel 极限环同族（跨引擎一致性）；③竖井无独立入口，井与舷缘同面封印（§6）。
2. 内核判死与 oracle 判死**同向且 oracle 更严酷**（质量 0.9548<2.79 → 被吹更狠）。04号档"疑似原版关卡设计缺陷"获得原版引擎实机证据支持：**wind 机器全程覆盖 mesa 且力≥跑力 + 井口唯一入口在风带内 + 风关 lever 唯一候选路径需要摆杆乘骑**。
3. 整关可解性：取决于 lever 乘摆支路（INCONCLUSIVE-lever，§7）。本档不宣称整关不可解，只判定** mesa 东行在风开下不可达**——这正是 04号档留下的终审问题。
4. 建议：①找人类 forest 25 通关/乘摆录像（若存在 lever ride 实证则按 §7 链翻案）；②若无，按 forest_31/21/11/28/09/16/32 先例封印豁免，此关不计绿。

## 9. 产物清单（已入库 `note/evidence/forest_25/tools/o25a/`）

- 管道与对照：`lib.mjs`、`p0-boot.{mjs,json}`、`p3-control.{mjs,json}`、`p3c-doorstate.{mjs,json}`
- 实验 A：`p1-mesa-final.{mjs,json}`、`p1-final.log`（30 run 全列）；早期版本 `p1-mesa-v3` 留 TEMP
- 风常数：`p2-windprobe.{mjs,json}`
- 实验 B：`p5-dive.{mjs,json}`（v1，跑跳越口）、`p5b-dive.{mjs,json}`（v2 终版）
- lever 线：`p4-lever/p4b…p4k + p4h2-keys + p4i-keys .{mjs,json}`（8 代全链，含误读更正证据）
- 设备结构：`p4d-dump.{mjs,json}`、`p4e-find.mjs`
- TEMP/o25a 其余大文件（serve.log 0.5MB、p0-boot.png、历史版本）收尾清理，关键 JSON/脚本全数入库。

## 10. 复现指引

```bash
cd /home/gy/桌面/dev/slbhr
python3 -m http.server 8842 --bind 127.0.0.1 -d Fireboy-and-Watergirl/output/A &
node gyのFW/note/evidence/forest_25/tools/o25a/p1-mesa-final.mjs   # 实验 A（~35min）
node gyのFW/note/evidence/forest_25/tools/o25a/p5b-dive.mjs        # 实验 B（~2min）
node gyのFW/note/evidence/forest_25/tools/o25a/p3c-doorstate.mjs   # 对照 C-WIN（~1min）
```
