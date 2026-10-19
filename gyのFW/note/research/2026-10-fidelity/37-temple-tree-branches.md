# 37 — 选关树"枝"不可见修复（用户报告 2026-10-19：只有叶、看不到连在一起的枝）

报告原文："关卡选择树目前只有叶，看不到连在一起的枝"。考古结论：**我方实现确有偏差——原版选关树是"全树恒绘打底 + 已通关侧金色叠绘"两层，我们只画了已通关侧且用了近背景色的暗橄榄平色，导致枝几乎不可见**。已修 `packages/client/src/scenes/TempleScene.ts`（纯客户端表现层，零物理接触），门禁全过（见 §5）。

## 1. oracle 考古（bundle 字节偏移，全部可复现）

bundle = `Fireboy-and-Watergirl/output/A/js/init.eb02fbdab2aa1d24.js`（2,218,873 字节，latin1 口径）。模块图（`grep -bo 'define("States/'`）：

| 模块 | 偏移 |
|---|---|
| States/LevelMenu/LevelButton | 1103443 |
| States/LevelMenu/LevelMenuButtons | 1915305 |
| States/LevelMenu/LevelMenuGrid | 1922444 |
| States/LevelMenu/LevelMenuTree | 1923014 |
| States/LevelMenu/LevelMenu | 1928690 |
| Phaser.Filter.BevelFilter | 1779406 |
| Phaser.Filter.ColorMatrix | 1782424 |
| ProgressModel | 2146528 |

**注意**：LevelMenuGrid 与 LevelMenuTree 都是 `LevelMenuButtons` 的**空子类**（`return a(c,b), c`，1922444/1923014）——树/网格两种布局的全部渲染逻辑都在 LevelMenuButtons.addContent；LevelMenu.layoutContent（bundle:1933300 段）按 `"tree" === this.templeData.type` 实例化 LevelMenuTree，否则 LevelMenuGrid。

### 1.1 树纹理绘制器 h(b,c)（LevelMenuButtons.addContent 内，bundle:1916750-1917800 段，逐字摘录）

```js
h = (function (a) {
    return function (b, c) {                                   // b=含全量?  c=底座倍率(缺省1)
        for (null == c && (c = 1),
            e = a.game.add.bitmapData(C, k),
            e.ctx.strokeStyle = a.templeData.color,            // @1916856 线色=temple.color
            e.ctx.lineWidth = 16 * x,                          // @1916896 线宽=16*x（x=0.5/0.6）
            o = A.edges, h = 0, m = o.length; h < m; h++)
            (f = o[h]), (q = i(f.source)), (r = i(f.target)),
            (b || q.state + r.state > 2) && (                  // @1917030 ★绘制条件
                e.ctx.moveTo(q.x * C, q.y * k), e.ctx.lineTo(r.x * C, r.y * k), e.ctx.stroke());
        for (p = A.levels, j = 0, n = p.length; j < n; j++)
            (l = p[j]),
                (b || l.state > 0) && (                        // @1917244 节点底座条件
                    (g = "puzzle" === l.type ? "DiamondPuzzle_Bkg_Mask" : "speed" === l.type ? "DiamondSpeed_Bkg_Mask" : "dark" === l.type ? "DiamondDark_Bkg_Mask" : "Diamond_Bkg_Mask"),
                    (d = a.game.make.sprite(0, 0, "MenuAssets", g + "0000")),
                    d.scale.set(x * c),
                    e.draw(d, l.x * C - d.width / 2, l.y * k - d.height / 2));
        return a.game.make.image(0, 0, e);
    };
})(this),
this.imageAll = h(!0),            // @1917713 全量纹理（47 边全画 + 48 底座全画）
this.imageAllBig = h(!0, 1.2),    // @1917745 全量 1.2 倍（底影层）
this.imageDone = h(!1),           // @1917785 进度纹理（仅 state 和>2 的边 + state>0 的底座）
```

### 1.2 三问直答

**① 绘制条件**：三张纹理全部常驻显示树中。底层 imageAll/imageAllBig（b=true）**47 条边无条件全画**；顶层 imageDone（b=false）只画 `source.state + target.state > 2` 的边、以及 `l.state > 0` 节点的 `_Bkg_Mask` 底座。**旧注释"原版只画已解锁侧"无 oracle 依据，系误记**——原版全树恒绘。

