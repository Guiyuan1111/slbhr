/**
 * A/B/A 三臂快照的噪声判据执行器（r22 起，替代各轮 TEMP 里的一次性算带脚本）。
 *
 * 为什么需要它：跨臂主张一个差值，光看"均值差 vs 均值带"会假阳。本轮踩过两次：
 *   件1b 的 off 档 "+564ms/带 7ms"（脚本只读 rounds[0]，配对巧合把带压成 7ms）；
 *   件2 的 off 档 "+287ms 代价"（两轮口径下①②都过，10 轮池化后 Δ=−32.7ms/带 866 ⇒ 不存在）。
 * 所以判据写成三条闸门，本脚本把它们算出来，不靠人记：
 *   ① 同臂**最差带** max_{r,r'}|A_r − C_r'|（均值带 |Ā−Ĉ| 与配对带 max_r|A_r−C_r| 都只列出不作判据，
 *      它们在单轮配对上会收缩）；
 *   ② **臂B 自身散布** max(B) − min(B)——同代产物内部差这么多，就不能读作臂间差；
 *   ③ 高漂移档（off/cable 这类管线绑定档）要求 **每臂 ≥8 轮**：轮数不足时带本身还是未收敛的估计量，
 *      即使①②都过也只输出"样本不足，不得主张"。
 * Δ = B̄ − mid(Ā, Ĉ)。里程碑一律读页钟绝对值口径（`gameActivePerfMs`）；
 * 跨度列（`clickPerfMs`/`gameActiveAfterClickMs`）被"点击锚在里程碑上"天然污染，只作旁证。
 *
 * 用法（同档位、同 FILES 的多条链可以合并池化）：
 *   node benchmark/load-ab-bands.mjs off  r22c,r22d,r22e,r22f,r22g
 *   node benchmark/load-ab-bands.mjs 4g  r22c
 *   可选第三段起指定指标；末尾自动打四档的字节/请求窗口表（缺字段则跳过）。
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const [TIER, ERAS_ARG, ...METRICS] = process.argv.slice(2);
if (!TIER) {
  console.error("用法：node benchmark/load-ab-bands.mjs <tier> <era[,era…]> [指标…]");
  process.exit(2);
}
const ERAS = (ERAS_ARG || TIER).split(",").filter(Boolean);
const KEYS = METRICS.length ? METRICS : ["menuActiveMs", "gameActivePerfMs", "clickPerfMs", "gameActiveAfterClickMs"];
/** 管线绑定档：收益与代价都不按字节价，且臂间散布数百 ms，短链不可判 */
const HIGH_DRIFT = new Set(["off", "cable"]);
const MIN_ROUNDS_HIGH_DRIFT = 8;

const resultsDir = fileURLToPath(new URL("./results/", import.meta.url));
const load = (era, arm) => {
  const p = `${resultsDir}/load-${era}-ab-${TIER}-${arm}.json`;
  return existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : null;
};
const mean = (x) => x.reduce((s, v) => s + v, 0) / x.length;

