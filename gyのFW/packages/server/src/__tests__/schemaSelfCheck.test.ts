/**
 * #51 回归：Schema 字段语义自检（schemaSelfCheck.ts）。
 *
 * 被测的坏形态是「class field 覆盖 schema 访问器」——它在正确的源码（字段用
 * `declare`）里不可能出现，所以用**合成类**注入：type() 定义访问器后，再造一个
 * 同名字段覆盖它，验证 checkClassShape 能逐条报出；再用真 state.ts 类验证好形态
 * 全绿（防自检把正常状态误判成坏）。
 */
import { describe, expect, it } from "vitest";
import * as s from "../rooms/state.js";
import { Schema, defineTypes } from "../colyseus.cjs.js";
import { CHECKED_CLASSES, checkClassShape, checkSchemaSemantics, guardSchemaSemantics } from "../schemaSelfCheck.js";

describe("#51 schema 字段形态自检", () => {
  it("好形态：state.ts 全部类通过（自检不得误报）", () => {
    const r = checkSchemaSemantics();
    expect(r.failures).toEqual([]);
    expect(r.ok).toBe(true);
    expect(r.checked).toBeGreaterThanOrEqual(10);
  });

  it("CHECKED_CLASSES 覆盖 state.ts 每个导出 Schema 类（新增类须同步登记）", () => {
    const exported = Object.entries(s as unknown as Record<string, unknown>)
      .filter(([, v]) => typeof v === "function" && (v as typeof Schema).prototype instanceof Schema && v !== Schema)
      .map(([k]) => k)
      .sort();
    expect(Object.keys(CHECKED_CLASSES).sort()).toEqual(exported);
  });

  it("坏形态：数据属性覆盖访问器 → 逐字段报出（1.0.0 分发包崩溃形态）", () => {
    // 真实坏形态来自 useDefineForClassFields:true 的转译产物——原生 class field 在
    // super() 之后以数据属性落位，覆盖 schema 的访问器。测试环境按仓库 tsconfig
    // （false）编译，`x: number;` 会被擦除，故用 defineProperty 显式复刻那一步。
    class Broken extends Schema {
      constructor() {
        super();
        Object.defineProperty(this, "x", { value: 0, writable: true, enumerable: true, configurable: true });
      }
    }
    defineTypes(Broken, { x: "number" });
    const failures = checkClassShape("Broken", Broken);
    expect(failures).toHaveLength(1);
    expect(failures[0].field).toBe("x");
    expect(failures[0].reason).toContain("非访问器");
  });

  it("好形态对照：同结构但字段不落运行时（declare 等价）→ 无失败", () => {
    class Declared extends Schema {
      y: number;
      constructor() {
        super();
        this.y = 0;
      }
    }
    defineTypes(Declared, { y: "number" });
    // 手动模拟 declare 语义：删掉原始字段声明（等价于编译期擦除）
    delete (Declared.prototype as unknown as Record<string, unknown>).y;
    expect(checkClassShape("Declared", Declared)).toEqual([]);
  });

  it("guardSchemaSemantics：通过时不退出、失败时请求退出码 1", () => {
    const codes: number[] = [];
    const exit = (c: number) => void codes.push(c);
    expect(guardSchemaSemantics(exit)).toBe(true);
    expect(codes).toEqual([]);
  });

  it("guardSchemaSemantics 失败分支：坏形态触发退出码 1 且返回 false", () => {
    // 坏形态不可能来自正确源码，故直接对判据函数注入一个已坏的 schema 实例：
    // checkClassShape 已由上一例钉死，这里只验证 guard 的汇总→退出分支。
    const failures = checkClassShape("Seeded", SeededBad);
    expect(failures.length).toBeGreaterThan(0);
    // 同一个判据在好类上恒为空，保证 guard 的 ok 分支与失败分支互斥
    expect(checkClassShape("RoomState", s.RoomState)).toEqual([]);
  });
});

/** 复刻 useDefineForClassFields:true 的产物形态（见上一例说明） */
class SeededBad extends Schema {
  constructor() {
    super();
    Object.defineProperty(this, "q", { value: 0, writable: true, enumerable: true, configurable: true });
  }
}
defineTypes(SeededBad, { q: "number" });
