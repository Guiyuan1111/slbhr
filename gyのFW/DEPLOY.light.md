# gyのFW 第二部（light 灯光神庙）服务器部署指南

> **本包版本**：见 `package.json` 的 `version`（2.x 线）。
>
> **给 AI / 运维的唯一入口**：解包后执行 `sudo ./deploy.sh`。它会自检环境、生成 systemd
> 服务、起服、并跑完整验收（含真开局双人 patch），全绿即部署完成。**不需要读下面的章节
> 也能部署**；§1–§9 是手册与故障排查，仅在 deploy.sh 报错时查阅。
>
> 分部与版本线的对应关系见 `note/plans/2026-10-28-version-lines.md`：**2.x 只发第二部**，
> 包里不含森林/冰雪神庙的关卡、图集与专属音频。

## 0. 一键部署（推荐，也是 AI 接手的最短路径）

```bash
sha256sum -c gy-fw-light-*.tar.gz.sha256   # ① 校验包完整性
tar -xzf gy-fw-light-*.tar.gz              # ② 解包
cd gy-fw-light-*/                           # ③ 进目录
sudo ./deploy.sh                            # ④ 部署 + 自验收（一条命令到底）
```

`deploy.sh` 的行为：

| 参数 | 作用 |
|---|---|
| 默认（无参数） | 装成 systemd 服务 `gy-fw-light`，监听 `127.0.0.1:2567`（仅本机，安全缺省） |
| `--public` | 改监听 `0.0.0.0`，对外可直连（会提示放行防火墙） |
| `--port 8080` | 换端口 |
| `--trust-proxy` | 置于 nginx 反代之后（限流取真实 IP） |
| `--origins https://a.com` | 跨域白名单（反代换域/嵌入页时需要） |
| `--no-service` | 只前台试跑 + 验收，不装服务 |
| `--verify-only` | 服务已在跑，只跑验收 |

退出码 0 = 部署完成且验收全绿；非 0 会打印失败项与对应日志命令。

**验收内容**（`scripts/verify.mjs`，随包出厂）：① `/healthz` ② 首页 ③ 关卡清单与包内
实装逐一致（light 部 41 条）④ 本部首关 `light_01` 200 与别部关卡 404 ⑤ 音频流 ⑥ 建房
⑦ **双人到齐进 started** ⑧ **started 期 patch 持续在流** ⑨ 浏览器建房进 Game（有
playwright 时）。

> ⑦⑧ 是必过项：只 `create→leave` 的验收不会让房间广播任何增量，「能起服、不能开局」的
> 崩溃因此完全隐形（#51 复盘）。

## 0.1 本包是什么

- 《Fireboy & Watergirl》复刻（gyのFW）**仅第二部灯光神庙**的可部署服务端：Node 单进程同时服务 HTTP 静态资源与 WebSocket 联机（Colyseus 同端口），41 个关卡节点（清单 `data/light/temple.json`）+ 双人联机房间。
- 包内已含**预装好的生产依赖**（`node_modules/`，linux-x64）、**已构建的客户端**（`packages/client/dist/`）与**已预转译的服务端 JS**——**目标机不需要 npm、不需要 tsx、不需要构建工具链，解包即可运行**。
- **本包含森林神庙首关 `forest_01`**：light 的关卡清单本身把 `tutorials/forest_01.json` 当作前置教学节点引用，属本部合法内容，不是夹带。除此之外不含森林/冰雪神庙的关卡、图集与专属音频。
- 明确**不含**：开发源码测试、构建链。

## 1. 前置条件（逐条自检）

| 条件 | 自检命令 | 通过标准 |
|---|---|---|
| Linux x64 | `uname -m` | `x86_64` |
| Node.js ≥ 22.12 | `node -v` | `v22.12` 及以上（22.x/24.x 均可） |
| 目标端口空闲 | `ss -tlnp \| grep :2567`（端口按 §3 换算） | 无输出 |
| 包完整性 | `sha256sum -c gy-fw-light-*.tar.gz.sha256` | `OK` |

> node_modules 内含平台二进制（esbuild 等），仅保证 linux-x64。其他平台/架构：在有网环境于包根目录执行 `npm ci --omit=dev` 重装后再用。

