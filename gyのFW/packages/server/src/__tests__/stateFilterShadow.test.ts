/**
 * #26 回归：state.ts 全部 Schema 类必须以 own property 遮蔽 $filter（=undefined）。
 *
 * @colyseus/schema Encoder 对每个待编码字段调 ctor[$filter]——无 @view 标签时该调用
 * 恒真但非零开销，r4 perf 件2 以声明侧遮蔽跳过。0.3.45/0.3.47 新增的 BeamState/
 * TimedPusherState 曾漏登记（仍继承基类实现），light/ice 新高频集合每字段白付一次
 * 调用。本测试枚举模块全部导出 Schema 子类逐个断言，防后续新增类再漏。
 */
import { describe, expect, it } from "vitest";
import * as s from "../rooms/state.js";
import { Schema, $filter } from "../colyseus.cjs.js";

type SchemaCtor = abstract new (...args: never[]) => unknown;

function exportedSchemaClasses(): Array<[string, SchemaCtor]> {
  return Object.entries(s as unknown as Record<string, unknown>).filter(
    (entry): entry is [string, SchemaCtor] =>
      typeof entry[1] === "function" &&
      (entry[1] as unknown as SchemaCtor).prototype instanceof Schema &&
      entry[1] !== Schema,
  );
}

describe("#26 $filter 静态遮蔽全类覆盖", () => {
  it("state.ts 每个导出 Schema 类的 own $filter 均为 undefined", () => {
    const classes = exportedSchemaClasses();
    expect(classes.length).toBeGreaterThanOrEqual(10); // RoomState + 9 子状态类
    const missing: string[] = [];
    for (const [name, cls] of classes) {
      if (!Object.prototype.hasOwnProperty.call(cls, $filter as string) || (cls as unknown as Record<string, unknown>)[$filter as string] !== undefined) {
        missing.push(name);
      }
    }
    expect(missing, `漏登记 $filter 遮蔽的类：${missing.join(", ")}`).toEqual([]);
  });

  it("新增类 BeamState/TimedPusherState 明确在册", () => {
    for (const name of ["BeamState", "TimedPusherState"]) {
      const cls = (s as unknown as Record<string, unknown>)[name] as typeof Schema;
      expect(Object.prototype.hasOwnProperty.call(cls, $filter as string), name).toBe(true);
    }
  });
});
