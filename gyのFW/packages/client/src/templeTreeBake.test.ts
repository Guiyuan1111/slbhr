/**
 * templeTreeBake 核心数学单测（无 DOM；DOM 路径由 e2e 视觉门禁覆盖）。
 * 断言值来源：oracle RT 逐字节对拍（note/research/2026-10-fidelity/37 §滤镜还原）：
 *  - 内部平色：全树 (78,60,14)、金 (216,181,27)——CM 输入 128/127 的 fp32 残差双向实证
 *  - t=200 三次迭代 / t=180 fp32 四次迭代怪癖（金内部 127 仅在 4 次迭代+round 语义下成立）
 */
import { describe, expect, it } from "vitest";
import { bevelColorMatrix, buildSAT, loopOffsets, outlinePass, premultToStraight } from "./scenes/templeTreeBake";

/**
 * r49 参照实现：`outlinePass` 改造前把 `Math.cos(ang)`/`Math.sin(ang)` 写在逐像素内层。
 * 仅供测试比对——正式实现已把这些循环不变量 hoist 出去。
 */
function outlinePassRef(
  rgba: Uint8ClampedArray,
  w: number,
  h: number,
  opts: { Cf: number; Kf: number; alpha: Uint8ClampedArray; sat: Int32Array; y0?: number; y1?: number },
): void {
  const fr = Math.fround;
  const { Cf, Kf, alpha, sat } = opts;
  const WTX = w, WTY = h;
  const FX = WTX / Cf, FY = WTY / Kf;
  const offX = 3 * (WTX / Cf), offY = 3 * (WTY / Kf);
  const angles: number[] = [];
  for (let a = fr(-Math.PI); a <= Math.PI; a = fr(a + 0.3142)) angles.push(a);
  const y0 = opts.y0 ?? 0, y1 = opts.y1 ?? h;
  const R = Math.ceil(offX) + 2;
  const sampleA2 = (
    al: Uint8ClampedArray, ww: number, hh: number, tx: number, ty: number,
  ): number => {
    const px = tx - 0.5, py = ty - 0.5;
    const x0 = Math.floor(px), y0i = Math.floor(py);
    const fx = px - x0, fy = py - y0i;
    const xa = x0 < 0 ? 0 : x0 >= ww ? ww - 1 : x0;
    const xb = x0 + 1 < 0 ? 0 : x0 + 1 >= ww ? ww - 1 : x0 + 1;
    const ya = y0i < 0 ? 0 : y0i >= hh ? hh - 1 : y0i;
    const yb = y0i + 1 < 0 ? 0 : y0i + 1 >= hh ? hh - 1 : y0i + 1;
    const r0 = ya * ww, r1 = yb * ww;
    const top = al[r0 + xa] * (1 - fx) + al[r0 + xb] * fx;
    const bot = al[r1 + xa] * (1 - fx) + al[r1 + xb] * fx;
    return (top * (1 - fy) + bot * fy) / 255;
  };
  const satSum = (s: Int32Array, stride: number, x0: number, y0i: number, x1: number, y1i: number): number => {
    const xa = Math.max(0, x0), ya = Math.max(0, y0i);
    const xb = Math.min(stride - 1, x1), yb = Math.min(Math.floor(s.length / (w + 1)) - 1, y1i);
    if (xb <= xa || yb <= ya) return 0;
    return s[yb * stride + xb] - s[ya * stride + xb] - s[yb * stride + xa] + s[ya * stride + xa];
  };
  for (let y = y0; y < y1; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const ownA = alpha[y * w + x] / 255;
      if (ownA >= 0.1) {
        rgba[i + 3] = 255;
        continue;
      }
      if (satSum(sat, w + 1, x - R, y - R, x + R + 1, y + R + 1) === 0) continue;
      const t0x = (x + 0.5) * FX, t0y = (y + 0.5) * FY;
      let maxA = 0;
      for (const ang of angles) {
        const v = sampleA2(alpha, w, h, t0x - offX * Math.cos(ang), t0y - offY * Math.sin(ang));
        if (v > maxA) maxA = v;
      }
      const resA = Math.max(maxA, ownA);
      rgba[i] = Math.round(fr(fr(rgba[i] / 255) * resA) * 255);
      rgba[i + 1] = Math.round(fr(fr(rgba[i + 1] / 255) * resA) * 255);
      rgba[i + 2] = Math.round(fr(fr(rgba[i + 2] / 255) * resA) * 255);
      rgba[i + 3] = Math.round(resA * 255);
    }
  }
}

