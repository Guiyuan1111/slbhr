/**
 * r7f font.png 子集化——used-chars 普查（零 npm 依赖；CLI 经 `node --import tsx` 跑，与仓库惯例一致）。
 *
 * 背景（note/report/perf/2026-10-19-r7-font-subset.md）：r7f 实测四源并集 ∩ fnt260 = 247 字形，
 * 可清零仅 13（12 实字形，面积占 4.07%）；方案 A 实测 -5.2%、B 面积上界 ~-5%，均 <20% 停止线，
 * 故本轮保留原资产未子集化。本工具与清单作为防护网入库：新增文案不重跑普查时测试会红。
 *
 * 字符源（普查面）：
 *   ① packages/client/src 全部字符串字面量（含模板串静态段）+ client 根 *.html
 *   ② packages/server/src + packages/shared/src 字符串字面量 + data 下 JSON 解析后的全部字符串值/键
 *   ③ scripts 与 benchmark 下的字符串字面量 / JSON（e2e 工具注入文本面）
 *   ④ oracle（../../Fireboy-and-Watergirl，只读）全部 *.json 解析后的字符串值——目录可缺省（告警）
 *
 * 规则：代码文件只收字符串字面量（注释一律不收——字面量才可能被渲染）；
 *       JSON 收解析后字符串值+键，解析失败回退收全文。关键教训：我方 Tiled 图把中文存成
 *       \uXXXX 转义（原始字节全 ASCII），raw 扫描会整体漏掉教学文本，必须 JSON.parse。
 *       另恒保 ASCII 可打印集 + 全角标点集（渲染组合字符兜底，如 String(id)/mm:ss）。
 *
 * 用法：node --import tsx scripts/font-subset/census.ts           # 生成/刷新 manifest
 *       node --import tsx scripts/font-subset/census.ts --check   # 只校验 manifest 覆盖，不落盘
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..", "..");
const ORACLE = process.env.ORACLE_DIR ?? path.resolve(ROOT, "..", "Fireboy-and-Watergirl");
const MANIFEST = path.join(ROOT, "scripts", "font-subset", "used-chars.json");
// 规范资产路径 = 仓库根 assets/（tracked）；packages/client/public/ 是 sync-assets 同步产物
const FNT_PATH = path.join(ROOT, "assets", "fonts", "chinese", "font.fnt");

/** 恒保兜底集：ASCII 可打印 + 中文常用全角标点（∩ fnt 才实际生效） */
const SAFETY = new Set<string>();
for (let c = 0x20; c <= 0x7e; c++) SAFETY.add(String.fromCodePoint(c));
for (const ch of "！＂＃￥％＆＇（）＊＋，－．／：；＜＝＞？＠［＼］＾＿｀｛｜｝～、。·‥…—―‘’“”《》〈〉「」『』【〕〔】［］｛｝０１２３４５６７８９") {
  SAFETY.add(ch);
}

const WALK_EXT_CODE = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]);
const WALK_EXT_RAW = new Set([".json", ".html"]);

function* walk(dir: string, pred: (p: string) => boolean): Generator<string> {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "node_modules" || e.name === "dist" || e.name === ".git" || e.name === "TEMP") continue;
      yield* walk(p, pred);
    } else if (e.isFile() && pred(p)) {
      yield p;
    }
  }
}

/**
 * 词法扫描源码，收集字符串字面量字符（含模板串静态段）。
 * 处理 // 与块注释（注释内容不收）、转义、模板 ${} 嵌套。
 * 正则字面量内的引号可能使配对漂移——漂移方向恒为“多收”（把代码收进假串），
 * 真字面量字符无论落在串态还是码态最终都会被收进集合，故只多不少。
 */
