breakpoint-rpa——TEMP/rpa 收容（2026-10-27 TEMP 清库，用户批准"按建议办"）
内容：oracle 切片六件（Device / BoxedDevice / Lever / Pusher / MovingPlatform /
BoxPrototype，init.js @1679971 附近区域，latin1）+ 探针四件
（probe.mts / probe2.mts / probe3.mts / arm-overshoot-check.mts）。
转臂限位 P0（越限 −91.26° 稳态 vs oracle 每帧钳回 −90°，内核修于 907b54a）
即由 probe2.mts 实测发现。
引用档卷：note/research/2026-10-fidelity/30-parity-platform-pusher-lever.md
（切片可按其定位法从 oracle init.js 再生成；四个探针脚本为唯一载体）。
