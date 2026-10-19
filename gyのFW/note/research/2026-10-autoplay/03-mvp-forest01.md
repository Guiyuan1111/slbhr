# 03 · forest_01 机器自动探索通关 MVP —— 档卷（2026-10-16/17，auto-build2 槽）

## 0. 结论（MVP 三态）

| 态 | 范围 | 依据 |
| --- | --- | --- |
| **全自动（搜索解 + 段级 ±1f 穷举 Fatal=0）** | S0a、S0b、S1、S2、S3、**S4（r8a 轮过门）** | 各段定稿 `穷举Fatal=0`，seam 全绿；S4 end@f1370（fb25/wg25 原语累积），seam→S5 entry@1367 grace 0 |
| **半自动（搜索解 met，定稿门未过）** | ~~S4~~（已升级全自动，见 §3-10~14）、**S5（r8b，见 §3b-25）** | r1 轮（r8a 前身）定稿梯仍 fatal≥1，根因解剖见 §3-10~13；r2 轮 recipe 宏 d1 注入即过。S5：d1 met（entry+690f 双窗命中）但 ±1f 穷举恒 1 fatal |
| **未竟（未在新 wrapper 下重搜）** | S6、S7 | 旧配方为旧 wrapper 语义所写，未验证 |

**验收门现状：未达成。** 整关导出件 `scripts/e2e/inputs/routes/forest_01.autosearch.json` 仍为前槽 s7j 产物（runKernel WIN@f1977，但 ±1f 365/614 脆——不符 fatal=0）。本轮未产出新的整关导出（链条止于 S4 定稿门）。

## 1. 本轮断点（auto-build2 → 后续槽）

- 断点文件：`TEMP/autobuild/full18.search.json` 前的谱系——**活跃定稿链 = full7b（S0a/S0b/S1/S2）+ full14 的 S3 终稿**，累积 fb20/wg23 原语、前缀 1188f。后续槽恢复命令：
  ```
  node --import tsx scripts/e2e/routetool/autosearch.mjs \
    --resume <含 S3 新终稿的报告> --segs 5-8 --forcestart 5 \
    --out TEMP/autobuild/<新>.route.json --report TEMP/autobuild/<新>.search.json
  ```
  （注意：`--forcestart N` 的 N 是 chain.segments 数组下标，S4=5、S3=4；resume 种子取报告里【最后一个含 final 的段】，塞给 S4 必须用含 S3 final 的报告。）
- S4 现状：搜索稳定 met（wp4/4、rob 0/6），定稿梯子 seam 多档可过（entry@1367），唯一 remaining fatal 为 S3 尾 walkTo 刹车脉冲 ±1f 经 S4 四跳阶梯（jo→ride→jd40→jd25 落板）放大成 ±10~70px 落点彩票（fb[74] right-up@1204 -1 → fb[1025,317] 停板外压不到 b0；fb[77] left-down@1213 +1 → 阶梯整体崩塌 fb[777]）。
- 下一步建议：S4 fb 阶梯末端加位置反馈收编（板面 walkTo 短程回拉已是词表件，须保其不被泊位剪掉）；或 S3 fb 刹车改单脉冲定时闸；或从绿路线该跨度提取事件样式复刻（绿路线全局 222/222 ±1f 稳，其 S3→S4 手法天然鲁棒）。

## 2. 各段终态数字（活跃谱系）

| 段 | endF | trim（保留原语数） | 穷举±1f | 备注 |
| --- | --- | --- | --- | --- |
| S0a | 354 | fb5/wg3 | 0 | 前槽配方，本轮复核通过 |
| S0b | 558 | fb10/wg10 | 0 | 绿迹同款双 rj 塔出口 + sleep(24) 吸收头 |
| S1 | 934 | fb16/wg14 | 0 | waitPlat(1,586,600) 时序解耦 |
| S2 | 979 | fb18/wg19（full7 谱系保留 settle 尾） | 0 | waitPx+sleep60 解零窗联合 entry；jd24+hold60 墙锚 |
| S3 | 1188 | fb20/wg23（含 sleep20 吸收头） | 0 | wg: rj(1,0,18)+walkTo(1,341,999)；fb: goTo600+walkTo(1,1070,999) 墙锚 |
| S4 | 1367（搜索 met，未定稿） | — | 1（fb[74]/fb[77]） | jo455/475→ride→jd40→jd25 落 352 板 |
| S5-S7 | — | — | 未重搜 | 旧配方 |