function collectStringLiterals(src: string, set: Set<string>): void {
  const n = src.length;
  let i = 0;
  // 模板栈：每层记录是否处于 ${ 表达式内
  const tmplStack: boolean[] = [];
  const push = (s: string): void => {
    set.add(s);
  };
  while (i < n) {
    const c = src[i];
    const inExpr = tmplStack.length > 0 && tmplStack[tmplStack.length - 1];
    if (!inExpr) {
      if (c === "/" && src[i + 1] === "/") {
        i = src.indexOf("\n", i);
        if (i < 0) break;
        continue;
      }
      if (c === "/" && src[i + 1] === "*") {
        const end = src.indexOf("*/", i + 2);
        i = end < 0 ? n : end + 2;
        continue;
      }
    }
    if (c === '"' || c === "'") {
      i++;
      while (i < n && src[i] !== c) {
        if (src[i] === "\\") {
          i += 2;
          continue;
        }
        push(src[i]);
        i++;
      }
      i++;
      continue;
    }
    if (c === "`") {
      tmplStack.push(false);
      i++;
      continue;
    }
    if (c === "$" && src[i + 1] === "{" && tmplStack.length > 0 && !inExpr) {
      tmplStack[tmplStack.length - 1] = true; // 进入表达式
      i += 2;
      continue;
    }
    if (c === "}" && inExpr) {
      tmplStack[tmplStack.length - 1] = false; // 回到模板静态段
      i++;
      continue;
    }
    if (tmplStack.length > 0) push(c); // 模板静态段字符
    i++;
  }
}

function collectRawFile(p: string, set: Set<string>): void {
  const s = fs.readFileSync(p, "utf8");
  for (const ch of s) set.add(ch);
}

/**
 * JSON：解析后走全树字符串值+键（关键！我方 Tiled 图把中文存成 \uXXXX 转义，
 * 原始字节全 ASCII，raw 扫描会整体漏掉教学文本——r7f 实测教训）。
 * 解析失败回退收全文（宁多勿缺）。
 */
function collectJsonFile(p: string, set: Set<string>): void {
  let s: string | undefined;
  try {
    s = fs.readFileSync(p, "utf8");
    const d: unknown = JSON.parse(s);
    const walkJson = (o: unknown): void => {
      if (typeof o === "string") {
        for (const ch of o) set.add(ch);
      } else if (Array.isArray(o)) {
        for (const v of o) walkJson(v);
      } else if (o !== null && typeof o === "object") {
        for (const [k, v] of Object.entries(o)) {
          for (const ch of k) set.add(ch);
          walkJson(v);
        }
      }
    };
    walkJson(d);
  } catch {
    for (const ch of s ?? "") set.add(ch);
  }
}

type SourceTag = "client" | "serverShared" | "data" | "tools" | "oracle";
const perSource: Record<SourceTag, Set<string>> = {
  client: new Set(),
  serverShared: new Set(),
  data: new Set(),
  tools: new Set(),
  oracle: new Set(),
};

const SRC_FILES: Array<[keyof typeof TAG_MAP, string]> = [];
const TAG_MAP = {
  client: "client",
  server: "serverShared",
  shared: "serverShared",
  data: "data",
  tools: "tools",
} as const;
const isClientRoot = (p: string): boolean => path.basename(p) !== "font.fnt";
// 关键排除：本工具目录与本测试文件自身不得入扫——否则 MUST_RENDER 字面量自密封，
// "MUST_RENDER ⊆ 保留集" 断言恒真，失明检测失效（r7f 负测实证）
const isSelf = (p: string): boolean =>
  p.includes(path.join("scripts", "font-subset")) || path.basename(p) === "font-subset.test.ts";
for (const p of walk(path.join(ROOT, "packages", "client"), (f) => isClientRoot(f) && !isSelf(f)))
  if (WALK_EXT_CODE.has(path.extname(p)) || WALK_EXT_RAW.has(path.extname(p))) SRC_FILES.push(["client", p]);
for (const p of walk(path.join(ROOT, "packages", "server"), (f) => !isSelf(f)))
  if (WALK_EXT_CODE.has(path.extname(p)) || WALK_EXT_RAW.has(path.extname(p))) SRC_FILES.push(["server", p]);
for (const p of walk(path.join(ROOT, "packages", "shared"), (f) => !isSelf(f)))
  if (WALK_EXT_CODE.has(path.extname(p)) || WALK_EXT_RAW.has(path.extname(p))) SRC_FILES.push(["shared", p]);
for (const p of walk(path.join(ROOT, "data"), () => true)) SRC_FILES.push(["data", p]);
for (const p of walk(path.join(ROOT, "scripts"), (f) => !isSelf(f)))
  if (WALK_EXT_CODE.has(path.extname(p)) || WALK_EXT_RAW.has(path.extname(p))) SRC_FILES.push(["tools", p]);
for (const p of walk(path.join(ROOT, "benchmark"), (f) => !isSelf(f)))
  if (WALK_EXT_CODE.has(path.extname(p)) || WALK_EXT_RAW.has(path.extname(p))) SRC_FILES.push(["tools", p]);