describe("outlinePass 循环不变量 hoist 位级等价（r49）", () => {
  /** 构造带轮廓的输入：中心块 + 稀疏点 + 半透明区，覆盖面覆盖三条分支 */
  function makeCase(w: number, h: number): { rgba: Uint8ClampedArray; alpha: Uint8ClampedArray; sat: Int32Array } {
    const alpha = new Uint8ClampedArray(w * h);
    for (let y = 10; y < h - 10; y++) for (let x = 10; x < w - 10; x++) {
      // 中心矩形：不透明
      if (x > w * 0.3 && x < w * 0.7 && y > h * 0.25 && y < h * 0.75) alpha[y * w + x] = 255;
    }
    // 半透明条（ownA 在 0.1 附近的两侧都覆盖）
    for (let x = 0; x < w; x += 7) for (let y = 2; y < 8; y++) alpha[y * w + x] = 20;
    for (let x = 3; x < w; x += 11) alpha[(h - 4) * w + x] = 30;
    // 全透明角落留给「窗口空 → 跳过」分支
    const rgba = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < w * h; i++) {
      rgba[i * 4] = (i * 37) % 256;
      rgba[i * 4 + 1] = (i * 53) % 256;
      rgba[i * 4 + 2] = (i * 71) % 256;
      rgba[i * 4 + 3] = 255;
    }
    return { rgba, alpha, sat: buildSAT(alpha, w, h) };
  }

  it("整层：参照臂与当前实现逐字节一致", () => {
    const w = 64, h = 56;
    const { rgba, alpha, sat } = makeCase(w, h);
    const opts = { Cf: w, Kf: h, alpha, sat };
    const a = new Uint8ClampedArray(rgba);
    const b = new Uint8ClampedArray(rgba);
    outlinePassRef(a, w, h, opts);
    outlinePass(b, w, h, opts);
    let diff = -1;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) { diff = i; break; }
    expect(diff, `首个差异 @${diff}: ${a[diff]} vs ${b[diff]}`).toBe(-1);
  });

  it("分片边界（y0/y1 三段）逐字节一致", () => {
    const w = 64, h = 56;
    const { rgba, alpha, sat } = makeCase(w, h);
    const a = new Uint8ClampedArray(rgba);
    const b = new Uint8ClampedArray(rgba);
    for (const [y0, y1] of [[0, 19], [19, 38], [38, 56]]) {
      outlinePassRef(a, w, h, { Cf: w, Kf: h, alpha, sat, y0, y1 });
      outlinePass(b, w, h, { Cf: w, Kf: h, alpha, sat, y0, y1 });
    }
    let diff = -1;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) { diff = i; break; }
    expect(diff, `首个差异 @${diff}: ${a[diff]} vs ${b[diff]}`).toBe(-1);
  });

  it("FX/FY≠1（Cf/Kf 与画布不等，复现真实压缩比）", () => {
    const w = 80, h = 64, Cf = 1036, Kf = 864;
    const { rgba, alpha, sat } = makeCase(w, h);
    const opts = { Cf, Kf, alpha, sat };
    const a = new Uint8ClampedArray(rgba);
    const b = new Uint8ClampedArray(rgba);
    outlinePassRef(a, w, h, opts);
    outlinePass(b, w, h, opts);
    let diff = -1;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) { diff = i; break; }
    expect(diff, `首个差异 @${diff}: ${a[diff]} vs ${b[diff]}`).toBe(-1);
  });
});


