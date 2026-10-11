// s27.mjs — 决定性封印测试
// T1: wg 西柱脚条带(480-512) 向西突破尝试（跳+按左，验证 c14 柱面阻挡）
// T2: wg 底层西岸向 r22 西棚架跳跃——头顶 vs 棚架底(736) 最近距离
import { runKernel } from "../../scripts/e2e/routetool/kernel.mjs";
const ev = (f, dir, type) => ({ f, dir, type });
const mk = (wgEv, total) => {
  const trace = [];
  const res = runKernel("forest_03_1", { fb: [], wg: wgEv, totalFrames: total }, { traceTo: trace });
  return { trace, res };
};

console.log("== T1: 西柱脚条带向西突破 ==");
// 到达条带: f3 left, jf164 跳, 落 ~f204 (496,669)。然后反复 跳+左：
for (const [jf2, holdL] of [[210, true], [214, true], [210, false], [240, true]]) {
  const evs = [ev(3, "left", "down"), ev(164, "up", "down"), ev(174, "up", "up"), ev(200, "left", "up")];
  if (holdL) { evs.push(ev(jf2 - 6, "left", "down")); }
  evs.push(ev(jf2, "up", "down"), ev(jf2 + 10, "up", "up"));
  const { trace, res } = mk(evs, 420);
  let minX = 1e9, minTop = 1e9;
  for (let f = 200; f < trace.length; f++) {
    const p = trace[f]?.wg;
    if (!p) continue;
    minX = Math.min(minX, p[0]);
    minTop = Math.min(minTop, p[1] - 21.76);
  }
  const end = trace[trace.length - 1]?.wg;
  console.log(`jf2=${jf2} holdL=${holdL} death=${res.deathF} minX=${minX.toFixed(1)} minTop=${minTop.toFixed(1)} end=(${end?.[0].toFixed(0)},${end?.[1].toFixed(0)})`);
}

console.log("== T2: 底层西岸原地/助跑跳——头 vs r22棚架底(736) ==");
// 出生(1184→fb侧无关) wg 初始在 (1184,861)?? 不——wg 出生东侧。先测试通用: 把 wg 放西岸需走过去;直接测: fb 出生(32,896)西侧同理用 fb? 简化: wg 走不到西岸, 用 fb 的出生位置物理等价(同一地点)测跳高
const { trace: t2 } = mk([ev(3, "left", "down"), ev(60, "left", "up")], 200);
// fb 没给输入... 用 fb 侧: 重跑 fb
{
  const trace = [];
  const res = runKernel("forest_03_1", { fb: [ev(3, "left", "down"), ev(40, "left", "up"), ev(60, "up", "down"), ev(70, "up", "up")], wg: [], totalFrames: 200 }, { traceTo: trace });
  let minTop = 1e9, atF = -1;
  for (let f = 55; f < 110; f++) {
    const p = trace[f]?.fb;
    if (!p) continue;
    const top = p[1] - 21.76;
    if (top < minTop) { minTop = top; atF = f; }
  }
  console.log(`fb 西岸跳: minCircleTop=${minTop.toFixed(2)} @f${atF} (棚架底=736; 需 <736 才可能探入, 但棚架顶=704 需完整登上)`);
}
