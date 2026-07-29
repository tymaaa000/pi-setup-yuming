/**
 * Agent Footer — show git branch below the editor.
 * Keeps the default Pi footer intact.
 */

import { execSync } from "node:child_process";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  pi.on("session_start", (_event, ctx) => {
    let cachedBranch: string | null = null;
    let lastCheck = 0;

    function getBranch(): string | null {
      const now = Date.now();
      if (now - lastCheck < 30000) return cachedBranch;
      lastCheck = now;
      try {
        cachedBranch = execSync("git branch --show-current", {
          cwd: ctx.cwd,
          encoding: "utf8",
          timeout: 2000,
          stdio: ["ignore", "pipe", "pipe"],
        }).trim() || null;
      } catch {
        cachedBranch = null;
      }
      return cachedBranch;
    }

    ctx.ui.setWidget(
      "agent-footer",
      (_tui, theme) => ({
        render: () => {
          const branch = getBranch();
          if (!branch) return [];
          return [theme.fg("dim", "⎇ ") + theme.fg("muted", branch)];
        },
        invalidate: () => {},
      }),
      { placement: "belowEditor" }
    );
  });
}
