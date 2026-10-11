// s26.mjs — 落柱脚后重按左键测试 + 走出柱脚边缘验证
import { runKernel } from "../../scripts/e2e/routetool/kernel.mjs";
const ev = (f, dir, type) => ({ f, dir, type });

function run(wgEv, total) {
  const trace = [];
  return runKernel("forest_03_1", { fb: [], wg: wgEv, totalFrames: total }, { traceTo: trace }) && trace;
}
const mk = (wgEv, total) => {
  const trace = [];
  const res = runKernel("forest_03_1", { fb: [], wg: wgEv, totalFrames: total }, { traceTo: trace });
  return { trace, res };
};

// 落地 ~f204；重按左键 (release f210, press f214) 然后走到 f400 看 x
for (const [rel, pre] of [[208, 212], [210, 216], [220, 226]]) {
  const { trace, res } = mk(
    [ev(3, "left", "down"), ev(164, "up", "down"), ev(174, "up", "up"), ev(rel, "left", "up"), ev(pre, "left", "down")],
    420
  );
  const p = trace[400]?.wg;
  const q = trace[300]?.wg;
  console.log(`rel=${rel} pre=${pre} death=${res.deathF} f300=(${q?.[0].toFixed(0)},${q?.[1].toFixed(0)}) f400=(${p?.[0].toFixed(0)},${p?.[1].toFixed(0)})`);
}