const ORACLE_FILES: string[] = ORACLE && fs.existsSync(ORACLE) ? [...walk(ORACLE, (f) => f.endsWith(".json"))] : [];
if (ORACLE_FILES.length === 0) console.warn("[census] 警告：oracle 目录不可用（④缺省）：" + ORACLE);

for (const [tag, p] of SRC_FILES) {
  const set = perSource[TAG_MAP[tag]];
  if (WALK_EXT_CODE.has(path.extname(p))) collectStringLiterals(fs.readFileSync(p, "utf8"), set);
  else if (path.extname(p) === ".json") collectJsonFile(p, set);
  else collectRawFile(p, set);
}
for (const p of ORACLE_FILES) collectJsonFile(p, perSource.oracle);

export function parseFntIds(fntPath: string): Set<number> {
  const txt = fs.readFileSync(fntPath, "utf8");
  const ids = new Set<number>();
  for (const m of txt.matchAll(/<char id="(\d+)"/g)) ids.add(Number(m[1]));
  return ids;
}

/** 手工固化断言面：实际会渲染的 UI/教学串（scanner bug 兜底；逐字取自现网串与 data 教学层） */
export const MUST_RENDER: readonly string[] = [
  "开始游戏",
  "设置",
  "制作人员",
  "恭喜！",
  "你完成了全部挑战",
  "暫停",
  "返回",
  "显示关卡数",
  "00:00",
  "请用左键移动“冰女孩”",
  "按右键移动“火男孩”",
  "千万别混淆“冰”与“火”喔！",
  "小心！绿泥会把他们俩都杀死！",
  "如果您不扳动机关，就无法闯关成功喔！",
  "必须要有1个人留下来按住按钮。",
  "您可要好好利用道具",
  "继！等下回多试",
  "不要忘记采集钻石喔！",
  "站在门前，它会自动打开的。",
];

export interface CensusResult {
  fntChars: number;
  fntIds: Set<number>;
  perSource: Record<SourceTag, number>;
  unionAll: number;
  keep: string[];
  oracleFiles: number;
}

export function computeCensus(): CensusResult {
  const fntIds = parseFntIds(FNT_PATH);
  const union = new Set<string>();
  for (const s of Object.values(perSource)) for (const ch of s) union.add(ch);
  for (const ch of SAFETY) union.add(ch);
  const keep = [...union].filter((ch) => fntIds.has(ch.codePointAt(0)!)).sort();
  return {
    fntChars: fntIds.size,
    fntIds,
    perSource: Object.fromEntries(Object.entries(perSource).map(([k, s]) => [k, s.size])) as Record<SourceTag, number>,
    unionAll: union.size,
    keep,
    oracleFiles: ORACLE_FILES.length,
  };
}

const isCheck = process.argv.includes("--check");

if (process.argv[1] && path.resolve(process.argv[1]) === import.meta.filename) {
  const r = computeCensus();
  if (isCheck) {
    const old = JSON.parse(fs.readFileSync(MANIFEST, "utf8")) as { chars: number[] };
    const oldSet = new Set(old.chars);
    const missing = r.keep.filter((ch) => !oldSet.has(ch.codePointAt(0)!));
    if (missing.length > 0) {
      console.error(`[census --check] manifest 缺 ${missing.length} 字符：${missing.join("")}`);
      process.exit(1);
    }
    console.log(`[census --check] manifest 覆盖通过（keep=${r.keep.length}/${r.fntChars}）`);
  } else {
    const manifest = {
      comment:
        "r7f font 子集化保留清单（Unicode 码点）。再生：node --import tsx scripts/font-subset/census.ts && python3 scripts/font-subset/subset.py --out <目标.png>",
      generatedAt: new Date().toISOString(),
      fntChars: r.fntChars,
      fntIdsSorted: [...r.fntIds].sort((a, b) => a - b),
      perSourceDistinct: r.perSource,
      oracleFiles: r.oracleFiles,
      chars: r.keep.map((ch) => ch.codePointAt(0)),
    };
    fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 1) + "\n", "utf8");
    console.log(
      `[census] 源字符数 per-source: ${JSON.stringify(r.perSource)}；并集 ${r.unionAll}；` +
        `fnt ${r.fntChars} 字形；保留交集 ${r.keep.length}（清零 ${r.fntChars - r.keep.length}）→ manifest 已写`
    );
  }
}
