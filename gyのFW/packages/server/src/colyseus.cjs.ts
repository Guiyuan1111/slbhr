/**
 * Colyseus 全家桶统一 CJS 加载口。
 *
 * ⚠ 原因：tsx/ESM 下 `import "@colyseus/*"` 会命中各包的 ESM 入口，
 * 与 colyseus 主包（CJS）内部的 require 各拿到一个独立的模块实例——
 * Schema metadata 注册在 A 实例、编码器读 B 实例，房间创建写 A 的 rooms、
 * ws 升级查 B 的 rooms，症状是 "seat reservation expired" /
 * "Cannot read properties of undefined (reading 'Symbol(Symbol.metadata)')"。
 * 全部改走 createRequire 的 CJS 链后与主包共享同一实例。
 */
import { createRequire } from "node:module";

const nodeRequire = createRequire(import.meta.url);

export const { Server, Room, ServerError, matchMaker } = nodeRequire("colyseus") as typeof import("colyseus");
export const { Schema, MapSchema, defineTypes, $filter } = nodeRequire("@colyseus/schema") as typeof import("@colyseus/schema");
export const { WebSocketTransport } = nodeRequire("@colyseus/ws-transport") as typeof import("@colyseus/ws-transport");
