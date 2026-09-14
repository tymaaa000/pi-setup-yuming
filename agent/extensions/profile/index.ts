/**
 * Switch the current session between explicit model/thinking profiles.
 * Usage: /profile [fast|default|research|review|driver]
 */
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

const PROFILES = {
  fast: {
    label: "Fast",
    provider: "deepseek",
    model: "deepseek-flash",
    thinking: "low",
  },
  default: {
    label: "Default",
    provider: "openai-codex",
    model: "gpt-5.6-luna",
    thinking: "medium",
  },
  research: {
    label: "Research",
    provider: "openai-codex",
    model: "gpt-5.6-luna",
    thinking: "medium",
  },
  review: {
    label: "Review",
    provider: "openai-codex",
    model: "gpt-5.6-luna",
    thinking: "high",
  },
  driver: {
    label: "Driver",
    provider: "openai-codex",
    model: "gpt-5.6-luna",
    thinking: "high",
  },
} as const;

type ProfileName = keyof typeof PROFILES;

function description(): string {
  return Object.entries(PROFILES)
    .map(([name, profile]) => `${name}: ${profile.label} (${profile.model}, ${profile.thinking})`)
    .join("\n");
}

/**
 * Show only the profile name. The model and thinking level are already shown by
 * pi's built-in footer (`(provider) model • thinking`), and repeating them would
 * add another line. Without an explicit profile switch nothing is written, so the
 * status never duplicates the footer.
 */
function setStatus(ctx: ExtensionContext, name: ProfileName | undefined): void {
  ctx.ui.setStatus("profile", name ? `profile: ${name}` : undefined);
}

export default function profileExtension(pi: ExtensionAPI): void {
  let active: ProfileName | undefined;

  pi.registerCommand("profile", {
    description: "Switch model and thinking profile",
    handler: async (args, ctx) => {
      const name = args.trim().toLowerCase() as ProfileName;
      if (!name || !(name in PROFILES)) {
        ctx.ui.notify(`Usage: /profile <name>\n\n${description()}`, "info");
        return;
      }

      const profile = PROFILES[name];
      const model = ctx.modelRegistry.find(profile.provider, profile.model);
      if (!model) {
        ctx.ui.notify(`Model not found: ${profile.provider}/${profile.model}`, "error");
        return;
      }

      const success = await pi.setModel(model);
      if (!success) {
        ctx.ui.notify(`Model unavailable or credentials missing: ${profile.provider}/${profile.model}`, "error");
        return;
      }
      pi.setThinkingLevel(profile.thinking);
      active = name;
      setStatus(ctx, name);

      ctx.ui.notify(`Switched to ${profile.label}: ${profile.provider}/${profile.model} · ${profile.thinking}`, "info");
    },
  });

  pi.on("session_start", (_event, ctx) => {
    setStatus(ctx, active);
  });
}

export { PROFILES };
