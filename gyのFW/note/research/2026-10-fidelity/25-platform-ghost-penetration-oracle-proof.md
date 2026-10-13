# 25 号档：平台幽灵穿透语义 oracle 实证（原版同构，结案）

**日期**：2026-10-14 01:4x-02:0x ｜ **结论**：**幽灵穿透 = 原版同构（忠实语义），结案**
**方法**：原版（8787 只读伺服，Playwright+系统 Edge headless）加载 forest_25 → 运行时 dump 机关/地面体构造 → 传送 fb 至 b0 按钮上方 0.9m（真实信号链：角色重量压钮 → 组 0 信号 → p0 马达驱动）→ 轮询 p0 sprite 位置至稳定 + 末帧截图。
**工具**：`note/evidence/forest_25/tools/oracle-ghost-penetration.mjs`（即 TEMP/main-oracle/dump25.mjs 入库）；原始输出 `oracle-ghost-penetration.out.json`；末帧截图 `f25-p0-final.png`。

## 1. 判别实验设计（二元）

forest_25 p0 竖闸（28×96 体，f0 填满东下走廊 y800-896）正上方是 r24 实心板带（x992-1248 y768-800），闸顶 y800 与板带底 y800 **零间隙相贴**：

- 若平台与地面碰撞 → p0 起步即顶死，中心 y 恒 848；
- 若穿透（运动学/零质量语义）→ p0 升 96px 至中心 y752，板体 y704-800 与板带 y768-800 **实体重叠**。

## 2. 实测时间线（原版，真实信号链）

| t(ms) | p0 sprite y(px) | 备注 |
|---|---|---|
| 3503 | 832.3 | fb 已落钮（btnY −4→−4.6054 压下 ≈19.4px，蓝图 §3 行程 22.7px 钳制吻合） |
| 3768 | 816.3 | |
| 4024 | 799.3 | **穿越板带底 y800** |
| 4283 | 782.5 | **位于板带内部 y768-800** |
| 4548 | 765.4 | 穿出板带顶 y768 |
| 4811+ | **751.7 稳定** | 升程 96px、≈64px/s=2m/s，与我方马达运行时速度 ±2m/s 一致 |

fb/wg 全程存活（无人落液/压死），排除"死亡重置污染观测"。终态截图存证。

**→ 原版平台穿过实心地形并与之稳定重叠。穿透模型胜出。**

## 3. 构造 dump（转录逐位复核）

| 对象 | btype | mass | fixture: cat / mask / density / friction | 我方转录 |
|---|---|---|---|---|
| MovingPlatform ×2（p0/p1） | dynamic | 1 | 256 / 4369(0x1111) / **0** / 0.7 | `b2.ts` FILTER + mechanisms.ts：cat 256、mask 0x1111、**density 0（平移）**、friction 0.7 ✓ |
| ground（fixtureCount 全体） | static | 0 | 1 / 4369(0x1111) / 0 / 0.8 | FILTER.GROUND_CAT=1、GROUND_MASK=0x1111 ✓ |

- 过滤位按 Box2D 规则**允许**平台×地面接触（0x1111∩256≠0 且 0x1111∩1≠0），但 fixture density=0 → 有效零质量 → 接触不可解析，马达硬推穿透。原版与我方**同一机制**（Phaser 侧 GetMass 报 1 系插件对零密度 dynamic 的外壳默认，fixture 层 density=0 为碰撞事实层）。
- p0 上升速度 64px/s（=motorSpeed 2m/s）与我方 `updateState ±2` 一致；按住时长/缓停行为与 25 号档 §3.1 描述吻合。

## 4. 结案范围与影响

- **17/22/25/29 四档蓝图"平台不撞 Ground"证据**由内核侧观察升级为 oracle 实证背书；19 号档 id26 "0.3px 挤靠"维持"关节限位端点差"重解读（非碰撞）。
- **路线设计可直接利用幽灵穿透**（悬空闸/穿墙板不再要求逐关内核预验证）；生产槽 r29a（29 号 id10 穿 r19 实心块、id14 沉 c4 柱）据此解除"关键路径先内核验证"保留项。
- 我方密度转录（平移 0 / 转臂 0.5）与原版一致，**内核无需改动**。

## 5. 附带发现（未结案，移交后续）

- Wind 机体含**非 sensor fixture**（cat 1 / mask 65535 / density 0.2 / friction 0.4，体位 px(1216,208)）——风柱设备体存在实心部件，是否构成 25/27 风区路线的实体障碍（蓝图均按"风柱可穿过"建模）待 27 号生产槽核（几何 dump 未含 shape 尺寸，本次未测）。
- 原版 `b2Body.SetTransform(vec, angle)` 不可用（该移植收 b2Transform）；`SetPosition(vec)` 可用——后续 oracle 侧传送操作用此 API。
