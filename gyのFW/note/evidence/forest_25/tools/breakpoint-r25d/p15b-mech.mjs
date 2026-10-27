// dump 所有动态体/机关对象位置
import { makeWorld } from "../../scripts/e2e/routetool/kernel.mjs";
const w = makeWorld("forest_25");
console.log("mechs keys:", Object.keys(w.mechs ?? {}));
for (const [k, arr] of Object.entries(w.mechs ?? {})) {
  if (Array.isArray(arr)) for (const m of arr) {
    const b = m.body ?? m.b;
    const pos = b?.GetPosition ? (() => { const p = b.GetPosition(); return { x: -p.x * 32, y: -p.y * 32 }; })() : (m.anchor ?? m.pos ?? null);
    console.log(k, m.id ?? k, "pos=", pos && `${Math.round(pos.x)},${Math.round(pos.y)}`, "extra=", JSON.stringify(Object.keys(m)));
  }
}
// 动态 body 全扫（非 static）
const m2px = (p) => `${Math.round(-p.x * 32)},${Math.round(-p.y * 32)}`;
for (let b = w.built.world.GetBodyList(); b; b = b.GetNext()) {
  const t = b.GetType(); // 0 static 1 kinematic 2 dynamic
  if (t === 0) continue;
  const p = b.GetPosition();
  const ud = b.GetUserData?.();
  console.log("body type", t, "at", m2px(p), "userData=", typeof ud === "object" ? JSON.stringify(ud)?.slice(0, 120) : String(ud).slice(0, 80));
}
