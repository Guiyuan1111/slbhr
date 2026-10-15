# Ubuntu 服务器配置档案（2026-10-15 接管日盘点）

> 目的：开发环境事实全量记档，避免"机器有但我不知道"。后续会话直接引用，勿重复勘察。
> 采集方式：主会话直接勘察（lscpu/lsblk/ss/systemctl/1Panel MCP/Chromium 实测）。

## 硬件

| 项 | 值 | 备注 |
|---|---|---|
| 形态 | VMware 虚拟机（hostname gy-VMware-Virtual-Platform） | 宿主未直接勘察 |
| CPU | i5-13400F，8 vCPU（每 vCPU 独占一物理核，1 线程/核） | avx2/sha_ni 等指令集齐全；`tsc_reliable nonstop_tsc constant_tsc` |
| 频率呈现 | /proc/cpuinfo 恒报 2496MHz（BogoMIPS 4992） | **这是 VMware 报告的名义基频（13400F 基频=2.5GHz），不反映真实执行频率**；真实频率客户机不可见。实测 openssl rsa2048 单核 sign/s：229-385（波动大），粗略参照裸金属 4.6GHz 水平的 ~55-70%——未跑满睿频，宿主侧（任务管理器/电源计划/VM 处理器设置）才能定谳 |
| 内存 | 15GiB，swap 4GiB（swappiness=10，实测几乎不用） | 门禁运行时 available ~8.8Gi |
| 磁盘 | VMware Virtual NVMe Disk 100G（nvme0n1，非旋转） | / 用量 ~36-38% |
| GPU | VMware SVGA II；`vmwgfx` 驱动已加载，/dev/dri/card0+renderD128 在 | **宿主侧 3D 加速是开着的** |
| Mesa | 26.0.8（libgl1-mesa-dri + mesa-vulkan-drivers 已装） | 用户态驱动齐全 |

## 时序相关关键事实（e2e 门禁敏感项）

- **时钟源 tsc**（available: tsc/hpet/acpi_pm）。
- 内核 7.0.0-38-generic，**PREEMPT_DYNAMIC**（cmdline 无 preempt= 覆盖），Ubuntu 26.04.1 LTS。
- 回环 rtt 0.036-0.711ms。
- chrony（NTP）在跑：route.mjs 已用 mono↔wall 桥接防校时扰动（EPOCH 补偿）。
- **Chromium WebGL 三条硬件路径全部不通**（实测 2026-10-15）：`--use-gl=egl` → 仍 SwiftShader；`--use-angle=gl` → no-webgl（Mesa sv 驱动的 EGL 链路不通）；强制 swiftshader → SwiftShader。即 headless 下 WebGL 只能 SwiftShader 软件渲染，**rAF 掉到 ~33.5fps** → 门禁必须 `--disable-webgl` 走 Canvas（rAF 满帧 60fps）。桌面模式浏览器（用户游玩）未测，可能走 GLX 有加速。
- 门禁派发管线两个已知本机放大器（均已修复，见 git log）：①SwiftShader 帧率塌陷；②静默窗预告晚置导致采样 evaluate（本机偶发 200ms+，Windows ~30ms）压过派发点。

## 软件生态

- Node v22.22.1（/usr/bin/node 系统级，无 nvm）、npm 9.2.0（全局零包）、Playwright CLI 1.64.1；项目内 playwright ^1.63（浏览器缓存在 ~/.cache/ms-playwright：chromium-1243 + chromium_headless_shell-1243 + ffmpeg）。
- git / gh / docker / python3 / ffmpeg 已装；pip3、VSCode 未装。
- 无本地 HTTP 代理（无 proxy 环境变量、无常见代理端口）；有 **EasyTier VPN**（tun0 10.126.126.1/24，ens33=192.168.5.14/24 局域网）。
- GNOME/Wayland 桌面（gdm + gnome-shell，空闲 0.3% CPU）+ **gnome-remote-desktop（RDP 3389/3390 对外监听）**。
- 1Panel 在跑（agent+core，面板 127.0.0.1:80/443），**应用列表为空**；Docker+containerd 在跑但**零容器**（docker0/br-* DOWN）。
- 无用户 crontab。
- 其他监听：22(SSH)、11010/15888/23107(对外，EasyTier 系)、workbuddy/sandbox-cli/editor_sdk 等本地高位端口（ZCode 生态）。

## sudo 注意

- `sudo` 用 **gy 用户密码**（不是 root 密码）：`echo <gy密码> | sudo -S …`。root 密码另册（AGENTS.md）。
- git 身份已按仓库历史作者配置（repo 级：Guiyuan1111 / 122136506+Guiyuan1111@users.noreply.github.com）。
