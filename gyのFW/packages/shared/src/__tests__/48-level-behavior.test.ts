/**
 * 48 关行为级冒烟（无输入浸泡；标准用户冻结 2026-10-05）。
 *
 * 每关标准（口径逐条对应冻结文本，单位换算：1m = 32px，1m/s = 32px/s）：
 *  1. 出生站稳：双角色从出生点下落，≤2s（120 帧）内 |vy| < 0.5m/s（=16px/s）且此后
 *     持续 1s（60 帧）不再下坠（窗口内净下坠 ≤ 5cm=1.6px）；脚底（体中心 + 1.1m·32，
 *     躯干圆 y2=−0.9m 半径 0.2m，见 kernel/character.ts）不低于站立面 5cm。
 *     站立面 = 脚底最终位置正下方的网格首支撑面：实心格取格顶 row·32；斜面格取脚心 x
 *     处斜面高（"/": y=row·32+(32·col+32−x)，"\": y=row·32+(x−32·col)）；液体行段取
 *     下半实体盒顶 row·32+14.4px（build.ts 中段盒 y=−0.45m，即火人"齐腰深"支撑面）。
 *  2. 无输入浸泡 10s（600 步 @1/60）：
 *     - 双角色 x/y 有限且 |x|,|y| < 关卡尺寸 + 200px（不掉出世界；世界四壁即
 *       setBounds(−100,−100,W+200,H+200)，+200 余量在墙外再留一屏）
 *     - 位置/速度全程无 NaN（角色逐帧查；全部刚体每 60 帧扫一遍）
 *     - phase 保持 "playing"：若 gameover → 记"出生即死"而非通过——无输入下死亡只可能
 *       源于出生点与液体/机关体贴合，属关卡数据问题，单独成清单（是否原版同样如此待对拍）
 *     - 机关体（lever/pusher/platform/prop）位置有限、距原位 ≤ 30m（=960px，超出记飞出）
 *     - 世界刚体总数不增长（0 帧 vs 600 帧；钻石被拾取只会减少，记 info）
 *
 * 运行模式：收集+报告（STRICT=false）——行为异常不置红，仅打印清单并落 JSON 到
 * os.tmpdir()；待主线修复/决策后再把 STRICT 翻为 true 即成严格断言。
 * 基建异常（构建/步进抛错）同样只收集——冒烟的职责是如实上报，不阻塞套件。
 */
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { afterAll, describe, expect, it } from "vitest";
import { parseLevel, type LevelData } from "../level2.js";
import { World } from "../kernel/world.js";

/** 收集+报告模式开关：true = 行为异常直接 fail（主线修复后启用） */
const STRICT = false;

const SOAK_STEPS = 600; // 10s @ 1/60
const DT = 1 / 60;
const VY_ZERO_PXPS = 0.5 * 32; // 0.5 m/s → 16 px/s
const SETTLE_MAX_STEP = 120; // 2s
const SUSTAIN_STEPS = 60; // 1s
const SETTLE_DROP_PX = 1.6; // 5cm（站稳窗口内允许的最大净下坠）
const PEN_TOL_PX = 1.6; // 5cm（脚底陷入站立面的容差）
const FOOT_DROP_PX = 35.2; // 脚底圆底缘 = 体中心 + (0.9+0.2)m·32
const FLY_PX = 30 * 32; // 机关距原位 30m 视为飞出

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");

function makeProvider(baseDir: string) {
  const cache = new Map<string, any>();
  return (source: string) => {
    if (!cache.has(source)) {
      const p = new URL(source, `file:///${baseDir}/`).pathname.replace(/^\/([A-Za-z]:)/, "$1");
      cache.set(source, JSON.parse(readFileSync(decodeURI(p), "utf8")));
    }
    return cache.get(source);
  };
}

function loadAny(id: string): World {
  const dir = id === "forest_01" ? `${ROOT}/data/tutorials/levels` : `${ROOT}/data/forest/levels`;
  const json = JSON.parse(readFileSync(`${dir}/${id}.json`, "utf8"));
  return new World(parseLevel(id, json, makeProvider(dir)));
}

const NONE = { up: false, left: false, right: false };