搜索代价（本轮实测）：单段 recipe 段 ~200-2300 evals / 160-300s（beam24、samples10、budget6000 默认）。

## 3. 本轮新证机制（续 02 号档机制目录）

1. **finalizer 泊位剪的跨段反噬**：metIdx 剪按 met 帧消费数保留，会剪掉【met 之后才完成】的停驻原语（S3 fb 的 goTo(1060) 在 met@1188 后才收敛）——被剪程序连本段 target 重放都不再满足。深保留档（+1..+3、全长）就是解药，但须配 seam 逐档打点才可见。
2. **resume 种子取【最后一个含 final 的段】**：陈旧 final（哪怕 seam 失败的）会当种子被继承（full8 实证：S3 陈旧 final 18/21/1173f 被当 S2 种子）。清理断点报告时置 `final=null, solved=false`。
3. **`--forcestart` 下标 = chain.segments 数组下标**（S0a=0…S3=4、S4=5），不是段序号减一。
4. **slick 面刹车振荡的两级危害**：(a) 本段门检不可见（振荡环绕目标反复过窗，±1f 只改相位）；(b) 下段队列排干被推迟（goTo 永不 done → not-drained idx 卡 x/y）或阶梯启动整体平移。cure = walkTo(线,999) 过线反刹 + 立面墙锚收滑（fb 1076 / S3 wg 板面 341 实证 0/52、0/68）。
5. **walkTo vMax 限速脉冲步进是脆弱性发生器**（80 脉冲事件 136 败），vMax=999 单程直压+主动刹车才是正解。
6. **吸收头模式**：配方首部 sleep(15~30) 吸收 finalizer 对种子尾段 settle 的修剪（full8 S2 trim 17/18 砍 sleep(15) → S3 rj 提前 15f 发射落井底）。
7. **角色墙锚位移会打破下段 waitPx 契约**（fb 锚 1076 后 waitPx(fb,1080,1214) 永不燃）——改配方时须连带审查所有跨角色 waitPx 窗。
8. **窗界人工边界 vs 语义门**：S4 fb 目标窗 [955,1012] 东缘距搜索停位仅 2px，而真语义门是 `pushers[0].state===1`（压板 ⟺ 在板上）；窗放宽到 [940,1030] 去掉人工边界（checkpoints 已改）。
9. **S4 四跳阶梯（jo→ride→jd40→jd25 落板）无位置反馈**：上游 ±1f 相位差被放大成 ±10~70px 落点差——当前唯一未过门根因。板面回拉词表件（goTo970/992）在泊位剪下常被剪掉，保它进定稿是下轮关键。（r8a 轮已解，见 10~14）

### 3a. r8a 轮新证机制（2026-10-19，S4 定稿攻坚）

