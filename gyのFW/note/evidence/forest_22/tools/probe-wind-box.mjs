import { readFileSync } from "node:fs";
import { parseLevel } from "../../packages/shared/src/level2.js";
import { World } from "../../packages/shared/src/kernel/world.js";

const dir = "packages/client/public/data/forest/levels";
const provider = (src) => JSON.parse(readFileSync(decodeURIComponent(new URL(src, `file://${process.cwd()}/${dir}/`).pathname), "utf8"));

// forest_22：风柱传感器半宽（数据 windWidth=1.5 的柱应 0.75m；缺省柱 1.3m）
{
  const json = JSON.parse(readFileSync(`${dir}/forest_22.json`, "utf8"));
  const w = new World(parseLevel("forest_22", json, provider));
  for (const b of w.mechanisms.winds) {
    let f = b.body.GetFixtureList();
    while (f) {
      const sh = f.GetShape();
      const vs = sh.vertices ?? sh.m_vertices;
      if (vs && vs.length >= 2) {
        const hw = Math.abs(vs[1].x - vs[0].x) / 2;
        console.log(`wind group=${b.group} len=${b.lengthM}m sensorHalfWidth=${hw.toFixed(3)}m`);
        break;
      }
      f = f.GetNext();
    }
  }
}
// forest_24_1：rotation≠0 的箱世界中心（原版应为 1092.107, 859.038）
{
  const json = JSON.parse(readFileSync(`${dir}/forest_24_1.json`, "utf8"));
  const w = new World(parseLevel("forest_24_1", json, provider));
  for (const b of w.mechanisms.props) {
    if (b.kind === "ball") continue;
    const ang = b.body.GetAngle() * 180 / Math.PI;
    if (Math.abs(ang) > 1) {
      const p = b.body.GetPosition();
      console.log(`box angle=${ang.toFixed(3)}° center screen=(${(-p.x*32).toFixed(3)}, ${(-p.y*32).toFixed(3)})  [原版 (1092.107, 859.038)]`);
    }
  }
}
