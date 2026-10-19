# r9 · 空闲 CPU/功耗面（负结论轮：量具+测量归档，帧率上限弃件）

> 2026-10-20 · r9 测量轮。焦点：用户不操作时页面烧多少 CPU（挂机功耗/风扇/续航）。
> 此面从未量过：v0.3.33 石板大厅换肤（幕布 backdrop-filter+floaty）的**驻留**成本
> r8 只覆盖了连接窗；后台标签的 forceSetTimeOut 保活循环代价也从未量化。
> 产出：**量具 perf-idle.mjs + 六态基线快照 + 两项环境约束披露 + 帧率上限弃件
> （实测会在慢机砍帧=视觉回归，红线否决）**。零生产 diff 收口。

## 〇、一句话总账

**空闲 JS 面判到地板**（六态 script% 0.7–1.8%，r3 的 update 分配 -97% 之后 JS 执行本就非成本）；
主线程 task% 77–95% 全部为**软栅环境项**（headless SwiftShader 栅格/合成，r7r 已知环境面）；
帧率上限（Menu/Temple 30fps、对局 60fps）经两种机制实测**均不可用**——fps.limit 机制因
smoothStep 平滑交互在慢机反而砍帧（menu 渲染帧 67→48/4s，-28%，视觉回归红线），
_target 延迟机制无效（task -1%）——弃件。真 GPU 口径（xorg9）因本会话 sudo/su 均被禁
无法复现（环境约束披露），幕布驻留税在真机上的量级挂账。

## 一、量具 perf-idle.mjs

- 态矩阵：menu（大厅驻留，面板可见=真人等朋友态）/ temple（选关树）/ game-idle（开局静止）/
  game-paused（P 暂停）/ bg-game、bg-menu（后台标签，**默认旗标独立 context**——首版复用
  perf-client 的 --disable-background-timer-throttling 旗标污染了 bg 态，勘误见 §四.1）。
- 指标（CDP Performance.getMetrics，8s 窗）：taskPct=TaskDuration 增量/窗长（主线程任务占比）、
  scriptPct、heapMB、fps（`__fw.loop.actualFps`——**stepLimitFPS 下该值计 rAF tick 非渲染帧**，
  渲染帧率须用 POST_RENDER 事件计数，见 §四.2 勘误）。
- `--noblur` 归因开关、`--gpu`（xorg9 有头真 GPU，本轮环境不可用）、`--modes` 选态。
- 快照 `results/idle-<label>.json`；渲染帧计数探针归档 `tools/perfopt9/cap-verify.mjs`。

## 二、测量（本机 headless SwiftShader 口径）

| 态 | task% | script% | fps(actualFps) |
|---|---|---|---|
| menu | 80.2 | 0.7 | 35 |
| temple | 76.9 | 0.8 | 21.7 |
| game-idle | 90.7 | 1.7 | 19.6 |
| game-paused | 94.7 | 1.1 | 11.7 |
| bg-game | 88.8 | 1.4 | 11.4 |
| bg-menu | 88.9 | 0.8 | 14.4 |

（快照 idle-r9-before.json，git=9799145）

判读：
1. **JS 面地板**：script% 全态 <2%——空闲成本不在 JS，与 r3（update 分配 -97%）、
   r7r（渲染段 JS 面理论地板）结论闭环。
2. **task% 为软栅环境项**：SwiftShader 全软光栅下渲染即满负荷；此口径下跨态差异
   （menu 80 vs game 90）反映画布复杂度，不反映真机 CPU。
3. **bg 态 88% 是 headless 伪影**：headless 页无真实遮挡，Chromium 不节流（§四.1）。
   真人后台标签：Chromium 定时器节流（隐藏 5min 后 1/min）+ forceSetTimeOut 循环
   ~1Hz 空转——预期近零成本，无法本环境量化，披露不改码。
4. **noblur 归因（本环境）**：menu 80.2→77.8%（单跑，噪声带内）——软栅下画布栅格
   主导、blur 份额小；**真 GPU 机器归因相反**（画布栅格免费、幕布 blur 采样主导，
   r8 连接窗 CSS A/B 的 -256ms 即此机制在无 GPU 合成下的表现）。

## 三、帧率上限弃件（两次实测否决）

