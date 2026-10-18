/**
 * 仅探针用（--require 注入被测服务器进程）：SIGTERM → process.exit(0)，
 * 使 --cpu-prof 在量具正常收尾杀服务器时也把 profile 落盘（缺省信号终止不写）。
 * 不改 packages/ 任何文件；只影响带此 NODE_OPTIONS 的那一次服务器进程。
 */
process.on("SIGTERM", () => process.exit(0));
