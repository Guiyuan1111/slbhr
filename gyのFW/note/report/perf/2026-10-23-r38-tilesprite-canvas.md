# r38：WebGL 下 TileSprite 私有画布 1×1 化（每张背景驻留 −4.42MB，off 换关→可玩 −56.3ms）

> 日期：2026-10-23 · 版本线：0.3.43 · 量具：[`benchmark/perf-advance.mjs`](../../../benchmark/perf-advance.mjs)
> （沿用 r36 的武装判胜＋结算窗静网门＋逐资源三窗拆账，未改口径）、
> [`scripts/e2e/tilesprite.mjs`](../../../scripts/e2e/tilesprite.mjs)（新增 WebGL 像素门禁）与
> [`tile-sprite.test.ts`](../../../packages/client/src/__tests__/tile-sprite.test.ts)（9 例）。
>
> 结果：WebGL 下 TileSprite 原先按显示尺寸创建一张私有 canvas，`CanvasTexture` 构造时又对整幅
> 做一次 `getImageData`；这张画布只在 Canvas 渲染器里当 `fillPattern` 底片用，WebGL 渲染器一次
> 都不碰。本轮把 WebGL 路径改为**按 1×1 构造、再撑回显示尺寸并停掉每帧画布重铺**。换关落定后
> 纹理驻留逐档 **−4.42～−4.56MB/次**（森林背景 1248×928：账上私有画布 4.42MB，另有同尺寸
> ImageData 不在账内）；账上 UUID 私有纹理 A/A′ **80/80 样本存在 → B 0/40**。换关→可玩 off 档
> **1111.7→1055.4ms（−56.3ms，−5.1%）**，B 两个会话均值低于 A/A′ 四个会话均值全部；4g／fast3g／
> slow3g 落在臂内散布内，**不主张时序收益**。像素门禁 10/10 对象（含旋转、容器子级、浮点宽、
> Temple 第 6 个调用点）与同坐标原版全尺寸复制体**整幅画布逐字节相同**，私有画布 1×1。

## 一、问题：私有画布在 WebGL 下零消费，却按整幅显示尺寸分配

Phaser 3.80 的 TileSprite 构造器做三件事（[`node_modules/phaser/src/gameobjects/tilesprite/TileSprite.js`](../../../node_modules/phaser/src/gameobjects/tilesprite/TileSprite.js)）：

1. `this.canvas = CanvasPool.create(this, width, height)`（:181）——按**显示尺寸**建私有 canvas；
2. `this.texture = scene.sys.textures.addCanvas(this._textureKey, this.canvas)`（:240，键为 UUID）——
   创建 `CanvasTexture`；
3. `CanvasTexture` 构造器执行 `this.imageData = this.context.getImageData(0, 0, width, height)`（[`CanvasTexture.js`](../../../node_modules/phaser/src/textures/CanvasTexture.js):118），
   **再分配一整幅等大 ImageData 并长期持有**。

WebGL 渲染器每帧调用 `src.updateCanvas()`（[`TileSpriteWebGLRenderer.js`](../../../node_modules/phaser/src/gameobjects/tilesprite/TileSpriteWebGLRenderer.js):25），
而 `updateCanvas`（TileSprite.js:494–513）在 WebGL 下把画布尺寸对齐后立即 `return`，真正的
`ctx.fillPattern` 只在 Canvas 渲染器执行；WebGL 只消费 `fillPattern`（pot 尺寸，森林背景为
256×256）、`displayFrame`、`tileScale`/`tilePosition`。也就是说：

- forest_01 背景 1248×928：私有 canvas **4,632,576B＝4.42MiB**，ImageData 同为 **4.42MiB**，
  合计约 **8.84MiB/张**；`textures.list` 的 `w·h·4` 账只记 canvas（4.42MB），ImageData 不在账内。
