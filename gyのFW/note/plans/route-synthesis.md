# 路线初排合成工作流（产线标准作业程序）

> 2026-10-11 定稿。用途：为 47 个余关批量生产通关路线（批次表见 level-batches.md）。
> 每关由一个独立执行者（子 agent）按本 SOP 走完全程；产线工具链已就绪（0.3.29）。

## 0. 产线总览（每关五步）

```
1. geom     node --import tsx scripts/e2e/routetool/geom.mjs --level <id>
            → ASCII 网格 + 机关表（出生/门/液体/平台/风/摆板…全量几何）
2. 初排     分析网格规划路径 → 手写路线 JSON（帧级时间线）→ 内核回跑迭代
3. 硬化     node --import tsx scripts/e2e/routetool/optimize.mjs --level <id> \
              --route scripts/e2e/inputs/routes/<id>.json --scan 2 --one --jobs 4 --write
4. 复核     node --import tsx scripts/e2e/routetool/scan.mjs scripts/e2e/inputs/routes/<id>.json 2 4
            （残余刀锋→4b. 逃逸：node --import tsx scripts/e2e/routetool/multistart.mjs \
              --level <id> --scan 1 --jobs 4——枚举单方向刀锋预移 1f 至 WIN 孪生盆位重降；
              forest_01 实证：单盆位下降收敛 ≠ 全局不可达，预移一跳即 ±1f fatal 0/222；
              注意复合预移混沌耦合，工具已按逐个预移+独立全局验收实现）
5. 门禁     PATH="$PWD/TEMP/node:$PATH" node scripts/e2e/route.mjs --level <id> --repeat 3 --port <分配端口>
```

验收 = 门禁 repeat≥3 ALL PASS（0 调试钩子；`FW_DEBUG_*` 在门禁中**禁止**）。硬化/复核须在最终内核上跑
（fatal 计数是内核版本相对的）；并发跑产线时 `--jobs` 压到 4（多 agent 共享 CPU）。

## 1. 坐标系与工具读法

- **屏幕px ≡ Tiled px**（x 右增、y 下增）；内核 trace/state 玩家坐标即屏幕px，是**身体中心**。
  站在地表 row R（顶面 y=32R）时中心 y ≈ 32R − 35；脚底 = 中心 + 35px。
- b2 米系 = (−px/32, −py/32)（y 向上）——只在读 build/mechanisms 源码时需要。
- geom 网格：行号 0=顶。图例与机关代表格见 geom.mjs 头注释；**精确几何以下方机关表为准**（叠加字符只是标位）。
- 常数（params.ts）：gravity=31.25 m/s²、jumpVelocity=15.5 m/s、runForce=50N、maxSpeed=8.5 m/s。
  校准种子：满速 ≈ **4.5 px/帧**（起跑有爬升，头 ~15 帧只有 2-3 px/帧）；满跳滞空 ~60 帧、开放空域升 ~3.8 格
  （有天花板时以 trace 实测为准）；斜面/自动上台阶（32px）走上即可，64px 台必须跳。

## 2. 路线 JSON 格式（与门禁/内核同一格式）

```json
{
 "level": "forest_06",
 "source": "初排 2026-10-11, <一句话路径描述>",
 "tickHz": 60,
 "totalFrames": 3600,
 "fb": [ { "f": 10, "dir": "right", "type": "down" }, { "f": 80, "dir": "right", "type": "up" }, { "f": 90, "dir": "up", "type": "down" }, ... ],
 "wg": [ ... ]
}
```

- 事件 = 按键沿（dir ∈ up/left/right，type ∈ down/up）。帧 f 的按键状态在 f 步进前生效。
- totalFrames 给足余量（按路径长估算 +600f）；内核 WIN 后 `winF` 会提前返回。
- 双角色事件各一条，无序要求（expandFlat 排序）。

## 3. 初排迭代法（核心手艺）

1. **分段规划**：把路径拆成段（走/跳/乘平台/借风），每段算起止帧（距离÷速度）。
2. **先动起来**：第一版路线允许粗糙（大致帧数），validate → 读 trace 找第一处偏离设计的帧。
3. **trace 调试**：`node --import tsx scripts/e2e/routetool/validate.mjs --level <id> --route <路径> --trace TEMP/<你的目录>/trace.json`
   ——trace 是逐帧 `[f, fb:[x,y], wg:[x,y], ph]`，对照设计查「早跳/晚跳/没跳上/掉液」。
4. **跳跃校正式**：从平台 A 跳到平台 B（同为脚底平面，高差 Δrow 格、水平距离 Δcol 格）：
   - 满跳升 3.8 格、滞空 60 帧；水平位移 = 速度积分，按 4.5px/帧 估（起跳前先跑起来再跳，距离远）；
   - 跳点选择：起跳帧=脚离 A 缘前 2-5 帧；提前按住方向（空中横推 floatForce 有效）。
5. **机关规则**（forest01-route.md 实证）：
   - 平台纯信号驱动（组内 lever/pusher OR）；拉杆/压板是**穿越/踩踏触发**，无冷却语句——但回调内直改（F7 语义）；
   - **禁止站在下行平台路径下方**（内核对 vy=0 玩家 vs 下降平台无挤开解算，会永久嵌入）；
   - 风：常开风柱是上升气流（跳入后可控漂移），常关风=摆设不操作；
   - 摆设机关清单见 level-batches.md §6（路线操作序列必须跳过）。
6. **死亡定位**：validate 返回 deathF=f → trace 查 f 附近双角色位置，判死因（液体/嵌入/挤出边界）。

## 4. 并发作业约定（多 agent 同时产线）

- 每个执行者独占：`TEMP/route-<level>/` 工作目录、门禁端口（分配表见当批派工单）。
- 共享只读：geom/validate/optimize/scan/kernel 源码与关卡数据。共享可写：`scripts/e2e/inputs/routes/<id>.json`
  （文件名=关卡 id，天然无冲突）；optimize 的 `.best.json` 快照同目录同名后缀，无冲突。
- 结束时清理自己的 `TEMP/route-<level>/`（trace/中间路线不入库）。

## 5. 完工定义（每关）

- [ ] `scripts/e2e/inputs/routes/<id>.json` 存在，source 字段写明路径描述与产线口径
- [ ] scan.mjs ±2f 致命表 fatal 0（不归零先跑 multistart 盆位逃逸；仍残余才在 source 里注明并列出刀锋表）
- [ ] route.mjs 门禁 repeat≥3 ALL PASS（记录胜时与末坐标）
- [ ] 汇报：一行路径描述 + 门禁结果 + 残余风险（若有）
