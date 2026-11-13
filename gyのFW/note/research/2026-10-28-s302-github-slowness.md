# Steamcommunity_302 装了，GitHub 还是慢——实测归因

> 2026-10-28 ｜ 本机 `Steamcommunity_302` 15.0.7（Caddy 构建）
> 结论：**S302 在工作，但它不是加速器，是绕路器。** 它把「完全不通」变成「慢但能用」，
> 而出境带宽这一层它治不了。另有两个上游配置错乱点。

## 一、实测数据（可复现）

| 通路 | 结果 |
|---|---|
| 阿里云镜像（国内） | **30.1 MB/s**（38.8 MB 文件，无超时） |
| 清华 TUNA（国内） | **29.2 MB/s**（38.6 MB，无超时） |
| Cloudflare 测速（出境） | **101.8 KB/s**（35s 只下到 3.6/10 MB） |
| GitHub release 大包**经 S302** | **31.1 KB/s**（40s 只下到 1.25/39.2 MB） |
| GitHub release 大包**直连真实 IP** | **连接超时**（26s 零字节，完全不通） |

复现命令：

```bash
# 经 S302（hosts 默认状态）
curl -L -o /dev/null --max-time 40 -w 'speed=%{speed_download}B/s\n' \
  https://github.com/Guiyuan1111/slbhr/releases/download/1.0.1/gy-fw-forest-1.0.1.tar.gz

# 完全绕开 S302（github 与 CDN 都钉真实 IP）
curl -sSL -o /dev/null --max-time 26 \
  --resolve github.com:443:140.82.112.3 \
  --resolve release-assets.githubusercontent.com:443:185.199.108.133 \
  -w 'code=%{http_code}\n' \
  https://github.com/Guiyuan1111/slbhr/releases/download/1.0.1/gy-fw-forest-1.0.1.tar.gz

# 国内基线
curl -o /dev/null -w 'speed=%{speed_download}B/s\n' https://mirrors.aliyun.com/ubuntu/ls-lR.gz
```

**三个数字一起读**：本机国内 30 MB/s（硬件/宽带到线没问题），出境 100 KB/s（链路瓶颈），
经 S302 31 KB/s（绕路后同一数量级）。所以「慢」发生在出境这一跳，不在本机，也不在 S302
的转发效率。

## 二、S302 是怎么接管 GitHub 的

它的机制是 **DNS 劫持 + 本地 TLS 终结 + 上游反代**：

1. `/etc/hosts` 里 283 处 S302 注入，其中 **46 个 GitHub 域名指向 `127.0.0.1`**（行尾
   `#S302` 标记）。实测：

   ```
   getent hosts github.com            → 127.0.0.1
   getent hosts release-assets.githubusercontent.com → 127.0.0.1
   getent hosts uploads.github.com    → 127.0.0.1
   ```

2. 本机 `127.0.0.1:80/443` 由 S302 自带的 Caddy 承接（`ss -tlnp` 实测两个端口都在
   `127.0.0.1` 上，非 0.0.0.0）。

3. Caddy 按 `Host` 分发到上游，配置在
   `/var/lib/Steamcommunity_302/caddy-runtime/generated.caddyfile`：

   - `github.com` → `20.200.245.247 / 20.205.243.166 / 20.207.73.82 / 20.27.177.113 /
     20.233.83.145`（5 个 Azure IP，`lb_policy random_choose 2`）
   - `release-assets.githubusercontent.com` → `1..4.ghcontent.steam302.xyz`
     （`lb_try_duration 8s` / `fail_duration 30s` / `max_fails 2`）

4. 上游 TLS 全部带 `tls_insecure_skip_verify`（配置文件里 46 处）——Caddy 不校验上游
   证书。这正是它能「连上」的原因，也掩盖了下面两个配置错乱。

## 三、两个上游配置错乱点（实测）

### 3.1 四个 ghcontent 镜像节点出示的是 `*.github.io` 证书

```
curl -v https://1.ghcontent.steam302.xyz/
→ subject: CN=*.github.io     issuer: Let's Encrypt CN=YR1
→ subjectAltName does not match hostname 1.ghcontent.steam302.xyz
```

