# 02 · 复刻工程逻辑审计（子代理 B 完整报告）

> 审计基准：复刻代码逐行通读；原版依据 = `Fireboy-and-Watergirl\output\A\js\init.eb02fbdab2aa1d24.js`（**本报告内 `init.js:NNNNN` 为 js-beautify 美化版行号**，美化产物未归档，复查建议与 01 报告的字节偏移交叉定位）+ `output\A\assets\tilemaps\tilesets\*.json` + `output\A\data\forest|tutorials\levels\*.json` 全量扫描（39 关口径含教程与变体）。复刻目录简写 `FW = gyのFW`。
> `FW\data\` 拷贝与原版字节一致（MD5 已核），数据性结论两边同源。
> 产出日期：2026-10-04，只读审计。

## 一、确定错误（有原版证据直接反驳）——按严重度排序

**E1. 死亡模型整体错了：原版"任一人死 → 整关重开"，复刻"1.1s 原地重生继续玩"【玩法核心】**
- 证据：`FW\packages\shared\src\world.ts:209-221`（逐角色 respawnDelay 复活、deaths 计数、phase 保持 playing）；`FW\packages\shared\src\params.ts:25`。
- 原版：`init.js:45070-45075` `checkEndGame` 中任一 `isDead` 立即 `gameOver()`；`init.js:45154-45156` `retry` 重载整关；原版不存在"复活"代码路径。复刻把关卡容错从"零失误"改成"可累积死亡"，森林冰火人的核心惩罚体验被替换。

**E2. 地形碰撞形状全错：45° 斜坡瓦片被当成实心方块/空气【可通行性】**
- 证据：`FW\packages\shared\src\level.ts:121` `SOLID_TYPES = {0,1,3,4,8,9,11,-1}` 全按整格实心；`level.ts:99-100` 把类型 2 判为非实心。
- 原版：`init.js:42492-42519` `createGroundShape` 按类型生成楔形：1/-2/11/2/12 = 45° **实心斜坡三角**，3/4 = 半格三角，0/10 = 全格方块。复刻里"上斜坡"变成"撞墙+32px 自动上坎"（见 E3），"走下坡"变成"逐级掉台阶"。`note\forest01-route.md` 里"type2 8 格可穿行"的实测是在复刻自身上做的——循环自证，不构成原版依据。

**E3. 32px 自动上坎被当成"复现斜坡"，实际改写了所有关卡的物理**
- 证据：`FW\packages\shared\src\world.ts:260-279`（撞整格墙自动抬升 32px 通过）；`params.ts:31` 注释自称"原版45°斜坡…以自动上台阶复现"；`mechanics.test.ts:145-154` 把该行为断言为"复现原版斜坡可走性"。
- 原版：类型 0 的整格立方体墙高 32px、无摩擦辅助上步；Box2D 楔形斜坡只存在于类型 1/2/3/4（`init.js:42492-42519`）。复刻玩家可以平地"走"上任何一整格悬崖，原版必须跳——关卡难度、机关时序全变。

**E4. 六个关卡直接解析崩溃：无条件要求 Objects tileset**
- 证据：`FW\packages\shared\src\level.ts:194` `tilesetRef(json,"Objects")` 找不到即 throw。
- 数据实测：forest_03 / 03_1 / 06_1 / 12 / 12_1 等关 tilesets 里没有 Objects.json 引用（只有 Ground+Chars+LargeObjects）。这些关 `parseLevel` 必抛异常；测试只覆盖 forest_02（`kernel.test.ts:18-21`）、客户端锁死 forest_01（见 E14）所以从未暴露。（注：03 报告按全 48 关统计为 7 关崩：forest_03/03_1/06/06_1/12/12_1/26。）

**E5. A 型拉杆（Objects tile local1）被整体忽略：29 处、跨 21 关无任何逻辑**
- 证据：`FW\packages\shared\src\level.ts:258-265` 仅收 local2 进 levers；local1 落入 mechProps 后被 `GameScene.ts:262-287` 丢弃（客户端只画 gid 0/2/4）。
- 数据实测：全 forest+tutorials 中 local1 拉杆 29 个（如 forest_15 gid25、forest_20、forest_21 带独立 startPos 属性的对象）。原版 `init.js:38684-38774` 对 tile1/tile2 一视同仁（仅 onis/startPos 初值不同），MechManager 按组取 OR（`init.js:43296-43301`）。凡以 A 型拉杆为唯一开关的机关链在复刻中永不动作。

**E6. 拉杆"0.6s 冷却 + 站柱自动再翻转"是凭空机制，原版做不到**
- 证据：`world.ts:148-163`（接触中央 10px 柱即翻转 + 冷却期内可再触发）；`params.ts:33`；`note\forest01-route.md` 记载的"站柱上会再翻转"现象。
- 原版：拉杆是 revolute joint，触发 = 杆体角度越过限位（`init.js:38729-38731` 限位 ±0.2π；`38748-38753` `checkState` 按角度×onis 判定）。杆翻过去后物理倾斜，玩家"站着不碰杆"不会让它二次翻转；复刻的柱体 AABB 接触判定把"跑过杆顶"变成了"踩着杆反复抽搐"。冷却 0.6s 无任何原版对应物。

**E7. 运动平台速度比原版慢 4 倍（16 vs 64 px/s）**
- 证据：`FW\packages\shared\src\params.ts:29` `platformSpeed=16`，注释"motorSpeed=0.5m/s×32"。
- 原版：0.5 只是创建时常量（`init.js:39267-39276`），进入运动后 `updateState` 每步 `SetMotorSpeed(±2)`（`init.js:39316-39322`）= 2m/s = 64px/s（AS3 源码 `level.as` 的 `SetMotorSpeed(±2)` 独立佐证，见 04）。原版 64px 行程约 1s，复刻 4s——依赖平台穿越时序的关卡（尤其 speed 类型关）节奏整体不成立。

**E8. 跳触发模型错：按住 up 会落地自动连跳，原版是按键边沿触发**
- 证据：`world.ts:249-256`（up 持续时 jumpBuf 保持上膛 + coyote 组合 → 一接地即再跳）。
- 原版：`init.js:43124-43149` 有 `prohibitJump` 标志，必须松开再按才允许下一次跳。复刻允许"按住跳键自动连跳"，速通/机关时序行为不同。

**E9. 液体致死判据错：全身 AABB 相交即死，原版只有"脚部探头入液面下 ≥0.18m"才死**
- 证据：`world.ts:313-321` + `413-433`（身体矩形与液体格 inset 4px 相交即死）。
- 原版：致死判定经 feet sensor（`init.js:42980-42998` 按 tile 5/6/7 分角色），kill fixture 仅覆盖液面下 −0.18…−1.0m（`init.js:38941-38953`）。原版跳越液池身体扫到液面不致死，复刻擦液面即死；绿液"即死双方"（`world.ts:425`）与 `init.js:42980` 一致，这点正确。

**E10. 门的判定与结算：站进 64×64 全区 ±12px 容差即胜，原版只有门口 64×8 底带 + 门动画扫帧到位才算**
- 证据：`world.ts:337-343`（atDoor = 中心 x 在门区、脚 y ±doorTolerance=12）、`world.ts:357-361`（同帧双方 atDoor 立即 finished）；`params.ts:27`。
- 原版：Door 传感器 = 64×8 贴地带（`init.js:38438-38445`）；`isUp` 依赖手动逐帧扫到第 21 帧（`init.js:38466-38479`、`45073`）；通过后还有 `animateFinish` 楼梯动画 1.6s 才进结算（`init.js:45077-45091`）。复刻在"门还在动画途中"甚至人只贴门边时即可判胜；门关闭时也只 snap 帧（`GameScene.ts:583-592`），原版是反向逐帧。

**E11. 推箱：全场只读 1 个，且推挤/压板模型偏离原版物理**
- 证据：`level.ts:188-204` 与 `world.ts:76-79` 只 `find(gid===4)` 单箱；箱推为瞬时位移式（`world.ts:280-294`、`371-380`）；按钮板按"矩形重叠"判定（`world.ts:165-186`）。
- 数据实测：box 共 42 个，多箱关大量存在（13/13_1 各 4、24_1×2、30×3、bonus_2×18）——其余箱子直接消失。原版 Pusher 是 prismatic joint 梯形箱体，压板判定 = 位移 >0.2m 瞬间（`init.js:39854-39930`）；Box 是可真实堆叠/受撞击的动力学刚体（`init.js:38253`）。复刻"人贴箱即推走、箱重叠板即触发"，挤死/叠箱/惯性推距全变。

**E12. 水平移动模型错：瞬时设定 ±272 或 0，原版是力驱动的加速/惯性/滑行**
- 证据：`world.ts:238-246`（`pl.vx = ±moveSpeed` 硬设）。
- 原版：runForce 50/floatForce 30、`currentRunForce` 渐增、`absoluteMaxSpeed` 矢量钳制、空中控制减弱（`init.js:43061-43160`）。复刻起步/急停零惯性，斜坡滑行、跳越投放距离、推箱动量全部不等价；`params.ts:12` 的 272 换算本身没错，错在物理模型类别。

**E13. 服务器机关状态未同步：拉杆 on/按钮 pressed/平台 target 不在 state 里**
- 证据：`FW\packages\server\src\rooms\state.ts:66-85`（无 lever/plate/target 字段）、`ForestRoom.ts:144-183`（只同步 players/diamonds/platforms 坐标/box）。
- 后果：客户端拉杆贴图恒静态角度（`GameScene.ts:281-283`），按钮按下无表现；违反 PLAN §5.3"任何影响玩法的状态都必须服务端权威并进快照"——属工程自设约束未达成（确定实现缺口）。

**E14. 关卡特化/流程硬编码：单关闭环**
- 证据：`FW\packages\client\src\main.ts:18` `LEVEL_ID="forest_01"` 写死；`main.ts:27-48` 只从 `data/tutorials/levels/` 拉取（server 的 `LEVEL_DIRS` 却先搜 `data/forest/`，两端路径规则不一致，forest 正片关卡拿不到）；服务器无选关/换关消息。整个工程是"为 forest_01 通关"特化：E3 的自动上坎被 route 笔记当作正解路径、E6 冷却参数按该关手感调、E11 单箱恰好覆盖该关、E10 同帧判胜掩盖门扫帧缺失。

**E15. 计时与开局流程：房间创建即 phase=playing，计时先于玩家加入**
- 证据：`ForestRoom.ts:45-46`、world timer 从首步起累计。
- 原版：双人就绪后 `startLevel` 延时约 2s 才开钟并解冻物理（`init.js:44867-44913`，`_.delay(1600+400)` 后 `ui.clock.start()`）。复刻单人挂机计时照跑、成绩口径与原版不可比（0.2.0 只核对了"正计时"方向，方向对、起点错）。

**E16. 输入键位模型与引导文案错**
- 证据：`FW\packages\client\src\input.ts:7-10,46-57`（方向键+WASD 两组永远都生效，不区分角色）；`main.ts:122` 界面文案。
- 原版：按角色分键——水女孩默认 WASD/另一人方向键（`init.js:42786-42788` CharCursors），另有触屏左/右/上三键（`42566-42610`）与 single 模式切换（`45035-45066`）。复刻允许任意浏览器用任意一组键控制自己角色、无触屏，且"两组键通吃"与文案暗示不符。另外 input 只在"变化即发"（`input.ts:53`），违反 PLAN §5.2 自订"≥15Hz 重发+seq"（WS 可靠传输下影响有限，但属工程自我矛盾）。

**E17. 钻石：判定半径夸大 + 计数口径错**
- 证据：`params.ts:35` `diamondRadius=40`；`world.ts:323-335` 欧氏圆判定；`GameScene.ts:732-742` `countCollected` 把 fbwg/银钻同时计入红、蓝两栏。
- 原版：Diamond 传感器 0.7m≈22.4px 方形（`init.js:38355`），eligibility 分色（`38372`）；结算普通钻双人合并计数、银钻单列（`init.js:45096`、`45029` `totalDiamonds` 不含 silver）。复刻半径虚大体征"人形碰撞体做错后用奖励半径找补"，HUD 双计银钻毁掉完美判定展示。

**E18. 角色碰撞体尺寸注释失实**
- 证据：`params.ts:20-21` playerW=26 / playerH=56，注释"官方角色约56px高"。
- 原版：物理 fixture 实际 ≈30.7×41.6px（`init.js:42966-42971`：r1=0.48m、y1=0.2m、y2=−0.9m、r2=0.2m、ptm=32；56px 是美术高度不是碰撞高度）。复刻碰撞体比原版高 14px、窄 5px；且原版脚底是圆弧（feet circle），复刻是直角 AABB，台阶边缘行为不同。配合 E1/E2/E17 形成"参数互相找补"连锁。

**E19. 水女孩下落动画帧数错 + 缺 rising 态**
- 证据：`BootScene.ts:77` water fall 播 0..10。
- 原版：falling 动画帧范围在 `init.js:42920-42934`（fire falling 0..4；water 帧表 11 帧但原版取用子区间不同）；更关键：原版有独立 **rising** 动画与头部倾角旋转（`init.js:42920-42934` + `43203-43214`），复刻 `world.ts:345-354` 只有 idle/jump(离地瞬间)/fall，无上升态——动画状态机与原版不对应。

**E20. 教学文本"静态全显=真实原版"的说法与原版相反**
- 证据：`GameScene.ts:435-449`（一次性全显）+ `note\handoff.md` 相关声明；`level.ts:284-289` 在 keyboard/single/dual 间挑一份。
- 原版：`setupTutorial` 生成文本后置 `visible=false`（`init.js:44755-44784`），运行时按角色 sprite 进入触发矩形做 400ms 淡入/淡出（`init.js:45115-45139`）。"全显静态"是复刻自创；handoff 的"真实原版即静态"结论无 bundle 依据（8099 页面被 mod 过才是渐进的——方向说反了）。

## 二、经验臆断（数值/说法无原版出处或属"伪实证"）——按影响排序

**G1. `params.ts:16,18` coyoteTime=0.09s、jumpBufferTime=0.12s** —— 原版物理不存在这两个概念（跳的准入 = `prohibitJump` 边沿 + 地面 contact）；现代平台手感默认值移植，支撑了 E8 的错误触发模型。

**G2. `params.ts:27` doorTolerance=12** —— 原版门传感器是 64×8 固定条（`init.js:38438-38445`），无"容差"参数；12px 纯调参。

**G3. `params.ts:25` respawnDelay=1.1s** —— 见 E1，原版无对应物；设计选择而非复刻。

**G4. `params.ts:23` liquidInset=4** —— 原版液体/致死的水平内缩由 fixture 几何决定（`init.js:38941-38953`），无 4px inset 概念，数值无出处。

**G5. `params.ts:33` leverCooldown=0.6s** —— 见 E6，源头是 `forest01-route.md` 对复刻自身行为的观测，非原版测量。

**G6. `params.ts:35` diamondRadius=40"实测需≥40"** —— 见 E17；"实测"是复刻内核闭环回归，不是对原版测量（原版 22.4px 方传感器）。

**G7. `params.ts:31` stepHeight=32 及"以自动上台阶复现斜坡"的说法** —— 见 E2/E3；`mechanics.test.ts:161` 的"活体实证 jt≈−0.66、state0 高位端精确落位"同样是对复刻内核的自证；且 Objects tile2 的 onis=−1/startPos=1（`assets\tilemaps\tilesets\Objects.json`）意味着原版初态由关节角决定，"出厂默认 OFF"只是结果巧合。

**G8. `level.ts:265` `startOn = o.properties?.startPos===1`** —— Tiled 数据里 tile 默认属性（onis/startPos）根本不在关卡 JSON 对象上，由原版运行时 `parseMapPropper` 从 tileset 合并（`init.js:44726-44753`）。复刻读对象属性=永远读不到 → 逻辑死码；仅少数对象自带 startPos 的关（forest_21）侥幸生效。

**G9. `level.ts:4-18` 文件头注释陈旧失实** —— `level.ts:10`"若反了对调常量再试"（handoff 同调）：实际映射已验证正确（Ground tileset 5/6/7 + `init.js:42980-42998`），注释仍留不确定口径；`level.ts:15-16`"gid=24 拉杆、其余 M3 忽略"与实现（local 2 / 已支持 0/4）不一致；`level.ts:41-44` startOn 口径同 G8。

**G10. `world.ts:154` 拉杆"post = 中央 10px 柱"** —— 原版杆体 fixture 是 `SetAsOrientedBox(0.15m, 0.7m, 中心偏移 0.55m)`（`init.js:38715`）≈ 9.6×44.8px 且铰接偏转，不是"中央 10px 静态柱"；柱模型是把 joint 抽象成 AABB 的手工拟合。

**G11. `GameScene.ts:27` `FEET_TO_CENTER=Math.round((28.8*PLAYER_SCALE)/0.95)`** —— 乘再除 PLAYER_SCALE 的循环推导，28.8 来源注释未给（原版 sprite/身体偏移由锚点与 fixture y 决定，`init.js:42966-42971`、`43000+`）；handoff 里叫"headLift"的旧口径已改名但推导未重审。

**G12. `GameScene.ts:374-432` 装饰"mulberry32(0x5eedfa) 复刻原版分布"** —— 原版 decorate 用固定种子 `seedrandom("ASDFA")`、7×7 检查窗含纵向与 `"1"===w` 的朝向特殊分支（`init.js:42305`、`42357`、`42381-42403`、`42416`）；navies 帧随机 1..4、缩放随机且仅 `useDust` 时投放（`init.js:44816-44819`）。复刻改成横向窗口+新种子+固定数量——"复刻分布"说法无依据。

**G13. `GameScene.ts:480-489` 之前：常驻 18 颗浮尘粒子** —— 原版 dust 层仅在关卡存在 beamer 时 `fillDustLayer`（密度 width/10 ≈ 130 颗，且只在光束 mask 内可见、低帧率销毁，`init.js:44820-44825`、`45004-45009`、`45141-45152`）。全 forest+tutorials 实测 beamer 使用数 = **0** → 原版森林任何关卡都无浮尘；复刻漂浮尘埃纯属臆造氛围层。（原版真正的悬浮物是 Navies 用 MenuAssets `Navy0000` 帧，见 03/01 §4.4。）

**G14. `GameScene.ts:480-489` 时钟初始显示 "02:00"** —— 原版时钟只显示真实经过秒数（`init.js:45097` `getElapsedSeconds`），无占位值；小但属"看起来像原版"的自设。

**G15. `release\0.1.0.md` 把"液体下半格实心/世界封底"自我批判为魔改** —— 经比对，这两处**恰好与原版一致**：液体下半格实体+侧壁是原版 `convertTilemap` 本体行为（`init.js:42253-42278`），世界四壁对应 `setBounds(−100…)`（`init.js:42171`）。笔记把它们与真正的魔改（E3 自动上坎、E6 拉杆冷却、E17 半径 40、E1 复活）混为一谈，属"批判错了对象"；`kernel.test.ts:137-161、163-172` 的断言方向反而是对的。

## 三、缺失功能（原版有、复刻无；按 forest+tutorials 39 关实测出现次数排序）

**M1. 风/wind 区（33 处）** —— Objects tile15 与 LargeObjects loc2 两种载体，属性 `initialState/length/rotation`（实测如 forest_03 `gid26 rot=-90 64×96 initialState:1 length:15`）；原版 `MechManager classNames`（`init.js:43305-43326`）有完整实现。复刻 `level.ts` 直接丢弃 → forest_03/03_1/14/15/16/20/26 等 speed 关的关键通路不存在。

**M2. 球 ball（20 处，Objects tile10）** —— 原版可滚动圆形刚体机关（`init.js:43305-43326` Ball）；复刻 mechProps 收下后无任何逻辑/渲染（forest_20 等关可见但"不存在"）。

**M3. 重箱 boxheavy（17 处，tile13）** —— 原版 `BoxHeavy`（`init.js:38273`，密度/摩擦不同，推法不同）；复刻不识别 gid，即便识别也受 E11 单箱限制。

**M4. A 型拉杆 leverA tile1（29 处/21 关）** —— 同 E5：21 个关卡的开关链整条失效。

**M5. 多实体同型机关** —— 第 2 个及以后的 box/pusher/lever 全部被忽略（box 42 实有 vs 复刻 1；`level.ts:76-79`、`world.ts:76-79`）。

**M6. 平台变体：旋转与跷跷板** —— `type=platform` 对象中 rotation≠0 的 2 处（复刻不 SetAngle、包围盒按轴对齐）；**dtheta 旋转平台/跷跷板 14 处**（props 键 `dtheta/offsetY`，原版绕点转）被复刻当直线往复（`level.ts:234-246` 只读 dx,dy）；group 两位数（实测至 51）时原版取首字符定色（`init.js:37915`），复刻 `GameScene.ts:29-31` 精确键表退白。垂直电梯的 swap+−90°（`init.js:39232-39234`）footprint 恰等价，此点不算错。

**M7. pulley(11)/hanging(20)/roman(6)/window(2) 类 type 对象（非 gid、点/多边形）** —— 复刻只解析 gid 对象与 `type=platform`，其余静默丢弃（`level.ts:142-147,233+`）；forest_12 一类关只剩地形。原版 `MechManager classNames` 均有类。

**M8. 银钻/双人共取钻的结算体系** —— 复刻 `GameScene.ts:732-742` 双计（E17），且原版银钻独立统计、`requirePerfects/wing`、`levelState` 记录链（`init.js:45093-45102`）整体不存在。

**M9. 通关演出** —— 楼梯爬升动画（atlas stairs 30 帧×2、`BootScene.ts:79` 定义后**从未播放**）、`animateFinish` 1.6s 定格+finish 音乐（`init.js:45077-45091`）、死亡 smoke 45 帧、门双向逐帧扫（E10）——复刻全部缺席。

**M10. 音效** —— Lever 音效文件已加载但无播放点（`BootScene` sfx_lever、`ForestRoom` 广播的 lever 事件客户端无消费）；原版有 Lever 声、Platform 电机声（`init.js:39225+` sounds）、水声 waterSteps（`init.js:42980-42998`）、液体扑通（WaterBox/FireBox `38981+`）。

**M11. 暂停/菜单/系统层** —— P 键暂停（`init.js:44830-44831`、`44915-44922`）、IngameMenu/设置/静音、选关星图（temple.json 46 节点+edges+解锁/完美进度）、存档与最佳时间、single 双人同机模式、触屏三键（`42566-42610`）、滚轮/捏合缩放（CameraManager `init.js:43348-43477`）——复刻仅固定全景画面（有意偏离）与单房间流程。

**M12. 范围外但需点名**：dark 关光照（`init.js:44966-45003`）、beamer/rotmirror/infinitemirror/boxmirror/lightpusher/timedpusher、portal+portalId（`init.js:45014` `connectPortals`）、type55 冰冻液（`init.js:38880` startFrozen）——在 forest+tutorials 实测出现数 **0**（属后续神殿系统），对"复刻森林"目标不构成关卡缺口，但 `init.js` 均真实存在，列入备查。

## 附 · 已核验"与原版一致"的关键项（勿再误伤）

gravity 1000（`init.js:44813`）、ptmRatio 32（`44806`）、LIQUID_TILE 5/6/7 映射（Ground tileset + `init.js:42980-42998`；handoff"对调再试"已被证实**无需对调**）、Chars local 0-7 语义（tileset + `init.js:45016-45031`）、Objects local 0/2/4 = pusher/leverB/box、平台终点 `def−(dx·32,dy·32)`、液体下半格实体+围壁、世界四壁、时钟正计时、绿液必死、水/岩浆按角色免死、跳跃冲量 496 与 moveSpeed 272 的数值换算（模型类别除外，见 E12）。

## 总评

复刻并非"参数偏差"，而是四层系统性偏离——
1. **物理内核**从 Box2D 刚体/关节换成自写 AABB 运动学（E2/E3/E8/E9/E11/E12 全部由此派生）；
2. **机关解析按"forest_01 够用"裁剪**（E4/E5/M1-M7）；
3. **胜负与死亡流程重写**（E1/E10/E15）；
4. **大量"实测/活体实证"注释是对复刻自身的回归观测冒充原版依据**（G1-G13）。
