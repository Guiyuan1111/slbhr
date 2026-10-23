# 残留/错位同类问题清查 —— 2026-10-23

用户指令：检查是否有类似问题（联机面板残留主菜单 + 面板坐标未换算两缺陷族）一并修复。

## 排查矩阵与结论

### 族一：DOM/浮层场景残留（修 4 处）

| 路径 | 缺陷 | 修复 |
|---|---|---|
| Temple 返回→Menu | #menu 残留（上一笔 a449d79 已修） | registry onBackToMenu |
| 深链开机(?level=)面板开 + 点开始游戏 | Play 被面板全屏 overlay 拦截（实测 elementFromPoint=DIV），真实 UI 无此路径；防御性修复 | 回调更名 onHideLobby，MenuScene Play 的 fade ops 内调用（转场中开面板也会被换幕收起） |
| 暂停→齿轮开设置→按 P 恢复 | PauseMenu 弹簧滑出关闭，SettingsScene 悬空漂在恢复后的 Game 上 | PauseMenu SHUTDOWN 钩子连带 stop("SettingsScene")（宿主任意关闭路径全覆盖） |
| 暂停/庆典浮层开着按 R 重开（及换关/返回菜单三处转场） | restartWithFade/reloadLevel/leaveToMenu 停场景列表无 SettingsScene/CompleteScene → 悬空到重建后的 Game | 三处列表统一补两场景 |

### 族二：面板 oracle 坐标复核（EndMenu 全过，无需改）

用 1860825 区锚点换算法逐项对 oracle EndMenu 原文（偏移 1873494）：行组 x=−200/行 y=0.5·(−halfH)+{20,100,180}→板内 180.5/260.5/340.5；时限文本 x=m.x−w/2−10、y=m.y+35→(−244,+55)；Continue 中心 (0,halfH−140)→(541,502)；箭头 (5,−60)→(546,261)；星碑 (180,−60)→(721,261)——我方实现逐项一致（2026-10-12 两轮勘误已正确换算）。

### 族三：其他显隐链路核查（无缺陷）

HUD（leaveToMenu 隐藏 ✓）、触屏 DOM（onPhase ready/started 门 ✓）、键盘（setPaused 闸 ✓）、busy 态（onLevelPicked 复位 ✓）、Credits/Complete 自关闭（Ok→stop ✓）、FadeScene 重入（fading 门 ✓）。

## 亲验（真局探针）

- P 恢复：暂停+设置→P→弹簧滑出 ~3.5-4.5s（过阻尼爬行，boardY 456→1118 实录）→ scenes=[Game]，Settings 随宿主 SHUTDOWN 一并收起。
- R 重开：暂停+设置→R→Settings/PauseMenu 均不在活动列表；庆典浮层(CompleteScene)开着按 R 同收。
- Play→Temple：单页探针 Temple +700ms 就绪、ops 收面板 hidden=true；面板开时 (640,513) elementFromPoint=DIV（Play 被拦实证，防御路径无真实入口）。
- 探针方法论坑：三页同跑 headless 下游戏循环被饿死，输入/弹簧偶发不推进（步骤2曾伪失败）——单页复验后定性环境伪影，非产品缺陷。

## 门禁

tsc 0 / vitest 219 / build / e2e pause 11 + leave 3 + wonrefresh 6 + deathretry 4（改后复跑全过）。

## 观察项（用户 2026-10-23 裁定：三项均不修，保持现状）

- requestClose 的 1.5s delayedCall 兜底实测未触发（boardY 爬至 ~4s 才由弹簧落位回调停场景）——弹簧是唯一实际关闭者，注释与行为不符，待后续核查 Clock 语义。
- oracle EndMenu Continue 初始 disable()（星动画后才启用），我方 Continue 全程可点——行为差异（非布局/残留族），如需对齐另行裁决。
- 加入方离房后 #roomcode 残留旧码（死码有报错引导，保留容错）。
