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

function setStatus(ctx: ExtensionContext, name: string): void {
  const model = ctx.model;
  const modelName = model ? `${model.provider}/${model.id}` : "unknown";
  ctx.ui.setStatus("profile", `${name} · ${modelName} · ${ctx.thinkingLevel}`);
}

export default function profileExtension(pi: ExtensionAPI): void {
  let active: ProfileName | undefined;

  pi.registerCommand("profile", {
    description: "Switch model and thinking profile",
    handler: async (args, ctx) => {
      const name = args.trim().toLowerCase() as ProfileName;
      if (!name || !(name in PROFILES)) {
        ctx.ui.notify(`用法：/profile <name>\n\n${description()}`, "info");
        return;
      }

      const profile = PROFILES[name];
      const model = ctx.modelRegistry.find(profile.provider, profile.model);
      if (!model) {
        ctx.ui.notify(`找不到模型：${profile.provider}/${profile.model}`, "error");
        return;
      }

      const success = await pi.setModel(model);
      if (!success) {
        ctx.ui.notify(`模型不可用或未配置认证：${profile.provider}/${profile.model}`, "error");
        return;
      }
      pi.setThinkingLevel(profile.thinking);
      active = name;
      setStatus(ctx, name);
      ctx.ui.notify(`已切换到 ${profile.label}：${profile.provider}/${profile.model} · ${profile.thinking}`, "info");
    },
  });

  pi.on("session_start", (_event, ctx) => {
    setStatus(ctx, active ?? "session");
  });
}

export { PROFILES };