**② 样式**：实线（canvas 2D stroke，无虚线/渐变/动画）；线色源头 `strokeStyle = templeData.color`（=temple.json `color`，我方 data 与 oracle HAR 逐字段一致，`#5B4610`）；线宽 `16 * x`（x=0.5/0.6，与我方 16*scale 同式同值）。但注意渲染管线：三张纹理各自过 **BevelFilter**（`rgb := vec3(0.5±dir·a/6)`，**源色被丢弃变灰度浮雕**，bundle:1779406）再过 **ColorMatrix(1.7×tint)** 对角矩阵（bundle:1782424）——最终观感色 = 0.85×tint。**全树 tint=temple.color；已通关侧 tint=16766496=0xFFD620 金**（`j = new g.Filter.ColorMatrix(this.game, C, k, 16766496)` @1918127，`f(this.imageDone, [m, j])`）。

**③ 层序**：addContent 自下而上 addChild——imageAllBig（1.2 倍浮雕底影）→ imageAll（全树）→ imageDone（金色进度）→ 各节点 Lock/LevelButton（锁定=bundle:1919870 `new g.Sprite(...,"Lock0000")` 无透明度设置）→ 关卡数字（bundle:1920737 `make.text(D, E+3, p.id)`，28px 白字黑边，默认 invisible）→ NewSign 组（bundle:1919950 段，state>0 且 isNew 的节点右上 (x+40,y-20)）。

### 1.3 state 语义（ProgressModel.setStates tree 分支，bundle:2150431/2150566）

```js
"tree" === a.type:  每 level：best==null ? (state = initial?1:0)
                    : best.stars===3→4 / ===2→3 / ===1→2      // state = 星数+1
    每 edge：p.state>1 && q.state===0 → q.state=1（反向同理）  // ≥1 星节点解锁其相邻
```
即 state：0=锁定 / 1=可玩未通（initial 或相邻已通关）/ 2/3/4=1/2/3 星。帧号映射 y(p.state)（bundle:1919440）：state 0/1→"0000"、2→"0001"、3→"0002"、4→"0003"——**帧号=星数**。

**判据等价性**（我方 `done.has(s)||done.has(t)`（done=星数>0）vs 原版 `state 和>2`）：原版传播保证 ≥1 星节点的相邻节点必为 state≥1，故 state 和>2 ⇔ (两端已解锁且至少一端 ≥1 星)；逐真值表：(0,0)/(0,1)/(1,1) 两侧皆不画；(0,2) 星数口径=1星+锁定邻居——被传播排除（1 星节点的邻居必被解锁为 state1，(0,2) 组合不存在）；其余组合两侧一致。**我方判据与原版等价**。

## 2. 对照裁定表

| 项 | oracle | 我方（修前） | 裁定 |
|---|---|---|---|
| 边绘制集合 | 全树恒绘（imageAll）+ 进度侧金叠（imageDone） | 只画 done 侧一条层 | **偏差，修**（枝不可见的直接原因） |
| 线宽 | 16*x（0.5/0.6） | 16*scale 同式 | 一致 |
| 线色 | 灰度浮雕×1.7×tint≈0.85×tint；全树 temple 色、进度侧 0xFFD620 金 | 平色 temple.color（#5B4610，亮度 70.6 vs 背景 76.1，Δ5.6 近乎隐形） | **偏差，修**（平色近似 0.85×tint + 金叠） |
| 节点底座 | _Bkg_Mask 全 48 进底图、进度侧 state>0 金 | 无 | **偏差，修** |
| 钻石帧号 | =星数（1星→0001 紫钻、2星→0002） | 1星→0000、2星→0001 | **偏差，修** |
| Lock 透明度 | 无（alpha=1） | setAlpha(0.9) | **偏差，修** |
| 数字文本位 | (D, E+3) | (x, y) | **偏差，修**（+3） |
| temple.json | HAR `data/forest/temple.json?v=3086bb2` color=#5B4610 type=tree 48 关 47 边 | 逐字段 0 diff（python 结构对比） | 一致 |
| MenuAssets.png | sha256 1f8e1456…d41 | 同（逐字节一致）；帧清单同 60 帧（含 4 种 _Bkg_Mask0000） | 一致 |
| 解锁传播 | setStates 单遍：≥1 星节点解锁相邻 | fixpoint 同语义 | 一致（等价性见 §1.3） |

