# 07 号档 · eforest_1 路线立足点（fw-foothold-ef 槽）

日期：2026-11-11
结论：**STOP——上半区（512+ 层）从双人可达域完全孤立，plateau 双门不可达，WIN 永不可满足。产出 checkpoint 链（CP0–CP7，真机逐段验证）+ 机械 BFS 固定点证明，未产出 route JSON（不允许造假路线）。**

关卡：`data/elements/forest/levels/eforest_1.json`（elements 第五部首关；kernel LEVELS_DIRS 未含 elements 目录，本槽以 `TEMP/fw-foothold-ef/elements-shim.mjs` 进程内 load 钩子插入七目录解决，磁盘零改动）。

---

## 1. 物理实测定案（probe20/20b/22 系）

- 跳跃升量**恒 70.5px**（apex@t10、落地 t32，长按/短按/助跑均无差异；probe20b 六种 hold、probe22c/d 助跑矩阵）。东侧助跑跳 apex 掉到 61.8/42.9 是**撞 r25-west 底面 832**，不是可变跳高。
- **助跑速度在跳跃中保留**：带速起跳 t0 即 4.9px/f，32f 位移 115px；静止跳 0.35/f² 加速 cap 4.9（probe22b 逐帧）。
- **陷阱**：spawn 下落未落地时（第 0 帧）给移动输入会触发物理病态、角色永久卡死在原地（probe24b/A-B 对比实验复现）。所有 probe/路线起手必须 ≥5f NONE。
- 引擎箱子：Objects 层 gid20 = Objects.json tiles local4 = `box`（level2.ts case "box"，rot=0 中心=(x+32,y−32)），八边形 1.77m=56.64px、density 0.45、四角滚轮 r=0.1。eforest_1 两只：id1 初始落桌顶（中心 640,802）、id14 落 p5 桥（中心 640,268，row9 层不可达）。

## 2. 可达域定案（机械 BFS probe21 + 真机 probe25 系）

迭代闭包 BFS（段集=静态网格表面+机关平台各档位+地板箱顶假设位；跳跃模型含静止/带速两种；落点窗 [sy−0.5,sy+6]）：**固定点 138/272 段**。

- Round0（全 rest）：b0/b1/b2/b3 可触发 → Round1 加 p0-press/p1-press/p2-up 后**再无新触发**（b4/b5/b6 永不可及），固定点。
- 可达集 = 地板全线 + 桌顶 + 箱顶（任意地板位） + r25-west/east(800) + r24-west/east(768) + V 谷(704) + r21-west(672) + r20-west(640) + **东岸链 r21-east(672)/r20-east(640)** + r18-west/east(576) 死台×2。
- 东岸链（dbg12 BFS 回溯）：箱顶 → r25-east(800) → r24-east(768) → '\\'col34-r21 斜面(672..704) → r20-east(640)。西岸链：箱顶 → r25-west → r24-west → V 谷 → r21-west → r20-west。东西岸被 goo 池 [512,768]（液面 704、双方致死）隔断，池宽 256px 不可飞跃。

### 真机已逐段打通（probe25/25c，gold 路线片段）

1. wg 东行站 b1(1176) 按住 → p0 沉（g0 组）；fb 走沉柱顶 936 穿西井 [384,416]（370→735.8 实测）。
2. fb 停 505–510 跳 UR **贴 '/'col17 西楔面滑升**落楔尖 (572,833)（probe13c/17 同法）→ 走东上桌顶 [576,704]×832（(624,831.9) 实测）。
3. fb 桌顶东推 id1 箱掉桌东缘 → 沿 '\\'col22 斜面滑落地板 (836.9,898)（box 651.7→836.9 实测）。
4. 箱顶垫脚：fb 跳 RU 站箱顶 (837,871.4) → 跳 UR 落 r25-east (882,800.9)（BFS canLand ✓，apex 800.9 ∈ 落窗）。
5. 注意：桌子与西楔均为**悬空结构**（底 864），fb 可从桌下走过（通道 64px>身高 57）；上桌唯一法=贴壁滑升。

## 3. 终局死点（诚实记录）

- **512 层（slab[512,768]×512、r16-west[224,256]、r16-east[1024,1056]）距 r20 层（640）rise 128 > 70.5**，无任何斜坡/台阶桥接。
- **p2 电梯（b2/b3 触发，行程顶 544→416）只服务 slab 层**：中途登台要求起点在 slab（512），r20 层距 p2-rest 顶 544 rise 128 ✗；p2-up(416) 与 r13(416) 同高互跳亦要求先在 slab。
- **递归无基例**：512 层唯一入口 = 从 416 层（r13 '\\'col15 / 'd'col32）下行；416 层唯一入口 = slab 登 p2 → 无基例。
- 熔岩 [256,512]×512 与水 [768,1024]×512 的「池底实体」位于 526.4，其两岸（r16-west/slab/r16-east）同高 512——**进池必须先在 512 层**，不提供上行。
- 箱子常驻伺服不可达 512 层：id1 只能落地板层（压 b0/b1 仅解两井门禁，井门禁 probe16/17 已人工可解）；id14 困于 row9 层不可达；row9 gap 掉落（箱→slab 唯一路）要求先上 row9（需 b4 滑出 p3/p4 → 需先在 slab）——同循环。
- plateau [320,960]×160 的双门（fb[544,608] / wg[672,736]，WIN=doors 双 isUp）在孤立上半区。r18-west/east (576) 为死台（上行 192px）。

## 4. 复用价值

- `TEMP/fw-foothold-ef/probe21-mechbfs.mjs`（机械闭包 BFS 框架：平台档位建模+触发迭代+固定点）可平移到 elements 其余关卡的可行性判定。
- 贴壁滑升（76.2px > 70.5）、箱子常驻按压、悬空桌/楔语义、第 0 帧输入陷阱——(elements 部通用)。
- 若未来 kernel 出现上行原语（如更高的 boxheavy 叠箱、fairy 抛掷等），CP0–CP7 即为已验证前缀链。

## 5. 产物与纪律

- checkpoints：`note/research/2026-10-autoplay/tools/checkpoints-eforest_1.json`（FOOTHOLD-REACHED / WIN-BLOCKED）。
- 工具件（TEMP/fw-foothold-ef/）：probe20/20b（跳高）、probe22b/c/d（带速跳）、probe21-mechbfs（闭包 BFS）、dbg7–dbg12（边反查/回溯）、probe24/25（推箱链）、probe23（box 快照）、elements-shim/hook（沿用）。
- 未动 packages/**、scripts/e2e/routetool/**、data/**；未产出 route JSON（WIN 不可达，不造假）。
