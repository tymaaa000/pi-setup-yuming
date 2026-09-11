import assert from "node:assert/strict";
import { test } from "node:test";
import profileExtension from "./index.ts";

function harness() {
  const commands = new Map<string, { handler: Function }>();
  const events = new Map<string, Function>();
  const model = { provider: "openai-codex", id: "gpt-5.6-luna" };
  const pi: any = {
    registerCommand: (name: string, options: { handler: Function }) => commands.set(name, options),
    on: (event: string, handler: Function) => events.set(event, handler),
    setModel: async (next: any) => { Object.assign(model, next); return true; },
    setThinkingLevel: (level: string) => { ctx.thinkingLevel = level; },
  };
  const ctx: any = {
    model,
    thinkingLevel: "medium",
    ui: { setStatus() {}, notify() {} },
    modelRegistry: { find: (provider: string, id: string) => ({ provider, id }) },
  };
  profileExtension(pi);
  return { commands, events, ctx };
}

test("profile: registers command and switches model/thinking", async () => {
  const h = harness();
  await h.commands.get("profile")!.handler("review", h.ctx);
  assert.equal(h.ctx.model.provider, "openai-codex");
  assert.equal(h.ctx.model.id, "gpt-5.6-luna");
  assert.equal(h.ctx.thinkingLevel, "high");
});

test("profile: unknown profile does not switch", async () => {
  const h = harness();
  await h.commands.get("profile")!.handler("unknown", h.ctx);
  assert.equal(h.ctx.thinkingLevel, "medium");
});
