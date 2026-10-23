# 2026-10-24 局内房间码栏压住计时钟——自动收起改造记档

## 用户报告
截图：局内顶部「你扮演：火娃 / 房间码 / (密码已校验) / 复制邀请链接」DOM 条
常驻顶部中央，压住画布内计时钟（00:10 被遮半截）。

## 方案裁定（AskUserQuestion，用户选「开局后自动收起」）
进关展示几秒（够复制邀请链接）→ 自动淡出让出计时钟；
顶部中央热区悬停唤出（悬停保持、移开 1.2s 收）；I 键显/收。

## 实现
- `#hud-top.away`：opacity 0 + visibility hidden（visibility 延迟 0.45s 翻转，
  淡出播完才失效；visibility 继承使收起后 #btn-invite 不可点，防隐身可点）。
- `#hud-hot`：顶部中央 720×26 热区（#hud 整层 pointer-events:none 下的单点 auto，
  与 #btn-invite 同契约），栏收起后由它唤出。
- main.ts：`hudTopShow(ms)/hudTopHideNow()` 控制器；接线四处——
  enterGame 进关、reloadLevel 换关各展示 6s；复制按钮点击续显 4s（反馈文案 1.5s 可见）；
  热区 mouseenter 显(0=悬停保持)/mouseleave 1.2s 收；I 键显/收（gameStarted 闸，
  菜单输房间码不误触）。won/gameover 的整条隐藏（updateHud `.hidden`）独立，两态叠加互不扰。

## 验收（TEMP/hudbar 探针，7/7）
进关即显示 → 6s 自动收起（visibility hidden）→ 热区悬停唤出（opacity 回升）→
移开 1.2s 收 → I 键唤出 → 再按 I 收；截图：收起态计时钟 00:07 完全无遮挡。
门禁：tsc 0 错；vitest 19 文件 219 用例；build ✓（3.80s）；journey 7/7
（advance 换关后 hud-room 文本读数不受收起态影响——visibility hidden 仍在 DOM）。

## 备注
- 画布内教学文案（关卡数据自带）仍为原版称呼「冰女孩/火男孩」——属 oracle 关卡
  JSON 数据非代码文案，df6a248 只覆盖了代码侧 13 处。**用户 2026-10-24 裁定：保留
  oracle 关卡数据原文，不随代码侧改名（AskUserQuestion 在案）。**
- 探针 TEMP/hudbar 收尾已清理。
