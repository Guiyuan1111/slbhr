/**
 * #51 防回归：状态类经「无 tsconfig 转译」后不得产出原生 class field。
 *
 * 这次事故的根因不在源码，而在**编译链**：tsx 4.x 的 ESM loader 不读 tsconfig 的
 * `useDefineForClassFields`，`x!: number` 会被编成原生字段覆盖 Colyseus schema 装的
 * 访问器。分发包恰好不含 tsconfig，于是必定踩中。
 *
 * 单测跑在仓库里（有 tsconfig）永远看不到这个形态，所以这里**用 esbuild 按「无
 * tsconfig」的缺省语义单独转译 state.ts**，在隔离模块里求值后断言字段仍是访问器。
 * 只要有人把 `declare` 改回 `x!: T`，这条就会红——不依赖任何包外环境。
 */
import { describe, expect, it } from "vitest";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const SRC = fileURLToPath(new URL("../rooms/state.ts", import.meta.url));
const require_ = createRequire(import.meta.url);

/**
 * 把 state.ts 单独打成一个自包含模块（`@colyseus/schema` 留 external，其余内联），
 * 从而能在隔离文件里求值而不需要解析 TS 相对导入。
 *
 * `tsconfig` 显式指向「最坏环境」配置（useDefineForClassFields: true）——那正是 tsx
 * ESM loader 缺 tsconfig 时的实际行为。有这层最坏假设，测试才真正钉住「源码里必须
 * 写 declare」，而不是被仓库自己的 tsconfig 兜住而假绿。
 */
const WORST_CASE_TSCONFIG = join(
  fileURLToPath(new URL("../../../../TEMP/", import.meta.url)),
  "tsconfig-fielddef-true.json",
);

function bundleWorstCase(entry: string): string {
  const esbuild = require_("esbuild") as typeof import("esbuild");
  mkdirSync(dirname(WORST_CASE_TSCONFIG), { recursive: true });
  writeFileSync(WORST_CASE_TSCONFIG, JSON.stringify({ compilerOptions: { useDefineForClassFields: true } }));
  return esbuild.buildSync({
    entryPoints: [entry],
    bundle: true,
    write: false,
    format: "esm",
    platform: "node",
    target: "node22",
    external: ["@colyseus/*", "colyseus"],
    tsconfig: WORST_CASE_TSCONFIG,
  }).outputFiles[0].text;
}

describe("#51 最坏转译下不得产出 class field", () => {
  it("state.ts 转译产物里 Schema 子类没有裸字段声明", () => {
    const js = bundleWorstCase(SRC);
    // 打包后类形如 `var PlayerState = class extends Schema { x; ...`
    const bareField = /class\s+extends\s+\w+\s*\{\s*[\w$]+\s*;/;
    expect(bareField.test(js), "最坏转译下出现裸 class field——字段必须用 declare").toBe(false);
  });

  it("隔离求值后字段描述符仍是访问器（坏形态 = 数据属性）", async () => {
    const js = bundleWorstCase(SRC);
    // 落到项目 TEMP/ 的真实文件再导入：bundle 内 colyseus.cjs 用 createRequire(import.meta.url)
    // 加载依赖，data: URL 下没有文件位置无法解析；落在仓库内则照常向上找 node_modules。
    const tmpDir = fileURLToPath(new URL("../../../../TEMP/", import.meta.url));
    mkdirSync(tmpDir, { recursive: true });
    const tmpFile = join(tmpDir, `schema-erasure-${process.pid}-${Date.now()}.mjs`);
    writeFileSync(tmpFile, js);
    try {
      const mod = (await import(/* @vite-ignore */ pathToFileURL(tmpFile).href)) as Record<string, new () => object>;

      const cases: Array<[string, string]> = [
        ["PlayerState", "x"],
        ["RoomState", "phase"],
        ["DoorState", "fbAtDoor"],
      ];
      for (const [cls, field] of cases) {
        const inst = new mod[cls]();
        const desc = Object.getOwnPropertyDescriptor(inst, field);
        expect(desc, `${cls}.${field} 应有描述符`).toBeTruthy();
        expect(typeof desc!.get, `${cls}.${field} 必须是访问器 get`).toBe("function");
        expect(typeof desc!.set, `${cls}.${field} 必须是访问器 set`).toBe("function");
      }
    } finally {
      rmSync(tmpFile, { force: true });
    }
  });
});