10. **定稿修剪梯是"对角梯"有盲区**：finalizeSegment 的 depthTries 只试 `[mi.fb+k, mi.wg+k]` 同步加保留——存活组合常需**非对称保留**（r1 实证：try[27,25]/[28,26] 系蒸发、非对角组合如 [27,24] 从未被试）。本轮未改工具（recipe 宏路径绕过）；后续段若复现此形态，改法=双侧保留深度独立扫描。
11. **finalize 家族去重键塌缩**：pool 去重键=`progNames(sf.slice(0,3))|sw…`——链式种子下所有候选前 3 原语相同（S0a 头），定稿池**恒塌缩为 1 家族**，beam 里的回拉/校位变体（同分并列、插入序靠后）永远进不了定稿梯（r1 全程 fin 只见单家族佐证）。改法=键改全程序签名。
12. **append-only beam 的结构性死路**：程序只能在尾部追加原语——met 后无法在 jd40 与 jd25 之间插校位件；凡"中间落点需归一化"的阶梯，必须 **recipe 宏 d1 整组注入**（S0b~S4 四段同款模式实证）或把段切片。
13. **板面停驻锚=walkTo 而非 goTo**：goTo(970,10) 在 slick 板刹车振荡不排干（r1 fin not-drained idx=28/29 实证），walkTo(d,x,999) 过线反刹 |vx|≤20 必收敛（S3 wg 板 68/68、S4 板 86/86 双实证）。板面锚件一律 walkTo。
14. **跌穿型 vs 停偏型 ±1f fatal**：阶梯放大产生两类——停偏（落板面但压不到钮，如 fb[1025,317]，落点后回拉可救）、跌穿（掉下台层级，如 fb[777,477] 落回 512 廊，回拉不可救）。后者必须在**起跳前**归一化（jd 前 walkTo 校位）——S4 宏的 walkTo(-1,1000) 即此用途。
15. **S4 定稿真相（trim[25,25] 释义）**：jd40 从 P0 顶（body 349）跳弧直接落 352 板 x~985-1000（**不经 384 台阶、jd25 不再执行**），落点即压 b0 足迹 [928,992] 东缘；walkTo(-1,1000,999) 过线反刹停驻即锚（walking 落点 ±1f→±10px 全在足迹内）。jd25/walkTo(-1,970) 为扰动保险件，被泊位剪裁掉仍 86/86 过门（full15a final fb 尾=jo455+jo475+ride+jd40+walkTo(-1,1000)）。
16. **r8a 轮断点**：`tools/full15a.search.json`（S3+S4 定稿链，fb25/wg25 原语、前缀 1370f）。续搜命令：
    ```
    node --import tsx scripts/e2e/routetool/autosearch.mjs \
      --resume note/research/2026-10-autoplay/tools/full15a.search.json \
      --segs 6-8 --forcestart 6 --out TEMP/autoplay8/<新>.route.json --report TEMP/autoplay8/<新>.search.json
    ```

## 4. 工具与产物路径

- 搜索器：`scripts/e2e/routetool/autosearch.mjs`（本轮新增：`--forcestart`、walkTo 原语、seam 失败原因打点、finalize 逐档打点、扰动失败组 ev/why 详情）
- ±1f 整关扫描器（验收门工具，ScanPool 口径）：`note/research/2026-10-autoplay/tools/scan1f.mjs`
  `node --import tsx note/research/2026-10-autoplay/tools/scan1f.mjs <routes.json> [--d 1] [--jobs 9]`
- S3/S4 段件取证台：`note/research/2026-10-autoplay/tools/dbg29.mjs`（TGT=s3|s4、RPT=<报告>、trace/seam 模式）
- 链谱系断点：`note/research/2026-10-autoplay/tools/full7b.search.json`（S0a-S2 定稿，S3 final 已清）、`full14b.search.json`（+S3 wall-anchor 终稿）
- 检查点定义：`note/research/2026-10-autoplay/tools/checkpoints-forest_01.json`（本轮放宽 S4.target/S5.entry fb px → [940,1030]）
- 人工路线（对照基准，未动）：`scripts/e2e/inputs/routes/forest_01.json`（WIN@f2365，fb56/wg55 事件，totalFrames 2500，全局 ±1f 222/222 稳）
- 前槽整关导出（脆弱，待替换）：`scripts/e2e/inputs/routes/forest_01.autosearch.json`（WIN@f1977，±1f 365/614 fatal）

## 5. 残留风险

- S4 定稿门未过 → S5-S7 无法在本谱系上继续链式穷举；若下轮仍卡 S4，fallback = 从绿路线提取 S3 尾+S4 跨度事件样式做成 raw 事件原语（保 222/222 鲁棒性血缘），代价是"全自动"降级"绿迹引导半自动"。
- S5 推箱段、S6、S7 的旧配方从未在新 wrapper（锁存语义/seam v4）下验证。
- TEMP/autobuild 已清理（见 git 记录）；dbg 系列探针仅保留 dbg29（其余删除）。

