/**
 * Control whether tool output starts expanded.
 *
 * Pi collapses tool output by default. This extension keeps that default and expands only
 * when PI_EXPAND_TOOLS=1 is set. The thinking block is controlled separately by
 * hideThinkingBlock in settings.json.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  pi.on("session_start", (_event, ctx) => {
    // Keep tool output collapsed by default to limit TUI noise from long outputs.
    // Set PI_EXPAND_TOOLS=1 and restart pi for the previous always-expanded behavior.
    if (process.env.PI_EXPAND_TOOLS === "1") {
      ctx.ui.setToolsExpanded(true);
    }
  });
}
