# VMware 宿主 GPU 利用诊断（2026-10-18，主会话实测）

> 终判：**VMware guest 内"利用宿主显卡"的可达极限=GLX 桌面 GL**（本次已修通：自编译 vmware DDX+AIGLX vmwgfx initialized）；**Chromium/WebGL 吃不到它**——mesa svga 驱动无 GLES/EGL 硬件后端，属架构级限制非配置可解。渲染段性能基准的"真机口径"应走 Windows 端远程 CDP 校准（零配置路线）。

## §1 请求与背景

用户问"如何让你利用到宿主机的显卡"（性能战役 r3 后客户端渲染段被"本机无硬件 GL"阻塞，renderAvg 5.31ms 全部测于 SwiftShader 软光栅）。用户指出 VMware 3D 加速**已开启**（属实，dmesg Capabilities 含 3D/dx——主会话曾误判"没开"，已纠正）。

## §2 因果链逐环实测（六环）

| 环 | 实测 | 状态 |
|---|---|---|
| 1. VMware 3D 加速 | dmesg `Capabilities: ... 3D, ... dx, ...` | ✅ 用户已开 |
| 2. 内核 vmwgfx | SVGA v2、VRAM 128MB、renderD128 在位 | ✅ |
| 3. mesa 用户态 | `vmwgfx_dri.so` 在（26.0.8）；libEGL_mesa/glvnd 齐 | ✅（首查 grep 模式写错误报缺失，已纠正） |
| 4. EGL device/surfaceless | `eglQueryDevicesEXT` 失败（root 亦然）——mesa svga **不支持** EGL device/GBM 平台 | ❌ 架构限制 |
| 5. Xorg on vmwgfx | 发行版 vmware_drv（13.4.0-2build1）日志自证 `Driver was compiled without KMS- and 3D support` → `AIGLX: Screen 0 is not DRI2 capable` | ❌ 发行版构建缺陷 |
| 6. 修复环 5 | **自编译 DDX**（apt-get source + libxatracker-dev 后 `BUILD_VMWGFX 1`）→ `AIGLX: Loaded and initialized vmwgfx` | ✅ **修通** |

## §3 发行版无 3D 的根因闭环

Ubuntu resolute 的 xserver-xorg-video-vmware 构建依赖**缺 libxatracker-dev**（本机 build-dep 复现同结果：装它之前 `BUILD_VMWGFX` undef，装后 =1）——官方包因此在无 3D 状态下发布。本机修复=源码重编+替换 `/usr/lib/xorg/modules/drivers/vmware_drv.so`（原文件备份 `.ubuntu-orig` 并存，可逆）。

## §4 Chromium 为何仍走 SwiftShader（终局判定）

- Chromium（Playwright 1.63）GL 全走 **GLES/EGL**（ANGLE）；`--use-angle=gl` 需 EGL+GLES3 硬件上下文
- mesa svga 驱动**只实现 GLX/DRI2 桌面 GL**，无 GLES/EGL 后端；zink 需要 Vulkan（vmwgfx 无 Vulkan 硬件驱动，lavapipe 是 CPU）——无桥可走
- 实测矩阵：headless/ headed(xvfb)/ headed(真 X:9, AIGLX 活) 三形态 × angle-gl/desktop-gl/默认——真 X 下 desktop/默认仍 SwiftShader、angle-gl 仍 no-webgl
- 附带权限项：gy 不在 render 组（renderD128 card0 权限差）——非本链根因（root 同败），但建议 `usermod -aG render gy` 以备 GLX 应用使用

## §5 系统侧变更清单（全部可逆，已留存）

1. apt 源 `ubuntu.sources`：tuna（403）→ **huaweicloud**（`.bak-gpu` 备份原文件；`Types: deb deb-src`）
2. 新装包：`libxatracker2`+`libxatracker-dev`、`mesa-utils 依赖位`（build-dep 全套：xserver-xorg-dev 等）
3. `/usr/lib/xorg/modules/drivers/vmware_drv.so`：自编译版替换，原版备份 `vmware_drv.so.ubuntu-orig`
4. xorg9 systemd 单元已停用（诊断用毕；`systemctl start xorg9` 可复起）
5. TEMP/ddx-build（12MB 编译树）已清理

