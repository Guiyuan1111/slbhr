// D1 复现+验证：forest_07 转臂驱动到 state1 稳态，读体角（oracle 钳制语义应 = −90.000°）
import { readFileSync } from "node:fs";
import { parseLevel } from "../../packages/shared/src/level2.js";
import { World } from "../../packages/shared/src/kernel/world.js";

const dir = "packages/client/public/data/forest/levels";
const provider = (src: string) => JSON.parse(readFileSync(decodeURIComponent(new URL(src, `file://${process.cwd()}/${dir}/`).pathname), "utf8"));
const json = JSON.parse(readFileSync(`${dir}/forest_07.json`, "utf8"));
const w = new World(parseLevel("forest_07", json, provider));

const arm = w.mechanisms.platforms.find((p: any) => p.isRevolute)!;
arm.state = 1;
arm.updateState(false);
const NONE = { up: false, left: false, right: false };
for (let i = 0; i < 180; i++) w.step(1 / 60, { fireboy: NONE, watergirl: NONE });
console.log("arm angle(deg) after 3s @state1:", ((arm.body.GetAngle() * 180) / Math.PI).toFixed(3));
