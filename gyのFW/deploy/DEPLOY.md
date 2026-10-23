# DEPLOY.md — 云服务器部署手册（VPS · 两人私用）

> 适用：在云服务器（如雨云"云服务器"产品线）上部署 gyのFW，供两人公网联机。
> 项目定位两人私用：勿公开分享服务器地址，勿转公开仓库（assets/ data/ 为官方素材
> 衍生整理，仅限私用）。服务器选购结论先行：**普通"云服务器"产品线，2核2G 起步即可**，
> 不需要游戏云/显卡云/裸金属/虚拟主机/对象存储。

## 0. 选购要点（雨云实际档位，2026-10 查证，随活动浮动）

- **产品线**：云服务器（RCS）。"游戏云"是 MC 等带面板游戏服用的，本项目自起 Node
  服务用不上且更贵；显卡云/裸金属/虚拟主机/对象存储均不对口。
- **配置**：2核2G 足够——服务端 60Hz tick 只算 2 个角色物理，Node+Colyseus 空载
  约 100-200MB；硬盘默认即可；带宽 10M 上行档绰绰有余（游戏流量 KB/s 级，静态首载
  几 MB 且有 brotli/gzip 压缩）。
- **地域**：唯一真正影响手感的选项。60Hz 动作游戏看 RTT：目标 <50ms、最好 <20ms。
  选离两人都近的节点（同城/同省最好）；不建议境外节点（跨境 50-150ms 明显发黏）。
- **计费**：新人首月 5 折；先月付实测延迟，满意再年付（年付约 7 折）。大陆节点 2核2G
  月付约 22-29 元档。
- **备案**：大陆机房用"域名 + 80/443"需备案；本手册默认 `IP:端口` 直连，无需域名、
  无需备案。
- **系统镜像**：Ubuntu 22.04 / 24.04 LTS（纯系统即可，无需宝塔等面板镜像）。

## 1. 服务器初始化（Ubuntu，一次性）

```bash
ssh root@<服务器IP>
apt update && apt -y upgrade
# Node 22 LTS（engines 要求 >=22.12.0，0.3.41 起 vitest 5 需 Node ≥22.12；与 CI 的 node-version 22.x 同口径）
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt -y install nodejs git
node -v   # 应 >= v22.12
```

建议建非 root 用户跑服务（下文以 `fw` 为例）：

```bash
adduser --disabled-password --gecos "" fw
```

## 2. 取代码（私有仓库 → 只读 deploy key）

仓库 `github.com/Guiyuan1111/slbhr` 为私有，VPS 上用只读 deploy key 拉取：

```bash
sudo -iu fw
ssh-keygen -t ed25519 -f ~/.ssh/id_ed25519 -N ""
cat ~/.ssh/id_ed25519.pub
# → GitHub 仓库 Settings → Deploy keys → Add（只读，勿勾 write）
git clone git@github.com:Guiyuan1111/slbhr.git ~/fw && cd ~/fw/gyのFW
```

说明：

- 官方素材与关卡数据（`assets/`、`data/`）**随仓库分发**，clone 即齐，无需搬运。
- 官方原版参考库（oracle）不在仓库内，VPS 上不需要也不应有。
- 玩家进度存浏览器 localStorage（`packages/client/src/progress.ts`），服务端完全
  无状态——换服务器/换节点零迁移、无需备份玩家数据。

## 3. 构建

```bash
npm ci
npm run build          # 出 packages/client/dist（必须先于下一步剪枝）
npm ci --omit=dev      # 剪枝 devDependencies（tsx 在 dependencies，npm start 可用）
```

## 4. 公网暴露（二选一）

服务端是**单端口全包**：express 静态托管（brotli/gzip 协商 + 路径穿越防护）+
关卡 API + `/healthz` + Colyseus WebSocket 全在同一个 `PORT`（默认 2567），
**无需 nginx 也能跑**。

### 方式 A（推荐，直连）

`deploy/fw.service` 按实际修改三处：`User=fw`、
`WorkingDirectory=/home/fw/fw/gyのFW`、`Environment=FW_HOST=0.0.0.0`。
然后防火墙只放行 SSH 和游戏端口：

```bash
ufw allow 22/tcp && ufw allow 2567/tcp && ufw enable
# 雨云面板的防火墙/安全组同样放行 2567/tcp（面板与系统两层都要查）
```

玩家访问 `http://<服务器IP>:2567`。

### 方式 B（可选，TLS 反代）

需要域名 + 备案（大陆节点）。Caddy/Nginx 反代同端口：页面与 `/matchmake` 的
WebSocket upgrade 都要转发，反代空闲超时须 **>60s**（服务端断线重连窗口为 60s，
`FW_RECONNECT_SECONDS` 可调）；此时 `FW_HOST` 保持默认 `127.0.0.1`，仅反代对外。

### 安全取舍（方式 A）

服务端有**房间密码鉴权**：创建时 4-64 位门槛、加入时服务端比对
（`packages/server/src/rooms/ForestRoom.ts:145/:313`）；matchmaking 另有 IP 限流
（60s 固定窗口每 IP 60 次尝试，0.3.41 M5）；无用户体系、无 TLS。
方式 A 为 HTTP 明文传输，两人私用可接受；**房间密码务必设强**（≥12 位混合）。
60s 重连窗口内断线者可凭 session 免密重进，属预期行为。

## 5. systemd 常驻（开机自启/崩溃拉起/优雅停机）

```bash
sudo cp deploy/fw.service /etc/systemd/system/    # 按第 4 步改好后
sudo systemctl daemon-reload
sudo systemctl enable --now fw
curl -s http://127.0.0.1:2567/healthz             # → {"ok":true,"uptime":N}
journalctl -u fw -f                               # 跟日志
```

`Restart=always`（崩了 3s 拉起）、`KillSignal=SIGTERM`（colyseus 优雅停机回收房间，
实测秒级释放端口）、日志走 journald（轮转系统自管）。日常无需 PM2 等进程管理器。

## 6. 联机验证清单

1. 外网浏览器开 `http://<服务器IP>:2567` → 出连接界面。
2. 一人创建房间并设强密码，另一人填 IP + 密码加入。
3. 断线重连：关页面后 60s 内重进应恢复原局面。
4. `curl http://<服务器IP>:2567/healthz` 外网可达。

## 7. 版本更新流程

```bash
sudo -iu fw && cd ~/fw
git pull
cd gyのFW
npm ci && npm run build && npm ci --omit=dev
exit
sudo systemctl restart fw
```

## 8. 故障排查

| 症状 | 排查顺序 |
|---|---|
| 外网不通，本机 `healthz` 正常 | 雨云面板安全组与系统 ufw 两层是否都放行了 2567 |
| 整页打不开 | `systemctl status fw`；`ss -tlnp \| grep 2567` 看端口；`journalctl -u fw -n 50` |
| 页面能开但连不上房间 | 方式 A 是否设了 `FW_HOST=0.0.0.0`；WebSocket 是否被中间层拦 |
| 延迟高 | 换近节点（服务端无状态，直接迁移重建即可） |
| 更新后页面还是旧的 | index.html 为 no-cache 会回源校验，强刷（Ctrl+Shift+R）即可 |
