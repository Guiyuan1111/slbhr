// 量两图四边黑边宽度（找首个亮度>40 的行列）
import { chromium } from "playwright";
import fs from "node:fs";
const level = process.argv[2];
const b64 = (p) => "data:image/png;base64," + fs.readFileSync(p, "base64");
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const out = await page.evaluate(async (args) => {
  const load = (src) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
  const [ia, ib] = await Promise.all([load(args.a), load(args.b)]);
  const probe = (img) => {
    const c = document.createElement("canvas"); c.width = img.width; c.height = img.height;
    const x = c.getContext("2d"); x.drawImage(img, 0, 0);
    const d = x.getImageData(0, 0, img.width, img.height).data;
    const lum = (i) => 0.299*d[i*4] + 0.587*d[i*4+1] + 0.114*d[i*4+2];
    const midY = (img.height/2|0)*img.width, midX = img.width/2|0;
    let L=0; while (L<img.width && lum(midY+L)<=40) L++;
    let R=0; while (R<img.width && lum(midY+img.width-1-R)<=40) R++;
    let T=0; while (T<img.height && lum(T*img.width+midX)<=40) T++;
    let B=0; while (B<img.height && lum((img.height-1-B)*img.width+midX)<=40) B++;
    return {left:L,right:R,top:T,bottom:B};
  };
  return { oracle: probe(ia), ours: probe(ib) };
}, { a: b64(`TEMP/pvis/${level}/oracle.png`), b: b64(`TEMP/pvis/${level}/ours.png`) });
console.log(level, JSON.stringify(out));
await browser.close();
