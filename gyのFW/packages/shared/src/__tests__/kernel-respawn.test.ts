/**
 * RespawnManager 内核单测（F 部 fairytales，fairies_000 / fairies-08 真数据）。
 *
 * oracle 对位：fairy-tales.min.js L61065–61179（01号档 §2.3）。
 * 覆盖：站定自动抓取（≥667ms/份、环形上限 5、门条件）、fairy 移动后 loadLatest
 * 位级回放+队列重置、props（箱/球）回放、4 秒年龄门双分支、双跑确定性。
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";
import { describe, expect, it } from "vitest";
import { parseLevel } from "../level2.js";
import { RespawnManager } from "../kernel/respawn.js";
import { World } from "../kernel/world.js";

// packages/shared/src/__tests__ → 仓库根
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");

function loadLevel(id: string, dir: string) {
  const json = JSON.parse(readFileSync(`${ROOT}/data/${dir}/${id}.json`, "utf8"));
  const cache = new Map<string, any>();
  const prov = (source: string) => {
    if (!cache.has(source)) {
      cache.set(source, JSON.parse(readFileSync(fileURLToPath(new URL(source, `file:///${ROOT}/data/${dir}/`)), "utf8")));
    }
    return cache.get(source);
  };
  return parseLevel(id, json, prov);
}

const IDLE = { fireboy: { up: false, left: false, right: false }, watergirl: { up: false, left: false, right: false } };
const RIGHT = { fireboy: { up: false, left: false, right: true }, watergirl: { up: false, left: false, right: false } };
const DT = 1 / 60;
/** 帧号 → 仿真 ms（不取整，666ms 门用原始 float 判定） */
const frameMs = (i: number) => i * (1000 / 60);

