/**
 * 确定性 fuzz 长跑（对比报告 #5 / note/plans/2026-10-27-next-improvements.md B1）：
 * 同种子随机输入双 World 逐段链式哈希比对——专抓 hidden state 类非确定性
 * （学 Factorio FFF-63 heavy mode / SupCom 每秒状态哈希，出处见
 * note/report/2026-10-27-peer-practices.md）。哈希机制与 perf-determinism 同源
 * （全体位姿×速度×体数，sha256 链式）。
 *
 * 用法：
 *   node --import tsx benchmark/det-fuzz.mjs --level forest_01 --seed 7 --minutes 1
 *   --hash-every 120   每多少帧结算一段哈希（缺省 120=2s 游戏时间）
 *
 * 验收口径（B1）：3 种子 × 30 分钟双跑段哈希全一致。
 * 死亡/复活相位与机关状态天然进哈希（位姿+体数全收），无需特判。
 */
import { createHash } from "node:crypto";
import { makeWorld } from "../scripts/e2e/routetool/kernel.mjs";

const argOf = (args, k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : d; };
const args = process.argv.slice(2);
const LEVEL = argOf(args, "level", "forest_01");
const SEED = Number(argOf(args, "seed", "7"));
const MINUTES = Number(argOf(args, "minutes", "1"));
const HASH_EVERY = Number(argOf(args, "hash-every", "120"));
if (!Number.isFinite(SEED) || !Number.isFinite(MINUTES) || MINUTES <= 0 || HASH_EVERY <= 0) {
  console.error("[fuzz] 参数非法：--seed/--minutes/--hash-every 需正数");
  process.exit(2);
}

const STEPS = Math.floor(MINUTES * 60 * 60); // 60Hz
const mulberry32 = (a) => () => {
  a |= 0; a = (a + 0x6d2b79f5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const buf = new Float64Array(6);
const bufView = Buffer.from(buf.buffer, 0, 48);
function segHash(world, hash) {
  const b2 = world.built.world;
  let off = 0;
  for (let b = b2.GetBodyList(); b; b = b.GetNext()) {
    const p = b.GetPosition(), v = b.GetLinearVelocity();
    buf[0] = p.x; buf[1] = p.y; buf[2] = b.GetAngle();
    buf[3] = v.x; buf[4] = v.y; buf[5] = b.GetAngularVelocity();
    hash.update(bufView);
    off++;
  }
  hash.update(Buffer.of(off & 0xff, (off >> 8) & 0xff)); // 体数进哈希（销毁体=状态变化）
}

const w1 = makeWorld(LEVEL);
const w2 = makeWorld(LEVEL);
const rng = mulberry32(SEED);
const st = { fireboy: { up: false, left: false, right: false }, watergirl: { up: false, left: false, right: false } };
let h1 = createHash("sha256"), h2 = createHash("sha256");
let seg = 0;
const t0 = Date.now();
for (let f = 0; f < STEPS; f++) {
  // 随机行走输入：每键每帧 8% 翻转；同种子下两世界吃同一序列
  for (const role of ["fireboy", "watergirl"]) for (const k of ["up", "left", "right"]) if (rng() < 0.08) st[role][k] = !st[role][k];
  w1.step(1 / 60, { fireboy: { ...st.fireboy }, watergirl: { ...st.watergirl } });
  w2.step(1 / 60, { fireboy: { ...st.fireboy }, watergirl: { ...st.watergirl } });
  segHash(w1, h1); segHash(w2, h2);
  if ((f + 1) % HASH_EVERY === 0) {
    const d1 = h1.digest("hex"), d2 = h2.digest("hex");
    if (d1 !== d2) {
      console.error(`[fuzz] 非确定！level=${LEVEL} seed=${SEED} 段=${seg}（帧 ${seg * HASH_EVERY}..${f}）\n  w1=${d1}\n  w2=${d2}`);
      process.exit(1);
    }
    h1 = createHash("sha256"); h2 = createHash("sha256"); seg++;
  }
}
console.log(`[fuzz] 一致 level=${LEVEL} seed=${SEED} steps=${STEPS}（${MINUTES}min）segments=${seg} elapsed=${((Date.now() - t0) / 1000).toFixed(1)}s`);