describe("loopOffsets（GLSL fp32 循环展开）", () => {
  it("t=200 → 3 次迭代（0, 1/600, 1/300 UV）", () => {
    const o = loopOffsets(200);
    expect(o.length).toBe(3);
    expect(o[0]).toBe(0);
    // fp32 字面量解析+累积残差 ~1e-9，精度取 8 位
    expect(o[1]).toBeCloseTo(1 / 600, 8);
    expect(o[2]).toBeCloseTo(1 / 300, 8);
  });
  it("t=180 → 4 次迭代（fp32 累积怪癖，oracle 实证）", () => {
    expect(loopOffsets(180).length).toBe(4);
  });
});

/** 合成源：w×h 全不透明白（alpha=255） */
function solidAlpha(w: number, h: number): Uint8ClampedArray {
  const a = new Uint8ClampedArray(w * h).fill(255);
  return a;
}

describe("bevel+CM 内部平色（oracle 字节实证）", () => {
  // C=1036.8 → WTX=1036：FX=1036/1036.8；此处用同比例小画布不便——直接用真实尺寸的中心行采样
  const W = 64, H = 64, Cf = 64 * 1.0008, Kf = 64; // FX<1 模拟内容压缩
  it("全树层（t200 outer1 dir1 + temple tint）内部=CM(128 灰)=(78,60,14)", () => {
    const out = bevelColorMatrix(solidAlpha(W, H), W, H, {
      thickness: 200, outer: 1, dir: 1, tint: [0x5b, 0x46, 0x10], Cf, Kf,
    });
    const i = (32 * W + 32) * 4;
    // 灰度内部：fp32 残差 0.5+1ulp→128 → r=round(1.7·(91/255)·(128/255)·255)=78
    expect(out[i]).toBe(78);
    expect(out[i + 1]).toBe(60);
    expect(out[i + 2]).toBe(14);
    expect(out[i + 3]).toBe(255); // alpha=a1+a2>0.5 → 1
  });
  it("金层（t180 outer0 dir1 + gold tint）纯内部=(218,183,27)（128 灰，fp32 精确对消）", () => {
    const out = bevelColorMatrix(solidAlpha(W, H), W, H, {
      thickness: 180, outer: 0, dir: 1, tint: [0xff, 0xd6, 0x20], Cf, Kf,
    });
    const i = (32 * W + 32) * 4;
    // t=180 → fp32 四次迭代：a1=fr(4/3)，rgb=fr(0.5+a1/6−a1/6)=0.5 精确 → 灰 128。
    // oracle 实测 (216,181,27)=127 灰仅出现在边缘附近（负残差像素），纯内部两侧一致为 128 灰。
    expect(out[i]).toBe(218);
    expect(out[i + 1]).toBe(183);
    expect(out[i + 2]).toBe(27);
    expect(out[i + 3]).toBe(255); // alpha=own=1
  });
  it("outer=0 时 alpha=own（≤0.5 的半透明源 alpha 原样保留）", () => {
    // 注意 GLSL `if(alpha>0.5) alpha=1.0`：alpha=128 → 0.502>0.5 → 强制 255，故用 100
    const a = new Uint8ClampedArray(W * H).fill(100);
    const out = bevelColorMatrix(a, W, H, {
      thickness: 180, outer: 0, dir: 1, tint: [0xff, 0xd6, 0x20], Cf, Kf,
    });
    const i = (32 * W + 32) * 4;
    expect(out[i + 3]).toBe(100);
  });
});

describe("premultToStraight", () => {
  it("预乘→直色：round(rgb·255/a)，a=255 原样，a=0 → rgb=0", () => {
    const rgba = new Uint8ClampedArray([100, 75, 50, 128, 255, 255, 255, 0, 10, 20, 30, 255]);
    const straight = premultToStraight(rgba);
    expect(straight[0]).toBe(199); // round(100·255/128)=199
    expect(straight[1]).toBe(149); // round(75·255/128)=round(149.414)=149
    expect(straight[3]).toBe(128);
    expect(straight[4]).toBe(255); // a=255 原样
    expect(straight[7]).toBe(0); // a=0 → rgb 0
    expect(straight[8]).toBe(10); // a=255 原样
  });
});

