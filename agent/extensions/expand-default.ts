/**
 * 默认展开工具输出和思考块
 *
 * pi 的工具输出默认是折叠的，这个扩展会让它在每次 session 启动时自动展开。
 * 思考块的显示/隐藏由 settings.json 中的 hideThinkingBlock 控制。
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  pi.on("session_start", (_event, ctx) => {
    // 默认展开工具输出（包括 bash、read、grep、搜索等所有工具的结果）
    ctx.ui.setToolsExpanded(true);
  });
}