/** 物理 vec → 屏幕 px（screen = (−32·bx, −32·by)） */
function toScreen(p: { x: number; y: number }): { x: number; y: number } {
  return { x: -p.x * 32, y: -p.y * 32 };
}

/** 站立面推算：从 (x, yStart) 逐行向下扫 Ground 网格，返回首个支撑面（屏幕 px） */
function surfaceUnder(level: LevelData, x: number, yStart: number): { surfaceY: number; kind: string; row: number; col: number } | undefined {
  const c0 = Math.floor((x - 15) / 32); // 脚底圆宽约 30px，扫双列
  const c1 = Math.floor((x + 15) / 32);
  const r0 = Math.max(0, Math.floor(yStart / 32));
  for (let row = r0; row < level.rows; row++) {
    let best: { surfaceY: number; kind: string; row: number; col: number } | undefined;
    for (let col = Math.max(0, c0); col <= Math.min(level.cols - 1, c1); col++) {
      const t = level.groundType[row * level.cols + col];
      let cand: { surfaceY: number; kind: string; row: number; col: number } | undefined;
      if (t === 0) cand = { surfaceY: row * 32, kind: "solid", row, col };
      else if (t === 1 || t === 2) {
        const lx = x - col * 32;
        cand = { surfaceY: t === 1 ? row * 32 + (32 - lx) : row * 32 + lx, kind: t === 1 ? "slopeA" : "slopeB", row, col };
      } else if (t === 3 || t === 4) cand = { surfaceY: row * 32, kind: t === 3 ? "wedgeC" : "wedgeD", row, col };
      else if (t >= 5 && t <= 7) {
        cand = { surfaceY: row * 32 + 14.4, kind: "liquid:" + (t === 5 ? "water" : t === 6 ? "lava" : "green"), row, col };
      }
      if (cand && (!best || cand.surfaceY < best.surfaceY)) best = cand;
    }
    if (best) return best;
  }
  return undefined;
}

/** 全刚体扫描：总数 + 非有限位置/速度清单 */
function bodySweep(world: any): { count: number; nan: string[] } {
  let b = world.GetBodyList();
  let count = 0;
  const nan: string[] = [];
  while (b) {
    count++;
    const p = b.GetPosition();
    const v = b.GetLinearVelocity();
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) nan.push(`pos#${count}(ud=${String(b.GetUserData())})`);
    if (!Number.isFinite(v.x) || !Number.isFinite(v.y)) nan.push(`vel#${count}(ud=${String(b.GetUserData())})`);
    b = b.GetNext();
  }
  return { count, nan };
}

/** 站稳检测：最小 t ≤ 2s，使 [t, t+1s] 内 |vy| 恒 < 16px/s 且窗口净下坠 ≤ 1.6px */
function findSettle(vyT: number[], yT: number[]): number {
  for (let t = 0; t <= SETTLE_MAX_STEP && t + SUSTAIN_STEPS < yT.length; t++) {
    let ok = true;
    for (let s = t; s <= t + SUSTAIN_STEPS; s++) {
      if (!(Math.abs(vyT[s]) < VY_ZERO_PXPS)) {
        ok = false;
        break;
      }
    }
    if (ok && yT[t + SUSTAIN_STEPS] - yT[t] <= SETTLE_DROP_PX) return t;
  }
  return -1;
}

// ---------------------------------------------------------------- 结果收集

interface MechFly {
  kind: string;
  id: number;
  dispPx: number;
}

interface LevelRecord {
  id: string;
  built: boolean;
  steps: number;
  phase: string;
  deathRoles: Array<"fireboy" | "watergirl">;
  deathStep: Record<string, number>;
  settleFbS: number | null;
  settleWgS: number | null;
  penFbPx: number | null;
  penWgPx: number | null;
  standOnFb: string;
  standOnWg: string;
  nanStep: number | null;
  oobStep: number | null;
  oobInfo: string;
  mechFly: MechFly[];
  bodyCountStart: number | null;
  bodyCountEnd: number | null;
  problems: string[];
  notes: string[];
  ok: boolean;
}

