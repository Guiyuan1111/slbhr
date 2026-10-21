/**
 * 房间快照字段校验（M12）：服务端 Schema 漂移时给出明确告警，而不是被
 * `String(x ?? "")` / `Number(x) || 0` 静默吞掉。只在每关首帧跑一次，
 * 不进入逐帧热路径。
 */

export interface SnapshotIssue {
  path: string;
  expected: string;
}

type MapLike = {
  forEach(cb: (value: any, key: string) => void): void;
  get?(key: string): any;
};

const PLAYER_NUMERIC = ["x", "y", "vx", "vy", "facing"] as const;

const NUMERIC_GROUPS: ReadonlyArray<readonly [string, readonly string[]]> = [
  ["levers", ["state", "angle"]],
  ["pushers", ["state", "x", "y"]],
  ["platforms", ["x", "y", "angle"]],
  ["props", ["x", "y", "angle"]],
  ["winds", ["state"]],
  ["hangings", ["x", "y", "angle"]],
  ["pulleys", ["x", "y", "angle"]],
  ["romans", ["x", "y", "angle"]],
];

function isMapLike(value: unknown): value is MapLike {
  return (
    !!value &&
    typeof (value as MapLike).forEach === "function" &&
    typeof (value as { get?: unknown }).get === "function"
  );
}

function finite(value: unknown): boolean {
  return typeof value === "number" && Number.isFinite(value);
}

function checkNumericFields(obj: any, path: string, fields: readonly string[], issues: SnapshotIssue[]): void {
  for (const field of fields) {
    if (!finite(obj?.[field])) issues.push({ path: `${path}.${field}`, expected: "finite number" });
  }
}

/** 返回空数组表示快照结构符合当前 Schema；缺失的可选机关组不视为问题。 */
export function validateSnapshot(st: any, roles: readonly string[]): SnapshotIssue[] {
  const issues: SnapshotIssue[] = [];
  if (!st || typeof st !== "object") return [{ path: "state", expected: "object" }];

  if (typeof st.phase !== "string") issues.push({ path: "phase", expected: "string" });
  if (typeof st.levelId !== "string") issues.push({ path: "levelId", expected: "string" });
  if (!finite(st.timerMs)) issues.push({ path: "timerMs", expected: "finite number" });

  const players = st.players;
  if (!isMapLike(players)) {
    issues.push({ path: "players", expected: "map" });
  } else {
    for (const role of roles) {
      const player = (players as any).get?.(role);
      if (!player) {
        issues.push({ path: `players.${role}`, expected: "present" });
        continue;
      }
      checkNumericFields(player, `players.${role}`, PLAYER_NUMERIC, issues);
      if (typeof player.anim !== "string") issues.push({ path: `players.${role}.anim`, expected: "string" });
    }
  }

  const diamonds = st.diamonds;
  if (diamonds != null) {
    if (!isMapLike(diamonds)) {
      issues.push({ path: "diamonds", expected: "map" });
    } else {
      diamonds.forEach((diamond: any, id: string) => {
        if (typeof diamond?.collected !== "boolean") {
          issues.push({ path: `diamonds.${id}.collected`, expected: "boolean" });
        }
      });
    }
  }

  for (const [group, fields] of NUMERIC_GROUPS) {
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
      checkNumericFields(entry, `${group}.${id}`, fields, issues);
    });
  }

  return issues;
}
