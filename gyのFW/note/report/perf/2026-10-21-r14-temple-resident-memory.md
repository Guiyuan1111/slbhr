# r14 · 选关树驻留内存与分配峰值（2026-10-21）

> 战役第 14 轮。方向从 r12/r13 的"帧时间/分配速率"切到**驻留字节与分配峰值**：
> 前者决定低配机能开多少关、进出选关会不会 OOM，后者决定冷烘那一瞬间的存活水位。
> 零协议、零物理、零像素语义改动；红线由三层像素金样门禁（treebake）逐位守。

## 一、量具（`benchmark/perf-resident.mjs`，`e02fe86`）

**口径**：每个事件独立量，顺序固定为
`HeapProfiler.collectGarbage` → 读 GC 基线 → 页内 20ms 记录器（`__recStart`）→ 触发事件 →
等烘焙/换场落定 → 再 GC → 读终值。同出四组数：

| 字段 | 含义 |
|---|---|
| `churnMB` | 事件期间 raw 堆峰 − GC 基线 = 该事件造出的字节（含随后回收的垃圾） |
| `peakJobMB` | 选关树分帧烘焙在飞 typed array 峰值（`__fwTreeStats().jobMB` 采样取最大） |
| `heapGCMB` / `residentDeltaMB` | 强制 GC 后的真实常驻与其增量（未 GC 会把垃圾读成驻留） |
| `texMB` / `ground.bytesMB` / `tree.resultMB` | 纹理逐源 w·h·4、地面 LRU 字节、树结果位图字节 |

**为什么不用 `perf-alloc` 的采样堆分析器**（勘误①）：V8 `HeapProfiler.startSampling` 对
typed array 大块字节**失明**——同一次冷烘实测 `sampledTotal` 0.32MB，而堆增长 74MB。
帧内分配（小对象）可以用采样器归因，整块 ArrayBuffer/Uint8ClampedArray 的账必须走
"事件级 GC 基线 + 页内记录器"。

**踩过的坑（勘误②③）**：Playwright 的 `page.evaluate("() => {...}")` 字符串会被当表达式求值，
代码根本不执行（返回函数对象→序列化为 undefined），必须传函数字面量；`until` 落定条件首版只看
`jobs===0`，会在 `Temple.create` 尚未执行时即为真，把在飞烘焙当"常驻"（离房后虚报 81.4MB），
改 `textures.exists("tree-all") && jobs===0` 后为 33.5MB。

## 二、归因（基线 `benchmark/results/resident-r14-before.json`）

选关线三段账各自独立，不是一个问题的三个面：

1. **冷烘分配流水**：一次进选关造出 **74.5MB** 垃圾，事件内堆峰 86.2MB，其中在飞 typed array
   峰 **33.31MB**。根因是三层（big/all/done）任务一次性入队——单层需要
   raw 3.58 + alphas 0.9 + sats 3.58 + outs 3.58MB（outline 层另加 outAlphas+outSats ≈4.5MB），
   三层在 prepare 段同时存在。**这是低配安卓进选关的风险面**（不是慢，是可能被系统杀）。
2. **重进垃圾流水**：结果缓存命中（烘样 `jobs>0` 计数恒 0，零重烘已证）仍每次付 **15.6MB**。
   纯 Phaser 场景重建 + 三张 1036×864 canvas 全幅 `texImage2D` 重传。
3. **驻留**：menu 11.7 → temple 27（结果 10.24MB 位图）→ game 22.9（地面 4.96MB）→
   离房回选关 **33.5MB**。离房后仍留着地面位图与 `groundTex` 纹理（场景 shutdown 不带走
   game 级纹理），选关态用不到；`levelCache` 只增不删，长时间逐关浏览会单调增长。

## 三、实施（四件，逐件独立提交）

| 件 | commit | 改法 |
|---|---|---|
| A 烘焙逐层流水线 + 分带收尾 | `9412c62` | `startTreeBake` 只入队首层 `prepare`，每层 `raster` 末分片释放该层全部 typed array 并链式入队下一层；带 outline 的层排最前（它额外要 outAlpha+outSAT，此时已完成画布最少）。收尾由"整幅 createImageData + 整层转直色"改为 64 行一带（`writeStraight(src,dst,fromPx,count)`），写完即删 `outs/alphas/sats`。 |
| D 树纹理重进免重传 | `62bf35f` | `applyTreeTextures` 绑定前比身份：`tex.source[0].image === 待绑 canvas` 即整段跳过 `remove`+`addCanvas`（与 r13 `buildGround` 的 `bound` 免重传同款）。canvas 被结果 LRU 逐出时必伴随新对象，身份不等 → 照旧重绑。 |
| B 离房释放地面 LRU | `6cbef64` | `GroundCache.clear()`（逐张 `width/height=0` 归还位图 + 账归零 + **`bound` 置空**——留一张归零面具自称"正绑着"会让下次进关跳过重绑贴空纹理）；`GameScene.releaseGrounds()` 先摘 `groundTex` 纹理再清缓存；`leaveToMenu` 在 `sm.stop("Game")` 之后调用。换关（advance）不经此路径，预烘与免重传照旧。 |
| C `levelCache` 有界 | `626bf80` | 改触达置队尾 + 超 4 逐最旧（4 = 本关 + 结算期预取下一关 + 回看/重玩）；失败逐出的 `catch` 加身份校验，防"项已逐出、同 id 由新请求占回"时误删新缓存。 |

## 四、收益（同机同口径，`resident-r14-before` → `resident-r14-after`）

