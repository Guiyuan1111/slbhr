// J3 razor 逐帧探针：复刻 bot 时序，打 f780-870 fb 逐帧
import { makeWorld, drive } from "/home/gy/桌面/dev/slbhr/gyのFW/scripts/e2e/routetool/botcore.mjs";
const NONE = { left: false, right: false, up: false, down: false };
const w = makeWorld("forest_05");
// 简化：只跑 fb 侧前置（S1→西704→杆2→等P1），wg 侧用最小链把杆3翻掉
// 直接用 bot8-g2 太重，这里独立重放：fb S1/S2/杆2 + wg 站位门控/缝跳/W4'/W5a/W5b/杆3 —— 太复杂。
// 改用：直接借用 bot8-g2 的模块导出？bot 没有 export。这里用 hack：环境变量控制日志。
console.log("见 bot8-g2 --trace-j3 模式");
