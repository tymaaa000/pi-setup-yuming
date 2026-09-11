/**
 * Guard high-impact shell commands.
 * Interactive sessions get a confirmation; non-interactive sessions are blocked.
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const DANGEROUS_PATTERNS: Array<[RegExp, string]> = [
  [/\brm\s+(?:-[^-\s]*f[^\s]*\s+)?(?:\/|\/\*|~\/?\*?)(?:\s|$)/i, "recursive deletion"],
  [/\bgit\s+(?:reset\s+--hard|clean\s+-[a-z]*f)/i, "destructive git cleanup"],
  [/\bgit\s+push\b[^\n]*\s--force(?:-with-lease)?\b/i, "force push"],
  [/\b(?:sudo|doas)\b/i, "privileged command"],
  [/\b(?:mkfs|fdisk|parted)\b/i, "disk operation"],
  [/\bdd\s+if=/i, "raw disk write"],
  [/\bcurl\b[^\n|]*\|\s*(?:ba)?sh\b/i, "download and execute"],
];

function matchDanger(command: string): string | undefined {
  return DANGEROUS_PATTERNS.find(([pattern]) => pattern.test(command))?.[1];
}

export default function safetyExtension(pi: ExtensionAPI) {
  pi.on("tool_call", async (event, ctx) => {
    if (event.toolName !== "bash" && event.toolName !== "powershell") return;
    const input = event.input as { command?: unknown };
    if (typeof input.command !== "string") return;

    const reason = matchDanger(input.command);
    if (!reason) return;

    if (!ctx.hasUI) {
      return { block: true, reason: `Blocked ${reason} in non-interactive mode` };
    }

    const approved = await ctx.ui.confirm(
      `高风险命令：${reason}`,
      input.command,
    );
    if (!approved) return { block: true, reason: "Blocked by user" };
  });
}

export { matchDanger };
