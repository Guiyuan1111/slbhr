# 10 · 对照原版差距分析（2026-10-06 审计）

> 全量证据（bundle 行号/temple.json 实测/我方现状）由差距审计产出；本档收录结论与处置。
> 基线确认：既有"已复刻"清单全部属实；另证 i18n（原版仅 ch 单字典）与存档导出（原版无 UI）为原版也没有的项。

## 本轮已修复（0.3.14）

| # | 缺口 | 原证据 | 处置 |
|---|---|---|---|
| P0-1 | 菜单三图未加载（TempleHall/Beam/GameName 全项目无 load.image，缺纹理静默空白） | BootScene 全文无 load.image | BootScene 补三行 ✓ |
| P0-2 | 进度保存零调用（saveBest 全项目 0 call site → 选关解锁永不推进） | progress.ts:21 | main.ts won 分支接通 ✓ |
| P0-3 | 限时数据断链（LevelData 无 time 字段 → timeLimitSec 恒 0 → 星级恒≤2） | main.ts:206 旧写法 | 改从 temple.json entry 取 ✓ |
| P1-4 | puzzle 关（14 关）星级口径错误（不收银钻也能 1 星推进） | bundle:52388 | puzzle=银钻>0?3:0、不收不保存 ✓ |
| P1-5 | 双结算板并存（GameScene 世界板 + EndMenu 场景板口径不一） | 两套触发链 | showFinishBoard 退役，收敛一块 ✓ |
| P1-6 | BGM 四件套缺失（MenuMusic/LevelMusicOver/speed 双曲）+ EndDiamond + Wind 循环声 | bundle:26385/43004/44619 | 全部加载接线 ✓ |
| P2-14 | 教学层变体取错（dual 文案 vs 桌面 keyboard 文案） | bundle:44756 | keyboard 层优先 ✓ |

## 剩余缺口（按优先级，成本 S/M/L）

### 高感知（下轮候选）
1. **SettingsMenu**（音乐/音效开关持久化，bundle:43824-43920；入口=大厅左下齿轮）——M，与 MenuMusic 联动。
2. **gameComplete 彩带**（全 48 关 3 星 → Confetti 雨 + 恭喜弹窗，bundle:45679）——S-M。

### 中感知
3. **CreditsMenu**（右上"?"，bundle:45885）——S。
4. **移动端触控**（TouchButton 三键 + mobileTime 时限，bundle:42566）——M，视用户群。
5. **单机同屏模式**（CursorToggle 切换 + CharCursors，bundle:45035）——M-L，先做产品决定。

### 低优先/森林不适用（备查）
- SoftLockMenu（required 全 0 永不触发）、雪花 Snow（森林 0 使用）、dark 关遮罩（森林无 dark 关）、
  其余神庙机关音（Freeze/Melt/Slider/Portal 等 11 音）、门开持续音细节、音频按关动态裁剪。

### 联机特有偏离（设计决定，非缺口，供确认）
- 本机暂停=服务端继续（原版=物理冻结）；gameover 2.5s 自动重开（原版静置等点击）；
  教学触发主体=本机角色；两组键通吃本机角色；无"交换出生点"。

### 音频差距总表
原版 33 音 vs 我方 13 键：0.3.14 后我方 19 键（补 MenuMusic/Over/speed×2/Wind/EndDiamond）；
森林会用的已全齐。缺 2（单机 CharToggle1/2）+ 11（其他神庙）+ dark 1——随对应功能补。
