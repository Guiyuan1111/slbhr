# 2026-10-24 滑轮链渲染错误（链画框/斜穿大链）——三段绳口径对齐 oracle 记档

## 用户报告
「这些链路都是错的，渲染」+ 截图（forest_bonus_2 局部）：滑轮锁链拉出横穿全场的
水平/斜向大链，与垂链交织成「锁链画框」。

## 定位
截图双簇布局（一宽一窄滑轮 + 拉杆）命中 **forest_bonus_2**（39×35，两 pulley：
宽 U (176,784)→(176,16)→(1072,16)→(1072,784)、窄 U 560/688）。
双端截图对比（oracle 虚拟钟冻结 vs 我方 started）坐实。

## 根因（我方渲染层三处偏离 oracle Pulley @1737345/update @1702579 区）
1. **中段绳接错**：我方 ropes[1] = 板1↔板2（随快照动态重画）——bonus_2 两板相距
   896px，画成横穿全场的水平链，板一移动即斜穿（用户截图）；oracle ropeCenter =
   **锚1↔锚2 定长顶段**（不随板动，bonus_2 中恰在吊顶砖后不可见）。
2. **绳端位置**：oracle 绳端 = 板体位 − baseHeight(60)（板顶）；我方画到板中心
   （链压板 30px）。
3. 小项：轮 X 偏移反号（oracle 轮1 = 锚1.x+10、轮2 = 锚2.x−10；我方互换）；
   轮转角 = 右绳长/π/10（oracle e.Length()），我方误用三段总长。

注：锚点「polyline 点下方 2m」无误——oracle Device.mpx 带负号（mpx(2)=−64），
内核 mechanisms.ts buildPulley 已按此实现并有档（此前「误放上方」已修）；
本次纯渲染层。 physics 锚点/关节不动。

## 修复（GameScene.ts）
- create：ropes = [轮1→板1顶, 轮1↔轮2 定长, 轮2→板2顶]；轮位按 oracle ±10/−50。
- stepPulleys：只重画两段垂绳（端点板顶 −60）+ 轮转角=右绳长/π/10；中段定长不碰。

## 验收
- forest_bonus_2 双端对比：链画框消失，双垂链+板端 Y 叉与 oracle 一致；
  我方截图中双板差高 = 白石墩落在左板的正确物理不平衡（oracle 冻结在 intro 石墩未落）。
- forest_24 双端对比：轮间顶链 + 左板吊叉 + 右垂链到底板，结构与 oracle 一致。
- 门禁：tsc 0 错；vitest 19 文件 219 用例；build ✓；journey 7/7；deathretry 4/4。

## 环境备注
探针 TEMP/pulley-cmp 收尾已清理（oracle 截图含官方美术，仅本地比对未外发）。
