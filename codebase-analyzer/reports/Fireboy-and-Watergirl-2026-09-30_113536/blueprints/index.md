# Skill Blueprint 索引

| # | Blueprint | 组件 | AI 等级 | 优先级 | 文件 |
|---|-----------|------|---------|--------|------|
| 1 | resource-list-auditor | 资源清单完整性审计（替代人工目检） | 🤖 完全 AI 化（26/30） | 🥇 Quick Win | [01-resource-list-auditor.md](01-resource-list-auditor.md) |
| 2 | downloader-hardening | 批量下载器加固（超时/重试/失败清单） | 🧑‍💻 AI 辅助（22/30） | 🥈 Strategic | [02-downloader-hardening.md](02-downloader-hardening.md) |
| 3 | portal-page-generator | 门户页生成与链接校对 | 🤖 完全 AI 化（24/30） | 🥇 Quick Win | [03-portal-page-generator.md](03-portal-page-generator.md) |
| 4 | deployment-guardian | 部署巡检（Pages 状态/404/README 一致性） | 🤖 完全 AI 化（27/30） | 🥇 Quick Win | [04-deployment-guardian.md](04-deployment-guardian.md) |
| 5 | multiplayer-stabilizer | 多人补丁修复与双实现合并 | 🧑‍💻 AI 辅助（17/30） | 🥇+🥈 混合 | [05-multiplayer-stabilizer.md](05-multiplayer-stabilizer.md) |

## 实施路线图

### 立即实施（Quick Win）

1. **部署巡检守护器**（[04](04-deployment-guardian.md)）——纯只读零风险；当前 Pages 构建已 errored 87 天、线上多人补丁 404，首次运行即可量化全部损失。
2. **资源清单审计器**（[01](01-resource-list-auditor.md)）——纯只读；验收基线为复现"6 代全缺 manifest/图标"的已知缺口。
3. **门户页生成校对器**（[03](03-portal-page-generator.md)）——低风险；根除历史上一连三修的链接类 bug。
4. **多人补丁路径修复**（[05](05-multiplayer-stabilizer.md) 的 Quick Win 部分）——一行 diff 恢复线上双人功能。

### 规划实施（Strategic）

5. **下载器加固器**（[02](02-downloader-hardening.md)）——补丁式改造，人工审查网络行为参数后落地。
6. **多人补丁合并**（[05](05-multiplayer-stabilizer.md) 的 Strategic 部分）——建议以 netlib 版为主体合并，必须双人真机验证。

### 逐步推进（Incremental，暂无 Blueprint）

- 关卡 Tiled JSON schema 校验工具（04 报告模块 10）。
- har/ 目录瘦身（6 个 HAR 共约 156MB 入库，考虑 LFS 或抓后即删）。

---

> 每个 Blueprint 文件包含了创建对应 Skill 所需的完整设计规格。
> 使用 `skill-for-skills` 加载对应 Blueprint 文件即可生成标准 SKILL.md。
