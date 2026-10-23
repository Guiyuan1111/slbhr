# 07 — CI Actions 版本升级证据（消弭 Node20 运行时弃用提示）

- 日期：2026-10-23
- 槽位：槽 4（预处理备料）
- 关联：note/audit/2026-10-21-code-audit/04-fix-log.md §3（"仅有 actions/checkout@v4/setup-node@v4 的 Node 20 运行时弃用提示"）
- 变更对象：`.github/workflows/ci.yml`（仓库根）

## 1. latest 版本实查（gh CLI，2026-10-23）

命令：

```bash
gh api repos/actions/checkout/releases/latest --jq .tag_name
gh api repos/actions/setup-node/releases/latest --jq .tag_name
```

输出（原样）：

```
v7.0.1
---
v7.1.0
```

| 动作 | latest tag | latest 主版本 | 结论 |
| --- | --- | --- | --- |
| actions/checkout | v7.0.1 | 7 | v4 → v7 |
| actions/setup-node | v7.1.0 | 7 | v4 → v7 |

两者 latest 均已越过 v4，按主版本 tag 升级至 `@v7`。

## 2. 变更 diff 摘要

`git diff --stat`：

```
 .github/workflows/ci.yml | 8 ++++----
 1 file changed, 4 insertions(+), 4 deletions(-)
```

仅改 4 行 uses（两个 job `typecheck-test-build` / `determinism` 各 2 行）：

- `actions/checkout@v4` → `actions/checkout@v7`（2 处）
- `actions/setup-node@v4` → `actions/setup-node@v7`（2 处）

其余一律未动：`node-version: 22.x`、`cache: npm`、`cache-dependency-path`、`working-directory: gyのFW`、job 结构、触发 paths。

## 3. 语法校验

本机 node 存在 js-yaml，直接用其校验：

```bash
node -e "const y=require('js-yaml'),f=require('fs');y.load(f.readFileSync('.github/workflows/ci.yml','utf8'));console.log('YAML parse OK')"
# 输出：YAML parse OK
```

## 4. CI 实跑验证

CI 实跑验证由主会话推送后 `gh run watch` 完成（本槽不 push）。

## 5. 红线自检

- 只改 `.github/workflows/ci.yml` 的 uses 行 + 新增本说明档，未动 gyのFW/ 下任何文件。
- git add 仅限 ci.yml 与本档，未使用 `git add -A`；commit 无 co-author。
