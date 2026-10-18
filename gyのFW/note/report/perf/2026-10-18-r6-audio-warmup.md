# r6-a 音频暖装（性能战役 r6 轮 a 槽）

日期：2026-10-18　槽位：r6-a（接任死随身主机重启的前任，改动落盘未验证未提交 → 本槽验证+收口）

## 改动一句话

游戏内音频批 18 键（bgm_menu 以外的全部游戏内音效+关卡音乐）从 GameScene.preload 的建房期懒装载提前到 MenuScene 驻留期后台暖装（`BootScene.startBgWarm` 并入 `loadAudioPack(scene, AUDIO_GAME)`，与 r5 四图集同一暖装队列与落定门），GameScene.preload 保留兜底声明。

## 双载竞态自查（源码级实证）

结论：安全，与 r5 图集暖装（458bff2）同一既证模式。

- 落定门：`BootScene.ts` `startBgWarm` 登记 `warmState`，`main.ts:233` 建房切场景前 `await bgWarmSettled()`（r5 既有代码，未改）——暖装在飞时 GameScene 根本不会启动，不存在「边下边声明」窗口。
- 兜底跳过语义（Phaser 3.90 源码，node_modules/ 实读）：
  - `LoaderPlugin.js:546` `addFile`：`if (!this.keyExists(item))` 才入队；
  - `keyExists`（:574）= `file.hasCacheConflict()` ∥ 与本场景 loader 队列/inflight 同 type+key 冲突；
  - `File.js:497-500` `hasCacheConflict` = `this.cache && this.cache.exists(this.key)`；
  - `filetypes/AudioFile.js:55` `cache: loader.cacheManager.audio`——audio 键查的是 cache.audio，已暖装的键由 GameScene.preload 静默跳过，零重复装载。
- 全并行声明核实：`phaser/src/core/Config.js:501` 非 Android 默认 `maxParallelDownloads=32`；暖装批 4 图集(8 文件)+18 音频 = 22 请求 < 32，仍全并行（main.ts 未覆写该配置）。
- 实证：探针进 Game 后 `xhrBig`（>1KB XHR）与改前一致、`transferKBAfterGame` 总字节完全相同（6899KB），reload 传输 2KB 不变——无任何重复下载痕迹。

## 勘误：游戏内音频批实为 ≈2.0MB，非 2.8MB

前任已核：18 键磁盘实测 **2,058,151 B ≈ 2.0MB**，其中 LevelMusic.mp3 单文件 1.29MB。0.3.21 相关注释（audio.ts 头注/BootScene/GameScene）沿用旧口径 2.8MB，本次一并勘误。r6-before 快照侧证：改前进 Game 增量传输 ≈ 6518−3312 ≈ 3206KB ≈ 18 音频(2060KB) + 四图集(~1146KB)，与 2.0MB 口径吻合。

## 快照出处澄清（对派发任务的纠正）

派发所指 `benchmark/results/audio-f4-before.json` / `audio-f4.json` **不是性能基准**：meta.note 为「F4 响度对齐：原版 master 0.1 + waterSteps .5 / wind .2，其余 1.0」，是 2026-10-09 音频保真轮的响度审计（`benchmark/audio-loudness.mjs --save f4` 产物，before fail → after pass）。本槽已重跑该门禁确认改动后仍 **PASS：12 键全对齐**。真正的性能前后对照锚：

- `load-r5-coldstart.json`（git 458bff2 r5 终态，2026-10-18 10:48Z）
- `load-r6-before.json`（git e8ded89，**改前基线**；时间线取证：快照落盘 20:09:48，前任 src 改动 20:12:51，`git diff 458bff2..HEAD -- packages/client` 为空 = 改前客户端代码与 r5 终态一致；其 warmReload 1578.5KB 是 round1 整页缓存未命中 3154.8KB + round2 2KB 的环境抖动，非代码差异）。该文件当前仍未跟踪入库，归属工具链槽/后续收口，本报告仅引用。

## 门禁结果（全绿）

| 门禁 | 命令 | 结果 |
|---|---|---|
| 位级确定性 | `DET_WORKERS=0 node --import tsx benchmark/perf-determinism.mjs --compare r0-baseline` | exit 0，**48/48 关位级一致**（3.6s） |
| 金轨迹 fixture | `node --import tsx scripts/e2e/routetool/fixture-runner.mjs` | exit 0，**6 PASS / 0 FAIL** |
| 类型检查 | `npm run typecheck` | 零输出 |
| 单测 | `npm test` | 85/85 |
| F4 响度 | `node --import tsx benchmark/audio-loudness.mjs` | PASS 12 键全对齐 |
| 页面错误 | perf-load/探针 2+3 轮 | 0 |