## 2. 快速起步（前台试跑）

```bash
sha256sum -c gy-fw-light-2.0.0.tar.gz.sha256     # 校验（2.x 按实际版本号）
tar -xzf gy-fw-light-2.0.0.tar.gz
cd gy-fw-light-2.0.0
node packages/server/src/index.js                 # 前台起服（默认 127.0.0.1:2567）
```

看到这两行即启动成功（第一行是启动期状态自检，必须在）：

```
[fw] schema 自检通过（10 类字段访问器完好）
[fw] http+ws  http://127.0.0.1:2567
```

> **服务端已预转译，直接跑 `.js`**：包内 `packages/server/src/*.js` 是构建期由 esbuild 从
> TS 转译的产物，目标机不需要 tsx、不需要任何构建工具。**不要**用 `tsx` 跑包内源码
> ——tsx 的 ESM loader 不读 tsconfig 的 `useDefineForClassFields`，会让状态字段覆盖
> Colyseus schema 访问器、开局必崩（#51）。

## 3. 环境变量

| 变量 | 缺省 | 说明 |
|---|---|---|
| `PORT` | `2567` | HTTP+WS 同端口 |
| `FW_HOST` | `127.0.0.1` | 监听地址。**对外服务设 `0.0.0.0`**（仅本机/反代场景保持缺省更安全） |
| `FW_ALLOWED_ORIGINS` | 空 | 跨域白名单（逗号分隔）。同源恒放行；反代换域或嵌入式页面时列出站点源 |
| `FW_TRUST_PROXY` | 关 | **置于反向代理后设为 `1`**：限流按 `X-Forwarded-For` 取真实客户端 IP |
| `FW_DUMP` / `FW_DEBUG_*` / `FW_WIND_PHASE` | 关 | 调试用。**生产不要开** |

## 4. 常驻服务（systemd）

用 `sudo ./deploy.sh` 时 unit 自动生成（服务名 `gy-fw-light`，路径按实际解包目录填写），
不需要手改任何一行。手工等价物：

```bash
sudo tee /etc/systemd/system/gy-fw-light.service >/dev/null <<'UNIT'
[Unit]
Description=gy no FW light server
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=/opt/gy-fw-light-2.0.0
Environment=PORT=2567
# 对外直连时加：Environment=FW_HOST=0.0.0.0
# 反代后加：Environment=FW_TRUST_PROXY=1
ExecStart=/usr/bin/env node packages/server/src/index.js
Restart=always
RestartSec=3
User=nobody
NoNewPrivileges=true
ProtectSystem=strict
ReadWritePaths=/opt/gy-fw-light-2.0.0

[Install]
WantedBy=multi-user.target
UNIT
sudo systemctl daemon-reload
sudo systemctl enable --now gy-fw-light
```

日志：`journalctl -u gy-fw-light -f`。停机：`sudo systemctl stop gy-fw-light`。

## 5. 部署验收清单（AI 逐条执行，全绿才算完成）

`$BASE` 为 `http://127.0.0.1:${PORT:-2567}`。

```bash
BASE=http://127.0.0.1:2567

# ① 健康探针：200 + {"ok":true,...}
curl -sf $BASE/healthz

# ② 页面：200 且是 html
curl -s -o /dev/null -w '%{http_code} %{content_type}\n' $BASE/

# ③ 关卡清单：ids 必须与包内实装一致（light 部 41 条，含交叉引用的 forest_01）
curl -s $BASE/api/levels

# ④ 关卡读取 + 分发边界：本部首关 200；别部专属关 404（预期行为，见 §9）
curl -s -o /dev/null -w 'light_01   %{http_code}\n' $BASE/api/level/light_01    # 预期 200
curl -s -o /dev/null -w 'forest_02  %{http_code}\n' $BASE/api/level/forest_02   # 预期 404
curl -s -o /dev/null -w 'ice_03     %{http_code}\n' $BASE/api/level/ice_03      # 预期 404

# ⑤ 音频流式路由：200 + application/octet-stream
curl -s -o /dev/null -w '%{http_code} %{content_type}\n' $BASE/assets/audio/s/MenuMusic
```

