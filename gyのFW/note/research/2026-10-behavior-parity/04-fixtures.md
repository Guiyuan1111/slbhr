# 04 号档 · 金轨迹 fixture 回归协议（内核侧先行，Ruffle 式）

> 一句话：`scripts/e2e/fixtures/<level>/<case>/` = 输入路线（route.json）+ 配置声明（meta.json）+ 金输出状态流（expected.json），`fixture-runner.mjs` 内核回放逐项比对——Ruffle `tests/swfs` 回归协议（test.swf/test.toml/output.txt）在 Fireboy-and-Watergirl 内核侧的对应物，v1 用 tolerance=0 位级自基线把"行为面进度总账"的地基打实。
>
> - 日期：2026-10-17
> - 槽位：fixtures（行为复刻三线之三，纯内核侧；oracle 侧属 vtoracle 槽，本档只留接入预案 §5）
> - 依据：`01-survey.md` §5.1/§6 推荐三；Ruffle 协议实物 `tools/ruffle-excerpts/tests-README.md`（master 653ef4f4）
> - 工具：`scripts/e2e/routetool/fixture-runner.mjs`（node 直跑，零新依赖；**不接 CI、无 npm script**——跨槽纪律，接入由用户裁决）

## §1 与 Ruffle 协议的映射

| Ruffle（tests/swfs/） | 本协议（scripts/e2e/fixtures/） | 备注 |
|---|---|---|
| `<用例>/test.swf` | `<level>/<case>/route.json` | 输入脚本；被测物=内核×关卡，由目录名+route.level 隐含 |
| `<用例>/test.toml` | `<level>/<case>/meta.json` | num_ticks→route.totalFrames；tick_rate→meta.dtSchedule；approximations.epsilon→meta.tolerance |
| `<用例>/output.txt` | `<level>/<case>/expected.json` | 金输出；--update 重录 |
| `cargo test` 逐用例跑+比对 | `node --import tsx …/fixture-runner.mjs` | 全绿 exit 0，否则 1 |
| `sleep_to_meet_frame_rate=false` | 恒无真实时间 | 回归套件默认固定 tick，与 Ruffle 同口径 |

## §2 目录协议与字段语义

```
scripts/e2e/fixtures/<level>/<case>/
├── route.json    输入事件流：与 inputs/routes/*.json 同构（{level,tickHz,totalFrames,fb[],wg[]}），runner 直接吃
├── meta.json     配置声明（人写，runner 只读）
└── expected.json 金输出（机写，--update 重录）
```

### meta.json（全部字段）

| 字段 | 语义 | v1 值 |
|---|---|---|
| `source` | 金输出来源：`"kernel-v1"`=内核自基线 / `"oracle"`=原版引擎金输出（§5 预案） | `"kernel-v1"` |
| `dtSchedule` | dt 调度族。`"fixed-60"`=每帧 dt 恒 1/60（与 runKernel 同）；dt 注入谱系留待 dtsweep 扩展，未知值 runner 报错 | `"fixed-60"` |
| `tolerance` | 数值叶容差。**0=位级比对**（JSON 双精度往返无损，逐叶严格相等）；**>0=atol**（\|a−b\|≤tol 即过，留给未来 oracle） | `0` |
| `sampleEvery` | 抽样步长 K：抽样帧 = {f : f%K===0} ∪ 结局帧 ∪ 末帧。抽样帧的 `ev` = 自上个抽样帧以来累计的全部内核事件（WorldEvent 原样数组） | `1` |
| `mechEvery` | 机关快照（`w.mechSnapshot()` 全量：levers/pushers/platforms/props/winds/hangings/pulleys/romans）抽样步长；0=关闭。结局帧/末帧恒带快照 | `60` |
| `notes` | 出身与覆盖面说明（源路线路径、谱系、内核 WIN 帧） | — |

### expected.json（结构）

