// rcm 探针 B：典型碰撞对行为基线（内核实测数字，供用户"碰撞差异"报告对照）。
// 5 个碰撞对：① 角色站升降平台（承载）② 走出地面边缘→坠落 ③ 角色入液体致死 sensor
// ④ 角色推 box ⑤ ball 滚地冲撞角色。全部走真实 parseLevel→World 链；dt=1/60 固定步。
// 复跑：npx tsx TEMP/rcm/collision-behavior-probe.mjs（重跑应逐位一致——内核 det）
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";
import { parseLevel } from "../../packages/shared/src/level2.js";
import { World } from "../../packages/shared/src/kernel/world.js";
import { b2 } from "../../packages/shared/src/kernel/b2.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const B = b2();

function makeProvider(baseDir) {
  const cache = new Map();
  return (source) => {
    if (!cache.has(source)) cache.set(source, JSON.parse(readFileSync(join(baseDir, ...source.split("/")), "utf8")));
    return cache.get(source);
  };
}
function loadWorld(name, dirName = "forest") {
  const json = JSON.parse(readFileSync(`${ROOT}/data/${dirName}/levels/${name}.json`, "utf8"));
  const lv = parseLevel(name, json, makeProvider(`${ROOT}/packages/client/public/assets/tilemaps/tilesets`));
  return { world: new World(lv), lv };
}
const m2px = (v) => -v * 32;
const pos2px = (b) => ({ x: m2px(b.GetPosition().x), y: m2px(b.GetPosition().y) });
const r2 = (v) => Math.round(v * 100) / 100;
const IN0 = { up: false, left: false, right: false };
const INR = { up: false, left: false, right: true };
const sleep = (w, n) => { for (let i = 0; i < n; i++) w.step(1 / 60, { fireboy: IN0, watergirl: IN0 }); };
const tileAt = (lv, c, r) => (r < 0 || c < 0 || r >= lv.rows || c >= lv.cols) ? -99 : lv.groundType[r * lv.cols + c];
const air = (lv, c, r) => { const v = tileAt(lv, c, r); return v === -99 || v === -1; };

// ---------- ① 升降平台承载：tutorials forest_01 平台@(32,480,128x32) dx=0 dy=-3（state1 上行 96px）
{
  console.log("=== [1] 角色站升降平台（tutorials forest_01 平台@(32,480) dy=-3，state1 上行 96px）===");
  const { world: w } = loadWorld("forest_01", "tutorials");
  const plat = w.mechanisms.platforms.find((p) => Math.abs(m2px(p.body.GetPosition().x) - 96) < 2 && Math.abs(m2px(p.body.GetPosition().y) - 496) < 2);
  const fb = w.players.fireboy.body;
  fb.SetPosition(new B.b2Vec2(-96 / 32, -(480 - 35.2) / 32));
  sleep(w, 30);
  const p0 = pos2px(plat.body), c0 = pos2px(fb);
  console.log(`落稳: 平台中心=(${r2(p0.x)},${r2(p0.y)}) 角色=(${r2(c0.x)},${r2(c0.y)}) feet=${w.players.fireboy.feetContacts.length}`);
  plat.state = 1; // dy=-3：axis=(0,-1)物理；translation→−3 ⇒ 位移=axis·(−3)=(0,3)物理=屏幕上行 96px（上方 r12 全空）
  plat.signalApply();
  for (let i = 0; i < 120; i++) {
    w.step(1 / 60, { fireboy: IN0, watergirl: IN0 });
    if (i % 20 === 19) {
      const p = pos2px(plat.body), c = pos2px(fb);
      console.log(`f${i + 1}: 平台Δ=(${r2(p.x - p0.x)},${r2(p.y - p0.y)}) 角色Δ=(${r2(c.x - c0.x)},${r2(c.y - c0.y)}) 相对滑移=${r2((c.y - c0.y) - (p.y - p0.y))}`);
    }
  }
}