- 每次换关都新建一张背景 TileSprite，所以这笔分配**按关重复**，不是一次性启动成本。
- 换关前的 `firstRenderMs` 窗口里，`CanvasPool.create` + `getImageData(0,0,1248,928)` 都是同步主线程
  工作，却对最终画面零贡献。

全关卡还有 4 类 TileSprite 走同一路径：吊绳 `pulley_rope0000`、罗马底座 `roman_base0000`、
容器内的罗马杠 `roman_bar0000`、选关大厅 `MenuBackground0000`（1280×960，另一份 4.69MB 画布）。

## 二、机制：按 1×1 构造，再撑回构造器本会落到的尺寸

[`tileSprite.ts`](../../../packages/client/src/scenes/tileSprite.ts) 新增 `makeTileSprite()`：

- **渲染器判别**：`"gl" in scene.sys.game.renderer` ⇒ WebGL；
- **构造**：WebGL 下 `add.tileSprite(x, y, 1, 1, key, frame)`——canvas 与 ImageData 都只有 4B；
- **撑回**：`tileSpriteSize(width, height, frameW, frameH)` 复刻构造器的归一化（两维非零向下取整，
  任一维 0 时该维回退到帧尺寸），写入 `sprite.width/height` 并 `updateDisplayOrigin()`；
- **停画布重铺**：覆盖实例的 `updateCanvas = () => { sprite.dirty = false; }`。这一步是必须的——
  否则 WebGL 首帧渲染调用 `updateCanvas`，发现 canvas 仍是 1×1 ≠ 显示尺寸，会把它**重新撑回整幅**
  （TileSprite.js:498–506），等于没省。
- **Canvas 回退原样**：非 WebGL 环境仍按显示尺寸构造，`updateCanvas` 不覆盖，几何/相位/底片全部走原路径。

渲染输入（`displayFrame`／`fillPattern`／`tileScale`／`tilePosition`／origin／旋转／容器父子链）不改；
纹理键仍是 UUID，动画与显示对象的引用关系不变。

## 三、实施