describe("RespawnManager 内核（fairies_000 真数据，oracle §2.3）", () => {
  it("站定自动抓检查点：10s 共 15 份（667ms 门）、环形上限 5、快照内容为站定态", () => {
    const lv = loadLevel("fairies_000", "tutorials/levels");
    const w = new World(lv);
    const rm = new RespawnManager(w);
    let grabs = 0;
    for (let i = 1; i <= 600; i++) {
      w.step(DT, IDLE);
      if (rm.maybeCheckpoint(frameMs(i), IDLE)) grabs++;
    }
    // 抓取帧 = 2,42,…,562（首帧 m_normal 尚未由 character.update 预填，oracle 守卫同款
    // 跳过）→ 恰 15 份；队列 shift 后留 5
    expect(grabs).toBe(15);
    expect(rm.checkpoints.length).toBe(5);
    expect(rm.checkpoints.length).toBeGreaterThanOrEqual(1);
    expect(rm.checkpoints.length).toBeLessThanOrEqual(5);
    // 相邻保留份的抓取时刻差 >666ms（oracle elapsedSince(last) > 666）
    for (let i = 1; i < rm.checkpoints.length; i++) {
      expect(rm.checkpoints[i].timeMs - rm.checkpoints[i - 1].timeMs).toBeGreaterThan(666);
    }
    // 快照内容 = 站定口径：双角色速度 0、有地面法线（>0.9）体位；仙女 3 只（01号档 §5）
    const cp = rm.checkpoints[0];
    for (const c of cp.characters) {
      expect(c.vx).toBe(0);
      expect(c.vy).toBe(0);
      expect(c.av).toBe(0);
    }
    expect(cp.fairies.length).toBe(3);
    expect(cp.props.length).toBe(0); // fairies_000 无箱/球（01号档 §3.3 objects=14 清单）
    // timerMs 与宿主计时器同步（checkpoints[0] = 保留队列最老一份 @帧402）
    expect(cp.timerMs).toBeCloseTo(frameMs(402), 6);
  });

  it("门条件：dying 或光标激活时不抓（oracle 条件 2/5）", () => {
    const lv = loadLevel("fairies_000", "tutorials/levels");
    const w = new World(lv);
    const rm = new RespawnManager(w);
    for (let i = 1; i <= 120; i++) {
      w.step(DT, IDLE);
      rm.maybeCheckpoint(frameMs(i), IDLE);
    }
    expect(rm.checkpoints.length).toBe(3); // 帧 2/42/82 三份
    // dying：oracle !pers1.dying && !pers2.dying——单侧死亡即停抓
    w.players.fireboy.kill();
    for (let i = 121; i <= 360; i++) {
      w.step(DT, IDLE);
      rm.maybeCheckpoint(frameMs(i), IDLE);
    }
    expect(rm.checkpoints.length).toBe(3); // 死后 240 帧零新增
    // 光标激活：新世界按住 right（checkActive 口径）——门 5 拦截（即使瞬时速度为 0）
    const w2 = new World(loadLevel("fairies_000", "tutorials/levels"));
    const rm2 = new RespawnManager(w2);
    w2.step(DT, IDLE);
    rm2.maybeCheckpoint(frameMs(1), IDLE);
    w2.step(DT, IDLE);
    rm2.maybeCheckpoint(frameMs(2), IDLE);
    expect(rm2.checkpoints.length).toBe(1);
    for (let i = 2; i <= 360; i++) {
      w2.step(DT, RIGHT);
      rm2.maybeCheckpoint(frameMs(i), RIGHT);
    }
    expect(rm2.checkpoints.length).toBe(1); // 6s 按键零新增
  });

  it("loadLatest：仙女被拖走后回放 4 秒前最近一份（位级），队列重置为该份并返回 timerMs", () => {
    const lv = loadLevel("fairies_000", "tutorials/levels");
    const w = new World(lv);
    const rm = new RespawnManager(w);
    let simMs = 0;
    for (let i = 1; i <= 420; i++) {
      w.step(DT, IDLE);
      simMs = frameMs(i);
      rm.maybeCheckpoint(simMs, IDLE);
    }
    expect(rm.checkpoints.length).toBe(5);
    const fi = w.fairies.findIndex((f) => f.group === 4);
    expect(fi).toBeGreaterThanOrEqual(0);
    // 拖 group4 仙女远离（物理系远处；fairy 测试同款 setDrag 口径），再走 2s
    const fy = w.fairies[fi];
    const beforeX = fy.body.GetPosition().x;
    for (let i = 421; i <= 540; i++) {
      fy.setDrag({ x: -20, y: -2 });
      w.step(DT, IDLE);
      simMs = frameMs(i);
      rm.maybeCheckpoint(simMs, IDLE);
    }
    expect(fy.body.GetPosition().x).not.toBe(beforeX);
    // 9000ms 时队列内各份 age 全 <4s（最老 ~2967ms）→ 回退第一份（oracle fallback q[0]）
    const timer = rm.loadLatest(simMs);
    const pick = rm.checkpoints[0];
    expect(timer).toBe(pick.timerMs);
    // 位级回放：仙女主 body 位姿 = 快照值；双角色同理
    const p = fy.body.GetPosition();
    expect(p.x).toBe(pick.fairies[fi].x);
    expect(p.y).toBe(pick.fairies[fi].y);
    const v = fy.body.GetLinearVelocity();
    expect(v.x).toBe(pick.fairies[fi].vx);
    expect(v.y).toBe(pick.fairies[fi].vy);
    expect(w.players.fireboy.body.GetPosition().x).toBe(pick.characters[0].x);
    expect(w.players.watergirl.body.GetPosition().x).toBe(pick.characters[1].x);
    // 队列重置为该份单元素（oracle checkpoints = [a]）；timeMs 刷新为 nowMs
    expect(rm.checkpoints.length).toBe(1);
    expect(rm.checkpoints[0]).toBe(pick);
    expect(pick.timeMs).toBe(simMs);
  });

  it("年龄门双分支：>4s 取从新到旧第一份；全部 <4s 回退最老；空队列返回 null", () => {
    const w = new World(loadLevel("fairies_000", "tutorials/levels"));
    const rm = new RespawnManager(w);
    expect(rm.loadLatest(1000)).toBeNull(); // oracle 此路 TypeError，内核契约 = null
    // 直调 grabCheckpoint 构造三份（oracle prototype 方法），时间跨 4s 门两侧
    for (const t of [1000, 2000, 3000]) {
      rm.checkpoints.push(rm.grabCheckpoint(t));
    }
    // 三份 age（20000−t）全 >4s → 从新到旧第一份 = timeMs 3000 那份
    const timer = rm.loadLatest(20000);
    expect(rm.checkpoints.length).toBe(1);
    expect(rm.checkpoints[0].timeMs).toBe(20000);
    expect(timer).toBe(rm.checkpoints[0].timerMs);
    // 回退分支：单份且 age <4s → 取第一份
    const w2 = new World(loadLevel("fairies_000", "tutorials/levels"));
    const rm2 = new RespawnManager(w2);
    rm2.checkpoints.push(rm2.grabCheckpoint(1000));
    const t2 = rm2.loadLatest(3000);
    expect(t2).toBe(rm2.checkpoints[0].timerMs);
    expect(rm2.checkpoints[0].timeMs).toBe(3000);
  });

  it("props（箱/球）快照与回放：位移+角速度位级恢复（fairies-08 真数据）", () => {
    const lv = loadLevel("fairies-08", "fairytales/levels");
    const w = new World(lv);
    const rm = new RespawnManager(w);
    // settle 60 帧后手动抓两份（grabCheckpoint 直调，不经站定门）
    for (let i = 1; i <= 60; i++) w.step(DT, IDLE);
    const c0 = rm.grabCheckpoint(0);
    rm.checkpoints.push(c0);
    const ballIdx = w.mechanisms.props.findIndex((p) => p.kind === "ball");
    const boxIdx = w.mechanisms.props.findIndex((p) => p.kind.startsWith("box"));
    expect(ballIdx).toBeGreaterThanOrEqual(0);
    expect(boxIdx).toBeGreaterThanOrEqual(0);
    // 挪球（SetPositionXY 不唤醒语义同 oracle 恢复族）+ 给箱子角速度
    const ball = w.mechanisms.props[ballIdx].body;
    const bp = ball.GetPosition();
    ball.SetPositionXY(bp.x + 0.5, bp.y + 0.25);
    w.mechanisms.props[boxIdx].body.SetAngularVelocity(1.5);
    const c1 = rm.grabCheckpoint(3000);
    rm.checkpoints.push(c1);
    expect(c1.props[ballIdx].x).not.toBe(c0.props[ballIdx].x);
    expect(c1.props[boxIdx].av).toBe(1.5);
    // 6000ms：c1 age 3000 <4s、c0 age 6000 >4s → 从新到旧第一份 = c0
    const timer = rm.loadLatest(6000);
    expect(timer).toBe(c0.timerMs);
    const bp2 = ball.GetPosition();
    expect(bp2.x).toBe(c0.props[ballIdx].x);
    expect(bp2.y).toBe(c0.props[ballIdx].y);
    expect(w.mechanisms.props[boxIdx].body.GetAngularVelocity()).toBe(c0.props[boxIdx].av);
    // 队列重置
    expect(rm.checkpoints.length).toBe(1);
  });

  it("双跑确定性：同输入同仿真钟 → 检查点队列与回放结果逐位一致", () => {
    const run = () => {
      const w = new World(loadLevel("fairies_000", "tutorials/levels"));
      const rm = new RespawnManager(w);
      let simMs = 0;
      for (let i = 1; i <= 420; i++) {
        w.step(DT, IDLE);
        simMs = frameMs(i);
        rm.maybeCheckpoint(simMs, IDLE);
      }
      const cps = JSON.parse(JSON.stringify(rm.checkpoints));
      const timer = rm.loadLatest(simMs);
      const fy = w.fairies.find((f) => f.group === 4)!;
      return {
        cps,
        timer,
        fairy: [fy.body.GetPosition().x, fy.body.GetPosition().y],
        fb: [w.players.fireboy.body.GetPosition().x, w.players.fireboy.body.GetPosition().y],
      };
    };
    expect(run()).toEqual(run());
  });
});
