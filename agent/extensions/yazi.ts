/**
 * Yazi Extension
 *
 * Opens yazi in the current directory via the /fm command.
 * Suspends pi's TUI while yazi runs, then restores on exit.
 * On Windows: auto-feeds Enter to skip yazi's terminal-response timeout prompt.
 */

import { spawn } from "node:child_process";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const isWindows = process.platform === "win32";

function findYazi(): string {
  const { spawnSync } = require("node:child_process");
  const which = spawnSync("cmd", ["/c", "where", "yazi"], { encoding: "utf-8" });
  if (which.stdout?.trim()) {
    return which.stdout.split("\r\n")[0].trim();
  }
  const home = process.env.USERPROFILE || "C:\\Users\\14681";
  return `${home}\\bin\\yazi.exe`;
}

export default function (pi: ExtensionAPI) {
  pi.registerCommand("fm", {
    description: "Open yazi in the current directory",
    handler: async (_args, ctx) => {
      if (!ctx.hasUI) {
        ctx.ui.notify?.("yazi requires an interactive terminal", "warning");
        return;
      }

      const yaziCmd = isWindows ? findYazi() : "yazi";

      const exitCode = await ctx.ui.custom<number | null>(
        (tui, _theme, _kb, done) => {
          tui.stop();

          const child = spawn(yaziCmd, [], {
            stdio: isWindows ? ["pipe", "inherit", "ignore"] : "inherit",
            cwd: ctx.cwd,
            env: process.env,
          });

          if (isWindows && child.stdin) {
            // Auto-skip yazi's "press any key" after terminal response timeout
            child.stdin.write("\n");
            child.stdin.end();
          }

          child.on("close", (code) => {
            tui.start();
            tui.requestRender(true);
            done(code);
          });

          return { render: () => [], invalidate: () => {} };
        },
      );

      if (exitCode === 0) {
        ctx.ui.notify("yazi exited successfully", "info");
      } else {
        ctx.ui.notify(`yazi exited with code ${exitCode}`, "warning");
      }
    },
  });
}
