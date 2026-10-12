import { makeWorld } from "../../scripts/e2e/routetool/kernel.mjs";
const L = makeWorld("forest_28").level;
for (const k of ["boxes","pushers","balls","hangings","pulleys","romans","windows"]) console.log(k, JSON.stringify(L[k]));
