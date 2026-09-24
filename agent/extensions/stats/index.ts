import path from "node:path";
import {
  type ExtensionAPI,
  type ExtensionCommandContext,
  type ExtensionContext,
  getAgentDir,
} from "@earendil-works/pi-coding-agent";
import {
  type ContextBudgetSnapshot,
  contentChars,
  readContextBudget,
  safeJsonChars,
  writeContextBudget,
} from "./context-budget.ts";
import {
  findSessionFiles,
  type StatsSnapshot,
  scanSessionFiles,
} from "./core.ts";
import { openStatsHtml } from "./html.ts";

const STATUS_ID = "stats";
const CONTEXT_BUDGET_FILE = path.join(
  getAgentDir(),
  "context-budget",
  "latest.json",
);

let contextBudget: ContextBudgetSnapshot = {
  generatedAt: new Date().toISOString(),
  toolResults: [],
};

function currentModel(ctx: ExtensionContext): {
  provider?: string;
  model?: string;
} {
  return {
    provider:
      typeof ctx?.model?.provider === "string" ? ctx.model.provider : undefined,
    model: typeof ctx?.model?.id === "string" ? ctx.model.id : undefined,
  };
}

function countVisibleSkills(prompt: unknown): number | undefined {
  if (typeof prompt !== "string") return undefined;
  return (prompt.match(/<skill>\s*<name>/g) ?? []).length;
}

function payloadStringField(payload: unknown, key: string): string | undefined {
  if (!payload || typeof payload !== "object") return undefined;
  const value = (payload as Record<string, unknown>)[key];
  return typeof value === "string" ? value : undefined;
}

function activeToolStats(
  pi: ExtensionAPI,
): Pick<ContextBudgetSnapshot, "activeToolCount" | "registeredToolCount"> {
  return {
    activeToolCount: pi.getActiveTools().length,
    registeredToolCount: pi.getAllTools().length,
  };
}

function sessionToolStats(
  ctx: ExtensionContext,
): Pick<
  ContextBudgetSnapshot,
  "sessionEntryCount" | "sessionToolResultChars" | "sessionToolResults"
> {
  const entries = ctx?.sessionManager?.getEntries?.() ?? [];
  const byTool = new Map<string, { chars: number; isError: boolean }>();
  let totalChars = 0;

  for (const entry of entries) {
    const message = entry?.message;
    if (message?.role !== "toolResult") continue;
    const chars = contentChars(message.content);
    const toolName =
      typeof message.toolName === "string" ? message.toolName : "unknown";
    const previous = byTool.get(toolName) ?? { chars: 0, isError: false };
    previous.chars += chars;
    previous.isError ||= Boolean(message.isError);
    byTool.set(toolName, previous);
    totalChars += chars;
  }

  return {
    sessionEntryCount: entries.length,
    sessionToolResultChars: totalChars,
    sessionToolResults: [...byTool.entries()]
      .map(([toolName, value]) => ({ toolName, ...value }))
      .sort((left, right) => right.chars - left.chars)
      .slice(0, 64),
  };
}

function persistContextBudget(): void {
  try {
    writeContextBudget(CONTEXT_BUDGET_FILE, contextBudget);
  } catch {
    // Context accounting must never break an agent turn.
  }
}

function defaultSessionDir(cwd: string, agentDir: string): string {
  const resolvedCwd = path.resolve(cwd);
  const safePath = `--${resolvedCwd.replace(/^[/\\]/, "").replace(/[/\\:]/g, "-")}--`;
  return path.join(path.resolve(agentDir), "sessions", safePath);
}

function sessionRoot(ctx: ExtensionCommandContext): string {
  const agentDir = getAgentDir();
  const defaultRoot = path.resolve(agentDir, "sessions");
  const currentSessionDir = path.resolve(ctx.sessionManager.getSessionDir());
  const defaultProjectDir = path.resolve(defaultSessionDir(ctx.cwd, agentDir));

  // The default manager points at one cwd-specific directory. The stats view
  // should include every cwd under the shared sessions root instead.
  return currentSessionDir === defaultProjectDir
    ? defaultRoot
    : currentSessionDir;
}

async function collectStats(
  ctx: ExtensionCommandContext,
): Promise<StatsSnapshot> {
  const files = await findSessionFiles(sessionRoot(ctx));
  ctx.ui.setStatus(
    STATUS_ID,
    files.length === 0
      ? "stats: no sessions"
      : `stats: scanning 0/${files.length}`,
  );

  try {
    return await scanSessionFiles(files, (completed, total) => {
      ctx.ui.setStatus(STATUS_ID, `stats: scanning ${completed}/${total}`);
    });
  } finally {
    ctx.ui.setStatus(STATUS_ID, undefined);
  }
}

