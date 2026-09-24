import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import contextGuard from "./index.ts";

/** Capture the handlers the extension registers, without a real Pi runtime. */
function handlers(): Record<string, (event: unknown, ctx: unknown) => unknown> {
  const registered: Record<string, (event: unknown, ctx: unknown) => unknown> =
    {};
  contextGuard({
    on: (name: string, fn: (event: unknown, ctx: unknown) => unknown) => {
      registered[name] = fn;
    },
  } as never);
  return registered;
}

function workspace(): { dir: string; big: string; small: string } {
  const dir = mkdtempSync(path.join(tmpdir(), "context-guard-"));
  const big = path.join(dir, "big.txt");
  const small = path.join(dir, "small.txt");
  writeFileSync(big, "x".repeat(64 * 1024));
  writeFileSync(small, "x".repeat(1024));
  return { dir, big, small };
}

test("grep limits are clamped in place (pi applies tool_call mutations)", () => {
  const call = handlers().tool_call;
  assert.equal(typeof call, "function");
  const input: Record<string, unknown> = {
    pattern: "x",
    limit: 500,
    context: 10,
  };
  const result = call({ toolName: "grep", input }, { cwd: process.cwd() });
  assert.equal(result, undefined);
  assert.equal(input.limit, 20);
  assert.equal(input.context, 3);
});

test("ffgrep is clamped the same way", () => {
  const input: Record<string, unknown> = { query: "x", limit: 999 };
  handlers().tool_call({ toolName: "ffgrep", input }, { cwd: process.cwd() });
  assert.equal(input.limit, 20);
});

test("an unbounded read of a large file is blocked", () => {
  const { dir, big } = workspace();
  try {
    const result = handlers().tool_call(
      { toolName: "read", input: { path: big } },
      { cwd: dir },
    ) as { block?: boolean; reason?: string };
    assert.equal(result?.block, true);
    assert.match(result?.reason ?? "", /Direct read blocked/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a bounded read of the same file is allowed", () => {
  const { dir, big } = workspace();
  try {
    const result = handlers().tool_call(
      { toolName: "read", input: { path: big, offset: 1, limit: 200 } },
      { cwd: dir },
    );
    assert.equal(result, undefined);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a large file under $HOME is still checked (leading ~ is expanded)", () => {
  const home = homedir();
  const probe = path.join(home, ".context-guard-probe-large.txt");
  writeFileSync(probe, "x".repeat(64 * 1024));
  try {
    const result = handlers().tool_call(
      { toolName: "read", input: { path: "~/.context-guard-probe-large.txt" } },
      { cwd: tmpdir() },
    ) as { block?: boolean } | undefined;
    assert.equal(result?.block, true);
  } finally {
    rmSync(probe, { force: true });
  }
});

test("small files and directories are left alone", () => {
  const { dir, small } = workspace();
  try {
    assert.equal(
      handlers().tool_call(
        { toolName: "read", input: { path: small } },
        { cwd: dir },
      ),
      undefined,
    );
    assert.equal(
      handlers().tool_call(
        { toolName: "read", input: { path: dir } },
        { cwd: dir },
      ),
      undefined,
    );
    assert.equal(
      handlers().tool_call(
        { toolName: "read", input: { path: "does-not-exist" } },
        { cwd: dir },
      ),
      undefined,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("other tools are ignored", () => {
  const input: Record<string, unknown> = { command: "ls" };
  assert.equal(
    handlers().tool_call({ toolName: "bash", input }, { cwd: process.cwd() }),
    undefined,
  );
  assert.deepEqual(input, { command: "ls" });
});