function newRecord(id: string): LevelRecord {
  return {
    id,
    built: false,
    steps: 0,
    phase: "-",
    deathRoles: [],
    deathStep: {},
    settleFbS: null,
    settleWgS: null,
    penFbPx: null,
    penWgPx: null,
    standOnFb: "-",
    standOnWg: "-",
    nanStep: null,
    oobStep: null,
    oobInfo: "",
    mechFly: [],
    bodyCountStart: null,
    bodyCountEnd: null,
    problems: [],
    notes: [],
    ok: false,
  };
}

const LIQUID_CN: Record<string, string> = { water: "水", lava: "岩浆", green: "绿浆" };
/** 原版致死方向：绿浆杀双方；火人死于水、水女孩死于岩浆（character.liquidTouched） */
function lethalTo(role: "fireboy" | "watergirl", kind: string): boolean {
  return kind === "green" || (role === "fireboy" && kind === "water") || (role === "watergirl" && kind === "lava");
}

function collectLevel(id: string): LevelRecord {
  const rec = newRecord(id);
  try {
    const w = loadAny(id);
    const lvl = w.level;
    rec.built = true;
    const W = lvl.widthPx;
    const H = lvl.heightPx;

    // 机关体初始位置（屏幕 px）
    const mechBodies: Array<{ kind: string; id: number; body: any }> = [
      ...w.mechanisms.levers.map((d, i) => ({ kind: "lever", id: i, body: d.body })),
      ...w.mechanisms.pushers.map((d, i) => ({ kind: "pusher", id: i, body: d.body })),
      ...w.mechanisms.platforms.map((d, i) => ({ kind: "platform", id: i, body: d.body })),
      ...w.mechanisms.props.map((d, i) => ({ kind: d.kind, id: i, body: d.body })),
    ];
    const mechInit = mechBodies.map((m) => toScreen(m.body.GetPosition()));

    const world = (w as any).built.world;
    rec.bodyCountStart = bodySweep(world).count;

    const trFb = { y: [] as number[], vy: [] as number[] };
    const trWg = { y: [] as number[], vy: [] as number[] };
    const bodyNanSeen = new Set<string>();

    for (let i = 0; i < SOAK_STEPS; i++) {
      const evs = w.step(DT, { fireboy: NONE, watergirl: NONE });
      const fb = w.snapshotPlayer("fireboy");
      const wg = w.snapshotPlayer("watergirl");
      trFb.y.push(fb.y);
      trFb.vy.push(fb.vy);
      trWg.y.push(wg.y);
      trWg.vy.push(wg.vy);

      for (const [role, p] of [["fireboy", fb], ["watergirl", wg]] as const) {
        if (rec.nanStep === null && (!Number.isFinite(p.x) || !Number.isFinite(p.y) || !Number.isFinite(p.vx) || !Number.isFinite(p.vy))) {
          rec.nanStep = i;
        }
        if (rec.oobStep === null && !(Math.abs(p.x) < W + 200 && Math.abs(p.y) < H + 200)) {
          rec.oobStep = i;
          rec.oobInfo = `${role}@(${p.x.toFixed(0)},${p.y.toFixed(0)}) 边界=±(${W + 200},${H + 200})`;
        }
        if (p.dying && !(role in rec.deathStep)) rec.deathStep[role] = i;
      }
      if (rec.phase !== "gameover" && evs.some((e) => e.type === "gameover")) rec.phase = "gameover";
      if (rec.phase !== "won" && evs.some((e) => e.type === "win")) rec.phase = "won";

      // 机关抽样（每 30 帧 + 收尾帧）：有限性 + 飞出
      if (i % 30 === 0 || i === SOAK_STEPS - 1) {
        mechBodies.forEach((m, k) => {
          const p = toScreen(m.body.GetPosition());
          if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) {
            const tag = `${m.kind}#${m.id} 位置非有限`;
            if (!rec.notes.includes(tag)) rec.notes.push(tag);
          }
          const disp = Math.hypot(p.x - mechInit[k].x, p.y - mechInit[k].y);
          if (disp > FLY_PX && !rec.mechFly.some((f) => f.kind === m.kind && f.id === m.id)) {
            rec.mechFly.push({ kind: m.kind, id: m.id, dispPx: Math.round(disp) });
          }
        });
      }
      // 全刚体有限性扫描（每 60 帧）
      if (i % 60 === 0 || i === SOAK_STEPS - 1) {
        for (const tag of bodySweep(world).nan) bodyNanSeen.add(tag);
      }
    }
    rec.steps = SOAK_STEPS;
    rec.bodyCountEnd = bodySweep(world).count;
    rec.phase = w.phase; // 末态权威值（playing/won/gameover）

    // ---- 站稳（标准 1）----
    const tFb = findSettle(trFb.vy, trFb.y);
    const tWg = findSettle(trWg.vy, trWg.y);
    rec.settleFbS = tFb >= 0 ? tFb * DT : null;
    rec.settleWgS = tWg >= 0 ? tWg * DT : null;

    // ---- 脚底 vs 站立面（标准 1 后半）----
    for (const [role, p, tr] of [["fireboy", w.snapshotPlayer("fireboy"), trFb], ["watergirl", w.snapshotPlayer("watergirl"), trWg]] as const) {
      const suffix = role === "fireboy" ? "Fb" : "Wg";
      if (p.dying || p.isDead) continue; // 出生即死关卡脚底检查无意义（已单独记）
      const foot = p.y + FOOT_DROP_PX;
      const surf = surfaceUnder(lvl, p.x, foot - 32);
      if (!surf) {
        rec.problems.push(`其他:${role} 脚底(${foot.toFixed(0)}px)下方无网格支撑面（悬空/掉出）`);
        continue;
      }
      const pen = foot - surf.surfaceY;
      rec[`pen${suffix}Px` as "penFbPx" | "penWgPx"] = Math.round(pen * 10) / 10;
      rec[`standOn${suffix}` as "standOnFb" | "standOnWg"] = `${surf.kind}@r${surf.row}c${surf.col}`;
      if (pen > PEN_TOL_PX) {
        rec.problems.push(`陷入地面:${role} 脚底低于站立面 ${pen.toFixed(1)}px(>1.6px) @${surf.kind}@r${surf.row}c${surf.col}`);
      } else if (pen < -50) {
        rec.notes.push(`${role} 脚底高于网格面 ${(-pen).toFixed(0)}px（落在机关体上？）`);
      }
      // 诊断：出生位地面 vs 最终站立面（滑落/悬空出生线索）
      const spawnSurf = surfaceUnder(lvl, lvl.spawn[role].x, lvl.spawn[role].y);
      if (spawnSurf && Math.abs(spawnSurf.surfaceY - surf.surfaceY) > 40) {
        rec.notes.push(`${role} 出生位地面 y=${spawnSurf.surfaceY.toFixed(0)}(${spawnSurf.kind})，最终站上 y=${surf.surfaceY.toFixed(0)}（高差 ${Math.abs(spawnSurf.surfaceY - surf.surfaceY).toFixed(0)}px）`);
      }
      if (tFb < 0 || tWg < 0) {
        /* 由下方统一记问题 */
      }
    }
    if (tFb < 0) rec.problems.push(`未站稳:fireboy 2s 内 |vy| 未降到 0.5m/s 以下并持续 1s`);
    if (tWg < 0) rec.problems.push(`未站稳:watergirl 2s 内 |vy| 未降到 0.5m/s 以下并持续 1s`);

    // ---- 浸泡判定（标准 2）----
    rec.deathRoles = Object.keys(rec.deathStep) as Array<"fireboy" | "watergirl">;
    // 出生即死：phase 翻 gameover，或翻 gameover 前浸泡窗口不足（死亡在收尾帧附近）也捕获
    if (rec.phase === "gameover" || rec.deathRoles.length > 0) {
      const detail = rec.deathRoles
        .map((role) => {
          const step = rec.deathStep[role];
          const spawnSurf = surfaceUnder(lvl, lvl.spawn[role].x, lvl.spawn[role].y);
          const liquid = spawnSurf && spawnSurf.kind.startsWith("liquid:") ? spawnSurf.kind.slice(7) : undefined;
          const kindCn = liquid ? LIQUID_CN[liquid] : "?";
          const lethal = liquid ? (lethalTo(role, liquid) ? "致死" : "免疫") : "非液体";
          return `${role}@${step}帧(出生点下${spawnSurf ? `${kindCn} r${spawnSurf.row}c${spawnSurf.col} ${lethal}` : "无支撑面"})`;
        })
        .join("; ");
      rec.problems.push(`出生即死:无输入 ${SOAK_STEPS * DT}s 内 gameover(${detail})`);
    }
    if (rec.phase === "won") rec.problems.push(`其他:无输入即通关（异常）`);
    if (rec.nanStep !== null) rec.problems.push(`NaN:角色状态第 ${rec.nanStep} 帧出现非有限值`);
    if (bodyNanSeen.size) rec.problems.push(`NaN:刚体 ${[...bodyNanSeen].join(", ")}`);
    if (rec.oobStep !== null) rec.problems.push(`掉出:第 ${rec.oobStep} 帧 ${rec.oobInfo}`);
    for (const f of rec.mechFly) rec.problems.push(`机关飞出:${f.kind}#${f.id} 距原位 ${f.dispPx}px(>960px)`);
    if (rec.bodyCountStart !== null && rec.bodyCountEnd !== null && rec.bodyCountEnd > rec.bodyCountStart) {
      rec.problems.push(`刚体泄漏:${rec.bodyCountStart} → ${rec.bodyCountEnd}`);
    } else if (rec.bodyCountStart !== null && rec.bodyCountEnd !== null && rec.bodyCountEnd < rec.bodyCountStart) {
      rec.notes.push(`刚体数 ${rec.bodyCountStart} → ${rec.bodyCountEnd}（减少 ${rec.bodyCountStart - rec.bodyCountEnd}，钻石被拾取属正常）`);
    }

    rec.ok = rec.problems.length === 0;
  } catch (e) {
    rec.problems.push(`其他:构建/步进异常 ${e instanceof Error ? e.message : String(e)}`);
    rec.ok = false;
  }
  return rec;
}

