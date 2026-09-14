import { statSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import {
	type ExtensionAPI,
	isToolCallEventType,
} from "@earendil-works/pi-coding-agent";
import { largeReadReason, normalizeSearchInput } from "./core.ts";

interface ReadInput {
	path?: unknown;
	offset?: unknown;
	limit?: unknown;
}

/** Expand a leading "~" the same way a shell would; path.resolve alone would not. */
function resolveReadPath(cwd: string, inputPath: string): string {
	if (inputPath === "~") return homedir();
	if (inputPath.startsWith("~/")) return path.join(homedir(), inputPath.slice(2));
	return path.resolve(cwd, inputPath);
}

export default function contextGuard(pi: ExtensionAPI) {
	pi.on("tool_call", (event, ctx) => {
		if (event.toolName === "grep" || event.toolName === "ffgrep") {
			const input = event.input as Record<string, unknown>;
			Object.assign(input, normalizeSearchInput(input));
			return;
		}

		if (!isToolCallEventType("read", event)) return;

		const input = event.input as ReadInput;
		if (typeof input.path !== "string" || input.path === "") return;

		try {
			const filePath = resolveReadPath(ctx.cwd, input.path);
			const stat = statSync(filePath);
			if (!stat.isFile()) return;

			const reason = largeReadReason(input, stat.size);
			if (reason) return { block: true, reason };
		} catch {
			// Let the built-in read tool report its normal path/error result.
		}
	});
}
