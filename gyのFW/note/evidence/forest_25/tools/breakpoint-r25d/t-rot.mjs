// r25d t2：内省 b2Rot / SetTransform 签名
import { makeWorld } from "../../scripts/e2e/routetool/kernel.mjs";
const w = makeWorld("forest_25");
const Bns = globalThis.box2d;
console.log("b2Rot:", typeof Bns?.b2Rot, Object.getOwnPropertyNames(Bns?.b2Rot?.prototype ?? {}));
const r = new Bns.b2Rot(0);
console.log("rot instance:", Object.getOwnPropertyNames(r), "GetAngleRadians:", typeof r.GetAngleRadians);
const fb = w.players.fireboy;
console.log("SetTransform source:", fb.body.SetTransform.toString().slice(0, 300));