export default function (pi: ExtensionAPI) {
  pi.on("agent_start", (_event, ctx) => {
    const model = currentModel(ctx);
    contextBudget = {
      generatedAt: new Date().toISOString(),
      cwd: ctx.cwd,
      mode: ctx.mode,
      ...model,
      toolResultChars: 0,
      toolResults: [],
      ...activeToolStats(pi),
      ...sessionToolStats(ctx),
    };
    persistContextBudget();
  });

  pi.on("before_agent_start", (event, ctx) => {
    const options = event.systemPromptOptions ?? {};
    const model = currentModel(ctx);
    const toolGuidelines = options.promptGuidelines;
    contextBudget = {
      ...contextBudget,
      generatedAt: new Date().toISOString(),
      cwd: event.cwd ?? ctx.cwd,
      mode: ctx.mode,
      ...model,
      systemPromptChars:
        typeof event.systemPrompt === "string" ? event.systemPrompt.length : 0,
      contextFileCount: Array.isArray(options.contextFiles)
        ? options.contextFiles.length
        : 0,
      visibleSkillCount: Array.isArray(options.skills)
        ? options.skills.length
        : 0,
      toolGuidelineChars: safeJsonChars(toolGuidelines),
      ...activeToolStats(pi),
    };
    persistContextBudget();
  });

  pi.on("tool_result", (event) => {
    const chars = contentChars(event.content);
    const previous = contextBudget.toolResultChars ?? 0;
    const results = contextBudget.toolResults ?? [];
    contextBudget = {
      ...contextBudget,
      generatedAt: new Date().toISOString(),
      toolResultChars: previous + chars,
      toolResults: [
        ...results,
        {
          toolName: event.toolName,
          chars,
          isError: Boolean(event.isError),
        },
      ].slice(-64),
    };
  });

  pi.on("before_provider_request", (event, ctx) => {
    const model = currentModel(ctx);
    contextBudget = {
      ...contextBudget,
      generatedAt: new Date().toISOString(),
      ...model,
      providerPayloadChars: safeJsonChars(event.payload),
      systemPromptChars:
        payloadStringField(event.payload, "instructions")?.length ??
        contextBudget.systemPromptChars,
      visibleSkillCount: countVisibleSkills(
        payloadStringField(event.payload, "instructions"),
      ),
      ...activeToolStats(pi),
      ...sessionToolStats(ctx),
    };
    persistContextBudget();
  });

  pi.on("agent_end", () => {
    contextBudget = {
      ...contextBudget,
      generatedAt: new Date().toISOString(),
    };
    persistContextBudget();
  });

  pi.registerCommand("context-budget", {
    description: "Show the latest Context budget and tool-output statistics",
    handler: async (_args, ctx) => {
      const snapshot = readContextBudget(CONTEXT_BUDGET_FILE);
      if (!snapshot) {
        ctx.ui.notify("No Context observation data yet", "warning");
        return;
      }

      const largest = [...(snapshot.toolResults ?? [])]
        .sort((a, b) => b.chars - a.chars)
        .slice(0, 5)
        .map((item) => `${item.toolName}:${item.chars}`)
        .join(", ");
      const sessionLargest = [...(snapshot.sessionToolResults ?? [])]
        .slice(0, 5)
        .map((item) => `${item.toolName}:${item.chars}`)
        .join(", ");
      const lines = [
        `system=${snapshot.systemPromptChars ?? 0}`,
        `payload=${snapshot.providerPayloadChars ?? 0}`,
        `turnToolResults=${snapshot.toolResultChars ?? 0}`,
        `sessionToolResults=${snapshot.sessionToolResultChars ?? 0}`,
        `tools=${snapshot.activeToolCount ?? 0}/${snapshot.registeredToolCount ?? 0}`,
        `skills=${snapshot.visibleSkillCount ?? 0}`,
        `largest=${largest || "none"}`,
        `sessionLargest=${sessionLargest || "none"}`,
      ];
      ctx.ui.notify(lines.join(" · "), "info");
    },
  });

  pi.registerCommand("stats", {
    description: "Show token totals and cost aggregated by date and model",
    handler: async (_args, ctx) => {
      if (!ctx.hasUI) {
        ctx.ui.notify("stats requires an interactive terminal", "warning");
        return;
      }

      let snapshot: StatsSnapshot;
      try {
        snapshot = await collectStats(ctx);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        ctx.ui.notify(`Stats failed: ${message}`, "error");
        return;
      }

      try {
        const filePath = await openStatsHtml(snapshot);
        ctx.ui.notify(`Stats snapshot opened: ${filePath}`, "info");
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        ctx.ui.notify(`Failed to open stats snapshot: ${message}`, "error");
      }
    },
  });
}