console.log(`tier=${TIER}  链=${ERAS.join(",")}`);
for (const key of KEYS) {
  const perArm = ["a", "b", "c"].map((arm) => {
    const out = [];
    for (const era of ERAS) {
      const j = load(era, arm);
      if (!j) continue;
      for (const r of j.rounds) if (typeof r.cold?.[key] === "number") out.push({ era, v: r.cold[key] });
    }
    return out;
  });
  const [A, B, C] = perArm;
  if (!A.length || A.length !== B.length || A.length !== C.length) {
    console.log(`  ${key}: 样本不齐 A=${A.length} B=${B.length} C=${C.length}（该链该臂未存档？）`);
    continue;
  }
  const [mA, mB, mC] = [A, B, C].map((s) => mean(s.map((x) => x.v)));
  const d = mB - (mA + mC) / 2;
  const meanBand = Math.abs(mA - mC);
  const pairBand = Math.max(...A.map((x, i) => Math.abs(x.v - C[i].v)));
  const worstBand = Math.max(...A.flatMap((x) => C.map((y) => Math.abs(x.v - y.v))));
  const spreadA = Math.max(...A.map((x) => x.v)) - Math.min(...A.map((x) => x.v));
  const spreadB = Math.max(...B.map((x) => x.v)) - Math.min(...B.map((x) => x.v));
  const gates = [
    Math.abs(d) > worstBand ? `①过(Δ 超最差带 ${worstBand.toFixed(0)})` : `①不过(最差带 ${worstBand.toFixed(0)})`,
    Math.abs(d) > spreadB ? `②过(超臂B 散布 ${spreadB.toFixed(0)})` : `②不过(Δ ≤ 臂B 自身散布 ${spreadB.toFixed(0)})`,
  ];
  let call;
  if (Math.abs(d) <= worstBand) call = "最差带内 ⇒ 不算差异";
  else if (Math.abs(d) <= spreadB) call = "超带但 Δ≤臂B 自身散布 ⇒ 不足判定";
  else if (HIGH_DRIFT.has(TIER) && A.length < MIN_ROUNDS_HIGH_DRIFT)
    call = `①②过但高漂移档仅 n=${A.length}/臂 ⇒ 闸门③不过，需 ≥${MIN_ROUNDS_HIGH_DRIFT} 轮池化后才可主张`;
  else call = "三闸门全过 ⇒ 可主张";
  console.log(
    `  ${key.padEnd(24)} n=${A.length}/臂 Δ=${d.toFixed(1).padStart(8)} Ā/B̄/C̄=${mA.toFixed(0)}/${mB.toFixed(0)}/${mC.toFixed(0)}` +
      ` 均值带=${meanBand.toFixed(0)} 配对带=${pairBand.toFixed(0)} 最差带=${worstBand.toFixed(0)}` +
      ` 散布A=${spreadA.toFixed(0)} 散布B=${spreadB.toFixed(0)} Δ/带=${worstBand ? Math.abs(d / worstBand).toFixed(1) : "∞"}×  [${gates.join(" ")}] ${call}`
  );
  console.log(`      逐轮 B：${B.map((x) => `${x.era}:${x.v.toFixed(0)}`).join(" ")}`);
  console.log(`      逐轮 A：${A.map((x) => `${x.era}:${x.v.toFixed(0)}`).join(" ")}`);
  console.log(`      逐轮 C：${C.map((x) => `${x.era}:${x.v.toFixed(0)}`).join(" ")}`);
}

// 字节/请求窗口（三臂均值；解码面与真双载一并打，用于"搬窗口 vs 造字节"的守恒核对）
const TIERS_IN_DIR = [...new Set(readdirSync(resultsDir).filter((f) => /^load-.*-ab-.*-[abc]\.json$/.test(f)).map((f) => f.replace(/^load-.*?-ab-/, "").replace(/-[abc]\.json$/, "")))];
const win = (j, pick) => mean(j.rounds.map((r) => pick(r.cold)));
console.log(`\n=== 字节与请求窗口（tier=${TIER}，两轮均值）===`);
for (const arm of ["a", "b", "c"]) {
  for (const era of ERAS) {
    const j = load(era, arm);
    if (!j) continue;
    const menu = win(j, (c) => c.resources.menuKB ?? c.resources.totalTransferKB);
    const total = win(j, (c) => c.resourcesAfterGame.totalTransferKB);
    const game = win(j, (c) => c.resources.gamePhaseKB ?? c.resourcesAfterGame.totalTransferKB - c.resources.totalTransferKB);
    const decMenu = win(j, (c) => c.resources.totalDecodedKB);
    const decAll = win(j, (c) => c.resourcesAfterGame.totalDecodedKB);
    const nMenu = win(j, (c) => c.resources.count);
    const nAll = win(j, (c) => c.resourcesAfterGame.count);
    const dbl = win(j, (c) => (c.resourcesAfterGame.dupUrls || []).filter((d) => d.doubleDownload).length);
    const errs = win(j, (c) => (c.pageErrors || []).length);
    console.log(
      `  ${arm} ${era}  Menu窗 ${menu.toFixed(0)}KB/${nMenu.toFixed(0)}条 解码${decMenu.toFixed(0)}KB → ` +
        `到落定 ${total.toFixed(0)}KB/${nAll.toFixed(0)}条 解码${decAll.toFixed(0)}KB ⇒ 房内窗 ${game.toFixed(0)}KB/${(nAll - nMenu).toFixed(0)}条` +
        `  真双载=${dbl} 页错=${errs}`
    );
  }
}
if (TIERS_IN_DIR.length) console.log(`\n（results 目录里出现过的档位：${TIERS_IN_DIR.join("/")}）`);
