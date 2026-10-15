// rb1 探针：BallPrototype 逐参数保真实证（只读复用仓库源码，不改任何 .ts/.mjs 源码）
// 34 号档（note/research/2026-10-fidelity/34-parity-ball.md）的运行时证据。
//
// oracle 事实（init.eb02fbdab2aa1d24.js latin1 偏移）：
//   @1624705 Ball = BoxedDevice 子类；构造序：
//     1) b.x -= mpx(0.5)（-16px）、b.y += mpx(0.65)（+20.8px）   [mpx=×32 正向 @1565877]
//     2) BoxedDevice：e=(mpx(boxSize.x/2), mpx(boxSize.y/2))=(32,32)px 按 -rotation 旋转，
//        x+=e.x、y-=e.y（boxSize 原型 {2,2}，Ball 未覆写 @1624373）
//     3) Device：enable(sprite)→clearFixtures()→SetAngle(π·rotation/180||0)
//     4) 主圆 fixture：r=this.radius(=0.4 @1626618)、friction 0.2、restitution 0.1、
//        density 2.3、filter.categoryBits=17（maskBits 不设→vendor 默认 65535 @1412845）
//     5) properties.linearDamping/angularDamping 存在才 Set*Damping（数据面 20/20 无）
//     6) portal 圆：r0.1@(0,0)、cat4096/mask4096、fr0.5、density0、userData portal-sensor、
//        isSensor 缺省 false（实心，与同 cat/mask 的 portal fixture 相撞=传送检测通道）
//   @1902980 createObjects：new Ball(game, 地图对象原样)（Phaser parser @1040068 对 tile 对象
//     原样透传 x/y（y=Tiled 底边）、rotation 仅非零带、无 width/height）
//   Ball 不调用 registerDevice（无 state，不进 MechManager.devices）。
//
// 本探针：走真实 parseLevel→World 构建链，dump 全部 13 关 20 个 ball 体，
// 与上述 oracle 公式从原始 JSON 现算的期望值逐项比对（位置/体角/阻尼/质量/惯量/fixture 全参数），
// 并打印关键接触过滤交叉表与 vendor 默认 filter。
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";
import { b2, m2px } from "../../../../packages/shared/src/kernel/b2.js";
import { parseLevel } from "../../../../packages/shared/src/level2.js";
import { World } from "../../../../packages/shared/src/kernel/world.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
const B = b2();

const BALL_LEVELS = [
  "forest_04_1", "forest_07", "forest_08", "forest_19", "forest_19_1", "forest_20",
  "forest_27", "forest_27_1", "forest_29", "forest_32", "forest_32_1", "forest_bonus_1", "forest_bonus_3",
];

function makeProvider(baseDir) {
  const cache = new Map();
  return (source) => {
    if (!cache.has(source)) {
      const p = new URL(source, `file:///${baseDir}/`).pathname.replace(/^\/([A-Za-z]:)/, "$1");
      cache.set(source, JSON.parse(readFileSync(decodeURI(p), "utf8")));
    }
    return cache.get(source);
  };
}

// oracle 公式现算：raw x=左缘、y=底边 → 体心 px=(x+16, y-11.2)；物理=(−px/32, −py/32)
function oracleBallCenterPx(o) {
  return { x: o.x + 16, y: o.y - 11.2 };
}

let fail = 0;
function chk(label, actual, expect, eps = 1e-9) {
  const ok = typeof expect === "number" ? Math.abs(actual - expect) <= eps : actual === expect;
  if (!ok) fail++;
  return `${ok ? "PASS" : "FAIL"} ${label}: actual=${actual} expect=${expect}`;
}

// ---- 0. vendor 默认 filter（oracle @1412845 原型默认 1/65535/0 的我方引擎直证）
{
  const fd = new B.b2FixtureDef();
  console.log("[vendor 默认 filter]", "cat=", fd.filter.categoryBits, "mask=", fd.filter.maskBits, "group=", fd.filter.groupIndex);
}