```jsonc
{
  "format": 1,              // 协议版本，runner 只认 1
  "level": "forest_12", "case": "main",
  "source": "kernel-v1", "dtSchedule": "fixed-60",
  "tolerance": 0, "sampleEvery": 1, "mechEvery": 60,
  "totalFrames": 1200,
  "routeSig": "d54a7e0bd9196bec",   // route 语义指纹：规范化事件流 sha256 前 16 hex；
                                    //  比对前先核——输入变而基线未重录 → FAIL 并提示 --update
  "outcome": { "status": "won", "frame": 776, "timerMs": 12949.999999999887 },
  "frames": [
    { "f": 0, "ph": "playing",
      "fb": { "x": 96, "y": 124.5575, "vx": 0, "vy": 0 },
      "wg": { "x": 1152, "y": 124.5575, "vx": 0, "vy": 0 },
      "ev": [],                       // WorldEvent 原样：death/gameover/diamond/door-open/mech/win
      "mech": { "hangings": [...], "pulleys": [], ... }   // 仅 mechEvery>0 时按 §2 抽样规则出现
    } /* … */
  ]
}
```

**比对语义（恒定规则，不随 tolerance 变）**：
- 帧号 `f`、`outcome.frame`、`outcome.status`：**精确比对**（逻辑索引不是测量量，1 帧偏移就是行为发散）；
- 数值叶（坐标/速度/timerMs/机关量）：tolerance=0 → 严格相等；>0 → |a−b|≤tol；
- 其余（字符串/布尔/结构）：严格比对；对象按键集合、数组按长度+逐元素；
- FAIL 报告：首个发散帧 + 该帧双方数值（叶路径 `frames[i].fb.x`）+ 全程最大偏差 maxDev 及其路径；
- 终止语义与 `runKernel` 一致：dying/dead 先判（死亡优先）、`phase==="won"` 后判、跑满 totalFrames 为 `timeout`。

## §3 runner 用法

```bash
cd gyのFW   # 仓库主工程根
# 全量比对（默认）
node --import tsx scripts/e2e/routetool/fixture-runner.mjs
# 按关/按用例过滤（子串匹配 "<level>/<case>"）
node --import tsx scripts/e2e/routetool/fixture-runner.mjs --filter forest_01
node --import tsx scripts/e2e/routetool/fixture-runner.mjs --filter forest_12/main
# 重录基线（仅限有意变更后；输出与旧基线的 diff 摘要供人审）
node --import tsx scripts/e2e/routetool/fixture-runner.mjs --update [--filter …]
```

- exit：全绿 0；任何 FAIL/协议错误 1。目录扫描自动跳过非 fixture 子树（如既有 `fixtures/levels/` 运行时探针，无 meta.json 不入册）。
- `--update` 纪律：它是"承认行为变化"的动作，不是"修测试"的动作——先看 diff 摘要（结局/帧数/首发散帧/maxDev），说不清为什么变就不要写。
- route 指纹守门：改了 route.json 而忘重录 → runner 以 `routeSig` 不匹配 FAIL，不会拿旧基线错判新输入。

### 验证记录（2026-10-17，本槽实测）

- **runner 自确定性 ×2**：比对模式连跑两轮 4/4 PASS、maxDev 0；`--update` 重录前后 expected.json sha256 逐一相同（532ce9e4…/1a5e3d93…/8d9b8cde…/b00fa3d4…），且 runner 自报"与旧基线位级一致"。
- **负测试**：手改 forest_12 基线两叶（fb.x+0.5、wg.vy+0.25）→ FAIL 报告首发散帧 f300、双方数值、Δ、maxDev=0.5@frames[300].fb.x，exit 1。探针即删。

## §4 首批 v1 基线（内核自基线，锁行为）

选关原则：有现成内核 WIN 路线 + 机制覆盖互异（七类机关全覆盖），规模到此为止——oracle 金输出进来前这批只是协议验证，不贪 48 关。

| fixture | route 出处 | 内核 WIN | 机制覆盖 | expected.json |
|---|---|---|---|---|
| `forest_01/main` | inputs/routes/forest_01.json（v38 谱系，±1f 抖动免疫） | @f2365 | lever/pusher×2/platform×2/prop | 864K，2366 帧 |
| `forest_04/main` | inputs/routes/forest_04.json | @f1098 | +**pulley**（滑轮代表关） | 408K，1099 帧 |
| `forest_12/main` | inputs/routes/forest_12.json | @f776 | **hanging**×3（7024dd5 摆板轴点修复的行为锁） | 280K，777 帧 |
| `forest_26/main` | inputs/routes/forest_26.json | @f1497 | **wind**×5（锁定 F6 缺省 simTimeS 确定性风时钟口径） | 556K，1498 帧 |