// ---------------------------------------------------------------- 测试体

const ids: string[] = [];
{
  const forest = readdirSync(`${ROOT}/data/forest/levels`).filter((f) => f.endsWith(".json")).map((f) => f.replace(".json", ""));
  forest.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  ids.push("forest_01", ...forest);
}

const results: LevelRecord[] = [];

describe("48 关行为级冒烟（无输入浸泡，标准冻结 2026-10-05）", () => {
  for (const id of ids) {
    it(`${id}：站稳 + 10s 浸泡（边界/NaN/机关/刚体数）`, () => {
      const rec = collectLevel(id);
      results.push(rec);
      if (STRICT) expect(rec.problems, `${id}: ${rec.problems.join("; ")}`).toEqual([]);
    }, 120000);
  }

  afterAll(() => {
    const pass = results.filter((r) => r.ok);
    const fail = results.filter((r) => !r.ok);
    const lines: string[] = [];
    lines.push(`48 关行为冒烟：通过 ${pass.length} / ${results.length}，异常 ${fail.length}`);
    for (const r of results) {
      lines.push(
        `${r.ok ? "PASS" : "FAIL"} ${r.id} | phase=${r.phase}` +
          ` | settle(fb/wg)=${r.settleFbS === null ? "NO" : r.settleFbS.toFixed(2)}/${r.settleWgS === null ? "NO" : r.settleWgS.toFixed(2)}s` +
          ` | pen(fb/wg)=${r.penFbPx ?? "-"}/${r.penWgPx ?? "-"}px @${r.standOnFb},${r.standOnWg}` +
          ` | bodies=${r.bodyCountStart ?? "?"}→${r.bodyCountEnd ?? "?"}` +
          (r.problems.length ? ` | 问题: ${r.problems.join("; ")}` : "") +
          (r.notes.length ? ` | 备注: ${r.notes.join("; ")}` : ""),
      );
    }
    console.log(lines.join("\n"));
    // 明细 JSON 落系统临时目录（best-effort，供人工报告取数；不入仓库）
    try {
      const out = join(tmpdir(), "fw-smoke-48-results.json");
      writeFileSync(out, JSON.stringify(results, null, 2), "utf8");
      console.log(`明细 JSON：${out}`);
    } catch {
      /* 忽略 */
    }
  });
});
