/**
 * 用户设置（原版 settings{controls,music,fx,vibrate} 的联机版子集：music/fx 持久化）。
 * 消费点（T5/T6 后，14 号档口径）：fx=全局总静音（game.sound.mute，含 BGM——bootPhaser/
 * SettingsScene/GameScene create 三处同步）；music 只 gate BGM 起停（sfx()/menus/
 * GameScene.applyMusicSetting）。一次性曲（bgm_over/bgm_finish）仍受 music 门=与 oracle
 * 的无门偏差保留（14 号档 T7，忠实向改动待用户裁决）。
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
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // 隐私模式等场景写入可能抛错：本次设置仍返回生效值，仅不持久化
    console.warn("[fw] 设置写入失败，本次会话内生效");
  }
  return next;
}
