/**
 * Terminal Extension
 *
 * Suspends the pi TUI to run a terminal app (nvim, lazygit, yazi), then
 * restores it when the app exits.
 *
 * Commands:
 *   /vim [file] - open nvim (optionally with a file path)
 *   /lg         - open lazygit in the current directory
 *   /fm         - open yazi in the current directory
 */

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { delimiter, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type {
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";

export interface RunTerminalAppOptions {
  /** Arguments passed directly to the executable. */
  args?: readonly string[];
  /** Clear the terminal after suspending pi and before starting the app. */
  clearScreen?: boolean;
}

/** Structured outcome; callers own user-facing notification policy. */
export type TerminalAppResult =
  | { kind: "unavailable" }
  | { kind: "not-found"; error: Error }
  | { kind: "launch-error"; error: Error }
  | {
      kind: "exited";
      status: number | null;
      signal: NodeJS.Signals | null;
    };

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

function isNotFound(error: Error): boolean {
  return (error as NodeJS.ErrnoException).code === "ENOENT";
}

/**
 * Locate pi's managed binary directory (yazi/fd/rg live there).
 *
 * This file sits at `<agentDir>/extensions/terminal.ts`, so `<agentDir>/bin` is
 * its sibling; `PI_CODING_AGENT_DIR` is only a fallback for relocated copies.
 */
function agentBinDir(): string | undefined {
  const candidates: string[] = [];
  try {
    candidates.push(
      join(dirname(dirname(fileURLToPath(import.meta.url))), "bin"),
    );
  } catch {
    // import.meta.url unavailable - fall through to the env override below.
  }
  const agentDir = process.env.PI_CODING_AGENT_DIR;
  if (agentDir) candidates.push(join(agentDir, "bin"));
  return candidates.find((dir) => existsSync(dir));
}

/**
 * pi prepends its managed bin dir to child PATH, but only for the built-in
 * shell tools (`getShellEnv()` in `dist/utils/shell.js`); extensions that spawn
 * from the UI get pi's raw PATH. Without this, `/fm`, `/vim` and `/lg` resolve
 * whatever happens to be on the user's PATH instead of pi's own copies.
 */
function terminalAppEnv(): NodeJS.ProcessEnv {
  const binDir = agentBinDir();
  if (!binDir) return process.env;

  const pathKey =
    Object.keys(process.env).find((key) => key.toLowerCase() === "path") ??
    "PATH";
  const current = process.env[pathKey] ?? "";
  if (current.split(delimiter).includes(binDir)) return process.env;
  return {
    ...process.env,
    [pathKey]: [binDir, current].filter(Boolean).join(delimiter),
  };
}

/**
 * Suspend pi's TUI, run an interactive terminal app with inherited stdio,
 * and always restore the TUI afterward. This is the shared launch primitive
 * for extensions that need to hand full terminal control to another process.
 */
export async function runTerminalApp(
  ctx: ExtensionContext,
  command: string,
  options: RunTerminalAppOptions = {},
): Promise<TerminalAppResult> {
  if (ctx.mode !== "tui") return { kind: "unavailable" };

  try {
    return await ctx.ui.custom<TerminalAppResult>(
      (tui, _theme, _keybindings, done) => {
        // ⚠️ Do NOT use spawnSync here. On Windows, a synchronous
        // child_process call keeps Node/libuv's console input read queued
        // after the parent pauses stdin, racing the child for the console
        // input buffer. The victim is any terminal-query reply (DA1/DSR)
        // the app under us reads on startup - yazi, for example, then
        // times out with "Terminal response timeout" and eats keystrokes
        // while servicing the probe. pi's own external editor path
        // (dist/modes/interactive/external-editor.js) avoids spawnSync for
        // exactly this reason; keep this asynchronous too.
        let settled = false;
        const finish = (result: TerminalAppResult) => {
          if (settled) return;
          settled = true;
          try {
            tui.start();
            tui.requestRender(true);
          } catch (error) {
            done({ kind: "launch-error", error: asError(error) });
            return;
          }
          done(result);
        };

        tui.stop();
        if (options.clearScreen) process.stdout.write("\x1b[2J\x1b[H");

        // Drop any buffered stdin (e.g. the Enter that invoked the
        // command) so it is not re-interpreted by the child.
        process.stdin.pause();

        try {
          const child = spawn(command, [...(options.args ?? [])], {
            stdio: "inherit",
            cwd: ctx.cwd,
            env: terminalAppEnv(),
          });

          child.on("error", (error) => {
            const launchError = asError(error);
            finish({
              kind: isNotFound(launchError) ? "not-found" : "launch-error",
              error: launchError,
            });
          });
          child.on("close", (status, signal) => {
            finish({ kind: "exited", status, signal });
          });
        } catch (error) {
          const launchError = asError(error);
          finish({
            kind: isNotFound(launchError) ? "not-found" : "launch-error",
            error: launchError,
          });
        }

        return { render: () => [], invalidate: () => {} };
      },
    );
  } catch (error) {
    return { kind: "launch-error", error: asError(error) };
  }
}

async function runSuspended(
  ctx: ExtensionContext,
  command: string,
  args: readonly string[] = [],
): Promise<void> {
  const result = await runTerminalApp(ctx, command, { args });

  switch (result.kind) {
    case "unavailable":
      ctx.ui.notify(`${command} requires an interactive terminal`, "warning");
      break;
    case "not-found":
      ctx.ui.notify(
        `${command} not found - please install it and ensure it's on PATH`,
        "error",
      );
      break;
    case "launch-error":
      ctx.ui.notify(
        `Failed to launch ${command}: ${result.error.message}`,
        "error",
      );
      break;
    case "exited":
      if (result.status === 0) {
        ctx.ui.notify(`${command} exited successfully`, "info");
      } else if (result.signal) {
        ctx.ui.notify(
          `${command} exited due to signal ${result.signal}`,
          "warning",
        );
      } else {
        ctx.ui.notify(
          `${command} exited with code ${result.status ?? "unknown"}`,
          "warning",
        );
      }
      break;
  }
}

export default function (pi: ExtensionAPI) {
  pi.registerCommand("vim", {
    description: "Open nvim (optionally with a file path)",
    handler: async (args, ctx) => {
      // Strip leading @ (leftover from file completion trigger) and trim
      const file = args?.trim().replace(/^@+/, "") || "";
      await runSuspended(ctx, "nvim", file ? [file] : []);
    },
  });

  pi.registerCommand("lg", {
    description: "Open lazygit in the current directory",
    handler: async (_args, ctx) => {
      await runSuspended(ctx, "lazygit");
    },
  });

  pi.registerCommand("fm", {
    description: "Open yazi in the current directory",
    handler: async (_args, ctx) => {
      await runSuspended(ctx, "yazi");
    },
  });
}
