/**
 * 装载失败兜底（#47-3）：此前任一资源 404 会让场景 create 直接取不到纹理/JSON 抛异常
 * →黑屏无提示。每个会发起装载的入口（Boot/Temple/Game preload、Menu 暖装）挂一次
 * loaderror 监听（幂等），失败时置全屏错误条（重试=整页刷新）并 console.error 保留
 * 原始 file 信息供排障。
 */
export function guardLoadErrors(scene: Phaser.Scene): void {
  const load = scene.load;
  if (load.listeners("loaderror").length > 0) return;
  load.on("loaderror", (file: { key: string; url?: string }) => {
    console.error(`[fw] 资源装载失败: ${file.key} (${file.url ?? "?"})`);
    const id = "fw-loaderror";
    if (document.getElementById(id)) return;
    const bar = document.createElement("div");
    bar.id = id;
    bar.style.cssText =
      "position:fixed;left:0;right:0;bottom:0;z-index:9999;background:#b3261e;color:#fff;" +
      "font:14px/1.6 system-ui,sans-serif;padding:10px 16px;display:flex;gap:12px;align-items:center";
    bar.appendChild(document.createTextNode("部分资源加载失败，游戏可能无法正常显示。"));
    const btn = document.createElement("button");
    btn.textContent = "刷新重试";
    btn.onclick = () => location.reload();
    bar.appendChild(btn);
    document.body.appendChild(bar);
  });
}
