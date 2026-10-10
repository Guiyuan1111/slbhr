/**
 * 路线产线·并行扫描池：K 个 scanworker 子进程，JSONL RPC 分发内核回跑。
 * ±2f 全量扫描 444 回跑/次是硬化主瓶颈（串行 ~130s/次），并行后近线性加速；
 * 子进程崩溃自动重启并重派当前任务（一次），二次失败拒绝整批（向上传播）。
 */
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import os from "node:os";

const WORKER = join(dirname(fileURLToPath(import.meta.url)), "scanworker.mjs");

export class ScanPool {
  /** K=物理核-1，夹在 [2,10]：主进程与系统各留余量 */
  constructor(size = Math.max(2, Math.min(os.cpus().length - 1, 10))) {
    this.size = size;
    this.nextId = 0;
    this.pending = new Map(); // id -> {resolve, reject, worker, tries}
    this.idle = [];
    this.queue = [];
    this.closed = false;
    for (let i = 0; i < size; i++) this.idle.push(this.spawn());
  }

  spawn() {
    const child = spawn(process.execPath, ["--import", "tsx", WORKER], {
      stdio: ["pipe", "pipe", "inherit"],
    });
    const rl = createInterface({ input: child.stdout });
    rl.on("line", (line) => {
      const s = line.trim();
      if (!s) return;
      let msg;
      try { msg = JSON.parse(s); } catch { return; }
      const p = this.pending.get(msg.id);
      if (!p) return;
      this.pending.delete(msg.id);
      this.idle.push(child);
      this.pump();
      p.resolve(msg);
    });
    child.on("exit", (code) => {
      // 只处理带活任务的崩溃（正常归还的进程不在 pending 里）
      for (const [id, p] of [...this.pending]) {
        if (p.worker !== child) continue;
        this.pending.delete(id);
        if (p.tries === 0 && !this.closed) {
          p.tries = 1;
          const fresh = this.spawn();
          this.dispatch(fresh, id, p.job, p);
        } else {
          p.reject(new Error(`scanworker 崩溃 (exit=${code})，任务 ${id}`));
        }
      }
      const ix = this.idle.indexOf(child);
      if (ix >= 0) this.idle.splice(ix, 1);
      if (!this.closed) this.idle.push(this.spawn());
    });
    return child;
  }

  dispatch(worker, id, job, p) {
    p.job = job;
    p.worker = worker;
    this.pending.set(id, p);
    worker.stdin.write(JSON.stringify({ id, ...job }) + "\n");
  }

  pump() {
    while (this.queue.length > 0 && this.idle.length > 0) {
      const { job, resolve, reject } = this.queue.shift();
      const worker = this.idle.pop();
      this.dispatch(worker, `j${this.nextId++}`, job, { resolve, reject, tries: 0 });
    }
  }

  /** 提交一次内核回跑 */
  run(level, route) {
    if (this.closed) return Promise.reject(new Error("池已关闭"));
    return new Promise((resolve, reject) => {
      this.queue.push({ job: { level, route }, resolve, reject });
      this.pump();
    });
  }

  close() {
    this.closed = true;
    for (const c of this.idle) c.stdin.end();
    for (const [, p] of this.pending) p.reject(new Error("池关闭时任务未完成"));
  }
}