// ---------- ② 走出地面边缘：forest_02 实心 run 右端（右+下皆空），角色右行出边坠落
{
  console.log("\n=== [2] 走出地面边缘→坠落（forest_02）===");
  const { world: w, lv } = loadWorld("forest_02");
  let spot = null;
  outer: for (let r = 5; r < lv.rows - 2; r++) {
    for (let c = 2; c < lv.cols - 2; c++) {
      if (tileAt(lv, c, r) === 0 && tileAt(lv, c + 1, r) === -99 && tileAt(lv, c + 1, r + 1) === -99 && tileAt(lv, c, r + 1) === 0) {
        spot = { c, r };
        break outer;
      }
    }
  }
  if (!spot) throw new Error("未找到边缘点");
  const edgeX = (spot.c + 1) * 32;
  const topY = spot.r * 32;
  console.log(`边缘点: 实心格(col${spot.c},row${spot.r}) 右缘 x=${edgeX} 顶 y=${topY}`);
  const fb = w.players.fireboy.body;
  fb.SetPosition(new B.b2Vec2(-(edgeX - 24) / 32, -(topY - 35.2) / 32));
  fb.SetLinearVelocity(new B.b2Vec2(0, 0));
  sleep(w, 20);
  for (let i = 0; i < 90; i++) {
    w.step(1 / 60, { fireboy: INR, watergirl: IN0 });
    if (i % 15 === 14) {
      const c = pos2px(fb);
      const v = fb.GetLinearVelocity();
      console.log(`f${i + 1}: pos=(${r2(c.x)},${r2(c.y)}) v=(${r2(m2px(v.x))},${r2(m2px(v.y))}) feet=${w.players.fireboy.feetContacts.length} anim=${w.players.fireboy.anim}`);
    }
  }
}

// ---------- ③ 液体致死：forest_02 green row15 col=10（上方 9 行净空，实测扫描），直落入液
{
  console.log("\n=== [3] 直落入液体致死（forest_02 green row=15 col=10，上方9行净空）===");
  const { world: w } = loadWorld("forest_02");
  const surfaceY = 15 * 32;
  const cx = 10 * 32 + 16;
  const fb = w.players.fireboy.body;
  fb.SetPosition(new B.b2Vec2(-cx / 32, -(surfaceY - 260) / 32));
  fb.SetLinearVelocity(new B.b2Vec2(0, 0));
  let deathFrame = -1, preY = 0, preVy = 0;
  for (let i = 0; i < 180; i++) {
    const evs = w.step(1 / 60, { fireboy: IN0, watergirl: IN0 });
    if (evs.some((e) => e.type === "death")) { deathFrame = i + 1; break; }
    const c = pos2px(fb);
    preY = c.y; preVy = r2(m2px(fb.GetLinearVelocity().y));
  }
  const c = pos2px(fb);
  console.log(`死亡帧=${deathFrame} 体心 y=${r2(c.y)}（致死线=液面+5.76px=${surfaceY + 5.76}，脚圆底=体心+35.2px=${r2(c.y + 35.2)}）末前帧 y=${r2(preY)} vy=${preVy}`);
  console.log(`phase=${w.phase} isOnLiquid=${w.players.fireboy.isOnLiquid}`);
}

// ---------- ④ 推 box：tutorials forest_01
{
  console.log("\n=== [4] 角色推 box（tutorials forest_01）===");
  const { world: w } = loadWorld("forest_01", "tutorials");
  const box = w.mechanisms.props[0];
  const fb = w.players.fireboy.body;
  const bp0 = pos2px(box.body);
  console.log(`box 初始=(${r2(bp0.x)},${r2(bp0.y)}) kind=${box.kind} mass=${r2(box.body.GetMass())}`);
  fb.SetPosition(new B.b2Vec2(-(bp0.x - 90) / 32, -bp0.y / 32));
  fb.SetLinearVelocity(new B.b2Vec2(0, 0));
  sleep(w, 30);
  for (let i = 0; i < 150; i++) {
    w.step(1 / 60, { fireboy: INR, watergirl: IN0 });
    if (i % 25 === 24) {
      const bp = pos2px(box.body);
      const bv = box.body.GetLinearVelocity();
      console.log(`f${i + 1}: box=(${r2(bp.x)},${r2(bp.y)}) boxvx=${r2(m2px(bv.x))}`);
    }
  }
}