route.json 为源路线逐字节拷贝（出身谱系见各 meta.notes）。落库时未压缩数值精度——JSON 双精度最短往返表示即位级语义本身，压缩=破坏 tolerance=0 的可判性。

forest_02 现有两条路线内核均死亡 @f1879，未入册（不伪造基线）；挂账待其路线复活后补。

## §5 oracle 金输出接入预案（vtoracle 槽落地后）

前置：`01-survey.md` §6 推荐一——CDP 虚拟时间把 oracle 钉成确定性 60Hz 机器（budget=16.667ms/步 + 逐步键盘注入 + Date.now 虚拟化冒烟）。vtoracle 槽验证通过后：

1. **采集器复用**：oracle 侧逐帧采样直接复用其 `sampleState` 同款字段（x/y/vx/vy 双角色 + 事件），写成 `expected.json`，`meta.source:"oracle"`；fixture 目录新增兄弟 case（如 `forest_01/oracle`），**不动 kernel-v1 case**——两侧基线并存，各自的漂移各自看。
2. **tolerance 定值流程**：oracle 虚拟钟 ×3 跑自身逐位一致（推荐一验收线）→ 若与内核同 V8 同引擎字节同 dt 序列（36 号档定义面零差异前提），可试 tolerance=0 位级；实测有残差（风相位半帧量化、输入派发抖动）→ 按 maxDev 谱定 atol（建议从 0.5px 档起步），在 meta.notes 记录定值依据。
3. **风相位**：oracle 侧按 t0 锚定虚拟钟公式重建（survey §4.3），残差只剩 ±半帧采样量化——若超容差，先查采样相位再动 tolerance。
4. **覆盖不了的面**：输入相位随机（差异源③）在 razor 窗 ±1f 的结局翻转，fixture 单点基线天然不覆盖——属推荐三的 ±N 帧抖动性质测试（fast-check 式"结局恒定域"），后续独立扩展，不塞进本协议。
5. 新增 `source:"oracle"` 时 runner 零改动——meta/expected 协议字段已预留，比对只吃 tolerance。

## §6 与 det 位级基线的分工

| | det（benchmark/perf-determinism.mjs，现基线 r32=det-r32.json） | 金轨迹 fixture（本档） |
|---|---|---|
| 问的问题 | 我方内核自己漂没漂（任意改动 → 位级行为变化） | 这条真实通关路线的行为面长什么样、有没有变；（oracle 接入后）与原版行为差多少、差在哪帧 |
| 输入 | 600 步短探针（idle/scripted 两个固定脚本，不依赖路线） | 完整通关路线（千帧级，含全部事件与机关快照） |
| 覆盖 | 48 关广覆盖、每关浅 | 首批 4 关深覆盖，逐关扩 |
| 判定 | sha256 指纹比对 | 逐帧数值+事件结构比对（可报发散帧与偏差量） |

协作关系：det 指纹变 → 内核有行为漂移，先看它；fixture FAIL → 漂移落到具体关卡/帧/量，用它的报告定位。v1 阶段两者同为内核自基线（同侧互补）；oracle 金输出进来后 fixture 转正为"对 oracle 行为漂移"的主量具，det 语义不变。

## §7 边界与纪律记录

- kernel.mjs 及 routetool 既有文件零改动（runner 只 import）；package.json 未动（无 npm script、不接 CI，接入待用户裁决）；oracle 目录 `Fireboy-and-Watergirl/` 未触碰。
- 已知未实现（如需再扩 meta+runner）：Ruffle 的 `known_failure`/`ignore` 挂账语义、`filter` 平台谓词、subtests 多配置（等价物=同关多 case 目录，已天然支持）。
- 本槽零 TEMP 残留（负测试探针直接建删于 fixtures 目录内，未用 TEMP/fixtures）。

## §8 复现命令全集

```bash
cd gyのFW
node --import tsx scripts/e2e/routetool/fixture-runner.mjs                      # 全量比对 → 4/4 PASS, exit 0
node --import tsx scripts/e2e/routetool/fixture-runner.mjs --filter forest_26   # 单关
node --import tsx scripts/e2e/routetool/fixture-runner.mjs --update             # 重录（慎用，先读 diff 摘要）
node --import tsx scripts/e2e/routetool/validate.mjs --level forest_04          # 源路线内核复核（runner 的上游口径）
```
