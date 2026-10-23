# 2026-10-24 换关瞬间下一关人物模型短暂出现在上一关地图内——换关窗口冻结闸记档

## 用户报告
每关结束的时候，下一关的人物模型会短暂出现在上一关地图内。

## 根因：advance 回声先于黑幕换景，旧场景消费了新关状态
时序（活房间 Continue→advance 换关）：
1. 双端点「继续」→ 服务端 `ForestRoom.onMessage("advance")` **立即** `buildWorld()`
   （玩家落新关出生点）+ 翻 `state.levelId` + `restartLevel()`（phase→ready）；
2. 客户端 `reloadLevel` 拉关数据 → `fadeSwitch` 黑幕 **500ms 淡入** → 幕下才
   `stop("Game")+start("Game")` 重建场景；
3. 窗口期（回声到达 → 幕下重建，实测 ~900ms）内旧 Game 场景 update 继续跑：
   phase 差分 won→ready 触发 `resetRound`（重显本体+瞬移标记），
   `updatePlayers` 把**新关出生站位画进旧地图**——即用户所见。

oracle 无此窗口：gameFinish 后 Level.update 停跑，换关是整状态重建，不存在
「旧世界继续消费新关状态」的中间态。

## 复现（FORCE_DOORS 通关 → 结算板出齐 → 双端 __fwNextLevel → 采样）
修复前（探针逐 100ms）：
```
  0ms phase=ready state=forest_02 scene=forest_01 fb=[128,893,0]  ← 回声到，旧场景还在门口
157ms phase=ready state=forest_02 scene=forest_01 fb=[104,896,1]  ← 已瞬移新关站位+本体重显（黑幕未盖满，可见！）
887ms phase=ready state=forest_02 scene=forest_02                 ← 幕下重建完成，恢复正常
```

## 修复
`GameScene.update` 顶部加换关窗口闸（一行）：
```ts
if (String(st.levelId ?? "") !== this.d.level.id) return;
```
旧场景（levelId 与房间状态失配）一律冻结不消费新关状态：不 resetRound、不 updatePlayers、
不动机关/相机——won 爬梯演出与结算板维持原样直到幕下重建。新场景 d.level.id 与状态
天然一致，不受影响。重开（restart 同关 levelId 不变）、断线重连（房间重建后 levelId 一致）
路径均不受牵连。

## 验收
- 修复后采样：窗口期（0~699ms）视图钉在门口 (128,893)/(128,765)、legs visible=0
  （演出藏身保持）；905ms 起 scene=forest_02 新场景正常渲染出生点
- 门禁：tsc 0 错；vitest 19 文件 219 用例全绿；build ✓（3.85s）
- e2e：journey **7/7**（通关→advance 换关全链）、deathretry **4/4**

## 关联
同日上一案（stairs-double.md）：won 演出本体未守藏——两案同属「我方 Game 常驻 vs
oracle 整态切换」结构差的窗口期缺陷，一并构成换关时段的完整守卫。
探针 TEMP/advance-ghost 收尾已清理。
