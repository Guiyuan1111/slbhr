# 10 号档 · crystal_04 路线收官（fw-route-crystal04 槽）

日期：2026-11-12
结论：**STOP——收容（可达世界闭包证明）。C0 段真机解维持 PASS；C2/C3 目标世界（底厅双门 + 全部 14 水晶）从出生状态机制不可达，四重独立断点互备闭包。未产出 route JSON（不允许造假路线）。参照 09 号档 fairies-02 先例收容。**

关卡：`data/crystal/levels/crystal_04.json`（全程只读；收尾 md5 复核 `c2c1bab02d54818ac07e43a446601e25` 不变）。

研究主档：`note/research/2026-10-autoplay/10-crystal04-containment-unwinnable.md`（本轮全部实测数字、机关权威账、闭包论证）。链定义：`note/research/2026-10-autoplay/tools/checkpoints-crystal_04.json`（C0 solved + C2e/C2/C3 contained）；驱动件 `drive-crystal04.mjs`（复用 autosearch evalchild 协议，零改动 routetool/packages）。

---

## 1. 三轮独立策略收敛

1. **R1（v8/v9）西跳链**：判「酸隙断绝」——本轮推翻为原语伪象（runJump 起跳帧队列交棒 + coast 刹车吞弧，弧长仅 35px；`tools/out/crystal04-containment/arc-coastbrake.txt`）。修复后（jumpDrift holdF≥900 全程持向 + 东扶正 772 站实体沿）**越酸登西高原真机成立**（westcross：fb 610/wg 619 落干台 [576,624]@192，jumpOnto 双体上高原 489/495@128）。
2. **R2（v9）东回路**：出生板西缘下方实为梯台两级拦截（256@[928,960]、224@[896,928]），「板缘坠 640板」地形不存在；板顶→阶台→垫块→柱顶→480板 上游断于 416板 岛不可达。两次真机下落轨迹同证。
3. **R3（本轮）全机制重构**：Tiled Objects 全量权威账（5 传送门、门对 P5/P2、g4 杆+平台、g2 推杆、2 门、14 水晶逐一落位）。

## 2. 闭包四断点（详见研究主档 §4/§5）

- **断点 1**：P5 东段闸 obj68 实体 [444.8,451.2]×[160,256] + 高原薄板 [128,560]×[144,160] = 顶天立地墙；双向传送均弹离东段（fb 永振 231↔441.3，wg 驻 203.1@256）；12f 冷却冲刺 5.4px < 31px 不可行 → 瀑布阶梯→480板→pocket 带→西竖井→底厅整条下游封死。
- **断点 2**：底厅唯一入口 = obj65 西竖井（需 obj66 pocket 带，pocket 唯一来源=480板，闸封）或东竖井 x[1024,1088]（需 416板 岛，岛不可达）→ 两门 [1136,1200]@768/@896 不可达。
- **断点 3**：14 水晶逐个落位全在 {底厅、416板岛、pocket、中板东段、西竖井}——可达世界水晶计数 = 0。
- **断点 4**：出生岛闭合环（西=酸隙可跳但落点无物、东=288板、下=梯台拦截回路）。

## 3. 可达世界不动点（westcross f1199 实测终态）

可达集 = 出生岛 ∪ 西高原（新接入）∪ 中板西段（经 P5 门）。以全部新接入手段跑至输入耗尽：**fb 441.3@256 / wg 203.1@256，可达集增长停滞，目标物 = 0**。

## 4. 门禁与交付

| 项 | 状态 |
|---|---|
| C0 段真机+门 | PASS 维持（v8 链） |
| C2e/C2/C3 | CONTAINED |
| route JSON | 不产出 |
| 关卡 md5 | `c2c1bab02d54818ac07e43a446601e25` 不变 |
| TEMP/fw-rc4-1 | 收尾清理（探测件 westcross/arcprobe/eastfull/fullmap 输出已存档 tools/out/crystal04-containment/） |
