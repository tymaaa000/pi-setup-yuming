/**
 * 默认展开工具输出和思考块
 *
 * pi 的工具输出默认是折叠的，这个扩展会让它在每次 session 启动时自动展开。
 * 思考块的显示/隐藏由 settings.json 中的 hideThinkingBlock 控制。
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  pi.on("session_start", (_event, ctx) => {
    // 默认保持折叠，减少长工具输出造成的 TUI 噪音。
    // 需要旧行为时设置 PI_EXPAND_TOOLS=1 后重启 pi。
    if (process.env.PI_EXPAND_TOOLS === "1") {
      ctx.ui.setToolsExpanded(true);
    }
  });
}
