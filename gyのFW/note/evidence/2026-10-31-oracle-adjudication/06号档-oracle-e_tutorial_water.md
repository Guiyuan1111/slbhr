# 06号档 · oracle e_tutorial_water 通关可达性终审（fw-oracle-etwater 槽，2026-11-01）

槽位：fw-oracle-etwater。仓库根 `/home/gy/桌面/dev/slbhr`，分支 `release/1.0-forest`（未切未推）。
对象：oracle 快照 `Fireboy-and-Watergirl/output/E/`（全程只读），关卡 `data/tutorials/levels/tutorial_water.json`（water 庙 level 0，`required:0, unlock_key:'free'`，无前置解锁）。
方法：本地静态伺服 :8877（GET/HEAD only，ROOT=output/E）+ headless chromium 页内探针（playwright；`plugin.update` 帧劫持、页内 `{isDown}` 标志驱动真实输入、Box2D fixture 世界顶点倾倒）。
文件域：本档、`tools/etw-*`、`TEMP/fw-oetw-1/`（收尾清理）。
铁律：禁编造；凡结论均附探针 case 与数字；探不到如实写探不到。

> **本档为骨架占位，探针批次进行中逐节补全。**

## 0. 一句话终判

（待探针收敛后填写）

## 1. 数据同一性与实测环境

- 关卡数据同一性：`md5 oracle/output/E/data/tutorials/levels/tutorial_water.json == md5 gyのFW/data/tutorials/levels/e_tutorial_water.json == b5ff878bd5e570c34d3580954c9ca1c9`（cmp 逐字节相等，2026-11-01 实测）。
- 端口核查：8870-8899 全段 `ss -tlnp` 零监听后选定 8877（避免并发槽撞号）。
- （运行时权威数待 §dump 探针补全）

## 2. 静态几何与机关

（待 dump 探针补全）

## 3. 逐项裁决

（待行为探针补全）

## 4. 终判与对照

（待补全）

## 5. 复现

（待补全）
