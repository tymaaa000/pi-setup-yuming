/**
 * auto-name-session — prompt for a session name when the user runs /new.
 *
 * Behavior:
 *   - Prompts only on session_start with reason "new" (an explicit /new command).
 *   - No prompt on startup or when resuming a session.
 *   - An empty answer becomes the default name "session-YYYY-MM-DD-HH-MM-SS".
 *   - Sets the name through pi.setSessionName().
 *   - Interactive (TUI) only; RPC, JSON, and print modes are skipped.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  pi.on("session_start", async (event, ctx) => {
    // Interactive mode only.
    if (ctx.mode !== "tui") return;

    // Only an explicit /new command.
    if (event.reason !== "new") return;

    // Skip when the session already has a name.
    const existingName = pi.getSessionName();
    if (existingName) return;

    const now = new Date();
    const stamp = [
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, "0"),
      String(now.getDate()).padStart(2, "0"),
      String(now.getHours()).padStart(2, "0"),
      String(now.getMinutes()).padStart(2, "0"),
      String(now.getSeconds()).padStart(2, "0"),
    ].join("-");
    const defaultName = `session-${stamp}`;

    const userInput = await ctx.ui.input("Name this session:", defaultName);

    // Cancelling or submitting an empty value keeps the default name.
    const sessionName = userInput?.trim() || defaultName;

    pi.setSessionName(sessionName);
    ctx.ui.notify(`Session named: ${sessionName}`, "info");
  });
}
