# 04号档 · fairies-01 仙女拖拽原语接入与路线搜索（fw-fairydrag 槽，2026-10-31）

槽位：fw-fairydrag。仓库根 slbhr，分支 release/1.0-forest。文件域：scripts/e2e/routetool/**、
scripts/e2e/route-node.mjs、checkpoints-fairies-01.json、routes/fairies-01*.json、本档、TEMP/fw-fd-*。
禁碰 packages/**、data/**（只读源读除外）。铁律：禁编造、结论附可复现来源、route JSON 不造假。

---

## §0 交付总览

| 项 | 状态 | 证据 |
|---|---|---|
| botcore S2.fdrag/frelease 原语 + drive fy 轨 + toRouteDoc fy 字段 | 已提交 75f16c7 | botcore.mjs |
| kernel.mjs fyByFrame/applyFy 内核回放通道 | 已提交 75f16c7 | kernel.mjs |
| route-node.mjs 真服 "fairydrag" 派发（id=fy{n}） | 已提交 75f16c7 | route-node.mjs timeline |
| autosearch 词表 SEG 追加 SEGF + fairyPx/Py 断言与 shaping | 已提交 0e76566 / b8eb8d0 | autosearch.mjs:898-1104 |
| checkpoints-fairies-01.json v2 七段链（F0-F6） | 已提交 b8eb8d0 | note/research/2026-10-autoplay/tools/ |
| 回归铁律：fixture-runner + vitest 478/478 | 见 §4 | 本档 §4.1/§4.2 |
| 30min 正式搜索（--segs 0-6 --maxminutes 30 --evalchild） | 见 §5 | TEMP/fw-fd-01/fairies-01.search.json |
| fairies-01 全链通关定稿 | **未达成** | §3 封锁定论（15.5 物理封锁，非工具问题） |

---

## §1 仙女拖拽原语与双通道（内核↔真服同构）

### 1.1 内核 Fairy 关键实测（TEMP/fw-fd-01/probe8min.mjs / probe8a.mjs）
- 仙女 fixture：圆 r=0.3m=9.6px（直径 19.2px）、friction=0、cat=4112、mask=257（bit0 地面+bit8 平台）。
- 零重力、linearDamping 5；MouseJoint maxForce 3.5；拖拽巡航速度实测 **~9.2px/f**
  （probe3：f230→f360 行程 1100px）。
- dragTarget 距玩家 <38.4px（1.2m）被推开（character 同款推开语义，原版直译）。
- 杯 fc0 杯口中心 (32,803.2)；感应球 r=1.3m+0.3m=51.2px。杯体 polygon [817.6,824] 埋于 R25L 实心。
  【存疑待核】level2 的杯 rotation=90 未应用（杯直立）——与原版渲染差异记档，不影响感应几何。

### 1.2 原语签名（botcore.mjs，75f16c7）
```
S2.fdrag(fyIdx, x, y, hold=0, tol=32)   // run 首帧 fairy.setDrag({x,y} 米制换算)；done=到点(tol)或 hold 帧
S2.frelease(fyIdx)                       // fairy.setDrag(null)
```
- run 首帧同时 `w.__fyEvents.push({i,x,y})`——事件表经 toRouteDoc 写 `doc.fy=[{f,i,x,y}]`。
- 语义约定：fdrag 完成后**拖拽态长持**（不自动 release）——F1 段靠此让 p1 持续下沉；
  显式松手用 frelease。
- 57 条既有 route 兼容：fy 轨缺省不写 doc.fy；drive 的 events.fy 缺省空数组。

### 1.3 双通道同构
- 内核回跑：kernel.mjs `runKernel` 帧首 `applyFy(w, fyF.get(f))`（fyByFrame 平坦表）。
- 真服：route-node.mjs timeline 增 `...(doc.fy??[]).map(e=>({t:e.f*MS+OFFSET, fy:e}))`，
  派发 `sendA("fairydrag",{id:"fy"+i,x,y})`——服务器 id=fy{n} 已支持（服务端先前槽位）。
- 【已实证】F1 段搜索期 fdrag 原语经 evaluate 引擎全量重放（仙女 1200→40 贴顶走廊），
  且 --evalchild 子进程批量模式下 seam 通过（§5）；真服端到端留 5.3 槽验收（本槽真服
  验收因全链未通未执行——route JSON 不造假，不出假定稿）。

---

## §2 链与 SEGF 校准（b8eb8d0）

### 2.1 权威网格重验（raw-gid，data/fairytales/levels/fairies-01.json Ground 层）
以 gid 打印 30 行分段（脚本见 §6 复现），关键修订 vs 03号档：
- **r7 cols13-18 = x[416,608] gid7 = 水（全杀，fb 不免疫）**——03号档 §2"越岩浆（fb 免疫）"
  系误记。gid5 岩浆实测在 r29[704,928]、r9[832,864]、r15[736,768]、r14[896,928]。
- **R16L 不存在**：r16 塔区 x480-736 实心是走廊东段上方结构；旧 F4"西跳 R17L→东跳 R16L→西跳
  R13L"三段链的中段目标为幻影，校准链改为 R17L→'/'坡捕捉→R13L（§2.3）。
- **R10 = 塔区西北角块**：r10 行 S[0,128] 顶 320（x0-128），其上 r7-r9 塔区全开放。
- **R7L = r7 S[160,416] 顶 224**；东柱 col23 = r7 S[736,768] 顶 224；col19 = r7 ?[608,640]。
- r8 顶 256 面 x[768,896]（R8）；r9 顶 288 面 x[896,992]（R9E）；r6 顶 192 面 x[1056,1280]（R6R，
  西端 col32 ?[1024,1056] 为 '/' 坡）；fb 门 1072-1136 / wg 门 1168-1232。

### 2.2 机关快照 id 表（w.mechSnapshot() 初始帧，mechsnap.mjs）
- platforms 数组下标：0=p0(1136,880 升位封袋→沉 976)、1=p1(176,752→沉 880)、2=(816,400)、
  3=p3(208,496→沉 624)、4=(336,176)。**checkpoint platY id 用数组下标**（crystal 先例同）。
- pushers：0=b_g2(1200,800) group2（F0 压钮）；1-3=(816,608/256/128) group3；4=(96,128) group7。
- levers：0=l0 group5，**初始角 0.6283rad=36°（onis=+1 上限位）**——翻转需关节角过负
  （ja×onis<0），即杆被向东撞击西摆；fb 站杆带 x[280,311] 内偏东（296-311）起跳顶撞才有效扭矩。

### 2.3 校准后七段链（checkpoints v2 / SEGF 同步）
```
F0 压钮   wg 东线涉岩浆(gid5 只杀 fb)上 R25R 压 b_g2 → p0 沉 976 开东袋（probe3 链）
F1 拖拽   fb 原地 fdrag(0,40,845) 拖仙女贴顶走廊 y845 西飞 1168px 入杯 → p1 沉 880 开 r22-23 slot
F2 帆跃   双角色 627/634 线位起跳西漂越 c18' 檐角落 '\'col18@row25 上 R25L 分泊 240/430（probe6）
F3 坡尖   双角色 116 起跳位（probe7 实证；160 顶死坡面）圆-角捕捉 c5 坡尖(160,704) 上 R21L
F4 机关   fb x288 跳顶撞 l0 → p3 沉 624 → 西跳上 p3 → 西跳落 R17L；wg 泊 250 避杆下
F5 塔腰   R17L→'/'坡(160-192,448→416)圆角捕捉上 R13L→西跳上 R10(320)→东跳上 '/'坡/R7L(224)
F6 越水   R7L 慢漂跳越水[416,608]落 col19(608-640,224)→东跳空腔[640,736]上 col23 柱→走落 R8
          →东助跑 x≈878 跳 R6R(192)→fb 1100/wg 1200 门=WIN
```

### 2.4 SEGF 调参实录（本槽新证，工程复用价值）
- **evaluate vs drive 双引擎泊位差 ~8px**：同一 wg 程序（settle→goTo1040→jd(1,0,30)→goTo1200）
  drive 终态 1192.0 / evaluate 终态 1184.4（复现：TEMP/fw-fd-01/engdiff.mjs vs trimprobe.mjs）。
  窄窗原语（tol≤16）会单侧永不 done。**原语窗口设计须 ≥±20px 裕量**。
- **末件锁存语义**：队列排干后锁存末输入（S7 教训的 fairies 复现）——goTo(right) 成末件时
  角色continues冲出目标区（trimprobe：wg 1192→1232 冲出按钮区 pusher 释放 p0 回升）。
  **段程序尾部必须以 sleep(n) 锚定**。
- **GRACE 截断 vs 机械沉降**：evaluate 双队列空后 GRACE_F(~20f) 冻结；升降台沉 96-128px 需
  150-200f——**凡 target 含 platY 断言的段，recipe 尾 sleep ≥ 沉降帧数**（F0 180/F1 240/F4 240）。
- **vendor Box2D 跨世界累积态**：autosearch.mjs:1200 注释明言 ~20 世界后边缘行为翻转
  （±1px 级）——**seam/fin 阶段必须 --evalchild**（本槽实证：同程序进程内 seam 三连败
  not-drained、evalchild 一次过 seamEntry@0）。evalchild 代价：吞吐 ~2.3 evals/s（beam12）。
- **压钮感应区间实测 [1185,1215]**（wg 站 1184.4-1211 均 pusherState=1）；按钮心 1200。

---

## §3 15.5 封锁定论（l0 任何物体够不着——probe7/8a 实证 + 窗口数学）

### 3.1 玩家撞杆：16-23px 硬差
- 杆 fixture（mechanisms.ts:135-137）：半尺寸 0.15×0.7m、body 系偏移 (0,+0.55m)→世界 y[440,484.8]、
  x[280,311]（probe8a 实测动态体中心 [290.4,416.7] 角 30.7°、静置 ang≈0.5°——**杆底最低 ~485**，
  摆动 ±36° 只会抬高杆体，不存在更低的可达相）。
- R21L(672) 起跳：内核 jumpVelocity 15.5（params.ts）静跳净升实测 96-103px（probe4 minFeet
  815=928-113 为满充助跑值）→站跳头顶(脚-64)至 505-512——**距杆底 485 差 16-23px，0 接触**
  （probe7 tapL0 类全部配方实测）。
- jumpVelocity 16.5（原版值）：净升 138px→头顶 470-477 入杆带 ✓——03号档 §3 预警成真。
  **修 params 归主会话（本槽禁碰 packages/**）**。

### 3.2 仙女替撞：p1 时窗封死（本槽新证，判定性）
- **p1 上升速率 1.49px/f**（probe8a 实测 880@f414 释放→751.7@f500，~86f 满位 752），
  为下沉速率（0.64px/f）的 2.3 倍——此前按下沉外推的"~143f 窗口"模型作废。
- p1 满位后 r22-23 层 slot（x160-192）封死：p1 体 [704,800] 恰填满 r22-23 两行。
- 仙女出杯后最早回 slot 时刻：杯(40,845)→东袋(250,905)→col19 升口(620,885)→折返 slot
  ≈ t0+113f（逐段航点实测 30+35+48f）——**113f > 86f 窗口，数学封死**。
- 仙女自东袋升 col19 至 (620,717) 后：西向被 r22 'c'+r23 '#' 墙（x608-736, y704-768）阻断，
  东向即水池；口袋（杯区 x32-160,y832-928）被 r25 S[0,576] 封顶与下竖井永不相通（raw-gid）。
- **结论：15.5 下 fairies-01 全链不可通，封锁定格。** 本槽按任务书纪律不造假 route JSON；
  SEGF/checkpoints 按 16.5 语义预置，params 修正后可直接复产（§2.3 链即 03号档 §2 六段链
  的校准落地版）。

### 3.3 F5 越水物理账（16.5 世界的 F6 段预置依据）
- R7L(224) 满速平跳滞空 ~66f×4.53px/f≈299px→落点 ~715——差 21px 不及东柱 col23(736,224)。
- 站定跳空中加速漂 ~230-260px→落点 646-676——**col19 '?'[608,640] 落窗存在但窄**
  （jumpOnto aboveY∈[180,188] 相位窗）——F6 vocab 预置 jumpOnto(1,175/180/185/190) 四变体交
  beam 搜索。此账基于静跳 96-103px 升（15.5/16.5 同式，16.5 更裕）。

---

## §4 回归铁律

### 4.1 fixture-runner：4 FAIL 为上游既有（非本槽引入）
- 现 HEAD 与改动前基线 00f71a2（worktree 复跑）结果逐位一致：
  2 PASS / 4 FAIL（forest_01/main、forest_04/main、forest_12/main、forest_26/main），
  且 oracle-gold maxDev 逐位相同（forest_01 24.53570835916412、forest_26 142.6879291498367）。
- FAIL 形态：f0 处 9 键 `期望"<缺>" 实际[]`——expected.json（f241b63 v1 基线录制）mech 仅
  8 旧键（hangings/levers/platforms/props/pulleys/pushers/romans/winds），现快照序列化多出
  beamers/boxMirrors/infiniteMirrors/lightPushers/liquidsFrozen/portals/rotMirrors/sliders(+1)
  ——后续槽位扩展机关类型的快照键，fixture 未再生成。**物理零漂移（main maxDev=0）**。
- 【不下终判，移交】fixture 重新生成或比较器"<缺> vs 空数组"等价化，归主会话/基线槽裁决。

### 4.2 vitest 全量 478/478 PASS（57.8s，64 文件）——本槽改动零回归。

---

## §5 30min 正式搜索记录

- 命令：`node --import tsx scripts/e2e/routetool/autosearch.mjs --level fairies-01
  --chain note/research/2026-10-autoplay/tools/checkpoints-fairies-01.json --beam 12
  --budget 2000 --segs 0-6 --samples 4 --maxminutes 30 --evalchild
  --out scripts/e2e/inputs/routes/fairies-01.autosearch.json
  --report TEMP/fw-fd-01/fairies-01.search.json`
- 结果：**【待补：跑毕后填各段解/evals/wall 与最终停段】**

---

## §6 复现索引

- 网格重验：python3 读 data/fairytales/levels/fairies-01.json layers[0].data 按 gid 分段打印
  （1=实心/5=岩浆/6=酸/7=水/0=空，其余 '?'=斜坡/crush/碎块 tile）。
- 机关快照：TEMP/fw-fd-01/mechsnap.mjs（w.mechSnapshot() 初始帧）。
- F0 配方单证：TEMP/fw-fd-01/f0probe.mjs（drive 单次调用 500f：wg 1189.6/pusher0=1/p0=976）。
- 双引擎差：TEMP/fw-fd-01/engdiff.mjs（evaluate 复刻，wg 1184.4）vs trimprobe.mjs
  （drive 末件锁存冲出，wg 1232.4）。
- 封锁几何：TEMP/fw-fd-01/probe7.mjs（tapL0 0 接触）、probe8a.mjs（杆体实测+p1 升速 1.49px/f）。
- 冒烟链：--segs 0-1 --evalchild → F0 定稿+seam→F1 entry@f0（本档 §5 同款命令缩减版）。

## §7 移交主会话

1. **params.ts jumpVelocity 15.5→16.5**（§3.1）——修后本槽 §2.3 链+SEGF 可直接复产，
   预期 F4 撞杆即通（vocab 已备 280/288/296 三起跳位×tapL0）。
2. fixture-runner 4 FAIL 上游模式过期（§4.1）——重新生成 fixture 或比较器等价化。
3. 双引擎 8px 泊位差与 vendor 累积态（§2.4）——建议 route 产线规范：原语窗口 ≥±20px、
   段尾 sleep 锚定、seam/fin 忍痛必用 --evalchild。
4. 真服端到端（route-node fairydrag 派发）待全链通后由 5.3 槽验收；通道代码已就位（§1.3）。