/**
 * r49 参照实现：`bevelColorMatrix` 改造前把 `o * WTX` / `o * WTY` 算在逐像素内层。
 * 仅供测试比对——正式实现已 hoist 成 `offXY` 常量表。
 */
function bevelColorMatrixRef(
  alpha: Uint8ClampedArray,
  w: number,
  h: number,
  opts: {
    thickness: number; outer: number; dir: number;
    tint: [number, number, number]; Cf: number; Kf: number;
    y0?: number; y1?: number; out?: Uint8ClampedArray; sat?: Int32Array;
  },
): Uint8ClampedArray {
  const fr = Math.fround;
  const { thickness, outer, dir, tint, Cf, Kf } = opts;
  const WTX = w, WTY = h;
  const FX = WTX / Cf, FY = WTY / Kf;
  const offs = loopOffsets(thickness);
  const out = opts.out ?? new Uint8ClampedArray(w * h * 4);
  const y0 = opts.y0 ?? 0, y1 = opts.y1 ?? h;
  const mr = fr(1.7 * (tint[0] / 255)), mg = fr(1.7 * (tint[1] / 255)), mb = fr(1.7 * (tint[2] / 255));
  const maxOff = offs.length > 1 ? offs[offs.length - 1] * Math.max(WTX, WTY) : 0;
  const R = Math.ceil(maxOff) + 2;
  const sat = opts.sat ?? buildSAT(alpha, w, h);
  const stride = w + 1;
  const satSum = (s: Int32Array, x0: number, y0i: number, x1: number, y1i: number): number => {
    const xa = Math.max(0, x0), ya = Math.max(0, y0i);
    const xb = Math.min(stride - 1, x1), yb = Math.min(h, y1i);
    if (xb <= xa || yb <= ya) return 0;
    return s[yb * stride + xb] - s[ya * stride + xb] - s[yb * stride + xa] + s[ya * stride + xa];
  };
  const sampleA2 = (al: Uint8ClampedArray, ww: number, hh: number, tx: number, ty: number): number => {
    const px = tx - 0.5, py = ty - 0.5;
    const x0 = Math.floor(px), y0i = Math.floor(py);
    const fxx = px - x0, fyy = py - y0i;
    const xa = x0 < 0 ? 0 : x0 >= ww ? ww - 1 : x0;
    const xb = x0 + 1 < 0 ? 0 : x0 + 1 >= ww ? ww - 1 : x0 + 1;
    const ya = y0i < 0 ? 0 : y0i >= hh ? hh - 1 : y0i;
    const yb = y0i + 1 < 0 ? 0 : y0i + 1 >= hh ? hh - 1 : y0i + 1;
    const r0 = ya * ww, r1 = yb * ww;
    const top = al[r0 + xa] * (1 - fxx) + al[r0 + xb] * fxx;
    const bot = al[r1 + xa] * (1 - fxx) + al[r1 + xb] * fxx;
    return (top * (1 - fyy) + bot * fyy) / 255;
  };
  for (let y = y0; y < y1; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (alpha[y * w + x] === 0 && satSum(sat, x - R, y - R, x + R + 1, y + R + 1) === 0) continue;
      const t0x = (x + 0.5) * FX, t0y = (y + 0.5) * FY;
      let a1 = 0, a2 = 0;
      for (const o of offs) {
        const ox = o * WTX, oy = o * WTY;
        a1 = fr(a1 + sampleA2(alpha, w, h, t0x + ox, t0y + oy));
        a2 = fr(a2 + sampleA2(alpha, w, h, t0x - ox, t0y - oy));
      }
      a1 = fr(a1 / 3);
      a2 = fr(a2 / 3);
      let a: number, gray: number;
      if (outer === 1) {
        a = fr(a1 + a2);
        gray = fr(fr(0.5 - fr(fr(dir * a1) / 6)) + fr(fr(dir * a2) / 6));
      } else {
        a = fr(sampleA2(alpha, w, h, t0x, t0y));
        gray = fr(fr(0.5 + fr(fr(dir * a1) / 6)) - fr(fr(dir * a2) / 6));
      }
      if (a > 0.5) a = 1;
      const g = Math.round(fr(gray * a) * 255);
      out[i] = Math.min(255, Math.round(fr(mr * fr(g / 255)) * 255));
      out[i + 1] = Math.min(255, Math.round(fr(mg * fr(g / 255)) * 255));
      out[i + 2] = Math.min(255, Math.round(fr(mb * fr(g / 255)) * 255));
      out[i + 3] = Math.round(a * 255);
    }
  }
  return out;
}