| 事件 | churn MB | 在飞峰 jobMB | 事件内堆峰 MB | 常驻 MB | 地面 MB |
|---|---|---|---|---|---|
| temple 首入（冷烘） | **74.5 → 49.6**（−33.4%） | **33.31 → 11.97**（−64.1%） | **86.2 → 61.3** | 27 → 27 | 0 → 0 |
| temple 重进（命中） | **15.6 → 5.5**（−64.7%） | 0 → 0 | 42.6 → 32.5 | 27 → 27 | 0 → 0 |
| temple 三进（命中） | **15.5 → 5.5** | 0 → 0 | 42.5 → 32.5 | 27 → 27 | 0 → 0 |
| temple 离房后（冷烘） | **70.2 → 32.1**（−54.3%） | **33.31 → 11.97** | **93.1 → 55.0** | **33.5 → 28.6** | **4.96 → 0** |
| menu（暖装落定） | 0.7 → 0.8 | 0 → 0 | 12.4 → 12.5 | 11.7 → 11.7 | 0 → 0 |
| game（开局静止） | 0.7 → 0.7 | 0 → 0 | 23.5 → 23.5 | 22.9 → 22.9 | 4.96 → 4.96 |

- 冷烘在飞字节 **−21.3MB**：进选关瞬间的存活水位从 33.31MB 降到 11.97MB，事件内堆峰降 24.9MB。
- 重进线每次省 **10.1MB** 垃圾 + 三张全幅上传的那一帧卡顿。
- 离房回选关驻留降 **4.9MB**（地面位图 + `groundTex` 纹理账 102.29 → 97.32MB）。
- **未劣化**：烘焙在飞时长 28 → 25 个 20ms 采样点（≈560 → 500ms，逐层串接没有把总工拉高）；
  游玩中驻留与帧内分配完全不动（见门禁表）。
- 分件归因（A 单件跑次 `resident-r14-a`）：冷烘 74.5 → 51MB、峰 33.31 → 11.97MB，
  与四件合计的差值即 B/D 各自贡献的驻留与重进线。

## 五、门禁（全绿，零回滚）

| 门禁 | 结果 |
|---|---|
| typecheck / build | 0 错 / 产物正常（index 98.09KB） |
| vitest | **179/179**（新增 `GroundCache.clear` 用例：位图归还 + 账归零 + bound 置空 + 清后必重绑） |
| `scripts/e2e/treebake.mjs`（r14 新建，本轮加免重传断言） | **9/9 PASS**：三层 FNV-1a 金样逐位命中（big 3784598315 / all 64705792 / done 1703026984）、重进零重烘、重进指纹逐位一致、**重进免重传（canvas 标记 + remove 计数双证：同对象 true、remove=0）**、阳性对照（改 1 像素即变指纹） |
| `scripts/e2e/groundcache.mjs` | PASS（地面像素逐位一致 + 免重传，B 件不影响 advance 路径） |
| journey / deathretry / refresh / wonrefresh | **7/7 · 4/4 · 3/3 · 6/6** PASS |
| route f01 | PASS（winAt 39488ms，基线带内） |
| perf-determinism `--compare r0-baseline` | **48/48 关位级一致**（本轮零物理零协议的最新直接证据） |
| visual-diff（两次） | 91.19 / 92.56（新口径带 90.0–92.9 内） |
| perf-client forest_01 canvas | fps **60.3**、alloc **1044KB/s**（对 r12 零回归） |
| perf-client forest_bonus_2 canvas | fps **59**、alloc 2299KB/s（对 r12 2246 属噪声带） |
| perf-advance（换关链 5 链） | 零网络 **5/5**、烘焙均值 **9.8ms**、点继续→可玩 **1035.7ms**（r13 1045.0）——C 件 4 关上限未伤预取 |

## 六、兼容性与风险披露

- 像素语义未动：A 件改的是**任务顺序与 ImageData 建法**，三层输出逐位由金样钉死；
  B/C/D 只动缓存生命周期与纹理绑定，不产生新像素路径。
- B 件让"离房后重选同一关"多付一次地面烘焙（实测 bakeMs 中位 12ms，落在 ≈1s 入房链内不可见）；
  C 件让第 5 关之外的旧关重进时多一次 `/api/level` 取数（与冷入房同代价）。
  两者都是"用可忽略的时间换回确定的字节"，非行为改动。
- D 件依赖"场景 shutdown 不带走 game 级纹理"这一 Phaser 语义（r13 的地面免重传同前提，
  已有 groundcache/treebake 两条门禁各自直读验证）。若未来升级 Phaser 使纹理随场景销毁，
  身份检查会自然落回"重绑"分支，属性能降级而非故障。

## 七、挂账

- 冷烘剩余 49.6MB 流水的大头已不是 typed array（峰 11.97MB），而是 `getImageData` 返回的
  ImageData 与三层 canvas 本体；再压需改采样精度或降 canvas 尺寸，**属保真红线**，不轻动。
- 真机 GPU 口径下的 `texMB` 与烘焙峰值（本均为软件渲染 + `usedJSHeapSize` 口径）。
- 幕布/图集常驻税、服务端 tick 侧候选、换关链剩余 ≈45ms（Game 场景创建与图集取用）。

产物：`benchmark/results/resident-r14-{before,a,after}.json`、`advance-r14.json`、
`client-r14-{f01,fb2}.json`。量具 `benchmark/perf-resident.mjs`，
门禁 `scripts/e2e/treebake.mjs` + `scripts/e2e/fixtures/tree-layers.json`。
提交链：`e02fe86`→`9a0d862`→`9412c62`(A)→`62bf35f`(D)→`6cbef64`(B)→`626bf80`(C)。
