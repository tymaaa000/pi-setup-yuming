import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import {
  contentChars,
  readContextBudget,
  safeJsonChars,
  writeContextBudget,
} from "./context-budget.ts";

test("contentChars counts text parts without retaining their content", () => {
  assert.equal(contentChars("abc"), 3);
  assert.equal(
    contentChars([
      { type: "text", text: "abc" },
      { type: "image", data: "x" },
    ]),
    3 + JSON.stringify({ type: "image", data: "x" }).length,
  );
});

test("safeJsonChars handles unserializable values", () => {
  const circular: Record<string, unknown> = {};
  circular.self = circular;
  assert.equal(safeJsonChars(circular), 0);
});

test("context budget snapshots are atomically readable", () => {
  const directory = mkdtempSync(
    path.join(os.tmpdir(), "pi-context-budget-test-"),
  );
  const filePath = path.join(directory, "latest.json");
  const snapshot = {
    generatedAt: "2026-09-14T00:00:00.000Z",
    systemPromptChars: 123,
    providerPayloadChars: 456,
    toolResultChars: 789,
    toolResults: [],
  };

  try {
    writeContextBudget(filePath, snapshot);
    assert.deepEqual(readContextBudget(filePath), snapshot);
    assert.deepEqual(JSON.parse(readFileSync(filePath, "utf8")), snapshot);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
