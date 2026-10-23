# 联机面板残留主菜单 + 胶囊标签悬空 —— 2026-10-23

用户报告：从关卡页（Temple）返回后联机界面仍存在，且文本位置有问题。

## 根因（两项，均在联机自有层——oracle 无对应物）

1. 面板残留：联机面板（DOM #menu）只在选关流程（TempleScene 点关卡 → registry
   onLevelPicked → 显示）与 ?level= 深链开机两条路径打开，但 TempleScene「返回」钮
   （→Menu）从不收起它 → 面板连着已选关卡胶囊一起带到主菜单，整体压住画布主菜单
   （GameName 标题 y288 / 开始游戏钮 y513），双标题错位观感即用户所指"文本位置"。
2. 胶囊悬空：#menu-level CSS absolute right:-34px top:-58px 漂在面板边框外右上，
   无锚点悬空（DOM 位本就在 panel 首行）。

## 修复

- TempleScene 返回钮 fadeSwitch ops 内调 registry "onBackToMenu"（main.ts 注册，
  与 onLevelPicked 同构，DOM 仍归 main.ts 管）→ 隐藏 #menu。
- #menu-level 去 absolute，display:table + margin:0 auto 10px 收缩居中为面板内首行徽标。

## 亲验（真局探针，复现→修复→复跑）

- 复现：进房→暂停返回菜单(Temple)→选关(面板开)→Temple 返回→Menu，#menu hidden=false（残留实锤）。
- 修复后同链路：#menu hidden=true、#hud hidden=true。
- 深链开机面板不受影响（?level= 下 #menu 可见）；胶囊盒 (543,271,194×33) 落面板
  (99,223,1082×642) 内顶部、水平恰以屏心 640 对称。

## 门禁

tsc 0 / vitest 219 / build ✓ / e2e leave 3/3 + pause 11/11（改后复跑）。

## 观察项（不动）

- 加入方离房后 #roomcode 输入框残留旧房间码：死码点击加入已有明确报错引导（"房间不存在…"
  文案），暂不清（清了会伤及"改一字符重试"的容错）。
- 深链 ?level= 开机时面板仍浮于主菜单之上（设计如此：跳过画布选关直达建房）。
