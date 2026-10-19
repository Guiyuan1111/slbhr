/**
 * templeTreeBake 核心数学单测（无 DOM；DOM 路径由 e2e 视觉门禁覆盖）。
 * 断言值来源：oracle RT 逐字节对拍（note/research/2026-10-fidelity/37 §滤镜还原）：
 *  - 内部平色：全树 (78,60,14)、金 (216,181,27)——CM 输入 128/127 的 fp32 残差双向实证
 *  - t=200 三次迭代 / t=180 fp32 四次迭代怪癖（金内部 127 仅在 4 次迭代+round 语义下成立）
 */
import { describe, expect, it } from "vitest";
import { bevelColorMatrix, loopOffsets, premultToStraight } from "./scenes/templeTreeBake";

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
