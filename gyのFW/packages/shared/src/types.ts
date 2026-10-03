/** 双方角色 */
export type Role = "fireboy" | "watergirl";
export const ROLES: Role[] = ["fireboy", "watergirl"];

/** 单个玩家的输入快照（触屏与键盘同构） */
export interface InputState {
  up: boolean;
  left: boolean;
  right: boolean;
}

export const EMPTY_INPUT: InputState = { up: false, left: false, right: false };

export function copyInput(a: InputState): InputState {
  return { up: a.up, left: a.left, right: a.right };
}

export function sameInput(a: InputState, b: InputState): boolean {
  return a.up === b.up && a.left === b.left && a.right === b.right;
}

/** 玩家动画状态（服务端推导，客户端按名播放） */
export type Anim = "idle" | "run" | "jump" | "fall" | "dead";

/** 世界事件（服务端每步产生，供房间层转成消息/统计） */
export type WorldEvent =
  | { type: "death"; role: Role; cause: "water" | "lava" | "green" }
  | { type: "respawn"; role: Role }
  | { type: "diamond"; id: string; role: Role }
  | { type: "lever"; group: number; on: boolean }
  | { type: "win" };