// ---------- ⑤ ball 撞角色：平地滚球冲撞——扫「6 格平地实心带 + 上方 2 行净空」，球贴地 vx=+240 滚撞角色腿部
{
  console.log("\n=== [5] ball 滚地冲撞角色（平地 6 格实心带扫描，逐候选实测重试）===");
  const BALL_LEVELS = ["forest_07", "forest_08", "forest_19", "forest_20", "forest_27", "forest_29", "forest_32", "forest_bonus_1", "forest_bonus_3"];
  const VX = 240; // 滚速 px/s
  const cands = [];
  for (const name of BALL_LEVELS) {
    const { lv } = loadWorld(name);
    for (let c = 7; c < lv.cols - 2; c++) {
      let g = -1;
      for (let r = 2; r < lv.rows; r++) { if (!air(lv, c, r)) { g = r; break; } }
      if (g < 4 || tileAt(lv, c, g) !== 0) continue;
      let charOK = true;
      for (let r = g - 3; r < g; r++) if (!air(lv, c, r)) { charOK = false; break; }
      if (!charOK) continue;
      let runOK = true;
      for (let k = 1; k <= 5 && runOK; k++) {
        if (tileAt(lv, c - k, g) !== 0) runOK = false;
        else if (!air(lv, c - k, g - 1) || !air(lv, c - k, g - 2)) runOK = false;
      }
      if (runOK) cands.push({ level: name, c, g });
    }
  }
  if (!cands.length) throw new Error("未找到平地带候选");
  console.log(`候选 ${cands.length} 个: ${cands.slice(0, 6).map((p) => `${p.level}@col${p.c}`).join(", ")}${cands.length > 6 ? " …" : ""}`);
  const launch = (w, cand) => {
    const fb = w.players.fireboy.body;
    const ball = w.mechanisms.props.find((p) => p.kind === "ball");
    const gy = cand.g * 32, cx = cand.c * 32 + 16;
    fb.SetPosition(new B.b2Vec2(-cx / 32, -(gy - 35.2) / 32));
    fb.SetLinearVelocity(new B.b2Vec2(0, 0));
    sleep(w, 30); // 角色先落稳
    ball.body.SetPosition(new B.b2Vec2(-(cx - 5 * 32 - 16) / 32, -(gy - 13.5) / 32));
    ball.body.SetLinearVelocity(new B.b2Vec2(-VX / 32, 0)); // 物理 −x = 屏幕 +x（双负镜像）：向右滚向角色
    sleep(w, 1);
    return { fb, ball, gy, cx };
  };
  let out = null, rejected = [];
  for (const cand of cands) {
    const { world: w } = loadWorld(cand.level);
    launch(w, cand);
    let peakKnockX = 0, peakKnockY = 0, died = -1, hitFrame = -1, minGap = 1e9, vx30 = 0;
    for (let i = 0; i < 150; i++) {
      const evs = w.step(1 / 60, { fireboy: IN0, watergirl: IN0 });
      if (evs.some((e) => e.type === "death") && died < 0) died = i + 1;
      const bl = pos2px(w.mechanisms.props.find((p) => p.kind === "ball").body), fl = pos2px(w.players.fireboy.body);
      minGap = Math.min(minGap, Math.hypot(bl.x - fl.x, bl.y - fl.y));
      const fbv = w.players.fireboy.body.GetLinearVelocity();
      peakKnockX = Math.max(peakKnockX, Math.abs(m2px(fbv.x)));
      peakKnockY = Math.max(peakKnockY, Math.abs(m2px(fbv.y)));
      if (hitFrame < 0 && peakKnockX > 30) hitFrame = i + 1;
      if (i === 29) vx30 = m2px(w.mechanisms.props.find((p) => p.kind === "ball").body.GetLinearVelocity().x);
    }
    if (peakKnockX > 30 && vx30 > 140) { out = { cand, peakKnockX, peakKnockY, died, hitFrame, minGap }; break; }
    rejected.push(`${cand.level}@col${cand.c}(vx30=${r2(vx30)},knock=${r2(peakKnockX)})`);
  }
  if (!out) throw new Error("所有候选均未产生干净冲击: " + rejected.join("; "));
  console.log(`被拒候选（风区/机关干扰或无冲击）: ${rejected.join("; ") || "无"}`);
  const { cand, peakKnockX, peakKnockY, died, hitFrame, minGap } = out;
  const gy = cand.g * 32, cx = cand.c * 32 + 16;
  console.log(`选点 ${cand.level}: 平地带 col${cand.c - 5}..col${cand.c} row${cand.g}（地面 y=${gy}）；球从 x=${r2(cx - 5 * 32 - 16)} 贴地 vx=${VX}px/s 滚向角色 x=${cx}`);
  console.log(`击中帧=${hitFrame} 球-人最小中心距=${r2(minGap)}px（球 r=12.8 + 人半宽≈13 → 接触≈25.8）峰值冲击=(${r2(peakKnockX)},${r2(peakKnockY)})px/s${died > 0 ? `；fb 于 f${died} 死亡` : ""}`);
  // 重放打印逐帧轨迹（重建世界，det 保证与刚才逐位一致）
  {
    const { world: w3 } = loadWorld(cand.level);
    const { fb, ball } = launch(w3, cand);
    for (let i = 0; i < 150; i++) {
      w3.step(1 / 60, { fireboy: IN0, watergirl: IN0 });
      if (i % 15 === 14) {
        const bl = pos2px(ball.body), fl = pos2px(fb);
        const bv = ball.body.GetLinearVelocity(), fv = fb.GetLinearVelocity();
        console.log(`f${i + 1}: ball=(${r2(bl.x)},${r2(bl.y)}) ballv=(${r2(m2px(bv.x))},${r2(m2px(bv.y))}) fb=(${r2(fl.x)},${r2(fl.y)}) fbv=(${r2(m2px(fv.x))},${r2(m2px(fv.y))})`);
      }
    }
  }
}
console.log("\n（基线数字；内核 det——重跑应逐位一致）");
