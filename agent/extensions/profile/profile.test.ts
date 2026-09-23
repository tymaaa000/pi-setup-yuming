import assert from "node:assert/strict";
import { test } from "node:test";
import profileExtension from "./index.ts";

function harness() {
  const commands = new Map<string, { handler: Function }>();
  const events = new Map<string, Function>();
  const model = { provider: "openai-codex", id: "gpt-6-astra" };
  const statuses: Record<string, string | undefined> = {};
  const pi: any = {
    registerCommand: (name: string, options: { handler: Function }) => commands.set(name, options),
    on: (event: string, handler: Function) => events.set(event, handler),
    setModel: async (next: any) => { Object.assign(model, next); return true; },
    setThinkingLevel: (level: string) => { ctx.thinkingLevel = level; },
  };
  const ctx: any = {
    model,
    thinkingLevel: "medium",
    ui: { setStatus: (key: string, text?: string) => { statuses[key] = text; }, notify() {} },
    modelRegistry: { find: (provider: string, id: string) => ({ provider, id }) },
  };
  profileExtension(pi);
  return { commands, events, ctx, statuses };
}

test("profile: registers command and switches model/thinking", async () => {
  const h = harness();
  await h.commands.get("profile")!.handler("review", h.ctx);
  assert.equal(h.ctx.model.provider, "openai-codex");
  assert.equal(h.ctx.model.id, "gpt-6-astra");
  assert.equal(h.ctx.thinkingLevel, "high");
});

test("profile: unknown profile does not switch", async () => {
  const h = harness();
  await h.commands.get("profile")!.handler("unknown", h.ctx);
  assert.equal(h.ctx.thinkingLevel, "medium");
});

// The status line keeps only the profile name: model/thinking already come from pi's footer.
test("profile: status shows only the profile name after a switch", async () => {
  const h = harness();
  await h.commands.get("profile")!.handler("review", h.ctx);
  assert.equal(h.statuses.profile, "profile: review");
});

test("profile: session_start without an active profile clears the status", () => {
  const h = harness();
  h.statuses.profile = "stale";
  h.events.get("session_start")!({}, h.ctx);
  assert.equal(h.statuses.profile, undefined);
});
