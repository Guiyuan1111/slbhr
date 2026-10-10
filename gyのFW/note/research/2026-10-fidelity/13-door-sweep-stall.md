# 13 · 门扫帧 round 闸门卡摆：真实游玩永不通关的根因取证（0.3.27）

> 现象：双人真实游玩站进各自门内、钻石全收，门动画永远差一帧不全开、从不判定通关。
> 而 e2e 通关模式（`FW_DEBUG_FORCE_DOORS=1`）与内核传送实验历来全绿——「测试全过、实玩必挂」的典型锁步偏差。
> 结论：`world.ts updateDoors` 的推进闸门用 `Math.round(frac) < 21`，frac 恒卡 20.83 帧；
> `isUp` 退化为「signaled 单步脉冲」，双门错峰到齐时两脉冲几乎不可能同帧重叠 → `checkEnd` 永不触发 win。

## 一、取证过程（并发双代理 + 内核探针）

1. **服务端→客户端链路审计**（代理 A，只读）：`ForestRoom` 事件全类型消费（`for (const ev of events)`，win → `phase="won"` + `finish` 广播）、won 后 tick 直返不被覆盖、Colyseus patch 50ms 必达、客户端 `onPhase("won")` → EndMenu 无闸。下游链路整体健全，但顺带查出四处真实缺陷（§四）。
2. **原版 bundle 语义取证**（代理 B，字节偏移字证）：
   - 通关唯一判据 `door1.isUp && door2.isUp`（@1950848–1951110），**无钻石/时长/站位附加前提**；
   - `isUp` 每帧由精灵当前帧重算（`21 === a ? isUp=true : isUp=false`，@1682906），站门期间 signal **每帧** dispatch 驱动 `checkEndGame`——持续有效而非一次性边沿；
   - 门 sensor 64×8px、盒心 `(x+32, y+4)`、begin/end 直设 isOpen（@1682236/@1682441），无站满时长；
   - 教程系统纯显示不 gate 门（@1937443/@1952702）。
   → 复刻内核的几何与判据面与原版一致，问题只能在状态机时序。
3. **内核逐帧探针**（决定性）：克隆 forest_01 为探针关（双出生点挪到门带左侧平地），内核里闭环测出
   「按住右 → 停靠带心附近」的开环键盘时间线（fb 40 帧 / wg 27 帧，**异时到门 ~0.2s**），逐帧打点：

   ```
   t=0.60 isOpen(fb=true wg=true) frac(0.8 | 6.3)     ← 双角色相继入带
   t=1.20 frac(15.8 | 20.8)                            ← wg 先顶到 20.8
   t=1.40 frac(20.8 | 20.8)                            ← fb 也到 20.8，双双冻结
   t=3.80 frac(20.8 | 20.8) phase=playing              ← 永久卡摆，永不 won
   ```

## 二、根因机理

`updateDoors`（0.3.26 及之前）：

```ts
const frame = Math.round(door.frac);
door.isUp = frame === 21 && door.frac >= 21;      // 要求 frac≥21
const advance = 25 * Math.min(0.04, dt);          // 每步 +0.4167 帧
if (door.isOpen) {
  if (frame < 21) {                               // ← 闸门用 round(frac)
    door.frac = Math.min(21, door.frac + advance);
  }
  if (Math.round(door.frac) === 21 && !door.signaled) {
    door.signaled = true; door.isUp = true;       // 单步脉冲
    events.push({ type: "door-open", role });
  }
}
```

- frac 以 25/60=0.4167 帧/步推进，到 **20.8333** 时 `round=21`，闸门 `frame<21` 关死——**永远差 0.1667 帧不到 21**；
- `signaled` 分支把 `isUp` 置真一帧，但下一步行首重算 `frac>=21` 立即打回——`isUp` 实为**单步脉冲**；
- `checkEnd` 要求双 `isUp` 同帧为真。两角色真实游玩必然错峰到门（差 ≥1 步即错开）→ **两脉冲永不相交**；
- 客户端 `doorFrame = Math.round(frac)` 恒 20 → **门动画永远差一帧不全开**（与玩家截图「门没开」吻合）。