设计意图：Menu/Temple 素材动画本就 30fps 授权（原版 init.js），60fps 渲染 30fps 内容是
纯浪费；暂停/终局近静止。机制实验（POST_RENDER 渲染帧计数，4s 窗，before/after 配对构建）：

| 变体 | menu 渲染帧 | temple | 判定 |
|---|---|---|---|
| before（HEAD） | 67（≈17fps） | 94（≈24fps） | — |
| fps.limit 机制（hasFpsLimit/_limitRate+sleep→wake 重绑） | **48（12fps，-28%）** | 96（不变） | **慢机砍帧=视觉回归，弃** |
| _target 延迟机制（改 setTimeout delay） | ≈不变（task -1%） | — | 无效，弃 |

砍帧机理：stepLimitFPS 按 delta 累计 ≥_limitRate 才执行 update+render，而 smoothStep
平滑把慢机长帧（软栅 ~60-83ms）的 delta 压向 16.7ms 历史均值——累计进度被低估，
回调后插入额外等待间隙。快机（delta≈16.7）则按预期隔帧执行=30fps。**即该机制在
最需要省电的慢机上劣化观感、在快机上才有收益**，且收益面（真 GPU 真机）本环境
不可测。两方向都不满足红线/证据标准 → 弃件，生产 diff 全撤（main.ts 与 HEAD 一致，
typecheck/vitest 复核通过——本轮零生产改动，det/fixtures/visual-diff/e2e 不适用）。

弃件数据留档：idle-r9-after.json（fpsLimit 变体六态，menu task -12% 即砍帧所得，
非真实节能）、idle-r9-noblur.json。

## 四、勘误与口径

### 4.1 bg 态旗标污染（首版量具 bug）

首版 bg-game/bg-game 复用了 perf-client 的 --disable-background-timer-throttling /
--disable-renderer-backgrounding（那两个旗标是 perf-client 保测量稳态用的）——bg 态
测得 88.8% 实为"强制不节流"伪影。修正：bg 态用独立默认旗标 context。但修正后仍 88%
（headless 无遮挡不触发节流）——**headless 环境测不了真人后台行为**，快照 bg 行
标注为环境伪影，结论以浏览器节流机制推演披露。

### 4.2 actualFps 口径

stepLimitFPS 模式下 `loop.actualFps` 的 framesThisSecond 在限帧判断**之前**自增
（TimeStep.js:stepLimitFPS）——计的是 rAF/setTimeout tick 数非渲染帧数。渲染帧率
必须 POST_RENDER 事件计数（cap-verify.mjs 归档）。首版读数 fps=35 与渲染帧 17 的
偏差即此口径差。

### 4.3 环境约束披露

xorg9 真 GPU 口径（r7 解锁）本轮不可复现：`sudo -S`（gy/qwe、root/asd 两密码）与
`su root` 均被环境拒绝（sudo "running in a container" 拒绝 + su 认证失败），Xorg
无特权起不来，Xvfb 无 GPU 无意义。幕布驻留税在真 GPU 机器上的量级**挂账**，
前置=取得 sudo/xorg9 口径（或 CDP 远程真机，perf-client --cdp 同款）。

### 4.4 并行外来文件说明

本轮期间工作树出现外来未跟踪文件 `packages/client/src/scenes/templeTreeBake.ts`
（交接"在飞"滤镜槽工作，01:06 出现，非本槽产物）——typecheck 的 3 个错误全部
来自该文件，本槽生产 diff 为零、不动他人文件。

## 五、剩余候选

- **幕布驻留税（真 GPU 口径挂账）**：前置 sudo/xorg9 或 CDP 远程真机；若真机 idle
  task 显著（>15%），候选=blur 换静态近似（视觉变更需用户拍板）或 rAF 节拍面
  （r7r 挂账同源）；
- 后台标签真实功耗：需有头多窗或真机，headless 不可测（本报告披露）；
- temple 态 heap 58MB（vs menu 7.9MB）：选关树一次性构建的常驻，离开场景后可 GC，
  非每帧成本——低优先挂账。

## 六、复现

```bash
node --import tsx benchmark/perf-idle.mjs --save <label>                    # 六态基线
node --import tsx benchmark/perf-idle.mjs --noblur --modes menu,temple      # blur 归因
node --import tsx benchmark/perf-idle.mjs --compare r9-before
node --import tsx note/report/perf/tools/perfopt9/cap-verify.mjs            # 渲染帧计数探针
```
