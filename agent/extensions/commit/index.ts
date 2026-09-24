/**
 * Commit Extension
 *
 * /commit — interactive commit flow:
 *   1. Collect staged files (git diff --cached --name-status) and confirm with the user.
 *   2. Pick the generation model — searchable fuzzy picker in TUI (pi's own
 *      ui api: ctx.ui.custom + pi-tui fuzzyFilter), plain select elsewhere.
 *      The last used model (extensions/commit/last_model.json, gitignored)
 *      leads the list, else the current model. Every pick updates
 *      last_model.json.
 *   3. Generate a Conventional Commits message with a `pi -p` child process:
 *      rules are embedded in core.ts (formerly agents/commit.md, deleted),
 *      the staged diff is piped on stdin, and the child runs tool-less.
 *   4. Confirm the generated message (submit / regenerate / cancel), then run
 *      `git commit -m` directly.
 *
 * Structure: index.ts (command wiring + flow) / ui.ts (dialogs) / core.ts
 * (pi-free git + generation logic, unit-tested).
 */

import type {
  ExtensionAPI,
  ExtensionCommandContext,
} from "@earendil-works/pi-coding-agent";
import { notify } from "../notify/index.ts";
import {
  buildTask,
  firstLineOf,
  getStagedDiff,
  getStagedFiles,
  gitCommit,
  readLastModel,
  runPiGenerate,
  type StagedFile,
  stripCodeFences,
  writeLastModel,
} from "./core.ts";
import { chooseAction, chooseModel } from "./ui.ts";

/** `provider/model-id` of the current session model, if any. */
function currentModelLabel(ctx: ExtensionCommandContext): string | undefined {
  const model = ctx.model;
  return model ? `${model.provider}/${model.id}` : undefined;
}

export default function (pi: ExtensionAPI) {
  let quitAfterStartupCommit = false;

  pi.registerFlag("commit", {
    description: "Run the commit flow at startup",
    type: "boolean",
    default: false,
  });

  pi.on("session_start", (event) => {
    if (event.reason !== "startup" || pi.getFlag("commit") !== true) return;

    quitAfterStartupCommit = true;
    pi.sendUserMessage("/commit", { expandPromptTemplates: true });
  });

  pi.registerCommand("commit", {
    description:
      "Review staged files, generate a commit message, and commit on confirmation",
    handler: async (_args, ctx) => {
      const shouldQuitAfterCommit = quitAfterStartupCommit;
      quitAfterStartupCommit = false;

      if (!ctx.hasUI) {
        ctx.ui.notify("commit requires an interactive terminal", "warning");
        return;
      }

      // 1. Staged files.
      let files: StagedFile[];
      try {
        files = getStagedFiles(ctx.cwd);
      } catch (err) {
        ctx.ui.notify(
          `Failed to read staged files: ${firstLineOf(err)}`,
          "error",
        );
        return;
      }
      if (files.length === 0) {
        ctx.ui.notify("No staged files", "info");
        return;
      }

      // 2. Confirm the file list.
      const listText = files
        .map((file) => `  ${file.status.padEnd(4)} ${file.path}`)
        .join("\n");
      if (
        !(await ctx.ui.confirm(
          `Commit ${files.length} staged file(s)?`,
          listText,
        ))
      ) {
        ctx.ui.notify("Cancelled; nothing committed", "info");
        return;
      }

      // 3. Pick the generation model; the last pick leads, else the current model.
      const lastModel = readLastModel();
      const first = lastModel ?? currentModelLabel(ctx);
      const model = await chooseModel(ctx, first, lastModel !== undefined);
      if (!model) {
        ctx.ui.notify("Cancelled; nothing committed", "info");
        return;
      }
      writeLastModel(model);

      // 4. Generate (regenerate loops), confirm, then commit.
      for (;;) {
        ctx.ui.setStatus("commit", "Generating commit message…");
        let message: string;
        try {
          const result = await runPiGenerate({
            model,
            task: buildTask(files, getStagedDiff(ctx.cwd)),
            cwd: ctx.cwd,
          });
          if (result.error) throw new Error(result.error);
          message = stripCodeFences(result.message);
          if (message.length === 0)
            throw new Error("Generation returned an empty message");
        } catch (err) {
          ctx.ui.setStatus("commit", undefined);
          ctx.ui.notify(`Generation failed: ${firstLineOf(err)}`, "error");
          return;
        }
        ctx.ui.setStatus("commit", undefined);
        notify("pi", "commit message done!");

        const action = await chooseAction(ctx, message);
        if (action === undefined || action === "Cancel") {
          ctx.ui.notify("Cancelled; nothing committed", "info");
          return;
        }
        if (action === "Regenerate") continue;

        // 5. Commit directly — message already approved.
        try {
          ctx.ui.notify(`Committed: ${gitCommit(message, ctx.cwd)}`, "info");
          if (shouldQuitAfterCommit) ctx.shutdown();
        } catch (err) {
          ctx.ui.notify(`Commit failed: ${firstLineOf(err)}`, "error");
        }
        return;
      }
    },
  });
}