// ---- 1. 逐关逐球对照
const rawByLevel = {};
for (const id of BALL_LEVELS) {
  const dir = `${ROOT}/data/forest/levels`;
  const json = JSON.parse(readFileSync(`${dir}/${id}.json`, "utf8"));
  // 原始 JSON 里的 ball 对象（与 level2.resolveGid 同语义：取 firstgid≤gid 中最大者）
  const provider = makeProvider(`${ROOT}/packages/client/public/assets/tilemaps/tilesets`);
  const resolveGid = (gid) => {
    let best;
    for (const t of json.tilesets) {
      const fg = Number(t.firstgid);
      if (fg <= gid && (!best || fg >= best.firstgid)) best = { firstgid: fg, source: String(t.source) };
    }
    return best;
  };
  const rawBalls = [];
  for (const layer of json.layers) {
    if (layer.type !== "objectgroup") continue;
    for (const o of layer.objects ?? []) {
      if (!o.gid) continue;
      const ref = resolveGid(Number(o.gid));
      const ts = provider(ref.source.split("/").pop());
      const local = Number(o.gid) - ref.firstgid;
      if (ts?.tiles?.[String(local)]?.type === "ball") rawBalls.push(o);
    }
  }
  rawByLevel[id] = rawBalls;

  const world = new World(parseLevel(id, json, makeProvider(dir)));
  const balls = world.mechanisms.props.filter((p) => p.kind === "ball");
  console.log(`\n== ${id}: raw=${rawBalls.length} kernel=${balls.length}`);
  if (rawBalls.length !== balls.length) { console.log(`FAIL 数量不一致`); fail++; }

  for (let i = 0; i < balls.length; i++) {
    const body = balls[i].body;
    const pos = body.GetPosition();
    const px = { x: m2px(pos.x), y: m2px(pos.y) };
    const exp = oracleBallCenterPx(rawBalls[i]);
    console.log(` ball#${i} objid=${rawBalls[i].id} raw=(${rawBalls[i].x},${rawBalls[i].y})`);
    if (Math.abs(px.x - exp.x) > 1e-9 || Math.abs(px.y - exp.y) > 1e-9) {
      console.log(`   FAIL 体心: kernel=(${px.x}, ${px.y}) oracle公式=(${exp.x}, ${exp.y})`); fail++;
    } else {
      console.log(`   PASS 体心px (${px.x.toFixed(4)}, ${px.y.toFixed(4)})`);
    }
    console.log("  ", chk("体角rad", body.GetAngle(), 0));
    console.log("  ", chk("linearDamping", body.GetLinearDamping(), 0));
    console.log("  ", chk("angularDamping", body.GetAngularDamping(), 0));
    const m = body.GetMass(), I = body.GetInertia();
    const expM = 2.3 * Math.PI * 0.4 * 0.4;           // ρπr²
    const expI = 0.5 * expM * 0.4 * 0.4;              // 圆盘 ½mr²
    console.log("  ", chk("mass", m, expM, 1e-9));
    console.log("  ", chk("inertia", I, expI, 1e-9));
    // fixtures（GetFixtureList 为创建序之逆，按形状签名标注；oracle 创建序：主圆先、portal 圆后）
    let f = body.GetFixtureList(), fi = 0, sawMain = false, sawPortal = false;
    for (; f; f = f.GetNext(), fi++) {
      const sh = f.GetShape();
      const flt = f.GetFilterData();
      const isPortal = flt.categoryBits === 4096;
      if (isPortal) sawPortal = true; else sawMain = true;
      const tag = isPortal ? "portal圆" : "主圆";
      console.log(`   fixture[${tag}] r=${sh.m_radius} m_p=(${sh.m_p?.x},${sh.m_p?.y}) fr=${f.GetFriction()} rest=${f.GetRestitution()} ρ=${f.GetDensity()} cat=${flt.categoryBits} mask=${flt.maskBits} grp=${flt.groupIndex} sensor=${f.IsSensor()} userData=${JSON.stringify(f.GetUserData())}`);
    }
    if (fi !== 2 || !sawMain || !sawPortal) { console.log(`   FAIL fixture 数=${fi} sawMain=${sawMain} sawPortal=${sawPortal} 期望 主圆+portal圆`); fail++; }
  }
}

// ---- 2. 接触过滤交叉表（纯算术；oracle 常数：char cat16/mask4353 @1816520、平台 cat256/mask4369
//          @1677052、box 角圆 cat17/mask4097 @1635463、墙 cat32768/mask65535 @1562837）
console.log("\n== 接触过滤交叉（可碰撞 ⇔ (A.mask&B.cat)≠0 且 (B.mask&A.cat)≠0）");
const pairs = [
  ["ball主圆(17/65535)", 17, 65535, "角色(16/4353)", 16, 4353],
  ["ball主圆(17/65535)", 17, 65535, "平台(256/4369)", 256, 4369],
  ["ball主圆(17/65535)", 17, 65535, "box角圆(17/4097)", 17, 4097],
  ["ball主圆(17/65535)", 17, 65535, "墙(32768/65535)", 32768, 65535],
  ["ball主圆(17/65535)", 17, 65535, "地面(1/4369)", 1, 4369],
  ["ballportal圆(4096/4096)", 4096, 4096, "角色(16/4353)", 16, 4353],
  ["ballportal圆(4096/4096)", 4096, 4096, "portal fixture(4096/4096)", 4096, 4096],
];
for (const [na, ca, ma, nb, cb, mb] of pairs) {
  const hit = (ma & cb) !== 0 && (mb & ca) !== 0;
  console.log(`  ${hit ? "碰撞" : "穿越"}  ${na} × ${nb}  (mask&cat=${ma & cb}/${mb & ca})`);
}

console.log(`\n== 结论：${fail === 0 ? "全部 PASS" : fail + " 项 FAIL"}`);
process.exit(fail === 0 ? 0 : 1);