四个节点（`104.156.85.133` / `23.235.37.133` / `104.156.81.133` / `146.75.48.133`
——全是境外 CDN 段）**全部如此**。含义：这些节点本该是 `*.ghcontent.steam302.xyz`
的镜像服务，实际返回的是 GitHub Pages 的共享证书。上游域名/绑定关系错乱，或该服务
已改版而这版 S302（15.0.7）的配置没跟上。

因为 Caddy 开了 `tls_insecure_skip_verify`，这个错误**不会报给用户**，只是让请求落到
一个「证书对不上、内容也未必对」的后端上。

### 3.2 `uploads.github.com` 被劫持但 Caddy 里没有这个站点

```
grep -c "uploads.github.com" generated.caddyfile   → 0
```

hosts 把它钉到 `127.0.0.1`，但 Caddy 没有对应 site block，on_demand TLS 拿不到可发的
证书，握手直接失败：

```
curl https://uploads.github.com/
→ TLS alert internal error (592)
→ error:0A000438:SSL routines::tlsv1 alert internal error
```

**这就是 `gh release upload` 在本机必败、1.0.1 的 Release 附件改由 CI 侧上传的原因。**
不是网速问题，是本机这条路根本不存在。

## 四、所以「为什么慢」的完整答案

1. **S302 生效了**——直连 GitHub 完全超时（26s 零字节），经 S302 能下 31 KB/s。
   从「不通」到「通但慢」，这是它的功劳。
2. **但它治不了出境带宽**。它的上游还是境外 CDN（Azure / Fastly 段），只是把
   「浏览器 → GitHub」改成「curl → 本地 Caddy → 境外 CDN」。出境这一跳没变，
   所以吞吐和直连 Cloudflare（101 KB/s）同数量级。
3. **本机带宽不是瓶颈**：国内镜像 30 MB/s。
4. **附加损害**：镜像节点证书错乱、`uploads.github.com` 只劫持不服务，导致上传必败。

一句话：**S302 是「让 GitHub 能通」的工具，不是「让 GitHub 变快」的工具。** 它的定位
是绕过阻断，不是加速。

## 五、想真正变快，可用的路子（按性价比排）

| 方案 | 效果 | 代价 |
|---|---|---|
| **别从 GitHub 下大包** | 直接解决 | 本项目已落地：附件改 CI 构建、包经 `rsync` 传输（实测 1.2 MB/s，是 S302 的 38 倍） |
| 换镜像源 | 中 | release 资产没有国内镜像；代码可用 `ghproxy` 类服务，但同样不稳 |
| 修 S302 配置 | 小 | 找得到能用的 ghcontent 节点才行；当前 4 个全错乱，属上游服务问题，本机改不了 |
| 自建反代到境外 VPS | 大 | 有境外机才有意义；本机直连 GitHub 已超时，说明出境整体受限 |

**实践结论**：对本项目，「从 GitHub 下包」这条路就不该走。部署包用 `rsync` 从开发机
直传服务器（1.2 MB/s），或者让服务器自己从 CI 产物拉——都比等 S302 快一个数量级。

## 六、如何自查（换机器/换版本后复用）

```bash
# 1. 确认 S302 是否接管
getent hosts github.com                    # 期望 127.0.0.1
ss -tlnp | grep -E ':(80|443)\b'           # 期望 127.0.0.1 上有监听

# 2. 确认走的是哪个上游
grep -A3 'reverse_proxy' /var/lib/Steamcommunity_302/caddy-runtime/generated.caddyfile | head

# 3. 分清「慢」发生在哪一跳
curl -o /dev/null -w '%{speed_download}\n' https://mirrors.aliyun.com/ubuntu/ls-lR.gz  # 本地到线
curl -o /dev/null -w '%{speed_download}\n' 'https://speed.cloudflare.com/__down?bytes=10000000'  # 出境
curl -L -o /dev/null -w '%{speed_download}\n' https://github.com/<...>/releases/download/...  # 经 S302

# 4. 确认上传是否可能（gh release upload 前先跑）
curl -sS -o /dev/null -w '%{http_code}\n' https://uploads.github.com/   # 000/35 即不可用
```
