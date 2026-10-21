# 03 · 低危、代码卫生与误报纠正

## §1 低危与代码卫生

| 项 | 证据 | 处理 |
|---|---|---|
| `params.ts` 配置常量与内核实际使用的 `CHAR` 脱节 | `packages/shared/src/params.ts:1` 仅被 `index.ts` 再导出；内核用 `kernel/character.ts:25` 自己的常量 | 加“非内核配置/勿据此调参”说明，或后续删除；本次先标明边界 |
| `finishLayer`/`showFinishBoard` 等未完成链路 | `GameScene.ts:248`、`:2078-2081`；`templeTimeSec` 只写不读 | 记录为死代码；本次不删除，避免扰动结算链 |
| 关卡数据两套加载路径 | `templeData.ts` 与 `TempleScene.ts:54` 的 Phaser loader | 记录；本次只修失败重试，不强行统一 |
| oracle 根目录硬编码 | `scripts/e2e/oracle/lib.mjs:20` `/home/gy/桌面/dev/...` | 加 `ORACLE_ROOT` 环境变量覆盖，保留旧默认 |
| `/api/level/:id` 泄漏异常文本 | `packages/server/src/index.ts:69-71` `String(err)` | 服务端记录完整错误，响应返回通用 500 文案 |
| 环境变量无范围校验 | `ForestRoom.ts:33-35` `Number(FW_PATCH_MS/FW_RECONNECT_SECONDS)` | 加有限值与区间回退 |
| `sfx_end_fail` 装载未播放、`[phase]` 日志 | `audio.ts` 键表；`ForestRoom.ts` 相位日志 | 保留（日志是 e2e 锚点）；音频键暂不清理 |
| release note 与 README/lock 不一致 | `note/release/0.3.40.md`、`README.md:5`、`package-lock.json:3928-3938` | 随本次版本收口修正 |

## §2 误报与需要修正的代理结论

1. **`currentRunForce` 首次为 `undefined` 不是 NaN 物理损坏。** `kernel/character.ts:48` 与 `:186` 确实会算出 NaN 的 `i.x`，但 `:252-253` 的 `i.x > 0` / `i.x < 0` 对 NaN 均为 false，不会调用 `ApplyForce`；与 `params.ts:52` 记载的“首次按方向键不发力，先松键初始化”一致。**这是刻意保真，不是缺陷**；但类型与非空断言让意图不清晰，建议后续显式建模。
2. **实例级 `onAuth` 不是“密码校验被完全绕过”。** Colyseus matchmaking 确实忽略实例级方法并打印警告，但 `Room._onJoin` 会调用它（`Room.js:533-535`），密码仍会校验。真实问题是“先占座后鉴权 + 无速率限制”，不是鉴权失效。
3. **`roles.size` 不包含预留座位。** `roles` 只在 `onJoin` 里写入（`ForestRoom.ts:251-257`），预留座位不会让它提前变成 2；相关代理结论不成立。
4. **门禁数字本身是真实的。** 0.3.40 release note 的 typecheck/vitest/det 结果与实测一致；但“版本一致性已统一”与事实不符（见 M7）。门禁能证明内核/服务端主路径，不能证明客户端会话生命周期。
