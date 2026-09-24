/**
 * /context-preview — open neovim to preview the most recent provider request payload.
 *
 * Behavior:
 *   - /context-preview         — open nvim -R on a temp .json file with cached payload (or empty)
 *   - /context-preview start   — start caching payloads from before_provider_request
 *   - /context-preview stop    — stop caching (keeps last cached payload viewable)
 *   - /context-preview status  — show enabled/disabled state
 *   - /context-preview help    — show usage and subcommand meanings
 *
 * The payload is the raw HTTP request body object from before_provider_request.
 * Pure read-only preview: nothing is written back to the session. The temp file
 * is deleted when nvim exits.
 *
 * Usage: /context-preview [start|stop|status|help]  (no subcommand = preview)
 */

import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { runTerminalApp } from "./terminal.ts";

const NVIM_COMMAND = "nvim";
const NVIM_ARGS = ["-R"];

const HELP_TEXT = [
  "/context-preview [start|stop|status|help]",
  "",
  "  (no subcommand)  open the most recent provider request payload in nvim -R;",
  "                   empty when caching is off or no request has been sent yet",
  "  start            start caching before_provider_request payloads (off by default)",
  "  stop             stop caching; already cached content stays viewable",
  "  status           show whether caching is enabled",
  "  help             show this help",
  "",
  "The payload is the raw HTTP request body sent to the model API: model,",
  "messages, tools, temperature, and so on. Read-only preview; nothing is",
  "written back to the session and the temp file is deleted when nvim exits.",
].join("\n");

export default function (pi: ExtensionAPI) {
  let enabled = false;
  let lastPayload: unknown = null;

  pi.on("session_start", async (_event, _ctx) => {
    enabled = false;
    lastPayload = null;
  });

  pi.on("before_provider_request", (event, _ctx) => {
    if (enabled) {
      lastPayload = event.payload;
    }
  });

  pi.registerCommand("context-preview", {
    description:
      "Preview the provider request payload in neovim (read-only). Subcommands: start | stop | status | help",
    handler: async (args, ctx) => {
      if (ctx.mode !== "tui") {
        ctx.ui.notify(
          "/context-preview requires an interactive terminal",
          "error",
        );
        return;
      }

      const sub = args?.trim();

      if (sub === "start") {
        enabled = true;
        ctx.ui.notify("context-preview enabled", "info");
        return;
      }

      if (sub === "stop") {
        enabled = false;
        ctx.ui.notify("context-preview disabled (cached content kept)", "info");
        return;
      }

      if (sub === "status") {
        ctx.ui.notify(
          `context-preview: ${enabled ? "enabled" : "disabled"}`,
          "info",
        );
        return;
      }

      if (sub === "help") {
        ctx.ui.notify(HELP_TEXT, "info");
        return;
      }

      if (sub !== "") {
        // Unknown subcommand — show help instead of silently opening nvim.
        ctx.ui.notify(`Unknown argument "${sub}"; usage follows:`, "error");
        ctx.ui.notify(HELP_TEXT, "info");
        return;
      }

      // No subcommand — open nvim with cached payload (or empty content)
      const body =
        lastPayload != null ? JSON.stringify(lastPayload, null, 2) : "";

      const sessionId = ctx.sessionManager.getSessionId() ?? "session";
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      const dir = mkdtempSync(join(tmpdir(), "pi-context-preview-"));
      const file = join(dir, `pi-context-preview-${sessionId}-${stamp}.json`);
      writeFileSync(file, `${body}\n`, "utf8");

      try {
        const result = await runTerminalApp(ctx, NVIM_COMMAND, {
          args: [...NVIM_ARGS, file],
          clearScreen: true,
        });
        if (result.kind === "not-found") {
          ctx.ui.notify(
            "nvim not found; make sure it is installed and on PATH",
            "error",
          );
          return;
        }
        if (result.kind === "launch-error") {
          ctx.ui.notify("/context-preview failed to open nvim", "error");
          return;
        }
      } finally {
        // Best-effort cleanup of the temp file/dir.
        try {
          rmSync(dir, { recursive: true, force: true });
        } catch {
          /* ignore */
        }
      }
    },
  });
}
