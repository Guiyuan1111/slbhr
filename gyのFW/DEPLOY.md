# gyのFW 第一部（forest）服务器部署指南

> **本包版本**：见 `package.json` 的 `version`（1.x 线）。
>
> **给 AI / 运维的唯一入口**：解包后执行 `sudo ./deploy.sh`。它会自检环境、生成 systemd
> 服务、起服、并跑完整验收（六步 + 真开局双人 patch），全绿即部署完成。**不需要读下面的
> 章节也能部署**；§1–§9 是手册与故障排查，仅在 deploy.sh 报错时查阅。
>
> 手工部署或需要理解细节时按 §1→§5 顺序执行，§5 每条都必须实际运行并核对"预期"；任何
> 一步不符先查 §7 故障表，仍无法解决就向宿主报告现场输出，**不要修改包内代码或配置来
> "绕过"验收**。§9 的边界声明属于预期行为，不是故障。

## 0. 一键部署（推荐，也是 AI 接手的最短路径）

```bash
sha256sum -c gy-fw-forest-*.tar.gz.sha256   # ① 校验包完整性
tar -xzf gy-fw-forest-*.tar.gz              # ② 解包
cd gy-fw-forest-*/                           # ③ 进目录
sudo ./deploy.sh                            # ④ 部署 + 自验收（一条命令到底）
```

`deploy.sh` 的行为：

| 参数 | 作用 |
|---|---|
| 默认（无参数） | 装成 systemd 服务 `gy-fw-forest`，监听 `127.0.0.1:2567`（仅本机，安全缺省） |
| `--public` | 改监听 `0.0.0.0`，对外可直连（会提示放行防火墙） |
| `--port 8080` | 换端口 |
| `--trust-proxy` | 置于 nginx 反代之后（限流取真实 IP） |
| `--origins https://a.com` | 跨域白名单（反代换域/嵌入页时需要） |
| `--no-service` | 只前台试跑 + 验收，不装服务 |
| `--verify-only` | 服务已在跑，只跑验收 |

退出码 0 = 部署完成且验收全绿；非 0 会打印失败项与对应日志命令。

**验收内容**（`scripts/verify.mjs`，随包出厂）：① `/healthz` ② 首页 ③ 关卡清单与包内
实装逐一致 ④ 本部首关 200 与别部关卡 404 ⑤ 音频流 ⑥ 建房 ⑦ **双人到齐进 started**
⑧ **started 期 patch 持续在流** ⑨ 浏览器建房进 Game（有 playwright 时）。

> ⑦⑧ 是 1.0.1 新增的**必过项**。1.0.0 的第 ⑥ 步只 `create→leave`，房间状态从未广播过
> 增量，「能起服、不能开局」的崩溃因此完全隐形（详见 #51 复盘）。缺这两条，验收再绿也
> 不代表能玩。

## 0.1 本包是什么

- 《Fireboy & Watergirl》复刻（gyのFW）**仅第一部森林神庙**的可部署服务端：Node 单进程同时服务 HTTP 静态资源与 WebSocket 联机（Colyseus 同端口），48 关（forest_01–47 + forest_01 教学副本）+ 双人联机房间（房间名 `forest`）。
- 包内已含**预装好的生产依赖**（`node_modules/`，linux-x64）、**已构建的客户端**（`packages/client/dist/`）与**已预转译的服务端 JS**——**目标机不需要 npm、不需要 tsx、不需要构建工具链，解包即可运行**。
- 明确**不含**：第二部（light 灯光神庙）、第三部（ice 冰雪神庙）的关卡/图集/专属音频；开发源码测试；构建链。深链访问 `?level=light_xx` 等会得到 404，这是分发边界，见 §9。

## 1. 前置条件（逐条自检）

| 条件 | 自检命令 | 通过标准 |
|---|---|---|
| Linux x64 | `uname -m` | `x86_64` |
| Node.js ≥ 22.12 | `node -v` | `v22.12` 及以上（22.x/24.x 均可） |
| 目标端口空闲 | `ss -tlnp \| grep :2567`（端口按 §3 换算） | 无输出 |
| 包完整性 | `sha256sum -c gy-fw-forest-*.tar.gz.sha256` | `OK` |

> node_modules 内含平台二进制（esbuild 等），仅保证 linux-x64。其他平台/架构：在有网环境于包根目录执行 `npm ci --omit=dev` 重装后再用。


## 2. 快速起步（前台试跑）

```bash
sha256sum -c gy-fw-forest-1.0.2.tar.gz.sha256     # 校验（1.0.x 按实际版本号）
tar -xzf gy-fw-forest-1.0.2.tar.gz
cd gy-fw-forest-1.0.2
node packages/server/src/index.js                 # 前台起服（默认 127.0.0.1:2567）
```

看到这两行即启动成功（第一行是启动期状态自检，必须在）：

```
[fw] schema 自检通过（10 类字段访问器完好）
[fw] http+ws  http://127.0.0.1:2567
```

