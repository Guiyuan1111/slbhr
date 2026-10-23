# 2026-10-24 换关时人物在门前出现两次——爬梯演出本体未守藏记档

## 用户报告
每关结束进入下一关的时候，人物在门前会出现两次。

## 根因
通关时 `playStairsSequence`（复刻原版 animateStairs）把角色本体（glow/legs/head）藏掉、
在门口播 `_stairs` 爬梯精灵——但同帧起 `updatePlayers` 每帧执行
`visible = ps.isDead !== true && ps.dying !== true`，**无 won/演出守卫**，
刚藏掉的本体立刻被重显。实玩中角色最后站位就是门口 → 门口两个「人」
（一个站着不动 = 本体，一个爬进上门 = 演出精灵）。

oracle 为什么没有：gameFinish 后 `state.start("endGame")` 整态切换、Level.update 停跑
（终局教学冻结档 2026-10-14 已证），animateStairs 藏 head/legs、bodySprite 本就是空帧，
没有任何重显来源。我方 Game 场景常驻、update 持续跑，「演出藏身」必须自己守住。

## 复现（FORCE_DOORS，won 后每 110ms 采样显示树）
修复前 2.2s 全程：`body(l1h1g1)`（三件 visible=1）+ `stairs(1, fire_stairs0000→0008)` 同播——
双影实锤；截图里门口门框内爬梯角色与残留本体同屏。

## 修复
`GameScene.updatePlayers` 一行：
```ts
const visible = ps.isDead !== true && ps.dying !== true && !this.stairsPlayed;
```
重开/换关恢复路径不受影响：`resetRound` 置 `stairsPlayed=false`（scene.restart 全新场景同），
updatePlayers 下一帧自然重显本体；gameover 路径不置 stairsPlayed，死亡烟雾/dying 藏身逻辑原样。

## 附带修正：journey.mjs 两处陈旧断言（与本案无关，df6a248 改名漏改）
「席位保留」两断言仍期望旧称呼「火人/水女孩」，HUD 实际已是「火娃/水娃」（detail 显示的
就是正确新文案）→ journey 曾误报 5/7。断言更新后 7/7。教训：改角色称呼的提交要连带
扫 `scripts/e2e/**` 的文本断言。

## 验收
- 修复后采样：won 后 1.4s+ 全程 `body(l0h0g0)`、stairs 正常逐帧（0000→0004+），服务器优雅停机
- 截图对比：修复前门口+残留本体两处人影 → 修复后仅门口爬梯演出
- 门禁：tsc 0 错；vitest 19 文件 219 用例全绿；build ✓（3.82s）
- e2e：journey **7/7**（通关→advance 换关→席位/时钟保持）、deathretry **4/4**（gameover 路径未受牵连）

## 环境备注
- 探针 TEMP/stairs-dup 收尾已清理；另清掉 `~/%E6%A1%8C%E9%9D%A2/…` 误建树
  （`new URL(".", import.meta.url).pathname` 未 decode，含本次与本档之前 menuprobe 的同错产物）
- 探针里 `startServer` 返回对象用 `.kill()` 停机（不是 `.close()`）
