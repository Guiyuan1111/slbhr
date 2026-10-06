/**
 * 用户设置（原版 settings{controls,music,fx,vibrate} 的联机版子集：music/fx 持久化）。
 * 消费点：GameScene.sfx（fx 门控，bgm 走 music）、MenuScene/TempleScene bgm（music 门控）。
 */
export interface FwSettings {
  music: boolean;
  fx: boolean;
}

const KEY = "fw-settings-v1";

export function getSettings(): FwSettings {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "{}") ?? {};
    return { music: raw.music !== false, fx: raw.fx !== false };
  } catch {
    return { music: true, fx: true };
  }
}

export function setSettings(patch: Partial<FwSettings>): FwSettings {
  const next = { ...getSettings(), ...patch };
  localStorage.setItem(KEY, JSON.stringify(next));
  return next;
}