Ctrl+C 退出，转 §4 常驻。

> **服务端已预转译，直接跑 `.js`**：包内 `packages/server/src/*.js` 是构建期由 esbuild 从
> TS 转译的产物，目标机**不需要 tsx，也不需要任何构建工具**。
>
> 1.0.0 曾发 TS 源码 + `node --import tsx` 启动，实测开局必崩——tsx 4.x 的 ESM loader 不读
> tsconfig 的 `useDefineForClassFields`，`x!: number` 被编成原生 class field 覆盖 Colyseus
> schema 的访问器，首次增量广播即 `encodeValue` 崩溃（#51）。现字段已全部改用 `declare`
> （不产运行时字段）+ 启动期自检兜底，此类问题不会再静默发生。

## 3. 环境变量

| 变量 | 缺省 | 说明 |
|---|---|---|
| `PORT` | `2567` | HTTP+WS 同端口 |
| `FW_HOST` | `127.0.0.1` | 监听地址。**对外服务设 `0.0.0.0`**（仅本机/反代场景保持缺省更安全） |
| `FW_ALLOWED_ORIGINS` | 空 | 跨域白名单（逗号分隔）。同源恒放行；反代换域或嵌入式页面时列出站点源，如 `https://fw.example.com` |
| `FW_TRUST_PROXY` | 关 | **置于反向代理后设为 `1`**：限流按 `X-Forwarded-For` 取真实客户端 IP，否则所有玩家共享代理 IP 一个限流桶 |
| `FW_DUMP` / `FW_DEBUG_*` / `FW_WIND_PHASE` | 关 | 调试用。**生产不要开** |

## 4. 常驻服务（systemd）

```bash
sudo tee /etc/systemd/system/gy-fw-forest.service >/dev/null <<'UNIT'
[Unit]
Description=gy no FW forest server (1.0.x)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
# ↓↓↓ 按实际部署路径与端口修改这两行 ↓↓↓
WorkingDirectory=/opt/gy-fw-forest-1.0.2
Environment=PORT=2567
# 对外直连时加：Environment=FW_HOST=0.0.0.0
# 反代后加：Environment=FW_TRUST_PROXY=1
# 自定义域名/嵌入页加：Environment=FW_ALLOWED_ORIGINS=https://fw.example.com
ExecStart=/usr/bin/env node packages/server/src/index.js
Restart=always
RestartSec=3
# 服务只写 stdout（journald 收），不落业务文件；不设 User= 则以运行 systemctl 的身份，建议显式指定非特权用户
User=nobody
NoNewPrivileges=true
ProtectSystem=strict
ReadWritePaths=/opt/gy-fw-forest-1.0.2

[Install]
WantedBy=multi-user.target
UNIT
sudo systemctl daemon-reload
sudo systemctl enable --now gy-fw-forest
systemctl status gy-fw-forest --no-pager
```

日志：`journalctl -u gy-fw-forest -f`。停机：`sudo systemctl stop gy-fw-forest`（进程内注册了 SIGTERM 优雅停机，房间会先回收）。

> 上面这段是**手工等价物**。用 `sudo ./deploy.sh` 时 unit 自动生成（路径按实际解包目录填写），不需要手改任何一行。

## 5. 部署验收清单（AI 逐条执行，全绿才算完成）

以下 `$BASE` 为 `http://127.0.0.1:${PORT:-2567}`。每条都给了**预期**，不符即失败。

```bash
BASE=http://127.0.0.1:2567

# ① 健康探针：200 + {"ok":true,...}
curl -sf $BASE/healthz

# ② 页面：200 且是 html
curl -s -o /dev/null -w '%{http_code} %{content_type}\n' $BASE/

# ③ 关卡清单：ids 只含 forest_*（这是"仅第一部"的核心断言）
curl -s $BASE/api/levels
#   预期形如 {"ids":["forest_47",...,"forest_01"]}，不含任何 light_/ice_ 前缀

# ④ 关卡读取 + 分发边界：第一关 200；第二部关 404（预期行为，见 §9）
curl -s -o /dev/null -w 'forest_01 %{http_code}\n' $BASE/api/level/forest_01   # 预期 200
curl -s -o /dev/null -w 'light_01   %{http_code}\n' $BASE/api/level/light_01   # 预期 404

# ⑤ 音频流式路由：200 + application/octet-stream
curl -s -o /dev/null -w '%{http_code} %{content_type}\n' $BASE/assets/audio/s/MenuMusic

# ⑥ 联机房间端到端 —— **必须凑两人进 started 并确认增量在流**
#   1.0.0 的验收在此处只 create→leave：房间状态从未广播过增量，
#   于是「能起服、不能开局」的崩溃（#51）完全隐形，六步全绿而玩家永远卡 loading。
#   房间密码强制 4–64 位（空/短密码 4400 拒绝），示例用 demo1。
node --input-type=module -e "
import { Client } from 'colyseus.js';
const url = 'ws://127.0.0.1:' + (process.env.PORT ?? 2567);
const c = new Client(url);
const a = await c.create('forest', { levelId: 'forest_01', password: 'demo1' });
const b = await c.joinById(a.roomId, { password: 'demo1' });
a.onMessage('role', () => {}); b.onMessage('role', () => {});
let patches = 0;
a.onStateChange(() => { patches++; });
const t0 = Date.now();
while (Date.now() - t0 < 20000 && String(a.state?.phase) !== 'started') {
  await new Promise(r => setTimeout(r, 200));
}
const phase = String(a.state?.phase);
const before = patches;
await new Promise(r => setTimeout(r, 8000));
const gained = patches - before;
console.log('phase=' + phase + ' patches+=' + gained);
await b.leave(true); await a.leave(true); process.exit(0);
" 2>&1 | tail -1
#   预期输出 phase=started patches+= 且增量数 > 100（≈60/s × 8s）。
#   若 phase≠started 或 patches 不增长，即为「能起服不能开局」——查 §7。
```

