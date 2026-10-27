/**
 * GameScene 场景级易失状态清单（#29/#40）。
 *
 * 背景：GameScene 实例在 stop/start 间复用（main.ts 换关 sm.stop("Game")/sm.start("Game")），
 * Phaser DisplayList.shutdown 会销毁全部显示对象，长生命周期引用必须由 init() 复位。
 * #29 只修了 darkRt/dust 族，#40 补修机关视图/灯光状态族——同类对象自此「清单化」集中：
 * 新增场景级 Map/数组/字符串缓存必须登记进 SCENE_STATE_KEYS（守卫测试对照 GameScene 源码
 * 的 `= new Map` 声明遍历断言，防止再次漏网）。
 */

/** init() 必须清空/复位的场景级键：有 clear() 的容器 → clear()；数组 → length=0；
 *  字符串 → ""。布尔/对象值字段不在此列（init 显式赋初值）。 */
export const SCENE_STATE_KEYS = [
  // 主视图族（旧 init 已清，#40 起纳入清单统一驱动）
  "views",
  "diamondSprites",
  "diamondKinds",
  "platformViews",
  "platformLights",
  "leverViews",
  "pusherViews",
  "timedPusherViews",
  "bodyViews",
  "windViews",
  "hangingViews",
  "pulleyViews",
  "romanViews",
  "doorSprites",
  "doorFrames",
  "stairsSprites",
  "platformSounds",
  // 灯光神庙机关视图族（#40：此前从未清空——跨关累积已销毁对象 + 幽灵光晕）
  "beamerViews",
  "rotMirrorViews",
  "boxMirrorViews",
  "infiniteMirrorViews",
  "lightPusherViews",
  "sliderViews",
  // 冰膜视图（#40：全 liquid run 占位同域，null=非 water 只消费位串位）
  "iceViews",
  // 灯光 on/off 状态缓存（drawDarkMask 门控读；不清会按上一关残留画暗幕光晕）
  "rotMirrorOn",
  "lightPusherOn",
  // 光束折线缓存（#29：残留会在首帧画幽灵光束并污染浮尘掩膜签名）
  "lastBeamPts",
  // 冰膜位串缓存（不清会跳过新关首次应用）
  "lastLiquids",
  // HUD/剧情/纳斯卡/教学条目数组（create 重建前必须清）
  "hudItems",
  "navyItems",
  "tutorialItems",
  // 快照族（与视图同生命周期）
  "leverSnaps",
  "pusherSnaps",
  "timedPusherSnaps",
  "platformSnaps",
  "propSnaps",
  "windSnaps",
  "hangingSnaps",
  "pulleySnaps",
  "romanSnaps",
] as const;

export type SceneStateKey = (typeof SCENE_STATE_KEYS)[number];

/** init() 必须归位的 FX 字段 → 初始值（#29 八件；值型即字段声明的空态） */
export const FX_STATE_INIT = {
  darkRt: null,
  darkHalo: null,
  staticHaloRt: null,
  staticHaloSig: null,
  dustContainer: null,
  dustMask: null,
  dustMaskSig: "",
  dustWobble: [] as never[],
} as const;

type AnyRecord = Record<string, unknown>;

/** 对 target 就地清空 keys 列出的全部键（纯逻辑，不依赖 Phaser——可单测） */
export function clearSceneStates(target: AnyRecord, keys: readonly SceneStateKey[] = SCENE_STATE_KEYS): void {
  for (const k of keys) {
    const v = target[k] as { clear?: () => void } | unknown;
    if (v && typeof (v as { clear?: () => void }).clear === "function") {
      (v as { clear: () => void }).clear();
    } else if (Array.isArray(v)) {
      (v as unknown[]).length = 0;
    } else if (typeof v === "string") {
      target[k] = "";
    }
  }
}

/** 对 target 就地复位 FX_STATE_INIT 全部键（数组取新实例，避免共享常量数组） */
export function resetFxStates(target: AnyRecord): void {
  for (const [k, v] of Object.entries(FX_STATE_INIT)) {
    target[k] = Array.isArray(v) ? [] : v;
  }
}
