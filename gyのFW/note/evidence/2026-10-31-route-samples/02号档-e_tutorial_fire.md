# 02号档 · e_tutorial_fire 通关路线搜索（fw-route-efire 槽）

- 日期：2026-10-26（证据文件时间戳 2026-10-31 前）
- 分支：`release/1.0-forest`（仓库根 slbhr，工作目录 gyのFW）
- 结论：**FAIL——未产出可入库的 `routes/e_tutorial_fire.json`**（红线：不许造假，未伪造）。检查点链 v5.1 与搜索报告已入库，供 5.3 槽接手。
- 本档所有坐标为屏幕 px；py = snapshot 中心 y = 脚 − 35。

## 1. 一句话结论

`e_tutorial_fire` 在本仓库 kernel（字节同源级别复刻 oracle 物理）下，**两名角色的可达集均不含任何一扇门**：fb 门 (1312,448) 位于封闭上部复合体的 row-14 (992-1440,448)，wg 门 (1312,160) 位于 r5 (1280-1440,160)，二者与出生点之间不存在物理通路（证据见 §4）。autosearch 亦只推进到 E0（fb 压板段）段内 met，无法产出后续段。

## 2. 正确出生与关键机关实测（TEMP/fw-route-efire probe13-20）

autosearch 首跑实证出生点（v2 链曾假设反置）：

| 角色 | 出生点 | 脚位 |
|---|---|---|
| fireboy | 崖台 1248-1440 | 832 |
| watergirl | 东南口袋 1216-1440 | 992 |

| 机关 | 实测 |
|---|---|
| p0 (992-1088) | 静 848（顶 832）；载荷下**持续缓沉**，底 944（顶 928）。probe20：fb 压板 f382 时 p0=884 → 终态 944。早期记录的“单重稳态 898-902”系短观测窗误判 |
| b0 板 (720,864) | fb 站 735-756 触发，压板稳定可复现 |
| p1 (416-512) | 静 1008（与西区地面平齐）；升 848/顶 832 仅由 mesa 上的 b1 (240,864) 控制 |
| 立柱 512-544 | r21-r25 全高 SOLID，顶 672；r26 顶收 WEDGED |
| 塔墩 384-416 | r25 SOLID 顶 800 + r24 SLOPE/ 768 |
| r31 底 992 | LAVA 128-352 与 672-1216（杀 wg，fb 免疫涉水底 1006）；SOLID 352-672 / 1216-1440 |

probe 实证成立的物理链（botcore 原生与 autosearch wrap 双管线验证）：

1. fb：崖台西坠口袋 → 涉熔岩 → jd 上 step 楔 → jd 上 bump → 压 b0 板（probe13：holdF 50/50-60/60 八组全成功，终点 (752-757,831,g1)）。
2. wg：等 p0 入窗 → 口袋西缘 1232-1241 满漂移立跳 196px 越熔岩 → 落 p0（probe14：3×4 全 12 参数组成功，落点 1018-1042, feet 929-930；probe18 wrap 管线 15 组成功，p0 底 944）。
3. wg：p0 二跳 jd65 → bump 东坡/顶（probe15：落 (826,831)；probe19 全链并发 v4：落 (842,839) 被 hold 拉回 776 驻留 (755,832,vx0)）。
4. wg：bump 西缘 jd40 → step 楔顶 (626,875) → 西行坠西区地面 (524,992) 驻留（probe15 f472/f554）。
5. **全链并发**（probe19，v4 语义）：`fb 终 (757,831,g1,vx0)、wg 终 (755,832,g1,vx0)`，双 waypoint 全过、零死亡。
6. 不可达（probe16）：bump→mesa 256px 沟 27 组参数全灭（立跳满漂移射程仅 ~196px）；mesa 唯一电梯 p1 由 mesa 上的 b1 控制＝自锁；柱顶 672/塔 768 需从不可立足点起跳。

## 3. autosearch 十二轮记录（强制命令见 §6，`--maxminutes 30` 均未触顶，单轮最长 348s）