## 3. 修复内容（TempleScene.ts，单文件）

1. **底层（imageAll 平色近似）**：47 条边全画 + 48 节点 `_Bkg_Mask0000` 底座，色=0.85×temple.color（#5B4610→(77,60,14)=0x4D3C0E）；底座用 setTint，按帧素色实测 (255,203,0)（MenuAssets 帧像素采样）反推 tint 补偿（蓝通道帧色 0，弃）。
2. **上层（imageDone 平色近似）**：done 侧边金叠 #D9B61B（=0.85×0xFFD620）+ 已解锁节点金色底座。
3. 钻石帧号=星数（`String(min(stars,3)).padStart(4,"0")`）；Lock 去 0.9 透明度；数字文本 y+3；注释内错误 bundle 偏移更正（45805→1932358、45853→1935104 等，本轮实测偏移已内联代码注释）。

### 3.1 相邻发现（记录不改，防后来者误判）

- **imageAllBig（1.2 倍底影）与 OutlineFilter(3px)、BevelFilter 浮雕光效未复刻**：Phaser3 无对应内置滤镜，平色近似为其信息含量的超集（底影/描边只影响质感不影响信息）；已在代码注释与本档 §1.2 声明。
- **NewSign 未实现**：原版对"已解锁未玩过非 initial"节点画 NewSign0000；我方 progress.ts 无 played 字段，加注需动进度模型，超出本轮表现层边界。
- **BackButton 细节**：原版 label "Back"（fontStone 28）画在按钮内 (x+40, y−textHeight/2−12)（bundle:1910630 段），且树型位置 y=H−92.25（79×123 帧的 3/4 公式，bundle:1933300 段）；我方按钮 (70,H−80)+下方独立"返回"字。属菜单族公共件，留待 UI 统一校准轮。
- **softLock 弹窗**：原版 state=0 未锁节点点击弹 SoftLockMenu；forest 全关 required=0 → minRequired=0 → 永不触发，无需复刻。
- 首通彩带 firstComplete：置位 ProgressModel.process bundle:2149507、检查 LevelMenu.afterAddContent bundle:1932358（我方语义一致）。

## 4. 视觉实证（TEMP/uitree/shoot-temple.mjs + probe-progress.mjs，像素级）

种 1 星进度（forest_01）→ 真实点击 Menu「开始游戏」→ Temple：截图 `TEMP/uitree/shots/probe.png`，严格坐标换算（k=0.9H、C=min(1.2k,0.9W)、canvas CSS 比例 1.0422）逐点采样：

- edge 1-2（已通关侧）中点垂直扫描：**(217,182,27) = 金色 0xD9B61B 精确命中**（±4px 抗锯齿过渡 (185,153,25)）；
- edge 2-3 / 3-4 / 18-25（未通关）中点：**(77,60,14) = 全树底色 0x4D3C0E 精确命中**；edge 1-2、2-3 全线 41/41 采样非背景；
- forest_01 节点中心 (177,91,255) 紫钻 = Diamond0001（帧号=星数修复生效）；forest_02 灰钻 = Diamond0000；锁定节点 (38,30,0) = Lock0000；底座乘色 (77,60,0) 与推算一致；
- 全程 `pageerrors: []`。

（第一轮"金线缺失"读数系本槽坐标换算手误，经严格脚本复测推翻，留此存照防重蹈。）

## 5. 门禁与提交

- `npm run typecheck` ✓；`npm run build` ✓（dist 4.6s）
- `npx vitest run` 89/89 ✓（level2/box2d/font-subset/kernel2/48-level-behavior 五族，含金轨迹 fixture 面）
- `node scripts/e2e/route.mjs --level forest_01 --repeat 1` **PASS**（winAt=39465ms，历史 39.78s±0.01 家族内，端到端零回归）
- L2 det 位级对比未跑：本修仅 TempleScene.ts 客户端表现层，不触物理内核（det 判据面为 内核×关卡×输入，零交集）。

## 6. 余项

- BevelFilter/Outline/NewSign/BackButton 校准（§3.1）——待 UI 统一轮或用户裁量。
- 若嫌全树暗橄榄仍不够醒目：oracle 框架内的合法旋钮只有 temple.json `color`（改色即偏离 oracle 数据，需用户裁量）；"破保真让全树高亮"属产品决策，不在复刻线内自作主张。