> **推荐一次跑完 ①–⑥**：包内 `node scripts/verify.mjs --base $BASE` 即为上述全量的
> 自动版（含双人 started 与 patch 断言），`deploy.sh` 第 4 步调的就是它。

## 6. 对外服务

**方式 A：直接对外**（无反代）——systemd unit 里设 `FW_HOST=0.0.0.0`，防火墙放行 `PORT`。玩家访问 `http://<服务器IP>:2567`。明文 HTTP，适合内网/穿透隧道；公网裸奔建议方式 B 加 TLS。

**方式 B：nginx 反代**（推荐，TLS 终止在 nginx）——unit 保持缺省 `127.0.0.1`，加 `FW_TRUST_PROXY=1`，若玩家从其他域名/端口访问再加 `FW_ALLOWED_ORIGINS=https://你的域名`：

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
        proxy_read_timeout 3600s;                     # 长对局勿断
    }
}
```

## 7. 故障速查

| 症状 | 原因 | 处置 |
|---|---|---|
| 启动日志缺 `schema 自检通过`，进程立刻退出 | 服务端 `.js` 被外部工具改坏/被 TS 源码覆盖（状态字段非 schema 访问器，房间增量编码必崩，#51） | 用官方包重装；**不要**用 `tsx` 跑包内 TS（1.0.1 起包里已无 TS） |
| 玩家建房后永久卡 loading，日志见 `uncaughtException … Symbol(Symbol.metadata)` | 同上的旧版崩溃形态（1.0.0 及更早） | 升级到 1.0.1+ |
| `Error: Cannot find module …` / esbuild 平台报错 | 非 linux-x64 平台用了随包 node_modules | 包根目录 `npm ci --omit=dev` 重装 |
| 启动即退出：`EADDRINUSE` | 端口被占（含旧实例孤儿进程） | `ss -tlnp \| grep :2567` 找到 pid，`kill` 后再起 |
| `node: internal …` 版本语法错 | Node < 22.12 | 升级 Node（§1） |
| 页面能开但玩家连不上房间、日志见 WS 升级 403 | 跨站 Origin 被拒（#45 安全默认） | 玩家页面源加入 `FW_ALLOWED_ORIGINS`（同源访问无需） |
| 大量玩家被 429 | `/api` 限流 60 次/10s/IP；反代后未设 `FW_TRUST_PROXY=1`，全代理共享一桶 | 设 `FW_TRUST_PROXY=1` |
| 音频不出声、`/assets/audio/s/xxx` 404 | 包被裁剪过（正常包不该缺） | 校验 sha256、重下完整包 |
| 关卡 500、日志 `关卡加载失败` | `data/` 目录不完整 | 同上，用完整包 |

## 8. 升级与回滚

- **升级**：新版本包解到并列目录（如 `/opt/gy-fw-forest-1.0.2/`）→ 修改 unit 的 `WorkingDirectory`/`ReadWritePaths` → `daemon-reload && restart`。停机窗口=重启秒级；房间状态不持久（对局中断即散）。
- **回滚**：`WorkingDirectory` 改回旧目录 → `daemon-reload && restart`。

## 9. 分发边界声明（预期行为，非故障）

1. 本包**只含第一部（forest）**：`/api/levels` 只返回 `forest_*`；`light_*`/`ice_*` 一律 404。
2. 深链 `?level=forest_xx` 可直达指定关；`?level=light_xx` 不会进入对局（选关界面回退/关卡 404）。
3. `/api` 有固定窗口限流（60 请求/10 秒/IP）；`/api/level/:id` 响应带 300s 共享缓存与 ETag 304 复验。
4. 服务器默认只绑 `127.0.0.1`；未显式 `FW_HOST=0.0.0.0` 时外部无法直连。
5. 房间无持久化：重启即清空；对局密码房间需房主分发口令。