| 件 | 内容 |
|---|---|
| helper | [`tileSprite.ts`](../../../packages/client/src/scenes/tileSprite.ts)：`tileSpriteSize()` 归一化＋`makeTileSprite()` WebGL 1×1 构造、宽度撑回、`updateDisplayOrigin()`、`updateCanvas` 覆盖（:20）。 |
| 调用点 | `GameScene` 5 处：背景 `BackGround0000`（[:464](../../../packages/client/src/scenes/GameScene.ts#L464)）、吊绳两处（:941／:970）、罗马底座（:1009）、罗马杠容器子级（:1018）；`TempleScene` 1 处：`MenuBackground0000`（[:70](../../../packages/client/src/scenes/TempleScene.ts#L70)）。客户端不再有直呼 `.tileSprite(` 的点。 |
| 单测 | [`tile-sprite.test.ts`](../../../packages/client/src/__tests__/tile-sprite.test.ts) 9 例：尺寸归一化（含 0 回退）、WebGL 1×1 构造＋撑回＋`updateDisplayOrigin`、`updateCanvas` 只清 dirty、零尺寸、Canvas 回退、静态网（无直呼点、GameScene 5 处／Temple 1 处、helper 保留回退分支）。 |
| 像素门禁 | [`scripts/e2e/tilesprite.mjs`](../../../scripts/e2e/tilesprite.mjs)：冻屏、逐对象三拍（真实对象／隐藏底片／同坐标原版全尺寸复制体），A/B 整幅 RGBA 逐字节相等、`ink>0`、**私有画布 ≤4px²**；`--temple` 走真实 `__fwLeaveToMenu` 覆盖第 6 个调用点。 |
| 行号钉更新 | 源文件行数变化（GameScene −3、TempleScene +1）导致字形钉漂移：`prephase-chars.json` 209→210／238→239／187→188、`room.mjs` 1628→1625／1666→1663、`font-prephase.test.ts` 187→188、`font-roomblank.test.ts` 1528→1525。内容未变，钉继续守同一字符串。 |

## 四、量具与换臂

量具零改动，沿用 r36/r37 的 `perf-advance`：`FW_DEBUG_FORCE_DOORS=1` + `FW_DEBUG_ARM_WIN=1`、
结算窗静网门（在飞 HTTP=0 且 1.2s 静默、2.5s 最短观察窗、WS 不计入）、逐资源 chain/post/settle
三窗归类、换关后纹理驻留快照、`--dwell 1200`。每档每臂 **2 个会话 × 5 次换关**（顺序 A→B→A′）。

A/B/A 用整包 `dist` 换臂：

| 臂 | 构建 | `index.html` sha1 | 主 JS |
|---|---|---|---|
| A／A′（r37 基线） | `packages/client/dist` r37 | `f8a47781…` | `index-uHFsMKYU.js` `8bc175ac…`（108,853B） |
| B（本轮） | r38 | `9c3892c5…` | `index-DEytQHYW.js` `66f8d02f…`（109,118B） |

关卡序列 forest_01→02→03→04→05。因 r37 会话多为 2 次换关、本轮统一 5 次，页错条数不可跨轮直接
对比（见 §七）。

## 五、四档 A/B/A

`firstRenderMs`＝结算「继续」调用 → 下一关首个可玩帧，逐会话 5 次换关的均值：

| 档 | 臂A | 臂A′ | 臂B | Δ（B − A/A′ 中点） |
|---|---:|---:|---:|---:|
| off | 1116.7／1135.1（均 1125.9） | 1116.2／1078.9（均 1097.6） | 1052.8／1058.0（均 1055.4） | **−56.3ms（−5.1%）** |
| 4g | 1213.7／1258.6（均 1236.2） | 1260.5／1272.8（均 1266.7） | 1221.0／1219.7（均 1220.4） | −31.1ms（−2.5%），不主张 |
| fast3g | 1245.3／1245.0（均 1245.2） | 1407.6／1256.4（均 1332.0，含 1961.6 离群） | 1280.9／1207.8（均 1244.4） | −44.2ms（−3.4%），不主张 |
| slow3g | 1220.0／1279.8（均 1249.9） | 1172.0／1232.9（均 1202.5） | 1158.4／1300.4（均 1229.4） | +3.2ms（+0.3%），持平 |

- **off**：B 两个会话均值（1052.8／1058.0）**低于 A/A′ 四个会话均值全部**（1078.9–1135.1，
  领先 20.9–82.3ms）；A/A′ 两臂自身相差 28.3ms，Δ 为其 2.0 倍。方向与机制一致（每关省一次
  1248×928 的 canvas 建立与整幅 `getImageData`），但量级小于 100ms，只作**方向性结论**。
- **4g／fast3g**：B 与 A 的某会话基本相等（4g B 1220.4 高于 A 1213.7；fast3g B 1244.4 对 A 1245.2），
  收益小于会话散布，不主张。
- **slow3g**：B 与基线持平——网络与 fade 包络（1000ms）主导，省下的同步建场工作被盖住。
- **旁证（不作因果主张）**：`buildGround` 包装的 `bakeMs` 超 20ms 的次数，B 4/40 次，A/A′
  11/40 与 15/40 次（均值 12.5／18.7／22.5ms；B 有一次 95ms 离群）。方向与"移除每关 8.84MiB
  分配、降低堆压力"一致，但烘焙段本身未被本轮改动，故只记现象。

## 六、驻留账（本轮主收益）

换关落定后 `textures.list` 的 `w·h·4` 总账（五步对应 forest_01→05）：

| 步 | A/A′（off/4g；fast3g·slow3g 第 2 步） | B（同档） | Δ |
|---|---:|---:|---:|
| 01 | 62.46 | 58.02 | **−4.44MB** |
| 02 | 66.38；64.41 | 61.96；59.99 | **−4.42MB** |
| 03 | 63.03 | 58.47 | **−4.56MB** |
| 04 | 62.95 | 58.40 | **−4.55MB** |
| 05 | 62.24 | 57.82 | **−4.42MB** |

- **UUID 私有纹理计数**：A/A′ 的 `tex.big` 每一步都含一条 `4.42MB` 的 UUID 键（8 会话 ×5 步
  ＝**80/80**）；B **0/40**。四档会话的 UUID 项全部一致，账差不是偶发。
- 差额略大于 4.42（4.44–4.56）来自同关绳索/罗马部件的次要差异；第 3 步 4.56、第 4 步 4.55
  是两边 0.02–0.14MB 的部件到货差，不是第二张背景。
- slow3g 出现 ±1.97MB 的到货时序噪声：A 第 3／5 步偏低（61.06／60.27），B 第 2 会话第 3 步偏低
  （56.50）。背景 UUID 项在这些样本里仍恒定，主账以上表与 80/80→0/40 计数为准。
- **账外释放**：`textures.list` 只计 canvas；Phaser 同时持有的同尺寸 `imageData`（CanvasTexture.js:118）
  不在账内。按 1248×928×4 计，每张背景实际避免的常驻分配约 **8.84MiB**（账上 4.42MB 的 2 倍）。
- Temple `MenuBackground0000`（1280×960）在离房后同样只留 1×1 画布；由像素门禁覆盖，驻留账未单列。

## 七、像素门禁、掉帧与页错

**WebGL 像素门禁**（`tilesprite.mjs`，冻屏＋`gl.readPixels` 整幅 RGBA）：

| 场景/关卡 | 对象 | 结果 |
|---|---|---|
| Game forest_01 | `temple/BackGround0000` 1248×928，fill 256×256 | PASS，私有 1×1，ink 1,155,969，ndiff 0（sha `ee4bc491`） |
| Temple（真实离房路径） | `temple/MenuBackground0000` 1280×960，fill 512×512 | PASS，私有 1×1，ink 1,228,800，ndiff 0（sha `b83d6e42`） |
| Game forest_24 | 背景＋2 罗马底座＋3 吊绳＋2 容器内罗马杠，共 8 件 | **8/8 PASS**，私有全 1×1，ndiff 全 0 |

forest_24 覆盖了旋转 ±90°/1.036、浮点宽 251.08、容器父子链、细长对象（ink 399–5,412）与背景
（ink 1,158,144）。`ink>0` 证明对象确有像素上屏；B 侧复制体用原版全尺寸构造，A/B 整幅逐字节
相等说明 1×1 私有画布没有改变任何可见像素。Canvas 回退由 roomtext（`--disable-webgl`）覆盖：
forest_01 6/6、forest_12 5/5 面逐字节不变。

**掉帧**：B 的 `worstFrameMs` 14.1ms 以下（off 13.7／4g 13.0／fast3g 13.1／slow3g 14.1），
A 最高 19.1、A′ 13.7；`gapBuildMs` 峰值 B 1436.0（含 1000ms fade 包络），A/A′ 峰值 1646.6，
无新增尖峰。

**页错**：24 个会话共 **2653 条**，全部是 `TypeError: Cannot read properties of null (reading 'sourceSize')`，
每会话 70–147 条。分布：off A/A′/B＝231／255／234，4g＝223／172／253，fast3g＝274／225／210，
slow3g＝188／197／191。**臂 A 用的就是 r37 构建**，三臂同量级说明不是本轮引入；条数与单会话
换关次数正相关（r37：2 轮会话 0 条、4 轮 slow3g 会话 53／89 条；本轮全部 5 轮会话 24/24 都有）。
根因仍指向换关时旧纹理帧被动画/显示对象引用的时序，留作下一轮修。

## 八、代价与安全性

| 项 | 结果 |
|---|---|
| 客户端体积 | `index-uHFsMKYU.js` 108,853→**109,118B**（+265B，+0.24%）；`gzip -9` 36,824→**36,963B**（+139B，+0.38%）。增量＝helper＋6 个调用点改线。HTML 26,141B 大小不变（资源名换哈希）。 |
| 兼容 | 仅 WebGL 分支改构造尺寸；Canvas 渲染器路径逐行保留（roomtext 强制 `--disable-webgl` 复验）。纹理 UUID 键、显示帧、平铺相位、origin、旋转、容器链不变。 |
| 安全性 | 覆盖 `updateCanvas` 只作用在实例上，不碰 Phaser 原型；WebGL 下私有画布不再参与渲染，停掉重铺不影响 `fillPattern`。 |
| 回归防线 | 像素门禁新增"私有画布 ≤4px²"断言——若将来有人退回全尺寸构造，即便像素仍相等也会判红；静态网禁止客户端新增直呼 `.tileSprite(`。 |

## 九、末轮门禁

| 项 | 结果 |
|---|---|
| typecheck | 0 错 |
| build | `index-DEytQHYW.js` 109,118B／gzip-9 36,963B；`index.html` 26,141B |
| vitest | **30 文件／322 例**（r37 313＋tile-sprite 9；行号钉与静态网同步更新） |
| 生成器 `--check` | 11 项逐字节（含 asset-versions 51 条、prephase 重排、字体/图集/皮肤） |
| det `--compare r0-baseline` | **48/48 位级一致** |
| fixtures | 6/6 PASS |
| prephase-canvas | 5/5 逐字节 |
| roomtext forest_01／forest_12 | 6/6／5/5 面逐字节（Canvas 回退） |
| domskin | 4/4 |
| audiofamily／charsplay（off） | ALL PASS／ALL PASS（窗口期良性降级 2 条） |
| treebake／groundcache | ALL PASS／ALL PASS |
| journey journey／refresh／wonrefresh／deathretry／rejoin | 7/7 · 3/3 · 6/6 · 4/4 · 3/3 |
| route forest_01／forest_12 | 各 1 轮 won=true（winAt 40,004／13,462ms） |
| regression（zz_probe walkin-doors） | won=true，errors=0，sync=0，缺帧=0 |
| tilesprite 像素门禁 | forest_01 Game 1/1＋Temple 1/1；forest_24 8/8；私有画布全 1×1，ndiff 全 0 |

## 十、结论

- **收益（主）**：WebGL 下 TileSprite 的整幅私有 canvas＋ImageData 是纯白占。1×1 化后换关落定驻留
  逐次 **−4.42～−4.56MB**（森林背景 1248×928；账外另有等大 ImageData，实际约 8.84MiB/张），
  UUID 私有纹理 **80/80→0/40**。收益按关重复，四档一致。
- **收益（辅）**：off 档换关→可玩 **−56.3ms（−5.1%）**，B 低于 A/A′ 全部会话均值；4g／fast3g／
  slow3g 在散布内不主张。时序收益来自每关一次同步建场工作的消失，弱网下被网络与 fade 包络掩盖。
- **兼容**：WebGL／Canvas 双路径分流，Canvas 回退逐字节不变；10 个 TileSprite 对象（含旋转、
  容器嵌套、浮点宽、Temple 背景）与同坐标原版全尺寸复制体整幅像素相同；48 关位级一致、六份
  fixture、前场五态、房内文本、四条旅程＋advance 旅程、双关路线、回归与十一项生成器复现全绿。
- **代价**：客户端 +139B gzip；无服务端与资源改动；新增一条 WebGL 像素门禁。
- **遗留**：`sourceSize` 空引用页错随会话换关次数增长（本轮 24/24 会话出现，r37 构建同样命中），
  定性为基线既有、下一轮处理；Temple Finish 保留/释放再账；4g 档小于 100ms 的收益需更多轮次。
  素材再编码（任务 #42）仍是用户保留项，未经裁决不动。
