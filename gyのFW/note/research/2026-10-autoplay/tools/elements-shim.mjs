/**
 * elements 目录 shim（fw-foothold-ef 槽，2026-11-11）——module loader hook 版。
 *
 * 背景：scripts/e2e/routetool/kernel.mjs 的 LEVELS_DIRS 尚未含 data/elements/**（服务器
 * packages/server/src/levels.ts 已含 13 目录，kernel 落后于服务器检索面）。本槽禁改
 * routetool 磁盘文件（并行槽共树，禁制造合并冲突），故以 node:module.register 的
 * load 钩子在【进程内】给 kernel.mjs 载入文本做一处定点替换：LEVELS_DIRS 数组插入
 * 七个 elements 子庙目录（序与服务器 LEVEL_DIRS 同段序）。磁盘文件零改动、git status
 * 可证；检索语义 = 服务器既有权威序的子集。物理/搜索逻辑零接触。
 *
 * 保真性：定位到的关卡 JSON 与 tileset JSON 与服务器加载的是同一批文件；插入的目录
 * 在 data/forest|light|ice 之后、fairytales/tutorials 之前（与服务器同位），对既有
 * 关卡解析零影响（同名优先序不变：elements 与旧三部/tutorials 无重名）。
 *
 * 用法：NODE_OPTIONS="--import <abs>/elements-shim.mjs" node --import tsx <script|autosearch> ...
 * evalchild 子进程经 spawnSync 继承 NODE_OPTIONS，同样获得本钩子。
 * 替换锚点失配时【显式报错退出】（防静默漂移，绝不带病放行）。
 */
import { register } from "node:module";
register("./elements-hook.mjs", import.meta.url);
