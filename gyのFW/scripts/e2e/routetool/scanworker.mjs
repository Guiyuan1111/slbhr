/**
 * 路线产线·扫描工人：stdin JSONL 收 {id, level, route}，stdout JSONL 回 {id, won, deathF}。
 * 每工人独立进程加载内核（node --import tsx），runKernel 无状态可连续回跑；
 * 崩溃由池侧重启兜底（本轮未决任务整体失败，由池拒绝并向上传播）。
 */
import { createInterface } from "node:readline";
import { runKernel } from "./kernel.mjs";

const rl = createInterface({ input: process.stdin });
rl.on("line", (line) => {
  const s = line.trim();
  if (!s) return;
  let job;
  try {
    job = JSON.parse(s);
  } catch {
    return;
  }
  try {
    const r = runKernel(job.level, job.route);
    process.stdout.write(JSON.stringify({ id: job.id, won: r.won, deathF: r.deathF ?? -1 }) + "\n");
  } catch (e) {
    process.stdout.write(JSON.stringify({ id: job.id, won: false, deathF: -1, err: String(e) }) + "\n");
  }
});