### 3b. r8b 轮新证机制（2026-10-19，S5 攻坚；r8a 部分结论被推翻，如实存档）

17. **r8a 的"P0 行程 400↔440"与"登乘只能在沉位"被绿路线回放推翻**：P0 真实行程 platY 400(起)↔496(沉)（沉顶=480，与 02 号档 §3.2 "UP 顶 384/DOWN 顶 480" 一致）。r8a 测得的 441 是**假沉位**：wg 泊位身体探入 1088 立面柱（[1075,1087]，S4 尾 walkTo 刹滑+23~31px 所致），P0 下降角压到其头（head≈451 vs 板底 y+16）时**电机被顶停**在 441——泊位西撤 ≤1077 后降程走满 496（v8 实证 422→496 全程 ~70f）。
18. **沉顶 480 即 32px 台阶，登乘=小跳直上**：wg 从 ~1057 净位 jd(1,0,14) 起跳（过脸时 body≈442-470 < 480 顶），板上 128px 跨内落地（v10 onboard@1636；漂移 >14f 会越东缘坠板后地面，v8 教训）。绿路线同手法（f1510-1540 wg 1070→1115 v210 台阶步上）。
19. **跳跃冲量随足底法线倾斜衰减**（内核 character.ts:225：`v.y = n.y>0.65 ? 15.5 : sqrt(sqrt(n.y))*15.5`）：贴立面/台阶棱站立时足底接触含斜法线 → 起跳仅 ~8px/f（v9/v12 实测 -479px/s），满跳 15.5px/f。链式 jd 落地即跳同理衰减（v12 jd22 仅 -341px/s）。
20. **b0 按钮本体悬空截断满跳**：pushers[0] body 中心 (992,352)、梯形底过 origin 上沿 19.2px → 占 [960,1024]×[333,352]，恰在廊道满跳弧顶头部高度——v6 wg 于 978 处起跳被截成 43px 半跳。板上→288 台的跳发点须避开该柱（fb 走 walkTo(-1,905) 过钮顶再 jd22 的弧线即绿路线同款）。
21. **落地弹跳会卡死 walkTo 状态机**（v10-13 "931 冻结"根因之一）：jd 大冲量落地后立接 walkTo，弹跳抖动使其 3 帧输入驻留窗口震荡，角色 v0 冻结数百帧；cure=落地后 sleep(20) 沉降再行走（v15 实证走通 1040→804）。
22. **S5 配方真相（r8b）**：fb 原地压 b0 200f 保 P0 降程走满（wg 台阶登乘）→ walkTo(-1,905) 离钮 → jd22 直接上 288 台 → 锚 700（**无需二次乘 P0**，绿路线 fb f1590-1630 同款）；wg goTo(1052) 西撤出钉死带 → sleep120 等沉稳 496 → jd(1,0,14) 台阶小跳 → walkTo(1160) 走深防滑坠 → sleep180 无输入乘升（绿路线 wg v=0 乘升实证）→ jd40 跳西落板 → sleep20 沉降 → walkTo(820) 锚窗。v15 离线终态 **fb[691,253]G wg[804,253]G 双双命中 S5 窗**（board.mjs 逐帧取证，TEMP/autoplay8/v15.log）。
23. **SEG.S5.horizonF 600→800**：配方全程 entry+~690f（600 会先冻结）；纯搜索参数，断言窗未动。取证台 board.mjs（TEMP/autoplay8，drive+expandFlat 唯一事实源 + APEX/MAP 扫描模式）本轮新增，收尾随 TEMP 清理。
24. **r8b 轮断点**：iteration 5（autosearch --segs 6-8 --forcestart 6，resume full15a）断点落 `TEMP/autoplay8/r5.search.json`，配方已固化进 autosearch.mjs S5 块。
25. **S5 exFatal 刀锋（r5a-e 五轮同源，止损未解）：wg[47] left-down@1375 的 -1f 平移级联**——autosearch 口径 S5 d1 met=true（entry+690f，fb[691,253]/wg[804,253] 双窗、双侧存活）但 wp3/3 rob 0/6，±1f 穷举恒剩恰 1 fatal：S4→S5 缝上 wg 首个 S5 输入 -1f 后全程级联，终态 wg[709,477]（坠坡西端断崖，见 26）。ev47 事件平移探针（TEMP/autoplay8，随 TEMP 清理）复现机理分两型：goTo(1052,8) 修正版在 ~1005 slick 面振荡不收敛、卡队列不排干（西走永不启动）；walkTo 系变体登乘落点缘差。**v20-v24 五种变体（walkTo 1050/1070 泊位、waitPlat(0,494,498) 状态门控、jd14→20 漂移加长、goTo(790,25) 闭环锚）base 全过双窗，唯 idx47 -1f 全败、+1f 全过**——刀锋在乘升 ride 振荡相位与缝差的耦合（-1f 使 ride 激活相位平移 1f，振荡净漂移差 ~10-20px，落坡点偏西即触发 26 的断崖），锚点层不可解。预算（≤4h）已超，按止损条款收容。
26. **板面→台面结构真相（r8b 终）**：板面 317→台面 253 之间为**连续西升斜坡**（v15/v18/v24 轨迹实证 wg 1040→804 行进中连续爬升无洞；doc 泥池 [800,992] 在此行走层不存在）；靠行进动量爬坡，中途 walkTo 停步则静止重启抓不住地、滑回坡底死循环（r5b/c exFatal 根因，fb v18 单程 walkTo(-1,700) 解）；斜坡**西端 ~710-715 即断崖**落回底层 477（-1f 扰动终态 [709,477] + walkTo(820) done 后锁存 left 滑行 10-15px 终态 804 的代数反推；精确 x 存疑待核）。S5 wg 窗 [750,900] 西界距断崖仅 ~35px——v24 终锚改 **goTo(790,25) 闭环驻留**（done 即零输入不漂移），base 稳定 [809,253]。
27. **r8b 收容断点**：iteration-5 断点已收容至 `tools/r5.search.json`；S5 最优种子（v24）已固化 autosearch.mjs（fb `[sleep 200, walkTo -1 700 999]` / wg `[walkTo -1 1070 999, waitPlat 0 494 498, jd 1 0 20, walkTo 1 1160 999, ride 0 396 412, jd -1 0 40, sleep 20, goTo 790 25]`）。续攻命令：
    ```
    node --import tsx scripts/e2e/routetool/autosearch.mjs \
      --resume note/research/2026-10-autoplay/tools/full15a.search.json \
      --segs 6-8 --forcestart 6 --out TEMP/<新>/r.route.json --report TEMP/<新>/r.search.json
    ```
    下一步候选（按证据强度排序）：① ride 改开环组合——waitPlat(0,455,465) 乘升中段门控 + 定时 jd40，绕开振荡相位耦合（需先证短程无输入段在降程满 496 后不触发 r5a 型打滑）；② wg[47] 前插对冲脉冲（left-down 1f + right-down 1f），把缝上 ±1f 敏感点推入自恢复区（S0b 吸收头同思路）；③ B 方案绿迹提取 S5 跨度（explore-trace.json 已有采样，**需授权**，全自动降半自动）。

28. **r8c 续攻槽记录（2026-10-19，死于宿主二次重启）**：派单任务=线索①ride 改 `waitPlat(0,455,465)` 相位门控+定时 jd40 开环、②wg[47] 前插对冲脉冲、副任务断崖 x MAP 扫描+ride 相位定量表；预算 ≤8 轮/2.5h；B 方案仍禁。**槽体于开工 ~20 分钟后随宿主重启阵亡**：未及首轮 commit（git 面 68b1b06 后无新增），唯一遗物=取证台 `tools/probe8c.mjs`（gate/trace/cliff/phase 四模式，头注自带 recipe 格式说明；**未验跑，复活时先 `node probe8c.mjs cliff` 与 `phase` 各跑一遍自证**），已由主会话收容至 tools/。S5 攻坚断点仍=tools/r5.search.json（68b1b06 版），线索①②原封未试，续攻派单可直接引用本条。
