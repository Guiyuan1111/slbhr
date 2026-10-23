# 2026-10-23 GitHub 22 端口劫持排障记档

## 现象
- `git push` 卡认证：gh token 失效（hosts.yml invalid）+ `ssh -T git@github.com` 恒 `Permission denied (publickey)`
- 网页添加本机公钥报 "Key is already in use"（钥匙实际已在账号，指纹 `SHA256:0piegx…` 与账号「ut」条目一致）
- gh 设备码流程两次在换 token 步骤 `HTTP 504`（用户浏览器侧授权均成功）

## 根因（铁证）
本机网络到 github.com:22 的流量被中间设备拦截，出示**伪主机密钥**并对一切公钥回绝：

| 通道 | 出示的 ED25519 主机密钥指纹 | 判定 |
|---|---|---|
| github.com:22 | `SHA256:SPTIPprchns5F59lQYyQWQjLFVU1Xab8Qaj+/kJCWxI` | **伪**（非 GitHub 官方值） |
| ssh.github.com:443 | `SHA256:+DiY3wvvV6TuJJhbpZisF/zLDA0zPMSvHdkr4UvCOqU` | 真（GitHub 官方公布的 ED25519 指纹） |

- 同一私钥 22 拒、443 认证成功（`Hi Guiyuan1111!`）→ 钥匙与账号均无问题，纯链路问题
- 伪端点仅完成 SSH 挑战应答，**未获得任何凭据**（SSH 不传私钥，只回签名）；OAuth 端点 504 为同源间歇干扰，第三次流程畅通

## 修复
1. `~/.ssh/config`：`github.com` 永久路由至 `HostName ssh.github.com / Port 443 / User git`
2. `ssh-keygen -R github.com` 清除首次测试时 `accept-new` 误纳的伪主机密钥（443 真密钥保留）
3. gh 经设备码网页流程重发 token（scopes: repo/gist/read:org，协议 https）
4. `git remote set-url origin git@github.com:Guiyuan1111/slbhr.git`

## 验证
- `ssh -T git@github.com` → `Hi Guiyuan1111! You've successfully authenticated`
- 推送成功：`06c3b0a..9a8f8f4  main -> main`（c55b352/a449d79/9e125bc/9a8f8f4 四笔）
- CI 绿：run `39976367976`，1m50s，success
- `gh auth status` → Logged in as Guiyuan1111

## 备注
- 排除"被攻击"：非本机被入侵、非 GitHub 被打，是出境链路对 22 端口的中间人拦截（常见于国内部分线路）；443 通道 HTTPS/SSH-over-443 均不受影响
- 若日后换网络环境，可临时注释 config 中该段回退直连测试