`DET_WORKERS=0` 说明：本槽门禁执行时共享工作区里有 r6 工具链槽（r6c）在飞的 perf-determinism.mjs worker_threads 并行改写，其并行路径在本环境**必炸**（worker 线程经 `new Worker(new URL(import.meta.url))` 重入脚本时 tsx 的 `.js→.ts` 解析钩子不在位：主线程头行「worker 池 ×7」打印后即 `ERR_MODULE_NOT_FOUND levels.js`；本槽最小实验证明 execArgv 显式传 `--import tsx` 也救不了，module.register 钩子不跨线程）。该改写自带逃生门 DET_WORKERS=0（单进程内联=旧串行路径），本次门禁走此路径。**该发现已被 r6c 采纳并落库**（4a6eb60：worker 分支改 tsx/esm/api register()；commit message 引用本槽探针实证，并独立重验串行 48/48 位级一致 3.5s/3.6s，与本槽 3.6s 互证）。

## 前后数字表

冷启动 Menu 口径（perf-load，无痕 context，两轮均值；时间数值受 VMware 轮间波动影响，传输/请求数为硬口径）：

| 指标 | r5-coldstart（458bff2） | load-r6-before（e8ded89，改前） | load-r6-audio run1 | load-r6-audio run2 |
|---|---|---|---|---|
| 冷启 Menu active | 523.5ms | 697ms | 561ms | 520ms |
| 冷启 Menu 传输（硬口径） | 3674KB | 3674KB | **3674KB** | **3674KB** |
| 冷启请求数（硬口径） | 14 | 14 | **14** | **14** |
| 点击建房→Game active（即点路径） | 697.5ms | 811ms | 668.5ms | 711ms |
| 进 Game 累计传输（硬口径） | 6899KB | 6899KB | **6899KB** | **6899KB** |
| reload Menu active / 传输 | 532ms / 2KB | 603.5ms / 1578.5KB(抖动) | 587ms / 2KB | 581ms / 2KB |

- **暖装零代价证实**：冷启 Menu 传输/请求数 3674KB/14req 三方逐位相同——暖装在 Menu 驻留期（首帧+120ms）后台进行，冷启快照（menuActive 时点）不受影响；reload 2KB 不变（音频走 HTTP 缓存，无新增字节）。
- **即点路径不回退**：668.5/711ms vs 改前 811ms（同日基线）更好、vs r5 697.5ms 持平——即点时 enterGame 等落定门，暖装尾巴与建房握手重叠，GameScene.preload 全命中缓存。

音频就绪时点与驻留路径（TEMP/perfopt6a/probe-audio-ready.mjs，端口 3617，`__fw.cache.audio` 18 键全在=就绪）：

| 指标 | 改前（r5/0.3.21 口径） | 改后 |
|---|---|---|
| 音频 18 键就绪时点 | 点击建房后的 GameScene.preload 期间（即点路径下 ≈点击后 811ms 内才拉齐） | **Menu active +941ms**（驻留期后台，早于任何人类可完成的输入） |
| 四图集就绪时点 | 同上（r5 已暖装） | Menu active +791ms |
| Menu 驻留期资源 | 14 项 / 3674KB | 40 项 / 6878KB（暖装把 ≈3.2MB 挪进驻留窗） |
| 驻留后点击→Game | —（改前无此口径） | **409ms**（音频图集全命中，GameScene.preload 近零） |
| 进 Game 总传输 | 6899KB | 6899KB（总字节不变，仅时点前移） |

收益面一句话：人类真实驻留路径（Menu 停留 ≥1s）下，进 Game 不再为 2.0MB 音频付出任何等待；即点机器人路径也无回退。冷启动 Menu 口径零损伤。

## 产物与提交

- 四 src 文件：`packages/client/src/{audio.ts,scenes/BootScene.ts,scenes/GameScene.ts,scenes/MenuScene.ts}`（前任语义完整，本槽验证后原样提交）
- 新快照：`benchmark/results/load-r6-audio.json`（run2，--no-build 同 dist；run1 数字见上表，文件未入库防同 label 混淆）
- 本报告；TEMP/perfopt6a/ 探针与日志收尾已清理
- 未动：load-r6-before.json（未跟踪，非本槽产物，归属后续收口）；perf-determinism.mjs 并行改写已由 r6c 槽自行落库（4a6eb60）
