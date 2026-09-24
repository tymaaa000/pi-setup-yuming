import {
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

export interface ContextToolResultStat {
  toolName: string;
  chars: number;
  isError: boolean;
}

export interface ContextBudgetSnapshot {
  generatedAt: string;
  cwd?: string;
  mode?: string;
  provider?: string;
  model?: string;
  systemPromptChars?: number;
  providerPayloadChars?: number;
  contextFileCount?: number;
  visibleSkillCount?: number;
  activeToolCount?: number;
  registeredToolCount?: number;
  toolGuidelineChars?: number;
  toolResultChars?: number;
  toolResults?: ContextToolResultStat[];
  sessionEntryCount?: number;
  sessionToolResultChars?: number;
  sessionToolResults?: ContextToolResultStat[];
}

export function safeJsonChars(value: unknown): number {
  try {
    const serialized = JSON.stringify(value);
    return serialized ? serialized.length : 0;
  } catch {
    return 0;
  }
}

export function contentChars(content: unknown): number {
  if (typeof content === "string") return content.length;
  if (!Array.isArray(content)) return safeJsonChars(content);

  return content.reduce((total, item) => {
    if (typeof item === "string") return total + item.length;
    if (item && typeof item === "object" && "text" in item) {
      const text = (item as { text?: unknown }).text;
      return (
        total + (typeof text === "string" ? text.length : safeJsonChars(item))
      );
    }
    return total + safeJsonChars(item);
  }, 0);
}

export function writeContextBudget(
  filePath: string,
  snapshot: ContextBudgetSnapshot,
): void {
  mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  writeFileSync(
    temporaryPath,
    `${JSON.stringify(snapshot, null, 2)}\n`,
    "utf8",
  );
  try {
    renameSync(temporaryPath, filePath);
  } catch (error) {
    rmSync(temporaryPath, { force: true });
    throw error;
  }
}

export function readContextBudget(
  filePath: string,
): ContextBudgetSnapshot | undefined {
  try {
    const parsed: unknown = JSON.parse(readFileSync(filePath, "utf8"));
    if (!parsed || typeof parsed !== "object") return undefined;
    return parsed as ContextBudgetSnapshot;
  } catch {
    return undefined;
  }
}