**为何历史测试全绿**：传送实验双门同帧入带；`FW_DEBUG_FORCE_DOORS` 每 500ms 同时强制双门 isOpen——都是**锁步**场景，
两门 round 越界落在同一步，脉冲同帧重叠 → win。既有单测「走到 doorUp 即 break」恰好只捕单步脉冲；e2e 从未真实走位入门。

## 三、修复与回归

`packages/shared/src/kernel/world.ts updateDoors`（commit 437d8ac）：

- 推进闸门改用 `door.frac < 21` 本身，frac 可达 21 并钳制；
- `isUp` 改原版口径**每步重算**：`door.isUp = door.frac >= 21`——站门期间持续为真（原版 signal 每帧驱动 checkEndGame 的语义），离开随扫帧回退；
- `signaled` 仅承担 `door-open` 一次性事件（服务端 sfx/日志），不再参与胜负。

回归三层：

1. **内核单测**（kernel2.test.ts）「双门异时到位」：fb 先站带心，wg 80 帧（≈1.33s）后补位——断言先到者 `isUp` 首真后**连续 80 帧不掉**、后到者补齐 → win。已验证对 0.3.26 旧实现**精确变红**（git stash 红绿对照）。
2. **e2e 真实走位通关**（commit 7d622df）：探针关 `zz_probe`（forest_01 克隆，出生点在门带左侧平地）固化为
   `scripts/e2e/fixtures/levels/`，起服前安装、finally 自动移除（不污染 48 关枚举测试与发行数据）；
   键盘时间线 `scripts/e2e/inputs/walkin-doors.json`（fb 667ms / wg 450ms 按右）。真实服务端
   `FW_DEBUG_DOORS=1` 日志：`[doors] fb open=true frac=9.2 | wg open=true frac=14.2` → `[win] 事件触发，切 phase=won`，双浏览器 HUD「通关！」PASS 零错误。
3. **确定性**：48 关 det 对比 r27-rotfix 位级一致（门修复不触碰机关快照数值）。

## 四、顺带修复（链路审计副产物，commit fe148a0）

| 缺陷 | 位置 | 影响 | 修复 |
|---|---|---|---|
| `BodyState.state` 漏注册 defineTypes | server state.ts | 0.3.25 平台灯罩换帧**从未真正下发**（客户端恒初始帧） | 补 `"state": "number"` |
| `setPaused` 先置位后 emit | client input.ts | 暂停瞬间末次按住态留在服务端，角色持续怼墙 | 置位前发「全松」快照 |
| 重连丢弃新 Room 实例 | client net.ts | 自动重连后 `net.room` 仍指死房，全部回调静默失效 | `bindRoom` 重连后换绑重挂，prevPhase 挂实例 |
| onLeave 超时 phase 卡 paused | server ForestRoom.ts | 断线 60s 超时后房间死锁，补位被 `startedOnce` 挡住 | 仍有一人在场 → 回 lobby；补位 join → `restartLevel` 整关重开（原版 retry 语义） |

## 五、门几何存档（防再误判）

- 感应带：`boxFixture(body, B, 1, 0.125)` 半尺寸**米**→ 64×8px，盒心 `(rect.x+32, rect.bottom+4)`，span y∈[底边, 底边+8]；
- 站立接触：角色脚底圆与带顶只有 ~0.2px 理论重叠，靠 Box2D 静止渗透建立 contact——**传送带心必胜**此前掩盖了状态机缺陷，几何无罪；
- 走廊为平地（row6 y192-224 实体 cols12-38），门龛无后墙：角色可走过门位，停靠位置由玩家控制——旧探针「挤后墙挡停」在 fb 门失效即此假象。
