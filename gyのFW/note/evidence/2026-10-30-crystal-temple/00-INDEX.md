# 水晶神庙（第四部）档卷索引

> 立项：2026-10-30（crystal 取证槽）。快照 = oracle `output/D`（bundle `init.67a8071adb0d6eda.js`）。
> 方法论总纲：[note/next-games-playbook.md](../../next-games-playbook.md)。
> 核心结论一句话：**crystal 唯一的新机制 = portal（D 独有使用，资产/音效全在共享库）；Ground 唯一新 type = -1（portal 背衬墙）；11/12/55/10 均为 C 部已有语义。**

| 档 | 内容 |
|---|---|
| [01号档-取证.md](01号档-取证.md) | §1 Portal 五问全解（配对=portalId、group=电路、双 fixture 触发几何、transport 位置/速度/10·mass 地板公式、200ms 冷却、光束穿门 getPoint/getOutput、fakeWall 假墙与 -1 联动）；§2 Ground type 表与 createGroundShape 全分支；§3 game.json/temple.json 39 节点全表；§4 资产差集（仅 5 组）；§5 探针对拍实录（9 例 lab + 触发链）；§6 内核现状差距；§7 风险与未决项 |
| tools/serve.cjs | oracle D 目录只读静态伺服（127.0.0.1:8789，避开 8787） |
| tools/portal-probe.mjs | portal 实机探针（playwright 无头）：transport 纯函数 9 例对拍 + 自注册 fixture 回调触发链验证 + 关键坐标系教训（oracle box2d 世界 = 屏幕像素/32 的负刻度） |

## 关键数字速查

- portal 实例：正式 34/35 关共 **176**（crystal_20 零 portal）+ 教学关 crystal_03 共 8 = 184 = 92 对（mixed 32 / same0 50 / same1 10）。
- 碰撞位：portal fixtures cat=mask=**4096**；可传载体 = 带 r=0.1 `portal-sensor` 标记的角色/箱/球。
- 速度地板：出口 |v|<10 → `normalize(v) × 10/mass`（角色 10.4734 m/s）。
- 冷却：200ms 墙钟 per-body；传送内嵌一步 `physics.update()`。
- Ground type 使用频次（D）：`-1:198, 0:9579, 1:674, 2:758, 3:683, 4:622, 5:283, 6:230, 7:267, 10:13, 11:12, 12:5, 55:12`。
- temple.json：39 节点（general 25 / puzzle 9 / speed 5），**无 dark**；_id 缺 33/34 为树编辑遗迹。
