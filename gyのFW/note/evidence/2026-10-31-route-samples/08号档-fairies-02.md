# 08 号档 · fairies-02 侦察与立足点（fw-foothold-ef 槽）

日期：2026-11-11
结论：**SCOUT-STOP——CP0–CP2 真机打通（越箱镜、驻 b0 触发 beamer 亮），光路深谜未解（CP3+ 为几何推断），未产出 route JSON。** 本槽主目标 eforest_1 已收容（07 号档）；fairies-02 为次目标侦察成果档。

---

## 1. 已实测定案

- **跳力**：apex 103.0px / 落回 t43（probe26；fairies 系 jumpVelocity 16.5，显著高于 elements 的 70.5/32f）——可达域完全不同于 elements，直跳可上 96px 台阶。
- **门语义**（world.ts）：门 64×8 sensor 认角色 → isOpen → frac 21f → isUp；WIN=双门同帧。**门无光路门控**——门台 [960,1280]×160 站人即开门。
- **仙女拖拽原语已备**：botcore `fdrag/frelease`（fw-fairydrag 槽，2026-10-31 补——03 号档的"无拖拽原语"硬边界已被该槽解除）。仙女 (80,1120)，fc0(0,160) g2。
- **平台语义**（mechanisms.ts MovingPlatform）：初始=Tiled 位（state0），按压位移=−(dx,dy)×32。p0(1120,768)g42 沉至 928=地板↔中层电梯；p4(384,128)g2 rest 与门台同层。
- **CP1–CP2 真机链**（probe28b）：fb 西行撞箱镜 bm0(572,1122) → 跳 LU 上箱顶 → 再跳 LU 越至西侧 → 回驻 b0(308) → **push s1@y1170 + beam s1（beamer 亮）**。注意按压需驻留（joint translation>0.2m=6.4px），走过不触发。

## 2. 光路系统（未解，情报成文）

beamer(1280,1088)g4 亮后光束未达任何 lightpusher（lp 全 s0）。布局：三窗 w1[352,544]×768、w2[384,512]×960、w3[736,928]×960；bm0 初始 x572 对 r30 墙段 [512,576]——**光被实墙挡，需推箱镜至窗口正下方才能北折**（CP3 推断）。rotmirror(416,640)g5 由 lever(96,800) 拉动转向；lp1(1248,600)g42 → p0 电梯（CP5 推断）。boxmirror bm1(120,514) 悬于中层西。

## 3. 留给后续槽位的完整路线骨架（推断级，见 checkpoints-fairies-02.json）

CP0 spawn → CP1 越箱镜 → CP2 驻 b0（亮 beamer） → CP3 推 bm0 入 w2 窗位 → CP4 光穿 w1→rotmirror→lever 转向 → CP5 lp1→p0 电梯上中层 → CP6 fdrag 拖仙女入 fc0 → g2 双电梯 → CP7 门台入口 → CP8 双门 WIN。

关键未解：光路全时序（ lever 转向须在光束到达 rotmirror 前后哪个窗口期）、仙女拖拽路径（fairy mask 与地形碰撞，不能穿墙直拖，需绕行窗口/平台）、p4 下沉后门台入口的替代路径（门台西口 '/'col29 (928,192) 悬空，p4 在 x[384,480] 与门台相距 448px——中层东侧 p0(1120,608..768) 与门台底 192 之间的爬链待查）。

## 4. 纪律

未动 packages/**、scripts/e2e/routetool/**、data/**；未产出 route JSON。工具件全在 TEMP/fw-foothold-ef/（probe26/27/28/28b）。