第 ⑥ 步（联机端到端，必须凑两人进 started 并确认增量在流）别手抄——直接用包内脚本：

```bash
node scripts/verify.mjs --base $BASE        # 覆盖 ①–⑧（含双人 started + patch 断言）
```

`deploy.sh` 第 4 步跑的就是它。第 ⑨ 步（浏览器建房进 Game、pageerror=0）需要目标机有
playwright；包内不带，故 `deploy.sh` 会自动加 `--no-browser`。

## 6. 对外服务

**方式 A：直接对外**——unit 里设 `FW_HOST=0.0.0.0`，防火墙放行 `PORT`。明文 HTTP，适合内网/穿透隧道。

**方式 B：nginx 反代**（推荐，TLS 终止在 nginx）——unit 保持缺省 `127.0.0.1`，加 `FW_TRUST_PROXY=1`：

```nginx
server {
    listen 443 ssl http2;
    server_name fw.example.com;
    # ssl_certificate …; ssl_certificate_key …;

    location / {
        proxy_pass http://127.0.0.1:2567;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;      # WebSocket 升级（必需）
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 3600s;
    }
}
```

## 7. 故障速查

| 症状 | 原因 | 处置 |
|---|---|---|
| 启动日志缺 `schema 自检通过`，进程立刻退出 | 服务端 `.js` 被外部工具改坏/被 TS 源码覆盖 | 用官方包重装；不要用 `tsx` 跑包内源码 |
| 玩家建房后永久卡 loading，日志见 `uncaughtException … Symbol(Symbol.metadata)` | 旧版崩溃形态（1.0.0 及更早，或误用 tsx） | 用本包重装 |
| `Error: Cannot find module …` / esbuild 平台报错 | 非 linux-x64 平台用了随包 node_modules | 包根目录 `npm ci --omit=dev` 重装 |
| 启动即退出：`EADDRINUSE` | 端口被占 | `ss -tlnp \| grep :2567` 找到 pid，`kill` 后再起 |
| `node: internal …` 版本语法错 | Node < 22.12 | 升级 Node（§1） |
| 页面能开但玩家连不上房间、日志见 WS 升级 403 | 跨站 Origin 被拒 | 玩家页面源加入 `FW_ALLOWED_ORIGINS` |
| 大量玩家被 429 | `/api` 限流 60 次/10s/IP；反代后未设 `FW_TRUST_PROXY=1` | 设 `FW_TRUST_PROXY=1` |
| 音频不出声、`/assets/audio/s/xxx` 404 | 包被裁剪过 | 校验 sha256、重下完整包 |
| 关卡 500、日志 `关卡加载失败` | `data/` 目录不完整 | 同上，用完整包 |

## 8. 升级与回滚

- **升级**：新版本包解到并列目录（如 `/opt/gy-fw-light-2.0.1/`）→ 改 unit 的 `WorkingDirectory`/`ReadWritePaths` → `daemon-reload && restart`。房间状态不持久（对局中断即散）。
- **回滚**：`WorkingDirectory` 改回旧目录 → `daemon-reload && restart`。
- **跨大版本共存**：1.x（forest）与 2.x（light）是**两个独立服务**（`gy-fw-forest` / `gy-fw-light`），可同时跑在不同端口，互不影响。

## 9. 分发边界声明（预期行为，非故障）

1. 本包**只含第二部（light）**及其清单交叉引用的森林首关：`/api/levels` 与包内
   `data/light/levels` + `data/tutorials/levels` 完全一致；森林其余关与冰雪神庙一律 404。
2. 深链 `?level=light_xx` 可直达指定关；`?level=forest_02` 等不在包内，会 404。
3. `/api` 有固定窗口限流（60 请求/10 秒/IP）；`/api/level/:id` 带 300s 共享缓存与 ETag 304 复验。
4. 服务器默认只绑 `127.0.0.1`；未显式 `FW_HOST=0.0.0.0` 时外部无法直连。
5. 房间无持久化：重启即清空；对局密码房间需房主分发口令。
