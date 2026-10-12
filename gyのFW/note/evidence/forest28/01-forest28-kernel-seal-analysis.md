# forest_28 内核封档分析（r28b）

状态：**双引擎一致判定不可解**（正式封档见 `note/research/2026-10-fidelity/21-forest28-unsolvable-seal.md`）。

## 1. 判定链（kernel 侧因果）

```
l3 (112,512) 密袋无入口            ← f28-dive / oracle O2（楔下潜双引擎弹回 segment1）
  ⇒ g0 组信号恒 0
  ⇒ p1 (1056-1088×800-896) 永不上升   ← f28-p1dir/p1dbg（g0=1 时才 848→752；空转 600f 不动）
  ⇒ fb 门腔唯一贴地通道恒被 p1 堵死   ← oracle O1（钉 1042，跳起磕 736 板底回落）
  ⇒ fb 门 (1120,832) 不可达 ⇒ WIN 不可达 ⇒ forest_28 不可解
```

## 2. 内核探针记录（npx tsx，TEMP/r28/*.mjs）

| 探针 | 内容 | 结果 |
|---|---|---|
| f28-dump / f28-ev | 对象全解码 + 600f 空转 | f0 自动翻转→l0/l1=1；l2/l3=0；平台不动 |
| f28-p1.mjs | fb 底板西段探路 | fb 西行入 H1 水槽死（f43 (190,266)）——attic 西段对 fb 无路径意义 |
| f28-wg.mjs | wg 槽床涉水 | 涉水可行（床 270.4）；东端 pedestal 直壁卡死；楔下潜失败 |
| f28-chain.mjs | 双角色全链 | fb H1 斜楔跳失败；wg 卡 348（东壁） |
| f28-dive.mjs | 楔下潜专探 | wg 西行走离床缘→楔面抬回 segment1→终 (47.6,255.7) 存活 → 密袋密封 |
| f28-p1dir/p1dbg | p1 信号响应 | home (1072,848)；g0=1 → f119 升至 (1072,752)（trans −3 到位）；g0=0 回 home |
| f28-defs/defs2 | 对象定义 | props 全空（无 box/ball 可借道 32px 缝） |

## 3. oracle 对照（原版 127.0.0.1:8787 只读，o28-gate.mjs）

| 探针 | 注入 (obj x,y) | 按键脚本 | oracle 终态 | 内核预言 | 一致 |
|---|---|---|---|---|---|
| O1_p1pin | gid16 (968,890) | f70 right→f160 +up→f260 松 | (1042,896) 存活；apex feet 824 | 钉 1042；头 767 磕板底 768 回落 | ✓ |
| O2_wedgedive | gid17 (218,264) | f70 a→f270 松 | (48,256) 存活 | (47.6,255.7) | ✓ |
| O3_wadedoor | gid17 (218,712) | f70 d→f490 松 | f150 起 (400,709) 钉池东壁柱，存活 | 涉水东行、出池受阻 | ✓ |

按键语义实证：原版 addKey 注册 `LEFT/UP/RIGHT` + `A/D/W`；箭头键驱动 pers1（O1 fb 移动实证），wg 用 A/D/W。首次 O2/O3 用箭头键导致 wg 静止、fb 误动，已修正重跑。

轨迹：`o28-O1/O2/O3-trace.json`（f/x/y/dead 逐帧）+ `o28-gate-out.json` 汇总。

## 4. 复核清单

- [x] Chars firstgid=16 核实（gid16 fb / gid17 wg / 门 gid18/19 → door rects）
- [x] p1 dy:+3 方向实测（上升 96px，home=阻挡位）
- [x] l3 密袋五入口证伪（K1-K5，见 21 号档 §3）
- [x] 32px 挤压缝无道具可借（props 全空）
- [x] WIN 语义复核（双门同起即可，钻石可选）
- [x] oracle 双引擎三探一致
- [x] 未修改任何关卡数据（oracle 仅 page.route 拦截重放原 JSON；内核只读解析）