describe("bevelColorMatrix offXY hoist 位级等价（r49）", () => {
  const W = 56, H = 48;
  /** 多形态输入：全透明 / 实心 / 中心块 / 稀疏点 / 半透明 / 单像素边角 */
  function shapes(): Array<[string, Uint8ClampedArray]> {
    const mk = (f: (x: number, y: number) => number): Uint8ClampedArray => {
      const a = new Uint8ClampedArray(W * H);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) a[y * W + x] = f(x, y);
      return a;
    };
    return [
      ["全透明", mk(() => 0)],
      ["实心", mk(() => 255)],
      ["中心块", mk((x, y) => (x > 15 && x < 40 && y > 12 && y < 36 ? 255 : 0))],
      ["稀疏点", mk((x, y) => (x % 5 === 0 && y % 4 === 0 ? 200 : 0))],
      ["半透明", mk((x, y) => ((x + y) % 255))],
      ["单点左上", mk((x, y) => (x === 0 && y === 0 ? 255 : 0))],
      ["单点右下", mk((x, y) => (x === W - 1 && y === H - 1 ? 255 : 0))],
    ];
  }
  const OPTS: Array<[string, { thickness: number; outer: number; dir: number; tint: [number, number, number] }]> = [
    ["big t200 outer1 dir1", { thickness: 200, outer: 1, dir: 1, tint: [216, 181, 27] }],
    ["all t200 outer0 dir-1", { thickness: 200, outer: 0, dir: -1, tint: [78, 60, 14] }],
    ["done t180 outer0 dir1", { thickness: 180, outer: 0, dir: 1, tint: [255, 214, 32] }],
  ];

  for (const [sname, alpha] of shapes()) {
    for (const [oname, o] of OPTS) {
      it(`${sname} × ${oname} 逐字节一致`, () => {
        const opts = { ...o, Cf: W, Kf: H };
        const a = bevelColorMatrixRef(alpha, W, H, opts);
        const b = bevelColorMatrix(alpha, W, H, opts);
        let diff = -1;
        for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) { diff = i; break; }
        expect(diff, `首个差异 @${diff}: ${a[diff]} vs ${b[diff]}`).toBe(-1);
      });
    }
  }

  it("真实压缩比（Cf/Kf ≫ 画布）逐字节一致", () => {
    const alpha = shapes()[2][1]; // 中心块
    const opts = { thickness: 200, outer: 1, dir: 1, tint: [216, 181, 27] as [number, number, number], Cf: 1036, Kf: 864 };
    const a = bevelColorMatrixRef(alpha, W, H, opts);
    const b = bevelColorMatrix(alpha, W, H, opts);
    let diff = -1;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) { diff = i; break; }
    expect(diff, `首个差异 @${diff}: ${a[diff]} vs ${b[diff]}`).toBe(-1);
  });

  it("分片边界（y0/y1 三段）逐字节一致", () => {
    const alpha = shapes()[4][1]; // 半透明渐变
    const opts = { thickness: 200, outer: 0, dir: -1, tint: [78, 60, 14] as [number, number, number], Cf: W, Kf: H };
    const a = new Uint8ClampedArray(W * H * 4);
    const b = new Uint8ClampedArray(W * H * 4);
    for (const [y0, y1] of [[0, 16], [16, 32], [32, 48]]) {
      bevelColorMatrixRef(alpha, W, H, { ...opts, y0, y1, out: a });
      bevelColorMatrix(alpha, W, H, { ...opts, y0, y1, out: b });
    }
    let diff = -1;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) { diff = i; break; }
    expect(diff, `首个差异 @${diff}: ${a[diff]} vs ${b[diff]}`).toBe(-1);
  });
});