| # | 链版本 | 结果 | 根因与修复 |
|---|---|---|---|
| 1 | v2（3+3 段） | E0 未解，evals=3839，69s | 种子链致 wg f670 坠熔岩死亡。实证出生角色与假设相反（fb 崖台/wg 口袋）→ 重写 v3 |
| 2 | v3 | E0 未解，3757 evals，53s | fb 冻在出生点 (1328,797)。S.hold 无 f0 护栏，f=0 压方向触发 kernel NaN 力永久毒化 → 各 fb 链首步插 sleep(3)（probe17 修复实证） |
| 3 | v3.1 | E0 定稿 end@f458 后 seam 失败 | wg 落 p0 后被残余 vx 滑出西缘 992 坠沟（fin：evaporated wg[923,921]）→ 终点断言加 vx∈[-40,40] 驻留判定（v3.2） |
| 4 | v3.2 | E0 定稿 end@f465 后 seam 失败 | trim 裁掉尾部 goTo 驻留（达成帧判定在滑行途中）→ E0 语义改“wg 落 p0 即二跳上 bump、p0 不驻留”（v4，probe19 全链验证通过） |
| 5 | v4 | E0 定稿 end@f545 后 seam 失败 | fb 链尾 hold+sleep 被 trim 裁后锁存 RIGHT 跑出窗（evaporated fb[757,796]）→ 驻留件一律改 goTo（done 自带 \|vx\|<40 刹车） |
| 6 | v4+goTo | E0 定稿 end@f538 后 seam 失败 | ±1f 抖动群组 die@470 wg[1049,971]：fb 压板相位差 → p0 沉位相位差 → wg 弧线撞台。→ 拆段解耦：E0=fb 独自压板、E1=wg 独自越熔岩（开局 p0 已稳）（v5） |
| 7 | v5 | 语法损坏 | python 切片误删 Object.assign/evaluate 头 → 自 git 恢复+精确边界重建 |
| 8 | v5 | E0 定稿 end@f379 后 seam 失败 | E0 的 wg sleep(600) 在定稿重放不排干（not-drained idx 0/1）→ wg 在 E0 无原语需求，改 sleep(1) |
| 9 | v5+sleep1 | E0 定稿 end@f379 后 seam 失败 | trim 裁 fb 尾 sleep 后锁存 RIGHT 跑出窗 → fb 尾改 goTo(744,10) 刹驻 |
| 10 | v5.1 探针 | probe20 揭示 p0 行程 | fb 压板后 p0 持续缓沉 884→944 并非 898-902 稳态 → E0/E1 platY0 窗与 E1 waitPlat 窗改含底态 (884,956)/(900,956) |
| 11 | v5.1 | E0 定稿 end@f382 后 seam 失败（×3 变体：窗宽 640-848 / 690-800 / 720-790） | **搜索进程内 jd 落点系统性短于新进程复现**（642 vs 700，与 probe19/20 同参数）——vendor Box2D 跨 b2World 累积状态翻转（autosearch.mjs:830 注释，ice_02 I3 已知问题）；--evalchild 未根除内环漂移。jd2 落 642（东坡）→ wp0 任意窗宽下 trim 裁 goTo → 斜面锁存下滑/出窗 |
| 12 | v5.1 收敛 vocab | E0 段内 met=true（metAt=382，fb 驻留 730,797，depth1-3 稳定 6153/6151/6150），定稿 trim=[4,1] 裁 goTo 后 seam 失败，3 种子耗尽 → **按红线停止** | 失败环节＝定稿管线（trim 优先浅剪+锁存语义+seam 重放物理一致性），非关卡物理 |

累计：约 28 分钟搜索墙钟、~1.9 万 evals；E0 是唯一推进到的段（3 段/4 段版本下均 0/3、0/4 solved，但 E0 beam 内 met 稳定复现）。

## 4. 结构封死证据链（本关疑似不可通关；终裁归 5.3 槽）

权威网格：`TEMP/fw-route-efire/runs.mjs` 输出（Ground 层逐 tile 权威像素段，脚本与输出均在 TEMP，已随槽位清理；重建命令在 §6）。

1. 两门位置：fb 门 (1312,448) 落 row-14 SOLID 992-1440@448；wg 门 (1312,160) 落 r5 SOLID 1280-1440@160。
2. row-14 全部上行口超跳限（满充能 rise 实测上限 ~123px）：row-20-east(640)→r15 台(480) 需 160；x0 箱顶(576)→row-14 需 128 且 x0 顶净空不足；柱顶(672)→r13 岛(736-864,416) 需 256。
3. mesa(160-416,832) 唯一电梯 p1(416-512) 由 b1(240,864) 控制，b1 仅 mesa 可按＝自锁；西区地面(992)→mesa 高差 160 且沟宽 256px（含 416-512/544-640 死沟，544-640 沟底为熔岩）。
4. wg 西界＝西区地面 352 处熔岩墙；r20 岩浆 736-960/1248-1376 杀 wg；fb 免疫熔岩但其可达集内同样无上行口。
5. 滑轮板 A(741-827)/B(1157-1243) 联动（probe5：x1 压 A→A 沉 411/B 升 172）激活点 x1(648-712,128) 在不可达 row-4-west。

## 5. 移交 5.3 槽

1. 可复用资产：`note/research/2026-10-autoplay/tools/checkpoints-e_tutorial_fire.json`（v5.1 四段，断言窗已按 p0 缓沉修正）；probe19 的全链并发验证脚本语义（可作 route-node 之外的手写链基准）。
2. 若 5.3 认定“门不可达”成立，建议本关按数据缺陷走 oracle 对照（原版 oracle 只读）核对 Tiled 对象/斜坡朝向，而非继续调链。
3. autosearch 工具链修复建议（非本槽文件域，未动）：a) trim 应保留带刹车 done 的驻留件（goTo/walkTo）不休眠裁剪；b) 动态平台的“载荷缓沉”需要在断言建模中给出行程窗；c) Box2D 进程状态翻转的隔离应覆盖 beam 内环评估而不只 seam/穷举。

## 6. 复现

```bash
# 权威网格
node --import tsx TEMP/fw-route-efire/runs.mjs
# 强制搜索（12 轮均用此命令，v5.1 起 + --evalchild）
node --import tsx scripts/e2e/routetool/autosearch.mjs --level e_tutorial_fire \
  --chain note/research/2026-10-autoplay/tools/checkpoints-e_tutorial_fire.json \
  --beam 24 --budget 6000 --segs 0-8 --samples 10 --maxminutes 30 --evalchild \
  --out scripts/e2e/inputs/routes/e_tutorial_fire.autosearch.json \
  --report note/research/2026-10-autoplay/tools/out/e_tutorial_fire.autosearch.search.json
```

搜索报告：`note/research/2026-10-autoplay/tools/out/e_tutorial_fire.autosearch.search.json`（E0 solved=true/metAt=382/fb 驻留 730,797；totals.segsSolved=0）。
