// rcm 探针 A：碰撞矩阵运行时全量普查 —— 真实 parseLevel→World 构建链逐 fixture dump，
// 与 oracle（init.eb02fbdab2aa1d24.js）字节级普查表逐项断言。
// oracle 期望值出处见 note/research/2026-10-fidelity/36-parity-collision-matrix.md §1（各行附 @偏移）。
// 复跑：npx tsx TEMP/rcm/collision-census-probe.mjs（仓库根 gyのFW 下）
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";
import { b2 } from "../../packages/shared/src/kernel/b2.js";
import { parseLevel } from "../../packages/shared/src/level2.js";
import { World } from "../../packages/shared/src/kernel/world.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const B = b2();

const LEVELS = [
  "tutorials/forest_01", // box / door / diamond / ground / slopes? / lever? pusher?
  "forest/forest_02", // prismatic platform / hanging(fullRotation) / liquid? / pusher? lever?
  "forest/forest_03", // slopes 3/4 / wind / liquid 三件套
  "forest/forest_04", // pulley / box
  "forest/forest_07", // lever / pusher / revolute platform / ball
  "forest/forest_12", // hanging 限位
  "forest/forest_14", // roman 2 点
  "forest/forest_22", // wind windWidth=1.5
  "forest/forest_24", // roman 竖直 / box 旋转
  "forest/forest_bonus_1", // window / pulley / ball
  "forest/forest_bonus_2", // boxheavy
];

function makeProvider(baseDir) {
  const cache = new Map();
  return (source) => {
    if (!cache.has(source)) {
      const p = join(baseDir, ...source.split("/"));
      cache.set(source, JSON.parse(readFileSync(decodeURI(p), "utf8")));
    }
    return cache.get(source);
  };
}

let fail = 0;
let pass = 0;
function chk(label, actual, expect, eps = 1e-9) {
  const ok = typeof expect === "number" && typeof actual === "number" ? Math.abs(actual - expect) <= eps : actual === expect;
  if (ok) pass++;
  else {
    fail++;
    console.log(`FAIL ${label}: actual=${JSON.stringify(actual)} expect=${JSON.stringify(expect)}`);
  }
  return ok;
}

