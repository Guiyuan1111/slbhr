# deploy/ — 部署运维配置样例（I-01）

**可选，按需部署。** 项目定位：两人私下游玩，服务器默认只绑 `127.0.0.1`，不分发不上线。
日常游玩用根目录 `start.bat` / `start.sh`（或 LAN 真机 `start-lan.*`）即可；本目录只服务
于"想长期挂着跑"的场景。未部署前这些文件不产生任何效果。

## 文件

- `fw.service`：systemd 单元样例（`Restart=always`、SIGTERM 优雅停机、日志走 journald）。
- `DEPLOY.md`：云服务器（VPS）完整部署手册——选购要点、deploy key 拉取、构建、
  公网暴露（直连/反代二选一）、systemd 常驻、更新流程与故障排查。

## 长期运行最小步骤（Ubuntu）

```bash
npm ci            # 或 npm ci --omit=dev（tsx 已在 dependencies，可跑 npm start）
npm run build     # 出 packages/client/dist 静态产物（必须先于 omit=dev 剪枝）
sudo cp deploy/fw.service /etc/systemd/system/   # 按需改 User/WorkingDirectory/ExecStart
sudo systemctl daemon-reload && sudo systemctl enable --now fw
curl -s http://127.0.0.1:2567/healthz   # → {"ok":true,...}
journalctl -u fw -f                     # 跟日志
```

## 语义说明（M-05 复核结论）

- **SIGTERM 优雅停机**：colyseus 0.16 `Server` 默认 `gracefullyShutdown: true`，收到
  SIGINT/SIGTERM/SIGUSR2 会回收全部房间（触发各房 `onDispose`）、关 httpServer 并退出，
  实测端口随退随释放；服务端另挂 `onShutdown` 日志钩子便于 journald 观测。
  systemd `stop` / `restart` / 部署新版本直接用即可，无需额外进程管理器（PM2 等不必上）。
- **健康检查**：`GET /healthz` → 200 `{"ok":true,"uptime":N}`，零鉴权，仅探进程活性。
- **日志轮转**：生产日志走 journald，轮转由 journald 自身配置负责（`/etc/systemd/journald.conf`
  的 `SystemMaxUse` 等），无需 logrotate。开发期 `TEMP/*.log` 为临时诊断产物，不轮转、
  可随手清。
- **崩溃自动拉起**：systemd `Restart=always` + `RestartSec=3`。

## 若要局域网/公网暴露（谨慎）

- 局域网：`FW_HOST=0.0.0.0`（`start-lan.*` 或改 unit 的 Environment）。仅限可信网络。
- 公网：**必须**前置 Nginx/Caddy 做 TLS 与 WebSocket 升级转发（`/` 与 `/matchmake` 均走
  同端口），并自行加访问控制；默认只绑 `127.0.0.1`，勿明文直连公网。服务端已有房间密码
  （4-64 位强制，且在座位预约前于 matchmaking 层比对 #48）与 matchmaking IP 固定窗口限流，
  但密码不是访问控制替代品（历史上曾存在绕过缺陷 #28、限流 key 可伪造缺陷 #21，已于
  0.3.48 修复；先占座后鉴权的锁房 DoS #48 与 XFF 首项伪造面 #48-B，已于 0.3.51 修复）——
  部署面防护仍由反代与防火墙承担。反代须用覆写式转发头并配 `FW_TRUST_PROXY=1`，
  模板见 `DEPLOY.md` 方式 B；60s 断线重连窗口内反代空闲超时建议 >60s。
