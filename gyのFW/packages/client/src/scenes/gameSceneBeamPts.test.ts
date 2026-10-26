/**
 * #30 回归：cbBeamers 的所有「无有效光束」退出路径必须删除 lastBeamPts 缓存。
 *
 * drawDarkness/updateDust 把 lastBeamPts 条目一概视为「当前有光束」——熄灭分支、
 * 视图缺失分支、无效折线分支若只 return 不删除，黑幕会残留永不消失的亮带与光晕、
 * 浮尘掩膜继续生效，暗关谜题信息泄漏。
 *
 * GameScene 依赖完整 Phaser 运行时（无 headless harness），此处以源码契约为断言对象：
 * 三个退出路径都含 lastBeamPts.delete(k)，且先于 return。
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { fileURLToPath } from "node:url";

const src = readFileSync(fileURLToPath(new URL("./GameScene.ts", import.meta.url)), "utf8");

/** 截取 cbBeamers 方法体 */
function cbBeamersBody(): string {
  const start = src.indexOf("private cbBeamers = ");
  expect(start, "找不到 cbBeamers").toBeGreaterThan(0);
  const end = src.indexOf("private cbRotMirrors = ", start);
  expect(end, "找不到 cbBeamers 结束边界").toBeGreaterThan(start);
  return src.slice(start, end);
}

describe("#30 beamer 熄灭时删除 lastBeamPts", () => {
  const body = () => cbBeamersBody();

  it("视图缺失分支删除缓存", () => {
    const b = body();
    const iView = b.indexOf("if (!v)");
    const iDel = b.indexOf("this.lastBeamPts.delete(k)", iView);
    const iRet = b.indexOf("return;", iView);
    expect(iDel, "!v 分支必须先 delete 再 return").toBeGreaterThan(iView);
    expect(iDel).toBeLessThan(iRet);
  });

  it("熄灭/无折线分支删除缓存", () => {
    const b = body();
    const iOff = b.indexOf("if (!on || !b.pts)");
    expect(iOff, "找不到熄灭分支").toBeGreaterThan(0);
    const iDel = b.indexOf("this.lastBeamPts.delete(k)", iOff);
    const iRet = b.indexOf("return;", iOff);
    expect(iDel).toBeGreaterThan(iOff);
    expect(iDel).toBeLessThan(iRet);
  });

  it("折线不足两点分支删除缓存，有效路径仍写入", () => {
    const b = body();
    const iShort = b.indexOf("if (path.length < 2)");
    expect(iShort, "找不到短折线分支").toBeGreaterThan(0);
    const iDel = b.indexOf("this.lastBeamPts.delete(k)", iShort);
    const iRet = b.indexOf("return;", iShort);
    expect(iDel).toBeGreaterThan(iShort);
    expect(iDel).toBeLessThan(iRet);
    expect(b).toContain("this.lastBeamPts.set(k, path)");
  });
});
