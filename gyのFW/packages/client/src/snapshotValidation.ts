/**
 * 房间快照字段校验（M12）：服务端 Schema 漂移时给出明确告警，而不是被
 * `String(x ?? "")` / `Number(x) || 0` 静默吞掉。只在每关首帧跑一次，
 * 不进入逐帧热路径。
 *
 * 0.3.43 起字段清单改吃共享 DTO（packages/shared/src/netDto.ts）。0.3.48 起
 * （#23）集合组清单亦由共享 DTO 的 ROOM_COLLECTION_CHILD 驱动（排除
 * players/diamonds 两个有专门逻辑的组）——新增机关组自动纳入校验面，
 * 不再需要手写同步（0.3.45/0.3.47 的 7 个新组曾因此全部漏检）。
 */
import {
  CHILD_SNAPSHOT_FIELDS,
  DIAMOND_SNAPSHOT_FIELDS,
  DOOR_SNAPSHOT_FIELDS,
  PLAYER_SNAPSHOT_FIELDS,
  ROOM_COLLECTION_CHILD,
} from "@fw/shared";

export interface SnapshotIssue {
  path: string;
  expected: string;
}

type MapLike = {
  forEach(cb: (value: any, key: string) => void): void;
  get?(key: string): any;
};

/** 快照集合组名 → 共享 DTO 字段清单：由 ROOM_COLLECTION_CHILD 全量派生，
 *  players/diamonds 在 validateSnapshot 有专门逻辑故排除（#23） */
const KIND_GROUPS: ReadonlyArray<readonly [string, Readonly<Record<string, string>>]> =
  Object.entries(ROOM_COLLECTION_CHILD)
    .filter(([group]) => group !== "players" && group !== "diamonds")
    .map(([group, child]) => [group, CHILD_SNAPSHOT_FIELDS[child]] as const);

/** 集合判定：MapSchema 与 ArraySchema 都有 forEach（doors 系 ArraySchema、其余系 MapSchema，
 * 真局探针实证）；get 仅 MapSchema 有，作可选能力不参与判定。 */
function isMapLike(value: unknown): value is MapLike {
  return !!value && typeof (value as MapLike).forEach === "function";
}

function matchesKind(value: unknown, kind: string): boolean {
  if (kind === "number") return typeof value === "number" && Number.isFinite(value);
  return typeof value === kind;
}

function checkFieldsByKind(obj: any, path: string, fields: Readonly<Record<string, string>>, issues: SnapshotIssue[]): void {
  for (const [field, kind] of Object.entries(fields)) {
    if (!matchesKind(obj?.[field], kind)) {
      issues.push({ path: `${path}.${field}`, expected: kind === "number" ? "finite number" : kind });
    }
  }
}

/** 返回空数组表示快照结构符合当前 Schema；缺失的可选机关组不视为问题。 */
export function validateSnapshot(st: any, roles: readonly string[]): SnapshotIssue[] {
  const issues: SnapshotIssue[] = [];
  if (!st || typeof st !== "object") return [{ path: "state", expected: "object" }];

  if (typeof st.phase !== "string") issues.push({ path: "phase", expected: "string" });
  if (typeof st.levelId !== "string") issues.push({ path: "levelId", expected: "string" });
  if (!(typeof st.timerMs === "number" && Number.isFinite(st.timerMs))) {
    issues.push({ path: "timerMs", expected: "finite number" });
  }

  const players = st.players;
  if (!isMapLike(players)) {
    issues.push({ path: "players", expected: "map" });
  } else {
    for (const role of roles) {
      const player = (players as any).get?.(role);
      // 出席与否不是 schema 漂移信号，不在此校验：对端尚未入座（首快照早于 join 完成）
      // 与 L-01 席位释放（won/started 后离场）都会合法缺角色——只校验在场条目的字段类型。
      if (!player) continue;
      checkFieldsByKind(player, `players.${role}`, PLAYER_SNAPSHOT_FIELDS, issues);
    }
  }

  const diamonds = st.diamonds;
  if (diamonds != null) {
    if (!isMapLike(diamonds)) {
      issues.push({ path: "diamonds", expected: "map" });
    } else {
      diamonds.forEach((diamond: any, id: string) => {
        checkFieldsByKind(diamond, `diamonds.${id}`, DIAMOND_SNAPSHOT_FIELDS, issues);
      });
    }
  }

  // doors 是单条目 Schema 实例（每关恰一对门，state.ts:119），不是集合——按单对象校验
  if (st.doors != null) {
    checkFieldsByKind(st.doors, "doors", DOOR_SNAPSHOT_FIELDS, issues);
  }

  for (const [group, fields] of KIND_GROUPS) {
    const map = st[group];
    if (map == null) continue;
    if (!isMapLike(map)) {
      issues.push({ path: group, expected: "map" });
      continue;
    }
    map.forEach((entry: any, id: string) => {
      if (!entry || typeof entry !== "object") {
        issues.push({ path: `${group}.${id}`, expected: "object" });
        return;
      }
      checkFieldsByKind(entry, `${group}.${id}`, fields, issues);
    });
  }

  return issues;
}
