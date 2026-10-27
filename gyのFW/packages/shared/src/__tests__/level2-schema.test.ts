/**
 * parseLevel 最小 schema 校验（#44）：新数据入库时解析期显式失败——此前缺
 * layers/tilesets 裸 TypeError、缺门静默 NaN（门永不开）、未知 gid 静默当 SOLID、
 * 超大尺寸 RangeError。失败用例以真实 forest_01 为底本做字段级变异。
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { parseLevel } from "../level2.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
const DIR = `${ROOT}/data/tutorials/levels`;
const base = (): any => JSON.parse(readFileSync(`${DIR}/forest_01.json`, "utf8"));
const provider = (source: string) => JSON.parse(readFileSync(join(DIR, source), "utf8"));

function expectThrow(id: string, json: any, msgPart: string): void {
  let err: Error | undefined;
  try {
    parseLevel(id, json, provider);
  } catch (e) {
    err = e as Error;
  }
  expect(err, `应抛出含「${msgPart}」的错误`).toBeTruthy();
  expect(err!.message).toContain(msgPart);
}

describe("parseLevel schema 校验（#44）", () => {
  it("根非对象 / 缺数值字段 / 尺寸异常 / 缺 layers / 缺 tilesets / 缺 Ground 层", () => {
    expectThrow("t", null, "JSON 根必须是对象");
    expectThrow("t", {}, "缺少数值字段 width");
    expectThrow("t", { width: 10 }, "缺少数值字段 height");
    expectThrow("t", { width: 2000, height: 10, tilewidth: 32 }, "尺寸异常 2000x10");
    expectThrow("t", { width: 10, height: 10, tilewidth: 32 }, "缺少 layers 数组");
    expectThrow("t", { width: 10, height: 10, tilewidth: 32, layers: [] }, "缺少 tilesets 数组");
    expectThrow("t", { width: 10, height: 10, tilewidth: 32, layers: [], tilesets: [] }, "缺少 Ground 层");
  });

  it("缺出生门：终检显式失败并指明角色", () => {
    const j = base();
    const chars = j.layers.find((l: any) => l.name === "Chars");
    // 图块对象 gid → tileset（Tiled 语义：firstgid ≤ gid 的最后一个）→ 外部图块集文件判 type
    const kindOf = (o: any): string | undefined => {
      const cands = j.tilesets.filter((ts: any) => o.gid >= ts.firstgid);
      const ref = cands[cands.length - 1];
      const localId = o.gid - ref.firstgid;
      return provider(ref.source).tiles?.[String(localId)]?.type;
    };
    const doorObjs = chars.objects.filter((o: any) => kindOf(o) === "door");
    expect(doorObjs.length).toBeGreaterThanOrEqual(2);
    chars.objects = chars.objects.filter((o: any) => !doorObjs.includes(o));
    expectThrow("t", j, "缺少 fireboy 出生门");
  });

  it("未知 gid（无 tileproperties.type）：按 SOLID 处理且只 warn 一次", () => {
    const j = base();
    const ground = j.layers.find((l: any) => l.name === "Ground");
    // 找一个 data 非零格，指向 tilesets 首图块（其 tileproperties 可能缺失——把整个
    // 被引用 tileset 的 tileproperties 清空制造未知 gid）
    const idx = ground.data.findIndex((g: number) => g !== 0);
    expect(idx).toBeGreaterThan(-1);
    expect(ground.data[idx]).toBeGreaterThan(0);
    // tileproperties 在外部图块集文件里——用改写 provider 只剥 Ground 图块集的，
    // 制造「未知 gid」（其余图块集保持完好，免碰出生点既有 NaN 检查）
    // refOf 按 source 基名（非 name 字段）解析图块集引用
    const groundSource = j.tilesets.find((ts: any) => String(ts.source).endsWith("/Ground.json"))?.source as string;
    expect(groundSource).toBeTruthy();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const stripped = (source: string) => {
        const ts = provider(source);
        if (source === groundSource) delete ts.tileproperties;
        return ts;
      };
      parseLevel("t", j, stripped);
      // forest_01 Ground 用了 7 个不同 gid → 7 条（每 关卡×gid 一条）
      const firstCount = warn.mock.calls.length;
      expect(firstCount).toBeGreaterThan(0);
      for (const c of warn.mock.calls) expect(String(c[0])).toContain("无 tileproperties.type");
      // 同一关卡再解析：关卡×gid 去重生效，不再重复告警
      parseLevel("t", j, stripped);
      expect(warn.mock.calls.length).toBe(firstCount);
    } finally {
      warn.mockRestore();
    }
  });
});