// ---------- oracle 期望（值全部来自 36 号档 §1 表，偏移见该表） ----------
const EXP = {
  ground: { cat: 1, mask: 4369, group: 0, fr: 0.8, rest: 0, dens: 0, sensor: false }, // @1801193
  wall: { cat: 32768, mask: 65535, group: 0, fr: 0.2, rest: 0, dens: 0, sensor: false }, // @1562799 worldBoundsFilterCategory=32768 @1560499
  liquidSensor: { cat: 1, mask: 61695, group: 0, fr: 0.7, rest: 0, dens: 0, sensor: true }, // @1661854
  liquidIce: { cat: 1, mask: 0, group: 0, fr: 0, rest: 0, dens: 0, sensor: false }, // @1662566
  liquidDeath: { cat: 1, mask: 4369, group: 0, fr: 0.7, rest: 0, dens: 0, sensor: true }, // @1663665
  diamond: { cat: 1, mask: 65535, group: 0, fr: 0.7, rest: 0, dens: 0, sensor: true }, // @1640427
  door: { cat: 1, mask: 65535, group: 0, fr: 0.7, rest: 0, dens: 0, sensor: true }, // @1643497
  charPortal: { cat: 4096, mask: 4096, group: -1, fr: 0, rest: 0, dens: 0, sensor: false }, // @1817693 组
  charCircle: { cat: 16, mask: 4353, group: 0, fr: 0, rest: 0, dens: 0, sensor: false }, // m 助手 @1816476
  charFeet: { cat: 16, mask: 4353, group: 0, fr: 0.5, rest: 0, dens: 0, sensor: false }, // @1817706 userData "feet"
  charTrap: { cat: 16, mask: 4353, group: 0, fr: 0, rest: 0, dens: 1.4, sensor: false }, // n 助手 @1817117
  lever: { cat: 1, mask: 61695, group: 0, fr: 0.7, rest: 0, dens: 1.6, sensor: false }, // @1654717
  pusher: { cat: 1, mask: 61695, group: 0, fr: 0.7, rest: 0, dens: 0.1, sensor: false }, // @1706578
  platform: { cat: 256, mask: 4369, group: 0, fr: 0.7, rest: 0, dens: 0, sensor: false }, // @1677015（转臂 dens 0.5 单独断言）
  platformRev: { cat: 256, mask: 4369, group: 0, fr: 0.7, rest: 0, dens: 0.5, sensor: false },
  boxMain: { cat: 1, mask: 65535, group: 0, fr: 0.4, rest: 0, dens: 0.45, sensor: false }, // @1635424（filter 不设→默认）
  boxHeavyMain: { cat: 1, mask: 65535, group: 0, fr: 0.4, rest: 0, dens: 0.8, sensor: false }, // @1637788
  boxCorner: { cat: 17, mask: 4097, group: 0, fr: 0.1, rest: 0, dens: 0, sensor: false }, // @1635424
  boxHeavyCorner: { cat: 17, mask: 4097, group: 0, fr: 0.05, rest: 0, dens: 0, sensor: false }, // @1637788
  portalCircle: { cat: 4096, mask: 4096, group: 0, fr: 0.5, rest: 0, dens: 0, sensor: false }, // @1636062/@1625816
  ballMain: { cat: 17, mask: 65535, group: 0, fr: 0.2, rest: 0.1, dens: 2.3, sensor: false }, // @1625087
  windBody: { cat: 1, mask: 65535, group: 0, fr: 0.4, rest: 0, dens: 0.2, sensor: false }, // @1733328
  windSensor: { cat: 1, mask: 65535, group: 0, fr: 0.2, rest: 0, dens: 0, sensor: true }, // @1733977（friction 不设→默认 0.2）
  hangAnchor: { cat: 0, mask: 65535, group: 0, fr: 0.2, rest: 0, dens: 1, sensor: false }, // @1647262 只置 cat=0，其余插件缺省 @1559777
  hangBoard: { cat: 65535, mask: 65535, group: 0, fr: 0.4, rest: 0, dens: 2.5, sensor: false }, // @1648084
  pulleyBoard: { cat: 1, mask: 65535, group: 0, fr: 0.4, rest: 0, dens: 3, sensor: false }, // @1701170
  romanBar: { cat: 1, mask: 65535, group: 0, fr: 0.7, rest: 0, dens: 0.1, sensor: false }, // @1710157
  romanBase: { cat: 1, mask: 65535, group: 0, fr: 0.7, rest: 0, dens: 0.1, sensor: false }, // @1711112
  window: { cat: 1, mask: 61695, group: 0, fr: 0.7, rest: 0, dens: 0, sensor: false }, // @1741117
};

function fixtureInfo(f) {
  const shape = f.GetShape ? f.GetShape() : f.m_shape;
  const type = shape.GetType ? shape.GetType() : shape.m_type;
  const filter = f.GetFilterData ? f.GetFilterData() : f.m_filter;
  const ud = f.GetUserData ? f.GetUserData() : f.m_userData;
  return {
    type, // 0 circle 1 polygon? 按 vendor：e_circle=0? 以 vendor b2Shape::Type 为准（circle=0, edge=1, polygon=2? 实测打印）
    shape,
    cat: filter.categoryBits,
    mask: filter.maskBits,
    group: filter.groupIndex,
    fr: f.GetFriction ? f.GetFriction() : f.m_friction,
    rest: f.GetRestitution ? f.GetRestitution() : f.m_restitution,
    dens: f.GetDensity ? f.GetDensity() : f.m_density,
    sensor: f.IsSensor ? f.IsSensor() : f.m_isSensor,
    ud,
  };
}

function assertFixture(tag, f, exp) {
  const i = fixtureInfo(f);
  chk(`${tag} cat`, i.cat, exp.cat);
  chk(`${tag} mask`, i.mask, exp.mask);
  chk(`${tag} group`, i.group, exp.group);
  chk(`${tag} friction`, i.fr, exp.fr);
  chk(`${tag} restitution`, i.rest, exp.rest);
  chk(`${tag} density`, i.dens, exp.dens);
  chk(`${tag} sensor`, i.sensor, exp.sensor);
}

function eachFixture(body, cb) {
  let f = body.GetFixtureList();
  while (f) {
    cb(f);
    f = f.GetNext();
  }
}

let totalFixtures = 0;
const kindCounter = new Map();
function bump(k) {
  kindCounter.set(k, (kindCounter.get(k) ?? 0) + 1);
}

