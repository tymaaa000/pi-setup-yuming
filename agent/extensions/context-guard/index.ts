// Type-only import: Pi supplies the real module at runtime, and keeping it type-only
// lets the guard logic be imported directly by tests.
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { guardToolCall } from "./core.ts";

export default function contextGuard(pi: ExtensionAPI) {
  pi.on("tool_call", (event, ctx) => {
    return guardToolCall(
      event.toolName,
      event.input as Record<string, unknown>,
      ctx.cwd,
    );
  });
}