## §6 后续

- **渲染段优化（r6 候选）的口径正解=Windows 真机远程 CDP**：宿主 Chrome `--remote-debugging-port` + 本机 playwright `connect_over_cdp`（EasyTier 网络已在），待用户开端口即可跑 perf-client 真机校准
- 本机 GLX 硬件链已通的意义：未来若引入原生 GLX/GL 桌面负载（如离线渲染、非 Chromium 工具）可吃到宿主 GPU
- 复现命令族与探针（glprobe 系列、eglprobe C 声明版）见本档 §2-§4 描述，全部可从文中重构

## §7 过程勘误记录（本档自纠）

1. 误判"3D 加速没开"（dmesg 未及细查即归因）——用户纠正后实测推翻
2. grep 模式错（`svga|vmware` 漏掉 `vmwgfx_dri.so`）二次查实存在
3. 一次 nohup 会话回收导致 Xorg 假死（改 systemd-run 解决）

## §8 重大勘误（2026-10-19，本档终判"架构死路"被实测推翻）

用户质询"为什么需要宿主机，你自己无法实现吗"触发复核，**§4 的 Chromium 终判错误**：

- **真凶不是架构，是 Chromium GPU 黑名单**：vmwgfx(SVGA3D) 在 blocklist 内，默认启动被强制
  落 SwiftShader（Vulkan lavapipe），看起来像"无后端"。加 **`--ignore-gpu-blocklist`** 后
  ANGLE 走桌面 GL→vmwgfx→宿主 GPU，实测 renderer =
  `ANGLE (VMware Inc., SVGA3D; build: RELEASE; LLVM;, OpenGL ES 3.1)`——mesa svga 的
  GLES 面本就存在，"svga 无 GLES/EGL 后端"说法作废。
- **有效配方（VM 内自足，零宿主配合）**：真 X 显示（`sudo systemd-run --unit=xorg9 Xorg :9
  -noreset`，vmwgfx DDX）+ 有头 Chromium + `--ignore-gpu-blocklist --enable-gpu-rasterization`。
  四模式矩阵实证：default(headed)=SwiftShader；`--use-angle=gl`/`--use-angle=vulkan` 单独给
  反而 webgl:null（黑名单仍在，GPU 全禁）；**unblock 组合=SVGA3D**；
  headless=new（channel=chromium）+unblock 仍 SwiftShader（无头不做 GPU 初始化）——
  GPU 路径必须有真显示，Xvfb 也不行（GLX 软渲染）。
- **量具已固化**：`benchmark/perf-client.mjs --gpu [--display :9]`；r7-vmgpu 基线
  （client-r7-vmgpu.json，meta.remoteGpu=SVGA3D 串）：WebGL fps 44.2/render 0.236ms，
  Canvas 43.6/0.799ms——〔r7r 勘误〕44fps 并非刷新封顶：xrandr 实证 :9 为 60.00Hz、静窗复测
  61.0~61.1fps，44.2 系首跑时他槽基准窗负载污染（归因存疑挂账）；渲染段 A/B 相对比较以 ms 口径为准。
- **口径定位**：vmwgfx=宿主 GPU 的命令级虚拟化转发，绝对值含虚拟化 present 开销；
  本项目渲染段优化的对象是 CPU 侧 JS/Phaser 批处理（与虚拟化无关），A/B 有效；
  裸机绝对金标准仍可走 Windows 远程 CDP（已降级为可选项，非必需）。
- 探针收容：`note/report/perf/tools/gpu-vmgpu-probe.mjs`（四模式矩阵可复跑）。
- 过程教训（第 4 条自纠）：**"终判"级结论必须把对手的配置面（黑名单/开关）穷尽后才可下**，
  本次 §4 在未测 --ignore-gpu-blocklist 的情况下写了"架构级死路"，被用户一句质询戳破。