for (const id of LEVELS) {
  const [dirName, name] = id.includes("/") ? id.split("/") : ["forest", id];
  const dir = `${ROOT}/data/${dirName}/levels`;
  const json = JSON.parse(readFileSync(`${dir}/${name}.json`, "utf8"));
  const provider = makeProvider(`${ROOT}/packages/client/public/assets/tilemaps/tilesets`);
  const world = new World(parseLevel(name, json, provider));
  const w = world["built"] ?? world.built;

  // ---- ground body（唯一 userData "ground" 静态体）
  let groundBodies = 0;
  for (let b = w.world.GetBodyList(); b; b = b.GetNext()) {
    const bud = b.GetUserData();
    // ground
    if (bud === "ground") {
      groundBodies++;
      eachFixture(b, (f) => {
        totalFixtures++;
        bump("ground");
        assertFixture(`${name} ground`, f, EXP.ground);
      });
      continue;
    }
    // walls（静态、cat 32768、无 userData）
    const isStatic = b.GetType() === (B.b2BodyType?.b2_staticBody ?? 0) || (b.m_type === 0 && bud == null);
    let sawWall = false;
    eachFixture(b, (f) => {
      const i = fixtureInfo(f);
      if (i.cat === 32768) {
        sawWall = true;
        totalFixtures++;
        bump("wall");
        assertFixture(`${name} wall`, f, EXP.wall);
      }
    });
    if (sawWall) continue;

    // 角色体
    if (bud === "pers") {
      const fs = [];
      eachFixture(b, (f) => fs.push(f));
      // 顺序（创建序逆=链表）：b2 前插 → 链表逆创建序：梯形、脚、躯干、portal
      chk(`${name} char fixture 数`, fs.length, 4);
      const trap = fs[0], feet = fs[1], torso = fs[2], portal = fs[3];
      assertFixture(`${name} char 梯形`, trap, EXP.charTrap);
      assertFixture(`${name} char 脚`, feet, EXP.charFeet);
      chk(`${name} char 脚 userData`, fixtureInfo(feet).ud, "feet");
      assertFixture(`${name} char 躯干圆`, torso, EXP.charCircle);
      assertFixture(`${name} char portal 圆`, portal, EXP.charPortal);
      totalFixtures += 4;
      for (let k = 0; k < 4; k++) bump("char");
      // bullet/fixedRotation（vendor 方法名大写首字母：IsBullet/IsFixedRotation，vendor:7449-7455）
      chk(`${name} char bullet`, b.IsBullet(), true);
      chk(`${name} char fixedRotation`, b.IsFixedRotation(), true);
      continue;
    }

    // 其余体：按 fixture 分类断言（机关/道具/液体体/门/钻石）
    eachFixture(b, (f) => {
      totalFixtures++;
      const i = fixtureInfo(f);
      const ud = i.ud;
      const udType = ud && typeof ud === "object" ? ud.type : undefined;
      if (udType === "liquid") {
        bump("liquidSensor");
        return assertFixture(`${name} liquid 显示带`, f, EXP.liquidSensor);
      }
      if (udType === "ice") {
        bump("liquidIce");
        return assertFixture(`${name} liquid 冰带`, f, EXP.liquidIce);
      }
      if (udType === "liquid_death") {
        bump("liquidDeath");
        return assertFixture(`${name} liquid 致死带`, f, EXP.liquidDeath);
      }
      if (udType === "diamond") {
        bump("diamond");
        return assertFixture(`${name} diamond`, f, EXP.diamond);
      }
      if (udType === "door") {
        bump("door");
        return assertFixture(`${name} door`, f, EXP.door);
      }
      if (udType === "wind") {
        bump("windSensor");
        return assertFixture(`${name} wind sensor`, f, EXP.windSensor);
      }
      if (ud === "pusher") {
        bump("pusher");
        return assertFixture(`${name} pusher`, f, EXP.pusher);
      }
      if (ud === "feet") throw new Error("feet fixture 应已在 pers 分支处理");
      if (ud && typeof ud === "object" && ud["portal-sensor"]) {
        // box/ball 的 portal 圆（角色分支已处理角色的）
        // 需区分 parent 密度/摩擦无法区分 → 依赖本体内其它 fixture 已断言，这里统一断 portal 参数
        bump("portalCircle");
        return assertFixture(`${name} portal 圆`, f, EXP.portalCircle);
      }
      if (ud && typeof ud === "object" && ud.reflection) {
        // platform：密度按转臂与否
        const isRev = world.mechanisms.platforms.some((p) => p.body === b && p["isRevolute"]);
        bump("platform");
        return assertFixture(`${name} platform(${isRev ? "rev" : "pris"})`, f, isRev ? EXP.platformRev : EXP.platform);
      }
      if (ud && typeof ud === "object" && ud.lightProperties && ud.lightProperties.type === "transparent" && i.dens === 0) {
        // box/ball 主体的 portal 圆带 lightProperties（box 才有）——已在上 portal-sensor 分支处理；boxmirror 也可能——按 dens/mask 归类
        if (i.mask === 61695) {
          bump("window");
          return assertFixture(`${name} window`, f, EXP.window);
        }
        bump("boxOther");
        return;
      }
      // ---- 无 userData 的实体：按密度/摩擦联合指纹分类
      const key = `${i.cat}/${i.mask}/${i.fr}/${i.rest}/${i.dens}`;
      // window（我方 buildWindow 不设 userData；oracle userData={lightProperties} @1741006，物理等价 P2）
      if (i.cat === 1 && i.mask === 61695 && i.fr === 0.7 && i.dens === 0) {
        bump("window");
        return assertFixture(`${name} window`, f, EXP.window);
      }
      if (i.cat === 17 && i.mask === 65535) {
        bump("ballMain");
        return assertFixture(`${name} ball 主圆`, f, EXP.ballMain);
      }
      if (i.cat === 17 && i.mask === 4097) {
        // box 角圆：fr 0.1 或 0.05
        const heavy = world.mechanisms.props.some((p) => p.body === b && p.kind === "boxheavy");
        bump(heavy ? "boxHeavyCorner" : "boxCorner");
        return assertFixture(`${name} box 角圆(${heavy ? "heavy" : "std"})`, f, heavy ? EXP.boxHeavyCorner : EXP.boxCorner);
      }
      if (i.cat === 1 && i.mask === 65535 && (i.dens === 0.45 || i.dens === 0.8)) {
        const heavy = i.dens === 0.8;
        bump(heavy ? "boxHeavyMain" : "boxMain");
        return assertFixture(`${name} box 主体(${heavy ? "heavy" : "std"})`, f, heavy ? EXP.boxHeavyMain : EXP.boxMain);
      }
      if (i.cat === 1 && i.mask === 61695 && i.dens === 1.6) {
        bump("lever");
        return assertFixture(`${name} lever`, f, EXP.lever);
      }
      if (i.cat === 1 && i.mask === 65535 && i.dens === 0.1) {
        // roman bar 或 base（区分：roman bar 是动力学体）
        bump("roman");
        return assertFixture(`${name} roman`, f, EXP.romanBar);
      }
      if (i.cat === 65535 && i.dens === 2.5) {
        bump("hangBoard");
        return assertFixture(`${name} hanging 板`, f, EXP.hangBoard);
      }
      if (i.cat === 1 && i.dens === 3) {
        bump("pulleyBoard");
        return assertFixture(`${name} pulley 板`, f, EXP.pulleyBoard);
      }
      if (i.cat === 0) {
        bump("hangAnchor");
        return assertFixture(`${name} hanging 锚`, f, EXP.hangAnchor);
      }
      if (i.cat === 1 && i.mask === 65535 && i.fr === 0.4 && i.dens === 0.2) {
        bump("windBody");
        return assertFixture(`${name} wind 机身`, f, EXP.windBody);
      }
      // 未分类 → 打印出来人工判
      bump(`UNCLASSIFIED(${key})`);
      console.log(`  [${name}] UNCLASSIFIED body ud=${JSON.stringify(bud)} fixture cat=${i.cat} mask=${i.mask} grp=${i.group} fr=${i.fr} rest=${i.rest} dens=${i.dens} sensor=${i.sensor} ud=${JSON.stringify(i.ud)}`);
    });
  }
  chk(`${name} groundBody 唯一`, groundBodies, 1);
}

console.log(`\n=== 普查覆盖：${LEVELS.length} 关、${totalFixtures} fixtures、${kindCounter.size} 类 ===`);
for (const [k, n] of [...kindCounter.entries()].sort()) console.log(`  ${k}: ${n}`);
console.log(`\nPASS=${pass} FAIL=${fail}`);
process.exit(fail > 0 ? 1 : 0);
